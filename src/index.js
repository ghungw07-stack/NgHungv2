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
import fs from "node:fs";

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
import { API, Zalo } from "./api-zalo/index.js";
import { handleAutoBlockOnJoin } from "./service-dqt/utilities/block-user-join.js";
import { handleTargetEnforcementOnJoin } from "./commands/bot-manager/target-enforcement.js";
import { gruopEvents } from "./automations/events-group.js";
import { groupSettingsAll, messagesUser } from "./automations/event-send-msg.js";
import { undoMessageEvents } from "./automations/event-undo-msg.js";

import { readAdmins, readConfig, readCommandConfig, writeAdmins } from "./utils/io-json.js";

import { logManagerBot } from "./utils/io-json.js";
import { initService } from "./service-dqt/service.js";
import { reactionEvents } from "./automations/events-reaction.js";
import { typingEvents } from "./automations/event-typing.msg.js";
import { updateMessageCache } from "./utils/message-cache.js";
import { activeBotChildren, getDataBotFromOwnerCache } from "./manager-bot/index.js";
import { managerDataCache } from "./commands/bot-manager/active-bot.js";
import { getAllInfoUser } from "./service-dqt/info-service/user-info.js";
import { startWebServer, PortManager } from "./web-service/web-server.js";
import { initializeDatabase } from "./database/index.js";
import { initializeCacheLinkService } from "./utils/link-platform-cache.js";
import { initializeGameBauCua } from "./service-dqt/game-service/bau-cua/bau-cua.js";
import { initializeGameChanLe } from "./service-dqt/game-service/chan-le/chan-le.js";
import { reportRuntimeError, runGuarded, setRuntimeMainApi } from "./utils/runtime-guard.js";

export const portManager = new PortManager(8000);

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
    return this.apiManagerObject[idBot];
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
    if (!type) return 30;
    switch (type) {
      case "pc":
        return 24;
      case "web":
        return 30;
      default:
        return 30;
    }
  }
}

const admins = readAdmins();
const botLeaderFile = new URL("../assets/data/bot_leader.json", import.meta.url);
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
    return true;
  } catch {
    return false;
  }
}

export const getGlobalApi = () => {
  return api;
};

