// Runtime constants are assembled from the modular files in data/config/.
const GAME_CONFIG = window.DARK_RETURN_CONFIG;
const CLASSES = GAME_CONFIG.classes;
const CLASS_WEAPONS = GAME_CONFIG.classWeapons;
const SLOT_DATA = GAME_CONFIG.slots;
const INVENTORY_CATEGORIES = GAME_CONFIG.inventoryCategories;
const STAT_KEYS = GAME_CONFIG.statKeys;
const BUFF_EFFECT_STAT = STAT_KEYS.find((key) => key.startsWith('Buff- und')) || 'Buff- und Heileffektivität';
const BASE_STATS = GAME_CONFIG.baseStats;
const RARITY_ORDER = GAME_CONFIG.rarityOrder;
const SHOP_OFFERS = GAME_CONFIG.shopOffers;
const EQUIPMENT_SHOP = GAME_CONFIG.equipmentShop;
const VIP_RULES = GAME_CONFIG.vip;
const TOWER_LOOT_BOOST_STAT = 'Turmbeute'; // Retired: accepted only to migrate existing saves.
const BOX_RULES = GAME_CONFIG.boxRules;
const BOX_GROUPS = Object.keys(BOX_RULES).filter(group => SLOT_DATA[group]);
const GEM_PROFILES = GAME_CONFIG.gemProfiles;
const AREAS = GAME_CONFIG.areas;
const RARITIES = GAME_CONFIG.rarities;
const MYTHIC_ITEMS = GAME_CONFIG.mythicItems;
const MYTHIC_UPGRADES = GAME_CONFIG.balance.items.mythicUpgrades;
const WEAPON_PROGRESSION = GAME_CONFIG.weaponProgression;
const AFFIX_POOLS = GAME_CONFIG.affixPools;
const AFFIX_RANGES = GAME_CONFIG.affixRanges;
const CLASS_ATTRIBUTE_SCALING = GAME_CONFIG.classAttributeScaling;
const AFFIX_PERCENT_STATS = new Set(['Lebenskraft', 'Angriff', 'Verteidigung', 'Trefferchance', 'Kritische Chance', 'Kritischer Schaden', 'Schaden gegen verwundbare Ziele', 'Schaden \u00fcber Zeit', 'Angriffsgeschwindigkeit', 'Seelenfund', BUFF_EFFECT_STAT]);
const STAT_PERCENT_STATS = new Set(['Trefferchance', 'Kritische Chance', 'Kritischer Schaden', 'Schaden gegen verwundbare Ziele', 'Schaden \u00fcber Zeit', 'Angriffsgeschwindigkeit', 'Seelenfund', BUFF_EFFECT_STAT]);
AFFIX_PERCENT_STATS.add('Abklingzeitreduktion');
STAT_PERCENT_STATS.add('Abklingzeitreduktion');
AFFIX_PERCENT_STATS.add('Doppeltrefferchance');
STAT_PERCENT_STATS.add('Doppeltrefferchance');
const ITEM_NAMES = GAME_CONFIG.itemNames;
const ARMOR_SETS = GAME_CONFIG.armorSets;
const JEWELRY_SETS = GAME_CONFIG.jewelrySets || {};
const ITEM_SETS = Object.keys(ARMOR_SETS).filter((name) => !ARMOR_SETS[name].beginner);
const JEWELRY_SET_NAMES = Object.keys(JEWELRY_SETS);
const CONTRACT_MILESTONE_REWARDS = GAME_CONFIG.contractMilestoneRewards;
const SHOP_COSTS = GAME_CONFIG.shopCosts;
const EQUIPMENT_POOLS = GAME_CONFIG.equipmentPools;
const CONTRACTS = GAME_CONFIG.contracts;
const QUEST_STAGES = GAME_CONFIG.questStages;
const QUEST_BOARD = GAME_CONFIG.balance.questBoard;
const HUNTING_EVENT_RULES = GAME_CONFIG.balance.huntingEvent;
const COMPANION_SKILLS = GAME_CONFIG.companionSkills;
const SKILL_TREE_NODES = GAME_CONFIG.skillTreeNodes;
const ENEMIES = GAME_CONFIG.enemies;
const ENEMY_SKILLS = GAME_CONFIG.enemySkills;
const CLASS_DAMAGE = GAME_CONFIG.classDamage;
const WORLD_EVENTS = GAME_CONFIG.worldEvents || [];
const BALANCE = GAME_CONFIG.balance;
const GEM_RARITIES = RARITIES.filter(rarity => BALANCE.items.gemValues[rarity.color]);

