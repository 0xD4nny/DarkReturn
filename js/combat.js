function battleTrace(event, details = {}) {
  if (!window.DARK_RETURN_DEBUG_COMBAT) return;
  console.info(`[combat ${Math.round(performance.now())}ms] ${event}`, {
    mode: battle?.mode,
    wave: battle?.wave,
    enemyHp: battle?.enemyHp,
    displayEnemyHp: battle?.displayEnemyHp,
    pending: battle?.pending,
    between: battle?.between,
    hasTimer: Boolean(battle?.timer),
    hasVictoryTimer: Boolean(battle?.victoryTimer),
    ...details,
  });
}
function activeBattleClasses() { return battle?.partyClasses || [state.mainClass, state.activeCompanion].filter((className, index, all) => className && all.indexOf(className) === index); }
function battleStatsState() {
  if (!battle?.partyClasses) return state;
  return { ...state, activeCompanion: battle.partyClasses.find((owner) => owner !== state.mainClass) || null };
}
function initializeBattleParty(classNames = activeBattleClasses()) {
  const party = {};
  classNames.forEach((className) => { const max = Math.max(1, getStats(className)['Lebenskraft']); party[className] = { hp: max, max }; });
  return party;
}
function towerEnemyCount(round) {
  const encounter = Math.max(1, Number(round) || 1) % 10;
  return encounter === 0 || encounter === 5 ? 1 : 3;
}
function resetBattleEnemyPools(unitMaxHp, count = battle?.mode === 'tower' ? towerEnemyCount(battle.towerRound) : 3) {
  if (!battle || battle.mode === 'boss') return;
  const maxHp = Math.max(1, Math.ceil(Number(unitMaxHp) || 1));
  const enemyCount = Math.max(1, Math.floor(Number(count) || 3));
  battle.enemyUnitMax = maxHp;
  battle.enemyHealths = Array.from({ length: enemyCount }, () => ({ hp: maxHp, max: maxHp }));
  battle.displayEnemyHealths = Array.from({ length: enemyCount }, () => ({ hp: maxHp, max: maxHp }));
  battle.enemyFrozenUntil = [];
  battle.weaponWaveKillsRecorded = 0;
  battle.enemyBurns = [];
  battle.enemyPoisons = [];
  battle.enemyShadowEchoes = [];
  battle.enemyTimeRifts = [];
  battle.heartfallCycles = [];
  battle.enemyStunnedUntilCycles = [];
  battle.enemyMax = maxHp * enemyCount;
  battle.enemyHp = maxHp * enemyCount;
  battle.displayEnemyHp = maxHp * enemyCount;
}
function livingBattleEnemyIndexes() {
  if (!battle || battle.mode === 'boss') return battle ? [0] : [];
  if (!Array.isArray(battle.enemyHealths)) return [0, 1, 2];
  return battle.enemyHealths.flatMap((enemy, index) => enemy.hp > 0 ? [index] : []);
}
function syncBattleEnemyTotals() {
  if (!battle || battle.mode === 'boss' || !Array.isArray(battle.enemyHealths)) return;
  battle.enemyHp = battle.enemyHealths.reduce((sum, enemy) => sum + Math.max(0, enemy.hp), 0);
  battle.enemyMax = battle.enemyHealths.reduce((sum, enemy) => sum + enemy.max, 0);
  battle.displayEnemyHp = (battle.displayEnemyHealths || battle.enemyHealths).reduce((sum, enemy) => sum + Math.max(0, enemy.hp), 0);
}
function chooseBattleEnemyIndexes(className, areaEffect = false) {
  if (!battle) return [];
  if (battle.mode === 'boss') return [0];
  const living = livingBattleEnemyIndexes();
  if (areaEffect) return living;
  const party = activeBattleClasses();
  const partyIndex = party.indexOf(className);
  if (partyIndex < 0 || !living.length) return [];
  const laneIndex = Math.round(partyIndex * (living.length - 1) / Math.max(1, party.length - 1));
  return [living[laneIndex]];
}
function refreshBattleHealth() {
  if (!battle?.partyHealth) return;
  const fightState = battleStatsState();
  let changed = false;
  Object.entries(battle.partyHealth).forEach(([className, hero]) => {
    const maximum = Math.max(1, getStats(className, fightState)['Lebenskraft']);
    if (maximum === hero.max) return;
    const ratio = hero.max > 0 ? Math.min(1, Math.max(0, hero.hp / hero.max)) : 0;
    hero.max = maximum;
    hero.hp = maximum * ratio;
    changed = true;
  });
  if (changed) updateBattleUI();
}
function heroHealthPercent(className) {
  const hero = battle?.partyHealth?.[className];
  return hero ? Math.max(0, hero.hp / hero.max * 100) : 0;
}
function livingBattleClasses() { return activeBattleClasses().filter((className) => heroHealthPercent(className) > 0); }
function basicAttackIntervalTicks(className, fightState = battleStatsState()) {
  const speed = getStats(className, fightState)['Angriffsgeschwindigkeit'] || 100;
  const tiers = BALANCE.combat.attackSpeedTiers || [
    { minimumPercent: 200, intervalTicks: 1 },
    { minimumPercent: 166, intervalTicks: 2 },
    { minimumPercent: 133, intervalTicks: 3 },
    { minimumPercent: 0, intervalTicks: 4 },
  ];
  return tiers.find((tier) => speed >= tier.minimumPercent)?.intervalTicks || 4;
}
function isBattleClassAlive(className) {
  return Boolean(battle?.partyHealth?.[className] && battle.partyHealth[className].hp > 0);
}
function enemyTargetCandidates() {
  const living = livingBattleClasses();
  if (living.includes('healer')) {
    const effects = passiveEffectsFor('healer', battleStatsState());
    if (effects.some(effect => effect.type === 'taunt' && effect.scope === 'self')) return ['healer'];
  }
  const hasFrontliner = living.some((className) => ['warrior', 'healer'].includes(className));
  if (!hasFrontliner) return living;
  const protectedBackliners = new Set(['hunter', 'mage']);
  return living.filter((className) => !protectedBackliners.has(className));
}
function chooseEnemyFocusTarget() {
  return choose(enemyTargetCandidates()) || choose(livingBattleClasses());
}
function healBattleParty(percent) {
  return healBattlePartyAmount((hero) => hero.max * percent / 100);
}
function healBattlePartyAmount(amountForHero) {
  const restoredByClass = {};
  Object.entries(battle?.partyHealth || {}).forEach(([className, hero]) => {
    if (hero.hp <= 0) { restoredByClass[className] = 0; return; }
    const previousHp = hero.hp;
    hero.hp = Math.min(hero.max, hero.hp + Math.max(0, amountForHero(hero, className)));
    restoredByClass[className] = Math.round(hero.hp - previousHp);
  });
  return restoredByClass;
}
function showBattleHealing(restoredByClass, skillGlow = false) {
  Object.entries(restoredByClass || {}).forEach(([className, amount]) => {
    if (amount <= 0) return;
    damageNumber(className, amount, 'heal');
    if (!skillGlow) return;
    const card = document.querySelector(`#battle-overlay .battle-party [data-hero="${className}"]`);
    if (!card) return;
    card.querySelector('.battle-heal-glow')?.remove();
    const glow = document.createElement('span');
    glow.className = 'battle-heal-glow';
    glow.setAttribute('aria-hidden', 'true');
    card.append(glow);
    window.setTimeout(() => glow.remove(), 1100);
  });
}
let battleStartPending = false;
async function startBattle(mode, areaId, options = {}) {
  if (battle || battleStartPending || saveMaintenance || saveBlocked) return;
  const destination = mode === 'area' ? AREAS.find((area) => area.id === areaId) : null;
  const destinationIndex = destination ? AREAS.indexOf(destination) : -1;
  const deepTier = mode === 'area' ? Math.max(0, Math.min(Number(state.deepOfDark?.tier) || 0, options.deepTier ?? selectedDeepTier ?? (Number(state.deepOfDark?.tier) || 0))) : 0;
  const isHistoricalTier = deepTier < (Number(state.deepOfDark?.tier) || 0);
  if (mode === 'area' && (!destination || (!isHistoricalTier && !areaUnlocked(state, destinationIndex)))) { toastMessageFor('Gebiet versiegelt', destination ? `Bezwinge zuerst das vorherige Gebiet in diesem Durchlauf.` : 'Dieses Gebiet ist nicht bekannt.'); return; }
  if (mode === 'area') {
    battleStartPending = true;
    try {
      const result = await performAction({ action: 'offline-start', area: areaId, deepTier, silent: true });
      if (!result) return;
    } finally { battleStartPending = false; }
    if (battle) return;
    offlineFarmSuspended = document.hidden;
  }
  if (mode === 'tower') {
    battleStartPending = true;
    try {
      const result = await performAction({ action: options.resume ? 'offline-resume-tower' : 'tower-start', silent: Boolean(options.resume) });
      if (!result) return;
    } finally { battleStartPending = false; }
    if (battle) return;
  }
  if (mode === 'tower') offlineFarmSuspended = document.hidden;
  const towerRound = mode === 'tower' ? (options.resume ? state.offlineFarm.round : 1) : null;
  const autoSkillsEnabledByDefault = state.settings?.autoSkillsDefault !== false;
  const defaultAutoSkills = Object.fromEntries(activeBattleClasses().map((className) => [className, autoSkillsEnabledByDefault]));
  const partyClasses = [state.mainClass, state.activeCompanion].filter((className, index, all) => className && all.indexOf(className) === index);
  battle = { mode, areaId, deepTier, towerRound, auto: true, visible: options.visible !== false, partyClasses, partyHealth: initializeBattleParty(partyClasses), damageByClass: Object.fromEntries(partyClasses.map((className) => [className, 0])), enemyHp: 100, enemyMax: 100, displayEnemyHp: 100, cycle: 0, hits: {}, timer: null, wave: 0, pending: false, enemiesKilled: 0, soulsEarned: 0, deaths: 0, highestHit: 0, statsDamageRecorded: 0, statsDeathsRecorded: 0, vulnerableUntil: 0, skillReadyAt: {}, autoSkills: defaultAutoSkills, guardEffects: [] };
  if (mode === 'tower' && options.resume) applyOfflineTowerHealth(battle);
  resetBattleEnemyPools(100);
  beginBattleWave();
}
async function startBossBattle() {
  if (battle || battleStartPending || saveMaintenance || saveBlocked) return;
  battleStartPending = true;
  let result;
  try { result = await performAction({ action: 'boss-start' }); }
  finally { battleStartPending = false; }
  if (!result || battle) return;
  const autoSkillsEnabledByDefault = state.settings?.autoSkillsDefault !== false;
  const defaultAutoSkills = Object.fromEntries(activeBattleClasses().map((className) => [className, autoSkillsEnabledByDefault]));
  const partyClasses = [state.mainClass, state.activeCompanion].filter((className, index, all) => className && all.indexOf(className) === index);
  const now = performance.now();
  const rules = BALANCE.bossChallenge;
  battle = {
    mode: 'boss', areaId: 'mondbruch', auto: true, visible: true, partyClasses,
    teamHp: 100, partyHealth: initializeBattleParty(partyClasses), damageByClass: Object.fromEntries(partyClasses.map((className) => [className, 0])), enemyHp: 1, enemyMax: 1, enemyDamage: 0, enemyName: 'Schatten der Dunkelheit', enemyIcon: '♟',
    cycle: 0, hits: {}, timer: null, wave: 1,
    roundDamageByClass: Object.fromEntries(partyClasses.map((className) => [className, 0])),
    pending: false, enemiesKilled: 0, soulsEarned: 0, deaths: 0, highestHit: 0, statsDamageRecorded: 0, statsDeathsRecorded: 0, bossDamage: 0, bossReward: 0,
    bossStartedAt: now, bossEndsAt: now + rules.durationSeconds * 1000, bossAttemptAt: result.startedAt,
    vulnerableUntil: 0, skillReadyAt: {}, autoSkills: defaultAutoSkills, guardEffects: [],
    bossDamageGoal: Math.round((BALANCE.combat.partyPowerBase + partyLevel(state) * BALANCE.combat.partyPowerPerLevel) * 80),
  };
  renderBattleOverlay();
  scheduleBattleTick(0);
}
function scheduleBattleTick(delay = BALANCE.combat.tickMilliseconds) {
  if (!battle || (['area', 'tower'].includes(battle.mode) && offlineFarmSuspended)) return;
  const current = battle;
  const untilBossEnd = battle.mode === 'boss' ? Math.max(0, battle.bossEndsAt - performance.now()) : Infinity;
  // Never catch up missed ticks with zero-delay ticks. A slow render or tab
  // switch must not turn one delayed beat into several attacks in a burst.
  current.timer = window.setTimeout(() => {
    if (battle !== current) return;
    current.timer = null;
    runBattleTickSafely();
  }, Math.min(delay, untilBossEnd));
}
function queueBattleVictory(current = battle) {
  if (!current || (['area', 'tower'].includes(current.mode) && offlineFarmSuspended) || current.mode === 'boss' || current.enemyHp > 0 || current.victoryTimer || current.pending || current.finishing || current.between || current.finishedWave === current.wave) return;
  battleTrace('Sieg vorgemerkt');
  current.victoryTimer = window.setTimeout(() => {
    current.victoryTimer = null;
    battleTrace('Sieg-Timer ausgelöst', { sameBattle: battle === current });
    if (battle === current && !current.pending) finishBattle(true);
  }, 650);
}
function advanceBattleAfterVictory(current) {
  if (battle !== current || (['area', 'tower'].includes(current.mode) && offlineFarmSuspended)) return;
  battleTrace('Übergangstimer ausgelöst');
  current.timer = null;
  if (current.stopAfterCurrent) {
    battle = null;
    document.querySelector('#battle-overlay')?.remove();
    updateBattleDock();
    finishBattleActivity(current, 'Nach dem letzten Sieg manuell beendet.');
    return;
  }
  if (current.recoveryUntil) {
    if (performance.now() < current.recoveryUntil) {
      scheduleBattleAdvance(current, 0);
      return;
    }
    refreshBattleHealth();
    Object.values(current.partyHealth || {}).forEach(hero => { hero.hp = hero.max; });
    current.recoveryUntil = 0;
  }
  current.between = false;
  current.pending = false;
  current.finishing = false;
  current.pendingAt = 0;
  beginBattleWave();
}
function scheduleBattleAdvance(current, delay = 1300) {
  if (battle !== current || !current.between || current.timer || (['area', 'tower'].includes(current.mode) && offlineFarmSuspended)) return;
  const recoveryRemaining = Math.max(0, (current.recoveryUntil || 0) - performance.now());
  current.timer = window.setTimeout(() => advanceBattleAfterVictory(current), Math.max(delay, recoveryRemaining));
}
function battleRecoveryLabel(current = battle) {
  return `ERHOLUNG · ${Math.max(0, Math.ceil(((current?.recoveryUntil || 0) - performance.now()) / 1000))} s`;
}
function updateBattleRecoveryNotice(overlay) {
  const seconds = Math.max(0, Math.ceil(((battle?.recoveryUntil || 0) - performance.now()) / 1000));
  let notice = overlay.querySelector('[data-battle-recovery-notice]');
  if (!battle?.visible || !seconds) {
    notice?.remove();
    return;
  }
  if (!notice) {
    const scene = overlay.querySelector('.battle-scene');
    if (!scene) return;
    notice = document.createElement('div');
    notice.className = 'battle-recovery-notice';
    notice.dataset.battleRecoveryNotice = '';
    notice.setAttribute('role', 'status');
    notice.innerHTML = '<strong>Deine Gruppe wurde besiegt</strong><span>Die Helden erholen sich. Der Kampf startet automatisch weiter.</span><b data-recovery-countdown aria-live="off"></b>';
    scene.append(notice);
  }
  const text = `Nächster Kampf in ${seconds} ${seconds === 1 ? 'Sekunde' : 'Sekunden'}.`;
  const countdown = notice.querySelector('[data-recovery-countdown]');
  if (countdown.textContent !== text) countdown.textContent = text;
}
async function runBattleTickSafely() {
  const current = battle;
  if (!current || (['area', 'tower'].includes(current.mode) && offlineFarmSuspended)) return;
  try {
    await battleTick();
  } catch (error) {
    console.error('Kampftick fehlgeschlagen:', error);
    if (battle !== current || current.pending || current.between) return;
    if (current.mode !== 'boss' && current.enemyHp <= 0) { queueBattleVictory(current); return; }
    if (current.mode !== 'boss' && !livingBattleClasses().length) {
      await finishBattle(false);
      return;
    }
    scheduleBattleTick(BALANCE.combat.tickMilliseconds);
  }
}
function beginBattleWave() {
  const current = battle;
  if (!current) return;
  if (['area', 'tower'].includes(current.mode)) current.offlineWave = { signature: offlineFarmSignature(state), startedAt: performance.now(), damageRate: offlineDamageRate(state), manual: false, partyHealth: Object.fromEntries(Object.entries(current.partyHealth).map(([owner, hero]) => [owner, hero.hp / hero.max])) };
  current.roundDamageByClass = Object.fromEntries(activeBattleClasses().map((className) => [className, 0]));
  current.roundHeartfallDamage = 0;
  current.roundDamageTakenByClass = {};
  current.heartfallCycles = [];
  current.enemyShadowEchoes = [];
  current.enemyTimeRifts = [];
  current.pending = false;
  current.finishing = false;
  current.pendingAt = 0;
  try {
    prepareBattleWave();
  } catch (error) {
    battleTrace('Fehler beim Vorbereiten der Welle', { message: String(error) });
    console.error('Kampfdurchgang konnte nicht vorbereitet werden:', error);
    if (battle !== current) return;
    current.wave += 1;
    current.cycle = 0;
    current.enemyName ||= 'Aschenstreuner';
    resetBattleEnemyPools(Math.max(100, Number(current.enemyUnitMax) || 100));
    current.enemyDamage = Math.max(1, Number(current.enemyDamage) || 1);
    current.vulnerableUntil = 0;
    current.between = false;
    current.timer = null;
    try {
      if (current.visible) renderBattleOverlay();
      else updateBattleDock();
    } catch (renderError) {
      console.error('Ersatz-Kampfszene konnte nicht angezeigt werden:', renderError);
    }
    scheduleBattleTick();
  }
}
function prepareBattleWave() {
  if (!battle) return;
  battle.between = false;
  const round = battle.mode === 'tower' ? battle.towerRound : 0;
  const nextWave = battle.wave + 1;
  const area = AREAS.find((entry) => entry.id === battle.areaId);
  const combatRules = BALANCE.combat;
  const towerStats = battle.mode === 'tower' ? towerEncounterStats(state, round) : null;
  const towerGuardian = battle.mode === 'tower' && round % 10 === 0;
  const towerChampion = battle.mode === 'tower' && round % 10 === 5;
  const baseEnemy = battle.mode === 'tower'
    ? { name: 'Turmwächter', hp: towerStats.health, damage: towerStats.damage, icon: '♟', skill: { attackInterval: combatRules.towerSkillAttackInterval, multiplier: combatRules.towerSkillMultiplier, name: 'Turmschlag' } }
    : { ...ENEMIES[battle.areaId], skill: ENEMY_SKILLS[battle.areaId] };
  const deepTier = battle.mode === 'area' ? Math.max(0, Number(battle.deepTier) || 0) : 0;
  const scaledEnemy = battle.mode === 'area'
    ? {
      ...baseEnemy,
      hp: areaEnemyBaseHealth(battle.areaId, deepTier),
      damage: areaEnemyBaseDamage(battle.areaId, deepTier),
    }
    : baseEnemy;
  if (battle.mode === 'tower') {
    scaledEnemy.name = towerGuardian ? 'Archont der Ketten' : 'Aschenstreuner';
    if (towerGuardian) scaledEnemy.skill = { ...scaledEnemy.skill, name: 'Kettenurteil' };
    scaledEnemy.icon = towerGuardian ? '♟' : '✹';
  }
  battle.towerGuardian = towerGuardian;
  battle.elite = battle.mode === 'tower' ? towerChampion : nextWave % BALANCE.loot.eliteEveryEncounters === 0;
  const enemy = battle.elite
    ? { ...scaledEnemy, name: `Champion · ${scaledEnemy.name}`, hp: Math.round(scaledEnemy.hp * BALANCE.loot.eliteHealthMultiplier), damage: Math.ceil(scaledEnemy.damage * BALANCE.loot.eliteDamageMultiplier), icon: '✹' }
    : scaledEnemy;
  battle.cycle = 0;
  battle.enemyName = enemy.name;
  battle.enemyIcon = enemy.icon;
  const oneEnemyEncounter = battle.mode === 'tower' && (towerGuardian || towerChampion);
  const areaLevelHealthBonus = battle.mode === 'area'
    ? Math.max(0, partyLevel(state) - area.level) * BALANCE.combat.enemyHealthPerLevelAboveRecommended
    : 0;
  const enemyUnitMax = battle.mode === 'tower'
    ? enemy.hp * (oneEnemyEncounter ? 3 : 1) * (towerGuardian ? 10 : 1)
    : Math.round(enemy.hp + areaLevelHealthBonus);
  resetBattleEnemyPools(enemyUnitMax, battle.mode === 'tower' ? towerEnemyCount(round) : 3);
  battle.huntingEventId = state.huntingEvent?.id;
  battle.huntWaveKillsRecorded = 0;
  battle.victoryTimer = null;
  battle.vulnerableUntil = 0;
  battle.enemyDamage = enemy.damage;
  battle.enemySkill = enemy.skill;
  battle.enemySkillUsed = false;
  battle.enemyAttackCount = 0;
  battle.focusTarget = chooseEnemyFocusTarget();
  battle.wave = nextWave;
  battleTrace('Welle vorbereitet', { enemyName: battle.enemyName, enemyUnitMax: battle.enemyUnitMax, enemyMax: battle.enemyMax });
  // Keep a fallback tick alive even if scene rendering fails during a wave change.
  scheduleBattleTick();
  try {
    if (battle.visible) renderBattleOverlay();
    else updateBattleDock();
    window.clearTimeout(battle.timer);
    scheduleBattleTick(0);
  } catch (error) {
    console.error('Kampfszene konnte nicht aktualisiert werden:', error);
  }
}
function renderBattleSkillControl(className) {
  const skills = COMPANION_SKILLS[className]?.active;
  if (!skills?.length) return '';
  const skill = skills[state.companions[className].activeSkillIndex];
  const name = skill.name;
  const auto = Boolean(battle.autoSkills[className]);
  return `<div class="battle-hero-skill"><div class="battle-skill" data-battle-skill="${className}"><span class="battle-skill-mark">✦</span><div class="battle-skill-copy"><strong>${escapeHtml(name)}</strong><small data-skill-cooldown="${className}">Bereit</small></div><button type="button" class="battle-skill-cast ui-control ui-button ui-compact" data-cast-skill="${className}" aria-label="${escapeHtml(name)} jetzt einsetzen">EINSATZ</button><button type="button" class="battle-skill-auto ui-control ui-button ui-compact ${auto ? 'is-armed' : ''}" data-toggle-auto-skill="${className}" aria-pressed="${auto}" aria-label="Auto-Fähigkeit ${auto ? 'ausschalten' : 'einschalten'}" title="Auto-Fähigkeit ${auto ? 'ausschalten' : 'einschalten'}">Auto</button></div></div>`;
}
function renderBattleOverlay() {
  document.querySelector('#battle-overlay')?.remove();
  const area = AREAS.find((entry) => entry.id === battle.areaId);
  const partyLineup = activeBattleClasses();
  const heroes = partyLineup.map((className) => {
    const info = CLASSES[className];
    const health = battle.partyHealth?.[className];
    const percent = health ? Math.max(0, health.hp / health.max * 100) : 100;
    return `<article class="battle-hero ${className === state.mainClass ? 'is-main' : 'is-companion'}" data-hero="${className}"><div class="battle-hero-overview"><div class="battle-hero-name">${info.label}<b>${className === state.mainClass ? 'MAIN' : 'GEFÄHRTE'}</b></div><div class="battle-hero-damage"><small>GESAMTSCHADEN</small><strong data-hero-damage="${className}">${damageDisplayNumber(battle.roundDamageByClass?.[className] || 0)}</strong></div></div><div class="battle-hero-vitality"><div class="battle-hero-hp"><i data-hero-hp-fill="${className}" style="width:${percent}%"></i></div><small class="battle-hero-hp-label" data-hero-hp-label="${className}">${number(Math.ceil(health?.hp || 0))} / ${number(health?.max || 0)} LP</small></div>${renderBattleSkillControl(className)}</article>`;
  }).join('');
  const enemyCount = battle.mode === 'boss' ? 1 : Math.max(1, battle.displayEnemyHealths?.length || battle.enemyHealths?.length || 3);
  const enemies = Array.from({ length: enemyCount }, (_, index) => {
    const health = battle.displayEnemyHealths?.[index] || battle.enemyHealths?.[index];
    const status = battle.mode === 'boss' ? '' : `<div class="battle-unit-info"><strong>${escapeHtml(battle.enemyName)}</strong><small data-enemy-hp-label="${index}">${number(Math.ceil(health?.hp || 0))} / ${number(health?.max || 0)} LP</small></div><span class="battle-unit-hp"><i data-enemy-hp-fill="${index}"></i></span>`;
    return `<div class="battle-enemy" data-enemy="${index}">${battleEnemyFigure(battle.areaId, index)}${status}</div>`;
  }).join('');
  const enemyDisplayName = battle.areaId === 'dornwacht' && battle.mode === 'area' ? `3 × ${battle.enemyName}` : battle.enemyName;
  const hasFrontEnemyScene = battle.mode !== 'boss';
  preloadIceProjectile();
  preloadMagicProjectile();
  if (battle.mode === 'area' || battle.mode === 'tower') preloadFrontEnemyFrames(battleEnemySpriteActor());
  document.body.insertAdjacentHTML('beforeend', `<div class="battle-overlay" id="battle-overlay"><section class="battle-window ${battle.elite ? 'is-elite' : ''} ${battle.mode === 'area' ? `scene-${battle.areaId}` : 'scene-tower'}"><header class="battle-header"><div><p class="eyebrow">${battle.mode === 'tower' ? 'TURM DER NAMENLOSEN · ENDLOS' : `${escapeHtml(area?.biome || 'GRENZLANDE')} · GEBIET BETRETEN`}</p><h2>${battle.mode === 'tower' ? 'Der endlose Aufstieg' : escapeHtml(area?.name || 'Grenzgebiet')}</h2>${['area', 'tower'].includes(battle.mode) ? `<small data-offline-farm-status>${escapeHtml(offlineFarmStatus())}</small>` : ''}</div><div class="battle-header-actions"><div class="battle-wave-pill">${battle.mode === 'tower' ? `RUNDE ${battle.towerRound}${battle.elite ? ' · CHAMPION' : battle.towerGuardian ? ' · BOSS' : ''}` : battle.elite ? 'CHAMPION' : `DURCHGANG ${battle.wave}`}</div><button type="button" class="battle-hide ui-control ui-button" data-hide-battle aria-label="Kampf minimieren">MINIMIEREN</button><button type="button" class="battle-stop ui-control ui-button" data-stop-battle>KAMPF ABBRECHEN <span>×</span></button></div></header><div class="battle-scene ${battle.mode === 'area' ? 'has-raster-art has-front-enemies' : ''} ${battle.mode === 'boss' ? 'has-front-boss' : ''}" data-area="${escapeHtml(battle.areaId || 'tower')}">${battleLandscape(battle.areaId)}<div class="scene-haze haze-one"></div><div class="scene-haze haze-two"></div><div class="battle-party">${heroes}</div><div class="battle-enemy-wrap"><div class="battle-enemy-pack">${enemies}</div>${battle.mode === 'boss' ? `<strong id="battle-enemy-name">${escapeHtml(enemyDisplayName)}</strong><div class="enemy-hp"><i id="enemy-hp-fill"></i></div><small id="enemy-hp-label"></small>` : ''}<small id="battle-vulnerable-state" class="battle-vulnerable-state" hidden></small></div><span class="battle-sigil">${battle.mode === 'tower' ? '∞' : assetIconMarkup(area?.asset, area?.icon || '✦', 'battle-sigil-image')}</span></div><div class="battle-team-health"><span>GRUPPENHALT</span><div class="team-hp"><i id="team-hp-fill"></i></div><strong id="team-hp-label">100%</strong></div></section></div>`);
  if (hasFrontEnemyScene) document.querySelector('#battle-overlay .battle-scene')?.classList.add('has-raster-art', 'has-front-enemies');
  const sceneElement = document.querySelector('#battle-overlay .battle-scene');
  if (battle.mode === 'tower' && battle.towerGuardian) sceneElement?.classList.add('has-tower-archon');
  const partyElement = sceneElement?.querySelector('.battle-party');
  const statusAnchor = sceneElement?.nextElementSibling?.classList.contains('battle-team-health') ? sceneElement.nextElementSibling : sceneElement;
  if (partyElement && statusAnchor) statusAnchor.after(partyElement);
  if (battle.mode === 'boss') {
    const landscape = document.querySelector('#battle-overlay .battle-landscape');
    const source = new URL('Assets/Art/battle/regions/shadow-of-darkness-arena.png', document.baseURI).href;
    if (landscape) landscape.outerHTML = `<img class="battle-landscape battle-landscape-image battle-landscape-boss" src="${source}" alt="" draggable="false">`;
  }
  if (battle.mode !== 'boss') document.querySelector('#battle-overlay .battle-team-health')?.remove();
  if (battle.mode === 'boss') {
    const windowElement = document.querySelector('.battle-window');
    windowElement.classList.remove('scene-tower');
    windowElement.classList.add('scene-boss');
    windowElement.querySelector('.battle-header .eyebrow').textContent = 'BOSSARENA · ZEITANGRIFF';
    windowElement.querySelector('.battle-header h2').textContent = 'Schatten der Dunkelheit';
    windowElement.querySelectorAll('.battle-enemy[data-enemy]:not([data-enemy="0"])').forEach((enemy) => enemy.remove());
    const timeBar = windowElement.querySelector('.battle-team-health');
    timeBar.querySelector(':scope > span').textContent = 'ZEIT VERBLEIBEND';
    const progressBars = document.createElement('div');
    progressBars.className = 'battle-boss-progress';
    timeBar.before(progressBars);
    progressBars.append(timeBar);
    progressBars.insertAdjacentHTML('beforeend', renderBossRankProgress());
    if (battle.bossFinished) {
      windowElement.querySelector('.battle-header-actions').innerHTML = `<div class="battle-wave-pill">ANSTURM BEENDET</div><button type="button" class="primary-button ui-control ui-button boss-result-close" data-boss-close>ERGEBNIS SCHLIESSEN <span>×</span></button>`;
      windowElement.querySelectorAll('.battle-hero-skill').forEach((skillControl) => { skillControl.hidden = true; });
    }
  }
  if (hasFrontEnemyScene && battle.sceneEntryPlayedWave !== battle.wave) {
    playBattleEntrance();
    battle.sceneEntryPlayedWave = battle.wave;
  }
  if (battle.mode === 'boss' && !battle.bossFinished) setEnemyBattlePose('idle');
  updateBattleDock();
  updateBattleUI();
  document.querySelectorAll('#battle-overlay [data-battle-sprite="shardwing"][data-pose="idle"]').forEach((sprite) => {
    setBattleSpritePose(sprite, 'shardwing', 'idle');
  });
  syncMobileBattle();
}
function updateBattleDock() {
  const slot = document.querySelector('#battle-status-slot');
  if (!slot) return;
  if (!battle || battle.visible) {
    slot.hidden = true;
    slot.replaceChildren();
    return;
  }
  slot.hidden = false;
  const area = AREAS.find((entry) => entry.id === battle.areaId);
  const destination = battle.mode === 'tower' ? `Turm · Runde ${battle.towerRound}` : area?.name || 'Grenzgebiet';
  patchBackgroundMarkup(slot, `<button type="button" class="ui-control ui-graphic topbar-battle-return" id="battle-dock" data-show-battle aria-label="Zurück zum Kampf: ${escapeHtml(destination)}, Durchgang ${battle.wave}"><i class="battle-live-dot"></i><span class="battle-top-copy"><strong>FARM LÄUFT</strong><small>${escapeHtml(destination)} · Durchgang ${battle.wave}</small></span></button>`);
  if (battle.recoveryUntil) {
    const label = slot.querySelector('[data-show-battle] strong');
    if (label) label.textContent = battleRecoveryLabel();
  }
  if (battle.mode === 'boss') {
    const returnButton = slot.querySelector('[data-show-battle]');
    const stopButton = slot.querySelector('[data-stop-battle]');
    returnButton.querySelector('strong').textContent = battle.bossFinished ? 'BOSS BEENDET' : 'BOSSKAMPF LÄUFT';
    returnButton.querySelector('small').textContent = battle.bossFinished ? `${damageDisplayNumber(battle.bossDamage)} Schaden · +${number(battle.bossReward)} Seelen` : `Schatten der Dunkelheit · ${Math.max(0, ((battle.bossEndsAt - performance.now()) / 1000)).toFixed(0)} s`;
    returnButton.setAttribute('aria-label', battle.bossFinished ? 'Bosskampfergebnis öffnen' : 'Zum Bosskampf zurückkehren');
    if (battle.bossFinished && stopButton) {
      stopButton.removeAttribute('data-stop-battle');
      stopButton.setAttribute('data-boss-close', '');
      stopButton.setAttribute('aria-label', 'Ergebnis schließen');
      stopButton.title = 'Ergebnis schließen';
    }
  }
}
function hideBattle() {
  if (!battle) return;
  battle.visible = false;
  document.querySelector('#battle-overlay')?.remove();
  updateBattleDock();
}
function showBattle() {
  if (!battle) return;
  battle.visible = true;
  updateBattleDock();
  renderBattleOverlay();
}

