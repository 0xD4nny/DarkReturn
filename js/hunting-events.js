// A persistent hunt specifies one area and one fully completed difficulty.
function huntingEventEligibleTiers(save) {
  const current = Math.max(0, Math.min(BALANCE.deepOfDark.maxTier, Number(save.deepOfDark?.tier) || 0));
  return Array.from({ length: current + 1 }, (_, tier) => tier).filter(tier => tier < current
    || AREAS.every(area => save.deepOfDark?.clearedAreas?.includes(area.id)));
}
function createHuntingEvent(save, previous = null, startedAt = Date.now()) {
  const tiers = huntingEventEligibleTiers(save);
  if (!tiers.length) return null;
  const targets = tiers.flatMap(deepTier => AREAS.map(area => ({ areaId: area.id, deepTier })));
  const alternatives = targets.filter(target => target.areaId !== previous?.areaId || target.deepTier !== previous?.deepTier);
  return { id: createItemId(), ...choose(alternatives.length ? alternatives : targets), kills: 0,
    startedAt, nextAvailableAt: startedAt + HUNTING_EVENT_RULES.intervalSeconds * 1000, claimed: false };
}
function normalizeHuntingEvent(save) {
  if (!save.mainClass) { save.huntingEvent = null; return; }
  const tiers = huntingEventEligibleTiers(save);
  if (!save.huntingEvent || !AREAS.some(area => area.id === save.huntingEvent.areaId)
    || !tiers.includes(save.huntingEvent.deepTier)) {
    save.huntingEvent = createHuntingEvent(save);
  }
  const hunt = save.huntingEvent;
  if (!hunt) return;
  hunt.id ||= createItemId();
  hunt.startedAt = Math.max(0, Number(hunt.startedAt) || Date.now());
  const interval = HUNTING_EVENT_RULES.intervalSeconds * 1000;
  hunt.nextAvailableAt = hunt.startedAt + interval;
  hunt.claimed = hunt.claimed === true;
  hunt.kills = Math.max(0, Math.min(HUNTING_EVENT_RULES.targetKills, Math.floor(Number(hunt.kills) || 0)));
  delete hunt.killsByTier;
  if (Date.now() >= hunt.nextAvailableAt) {
    const currentWindowStart = hunt.startedAt + Math.floor((Date.now() - hunt.startedAt) / interval) * interval;
    save.huntingEvent = createHuntingEvent(save, hunt, currentWindowStart);
  }
}
function advanceHuntingEvent(save, areaId, tier, kills, eventId) {
  const hunt = save.huntingEvent;
  if (!hunt || hunt.claimed || hunt.areaId !== areaId || hunt.deepTier !== tier || eventId !== hunt.id) return;
  hunt.kills = Math.min(HUNTING_EVENT_RULES.targetKills, hunt.kills + Math.max(0, Math.floor(Number(kills) || 0)));
}
function huntingEventRewardTier(hunt) {
  return hunt && !hunt.claimed && Date.now() < hunt.nextAvailableAt && hunt.kills >= HUNTING_EVENT_RULES.targetKills ? hunt.deepTier : -1;
}
function renderHuntingEventWidget() {
  const slot = document.querySelector('#hunting-event-slot');
  if (!slot) return;
  slot.hidden = !state?.mainClass;
  if (slot.hidden) return;
  if (tooltip.classList.contains('visible') && tooltip.querySelector('[data-hunting-event-details]')) tooltip.innerHTML = renderHuntingEventTooltip();
  const hunt = state.huntingEvent;
  if (!hunt) {
    patchBackgroundMarkup(slot, `<div class="topbar-world-event hunting-event-panel" data-hunting-event-tooltip tabindex="0" aria-label="Jagd-Event noch nicht freigeschaltet"><i class="header-status-dot" aria-hidden="true"></i><span class="topbar-world-event-copy"><strong>Jagd-Event</strong><small>0/${HUNTING_EVENT_RULES.targetKills} MONSTER</small></span></div>`);
    return;
  }
  if (hunt.claimed) {
    patchBackgroundMarkup(slot, `<div class="topbar-world-event hunting-event-panel" data-hunting-event-tooltip tabindex="0" aria-label="Jagd-Event pausiert bis zum nächsten Start"><i class="header-status-dot is-active" aria-hidden="true"></i><span class="topbar-world-event-copy"><strong>Jagd-Event</strong><small>NEU IN <span data-hunting-event-countdown>${formatWorldEventTime(hunt.nextAvailableAt - Date.now())}</span></small></span></div>`);
    return;
  }
  const area = AREAS.find(entry => entry.id === hunt.areaId);
  const ready = huntingEventRewardTier(hunt) >= 0;
  const factor = hunt.deepTier + 1;
  const difficulty = hunt.deepTier ? `Deep ${hunt.deepTier}` : 'Normal';
  const reward = `${HUNTING_EVENT_RULES.rewards.glyphBox * factor} Glyphen-, ${HUNTING_EVENT_RULES.rewards.vipBox * factor} VIP- und ${HUNTING_EVENT_RULES.rewards.farmBox * factor} Farm-Luckyboxen`;
  const title = `Besiege ${HUNTING_EVENT_RULES.targetKills} Monster in ${area.name} auf ${difficulty}. Nur diese Kombination zählt. Belohnung: ${reward}. ${ready ? 'Klicken zum Abholen.' : ''}`;
  patchBackgroundMarkup(slot, `<button class="topbar-world-event hunting-event-panel ui-control ui-graphic ${ready ? 'is-ready' : ''}" type="button" data-claim-hunting-event="${escapeHtml(hunt.id)}" data-hunting-event-tooltip aria-label="${escapeHtml(title)}" aria-disabled="${!ready}"><i class="header-status-dot ${ready ? 'is-active' : 'is-pending'}" aria-hidden="true"></i><span class="topbar-world-event-copy"><strong>Jagd-Event</strong><small>${hunt.kills}/${HUNTING_EVENT_RULES.targetKills} MONSTER · <span data-hunting-event-countdown>${formatWorldEventTime(hunt.nextAvailableAt - Date.now())}</span></small></span></button>`);
}

