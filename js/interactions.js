function showLuckyBoxJackpotModal(result) {
  document.querySelector('.lucky-jackpot-backdrop')?.remove();
  const jackpots = result.opened ? result.opened.filter((entry) => entry.jackpot) : [result];
  const firstJackpot = jackpots[0] || result;
  const multiple = jackpots.length > 1;
  const reward = firstJackpot.rewardItem;
  const icon = reward ? equipmentIconMarkup(reward.slot, reward.icon, 'lucky-jackpot-icon') : '<span class="lucky-jackpot-icon">✦</span>';
  const renderReward = (entry) => {
    const item = entry.rewardItem;
    const text = item ? `${escapeHtml(item.name)}${item.quantity > 1 ? ` · ${number(item.quantity)} Stück` : ''}` : `+${number(entry.rewardSouls)} Seelen`;
    const destination = entry.rewardDestination === 'mailbox' ? '<small>Die Belohnung wurde in deinem Briefkasten abgelegt.</small>' : '';
    return `<strong class="lucky-jackpot-reward-name">${text}</strong>${destination}`;
  };
  const rewards = multiple ? `<ul class="lucky-jackpot-rewards">${jackpots.map((entry) => `<li>${renderReward(entry)}</li>`).join('')}</ul>` : renderReward(firstJackpot);
  const backdrop = document.createElement('div');
  backdrop.className = 'lucky-jackpot-backdrop';
  backdrop.innerHTML = `<section class="lucky-jackpot-dialog" role="dialog" aria-modal="true" aria-labelledby="lucky-jackpot-title"><div class="lucky-jackpot-rays" aria-hidden="true"></div><span class="lucky-jackpot-kicker">EIN SELTENER FUND</span><div class="lucky-jackpot-reward-icon ${reward?.rarityColor || 'legendary'}">${icon}</div><h2 id="lucky-jackpot-title">${multiple ? `${number(jackpots.length)} Hauptgewinne!` : 'Hauptgewinn!'}</h2><p>${multiple ? 'Deine Luckyboxen haben dir besondere Funde offenbart.' : `Die ${escapeHtml(firstJackpot.boxName || 'Luckybox')} hat dir etwas Besonderes offenbart.`}</p>${rewards}<button class="primary-button ui-control ui-button lucky-jackpot-close" type="button" data-close-lucky-jackpot>WEITER</button></section>`;
  backdrop.addEventListener('click', (event) => {
    if (event.target === backdrop || event.target.closest('[data-close-lucky-jackpot]')) backdrop.remove();
  });
  document.body.append(backdrop);
  backdrop.querySelector('[data-close-lucky-jackpot]')?.focus();
}

