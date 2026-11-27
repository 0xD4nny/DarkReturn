function applyEnchantAffixAttempt(save, body) {
  const target = requireWorkshopItem(save, body.itemId, { allowPet: true });
  const isPet = target?.slot === 'pet';
  const mythic = isMythicEquipment(target);
  if (!target || (!isPet && !AFFIX_POOLS[target.slot])) throw new Error('Wähle ein Ausrüstungsteil oder dein Begleittier.');
  const affixIndex = Number(body.affixIndex);
  if (!Number.isInteger(affixIndex) || affixIndex < 0 || affixIndex >= (target.affixes || []).length) throw new Error('Wähle ein vorhandenes Affix.');
  if (!isPet && !mythic && Number.isInteger(target.enchantAffixIndex) && target.enchantAffixIndex !== affixIndex) throw new Error('Bei diesem Gegenstand kann nur das bereits gewählte Affix umgeprägt werden.');
  const stone = requireInventoryItem(save, body.stoneId).item;
  if (stone.slot !== 'affixStone') throw new Error('Dafür wird ein Umprägungsstein benötigt.');
  const quote = enchantAffixQuote(save, target, affixIndex);
  if (!quote.candidates.length) throw new Error('Mindestens ein neuer Affixtyp muss m\u00f6glich bleiben.');
  if (quote.available < quote.cost) throw new Error(`Du ben\u00f6tigst ${quote.cost} Umpr\u00e4gungssteine.`);
  if (quote.mythicStones < quote.mythicStoneCost) throw new Error('Du benötigst einen mystischen Aufwertungsstein pro Umprägungsversuch.');
  const currentStat = target.affixes[affixIndex].stat;
  const usedStats = target.affixes.filter((_, index) => index !== affixIndex).map((affix) => affix.stat);
  const replacement = isPet ? rollPetAffix(currentStat, target.level, quote.excluded) : rollAffix(target.slot, [...quote.excluded, ...(allowsRepeatedAffixes(target.slot) ? [currentStat] : [...usedStats, currentStat])]);
  if (mythic) {
    replacement.greater = true;
    replacement.baseValue *= BALANCE.loot.greaterAffixMaxMultiplier;
    replacement.value = replacement.baseValue;
  }
  if (!isPet) replacement.value = affixValueAtUpgrade(replacement, target.upgradeLevel);
  consumeAffixStones(save, quote.cost);
  if (quote.mythicStoneCost) consumeInventoryItem(save, save.inventory.find(item => item.slot === 'mythicUpgradeStone').id, 'mythicUpgradeStone');
  target.affixes[affixIndex] = replacement;
  if (!isPet && !mythic) target.enchantAffixIndex = affixIndex;
  if (mythic) delete target.enchantAffixIndex;
  save.statistics.affixesRerolled += 1;
  save.questBook.counters.affixesRerolled += 1;
  save.questBook.counters[isPet ? 'petAffixesRerolled' : 'equipmentAffixesRerolled'] += 1;
  return { kind: 'enchant-affix', cost: quote.cost, mythicStoneCost: quote.mythicStoneCost, excluded: quote.excluded, item: target, previousStat: currentStat, affix: replacement, state: save, outcomes: [{ success: true }], message: 'Affix umgeprägt.' };
}

// Shared reward path for live victories and offline area farming.
function resolveBattleRewards(save, body) {
  const combatStats = body.statistics || {};
  if (['area', 'tower'].includes(body.mode)) grantWeaponExperience(save, combatStats);
  save.statistics.damageDealt += Math.max(0, Number(combatStats.damageDealt) || 0);
  save.statistics.deaths += Math.max(0, Number(combatStats.deaths) || 0);
  save.statistics.monstersKilled += Math.max(0, Number(combatStats.monstersKilled) || 0);
  save.statistics.highestHit = Math.max(save.statistics.highestHit, Number(combatStats.highestHit) || 0);
  let reward;
  let firstClear = false;
  let discoveryBonus = 0;
  let firstClearBoxes = null;
  let firstClearBoxesDestination = null;
  let areaIndex = -1;
  let towerRound = null;
  if (body.mode === 'area') {
    const area = AREAS.find((entry) => entry.id === body.area);
    if (!area) throw new Error('Unbekanntes Gebiet.');
    areaIndex = AREAS.findIndex((entry) => entry.id === area.id);
    const deepTier = Math.max(0, Math.min(Number(save.deepOfDark.tier) || 0, Math.floor(Number(body.deepTier) || 0)));
    const historicalTier = deepTier < save.deepOfDark.tier;
    if (!historicalTier && !areaUnlocked(save, areaIndex)) throw new Error(`Bezwinge zuerst das vorherige Gebiet in diesem Durchlauf.`);
    firstClear = !historicalTier && !save.deepOfDark.clearedAreas.includes(body.area);
    discoveryBonus = firstClear ? areaFirstClearSouls(area.id, deepTier) : 0;
    reward = randomInt(...areaSoulRewardRange(area.id, deepTier));
    if (!save.questBook.completedAreas.includes(body.area)) save.questBook.completedAreas.push(body.area);
    if (firstClear) {
      firstClearBoxes = makeLuckyBoxItem('farmBox');
      firstClearBoxes.quantity = BALANCE.loot.firstClearFarmBoxes;
      firstClearBoxesDestination = storeRewardItem(save, firstClearBoxes, 'Erstabschluss');
      save.deepOfDark.clearedAreas.push(body.area);
      if (!save.visitedAreas.includes(body.area)) save.visitedAreas.push(body.area);
    }
    body.deepTier = deepTier;
  } else if (body.mode === 'tower') {
    towerRound = Number(body.round);
    if (!Number.isSafeInteger(towerRound) || towerRound < 1) throw new Error('Ungültige Turmrunde.');
    const towerStats = towerEncounterStats(save, towerRound);
    reward = randomInt(towerStats.soulsMinimum, towerStats.soulsMaximum);
    save.statistics.towerRoundsWon += 1;
    save.questBook.counters.towerRounds += 1;
    save.statistics.towerBestRunRounds = Math.max(save.statistics.towerBestRunRounds, towerRound);
  } else throw new Error('Unbekannter Kampfmodus.');
  if (body.mode === 'area') {
    save.contracts.hunt.progress += 1;
    save.questBook.counters.areaWins += 1;
    const killed = Math.max(0, Math.floor(Number(combatStats.monstersKilled) || 3));
    advanceHuntingEvent(save, body.area, body.deepTier, combatStats.huntingKills ?? killed, body.huntingEventId);
    save.questBook.counters.monsters += killed;
    for (let tier = 1; tier <= body.deepTier; tier++) save.questBook.counters['monstersDeep' + tier] += killed;
    completeContract(save, 'hunt');
    if (!save.contracts.survey.areas.includes(body.area)) save.contracts.survey.areas.push(body.area);
    completeContract(save, 'survey');
  } else {
    save.contracts.tower.progress += 1;
    completeContract(save, 'tower');
  }
  const elite = body.mode === 'tower' ? towerRound % 10 === 5 : Boolean(body.elite);
  if (elite) save.questBook.counters.champions += 1;
  if (elite && body.mode === 'area') {
    for (let tier = 1; tier <= body.deepTier; tier++) save.questBook.counters['championsDeep' + tier] += 1;
  }
  if (body.mode === 'tower' && towerRound % 10 === 0) {
    save.questBook.counters.towerBosses += 1;
    save.statistics.towerBossesKilled = (save.statistics.towerBossesKilled || 0) + 1;
  }
  const lootRules = BALANCE.loot;
  const scalingLevel = body.mode === 'tower' ? highestPartyLevel(save) : partyLevel(save);
  let eliteBonus = elite ? randomInt(lootRules.eliteSoulsMinimumBase + scalingLevel * lootRules.eliteSoulsMinimumPerLevel, lootRules.eliteSoulsMaximumBase + scalingLevel * lootRules.eliteSoulsMaximumPerLevel) : 0;
  if (elite) eliteBonus = Math.round(eliteBonus * (1 + (activeArmorSetEffects(save).eliteSoulBonusPercent || 0) / 100));
  const rewardOwners = Array.isArray(body.partyClasses) ? body.partyClasses : [save.mainClass, save.activeCompanion].filter(Boolean);
  const rewardState = { ...save, activeCompanion: rewardOwners.find((owner) => owner !== save.mainClass) || save.activeCompanion };
  const equipped = rewardOwners.flatMap((owner) => Object.values(equipmentForClass(owner, save)));
  const soulFind = rewardOwners.reduce((sum, owner) => sum + (getStats(owner, rewardState)['Seelenfund'] || 0), 0);
  const skillSoulBonus = partySkillTreeEffectValue('soul-drop-percent', rewardState) + passiveEffectTotal('soul-drop-percent', rewardState.mainClass, rewardState);
  reward = applyCombatSoulBonus(Math.round((reward + eliteBonus) * (1 + soulFind / 100) * (1 + skillSoulBonus / 100)), save) + discoveryBonus;
  addQuestTrackedSouls(save, reward);
  let equipmentDrop = null;
  let equipmentDropMailed = false;
  let equipmentDropMissed = false;
  let equipmentDropSold = false;
  let equipmentDropSaleValue = 0;
  let equipmentDropSaleStones = 0;
  let equipmentDropDestination = null;
  const questItemDrops = body.mode === 'area'
    ? rollAreaQuestItemDrops(save, body.area, body.deepTier, combatStats.monstersKilled ?? 3) : [];
  const towerMaterialDrops = [];
  const towerMaterialDropMissed = [];
  if (body.mode === 'tower') {
    const choice = BALANCE.loot.towerLootChoices.find(entry => entry.id === save.settings.towerLoot);
    const candidateDrops = [];
    if (choice) {
      const chance = towerLootChance(choice, save);
      const count = Math.floor(chance / 100) + (Math.random() * 100 < chance % 100 ? 1 : 0);
      const factories = {
        upgradeStone: makeUpgradeStone,
        mythicUpgradeStone: makeMythicUpgradeStone,
        socketStone: makeSocketStone,
        affixStone: () => makeEnchantmentStone('affixStone'),
        gems: () => makeRandomGem(save),
        powerup: () => makePowerup(choose(POWERUP_STATS)),
      };
      for (let index = 0; index < count; index++) candidateDrops.push(factories[choice.id]());
      if (choice.id === 'upgradeStone') save.questBook.counters.upgradeStoneDrops += count;
      if (choice.id === 'socketStone') save.questBook.counters.socketStoneDrops += count;
      if (choice.id === 'affixStone') save.questBook.counters.affixStoneDrops += count;
      if (choice.id === 'gems') save.questBook.counters.gemDrops += count;
    }
    try {
      towerMaterialDrops.push(...storeRewardItems(save, candidateDrops, 'Turm'));
    } catch {
      towerMaterialDropMissed.push(...candidateDrops);
    }
  }
  if (body.mode === 'area') {
    const baseChance = elite ? (BALANCE.loot.eliteEquipmentDropChance ?? 0.1) : (BALANCE.loot.areaEquipmentDropChance ?? 0.05);
    const dropState = { ...save, deepOfDark: { ...save.deepOfDark, tier: Number(body.deepTier) || 0 } };
    const mythicChance = mythicEquipmentDropChance(body.area, body.deepTier);
    if (mythicChance > 0 && Math.random() < applyLootDropBonus(mythicChance, save)) {
      equipmentDrop = makeMythicEquipmentDrop(dropState);
    } else if (Math.random() < applyLootDropBonus(baseChance, save)) {
      equipmentDrop = makeAreaEquipmentDrop(body.area, dropState);
    }
    if (equipmentDrop) {
      const hasGreaterAffix = (equipmentDrop.affixes || []).some(affix => affix.greater);
      if (hasGreaterAffix) save.questBook.counters.greaterDrops += 1;
      save.questBook.counters.equipmentDrops += 1;
      if (equipmentDrop.rarityColor === 'epic') save.questBook.counters.epicDrops += 1;
      const jewelrySlots = ['ring', 'amulet', 'earring'];
      if (jewelrySlots.includes(equipmentDrop.slot)) save.questBook.counters.jewelryDrops += 1;
      if (shouldAutoSellEquipmentDrop(save, equipmentDrop)) {
        equipmentDropSold = true;
        save.statistics.itemsSold += Math.max(1, Number(equipmentDrop.quantity) || 1);
        save.statistics.autoSoldItems += Math.max(1, Number(equipmentDrop.quantity) || 1);
        equipmentDropSaleValue = itemSaleValue(equipmentDrop);
        addQuestTrackedSouls(save, equipmentDropSaleValue);
        equipmentDropSaleStones = grantMythicSaleStones(save, equipmentDrop);
        equipmentDropDestination = 'sold';
      } else if (canStoreRewardItem(save, equipmentDrop)) {
        equipmentDropDestination = storeRewardItem(save, equipmentDrop, 'Gebiet');
        equipmentDropMailed = equipmentDropDestination === 'mailbox';
      } else {
        equipmentDropMissed = true;
        equipmentDropDestination = 'missed';
      }
    }
  }
  let farmBoxDrop = null;
  let farmBoxDropDestination = null;
  if (Math.random() < applyLootDropBonus(BOX_RULES.farmBox.dropChance, save)) {
    farmBoxDrop = makeLuckyBoxItem('farmBox');
    farmBoxDropDestination = canStoreRewardItem(save, farmBoxDrop)
      ? storeRewardItem(save, farmBoxDrop, 'Farmbeute') : 'missed';
  }
  return { reward, round: towerRound, firstClear, discoveryBonus, firstClearBoxes, firstClearBoxesDestination, eliteBonus, equipmentDrop, equipmentDropMailed, equipmentDropMissed, equipmentDropDestination, equipmentDropSold, equipmentDropSaleValue, equipmentDropSaleStones, towerMaterialDrops, towerMaterialDropMissed, questItemDrops, farmBoxDrop, farmBoxDropDestination, state: save, message: 'Kampf gewonnen.' };
}

