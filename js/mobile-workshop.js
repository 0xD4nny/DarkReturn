// Item-local editing on mobile; all mutations reuse the shared equipment rules.
function openMobileItemWorkshop(itemId, mode = 'upgrade') {
  const item = findInventoryOrEquippedItem(state, itemId) || partyPets(state).find(pet => pet.id === itemId);
  if (!item) return;
  const equipped = workshopEquipmentItems(state).some(entry => entry.id === item.id);
  const mythic = isMythicEquipment(item);
  const capacity = equipped ? socketCapacityForSlot(item.slot, item) : 0;
  const canUpgrade = equipped && (AFFIX_POOLS[item.slot] || item.slot === 'glyph');
  const enchantable = equipped && ['weapons', 'armor', 'jewelry'].some(category => INVENTORY_CATEGORIES[category].slots.includes(item.slot));
  const modes = [];
  if (canUpgrade) modes.push(['upgrade', 'Aufwerten']);
  if (canUpgrade && mythic) modes.push(['mythic', 'Mystisch aufwerten']);
  if (capacity) modes.push(['sockets', 'Sockel & Edelsteine']);
  if (enchantable && !mythic) modes.push(['rarity', 'Seltenheit aufwerten']);
  if (equipped && item.rarityColor === 'legendary' && MYTHIC_ITEMS.equipmentSlots.includes(item.slot)) modes.push(['ascension', 'Zu Mystisch aufwerten']);
  if ((enchantable || item.slot === 'pet') && item.affixes?.length) modes.push(['affix', 'Affix umprägen']);
  if (item.slot === 'weaponGem') modes.push(['gem', 'Edelstein aufwerten / einsetzen']);
  if (item.slot === 'glyph' && state.inventory.some(entry => entry.id === item.id)) modes.push(['fusion', 'Glyphen kombinieren']);
  if (!modes.some(([key]) => key === mode)) mode = modes[0]?.[0] || mode;
  let content = `<div class="mobile-item-workshop"><p class="mobile-workshop-item-name">${escapeHtml(item.name)}</p><label class="mobile-workshop-target">Bearbeitung<select class="ui-control ui-select" data-item-workshop-mode>${modes.map(([key, label]) => `<option value="${key}" ${mode === key ? 'selected' : ''}>${label}</option>`).join('')}</select></label>`;
  if (mode === 'fusion') {
    const others = state.inventory.filter(entry => entry.slot === 'glyph' && entry.id !== item.id);
    content += `<p>Wähle zwei weitere Glyphen. Alle drei werden verbraucht.</p><div class="mobile-gem-picker">${others.map(entry => `<label><input type="checkbox" data-mobile-fusion-glyph value="${escapeHtml(entry.id)}"> ${escapeHtml(entry.name)}</label>`).join('')}</div><button class="primary-button ui-control ui-button" type="button" data-item-workshop-fuse ${others.length < 2 ? 'disabled' : ''}>Glyphen kombinieren</button>`;
  } else if (mode === 'gem') {
    content += renderGemUpgradePanel(item).replaceAll('data-upgrade-gems', 'data-mobile-workshop-gem-upgrade');
    const targets = workshopEquipmentItems(state).filter(entry => socketCapacityForSlot(entry.slot, entry));
    content += `<h3>In Ausrüstung einsetzen</h3><div class="mobile-gem-picker">${targets.map(target => `<button type="button" class="ui-control ui-button" data-workshop-gem-target="${escapeHtml(target.id)}">${escapeHtml(workshopSlotLabel(target))} · ${escapeHtml(target.name)}</button>`).join('') || '<p>Keine passende Ausrüstung angelegt.</p>'}</div>`;
  } else if (['upgrade', 'mythic'].includes(mode) && canUpgrade) {
    const mythicUpgrade = mode === 'mythic';
    const level = item[mythicUpgrade ? 'mythicUpgradeLevel' : 'upgradeLevel'] || 0;
    const maximum = mythicUpgrade ? MYTHIC_UPGRADES.maxUpgradeLevel : BALANCE.items.maxUpgradeLevel;
    const materials = inventoryQuantityForSlot(state, mythicUpgrade ? 'mythicUpgradeStone' : 'upgradeStone');
    const target = Math.min(maximum, level + 10);
    const options = Array.from({ length: maximum - level }, (_, index) => level + index + 1).map(value => `<option value="${value}" ${value === target ? 'selected' : ''}>+${value}${value === maximum ? ' · Maximum' : ''}</option>`).join('');
    const chances = mythicUpgrade ? MYTHIC_UPGRADES.successChanceByLevel : BALANCE.items.upgradeSuccessChanceByLevel;
    if (mythicUpgrade) content += `<p class="rarity-mythic">${isMythicWeapon(item) ? `+${formatRuleNumber(mythicDamagePercent(item))} % multiplikativer Schaden` : level >= MYTHIC_ITEMS.treeBonusUnlockLevel ? `+${MYTHIC_ITEMS.treeBonusRanks} Rang auf alle investierten Tree-Knoten` : `Noch kein mystischer Bonus; +${MYTHIC_ITEMS.treeBonusRanks} Rang ab mystisch +${MYTHIC_ITEMS.treeBonusUnlockLevel}.`}</p>`;
    content += `<p>Aktuell +${level} · ${number(materials)} ${mythicUpgrade ? 'mystische ' : ''}Aufwertungssteine</p>`;
    if (level < maximum) content += `<p>Nächster Versuch: ${formatRuleNumber(workshopSuccessChance(chances[level] || 0))} % Erfolg</p><button class="ui-control ui-button" type="button" data-item-workshop-start="upgrade" data-item-workshop-single ${!materials || activeWorkshopJob ? 'disabled' : ''}>Einmal versuchen</button>`;
    if (options) content += `<label class="mobile-workshop-target">Zielstufe<select class="ui-control ui-select" data-item-workshop-target>${options}</select></label><p class="mobile-detail-note">Sofort bis zur Zielstufe oder bis das Material aufgebraucht ist. Fehlversuche verbrauchen ebenfalls Steine.</p><button class="primary-button ui-control ui-button" type="button" data-item-workshop-start="upgrade" ${!materials || activeWorkshopJob || forgeAnimationInProgress ? 'disabled' : ''}>Bis zur Zielstufe aufwerten</button>`;
    else content += '<p>Maximale Aufwertung erreicht.</p>';
  } else if (mode === 'sockets' && capacity) {
    const opened = item.socketSlots || 0;
    const materials = inventoryQuantityForSlot(state, 'socketStone');
    content += `<p>${opened} / ${capacity} Sockel geöffnet · ${number(materials)} Sockelsteine</p>`;
    if (opened < capacity) content += `<button class="ui-control ui-button" type="button" data-item-workshop-start="socket" data-item-workshop-single ${!materials || activeWorkshopJob ? 'disabled' : ''}>Einmal versuchen · ${formatRuleNumber(workshopSuccessChance(BALANCE.items.socketSuccessChanceByTarget.equipment[opened] || 0))} %</button>`;
    if (opened < capacity) {
      const options = Array.from({ length: capacity - opened }, (_, index) => opened + index + 1).map(value => `<option value="${value}" ${value === capacity ? 'selected' : ''}>${value} Sockel${value === capacity ? ' · Maximum' : ''}</option>`).join('');
      content += `<label class="mobile-workshop-target">Zielanzahl<select class="ui-control ui-select" data-item-workshop-target>${options}</select></label><p class="mobile-detail-note">Öffnet Sockel sofort bis zum Ziel oder Materialende. Fehlversuche verbrauchen ebenfalls Steine.</p><button class="primary-button ui-control ui-button" type="button" data-item-workshop-start="socket" ${!materials || activeWorkshopJob || forgeAnimationInProgress ? 'disabled' : ''}>Bis zum Ziel sockeln</button>`;
    }
    const gems = state.inventory.filter(gem => gem.slot === 'weaponGem');
    if (opened) content += `<h3>Edelsteine</h3><div class="mobile-workshop-sockets">${Array.from({ length: opened }, (_, index) => {
      const gem = item.sockets?.[index];
      const busy = activeWorkshopJob || forgeAnimationInProgress;
      return gem ? `<div><strong>Sockel ${index + 1}</strong><span>${escapeHtml(gem.name)} · ${escapeHtml(gem.rarity)}</span><button type="button" class="ui-control ui-button" data-item-workshop-remove="${index}" ${busy ? 'disabled' : ''}>Entnehmen</button></div>`
        : `<div><strong>Sockel ${index + 1}</strong>${gems.length ? `<select class="ui-control ui-select" data-workshop-gem-picker="${index}" aria-label="Edelstein für Sockel ${index + 1}">${gems.map(entry => `<option value="${escapeHtml(entry.id)}">${escapeHtml(entry.name)} · ${escapeHtml(entry.rarity)}</option>`).join('')}</select><button type="button" class="ui-control ui-button" data-item-workshop-insert="${index}" ${busy ? 'disabled' : ''}>Einsetzen</button>` : '<span>Keine Edelsteine im Inventar.</span>'}</div>`;
    }).join('')}</div>`;
  } else if (mode === 'ascension') {
    const quote = mythicAscensionQuote(state, item);
    content += `<p>Legendär → <span class="rarity-mythic">Mystisch</span> · ${formatRuleNumber(quote.successChance * 100)} % Erfolg</p><p>Benötigt einen Ausrüstungsplatz auf +${quote.requiredSlotLevel}. Aktuell: +${item.upgradeLevel || 0}.</p><p>Pro Versuch: ${quote.rarityStoneCost} Seltenheitssteine und ${quote.mythicStoneCost} mystische Aufwertungssteine.</p><p>Vorrat: ${number(quote.rarityStones)} Seltenheitssteine · ${number(quote.mythicStones)} mystische Aufwertungssteine.</p><p class="mobile-detail-note">Beide Materialien werden auch bei einem Fehlschlag verbraucht. Der Gegenstand bleibt bei Fehlschlag erhalten; bei Erfolg beginnt die mystische Aufwertung auf +0.</p><button class="primary-button ui-control ui-button" type="button" data-item-workshop-ascend ${quote.possible ? '' : 'disabled'}>Mystische Aufwertung versuchen</button>`;
  } else if (mode === 'rarity') {
    const index = RARITY_ENCHANT_ORDER.indexOf(item.rarityColor);
    const next = RARITIES.find(entry => entry.color === RARITY_ENCHANT_ORDER[index + 1]);
    const greater = item.rarityColor === 'legendary' && canUpgradeLegendaryAffix(item);
    const possible = greater || (index >= 0 && Boolean(next));
    const materials = inventoryQuantityForSlot(state, 'rarityStone');
    content += `<p>${greater ? 'Ein zufälliges Affix wird zum Greater Affix.' : next ? `${escapeHtml(item.rarity)} → ${escapeHtml(next.name)}` : 'Maximale Seltenheit erreicht.'}</p><p>${number(materials)} Seltenheitssteine · Kosten: 1</p><button class="primary-button ui-control ui-button" type="button" data-item-workshop-enchant="rarity" ${!possible || !materials ? 'disabled' : ''}>${greater ? 'Greater Affix hinzufügen' : 'Seltenheit aufwerten'}</button>`;
  } else if (mode === 'affix') {
    const locked = item.slot !== 'pet' && !mythic && Number.isInteger(item.enchantAffixIndex);
    const index = locked ? item.enchantAffixIndex : Math.min(selectedEnchantAffixIndex || 0, item.affixes.length - 1);
    selectedEnchantAffixIndex = index;
    const quote = enchantAffixQuote(state, item, index);
    content += `<label class="mobile-workshop-target">Affix<select class="ui-control ui-select" data-item-workshop-affix ${locked ? 'disabled' : ''}>${item.affixes.map((affix, position) => `<option value="${position}" ${position === index ? 'selected' : ''}>${affix.greater ? '✦ ' : ''}+${formatRuleNumber(affix.value)}${AFFIX_PERCENT_STATS.has(affix.stat) ? ' %' : ''} ${escapeHtml(affix.stat)}</option>`).join('')}</select></label><p>${number(quote.available)} Umprägungssteine · Kosten: ${number(quote.cost)}${quote.mythicStoneCost ? ` + 1 mystischer Aufwertungsstein (Vorrat: ${number(quote.mythicStones)})` : ''}</p>${!locked && !mythic && item.slot !== 'pet' ? '<p class="mobile-detail-note">Der erste Versuch legt den umprägbaren Affixplatz fest.</p>' : ''}<button class="primary-button ui-control ui-button" type="button" data-item-workshop-enchant="affix" ${!quote.canAfford || !quote.candidates.length ? 'disabled' : ''}>Einmal umprägen</button><button class="ui-control ui-button" type="button" data-item-workshop-exclusions>Affixe ausschließen</button><button class="ui-control ui-button" type="button" data-item-workshop-auto-enchant>Automatisch umprägen</button>`;
  } else content += '<p>Zum Bearbeiten zuerst passende Ausrüstung anlegen.</p>';
  content += '<button class="ui-control ui-button" type="button" data-item-workshop-back>Zum Gegenstand</button></div>';
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
    ? `<p>${escapeHtml(target?.name || 'Ausrüstung')}</p><p>${job.kind === 'upgrade' ? 'Aufwertung' : 'Sockeln'} · ${progress}</p><p>${job.stopRequested ? 'Auftrag wird gestoppt.' : 'Wird sofort abgeschlossen.'}</p><p>${number(job.attempts || 0)} Versuche · ${number(job.successes || 0)} Erfolge · ${number(job.failures || 0)} Fehlschläge</p>`
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
mobileMedia.addEventListener('change', () => {
  if (isMobileLayout() && ['blacksmith', 'sockets', 'enchant'].includes(currentView)) setView(currentView);
});
mobileSheet.addEventListener('close', () => {
  delete mobileSheet.dataset.workshopItem;
  delete mobileSheet.dataset.workshopMode;
  delete mobileSheet.dataset.workshopStatus;
});
document.addEventListener('change', event => {
  if (!isMobileLayout() || !mobileSheet.contains(event.target) || !mobileSheet.dataset.workshopItem) return;
  if (event.target.matches('[data-item-workshop-mode]')) openMobileItemWorkshop(mobileSheet.dataset.workshopItem, event.target.value);
  if (event.target.matches('[data-item-workshop-affix]')) {
    selectedEnchantAffixIndex = Number(event.target.value);
    openMobileItemWorkshop(mobileSheet.dataset.workshopItem, 'affix');
  }
});

async function performMobileWorkshopAction(itemId, mode, payload) {
  if (mobileActionPending) return;
  mobileActionPending = true;
  mobileSheet.querySelectorAll('button, select, input').forEach(control => control.disabled = true);
  try {
    const result = await performAction(payload);
    if (!mobileSheet.open || mobileSheet.dataset.workshopItem !== itemId) return;
    const nextId = result?.item?.id || itemId;
    if (findInventoryOrEquippedItem(state, nextId) || partyPets(state).some(pet => pet.id === nextId)) openMobileItemWorkshop(nextId, mode);
    else mobileSheet.close();
  } finally { mobileActionPending = false; }
}
document.addEventListener('click', event => {
  if (!isMobileLayout()) return;
  const stop = () => { event.preventDefault(); event.stopImmediatePropagation(); };
  if (event.target.closest('[data-return-workshop]') && activeWorkshopJob) { stop(); openMobileWorkshopStatus(); return; }
  if (event.target.closest('[data-mobile-stop-workshop]')) { stop(); stopWorkshopJob(); return; }
  const itemId = mobileSheet.dataset.workshopItem;
  if (!mobileSheet.contains(event.target) || !itemId) return;
  if (event.target.closest('[data-item-workshop-back]')) { stop(); const item = findInventoryOrEquippedItem(state, itemId) || partyPets(state).find(pet => pet.id === itemId); openMobileItem(item); return; }
  const gemTarget = event.target.closest('[data-workshop-gem-target]');
  if (gemTarget) { stop(); openMobileItemWorkshop(gemTarget.dataset.workshopGemTarget, 'sockets'); return; }
  if (event.target.closest('[data-item-workshop-fuse]')) {
    stop();
    const chosen = [...mobileSheet.querySelectorAll('[data-mobile-fusion-glyph]:checked')].map(input => input.value);
    if (chosen.length !== 2) { toastMessageFor('Glyphen wählen', 'Wähle genau zwei weitere Glyphen.'); return; }
    void performMobileWorkshopAction(itemId, 'fusion', { action: 'fuse-glyphs', itemIds: [itemId, ...chosen] });
    return;
  }
  const ascend = event.target.closest('[data-item-workshop-ascend]');
  if (ascend) {
    stop();
    if (!ascend.disabled) void performMobileWorkshopAction(itemId, 'ascension', { action: 'enchant-mythic', itemId });
    return;
  }
  const enchant = event.target.closest('[data-item-workshop-enchant]');
  if (enchant) {
    stop();
    if (enchant.disabled) return;
    const mode = enchant.dataset.itemWorkshopEnchant;
    const stone = state.inventory.find(entry => entry.slot === (mode === 'rarity' ? 'rarityStone' : 'affixStone'));
    if (!stone) return;
    void performMobileWorkshopAction(itemId, mode, { action: mode === 'rarity' ? 'enchant-rarity' : 'enchant-affix', itemId, stoneId: stone.id, affixIndex: selectedEnchantAffixIndex });
    return;
  }
  if (event.target.closest('[data-item-workshop-exclusions], [data-item-workshop-auto-enchant]')) {
    stop();
    if (mobileActionPending) return;
    selectedEnchantTargetId = itemId;
    const refresh = () => {
      if (mobileSheet.open && mobileSheet.dataset.workshopItem === itemId) openMobileItemWorkshop(itemId, 'affix');
    };
    if (event.target.closest('[data-item-workshop-exclusions]')) {
      openEnchantExclusions();
      document.querySelector('#enchant-exclusions-dialog')?.addEventListener('close', refresh, { once: true });
    } else {
      openAutoEnchant();
      document.querySelector('#auto-enchant-dialog')?.addEventListener('close', refresh, { once: true });
    }
    return;
  }
  const start = event.target.closest('[data-item-workshop-start]');
  if (start) {
    stop();
    if (start.disabled || activeWorkshopJob || forgeAnimationInProgress || mobileActionPending) return;
    const item = workshopEquipmentItems(state).find(entry => entry.id === itemId);
    if (!item) return;
    const single = start.hasAttribute('data-item-workshop-single');
    const mythic = mobileSheet.dataset.workshopMode === 'mythic';
    const target = single ? start.dataset.itemWorkshopStart === 'upgrade' ? (item[mythic ? 'mythicUpgradeLevel' : 'upgradeLevel'] || 0) + 1 : (item.socketSlots || 0) + 1
      : Number(mobileSheet.querySelector('[data-item-workshop-target]')?.value);
    if (!Number.isInteger(target) || target < 1) return;
    mobileActionPending = true;
    const mode = mobileSheet.dataset.workshopMode;
    mobileSheet.querySelectorAll('button, select').forEach(control => control.disabled = true);
    const task = single ? startPersistedWorkshopJob({ kind: start.dataset.itemWorkshopStart, itemId, mythic, targetLevel: target, targetCount: target, single: true, headless: true })
      : start.dataset.itemWorkshopStart === 'upgrade'
      ? autoUpgrade({ itemId, targetLevel: target, mythic, headless: true })
      : autoSocket({ itemId, targetCount: target, headless: true });
    Promise.resolve(task).then(result => {
      if (!mobileSheet.open || mobileSheet.dataset.workshopItem !== itemId) return;
      if (result?.state?.workshopJob) mobileSheet.close();
      else {
        openMobileItemWorkshop(itemId, mode);
        if (result?.attempts) {
          const notice = document.createElement('p');
          notice.className = 'mobile-detail-note';
          notice.setAttribute('role', 'status');
          notice.textContent = `${number(result.attempts)} Versuche · ${number(result.successes || 0)} Erfolge · ${number(result.failures || 0)} Fehlschläge`;
          mobileSheet.querySelector('.mobile-workshop-item-name')?.after(notice);
        }
      }
    }).finally(() => { mobileActionPending = false; });
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
