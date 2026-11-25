// Party, contracts, tower, boss, and altar page templates.
function renderPartyOwnerButtons(selectedOwner, context) {
  const companionClass = state.activeCompanion;
  const members = [
    { owner: 'main', className: state.mainClass, label: `${CLASSES[state.mainClass].label} &middot; Main` },
    ...(companionClass ? [{ owner: companionClass, className: companionClass, label: `${CLASSES[companionClass].label} &middot; Gef&auml;hrte` }] : []),
  ];
  return `<div class="party-owner-switch" data-party-context="${context}" role="group" aria-label="Charakter ausw&auml;hlen">${members.map((member) => `<button class="party-owner-button ui-control ui-choice ${selectedOwner === member.owner ? 'is-selected' : ''}" type="button" data-owner-class="${member.className}" data-party-owner="${member.owner}" data-party-context="${context}" aria-pressed="${selectedOwner === member.owner}">${member.label}</button>`).join('')}</div>`;
}
function abilityPresentation(skill, type) {
  const icons = {
    'poison-arrow': 'chemical-arrow', 'predator-eye': 'beast-eye', 'soul-scent': 'aura',
    jagdstoss: 'target-arrows', pfeilsalve: 'arrow-cluster', 'verwundender-schuss': 'barbed-arrow',
    kampfrausch: 'crossed-swords', unbeugsam: 'heart-tower', wachtwall: 'bordered-shield',
    stampfen: 'earth-crack', henkerschlag: 'broadsword', schildwall: 'shield-echoes',
    'arkanes-echo': 'magic-swirl', aetherblick: 'crystal-eye', 'fast-caster': 'hourglass',
    erfrieren: 'snowflake-1', feuerball: 'fireball', funken: 'lightning-branches',
    lebenssegen: 'shining-heart', kampfsegen: 'rally-the-troops', lichtwacht: 'eye-shield',
    erneuerung: 'holy-grail', 'holy-circle': 'sunbeams', unkillable: 'magic-shield',
  };
  const effects = Array.isArray(skill.effect) ? skill.effect : [skill.effect];
  const party = effects.some((effect) => effect?.scope === 'party');
  const kinds = { damage: 'Angriff', 'multi-hit': 'Mehrfachtreffer', 'vulnerable-hit': 'Verwundbarkeit', 'stun-hit': 'Betäubung', guard: 'Schutz', 'freeze-hit': 'Frost', 'burn-hit': 'Brand', 'area-damage': 'Flächenschaden', heal: 'Heilung', unkillable: 'Schutz' };
  const target = type === 'passive' ? party ? 'Die ganze Gruppe' : 'Der Anwender'
    : ['guard', 'heal'].includes(skill.effect) ? 'Die ganze Gruppe'
      : skill.effect === 'unkillable' ? 'Der Anwender'
        : (skill.effect === 'area-damage' || skill.areaEffect) ? 'Alle lebenden Gegner' : 'Ein Gegner';
  return { icon: `Assets/Icons/000000/transparent/1x1/lorc/${icons[skill.id] || 'magic-swirl'}.svg`, target, kind: type === 'passive' ? 'Dauerhafter Effekt' : kinds[skill.effect] || 'Aktive Fähigkeit' };
}
function effectiveAbilityCooldown(className, skill) {
  const reduction = Math.min(75, Math.max(0, Number(getStats(className)['Abklingzeitreduktion']) || 0));
  return Number(empoweredClassSkill(skill, className).cooldown) * (1 - reduction / 100);
}
function abilityViewSelection() {
  const className = selectedAbilityOwner === state.activeCompanion ? state.activeCompanion : state.mainClass;
  const type = selectedAbilityType === 'passive' ? 'passive' : 'active';
  const skills = COMPANION_SKILLS[className][type];
  const passiveSlot = selectedPassiveAbilitySlot === 1 && passiveSkillSlotCount(className) > 1 ? 1 : 0;
  const member = state.companions[className];
  const equippedIndex = type === 'passive' ? member[passiveSlot === 1 ? 'secondPassiveSkillIndex' : 'passiveSkillIndex'] : member.activeSkillIndex;
  const inspectionKey = `${className}:${type}${type === 'passive' ? ':' + passiveSlot : ''}`;
  const candidate = inspectedAbilities[inspectionKey];
  const fallback = Number.isInteger(equippedIndex) ? equippedIndex : skills.findIndex((_, index) => index !== member.passiveSkillIndex);
  const index = Number.isInteger(candidate) && skills[candidate] ? candidate : Math.max(0, fallback);
  return { className, type, skills, equippedIndex, index, passiveSlot };

}
function inspectAbility(type, index) {
  if (!['active', 'passive'].includes(type)) return false;
  const { className } = abilityViewSelection();
  if (index !== undefined && (!Number.isInteger(index) || !COMPANION_SKILLS[className][type][index])) return false;
  selectedAbilityType = type;
  if (index !== undefined) {
    const slot = selectedPassiveAbilitySlot === 1 && passiveSkillSlotCount(className) > 1 ? 1 : 0;
    inspectedAbilities[`${className}:${type}${type === 'passive' ? ':' + slot : ''}`] = index;
  }
  return true;
}
function renderCompanions() {
  const { className, type, skills, equippedIndex, index, passiveSlot } = abilityViewSelection();
  const info = CLASSES[className];
  const member = state.companions[className];
  const skill = empoweredClassSkill(skills[index], className);
  const presentation = abilityPresentation(skill, type);
  const equipped = index === equippedIndex;
  const passiveCount = passiveSkillSlotCount(className);
  const passiveIndices = selectedPassiveSkillIndices(className);
  const otherPassiveIndex = passiveSlot === 0 ? member.secondPassiveSkillIndex : member.passiveSkillIndex;
  const blockedByOtherPassive = type === 'passive' && passiveCount > 1 && index === otherPassiveIndex;
  const seconds = (value) => `${Number(value).toLocaleString('de-DE', { maximumFractionDigits: 1 })} s`;
  const summary = [
    ['AKTIV', COMPANION_SKILLS[className].active[member.activeSkillIndex]?.name],
    [passiveCount > 1 ? 'PASSIV 1' : 'PASSIV', COMPANION_SKILLS[className].passive[member.passiveSkillIndex]?.name],
    ...(passiveCount > 1 ? [['PASSIV 2', COMPANION_SKILLS[className].passive[member.secondPassiveSkillIndex]?.name || 'Nicht gewählt']] : []),
  ].map(([label, name]) => `<div><small>${label}</small><strong>${escapeHtml(name || '')}</strong></div>`).join('');
  const passiveSlotButtons = type === 'passive' && passiveCount > 1 ? `<div class="abilities-category-switch" role="group" aria-label="Passiven Fähigkeitsslot wählen">${[0, 1].map(slot => `<button class="ui-control ui-choice ${slot === passiveSlot ? 'is-selected' : ''}" type="button" data-passive-slot="${slot}" aria-pressed="${slot === passiveSlot}">Passive ${slot + 1}</button>`).join('')}</div>` : '';
  const tabs = ['active', 'passive'].map((key) => `<button type="button" data-ability-category="${key}" class="ui-control ui-choice ${key === type ? 'is-selected' : ''}" aria-pressed="${key === type}">${key === 'active' ? 'Aktive Fähigkeiten' : 'Passive Fähigkeiten'}<small>${COMPANION_SKILLS[className][key].length}</small></button>`).join('');
  const rows = skills.map((choice, choiceIndex) => {
    const meta = abilityPresentation(empoweredClassSkill(choice, className), type);
    return `<button type="button" class="ability-choice-row ui-control ui-card-choice ${choiceIndex === index ? 'is-inspected' : ''}" data-inspect-ability="${choiceIndex}" data-ability-category="${type}" aria-pressed="${choiceIndex === index}"><span class="ability-icon-box">${assetIconMarkup(meta.icon, '✦', 'ability-glyph')}</span><span class="ability-choice-copy"><strong>${escapeHtml(choice.name)}</strong><small>${meta.kind} · ${meta.target}</small></span><span class="ability-choice-state">${type === 'active' ? `<span>${seconds(effectiveAbilityCooldown(className, choice))}</span>` : ''}${(type === 'passive' ? passiveIndices.includes(choiceIndex) : choiceIndex === equippedIndex) ? `<small>✓ ${type === 'passive' && passiveCount > 1 ? 'Passive ' + (choiceIndex === member.passiveSkillIndex ? 1 : 2) : 'Ausgerüstet'}</small>` : ''}</span></button>`;
  }).join('');
  const facts = type === 'active' ? `<div><small>ABKLINGZEIT</small><strong>${seconds(effectiveAbilityCooldown(className, skill))}</strong><span>Grundwert: ${seconds(skill.cooldown)}</span></div><div><small>ZIEL</small><strong>${presentation.target}</strong></div>`
    : `<div><small>WIRKUNG</small><strong>Dauerhaft aktiv</strong></div><div><small>GILT FÜR</small><strong>${presentation.target}</strong></div>`;
  return `<section class="abilities-view ${className}"><div class="view-heading"><div><p class="eyebrow"><span></span> DEINE KAMPFGRUPPE</p><h1>Deine <em>Fähigkeiten</em></h1><p class="welcome-sub">Eine aktive und ${passiveCount > 1 ? 'zwei passive Fähigkeiten' : 'eine passive Fähigkeit'} formen deinen Spielstil.</p></div>${renderPartyOwnerButtons(className === state.mainClass ? 'main' : className, 'abilities')}</div>
    <div class="abilities-workspace"><section class="abilities-selection" aria-label="Fähigkeiten auswählen">
      <header class="abilities-profile"><span class="ability-icon-box">${assetIconMarkup(info.asset, info.icon, 'ability-glyph')}</span><div><h2>${escapeHtml(info.label)}</h2><small>${className === state.mainClass ? 'Hauptklasse' : 'Gefährte'} · ${escapeHtml(info.role)}</small></div></header>
      <div class="abilities-equipped-summary ${passiveCount > 1 ? 'has-second-passive' : ''}">${summary}</div><div class="abilities-category-switch" role="group" aria-label="Fähigkeitsart">${tabs}</div>${passiveSlotButtons}
      <div class="abilities-choice-list">${rows}</div><p class="abilities-selection-note">Wähle eine Fähigkeit aus, um ihre Wirkung anzusehen.</p>
    </section><aside class="ability-inspector" aria-label="Fähigkeitsdetails"><p class="eyebrow">${type === 'active' ? 'AKTIVE FÄHIGKEIT' : 'PASSIVE FÄHIGKEIT'} · ${presentation.kind}</p><div class="ability-detail-symbol">${assetIconMarkup(presentation.icon, '✦', 'ability-glyph')}</div><h2>${escapeHtml(skill.name)}</h2><p class="ability-description">${escapeHtml(skillDescription(skills[index], className))}</p><div class="ability-facts">${facts}</div><button class="primary-button ui-control ui-button ability-equip-button" type="button" data-skill-class="${className}" data-skill-type="${type}" data-skill-index="${index}" data-passive-slot-index="${passiveSlot}" ${equipped || blockedByOtherPassive ? 'disabled' : ''}>${equipped ? '✓ BEREITS AUSGERÜSTET' : blockedByOtherPassive ? 'IM ANDEREN PASSIVEN SLOT' : type === 'passive' && passiveCount > 1 ? 'ALS PASSIVE ' + (passiveSlot + 1) + ' AUSRÜSTEN' : 'FÄHIGKEIT AUSRÜSTEN'}</button></aside></div></section>`;
}

