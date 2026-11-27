// Black-market and forge page templates.
function shopOfferQuote(group, requested = shopQuantities[group]) {
  const freeSlots = Math.max(0, state.inventoryCapacity - inventoryOccupiedSlots(state));
  const stackable = STACKABLE_SHOP_GROUPS.has(group);
  const maxQuantity = Math.min(maxAffordableShopQuantity(state, group), stackable ? 1000 : freeSlots);
  const quantity = maxQuantity > 0 ? Math.max(1, Math.min(Math.floor(Number(requested) || 1), maxQuantity)) : 0;
  const unitPrice = shopPriceForLevel(partyLevel(state), group);
  return { quantity, maxQuantity, unitPrice, totalPrice: unitPrice * quantity, unavailable: !quantity || state.souls < unitPrice * quantity };
}
function renderShop() {
  syncEquipmentShop(state);
  const freeSlots = Math.max(0, state.inventoryCapacity - inventoryOccupiedSlots(state));
  const renderOfferCard = (group) => {
    const offer = SHOP_OFFERS.find((entry) => entry.group === group);
    const { quantity, maxQuantity, unitPrice, totalPrice, unavailable } = shopOfferQuote(group);
    shopQuantities[group] = quantity;
    const displayedPrice = quantity ? totalPrice : unitPrice;
    return `<article class="shop-card shop-product-card shop-box-card"><button class="shop-box-tile inventory-item ${itemVisualClasses({ slot: group })}" type="button" data-mobile-shop-box="${group}" aria-label="${escapeHtml(offer.title)} – Details und Kauf">${equipmentEmbersMarkup({ slot: group })}<span class="shop-box-tile-icon item-icon">${assetIconMarkup(offer.asset, offer.icon, 'shop-box-tile-glyph')}</span><span class="shop-box-tile-name">${escapeHtml(offer.title)}</span><span class="shop-mobile-price">✧ ${compactLifetimeNumber(unitPrice)}</span></button><div class="shop-card-icon">${assetIconMarkup(offer.asset, offer.icon, 'shop-offer-image')}</div><div class="shop-card-copy"><span class="shop-type">${offer.category}</span><h3>${offer.title}</h3><p>${offer.subtitle}</p><div class="shop-purchase-controls"><label>MENGE<input class="ui-control ui-field ui-compact" type="number" min="${maxQuantity ? 1 : 0}" max="${maxQuantity}" step="1" value="${quantity}" data-shop-quantity="${group}" ${maxQuantity ? '' : 'disabled'} aria-label="Kaufmenge ${offer.title}"></label><div class="shop-price"><strong data-shop-total>\u2727 ${number(displayedPrice)} Seelen${quantity ? '' : ' / Stück'}</strong></div><button class="primary-button ui-control ui-button ui-compact purchase-button" type="button" data-buy="${group}" ${unavailable ? 'disabled' : ''}>KAUFEN</button></div></div></article>`;
  };
  const leftGroups = SHOP_OFFERS.filter(offer => offer.purchasable !== false).map(offer => offer.group);
  const equipmentOffers = state.shopEquipmentOffers.map((item, index) => {
    const price = equipmentShopPrice(item);
    const greaterCount = (item.affixes || []).filter(affix => affix.greater).length;
    const owners = dropPartyClasses(state).filter(owner => partyCanEquipDrop(item, { ...state, mainClass: owner, activeCompanion: null }));
    const disabled = state.souls < price || freeSlots < 1 || totalRewardStorageSlots(state) - 1 < reservedBossStorageSlots(state);
    return `<article class="shop-card shop-product-card shop-equipment-card" data-mobile-shop-equipment="${escapeHtml(item.id)}">${itemCard(item, index, { shopOffer: true, draggable: false })}<span class="shop-mobile-price">✧ ${compactLifetimeNumber(price)}</span><div class="shop-card-copy"><span class="shop-type">${escapeHtml(item.rarity)}${greaterCount ? ` · ✦ ${greaterCount} Greater Affixe` : ''}</span><h3>${escapeHtml(item.name)}</h3><p>${owners.map(owner => escapeHtml(CLASSES[owner].label)).join(' / ')}${item.set ? ` · ${escapeHtml(item.set)}` : ''}</p><div class="shop-purchase-controls"><div class="shop-price"><strong>✧ ${number(price)} Seelen</strong></div><button class="primary-button ui-control ui-button ui-compact purchase-button" type="button" data-buy-equipment-offer="${item.id}" ${disabled ? 'disabled' : ''}>KAUFEN</button></div></div></article>`;
  }).join('');
  const inventoryPanel = `<section class="shop-inventory-panel item-selection"><div class="section-heading shop-heading sell-heading"><div><h3>Gegenst\u00e4nde verkaufen</h3></div></div>${renderItemGrid(state.inventory, { gridKey: 'shopSell', filters: true, gridClass: 'sell-grid', cardOptions: { sell: true }, emptyHtml: '<div class="forge-placeholder">Dein Inventar ist leer.</div>' })}</section>`;
  return `<div class="view-heading"><div><p class="eyebrow"><span></span> DEIN UNTERSCHLUPF</p><h1>Der <em>Schwarzmarkt</em></h1><p class="welcome-sub">Glyphen- und VIP-Luckyboxen sowie passende Ausrüstung kaufen oder eigene Beute verkaufen.</p></div><div class="smith-mark page-header-icon" aria-hidden="true">${assetIconMarkup('Assets/Icons/000000/transparent/1x1/lorc/hood.svg', '', 'page-header-glyph')}</div></div><div class="shop-catalog-layout shop-equipment-offers">${inventoryPanel}<section class="shop-catalog-column shop-boxes-panel"><header class="shop-catalog-heading"><p class="eyebrow">KISTEN</p></header>${leftGroups.map(renderOfferCard).join('')}</section><section class="shop-catalog-column shop-gear-panel"><header class="shop-catalog-heading"><p class="eyebrow">WECHSELNDE ANGEBOTE</p><small class="shop-refresh-timer" data-shop-refresh-timer title="Bis zur Erneuerung aller Angebote">${formatWorldEventTime(state.shopEquipmentRefreshAt - Date.now())}</small></header>${equipmentOffers}</section></div>`;
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
    .filter((item, index, all) => item && (!mythicMode || isMythicEquipment(item)) && (AFFIX_POOLS[item.slot] || item.slot === 'glyph') && all.findIndex(candidate => candidate?.id === item.id) === index);
  const stones = state.inventory.filter((item) => item.slot === stoneSlot);
  const stoneQuantity = inventoryQuantityForSlot(state, stoneSlot);
  const maxLevel = mythicMode ? MYTHIC_UPGRADES.maxUpgradeLevel : BALANCE.items.maxUpgradeLevel;
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
  const chance = target && currentUpgrade < maxLevel ? workshopSuccessChance((mythicMode ? MYTHIC_UPGRADES.successChanceByLevel : BALANCE.items.upgradeSuccessChanceByLevel)[currentUpgrade] || 0) : 0;
  const ready = Boolean(target && selectedStone && currentUpgrade < maxLevel && !activeWorkshopJob);
  const canAuto = Boolean(target && stoneQuantity && currentUpgrade < targetLevel && !activeWorkshopJob);
  return `${renderBlacksmithHeading()}<div class="smith-layout"><section class="forge-selection item-selection"><div class="section-heading"><div><h3>Ausger&uuml;steten Platz w&auml;hlen</h3></div><span class="selection-count">${items.length} Teile</span></div>${renderItemGrid(items, { gridKey: 'forge', filters: true, excludeCategories: ['materials', 'gems'], gridClass: 'forge-grid', cardOptions: (item) => ({ forge: true, selected: selectedForForge.has(item.id), disabled: (item[levelKey] || 0) >= maxLevel }), emptyHtml: '<div class="forge-placeholder">Lege zuerst passende Ausr&uuml;stung bei Main oder Begleiter an.</div>' })}</section><section class="forge-workbench ${workshopMotionClass('blacksmith')} ${ready ? 'is-ready' : ''}"><div class="socket-workbench-heading"><h3>${mythicMode ? 'Mystische Aufwertung' : 'Aufwertung'}</h3></div><div class="forge-ritual-art" aria-hidden="true"><div class="ritual-orbit ritual-orbit-outer"><i></i><i></i><i></i><i></i></div><div class="ritual-orbit ritual-orbit-middle"><i></i><i></i><i></i><i></i><i></i><i></i></div><div class="ritual-orbit ritual-orbit-inner"><i></i><i></i><i></i></div>${workshopRitualCore(target, '&#x2726;')}<span class="ritual-mark ritual-mark-one">&#x25C6;</span><span class="ritual-mark ritual-mark-two">&#x2727;</span><span class="ritual-mark ritual-mark-three">&#x25C6;</span><span class="ritual-caption">${target ? escapeHtml(target.name) : 'AUSR&Uuml;STUNG W&Auml;HLEN'}</span></div><div class="forge-controls">${target ? `<div class="forge-upgrade-status"><span>${mythicMode ? `${isMythicWeapon(target) ? `Mythischer Effekt: +${mythicDamagePercent(target)} %` : (target.mythicUpgradeLevel || 0) >= MYTHIC_ITEMS.treeBonusUnlockLevel ? `+${MYTHIC_ITEMS.treeBonusRanks} Rang auf investierte Tree-Knoten` : `Tree-Bonus ab mystisch +${MYTHIC_ITEMS.treeBonusUnlockLevel}`} &middot; ` : ''}${currentUpgrade < maxLevel ? `N&auml;chster Versuch: +${currentUpgrade} &#x2192; +${currentUpgrade + 1}` : ''}</span><strong>${currentUpgrade < maxLevel ? `${formatRuleNumber(chance)} % Erfolg` : 'MAXIMALSTUFE'}</strong></div>` : ''}<div class="forge-action-row forge-auto-actions"><button class="primary-button ui-control ui-button forge-button" type="button" data-forge ${ready && !autoUpgradeRunning ? '' : 'disabled'}>EINMAL VERSUCHEN <span>&#x2726;</span></button><label class="forge-auto-target"><span>AUTO-UPGRADE BIS</span><select class="ui-control ui-select" data-forge-target-level aria-label="Zielstufe der automatischen Aufwertung" ${autoUpgradeRunning || forgeAnimationInProgress ? 'disabled' : ''}>${targetOptions}</select></label><button class="secondary-button ui-control ui-button forge-auto-button ${autoUpgradeRunning ? 'is-armed' : ''}" type="button" data-forge-auto ${canAuto || autoUpgradeRunning ? '' : 'disabled'} aria-pressed="${autoUpgradeRunning}">${autoUpgradeRunning ? 'STOPPEN' : 'AUTO-UPGRADE'} <span>${stoneQuantity}&times;</span></button></div></div></section></div>`;
}