function renderHuntingEventTooltip() {
  const hunt = state?.huntingEvent;
  if (!hunt) return '<div data-hunting-event-details class="tooltip-rarity common">NOCH NICHT VERFÜGBAR</div><strong class="tooltip-name">Jagd-Event</strong><div class="tooltip-special"><p>Schließe zuerst alle sechs Gebiete auf Normal ab. Danach werden Gebiet und Schwierigkeitsstufe zufällig vorgegeben. Nur vollständig abgeschlossene Stufen kommen in die Auswahl.</p></div>';
  if (hunt.claimed) return `<div data-hunting-event-details class="tooltip-rarity common">WARTEZEIT</div><strong class="tooltip-name">Jagd-Event</strong><div class="tooltip-special"><p>Belohnung abgeholt. Das nächste Jagd-Event startet in ${formatWorldEventTime(hunt.nextAvailableAt - Date.now())}.</p><p>Alle ${HUNTING_EVENT_RULES.intervalSeconds / 60} Minuten beginnt ein neues Event. Der Rhythmus läuft auch bei geschlossenem Spiel weiter.</p></div>`;
  const area = AREAS.find(entry => entry.id === hunt.areaId);
  const ready = huntingEventRewardTier(hunt) >= 0;
  const factor = hunt.deepTier + 1;
  const difficulty = hunt.deepTier ? `Deep of Dark ${hunt.deepTier}` : 'Normal';
  const rewards = Object.entries(HUNTING_EVENT_RULES.rewards).map(([group, quantity]) => `<span>${number(quantity * factor)} × ${escapeHtml(SLOT_DATA[group].label)}</span>`).join('');
  return `<div data-hunting-event-details class="tooltip-rarity ${ready ? 'legendary' : 'epic'}">${ready ? 'BELOHNUNG BEREIT' : 'IN ARBEIT'}</div><strong class="tooltip-name">Jagd-Event</strong><small class="tooltip-type">${escapeHtml(area.name)} · ${difficulty}</small><div class="tooltip-special"><p>Besiege ${HUNTING_EVENT_RULES.targetKills} Monster in diesem Gebiet auf dieser Stufe. Fortschritt: ${hunt.kills}/${HUNTING_EVENT_RULES.targetKills}.</p></div><div class="tooltip-special"><p>Wechsel in <span data-hunting-event-countdown>${formatWorldEventTime(hunt.nextAvailableAt - Date.now())}</span>. Beim Wechsel verfallen Fortschritt und nicht abgeholte Belohnungen.</p></div><div class="tooltip-affixes">${rewards}</div><div class="tooltip-special"><p>${ready ? 'Klicke vor Ablauf des Countdowns auf das Jagd-Event, um die Boxen abzuholen. Beim Wechsel verfällt die offene Belohnung.' : 'Kills in anderen Gebieten oder auf anderen Schwierigkeitsstufen zählen nicht. Nach Abschluss kannst du die Belohnung hier abholen.'}</p></div>`;
}

let huntingEventRefreshPending = false;
function updateHuntingEventTimer() {
  const hunt = state?.huntingEvent;
  if (!hunt) return;
  const ready = huntingEventRewardTier(hunt) >= 0;
  const panel = document.querySelector('#hunting-event-slot .hunting-event-panel');
  if (panel?.hasAttribute('data-claim-hunting-event') && panel.getAttribute('aria-disabled') !== String(!ready)) renderHuntingEventWidget();
  const dot = document.querySelector('#hunting-event-slot .header-status-dot');
  dot?.classList.toggle('is-active', ready || hunt.claimed);
  dot?.classList.toggle('is-pending', !ready && !hunt.claimed && Date.now() < hunt.nextAvailableAt);
  const remaining = hunt.nextAvailableAt - Date.now();
  document.querySelectorAll('[data-hunting-event-countdown]').forEach(clock => { clock.textContent = formatWorldEventTime(remaining); });
  if (remaining > 0 || huntingEventRefreshPending) return;
  huntingEventRefreshPending = true;
  const generation = stateGeneration;
  enqueueStateTask(async () => {
    if (generation !== stateGeneration || saveMaintenance || saveBlocked) return;
    normalizeHuntingEvent(state);
    await writeSavedState(state);
    if (generation === stateGeneration) renderHuntingEventWidget();
  }).catch(() => {}).finally(() => { huntingEventRefreshPending = false; });
}
