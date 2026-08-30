/*@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@
                   _ooOoo_
                  o8888888o
                  88" . "88
                  (| -_- |)
                  O\  =  /O
               ____/`---'\____
             .'  \\|     |//  `.
            /  \\|||  :  |||//  \
           /  _||||| -:- |||||-  \
           |   | \\\  -  /// |   |
           | \_|  ''\---/''  |   |
           \  .-\__  `-`  ___/-. /
         ___`. .'  /--.--\  `. . __
      ."" '<  `.___\_<|>_/___.'  >'"".
     | | :  `- \`.;`\ _ /`;.`/ - ` : | |
     \  \ `-.   \_ __\ /__ _/   .-` /  /
======`-.____`-.___\_____/___.-`____.-'======
                   `=---='
^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^
  PHẬT ĐỘ, CODE KHÔNG LỖI, TỐI ƯU KHÔNG BUG
            DEVELOPER: NGH
@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@*/

// PHẢI là import đầu tiên: chặn console.log/info/warn/error/debug ngay lập
// tức, ghi thẳng vào MongoDB (collection bot_logs) thay vì in ra terminal. Đặt trước
// mọi import khác để bắt được cả log phát sinh lúc các module bên dưới được
// nạp (import-time side effects), không chỉ log lúc chạy runtime.
import "./utils/sql-logger.js";
import "./utils/native-runtime.js";
import fs from "node:fs";
import path from "node:path";

// Đọc file .env ở thư mục gốc project (nếu có) để nạp các biến môi trường
// như ADMIN_PASSWORD, WEBHOOK_SECRET... Nếu chưa cài package "dotenv" hoặc
// chưa có file .env, dòng này sẽ không làm gì và không gây lỗi.
try {
  await import("dotenv/config");
} catch {
  console.warn(
    '[env] Chưa cài package "dotenv" nên không đọc được file .env. ' +
    "Chạy `npm install dotenv` nếu bạn muốn cấu hình qua file .env, " +
    "hoặc set biến môi trường trực tiếp trên hệ điều hành / PM2."
  );
}

import "./utils/shared-schedule.js";
import { API, MessageType, Zalo } from "./api-zalo/index.js";
import { handleAutoBlockOnJoin } from "./service-ngh/utilities/block-user-join.js";
import { handleTargetEnforcementOnJoin } from "./commands/bot-manager/target-enforcement.js";
import { gruopEvents } from "./automations/events-group.js";
import { groupSettingsAll, messagesUser, pruneMissingGroupSettings } from "./automations/event-send-msg.js";
import { undoMessageEvents } from "./automations/event-undo-msg.js";

import { DATA_ROOT, LOG_ROOT, readAdmins, readConfig, readCommandConfig, tempDir, writeAdmins } from "./utils/io-json.js";

import { logManagerBot } from "./utils/io-json.js";
import { getGlobalPrefix, initService } from "./service-ngh/service.js";
import { reactionEvents } from "./automations/events-reaction.js";
import { typingEvents } from "./automations/event-typing.msg.js";
import { enqueueMessageCache } from "./utils/message-cache.js";
import { enqueueConcurrentRuntimeTask, enqueueRuntimeTask } from "./utils/runtime-work-queue.js";
import { enqueueBackgroundTask } from "./utils/background-work-queue.js";
import { isInteractiveCommandContent, shouldCacheIncomingMessage, shouldProcessGroupMessage } from "./utils/message-routing.js";
import {
  hasAuthoritativeMembership,
  recordLiveGroupSnapshot,
  scheduleMembershipRetry,
} from "./utils/live-group-membership.js";
import { activeBotChildren, getDataBotFromOwnerCache } from "./manager-bot/index.js";
import { managerDataCache } from "./commands/bot-manager/active-bot.js";
import { getAllInfoUser } from "./service-ngh/info-service/user-info.js";
import { getDataAllGroup } from "./service-ngh/info-service/group-info.js";
import { startWebServer, PortManager } from "./web-service/web-server.js";
import { initializeDatabase } from "./database/index.js";
import { initializeCacheLinkService } from "./utils/link-platform-cache.js";
import { initializeGameBauCua } from "./service-ngh/game-service/bau-cua/bau-cua.js";
import { initializeGameChanLe } from "./service-ngh/game-service/chan-le/chan-le.js";
import { reportRuntimeError, runGuarded, setRuntimeMainApi, getRuntimeMainApi } from "./utils/runtime-guard.js";
import { cleanupTempDirectory, startRuntimeMaintenance, trimMessageLogs } from "./utils/runtime-maintenance.js";
import { startRuntimeHealthMonitor } from "./utils/runtime-health.js";

