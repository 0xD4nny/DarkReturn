const SAVE_DB_NAME = 'dark-return-rpg';
const SAVE_STORE = 'saves';
const SAVE_KEY = 'current';
const MAILBOX_CAPACITY = 10;
const LEGACY_COMBAT_ACTIVITY = new Set(['Kampf gewonnen', 'Kampf verloren', 'Kampf abgebrochen']);
const STACKABLE_ITEM_SLOTS = new Set(['questItem', 'upgradeStone', 'mythicUpgradeStone', 'socketStone', 'rarityStone', 'affixStone', 'weaponGem', 'armorGem', 'powerup', 'vipTicket', 'towerLootBoost', 'towerReset', 'bossReset', 'glyphBox', 'vipBox', 'farmBox', 'materialBox']);
const RARITY_ENCHANT_ORDER = ['common', 'uncommon', 'rare', 'epic', 'legendary'];
const STACKABLE_SHOP_GROUPS = new Set(['glyphBox', 'vipBox', 'materialBox']);
const viewContainer = document.querySelector('#view-container');
const activityToggle = document.querySelector('#activity-toggle');
const activityBadge = document.querySelector('#activity-badge');
const activityPanel = document.querySelector('#activity-panel');
const activityList = document.querySelector('#activity-list');
const mailboxToggle = document.querySelector('#mailbox-toggle');
const mailboxBadge = document.querySelector('#mailbox-badge');
const mailboxCount = document.querySelector('#mailbox-count');
const mailboxPanel = document.querySelector('#mailbox-panel');
const mailboxList = document.querySelector('#mailbox-list');
const activePowerupsSlot = document.querySelector('#active-powerups-slot');
const tooltip = document.createElement('div');
tooltip.className = 'item-tooltip';
tooltip.setAttribute('role', 'tooltip');
document.body.append(tooltip);
let state = null;
let currentView = 'map';
let selectedAreaId = 'dornwacht';
let selectedDeepTier = null;
let selectedForForge = new Set();
let selectedInventoryOwner = 'main';
let selectedInventoryTab = 'equipment';
let selectedAbilityOwner = 'main';
let selectedAbilityType = 'active';
let selectedPassiveAbilitySlot = 0;
const inspectedAbilities = {};
const questRewardPreviews = new Map();
let selectedAltarOwner = 'main';
let selectedAltarPetOwner = null;
let selectedSkillTreeOwner = 'main';
let selectedSettingsTab = 'management';
let onboardingMainClass = null;
let onboardingCompanionClass = null;
let onboardingPlayerName = '';
let selectedSkillTreeNodeId = 'origin';
let selectedSocketTargetId = null;
let selectedEnchantTargetId = null;
let selectedSocketMode = 'ritual';
let selectedSocketUpgradeGemId = null;
let selectedEnchantMode = 'rarity';
let selectedEnchantAffixIndex = 0;
let autoUpgradeRunning = false;
let selectedForgeTargetLevel = null;
let selectedForgeMode = 'upgrade';
const selectedGlyphsForFusion = new Set();
let lastFusedGlyphId = null;
let glyphFusionPending = false;
let autoSocketRunning = false;
let selectedSocketTargetCount = null;
let activeWorkshopJob = null;
const shopQuantities = {};
const itemGridPreferences = {
  inventory: { category: 'weapons', sort: 'rarity' },
  forge: { category: 'weapons', sort: 'rarity' },
  glyphFusion: { category: 'glyphs', sort: 'rarity' },
  shopSell: { category: 'weapons', sort: 'rarity' },
  socketTargets: { category: 'weapons', sort: 'rarity' },
  socketGems: { category: 'gems', sort: 'rarity' },
  enchantTargets: { category: 'weapons', sort: 'rarity' },
};
let battle = null;
let bossCooldownTimer = null;
let actionQueue = Promise.resolve();
let saveWriteQueue = Promise.resolve();
let saveRevision = 0;
let saveMaintenance = false;
let saveBlocked = false;
let stateGeneration = 0;
let playTimeTimer = null;
let lastPlayTimeTick = Date.now();
let lastPlayTimePersistAt = Date.now();

