// Decorative effects only. Damage, targeting and cooldowns stay in combat.js.
function createBattleSkillEffect(kind, lifetime = 1200) {
  const scene = battleSceneElement();
  if (!battle || !scene?.isConnected) return null;
  const session = battle, wave = battle.wave;
  // Bound simultaneous effects even at very high attack speed.
  const existing = scene.querySelectorAll('.battle-skill-effect');
  if (existing.length >= 12) existing[0].remove();
  const layer = document.createElement('div');
  layer.className = `battle-skill-effect fx-${kind}`;
  layer.setAttribute('aria-hidden', 'true');
  scene.append(layer);
  const context = {
    layer, scene, bounds: scene.getBoundingClientRect(),
    reduced: Boolean(window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches),
    valid: () => battle === session && session.wave === wave && layer.isConnected && battleSceneElement() === scene,
    after(delay, callback) {
      window.setTimeout(() => { if (context.valid()) callback(); }, delay);
    },
  };
  window.setTimeout(() => layer.remove(), lifetime);
  return context;
}
function battleEffectPart(context, kind, point, properties = {}) {
  const part = document.createElement('span');
  part.className = `battle-fx-part ${kind}`;
  if (point) { part.style.left = `${point.x}px`; part.style.top = `${point.y}px`; }
  Object.entries(properties).forEach(([key, value]) => part.style.setProperty(`--${key}`, String(value)));
  context.layer.append(part);
  return part;
}
function battleEffectFlight(context, kind, from, to, duration, delay = 0, scale = 1) {
  return battleEffectPart(context, `battle-fx-flight ${kind}`, from, {
    dx: `${to.x - from.x}px`, dy: `${to.y - from.y}px`,
    angle: `${Math.atan2(to.y - from.y, to.x - from.x) * 180 / Math.PI}deg`,
    flight: `${duration}ms`, delay: `${delay}ms`, 'end-scale': scale,
  });
}
function battleEffectBurst(context, point, kind, count = 7) {
  battleEffectPart(context, `battle-fx-burst ${kind}`, point);
  const particles = context.reduced ? 2 : count;
  for (let i = 0; i < particles; i++) {
    const angle = i / particles * Math.PI * 2;
    battleEffectPart(context, `battle-fx-spark ${kind}`, point, {
      dx: `${Math.cos(angle) * (22 + i % 3 * 12)}px`,
      dy: `${Math.sin(angle) * (22 + i % 3 * 12)}px`,
    });
  }
}
function markEnemySkillTarget(hero, kind, dodged = false) {
  if (!hero?.isConnected) return;
  hero.querySelector('.battle-fx-target')?.remove();
  const mark = document.createElement('span');
  mark.className = `battle-fx-target target-${kind}${dodged ? ' is-dodged' : ''}`;
  mark.setAttribute('aria-hidden', 'true');
  hero.append(mark);
  window.setTimeout(() => mark.remove(), 850);
}
function playEnemySkillEffect(className, enemyIndex, dodged = false) {
  const kind = battle?.mode === 'tower'
    ? battle.towerGuardian ? 'chains' : 'ambush'
    : ({ dornwacht: 'ambush', aschental: 'embers', salzmoor: 'swamp', 'schwarze-kluft': 'rift', glasforst: 'shards', mondbruch: 'moon' })[battle?.areaId];
  if (!kind) return;
  const enemy = document.querySelector(`#battle-overlay .battle-enemy[data-enemy="${enemyIndex}"]`);
  const hero = document.querySelector(`#battle-overlay [data-hero="${className}"]`);
  const context = createBattleSkillEffect(`enemy-${kind}`, 1400);
  if (!context || !enemy) return;
  const sourceToken = Symbol('enemy-skill');
  enemy._battleSkillEffectToken = sourceToken;
  enemy.classList.add(`enemy-skill-${kind}`);
  window.setTimeout(() => {
    if (enemy._battleSkillEffectToken === sourceToken) enemy.classList.remove(`enemy-skill-${kind}`);
  }, 650);
  const from = battleEnemyAimPoint(enemy, context.bounds, .5, .52);
  const camera = { x: context.bounds.width * (dodged ? .82 : .5), y: context.bounds.height * .9 };
  if (dodged) context.layer.classList.add('is-dodged');
  battleEffectPart(context, 'battle-fx-charge', from);
  const count = context.reduced ? 3 : kind === 'embers' || kind === 'shards' ? 12 : 5;
  if (kind === 'embers' || kind === 'shards') {
    for (let i = 0; i < count; i++) {
      const spread = (i / Math.max(1, count - 1) - .5) * Math.min(context.bounds.width * .85, 440);
      battleEffectFlight(context, `enemy-${kind}-particle`, from,
        { x: camera.x + spread, y: camera.y + (i % 3 - 1) * 22 }, 180, 70 + i % 4 * 18, 2.8);
    }
  } else if (kind === 'rift') {
    battleEffectFlight(context, 'enemy-rift-blade', from, camera, 200, 50, 4);
  } else if (kind === 'moon') {
    battleEffectPart(context, 'enemy-moon-collapse', from);
    battleEffectFlight(context, 'enemy-moon-wave', from, camera, 200, 50, 5);
  } else if (kind === 'chains') {
    for (const side of [-1, 1]) {
      const chain = battleEffectPart(context, 'enemy-chain', null, { side, delay: `${side === -1 ? 0 : 35}ms` });
      for (let i = 0; i < 10; i++) {
        const link = document.createElement('i');
        chain.append(link);
      }
    }
  }
  // The visual has a short windup; the existing damage calculation is unchanged.
  context.after(250, () => {
    markEnemySkillTarget(hero, kind, dodged);
    if (kind === 'ambush') {
      for (let i = 0; i < 3; i++) battleEffectPart(context, 'enemy-claw',
        { x: camera.x + (i - 1) * 24, y: camera.y - 20 }, { delay: `${i * 35}ms` });
    } else if (kind === 'swamp') {
      battleEffectPart(context, 'enemy-swamp-haze', camera);
    } else {
      battleEffectPart(context, `enemy-camera-impact impact-${kind}`, camera);
    }
  });
}
function launchFireArrow(targets, duration = 420) {
  const context = createBattleSkillEffect('fire-arrow', duration + 600);
  if (!context) return;
  const from = battleSceneOrigin('hunter', context.bounds);
  targets.forEach(target => {
    const to = battleEnemyAimPoint(target, context.bounds, .5, .54);
    battleEffectFlight(context, 'hero-fire-arrow', from, to, duration);
    context.after(duration, () => battleEffectBurst(context, to, 'fire', 8));
  });
}
function launchFrostWave(targets, duration = 300) {
  const context = createBattleSkillEffect('frost-wave', duration + 650);
  if (!context) return;
  const from = battleSceneOrigin('mage', context.bounds);
  battleEffectPart(context, 'hero-frost-wave', from, { flight: `${duration}ms` });
  targets.forEach(target => {
    const to = battleEnemyAimPoint(target, context.bounds, .5, .54);
    battleEffectFlight(context, 'hero-frost-shard', from, to, duration);
    context.after(duration, () => battleEffectBurst(context, to, 'frost', 6));
  });
}
function launchExecutionCleave(targets, duration = 330) {
  const context = createBattleSkillEffect('execution-cleave', duration + 500);
  if (!context) return;
  targets.forEach(target => {
    const to = battleEnemyAimPoint(target, context.bounds, .5, .54);
    battleEffectPart(context, 'hero-cleave-windup', to);
    context.after(Math.max(0, duration - 100), () => {
      battleEffectPart(context, 'hero-execution-cleave', to);
      battleEffectBurst(context, to, 'steel', 5);
    });
  });
}
function launchSoulHarvest(targets, heals = true) {
  const context = createBattleSkillEffect('soul-harvest', 1100);
  if (!context) return;
  const to = battleSceneOrigin('healer', context.bounds);
  if (!heals) context.layer.classList.add('is-damage-only');
  targets.forEach(target => {
    const from = battleEnemyAimPoint(target, context.bounds, .5, .54);
    battleEffectPart(context, 'hero-soul-seal', from);
    for (let i = 0; i < (context.reduced ? 1 : 3); i++) {
      battleEffectFlight(context, 'hero-soul-wisp', { x: from.x + (i - 1) * 12, y: from.y }, to, 450, 100 + i * 45, .6);
    }
  });
  context.after(520, () => battleEffectPart(context, 'hero-soul-gather', to));
}
