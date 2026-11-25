function equipmentSlotFor(item, className, gear = equipmentForClass(className)) {
  if (item.slot === 'glyph') return ['glyph1', 'glyph2', 'glyph3'].find((slot) => !gear[slot]) || null;
  if (item.slot === 'shield') return className === 'warrior' ? 'offHand' : null;
  if (['bow', 'sword', 'staff', 'bell'].includes(item.slot)) return CLASS_WEAPONS[className]?.includes(item.slot) ? 'mainHand' : null;
  if (item.slot === 'ring') return gear.ring1 ? 'ring2' : 'ring1';
  if (item.slot === 'earring') return gear.earring1 ? 'earring2' : 'earring1';
  return item.slot;
}
async function equipMain(itemId, preferredSlot) {
  const item = state.inventory.find((entry) => entry.id === itemId);
  if (!item) return;
  if (['upgradeStone', 'mythicUpgradeStone', 'socketStone', 'rarityStone', 'affixStone', 'weaponGem', 'armorGem', 'powerup', 'vipTicket', 'towerLootBoost', 'towerReset', 'bossReset'].includes(item.slot)) { toastMessageFor('Gegenstand kann nicht ausgerüstet werden', 'Verbrauchsgüter, Materialien und Edelsteine können nicht ausgerüstet werden.'); return; }
  if (['bow', 'sword', 'staff', 'bell'].includes(item.slot) && !CLASS_WEAPONS[state.mainClass].includes(item.slot)) {
    toastMessageFor('Waffe passt nicht zur Klasse', `${CLASSES[state.mainClass].label} kann ${SLOT_DATA[item.slot].label} nicht führen.`);
    return;
  }
  if (item.slot === 'shield' && state.mainClass !== 'warrior') {
    toastMessageFor('Schild passt nicht zur Klasse', 'Nur der Krieger kann einen Schild ausrüsten.');
    return;
  }
  const slot = preferredSlot || equipmentSlotFor(item, state.mainClass);
  if (!slot) { toastMessageFor('Kein freier Platz', 'Für diesen Gegenstand ist kein passender Ausrüstungsslot frei.'); return; }
  await performAction({ action: 'equip-main', itemId, slot }, 'Ausrüstung angelegt', `${item.name} wurde ausgerüstet.`);
}
async function equipCompanion(itemId, className, preferredSlot) {
  const item = state.inventory.find((entry) => entry.id === itemId);
  if (!item) return;
  if (className !== state.activeCompanion) return;
  const slot = preferredSlot || equipmentSlotFor(item, className);
  if (!slot) { toastMessageFor('Ausrüstung passt nicht', `${CLASSES[className].label} kann diesen Gegenstand nicht tragen.`); return; }
  await performAction({ action: 'equip-companion', itemId, class: className, slot }, 'Gefährte ausgerüstet', `${item.name} wurde ${CLASSES[className].label} zugewiesen.`);
}
async function unequip(slot, owner = 'main', className) {
  await performAction({ action: 'unequip', slot, owner, class: className }, 'Gegenstand abgelegt', 'Der Gegenstand liegt wieder im Inventar.');
}
async function buy(group, quantity = 1) {
  const result = await performAction({ action: 'buy', group, quantity });
  if (result && currentView === 'shop') renderView();
}
async function sell(itemId) {
  const result = await performAction({ action: 'sell', itemId }, 'Gegenstand verkauft', (response) => response.mythicStones ? `+${response.mythicStones} mystische Aufwertungssteine für ${response.sold.name}.` : `+${number(response.value)} Seelen für ${response.sold.name}.`);
  if (result) renderView();
}
function forgeUpgradeTargetLevel() {
  const maximum = selectedForgeMode === 'mythic' ? MYTHIC_UPGRADES.maxUpgradeLevel : BALANCE.items.maxUpgradeLevel;
  return Math.max(1, Math.min(maximum, Math.floor(Number(selectedForgeTargetLevel) || maximum)));
}
async function fuseGlyphs() {
  if (glyphFusionPending || forgeAnimationInProgress || activeWorkshopJob || selectedGlyphsForFusion.size !== 3) return;
  glyphFusionPending = true;
  const itemIds = [...selectedGlyphsForFusion];
  renderView();
  try {
    const result = await performAction({ action: 'fuse-glyphs', itemIds });
    if (result) {
      itemIds.forEach(id => selectedGlyphsForFusion.delete(id));
      lastFusedGlyphId = result.item.id;
    }
  } finally {
    glyphFusionPending = false;
    if (currentView === 'blacksmith') renderView();
  }
}
function socketAutoTargetCount(item) {
  const maximum = item ? socketCapacityForSlot(item.slot, item) : 0;
  return maximum ? Math.max(1, Math.min(maximum, Math.floor(Number(selectedSocketTargetCount) || maximum))) : 0;
}
async function upgrade() {
  if (forgeAnimationInProgress || activeWorkshopJob) return;
  const mythic = selectedForgeMode === 'mythic';
  const itemId = [...selectedForForge][0];
  const target = workshopEquipmentItems(state).find(item => item.id === itemId);
  if (!target) return;
  const level = target[mythic ? 'mythicUpgradeLevel' : 'upgradeLevel'] || 0;
  await startPersistedWorkshopJob({ kind: 'upgrade', itemId, mythic, targetLevel: level + 1, single: true, headless: isMobileLayout() });
}
async function autoUpgrade(options = {}) {
  if (saveMaintenance || saveBlocked) return;
  if (autoUpgradeRunning) { if (!options.itemId) stopWorkshopJob(); return; }
  if (activeWorkshopJob || forgeAnimationInProgress) return;
  const mythic = options.itemId ? Boolean(options.mythic) : selectedForgeMode === 'mythic';
  const maximum = mythic ? MYTHIC_UPGRADES.maxUpgradeLevel : BALANCE.items.maxUpgradeLevel;
  const itemId = options.itemId || [...selectedForForge][0];
  if (!itemId) return;
  const targetLevel = options.itemId ? Math.max(1, Math.min(maximum, Math.floor(Number(options.targetLevel) || maximum))) : forgeUpgradeTargetLevel();
  return startPersistedWorkshopJob({ kind: 'upgrade', itemId, mythic, targetLevel, headless: Boolean(options.headless) });
}
function stopWorkshopJob() {
  if (!activeWorkshopJob || activeWorkshopJob.stopRequested) return;
  const jobId = activeWorkshopJob.id;
  activeWorkshopJob.stopRequested = true;
  renderWorkshopStatus();
  void performAction({ action: 'workshop-stop', jobId, silent: true }, null, null, { background: true });
}
function renderWorkshopStatus() {
  const slot = document.querySelector('#workshop-status-slot');
  if (!slot) return;
  const job = activeWorkshopJob;
  slot.hidden = !job || (currentView === job.view && !job.headless && !isMobileLayout());
  if (!job) { slot.replaceChildren(); if (typeof refreshMobileWorkshopStatus === 'function') refreshMobileWorkshopStatus(); return; }
  const target = state && findInventoryOrEquippedItem(state, job.targetId);
  const progress = job.kind === 'upgrade'
    ? `+${target?.[job.mythic ? 'mythicUpgradeLevel' : 'upgradeLevel'] || 0} → +${job.targetLevel}`
    : `${target?.socketSlots || 0}/${job.targetCount} Sockel`;
  const label = job.stopRequested ? 'WIRD GESTOPPT' : job.kind === 'upgrade' ? job.mythic ? 'MYSTISCHE AUTO-AUFWERTUNG' : 'AUTO-AUFWERTUNG' : 'AUTO-SOCKELN';
  const text = `${label}\n${target?.name || 'Ausrüstung'} · ${progress}`;
  if (slot.textContent !== text) slot.textContent = text;
  slot.title = detailTextLines(`${target?.name || 'Ausrüstung'} · ${progress} · Zurück zur ${job.kind === 'upgrade' ? 'Schmiede' : 'Sockelkammer'}`).join('\n');
  slot.setAttribute('aria-label', slot.title);
  if (typeof refreshMobileWorkshopStatus === 'function') refreshMobileWorkshopStatus();
}