// Owner selection and branch layout for the data-driven talent tree.
const SKILL_TREE_THEMES = [
  { id: 'blue', classId: 'mage', label: 'Magier' },
  { id: 'red', classId: 'warrior', label: 'Krieger' },
  { id: 'white', classId: 'hunter', label: 'Jäger' },
  { id: 'yellow', classId: 'healer', label: 'Heiler' },
];
// Coordinates describe presentation only; prerequisites come from SKILL_TREE_NODES.
const SKILL_TREE_NODE_LAYOUT = SKILL_TREE_NODES.map(node => {
  if (node.id === 'origin') return ['origin', 450, 40];
  const center = 75 + GAME_CONFIG.skillTreeBranches.findIndex(branch => branch.id === node.branch) * 150;
  if (node.rarity === 'legendary') {
    const choices = SKILL_TREE_NODES.filter(entry => entry.branch === node.branch && entry.rarity === 'legendary');
    return [node.id, center + (choices.findIndex(entry => entry.id === node.id) === 0 ? -36 : 36), 730];
  }
  const branchNodes = SKILL_TREE_NODES.filter(entry => entry.branch === node.branch && entry.rarity !== 'legendary');
  return [node.id, center, 170 + (node.tier - 1) * 440 / Math.max(1, branchNodes.length - 1)];
});

