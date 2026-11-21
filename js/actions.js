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
  const maximum = selectedForgeMode === 'mythic' ? MYTHIC_ITEMS.maxUpgradeLevel : BALANCE.items.maxUpgradeLevel;
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
  const stone = state.inventory.find(item => item.slot === (mythic ? 'mythicUpgradeStone' : 'upgradeStone'));
  if (!itemId || !stone) return;
  await performAction(
    { action: 'upgrade', itemId, stoneId: stone.id, mythic },
    'Verbesserungsversuch beendet',
    (response) => response.successes
      ? `${response.item.name} ist jetzt +${response.item[mythic ? 'mythicUpgradeLevel' : 'upgradeLevel']}. Erfolg bei ${response.chance} %.`
      : `Der Versuch ist fehlgeschlagen. Der Stein wurde verbraucht; das Teil bleibt auf +${response.item[mythic ? 'mythicUpgradeLevel' : 'upgradeLevel']}.`,
  );
}
async function autoUpgrade(options = {}) {
  if (saveMaintenance || saveBlocked) return;
  if (autoUpgradeRunning) { if (!options.itemId) stopWorkshopJob(); return; }
  if (activeWorkshopJob || forgeAnimationInProgress || (!options.itemId && !selectedForForge.size)) return;
  const mythic = options.itemId ? Boolean(options.mythic) : selectedForgeMode === 'mythic';
  const levelKey = mythic ? 'mythicUpgradeLevel' : 'upgradeLevel';
  const maximum = mythic ? MYTHIC_ITEMS.maxUpgradeLevel : BALANCE.items.maxUpgradeLevel;
  const targetLevel = options.itemId ? Math.max(1, Math.min(maximum, Math.floor(Number(options.targetLevel) || maximum))) : forgeUpgradeTargetLevel();
  const targetId = options.itemId || [...selectedForForge][0];
  const job = { kind: 'upgrade', mythic, view: 'blacksmith', targetId, targetLevel, headless: Boolean(options.headless), stopRequested: false };
  activeWorkshopJob = job;
  autoUpgradeRunning = true;
  const generation = stateGeneration;
  renderView();
  let attempts = 0;
  let successes = 0;
  let failures = 0;
  let itemName = '';
  try {
    while (autoUpgradeRunning && !job.stopRequested && generation === stateGeneration && !saveMaintenance && !saveBlocked) {
      const target = workshopEquipmentItems(state).find(item => item.id === targetId);
      if (!target || (target[levelKey] || 0) >= targetLevel) break;
      const stone = state.inventory.find((item) => item.slot === (mythic ? 'mythicUpgradeStone' : 'upgradeStone'));
      if (!stone) break;
      renderWorkshopStatus();
      const result = await performAction({ action: 'upgrade', itemId: target.id, stoneId: stone.id, mythic, silent: true }, null, null, { background: true });
      if (!result || generation !== stateGeneration || saveMaintenance || saveBlocked) break;
      attempts += result.attempts || 0;
      successes += result.successes || 0;
      failures += result.failures || 0;
      itemName = result.item?.name || itemName;
      if (!result.attempts || result.item?.[levelKey] >= targetLevel) break;
    }
  } finally {
    if (activeWorkshopJob === job) activeWorkshopJob = null;
    if (generation === stateGeneration) {
      autoUpgradeRunning = false;
      if (!saveMaintenance && !saveBlocked) renderView({ background: true });
    }
    renderWorkshopStatus();
  }
  if (attempts && generation === stateGeneration && !saveMaintenance && !saveBlocked) {
    const detail = `${itemName}: +${findInventoryOrEquippedItem(state, targetId)?.[levelKey] ?? '—'} · ${successes} Erfolg${successes === 1 ? '' : 'e'}, ${failures} Fehlschläge. ${attempts} Steine verbraucht. Ziel: +${targetLevel}.`;
    await queueActivity('Auto-Upgrade beendet', detail).catch(() => {});
  }
}

