// Shared data-driven handbook markup; cell values are always escaped.
function codexTable(headings, rows) {
  return `<div class="codex-table-wrap"><table class="codex-table"><thead><tr>${headings.map((heading) => `<th scope="col">${escapeHtml(heading)}</th>`).join('')}</tr></thead><tbody>${rows.map((row) => `<tr>${row.map((value, index) => index === 0 ? `<th scope="row">${escapeHtml(value)}</th>` : `<td>${escapeHtml(value)}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`;
}
function renderCodexMarket() {
  const glyphChance = BOX_RULES.glyphBox.chancePerGlyph;
  const boxRows = GLYPH_DEFINITIONS.map(glyph => ['Glyphen-Luckybox', glyph.name, `${formatRuleNumber(glyphChance)} %`]);
  boxRows.push(['Glyphen-Luckybox', 'Nietenpool', `${formatRuleNumber(100 - GLYPH_DEFINITIONS.length * glyphChance)} %`]);
  boxRows.push(['VIP-Luckybox', 'VIP-Ticket', `${formatRuleNumber(BOX_RULES.vipBox.ticketChance)} %`]);
  boxRows.push(['VIP-Luckybox', 'Nietenpool', `${formatRuleNumber(100 - BOX_RULES.vipBox.ticketChance)} %`]);
  const farmBox = BOX_RULES.farmBox;
  const farmBoxRows = farmBox.rewards.map(outcome => [outcome.label,
    outcome.type === 'souls' ? `${number(outcome.minimum)}–${number(outcome.maximum)}` : String(outcome.quantity),
    `${formatRuleNumber(outcome.chance)} %`]);
  const consolation = BOX_RULES.consolationPool.map(reward => reward.type === 'souls' ? `${number(reward.amount)} Seelen`
    : reward.type === 'powerup' ? 'Zufälliges Powerup' : `${reward.quantity || 1} × ${SLOT_DATA[reward.slot]?.label || reward.slot}`).join(' · ');
  return `<p>Der Schwarzmarkt bietet Glyphen- und VIP-Luckyboxen sowie ${EQUIPMENT_SHOP.offerCount} zufällige Ausrüstungsgegenstände an. Die Ausrüstung passt zum Main oder aktiven Begleiter. Ihre Seltenheit richtet sich nach den Beutechancen des höchsten freigeschalteten Gebiets und der aktuellen Deep-of-Dark-Stufe; nicht freigeschaltete Seltenheiten werden nicht angeboten. Mystische Waffen sind ausschließlich Gebietsfunde in Deep 4 und werden nicht angeboten. Greater Affixe sind ab Deep of Dark ${BALANCE.loot.greaterAffixMinimumDeepTier} möglich. Angebote bleiben bis zur nächsten Erneuerung beim Seitenwechsel und Neuladen bestehen. Alle ${EQUIPMENT_SHOP.refreshIntervalSeconds / 60} Minuten werden alle Angebote erneuert; der Timer neben der Überschrift zeigt die verbleibende Zeit. Die Zeit läuft auch bei geschlossenem Spiel weiter. Nach einem Kauf wird nur das gekaufte Angebot ersetzt. Unpassende Angebote werden bei einem Wechsel der Kampfgruppe ersetzt. Gekaufte Ausrüstung benötigt einen freien Inventarplatz; sie zählt nicht als Beutefund. Luckyboxen kannst du 1 bis 1.000 Stück pro Kauf erwerben. Eigene Ausrüstung kannst du weiterhin verkaufen. Mystische Waffen geben statt Seelen immer ${MYTHIC_ITEMS.saleStones} mystische Aufwertungssteine für den eigenen Schmiede-Tab.</p>${codexTable(['Angebot', 'Seelen pro Stück'], SHOP_OFFERS.filter(offer => offer.purchasable !== false).map(offer => [offer.title, number(SHOP_COSTS[offer.group])]))}<h3>Ausrüstungspreise</h3>${codexTable(['Ausrüstung', 'Seelen pro Gegenstand'], [...RARITIES.filter(rarity => rarity.color !== 'mythic').map(rarity => [rarity.name, number(EQUIPMENT_SHOP.prices[rarity.color])]), ['Legendär mit mindestens einem Greater Affix', number(EQUIPMENT_SHOP.prices.legendaryGreater)]])}<h3>Boxen öffnen</h3><p>Öffne eine Box im Inventar mit einem Klick. „Alle Boxen öffnen“ öffnet alle vorhandenen Glyphen-, VIP- und Farm-Luckyboxen nacheinander und stoppt bei fehlendem Lagerplatz. Jede Box wird verbraucht und liefert genau ein Ergebnis. Gleiche Boxen werden gestapelt. Beim Sammelöffnen fasst das Aktivitätsprotokoll alle Seelengewinne zu einer Gesamtsumme und gleiche Gegenstände zu einer Gesamtmenge zusammen. Anteile im Briefkasten werden gesondert ausgewiesen.</p><h3>Farm-Luckybox</h3><p>Zusätzlich zur normalen Beute kann jeder gewonnene Gebiets- oder Turmkampf mit ${formatRuleNumber(farmBox.dropChance * 100)} % Basis-Chance eine Farm-Luckybox geben. Relative Dropratenboni aus dem Droprate-Power-up und dem Welt-Event erhöhen diese Chance; die Gewinnverteilung innerhalb der Box bleibt gleich. Es gibt genau einen unabhängigen Wurf pro Sieg, unabhängig von Gegnerzahl, Championstatus und Deep-Stufe. Die Bossprüfung gibt keine Farm-Luckyboxen. Die Box ist nicht im Shop erhältlich und enthält genau einen Gewinn, keine Niete. Seelen aus dieser Box werden in der angegebenen Menge ohne zusätzliche Seelenboni vergeben. Direkte Turmbeute bleibt zusätzlich erhalten. Glyphen- und VIP-Boxen aus der Farm-Luckybox sind zunächst versiegelt; beim Sammelöffnen werden auch sie geöffnet.</p>${codexTable(['Inhalt', 'Menge', 'Chance pro Box'], farmBoxRows)}<h3>Turm-Beutesegen</h3><p>Ein Doppelklick im Inventar setzt die Dropchance der gewählten Turmbeute für eine Stunde auf 100 %. Weitere Exemplare verlängern die verbleibende Laufzeit um jeweils eine Stunde. Der Bonus erscheint mit Restzeit bei den aktiven Power-ups und kann dort auch zusammen mit den verfügbaren Power-ups aktiviert werden. Er gilt für alle Turmrunden und die jeweils gewählte Beuteart, auch nach einem Wechsel. Farm-Luckybox-Chance, Seelenmenge und Gebietsbeute werden nicht erhöht. Die Zeit läuft auch bei geschlossenem Spiel weiter. Der Segen stammt mit 5 % Chance aus der Farm-Luckybox.</p><h3>VIP-Ticket</h3><p>Ein Doppelklick auf das Ticket im Inventar gewährt ${VIP_RULES.durationDays} Tage VIP. VIP gewährt pro Tag ${BALANCE.dailyAttempts.vipBonus} zusätzlichen freien Versuch für die Bossprüfung und den Turm. VIP beschleunigt Schmiede, Sockelrituale und Verzauberung um den Faktor ${VIP_RULES.workshopSpeedMultiplier}, einschließlich der Ergebnisanzeige. Zusätzlich gibt VIP +${VIP_RULES.upgradeChancePercent} % relative Upgradechance auf normale Aufwertung, mystische Aufwertung und Sockelöffnen. Upgradechance aus VIP, Power-up und Welt-Event wird addiert und relativ auf die Basis-Erfolgschance angewendet, maximal bis 100 %. Außerdem gibt VIP +${VIP_RULES.dropRatePercent} % relative Droprate auf Gebietsausrüstung, gewählte Turmbeute und Farm-Luckybox-Drops. Der Bonus wird mit Droprate-Power-up und Dropraten-Event addiert; die Chance endet bei 100 %. VIP gewährt außerdem +${VIP_RULES.soulBonusPercent} % Kampf-Seelen aus Gebieten, Turm und Bossprüfung als eigenen Multiplikator neben Seelenfund, Talenten und Weltbonus. Erstabschlussprämien, Auftragsbelohnungen, Boxinhalte und Verkaufserlöse erhalten diesen Seelenbonus nicht. Boxinhalte, Seltenheits- und Affixwürfe werden durch VIP nicht verändert. Ein Versuch dauert damit regulär 2 Sekunden und mit aktivem VIP 1 Sekunde. Einzelversuche und Auto-Läufe verwenden dieselbe Dauer; ausgeschaltete Animationen ändern sie nicht. Weitere Tickets verlängern die verbleibende Laufzeit um jeweils ${VIP_RULES.durationDays} Tage. Die Zeit läuft auch bei geschlossenem Spiel weiter. Der Status steht neben dem Spielernamen, das Ablaufdatum in der Spielerstatistik.</p><h3>Inhalte und Chancen</h3>${codexTable(['Box', 'Ergebnis', 'Chance'], boxRows)}<p>Powerups fallen im Turm direkt und gleichverteilt aus allen Powerup-Typen, wenn du diese Beute auswählst. Sie müssen nicht aus einer Box geöffnet werden.</p><p>Glyphen- und VIP-Luckyboxen verwenden denselben Nietenpool. Darin werden diese Ergebnisse gleichverteilt ausgewählt: ${escapeHtml(consolation)}. Für jede Box wird neu gewürfelt.</p>`;
}

function codexRewardLabel(reward) {
  if (!reward) return '—';
  const rarity = RARITIES.find((entry) => entry.color === reward.rarity)?.name || '';
  const greater = reward.greaterAffixes ? ` · ${reward.greaterAffixes} zufällige Greater Affixe${reward.type === 'setBundle' ? ' je Teil' : ''}` : '';
  if (reward.type === 'setBundle') return `${rarity} ${reward.classBound ? 'Klassen-' : 'generisches '}${reward.kind === 'armor' ? 'Rüstungsset (4 Teile)' : 'Schmuckset (5 Teile)'}${reward.classBound ? ` für ${reward.owner === 'main' ? 'den Main' : 'den aktiven Gefährten'}` : ''}${greater}`;
  if (reward.type === 'luckyBundle') return `Glyphen- und VIP-Luckybox jeweils ${reward.quantity}×`;
  if (reward.type === 'gemBundle') return `Jeden Edelsteintyp ${reward.quantity}× (alle ${GEM_PROFILES.length} Profile, legendär)`;
  if (reward.type === 'souls') return `${number(reward.min)}${reward.max !== reward.min ? `–${number(reward.max)}` : ''} Seelen vor Welt-Eventbonus`;
  if (reward.type === 'starterArmor') return CONTRACT_MILESTONE_REWARDS[reward.itemIndex]?.name || 'Einsteigerrüstung';
  if (reward.type === 'classWeapon') return `${rarity} Klassenwaffe für ${reward.owner === 'main' ? 'den Main' : 'den aktiven Gefährten'}${greater}`;
  if (reward.type === 'itemBundle') return `${reward.label}: ${reward.items.map(codexRewardLabel).join(', ')}`;
  if (['setItem', 'equipment'].includes(reward.type)) return `${rarity} · ${reward.name || reward.set}`;
  if (reward.type === 'luckyBox') return `${reward.quantity || 1} × ${SLOT_DATA[reward.group]?.label || reward.group}`;
  if (reward.type === 'material') return `${reward.quantity || 1} × ${SLOT_DATA[reward.slot]?.label || reward.slot}`;
  if (reward.type === 'gem') return `${reward.quantity || 1} × Edelstein`;
  return reward.label || reward.name || reward.type;
}
function codexQuestDescription(task) {
  const targets = Array.isArray(task.targets) ? task.targets.map(number).join(' / ') : number(task.target);
  const newTypes = ['mainPetLevel', 'companionPetLevel', 'partyPetLevel', 'mainSkillPoints', 'partySkillPoints', 'affixStoneDrops', 'gemDrops', 'petAffixesRerolled', 'equipmentAffixesRerolled', 'raritiesUpgraded', 'monsters', 'partyLevel', 'partyLevelGain', 'armorUpgrade', 'weaponsUpgrade', 'weaponSockets', 'upgradeStoneDrops', 'socketStoneDrops', 'socketsOpened', 'gemsSocketed', 'affixesRerolled', 'greaterDrops', 'towerBosses', 'nonQuestSoulsEarned'];
  if (task.relativeToRecord) return `Gewinne ${targets} Runden über deinem bisherigen Rundenrekord, mindestens ${number(task.minimumTarget)} Runden.`;
  if (newTypes.includes(task.type) || task.minimumDeepTier) return task.description.replace(/\{target\}/g, targets);
  const descriptions = {
    areaWins: `Gewinne ${targets} Gebietsdurchgänge.`,
    equipmentDrops: `Erhalte ${targets} Ausrüstungsfunde in Grenzgebieten.`,
    equippedSlots: `Belege mindestens ${targets} Ausrüstungsslots beim Main.`,
    forges: `Erreiche ${targets} erfolgreiche Aufwertungen in der Schmiede.`,
    armorPiecesEquipped: `Belege ${targets} Rüstungsplätze beim Main.`,
    soulsEarned: `Verdiene ${targets} Seelen ab Beginn der Auftragsgruppe.`,
    soulsSpent: `Gib ${targets} Seelen ab Beginn der Auftragsgruppe aus.`,
    mainLevel: `Erreiche Stufe ${targets} mit deinem Main.`,
    companionLevel: `Erreiche Stufe ${targets} mit deinem aktiven Gefährten.`,
    areaReached: `Gewinne einen Durchgang in ${AREAS.find((area) => area.id === task.areaId)?.name || task.areaId}.`,
    epicDrops: `Erhalte ${targets} epische Ausrüstungsfunde in Grenzgebieten; legendäre Funde zählen dafür nicht.`,
    tower: `Gewinne mindestens ${targets} Turmrunden in einem Durchlauf. Bereits erreichte Rundenrekorde zählen sofort.`,
    towerRounds: `Gewinne ${targets} Turmrunden ab Beginn der Auftragsgruppe; mehrere Durchläufe zählen zusammen.`,
    bossRank: `Erreiche mindestens ${BALANCE.bossChallenge.rankThresholds[task.target - 1]?.name || targets} in der Bossprüfung.`,
    armorSetRank: `Trage beim Main vier Teile desselben Rüstungssets, jeweils mindestens +${targets}.`,
    armorSetPieces: `Trage beim Main ${targets} Rüstungsteile des Sets ${task.set}.`,
    deepTier: `Schalte Deep of Dark ${targets} frei.`,
    jewelryDrops: `Erhalte ${targets} Schmuckfunde in Grenzgebieten.`,
    champions: `Besiege ${targets} Champions in Gebieten oder im Turm.`,
    socketAttempts: `Führe ${targets} Sockelöffnungsversuche durch; Erfolge und Fehlschläge zählen.`,
    luckyPurchases: `Kaufe ${targets} Luckyboxen beliebiger Art.`,
  };
  return descriptions[task.type] || task.description.replace(/\{target\}/g, targets);
}
function renderCodexContracts() {
  const groups = QUEST_BOARD.fixedGroups;
  const fixed = groups.map((group, index) => `
    <h3>Feste Auftragsgruppe ${index + 1} · ${escapeHtml(group.title)}</h3>
    ${codexTable(['Ziel', 'Aufgabe', 'Einzelbelohnung'], group.tasks.map((task, taskIndex) => [
      task.title, codexQuestDescription(task), codexRewardLabel(group.rewards[taskIndex]),
    ]))}`).join('');
  const repeats = QUEST_BOARD.repeatTasks.map(task => [task.title, codexQuestDescription(task),
    task.type === 'towerRounds' ? 'Alle gewonnenen Runden ab Gruppenbeginn; mehrere Durchläufe zählen zusammen.' : task.type === 'partyLevelGain' ? 'Beide Charaktere müssen ab Gruppenbeginn die gewählte Zahl zusätzlicher Stufen gewinnen.' : 'Zählt ab Beginn der Gruppe.']);
  return `<p>Es gibt ${groups.length} feste Auftragsgruppen mit jeweils ${QUEST_BOARD.batchSize} Zielen. Jede Zeile hat ihre eigene Belohnung und kann einzeln abgeholt werden. Nach sechs abgeholten Belohnungen beginnt automatisch die nächste Gruppe. Es gibt keine zusätzliche Abschlussprämie.</p>
    <p>Gegneraufträge zählen tatsächlich besiegte Gegner, nicht Begegnungen. Champions zählen als besiegte Champion-Begegnungen. Käufe und erfolgreiche Aktionen zählen ab Gruppenbeginn; fehlgeschlagene Sockelversuche öffnen keinen Platz. Ziele mit Deep-Anforderung zählen nur Kämpfe auf der verlangten oder einer höheren gespielten Stufe. Turmbosse erscheinen in jeder zehnten Runde eines Durchlaufs. Turmrekord-Ziele verlangen einen einzigen Durchlauf; wiederholbare Rundenziele zählen mehrere Durchläufe ab Gruppenbeginn zusammen.</p>
    <p>Bereits erreichte Charakter- und Tierstufen, aktuell investierte Skillpunkte, Turmrundenrekorde, Gebietsgewinne, Deep-Stufen und Bossränge werden sofort anerkannt. Tier- und Skillpunktziele für beide Besitzer verlangen den Zielwert jeweils beim Main und aktiven Gefährten. Tierumprägungen und Ausrüstungsumprägungen werden getrennt gezählt. Turm-Material- und Edelsteinziele zählen nur die direkte gewählte Turmbeute; Boxen und Belohnungen ersetzen diese Tutorialschritte nicht. Ausrüstungsziele zählen nur die beiden aktiven Charaktere und werden beim Abholen geprüft. Für Rüstungsaufwertungen müssen alle vier Plätze belegt sein; gleiche Setnamen sind dafür nicht erforderlich. Waffen müssen zur jeweiligen Klasse passen. Greater-Funde zählen gefundene Gegenstände mit mindestens einem Greater Affix; Auftragsbelohnungen zählen nicht als Funde.</p>
    <p>Klassenbelohnungen richten sich beim Abholen nach dem Main beziehungsweise aktiven Begleiter. Setpakete enthalten alle vier Rüstungsteile oder fünf Schmuckteile auf +0. Greater-Angaben bei Sets gelten je Teil. Jedes Boxpaket umfasst Glyphen- und VIP-Luckyboxen; Edelsteinpakete enthalten alle ${GEM_PROFILES.length} Profile in Legendär.</p>
    ${fixed}
    <h3>Wiederholbare Gruppen ab Gruppe ${groups.length + 1}</h3>
    <p>Sechs unterschiedliche Auftragstypen werden zufällig aus dem Endspielpool gezogen. Die Zielvarianten sind Alternativen. Es gibt keine niedrigen Einführungsziele und keine Pflicht zu unnötigem Kaufen, Sockeln oder Umprägen. Verdiente Seelen schließen alle Auftragsbelohnungen aus.</p>
    ${codexTable(['Aufgabe', 'Mögliche Ziele', 'Zählweise'], repeats)}
    <p>Sechs unterschiedliche Belohnungen werden aus diesem Pool zufällig zugeteilt. Weder feste noch wiederholbare Gruppen vergeben legendäre Ausrüstung oder garantierte Greater-Ausrüstung. Die späten Meilensteine belohnen stattdessen mit größeren Material-, Seelen-, Edelstein- und Boxpaketen.</p>
    ${codexTable(['Belohnung'], QUEST_BOARD.rewardPool.map(reward => [codexRewardLabel(reward)]))}
    <p>Passt eine Belohnung nicht ins Inventar, wird der Briefkasten verwendet. Fehlt Platz für das gesamte Paket, wird nichts verbraucht oder als abgeholt markiert. Schaffe Platz und versuche es erneut. Gebiete und Turm bleiben unabhängig von Aufträgen zugänglich.</p>`;
}
function renderCodexGems() {
  const gemDropChance = BALANCE.loot.towerLootChoices.find(choice => choice.id === 'gems').chance;
  const weights = BALANCE.items.gemRarityWeights;
  const total = Object.values(weights).reduce((sum, weight) => sum + weight, 0);
  const profiles = GEM_PROFILES.map(profile => [profile.profile, profile.attribute]);
  const bonusStats = [...new Set(Object.values(BALANCE.items.gemValues).flatMap(values => Object.keys(values.bonuses)))];
  const rarities = GEM_RARITIES.map(rarity => {
    const values = BALANCE.items.gemValues[rarity.color];
    const chance = weights[rarity.color] / total * 100;
    return [rarity.name, `+${values.attribute}`, ...bonusStats.map(stat => `+${formatRuleNumber(values.bonuses[stat] || 0)} %`), `${formatRuleNumber(chance)} %`, `${formatRuleNumber(gemDropChance * chance / 100)} %`];
  });
  return `
    <h3>Edelsteinprofile</h3>
    ${codexTable(['Edelstein', 'Flaches Attribut'], profiles)}
    <p>Alle Edelsteine passen in jeden Ausrüstungsplatz, einschließlich Schmuck und Glyphen. Jeder gewährt ein festes Attribut; zusätzliche Prozentboni richten sich nach seiner Seltenheit. Die konfigurierten Werte je Seltenheit stehen in der Tabelle. Aufwertungen der Ausrüstung verstärken Edelsteine nicht.</p>
    ${codexTable(['Seltenheit', 'Attributpunkte', ...bonusStats, 'Anteil an Edelsteinfunden', 'Pro Turmsieg bei Edelsteinbeute'], rarities)}
    <p>Alle ${GEM_PROFILES.length} Profile werden gleich häufig ausgewählt, unabhängig von der Seltenheit. Bestehende Edelsteine behalten ihre Seltenheit und werden auf die neuen festen Werte umgestellt.</p>`;
}

function buildCodexTableOfContents() {
  const toc = document.querySelector('.codex-toc-list');
  if (!toc) return;
  const groups = Array.from(document.querySelectorAll('.codex-chapter')).map(chapter => ({
    id: chapter.id,
    title: chapter.querySelector('.codex-chapter-heading').textContent.trim(),
    children: Array.from(chapter.querySelectorAll('.codex-section')).flatMap(section => {
      const entries = [{ id: section.id, title: section.id === 'codex-loot' ? 'Ausrüstungsfunde und Droprate' : section.querySelector('.codex-topic-heading').textContent.trim() }];
      if (['codex-loot', 'codex-gear', 'codex-sockets', 'codex-enchantments'].includes(section.id)) {
        section.querySelectorAll('h4').forEach((heading, index) => {
          heading.id ||= `${section.id}-topic-${index + 1}`;
          entries.push({ id: heading.id, title: heading.textContent.trim() });
        });
      }
      return entries;
    }),
  }));
  toc.innerHTML = groups.map((group) => `<li><a href="#${escapeHtml(group.id)}">${escapeHtml(group.title)}</a>${group.children.length ? `<ol>${group.children.map((child) => `<li><a href="#${escapeHtml(child.id)}">${escapeHtml(child.title)}</a></li>`).join('')}</ol>` : ''}</li>`).join('');
  document.querySelectorAll('.codex-section').forEach((section) => {
    if (section.querySelector(':scope > .codex-back-to-toc')) return;
    const backLink = document.createElement('a');
    backLink.className = 'codex-back-to-toc';
    backLink.href = '#codex-toc';
    backLink.textContent = 'Zurück zum Inhaltsverzeichnis';
    section.append(backLink);
  });
}


function renderBossRankTable() {
  return `<div class="codex-table-wrap"><table class="codex-table"><thead><tr><th scope="col">Rang</th><th scope="col">Mindestschaden</th></tr></thead><tbody>${BALANCE.bossChallenge.rankThresholds.map(rank => `<tr><th scope="row">${bossRankBadge(rank)}</th><td>${number(rank.minimumDamage)}</td></tr>`).join('')}</tbody></table></div>`;
}
