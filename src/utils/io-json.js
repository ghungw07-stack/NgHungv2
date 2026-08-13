import fs from "fs";
import path from "path";
import chalk from "chalk";
import { mkdir } from "fs/promises";

import { getTimeToString, getTimeNow } from "./format-util.js";

export const MANAGER_BOTS_FILE_PATH = path.join(process.cwd(), "assets", "data", "manager-bots.json");
const configFilePath = path.resolve("./assets/config.json");
const groupSettingsPath = path.resolve("./assets/data/group_settings.json");
const adminFilePath = path.resolve("./assets/data/list_admin.json");
export const commandFilePath = path.resolve("./assets/data/command.json");

export const JSON_DATA_PATH = path.join(process.cwd(), "assets", "json-data");
export const DATA_GAME_FILE_PATH = path.join(JSON_DATA_PATH, "data-game.json");
export const DATA_API_FILE_PATH = path.join(JSON_DATA_PATH, "api-key.json");
export const SETTING_CONFIG_FILE_PATH = path.join(JSON_DATA_PATH, "setting-config.json");
export const DATA_STICKER_FILE_PATH = path.join(JSON_DATA_PATH, "data-sticker.json");
export const TEMP_DATA_FILE = path.join(JSON_DATA_PATH, "temp-data.json");

export function readSettingConfig() {
  try {
    const data = fs.readFileSync(SETTING_CONFIG_FILE_PATH, "utf-8");
    return JSON.parse(data);
  } catch (error) {
    console.error("Lỗi khi đọc file setting-config.json:", error);
    return {};
  }
}

export function writeSettingConfig(config) {
  try {
    fs.mkdirSync(JSON_DATA_PATH, { recursive: true });
    fs.writeFileSync(SETTING_CONFIG_FILE_PATH, `${JSON.stringify(config, null, 2)}\n`, "utf-8");
  } catch (error) {
    console.error("Lỗi khi ghi file setting-config.json:", error);
    throw error;
  }
}

export function readConfig() {
  let config = {};
  try {
    const data = fs.readFileSync(configFilePath, "utf-8");
    config = JSON.parse(data);
  } catch (error) {
    console.error("Lỗi đọc tệp config.json:", error);
    config = {};
  }
  return config;
}

export function writeConfig(settings) {
  try {
    fs.writeFileSync(configFilePath, JSON.stringify(settings, null, 2), "utf-8");
  } catch (error) {
    console.error("Lỗi khi ghi file config.json:", error);
  }
}

export function readAdmins() {
  let admins = {};
  try {
    const data = fs.readFileSync(adminFilePath, "utf-8");
    admins = JSON.parse(data);
  } catch (error) {
    console.error("Lỗi đọc tệp admin:", error);
  }
  return admins;
}

export function writeAdmins(settings) {
  try {
    fs.writeFileSync(adminFilePath, JSON.stringify(settings, null, 2), "utf-8");
  } catch (error) {
    console.error("Lỗi khi ghi file group_settings.json:", error);
  }
}

export const resourceDir = path.join(process.cwd(), "assets", "resources");
export const IMAGES_RESOURCE_PATH_GLOBAL = path.join(resourceDir, "images");
export const VIDEOS_RESOURCE_PATH_GLOBAL = path.join(resourceDir, "videos");
export const VOICES_RESOURCE_PATH_GLOBAL = path.join(resourceDir, "voices");
export const FILES_RESOURCE_PATH_GLOBAL = path.join(resourceDir, "files");
export const STICKERS_RESOURCE_PATH_GLOBAL = path.join(resourceDir, "stickers");
export const GIFS_RESOURCE_PATH_GLOBAL = path.join(resourceDir, "gifs");
export const BACKGROUND_RESOURCE_PATH_TEMP = path.join(resourceDir, "background");
export const tempDir = path.join(process.cwd(), "assets", "temp");

const logDir = path.join(process.cwd(), "logs");
const logManagerBotFilePath = path.join(logDir, "bot-manager.log");

