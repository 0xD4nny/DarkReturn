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
  if (visual.status.isConnected) visual.status.innerHTML = visual.statusMarkup;
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
  if (!attempt || attempt.generation !== stateGeneration || currentView !== attempt.view || document.hidden) return;
  if (attempt.view === 'blacksmith' && (attempt.result.kind === 'glyph-fusion' ? selectedForgeMode !== 'glyphs' : selectedForgeMode !== (attempt.result.mythic ? 'mythic' : 'upgrade'))) return;
  const selector = attempt.socketMode ? '.socket-workbench' : attempt.enchantMode ? '.enchant-workbench' : '.forge-workbench:not(.socket-workbench):not(.enchant-workbench)';
  const workbench = document.querySelector(selector);
  const ritual = workbench?.querySelector('.forge-ritual-art');
  const status = workbench?.querySelector('.forge-upgrade-status');
  if (!ritual || !status) return;
  const visual = { workbench, status, statusMarkup: status.innerHTML, animations: [], frame: 0 };
  activeWorkshopVisuals = visual;
  const single = workbench.querySelector('[data-forge], [data-fuse-glyphs], [data-socket], [data-enchant-attempt]');
  const target = workbench.querySelector('[data-forge-target-level], [data-socket-target-count]');
  const auto = workbench.querySelector('[data-forge-auto], [data-socket-auto]');
  if (single) single.disabled = true;
  if (target) target.disabled = true;
  if (auto) auto.disabled = Boolean(activeWorkshopJob?.stopRequested) || !(attempt.socketMode ? autoSocketRunning : autoUpgradeRunning);
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
      visual.animations.forEach(animation => { animation.playbackRate = (12 - 11 * progress) * attempt.speed; });
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
async function playForgeAnimation(result) {
  if (forgeAnimationInProgress || saveMaintenance || saveBlocked) return;
  if (result.kind === 'enchant-affix' && isMobileLayout()) return;
  const generation = stateGeneration;
  const socketMode = result.kind === 'socket';
  const enchantMode = result.kind === 'enchant-rarity' || result.kind === 'enchant-affix';
  const speed = vipWorkshopSpeedMultiplier();
  const duration = 2000 / speed;
  const resultDuration = 300 / speed;
  const attempt = { generation, result, socketMode, enchantMode, speed,
    view: socketMode ? 'sockets' : enchantMode ? 'enchant' : 'blacksmith', headless: Boolean(activeWorkshopJob?.headless), animationDuration: duration - resultDuration };
  activeWorkshopAttempt = attempt;
  forgeAnimationInProgress = true;
  const wait = milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds));
  try {
    for (const outcome of result.outcomes || []) {
      if (generation !== stateGeneration || saveMaintenance || saveBlocked || activeWorkshopAttempt !== attempt) break;
      Object.assign(attempt, { outcome, phase: 'charging', phaseStartedAt: performance.now() });
      syncWorkshopAnimation();
      await wait(attempt.animationDuration);
      if (generation !== stateGeneration || saveMaintenance || saveBlocked || activeWorkshopAttempt !== attempt) break;
      attempt.phase = 'result';
      syncWorkshopAnimation();
      await wait(resultDuration);
    }
  } finally {
    if (activeWorkshopAttempt === attempt) {
      activeWorkshopAttempt = null;
      stopWorkshopVisuals();
    }
    if (generation === stateGeneration) forgeAnimationInProgress = false;
  }
}
document.addEventListener('visibilitychange', syncWorkshopAnimation);