function detailTextLines(value) {
  return String(value ?? '').split(/\r?\n|\s*;\s*|\s+·\s+/).map(line => line.trim()).filter(Boolean);
}
function detailLinesMarkup(value) { return detailTextLines(value).map(escapeHtml).join('<br>'); }

function isMythicWeapon(item) {
  return item?.rarityColor === 'mythic' && MYTHIC_ITEMS.weaponSlots.includes(item.slot);
}

function lootRuleSlots() {
  return Object.keys(SLOT_DATA).filter(slot => AFFIX_POOLS[slot] || slot === 'glyph');
}
function lootRuleSets(slot = 'any') {
  if (['helmet', 'chest', 'gloves', 'boots'].includes(slot)) return Object.keys(ARMOR_SETS);
  if (['ring', 'amulet', 'earring'].includes(slot)) return Object.keys(JEWELRY_SETS);
  return slot === 'any' ? [...Object.keys(ARMOR_SETS), ...Object.keys(JEWELRY_SETS)] : [];
}
function lootRuleMaxGreater() {
  return Math.max(0, ...Object.values(BALANCE.items.affixCountByRarity));
}
function validLootCollectionRules(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value) || typeof value.enabled !== 'boolean'
    || !Array.isArray(value.rules) || value.rules.length > 20 || (value.enabled && !value.rules.length)) return false;
  return value.rules.every(rule => rule && typeof rule === 'object'
    && (rule.slot === 'any' || lootRuleSlots().includes(rule.slot))
    && (rule.rarity === 'any' || RARITIES.some(rarity => rarity.color === rule.rarity && rarity.color !== 'mythic'))
    && (['any', 'without-set'].includes(rule.set) || (rule.set === 'with-set' && lootRuleSets(rule.slot).length > 0) || lootRuleSets(rule.slot).includes(rule.set))
    && Number.isInteger(rule.minGreater) && rule.minGreater >= 0 && rule.minGreater <= lootRuleMaxGreater());
}
function shouldAutoSellEquipmentDrop(save, item) {
  if (item.rarityColor === 'mythic') return false;
  const greaterCount = (item.affixes || []).filter(affix => affix.greater).length;
  const filter = save.settings.lootCollectionRules;
  if (filter?.enabled && validLootCollectionRules(filter)) {
    return !filter.rules.some(rule => (rule.slot === 'any' || rule.slot === item.slot)
      && (rule.rarity === 'any' || rule.rarity === item.rarityColor)
      && (rule.set === 'any' || (rule.set === 'with-set' ? Boolean(item.set)
        : rule.set === 'without-set' ? !item.set : item.set === rule.set))
      && greaterCount >= rule.minGreater);
  }
  return !greaterCount && (save.settings.autoSellRarities || []).includes(item.rarityColor)
    && (!save.settings.autoSellNonSet || !item.set);
}

function isLevelWeapon(item) { return Boolean(item && WEAPON_PROGRESSION.weaponSlots.includes(item.slot)); }
function weaponExperienceThreshold(level) {
  return WEAPON_PROGRESSION.experienceStep * level * (level + 1) / 2;
}
function normalizeWeaponProgress(item) {
  if (!isLevelWeapon(item)) return item;
  const fallback = weaponExperienceThreshold(Math.max(0, Math.min(WEAPON_PROGRESSION.maxLevel, Math.floor(Number(item.weaponLevel) || 0))));
  item.weaponExperience = Math.max(0, Math.min(weaponExperienceThreshold(WEAPON_PROGRESSION.maxLevel), Math.floor(Number(item.weaponExperience ?? fallback) || 0)));
  let level = 0;
  while (level < WEAPON_PROGRESSION.maxLevel && item.weaponExperience >= weaponExperienceThreshold(level + 1)) level += 1;
  item.weaponLevel = level;
  return item;
}
function weaponLevelDamageMultiplier(item) {
  return isLevelWeapon(item) ? 1 + Math.max(0, Math.min(WEAPON_PROGRESSION.maxLevel, Number(item.weaponLevel) || 0)) * WEAPON_PROGRESSION.damagePercentPerLevel / 100 : 1;
}
function weaponCompletionDamageMultiplier(item) {
  return isLevelWeapon(item) && (item.weaponLevel || 0) >= WEAPON_PROGRESSION.maxLevel ? 1 + WEAPON_PROGRESSION.completionDamagePercent / 100 : 1;
}
function effectiveWeaponDamage(item) { return Math.round((item?.weaponDamage || 0) * weaponLevelDamageMultiplier(item)); }