function renderBlacksmithHeading() {
  return `<div class="view-heading socket-page-heading"><div><p class="eyebrow"><span></span> DEIN UNTERSCHLUPF</p><h1>Die <em>Schmiede</em></h1><p class="welcome-sub">Verbessere Ausr&uuml;stung mit Aufwertungssteinen bis auf +${BALANCE.items.maxUpgradeLevel}. Aufwertung und Sockel bleiben am Ausr&uuml;stungsplatz.</p></div><div class="socket-page-tools">${renderBlacksmithTabs()}</div></div>`;
}
function renderBlacksmithTabs() {
  return `<div class="party-owner-switch socket-mode-buttons" role="group" aria-label="Schmiedeverfahren">${[['upgrade', 'Aufwertung'], ['mythic', 'Mystische Aufwertung'], ['glyphs', 'Glyphen kombinieren']].map(([mode, label]) => `<button class="party-owner-button ui-control ui-choice ${selectedForgeMode === mode ? 'is-selected' : ''}" type="button" data-forge-mode="${mode}" aria-pressed="${selectedForgeMode === mode}" ${forgeAnimationInProgress || glyphFusionPending ? 'disabled' : ''}>${label}</button>`).join('')}</div>`;
}
function renderMythicAscension() {
  const targets = workshopEquipmentItems(state).filter(item => item.rarityColor === 'legendary' && MYTHIC_ITEMS.equipmentSlots.includes(item.slot));
  if (!targets.some(item => item.id === selectedEnchantTargetId)) selectedEnchantTargetId = targets[0]?.id || null;
  const target = targets.find(item => item.id === selectedEnchantTargetId);
  const quote = mythicAscensionQuote(state, target);
  const grid = renderItemGrid(targets, { gridKey: 'enchantTargets', filters: true, categories: ['weapons', 'armor', 'jewelry', 'glyphs'],
    allowedSlots: MYTHIC_ITEMS.equipmentSlots, gridClass: 'enchant-target-grid',
    cardOptions: item => ({ enchantTarget: true, selected: item.id === selectedEnchantTargetId }),
    emptyHtml: '<div class="forge-placeholder">Lege legendäre Ausrüstung oder Glyphen an.</div>' });
  return `<div class="view-heading socket-page-heading"><div><p class="eyebrow">DEIN UNTERSCHLUPF</p><h1>Die <em>Verzauberung</em></h1><p class="welcome-sub">Legendäre Ausrüstung zu Mystisch aufwerten.</p></div><div class="socket-page-tools">${renderEnchantModeButtons()}</div></div>
    <div class="enchant-layout"><section class="forge-selection item-selection"><div class="section-heading"><h3>Legendäres Teil wählen</h3><span>${targets.length} Teile</span></div>${grid}</section>
    <section class="forge-workbench enchant-workbench ${workshopMotionClass('enchant')}"><div class="enchant-workbench-heading"><h3>Zu <span class="rarity-mythic">Mystisch</span> aufwerten</h3></div>
      <div class="forge-ritual-art" aria-hidden="true">${workshopRitualCore(target, '✦')}<span class="ritual-caption">${escapeHtml(target?.name || 'LEGENDÄRE AUSRÜSTUNG WÄHLEN')}</span></div>
      <div class="enchant-controls"><div class="forge-upgrade-status"><span>Benötigt Platz +${quote.requiredSlotLevel}${target ? ` · aktuell +${target.upgradeLevel || 0}` : ''}</span><strong>${formatRuleNumber(quote.successChance * 100)} % Erfolg</strong></div>
      <p>Je Versuch: ${quote.rarityStoneCost} Seltenheitssteine und ${quote.mythicStoneCost} mystische Aufwertungssteine.</p><p>Vorrat: ${number(quote.rarityStones)} / ${number(quote.mythicStones)}</p>
      <p>Bei Fehlschlag werden die Materialien verbraucht; die Ausrüstung bleibt erhalten. Bei Erfolg startet die mystische Stufe auf +0.</p>
      <button type="button" class="primary-button ui-control ui-button" data-enchant-mythic ${!quote.possible || forgeAnimationInProgress || activeWorkshopJob ? 'disabled' : ''}>MYSTISCHE AUFWERTUNG VERSUCHEN</button></div>
    </section></div>`;
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

function openAutoEnchant() {
  if (forgeAnimationInProgress || document.querySelector('#auto-enchant-dialog')) return;
  const itemId = selectedEnchantTargetId;
  const index = selectedEnchantAffixIndex;
  const target = findInventoryOrEquippedItem(state, itemId) || partyPets().find(item => item.id === itemId);
  if (!target?.affixes?.[index]) return;
  const generation = stateGeneration;
  const dialog = document.createElement('dialog');
  dialog.id = 'auto-enchant-dialog';
  dialog.className = 'enchant-exclusions-dialog auto-enchant-dialog';
  dialog.setAttribute('aria-labelledby', 'auto-enchant-title');
  dialog.innerHTML = `<h2 id="auto-enchant-title">Automatisch umprägen</h2>
    <p>${escapeHtml(target.name)} · Platz ${index + 1}</p>
    <label class="enchant-affix-picker"><span>Gewünschtes Affix</span><select class="ui-control ui-select" data-auto-enchant-stat>${enchantAffixPool(target).map(stat => `<option value="${escapeHtml(stat)}" ${stat === target.affixes[index].stat ? 'selected' : ''}>${escapeHtml(stat)}</option>`).join('')}</select></label>
    <label class="enchant-affix-picker"><span>Mindestwert</span><input class="ui-control" data-auto-enchant-min type="number" min="0" step="any" inputmode="decimal" required></label>
    <p data-auto-enchant-range></p>
    <p>Der Mindestwert gilt für den angezeigten Wert einschließlich Aufwertung. Deine Affix-Ausschlüsse und deren Kosten gelten weiterhin. Stoppt beim Treffer oder bei Materialmangel. Läuft, solange das Spiel geöffnet ist.</p>
    <p data-auto-enchant-status role="status" aria-live="polite"></p>
    <div class="enchant-attempt-actions"><button class="primary-button ui-control ui-button" type="button" data-auto-enchant-start>STARTEN</button><button class="secondary-button ui-control ui-button" type="button" data-auto-enchant-close>SCHLIESSEN</button></div>`;
  const statInput = dialog.querySelector('[data-auto-enchant-stat]');
  const minimumInput = dialog.querySelector('[data-auto-enchant-min]');
  const start = dialog.querySelector('[data-auto-enchant-start]');
  const close = dialog.querySelector('[data-auto-enchant-close]');
  const status = dialog.querySelector('[data-auto-enchant-status]');
  let running = false;
  let stopped = false;
  const updateRange = () => {
    const [min, max] = affixRangeFor(target, statInput.value, { greater: isMythicEquipment(target) });
    minimumInput.max = max;
    minimumInput.value = min;
    const unit = AFFIX_PERCENT_STATS.has(statInput.value) ? ' %' : '';
    const quote = enchantAffixQuote(state, target, index);
    dialog.querySelector('[data-auto-enchant-range]').textContent = `Möglicher neuer Wert: ${formatRuleNumber(min)}–${formatRuleNumber(max)}${unit}.${quote.mythicStoneCost ? ` Je Versuch zus\u00e4tzlich 1 mystischer Aufwertungsstein (Vorrat: ${number(quote.mythicStones)}).` : ''}`;
  };
  statInput.addEventListener('change', updateRange);
  minimumInput.addEventListener('input', () => {
    const value = minimumInput.valueAsNumber;
    if (!Number.isFinite(value)) return;
    const limited = Math.max(Number(minimumInput.min), Math.min(Number(minimumInput.max), value));
    if (limited !== value) minimumInput.value = limited;
  });
  close.addEventListener('click', () => {
    if (running) { stopped = true; close.disabled = true; close.textContent = 'WIRD GESTOPPT'; }
    else dialog.close();
  });
  dialog.addEventListener('cancel', event => {
    if (running) { event.preventDefault(); stopped = true; }
  });
  dialog.addEventListener('close', () => { stopped = true; dialog.remove(); });
  start.addEventListener('click', async () => {
    if (running || !minimumInput.reportValidity()) return;
    const goal = { stat: statInput.value, minimum: Number(minimumInput.value) };
    if (!Number.isFinite(goal.minimum)) return;
    running = true;
    stopped = false;
    let attempts = 0;
    let cost = 0;
    let reason = '';
    let mythicCost = 0;
    start.disabled = true;
    statInput.disabled = true;
    minimumInput.disabled = true;
    close.textContent = 'STOPPEN';
    status.textContent = 'Umprägen läuft …';
    try {
      while (!stopped && generation === stateGeneration && dialog.open) {
        const result = await performAction({ action: 'enchant-affix', itemId, affixIndex: index, autoGoal: goal, silent: true }, null, null, { background: true });
        if (!result) {
          reason = 'Gestoppt. Bitte prüfe die Fehlermeldung.';
          status.textContent = `${number(attempts)} Versuche · ${number(cost)} Umprägungssteine${mythicCost ? ` + ${number(mythicCost)} mystische Aufwertungssteine` : ''} verbraucht · ${reason}`;
          break;
        }
        attempts += result.attempts;
        cost += result.cost;
        mythicCost += result.mythicStoneCost || 0;
        reason = result.stopReason || '';
        status.textContent = `${number(attempts)} Versuche · ${number(cost)} Umprägungssteine${mythicCost ? ` + ${number(mythicCost)} mystische Aufwertungssteine` : ''} verbraucht · ${result.affix.stat}: ${formatRuleNumber(result.affix.value)}${AFFIX_PERCENT_STATS.has(result.affix.stat) ? ' %' : ''}${reason ? ` · ${reason}` : ''}`;
        if (reason) break;
        await new Promise(resolve => setTimeout(resolve, 0));
      }
      if (!reason) status.textContent += ' · Manuell gestoppt.';
    } finally {
      running = false;
      start.disabled = false;
      statInput.disabled = false;
      minimumInput.disabled = false;
      close.disabled = false;
      close.textContent = 'SCHLIESSEN';
    }
  });
  document.body.append(dialog);
  updateRange();
  dialog.showModal();
}

// A native dialog keeps keyboard focus and Escape handling inside the picker.
function openEnchantExclusions() {
  if (forgeAnimationInProgress) return;
  const target = findInventoryOrEquippedItem(state, selectedEnchantTargetId) || partyPets(state).find(pet => pet.id === selectedEnchantTargetId);
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
    dialog.querySelector('.enchant-exclusion-price').textContent = `${quote.excluded.length} Ausschl\u00fcsse \u00b7 Kosten: ${number(quote.cost)} Umpr\u00e4gungssteine \u00b7 Vorrat: ${number(quote.available)} \u00b7 ${quote.candidates.length} m\u00f6gliche Typen${quote.mythicStoneCost ? ` \u00b7 Zus\u00e4tzlich 1 mystischer Aufwertungsstein (Vorrat: ${number(quote.mythicStones)})` : ''}${!quote.canAfford ? ' \u00b7 Nicht genug Steine' : ''}`;
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
