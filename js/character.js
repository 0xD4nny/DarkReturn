// Character stats, equipment normalization, and inventory rendering helpers.
function equipmentForClass(className = state?.mainClass, sourceState = state) {
  return className === sourceState?.mainClass
    ? sourceState?.equipment?.main || {}
    : sourceState?.equipment?.companions?.[className] || {};
}
function equippedItems(className = state?.mainClass, sourceState = state) {
  const items = Object.values(equipmentForClass(className, sourceState)).filter(Boolean);
  const pet = petForClass(className, sourceState);
  if (pet) items.push(pet);
  return items;
}
function normalizeGearItem(item) {
  if (!item || typeof item !== 'object') return item;
  if (['weaponGem', 'armorGem'].includes(item.slot)) return normalizeGemItem(item);
  normalizeWeaponProgress(item);
  if (isMythicWeapon(item)) {
    delete item.enchantAffixIndex;
    item.mythicUpgradeLevel = Math.max(0, Math.min(MYTHIC_ITEMS.maxUpgradeLevel, Math.floor(Number(item.mythicUpgradeLevel) || 0)));
  }
  item.upgradeLevel = Math.max(0, Math.min(BALANCE.items.maxUpgradeLevel, Number(item.upgradeLevel) || 0));
  if (item.tier !== undefined) {
    const upgradeMultiplier = Math.pow(BALANCE.items.upgradeBaseStatMultiplier, item.upgradeLevel);
    if (item.weaponDamage) item.baseWeaponDamage = Math.round(item.weaponDamage / upgradeMultiplier);
    if (item.armorDefense) item.baseArmorDefense = Math.round(item.armorDefense / upgradeMultiplier);
    item.affixes = (Array.isArray(item.affixes) ? item.affixes : []).map((affix) => {
      if (affix.fixed) return { ...affix, baseValue: affix.baseValue ?? (affix.greater ? Math.round(Number(affix.value) / upgradeMultiplier * 100) / 100 : Math.round(Number(affix.value) / upgradeMultiplier)) };
      return { ...affix, baseValue: affix.greater ? greaterAffixBaseValue(affix.stat) : Math.round(Number(affix.value) / upgradeMultiplier) };
    });
    delete item.tier;
  }
  const socketCapacity = socketCapacityForSlot(item.slot, item);
  if (socketCapacity) {
    const previousSockets = Array.isArray(item.sockets) ? item.sockets : [];
    const lastOccupied = previousSockets.reduce((last, gem, index) => gem ? index + 1 : last, 0);
    item.socketSlots = Math.max(0, Math.min(socketCapacity, Number.isInteger(item.socketSlots) ? item.socketSlots : lastOccupied));
    item.sockets = Array.from({ length: item.socketSlots }, (_, index) => previousSockets[index] ? normalizeGearItem(previousSockets[index]) : null);
  } else {
    delete item.socketSlots;
    delete item.sockets;
  }
  delete item.special;
  delete item.specialId;
  const count = BALANCE.items.affixCountByRarity[item.rarityColor] ?? 0;
  if (item.affixVersion >= 6) {
    return normalizeAffixUpgrades(item);
  }
  const ranges = AFFIX_RANGES || {};
  const upgradeMultiplier = Math.pow(BALANCE.items.upgradeBaseStatMultiplier, item.upgradeLevel);
  item.affixes = (Array.isArray(item.affixes) ? item.affixes : []).slice(0, count).map((affix) => {
    if (affix.fixed) return { ...affix, fixed: true, baseValue: affix.baseValue ?? (affix.greater ? Math.round(Number(affix.value) / upgradeMultiplier * 100) / 100 : Math.round(Number(affix.value) / upgradeMultiplier)) };
    const [min, max] = ranges[affix.stat] || [1, 1];
    if (affix.greater) {
      const baseValue = isMythicWeapon(item) ? affix.baseValue ?? Number(affix.value) / affixUpgradeMultiplier(item.upgradeLevel) : greaterAffixBaseValue(affix.stat);
      return { ...affix, baseValue, value: affixValueAtUpgrade({ ...affix, baseValue }, item.upgradeLevel) };
    }
    const rolledValue = Number(affix.baseValue ?? Number(affix.value) / upgradeMultiplier) || min;
    const baseValue = Math.max(min, Math.min(max, rolledValue));
    return { ...affix, baseValue, value: affixValueAtUpgrade({ ...affix, baseValue }, item.upgradeLevel) };
  });
  item.affixVersion = 6;
  return normalizeAffixUpgrades(item);
}
function affixRangeFor(item, stat, affix = null) {
  const [min, max] = AFFIX_RANGES?.[stat] || [1, 1];
  if (item?.slot === 'pet') return [min, max].map(value => petAffixValueAtLevel(value, item.level));
  const multiplier = affixUpgradeMultiplier(item?.upgradeLevel || 0);
  if (isMythicWeapon(item) && affix?.greater) return [min, max].map(value => Math.round(value * BALANCE.loot.greaterAffixMaxMultiplier * multiplier * 100) / 100);
  return [Math.round(min * multiplier), Math.round(max * multiplier)];
}
function normalizeGearSave(save) {
  if (!save) return save;
  save.inventory = (save.inventory || []).filter((item) => !['seal', 'talisman'].includes(item?.slot));
  if (save.equipment?.main) {
    delete save.equipment.main.seal;
    Object.keys(save.equipment.main).filter((slot) => slot.startsWith('talisman')).forEach((slot) => delete save.equipment.main[slot]);
  }
  (save.inventory || []).forEach(normalizeGearItem);
  (save.mailbox || []).forEach(entry => normalizeGearItem(entry.item));
  Object.values(save.equipment?.main || {}).forEach(normalizeGearItem);
  Object.values(save.equipment?.companions || {}).forEach((entry) => {
    if (entry?.weapon) {
      entry.mainHand ||= entry.weapon;
      delete entry.weapon;
    }
    Object.values(entry || {}).forEach(normalizeGearItem);
  });
  return save;
}
function activeArmorSetEffects(sourceState = state, ownerClass = sourceState?.mainClass) {
  const equipment = equipmentForClass(ownerClass, sourceState);
  const armorItems = ['helmet', 'chest', 'gloves', 'boots'].map((slot) => equipment[slot]);
  const jewelryItems = ['amulet', 'ring1', 'ring2', 'earring1', 'earring2'].map((slot) => equipment[slot]);
  const active = {};
  const applySetBonuses = (items, definitions) => {
    const equippedSets = {};
    items.filter(Boolean).forEach((item) => {
      if (item?.set) equippedSets[item.set] = (equippedSets[item.set] || 0) + 1;
    });
    Object.entries(equippedSets).forEach(([setName, pieceCount]) => {
      if (definitions[setName]?.class && definitions[setName].class !== ownerClass) return;
      (definitions[setName]?.bonuses || []).filter((bonus) => pieceCount >= bonus.pieces).forEach(({ effects: bonusEffects = {} }) => {
        Object.entries(bonusEffects).forEach(([effect, value]) => {
          if (['multiplicativeDamagePercent', 'partyDamagePercent'].includes(effect)) {
            const key = effect === 'partyDamagePercent' ? 'partyDamageMultiplier' : 'damageMultiplier';
            active[key] = (active[key] || 1) * (1 + value / 100);
          } else active[effect] = (active[effect] || 0) + value;
        });
      });
    });
  };
  applySetBonuses(armorItems, ARMOR_SETS);
  applySetBonuses(jewelryItems, JEWELRY_SETS);
  if (armorItems.every(Boolean)) {
    const lowestUpgrade = Math.min(...armorItems.map((item) => Number(item.upgradeLevel) || 0));
    const milestone = [...(BALANCE.items.armorUpgradeMilestones || [])]
      .sort((a, b) => b.level - a.level)
      .find((entry) => lowestUpgrade >= entry.level);
    if (milestone) {
      active.armorUpgradeLevel = milestone.level;
      active.armorUpgradeText = setBonusDescription(milestone);
      Object.entries(milestone.effects || {}).forEach(([effect, value]) => {
        active[effect] = (active[effect] || 0) + value;
      });
    }
  }
  return active;
}
// Read only the equipped main and active companion; do not recurse through getStats.
function partySetEffects(sourceState = state) {
  return [...new Set([sourceState.mainClass, sourceState.activeCompanion].filter(Boolean))]
    .reduce((party, owner) => {
      const effects = activeArmorSetEffects(sourceState, owner);
      party.damageMultiplier *= effects.partyDamageMultiplier || 1;
      party.healthPercent += effects.partyHealthPercent || 0;
      return party;
    }, { damageMultiplier: 1, healthPercent: 0 });
}
function skillTreeEffectsFor(className, sourceState = state) {
  const tree = sourceState?.skillTree?.[className]?.nodes || {};
  return SKILL_TREE_NODES.flatMap((node) => {
    const ranks = Math.max(0, Number(tree[node.id]) || 0);
    if (!ranks || !node.effect || (node.class && node.class !== className)) return [];
    const effect = node.effect.type === 'primary-attribute-flat'
      ? { ...node.effect, type: 'attribute-flat', stat: CLASS_ATTRIBUTE_SCALING[className].damageAttribute }
      : node.effect;
    return [{ ...effect, value: effect.perPoint * ranks }];
  });
}
function dodgeChanceFor(className, sourceState = state) {
  return Math.max(0, skillTreeSpecialValue('dodge-chance', className, sourceState)
    + (activeArmorSetEffects(sourceState, className).dodgeChance || 0)
    + passiveEffectTotal('dodge-chance', className, sourceState));
}
function extraAttackChanceFor(className, sourceState = state) {
  return Math.max(0, (activeArmorSetEffects(sourceState, className).extraAttackChance || 0)
    + powerupBonusForStat('Chance auf zweiten Treffer', sourceState)
    + skillTreeSpecialValue('extra-attack-chance', className, sourceState));
}
// Ordinary attack bonuses share one additive bucket, independent of equipment order.
function getAttackModifiers(className = state.mainClass, sourceState = state) {
  const effects = activeArmorSetEffects(sourceState, className);
  const tree = skillTreeEffectsFor(className, sourceState);
  let base = BASE_STATS['Angriff'] + (characterLevel(className, sourceState) - 1) * BALANCE.groupLevel.attackPerLevel;
  let percent = equippedItems(className, sourceState).flatMap(itemAffixes)
    .filter(affix => affix.stat === 'Angriff').reduce((sum, affix) => sum + affix.value, 0);
  percent += effects.attackPercent || 0;
  percent += getWorldEvent(sourceState).attackPercent || 0;
  percent += powerupBonusForStat('Angriff', sourceState);
  tree.filter(effect => effect.stat === 'Angriff').forEach(effect => {
    if (effect.type === 'stat-flat') base += effect.value;
    else if (['stat-percent', 'final-percent'].includes(effect.type)) percent += effect.value;
  });
  [sourceState.mainClass, sourceState.activeCompanion].filter(Boolean).forEach(owner => {
    const entries = passiveEffectsFor(owner, sourceState);
    entries.forEach(effect => {
      if (effect.scope !== 'party' && !(effect.scope === 'self' && owner === className)) return;
      if (effect.type === 'damage-percent') percent += effect.value;
      else if (effect.stat === 'Angriff' && effect.type === 'stat-percent') percent += effect.value;
      else if (effect.stat === 'Angriff' && effect.type === 'stat-flat') base += effect.value;
    });
  });
  return { base, percent };
}
function damageAttributeMultiplier(className, stats) {
  const scaling = CLASS_ATTRIBUTE_SCALING[className] || {};
  return scaling.damageAttribute ? 1 + Math.max(0, stats[scaling.damageAttribute] - BASE_STATS[scaling.damageAttribute]) * (scaling.damagePercentPerPoint || 0) / 100 : 1;
}
function getStats(className = state.mainClass, sourceState = state, { uncapped = false } = {}) {
  const gear = equipmentForClass(className, sourceState);
  const gearItems = equippedItems(className, sourceState);
  const stats = { ...BASE_STATS };
  const level = characterLevel(className, sourceState);
  const petStat = PET_RULES.byClass[className]?.stat;
  if (petStat) stats[petStat] += petAttributeBonus(className, sourceState);
  stats['Lebenskraft'] += (level - 1) * BALANCE.groupLevel.healthPerLevel;
  stats['Angriff'] += (level - 1) * BALANCE.groupLevel.attackPerLevel;
  stats['Verteidigung'] += (level - 1) * BALANCE.groupLevel.defensePerLevel;
  stats['Verteidigung'] += gearItems.reduce((sum, item) => sum + (item.armorDefense || 0), 0);
  let gemHealthPercent = 0;
  let gemDefensePercent = 0;
  for (const item of gearItems) {
    for (const { stat, value, fromSocket } of itemAffixes(item)) {
      if (!(stat in stats)) continue;
      if (fromSocket && stat === 'Lebenskraft') { gemHealthPercent += value; continue; }
      if (fromSocket && stat === 'Verteidigung') { gemDefensePercent += value; continue; }
      if (stat === 'Angriff') continue;
      if (!['Lebenskraft', 'Angriff', 'Verteidigung'].includes(stat)) stats[stat] += value;
      else stats[stat] = Math.round(stats[stat] * (1 + value / 100));
    }
  }
  const worldEvent = getWorldEvent(sourceState);
  if (gemDefensePercent) stats['Verteidigung'] = Math.round(stats['Verteidigung'] * (1 + gemDefensePercent / 100));
  const setEffects = activeArmorSetEffects(sourceState, className);
  const setAttributes = { strength: 'Stärke', dexterity: 'Geschicklichkeit', intelligence: 'Intelligenz', stamina: 'Ausdauer', faith: 'Glaube' };
  const skillTreeEffects = skillTreeEffectsFor(className, sourceState);
  const allAttributes = ['Stärke', 'Geschicklichkeit', 'Ausdauer', 'Intelligenz', 'Glaube'];
  skillTreeEffects.filter((effect) => effect.type === 'attribute-flat' && effect.stat in stats)
    .forEach((effect) => { stats[effect.stat] += effect.value; });
  skillTreeEffects.filter((effect) => effect.type === 'all-attributes-flat')
    .forEach((effect) => allAttributes.forEach((attribute) => { stats[attribute] += effect.value; }));
  Object.entries(setAttributes).forEach(([key, attribute]) => {
    stats[attribute] += setEffects[`${key}Flat`] || 0;
    stats[attribute] *= 1 + (setEffects[`${key}Percent`] || 0) / 100;
  });
  const worldEventAttributes = {
    strengthPercent: 'Stärke',
    staminaPercent: 'Ausdauer',
    dexterityPercent: 'Geschicklichkeit',
    intelligencePercent: 'Intelligenz',
  };
  Object.entries(worldEventAttributes).forEach(([bonus, attribute]) => {
    if (attribute in stats) stats[attribute] = Math.round(stats[attribute] * (1 + (worldEvent[bonus] || 0) / 100));
  });
  if (setEffects.allAttributesPercent) {
    const attributes = [...new Set([
      ...Object.values(CLASS_ATTRIBUTE_SCALING).map((entry) => entry.damageAttribute).filter(Boolean),
      'Ausdauer', 'Glaube',
    ])];
    attributes.forEach((attribute) => {
      if (attribute in stats) stats[attribute] *= 1 + setEffects.allAttributesPercent / 100;
    });
  }
  ['Stärke', 'Geschicklichkeit', 'Intelligenz', 'Ausdauer', 'Glaube'].forEach((stat) => {
    const bonus = powerupBonusForStat(stat, sourceState);
    if (stats[stat] !== undefined && bonus) stats[stat] = Math.round(stats[stat] * (1 + bonus / 100));
  });
  const scaling = CLASS_ATTRIBUTE_SCALING[className] || {};
  stats['Lebenskraft'] += Math.max(0, stats['Ausdauer'] - BASE_STATS['Ausdauer']) * (scaling.healthPerStamina || 0);
  if (gemHealthPercent) stats['Lebenskraft'] = Math.round(stats['Lebenskraft'] * (1 + gemHealthPercent / 100));
  const partyClasses = [sourceState.mainClass, sourceState.activeCompanion].filter(Boolean);
  partyClasses.forEach((owner) => {
    const effects = passiveEffectsFor(owner, sourceState);
    effects.forEach((effect) => {
      if (effect.scope === 'self' && owner !== className) return;
      if (!['party', 'self'].includes(effect.scope) || !effect.stat || !(effect.stat in stats)) return;
      if (effect.stat === 'Angriff') return;
      if (effect.type === 'stat-percent') {
        if (['Kritischer Schaden', 'Schaden gegen verwundbare Ziele', 'Schaden über Zeit'].includes(effect.stat)) stats[effect.stat] += effect.value;
        else stats[effect.stat] = Math.round(stats[effect.stat] * (1 + effect.value / 100));
      }
      if (effect.type === 'stat-flat') stats[effect.stat] += effect.value;
    });
  });
  if (className === sourceState.mainClass && className === 'healer') stats['Lebenskraft'] = Math.round(stats['Lebenskraft'] * 1.12);
  if (setEffects.healthPercent) stats['Lebenskraft'] = Math.round(stats['Lebenskraft'] * (1 + setEffects.healthPercent / 100));
  const partyHealthPercent = partySetEffects(sourceState).healthPercent;
  if (partyHealthPercent) stats['Lebenskraft'] = Math.round(stats['Lebenskraft'] * (1 + partyHealthPercent / 100));
  if (setEffects.cooldownReduction) stats['Abklingzeitreduktion'] += setEffects.cooldownReduction;
  if (setEffects.defensePercent) stats['Verteidigung'] = Math.round(stats['Verteidigung'] * (1 + setEffects.defensePercent / 100));
  if (setEffects.healthFlat) stats['Lebenskraft'] += setEffects.healthFlat;
  if (setEffects.defenseFlat) stats['Verteidigung'] += setEffects.defenseFlat;
  if (setEffects.criticalChance) stats['Kritische Chance'] += setEffects.criticalChance;
  if (setEffects.hitChance) stats['Trefferchance'] = uncapped ? stats['Trefferchance'] + setEffects.hitChance : Math.min(100, stats['Trefferchance'] + setEffects.hitChance);
  if (setEffects.attackSpeedPercent) stats['Angriffsgeschwindigkeit'] += setEffects.attackSpeedPercent;
  stats['Kritischer Schaden'] += (setEffects.upgradeCriticalDamagePercent || 0) + (setEffects.criticalDamagePercent || 0);
  stats['Schaden gegen verwundbare Ziele'] += (setEffects.upgradeVulnerableDamagePercent || 0) + (setEffects.vulnerableDamagePercent || 0);
  if (setEffects.soulFind) stats['Seelenfund'] += setEffects.soulFind;
  stats['Lebenskraft'] = Math.round(stats['Lebenskraft'] * (1 + worldEvent.healthPercent / 100));
  ['Lebenskraft', 'Verteidigung'].forEach((stat) => {
    const bonus = powerupBonusForStat(stat, sourceState);
    if (stats[stat] !== undefined && bonus) stats[stat] = Math.round(stats[stat] * (1 + bonus / 100));
  });
  STAT_KEYS.filter((stat) => STAT_PERCENT_STATS.has(stat) && !['Lebenskraft', 'Angriff', 'Verteidigung'].includes(stat)).forEach((stat) => {
    stats[stat] += powerupBonusForStat(stat, sourceState);
    if (!uncapped && stat === 'Trefferchance') stats[stat] = Math.min(100, stats[stat]);
  });
  skillTreeEffects.filter((effect) => effect.type === 'stat-flat' && effect.stat in stats && effect.stat !== 'Angriff')
    .forEach((effect) => { stats[effect.stat] += effect.value; });
  if (!uncapped) stats['Trefferchance'] = Math.min(100, stats['Trefferchance']);
  const finalPercentBonuses = {};
  skillTreeEffects.filter((effect) => effect.type === 'final-percent')
    .forEach((effect) => { finalPercentBonuses[effect.stat] = (finalPercentBonuses[effect.stat] || 0) + effect.value; });
  Object.entries(finalPercentBonuses).forEach(([stat, value]) => {
    if (stat === 'Angriff') return;
    if (['Kritischer Schaden', 'Schaden gegen verwundbare Ziele', 'Schaden über Zeit'].includes(stat)) stats[stat] += value;
    else if (stat in stats) stats[stat] = Math.round(stats[stat] * (1 + value / 100));
  });
  // Convert only this hunter's fully calculated critical chance, including temporary bonuses.
  const criticalOverflow = className === 'hunter'
    ? skillTreeSpecialValue('hunter-critical-overflow', className, sourceState) : 0;
  if (criticalOverflow > 0) {
    stats['Kritischer Schaden'] += Math.max(0, stats['Kritische Chance'] - 100) * criticalOverflow;
  }
  stats['Angriffsgeschwindigkeit'] = Math.max(0, stats['Angriffsgeschwindigkeit'] || 0);
  stats['Abklingzeitreduktion'] = Math.max(0, stats['Abklingzeitreduktion'] || 0);
  if (!uncapped) {
    stats['Angriffsgeschwindigkeit'] = Math.min(BALANCE.combat.attackSpeedCapPercent || 200, stats['Angriffsgeschwindigkeit']);
    stats['Abklingzeitreduktion'] = Math.min(BALANCE.combat.cooldownReductionCapPercent || 75, stats['Abklingzeitreduktion']);
  }
  const attack = getAttackModifiers(className, sourceState);
  stats['Angriff'] = Math.round(attack.base * (1 + attack.percent / 100) * damageAttributeMultiplier(className, stats));
  return stats;
}
function healerFaithScaling(stats = getStats('healer')) {
  return Math.max(0, stats['Glaube'] - BASE_STATS['Glaube']) * (CLASS_ATTRIBUTE_SCALING.healer.healingPercentPerFaith || 0) + (stats[BUFF_EFFECT_STAT] || 0);

}
function formatCharacterStatValue(key, value, percent = STAT_PERCENT_STATS.has(key), className = state?.mainClass) {
  const caps = {
    Trefferchance: 100,
    Angriffsgeschwindigkeit: BALANCE.combat.attackSpeedCapPercent || 200,
    Abklingzeitreduktion: BALANCE.combat.cooldownReductionCapPercent || 75,
    Schadensminderung: damageReductionCapPercent(className, state),
  };
  const cap = caps[key];
  const formatted = new Intl.NumberFormat('de-DE', { maximumFractionDigits: percent ? 2 : 0 }).format(value || 0);
  return `${formatted}${percent ? ' %' : ''}${cap !== undefined && value >= cap ? ` (Cap: ${formatRuleNumber(cap)} %)` : ''}`;
}
function statRows(className = state.mainClass) {
  const stats = getStats(className, state, { uncapped: true });
  return STAT_KEYS.map((key) => `<div class="character-stat"><span>${key}</span><strong>${formatCharacterStatValue(key, stats[key])}</strong></div>`).join('');
}
function renderStatsPanel(compact = false, className = state.mainClass) {
  const ownerLabel = className === state.mainClass ? state.playerName : CLASSES[className]?.label || className;
  const level = characterLevel(className);
  return `<aside class="character-panel character-panel-surface ${compact ? 'compact' : ''}"><div class="panel-heading"><div><p class="eyebrow">DEINE WERTE</p><h3>${escapeHtml(ownerLabel)} &middot; Stufe ${level}</h3></div><span class="character-level">ST. ${level}</span></div><div class="character-stats">${statRows(className)}</div></aside>`;
}
function assetIconMarkup(asset, fallback, className) {
  if (!asset) return `<span class="${className}" aria-hidden="true">${escapeHtml(fallback || '✦')}</span>`;
  const iconUrl = new URL(asset, document.baseURI).href;
  return `<span class="${className} icon-asset" style="--icon-asset: url(&quot;${escapeHtml(iconUrl)}&quot;)" aria-hidden="true"></span>`;
}
function equipmentIconMarkup(slot, fallback, className) {
  return assetIconMarkup(SLOT_DATA[slot]?.asset, fallback || SLOT_DATA[slot]?.icon, className);
}
function workshopRitualCore(item, fallback) {
  return `<div class="ritual-core"><span class="ritual-item-symbol">${item ? itemIconMarkup(item, 'ritual-item-icon') : fallback}</span></div>`;
}
function isSellableEquipment(item) {
  return ['bow', 'sword', 'staff', 'shield', 'bell', 'helmet', 'chest', 'gloves', 'boots', 'ring', 'amulet', 'earring', 'glyph'].includes(item?.slot);
}
function inventoryItemsForOwner(save, ownerClass) {
  if (!ownerClass || ![save.mainClass, save.activeCompanion].includes(ownerClass)) return [];
  return save.inventory.filter(item => {
    if (!itemUsesInventorySlot(item)) return true;
    const slot = equipmentSlotFor(item, ownerClass, {});
    return Boolean(slot && validateEquipmentForClass(save, item, slot, ownerClass));
  });
}
function inventorySaleCandidates(save, ownerClass, category) {
  if (category !== 'all' && !Object.hasOwn(INVENTORY_CATEGORIES, category)) return [];
  const slots = category === 'all' ? null : INVENTORY_CATEGORIES[category].slots;
  return inventoryItemsForOwner(save, ownerClass).filter(item => (!slots || slots.includes(item.slot))
    && isSellableEquipment(item) && item.rarityColor !== 'mythic');
}
function itemCard(item, index, options = {}) {
  const rarity = item.rarityColor || 'common';
  const quantity = Math.max(1, Math.floor(Number(item.quantity) || 1));
  const greaterCount = (item.affixes || []).filter((affix) => affix.greater).length;
  const socketCapacity = socketCapacityForSlot(item.slot, item);
  const openedSockets = Math.max(0, Math.min(socketCapacity, Number(item.socketSlots) || 0));
  const filledSockets = (item.sockets || []).slice(0, openedSockets).filter(Boolean).length;
  const socketLabel = `${filledSockets} von ${openedSockets} geöffneten Sockelplätzen belegt`;
  const slotName = options.forge || options.socketTarget || options.enchantTarget ? workshopSlotLabel(item) : SLOT_DATA[item.slot]?.label || item.slot;
  const sellable = !options.sell || isSellableEquipment(item);
  const classes = ['inventory-item', rarity, isSellableEquipment(item) ? 'equipment-item' : '', greaterCount ? 'has-greater-affix' : '', item.set ? 'set-item' : '', options.selected ? 'selected' : '', options.sell && !sellable ? 'not-for-sale' : ''].filter(Boolean).join(' ');
  const forgeAttrs = options.glyphFusion ? `data-glyph-fusion-item="${item.id}" ${options.disabled ? 'disabled' : ''}` : options.forge ? `data-forge-item="${item.id}" ${options.disabled ? 'disabled' : ''}` : options.gemUpgrade ? `data-gem-upgrade-item="${item.id}"` : '';
  const canDrag = !options.forge && !options.sell && !options.socketTarget && !options.enchantTarget && options.draggable !== false && !BOX_GROUPS.includes(item.slot);
  const isMaterial = ['upgradeStone', 'mythicUpgradeStone', 'socketStone', 'rarityStone', 'affixStone', 'weaponGem', 'armorGem', 'powerup', 'vipTicket', 'towerLootBoost', 'towerReset', 'bossReset', 'glyphBox', 'vipBox', 'farmBox'].includes(item.slot);
  const upgradeLabel = isMaterial ? '' : (item.upgradeLevel || 0) > 0 ? `Aufwertung +${item.upgradeLevel}` : '';
  const itemIndex = options.shopOffer ? `data-shop-offer-preview="${item.id}"` : options.socketTarget || options.enchantTarget || options.forge ? '' : `data-item-index="${index}"`;
  const saleAction = options.sell && sellable ? `data-sell-item="${item.id}"` : '';
  const saleLabel = options.sell ? sellable ? `<span class="item-sell">VERKAUFEN · ${isMythicWeapon(item) ? MYTHIC_ITEMS.saleStones + ' mystische Steine' : number(sellValue(item)) + ' ✧'}</span>` : '<span class="item-sell item-unsellable-label">NICHT VERKÄUFLICH</span>' : '';
  return `<button class="ui-control ui-graphic ${classes}" type="button" data-item-key="${item.id}" draggable="${canDrag}" ${itemIndex} ${options.socketTarget ? `data-socket-target-item="${item.id}"` : ''} ${options.enchantTarget ? `data-enchant-target-item="${item.id}"` : ''} ${forgeAttrs} ${saleAction} ${options.sell && !sellable ? 'aria-disabled="true"' : ''} aria-label="${escapeHtml(item.name)}, ${escapeHtml(item.rarity)}${item.set ? `, Set ${escapeHtml(item.set)}` : ''}${upgradeLabel ? `, ${upgradeLabel}` : ''}${openedSockets ? `, ${socketLabel}` : ''}${options.sell && !sellable ? ', nicht verkäuflich' : ''}">${itemIconMarkup(item, 'item-icon')}${greaterCount ? `<span class="item-greater-count" aria-label="${greaterCount} Greater Affixe">✦ <span class="item-greater-value">${greaterCount}</span></span>` : ''}${openedSockets ? `<span class="item-socket-count" title="${socketLabel}" aria-label="${socketLabel}">${filledSockets}/${openedSockets}</span>` : ''}${quantity > 1 ? `<span class="item-stack-count">${number(quantity)}</span>` : ''}${!isMaterial && item.upgradeLevel ? `<span class="item-upgrade-level">+${item.upgradeLevel}</span>` : ''}<span class="item-name">${escapeHtml(item.name)}</span><span class="item-type">${escapeHtml(slotName)}</span>${saleLabel}</button>`;
}

