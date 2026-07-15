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
            DEVELOPER: NDQ x LQT
@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@*/

// PHẢI là import đầu tiên: chặn console.log/info/warn/error/debug ngay lập
// tức, ghi thẳng vào SQL (bảng bot_logs) thay vì in ra terminal. Đặt trước
// mọi import khác để bắt được cả log phát sinh lúc các module bên dưới được
// nạp (import-time side effects), không chỉ log lúc chạy runtime.
import "./utils/sql-logger.js";

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
  const apiManager = getApiManager(botId);
  if (!apiManager) {
    return false;
  }
  const listAdmin = apiManager.getListAdmin() || [];
  if (botId === userId || listAdmin.includes(userId.toString()) || userId === apiManager.idBotMainWithBot) {
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

export const getGlobalApi = () => {
  return api;
};

export function setupBotListeners(api) {
  // Xử Lý Tin Nhắn Riêng Và Tin Nhắn Nhóm
  api.listener.on("message", async (message) => {
    const idBot = api.getBotId();
    try {
      await Promise.all([messagesUser(api, message), updateMessageCache(idBot, message)]);
    } catch (error) {
      const detailError =
        idBot + ` -> Mã Lỗi: ${error.code} - > Chú Thích Lỗi Tin Nhắn: ${error.message}\nNội Dung Lỗi: ${error.stack}`;
      console.error(detailError);
      logManagerBot(detailError);
    }
  });

  // Xử Lý Sự Kiện Nhóm
  api.listener.on("group_event", async (event) => {
    try {
       
      await gruopEvents(api, event);
      await handleAutoBlockOnJoin ( api,event);
      await handleTargetEnforcementOnJoin(api, event);
    } catch (error) {
      const detailError =
        api.getBotId() +
        ` -> Mã Lỗi: ${error.code} - > Chú Thích Lỗi Sự Kiện Nhóm: ${error.message}\nNội Dung Lỗi: ${error.stack}`;
      console.error(detailError);
      logManagerBot(detailError);
    }
  });

  //Xử Lý Sự Kiện Undo Message
  api.listener.on("undo", async (undo) => {
    try {
      await undoMessageEvents(api, undo);
    } catch (error) {
      const detailError =
        api.getBotId() +
        ` -> Mã Lỗi: ${error.code} - > Chú Thích Lỗi Sự Kiện Undo Message: ${error.message}\nNội Dung Lỗi: ${error.stack}`;
      console.error(detailError);
      logManagerBot(detailError);
    }
  });

  //Xử Lý Sự Kiện Reaction
  api.listener.on("reaction", async (reaction) => {
    try {
      await reactionEvents(api, reaction);
    } catch (error) {
      const detailError =
        api.getBotId() +
        ` -> Mã Lỗi: ${error.code} - > Chú Thích Lỗi Sự Kiện Reaction: ${error.message}\nNội Dung Lỗi: ${error.stack}`;
      console.error(detailError);
      logManagerBot(detailError);
    }
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

// Initialize Data And Service
await Promise.all([initializeDatabase(), initializeCacheLinkService()]);
await Promise.all([initializeGameBauCua(), initializeGameChanLe()]);

// Active Main Bot
let configBotMain = readConfig();
const api = await createBot(configBotMain);

// Start Web Server
await startWebServer();

// Active Bot Children
await activeBotChildren(api);