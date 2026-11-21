// Black-market and forge page templates.
function renderShop() {
  syncEquipmentShop(state);
  const freeSlots = Math.max(0, state.inventoryCapacity - inventoryOccupiedSlots(state));
  const renderOfferCard = (group) => {
    const offer = SHOP_OFFERS.find((entry) => entry.group === group);
    const requested = Math.max(1, Math.floor(Number(shopQuantities[group]) || 1));
    const stackableOffer = STACKABLE_SHOP_GROUPS.has(group);
    const canUseExistingStack = stackableOffer && state.inventory.some((item) => item.slot === group);
    const consumesInventorySlot = !stackableOffer;
    const maxAffordable = maxAffordableShopQuantity(state, group);
    const maxQuantity = Math.min(maxAffordable, consumesInventorySlot ? freeSlots : 1000);
    const canPurchaseSpace = !consumesInventorySlot || freeSlots > 0 || canUseExistingStack;
    const quantity = canPurchaseSpace && maxQuantity > 0 ? Math.max(1, Math.min(requested, maxQuantity)) : 0;
    shopQuantities[group] = quantity;
    const unitPrice = shopPriceForLevel(partyLevel(state), group);
    const totalPrice = unitPrice * quantity;
    const displayedPrice = quantity ? totalPrice : unitPrice;
    const unavailable = !canPurchaseSpace || !quantity || state.souls < totalPrice;
    return `<article class="shop-card shop-product-card"><div class="shop-card-icon">${assetIconMarkup(offer.asset, offer.icon, 'shop-offer-image')}</div><div class="shop-card-copy"><span class="shop-type">${offer.category}</span><h3>${offer.title}</h3><p>${offer.subtitle}</p><div class="shop-purchase-controls"><label>MENGE<input class="ui-control ui-field ui-compact" type="number" min="${maxQuantity ? 1 : 0}" max="${maxQuantity}" step="1" value="${quantity}" data-shop-quantity="${group}" ${maxQuantity ? '' : 'disabled'} aria-label="Kaufmenge ${offer.title}"></label><div class="shop-price"><strong data-shop-total>\u2727 ${number(displayedPrice)} Seelen${quantity ? '' : ' / Stück'}</strong></div><button class="primary-button ui-control ui-button ui-compact purchase-button" type="button" data-buy="${group}" ${unavailable ? 'disabled' : ''}>KAUFEN</button></div></div></article>`;
  };
  const leftGroups = SHOP_OFFERS.filter(offer => offer.purchasable !== false).map(offer => offer.group);
  const equipmentOffers = state.shopEquipmentOffers.map((item, index) => {
    const price = equipmentShopPrice(item);
    const greaterCount = (item.affixes || []).filter(affix => affix.greater).length;
    const owners = dropPartyClasses(state).filter(owner => partyCanEquipDrop(item, { ...state, mainClass: owner, activeCompanion: null }));
    const disabled = state.souls < price || freeSlots < 1 || totalRewardStorageSlots(state) - 1 < reservedBossStorageSlots(state);
    return `<article class="shop-card shop-product-card shop-equipment-card">${itemCard(item, index, { shopOffer: true, draggable: false })}<div class="shop-card-copy"><span class="shop-type">${escapeHtml(item.rarity)}${greaterCount ? ` · ✦ ${greaterCount} Greater Affixe` : ''}</span><h3>${escapeHtml(item.name)}</h3><p>${owners.map(owner => escapeHtml(CLASSES[owner].label)).join(' / ')}${item.set ? ` · ${escapeHtml(item.set)}` : ''}</p><div class="shop-purchase-controls"><div class="shop-price"><strong>✧ ${number(price)} Seelen</strong></div><button class="primary-button ui-control ui-button ui-compact purchase-button" type="button" data-buy-equipment-offer="${item.id}" ${disabled ? 'disabled' : ''}>KAUFEN</button></div></div></article>`;
  }).join('');
  const inventoryPanel = `<section class="shop-inventory-panel item-selection"><div class="section-heading shop-heading sell-heading"><div><h3>Gegenst\u00e4nde verkaufen</h3></div></div>${renderItemGrid(state.inventory, { gridKey: 'shopSell', filters: true, gridClass: 'sell-grid', cardOptions: { sell: true }, emptyHtml: '<div class="forge-placeholder">Dein Inventar ist leer.</div>' })}</section>`;
  return `<div class="view-heading"><div><p class="eyebrow"><span></span> DEIN UNTERSCHLUPF</p><h1>Der <em>Schwarzmarkt</em></h1><p class="welcome-sub">Glyphen- und VIP-Luckyboxen sowie passende Ausrüstung kaufen oder eigene Beute verkaufen.</p></div><div class="smith-mark page-header-icon" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M4 8h16l1 13H3L4 8Zm4 0V6a4 4 0 0 1 8 0v2"/></svg></div></div><div class="shop-catalog-layout shop-equipment-offers">${inventoryPanel}<section class="shop-catalog-column shop-boxes-panel"><header class="shop-catalog-heading"><p class="eyebrow">KISTEN</p></header>${leftGroups.map(renderOfferCard).join('')}</section><section class="shop-catalog-column shop-gear-panel"><header class="shop-catalog-heading"><p class="eyebrow">WECHSELNDE ANGEBOTE</p><small class="shop-refresh-timer" data-shop-refresh-timer title="Bis zur Erneuerung aller Angebote">${formatWorldEventTime(state.shopEquipmentRefreshAt - Date.now())}</small></header>${equipmentOffers}</section></div>`;
}

