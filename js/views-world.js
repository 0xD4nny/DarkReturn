// Page templates grouped separately from the render lifecycle.
function pageNavigationIcon(view) {
  const icons = {
    equipment: '<svg viewBox="0 0 24 24"><path d="m12 3 8 3v5c0 5-3.4 8.3-8 10-4.6-1.7-8-5-8-10V6l8-3Z"/><path d="M8 9h8m-4-3v10"/></svg>',
    profile: '<svg viewBox="0 0 24 24"><circle cx="12" cy="7" r="4"/><path d="M4 21v-2a8 8 0 0 1 16 0v2"/></svg>',
    map: '<svg viewBox="0 0 24 24"><path d="m3 6 6-3 6 3 6-3v15l-6 3-6-3-6 3zM9 3v15m6-12v15"/></svg>',
    tower: assetIconMarkup('Assets/Icons/000000/transparent/1x1/lorc/stone-tower.svg', '♜', 'page-header-glyph'),
    boss: assetIconMarkup('Assets/Icons/000000/transparent/1x1/lorc/crowned-skull.svg', '☠', 'page-header-glyph'),
    contracts: '<svg viewBox="0 0 24 24"><path d="M7 4.5h10M7 8.5h10M7 12.5h7M5 3h14a1 1 0 0 1 1 1v16H4V4a1 1 0 0 1 1-1Zm3 16v2m9-2v2"/></svg>',
    inventory: '<svg viewBox="0 0 24 24"><path d="M4 8h16l1 12H3L4 8Zm4 0V6a4 4 0 0 1 8 0v2"/></svg>',
    skilltree: '<svg viewBox="0 0 24 24"><circle cx="12" cy="5" r="2.2"/><circle cx="6" cy="18" r="2.2"/><circle cx="18" cy="18" r="2.2"/><path d="m11 7-4 9m6-9 4 9M8.2 18h7.6"/></svg>',
    companions: '<svg viewBox="0 0 24 24"><circle cx="9" cy="8" r="3"/><circle cx="17" cy="9" r="2.5"/><path d="M2 20c.5-3.5 2.8-5.5 7-5.5s6.5 2 7 5.5m-1.5-5c3.8-.7 6.5 1 7 4.5"/></svg>',
    shop: '<svg viewBox="0 0 24 24"><path d="M4 8h16l1 13H3L4 8Zm4 0V6a4 4 0 0 1 8 0v2"/></svg>',
    blacksmith: '<svg viewBox="0 0 24 24"><path d="M14 4 20 10l-3 3-6-6M4 20l8-8m-5-5 4-4 3 3-4 4M3 21l4-4"/></svg>',
    sockets: '<svg viewBox="0 0 24 24"><path d="m12 2 8 5v10l-8 5-8-5V7l8-5Z"/><path d="M12 7v10M7 12h10"/></svg>',
    enchant: '<svg viewBox="0 0 24 24"><path d="m12 2 1.8 6.2L20 10l-6.2 1.8L12 18l-1.8-6.2L4 10l6.2-1.8L12 2Z"/><path d="m19 16 .9 2.1L22 19l-2.1.9L19 22l-.9-2.1L16 19l2.1-.9L19 16Z"/></svg>',
    altar: '<svg viewBox="0 0 24 24"><path d="M12 2v20m-7-3h14M7 19a5 5 0 0 1 10 0M5 9l7-7 7 7-7 4z"/></svg>',
    documentation: '<svg viewBox="0 0 24 24"><path d="M5 4.5A2.5 2.5 0 0 1 7.5 2H20v18H7.5A2.5 2.5 0 0 0 5 22V4.5Zm0 0V22m4-15h7m-7 4h7m-7 4h5"/></svg>',
    settings: '<svg viewBox="0 0 24 24"><path d="M19.14 12.94c.04-.3.06-.62.06-.94s-.02-.64-.07-.94l2.03-1.58a.5.5 0 0 0 .12-.61l-1.92-3.32a.5.5 0 0 0-.59-.21l-2.39.96a7.1 7.1 0 0 0-1.62-.93l-.36-2.54a.5.5 0 0 0-.49-.41h-3.84a.5.5 0 0 0-.49.41L9.22 5.37a7.1 7.1 0 0 0-1.62.93l-2.39-.96a.5.5 0 0 0-.59.21L2.7 8.87a.5.5 0 0 0 .12.61l2.03 1.58a7.4 7.4 0 0 0 0 1.88l-2.03 1.58a.5.5 0 0 0-.12.61l1.92 3.32a.5.5 0 0 0 .59.21l2.39-.96a7.1 7.1 0 0 0 1.62.93l.36 2.54a.5.5 0 0 0 .49.41h3.84a.5.5 0 0 0 .49-.41l.36-2.54a7.1 7.1 0 0 0 1.62-.93l2.39.96a.5.5 0 0 0 .59-.21l1.92-3.32a.5.5 0 0 0-.12-.61l-2.03-1.58z"/><circle cx="12" cy="12" r="3.2"/></svg>',
  };
  return icons[view] || icons.map;
}