function enqueueStateTask(operation) {
  if (saveMaintenance || saveBlocked) return Promise.reject(new Error('Der Spielstand ist momentan für Änderungen gesperrt.'));
  const generation = stateGeneration;
  const task = actionQueue.then(() => {
    if (saveBlocked || generation !== stateGeneration) throw new Error('Diese Aktion gehört zu einem früheren Spielstand.');
    return operation();
  });
  actionQueue = task.catch(() => {});
  return task;
}
function stopSaveBackgroundWork() {
  autoUpgradeRunning = false;
  autoSocketRunning = false;
  cancelWorkshopAnimation();
  if (activeWorkshopJob) activeWorkshopJob.stopRequested = true;
  activeWorkshopJob = null;
  renderWorkshopStatus();
  window.clearTimeout(battle?.timer);
  window.clearTimeout(battle?.victoryTimer);
  battle = null;
  document.querySelector('#battle-overlay')?.remove();
  updateBattleDock();
}
function blockConflictingSave() {
  if (saveBlocked) return;
  saveBlocked = true;
  stateGeneration += 1;
  stopSaveBackgroundWork();
  const overlay = document.createElement('div');
  overlay.className = 'save-conflict-overlay';
  overlay.innerHTML = '<section role="alertdialog" aria-modal="true" aria-labelledby="save-conflict-title"><h2 id="save-conflict-title">Spielstand in einem anderen Tab geändert</h2><p>Dieser Tab wurde angehalten, damit dein neuerer Fortschritt erhalten bleibt. Schließe weitere Dark-Return-Tabs und lade den Spielstand neu.</p><button type="button" class="primary-button ui-control ui-button">SPIELSTAND NEU LADEN</button></section>';
  overlay.querySelector('button').addEventListener('click', () => window.location.reload());
  document.querySelector('.app-shell')?.setAttribute('inert', '');
  document.body.append(overlay);
  overlay.querySelector('button').focus();
}

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
}
function choose(values) { return values[Math.floor(Math.random() * values.length)]; }
function number(value) { return Math.round(value || 0).toLocaleString('de-DE'); }
function compactNumber(value, units) {
  const amount = Math.max(0, Number(value) || 0);
  let unitIndex = units.findIndex(([, divisor], index) => amount >= divisor && (index === units.length - 1 || amount < units[index + 1][1]));
  if (unitIndex < 0) return number(amount);
  while (unitIndex < units.length - 1 && Math.round((amount / units[unitIndex][1]) * 10) / 10 >= 1000) unitIndex += 1;
  const [suffix, divisor] = units[unitIndex];
  const formatted = new Intl.NumberFormat('de-DE', { maximumFractionDigits: 1 }).format(amount / divisor);
  return `${formatted} ${suffix}`;
}
function damageDisplayNumber(value) {
  const amount = Math.max(0, Number(value) || 0);
  if (!state?.settings?.compactDamageNumbers || amount < 1000) return number(amount);
  return compactNumber(amount, [['K', 1e3], ['Mio.', 1e6], ['Mrd.', 1e9], ['Bio.', 1e12]]);
}
function toastMessageFor(title, message) {
  showToastNotification(title, message);
}
let databasePromise;
function openSaveDatabase() {
  if (!('indexedDB' in window)) return Promise.reject(new Error('Dieser Browser unterstützt IndexedDB nicht.'));
  if (!databasePromise) {
    databasePromise = new Promise((resolve, reject) => {
      const opening = indexedDB.open(SAVE_DB_NAME, 1);
      opening.onupgradeneeded = () => {
        if (!opening.result.objectStoreNames.contains(SAVE_STORE)) opening.result.createObjectStore(SAVE_STORE, { keyPath: 'id' });
      };
      opening.onsuccess = () => {
        opening.result.onversionchange = () => { opening.result.close(); databasePromise = null; blockConflictingSave(); };
        resolve(opening.result);
      };
      opening.onerror = () => reject(opening.error || new Error('Der lokale Spielstand konnte nicht geöffnet werden.'));
      opening.onblocked = () => reject(new Error('Der Spielstand ist in einem anderen Browserfenster geöffnet. Schließe die anderen Dark-Return-Tabs und lade die Seite neu.'));
    });
  }
  return databasePromise;
}
function normalizeLegacyWeapons(value) {
  if (!value || typeof value !== 'object') return value;
  if (Array.isArray(value)) {
    value.forEach(normalizeLegacyWeapons);
    return value;
  }
  if (value.slot === 'greatsword') {
    value.slot = 'sword';
    value.icon = SLOT_DATA.sword.icon;
  }
  if (value.slot === 'weaponGem') value.name = weaponGemProfileName(value.name);
  Object.values(value).forEach(normalizeLegacyWeapons);
  return value;
}
function defaultContractState() {
  return { rewardProgress: 0, rewardClaims: 0, hunt: { rank: 1, progress: 0, completed: 0 }, survey: { rank: 1, areas: [], completed: 0 }, tower: { rank: 1, progress: 0, completed: 0 } };
}
function defaultQuestBook() {
  const counters = Object.fromEntries(['areaWins', 'monsters', 'champions', 'purchases', 'forges', 'equipmentDrops', 'epicDrops', 'jewelryPurchases', 'jewelryDrops', 'gemPurchases', 'luckyPurchases', 'soulsEarned', 'soulsSpent', 'socketAttempts', 'upgradeStonePurchases', 'socketStonePurchases', 'upgradeStoneDrops', 'socketStoneDrops', 'socketsOpened', 'gemsSocketed', 'affixesRerolled', 'greaterDrops', 'towerBosses', 'towerRounds', 'nonQuestSoulsEarned'].map(key => [key, 0]));
  ['affixStoneDrops', 'gemDrops', 'petAffixesRerolled', 'equipmentAffixesRerolled', 'raritiesUpgraded'].forEach(key => { counters[key] = 0; });
  for (let tier = 1; tier <= BALANCE.deepOfDark.maxTier; tier++) {
    counters['monstersDeep' + tier] = 0;
    counters['championsDeep' + tier] = 0;
  }
  return { unlockedStages: 1, claimed: {}, stageRewards: {}, completedAreas: [], counters, board: makeQuestBoardGroup(0) };
}
function questCounterKey(quest) {
  return quest.minimumDeepTier ? quest.type + 'Deep' + quest.minimumDeepTier : quest.type;
}
function questBoardDescription(quest) {
  const rank = BALANCE.bossChallenge.rankThresholds[quest.target - 1]?.name || '';
  return quest.description.replace(/\{target\}/g, number(quest.target)).replace(/\{rank\}/g, rank);
}
function makeQuestBoardGroup(groupIndex, save = null) {
  const fixed = QUEST_BOARD.fixedGroups[groupIndex];
  const available = [...QUEST_BOARD.repeatTasks];
  const selected = fixed ? fixed.tasks : [];
  while (!fixed && selected.length < QUEST_BOARD.batchSize && available.length) {
    selected.push(available.splice(randomInt(0, available.length - 1), 1)[0]);
  }
  const rewards = fixed ? fixed.rewards : rollQuestRewards(QUEST_BOARD.batchSize, selected);
  return {
    version: QUEST_BOARD.schemaVersion, contentVersion: QUEST_BOARD.contentVersion, groupIndex,
    tasks: selected.map((entry, index) => {
      let target = entry.targets ? choose(entry.targets) : entry.target;
      if (entry.relativeToRecord) target = Math.max(entry.minimumTarget, (Number(save?.statistics?.towerBestRunRounds) || 0) + target);
      const quest = { ...entry, id: entry.id + '-' + groupIndex, target };
      quest.startValue = Number(save?.questBook?.counters?.[questCounterKey(quest)]) || 0;
      if (entry.type === 'partyLevelGain') quest.startLevels = {
        main: characterLevel(save?.mainClass, save),
        companion: save?.activeCompanion ? characterLevel(save.activeCompanion, save) : 0,
      };
      quest.description = questBoardDescription(quest);
      return { quest, reward: cloneState(rewards[index]), claimed: false };
    }),
  };
}
function rollQuestRewards(count, tasks = []) {
  const available = [...QUEST_BOARD.rewardPool];
  const rewards = [];
  while (rewards.length < count && available.length) rewards.push(cloneState(available.splice(randomInt(0, available.length - 1), 1)[0]));
  const needsTower = tasks.some(task => ['tower', 'towerRounds', 'towerBosses', 'upgradeStoneDrops', 'socketStoneDrops', 'affixStoneDrops', 'gemDrops'].includes(task.type));
  const needsBoss = tasks.some(task => task.type === 'bossRank');
  for (const [slot, needed] of [['bossReset', needsBoss], ['towerReset', needsTower]]) {
    if (!needed || rewards.some(reward => reward.type === 'material' && reward.slot === slot)) continue;
    let index = rewards.findIndex(reward => reward.type === 'souls');
    if (index < 0) index = rewards.findIndex(reward => reward.type === 'material' && !['bossReset', 'towerReset'].includes(reward.slot));
    if (index >= 0) rewards[index] = { type: 'material', slot, quantity: 1 };
  }
  return rewards;
}
function questBoardProgress(save, quest) {
  const counters = save.questBook.counters;
  const key = questCounterKey(quest);
  if (Object.hasOwn(counters, key)) return Math.min(quest.target, Math.max(0, counters[key] - (quest.startValue || 0)));
  const owners = [save.mainClass, save.activeCompanion].filter(Boolean);
  const gear = owners.map(owner => equipmentForClass(owner, save));
  const mainGear = equipmentForClass(save.mainClass, save);
  const armorSlots = ['helmet', 'chest', 'gloves', 'boots'];
  const armorRanks = gear.map(equipment => armorSlots.every(slot => equipment[slot])
    ? Math.min(...armorSlots.map(slot => equipment[slot].upgradeLevel || 0)) : 0);
  const classWeapons = owners.map((owner, index) => CLASS_WEAPONS[owner]?.includes(gear[index].mainHand?.slot) ? gear[index].mainHand : null);
  const levels = owners.map(owner => characterLevel(owner, save));
  const values = {
    mainLevel: characterLevel(save.mainClass, save),
    companionLevel: save.activeCompanion ? characterLevel(save.activeCompanion, save) : 0,
    mainPetLevel: petForClass(save.mainClass, save)?.level || 0,
    companionPetLevel: petForClass(save.activeCompanion, save)?.level || 0,
    partyPetLevel: owners.length === 2 ? Math.min(...owners.map(owner => petForClass(owner, save)?.level || 0)) : 0,
    mainSkillPoints: spentSkillTreePoints(save.mainClass, save),
    partySkillPoints: owners.length === 2 ? Math.min(...owners.map(owner => spentSkillTreePoints(owner, save))) : 0,
    partyLevel: owners.length === 2 ? Math.min(...levels) : 0,
    partyLevelGain: owners.length === 2 ? Math.min(
      levels[0] - (quest.startLevels?.main || 0),
      levels[1] - (quest.startLevels?.companion || 0)) : 0,
    tower: save.statistics?.towerBestRunRounds || 0, deepTier: save.deepOfDark?.tier || 0,
    areaReached: [save.questBook.completedAreas, save.visitedAreas, save.deepOfDark?.clearedAreas].some(areas => areas?.includes(quest.areaId)) ? 1 : 0,
    bossRank: Number.isInteger(save.bossChallenge?.highestRank) ? save.bossChallenge.highestRank + 1 : 0,
    armorUpgrade: quest.scope === 'both' ? (owners.length === 2 ? Math.min(...armorRanks) : 0) : Math.max(0, ...armorRanks),
    weaponsUpgrade: owners.length === 2 && classWeapons.every(Boolean) ? Math.min(...classWeapons.map(item => item.upgradeLevel || 0)) : 0,
    weaponSockets: Math.max(0, ...classWeapons.filter(Boolean).map(item => quest.filled ? (item.sockets || []).filter(Boolean).length : item.socketSlots || 0)),
    equippedSlots: Object.values(mainGear).filter(Boolean).length,
    armorPiecesEquipped: armorSlots.filter(slot => mainGear[slot]).length,
    ring: ['ring1', 'ring2'].filter(slot => mainGear[slot]).length,
    armorSetPieces: armorSlots.filter(slot => mainGear[slot]?.set === quest.set).length,
    armorSetRank: Math.max(0, ...Object.keys(ARMOR_SETS).map(set => armorSlots.every(slot => mainGear[slot]?.set === set) ? Math.min(...armorSlots.map(slot => mainGear[slot].upgradeLevel || 0)) : 0)),
  };
  return Math.min(quest.target, Math.max(0, values[quest.type] || 0));
}
function dailyAttemptDay(now = Date.now()) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: BALANCE.dailyAttempts.timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
}
function normalizeDailyAttempts(save, now = Date.now()) {
  const previous = save.dailyAttempts || {};
  const day = dailyAttemptDay(now);
  const value = { day };
  for (const mode of ['boss', 'tower']) {
    const entry = previous[mode] || {};
    const safeCount = count => Number.isSafeInteger(count) && count >= 0 ? count : 0;
    value[mode] = { used: previous.day === day ? safeCount(entry.used) : 0, bonus: safeCount(entry.bonus) };
  }
  save.dailyAttempts = value;
  return value;
}
function dailyAttemptStatus(mode, sourceState = state) {
  const quota = normalizeDailyAttempts(sourceState)[mode];
  const limit = BALANCE.dailyAttempts[mode] + (vipIsActive(sourceState) ? BALANCE.dailyAttempts.vipBonus : 0);
  const free = Math.max(0, limit - quota.used);
  return { free, bonus: quota.bonus, remaining: free + quota.bonus, limit };
}
function consumeDailyAttempt(save, mode) {
  const status = dailyAttemptStatus(mode, save);
  if (!status.remaining) throw new Error('Keine Versuche mehr vorhanden. Neue Tagesversuche gibt es um Mitternacht oder mit einem Zeitstein.');
  if (status.free) save.dailyAttempts[mode].used += 1;
  else save.dailyAttempts[mode].bonus -= 1;
}
function dailyAttemptLabel(mode) {
  const attempts = dailyAttemptStatus(mode);
  return `${attempts.free} / ${attempts.limit} frei${attempts.bonus ? ` + ${attempts.bonus} Steinversuch` : ''}`;
}
function normalizeSaveState(save) {
  normalizeLegacyWeapons(save);
  if (!save) return save;
  save.inventoryCapacity = BALANCE.inventory.maxCapacity;
  normalizeDailyAttempts(save);
  normalizeOfflineFarm(save);
  migrateRemovedMaterials(save);
  save.statistics ||= {};
  save.vipExpiresAt = Number.isFinite(Number(save.vipExpiresAt)) ? Math.max(0, Math.floor(Number(save.vipExpiresAt))) : 0;
  const legacyTowerBest = Math.max(0, Math.floor(Number(save.towerBest) || 0));
  save.statistics.towerRoundsWon = Math.max(Number(save.statistics.towerRoundsWon) || 0, legacyTowerBest);
  save.statistics.towerBestRunRounds = Math.max(Number(save.statistics.towerBestRunRounds) || 0, legacyTowerBest);
  delete save.towerFloor;
  delete save.towerBest;
  if (!Number.isFinite(Number(save.statistics.soulsEarned))) {
    save.statistics.soulsEarned = Math.max(0, Number(save.questBook?.counters?.soulsEarned) || 0);
  }
  ['towerRoundsWon', 'towerBestRunRounds', 'playTimeMs', 'deaths', 'monstersKilled', 'soulsEarned', 'damageDealt', 'highestHit', 'forgeAttempts', 'socketAttempts', 'raritiesUpgraded', 'affixesRerolled', 'itemsSold', 'autoSoldItems'].forEach((key) => {
    save.statistics[key] = Math.max(0, Number(save.statistics[key]) || 0);
  });
  save.statistics.luckyBoxesOpened ||= {};
  BOX_GROUPS.forEach((key) => {
    save.statistics.luckyBoxesOpened[key] = Math.max(0, Number(save.statistics.luckyBoxesOpened[key]) || 0);
  });
  save.settings ||= {};
  if (save.settings.towerLoot === 'powerupBox') save.settings.towerLoot = 'powerup';
  if (!(BALANCE.loot.towerLootChoices || []).some(choice => choice.id === save.settings.towerLoot)) save.settings.towerLoot = 'upgradeStone';
  save.settings.autoSkillsDefault = save.settings.autoSkillsDefault !== false;
  save.settings.compactDamageNumbers = save.settings.compactDamageNumbers === true;
  ['forgeAnimations', 'socketAnimations', 'enchantAnimations'].forEach(key => { save.settings[key] = save.settings[key] !== false; });
  save.settings.autoSellNonSet = save.settings.autoSellNonSet === true;
  if (save.workshopJob != null && !validWorkshopJob(save.workshopJob)) save.workshopJob = null;
  if (!validLootCollectionRules(save.settings.lootCollectionRules)) save.settings.lootCollectionRules = { enabled: false, rules: [] };
  const exclusions = save.settings.enchantExcludedAffixes || {};
  save.settings.enchantExcludedAffixes = Object.fromEntries(['equipment', 'pet'].map(group => [group,
    [...new Set((Array.isArray(exclusions[group]) ? exclusions[group] : []).filter(stat =>
      (group === 'pet' ? PET_RULES.affixPool : Object.values(AFFIX_POOLS).flat()).includes(stat)))]]));
  const lootFilterRarities = new Set(RARITIES.map((rarity) => rarity.color));
  save.settings.autoSellRarities = [...new Set((Array.isArray(save.settings.autoSellRarities) ? save.settings.autoSellRarities : []).filter((rarity) => lootFilterRarities.has(rarity)))];
  const deepTierMaximum = BALANCE.deepOfDark?.maxTier || 3;
  save.deepOfDark ||= { tier: 0, clearedAreas: [...(save.visitedAreas || [])] };
  save.deepOfDark.tier = Math.max(0, Math.min(deepTierMaximum, Math.floor(Number(save.deepOfDark.tier) || 0)));
  save.deepOfDark.clearedAreas = Array.isArray(save.deepOfDark.clearedAreas)
    ? [...new Set(save.deepOfDark.clearedAreas.filter((areaId) => AREAS.some((area) => area.id === areaId)))]
    : [...(save.visitedAreas || [])];
  save.mailbox = Array.isArray(save.mailbox) ? save.mailbox.slice(0, MAILBOX_CAPACITY) : [];
  const activePowerupStats = new Set();
  if (migrateRetiredTowerLootBoost(save)) Object.defineProperty(save, 'towerLootMigrationPending', { value: true, configurable: true });
  save.activePowerups = (Array.isArray(save.activePowerups) ? save.activePowerups : []).filter((entry) => {
    if (!entry || entry.expiresAt <= Date.now() || activePowerupStats.has(entry.stat)) return false;
    activePowerupStats.add(entry.stat);
    return true;
  }).slice(0, 40);
  save.bossChallenge ||= { lastAttemptAt: 0, lastClaimedAt: 0 };
  save.bossChallenge.highestRank = Number.isInteger(save.bossChallenge.highestRank) ? save.bossChallenge.highestRank : -1;
  save.bossChallenge.bestDamage = Number.isFinite(Number(save.bossChallenge.bestDamage)) ? Math.max(0, Math.floor(Number(save.bossChallenge.bestDamage))) : 0;
  save.bossChallenge.reservedStorageSlots = Math.max(0, Math.min(4, Math.floor(Number(save.bossChallenge.reservedStorageSlots) || 0)));
  recoverOverflowSocketGems(save);
  normalizeGearSave(save);
  normalizeEquipmentSlotProgress(save);
  normalizeInventoryStacks(save);
  const allSavedItems = [
    ...(save.inventory || []),
    ...(save.mailbox || []).map((entry) => entry.item).filter(Boolean),
    ...Object.values(save.equipment?.main || {}),
    ...Object.values(save.equipment?.companions || {}).flatMap((gear) => Object.values(gear || {})),
  ];
  allSavedItems.forEach((item) => {
    if (!item) return;
    delete item.special;
    delete item.specialId;
  });
  const legacyLevel = Math.max(1, Math.floor(Number(save.level) || 1));
  save.characterLevels ||= {};
  Object.keys(CLASSES).forEach((className) => {
    save.characterLevels[className] = Math.max(1, Math.floor(Number(save.characterLevels[className]) || legacyLevel));
  });
  save.skillTree ||= {};
  const skillTreeNodeById = new Map(SKILL_TREE_NODES.map((node) => [node.id, node]));
  Object.keys(CLASSES).forEach((className) => {
    const savedTree = save.skillTree[className];
    const savedNodes = savedTree?.version === BALANCE.skillTree.schemaVersion ? savedTree.nodes || {} : {};
    const nodes = Object.fromEntries(Object.entries(savedNodes).flatMap(([id, points]) => {
      const node = skillTreeNodeById.get(id);
      const count = node ? Math.min(node.maxPoints, Math.floor(Number(points) || 0)) : 0;
      return count > 0 ? [[id, count]] : [];
    }));
    const passiveNodes = SKILL_TREE_NODES.filter(node => node.class === className && node.effect?.type === 'class-skill' && node.effect.kind === 'passive' && nodes[node.id] > 0);
    passiveNodes.slice(GAME_CONFIG.classSkillRules.maxPassives).forEach(node => delete nodes[node.id]);
    const exclusiveGroups = new Set();
    SKILL_TREE_NODES.filter(node => node.exclusiveGroup && nodes[node.id] > 0).forEach(node => {
      if (exclusiveGroups.has(node.exclusiveGroup)) delete nodes[node.id];
      else exclusiveGroups.add(node.exclusiveGroup);
    });
    const legendaryBranches = new Set();
    SKILL_TREE_NODES.filter(node => node.rarity === 'legendary' && nodes[node.id] > 0).forEach(node => {
      if (legendaryBranches.has(node.branch)) delete nodes[node.id];
      else legendaryBranches.add(node.branch);
    });
    let removedLocked;
    do {
      removedLocked = false;
      SKILL_TREE_NODES.forEach(node => {
        if (nodes[node.id] && !skillTreeNodeUnlocked(node, nodes, className)) { delete nodes[node.id]; removedLocked = true; }
      });
    } while (removedLocked);
    // Keep the level-earned point budget without breaking child prerequisites.
    let excess = Object.values(nodes).reduce((sum, rank) => sum + rank, 0) - earnedSkillTreePoints(className, save);
    const refundOrder = [...SKILL_TREE_NODES].reverse().sort((a, b) => Number(a.rarity === 'legendary') - Number(b.rarity === 'legendary'));
    while (excess > 0) {
      const refundable = refundOrder.find(node => {
        const required = Math.max(0, ...SKILL_TREE_NODES.filter(child => child.parent === node.id && nodes[child.id] > 0).map(skillTreeRequiredParentPoints));
        return Number(nodes[node.id] || 0) > required;
      });
      if (!refundable) break;
      if (--nodes[refundable.id] === 0) delete nodes[refundable.id];
      excess--;
    }
    save.skillTree[className] = { version: BALANCE.skillTree.schemaVersion, nodes };
  });
  if (save.mainClass && CLASSES[save.mainClass]) save.level = save.characterLevels[save.mainClass];
  save.companions ||= {};
  save.activeCompanion = Object.hasOwn(CLASSES, save.activeCompanion) && save.activeCompanion !== save.mainClass
    ? save.activeCompanion
    : Object.keys(CLASSES).find((className) => className !== save.mainClass) || null;
  if (save.mainClass) normalizePet(save);
  Object.keys(CLASSES).forEach((className) => {
    save.companions[className] ||= {};
    const companion = save.companions[className];
    delete companion.passiveSkillIndex;
    delete companion.secondPassiveSkillIndex;
    const actives = COMPANION_SKILLS[className].active;
    const selected = Math.max(0, Math.min(actives.length - 1, Number(companion.activeSkillIndex) || 0));
    companion.activeSkillIndex = selected;
    companion.skills = COMPANION_SKILLS[className];
  });
  if (Array.isArray(save.activityLog)) {
    const previousLength = save.activityLog.length;
    save.activityLog = save.activityLog.filter((entry) => !LEGACY_COMBAT_ACTIVITY.has(entry.title) && isUsefulActivity(entry.title));
    const removedCount = previousLength - save.activityLog.length;
    if (removedCount) save.activityUnread = Math.max(0, (Number(save.activityUnread) || 0) - removedCount);
  }
  const defaults = defaultContractState();
  save.contracts ||= defaults;
  Object.entries(defaults).forEach(([id, value]) => {
    if (id === 'rewardProgress' || id === 'rewardClaims') return;
    save.contracts[id] ||= value;
    save.contracts[id].rank = Math.max(1, Number(save.contracts[id].rank) || 1);
    save.contracts[id].completed = Math.max(0, Number(save.contracts[id].completed) || 0);
    if (id === 'survey') save.contracts[id].areas = Array.isArray(save.contracts[id].areas) ? save.contracts[id].areas : [];
    else save.contracts[id].progress = Math.max(0, Number(save.contracts[id].progress) || 0);
  });
  save.contracts.rewardProgress = Math.max(0, Number(save.contracts.rewardProgress) || 0);
  save.contracts.rewardClaims = Math.max(0, Math.min(CONTRACT_MILESTONE_REWARDS.length, Number(save.contracts.rewardClaims) || 0));
  Object.keys(CONTRACTS).forEach((id) => {
    if (!contractComplete(save, id)) return;
    save.contracts.rewardProgress += 1;
    save.contracts[id].rank += 1;
    save.contracts[id].completed += 1;
    if (id === 'survey') save.contracts[id].areas = [];
    else save.contracts[id].progress = 0;
  });
  const questDefaults = defaultQuestBook();
  save.questBook ||= questDefaults;
  save.questBook.unlockedStages = Math.max(1, Math.min(QUEST_STAGES.length, Number(save.questBook.unlockedStages) || 1));
  save.questBook.claimed ||= {};
  save.questBook.stageRewards ||= {};
  // Discovery resets per Deep cycle; area milestones remain completed forever.
  // A legitimately unlocked deeper tier proves all regions were won before.
  save.questBook.completedAreas = [...new Set([
    ...(Array.isArray(save.questBook.completedAreas) ? save.questBook.completedAreas : []),
    ...(save.visitedAreas || []),
    ...(save.deepOfDark.clearedAreas || []),
    ...(save.deepOfDark.tier > 0 ? AREAS.map(area => area.id) : []),
  ])].filter(id => AREAS.some(area => area.id === id));
  save.questBook.counters ||= questDefaults.counters;
  if (save.questBook.counters.towerRounds === undefined) save.questBook.counters.towerRounds = save.statistics.towerRoundsWon || 0;
  Object.keys(questDefaults.counters).forEach((key) => { save.questBook.counters[key] = Math.max(0, Number(save.questBook.counters[key]) || 0); });
  save.statistics.towerBossesKilled = Math.max(0, Math.floor(Number(save.statistics.towerBossesKilled) || 0), Math.floor(save.questBook.counters.towerBosses || 0));
  save.questBook.board ||= makeQuestBoardGroup(Object.values(save.questBook.stageRewards).filter(Boolean).length, save);
  if (save.questBook.board.version !== QUEST_BOARD.schemaVersion) {
    save.questBook.board = makeQuestBoardGroup(0, save);
    save.questBook.completedGroups = 0;
  }
  if (save.questBook.board.contentVersion !== QUEST_BOARD.contentVersion) {
    const previous = save.questBook.board;
    const updated = makeQuestBoardGroup(previous.groupIndex, save);
    updated.tasks.forEach((entry, index) => {
      const previousEntry = previous.tasks[index];
      if (previousEntry?.claimed) {
        entry.claimed = true;
        entry.reward = previousEntry.reward;
      }
      const matchingQuest = previous.tasks.find(old => old.quest.type === entry.quest.type
        && Math.min(old.quest.minimumDeepTier || 0, BALANCE.deepOfDark.maxTier) === (entry.quest.minimumDeepTier || 0)
        && old.quest.scope === entry.quest.scope && Boolean(old.quest.filled) === Boolean(entry.quest.filled))?.quest;
      if (matchingQuest) {
        const previousKey = questCounterKey(matchingQuest);
        const currentKey = questCounterKey(entry.quest);
        if (previousKey === currentKey) entry.quest.startValue = matchingQuest.startValue || 0;
        else {
          const progress = Math.max(0, (save.questBook.counters[previousKey] || 0) - (matchingQuest.startValue || 0));
          entry.quest.startValue = Math.max(0, (save.questBook.counters[currentKey] || 0) - progress);
        }
        if (matchingQuest.startLevels) entry.quest.startLevels = matchingQuest.startLevels;
      }
    });
    save.questBook.board = updated;
  }
  save.questBook.completedGroups = Math.max(Number(save.questBook.completedGroups) || 0, Number(save.questBook.board.groupIndex) || 0);
  syncEquipmentShop(save);
  normalizeHuntingEvent(save);
  return save;
}
function contractTarget(save, id) {
  const rank = save.contracts[id].rank;
  const rules = BALANCE.contracts;
  if (id === 'hunt') return rules.huntTargetBase + Math.floor((rank - 1) / rules.huntRankStep);
  if (id === 'survey') return Math.min(rules.surveyTargetMax, rules.surveyTargetBase + Math.floor((rank - 1) / rules.surveyRankStep));
  return rules.towerTargetBase + Math.floor((rank - 1) / rules.towerRankStep);
}
function contractProgress(save, id) {
  return id === 'survey' ? save.contracts.survey.areas.length : save.contracts[id].progress;
}
function contractComplete(save, id) {
  return contractProgress(save, id) >= contractTarget(save, id);
}
function contractRewardTarget() { return BALANCE.contracts.rewardTarget; }
function contractRewardAmount(save) {
  const rankTotal = Object.keys(CONTRACTS).reduce((sum, id) => sum + (save.contracts[id].rank - 1), 0);
  const rules = BALANCE.contracts;
  return rules.rewardBase + partyLevel(save) * rules.rewardPerLevel + rankTotal * rules.rewardPerRank;
}
function completeContract(save, id) {
  const record = save.contracts[id];
  if (!contractComplete(save, id)) return false;
  save.contracts.rewardProgress += 1;
  record.rank += 1;
  record.completed = (record.completed || 0) + 1;
  if (id === 'survey') record.areas = [];
  else record.progress = 0;
  return true;
}
function questProgress(save, quest) {
  const equipment = save.equipment?.main || {};
  const items = Object.values(equipment).filter(Boolean);
  const rings = ['ring1', 'ring2'].filter((slot) => equipment[slot]).length;
  const setArmor = ['helmet', 'chest', 'gloves', 'boots'].map((slot) => [slot, equipment[slot]]).filter(([, item]) => item?.set);
  const setCounts = {};
  setArmor.forEach(([, item]) => { setCounts[item.set] = (setCounts[item.set] || 0) + 1; });
  const rarityValue = Object.fromEntries(RARITIES.map((rarity, index) => [rarity.color, index]));
  const rarityThreshold = rarityValue[quest.rarity] ?? 0;
  const rarityCount = items.filter((item) => (rarityValue[item.rarityColor] ?? 0) >= rarityThreshold).length;
  const companionRarityCount = Object.values(save.equipment?.companions || {}).flatMap((entry) => Object.values(entry || {}))
    .filter((item) => item && (rarityValue[item.rarityColor] ?? 0) >= rarityThreshold).length;
  const maxSetCount = Math.max(0, ...Object.values(setCounts));
  const availableSlots = ['helmet', 'chest', 'gloves', 'boots', 'mainHand', 'amulet', 'ring1', 'ring2', 'earring1', 'earring2', 'offHand']
    .filter((slot) => slot !== 'mainHand' || CLASS_WEAPONS[save.mainClass]?.length)
    .filter((slot) => slot !== 'offHand' || save.mainClass === 'warrior');
  const everySlotLegendary = availableSlots.length > 0 && availableSlots.every((slot) => (rarityValue[equipment[slot]?.rarityColor] ?? -1) >= rarityValue.legendary);
  const values = {
    ring: rings, armorSet: maxSetCount, equippedSlots: items.length, equipmentDrops: counters.equipmentDrops, level: partyLevel(save),
    regions: save.visitedAreas?.length || 0, purchases: save.questBook?.counters?.purchases || 0,
    jewelryPurchases: save.questBook?.counters?.jewelryPurchases || 0,
    jewelryDrops: save.questBook?.counters?.jewelryDrops || 0,
    gemPurchases: save.questBook?.counters?.gemPurchases || 0,
    socketAttempts: save.questBook?.counters?.socketAttempts || 0,
    forges: save.questBook?.counters?.forges || 0, rarity: rarityCount,
    areaWins: save.questBook?.counters?.areaWins || 0,
    champions: save.questBook?.counters?.champions || 0, tower: save.statistics?.towerBestRunRounds || 0,
    allLegendary: everySlotLegendary ? 1 : 0,
    companionRarity: companionRarityCount,
    moonbreak: partyLevel(save) >= 301 && save.visitedAreas?.includes('mondbruch') ? 1 : 0,
  };
  return Math.min(quest.target, values[quest.type] || 0);
}
function questComplete(save, quest) { return questProgress(save, quest) >= quest.target; }
function questStageComplete(save, index) { return QUEST_STAGES[index].quests.every((quest) => questComplete(save, quest)); }
function questIndividualReward(stageIndex) { return BALANCE.questBook.individualRewardPerStage * (stageIndex + 1); }
function questStageAvailable(save, index) {
  return index === 0 || Boolean(save.questBook?.stageRewards?.[index - 1]);
}
function areaUnlocked(save, areaIndex) {
  if (areaIndex === 0) return true;
  const cleared = save.deepOfDark?.clearedAreas || save.visitedAreas || [];
  return AREAS.slice(0, areaIndex).every((area) => cleared.includes(area.id));
}
function highestUnlockedAreaIndex(save) {
  return AREAS.reduce((highest, area, index) => areaUnlocked(save, index) ? index : highest, 0);
}
function towerUnlocked(save) {
  return true;
}
function defaultState() {
  return {
    playerName: null, mainClass: null, souls: 0, level: 1, experience: 0, vipExpiresAt: 0,
    huntingEvent: null,
    statistics: { towerBossesKilled: 0, towerRoundsWon: 0, towerBestRunRounds: 0, playTimeMs: 0, deaths: 0, monstersKilled: 0, soulsEarned: 0, damageDealt: 0, highestHit: 0, luckyBoxesOpened: { glyphBox: 0, vipBox: 0, farmBox: 0, materialBox: 0 }, forgeAttempts: 0, socketAttempts: 0, raritiesUpgraded: 0, affixesRerolled: 0, itemsSold: 0, autoSoldItems: 0 },
    pets: {},
    characterLevels: Object.fromEntries(Object.keys(CLASSES).map((className) => [className, 1])),
    skillTree: Object.fromEntries(Object.keys(CLASSES).map((className) => [className, { version: BALANCE.skillTree.schemaVersion, nodes: {} }])),
    inventoryCapacity: BALANCE.startingInventoryCapacity, visitedAreas: [], deepOfDark: { tier: 0, clearedAreas: [] }, inventory: [], mailbox: [],
    activityLog: [], activityUnread: 0, contracts: defaultContractState(), questBook: defaultQuestBook(),
    settings: { forgeAnimations: true, socketAnimations: true, enchantAnimations: true, autoSkillsDefault: true, compactDamageNumbers: false, autoSellRarities: [], autoSellNonSet: false, towerLoot: 'upgradeStone' },
    bossChallenge: { lastAttemptAt: 0, lastClaimedAt: 0, highestRank: -1, bestDamage: 0 },
    activeCompanion: null, activePowerups: [], equipment: { main: {}, companions: {} }, equipmentSlotProgress: {},
    companions: Object.fromEntries(Object.keys(CLASSES).map((className) => [className, { activeSkillIndex: 0, weapon: null, skills: COMPANION_SKILLS[className] }])),
  };
}
async function readSavedState() {
  const db = await openSaveDatabase();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(SAVE_STORE, 'readonly');
    const read = transaction.objectStore(SAVE_STORE).get(SAVE_KEY);
    read.onsuccess = () => {
      saveRevision = read.result?.revision || 0;
      const rawSave = read.result?.state || null;
      const needsPet = rawSave?.mainClass && (!rawSave.pets?.[rawSave.mainClass]
        || (rawSave.activeCompanion && !rawSave.pets?.[rawSave.activeCompanion]));
      const normalized = normalizeSaveState(rawSave);
      if (needsPet && normalized) Object.defineProperty(normalized, 'petNeedsPersist', { value: true });
      if (normalized?.huntingEvent && (rawSave?.huntingEvent?.id !== normalized.huntingEvent.id || !rawSave?.huntingEvent?.nextAvailableAt)) Object.defineProperty(normalized, 'huntNeedsPersist', { value: true });
      resolve(normalized);
    };
    read.onerror = () => reject(read.error || new Error('Der Spielstand konnte nicht gelesen werden.'));
    transaction.onabort = () => reject(transaction.error || new Error('Das Lesen des Spielstands wurde abgebrochen.'));
  });
}
function writeSavedState(nextState) {
  checkpointOnlineFarm(nextState);
  const snapshot = cloneState(nextState);
  const generation = stateGeneration;
  const task = saveWriteQueue.then(async () => {
    if (saveBlocked || generation !== stateGeneration) throw new Error('Dieser Spielstand darf nicht mehr gespeichert werden.');
    const db = await openSaveDatabase();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(SAVE_STORE, 'readwrite');
      const store = transaction.objectStore(SAVE_STORE);
      const read = store.get(SAVE_KEY);
      let conflict = false;
      let nextRevision;
      read.onsuccess = () => {
        if ((read.result?.revision || 0) !== saveRevision) {
          conflict = true;
          transaction.abort();
          return;
        }
        nextRevision = saveRevision + 1;
        store.put({ id: SAVE_KEY, state: snapshot, revision: nextRevision, savedAt: Date.now() });
      };
      transaction.oncomplete = () => { saveRevision = nextRevision; resolve(nextState); };
      transaction.onerror = () => reject(transaction.error || new Error('Der Spielstand konnte nicht gespeichert werden.'));
      transaction.onabort = () => {
        if (conflict) blockConflictingSave();
        reject(new Error(conflict ? 'Ein anderer Tab hat einen neueren Spielstand gespeichert. Bitte lade die Seite neu.' : 'Das Speichern des Spielstands wurde abgebrochen.'));
      };
    });
  });
  saveWriteQueue = task.catch(() => {});
  return task;
}
function createItemId() {
  return crypto.randomUUID?.() || `item-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}
function shopPriceForLevel(level, group) {
  return SHOP_COSTS[group] || 0;
}
function maxAffordableShopQuantity(sourceState, group, limit = 1000) {
  const unitCost = shopPriceForLevel(partyLevel(sourceState), group);
  if (unitCost <= 0) return 0;
  return Math.max(0, Math.min(limit, Math.floor((Number(sourceState?.souls) || 0) / unitCost)));
}
function groupLevelCost(level) {
  const rules = BALANCE.groupLevel;
  return Math.round(rules.costBase + level * rules.costPerLevel + level ** 2 * rules.costQuadratic);
}
function characterLevel(className, sourceState = state) {
  return Math.max(1, Math.floor(Number(sourceState?.characterLevels?.[className] ?? sourceState?.level) || 1));
}
function earnedSkillTreePoints(className, sourceState = state) {
  const rules = BALANCE.skillTree || {};
  const levelsPerPoint = Math.max(1, Math.floor(Number(rules.pointsEveryLevels) || 1));
  return Math.min(rules.maxPoints, Math.floor(characterLevel(className, sourceState) / levelsPerPoint));
}
function spentSkillTreePoints(className, sourceState = state) {
  const nodes = sourceState?.skillTree?.[className]?.nodes || {};
  return SKILL_TREE_NODES.reduce((sum, node) => sum + Math.max(0, Number(nodes[node.id]) || 0), 0);
}
function partySkillTreeEffectValue(type, sourceState = state) {
  const owners = [...new Set([sourceState?.mainClass, sourceState?.activeCompanion].filter(Boolean))];
  return owners.reduce((maximum, className) => {
    const nodes = sourceState?.skillTree?.[className]?.nodes || {};
    const value = SKILL_TREE_NODES.reduce((sum, node) => {
      if (node.effect?.type !== type) return sum;
      return sum + effectiveSkillTreeNodeRank(node, className, sourceState) * Number(node.effect.perPoint || 0);
    }, 0);
    return Math.max(maximum, value);
  }, 0);
}
function partyLevel(sourceState = state) {
  const members = [...new Set([sourceState?.mainClass, sourceState?.activeCompanion].filter((className) => className && CLASSES[className]))];
  if (!members.length) return Math.max(1, Number(sourceState?.level) || 1);
  return Math.round(members.reduce((sum, className) => sum + characterLevel(className, sourceState), 0) / members.length);
}
function highestPartyLevel(sourceState = state) {
  return Math.max(1, ...dropPartyClasses(sourceState).map(owner => characterLevel(owner, sourceState)));
}
// Keep the first difficulty's geography; subsequent stages grow by equal percentage steps.
function areaEnemyScaledStat(areaId, deepTier, stat, finalValue) {
  const areaIndex = AREAS.findIndex(area => area.id === areaId);
  if (areaIndex < 0) return 0;
  const maximumTier = BALANCE.deepOfDark.maxTier;
  const tier = Math.max(0, Math.min(maximumTier, Math.floor(Number(deepTier) || 0)));
  if (!tier) return ENEMIES[areaId][stat];
  const baseline = ENEMIES[AREAS[AREAS.length - 1].id][stat];
  const progress = ((tier - 1) * AREAS.length + areaIndex + 1) / (maximumTier * AREAS.length);
  return Math.round(baseline * (finalValue / baseline) ** progress);
}
function areaEnemyBaseHealth(areaId, deepTier = 0) {
  return areaEnemyScaledStat(areaId, deepTier, 'hp', BALANCE.deepOfDark.enemyHealthAtFinalArea);
}
function areaFirstClearSouls(areaId, deepTier = 0) {
  const areaNumber = AREAS.findIndex(area => area.id === areaId) + 1;
  const tier = Math.max(1, Math.min(BALANCE.loot.firstClearMaximumTierMultiplier, Math.floor(Number(deepTier) || 0)));
  return areaNumber * tier * BALANCE.loot.firstClearSoulsPerArea;
}
// Non-overlapping base soul ranges across all six difficulties.
function areaSoulRewardRange(areaId, deepTier = 0) {
  const areaIndex = AREAS.findIndex(area => area.id === areaId);
  if (areaIndex < 0) return [0, 0];
  const maximumTier = BALANCE.deepOfDark.maxTier;
  const tier = Math.max(0, Math.min(maximumTier, Math.floor(Number(deepTier) || 0)));
  const rules = BALANCE.areaSouls;
  const step = tier * AREAS.length + areaIndex;
  const lastStep = AREAS.length * (maximumTier + 1) - 1;
  const anchors = [{ step: 0, maximum: rules.firstAreaMaximum }, ...(rules.curveAnchors || []).map(anchor => ({
    step: (anchor.deepTier + 1) * AREAS.length - 1, maximum: anchor.maximum,
  }))];
  if (anchors.length === 1) anchors.push({ step: lastStep, maximum: rules.finalAreaMaximum });
  const upperAt = index => {
    const endIndex = anchors.findIndex(anchor => anchor.step >= index);
    if (endIndex <= 0) return endIndex === 0 ? anchors[0].maximum : anchors[anchors.length - 1].maximum;
    const start = anchors[endIndex - 1], end = anchors[endIndex];
    return Math.round(start.maximum + (end.maximum - start.maximum) * (index - start.step) / (end.step - start.step));
  };
  const maximum = upperAt(step);
  const minimum = step === 0 ? rules.firstAreaMinimum
    : Math.max(upperAt(step - 1) + 1, Math.round(maximum * rules.minimumRollRatio));
  return [minimum, maximum];
}
// Absolute attack damage is independent of hero HP.
function areaEnemyBaseDamage(areaId, deepTier = 0) {
  return areaEnemyScaledStat(areaId, deepTier, 'damage', BALANCE.deepOfDark.enemyDamageAtFinalArea);
}
function towerEncounterStats(sourceState = state, round = 1) {
  const rules = BALANCE.combat;
  const level = highestPartyLevel(sourceState);
  const scaling = rules.towerScaling;
  const towerRound = Math.max(1, Math.floor(Number(round) || 1));
  const progress = (towerRound - 1) / (scaling.referenceRound - 1);
  const interpolate = (start, target) => {
    // Continue the same percentage growth beyond the reference round; keep enemy pools finite.
    const exponent = Math.log(start) + Math.log(target / start) * progress;
    return Math.max(1, Math.round(Math.exp(Math.min(Math.log(Number.MAX_VALUE / 100), exponent))));
  };
  const health = interpolate(areaEnemyBaseHealth(scaling.startArea, scaling.startDeepTier), areaEnemyBaseHealth(scaling.targetArea, scaling.targetDeepTier));
  const damage = interpolate(areaEnemyBaseDamage(scaling.startArea, scaling.startDeepTier), areaEnemyBaseDamage(scaling.targetArea, scaling.targetDeepTier));
  return {
    level,
    round: towerRound,
    health,
    damage,
    soulsMinimum: Math.round(rules.towerSoulsMinimumBase + level * rules.towerSoulsMinimumPerLevel),
    soulsMaximum: Math.round(rules.towerSoulsMaximumBase + level * rules.towerSoulsMaximumPerLevel),
  };
}
function rarityWeightsForAreaIndex(areaIndex, sourceState = state) {
  const tables = BALANCE.items.rarityWeightsByArea || [];
  const weights = { ...(tables[Math.min(areaIndex, tables.length - 1)] || { common: 100 }) };
  const deepTier = Math.max(0, Number(sourceState?.deepOfDark?.tier) || 0);
  const tierWeights = BALANCE.deepOfDark?.rarityWeightsByTier?.[deepTier];
  const result = deepTier > 0 && tierWeights ? { ...tierWeights } : weights;
  if (deepTier === 0) delete result.legendary;
  const legendaryWeight = Math.max(0, Number(result.legendary) || 0);
  const bonusPercent = partySkillTreeEffectValue('legendary-drop-chance', sourceState);
  if (legendaryWeight > 0 && bonusPercent > 0) {
    const totalWeight = Object.values(result).reduce((sum, value) => sum + Math.max(0, Number(value) || 0), 0);
    const originalChance = totalWeight ? legendaryWeight / totalWeight : 0;
    const boostedChance = Math.min(1, originalChance * (1 + bonusPercent / 100));
    const otherTotal = totalWeight - legendaryWeight;
    result.legendary = boostedChance * 100;
    Object.keys(result).filter((rarity) => rarity !== 'legendary').forEach((rarity) => {
      result[rarity] = otherTotal > 0 ? (Math.max(0, Number(result[rarity]) || 0) / otherTotal) * (1 - boostedChance) * 100 : 0;
    });
  }
  return result;
}
function rarityForArea(areaId, sourceState = state) {
  const areaIndex = Math.max(0, AREAS.findIndex((area) => area.id === areaId));
  const weights = rarityWeightsForAreaIndex(areaIndex, sourceState);
  const entries = Object.entries(weights).filter(([, weight]) => Number.isFinite(weight) && weight > 0);
  const totalWeight = entries.reduce((sum, [, weight]) => sum + weight, 0);
  let roll = Math.random() * totalWeight;
  const color = entries.find(([, weight]) => (roll -= weight) < 0)?.[0] || 'common';
  return RARITIES.find((rarity) => rarity.color === color) || RARITIES[0];
}
function chooseWeightedRarity(save = state) {
  return rarityForArea(AREAS[highestUnlockedAreaIndex(save)].id, save);
}
function baseItemStatRange(slot, rarityColor, type) {
  if (rarityColor === 'mythic') {
    if (!MYTHIC_ITEMS.equipmentSlots.includes(slot)) return null;
    if (MYTHIC_ITEMS.weaponSlots.includes(slot)) return type === 'weaponDamage' ? MYTHIC_ITEMS.weaponBaseDamageRange : null;
    const legendary = baseItemStatRange(slot, 'legendary', type);
    return legendary ? [Math.max(legendary[1] + 1, Math.round(legendary[0] * MYTHIC_ITEMS.nonWeaponBaseStatMultiplier)),
      Math.max(legendary[1] + 1, Math.round(legendary[1] * MYTHIC_ITEMS.nonWeaponBaseStatMultiplier))] : null;
  }
  const isWeapon = type === 'weaponDamage';
  const rangeKey = isWeapon ? 'weaponBaseDamageRangesByRarity' : 'armorBaseDefenseRangesByRarity';
  const baseKey = isWeapon ? 'weaponBaseDamage' : 'armorBaseDefense';
  const configuredRange = BALANCE.items[rangeKey]?.[rarityColor]?.[slot];
  if (Array.isArray(configuredRange)) return configuredRange;
  const commonValue = BALANCE.items[baseKey]?.[slot];
  const rarityIndex = RARITIES.findIndex((rarity) => rarity.color === rarityColor);
  if (rarityIndex < 0 || !Number.isFinite(commonValue)) return null;
  const known = RARITIES.map((rarity, index) => ({ index, range: BALANCE.items[rangeKey]?.[rarity.color]?.[slot] }))
    .filter((entry) => Array.isArray(entry.range));
  const lower = [...known].reverse().find((entry) => entry.index < rarityIndex);
  const upper = known.find((entry) => entry.index > rarityIndex);
  const lowerRange = lower?.range || [commonValue, commonValue];
  if (!upper) return lowerRange;
  const span = upper.index - (lower?.index ?? 0);
  const progress = (rarityIndex - (lower?.index ?? 0)) / span;
  return [0, 1].map((bound) => Math.round(lowerRange[bound] + (upper.range[bound] - lowerRange[bound]) * progress));
}
function itemBaseStatRange(item, type) {
  const range = baseItemStatRange(item.slot, item.rarityColor, type);
  if (!range) return null;
  const multiplier = Math.pow(BALANCE.items.upgradeBaseStatMultiplier, item.upgradeLevel || 0);
  return range.map((value) => Math.round(Math.round(value * multiplier) * (type === 'weaponDamage' ? weaponLevelDamageMultiplier(item) : 1)));
}
function rollBaseItemStat(slot, rarityColor, type) {
  const range = baseItemStatRange(slot, rarityColor, type);
  if (!range) return null;
  return randomInt(range[0], range[1]);
}
function makeItem(slot, rarityName) {
  const rarity = RARITIES.find((entry) => rarityName === entry.name || rarityName === entry.color) || chooseWeightedRarity();
  if (rarity.color === 'mythic' && !MYTHIC_ITEMS.equipmentSlots.includes(slot)) throw new Error('Diese Gegenstandsart kann nicht mystisch sein.');
  if (slot === 'glyph' && rarity.color === 'mythic') {
    const glyph = makeGlyph(choose(GLYPH_DEFINITIONS));
    glyph.rarity = rarity.name; glyph.rarityColor = rarity.color; glyph.mythicUpgradeLevel = 0; glyph.affixVersion = 6;
    glyph.socketSlots = 0; glyph.sockets = [];
    return normalizeAffixUpgrades(glyph);
  }
  const weaponBaseDamage = rollBaseItemStat(slot, rarity.color, 'weaponDamage');
  const armorBaseDefense = rollBaseItemStat(slot, rarity.color, 'armorDefense');
  const implicitOnly = rarity.color === 'common' && (weaponBaseDamage || armorBaseDefense);
  const affixCount = implicitOnly ? 0 : (BALANCE.items.affixCountByRarity[rarity.color] ?? 0);
  const usedStats = [];
  const affixes = Array.from({ length: Math.min(affixCount, AFFIX_POOLS[slot].length) }, () => {
      const affix = rollAffix(slot, allowsRepeatedAffixes(slot) ? [] : usedStats);
      usedStats.push(affix.stat);
      return affix;
    });
  const item = {
    id: createItemId(), slot, name: choose(ITEM_NAMES[slot]), upgradeLevel: 0,
    rarity: rarity.name, rarityColor: rarity.color, icon: SLOT_DATA[slot].icon, affixVersion: 6,
    affixes, socketSlots: 0, sockets: [],
  };
  normalizeWeaponProgress(item);
  if (isMythicEquipment(item)) item.mythicUpgradeLevel = 0;
  if (weaponBaseDamage) {
    item.baseWeaponDamage = weaponBaseDamage;
    item.weaponDamage = weaponBaseDamage;
  }
  if (armorBaseDefense) {
    item.baseArmorDefense = armorBaseDefense;
    item.armorDefense = armorBaseDefense;
  }
  return isMythicEquipment(item) ? normalizeAffixUpgrades(item) : item;
}

function dropPartyClasses(save = state) {
  return [...new Set([save?.mainClass, save?.activeCompanion].filter(owner => CLASSES[owner]))];
}
function partyCanEquipDrop(item, save = state) {
  return dropPartyClasses(save).some(owner => {
    const slot = CLASS_WEAPONS[owner]?.includes(item.slot) ? 'mainHand'
      : item.slot === 'shield' ? 'offHand' : item.slot === 'ring' ? 'ring1'
        : item.slot === 'earring' ? 'earring1' : item.slot === 'glyph' ? 'glyph1' : item.slot;
    return validateEquipmentForClass(save, item, slot, owner);
  });
}
function equipmentSlotsForDrops(save = state) {
  return [...(EQUIPMENT_POOLS.weapon || []), ...(EQUIPMENT_POOLS.armor || []), ...(EQUIPMENT_POOLS.jewelry || [])]
    .filter(slot => partyCanEquipDrop({ slot }, save));
}
function setNamesForDrops(definitions, save = state) {
  const owners = dropPartyClasses(save);
  return Object.keys(definitions).filter(name => !definitions[name].class || owners.includes(definitions[name].class));
}
function makeAreaEquipmentDrop(areaId, save = state) {
  const rarity = rarityForArea(areaId, save);
  const slots = equipmentSlotsForDrops(save)
    .filter(slot => rarity.color !== 'common' || !['ring', 'amulet', 'earring'].includes(slot));
  if (!slots.length) throw new Error('Für diese Kampfgruppe ist keine tragbare Ausrüstung konfiguriert.');
  const slot = choose(slots);
  const item = makeItem(slot, rarity.name);
  const setChance = BALANCE.loot.areaSetDropChance || 0;
  const armorSets = setNamesForDrops(ARMOR_SETS, save);
  const jewelrySets = setNamesForDrops(JEWELRY_SETS, save);
  if (['helmet', 'chest', 'gloves', 'boots'].includes(slot) && armorSets.length && Math.random() < setChance) item.set = choose(armorSets);
  else if (['ring', 'amulet', 'earring'].includes(slot) && jewelrySets.length && Math.random() < setChance) item.set = choose(jewelrySets);
  return rollGreaterAffixes(item, save);
}
function mythicEquipmentDropChance(areaId, deepTier) {
  const rules = BALANCE.loot.mythicEquipment;
  if ((Number(deepTier) || 0) < rules.minimumDeepTier) return 0;
  return rules.dropChanceByArea[AREAS.findIndex(area => area.id === areaId)] || 0;
}
function questItemDefinition(item) {
  return QUEST_ITEM_RULES.definitions.find(definition => definition.id === item?.questItemId) || null;
}
function makeQuestItem(areaId, deepTier = 0, quantity = 1) {
  const definition = QUEST_ITEM_RULES.definitions.find(entry => entry.areaId === areaId);
  if (!definition) throw new Error('Unbekannter Questgegenstand.');
  const rarity = RARITIES[Math.max(0, Math.min(RARITIES.length - 1, Math.floor(Number(deepTier) || 0)))];
  return { id: createItemId(), slot: 'questItem', questItemId: definition.id, name: definition.name,
    rarity: rarity.name, rarityColor: rarity.color, icon: SLOT_DATA.questItem.icon,
    quantity: Math.max(1, Math.floor(Number(quantity) || 1)), upgradeLevel: 0, affixVersion: 6, affixes: [] };
}
function rollAreaQuestItemDrops(save, areaId, deepTier, killed) {
  let quantity = 0;
  const count = Math.max(0, Math.min(3, Math.floor(Number(killed) || 0)));
  for (let index = 0; index < count; index++) {
    if (Math.random() < QUEST_ITEM_RULES.dropChance) quantity++;
  }
  if (!quantity) return [];
  const item = makeQuestItem(areaId, deepTier, quantity);
  // Quest materials always go straight into storage, including when all gear slots are full.
  addItemsToInventory(save, [item]);
  return [item];
}
function makeMythicEquipmentDrop(save = state) {
  const slots = MYTHIC_ITEMS.equipmentSlots.filter(slot => partyCanEquipDrop({ slot }, save));
  if (!slots.length) throw new Error('Für diese Kampfgruppe ist keine passende mystische Ausrüstung verfügbar.');
  const item = makeItem(choose(slots), 'mythic');
  const definitions = ['helmet', 'chest', 'gloves', 'boots'].includes(item.slot) ? ARMOR_SETS
    : ['ring', 'amulet', 'earring'].includes(item.slot) ? JEWELRY_SETS : null;
  if (definitions && Math.random() < (BALANCE.loot.areaSetDropChance || 0)) {
    const names = setNamesForDrops(definitions, save);
    if (names.length) item.set = choose(names);
  }
  return rollGreaterAffixes(item, save);
}
function ascendEquipmentToMythic(item) {
  const previous = item.rarityColor;
  const multiplier = BALANCE.items.upgradeBaseStatMultiplier ** (item.upgradeLevel || 0);
  for (const [type, baseKey, finalKey] of [['weaponDamage', 'baseWeaponDamage', 'weaponDamage'], ['armorDefense', 'baseArmorDefense', 'armorDefense']]) {
    const oldRange = baseItemStatRange(item.slot, previous, type);
    const range = baseItemStatRange(item.slot, 'mythic', type);
    if (!range || !oldRange) continue;
    const base = item[baseKey] ?? item[finalKey] / multiplier;
    const position = oldRange[1] > oldRange[0] ? Math.max(0, Math.min(1, (base - oldRange[0]) / (oldRange[1] - oldRange[0]))) : .5;
    item[baseKey] = Math.round(range[0] + position * (range[1] - range[0]));
    item[finalKey] = Math.round(item[baseKey] * multiplier);
  }
  item.rarityColor = 'mythic';
  item.rarity = RARITIES.find(rarity => rarity.color === 'mythic').name;
  item.mythicUpgradeLevel = 0;
  item.affixVersion = 6;
  delete item.enchantAffixIndex;
  return normalizeAffixUpgrades(item);
}
function equipmentShopPrice(item) {
  if (isMythicEquipment(item)) return EQUIPMENT_SHOP.prices[(item.affixes || []).some(affix => affix.greater) ? 'legendaryGreater' : 'legendary'];
  const greater = item.rarityColor === 'legendary' && (item.affixes || []).some(affix => affix.greater);
  return EQUIPMENT_SHOP.prices[greater ? 'legendaryGreater' : item.rarityColor];
}
function equipmentShopMaximumRarity(save = state) {
  const weights = rarityWeightsForAreaIndex(highestUnlockedAreaIndex(save), save);
  return RARITIES.reduce((maximum, rarity, index) => Number(weights[rarity.color]) > 0 ? index : maximum, 0);
}
function syncEquipmentShop(save = state) {
  if (!save.mainClass) { save.shopEquipmentOffers = []; return; }
  const now = Date.now();
  const interval = Math.max(1, Number(EQUIPMENT_SHOP.refreshIntervalSeconds) || 1800) * 1000;
  const deadline = Number(save.shopEquipmentRefreshAt);
  if (!Number.isFinite(deadline) || deadline <= 0) {
    save.shopEquipmentRefreshAt = now + interval;
  } else if (deadline <= now) {
    save.shopEquipmentOffers = [];
    save.shopEquipmentRefreshAt = deadline + (Math.floor((now - deadline) / interval) + 1) * interval;
  }
  const maximum = equipmentShopMaximumRarity(save);
  const greaterUnlocked = Number(save.deepOfDark?.tier) >= BALANCE.loot.greaterAffixMinimumDeepTier;
  const ids = new Set();
  save.shopEquipmentOffers = (Array.isArray(save.shopEquipmentOffers) ? save.shopEquipmentOffers : []).filter(item => {
    if (!item || ids.has(item.id) || !AFFIX_POOLS[item.slot] || !partyCanEquipDrop(item, save)) return false;
    const rank = RARITIES.findIndex(rarity => rarity.color === item.rarityColor);
    if (rank < 0 || rank > maximum || !equipmentShopPrice(item)) return false;
    if (!greaterUnlocked && (item.affixes || []).some(affix => affix.greater)) return false;
    ids.add(item.id);
    return true;
  }).slice(0, EQUIPMENT_SHOP.offerCount);
  while (save.shopEquipmentOffers.length < EQUIPMENT_SHOP.offerCount) {
    save.shopEquipmentOffers.push(makeAreaEquipmentDrop(AREAS[highestUnlockedAreaIndex(save)].id, save));
  }
}
function canUpgradeLegendaryAffix(item) {
  return Boolean(item?.rarityColor === 'legendary' && AFFIX_POOLS[item.slot] && !item.greaterUpgradeUsed
    && !(item.affixes || []).some(affix => affix.greater)
    && (item.affixes || []).some(affix => !affix.fixed && AFFIX_RANGES[affix.stat]));
}
function rollGreaterAffixes(item, save = state, { includeFixed = false, ignoreDeepRequirement = false } = {}) {
  if (isMythicEquipment(item)) return normalizeAffixUpgrades(item);
  if (!ignoreDeepRequirement && (Number(save?.deepOfDark?.tier) || 0) < BALANCE.loot.greaterAffixMinimumDeepTier) return item;
  (item.affixes || []).forEach((affix) => {
    if (affix.greater || (affix.fixed && !includeFixed) || Math.random() >= BALANCE.loot.greaterAffixChance) return;
    const baseValue = affix.fixed
      ? (affix.baseValue ?? affix.value) * BALANCE.loot.greaterAffixMaxMultiplier
      : isMythicEquipment(item) ? (affix.baseValue ?? affix.value) * BALANCE.loot.greaterAffixMaxMultiplier : greaterAffixBaseValue(affix.stat);
    affix.greater = true;
    affix.baseValue = baseValue;
    affix.value = affixValueAtUpgrade(affix, item.upgradeLevel);
  });
  return item;
}
function greaterAffixBaseValue(stat) {
  return (AFFIX_RANGES[stat]?.[1] || 1) * BALANCE.loot.greaterAffixMaxMultiplier;
}
function affixUpgradeMultiplier(level = 0) {
  const upgrade = Math.max(0, Math.min(BALANCE.items.maxUpgradeLevel, Math.floor(Number(level) || 0)));
  return 1 + upgrade * (BALANCE.items.upgradeAffixPercentPerLevel ?? 10) / 100;
}
function affixValueAtUpgrade(affix, level = 0) {
  const value = (affix.baseValue ?? affix.value) * affixUpgradeMultiplier(level);
  // Greater bases may contain half points; retain these instead of rounding away 150%.
  return affix.greater ? Math.round(value * 100) / 100 : Math.round(value);
}
function normalizeAffixUpgrades(item) {
  // Existing saves normally store baseValue. Infer it once for older items.
  const legacyMultiplier = Math.pow(BALANCE.items.upgradeBaseStatMultiplier, item.upgradeLevel || 0);
  item.affixes = (item.affixes || []).map(affix => {
    const inferred = Number(affix.value) / (isMythicEquipment(item) ? affixUpgradeMultiplier(item.upgradeLevel) : legacyMultiplier);
    let baseValue = affix.baseValue ?? (affix.greater && !affix.fixed && !isMythicEquipment(item) ? greaterAffixBaseValue(affix.stat)
      : affix.greater ? Math.round(inferred * 100) / 100 : Math.round(inferred));
    if (isMythicEquipment(item) && !affix.greater) {
      baseValue *= BALANCE.loot.greaterAffixMaxMultiplier;
      affix = { ...affix, greater: true };
    }
    return { ...affix, baseValue, value: affixValueAtUpgrade({ ...affix, baseValue }, item.upgradeLevel) };
  });
  return item;
}
// Keep existing inventory, mailbox contents and saved quest rewards usable.
function migrateRemovedMaterials(value) {
  if (!value || typeof value !== 'object') return;
  if (typeof value.label === 'string') value.label = value.label.replaceAll('Sicherheitsstein', 'Aufwertungsstein');
  const removedBoxes = { gemBox: 'powerup', powerupBox: 'powerup', enchantmentBox: 'affixStone', bossResetBox: 'bossReset' };
  if (value.type === 'luckyBox' && removedBoxes[value.group]) {
    const replacement = removedBoxes[value.group];
    value.type = 'material';
    value.slot = replacement;
    value.quantity ||= 1;
    delete value.group;
  }
  if (removedBoxes[value.slot]) {
    value.slot = removedBoxes[value.slot];
    if (value.id) {
      const { id, quantity } = value;
      const factory = value.slot === 'powerup' ? () => makePowerup(choose(POWERUP_STATS))
        : value.slot === 'bossReset' ? makeBossResetConsumable : () => makeEnchantmentStone('affixStone');
      Object.assign(value, factory(), { id, quantity: quantity || 1 });
    }
  }
  const materialQuests = { upgradeStonePurchases: ['upgradeStoneDrops', 'Aufwertungsstein'], socketStonePurchases: ['socketStoneDrops', 'Sockelstein'] };
  if (materialQuests[value.type] && value.description) {
    const [type, label] = materialQuests[value.type];
    value.type = type;
    value.startValue = 0;
    value.title = value.description = `Finde ${value.target || 1} ${label} im Turm.`;
  }
  if (value.slot === 'safetyStone') {
    value.slot = 'upgradeStone';
    if (value.id) {
      const { id, quantity } = value;
      Object.assign(value, makeUpgradeStone(), { id, quantity: quantity || 1 });
    }
  }
  if (Array.isArray(value)) value.forEach(migrateRemovedMaterials);
  else Object.values(value).forEach(migrateRemovedMaterials);
}
function makeMythicUpgradeStone() {
  return { ...makeUpgradeStone(), slot: 'mythicUpgradeStone', name: SLOT_DATA.mythicUpgradeStone.label, rarityColor: 'mythic', icon: SLOT_DATA.mythicUpgradeStone.icon };
}
function makeUpgradeStone() {
  return { id: createItemId(), slot: 'upgradeStone', name: 'Aufwertungsstein', quantity: 1, upgradeLevel: 0, rarity: 'Material', rarityColor: 'common', icon: SLOT_DATA.upgradeStone.icon, affixVersion: 5, affixes: [] };
}
function makeSocketStone() {
  return { id: createItemId(), slot: 'socketStone', name: 'Sockelstein', quantity: 1, upgradeLevel: 0, rarity: 'Material', rarityColor: 'rare', icon: SLOT_DATA.socketStone.icon, affixVersion: 5, affixes: [] };
}
function makeEnchantmentStone(slot) {
  return { id: createItemId(), slot, name: SLOT_DATA[slot].label, quantity: 1, upgradeLevel: 0, rarity: 'Material', rarityColor: 'rare', icon: SLOT_DATA[slot].icon, affixVersion: 5, affixes: [] };
}
function makeTowerResetConsumable() {
  return { ...makeBossResetConsumable(), slot: 'towerReset', name: 'Turm-Zeitstein', icon: SLOT_DATA.towerReset.icon };
}
function makeBossResetConsumable() {
  return { id: createItemId(), slot: 'bossReset', name: 'Boss-Zeitstein', quantity: 1, upgradeLevel: 0, rarity: 'Verbrauchsgut', rarityColor: 'epic', icon: SLOT_DATA.bossReset.icon, affixVersion: 5, affixes: [] };
}
function rollAffix(slot, excludedStats = []) {
  const available = (AFFIX_POOLS[slot] || []).filter((stat) => !excludedStats.includes(stat));
  if (!available.length) throw new Error('Für diesen Gegenstand gibt es kein weiteres Affix.');
  const stat = choose(available);
  const [min, max] = AFFIX_RANGES?.[stat] || [1, 1];
  const baseValue = randomInt(min, max);
  return { stat, baseValue, value: baseValue };
}
function stackUnitIds(save, slot) {
  return save.inventory.filter((item) => item.slot === slot).flatMap((item) => Array(Math.max(1, Math.floor(Number(item.quantity) || 1))).fill(item.id));
}
function inventoryQuantityForSlot(save, slot) {
  return save.inventory.filter((item) => item.slot === slot).reduce((total, item) => total + Math.max(1, Math.floor(Number(item.quantity) || 1)), 0);
}
function socketCapacityForSlot(slot, item = null) {
  return BALANCE.items.socketableSlots.includes(slot) ? BALANCE.items.socketCounts.equipment : 0;
}
function socketCapacityForEquipmentSlot(slot) {
  return ['mainHand', 'offHand', 'helmet', 'chest', 'gloves', 'boots'].includes(slot) ? BALANCE.items.socketCounts.equipment : 0;
}
function itemAffixes(item) {
  return [...(item?.affixes || []), ...(item?.sockets || []).filter(Boolean).flatMap((gem) => (gem.affixes || []).map(affix => ({ ...affix, fromSocket: true })))];
}
function weaponGemProfileName(name) {
  return typeof name === 'string' ? name.replace(/^Arkanegemme$/, 'Arkanstein').replace(/gemme$/, 'stein') : name;
}
function gemRarityForDrop() {
  const weights = BALANCE.items.gemRarityWeights;
  const entries = RARITIES.map(rarity => [rarity, Number(weights[rarity.color]) || 0]).filter(([, weight]) => weight > 0);
  let roll = Math.random() * entries.reduce((sum, [, weight]) => sum + weight, 0);
  return entries.find(([, weight]) => (roll -= weight) < 0)?.[0] || entries[entries.length - 1][0];
}
function gemProfileFor(kind, profileName) {
  const aliases = { Angriff: 'Machtstein', Kraftkristall: 'Machtstein', Lebenskraft: 'Vitalstein', Lebenskristall: 'Vitalstein', Verteidigung: 'Vitalstein', Schutzkristall: 'Vitalstein' };
  const name = aliases[profileName] || weaponGemProfileName(typeof profileName === 'string' ? profileName.replace(/kristall$/, 'stein') : profileName);
  return GEM_PROFILES.find(profile => profile.profile === name || profile.attribute === name);
}
function gemAffixesFor(kind, rarityColor, profile) {
  const values = BALANCE.items.gemValues[rarityColor];
  return [{ stat: profile.attribute, value: values.attribute, baseValue: values.attribute, fixed: true },
    ...Object.entries(values.bonuses).filter(([, value]) => value > 0).map(([stat, value]) => ({ stat, value, baseValue: value, fixed: true }))];
}
function normalizeGemItem(item) {
  const rarity = RARITIES.find(entry => entry.color === item.rarityColor) || RARITIES.find(entry => entry.color === 'legendary');
  const attribute = (item.affixes || []).find(affix => GEM_PROFILES.some(profile => profile.attribute === affix.stat))?.stat;
  const profile = gemProfileFor(item.slot, item.gemProfile || item.name) || gemProfileFor(item.slot, attribute) || GEM_PROFILES[0];
  if (!item.gemProfile || item.slot === 'armorGem') item.name = profile.profile;
  item.slot = 'weaponGem';
  item.icon = SLOT_DATA.weaponGem.icon;
  item.gemProfile = profile.profile;
  item.rarity = rarity.name;
  item.rarityColor = rarity.color;
  item.upgradeLevel = 0;
  item.affixVersion = 7;
  item.affixes = gemAffixesFor(item.slot, rarity.color, profile);
  delete item.socketSlots;
  delete item.sockets;
  return item;
}
function makeGem(kind, save = state, rarityName = null, profileName = null) {
  if (!['weaponGem', 'armorGem'].includes(kind)) throw new Error('Unbekannter Edelsteintyp.');
  const rarity = rarityName ? RARITIES.find(entry => entry.color === rarityName || entry.name === rarityName) : gemRarityForDrop();
  if (!rarity) throw new Error('Unbekannte Edelstein-Seltenheit.');
  const profile = gemProfileFor(kind, profileName) || choose(GEM_PROFILES);
  return { id: createItemId(), slot: 'weaponGem', name: profile.profile, gemProfile: profile.profile, quantity: 1, upgradeLevel: 0, rarity: rarity.name, rarityColor: rarity.color, icon: SLOT_DATA.weaponGem.icon, affixVersion: 7, affixes: gemAffixesFor('weaponGem', rarity.color, profile) };
}
function makeRandomGem(save = state) {
  const rarity = gemRarityForDrop();
  const profile = choose(GEM_PROFILES);
  return makeGem(profile.slot, save, rarity.color, profile.profile);
}
function gemUpgradeQuote(save, itemId) {
  const gem = save.inventory.find(item => item.id === itemId && item.slot === 'weaponGem');
  if (!gem) return null;
  const profile = gemProfileFor(gem.slot, gem.gemProfile || gem.name);
  const index = RARITY_ENCHANT_ORDER.indexOf(gem.rarityColor);
  const nextRarity = RARITIES.find(rarity => rarity.color === RARITY_ENCHANT_ORDER[index + 1]) || null;
  const stacks = save.inventory.filter(item => item.slot === 'weaponGem' && item.rarityColor === gem.rarityColor && gemProfileFor(item.slot, item.gemProfile || item.name)?.profile === profile?.profile);
  const available = stacks.reduce((sum, item) => sum + Math.max(1, Math.floor(Number(item.quantity) || 1)), 0);
  const ratio = BALANCE.items.gemUpgradeRatio;
  return { gem, profile, nextRarity, stacks, available, ratio, maxUpgrades: nextRarity ? Math.floor(available / ratio) : 0 };
}
function makeShopItem(group, save = state) {
  if (group === 'upgradeStone') return makeUpgradeStone();
  if (group === 'socketStone') return makeSocketStone();
  if (group === 'rarityStone') return makeEnchantmentStone('rarityStone');
  throw new Error(`Market offer ${group} is unavailable.`);
}
const GLYPH_DEFINITIONS = GAME_CONFIG.glyphDefinitions;
const POWERUP_STATS = [...STAT_KEYS.filter(stat => stat !== 'Doppeltrefferchance'), 'Chance auf zweiten Treffer', 'Droprate', 'Upgradechance'];
const POWERUP_DURATION_MS = 15 * 60 * 1000;
function makeGlyph(definition) {
  return { id: createItemId(), slot: 'glyph', glyphId: definition.id, name: definition.name, quantity: 1, upgradeLevel: 0, rarity: 'Legendär', rarityColor: 'legendary', icon: SLOT_DATA.glyph.icon, affixVersion: 5, affixes: [{ stat: definition.bonusStat || 'Angriff', value: 25, baseValue: 25, fixed: true }, { stat: definition.stat, value: 100, baseValue: 100, fixed: true }] };
}
function makePowerup(stat) {
  return { id: createItemId(), slot: 'powerup', powerupStat: stat, name: `${stat}-Power-up`, quantity: 1, upgradeLevel: 0, rarity: 'Verbrauchsgegenstand', rarityColor: 'epic', icon: '✦', affixVersion: 5, affixes: [] };
}
function makeVipTicket() {
  return { id: createItemId(), slot: 'vipTicket', name: SLOT_DATA.vipTicket.label, quantity: 1, upgradeLevel: 0, rarity: 'Verbrauchsgegenstand', rarityColor: 'legendary', icon: SLOT_DATA.vipTicket.icon, affixVersion: 5, affixes: [] };
}
function migrateRetiredTowerLootBoost(save) {
  let changed = false;
  for (const item of [...(save.inventory || []), ...(save.mailbox || []).map(entry => entry?.item)]) {
    if (item?.slot !== 'towerLootBoost') continue;
    const id = item.id;
    const quantity = item.quantity;
    Object.assign(item, makePowerup('Droprate'), { id, quantity });
    changed = true;
  }
  for (const key of [save, save.offlineFarm].filter(Boolean)) {
    if (!Array.isArray(key.activePowerups || key.powerups)) continue;
    const field = key === save ? 'activePowerups' : 'powerups';
    const entries = key[field];
    if (!entries.some(entry => entry?.stat === TOWER_LOOT_BOOST_STAT)) continue;
    const combined = [];
    for (const entry of entries) {
      if (!entry) continue;
      if (entry.stat === TOWER_LOOT_BOOST_STAT) { entry.stat = 'Droprate'; entry.value = 10; changed = true; }
      const existing = combined.find(candidate => candidate.stat === entry.stat);
      if (existing) existing.expiresAt = Math.max(existing.expiresAt, entry.expiresAt);
      else combined.push(entry);
    }
    key[field] = combined;
  }
  return changed;
}
function towerLootBaseChance(choice, sourceState = state) {
  const kills = Math.max(0, Math.floor(Number(sourceState?.statistics?.towerBossesKilled) || 0));
  return Math.round((choice.chance + kills * BALANCE.loot.towerLootChancePerBoss) * 10) / 10;
}
function towerLootChance(choice, sourceState = state) {
  return applyLootDropBonus(towerLootBaseChance(choice, sourceState) / 100, sourceState, { cap: Infinity }) * 100;
}
function towerLootProgressLabel(sourceState = state) {
  return `${number(sourceState.statistics.towerBossesKilled || 0)} Turmbosse · +${formatRuleNumber(BALANCE.loot.towerLootChancePerBoss)} % je Sieg`;
}
function applyLootDropBonus(baseChance, sourceState = state, { cap = 1 } = {}) {
  const bonus = passiveEffectTotal('drop-rate-percent', sourceState.mainClass, sourceState) + powerupBonusForStat('Droprate', sourceState) + (getWorldEvent(sourceState).dropRatePercent || 0)
    + (vipIsActive(sourceState) ? VIP_RULES.dropRatePercent : 0);
  return Math.min(cap, Math.max(0, baseChance * (1 + bonus / 100)));
}
function workshopSuccessChance(baseChance, sourceState = state) {
  const bonus = powerupBonusForStat('Upgradechance', sourceState) + (getWorldEvent(sourceState).upgradeChancePercent || 0)
    + (vipIsActive(sourceState) ? VIP_RULES.upgradeChancePercent : 0);
  return Math.min(100, Math.max(0, Math.round(baseChance * (1 + bonus / 100) * 1000000) / 1000000));
}
function vipIsActive(sourceState = state) {
  return Number(sourceState?.vipExpiresAt) > rewardTime(sourceState);
}

function renderVipBadge() {
  const name = document.querySelector('#player-identity > strong');
  if (!name) return;
  let badge = name.querySelector('.player-vip-badge');
  if (!vipIsActive()) { badge?.remove(); return; }
  if (!badge) {
    badge = document.createElement('span');
    badge.className = 'player-vip-badge';
    badge.textContent = 'VIP';
    name.append(badge);
  }
  badge.title = detailTextLines(`VIP bis ${new Date(state.vipExpiresAt).toLocaleString('de-DE')} · +${VIP_RULES.upgradeChancePercent} % Upgradechance · +${VIP_RULES.dropRatePercent} % Droprate · +${VIP_RULES.soulBonusPercent} % Kampf-Seelen ? +${BALANCE.dailyAttempts.vipBonus} Tagesversuch für Bossprüfung und Turm ? +${BALANCE.dailyAttempts.vipBonus} Tagesversuch für Bossprüfung und Turm`).join('\n');
}
function makeConsolationReward() {
  const outcome = choose(BOX_RULES.consolationPool);
  if (outcome.type === 'powerup') return { item: makePowerup(choose(POWERUP_STATS)) };
  if (outcome.type === 'souls') return { souls: Math.max(0, Math.floor(Number(outcome.amount) || 0)) };
  if (outcome.type === 'material') {
    const factory = { upgradeStone: makeUpgradeStone, socketStone: makeSocketStone }[outcome.slot];
    if (!factory) throw new Error(`Unbekanntes Luckybox-Material: ${outcome.slot}`);
    return { item: { ...factory(), quantity: Math.max(1, Math.floor(Number(outcome.quantity) || 1)) } };
  }
  throw new Error(`Unbekannter Nietenpool-Eintrag: ${outcome.type}`);
}
function makeFarmBoxReward() {
  let roll = Math.random() * 100;
  for (const outcome of BOX_RULES.farmBox.rewards) {
    if (roll >= outcome.chance) { roll -= outcome.chance; continue; }
    if (outcome.type === 'souls') return { souls: randomInt(outcome.minimum, outcome.maximum) };
    if (outcome.type === 'powerup') return { item: makePowerup(choose(POWERUP_STATS)) };
    if (outcome.type === 'box') return { item: makeLuckyBoxItem(outcome.group) };
    const factories = {
      upgradeStone: makeUpgradeStone,
      socketStone: makeSocketStone,
      affixStone: () => makeEnchantmentStone('affixStone'),
      rarityStone: () => makeEnchantmentStone('rarityStone'),
      bossReset: makeBossResetConsumable, towerReset: makeTowerResetConsumable,
    };
    if (['material', 'consumable'].includes(outcome.type) && factories[outcome.slot]) return { item: factories[outcome.slot]() };
    throw new Error('Unbekannter Farm-Luckybox-Inhalt.');
  }
  throw new Error('Die Farm-Luckybox-Chancen ergeben keine vollständige Verteilung.');
}
function makeMaterialBoxReward() {
  let roll = Math.random() * 100;
  const factories = {
    upgradeStone: makeUpgradeStone,
    socketStone: makeSocketStone,
    affixStone: () => makeEnchantmentStone('affixStone'),
    rarityStone: () => makeEnchantmentStone('rarityStone'),
  };
  for (const outcome of BOX_RULES.materialBox.rewards) {
    if (roll >= outcome.chance) { roll -= outcome.chance; continue; }
    return { item: { ...factories[outcome.slot](), quantity: outcome.quantity } };
  }
  throw new Error('Die Material-Luckybox hat keine vollständige Gewinnverteilung.');
}
function makeLuckyBoxReward(group, save = state) {
  const rules = BOX_RULES[group];
  if (!rules) throw new Error(`Luckybox ${group} ist nicht konfiguriert.`);
  if (group === 'farmBox') return makeFarmBoxReward();
  if (group === 'materialBox') return makeMaterialBoxReward();
  if (group === 'vipBox') return Math.random() * 100 < rules.ticketChance
    ? { item: makeVipTicket(), jackpot: true } : makeConsolationReward();
  if (group === 'glyphBox') {
    const chancePerGlyph = Math.max(0, Number(rules.chancePerGlyph) || 0);
    if (!chancePerGlyph) return makeConsolationReward();
    const glyphRoll = Math.random() * 100;
    const glyphIndex = Math.floor(glyphRoll / chancePerGlyph);
    if (glyphIndex < GLYPH_DEFINITIONS.length) return { item: rollGreaterAffixes(makeGlyph(GLYPH_DEFINITIONS[glyphIndex]), save, { includeFixed: true, ignoreDeepRequirement: true }), jackpot: true };
    return makeConsolationReward();
  }
  throw new Error('Unbekannter Boxtyp.');
}
function makeLuckyBoxItem(group) {
  if (!BOX_RULES?.[group] || !SLOT_DATA[group]) throw new Error(`Box ${group} ist nicht konfiguriert.`);
  return { id: createItemId(), slot: group, name: SLOT_DATA[group].label, quantity: 1, upgradeLevel: 0, rarity: 'Versiegelt', rarityColor: 'epic', icon: SLOT_DATA[group].icon, affixVersion: 5, affixes: [] };
}
function makeShopReward(group, save = state) {
  return BOX_RULES?.[group] ? { item: makeLuckyBoxItem(group), souls: 0 } : { item: makeShopItem(group, save), souls: 0 };
}
function powerupBonusForStat(stat, sourceState = state) {
  return (sourceState?.activePowerups || []).some((entry) => entry.stat === stat && entry.expiresAt > rewardTime(sourceState)) ? 10 : 0;
}
function consumablePowerupStat(item) {
  if (item.slot === 'towerLootBoost') return 'Droprate'; // Legacy imports are migrated to normal power-ups.
  return item.slot === 'powerup' && POWERUP_STATS.includes(item.powerupStat) ? item.powerupStat : null;
}
function renderActivePowerupsWidget() {
  if (!activePowerupsSlot || !state) return;
  const active = (state.activePowerups || []).filter((entry) => entry.expiresAt > Date.now());
  const available = new Set(state.inventory.map(consumablePowerupStat).filter(Boolean)).size;
  const status = active.length ? `${active.length} aktiv` : available ? `${available} bereit` : 'Keine aktiv';
  patchBackgroundMarkup(activePowerupsSlot, `<button class="active-powerups-panel ui-control ui-graphic" type="button" data-active-powerups data-activate-powerups data-available-powerups="${available}" aria-label="Aktive Power-ups anzeigen und verfügbare aktivieren"><i class="header-status-dot ${active.length ? 'is-active' : ''}" aria-hidden="true"></i><span class="active-powerups-label">POWER-UPS</span><strong>${status}</strong></button>`);
}
let activePowerupTimer = null;
function startActivePowerupTimer() {
  if (activePowerupTimer) return;
  activePowerupTimer = window.setInterval(() => {
    if (!state || saveMaintenance || saveBlocked) return;
    renderVipBadge();
    updateShopOfferTimer();
    updateHuntingEventTimer();
    renderActivePowerupsWidget();
    document.querySelectorAll('[data-tower-loot] option').forEach(option => {
      const choice = BALANCE.loot.towerLootChoices.find(entry => entry.id === option.value);
      if (!choice) return;
      const label = `${choice.label} (${formatRuleNumber(towerLootChance(choice))} %)`;
      if (option.textContent !== label) option.textContent = label;
    });
    const progression = document.querySelector('[data-tower-loot-progression]');
    if (progression) progression.textContent = towerLootProgressLabel();
    const active = state.activePowerups || [];
    const remaining = active.filter((entry) => entry.expiresAt > Date.now());
    if (remaining.length !== active.length) {
      enqueueStateTask(async () => {
        state.activePowerups = (state.activePowerups || []).filter((entry) => entry.expiresAt > Date.now());
        await writeSavedState(state);
        refreshBattleHealth();
        renderActivePowerupsWidget();
      }).catch(() => {});
    }
  }, 1000);
}
function startPlayTimeTracking() {
  if (playTimeTimer) return;
  lastPlayTimeTick = Date.now();
  playTimeTimer = window.setInterval(() => {
    const now = Date.now();
    const elapsed = Math.min(10000, Math.max(0, now - lastPlayTimeTick));
    lastPlayTimeTick = now;
    if (!state?.mainClass || !elapsed || document.hidden || offlineFarmSuspended || saveMaintenance || saveBlocked) return;
    enqueueStateTask(async () => {
      state.statistics ||= {};
      state.statistics.playTimeMs = (Number(state.statistics.playTimeMs) || 0) + elapsed;
      if (now - lastPlayTimePersistAt < 30000) return;
      lastPlayTimePersistAt = now;
      await writeSavedState(state);
    }).catch(() => {});
  }, 10000);
}
function makeContractMilestoneItem(save, reward) {
  const item = makeItem(reward.kind, 'Gewöhnlich');
  item.name = reward.name;
  if (reward.set) item.set = reward.set;
  if (reward.kind === 'ring' || reward.kind === 'amulet') item.affixes = [{ stat: 'Seelenfund', value: 10, baseValue: 10, fixed: true }];
  return item;
}
function makeQuestBoardReward(save, reward) {
  if (reward.type === 'luckyBundle') return BALANCE.bossChallenge.luckyBoxGroups.filter(group => SLOT_DATA[group]).map(group => {
    const item = makeLuckyBoxItem(group); item.quantity = reward.quantity; return item;
  });
  if (reward.type === 'gemBundle') return GEM_PROFILES.map(profile => {
    const item = makeGem(profile.slot, save, 'legendary', profile.profile); item.quantity = reward.quantity; return item;
  });
  if (reward.type === 'setBundle') {
    const owner = reward.owner === 'companion' ? save.activeCompanion : save.mainClass;
    if (reward.classBound && !owner) throw new Error('Wähle zuerst den Begleiter für dieses Klassenset.');
    const definitions = reward.kind === 'armor' ? ARMOR_SETS : JEWELRY_SETS;
    const name = Object.keys(definitions).find(name => reward.classBound ? definitions[name].class === owner : !definitions[name].class);
    if (!name) throw new Error('Für diese Belohnung ist kein passendes Set verfügbar.');
    const slots = reward.kind === 'armor' ? ['helmet', 'chest', 'gloves', 'boots'] : ['amulet', 'ring', 'ring', 'earring', 'earring'];
    return slots.map(slot => {
      const item = makeItem(slot, reward.rarity);
      item.set = name;
      return applyQuestGreaterAffixes(item, reward.greaterAffixes);
    });
  }
  if (reward.type === 'itemBundle') return reward.items.flatMap((entry) => {
    const item = makeQuestBoardReward(save, entry);
    return Array.isArray(item) ? item : item ? [item] : [];
  });
  if (reward.type === 'classWeapon') {
    const className = reward.owner === 'main' ? save.mainClass : save.activeCompanion;
    const weaponSlots = CLASS_WEAPONS[className] || [];
    if (!weaponSlots.length) throw new Error('Für diese Belohnung ist keine passende Klassenwaffe verfügbar.');
    return applyQuestGreaterAffixes(makeItem(choose(weaponSlots), reward.rarity || 'legendary'), reward.greaterAffixes);
  }
  if (reward.type === 'luckyBox') { const item = makeLuckyBoxItem(reward.group); item.quantity = reward.quantity || 1; return item; }
  if (reward.type === 'starterArmor') return makeContractMilestoneItem(save, reward.item);
  if (['setItem', 'equipment'].includes(reward.type)) {
    const item = makeItem(reward.slot, reward.rarity || 'rare');
    if (reward.set) item.set = reward.set;
    if (reward.name) item.name = reward.name;
    return item;
  }
  if (reward.type === 'material') {
    const maker = { powerup: () => makePowerup(choose(POWERUP_STATS)), bossReset: makeBossResetConsumable, towerReset: makeTowerResetConsumable, upgradeStone: makeUpgradeStone, socketStone: makeSocketStone, rarityStone: () => makeEnchantmentStone('rarityStone'), affixStone: () => makeEnchantmentStone('affixStone') }[reward.slot];
    if (!maker) throw new Error('Unbekanntes Auftragsmaterial.');
    const item = maker();
    item.quantity = reward.quantity;
    return item;
  }
  if (reward.type === 'gem') return makeRandomGem(save);
  return null;
}
function applyQuestGreaterAffixes(item, count = 0) {
  item.affixes.slice(0, count).forEach(affix => {
    affix.greater = true;
    affix.baseValue = greaterAffixBaseValue(affix.stat);
    affix.value = affixValueAtUpgrade(affix, item.upgradeLevel);
  });
  return item;
}
function randomInt(min, max) { return Math.floor(Math.random() * (max - min + 1)) + min; }
function cloneState(source) { return JSON.parse(JSON.stringify(source)); }
function inventoryIndex(save, itemId) { return save.inventory.findIndex((item) => item.id === itemId); }
function stackKey(item) {
  if (!item || !STACKABLE_ITEM_SLOTS.has(item.slot)) return null;
  if (item.slot === 'questItem') return JSON.stringify(['questItem', item.questItemId, item.rarityColor]);
  if (['upgradeStone', 'mythicUpgradeStone', 'socketStone', 'rarityStone', 'affixStone', 'towerReset', 'bossReset', 'glyphBox', 'vipBox', 'farmBox', 'materialBox', 'vipTicket', 'towerLootBoost'].includes(item.slot)) return item.slot;
  if (item.slot === 'powerup') return JSON.stringify(['powerup', item.powerupStat]);
  const affixes = (item.affixes || []).map(({ stat, value, baseValue, fixed }) => [stat, value, baseValue, Boolean(fixed)]);
  return JSON.stringify([item.slot, item.name, item.rarityColor, affixes]);
}
function normalizeInventoryStacks(save) {
  if (!Array.isArray(save.inventory)) { save.inventory = []; return; }
  const normalized = [];
  const stacks = new Map();
  save.inventory.forEach((item) => {
    const key = stackKey(item);
    if (!key) { normalized.push(item); return; }
    const quantity = Math.max(1, Math.floor(Number(item.quantity) || 1));
    const existing = stacks.get(key);
    if (existing) existing.quantity += quantity;
    else {
      const stack = { ...item, quantity };
      stacks.set(key, stack);
      normalized.push(stack);
    }
  });
  save.inventory = normalized;
}
function itemUsesInventorySlot(item) {
  return ['bow', 'sword', 'staff', 'shield', 'bell', 'helmet', 'chest', 'gloves', 'boots', 'ring', 'amulet', 'earring', 'glyph'].includes(item?.slot);
}
function inventoryOccupiedSlots(save) {
  return (save?.inventory || []).filter(itemUsesInventorySlot).length;
}
function inventorySlotsNeeded(save, incomingItems) {
  const stackKeys = new Set(save.inventory.filter(itemUsesInventorySlot).map(stackKey).filter(Boolean));
  let additionalSlots = 0;
  incomingItems.filter(itemUsesInventorySlot).forEach((item) => {
    const key = stackKey(item);
    if (!key) { additionalSlots += 1; return; }
    if (!stackKeys.has(key)) { stackKeys.add(key); additionalSlots += 1; }
  });
  return additionalSlots;
}
function totalRewardStorageSlots(save) {
  return Math.max(0, save.inventoryCapacity - inventoryOccupiedSlots(save)) + Math.max(0, MAILBOX_CAPACITY - (save.mailbox || []).length);
}
function reservedBossStorageSlots(save) {
  return Math.max(0, Math.floor(Number(save.bossChallenge?.reservedStorageSlots) || 0));
}
function assertBossStorageReservation(save, additionalSlots) {
  if (totalRewardStorageSlots(save) - additionalSlots < reservedBossStorageSlots(save)) {
    throw new Error('This action would use storage reserved for boss rewards.');
  }
}
function addItemsToInventory(save, items, allowReservedStorage = false) {
  const required = inventorySlotsNeeded(save, items);
  const occupiedSlots = inventoryOccupiedSlots(save);
  if (occupiedSlots + required > save.inventoryCapacity) {
    throw new Error(`Der Vorgang ben\u00f6tigt ${required} weitere Inventarpl\u00e4tze; verf\u00fcgbar sind ${Math.max(0, save.inventoryCapacity - occupiedSlots)}.`);
  }
  if (!allowReservedStorage && required) assertBossStorageReservation(save, required);
  items.forEach((item) => {
    const key = stackKey(item);
    const stack = key ? save.inventory.find((entry) => stackKey(entry) === key) : null;
    if (stack) stack.quantity = Math.max(1, Number(stack.quantity) || 1) + Math.max(1, Number(item.quantity) || 1);
    else save.inventory.push(item);
  });
}
function storeRewardItem(save, item, source, allowReservedStorage = false) {
  const slotsNeeded = inventorySlotsNeeded(save, [item]);
  const freeSlots = totalRewardStorageSlots(save);
  const reservedSlots = allowReservedStorage ? 0 : reservedBossStorageSlots(save);
  if (inventoryOccupiedSlots(save) + slotsNeeded <= save.inventoryCapacity && freeSlots - slotsNeeded >= reservedSlots) {
    addItemsToInventory(save, [item], allowReservedStorage);
    return 'inventory';
  }
  save.mailbox ||= [];
  if (save.mailbox.length >= MAILBOX_CAPACITY) throw new Error('Der Briefkasten ist voll. Hole zuerst Gegenstände ab, bevor du weitere Belohnungen annimmst.');
  if (!allowReservedStorage && freeSlots - 1 < reservedSlots) throw new Error('No unreserved reward storage space is available.');
  save.mailbox.push({ id: createItemId(), item, source, receivedAt: new Date().toISOString() });
  return 'mailbox';
}
function canStoreRewardItem(save, item) {
  const slotsNeeded = inventorySlotsNeeded(save, [item]);
  const freeSlots = totalRewardStorageSlots(save);
  const reservedSlots = reservedBossStorageSlots(save);
  const fitsInventory = inventoryOccupiedSlots(save) + slotsNeeded <= save.inventoryCapacity && freeSlots - slotsNeeded >= reservedSlots;
  const fitsMailbox = (save.mailbox || []).length < MAILBOX_CAPACITY && freeSlots - 1 >= reservedSlots;
  return fitsInventory || fitsMailbox;
}
function storeRewardItems(save, items, source, allowReservedStorage = false) {
  const plannedSave = cloneState(save);
  const stored = items.map((item) => ({ item, destination: storeRewardItem(plannedSave, item, source, allowReservedStorage) }));
  save.inventory = plannedSave.inventory;
  save.mailbox = plannedSave.mailbox;
  return stored;
}
function consumeInventoryItem(save, itemId, expectedSlot) {
  const { index, item } = requireInventoryItem(save, itemId);
  if (expectedSlot && item.slot !== expectedSlot) throw new Error('Das Material passt nicht zu diesem Vorgang.');
  if (!STACKABLE_ITEM_SLOTS.has(item.slot)) { save.inventory.splice(index, 1); return item; }
  const unit = { ...item };
  delete unit.quantity;
  const quantity = Math.max(1, Math.floor(Number(item.quantity) || 1));
  if (quantity > 1) item.quantity = quantity - 1;
  else save.inventory.splice(index, 1);
  return unit;
}
function requireInventoryItem(save, itemId) {
  const index = inventoryIndex(save, itemId);
  if (index < 0) throw new Error('Gegenstand nicht gefunden.');
  return { index, item: save.inventory[index] };
}
function findInventoryOrEquippedItem(save, itemId) {
  const pet = partyPets(save).find(pet => pet.id === itemId);
  if (pet) return pet;
  const inventoryItem = save.inventory.find((item) => item.id === itemId);
  if (inventoryItem) return inventoryItem;
  const mainItem = Object.values(save.equipment?.main || {}).find((item) => item?.id === itemId);
  if (mainItem) return mainItem;
  return Object.values(save.equipment?.companions || {}).flatMap((entry) => Object.values(entry || {})).find((item) => item?.id === itemId) || null;
}
const EQUIPMENT_PROGRESS_SLOTS = ['mainHand', 'offHand', 'helmet', 'chest', 'gloves', 'boots', 'amulet', 'ring1', 'ring2', 'earring1', 'earring2', 'glyph1', 'glyph2', 'glyph3'];
function equipmentSlotEntries(save = state, activeOnly = false) {
  const owners = [['main', save?.equipment?.main || {}], ...Object.entries(save?.equipment?.companions || {})
    .filter(([owner]) => !activeOnly || owner === save.activeCompanion)];
  return owners.flatMap(([owner, gear]) => Object.entries(gear).filter(([slot, item]) => item && EQUIPMENT_PROGRESS_SLOTS.includes(slot))
    .map(([slot, item]) => ({ owner, slot, item })));
}
function workshopEquipmentItems(save = state) {
  return equipmentSlotEntries(save, true).map(entry => entry.item);
}
function requireWorkshopItem(save, itemId, { allowPet = false } = {}) {
  if (allowPet) {
    const pet = partyPets(save).find(pet => pet.id === itemId);
    if (pet) return pet;
  }
  const entry = equipmentSlotEntries(save, true).find(entry => entry.item.id === itemId);
  if (!entry) throw new Error('Wähle ein ausgerüstetes Teil von Main oder aktivem Gefährten.');
  return entry.item;
}
function workshopSlotLabel(item, save = state) {
  if (item.slot === 'pet') return `${item.ownerClass === save.mainClass ? 'Main' : 'Gefährte'} · Begleittier`;
  const entry = equipmentSlotEntries(save).find(entry => entry.item.id === item.id);
  if (!entry) return SLOT_DATA[item.slot]?.label || item.slot;
  const labels = { mainHand: 'Waffe', offHand: 'Nebenhand', helmet: 'Helm', chest: 'Brust', gloves: 'Handschuhe', boots: 'Schuhe', amulet: 'Amulett', ring1: 'Ring 1', ring2: 'Ring 2', earring1: 'Ohrring 1', earring2: 'Ohrring 2', glyph1: 'Glyphe 1', glyph2: 'Glyphe 2', glyph3: 'Glyphe 3' };
  return `${entry.owner === 'main' ? 'Main' : CLASSES[entry.owner].label} · ${labels[entry.slot]}`;
}
function applyEquipmentSlotProgress(item, progress) {
  const oldMultiplier = BALANCE.items.upgradeBaseStatMultiplier ** (item.upgradeLevel || 0);
  if (item.baseWeaponDamage == null && item.weaponDamage != null) item.baseWeaponDamage = Math.round(item.weaponDamage / oldMultiplier);
  if (item.baseArmorDefense == null && item.armorDefense != null) item.baseArmorDefense = Math.round(item.armorDefense / oldMultiplier);
  normalizeAffixUpgrades(item);
  item.upgradeLevel = progress.upgradeLevel || 0;
  const multiplier = BALANCE.items.upgradeBaseStatMultiplier ** item.upgradeLevel;
  if (item.baseWeaponDamage != null) item.weaponDamage = Math.round(item.baseWeaponDamage * multiplier);
  if (item.baseArmorDefense != null) item.armorDefense = Math.round(item.baseArmorDefense * multiplier);
  normalizeAffixUpgrades(item);
  if (progress.adminSocketOverride) item.adminSocketOverride = true;
  else delete item.adminSocketOverride;
  item.socketSlots = progress.socketSlots || 0;
  item.sockets = progress.sockets || [];
}
function equipmentSlotProgress(save, owner, slot) {
  save.equipmentSlotProgress ||= {};
  save.equipmentSlotProgress[owner] ||= {};
  return save.equipmentSlotProgress[owner][slot] ||= { upgradeLevel: 0, socketSlots: 0, sockets: [] };
}
function normalizeEquipmentSlotProgress(save) {
  save.equipmentSlotProgress ||= {};
  Object.entries(save.equipmentSlotProgress).forEach(([owner, slots]) => {
    if (owner !== 'main' && !Object.hasOwn(CLASSES, owner)) { delete save.equipmentSlotProgress[owner]; return; }
    Object.entries(slots).forEach(([slot, progress]) => {
      if (!EQUIPMENT_PROGRESS_SLOTS.includes(slot)) { delete slots[slot]; return; }
      progress.upgradeLevel = Math.max(0, Math.min(BALANCE.items.maxUpgradeLevel, Math.floor(Number(progress.upgradeLevel) || 0)));
      const capacity = socketCapacityForEquipmentSlot(slot);
      progress.socketSlots = Math.max(0, Math.min(capacity, Math.floor(Number(progress.socketSlots) || 0)));
      progress.sockets = Array.from({ length: progress.socketSlots }, (_, index) => progress.sockets?.[index] ? normalizeGearItem(progress.sockets[index]) : null);
    });
  });
  equipmentSlotEntries(save).forEach(({ owner, slot, item }) => {
    if (!save.equipmentSlotProgress[owner]?.[slot]) {
      const progress = equipmentSlotProgress(save, owner, slot);
      progress.upgradeLevel = item.upgradeLevel || 0;
      progress.socketSlots = item.socketSlots || 0;
      progress.sockets = item.sockets || [];
      if (item.adminSocketOverride) progress.adminSocketOverride = true;
    }
    applyEquipmentSlotProgress(item, equipmentSlotProgress(save, owner, slot));
  });
}
function recoverOverflowSocketGems(save) {
  const mirroredIds = new Set();
  equipmentSlotEntries(save).forEach(({ owner, slot, item }) => {
    if (save.equipmentSlotProgress?.[owner]?.[slot]) mirroredIds.add(item.id);
  });
  const containers = [
    ...Object.values(save.equipmentSlotProgress || {}).flatMap(slots => Object.entries(slots)
      .map(([slot, container]) => ({ container, capacity: socketCapacityForEquipmentSlot(slot) }))),
    ...[...(save.inventory || []), ...(save.mailbox || []).map(entry => entry.item), ...equipmentSlotEntries(save).map(entry => entry.item)]
      .map(container => ({ container, capacity: socketCapacityForSlot(container?.slot) })),
  ];
  save.inventory ||= [];
  containers.forEach(({ container, capacity }) => {
    if (!container || mirroredIds.has(container.id) || !Array.isArray(container.sockets) || container.sockets.length <= capacity) return;
    save.inventory.push(...container.sockets.slice(capacity).filter(Boolean));
    container.sockets = container.sockets.slice(0, capacity);
    container.socketSlots = Math.min(capacity, container.socketSlots || 0);
  });
}
function attachEquipmentSlotProgress(save, owner, slot, item) {
  const progress = equipmentSlotProgress(save, owner, slot);
  // Transfer legacy item investments once; unequipped items are stripped below.
  progress.upgradeLevel = Math.max(progress.upgradeLevel, item.upgradeLevel || 0);
  progress.socketSlots = Math.max(progress.socketSlots, item.socketSlots || 0);
  if (item.adminSocketOverride) progress.adminSocketOverride = true;
  const gems = (item.sockets || []).filter(Boolean);
  progress.sockets = Array.from({ length: progress.socketSlots }, (_, index) => progress.sockets[index] || null);
  gems.forEach(gem => {
    const empty = progress.sockets.findIndex(entry => !entry);
    if (empty >= 0) progress.sockets[empty] = gem;
    else addItemsToInventory(save, [gem]);
  });
  applyEquipmentSlotProgress(item, progress);
}
function captureEquipmentSlotProgress(save) {
  equipmentSlotEntries(save).forEach(({ owner, slot, item }) => {
    const progress = equipmentSlotProgress(save, owner, slot);
    progress.upgradeLevel = item.upgradeLevel || 0;
    progress.socketSlots = item.socketSlots || 0;
    progress.sockets = item.sockets || [];
    if (item.adminSocketOverride) progress.adminSocketOverride = true;
  });
}
function detachEquipmentSlotProgress(item) {
  applyEquipmentSlotProgress(item, { upgradeLevel: 0, socketSlots: 0, sockets: [] });
}
function returnToInventory(save, item) {
  if (item) save.inventory.push(item);
}
function validateEquipmentForClass(save, item, slot, className) {
  if (typeof slot !== 'string') return false;
  const definition = ARMOR_SETS[item?.set] || JEWELRY_SETS[item?.set];
  if (definition?.class && definition.class !== className) return false;
  if (slot === 'mainHand') return CLASS_WEAPONS[className]?.includes(item.slot) || false;
  if (slot === 'offHand') return item.slot === 'shield' && className === 'warrior';
  if (slot === 'ring1' || slot === 'ring2') return item.slot === 'ring';
  if (slot === 'earring1' || slot === 'earring2') return item.slot === 'earring';
  if (/^glyph[1-3]$/.test(slot)) return item.slot === 'glyph';
  return slot === item.slot && ['helmet', 'chest', 'gloves', 'boots', 'amulet'].includes(item.slot);
}
function validateMainEquipment(save, item, slot) { return validateEquipmentForClass(save, item, slot, save.mainClass); }
async function request(path, body) {
  if (path === '/state') {
    let saved = await readSavedState();
    if (!saved) {
      saved = defaultState();
      await writeSavedState(saved);
    } else {
      saved.activityLog ||= [];
      saved.activityUnread ||= 0;
      normalizeLegacyWeapons(saved);
      // Persist newly assigned pets once so reloading cannot reroll their first affixes.
      if (saved.petNeedsPersist || saved.huntNeedsPersist || saved.towerLootMigrationPending) await writeSavedState(saved);
      // Other migrations are persisted with the next action.
    }
    return { state: saved };
  }
  if (path === '/choose-main') {
    const saved = await readSavedState() || defaultState();
    if (saved.mainClass) throw new Error('Die Hauptklasse ist bereits gewählt.');
    const className = body.class;
    const companionClass = body.companion;
    const playerName = String(body.name || '').trim();
    if (!CLASSES[className]) throw new Error('Unbekannte Klasse.');
    if (!CLASSES[companionClass] || companionClass === className) throw new Error('Wähle einen Gefährten, der nicht deiner Hauptklasse entspricht.');
    if (!/^[\p{L}\p{N}_ .'-]{2,20}$/u.test(playerName)) throw new Error('Der Name muss 2 bis 20 Zeichen lang sein und darf Buchstaben, Zahlen, Leerzeichen, Punkte, Apostrophe, Bindestriche oder Unterstriche enthalten.');
    saved.playerName = playerName;
    saved.mainClass = className;
    saved.activeCompanion = companionClass;
    saved.souls = BALANCE.startingSouls;
    const starterSlot = { hunter: 'bow', warrior: 'sword', mage: 'staff', healer: 'bell' }[className];
    itemGridPreferences.inventory.category = 'weapons';
    itemGridPreferences.inventory.sort = 'rarity';
    const starterItem = makeItem(starterSlot, 'common');
    saved.inventory = [starterItem];
    normalizePet(saved);
    normalizeHuntingEvent(saved);
    await writeSavedState(saved);
    return { state: saved, message: 'Hauptklasse gewählt.' };
  }
  if (path === '/action') return localAction(body);
  throw new Error('Unbekannte Aktion.');
}
async function performAction(payload, successTitle, successText, { background = false } = {}) {
  const generation = stateGeneration;
  try {
    const task = enqueueStateTask(async () => {
      const result = await request('/action', payload);
      state = result.state || result.data?.state || state;
      refreshBattleHealth();
      const activity = payload.silent ? null : activityFor(payload, result);
      if (activity) {
        appendActivity(activity.title, activity.detail);
        await writeSavedState(state);
      }
      return result;
    });
    const result = await task;
    if (saveMaintenance || saveBlocked || generation !== stateGeneration) return null;
    if (['workshop-start', 'upgrade', 'fuse-glyphs', 'socket-slot', 'enchant-rarity', 'enchant-mythic', 'enchant-affix'].includes(payload.action) && result.outcomes?.length) playForgeAnimation(result);
    if (saveMaintenance || saveBlocked || generation !== stateGeneration) return null;
    if (['upgrade', 'upgrade-auto'].includes(payload.action) && currentView !== 'blacksmith' && !autoUpgradeRunning) {
      selectedForForge.clear();
    }
    const workshopView = ({ upgrade: 'blacksmith', 'fuse-glyphs': 'blacksmith', 'socket-slot': 'sockets', 'enchant-rarity': 'enchant', 'enchant-mythic': 'enchant', 'enchant-affix': 'enchant' })[payload.action];
    const preserveView = background || ['battle', 'record-combat-stats', 'boss-complete', 'boss-cancel'].includes(payload.action) || payload.action.startsWith('offline-')
      || Boolean(workshopView && currentView !== workshopView);
    render({ background: preserveView });
    return result;
  } catch (error) {
    if (!saveMaintenance && !saveBlocked && generation === stateGeneration) toastMessageFor('Aktion nicht möglich', error.message);
    return null;
  }
}

function enchantAffixPool(target) {
  return [...new Set(target?.slot === 'pet' ? PET_RULES.affixPool : AFFIX_POOLS[target?.slot] || [])];
}
function enchantAffixQuote(save, target, index, override = null) {
  const group = target?.slot === 'pet' ? 'pet' : 'equipment';
  const pool = enchantAffixPool(target);
  const current = target?.affixes?.[index]?.stat;
  const selected = override ?? save.settings?.enchantExcludedAffixes?.[group] ?? [];
  const excluded = [...new Set(selected)].filter(stat => pool.includes(stat) && stat !== current);
  const other = target?.slot !== 'pet' && !allowsRepeatedAffixes(target?.slot)
    ? (target?.affixes || []).filter((_, position) => position !== index).map(affix => affix.stat) : [];
  const candidates = pool.filter(stat => stat !== current && !other.includes(stat) && !excluded.includes(stat));
  const cost = Math.max(1, excluded.length ** 2);
  const available = inventoryQuantityForSlot(save, 'affixStone');
  const mythicStoneCost = isMythicEquipment(target) ? 1 : 0;
  const mythicStones = inventoryQuantityForSlot(save, 'mythicUpgradeStone');
  return { group, pool, current, excluded, candidates, cost, available, mythicStoneCost, mythicStones,
    canAfford: available >= cost && mythicStones >= mythicStoneCost };

}
function consumeAffixStones(save, amount) {
  if (inventoryQuantityForSlot(save, 'affixStone') < amount) throw new Error('Nicht genug Umpr\u00e4gungssteine.');
  let remaining = amount;
  for (const item of [...save.inventory]) {
    if (item.slot !== 'affixStone' || !remaining) continue;
    const quantity = Math.max(1, Number(item.quantity) || 1);
    const taken = Math.min(quantity, remaining);
    remaining -= taken;
    if (taken === quantity) save.inventory.splice(save.inventory.indexOf(item), 1);
    else item.quantity = quantity - taken;
  }
}