function renderBossRankProgress() {
  return `<div class="battle-boss-rank" data-boss-rank-progress>
    <div class="battle-boss-rank-heading"><span data-boss-rank-badge></span><small data-boss-rank-current></small></div>
    <div class="boss-rank-meter" data-boss-rank-meter role="progressbar" aria-label="Fortschritt zum nächsten Bossrang" aria-valuemin="0" aria-valuemax="100" aria-valuenow="0"><i data-boss-rank-fill></i></div>
    <strong data-boss-rank-remaining></strong>
  </div>`;
}
function updateBossRankProgressUI(overlay, damage) {
  const panel = overlay.querySelector('[data-boss-rank-progress]');
  if (!panel) return;
  const rank = bossRankProgress(damage);
  const target = rank.nextRank || rank.currentRank;
  const color = bossRankColor(target);
  panel.style.setProperty('--boss-rank-color', color);
  const badge = panel.querySelector('[data-boss-rank-badge]');
  const targetName = target?.name || 'Noch kein Rang';
  if (badge.dataset.rank !== targetName) {
    badge.innerHTML = bossRankBadge(target);
    badge.dataset.rank = targetName;
  }
  panel.querySelector('[data-boss-rank-current]').textContent = `Aktuell: ${rank.currentRank?.name || 'Noch kein Rang'}`;
  const description = rank.nextRank ? `Noch ${number(rank.remaining)} Schaden bis ${rank.nextRank.name}` : 'Höchster Rang erreicht';
  panel.querySelector('[data-boss-rank-remaining]').textContent = description;
  panel.querySelector('[data-boss-rank-fill]').style.width = `${rank.progress}%`;
  const meter = panel.querySelector('[data-boss-rank-meter]');
  meter.setAttribute('aria-valuenow', String(rank.progress));
  meter.setAttribute('aria-valuetext', description);
}

