const pendingBets = new Map();

// Serialize balance reads/debits for repeated bets, including across both games.
export async function withPlayerBetLock(playerId, action) {
  const key = String(playerId);
  const previous = pendingBets.get(key) || Promise.resolve();
  const current = previous.catch(() => {}).then(action);
  pendingBets.set(key, current);
  try {
    return await current;
  } finally {
    if (pendingBets.get(key) === current) pendingBets.delete(key);
  }
}
