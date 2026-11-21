const BATTLE_SPRITE_POSES = {
  warrior: ['idle', 'run', 'windup', 'strike', 'hit', 'defeated'],
  healer: ['idle', 'run', 'attack', 'heal', 'hit', 'defeated'],
  hunter: ['idle', 'run', 'attack', 'hit', 'defeated'],
  mage: ['idle', 'run', 'attack', 'hit', 'defeated'],
  'ashen-stray': ['idle', 'run', 'attack', 'hit', 'frozen', 'defeated'],
  'ashen-brood': ['idle', 'run', 'attack', 'hit', 'frozen', 'defeated'],
  'mire-guardian': ['idle', 'run', 'attack', 'hit', 'frozen', 'defeated'],
  'rift-stalker': ['idle', 'run', 'attack', 'hit', 'frozen', 'defeated'],
  shardwing: ['idle', 'flap', 'run', 'attack', 'hit', 'frozen', 'defeated'],
  moonfallen: ['idle', 'run', 'attack', 'hit', 'frozen', 'defeated'],
  'chain-archon': ['idle', 'run', 'attack', 'hit', 'frozen', 'defeated'],
  'nameless-guardian': ['idle', 'attack', 'hit', 'frozen', 'defeated'],
  'shadow-of-darkness-front': ['idle', 'hit'],
};

function battleSpriteUrl(actor, pose, element = null) {
  if (!BATTLE_SPRITE_POSES[actor]?.includes(pose)) return null;
  if (actor === 'nameless-guardian') {
    const enemy = element?.closest('.battle-enemy');
    const variant = enemy?.classList.contains('is-frozen')
      ? '-frozen'
      : enemy?.classList.contains('is-burning')
        ? '-burning'
        : enemy?.classList.contains('is-poisoned') ? '-poison' : '';
    return new URL(`Assets/Art/battle/runtime/nameless-guardian/nameless-guardian${variant}.png`, document.baseURI).href;
  }
  if (actor === 'shadow-of-darkness-front') {
    const enemy = element?.closest('.battle-enemy');
    const variant = enemy?.classList.contains('is-burning')
      ? '-burning'
      : enemy?.classList.contains('is-poisoned') ? '-poison' : '';
    return new URL(`Assets/Art/battle/runtime/shadow-of-darkness/shadow-of-darkness-front${variant}.png`, document.baseURI).href;
  }
  if (['ashen-stray', 'ashen-brood', 'mire-guardian', 'rift-stalker', 'shardwing', 'moonfallen', 'chain-archon'].includes(actor)) {
    const enemy = element?.closest('.battle-enemy');
    const poisoned = enemy?.classList.contains('is-poisoned');
    const burning = enemy?.classList.contains('is-burning');
    const burningPoseFiles = { idle: 'burning-idle', flap: 'burning-flap', attack: 'burning-bite', hit: 'burning-hit' };
    const poisonPoseFiles = { idle: 'poison-idle', flap: 'poison-flap', attack: 'poison-bite', hit: 'poison-hit' };
    const frontPoseFiles = { attack: 'bite' };
    const filePose = poisoned && poisonPoseFiles[pose]
      ? poisonPoseFiles[pose]
      : burning && burningPoseFiles[pose]
      ? burningPoseFiles[pose]
      : frontPoseFiles[pose] || (pose === 'run' ? 'idle' : pose);
    return new URL(`Assets/Art/battle/runtime/${actor}-front/${actor}-front-${filePose}.png`, document.baseURI).href;
  }
  const warriorPoseFiles = { windup: 'windup-overhead', strike: 'strike-downward' };
  const healerPoseFiles = { attack: 'bell-windup', heal: 'heal-clean' };
  const hunterPoseFiles = { attack: 'aim' };
  const magePoseFiles = { attack: 'cast' };
  const poseFiles = actor === 'warrior' ? warriorPoseFiles
    : actor === 'healer' ? healerPoseFiles
        : actor === 'hunter' ? hunterPoseFiles
          : actor === 'mage' ? magePoseFiles : {};
  const filePose = poseFiles[pose] || pose;
  return new URL(`Assets/Art/battle/runtime/${actor}/${actor}-${filePose}.png`, document.baseURI).href;
}

function setBattleSpriteFrame(element, actor, frame) {
  const source = new URL(`Assets/Art/battle/runtime/${actor}/${actor}-${frame}.png`, document.baseURI).href;
  if (element.getAttribute('src') !== source) element.setAttribute('src', source);
}

function preloadFrontEnemyFrames(actor = 'ashen-stray') {
  const poses = ['idle', 'bite', 'hit', 'frozen', 'defeated', 'burning-idle', 'burning-bite', 'burning-hit', 'poison-idle', 'poison-bite', 'poison-hit'];
  if (actor === 'shardwing') poses.push('flap', 'burning-flap', 'poison-flap');
  poses.forEach((pose) => {
    const image = new Image();
    image.src = new URL(`Assets/Art/battle/runtime/${actor}-front/${actor}-front-${pose}.png`, document.baseURI).href;
  });
}

function preloadIceProjectile() {
  const image = new Image();
  image.src = new URL('Assets/Art/battle/runtime/effects/ice-projectile.png', document.baseURI).href;
}

let magicProjectilePreloaded = false;
function preloadMagicProjectile() {
  if (magicProjectilePreloaded) return;
  magicProjectilePreloaded = true;
  const image = new Image();
  image.src = new URL('Assets/Art/battle/runtime/effects/magic-bolt-v1.png', document.baseURI).href;
}

function preloadNamelessGuardianFrames() {
  ['', '-poison', '-burning', '-frozen'].forEach((variant) => {
    const image = new Image();
    image.src = new URL(`Assets/Art/battle/runtime/nameless-guardian/nameless-guardian${variant}.png`, document.baseURI).href;
  });
}