function stopWorkshopJob() {
  if (!activeWorkshopJob) return;
  activeWorkshopJob.stopRequested = true;
  const selector = activeWorkshopJob.kind === 'upgrade' ? '[data-forge-auto]' : '[data-socket-auto]';
  const button = document.querySelector(selector);
  if (button) { button.disabled = true; button.textContent = 'WIRD GESTOPPT'; }
  renderWorkshopStatus();
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
  if (activeWorkshopJob || forgeAnimationInProgress || (!options.itemId && !selectedSocketTargetId)) return;
  const targetId = options.itemId || selectedSocketTargetId;
  const target = workshopEquipmentItems(state).find(item => item.id === targetId);
  const targetCount = options.itemId ? Math.max(0, Math.min(socketCapacityForSlot(target?.slot, target), Math.floor(Number(options.targetCount) || 0))) : socketAutoTargetCount(target);
  if (!targetCount) return;
  const job = { kind: 'socket', view: 'sockets', targetId, targetCount, headless: Boolean(options.headless), stopRequested: false };
  activeWorkshopJob = job;
  autoSocketRunning = true;
  const generation = stateGeneration;
  renderView();
  let attempts = 0;
  let successes = 0;
  let failures = 0;
  let itemName = '';
  try {
    while (autoSocketRunning && !job.stopRequested && generation === stateGeneration && !saveMaintenance && !saveBlocked) {
      const target = workshopEquipmentItems(state).find(item => item.id === targetId);
      if (!target || (target.socketSlots || 0) >= Math.min(targetCount, socketCapacityForSlot(target.slot, target))) break;
      const socketStone = state.inventory.find((item) => item.slot === 'socketStone');
      if (!socketStone) break;
      renderWorkshopStatus();
      const result = await performAction({ action: 'socket-slot', itemId: target.id, stoneId: socketStone.id, silent: true }, null, null, { background: true });
      if (!result || generation !== stateGeneration || saveMaintenance || saveBlocked) break;
      attempts += result.attempts || 0;
      successes += result.successes || 0;
      failures += result.failures || 0;
      itemName = result.item?.name || itemName;
      if (!result.attempts) break;
    }
  } finally {
    if (activeWorkshopJob === job) activeWorkshopJob = null;
    if (generation === stateGeneration) {
      autoSocketRunning = false;
      if (!saveMaintenance && !saveBlocked) renderView({ background: true });
    }
    renderWorkshopStatus();
  }
  if (attempts && generation === stateGeneration && !saveMaintenance && !saveBlocked) {
    const target = workshopEquipmentItems(state).find(item => item.id === targetId);
    const noMaterials = target && (target.socketSlots || 0) < targetCount && (!state.inventory.some((item) => item.slot === 'socketStone'));
    const detail = `${itemName}: ${successes} Sockel geöffnet, ${failures} Fehlversuche. ${attempts} Sockelsteine verbraucht. Ziel: ${targetCount} Sockel.${noMaterials ? ' Materialvorrat erschöpft.' : ''}`;
    await queueActivity('Auto-Sockeln beendet', detail).catch(() => {});
  }
}

async function socketAttempt(auto = false) {
  if (forgeAnimationInProgress || activeWorkshopJob || !selectedSocketTargetId) return;
  const socketStone = state.inventory.find((item) => item.slot === 'socketStone');
  if (!socketStone) return;
  await performAction(
    { action: 'socket-slot', itemId: selectedSocketTargetId, stoneId: socketStone.id, auto },
    auto ? 'Auto-Sockeln beendet' : 'Sockelversuch beendet',
    (result) => `${result.item.name}: ${result.successes} Sockel geöffnet, ${result.failures} Fehlversuche. ${result.attempts} Sockelsteine verbraucht.${result.stoppedForMaterials ? ' Materialvorrat erschöpft.' : ''}`,
  );
}

let forgeAnimationInProgress = false;