function renderItemGridControls(items, gridKey, category, sort, { includeAll = false, excludeCategories = [], includeCategories = null } = {}) {
  const availableCategories = Object.entries(INVENTORY_CATEGORIES).filter(([key]) => !excludeCategories.includes(key) && (!includeCategories || includeCategories.includes(key)));
  const categories = availableCategories.map(([key, entry]) => {
      const count = items.filter((item) => entry.slots.includes(item.slot)).length;
      return `<option value="${key}" ${category === key ? 'selected' : ''}>${escapeHtml(entry.label)} (${count})</option>`;
    }).join('');
  const expansionControls = gridKey === 'inventory' ? renderInventoryExpansionControls() : '';
  return `<div class="item-grid-controls"><label class="filter-label">FILTER <select class="ui-control ui-select" data-item-grid-category="${gridKey}" aria-label="Inventar filtern">${categories}</select></label><label class="filter-label">SORTIEREN <select class="ui-control ui-select" data-item-grid-sort="${gridKey}" aria-label="Inventar sortieren"><option value="rarity" ${sort === 'rarity' ? 'selected' : ''}>Seltenheit</option><option value="slot" ${sort === 'slot' ? 'selected' : ''}>Ausrüstungstyp</option><option value="upgrade" ${sort === 'upgrade' ? 'selected' : ''}>Aufwertung</option></select></label>${expansionControls}</div>`;
}