function preloadWarriorFrames() {
  ['run-2', 'run-3', 'hit-2', 'hit-3', 'windup-overhead', 'strike-downward', 'strike-followthrough'].forEach((frame) => {
    const image = new Image();
    image.src = new URL(`Assets/Art/battle/runtime/warrior/warrior-${frame}.png`, document.baseURI).href;
  });
}

function preloadHealerFrames() {
  ['run-2', 'run-3', 'bell-windup', 'bell-strike', 'heal-clean', 'hit-2', 'hit-3'].forEach((frame) => {
    const image = new Image();
    image.src = new URL(`Assets/Art/battle/runtime/healer/healer-${frame}.png`, document.baseURI).href;
  });
}

function preloadHunterFrames() {
  ['run-2', 'run-3', 'nock', 'bow-draw', 'arrow-release', 'followthrough', 'hit-2', 'hit-3'].forEach((frame) => {
    const image = new Image();
    image.src = new URL(`Assets/Art/battle/runtime/hunter/hunter-${frame}.png`, document.baseURI).href;
  });
}

function preloadMageFrames() {
  ['run-2', 'run-3', 'gather', 'channel', 'release', 'followthrough', 'hit-2', 'hit-3'].forEach((frame) => {
    const image = new Image();
    image.src = new URL(`Assets/Art/battle/runtime/mage/mage-${frame}.png`, document.baseURI).href;
  });
}

function battleSpriteMarkup(actor, pose = 'idle', className = '') {
  const source = battleSpriteUrl(actor, pose);
  if (!source) return '';
  if (actor === 'nameless-guardian') {
    return `<div class="battle-actor-sprite ${actor} ${className}" data-battle-sprite="${actor}" data-pose="${pose}" style="background-image:url('${source}')" aria-hidden="true"></div>`;
  }
  const gravity = actor === 'moonfallen' ? '<span class="moonfallen-orbit" aria-hidden="true"></span>' : '';
  return `${gravity}<img class="battle-actor-sprite ${actor} ${className}" data-battle-sprite="${actor}" data-pose="${pose}" src="${source}" alt="" draggable="false">`;
}

