// Background rewards must not replace controls or restart animated elements.
function backgroundNodeKey(node) {
  if (node.nodeType !== Node.ELEMENT_NODE) return null;
  if (node.id) return `id:${node.id}`;
  for (const attribute of ['data-item-key', 'data-mailbox-item', 'data-quest-reward', 'data-forge-item', 'data-enchant-target-item', 'data-socket-target-item', 'data-shop-offer-preview']) {
    if (node.hasAttribute(attribute)) return `${attribute}:${node.getAttribute(attribute)}`;
  }
  return null;
}
function patchBackgroundChildren(parent, nextParent) {
  const sameNodeKind = (a, b) => a && a.nodeType === b.nodeType && a.nodeName === b.nodeName
    && a.namespaceURI === b.namespaceURI && backgroundNodeKey(a) === backgroundNodeKey(b);
  let current = parent.firstChild;
  for (const next of Array.from(nextParent.childNodes)) {
    let node = current;
    if (!sameNodeKind(node, next)) {
      const key = backgroundNodeKey(next);
      node = key ? Array.from(parent.childNodes).find(candidate => sameNodeKind(candidate, next)) : null;
      if (!node) node = next.cloneNode(true);
      parent.insertBefore(node, current);
    }
    if (node.isEqualNode(next)) {
      current = node.nextSibling;
      continue;
    }
    // Native dropdowns and text editing must survive asynchronous rewards.
    if (node.nodeType === Node.ELEMENT_NODE) {
      const isControl = node.matches('input, select, textarea');
      if (!(isControl && node === document.activeElement)) {
        const dirtyInput = node.matches('input, textarea') && node.value !== node.defaultValue;
        const selectedValue = node.matches('select') ? node.value : null;
        for (const attribute of Array.from(node.attributes)) {
          if (dirtyInput && attribute.name === 'value') continue;
          if (!next.hasAttribute(attribute.name)) node.removeAttribute(attribute.name);
        }
        for (const attribute of Array.from(next.attributes)) {
          if (dirtyInput && attribute.name === 'value') continue;
          if (node.getAttribute(attribute.name) !== attribute.value) node.setAttribute(attribute.name, attribute.value);
        }
        if (!node.matches('input, textarea')) patchBackgroundChildren(node, next);
        if (node.matches('input') && !dirtyInput && node.value !== next.value) node.value = next.value;
        if (node.matches('select') && Array.from(node.options).some(option => option.value === selectedValue)) node.value = selectedValue;
      }
    } else if (node.nodeValue !== next.nodeValue) {
      node.nodeValue = next.nodeValue;
    }
    current = node.nextSibling;
  }
  while (current) {
    const following = current.nextSibling;
    current.remove();
    current = following;
  }
}
function patchBackgroundMarkup(parent, markup) {
  const template = document.createElement('template');
  template.innerHTML = markup;
  patchBackgroundChildren(parent, template.content);
}