function skillTreeConnectorPath(from, to) {
  if (to.legendary) return `M ${from.x + 30} ${from.y} H ${from.x + 68} V ${to.y - 35} H ${to.x} V ${to.y - 28}`;
  if (from.y === 40) return `M ${from.x} ${from.y + 30} V 85 H ${to.x} V 95 M ${to.x} 135 V ${to.y - 30}`;
  return `M ${from.x + 30} ${from.y} H ${from.x + 68} V ${to.y} H ${to.x + 30}`;
}
function skillTreeEffectLabel(node, rank, className) {
  if (!node.effect || rank < 1) return 'Noch keine Punkte investiert';
  const effect = node.effect;
  const value = effect.perPoint * rank;
  if (effect.type === 'skill-damage-flat-percent') {
    const skill = COMPANION_SKILLS[node.class]?.active?.find(entry => entry.id === effect.skillId);
    return `+${formatRuleNumber(value)} % Grundschaden für ${skill?.name || 'die Fähigkeit'}`;
  }
  if (effect.type === 'primary-attribute-flat') return `+${formatRuleNumber(value)} ${CLASS_ATTRIBUTE_SCALING[className].damageAttribute}`;
  if (effect.type === 'all-attributes-flat') return `+${formatRuleNumber(value)} auf alle fünf Attribute`;
  if (effect.type === 'soul-drop-percent') return `+${formatRuleNumber(value)} % Seelen aus Kämpfen`;
  if (effect.type === 'final-damage-percent') return `×${formatRuleNumber(1 + value / 100)} Schaden`;
  if (effect.type === 'additional-passive-slot') return 'Zwei passive Fähigkeiten gleichzeitig';
  if (effect.type === 'dodge-chance') return '+25 % eigene Ausweichchance';
  if (effect.type === 'extra-attack-chance') return '+20 % Chance auf zweiten Treffer';
  if (effect.type === 'dot-to-attack-percent') return 'Schaden über Zeit → Angriff % (1:1)';
  if (effect.type === 'warrior-execution-area-penalty') return 'Henkerschlag: Flächenschaden, -50 % Grundschaden';
  if (effect.type === 'mage-instant-fireball') return 'Feuerball: halbe Abklingzeit, voller Sofortschaden';
  if (effect.type === 'hunter-poison-chance') return 'Giftpfeile: 40 % Giftchance';
  if (effect.type === 'healer-damage-reduction-cap') return 'Eigenes Schadensminderungs-Cap: 95 %';
  if (effect.type === 'healer-final-damage-percent') return `×${formatRuleNumber(1 + value / 100)} eigener Schaden`;
  if (effect.type === 'hunter-critical-overflow') return 'Überschüssige Kritchance → Kritischer Schaden (1:1)';
  if (effect.type === 'warrior-stomp-area') return 'Stampfen: Flächenschaden und Betäubung';
  if (effect.type === 'self-life-steal-percent') return '+' + formatRuleNumber(value) + ' % eigener Lebensraub';
  const percent = effect.type === 'final-percent' || (effect.type === 'stat-flat' && STAT_PERCENT_STATS.has(effect.stat));
  return `+${formatRuleNumber(value)}${percent ? ' %' : ''} ${effect.stat}`;
}

function skillTreeNameLines(name, maximumLength = 18) {
  const lines = [''];
  for (const word of name.split(' ')) {
    const last = lines.length - 1;
    if (lines[last] && `${lines[last]} ${word}`.length > maximumLength) lines.push(word);
    else lines[last] = lines[last] ? `${lines[last]} ${word}` : word;
  }
  return lines;
}