function setBattleSpritePose(element, actor, pose, resetAfter = 0) {
  if (!element) return;
  const source = battleSpriteUrl(actor, pose, element);
  if (!source) return;
  window.clearInterval(element._battleFrameInterval);
  element._battleFrameInterval = null;
  const poseToken = (element._battlePoseToken || 0) + 1;
  element._battlePoseToken = poseToken;
  element.dataset.pose = pose;
  if (actor === 'nameless-guardian') {
    element.style.backgroundImage = `url("${source}")`;
    if (resetAfter > 0 && ['attack', 'hit'].includes(pose)) {
      window.setTimeout(() => {
        if (element.isConnected && element._battlePoseToken === poseToken) {
          const enemyIndex = Number(element.closest('.battle-enemy')?.dataset.enemy);
          const enemyDead = battle && (battle.displayEnemyHealths?.[enemyIndex]?.hp ?? battle.enemyHp) <= 0;
          const enemyFrozen = (battle?.enemyFrozenUntil?.[enemyIndex] || 0) > performance.now();
          setBattleSpritePose(element, actor, enemyDead ? 'defeated' : enemyFrozen ? 'frozen' : 'idle');
        }
      }, resetAfter);
    }
    return;
  }
  if (element.getAttribute('src') !== source) element.setAttribute('src', source);
  if (actor === 'shadow-of-darkness-front') {
    element.classList.toggle('is-boss-hit', pose === 'hit');
    if (pose === 'hit') {
      window.setTimeout(() => {
        if (element.isConnected && element._battlePoseToken === poseToken) setBattleSpritePose(element, actor, 'idle');
      }, resetAfter || 420);
    }
    return;
  }
  if (actor === 'shardwing' && ['idle', 'run'].includes(pose) && !window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches) {
    let flap = Number(element.closest('.battle-enemy')?.dataset.enemy || 0) % 2 === 1;
    const flightInterval = window.setInterval(() => {
      if (!element.isConnected || element._battlePoseToken !== poseToken) {
        window.clearInterval(flightInterval);
        if (element._battleFrameInterval === flightInterval) element._battleFrameInterval = null;
        return;
      }
      const enemyIndex = Number(element.closest('.battle-enemy')?.dataset.enemy);
      const dead = battle && (battle.displayEnemyHealths?.[enemyIndex]?.hp ?? battle.enemyHp) <= 0;
      const frozen = (battle?.enemyFrozenUntil?.[enemyIndex] || 0) > performance.now();
      if (dead || frozen) {
        setBattleSpritePose(element, actor, dead ? 'defeated' : 'frozen');
        return;
      }
      flap = !flap;
      const frameSource = battleSpriteUrl(actor, flap ? 'flap' : 'idle', element);
      if (element.getAttribute('src') !== frameSource) element.setAttribute('src', frameSource);
    }, 280);
    element._battleFrameInterval = flightInterval;
  } else if (actor === 'warrior' && pose === 'run') {
    const frames = ['run-2', 'run-3', 'run-2'];
    let frameIndex = 0;
    element._battleFrameInterval = window.setInterval(() => {
      if (!element.isConnected || element._battlePoseToken !== poseToken) {
        window.clearInterval(element._battleFrameInterval);
        element._battleFrameInterval = null;
        return;
      }
      setBattleSpriteFrame(element, actor, frames[frameIndex]);
      frameIndex = (frameIndex + 1) % frames.length;
    }, 125);
  } else if (actor === 'warrior' && pose === 'hit') {
    window.setTimeout(() => {
      if (element.isConnected && element._battlePoseToken === poseToken) setBattleSpriteFrame(element, actor, 'hit-2');
    }, 90);
    window.setTimeout(() => {
      if (element.isConnected && element._battlePoseToken === poseToken) setBattleSpriteFrame(element, actor, 'hit-3');
    }, 190);
  } else if (actor === 'warrior' && pose === 'strike') {
    window.setTimeout(() => {
      if (element.isConnected && element._battlePoseToken === poseToken) setBattleSpriteFrame(element, actor, 'strike-followthrough');
    }, 155);
  } else if (actor === 'healer' && pose === 'run') {
    const frames = ['run-2', 'run-3', 'run-2'];
    let frameIndex = 0;
    element._battleFrameInterval = window.setInterval(() => {
      if (!element.isConnected || element._battlePoseToken !== poseToken) {
        window.clearInterval(element._battleFrameInterval);
        element._battleFrameInterval = null;
        return;
      }
      setBattleSpriteFrame(element, actor, frames[frameIndex]);
      frameIndex = (frameIndex + 1) % frames.length;
    }, 135);
  } else if (actor === 'healer' && pose === 'attack') {
    window.setTimeout(() => {
      if (element.isConnected && element._battlePoseToken === poseToken) setBattleSpriteFrame(element, actor, 'bell-strike');
    }, 145);
  } else if (actor === 'healer' && pose === 'hit') {
    window.setTimeout(() => {
      if (element.isConnected && element._battlePoseToken === poseToken) setBattleSpriteFrame(element, actor, 'hit-2');
    }, 100);
    window.setTimeout(() => {
      if (element.isConnected && element._battlePoseToken === poseToken) setBattleSpriteFrame(element, actor, 'hit-3');
    }, 210);
  } else if (actor === 'hunter' && pose === 'run') {
    const frames = ['run-2', 'run-3', 'run-2'];
    let frameIndex = 0;
    element._battleFrameInterval = window.setInterval(() => {
      if (!element.isConnected || element._battlePoseToken !== poseToken) {
        window.clearInterval(element._battleFrameInterval);
        element._battleFrameInterval = null;
        return;
      }
      setBattleSpriteFrame(element, actor, frames[frameIndex]);
      frameIndex = (frameIndex + 1) % frames.length;
    }, 130);
  } else if (actor === 'hunter' && pose === 'attack') {
    [
      ['nock', 45],
      ['bow-draw', 100],
      ['arrow-release', 175],
      ['followthrough', 235],
    ].forEach(([frame, delay]) => {
      window.setTimeout(() => {
        if (element.isConnected && element._battlePoseToken === poseToken) setBattleSpriteFrame(element, actor, frame);
      }, delay);
    });
  } else if (actor === 'hunter' && pose === 'hit') {
    window.setTimeout(() => {
      if (element.isConnected && element._battlePoseToken === poseToken) setBattleSpriteFrame(element, actor, 'hit-2');
    }, 95);
    window.setTimeout(() => {
      if (element.isConnected && element._battlePoseToken === poseToken) setBattleSpriteFrame(element, actor, 'hit-3');
    }, 205);
  } else if (actor === 'mage' && pose === 'run') {
    const frames = ['run-2', 'run-3', 'run-2'];
    let frameIndex = 0;
    element._battleFrameInterval = window.setInterval(() => {
      if (!element.isConnected || element._battlePoseToken !== poseToken) {
        window.clearInterval(element._battleFrameInterval);
        element._battleFrameInterval = null;
        return;
      }
      setBattleSpriteFrame(element, actor, frames[frameIndex]);
      frameIndex = (frameIndex + 1) % frames.length;
    }, 130);
  } else if (actor === 'mage' && pose === 'attack') {
    [
      ['gather', 45],
      ['channel', 100],
      ['release', 175],
      ['followthrough', 235],
    ].forEach(([frame, delay]) => {
      window.setTimeout(() => {
        if (element.isConnected && element._battlePoseToken === poseToken) setBattleSpriteFrame(element, actor, frame);
      }, delay);
    });
  } else if (actor === 'mage' && pose === 'hit') {
    window.setTimeout(() => {
      if (element.isConnected && element._battlePoseToken === poseToken) setBattleSpriteFrame(element, actor, 'hit-2');
    }, 95);
    window.setTimeout(() => {
      if (element.isConnected && element._battlePoseToken === poseToken) setBattleSpriteFrame(element, actor, 'hit-3');
    }, 205);
  }
  if (resetAfter > 0) {
    window.setTimeout(() => {
      if (element.isConnected && element._battlePoseToken === poseToken) {
        const enemyIndex = Number(element.closest('.battle-enemy')?.dataset.enemy);
        const enemyDead = ['ashen-stray', 'ashen-brood', 'mire-guardian', 'rift-stalker', 'shardwing', 'moonfallen', 'chain-archon', 'nameless-guardian'].includes(actor) && battle && (battle.displayEnemyHealths?.[enemyIndex]?.hp ?? battle.enemyHp) <= 0;
        const enemyFrozen = ['ashen-stray', 'ashen-brood', 'mire-guardian', 'rift-stalker', 'shardwing', 'moonfallen', 'chain-archon', 'nameless-guardian'].includes(actor) && (battle?.enemyFrozenUntil?.[enemyIndex] || 0) > performance.now();
        const nextPose = enemyDead ? 'defeated' : enemyFrozen ? 'frozen' : 'idle';
        setBattleSpritePose(element, actor, nextPose);
      }
    }, resetAfter);
  }
}

