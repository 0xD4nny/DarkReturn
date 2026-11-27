// Page templates grouped separately from the render lifecycle.
function pageNavigationIcon(view) {
  const navigation = document.querySelector(`.main-nav .nav-item[data-view="${CSS.escape(view)}"]`)
    || document.querySelector('.main-nav .nav-item[data-view="map"]');
  const source = navigation?.querySelector('.nav-item-icon, svg');
  if (!source) return '';
  const icon = source.cloneNode(true);
  icon.classList.add('page-header-glyph');
  icon.setAttribute('aria-hidden', 'true');
  return icon.outerHTML;
}

function applyPageNavigationIcon(root = viewContainer) {
  const heading = root.querySelector('.view-heading');
  if (!heading) return;
  if (heading.querySelector('.page-header-icon')) return;
  const icon = document.createElement('div');
  icon.className = 'smith-mark page-header-icon';
  icon.dataset.pageView = currentView;
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