function renderItemGrid(items, options = {}) {
  const gridKey = options.gridKey || '';
  const preference = gridKey ? itemGridPreferences[gridKey] : null;
  const availableCategoryKeys = Object.keys(INVENTORY_CATEGORIES).filter((key) => !options.excludeCategories?.includes(key) && (!options.categories || options.categories.includes(key)));
  const category = availableCategoryKeys.includes(preference?.category) ? preference.category : availableCategoryKeys[0] || 'all';
  const sort = preference?.sort || 'rarity';
  let filtered = items.filter((item) => !options.allowedSlots || options.allowedSlots.includes(item.slot));
  if (category !== 'all' && INVENTORY_CATEGORIES[category]) {
    filtered = filtered.filter((item) => INVENTORY_CATEGORIES[category].slots.includes(item.slot));
  }
  filtered.sort((a, b) => sort === 'upgrade'
    ? (b.upgradeLevel || 0) - (a.upgradeLevel || 0)
    : sort === 'slot'
      ? (SLOT_DATA[a.slot]?.label || a.slot).localeCompare(SLOT_DATA[b.slot]?.label || b.slot, 'de')
      : RARITY_ORDER.indexOf(b.rarity) - RARITY_ORDER.indexOf(a.rarity));
  const itemCards = filtered.map((item) => {
    const optionsForCard = typeof options.cardOptions === 'function' ? options.cardOptions(item) : options.cardOptions || {};
    return itemCard(item, state.inventory.indexOf(item), optionsForCard);
  }).join('');
  const cards = options.prependHtml
    ? `${options.prependHtml}${itemCards || options.emptyHtml || '<div class="forge-placeholder">Keine passenden Gegenst&auml;nde.</div>'}`
    : itemCards;
  const controls = options.filters && preference
    ? renderItemGridControls(items.filter((item) => !options.allowedSlots || options.allowedSlots.includes(item.slot)), gridKey, category, sort, { includeAll: options.includeAll, excludeCategories: options.excludeCategories, includeCategories: options.categories })
    : '';
  const gridClasses = ['inventory-grid', options.gridClass || '', cards || options.prependHtml || options.extraHtml ? '' : 'is-empty'].filter(Boolean).join(' ');
  return `${controls}<div class="${gridClasses}"${options.gridId ? ` id="${options.gridId}"` : ''}>${cards || options.emptyHtml || '<div class="forge-placeholder">Keine passenden Gegenstände.</div>'}${options.extraHtml || ''}</div>`;
}
function sellValue(item) {
  return itemSaleValue(item);
}
function gearSlot(key, label, item, opts = {}) {
  const ownerClass = opts.className || state.mainClass;
  const gear = equipmentForClass(ownerClass);
  let iconSlot = item?.slot;
  if (!iconSlot) {
    const slotKey = key;
    if (slotKey === 'mainHand') iconSlot = CLASS_WEAPONS[ownerClass]?.[0];
    else if (/^glyph[1-3]$/.test(slotKey)) iconSlot = 'glyph';
    else if (/^ring[1-2]$/.test(slotKey)) iconSlot = 'ring';
    else if (slotKey !== 'weapon') iconSlot = slotKey === 'offHand' ? 'shield' : slotKey.startsWith('earring') ? 'earring' : slotKey;
  }
  const icon = item?.slot === 'pet' ? itemIconMarkup(item, 'gear-icon-image') : equipmentIconMarkup(iconSlot, item?.icon || opts.icon, 'gear-icon-image');
  const text = item ? `${item.name}${item.slot === 'pet' ? ` · Stufe ${item.level}` : item.upgradeLevel ? ` · +${item.upgradeLevel}` : ''}` : opts.empty || 'Leer';
  const classNames = ['gear-slot', item ? 'filled' : 'empty', item?.rarityColor || '', (item?.affixes || []).some(affix => affix.greater) ? 'has-greater-affix' : '', item?.set ? 'set-item' : '', opts.wide ? 'wide' : '', opts.disabled ? 'locked' : ''].filter(Boolean).join(' ');
  const dataAttr = `data-gear-owner="${ownerClass === state.mainClass ? 'main' : 'companion'}" data-gear-class="${ownerClass}" data-gear-slot="${key}"`;
  return `<button class="ui-control ui-graphic ${classNames}" type="button" ${dataAttr} ${opts.disabled ? 'disabled' : ''} aria-label="${escapeHtml(label)}: ${escapeHtml(text)}${item?.set ? `, Set ${escapeHtml(item.set)}` : ''}"><span class="gear-icon">${icon}</span><span class="gear-copy"><small>${escapeHtml(label)}</small><strong>${escapeHtml(text)}</strong></span>${item?.upgradeLevel ? `<span class="gear-upgrade-level">+${item.upgradeLevel}</span>` : ''}</button>`;
}
function renderEquipment(className = state.mainClass) {
  const gear = equipmentForClass(className);
  const isMain = className === state.mainClass;
  const weaponTypes = CLASS_WEAPONS[className] || [];
  const weapon = gearSlot('mainHand', 'Waffe', gear.mainHand, { className, icon: CLASSES[className]?.icon || '⚔', disabled: weaponTypes.length === 0, empty: weaponTypes.length === 0 ? 'Keine Waffe verfügbar' : `${weaponTypes.map((slot) => SLOT_DATA[slot].label).join(' / ')} erforderlich` });
  const offHand = gearSlot('offHand', 'Nebenhand', gear.offHand, { className, icon: '⬡', disabled: className !== 'warrior', empty: className !== 'warrior' ? 'Nur für den Krieger' : 'Leer' });
  const leftSlots = [
    gearSlot('helmet', 'Helm', gear.helmet, { className }),
    gearSlot('chest', 'Brust', gear.chest, { className }),
    gearSlot('gloves', 'Handschuhe', gear.gloves, { className }),
    gearSlot('boots', 'Schuhe', gear.boots, { className }),
    petForClass(className) ? gearSlot('pet', 'Begleittier · fest gebunden', petForClass(className), { className }) : '<div class="gear-slot-placeholder" aria-hidden="true"></div>',
    weapon,
  ];
  const rightSlots = [
    gearSlot('amulet', 'Amulett', gear.amulet, { className }),
    gearSlot('ring1', 'Ring I', gear.ring1, { className, icon: '◉' }),
    gearSlot('ring2', 'Ring II', gear.ring2, { className, icon: '◉' }),
    gearSlot('earring1', 'Ohrring I', gear.earring1, { className, icon: '◈' }),
    gearSlot('earring2', 'Ohrring II', gear.earring2, { className, icon: '◈' }),
    offHand,
  ];
  const glyphSlots = ['glyph1', 'glyph2', 'glyph3'].map((slot, index) => gearSlot(slot, `Glyphe ${index + 1}`, gear[slot], { className, icon: SLOT_DATA.glyph.icon }));
  return `<section class="equipment-panel character-panel-surface"><div class="panel-heading"><div><p class="eyebrow">${isMain ? 'DEIN LOADOUT' : 'GEF&Auml;HRTEN-LOADOUT'}</p><h3>${isMain ? 'Ausr&uuml;stung' : escapeHtml(CLASSES[className].label)}</h3></div><span class="equipment-count">${Object.values(gear).filter(Boolean).length + (petForClass(className) ? 1 : 0)} / 15</span></div><p class="gear-hint">Doppelklick oder ziehe Gegenst&auml;nde in einen Slot.</p><div class="gear-grid"><div class="gear-column">${leftSlots.join('')}</div><div class="gear-column">${rightSlots.join('')}</div></div><div class="glyph-slot-spacer" aria-hidden="true"></div><div class="glyph-slot-grid">${glyphSlots.join('')}</div></section>`;
}