export const portManager = new PortManager(Math.max(1, Number(process.env.NGH_WEB_PORT) || 8000));

class ApiManager {
  constructor() {
    this.apiManagerObject = {};
  }

  async init(idBot, api, config) {
    const ownerId = config?.ownerId || idBot;
    const isMainBot = ownerId === idBot;
    this.apiManagerObject[idBot] = {
      id: idBot,
      apiZalo: api,
      ownerId: ownerId,
      isMainBot,
      timeStart: Date.now(),
    };
    const apiManager = this.apiManagerObject[idBot];
    apiManager.getDataConfig = () => (isMainBot ? configBotMain : getDataBotFromOwnerCache(ownerId) || {});
    apiManager.getListAdmin = () => getListAdminByIDBot(idBot) || [];
    apiManager.getDataManager = () => managerDataCache.get(idBot) || {};
    if (isMainBot) saveBotLeaderAlias(idBot, idBot);
    return apiManager;
  }

  get(idBot) {
    return this.apiManagerObject[idBot] || globalThis.__NGH_V2_API_CONTEXTS__?.get(String(idBot));
  }

  delete(idBot) {
    if (this.apiManagerObject[idBot]) {
      delete this.apiManagerObject[idBot];
    }
  }

  getWithOwner(id) {
    for (const apiManager of Object.values(this.apiManagerObject)) {
      if (apiManager.ownerId === id) {
        return apiManager;
      }
    }
    return null;
  }
}

export const apiManager = new ApiManager();
export const initApiManager = apiManager.init.bind(apiManager);
export const getApiManager = apiManager.get.bind(apiManager);
export const deleteApiManager = apiManager.delete.bind(apiManager);
export const getApiManagerWithOwner = apiManager.getWithOwner.bind(apiManager);

export class ApiClass {
  constructor(config) {
    this.config = config;
    this.api = null;
    this.zalo = null;
    this.botId = null;
    this.schedule = {};
    this.apiManager = null;
  }

  async init() {
    try {
      this.zalo = new Zalo(
        {
          cookie: this.config.cookie,
          imei: this.config.imei,
          userAgent: this.config.userAgent,
        },
        {
          selfListen: true,
          typeLogin: this.getTypePlatform(this.config.infoOwner?.typePlatform),
          apiVersion: Zalo.API_VERSION,
          showLogs: this.config.infoOwner?.showLogs || false,
        }
      );
      this.api = await this.zalo.login();
      this.botId = this.api.getBotId();
      this.api.apiManager = await initApiManager(this.botId, this.api, this.config);
      while (!this.api.accountInfo) {
        try {
          this.api.accountInfo = getAllInfoUser((await this.api.getProfileMe()).profile);
        } catch (error) {
          console.error(error);
          await new Promise((resolve) => setTimeout(resolve, 1000));
        }
      }
      setupBotListeners(this.api);
      return this.api;
    } catch (error) {
      throw error;
    }
  }

  getTypePlatform(type) {
    if (!type) return 24;
    const normalized = String(type).trim().toLowerCase();
    switch (normalized) {
      case "pc":
        return 24;
      case "web":
        return 30;
      default:
        if (normalized.includes("pc")) return 24;
        return 30;
    }
  }
}

const admins = readAdmins();
const botLeaderFile = path.join(DATA_ROOT, "data", "bot_leader.json");
let botLeaderAliases = {};
try {
  botLeaderAliases = JSON.parse(fs.readFileSync(botLeaderFile, "utf8"));
} catch {
  botLeaderAliases = {};
}

