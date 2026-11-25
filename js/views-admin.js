// Development-only controls and precise item construction UI.
function adminAffixOptions(slot, selected = '') {
  const stats = AFFIX_POOLS[slot] || [];
  return `<option value="">Kein Affix</option>${stats.map((stat) => `<option value="${escapeHtml(stat)}" ${stat === selected ? 'selected' : ''}>${escapeHtml(stat)}</option>`).join('')}`;
}

function adminGemOptions(slot) {
  const kind = 'weaponGem';
  const pools = BALANCE.items.gemValues;
  const profiles = GEM_PROFILES.filter(profile => profile.slot === kind).map(profile => profile.profile);

  return `<option value="">Leer lassen</option>${Object.keys(pools).flatMap((rarity) => profiles
    .map((profile) => {
      const value = `${kind}::${rarity}::${profile}`;
      const rarityName = RARITIES.find((entry) => entry.color === rarity)?.name || rarity;
      return `<option value="${escapeHtml(value)}">${escapeHtml(rarityName)} · ${escapeHtml(profile)}</option>`;
    })).join('')}`;
}

function renderAdminTools(embedded = false) {
  const slots = Object.entries(SLOT_DATA).filter(([, definition]) => !definition.deprecated);
  const equipmentOptions = slots
    .filter(([slot]) => AFFIX_POOLS[slot] && slot !== 'glyph')
    .map(([slot, info]) => `<option value="${escapeHtml(slot)}">${escapeHtml(info.label)}</option>`)
    .join('');
  const otherOptions = slots
    .filter(([slot]) => !AFFIX_POOLS[slot] && !['glyph', 'weaponGem', 'armorGem', 'pet'].includes(slot))
    .map(([slot, info]) => `<option value="${escapeHtml(slot)}">${escapeHtml(info.label)}</option>`)
    .join('');
  const glyphOptions = GLYPH_DEFINITIONS.map(definition => `<option value="glyph::${definition.id}">${escapeHtml(definition.name)}</option>`).join('');
  const gemOptions = adminGemOptions('bow').replace('<option value="">Leer lassen</option>', '');
  const powerupOptions = POWERUP_STATS.map(stat => `<option value="powerup::${escapeHtml(stat)}">${escapeHtml(stat)}-Power-up</option>`).join('');
  const rarities = RARITIES
    .map((rarity) => `<option value="${escapeHtml(rarity.name)}">${escapeHtml(rarity.name)}</option>`)
    .join('');
  const sets = [
    ...Object.keys(ARMOR_SETS).map((name) => `<option value="${escapeHtml(name)}" data-set-kind="armor">${escapeHtml(name)}</option>`),
    ...Object.keys(JEWELRY_SETS).map((name) => `<option value="${escapeHtml(name)}" data-set-kind="jewelry">${escapeHtml(name)}</option>`),
  ].join('');
  const affixFields = Array.from({ length: 4 }, (_, index) =>
    `<label>Affix ${index + 1}<select class="ui-control ui-select" name="affix">${adminAffixOptions('bow')}</select></label>`).join('');
  const actions = [
    ['admin-simulate-offline-hour', '1 Stunde AFK-Farmzeit', 'Eine Stunde Abwesenheit mit normaler AFK-Effizienz simulieren. Aktives Farmziel und vollständige Messung erforderlich.'],
    ['admin-grant-souls', '1 Mrd. Seelen', 'Eine Milliarde Seelen gutschreiben'],
    ['admin-next-hundred-level', 'Nächste Hunderterstufe', 'Main, Gefährte und ihre Tiere anheben'],
    ['admin-max-weapon-levels', 'Waffenlevel maximieren', `Angelegte Waffen von Main und Gefährte auf Level ${WEAPON_PROGRESSION.maxLevel} setzen`],
    ['admin-max-inventory', `Inventar auf ${BALANCE.inventory.maxCapacity}`, `Inventarplätze auf ${BALANCE.inventory.maxCapacity} setzen`],
  ].map(([action, title, detail]) => `
    <article class="admin-action-card">
      <div><strong>${title}</strong><small>${detail}</small></div>
      <button class="primary-button ui-control ui-button" type="button" data-admin-action="${action}" ${action === 'admin-simulate-offline-hour' && adminFarmSimulationPending ? 'disabled' : ''}>Ausführen</button>
    </article>`).join('');
  const activeEventId = currentWorldEvent?.id || '';
  const worldEventOptions = WORLD_EVENTS.flatMap((rarity) => rarity.effects.map((effect) => {
    const id = `${rarity.id}:${effect.stat}`;
    const label = effect.stat === 'attackPercent' ? 'Angriffskraft' : effect.label;
    return `<option value="${escapeHtml(id)}" ${id === activeEventId ? 'selected' : ''}>${escapeHtml(rarity.rarity)} · +${effect.value} % ${escapeHtml(label)}</option>`;
  })).join('');

  const heading = embedded ? '' : `
    <div class="view-heading">
      <div>
        <p class="eyebrow"><span></span> ENTWICKLUNGSWERKZEUGE</p>
        <h1>Admin <em>Kontrolle</em></h1>
        <p class="welcome-sub">Testressourcen verwalten und Gegenstände exakt für Builds zusammenstellen.</p>
      </div>
      <div class="smith-mark page-header-icon" aria-hidden="true">
        <svg viewBox="0 0 24 24"><path d="M12 3v18M3 12h18M5.6 5.6l12.8 12.8m0-12.8L5.6 18.4"/><circle cx="12" cy="12" r="8.5"/></svg>
      </div>
    </div>
`;
  return `${heading}
    <div class="admin-tools-layout">
      <section class="admin-item-builder">
        <div class="section-heading"><div><p class="eyebrow">GEGENSTANDSGENERATOR</p><h2>Ausrüstung erstellen</h2></div></div>
        <form id="admin-item-form">
            <div class="admin-item-builder-options">
              <label>Typ<select class="ui-control ui-select" name="slot" required><optgroup label="Ausrüstung">${equipmentOptions}</optgroup><optgroup label="Glyphen">${glyphOptions}</optgroup></select></label>
              <label>Seltenheit<select class="ui-control ui-select" name="rarity" required>${rarities}</select></label>
              <label>Set<select class="ui-control ui-select" name="set"><option value="">Kein Set</option>${sets}</select></label>
              <label>Waffenlevel<input class="ui-control ui-field" name="weaponLevel" type="number" min="0" max="${WEAPON_PROGRESSION.maxLevel}" step="1" value="0"></label>
              <label>Mystische Stufe<input class="ui-control ui-field" name="mythicUpgradeLevel" type="number" min="0" max="${MYTHIC_UPGRADES.maxUpgradeLevel}" step="1" value="0" disabled></label>
              ${affixFields}
              <label class="admin-checkbox-row">Maximale Affixwürfe<input class="ui-control ui-check" name="maxAffixRolls" type="checkbox"></label>
              <label class="admin-checkbox-row">Alle Greater Affixe<input class="ui-control ui-check" name="greaterAffixes" type="checkbox"></label>
            </div>
          <button class="primary-button ui-control ui-button admin-create-submit" type="submit">Erstellen</button>
        </form>
      </section>
      <section class="admin-resource-builder">
        <div class="section-heading"><div><p class="eyebrow">GEGENSTANDSGENERATOR</p><h2>Gegenstände erstellen</h2></div></div>
        <form id="admin-resource-form">
          <label>Typ<select class="ui-control ui-select" name="resourceType" required><optgroup label="Materialien und Luckyboxen">${otherOptions}</optgroup><optgroup label="Edelsteine">${gemOptions}</optgroup><optgroup label="Power-ups">${powerupOptions}</optgroup></select></label>
          <label>Menge<input class="ui-control ui-field" name="resourceQuantity" type="number" min="1" max="9999" step="1" value="1" required></label>
          <button class="primary-button ui-control ui-button admin-create-submit" type="submit">Erstellen</button>
        </form>
      </section>
      <section class="admin-actions-panel">
        <div class="section-heading"><div><p class="eyebrow">SPIELSTAND &amp; TESTS</p><h2>Admin-Aktionen</h2></div></div>
        <div class="admin-world-event">
          <div><strong>Aktives Event ändern</strong><small>Die Auswahl gilt sofort und startet den 30-Minuten-Timer neu.</small></div>
          <select class="ui-control ui-select" id="admin-world-event-choice" aria-label="Event auswählen">${worldEventOptions}</select>
          <button class="primary-button ui-control ui-button" type="button" data-admin-world-event-apply>Ausführen</button>
        </div>
        <div class="admin-world-event">
          <div><strong>Alle Ausrüstungsplätze und Sockelplätze maximal upgraden</strong><small>Main und aktiver Gefährte: +${BALANCE.items.maxUpgradeLevel}, ${BALANCE.items.socketCounts.equipment} offene Sockel pro Platz und überall der ausgewählte Edelstein.</small></div>
          <select class="ui-control ui-select" id="admin-max-equipment-gem" aria-label="Edelstein für alle Sockel auswählen"><option value="" disabled selected>Edelstein wählen</option>${gemOptions}</select>
          <button class="primary-button ui-control ui-button" type="button" data-admin-max-equipment disabled>Ausführen</button>
        </div>
        <div class="admin-action-list">${actions}</div>
      </section>
    </div>`;
}