export async function ensureLogFiles() {
  try {
    await mkdir(resourceDir, { recursive: true });
    await mkdir(tempDir, { recursive: true });
    await mkdir(logDir, { recursive: true });
    await mkdir(IMAGES_RESOURCE_PATH_GLOBAL, { recursive: true });
    await mkdir(VIDEOS_RESOURCE_PATH_GLOBAL, { recursive: true });
    await mkdir(VOICES_RESOURCE_PATH_GLOBAL, { recursive: true });
    await mkdir(FILES_RESOURCE_PATH_GLOBAL, { recursive: true });
    await mkdir(STICKERS_RESOURCE_PATH_GLOBAL, { recursive: true });
    await mkdir(GIFS_RESOURCE_PATH_GLOBAL, { recursive: true });
    if (!fs.existsSync(logManagerBotFilePath)) {
      fs.writeFileSync(logManagerBotFilePath, "");
    }
    if (!fs.existsSync(DATA_GAME_FILE_PATH)) fs.writeFileSync(DATA_GAME_FILE_PATH, "{}");
    if (!fs.existsSync(DATA_API_FILE_PATH)) fs.writeFileSync(DATA_API_FILE_PATH, "{}");
    if (!fs.existsSync(SETTING_CONFIG_FILE_PATH)) fs.writeFileSync(SETTING_CONFIG_FILE_PATH, "{}");
    if (!fs.existsSync(DATA_STICKER_FILE_PATH)) fs.writeFileSync(DATA_STICKER_FILE_PATH, "{}");
  } catch (err) {
    console.error("Lỗi khi tạo thư mục hoặc file log:", err);
  }
}

const loggingFolderDir = (botId) => path.join(logDir, botId);

export const webPrConfigFolderDir = (botId) => path.join(loggingFolderDir(botId), "web-config");
export const imgWebPrConfigFolderDir = (botId) => path.join(webPrConfigFolderDir(botId), "image-pr");
export const videoWebPrConfigFolderDir = (botId) => path.join(webPrConfigFolderDir(botId), "video-pr");

export const loggingMessageFilePath = (idBot) => path.join(loggingFolderDir(idBot), "message.txt");
export const rankInfoJsonPath = (idBot) => path.join(loggingFolderDir(idBot), "rank-info.json");
export const trainingDataJsonPath = (idBot) => path.join(loggingFolderDir(idBot), "data-training.json");
export const farmDataJsonPath = (idBot) => path.join(loggingFolderDir(idBot), "nong-trai.json");
export const MANAGER_FILE_PATH = (idBot) => path.join(loggingFolderDir(idBot), "manager-bot.json");
export const DATA_CONFIG_ANTI_PATH = (idBot) => path.join(loggingFolderDir(idBot), "config-anti.json");
export const SUPPORT_GAME_FILE_PATH = (idBot) => path.join(loggingFolderDir(idBot), "support-game.json");
export const WEB_CONFIG_PATH = (idBot) => path.join(webPrConfigFolderDir(idBot), "config-pr-service.json");

export const RESOURCE_PATH = (idBot) => path.join(loggingFolderDir(idBot), "resource");
export const IMAGES_RESOURCE_PATH = (idBot) => path.join(RESOURCE_PATH(idBot), "images");
export const VIDEOS_RESOURCE_PATH = (idBot) => path.join(RESOURCE_PATH(idBot), "videos");
export const VOICES_RESOURCE_PATH = (idBot) => path.join(RESOURCE_PATH(idBot), "voices");
export const FILES_RESOURCE_PATH = (idBot) => path.join(RESOURCE_PATH(idBot), "files");
export const STICKERS_RESOURCE_PATH = (idBot) => path.join(RESOURCE_PATH(idBot), "stickers");
export const GIFS_RESOURCE_PATH = (idBot) => path.join(RESOURCE_PATH(idBot), "gifs");

