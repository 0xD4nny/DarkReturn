// Mobile item workbenches reuse the existing equipment rules and background jobs.
function openMobileItemWorkshop(itemId, mode = 'upgrade') {
  const item = findInventoryOrEquippedItem(state, itemId);
  if (!item) return;
  const equipped = workshopEquipmentItems(state).some(entry => entry.id === item.id);
  const mythic = isMythicWeapon(item);
  const capacity = equipped ? socketCapacityForSlot(item.slot, item) : 0;
  const canUpgrade = equipped && (AFFIX_POOLS[item.slot] || item.slot === 'glyph');
  let content = `<div class="mobile-item-workshop"><p class="mobile-workshop-item-name">${escapeHtml(item.name)}</p><div class="mobile-workshop-modes">`;
  if (canUpgrade) content += `<button type="button" class="ui-control ui-choice" data-item-workshop-mode="upgrade" aria-pressed="${mode === 'upgrade'}">${mythic ? 'Mystisch aufwerten' : 'Aufwerten'}</button>`;
  if (capacity) content += `<button type="button" class="ui-control ui-choice" data-item-workshop-mode="sockets" aria-pressed="${mode === 'sockets'}">Sockel & Edelsteine</button>`;
  content += '</div>';
  if (mode === 'fusion') {
    content += '<p>Kombiniere diese Glyphe mit zwei weiteren Glyphen aus dem Inventar.</p>';
  } else if (mode === 'gem') {
    content += renderGemUpgradePanel(item).replaceAll('data-upgrade-gems', 'data-mobile-workshop-gem-upgrade');
    const targets = workshopEquipmentItems(state).filter(entry => socketCapacityForSlot(entry.slot, entry));
    content += `<h3>In Ausrüstung einsetzen</h3><div class="mobile-gem-picker">${targets.map(target => `<button type="button" class="ui-control ui-button" data-workshop-gem-target="${escapeHtml(target.id)}">${escapeHtml(workshopSlotLabel(target))} · ${escapeHtml(target.name)}</button>`).join('') || '<p>Keine passende Ausrüstung angelegt.</p>'}</div>`;
  } else if (mode === 'upgrade' && canUpgrade) {
    const level = item[mythic ? 'mythicUpgradeLevel' : 'upgradeLevel'] || 0;
    const maximum = mythic ? MYTHIC_ITEMS.maxUpgradeLevel : BALANCE.items.maxUpgradeLevel;
    const materials = inventoryQuantityForSlot(state, mythic ? 'mythicUpgradeStone' : 'upgradeStone');
    const target = Math.min(maximum, level + 10);
    const options = Array.from({ length: maximum - level }, (_, index) => level + index + 1).map(value => `<option value="${value}" ${value === target ? 'selected' : ''}>+${value}${value === maximum ? ' · Maximum' : ''}</option>`).join('');
    content += `<p>Aktuell +${level} · ${number(materials)} ${mythic ? 'mystische ' : ''}Aufwertungssteine</p>`;
    if (options) content += `<label class="mobile-workshop-target">Zielstufe<select class="ui-control ui-select" data-item-workshop-target>${options}</select></label><p class="mobile-detail-note">Läuft im Hintergrund bis zur Zielstufe, bis das Material ausgeht oder du stoppst. Auch Fehlversuche verbrauchen Steine.</p><button class="primary-button ui-control ui-button" type="button" data-item-workshop-start="upgrade" ${!materials || activeWorkshopJob || forgeAnimationInProgress ? 'disabled' : ''}>Aufwertung starten</button>`;
    else content += '<p>Maximale Aufwertung erreicht.</p>';
  } else if (mode === 'sockets' && capacity) {
    const opened = item.socketSlots || 0;
    const materials = inventoryQuantityForSlot(state, 'socketStone');
    content += `<p>${opened} / ${capacity} Sockel geöffnet · ${number(materials)} Sockelsteine</p>`;
    if (opened < capacity) {
      const options = Array.from({ length: capacity - opened }, (_, index) => opened + index + 1).map(value => `<option value="${value}" ${value === capacity ? 'selected' : ''}>${value} Sockel${value === capacity ? ' · Maximum' : ''}</option>`).join('');
      content += `<label class="mobile-workshop-target">Zielanzahl<select class="ui-control ui-select" data-item-workshop-target>${options}</select></label><p class="mobile-detail-note">Öffnet Sockel im Hintergrund bis zum Ziel oder Materialende. Fehlversuche verbrauchen ebenfalls Steine.</p><button class="primary-button ui-control ui-button" type="button" data-item-workshop-start="socket" ${!materials || activeWorkshopJob || forgeAnimationInProgress ? 'disabled' : ''}>Sockeln starten</button>`;
    }
    const gems = state.inventory.filter(gem => gem.slot === 'weaponGem');
    if (opened) content += `<h3>Edelsteine</h3><div class="mobile-workshop-sockets">${Array.from({ length: opened }, (_, index) => {
      const gem = item.sockets?.[index];
      const busy = activeWorkshopJob || forgeAnimationInProgress;
      return gem ? `<div><strong>Sockel ${index + 1}</strong><span>${escapeHtml(gem.name)} · ${escapeHtml(gem.rarity)}</span><button type="button" class="ui-control ui-button" data-item-workshop-remove="${index}" ${busy ? 'disabled' : ''}>Entnehmen</button></div>`
        : `<div><strong>Sockel ${index + 1}</strong>${gems.length ? `<select class="ui-control ui-select" data-workshop-gem-picker="${index}" aria-label="Edelstein für Sockel ${index + 1}">${gems.map(entry => `<option value="${escapeHtml(entry.id)}">${escapeHtml(entry.name)} · ${escapeHtml(entry.rarity)}</option>`).join('')}</select><button type="button" class="ui-control ui-button" data-item-workshop-insert="${index}" ${busy ? 'disabled' : ''}>Einsetzen</button>` : '<span>Keine Edelsteine im Inventar.</span>'}</div>`;
    }).join('')}</div>`;
  } else content += '<p>Zum Bearbeiten zuerst passende Ausrüstung anlegen.</p>';
  if (item.slot === 'glyph' && state.inventory.some(entry => entry.id === item.id)) content += '<button type="button" class="ui-control ui-button" data-workshop-glyph-fusion>Glyphenauswahl öffnen</button>';
  content += '</div>';
  mobileItemContext = null;
  showMobileSheet(mode === 'gem' ? 'Edelsteine' : 'Ausrüstung bearbeiten', content);
  mobileSheet.dataset.workshopItem = item.id;
  mobileSheet.dataset.workshopMode = mode;
  if (activeWorkshopJob || forgeAnimationInProgress) {
    mobileSheet.querySelectorAll('[data-mobile-workshop-gem-upgrade]').forEach(button => button.disabled = true);
  }
}