function updateBattleUI() {
  const offlineLabel = document.querySelector('[data-offline-farm-status]');
  if (offlineLabel) offlineLabel.textContent = offlineFarmStatus();
  if (!battle) return;
  const overlay = document.querySelector('#battle-overlay');
  if (!overlay) return;
  updateBattleRecoveryNotice(overlay);
  const isBoss = battle.mode === 'boss';
  const remainingSeconds = isBoss ? Math.max(0, (battle.bossEndsAt - performance.now()) / 1000) : 0;
  const displayedEnemyHp = Math.max(0, battle.displayEnemyHp ?? battle.enemyHp);
  const enemyPercent = isBoss ? Math.min(100, battle.bossDamage / battle.bossDamageGoal * 100) : Math.max(0, displayedEnemyHp / battle.enemyMax * 100);
  const sharedHpFill = overlay.querySelector('#enemy-hp-fill');
  const sharedHpLabel = overlay.querySelector('#enemy-hp-label');
  if (sharedHpFill) sharedHpFill.style.width = `${enemyPercent}%`;
  if (sharedHpLabel && isBoss) sharedHpLabel.textContent = `${damageDisplayNumber(battle.bossDamage)} SCHADEN VERURSACHT`;
  if (!isBoss) {
    (battle.displayEnemyHealths || battle.enemyHealths || []).forEach((enemy, index) => {
      const fill = overlay.querySelector(`[data-enemy-hp-fill="${index}"]`);
      const healthLabel = overlay.querySelector(`[data-enemy-hp-label="${index}"]`);
      const actor = overlay.querySelector(`.battle-enemy[data-enemy="${index}"]`);
      if (fill) fill.style.width = `${Math.max(0, enemy.hp / enemy.max * 100)}%`;
      if (healthLabel) healthLabel.textContent = `${number(Math.max(0, Math.ceil(enemy.hp)))} / ${number(enemy.max)} LP`;
      if (actor) {
        const dead = enemy.hp <= 0;
        const frozen = !dead && (battle.enemyFrozenUntil?.[index] || 0) > performance.now();
        const wasDead = actor.classList.contains('is-dead');
        const wasFrozen = actor.classList.contains('is-frozen');
        actor.classList.toggle('is-dead', dead);
        actor.classList.toggle('is-frozen', frozen);
        if (dead && !wasDead) setBattleSpritePose(actor.querySelector('[data-battle-sprite]'), battleEnemySpriteActor(), 'defeated');
        else if (frozen && !wasFrozen) setBattleSpritePose(actor.querySelector('[data-battle-sprite]'), battleEnemySpriteActor(), 'frozen');
        else if (!dead && (wasDead || wasFrozen)) setBattleSpritePose(actor.querySelector('[data-battle-sprite]'), battleEnemySpriteActor(), 'idle');
      }
    });
  }
  overlay.querySelectorAll('.battle-enemy[data-enemy]').forEach((actor) => {
    const index = Number(actor.dataset.enemy);
    const alive = isBoss ? !battle.bossFinished : (battle.enemyHealths?.[index]?.hp ?? 0) > 0;
    actor.classList.toggle('is-vulnerable', alive && battle.vulnerableUntil > performance.now());
    const burning = battle.enemyBurns?.some((burn) => burn.targetIndex === index && burn.expiresAt > performance.now() && isBattleClassAlive(burn.owner));
    const poisoned = battle.enemyPoisons?.some((poison) => poison.targetIndex === index && poison.expiresAt > performance.now() && isBattleClassAlive(poison.owner));
    const isBurning = alive && burning;
    const isPoisoned = alive && poisoned;
    const wasBurning = actor.classList.contains('is-burning');
    const wasPoisoned = actor.classList.contains('is-poisoned');
    actor.classList.toggle('is-burning', isBurning);
    actor.classList.toggle('is-poisoned', isPoisoned);
    actor.classList.toggle('has-time-rift', alive && Boolean(battle.enemyTimeRifts?.some(rift => rift.targetIndex === index && rift.damage > 0 && isBattleClassAlive(rift.owner))));
    const enemySprite = actor.querySelector('[data-battle-sprite]');
    if ((isBurning !== wasBurning || isPoisoned !== wasPoisoned) && enemySprite?.dataset.pose === 'idle' && !actor.classList.contains('is-frozen')) {
      setBattleSpritePose(enemySprite, battleEnemySpriteActor(), 'idle');
    }
  });
  const vulnerableLabel = overlay.querySelector('#battle-vulnerable-state');
  const vulnerableRemaining = Math.max(0, (battle.vulnerableUntil - performance.now()) / 1000);
  if (vulnerableLabel) {
    vulnerableLabel.hidden = isBoss ? !battle.bossFinished : vulnerableRemaining <= 0;
    if (isBoss && battle.bossFinished) vulnerableLabel.textContent = `${damageDisplayNumber(battle.bossDamage)} SCHADEN · +${number(battle.bossReward)} SEELEN`;
    else if (vulnerableRemaining > 0) vulnerableLabel.textContent = `VERWUNDBAR · +${BALANCE.combat.vulnerabilityBaseDamagePercent} % SCHADEN · ${vulnerableRemaining.toFixed(1)} s`;
  }
  overlay.querySelector('.battle-window')?.classList.toggle('is-vulnerable', vulnerableRemaining > 0);
  if (isBoss) {
    overlay.querySelector('#team-hp-fill').style.width = `${Math.min(100, remainingSeconds / BALANCE.bossChallenge.durationSeconds * 100)}%`;
    overlay.querySelector('#team-hp-label').textContent = `${remainingSeconds.toFixed(1)} s`;
    updateBossRankProgressUI(overlay, battle.bossDamage);
  }
  Object.entries(battle.partyHealth || {}).forEach(([className, hero]) => {
    const percent = Math.max(0, hero.hp / hero.max * 100);
    const fill = overlay.querySelector(`[data-hero-hp-fill="${className}"]`);
    const label = overlay.querySelector(`[data-hero-hp-label="${className}"]`);
    if (fill) fill.style.width = `${percent}%`;
    if (label) label.textContent = `${number(Math.ceil(hero.hp))} / ${number(hero.max)} LP`;
    const damage = overlay.querySelector(`[data-hero-damage="${className}"]`);
    if (damage) damage.textContent = damageDisplayNumber(battle.roundDamageByClass?.[className] || 0);
    const actor = overlay.querySelector(`[data-hero="${className}"]`);
    if (actor) {
      const wasDead = actor.classList.contains('is-dead');
      actor.classList.toggle('is-dead', hero.hp <= 0);
      if (hero.hp <= 0 && !wasDead) setHeroBattlePose(className, 'defeated');
      else if (hero.hp > 0 && wasDead) setHeroBattlePose(className, 'idle');
    }
  });
  updateSkillControls(overlay);
  const wavePill = overlay.querySelector('.battle-wave-pill');
  if (wavePill) wavePill.textContent = battle.recoveryUntil ? battleRecoveryLabel() : isBoss ? battle.bossFinished ? 'BEENDET' : 'ZEITANGRIFF' : battle.towerGuardian ? 'TURMBOSS' : battle.elite ? 'CHAMPION' : `DURCHGANG ${battle.wave}`;
}
function updateSkillControls(overlay) {
  overlay.querySelectorAll('[data-battle-skill]').forEach((control) => {
    const className = control.dataset.battleSkill;
    const skill = COMPANION_SKILLS[className].active[state.companions[className].activeSkillIndex];
    const remaining = Math.max(0, (battle.skillReadyAt[skill.id] || 0) - performance.now());
    const cooldownLabel = remaining < 1000 ? `${Math.ceil(remaining)} ms` : `${formatRuleNumber(remaining / 1000)} s`;
    const needsHealing = Object.values(battle.partyHealth || {}).some((hero) => hero.hp > 0 && hero.hp < hero.max);
    const ready = remaining <= 0 && !battle.pending && !battle.finishing && !battle.between && !(skill.effect === 'heal' && !needsHealing);
    const status = control.querySelector('[data-skill-cooldown]');
    const castButton = control.querySelector('[data-cast-skill]');
    const autoButton = control.querySelector('[data-toggle-auto-skill]');
    if (status) status.textContent = battle.recoveryUntil ? battleRecoveryLabel() : remaining > 0 ? `Bereit in ${cooldownLabel}` : battle.bossFinished ? 'Abgeschlossen' : battle.pending || battle.finishing ? skill.effect === 'heal' ? 'Heilung wird ausgelöst' : 'Treffer wird aufgelöst' : 'Bereit';
    if (castButton) castButton.disabled = !ready;
    if (autoButton) {
      const armed = Boolean(battle.autoSkills[className]);
      autoButton.classList.toggle('is-armed', armed);
      autoButton.setAttribute('aria-pressed', String(armed));
      autoButton.setAttribute('aria-label', `Auto-Fähigkeit ${armed ? 'ausschalten' : 'einschalten'}`);
      autoButton.title = `Auto-Fähigkeit ${armed ? 'ausschalten' : 'einschalten'}`;
    }
  });
}
function activateCompanionSkill(className, automatic = false) {
  if (!battle || battle.pending || battle.finishing || battle.between || !isBattleClassAlive(className)) return false;
  const companion = state.companions[className];
  const skill = empoweredClassSkill(COMPANION_SKILLS[className]?.active?.[companion?.activeSkillIndex], className, battleStatsState());
  if (!companion || !skill) return false;
  const needsHealing = Object.values(battle.partyHealth || {}).some((hero) => hero.hp > 0 && hero.hp < hero.max);
  if (skill.effect === 'heal' && !needsHealing) return false;
  const now = performance.now();
  if ((battle.skillReadyAt[skill.id] || 0) > now) return false;
  const cooldownReduction = Math.min(75, Math.max(0, getStats(className, battleStatsState())['Abklingzeitreduktion'] || 0));
  battle.skillReadyAt[skill.id] = now + skill.cooldown * (1 - cooldownReduction / 100) * 1000;
  battle.basicAttackBlockedUntil ||= {};
  battle.basicAttackBlockedUntil[className] = now + BALANCE.combat.tickMilliseconds;
  if (skill.effect === 'heal') {
    setHeroBattlePose(className, 'heal', 760);
    const faithBonus = healerFaithScaling(getStats(className, battleStatsState()));
    const healingMultiplier = 1 + (activeArmorSetEffects(battleStatsState(), className).healingPercent || 0) / 100;
    const restored = healBattleParty(skill.healPercent * (1 + faithBonus / 100) * healingMultiplier);
    showBattleHealing(restored, true);
  } else if (skill.effect === 'unkillable') {
    const battleAtCast = battle;
    const duration = Math.max(0, Number(skill.durationSeconds) || 0);
    battle.invulnerableUntil ||= {};
    battle.invulnerableUntil[className] = now + duration * 1000;
    const hero = document.querySelector(`#battle-overlay [data-hero="${className}"]`);
    hero?.classList.add('is-invulnerable');
    window.setTimeout(() => {
      if (battle === battleAtCast && (battleAtCast.invulnerableUntil?.[className] || 0) <= performance.now()) {
        hero?.classList.remove('is-invulnerable');
      }
    }, duration * 1000);
  } else if (skill.effect === 'guard') {
    battle.guardEffects = (battle.guardEffects || []).filter((guard) => guard.expiresAt > now);
    battle.guardEffects.push({ expiresAt: now + skill.guardDuration * 1000, percent: Math.min(BALANCE.combat.damageReductionCapPercent ?? 75, skill.guardPercent * (className === 'healer' ? 1 + healerFaithScaling(getStats(className, battleStatsState())) / 100 : 1)) });
  } else {
    if (skill.effect === 'freeze-hit') {
      const [targetIndex] = chooseBattleEnemyIndexes(className);
      if (targetIndex != null) {
        const hitLanded = applyHeroHit(className, skill.damageMultiplier, skill.name, false, targetIndex, true, false, 'ice');
        const targetSurvives = battle.mode === 'boss' ? !battle.bossFinished : battle.enemyHealths?.[targetIndex]?.hp > 0;
        if (hitLanded && targetSurvives) {
          const battleAtCast = battle;
          window.setTimeout(() => {
            if (battle !== battleAtCast || battleAtCast.mode === 'boss' || (battleAtCast.enemyHealths?.[targetIndex]?.hp || 0) <= 0) return;
            battleAtCast.enemyFrozenUntil ||= [];
            battleAtCast.enemyFrozenUntil[targetIndex] = performance.now() + skill.freezeDuration * 1000;
            updateBattleUI();
          }, 250);
        }
      }
    } else if (skill.effect === 'burn-hit') {
      const [targetIndex] = chooseBattleEnemyIndexes(className);
      if (targetIndex != null) {
        const tickMultiplier = skill.damageMultiplier / skill.burnDuration;
        const hitLanded = applyHeroHit(className, tickMultiplier, skill.name, false, targetIndex, true, true);
        const targetSurvives = battle.mode === 'boss' ? !battle.bossFinished : battle.enemyHealths?.[targetIndex]?.hp > 0;
        if (hitLanded && targetSurvives) {
          battle.enemyBurns ||= [];
          refreshEnemyDamageOverTime(battle.enemyBurns, { owner: className, targetIndex, ticksRemaining: skill.burnDuration - 1, nextTickAt: now + 1000, expiresAt: now + skill.burnDuration * 1000, tickMultiplier, skillName: skill.name }, now, false);
        }
      }
    } else if (skill.effect === 'stun-hit') {
      const targets = chooseBattleEnemyIndexes(className, Boolean(skill.areaEffect));
      const until = battle.cycle + Math.ceil(skill.stunDuration * 1000 / BALANCE.combat.tickMilliseconds);
      battle.enemyStunnedUntilCycles ||= [];
      const hit = targets.length && applyHeroHit(className, skill.damageMultiplier, skill.name, Boolean(skill.areaEffect), skill.areaEffect ? null : targets[0], true, false, skill.projectileType || 'basic');
      if (hit) for (const targetIndex of targets) {
        battle.enemyStunnedUntilCycles[targetIndex] = Math.max(battle.enemyStunnedUntilCycles[targetIndex] || 0, until);
      }
    } else if (skill.effect === 'multi-hit') {
      const [targetIndex] = chooseBattleEnemyIndexes(className);
      const targetAlive = () => battle.mode === 'boss' ? !battle.bossFinished : battle.enemyHealths?.[targetIndex]?.hp > 0;
      for (let hit = 0; hit < skill.hitCount && targetIndex != null && targetAlive(); hit += 1) {
        applyHeroHit(className, skill.hitMultiplier, skill.name, false, targetIndex);
      }
    } else if (skill.effect === 'area-damage') {
      applyHeroHit(className, skill.damageMultiplier, skill.name, true);
    } else {
      applyHeroHit(className, skill.damageMultiplier, skill.name, false, null, true, false, skill.projectileType || 'basic');
    }
    if (skill.effect === 'vulnerable-hit' && battle.enemyHp > 0) {
      makeEnemyVulnerable(skill.vulnerableDuration, skill.name);
    }
  }
  if (!automatic) {
    updateBattleUI();
  }
  return true;
}
function damageNumber(className, amount, color = 'damage') {
  const hero = document.querySelector(`#battle-overlay .battle-party [data-hero="${className}"]`);
  if (!hero) return;
  if (color === 'heal' && !(amount > 0)) return;
  const float = document.createElement('span');
  float.className = `float-number ${color}`;
  float.textContent = color === 'heal' ? `+${number(amount)}` : color === 'immune' ? 'UNVERWUNDBAR' : color === 'dodge' ? 'AUSGEWICHEN' : `-${damageDisplayNumber(amount)}`;
  hero.append(float);
  float.setAttribute('aria-hidden', 'true');
  window.setTimeout(() => float.remove(), color === 'heal' ? 1200 : 950);
}
function animateEnemyAttack(className, damage, enemyIndex, invulnerable = false, dodged = false) {
  const hero = document.querySelector(`#battle-overlay [data-hero="${className}"]`);
  const target = document.querySelector(`#battle-overlay .battle-enemy[data-enemy="${enemyIndex}"]`);
  if (!hero || !target) return;
  const hasFrontImpact = (battle?.mode === 'area' && ['dornwacht', 'aschental', 'salzmoor', 'schwarze-kluft', 'glasforst', 'mondbruch'].includes(battle.areaId))
    || (battle?.mode === 'tower' && battle.towerGuardian);
  if (!hasFrontImpact) {
    setBattleSpritePose(target.querySelector('[data-battle-sprite]'), battleEnemySpriteActor(), 'attack', 460);
    if (invulnerable || dodged) {
      damageNumber(className, 0, dodged ? 'dodge' : 'immune');
      return;
    }
    hero.classList.remove('is-hit');
    void hero.offsetWidth;
    hero.classList.add('is-hit');
    window.setTimeout(() => hero.classList.remove('is-hit'), 420);
    setHeroBattlePose(className, 'hit', 440);
    damageNumber(className, damage, 'enemy-hit');
    return;
  }
  const impactDelay = 250;
  const battleAtAttack = battle;
  const waveAtAttack = battle?.wave;
  const enemySprite = target.querySelector('[data-battle-sprite]');
  target.classList.remove('is-attacking');
  void target.offsetWidth;
  target.classList.add('is-attacking');
  window.setTimeout(() => target.classList.remove('is-attacking'), 460);
  setBattleSpritePose(enemySprite, battleEnemySpriteActor(), 'attack', 460);
  window.setTimeout(() => {
    if (!hero.isConnected || battle !== battleAtAttack || battleAtAttack.wave !== waveAtAttack || !isBattleClassAlive(className)) return;
    if (invulnerable || dodged) {
      damageNumber(className, 0, dodged ? 'dodge' : 'immune');
      return;
    }
    hero.classList.remove('is-hit');
    void hero.offsetWidth;
    hero.classList.add('is-hit');
    window.setTimeout(() => hero.classList.remove('is-hit'), 420);
    setHeroBattlePose(className, 'hit', 440);
    damageNumber(className, damage, 'enemy-hit');
  }, impactDelay);
}
function battleAttackImpactDelay(className, areaEffect = false, damageOverTime = false, projectileType = 'basic') {
  if (areaEffect && className === 'healer') return 640;
  if (projectileType === 'stones') return 430;
  if (className === 'hunter') return 420;
  if (className === 'mage' && damageOverTime) return 320;
  return 250;
}
function queueBattleHitImpact(amount, indexes, delay, hitFlags) {
  const current = battle;
  const wave = current?.wave;
  if (!current) return;
  const resolveImpact = () => {
    if (battle !== current || current.wave !== wave) return;
    // Advance display HP even without a scene or when rendering an effect fails.
    if (current.mode !== 'boss') {
      indexes.forEach((index) => {
        const pool = current.displayEnemyHealths?.[index];
        if (pool) pool.hp = Math.max(0, pool.hp - amount);
      });
      syncBattleEnemyTotals();
    }
    try {
      indexes.forEach((index) => {
        const target = document.querySelector(`#battle-overlay .battle-enemy[data-enemy="${index}"]`);
        if (hitFlags.hitCount === 0) enemyMissNumber(target, hitFlags);
        else enemyDamageNumber(amount, target, hitFlags);
      });
      updateBattleUI();
    } catch (error) {
      console.error('Kampftreffer konnte nicht angezeigt werden:', error);
    }
  };
  if (delay > 0) window.setTimeout(resolveImpact, delay);
  else resolveImpact();
}
const battleDamageNumberPositions = new WeakMap();
function positionBattleDamageNumber(float, enemy) {
  // The animation already centers each number; a second CSS translate shifts it twice.
  float.style.translate = 'none';
  const width = Math.min(36, Math.max(12, enemy.getBoundingClientRect().width * 0.22));
  const previous = battleDamageNumberPositions.get(enemy);
  let x;
  let y;
  for (let attempt = 0; attempt < 8; attempt++) {
    x = (Math.random() * 2 - 1) * width;
    y = (Math.random() * 2 - 1) * 14;
    if (!previous || Math.hypot(x - previous.x, y - previous.y) >= 24) break;
  }
  if (previous && Math.hypot(x - previous.x, y - previous.y) < 24) {
    x = previous.x > 0 ? -width : width;
    y = previous.y > 0 ? -14 : 14;
  }
  battleDamageNumberPositions.set(enemy, { x, y });
  float.style.marginLeft = `${x}px`;
  float.style.marginTop = `${y}px`;
  float.setAttribute('aria-hidden', 'true');
}
function enemyDamageNumber(amount, target = closestBattleEnemy(document.querySelector('#battle-overlay [data-hero]')), hitFlags = {}) {
  if (!battle) return;
  const enemy = target || document.querySelector('.battle-enemy-wrap');
  if (enemy) {
    const sprite = enemy.querySelector('[data-battle-sprite]');
    const spriteActor = battleEnemySpriteActor();
    setBattleSpritePose(sprite, spriteActor, 'hit', 390);
    const float = document.createElement('span');
    float.className = `enemy-float-number damage${hitFlags.critical ? ' is-critical' : ''}${hitFlags.vulnerable ? ' is-vulnerable-hit' : ''}${hitFlags.shadowEcho ? ' is-shadow-echo' : ''}${hitFlags.heartfall ? ' is-heartfall' : ''}${hitFlags.timeRift ? ' is-time-rift' : ''}`;
    const allCritical = hitFlags.critical && (hitFlags.criticalCount == null || hitFlags.criticalCount === hitFlags.hitCount);
    float.textContent = `${allCritical ? 'KRIT! ' : ''}-${damageDisplayNumber(amount)}`;
    if (hitFlags.hitCount > 1) {
      const count = document.createElement('small');
      count.className = 'damage-hit-count';
      count.textContent = `×${hitFlags.hitCount}`;
      float.append(count);
    }
    float.title = `${hitFlags.shadowEcho ? 'Schattennachhall · ' : ''}${hitFlags.heartfall ? 'Herzverfall · ' : ''}${hitFlags.timeRift ? 'Zeitriss · ' : ''}${hitFlags.hitCount || 1} Treffer · ${hitFlags.criticalCount || 0} kritisch${hitFlags.missCount ? ` · ${hitFlags.missCount} verfehlt` : ''} · Gesamtschaden ${number(amount)}`;
    positionBattleDamageNumber(float, enemy);
    enemy.append(float);
    window.setTimeout(() => float.remove(), hitFlags.critical ? 2800 : 2500);
  }
}
function enemyMissNumber(target = closestBattleEnemy(document.querySelector('#battle-overlay [data-hero]')), hitFlags = {}) {
  const enemy = target || document.querySelector('.battle-enemy-wrap');
  if (!enemy) return;
  const float = document.createElement('span');
  float.className = 'enemy-float-number miss';
  float.textContent = 'MISS';
  if (hitFlags.missCount > 1) float.textContent += ` ×${hitFlags.missCount}`;
  positionBattleDamageNumber(float, enemy);
  enemy.append(float);
  window.setTimeout(() => float.remove(), 950);
}
function makeEnemyVulnerable(durationSeconds, source) {
  if (!battle || battle.enemyHp <= 0) return;
  battle.vulnerableUntil = Math.max(battle.vulnerableUntil || 0, performance.now() + durationSeconds * 1000);
}
// Defense and active protection share one total cap; maximum HP is not resistance.
function battleDamageReduction(defense, guards = [], setReduction = 0, now = performance.now(), { uncapped = false, className = null, sourceState = state } = {}) {
  const baseCap = Math.max(0, Math.min(1, (BALANCE.combat.damageReductionCapPercent ?? 75) / 100));
  const cap = Math.max(0, Math.min(1, damageReductionCapPercent(className, sourceState) / 100));
  if (!cap) return 0;
  const armor = Math.max(0, Number(defense) || 0);
  const defenseAtCap = Math.max(1, Number(BALANCE.combat.defenseForDamageReductionCap) || 100000);
  const armorScale = defenseAtCap * (1 - baseCap) / baseCap;
  const armorReduction = armor > 0 ? armor / (armor + armorScale) : 0;
  const protection = (guards || []).filter(guard => guard.expiresAt > now)
    .reduce((remaining, guard) => remaining * (1 - Math.max(0, Math.min(100, Number(guard.percent) || 0)) / 100), 1);
  const setProtection = Math.max(0, Math.min(1, Number(setReduction) || 0));
  const reduction = 1 - (1 - armorReduction) * protection * (1 - setProtection);
  return uncapped ? reduction : Math.min(cap, reduction);
}
function applyHeroHit(className, skillMultiplier = 1, skillName = '', areaEffect = false, targetOverride = null, showAttackAnimation = true, damageOverTime = false, projectileType = 'basic') {
  if (!battle || battle.pending || battle.finishing || battle.enemyHp <= 0 || !isBattleClassAlive(className)) return false;
  if (!skillName && !damageOverTime && performance.now() < (battle.basicAttackBlockedUntil?.[className] || 0)) return false;
  const targets = targetOverride == null ? chooseBattleEnemyIndexes(className, areaEffect)
    : (livingBattleEnemyIndexes().includes(targetOverride) ? [targetOverride] : []);
  if (!targets.length) return false;
  const chance = extraAttackChanceFor(className, battleStatsState());
  const remainder = chance % 100;
  const count = 1 + Math.floor(chance / 100) + (remainder > 0 && Math.random() * 100 < remainder ? 1 : 0);
  const setEffects = activeArmorSetEffects(battleStatsState(), className);
  const frameDamageMultiplier = multiHitDamageMultiplier(count, setEffects.multiHitDamagePercentPerHit || 0);
  const display = new Map();
  let landed = false;
  for (let strike = 0; strike < count; strike++) {
    const hit = applyHeroSingleHit(className, skillMultiplier, skillName, areaEffect, targets, showAttackAnimation, damageOverTime, projectileType, !landed, display, frameDamageMultiplier);
    landed = Boolean(hit) || landed;
    if (!battle || battle.enemyHp <= 0 || battle.pending || battle.finishing) break;
  }
  for (const [index, summary] of display) {
    queueBattleHitImpact(summary.damage, [index], summary.delay, summary);
  }
  return landed;
}
function recordBattleHitDisplay(display, indexes, damage, delay, critical = false, vulnerable = false, missed = false) {
  for (const index of indexes) {
    const summary = display.get(index) || { damage: 0, delay: 0, hitCount: 0, missCount: 0, criticalCount: 0, critical: false, vulnerable: false };
    summary.damage += damage;
    summary.delay = Math.max(summary.delay, delay);
    summary.hitCount += missed ? 0 : 1;
    summary.missCount += missed ? 1 : 0;
    summary.criticalCount += critical ? 1 : 0;
    summary.critical ||= critical;
    summary.vulnerable ||= vulnerable;
    display.set(index, summary);
  }
}
function dealHeroDamage(className, damage, targetIndexes, { storeTimeRift = true, resolveTimeRifts = true } = {}) {
  battle.highestHit = Math.max(battle.highestHit || 0, damage);
  const damageDealt = battle.mode === 'boss'
    ? damage
    : targetIndexes.reduce((sum, index) => sum + Math.min(damage, Math.max(0, battle.enemyHealths?.[index]?.hp || 0)), 0);
  battle.damageByClass ||= {};
  battle.damageByClass[className] = (battle.damageByClass[className] || 0) + damageDealt;
  battle.roundDamageByClass ||= {};
  battle.roundDamageByClass[className] = (battle.roundDamageByClass[className] || 0) + damageDealt;
  if (storeTimeRift) {
    const effects = activeArmorSetEffects(battleStatsState(), className);
    if (effects.timeRiftStoredPercent > 0) {
      for (const targetIndex of targetIndexes) {
        const actualDamage = battle.mode === 'boss' ? damage : Math.min(damage, Math.max(0, battle.enemyHealths?.[targetIndex]?.hp || 0));
        storeEnemyTimeRift(className, targetIndex, actualDamage, effects);
      }
    }
  }
  if (battle.mode === 'boss') battle.bossDamage += damage;
  else {
    targetIndexes.forEach((index) => {
      const pool = battle.enemyHealths?.[index];
      if (pool) pool.hp = Math.max(0, pool.hp - damage);
    });
    syncBattleEnemyTotals();
    if (resolveTimeRifts) releaseDeadEnemyTimeRifts();
    queueBattleVictory();
  }
  return damageDealt;
}
function applyHeroLifeSteal(className, damageDealt, fightState, setEffects, damageOverTime = false) {
  if (damageOverTime && setEffects.dotLifeStealPercent > 0 && damageDealt > 0) {
    const healing = damageDealt * setEffects.dotLifeStealPercent / 100;
    showBattleHealing(healBattlePartyAmount((hero, owner) => owner === className ? healing : 0));
  }
  const selfLifeSteal = skillTreeSpecialValue('self-life-steal-percent', className, fightState);
  if (selfLifeSteal > 0 && damageDealt > 0) {
    const healing = damageDealt * selfLifeSteal / 100;
    showBattleHealing(healBattlePartyAmount((hero, owner) => owner === className ? healing : 0));
  }
  if (setEffects.damageLifeStealPercent && damageDealt > 0) {
    const healing = damageDealt * setEffects.damageLifeStealPercent / 100 * (1 + (setEffects.healingPercent || 0) / 100);
    showBattleHealing(healBattlePartyAmount(() => healing));
  }
}
function applyHeroSingleHit(className, skillMultiplier, skillName, areaEffect, targets, showAttackAnimation, damageOverTime, projectileType, animateAttack, display, frameDamageMultiplier = 1) {
  if (!battle || battle.pending || battle.finishing || battle.enemyHp <= 0 || !isBattleClassAlive(className)) return;
  if (!skillName && !damageOverTime && performance.now() < (battle.basicAttackBlockedUntil?.[className] || 0)) return false;
  const living = livingBattleEnemyIndexes();
  const targetIndexes = targets.filter(index => living.includes(index));
  if (!targetIndexes.length) return;
  const fightState = battleStatsState();
  const weapon = equipmentForClass(className, fightState).mainHand;
  const setEffects = activeArmorSetEffects(fightState, className);
  const { stats, attack } = calculateCharacterStats(className, fightState);
  const hitChance = Math.max(0, Math.min(100, stats['Trefferchance'] || 0));
  const guaranteedHit = Boolean(skillName) || damageOverTime;
  if (!guaranteedHit && Math.random() * 100 >= hitChance) {
    recordBattleHitDisplay(display, targetIndexes, 0, 0, false, false, true);
    return false;
  }
  let base = CLASS_DAMAGE[className] + Math.max(0, characterLevel(className, fightState) - 1) * 2 + effectiveWeaponDamage(weapon) + Math.floor(attack.base / 5);
  base *= damageAttributeMultiplier(className, stats);
  base *= 1 + attack.percent / 100;
  const hitNumber = (battle.hits[className] || 0) + 1;
  battle.hits[className] = hitNumber;
  let multiplier = 0.82 + Math.random() * 0.36;
  multiplier *= frameDamageMultiplier;
  const baseCrit = stats['Kritische Chance'];
  const critical = Math.random() < Math.max(0, baseCrit) / 100;
  const criticalDamage = stats['Kritischer Schaden'];
  if (critical) {
    multiplier *= criticalDamage / 100;
  }
  if (skillMultiplier !== 1) multiplier *= skillMultiplier;
  const vulnerable = battle.vulnerableUntil > performance.now();
  if (vulnerable) {
    multiplier *= 1 + (BALANCE.combat.vulnerabilityBaseDamagePercent + stats['Schaden gegen verwundbare Ziele']) / 100;
  }
  if (damageOverTime) multiplier *= 1 + (stats['Schaden \u00fcber Zeit'] || 0) / 100;
  multiplier *= characterDamageMultiplier(className, fightState, setEffects);
  const isActiveSkill = Boolean(skillName) && COMPANION_SKILLS[className]?.active?.some(skill => skill.name === skillName);
  if ((isActiveSkill || damageOverTime) && setEffects.activeSkillDamagePercent) multiplier *= 1 + setEffects.activeSkillDamagePercent / 100;
  const damage = Math.max(1, Math.round(base * multiplier));
  const hunterPoison = passiveEffectsFor('hunter', fightState).find(effect => effect.type === 'bow-poison');
  const hunterPoisonTarget = !damageOverTime && className === 'hunter' && weapon?.slot === 'bow' && hunterPoison?.type === 'bow-poison'
    ? targetIndexes.find((index) => battle.mode === 'boss' || (battle.enemyHealths?.[index]?.hp ?? 0) > damage)
    : null;
  const hunterPoisonProc = hunterPoisonTarget != null && Math.random() * 100 < hunterPoison.chancePercent;
  const hunterUsesPoisonArrow = !damageOverTime && className === 'hunter' && weapon?.slot === 'bow' && hunterPoison?.type === 'bow-poison';
  const damageDealt = dealHeroDamage(className, damage, targetIndexes);
  if (!damageOverTime && setEffects.shadowEchoPercent) {
    queueShadowEcho(className, targetIndexes, damage, setEffects.shadowEchoPercent, stats['Schaden über Zeit'] || 0, setEffects.shadowEchoSeconds || 3);
  }
  const attackProjectile = hunterUsesPoisonArrow ? 'poison-arrow' : projectileType;
  const impactDelay = showAttackAnimation ? battleAttackImpactDelay(className, areaEffect, damageOverTime, attackProjectile) : 0;
  recordBattleHitDisplay(display, targetIndexes, damage, impactDelay, critical, vulnerable);
  if (showAttackAnimation && animateAttack) {
    try {
      playBattleAttack(className, damage, targetIndexes, areaEffect, damageOverTime, attackProjectile, critical, vulnerable);
    } catch (error) {
      console.error('Kampfangriff konnte nicht animiert werden:', error);
    }
  }
  applyHeroLifeSteal(className, damageDealt, fightState, setEffects, damageOverTime);
  if (critical && setEffects.criticalHealPercent) {
    const healing = setEffects.criticalHealPercent;
    showBattleHealing(healBattleParty(healing));
  }
  if (hunterPoisonProc && (battle.mode === 'boss' || (battle.enemyHealths?.[hunterPoisonTarget]?.hp ?? 0) > 0)) {
    const now = performance.now();
    const duration = hunterPoison.durationSeconds;
    const tickMultiplier = hunterPoison.damagePercent / 100 / duration;
    battle.enemyPoisons ||= [];
    refreshEnemyDamageOverTime(battle.enemyPoisons, { owner: className, targetIndex: hunterPoisonTarget, ticksRemaining: duration, nextTickAt: now + 1000, expiresAt: now + duration * 1000, tickMultiplier, skillName: 'Giftpfeil' }, now, true);
    updateBattleUI();
  }
  return true;
}
function shadowEchoTargetAlive(targetIndex) {
  return battle?.mode === 'boss' ? !battle.bossFinished : (battle?.enemyHealths?.[targetIndex]?.hp || 0) > 0;
}
function queueShadowEcho(owner, targets, sourceDamage, percent, dotBonus, seconds = 3, now = performance.now()) {
  if (!battle || percent <= 0) return;
  const damage = Math.round(sourceDamage * percent / 100 * Math.max(0, 1 + dotBonus / 100));
  if (!Number.isFinite(damage) || damage <= 0) return;
  const ticks = Math.max(1, Math.floor(seconds));
  battle.enemyShadowEchoes ||= [];
  for (const targetIndex of targets) {
    if (!shadowEchoTargetAlive(targetIndex)) continue;
    battle.enemyShadowEchoes.push({ owner, targetIndex, damage, ticks, ticksPaid: 0, damagePaid: 0, nextTickAt: now + 1000 });
  }
}
function processShadowEchoes(now = performance.now()) {
  if (!battle || battle.pending || battle.finishing || battle.between || !battle.enemyShadowEchoes?.length) return;
  const current = battle;
  const remaining = [];
  const impacts = new Map();
  for (const echo of current.enemyShadowEchoes) {
    if (!isBattleClassAlive(echo.owner) || !shadowEchoTargetAlive(echo.targetIndex)) continue;
    while (echo.ticksPaid < echo.ticks && now >= echo.nextTickAt && current.enemyHp > 0 && shadowEchoTargetAlive(echo.targetIndex)) {
      echo.ticksPaid += 1;
      echo.nextTickAt += 1000;
      // Cumulative rounding preserves the exact snapshotted total, even for tiny hits.
      const totalDue = Math.round(echo.damage * echo.ticksPaid / echo.ticks);
      const damage = totalDue - echo.damagePaid;
      echo.damagePaid = totalDue;
      if (damage <= 0) continue;
      const dealt = dealHeroDamage(echo.owner, damage, [echo.targetIndex]);
      const key = `${echo.owner}:${echo.targetIndex}`;
      const impact = impacts.get(key) || { owner: echo.owner, targetIndex: echo.targetIndex, damage: 0, dealt: 0, hitCount: 0 };
      impact.damage += damage;
      impact.dealt += dealt;
      impact.hitCount += 1;
      impacts.set(key, impact);
    }
    if (echo.ticksPaid < echo.ticks) remaining.push(echo);
  }
  current.enemyShadowEchoes = remaining.filter(echo => isBattleClassAlive(echo.owner) && shadowEchoTargetAlive(echo.targetIndex));
  for (const impact of impacts.values()) {
    if (battle !== current) break;
    const fightState = battleStatsState();
    applyHeroLifeSteal(impact.owner, impact.dealt, fightState, activeArmorSetEffects(fightState, impact.owner), true);
    queueBattleHitImpact(impact.damage, [impact.targetIndex], 0, { hitCount: impact.hitCount, critical: false, criticalCount: 0, shadowEcho: true });
  }
}
function storeEnemyTimeRift(owner, targetIndex, damage, effects, now = performance.now()) {
  if (!(damage > 0) || !isBattleClassAlive(owner)) return;
  battle.enemyTimeRifts ||= [];
  let rift = battle.enemyTimeRifts.find(entry => entry.owner === owner && entry.targetIndex === targetIndex);
  if (!rift) {
    rift = { owner, targetIndex, damage: 0, burstAt: effects.timeRiftIntervalSeconds > 0 ? now + effects.timeRiftIntervalSeconds * 1000 : null };
    battle.enemyTimeRifts.push(rift);
  }
  // Keep fractional deposits until release, so small hits are not lost to rounding.
  rift.damage += damage * effects.timeRiftStoredPercent / 100;
}
function releaseEnemyTimeRift(rift, targetIndexes) {
  if (!targetIndexes.length || !isBattleClassAlive(rift.owner)) return;
  const total = Math.round(rift.damage);
  const share = Math.floor(total / targetIndexes.length);
  const remainder = total % targetIndexes.length;
  targetIndexes.forEach((targetIndex, index) => {
    const damage = share + (index < remainder ? 1 : 0);
    if (damage <= 0) return;
    // Stored damage already contains all source bonuses. No recursion or on-hit effects.
    dealHeroDamage(rift.owner, damage, [targetIndex], { storeTimeRift: false, resolveTimeRifts: false });
    queueBattleHitImpact(damage, [targetIndex], 0, { hitCount: 1, critical: false, criticalCount: 0, timeRift: true });
  });
}
function releaseDeadEnemyTimeRifts() {
  if (battle.mode === 'boss' || !battle.enemyTimeRifts?.length) return;
  // An outbreak may kill another marked enemy: drain its existing pool once as well.
  while (true) {
    const dead = battle.enemyTimeRifts.filter(rift => (battle.enemyHealths?.[rift.targetIndex]?.hp || 0) <= 0);
    if (!dead.length) break;
    battle.enemyTimeRifts = battle.enemyTimeRifts.filter(rift => !dead.includes(rift));
    for (const rift of dead) releaseEnemyTimeRift(rift, livingBattleEnemyIndexes());
  }
}
function processEnemyTimeRifts(now = performance.now()) {
  if (!battle || battle.pending || battle.finishing || battle.between || battle.bossFinished) return;
  battle.enemyTimeRifts = (battle.enemyTimeRifts || []).filter(rift => isBattleClassAlive(rift.owner));
  releaseDeadEnemyTimeRifts();
  const due = battle.enemyTimeRifts.filter(rift => rift.burstAt != null && now >= rift.burstAt);
  // Remove first so an outbreak never consumes or refills its own stored damage.
  battle.enemyTimeRifts = battle.enemyTimeRifts.filter(rift => !due.includes(rift));
  for (const rift of due) {
    if (battle.mode === 'boss' || (battle.enemyHealths?.[rift.targetIndex]?.hp || 0) > 0) releaseEnemyTimeRift(rift, [rift.targetIndex]);
    else releaseEnemyTimeRift(rift, livingBattleEnemyIndexes());
    releaseDeadEnemyTimeRifts();
  }
}
function hasOwnedEnemyDamageOverTime(owner, targetIndex, now) {
  const nativeEffects = [...(battle.enemyBurns || []), ...(battle.enemyPoisons || [])];
  return nativeEffects.some(effect => effect.owner === owner && effect.targetIndex === targetIndex && effect.expiresAt >= now)
    || (battle.enemyShadowEchoes || []).some(echo => echo.owner === owner && echo.targetIndex === targetIndex
      && echo.ticksPaid < echo.ticks && echo.nextTickAt + (echo.ticks - echo.ticksPaid - 1) * 1000 >= now);
}
function processHeartfall(now = performance.now()) {
  if (!battle || battle.mode === 'boss' || battle.pending || battle.finishing || battle.between) return;
  const fightState = battleStatsState();
  const sources = livingBattleClasses().map(owner => ({ owner, percent: activeArmorSetEffects(fightState, owner).heartfallMaxHealthPercent || 0 }))
    .filter(source => source.percent > 0).sort((a, b) => b.percent - a.percent);
  battle.heartfallCycles ||= [];
  for (const targetIndex of livingBattleEnemyIndexes()) {
    if (battle.heartfallCycles[targetIndex] === battle.cycle) continue;
    // Multiple DoTs and wearers share one max-health drain per target and combat tick.
    const source = sources.find(entry => hasOwnedEnemyDamageOverTime(entry.owner, targetIndex, now));
    if (!source) continue;
    battle.heartfallCycles[targetIndex] = battle.cycle;
    const damage = Math.max(1, Math.round(battle.enemyHealths[targetIndex].max * source.percent / 100));
    const dealt = dealHeroDamage(source.owner, damage, [targetIndex], { storeTimeRift: false });
    battle.roundHeartfallDamage = (battle.roundHeartfallDamage || 0) + dealt;
    // Deliberately bypass hit processing: no crits, extra hits, healing or secondary effects.
    queueBattleHitImpact(damage, [targetIndex], 0, { hitCount: 1, critical: false, criticalCount: 0, heartfall: true });
  }
}
// Refresh duration without postponing an already scheduled damage tick.
function refreshEnemyDamageOverTime(effects, incoming, now, includeExpiryTick) {
  const existing = effects.find(effect => effect.owner === incoming.owner && effect.targetIndex === incoming.targetIndex && effect.expiresAt > now);
  if (!existing) {
    effects.push(incoming);
    return;
  }
  existing.expiresAt = incoming.expiresAt;
  const intervals = (existing.expiresAt - existing.nextTickAt) / 1000;
  existing.ticksRemaining = Math.max(0, includeExpiryTick ? Math.floor(intervals) + 1 : Math.ceil(intervals));
}
function processEnemyBurns(now = performance.now()) {
  if (!battle || battle.pending || battle.finishing || battle.between || !battle.enemyBurns?.length) return;
  const remainingBurns = [];
  for (const burn of battle.enemyBurns) {
    if (battle.enemyHp <= 0 || !isBattleClassAlive(burn.owner) || (battle.enemyHealths?.[burn.targetIndex]?.hp ?? 1) <= 0) continue;
    while (burn.ticksRemaining > 0 && now >= burn.nextTickAt && battle.enemyHp > 0 && (battle.enemyHealths?.[burn.targetIndex]?.hp ?? 1) > 0) {
      burn.ticksRemaining -= 1;
      burn.nextTickAt += 1000;
      applyHeroHit(burn.owner, burn.tickMultiplier, burn.skillName, false, burn.targetIndex, false, true);
    }
    if ((burn.ticksRemaining > 0 || burn.expiresAt > now) && battle.enemyHp > 0) remainingBurns.push(burn);
  }
  battle.enemyBurns = remainingBurns;
}
function processEnemyPoisons(now = performance.now()) {
  if (!battle || battle.pending || battle.finishing || battle.between || !battle.enemyPoisons?.length) return;
  const remainingPoisons = [];
  for (const poison of battle.enemyPoisons) {
    const targetAlive = battle.mode === 'boss'
      ? !battle.bossFinished
      : (battle.enemyHealths?.[poison.targetIndex]?.hp ?? 0) > 0;
    if (!targetAlive || !isBattleClassAlive(poison.owner)) continue;
    while (poison.ticksRemaining > 0 && now >= poison.nextTickAt && (battle.mode === 'boss' ? !battle.bossFinished : (battle.enemyHealths?.[poison.targetIndex]?.hp ?? 0) > 0)) {
      poison.ticksRemaining -= 1;
      poison.nextTickAt += 1000;
      applyHeroHit(poison.owner, poison.tickMultiplier, poison.skillName, false, poison.targetIndex, false, true);
    }
    if (poison.ticksRemaining > 0 && (battle.mode === 'boss' || battle.enemyHp > 0)) remainingPoisons.push(poison);
  }
  battle.enemyPoisons = remainingPoisons;
}
async function battleTick() {
  if (!battle || battle.pending || battle.finishing || battle.between) return;
  if (battle.mode === 'boss' && performance.now() >= battle.bossEndsAt) { await finishBossBattle(); return; }
  battle.cycle += 1;
  processEnemyTimeRifts();
  processHeartfall();
  processEnemyBurns();
  processEnemyPoisons();
  processShadowEchoes();
  const fightState = battleStatsState();
  const pulseSources = livingBattleClasses().map((owner) => ({ owner, effects: activeArmorSetEffects(fightState, owner) })).filter((entry) => entry.effects.vulnerableEverySeconds);
  for (const { owner, effects } of pulseSources) {
    const pulseTicks = combatIntervalTicks(effects.vulnerableEverySeconds);
    if (battle.cycle % pulseTicks === 0) makeEnemyVulnerable(effects.vulnerableDurationSeconds || 3, `${CLASSES[owner].label}-Setbonus`);
  }
  const skillUsersThisTick = new Set();
  for (const className of livingBattleClasses()) {
    if (battle.autoSkills[className]) {
      if (activateCompanionSkill(className, true)) skillUsersThisTick.add(className);
      if (battle.enemyHp <= 0) break;
    }
  }
  for (const className of livingBattleClasses()) {
    if (battle.enemyHp <= 0) break;
    if (skillUsersThisTick.has(className)) continue;
    const isRangedAttacker = ['hunter', 'mage'].includes(className);
    if (!isRangedAttacker && performance.now() < (battle.sceneReadyAt || 0)) continue;
    const attackInterval = basicAttackIntervalTicks(className, fightState);
    if (battle.cycle % attackInterval !== 0) continue;
    applyHeroHit(className);
  }
  if (battle.siphonHealing) {
    const healing = Math.min(20, battle.siphonHealing);
    showBattleHealing(healBattleParty(healing));
    battle.siphonHealing = 0;
  }
  if (battle.mode === 'boss') {
    updateBattleUI();
    updateBattleDock();
    if (performance.now() >= battle.bossEndsAt) await finishBossBattle();
    else {
      scheduleBattleTick(BALANCE.combat.tickMilliseconds);
    }
    return;
  }
  const enemyAttackInterval = Math.max(1, BALANCE.combat.enemyAttackIntervalTicks || 4);
  if (battle.enemyHp > 0 && battle.cycle % enemyAttackInterval === 0 && performance.now() >= (battle.sceneReadyAt || 0)) {
    const attackingEnemyIndex = choose(livingBattleEnemyIndexes().filter((index) =>
      (battle.enemyFrozenUntil?.[index] || 0) <= performance.now() && (battle.enemyStunnedUntilCycles?.[index] || 0) < battle.cycle));
    if (attackingEnemyIndex != null) {
      if (!enemyTargetCandidates().includes(battle.focusTarget)) battle.focusTarget = chooseEnemyFocusTarget();
      const target = battle.focusTarget;
      const targetStats = getStats(target, fightState);
      const targetHealth = battle.partyHealth[target];
      const defense = targetStats.Verteidigung;
      const targetPercent = Math.max(0, targetHealth.hp / targetHealth.max * 100);
      const setEffects = activeArmorSetEffects(fightState, target);
      const mistGuard = targetPercent <= (setEffects.lowHealthThreshold || 0) ? (setEffects.lowHealthDamageReduction || 0) / 100 : 0;
      const damageReduction = battleDamageReduction(defense, battle.guardEffects, mistGuard, performance.now(), { className: target, sourceState: fightState });
      battle.enemyAttackCount = (battle.enemyAttackCount || 0) + 1;
      const enemySkillInterval = Math.max(1, battle.enemySkill?.attackInterval || 1);
      const enemySkill = battle.enemySkill && battle.enemyAttackCount % enemySkillInterval === 0 && (!battle.enemySkill.once || !battle.enemySkillUsed);
      const skillPower = enemySkill ? battle.enemySkill.multiplier : 1;
      const invulnerable = (battle.invulnerableUntil?.[target] || 0) > performance.now();
      const dodged = !invulnerable && Math.random() * 100 < dodgeChanceFor(target, fightState);
      // Enemy damage is an absolute HP value. More maximum HP must increase survivability.
      const incoming = invulnerable || dodged ? 0 : Math.max(BALANCE.combat.enemyMinimumHitDamage ?? 1,
        Math.round(battle.enemyDamage * skillPower * (0.9 + Math.random() * 0.2) * (1 - damageReduction)));
      const damageTaken = Math.min(targetHealth.hp, incoming);
      battle.roundDamageTakenByClass ||= {};
      battle.roundDamageTakenByClass[target] = (battle.roundDamageTakenByClass[target] || 0) + damageTaken / targetHealth.max;
      const wasAlive = targetHealth.hp > 0;
      targetHealth.hp = Math.max(0, targetHealth.hp - damageTaken);
      if (wasAlive && targetHealth.hp <= 0) battle.deaths = (battle.deaths || 0) + 1;
      if (enemySkill) battle.enemySkillUsed = true;
      animateEnemyAttack(target, damageTaken, attackingEnemyIndex, invulnerable, dodged);
      if (targetHealth.hp <= 0) {
        advanceEnemiesForRangedParty();
        battle.focusTarget = chooseEnemyFocusTarget() || null;
      }
    }
  }
  if (battle.enemyHp <= 0) { queueBattleVictory(); updateBattleUI(); return; }
  if (!livingBattleClasses().length) { await finishBattle(false); return; }
  updateBattleUI();
  scheduleBattleTick(BALANCE.combat.tickMilliseconds);
}
function collectBattleSessionRewards(session, result) {
  if (!result) return;
  session.soulsEarned = (session.soulsEarned || 0) + Math.max(0, Number(result.reward) || 0);
  if (session.mode !== 'tower') return;
  session.towerRewards ||= { items: new Map(), missed: new Map(), mailed: 0 };
  const add = (item, destination) => {
    if (!item) return;
    const quantity = Math.max(1, Math.floor(Number(item.quantity) || 1));
    const counts = destination === 'missed' ? session.towerRewards.missed : session.towerRewards.items;
    const label = ['weaponGem', 'armorGem'].includes(item.slot) ? `${item.name} (${item.rarity})` : item.name;
    counts.set(label, (counts.get(label) || 0) + quantity);
    if (destination === 'mailbox') session.towerRewards.mailed += quantity;
  };
  (result.towerMaterialDrops || []).forEach(({ item, destination }) => add(item, destination));
  (result.towerMaterialDropMissed || []).forEach(item => add(item, 'missed'));
  add(result.farmBoxDrop, result.farmBoxDropDestination);
  add(result.firstClearBoxes, result.firstClearBoxesDestination);
}
async function finishBattle(won) {
  if (['area', 'tower'].includes(battle?.mode) && offlineFarmSuspended) return;
  if (!battle || battle.pending || battle.finishing || battle.between) return;
  const current = battle;
  if (current.finishedWave === current.wave) return;
  current.finishedWave = current.wave;
  battleTrace('finishBattle gestartet', { won });
  current.finishing = true;
  current.pendingAt = performance.now();
  battle.pending = true;
  window.clearTimeout(battle.timer);
  current.timer = null;
  window.clearTimeout(current.victoryTimer);
  current.victoryTimer = null;
  if (won && !current.stopAfterCurrent) {
    current.between = true;
    scheduleBattleAdvance(current);
    battleTrace('Nächste Welle eingeplant');
  }
  if (won && ['dornwacht', 'aschental', 'salzmoor', 'schwarze-kluft', 'glasforst', 'mondbruch'].includes(battle.areaId) && battle.mode === 'area') {
    try {
      setEnemyBattlePose('defeated');
      document.querySelectorAll('.battle-projectile, .battle-magic-projectile, .battle-magic-impact, .healer-attack-pulse').forEach((effect) => effect.remove());
      activeBattleClasses().forEach((className) => {
        const actor = document.querySelector(`#battle-overlay [data-hero="${className}"]`);
        actor?.classList.remove('is-attacking', 'is-hit');
        setHeroBattlePose(className, 'idle');
      });
    } catch (error) {
      console.error('Kampfszene konnte den Sieg nicht darstellen:', error);
    }
  }
  if (!won) {
    recordBattleStatistics(current, 0, true);
    if (current.mode === 'tower') {
      battle = null;
      document.querySelector('#battle-overlay')?.remove();
      updateBattleDock();
      finishBattleActivity(current, 'Durch Niederlage beendet.');
      toastMessageFor('Turmlauf beendet', 'Deine Gruppe wurde besiegt. Ein neuer Lauf verbraucht einen weiteren Versuch.');
      if (currentView === 'tower') renderView();
      return;
    }
    current.recoveryUntil = performance.now() + BALANCE.combat.defeatRecoveryMilliseconds;
    current.between = true;
    scheduleBattleAdvance(current, 0);
    try {
      updateBattleUI();
      updateBattleDock();
    } catch (error) {
      console.error('Erholung konnte nicht angezeigt werden:', error);
    }
    return;
  }
  current.enemiesKilled += 1;
  const defeatedMonsters = (current.enemyHealths || []).filter((enemy) => enemy.hp <= 0).length;
  const completedEncounter = {
    action: 'battle', mode: current.mode, area: current.areaId, deepTier: current.deepTier, huntingEventId: current.huntingEventId,
    round: current.towerRound, elite: current.elite, partyClasses: [...current.partyClasses],
    statistics: collectBattleStatistics(current, defeatedMonsters),
    offlineSample: offlineRoundSample(current, true),
  };
  const result = Promise.resolve()
    .then(() => performAction(completedEncounter))
    .then((rewardResult) => {
      collectBattleSessionRewards(current, rewardResult);
      return rewardResult;
    })
    .catch((error) => {
      console.error('Kampfergebnis konnte nicht gespeichert werden:', error);
      return null;
    });
  current.pendingRewards ||= new Set();
  current.pendingRewards.add(result);
  result.then(() => current.pendingRewards.delete(result));
  if (current.mode === 'tower') current.towerRound += 1;
  const healerRestBonus = activeBattleClasses().includes('healer') ? 2 + passiveEffectTotal('rest-healing-percent', 'healer', battleStatsState()) : 0;
  const recovery = 20 + healerRestBonus;
  const restoredByClass = {};
  Object.entries(current.partyHealth || {}).forEach(([className, hero]) => {
    const previousHp = hero.hp;
    const restMultiplier = 1 + (activeArmorSetEffects(battleStatsState(), className).restHealingPercent || 0) / 100;
    const restored = hero.max * recovery / 100 * restMultiplier;
    hero.hp = Math.min(hero.max, Math.max(0, hero.hp) + restored);
    restoredByClass[className] = Math.round(hero.hp - previousHp);
  });
  showBattleHealing(restoredByClass);
  if (current.stopAfterCurrent) {
    battle = null;
    document.querySelector('#battle-overlay')?.remove();
    updateBattleDock();
    finishBattleActivity(current, 'Nach dem letzten Sieg manuell beendet.');
    return;
  }
  try {
    updateBattleUI();
  } catch (error) {
    console.error('Kampfanzeige konnte nach dem Sieg nicht aktualisiert werden:', error);
  }
}