function mythicDamagePercent(item) {
  return isMythicWeapon(item) ? MYTHIC_UPGRADES.damagePercentPerLevel * Math.max(0, Math.min(MYTHIC_UPGRADES.maxUpgradeLevel, Math.floor(Number(item.mythicUpgradeLevel) || 0))) : 0;
}

function skillTreeSpecialValue(type, className, sourceState = state) {
  const ranks = sourceState?.skillTree?.[className]?.nodes || {};
  return SKILL_TREE_NODES.reduce((sum, node) => sum + (node.effect?.type === type && (!node.class || node.class === className)
    ? (Number(ranks[node.id]) || 0) * node.effect.perPoint : 0), 0);
}
function empoweredClassSkill(skill, className, sourceState = state) {
  if (!skill) return skill;
  const skillBonus = SKILL_TREE_NODES.reduce((sum, node) => sum + (node.effect?.type === 'skill-damage-flat-percent'
    && node.class === className && node.effect.skillId === skill.id
    ? (Number(sourceState?.skillTree?.[className]?.nodes?.[node.id]) || 0) * node.effect.perPoint : 0), 0);
  if (skillBonus) {
    const baseSkill = COMPANION_SKILLS[className]?.active?.find(entry => entry.id === skill.id);
    if (typeof baseSkill?.damageMultiplier === 'number') skill = { ...skill, damageMultiplier: baseSkill.damageMultiplier + skillBonus / 100 };
  }
  if (className === 'warrior' && skill.id === 'stampfen') {
    return { ...skill, areaEffect: skillTreeSpecialValue('warrior-stomp-area', className, sourceState) > 0, damageMultiplier: skill.damageMultiplier };
  }
  if (className === 'warrior' && skill.id === 'henkerschlag') {
    const penalty = skillTreeSpecialValue('warrior-execution-area-penalty', className, sourceState);
    if (penalty > 0) {
      const baseSkill = COMPANION_SKILLS.warrior.active.find(entry => entry.id === 'henkerschlag');
      return { ...skill, effect: 'area-damage', areaEffect: true, damageMultiplier: Math.max(0, baseSkill.damageMultiplier + skillBonus / 100 - penalty / 100) };
    }
  }
  if (className === 'mage' && skill.effect === 'burn-hit' && skillTreeSpecialValue('mage-instant-fireball', className, sourceState) > 0) {
    return { ...skill, effect: 'damage', cooldown: skill.cooldown / 2, projectileType: 'fire', instantFireball: true };
  }
  if (className === 'hunter' && skill.effect?.type === 'bow-poison') {
    const chancePercent = skillTreeSpecialValue('hunter-poison-chance', className, sourceState);
    if (chancePercent) return { ...skill, effect: { ...skill.effect, chancePercent } };
  }
  return skill;
}
function damageReductionCapPercent(className, sourceState = state) {
  const base = BALANCE.combat.damageReductionCapPercent ?? 75;
  return className === 'healer' ? Math.max(base, Math.min(95, skillTreeSpecialValue('healer-damage-reduction-cap', className, sourceState))) : base;
}
function passiveSkillSlotCount(className, sourceState = state) {
  return skillTreeSpecialValue('additional-passive-slot', className, sourceState) > 0 ? 2 : 1;
}
function selectedPassiveSkillIndices(className, sourceState = state) {
  const member = sourceState?.companions?.[className];
  const skills = COMPANION_SKILLS[className]?.passive || [];
  const primary = member?.passiveSkillIndex ?? 0;
  const indices = skills[primary] ? [primary] : [];
  const secondary = member?.secondPassiveSkillIndex;
  if (passiveSkillSlotCount(className, sourceState) > 1 && Number.isInteger(secondary) && skills[secondary] && !indices.includes(secondary)) indices.push(secondary);
  return indices;
}
function selectedPassiveSkills(className, sourceState = state) {
  return selectedPassiveSkillIndices(className, sourceState).map(index => empoweredClassSkill(COMPANION_SKILLS[className].passive[index], className, sourceState));
}
function passiveEffectsFor(className, sourceState = state) {
  return selectedPassiveSkills(className, sourceState).flatMap(skill => Array.isArray(skill.effect) ? skill.effect : [skill.effect].filter(Boolean));
}
function passiveEffectTotal(type, targetClass, sourceState = state) {
  return [sourceState?.mainClass, sourceState?.activeCompanion].filter(Boolean).reduce((total, owner) => {
    const effects = passiveEffectsFor(owner, sourceState);
    return total + effects.filter((effect) => effect.type === type && (effect.scope === 'party' || (effect.scope === 'self' && owner === targetClass)))
      .reduce((sum, effect) => sum + (Number(effect.value) || 0), 0);
  }, 0);
}