// Shared by combat and the character sheet: only unconditional total-damage factors.
function characterDamageMultiplier(className, sourceState = state, setEffects = activeArmorSetEffects(sourceState, className)) {
  const treeDamage = skillTreeEffectsFor(className, sourceState).filter(effect => effect.type === 'final-damage-percent')
    .reduce((sum, effect) => sum + effect.value, 0);
  const weapon = equipmentForClass(className, sourceState).mainHand;
  return (1 + treeDamage / 100)
    * (1 + skillTreeSpecialValue('healer-final-damage-percent', className, sourceState) / 100)
    * passiveEffectMultiplier('multiplicative-damage-percent', className, sourceState)
    * (setEffects.damageMultiplier || 1) * partySetEffects(sourceState).damageMultiplier
    * (1 + mythicDamagePercent(weapon) / 100) * weaponCompletionDamageMultiplier(weapon);
}

function renderInventoryValues(className) {
  const stats = getStats(className, state, { uncapped: true });
  const setEffects = activeArmorSetEffects(state, className);
  const extraAttackChance = extraAttackChanceFor(className, state);
  const groups = [
    { title: 'GRUNDWERTE', keys: ['Lebenskraft', 'Angriff', 'Verteidigung', 'Stärke', 'Geschicklichkeit', 'Intelligenz', 'Ausdauer', 'Glaube'] },
    { title: 'OFFENSIVE', keys: ['Multiplikativer Schaden', 'Trefferchance', 'Kritische Chance', 'Kritischer Schaden', 'Doppeltrefferchance', 'Schaden gegen verwundbare Ziele', 'Schaden über Zeit'] },
    { title: 'DEFENSIVE & HEILUNG', keys: ['Schadensminderung', 'Ausweichchance', BUFF_EFFECT_STAT] },
    { title: 'WEITERE BONI', keys: ['Angriffsgeschwindigkeit', 'Abklingzeitreduktion', 'Seelenfund'] },
  ];
  const grouped = new Set(groups.flatMap(group => group.keys));
  groups[3].keys.push(...STAT_KEYS.filter(key => !grouped.has(key)));
  const labels = { 'Schaden gegen verwundbare Ziele': 'Verwundbare Ziele', [BUFF_EFFECT_STAT]: 'Buff- und Heilwirkung' };
  const damageMultiplier = characterDamageMultiplier(className, state, setEffects);
  const derived = {
    'Multiplikativer Schaden': (damageMultiplier - 1) * 100,
    Doppeltrefferchance: extraAttackChance,
    Ausweichchance: dodgeChanceFor(className, state),
    Schadensminderung: battleDamageReduction(stats['Verteidigung'], [], 0, 0, { uncapped: true, className, sourceState: state }) * 100,
  };
  return `<div class="inventory-stat-groups">${groups.map(group => `<section class="inventory-stat-group"><h3>${escapeHtml(group.title)}</h3><dl>${group.keys.map(key => {
    const value = derived[key] ?? stats[key] ?? 0;
    const percent = STAT_PERCENT_STATS.has(key) || Object.hasOwn(derived, key);
    const explanation = key === 'Multiplikativer Schaden' ? 'Gemeinsamer Gesamtschadensbonus aus Talenten, ausgerüsteten Passiven, eigenen und Gruppen-Setboni, Mythischem Effekt und Waffenlevel-100-Bonus. +100 % entspricht ×2. Angriff, Waffenschadensbonus, Attribute, Krit, Verwundbarkeit, DoT- und fähigkeitsspezifische Boni sind getrennt.' : key === 'Schadensminderung' ? 'Schadensminderung durch Verteidigung, ohne zeitweilige Schutzfähigkeiten oder bedingte Seteffekte.' : key;
    return `<div class="inventory-stat-row"><dt title="${escapeHtml(explanation)}">${escapeHtml(labels[key] || key)}</dt><dd>${formatCharacterStatValue(key, value, percent, className)}${key === 'Multiplikativer Schaden' ? ` (×${formatRuleNumber(damageMultiplier)})` : ''}</dd></div>`;
  }).join('')}</dl></section>`).join('')}</div>`;
}