// Keep progression independent from DOM animation callbacks. This heartbeat
// repairs a lost timeout and resolves a dead enemy even if a scene was removed.
window.setInterval(() => {
  const current = battle;
  if (!current || (['area', 'tower'].includes(current.mode) && offlineFarmSuspended)) return;
  // During the inter-wave pause the defeated enemy still has 0 HP. Do not
  // feed that same wave back into victory detection or the watchdog.
  if (current.between) {
    if (!current.timer) scheduleBattleAdvance(current, 0);
    if (current.recoveryUntil) {
      try { updateBattleUI(); updateBattleDock(); }
      catch (error) { console.error('Erholungsanzeige konnte nicht aktualisiert werden:', error); }
    }
    return;
  }
  if (current.pending && current.enemyHp <= 0 && performance.now() - (current.pendingAt || performance.now()) > 1800) {
    battleTrace('Watchdog löst hängenden Abschluss', { pendingForMs: Math.round(performance.now() - current.pendingAt) });
    console.error('Kampfrundenabschluss hing fest; der Zustand wird wieder freigegeben.');
    current.pending = false;
    current.finishing = false;
    current.pendingAt = 0;
  }
  if (current.pending) return;
  if (current.mode !== 'boss' && current.enemyHp <= 0) {
    queueBattleVictory(current);
    return;
  }
  if (!current.timer && !current.victoryTimer) scheduleBattleTick(0);
}, 300);

