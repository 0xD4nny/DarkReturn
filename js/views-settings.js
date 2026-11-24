// Save management and settings page.
function renderSettingsBase() {
  const gameplaySelected = selectedSettingsTab === 'gameplay';
  const content = gameplaySelected
    ? renderGameplaySettings()
    : renderSaveManagementSettings();
  return content;
}

function renderGameplaySettings() {
  const animationsEnabled = ['forgeAnimations', 'socketAnimations', 'enchantAnimations'].some(key => state.settings?.[key] !== false);
  return `<div class="gameplay-settings-grid"><section class="gameplay-option-card">
    <label class="gameplay-setting"><span><strong>Auto-Fähigkeiten</strong></span><input class="ui-control ui-check" type="checkbox" data-auto-skills-default ${state.settings?.autoSkillsDefault !== false ? 'checked' : ''}></label>
    <label class="gameplay-setting"><span><strong>Kompakte Schadenszahlen</strong></span><input class="ui-control ui-check" type="checkbox" data-compact-damage-numbers ${state.settings?.compactDamageNumbers === true ? 'checked' : ''}></label>
    <label class="gameplay-setting"><span><strong>Werkstattanimationen</strong></span><input class="ui-control ui-check" type="checkbox" data-workshop-animation="workshopAnimations" ${animationsEnabled ? 'checked' : ''}></label>
  </section></div>`;
}

function renderSaveManagementSettings() {
  const info = CLASSES[state.mainClass];
  return `<section class="settings-save-overview">
    <header class="settings-save-identity">
      <span class="settings-save-icon" aria-hidden="true">${assetIconMarkup(info.asset, info.icon, 'settings-class-glyph')}</span>
      <div><h3>${escapeHtml(state.playerName || 'Dein Charakter')}</h3><p>${escapeHtml(info.label)} · Stufe ${number(characterLevel(state.mainClass))}</p></div>
      <span class="settings-storage-state"><i aria-hidden="true"></i>Lokal gespeichert</span>
    </header>
  </section>
  <section class="settings-backup-panel">
    <h3>Spielstand sichern</h3><p>Bewahre eine Kopie deines Fortschritts auf oder lade eine vorhandene Sicherung.</p>
    <div class="settings-backup-buttons">
      <button class="ui-control ui-button" type="button" data-export-save><span aria-hidden="true">↓</span>Exportieren</button>
      <label class="import-save-button ui-control ui-button"><span aria-hidden="true">↑</span>Importieren<input class="ui-control ui-file" id="save-import" type="file" accept="application/json,.json"></label>
    </div>
    <details class="settings-storage-help"><summary>Wo wird mein Spielstand gespeichert?</summary><p>Dein Spielstand liegt in diesem Browser für diese Website-Adresse. Sichere die Exportdatei außerhalb des Browsers. Nach dem Löschen von Browserdaten kannst du sie hier wieder importieren.</p></details>
  </section>
  <details class="settings-danger-panel"><summary>Spielstand löschen</summary><div><p>Entfernt dauerhaft deinen gesamten Fortschritt und alle lokalen Sicherungsdaten dieser Website.</p><button class="danger-button ui-control ui-button" type="button" data-delete-save>Spielstand löschen</button></div></details>`;
}

function renderLegacyLootFilterSettings() {
  const rarities = RARITIES.filter(rarity => rarity.color !== 'mythic').map(rarity => `<label class="gameplay-setting loot-filter-setting"><span><strong class="rarity-${rarity.color}">${rarity.name}</strong></span><input class="ui-control ui-check" type="checkbox" data-loot-filter-rarity="${rarity.color}" ${(state.settings?.autoSellRarities || []).includes(rarity.color) ? 'checked' : ''}></label>`).join('');
  const nonSet = `<label class="gameplay-setting loot-filter-setting"><span><strong>Nur ohne Set</strong></span><input class="ui-control ui-check" type="checkbox" data-loot-filter-non-set ${state.settings?.autoSellNonSet === true ? 'checked' : ''}></label>`;
  return `<section class="gameplay-option-card loot-filter-card"><h3>Automatisch verkaufen</h3>${rarities}${nonSet}</section>`;
}