function renderInventoryCharacterPanel(className) {
  const tab = selectedInventoryTab === 'stats' ? 'stats' : 'equipment';
  const name = className === state.mainClass ? `${state.playerName} · ${CLASSES[className].label}` : CLASSES[className].label;
  const tabs = [['equipment', 'Ausrüstung'], ['stats', 'Werte']].map(([id, label]) => `<button class="ui-control ui-choice ${tab === id ? 'is-selected' : ''}" id="inventory-tab-${id}" type="button" role="tab" data-inventory-tab="${id}" aria-selected="${tab === id}" aria-controls="inventory-detail-content" tabindex="${tab === id ? 0 : -1}">${label}</button>`).join('');
  return `<section class="inventory-character-panel"><header class="inventory-character-heading"><p class="eyebrow">DEIN CHARAKTER</p><h2>${escapeHtml(name)} · Stufe ${number(characterLevel(className))}</h2></header><div class="inventory-detail-tabs" role="tablist" aria-label="Charakteransicht">${tabs}</div><div class="inventory-detail-content" id="inventory-detail-content" role="tabpanel" aria-labelledby="inventory-tab-${tab}">${tab === 'equipment' ? renderEquipment(className) : renderInventoryValues(className)}</div>${tab === 'stats' ? '<p class="inventory-values-note">Gesamtwerte vor Begrenzung; erreichte Caps stehen in Klammern.</p>' : ''}</section>`;
}

