import path from "path";
import { DatabaseSync } from "node:sqlite";
const db = new DatabaseSync(path.join(process.cwd(), "assets", "data", "nova.sqlite"));
db.exec(`
  PRAGMA journal_mode = WAL;
  CREATE TABLE IF NOT EXISTS nova_group_settings (
    bot_id TEXT NOT NULL, thread_id TEXT NOT NULL, enabled INTEGER NOT NULL DEFAULT 0,
    updated_at INTEGER NOT NULL, PRIMARY KEY (bot_id, thread_id)
  );
  CREATE TABLE IF NOT EXISTS nova_group_routes (
    thread_id TEXT PRIMARY KEY, bot_id TEXT NOT NULL, updated_at INTEGER NOT NULL
  );
  CREATE TABLE IF NOT EXISTS nova_sessions (
    bot_id TEXT NOT NULL, thread_id TEXT NOT NULL, user_id TEXT NOT NULL,
    active INTEGER NOT NULL DEFAULT 1, history_json TEXT NOT NULL DEFAULT '[]',
    updated_at INTEGER NOT NULL, PRIMARY KEY (bot_id, thread_id, user_id)
  );
  CREATE TABLE IF NOT EXISTS nova_pending_music (
    bot_id TEXT NOT NULL, thread_id TEXT NOT NULL, user_id TEXT NOT NULL,
    query TEXT NOT NULL, updated_at INTEGER NOT NULL,
    PRIMARY KEY (bot_id, thread_id, user_id)
  );
  CREATE TABLE IF NOT EXISTS nova_voice_metadata (
    voice_url TEXT PRIMARY KEY, thread_id TEXT NOT NULL, metadata_json TEXT NOT NULL,
    updated_at INTEGER NOT NULL
  );
`);

// Zalo có thể luân phiên trả cùng một UID ở dạng `123` và `123_0`.
// Chuẩn hóa bot/user ID để phiên Nova không bị mất ở tin nhắn kế tiếp.
const normalizeId = (value) => String(value ?? "").replace(/_0$/u, "").split("_")[0];
const ids = (botId, threadId, userId) => [normalizeId(botId), String(threadId), normalizeId(userId)];

export function isNovaEnabled(botId, threadId) {
  return db.prepare("SELECT enabled FROM nova_group_settings WHERE bot_id=? AND thread_id=?")
    .get(normalizeId(botId), String(threadId))?.enabled === 1;
}

export function setNovaEnabled(botId, threadId, enabled) {
  const b = normalizeId(botId);
  const t = String(threadId);
  if (enabled) setNovaGroupBot(b, t);
  db.prepare(`INSERT INTO nova_group_settings(bot_id,thread_id,enabled,updated_at) VALUES(?,?,?,?)
    ON CONFLICT(bot_id,thread_id) DO UPDATE SET enabled=excluded.enabled,updated_at=excluded.updated_at`)
    .run(b, t, enabled ? 1 : 0, Date.now());

  if (!enabled) {
    db.prepare("DELETE FROM nova_sessions WHERE bot_id=? AND thread_id=?").run(b, t);
    db.prepare("DELETE FROM nova_pending_music WHERE bot_id=? AND thread_id=?").run(b, t);
  }
}

export function isNovaGroupBot(botId, threadId) {
  const row = db.prepare("SELECT bot_id FROM nova_group_routes WHERE thread_id=?").get(String(threadId));
  return row ? row.bot_id === normalizeId(botId) : null;
}

export function setNovaGroupBot(botId, threadId) {
  const b = normalizeId(botId);
  const t = String(threadId);
  db.prepare(`INSERT INTO nova_group_routes(thread_id,bot_id,updated_at) VALUES(?,?,?)
    ON CONFLICT(thread_id) DO UPDATE SET bot_id=excluded.bot_id,updated_at=excluded.updated_at`)
    .run(t, b, Date.now());
  // UID người dùng được Zalo scope theo từng tài khoản bot, vì vậy phải xóa
  // theo cả nhóm thay vì cố đối chiếu user_id giữa các bot.
  db.prepare("DELETE FROM nova_sessions WHERE thread_id=? AND bot_id<>?").run(t, b);
  db.prepare("DELETE FROM nova_pending_music WHERE thread_id=? AND bot_id<>?").run(t, b);
}