let shopOfferRefreshPending = false;
function updateShopOfferTimer() {
  const timer = document.querySelector('[data-shop-refresh-timer]');
  if (!timer || !state?.mainClass) return;
  const remaining = state.shopEquipmentRefreshAt - Date.now();
  timer.textContent = formatWorldEventTime(remaining);
  if (remaining > 0 || shopOfferRefreshPending) return;
  shopOfferRefreshPending = true;
  enqueueStateTask(async () => {
    if (!state?.mainClass || saveMaintenance || saveBlocked) return;
    syncEquipmentShop(state);
    await writeSavedState(state);
    if (currentView === 'shop') renderView();
  }).catch(() => {}).finally(() => { shopOfferRefreshPending = false; });
}

function renderBlacksmith() {
  if (selectedForgeMode === 'glyphs') return renderGlyphFusion();
  const mythicMode = selectedForgeMode === 'mythic';
  const levelKey = mythicMode ? 'mythicUpgradeLevel' : 'upgradeLevel';
  const stoneSlot = mythicMode ? 'mythicUpgradeStone' : 'upgradeStone';
  const items = workshopEquipmentItems(state)
    .filter((item, index, all) => item && (!mythicMode || isMythicWeapon(item)) && (AFFIX_POOLS[item.slot] || item.slot === 'glyph') && all.findIndex(candidate => candidate?.id === item.id) === index);
  const stones = state.inventory.filter((item) => item.slot === stoneSlot);
  const stoneQuantity = inventoryQuantityForSlot(state, stoneSlot);
  const maxLevel = mythicMode ? MYTHIC_ITEMS.maxUpgradeLevel : BALANCE.items.maxUpgradeLevel;
  if (!items.some(item => selectedForForge.has(item.id))) {
    const initialTarget = items.find(item => (item[levelKey] || 0) < maxLevel) || items[0];
    selectedForForge.clear();
    if (initialTarget) selectedForForge.add(initialTarget.id);
  }
  const target = items.find((item) => selectedForForge.has(item.id));
  const currentUpgrade = target?.[levelKey] || 0;
  const selectedStone = stones[0];
  const targetLevel = forgeUpgradeTargetLevel();
  const targetOptions = Array.from({ length: maxLevel }, (_, index) => index + 1).map(level => `<option value="${level}" ${level === targetLevel ? 'selected' : ''}>+${level}</option>`).join('');
  const chance = target && currentUpgrade < maxLevel ? workshopSuccessChance(BALANCE.items.upgradeSuccessChanceByLevel[currentUpgrade] || 0) : 0;
  const ready = Boolean(target && selectedStone && currentUpgrade < maxLevel && !activeWorkshopJob);
  const canAuto = Boolean(target && stoneQuantity && currentUpgrade < targetLevel && !activeWorkshopJob);
  return `${renderBlacksmithHeading()}<div class="smith-layout"><section class="forge-selection item-selection"><div class="section-heading"><div><h3>Ausger&uuml;steten Platz w&auml;hlen</h3></div><span class="selection-count">${items.length} Teile</span></div>${renderItemGrid(items, { gridKey: 'forge', filters: true, excludeCategories: ['materials', 'gems'], gridClass: 'forge-grid', cardOptions: (item) => ({ forge: true, selected: selectedForForge.has(item.id), disabled: (item[levelKey] || 0) >= maxLevel }), emptyHtml: '<div class="forge-placeholder">Lege zuerst passende Ausr&uuml;stung bei Main oder Begleiter an.</div>' })}</section><section class="forge-workbench ${workshopMotionClass('blacksmith')} ${ready ? 'is-ready' : ''}"><div class="socket-workbench-heading"><h3>${mythicMode ? 'Mystische Aufwertung' : 'Aufwertung'}</h3></div><div class="forge-ritual-art" aria-hidden="true"><div class="ritual-orbit ritual-orbit-outer"><i></i><i></i><i></i><i></i></div><div class="ritual-orbit ritual-orbit-middle"><i></i><i></i><i></i><i></i><i></i><i></i></div><div class="ritual-orbit ritual-orbit-inner"><i></i><i></i><i></i></div>${workshopRitualCore(target, '&#x2726;')}<span class="ritual-mark ritual-mark-one">&#x25C6;</span><span class="ritual-mark ritual-mark-two">&#x2727;</span><span class="ritual-mark ritual-mark-three">&#x25C6;</span><span class="ritual-caption">${target ? escapeHtml(target.name) : 'AUSR&Uuml;STUNG W&Auml;HLEN'}</span></div><div class="forge-controls">${target ? `<div class="forge-upgrade-status"><span>${mythicMode ? `Mythischer Effekt: +${mythicDamagePercent(target)} % &middot; ` : ''}${currentUpgrade < maxLevel ? `N&auml;chster Versuch: +${currentUpgrade} &#x2192; +${currentUpgrade + 1}` : ''}</span><strong>${currentUpgrade < maxLevel ? `${formatRuleNumber(chance)} % Erfolg` : 'MAXIMALSTUFE'}</strong></div>` : ''}<div class="forge-action-row forge-auto-actions"><button class="primary-button ui-control ui-button forge-button" type="button" data-forge ${ready && !autoUpgradeRunning ? '' : 'disabled'}>EINMAL VERSUCHEN <span>&#x2726;</span></button><label class="forge-auto-target"><span>AUTO-UPGRADE BIS</span><select class="ui-control ui-select" data-forge-target-level aria-label="Zielstufe der automatischen Aufwertung" ${autoUpgradeRunning || forgeAnimationInProgress ? 'disabled' : ''}>${targetOptions}</select></label><button class="secondary-button ui-control ui-button forge-auto-button ${autoUpgradeRunning ? 'is-armed' : ''}" type="button" data-forge-auto ${canAuto || autoUpgradeRunning ? '' : 'disabled'} aria-pressed="${autoUpgradeRunning}">${autoUpgradeRunning ? 'STOPPEN' : 'AUTO-UPGRADE'} <span>${stoneQuantity}&times;</span></button></div></div></section></div>`;
}


