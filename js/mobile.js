// Mobile UI shares the existing state/actions; no second game state or timers.
const mobileMedia = window.matchMedia('(max-width: 900px), (hover: none) and (pointer: coarse) and (max-width: 1100px)');
const mobileStatusHomes = [];
let mobileMenuReturnFocus = null;

function isMobileLayout() { return mobileMedia.matches; }
let mobileFooterPage = 0;
const mobileFooterSources = [];

function setMobileFooterPage(page) {
  mobileFooterPage = Math.max(0, Math.min(1, page));
  const footer = document.getElementById('mobile-footer');
  footer.querySelectorAll('.mobile-footer-page').forEach((panel, index) => { panel.hidden = index !== mobileFooterPage; });
  footer.querySelectorAll('[data-footer-page]').forEach(button => {
    button.setAttribute('aria-pressed', String(Number(button.dataset.footerPage) === mobileFooterPage));
  });
  measureMobileFooter();
}
function measureMobileFooter() {
  if (!isMobileLayout()) return;
  document.documentElement.style.setProperty('--mobile-footer-height', `${document.getElementById('mobile-footer').getBoundingClientRect().height}px`);
}
function syncMobileFooter() {
  mobileFooterSources.forEach(({ source, button }) => {
    button.disabled = source.disabled;
    const active = source.classList.contains('is-active');
    button.classList.toggle('is-active', active);
    if (active) button.setAttribute('aria-current', 'page');
    else button.removeAttribute('aria-current');
    const badge = button.querySelector('.nav-count');
    const original = source.querySelector('.nav-count');
    if (badge && original) { badge.textContent = original.textContent; badge.hidden = original.hidden; }
  });
}
function initMobileFooter() {
  const footer = document.getElementById('mobile-footer');
  const worldViews = new Set(['map', 'tower', 'boss', 'contracts', 'shop']);
  const excludedViews = new Set(['profile', 'blacksmith', 'sockets', 'enchant', 'settings', 'documentation']);
  const labels = { equipment: 'Ausrüstung' };
  document.querySelectorAll('#sidebar .nav-item[data-view]').forEach(source => {
    if (excludedViews.has(source.dataset.view)) return;
    const button = source.cloneNode(true);
    button.className = 'nav-item mobile-footer-item';
    button.removeAttribute('id');
    button.querySelectorAll('[id]').forEach(node => node.removeAttribute('id'));
    const label = button.querySelector('span:not(.nav-item-icon):not(.nav-count)');
    if (label) { label.className = 'mobile-footer-label'; label.textContent = labels[source.dataset.view] || label.textContent; }
    button.setAttribute('aria-label', source.textContent.replace(/\s+/g, ' ').trim().replace(/\s*\d+$/, ''));
    footer.querySelector(worldViews.has(source.dataset.view) ? '#mobile-footer-world' : '#mobile-footer-character').append(button);
    mobileFooterSources.push({ source, button });
  });
  footer.querySelectorAll('[data-footer-page]').forEach(button => {
    button.addEventListener('click', () => setMobileFooterPage(Number(button.dataset.footerPage)));
  });
  let start = null;
  let suppressClickUntil = 0;
  footer.addEventListener('pointerdown', event => {
    if (!event.isPrimary || event.button !== 0) return;
    start = { id: event.pointerId, x: event.clientX, y: event.clientY, dragging: false };
  });
  footer.addEventListener('pointermove', event => {
    if (!start || start.id !== event.pointerId) return;
    const dx = event.clientX - start.x, dy = event.clientY - start.y;
    if (!start.dragging && Math.abs(dx) > 12 && Math.abs(dx) > Math.abs(dy) * 1.3) {
      start.dragging = true;
      footer.setPointerCapture(event.pointerId);
    }
  });
  footer.addEventListener('pointerup', event => {
    if (!start || start.id !== event.pointerId) return;
    const dx = event.clientX - start.x, dy = event.clientY - start.y;
    if (start.dragging) {
      suppressClickUntil = performance.now() + 400;
      if (Math.abs(dx) >= 40 && Math.abs(dx) > Math.abs(dy) * 1.3) setMobileFooterPage(mobileFooterPage + (dx < 0 ? 1 : -1));
    }
    start = null;
  });
  footer.addEventListener('pointercancel', () => { start = null; });
  footer.addEventListener('click', event => {
    if (performance.now() < suppressClickUntil && event.detail !== 0) { event.preventDefault(); event.stopImmediatePropagation(); }
  }, true);
  footer.addEventListener('keydown', event => {
    if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
    event.preventDefault();
    setMobileFooterPage(mobileFooterPage + (event.key === 'ArrowRight' ? 1 : -1));
    footer.querySelector(`[data-footer-page="${mobileFooterPage}"]`).focus();
  });
  new ResizeObserver(measureMobileFooter).observe(footer);
  new MutationObserver(syncMobileFooter).observe(document.querySelector('#sidebar .main-nav'), {
    subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: ['class', 'disabled', 'hidden']
  });
  syncMobileFooter();
}
function toggleMobileStatus(open = false) {
  const panel = document.getElementById('mobile-status-panel');
  if (open) { toggleMailboxPanel(false); toggleActivityPanel(false); }
  panel.hidden = !open;
  document.getElementById('mobile-status-toggle').setAttribute('aria-expanded', String(open));
}
function toggleMobileMenu(open = false) {
  const sidebar = document.getElementById('sidebar');
  const toggle = document.getElementById('mobile-menu-toggle');
  if (open) { mobileMenuReturnFocus = document.activeElement; toggleMobileStatus(false); }
  document.body.classList.toggle('mobile-nav-open', open);
  document.getElementById('mobile-nav-backdrop').hidden = !open;
  toggle.setAttribute('aria-expanded', String(open));
  toggle.setAttribute('aria-label', open ? 'Menü schließen' : 'Menü öffnen');
  sidebar.inert = isMobileLayout() && !open;
  if (open) sidebar.querySelector('.nav-item.is-active:not(:disabled), .nav-item:not(:disabled)')?.focus();
  else if (mobileMenuReturnFocus?.isConnected) { mobileMenuReturnFocus.focus({ preventScroll: true }); mobileMenuReturnFocus = null; }
}
function syncMobileStatusPlacement() {
  const content = document.getElementById('mobile-status-content');
  if (!mobileStatusHomes.length) {
    const selectors = ['#player-identity', '.soul-balance', '#active-powerups-slot', '#hunting-event-slot', '#world-event-slot', '.mailbox-wrap', '#activity-toggle', '.settings-shortcut', '#workshop-status-slot', '#battle-status-slot'];
    selectors.map(selector => document.querySelector(selector)).filter(Boolean).forEach(node => {
      const placeholder = document.createComment('desktop status position');
      node.before(placeholder);
      mobileStatusHomes.push({ node, placeholder });
    });
  }
  mobileStatusHomes.forEach(({ node, placeholder }) => {
    if (isMobileLayout() && node.matches('.soul-balance')) document.querySelector('.breadcrumb').before(node);
    else if (isMobileLayout() && !node.matches('.player-identity, .mailbox-wrap, .settings-shortcut')) content.append(node);
    else placeholder.after(node);
  });
  if (isMobileLayout()) {
    const header = document.querySelector('.topbar-right');
    for (const selector of ['.mailbox-wrap', '#mobile-status-toggle', '.settings-shortcut']) header.append(document.querySelector(selector));
  }
}
function syncMobileShell() {
  syncMobileStatusPlacement();
  const worldEvent = document.getElementById('world-event-slot');
  if (isMobileLayout()) { worldEvent.setAttribute('role', 'button'); worldEvent.tabIndex = 0; worldEvent.setAttribute('aria-label', 'Welt-Event anzeigen'); }
  else { worldEvent.removeAttribute('role'); worldEvent.removeAttribute('tabindex'); worldEvent.removeAttribute('aria-label'); }
  toggleMobileMenu(false);
  toggleMobileStatus(false);
  if (!isMobileLayout() && mobileSheet.open) mobileSheet.close();
  syncMobileOrientation();
  if (state) syncMobileView();
  syncMobileBattle({ focus: false });
}
function syncMobileOrientation() {
  const guard = document.getElementById('mobile-orientation-dialog');
  // The software keyboard can make a portrait viewport wider than tall.
  const editing = document.activeElement?.matches('input, select, textarea, [contenteditable="true"]');
  // Use the actual page dimensions: preview iframes may report the host
  // screen's orientation. While editing, retain the existing guard state.
  const landscape = editing ? guard.open : window.matchMedia('(orientation: landscape)').matches;
  if (isMobileLayout() && landscape) {
    if (!guard.open) guard.showModal();
  } else if (guard.open) guard.close();
}
document.getElementById('mobile-orientation-dialog').addEventListener('cancel', event => event.preventDefault());
mobileMedia.addEventListener('change', syncMobileShell);
window.addEventListener('resize', syncMobileOrientation);
window.screen.orientation?.addEventListener('change', syncMobileOrientation);
document.addEventListener('focusout', () => window.setTimeout(syncMobileOrientation, 150));
document.addEventListener('click', event => {
  if (event.target.closest('#mobile-menu-toggle')) { toggleMobileMenu(!document.body.classList.contains('mobile-nav-open')); return; }
  if (event.target.closest('#mobile-nav-backdrop, .mobile-menu-close')) { toggleMobileMenu(false); return; }
  if (event.target.closest('#mobile-status-toggle')) { toggleMobileStatus(document.getElementById('mobile-status-panel').hidden); return; }
  if (isMobileLayout() && event.target.closest('#mailbox-toggle')) { toggleMobileStatus(false); toggleActivityPanel(false); }
  if (isMobileLayout() && event.target.closest('#activity-toggle')) { toggleMobileStatus(false); toggleMailboxPanel(false); }
  if (event.target.closest('[data-close-mobile-status]')) { toggleMobileStatus(false); document.getElementById('mobile-status-toggle').focus(); return; }
  if (event.target.closest('[data-return-workshop]') && activeWorkshopJob) mobileWorkshopPanes[activeWorkshopJob.view] = 'workbench';
  if (event.target.closest('[data-view]')) mobileWorkshopReturn = null;
  if (event.target.closest('[data-view], [data-open-view], [data-return-workshop], [data-show-battle], #sidebar .brand')) { toggleMobileMenu(false); toggleMobileStatus(false); }
  if (!event.target.closest('.topbar, .mobile-status-panel, .mobile-detail-sheet')) toggleMobileStatus(false);
}, true);
document.addEventListener('keydown', event => {
  if (!isMobileLayout()) return;
  if (event.target.matches('#world-event-slot') && ['Enter', ' '].includes(event.key)) { event.preventDefault(); event.target.click(); return; }
  if (event.key === 'Escape') { toggleMobileMenu(false); toggleMobileStatus(false); }
  if (event.key === 'Tab' && document.body.classList.contains('mobile-nav-open')) {
    const controls = [...document.querySelectorAll('#sidebar a[href], #sidebar button:not(:disabled)')];
    const first = controls[0], last = controls[controls.length - 1];
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
  }
});
let mobileItemContext = null;
let mobileSheetReturnFocus = null;
let mobileActionPending = false;
let mobileBulkSale = null;
let mobileWorkshopReturn = null;
const mobileWorkshopPanes = { blacksmith: 'selection', sockets: 'selection', enchant: 'selection' };
const MOBILE_SKILL_TREE_SCALE = .75;
const mobileSkillView = { left: 0, top: 0, owner: null };
let mobileSkillPointer = null;
let mobileSkillHoldTimer = null;
let mobileSkillDragUntil = 0;