export function getBotLeaderAliases(botId) {
  return botLeaderAliases[botId?.toString()] || [];
}

function saveBotLeaderAlias(botId, userId) {
  const normalizedBotId = botId.toString();
  const normalizedUserId = userId.toString();
  const aliases = getBotLeaderAliases(normalizedBotId);
  if (aliases.includes(normalizedUserId)) return;
  botLeaderAliases[normalizedBotId] = [...aliases, normalizedUserId];
  fs.writeFileSync(botLeaderFile, JSON.stringify(botLeaderAliases, null, 2) + "\n");
}

export function getListAdminByIDBot(idBot) {
  if (!admins[idBot]) {
    admins[idBot] = [];
    writeAdmins(admins);
  }
  return admins[idBot];
}
export function updateListAdminByIDBot(botId, listAdmin) {
  admins[botId] = listAdmin;
  writeAdmins(admins);
}

let commandConfig = readCommandConfig();
export function getCommandConfig() {
  return commandConfig;
}

export function getManagerCommandConfig(botId) {
  if (!commandConfig.managerCommand) commandConfig.managerCommand = {};
  if (!commandConfig.managerCommand[botId])
    commandConfig.managerCommand[botId] = {
      notAllowedCommand: [],
      customerCommand: {},
    };
  return commandConfig.managerCommand[botId];
}

export function getMainBotCommandConfig() {
  if (!commandConfig.mainBotCommand) {
    commandConfig.mainBotCommand = { commands: [] };
  }
  if (!Array.isArray(commandConfig.mainBotCommand.commands)) {
    commandConfig.mainBotCommand.commands = [];
  }
  return commandConfig.mainBotCommand;
}

// Lệnh nằm trong danh sách này mặc định chỉ chạy trên bot mẹ. Bot con chỉ
// được chạy khi chính bot đó có tên lệnh trong grantedMainBotCommands.
export function canBotUseMainBotCommand(api, commandName, userId) {
  const normalizedCommand = String(commandName || "").trim().toLowerCase();
  if (!normalizedCommand) return true;

  const protectedCommands = getMainBotCommandConfig().commands;
  if (!protectedCommands.includes(normalizedCommand)) return true;

  const botId = api?.getBotId?.();
  const normalizedUserId = userId == null ? "" : String(userId);
  // Quyền mainbot thuộc về đúng Bot Leader/tài khoản bot mẹ, không phải mọi
  // adminLevelHigh. Bot Leader vẫn giữ quyền này khi ra lệnh qua bot con.
  if (
    isBotOwner(botId, normalizedUserId) ||
    (api?.apiManager?.isMainBot && normalizedUserId === String(botId)) ||
    (!api?.apiManager?.isMainBot && normalizedUserId === String(api?.apiManager?.idBotMainWithBot))
  ) {
    return true;
  }

  const configKeys = [botId, api?.apiManager?.ownerId]
    .filter((value) => value != null)
    .map(String);
  return configKeys.some((key) => {
    const granted = getManagerCommandConfig(key).grantedMainBotCommands;
    return Array.isArray(granted) && granted.includes(normalizedCommand);
  });
}
export function getManagerCommandCustomConfig(botId, nameCommand) {
  const mngrCommand = getManagerCommandConfig(botId);
  if (!mngrCommand.customerCommand[nameCommand]) mngrCommand.customerCommand[nameCommand] = {};
  return mngrCommand.customerCommand[nameCommand];
}

export function reloadCommandConfig() {
  commandConfig = readCommandConfig();
  return commandConfig;
}