function renderSkillTree() {
  const ownerClass = selectedSkillTreeOwner === 'main' ? state.mainClass : state.activeCompanion;
  const theme = SKILL_TREE_THEMES.find((entry) => entry.classId === ownerClass) || SKILL_TREE_THEMES[0];
  const selectedId = SKILL_TREE_NODES.some((node) => node.id === selectedSkillTreeNodeId) ? selectedSkillTreeNodeId : 'origin';
  const nodeData = new Map(SKILL_TREE_NODES.map((node) => [node.id, node]));
  const treeProgress = state.skillTree?.[ownerClass]?.nodes || {};
  const earnedPoints = earnedSkillTreePoints(ownerClass);
  const spentPoints = spentSkillTreePoints(ownerClass);
  const availablePoints = Math.max(0, earnedPoints - spentPoints);
  const legendaryNodes = SKILL_TREE_NODES.filter((node) => node.rarity === 'legendary');
  const legendaryIsBlocked = (node) => node.rarity === 'legendary' && legendaryNodes.some(other => other.branch === node.branch && other.id !== node.id && Number(treeProgress[other.id]) > 0);
  const nodeIsUnlocked = node => skillTreeNodeUnlocked(node, treeProgress, ownerClass);
  const nodeMap = new Map(SKILL_TREE_NODE_LAYOUT.map(([id, x, y]) => [id, { x, y, legendary: nodeData.get(id)?.rarity === 'legendary' }]));
  const edges = SKILL_TREE_NODES.filter((node) => node.parent && nodeMap.has(node.id) && nodeMap.has(node.parent)).map((node) => {
    const from = nodeMap.get(node.parent);
    const to = nodeMap.get(node.id);
    const unlocked = nodeIsUnlocked(node) && !legendaryIsBlocked(node);
    const invested = (Number(treeProgress[node.id]) || 0) > 0;
    return `<path class="skill-tree-edge ${unlocked ? 'is-unlocked' : ''} ${invested ? 'is-invested' : ''} ${node.rarity === 'legendary' ? 'is-legendary' : ''}" d="${skillTreeConnectorPath(from, to)}" />`;
  }).join('');
  const nodes = SKILL_TREE_NODE_LAYOUT.map(([id, x, y]) => {
    const selected = id === selectedId;
    const node = nodeData.get(id);
    const root = id === 'origin';
    const rank = Number(treeProgress[id]) || 0;
    const unlocked = root || (nodeIsUnlocked(node) && !legendaryIsBlocked(node));
    const iconInk = node.rarity === 'legendary' ? 'legendary' : unlocked ? 'normal' : 'muted';
    const icon = `<image class="node-icon-wrap" x="-16" y="-16" width="32" height="32" href="${escapeHtml(node.iconAsset)}" xlink:href="${escapeHtml(node.iconAsset)}" preserveAspectRatio="xMidYMid meet" filter="url(#skill-tree-icon-${iconInk})" aria-hidden="true"/>`;
    const nameLines = skillTreeNameLines(node.name, node.rarity === 'legendary' ? 10 : 18);
    const name = nameLines.map((line, index) => `<tspan x="0" dy="${index ? 15 : 0}">${escapeHtml(line)}</tspan>`).join('');
    return `<g class="skill-tree-node rarity-${node.rarity || 'common'} ${selected ? 'is-selected' : ''} ${root ? 'is-origin' : ''} ${rank ? 'is-invested' : ''} ${unlocked ? 'is-unlocked' : 'is-locked'}" transform="translate(${x} ${y})" role="button" tabindex="0" data-skill-node="${id}" aria-label="${escapeHtml(node.name)} · ${root ? 'Ausgangspunkt' : `${rank}/${node.maxPoints}`}" aria-pressed="${selected}"><polygon class="node-frame" points="-22,-28 22,-28 28,-22 28,22 22,28 -22,28 -28,22 -28,-22"/>${icon}${root ? '<text class="node-rank" x="58" y="4">START</text>' : `<text class="node-rank" x="0" y="45">${rank}/${node.maxPoints}</text><text class="node-name" x="0" y="64">${name}</text>`}</g>`;
  }).join('');
  const selectedNode = nodeData.get(selectedId) || nodeData.get('origin');
  const selectedRank = Number(treeProgress[selectedNode.id]) || 0;
  const unlocked = nodeIsUnlocked(selectedNode);
  const isLegendary = selectedNode.rarity === 'legendary';
  const legendaryBlocked = legendaryIsBlocked(selectedNode);
  const canInvest = selectedNode.id !== 'origin' && unlocked && !legendaryBlocked && availablePoints > 0 && selectedRank < selectedNode.maxPoints;
  const rarityLabels = { origin: 'STARTKNOTEN', common: 'GEWÖHNLICH', rare: 'SELTEN', legendary: 'LEGENDÄR' };
  const effectLabel = skillTreeEffectLabel(selectedNode, selectedRank, ownerClass);
  const maximumLabel = selectedNode.effect ? skillTreeEffectLabel(selectedNode, selectedNode.maxPoints, ownerClass) : 'Wähle einen Pfad';
  const branchLabels = GAME_CONFIG.skillTreeBranches.map((branch, index) => `<text class="skill-tree-branch-label" x="${75 + index * 150}" y="115">${escapeHtml(branch.label)}</text>`).join('');
  const themeButtons = renderPartyOwnerButtons(selectedSkillTreeOwner, 'skilltree');
  const investLabel = selectedNode.id === 'origin' ? 'AUSGANGSPUNKT'
    : selectedRank >= selectedNode.maxPoints ? 'MAXIMALER RANG'
      : legendaryBlocked ? 'ALTERNATIVE IM STRANG GEWÄHLT'
        : !unlocked ? 'KNOTEN GESPERRT'
          : availablePoints > 0 ? 'SKILLPUNKT INVESTIEREN' : 'KEIN SKILLPUNKT VERFÜGBAR';
  const investmentButtons = [1, 5, 10, 'max'].map(amount => {
    const enabled = canInvest && (amount === 'max' || (availablePoints >= amount && selectedNode.maxPoints - selectedRank >= amount));
    return `<button class="primary-button ui-control ui-button skill-tree-invest" type="button" data-allocate-skill-node="${selectedNode.id}" data-skill-owner="${ownerClass}" data-skill-points="${amount}" title="${escapeHtml(enabled ? 'Punkte in ' + selectedNode.name + ' investieren' : investLabel)}" aria-label="${amount === 'max' ? 'Maximal mögliche Punkte' : amount + ' Punkte'} investieren" ${enabled ? '' : 'disabled'}>${amount === 'max' ? 'MAX' : '+' + amount}</button>`;
  }).join('');
  const resetCost = Math.max(0, Number(BALANCE.skillTree.respecCost) || 1000000);
  const canRespec = spentPoints > 0 && state.souls >= resetCost;
  return `<div class="skill-tree-view" data-skill-tree-theme="${theme.id}"><div class="view-heading"><div><p class="eyebrow"><span></span> DEINE KAMPFGRUPPE</p><h1>Der <em>Skilltree</em></h1><p class="welcome-sub">Jede Stufe gibt einen Punkt, ohne Punkte-Limit. Startknoten haben 200 Ränge; maximal 10 Punkte im Vorgänger öffnen den nächsten Knoten.</p></div><div class="skill-tree-toolbar">${themeButtons}</div></div><div class="skill-tree-layout"><section class="skill-tree-board" aria-label="Talentbaum"><div class="skill-tree-board-points" aria-label="Verfügbare Skillpunkte"><div class="skill-tree-points"><strong>${availablePoints}</strong><span>VERF&Uuml;GBARE PUNKTE</span></div></div><svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" class="skill-tree-svg" viewBox="0 0 900 840" preserveAspectRatio="xMidYMid meet" role="group" aria-label="Talente und ihre Voraussetzungen"><defs>${[['normal', '#e6d3b4'], ['muted', '#817b78'], ['legendary', '#d9b66e']].map(([id, color]) => `<filter id="skill-tree-icon-${id}" x="-10%" y="-10%" width="120%" height="120%" color-interpolation-filters="sRGB"><feFlood flood-color="${color}"/><feComposite in2="SourceAlpha" operator="in"/></filter>`).join('')}</defs>${branchLabels}<g class="skill-tree-connections">${edges}</g><g class="skill-tree-nodes">${nodes}</g></svg><div class="skill-tree-legend"><span><i class="legend-muted"></i> GESPERRT</span><span><i class="legend-lit"></i> VERFÜGBAR</span><span><i class="legend-invested"></i> INVESTIERT</span><span><i class="legend-legendary"></i> LEGENDÄR · 1 PRO STRANG</span></div></section><aside class="skill-tree-detail character-panel-surface ${isLegendary ? 'is-legendary' : ''}"><p class="eyebrow">${rarityLabels[selectedNode.rarity] || 'TALENT'}</p><div class="skill-tree-detail-icon">${assetIconMarkup(selectedNode.iconAsset, '✦', 'skill-tree-detail-glyph')}</div><h2>${escapeHtml(selectedNode.name)}</h2><p>${escapeHtml(skillTreeDescription(selectedNode, ownerClass))}</p><div class="skill-tree-effect"><span>AKTUELLE WIRKUNG</span><strong>${escapeHtml(effectLabel)}</strong><small>Maximal: ${escapeHtml(maximumLabel)}</small></div><div class="skill-tree-detail-state"><span>RANG</span><strong>${selectedRank} / ${selectedNode.maxPoints}</strong><span>PUNKTE</span><strong>${availablePoints} frei · ${spentPoints} investiert</strong><span>VORAUSSETZUNG</span><strong>${selectedNode.class && selectedNode.class !== ownerClass ? 'NUR ' + escapeHtml(CLASSES[selectedNode.class].label).toUpperCase() : legendaryBlocked ? 'MAXIMAL EIN LEGEND&Auml;RER KNOTEN PRO STRANG' : unlocked ? 'FREIGESCHALTET' : `RANG ${skillTreeRequiredParentPoints(selectedNode)} IN „${escapeHtml(nodeData.get(selectedNode.parent)?.name || 'VORHERIGER KNOTEN')}“`}</strong></div><div class="skill-tree-invest-actions">${investmentButtons}</div><button class="primary-button ui-control ui-button skill-tree-respec" type="button" data-skill-tree-respec="${ownerClass}" ${canRespec ? '' : 'disabled'}>ALLE PUNKTE ZURÜCKSETZEN · ${number(resetCost)} SEELEN</button></aside></div></div>`;
}

