// Attempt timing is independent from the currently mounted page and its animation.
const WORKSHOP_MOTION_SETTINGS = { blacksmith: 'forgeAnimations', sockets: 'socketAnimations', enchant: 'enchantAnimations' };
let activeWorkshopAttempt = null;
let activeWorkshopVisuals = null;

function workshopAnimationsEnabled(view) {
  return state?.settings?.[WORKSHOP_MOTION_SETTINGS[view]] !== false;
}
function workshopMotionClass(view) {
  return workshopAnimationsEnabled(view) ? '' : 'workshop-motion-disabled';
}
function stopWorkshopVisuals() {
  const visual = activeWorkshopVisuals;
  activeWorkshopVisuals = null;
  if (!visual) return;
  cancelAnimationFrame(visual.frame);
  visual.animations.forEach(animation => {
    if (visual.workbench.isConnected) animation.playbackRate = 1;
    else animation.cancel();
  });
  visual.workbench.classList.remove('is-forging', 'forge-success', 'forge-failure');
  visual.status.classList.remove('is-success', 'is-failure');
  if (visual.status.isConnected && visual.restoreStatus !== false) visual.status.innerHTML = visual.statusMarkup;
}
function cancelWorkshopAnimation() {
  activeWorkshopAttempt = null;
  stopWorkshopVisuals();
  forgeAnimationInProgress = false;
}
function syncWorkshopAnimation() {
  stopWorkshopVisuals();
  const attempt = activeWorkshopAttempt;
  if (attempt?.headless || (typeof isMobileLayout === 'function' && isMobileLayout())) return;
  if (!attempt) { syncPersistedWorkshopVisuals(); return; }
  if (attempt.generation !== stateGeneration || currentView !== attempt.view || document.hidden) return;
  if (attempt.view === 'blacksmith' && (attempt.result.kind === 'glyph-fusion' ? selectedForgeMode !== 'glyphs' : selectedForgeMode !== (attempt.result.mythic ? 'mythic' : 'upgrade'))) return;
  const selector = attempt.socketMode ? '.socket-workbench' : attempt.enchantMode ? '.enchant-workbench' : '.forge-workbench:not(.socket-workbench):not(.enchant-workbench)';
  const workbench = document.querySelector(selector);
  const ritual = workbench?.querySelector('.forge-ritual-art');
  const status = workbench?.querySelector('.forge-upgrade-status');
  if (!ritual || !status) return;
  const visual = { workbench, status, statusMarkup: status.innerHTML, animations: [], frame: 0 };
  activeWorkshopVisuals = visual;
  const { result, outcome, socketMode, enchantMode } = attempt;
  const enabled = workshopAnimationsEnabled(attempt.view);
  if (attempt.phase === 'charging') {
    if (enabled) workbench.classList.add('is-forging');
    status.querySelector('span').textContent = result.kind === 'glyph-fusion' ? 'Drei Glyphen werden neu geschmiedet' : enchantMode
      ? result.greaterUpgrade ? `${result.affix.stat} wird zum Greater Affix` : result.kind === 'enchant-rarity' ? `${result.previousRarity} wird zu ${result.item.rarity}` : `${result.previousStat} wird neu geprägt`
      : socketMode ? `Sockel ${outcome.level + 1} / ${outcome.capacity}` : `Aufwertung auf +${outcome.level + 1}`;
    status.querySelector('strong').textContent = 'VERSUCH LÄUFT';
    if (!enabled) return;
    visual.animations = ritual.getAnimations({ subtree: true });
    const frame = now => {
      if (activeWorkshopVisuals !== visual) return;
      if (!workbench.isConnected || document.hidden || currentView !== attempt.view) { stopWorkshopVisuals(); return; }
      const progress = Math.min(1, (now - attempt.phaseStartedAt) / attempt.animationDuration);
      visual.animations.forEach(animation => { animation.playbackRate = 12 - 11 * progress; });
      if (progress < 1) visual.frame = requestAnimationFrame(frame);
    };
    visual.frame = requestAnimationFrame(frame);
  } else {
    if (enabled) {
      workbench.classList.add(outcome.success ? 'forge-success' : 'forge-failure');
      status.classList.add(outcome.success ? 'is-success' : 'is-failure');
    }
    status.querySelector('span').textContent = result.kind === 'glyph-fusion' ? result.item.name : outcome.success
      ? enchantMode ? result.greaterUpgrade ? `Greater Affix: ${result.affix.stat}` : result.kind === 'enchant-rarity' ? `${result.item.name} ist jetzt ${result.item.rarity}.` : `${result.previousStat} wurde zu ${result.affix.stat}.`
        : socketMode ? `${outcome.resultingLevel} Sockel geöffnet` : `Aufwertung +${outcome.resultingLevel}`
      : socketMode ? 'Sockel bleibt geschlossen' : `Aufwertung bleibt +${outcome.level}`;
    status.querySelector('strong').textContent = outcome.success ? 'GELUNGEN' : 'FEHLGESCHLAGEN';
  }
}
// Visual feedback never delays the saved result or the next action.
function playForgeAnimation(result) {
  cancelWorkshopAnimation();
  if (saveMaintenance || saveBlocked || result.headless || isMobileLayout()) return;
  const socketMode = result.kind === 'socket';
  const enchantMode = result.kind === 'enchant-rarity' || result.kind === 'enchant-affix';
  const view = socketMode ? 'sockets' : enchantMode ? 'enchant' : 'blacksmith';
  if (!workshopAnimationsEnabled(view)) return;
  const outcome = result.outcomes?.at(-1);
  if (!outcome) return;
  const attempt = { generation: stateGeneration, result, outcome, socketMode, enchantMode,
    view, animationDuration: 160, phase: 'charging', phaseStartedAt: performance.now() };
  activeWorkshopAttempt = attempt;
  syncWorkshopAnimation();
  window.setTimeout(() => {
    if (activeWorkshopAttempt !== attempt || attempt.generation !== stateGeneration) return;
    attempt.phase = 'result';
    syncWorkshopAnimation();
  }, 160);
  window.setTimeout(() => {
    if (activeWorkshopAttempt !== attempt) return;
    activeWorkshopAttempt = null;
    stopWorkshopVisuals();
  }, 480);
}

document.addEventListener('visibilitychange', syncWorkshopAnimation);
