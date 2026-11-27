// Class skills and ordinary talents share one level-earned point budget.
function classSkillNode(className, skillId) {
  return SKILL_TREE_NODES.find(node => node.class === className && node.effect?.type === 'class-skill' && node.effect.skillId === skillId);
}
function classSkillRank(className, skillId, sourceState = state, bonusRanks = 0) {
  const node = classSkillNode(className, skillId);
  if (!node) return 0;
  const invested = Math.max(0, Number(sourceState?.skillTree?.[className]?.nodes?.[node?.id]) || 0);
  const baseRank = node.effect.kind === 'active' ? 1 : 0;
  // Equipment strengthens invested nodes without spending points or unlocking paths.
  return (baseRank > 0 || invested > 0) ? baseRank + effectiveSkillTreeNodeRank(node, className, sourceState) + (invested > 0 ? Math.max(0, Number(bonusRanks) || 0) : 0) : 0;
}
function classSkillUnlocked(className, skillId, sourceState = state) {
  return classSkillRank(className, skillId, sourceState) > 0;
}
function classSkillVariant(className, skillId, sourceState = state) {
  const ranks = sourceState?.skillTree?.[className]?.nodes || {};
  return SKILL_TREE_NODES.find(node => node.class === className && node.effect?.type === 'skill-variant'
    && node.effect.skillId === skillId && ranks[node.id] > 0)?.effect.variantId || null;
}
function classSkillChoiceBlockedReason(node, ranks = {}, className = node?.class) {
  if (node?.class && node.class !== className) return 'Dieser Knoten gehört zu einer anderen Klasse.';
  if (node?.rarity === 'legendary' && SKILL_TREE_NODES.some(other => other.id !== node.id && other.class === className && other.rarity === 'legendary' && ranks[other.id] > 0)) return 'Du kannst nur einen Schlüsselknoten wählen.';
  if (node?.exclusiveGroup && SKILL_TREE_NODES.some(other => other.id !== node.id && other.exclusiveGroup === node.exclusiveGroup && ranks[other.id] > 0)) return 'Für diese Fähigkeit ist bereits eine andere Subnode gewählt.';
  if (node?.effect?.type === 'class-skill' && node.effect.kind === 'passive' && !(ranks[node.id] > 0)) {
    const learned = SKILL_TREE_NODES.filter(other => other.class === className && other.effect?.type === 'class-skill' && other.effect.kind === 'passive' && ranks[other.id] > 0).length;
    if (learned >= GAME_CONFIG.classSkillRules.maxPassives) return 'Du kannst nur eine passive Klassenfähigkeit lernen.';
  }
  return '';
}
function empowerTreeSkill(base, className, sourceState = state) {
  if (!base) return base;
  const skill = JSON.parse(JSON.stringify(base));
  const rank = classSkillRank(className, skill.id, sourceState);
  const kind = COMPANION_SKILLS[className]?.passive?.some(entry => entry.id === skill.id) ? 'passive' : 'active';
  const variant = skill.variants?.find(entry => entry.id === classSkillVariant(className, skill.id, sourceState));
  if (variant) Object.assign(skill, JSON.parse(JSON.stringify(variant.overrides)), { variantName: variant.name });
  if (kind === 'passive') {
    const ratio = rank / (skill.maxRanks || 10);
    const scale = effect => {
      const result = { ...effect };
      if (Number.isFinite(result.value)) result.value *= ratio;
      if (result.type === 'bow-poison') result.chancePercent = Math.min(100, result.chancePercent * ratio);
      return result;
    };
    skill.effect = Array.isArray(skill.effect) ? skill.effect.map(scale) : scale(skill.effect);
  }
  if (kind === 'active') {
    const damage = 1 + Math.max(0, rank - 1) * (skill.rankScaling?.damagePercent || 0) / 100;
    const healing = 1 + Math.max(0, rank - 1) * (skill.rankScaling?.healingPercent || 0) / 100;
    for (const key of ['damageMultiplier', 'hitMultiplier', 'burnMultiplier', 'currentHealthPercent']) {
      if (Number.isFinite(skill[key])) skill[key] *= damage;
    }
    if (Number.isFinite(skill.currentHealthPercent)) skill.currentHealthPercent = Math.min(100, skill.currentHealthPercent);
    if (Number.isFinite(skill.healPercent)) skill.healPercent *= healing;
    if (skill.additionalRingMultipliers) skill.additionalRingMultipliers = skill.additionalRingMultipliers.map(value => value * damage);
  }
  return { ...skill, rank, learned: rank > 0 };
}
function activeClassSkill(className, sourceState = state) {
  const index = sourceState?.companions?.[className]?.activeSkillIndex;
  const skill = COMPANION_SKILLS[className]?.active?.[index];
  return skill && classSkillUnlocked(className, skill.id, sourceState) ? empoweredClassSkill(skill, className, sourceState) : null;
}