function applyPageNavigationIcon(root = viewContainer) {
  const heading = root.querySelector('.view-heading');
  if (!heading) return;
  if (heading.querySelector('.page-header-icon')) return;
  const icon = document.createElement('div');
  icon.className = 'smith-mark page-header-icon';
  icon.setAttribute('aria-hidden', 'true');
  icon.innerHTML = pageNavigationIcon(currentView);
  const trailing = Array.from(heading.children).slice(1);
  if (trailing.length) {
    const aside = document.createElement('div');
    aside.className = 'page-heading-aside';
    trailing.forEach((child) => aside.append(child));
    aside.append(icon);
    heading.append(aside);
  } else {
    heading.append(icon);
  }
}

function renderOnboarding() {
  const companionOptions = onboardingMainClass
    ? Object.entries(CLASSES).filter(([id]) => id !== onboardingMainClass).map(([id, info]) => `<option value="${id}" ${id === onboardingCompanionClass ? 'selected' : ''}>${escapeHtml(info.label)}</option>`).join('')
    : '';
  return `<div class="onboarding-screen"><p class="eyebrow"><span></span> DIE DUNKELHEIT ERWACHT</p><h1>Wähle deinen <em>Weg.</em></h1><p class="welcome-sub">Gib deinem Wanderer einen Namen und wähle Main und Gefährten für deine Kampfgruppe.</p><p class="onboarding-help"><a class="ui-control ui-link" href="#codex-start" data-open-codex-section="codex-start">Neu hier? Zum Schnellstart im Kodex</a></p><label class="player-name-field"><span>NAME DEINES WANDERERS</span><input class="ui-control ui-field" id="player-name" name="player-name" type="text" minlength="2" maxlength="20" autocomplete="nickname" placeholder="Zum Beispiel: Raven" value="${escapeHtml(onboardingPlayerName)}" required></label><div class="class-choice-grid">${Object.entries(CLASSES).map(([key, info]) => `<article class="class-choice ${key} ${key === onboardingMainClass ? 'is-main-selected' : ''}"><div class="class-choice-icon">${assetIconMarkup(info.asset, info.icon, 'class-choice-image')}</div><div class="class-choice-role">${info.role}</div><h2>${info.label}</h2><p>${info.description}</p><button class="primary-button ui-control ui-button" type="button" data-onboarding-main="${key}" aria-pressed="${key === onboardingMainClass}">${key === onboardingMainClass ? 'MAIN GEWÄHLT' : 'ALS MAIN WÄHLEN'}</button></article>`).join('')}</div><div class="onboarding-companion-choice"><label><span>DEIN GEFÄHRTE</span><select class="ui-control ui-select" id="onboarding-companion" ${onboardingMainClass ? '' : 'disabled'}><option value="">${onboardingMainClass ? 'Gefährten wählen' : 'Zuerst Main wählen'}</option>${companionOptions}</select></label><button class="primary-button ui-control ui-button" type="button" data-onboarding-start ${onboardingMainClass && onboardingCompanionClass ? '' : 'disabled'}>GRUPPE ERSTELLEN</button></div><p class="choice-footnote">Du wählst genau einen Gefährten aus den drei Klassen, die nicht dein Main sind. Beide kämpfen mit eigener Ausrüstung und eigenen Lebenspunkten.</p></div>`;
}
function renderPlayerProfile() {
  return `<section class="player-profile-view"><div class="view-heading"><div><p class="eyebrow"><span></span> DEINE KAMPFGRUPPE</p><h1>Spieler<em>chronik</em></h1></div></div>${renderPlayerStatisticsGroups()}</section>`;
}
function renderMap() {
  const unlockedTier = Math.max(0, Number(state.deepOfDark?.tier) || 0);
  if (selectedDeepTier == null || selectedDeepTier > unlockedTier) selectedDeepTier = unlockedTier;
  const deepTier = selectedDeepTier;
  const historicalTier = deepTier < unlockedTier;
  const availableAreas = AREAS.filter((area, index) => historicalTier || areaUnlocked(state, index));
  const selectedArea = AREAS.find((area, index) => area.id === selectedAreaId && (historicalTier || areaUnlocked(state, index))) || availableAreas[0];
  const soulRange = areaSoulRewardRange(selectedArea.id, deepTier);
  const clearedCount = AREAS.filter((area) => (state.deepOfDark?.clearedAreas || []).includes(area.id)).length;
  const canAscend = !historicalTier && unlockedTier < (BALANCE.deepOfDark?.maxTier || 3) && clearedCount === AREAS.length;
  const tierOptions = Array.from({ length: unlockedTier + 1 }, (_, tier) => `<option value="${tier}" ${tier === deepTier ? 'selected' : ''}>${tier === 0 ? 'Grundstufe' : `Deep of Dark ${tier}`}</option>`).join('');
  const deepTierControl = `<label class="deep-tier-control"><span>DEEP OF DARK</span><select class="ui-control ui-select" id="deep-tier-select">${tierOptions}</select></label>${canAscend ? `<button class="primary-button ui-control ui-button deep-ascend-button" type="button" data-ascend-deep>DEEP OF DARK ${unlockedTier + 1} FREISCHALTEN</button>` : ''}`;
  selectedAreaId = selectedArea.id;
  const zoneButtons = AREAS.map((area, index) => {
    const locked = !historicalTier && !areaUnlocked(state, index);
    const visited = state.visitedAreas.includes(area.id);
    const selected = area.id === selectedArea.id;
    return `<button class="atlas-node ui-control ui-graphic ${locked ? 'locked' : ''} ${visited ? 'visited' : ''} ${selected ? 'selected' : ''}" type="button" style="--node-x:${area.x}%;--node-y:${area.y}%" data-select-area="${area.id}" aria-label="${escapeHtml(area.name)}${locked ? `, zuerst das vorherige Gebiet bezwingen` : ', Ziel ausw&auml;hlen'}" aria-pressed="${selected}" ${locked ? 'disabled' : ''}><span class="atlas-node-index">${String(index + 1).padStart(2, '0')}</span>${assetIconMarkup(locked ? null : area.asset, locked ? '⌑' : area.icon, 'atlas-node-icon')}<small>${escapeHtml(area.name)}</small></button>`;
  }).join('');
  const firstClearBonus = areaFirstClearSouls(selectedArea.id, deepTier);
  const firstClearAvailable = !historicalTier && !(state.deepOfDark?.clearedAreas || []).includes(selectedArea.id);
  return `<div class="view-heading atlas-heading"><div><p class="eyebrow"><span></span> DIE GRENZLANDE</p><h1>Jenseits der <em>Wacht</em></h1><p class="welcome-sub">Wähle dein nächstes Ziel und bereite den Aufbruch in die Dunkelheit vor.</p></div></div>
    <section class="atlas-shell" aria-label="Karte der Grenzlande">
      <div class="atlas-map-frame">
        <div class="atlas-map-topline"><span><i></i> DIE GRENZLANDE</span><span>${deepTier ? `DEEP OF DARK ${deepTier}` : 'GRUNDSTUFE'}</span></div>
        <div class="atlas-map">
          <img class="atlas-landscape" src="Assets/Art/world/grenzlande-atlas-v2.png" width="1536" height="1024" alt="" aria-hidden="true" draggable="false" fetchpriority="high">
          <div class="atlas-compass" aria-hidden="true"><span>N</span><b>✦</b><i></i><small>W</small></div>
          ${zoneButtons}
          <div class="atlas-scale" aria-hidden="true"><i></i><span>100 LEUGEN</span></div>
        </div>
        <div class="atlas-map-footer"><span><i class="atlas-legend-dot open"></i> Erreichbar</span><span><i class="atlas-legend-dot explored"></i> Bereits erkundet</span><span><i class="atlas-legend-dot sealed"></i> Noch versiegelt</span></div>
      </div>
      <aside class="atlas-sidebar" aria-label="Ausgewähltes Gebiet">
        <section class="boss-challenge-copy expedition-card">
          <p class="eyebrow">${escapeHtml(selectedArea.biome)} · ${escapeHtml(selectedArea.danger)}</p>
          <h2>${escapeHtml(selectedArea.name)}</h2>
          <h3>${escapeHtml(selectedArea.subtitle)}</h3>
          <p class="expedition-description">${escapeHtml(selectedArea.description)}</p>
          <div class="boss-challenge-facts expedition-data">
            <div><small>SEELEN PRO SIEG</small><strong>${number(soulRange[0])}–${number(soulRange[1])}</strong></div>
          </div>
          ${firstClearAvailable ? `<p class="first-clear-note">Erstabschluss: +${number(firstClearBonus)} Seelen und ${number(BALANCE.loot.firstClearFarmBoxes)} Farm-Luckyboxen (feste Prämie).</p>` : ''}
          <div class="expedition-controls">${deepTierControl}<button class="primary-button ui-control ui-button expedition-launch" type="button" data-start-area="${selectedArea.id}">GEBIET BETRETEN</button></div>
          <div class="boss-rank-inline expedition-notes">
            <div><small>BEKANNTER FEIND</small><strong>${escapeHtml(ENEMIES[selectedArea.id].name)}</strong></div>
            <p class="expedition-status">${state.visitedAreas.includes(selectedArea.id) ? 'BEREITS ERKUNDET' : 'UNERKUNDETE REGION'}</p>
            </div>
          <a class="ui-control ui-link codex-panel-link" href="#codex-areas" data-open-codex-section="codex-areas">GEBIETE IM KODEX</a>
        </section>
      </aside>
    </section>`;
}