function setHeroBattlePose(className, pose, resetAfter = 0) {
  const element = document.querySelector(`[data-hero="${className}"] [data-battle-sprite]`);
  setBattleSpritePose(element, className, pose, resetAfter);
}

function setEnemyBattlePose(pose, resetAfter = 0) {
  if (battle && battle.mode !== 'boss' && battle.enemyHp <= 0 && pose !== 'defeated') return;
  document.querySelectorAll('.battle-enemy [data-battle-sprite]').forEach((element) => {
    setBattleSpritePose(element, battleEnemySpriteActor(), pose, resetAfter);
  });
}

function battleSceneElement() {
  return document.querySelector('#battle-overlay .battle-scene');
}

function closestBattleEnemy(actor) {
  const [index] = chooseBattleEnemyIndexes(actor?.dataset.hero || activeBattleClasses()[0]);
  return index == null ? null : document.querySelector(`#battle-overlay .battle-enemy[data-enemy="${index}"]`);
}

function battleSceneOrigin(className, sceneBounds, actor) {
  // Projectiles always start at the center of the lower scene edge.
  return { x: sceneBounds.width * 0.5, y: sceneBounds.height * 0.92 };
}

function battleEnemyAimPoint(target, sceneBounds, horizontal = 0.5, vertical = 0.56) {
  const bounds = target.getBoundingClientRect();
  return {
    x: bounds.left + bounds.width * horizontal - sceneBounds.left,
    y: bounds.top + bounds.height * vertical - sceneBounds.top,
  };
}

function launchMagicProjectile(scene, className, origin, aim, impactDelay, variant = 'basic') {
  const current = battle;
  const wave = current?.wave;
  const isSkill = variant === 'ice' || variant === 'fire';
  const projectileSize = isSkill ? 160 : 96;
  const impactSize = isSkill ? 208 : 128;
  const effectClass = `magic-${className}${isSkill ? ` magic-${variant}` : ''}`;
  const projectile = document.createElement('span');
  projectile.className = `battle-magic-projectile ${effectClass}`;
  projectile.setAttribute('aria-hidden', 'true');
  projectile.style.width = `${projectileSize}px`;
  projectile.style.height = `${projectileSize}px`;
  // The generated flight frame has its luminous head at 68% of the cell width.
  projectile.style.left = `${origin.x - projectileSize * .68}px`;
  projectile.style.top = `${origin.y - projectileSize / 2}px`;
  projectile.innerHTML = '<span class="battle-magic-sprite"></span>';
  scene.append(projectile);
  const angle = Math.atan2(aim.y - origin.y, aim.x - origin.x) * 180 / Math.PI;
  const flight = projectile.animate([
    { translate: '0 0', rotate: `${angle}deg`, scale: .8, opacity: 0 },
    { translate: `${(aim.x - origin.x) * .12}px ${(aim.y - origin.y) * .12}px`, rotate: `${angle}deg`, scale: 1, opacity: 1, offset: .12 },
    { translate: `${aim.x - origin.x}px ${aim.y - origin.y}px`, rotate: `${angle}deg`, scale: 1, opacity: 1 },
  ], { duration: impactDelay, easing: 'linear', fill: 'forwards' });
  flight.onfinish = () => {
    projectile.remove();
    if (!current || battle !== current || current.wave !== wave || !scene.isConnected) return;
    const impact = document.createElement('span');
    impact.className = `battle-magic-impact ${effectClass}`;
    impact.setAttribute('aria-hidden', 'true');
    impact.style.width = `${impactSize}px`;
    impact.style.height = `${impactSize}px`;
    impact.style.left = `${aim.x - impactSize / 2}px`;
    impact.style.top = `${aim.y - impactSize / 2}px`;
    impact.innerHTML = '<span class="battle-magic-sprite"></span>';
    scene.append(impact);
    impact.animate([
      { opacity: 1, scale: .85 },
      { opacity: 1, scale: 1, offset: .65 },
      { opacity: 0, scale: 1.12 },
    ], { duration: 360, easing: 'linear', fill: 'forwards' }).onfinish = () => impact.remove();
  };
}