// Application view lifecycle and navigation.
function renderView({ background = false } = {}) {
  if (!state) return;
  captureMobileViewState();
  syncWorkshopRuntime();
  if (!background) stopWorkshopVisuals();
  renderWorkshopStatus();
  renderHuntingEventWidget();
  if (currentView === 'admin') { currentView = 'settings'; selectedSettingsTab = 'admin'; }
  if (!background) {
    window.clearInterval(bossCooldownTimer);
    bossCooldownTimer = null;
  }
  const pageLabel = document.querySelector('#page-label');
  if (pageLabel) pageLabel.textContent = ['contracts', 'questbook'].includes(currentView) ? 'AUFTRÄGE' : currentView === 'companions' ? 'FÄHIGKEITEN' : currentView === 'skilltree' ? 'SKILLTREE' : currentView === 'sockets' ? 'SOCKEL' : currentView === 'enchant' ? 'VERZAUBERUNG' : currentView.toUpperCase();
  if (currentView === 'documentation' && pageLabel) pageLabel.textContent = 'KODEX';
  if (currentView === 'map' && pageLabel) pageLabel.textContent = 'KARTE';
  if (currentView === 'profile' && pageLabel) pageLabel.textContent = 'SPIELERCHRONIK';
  if (currentView === 'equipment' && pageLabel) pageLabel.textContent = 'AUSRÜSTUNG & WERTE';
  const soulBalance = document.querySelector('#soul-balance');
  if (soulBalance) soulBalance.textContent = number(state.souls);
  const mobileSoulBalance = document.getElementById('mobile-soul-balance');
  if (mobileSoulBalance) {
    mobileSoulBalance.textContent = compactLifetimeNumber(state.souls);
    mobileSoulBalance.parentElement.title = `${number(state.souls)} Seelen`;
    mobileSoulBalance.parentElement.setAttribute('aria-label', `${number(state.souls)} Seelen`);
  }
  const mobilePlayer = document.getElementById('mobile-player-shortcut');
  if (mobilePlayer) {
    mobilePlayer.hidden = !state.mainClass;
    if (state.mainClass) {
      const info = CLASSES[state.mainClass];
      const level = characterLevel(state.mainClass);
      const name = state.playerName || 'Dein Charakter';
      if (mobilePlayer.dataset.className !== state.mainClass) {
        mobilePlayer.querySelector('.mobile-player-class-icon').innerHTML = assetIconMarkup(info.asset, info.icon, 'mobile-player-class-glyph');
        mobilePlayer.dataset.className = state.mainClass;
      }
      mobilePlayer.querySelector('strong').textContent = name;
      mobilePlayer.querySelector('small').textContent = `Lv. ${number(level)}`;
      mobilePlayer.title = `${name} · ${info.label} · Stufe ${number(level)}`;
      mobilePlayer.setAttribute('aria-label', `${name}, ${info.label}, Stufe ${number(level)} – Spielerchronik öffnen`);
      mobilePlayer.classList.toggle('is-active', currentView === 'profile');
      if (currentView === 'profile') mobilePlayer.setAttribute('aria-current', 'page');
      else mobilePlayer.removeAttribute('aria-current');
    }
  }
  const playerIdentity = document.querySelector('#player-identity');
  if (playerIdentity) playerIdentity.hidden = !state.mainClass;
  if (!background && state.mainClass && playerIdentity) {
    const classIcon = playerIdentity.querySelector('.player-class-icon');
    if (classIcon) classIcon.innerHTML = assetIconMarkup(CLASSES[state.mainClass].asset, CLASSES[state.mainClass].icon, 'player-class-glyph');
    playerIdentity.querySelector('strong').textContent = state.playerName;
    renderVipBadge();
    playerIdentity.querySelector('small').textContent = `${CLASSES[state.mainClass].label} · Stufe ${characterLevel(state.mainClass)}`;
  }
  const inventoryCount = document.querySelector('#inventory-count');
  if (inventoryCount) inventoryCount.textContent = state.inventory.length;
  const skillTreeCount = document.querySelector('#skilltree-count');
  if (skillTreeCount) {
    const members = [...new Set([state.mainClass, state.activeCompanion].filter(Boolean))];
    const freePoints = members.map((className) => ({ className, points: Math.max(0, earnedSkillTreePoints(className) - spentSkillTreePoints(className)) }));
    const total = freePoints.reduce((sum, member) => sum + member.points, 0);
    skillTreeCount.hidden = total === 0;
    skillTreeCount.textContent = total;
    skillTreeCount.title = `Freie Skillpunkte: ${freePoints.map((member) => `${CLASSES[member.className].label}: ${member.points}`).join('\n')}`;
  }
  const readyQuestRewards = (state.questBook.board?.tasks || []).filter((entry) => !entry.claimed && questBoardProgress(state, entry.quest) >= entry.quest.target).length;
  const questCount = document.querySelector('#quest-count');
  questCount.hidden = !readyQuestRewards;
  questCount.textContent = readyQuestRewards > 9 ? '9+' : readyQuestRewards;
  if (background && (['settings', 'documentation'].includes(currentView) || forgeAnimationInProgress)) return;
  if (!state.mainClass) {
    document.querySelectorAll('.nav-item[data-view]').forEach((button) => {
      button.disabled = button.dataset.view !== 'documentation';
      button.classList.toggle('is-active', button.dataset.view === currentView);
    });
    viewContainer.innerHTML = currentView === 'documentation' ? renderDocumentation() : renderOnboarding();
    if (currentView === 'documentation') {
      buildCodexTableOfContents();
      const heading = viewContainer.querySelector('.codex-heading');
      if (heading && !heading.querySelector('[data-return-onboarding]')) {
        const returnButton = document.createElement('button');
        returnButton.className = 'primary-button ui-control ui-button codex-return-onboarding';
        returnButton.type = 'button';
        returnButton.dataset.returnOnboarding = '';
        returnButton.textContent = 'ZUR CHARAKTERERSTELLUNG';
        heading.insertBefore(returnButton, heading.querySelector('.codex-stamp'));
      }
    }
    applyPageNavigationIcon();
    syncMobileView({ background });
    return;
  }
  document.querySelectorAll('.nav-item[data-view]').forEach((button) => { button.disabled = false; });
  const views = { map: renderMap, tower: renderCurrentTower, boss: renderBossChallenge, contracts: renderUnifiedContracts, questbook: renderUnifiedContracts, inventory: renderInventory, equipment: renderEquipmentPage, shop: renderShop, blacksmith: renderBlacksmith, sockets: renderSockets, enchant: renderEnchantments, companions: renderCompanions, skilltree: renderSkillTree, altar: renderAltar, documentation: renderDocumentation, settings: renderSettings, profile: renderPlayerProfile };
  const markup = (views[currentView] || renderMap)();
  if (background) {
    const template = document.createElement('template');
    template.innerHTML = markup;
    applyPageNavigationIcon(template.content);
    syncMobileView({ root: template.content, background: true });
    patchBackgroundChildren(viewContainer, template.content);
    syncWorkshopAnimation();
    syncMobileView({ background });
    return;
  }
  viewContainer.innerHTML = markup;
  if (currentView === 'settings' && selectedSettingsTab === 'admin') syncAdminBuilderFields(true);
  applyPageNavigationIcon();
  if (currentView === 'boss' || currentView === 'tower') {
    updateBossCooldownView();
    window.clearInterval(bossCooldownTimer);
    bossCooldownTimer = window.setInterval(updateBossCooldownView, 1000);
  }
  if (currentView === 'documentation') { buildCodexTableOfContents(); }
  document.querySelectorAll('.nav-item[data-view]').forEach((button) => button.classList.toggle('is-active', button.dataset.view === currentView));
  document.querySelector('.settings-shortcut')?.classList.toggle('is-active', currentView === 'settings');
  syncWorkshopAnimation();
  syncMobileView({ background });
}
function setView(view, anchorId = null, { preserveForgeSelection = false } = {}) {
  if (typeof isMobileLayout === 'function' && isMobileLayout() && ['blacksmith', 'sockets', 'enchant'].includes(view)) {
    const itemId = view === 'blacksmith' ? [...selectedForForge][0] : view === 'sockets' ? selectedSocketTargetId : selectedEnchantTargetId;
    const item = findInventoryOrEquippedItem(state, itemId) || partyPets(state).find(pet => pet.id === itemId);
    if (item) {
      if (['blacksmith', 'sockets', 'enchant'].includes(currentView)) { currentView = 'inventory'; renderView(); }
      openMobileItemWorkshop(item.id, view === 'blacksmith' ? selectedForgeMode === 'mythic' ? 'mythic' : 'upgrade' : view === 'sockets' ? 'sockets' : 'affix');
    }
    else setView('inventory');
    return;
  }
  const enteringShop = view === 'shop' && currentView !== 'shop';
  currentView = view;
  if (!autoUpgradeRunning && !preserveForgeSelection) {
    selectedForForge.clear();
  }
  renderView();
  if (enteringShop && state.mainClass) performAction({ action: 'visit-shop', silent: true });
  tooltip.classList.remove('visible');
  if (anchorId) window.requestAnimationFrame(() => document.getElementById(anchorId)?.scrollIntoView({ behavior: 'smooth', block: 'start' }));
  else window.scrollTo({ top: 0, behavior: 'smooth' });
}