function passiveEffectMultiplier(type, targetClass, sourceState = state) {
  return [sourceState?.mainClass, sourceState?.activeCompanion].filter(Boolean).reduce((multiplier, owner) => {
    const effects = passiveEffectsFor(owner, sourceState);
    return effects.filter(effect => effect.type === type && (effect.scope === 'party' || (effect.scope === 'self' && owner === targetClass)))
      .reduce((value, effect) => value * (1 + (Number(effect.value) || 0) / 100), multiplier);
  }, 1);
}
function skillDescription(skill, className = null) {
  if (className) skill = empoweredClassSkill(skill, className);
  if (!skill?.description) return '';
  if (typeof skill.effect === 'string') {
    const damage = formatRuleNumber((skill.damageMultiplier || skill.hitMultiplier || 1) * 100);
    const seconds = (value) => `${formatRuleNumber(value)} s`;
    const descriptions = {
      damage: skill.instantFireball ? `Verursacht den gesamten Feuerballschaden (${damage} % Grundschaden) sofort. Keine Brandticks; die Grundabklingzeit ist halbiert. Der Bonus auf Schaden über Zeit wirkt auf diesen Direkttreffer nicht.` : `Ein Angriff mit ${damage} % Grundschaden.`,
      'multi-hit': `${skill.hitCount} Treffer auf ein Ziel mit je ${damage} % Grundschaden; endet, sobald das Ziel besiegt ist.`,
      'area-damage': `Verursacht jedem lebenden Gegner ${damage} % Grundschaden.`,
      'vulnerable-hit': `${damage} % Grundschaden; macht überlebende Gegner ${seconds(skill.vulnerableDuration)} verwundbar.`,
      'stun-hit': `${damage} % Grundschaden; betäubt ${skill.areaEffect ? 'alle lebenden Gegner' : 'ein Ziel'} für ${seconds(Math.ceil(skill.stunDuration * 1000 / BALANCE.combat.tickMilliseconds) * BALANCE.combat.tickMilliseconds / 1000)} Kampftaktzeit.`,
      'freeze-hit': `${damage} % Grundschaden; friert das überlebende Ziel ${seconds(skill.freezeDuration)} ein. Der Boss kann nicht eingefroren werden.`,
      'burn-hit': `Verursacht über ${seconds(skill.burnDuration)} insgesamt ${damage} % Grundschaden: ein sofortiger und weitere regelmäßige Brandschadenstreffer.`,
      heal: `Heilt jedes lebende Gruppenmitglied um bis zu ${formatRuleNumber(skill.healPercent)} % seiner maximalen Lebenskraft, verstärkt durch Glaube und Heileffektivität.`,
      guard: `Verringert erlittenen Gruppenschaden ${seconds(skill.guardDuration)} lang um ${formatRuleNumber(skill.guardPercent)} %. Die gesamte Schadensminderung bleibt normalerweise auf ${formatRuleNumber(BALANCE.combat.damageReductionCapPercent ?? 75)} % begrenzt; beim Heiler mit Lichtschutz sind bis zu 95 % möglich.`,
      unkillable: `Der Anwender wird ${seconds(skill.durationSeconds)} unverwundbar.`,
    };
    const description = descriptions[skill.effect] || skill.description;
    return description;
  }
  const effects = Array.isArray(skill.effect) ? skill.effect : [skill.effect || {}];
  const descriptions = effects.map((effect) => {
    const value = formatRuleNumber(effect.value);
    const recipient = effect.scope === 'party' ? 'jedes Gruppenmitglied' : 'den Anwender';
    if (effect.type === 'damage-percent') return `+${value} % verursachter Schaden für ${recipient}`;
    if (effect.type === 'multiplicative-damage-percent') return `+${value} % verursachter Schaden für ${recipient} als eigener Multiplikator (×${formatRuleNumber(1 + effect.value / 100)})`;
    if (effect.type === 'dodge-chance') return '+' + value + ' % Ausweichchance für den Anwender';
    if (effect.type === 'taunt') return 'Zieht alle Gegnerangriffe auf den Heiler, solange er lebt. Der andere Held wird erst nach seinem Tod zum Ziel';
    if (effect.type === 'stat-percent') return `+${value} % ${effect.stat} für ${recipient}`;
    if (effect.type === 'stat-flat') return `+${value}${STAT_PERCENT_STATS.has(effect.stat) ? ' %' : ''} ${effect.stat} für ${recipient}`;
    if (effect.type === 'rest-healing-percent') return `+${value} % Rastplatzheilung für ${recipient}`;
    if (effect.type === 'bow-poison') return `Bogentreffer haben ${formatRuleNumber(effect.chancePercent)} % Chance, das überlebende Ziel zu vergiften: über ${formatRuleNumber(effect.durationSeconds)} s insgesamt ${formatRuleNumber(effect.damagePercent)} % Grundschaden`;
    return null;
  });
  if (descriptions.every(Boolean)) return descriptions.join('; ') + '.';
  const primary = effects.find((effect) => effect.stat) || effects[0];
  return skill.description.replace(/\{([A-Za-z][\w]*)\}/g, (placeholder, key) => ({ ...skill, ...primary })[key] ?? placeholder);
}