export function isAdmin(botId, userId, threadId, groupAdmins) {
  const currentApiManager = getApiManager(botId);
  if (!currentApiManager) {
    return false;
  }
  const normalizedUserId = userId.toString();
  const listAdmin = currentApiManager.getListAdmin() || [];
  const leaderAliases = getBotLeaderAliases(botId);
  const mainBotManager = Object.values(apiManager.apiManagerObject).find((manager) => manager.isMainBot);
  const inheritedLeaderAdmins = currentApiManager.isMainBot ? [] : mainBotManager?.getListAdmin?.() || [];

  if (
    botId === userId ||
    listAdmin.includes(normalizedUserId) ||
    leaderAliases.includes(normalizedUserId) ||
    inheritedLeaderAdmins.includes(normalizedUserId) ||
    userId === currentApiManager.idBotMainWithBot
  ) {
    return true;
  }

  const groupSettings = groupSettingsAll.getByID(botId);
  if (threadId && groupSettings[threadId] && typeof groupSettings[threadId]["adminList"] === "object") {
    if (Object.keys(groupSettings[threadId]["adminList"]).includes(userId.toString())) {
      return true;
    }
  }

  if (groupAdmins && Array.isArray(groupAdmins) && groupAdmins.includes(userId.toString())) {
    return true;
  }

  return false;
}

// Bot Leader và các tài khoản được Bot Leader ủy quyền. Trên bot con, quyền
// này được kế thừa từ danh sách admin của bot chính, không lẫn với admin cục bộ.
export function isBotLeader(botId, userId) {
  const currentApiManager = getApiManager(botId);
  if (!currentApiManager || userId == null) return false;

  const normalizedUserId = userId.toString();
  const normalizedBotId = botId.toString();
  const mainBotManager = Object.values(apiManager.apiManagerObject).find((manager) => manager.isMainBot);
  const leaderAdmins = mainBotManager?.getListAdmin?.() || [];
  const delegatedAdmins = currentApiManager.getListAdmin?.() || [];
  const persistedLeaderAliases = getBotLeaderAliases(botId);

  return (
    (currentApiManager.isMainBot && normalizedUserId === normalizedBotId) ||
    delegatedAdmins.includes(normalizedUserId) ||
    persistedLeaderAliases.includes(normalizedUserId) ||
    leaderAdmins.includes(normalizedUserId) ||
    normalizedUserId === currentApiManager.idBotMainWithBot?.toString()
  );
}

// Danh tính chủ nhân thật của bot. Khác với isBotLeader(), hàm này không coi
// quản trị viên được ủy quyền là Nguyễn Gia Hưng.
export function isBotOwner(botId, userId) {
  if (botId == null || userId == null) return false;
  return getBotLeaderAliases(botId).includes(userId.toString());
}

const botLeaderGlobalIds = new Set();
const botLeaderCheckCache = new Map();
const BOT_LEADER_CHECK_TTL_MS = Math.max(60000, Number(process.env.NGH_IDENTITY_CACHE_TTL_MS) || 30 * 60 * 1000);
const MAX_BOT_LEADER_CHECKS = Math.max(1000, Number(process.env.NGH_IDENTITY_CACHE_SIZE) || 20000);

function getProfileById(response, userId) {
  const profiles = response?.profiles || {};
  return profiles[userId] || Object.values(profiles)[0] || null;
}

function getStableGlobalId(profile) {
  const globalId = profile?.globalId || profile?.global_id;
  return globalId && globalId !== "0" ? globalId.toString() : null;
}