export function setupBotListeners(api) {
  const MAX_CONCURRENT_MESSAGES = 6;
  const MAX_PENDING_MESSAGES = 100;
  const MAX_CONCURRENT_CACHE_WRITES = 2;
  const MAX_PENDING_CACHE_WRITES = 500;
  let activeMessageTasks = 0;
  const pendingMessageTasks = [];
  let activeCacheWrites = 0;
  const pendingCacheWrites = [];
  let listenerRecoveryTimer = null;

  // EventEmitter coi event "error" không có listener là uncaught exception.
  // Lỗi socket của một tài khoản (nhất là bot con hết phiên)
  // chỉ được ghi log, không được làm PM2 restart toàn bộ hệ thống.
  api.listener.on("error", (error) => {
    void reportRuntimeError(api, "listener_connection", error);
    if (listenerRecoveryTimer) return;
    listenerRecoveryTimer = setTimeout(async () => {
      listenerRecoveryTimer = null;
      try {
        api.listener.stop();
        await new Promise((resolve) => setTimeout(resolve, 1000));
        api.listener.start();
      } catch (restartError) {
        await reportRuntimeError(api, "listener_recovery", restartError);
      }
    }, 5000);
  });

  const drainMessageTasks = () => {
    while (activeMessageTasks < MAX_CONCURRENT_MESSAGES && pendingMessageTasks.length > 0) {
      const { task, resolve } = pendingMessageTasks.shift();
      activeMessageTasks++;
      Promise.resolve()
        .then(task)
        .finally(() => {
          activeMessageTasks--;
          resolve(true);
          drainMessageTasks();
        });
    }
  };

  const enqueueMessageTask = (task) => {
    if (pendingMessageTasks.length >= MAX_PENDING_MESSAGES) return Promise.resolve(false);
    return new Promise((resolve) => {
      pendingMessageTasks.push({ task, resolve });
      drainMessageTasks();
    });
  };

  const drainCacheWrites = () => {
    while (activeCacheWrites < MAX_CONCURRENT_CACHE_WRITES && pendingCacheWrites.length > 0) {
      const message = pendingCacheWrites.shift();
      activeCacheWrites++;
      Promise.resolve(updateMessageCache(api.getBotId(), message))
        .catch((error) => {
          console.error(`${api.getBotId()} -> Lỗi ghi message cache: ${error?.message || error}`);
        })
        .finally(() => {
          activeCacheWrites--;
          drainCacheWrites();
        });
    }
  };

  const enqueueCacheWrite = (message) => {
    // Cache không được phép làm phình RAM khi DB chậm/down. Message vẫn được
    // xử lý bình thường; chỉ bỏ phần lưu lịch sử khi backlog đã quá lớn.
    if (pendingCacheWrites.length >= MAX_PENDING_CACHE_WRITES) return false;
    pendingCacheWrites.push(message);
    drainCacheWrites();
    return true;
  };

  // Xử Lý Tin Nhắn Riêng Và Tin Nhắn Nhóm
  api.listener.on("message", async (message) => {
    // Ghi cache là tác vụ phụ: không để một round-trip database làm chậm
    // luồng phản hồi của bot. Queue riêng và có giới hạn để DB chậm không
    // khiến số promise tăng vô hạn.
    enqueueCacheWrite(message);

    await enqueueMessageTask(async () => {
      // Không circuit-break toàn bộ luồng chat: một command lỗi không được
      // phép làm bot ngừng nhận các command còn lại.
      await runGuarded(api, "message", () => messagesUser(api, message), { maxFailures: Infinity });
    });
  });

  // Xử Lý Sự Kiện Nhóm
  api.listener.on("group_event", async (event) => {
    await runGuarded(api, "group_event", async () => {
      await gruopEvents(api, event);
      await handleAutoBlockOnJoin ( api,event);
      await handleTargetEnforcementOnJoin(api, event);
    });
  });

  //Xử Lý Sự Kiện Undo Message
  api.listener.on("undo", async (undo) => {
    await runGuarded(api, "undo_event", () => undoMessageEvents(api, undo));
  });

  //Xử Lý Sự Kiện Reaction
  api.listener.on("reaction", async (reaction) => {
    await runGuarded(api, "reaction_event", () => reactionEvents(api, reaction));
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
      logManagerBot(detailError);
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
      logManagerBot(detailError);
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
    return apiInstance.api;
  } catch (error) {
    console.error("Lỗi khi tạo bot:", error);
    throw error;
  }
}

// Lỗi đã được bắt ở từng handler sẽ không làm chết tiến trình. Chỉ những lỗi
// lọt ra ngoài toàn bộ lớp bảo vệ mới buộc process thoát để PM2/bot.js dựng lại
// một trạng thái sạch, tránh process treo nhưng vẫn mang trạng thái hỏng.
if (!globalThis.__NGHUNG_FATAL_GUARD__) {
  globalThis.__NGHUNG_FATAL_GUARD__ = true;
  let exitingOnFatal = false;
  const exitOnFatal = (kind, reason) => {
    if (exitingOnFatal) return;
    exitingOnFatal = true;
    const error = reason instanceof Error ? reason : new Error(String(reason));
    const detail = `[fatal:${kind}] ${error.message}\n${error.stack || ""}`;
    console.error(detail);
    logManagerBot(detail);
    process.exitCode = 1;
    setTimeout(() => process.exit(1), 250).unref();
  };
  process.on("uncaughtException", (error) => exitOnFatal("uncaughtException", error));
  process.on("unhandledRejection", (reason) => exitOnFatal("unhandledRejection", reason));
}

// Initialize Data And Service
await Promise.all([initializeDatabase(), initializeCacheLinkService()]);
await Promise.all([initializeGameBauCua(), initializeGameChanLe()]);

// Active Main Bot
let configBotMain = readConfig();
const api = await createBot(configBotMain);
setRuntimeMainApi(api);

// Start Web Server
await startWebServer();

// Active Bot Children
await activeBotChildren(api);

// Khôi phục Giveaway đang quay sau restart sau khi cả bot chính và bot con đã online.
const { resumeGiveaway } = await import("./service-dqt/game-service/giveaway/giveaway.js");
await resumeGiveaway(api);

// Self-test vận hành: `pm2 sendSignal SIGUSR2 nghung-bot` sẽ dùng đúng API
// của một bot con đang online để gửi cảnh báo thử về main bot và owner.
// Không làm hỏng handler, không tắt listener và không tạo lỗi thật.
process.on("SIGUSR2", () => {
  const childManager = Object.values(apiManager.apiManagerObject).find((item) => !item.isMainBot);
  if (!childManager?.apiZalo) {
    console.warn("[runtime:self-test] Không có bot con online để kiểm tra cảnh báo.");
    return;
  }
  void reportRuntimeError(
    childManager.apiZalo,
    "self_test",
    Object.assign(new Error("Đây là cảnh báo thử nghiệm, bot vẫn hoạt động bình thường."), { code: "SELF_TEST" })
  );
});
