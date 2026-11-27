// Instant workshop orders: all attempts and results are saved in one transaction.
let workshopTickPending = false;
let workshopStartPending = false;
function validWorkshopJob(job) {
  if (!job || typeof job !== 'object' || !['upgrade', 'socket'].includes(job.kind)
    || typeof job.targetId !== 'string' || !job.targetId || job.targetId.length > 256
    || typeof job.id !== 'string' || !job.id || job.id.length > 256 || typeof job.mythic !== 'boolean'
    || typeof job.headless !== 'boolean') return false;
  const numeric = key => Number.isSafeInteger(job[key]) && job[key] >= 0;
  if (!['startedAt', 'lastAttemptAt', 'nextAttemptAt', 'attempts', 'successes', 'failures', 'worldEventUntil'].every(numeric)
    || job.nextAttemptAt < job.lastAttemptAt || job.lastAttemptAt < job.startedAt || job.worldEventUntil < job.startedAt
    || job.successes + job.failures !== job.attempts
    || (job.maxAttempts !== null && (!Number.isSafeInteger(job.maxAttempts) || job.maxAttempts < 1))) return false;
  const target = job.kind === 'upgrade' ? job.targetLevel : job.targetCount;
  const maximum = job.kind === 'upgrade' ? (job.mythic ? MYTHIC_UPGRADES.maxUpgradeLevel : BALANCE.items.maxUpgradeLevel) : BALANCE.items.socketCounts.equipment;
  return Number.isInteger(target) && target >= 1 && target <= maximum
    && job.worldEvent && Number.isFinite(job.worldEvent.upgradeChancePercent || 0)
    && Array.isArray(job.bonuses) && job.bonuses.length <= 64
    && job.bonuses.every(bonus => ['VIP', 'Upgradechance'].includes(bonus.stat)
      && Number.isSafeInteger(bonus.from) && Number.isSafeInteger(bonus.until) && bonus.from >= 0 && bonus.until > bonus.from);
}
function workshopBonusActive(job, stat, at) {
  return job.bonuses.some(bonus => bonus.stat === stat && bonus.from <= at && bonus.until > at);
}
function captureWorkshopBonuses(save, now = Date.now()) {
  const job = save.workshopJob;
  if (!job) return;
  job.bonuses = job.bonuses.filter(bonus => bonus.until > job.lastAttemptAt);
  const capture = (stat, until) => {
    if (!Number.isSafeInteger(until) || until <= now) return;
    const current = job.bonuses.find(bonus => bonus.stat === stat && bonus.from <= now && bonus.until >= now);
    if (current) current.until = Math.max(current.until, until);
    else job.bonuses.push({ stat, from: now, until });
  };
  capture('VIP', Number(save.vipExpiresAt));
  for (const bonus of save.activePowerups || []) if (bonus.stat === 'Upgradechance') capture(bonus.stat, bonus.expiresAt);
}
function workshopTarget(save, job) {
  return workshopEquipmentItems(save).find(item => item.id === job.targetId);
}
function workshopGoalReached(item, job) {
  return job.kind === 'upgrade' ? (item[job.mythic ? 'mythicUpgradeLevel' : 'upgradeLevel'] || 0) >= job.targetLevel
    : (item.socketSlots || 0) >= Math.min(job.targetCount, socketCapacityForSlot(item.slot, item));
}
function finishWorkshopJob(save, reason, at) {
  const job = save.workshopJob;
  if (!job) return;
  const item = workshopTarget(save, job);
  const progress = job.kind === 'upgrade' ? `+${item?.[job.mythic ? 'mythicUpgradeLevel' : 'upgradeLevel'] || 0} / +${job.targetLevel}`
    : `${item?.socketSlots || 0} / ${job.targetCount} Sockel`;
  save.activityLog ||= [];
  save.activityLog.unshift({ id: createItemId(), at: new Date(at).toISOString(),
    title: job.kind === 'upgrade' ? 'Auto-Aufwertung beendet' : 'Auto-Sockeln beendet',
    detail: `${item?.name || job.itemName || 'Ausrüstung'}: ${progress} · ${job.attempts} Versuche, ${job.successes} Erfolge, ${job.failures} Fehlschläge. ${reason}` });
  save.activityLog = save.activityLog.slice(0, 50);
  save.activityUnread = Math.min(99, (save.activityUnread || 0) + 1);
  save.workshopJob = null;
}
async function settleWorkshopJob(save, now = Date.now()) {
  const job = save.workshopJob;
  if (!job) return;
  // Complete legacy timed orders immediately, using the currently active bonuses.
  job.lastAttemptAt = now;
  job.nextAttemptAt = now;
  captureWorkshopBonuses(save, now);
  let lastResult;
  // Yield between batches for responsiveness, without a gameplay timer between attempts.
  for (let batch = 0; batch < 2000 && save.workshopJob === job; batch++) {
    const item = workshopTarget(save, job);
    if (!item) { finishWorkshopJob(save, 'Das Zielteil ist nicht mehr angelegt.', now); break; }
    if (workshopGoalReached(item, job)) { finishWorkshopJob(save, 'Ziel erreicht.', now); break; }
    if (job.maxAttempts !== null && job.attempts >= job.maxAttempts) { finishWorkshopJob(save, 'Versuch abgeschlossen.', now); break; }
    const stoneSlot = job.kind === 'socket' ? 'socketStone' : job.mythic ? 'mythicUpgradeStone' : 'upgradeStone';
    const stone = save.inventory.find(entry => entry.slot === stoneSlot);
    if (!stone) { finishWorkshopJob(save, 'Material aufgebraucht.', now); break; }
    if (job.nextAttemptAt > now) break;
    const at = job.nextAttemptAt;
    const attemptStartedAt = job.lastAttemptAt;
    while (job.worldEventUntil <= attemptStartedAt) { job.worldEvent = chooseWorldEvent(); job.worldEventUntil += WORLD_EVENT_INTERVAL_MS; }
    const previousContext = save.offlineContext;
    const previousPowerups = save.activePowerups;
    const previousVip = save.vipExpiresAt;
    let result;
    try {
      save.offlineContext = { now: attemptStartedAt, worldEvent: job.worldEvent };
      save.activePowerups = workshopBonusActive(job, 'Upgradechance', attemptStartedAt) ? [{ stat: 'Upgradechance', expiresAt: attemptStartedAt + 1 }] : [];
      save.vipExpiresAt = workshopBonusActive(job, 'VIP', attemptStartedAt) ? attemptStartedAt + 1 : 0;
      result = applyWorkshopAttempt(save, { action: job.kind === 'upgrade' ? 'upgrade' : 'socket-slot', itemId: job.targetId, stoneId: stone.id, mythic: job.mythic });
      lastResult = result;
    } finally {
      if (previousContext) save.offlineContext = previousContext;
      else delete save.offlineContext;
      save.activePowerups = previousPowerups;
      save.vipExpiresAt = previousVip;
    }
    job.attempts += result.attempts;
    job.successes += result.successes;
    job.failures += result.failures;
    job.lastAttemptAt = at;
    job.nextAttemptAt = at;
    if (workshopGoalReached(item, job)) finishWorkshopJob(save, 'Ziel erreicht.', now);
    else if (job.maxAttempts !== null && job.attempts >= job.maxAttempts) finishWorkshopJob(save, 'Versuch abgeschlossen.', now);
    if (batch % 100 === 99) await new Promise(resolve => window.setTimeout(resolve, 0));
  }
  captureWorkshopBonuses(save, now);
  return lastResult;
}
async function settleWorkshopThrough(save, at) {
  let result;
  do { result = await settleWorkshopJob(save, at) || result; }
  while (save.workshopJob && save.workshopJob.nextAttemptAt <= at);
  return result;
}
function createWorkshopJob(save, body, now = Date.now()) {
  if (save.workshopJob || forgeAnimationInProgress || glyphFusionPending) throw new Error('Die Werkstatt ist bereits beschäftigt.');
  const item = requireWorkshopItem(save, body.itemId);
  if (!['upgrade', 'socket'].includes(body.kind)) throw new Error('Unbekannter Werkstattauftrag.');
  const mythic = body.mythic === true;
  if (mythic && !isMythicEquipment(item)) throw new Error('Wähle mystische Ausrüstung.');
  const goal = Number(body.kind === 'upgrade' ? body.targetLevel : body.targetCount);
  const maximum = body.kind === 'upgrade' ? (mythic ? MYTHIC_UPGRADES.maxUpgradeLevel : BALANCE.items.maxUpgradeLevel) : socketCapacityForSlot(item.slot, item);
  if (!Number.isInteger(goal) || goal < 1 || goal > maximum || (body.kind === 'upgrade' && !AFFIX_POOLS[item.slot] && item.slot !== 'glyph')) throw new Error('Ungültiges Werkstattziel.');
  const stoneSlot = body.kind === 'socket' ? 'socketStone' : mythic ? 'mythicUpgradeStone' : 'upgradeStone';
  if (!save.inventory.some(entry => entry.slot === stoneSlot)) throw new Error('Das benötigte Material fehlt.');
  const job = { id: createItemId(), kind: body.kind, targetId: item.id, itemName: item.name, mythic,
    view: body.kind === 'upgrade' ? 'blacksmith' : 'sockets', targetLevel: body.kind === 'upgrade' ? goal : null,
    targetCount: body.kind === 'socket' ? goal : null, maxAttempts: body.single === true ? 1 : null,
    headless: body.headless === true, stopRequested: false, startedAt: now, lastAttemptAt: now, nextAttemptAt: now,
    attempts: 0, successes: 0, failures: 0, bonuses: [], worldEvent: cloneState(getWorldEvent()),
    worldEventUntil: Math.max(now + 1, worldEventDeadline || now + WORLD_EVENT_INTERVAL_MS) };
  if (workshopGoalReached(item, job)) throw new Error('Das Ziel ist bereits erreicht.');
  save.workshopJob = job;
  captureWorkshopBonuses(save, now);
  job.nextAttemptAt = now;
}
function syncWorkshopRuntime() {
  activeWorkshopJob = state?.workshopJob ? { ...state.workshopJob, view: state.workshopJob.kind === 'upgrade' ? 'blacksmith' : 'sockets' } : null;
  autoUpgradeRunning = activeWorkshopJob?.kind === 'upgrade';
  autoSocketRunning = activeWorkshopJob?.kind === 'socket';
}
function syncPersistedWorkshopVisuals() {
  const job = activeWorkshopJob;
  if (!job || job.headless || document.hidden || isMobileLayout() || job.view !== currentView || !workshopAnimationsEnabled(job.view)) return;
  const workbench = viewContainer.querySelector(job.kind === 'socket' ? '.socket-workbench' : '.forge-workbench');
  const status = workbench?.querySelector('.forge-upgrade-status');
  if (!workbench || !status) return;
  activeWorkshopVisuals = { workbench, status, restoreStatus: false, statusMarkup: status.innerHTML, animations: [], frame: 0 };
  workbench.classList.add('is-forging');
}
async function startPersistedWorkshopJob(options) {
  if (workshopStartPending || saveMaintenance || saveBlocked) return;
  workshopStartPending = true;
  try { return await performAction({ action: 'workshop-start', ...options, silent: true }, null, null, { background: true }); }
  finally { workshopStartPending = false; }
}
async function tickPersistedWorkshop() {
  if (workshopTickPending || !state?.workshopJob || document.hidden || saveMaintenance || saveBlocked) return;
  workshopTickPending = true;
  try { await performAction({ action: 'workshop-tick', silent: true }, null, null, { background: true }); }
  finally { workshopTickPending = false; }
}
window.setInterval(() => {
  if (offlineFarmSettling || document.hidden) return;
  void offlineFarmTransition.then(tickPersistedWorkshop).catch(() => {});
}, 500);
document.addEventListener('visibilitychange', () => {
  if (!document.hidden) void offlineFarmTransition.then(tickPersistedWorkshop).catch(() => {});
});
window.addEventListener('pageshow', event => {
  if (event.persisted && !document.hidden) void offlineFarmTransition.then(tickPersistedWorkshop).catch(() => {});
});