function inventoryExpansionButtonLabel(quote) {
  return quote.atCapacity ? 'MAXIMUM ERREICHT' : !quote.max ? 'NICHT BEZAHLBAR' : `KAUFEN · ${number(quote.cost)} ✧`;
}
function renderEquipmentPage() {
  const companion = state.activeCompanion;
  if (selectedInventoryOwner !== 'main' && selectedInventoryOwner !== companion) selectedInventoryOwner = 'main';
  const className = selectedInventoryOwner === 'main' ? state.mainClass : companion;
  return `<section class="inventory-view equipment-view"><div class="view-heading"><div><p class="eyebrow"><span></span> DEINE KAMPFGRUPPE</p><h1>Ausrüstung <em>& Werte</em></h1></div><div class="inventory-summary">${renderPartyOwnerButtons(selectedInventoryOwner, 'inventory')}</div></div><div class="inventory-layout inventory-owner-${className}" data-inventory-owner="${className}">${renderInventoryCharacterPanel(className)}</div></section>`;
}
function renderInventoryExpansionControls() {
  const quote = inventoryExpansionQuote(state, selectedInventoryExpansionQuantity);
  selectedInventoryExpansionQuantity = quote.amount || 1;
  return `<div class="inventory-expansion-controls" role="group" aria-label="Inventarplätze kaufen"><label class="filter-label" for="inventory-expansion-quantity">Inventarplätze</label><input id="inventory-expansion-quantity" class="ui-control ui-field" type="number" inputmode="numeric" min="${quote.max ? 1 : 0}" max="${quote.max}" step="1" value="${quote.amount}" data-inventory-expansion-quantity aria-label="Anzahl zusätzlicher Inventarplätze" ${quote.max ? '' : 'disabled'}><button class="ui-control ui-button" type="button" data-expand ${quote.max ? '' : 'disabled'}>${inventoryExpansionButtonLabel(quote)}</button></div>`;
}
function syncInventoryExpansionControls(input = document.querySelector('[data-inventory-expansion-quantity]')) {
  if (!input || !state) return;
  const quote = inventoryExpansionQuote(state, input.value);
  input.max = String(quote.max);
  input.min = quote.max ? '1' : '0';
  input.disabled = !quote.max;
  input.value = String(quote.amount);
  selectedInventoryExpansionQuantity = quote.amount || 1;
  const button = input.closest('.inventory-expansion-controls')?.querySelector('[data-expand]');
  if (button) {
    button.disabled = !quote.max;
    button.textContent = inventoryExpansionButtonLabel(quote);
    delete button.dataset.mobileActionCopy;
    syncMobilePageLabels(button);
  }
}
function renderInventory() {
  const capacity = state.inventoryCapacity;
  const companion = state.activeCompanion;
  if (selectedInventoryOwner !== 'main' && selectedInventoryOwner !== companion) selectedInventoryOwner = 'main';
  const companionMode = selectedInventoryOwner !== 'main';
  const ownerClass = companionMode ? companion : state.mainClass;
  const emptyHtml = state.inventory.length
    ? '<div class="inventory-category-empty"><span>&#x2726;</span><strong>Keine Gegenst&auml;nde in dieser Kategorie</strong></div>'
    : '<div class="inventory-category-empty"><span>&#x2726;</span><strong>Noch keine Beute</strong><small>Dein erster Gegenstand wartet in Waffen, R&uuml;stung oder Schmuck.</small></div>';
  const ownedItems = inventoryItemsForOwner(state, ownerClass);
  const inventoryCategory = itemGridPreferences.inventory.category;
  const visibleCategoryItems = ownedItems.some((item) => INVENTORY_CATEGORIES[inventoryCategory]?.slots.includes(item.slot));
  const luckyBoxCount = ownedItems.filter((item) => BOX_GROUPS.includes(item.slot)).reduce((sum, item) => sum + Math.max(1, Math.floor(Number(item.quantity) || 1)), 0);
  const openAllBoxesButton = inventoryCategory === 'luckyBoxes'
    ? `<button class="inventory-open-all-boxes ui-control ui-button primary-button" type="button" data-open-all-lucky-boxes ${luckyBoxCount ? '' : 'disabled'}><span aria-hidden="true">${equipmentIconMarkup('glyphBox', null, 'inventory-open-all-icon')}</span>Alle Boxen &ouml;ffnen${luckyBoxCount ? ` · ${luckyBoxCount}` : ''}</button>`
    : '';
  const inventoryPanel = renderItemGrid(ownedItems, { gridKey: 'inventory', filters: true, gridClass: 'companion-items', emptyHtml: emptyHtml, gridId: 'inventory-category-panel', extraHtml: openAllBoxesButton });
  const ownerButtons = renderPartyOwnerButtons(selectedInventoryOwner, 'inventory');
  return `<section class="inventory-view"><div class="view-heading"><div><p class="eyebrow"><span></span> DEIN UNTERSCHLUPF</p><h1>Inventar <em class="inventory-title-equipment">& Ausr&uuml;stung</em></h1><p class="welcome-sub">Verwalte die Beute deiner Gruppe.</p></div><div class="inventory-summary">${ownerButtons}</div></div><div class="inventory-layout inventory-owner-${ownerClass} ${companionMode ? 'is-companion-inventory' : ''}" data-inventory-owner="${ownerClass}" ${companionMode ? `data-inventory-companion="${companion}"` : ''}><section class="inventory-main character-panel-surface"><div class="inventory-toolbar"><div><span class="toolbar-title">GEGENST&Auml;NDE</span><span class="toolbar-subtitle"> &middot; ${state.inventory.length} gesammelt</span></div><span class="inventory-capacity">${inventoryOccupiedSlots(state)} <small>/ ${capacity} PL&Auml;TZE</small></span></div>${inventoryPanel}${visibleCategoryItems ? '<p class="inventory-hint">Doppelklick zum Ausr&uuml;sten &middot; Ziehen auf einen Slot &middot; Dar&uuml;berfahren f&uuml;r Affixe</p>' : ''}</section>${renderInventoryCharacterPanel(ownerClass)}</div></section>`;
}

