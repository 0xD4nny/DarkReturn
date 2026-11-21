const WORLD_EVENT_STORAGE_KEY = 'dark-return-world-event-v1';
const WORLD_EVENT_INTERVAL_MS = 30 * 60 * 1000;
let currentWorldEvent = null;
let worldEventDeadline = 0;
let worldEventRotationTimer = null;
let worldEventClockTimer = null;

function getWorldEvent(sourceState = null) {
  if (sourceState?.offlineContext) return sourceState.offlineContext.worldEvent;
  return currentWorldEvent || { attackPercent: 0, healthPercent: 0, strengthPercent: 0, staminaPercent: 0, dexterityPercent: 0, intelligencePercent: 0, soulBonusPercent: 0, dropRatePercent: 0, upgradeChancePercent: 0 };
}
function worldEventFromId(id) {
  const [rarityId, stat] = String(id || '').split(':');
  const rarity = WORLD_EVENTS.find((event) => event.id === rarityId);
  if (!rarity) return null;
  const effect = rarity.effects.find((entry) => entry.stat === stat) || (!stat ? choose(rarity.effects) : null);
  if (!effect) return null;
  return {
    id: `${rarity.id}:${effect.stat}`,
    rarityId: rarity.id,
    rarity: rarity.rarity,
    effectLabel: effect.label,
    effectValue: effect.value,
    attackPercent: 0,
    healthPercent: 0,
    strengthPercent: 0,
    staminaPercent: 0,
    dexterityPercent: 0,
    intelligencePercent: 0,
    soulBonusPercent: 0,
    dropRatePercent: 0,
    upgradeChancePercent: 0,
    [effect.stat]: effect.value,
  };
}
function chooseWorldEvent() {
  const rarity = choose(WORLD_EVENTS);
  const effect = choose(rarity.effects);
  return worldEventFromId(`${rarity.id}:${effect.stat}`);
}
function setWorldEventFromAdmin(id) {
  const selected = worldEventFromId(id);
  if (!selected) return false;
  currentWorldEvent = selected;
  worldEventDeadline = Date.now() + WORLD_EVENT_INTERVAL_MS;
  storeWorldEvent(currentWorldEvent, worldEventDeadline);
  scheduleWorldEventRotation();
  renderWorldEventWidget();
  if (typeof refreshBattleHealth === 'function') refreshBattleHealth();
  showToastNotification(`Event gesetzt · ${currentWorldEvent.rarity}`, worldEventDescription(currentWorldEvent));
  return true;
}
function readStoredWorldEvent() {
  try {
    const saved = JSON.parse(localStorage.getItem(WORLD_EVENT_STORAGE_KEY) || 'null');
    if (saved && worldEventFromId(saved.id) && Number.isFinite(saved.nextAt)) return saved;
  } catch (_) { /* Storage can be unavailable in private browsing. */ }
  return null;
}
function storeWorldEvent(event, nextAt) {
  try { localStorage.setItem(WORLD_EVENT_STORAGE_KEY, JSON.stringify({ id: event.id, nextAt })); } catch (_) { /* Keep the current event for this tab. */ }
}
function formatWorldEventTime(milliseconds) {
  const seconds = Math.max(0, Math.ceil(milliseconds / 1000));
  return `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`;
}
function worldEventDescription(event = getWorldEvent()) {
  if (!event.effectLabel) return 'Kein aktiver Bonus';
  const label = event.effectLabel === 'Angriff' ? 'Angriffskraft' : event.effectLabel;
  return `+${event.effectValue} % ${label} Event`;
}
function showToastNotification(title, message) {
  const stack = document.querySelector('#toast-stack') || (() => {
    const element = document.createElement('div');
    element.id = 'toast-stack';
    element.className = 'toast-stack';
    document.body.append(element);
    return element;
  })();
  const toast = document.createElement('button');
  toast.type = 'button';
  toast.className = 'world-event-toast ui-control ui-graphic';
  toast.setAttribute('aria-label', `${title}. Zum Schlie\u00dfen anklicken.`);
  toast.innerHTML = `<span class="world-event-toast-mark" aria-hidden="true">\u2726</span><span><strong></strong><small></small></span><span class="world-event-toast-close" aria-hidden="true">\u00d7</span>`;
  toast.querySelector('strong').textContent = title;
  toast.querySelector('small').textContent = message;
  toast.addEventListener('click', () => toast.remove());
  stack.append(toast);
  window.setTimeout(() => toast.remove(), 9000);
}
function renderWorldEventWidget() {
  const slot = document.querySelector('#world-event-slot');
  if (!slot || !currentWorldEvent) return;
  const remaining = worldEventDeadline - Date.now();
  const event = currentWorldEvent;
  const existing = slot.querySelector('.topbar-world-event');
  if (existing?.dataset.eventId === event.id) {
    existing.querySelector('small').textContent = `WECHSEL IN ${formatWorldEventTime(remaining)}`;
    return;
  }
  slot.innerHTML = `<div class="topbar-world-event rarity-${event.rarityId}" data-event-id="${escapeHtml(event.id)}"><i class="header-status-dot is-active" aria-hidden="true"></i><span class="topbar-world-event-copy"><strong>${escapeHtml(worldEventDescription(event))}</strong><small>WECHSEL IN ${formatWorldEventTime(remaining)}</small></span></div>`;
}
function scheduleWorldEventRotation() {
  window.clearTimeout(worldEventRotationTimer);
  worldEventRotationTimer = window.setTimeout(rotateWorldEvent, Math.max(0, worldEventDeadline - Date.now()));
}
function rotateWorldEvent() {
  const now = Date.now();
  const stored = readStoredWorldEvent();
  if (stored && stored.nextAt > now) {
    currentWorldEvent = worldEventFromId(stored.id) || currentWorldEvent;
    worldEventDeadline = stored.nextAt;
    renderWorldEventWidget();
    scheduleWorldEventRotation();
    return;
  }
  let nextAt = worldEventDeadline || now;
  let nextEvent = currentWorldEvent || chooseWorldEvent();
  let rotations = 0;
  do {
    nextEvent = chooseWorldEvent();
    nextAt += WORLD_EVENT_INTERVAL_MS;
    rotations += 1;
  } while (nextAt <= now && rotations < 100000);
  currentWorldEvent = nextEvent;
  worldEventDeadline = nextAt;
  storeWorldEvent(currentWorldEvent, worldEventDeadline);
  if (typeof refreshBattleHealth === 'function') refreshBattleHealth();
  renderWorldEventWidget();
  showToastNotification(`Event gewechselt \u00b7 ${currentWorldEvent.rarity}`, worldEventDescription(currentWorldEvent));
  scheduleWorldEventRotation();
}
function startWorldEventSystem() {
  if (!WORLD_EVENTS.length) return;
  if (!currentWorldEvent) {
    const saved = readStoredWorldEvent();
    if (saved) {
      currentWorldEvent = worldEventFromId(saved.id) || chooseWorldEvent();
      worldEventDeadline = saved.nextAt;
      if (worldEventDeadline <= Date.now()) {
        rotateWorldEvent();
        return;
      }
    } else {
      currentWorldEvent = chooseWorldEvent();
      worldEventDeadline = Date.now() + WORLD_EVENT_INTERVAL_MS;
      storeWorldEvent(currentWorldEvent, worldEventDeadline);
    }
  }
  renderWorldEventWidget();
  scheduleWorldEventRotation();
  if (!worldEventClockTimer) worldEventClockTimer = window.setInterval(renderWorldEventWidget, 1000);
}
window.addEventListener('storage', (event) => {
  if (event.key !== WORLD_EVENT_STORAGE_KEY) return;
  const saved = readStoredWorldEvent();
  if (!saved) return;
  const changed = currentWorldEvent?.id !== saved.id;
  currentWorldEvent = worldEventFromId(saved.id) || currentWorldEvent;
  worldEventDeadline = saved.nextAt;
  renderWorldEventWidget();
  scheduleWorldEventRotation();
  if (changed) {
    if (typeof refreshBattleHealth === 'function') refreshBattleHealth();
    showToastNotification(`Event gewechselt \u00b7 ${currentWorldEvent.rarity}`, worldEventDescription(currentWorldEvent));
  }
});