function openMobileWorkshopStatus() {
  const job = activeWorkshopJob;
  const target = job && findInventoryOrEquippedItem(state, job.targetId);
  const progress = job?.kind === 'upgrade'
    ? `+${target?.[job.mythic ? 'mythicUpgradeLevel' : 'upgradeLevel'] || 0} → +${job.targetLevel}`
    : `${target?.socketSlots || 0} / ${job?.targetCount || 0} Sockel`;
  const content = job
    ? `<p>${escapeHtml(target?.name || 'Ausrüstung')}</p><p>${job.kind === 'upgrade' ? 'Aufwertung' : 'Sockeln'} · ${progress}</p><p>${job.stopRequested ? 'Wird nach dem laufenden Versuch gestoppt.' : 'Läuft im Hintergrund.'}</p>`
    : '<p>Der Auftrag ist beendet.</p>';
  if (mobileSheet.open && mobileSheet.dataset.workshopStatus) {
    const body = mobileSheet.querySelector('.mobile-sheet-content');
    if (body.innerHTML !== content) body.innerHTML = content;
    const stop = mobileSheet.querySelector('[data-mobile-stop-workshop]');
    if (stop) { stop.disabled = !job || job.stopRequested; stop.textContent = job ? job.stopRequested ? 'Wird gestoppt' : 'Auftrag stoppen' : 'Auftrag beendet'; }
    return;
  }
  mobileItemContext = null;
  showMobileSheet('Werkstattauftrag', content, job ? `<button class="ui-control ui-button" type="button" data-mobile-stop-workshop ${job.stopRequested ? 'disabled' : ''}>Auftrag stoppen</button>` : '');
  mobileSheet.dataset.workshopStatus = 'true';
}
function refreshMobileWorkshopStatus() {
  if (isMobileLayout() && mobileSheet.open && mobileSheet.dataset.workshopStatus) openMobileWorkshopStatus();
}
mobileSheet.addEventListener('close', () => {
  delete mobileSheet.dataset.workshopItem;
  delete mobileSheet.dataset.workshopMode;
  delete mobileSheet.dataset.workshopStatus;
});
document.addEventListener('click', event => {
  if (!isMobileLayout()) return;
  const stop = () => { event.preventDefault(); event.stopImmediatePropagation(); };
  if (event.target.closest('[data-return-workshop]') && activeWorkshopJob) { stop(); openMobileWorkshopStatus(); return; }
  if (event.target.closest('[data-mobile-stop-workshop]')) { stop(); stopWorkshopJob(); return; }
  const itemId = mobileSheet.dataset.workshopItem;
  if (!mobileSheet.contains(event.target) || !itemId) return;
  const modeButton = event.target.closest('[data-item-workshop-mode]');
  if (modeButton) { stop(); openMobileItemWorkshop(itemId, modeButton.dataset.itemWorkshopMode); return; }
  const gemTarget = event.target.closest('[data-workshop-gem-target]');
  if (gemTarget) { stop(); openMobileItemWorkshop(gemTarget.dataset.workshopGemTarget, 'sockets'); return; }
  if (event.target.closest('[data-workshop-glyph-fusion]')) {
    stop();
    if (activeWorkshopJob || forgeAnimationInProgress) return;
    mobileWorkshopReturn = { view: currentView, scroll: window.scrollY, itemId };
    selectedForgeMode = 'glyphs'; selectedGlyphsForFusion.clear(); selectedGlyphsForFusion.add(itemId);
    mobileSheet.close(); setView('blacksmith'); return;
  }
  const start = event.target.closest('[data-item-workshop-start]');
  if (start) {
    stop();
    if (start.disabled || activeWorkshopJob || forgeAnimationInProgress || mobileActionPending) return;
    const item = workshopEquipmentItems(state).find(entry => entry.id === itemId);
    if (!item) return;
    const target = Number(mobileSheet.querySelector('[data-item-workshop-target]')?.value);
    if (!Number.isInteger(target) || target < 1) return;
    mobileSheet.close();
    if (start.dataset.itemWorkshopStart === 'upgrade') void autoUpgrade({ itemId, targetLevel: target, mythic: isMythicWeapon(item), headless: true });
    else void autoSocket({ itemId, targetCount: target, headless: true });
    return;
  }
  const insert = event.target.closest('[data-item-workshop-insert]');
  const remove = event.target.closest('[data-item-workshop-remove]');
  const upgradeGem = event.target.closest('[data-mobile-workshop-gem-upgrade]');
  if (!insert && !remove && !upgradeGem) return;
  stop();
  const control = insert || remove || upgradeGem;
  if (control.disabled || mobileActionPending || activeWorkshopJob || forgeAnimationInProgress) return;
  const mode = mobileSheet.dataset.workshopMode;
  let payload;
  if (insert) {
    const socketIndex = Number(insert.dataset.itemWorkshopInsert);
    const gemId = mobileSheet.querySelector(`[data-workshop-gem-picker="${socketIndex}"]`)?.value;
    if (!gemId) return;
    payload = { action: 'socket-gem', itemId, gemId, socketIndex };
  } else if (remove) payload = { action: 'unsocket-gem', itemId, socketIndex: Number(remove.dataset.itemWorkshopRemove) };
  else payload = { action: 'upgrade-gems', itemId, all: upgradeGem.dataset.mobileWorkshopGemUpgrade === 'all' };
  mobileActionPending = true;
  mobileSheet.querySelectorAll('button, select').forEach(button => button.disabled = true);
  performAction(payload).then(result => {
    if (mobileSheet.open && mobileSheet.dataset.workshopItem === itemId) {
      const nextId = result?.nextGemId || itemId;
      if (findInventoryOrEquippedItem(state, nextId)) openMobileItemWorkshop(nextId, mode);
      else mobileSheet.close();
    }
  }).finally(() => { mobileActionPending = false; });
}, true);
