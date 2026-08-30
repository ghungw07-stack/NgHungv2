import { initFolderBot, readCommandConfig, writeCommandConfig } from "../utils/io-json.js";
import { initRankSystem } from "./info-service/rank-chat.js";
import { initializeFarmService } from "./game-service/nong-trai/nong-trai.js";
import { initializeScheduler } from "./scheduler/scheduler.js";
import { startMuteCheck } from "./anti-service/mute-user.js";
import { startBadWordViolationCheck } from "./anti-service/anti-badword.js";
import { handleMusicReply } from "./api-crawl/music-content/soundcloud.js";
import { handleMixcloudReply } from "./api-crawl/music-content/mixcloud.js";
import { handleZingMp3Reply } from "./api-crawl/music-content/zingmp3.js";
import { startNudeViolationCheck } from "./anti-service/anti-nude/anti-nude.js";
import { handleChatWithGame } from "./game-service/mini-game/index.js";
import { initializeGameDataManager } from "./game-service/game-manager.js";
import { handleYoutubeReply } from "./api-crawl/youtube/youtube-service.js";
import { initPRService } from "./scheduler/pr-zalo.js";
import { initAutoRaiLinkService } from "./scheduler/auto-rai-link.js";
import { handleNhacCuaTuiReply } from "./api-crawl/music-content/nhaccuatui.js";
import { handleActionGroupReply } from "../commands/bot-manager/remote-action-group.js";
import { handleDownloadReply } from "./api-crawl/api-download/aio-downlink.js";
import { checkReplySelectionsMapData } from "./api-crawl/index.js";
import { handleCapcutReply } from "./api-crawl/capcut/capcut-service.js";
import { initializeManagerService, notifyResetCompleteInGroup } from "../commands/bot-manager/active-bot.js";
import { handleScanGroupsReply } from "../commands/bot-manager/scan-group.js";
import { startAntiConfigCheck } from "./anti-service/index.js";
import { handleHoatHinh3DReply } from "./api-crawl/video-content/hh3dtq.js";
import { handleChooseTuongLienQuanReply } from "./api-crawl/content/info-lien-quan.js";
import { handleChooseTuongLMHTReply } from "./api-crawl/content/info-lmht.js";
import { initializeCacheMessageService } from "../utils/message-cache.js";
import { initTrainingSystem } from "./chat-bot/bot-learning/ngh-bot.js";
import { startMediaViolationCheck } from "./anti-service/anti-media-file.js";
import { initCheckTargetService } from "./info-service/target-user.js";
import { loadDataSpamSmsFromFile } from "./api-crawl/content/spamsms.js";
import { handleChooseClipphotReply } from "./api-crawl/video-content/cliphot.js";
import { reloadCommandConfig } from "../index.js";
import { handleMotPhimReply } from "./api-crawl/video-content/mot-phim.js";
import { handleKhoPhimReply } from "./api-crawl/video-content/kho-phim.js";
import { handleDetectContentDownload } from "./api-crawl/api-download/auto-download.js";
import { handleNetTruyenReply } from "./api-crawl/image-content/nettruyen.js";
import { handleCNovelTruyenChuReply } from "./api-crawl/content/cnovel-truyen-chu.js";
import { handleMusicSpotifyReply } from "./api-crawl/music-content/spotify/spotify.js";
import { handleTenorStickerReply } from "./api-crawl/image-content/tenor.js";
import { handleTruyenHentaiReply } from "./api-crawl/image-content/hentai.js";
import { handleTruyenSexVLReply } from "../commands/send-all/truyensex.js";
import { checkMenuPageReply } from "../commands/instructions/help.js";
import { handleAddUserToGroupReply } from "../commands/bot-manager/add-user-to-group.js";
import { handleAttackReply } from "../commands/bot-manager/attack.js";

// Dùng var để an toàn với vòng import giữa service và command trong lúc boot.
// `let` có TDZ khiến initService bị gọi trước khi binding được khởi tạo.
var globalPrefix = {};

export function getGlobalPrefix(idBot) {
  const botId = String(idBot ?? "");
  if (globalPrefix[botId]) return globalPrefix[botId];
  // Nạp prefix từ command.json khi bot khởi động. Trước đây map runtime rỗng
  // khiến prefix trở thành chuỗi rỗng, làm mọi tin nhắn bị coi như lệnh game.
  let configured = "";
  try {
    const config = readCommandConfig();
    configured = String(config?.prefix?.[botId] || "");
  } catch {}
  globalPrefix[botId] = configured || "!";
  return globalPrefix[botId];
}

export function setGlobalPrefix(idBot, newPrefix) {
  globalPrefix[idBot] = newPrefix;
}