function formatRuleNumber(value) {
  return new Intl.NumberFormat('de-DE', { maximumFractionDigits: 4 }).format(Number(value) || 0);
}
function combatIntervalTicks(seconds) {
  return Math.max(1, Math.round(seconds * 1000 / BALANCE.combat.tickMilliseconds));
}
function skillTreeRequiredParentPoints(node) {
  if (!node?.parent || node.parent === 'origin') return 0;
  const parent = SKILL_TREE_NODES.find(entry => entry.id === node.parent);
  return Math.min(10, parent?.maxPoints ?? 10, node.requiredParentPoints ?? 10);
}
function skillTreeNodeUnlocked(node, ranks = {}, className = null) {
  if (node?.class && className && node.class !== className) return false;
  return !node?.parent || node.parent === 'origin' || Number(ranks[node.parent] || 0) >= skillTreeRequiredParentPoints(node);
}
function skillTreeDescription(node, className = null) {
  if (!node?.effect) return node?.description || '';
  const { type, stat, perPoint } = node.effect;
  const value = formatRuleNumber(perPoint);
  if (type === 'skill-damage-flat-percent') {
    const skill = COMPANION_SKILLS[node.class]?.active?.find(entry => entry.id === node.effect.skillId);
    return `${skill?.name || 'Die zugeordnete Fähigkeit'} erhält pro Rang +${value} % Grundschaden, maximal +${formatRuleNumber(perPoint * node.maxPoints)} %. Der Bonus wird auf den Fähigkeitsfaktor addiert: 300 % werden bei +100 % zu 400 %, nicht zu 600 %. Andere Fähigkeiten und normale Angriffe bleiben unverändert.`;
  }
  if (type === 'additional-passive-slot') return 'Erlaubt diesem Charakter, zwei unterschiedliche passive Klassenfähigkeiten gleichzeitig auszurüsten. Wähle die zweite Passive im Fähigkeiten-Menü. Gruppenboni und persönliche Effekte beider Passiven wirken nach ihren jeweiligen Regeln.';
  if (type === 'dodge-chance') return 'Gewährt dem Anwender 25 % Chance, einem gegnerischen Angriff vollständig auszuweichen. Wird mit anderen Ausweichboni addiert.';
  if (type === 'extra-attack-chance') return 'Gewährt dem Anwender 20 % zusätzliche Chance auf einen zweiten Treffer. Wird mit anderen Quellen für Doppeltrefferchance addiert.';
  if (type === 'dot-to-attack-percent') return 'Wandelt deinen gesamten Bonus auf Schaden über Zeit im Verhältnis 1:1 in additiven Angriff % um. Aus +100 % Schaden über Zeit werden +100 % Angriff; der umgewandelte DoT-Bonus entfällt. Ausrüstung, Edelsteine, passive Fähigkeiten, Talente und aktive Power-ups werden berücksichtigt. Gilt nur für den Anwender.';
  if (type === 'warrior-execution-area-penalty') return 'Nur Krieger: Henkerschlag trifft alle lebenden Gegner. Sein Grundschaden wird um 50 % verringert: 350 % werden zu 300 %, nicht zu 175 %. Der Bonus aus Henkerschlag meistern wird weiterhin addiert; voll ausgebaut verursacht der Flächentreffer 400 % statt 450 % Grundschaden. Stampfen bleibt unverändert.';
  if (type === 'mage-instant-fireball') return 'Nur Magier: Feuerball hat die halbe Grundabklingzeit und verursacht seinen gesamten Schaden sofort statt über Zeit. Keine Brandticks und kein zusätzlicher Schadensbonus. Abklingzeitreduktion wirkt anschließend; Boni auf Schaden über Zeit gelten nicht mehr für Feuerball.';
  if (type === 'hunter-poison-chance') return 'Nur Jäger: Giftpfeile haben 40 % statt 25 % Giftchance. Die passive Fähigkeit muss ausgerüstet sein.';
  if (type === 'healer-damage-reduction-cap') return 'Nur Heiler: Erhöht die Obergrenze der gesamten eigenen Schadensminderung auf 95 %. Gewährt nicht automatisch 95 % Schadensminderung; Verteidigung, Schutzfähigkeiten und Setboni müssen sie weiterhin aufbauen. Die Verteidigungskurve bleibt unverändert. Benötigt keine bestimmte passive Fähigkeit und erhöht nicht das Cap anderer Gruppenmitglieder.';
  if (type === 'healer-final-damage-percent') return `Nur Heiler: +${value} % multiplikativer eigener Schaden (×${formatRuleNumber(1 + perPoint / 100)}) auf normale Angriffe, Schadensfähigkeiten und Schaden über Zeit. Wirkt als eigener Multiplikator, nicht auf andere Gruppenmitglieder oder Heilungen.`;
  if (type === 'hunter-critical-overflow') return 'Nur Jäger: Kritische Chance über 100 % gewährt im Verhältnis 1:1 zusätzlichen kritischen Schaden. Beispiel: 120 % Kritische Chance geben +20 % Kritischer Schaden. Funktioniert mit jeder passiven Fähigkeit.';
  if (type === 'warrior-stomp-area') return 'Nur Krieger: Stampfen trifft und betäubt alle lebenden Gegner statt eines einzelnen Ziels.';
  if (type === 'self-life-steal-percent') return 'Heilt ausschließlich den Anwender um 0,1 % seines tatsächlich verursachten Schadens pro Rang (maximal 3 % bei 30 Punkten), auch bei Schaden über Zeit.';
  if (type === 'primary-attribute-flat') return `Verleiht pro Rang ${value} ${CLASS_ATTRIBUTE_SCALING[className]?.damageAttribute || 'Klassenattribut (Stärke beim Krieger, Geschicklichkeit beim Jäger, Intelligenz beim Magier, Glaube beim Heiler)'}.`;
  if (type === 'final-percent') return stat === 'Angriff'
    ? `Erhöht den additiven Angriffsbonus pro Rang um ${value} %.`
    : `Erhöht ${stat} pro Rang um ${value} % auf den Endwert.`;
  if (type === 'stat-flat') return `Erhöht ${stat} pro Rang um ${value}${STAT_PERCENT_STATS.has(stat) ? ' %' : ''}.`;
  if (type === 'attribute-flat') return `Verleiht pro Rang ${value} ${stat}.`;
  if (type === 'all-attributes-flat') return `Verleiht pro Rang ${value} Stärke, Geschicklichkeit, Ausdauer, Intelligenz und Glaube.`;
  if (type === 'final-damage-percent') return `Erhöht den verursachten Schaden multiplikativ um ${value} % pro Rang.`;
  if (type === 'soul-drop-percent') return `Erhöht Kampf-Seelen um ${value} % pro Rang. Bei Main und Gefährte zählt der höhere Talentbonus.`;
  if (type === 'legendary-drop-chance') return `Erhöht die bestehende Chance auf legendäre Gebietsbeute relativ um ${value} % pro Rang, höchstens auf 100 %. Eine Grundchance von 0 % bleibt 0 %; bei Main und Gefährte zählt der höhere Talentbonus.`;
  return node.description || '';
}
function setBonusDescription(bonus) {
  const effects = bonus?.effects || {};
  const labels = {
    strengthFlat: 'Stärke', dexterityFlat: 'Geschicklichkeit', intelligenceFlat: 'Intelligenz', staminaFlat: 'Ausdauer', faithFlat: 'Glaube',
    strengthPercent: '% Stärke', dexterityPercent: '% Geschicklichkeit', intelligencePercent: '% Intelligenz', staminaPercent: '% Ausdauer', faithPercent: '% Glaube',
    cooldownReduction: '% Abklingzeitreduktion', healingPercent: '% verursachte Heilung', restHealingPercent: '% eigene Rastplatzheilung',
    multiplicativeDamagePercent: '% multiplikativer Schaden', partyDamagePercent: '% multiplikativer Schaden für die gesamte Gruppe', partyHealthPercent: '% Lebenskraft für die gesamte Gruppe',
    activeSkillDamagePercent: '% multiplikativer Schaden für aktive Fähigkeiten und Schaden über Zeit des Trägers (einschließlich Brand und Gift)',
    healthPercent: '% Lebenskraft', attackPercent: '% Angriff', defensePercent: '% Verteidigung',
    healthFlat: 'Lebenskraft', defenseFlat: 'Verteidigung',
    criticalChance: '% kritische Trefferchance', hitChance: '% Trefferchance',
    attackSpeedPercent: '% Angriffsgeschwindigkeit', soulFind: '% Seelenfund beim Träger',
    vulnerableDamagePercent: '% Schaden gegen verwundbare Ziele',
    upgradeVulnerableDamagePercent: '% Schaden gegen verwundbare Ziele',
    criticalDamagePercent: '% Schaden bei kritischen Treffern',
    upgradeCriticalDamagePercent: '% Kritischer Schaden',
    extraAttackChance: '% Doppeltrefferchance',
    multiHitDamagePercentPerHit: '% multiplikativer Schaden pro Treffer im selben Angriff',
    damageOverTimePercent: '% Schaden über Zeit',
    dodgeChance: '% Ausweichchance',
    allAttributesPercent: '% auf alle Attribute',
    eliteSoulBonusPercent: '% auf Champion-Zusatzseelen, wenn vom Main getragen',
  };
  const parts = Object.entries(effects).flatMap(([key, value]) => labels[key] ? [`+${formatRuleNumber(value)} ${labels[key]}`] : []);
  if (effects.timeRiftStoredPercent) parts.push(`Zeitriss: Speichert zusätzlich ${formatRuleNumber(effects.timeRiftStoredPercent)} % des tatsächlich verursachten Schadens im Ziel. Stirbt es, wird der gespeicherte Schaden sofort auf die übrigen Gegner verteilt`);
  if (effects.timeRiftIntervalSeconds) parts.push(`Zeitriss bricht zusätzlich alle ${formatRuleNumber(effects.timeRiftIntervalSeconds)} Sekunden auf und verursacht den gespeicherten Schaden am Ziel. Keine erneuten Schadensboni oder weiteren Treffer-Effekte`);
  if (effects.dotLifeStealPercent) parts.push(`Eigener Schaden über Zeit heilt den Träger um ${formatRuleNumber(effects.dotLifeStealPercent)} % des tatsächlich verursachten Schadens`);
  if (effects.heartfallMaxHealthPercent) parts.push(`Herzverfall: Gegner mit eigenem Schaden über Zeit verlieren pro Kampftick (${formatRuleNumber(BALANCE.combat.tickMilliseconds / 1000)} s) zusätzlich ${formatRuleNumber(effects.heartfallMaxHealthPercent)} % ihrer maximalen Lebenskraft. Einmal pro Ziel und Tick, ohne Schadensboni, Heilung oder weitere Effekte. Wirkt nicht in der Bossprüfung`);
  if (effects.shadowEchoPercent) parts.push(`Direkte Treffer verursachen zusätzlich ${formatRuleNumber(effects.shadowEchoPercent)} % ihres Schadens als stapelbaren Schattennachhall über ${formatRuleNumber(effects.shadowEchoSeconds || 3)} Sekunden`);
  if (effects.lowHealthDamageReduction) parts.push(`Bei höchstens ${formatRuleNumber(effects.lowHealthThreshold)} % eigener Lebenskraft: ${formatRuleNumber(effects.lowHealthDamageReduction)} % weniger erlittener Schaden`);
  if (effects.vulnerableEverySeconds) {
    const interval = combatIntervalTicks(effects.vulnerableEverySeconds) * BALANCE.combat.tickMilliseconds / 1000;
    parts.push(`Macht Gegner alle ${formatRuleNumber(interval)} s Kampftaktzeit für ${formatRuleNumber(effects.vulnerableDurationSeconds || 3)} s verwundbar`);
  }
  if (effects.criticalHealPercent) parts.push(`Kritische Treffer heilen jedes lebende Gruppenmitglied um ${formatRuleNumber(effects.criticalHealPercent)} % seiner maximalen Lebenskraft`);
  if (effects.damageLifeStealPercent) parts.push(`Heilt jedes lebende Gruppenmitglied um ${formatRuleNumber(effects.damageLifeStealPercent)} % des tatsächlich verursachten Schadens, auch bei Schaden über Zeit`);
  return parts.join('; ');
}
function allowsRepeatedAffixes(slot) {
  return slot !== 'glyph' && Array.isArray(AFFIX_POOLS[slot]);
}
function enchantmentRulesText(mode, target = null) {
  if (mode === 'affix' && isMythicWeapon(target)) return 'Bei mystischen Waffen kannst du alle vier Affixplätze beliebig oft umprägen. Ohne zusätzliche Ausschlüsse kostet jeder Versuch einen Umprägungsstein und würfelt einen anderen Typ sowie einen neuen Wert. Alle vier Affixe sind immer Greater Affixe, auch nach dem Umprägen: 150 % eines normalen Zufallswurfs statt eines garantierten Maximalwurfs. Gleiche Affixtypen auf mehreren Plätzen bleiben erlaubt. Der Mythische Effekt wird nicht verändert.';
  if (mode === 'affix') return (Number.isInteger(target?.enchantAffixIndex)
    ? 'Dieser Gegenstand ist bereits auf einen Affixplatz festgelegt. Ohne zusätzliche Ausschlüsse verbraucht jeder weitere Versuch einen Umprägungsstein und ersetzt dort den Affixtyp samt Wurf. Andere Plätze sind dauerhaft gesperrt.'
    : 'Der erste Versuch legt dauerhaft fest, welchen Affixplatz du umprägen kannst. Ohne zusätzliche Ausschlüsse wird ein Umprägungsstein verbraucht; der bisherige Typ wird durch einen anderen Typ samt neuem Wurf ersetzt. Ein bereits auf einem anderen Platz vorhandener Affixtyp kann erneut entstehen.') + ' Wird ein Greater Affix umgeprägt, geht sein Greater-Status dauerhaft verloren. Bei gewöhnlicher bis legendärer Ausrüstung ist der Ersatz immer ein normaler Affix; andere Greater Affixe bleiben erhalten. Begleittiere haben eigene Regeln: Alle Plätze bleiben umprägbar; ihre normalen Affixwürfe werden durch die Tierstufe verstärkt. Tieraffixe können keine Greater Affixe sein. Mystische Waffen bilden eine Ausnahme: Alle vier Plätze bleiben beliebig oft umprägbar. Alle vier Affixe sind immer Greater Affixe; Typ und Wert werden neu gewürfelt, mit 150 % eines normalen Zufallswurfs.';
  return 'Ein Seltenheitsstein wird verbraucht und erhöht die Seltenheit um eine Stufe. Vorhandene Affixtypen bleiben erhalten; ihre Würfe werden innerhalb der gemeinsamen Affixbereiche übernommen und gerundet. Zusätzliche Affixe werden neu gewürfelt. Grundschaden und Grundverteidigung werden in den höheren Seltenheitsbereich übertragen; bei einem festen bisherigen Grundwert wird neu gewürfelt. Die Grundwertspannen steigen mit jeder Seltenheit ohne Überschneidung. Vorhandene Greater Affixe behalten ihren Greater-Status und den maximalen Greater-Grundwert; zusätzlich entstehende Affixe sind normal. Bei legendärer Ausrüstung ohne Greater Affix kann stattdessen einmalig ein Seltenheitsstein verwendet werden: Ein zufälliger vorhandener normaler Affix erhält garantiert den Greater-Grundwert. Der Affixtyp bleibt erhalten. Die einmalige Nutzung bleibt am Gegenstand gespeichert, auch wenn der Greater Affix später umgeprägt wird. Glyphen und Begleittiere sind hiervon ausgeschlossen.';
}