export function disableNovaEverywhere() {
  db.prepare("UPDATE nova_group_settings SET enabled=0,updated_at=?").run(Date.now());
  db.exec("DELETE FROM nova_sessions; DELETE FROM nova_pending_music;");
}

export function isSessionActive(botId, threadId, userId) {
  return db.prepare("SELECT active FROM nova_sessions WHERE bot_id=? AND thread_id=? AND user_id=?")
    .get(...ids(botId, threadId, userId))?.active === 1;
}

export function activateSession(botId, threadId, userId) {
  const [b, t, u] = ids(botId, threadId, userId);
  if (!b || !u || b === u) return;
  setNovaGroupBot(b, t);
  db.prepare(`INSERT INTO nova_sessions(bot_id,thread_id,user_id,active,history_json,updated_at) VALUES(?,?,?,1,'[]',?)
    ON CONFLICT(bot_id,thread_id,user_id) DO UPDATE SET active=1,updated_at=excluded.updated_at`)
    .run(b, t, u, Date.now());
}

export function closeSession(botId, threadId, userId) {
  db.prepare("DELETE FROM nova_sessions WHERE bot_id=? AND thread_id=? AND user_id=?").run(...ids(botId, threadId, userId));
  clearPendingMusic(botId, threadId, userId);
}

export function getHistory(botId, threadId, userId) {
  const row = db.prepare("SELECT history_json FROM nova_sessions WHERE bot_id=? AND thread_id=? AND user_id=?")
    .get(...ids(botId, threadId, userId));
  try { return JSON.parse(row?.history_json || "[]"); } catch { return []; }
}

export function setHistory(botId, threadId, userId, history) {
  activateSession(botId, threadId, userId);
  db.prepare("UPDATE nova_sessions SET history_json=?,updated_at=? WHERE bot_id=? AND thread_id=? AND user_id=?")
    .run(JSON.stringify(history), Date.now(), ...ids(botId, threadId, userId));
}

export function clearHistory(botId, threadId, userId) {
  db.prepare("UPDATE nova_sessions SET history_json='[]',updated_at=? WHERE bot_id=? AND thread_id=? AND user_id=?")
    .run(Date.now(), ...ids(botId, threadId, userId));
}

export function setPendingMusic(botId, threadId, userId, query) {
  const [b, t, u] = ids(botId, threadId, userId);
  db.prepare(`INSERT INTO nova_pending_music(bot_id,thread_id,user_id,query,updated_at) VALUES(?,?,?,?,?)
    ON CONFLICT(bot_id,thread_id,user_id) DO UPDATE SET query=excluded.query,updated_at=excluded.updated_at`)
    .run(b, t, u, String(query), Date.now());
}

export function getPendingMusic(botId, threadId, userId) {
  return db.prepare("SELECT query FROM nova_pending_music WHERE bot_id=? AND thread_id=? AND user_id=?")
    .get(...ids(botId, threadId, userId))?.query || null;
}

export function clearPendingMusic(botId, threadId, userId) {
  db.prepare("DELETE FROM nova_pending_music WHERE bot_id=? AND thread_id=? AND user_id=?").run(...ids(botId, threadId, userId));
}

export function saveVoiceMetadata(threadId, voiceUrl, metadata) {
  db.prepare(`INSERT INTO nova_voice_metadata(voice_url,thread_id,metadata_json,updated_at) VALUES(?,?,?,?)
    ON CONFLICT(voice_url) DO UPDATE SET metadata_json=excluded.metadata_json,updated_at=excluded.updated_at`)
    .run(String(voiceUrl), String(threadId), JSON.stringify(metadata), Date.now());
}

export function findVoiceMetadata(threadId, urls = []) {
  for (const url of urls.filter(Boolean)) {
    const row = db.prepare("SELECT metadata_json FROM nova_voice_metadata WHERE voice_url=?").get(String(url));
    if (row) try { return JSON.parse(row.metadata_json); } catch {}
  }
  const row = db.prepare("SELECT metadata_json FROM nova_voice_metadata WHERE thread_id=? ORDER BY updated_at DESC LIMIT 1")
    .get(String(threadId));
  if (row) try { return JSON.parse(row.metadata_json); } catch {}
  return null;
}