function compactQuestCopy(quest) {
  const target = number(quest.target);
  const deep = quest.minimumDeepTier ? `Deep of Dark ${quest.minimumDeepTier}` : 'Grenzgebiete';
  const rank = BALANCE.bossChallenge.rankThresholds[quest.target - 1]?.name || target;
  const entries = {
    monsters: [`${target} Gegner besiegen`, deep],
    champions: [`${target} Champions besiegen`, quest.minimumDeepTier ? deep : 'Gebiete oder Turm'],
    areaReached: [`In ${AREAS.find(area => area.id === quest.areaId)?.name || quest.areaId} siegen`, 'Einen Kampf gewinnen'],
    upgradeStoneDrops: ['Aufwertungsstein finden', 'Im Turm als Beute wählen'],
    socketStoneDrops: ['Sockelstein finden', 'Im Turm als Beute wählen'],
    affixStoneDrops: [`${target} Umprägungsstein finden`, 'Im Turm als Beute wählen'],
    gemDrops: [`${target} Edelstein finden`, 'Im Turm als Beute wählen'],
    mainPetLevel: [`Main-Tier auf Stufe ${target}`, 'Tier des Mains am Altar leveln'],
    companionPetLevel: [`Gefährten-Tier auf Stufe ${target}`, 'Tier des aktiven Gefährten am Altar leveln'],
    partyPetLevel: [`Beide Tiere auf Stufe ${target}`, 'Begleittiere am Altar separat leveln'],
    mainSkillPoints: [`${target} Skillpunkte verteilen`, 'Im Skilltree des Mains'],
    partySkillPoints: [`Je ${target} Skillpunkte verteilen`, 'Main und aktiver Gefährte · bereits investierte Punkte zählen'],
    petAffixesRerolled: ['Tieraffix umprägen', `${target} Umprägung beim Verzauberer · Begleittier`],
    equipmentAffixesRerolled: ['Ausrüstungsaffix umprägen', `${target} Umprägung auf angelegter Ausrüstung`],
    raritiesUpgraded: ['Seltenheit erhöhen', `${target} Seltenheitserhöhung beim Verzauberer`],
    forges: ['Ausrüstung aufwerten', `${target} erfolgreiche Aufwertung${quest.target === 1 ? '' : 'en'} in der Schmiede`],
    socketsOpened: ['Sockelplatz öffnen', `${target} erfolgreiche Öffnung${quest.target === 1 ? '' : 'en'}`],
    weaponSockets: [`Waffe mit ${target} Sockel${quest.target === 1 ? '' : 'n'} tragen`, quest.filled ? 'Klassenwaffe · Sockel mit Edelsteinen belegt' : 'Klassenwaffe · geöffnete Sockelplätze'],
    gemsSocketed: ['Edelstein einsetzen', `${target} Edelstein${quest.target === 1 ? '' : 'e'} in Ausrüstung einsetzen`],
    mainLevel: [`Main auf Stufe ${target} bringen`, 'Am Altar der Dunkelheit'],
    companionLevel: [`Gefährten auf Stufe ${target} bringen`, 'Am Altar der Dunkelheit'],
    partyLevel: [`Beide Helden auf Stufe ${target}`, 'Main und aktiver Gefährte'],
    partyLevelGain: [`Beide Helden um ${target} Stufen stärken`, 'Zusätzliche Stufen seit Gruppenbeginn'],
    tower: [`${target} Turmrunden in einem Durchlauf`, 'Persönlicher Rundenrekord'],
    towerRounds: [`${target} Turmrunden gewinnen`, 'Zusammengezählt ab Gruppenbeginn'],
    towerBosses: [`${target} Turmbosse besiegen`, 'Turm des Namenlosen'],
    bossRank: [`${rank} erreichen`, 'Bossprüfung'],
    deepTier: [`Deep of Dark ${target} erreichen`, 'Die nächste Schwierigkeitsstufe freischalten'],
    affixesRerolled: ['Affix umprägen', `${target} Umprägung${quest.target === 1 ? '' : 'en'} beim Verzauberer`],
    armorUpgrade: [`Rüstung auf +${target} bringen`, quest.scope === 'both' ? 'Alle vier Rüstungsteile beider Helden' : 'Alle vier Rüstungsteile eines Helden'],
    weaponsUpgrade: [`Waffen auf +${target} bringen`, 'Klassenwaffen beider Helden'],
    greaterDrops: [`${target} Greater-Gegenstände finden`, 'Beute mit mindestens einem Greater Affix'],
    nonQuestSoulsEarned: [`${target} Seelen verdienen`, 'Ohne Auftragsbelohnungen · seit Gruppenbeginn'],
  };
  const [title, hint] = entries[quest.type] || [quest.title, quest.description];
  return { title, hint: quest.description || hint };
}
function compactQuestReward(reward) {
  const rarity = RARITIES.find(entry => entry.color === reward.rarity)?.name || '';
  const owner = reward.owner === 'main' ? 'Main' : 'aktiver Gefährte';
  const greater = reward.greaterAffixes ? ` · ✦ ${reward.greaterAffixes} Greater Affixe${reward.type === 'setBundle' ? ' je Teil' : ''}` : '';
  if (reward.type === 'setBundle') return { title: `${rarity} ${reward.classBound ? 'Klassen-' : 'generisches '}${reward.kind === 'armor' ? 'Rüstungsset' : 'Schmuckset'}`, detail: `${reward.kind === 'armor' ? 4 : 5} Teile${reward.classBound ? ` · ${owner}` : ''}${greater}`, slot: reward.kind === 'armor' ? 'helmet' : 'amulet' };
  if (reward.type === 'classWeapon') return { title: `${rarity} Klassenwaffe`, detail: `${owner}${greater}`, slot: CLASS_WEAPONS[reward.owner === 'main' ? state.mainClass : state.activeCompanion]?.[0] };
  if (reward.type === 'itemBundle') return { title: reward.label || 'Materialien', detail: reward.label ? '' : reward.items.map(codexRewardLabel).join(' · '), slot: reward.items[0]?.slot };
  if (reward.type === 'souls') return { title: `${number(reward.min)}${reward.max !== reward.min ? `–${number(reward.max)}` : ''} Seelen`, detail: 'Vor Welt-Eventbonus' };
  if (reward.type === 'luckyBundle') return { title: `Jede Luckybox ×${reward.quantity}`, detail: 'Glyphe und VIP', slot: 'glyphBox' };
  if (reward.type === 'gemBundle') return { title: `Jeder Edelsteintyp ×${reward.quantity}`, detail: `Alle ${GEM_PROFILES.length} Typen`, slot: 'weaponGem' };
  return { title: codexRewardLabel(reward), detail: '', slot: reward.slot || reward.group || reward.item?.kind };
}
function questRewardDescriptionMarkup(reward) {
  const summary = compactQuestReward(reward);
  let details = `<p>${escapeHtml(codexRewardLabel(reward))}</p>`;
  if (reward.type === 'setBundle') {
    const definitions = reward.kind === 'armor' ? ARMOR_SETS : JEWELRY_SETS;
    const owner = reward.owner === 'companion' ? state.activeCompanion : state.mainClass;
    const match = Object.entries(definitions).find(([, definition]) => reward.classBound ? definition.class === owner : !definition.class);
    if (match) details += `<p>${escapeHtml(match[0])} · ${escapeHtml(CLASSES[match[1].class]?.label || 'Alle Klassen')}</p>` + match[1].bonuses.map(bonus => `<p><b>${bonus.pieces}/${reward.kind === 'armor' ? 4 : 5}</b> · ${escapeHtml(setBonusDescription(bonus))}</p>`).join('');
    details += '<p>Die Werte der einzelnen Setteile werden beim Abholen ausgewürfelt.</p>';
  } else if (['classWeapon', 'equipment', 'setItem', 'starterArmor', 'gem'].includes(reward.type)) {
    details += '<p>Die konkreten Gegenstandswerte werden beim Abholen ausgewürfelt.</p>';
  } else if (reward.type === 'gemBundle') {
    details += `<p>Enthält alle ${GEM_PROFILES.length} Edelsteinprofile in Legendär mit festen Werten.</p>`;
  } else if (reward.type === 'luckyBundle') {
    details += '<p>Enthält Glyphen-Luckyboxen und VIP-Luckyboxen.</p>';
  }
  return `<div class="tooltip-rarity ${escapeHtml(reward.rarity || 'common')}">AUFTRAGSBELOHNUNG</div><strong class="tooltip-name">${escapeHtml(summary.title)}</strong><div class="tooltip-special">${details}</div>`;
}
function renderQuestRewardPreview(reward, key) {
  if (reward.type === 'itemBundle') return `<div class="quest-reward-items">${reward.items.map((entry, index) => renderQuestRewardPreview(entry, `${key}.${index}`)).join('')}</div>`;
  const summary = compactQuestReward(reward);
  const concrete = ['material', 'luckyBox'].includes(reward.type);
  const item = concrete ? makeQuestBoardReward(state, reward) : null;
  questRewardPreviews.set(key, { item, reward });
  const icon = equipmentIconMarkup(item?.slot || summary.slot, item?.icon || '✧', 'item-icon');
  return `<button type="button" class="inventory-item ui-control ui-graphic quest-reward-item ${item?.rarityColor || reward.rarity || 'common'}" data-quest-reward="${key}" aria-label="${escapeHtml(item?.name || summary.title)} · Belohnung ansehen">${icon}${item && item.quantity > 1 ? `<span class="item-stack-count">${number(item.quantity)}</span>` : ''}</button>`;
}
function renderUnifiedContracts() {
  questRewardPreviews.clear();
  const board = state.questBook.board;
  const completed = board.tasks.filter(entry => entry.claimed).length;
  const count = board.tasks.length;
  const cards = board.tasks.map((entry, index) => {
    const progress = questBoardProgress(state, entry.quest);
    const target = entry.quest.target;
    const done = progress >= target;
    const ready = done && !entry.claimed;
    const copy = compactQuestCopy(entry.quest);
    const reward = compactQuestReward(entry.reward);
    const currentRank = BALANCE.bossChallenge.rankThresholds[state.bossChallenge?.highestRank]?.name || 'Noch kein Rang';
    const progressText = entry.quest.type === 'bossRank'
      ? `${currentRank} → ${BALANCE.bossChallenge.rankThresholds[target - 1]?.name || target}`
      : `${number(progress)} / ${number(target)}`;
    const icon = renderQuestRewardPreview(entry.reward, String(index));
    return `<article class="compact-quest-card ${entry.claimed ? 'is-claimed' : ready ? 'is-ready' : 'is-open'}">
      <header><span class="compact-quest-number">${String(index + 1).padStart(2, '0')}</span><span class="compact-quest-status">${entry.claimed ? 'ABGEHOLT' : ready ? 'BELOHNUNG BEREIT' : 'IN ARBEIT'}</span></header>
      <div class="compact-quest-objective"><h2>${escapeHtml(copy.title)}</h2><p>${escapeHtml(copy.hint)}</p></div>
      <div class="compact-quest-progress"><span>${escapeHtml(progressText)}</span><div class="compact-quest-meter" role="progressbar" aria-label="${escapeHtml(copy.title)}" aria-valuemin="0" aria-valuemax="${target}" aria-valuenow="${progress}" aria-valuetext="${escapeHtml(progressText)}"><i style="width:${Math.min(100, Math.max(0, progress / target * 100))}%"></i></div></div>
      <div class="compact-quest-reward">${icon}<div><strong>${escapeHtml(reward.title)}</strong>${reward.detail ? `<small>${escapeHtml(reward.detail)}</small>` : ''}</div></div>
      <button class="primary-button ui-control ui-button compact-quest-claim" type="button" data-claim-board-task="${index}" ${ready ? '' : 'disabled'}>${entry.claimed ? '✓ BEREITS ABGEHOLT' : ready ? 'BELOHNUNG ABHOLEN' : 'NOCH OFFEN'}</button>
    </article>`;
  }).join('');
  const groupTitle = QUEST_BOARD.fixedGroups[board.groupIndex]?.title || 'Neue Herausforderungen der Grenzwacht';
  return `<section class="compact-contracts-view"><div class="view-heading"><div><p class="eyebrow"><span></span> DEIN FORTLAUFENDER WEG</p><h1>Aufträge der <em>Grenzwacht</em></h1><p class="welcome-sub">Erf&uuml;lle sechs Ziele, sichere dir Belohnungen und &ouml;ffne den n&auml;chsten Abschnitt.</p></div></div>
    <header class="compact-quest-group"><span class="compact-group-icon" aria-hidden="true">${assetIconMarkup('Assets/Icons/000000/transparent/1x1/lorc/rally-the-troops.svg', '⚑', 'compact-group-glyph')}</span><div><p class="eyebrow">AUFTRAGSGRUPPE ${String(board.groupIndex + 1).padStart(2, '0')}</p><h2>${escapeHtml(groupTitle)}</h2></div><div class="compact-group-progress"><span>${completed} / ${count} abgeholt</span><div class="compact-quest-meter" role="progressbar" aria-label="Belohnungen abgeholt" aria-valuemin="0" aria-valuemax="${count}" aria-valuenow="${completed}"><i style="width:${completed / count * 100}%"></i></div></div></header>
    <div class="compact-quest-grid">${cards}</div></section>`;
}
function towerAttemptSummary() {
  const summary = `Versuche heute: ${dailyAttemptLabel('tower')}`;
  return isMobileLayout() ? summary : `${summary} · Erneuerung um 00:00 Uhr (${BALANCE.dailyAttempts.timeZone})`;
}
function renderCurrentTower() {
  const unlocked = towerUnlocked(state);
  const towerStats = towerEncounterStats(state, battle?.mode === 'tower' ? battle.towerRound : 1);
  const lootOptions = BALANCE.loot.towerLootChoices.map(choice => `<option value="${escapeHtml(choice.id)}" ${state.settings.towerLoot === choice.id ? 'selected' : ''}>${escapeHtml(choice.label)} (${formatRuleNumber(towerLootChance(choice))} %)</option>`).join('');
  const towerAttempts = dailyAttemptStatus('tower');
  const startControls = unlocked
    ? `<button class="primary-button ui-control ui-button boss-start-button tower-start" type="button" data-start-tower ${!towerAttempts.remaining || battle ? 'disabled' : ''}>${towerAttempts.remaining ? 'TURM BETRETEN' : 'KEINE VERSUCHE MEHR'}</button>`
    : '<button class="primary-button ui-control ui-button boss-start-button tower-start" type="button" data-open-view="contracts">AUFTRÄGE ÖFFNEN</button>';
  return `<div class="view-heading tower-view-heading"><div><p class="eyebrow"><span></span> ENDLOSER MODUS</p><h1>Turm des <em>Namenlosen</em></h1><p class="welcome-sub">Kämpfe endlos und sammle gezielt die Beute deiner Wahl.</p></div></div>
    <section class="boss-challenge-card tower-challenge-card ${unlocked ? '' : 'is-locked'}">
      <div class="boss-challenge-art tower-challenge-art"><div class="boss-challenge-visual"><img class="boss-portrait" src="Assets/Art/battle/runtime/chain-archon-front/chain-archon-front-idle.png" alt="Archont der Ketten vor der Kettenkathedrale im Turm des Namenlosen"></div></div>
      <div class="boss-challenge-copy">
        <p class="eyebrow">${unlocked ? 'ARCHONT DER KETTEN' : 'VERSIEGELT · AUFTRÄGE'}</p>
        <p class="tower-description"><span class="tower-desktop-copy">${unlocked ? 'Deine Gruppe kämpft automatisch ohne Etagenbegrenzung. Gegnerleben, Schaden und Seelen richten sich nach der höheren Stufe von Main und Gefährte. Jede zehnte Runde erwartet dich der Archont der Ketten.' : 'Schließe die erste Auftragsgruppe ab, um den Turm zu öffnen.'}</span><span class="tower-mobile-copy">${unlocked ? 'Endlose Auto-Kämpfe. Jede zehnte Runde stellt sich dir der Archont.' : 'Schließe die erste Auftragsgruppe ab, um den Turm zu öffnen.'}</span></p>
        <div class="boss-challenge-facts"><div class="tower-hero-level"><small>TURMRUNDE</small><strong>Runde ${number(towerStats.round)}</strong></div><div><small>GRUND-LEBEN PRO GEGNER</small><strong>${number(towerStats.health)} LP</strong></div></div>
        <p data-daily-attempts="tower">${escapeHtml(towerAttemptSummary())}</p>
        <div class="tower-entry-actions">
          <label class="tower-loot-choice"><span>BEUTE WÄHLEN</span><select class="ui-control ui-select" data-tower-loot>${lootOptions}</select><small class="tower-loot-progression" data-tower-loot-progression>${escapeHtml(towerLootProgressLabel())}</small></label>
          ${startControls}
        </div>
        <a class="ui-control ui-link codex-panel-link" href="#codex-tower" data-open-codex-section="codex-tower">TURMREGELN IM KODEX</a>
      </div>
    </section>`;
}

