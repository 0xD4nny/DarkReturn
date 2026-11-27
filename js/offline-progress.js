// Offline farming estimates combat throughput from real farming rounds. Rewards use
// the live reward resolver; no combat timers or scene rendering run in this path.
const OFFLINE_RULES = BALANCE.offlineProgress;
let offlineFarmSuspended = false;
let offlineFarmTransition = Promise.resolve();
let offlineFarmSettling = false;
let adminFarmSimulationPending = false;
let adminFarmSimulationQueue = 0;

function offlineFingerprint(value) {
  const text = JSON.stringify(value);
  let hash = 2166136261;
  for (let index = 0; index < text.length; index++) hash = Math.imul(hash ^ text.charCodeAt(index), 16777619);
  return (hash >>> 0).toString(16);
}
const OFFLINE_CONFIG_SIGNATURE = offlineFingerprint({ config: JSON.parse(JSON.stringify(GAME_CONFIG,
  (key, value) => ['icon', 'iconAsset', 'asset', 'portrait', 'portraitFrame', 'name', 'label', 'description', 'position', 'projectileType'].includes(key) ? undefined : value)), damageModel: 13 });

function rewardTime(sourceState) {
  return sourceState?.offlineContext?.now ?? Date.now();
}
function offlineFarmSignature(save) {
  const gear = JSON.parse(JSON.stringify(save.equipment, (key, value) =>
    ['weaponExperience', 'weaponLevel', 'id'].includes(key) ? undefined : value));
  return offlineFingerprint({ config: OFFLINE_CONFIG_SIGNATURE, main: save.mainClass,
    companion: save.activeCompanion, levels: save.characterLevels, gear, pets: save.pets,
    tree: save.skillTree, skills: Object.fromEntries(Object.entries(save.companions || {})
      .map(([owner, member]) => [owner, [member.activeSkillIndex]])) });
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
  farm.autoSkills = Object.fromEntries([save.mainClass, save.activeCompanion].filter(Boolean)
    .map(owner => [owner, typeof farm.autoSkills?.[owner] === 'boolean' ? farm.autoSkills[owner] : save.settings?.autoSkillsDefault !== false]));
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
    && (sample.fixedDamageFraction == null || (Number.isFinite(sample.fixedDamageFraction) && sample.fixedDamageFraction >= 0 && sample.fixedDamageFraction <= 1))
    && Number.isFinite(sample.milliseconds) && sample.milliseconds >= BALANCE.combat.tickMilliseconds
    && sample.milliseconds <= 86400000
    && (farm.mode !== 'tower' || (['normal', 'champion', 'boss'].includes(sample.kind) && Number.isSafeInteger(sample.round) && sample.round >= 1
      && Number.isSafeInteger(sample.enemyAttackCount) && sample.enemyAttackCount >= 0
      && sample.damageTaken && [save.mainClass, save.activeCompanion].filter(Boolean).every(owner => Number.isFinite(sample.damageTaken[owner]) && sample.damageTaken[owner] >= 0)
      && validHealth(sample)))).slice(-OFFLINE_RULES.sampleLimit);
  farm.cursor = Number.isSafeInteger(farm.cursor) && farm.cursor >= 0 ? farm.cursor : 0;
  farm.carry = Number.isFinite(farm.carry) && farm.carry >= 0 ? Math.min(farm.carry, 86400000) : 0;
}
function offlineFarmCalibrated(farm) {
  return farm?.samples?.length >= OFFLINE_RULES.minimumSamples;
}
// Temporary damage bonuses change estimated combat time, not the fixed pauses.
// Survival and win/loss frequency remain empirical, rather than a second combat engine.
function offlineDamageRate(save) {
  return Math.min(Number.MAX_SAFE_INTEGER, Math.max(1, [save.mainClass, save.activeCompanion].filter(Boolean).reduce((sum, owner) => {
    const { stats, attack } = calculateCharacterStats(owner, save);
    const weapon = equipmentForClass(owner, save).mainHand;
    const base = (CLASS_DAMAGE[owner] + Math.max(0, characterLevel(owner, save) - 1) * 2
      + effectiveWeaponDamage(weapon) + Math.floor(attack.base / 5))
      * damageAttributeMultiplier(owner, stats) * (1 + attack.percent / 100);
    const critical = Math.min(100, stats['Kritische Chance']) / 100;
    const criticalFactor = 1 + critical * Math.max(0, stats['Kritischer Schaden'] / 100 - 1);
    const cadence = Math.max(stats['Angriffsgeschwindigkeit'] / 100, 1 / (1 - stats['Abklingzeitreduktion'] / 100));
    const setEffects = activeArmorSetEffects(save, owner);
    // Round samples capture actual echo delays and lost damage on enemy deaths.
    // This factor adjusts the measured rate when temporary DoT bonuses change.
    const echoMultiplier = 1 + (setEffects.shadowEchoPercent || 0) / 100 * Math.max(0, 1 + (stats['Schaden über Zeit'] || 0) / 100);
    return sum + Math.max(1, base) * criticalFactor * cadence
      * expectedMultiHitDamage(extraAttackChanceFor(owner, save), setEffects.multiHitDamagePercentPerHit || 0, characterDamageMultiplier(owner, save)) * echoMultiplier;
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
  farm.checkpointAt = Date.now();
  farm.powerups = cloneState(save.activePowerups || []);
  farm.autoSkills = { ...battle.autoSkills };
  farm.worldEvent = cloneState(getWorldEvent());
  farm.worldEventUntil = worldEventDeadline;
}
function offlineTowerKind(round) {
  return round % 10 === 0 ? 'boss' : round % 10 === 5 ? 'champion' : 'normal';
}
function offlineTowerEncounterProfile(save, round) {
  const base = towerEncounterStats(save, round);
  const kind = offlineTowerKind(round);
  return {
    health: base.health * 3 * (kind === 'boss' ? 10 : kind === 'champion' ? BALANCE.loot.eliteHealthMultiplier : 1),
    damage: kind === 'champion' ? Math.ceil(base.damage * BALANCE.loot.eliteDamageMultiplier) : base.damage,
  };
}
function offlineTowerSample(farm) {
  const matching = farm.samples.filter(entry => entry.kind === offlineTowerKind(farm.round));
  // Missing encounter types use nearby measured rounds, scaled by full encounter HP.
  const candidates = (matching.length ? matching : farm.samples).slice()
    .sort((a, b) => Math.abs(a.round - farm.round) - Math.abs(b.round - farm.round)).slice(0, 3);
  return candidates[farm.cursor % candidates.length];
}
function offlineTowerRoundScaling(save, sample, round) {
  const previous = offlineTowerEncounterProfile(save, sample.round);
  const current = offlineTowerEncounterProfile(save, round);
  return { health: current.health / previous.health, damage: current.damage / previous.damage };
}
function offlineCombatDuration(sample, damageRate, healthScale = 1, pause = 0) {
  // Max-health damage scales with enemy HP; ordinary damage scales with the build's rate.
  const fixed = sample.fixedDamageFraction || 0;
  const damageRatio = fixed * healthScale + (1 - fixed) * damageRate / sample.damageRate;
  return Math.max(BALANCE.combat.tickMilliseconds,
    Math.max(BALANCE.combat.tickMilliseconds, sample.milliseconds - pause) * (healthScale / damageRatio));
}
function offlineTowerUnmeasuredDamage(save, farm, combatMilliseconds) {
  const owners = [save.mainClass, save.activeCompanion].filter(owner => owner && (farm.partyHealth[owner] ?? 1) > 0);
  const frontliners = owners.filter(owner => ['warrior', 'healer'].includes(owner));
  const targets = frontliners.length ? frontliners : owners;
  const interval = BALANCE.combat.enemyAttackIntervalTicks * BALANCE.combat.tickMilliseconds;
  const attacks = Math.floor(combatMilliseconds / interval);
  const profile = offlineTowerEncounterProfile(save, farm.round);
  const skillFactor = 1 + (BALANCE.combat.towerSkillMultiplier - 1) / BALANCE.combat.towerSkillAttackInterval;
  return Object.fromEntries(owners.map(owner => {
    if (!targets.includes(owner) || !attacks) return [owner, { damage: 0, lethal: false }];
    const stats = getStats(owner, save);
    const reduction = battleDamageReduction(stats.Verteidigung, [], 0, 0, { className: owner, sourceState: save });
    const dodge = Math.min(1, dodgeChanceFor(owner, save) / 100);
    const hit = Math.max(BALANCE.combat.enemyMinimumHitDamage, profile.damage * skillFactor * (1 - reduction));
    const fraction = hit / Math.max(1, stats.Lebenskraft);
    return [owner, { damage: attacks / targets.length * fraction * (1 - dodge), lethal: dodge < 1 && fraction >= 1 }];
  }));
}
function offlineTowerHealingRate(save, farm, target) {
  return [save.mainClass, save.activeCompanion].filter(Boolean).reduce((total, owner) => {
    if (farm.autoSkills?.[owner] === false || (farm.partyHealth[owner] ?? 1) <= 0) return total;
    const skill = activeClassSkill(owner, save);
    if (!skill || !['heal', 'heal-over-time'].includes(skill.effect)
      || (skill.effect === 'heal-over-time' && skill.healScope === 'self' && owner !== target)) return total;
    const stats = getStats(owner, save);
    const cooldown = Math.max(.25, skill.cooldown * (1 - Math.max(0, Math.min(75, stats['Abklingzeitreduktion'] || 0)) / 100));
    const multiplier = (1 + (owner === 'healer' ? healerFaithScaling(stats) : 0) / 100)
      * (1 + (activeArmorSetEffects(save, owner).healingPercent || 0) / 100);
    const rate = skill.effect === 'heal' ? skill.healPercent / cooldown
      : skill.healPercent * Math.min(1, skill.durationSeconds / cooldown);
    return total + rate * multiplier / 100;
  }, 0);
}
function offlineTowerPartyHealth(save, farm, sample, scaling, combatMilliseconds) {
  const pause = sample.won ? 1300 : 0;
  const durationRatio = combatMilliseconds / Math.max(BALANCE.combat.tickMilliseconds, sample.milliseconds - pause);
  const estimated = !sample.enemyAttackCount ? offlineTowerUnmeasuredDamage(save, farm, combatMilliseconds) : null;
  return Object.fromEntries([save.mainClass, save.activeCompanion].filter(Boolean).map(owner => {
    if ((farm.partyHealth[owner] ?? 1) <= 0) return [owner, 0];
    if (estimated?.[owner]?.lethal) return [owner, 0];
    const taken = sample.damageTaken[owner];
    const healed = Math.max(0, sample.endHealth[owner] - sample.startHealth[owner] + taken);
    const incoming = estimated ? estimated[owner]?.damage || 0 : taken * scaling.damage * durationRatio;
    const healing = estimated ? Math.max(healed * durationRatio, offlineTowerHealingRate(save, farm, owner) * combatMilliseconds / 1000) : healed * durationRatio;
    const remaining = (farm.partyHealth[owner] ?? 1) - incoming + healing;
    return [owner, Math.max(0, Math.min(1, remaining))];
  }));
}
function offlineRoundSample(session, won) {
  if (!['area', 'tower'].includes(session.mode) || !session.offlineWave) return null;
  const qualified = !session.offlineWave.manual;
  if (session.mode === 'area' && !qualified) return null;
  const healerRest = session.partyClasses.includes('healer') ? 2 : 0;
  const restoration = Object.fromEntries(session.partyClasses.map(owner => [owner,
    won ? (20 + healerRest + passiveEffectTotal('rest-healing-percent', owner, state)) / 100 * (1 + (activeArmorSetEffects(state, owner).restHealingPercent || 0) / 100) : 0]));
  return { signature: session.offlineWave.signature, qualified, won, elite: Boolean(session.elite),
    autoSkills: { ...session.autoSkills },
    kind: session.mode === 'tower' ? offlineTowerKind(session.towerRound) : 'normal',
    startHealth: session.offlineWave.partyHealth,
    endHealth: Object.fromEntries(Object.entries(session.partyHealth).map(([owner, hero]) => [owner, Math.max(0, hero.hp / hero.max)])),
    restoration, damageRate: session.offlineWave.damageRate,
    ...(session.mode === 'tower' ? { round: session.towerRound, enemyAttackCount: session.enemyAttackCount || 0,
      damageTaken: Object.fromEntries(session.partyClasses.map(owner => [owner, session.roundDamageTakenByClass?.[owner] || 0])) } : {}),
    fixedDamageFraction: Math.min(1, Math.max(0, (session.roundHealthBasedDamage || 0)
      / Math.max(1, Object.values(session.roundDamageByClass || {}).reduce((sum, damage) => sum + damage, 0)))),
    milliseconds: Math.max(BALANCE.combat.tickMilliseconds, performance.now() - session.offlineWave.startedAt)
      + (won ? 1300 : session.mode === 'tower' ? 0 : BALANCE.combat.defeatRecoveryMilliseconds) };
}
function recordOfflineFarmSample(save, body) {
  const farm = save.offlineFarm;
  const sample = body.offlineSample;
  if (!farm?.active || body.mode !== farm.mode
    || (farm.mode === 'area' && (farm.area !== body.area || farm.deepTier !== body.deepTier))) return;
  if (farm.mode === 'tower' && sample) {
    if (sample.autoSkills) farm.autoSkills = Object.fromEntries([save.mainClass, save.activeCompanion].filter(Boolean).map(owner => [owner, sample.autoSkills[owner] === true]));
    if (sample.won) {
      farm.round = Math.max(farm.round, Number(body.round) + 1);
      farm.partyHealth = Object.fromEntries(Object.entries(sample.endHealth).map(([owner, value]) => [owner, value > 0 ? Math.min(1, value + sample.restoration[owner]) : 0]));
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
    damageRate: sample.damageRate, kind: sample.kind, fixedDamageFraction: sample.fixedDamageFraction || 0,
    ...(farm.mode === 'tower' ? { round: sample.round, enemyAttackCount: sample.enemyAttackCount || 0, damageTaken: sample.damageTaken,
      startHealth: sample.startHealth, endHealth: sample.endHealth, restoration: sample.restoration } : {}) });
  farm.samples = farm.samples.slice(-OFFLINE_RULES.sampleLimit);
}
function armOfflineFarm(save, mode, area = null, deepTier = 0) {
  const signature = offlineFarmSignature(save);
  const previous = save.offlineFarm;
  const keep = previous?.mode === mode && previous.area === area && previous.deepTier === deepTier && previous.signature === signature;
  save.offlineFarm = { active: true, mode, area, deepTier, signature, checkpointAt: Date.now(),
    autoSkills: Object.fromEntries([save.mainClass, save.activeCompanion].filter(Boolean).map(owner => [owner, save.settings?.autoSkillsDefault !== false])),
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
    : `AFK-Messung: ${farm.samples.length}/${OFFLINE_RULES.minimumSamples} Runden`;
}
function addOfflineLoot(report, item, destination) {
  if (!item) return;
  const key = destination === 'missed' ? 'missed' : destination === 'sold' ? 'sold' : 'items';
  const quantity = Math.max(1, Number(item.quantity) || 1);
  const label = item.slot === 'questItem' ? `${item.name} (${item.rarity})` : item.name;
  const previous = Object.hasOwn(report[key], label) ? report[key][label] : 0;
  Object.defineProperty(report[key], label, { value: previous + quantity, enumerable: true, configurable: true, writable: true });
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
    report.note = `Für die Messung fehlen noch Runden. Spiele mindestens ${OFFLINE_RULES.minimumSamples} vollständige Runden ohne manuelle Fähigkeitseinsätze. Champion- und Bossmessungen sind nicht erforderlich.`;
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
        const sample = farm.mode === 'tower' ? offlineTowerSample(farm) : farm.samples[farm.cursor % farm.samples.length];
        const roundStartedAt = Math.min(now, start + consumed / OFFLINE_RULES.efficiency);
        while (eventUntil <= roundStartedAt) {
          event = chooseWorldEvent();
          eventUntil += WORLD_EVENT_INTERVAL_MS;
        }
        save.offlineContext = { now: roundStartedAt, worldEvent: event };
        if (save.workshopJob) await settleWorkshopThrough(save, roundStartedAt);
        const pause = sample.won ? 1300 : farm.mode === 'tower' ? 0 : BALANCE.combat.defeatRecoveryMilliseconds;
        const scaling = farm.mode === 'tower' ? offlineTowerRoundScaling(save, sample, farm.round) : { health: 1, damage: 1 };
        const combatMilliseconds = offlineCombatDuration(sample, offlineDamageRate(save), scaling.health, pause);
        const milliseconds = pause + combatMilliseconds;
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
          const health = offlineTowerPartyHealth(save, farm, sample, scaling, combatMilliseconds);
          won = won && owners.some(owner => health[owner] > 0);
          farm.partyHealth = Object.fromEntries(owners.map(owner => [owner, won && health[owner] > 0 ? Math.min(1, health[owner] + sample.restoration[owner]) : 0]));
        }
        if (won) {
          const towerKills = farm.mode === 'tower' ? towerEnemyCount(farm.round) : 3;
          const result = resolveBattleRewards(save, { mode: farm.mode, area: farm.area, deepTier: farm.deepTier, round: farm.round,
            elite: farm.mode === 'tower' ? offlineTowerKind(farm.round) === 'champion' : sample.elite, partyClasses: owners, huntingEventId: at >= save.huntingEvent?.startedAt && at < save.huntingEvent?.nextAvailableAt ? save.huntingEvent.id : null,
            statistics: { monstersKilled: towerKills, weaponKills: towerKills, weaponIds, huntingKills: farm.mode === 'area' ? 3 : 0 } });
          report.wins += 1;
          if (farm.mode === 'tower') { report.lastRound = farm.round; farm.round += 1; }
          for (const item of result.questItemDrops || []) addOfflineLoot(report, item, 'inventory');
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
    if (save.offlineFarm?.active) save.offlineFarm.checkpointAt = Math.max(save.offlineFarm.checkpointAt, Number(body.at) || Date.now());
  } else if (body.action === 'offline-settle' || body.action === 'offline-simulate-time') {
    const settleAt = Date.now();
    if (body.action === 'offline-simulate-time') {
      if (!save.offlineFarm?.active) throw new Error('Starte zuerst einen Gebietskampf oder Turmlauf als AFK-Farmziel.');
      if (save.offlineFarm.signature !== offlineFarmSignature(save) || !offlineFarmCalibrated(save.offlineFarm)) {
        throw new Error(`Die AFK-Messung ist noch nicht bereit. Sammle zuerst ${OFFLINE_RULES.minimumSamples} vollständige Runden.`);
      }
      // Use the real clock and reward resolver; only the farm checkpoint is backdated.
      save.offlineFarm.checkpointAt = settleAt - OFFLINE_RULES.adminSimulationHours * 3600000;
    }
    offlineFarmSettling = true;
    try { report = await settleOfflineFarm(save, settleAt); }
    finally { offlineFarmSettling = false; }
    if (body.action === 'offline-simulate-time' && report) report.pending = false;
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
    <p>${report.mode === 'tower' ? `Turm \u00b7 ${report.wins ? `Runde ${report.startRound} bis ${report.lastRound}` : `Runde ${report.startRound}`}` : `${escapeHtml(AREAS.find(area => area.id === report.area)?.name || report.area)} \u00b7 ${difficultyName(report.deepTier)}`}</p>
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
  return settleAndResumeOfflineFarm('offline-settle');
}
function adminFarmSimulationLabel() {
  return adminFarmSimulationPending
    ? `+${OFFLINE_RULES.adminSimulationHours} Std.${adminFarmSimulationQueue ? ` (${adminFarmSimulationQueue} wartend)` : ' hinzufügen'}`
    : `${OFFLINE_RULES.adminSimulationHours} Std. simulieren`;
}
function updateAdminFarmSimulationButton() {
  const button = document.querySelector('[data-admin-action="admin-simulate-offline-time"]');
  if (button) {
    button.disabled = false;
    button.textContent = adminFarmSimulationLabel();
    button.setAttribute('aria-label', `${OFFLINE_RULES.adminSimulationHours} Stunden AFK-Farmzeit simulieren${adminFarmSimulationQueue ? `; ${adminFarmSimulationQueue} Simulationen warten` : ''}`);
  }
}
async function simulateAdminFarmTime() {
  if (document.hidden || saveMaintenance || saveBlocked) return;
  if (!state?.offlineFarm?.active) {
    toastMessageFor('Keine aktive AFK-Farm', 'Starte zuerst einen Gebietskampf oder Turmlauf.');
    return;
  }
  if (battle && !['area', 'tower'].includes(battle.mode)) {
    toastMessageFor('AFK-Simulation nicht möglich', 'Beende zuerst den laufenden Bosskampf.');
    return;
  }
  adminFarmSimulationQueue++;
  updateAdminFarmSimulationButton();
  if (adminFarmSimulationPending) return;
  adminFarmSimulationPending = true;
  let completed = 0;
  try {
    do {
      suspendOfflineFarm();
      while (adminFarmSimulationQueue > 0 && !document.hidden && state.offlineFarm?.active) {
        adminFarmSimulationQueue--;
        updateAdminFarmSimulationButton();
        offlineFarmTransition = offlineFarmTransition.catch(() => {}).then(() =>
          settleAndResumeOfflineFarm('admin-simulate-offline-time', { resume: false, showReport: false }));
        const result = await offlineFarmTransition;
        if (!result) { adminFarmSimulationQueue = 0; break; }
        completed++;
      }
      if (offlineFarmSuspended && !document.hidden) await settleAndResumeOfflineFarm('offline-settle', { showReport: false });
    } while (adminFarmSimulationQueue > 0 && !document.hidden && state.offlineFarm?.active);
    if (completed) toastMessageFor('AFK-Zeit simuliert', `${completed * OFFLINE_RULES.adminSimulationHours} Stunden berechnet. Ergebnisse stehen im Aktivitätsprotokoll.${state.offlineFarm?.active ? '' : ' Der Turmlauf ist beendet.'}`);
  } catch (error) {
    offlineFarmTransition = offlineFarmTransition.catch(() => {});
    toastMessageFor('AFK-Simulation fehlgeschlagen', error.message || 'Die Simulation konnte nicht abgeschlossen werden.');
  } finally {
    adminFarmSimulationQueue = 0;
    adminFarmSimulationPending = false;
    updateAdminFarmSimulationButton();
    // A rejected simulation must not leave the live battle paused.
    if (offlineFarmSuspended && !document.hidden) await settleAndResumeOfflineFarm('offline-settle', { showReport: false });
  }
}
async function settleAndResumeOfflineFarm(action, { resume = true, showReport = true } = {}) {
  if (document.hidden) { offlineFarmSuspended = Boolean(state?.offlineFarm?.active); return; }
  if (saveMaintenance || saveBlocked || !state?.mainClass) return;
  if (!state.offlineFarm?.active) {
    offlineFarmSuspended = false;
    if (battle && ['area', 'tower'].includes(battle.mode)) {
      window.clearTimeout(battle.timer);
      window.clearTimeout(battle.victoryTimer);
      battle = null;
      document.querySelector('#battle-overlay')?.remove();
      updateBattleDock();
    }
    if (showReport) showOfflineFarmReport();
    return;
  }
  if (battle && !['area', 'tower'].includes(battle.mode)) return;
  const current = ['area', 'tower'].includes(battle?.mode) ? battle : null;
  const loading = document.createElement('div');
  loading.className = 'offline-farm-loading';
  loading.setAttribute('role', 'status');
  loading.textContent = 'AFK-Fortschritt wird berechnet \u2026';
  document.body.append(loading);
  let result;
  try { result = await performAction({ action }); }
  finally { loading.remove(); }
  if (!result || document.hidden) return result;
  if (!resume) return result;
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
  if (showReport) showOfflineFarmReport();
  return result;
}
function suspendOfflineFarm() {
  if (!state?.offlineFarm?.active || !['area', 'tower'].includes(battle?.mode) || offlineFarmSuspended || saveBlocked || saveMaintenance) return;
  const at = Date.now();
  offlineFarmSuspended = true;
  window.clearTimeout(battle.timer);
  window.clearTimeout(battle.victoryTimer);
  battle.timer = battle.victoryTimer = null;
  offlineFarmTransition = offlineFarmTransition.catch(() => {}).then(() => performAction({ action: 'offline-checkpoint', at, silent: true }));
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