async function autoSocket(options = {}) {
  if (saveMaintenance || saveBlocked) return;
  if (autoSocketRunning) { if (!options.itemId) stopWorkshopJob(); return; }
  if (activeWorkshopJob || forgeAnimationInProgress) return;
  const itemId = options.itemId || selectedSocketTargetId;
  const target = workshopEquipmentItems(state).find(item => item.id === itemId);
  if (!target) return;
  const targetCount = options.itemId ? Math.max(0, Math.min(socketCapacityForSlot(target.slot, target), Math.floor(Number(options.targetCount) || 0))) : socketAutoTargetCount(target);
  if (!targetCount) return;
  return startPersistedWorkshopJob({ kind: 'socket', itemId, targetCount, headless: Boolean(options.headless) });
}
async function socketAttempt(auto = false) {
  if (forgeAnimationInProgress || activeWorkshopJob) return;
  const target = workshopEquipmentItems(state).find(item => item.id === selectedSocketTargetId);
  if (!target) return;
  await startPersistedWorkshopJob({ kind: 'socket', itemId: target.id,
    targetCount: auto ? socketCapacityForSlot(target.slot, target) : (target.socketSlots || 0) + 1,
    single: !auto, headless: isMobileLayout() });
}
let forgeAnimationInProgress = false;