function showBossRewardToast(result) {
  document.querySelector('#boss-reward-toast')?.remove();
  const toast = document.createElement('aside');
  toast.id = 'boss-reward-toast';
  toast.className = 'boss-reward-toast';
  toast.setAttribute('role', 'status');
  toast.setAttribute('aria-live', 'polite');
  toast.setAttribute('title', 'Zum Schließen anklicken');
  toast.addEventListener('click', () => toast.remove());
  const title = document.createElement('strong');
  const rank = BALANCE.bossChallenge.rankThresholds.find(entry => entry.name === result.rank);
  title.innerHTML = bossRankBadge(rank, `Bossrang ${result.rank}`);
  const detail = document.createElement('span');
  const boxCounts = new Map();
  (result.luckyBoxRewards || []).forEach(({ item }) => boxCounts.set(item.name, (boxCounts.get(item.name) || 0) + Math.max(1, Number(item.quantity) || 1)));
  const boxText = [...boxCounts].map(([name, count]) => `${count > 1 ? `${count}x ` : ''}${name}`).join(', ');
  detail.textContent = `${damageDisplayNumber(result.damage)} Schaden \u00b7 +${number(result.reward)} Seelen${boxText ? ` \u00b7 ${boxText}` : ''}`;
  toast.append(title, detail);
  document.body.append(toast);
  window.setTimeout(() => toast.remove(), 9000);
}
async function finishBossBattle() {
  if (!battle || battle.mode !== 'boss' || battle.pending || battle.bossFinished) return;
  const current = battle;
  current.pending = true;
  window.clearTimeout(current.timer);
  const result = await performAction({ action: 'boss-complete', damage: current.bossDamage, highestHit: current.highestHit, deaths: current.deaths, damageGoal: current.bossDamageGoal });
  if (battle !== current) return;
  if (!result) {
    battle = null;
    document.querySelector('#battle-overlay')?.remove();
    updateBattleDock();
    return;
  }
  current.bossReward = result.reward;
  current.bossRank = result.rank;
  showBossRewardToast(result);
  current.bossFinished = true;
  const actions = document.querySelector('.battle-header-actions');
  if (actions) actions.innerHTML = `<div class="battle-wave-pill">ANSTURM BEENDET</div><button type="button" class="primary-button ui-control ui-button boss-result-close" data-boss-close>ERGEBNIS SCHLIESSEN <span>×</span></button>`;
  updateBattleUI();
  updateBattleDock();
}
function stopBattle() {
  if (!battle) return;
  if (['area', 'tower'].includes(battle.mode)) performAction({ action: 'offline-stop', silent: true });
  if (battle.mode === 'boss') {
    if (battle.pending && !battle.bossFinished) return;
    if (battle.bossFinished) { closeBossResult(); return; }
    const session = battle;
    window.clearTimeout(session.timer);
    battle = null;
    document.querySelector('#battle-overlay')?.remove();
    updateBattleDock();
    performAction({ action: 'boss-cancel', statistics: collectBattleStatistics(session) }).catch(() => {});
    return;
  }
  if (battle.pending && !battle.recoveryUntil) {
    battle.stopAfterCurrent = true;
    toastMessageFor('Kampf wird beendet', 'Der aktuelle Sieg wird noch gutgeschrieben.');
    return;
  }
  const session = battle;
  window.clearTimeout(battle.timer);
  battle = null;
  recordBattleStatistics(session, 0);
  document.querySelector('#battle-overlay')?.remove();
  updateBattleDock();
  finishBattleActivity(session, 'Manuell beendet.');
}
function collectBattleStatistics(session, monstersKilled = 0) {
  const damageDealt = Object.values(session.damageByClass || {}).reduce((sum, value) => sum + (Number(value) || 0), 0);
  const defeatedInWave = session.mode === 'area' ? (session.enemyHealths || []).filter(enemy => enemy.hp <= 0).length : 0;
  const huntingKills = Math.max(0, defeatedInWave - (session.huntWaveKillsRecorded || 0));
  session.huntWaveKillsRecorded = defeatedInWave;
  const weaponDefeatedInWave = session.mode === 'boss' ? 0 : (session.enemyHealths || []).filter(enemy => enemy.hp <= 0).length;
  const weaponKills = Math.max(0, weaponDefeatedInWave - (session.weaponWaveKillsRecorded || 0));
  session.weaponWaveKillsRecorded = weaponDefeatedInWave;
  const participants = session.partyClasses || activeBattleClasses();
  const weaponState = { ...state, activeCompanion: participants.find(owner => owner !== state.mainClass) || null };
  const weaponIds = participants.map(owner => equipmentForClass(owner, weaponState).mainHand).filter(isLevelWeapon).map(item => item.id);
  const stats = {
    damageDealt: Math.max(0, damageDealt - (session.statsDamageRecorded || 0)),
    deaths: Math.max(0, (session.deaths || 0) - (session.statsDeathsRecorded || 0)),
    monstersKilled: Math.max(0, monstersKilled),
    huntingKills, weaponKills, weaponIds,
    highestHit: Number(session.highestHit) || 0,
  };
  session.statsDamageRecorded = damageDealt;
  session.statsDeathsRecorded = session.deaths || 0;
  return stats;
}
function recordBattleStatistics(session, monstersKilled = 0, defeated = false) {
  if (!session || session.mode === 'boss') return;
  const statistics = collectBattleStatistics(session, monstersKilled);
  if (!statistics.damageDealt && !statistics.deaths && !statistics.monstersKilled && !statistics.highestHit && !statistics.huntingKills && !statistics.weaponKills) return;
  performAction({ action: 'record-combat-stats', mode: session.mode, area: session.areaId, deepTier: session.deepTier, round: session.towerRound, huntingEventId: session.huntingEventId, statistics, offlineSample: defeated ? offlineRoundSample(session, false) : null }).catch((error) => console.error('Kampfstatistik konnte nicht gespeichert werden:', error));
}
function closeBossResult() {
  if (battle?.mode !== 'boss' || !battle.bossFinished) return;
  window.clearTimeout(battle.timer);
  battle = null;
  document.querySelector('#battle-overlay')?.remove();
  updateBattleDock();
}