// Nạp lại các thiết lập dùng trực tiếp trong service mà không cần restart bot.
export function reloadServiceConfig() {
  const commandConfig = reloadCommandConfig();
  globalPrefix = commandConfig.prefix || {};
  return commandConfig;
}

export async function initService(api) {
  const commandConfig = readCommandConfig();
  globalPrefix = commandConfig.prefix || {};
  
  const botId = api.getBotId();
  if (!commandConfig.managerCommand) {
    commandConfig.managerCommand = {};
  }
  if (!commandConfig.managerCommand[botId]) {
    commandConfig.managerCommand[botId] = {
      notAllowedCommand: [],
      customerCommand: {},
    };
  }

  const managerCommand = commandConfig.managerCommand[botId];
  if (!managerCommand.customerCommand) managerCommand.customerCommand = {};
  if (!managerCommand.customerCommand.attack) managerCommand.customerCommand.attack = {};
  let commandConfigChanged = false;
  if (managerCommand.customerCommand.attack.defaultChildBlockInitialized !== true) {
    managerCommand.customerCommand.attack.defaultChildBlockInitialized = true;
    if (api.apiManager?.isMainBot === false && !managerCommand.notAllowedCommand.includes("attack")) {
      managerCommand.notAllowedCommand.push("attack");
    }
    commandConfigChanged = true;
  }

  if (commandConfigChanged) {
    writeCommandConfig(commandConfig);
    reloadCommandConfig();
  }

  await initFolderBot(api);
  await Promise.all([
    startAntiConfigCheck(api),
    loadDataSpamSmsFromFile(api),
    initializeCacheMessageService(api),
    initializeFarmService(api),
    initializeGameDataManager(api),
    initializeScheduler(api),
    initializeManagerService(api),
    initPRService(api),
    initAutoRaiLinkService(api),
    startMuteCheck(api),
    startBadWordViolationCheck(api),
    startMediaViolationCheck(api),
    startNudeViolationCheck(api),
    initRankSystem(api),
    initTrainingSystem(api),
    initCheckTargetService(api),
  ]);

  // Thông báo reset không cần chặn bot nhận message sau khi đăng nhập.
  void notifyResetCompleteInGroup(api).catch((error) => {
    console.error("Lỗi gửi thông báo reset sau khi khởi động:", error?.message || error);
  });
}

export async function handleOnChatUser(api, message, isCallGame, groupSettings, groupInfo) {
  await handleChatWithGame(api, message, isCallGame, groupSettings, groupInfo);
}

export async function handleOnReplyFromUser(
  api,
  message,
  groupInfo,
  groupAdmins,
  groupSettings,
  isAdminLevelHighest,
  isAdminBot,
  isAdminBox,
  handleChat
) {
  let isHandled = false;

  if (await handleAttackReply(api, message)) isHandled = true;
  if (!isHandled && (await checkReplySelectionsMapData(api, message, isAdminLevelHighest))) isHandled = true;
  if (!isHandled && (await checkMenuPageReply(api, message))) isHandled = true;
  if (!isHandled && (await handleAddUserToGroupReply(api, message, isAdminLevelHighest))) isHandled = true;
  if (await handleDetectContentDownload(api, message, isAdminLevelHighest, groupSettings)) isHandled = true;
  if (!isHandled) {
    const results = await Promise.all([
      handleScanGroupsReply(api, message),
      handleMusicReply(api, message, isAdminLevelHighest),
      handleMixcloudReply(api, message, isAdminLevelHighest),
      handleZingMp3Reply(api, message),
      handleYoutubeReply(api, message, isAdminLevelHighest),
      handleNhacCuaTuiReply(api, message),
      handleDownloadReply(api, message),
      handleCapcutReply(api, message),
      handleHoatHinh3DReply(api, message),
      handleChooseTuongLienQuanReply(api, message),
      handleChooseTuongLMHTReply(api, message),
      handleChooseClipphotReply(api, message),
      handleMotPhimReply(api, message),
      handleKhoPhimReply(api, message),
      handleNetTruyenReply(api, message),
      handleTruyenHentaiReply(api, message),
      handleCNovelTruyenChuReply(api, message),
      handleMusicSpotifyReply(api, message),
      handleTenorStickerReply(api, message),
      handleTruyenSexVLReply(api, message),
      handleActionGroupReply(
        api,
        message,
        groupInfo,
        groupAdmins,
        groupSettings,
        isAdminLevelHighest,
        isAdminBot,
        isAdminBox,
        handleChat
      ),
    ]);
    isHandled = results.some((r) => r === true);
  }

  if (isHandled) {
  }

  return isHandled;
}
