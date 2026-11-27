// Keep rewards, costly crafting results and session summaries; omit routine UI confirmations.
const ROUTINE_ACTIVITY_TITLES = new Set([
  'Farm-Session begonnen', 'Bosskampf begonnen', 'Bosskampf abgebrochen', 'Kampf wird beendet',
  'Ausr\u00fcstung gewechselt', 'Gef\u00e4hrte ausger\u00fcstet', 'Ausr\u00fcstung abgelegt',
  'Gef\u00e4hrtenf\u00e4higkeit gewechselt', 'Talent verbessert', 'Begleittier aufgestiegen',
  'Power-up aktiviert', 'Power-up verl\u00e4ngert', 'Power-ups aktiviert',
  'Edelstein eingesetzt', 'Edelstein entnommen', 'Briefkasten geleert', 'Beute automatisch verkauft',
  'Entwicklungsbonus', 'Admin-Gegenstand erstellt', 'Ausr\u00fcstung maximiert',
  'Verzauberungsmaterialien erhalten', 'Stufen angehoben', 'Waffenlevel maximiert',
  'Inventarpl\u00e4tze freigeschaltet', 'Bosspr\u00fcfung zur\u00fcckgesetzt',
]);
function isUsefulActivity(title) {
  return !ROUTINE_ACTIVITY_TITLES.has(title)
    && !Object.values(CLASSES).some(entry => title === `${entry.label} aufgestiegen`)
    && title !== 'Charakter aufgestiegen';
}
function activityFor(payload, result) {
  if (payload.action === 'battle' && payload.mode === 'tower') return null;
  const equipped = [
    ...Object.values(state.equipment.main || {}),
    ...Object.values(state.equipment.companions || {}).flatMap((entry) => Object.values(entry || {})),
  ].find((item) => item?.id === payload.itemId);
  const inventoryItem = state.inventory.find((item) => item.id === payload.itemId);
  const itemName = result.item?.name || result.sold?.name || equipped?.name || inventoryItem?.name || 'Gegenstand';
  const actions = {
    'sell-inventory-category': () => ({ title: 'Kategorie verkauft', detail: `${result.count} Gegenstände · ${INVENTORY_CATEGORIES[result.category]?.label || 'Alle Kategorien'} · ${number(result.value)} Seelen` }),
    'offline-settle': () => {
      const report = result.offlineReport;
      if (!report || (!report.wins && !report.defeats)) return null;
      return { title: 'AFK-Fortschritt gutgeschrieben', detail: [
        report.mode === 'tower' ? `Turm: Runde ${report.startRound} bis ${report.lastRound}${report.runEnded ? ' \u00b7 durch Niederlage beendet' : ''}` : `${AREAS.find(area => area.id === report.area)?.name} \u00b7 ${report.deepTier ? 'Deep of Dark ' + report.deepTier : 'Grundstufe'}`,
        `${offlineTimeLabel(report.duration)} mit ${report.efficiency * 100} % Effizienz`,
        `${number(report.wins)} Siege / ${number(report.defeats)} Niederlagen`,
        `+${number(report.souls)} Seelen`,
        ...Object.entries(report.items).map(([name, quantity]) => `${number(quantity)} \u00d7 ${name}`),
        ...Object.entries(report.sold).map(([name, quantity]) => `Verkauft: ${number(quantity)} \u00d7 ${name}`),
        ...Object.entries(report.missed).map(([name, quantity]) => `Nicht aufgenommen: ${number(quantity)} \u00d7 ${name}`),
      ].join('\n') };
    },
    'claim-hunting-event': () => ({ title: 'Jagdauftrag abgeschlossen', detail: `${AREAS.find(area => area.id === result.areaId)?.name} · ${result.tier ? `Deep ${result.tier}` : 'Normal'} · ${result.rewards.map(item => `${item.quantity} × ${item.name}`).join(' · ')}` }),
    'fuse-glyphs': () => ({ title: 'Glyphen kombiniert', detail: `${result.consumed.map(item => item.name).join(' + ')} → ${itemName} · ${(result.item.affixes || []).filter(affix => affix.greater).length} Greater Affixe` }),
    'activate-vip': () => ({ title: 'VIP aktiviert', detail: `VIP bis ${new Date(result.expiresAt).toLocaleString('de-DE')} · Doppelte Geschwindigkeit für Schmiede, Sockel und Verzauberung · +${VIP_RULES.dropRatePercent} % Droprate · +${VIP_RULES.soulBonusPercent} % Kampf-Seelen` }),
    'buy-equipment-offer': () => ({ title: 'Ausrüstung gekauft', detail: `${itemName} · ${result.item.rarity} · ${number(result.cost)} Seelen` }),
    buy: () => ({ title: result.quantity > 1 ? `${result.quantity} Gegenst\u00e4nde gekauft` : 'Gegenstand gekauft', detail: result.quantity > 1 ? `${result.quantity} \u00d7 ${SHOP_OFFERS.find((offer) => offer.group === result.group)?.title || 'Waren'} f\u00fcr ${number(result.cost)} Seelen` : BOX_RULES[result.group] ? `${SHOP_OFFERS.find((offer) => offer.group === result.group)?.title || 'Luckybox'} ins Inventar gelegt` : `${itemName} \u00b7 ${result.item?.rarity || ''}` }),
    'open-lucky-box': () => ({ title: result.jackpot ? 'Luckybox-Hauptgewinn!' : 'Luckybox ge\u00f6ffnet', detail: result.rewardItem ? `${result.rewardItem.name}${result.rewardItem.quantity > 1 ? ` \u00b7 ${number(result.rewardItem.quantity)} St\u00fcck` : ''}${result.rewardDestination === 'mailbox' ? ' \u00b7 im Briefkasten abgelegt' : ''}` : `+${number(result.rewardSouls)} Seelen` }),
    'open-all-lucky-boxes': () => {
      const rewards = new Map();
      let souls = 0;
      (result.opened || []).forEach(entry => {
        souls += Math.max(0, Number(entry.rewardSouls) || 0);
        const item = entry.rewardItem;
        if (!item) return;
        const quantity = Math.max(1, Number(item.quantity) || 1);
        const reward = rewards.get(item.name) || { quantity: 0, mailed: 0 };
        reward.quantity += quantity;
        if (entry.rewardDestination === 'mailbox') reward.mailed += quantity;
        rewards.set(item.name, reward);
      });
      const summary = [
        ...(souls ? [`+${number(souls)} Seelen`] : []),
        ...[...rewards].map(([label, reward]) => `${number(reward.quantity)}× ${label}${reward.mailed ? ` (${number(reward.mailed)} im Briefkasten)` : ''}`),
      ].join(' · ');
      return { title: `${number(result.openedCount)} Luckyboxen geöffnet`, detail: `${summary}${result.blockedByStorage ? ' · Öffnen wegen vollem Speicher angehalten' : ''}` };
    },
    'socket-slot': () => ({ title: result.successes ? 'Sockelritual beendet' : 'Sockelritual fehlgeschlagen', detail: `${itemName} \u00b7 ${result.successes} Sockel ge\u00f6ffnet / ${result.failures} Fehlschl\u00e4ge` }),
    sell: () => ({ title: 'Gegenstand verkauft', detail: `${itemName} · +${number(result.mythicStones || result.value)} ${result.mythicStones ? 'mystische Aufwertungssteine' : 'Seelen'}` }),
    upgrade: () => ({ title: result.mythic ? result.successes ? 'Mystische Aufwertung' : 'Mystische Aufwertung fehlgeschlagen' : result.successes ? 'Ausrüstung aufgewertet' : 'Aufwertung fehlgeschlagen', detail: `${itemName} · ${result.successes} Erfolg${result.successes === 1 ? '' : 'e'} / ${result.failures} Fehlschlag${result.failures === 1 ? '' : 'e'} · +${result.item?.[result.mythic ? 'mythicUpgradeLevel' : 'upgradeLevel'] || 0}` }),
    'use-boss-reset': () => ({ title: 'Bossversuch erhalten', detail: 'Boss-Zeitstein verbraucht\nEin weiterer Bossversuch verf\u00fcgbar.' }),
    'use-tower-reset': () => ({ title: 'Turmversuch erhalten', detail: 'Turm-Zeitstein verbraucht\nEin weiterer Turmlauf verf\u00fcgbar.' }),
    'upgrade-gems': () => ({ title: 'Edelsteine aufgewertet', detail: `${number(result.consumed)} × ${result.profile} (${result.previousRarity}) → ${number(result.quantity)} × ${result.profile} (${result.item.rarity})` }),
    'enchant-mythic': () => ({ title: result.success ? 'Ausrüstung zu Mystisch aufgewertet' : 'Mystische Aufwertung fehlgeschlagen', detail: `${itemName} · ${MYTHIC_ITEMS.ascension.rarityStoneCost} Seltenheitssteine und ${MYTHIC_ITEMS.ascension.mythicStoneCost} mystische Aufwertungssteine verbraucht` }),
    'enchant-rarity': () => result.greaterUpgrade
      ? { title: 'Greater Affix erzeugt', detail: `${itemName} · ${result.affix.stat} · einmalige Aufwertung mit einem Seltenheitsstein` }
      : { title: 'Seltenheit erhöht', detail: `${itemName} · ${result.previousRarity} → ${result.item?.rarity}` },
    'enchant-affix': () => ({ title: 'Affix umgeprägt', detail: `Kosten: ${number(result.cost || 1)} Umpr\u00e4gungssteine\n${itemName} · ${result.previousStat} → ${result.affix?.stat}` }),
    'skill-tree-node-respec': () => ({ title: 'Talentknoten zurückgesetzt', detail: `${CLASSES[result.className]?.label || 'Charakter'} · ${result.nodeNames.join(', ')} · ${result.refundedPoints} Punkte zurück · ${number(result.cost)} Seelen` }),
    'skill-tree-respec': () => ({ title: 'Talentbaum zurückgesetzt', detail: `${CLASSES[result.className]?.label || 'Charakter'} · ${number(result.cost)} Seelen` }),
    'boss-complete': () => {
      const boxCounts = new Map();
      (result.luckyBoxRewards || []).forEach(({ item }) => boxCounts.set(item.name, (boxCounts.get(item.name) || 0) + Math.max(1, Number(item.quantity) || 1)));
      const boxes = [...boxCounts].map(([name, count]) => `${count > 1 ? `${count}x ` : ''}${name}`).join('\n');
      return { title: `Bossprüfung: Rang ${result.rank}`, detail: `${damageDisplayNumber(result.damage)} Schaden · +${number(result.reward)} Seelen${boxes ? ` · ${boxes}` : ''}` };
    },
    'claim-quest': () => ({ title: 'Questbelohnung abgeholt', detail: `+${number(result.reward)} Seelen` }),
    'claim-quest-board-task': () => ({ title: 'Auftragsbelohnung abgeholt', detail: result.rewardItem ? `${codexRewardLabel(result.reward)} · ${(result.rewardDestinations || []).includes('mailbox') ? 'Inventar/Briefkasten' : 'im Inventar'}${result.groupComplete ? ' · nächste Gruppe geöffnet' : ''}` : `+${number(result.soulAmount)} Seelen${result.groupComplete ? ' · nächste Gruppe geöffnet' : ''}` }),
    'claim-quest-stage': () => ({ title: 'Queststufe abgeschlossen', detail: `+${number(result.reward)} Seelen · ${QUEST_STAGES[payload.stageIndex]?.title || ''}` }),
  };
  if (payload.action === 'buy' && result.boxRewards) {
    const grouped = new Map();
    let soulTotal = 0;
    result.boxRewards.forEach((reward) => {
      if (reward.souls) soulTotal += reward.souls;
      if (reward.item) grouped.set(reward.item.name, (grouped.get(reward.item.name) || 0) + Math.max(1, Number(reward.item.quantity) || 1));
    });
    const detail = [...[...grouped].map(([name, quantity]) => `${quantity > 1 ? `${quantity}x ` : ''}${name}`), ...(soulTotal ? [`+${number(soulTotal)} Seelen`] : [])].join(' · ') || 'Keine Beute';
    return { title: `${SHOP_OFFERS.find((offer) => offer.group === result.group)?.title || 'Luckybox'} geöffnet`, detail };
  }
  if (payload.action === 'battle' && result.firstClear) {
    return { title: 'Gebiet erstmals abgeschlossen', detail: `+${number(result.discoveryBonus)} Seelen und ${number(result.firstClearBoxes.quantity)} Farm-Luckyboxen${result.firstClearBoxesDestination === 'mailbox' ? ' (Briefkasten)' : ''} · Insgesamt +${number(result.reward)} Seelen` };
  }
  const dropDestination = result.equipmentDropDestination || (result.equipmentDropMissed ? 'missed' : result.equipmentDropSold ? 'sold' : result.equipmentDropMailed ? 'mailbox' : null);
  if (payload.action === 'battle' && result.farmBoxDrop) {
    const destination = result.farmBoxDropDestination;
    const details = [destination === 'missed' ? 'Farm-Luckybox nicht aufgenommen: kein freier Lagerplatz.'
      : `Farm-Luckybox ${destination === 'mailbox' ? 'im Briefkasten abgelegt' : 'dem Inventar hinzugefügt'}`];
    if (result.equipmentDrop) details.push(`${result.equipmentDrop.name} · ${dropDestination === 'sold' ? `automatisch verkauft: +${number(result.equipmentDropSaleStones || result.equipmentDropSaleValue)} ${result.equipmentDropSaleStones ? 'mystische Aufwertungssteine' : 'Seelen'}` : dropDestination === 'missed' ? 'kein Lagerplatz' : dropDestination === 'mailbox' ? 'Briefkasten' : 'Inventar'}`);
    details.push(...(result.towerMaterialDrops || []).map(({ item }) => item.name));
    if (result.towerMaterialDropMissed?.length) details.push('Weitere Turmbeute konnte nicht aufgenommen werden.');
    return { title: destination === 'missed' ? 'Farm-Luckybox verpasst' : 'Farm-Luckybox gefunden', detail: details.join(' · ') };
  }
  if (payload.action === 'battle' && dropDestination === 'missed') return { title: 'Ausrüstungsfund verpasst', detail: `${result.equipmentDrop?.name || 'Ausrüstung'} · Kein verfügbarer Platz im Inventar oder Briefkasten.` };
  if (payload.action === 'battle' && dropDestination === 'sold') return null;
  if (payload.action === 'battle' && (result.towerMaterialDrops?.length || result.towerMaterialDropMissed?.length)) {
    const stored = (result.towerMaterialDrops || []).map(({ item, destination }) => `${item.name}${destination === 'mailbox' ? ' · Briefkasten' : ''}`);
    const missed = result.towerMaterialDropMissed?.length ? [`${result.towerMaterialDropMissed.length} Fund${result.towerMaterialDropMissed.length === 1 ? '' : 'e'} nicht aufgenommen; nicht genug freie Plätze für die Beute.`] : [];
    return { title: stored.length ? 'Turmbeute erhalten' : 'Turmfund nicht aufgenommen', detail: [...stored, ...missed].join(' · ') };
  }
  if (payload.action === 'battle' && result.equipmentDrop) {
    const destination = dropDestination === 'mailbox' ? 'im Briefkasten abgelegt' : 'dem Inventar hinzugefügt';
    return { title: 'Ausrüstungsfund', detail: `${result.equipmentDrop.name} · ${SLOT_DATA[result.equipmentDrop.slot]?.label || result.equipmentDrop.slot} · ${result.equipmentDrop.rarity} · ${destination}` };
  }
  if (payload.action === 'claim-contract-reward') {
    const mailed = (result.storedRewardItems || []).filter((entry) => entry.destination === 'mailbox').length;
    return { title: 'Auftragsbelohnung abgeholt', detail: `+${number(result.reward)} Seelen · ${mailed ? `${mailed} Gegenstand${mailed === 1 ? '' : 'e'} im Briefkasten` : `${result.readyCount} gebündelte Belohnung${result.readyCount === 1 ? '' : 'en'}`}` };
  }
  const action = payload.action === 'admin-simulate-offline-time' ? 'offline-settle' : payload.action;
  return actions[action]?.() || null;
}
function appendActivity(title, detail) {
  if (!state || !isUsefulActivity(title)) return;
  state.activityLog ||= [];
  state.activityUnread ||= 0;
  state.activityLog.unshift({ id: createItemId(), title, detail, at: new Date().toISOString() });
  state.activityLog = state.activityLog.slice(0, 50);
  if (!activityPanel || activityPanel.hidden) state.activityUnread = Math.min(99, state.activityUnread + 1);
  renderActivityPanel();
}
function queueActivity(title, detail) {
  if (!isUsefulActivity(title)) return Promise.resolve();
  return enqueueStateTask(async () => {
    appendActivity(title, detail);
    await writeSavedState(state);
  });
}
async function finishBattleActivity(session, outcome) {
  if (!session || session.activityFinished) return;
  session.activityFinished = true;
  await Promise.allSettled([...(session.pendingRewards || [])]);
  if (!session.enemiesKilled && !session.soulsEarned && !session.deaths) return;
  if (session.mode === 'tower') {
    const formatLoot = (items) => [...(items || [])].map(([name, quantity]) => `${number(quantity)} × ${name}`).join('\n');
    const loot = formatLoot(session.towerRewards?.items);
    const missed = formatLoot(session.towerRewards?.missed);
    const detail = [
      `${number(session.enemiesKilled)} Runden gewonnen`,
      `+${number(session.soulsEarned)} Seelen in dieser Session`,
      loot ? `Beute: ${loot}` : 'Keine Gegenstandsbeute',
      ...(session.towerRewards?.mailed ? [`Davon ${number(session.towerRewards.mailed)} Gegenstände im Briefkasten abgelegt`] : []),
      ...(missed ? [`Nicht aufgenommen: ${missed}`] : []),
      outcome,
    ].join(' · ');
    await queueActivity('Turm-Session beendet', detail).catch(() => {});
  } else {
    const detail = `${session.enemiesKilled} Gegner besiegt · +${number(session.soulsEarned)} Seelen in dieser Session · ${outcome}`;
    await queueActivity('Farm-Session beendet', detail).catch(() => {});
  }
}
function renderActivityPanel() {
  if (!activityList || !state) return;
  const entries = state.activityLog || [];
  if (activityBadge) {
    activityBadge.hidden = !state.activityUnread;
    activityBadge.textContent = state.activityUnread > 9 ? '9+' : String(state.activityUnread || '');
  }
  patchBackgroundMarkup(activityList, entries.length
    ? entries.map((entry) => `<article class="activity-entry"><span class="activity-entry-icon">✦</span><div><strong>${escapeHtml(entry.title)}</strong><p>${detailLinesMarkup(entry.detail)}</p><time>${new Date(entry.at).toLocaleString('de-DE', { dateStyle: 'short', timeStyle: 'short' })}</time></div></article>`).join('')
    : '<p class="activity-empty">Noch keine Aktivitäten. Belohnungen, Beute, Handwerksergebnisse und Farm-Zusammenfassungen erscheinen hier.</p>');
}
function renderMailboxPanel() {
  if (!mailboxList || !state) return;
  const entries = state.mailbox || [];
  const count = entries.length;
  if (mailboxCount) mailboxCount.textContent = `${count} / ${MAILBOX_CAPACITY}`;
  if (mailboxBadge) {
    mailboxBadge.hidden = !count;
    mailboxBadge.textContent = count > 9 ? '9+' : String(count || '');
  }
  patchBackgroundMarkup(mailboxList, count
    ? entries.map((mail) => {
      const canClaim = inventoryOccupiedSlots(state) + inventorySlotsNeeded(state, [mail.item]) <= state.inventoryCapacity;
      const source = mail.source === 'Kampfdrop' ? 'KAMPFDROP' : 'AUFTRAG';
      return `<article class="mailbox-entry" data-mailbox-item="${escapeHtml(mail.id)}"><span class="mailbox-item-icon-wrap ${itemVisualStyle(mail.item).special ? `inventory-item ${itemVisualClasses(mail.item)}` : itemVisualStyle(mail.item).rarity}">${itemVisualStyle(mail.item).special ? equipmentEmbersMarkup(mail.item) : ''}${equipmentIconMarkup(mail.item.slot, mail.item.icon, 'mailbox-item-icon item-icon')}</span><div class="mailbox-entry-copy"><small>${source}${isSellableEquipment(mail.item) ? ` · ${escapeHtml(mail.item.rarity || 'Beute')}` : ''}</small><strong>${escapeHtml(mail.item.name)}</strong><span>${escapeHtml(SLOT_DATA[mail.item.slot]?.label || mail.item.slot)}</span></div><button type="button" class="mailbox-claim-button ui-control ui-button ui-compact" data-claim-mailbox="${escapeHtml(mail.id)}" ${canClaim ? '' : 'disabled'}>${canClaim ? 'ABHOLEN' : 'INVENTAR VOLL'}</button></article>`;
    }).join('')
    : '<p class="mailbox-empty">Keine Beute im Briefkasten. Volles Inventar schickt Kampfdrops und Auftragsgegenstände hierher.</p>');
}
async function toggleActivityPanel(forceOpen) {
  if (!activityPanel || !activityToggle) return;
  const shouldOpen = forceOpen ?? activityPanel.hidden;
  activityPanel.hidden = !shouldOpen;
  activityToggle.setAttribute('aria-expanded', String(shouldOpen));
  if (shouldOpen && state?.activityUnread) {
    await enqueueStateTask(async () => {
      state.activityUnread = 0;
      renderActivityPanel();
      await writeSavedState(state);
    }).catch(() => {});
  }
}
function toggleMailboxPanel(forceOpen) {
  if (!mailboxPanel || !mailboxToggle) return;
  const shouldOpen = forceOpen ?? mailboxPanel.hidden;
  mailboxPanel.hidden = !shouldOpen;
  mailboxToggle.setAttribute('aria-expanded', String(shouldOpen));
  if (shouldOpen && activityPanel && !activityPanel.hidden) {
    activityPanel.hidden = true;
    activityToggle?.setAttribute('aria-expanded', 'false');
  }
}

