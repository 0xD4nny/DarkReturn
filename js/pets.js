// Each character owns a permanent pet with independent progress and no inventory cost.
const PET_RULES = GAME_CONFIG.pets;
function petForClass(className, save = state) {
  const pet = save?.pets?.[className];
  return pet?.ownerClass === className ? pet : null;
}
function mainPet(save = state) { return petForClass(save?.mainClass, save); }
function partyPets(save = state) {
  return [...new Set([save?.mainClass, save?.activeCompanion])].map(owner => petForClass(owner, save)).filter(Boolean);
}
function selectedAltarPet() {
  return partyPets().find(pet => pet.ownerClass === selectedAltarPetOwner) || mainPet();
}
function petAffixCount(level) {
  return 1 + Math.floor(level / PET_RULES.affixEveryLevels);
}
function petAffixValueAtLevel(baseValue, level) {
  return Math.round(baseValue * (1 + level * PET_RULES.affixPercentPerLevel / 100) * 100) / 100;
}
function rollPetAffix(excludedStat = null, level = 1, excludedStats = []) {
  const stat = choose(PET_RULES.affixPool.filter(entry => entry !== excludedStat && !excludedStats.includes(entry)));
  const [min, max] = AFFIX_RANGES[stat];
  const baseValue = randomInt(min, max);
  return { stat, baseValue, value: petAffixValueAtLevel(baseValue, level) };
}
function normalizePet(save) {
  save.pets ||= {};
  // Preserve the main's existing pet when migrating the original single-pet save.
  if (save.pet?.ownerClass && !save.pets[save.pet.ownerClass]) save.pets[save.pet.ownerClass] = save.pet;
  delete save.pet;
  const owners = [...new Set([...Object.keys(save.pets), save.mainClass, save.activeCompanion])];
  for (const owner of owners) {
    const definition = PET_RULES.byClass[owner];
    if (!definition) continue;
    const pet = petForClass(owner, save) || { id: createItemId(), ownerClass: owner, level: 1, affixes: [] };
    pet.id ||= createItemId();
    pet.slot = 'pet';
    pet.name = definition.name;
    pet.rarity = 'Legendär';
    pet.rarityColor = 'legendary';
    pet.icon = SLOT_DATA.pet.icon;
    pet.upgradeLevel = 0;
    pet.level = Math.max(1, Math.floor(Number(pet.level) || 1));
    const count = petAffixCount(pet.level);
    pet.affixes = (pet.affixes || []).filter(affix => PET_RULES.affixPool.includes(affix.stat)).slice(0, count).map(affix => {
      const [min, max] = AFFIX_RANGES[affix.stat];
      const previousBase = affix.baseValue ?? affix.value;
      const normalBase = affix.greater ? previousBase / BALANCE.loot.greaterAffixMaxMultiplier : previousBase;
      const baseValue = Math.max(min, Math.min(max, Math.round(Number(normalBase) || min)));
      return { stat: affix.stat, baseValue, value: petAffixValueAtLevel(baseValue, pet.level) };
    });
    while (pet.affixes.length < count) pet.affixes.push(rollPetAffix(null, pet.level));
    delete pet.enchantAffixIndex;
    save.pets[owner] = pet;
  }
}
function petDefinition(pet = mainPet()) {
  return PET_RULES.byClass[pet?.ownerClass];
}
function petAttributeBonus(className, save = state) {
  const pet = petForClass(className, save);
  return pet ? pet.level * PET_RULES.attributePerLevel : 0;
}
function itemIconMarkup(item, className) {
  return item?.slot === 'pet'
    ? assetIconMarkup(petDefinition(item)?.asset, item.icon, className)
    : equipmentIconMarkup(item?.slot, item?.icon, className);
}
function petUpgradeQuote(requested = 1, ownerClass = selectedAltarPet()?.ownerClass) {
  const level = petForClass(ownerClass)?.level || 1;
  let max = 0, total = 0;
  while (max < 10000 && total + groupLevelCost(level + max) <= state.souls) {
    total += groupLevelCost(level + max++);
  }
  const amount = max ? Math.max(1, Math.min(max, Math.floor(Number(requested) || 1))) : 0;
  let cost = 0;
  for (let i = 0; i < amount; i++) cost += groupLevelCost(level + i);
  return { level, max, amount, cost };
}
function renderPetStatPreview(amount, ownerClass = selectedAltarPet()?.ownerClass) {
  const pet = petForClass(ownerClass);
  const definition = petDefinition(pet);
  const stats = [
    [definition.stat, pet.level * PET_RULES.attributePerLevel, (pet.level + amount) * PET_RULES.attributePerLevel],
    ['Affixe', petAffixCount(pet.level), petAffixCount(pet.level + amount)],
    ['Affixbonus (%)', pet.level * PET_RULES.affixPercentPerLevel, (pet.level + amount) * PET_RULES.affixPercentPerLevel],
  ];
  return stats.map(([label, before, after]) => `<div class="altar-stat-row"><span>${escapeHtml(label)}</span><span>${number(before)}</span><i aria-hidden="true">→</i><strong>${number(after)}</strong></div>`).join('');
}
function renderPetOffering() {
  const pet = selectedAltarPet();
  const info = petDefinition(pet);
  const quote = petUpgradeQuote(1, pet.ownerClass);
  return `<article class="altar-inspector" aria-label="Begleittier aufstufen">
    <header class="altar-inspector-heading"><span class="altar-inspector-icon">${itemIconMarkup(pet, 'altar-class-icon')}</span><div><h2>${escapeHtml(pet.name)}</h2><p>BEGLEITTIER · ${pet.ownerClass === state.mainClass ? 'MAIN' : 'GEFÄHRTE'}</p></div></header>
    <div class="altar-level-preview"><span>Stufe ${number(quote.level)}</span><i aria-hidden="true">→</i><strong data-level-target="pet">Stufe ${number(quote.level + quote.amount)}</strong></div>
    <div class="altar-stat-preview" data-altar-stats="pet">${renderPetStatPreview(quote.amount)}</div>
    <div class="altar-controls"><label for="altar-quantity-pet">Stufen</label><input class="ui-control ui-field ui-compact" id="altar-quantity-pet" type="number" min="${quote.max ? 1 : 0}" max="${quote.max}" step="1" value="${quote.amount}" data-altar-quantity="pet" ${quote.max ? '' : 'disabled'}>
    <div class="altar-presets" role="group" aria-label="Anzahl der Stufen">${['1', '10', 'max'].map(value => `<button class="ui-control ui-button ui-compact" type="button" data-altar-preset="${value}" ${quote.max ? '' : 'disabled'}>${value === 'max' ? 'Max' : value}</button>`).join('')}</div>
    <p class="altar-feedback" data-altar-feedback>${quote.max ? '' : `Für die nächste Stufe fehlen ${number(Math.max(0, groupLevelCost(quote.level) - state.souls))} Seelen.`}</p>
    <div class="altar-total"><span>Kosten</span><strong data-level-cost="pet">✧ ${number(quote.cost)} Seelen</strong></div></div>
    <button class="primary-button ui-control ui-button altar-ascend-button" type="button" data-level-up="pet" ${quote.max ? '' : 'disabled'}>AUFSTUFEN</button>
  </article>`;
}
function petAltarTabPortrait(pet) {
  const portrait = petDefinition(pet)?.portrait;
  const desktopPortrait = portrait
    ? `<img class="altar-pet-tab-image" src="${escapeHtml(portrait)}" alt="" draggable="false">`
    : itemIconMarkup(pet, 'altar-pet-tab-glyph');
  return `${desktopPortrait}${itemIconMarkup(pet, 'altar-tab-mobile-icon')}`;
}
function renderPetAltarStage() {
  const pet = selectedAltarPet();
  const definition = petDefinition(pet);
  const portrait = definition?.portrait;
  const frame = definition?.portraitFrame;
  const image = portrait && frame
    ? `<svg class="altar-pet-portrait" viewBox="${frame.bounds.join(' ')}" preserveAspectRatio="xMidYMax meet" role="img" aria-label="${escapeHtml(pet.name)} am Altar" focusable="false"><image href="${escapeHtml(portrait)}" width="${frame.width}" height="${frame.height}" /></svg>`
    : portrait
    ? `<img class="altar-pet-portrait" src="${escapeHtml(portrait)}" alt="${escapeHtml(pet.name)} am Altar" draggable="false">`
    : itemIconMarkup(pet, 'altar-pet-portrait');
  return `<div class="altar-hero-stage altar-pet-stage"><div class="altar-floor-glow" aria-hidden="true"></div>${image}</div>`;
}
