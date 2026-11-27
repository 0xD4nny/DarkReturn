function classSkillHealingMultiplier(owner) {
  const effects = activeArmorSetEffects(battleStatsState(), owner);
  const faith = owner === 'healer' ? healerFaithScaling(getStats(owner, battleStatsState())) : 0;
  return (1 + faith / 100) * (1 + (effects.healingPercent || 0) / 100);
}
function healFromClassSkillDamage(owner, damage, percent) {
  const recipients = livingBattleClasses();
  if (!(damage > 0) || !recipients.length) return;
  const amount = damage * percent / 100 / recipients.length * classSkillHealingMultiplier(owner);
  showBattleHealing(healBattlePartyAmount((hero, target) => recipients.includes(target) ? amount : 0), true);
}
function queueClassRegeneration(owner, skill, now) {
  battle.heroRegenerations ||= [];
  const old = battle.heroRegenerations.find(entry => entry.owner === owner && entry.skillId === skill.id);
  const effect = { owner, skillId: skill.id, scope: skill.healScope || 'party', percent: skill.healPercent * classSkillHealingMultiplier(owner),
    nextTickAt: old?.nextTickAt || now + 1000, expiresAt: now + skill.durationSeconds * 1000 };
  if (old) Object.assign(old, effect);
  else battle.heroRegenerations.push(effect);
  setHeroBattlePose(owner, 'heal', 760);
}
function processClassRegenerations(now = performance.now()) {
  if (!battle || battle.pending || battle.finishing || battle.between) return;
  for (const effect of battle.heroRegenerations || []) {
    if (!isBattleClassAlive(effect.owner)) continue;
    while (effect.nextTickAt <= now && effect.nextTickAt <= effect.expiresAt) {
      effect.nextTickAt += 1000;
      showBattleHealing(healBattlePartyAmount((hero, owner) => effect.scope === 'party' || owner === effect.owner ? hero.max * effect.percent / 100 : 0), true);
    }
  }
  battle.heroRegenerations = (battle.heroRegenerations || []).filter(effect => isBattleClassAlive(effect.owner) && effect.nextTickAt <= effect.expiresAt);
}
function castAdditionalClassSkill(owner, skill, now) {
  if (skill.effect === 'heal-over-time') { queueClassRegeneration(owner, skill, now); return true; }
  if (skill.effect === 'fire-area') {
    const targets = livingBattleEnemyIndexes();
    if (skill.burnVulnerabilitySeconds) {
      const burning = targets.filter(index => battle.enemyBurns?.some(entry => entry.targetIndex === index && entry.expiresAt > now));
      makeEnemyVulnerable(skill.burnVulnerabilitySeconds, skill.name, burning);
    }
    applyHeroHit(owner, skill.damageMultiplier, skill.name, true, null, true, false, 'fire-arrow');
    if (skill.burnMultiplier > 0) {
      battle.enemyBurns ||= [];
      for (const targetIndex of targets) {
        if (battle.mode !== 'boss' && !(battle.enemyHealths?.[targetIndex]?.hp > 0)) continue;
        refreshEnemyDamageOverTime(battle.enemyBurns, { owner, targetIndex, ticksRemaining: skill.burnDuration,
          nextTickAt: now + 1000, expiresAt: now + skill.burnDuration * 1000,
          tickMultiplier: skill.burnMultiplier / skill.burnDuration, skillName: skill.name }, now, true);
      }
      if (skill.burnVulnerabilitySeconds) makeEnemyVulnerable(skill.burnVulnerabilitySeconds, skill.name, targets.filter(index => battle.mode === 'boss' || battle.enemyHealths?.[index]?.hp > 0));
    }
    return true;
  }
  if (skill.effect === 'area-damage' && (skill.repeatHits || skill.additionalRingMultipliers || skill.castHealingPercent)) {
    const before = battle.primaryDamageByClass?.[owner] || 0;
    const multipliers = skill.additionalRingMultipliers ? [skill.damageMultiplier, ...skill.additionalRingMultipliers]
      : Array.from({ length: skill.repeatHits || 1 }, () => skill.damageMultiplier);
    multipliers.forEach((multiplier, index) => {
      if (battle.mode === 'boss' || battle.enemyHp > 0) applyHeroHit(owner, multiplier, skill.name, true, null, index === 0);
    });
    if (skill.castHealingPercent) healFromClassSkillDamage(owner, (battle.primaryDamageByClass?.[owner] || 0) - before, skill.castHealingPercent);
    return true;
  }
  return false;
}