if (!Array.isArray(AREAS) || !Array.isArray(QUEST_STAGES) || !Array.isArray(RARITIES) || !ARMOR_SETS || !JEWELRY_SETS || !CONTRACTS || !BALANCE) {
  throw new Error('Die Spieldaten aus data/config/ sind unvollst\u00e4ndig.');
}



function bossRankProgress(damage) {
  const total = Math.max(0, Number(damage) || 0);
  const ranks = BALANCE.bossChallenge.rankThresholds || [];
  const currentIndex = ranks.reduce((index, rank, nextIndex) => total >= rank.minimumDamage ? nextIndex : index, -1);
  const currentRank = ranks[currentIndex] || null;
  const nextRank = ranks[currentIndex + 1] || null;
  const start = currentRank?.minimumDamage || 0;
  const progress = nextRank ? Math.max(0, Math.min(100, (total - start) / (nextRank.minimumDamage - start) * 100)) : 100;
  return { currentIndex, currentRank, nextRank, progress, remaining: nextRank ? Math.max(0, nextRank.minimumDamage - total) : 0 };
}
function bossRankColor(rank) {
  return ({ Bronze: '#cd945e', Silber: '#c6d2dc', Gold: '#f1c65b', Platin: '#7cddca', Diamant: '#95d8ff', Mythisch: '#dc8dff' })[rank?.tier] || '#aaa0a8';
}
