// Validate backups before normalization or rendering, including current-version items.
function validateImportedSave(backup) {
  const fail = (field) => { throw new Error(`Die Sicherung enthält ungültige Daten: ${field}.`); };
  const record = (value, field) => { if (!value || typeof value !== 'object' || Array.isArray(value)) fail(field); };
  const numeric = (value, field, minimum = 0, integer = false, maximum = Number.MAX_SAFE_INTEGER) => {
    if (typeof value !== 'number' || !Number.isFinite(value) || value < minimum || value > maximum || (integer && !Number.isSafeInteger(value))) fail(field);
  };
  const text = (value, field, maximum = 200) => { if (typeof value !== 'string' || value.length > maximum) fail(field); };
  const list = (value, field) => { if (!Array.isArray(value)) fail(field); };
  let entries = 0;
  const largeDamageFields = new Set(['bestDamage', 'damageDealt', 'highestHit']);
  const inspect = (value, depth = 0, field = '') => {
    if (++entries > 100000 || depth > 24) fail('Dateiumfang');
    if (typeof value === 'number' && (!Number.isFinite(value) || (!largeDamageFields.has(field) && Math.abs(value) > Number.MAX_SAFE_INTEGER))) fail('Zahlenwert');
    if (typeof value === 'string' && value.length > 8192) fail('Textlänge');
    if (!value || typeof value !== 'object') return;
    if (Array.isArray(value) && value.length > 10000) fail('Listenlänge');
    Object.entries(value).forEach(([key, entry]) => {
      if (['__proto__', 'prototype', 'constructor'].includes(key)) fail('Objektschlüssel');
      inspect(entry, depth + 1, key);
    });
  };
  inspect(backup);
  record(backup, 'Sicherung');
  if (backup.app !== 'DarkReturn' || backup.version !== 1) fail('Dateiformat');
  const save = backup.state;
  record(save, 'Spielstand');
  if (save.workshopJob != null && !validWorkshopJob(save.workshopJob)) fail('Werkstattauftrag');
  if (save.offlineContext !== undefined) fail('Interner Offline-Kontext');
  if (save.offlineFarm != null) {
    const farm = save.offlineFarm;
    record(farm, 'AFK-Farmziel');
    const mode = farm.mode || 'area';
    if (!['area', 'tower'].includes(mode) || (mode === 'area' && !AREAS.some(area => area.id === farm.area)) || typeof farm.active !== 'boolean') fail('AFK-Farmziel');
    if (mode === 'tower') {
      numeric(farm.round, 'AFK-Turmrunde', 1, true);
      record(farm.partyHealth, 'AFK-Gruppenleben');
      [save.mainClass, save.activeCompanion].filter(Boolean).forEach(owner => numeric(farm.partyHealth[owner], 'AFK-Lebenskraft', 0, false, 1));
    }
    numeric(farm.deepTier, 'AFK-Schwierigkeitsstufe', 0, true, BALANCE.deepOfDark.maxTier);
    numeric(farm.checkpointAt, 'AFK-Zeitpunkt');
    text(farm.signature, 'AFK-Build', 64);
    numeric(farm.cursor, 'AFK-Rundenindex', 0, true);
    numeric(farm.carry, 'AFK-Restzeit', 0, false, 86400000);
    list(farm.samples, 'AFK-Messungen');
    if (farm.samples.length > OFFLINE_RULES.sampleLimit) fail('AFK-Messungen');
    farm.samples.forEach(sample => {
      record(sample, 'AFK-Messung');
      if (typeof sample.won !== 'boolean' || typeof sample.elite !== 'boolean') fail('AFK-Rundenergebnis');
      numeric(sample.milliseconds, 'AFK-Rundenzeit', BALANCE.combat.tickMilliseconds, false, 86400000);
      numeric(sample.damageRate, 'AFK-Schadensmessung', 1);
      if (sample.fixedDamageFraction != null) numeric(sample.fixedDamageFraction, 'AFK-Festschadensanteil', 0, false, 1);
      if (mode === 'tower') {
        if (!['normal', 'champion', 'boss'].includes(sample.kind)) fail('AFK-Turmgegner');
        if (sample.round !== undefined) numeric(sample.round, 'AFK-Turmrunde der Messung', 1, true);
        if (sample.enemyAttackCount !== undefined) numeric(sample.enemyAttackCount, 'AFK-Gegnerangriffe', 0, true);
        if (sample.damageTaken !== undefined) {
          record(sample.damageTaken, 'AFK-Gegnerschaden');
          [save.mainClass, save.activeCompanion].filter(Boolean).forEach(owner => numeric(sample.damageTaken[owner], 'AFK-erlittener Schaden'));
        }
        for (const key of ['startHealth', 'endHealth', 'restoration']) {
          record(sample[key], 'AFK-Gruppenleben');
          [save.mainClass, save.activeCompanion].filter(Boolean).forEach(owner => numeric(sample[key][owner], 'AFK-Lebenskraft', 0, false, key === 'restoration' ? 10 : 1));
        }
      }
    });
    list(farm.powerups, 'AFK-Power-ups');
    if (farm.powerups.length > 40) fail('AFK-Power-ups');
    farm.powerups.forEach(powerup => {
      record(powerup, 'AFK-Power-up');
      if (![...POWERUP_STATS, TOWER_LOOT_BOOST_STAT].includes(powerup.stat)) fail('AFK-Power-up');
      numeric(powerup.expiresAt, 'AFK-Power-up-Ablauf');
    });
    if (farm.worldEvent?.id && !worldEventFromId(farm.worldEvent.id)) fail('AFK-Weltevent');
    numeric(farm.worldEventUntil, 'AFK-Weltevent-Ablauf');
    if (farm.report != null) {
      const report = farm.report;
      record(report, 'AFK-Bericht');
      text(report.id, 'AFK-Berichtskennung');
      if ((report.mode !== 'tower' && !AREAS.some(area => area.id === report.area)) || typeof report.pending !== 'boolean') fail('AFK-Bericht');
      if (report.mode === 'tower') {
        numeric(report.startRound, 'AFK-Turmstart', 1, true);
        numeric(report.lastRound, 'AFK-Turmrekord', 0, true);
        if (typeof report.runEnded !== 'boolean') fail('AFK-Turmabschluss');
      }
      numeric(report.at, 'AFK-Berichtszeit');
      numeric(report.deepTier, 'AFK-Berichtsstufe', 0, true, BALANCE.deepOfDark.maxTier);
      numeric(report.duration, 'AFK-Dauer', 0, false, OFFLINE_RULES.maximumHours * 3600000);
      numeric(report.elapsed, 'AFK-Abwesenheit');
      numeric(report.efficiency, 'AFK-Effizienz', 0, false, 1);
      for (const key of ['wins', 'defeats', 'souls', 'mailed']) numeric(report[key], 'AFK-Ergebnis', 0, true);
      for (const key of ['items', 'sold', 'missed']) {
        record(report[key], 'AFK-Beute');
        Object.entries(report[key]).forEach(([name, quantity]) => { text(name, 'AFK-Gegenstand'); numeric(quantity, 'AFK-Menge', 0, true); });
      }
      list(report.weaponExperience, 'AFK-Waffen-EP');
      report.weaponExperience.forEach(entry => {
        if (!Object.hasOwn(CLASSES, entry.owner)) fail('AFK-Waffenbesitzer');
        numeric(entry.amount, 'AFK-Waffen-EP', 0, true);
      });
      if (report.note !== undefined) text(report.note, 'AFK-Hinweis', 1000);
    }
  }
  if (save.dailyAttempts !== undefined) {
    record(save.dailyAttempts, 'Tagesversuche');
    text(save.dailyAttempts.day, 'Versuchstag', 32);
    for (const mode of ['boss', 'tower']) {
      record(save.dailyAttempts[mode], 'Tagesversuche');
      numeric(save.dailyAttempts[mode].used, 'Verbrauchte Versuche', 0, true);
      numeric(save.dailyAttempts[mode].bonus, 'Steinversuche', 0, true);
    }
  }
  if (save.mainClass !== null && !Object.hasOwn(CLASSES, save.mainClass)) fail('Hauptklasse');
  if (save.mainClass) {
    text(save.playerName, 'Spielername', 20);
    if (!/^[\p{L}\p{N}_ .'-]{2,20}$/u.test(save.playerName)) fail('Spielername');
  } else if (save.playerName != null) text(save.playerName, 'Spielername', 20);
  if (save.activeCompanion != null && (!Object.hasOwn(CLASSES, save.activeCompanion) || save.activeCompanion === save.mainClass)) fail('Gefährte');
  numeric(save.souls, 'Seelen', 0, true);
  if (save.vipExpiresAt !== undefined) numeric(save.vipExpiresAt, 'VIP-Ablaufzeit', 0, true);
  if (save.shopEquipmentRefreshAt !== undefined) numeric(save.shopEquipmentRefreshAt, 'Markt-Erneuerung', 0, true);
  numeric(save.level, 'Stufe', 1, true);
  numeric(save.inventoryCapacity, 'Inventargröße', 0, true, BALANCE.inventory.maxCapacity);
  ['towerFloor', 'towerBest', 'activityUnread', 'experience'].forEach((key) => {
    if (save[key] !== undefined) numeric(save[key], key, key === 'towerFloor' ? 1 : 0, true);
  });
  const areas = (values, field) => { list(values, field); if (values.some((id) => !AREAS.some((area) => area.id === id))) fail(field); };
  if (save.visitedAreas !== undefined) areas(save.visitedAreas, 'Gebiete');
  if (save.huntingEvent != null) {
    record(save.huntingEvent, 'Jagdauftrag');
    text(save.huntingEvent.id, 'Jagdauftrags-ID');
    areas([save.huntingEvent.areaId], 'Jagdgebiet');
    numeric(save.huntingEvent.deepTier, 'Jagd-Schwierigkeitsstufe', 0, true, BALANCE.deepOfDark.maxTier);
    numeric(save.huntingEvent.kills, 'Jagdzähler', 0, true, HUNTING_EVENT_RULES.targetKills);
    if (save.huntingEvent.startedAt !== undefined) numeric(save.huntingEvent.startedAt, 'Jagdstart', 0, true);
    if (save.huntingEvent.nextAvailableAt !== undefined) numeric(save.huntingEvent.nextAvailableAt, 'Nächster Jagdstart', save.huntingEvent.startedAt || 0, true);
    if (save.huntingEvent.claimed !== undefined && typeof save.huntingEvent.claimed !== 'boolean') fail('Jagd-Belohnungsstatus');
  }
  const itemIds = new Set();
  const validateItem = (item, socket = false) => {
    record(item, 'Gegenstand');
    if (!Object.hasOwn(SLOT_DATA, item.slot) && !['greatsword', 'powerup', 'safetyStone', 'powerupBox', 'gemBox', 'enchantmentBox', 'bossResetBox'].includes(item.slot)) fail('Gegenstandstyp');
    if (socket && !['weaponGem', 'armorGem'].includes(item.slot)) fail('Sockelinhalt');
    if (item.id !== undefined && (typeof item.id !== 'string' || !/^[A-Za-z0-9_-]{1,128}$/.test(item.id))) fail('Gegenstands-ID');
    if (!socket) {
      if (typeof item.id !== 'string' || itemIds.has(item.id)) fail('Gegenstands-ID');
      itemIds.add(item.id);
    }
    text(item.name, 'Gegenstandsname');
    text(item.rarity, 'Seltenheit');
    if (!RARITIES.some((rarity) => rarity.color === item.rarityColor)) fail('Seltenheitsfarbe');
    if (item.rarityColor === 'mythic' && !isMythicEquipment(item) && !['mythicUpgradeStone', 'pet'].includes(item.slot)) fail('Mystische Ausrüstungsart');
    if (item.icon !== undefined) text(item.icon, 'Gegenstandssymbol');
    if (item.set !== undefined && !Object.hasOwn(ARMOR_SETS, item.set) && !Object.hasOwn(JEWELRY_SETS, item.set)) fail('Set');
    ['weaponDamage', 'baseWeaponDamage', 'armorDefense', 'baseArmorDefense', 'affixVersion', 'tier'].forEach((key) => {
      if (item[key] !== undefined) numeric(item[key], key);
    });
    if (item.quantity !== undefined) numeric(item.quantity, 'Stapelgröße', 1, true, 1000000);
    if (item.upgradeLevel !== undefined) numeric(item.upgradeLevel, 'Aufwertungsstufe', 0, true, BALANCE.items.maxUpgradeLevel);
    if (item.socketSlots !== undefined) numeric(item.socketSlots, 'Sockelanzahl', 0, true, BALANCE.items.socketCounts.equipment);
    if (item.adminSocketOverride !== undefined && typeof item.adminSocketOverride !== 'boolean') fail('Sockelüberschreibung');
    if (item.greaterUpgradeUsed !== undefined && typeof item.greaterUpgradeUsed !== 'boolean') fail('Einmalige Greater-Aufwertung');
    list(item.affixes, 'Affixe');
    const isGem = ['weaponGem', 'armorGem'].includes(item.slot);
    const gemAffixLimit = 1 + Math.max(...Object.values(BALANCE.items.gemValues).map(values => Object.keys(values.bonuses).length));
    if (item.affixes.length > (item.slot === 'pet' ? petAffixCount(item.level) : isGem ? Math.max(5, gemAffixLimit) : 4)) fail('Affixanzahl');
    if (item.gemProfile !== undefined && (!isGem || !gemProfileFor(item.slot, item.gemProfile))) fail('Edelsteinprofil');
    if (item.weaponLevel !== undefined || item.weaponExperience !== undefined) {
      if (!isLevelWeapon(item)) fail('Waffenlevel');
      if (item.weaponLevel !== undefined) numeric(item.weaponLevel, 'Waffenlevel', 0, true, WEAPON_PROGRESSION.maxLevel);
      if (item.weaponExperience !== undefined) numeric(item.weaponExperience, 'Waffen-EP', 0, true, weaponExperienceThreshold(WEAPON_PROGRESSION.maxLevel));
    }
    if (item.mythicUpgradeLevel !== undefined) {
      if (!isMythicEquipment(item)) fail('Mystische Aufwertung');
      numeric(item.mythicUpgradeLevel, 'Mystische Aufwertung', 0, true, MYTHIC_UPGRADES.maxUpgradeLevel);
    }
    item.affixes.forEach((affix) => {
      record(affix, 'Affix');
      if (!Object.hasOwn(BASE_STATS, affix.stat)) fail('Affixtyp');
      numeric(affix.value, 'Affixwert');
      if (affix.baseValue !== undefined) numeric(affix.baseValue, 'Affixgrundwert');
      if (affix.fixed !== undefined && typeof affix.fixed !== 'boolean') fail('Affixbindung');
      if (affix.greater !== undefined && typeof affix.greater !== 'boolean') fail('Greater-Affix');
    });
    if (item.enchantAffixIndex !== undefined) numeric(item.enchantAffixIndex, 'Umprägungsplatz', 0, true, Math.max(0, item.affixes.length - 1));
    if (item.sockets !== undefined) {
      list(item.sockets, 'Sockel');
      if (socket || item.sockets.length > BALANCE.items.socketCounts.equipment) fail('Sockelinhalt');
      item.sockets.filter(Boolean).forEach((gem) => validateItem(gem, true));
    }
    if (item.passives !== undefined) { list(item.passives, 'Passive Texte'); item.passives.forEach((value) => text(value, 'Passiver Text')); }
    if (item.powerupStat !== undefined && !POWERUP_STATS.includes(item.powerupStat)) fail('Power-up');
    if (item.slot === 'powerup' && !POWERUP_STATS.includes(item.powerupStat)) fail('Power-up-Typ');
  };
  const validatePet = (pet, owner) => {
    record(pet, 'Begleittier');
    if (!Object.hasOwn(CLASSES, owner) || pet.ownerClass !== owner || pet.slot !== 'pet') fail('Begleittier-Zuordnung');
    numeric(pet.level, 'Tierstufe', 1, true);
    validateItem(pet);
    if (pet.upgradeLevel !== 0 || pet.set || pet.sockets?.length || pet.socketSlots || pet.enchantAffixIndex !== undefined) fail('Begleittier-Bindung');
    if (pet.affixes.length !== petAffixCount(pet.level)) fail('Tieraffixanzahl');
    if (pet.affixes.some(affix => {
      if (!PET_RULES.affixPool.includes(affix.stat)) return true;
      // Accept older Greater pets; normalization migrates them to ordinary bases.
      if (affix.greater) return affix.baseValue !== greaterAffixBaseValue(affix.stat) || affix.value !== affix.baseValue;
      const [min, max] = AFFIX_RANGES[affix.stat];
      return !Number.isInteger(affix.baseValue) || affix.baseValue < min || affix.baseValue > max
        || affix.value !== petAffixValueAtLevel(affix.baseValue, pet.level);
    })) fail('Tieraffix');
  };
  if (save.pets !== undefined) {
    record(save.pets, 'Begleittiere');
    Object.entries(save.pets).forEach(([owner, pet]) => validatePet(pet, owner));
  }
  // Older backups stored just the main's pet.
  if (save.pet != null) validatePet(save.pet, save.mainClass);
  list(save.inventory, 'Inventar');
  if (save.inventory.some(item => item.slot === 'pet')) fail('Begleittier im Inventar');
  save.inventory.forEach((item) => validateItem(item));
  if (save.shopEquipmentOffers !== undefined) {
    list(save.shopEquipmentOffers, 'Marktangebote');
    if (save.shopEquipmentOffers.length > EQUIPMENT_SHOP.offerCount) fail('Marktangebotsanzahl');
    save.shopEquipmentOffers.forEach(item => {
      validateItem(item);
      if (!AFFIX_POOLS[item.slot]) fail('Marktausrüstung');
    });
  }
  if (inventoryOccupiedSlots(save) > save.inventoryCapacity) fail('Inventarkapazität');
  record(save.equipment, 'Ausrüstung');
  record(save.equipment.main, 'Main-Ausrüstung');
  const equipment = (gear, owner) => {
    record(gear, 'Charakterausrüstung');
    Object.entries(gear).forEach(([slot, item]) => {
      if (item === null) return;
      if (item.slot === 'pet') fail('Begleittier im wechselbaren Ausrüstungsplatz');
      validateItem(item);
      const normalizedItem = item.slot === 'greatsword' ? { ...item, slot: 'sword' } : item;
      if (!validateEquipmentForClass(save, normalizedItem, slot === 'weapon' ? 'mainHand' : slot, owner)) fail('Ausrüstungsplatz');
    });
  };
  equipment(save.equipment.main, save.mainClass);
  if (save.equipment.companions !== undefined) {
    record(save.equipment.companions, 'Gefährtenausrüstung');
    Object.entries(save.equipment.companions).forEach(([owner, gear]) => {
      if (!Object.hasOwn(CLASSES, owner)) fail('Ausrüstungsklasse');
      equipment(gear, owner);
    });
  }
  if (save.mailbox !== undefined) {
    list(save.mailbox, 'Briefkasten');
    if (save.mailbox.length > MAILBOX_CAPACITY) fail('Briefkastengröße');
    save.mailbox.forEach((mail) => {
      record(mail, 'Brief'); text(mail.id, 'Brief-ID'); text(mail.source, 'Beutequelle');
      if (mail.item?.slot === 'pet') fail('Begleittier im Briefkasten');
      validateItem(mail.item);
    });
  }
  if (save.equipmentSlotProgress !== undefined) {
    record(save.equipmentSlotProgress, 'Ausrüstungsplatz-Fortschritt');
    Object.entries(save.equipmentSlotProgress).forEach(([owner, slots]) => {
      if (owner !== 'main' && !Object.hasOwn(CLASSES, owner)) fail('Ausrüstungsplatz-Besitzer');
      record(slots, 'Ausrüstungsplätze');
      Object.entries(slots).forEach(([slot, progress]) => {
        if (!EQUIPMENT_PROGRESS_SLOTS.includes(slot)) fail('Ausrüstungsplatz');
        record(progress, 'Ausrüstungsplatz-Fortschritt');
        numeric(progress.upgradeLevel, 'Platz-Aufwertung', 0, true, BALANCE.items.maxUpgradeLevel);
        if (progress.adminSocketOverride !== undefined && typeof progress.adminSocketOverride !== 'boolean') fail('Sockelüberschreibung');
        const capacity = BALANCE.items.socketCounts.equipment;
        numeric(progress.socketSlots, 'Platz-Sockel', 0, true, capacity);
        list(progress.sockets, 'Platz-Edelsteine');
        if (progress.sockets.length !== progress.socketSlots) fail('Platz-Edelsteine');
        progress.sockets.filter(Boolean).forEach(gem => {
          validateItem(gem, true);
        });
      });
    });
  }
  ['settings', 'statistics', 'characterLevels', 'skillTree', 'companions', 'bossChallenge', 'contracts', 'questBook', 'deepOfDark'].forEach((key) => {
    if (save[key] !== undefined) record(save[key], key);
  });
  if (save.settings) {
    if (save.settings.enchantExcludedAffixes !== undefined) {
      record(save.settings.enchantExcludedAffixes, 'Affix-Ausschl\u00fcsse');
      for (const group of ['equipment', 'pet']) {
        const selected = save.settings.enchantExcludedAffixes[group];
        list(selected, 'Affix-Ausschl\u00fcsse');
        const pool = group === 'pet' ? PET_RULES.affixPool : Object.values(AFFIX_POOLS).flat();
        if (selected.length > new Set(pool).size || selected.some(stat => !pool.includes(stat))) fail('Affix-Ausschl\u00fcsse');
      }
    }

    if (save.settings.towerLoot !== undefined && save.settings.towerLoot !== 'powerupBox' && !BALANCE.loot.towerLootChoices.some(choice => choice.id === save.settings.towerLoot)) fail('Turmbeute');
    ['autoSkillsDefault', 'compactDamageNumbers', 'autoSellNonSet', 'forgeAnimations', 'socketAnimations', 'enchantAnimations'].forEach((key) => { if (save.settings[key] !== undefined && typeof save.settings[key] !== 'boolean') fail(key); });
    if (save.settings.autoSellRarities !== undefined) {
      list(save.settings.autoSellRarities, 'Lootfilter');
      if (save.settings.autoSellRarities.some((color) => !RARITIES.some((rarity) => rarity.color === color))) fail('Lootfilter');
    }
    if (save.settings.lootCollectionRules !== undefined && !validLootCollectionRules(save.settings.lootCollectionRules)) fail('Sammelregeln');
  }
  Object.entries(save.characterLevels || {}).forEach(([owner, level]) => { if (!Object.hasOwn(CLASSES, owner)) fail('Stufenklasse'); numeric(level, 'Charakterstufe', 1, true); });
  Object.entries(save.companions || {}).forEach(([owner, companion]) => {
    if (!Object.hasOwn(CLASSES, owner)) fail('Gefährtenklasse');
    record(companion, 'Gefährte');
    ['activeSkillIndex', 'passiveSkillIndex', 'secondPassiveSkillIndex'].forEach((key) => { if (companion[key] !== undefined) numeric(companion[key], key, 0, true, 2); });
  });
  Object.values(save.skillTree || {}).forEach((tree) => { record(tree, 'Talentbaum'); record(tree.nodes, 'Talentpunkte'); Object.values(tree.nodes).forEach((value) => numeric(value, 'Talentpunkt', 0, true)); });
  if (save.statistics) Object.entries(save.statistics).forEach(([key, value]) => {
    if (key === 'luckyBoxesOpened') { record(value, key); Object.values(value).forEach((count) => numeric(count, key, 0, true)); }
    else numeric(value, key, 0, false, largeDamageFields.has(key) ? Number.MAX_VALUE : Number.MAX_SAFE_INTEGER);
  });
  if (save.bossChallenge) Object.entries(save.bossChallenge).forEach(([key, value]) => numeric(value, key, key === 'highestRank' ? -1 : 0, key !== 'bestDamage', key === 'bestDamage' ? Number.MAX_VALUE : Number.MAX_SAFE_INTEGER));
  if (save.deepOfDark) {
    // Legacy Deep 4 saves are accepted here and normalized to the new maximum.
    numeric(save.deepOfDark.tier, 'Deep-Stufe', 0, true, Math.max(4, BALANCE.deepOfDark.maxTier));
    areas(save.deepOfDark.clearedAreas, 'Besiegte Gebiete');
  }
  if (save.contracts) Object.entries(save.contracts).forEach(([key, value]) => {
    if (typeof value === 'number') numeric(value, key, 0, true);
    else { record(value, key); Object.entries(value).forEach(([field, count]) => field === 'areas' ? areas(count, field) : numeric(count, field, 0, true)); }
  });
  const reward = (value) => {
    record(value, 'Auftragsbelohnung');
    if (!['souls', 'material', 'gem', 'starterArmor', 'setItem', 'equipment', 'classWeapon', 'luckyBox', 'itemBundle', 'luckyBundle', 'gemBundle', 'setBundle'].includes(value.type)) fail('Belohnungstyp');
    if (['luckyBundle', 'gemBundle'].includes(value.type)) numeric(value.quantity, 'Paketmenge', 1, true, 1000000);
    if (value.type === 'setBundle' && (!['armor', 'jewelry'].includes(value.kind) || typeof value.classBound !== 'boolean' || !['main', 'companion'].includes(value.owner))) fail('Setpaket');
    if (value.greaterAffixes !== undefined) numeric(value.greaterAffixes, 'Greater-Affixanzahl', 0, true, 4);
    if (value.type === 'itemBundle') { list(value.items, 'Belohnungspaket'); value.items.forEach(reward); }
    if (value.type === 'souls') { numeric(value.min, 'Seelenbelohnung', 0, true); numeric(value.max, 'Seelenbelohnung', value.min, true); }
    if (['material', 'setItem', 'equipment'].includes(value.type) && !Object.hasOwn(SLOT_DATA, value.slot) && !(value.type === 'material' && ['safetyStone', 'powerup'].includes(value.slot))) fail('Belohnungsgegenstand');
    if (value.type === 'material') numeric(value.quantity, 'Materialbelohnung', 1, true, 1000000);
    if (value.type === 'starterArmor') { record(value.item, 'Startrüstung'); if (!Object.hasOwn(SLOT_DATA, value.item.kind)) fail('Startrüstung'); }
    if (value.type === 'classWeapon' && !['main', 'companion'].includes(value.owner)) fail('Waffenbelohnung');
    if (value.type === 'luckyBox' && !Object.hasOwn(BOX_RULES, value.group) && !['gemBox', 'powerupBox', 'enchantmentBox', 'bossResetBox'].includes(value.group)) fail('Luckybox');
  };
  if (save.questBook) {
    if (save.questBook.completedAreas !== undefined) areas(save.questBook.completedAreas, 'Dauerhaft bezwungene Gebiete');
    ['claimed', 'stageRewards', 'counters'].forEach((key) => { if (save.questBook[key] !== undefined) record(save.questBook[key], key); });
    Object.values(save.questBook.counters || {}).forEach((value) => numeric(value, 'Auftragszähler'));
    const board = save.questBook.board;
    if (board !== undefined) {
      record(board, 'Auftragsbrett'); numeric(board.groupIndex, 'Auftragsgruppe', 0, true); list(board.tasks, 'Aufgaben');
      if (board.tasks.length !== QUEST_BOARD.batchSize) fail('Aufgabenanzahl');
      board.tasks.forEach((task) => {
        record(task, 'Aufgabe'); record(task.quest, 'Auftragsziel');
        text(task.quest.id, 'Auftrags-ID'); text(task.quest.title, 'Auftragstitel'); text(task.quest.description, 'Auftragstext', 2000);
        numeric(task.quest.target, 'Auftragsziel', 1, true);
        if (task.quest.startValue !== undefined) numeric(task.quest.startValue, 'Auftragsstart');
        if (task.quest.startLevels !== undefined) {
          record(task.quest.startLevels, 'Startstufen');
          numeric(task.quest.startLevels.main, 'Main-Startstufe', 0, true);
          numeric(task.quest.startLevels.companion, 'Begleiter-Startstufe', 0, true);
        }
        if (typeof task.claimed !== 'boolean') fail('Auftragsstatus');
        reward(task.reward);
      });
    }
  }
  if (save.activePowerups !== undefined) {
    list(save.activePowerups, 'Power-ups');
    save.activePowerups.forEach((entry) => { record(entry, 'Power-up'); if (entry.stat !== TOWER_LOOT_BOOST_STAT && !POWERUP_STATS.includes(entry.stat)) fail('Power-up-Typ'); numeric(entry.expiresAt, 'Power-up-Dauer'); });
  }
  if (save.activityLog !== undefined) {
    list(save.activityLog, 'Aktivitäten');
    save.activityLog.forEach((entry) => { record(entry, 'Aktivität'); text(entry.title, 'Aktivitätstitel'); text(entry.detail, 'Aktivitätstext', 8192); if (typeof entry.at !== 'string' || !Number.isFinite(Date.parse(entry.at))) fail('Aktivitätsdatum'); });
  }
  const normalized = normalizeSaveState({ ...defaultState(), ...cloneState(save) });
  normalized.bossChallenge.reservedStorageSlots = 0;
  return normalized;
}