function launchBattleProjectile(className, actor, target, impactDelay, projectileType = 'basic') {
  const scene = battleSceneElement();
  if (!scene || (!actor && projectileType !== 'stones') || !target) return;
  const sceneBounds = scene.getBoundingClientRect();
  const origin = projectileType === 'stones'
    ? { x: sceneBounds.width * 0.5, y: sceneBounds.height * 0.94 }
    : battleSceneOrigin(className, sceneBounds, actor);
  const aim = battleEnemyAimPoint(target, sceneBounds, 0.5, 0.54);
  if (projectileType === 'basic' && ['mage', 'healer'].includes(className)) {
    launchMagicProjectile(scene, className, origin, aim, impactDelay);
    return;
  }
  if (className === 'mage' && ['ice', 'fire'].includes(projectileType)) {
    launchMagicProjectile(scene, className, origin, aim, impactDelay, projectileType);
    return;
  }
  const { x: startX, y: startY } = origin;
  const { x: endX, y: endY } = aim;
  const isImageProjectile = projectileType === 'ice' || projectileType === 'poison-arrow' || projectileType === 'stones';
  const projectile = document.createElement(isImageProjectile ? 'img' : 'span');
  projectile.className = projectileType === 'ice'
    ? 'battle-ice-projectile'
    : projectileType === 'poison-arrow'
      ? 'battle-poison-arrow-projectile'
      : projectileType === 'stones'
        ? 'battle-stone-projectile'
      : `battle-projectile projectile-${className}`;
  projectile.setAttribute('aria-hidden', 'true');
  if (projectileType === 'ice') {
    projectile.src = new URL('Assets/Art/battle/runtime/effects/ice-projectile.png', document.baseURI).href;
    projectile.alt = '';
    projectile.style.left = `${startX - 38}px`;
    projectile.style.top = `${startY - 18}px`;
  } else if (projectileType === 'poison-arrow') {
    projectile.src = new URL('Assets/Art/battle/runtime/effects/poison-arrow.png', document.baseURI).href;
    projectile.alt = '';
    projectile.style.left = `${startX - 34}px`;
    projectile.style.top = `${startY - 14}px`;
  } else if (projectileType === 'stones') {
    projectile.src = new URL('Assets/Art/battle/runtime/effects/stomp-stones.png', document.baseURI).href;
    projectile.alt = '';
    projectile.style.left = `${startX - 104}px`;
    projectile.style.top = `${startY - 188}px`;
  }
  else if (className === 'hunter') {
    projectile.innerHTML = '<svg class="arrow-projectile-art" viewBox="0 0 48 12" focusable="false"><path class="arrow-shadow" d="M6 6h32"/><path class="arrow-shaft" d="M6 6h32"/><path class="arrow-fletching" d="M9 6 1 1.5M9 6 1 10.5M13 6 7 2.5M13 6 7 9.5"/><path class="arrow-head" d="m35 1 12 5-12 5 3-5z"/></svg>';
    projectile.style.left = `${startX - 24}px`;
    projectile.style.top = `${startY - 6}px`;
  } else {
    projectile.style.left = `${startX - 5.5}px`;
    projectile.style.top = `${startY - 5.5}px`;
  }
  scene.append(projectile);
  if (projectileType === 'ice') {
    const angle = Math.atan2(endY - startY, endX - startX) * 180 / Math.PI;
    projectile.animate([
      { translate: '0 0', scale: '.52', opacity: 0, rotate: `${angle}deg` },
      { translate: `${(endX - startX) * .18}px ${(endY - startY) * .18}px`, scale: '.9', opacity: 1, rotate: `${angle}deg`, offset: .18 },
      { translate: `${endX - startX}px ${endY - startY}px`, scale: '1.06', opacity: 1, rotate: `${angle}deg`, offset: .88 },
      { translate: `${endX - startX}px ${endY - startY}px`, scale: '1.3', opacity: 0, rotate: `${angle}deg` },
    ], { duration: impactDelay, easing: 'cubic-bezier(.18,.72,.3,1)', fill: 'forwards' }).onfinish = () => projectile.remove();
    return;
  }
  if (projectileType === 'stones') {
    projectile.animate([
      { translate: '0 0', scale: '.45', opacity: 0, filter: 'brightness(.72)' },
      { translate: `${(endX - startX) * .12}px ${(endY - startY) * .12}px`, scale: '.78', opacity: 1, offset: .16 },
      { translate: `${endX - startX}px ${endY - startY}px`, scale: '1.08', opacity: 1, offset: .84 },
      { translate: `${endX - startX}px ${endY - startY}px`, scale: '1.22', opacity: 0 },
    ], { duration: impactDelay, easing: 'cubic-bezier(.2,.72,.3,1)', fill: 'forwards' }).onfinish = () => projectile.remove();
    return;
  }
  if (className === 'hunter' || projectileType === 'poison-arrow') {
    const controlX = (startX + endX) / 2;
    const arcHeight = Math.max(22, Math.min(68, Math.abs(endX - startX) * 0.11));
    const controlY = Math.min(startY, endY) - arcHeight;
    const arrowAngle = Math.atan2(endY - startY, endX - startX) * 180 / Math.PI;
    const samples = [0, 0.1, 0.28, 0.5, 0.72, 0.9, 1];
    const keyframes = samples.map((t) => {
      const inverse = 1 - t;
      const x = inverse * inverse * startX + 2 * inverse * t * controlX + t * t * endX;
      const y = inverse * inverse * startY + 2 * inverse * t * controlY + t * t * endY;
      return {
        translate: `${x - startX}px ${y - startY}px`,
        rotate: `${arrowAngle}deg`,
        opacity: t < 0.1 ? t * 10 : t > 0.9 ? (1 - t) * 10 : 1,
      };
    });
    projectile.animate(keyframes, { duration: impactDelay, easing: 'cubic-bezier(.2,.72,.3,1)', fill: 'forwards' }).onfinish = () => projectile.remove();
    return;
  }
  projectile.animate([
    { translate: '0 0', scale: 0.72, opacity: 0 },
    { translate: `${(endX - startX) * 0.16}px ${(endY - startY) * 0.16}px`, scale: 1, opacity: 1, offset: 0.18 },
    { translate: `${endX - startX}px ${endY - startY}px`, scale: 0.82, opacity: 1, offset: 0.88 },
    { translate: `${endX - startX}px ${endY - startY}px`, scale: 1.6, opacity: 0 },
  ], { duration: impactDelay, easing: 'linear', fill: 'forwards' }).onfinish = () => projectile.remove();
}

