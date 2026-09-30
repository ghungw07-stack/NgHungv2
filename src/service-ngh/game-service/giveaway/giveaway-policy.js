function isEnabled(value) {
  return value === true || value === "true";
}

export function isActiveGiveawayGroup(settings) {
  return isEnabled(settings?.activeBot) && isEnabled(settings?.activeGame);
}

export function isMainBotRuntime(api) {
  return api?.apiManager?.isMainBot === true;
}

export function giveawayParticipantKey(participant) {
  return String(participant?.playerId || participant?.uid || "").replace(/_0$/u, "");
}

export function findGiveawayParticipant(participants, playerId, uid = null) {
  const canonicalKey = String(playerId || "").replace(/_0$/u, "");
  const uidKey = String(uid || "").replace(/_0$/u, "");
  return (participants || []).find((participant) => {
    const participantKey = giveawayParticipantKey(participant);
    const participantUid = String(participant?.uid || "").replace(/_0$/u, "");
    return (canonicalKey && participantKey === canonicalKey) || (uidKey && participantUid === uidKey);
  }) || null;
}

/**
 * Chỉ lấy nhóm của các API đang online và đang bật đồng thời bot + game.
 * Một cặp bot/nhóm chỉ xuất hiện đúng một lần trong Giveaway toàn hệ thống.
 */
export function collectActiveGiveawayGroups(managers, settingsByBot) {
  const groups = [];
  const seen = new Set();

  for (const manager of Object.values(managers || {})) {
    const targetApi = manager?.apiZalo;
    const botId = String(targetApi?.getBotId?.() || "");
    if (!targetApi || !botId) continue;

    const botGroups = settingsByBot?.[botId] || {};
    for (const [threadId, settings] of Object.entries(botGroups)) {
      if (!isActiveGiveawayGroup(settings)) continue;
      const key = `${botId}:${threadId}`;
      if (seen.has(key)) continue;
      seen.add(key);
      groups.push({
        threadId: String(threadId),
        botId,
        name: settings?.nameGroup || String(threadId),
      });
    }
  }

  return groups;
}
