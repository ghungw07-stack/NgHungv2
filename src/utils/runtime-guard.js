import { MessageType } from "../api-zalo/index.js";
import { logManagerBot } from "./io-json.js";

const states = new Map();
const notificationCache = new Map();
const WINDOW_MS = 60_000;
const NOTIFY_COOLDOWN_MS = 5 * 60_000;
const ENABLE_RUNTIME_ERROR_NOTIFICATIONS = false;
let mainApi = null;

export function setRuntimeMainApi(api) {
  mainApi = api || null;
}

export function getRuntimeMainApi() {
  return mainApi;
}

function normalizeError(error) {
  return {
    message: error?.message || String(error),
    code: error?.code || "UNKNOWN",
    stack: String(error?.stack || "").split("\n").slice(0, 6).join("\n"),
  };
}

async function sendDirect(api, targetId, message) {
  if (!targetId || !api) return;
  if (typeof api.sendMessageForward === "function") {
    await api.sendMessageForward({ msg: message, antiDelete: false }, String(targetId), MessageType.DirectMessage, 0);
    return;
  }
  await api.sendMessage({ msg: message }, String(targetId), MessageType.DirectMessage);
}

export async function reportRuntimeError(api, scope, error, extra = {}) {
  const info = normalizeError(error);
  const botId = api?.getBotId?.() || "unknown";
  const isMainBot = api?.apiManager?.isMainBot !== false;
  const ownerId = api?.apiManager?.ownerId;
  const mainBotId = api?.apiManager?.idBotMainWithBot;
  const fingerprint = `${botId}:${scope}:${info.code}:${info.message}`;
  const now = Date.now();

  const detail = `[runtime:${scope}] bot=${botId} code=${info.code} ${info.message}\n${info.stack}`;
  console.error(detail);
  logManagerBot(detail);

  if (!ENABLE_RUNTIME_ERROR_NOTIFICATIONS || isMainBot || !api) return;
  if (now - (notificationCache.get(fingerprint) || 0) < NOTIFY_COOLDOWN_MS) return;
  notificationCache.set(fingerprint, now);

  const notice =
    `⚠️ BOT CON GẶP LỖI\n` +
    `🤖 Bot: ${api.accountInfo?.name || botId}\n` +
    `🧩 Chức năng: ${scope}\n` +
    `🔢 Mã lỗi: ${info.code}\n` +
    `📝 Nội dung: ${info.message}` +
    (extra.disabledUntil ? `\n⏸ Tạm tắt đến: ${new Date(extra.disabledUntil).toLocaleString("vi-VN")}` : "");

  const routes = [];
  // Bot con có UID của main theo góc nhìn của nó nên có thể báo trực tiếp
  // vào inbox main. ownerId lại được lưu theo góc nhìn main bot, vì vậy phải
  // dùng API main để gửi; dùng API bot con thường bị Zalo trả lỗi không rõ.
  if (mainBotId) routes.push({ senderApi: api, targetId: String(mainBotId), route: "child->main" });
  if (mainApi) {
    const mainBotIdSelf = String(mainApi.getBotId?.() || "");
    const mainAdmins = mainApi.apiManager?.getListAdmin?.() || [];
    for (const adminId of mainAdmins) {
      if (adminId && String(adminId) !== mainBotIdSelf) {
        routes.push({ senderApi: mainApi, targetId: String(adminId), route: "main->admin" });
      }
    }
    // Owner vẫn là fallback khi chưa cấu hình admin main.
    if (!mainAdmins.length && ownerId) {
      routes.push({ senderApi: mainApi, targetId: String(ownerId), route: "main->owner-fallback" });
    }
  }

  for (const { senderApi, targetId, route } of routes) {
    try {
      await sendDirect(senderApi, targetId, notice);
      if (scope === "self_test") {
        logManagerBot(`[runtime:self_test] Đã gửi cảnh báo qua ${route} tới ${targetId}`);
      }
    } catch (notifyError) {
      const notifyDetail = `[runtime:${scope}] Không thể báo lỗi (${route}) tới ${targetId}: ${notifyError?.message || notifyError}`;
      console.error(notifyDetail);
      logManagerBot(notifyDetail);
    }
  }
}

export async function runGuarded(api, scope, task, options = {}) {
  const maxFailures = options.maxFailures === Infinity
    ? Infinity
    : (Number.isFinite(options.maxFailures) ? options.maxFailures : 3);
  const cooldownMs = Number.isFinite(options.cooldownMs) ? options.cooldownMs : 2 * 60_000;
  const now = Date.now();
  const key = `${api?.getBotId?.() || "unknown"}:${scope}`;
  let state = states.get(key) || { failures: [], disabledUntil: 0 };

  if (state.disabledUntil > now) return { ok: false, skipped: true, disabledUntil: state.disabledUntil };
  if (state.disabledUntil) state = { failures: [], disabledUntil: 0 };

  try {
    const value = await task();
    if (state.failures.length) states.set(key, { failures: [], disabledUntil: 0 });
    return { ok: true, value };
  } catch (error) {
    state.failures = state.failures.filter((time) => now - time < WINDOW_MS);
    state.failures.push(now);
    if (state.failures.length >= maxFailures) state.disabledUntil = now + cooldownMs;
    states.set(key, state);
    await reportRuntimeError(api, scope, error, { disabledUntil: state.disabledUntil || 0 });
    return { ok: false, error, disabledUntil: state.disabledUntil || 0 };
  }
}