// UID Zalo có thể khác nhau theo tài khoản bot. Hàm này đối chiếu globalId ổn
// định và tự lưu UID cục bộ, để mọi bot con hiện tại/lập sau đều nhận Bot Leader.
export async function inheritBotLeader(api, userId, displayName = "") {
  const currentApiManager = api?.apiManager;
  if (!currentApiManager || currentApiManager.isMainBot || userId == null) return false;

  const normalizedUserId = userId.toString();
  if (isBotOwner(api.getBotId(), normalizedUserId)) return true;
  const checkKey = `${api.getBotId()}:${normalizedUserId}`;
  const cachedCheck = botLeaderCheckCache.get(checkKey);
  if (cachedCheck && Date.now() - cachedCheck.checkedAt < BOT_LEADER_CHECK_TTL_MS) return cachedCheck.isLeader;

  const mainBotManager = Object.values(apiManager.apiManagerObject).find((manager) => manager.isMainBot);
  if (!mainBotManager?.apiZalo) return false;

  try {
    if (botLeaderGlobalIds.size === 0) {
      const ownerIds = getBotLeaderAliases(mainBotManager.id);
      for (const leaderId of ownerIds) {
        const response = await mainBotManager.apiZalo.getInfoMembers([leaderId.toString()]);
        const profile = getProfileById(response, leaderId.toString());
        const globalId = getStableGlobalId(profile);
        if (globalId) botLeaderGlobalIds.add(globalId);
      }
    }

    if (botLeaderGlobalIds.size === 0) return false;
    const response = await api.getInfoMembers([normalizedUserId]);
    const globalId = getStableGlobalId(getProfileById(response, normalizedUserId));
    if (!globalId || !botLeaderGlobalIds.has(globalId)) return false;

    const admins = currentApiManager.getListAdmin?.() || [];
    if (!admins.includes(normalizedUserId)) {
      updateListAdminByIDBot(api.getBotId(), [...admins, normalizedUserId]);
    }
    saveBotLeaderAlias(api.getBotId(), normalizedUserId);
    botLeaderCheckCache.set(checkKey, { isLeader: true, checkedAt: Date.now() });
    return true;
  } catch {
    return false;
  } finally {
    if (!botLeaderCheckCache.has(checkKey)) {
      botLeaderCheckCache.set(checkKey, { isLeader: false, checkedAt: Date.now() });
    }
    while (botLeaderCheckCache.size > MAX_BOT_LEADER_CHECKS) {
      botLeaderCheckCache.delete(botLeaderCheckCache.keys().next().value);
    }
  }
}

// Bot chính được khởi tạo trong một block scope nên không thể tham chiếu
// trực tiếp biến `api` ở đây. Lấy instance đã đăng ký trong runtime context.
export const getGlobalApi = () => getRuntimeMainApi() || globalThis.__NGH_V2_API_CONTEXTS__?.values().next().value?.apiZalo;