const mobileSheet = document.createElement('dialog');
mobileSheet.className = 'mobile-detail-sheet';
mobileSheet.setAttribute('aria-label', 'Details');
document.body.append(mobileSheet);
mobileSheet.addEventListener('click', event => {
  if (event.target === mobileSheet) {
    const rect = mobileSheet.getBoundingClientRect();
    if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) mobileSheet.close();
  }
});
mobileSheet.addEventListener('close', () => {
  mobileBulkSale = null;
  delete mobileSheet.dataset.skillDetails;
  delete mobileSheet.dataset.abilityDetails;
  document.body.classList.remove('mobile-sheet-open');
  mobileItemContext = null;
  if (mobileSheetReturnFocus?.isConnected) mobileSheetReturnFocus.focus({ preventScroll: true });
  else (isMobileLayout() ? (document.querySelector('#mobile-footer .mobile-footer-page:not([hidden]) .nav-item.is-active') || document.querySelector('#mobile-footer [aria-pressed="true"]')) : document.querySelector('.nav-item.is-active'))?.focus({ preventScroll: true });
});
function showMobileSheet(title, content, actions = '') {
  for (const key of ['workshopStatus', 'workshopItem', 'workshopMode', 'skillDetails', 'abilityDetails', 'shopGroup']) delete mobileSheet.dataset[key];
  if (!mobileSheet.open) mobileSheetReturnFocus = document.activeElement;
  mobileSheet.setAttribute('aria-label', title);
  const touchContent = content.replaceAll('Doppelklick im Inventar', 'Die Aktion in den Gegenstandsdetails').replaceAll('Einfach anklicken, um die Box zu öffnen.', 'Über „Eine Box öffnen“ in den Gegenstandsdetails öffnen.');
  mobileSheet.innerHTML = `<header class="mobile-sheet-heading"><strong>${escapeHtml(title)}</strong><button class="ui-control ui-button ui-icon-button ui-close-button" type="button" data-mobile-close aria-label="Details schließen">×</button></header><div class="mobile-sheet-content">${touchContent}</div>${actions ? `<footer class="mobile-sheet-actions">${actions}</footer>` : ''}`;
  tooltip.classList.remove('visible');
  document.body.classList.add('mobile-sheet-open');
  if (!mobileSheet.open) mobileSheet.showModal();
  syncMobileOrientation();
}
function mobileButton(action, label, attributes = '') {
  return `<button type="button" class="ui-control ui-button" data-mobile-action="${action}" ${attributes}>${label}</button>`;
}
function mobileCurrentItem() {
  if (!mobileItemContext || !state) return null;
  if (mobileItemContext.shopOffer) return state.shopEquipmentOffers.find(item => item.id === mobileItemContext.id);
  return findInventoryOrEquippedItem(state, mobileItemContext.id) || partyPets(state).find(pet => pet.id === mobileItemContext.id);
}
function mobileItemIconMarkup(item) {
  const visual = itemVisualStyle(item);
  const classes = visual.special ? `inventory-item ${itemVisualClasses(item)}` : visual.rarity;
  return `<div class="mobile-item-icon ${classes}">${visual.special ? equipmentEmbersMarkup(item) : ''}${itemIconMarkup(item, 'item-icon')}</div>`;
}
function openMobileItem(item, source, { preview = false, description = '', shopOffer = false } = {}) {
  if (!item) return;
  const gear = source?.closest('[data-gear-slot]');
  const ownerClass = item.slot === 'pet' ? item.ownerClass : itemComparisonOwner(item, source || document.body, gear, null);
  mobileItemContext = { id: item.id, ownerClass, preview, description, shopOffer };
  renderMobileItem(item);
}
function renderMobileItem(item = mobileCurrentItem()) {
  if (!item || !mobileItemContext) { if (mobileSheet.open) mobileSheet.close(); return; }
  const { ownerClass, preview, description } = mobileItemContext;
  const inventoryItem = !preview && state.inventory.some(entry => entry.id === item.id);
  const slotEntry = !preview && equipmentSlotEntries(state, true).find(entry => entry.item.id === item.id);
  const owners = [state.mainClass, state.activeCompanion].filter(Boolean);
  const compatibleSlots = owner => itemComparisonSlots(item).filter(({ slot }) => validateEquipmentForClass(state, item, slot, owner));
  const ownerPicker = inventoryItem && owners.some(owner => compatibleSlots(owner).length)
    ? `<label class="mobile-owner-label">Ausrüstung für<select class="ui-control ui-select" data-mobile-item-owner>${owners.filter(owner => compatibleSlots(owner).length).map(owner => `<option value="${owner}" ${owner === ownerClass ? 'selected' : ''}>${escapeHtml(CLASSES[owner].label)} · ${owner === state.mainClass ? 'Main' : 'Gefährte'}</option>`).join('')}</select></label>` : '';
  let actions = '';
  if (mobileItemContext.shopOffer) {
    const price = equipmentShopPrice(item);
    const unavailable = state.souls < price || inventoryOccupiedSlots(state) >= state.inventoryCapacity || totalRewardStorageSlots(state) - 1 < reservedBossStorageSlots(state);
    actions = `<button type="button" class="ui-control ui-button" data-mobile-shop-equipment-buy="${escapeHtml(item.id)}" ${unavailable ? 'disabled' : ''}>Kaufen · ${number(price)} Seelen</button>`;
  }
  if (inventoryItem) {
    actions += compatibleSlots(ownerClass).map(({ slot, label }) => mobileButton('equip', `ANLEGEN · ${escapeHtml(label)}`, `data-mobile-slot="${slot}"`)).join('');
    const useActions = { bossReset: 'use-boss-reset', towerReset: 'use-tower-reset', vipTicket: 'activate-vip', powerup: 'activate-powerup', towerLootBoost: 'activate-powerup' };
    if (useActions[item.slot]) actions += mobileButton('use', item.slot === 'vipTicket' ? 'VIP AKTIVIEREN' : ['powerup', 'towerLootBoost'].includes(item.slot) ? 'AKTIVIEREN · 1 STÜCK' : 'ZEITSTEIN VERWENDEN', `data-use-action="${useActions[item.slot]}"`);
    if (BOX_GROUPS.includes(item.slot)) actions += mobileButton('box', 'EINE BOX ÖFFNEN');
    if (item.slot === 'glyph') actions += mobileButton('glyph-fusion', 'GLYPHEN KOMBINIEREN');
    if (isSellableEquipment(item)) actions += mobileButton('sell', `VERKAUFEN · ${isMythicWeapon(item) ? `${MYTHIC_ITEMS.saleStones} MYSTISCHE STEINE` : `${number(sellValue(item))} SEELEN`}`);
    if (['weaponGem', 'armorGem'].includes(item.slot)) {
      if (currentView === 'sockets' && selectedSocketMode === 'gems') {
        const target = findInventoryOrEquippedItem(state, selectedSocketTargetId);
        const slots = Array.from({ length: target?.socketSlots || 0 }, (_, index) => index).filter(index => !target.sockets?.[index]);
        actions += slots.map(index => mobileButton('socket-gem', `IN SOCKEL ${index + 1} EINSETZEN`, `data-mobile-socket="${index}" data-mobile-target="${target.id}"`)).join('');
        if (!slots.length) actions += '<p>Wähle ein ausgerüstetes Teil mit einem freien Sockelplatz.</p>';
      } else actions += mobileButton('gem-workshop', 'ZUR EDELSTEINVERWALTUNG');
    }
  }
  if (slotEntry) {
    actions += mobileButton('unequip', 'ABLEGEN', `data-mobile-slot="${slotEntry.slot}" data-mobile-owner="${slotEntry.owner}"`);
    if (AFFIX_POOLS[item.slot] || item.slot === 'glyph') actions += mobileButton('forge', isMythicWeapon(item) ? 'MYSTISCH AUFWERTEN' : 'AUFWERTEN');
    if (socketCapacityForSlot(item.slot, item)) actions += mobileButton('sockets', 'SOCKEL VERWALTEN');
  }
  const enchantable = ['weapons', 'armor', 'jewelry'].some(category => INVENTORY_CATEGORIES[category].slots.includes(item.slot));
  if (!preview && (slotEntry && enchantable || item.slot === 'pet')) actions += mobileButton('enchant', 'VERZAUBERN');
  const petDetails = item.slot === 'pet' ? `<p>Stufe ${number(item.level)} · fest an ${ownerClass === state.mainClass ? 'deinen Main' : 'deinen Gefährten'} gebunden.</p><p>+${number(item.level * PET_RULES.attributePerLevel)} ${escapeHtml(petDefinition(item).stat)}. Tierstufen am Altar erhöhen; Affixe über Verzauberung umprägen.</p>` : '';
  const content = `${ownerPicker}${mobileItemIconMarkup(item)}${renderItemTooltipContent(item, { ownerClass, milestoneDescription: description })}${petDetails}${inventoryItem && compatibleSlots(ownerClass).length ? '<p class="mobile-detail-note">Aufwertung und Sockel gehören zum Ausrüstungsplatz. Für die Werkstatt zuerst anlegen.</p>' : ''}`;
  showMobileSheet(item.name, content, actions);
}
function openMobileShopBox(group) {
  const offer = SHOP_OFFERS.find(entry => entry.group === group && entry.purchasable !== false);
  if (!offer) return;
  const quote = shopOfferQuote(group);
  shopQuantities[group] = quote.quantity;
  mobileItemContext = null;
  const item = makeLuckyBoxItem(group);
  const content = `${mobileItemIconMarkup(item)}${renderItemTooltipContent(item)}`;
  const actions = `<div class="mobile-shop-quantity"><label>Menge<input class="ui-control ui-field" type="number" inputmode="numeric" min="${quote.maxQuantity ? 1 : 0}" max="${quote.maxQuantity}" step="1" value="${quote.quantity}" data-mobile-shop-quantity="${group}" ${quote.maxQuantity ? '' : 'disabled'}></label><strong data-mobile-shop-total>${number(quote.totalPrice || quote.unitPrice)} Seelen</strong></div><button class="ui-control ui-button" type="button" data-mobile-shop-box-buy="${group}" ${quote.unavailable ? 'disabled' : ''}>Kaufen</button>`;
  showMobileSheet(offer.title, content, actions);
  mobileSheet.dataset.shopGroup = group;
}
document.addEventListener('input', event => {
  const input = event.target.closest('[data-mobile-shop-quantity]');
  if (!input || !mobileSheet.contains(input)) return;
  const group = input.dataset.mobileShopQuantity;
  const quote = shopOfferQuote(group, input.value);
  shopQuantities[group] = quote.quantity;
  input.max = String(quote.maxQuantity);
  if (input.value !== '') input.value = String(quote.quantity);
  mobileSheet.querySelector('[data-mobile-shop-total]').textContent = `${number(quote.totalPrice || quote.unitPrice)} Seelen`;
  mobileSheet.querySelector('[data-mobile-shop-box-buy]').disabled = quote.unavailable || mobileActionPending;
});
function syncMobileView({ background = false, root = viewContainer } = {}) {
  syncMobileStatusPlacement();
  syncMobileFooter();
  const inventory = root.querySelector('.inventory-view');
  if (inventory) {
    inventory.dataset.mobilePane = inventory.classList.contains('equipment-view') ? 'character' : 'items';
    syncMobileInventory(inventory);
    const hint = inventory.querySelector('.inventory-hint');
    if (hint) {
      hint.dataset.desktopHint ||= hint.textContent;
      hint.textContent = isMobileLayout() ? 'Gegenstand antippen für Details und Aktionen.' : hint.dataset.desktopHint;
    }
    inventory.querySelectorAll('[draggable]').forEach(card => {
      card.dataset.desktopDraggable ||= card.getAttribute('draggable');
      card.draggable = !isMobileLayout() && card.dataset.desktopDraggable === 'true';
    });
  }
  if (!background && isMobileLayout()) tooltip.classList.remove('visible');
  syncMobileWorkshop(root);
  const abilities = root.querySelector('.abilities-view');
  if (abilities) syncMobileInventory(abilities);
  syncMobileSkillTree(root);
  syncMobileAreaList(root);
  syncMobileMap(root);
  syncMobilePageLabels(root);
  const towerAttempts = root.querySelector('[data-daily-attempts="tower"]');
  if (towerAttempts) towerAttempts.textContent = towerAttemptSummary();
  root.querySelectorAll('.codex-table-wrap').forEach(wrapper => {
    wrapper.tabIndex = 0; wrapper.setAttribute('role', 'region'); wrapper.setAttribute('aria-label', 'Tabelle, seitlich scrollbar');
  });
}
function syncMobilePageLabels(root = viewContainer) {
  const labels = [
    ['TURMREGELN IM KODEX', 'Turmregeln im Kodex'], ['RANGSTUFEN IM KODEX', 'Rangstufen im Kodex'],
    ['GEBIETE IM KODEX', 'Gebiete im Kodex'], ['KEINE VERSUCHE MEHR', 'Keine Versuche mehr'],
    ['ALLE PUNKTE ZURÜCKSETZEN', 'Alle Punkte zurücksetzen'], ['ALLE BOXEN ÖFFNEN', 'Alle Boxen öffnen'],
    ['FÄHIGKEIT AUSRÜSTEN', 'Fähigkeit ausrüsten'], ['BEREITS AUSGERÜSTET', 'Bereits ausgerüstet'],
    ['BOSS HERAUSFORDERN', 'Boss herausfordern'], ['TURM BETRETEN', 'Turm betreten'],
    ['KAMPF LÄUFT', 'Kampf läuft'], ['KAMPF STARTEN', 'Kampf starten'],
    ['AUFSTUFEN', 'Aufstufen'], ['KAUFEN', 'Kaufen'], ['ABHOLEN', 'Abholen'],
    ['NOCH OFFEN', 'Noch offen'], ['ABGEHOLT', 'Abgeholt'], ['BELOHNUNG ABHOLEN', 'Belohnung abholen'],
  ];
  root.querySelectorAll('.abilities-category-switch [data-ability-category]:not([data-inspect-ability])').forEach(button => {
    const text = button.firstChild;
    if (text?.nodeType !== Node.TEXT_NODE) return;
    button.dataset.mobileCategoryCopy ||= text.textContent;
    text.textContent = isMobileLayout() ? (button.dataset.abilityCategory === 'active' ? 'Aktiv' : 'Passiv') : button.dataset.mobileCategoryCopy;
  });
  const buttons = [...root.querySelectorAll('button.ui-button, a.codex-panel-link')];
  if (root.matches?.('button.ui-button, a.codex-panel-link')) buttons.push(root);
  buttons.forEach(button => {
    const texts = [...button.childNodes].filter(node => node.nodeType === Node.TEXT_NODE);
    if (!isMobileLayout()) {
      if (button.dataset.mobileActionCopy) {
        const originals = JSON.parse(button.dataset.mobileActionCopy);
        texts.forEach((text, index) => { if (originals[index] !== undefined) text.textContent = originals[index]; });
        delete button.dataset.mobileActionCopy;
      }
      return;
    }
    // Explicit labels preserve German noun capitalization, amounts and child icons.
    const originals = texts.map(text => text.textContent);
    let changed = false;
    texts.forEach(text => {
      const value = text.textContent;
      const label = labels.find(([original]) => value.trimStart().startsWith(original));
      if (!label) return;
      text.textContent = value.replace(label[0], label[1]);
      changed ||= text.textContent !== value;
    });
    if (changed) button.dataset.mobileActionCopy = JSON.stringify(originals);
  });
}
function syncMobileInventory(inventory) {
  const owners = inventory.querySelector('.inventory-summary .party-owner-switch, .skill-tree-toolbar .party-owner-switch, .party-owner-switch[data-party-context="abilities"], .mobile-inventory-owners');
  const expansion = inventory.querySelector('.inventory-expansion-controls');
  if (isMobileLayout()) {
    if (owners && !owners.classList.contains('mobile-inventory-owners')) {
      owners.classList.add('mobile-inventory-owners');
      owners.setAttribute('aria-label', 'Main oder Gefährte anzeigen');
      owners.querySelectorAll('[data-party-owner]').forEach(button => {
        const info = CLASSES[button.dataset.ownerClass];
        button.dataset.desktopLabel = button.innerHTML;
        button.title = button.textContent.trim();
        button.setAttribute('aria-label', button.title);
        button.innerHTML = assetIconMarkup(info.asset, info.icon, 'mobile-inventory-owner-icon');
      });
      inventory.append(owners);
    }
    const grid = inventory.querySelector('.inventory-main > .inventory-grid');
    if (grid && expansion) grid.after(expansion);
    if (grid && expansion) {
      let sell = expansion.querySelector('[data-mobile-sell-category]');
      if (!sell) {
        sell = document.createElement('button');
        sell.type = 'button'; sell.className = 'mobile-inventory-sell-filter ui-control ui-button';
        sell.dataset.mobileSellCategory = '';
        expansion.append(sell);
      }
      const ownerClass = inventory.querySelector('[data-inventory-owner]')?.dataset.inventoryOwner;
      const category = itemGridPreferences.inventory.category;
      const items = inventorySaleCandidates(state, ownerClass, category);
      sell.textContent = `Alle verkaufen (${items.length})`;
      sell.disabled = !items.length;
      sell.setAttribute('aria-label', `${items.length} Gegenstände aus ${INVENTORY_CATEGORIES[category]?.label || 'dieser Kategorie'} verkaufen`);
      expansion.setAttribute('aria-label', 'Inventar verwalten');
    }
  } else {
    expansion?.querySelector('[data-mobile-sell-category]')?.remove();
    expansion?.setAttribute('aria-label', 'Inventarplätze kaufen');
    if (owners?.classList.contains('mobile-inventory-owners')) {
      owners.classList.remove('mobile-inventory-owners');
      owners.setAttribute('aria-label', 'Charakter auswählen');
      owners.querySelectorAll('[data-party-owner]').forEach(button => {
        button.innerHTML = button.dataset.desktopLabel;
        delete button.dataset.desktopLabel;
        button.removeAttribute('title');
        button.removeAttribute('aria-label');
      });
      (inventory.querySelector('.inventory-summary, .skill-tree-toolbar') || inventory.querySelector('.view-heading > .page-heading-aside') || inventory.querySelector(':scope > .view-heading')).append(owners);
    }
    if (expansion) inventory.querySelector('.inventory-main > .item-grid-controls')?.append(expansion);
  }
}
function showMobilePowerups() {
  mobileItemContext = null;
  const active = (state?.activePowerups || []).filter(entry => entry.expiresAt > Date.now());
  const available = Number(document.querySelector('[data-activate-powerups]')?.dataset.availablePowerups) || 0;
  showMobileSheet('Power-ups', `<p>${active.length} aktiv · ${available} bereit</p><div class="tooltip-affixes">${active.map(entry => `<span>${escapeHtml('+10 % ' + entry.stat)} · bis ${escapeHtml(new Date(entry.expiresAt).toLocaleTimeString('de-DE'))}</span>`).join('') || '<p>Keine Power-ups aktiv.</p>'}</div><p>Aktiviert ein Exemplar je verfügbarem Power-up-Typ. Weitere Exemplare verlängern die Laufzeit.</p>`, available ? '<button class="ui-control ui-button" type="button" data-mobile-activate-powerups>VERFÜGBARE POWER-UPS AKTIVIEREN</button>' : '');
}
function captureMobileViewState() {
  const viewport = viewContainer.querySelector('.mobile-skill-viewport');
  if (!viewport) return;
  mobileSkillView.left = viewport.scrollLeft;
  mobileSkillView.top = viewport.scrollTop;
}
function syncMobileSkillTree(root = viewContainer) {
  const board = root.querySelector('.skill-tree-board');
  if (!board) return;
  syncMobileInventory(board.closest('.skill-tree-view'));
  let viewport = board.querySelector('.mobile-skill-viewport');
  if (!isMobileLayout()) {
    if (viewport) { viewport.before(viewport.querySelector('svg')); viewport.remove(); }
    board.querySelector('.mobile-skill-controls')?.remove();
    return;
  }
  if (mobileSkillView.owner !== selectedSkillTreeOwner) {
    mobileSkillView.owner = selectedSkillTreeOwner; mobileSkillView.left = 0; mobileSkillView.top = 0;
  }
  if (!viewport) {
    viewport = document.createElement('div');
    viewport.className = 'mobile-skill-viewport';
    viewport.tabIndex = 0; viewport.setAttribute('role', 'region'); viewport.setAttribute('aria-label', 'Verschiebbarer Talentbaum');
    const svg = board.querySelector('svg');
    svg.before(viewport); viewport.append(svg);
  }
  viewport.style.setProperty('--mobile-tree-zoom', MOBILE_SKILL_TREE_SCALE);
  viewport.scrollLeft = mobileSkillView.left; viewport.scrollTop = mobileSkillView.top;
}
function openMobileSkillDetails(nodeId) {
  if (!isMobileLayout() || currentView !== 'skilltree') return;
  selectedSkillTreeNodeId = nodeId;
  const template = document.createElement('template');
  template.innerHTML = renderSkillTree();
  const detail = template.content.querySelector('.skill-tree-detail');
  if (!detail) return;
  const title = detail.querySelector('h2').textContent;
  detail.querySelector('h2').remove();
  mobileItemContext = null;
  showMobileSheet(title, detail.outerHTML);
  mobileSheet.dataset.skillDetails = nodeId;
}
function openMobileAbilityDetails(type, index) {
  if (!isMobileLayout() || currentView !== 'companions' || !inspectAbility(type, index)) return;
  const template = document.createElement('template');
  template.innerHTML = renderCompanions();
  const detail = template.content.querySelector('.ability-inspector');
  if (!detail) return;
  const title = detail.querySelector('h2').textContent;
  detail.querySelector('h2').remove();
  mobileItemContext = null;
  showMobileSheet(title, detail.outerHTML);
  mobileSheet.dataset.abilityDetails = `${type}:${index}`;
}
function syncMobileAreaList(root = viewContainer) {
  const frame = root.querySelector('.atlas-map-frame');
  if (!frame || frame.querySelector('.mobile-area-list')) return;
  const list = document.createElement('div');
  list.className = 'mobile-area-list'; list.setAttribute('role', 'group'); list.setAttribute('aria-label', 'Gebiet wählen');
  frame.querySelectorAll('.atlas-node').forEach(node => {
    const button = node.cloneNode(true);
    button.removeAttribute('style'); button.className = `ui-control ui-choice ${node.classList.contains('selected') ? 'is-selected' : ''}`;
    button.setAttribute('aria-pressed', String(node.classList.contains('selected')));
    list.append(button);
  });
  frame.append(list);
}
function syncMobileMap(root = viewContainer) {
  const card = root.querySelector('.expedition-card');
  if (!card) return;
  root.querySelectorAll('.atlas-map .atlas-node').forEach(node => {
    if (isMobileLayout()) {
      node.tabIndex = -1;
      node.setAttribute('aria-hidden', 'true');
    } else {
      node.removeAttribute('tabindex');
      node.removeAttribute('aria-hidden');
    }
  });
  const shell = root.querySelector('.atlas-shell');
  if (!shell.querySelector('.mobile-map-heading')) {
    const heading = document.createElement('header');
    heading.className = 'mobile-map-heading';
    heading.innerHTML = root.querySelector('.atlas-heading > div').innerHTML;
    shell.prepend(heading);
  }
  if (!card.querySelector('[data-mobile-map-details]')) {
    const button = document.createElement('button');
    button.type = 'button'; button.className = 'mobile-map-details ui-control ui-button';
    button.dataset.mobileMapDetails = ''; button.textContent = 'Gebietsinfos';
    card.append(button);
  }
  const difficultyLabel = card.querySelector('.deep-tier-control > span');
  card.querySelector('#deep-tier-select')?.setAttribute('aria-label', 'Schwierigkeit');
  const launch = card.querySelector('.expedition-launch');
  for (const [node, mobileCopy] of [[difficultyLabel, 'Schwierigkeit'], [launch, 'Kampf starten']]) {
    if (!node) continue;
    node.dataset.desktopCopy ||= node.textContent;
    node.textContent = isMobileLayout() ? mobileCopy : node.dataset.desktopCopy;
  }
  const bonus = card.querySelector('.first-clear-note');
  if (bonus) {
    bonus.dataset.desktopCopy ||= bonus.textContent;
    bonus.textContent = isMobileLayout()
      ? `Erstabschluss: +${number(areaFirstClearSouls(selectedAreaId, selectedDeepTier || 0))} Seelen · ${number(BALANCE.loot.firstClearFarmBoxes)} Farm-Boxen`
      : bonus.dataset.desktopCopy;
  }
}
function syncMobileBattle({ focus = true } = {}) {
  const overlay = document.getElementById('battle-overlay');
  if (!overlay) return;
  const panel = overlay.querySelector('.battle-window');
  const header = panel.querySelector('.battle-header');
  const actions = panel.querySelector('.battle-header-actions');
  const title = header.querySelector('h2');
  const eyebrow = header.querySelector('.eyebrow');
  const scene = panel.querySelector('.battle-scene');
  const mobile = isMobileLayout();
  if (mobile) {
    let footer = panel.querySelector('.mobile-battle-footer');
    if (!footer) {
      footer = document.createElement('footer');
      footer.className = 'mobile-battle-footer';
      footer.setAttribute('aria-label', 'Kampfsteuerung');
      panel.append(footer);
    }
    if (actions) footer.append(actions);
    if (!scene.querySelector('.mobile-battle-enemy-heading')) {
      const enemies = document.createElement('strong');
      enemies.className = 'mobile-battle-enemy-heading';
      const count = scene.querySelectorAll('.battle-enemy[data-enemy]').length;
      enemies.textContent = `${count > 1 ? `${count} × ` : ''}${battle.enemyName}`;
      scene.prepend(enemies);
    }
    title.id = 'mobile-battle-title';
    title.tabIndex = -1;
  } else {
    if (actions) header.append(actions);
    panel.querySelector('.mobile-battle-footer')?.remove();
    scene.querySelector('.mobile-battle-enemy-heading')?.remove();
    title.removeAttribute('id');
    title.removeAttribute('tabindex');
    overlay.removeAttribute('role');
    overlay.removeAttribute('aria-modal');
    overlay.removeAttribute('aria-labelledby');
    overlay.removeAttribute('aria-label');
  }
  const mobileEyebrow = battle.mode === 'boss' ? 'BOSSPRÜFUNG' : battle.mode === 'tower' ? 'TURM DER NAMENLOSEN' : 'GEBIETSKAMPF';
  for (const [node, copy] of [[eyebrow, mobileEyebrow], [panel.querySelector('[data-hide-battle]'), 'Minimieren']]) {
    if (!node) continue;
    node.dataset.desktopCopy ||= node.textContent;
    node.textContent = mobile ? copy : node.dataset.desktopCopy;
  }
  panel.querySelectorAll('.battle-hero-damage > small').forEach(label => {
    label.dataset.desktopCopy ||= label.textContent;
    label.textContent = mobile ? 'SCHADEN' : label.dataset.desktopCopy;
  });
  if (!mobile) return;
  overlay.setAttribute('role', 'dialog');
  overlay.setAttribute('aria-modal', 'true');
  overlay.setAttribute('aria-labelledby', title.id);
  if (focus) title.focus({ preventScroll: true });
}
function openMobileWorkshop(action, item) {
  if (['forge', 'sockets', 'gem-workshop', 'glyph-fusion'].includes(action)) {
    openMobileItemWorkshop(item.id, action === 'forge' ? 'upgrade' : action === 'gem-workshop' ? 'gem' : action === 'glyph-fusion' ? 'fusion' : 'sockets');
    return;
  }
  if (activeWorkshopJob || forgeAnimationInProgress || glyphFusionPending) {
    toastMessageFor('Werkstatt beschäftigt', 'Beende den laufenden Vorgang über den Werkstattstatus, bevor du einen anderen Gegenstand bearbeitest.');
    return;
  }
  if (!mobileWorkshopReturn || !['blacksmith', 'sockets', 'enchant'].includes(currentView)) {
    mobileWorkshopReturn = { view: currentView, scroll: window.scrollY, itemId: item.id };
  }
  const view = action === 'forge' ? 'blacksmith' : action === 'enchant' ? 'enchant' : 'sockets';
  if (view === 'blacksmith') { selectedForgeMode = isMythicWeapon(item) ? 'mythic' : 'upgrade'; selectedForForge.clear(); selectedForForge.add(item.id); }
  if (view === 'sockets') { selectedSocketMode = 'gems'; if (action !== 'gem-workshop') selectedSocketTargetId = item.id; }
  if (view === 'enchant') { selectedEnchantMode = item.slot === 'pet' ? 'pet' : 'affix'; selectedEnchantTargetId = item.id; }
  mobileWorkshopPanes[view] = action === 'gem-workshop' ? 'selection' : 'workbench';
  mobileSheet.close();
  setView(view, null, { preserveForgeSelection: true });
}
function syncMobileWorkshop(root = viewContainer) {
  const layout = root.querySelector('.smith-layout, .socket-layout, .enchant-layout');
  if (!layout) return;
  layout.dataset.mobileFixedTarget = String(currentView === 'enchant' && Boolean(mobileWorkshopReturn));
  layout.dataset.mobileWorkshopPane = mobileWorkshopPanes[currentView] || 'selection';
  if (!root.querySelector('[data-mobile-workshop-tabs]')) {
    const tabs = document.createElement('div');
    tabs.className = 'mobile-workspace-tabs';
    tabs.dataset.mobileWorkshopTabs = '';
    tabs.setAttribute('role', 'group');
    tabs.setAttribute('aria-label', 'Werkstattbereich');
    tabs.innerHTML = '<button class="ui-control ui-choice" type="button" data-mobile-workshop-pane="selection">AUSWAHL</button><button class="ui-control ui-choice" type="button" data-mobile-workshop-pane="workbench">BEARBEITEN</button>';
    layout.before(tabs);
  }
  layout.removeAttribute('aria-pressed');
  root.querySelectorAll('button[data-mobile-workshop-pane]').forEach(button => button.setAttribute('aria-pressed', String(button.dataset.mobileWorkshopPane === layout.dataset.mobileWorkshopPane)));
  if (mobileWorkshopReturn && !root.querySelector('[data-mobile-workshop-back]')) {
    const back = document.createElement('button');
    back.type = 'button'; back.className = 'mobile-workshop-back ui-control ui-button';
    back.dataset.mobileWorkshopBack = ''; back.textContent = 'ZURÜCK ZUM GEGENSTAND';
    root.prepend(back);
  }
  const workbench = layout.querySelector('.forge-workbench, .socket-workbench, .enchant-workbench');
  if (workbench && !workbench.querySelector('[data-mobile-workshop-details]')) {
    const info = document.createElement('button');
    info.type = 'button'; info.className = 'mobile-workshop-back ui-control ui-button';
    info.dataset.mobileWorkshopDetails = ''; info.textContent = 'GEGENSTANDSDETAILS';
    workbench.prepend(info);
  }
  const detailButton = workbench?.querySelector('[data-mobile-workshop-details]');
  if (detailButton) detailButton.disabled = !mobileWorkshopItemId();
  if (currentView === 'sockets' && selectedSocketMode === 'gems' && !root.querySelector('[data-mobile-socket-target]')) {
    const label = document.createElement('label');
    label.className = 'mobile-socket-target mobile-owner-label';
    const targets = workshopEquipmentItems(state).filter(item => socketCapacityForSlot(item.slot, item));
    label.innerHTML = `Ausrüstungsplatz<select class="ui-control ui-select" data-mobile-socket-target aria-label="Ausrüstung für Edelsteine">${targets.map(item => `<option value="${item.id}" ${item.id === selectedSocketTargetId ? 'selected' : ''}>${escapeHtml(workshopSlotLabel(item))} · ${escapeHtml(item.name)}</option>`).join('')}</select>`;
    layout.before(label);
  }
  const hint = root.querySelector('.socket-management-hint');
  if (hint) {
    hint.dataset.desktopHint ||= hint.textContent;
    hint.textContent = isMobileLayout() ? 'Freien Sockel antippen und einen Edelstein wählen. Belegten Sockel antippen für Details und Entnehmen.' : hint.dataset.desktopHint;
  }
}
function mobileWorkshopItemId() {
  if (currentView === 'blacksmith') return selectedForgeMode === 'glyphs' ? lastFusedGlyphId || [...selectedGlyphsForFusion][0] : [...selectedForForge][0];
  if (currentView === 'sockets') return selectedSocketMode === 'upgrade' ? selectedSocketUpgradeGemId : selectedSocketTargetId;
  return selectedEnchantTargetId;
}
async function runMobileItemAction(button) {
  const item = mobileCurrentItem();
  if (!item || mobileActionPending || mobileItemContext.preview) return;
  const ownerClass = mobileItemContext.ownerClass;
  const action = button.dataset.mobileAction;
  if (['forge', 'sockets', 'enchant', 'gem-workshop', 'glyph-fusion'].includes(action)) {
    openMobileWorkshop(action, item);
    return;
  }
  mobileActionPending = true;
  mobileSheet.querySelectorAll('button, select').forEach(control => control.disabled = true);
  try {
    let result;
    if (action === 'equip') result = await performAction({ action: ownerClass === state.mainClass ? 'equip-main' : 'equip-companion', itemId: item.id, class: ownerClass, slot: button.dataset.mobileSlot }, 'Ausrüstung angelegt');
    else if (action === 'unequip') result = await performAction({ action: 'unequip', slot: button.dataset.mobileSlot, owner: button.dataset.mobileOwner === 'main' ? 'main' : 'companion', class: button.dataset.mobileOwner === 'main' ? state.mainClass : button.dataset.mobileOwner }, 'Gegenstand abgelegt');
    else if (action === 'sell') result = await performAction({ action: 'sell', itemId: item.id }, 'Gegenstand verkauft');
    else if (action === 'use') result = await performAction({ action: button.dataset.useAction, itemId: item.id }, 'Gegenstand verwendet');
    else if (action === 'box') {
      result = await performAction({ action: 'open-lucky-box', itemId: item.id });
      if (result?.jackpot) { mobileSheet.close(); showLuckyBoxJackpotModal(result); }
    } else if (action === 'socket-gem') result = await performAction({ action: 'socket-gem', itemId: button.dataset.mobileTarget, gemId: item.id, socketIndex: Number(button.dataset.mobileSocket) }, 'Edelstein eingesetzt');
    if (result && mobileSheet.open) mobileSheet.close();
    else if (mobileSheet.open) renderMobileItem();
  } finally {
    mobileActionPending = false;
    mobileSheet.querySelectorAll('button, select').forEach(control => control.disabled = false);
  }
}
// Capture item taps before desktop single-click sale, box and unequip handlers.
document.addEventListener('click', event => {
  if (!isMobileLayout()) return;
  const stop = () => { event.preventDefault(); event.stopImmediatePropagation(); };
  if (event.target.closest('[data-mobile-close]')) { stop(); mobileSheet.close(); return; }
  const sellCategory = event.target.closest('[data-mobile-sell-category]');
  if (sellCategory) {
    stop();
    if (sellCategory.disabled || mobileActionPending || currentView !== 'inventory') return;
    const ownerClass = viewContainer.querySelector('[data-inventory-owner]')?.dataset.inventoryOwner;
    const category = itemGridPreferences.inventory.category;
    const items = inventorySaleCandidates(state, ownerClass, category);
    if (!items.length) return;
    const value = items.reduce((sum, item) => sum + itemSaleValue(item), 0);
    const count = items.reduce((sum, item) => sum + Math.max(1, Math.floor(Number(item.quantity) || 1)), 0);
    mobileItemContext = null;
    showMobileSheet('Kategorie verkaufen', `<p>${escapeHtml(INVENTORY_CATEGORIES[category]?.label || 'Alle Kategorien')} · ${escapeHtml(CLASSES[ownerClass].label)}</p><p><strong>${number(count)} Gegenstände</strong> für <strong>${number(value)} Seelen</strong> verkaufen?</p><p class="mobile-detail-note">Mythische und angelegte Gegenstände bleiben erhalten. Neu eintreffende Beute wird nicht mitverkauft.</p>`, '<button class="primary-button ui-control ui-button" type="button" data-mobile-confirm-category-sale>Alle angezeigten Gegenstände verkaufen</button>');
    mobileBulkSale = { ownerClass, category, itemIds: items.map(item => item.id) };
    return;
  }
  const confirmSale = event.target.closest('[data-mobile-confirm-category-sale]');
  if (confirmSale) {
    stop();
    if (confirmSale.disabled || mobileActionPending || !mobileBulkSale) return;
    const selection = mobileBulkSale;
    mobileActionPending = true;
    confirmSale.disabled = true;
    performAction({ action: 'sell-inventory-category', ...selection }, 'Kategorie verkauft', result => `${number(result.count)} Gegenstände · ${number(result.value)} Seelen`)
      .then(() => { if (mobileSheet.open && mobileBulkSale === selection) mobileSheet.close(); })
      .finally(() => { mobileActionPending = false; });
    return;
  }
  const abilityEquip = event.target.closest('[data-skill-class]');
  if (abilityEquip && mobileSheet.contains(abilityEquip) && mobileSheet.dataset.abilityDetails) {
    stop();
    if (abilityEquip.disabled || mobileActionPending) return;
    const key = mobileSheet.dataset.abilityDetails;
    const type = abilityEquip.dataset.skillType;
    const index = Number(abilityEquip.dataset.skillIndex);
    mobileActionPending = true;
    abilityEquip.disabled = true;
    performAction({ action: 'companion-skill', class: abilityEquip.dataset.skillClass, skillType: type, skillIndex: index, passiveSlot: Number(abilityEquip.dataset.passiveSlotIndex || 0) }, 'Fähigkeit gewählt', 'Die Auswahl ist gespeichert.')
      .finally(() => {
        mobileActionPending = false;
        if (mobileSheet.open && mobileSheet.dataset.abilityDetails === key) openMobileAbilityDetails(type, index);
      });
    return;
  }
  const skillAction = event.target.closest('[data-allocate-skill-node], [data-skill-tree-respec]');
  if (skillAction && mobileSheet.contains(skillAction) && mobileSheet.dataset.skillDetails) {
    stop();
    if (skillAction.disabled || mobileActionPending) return;
    const nodeId = mobileSheet.dataset.skillDetails;
    const payload = skillAction.hasAttribute('data-allocate-skill-node')
      ? { action: 'skill-tree-allocate', class: skillAction.dataset.skillOwner, nodeId: skillAction.dataset.allocateSkillNode, points: skillAction.dataset.skillPoints || 1 }
      : { action: 'skill-tree-respec', class: skillAction.dataset.skillTreeRespec };
    mobileActionPending = true;
    mobileSheet.querySelectorAll('[data-allocate-skill-node], [data-skill-tree-respec]').forEach(button => button.disabled = true);
    performAction(payload).finally(() => {
      mobileActionPending = false;
      if (mobileSheet.open && mobileSheet.dataset.skillDetails === nodeId) openMobileSkillDetails(nodeId);
    });
    return;
  }
  const shopBuy = event.target.closest('[data-mobile-shop-box-buy], [data-mobile-shop-equipment-buy]');
  if (shopBuy && mobileSheet.contains(shopBuy)) {
    stop();
    if (shopBuy.disabled || mobileActionPending) return;
    const group = shopBuy.dataset.mobileShopBoxBuy;
    const quote = group ? shopOfferQuote(group, mobileSheet.querySelector('[data-mobile-shop-quantity]')?.value) : null;
    if (quote?.unavailable) { openMobileShopBox(group); return; }
    const payload = group ? { action: 'buy', group, quantity: quote.quantity } : { action: 'buy-equipment-offer', offerId: shopBuy.dataset.mobileShopEquipmentBuy };
    mobileActionPending = true;
    shopBuy.disabled = true;
    performAction(payload, 'Gekauft').then(result => {
      if (!mobileSheet.contains(shopBuy)) return;
      if (result) mobileSheet.close();
      else shopBuy.disabled = false;
    }).finally(() => { mobileActionPending = false; });
    return;
  }
  const shopBox = event.target.closest('[data-mobile-shop-box]');
  if (shopBox) { stop(); openMobileShopBox(shopBox.dataset.mobileShopBox); return; }
  const action = event.target.closest('[data-mobile-action]');
  if (action) { stop(); runMobileItemAction(action); return; }
  if (event.target.closest('[data-mobile-map-details]')) {
    stop(); mobileItemContext = null;
    const card = viewContainer.querySelector('.expedition-card');
    const content = [...card.querySelectorAll(':scope > .eyebrow, :scope > h3, .expedition-description, .expedition-notes, .codex-panel-link')].map(node => node.outerHTML).join('');
    showMobileSheet(card.querySelector('h2').textContent, content); return;
  }
  if (event.target.closest('[data-open-codex-section]') && mobileSheet.contains(event.target)) mobileSheet.close();
  const identity = event.target.closest('#player-identity');
  if (identity) {
    stop(); toggleMobileStatus(false); setView('profile'); return;
  }
  if (event.target.closest('#world-event-slot') && currentWorldEvent) {
    stop(); mobileItemContext = null;
    showMobileSheet('Welt-Event', `<p>${escapeHtml(worldEventDescription(currentWorldEvent))}</p><p>Wechsel in ${formatWorldEventTime(worldEventDeadline - Date.now())}.</p>`); return;
  }
  if (event.target.closest('[data-active-powerups]')) { stop(); showMobilePowerups(); return; }
  if (event.target.closest('[data-mobile-activate-powerups]')) {
    stop(); if (mobileActionPending) return; mobileActionPending = true;
    event.target.closest('button').disabled = true;
    performAction({ action: 'activate-all-powerups' }).then(result => { if (result) mobileSheet.close(); })
      .finally(() => { mobileActionPending = false; mobileSheet.querySelectorAll('button').forEach(button => button.disabled = false); });
    return;
  }
  if (event.target.closest('[data-hunting-event-tooltip]')) {
    stop(); mobileItemContext = null;
    const ready = huntingEventRewardTier(state?.huntingEvent) >= 0;
    showMobileSheet('Jagd-Event', renderHuntingEventTooltip(), ready ? `<button class="ui-control ui-button" type="button" data-mobile-claim-hunt="${escapeHtml(state.huntingEvent.id)}">BELOHNUNG ABHOLEN</button>` : ''); return;
  }
  const claimHunt = event.target.closest('[data-mobile-claim-hunt]');
  if (claimHunt) {
    stop(); if (mobileActionPending) return; mobileActionPending = true; claimHunt.disabled = true;
    performAction({ action: 'claim-hunting-event', eventId: claimHunt.dataset.mobileClaimHunt }).then(result => { if (result) mobileSheet.close(); })
      .finally(() => { mobileActionPending = false; claimHunt.disabled = false; }); return;
  }
  const questReward = event.target.closest('[data-quest-reward]');
  if (questReward) {
    stop(); const preview = questRewardPreviews.get(questReward.dataset.questReward); if (!preview) return;
    if (preview.item) openMobileItem(preview.item, questReward, { preview: true, description: '<p>Vorschau der Auftragsbelohnung. Zum Erhalten die Belohnung auf der Auftragsseite abholen.</p>' });
    else { mobileItemContext = null; showMobileSheet('Auftragsbelohnung', questRewardDescriptionMarkup(preview.reward)); }
    return;
  }
  const offer = event.target.closest('[data-shop-offer-preview], [data-mobile-shop-equipment]');
  if (offer) { stop(); openMobileItem(state.shopEquipmentOffers.find(item => item.id === (offer.dataset.shopOfferPreview || offer.dataset.mobileShopEquipment)), offer, { preview: true, shopOffer: true }); return; }
  const mail = event.target.closest('[data-mailbox-item]');
  if (mail && !event.target.closest('[data-claim-mailbox]')) {
    stop(); openMobileItem(state.mailbox.find(entry => entry.id === mail.dataset.mailboxItem)?.item, mail, { preview: true, description: '<p>Dieser Gegenstand liegt im Briefkasten. Dort über Abholen ins Inventar übernehmen.</p>' }); return;
  }
  const milestone = event.target.closest('[data-contract-milestone]');
  if (milestone) {
    stop(); const reward = CONTRACT_MILESTONE_REWARDS[Number(milestone.dataset.contractMilestone)]; if (!reward) return;
    const item = [...state.inventory, ...equipmentSlotEntries(state).map(entry => entry.item)].find(entry => entry.name === reward.name && entry.slot === reward.kind)
      || { name: reward.name, slot: reward.kind, icon: reward.icon, rarityColor: 'common', rarity: RARITIES.find(rarity => rarity.color === 'common')?.name || 'Gewöhnlich', affixes: ['ring', 'amulet'].includes(reward.kind) ? [{ stat: 'Seelenfund', value: 10, baseValue: 10, fixed: true }] : [], ...(reward.set ? { set: reward.set } : {}) };
    openMobileItem(item, milestone, { preview: true, description: `<p>${escapeHtml(reward.description)}</p>` }); return;
  }
  const skillNode = event.target.closest('[data-skill-node]');
  if (skillNode) {
    stop(); if (Date.now() < mobileSkillDragUntil) return;
    selectedSkillTreeNodeId = skillNode.dataset.skillNode;
    renderView();
    return;
  }
  const abilityChoice = event.target.closest('[data-inspect-ability]');
  if (abilityChoice) {
    stop();
    if (Date.now() < mobileSkillDragUntil) return;
    if (inspectAbility(abilityChoice.dataset.abilityCategory, Number(abilityChoice.dataset.inspectAbility))) renderView();
    return;
  }
  const workshopPane = event.target.closest('button[data-mobile-workshop-pane]');
  if (workshopPane) { stop(); mobileWorkshopPanes[currentView] = workshopPane.dataset.mobileWorkshopPane; syncMobileWorkshop(); return; }
  if (event.target.closest('[data-mobile-workshop-back]') && mobileWorkshopReturn) {
    stop(); const origin = mobileWorkshopReturn; mobileWorkshopReturn = null;
    setView(origin.view);
    window.requestAnimationFrame(() => {
      window.scrollTo({ top: origin.scroll, behavior: 'instant' });
      const item = findInventoryOrEquippedItem(state, origin.itemId) || partyPets().find(pet => pet.id === origin.itemId);
      if (item) openMobileItem(item, viewContainer.querySelector(`[data-item-key="${CSS.escape(item.id)}"]`) || viewContainer);
    });
    return;
  }
  if (event.target.closest('[data-mobile-workshop-details]')) {
    stop(); const id = mobileWorkshopItemId();
    const item = findInventoryOrEquippedItem(state, id) || partyPets().find(pet => pet.id === id);
    if (item) openMobileItem(item, viewContainer);
    return;
  }
  const insertGem = event.target.closest('[data-mobile-insert-gem]');
  if (insertGem) {
    stop(); if (mobileActionPending) return;
    mobileActionPending = true;
    mobileSheet.querySelectorAll('button').forEach(button => button.disabled = true);
    performAction({ action: 'socket-gem', itemId: insertGem.dataset.mobileTarget, gemId: insertGem.dataset.mobileInsertGem, socketIndex: Number(insertGem.dataset.mobileSocket) }, 'Edelstein eingesetzt')
      .then(result => { if (result) mobileSheet.close(); })
      .finally(() => { mobileActionPending = false; mobileSheet.querySelectorAll('button').forEach(button => button.disabled = false); });
    return;
  }
  const removeGem = event.target.closest('[data-mobile-remove-gem]');
  if (removeGem) {
    stop(); if (mobileActionPending) return;
    mobileActionPending = true; removeGem.disabled = true;
    performAction({ action: 'unsocket-gem', itemId: removeGem.dataset.mobileTarget, socketIndex: Number(removeGem.dataset.mobileRemoveGem) }, 'Edelstein entnommen')
      .then(result => { if (result) mobileSheet.close(); })
      .finally(() => { mobileActionPending = false; removeGem.disabled = false; });
    return;
  }
  const socket = event.target.closest('[data-socket-slot], [data-unsocket-index]');
  if (socket && currentView === 'sockets') {
    stop(); const target = findInventoryOrEquippedItem(state, selectedSocketTargetId); if (!target) return;
    const index = Number(socket.dataset.socketSlot ?? socket.dataset.unsocketIndex);
    const gem = target.sockets?.[index];
    mobileItemContext = null;
    if (gem) showMobileSheet(`Sockel ${index + 1}`, renderItemTooltipContent(gem), `<button type="button" class="ui-control ui-button" data-mobile-remove-gem="${index}" data-mobile-target="${target.id}">EDELSTEIN ENTNEHMEN</button>`);
    else {
      const gems = state.inventory.filter(item => item.slot === 'weaponGem');
      showMobileSheet(`Edelstein für Sockel ${index + 1}`, `<p>${escapeHtml(target.name)}</p><div class="mobile-gem-picker">${gems.map(item => `<button type="button" class="ui-control ui-button" data-mobile-insert-gem="${item.id}" data-mobile-target="${target.id}" data-mobile-socket="${index}">${escapeHtml(item.name)} · ${escapeHtml(item.rarity)}${item.affixes?.map(affix => `<small>${escapeHtml(affix.stat)} +${number(affix.value)}</small>`).join('') || ''}</button>`).join('') || '<p>Keine Edelsteine im Inventar.</p>'}</div>`);
    }
    return;
  }
  if (event.target.closest('[data-forge-item], [data-socket-target-item], [data-enchant-target-item], [data-gem-upgrade-item]')) mobileWorkshopPanes[currentView] = 'workbench';
  if (event.target.closest('[data-forge-mode], [data-socket-mode], [data-enchant-mode]')) mobileWorkshopPanes[currentView] = 'selection';
  const gear = event.target.closest('[data-gear-slot]');
  const card = event.target.closest('[data-item-key]');
  if (gear) {
    stop();
    const item = gear.dataset.gearSlot === 'pet' ? petForClass(gear.dataset.gearClass) : equipmentForClass(gear.dataset.gearClass)[gear.dataset.gearSlot];
    if (item) openMobileItem(item, gear);
  } else if (card && ['inventory', 'shop'].includes(currentView) && !card.hasAttribute('data-shop-offer-preview')) {
    stop(); openMobileItem(state.inventory.find(item => item.id === card.dataset.itemKey), card);
  } else if (card && currentView === 'sockets' && selectedSocketMode === 'gems' && !card.hasAttribute('data-socket-target-item')) {
    stop(); openMobileItem(state.inventory.find(item => item.id === card.dataset.itemKey), card);
  }
}, true);
document.addEventListener('change', event => {
  if (event.target.matches('[data-mobile-socket-target]')) { selectedSocketTargetId = event.target.value; renderView(); return; }
  if (!event.target.matches('[data-mobile-item-owner]') || !mobileItemContext) return;
  mobileItemContext.ownerClass = event.target.value;
  renderMobileItem();
  mobileSheet.querySelector('[data-mobile-item-owner]')?.focus({ preventScroll: true });
});
document.addEventListener('pointerdown', event => {
  window.clearTimeout(mobileSkillHoldTimer);
  if (mobileSkillPointer || !event.isPrimary) { mobileSkillPointer = null; return; }
  if (!isMobileLayout() || !event.target.closest('.mobile-skill-viewport, .abilities-choice-list')) return;
  mobileSkillPointer = { id: event.pointerId, x: event.clientX, y: event.clientY };
  const node = event.target.closest('[data-skill-node], [data-inspect-ability]');
  if (node && event.button === 0) mobileSkillHoldTimer = window.setTimeout(() => {
    if (!mobileSkillPointer || !node.isConnected) return;
    mobileSkillDragUntil = Date.now() + 1000;
    node.focus({ preventScroll: true });
    if (node.hasAttribute('data-skill-node')) openMobileSkillDetails(node.dataset.skillNode);
    else openMobileAbilityDetails(node.dataset.abilityCategory, Number(node.dataset.inspectAbility));
  }, 500);
}, { passive: true });
document.addEventListener('pointermove', event => {
  if (mobileSkillPointer?.id === event.pointerId && Math.hypot(event.clientX - mobileSkillPointer.x, event.clientY - mobileSkillPointer.y) > 10) {
    window.clearTimeout(mobileSkillHoldTimer);
    mobileSkillDragUntil = Date.now() + 350;
  }
}, { passive: true });
document.addEventListener('pointerup', () => { window.clearTimeout(mobileSkillHoldTimer); mobileSkillPointer = null; }, { passive: true });
document.addEventListener('pointercancel', () => { window.clearTimeout(mobileSkillHoldTimer); if (mobileSkillPointer) mobileSkillDragUntil = Date.now() + 350; mobileSkillPointer = null; }, { passive: true });
document.addEventListener('contextmenu', event => {
  if (isMobileLayout() && event.target.closest('[data-skill-node], [data-inspect-ability]')) event.preventDefault();
});
document.addEventListener('keydown', event => {
  const node = event.target.closest('[data-skill-node], [data-inspect-ability]');
  if (!isMobileLayout() || !node || !['Enter', ' '].includes(event.key)) return;
  event.preventDefault(); event.stopImmediatePropagation();
  if (node.hasAttribute('data-skill-node')) openMobileSkillDetails(node.dataset.skillNode);
  else openMobileAbilityDetails(node.dataset.abilityCategory, Number(node.dataset.inspectAbility));
}, true);
function syncMobileVisualViewport() {
  const viewport = window.visualViewport;
  document.documentElement.style.setProperty('--mobile-visible-height', `${viewport?.height || window.innerHeight}px`);
  document.documentElement.style.setProperty('--mobile-visible-top', `${viewport?.offsetTop || 0}px`);
}
window.visualViewport?.addEventListener('resize', syncMobileVisualViewport);
window.visualViewport?.addEventListener('scroll', syncMobileVisualViewport);
window.addEventListener('resize', syncMobileVisualViewport);
syncMobileVisualViewport();
initMobileFooter();
syncMobileShell();