function renderBlacksmithHeading() {
  return `<div class="view-heading socket-page-heading"><div><p class="eyebrow"><span></span> DEIN UNTERSCHLUPF</p><h1>Die <em>Schmiede</em></h1><p class="welcome-sub">Verbessere Ausr&uuml;stung mit Aufwertungssteinen bis auf +${BALANCE.items.maxUpgradeLevel}. Aufwertung und Sockel bleiben am Ausr&uuml;stungsplatz.</p></div><div class="socket-page-tools">${renderBlacksmithTabs()}</div></div>`;
}
function renderBlacksmithTabs() {
  return `<div class="party-owner-switch socket-mode-buttons" role="group" aria-label="Schmiedeverfahren">${[['upgrade', 'Aufwertung'], ['mythic', 'Mystische Aufwertung'], ['glyphs', 'Glyphen kombinieren']].map(([mode, label]) => `<button class="party-owner-button ui-control ui-choice ${selectedForgeMode === mode ? 'is-selected' : ''}" type="button" data-forge-mode="${mode}" aria-pressed="${selectedForgeMode === mode}" ${forgeAnimationInProgress || glyphFusionPending ? 'disabled' : ''}>${label}</button>`).join('')}</div>`;
}
function renderGlyphFusion() {
  const glyphs = state.inventory.filter(item => item.slot === 'glyph');
  for (const id of selectedGlyphsForFusion) {
    if (!glyphs.some(item => item.id === id)) selectedGlyphsForFusion.delete(id);
  }
  const selected = glyphs.filter(item => selectedGlyphsForFusion.has(item.id));
  const busy = glyphFusionPending || forgeAnimationInProgress;
  const ready = selected.length === 3 && !busy && !activeWorkshopJob;
  const result = glyphs.find(item => item.id === lastFusedGlyphId);
  const grid = renderItemGrid(glyphs, {
    gridKey: 'glyphFusion', filters: true, categories: ['glyphs'], allowedSlots: ['glyph'], gridClass: 'forge-grid',
    cardOptions: item => ({ glyphFusion: true, selected: selectedGlyphsForFusion.has(item.id), disabled: busy, draggable: false }),
    emptyHtml: '<div class="forge-placeholder">Keine Glyphen im Inventar. Lege Glyphen ab oder öffne Glyphen-Luckyboxen.</div>',
  });
  const slots = Array.from({ length: 3 }, (_, index) => selected[index]
    ? itemCard(selected[index], state.inventory.indexOf(selected[index]), { glyphFusion: true, selected: true, disabled: busy, draggable: false })
    : `<span class="glyph-fusion-empty" aria-label="Glyphenplatz ${index + 1}">+</span>`).join('');
  return `${renderBlacksmithHeading()}<div class="smith-layout"><section class="forge-selection item-selection"><div class="section-heading"><div><h3>Glyphen wählen</h3></div><span class="selection-count">${selected.length} / 3 gewählt</span></div>${grid}</section><section class="forge-workbench glyph-fusion-workbench ${workshopMotionClass('blacksmith')} ${ready ? 'is-ready' : ''}"><div class="socket-workbench-heading"><h3>Glyphen kombinieren</h3></div><div class="forge-ritual-art" aria-hidden="true"><div class="ritual-orbit ritual-orbit-outer"><i></i><i></i><i></i><i></i></div><div class="ritual-orbit ritual-orbit-middle"><i></i><i></i><i></i><i></i><i></i><i></i></div><div class="ritual-orbit ritual-orbit-inner"><i></i><i></i><i></i></div>${workshopRitualCore(result, '&#x2727;')}<span class="ritual-caption">${result ? escapeHtml(result.name) : 'DREI GLYPHEN · EINE NEUE'}</span></div><div class="forge-controls"><div class="glyph-fusion-slots" aria-label="Ausgewählte Glyphen">${slots}</div><div class="forge-upgrade-status"><span>${busy ? 'Glyphen werden kombiniert' : `${selected.length} / 3 Glyphen gewählt`}</span><strong>${result ? 'LETZTES ERGEBNIS' : 'ZUFÄLLIGE GLYPHE'}</strong></div><button class="primary-button ui-control ui-button glyph-fusion-button" type="button" data-fuse-glyphs ${ready ? '' : 'disabled'}>GLYPHEN KOMBINIEREN</button></div></section></div>`;
}