const configuredListeners = new WeakSet();
export function setupBotListeners(api) {
  if (!api?.listener || configuredListeners.has(api.listener)) return;
  configuredListeners.add(api.listener);
  let listenerRecoveryTimer = null;
  let childDisconnectTimer = null;
  let childDisconnectNotified = false;
  const childDisconnectGraceMs = Math.max(5_000, Number(process.env.NGH_CHILD_DISCONNECT_GRACE_MS) || 30_000);
  api.listener.on("connected", () => {
    if (childDisconnectTimer) {
      clearTimeout(childDisconnectTimer);
      childDisconnectTimer = null;
    }
    childDisconnectNotified = false;
  });
  api.listener.on("disconnected", (code) => {
    if (api.apiManager?.isMainBot === false && !api.__NGH_EXPECTED_SHUTDOWN__ && !childDisconnectNotified && !childDisconnectTimer) {
      // A 1006 is commonly a brief network interruption. Give the listener a
      // chance to reconnect and only alert the owner if the bot stays offline.
      childDisconnectTimer = setTimeout(() => {
        childDisconnectTimer = null;
        if (api.__NGH_EXPECTED_SHUTDOWN__ || api.listener?.ws?.readyState === 1) return;
        childDisconnectNotified = true;
        const error = new Error(`Kết nối bot con đã bị ngắt (WebSocket code: ${code ?? "unknown"})`);
        error.code = `WS_${code ?? "CLOSED"}`;
        void reportRuntimeError(api, "child_disconnected", error);
      }, code === 1006 ? childDisconnectGraceMs : 5_000);
      childDisconnectTimer.unref?.();
    }
  });

  // EventEmitter coi event "error" không có listener là uncaught exception.
  // Lỗi socket của một tài khoản (nhất là bot con hết phiên)
  // chỉ được ghi log, không được làm PM2 restart toàn bộ hệ thống.
  api.listener.on("error", (error) => {
    void reportRuntimeError(api, "listener_connection", error);
    if (listenerRecoveryTimer) return;
    listenerRecoveryTimer = setTimeout(async () => {
      listenerRecoveryTimer = null;
      try {
        // stop() removes every EventEmitter listener and makes the bot appear
        // connected while no longer processing messages. reset() only replaces
        // the socket, preserving the handlers registered in this function.
        api.listener.reset();
        await new Promise((resolve) => setTimeout(resolve, 1000));
        api.listener.start();
      } catch (restartError) {
        await reportRuntimeError(api, "listener_recovery", restartError);
      }
    }, 5000);
  });

  // Xử Lý Tin Nhắn Riêng Và Tin Nhắn Nhóm
  api.listener.on("message", async (message) => {
    const receivedAt = performance.now();
    // Ghi cache là tác vụ phụ: không để một round-trip database làm chậm
    // luồng phản hồi của bot. Queue riêng và có giới hạn để DB chậm không
    // khiến số promise tăng vô hạn.
    const incomingContent = message.data?.content;
    const isSensitiveAttack = message.type === MessageType.DirectMessage &&
      typeof incomingContent === "string" && /^\s*\S*attack\s+(?!send\b)/i.test(incomingContent);
    const groupLoggingEnabled = process.env.NGH_GROUP_MESSAGE_LOG === "1";
    if (
      !isSensitiveAttack &&
      shouldCacheIncomingMessage(message.type, MessageType.GroupMessage, groupLoggingEnabled)
    ) {
      enqueueMessageCache(api.getBotId(), message, { persist: true });
    }

    // Message handlers may contain slow downloads, AI calls or media rendering.
    // Do not serialize all commands behind one slow command in the same group;
    // command/game modules already own their session-level locking. The global
    // pool still bounds concurrency so a busy group cannot create unlimited work.
    let handlerStartedAt = 0;
    let handlerElapsedMs = 0;
    const runMessage = async () => {
      handlerStartedAt = performance.now();
      const startedAt = performance.now();
      // Không circuit-break toàn bộ luồng chat: một command lỗi không được
      // phép làm bot ngừng nhận các command còn lại.
      await runGuarded(api, "message", () => messagesUser(api, message), { maxFailures: Infinity });
      const elapsedMs = performance.now() - startedAt;
      handlerElapsedMs = elapsedMs;
      if (elapsedMs >= 1500) {
        logManagerBot(`[runtime:slow_message] bot=${api.getBotId()} thread=${message.threadId || "unknown"} type=${message.type} elapsedMs=${Math.round(elapsedMs)} contentType=${typeof message.data?.content}`);
      }
    };
    const textContent = typeof incomingContent === "string" ? incomingContent.trimStart() : "";
    const commandPrefix = getGlobalPrefix(api.getBotId());
    const isCommand = isInteractiveCommandContent(textContent, commandPrefix);
    if (message.type === MessageType.GroupMessage) {
      const settings = groupSettingsAll.getByID(api.getBotId())?.[message.threadId];
      if (!shouldProcessGroupMessage(settings, { isCommand, message })) return;
    }
    const options = {
      // Commands should not sit behind ordinary chat/auto-service handlers in
      // the shared pool. Private messages retain the same interactive class.
      priority: message.type === MessageType.DirectMessage || isCommand ? 1 : 0,
      key: `${api.getBotId()}:${message.threadId || message.data?.uidFrom || "unknown"}`,
    };
    await enqueueConcurrentRuntimeTask(runMessage, options);
    if (isCommand && process.env.NGH_COMMAND_LATENCY_LOG === "1") {
      const finishedAt = performance.now();
      const commandName = /^prefix(?:\s|$)/iu.test(textContent)
        ? "prefix"
        : textContent.slice(commandPrefix.length).trim().split(/\s+/u)[0] || "unknown";
      // Bypass console/sql logging: telemetry itself must not wait on MongoDB.
      process.stderr.write(
        `[command-latency] bot=${api.getBotId()} command=${commandName} ` +
        `queueMs=${Math.round(Math.max(0, handlerStartedAt - receivedAt))} ` +
        `handlerMs=${Math.round(handlerElapsedMs)} totalMs=${Math.round(finishedAt - receivedAt)}\n`
      );
    }
  });

  // Xử Lý Sự Kiện Nhóm
  api.listener.on("group_event", async (event) => {
    const threadId = event.threadId || event.data?.groupId || event.data?.grid || event.data?.id || "group-event";
    await enqueueRuntimeTask(`${api.getBotId()}:${threadId}`, () => runGuarded(api, "group_event", async () => {
      await gruopEvents(api, event);
      await handleAutoBlockOnJoin ( api,event);
      await handleTargetEnforcementOnJoin(api, event);
    }));
  });

  //Xử Lý Sự Kiện Undo Message
  api.listener.on("undo", async (undo) => {
    const threadId = undo.threadId || undo.data?.idTo || undo.data?.uidFrom || "undo";
    await enqueueRuntimeTask(`${api.getBotId()}:${threadId}`, () =>
      runGuarded(api, "undo_event", () => undoMessageEvents(api, undo))
    );
  });

  //Xử Lý Sự Kiện Reaction
  api.listener.on("reaction", async (reaction) => {
    const threadId = reaction.threadId || reaction.data?.idTo || reaction.data?.grid || "reaction";
    await enqueueRuntimeTask(`${api.getBotId()}:${threadId}`, () =>
      runGuarded(api, "reaction_event", () => reactionEvents(api, reaction))
    );
  });

  //Xử Lý Sự Kiện Typing
  // api.listener.on("typing", async (typing) => {
  //   try {
  //     await typingEvents(api, typing);
  //   } catch (error) {
  //     const detailError =
  // api.getBotId() +
  //   `Mã Lỗi: ${error.code} - > Chú Thích Lỗi Sự Kiện Typing: ${error.message}\nNội Dung Lỗi: ${error.stack}`;
  //     console.error(detailError);
  //     logManagerBot(detailError);
  //   }
  // });

  //Xử Lý Sự Kiện Delivery Message
  api.listener.on("delivered_messages", async (delivered) => {
    try {
    } catch (error) {
      const detailError =
        api.getBotId() +
        ` -> Mã Lỗi: ${error.code} - > Chú Thích Lỗi Sự Kiện Delivery Message: ${error.message}\nNội Dung Lỗi: ${error.stack}`;
      console.error(detailError);
    }
  });

  // Xử Lý Sự Kiện Seen Message
  api.listener.on("seen_messages", async (seen) => {
    try {
      // console.log(seen);
      // await seenMessageEvents(api, seen);
    } catch (error) {
      const detailError =
        api.getBotId() +
        ` -> Mã Lỗi: ${error.code} - > Chú Thích Lỗi Sự Kiện Seen Message: ${error.message}\nNội Dung Lỗi: ${error.stack}`;
      console.error(detailError);
    }
  });

  api.listener.start();
}

