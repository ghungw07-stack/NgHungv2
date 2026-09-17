const tables = new Map();
let sequence = 0;

export function registerQuickBetTable(botId, threadId, command, game, normalizeDoor) {
  const key = JSON.stringify([String(botId), String(threadId), command]);
  if (tables.get(key)?.game === game) return;
  tables.set(key, { botId: String(botId), threadId: String(threadId), command, game, normalizeDoor, sequence: ++sequence });
}

export function closeQuickBetTable(game) {
  for (const [key, table] of tables) if (table.game === game) tables.delete(key);
}

export function resolveQuickBet(botId, threadId, content, now = Date.now()) {
  if (typeof content !== "string") return null;
  const match = content.trim().match(/^(.+?)\s+([\d,.]+[kmb]?|allin|all|[\d,.]+%)$/iu);
  if (!match) return null;
  let selected = null;
  for (const [key, table] of tables) {
    if (table.game.expiresAt <= now) { tables.delete(key); continue; }
    if (table.botId !== String(botId) || table.threadId !== String(threadId)) continue;
    if (!table.normalizeDoor(match[1])) continue;
    if (!selected || table.sequence > selected.sequence) selected = table;
  }
  return selected ? { command: selected.command, game: selected.game, payload: content.trim() } : null;
}