function formatBossCooldown(remaining) {
  const seconds = Math.ceil(remaining / 1000);
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`;
}
function renderBossChallenge() {
  const rules = BALANCE.bossChallenge;
  const remaining = !dailyAttemptStatus('boss').remaining;
  const cooldownLabel = dailyAttemptLabel('boss');
  const rankRules = rules.rankThresholds || [];
  const highestRank = rankRules[state.bossChallenge?.highestRank ?? -1] || null;
  return `<div class="view-heading boss-view-heading"><div>
      <p class="eyebrow"><span></span> EINMALIGE GELEGENHEIT</p>
      <h1><span class="boss-heading-prefix">Pr&uuml;fung: </span><em><span class="boss-title-neutral">Schatten der </span>Dunkelheit</em></h1>
      <p class="welcome-sub">F&uuml;ge dem Schatten der Dunkelheit innerhalb von ${rules.durationSeconds} Sekunden so viel Schaden wie m&ouml;glich zu. Er kann nicht besiegt werden.</p>
    </div></div>
    <section class="boss-challenge-card boss-entry-card">
      <div class="boss-challenge-art"><div class="boss-challenge-visual"><img class="boss-portrait" src="Assets/Art/battle/runtime/shadow-of-darkness/shadow-of-darkness-front.png" alt="Schatten der Dunkelheit"></div></div>
      <div class="boss-challenge-copy">
        <p class="eyebrow">SCHATTEN DER DUNKELHEIT</p>
        <p class="boss-entry-description"><span class="boss-desktop-copy">Deine Gruppe greift automatisch an. Dein Schaden bestimmt den Rang. Du erh&auml;ltst je ${rules.luckyBoxesPerRank.join('&ndash;')} Glyphen- und VIP-Luckyboxen &times; Rangstufe &times; Subrang (Bronze = 1, Silber = 2 usw.). Dazu kommen ${number(rules.soulsPerRank || 1000)} Seelen pro erreichtem Subrang.</span><span class="boss-mobile-copy">Auto-Kampf: Dein Schaden bestimmt Rang und Belohnung.</span></p>
        <div class="boss-challenge-facts">
          <div><small>KAMPFDAUER</small><strong>${rules.durationSeconds} Sekunden</strong></div>
          <div><small>VERSUCHE HEUTE</small><strong id="boss-cooldown">${cooldownLabel}</strong></div>
        </div>
        <button class="primary-button ui-control ui-button boss-start-button" type="button" data-start-boss ${remaining ? 'disabled' : ''}>${remaining ? 'KEINE VERSUCHE MEHR' : 'BOSS HERAUSFORDERN'}</button>
        <p class="boss-renewal-note">Erneuerung um 00:00 Uhr (${escapeHtml(BALANCE.dailyAttempts.timeZone)})</p>
        <div class="boss-rank-inline"><div class="boss-record-summary">
          <div><small><span class="boss-desktop-copy">PERSÖNLICHER SCHADENSREKORD</span><span class="boss-mobile-copy">SCHADENSREKORD</span></small><strong>${state.bossChallenge?.bestDamage > 0 ? number(state.bossChallenge.bestDamage) : 'Noch nicht erfasst'}</strong></div>
          <div><small><span class="boss-desktop-copy">H&Ouml;CHSTER ERREICHTER RANG</span><span class="boss-mobile-copy">BESTER RANG</span></small><strong>${bossRankBadge(highestRank, highestRank?.name || 'Noch nicht erreicht')}</strong></div>
        </div></div>
        <a class="ui-control ui-link codex-panel-link" href="#codex-boss-challenge" data-open-codex-section="codex-boss-challenge">RANGSTUFEN IM KODEX</a>
      </div>
    </section>`;
}
function updateBossCooldownView() {
  for (const mode of ['boss', 'tower']) {
    const button = document.querySelector(mode === 'boss' ? '[data-start-boss]' : '[data-start-tower]');
    const label = document.querySelector(mode === 'boss' ? '#boss-cooldown' : '[data-daily-attempts="tower"]');
    if (label) label.textContent = mode === 'boss' ? dailyAttemptLabel(mode) : towerAttemptSummary();
    if (!button) continue;
    const available = dailyAttemptStatus(mode).remaining > 0;
    button.disabled = Boolean(battle) || !available;
    button.textContent = battle ? 'KAMPF LÄUFT' : !available ? 'KEINE VERSUCHE MEHR' : mode === 'boss' ? 'BOSS HERAUSFORDERN' : 'TURM BETRETEN';
    delete button.dataset.mobileActionCopy;
    syncMobilePageLabels(button);
  }
}
function rarityDistributionForArea(index) {
  const weights = rarityWeightsForAreaIndex(index, state);
  const total = Object.values(weights).reduce((sum, weight) => sum + weight, 0) || 100;
  return RARITIES
    .filter((rarity) => (weights[rarity.color] || 0) > 0)
    .map((rarity) => `${escapeHtml(rarity.name)} ${Math.round(weights[rarity.color] / total * 100)} %`)
    .join(' · ');
}
function altarUpgradeQuote(className, requested = 1) {
  const level = characterLevel(className);
  let max = 0, total = 0;
  while (max < 10000 && total + groupLevelCost(level + max) <= state.souls) {
    total += groupLevelCost(level + max++);
  }
  const amount = max ? Math.max(1, Math.min(max, Math.floor(Number(requested) || 1))) : 0;
  let cost = 0;
  for (let i = 0; i < amount; i++) cost += groupLevelCost(level + i);
  return { level, max, amount, cost };
}
function renderAltarStatPreview(className, amount) {
  const before = getStats(className);
  const preview = { ...state, characterLevels: { ...state.characterLevels, [className]: characterLevel(className) + amount } };
  if (className === state.mainClass) preview.level = preview.characterLevels[className];
  const after = getStats(className, preview);
  return ['Lebenskraft', 'Angriff', 'Verteidigung'].map((stat) => `<div class="altar-stat-row"><span>${stat}</span><span>${number(before[stat])}</span><i aria-hidden="true">→</i><strong>${number(after[stat])}</strong></div>`).join('');
}
function renderLevelOffering(className, ownerType) {
  const info = CLASSES[className];
  const quote = altarUpgradeQuote(className);
  return `<article class="altar-inspector" aria-label="Aufstiegsvorschau">
    <header class="altar-inspector-heading"><span class="altar-inspector-icon">${assetIconMarkup(info.asset, info.icon, 'altar-class-icon')}</span><div><h2>${escapeHtml(info.label)}</h2><p>${ownerType === 'main' ? 'HAUPTKLASSE' : 'GEFÄHRTE'}</p></div></header>
    <div class="altar-level-preview"><span>Stufe ${number(quote.level)}</span><i aria-hidden="true">→</i><strong data-level-target="${className}">Stufe ${number(quote.level + quote.amount)}</strong></div>
    <div class="altar-stat-preview" data-altar-stats="${className}">${renderAltarStatPreview(className, quote.amount)}</div>
    <div class="altar-controls"><label for="altar-quantity-${ownerType}">Stufen</label><input class="ui-control ui-field ui-compact" id="altar-quantity-${ownerType}" type="number" min="${quote.max ? 1 : 0}" max="${quote.max}" step="1" value="${quote.amount}" data-altar-quantity="${className}" ${quote.max ? '' : 'disabled'}>
    <div class="altar-presets" role="group" aria-label="Anzahl der Stufen">${['1','10','max'].map((value) => `<button class="ui-control ui-button ui-compact" type="button" data-altar-preset="${value}" ${quote.max ? '' : 'disabled'}>${value === 'max' ? 'Max' : value}</button>`).join('')}</div>
    <p class="altar-feedback" data-altar-feedback>${quote.max ? '' : `Für die nächste Stufe fehlen ${number(Math.max(0, groupLevelCost(quote.level) - state.souls))} Seelen.`}</p>
    <div class="altar-total"><span>Kosten</span><strong data-level-cost="${className}">✧ ${number(quote.cost)} Seelen</strong></div></div>
    <button class="primary-button ui-control ui-button altar-ascend-button" type="button" data-level-up="${className}" ${quote.max ? '' : 'disabled'}>AUFSTUFEN</button>
  </article>`;
}
function renderAltar() {
  const pets = partyPets();
  const petSelected = selectedAltarOwner === 'pet';
  const className = selectedAltarOwner === state.activeCompanion ? state.activeCompanion : state.mainClass;
  const mainSelected = className === state.mainClass;
  const members = [{ className: state.mainClass, owner: 'main', label: 'HAUPTKLASSE' }, ...(state.activeCompanion ? [{ className: state.activeCompanion, owner: state.activeCompanion, label: 'GEFÄHRTE' }] : [])];
  return `<section class="altar-ritual-view ${className}"><div class="view-heading"><div><p class="eyebrow"><span></span> DEIN UNTERSCHLUPF</p><h1>Altar der <em>Dunkelheit</em></h1><p class="welcome-sub">St&auml;rke deinen Main, deinen Gef&auml;hrten und ihre Begleittiere mit gesammelten Seelen.</p></div></div>
    <div class="altar-selection-layout mobile-inventory-owners"><div class="altar-character-tabs" role="group" aria-label="Helden auswählen">${members.map((member) => `<button type="button" class="altar-character-tab party-owner-button ui-control ui-card-choice ${!petSelected && member.className === className ? 'is-selected' : ''}" data-party-owner="${member.owner}" data-party-context="altar" aria-pressed="${!petSelected && member.className === className}"><span class="altar-tab-portrait"><img src="Assets/Art/battle/runtime/${member.className}/${member.className}-idle.png" alt="">${assetIconMarkup(CLASSES[member.className].asset, CLASSES[member.className].icon, 'altar-tab-mobile-icon')}</span><span><strong>${escapeHtml(CLASSES[member.className].label)}</strong><small>${member.label}</small></span><span class="altar-tab-level">Stufe ${number(characterLevel(member.className))}</span><i aria-hidden="true"></i></button>`).join('')}</div><div class="altar-character-tabs" role="group" aria-label="Begleittiere auswählen">${pets.map(pet => `<button type="button" class="altar-character-tab party-owner-button ui-control ui-card-choice ${petSelected && pet.ownerClass === selectedAltarPet()?.ownerClass ? 'is-selected' : ''}" data-altar-pet="${pet.ownerClass}" aria-pressed="${petSelected && pet.ownerClass === selectedAltarPet()?.ownerClass}"><span class="altar-tab-portrait altar-pet-tab-icon">${petAltarTabPortrait(pet)}</span><span><strong>${escapeHtml(pet.name)}</strong><small>${pet.ownerClass === state.mainClass ? 'MAIN' : 'GEF&Auml;HRTE'} &middot; BEGLEITTIER</small></span><span class="altar-tab-level">Stufe ${number(pet.level)}</span><i aria-hidden="true"></i></button>`).join('')}</div></div>
    <div class="altar-ritual-layout">${petSelected ? renderPetAltarStage() : `<div class="altar-hero-stage"><div class="altar-floor-glow" aria-hidden="true"></div><img class="altar-hero-portrait" src="Assets/Art/battle/runtime/${className}/${className}-idle.png" alt="${escapeHtml(CLASSES[className].label)} am Altar" draggable="false"></div>`}${petSelected ? renderPetOffering() : renderLevelOffering(className, mainSelected ? 'main' : 'companion')}</div>
  </section>`;
}