function launchChainLightning(actor, targets, impactDelay = 250) {
  const scene = battleSceneElement();
  if (!scene || !actor || !targets.length) return;
  const bounds = scene.getBoundingClientRect();
  const width = Math.max(1, bounds.width);
  const height = Math.max(1, bounds.height);
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.classList.add('battle-lightning-chain');
  svg.setAttribute('viewBox', `0 0 ${width} ${height}`);
  svg.setAttribute('preserveAspectRatio', 'none');
  svg.setAttribute('aria-hidden', 'true');
  let start = battleSceneOrigin('mage', bounds, actor);

  targets.forEach((target, index) => {
    const targetBounds = target.getBoundingClientRect();
    const end = battleEnemyAimPoint(target, bounds, 0.5, 0.54);
    const dx = end.x - start.x;
    const dy = end.y - start.y;
    const distance = Math.hypot(dx, dy) || 1;
    const perpendicular = { x: -dy / distance, y: dx / distance };
    const steps = Math.max(5, Math.min(9, Math.round(distance / 38)));
    const points = [start];
    for (let step = 1; step < steps; step += 1) {
      const progress = step / steps;
      const jitter = (step % 2 ? 1 : -1) * Math.min(18, distance * 0.055);
      points.push({
        x: start.x + dx * progress + perpendicular.x * jitter,
        y: start.y + dy * progress + perpendicular.y * jitter,
      });
    }
    points.push(end);
    const pathData = points.map((point, pointIndex) => `${pointIndex ? 'L' : 'M'} ${point.x} ${point.y}`).join(' ');
    const delay = Math.round(index * Math.min(38, impactDelay / Math.max(2, targets.length + 1)));
    const duration = Math.max(110, impactDelay - delay);
    for (const layer of ['outer', 'core']) {
      const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
      path.setAttribute('d', pathData);
      path.classList.add(`battle-lightning-${layer}`);
      const length = path.getTotalLength();
      path.style.strokeDasharray = `${length}`;
      path.style.strokeDashoffset = `${length}`;
      svg.append(path);
      path.animate([
        { strokeDashoffset: length, opacity: 0.15 },
        { strokeDashoffset: 0, opacity: 1, offset: 0.72 },
        { strokeDashoffset: 0, opacity: 0.3 },
        { strokeDashoffset: 0, opacity: 1 },
      ], { duration, delay, easing: 'linear', fill: 'forwards' });
    }
    const impact = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
    impact.setAttribute('cx', `${end.x}`);
    impact.setAttribute('cy', `${end.y}`);
    impact.setAttribute('r', '5');
    impact.classList.add('battle-lightning-impact');
    svg.append(impact);
    impact.animate([
      { transform: 'scale(.25)', opacity: 0 },
      { transform: 'scale(1)', opacity: 1, offset: 0.35 },
      { transform: 'scale(1.8)', opacity: 0 },
    ], { duration: 260, delay: Math.max(0, impactDelay - 85) + delay, easing: 'ease-out', fill: 'forwards' });
    start = end;
  });

  scene.append(svg);
  window.setTimeout(() => svg.remove(), impactDelay + Math.max(0, targets.length - 1) * 40 + 220);
}

function launchFireball(actor, target, impactDelay = 300) {
  launchBattleProjectile('mage', actor, target, impactDelay, 'fire');
}

function launchHealerShockwave(targets, duration = 640) {
  const scene = battleSceneElement();
  if (!scene || !targets.length) return;

  const activeBattle = battle;
  const activeWave = battle?.wave;
  const sceneBounds = scene.getBoundingClientRect();
  const origin = { x: sceneBounds.width * 0.5, y: sceneBounds.height * 0.92 };
  const targetPoints = targets.map((target) => ({
    target,
    point: battleEnemyAimPoint(target, sceneBounds, 0.5, 0.54),
  }));
  const farthestDistance = Math.max(...targetPoints.map(({ point }) => Math.hypot(point.x - origin.x, point.y - origin.y)), 1);
  const radius = farthestDistance / 0.84;
  const wave = document.createElement('img');
  wave.className = 'battle-healer-shockwave';
  wave.src = new URL('Assets/Art/battle/runtime/effects/healer-shockwave-ring.png', document.baseURI).href;
  wave.alt = '';
  wave.setAttribute('aria-hidden', 'true');
  wave.draggable = false;
  wave.style.width = `${radius * 2}px`;
  wave.style.height = `${radius * 2}px`;
  wave.style.left = `${origin.x}px`;
  wave.style.top = `${origin.y}px`;
  scene.append(wave);
  wave.animate([
    { transform: 'translate(-50%, -50%) scale(.025)', opacity: 0 },
    { transform: 'translate(-50%, -50%) scale(.35)', opacity: 0.92, offset: 0.2 },
    { transform: 'translate(-50%, -50%) scale(1)', opacity: 0 },
  ], { duration, easing: 'cubic-bezier(.16,.72,.24,1)', fill: 'forwards' }).onfinish = () => wave.remove();

  targetPoints.forEach(({ target, point }) => {
    const distance = Math.hypot(point.x - origin.x, point.y - origin.y);
    const impactAt = Math.round(duration * Math.min(0.92, distance / radius));
    window.setTimeout(() => {
      if (battle !== activeBattle || battle?.wave !== activeWave || !target.isConnected || battleSceneElement() !== scene) return;
      target.classList.remove('is-hit');
      void target.offsetWidth;
      target.classList.add('is-hit');
      window.setTimeout(() => target.classList.remove('is-hit'), 380);
    }, impactAt);
  });
}