let lootRuleDraft = null;
let lootRuleDraftGeneration = -1;
let lootRuleSavePending = false;
function lootRuleEditorState() {
  if (!lootRuleDraft || lootRuleDraftGeneration !== stateGeneration) {
    const saved = state.settings.lootCollectionRules;
    lootRuleDraft = { enabled: saved?.enabled === true, rules: (saved?.rules || []).map(rule => ({ ...rule })) };
    lootRuleDraftGeneration = stateGeneration;
  }
  return lootRuleDraft;
}
function captureLootRuleDraft() {
  const editor = viewContainer.querySelector('[data-loot-rule-editor]');
  if (!editor) return;
  lootRuleDraft = {
    enabled: editor.querySelector('[data-loot-rules-enabled]').checked,
    rules: [...editor.querySelectorAll('[data-loot-rule-index]')].map(row => {
      const value = field => row.querySelector(`[data-loot-rule-field="${field}"]`).value;
      const slot = value('slot');
      let set = value('set');
      if (!['any', 'with-set', 'without-set'].includes(set) && !lootRuleSets(slot).includes(set)) set = 'any';
      if (set === 'with-set' && !lootRuleSets(slot).length) set = 'any';
      return { slot, rarity: value('rarity'), set, minGreater: Number(value('minGreater')) };
    }),
  };
  lootRuleDraftGeneration = stateGeneration;
}
async function saveLootRuleDraft() {
  if (lootRuleSavePending) return;
  captureLootRuleDraft();
  const value = lootRuleEditorState();
  if (!validLootCollectionRules(value)) {
    toastMessageFor('Sammelregeln prüfen', 'Zum Aktivieren muss mindestens eine vollständige Regel vorhanden sein.');
    return;
  }
  const generation = stateGeneration;
  lootRuleSavePending = true;
  viewContainer.querySelector('.loot-rule-controls').disabled = true;
  try {
    const result = await performAction({ action: 'update-settings', key: 'lootCollectionRules', value: structuredClone(value) }, 'Lootfilter gespeichert');
    if (result && generation === stateGeneration) lootRuleDraft = null;
  } finally {
    lootRuleSavePending = false;
    if (generation === stateGeneration && currentView === 'settings' && selectedSettingsTab === 'loot-filter') {
      renderView();
      viewContainer.querySelector('[data-loot-rules-save]')?.focus({ preventScroll: true });
    }
  }
}
function renderLootFilterSettings() {
  const draft = lootRuleEditorState();
  const option = (value, label, selected) => `<option value="${escapeHtml(value)}" ${value === selected ? 'selected' : ''}>${escapeHtml(label)}</option>`;
  const rules = draft.rules.map((rule, index) => {
    const slots = option('any', 'Alle Gegenstandstypen', rule.slot) + lootRuleSlots().map(slot => option(slot, SLOT_DATA[slot].label, rule.slot)).join('');
    const rarities = option('any', 'Alle Seltenheiten', rule.rarity) + RARITIES.filter(rarity => rarity.color !== 'mythic').map(rarity => option(rarity.color, rarity.name, rule.rarity)).join('');
    const sets = option('any', 'Mit und ohne Set', rule.set) + (lootRuleSets(rule.slot).length ? option('with-set', 'Gehört zu einem Set', rule.set) : '') + option('without-set', 'Ohne Set', rule.set)
      + lootRuleSets(rule.slot).map(name => option(name, name, rule.set)).join('');
    const greater = Array.from({ length: lootRuleMaxGreater() + 1 }, (_, count) => option(String(count), count ? `Mindestens ${count} GA` : 'Keine Mindestanzahl', String(rule.minGreater))).join('');
    return `<article class="loot-collection-rule" data-loot-rule-index="${index}"><header><h4>Regel ${index + 1}</h4><button class="ui-control ui-button" type="button" data-loot-rule-remove="${index}" aria-label="Regel ${index + 1} entfernen">Entfernen</button></header><div class="loot-rule-fields"><label>Gegenstandstyp<select class="ui-control ui-select" data-loot-rule-field="slot">${slots}</select></label><label>Seltenheit<select class="ui-control ui-select" data-loot-rule-field="rarity">${rarities}</select></label><label>Setzugehörigkeit<select class="ui-control ui-select" data-loot-rule-field="set">${sets}</select></label><label>Greater Affixe<select class="ui-control ui-select" data-loot-rule-field="minGreater">${greater}</select></label></div></article>`;
  }).join('');
  const savedActive = state.settings.lootCollectionRules?.enabled === true;
  return `<div class="loot-filter-workspace"><section class="gameplay-option-card loot-filter-card" data-loot-rule-editor><div class="loot-filter-intro"><h3>Gezielt sammeln</h3></div><fieldset class="loot-rule-controls" ${lootRuleSavePending ? 'disabled' : ''}><legend class="visually-hidden">Sammelregeln einstellen</legend><label class="gameplay-setting"><span><strong>Sammelregeln verwenden</strong></span><input class="ui-control ui-check" type="checkbox" data-loot-rules-enabled ${draft.enabled ? 'checked' : ''}></label><div class="loot-rule-list">${rules || '<p>Noch keine Regeln.</p>'}</div><div class="loot-rule-actions"><button class="ui-control ui-button" type="button" data-loot-rule-add ${draft.rules.length >= 20 ? 'disabled' : ''}>Regel hinzufügen</button><button class="primary-button ui-control ui-button" type="button" data-loot-rules-save ${draft.enabled && !draft.rules.length ? 'disabled' : ''}>${lootRuleSavePending ? 'Wird gespeichert …' : 'Regeln speichern'}</button></div></fieldset><p class="loot-rule-status" role="status">Gespeichert: ${savedActive ? `${state.settings.lootCollectionRules.rules.length} Sammelregel(n) aktiv` : 'Bisheriger Filter aktiv'}</p></section><details class="loot-legacy-settings"><summary>Bisheriger Filter${savedActive ? ' · inaktiv' : ''}</summary>${renderLegacyLootFilterSettings()}</details><button class="settings-help-link ui-control ui-link" type="button" data-open-codex-section="codex-inventory">Lootfilter im Kodex</button></div>`;
}

