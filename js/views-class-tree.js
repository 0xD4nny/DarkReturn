function classTreeOwner() {
  return selectedSkillTreeOwner === 'main' ? state.mainClass : state.activeCompanion;
}
function classNodePreview(node, rank, owner) {
  if (!node.ability) return skillTreeEffectLabel(node, rank + (rank > 0 ? mythicTreeBonusRanks(owner) : 0), owner);
  const progress = { ...(state.skillTree?.[owner]?.nodes || {}) };
  const base = classSkillNode(owner, node.ability.skillId);
  if (node.ability.variantId) {
    progress[base.id] = base.maxPoints;
    SKILL_TREE_NODES.filter(other => other.exclusiveGroup === node.exclusiveGroup).forEach(other => delete progress[other.id]);
    progress[node.id] = rank;
  } else progress[node.id] = rank;
  const preview = { ...state, skillTree: { ...state.skillTree, [owner]: { nodes: progress } } };
  const skill = COMPANION_SKILLS[owner][node.ability.kind].find(entry => entry.id === node.ability.skillId);
  return skillDescription(empoweredClassSkill(skill, owner, preview));
}
function renderClassTreeDetail(selected, owner, ranks, available, byId) {
  const origin = selected.id === 'origin';
  const rank = ranks[selected.id] || 0;
  const gearBonus = rank > 0 ? mythicTreeBonusRanks(owner) : 0;
  const activeBase = selected.ability?.kind === 'active' && !selected.ability.variantId;
  const blocked = classSkillChoiceBlockedReason(selected, ranks, owner);
  const unlocked = skillTreeNodeUnlocked(selected, ranks, owner);
  const canInvest = selected.maxPoints > rank && unlocked && !blocked && available > 0;
  const refund = skillTreeNodeRespecQuote(owner, selected.id);
  const kind = origin ? 'KLASSENBAUM' : selected.ability
    ? selected.ability.variantId ? 'SPEZIALISIERUNG' : selected.ability.kind === 'passive' ? 'PASSIVE FÄHIGKEIT' : 'AKTIVE FÄHIGKEIT'
    : selected.rarity === 'legendary' ? 'SCHLÜSSELKNOTEN' : 'KLASSENTALENT';
  const description = origin ? 'Wähle einen Knoten im Baum, um seine Wirkung anzusehen und Punkte zu verteilen.'
    : selected.ability?.variantId ? selected.description : selected.ability
      ? activeBase ? 'Von Anfang an verfügbar. Jeder investierte Punkt verstärkt die Fähigkeit; nach zehn Punkten wählst du eine Spezialisierung.'
        : 'Baue diese Passive aus und wähle nach zehn Punkten eine Spezialisierung. Du kannst eine Passive gleichzeitig nutzen.'
      : skillTreeDescription(selected, owner);
  const status = blocked || (!unlocked ? `Benötigt Rang ${skillTreeRequiredParentPoints(selected)} in ${byId.get(selected.parent)?.name || 'dem Vorgänger'}.`
    : rank >= selected.maxPoints ? 'Vollständig ausgebaut' : !available ? 'Keine freien Skillpunkte' : 'Bereit zum Verstärken');
  const effects = origin
    ? `<dl class="skill-tree-overview"><div><dt>Freie Punkte</dt><dd>${number(available)}</dd></div><div><dt>Investierte Punkte</dt><dd>${number(spentSkillTreePoints(owner))}</dd></div></dl>`
    : `<div class="skill-tree-effect"><div class="skill-tree-effect-current"><span>${activeBase ? 'AKTUELLE VERSTÄRKUNG' : 'AKTUELLE WIRKUNG'}</span><strong>${escapeHtml(rank || activeBase ? classNodePreview(selected, rank, owner) : 'Noch nicht gelernt')}</strong></div>${rank < selected.maxPoints ? `<div class="skill-tree-effect-max"><span>BEI VOLLEM AUSBAU</span><small>${escapeHtml(classNodePreview(selected, selected.maxPoints, owner))}</small></div>` : ''}</div>
      <div class="skill-tree-invest-heading"><span>Punkte investieren</span><small>${escapeHtml(status)}</small></div>
      <div class="skill-tree-invest-actions">${[1, 5, 10, 'max'].map(amount => {
        const points = amount === 'max' ? Math.min(available, selected.maxPoints - rank) : amount;
        return `<button type="button" class="primary-button ui-control ui-button skill-tree-invest" data-allocate-skill-node="${selected.id}" data-skill-owner="${owner}" data-skill-points="${amount}" ${!canInvest || points < 1 || points > available || points > selected.maxPoints - rank ? 'disabled' : ''}>${amount === 'max' ? 'MAX' : `+${amount}`}</button>`;
      }).join('')}</div>`;
  const refundNote = refund.nodes.length ? `${refund.refundedPoints} Punkte werden frei.${refund.nodes.length > 1 ? ' Einschließlich: ' + refund.nodes.filter(node => node.id !== selected.id).map(node => node.name).join(', ') + '.' : ''}` : '';
  return `<aside class="skill-tree-detail character-panel-surface ${origin ? 'is-overview' : ''} ${selected.rarity === 'legendary' ? 'is-legendary' : ''}">
    <header class="skill-tree-detail-heading"><div class="skill-tree-detail-icon">${assetIconMarkup(origin ? CLASSES[owner].asset : selected.iconAsset, '✦', 'skill-tree-detail-glyph')}</div><div><p class="eyebrow">${kind}</p><h2>${escapeHtml(origin ? CLASSES[owner].label : selected.name)}</h2>${origin ? '' : `<span class="skill-tree-rank-badge">${activeBase ? 'Verstärkung' : 'Rang'} <strong>${rank}</strong> / ${selected.maxPoints}</span>`}</div></header>
    <p class="skill-tree-detail-description">${escapeHtml(description)}</p>${gearBonus ? `<p class="rarity-mythic skill-tree-equipment-bonus">+${gearBonus} Ränge durch mystische Ausrüstung · effektiver Knotenrang ${rank + gearBonus}</p>` : ''}${effects}
    <section class="skill-tree-reset-section" aria-label="Skillpunkte zurücksetzen"><p class="skill-tree-reset-heading">Punkte neu verteilen</p><div class="skill-tree-respec-actions">
      ${origin ? '' : `<button type="button" class="secondary-button ui-control ui-button" data-skill-tree-node-respec="${selected.id}" data-skill-owner="${owner}" ${!refund.nodes.length || state.souls < refund.cost ? 'disabled' : ''}><span>Knoten zurücksetzen</span><small>${number(refund.cost)} Seelen</small></button>`}
      <button type="button" class="secondary-button ui-control ui-button" data-skill-tree-respec="${owner}" ${!spentSkillTreePoints(owner) || state.souls < BALANCE.skillTree.respecCost ? 'disabled' : ''}><span>Gesamten Baum zurücksetzen</span><small>${number(BALANCE.skillTree.respecCost)} Seelen</small></button>
    </div>${refundNote ? `<p class="skill-tree-refund-note">${escapeHtml(refundNote)}</p>` : ''}</section>
  </aside>`;
}
function renderOwnClassSkillTree() {
  const owner = classTreeOwner();
  const theme = SKILL_TREE_THEMES.find(entry => entry.classId === owner);
  const visible = SKILL_TREE_NODES.filter(node => node.id === 'origin' || node.class === owner);
  const byId = new Map(visible.map(node => [node.id, node]));
  const selected = byId.get(selectedSkillTreeNodeId) || visible[0];
  const ranks = state.skillTree?.[owner]?.nodes || {};
  const available = Math.max(0, earnedSkillTreePoints(owner) - spentSkillTreePoints(owner));
  const edges = visible.filter(node => node.parent && byId.has(node.parent)).map(node => {
    const [x, y] = byId.get(node.parent).position;
    const [tx, ty] = node.position;
    const dx = tx - x, dy = ty - y;
    const bend = node.ability?.variantId ? .12 : -.18;
    const cx = (x + tx) / 2 - dy * bend, cy = (y + ty) / 2 + dx * bend;
    return `<path class="skill-tree-edge ${node.rarity === 'legendary' ? 'is-keystone-path' : ''} ${skillTreeNodeUnlocked(node, ranks, owner) ? 'is-unlocked' : ''} ${ranks[node.id] ? 'is-invested' : ''}" d="M ${x} ${y} Q ${cx} ${cy} ${tx} ${ty}"/>`;
  }).join('');
  const nodes = visible.map(node => {
    const root = node.id === 'origin', rank = ranks[node.id] || 0;
    const radius = root ? 32 : node.ability && !node.ability.variantId ? 26 : node.rarity === 'legendary' ? 26 : node.ability ? 20 : 16;
    const unlocked = root || skillTreeNodeUnlocked(node, ranks, owner);
    const ink = node.rarity === 'legendary' ? 'legendary' : unlocked ? 'normal' : 'muted';
    const asset = root ? CLASSES[owner].asset : node.iconAsset;
    const [x,y] = node.position;
    const name = root ? CLASSES[owner].label : node.name;
    return `<g class="skill-tree-node rarity-${node.rarity} ${root ? 'is-origin' : ''} ${node.ability ? 'is-ability-node' : 'is-stat-node'} ${rank ? 'is-invested' : ''} ${unlocked ? 'is-unlocked' : 'is-locked'} ${selected.id === node.id ? 'is-selected' : ''}" transform="translate(${x} ${y})" role="button" tabindex="0" data-skill-node="${escapeHtml(node.id)}" aria-label="${escapeHtml(name)} · ${rank}/${node.maxPoints}" aria-pressed="${selected.id === node.id}"><circle class="node-frame" r="${radius}"/><image x="${-radius*.64}" y="${-radius*.64}" width="${radius*1.28}" height="${radius*1.28}" href="${escapeHtml(asset)}" xlink:href="${escapeHtml(asset)}" filter="url(#skill-tree-icon-${ink})" aria-hidden="true"/><text class="node-rank" x="0" y="${radius+14}">${root ? escapeHtml(name) : `${rank}/${node.maxPoints}`}</text>${node.ability || node.rarity === 'legendary' ? `<text class="node-name" x="0" y="${radius+29}">${skillTreeNameLines(name,16).map((part,i)=>`<tspan x="0" dy="${i?13:0}">${escapeHtml(part)}</tspan>`).join('')}</text>` : ''}<title>${escapeHtml(name)}</title></g>`;
  }).join('');
  const detail = renderClassTreeDetail(selected, owner, ranks, available, byId);
  return `<div class="skill-tree-view class-skill-tree-view" data-skill-tree-theme="${theme?.id || 'red'}"><div class="view-heading"><div><p class="eyebrow">DEINE KAMPFGRUPPE</p><h1>${escapeHtml(CLASSES[owner].label)}<em> Skilltree</em></h1><p class="welcome-sub">Eigener Klassenbaum · eine Passive · eine Spezialisierung pro Fähigkeit.</p></div>${renderPartyOwnerButtons(selectedSkillTreeOwner,'skilltree')}</div><div class="skill-tree-layout"><section class="skill-tree-board class-tree-board" aria-label="${escapeHtml(CLASSES[owner].label)} Talentbaum"><div class="skill-tree-board-points"><div class="skill-tree-points"><strong>${available}</strong><span>VERFÜGBARE PUNKTE</span></div><small class="skill-tree-points-limit">${number(earnedSkillTreePoints(owner))} / ${number(BALANCE.skillTree.maxPoints)} Punkte erhalten</small></div><svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" class="skill-tree-svg" viewBox="0 0 900 840" role="group" aria-label="Klassenfähigkeiten und Talente"><defs>${[['normal','#e6d3b4'],['muted','#716b69'],['legendary','#d9b66e']].map(([key,color])=>`<filter id="skill-tree-icon-${key}" color-interpolation-filters="sRGB"><feFlood flood-color="${color}"/><feComposite in2="SourceAlpha" operator="in"/></filter>`).join('')}</defs><g class="skill-tree-connections">${edges}</g><g class="skill-tree-nodes">${nodes}</g></svg></section>${detail}</div></div>`;
}
function renderActiveClassAbilities() {
  const {className,skills,index,equippedIndex} = abilityViewSelection();
  const selected = skills[index];
  const skill = empoweredClassSkill(selected,className);
  const equipped = equippedIndex===index;
  const presentation = abilityPresentation(skill,'active');
  const rows = skills.map((base,i)=>{
    const rank=classSkillRank(className,base.id),meta=abilityPresentation(base,'active');
    return `<button class="ability-choice-row ui-control ui-card-choice ${i===index?'is-inspected':''}" data-inspect-ability="${i}" data-ability-category="active"><span class="ability-icon-box">${assetIconMarkup(meta.icon,'✦','ability-glyph')}</span><span class="ability-choice-copy"><strong>${escapeHtml(base.name)}</strong><small>Rang ${rank} · ${formatRuleNumber(effectiveAbilityCooldown(className,base))} s</small></span><span class="ability-choice-state">${i===equippedIndex?'✓ Ausgerüstet':rank > 1 ? 'Verstärkt' : 'Verfügbar'}</span></button>`;
  }).join('');
  return `<section class="abilities-view ${className}"><div class="view-heading"><div><p class="eyebrow">DEINE KAMPFGRUPPE</p><h1>Deine <em>Fähigkeiten</em></h1><p class="welcome-sub">Alle aktiven Fähigkeiten sind sofort verfügbar. Verstärke sie und wähle Spezialisierungen im Klassenbaum.</p></div>${renderPartyOwnerButtons(className===state.mainClass?'main':className,'abilities')}</div><div class="abilities-workspace"><section class="abilities-selection"><header class="abilities-profile"><h2>${escapeHtml(CLASSES[className].label)}</h2></header><div class="abilities-choice-list">${rows}</div><button class="secondary-button ui-control ui-button" data-class-skill-link="${className}">Zum Klassenbaum</button></section><aside class="ability-inspector"><p class="eyebrow">AKTIVE FÄHIGKEIT · RANG ${classSkillRank(className,selected.id)}</p><div class="ability-detail-symbol">${assetIconMarkup(presentation.icon,'✦','ability-glyph')}</div><h2>${escapeHtml(skill.name)}</h2>${skill.variantName?`<p>${escapeHtml(skill.variantName)}</p>`:''}<p class="ability-description">${escapeHtml(skillDescription(skill))}</p><div class="ability-facts"><div><small>ABKLINGZEIT</small><strong>${formatRuleNumber(effectiveAbilityCooldown(className,selected))} s</strong></div><div><small>ZIEL</small><strong>${presentation.target}</strong></div></div><button class="primary-button ui-control ui-button" data-skill-class="${className}" data-skill-type="active" data-skill-index="${index}" ${equipped?'disabled':''}>${equipped?'BEREITS AUSGERÜSTET':'FÄHIGKEIT AUSRÜSTEN'}</button></aside></div></section>`;
}
document.addEventListener('click',event=>{
  const button=event.target.closest('[data-class-skill-link]');
  if(!button)return;
  selectedSkillTreeOwner=button.dataset.classSkillLink===state.mainClass?'main':state.activeCompanion;
  selectedSkillTreeNodeId='origin';setView('skilltree');
});