function playBattleEntrance() {
  const overlay = document.querySelector('#battle-overlay');
  if (!overlay || !overlay.querySelector('.battle-scene.has-raster-art')) return;
  if (overlay.querySelector('.battle-scene.has-front-enemies')) {
    battle.enemiesAdvancedForRanged = true;
    battle.sceneReadyAt = performance.now() + 250;
    overlay.querySelectorAll('.battle-hero').forEach((actor) => {
      actor.style.opacity = '1';
      actor.style.translate = '0 0';
    });
    overlay.querySelectorAll('.battle-enemy').forEach((actor) => {
      actor.style.opacity = '1';
      actor.style.translate = '0 0';
      const index = Number(actor.dataset.enemy);
      const dead = (battle.enemyHealths?.[index]?.hp ?? 1) <= 0;
      setBattleSpritePose(actor.querySelector('[data-battle-sprite]'), battleEnemySpriteActor(), dead ? 'defeated' : 'idle');
    });
    return;
  }
  preloadWarriorFrames();
  preloadHealerFrames();
  preloadHunterFrames();
  preloadMageFrames();
  const duration = battle?.wave === 1 ? 1450 : 900;
  const partyHasFrontliner = (battle?.partyClasses || []).some((className) =>
    ['warrior', 'healer'].includes(className) && (battle.partyHealth?.[className]?.hp || 0) > 0,
  );
  const enemyOffsets = partyHasFrontliner ? [-66, -141, -216] : [-316, -406, -496];
  battle.enemiesAdvancedForRanged = !partyHasFrontliner;
  battle.sceneReadyAt = performance.now() + duration + 250;
  overlay.querySelectorAll('.battle-hero').forEach((actor, index) => {
    const className = actor.dataset.hero;
    const isRanged = ['hunter', 'mage'].includes(className);
    const offset = className === 'healer' ? 392 : className === 'warrior' ? 212 : 190 + index * 15;
    const rangedMainAdvances = className === 'hunter' && actor.classList.contains('is-main');
    const settledOffset = isRanged
      ? (rangedMainAdvances ? 30 : 0)
      : ['healer', 'warrior'].includes(className) ? offset - 32 : offset;
    const verticalOffset = actor.dataset.hero === 'healer' ? -24 : 0;
    if (isRanged) {
      actor.style.setProperty('--battle-lane-x', `${settledOffset}px`);
      actor.style.translate = `${settledOffset}px ${verticalOffset}px`;
      actor.style.opacity = '1';
      setHeroBattlePose(className, 'idle');
      return;
    }
    const startOffset = 0;
    const movementDuration = Math.abs(settledOffset - startOffset) > 1 ? duration + index * 100 + 100 : 0;
    setHeroBattlePose(actor.dataset.hero, movementDuration ? 'run' : 'idle', movementDuration);
    actor.animate([
      { translate: `${startOffset}px ${verticalOffset}px`, opacity: 0.55 },
      { translate: `${settledOffset}px ${verticalOffset}px`, opacity: 1 },
    ], { duration, delay: index * 100, easing: 'linear', fill: 'none' }).onfinish = () => {
      if (actor.isConnected) {
        actor.style.setProperty('--battle-lane-x', `${settledOffset}px`);
        actor.style.translate = `${settledOffset}px ${verticalOffset}px`;
      }
    };
  });
  overlay.querySelectorAll('.battle-enemy').forEach((actor, index) => {
    const offset = enemyOffsets[index] ?? -100;
    setBattleSpritePose(actor.querySelector('[data-battle-sprite]'), battleEnemySpriteActor(), 'run', duration + index * 80 + 100);
    actor.animate([
      { translate: `${55 + index * 9}px 0`, opacity: 0.55 },
      { translate: `${offset}px 0`, opacity: 1 },
    ], { duration, delay: index * 80, easing: 'linear', fill: 'none' }).onfinish = () => {
      if (actor.isConnected) {
        actor.style.setProperty('--battle-lane-x', `${offset}px`);
        actor.style.translate = `${offset}px 0`;
      }
    };
  });
}

function advanceEnemiesForRangedParty() {
  if (!battle || battle.enemiesAdvancedForRanged) return;
  const hasLivingFrontliner = (battle.partyClasses || []).some((className) =>
    ['warrior', 'healer'].includes(className) && (battle.partyHealth?.[className]?.hp || 0) > 0,
  );
  if (hasLivingFrontliner) return;

  const overlay = document.querySelector('#battle-overlay');
  if (!overlay?.querySelector('.battle-scene.has-raster-art')) return;
  battle.enemiesAdvancedForRanged = true;
  const enemyOffsets = [-316, -406, -496];
  overlay.querySelectorAll('.battle-enemy').forEach((actor, index) => {
    const from = Number.parseFloat(actor.style.getPropertyValue('--battle-lane-x')) || 0;
    const to = enemyOffsets[index] ?? -380;
    const sprite = actor.querySelector('[data-battle-sprite]');
    setBattleSpritePose(sprite, battleEnemySpriteActor(), 'run', 560);
    actor.animate([
      { translate: `${from}px 0` },
      { translate: `${to}px 0` },
    ], { duration: 560, easing: 'linear', fill: 'none' }).onfinish = () => {
      if (!actor.isConnected) return;
      actor.style.setProperty('--battle-lane-x', `${to}px`);
      actor.style.translate = `${to}px 0`;
      setBattleSpritePose(sprite, battleEnemySpriteActor(), 'idle');
    };
  });
}

