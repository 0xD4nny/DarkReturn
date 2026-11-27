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
    jagdstoss: 'target-arrows', 'verwundender-schuss': 'barbed-arrow',
    kampfrausch: 'crossed-swords', unbeugsam: 'heart-tower', wachtwall: 'bordered-shield',
    stampfen: 'earth-crack', henkerschlag: 'broadsword',
    'arkanes-echo': 'magic-swirl', aetherblick: 'crystal-eye', 'fast-caster': 'hourglass',
    erfrieren: 'snowflake-1', feuerball: 'fireball', funken: 'lightning-branches',
    lebenssegen: 'shining-heart', kampfsegen: 'rally-the-troops',
    erneuerung: 'holy-grail', 'holy-circle': 'sunbeams', seelenernte: 'bleeding-heart', feuerschuss: 'fireball', 'zweiter-wind': 'heart-tower', seelenquell: 'shining-heart',
  };
  const effects = Array.isArray(skill.effect) ? skill.effect : [skill.effect];
  const party = effects.some((effect) => effect?.scope === 'party');
  const kinds = { damage: 'Angriff', 'multi-hit': 'Mehrfachtreffer', 'vulnerable-hit': 'Verwundbarkeit', 'stun-hit': 'Betäubung', guard: 'Schutz', 'freeze-hit': 'Frost', 'burn-hit': 'Brand', 'area-damage': 'Flächenschaden', heal: 'Heilung', 'current-health-drain': 'Lebensentzug', 'heal-over-time': 'Regeneration', 'fire-area': 'Feuerschaden' };
  const target = type === 'passive' ? party ? 'Die ganze Gruppe' : 'Der Anwender'
    : (['guard', 'heal'].includes(skill.effect) || (skill.effect === 'heal-over-time' && skill.healScope === 'party')) ? 'Die ganze Gruppe'
        : skill.effect === 'heal-over-time' ? 'Der Anwender' : (skill.effect === 'area-damage' || skill.areaEffect) ? 'Alle lebenden Gegner' : 'Ein Gegner';
  return { icon: `Assets/Icons/000000/transparent/1x1/lorc/${icons[skill.id] || 'magic-swirl'}.svg`, target, kind: type === 'passive' ? 'Dauerhafter Effekt' : kinds[skill.effect] || 'Aktive Fähigkeit' };
}
function effectiveAbilityCooldown(className, skill) {
  const reduction = Math.min(75, Math.max(0, Number(getStats(className)['Abklingzeitreduktion']) || 0));
  return Number(empoweredClassSkill(skill, className).cooldown) * (1 - reduction / 100);
}
function abilityViewSelection() {
  const className = selectedAbilityOwner === state.activeCompanion ? state.activeCompanion : state.mainClass;
  const skills = COMPANION_SKILLS[className].active;
  const equippedIndex = state.companions[className].activeSkillIndex;
  const candidate = inspectedAbilities[className + ':active'];
  const index = Number.isInteger(candidate) && skills[candidate] ? candidate : Math.max(0, equippedIndex || 0);
  return { className, type: 'active', skills, equippedIndex, index, passiveSlot: 0 };
}
function inspectAbility(type, index) {
  if (type !== 'active') return false;
  const { className } = abilityViewSelection();
  if (!Number.isInteger(index) || !COMPANION_SKILLS[className].active[index]) return false;
  selectedAbilityType = 'active';
  inspectedAbilities[className + ':active'] = index;
  return true;
}
function renderCompanions() { return renderActiveClassAbilities(); }

// Owner selection and branch layout for the data-driven talent tree.
const SKILL_TREE_THEMES = [
  { id: 'blue', classId: 'mage', label: 'Magier' },
  { id: 'red', classId: 'warrior', label: 'Krieger' },
  { id: 'white', classId: 'hunter', label: 'Jäger' },
  { id: 'yellow', classId: 'healer', label: 'Heiler' },
];
// Coordinates describe presentation only; prerequisites come from SKILL_TREE_NODES.
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
  if (effect.type === 'final-damage-percent') return `+${formatRuleNumber(value)} % multiplikativer Schaden`;
  if (effect.type === 'additional-passive-slot') return 'Zwei passive Fähigkeiten gleichzeitig';
  if (effect.type === 'dodge-chance') return '+25 % eigene Ausweichchance';
  if (effect.type === 'extra-attack-chance') return '+20 % Chance auf zweiten Treffer';
  if (effect.type === 'dot-to-attack-percent') return 'Schaden über Zeit → Angriff % (1:1)';
  if (effect.type === 'warrior-execution-area-penalty') return 'Henkerschlag: Flächenschaden, -50 % Grundschaden';
  if (effect.type === 'mage-instant-fireball') return 'Feuerball: halbe Abklingzeit, voller Sofortschaden';
  if (effect.type === 'hunter-poison-chance') return 'Giftpfeile: 40 % Giftchance';
  if (effect.type === 'healer-damage-reduction-cap') return 'Eigenes Schadensminderungs-Cap: 95 %';
  if (effect.type === 'healer-final-damage-percent') return `+${formatRuleNumber(value)} % eigener multiplikativer Schaden`;
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

function renderSkillTree() { return renderOwnClassSkillTree(); }

function compactQuestCopy(quest) {
  const target = number(quest.target);
  const deep = quest.minimumDeepTier ? difficultyName(quest.minimumDeepTier) : 'Grenzgebiete';
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
    deepTier: [`${difficultyName(quest.target)} erreichen`, 'Die nächste Schwierigkeitsstufe freischalten'],
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
