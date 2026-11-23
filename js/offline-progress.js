// Offline farming estimates combat throughput from real farming rounds. Rewards use
// the live reward resolver; no combat timers or scene rendering run in this path.
const OFFLINE_RULES = BALANCE.offlineProgress;
let offlineFarmSuspended = false;
let offlineFarmTransition = Promise.resolve();
let offlineFarmSettling = false;

function offlineFingerprint(value) {
  const text = JSON.stringify(value);
  let hash = 2166136261;
  for (let index = 0; index < text.length; index++) hash = Math.imul(hash ^ text.charCodeAt(index), 16777619);
  return (hash >>> 0).toString(16);
}
const OFFLINE_CONFIG_SIGNATURE = offlineFingerprint({ config: GAME_CONFIG, damageModel: 2 });

function rewardTime(sourceState) {
  return sourceState?.offlineContext?.now ?? Date.now();
}
function offlineFarmSignature(save) {
  const gear = JSON.parse(JSON.stringify(save.equipment, (key, value) =>
    ['weaponExperience', 'id'].includes(key) ? undefined : value));
  return offlineFingerprint({ config: OFFLINE_CONFIG_SIGNATURE, main: save.mainClass,
    companion: save.activeCompanion, levels: save.characterLevels, gear, pets: save.pets,
    tree: save.skillTree, skills: Object.fromEntries(Object.entries(save.companions || {})
      .map(([owner, member]) => [owner, [member.activeSkillIndex, member.passiveSkillIndex, member.secondPassiveSkillIndex]])) });
}
function normalizeOfflineFarm(save) {
  const farm = save.offlineFarm;
  if (farm && !farm.mode) farm.mode = 'area';
  if (!farm || typeof farm !== 'object' || !['area', 'tower'].includes(farm.mode) || (farm.mode === 'area' && !AREAS.some(area => area.id === farm.area))
    || !Number.isInteger(farm.deepTier) || farm.deepTier < 0 || farm.deepTier > BALANCE.deepOfDark.maxTier) {
    save.offlineFarm = null;
    return;
  }
  farm.active = farm.active === true;
  farm.round = Number.isSafeInteger(farm.round) && farm.round >= 1 ? farm.round : 1;
  farm.partyHealth ||= {};
  for (const owner of Object.keys(CLASSES)) {
    farm.partyHealth[owner] = Number.isFinite(farm.partyHealth[owner]) ? Math.max(0, Math.min(1, farm.partyHealth[owner])) : 1;
  }
  farm.worldEvent = farm.worldEvent?.id ? worldEventFromId(farm.worldEvent.id) : null;
  farm.worldEventUntil = farm.worldEvent && Number.isFinite(farm.worldEventUntil) ? Math.max(0, farm.worldEventUntil) : 0;
  farm.powerups = (Array.isArray(farm.powerups) ? farm.powerups : []).filter(entry => entry
    && [...POWERUP_STATS, TOWER_LOOT_BOOST_STAT].includes(entry.stat) && Number.isFinite(entry.expiresAt)).slice(0, 40);
  farm.checkpointAt = Number.isFinite(farm.checkpointAt) ? Math.max(0, farm.checkpointAt) : 0;
  const validHealth = sample => ['startHealth', 'endHealth', 'restoration'].every(key => sample[key]
    && [save.mainClass, save.activeCompanion].filter(Boolean).every(owner => Number.isFinite(sample[key][owner]) && sample[key][owner] >= 0));
  farm.samples = (Array.isArray(farm.samples) ? farm.samples : []).filter(sample => sample
    && typeof sample.won === 'boolean' && typeof sample.elite === 'boolean'
    && Number.isFinite(sample.damageRate) && sample.damageRate >= 1
    && Number.isFinite(sample.milliseconds) && sample.milliseconds >= BALANCE.combat.tickMilliseconds
    && sample.milliseconds <= 86400000
    && (farm.mode !== 'tower' || (['normal', 'champion', 'boss'].includes(sample.kind) && validHealth(sample)))).slice(-OFFLINE_RULES.sampleLimit);
  farm.cursor = Number.isSafeInteger(farm.cursor) && farm.cursor >= 0 ? farm.cursor : 0;
  farm.carry = Number.isFinite(farm.carry) && farm.carry >= 0 ? Math.min(farm.carry, 86400000) : 0;
}
function offlineFarmCalibrated(farm) {
  return farm?.samples?.length >= OFFLINE_RULES.minimumSamples
    && (farm.mode !== 'tower' || ['normal', 'champion', 'boss'].every(kind => farm.samples.some(sample => sample.kind === kind)));
}
// Temporary damage bonuses change estimated combat time, not the fixed pauses.
// Survival and win/loss frequency remain empirical, rather than a second combat engine.
function offlineDamageRate(save) {
  return Math.min(Number.MAX_SAFE_INTEGER, Math.max(1, [save.mainClass, save.activeCompanion].filter(Boolean).reduce((sum, owner) => {
    const stats = getStats(owner, save);
    const critical = Math.min(100, stats['Kritische Chance']) / 100;
    const criticalFactor = 1 + critical * Math.max(0, stats['Kritischer Schaden'] / 100 - 1);
    const cadence = Math.max(stats['Angriffsgeschwindigkeit'] / 100, 1 / (1 - stats['Abklingzeitreduktion'] / 100));
    return sum + Math.max(1, stats.Angriff) * criticalFactor * cadence * characterDamageMultiplier(owner, save)
      * (1 + extraAttackChanceFor(owner, save) / 100);
  }, 0)));
}
function checkpointOnlineFarm(save) {
  const farm = save?.offlineFarm;
  if (!farm?.active || offlineFarmSuspended || offlineFarmSettling || document.hidden
    || !battle || battle.mode !== farm.mode || (farm.mode === 'area' && (farm.area !== battle.areaId || farm.deepTier !== battle.deepTier))) return;
  const signature = offlineFarmSignature(save);
  if (farm.signature !== signature) {
    farm.signature = signature;
    farm.samples = [];
    farm.carry = farm.cursor = 0;
  }
  if (!battle.partyClasses.every(owner => battle.autoSkills[owner])) {
    farm.samples = [];
    farm.carry = farm.cursor = 0;
  }
  farm.checkpointAt = Date.now();
  farm.powerups = cloneState(save.activePowerups || []);
  farm.worldEvent = cloneState(getWorldEvent());
  farm.worldEventUntil = worldEventDeadline;
}
function offlineTowerKind(round) {
  return round % 10 === 0 ? 'boss' : round % 10 === 5 ? 'champion' : 'normal';
}
function offlineRoundSample(session, won) {
  if (!['area', 'tower'].includes(session.mode) || !session.offlineWave) return null;
  const qualified = !session.offlineWave.manual && session.partyClasses.every(owner => session.autoSkills[owner]);
  if (session.mode === 'area' && !qualified) return null;
  const healerRest = session.partyClasses.includes('healer') ? 2 + passiveEffectTotal('rest-healing-percent', 'healer', state) : 0;
  const restoration = Object.fromEntries(session.partyClasses.map(owner => [owner,
    won ? (20 + healerRest) / 100 * (1 + (activeArmorSetEffects(state, owner).restHealingPercent || 0) / 100) : 0]));
  return { signature: session.offlineWave.signature, qualified, won, elite: Boolean(session.elite),
    kind: session.mode === 'tower' ? offlineTowerKind(session.towerRound) : 'normal',
    startHealth: session.offlineWave.partyHealth,
    endHealth: Object.fromEntries(Object.entries(session.partyHealth).map(([owner, hero]) => [owner, Math.max(0, hero.hp / hero.max)])),
    restoration, damageRate: session.offlineWave.damageRate,
    milliseconds: Math.max(BALANCE.combat.tickMilliseconds, performance.now() - session.offlineWave.startedAt)
      + (won ? 1300 : session.mode === 'tower' ? 0 : BALANCE.combat.defeatRecoveryMilliseconds) };
}
function recordOfflineFarmSample(save, body) {
  const farm = save.offlineFarm;
  const sample = body.offlineSample;
  if (!farm?.active || body.mode !== farm.mode
    || (farm.mode === 'area' && (farm.area !== body.area || farm.deepTier !== body.deepTier))) return;
  if (farm.mode === 'tower' && sample) {
    if (sample.won) {
      farm.round = Math.max(farm.round, Number(body.round) + 1);
      farm.partyHealth = Object.fromEntries(Object.entries(sample.endHealth).map(([owner, value]) => [owner, Math.min(1, value + sample.restoration[owner])]));
    } else farm.active = false;
  }
  const signature = offlineFarmSignature(save);
  if (signature !== farm.signature) {
    farm.signature = signature;
    farm.samples = [];
    farm.carry = farm.cursor = 0;
  }
  if (!sample || sample.qualified === false || sample.signature !== signature || !Number.isFinite(sample.milliseconds) || !Number.isFinite(sample.damageRate)) return;
  farm.samples.push({ won: sample.won, elite: sample.elite, milliseconds: sample.milliseconds,
    damageRate: sample.damageRate, kind: sample.kind,
    ...(farm.mode === 'tower' ? { startHealth: sample.startHealth, endHealth: sample.endHealth, restoration: sample.restoration } : {}) });
  farm.samples = farm.samples.slice(-OFFLINE_RULES.sampleLimit);
}
function armOfflineFarm(save, mode, area = null, deepTier = 0) {
  const signature = offlineFarmSignature(save);
  const previous = save.offlineFarm;
  const keep = previous?.mode === mode && previous.area === area && previous.deepTier === deepTier && previous.signature === signature;
  save.offlineFarm = { active: true, mode, area, deepTier, signature, checkpointAt: Date.now(),
    round: 1, partyHealth: Object.fromEntries([save.mainClass, save.activeCompanion].filter(Boolean).map(owner => [owner, 1])),
    samples: keep ? previous.samples : [], carry: keep && mode === 'area' && previous.active ? previous.carry : 0, cursor: keep && mode === 'area' && previous.active ? previous.cursor : 0,
    powerups: cloneState(save.activePowerups), worldEvent: cloneState(getWorldEvent()), worldEventUntil: worldEventDeadline,
    report: previous?.report || null };
}
function offlineTimeLabel(milliseconds) {
  const minutes = Math.floor(Math.max(0, milliseconds) / 60000);
  return `${Math.floor(minutes / 60)} Std. ${minutes % 60} Min.`;
}
function offlineFarmStatus() {
  const farm = state?.offlineFarm;
  if (!farm?.active) return '';
  return offlineFarmCalibrated(farm)
    ? `AFK bereit · ${OFFLINE_RULES.efficiency * 100} % · maximal ${OFFLINE_RULES.maximumHours} Std.`
    : `AFK-Messung: ${farm.samples.length}/${OFFLINE_RULES.minimumSamples} Runden${farm.mode === 'tower' ? ' + Normal/Champion/Boss' : ''} \u00b7 Auto-F\u00e4higkeiten erforderlich`;
}
function addOfflineLoot(report, item, destination) {
  if (!item) return;
  const key = destination === 'missed' ? 'missed' : destination === 'sold' ? 'sold' : 'items';
  const quantity = Math.max(1, Number(item.quantity) || 1);
  const previous = Object.hasOwn(report[key], item.name) ? report[key][item.name] : 0;
  Object.defineProperty(report[key], item.name, { value: previous + quantity, enumerable: true, configurable: true, writable: true });
  if (destination === 'mailbox') report.mailed += quantity;
}
async function settleOfflineFarm(save, now = Date.now()) {
  const farm = save.offlineFarm;
  if (!farm?.active) return null;
  const elapsed = Math.max(0, now - farm.checkpointAt);
  // Move the checkpoint inside the same saved transaction as all rewards.
  farm.checkpointAt = Math.max(now, farm.checkpointAt);
  if (!elapsed) return null;
  const duration = Math.min(elapsed, OFFLINE_RULES.maximumHours * 3600000);
  const start = now - duration;
  const report = { id: createItemId(), at: now, mode: farm.mode, area: farm.area, deepTier: farm.deepTier, startRound: farm.round, lastRound: farm.round - 1, runEnded: false,
    duration, elapsed, efficiency: OFFLINE_RULES.efficiency, wins: 0, defeats: 0, souls: 0,
    weaponExperience: [], items: {}, sold: {}, missed: {}, mailed: 0, pending: true };
  if (farm.signature !== offlineFarmSignature(save)) {
    farm.signature = offlineFarmSignature(save);
    farm.samples = [];
    farm.carry = farm.cursor = 0;
    report.note = 'Der Build oder die Spielregeln haben sich geändert. Sammle zuerst neue Runden für die AFK-Messung.';
  } else if (!offlineFarmCalibrated(farm)) {
    report.note = `${farm.mode === 'tower' ? 'Im Turm muss auch mindestens ein Champion und ein Archont mit diesem Build gemessen werden. ' : ''}Für eine verlässliche Messung fehlen noch Runden. Spiele mindestens ${OFFLINE_RULES.minimumSamples} vollständige Runden mit Auto-Fähigkeiten und ohne manuelle Fähigkeitseinsätze.`;
  } else {
    const currentPowerups = save.activePowerups;
    const previousContext = save.offlineContext;
    let event = farm.worldEvent || getWorldEvent();
    let eventUntil = Math.max(start, Number(farm.worldEventUntil) || start);
    let budget = duration * OFFLINE_RULES.efficiency + farm.carry;
    let consumed = 0;
    let count = 0;
    const owners = [save.mainClass, save.activeCompanion].filter(Boolean);
    const weapons = owners.map(owner => ({ owner, item: equipmentForClass(owner, save).mainHand })).filter(entry => isLevelWeapon(entry.item));
    const weaponIds = weapons.map(entry => entry.item.id);
    const previousWeaponExperience = weapons.map(entry => entry.item.weaponExperience || 0);
    save.activePowerups = farm.powerups || [];
    try {
      while (budget > 0) {
        const candidates = farm.mode === 'tower' ? farm.samples.filter(entry => entry.kind === offlineTowerKind(farm.round)) : farm.samples;
        const sample = candidates[farm.cursor % candidates.length];
        const roundStartedAt = Math.min(now, start + consumed / OFFLINE_RULES.efficiency);
        while (eventUntil <= roundStartedAt) {
          event = chooseWorldEvent();
          eventUntil += WORLD_EVENT_INTERVAL_MS;
        }
        save.offlineContext = { now: roundStartedAt, worldEvent: event };
        if (save.workshopJob) await settleWorkshopThrough(save, roundStartedAt);
        const pause = sample.won ? 1300 : farm.mode === 'tower' ? 0 : BALANCE.combat.defeatRecoveryMilliseconds;
        const milliseconds = pause + Math.max(BALANCE.combat.tickMilliseconds,
          Math.max(BALANCE.combat.tickMilliseconds, sample.milliseconds - pause)
          * sample.damageRate / offlineDamageRate(save));
        if (budget < milliseconds) break;
        budget -= milliseconds;
        consumed += milliseconds;
        farm.cursor += 1;
        const at = Math.min(now, start + consumed / OFFLINE_RULES.efficiency);
        while (eventUntil <= at) {
          event = chooseWorldEvent();
          eventUntil += WORLD_EVENT_INTERVAL_MS;
        }
        save.offlineContext = { now: at, worldEvent: event };
        // Finish due attempts before awarding this round's materials, never using future drops.
        if (save.workshopJob) await settleWorkshopThrough(save, at);
        let won = sample.won;
        if (farm.mode === 'tower') {
          const health = Object.fromEntries(owners.map(owner => [owner, Math.max(0, Math.min(1,
            (farm.partyHealth[owner] ?? 1) + sample.endHealth[owner] - sample.startHealth[owner]))]));
          won = won && owners.some(owner => health[owner] > 0);
          farm.partyHealth = Object.fromEntries(owners.map(owner => [owner, won ? Math.min(1, health[owner] + sample.restoration[owner]) : 0]));
        }
        if (won) {
          const towerKills = farm.mode === 'tower' ? towerEnemyCount(farm.round) : 3;
          const result = resolveBattleRewards(save, { mode: farm.mode, area: farm.area, deepTier: farm.deepTier, round: farm.round,
            elite: sample.elite, partyClasses: owners, huntingEventId: at >= save.huntingEvent?.startedAt && at < save.huntingEvent?.nextAvailableAt ? save.huntingEvent.id : null,
            statistics: { monstersKilled: towerKills, weaponKills: towerKills, weaponIds, huntingKills: farm.mode === 'area' ? 3 : 0 } });
          report.wins += 1;
          if (farm.mode === 'tower') { report.lastRound = farm.round; farm.round += 1; }
          for (const drop of result.towerMaterialDrops || []) addOfflineLoot(report, drop.item, drop.destination);
          for (const item of result.towerMaterialDropMissed || []) addOfflineLoot(report, item, 'missed');
          report.souls += result.reward + (result.equipmentDropSaleValue || 0);
          addOfflineLoot(report, result.equipmentDrop, result.equipmentDropDestination);
          addOfflineLoot(report, result.farmBoxDrop, result.farmBoxDropDestination);
          if (result.equipmentDropSaleStones) addOfflineLoot(report, { name: 'Mystischer Aufwertungsstein', quantity: result.equipmentDropSaleStones }, 'inventory');
        } else {
          report.defeats += 1;
          save.statistics.deaths += owners.length;
          if (farm.mode === 'tower') { farm.active = false; report.runEnded = true; budget = 0; break; }
        }
        // Keep startup responsive; there is no persistence or reward display per round.
        if (++count % 50 === 0) await new Promise(resolve => window.setTimeout(resolve, 0));
      }
      farm.carry = budget;
      report.weaponExperience = weapons.map((entry, index) => ({ owner: entry.owner, amount: entry.item.weaponExperience - previousWeaponExperience[index] }));
    } finally {
      save.activePowerups = currentPowerups;
      if (previousContext) save.offlineContext = previousContext;
      else delete save.offlineContext;
    }
  }
  // Very short interruptions without completed rounds need no return dialog.
  if (report.wins || report.defeats || duration >= 60000) farm.report = report;
  return report;
}
async function offlineFarmAction(save, body) {
  let report = null;
  if (body.action === 'offline-start') {
    const index = AREAS.findIndex(area => area.id === body.area);
    const tier = Number(body.deepTier);
    if (index < 0 || !Number.isInteger(tier) || tier < 0 || tier > save.deepOfDark.tier
      || (tier === save.deepOfDark.tier && !areaUnlocked(save, index))) throw new Error('Dieses AFK-Farmziel ist nicht freigeschaltet.');
    armOfflineFarm(save, 'area', body.area, tier);
  } else if (body.action === 'offline-resume-tower') {
    if (save.offlineFarm?.mode !== 'tower' || !save.offlineFarm.active) throw new Error('Kein laufender Turmversuch zum Fortsetzen.');
  } else if (body.action === 'offline-stop') {
    if (save.offlineFarm) save.offlineFarm.active = false;
  } else if (body.action === 'offline-checkpoint') {
    if (['area', 'tower'].includes(battle?.mode) && !battle.partyClasses.every(owner => battle.autoSkills[owner]) && save.offlineFarm) {
      save.offlineFarm.samples = [];
      save.offlineFarm.carry = save.offlineFarm.cursor = 0;
    }
    if (save.offlineFarm?.active) save.offlineFarm.checkpointAt = Math.max(save.offlineFarm.checkpointAt, Number(body.at) || Date.now());
  } else if (body.action === 'offline-settle') {
    offlineFarmSettling = true;
    try { report = await settleOfflineFarm(save); }
    finally { offlineFarmSettling = false; }
  } else if (body.action === 'offline-dismiss') {
    if (save.offlineFarm?.report?.id === body.reportId) save.offlineFarm.report.pending = false;
  } else throw new Error('Unbekannte AFK-Aktion.');
  return { state: save, offlineReport: report };
}
function showOfflineFarmReport() {
  const report = state?.offlineFarm?.report;
  if (!report?.pending || document.hidden) return;
  const existing = document.querySelector('[data-offline-report]');
  if (existing?.dataset.offlineReport === report.id) return;
  existing?.remove();
  const panel = document.createElement('aside');
  panel.className = 'offline-farm-report';
  panel.dataset.offlineReport = report.id;
  panel.setAttribute('role', 'dialog');
  panel.setAttribute('aria-labelledby', 'offline-report-title');
  const loot = Object.entries(report.items).map(([name, quantity]) => `<li>${number(quantity)} × ${escapeHtml(name)}</li>`).join('');
  const count = items => Object.values(items).reduce((sum, quantity) => sum + quantity, 0);
  panel.innerHTML = `<header><p class="eyebrow">WILLKOMMEN ZURÜCK</p><h2 id="offline-report-title">Deine Gruppe war unterwegs</h2></header>
    <p>${report.mode === 'tower' ? `Turm \u00b7 ${report.wins ? `Runde ${report.startRound} bis ${report.lastRound}` : `Runde ${report.startRound}`}` : `${escapeHtml(AREAS.find(area => area.id === report.area)?.name || report.area)} \u00b7 ${report.deepTier ? `Deep of Dark ${report.deepTier}` : 'Grundstufe'}`}</p>
    <p>${offlineTimeLabel(report.duration)} angerechnet · ${report.efficiency * 100} % Effizienz${report.elapsed > report.duration ? ` · auf ${OFFLINE_RULES.maximumHours} Stunden begrenzt` : ''}</p>
    ${report.runEnded ? '<p>Deine Gruppe wurde besiegt. Der Turmlauf ist beendet; es wurde kein weiterer Versuch und kein Zeitstein verwendet.</p>' : ''}
    ${report.note ? `<p>${escapeHtml(report.note)}</p>` : `<div class="offline-farm-totals"><span><strong>${number(report.wins)}</strong> Siege</span><span><strong>${number(report.defeats)}</strong> Niederlagen</span><span><strong>+${number(report.souls)}</strong> Seelen</span>${report.weaponExperience.filter(entry => entry.amount > 0).map(entry => `<span><strong>+${number(entry.amount)}</strong> Waffen-EP (${escapeHtml(CLASSES[entry.owner].label)})</span>`).join('')}</div>
    ${loot ? `<ul>${loot}</ul>` : '<p>Keine Gegenstandsbeute.</p>'}
    ${report.mailed ? `<p>${number(report.mailed)} Gegenstände im Briefkasten abgelegt.</p>` : ''}
    ${count(report.sold) ? `<p>${number(count(report.sold))} Gegenstände durch den Lootfilter verkauft.</p>` : ''}
    ${count(report.missed) ? `<p>${number(count(report.missed))} Gegenstände wegen voller Lagerplätze nicht aufgenommen.</p>` : ''}`}
    <button type="button" class="primary-button ui-control ui-button">WEITER</button>`;
  panel.querySelector('button').addEventListener('click', async () => {
    const result = await performAction({ action: 'offline-dismiss', reportId: report.id, silent: true });
    if (result) { panel.remove(); document.querySelector('[data-show-battle]')?.focus(); showOfflineFarmReport(); }
  });
  document.body.append(panel);
  panel.querySelector('button').focus({ preventScroll: true });
}
async function resumeOfflineFarm() {
  if (document.hidden) { offlineFarmSuspended = Boolean(state?.offlineFarm?.active); return; }
  if (saveMaintenance || saveBlocked || !state?.mainClass) return;
  if (!state.offlineFarm?.active) { showOfflineFarmReport(); return; }
  if (battle && !['area', 'tower'].includes(battle.mode)) return;
  const current = ['area', 'tower'].includes(battle?.mode) ? battle : null;
  const loading = document.createElement('div');
  loading.className = 'offline-farm-loading';
  loading.setAttribute('role', 'status');
  loading.textContent = 'AFK-Fortschritt wird berechnet \u2026';
  document.body.append(loading);
  let result;
  try { result = await performAction({ action: 'offline-settle' }); }
  finally { loading.remove(); }
  if (!result || document.hidden) return;
  offlineFarmSuspended = false;
  if (current && battle === current && !state.offlineFarm?.active) {
    window.clearTimeout(current.timer);
    battle = null;
    document.querySelector('#battle-overlay')?.remove();
    updateBattleDock();
  } else if (current && battle === current) {
    current.towerRound = state.offlineFarm.mode === 'tower' ? state.offlineFarm.round : null;
    current.partyHealth = initializeBattleParty(current.partyClasses);
    if (current.mode === 'tower') applyOfflineTowerHealth(current);
    current.between = current.pending = current.finishing = false;
    current.recoveryUntil = 0;
    beginBattleWave();
  } else if (!battle && state.offlineFarm?.active) {
    await startBattle(state.offlineFarm.mode, state.offlineFarm.area, { deepTier: state.offlineFarm.deepTier, visible: false, resume: state.offlineFarm.mode === 'tower' });
  }
  showOfflineFarmReport();
}
function suspendOfflineFarm() {
  if (!state?.offlineFarm?.active || !['area', 'tower'].includes(battle?.mode) || offlineFarmSuspended || saveBlocked || saveMaintenance) return;
  const at = Date.now();
  offlineFarmSuspended = true;
  window.clearTimeout(battle.timer);
  window.clearTimeout(battle.victoryTimer);
  battle.timer = battle.victoryTimer = null;
  offlineFarmTransition = offlineFarmTransition.then(() => performAction({ action: 'offline-checkpoint', at, silent: true }));
}
document.addEventListener('visibilitychange', () => {
  if (document.hidden) suspendOfflineFarm();
  else if (offlineFarmSuspended || (!battle && state?.offlineFarm?.active)) offlineFarmTransition = offlineFarmTransition.then(resumeOfflineFarm);
});
window.addEventListener('pagehide', suspendOfflineFarm);
window.addEventListener('pageshow', event => {
  if (event.persisted && offlineFarmSuspended && !document.hidden) offlineFarmTransition = offlineFarmTransition.then(resumeOfflineFarm);
});
window.setInterval(() => {
  if (!state?.offlineFarm?.active || offlineFarmSuspended || document.hidden || saveBlocked || saveMaintenance) return;
  enqueueStateTask(() => writeSavedState(state)).catch(() => {});
}, OFFLINE_RULES.checkpointSeconds * 1000);

function applyOfflineTowerHealth(session) {
  for (const [owner, hero] of Object.entries(session.partyHealth)) {
    hero.hp = hero.max * (state.offlineFarm?.partyHealth?.[owner] ?? 1);
  }
}