async function chooseMain(className, companionClass) {
  const playerName = document.querySelector('#player-name')?.value.trim() || onboardingPlayerName.trim();
  if (playerName.length < 2) {
    toastMessageFor('Name fehlt', 'Gib einen Namen mit mindestens zwei Zeichen ein.');
    document.querySelector('#player-name')?.focus();
    return;
  }
  if (!CLASSES[className] || !CLASSES[companionClass] || companionClass === className) {
    toastMessageFor('Gefährte fehlt', 'Wähle eine andere Klasse als Gefährten aus.');
    return;
  }
  try {
    const result = await enqueueStateTask(() => request('/choose-main', { class: className, companion: companionClass, name: playerName }));
    state = result.state;
    selectedInventoryOwner = 'main';
    selectedAbilityOwner = 'main';
    selectedSkillTreeOwner = 'main';
    currentView = 'map';
    render();
    toastMessageFor('Dein Weg beginnt', `${state.playerName} ist jetzt ${CLASSES[className].label}.`);
  } catch (error) { toastMessageFor('Klasse nicht gewählt', error.message); }
}
function render({ background = false } = {}) {
  if (!state) return;
  startWorldEventSystem();
  startActivePowerupTimer();
  renderActivePowerupsWidget();
  renderView({ background });
  renderActivityPanel();
  renderMailboxPanel();
  if (battle) {
    updateBattleUI();
    updateBattleDock();
  }
}