function renderGemUpgradePanel(item) {
  const quote = item ? gemUpgradeQuote(state, item.id) : null;
  const next = quote?.nextRarity;
  const values = next ? gemAffixesFor('weaponGem', next.color, quote.profile) : [];
  const canUpgrade = Boolean(quote?.maxUpgrades);
  return `<div class="socket-gem-upgrade">
    <p class="socket-management-hint">${quote ? `${quote.ratio} gleiche Edelsteine derselben Seltenheit ergeben garantiert einen Stein der n&auml;chsten Seltenheit.` : 'W&auml;hle links einen Edelstein aus deinem Inventar.'}</p>
    <div class="forge-sockets socket-gem-upgrade-recipe">
      <div class="forge-socket ${item ? `filled ${item.rarityColor}` : ''}"><span>${item ? equipmentIconMarkup(item.slot, item.icon, 'forge-icon-image') : '&#x25C7;'}</span><small>${item ? `${quote.ratio} &times; ${escapeHtml(item.name)}<br>${escapeHtml(item.rarity)}` : 'EDELSTEIN'}</small></div>
      <b class="forge-socket-link" aria-hidden="true">&#x2192;</b>
      <div class="forge-socket ${next ? `filled ${next.color}` : ''}"><span>${next ? equipmentIconMarkup('weaponGem', item.icon, 'forge-icon-image') : '&#x25C7;'}</span><small>${next ? `1 &times; ${escapeHtml(quote.profile.profile)}<br>${escapeHtml(next.name)}` : item ? 'MAXIMALE SELTENHEIT' : 'ERGEBNIS'}</small></div>
    </div>
    <div class="socket-gem-upgrade-stats">${values.map(affix => `<span>+${formatRuleNumber(affix.value)}${AFFIX_PERCENT_STATS.has(affix.stat) ? ' %' : ''} ${escapeHtml(affix.stat)}</span>`).join('')}</div>
    <p class="socket-management-hint">${quote ? `${number(quote.available)} passende Steine vorhanden${next ? ` &middot; ${number(quote.maxUpgrades)} Aufwertungen m&ouml;glich` : ' &middot; Legend&auml;r ist die h&ouml;chste Seltenheit'}` : 'Es werden nur nicht eingesetzte Edelsteine aus dem Inventar verwendet.'}</p>
    <div class="forge-action-row"><button class="primary-button ui-control ui-button" type="button" data-upgrade-gems="one" ${canUpgrade ? '' : 'disabled'}>EINMAL AUFWERTEN</button><button class="secondary-button ui-control ui-button" type="button" data-upgrade-gems="all" ${canUpgrade ? '' : 'disabled'}>ALLE M&Ouml;GLICHEN <span>${number(quote?.maxUpgrades || 0)}&times;</span></button></div>
  </div>`;
}
function renderSockets() {
  if (!['ritual', 'gems', 'upgrade'].includes(selectedSocketMode)) selectedSocketMode = 'ritual';
  const upgradeMode = selectedSocketMode === 'upgrade';
  const targets = workshopEquipmentItems(state)
    .filter((item, index, all) => item && socketCapacityForSlot(item.slot, item) && all.findIndex((candidate) => candidate?.id === item.id) === index);
  if (!targets.some((item) => item.id === selectedSocketTargetId)) selectedSocketTargetId = targets[0]?.id || null;
  const target = targets.find((item) => item.id === selectedSocketTargetId);
  const capacity = target ? socketCapacityForSlot(target.slot, target) : 0;
  const targetCount = socketAutoTargetCount(target);
  const targetOptions = Array.from({ length: capacity }, (_, index) => index + 1).map(count => `<option value="${count}" ${count === targetCount ? 'selected' : ''}>${count} Sockel</option>`).join('');
  const opened = target?.socketSlots || 0;
  const socketStone = state.inventory.find((item) => item.slot === 'socketStone');
  const chances = BALANCE.items.socketSuccessChanceByTarget.equipment;
  const chance = opened < capacity ? workshopSuccessChance(chances[opened] || 0) : 0;
  const canAttempt = Boolean(target && opened < capacity && socketStone && !activeWorkshopJob);
  const canAuto = canAttempt && opened < targetCount && state.inventory.some((item) => item.slot === 'socketStone');
  const targetGrid = renderItemGrid(targets, {
    gridKey: 'socketTargets', filters: true, categories: ['weapons', 'armor', 'jewelry', 'glyphs'],
    gridClass: 'socket-target-grid', cardOptions: (item) => ({ socketTarget: true, selected: item.id === selectedSocketTargetId }),
    emptyHtml: '<div class="forge-placeholder">Lege zuerst Ausr&uuml;stung bei Main oder Begleiter an.</div>',
  });
  const gemSlot = 'weaponGem';
  const gems = state.inventory.filter((item) => item.slot === gemSlot);
  if (!gems.some(item => item.id === selectedSocketUpgradeGemId)) selectedSocketUpgradeGemId = gems[0]?.id || null;
  const upgradeGem = gems.find(item => item.id === selectedSocketUpgradeGemId);
  const gemGrid = renderItemGrid(gems, {
    gridKey: 'socketGems', filters: true, includeCategories: ['gems'], allowedSlots: [gemSlot],
    cardOptions: item => ({ gemUpgrade: upgradeMode, selected: upgradeMode && item.id === selectedSocketUpgradeGemId, draggable: !upgradeMode }),
    gridClass: 'socket-gem-grid', emptyHtml: '<div class="forge-placeholder">Keine Edelsteine im Inventar.</div>',
  });
  const socketSlots = Array.from({ length: opened }, (_, index) => {
    const gem = target?.sockets?.[index];
    const icon = gem ? equipmentIconMarkup(gem.slot, gem.icon, 'socket-gem-icon') : '<span class="socket-empty-mark">+</span>';
    return `<button type="button" class="socket-gem-slot ui-control ui-graphic ${gem ? `filled ${gem.rarityColor || ''}` : 'is-empty'}" ${gem ? `data-unsocket-index="${index}"` : `data-socket-slot="${index}"`} aria-label="${gem ? `Edelstein ${escapeHtml(gem.name)} entfernen` : `Edelstein in Sockel ${index + 1} einsetzen`}">${icon}<small>${gem ? escapeHtml(gem.name) : `SOCKEL ${index + 1}`}</small></button>`;
  }).join('');
  const manageMode = selectedSocketMode === 'gems';
  const selectionContent = manageMode || upgradeMode ? gemGrid : targetGrid;
  const managementPanel = `<div class="socket-gem-management"><div class="socket-target-summary">${target ? `${equipmentIconMarkup(target.slot, target.icon, 'socket-target-icon')}<div><small>${escapeHtml(SLOT_DATA[target.slot]?.label || 'Ausr&uuml;stung')}</small><strong>${escapeHtml(target.name)} &middot; +${target.upgradeLevel || 0}</strong></div>` : '<p>W&auml;hle zuerst einen belegten Ausr&uuml;stungsplatz.</p>'}</div><div class="socket-gem-slot-grid">${socketSlots || `<div class="forge-placeholder">${target ? 'Noch keine Sockelpl&auml;tze ge&ouml;ffnet.' : 'Kein Ausr&uuml;stungsteil ausgew&auml;hlt.'}</div>`}</div><p class="socket-management-hint">Doppelklick auf einen Edelstein oder ziehe ihn auf einen freien Sockel. Klick auf einen belegten Sockel entfernt den Stein.</p></div>`;
  const actionPanel = manageMode ? managementPanel : `<div class="forge-ritual-art" aria-hidden="true"><div class="ritual-orbit ritual-orbit-outer"><i></i><i></i><i></i><i></i></div><div class="ritual-orbit ritual-orbit-middle"><i></i><i></i><i></i><i></i><i></i><i></i></div><div class="ritual-orbit ritual-orbit-inner"><i></i><i></i><i></i></div>${workshopRitualCore(target, '&#x25C7;')}<span class="ritual-mark ritual-mark-one">&#x25C6;</span><span class="ritual-mark ritual-mark-two">&#x2727;</span><span class="ritual-mark ritual-mark-three">&#x25C6;</span><span class="ritual-caption">${target ? escapeHtml(target.name) : 'AUSR&Uuml;STUNG W&Auml;HLEN'}</span></div><div class="forge-controls socket-forge-controls">${target && opened < capacity ? `<div class="forge-upgrade-status"><span>Sockel ${opened + 1} / ${capacity}</span><strong>${formatRuleNumber(chance)} % Erfolg</strong></div>` : ''}<div class="forge-action-row forge-auto-actions"><button class="primary-button ui-control ui-button forge-button" type="button" data-socket ${canAttempt ? '' : 'disabled'}>EINMAL VERSUCHEN <span>&#x2726;</span></button><label class="forge-auto-target"><span>AUTO-SOCKELN BIS</span><select class="ui-control ui-select" data-socket-target-count aria-label="Zielanzahl geöffneter Sockel" ${!capacity || autoSocketRunning || forgeAnimationInProgress ? 'disabled' : ''}>${targetOptions}</select></label><button class="secondary-button ui-control ui-button forge-auto-button ${autoSocketRunning ? 'is-armed' : ''}" type="button" data-socket-auto ${canAuto || autoSocketRunning ? '' : 'disabled'} aria-pressed="${autoSocketRunning}">${autoSocketRunning ? 'STOPPEN' : 'AUTO SOCKELN'} <span>${Math.min(Math.max(0, targetCount - opened), inventoryQuantityForSlot(state, 'socketStone'))}&times;</span></button></div></div>`;
  const title = upgradeMode ? 'Edelsteine aufwerten' : manageMode ? 'Edelsteinverwaltung' : 'Sockelritual';
  const modes = [['ritual', 'Sockelritual'], ['gems', 'Edelsteine einsetzen'], ['upgrade', 'Edelsteine aufwerten']];
  const modeButtons = `<div class="party-owner-switch socket-mode-buttons" role="group" aria-label="Ansicht der Sockelkammer">${modes.map(([mode, label]) => `<button class="party-owner-button ui-control ui-choice ${selectedSocketMode === mode ? 'is-selected' : ''}" type="button" data-socket-mode="${mode}" aria-pressed="${selectedSocketMode === mode}" ${autoSocketRunning || forgeAnimationInProgress ? 'disabled' : ''}>${label}</button>`).join('')}</div>`;
  const selectionTitle = upgradeMode ? '<p class="eyebrow">EDELSTEINE</p><h3>Zum Aufwerten w&auml;hlen</h3>' : manageMode ? '<p class="eyebrow">EDELSTEINE</p><h3>Passende Edelsteine</h3>' : '<h3>Ausger&uuml;stetes Teil w&auml;hlen</h3>';
  return `<div class="view-heading socket-page-heading"><div><p class="eyebrow"><span></span> DEIN UNTERSCHLUPF</p><h1>Die <em>Sockelkammer</em></h1><p class="welcome-sub">&Ouml;ffne Sockelpl&auml;tze und verst&auml;rke deine Ausr&uuml;stung mit Edelsteinen.</p></div><div class="socket-page-tools">${modeButtons}</div></div><div class="socket-layout ${upgradeMode ? 'is-upgrading-gems' : manageMode ? 'is-managing-gems' : ''}"><section class="socket-selection item-selection"><div class="section-heading"><div>${selectionTitle}</div><span class="selection-count">${manageMode || upgradeMode ? `${gems.length} Stapel` : `${targets.length} Teile`}</span></div>${selectionContent}</section><section class="socket-workbench forge-workbench ${workshopMotionClass('sockets')} ${canAttempt && !manageMode && !upgradeMode ? 'is-ready' : ''}"><div class="socket-workbench-heading"><h3>${title}</h3></div>${upgradeMode ? renderGemUpgradePanel(upgradeGem) : actionPanel}</section></div>`;
}

// Predicts the existing rarity ritual without rolling or changing the item.
function rarityUpgradePreview(item) {
  if (!item) return [];
  const index = RARITY_ENCHANT_ORDER.indexOf(item.rarityColor);
  const nextColor = index >= 0 ? RARITY_ENCHANT_ORDER[index + 1] : null;
  if (!nextColor) return [];
  const multiplier = Math.pow(BALANCE.items.upgradeBaseStatMultiplier, item.upgradeLevel || 0);
  return [
    ['weaponDamage', 'baseWeaponDamage', 'weaponDamage', 'Grundschaden'],
    ['armorDefense', 'baseArmorDefense', 'armorDefense', 'Grundverteidigung'],
  ].flatMap(([type, baseKey, finalKey, label]) => {
    const base = Number.isFinite(item[baseKey]) ? item[baseKey]
      : Number.isFinite(item[finalKey]) ? item[finalKey] / multiplier : null;
    const next = baseItemStatRange(item.slot, nextColor, type);
    if (base === null || !next) return [];
    const previous = baseItemStatRange(item.slot, item.rarityColor, type) || [base, base];
    let range = next;
    if (previous[1] > previous[0]) {
      const progress = Math.max(0, Math.min(1, (base - previous[0]) / (previous[1] - previous[0])));
      const value = Math.round(next[0] + progress * (next[1] - next[0]));
      range = [value, value];
    }
    const levelMultiplier = type === 'weaponDamage' ? weaponLevelDamageMultiplier(item) : 1;
    return [{ label, current: Math.round((Number.isFinite(item[finalKey]) ? item[finalKey] : base * multiplier) * levelMultiplier),
      minimum: Math.round(Math.round(range[0] * multiplier) * levelMultiplier), maximum: Math.round(Math.round(range[1] * multiplier) * levelMultiplier) }];
  });
}