document.addEventListener('keydown', (event) => {
  if (event.defaultPrevented || event.target.closest('dialog[open]')) return;
  if (event.target.matches('[data-return-workshop]') && ['Enter', ' '].includes(event.key)) {
    event.preventDefault();
    event.target.click();
    return;
  }
  const inventoryTab = event.target.closest('[data-inventory-tab]');
  if (inventoryTab && ['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) {
    event.preventDefault();
    selectedInventoryTab = event.key === 'Home' ? 'equipment' : event.key === 'End' ? 'stats' : inventoryTab.dataset.inventoryTab === 'equipment' ? 'stats' : 'equipment';
    renderView();
    viewContainer.querySelector(`#inventory-tab-${selectedInventoryTab}`)?.focus();
    return;
  }
  if ((event.key === 'Enter' || event.key === ' ') && event.target.matches('#player-identity')) { event.preventDefault(); openPlayerStatisticsTooltip(event.target); return; }
  if (event.key === 'Escape') { closePlayerStatisticsTooltip(); tooltip.classList.remove('visible'); document.querySelector('.lucky-jackpot-backdrop')?.remove(); toggleMailboxPanel(false); if (battle?.visible) hideBattle(); }
  if ((event.key === 'Enter' || event.key === ' ') && event.target.closest('[data-skill-node]')) {
    event.preventDefault();
    selectedSkillTreeNodeId = event.target.closest('[data-skill-node]').dataset.skillNode;
    renderView();
    viewContainer.querySelector(`[data-skill-node="${CSS.escape(selectedSkillTreeNodeId)}"]`)?.focus();
  }
});

function syncAdminBuilderFields(refreshAffixes = false) {
  const form = document.querySelector('#admin-item-form');
  if (!form) return;
  const slot = form.elements.slot.value.split('::')[0];
  let rarity = RARITIES.find((entry) => entry.name === form.elements.rarity.value) || RARITIES[0];
  const isGlyph = slot === 'glyph';
  const gear = Boolean(AFFIX_POOLS[slot]) || isGlyph;
  Array.from(form.elements.rarity.options).forEach(option => {
    const entry = RARITIES.find(rarity => rarity.name === option.value);
    option.disabled = (isGlyph && entry?.color !== 'legendary') || (entry?.color === 'mythic' && !MYTHIC_ITEMS.weaponSlots.includes(slot));
  });
  if (isGlyph) form.elements.rarity.value = RARITIES.find(entry => entry.color === 'legendary').name;
  else if (form.elements.rarity.selectedOptions[0]?.disabled) form.elements.rarity.value = RARITIES.find(entry => entry.color === 'legendary').name;
  rarity = RARITIES.find(entry => entry.name === form.elements.rarity.value) || RARITIES[0];
  const setSelect = form.elements.set;
  const setKind = ['helmet', 'chest', 'gloves', 'boots'].includes(slot) ? 'armor' : ['ring', 'amulet', 'earring'].includes(slot) ? 'jewelry' : null;
  Array.from(setSelect.options).forEach((option) => { option.disabled = Boolean(option.dataset.setKind && option.dataset.setKind !== setKind); });
  if (setSelect.selectedOptions[0]?.disabled) setSelect.value = '';
  form.elements.weaponLevel.disabled = !WEAPON_PROGRESSION.weaponSlots.includes(slot);
  form.elements.mythicUpgradeLevel.disabled = rarity.color !== 'mythic' || !MYTHIC_ITEMS.weaponSlots.includes(slot);
  form.elements.maxAffixRolls.disabled = !gear || isGlyph;
  form.elements.greaterAffixes.disabled = !gear;
  form.elements.rarity.disabled = isGlyph;
  form.elements.set.disabled = !gear || isGlyph;

  const implicitOnly = rarity.color === 'common' && ['bow', 'sword', 'staff', 'bell', 'shield', 'helmet', 'chest', 'gloves', 'boots'].includes(slot);
  const maxAffixes = implicitOnly ? 0 : Math.min(4, BALANCE.items.affixCountByRarity[rarity.color] ?? 0);
  const affixSelects = Array.from(form.querySelectorAll('[name="affix"]'));
  affixSelects.forEach((select, index) => {
    const previousValue = select.value;
    if (refreshAffixes || select.dataset.affixSlot !== slot) {
      select.innerHTML = adminAffixOptions(slot, previousValue);
      select.dataset.affixSlot = slot;
    }
    select.disabled = !gear || isGlyph || index >= maxAffixes;
    if (select.disabled) select.value = '';
  });
  const chosenStats = new Set();
  affixSelects.forEach((select) => {
    if (!select.value) return;
    if (!allowsRepeatedAffixes(slot) && chosenStats.has(select.value)) select.value = '';
    else chosenStats.add(select.value);
  });
  const chosen = Array.from(chosenStats);
  affixSelects.forEach((select) => Array.from(select.options).forEach((option) => {
    option.disabled = !allowsRepeatedAffixes(slot) && Boolean(option.value && chosen.includes(option.value) && option.value !== select.value);
  }));
}

document.addEventListener('click', (event) => {
  const huntClaim = event.target.closest('[data-claim-hunting-event]');
  if (huntClaim) {
    if (huntingEventRewardTier(state?.huntingEvent) >= 0) {
      tooltip.classList.remove('visible', 'powerup-tooltip');
      performAction({ action: 'claim-hunting-event', eventId: huntClaim.dataset.claimHuntingEvent });
    }
    return;
  }
  if (event.target.closest('[data-open-all-lucky-boxes]')) {
    performAction({ action: 'open-all-lucky-boxes' }).then((result) => {
      if (result?.jackpot) showLuckyBoxJackpotModal(result);
    });
    return;
  }
  const boxCard = currentView === 'inventory' ? event.target.closest('[data-item-index]') : null;
  const boxItem = boxCard ? state.inventory[Number(boxCard.dataset.itemIndex)] : null;
  if (boxItem && BOX_GROUPS.includes(boxItem.slot)) {
    event.preventDefault();
    performAction({ action: 'open-lucky-box', itemId: boxItem.id }).then((result) => {
      if (result?.jackpot) showLuckyBoxJackpotModal(result);
    });
    return;
  }
  const playerIdentity = event.target.closest('#player-identity');
  if (playerIdentity) return;
  if (event.target.closest('[data-close-player-statistics]')) { closePlayerStatisticsTooltip(); return; }
  if (tooltip.classList.contains('player-statistics-tooltip') && !event.target.closest('.player-statistics-tooltip')) closePlayerStatisticsTooltip();
  const settingsTab = event.target.closest('[data-settings-tab]');
  if (settingsTab) {
    lootRuleDraft = null;
    selectedSettingsTab = ['management', 'loot-filter', 'admin'].includes(settingsTab.dataset.settingsTab) ? settingsTab.dataset.settingsTab : 'gameplay';
    renderView();
    return;
  }
  if (event.target.closest('[data-loot-rule-add]')) {
    if (lootRuleSavePending) return;
    captureLootRuleDraft();
    const draft = lootRuleEditorState();
    if (draft.rules.length < 20) draft.rules.push({ slot: 'any', rarity: 'legendary', set: 'any', minGreater: 0 });
    renderView();
    viewContainer.querySelector('.loot-rule-list > :last-child [data-loot-rule-field]')?.focus({ preventScroll: true });
    return;
  }
  const removeLootRule = event.target.closest('[data-loot-rule-remove]');
  if (removeLootRule) {
    if (lootRuleSavePending) return;
    captureLootRuleDraft();
    lootRuleEditorState().rules.splice(Number(removeLootRule.dataset.lootRuleRemove), 1);
    renderView();
    viewContainer.querySelector('[data-loot-rule-add]')?.focus({ preventScroll: true });
    return;
  }
  if (event.target.closest('[data-loot-rules-save]')) { void saveLootRuleDraft(); return; }
  const activatePowerups = event.target.closest('[data-activate-powerups]');
  if (activatePowerups) {
    if (Number(activatePowerups.dataset.availablePowerups) > 0) performAction({ action: 'activate-all-powerups' });
    return;
  }
  const inventoryTab = event.target.closest('[data-inventory-tab]');
  if (inventoryTab) {
    selectedInventoryTab = inventoryTab.dataset.inventoryTab === 'stats' ? 'stats' : 'equipment';
    renderView();
    viewContainer.querySelector(`#inventory-tab-${selectedInventoryTab}`)?.focus();
    return;
  }
  if (event.target.closest('[data-altar-pet]')) {
    selectedAltarPetOwner = event.target.closest('[data-altar-pet]').dataset.altarPet;
    selectedAltarOwner = 'pet';
    renderView();
    return;
  }
  if (event.target.closest('[data-return-workshop]') && activeWorkshopJob) {
    if (activeWorkshopJob.kind === 'upgrade') {
      selectedForgeMode = activeWorkshopJob.mythic ? 'mythic' : 'upgrade';
      selectedForForge = new Set([activeWorkshopJob.targetId]);
      selectedForgeTargetLevel = activeWorkshopJob.targetLevel;
    } else {
      selectedSocketTargetId = activeWorkshopJob.targetId;
      selectedSocketTargetCount = activeWorkshopJob.targetCount;
      selectedSocketMode = 'ritual';
    }
    setView(activeWorkshopJob.view);
    return;
  }
  const partyOwner = event.target.closest('[data-party-owner]');
  if (partyOwner) {
    const owner = partyOwner.dataset.partyOwner;
    if (owner !== 'main' && owner !== state.activeCompanion) return;
    if (partyOwner.dataset.partyContext === 'inventory') selectedInventoryOwner = owner;
    if (partyOwner.dataset.partyContext === 'abilities') selectedAbilityOwner = owner;
    if (partyOwner.dataset.partyContext === 'altar') selectedAltarOwner = owner;
    if (partyOwner.dataset.partyContext === 'skilltree') selectedSkillTreeOwner = owner;
    renderView();
    if (isMobileLayout() && ['inventory', 'skilltree', 'abilities'].includes(partyOwner.dataset.partyContext)) viewContainer.querySelector(`.mobile-inventory-owners [data-party-owner="${CSS.escape(owner)}"]`)?.focus({ preventScroll: true });
    return;
  }
  const onboardingMain = event.target.closest('[data-onboarding-main]');
  if (onboardingMain) {
    onboardingMainClass = onboardingMain.dataset.onboardingMain;
    if (onboardingCompanionClass === onboardingMainClass) onboardingCompanionClass = null;
    onboardingPlayerName = document.querySelector('#player-name')?.value || onboardingPlayerName;
    renderView();
    return;
  }
  if (event.target.closest('[data-onboarding-start]')) {
    chooseMain(onboardingMainClass, onboardingCompanionClass);
    return;
  }
  if (event.target.closest('[data-admin-world-event-apply]')) {
    const choice = document.querySelector('#admin-world-event-choice');
    if (choice && setWorldEventFromAdmin(choice.value)) renderView();
    return;
  }
  const adminAction = event.target.closest('[data-admin-action]');
  if (adminAction) {
    performAction({ action: adminAction.dataset.adminAction });
    return;
  }
  const maxEquipment = event.target.closest('[data-admin-max-equipment]');
  if (maxEquipment && !maxEquipment.disabled) {
    const socketGem = document.querySelector('#admin-max-equipment-gem')?.value;
    if (!socketGem) return;
    performAction({ action: 'admin-upgrade-all', socketGem }).then(result => {
      if (!result) return;
      const choice = document.querySelector('#admin-max-equipment-gem');
      if (choice) {
        choice.value = socketGem;
        const button = document.querySelector('[data-admin-max-equipment]');
        if (button) button.disabled = !choice.value;
      }
    });
    return;
  }
  if (event.target.closest('[data-ascend-deep]')) {
    performAction({ action: 'deep-of-dark-ascend' }, 'Deep of Dark erreicht', (result) => `Die Gebiete beginnen erneut auf Deep of Dark-Stufe ${result.tier}.`)
      .then((result) => { if (result) { selectedDeepTier = result.tier; selectedAreaId = AREAS[0].id; currentView = 'map'; renderView(); } });
    return;
  }
  if (event.target.closest('#activity-toggle')) { toggleActivityPanel(); return; }
  if (event.target.closest('#activity-close')) { toggleActivityPanel(false); return; }
  if (event.target.closest('#mailbox-toggle')) { toggleMailboxPanel(); return; }
  if (event.target.closest('#mailbox-close')) { toggleMailboxPanel(false); return; }
  const mailboxClaim = event.target.closest('[data-claim-mailbox]');
  if (mailboxClaim) { performAction({ action: 'claim-mailbox-item', mailId: mailboxClaim.dataset.claimMailbox }); return; }
  if (!event.target.closest('.notification-wrap') && !activityPanel.hidden) toggleActivityPanel(false);
  if (!event.target.closest('.mailbox-wrap') && mailboxPanel && !mailboxPanel.hidden) toggleMailboxPanel(false);
  if (event.target.closest('[data-delete-save]')) { deleteSave(); return; }
  if (event.target.closest('[data-export-save]')) { exportSave(); return; }
  if (event.target.closest('[data-open-contracts]')) { setView('contracts'); return; }
  const allocateSkillNode = event.target.closest('[data-allocate-skill-node]');
  if (allocateSkillNode && !allocateSkillNode.disabled) {
    performAction({ action: 'skill-tree-allocate', class: allocateSkillNode.dataset.skillOwner, nodeId: allocateSkillNode.dataset.allocateSkillNode, points: allocateSkillNode.dataset.skillPoints || 1 });
    return;
  }
  const respecSkillTree = event.target.closest('[data-skill-tree-respec]');
  if (respecSkillTree && !respecSkillTree.disabled) {
    performAction({ action: 'skill-tree-respec', class: respecSkillTree.dataset.skillTreeRespec });
    return;
  }
  const skillNode = event.target.closest('[data-skill-node]');
  if (skillNode) { selectedSkillTreeNodeId = skillNode.dataset.skillNode; renderView(); return; }
  const forgeMode = event.target.closest('[data-forge-mode]');
  if (forgeMode && currentView === 'blacksmith') {
    if (forgeAnimationInProgress || glyphFusionPending || !['upgrade', 'mythic', 'glyphs'].includes(forgeMode.dataset.forgeMode)) return;
    selectedForgeMode = forgeMode.dataset.forgeMode;
    renderView();
    viewContainer.querySelector(`[data-forge-mode="${selectedForgeMode}"]`)?.focus();
    return;
  }
  const fusionItem = event.target.closest('[data-glyph-fusion-item]');
  if (fusionItem && currentView === 'blacksmith' && selectedForgeMode === 'glyphs') {
    if (glyphFusionPending || forgeAnimationInProgress) return;
    const id = fusionItem.dataset.glyphFusionItem;
    if (!state.inventory.some(item => item.id === id && item.slot === 'glyph')) return;
    if (selectedGlyphsForFusion.has(id)) selectedGlyphsForFusion.delete(id);
    else if (selectedGlyphsForFusion.size < 3) selectedGlyphsForFusion.add(id);
    renderView();
    return;
  }
  if (event.target.closest('[data-fuse-glyphs]') && currentView === 'blacksmith' && selectedForgeMode === 'glyphs') { fuseGlyphs(); return; }
  const socketMode = event.target.closest('[data-socket-mode]');
  if (socketMode && currentView === 'sockets' && !autoSocketRunning && !forgeAnimationInProgress) {
    if (!['ritual', 'gems', 'upgrade'].includes(socketMode.dataset.socketMode)) return;
    selectedSocketMode = socketMode.dataset.socketMode;
    renderView();
    viewContainer.querySelector(`[data-socket-mode="${selectedSocketMode}"]`)?.focus();
    return;
  }
  const upgradeGem = event.target.closest('[data-gem-upgrade-item]');
  if (upgradeGem && currentView === 'sockets' && selectedSocketMode === 'upgrade') {
    selectedSocketUpgradeGemId = upgradeGem.dataset.gemUpgradeItem;
    renderView();
    return;
  }
  const upgradeGems = event.target.closest('[data-upgrade-gems]');
  if (upgradeGems && currentView === 'sockets' && selectedSocketMode === 'upgrade' && !upgradeGems.disabled) {
    performAction({ action: 'upgrade-gems', itemId: selectedSocketUpgradeGemId, all: upgradeGems.dataset.upgradeGems === 'all' }).then(result => {
      if (!result || currentView !== 'sockets' || selectedSocketMode !== 'upgrade') return;
      selectedSocketUpgradeGemId = result.nextGemId;
      renderView();
    });
    return;
  }
  const enchantMode = event.target.closest('[data-enchant-mode]');
  if (enchantMode && currentView === 'enchant' && !forgeAnimationInProgress) {
    if (!['rarity', 'affix', 'pet'].includes(enchantMode.dataset.enchantMode)) return;
    selectedEnchantMode = enchantMode.dataset.enchantMode;
    renderView();
    viewContainer.querySelector(`[data-enchant-mode="${selectedEnchantMode}"]`)?.focus();
    return;
  }
  const removeSocketGem = event.target.closest('[data-unsocket-index]');
  if (removeSocketGem && currentView === 'sockets') {
    performAction({ action: 'unsocket-gem', itemId: selectedSocketTargetId, socketIndex: Number(removeSocketGem.dataset.unsocketIndex) }, 'Edelstein entnommen', 'Der Edelstein liegt wieder im Inventar.');
    return;
  }
  if (event.target.closest('[data-claim-contract-reward]')) {
    performAction({ action: 'claim-contract-reward' }, 'Auftragsbelohnung abgeholt', (result) => `+${number(result.reward)} Seelen${result.rewardItems?.length ? ` · ${result.rewardItems.map((item) => item.name).join(', ')}` : ''}.`);
    return;
  }
  const boardReward = event.target.closest('[data-claim-board-task]');
  if (boardReward) {
    performAction({ action: 'claim-quest-board-task', taskIndex: Number(boardReward.dataset.claimBoardTask) }, 'Auftragsbelohnung abgeholt', (result) => {
      const bundle = ['itemBundle', 'setBundle', 'luckyBundle', 'gemBundle'].includes(result.reward?.type);
      const destinations = new Set(result.rewardDestinations || []);
      const destination = destinations.size > 1 ? 'teils im Inventar, teils im Briefkasten' : destinations.has('mailbox') ? 'im Briefkasten' : 'im Inventar';
      const rewardText = bundle
        ? `${codexRewardLabel(result.reward)} liegt ${destination}.`
        : result.rewardItem ? `${result.rewardItem.name} liegt ${destination}.` : `+${number(result.soulAmount)} Seelen.`;
      return `${rewardText}${result.groupComplete ? ' Die nächste Auftragsgruppe ist verfügbar.' : ''}`;
    });
    return;
  }
  if (event.target.closest('[data-hide-battle]')) { hideBattle(); return; }
  if (event.target.closest('[data-show-battle]')) { showBattle(); return; }
  if (event.target.closest('[data-start-boss]')) { startBossBattle(); return; }
  if (event.target.closest('[data-boss-close]')) { closeBossResult(); return; }
  const castSkill = event.target.closest('[data-cast-skill]');
  if (castSkill) {
    if (battle?.offlineWave) battle.offlineWave.manual = true;
    activateCompanionSkill(castSkill.dataset.castSkill);
    return;
  }
  const autoSkill = event.target.closest('[data-toggle-auto-skill]');
  if (autoSkill && battle) {
    const className = autoSkill.dataset.toggleAutoSkill;
    battle.autoSkills[className] = !battle.autoSkills[className];
    updateBattleUI();
    return;
  }
  if (event.target.closest('[data-stop-battle]')) { stopBattle(); return; }
  if (event.target.id === 'battle-overlay') { hideBattle(); return; }
  const nav = event.target.closest('[data-view]');
  if (nav) { setView(nav.dataset.view); return; }
  if (event.target.closest('[data-return-onboarding]')) { setView('map'); return; }
  const codexSection = event.target.closest('[data-open-codex-section]');
  if (codexSection) { event.preventDefault(); setView('documentation', codexSection.dataset.openCodexSection); return; }
  const openView = event.target.closest('[data-open-view]');
  if (openView) { setView(openView.dataset.openView); return; }
  const selectedArea = event.target.closest('[data-select-area]');
  if (selectedArea) { selectedAreaId = selectedArea.dataset.selectArea; renderView(); return; }
  const startArea = event.target.closest('[data-start-area]');
  if (startArea) { startBattle('area', startArea.dataset.startArea); return; }
  const startTower = event.target.closest('[data-start-tower]');
  if (startTower) {
    startBattle('tower', null);
    return;
  }
  const equipmentOfferButton = event.target.closest('[data-buy-equipment-offer]');
  if (equipmentOfferButton) {
    if (equipmentOfferButton.disabled) return;
    equipmentOfferButton.disabled = true;
    tooltip.classList.remove('visible');
    performAction({ action: 'buy-equipment-offer', offerId: equipmentOfferButton.dataset.buyEquipmentOffer }, 'Ausrüstung gekauft', result => `${result.item.name} für ${number(result.cost)} Seelen.`)
      .finally(() => { if (equipmentOfferButton.isConnected) equipmentOfferButton.disabled = false; });
    return;
  }
  const buyButton = event.target.closest('[data-buy]');
  if (buyButton) {
    const quantity = Number(buyButton.closest('.shop-product-card')?.querySelector('[data-shop-quantity]')?.value);
    buy(buyButton.dataset.buy, quantity);
    return;
  }
  const sellButton = event.target.closest('[data-sell-item]');
  if (sellButton) { sell(sellButton.dataset.sellItem); return; }
  const socketTargetCard = event.target.closest('[data-socket-target-item]');
  if (socketTargetCard && currentView === 'sockets' && selectedSocketMode !== 'gems') {
    if (autoSocketRunning) return;
    selectedSocketTargetId = socketTargetCard.dataset.socketTargetItem;
    renderView();
    return;
  }
  const enchantTargetCard = event.target.closest('[data-enchant-target-item]');
  if (enchantTargetCard && currentView === 'enchant') {
    selectedEnchantTargetId = enchantTargetCard.dataset.enchantTargetItem;
    const target = findInventoryOrEquippedItem(state, selectedEnchantTargetId);
    selectedEnchantAffixIndex = Number.isInteger(target?.enchantAffixIndex) ? target.enchantAffixIndex : 0;
    renderView();
    return;
  }
  if (event.target.closest('[data-enchant-exclusions]')) { openEnchantExclusions(); return; }
  if (event.target.closest('[data-enchant-attempt]')) {
    if (activeWorkshopJob || forgeAnimationInProgress) return;
    const target = findInventoryOrEquippedItem(state, selectedEnchantTargetId);
    if (!target) return;
    const mode = selectedEnchantMode;
    const stoneSlot = mode === 'rarity' ? 'rarityStone' : 'affixStone';
    const stone = state.inventory.find((item) => item.slot === stoneSlot);
    if (!stone) return;
    if (mode === 'rarity') performAction({ action: 'enchant-rarity', itemId: target.id, stoneId: stone.id });
    else performAction({ action: 'enchant-affix', itemId: target.id, stoneId: stone.id, affixIndex: selectedEnchantAffixIndex });
    return;
  }
  if (event.target.closest('[data-socket-auto]')) { autoSocket(); return; }
  if (event.target.closest('[data-socket]')) { socketAttempt(false); return; }
  const passiveSlotButton = event.target.closest('[data-passive-slot]');
  if (passiveSlotButton && currentView === 'companions') {
    selectedPassiveAbilitySlot = Number(passiveSlotButton.dataset.passiveSlot) === 1 ? 1 : 0;
    renderView();
    return;
  }
  const abilityChoice = event.target.closest('[data-ability-category]');
  if (abilityChoice) {
    const index = abilityChoice.dataset.inspectAbility;
    if (inspectAbility(abilityChoice.dataset.abilityCategory, index === undefined ? undefined : Number(index))) renderView();
    return;
  }
  const skill = event.target.closest('[data-skill-class]');
  if (skill) { performAction({ action: 'companion-skill', class: skill.dataset.skillClass, skillType: skill.dataset.skillType, skillIndex: Number(skill.dataset.skillIndex), passiveSlot: Number(skill.dataset.passiveSlotIndex || 0) }, 'Fähigkeit gewählt', 'Die Auswahl ist gespeichert.'); return; }
  const forgeItem = event.target.closest('[data-forge-item]');
  if (forgeItem) {
    if (autoUpgradeRunning) return;
    selectedForForge.clear();
    selectedForForge.add(forgeItem.dataset.forgeItem);
    renderView();
    return;
  }
  if (event.target.closest('[data-forge-auto]')) { autoUpgrade(); return; }
  if (event.target.closest('[data-forge]')) { upgrade(); return; }
  const altarPreset = event.target.closest('[data-altar-preset]');
  if (altarPreset) {
    const input = altarPreset.closest('.altar-inspector')?.querySelector('[data-altar-quantity]');
    if (input && !input.disabled) {
      input.value = altarPreset.dataset.altarPreset === 'max' ? input.max : altarPreset.dataset.altarPreset;
      input.dispatchEvent(new Event('input', { bubbles: true }));
    }
    return;
  }
  const levelUp = event.target.closest('[data-level-up]');
  if (levelUp?.dataset.levelUp === 'pet') {
    const amount = Number(document.querySelector('[data-altar-quantity="pet"]')?.value || 1);
    performAction({ action: 'pet-level-up', class: selectedAltarPet()?.ownerClass, amount }, 'Begleittier aufgestiegen', response => `${response.item.name} ist jetzt auf Stufe ${response.level}.`);
    return;
  }
  if (levelUp) { const className = levelUp.dataset.levelUp; const amount = Math.max(1, Math.floor(Number(document.querySelector(`[data-altar-quantity="${CSS.escape(className)}"]`)?.value) || 1)); performAction({ action: 'level-up', class: className, amount }, 'Charakter aufgestiegen', (response) => `${CLASSES[className].label} ist jetzt auf Stufe ${response.level}.`); return; }
  const expandInventory = event.target.closest('[data-expand]');
  if (expandInventory && !expandInventory.disabled) {
    const input = expandInventory.closest('.inventory-expansion-controls')?.querySelector('[data-inventory-expansion-quantity]');
    const quantity = Number(input?.value ?? 1);
    if (!Number.isSafeInteger(quantity) || quantity < 1) return;
    expandInventory.disabled = true;
    performAction({ action: 'expand-inventory', quantity }, 'Inventar erweitert')
      .finally(() => syncInventoryExpansionControls());
    return;
  }
  const gear = event.target.closest('[data-gear-owner="main"][data-gear-slot]');
  if (gear && state.equipment.main[gear.dataset.gearSlot]) { unequip(gear.dataset.gearSlot); return; }
  const companionGear = event.target.closest('[data-gear-owner="companion"]');
  if (companionGear && state.equipment.companions[companionGear.dataset.gearClass]?.[companionGear.dataset.gearSlot]) { unequip(companionGear.dataset.gearSlot, 'companion', companionGear.dataset.gearClass); return; }
});

document.addEventListener('submit', (event) => {
  const resources = event.target.closest('#admin-resource-form');
  if (resources) {
    event.preventDefault();
    const slot = resources.elements.resourceType.value;
    const quantity = Number(resources.elements.resourceQuantity.value);
    const submit = resources.querySelector('[type="submit"]');
    submit.disabled = true;
    performAction({ action: 'admin-create-item', slot, quantity, rarity: 'Legendär' }).then((result) => {
      const refreshed = document.querySelector('#admin-resource-form');
      if (!refreshed) return;
      refreshed.elements.resourceType.value = slot;
      refreshed.elements.resourceQuantity.value = String(quantity);
      refreshed.querySelector('[type="submit"]').disabled = false;
    });
    return;
  }
  const form = event.target.closest('#admin-item-form');
  if (!form) return;
  event.preventDefault();
  const values = new FormData(form);
  const builderDraft = {
    slot: values.get('slot'),
    rarity: form.elements.rarity.value,
    set: values.get('set') || '',
    maxAffixRolls: values.has('maxAffixRolls'),
    greaterAffixes: values.has('greaterAffixes'),
    weaponLevel: Number(values.get('weaponLevel') || 0),
    mythicUpgradeLevel: Number(values.get('mythicUpgradeLevel') || 0),
    quantity: 1,
    affixes: Array.from(form.querySelectorAll('[name="affix"]')).map((select) => select.value),
  };
  performAction({
    action: 'admin-create-item',
    ...builderDraft,
    affixes: builderDraft.affixes.filter(Boolean),
  }).then((result) => {
    if (!result) return;
    const refreshedForm = document.querySelector('#admin-item-form');
    if (!refreshedForm) return;
    refreshedForm.elements.slot.value = builderDraft.slot;
    refreshedForm.elements.rarity.value = builderDraft.rarity;
    refreshedForm.elements.set.value = builderDraft.set;
    refreshedForm.elements.maxAffixRolls.checked = builderDraft.maxAffixRolls;
    refreshedForm.elements.weaponLevel.value = builderDraft.weaponLevel;
    refreshedForm.elements.mythicUpgradeLevel.value = builderDraft.mythicUpgradeLevel;
    refreshedForm.elements.greaterAffixes.checked = builderDraft.greaterAffixes;
    syncAdminBuilderFields(true);
    Array.from(refreshedForm.querySelectorAll('[name="affix"]')).forEach((select, index) => {
      select.value = builderDraft.affixes[index] || '';
    });
  });
});

document.addEventListener('dblclick', (event) => {
  if (isMobileLayout()) return;
  if (currentView === 'sockets' && selectedSocketMode === 'gems') {
    const gemCard = event.target.closest('[data-item-index]');
    const gem = gemCard ? state.inventory[Number(gemCard.dataset.itemIndex)] : null;
    if (!gem || !['weaponGem', 'armorGem'].includes(gem.slot)) return;
    const target = findInventoryOrEquippedItem(state, selectedSocketTargetId);
    const socketIndex = target?.sockets?.findIndex((entry, index) => index < (target.socketSlots || 0) && !entry) ?? -1;
    if (socketIndex < 0) { toastMessageFor('Kein freier Sockel', 'W\u00e4hle ein Ausr\u00fcstungsteil mit einem freien Sockelplatz.'); return; }
    performAction({ action: 'socket-gem', itemId: target.id, gemId: gem.id, socketIndex }, 'Edelstein eingesetzt', `${gem.name} wurde eingesetzt.`);
    return;
  }
  if (currentView === 'companions' || currentView === 'shop' || currentView === 'blacksmith' || currentView === 'sockets') return;
  const card = event.target.closest('[data-item-index]');
  if (!card) return;
  const item = state.inventory[Number(card.dataset.itemIndex)];
  if (item?.slot === 'bossReset' || item?.slot === 'towerReset') {
    if (currentView === 'inventory') performAction({ action: item.slot === 'bossReset' ? 'use-boss-reset' : 'use-tower-reset', itemId: item.id }, 'Zeitstein verwendet', 'Ein weiterer Versuch ist verfügbar.');
    return;
  }
  if (item?.slot === 'vipTicket') {
    if (currentView === 'inventory') performAction({ action: 'activate-vip', itemId: item.id }, 'VIP aktiviert', result => `VIP ist bis ${new Date(result.expiresAt).toLocaleString('de-DE')} aktiv.`);
    return;
  }
  if (item?.slot === 'powerup' || item?.slot === 'towerLootBoost') {
    if (currentView === 'inventory') performAction({ action: 'activate-powerup', itemId: item.id });
    return;
  }
  if (item && ['weaponGem', 'armorGem', 'upgradeStone', 'socketStone', 'rarityStone', 'affixStone'].includes(item.slot)) return;
  if (item) {
    const companion = document.querySelector('.inventory-layout[data-inventory-companion]')?.dataset.inventoryCompanion;
    if (companion) equipCompanion(item.id, companion);
    else equipMain(item.id);
  }
});
document.addEventListener('change', (event) => {
  if (event.target.matches('[data-loot-rule-field], [data-loot-rules-enabled]')) {
    if (lootRuleSavePending) return;
    const index = event.target.closest('[data-loot-rule-index]')?.dataset.lootRuleIndex;
    const field = event.target.dataset.lootRuleField;
    captureLootRuleDraft();
    renderView();
    const selector = field ? `[data-loot-rule-index="${index}"] [data-loot-rule-field="${field}"]` : '[data-loot-rules-enabled]';
    viewContainer.querySelector(selector)?.focus({ preventScroll: true });
    return;
  }
  if (event.target.id === 'admin-max-equipment-gem') {
    const button = document.querySelector('[data-admin-max-equipment]');
    if (button) button.disabled = !event.target.value;
    return;
  }
  if (event.target.matches('[data-tower-loot]')) {
    performAction({ action: 'update-settings', key: 'towerLoot', value: event.target.value, silent: true });
    return;
  }
  if (event.target.id === 'deep-tier-select') {
    selectedDeepTier = Math.max(0, Math.min(Number(state.deepOfDark?.tier) || 0, Math.floor(Number(event.target.value) || 0)));
    const unlockedTier = Number(state.deepOfDark?.tier) || 0;
    if (selectedDeepTier === unlockedTier && !areaUnlocked(state, AREAS.findIndex((area) => area.id === selectedAreaId))) selectedAreaId = AREAS[0].id;
    renderView();
    return;
  }
  if (event.target.matches('[data-auto-skills-default], [data-compact-damage-numbers], [data-workshop-animation], [data-loot-filter-rarity], [data-loot-filter-non-set]')) {
    const key = event.target.dataset.workshopAnimation || (event.target.matches('[data-auto-skills-default]') ? 'autoSkillsDefault'
      : event.target.matches('[data-compact-damage-numbers]') ? 'compactDamageNumbers'
        : event.target.matches('[data-loot-filter-non-set]') ? 'autoSellNonSet' : 'autoSellRarity');
    performAction({ action: 'update-settings', key, value: event.target.checked, rarity: event.target.dataset.lootFilterRarity, silent: true });
    return;
  }
  if (event.target.id === 'onboarding-companion') {
    onboardingCompanionClass = event.target.value || null;
    const start = document.querySelector('[data-onboarding-start]');
    if (start) start.disabled = !onboardingCompanionClass || !onboardingMainClass;
    return;
  }
  if (event.target.matches('#admin-item-form [name="slot"]')) {
    syncAdminBuilderFields(true);
    return;
  }
  if (event.target.matches('#admin-item-form [name="rarity"], #admin-item-form [name="affix"]')) {
    syncAdminBuilderFields(false);
    return;
  }
  if (event.target.matches('[data-socket-target-count]')) {
    if (autoSocketRunning || forgeAnimationInProgress) return;
    const target = workshopEquipmentItems(state).find(item => item.id === selectedSocketTargetId);
    const maximum = target ? socketCapacityForSlot(target.slot, target) : 0;
    selectedSocketTargetCount = maximum ? Math.max(1, Math.min(maximum, Math.floor(Number(event.target.value) || maximum))) : null;
    renderView();
    return;
  }
  if (event.target.matches('[data-forge-target-level]')) {
    if (autoUpgradeRunning || forgeAnimationInProgress) return;
    selectedForgeTargetLevel = Math.max(1, Math.min(selectedForgeMode === 'mythic' ? MYTHIC_ITEMS.maxUpgradeLevel : BALANCE.items.maxUpgradeLevel, Math.floor(Number(event.target.value) || 1)));
    renderView();
    return;
  }
  if (event.target.matches('[data-enchant-affix]')) {
    selectedEnchantAffixIndex = Number(event.target.value) || 0;
    return;
  }
  if (event.target.id === 'inventory-owner') {
    selectedInventoryOwner = event.target.value;
    renderView();
    return;
  }
  if (event.target.id === 'save-import') {
    const file = event.target.files?.[0];
    if (file) importSave(file);
    event.target.value = '';
    return;
  }
  const itemGridCategory = event.target.closest('[data-item-grid-category]');
  if (itemGridCategory) {
    const preference = itemGridPreferences[itemGridCategory.dataset.itemGridCategory];
    if (preference) { preference.category = itemGridCategory.value; renderView(); }
    return;
  }
  const itemGridSort = event.target.closest('[data-item-grid-sort]');
  if (!itemGridSort) return;
  const preference = itemGridPreferences[itemGridSort.dataset.itemGridSort];
  if (!preference) return;
  preference.sort = itemGridSort.value;
  renderView();
});
document.addEventListener('input', (event) => {
  if (event.target.matches('[data-inventory-expansion-quantity]')) syncInventoryExpansionControls(event.target);
  if (event.target.id === 'player-name') onboardingPlayerName = event.target.value;
});
document.addEventListener('input', (event) => {
  const input = event.target.closest('[data-altar-quantity]');
  if (!input || !state) return;
  const className = input.dataset.altarQuantity;
  const isPet = className === 'pet';
  const quote = isPet ? petUpgradeQuote(input.value) : altarUpgradeQuote(className, input.value);
  input.max = String(quote.max);
  input.min = quote.max ? '1' : '0';
  input.disabled = quote.max === 0;
  input.value = String(quote.amount);
  const panel = input.closest('.altar-inspector');
  if (!panel) return;
  panel.querySelector('[data-level-cost]').textContent = `✧ ${number(quote.cost)} Seelen`;
  panel.querySelector('[data-level-target]').textContent = `Stufe ${number(quote.level + quote.amount)}`;
  panel.querySelector('[data-altar-stats]').innerHTML = isPet ? renderPetStatPreview(quote.amount) : renderAltarStatPreview(className, quote.amount);
  panel.querySelector('[data-level-up]').disabled = quote.max === 0;
  panel.querySelectorAll('[data-altar-preset]').forEach((button) => { button.disabled = quote.max === 0; });
});
document.addEventListener('input', (event) => {
  const input = event.target.closest('[data-shop-quantity]');
  if (!input || !state) return;
  const group = input.dataset.shopQuantity;
  const freeSlots = Math.max(0, state.inventoryCapacity - inventoryOccupiedSlots(state));
  const stackableOffer = STACKABLE_SHOP_GROUPS.has(group);
  const canUseExistingStack = stackableOffer && state.inventory.some((item) => item.slot === group);
  const consumesInventorySlot = !stackableOffer;
  const maxAffordable = maxAffordableShopQuantity(state, group);
  const maxQuantity = Math.min(maxAffordable, consumesInventorySlot ? freeSlots : 1000);
  const canPurchaseSpace = !consumesInventorySlot || freeSlots > 0 || canUseExistingStack;
  const card = input.closest('.shop-product-card');
  const button = card?.querySelector('[data-buy]');
  const total = card?.querySelector('[data-shop-total]');
  input.max = String(maxQuantity);
  input.min = maxQuantity ? '1' : '0';
  if (!canPurchaseSpace || maxQuantity === 0) {
    input.value = '0';
    input.disabled = true;
    shopQuantities[group] = 0;
    if (button) button.disabled = true;
    if (total) total.textContent = `${String.fromCodePoint(0x2727)} ${number(shopPriceForLevel(partyLevel(state), group))} Seelen / Stück`;
    return;
  }
  input.disabled = false;
  if (input.value === '') {
    if (button) button.disabled = true;
    return;
  }
  const quantity = Math.max(1, Math.min(maxQuantity, Math.floor(Number(input.value) || 1)));
  input.value = String(quantity);
  shopQuantities[group] = quantity;
  const cost = shopPriceForLevel(partyLevel(state), group) * quantity;
  if (total) total.textContent = `${String.fromCodePoint(0x2727)} ${number(cost)} Seelen`;
  if (button) button.disabled = state.souls < cost;
});
document.addEventListener('dragstart', (event) => {
  if (isMobileLayout()) { event.preventDefault(); return; }
  if (currentView === 'shop' || currentView === 'blacksmith' || (currentView === 'sockets' && selectedSocketMode !== 'gems')) { event.preventDefault(); return; }
  const card = event.target.closest('[data-item-index]');
  if (!card) return;
  const item = state.inventory[Number(card.dataset.itemIndex)];
  if (currentView === 'sockets' && !['weaponGem', 'armorGem'].includes(item?.slot)) { event.preventDefault(); return; }
  event.dataTransfer.setData('text/plain', item?.id || '');
  event.dataTransfer.effectAllowed = 'move';
  card.classList.add('dragging');
});
document.addEventListener('dragend', (event) => event.target.closest('[data-item-index]')?.classList.remove('dragging'));
document.addEventListener('dragover', (event) => {
  const socketSlot = currentView === 'sockets' && selectedSocketMode === 'gems' ? event.target.closest('[data-socket-slot]') : null;
  if (socketSlot) { event.preventDefault(); socketSlot.classList.add('drop-target'); return; }
  const slot = event.target.closest('[data-gear-slot]');
  if (slot && !slot.disabled) { event.preventDefault(); slot.classList.add('drop-target'); }
});
document.addEventListener('dragleave', (event) => {
  event.target.closest('[data-gear-slot], [data-socket-slot]')?.classList.remove('drop-target');
});
document.addEventListener('drop', (event) => {
  const socketSlot = currentView === 'sockets' && selectedSocketMode === 'gems' ? event.target.closest('[data-socket-slot]') : null;
  if (socketSlot) {
    event.preventDefault();
    const gemId = event.dataTransfer.getData('text/plain');
    const gem = state.inventory.find((item) => item.id === gemId);
    if (!gem || !['weaponGem', 'armorGem'].includes(gem.slot)) return;
    performAction({ action: 'socket-gem', itemId: selectedSocketTargetId, gemId, socketIndex: Number(socketSlot.dataset.socketSlot) }, 'Edelstein eingesetzt', `${gem.name} wurde eingesetzt.`);
    return;
  }
  const mainSlot = event.target.closest('[data-gear-owner="main"][data-gear-slot]');
  const companionSlot = event.target.closest('[data-gear-owner="companion"][data-gear-slot]');
  const itemId = event.dataTransfer.getData('text/plain');
  if (mainSlot && !mainSlot.disabled) { event.preventDefault(); equipMain(itemId, mainSlot.dataset.gearSlot); }
  else if (companionSlot && !companionSlot.disabled) { event.preventDefault(); equipCompanion(itemId, companionSlot.dataset.gearClass, companionSlot.dataset.gearSlot); }
});
function setProgressTooltip(item, card, gear, explicitOwner = null) {
  if (!item) return '';
  const ownerRoot = card?.closest('[data-inventory-owner]');
  const companionOwner = Object.entries(state.equipment.companions || {}).find(([, equipment]) => Object.values(equipment || {}).some((equipped) => equipped?.id === item.id))?.[0];
  const ownerClass = explicitOwner || gear?.dataset.gearClass || ownerRoot?.dataset.inventoryOwner || companionOwner || state.mainClass;
  const equipment = equipmentForClass(ownerClass);
  const armorSet = item.set ? ARMOR_SETS[item.set] : null;
  const jewelrySet = item.set ? JEWELRY_SETS[item.set] : null;
  const definition = armorSet || jewelrySet;
  let markup = '';
  if (definition) {
    const slots = armorSet ? ['helmet', 'chest', 'gloves', 'boots'] : ['amulet', 'ring1', 'ring2', 'earring1', 'earring2'];
    const maxPieces = slots.length;
    const pieceCount = definition.class && definition.class !== ownerClass ? 0 : slots.filter((slot) => equipment[slot]?.set === item.set).length;
    const tiers = (definition.bonuses || []).map((bonus) => {
      const active = pieceCount >= bonus.pieces;
      const remaining = Math.max(0, bonus.pieces - pieceCount);
      const effects = setBonusDescription(bonus).split('; ').map(effect => `<p>${escapeHtml(effect)}</p>`).join('');
      return `<div class="tooltip-set-tier ${active ? 'is-active' : 'is-inactive'}"><span>${bonus.pieces}/${maxPieces} <b>${active ? 'AKTIV' : `NOCH ${remaining} ${remaining === 1 ? 'TEIL' : 'TEILE'}`}</b></span>${effects}</div>`;
    }).join('');
    markup += `<section class="tooltip-set-info"><header><span>${armorSet ? 'R&Uuml;STUNGSSET' : 'SCHMUCKSET'} &middot; ${escapeHtml(item.set)} · ${escapeHtml(CLASSES[definition.class]?.label || 'Alle Klassen')}</span><strong>${pieceCount}/${maxPieces} GETRAGEN</strong></header>${tiers}</section>`;
  }
  // Armor upgrade milestones belong to the equipped loadout, not to every
  // unequipped armor item that happens to be hovered in the inventory.
  if (gear && ['helmet', 'chest', 'gloves', 'boots'].includes(item.slot)) {
    const armor = ['helmet', 'chest', 'gloves', 'boots'].map((slot) => equipment[slot]);
    if (armor.every(Boolean)) {
      const lowestUpgrade = Math.min(...armor.map((piece) => Number(piece.upgradeLevel) || 0));
      const milestone = [...(BALANCE.items.armorUpgradeMilestones || [])].sort((a, b) => b.level - a.level).find((entry) => lowestUpgrade >= entry.level);
      if (milestone) {
        const effects = setBonusDescription(milestone).split('; ').map(effect => `<p>${escapeHtml(effect)}</p>`).join('');
        markup += `<section class="tooltip-set-info tooltip-armor-rank"><header><span>R&Uuml;STUNGSAUFWERTUNG</span><strong>+${milestone.level} &middot; 4/4</strong></header><div class="tooltip-set-tier is-active">${effects}</div></section>`;
      }
    }
  }
  return markup;
}

function itemComparisonSlots(item) {
  if (['bow', 'sword', 'staff', 'bell'].includes(item.slot)) return [{ slot: 'mainHand', label: 'Waffe' }];
  if (item.slot === 'shield') return [{ slot: 'offHand', label: 'Nebenhand' }];
  if (item.slot === 'ring') return [{ slot: 'ring1', label: 'Ring I' }, { slot: 'ring2', label: 'Ring II' }];
  if (item.slot === 'earring') return [{ slot: 'earring1', label: 'Ohrring I' }, { slot: 'earring2', label: 'Ohrring II' }];
  if (item.slot === 'glyph') return [1, 2, 3].map(index => ({ slot: `glyph${index}`, label: `Glyphe ${index}` }));
  return ['helmet', 'chest', 'gloves', 'boots', 'amulet'].includes(item.slot) ? [{ slot: item.slot, label: SLOT_DATA[item.slot].label }] : [];
}
function itemComparisonOwner(item, source, gear, questPreview) {
  const owners = [state.mainClass, state.activeCompanion].filter(Boolean);
  const equippedOwner = item.id && owners.find(owner => Object.values(equipmentForClass(owner)).some(equipped => equipped?.id === item.id));
  const inventoryOwner = source.closest('[data-inventory-owner]')?.dataset.inventoryOwner;
  const rewardOwner = questPreview?.reward?.owner === 'companion' ? state.activeCompanion : questPreview?.reward?.owner === 'main' ? state.mainClass : null;
  const preferred = gear?.dataset.gearClass || inventoryOwner || equippedOwner || rewardOwner
    || (currentView === 'inventory' && selectedInventoryOwner !== 'main' ? selectedInventoryOwner : state.mainClass);
  const slots = itemComparisonSlots(item);
  const compatible = owner => slots.some(({ slot }) => validateEquipmentForClass(state, item, slot, owner));
  return [...new Set([preferred, ...owners])].find(owner => owners.includes(owner) && compatible(owner)) || preferred;
}
function equippedItemComparisons(item, ownerClass) {
  const equipment = equipmentForClass(ownerClass);
  return itemComparisonSlots(item)
    .filter(({ slot }) => validateEquipmentForClass(state, item, slot, ownerClass))
    .map(entry => ({ ...entry, item: equipment[entry.slot] }))
    .filter(entry => entry.item && entry.item.id !== item.id);
}
function setTooltipMarkup(markup) {
  tooltip.innerHTML = markup;
  tooltip.querySelectorAll('p, .tooltip-affixes > span, .tooltip-special > span, .tooltip-type').forEach(element => {
    Array.from(element.childNodes).forEach(node => {
      if (node.nodeType !== Node.TEXT_NODE) return;
      const lines = detailTextLines(node.textContent);
      if (lines.length < 2) return;
      const fragment = document.createDocumentFragment();
      lines.forEach((line, index) => {
        if (index) fragment.append(document.createElement('br'));
        fragment.append(document.createTextNode(line));
      });
      node.replaceWith(fragment);
    });
  });
}
function renderItemTooltipContent(item, { card = null, gear = null, questPreview = null, milestoneDescription = '', milestoneRollNote = '', ownerClass = null } = {}) {
  const materialDescription = ['upgradeStone', 'mythicUpgradeStone', 'socketStone', 'rarityStone', 'affixStone'].includes(item.slot)
    ? SLOT_DATA[item.slot]?.description : '';
  const materialInfo = materialDescription ? `<div class="tooltip-special"><span>VERWENDUNG</span><p>${escapeHtml(materialDescription)}</p></div>` : '';
  const baseStatRangeLabel = (type) => {
    const range = itemBaseStatRange(item, type);
    return range && range[0] !== range[1] ? ` <small>(${number(range[0])}–${number(range[1])})</small>` : '';
  };
  const weaponDamage = item.weaponDamage
    ? `<div class="tooltip-weapon-damage"><span>WAFFENSCHADEN</span><strong>${number(effectiveWeaponDamage(item))}${baseStatRangeLabel('weaponDamage')}</strong></div>`
    : '';
  const weaponLevel = isLevelWeapon(item) ? Math.max(0, Number(item.weaponLevel) || 0) : 0;
  const weaponMaxed = weaponLevel >= WEAPON_PROGRESSION.maxLevel;
  const weaponLevelInfo = isLevelWeapon(item) ? `<div class="tooltip-special"><span>WAFFENLEVEL ${weaponLevel} / ${WEAPON_PROGRESSION.maxLevel}</span><p>+${formatRuleNumber(weaponLevel * WEAPON_PROGRESSION.damagePercentPerLevel)} % Waffenschaden (&times;${formatRuleNumber(weaponLevelDamageMultiplier(item))}).</p><p>${weaponMaxed ? `MAXIMALSTUFE &middot; +${WEAPON_PROGRESSION.completionDamagePercent} % multiplikativer Gesamtschaden (&times;${formatRuleNumber(weaponCompletionDamageMultiplier(item))}).` : `${number(Math.max(0, (item.weaponExperience || 0) - weaponExperienceThreshold(weaponLevel)))} / ${number(weaponExperienceThreshold(weaponLevel + 1) - weaponExperienceThreshold(weaponLevel))} EP bis Waffenlevel ${weaponLevel + 1}. Gegner in Gebieten und im Turm geben EP.`}</p></div>` : '';
  const armorDefense = item.armorDefense
    ? `<div class="tooltip-weapon-damage"><span>GRUNDVERTEIDIGUNG</span><strong>${number(item.armorDefense)}${baseStatRangeLabel('armorDefense')}</strong></div>`
    : '';
  const setBonus = setProgressTooltip(item, card, gear, ownerClass);
  const mythicEffect = isMythicWeapon(item) ? `<div class="tooltip-special tooltip-mythic-effect"><span>MYTHISCHER EFFEKT &middot; ${item.mythicUpgradeLevel || 0}/${MYTHIC_ITEMS.maxUpgradeLevel}</span><p>+${formatRuleNumber(mythicDamagePercent(item))} % multiplikativer Schaden f&uuml;r den Tr&auml;ger (&times;${formatRuleNumber(1 + mythicDamagePercent(item) / 100)}). Wirkt auf Angriffe, Schadensf&auml;higkeiten und Schaden &uuml;ber Zeit.</p></div>` : '';
  const baseAffixes = item.affixes || [];
  const socketTotals = new Map();
  (item.sockets || []).filter(Boolean).flatMap((gem) => gem.affixes || []).forEach((affix) => {
    socketTotals.set(affix.stat, (socketTotals.get(affix.stat) || 0) + (Number(affix.value) || 0));
  });
  const allAffixes = [...baseAffixes, ...Array.from(socketTotals, ([stat, value]) => ({ stat, value, fromSocket: true }))];
  const baseAffixCount = (item.affixes || []).length;
  const affixes = allAffixes.map((affix, index) => {
    const [min, max] = affixRangeFor(item, affix.stat, affix);
    const unit = AFFIX_PERCENT_STATS.has(affix.stat) ? '%' : '';
    const range = affix.fromSocket || (affix.greater && !isMythicWeapon(item)) ? '' : affix.fixed ? ' · fest' : ` (${formatRuleNumber(min)}–${formatRuleNumber(max)}${unit})`;
    const socketDivider = index === baseAffixCount && allAffixes.length > baseAffixCount ? '<span class="tooltip-socket-heading"><br>SOCKELBONI<br></span>' : '';
    return `${socketDivider}<span${affix.greater ? ' class="greater-affix"' : ''}>${affix.greater ? '✦ ' : ''}+${escapeHtml(formatRuleNumber(affix.value))}${unit} ${escapeHtml(affix.stat)}${range}</span>`;
  }).join('');
  const itemRank = `${['upgradeStone', 'mythicUpgradeStone', 'socketStone', 'rarityStone', 'affixStone'].includes(item.slot) ? 'Material' : ['weaponGem', 'armorGem'].includes(item.slot) ? `${escapeHtml(item.rarity)} · Edelstein` : `${escapeHtml(item.rarity)}${item.upgradeLevel ? ` · +${item.upgradeLevel}` : ''}`}${Number(item.quantity) > 1 ? ` · ×${number(item.quantity)}` : ''}`;
  const vipInfo = item.slot === 'vipTicket' ? `<div class="tooltip-special"><span>${VIP_RULES.durationDays} TAGE VIP</span>${[
    `+${BALANCE.dailyAttempts.vipBonus} freier Versuch pro Tag für Bossprüfung und Turm`,
    `${VIP_RULES.workshopSpeedMultiplier}× Geschwindigkeit für Schmiede, Sockel und Verzauberung.`,
    `+${VIP_RULES.upgradeChancePercent} % relative Upgradechance für normale und mystische Aufwertung sowie Sockelöffnen.`,
    `+${VIP_RULES.dropRatePercent} % relative Droprate.`,
    `+${VIP_RULES.soulBonusPercent} % Seelen aus Gebieten, Turm und Bossprüfung.`,
    'Doppelklick im Inventar aktiviert das Ticket.',
    `Weitere Tickets verlängern laufendes VIP um ${VIP_RULES.durationDays} Tage.`,
    'Die Laufzeit zählt auch bei geschlossenem Spiel.',
  ].map(line => `<p>${escapeHtml(line)}</p>`).join('')}</div>` : '';
  const powerupInfo = item.slot === 'powerup' ? `<div class="tooltip-special"><span>1 STUNDE</span><p>Gew&auml;hrt +10 % ${escapeHtml(item.powerupStat)}. Doppelklick im Inventar aktiviert das Power-up. Weitere Exemplare verl&auml;ngern die Laufzeit um je eine Stunde; der Bonuswert bleibt gleich.</p>${item.powerupStat === 'Upgradechance' ? '<p>Erhöht die Erfolgschance für normale und mystische Aufwertung sowie Sockelöffnen relativ: 1 % wird zu 1,1 %. Addiert sich mit Upgradechance aus Welt-Events und VIP; maximal 100 % Erfolgschance.</p>' : ''}${item.powerupStat === 'Droprate' ? '<p>Erhöht die Chancen auf Gebietsausrüstung, gewählte Turmbeute und Farm-Luckybox-Drops relativ: 50 % werden zu 55 %. Addiert sich mit Dropraten-Events. Boxinhalte und Affixwürfe bleiben unverändert.</p>' : ''}</div>` : '';
  const bossResetInfo = ['bossReset', 'towerReset'].includes(item.slot) ? `<div class="tooltip-special"><span>EIN ZUSÄTZLICHER VERSUCH</span><p>Doppelklick im Inventar gewährt genau einen Versuch ${item.slot === 'bossReset' ? 'in der Bossprüfung' : 'im Turm'}.</p><p>Nur verwendbar, wenn kein Versuch mehr vorhanden ist und kein entsprechender Lauf aktiv ist. Ein ungenutzter Steinversuch bleibt beim Tageswechsel erhalten.</p></div>` : '';
  const farmBoxInfo = item.slot === 'farmBox' ? `<div class="tooltip-special"><span>FARMBEUTE</span><p>${formatRuleNumber(BOX_RULES.farmBox.dropChance * 100)} % Basis-Dropchance pro gewonnenem Gebiets- oder Turmkampf; Dropratenboni erhöhen sie relativ. Enthält genau einen Gewinn: Seelen, Materialien, ein Powerup, einen Boss-Zeitstein, Turm-Zeitstein oder eine Glyphen-/VIP-Luckybox. Alle Chancen stehen im Kodex unter Schwarzmarkt und Luckyboxen.</p></div>` : '';
  const luckyBoxInfo = BOX_GROUPS.includes(item.slot) ? (questPreview ? '<div class="tooltip-special"><span>VERSIEGELT</span><p>Nach dem Abholen im Inventar öffnen.</p></div>' : `<div class="tooltip-special"><span>VERSIEGELT</span><p>Einfach anklicken, um die Box zu öffnen. Der Inhalt wird im Aktivitätslog festgehalten.</p></div>`) : '';
  const socketInfo = item.sockets?.length ? `<div class="tooltip-special"><span>SOCKEL · ${item.sockets.filter(Boolean).length}/${item.sockets.length}</span><p>Sockel aktiv</p></div>` : '';
  return `<div class="tooltip-rarity ${item.rarityColor}">${itemRank}</div><strong class="tooltip-name">${escapeHtml(item.name)}</strong><small class="tooltip-type">${escapeHtml(SLOT_DATA[item.slot]?.label || item.slot)}${item.set ? ` · Set ${escapeHtml(item.set)}` : ''}</small>${weaponDamage}${weaponLevelInfo}${armorDefense}${mythicEffect}${affixes ? `<div class="tooltip-affixes">${affixes}</div>` : ''}${materialInfo}${vipInfo}${powerupInfo}${bossResetInfo}${luckyBoxInfo}${farmBoxInfo}${socketInfo}${setBonus}${milestoneDescription}${milestoneRollNote}${item.passives ? `<div class="tooltip-special"><span>PASSIVE EFFEKTE</span>${item.passives.map((passive) => `<p>${escapeHtml(passive)}</p>`).join('')}</div>` : ''}${card?.hasAttribute('data-sell-item') ? `<div class="tooltip-sale-value">VERKAUFSWERT <strong>✧ ${isMythicWeapon(item) ? MYTHIC_ITEMS.saleStones + ' MYSTISCHE AUFWERTUNGSSTEINE' : number(sellValue(item)) + ' SEELEN'}</strong></div>` : ''}${card?.classList.contains('not-for-sale') ? '<div class="tooltip-sale-unavailable">Materialien, Verbrauchsgegenstände und Luckyboxen sind unverkäuflich.</div>' : ''}`;
}

let comparisonTooltipCloseTimer = null;
document.addEventListener('mouseover', (event) => {
  if (isMobileLayout()) return;
  if (event.target.closest('.equipment-comparison-tooltip, #player-identity, [data-active-powerups], [data-hunting-event-tooltip], [data-item-index], [data-mailbox-item], [data-gear-slot], [data-forge-item], [data-enchant-target-item], [data-socket-target-item], [data-quest-reward], [data-shop-offer-preview], [data-contract-milestone]')) window.clearTimeout(comparisonTooltipCloseTimer);
  if (event.target.closest('.equipment-comparison-tooltip')) return;
  const playerIdentity = event.target.closest('#player-identity');
  if (playerIdentity || event.target.closest('.player-statistics-tooltip')) {
    window.clearTimeout(playerStatisticsCloseTimer);
    if (playerIdentity && !tooltip.classList.contains('player-statistics-tooltip')) openPlayerStatisticsTooltip(playerIdentity);
    return;
  }
  if (tooltip.classList.contains('player-statistics-tooltip')) {
    if (!event.target.closest('[data-active-powerups], [data-hunting-event-tooltip], [data-item-index], [data-mailbox-item], [data-socket-target-item], [data-enchant-target-item], [data-forge-item], [data-gear-slot], [data-contract-milestone], [data-quest-reward], [data-shop-offer-preview]')) return;
    closePlayerStatisticsTooltip();
  }
  tooltip.classList.remove('equipment-comparison-tooltip');
  const huntingEvent = event.target.closest('[data-hunting-event-tooltip]');
  if (huntingEvent) {
    setTooltipMarkup(renderHuntingEventTooltip());
    tooltip.classList.add('powerup-tooltip', 'visible');
    return;
  }
  const activePowerups = event.target.closest('[data-active-powerups]');
  if (activePowerups) {
    const entries = (state?.activePowerups || []).filter((entry) => entry.expiresAt > Date.now());
    const available = Number(activePowerups.dataset.availablePowerups) || 0;
    const activeRows = entries.length ? entries.map((entry) => { const seconds = Math.max(0, Math.ceil((entry.expiresAt - Date.now()) / 1000)); const hours = Math.floor(seconds / 3600); const minutes = Math.floor((seconds % 3600) / 60); const time = hours ? `${hours}:${String(minutes).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}` : `${minutes}:${String(seconds % 60).padStart(2, '0')}`; return `<span>${`+10 % ${escapeHtml(entry.stat)}`} · ${time} verbleibend</span>`; }).join('') : '<span>Keine Power-ups aktiv</span>';
    setTooltipMarkup(`<div class="tooltip-rarity epic">${entries.length} AKTIV · ${available} BEREIT</div><strong class="tooltip-name">Dunkle Stärkung</strong><div class="tooltip-affixes">${activeRows}</div><div class="tooltip-special"><p>${available ? 'Klicken aktiviert ein Exemplar je Power-up-Typ. Bei Stapeln bleibt der Rest erhalten; gleiche Boni verlängern die Dauer.' : 'Power-ups aus Glückskisten erscheinen hier nach dem Kauf.'}</p></div>`);
    tooltip.classList.add('powerup-tooltip');
    tooltip.classList.add('visible');
    return;
  }
  const card = event.target.closest('[data-item-index]');
  const mailboxCard = event.target.closest('[data-mailbox-item]');
  const socketTargetCard = event.target.closest('[data-socket-target-item]');
  const enchantTargetCard = event.target.closest('[data-enchant-target-item]');
  const forgeTargetCard = event.target.closest('[data-forge-item]');
  const gear = event.target.closest('[data-gear-slot]');
  const milestone = event.target.closest('[data-contract-milestone]');
  const questRewardCard = event.target.closest('[data-quest-reward]');
  const shopOfferCard = event.target.closest('[data-shop-offer-preview]');
  if ((!card && !mailboxCard && !socketTargetCard && !enchantTargetCard && !forgeTargetCard && !gear && !milestone && !questRewardCard && !shopOfferCard) || !state) return;
  const questPreview = questRewardCard ? questRewardPreviews.get(questRewardCard.dataset.questReward) : null;
  if (questRewardCard && !questPreview) return;
  if (questPreview && !questPreview.item) {
    setTooltipMarkup(questRewardDescriptionMarkup(questPreview.reward));
    tooltip.classList.remove('powerup-tooltip', 'equipment-comparison-tooltip');
    tooltip.classList.add('visible');
    return;
  }
  let item;
  let milestoneDescription = '';
  let milestoneRollNote = '';
  if (questPreview) {
    item = questPreview.item;
    milestoneDescription = '<div class="tooltip-special"><span>AUFTRAGSBELOHNUNG</span><p>Vorschau der Belohnung. Zum Erhalten die Auftragsbelohnung abholen.</p></div>';
  } else if (milestone) {
    const reward = CONTRACT_MILESTONE_REWARDS[Number(milestone.dataset.contractMilestone)];
    if (!reward) return;
    const equippedItems = [
      ...Object.values(state.equipment.main || {}),
      ...Object.values(state.equipment.companions || {}).flatMap((entry) => Object.values(entry || {})),
    ];
    item = [...state.inventory, ...equippedItems].find((entry) => entry?.name === reward.name && entry.slot === reward.kind);
    if (!item) {
      const rarity = RARITIES.find((entry) => entry.color === 'common');
      milestoneRollNote = reward.set
        ? '<div class="tooltip-special"><span>RÜSTUNGSSET</span><p>Dieses Teil gehört zum markierten Rüstungsset.</p></div>'
        : '';
      item = {
        slot: reward.kind,
        name: reward.name,
        rarity: rarity?.name || 'Gew\u00f6hnlich',
        rarityColor: 'common',
        icon: reward.icon,
        affixes: ['ring', 'amulet'].includes(reward.kind) ? [{ stat: 'Seelenfund', value: 10, baseValue: 10, fixed: true }] : [],
        ...(reward.set ? { set: reward.set } : {}),
      };
    }
    milestoneDescription = `<div class="tooltip-special"><span>MEILENSTEIN-BELOHNUNG</span><p>${escapeHtml(reward.description)}</p></div>`;
  } else {
    item = shopOfferCard
      ? state.shopEquipmentOffers.find(offer => offer.id === shopOfferCard.dataset.shopOfferPreview)
      : mailboxCard
      ? state.mailbox.find((entry) => entry.id === mailboxCard.dataset.mailboxItem)?.item
      : socketTargetCard
      ? findInventoryOrEquippedItem(state, socketTargetCard.dataset.socketTargetItem)
      : enchantTargetCard
        ? findInventoryOrEquippedItem(state, enchantTargetCard.dataset.enchantTargetItem)
      : forgeTargetCard
        ? findInventoryOrEquippedItem(state, forgeTargetCard.dataset.forgeItem)
      : card
      ? state.inventory[Number(card.dataset.itemIndex)]
      : gear.dataset.gearSlot === 'pet' ? petForClass(gear.dataset.gearClass)
      : gear.dataset.gearOwner === 'companion'
        ? state.equipment.companions[gear.dataset.gearClass]?.[gear.dataset.gearSlot]
        : state.equipment.main[gear.dataset.gearSlot];
  }
  if (!item) return;
  if (item.slot === 'pet') milestoneDescription = `<div class="tooltip-special"><span>STUFE ${number(item.level)} · FEST GEBUNDEN</span><p>+${number(item.level * PET_RULES.attributePerLevel)} ${escapeHtml(petDefinition(item).stat)} für ${item.ownerClass === state.mainClass ? 'deinen Main' : 'deinen Gefährten'}. Alle Affixplätze sind einzeln umprägbar. Die Affixgrundwerte wachsen pro Tierstufe um ${formatRuleNumber(PET_RULES.affixPercentPerLevel)} % linear. Tieraffixe sind keine Greater Affixe.</p></div>`;
  const ownerClass = itemComparisonOwner(item, event.target, gear, questPreview);
  const content = renderItemTooltipContent(item, { card, gear, questPreview, milestoneDescription, milestoneRollNote, ownerClass });
  const comparisons = equippedItemComparisons(item, ownerClass);
  if (comparisons.length) {
    tooltip.classList.add('equipment-comparison-tooltip');
    const ownerLabel = `${CLASSES[ownerClass].label} · ${ownerClass === state.mainClass ? 'Main' : 'Gefährte'}`;
    setTooltipMarkup(`<section class="tooltip-comparison-column"><header class="tooltip-comparison-heading">AUSGEWÄHLT · ${escapeHtml(ownerLabel)}</header>${content}</section>${comparisons.map(({ item: equipped, slot, label }) => `<section class="tooltip-comparison-column"><header class="tooltip-comparison-heading">ANGELEGT · ${escapeHtml(label)}</header>${renderItemTooltipContent(equipped, { ownerClass, gear: { dataset: { gearClass: ownerClass, gearSlot: slot } } })}</section>`).join('')}`);
  } else setTooltipMarkup(content);
  if (comparisons.length) {
    const rect = tooltip.getBoundingClientRect();
    const left = event.clientX + 14 + rect.width <= innerWidth - 12 ? event.clientX + 14 : event.clientX - rect.width - 14;
    tooltip.style.left = `${Math.max(12, Math.min(left, innerWidth - rect.width - 12))}px`;
    tooltip.style.top = `${Math.max(12, Math.min(event.clientY + 14, innerHeight - rect.height - 12))}px`;
  }
  tooltip.classList.add('visible');
});
document.addEventListener('mousemove', (event) => {
  if (isMobileLayout()) return;
  if (!tooltip.classList.contains('visible')) return;
  if (tooltip.classList.contains('player-statistics-tooltip') || tooltip.classList.contains('equipment-comparison-tooltip')) return;
  const rect = tooltip.getBoundingClientRect();
  tooltip.style.left = `${Math.max(12, Math.min(event.clientX + 14, innerWidth - rect.width - 12))}px`;
  tooltip.style.top = `${Math.max(12, Math.min(event.clientY + 14, innerHeight - rect.height - 12))}px`;
});
document.addEventListener('mouseout', (event) => {
  if (isMobileLayout()) return;
  if (event.target.closest('#player-identity, .player-statistics-tooltip') && !event.relatedTarget?.closest?.('#player-identity, .player-statistics-tooltip')) schedulePlayerStatisticsClose();
  const fromItem = event.target.closest('.equipment-comparison-tooltip, [data-shop-offer-preview], [data-quest-reward], [data-active-powerups], [data-hunting-event-tooltip], [data-item-index], [data-mailbox-item], [data-socket-target-item], [data-enchant-target-item], [data-forge-item], [data-gear-slot], [data-contract-milestone]');
  const toItem = event.relatedTarget?.closest?.('.equipment-comparison-tooltip, [data-shop-offer-preview], [data-quest-reward], [data-active-powerups], [data-hunting-event-tooltip], [data-item-index], [data-mailbox-item], [data-socket-target-item], [data-enchant-target-item], [data-forge-item], [data-gear-slot], [data-contract-milestone]');
  if (fromItem && !toItem && !tooltip.classList.contains('player-statistics-tooltip')) {
    if (tooltip.classList.contains('equipment-comparison-tooltip')) {
      window.clearTimeout(comparisonTooltipCloseTimer);
      comparisonTooltipCloseTimer = window.setTimeout(() => tooltip.classList.remove('visible', 'equipment-comparison-tooltip'), 180);
    } else tooltip.classList.remove('visible', 'powerup-tooltip');
  }
});

document.addEventListener('focusin', (event) => {
  if (isMobileLayout()) return;
  window.clearTimeout(comparisonTooltipCloseTimer);
  const playerIdentity = event.target.closest('#player-identity');
  if (playerIdentity || event.target.closest('.player-statistics-tooltip')) {
    window.clearTimeout(playerStatisticsCloseTimer);
    if (playerIdentity) openPlayerStatisticsTooltip(playerIdentity);
    return;
  }
  const card = event.target.closest('[data-quest-reward], [data-shop-offer-preview], [data-hunting-event-tooltip]');
  if (!card) return;
  const rect = card.getBoundingClientRect();
  card.dispatchEvent(new MouseEvent('mouseover', { bubbles: true, clientX: rect.right, clientY: rect.top }));
  card.dispatchEvent(new MouseEvent('mousemove', { bubbles: true, clientX: rect.right, clientY: rect.top }));
});
document.addEventListener('focusout', (event) => {
  if (isMobileLayout()) return;
  if (event.target.closest('#player-identity, .player-statistics-tooltip') && !event.relatedTarget?.closest?.('#player-identity, .player-statistics-tooltip')) schedulePlayerStatisticsClose();
  if (event.target.closest('[data-quest-reward], [data-shop-offer-preview], [data-hunting-event-tooltip]')) tooltip.classList.remove('visible', 'powerup-tooltip');
});

function compactLifetimeNumber(value) {
  const amount = Math.max(0, Number(value) || 0);
  return compactNumber(amount, [['K', 1e3], ['Mio.', 1e6], ['Mrd.', 1e9], ['Bio.', 1e12]]);
}
function playerPlayTimeLabel(milliseconds) {
  const totalMinutes = Math.floor(Math.max(0, Number(milliseconds) || 0) / 60000);
  const days = Math.floor(totalMinutes / 1440);
  const hours = Math.floor((totalMinutes % 1440) / 60);
  const minutes = totalMinutes % 60;
  return days ? `${days} T. ${hours} Std. ${minutes} Min.` : hours ? `${hours} Std. ${minutes} Min.` : `${minutes} Min.`;
}
let playerStatisticsCloseTimer = null;
function schedulePlayerStatisticsClose() {
  window.clearTimeout(playerStatisticsCloseTimer);
  playerStatisticsCloseTimer = window.setTimeout(closePlayerStatisticsTooltip, 180);
}
function renderPlayerStatisticsGroups() {
  const stats = state?.statistics || {};
  const boxes = stats.luckyBoxesOpened || {};
  const groups = [
    ['Fortschritt', [
      ['Stufe', number(characterLevel(state.mainClass))],
      ['Gesamte Spielzeit', playerPlayTimeLabel(stats.playTimeMs)],
      ['Getötete Monster', number(stats.monstersKilled)],
      ['Erhaltene Seelen', number(stats.soulsEarned)],
      ['Tode', number(stats.deaths)],
      ['Turm · Rundenrekord', number(stats.towerBestRunRounds)],
      ['Turm · besiegte Bosse', number(stats.towerBossesKilled || 0)],
      ['VIP-Status', vipIsActive() ? `Aktiv bis ${new Date(state.vipExpiresAt).toLocaleString('de-DE')}` : 'Nicht aktiv'],
    ]],
    ['Kampf', [
      ['Verursachter Schaden', compactLifetimeNumber(stats.damageDealt)],
      ['Höchster Schaden mit einem Schlag', compactLifetimeNumber(stats.highestHit)],
    ]],
    ['Geöffnete Boxen', [
      ['Glyphen-Luckyboxen', number(boxes.glyphBox)],
      ['VIP-Luckyboxen', number(boxes.vipBox)],
      ['Farm-Luckyboxen', number(boxes.farmBox || 0)],
    ]],
    ['Handwerk & Handel', [
      ['Upgradeversuche beim Schmied', number(stats.forgeAttempts)],
      ['Upgradeversuche beim Sockeln', number(stats.socketAttempts)],
      ['Erhöhte Seltenheiten', number(stats.raritiesUpgraded)],
      ['Umgeprägte Affixe', number(stats.affixesRerolled)],
      ['Verkaufte Gegenstände', number(stats.itemsSold)],
      ['Automatisch verkaufte Gegenstände', number(stats.autoSoldItems || 0)],
    ]],
  ];
  return `<div class="player-stats-groups">${groups.map(([title, rows]) => `<section class="player-stats-group"><h3>${title}</h3>${rows.map(([label, value]) => `<div class="player-stats-row"><span>${label}</span><strong>${value}</strong></div>`).join('')}</section>`).join('')}</div>`;
}
function openPlayerStatisticsTooltip(anchor) {
  window.clearTimeout(playerStatisticsCloseTimer);
  setTooltipMarkup(`<header class="player-stats-heading"><div><span class="eyebrow">SPIELERCHRONIK</span><strong>${escapeHtml(state.playerName || 'Dein Charakter')}</strong></div><button type="button" class="player-stats-close ui-control ui-button ui-icon-button ui-close-button" data-close-player-statistics aria-label="Statistik schließen">×</button></header>${renderPlayerStatisticsGroups()}`);
  tooltip.classList.remove('powerup-tooltip', 'equipment-comparison-tooltip');
  tooltip.classList.add('player-statistics-tooltip', 'visible');
  tooltip.setAttribute('role', 'dialog');
  tooltip.setAttribute('aria-label', 'Spielerfortschritt');
  anchor.setAttribute('aria-expanded', 'true');
  const rect = anchor.getBoundingClientRect();
  const panel = tooltip.getBoundingClientRect();
  const left = Math.max(12, Math.min(rect.right - panel.width, innerWidth - panel.width - 12));
  const below = rect.bottom + 10;
  const top = below + panel.height <= innerHeight - 12 ? below : Math.max(12, rect.top - panel.height - 10);
  tooltip.style.left = `${left}px`;
  tooltip.style.top = `${top}px`;
}
function closePlayerStatisticsTooltip() {
  window.clearTimeout(playerStatisticsCloseTimer);
  tooltip.classList.remove('visible', 'player-statistics-tooltip');
  tooltip.setAttribute('role', 'tooltip');
  document.querySelector('#player-identity')?.setAttribute('aria-expanded', 'false');
}

async function init() {
  try {
    const result = await request('/state');
    state = result.state;
    startPlayTimeTracking();
    render();
    startWorldEventSystem();
    offlineFarmTransition = offlineFarmTransition.then(resumeOfflineFarm);
    await offlineFarmTransition;
    await tickPersistedWorkshop();
  } catch (error) {
    viewContainer.innerHTML = `<section class="server-error"><p class="eyebrow">LOKALER SPEICHER NICHT VERFÜGBAR</p><h1>Die Reise ruht.</h1><p>${escapeHtml(error.message)} Öffne Dark Return über eine lokale Vorschau wie VS Code Live Server oder über die veröffentlichte HTTPS-Adresse.</p><button class="primary-button ui-control ui-button" type="button" onclick="location.reload()">ERNEUT VERBINDEN <span>↻</span></button></section>`;
  }
}
init();