export async function initFolderBot(api) {
  const botId = api.getBotId();
  const loggingFolder = loggingFolderDir(botId);
  const webPrConfigFolder = webPrConfigFolderDir(botId);
  const imgWebPrConfigFolder = path.join(webPrConfigFolder, "image-pr");
  const videoWebPrConfigFolder = path.join(webPrConfigFolder, "video-pr");
  const configPRSerive = WEB_CONFIG_PATH(botId);
  const msgTxtPath = loggingMessageFilePath(botId);
  const rankInfoPath = rankInfoJsonPath(botId);
  const dataTraining = trainingDataJsonPath(botId);
  const farmDataPath = farmDataJsonPath(botId);
  const antiConfig = DATA_CONFIG_ANTI_PATH(botId);
  const supportGame = SUPPORT_GAME_FILE_PATH(botId);
  try {
    await mkdir(loggingFolder, { recursive: true });
    await mkdir(webPrConfigFolder, { recursive: true });
    await mkdir(imgWebPrConfigFolder, { recursive: true });
    await mkdir(videoWebPrConfigFolder, { recursive: true });
    const defaultImagePath = path.join(resourceDir, "image", "nghbot.jpg");
    const destImagePath = path.join(imgWebPrConfigFolder, "nghbot.jpg");
    if (fs.existsSync(defaultImagePath) && !fs.existsSync(destImagePath)) {
      fs.copyFileSync(defaultImagePath, destImagePath);
    }
    if (!fs.existsSync(msgTxtPath)) {
      fs.writeFileSync(msgTxtPath, "");
    }
    if (!fs.existsSync(rankInfoPath)) {
      fs.writeFileSync(rankInfoPath, `{ "groups": {} }`);
    }
    if (!fs.existsSync(dataTraining)) {
      fs.writeFileSync(dataTraining, '{"groups":{}}');
    }
    if (!fs.existsSync(dataTraining)) {
      fs.writeFileSync(dataTraining, "{}");
    }
    if (!fs.existsSync(farmDataPath)) {
      fs.writeFileSync(farmDataPath, '{"nongtrai":{}}');
    }
    if (!fs.existsSync(antiConfig)) {
      fs.writeFileSync(antiConfig, "{}");
    }
    if (!fs.existsSync(configPRSerive)) {
      fs.writeFileSync(
        configPRSerive,
        `{
  "activePr": false,
  "prObjects": [
    {
      "ten": "Form 1",
      "idZalo": "-1",
      "noiDung": "Test 1",
      "hinhAnh": [ "nghbot.jpg" ],
      "video": [],
      "link": {
        "nghbot.jpg": "https://i.postimg.cc/L5nL1ycW/nen.png"
      },
      "thoiGianGui": ["03:00", "05:00", "08:00", "11:00", "13:00", "16:00", "19:00", "22:00"],
      "customContent": {}
    }
  ],
  "selectedGroups": {},
  "selectedFriends": {}
}`
      );
    }
    if (!fs.existsSync(supportGame)) {
      fs.writeFileSync(supportGame, "{}");
    }

    await mkdir(RESOURCE_PATH(botId), { recursive: true });
    await mkdir(IMAGES_RESOURCE_PATH(botId), { recursive: true });
    await mkdir(FILES_RESOURCE_PATH(botId), { recursive: true });
    await mkdir(GIFS_RESOURCE_PATH(botId), { recursive: true });
    await mkdir(VIDEOS_RESOURCE_PATH(botId), { recursive: true });
    await mkdir(VOICES_RESOURCE_PATH(botId), { recursive: true });
    await mkdir(STICKERS_RESOURCE_PATH(botId), { recursive: true });
  } catch (err) {
    console.error("Lỗi khi tạo thư mục logging:", err);
  }
}

export function mkdirRecursive(dirPath) {
  if (fs.existsSync(dirPath)) return;

  try {
    fs.mkdirSync(dirPath, { recursive: true });
  } catch (err) {
    if (err.code !== "EEXIST") throw err;
  }
}