// A native dialog keeps keyboard focus and Escape handling inside the picker.
function openEnchantExclusions() {
  if (forgeAnimationInProgress || activeWorkshopJob) return;
  const target = findInventoryOrEquippedItem(state, selectedEnchantTargetId);
  const index = selectedEnchantAffixIndex;
  if (!target?.affixes?.[index]) return;
  document.querySelector('#enchant-exclusions-dialog')?.remove();
  const initial = enchantAffixQuote(state, target, index);
  const selected = new Set(state.settings.enchantExcludedAffixes?.[initial.group] || []);
  const dialog = document.createElement('dialog');
  dialog.id = 'enchant-exclusions-dialog';
  dialog.className = 'enchant-exclusions-dialog';
  dialog.setAttribute('aria-labelledby', 'enchant-exclusions-title');
  dialog.innerHTML = `<h2 id="enchant-exclusions-title">Affixe ausschlie\u00dfen</h2><p>${escapeHtml(target.name)} \u00b7 ${escapeHtml(target.affixes[index].stat)}</p>
    <div class="enchant-exclusion-options">${initial.pool.map(stat => `<label><span>${escapeHtml(stat)}${stat === initial.current ? ' (bereits ausgeschlossen)' : ''}</span><input class="ui-control ui-check" type="checkbox" value="${escapeHtml(stat)}" ${selected.has(stat) || stat === initial.current ? 'checked' : ''} ${stat === initial.current ? 'disabled' : ''}></label>`).join('')}</div>
    <p class="enchant-exclusion-price" aria-live="polite"></p>
    <div class="enchant-attempt-actions"><button class="primary-button ui-control ui-button" type="button" data-exclusions-cancel>ABBRECHEN</button><button class="primary-button ui-control ui-button" type="button" data-exclusions-apply>\u00dcBERNEHMEN</button></div>`;
  const refresh = () => {
    const quote = enchantAffixQuote(state, target, index, [...selected]);
    dialog.querySelector('.enchant-exclusion-price').textContent = `${quote.excluded.length} Ausschl\u00fcsse \u00b7 Kosten: ${number(quote.cost)} Umpr\u00e4gungssteine \u00b7 Vorrat: ${number(quote.available)} \u00b7 ${quote.candidates.length} m\u00f6gliche Typen${quote.available < quote.cost ? ' \u00b7 Nicht genug Steine' : ''}`;
    for (const checkbox of dialog.querySelectorAll('input')) {
      checkbox.disabled = checkbox.value === initial.current || (!checkbox.checked && quote.candidates.length <= 1 && quote.candidates.includes(checkbox.value));
    }
    dialog.querySelector('[data-exclusions-apply]').disabled = !quote.candidates.length;
  };
  dialog.addEventListener('change', event => {
    if (!event.target.matches('input')) return;
    if (event.target.checked) selected.add(event.target.value);
    else selected.delete(event.target.value);
    refresh();
  });
  dialog.querySelector('[data-exclusions-cancel]').addEventListener('click', () => dialog.close());
  dialog.querySelector('[data-exclusions-apply]').addEventListener('click', async () => {
    const button = dialog.querySelector('[data-exclusions-apply]');
    button.disabled = true;
    const result = await performAction({ action: 'set-enchant-exclusions', itemId: target.id, affixIndex: index, excluded: [...selected], silent: true }, null, null, { background: true });
    if (result) { dialog.close(); renderView({ background: true }); }
    else refresh();
  });
  dialog.addEventListener('close', () => { dialog.remove(); document.querySelector('[data-enchant-exclusions]')?.focus(); });
  dialog.addEventListener('click', event => { if (event.target === dialog && (event.clientX < dialog.getBoundingClientRect().left || event.clientX > dialog.getBoundingClientRect().right || event.clientY < dialog.getBoundingClientRect().top || event.clientY > dialog.getBoundingClientRect().bottom)) dialog.close(); });
  document.body.append(dialog);
  refresh();
  dialog.showModal();
}