function renderEnchantments() {
  if (!['rarity', 'affix', 'pet'].includes(selectedEnchantMode)) selectedEnchantMode = 'rarity';
  const petMode = selectedEnchantMode === 'pet';
  const enchantableSlots = ['weapons', 'armor', 'jewelry'].flatMap((category) => INVENTORY_CATEGORIES[category].slots);
  const targets = petMode ? partyPets() : workshopEquipmentItems(state)
    .filter((item, index, all) => item && enchantableSlots.includes(item.slot) && all.findIndex((candidate) => candidate?.id === item.id) === index);
  if (!targets.some((item) => item.id === selectedEnchantTargetId)) selectedEnchantTargetId = targets[0]?.id || null;
  const target = targets.find((item) => item.id === selectedEnchantTargetId);
  const rarityStone = state.inventory.find((item) => item.slot === 'rarityStone');
  const affixStone = state.inventory.find((item) => item.slot === 'affixStone');
  const rarityIndex = target ? RARITY_ENCHANT_ORDER.indexOf(target.rarityColor) : -1;
  const legendaryUpgrade = target?.rarityColor === 'legendary';
  const rarityMaxed = legendaryUpgrade ? !canUpgradeLegendaryAffix(target) : rarityIndex < 0 || rarityIndex >= RARITY_ENCHANT_ORDER.length - 1;
  const affixes = target?.affixes || [];
  const freeAffixChoice = petMode || isMythicWeapon(target);
  if (target) {
    if (!freeAffixChoice && Number.isInteger(target.enchantAffixIndex)) selectedEnchantAffixIndex = target.enchantAffixIndex;
    else if (selectedEnchantAffixIndex >= affixes.length) selectedEnchantAffixIndex = 0;
  }
  const affix = affixes[selectedEnchantAffixIndex];
  const isRarityMode = selectedEnchantMode === 'rarity';
  const isAffixMode = selectedEnchantMode === 'affix' || petMode;
  const stone = isRarityMode ? rarityStone : affixStone;
  const affixQuote = enchantAffixQuote(state, target, selectedEnchantAffixIndex);
  const attemptCost = isRarityMode ? 1 : affixQuote.cost;
  const hasRequiredStone = Boolean(target && stone && inventoryQuantityForSlot(state, stone.slot) >= attemptCost && !activeWorkshopJob && !forgeAnimationInProgress && (isRarityMode ? !rarityMaxed : affix && affixQuote.candidates.length));
  const targetGrid = renderItemGrid(targets, {
    gridKey: 'enchantTargets', filters: !petMode, categories: petMode ? [] : ['weapons', 'armor', 'jewelry'], allowedSlots: petMode ? ['pet'] : enchantableSlots,
    gridClass: 'enchant-target-grid', cardOptions: (item) => ({ enchantTarget: true, selected: item.id === selectedEnchantTargetId }),
    emptyHtml: '<div class="forge-placeholder">Noch keine Ausr&uuml;stung vorhanden.</div>',
  });
  const ritualLabel = isRarityMode ? 'SELTENHEIT NEU PR&Auml;GEN' : 'AFFIX NEU PR&Auml;GEN';
  const ritualArt = `<div class="forge-ritual-art" aria-hidden="true"><div class="ritual-orbit ritual-orbit-outer"><i></i><i></i><i></i><i></i></div><div class="ritual-orbit ritual-orbit-middle"><i></i><i></i><i></i><i></i><i></i><i></i></div><div class="ritual-orbit ritual-orbit-inner"><i></i><i></i><i></i></div>${workshopRitualCore(target, '&#x2727;')}<span class="ritual-mark ritual-mark-one">&#x25C6;</span><span class="ritual-mark ritual-mark-two">&#x2727;</span><span class="ritual-mark ritual-mark-three">&#x25C6;</span><span class="ritual-caption">${target ? escapeHtml(target.name) : ritualLabel}</span></div>`;
  const affixPicker = isAffixMode ? `<label class="enchant-affix-picker"><span>AFFIX ZUM WECHSELN</span><select class="ui-control ui-select" data-enchant-affix ${!freeAffixChoice && Number.isInteger(target?.enchantAffixIndex) ? 'disabled' : ''}>${affixes.length ? affixes.map((entry, index) => `<option value="${index}" ${index === selectedEnchantAffixIndex ? 'selected' : ''}>${entry.greater ? '✦ GREATER · ' : ''}${escapeHtml(entry.stat)} &middot; +${formatRuleNumber(entry.value)}${AFFIX_PERCENT_STATS.has(entry.stat) ? '%' : ''}</option>`).join('') : '<option value="">Keine Affixe vorhanden</option>'}</select></label>` : '';
  const nextRarity = rarityIndex >= 0 ? RARITIES.find((entry) => entry.color === RARITY_ENCHANT_ORDER[rarityIndex + 1]) : null;
  const statusText = !target ? 'W&auml;hle ein Ausr&uuml;stungsteil.' : isRarityMode ? legendaryUpgrade
    ? canUpgradeLegendaryAffix(target) ? 'Zuf&auml;lliger Greater Affix &middot; 1 Seltenheitsstein' : target.greaterUpgradeUsed ? 'Einmalige Greater-Aufwertung bereits genutzt.' : 'Greater-Aufwertung nicht m&ouml;glich.'
    : rarityMaxed ? 'H&ouml;chste Seltenheit erreicht.' : `${escapeHtml(target.rarity)} &#x2192; ${escapeHtml(nextRarity?.name || '')}` : affixes.length ? 'W&auml;hle ein Affix zum Umpr&auml;gen.' : 'Dieser Gegenstand hat noch keine Affixe.';
  const modeLabel = isRarityMode ? 'Seltenheit erh&ouml;hen' : 'Affix umpr&auml;gen';
  const modes = [['rarity', 'Seltenheit erhöhen'], ['affix', 'Affix umprägen'], ['pet', 'Begleittier']];
  const modeButtons = `<div class="party-owner-switch socket-mode-buttons" role="group" aria-label="Ansicht der Verzauberung">${modes.map(([mode, label]) => `<button class="party-owner-button ui-control ui-choice ${selectedEnchantMode === mode ? 'is-selected' : ''}" type="button" data-enchant-mode="${mode}" aria-pressed="${selectedEnchantMode === mode}" ${forgeAnimationInProgress ? 'disabled' : ''}>${escapeHtml(label)}</button>`).join('')}</div>`;
  const actionLabel = isRarityMode ? legendaryUpgrade ? 'GREATER AFFIX ERZEUGEN' : 'SELTENHEIT ERH&Ouml;HEN' : 'AFFIX UMPR&Auml;GEN';
  const stoneQuantity = stone ? inventoryQuantityForSlot(state, stone.slot) : 0;
  const preview = isRarityMode ? rarityUpgradePreview(target).map((entry) => `<p><strong>${escapeHtml(entry.label)}:</strong> ${formatRuleNumber(entry.current)} → ${formatRuleNumber(entry.minimum)}${entry.maximum !== entry.minimum ? `–${formatRuleNumber(entry.maximum)}` : ''}${entry.minimum < entry.current ? ' · Kann sinken' : ''}</p>`).join('') : '';
  const valuePreview = preview ? `<div class="enchant-value-preview">${preview}</div>` : '';
  return `<div class="view-heading socket-page-heading"><div><p class="eyebrow"><span></span> DEIN UNTERSCHLUPF</p><h1>Die <em>Verzauberung</em></h1><p class="welcome-sub">Erh&ouml;he die Seltenheit deiner Ausr&uuml;stung und pr&auml;ge ihre Affixe um.</p></div><div class="socket-page-tools">${modeButtons}</div></div><div class="enchant-layout "><section class="forge-selection enchant-selection item-selection"><div class="section-heading"><div><h3>${petMode ? 'Begleittier' : 'Ausger&uuml;stetes Teil w&auml;hlen'}</h3></div><span class="selection-count">${targets.length} Teile</span></div>${targetGrid}</section><section class="forge-workbench enchant-workbench ${workshopMotionClass('enchant')}"><div class="enchant-workbench-heading"><h3>${modeLabel}</h3></div>${ritualArt}<div class="enchant-controls">${affixPicker}${valuePreview}<div class="forge-upgrade-status"><span>${statusText}</span><strong>${target ? `KOSTEN ${number(attemptCost)} &middot; VORRAT ${number(stoneQuantity)} ${isRarityMode ? 'SELTENHEITSSTEINE' : 'UMPR&Auml;GUNGSSTEINE'}` : 'BEREIT'}</strong></div><div class="enchant-attempt-actions"><button class="primary-button ui-control ui-button" type="button" data-enchant-exclusions ${target && affix && affixQuote.pool.length && !forgeAnimationInProgress && !activeWorkshopJob ? '' : 'disabled'}>AFFIXE AUSSCHLIESSEN</button><button class="primary-button ui-control ui-button forge-button" type="button" data-enchant-attempt ${hasRequiredStone ? '' : 'disabled'}>${actionLabel} <span>&#x2726;</span></button></div></div></section></div>`;
}


function bossRankBadge(rank, label = rank?.name || 'Noch kein Rang') {
  return `<span class="boss-rank-badge" style="--boss-rank-color:${bossRankColor(rank)}">${assetIconMarkup('Assets/Icons/000000/transparent/1x1/delapouite/star-medal.svg', '★', 'boss-rank-medal')}<span>${escapeHtml(label)}</span></span>`;
}