function renderSettings() {
  const tabs = [['gameplay', 'Spiel'], ['loot-filter', 'Lootfilter'], ['management', 'Spielstand'], ['admin', 'Admin']];
  if (!tabs.some(([id]) => id === selectedSettingsTab)) selectedSettingsTab = 'management';
  const buttons = tabs.map(([id, label]) => `<button class="settings-section-button ui-control ui-choice ${selectedSettingsTab === id ? 'is-selected' : ''}" type="button" data-settings-tab="${id}" aria-pressed="${selectedSettingsTab === id}">${label}</button>`).join('');
  const content = selectedSettingsTab === 'admin' ? renderAdminTools(true) : selectedSettingsTab === 'loot-filter' ? renderLootFilterSettings() : renderSettingsBase();
  return `<div class="settings-page"><div class="view-heading"><div><p class="eyebrow"><span></span> SPIELKONFIGURATION</p><h1>Ein<em>stellungen</em></h1><p class="welcome-sub">Passe dein Spiel an und verwalte deinen Spielstand.</p></div><div class="settings-section-switch" role="group" aria-label="Einstellungsbereich">${buttons}<button class="settings-section-button settings-codex-link ui-control ui-choice" type="button" data-view="documentation">Kodex</button></div></div><div class="settings-page-body">${content}</div></div>`;
}

async function deleteSave() {
  if (!window.confirm('Möchtest du den kompletten Dark-Return-Spielstand dauerhaft löschen? Diese Aktion kann nicht rückgängig gemacht werden.')) return;
  try {
    // Keep the revision when resetting so an older tab cannot restore deleted progress.
    await replaceSaveState(defaultState());
    showToastNotification('Spielstand gelöscht', 'Dein Abenteuer beginnt jetzt von vorn.');
  } catch (error) {
    showToastNotification('Löschen fehlgeschlagen', error.message);
  }
}
async function replaceSaveState(candidate) {
  if (saveMaintenance || saveBlocked) throw new Error('Der Spielstand ist momentan für Änderungen gesperrt.');
  saveMaintenance = true;
  try {
    stopSaveBackgroundWork();
    await actionQueue;
    await saveWriteQueue;
    stateGeneration += 1;
    await writeSavedState(candidate);
    state = candidate;
    selectedForForge.clear();
    selectedInventoryOwner = selectedAbilityOwner = selectedSkillTreeOwner = 'main';
    selectedAreaId = AREAS[0].id;
    selectedDeepTier = null;
    selectedSkillTreeNodeId = 'origin';
    selectedEnchantAffixIndex = 0;
    selectedSocketMode = 'ritual';
    selectedSocketTargetCount = null;
    selectedSocketUpgradeGemId = null;
    selectedEnchantMode = 'rarity';
    onboardingMainClass = onboardingCompanionClass = null;
    onboardingPlayerName = '';
    Object.keys(shopQuantities).forEach((key) => delete shopQuantities[key]);
    itemGridPreferences.inventory.category = 'weapons';
    itemGridPreferences.inventory.sort = 'rarity';
    currentView = 'map';
    tooltip.classList.remove('visible', 'player-statistics-tooltip', 'powerup-tooltip');
    lastPlayTimeTick = lastPlayTimePersistAt = Date.now();
  } finally {
    forgeAnimationInProgress = false;
    saveMaintenance = false;
    if (!saveBlocked) render();
  }
}
function exportSave() {
  const backup = { app: 'DarkReturn', version: 1, exportedAt: new Date().toISOString(), state };
  const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `dark-return-${(state.playerName || 'spielstand').toLowerCase().replace(/[^\p{L}\p{N}-]+/gu, '-')}.json`;
  link.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 0);
  toastMessageFor('Sicherung erstellt', 'Dein Spielstand wurde als JSON-Datei exportiert.');
}
async function importSave(file) {
  try {
    if (saveMaintenance || saveBlocked) throw new Error('Der Spielstand ist momentan für Änderungen gesperrt.');
    if (file.size > 10 * 1024 * 1024) throw new Error('Die Sicherungsdatei ist zu groß (maximal 10 MB).');
    const backup = JSON.parse(await file.text());
    const candidate = validateImportedSave(backup);
    if (!window.confirm(`Den aktuellen Spielstand durch den von ${candidate.playerName || 'Wanderer'} ersetzen?`)) return;
    await replaceSaveState(candidate);
    showToastNotification('Spielstand importiert', `Willkommen zurück, ${state.playerName || 'Wanderer'}.`);
  } catch (error) {
    showToastNotification('Import fehlgeschlagen', error.message || 'Die Datei konnte nicht gelesen werden.');
  }
}

