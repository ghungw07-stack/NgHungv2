export function restoreXoSoSession(savedSession, latestHistoryCode = 0) {
  if (!savedSession || typeof savedSession !== "object" || !savedSession.isRunning) return null;
  const sessionCode = Number(savedSession.sessionCode);
  const latestCode = Number(latestHistoryCode || 0);
  const isSettling = savedSession.phase === "settling" || Boolean(savedSession.result);
  if (
    !Number.isInteger(sessionCode) ||
    sessionCode <= 0 ||
    sessionCode < latestCode ||
    (sessionCode === latestCode && !isSettling)
  ) return null;

  return {
    sessionCode,
    players: savedSession.players && typeof savedSession.players === "object" ? savedSession.players : {},
    startTime: Number(savedSession.startTime) || Date.now(),
    endTime: Number(savedSession.endTime) || Date.now(),
    isRunning: true,
    notified15s: Boolean(savedSession.notified15s),
    phase: isSettling ? "settling" : "betting",
    result: savedSession.result && typeof savedSession.result === "object" ? savedSession.result : null,
    resultTimestamp: Number(savedSession.resultTimestamp) || null,
    resultTimeStr: savedSession.resultTimeStr || null,
    settledPlayerIds: Array.isArray(savedSession.settledPlayerIds)
      ? [...new Set(savedSession.settledPlayerIds.map(String))]
      : [],
  };
}

export function upsertXoSoHistory(history = [], historyItem, maxHistory = 20) {
  return [historyItem, ...history.filter((item) => Number(item?.sessionCode) !== Number(historyItem.sessionCode))]
    .slice(0, maxHistory);
}
