(async function loadDarkReturn() {
  const container = document.querySelector('#view-container');
  const escape = (value) => String(value).replace(/[&<>"']/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]);
  try {
    const indexUrl = new URL('data/config/index.json', document.baseURI);
    const indexResponse = await fetch(indexUrl);
    if (!indexResponse.ok) throw new Error(`Die Konfigurationsliste konnte nicht geladen werden (HTTP ${indexResponse.status}).`);
    const manifest = await indexResponse.json();
    if (!Array.isArray(manifest.modules) || manifest.modules.length === 0) throw new Error('Die Konfigurationsliste enthält keine Module.');
    const modules = await Promise.all(manifest.modules.map(async (path) => {
      if (typeof path !== 'string' || !path.endsWith('.json')) throw new Error('Die Konfigurationsliste enthält einen ungültigen Modulpfad.');
      const url = new URL(path, indexUrl);
      const response = await fetch(url);
      if (!response.ok) throw new Error(`Konfigurationsmodul ${path} konnte nicht geladen werden (HTTP ${response.status}).`);
      return [path, await response.json()];
    }));
    const config = {};
    const balanceKeys = new Set();
    for (const [path, module] of modules) {
      if (!module || typeof module !== 'object' || Array.isArray(module)) throw new Error(`Konfigurationsmodul ${path} ist ungültig.`);
      for (const [key, value] of Object.entries(module)) {
        if (key === 'balance') {
          if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(`Balance-Modul ${path} ist ungültig.`);
          config.balance ||= {};
          for (const [balanceKey, balanceValue] of Object.entries(value)) {
            if (balanceKeys.has(balanceKey)) throw new Error(`Der Balance-Bereich ${balanceKey} ist mehrfach definiert.`);
            balanceKeys.add(balanceKey);
            config.balance[balanceKey] = balanceValue;
          }
        } else {
          if (Object.hasOwn(config, key)) throw new Error(`Der Konfigurationsbereich ${key} ist mehrfach definiert.`);
          config[key] = value;
        }
      }
    }
    const requiredCollections = ['classes', 'pets', 'classWeapons', 'slots', 'inventoryCategories', 'areas', 'contracts', 'questStages', 'armorSets', 'enemies', 'enemySkills', 'affixPools', 'affixRanges', 'classAttributeScaling', 'companionSkills', 'skillTreeNodes', 'worldEvents', 'balance'];
    const missing = requiredCollections.filter((key) => !config[key] || (Array.isArray(config[key]) && config[key].length === 0));
    if (missing.length) throw new Error("Spieldaten fehlen: " + missing.join(", ") + ".");
    const skillNodes = config.skillTreeNodes;
    const skillNodeIds = new Set(skillNodes.map((node) => node.id));
    const validSkillEffectTypes = new Set(['stat-flat', 'attribute-flat', 'primary-attribute-flat', 'all-attributes-flat', 'final-percent', 'soul-drop-percent', 'legendary-drop-chance', 'final-damage-percent', 'warrior-stomp-area', 'hunter-critical-overflow', 'healer-final-damage-percent', 'self-life-steal-percent', 'warrior-execution-area-penalty', 'mage-instant-fireball', 'hunter-poison-chance', 'healer-damage-reduction-cap', 'dodge-chance', 'extra-attack-chance', 'dot-to-attack-percent', 'skill-damage-flat-percent', 'additional-passive-slot']);
    const statSkillEffectTypes = new Set(['stat-flat', 'attribute-flat', 'final-percent']);
    const invalidSkillNode = (node) => !node || typeof node.id !== 'string' || !node.id || (node.class && !Object.hasOwn(config.classes, node.class)) || !Number.isInteger(node.maxPoints) || node.maxPoints < 0 || !node.name || !node.iconAsset || (node.parent && !skillNodeIds.has(node.parent)) || (node.effect && (!validSkillEffectTypes.has(node.effect.type) || !Number.isFinite(node.effect.perPoint) || (statSkillEffectTypes.has(node.effect.type) && (typeof node.effect.stat !== 'string' || !config.baseStats || !(node.effect.stat in config.baseStats)))));
    if (skillNodeIds.size !== skillNodes.length || skillNodes.filter((node) => node.id === 'origin' && node.rarity === 'origin' && node.parent === null && !node.effect).length !== 1 || skillNodes.some(invalidSkillNode) || !skillNodes.some(node => node.rarity === 'legendary')) {
      throw new Error('Der Skilltree ist unvollständig oder enthält ungültige Knoten.');
    }
    if (skillNodes.some(node => node.effect?.type === 'skill-damage-flat-percent' && !config.companionSkills[node.class]?.active?.some(skill => skill.id === node.effect.skillId && Number.isFinite(skill.damageMultiplier)))) throw new Error('Ein Fähigkeitsknoten verweist auf keine passende Schadensfähigkeit.');
    const skillBranches = config.skillTreeBranches;
    if (!Array.isArray(skillBranches) || !skillBranches.length || new Set(skillBranches.map(branch => branch.id)).size !== skillBranches.length || skillBranches.some(branch => !branch.id || !branch.label)) throw new Error('Die Talentpfade sind unvollständig konfiguriert.');
    if (skillNodes.some(node => node.id !== 'origin' && (!skillBranches.some(branch => branch.id === node.branch) || !Number.isInteger(node.tier) || node.tier < 1 || !Number.isInteger(node.requiredParentPoints) || node.requiredParentPoints < 0 || node.requiredParentPoints > (skillNodes.find(parent => parent.id === node.parent)?.maxPoints ?? 0)))) throw new Error('Die Talentvoraussetzungen sind ungültig.');
    if (['Kritische Chance', 'Angriffsgeschwindigkeit', 'Abklingzeitreduktion'].some(stat => skillNodes.filter(node => node.effect?.stat === stat).reduce((sum, node) => sum + node.effect.perPoint * node.maxPoints, 0) > 20)) throw new Error('Kritchance, Angriffstempo und Abklingzeitreduktion dürfen im Talentbaum jeweils höchstens 20 % geben.');
    const isValidPassiveEffect = (effect) => {
      if (!effect) return false;
      if (['stat-percent', 'stat-flat'].includes(effect.type)) return typeof effect.stat === 'string' && ['party', 'self'].includes(effect.scope) && Number.isFinite(effect.value);
      if (effect.type === 'damage-percent') return ['party', 'self'].includes(effect.scope) && Number.isFinite(effect.value);
      if (effect.type === 'multiplicative-damage-percent') return ['party', 'self'].includes(effect.scope) && Number.isFinite(effect.value);
      if (effect.type === 'taunt') return effect.scope === 'self';
      if (effect.type === 'rest-healing-percent') return ['party', 'self'].includes(effect.scope) && Number.isFinite(effect.value);
      if (effect.type === 'bow-poison') return Number.isFinite(effect.chancePercent) && Number.isFinite(effect.durationSeconds) && effect.durationSeconds > 0 && Number.isFinite(effect.damagePercent);
      return false;
    };
    const invalidPassiveEffects = Object.values(config.companionSkills).some((skills) => !Array.isArray(skills.passive) || skills.passive.some((skill) => {
      const effects = Array.isArray(skill.effect) ? skill.effect : [skill.effect];
      return !effects.length || effects.some((effect) => !isValidPassiveEffect(effect));
    }));
    if (invalidPassiveEffects) throw new Error('Passive Fähigkeiten benötigen gültige Effektdaten.');
    const boxRules = config.boxRules;
    const glyphDefinitions = config.glyphDefinitions;
    if (!Array.isArray(glyphDefinitions) || !glyphDefinitions.length || new Set(glyphDefinitions.map(glyph => glyph.id)).size !== glyphDefinitions.length || glyphDefinitions.some(glyph => !glyph.id || !glyph.name || !(glyph.stat in config.baseStats) || !['Angriff', 'Lebenskraft'].includes(glyph.bonusStat || 'Angriff'))) throw new Error('Die Glyphen sind unvollständig konfiguriert.');
    if (!Number.isFinite(boxRules?.vipBox?.ticketChance) || boxRules.vipBox.ticketChance < 0 || boxRules.vipBox.ticketChance > 100 || !Number.isFinite(config.vip?.durationDays) || config.vip.durationDays <= 0) throw new Error('Die VIP-Regeln sind unvollständig konfiguriert.');
    if (['dropRatePercent', 'soulBonusPercent', 'upgradeChancePercent'].some(key => !Number.isFinite(config.vip?.[key]) || config.vip[key] < 0)) throw new Error('Die VIP-Beuteboni sind unvollständig konfiguriert.');
    if (!Number.isInteger(config.equipmentShop?.offerCount) || config.equipmentShop.offerCount < 1 || !Number.isSafeInteger(config.equipmentShop.refreshIntervalSeconds) || config.equipmentShop.refreshIntervalSeconds < 1 || ['common', 'uncommon', 'rare', 'epic', 'legendary', 'legendaryGreater'].some(key => !Number.isSafeInteger(config.equipmentShop?.prices?.[key]) || config.equipmentShop.prices[key] <= 0)) throw new Error('Die Ausrüstungsangebote sind unvollständig konfiguriert.');
    if (!Array.isArray(boxRules?.consolationPool) || !boxRules.consolationPool.length || !(Number(boxRules.glyphBox?.chancePerGlyph) > 0) || boxRules.glyphBox.chancePerGlyph * glyphDefinitions.length > 100) {
      throw new Error('Die Luckybox-Regeln sind unvollständig konfiguriert.');
    }
    const gemAttributes = ['Stärke', 'Geschicklichkeit', 'Ausdauer', 'Intelligenz', 'Glaube'];
    if (!Array.isArray(config.gemProfiles) || config.gemProfiles.length !== gemAttributes.length || gemAttributes.some(attribute => config.gemProfiles.filter(profile => profile.attribute === attribute).length !== 1) || config.gemProfiles.some(profile => profile.slot !== 'weaponGem' || typeof profile.profile !== 'string' || !gemAttributes.includes(profile.attribute))) throw new Error('Der Edelsteinpool ist unvollständig konfiguriert.');
    const gemWeights = config.balance.items.gemRarityWeights;
    const gemRarities = config.rarities.filter(rarity => rarity.color !== 'mythic');
    if (!Number.isSafeInteger(config.balance.items.gemUpgradeRatio) || config.balance.items.gemUpgradeRatio < 2) throw new Error('Das Edelstein-Aufwertungsverhältnis muss mindestens 2 betragen.');
    if (!gemWeights || gemRarities.some(rarity => !Number.isFinite(gemWeights[rarity.color]) || gemWeights[rarity.color] < 0) || Math.abs(Object.values(gemWeights).reduce((sum, value) => sum + value, 0) - 100) > 0.000001) throw new Error('Die Edelstein-Seltenheiten müssen zusammen 100 % ergeben.');
    if (gemRarities.some(rarity => {
      const values = config.balance.items.gemValues?.[rarity.color];
      return !values || !Number.isFinite(values.attribute) || values.attribute <= 0 || !values.bonuses || typeof values.bonuses !== 'object' || Array.isArray(values.bonuses)
        || Object.entries(values.bonuses).some(([stat, value]) => !(stat in config.baseStats) || gemAttributes.includes(stat) || !Number.isFinite(value) || value < 0);
    })) throw new Error('Die Edelsteinwerte sind unvollständig konfiguriert.');
    const socketLimit = config.balance.items.socketCounts?.equipment;
    const socketChances = config.balance.items.socketSuccessChanceByTarget?.equipment;
    if (!Number.isSafeInteger(socketLimit) || socketLimit < 1 || socketLimit > 100 || !Array.isArray(socketChances) || socketChances.length !== socketLimit || socketChances.some(chance => !Number.isFinite(chance) || chance < 0 || chance > 100)) throw new Error('Die Sockelgrenze und Erfolgschancen sind unvollständig konfiguriert.');
    const farmBox = boxRules?.farmBox;
    const farmMaterialSlots = ['upgradeStone', 'socketStone', 'affixStone', 'rarityStone', 'bossReset', 'towerReset'];
    if (!Number.isFinite(farmBox?.dropChance) || farmBox.dropChance < 0 || farmBox.dropChance > 1 || !config.slots.farmBox
      || !Array.isArray(farmBox.rewards) || !farmBox.rewards.length
      || farmBox.rewards.some(outcome => !outcome.label || !Number.isFinite(outcome.chance) || outcome.chance <= 0
        || (outcome.type === 'souls' ? !Number.isSafeInteger(outcome.minimum) || outcome.minimum < 0 || !Number.isSafeInteger(outcome.maximum) || outcome.maximum < outcome.minimum
          : outcome.quantity !== 1 || !(outcome.type === 'powerup' || (outcome.type === 'material' && farmMaterialSlots.includes(outcome.slot))
            || (outcome.type === 'box' && ['glyphBox', 'vipBox'].includes(outcome.group)))))
      || Math.abs(farmBox.rewards.reduce((sum, outcome) => sum + outcome.chance, 0) - 100) > 0.000001) {
      throw new Error('Die Farm-Luckybox ist unvollständig konfiguriert.');
    }
    const towerLootChoices = config.balance.loot?.towerLootChoices;
    if (!Number.isFinite(config.balance.loot?.towerLootChancePerBoss) || config.balance.loot.towerLootChancePerBoss < 0) throw new Error('Der Turmboss-Beutebonus ist ungültig.');
    const towerScaling = config.balance.combat?.towerScaling;
    if (!Number.isSafeInteger(towerScaling?.referenceRound) || towerScaling.referenceRound <= 1
      || ['start', 'target'].some(anchor => !config.areas.some(area => area.id === towerScaling[`${anchor}Area`])
        || !Number.isInteger(towerScaling[`${anchor}DeepTier`]) || towerScaling[`${anchor}DeepTier`] < 0
        || towerScaling[`${anchor}DeepTier`] > config.balance.deepOfDark.maxTier)) {
      throw new Error('Die Rundenskalierung des Turms ist unvollständig konfiguriert.');
    }
    const towerLootIds = ['upgradeStone', 'socketStone', 'affixStone', 'gems', 'powerup'];
    if (!Array.isArray(towerLootChoices) || towerLootChoices.length !== towerLootIds.length || towerLootIds.some(id => towerLootChoices.filter(choice => choice.id === id).length !== 1) || towerLootChoices.some(choice => !choice.label || !Number.isFinite(choice.chance) || choice.chance < 0 || choice.chance > 100)) throw new Error('Die Turmbeute ist unvollständig konfiguriert.');
    const validWorldEventStats = new Set(['attackPercent', 'healthPercent', 'strengthPercent', 'staminaPercent', 'dexterityPercent', 'intelligencePercent', 'soulBonusPercent', 'dropRatePercent', 'upgradeChancePercent', 'mythicDropBonusPercent']);
    if (!Array.isArray(config.worldEvents) || !config.worldEvents.length || config.worldEvents.some((event) => !event.id || !Array.isArray(event.effects) || !event.effects.length || event.effects.some((effect) => !validWorldEventStats.has(effect.stat) || !effect.label || !Number.isFinite(effect.value)))) {
      throw new Error('Die Welt-Events sind unvollständig konfiguriert.');
    }
    const areaIds = config.areas.map((area) => area.id);
    const invalidAreaData = areaIds.filter((id) => !config.enemies[id] || !config.enemySkills[id]);
    if (invalidAreaData.length) throw new Error(`Für folgende Gebiete fehlen Gegnerdaten: ${invalidAreaData.join(', ')}.`);
    const rarityTables = config.balance.items?.rarityWeightsByArea;
    if (!Array.isArray(rarityTables) || rarityTables.length < config.areas.length || rarityTables.some((weights) => {
      const values = Object.values(weights || {});
      return !values.length || values.some((weight) => !Number.isFinite(weight) || weight < 0) || values.reduce((sum, weight) => sum + weight, 0) !== 100;
    })) {
      throw new Error('Die Seltenheitschancen m\u00fcssen f\u00fcr jedes Gebiet definiert sein und jeweils 100 % ergeben.');
    }
    if (!config.balance.questBook?.individualRewardPerStage || !config.balance.combat?.tickMilliseconds || !config.balance.loot?.eliteEveryEncounters) {
      throw new Error('Die Balance-Grundwerte sind unvollst\u00e4ndig.');
    }
    if (!Number.isFinite(config.balance.bossChallenge?.durationSeconds) || !config.balance.dailyAttempts || !['boss', 'tower', 'vipBonus'].every(key => Number.isSafeInteger(config.balance.dailyAttempts[key]) && config.balance.dailyAttempts[key] >= 0) || !config.balance.dailyAttempts.timeZone || !Number.isFinite(config.balance.bossChallenge?.soulsPerRank) || (!Array.isArray(config.balance.bossChallenge?.luckyBoxesPerRank) || config.balance.bossChallenge.luckyBoxesPerRank.length !== 2 || !config.balance.bossChallenge.luckyBoxesPerRank.every(value => Number.isInteger(value) && value >= 1) || config.balance.bossChallenge.luckyBoxesPerRank[0] > config.balance.bossChallenge.luckyBoxesPerRank[1]) || !Array.isArray(config.balance.bossChallenge?.luckyBoxGroups)) {
      throw new Error('Die Bosspr\u00fcfung ist unvollst\u00e4ndig.');
    }
    const questBoard = config.balance.questBoard;
    const weaponLevels = config.weaponProgression;
    if (!Array.isArray(weaponLevels?.weaponSlots) || weaponLevels.weaponSlots.length !== 4 || weaponLevels.weaponSlots.some(slot => !['bow', 'sword', 'staff', 'bell'].includes(slot))
      || !Number.isSafeInteger(weaponLevels.maxLevel) || weaponLevels.maxLevel !== 100
      || !Number.isFinite(weaponLevels.damagePercentPerLevel) || weaponLevels.damagePercentPerLevel < 0
      || !Number.isFinite(weaponLevels.completionDamagePercent) || weaponLevels.completionDamagePercent < 0
      || !Number.isSafeInteger(weaponLevels.experiencePerKill) || weaponLevels.experiencePerKill < 1
      || !Number.isSafeInteger(weaponLevels.experienceStep) || weaponLevels.experienceStep < 1) throw new Error('Waffenlevel sind unvollständig konfiguriert.');
    const mythic = config.mythicItems;
    const mythicUpgrades = config.balance.items.mythicUpgrades;
    const mythicLoot = config.balance.loot.mythicWeapons;
    if (!Array.isArray(mythic?.weaponSlots) || !mythic.weaponSlots.length
      || mythic.weaponSlots.some(slot => !['bow', 'sword', 'staff', 'bell'].includes(slot))
      || !Number.isSafeInteger(mythicUpgrades?.maxUpgradeLevel) || mythicUpgrades.maxUpgradeLevel < 1 || mythicUpgrades.maxUpgradeLevel > 100
      || !Number.isInteger(mythic.saleStones) || mythic.saleStones < 1 || !config.slots.mythicUpgradeStone
      || !Array.isArray(mythic.weaponBaseDamageRange) || mythic.weaponBaseDamageRange.length !== 2
      || mythic.weaponBaseDamageRange.some(value => !Number.isSafeInteger(value) || value < 1) || mythic.weaponBaseDamageRange[0] > mythic.weaponBaseDamageRange[1]
      || !Number.isFinite(mythicUpgrades.damagePercentPerLevel) || mythicUpgrades.damagePercentPerLevel < 0
      || !Array.isArray(mythicUpgrades.successChanceByLevel) || mythicUpgrades.successChanceByLevel.length !== mythicUpgrades.maxUpgradeLevel
      || mythicUpgrades.successChanceByLevel.some(chance => !Number.isFinite(chance) || chance < 0 || chance > 100)
      || !config.rarities.some(rarity => rarity.color === 'mythic') || config.balance.items.affixCountByRarity.mythic !== 4
      || !Number.isInteger(mythicLoot?.minimumDeepTier) || mythicLoot.minimumDeepTier < 1 || mythicLoot.minimumDeepTier > config.balance.deepOfDark.maxTier
      || !Array.isArray(mythicLoot.dropChanceByArea) || mythicLoot.dropChanceByArea.length !== config.areas.length
      || mythicLoot.dropChanceByArea.some(chance => !Number.isFinite(chance) || chance < 0 || chance > 1)) {
      throw new Error('Mystische Waffen und ihre Dropchancen sind unvollständig konfiguriert.');
    }
    const offline = config.balance.offlineProgress;
    if (!Number.isFinite(offline?.efficiency) || offline.efficiency <= 0 || offline.efficiency > 1
      || !Number.isFinite(offline.maximumHours) || offline.maximumHours <= 0 || offline.maximumHours > 168
      || !Number.isSafeInteger(offline.sampleLimit) || offline.sampleLimit < 1 || offline.sampleLimit > 100
      || !Number.isSafeInteger(offline.minimumSamples) || offline.minimumSamples < 1 || offline.minimumSamples > offline.sampleLimit
      || !Number.isFinite(offline.checkpointSeconds) || offline.checkpointSeconds < 1) throw new Error('Der Offline-Fortschritt ist unvollst\u00e4ndig konfiguriert.');
    const huntingEvent = config.balance.huntingEvent;
    if (!Number.isSafeInteger(huntingEvent?.targetKills) || huntingEvent.targetKills < 1
      || !Number.isSafeInteger(huntingEvent.intervalSeconds) || huntingEvent.intervalSeconds < 1
      || ['glyphBox', 'vipBox', 'farmBox'].some(group => !Number.isSafeInteger(huntingEvent.rewards?.[group]) || huntingEvent.rewards[group] < 1)) {
      throw new Error('Die Jagdaufträge sind unvollständig konfiguriert.');
    }
    const batchSize = questBoard?.batchSize;
    const hasInvalidFixedGroup = !Array.isArray(questBoard?.fixedGroups) || questBoard.fixedGroups.length !== 12 || questBoard.fixedGroups.some(group =>
      !Array.isArray(group.tasks) || group.tasks.length !== batchSize || !Array.isArray(group.rewards) || group.rewards.length !== batchSize);
    if (!Number.isInteger(batchSize) || batchSize < 1 || hasInvalidFixedGroup || questBoard.repeatTasks?.length < batchSize || questBoard.rewardPool?.length < batchSize) {
      throw new Error('Das Auftragsbrett ist unvollst\u00e4ndig.');
    }
    const pets = config.pets;
    if (!Number.isInteger(pets.attributePerLevel) || pets.attributePerLevel < 1
      || !Number.isFinite(pets.affixPercentPerLevel) || pets.affixPercentPerLevel < 0
      || !Number.isInteger(pets.affixEveryLevels) || pets.affixEveryLevels < 1
      || !Array.isArray(pets.affixPool) || pets.affixPool.length < 2
      || pets.affixPool.some(stat => !Array.isArray(config.affixRanges[stat]))
      || Object.keys(config.classes).some(owner => !pets.byClass?.[owner]?.name
        || !pets.byClass[owner].asset || !Object.hasOwn(config.baseStats, pets.byClass[owner].stat))) {
      throw new Error('Die Begleittiere sind unvollständig konfiguriert.');
    }
    window.DARK_RETURN_CONFIG = config;

    const scripts = ['config', 'world-events', 'state', 'hunting-events', 'pets', 'activity-log', 'state-actions', 'character', 'offline-progress', 'save-validation', 'views-world', 'views-workshop', 'views-progression', 'views-admin', 'views-handbook', 'views-settings', 'views-codex', 'views', 'actions', 'workshop-animation', 'workshop-jobs', 'battle-scene', 'combat', 'mobile', 'mobile-workshop', 'interactions'];
    const moduleVersion = `20261113-combat-finish-2-${Date.now().toString(36)}`;
    for (const name of scripts) {
      await new Promise((resolve, reject) => {
        const script = document.createElement('script');
        const moduleUrl = new URL(`js/${name}.js`, document.baseURI);
        moduleUrl.searchParams.set('v', moduleVersion);
        script.src = moduleUrl.href;
        script.async = false;
        script.onload = resolve;
        script.onerror = () => reject(new Error(`Das Spielmodul js/${name}.js konnte nicht geladen werden.`));
        document.body.append(script);
      });
    }
  } catch (error) {
    if (!container) return;
    container.innerHTML = `<section class="server-error"><p class="eyebrow">DARK RETURN KANN NICHT STARTEN</p><h1>Die Reise ruht.</h1><p>${escape(error.message || 'Die Spieldaten konnten nicht geladen werden.')} Öffne das Projekt über VS Code Live Server oder die veröffentlichte HTTPS-Adresse.</p><button class="primary-button ui-control ui-button" type="button" onclick="location.reload()">ERNEUT LADEN <span>↻</span></button></section>`;
  }
})();