export function logManagerBot(message) {
  const timestamp = getTimeToString(getTimeNow());
  const logEntry = `${timestamp} - ${message}\n`;
  fs.appendFileSync(logManagerBotFilePath, logEntry);
}

export function logMessageToFile(idBot, data, type = "message", isLogCommand = true) {
  const timestamp = getTimeToString(getTimeNow());
  const logData = `\n${data}`;

  fs.appendFileSync(loggingMessageFilePath(idBot), logData, "utf8");
  // if (idBot === getGlobalApi.getBotId()) {}
  if (isLogCommand) {
    if (type === "group") {
      console.log(chalk.yellowBright.bold(`\n[${timestamp}]`), chalk.yellowBright(logData));
    } else {
      console.log(chalk.blueBright.bold(`\n[${timestamp}]`), chalk.blueBright(logData));
    }
  }
}

export function readGroupSettings() {
  try {
    const data = fs.readFileSync(groupSettingsPath, "utf-8");
    return JSON.parse(data);
  } catch (error) {
    console.error("Lỗi khi đọc file group_settings.json:", error);
    return {};
  }
}

export function writeGroupSettings(settings) {
  try {
    fs.writeFileSync(groupSettingsPath, JSON.stringify(settings, null, 2), "utf-8");
  } catch (error) {
    console.error("Lỗi khi ghi file group_settings.json:", error);
  }
}

export function readCommandConfig() {
  try {
    const data = fs.readFileSync(commandFilePath, "utf-8");
    return JSON.parse(data);
  } catch (error) {
    console.error("Lỗi khi đọc file command.json:", error);
    return { commands: [] };
  }
}

export function writeCommandConfig(config) {
  try {
    let existingConfig = {};
    try {
      const existingData = fs.readFileSync(commandFilePath, "utf-8");
      existingConfig = JSON.parse(existingData);
    } catch (readError) {
      existingConfig = {};
    }
    
    const configToWrite = {
      ...existingConfig, 
      ...config,
      prefix: existingConfig.prefix || config.prefix || {},
      managerCommand: {
        ...(existingConfig.managerCommand || {}),
        ...(config.managerCommand || {})
      }
    };
    
    fs.writeFileSync(commandFilePath, JSON.stringify(configToWrite, null, 2));
  } catch (error) {
    console.error("Lỗi khi ghi file command.json:", error);
  }
}

export function readManagerFile(idBot) {
  try {
    const data = fs.readFileSync(MANAGER_FILE_PATH(idBot), "utf8");
    let parsedData = JSON.parse(data);
    if (!parsedData) {
      parsedData = {};
    }
    if (!parsedData.blockBot) parsedData.blockBot = [];
    return parsedData;
  } catch (error) {
    if (error.code === "ENOENT") {
      return {};
    }
    console.error("Lỗi khi đọc file block:", error);
    return {};
  }
}

export function writeManagerFile(idBot, data) {
  fs.writeFileSync(MANAGER_FILE_PATH(idBot), JSON.stringify(data, null, 2));
}

export function readWebConfig(botId) {
  try {
    const data = fs.readFileSync(WEB_CONFIG_PATH(botId), "utf-8");
    return JSON.parse(data);
  } catch (error) {
    console.error("Lỗi khi đọc file web-config.json:", error);
    return {};
  }
}

export function writeWebConfig(botId, config) {
  fs.writeFileSync(WEB_CONFIG_PATH(botId), JSON.stringify(config, null, 2));
}

export function readSupportGameConfig(botId) {
  try {
    const data = fs.readFileSync(SUPPORT_GAME_FILE_PATH(botId), "utf-8");
    return JSON.parse(data);
  } catch (error) {
    console.error("Lỗi khi đọc file web-config.json:", error);
    return {};
  }
}

export function writeSupportGameConfig(botId, config) {
  fs.writeFileSync(SUPPORT_GAME_FILE_PATH(botId), JSON.stringify(config, null, 2));
}
export const RANK_LIEN_QUAN_RESOURCE_PATH_GLOBAL = path.join(process.cwd(),"assets", "resources", "lienquan");