export async function createBot(config) {
  try {
    const apiInstance = new ApiClass(config);
    await apiInstance.init();
    apiInstance.api.apiInstance = apiInstance;
    await initService(apiInstance.api);
    const botId = apiInstance.api.getBotId();
    const reconcileGroups = (attempt = 1) => {
      const warmup = enqueueBackgroundTask(`group-cache:${botId}`, async () => {
        const groups = await getDataAllGroup(apiInstance.api);
        if (!hasAuthoritativeMembership(groups)) {
          throw new Error("Zalo chưa trả danh sách nhóm live hợp lệ");
        }
        const removed = pruneMissingGroupSettings(apiInstance.api, groups);
        if (removed > 0) await groupSettingsAll.save();
        await recordLiveGroupSnapshot(DATA_ROOT, botId, groups, removed);
        console.log(`[group-cache] Bot ${botId}: ${groups.activeGroupIds.length} nhóm live, dọn ${removed} cấu hình cũ`);
        return groups;
      });
      if (!warmup.accepted) {
        scheduleMembershipRetry(attempt, () => reconcileGroups(attempt + 1));
        return;
      }
      void warmup.promise.catch((error) => {
        console.warn(`[group-cache] Lần ${attempt} bot ${botId} lỗi: ${error?.message || error}`);
        scheduleMembershipRetry(attempt, () => reconcileGroups(attempt + 1));
      });
    };
    reconcileGroups();
    return apiInstance.api;
  } catch (error) {
    console.error("Lỗi khi tạo bot:", error);
    throw error;
  }
}