// Transactional game actions, separated from state and persistence helpers.
function applyWorldSoulBonus(amount, sourceState = state) {
  return Math.round(amount * (1 + getWorldEvent(sourceState).soulBonusPercent / 100));
}
function applyCombatSoulBonus(amount, save) {
  const vipMultiplier = vipIsActive(save) ? 1 + VIP_RULES.soulBonusPercent / 100 : 1;
  return applyWorldSoulBonus(amount * vipMultiplier, save);
}
function addQuestTrackedSouls(save, amount, questReward = false) {
  const value = Math.max(0, Math.floor(Number(amount) || 0));
  save.souls += value;
  save.questBook.counters.soulsEarned += value;
  if (!questReward) save.questBook.counters.nonQuestSoulsEarned += value;
  save.statistics.soulsEarned = (save.statistics.soulsEarned || 0) + value;
}
function spendQuestTrackedSouls(save, amount) {
  const value = Math.max(0, Math.floor(Number(amount) || 0));
  save.souls -= value;
  save.questBook.counters.soulsSpent += value;
}
function itemSaleValue(item) {
  if (isMythicEquipment(item)) return 0;
  const unitValue = Math.round(equipmentShopPrice(item) * 0.1);
  return unitValue * Math.max(1, Math.floor(Number(item.quantity) || 1));
}
function grantMythicSaleStones(save, item) {
  if (!isMythicEquipment(item)) return 0;
  const amount = MYTHIC_ITEMS.saleStones;
  addItemsToInventory(save, [{ ...makeMythicUpgradeStone(), quantity: amount }]);
  return amount;
}
function grantWeaponExperience(save, combatStats) {
  const kills = Math.max(0, Math.min(3, Math.floor(Number(combatStats.weaponKills) || 0)));
  if (!kills) return;
  for (const id of new Set(Array.isArray(combatStats.weaponIds) ? combatStats.weaponIds : [])) {
    const item = findInventoryOrEquippedItem(save, id);
    if (!isLevelWeapon(item)) continue;
    normalizeWeaponProgress(item);
    item.weaponExperience += kills * WEAPON_PROGRESSION.experiencePerKill;
    normalizeWeaponProgress(item);
  }
}
function applyWorkshopAttempt(save, body) {
  let response;
  if (body.action === 'upgrade') {
    const target = requireWorkshopItem(save, body.itemId);
    if (!target) throw new Error('Gegenstand nicht gefunden.');
    const mythic = body.mythic === true;
    if (mythic && !isMythicEquipment(target)) throw new Error('Mystische Aufwertung ist nur für mystische Ausrüstung verfügbar.');
    const levelKey = mythic ? 'mythicUpgradeLevel' : 'upgradeLevel';
    const stoneSlot = mythic ? 'mythicUpgradeStone' : 'upgradeStone';
    const maxLevel = mythic ? MYTHIC_UPGRADES.maxUpgradeLevel : BALANCE.items.maxUpgradeLevel;
    if (!AFFIX_POOLS[target.slot] && target.slot !== 'glyph') throw new Error('Wähle zuerst eine Ausrüstung als Ziel.');
    if ((target[levelKey] || 0) >= maxLevel) throw new Error(`Dieser Ausrüstungsplatz ist bereits auf +${maxLevel}.`);
    const stoneIds = body.auto
      ? stackUnitIds(save, stoneSlot)
      : [body.stoneId];
    if (!stoneIds.length || !stoneIds[0]) throw new Error('Wähle einen Aufwertungsstein.');
    if (stoneIds.some((id) => !save.inventory.some((item) => item.id === id && item.slot === stoneSlot))) throw new Error('Ein Aufwertungsstein wurde nicht gefunden.');
    const attempts = body.auto ? stoneIds.length : 1;
    let successes = 0;
    let failures = 0;
    let lastChance = 0;
    const outcomes = [];
    for (const stoneId of stoneIds.slice(0, attempts)) {
      if ((target[levelKey] || 0) >= maxLevel) break;
      const stoneIndex = inventoryIndex(save, stoneId);
      if (stoneIndex < 0 || save.inventory[stoneIndex].slot !== stoneSlot) break;
      consumeInventoryItem(save, stoneId, stoneSlot);
      const attemptedLevel = target[levelKey] || 0;
      lastChance = workshopSuccessChance((mythic ? MYTHIC_UPGRADES.successChanceByLevel : BALANCE.items.upgradeSuccessChanceByLevel)[attemptedLevel] || 0, save);
      if (Math.random() * 100 < lastChance) {
        target[levelKey] = (target[levelKey] || 0) + 1;
        if (!mythic) {
          const upgradeMultiplier = Math.pow(BALANCE.items.upgradeBaseStatMultiplier, target[levelKey]);
          if (target.baseWeaponDamage) target.weaponDamage = Math.round(target.baseWeaponDamage * upgradeMultiplier);
          if (target.baseArmorDefense) target.armorDefense = Math.round(target.baseArmorDefense * upgradeMultiplier);
          target.affixes = (target.affixes || []).map((affix) => {
            const baseValue = affix.baseValue ?? affix.value;
            return { ...affix, baseValue, value: affixValueAtUpgrade({ ...affix, baseValue }, target[levelKey]) };
          });
        }
        successes += 1;
        outcomes.push({ success: true, level: attemptedLevel, resultingLevel: target[levelKey], chance: lastChance });
      } else {
        failures += 1;
        outcomes.push({ success: false, level: target[levelKey] || 0, chance: lastChance });
      }
    }
    if (!mythic) save.questBook.counters.forges += successes;
    save.statistics.forgeAttempts += successes + failures;
    response = { item: target, mythic, attempts: successes + failures, successes, failures, chance: lastChance, outcomes, state: save, message: successes ? 'Aufwertung abgeschlossen.' : 'Aufwertung fehlgeschlagen.' };
  } else if (body.action === 'socket-slot') {
    const target = requireWorkshopItem(save, body.itemId);
    if (!target) throw new Error('Ausrüstungsteil nicht gefunden.');
    const capacity = socketCapacityForSlot(target.slot, target);
    if (!capacity) throw new Error('Dieses Teil kann keine Sockel erhalten.');
    const socketStones = body.auto
      ? stackUnitIds(save, 'socketStone')
      : [body.stoneId].filter(Boolean);
    if (!socketStones.length) throw new Error('Du brauchst einen Sockelstein für den Versuch.');
    if ((target.socketSlots || 0) >= capacity) throw new Error('Dieses Teil hat bereits die maximale Anzahl an Sockelplätzen.');
    let successes = 0;
    let failures = 0;
    let stoppedForMaterials = false;
    const outcomes = [];
    const attempts = body.auto ? socketStones.length : 1;
    for (let index = 0; index < attempts; index += 1) {
      if ((target.socketSlots || 0) >= capacity) break;
      const socketStoneId = socketStones[index];
      const stoneIndex = inventoryIndex(save, socketStoneId);
      if (stoneIndex < 0 || save.inventory[stoneIndex].slot !== 'socketStone') throw new Error('Ein Sockelstein wurde nicht gefunden.');
      consumeInventoryItem(save, socketStoneId, 'socketStone');
      const socketLevel = target.socketSlots || 0;
      const chance = workshopSuccessChance(BALANCE.items.socketSuccessChanceByTarget.equipment[socketLevel] || 0, save);
      if (Math.random() * 100 < chance) {
        target.socketSlots = socketLevel + 1;
        target.sockets = [...(target.sockets || []), null];
        successes += 1;
        outcomes.push({ success: true, level: socketLevel, resultingLevel: target.socketSlots, capacity, chance });
      } else {
        failures += 1;
        outcomes.push({ success: false, level: socketLevel, resultingLevel: socketLevel, capacity, chance });
      }
      if (!body.auto) break;
    }
    stoppedForMaterials = Boolean(body.auto && (target.socketSlots || 0) < capacity && !save.inventory.some((item) => item.slot === 'socketStone'));
    response = { kind: 'socket', item: target, attempts: successes + failures, successes, failures, outcomes, stoppedForMaterials, state: save, message: successes ? 'Sockelritual abgeschlossen.' : 'Sockelritual fehlgeschlagen.' };
    save.questBook.counters.socketAttempts += response.attempts;
    save.questBook.counters.socketsOpened += successes;
    save.statistics.socketAttempts += response.attempts;
  } else throw new Error('Unbekannter Werkstattversuch.');
  captureEquipmentSlotProgress(save);
  return response;
}
async function localAction(body) {
  const save = normalizeSaveState(cloneState(state));
  if (!save.mainClass) throw new Error('Wähle zuerst deine Hauptklasse.');
  save.bossChallenge ||= { lastAttemptAt: 0, lastClaimedAt: 0 };
  const action = body.action;
  let response = {};
  if (save.workshopJob && ['equip-main', 'equip-companion', 'unequip'].includes(action)) {
    const locked = equipmentSlotEntries(save, true).find(entry => entry.item.id === save.workshopJob.targetId);
    const owner = action === 'equip-main' || (action === 'unequip' && (!body.owner || body.owner === 'main')) ? 'main' : body.class;
    if (locked && locked.owner === owner && locked.slot === body.slot) throw new Error('Stoppe zuerst den Werkstattauftrag für diesen Ausrüstungsplatz.');
  }
  if (save.workshopJob && ['upgrade', 'socket-slot', 'fuse-glyphs', 'enchant-rarity', 'enchant-mythic', 'upgrade-gems'].includes(action)) throw new Error('Beende zuerst den laufenden Werkstattauftrag.');
  if (action === 'enchant-affix') await settleWorkshopThrough(save, Date.now());
  if (action === 'workshop-start') {
    await settleWorkshopThrough(save, Date.now());
    createWorkshopJob(save, body);
    const job = save.workshopJob;
    const result = await settleWorkshopThrough(save, Date.now());
    response = { ...result, attempts: job.attempts, successes: job.successes, failures: job.failures,
      headless: job.headless, state: save };
  } else if (action === 'workshop-tick' || action === 'workshop-stop') {
    await settleWorkshopThrough(save, Date.now());
    if (action === 'workshop-stop' && save.workshopJob?.id === body.jobId) finishWorkshopJob(save, 'Manuell gestoppt.', Date.now());
    response = { state: save };
  } else if (action.startsWith('offline-')) {
    response = await offlineFarmAction(save, body);
  } else if (action === 'admin-simulate-offline-time') {
    response = await offlineFarmAction(save, { action: 'offline-simulate-time' });
  } else if (action === 'visit-shop') {
    response = { state: save, message: 'Marktangebote gespeichert.' };
  } else if (action === 'claim-hunting-event') {
    const hunt = save.huntingEvent;
    if (!hunt || body.eventId !== hunt.id) throw new Error('Dieser Jagdauftrag ist nicht mehr aktiv.');
    const tier = huntingEventRewardTier(hunt);
    if (tier < 0) throw new Error(`Erreiche zuerst ${HUNTING_EVENT_RULES.targetKills} Monsterkills im vorgegebenen Gebiet auf der vorgegebenen Schwierigkeitsstufe.`);
    const rewards = Object.entries(HUNTING_EVENT_RULES.rewards).map(([group, quantity]) => {
      const item = makeLuckyBoxItem(group);
      item.quantity = quantity * (tier + 1);
      return item;
    });
    storeRewardItems(save, rewards, 'Jagdauftrag');
    hunt.claimed = true;
    response = { rewards, tier, areaId: hunt.areaId, state: save, message: 'Jagd abgeschlossen. Das nächste Event beginnt beim regulären Zeitwechsel.' };
  } else if (action === 'update-settings') {
    if (body.key === 'workshopAnimations') {
      if (typeof body.value !== 'boolean') throw new Error('Die Einstellung benötigt einen Wahrheitswert.');
      for (const key of ['forgeAnimations', 'socketAnimations', 'enchantAnimations']) save.settings[key] = body.value;
    } else if (['autoSkillsDefault', 'compactDamageNumbers', 'autoSellNonSet', 'forgeAnimations', 'socketAnimations', 'enchantAnimations'].includes(body.key)) {
      if (typeof body.value !== 'boolean') throw new Error('Die Einstellung benötigt einen Wahrheitswert.');
      save.settings[body.key] = body.value;
    } else if (body.key === 'lootCollectionRules') {
      if (!validLootCollectionRules(body.value)) throw new Error('Ungültige Sammelregeln. Aktiviere mindestens eine vollständige Regel.');
      save.settings.lootCollectionRules = { enabled: body.value.enabled, rules: body.value.rules.map(rule => ({
        slot: rule.slot, rarity: rule.rarity, set: rule.set, minGreater: rule.minGreater,
      })) };
    } else if (body.key === 'towerLoot') {
      if (!(BALANCE.loot.towerLootChoices || []).some(choice => choice.id === body.value)) throw new Error('Unbekannte Turmbeute.');
      save.settings.towerLoot = body.value;
    } else if (body.key === 'autoSellRarity') {
      if (!RARITIES.some((rarity) => rarity.color === body.rarity) || typeof body.value !== 'boolean') throw new Error('Ungültiger Lootfilter.');
      const selected = new Set(save.settings.autoSellRarities);
      if (body.value) selected.add(body.rarity);
      else selected.delete(body.rarity);
      save.settings.autoSellRarities = [...selected];
    } else throw new Error('Unbekannte Einstellung.');
    response = { state: save, message: 'Einstellung gespeichert.' };
  } else if (action === 'record-combat-stats') {
    recordOfflineFarmSample(save, body);
    const combatStats = body.statistics || {};
    if (['area', 'tower'].includes(body.mode)) grantWeaponExperience(save, combatStats);
    if (body.mode === 'area') advanceHuntingEvent(save, body.area, Number(body.deepTier) || 0, combatStats.huntingKills, body.huntingEventId);
    save.statistics.damageDealt += Math.max(0, Number(combatStats.damageDealt) || 0);
    save.statistics.deaths += Math.max(0, Number(combatStats.deaths) || 0);
    save.statistics.highestHit = Math.max(save.statistics.highestHit, Number(combatStats.highestHit) || 0);
    response = { state: save, message: 'Kampfstatistik aktualisiert.' };
  } else if (action === 'deep-of-dark-ascend') {
    const rules = BALANCE.deepOfDark || {};
    const maximumTier = rules.maxTier || 3;
    if (save.deepOfDark.tier >= maximumTier) throw new Error(`${difficultyName(maximumTier)} ist bereits freigeschaltet.`);
    const clearedAreas = AREAS.filter((area) => save.deepOfDark.clearedAreas.includes(area.id)).length;
    if (clearedAreas < AREAS.length) throw new Error('Siege zuerst in allen sechs Gebieten, bevor du weiter in die Tiefe steigst.');
    save.deepOfDark.tier += 1;
    save.deepOfDark.clearedAreas = [];
    save.visitedAreas = [];
    response = { tier: save.deepOfDark.tier, state: save, message: `${difficultyName(save.deepOfDark.tier)} beginnt.` };
  } else if (action === 'boss-start') {
    if (battle) throw new Error('Es l\u00e4uft bereits ein Kampf.');
    const rules = BALANCE.bossChallenge;
    const now = Date.now();
    if ((save.mailbox || []).length > 0) throw new Error('Leere zuerst deinen Briefkasten, bevor du den Bosskampf startest.');
    const luckyBoxGroups = [...new Set(rules.luckyBoxGroups || BOX_GROUPS)].filter((group) => BOX_RULES?.[group]);
    if (!luckyBoxGroups.length) throw new Error('Fuer die Bossbelohnung sind keine Boxen konfiguriert.');
    const reservationItems = luckyBoxGroups.map((group) => makeLuckyBoxItem(group));
    const requiredSlots = inventorySlotsNeeded(save, reservationItems);
    const availableSlots = Math.max(0, save.inventoryCapacity - inventoryOccupiedSlots(save)) + Math.max(0, MAILBOX_CAPACITY - (save.mailbox || []).length);
    if (availableSlots < requiredSlots) throw new Error('Fuer den Bosskampf sind nicht genug Lagerplaetze für je eine Box jeder Art frei.');
    if (save.offlineFarm) save.offlineFarm.active = false;
    consumeDailyAttempt(save, 'boss');
    save.bossChallenge.lastAttemptAt = now;
    save.bossChallenge.reservedStorageSlots = requiredSlots;
    response = { startedAt: now, state: save, message: 'Bosskampf begonnen.' };
  } else if (action === 'boss-complete') {
    const rules = BALANCE.bossChallenge;
    const startedAt = save.bossChallenge.lastAttemptAt || 0;
    if (!startedAt || save.bossChallenge.lastClaimedAt === startedAt) throw new Error('Für diesen Bosskampf wurde bereits eine Belohnung vergeben.');
    if (Date.now() - startedAt < rules.durationSeconds * 1000) throw new Error('Der Bosskampf ist noch nicht vollständig abgeschlossen.');
    const damage = Math.max(0, Math.floor(Number(body.damage) || 0));
    if (!damage) throw new Error('Es wurde kein Schaden verursacht.');
    const rankRules = rules.rankThresholds || [{ name: 'Bronze I', minimumDamage: 1 }];
    const rankIndex = rankRules.reduce((best, rank, index) => damage >= (rank.minimumDamage ?? 1) ? index : best, -1);
    const rank = rankIndex >= 0 ? rankRules[rankIndex].name : 'Kein Rang';
    const ranksReached = rankIndex + 1;
    const rankSoulReward = ranksReached * Math.max(0, Number(rules.soulsPerRank) || 1000);
    const luckyBoxGroups = (rules.luckyBoxGroups || BOX_GROUPS).filter((group) => BOX_RULES?.[group]);
    const achievedTier = rankRules[rankIndex]?.tier;
    const tierNumber = rankIndex >= 0 ? [...new Set(rankRules.map(entry => entry.tier))].indexOf(achievedTier) + 1 : 0;
    const subrankNumber = rankIndex >= 0 ? rankRules.slice(0, rankIndex + 1).filter(entry => entry.tier === achievedTier).length : 0;
    const boxMultiplier = tierNumber * subrankNumber;
    if (boxMultiplier > 0 && !luckyBoxGroups.length) throw new Error('Für die Bossbelohnung ist keine Luckybox konfiguriert.');
    const boxRewardItems = [];
    if (boxMultiplier) {
      for (const group of luckyBoxGroups) {
        const item = makeLuckyBoxItem(group);
        item.quantity = randomInt(rules.luckyBoxesPerRank[0], rules.luckyBoxesPerRank[1]) * boxMultiplier;
        boxRewardItems.push(item);
      }
    }
    const luckyBoxRewards = storeRewardItems(save, boxRewardItems, 'Bossprüfung', true);
    save.bossChallenge.reservedStorageSlots = 0;
    const previousHighestRank = save.bossChallenge.highestRank ?? -1;
    if (rankIndex >= 0) save.bossChallenge.highestRank = Math.max(previousHighestRank, rankIndex);
    save.bossChallenge.bestDamage = Math.max(save.bossChallenge.bestDamage || 0, damage);
    const reward = applyCombatSoulBonus(Math.round(rankSoulReward * (1 + (partySkillTreeEffectValue('soul-drop-percent', save) + passiveEffectTotal('soul-drop-percent', save.mainClass, save)) / 100)), save);
    save.bossChallenge.lastClaimedAt = startedAt;
    save.bossChallenge.lastEndedAt = startedAt;
    addQuestTrackedSouls(save, reward);
    save.statistics.damageDealt = (save.statistics.damageDealt || 0) + damage;
    save.statistics.deaths += Math.max(0, Number(body.deaths) || 0);
    save.statistics.highestHit = Math.max(save.statistics.highestHit || 0, Number(body.highestHit) || 0);
    response = { damage, reward, rank, ranksReached, rankSoulReward, luckyBoxRewards, state: save, message: 'Bosskampf abgeschlossen.' };
  } else if (action === 'tower-start') {
    if (battle) throw new Error('Es l\u00e4uft bereits ein Kampf.');
    if (!towerUnlocked(save)) throw new Error('Der Turm ist noch versiegelt.');
    if (save.offlineFarm?.active && save.offlineFarm.mode === 'tower') throw new Error('Der bestehende Turmlauf muss zuerst fortgesetzt oder beendet werden.');
    consumeDailyAttempt(save, 'tower');
    armOfflineFarm(save, 'tower');
    response = { state: save, message: 'Turmlauf begonnen.' };
  } else if (action === 'use-boss-reset' || action === 'use-tower-reset') {
    if (currentView !== 'inventory') throw new Error('Zeitsteine kannst du im Inventar verwenden.');
    const mode = action === 'use-boss-reset' ? 'boss' : 'tower';
    const slot = mode === 'boss' ? 'bossReset' : 'towerReset';
    const { item } = requireInventoryItem(save, body.itemId);
    if (item.slot !== slot) throw new Error('Dieser Zeitstein passt nicht zu dieser Aktivität.');
    if (dailyAttemptStatus(mode, save).remaining) throw new Error('Es sind noch Versuche vorhanden.');
    if ((battle?.mode === mode && !battle.bossFinished) || (mode === 'tower' && save.offlineFarm?.mode === 'tower' && save.offlineFarm.active)) throw new Error('Beende zuerst den laufenden Versuch.');
    const consumed = consumeInventoryItem(save, item.id, slot);
    save.dailyAttempts[mode].bonus += 1;
    response = { item: consumed, state: save, message: 'Ein weiterer Versuch ist verfügbar.' };
  } else if (action === 'boss-cancel') {
    const combatStats = body.statistics || {};
    save.statistics.damageDealt += Math.max(0, Number(combatStats.damageDealt) || 0);
    save.statistics.deaths += Math.max(0, Number(combatStats.deaths) || 0);
    save.statistics.highestHit = Math.max(save.statistics.highestHit, Number(combatStats.highestHit) || 0);
    save.bossChallenge.reservedStorageSlots = 0;
    save.bossChallenge.lastEndedAt = save.bossChallenge.lastAttemptAt || 0;
    response = { state: save, message: 'Boss storage reservation released.' };
  } else if (action === 'open-lucky-box') {
    if (currentView !== 'inventory') throw new Error('Boxen kannst du im Inventar öffnen.');
    const { item: box } = requireInventoryItem(save, body.itemId);
    if (!BOX_GROUPS.includes(box.slot)) throw new Error('Dieser Gegenstand ist keine Box.');
    const boxGroup = box.slot;
    save.statistics.luckyBoxesOpened[boxGroup] = (save.statistics.luckyBoxesOpened[boxGroup] || 0) + 1;
    const reward = makeLuckyBoxReward(boxGroup, save);
    consumeInventoryItem(save, box.id, boxGroup);
    const rewardSouls = Math.max(0, Math.floor(Number(reward.souls) || 0));
    if (rewardSouls) addQuestTrackedSouls(save, rewardSouls);
    const rewardDestination = reward.item ? storeRewardItem(save, reward.item, 'Luckybox') : null;
    response = { boxGroup, boxName: box.name, rewardItem: reward.item || null, rewardSouls, rewardDestination, jackpot: Boolean(reward.jackpot), state: save, message: reward.item ? `${box.name}: ${reward.item.name}` : `${box.name}: +${rewardSouls} Seelen` };
  } else if (action === 'open-all-lucky-boxes') {
    if (currentView !== 'inventory') throw new Error('Boxen kannst du im Inventar öffnen.');
    const boxSlots = BOX_GROUPS;
    const opened = [];
    let blockedByStorage = false;
    while (true) {
      const box = save.inventory.find((entry) => boxSlots.includes(entry.slot));
      if (!box) break;
      const reward = makeLuckyBoxReward(box.slot, save);
      const inventoryBeforeOpen = cloneState(save.inventory);
      consumeInventoryItem(save, box.id, box.slot);
      if (reward.item && !canStoreRewardItem(save, reward.item)) {
        save.inventory = inventoryBeforeOpen;
        blockedByStorage = true;
        break;
      }
      const rewardDestination = reward.item ? storeRewardItem(save, reward.item, 'Luckybox') : null;
      const rewardSouls = Math.max(0, Math.floor(Number(reward.souls) || 0));
      if (rewardSouls) addQuestTrackedSouls(save, rewardSouls);
      save.statistics.luckyBoxesOpened[box.slot] = (save.statistics.luckyBoxesOpened[box.slot] || 0) + 1;
      opened.push({ boxGroup: box.slot, boxName: box.name, rewardItem: reward.item || null, rewardSouls, rewardDestination, jackpot: Boolean(reward.jackpot) });
    }
    if (!opened.length) {
      if (blockedByStorage) throw new Error('Kein Platz im Inventar oder Briefkasten für die Belohnung. Hole zuerst Gegenstände ab.');
      throw new Error('Du hast keine Luckyboxen im Inventar.');
    }
    const jackpotReward = opened.find((entry) => entry.jackpot) || null;
    response = { opened, openedCount: opened.length, blockedByStorage, jackpot: Boolean(jackpotReward), ...(jackpotReward || {}), state: save, message: `${opened.length} Luckyboxen geöffnet.` };
  } else if (action === 'battle') {
    response = resolveBattleRewards(save, body);
    recordOfflineFarmSample(save, body);
  } else if (action === 'claim-quest') {
    const stageIndex = Number(body.stageIndex);
    const stage = QUEST_STAGES[stageIndex];
    const quest = stage?.quests.find((entry) => entry.id === body.questId);
    if (!stage || !quest || !questStageAvailable(save, stageIndex)) throw new Error('Diese Queststufe ist noch nicht freigeschaltet.');
    if (!questComplete(save, quest)) throw new Error('Diese Quest ist noch nicht abgeschlossen.');
    if (save.questBook.claimed[quest.id]) throw new Error('Die Belohnung für diese Quest wurde bereits abgeholt.');
    const reward = applyWorldSoulBonus(questIndividualReward(stageIndex));
    save.questBook.claimed[quest.id] = true;
    addQuestTrackedSouls(save, reward, true);
    response = { reward, questId: quest.id, state: save, message: 'Questbelohnung abgeholt.' };
  } else if (action === 'claim-quest-board-task') {
    const board = save.questBook.board;
    const taskIndex = Number(body.taskIndex);
    const entry = board?.tasks?.[taskIndex];
    if (!entry || entry.claimed) throw new Error('Diese Auftragsbelohnung ist nicht verfügbar.');
    if (questBoardProgress(save, entry.quest) < entry.quest.target) throw new Error('Schließe zuerst dieses Auftragsziel ab.');
    const createdRewards = makeQuestBoardReward(save, entry.reward);
    const rewardItems = createdRewards ? (Array.isArray(createdRewards) ? createdRewards : [createdRewards]) : [];
    const storedRewards = rewardItems.length ? storeRewardItems(save, rewardItems, 'Auftrag') : [];
    const rewardItem = rewardItems[0] || null;
    const rewardDestination = storedRewards[0]?.destination || null;
    const soulAmount = entry.reward.type === 'souls' ? applyWorldSoulBonus(randomInt(entry.reward.min, entry.reward.max)) : 0;
    if (soulAmount) addQuestTrackedSouls(save, soulAmount, true);
    entry.claimed = true;
    const groupComplete = board.tasks.every((task) => task.claimed);
    if (groupComplete) {
      save.questBook.completedGroups = Math.max(save.questBook.completedGroups || 0, board.groupIndex + 1);
      save.questBook.board = makeQuestBoardGroup(board.groupIndex + 1, save);
    }
    response = { reward: entry.reward, rewardItem, rewardItems, rewardDestination, rewardDestinations: storedRewards.map((entry) => entry.destination), soulAmount, groupComplete, state: save, message: 'Auftragsbelohnung abgeholt.' };
  } else if (action === 'claim-quest-stage') {
    const stageIndex = Number(body.stageIndex);
    const stage = QUEST_STAGES[stageIndex];
    if (!stage || !questStageAvailable(save, stageIndex)) throw new Error('Diese Queststufe ist noch nicht freigeschaltet.');
    if (!questStageComplete(save, stageIndex)) throw new Error('Schließe erst alle fünf Quests dieser Stufe ab.');
    if (save.questBook.stageRewards[stageIndex]) throw new Error('Die Abschlussbelohnung wurde bereits abgeholt.');
    save.questBook.stageRewards[stageIndex] = true;
    save.questBook.unlockedStages = Math.max(save.questBook.unlockedStages, Math.min(QUEST_STAGES.length, stageIndex + 2));
    const reward = applyWorldSoulBonus(stage.reward);
    addQuestTrackedSouls(save, reward, true);
    response = { reward, stageIndex, state: save, message: 'Queststufe abgeschlossen.' };
  } else if (action === 'claim-contract-reward') {
    const readyCount = Math.floor(save.contracts.rewardProgress / contractRewardTarget());
    if (!readyCount) throw new Error('Schließe weitere Aufträge ab, bis der gemeinsame Fortschrittsbalken voll ist.');
    const rewardEach = contractRewardAmount(save);
    const reward = applyWorldSoulBonus(rewardEach * readyCount);
    const milestoneStart = save.contracts.rewardClaims;
    const milestoneEnd = Math.min(CONTRACT_MILESTONE_REWARDS.length, milestoneStart + readyCount);
    const milestoneRewards = CONTRACT_MILESTONE_REWARDS.slice(milestoneStart, milestoneEnd);
    const rewardItems = milestoneRewards.map((milestone) => makeContractMilestoneItem(save, milestone));
    const storedRewardItems = storeRewardItems(save, rewardItems, 'Auftrag');
    save.contracts.rewardProgress -= readyCount * contractRewardTarget();
    save.contracts.rewardClaims = milestoneEnd;
    addQuestTrackedSouls(save, reward, true);
    response = { reward, readyCount, rewardItems, storedRewardItems, state: save, message: 'Auftragsbelohnung abgeholt.' };
  } else if (action === 'claim-mailbox-item') {
    const mailIndex = save.mailbox.findIndex((entry) => entry.id === body.mailId);
    if (mailIndex < 0) throw new Error('Dieser Briefkasteneintrag ist nicht mehr vorhanden.');
    const mail = save.mailbox[mailIndex];
    if (inventoryOccupiedSlots(save) + inventorySlotsNeeded(save, [mail.item]) > save.inventoryCapacity) throw new Error('Dein Inventar ist voll. Schaffe zuerst einen freien Platz.');
    save.mailbox.splice(mailIndex, 1);
    addItemsToInventory(save, [mail.item]);
    response = { item: mail.item, state: save, message: 'Gegenstand aus dem Briefkasten abgeholt.' };
  } else if (action === 'activate-vip') {
    if (currentView !== 'inventory') throw new Error('VIP-Tickets kannst du im Inventar aktivieren.');
    const { item } = requireInventoryItem(save, body.itemId);
    if (item.slot !== 'vipTicket') throw new Error('Dieses Item ist kein VIP-Ticket.');
    const consumed = consumeInventoryItem(save, item.id, 'vipTicket');
    save.vipExpiresAt = Math.max(Date.now(), save.vipExpiresAt) + VIP_RULES.durationDays * 24 * 60 * 60 * 1000;
    response = { item: consumed, expiresAt: save.vipExpiresAt, state: save, message: 'VIP aktiviert.' };
  } else if (action === 'activate-powerup') {
    if (currentView !== 'inventory') throw new Error('Power-ups kannst du im Inventar aktivieren.');
    const { item } = requireInventoryItem(save, body.itemId);
    if (item.slot !== 'powerup' || !POWERUP_STATS.includes(item.powerupStat)) throw new Error('Dieses Item ist kein gültiges Power-up.');
    const consumed = consumeInventoryItem(save, item.id, item.slot);
    const stat = consumed.powerupStat;
    const activatedAt = Date.now();
    save.activePowerups = save.activePowerups.filter((entry) => entry.expiresAt > activatedAt);
    const active = save.activePowerups.find((entry) => entry.stat === stat && entry.expiresAt > activatedAt);
    if (active) {
      active.expiresAt += POWERUP_DURATION_MS;
    } else {
      save.activePowerups.push({ id: createItemId(), stat, value: 10, activatedAt, expiresAt: activatedAt + POWERUP_DURATION_MS });
    }
    const updated = active || save.activePowerups.at(-1);
    response = { item: consumed, active: updated, extended: Boolean(active), state: save, message: `${consumed.name} für weitere 15 Minuten aktiviert.` };
  } else if (action === 'activate-all-powerups') {
    const now = Date.now();
    save.activePowerups = save.activePowerups.filter((entry) => entry.expiresAt > now);
    const availableByStat = new Map();
    save.inventory.forEach((item) => {
      const stat = consumablePowerupStat(item);
      if (stat && !availableByStat.has(stat)) {
        availableByStat.set(stat, { id: item.id, slot: item.slot, stat });
      }
    });
    const available = [...availableByStat.values()];
    if (!available.length) throw new Error('Du hast keine Power-ups im Inventar.');
    const activatedByStat = new Map();
    available.forEach((item) => {
      consumeInventoryItem(save, item.id, item.slot);
      const active = save.activePowerups.find((entry) => entry.stat === item.stat);
      if (active) active.expiresAt += POWERUP_DURATION_MS;
      else save.activePowerups.push({ id: createItemId(), stat: item.stat, value: 10, activatedAt: now, expiresAt: now + POWERUP_DURATION_MS });
      activatedByStat.set(item.stat, { stat: item.stat, expiresAt: (active || save.activePowerups.at(-1)).expiresAt, quantity: 1 });
    });
    const activated = [...activatedByStat.values()];
    response = { activated, state: save, message: `${activated.length} Power-up-Typen aktiviert.` };
  } else if (action === 'buy-equipment-offer') {
    const index = save.shopEquipmentOffers.findIndex(item => item.id === body.offerId);
    if (index < 0) throw new Error('Dieses Ausrüstungsangebot ist nicht mehr verfügbar.');
    const item = save.shopEquipmentOffers[index];
    if (!partyCanEquipDrop(item, save)) throw new Error('Die Ausrüstung passt nicht zu deiner Kampfgruppe.');
    const cost = equipmentShopPrice(item);
    if (!cost || save.souls < cost) throw new Error('Du hast nicht genug Seelen für dieses Angebot.');
    addItemsToInventory(save, [item]);
    spendQuestTrackedSouls(save, cost);
    save.shopEquipmentOffers[index] = makeAreaEquipmentDrop(AREAS[highestUnlockedAreaIndex(save)].id, save);
    syncEquipmentShop(save);
    save.questBook.counters.purchases += 1;
    if (['ring', 'amulet', 'earring'].includes(item.slot)) save.questBook.counters.jewelryPurchases += 1;
    response = { item, cost, quantity: 1, state: save, message: 'Ausrüstung gekauft.' };
  } else if (action === 'buy') {
    if (!SHOP_OFFERS.some((offer) => offer.group === body.group && offer.purchasable !== false)) throw new Error('Dieses Marktangebot ist nicht verfügbar.');
    const quantity = Number(body.quantity);
    if (!Number.isInteger(quantity) || quantity < 1 || quantity > 1000) throw new Error('Gib eine gültige Kaufmenge ein (1 bis 1000).');
    const unitCost = shopPriceForLevel(partyLevel(save), body.group);
    const maxAffordable = maxAffordableShopQuantity(save, body.group);
    if (quantity > maxAffordable) throw new Error(`Mit deinen Seelen kannst du höchstens ${maxAffordable} Stück kaufen.`);
    const cost = unitCost * quantity;
    if (!unitCost) throw new Error('Unbekanntes Marktangebot.');
    if (save.souls < cost) throw new Error(`Du brauchst ${cost} Seelen für dieses Angebot.`);
    const rewards = Array.from({ length: quantity }, () => makeShopReward(body.group, save));
    const items = rewards.map((reward) => reward.item).filter(Boolean);
    const soulsRewarded = rewards.reduce((sum, reward) => sum + Math.max(0, Math.floor(Number(reward.souls) || 0)), 0);
    if (items.length) addItemsToInventory(save, items);
    if (soulsRewarded) addQuestTrackedSouls(save, soulsRewarded);
    spendQuestTrackedSouls(save, cost);
    save.questBook.counters.purchases += quantity;
    if (body.group === 'jewelry') save.questBook.counters.jewelryPurchases += quantity;
    if (BOX_RULES[body.group]) save.questBook.counters.luckyPurchases += quantity;
    response = { item: items[0], items, quantity, cost, group: body.group, state: save, message: `${quantity} Gegenstände gekauft.` };
  } else if (action === 'sell-inventory-category') {
    const ids = body.itemIds;
    if (!Array.isArray(ids) || !ids.length || ids.length > save.inventory.length
      || ids.some(id => typeof id !== 'string') || new Set(ids).size !== ids.length) throw new Error('Ungültige Verkaufsauswahl.');
    const allowed = new Set(inventorySaleCandidates(save, body.ownerClass, body.category).map(item => item.id));
    if (ids.some(id => !allowed.has(id))) throw new Error('Das Inventar hat sich geändert. Öffne die Verkaufsauswahl erneut.');
    const selected = new Set(ids);
    const sold = save.inventory.filter(item => selected.has(item.id));
    const value = sold.reduce((sum, item) => sum + itemSaleValue(item), 0);
    const count = sold.reduce((sum, item) => sum + Math.max(1, Math.floor(Number(item.quantity) || 1)), 0);
    save.inventory = save.inventory.filter(item => !selected.has(item.id));
    save.statistics.itemsSold += count;
    addQuestTrackedSouls(save, value);
    response = { count, value, category: body.category, state: save, message: 'Gegenstände verkauft.' };
  } else if (action === 'sell') {
    const { index, item } = requireInventoryItem(save, body.itemId);
    if (!['bow', 'sword', 'staff', 'shield', 'bell', 'helmet', 'chest', 'gloves', 'boots', 'ring', 'amulet', 'earring', 'glyph'].includes(item.slot)) {
      throw new Error('Materialien, Verbrauchsgegenstände und Luckyboxen können nicht verkauft werden.');
    }
    const value = itemSaleValue(item);
    save.inventory.splice(index, 1);
    save.statistics.itemsSold += Math.max(1, Number(item.quantity) || 1);
    addQuestTrackedSouls(save, value);
    const mythicStones = grantMythicSaleStones(save, item);
    response = { sold: item, value, mythicStones, state: save, message: 'Gegenstand verkauft.' };
  } else if (action === 'fuse-glyphs') {
    if (activeWorkshopJob || forgeAnimationInProgress) throw new Error('Warte, bis der aktuelle Werkstattvorgang beendet ist.');
    const ids = body.itemIds;
    if (!Array.isArray(ids) || ids.length !== 3 || new Set(ids).size !== 3 || ids.some(id => typeof id !== 'string')) throw new Error('Wähle drei einzelne Glyphen aus deinem Inventar. Gleiche Glyphentypen sind erlaubt.');
    const ingredients = ids.map(id => save.inventory.find(item => item.id === id));
    if (ingredients.some(item => !item || item.slot !== 'glyph')) throw new Error('Alle drei Glyphen müssen noch im Inventar liegen. Angelegte Glyphen werden nicht verwendet.');
    const item = rollGreaterAffixes(makeGlyph(choose(GLYPH_DEFINITIONS)), save, { includeFixed: true, ignoreDeepRequirement: true });
    save.inventory = save.inventory.filter(entry => !ids.includes(entry.id));
    addItemsToInventory(save, [item]);
    response = { kind: 'glyph-fusion', item, consumed: ingredients, state: save, outcomes: [{ success: true }], message: 'Drei Glyphen zu einer neuen Glyphe kombiniert.' };
  } else if (action === 'upgrade') {
    response = applyWorkshopAttempt(save, body);
  } else if (action === 'enchant-mythic') {
    const target = requireWorkshopItem(save, body.itemId);
    const quote = mythicAscensionQuote(save, target);
    if (!quote.eligible) throw new Error('Wähle ein angelegtes legendäres Ausrüstungsteil oder eine legendäre Glyphe.');
    if (!quote.levelReady) throw new Error(`Der Ausrüstungsplatz muss auf +${quote.requiredSlotLevel} sein.`);
    if (!quote.possible) throw new Error(`Du benötigst ${quote.rarityStoneCost} Seltenheitssteine und ${quote.mythicStoneCost} mystische Aufwertungssteine.`);
    for (const [slot, amount] of [['rarityStone', quote.rarityStoneCost], ['mythicUpgradeStone', quote.mythicStoneCost]]) {
      stackUnitIds(save, slot).slice(0, amount).forEach(id => consumeInventoryItem(save, id, slot));
    }
    const success = Math.random() < quote.successChance;
    const previousRarity = target.rarity;
    if (success) {
      ascendEquipmentToMythic(target);
      save.statistics.raritiesUpgraded += 1;
      save.questBook.counters.raritiesUpgraded += 1;
    }
    response = { kind: 'enchant-rarity', mythicAscension: true, success, item: target, previousRarity, outcomes: [{ success }], state: save,
      message: success ? 'Der Gegenstand ist jetzt mystisch.' : 'Mystische Aufwertung fehlgeschlagen. Beide Materialien wurden verbraucht.' };
  } else if (action === 'enchant-rarity') {
    const target = requireWorkshopItem(save, body.itemId);
    if (!target || !AFFIX_POOLS[target.slot]) throw new Error('Wähle ein Ausrüstungsteil.');
    if (target.rarityColor === 'legendary') {
      if (!canUpgradeLegendaryAffix(target)) throw new Error('Nur legendäre Ausrüstung ohne Greater Affix und ohne bereits genutzte Greater-Aufwertung ist erlaubt.');
      const stone = requireInventoryItem(save, body.stoneId).item;
      if (stone.slot !== 'rarityStone') throw new Error('Dafür wird ein Seltenheitsstein benötigt.');
      const candidates = target.affixes.map((affix, index) => ({ affix, index })).filter(({ affix }) => !affix.fixed && AFFIX_RANGES[affix.stat]);
      const { affix, index } = choose(candidates);
      const baseValue = greaterAffixBaseValue(affix.stat);
      consumeInventoryItem(save, stone.id, 'rarityStone');
      target.affixes[index] = { ...affix, greater: true, baseValue, value: affixValueAtUpgrade({ ...affix, baseValue }, target.upgradeLevel) };
      target.greaterUpgradeUsed = true;
      response = { kind: 'enchant-rarity', greaterUpgrade: true, item: target, affix: target.affixes[index], affixIndex: index, previousRarity: target.rarity, state: save, outcomes: [{ success: true }], message: 'Ein zufälliger Affix ist jetzt ein Greater Affix.' };
    } else {
      const currentIndex = RARITY_ENCHANT_ORDER.indexOf(target.rarityColor);
      if (currentIndex < 0 || currentIndex >= RARITY_ENCHANT_ORDER.length - 1) throw new Error('Dieses Teil hat bereits die höchste Seltenheit.');
      const stone = requireInventoryItem(save, body.stoneId).item;
      if (stone.slot !== 'rarityStone') throw new Error('Dafür wird ein Seltenheitsstein benötigt.');
      const nextColor = RARITY_ENCHANT_ORDER[currentIndex + 1];
      const nextRarity = RARITIES.find((rarity) => rarity.color === nextColor);
      if (!nextRarity) throw new Error('Die nächste Seltenheit ist nicht konfiguriert.');
      consumeInventoryItem(save, stone.id, 'rarityStone');
      const desiredCount = BALANCE.items.affixCountByRarity[nextColor] ?? 0;
      const previousColor = target.rarityColor;
      const upgradeMultiplier = Math.pow(BALANCE.items.upgradeBaseStatMultiplier, target.upgradeLevel || 0);
      const retainedAffixes = (target.affixes || []).map((affix) => {
        if (affix.greater) {
          const baseValue = greaterAffixBaseValue(affix.stat);
          return { ...affix, baseValue, value: affixValueAtUpgrade({ ...affix, baseValue }, target.upgradeLevel) };
        }
        const [oldMin, oldMax] = AFFIX_RANGES?.[affix.stat] || [1, 1];
        const [newMin, newMax] = AFFIX_RANGES?.[affix.stat] || [1, 1];
        const oldBaseValue = Number.isFinite(affix.baseValue)
          ? affix.baseValue
          : (Number(affix.value) || oldMin) / affixUpgradeMultiplier(target.upgradeLevel);
        const rollProgress = oldMax > oldMin ? Math.max(0, Math.min(1, (oldBaseValue - oldMin) / (oldMax - oldMin))) : 1;
        const baseValue = Math.max(newMin, Math.round(newMin + rollProgress * (newMax - newMin)));
        return { ...affix, baseValue, value: affixValueAtUpgrade({ ...affix, baseValue }, target.upgradeLevel) };
      });
      const preserveBaseStatRoll = (type, baseKey, finalKey) => {
        const currentBase = Number.isFinite(target[baseKey])
          ? target[baseKey]
          : Number.isFinite(target[finalKey]) ? target[finalKey] / upgradeMultiplier : null;
        if (currentBase === null) return;
        const oldRange = baseItemStatRange(target.slot, previousColor, type) || [currentBase, currentBase];
        const newRange = baseItemStatRange(target.slot, nextColor, type);
        if (!newRange) return;
        const progress = oldRange[1] > oldRange[0]
          ? Math.max(0, Math.min(1, (currentBase - oldRange[0]) / (oldRange[1] - oldRange[0])))
          : 1;
        target[baseKey] = oldRange[1] > oldRange[0]
          ? Math.round(newRange[0] + progress * (newRange[1] - newRange[0]))
          : randomInt(newRange[0], newRange[1]);
        target[finalKey] = Math.round(target[baseKey] * upgradeMultiplier);
      };
      preserveBaseStatRoll('weaponDamage', 'baseWeaponDamage', 'weaponDamage');
      preserveBaseStatRoll('armorDefense', 'baseArmorDefense', 'armorDefense');
      target.affixes = retainedAffixes;
      const usedStats = retainedAffixes.map((affix) => affix.stat);
      while (target.affixes.length < desiredCount && (allowsRepeatedAffixes(target.slot) || usedStats.length < AFFIX_POOLS[target.slot].length)) {
        const affix = rollAffix(target.slot, allowsRepeatedAffixes(target.slot) ? [] : usedStats);
        usedStats.push(affix.stat);
        affix.value = affixValueAtUpgrade(affix, target.upgradeLevel);
        target.affixes.push(affix);
      }
      target.rarity = nextRarity.name;
      target.rarityColor = nextColor;
      save.statistics.raritiesUpgraded += 1;
      save.questBook.counters.raritiesUpgraded += 1;
      response = { kind: 'enchant-rarity', item: target, previousRarity: RARITIES.find((rarity) => rarity.color === RARITY_ENCHANT_ORDER[currentIndex])?.name, state: save, outcomes: [{ success: true }], message: 'Seltenheit erhöht.' };
    }
  } else if (action === 'set-enchant-exclusions') {
    const target = requireWorkshopItem(save, body.itemId, { allowPet: true });
    if (!target || (!AFFIX_POOLS[target.slot] && target.slot !== 'pet')) throw new Error('Wähle ein Ausrüstungsteil oder Begleittier.');
    if (!Array.isArray(body.excluded) || body.excluded.some(stat => !enchantAffixPool(target).includes(stat))) throw new Error('Ungültige Affixauswahl.');
    const index = Number(body.affixIndex);
    if (!Number.isInteger(index) || !target.affixes?.[index]) throw new Error('Wähle ein vorhandenes Affix.');
    const quote = enchantAffixQuote(save, target, index, body.excluded);
    if (!quote.candidates.length) throw new Error('Mindestens ein neuer Affixtyp muss möglich bleiben.');
    save.settings.enchantExcludedAffixes[quote.group] = [...new Set(body.excluded)];
    response = { state: save, message: 'Affix-Ausschlüsse gespeichert.' };
  } else if (action === 'enchant-affix') {
    const goal = body.autoGoal;
    if (!goal) response = applyEnchantAffixAttempt(save, body);
    else {
      const target = requireWorkshopItem(save, body.itemId, { allowPet: true });
      const index = Number(body.affixIndex);
      if (!Number.isInteger(index) || !target.affixes?.[index]) throw new Error('Wähle ein vorhandenes Affix.');
      if (target.slot !== 'pet' && !isMythicEquipment(target) && Number.isInteger(target.enchantAffixIndex) && target.enchantAffixIndex !== index) throw new Error('Dieser Affixplatz ist nicht umprägbar.');
      if (!enchantAffixPool(target).includes(goal.stat) || !Number.isFinite(goal.minimum) || goal.minimum < 0) throw new Error('Ungültiges Affixziel.');
      const maximum = affixRangeFor(target, goal.stat, { greater: isMythicEquipment(target) })[1];
      if (goal.minimum > maximum) throw new Error(`Der Mindestwert darf höchstens ${formatRuleNumber(maximum)} betragen.`);
      const matched = () => target.affixes[index].stat === goal.stat && target.affixes[index].value >= goal.minimum;
      const initial = enchantAffixQuote(save, target, index);
      const excluded = save.settings.enchantExcludedAffixes?.[initial.group] || [];
      const occupied = target.slot !== 'pet' && !allowsRepeatedAffixes(target.slot) && target.affixes.some((affix, position) => position !== index && affix.stat === goal.stat);
      if (!matched() && (excluded.includes(goal.stat) || occupied)) throw new Error('Der gewünschte Affixtyp ist ausgeschlossen oder auf einem anderen Platz belegt.');
      let attempts = 0;
      let cost = 0;
      while (attempts < 50 && !matched()) {
        const quote = enchantAffixQuote(save, target, index);
        if (!quote.candidates.length || !quote.canAfford) break;
        const stone = save.inventory.find(item => item.slot === 'affixStone');
        const result = applyEnchantAffixAttempt(save, { ...body, stoneId: stone.id });
        attempts++;
        cost += result.cost;
      }
      const next = enchantAffixQuote(save, target, index);
      const stopReason = matched() ? 'Ziel erreicht.' : next.mythicStones < next.mythicStoneCost ? 'Nicht genug mystische Aufwertungssteine für den nächsten Versuch.' : next.available < next.cost ? 'Nicht genug Umprägungssteine für den nächsten Versuch.' : !next.candidates.length ? 'Keine möglichen Affixtypen.' : null;
      response = { kind: 'enchant-affix', state: save, item: target, affix: target.affixes[index], previousStat: initial.current,
        outcomes: attempts ? [{ success: true }] : [], attempts, cost, mythicStoneCost: attempts * initial.mythicStoneCost, matched: matched(), stopReason };
    }
  } else if (action === 'upgrade-gems') {
    const quote = gemUpgradeQuote(save, body.itemId);
    if (!quote || !quote.profile) throw new Error('Wähle einen Edelstein aus deinem Inventar.');
    if (!quote.nextRarity) throw new Error('Legendär ist die höchste Edelstein-Seltenheit.');
    const quantity = body.all === true ? quote.maxUpgrades : Number(body.quantity ?? 1);
    if (!Number.isSafeInteger(quantity) || quantity < 1 || quantity > quote.maxUpgrades) throw new Error(`Du brauchst jeweils ${quote.ratio} gleiche Edelsteine derselben Seltenheit.`);
    let remaining = quantity * quote.ratio;
    quote.stacks.forEach(stack => {
      const taken = Math.min(remaining, Math.max(1, Math.floor(Number(stack.quantity) || 1)));
      stack.quantity = Math.max(1, Math.floor(Number(stack.quantity) || 1)) - taken;
      remaining -= taken;
    });
    save.inventory = save.inventory.filter(item => item.quantity !== 0);
    const item = makeGem('weaponGem', save, quote.nextRarity.color, quote.profile.profile);
    item.quantity = quantity;
    addItemsToInventory(save, [item]);
    const stored = save.inventory.find(entry => stackKey(entry) === stackKey(item));
    response = { item, quantity, consumed: quantity * quote.ratio, previousRarity: quote.gem.rarity, profile: quote.profile.profile, nextGemId: stored.id, state: save, message: 'Edelsteine aufgewertet.' };
  } else if (action === 'socket-slot') {
    response = applyWorkshopAttempt(save, body);
  } else if (action === 'socket-gem') {
    const target = requireWorkshopItem(save, body.itemId);
    const gem = requireInventoryItem(save, body.gemId).item;
    if (!target) throw new Error('Ausrüstungsteil nicht gefunden.');
    if (!socketCapacityForSlot(target.slot, target)) throw new Error('Nur Waffen, Schilde und Rüstung können gesockelt werden.');
    const socketIndex = Number(body.socketIndex);
    if (!Number.isInteger(socketIndex) || socketIndex < 0 || socketIndex >= (target.socketSlots || 0)) throw new Error('Dieser Sockelplatz wurde noch nicht geöffnet.');
    if (target.sockets?.[socketIndex]) throw new Error('Dieser Sockel ist bereits belegt.');
    if (gem.slot !== 'weaponGem') throw new Error('Wähle einen Edelstein.');
    const socketGem = consumeInventoryItem(save, gem.id, gem.slot);
    target.sockets ||= Array(target.socketSlots || 0).fill(null);
    target.sockets[socketIndex] = socketGem;
    save.questBook.counters.gemsSocketed += 1;
    response = { item: target, gem: socketGem, state: save, message: 'Edelstein eingesetzt.' };
  } else if (action === 'unsocket-gem') {
    const target = requireWorkshopItem(save, body.itemId);
    if (!target) throw new Error('Ausrüstungsteil nicht gefunden.');
    const socketIndex = Number(body.socketIndex);
    const gem = target.sockets?.[socketIndex];
    if (!gem) throw new Error('Dieser Sockel ist leer.');
    target.sockets[socketIndex] = null;
    addItemsToInventory(save, [gem]);
    response = { item: target, gem, state: save, message: 'Edelstein wurde entnommen.' };
  } else if (action === 'equip-main') {
    const { index, item } = requireInventoryItem(save, body.itemId);
    const slot = body.slot;
    if (!validateMainEquipment(save, item, slot)) throw new Error('Dieser Gegenstand passt nicht zu deiner Klasse oder in diesen Ausrüstungsslot.');
    const displaced = [];
    if (save.equipment.main[slot]) displaced.push(save.equipment.main[slot]);
    if (inventoryOccupiedSlots(save) - 1 + displaced.length > save.inventoryCapacity) throw new Error('Dein Inventar braucht Platz für die verdrängte Ausrüstung.');
    save.inventory.splice(index, 1);
    displaced.forEach((oldItem) => { detachEquipmentSlotProgress(oldItem); returnToInventory(save, oldItem); });
    save.equipment.main[slot] = item;
    attachEquipmentSlotProgress(save, 'main', slot, item);
    response = { state: save, message: 'Gegenstand ausgerüstet.' };
  } else if (action === 'equip-companion') {
    const { index, item } = requireInventoryItem(save, body.itemId);
    const className = body.class;
    const slot = body.slot;
    if (!CLASSES[className] || className !== save.activeCompanion || !validateEquipmentForClass(save, item, slot, className)) throw new Error('Dieser Gegenstand passt nicht zum gewählten Gefährten.');
    const companion = save.equipment.companions[className] || {};
    const displaced = companion[slot];
    if (inventoryOccupiedSlots(save) - 1 + (displaced ? 1 : 0) > save.inventoryCapacity) throw new Error('Dein Inventar braucht Platz für die verdrängte Ausrüstung.');
    save.inventory.splice(index, 1);
    if (displaced) { detachEquipmentSlotProgress(displaced); returnToInventory(save, displaced); }
    companion[slot] = item;
    save.equipment.companions[className] = companion;
    attachEquipmentSlotProgress(save, className, slot, item);
    response = { state: save, message: 'Gegenstand ausgerüstet.' };
  } else if (action === 'unequip') {
    const owner = body.owner || 'main';
    if (owner === 'companion') {
      const className = body.class;
      const slot = body.slot;
      if (className !== save.activeCompanion) throw new Error('Dieser Gefährte ist nicht ausgewählt.');
      const equipped = save.equipment.companions[className]?.[slot];
      if (!equipped) throw new Error('Der Slot ist bereits leer.');
      if (inventoryOccupiedSlots(save) >= save.inventoryCapacity) throw new Error('Dein Inventar ist voll.');
      assertBossStorageReservation(save, 1);
      detachEquipmentSlotProgress(equipped);
      save.inventory.push(equipped);
      delete save.equipment.companions[className][slot];
    } else {
      const slot = body.slot;
      const equipped = save.equipment.main[slot];
      if (!equipped) throw new Error('Der Slot ist bereits leer.');
      if (inventoryOccupiedSlots(save) + 1 > save.inventoryCapacity) throw new Error('Dein Inventar ist voll.');
      assertBossStorageReservation(save, 1);
      detachEquipmentSlotProgress(equipped);
      save.inventory.push(equipped);
      delete save.equipment.main[slot];
    }
    response = { state: save, message: 'Gegenstand abgelegt.' };
  } else if (action === 'companion-skill') {
    const className = body.class;
    const skillType = body.skillType;
    if (!CLASSES[className] || !['passive', 'active'].includes(skillType) || ![0, 1, 2].includes(Number(body.skillIndex))) throw new Error('Invalid companion skill selection.');
    if (skillType !== 'active') throw new Error('Passive werden direkt im Skilltree gelernt.');
    if (![save.mainClass, save.activeCompanion].includes(className)) throw new Error('Dieser Charakter ist nicht in deiner Gruppe.');
    save.companions[className].activeSkillIndex = Number(body.skillIndex);
    response = { state: save, message: 'Companion skill selection updated.' };
  } else if (action === 'select-companion') {
    const className = body.class;
    if (!CLASSES[className] || className === save.mainClass) throw new Error('Wähle eine andere Klasse als deine Hauptklasse.');
    save.activeCompanion = className;
    response = { state: save, message: 'Gefährte ausgewählt.' };
  } else if (action === 'admin-grant-souls') {
    const amount = 1000000000;
    save.souls += amount;
    save.statistics.soulsEarned += amount;
    response = { amount, state: save };
  } else if (action === 'admin-create-item') {
    const [slot, selection, profile] = String(body.slot || '').split('::');
    const quantity = Number(body.quantity ?? 1);
    const glyphDefinition = slot === 'glyph' ? GLYPH_DEFINITIONS.find(definition => definition.id === selection) : null;
    const isGlyph = slot === 'glyph';
    const maxUpgrade = BALANCE.items.maxUpgradeLevel;
    const requestedUpgrade = body.maxUpgrade === true ? maxUpgrade : 0;
    const itemFactories = {
      vipTicket: makeVipTicket,
      towerLootBoost: () => makePowerup('Droprate'), // Compatibility with old admin requests.
      upgradeStone: makeUpgradeStone,
      mythicUpgradeStone: makeMythicUpgradeStone,
      socketStone: makeSocketStone,
      rarityStone: () => makeEnchantmentStone('rarityStone'),
      affixStone: () => makeEnchantmentStone('affixStone'),
      bossReset: makeBossResetConsumable,
      towerReset: makeTowerResetConsumable,
      ...Object.fromEntries(Object.keys(BOX_RULES).filter(group => SLOT_DATA[group]).map(group => [group, () => makeLuckyBoxItem(group)])),
    };
    if (slot === 'powerup') {
      if (!POWERUP_STATS.includes(selection)) throw new Error('Wähle ein gültiges Power-up.');
      itemFactories.powerup = () => makePowerup(selection);
    }
    const requestedRarity = ['weaponGem', 'armorGem'].includes(slot) && selection ? selection : body.rarity;
    const rarity = itemFactories[slot]
      ? { name: 'Material', color: 'common' }
      : RARITIES.find((entry) => entry.name === requestedRarity || entry.color === requestedRarity);
    const requestedAffixes = Array.isArray(body.affixes) ? body.affixes.map(String).filter(Boolean) : [];
    const requestedSocketCount = body.maxSockets === true ? socketCapacityForSlot(slot) : 0;
    const requestedSocketGem = String(body.socketGem || '');
    if ((!SLOT_DATA[slot] && slot !== 'powerup') || (!AFFIX_POOLS[slot] && !isGlyph && !itemFactories[slot] && !['weaponGem', 'armorGem'].includes(slot))) throw new Error('Dieser Gegenstandstyp ist nicht verfügbar.');
    if (isGlyph && !glyphDefinition) throw new Error('Wähle eine gültige Glyphe.');
    if (!rarity) throw new Error('Wähle eine gültige Seltenheit.');
    if (rarity.color === 'mythic' && !MYTHIC_ITEMS.equipmentSlots.includes(slot)) throw new Error('Diese Gegenstandsart kann nicht mystisch sein.');
    if (!Number.isInteger(quantity) || quantity < 1 || quantity > 9999) throw new Error('Die Menge muss zwischen 1 und 9.999 liegen.');
    if (!Number.isInteger(requestedUpgrade) || requestedUpgrade < 0 || requestedUpgrade > maxUpgrade) throw new Error(`Die Aufwertungsstufe muss zwischen 0 und +${maxUpgrade} liegen.`);
    const isGear = Boolean(AFFIX_POOLS[slot]) || isGlyph;
    if (isGlyph && requestedAffixes.length) throw new Error('Glyphen haben feste Affixe.');
    if (!isGear && requestedUpgrade > 0) throw new Error('Materialien können nicht aufgewertet werden.');
    if (!isGear && (requestedAffixes.length || requestedSocketCount)) throw new Error('Affixe und Sockel sind nur für Ausrüstung verfügbar.');
    if ((!allowsRepeatedAffixes(slot) && new Set(requestedAffixes).size !== requestedAffixes.length) || requestedAffixes.some((stat) => !AFFIX_POOLS[slot]?.includes(stat))) throw new Error('Die gewählten Affixe passen nicht zu diesem Ausrüstungstyp.');
    const standardSocketCapacity = isGear ? socketCapacityForSlot(slot) : 0;
    const socketCapacity = standardSocketCapacity;
    if (body.maxSockets === true && !socketCapacity) throw new Error('Nur Ausrüstung kann Sockel erhalten.');
    if (!Number.isInteger(requestedSocketCount) || requestedSocketCount < 0 || requestedSocketCount > socketCapacity) throw new Error(`Dieser Gegenstand kann höchstens ${socketCapacity} Sockel haben.`);
    const items = [];
    for (let index = 0; index < quantity; index += 1) {
      const item = itemFactories[slot]
        ? itemFactories[slot]()
        : slot === 'weaponGem' || slot === 'armorGem'
          ? makeGem(slot, save, rarity.name, profile || null)
          : isGlyph ? (rarity.color === 'mythic' ? ascendEquipmentToMythic(makeGlyph(glyphDefinition)) : makeGlyph(glyphDefinition)) : makeItem(slot, rarity.name);
      if (!itemFactories[slot]) {
        item.rarity = rarity.name;
        item.rarityColor = rarity.color;
      }
      if (isLevelWeapon(item)) {
        const level = Number(body.weaponLevel ?? 0);
        if (!Number.isInteger(level) || level < 0 || level > WEAPON_PROGRESSION.maxLevel) throw new Error('Waffenlevel muss zwischen 0 und 100 liegen.');
        item.weaponExperience = weaponExperienceThreshold(level);
        normalizeWeaponProgress(item);
      }
      if (isMythicEquipment(item)) {
        const level = Number(body.mythicUpgradeLevel ?? 0);
        if (!Number.isInteger(level) || level < 0 || level > MYTHIC_UPGRADES.maxUpgradeLevel) throw new Error(`Mystische Stufe muss zwischen 0 und ${MYTHIC_UPGRADES.maxUpgradeLevel} liegen.`);
        item.mythicUpgradeLevel = level;
      }
      const customName = String(body.name || '').trim().slice(0, 40);
      if (customName) item.name = customName;
      if (body.set && isGear) {
        const setName = String(body.set);
        const setData = ARMOR_SETS[setName] || JEWELRY_SETS[setName];
        const compatible = ['helmet', 'chest', 'gloves', 'boots'].includes(slot)
          ? Boolean(ARMOR_SETS[setName])
          : ['ring', 'amulet', 'earring'].includes(slot) && Boolean(JEWELRY_SETS[setName]);
        if (!setData || !compatible) throw new Error('Dieses Set passt nicht zu diesem Gegenstandstyp.');
        item.set = setName;
      }
      if (body.maxAffixRolls === true && item.baseWeaponDamage != null) {
        const [, maximumDamage] = baseItemStatRange(slot, item.rarityColor, 'weaponDamage');
        item.baseWeaponDamage = maximumDamage;
        item.weaponDamage = maximumDamage;
      }
      if (requestedAffixes.length) {
        const implicitOnly = rarity.color === 'common' && (item.baseWeaponDamage != null || item.baseArmorDefense != null);
        const maxAffixes = implicitOnly ? 0 : (BALANCE.items.affixCountByRarity[rarity.color] ?? 0);
        if (requestedAffixes.length > Math.min(4, maxAffixes)) throw new Error(`${rarity.name} erlaubt bei diesem Gegenstand höchstens ${Math.min(4, maxAffixes)} Affixe.`);
        item.affixes = requestedAffixes.map((stat) => {
          const [min, max] = AFFIX_RANGES?.[stat] || [1, 1];
          const baseValue = body.maxAffixRolls === true ? max : randomInt(min, max);
          return { stat, baseValue, value: baseValue };
        });
      } else if (body.maxAffixRolls === true && !isGlyph) {
        item.affixes = (item.affixes || []).map((affix) => {
          const [, max] = AFFIX_RANGES?.[affix.stat] || [1, 1];
          return { ...affix, ...(isMythicEquipment(item) ? { greater: false } : {}), baseValue: max, value: max };
        });
      }
      if (isGear && body.greaterAffixes === true) {
        item.affixes = (item.affixes || []).map((affix) => {
          if (affix.greater) return affix;
          if (affix.fixed && !isGlyph) return affix;
          const baseValue = affix.fixed || isMythicEquipment(item) ? (affix.baseValue ?? affix.value) * BALANCE.loot.greaterAffixMaxMultiplier : greaterAffixBaseValue(affix.stat);
          return { ...affix, greater: true, baseValue, value: baseValue };
        });
      }
      if (requestedSocketCount > 0) {
        item.socketSlots = requestedSocketCount;
        item.sockets = Array.from({ length: requestedSocketCount }, () => {
          const token = requestedSocketGem;
          if (!token) return null;
          const [gemKind, gemRarity, profileName] = token.split('::');
          if (!['weaponGem', 'armorGem'].includes(gemKind)) throw new Error('Wähle einen Edelstein.');
          const gem = makeGem(gemKind, save, gemRarity, profileName);
          return { slot: gem.slot, name: gem.name, rarity: gem.rarity, rarityColor: gem.rarityColor, icon: gem.icon, affixes: gem.affixes };
        });
      }
      if (isGear && requestedUpgrade > 0) {
        const oldAffixMultiplier = affixUpgradeMultiplier(item.upgradeLevel || 0);
        const multiplier = Math.pow(BALANCE.items.upgradeBaseStatMultiplier, requestedUpgrade);
        item.upgradeLevel = requestedUpgrade;
        if (item.baseWeaponDamage != null) item.weaponDamage = Math.round(item.baseWeaponDamage * multiplier);
        if (item.baseArmorDefense != null) item.armorDefense = Math.round(item.baseArmorDefense * multiplier);
        item.affixes = (item.affixes || []).map((affix) => ({
          ...affix,
          baseValue: affix.baseValue ?? Math.round((Number(affix.value) || 0) / oldAffixMultiplier),
          value: affixValueAtUpgrade({ ...affix, baseValue: affix.baseValue ?? Math.round((Number(affix.value) || 0) / oldAffixMultiplier) }, requestedUpgrade),
        }));
      }
      if (isMythicEquipment(item)) normalizeAffixUpgrades(item);
      items.push(item);
    }
    addItemsToInventory(save, items);
    response = { count: quantity, slot, rarity: items[0].rarity, item: items[0], state: save };
  } else if (action === 'admin-reset-boss') {
    if (battle?.mode === 'boss' && !battle.bossFinished) throw new Error('Beende zuerst den Bosskampf.');
    save.dailyAttempts.boss.used = 0;
    response = { state: save };
  } else if (action === 'admin-set-slot-progress') {
    const entry = equipmentSlotEntries(save, true).find(entry => entry.owner === body.owner && entry.slot === body.slot);
    if (!entry) throw new Error('Wähle einen belegten Ausrüstungsplatz.');
    const level = Number(body.upgradeLevel);
    const sockets = Number(body.socketSlots);
    const capacity = socketCapacityForSlot(entry.item.slot, entry.item);
    if (!Number.isInteger(level) || level < 0 || level > BALANCE.items.maxUpgradeLevel) throw new Error('Ungültige Platz-Aufwertungsstufe.');
    if (!Number.isInteger(sockets) || sockets < 0 || sockets > capacity) throw new Error('Ungültige Anzahl geöffneter Sockel.');
    const progress = equipmentSlotProgress(save, entry.owner, entry.slot);
    const removedGems = (entry.item.sockets || []).slice(sockets).filter(Boolean);
    if (removedGems.length) addItemsToInventory(save, removedGems);
    progress.upgradeLevel = level;
    progress.socketSlots = sockets;
    progress.sockets = Array.from({ length: sockets }, (_, index) => entry.item.sockets?.[index] || null);
    applyEquipmentSlotProgress(entry.item, progress);
    response = { item: entry.item, state: save, message: 'Ausrüstungsplatz angepasst.' };
  } else if (action === 'admin-upgrade-all') {
    const maxLevel = BALANCE.items.maxUpgradeLevel;
    const capacity = BALANCE.items.socketCounts.equipment;
    let gemChoice = null;
    if (body.socketGem) {
      const [kind, color, profileName] = String(body.socketGem).split('::');
      const rarity = RARITIES.find(rarity => rarity.color === color);
      const profile = GEM_PROFILES.find(profile => profile.profile === profileName);
      if (kind !== 'weaponGem' || !rarity || !profile) throw new Error('Wähle einen gültigen Edelstein.');
      gemChoice = { rarity, profile };
    }
    const owners = ['main', save.activeCompanion].filter(Boolean);
    const returnedGems = [];
    let count = 0;
    owners.forEach(owner => {
      const className = owner === 'main' ? save.mainClass : owner;
      const gear = owner === 'main' ? save.equipment.main : save.equipment.companions[owner] || {};
      EQUIPMENT_PROGRESS_SLOTS.filter(slot => slot !== 'offHand' || className === 'warrior').forEach(slot => {
        const progress = equipmentSlotProgress(save, owner, slot);
        const previous = progress.sockets || [];
        progress.upgradeLevel = maxLevel;
        progress.socketSlots = capacity;
        progress.sockets = Array.from({ length: capacity }, (_, index) => {
          const existing = previous[index] || null;
          if (!gemChoice || (existing?.gemProfile === gemChoice.profile.profile && existing.rarityColor === gemChoice.rarity.color)) return existing;
          if (existing) returnedGems.push({ ...existing, id: existing.id || createItemId(), quantity: 1 });
          return makeGem('weaponGem', save, gemChoice.rarity.color, gemChoice.profile.profile);
        });
        if (gear[slot]) applyEquipmentSlotProgress(gear[slot], progress);
        count += 1;
      });
    });
    if (returnedGems.length) addItemsToInventory(save, returnedGems);
    response = { count, gemName: gemChoice ? `${gemChoice.rarity.name} · ${gemChoice.profile.profile}` : null, state: save };
  } else if (action === 'admin-grant-enchant-stones') {
    const slots = ['rarityStone', 'affixStone'];
    const missingStacks = slots.filter((slot) => !save.inventory.some((item) => item.slot === slot)).length;
    slots.forEach((slot) => {
      const stack = save.inventory.find((item) => item.slot === slot);
      if (stack) stack.quantity = Math.max(1, Math.floor(Number(stack.quantity) || 1)) + 100;
      else save.inventory.push({ ...makeEnchantmentStone(slot), quantity: 100 });
    });
    response = { quantityPerType: 100, state: save };
  } else if (action === 'admin-next-hundred-level') {
    const characters = [...new Set([save.mainClass, save.activeCompanion].filter((className) => CLASSES[className]))];
    if (!characters.length) throw new Error('Wähle zuerst Main und Gefährte aus.');
    const levels = {};
    const petLevels = {};
    normalizePet(save);
    characters.forEach((className) => {
      const currentLevel = characterLevel(className, save);
      const nextLevel = Math.ceil((currentLevel + 1) / 100) * 100;
      save.characterLevels[className] = nextLevel;
      levels[className] = nextLevel;
      const pet = petForClass(className, save);
      if (pet) {
        pet.level = Math.ceil((pet.level + 1) / 100) * 100;
        petLevels[className] = pet.level;
      }
    });
    normalizePet(save);
    save.level = characterLevel(save.mainClass, save);
    response = { levels, petLevels, state: save };
  } else if (action === 'admin-max-weapon-levels') {
    const weapons = equipmentSlotEntries(save, true).map(entry => entry.item).filter(isLevelWeapon);
    if (!weapons.length) throw new Error('Lege zuerst eine Waffe bei Main oder Gefährte an.');
    weapons.forEach(item => {
      item.weaponExperience = weaponExperienceThreshold(WEAPON_PROGRESSION.maxLevel);
      normalizeWeaponProgress(item);
    });
    response = { count: weapons.length, level: WEAPON_PROGRESSION.maxLevel, state: save };
  } else if (action === 'skill-tree-allocate') {
    const className = String(body.class || '');
    const node = SKILL_TREE_NODES.find((entry) => entry.id === body.nodeId);
    if (![save.mainClass, save.activeCompanion].includes(className)) throw new Error('Wähle deinen Main oder aktiven Gefährten aus.');
    if (!node || node.id === 'origin' || !node.effect) throw new Error('Dieser Knoten kann keinen Skillpunkt erhalten.');
    const classTree = save.skillTree[className] ||= { nodes: {} };
    classTree.nodes ||= {};
    const currentPoints = Math.max(0, Number(classTree.nodes[node.id]) || 0);
    if (currentPoints >= node.maxPoints) throw new Error('Dieser Knoten ist bereits voll ausgebaut.');
    if (node.class && node.class !== className) throw new Error('Dieser legendäre Knoten gehört zu einer anderen Klasse.');
    const blockedChoice = classSkillChoiceBlockedReason(node, classTree.nodes, className);
    if (blockedChoice) throw new Error(blockedChoice);
    if (!skillTreeNodeUnlocked(node, classTree.nodes, className)) throw new Error(`Du benötigst zuerst Rang ${skillTreeRequiredParentPoints(node)} im Vorgängerknoten.`);
    const legendary = node.rarity === 'legendary';
    const legendaryNodes = SKILL_TREE_NODES.filter((entry) => entry.rarity === 'legendary');
    if (legendary && legendaryNodes.some(entry => entry.branch === node.branch && entry.id !== node.id && Number(classTree.nodes[entry.id]) > 0)) throw new Error('Pro Strang kannst du nur einen legendären Knoten wählen.');
    const available = earnedSkillTreePoints(className, save) - spentSkillTreePoints(className, save);
    const amount = body.points === 'max' ? Math.min(available, node.maxPoints - currentPoints) : Number(body.points ?? 1);
    if (!Number.isSafeInteger(amount) || amount < 1 || amount > available) throw new Error('Du hast nicht genug freie Skillpunkte.');
    if (currentPoints + amount > node.maxPoints) throw new Error('So viele Ränge passen nicht mehr in diesen Knoten.');
    classTree.nodes[node.id] = currentPoints + amount;

    response = { className, nodeId: node.id, points: currentPoints + amount, investedPoints: amount, state: save, message: `${node.name} verbessert.` };
  } else if (action === 'skill-tree-node-respec') {
    const className = String(body.class || '');
    if (![save.mainClass, save.activeCompanion].includes(className)) throw new Error('Wähle deinen Main oder aktiven Gefährten aus.');
    const quote = skillTreeNodeRespecQuote(className, String(body.nodeId || ''), save);
    if (!quote.nodes.length) throw new Error('Wähle einen eigenen Knoten mit investierten Punkten aus.');
    if (save.souls < quote.cost) throw new Error(`Du benötigst ${number(quote.cost)} Seelen, um diesen Knoten zurückzusetzen.`);
    spendQuestTrackedSouls(save, quote.cost);
    quote.nodes.forEach(node => delete save.skillTree[className].nodes[node.id]);
    response = { className, nodeId: body.nodeId, nodeNames: quote.nodes.map(node => node.name), refundedPoints: quote.refundedPoints, cost: quote.cost, state: save, message: `${quote.refundedPoints} Skillpunkte wurden zurückgegeben.` };
  } else if (action === 'skill-tree-respec') {
    const className = String(body.class || '');
    if (![save.mainClass, save.activeCompanion].includes(className)) throw new Error('Wähle deinen Main oder aktiven Gefährten aus.');
    const classTree = save.skillTree[className] ||= { nodes: {} };
    classTree.nodes ||= {};
    const spentPoints = Object.values(classTree.nodes).reduce((sum, value) => sum + Math.max(0, Number(value) || 0), 0);
    if (!spentPoints) throw new Error('In diesem Talentbaum sind keine Punkte investiert.');
    const cost = Math.max(0, Math.floor(Number(BALANCE.skillTree.respecCost) || 1000000));
    if (save.souls < cost) throw new Error(`Du benötigst ${number(cost)} Seelen, um alle Skillpunkte zurückzusetzen.`);
    spendQuestTrackedSouls(save, cost);
    classTree.nodes = {};
    delete save.companions[className].secondPassiveSkillIndex;
    response = { className, cost, state: save, message: `Alle Skillpunkte von ${CLASSES[className].label} wurden zurückgesetzt.` };
  } else if (action === 'pet-level-up') {
    const owner = String(body.class || save.mainClass);
    if (![save.mainClass, save.activeCompanion].includes(owner)) throw new Error('Wähle das Tier deines Mains oder Gefährten.');
    const pet = petForClass(owner, save);
    if (!pet) throw new Error('Dieser Charakter hat noch kein Begleittier.');
    const requested = Number(body.amount ?? 1);
    if (!Number.isSafeInteger(requested) || requested < 1 || requested > 10000) throw new Error('Wähle zwischen 1 und 10.000 Stufen.');
    let cost = 0, levelsBought = 0;
    while (levelsBought < requested) {
      const nextCost = groupLevelCost(pet.level + levelsBought);
      if (cost + nextCost > save.souls) break;
      cost += nextCost;
      levelsBought++;
    }
    if (!levelsBought) throw new Error('Du hast nicht genug Seelen für die nächste Stufe.');
    spendQuestTrackedSouls(save, cost);
    pet.level += levelsBought;
    normalizePet(save);
    response = { cost, levelsBought, level: pet.level, item: pet, state: save, message: pet.name + ' ist auf Stufe ' + pet.level + ' aufgestiegen.' };
  } else if (action === 'level-up') {
    const className = String(body.class || '');
    if (![save.mainClass, save.activeCompanion].includes(className)) throw new Error('Wähle deinen Main oder aktiven Gefährten zum Leveln aus.');
    const currentLevel = characterLevel(className, save);
    const requestedLevels = Math.max(1, Math.floor(Number(body.amount) || 1));
    let cost = 0;
    let levelsBought = 0;
    while (levelsBought < requestedLevels) {
      const nextCost = groupLevelCost(currentLevel + levelsBought);
      if (cost + nextCost > save.souls) break;
      cost += nextCost;
      levelsBought += 1;
    }
    if (!levelsBought) throw new Error('Du hast nicht genug Seelen für die nächste Stufe.');
    spendQuestTrackedSouls(save, cost);
    save.characterLevels[className] = currentLevel + levelsBought;
    save.level = characterLevel(save.mainClass, save);
    response = { cost, className, levelsBought, level: currentLevel + levelsBought, state: save, message: CLASSES[className].label + ' ist um ' + levelsBought + ' Stufe' + (levelsBought === 1 ? '' : 'n') + ' aufgestiegen.' };
  } else throw new Error('Unbekannte Aktion.');
  captureEquipmentSlotProgress(save);
  captureWorkshopBonuses(save);
  normalizeHuntingEvent(save);
  await writeSavedState(save);
  return response;
}