function playBattleAttack(className, damage, targetIndexes = null, areaEffect = false, damageOverTime = false, projectileType = 'basic', critical = false, vulnerable = false) {
  const current = battle;
  if (!current) return;
  const wave = current.wave;
  const actor = document.querySelector(`#battle-overlay [data-hero="${className}"]`);
  const indexes = current.mode === 'boss' ? [0] : (targetIndexes?.length ? targetIndexes : chooseBattleEnemyIndexes(className));
  const targets = indexes.map((index) => document.querySelector(`#battle-overlay .battle-enemy[data-enemy="${index}"]`)).filter(Boolean);
  const target = targets[0] || (current.mode === 'boss' ? closestBattleEnemy(actor) : null);
  const healerShockwave = areaEffect && className === 'healer';
  const mageLightning = areaEffect && className === 'mage';
  const mageFireball = damageOverTime && className === 'mage';
  const dedicatedSkillEffect = healerShockwave || mageLightning || mageFireball || projectileType === 'stones';
  const impactDelay = battleAttackImpactDelay(className, areaEffect, damageOverTime, projectileType);
  if (projectileType === 'stones' && target) launchBattleProjectile(className, actor, target, impactDelay, projectileType);
  if (actor && isBattleClassAlive(className)) {
    const lethalHit = current.mode !== 'boss' && indexes.some((index) => (current.enemyHealths?.[index]?.hp ?? 1) <= 0);
    const frontFacingScene = Boolean(battleSceneElement()?.matches('.has-front-enemies, .has-front-boss'));
    if (!frontFacingScene) {
    actor.classList.remove('is-attacking');
    void actor.offsetWidth;
    actor.classList.add('is-attacking');
    window.setTimeout(() => actor.classList.remove('is-attacking'), 420);
    if (className === 'warrior') {
      setHeroBattlePose(className, 'windup');
      window.setTimeout(() => {
        if (!isBattleClassAlive(className)) return;
        const sprite = actor.querySelector('[data-battle-sprite]');
        if (sprite?.dataset.pose === 'windup') setBattleSpritePose(sprite, className, 'strike', 320);
      }, 180);
    } else if (className === 'healer') setHeroBattlePose(className, 'attack', 480);
    else if (className === 'hunter') setHeroBattlePose(className, 'attack', 400);
    else if (className === 'mage') setHeroBattlePose(className, 'attack', 400);
    } else {
      const ranged = ['hunter', 'mage', 'healer'].includes(className);
      if (projectileType === 'stones') {
        // The ground burst replaces the ordinary melee slash for these skills.
      } else if (ranged) {
        // Skills with a dedicated effect must not also launch the basic projectile.
        if (!dedicatedSkillEffect) launchBattleProjectile(className, actor, target, impactDelay, projectileType);
      } else {
        if (target) {
          const slash = document.createElement('span');
          slash.className = 'battle-melee-slash';
          slash.setAttribute('aria-hidden', 'true');
          target.append(slash);
          window.setTimeout(() => slash.remove(), 420);
        }
        actor.classList.remove('is-attacking');
        void actor.offsetWidth;
        actor.classList.add('is-attacking');
        window.setTimeout(() => actor.classList.remove('is-attacking'), 460);
        if (className === 'warrior') {
          setHeroBattlePose(className, 'windup');
          window.setTimeout(() => {
            if (!battle || !isBattleClassAlive(className) || battle.pending || (!indexes.some((index) => (battle.enemyHealths?.[index]?.hp || 0) > 0) && !lethalHit && !battle.finishing)) return;
            const sprite = actor.querySelector('[data-battle-sprite]');
            if (sprite?.dataset.pose === 'windup') setBattleSpritePose(sprite, className, 'strike', 320);
          }, 180);
        }
      }

      if (className === 'healer') setHeroBattlePose(className, 'attack', 480);
      else if (className === 'hunter') setHeroBattlePose(className, 'attack', 400);
      else if (className === 'mage') setHeroBattlePose(className, 'attack', 400);
    }
    if (mageLightning) launchChainLightning(actor, targets, impactDelay);
    else if (healerShockwave) {
      launchHealerShockwave(targets, impactDelay);
    }
    else if (mageFireball) launchFireball(actor, target, impactDelay);
  }

  window.setTimeout(() => {
    if (battle !== current || current.wave !== wave) return;
    if (!healerShockwave) targets.forEach((enemy) => {
      if (!enemy.isConnected) return;
      enemy.classList.remove('is-hit');
      void enemy.offsetWidth;
      enemy.classList.add('is-hit');
      window.setTimeout(() => enemy.classList.remove('is-hit'), 380);
    });
  }, impactDelay);
}

function battleLandscape(areaId) {
  if (battle?.mode === 'tower') {
    const source = new URL('Assets/Art/battle/regions/tower-chain-cathedral-arena.png', document.baseURI).href;
    return `<img class="battle-landscape battle-landscape-image battle-landscape-tower" src="${source}" alt="" draggable="false">`;
  }
  const region = battle?.mode === 'area' && ['aschental', 'salzmoor', 'schwarze-kluft', 'glasforst', 'mondbruch'].includes(areaId) ? areaId : 'dornwacht';
  const source = new URL(`Assets/Art/battle/regions/${region}-arena-artwork.png`, document.baseURI).href;
  return `<img class="battle-landscape battle-landscape-image" src="${source}" alt="" draggable="false">`;
}

function battleEnemyFigure(areaId, index) {
  if (battle?.mode === 'boss') {
    return battleSpriteMarkup('shadow-of-darkness-front', 'idle', 'enemy-art-sprite boss-art-sprite');
  }
  if (battle?.mode === 'tower' && battle.towerGuardian) {
    return battleSpriteMarkup('chain-archon', 'idle', `enemy-art-sprite enemy-art-sprite-${index + 1}`);
  }
  return battleSpriteMarkup(battleEnemySpriteActor(areaId), 'idle', `enemy-art-sprite enemy-art-sprite-${index + 1}`);
}

function battleEnemySpriteActor(areaId = battle?.areaId) {
  if (battle?.mode === 'boss') return 'shadow-of-darkness-front';
  if (battle?.mode === 'tower' && battle.towerGuardian) return 'chain-archon';
  if (battle?.mode === 'area' && areaId === 'aschental') return 'ashen-brood';
  if (battle?.mode === 'area' && areaId === 'salzmoor') return 'mire-guardian';
  if (battle?.mode === 'area' && areaId === 'schwarze-kluft') return 'rift-stalker';
  if (battle?.mode === 'area' && areaId === 'glasforst') return 'shardwing';
  if (battle?.mode === 'area' && areaId === 'mondbruch') return 'moonfallen';
  return 'ashen-stray';
}