// Lỗi đã được bắt ở từng handler sẽ không làm chết tiến trình. Chỉ những lỗi
// lọt ra ngoài toàn bộ lớp bảo vệ mới buộc process thoát để PM2/bot.js dựng lại
// một trạng thái sạch, tránh process treo nhưng vẫn mang trạng thái hỏng.
if (process.env.NGH_LEGACY_LIBRARY !== "1" && process.env.NGH_SERVICE_LIBRARY !== "1" && !globalThis.__NGHUNG_FATAL_GUARD__) {
  globalThis.__NGHUNG_FATAL_GUARD__ = true;
  let exitingOnFatal = false;
  const exitOnFatal = (kind, reason) => {
    if (exitingOnFatal) return;
    exitingOnFatal = true;
    const error = reason instanceof Error ? reason : new Error(String(reason));
    const detail = `[fatal:${kind}] ${error.message}\n${error.stack || ""}`;
    console.error(detail);
    process.exitCode = 1;
    setTimeout(() => process.exit(1), 250).unref();
  };
  process.on("uncaughtException", (error) => exitOnFatal("uncaughtException", error));
  process.on("unhandledRejection", (reason) => exitOnFatal("unhandledRejection", reason));
}

let configBotMain = readConfig();
let sharedServiceInfrastructure;
export function initializeSharedServices(api) {
  sharedServiceInfrastructure ||= Promise.all([
    initializeDatabase(), initializeCacheLinkService(), initializeGameBauCua(), initializeGameChanLe(),
  ]);
  return sharedServiceInfrastructure.then(() => initService(api));
}
export const initializeLegacyCompatibility = initializeSharedServices;

// Khi được v2 import làm thư viện tương thích, tuyệt đối không khởi động thêm
// database/web/listener hoặc đăng nhập bot lần thứ hai.
if (process.env.NGH_LEGACY_LIBRARY !== "1" && process.env.NGH_SERVICE_LIBRARY !== "1") {
  const startupMaintenance = await Promise.all([
    cleanupTempDirectory({ directory: tempDir }),
    trimMessageLogs({ directory: LOG_ROOT }),
  ]);
  if (startupMaintenance.some((result) => result.removedFiles || result.trimmedFiles)) {
    logManagerBot(`[maintenance] ${JSON.stringify(startupMaintenance)}`);
  }
  await Promise.all([initializeDatabase(), initializeCacheLinkService()]);
  await Promise.all([initializeGameBauCua(), initializeGameChanLe()]);
  const api = await createBot(configBotMain);
  setRuntimeMainApi(api);
  startRuntimeMaintenance({
    tempDirectory: tempDir,
    logDirectory: LOG_ROOT,
    onResult: (result) => {
      if (result.error) void reportRuntimeError(api, "runtime_maintenance", result.error);
    },
  });
  startRuntimeHealthMonitor(api, {
    onHealth: (health) => {
      const error = health.error || new Error(`Health degraded: ${JSON.stringify(health)}`);
      void reportRuntimeError(api, "runtime_health", error);
    },
  });
  await startWebServer();
  await activeBotChildren(api);
  const { resumeGiveaway } = await import("./service-ngh/game-service/giveaway/giveaway.js");
  await resumeGiveaway(api);
  process.on("SIGUSR2", () => {
    const childManager = Object.values(apiManager.apiManagerObject).find((item) => !item.isMainBot);
    if (!childManager?.apiZalo) return;
    void reportRuntimeError(childManager.apiZalo, "self_test", Object.assign(new Error("Đây là cảnh báo thử nghiệm, bot vẫn hoạt động bình thường."), { code: "SELF_TEST" }));
  });
}
