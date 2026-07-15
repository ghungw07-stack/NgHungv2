import { handleMuteList, handleMuteUser, handleUnmuteUser } from "../service-dqt/anti-service/mute-user.js";
import { handleWelcomeBye, handleApprove, handleUpdateGroup, handleKickImageCommand, handleBlockImageCommand, handleSendUserMemberCommand } from "./bot-manager/welcome-bye.js";
import { handleBlock,
  handleKick,
  handleKickAll,
  handleGetMute, 
  handlePinConversation, 
  handleUpgradeGroupToCommunity,
  handlePinGroupMsg
} from "./bot-manager/group-manage.js";
import { handleUpdateProfile, handleCreatePoll, handleSpamPoll, handleSendReport } from "./bot-manager/utilities.js";
import { handleActiveBotUser, handleActiveGameUser, handleActivePrivateBot } from "./bot-manager/active-bot.js";
import { helpCommand, adminCommand, gameInfoCommand, gameMenuCommand } from "./instructions/help.js";
import { askGPTCommand } from "../service-dqt/api-crawl/assistant-ai/gpt.js";
import { askGeminiCommand } from "../service-dqt/api-crawl/assistant-ai/gemini.js";
import { translateCommand } from "../service-dqt/api-crawl/content/translate.js";
import { weatherCommand } from "../service-dqt/api-crawl/content/weather.js";
import { handlePhatNguoiCommand } from "../service-dqt/api-crawl/content/phatnguoi.js";
import {
  handleHoatHinh3DTrungQuocCommand,
  handleHoatHinh3DTrungQuocThuyetMinhCommand,
  handleShowLichHoatHinh3DTrungQuocCommand,
} from "../service-dqt/api-crawl/video-content/hh3dtq.js";
import { handleSpamSMSCommand } from "../service-dqt/api-crawl/content/spamsms.js";
import { handleCheckTuongLienQuanCommand } from "../service-dqt/api-crawl/content/info-lien-quan.js";
import { handleCheckTuongLMHTCommand } from "../service-dqt/api-crawl/content/info-lmht.js";
import { handleCheckOrderDeliveryCommand } from "../service-dqt/api-crawl/content/check-giao-hang.js";
import { handleCheckDomainNameCommand, handleCheckIPCommand } from "../service-dqt/api-crawl/content/check-host.js";
import { handleCheckClipphotCommand } from "../service-dqt/api-crawl/video-content/cliphot.js";
import { handleMotPhimCommand } from "../service-dqt/api-crawl/video-content/mot-phim.js";
import { handleKhoPhimCommand } from "../service-dqt/api-crawl/video-content/kho-phim.js";
import { handleXoSoCommand } from "../service-dqt/api-crawl/content/xo-so.js";
import { handleAutoDownloadAndReplyCommand } from "../service-dqt/api-crawl/api-download/auto-download.js";
import { searchImagePinterest } from "../service-dqt/api-crawl/image-content/pinterest-service.js";
import { handleTikTokCommand } from "../service-dqt/api-crawl/tiktok/tiktok-service.js";
import { handleMusicCommand } from "../service-dqt/api-crawl/music-content/soundcloud.js";
import { handleMixcloudCommand } from "../service-dqt/api-crawl/music-content/mixcloud.js";
import { handleTopChartZingMp3, handleZingMp3Command } from "../service-dqt/api-crawl/music-content/zingmp3.js";
import { handleYoutubeCommand } from "../service-dqt/api-crawl/youtube/youtube-service.js";
import { handleNhacCuaTuiCommand } from "../service-dqt/api-crawl/music-content/nhaccuatui.js";
import { handleDownloadCommand } from "../service-dqt/api-crawl/api-download/aio-downlink.js";
import { handleCapcutCommand } from "../service-dqt/api-crawl/capcut/capcut-service.js";
import { searchImageGoogle } from "../service-dqt/api-crawl/google/google-image.js";
import { handleGoogleCommand } from "../service-dqt/api-crawl/google/google-search.js";
import { handleGoogleAISearchCommand } from "../service-dqt/api-crawl/google/google-ai-search.js";
import { handleGoogleNewsCommand } from "../service-dqt/api-crawl/google/google-news.js";
import { handleFacebookProfileCommand } from "../service-dqt/api-crawl/facebook/facebook-profile.js";
import { askGeminiDrawImage } from "../service-dqt/api-crawl/assistant-ai/gemini-image.js";
import { handleDataCommand } from "../service-dqt/utilities/data-manager.js";
import { groupInfoCommand } from "../service-dqt/info-service/group-info.js";
import { userInfoCommand } from "../service-dqt/info-service/user-info.js";
import { handleRankCommand } from "../service-dqt/info-service/rank-chat.js";
import { handleAutoJoinCommand } from "../service-dqt/anti-service/auto-join.js";
import { chatAll } from "../service-dqt/chat-zalo/chat-general/chat-all.js";
import { handlePingIdCommand } from "./send-all/ping-id.js";
import { handleSendGifCommand } from "../service-dqt/chat-zalo/chat-special/send-gif/send-gif.js";
import { handleSendImageCommand, sendImage } from "../service-dqt/chat-zalo/chat-special/send-image/send-image.js";
import {
  handleSendVideoCommand,
  handleVideoCommand,
} from "../service-dqt/chat-zalo/chat-special/send-video/send-video.js";
import { gameTypeDuoiHinhBatChu } from "../service-dqt/game-service/mini-game/duoihinhbatchu/dhbc.js";
import { handleAntiForwardCommand } from "../service-dqt/anti-service/anti-forward.js";
import { chatWithSimsimi } from "../service-dqt/chat-bot/simsimi/simsimi-api.js";
import { handleLearnCommand, handleReplyCommand } from "../service-dqt/chat-bot/bot-learning/dqt-bot.js";
import { handleOnlyText } from "../service-dqt/anti-service/anti-not-text.js";
import { scoldUser } from "../service-dqt/chat-bot/scold-user/scold-user.js";
import { getBotDetails } from "../service-dqt/info-service/bot-info.js";
import {
  handleBanCommand,
  handleBankCommand,
  handleBuffCommand,
  handleClaimDailyReward,
  handleMyCard,
  handleNapCommand,
  handleRutCommand,
  handleSetVNDCommand,
  handleTopPlayers,
  handleUnbanCommand,
} from "../service-dqt/game-service/index.js";
import { handleAntiLinkCommand } from "../service-dqt/anti-service/anti-link.js";
import { getCommandConfig, getManagerCommandConfig, getManagerCommandCustomConfig, isAdmin } from "../index.js";
import {
  sendMessageFromSQL,
  sendMessageInsufficientAuthority,
  sendMessageFailed,
} from "../service-dqt/chat-zalo/chat-style/chat-style.js";
import { handleAdminHighLevelCommands, handleListAdmin } from "./bot-manager/admin-manager.js";
import { handleAntiSpamCommand } from "../service-dqt/anti-service/anti-spam.js";
import { handleKeyCommands, handleBlockBot, handleUnblockBot, handleListBlockBot, handleCreateGroup, handleTarget } from "./bot-manager/group-manage.js";
import { listCommands } from "./instructions/help.js";
import { handleTaiXiuCommand } from "../service-dqt/game-service/tai-xiu/tai-xiu.js";
import { handleXiDachCommand, handleXiDachPrivateAction } from "../service-dqt/game-service/xi-dach/xi-dach.js";
import { handlePrefixCommand } from "./bot-manager/prefix.js";
import { getGlobalPrefix } from "../service-dqt/service.js";
import { handleNongTraiCommand } from "../service-dqt/game-service/nong-trai/nong-trai.js";
import { userBussinessCardCommand } from "../service-dqt/info-service/bussiness-card.js";
import { handleConvertStickerCommand } from "../service-dqt/chat-zalo/chat-special/send-sticker/convert-sticker.js";
import {
  checkNotFindCommand,
  handleAliasCommand,
  handleGetDataMessage,
  handleGetLinkInQuote,
  handleSendMessagePrivate,
  handleSendTaskCommand,
  handleSendToDo,
  handleUndoMessage,
  handleAddQuickMessageCommand,
  handleAddUnreadMarkCommand,
  handleBlockViewFeedCommand,
  handleDisperseGroup,
} from "./bot-manager/utilities.js";
import { handleBauCua } from "../service-dqt/game-service/bau-cua/bau-cua.js";
import { handleKBBCommand } from "../service-dqt/game-service/keobuabao/keobuabao.js";
import { handleAntiBadWordCommand } from "../service-dqt/anti-service/anti-badword.js";
import { handleChanLe } from "../service-dqt/game-service/chan-le/chan-le.js";
import {
  handleGetVoiceCommand,
  handleSendVoiceCommand,
  handleStoryCommand,
  handleTarrotCommand,
  handleVoiceCommand,
} from "../service-dqt/chat-zalo/chat-special/send-voice/send-voice.js";
import { antiNude, handleAntiNudeCommand } from "../service-dqt/anti-service/anti-nude/anti-nude.js";
import { handleSettingGroupCommand, handleListKey } from "./bot-manager/group-manage.js";
import { handleVietlott655Command } from "../service-dqt/game-service/vietlott/vietlott655.js";
import { handleMiniGameCommand } from "../service-dqt/game-service/mini-game/index.js";
import { handleJoinGroup, handleLeaveGroup, handleShowGroupsList, handleLeaveLockedGroups, handleLeaveAllGroup } from "./bot-manager/remote-action-group.js";
import { removeMention } from "../utils/format-util.js";
import { handleWhiteList } from "../service-dqt/anti-service/white-list.js";
import { handleAntiUndoCommand } from "../service-dqt/anti-service/anti-undo.js";
import { handleBankInfoCommand, handleMyBankCommand } from "../service-dqt/info-service/bank-info.js";
import { sendReactionWaitingCountdown } from "./manager-command/check-countdown.js";
import { getPermissionCommandName, handleSetCommandActive } from "./manager-command/set-command.js";
import { scanGroupsWithAction } from "./bot-manager/scan-group.js";
import { handleDeleteMessage } from "./bot-manager/recent-message.js";
import { handleCommandStatusPost } from "../utils/canvas/status-post.js";
import { handleCreateQRCommand } from "../service-dqt/utilities/qr-creater.js";
import { handleScanQRCommand } from "../service-dqt/utilities/qr-scan.js";
import { handleSpeedTestCommand } from "../service-dqt/utilities/speedtest.js";
import { handleSendLocalSticker } from "../service-dqt/chat-zalo/chat-special/send-sticker/customer-sticker.js";
import {
  handleDeleteResource,
  handleDownloadResource,
  handleShowResource,
} from "../service-dqt/utilities/download-resource.js";
import { handleStickerCommand } from "../service-dqt/chat-zalo/chat-special/send-sticker/main-sticker.js";
import { testFutureUser } from "../automations/ndq-test.js";
import { handleEditVoiceCommand } from "../service-dqt/chat-zalo/chat-special/send-voice/edit-voice.js";
import { handleEditVideoCommand } from "../service-dqt/chat-zalo/chat-special/send-video/edit-video.js";
import { spamCallVoice } from "../service-dqt/chat-zalo/chat-special/send-call-voice/call-voice.js";
import { handleChatBiThuatPhaNhom, handleChatSpamLink } from "../service-dqt/chat-zalo/chat-general/chat-hide.js";
import { groupSettingsAll } from "../automations/event-send-msg.js";
import { handleManagerBot } from "../manager-bot/index.js";
import { handleConfigPRCommand } from "../service-dqt/scheduler/pr-command.js";
import { gameTypeDoanSo } from "../service-dqt/game-service/mini-game/guessNumber.js";
import { gameTypeNoiTu } from "../service-dqt/game-service/mini-game/wordChain.js";
import { gameTypeVuaTiengViet } from "../service-dqt/game-service/mini-game/vuatiengviet.js";
import { handleAntiMediaCommand } from "../service-dqt/anti-service/anti-media-file.js";
import { handleTargetBot } from "../service-dqt/info-service/target-user.js";
import { handleGetCookieImeiByQR } from "../manager-bot/get-info-login.js";
import { handleConvertMediaFile } from "../service-dqt/utilities/convert-media.js";
import { handleSendFileCommand } from "../service-dqt/chat-zalo/chat-special/send-file/send-file.js";
import { handleSupportGameCommand } from "../service-dqt/chat-bot/additional-features/support-game.js";
import { handleAntiSendStickerEffectCommand } from "../service-dqt/anti-service/anti-sticker-effect.js";
import { handleNetTruyenCommand } from "../service-dqt/api-crawl/image-content/nettruyen.js";
import { handleCNovelTruyenChuCommand } from "../service-dqt/api-crawl/content/cnovel-truyen-chu.js";
import {
  handleDownloadSpotifyLink,
  handleMusicSpotifyCommand,
} from "../service-dqt/api-crawl/music-content/spotify/spotify.js";
import { askGeminiGenderVideo } from "../service-dqt/api-crawl/assistant-ai/gemini-veo.js";
import { gameTypeZaclWarrior } from "../service-dqt/game-service/mini-game/zacl-warrior/index.js";
import { handleTenorStickerCommand } from "../service-dqt/api-crawl/image-content/tenor.js";
import { handleSharpenerImageCommand } from "../service-dqt/api-crawl/image-content/lamnet.js";
import { handleTruyenHentaiCommand } from "../service-dqt/api-crawl/image-content/hentai.js";
import { handleCheckFileByVirusTotal } from "../service-dqt/api-crawl/content/virustotal.js";
import { gameTypeCaro } from "../service-dqt/game-service/mini-game/caro-game/index.js";
import { handleSendLunarCalendar } from "../service-dqt/api-crawl/image-content/lichamlich.js";
import { gameTypeAiLaTrieuPhu } from "../service-dqt/game-service/mini-game/ailatrieuphu/game-manager.js";
import { gameTypeCauCa } from "../service-dqt/game-service/mini-game/cauca/index.js";
import { handleBenchmarkCommand } from "../service-dqt/utilities/benchmark/index.js";
import { handleAntiFile } from "../service-dqt/anti-service/anti-file.js";
import { handleJoinLeaveGroup } from "./spam/remote-join-leave.js";
import { handleAutoReplyCommand } from "../service-dqt/api-crawl/assistant-ai/auto-reply-gemini.js";
import { handleGifTextCommand } from "../service-dqt/chat-zalo/chat-special/send-gif/send-gif.js";
import { handleVideoToGifCommand } from "../service-dqt/chat-zalo/chat-special/send-gif/gifvd.js";
import { handleSimValuationCommand } from "./send-all/dinhgiasim.js";
import { spamgroup } from "./spam/spamgroup.js";
import { handleAntiAll } from "../service-dqt/anti-service/anti-all.js";
import { handleAntiPhoneNumber } from "../service-dqt/anti-service/anti-phone-number.js";
import { handleCheckSimPhongThuyCommand } from "./send-all/phong-thuy-sim.js";
import { handleTruyenSexVLCommand } from "./send-all/truyensex.js";
import { searchImagePexels } from "../service-dqt/api-crawl/image-content/pexels-image.js";
import { handleLoveCommand } from "./send-all/lovelink.js";
import { handleQrcodeCommand, handleScanQrcodeCommand } from "./send-all/send-qrcode.js"
import { handleAntiTagCommand } from "../service-dqt/anti-service/anti-tag.js";
import { handleAntiBotCommand } from "../service-dqt/anti-service/anti-bot.js";
import { sendMessageToMentioned } from "./send-all/sendmsg-user.js";
import { handleAntiAllEffectGifCommand } from "../service-dqt/anti-service/anti-gif.js";
import { handleBlockUIDByCommand } from "../service-dqt/utilities/block-user-join.js";
import { handleAntiVoiceCommand } from "../service-dqt/anti-service/anti-voice.js";
import { handleAntiAllEffectStickerCommand } from "../service-dqt/anti-service/anti-sticker.js";
import { handleAntiPhotoVideo } from "../service-dqt/anti-service/anti-photo.js";
import { userBussinessCardQrCommand } from "../service-dqt/info-service/business-card-qr.js";
import { handleCheckquocgia } from "./send-all/quocgia.js";
import { handleInviteAllFriendsCommand } from "./send-all/invite-all-friends.js";
import { handleHungCommand } from "./send-all/hung.js";
import { handleAutoReplyPMCommand } from "./bot-manager/welcome-bye.js";
import { handleI4tiktokCommand } from "../service-dqt/info-service/i4tiktok.js";
import { handleTagReactionCommand } from "./bot-manager/tag-reaction.js";
import { handleClockCommand } from "../service-dqt/chat-zalo/chat-special/send-gif/gif-clock.js";
import { matchmakingCommand } from "../service-dqt/info-service/matchmaking.js";
import { handleCreateAutoReplyCommand, 
  handleDeleteAutoReplyCommand, 
  handleGetAutoReplyListCommand, 
  handleCreateReminderCommand, 
  handleDeleteChatCommand 
} from "./bot-manager/summary.js";
import { handleCheckGiaVangCommand } from "./send-all/check-gia-vang.js";
import { handleAntiInvite } from "../service-dqt/anti-service/anti-invite.js";
import { handleHeartReactionDeleteCommand } from "../automations/reaction-delete.js";

const lastCommandUsage = {};
export function getLastCommandUsage() {
  return lastCommandUsage;
}

// Dựng lại message cho lệnh con của "game" (vd: "!game bank 5000 @A" -> xử lý như "!bank 5000 @A")
// Giữ nguyên đúng vị trí @mention để các hàm xử lý cũ (bank, buff, ban...) không bị lệch khi lấy tên người được nhắc tới.
function buildGameSubMessage(message, prefix) {
  try {
    const rawContent = message.data.content;
    const isObjContent = rawContent && typeof rawContent === "object";
    const text = isObjContent ? rawContent.title : rawContent;
    if (typeof text !== "string" || !text.startsWith(prefix)) return null;

    const afterPrefix = text.slice(prefix.length);
    const match = afterPrefix.match(/^\s*game(\s+|$)/i);
    if (!match) return null;

    const removedLength = match[0].length;
    const newText = text.slice(0, prefix.length) + afterPrefix.slice(removedLength);

    const newMentions = (message.data.mentions || []).map((m) => ({
      ...m,
      pos: m.pos - removedLength,
    }));

    return {
      ...message,
      data: {
        ...message.data,
        content: isObjContent ? { ...rawContent, title: newText } : newText,
        mentions: newMentions,
      },
    };
  } catch (error) {
    console.error("Lỗi khi dựng lại message cho lệnh con game:", error);
    return null;
  }
}

export const permissionLevels = {
  all: 0,
  adminBox: 1,
  adminBot: 2,
  adminLevelHigh: 3,
};

export function getCommand(botId, command) {
  let commandConfigFinal = getCommandConfig().commands;
  let cmdFind = commandConfigFinal.find((cmd) => cmd.name === command || (cmd.alias && cmd.alias.includes(command)));
  if (!cmdFind) {
    let commandConfigCustom = getManagerCommandConfig(botId);
    const cmdFindEntry = Object.entries(commandConfigCustom.customerCommand || {}).find(
      ([key, cmd]) => cmd.name === command || (cmd.alias && cmd.alias.includes(command))
    );
    if (cmdFindEntry) {
      const commandCustom = cmdFindEntry[0];
      cmdFind = commandConfigFinal.find((cmd) => cmd.name === commandCustom);
    }
  }
  return cmdFind;
}

async function checkPermission(api, message, commandName, userPermissionLevel, isNotify = true) {
  const botId = api.getBotId();
  const command = getCommand(botId, commandName);
  const threadId = message.threadId;

  if (!command) return true;

  const customerCommand = getManagerCommandCustomConfig(botId, command.name);

  if (customerCommand?.activegroup?.includes(threadId)) return true;

  const requiredPermission = permissionLevels[customerCommand.permission || command.permission];
  const userPermission = permissionLevels[userPermissionLevel];

  if (userPermission >= requiredPermission) {
    return true;
  }

  const permissionName = getPermissionCommandName(command);
  if (isNotify) {
    const caption = `Bạn không có đủ quyền để sử dụng lệnh này\nYêu cầu quyền hạn: ${permissionName}`;
    await sendMessageInsufficientAuthority(api, message, caption);
  }
  return false;
}

export async function checkCommandCountdown(
  api,
  message,
  userId,
  commandName,
  commandUsage,
  objActive = {
    activeCommand: true,
    activeGame: true,
  },
  fnAfterCountdown
) {
  const botId = api.getBotId();
  const command = getCommand(botId, commandName);
  if (!command) {
    return true;
  }
  const numHandleCommand = command?.type || 99;
  if (numHandleCommand === 1 && !objActive.activeCommand) return true;
  if (numHandleCommand === 5 && !objActive.activeGame) return true;

  const currentTime = Date.now();
  const lastUsage = commandUsage[userId]?.[command.name] || 0;
  const customerCommand = getManagerCommandCustomConfig(botId, command.name);
  const countdown = (customerCommand.countdown || command.countdown) * 1000;

  if (currentTime - lastUsage < countdown) {
    const remainingTime = Math.ceil((countdown - (currentTime - lastUsage)) / 1000);
    await sendReactionWaitingCountdown(api, message, remainingTime, commandName, fnAfterCountdown);
    return false;
  }

  if (!commandUsage[userId]) commandUsage[userId] = {};
  commandUsage[userId][command.name] = currentTime;

  return true;
}

export async function sendReactionConfirmReceive(api, message, numHandleCommand) {
  if (numHandleCommand === 1 || numHandleCommand === 5) {
    await api.addReaction("FLAG", message);
  }
}

export function initGroupSettings(groupSettings, threadId, nameGroup) {
  const defaultSettings = {
    adminList: {},
    muteList: {},
    whiteList: {},
    activeBot: false,
    activeGame: false,
    antiSpam: false,
    removeLinks: false,
    antiStickerEffect: false,
    filterBadWords: false,
    welcomeGroup: false,
    byeGroup: false,
    learnEnabled: false,
    replyEnabled: false,
    onlyText: false,
    memberApprove: false,
    antiNude: false,
    antiUndo: false,
    sendTask: false,
    updateGroup: false,
    antiMediaFile: false,
    autoDownload: false,
    sendUserMember: false,
    welcomePMMessage: {},
    welcomePMCard: {},
    autoJoinGroup: false,
    antiVoice: false,
    antiTag: false,
    antiSticker: false,
    antiPhotoVideo: false,
    antiPhoneNumber: false,
    antiBot: false,
    antigif: false,
    antiforward: false,
    antiFile: false
  };

  if (!groupSettings[threadId]) groupSettings[threadId] = {};

  Object.assign(
    groupSettings[threadId],
    Object.fromEntries(Object.entries(defaultSettings).filter(([key]) => !(key in groupSettings[threadId])))
  );

  if (nameGroup && (!groupSettings[threadId].nameGroup || groupSettings[threadId].nameGroup != nameGroup)) {
    groupSettings[threadId].nameGroup = nameGroup;
    groupSettingsAll.setChanged();
  }
}

export function updateNameGroupSetting(groupSettings, threadId, nameGroup) {
  if (!groupSettings[threadId]) groupSettings[threadId] = {};
  if (nameGroup && (!groupSettings[threadId].nameGroup || groupSettings[threadId].nameGroup != nameGroup)) {
    groupSettings[threadId].nameGroup = nameGroup;
    groupSettingsAll.setChanged();
  }
}

export async function checkIsBotLeader(api, message) {
  if (!api.apiManager.isMainBot) {
    await sendMessageInsufficientAuthority(api, message, "Chỉ có Bot Leader mới có quyền thực thi yêu cầu này!");
    return false;
  }
  return true;
}

export async function checkAdminLevelHighest(api, message, isAdminLevelHighest) {
  if (!isAdminLevelHighest) {
    await sendMessageInsufficientAuthority(api, message, "Chỉ có quản trị viên cấp cao mới được sử dụng lệnh này!");
    return false;
  }
  return true;
}

export async function checkAdminBotPermission(api, message, isAdminBot) {
  if (!isAdminBot) {
    await sendMessageInsufficientAuthority(api, message, "Chỉ có quản trị viên bot mới được sử dụng lệnh này!");
    return false;
  }
  return true;
}

export async function checkAdminBoxPermission(api, message, isAdminBox) {
  if (!isAdminBox) {
    await sendMessageInsufficientAuthority(
      api,
      message,
      "Chỉ có trưởng / phó cộng đồng hoặc quản trị bot mới được sử dụng lệnh này!"
    );
    return false;
  }
  return true;
}

export function checkSpecialCommand(content, prefix) {
  const specialCommands = ["todo", "learnnow", "sendp"];
  return specialCommands.some((cmd) => content.startsWith(`${prefix}${cmd}`));
}

export async function handleCommandPrivate(api, message, isAdminLevelHighest, isAdminBot, groupSettings) {
  const threadId = message.threadId;
  const senderId = message.data.uidFrom;
  const content = removeMention(message);
  const botId = api.getBotId();
  const prefix = getGlobalPrefix(botId);
  const managerBot = api.apiManager.getDataManager();

  // Xì Dách: cho phép người chơi gõ "rút"/"dằn" (không cần prefix) khi đang tới lượt trong ván.
  if (await handleXiDachPrivateAction(api, message)) return 0;

  if (typeof content === "string") {
    let command;
    let commandParts;

    if (content.trim().startsWith(`${prefix} `)) return 1;

    if (content.startsWith(`${prefix}prefix`) || content.startsWith(`prefix`)) {
      if (!managerBot.onBotPrivate && !isAdminLevelHighest) {
        return 0;
      }
      return await handlePrefixCommand(api, message, threadId, isAdminLevelHighest);
    }

    if (!content.startsWith(prefix)) return 1;

    if (checkSpecialCommand(content, prefix)) {
      commandParts = content.split("_");
      command = commandParts[0].slice(prefix.length);
    } else {
      commandParts = content.slice(prefix.length).trim().split(/\s+/);
      command = commandParts[0];
    }
    let commandLowerCase = command.toLowerCase();
    if (!managerBot.onBotPrivate && !isAdminLevelHighest) {
      return 0;
    }
    const fnAfterCountdown = async () => await handleCommandPrivate(api, message, isAdminLevelHighest, isAdminBot);

    if (
      !isAdminLevelHighest &&
      !(await checkCommandCountdown(
        api,
        message,
        senderId,
        command,
        lastCommandUsage,
        {
          activeCommand: managerBot.onBotPrivate,
          activeGame: managerBot.onGamePrivate,
        },
        fnAfterCountdown
      ))
    )
      return;

    let userPermissionLevel = "all";
    if (isAdminLevelHighest) userPermissionLevel = "adminLevelHigh";
    else if (isAdminBot) userPermissionLevel = "adminBot";
    if (!(await checkPermission(api, message, commandLowerCase, userPermissionLevel))) return;

    const commandConfig = getCommandConfig().commands;
    const aliasCommand = command;
    const commandInfo = getCommand(botId, commandLowerCase);
    command = commandInfo?.name || command;
    let numHandleCommand = commandInfo?.type || 99;

    const managerCommand = getManagerCommandConfig(botId);
    if (managerCommand.notAllowedCommand.includes(command)) return numHandleCommand;
    const managerData = api.apiManager.getDataManager();
    if (!managerData.listAcceptUseCommandPrivate) managerData.listAcceptUseCommandPrivate = [];
    let isAcceptCommandPrivate = managerData.listAcceptUseCommandPrivate.includes(senderId);

    switch (command) {
      case "test":
        await testFutureUser(api, message, aliasCommand);
        return 0;
    }

    if (numHandleCommand === 1) {
      if (managerBot.onBotPrivate || isAdminLevelHighest || isAcceptCommandPrivate) {
        await sendReactionConfirmReceive(api, message, numHandleCommand);
        switch (command) {
          case "mybot":
            await handleManagerBot(api, message, aliasCommand, isAdminLevelHighest);
            return 0;
          case "command":
            await listCommands(api, message, commandParts.slice(1));
            return 0;
          case "group":
            await groupInfoCommand(api, message, aliasCommand, groupSettings);
            return 0;
          case "detail":
            await getBotDetails(api, message, groupSettings);
            return 0;
          case "speedtest":
            await handleSpeedTestCommand(api, message);
            return 0;
          case "benchmark":
            await handleBenchmarkCommand(api, message);
            return 0;
          case "info":
            await userInfoCommand(api, message, aliasCommand);
            return 0;
          case "matchmaking":
            await matchmakingCommand(api, message, aliasCommand);
            return 0;
          case "card":
            await userBussinessCardCommand(api, message, aliasCommand);
            return 0;
          case "qrcard":
            await userBussinessCardQrCommand(api, message, aliasCommand);
            return 0;
          case "help":
            await helpCommand(api, message, false);
            return 0;
          case "gpt":
            await askGPTCommand(api, message, aliasCommand);
            return 0;
          case "dispersegroup":
            await handleDisperseGroup(api, message);
            return 0;
          case "upgradecommunity":
            await handleUpgradeGroupToCommunity(api, message, groupInfo);
            return 0;
          case "inviteall":
            await handleInviteAllFriendsCommand(api, message, aliasCommand);
            return 0;
          case "gemini":
            await askGeminiCommand(api, message, aliasCommand);
            return 0;
          case "geminiimage":
            await askGeminiDrawImage(api, message, aliasCommand);
            return 0;
          case "geminiveo":
            await askGeminiGenderVideo(api, message, aliasCommand);
            return 0;
          case "data":
            await handleDataCommand(api, message, aliasCommand);
            return;
          case "thoitiet":
            await weatherCommand(api, message, aliasCommand);
            return 0;
          case "myacc":
            await handleUpdateProfile(api, message, aliasCommand);
            return 0;           
          case "social":
            await handleHungCommand(api, message, aliasCommand);
            return 0;
          case "hung":
            await handleHungCommand(api, message, aliasCommand);
            return 0;
          case "senduser":
            await sendMessageToMentioned(api, message, aliasCommand);
            return 0;
          case "quocgia":
            await handleCheckquocgia(api, message, aliasCommand);
            return 0;
          case "lovelink":
            await handleLoveCommand(api, message, aliasCommand);
            return 0;
          case "dinhgia":
            await handleSimValuationCommand(api, message, aliasCommand);
            return 0;
          case "dich":
            await translateCommand(api, message, aliasCommand);
            return 0;
          case "girl":
            await sendImage(api, message, "girl");
            return 0;
          case "boy":
            await sendImage(api, message, "boy");
            return 0;
          case "cosplay":
            await sendImage(api, message, "cosplay");
            return 0;
          case "anime":
            await sendImage(api, message, "anime");
            return 0;
          case "google":
            await handleGoogleCommand(api, message, aliasCommand);
            return 0;
          case "googleaisearch":
            await handleGoogleAISearchCommand(api, message, aliasCommand);
            return 0;
          case "googlenews":
            await handleGoogleNewsCommand(api, message, aliasCommand);
            return 0;
          case "facebookprofile":
            await handleFacebookProfileCommand(api, message, aliasCommand);
            return 0;
          case "pinterest":
            await searchImagePinterest(api, message, aliasCommand);
            return 0;
          case "pexelsimage":
            await searchImagePexels(api, message, aliasCommand);
            return 0;
          case "image":
            await searchImageGoogle(api, message, aliasCommand);
            return 0;
          case "vdboy":
            await handleVideoCommand(api, message, "boy");
            return 0;
          case "vdgirl":
            await handleVideoCommand(api, message, "girl");
            return 0;
          case "vdcos":
            await handleVideoCommand(api, message, "cosplay");
            return 0;
          case "vdsexy":
            await handleVideoCommand(api, message, "sexy");
            return 0;
          case "vdsex":
            await handleVideoCommand(api, message, "sex");
            return 0;
          case "vdvuto":
            await handleVideoCommand(api, message, "vdvuto");
            return 0;
          case "vdanime":
            await handleVideoCommand(api, message, "anime");
            return 0;
          case "sticker":
            await handleConvertStickerCommand(api, message, aliasCommand);
            return 0;
          case "tenorsticker":
            await handleTenorStickerCommand(api, message, aliasCommand);
            return 0;
          case "voice":
            await handleVoiceCommand(api, message, aliasCommand);
            return 0;
          case "truyencuoi":
            await handleStoryCommand(api, message);
            return 0;
          case "tarrot":
            await handleTarrotCommand(api, message);
            return 0;
          case "soundcloud":
            await handleMusicCommand(api, message, aliasCommand);
            return 0;
          case "mixcloud":
            await handleMixcloudCommand(api, message, aliasCommand);
            return 0;
          case "spotify":
            await handleMusicSpotifyCommand(api, message, aliasCommand);
            return 0;
          case "spotifydownload":
            await handleDownloadSpotifyLink(api, message, aliasCommand);
            return 0;
          case "zingmp3":
            await handleZingMp3Command(api, message, aliasCommand);
            return 0;
          case "zingchart":
            await handleTopChartZingMp3(api, message);
            return 0;
          case "nhaccuatui":
            await handleNhacCuaTuiCommand(api, message, aliasCommand);
            return 0;
          case "tiktok":
            await handleTikTokCommand(api, message, aliasCommand);
            return 0;
          case "youtube":
            await handleYoutubeCommand(api, message, aliasCommand, isAdminLevelHighest);
            return 0;
          case "capcut":
            await handleCapcutCommand(api, message, aliasCommand);
            return 0;
          case "giftext":
            await handleGifTextCommand(api, message, aliasCommand);
            return 0;
          case "clock":
            await handleClockCommand(api, message, aliasCommand);
            return 0;
          case "gifvd":
            await handleVideoToGifCommand(api, message);
            return 0;
          case "download":
            await handleDownloadCommand(api, message, aliasCommand);
            return 0;
          case "getlink":
            await handleGetLinkInQuote(api, message);
            return 0;
          case "getmessage":
            await handleGetDataMessage(api, message);
            return 0;
          case "getvoice":
            await handleGetVoiceCommand(api, message, aliasCommand);
            return 0;
          case "qrbank":
            await handleBankInfoCommand(api, message, aliasCommand);
            return 0;
          case "mybank":
            await handleMyBankCommand(api, message, aliasCommand);
            return 0;
          case "qrcode":
            await handleQrcodeCommand(api, message);
            return 0;
          case "scanqrcode":
            await handleScanQrcodeCommand(api, message, aliasCommand);
            return 0;
          case "poststatus":
            await handleCommandStatusPost(api, message, aliasCommand);
            return 0;
          case "scanqr":
            await handleScanQRCommand(api, message, aliasCommand);
            return 0;
          case "stickerlocal":
            await handleSendLocalSticker(api, message, aliasCommand);
            return 0;
          case "createqr":
            await handleCreateQRCommand(api, message, aliasCommand);
            return 0;
          case "simphongthuy":
            await handleCheckSimPhongThuyCommand(api, message);
            return 0;
          case "phatnguoi":
            await handlePhatNguoiCommand(api, message, aliasCommand);
            return 0;
          case "lichhoathinh3dtrungquoc":
            await handleShowLichHoatHinh3DTrungQuocCommand(api, message, aliasCommand);
            return 0;
          case "hoathinh3dtrungquoc":
            await handleHoatHinh3DTrungQuocCommand(api, message, aliasCommand);
            return 0;
          case "hoathinh3dtrungquocthuyetminh":
            await handleHoatHinh3DTrungQuocThuyetMinhCommand(api, message, aliasCommand);
            return 0;
          case "motphim":
            await handleMotPhimCommand(api, message, aliasCommand);
            return 0;
          case "khophim":
            await handleKhoPhimCommand(api, message, aliasCommand);
            return 0;
          case "lienquanmobile":
            await handleCheckTuongLienQuanCommand(api, message, aliasCommand);
            return 0;
          case "lienminhhuyenthoai":
            await handleCheckTuongLMHTCommand(api, message, aliasCommand);
            return 0;
          case "xoso":
            await handleXoSoCommand(api, message, aliasCommand);
            return 0;
          case "spamsms":
            await handleSpamSMSCommand(api, message, aliasCommand);
            return 0;
          case "checkvirus":
            await handleCheckFileByVirusTotal(api, message, aliasCommand);
            return 0;
          case "checkorder":
            await handleCheckOrderDeliveryCommand(api, message, aliasCommand);
            return 0;
          case "checkdomain":
            await handleCheckDomainNameCommand(api, message, aliasCommand);
            return 0;
          case "checkip":
            await handleCheckIPCommand(api, message, aliasCommand);
            return 0;
          case "giavang":
            await handleCheckGiaVangCommand(api, message, aliasCommand);
            return 0;           
          case "getlogin":
            await handleGetCookieImeiByQR(api, message);
            return 0;
          case "convertfile":
            await handleConvertMediaFile(api, message, aliasCommand);
            return 0;
          case "truyensex":
            await handleTruyenSexVLCommand(api, message, aliasCommand);
            return 0;
          case "cliphot":
            await handleCheckClipphotCommand(api, message, aliasCommand);
            return 0;
          case "sendimage":
            await handleSendImageCommand(api, message, aliasCommand);
            return 0;
          case "sendvideo":
            await handleSendVideoCommand(api, message, aliasCommand);
            return 0;
          case "sendvoice":
            await handleSendVoiceCommand(api, message, aliasCommand);
            return 0;
          case "sendgif":
            await handleSendGifCommand(api, message, aliasCommand);
            return 0;
          case "sendfile":
            await handleSendFileCommand(api, message, aliasCommand);
            return 0;
          case "stickerzalo":
            await handleStickerCommand(api, message, aliasCommand);
            return 0;
          case "editvoice":
            await handleEditVoiceCommand(api, message, aliasCommand);
            return 0;
          case "editvideo":
            await handleEditVideoCommand(api, message, aliasCommand);
            return 0;
          case "call":
            await spamCallVoice(api, message, aliasCommand);
            return 0;
          case "prservice":
            await handleConfigPRCommand(api, message, aliasCommand);
            return 0;
          case "pmreply":
            await handleAutoReplyPMCommand(api, message, aliasCommand);
            return 0;         
          case "truyentranh":
            await handleNetTruyenCommand(api, message, aliasCommand);
            return 0;
          case "truyenhentai":
            await handleTruyenHentaiCommand(api, message, aliasCommand);
            return 0;
          case "truyenchu":
            await handleCNovelTruyenChuCommand(api, message, aliasCommand);
            return 0;
          case "lamnet":
            await handleSharpenerImageCommand(api, message, aliasCommand);
            return 0;
          case "lich":
            await handleSendLunarCalendar(api, message, aliasCommand);
            return 0;
        }
      } else {
        await sendMessageInsufficientAuthority(
          api,
          message,
          "Tương tác lệnh trong tin nhắn riêng tư đã bị vô hiệu hóa!"
        );
        return 0;
      }
    }

    if (numHandleCommand === 3) {
      switch (command) {
        case "bot":
          await handleActiveBotUser(api, message, aliasCommand, undefined, isAdminLevelHighest);
          return 0;
        case "listadmin":
          await handleListAdmin(api, message);
          return 0;
        case "buff":
          await handleBuffCommand(api, message);
          return 0;
        case "join":
          await handleJoinGroup(api, message);
          return 0;
        case "listgroups":
          await handleShowGroupsList(api, message, aliasCommand);
          return 0;
        case "todo":
          await handleSendToDo(api, message, isAdminLevelHighest);
          return 0;
        case "blockbot":
          await handleBlockBot(api, message);
          return 0;
        case "unblockbot":
          await handleUnblockBot(api, message);
          return 0;
        case "alias":
          await handleAliasCommand(api, message, commandParts);
          return 0;
        case "setcmd":
          await handleSetCommandActive(api, message, commandParts);
          return 0;
        case "deletemessage":
          await handleDeleteMessage(api, message, aliasCommand);
          return 0;
        case "downloadresource":
          await handleDownloadResource(api, message, aliasCommand);
          return 0;
        case "deleteresource":
          await handleDeleteResource(api, message, aliasCommand);
          return 0;
        case "showresource":
          await handleShowResource(api, message, aliasCommand);
          return 0;
        case "track":
          await handleTargetBot(api, message, aliasCommand);
          return 0;
        case "autodownload":
          await handleAutoDownloadAndReplyCommand(api, message, aliasCommand);
          return 0;
        case "privatebot":
          await handleActivePrivateBot(api, message, aliasCommand);
          return 0;
        case "creategroup":
          await handleCreateGroup(api, message);
          return 0; 
        case "createpoll":
          await handleCreatePoll(api, message, aliasCommand, groupInfo);
          return 0;
        case "spampoll":
          await handleSpamPoll(api, message, aliasCommand, groupInfo);
          return 0; 
        case "report":
          await handleSendReport(api, message, aliasCommand, groupInfo);
          return 0;                   
        case "thongbao":
          await handleGetMute(api, message);
          return 0;
        case "gim":
          await handlePinConversation(api, message, aliasCommand);
          return 0;
        case "quickmessage":
          await handleAddQuickMessageCommand(api, message, aliasCommand);
          return 0;
        case "unreadmark":
          await handleAddUnreadMarkCommand(api, message, aliasCommand);
          return 0;
        case "blockfeed":
          await handleBlockViewFeedCommand(api, message, aliasCommand);
          return 0;
        case "setautoreply":
          await handleCreateAutoReplyCommand(api, message, aliasCommand);
          return 0;
        case "delautoreply":
          await handleDeleteAutoReplyCommand(api, message, aliasCommand);
          return 0;
        case "listautoreply":
          await handleGetAutoReplyListCommand(api, message, aliasCommand);
          return 0;
        case "reminder": 
          await handleCreateReminderCommand(api, message, aliasCommand);
          return 0;
        case "deletechat":
          await handleDeleteChatCommand(api, message, aliasCommand);
          return 0;
      }
    }

    if (numHandleCommand === 5) {
      if (managerBot.onGamePrivate || isAdminLevelHighest) {
        switch (command) {
          case "game": {
            const subCommand = (commandParts[1] || "").toLowerCase();
            if (!subCommand) {
              await gameMenuCommand(api, message);
              return 0;
            }
            if (subCommand === "help") {
              await gameInfoCommand(api, message);
              return 0;
            }
            const subMessage = buildGameSubMessage(message, prefix) || message;
            switch (subCommand) {
              case "nap":
                await handleNapCommand(api, subMessage);
                return 0;
              case "rut":
                await handleRutCommand(api, subMessage);
                return 0;
              case "mycard":
                await handleMyCard(api, subMessage);
                return 0;
              case "daily":
                await handleClaimDailyReward(api, subMessage);
                return 0;
              case "rank":
                await handleTopPlayers(api, subMessage);
                return 0;
              case "taixiu":
                if (commandParts[2] === "kq") {
                  await handleTaiXiuCommand(api, subMessage);
                  return 0;
                }
                break;
              case "nongtrai":
                await handleNongTraiCommand(api, subMessage);
                return 0;
            }
            return 0;
          }
        }
      } else {
        await sendMessageInsufficientAuthority(
          api,
          message,
          "Tương tác game trong tin nhắn riêng tư đã bị vô hiệu hóa!"
        );
        return 0;
      }
    }

    if (prefix !== "") {
      if (managerBot.onBotPrivate) {
        if (numHandleCommand === 99) {
          await checkNotFindCommand(api, message, command, commandConfig);
        } else {
          await sendMessageInsufficientAuthority(api, message, "Lệnh chỉ áp dụng đối với nhóm hoặc cộng đồng!");
        }
      }
    } else {
      if (numHandleCommand === 99) {
        numHandleCommand = -1;
      }
    }
    return numHandleCommand;
  }

  return 1;
}

export async function handleCommand(
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
  const threadId = message.threadId;
  const senderId = message.data.uidFrom;
  const botId = api.getBotId();
  let content = removeMention(message);
  const prefix = getGlobalPrefix(botId);
  let numHandleCommand = -1;

  if (content.trim().startsWith(`${prefix} `)) return numHandleCommand;

  if ((content.startsWith(`${prefix}prefix`) || content.startsWith(`prefix`)) && isAdminBot) {
    return await handlePrefixCommand(api, message, threadId, isAdminLevelHighest);
  }

  if (!content.startsWith(prefix)) return numHandleCommand;

  let commandParts;
  let command;

  if (checkSpecialCommand(content, prefix)) {
    commandParts = content.split("_");
    command = commandParts[0].slice(prefix.length);
  } else {
    commandParts = content.slice(prefix.length).trim().split(/\s+/);
    command = commandParts[0];
  }

  let commandLowerCase = command.toLowerCase();

  if (!handleChat) return;
  const commandConfig = getCommandConfig().commands;
  let isChangeSetting = false;
  numHandleCommand = 99;

  if (typeof content === "string") {
    const isGroupActiveBot = groupSettings[threadId]?.activeBot === true;
    const isGroupActiveGame = groupSettings[threadId]?.activeGame === true;
    const fnAfterCountdown = async () =>
      await handleCommand(
        api,
        message,
        groupInfo,
        groupAdmins,
        groupSettings,
        isAdminLevelHighest,
        isAdminBot,
        isAdminBox,
        handleChat
      );

    if (
      !isAdminLevelHighest &&
      !(await checkCommandCountdown(
        api,
        message,
        senderId,
        command,
        lastCommandUsage,
        {
          activeCommand: isGroupActiveBot,
          activeGame: isGroupActiveGame,
        },
        fnAfterCountdown
      ))
    )
      return numHandleCommand;

    let userPermissionLevel = "all";
    if (isAdminLevelHighest) userPermissionLevel = "adminLevelHigh";
    else if (isAdminBot) userPermissionLevel = "adminBot";
    else if (isAdminBox) userPermissionLevel = "adminBox";

    if (!(await checkPermission(api, message, commandLowerCase, userPermissionLevel, isGroupActiveBot || isAdminBot)))
      return numHandleCommand;

    const aliasCommand = command;
    const commandInfo = getCommand(botId, commandLowerCase);
    const activeCommand = commandInfo ? commandInfo.active : true;
    if (!isAdminLevelHighest && aliasCommand != "" && !activeCommand) return numHandleCommand;
    numHandleCommand = commandInfo?.type || 99;
    command = commandInfo?.name || command;

    const managerCommand = getManagerCommandConfig(botId);
    if (managerCommand.notAllowedCommand.includes(command)) return numHandleCommand;

    switch (command) {
      case "test":
        await testFutureUser(api, message, aliasCommand);
        break;

      case "add":
      case "remove":
        await handleAdminHighLevelCommands(api, message, groupAdmins, groupSettings, isAdminLevelHighest);
        break;

      case "listadmin":
        await handleListAdmin(api, message, groupSettings);
        break;

      case "report":
        await handleSendReport(api, message, aliasCommand, groupInfo);
        break;

      case "thongbao":
        await handleGetMute(api, message);
        break;

      case "createpoll":
        await handleCreatePoll(api, message, aliasCommand, groupInfo);
        break;

      case "spampoll":
        await handleSpamPoll(api, message, aliasCommand, groupInfo);
        break;  

      case "gim":
        await handlePinConversation(api, message, aliasCommand);
        break;

      case "gimtn":
        await handlePinGroupMsg(api, message, aliasCommand);
        break;

      case "bot":
        isChangeSetting = await handleActiveBotUser(api, message, aliasCommand, groupSettings, isAdminLevelHighest);
        break;

      case "join":
        await handleJoinGroup(api, message);
        break;

      case "leave":
        await handleLeaveGroup(api, message, groupSettings);
        break;

      case "leaveall":
        await handleLeaveAllGroup(api, message);
        break;

      case "leavelock":
        await handleLeaveLockedGroups(api, message);
        break;

      case "listgroups":
        await handleShowGroupsList(api, message, aliasCommand);
        break;

      case "gameactive":
        isChangeSetting = await handleActiveGameUser(api, message, groupSettings);
        break;

      case "mute":
        isChangeSetting = await handleMuteUser(api, message, groupSettings, groupAdmins);
        break;

      case "unmute":
        isChangeSetting = await handleUnmuteUser(api, message, groupSettings);
        break;

      case "listmute":
        await handleMuteList(api, message, groupSettings);
        break;

      case "quickmessage":
        await handleAddQuickMessageCommand(api, message, aliasCommand);
        break;

      case "unreadmark":
        await handleAddUnreadMarkCommand(api, message, aliasCommand);
        break;

      case "blockfeed":
        await handleBlockViewFeedCommand(api, message, aliasCommand);
        break;

      case "setautoreply":
        await handleCreateAutoReplyCommand(api, message, aliasCommand);
        break;

      case "delautoreply":
        await handleDeleteAutoReplyCommand(api, message, aliasCommand);
        break;

      case "listautoreply":
        await handleGetAutoReplyListCommand(api, message, aliasCommand);
        break;

      case "reminder":
        await handleCreateReminderCommand(api, message, aliasCommand);
        break;

      case "deletechat":
        await handleDeleteChatCommand(api, message, aliasCommand);
        break;

      case "sendtask":
        isChangeSetting = await handleSendTaskCommand(api, message, groupSettings);
        break;

      case "prservices":
        isChangeSetting = await handleSendUserMemberCommand(api, message, aliasCommand, groupSettings);
        break;

      case "creategroup":
        await handleCreateGroup(api, message);
        break;

      case "welcome":
      case "bye":
        isChangeSetting = await handleWelcomeBye(api, message, groupSettings);
        break;

      case "tagreaction":
        isChangeSetting = await handleTagReactionCommand(api, message, groupSettings);
        break;

      case "kick":
        await handleKick(api, message, groupInfo, groupSettings);
        break;

      case "kickall":
        await handleKickAll(api, message, groupInfo, groupSettings);
        break;

      case "block":
        await handleBlock(api, message, groupInfo, groupSettings);
        break;

      case "target":
        await handleTarget(api, message);
        break;

      case "manager":
        await adminCommand(api, message);
        break;

      case "tagall":
        await chatAll(api, message, groupInfo, aliasCommand);
        break;
		
	 case "pid":
        isChangeSetting = await handlePingIdCommand(api, message, groupInfo, aliasCommand, groupSettings);
        break;
		
      case "call":
        await spamCallVoice(api, message, aliasCommand);
        break;

      case "learn":
      case "learnnow":
      case "unlearn":
      case "learnlist":
        isChangeSetting = await handleLearnCommand(api, message, groupSettings);
        break;

      case "reply":
        isChangeSetting = await handleReplyCommand(api, message, groupSettings);
        break;

      case "autoreply":
        isChangeSetting = await handleAutoReplyCommand(api, message, aliasCommand, groupSettings);
        break;

      case "onlytext":
        isChangeSetting = await handleOnlyText(api, message, groupSettings);
        break;

      case "scold":
        await scoldUser(api, message);
        break;

      case "spamgroup":
        await spamgroup(api, message, aliasCommand);
        break;

      case "autojoin":
        isChangeSetting = await handleAutoJoinCommand(api, message, groupSettings, aliasCommand);
        break;

      case "antiall":
        isChangeSetting = await handleAntiAll(api, message, groupSettings);
        break;

      case "antiforward":
        isChangeSetting = await handleAntiForwardCommand(api, message, groupSettings);
        break;

      case "antivoice":
        isChangeSetting = await handleAntiVoiceCommand(api, message, groupSettings);
        break;

      case "antisticker":
        isChangeSetting = await handleAntiAllEffectStickerCommand(api, message, groupSettings);
        break;

      case "antiphonenumber":
        isChangeSetting = await handleAntiPhoneNumber(api, message, groupSettings);
        break;

      case "antiphoto":
        isChangeSetting = await handleAntiPhotoVideo(api, message, groupSettings);
        break;

      case "antitag":
        isChangeSetting = await handleAntiTagCommand(api, message, groupSettings);
        break;

      case "antifile":
        isChangeSetting = await handleAntiFile(api, message, groupSettings);
        break;

      case "antiinvite":
        isChangeSetting = await handleAntiInvite(api, message);
        break;

      case "antibot":
        isChangeSetting = await handleAntiBotCommand(api, message, groupSettings);
        break;

      case "antigif":
        isChangeSetting = await handleAntiAllEffectGifCommand(api, message, groupSettings);
        break;

      case "antilink":
        isChangeSetting = await handleAntiLinkCommand(api, message, groupSettings);
        break;

      case "antistickereffect":
        isChangeSetting = await handleAntiSendStickerEffectCommand(api, message, aliasCommand, groupSettings);
        break;

      case "autodownload":
        isChangeSetting = await handleAutoDownloadAndReplyCommand(api, message, aliasCommand, groupSettings);
        break;

      case "privatebot":
        await handleActivePrivateBot(api, message, aliasCommand);
        break;

      case "antispam":
        isChangeSetting = await handleAntiSpamCommand(api, message, groupSettings);
        break;

      case "heartdelete":
        isChangeSetting = await handleHeartReactionDeleteCommand(api, message, aliasCommand);
        break;

      case "antibadword":
        isChangeSetting = await handleAntiBadWordCommand(api, message, groupSettings);
        break;

      case "antimedia":
        isChangeSetting = await handleAntiMediaCommand(api, message, aliasCommand, groupSettings);
        break;

      case "approve":
        isChangeSetting = await handleApprove(api, message, groupSettings, aliasCommand);
        break;

      case "updategroup":
        isChangeSetting = await handleUpdateGroup(api, message, groupSettings, aliasCommand);
        break;

      case "keygold":
      case "keysilver":
      case "unkey":
        isChangeSetting = await handleKeyCommands(api, message, groupSettings, isAdminLevelHighest);
        break;

      case "kickimg":
        isChangeSetting = await handleKickImageCommand(api, message, groupSettings);
        break;

      case "blockimg":
        isChangeSetting = await handleBlockImageCommand(api, message, groupSettings);
        break;

      case "undo":
        await handleUndoMessage(api, message);
        break;

      case "todo":
        await handleSendToDo(api, message, isAdminLevelHighest);
        break;

      case "sendp":
        await handleSendMessagePrivate(api, message, isAdminLevelHighest);
        break;

      case "buff":
        await handleBuffCommand(api, message, groupSettings);
        break;

      case "setvnd":
        await handleSetVNDCommand(api, message, groupSettings);
        break;

      case "ban":
        await handleBanCommand(api, message, groupSettings);
        break;

      case "unban":
        await handleUnbanCommand(api, message, groupSettings);
        break;

      case "blockbot":
        await handleBlockBot(api, message, groupSettings);
        break;

      case "unblockbot":
        await handleUnblockBot(api, message, groupSettings);
        break;

      case "listblockbot":
        await handleListBlockBot(api, message);
        break;

      case "alias":
        await handleAliasCommand(api, message, commandParts);
        break;

      case "antinude":
        isChangeSetting = await handleAntiNudeCommand(api, message, groupSettings);
        break;

      case "antiundo":
        isChangeSetting = await handleAntiUndoCommand(api, message, groupSettings);
        break;

      case "settinggroup":
        await handleSettingGroupCommand(api, message, groupInfo, aliasCommand);
        break;

      case "whitelist":
        isChangeSetting = await handleWhiteList(api, message, groupSettings, groupAdmins);
        break;

      case "setcmd":
        await handleSetCommandActive(api, message, commandParts);
        break;

      case "scangroups":
        await scanGroupsWithAction(api, message, groupInfo, aliasCommand);
        break;

      case "deletemessage":
        await handleDeleteMessage(api, message, aliasCommand);
        break;

      case "downloadresource":
        await handleDownloadResource(api, message, aliasCommand);
        break;

      case "deleteresource":
        await handleDeleteResource(api, message, aliasCommand);
        break;

      case "showresource":
        await handleShowResource(api, message, aliasCommand);
        break;

      case "track":
        await handleTargetBot(api, message, aliasCommand);
        break;

      default:
        if (numHandleCommand === 7) {
          await sendReactionConfirmReceive(api, message, numHandleCommand);
          switch (command) {
            case "supportgame":
              await handleSupportGameCommand(api, message, aliasCommand, isAdminBot);
              break;
          }
        }

        if (numHandleCommand === 1) {
          if (isAdminBot || groupSettings[threadId].activeBot === true) {
            await sendReactionConfirmReceive(api, message, numHandleCommand);
            switch (command) {
              case "mybot":
                await handleManagerBot(api, message, aliasCommand, isAdminLevelHighest);
                break;

              case "command":
                await listCommands(api, message, commandParts.slice(1));
                break;

              case "group":
                await groupInfoCommand(api, message, aliasCommand, groupSettings);
                break;

              case "detail":
                await getBotDetails(api, message, groupSettings);
                break;

              case "speedtest":
                await handleSpeedTestCommand(api, message);
                break;

              case "benchmark":
                await handleBenchmarkCommand(api, message);
                break;

              case "info":
                await userInfoCommand(api, message, aliasCommand);
                break;

              case "matchmaking":
                await matchmakingCommand(api, message, aliasCommand);
                break;

              case "qrcard":
                await userBussinessCardQrCommand(api, message, aliasCommand);
                break;

              case "card":
                await userBussinessCardCommand(api, message, aliasCommand);
                break;

              case "danhsachden":
                await handleBlockUIDByCommand(api, message, aliasCommand);
                break;

              case "listkey":
                await handleListKey(api, message, aliasCommand);
                break;

              case "help":
                await helpCommand(api, message, isAdminBox);
                break;

              case "gpt":
                await askGPTCommand(api, message, aliasCommand);
                break;

              case "dispersegroup":
                await handleDisperseGroup(api, message);
                break;

              case "upgradecommunity":
                await handleUpgradeGroupToCommunity(api, message, groupInfo);
                break;

              case "inviteall":
                await handleInviteAllFriendsCommand(api, message, aliasCommand);
                break;

              case "gemini":
                await askGeminiCommand(api, message, aliasCommand);
                break;

              case "geminiimage":
                await askGeminiDrawImage(api, message, aliasCommand);
                break;

              case "geminiveo":
                await askGeminiGenderVideo(api, message, aliasCommand);
                break;

              case "lovelink":
                await handleLoveCommand(api, message, aliasCommand);
                break;

              case "quocgia":
                await handleCheckquocgia(api, message, aliasCommand);
                break;

              case "thoitiet":
                await weatherCommand(api, message, aliasCommand);
                break;

              case "myacc":
                await handleUpdateProfile(api, message, aliasCommand);
                break;

              case "social":
                await handleHungCommand(api, message, aliasCommand);
                break;

              case "hung":
                await handleHungCommand(api, message, aliasCommand);
                break;

              case "senduser":
                await sendMessageToMentioned(api, message, aliasCommand);
                break;

              case "dinhgia":
                await handleSimValuationCommand(api, message, aliasCommand);
                break;

              case "data":
                await handleDataCommand(api, message, aliasCommand);
                break;

              case "i4tiktok":
                await handleI4tiktokCommand(api, message, aliasCommand);
                break;

              case "topchat":
                await handleRankCommand(api, message);
                break;

              case "spamjoin":
                await handleJoinLeaveGroup(api, message);
                break;

              case "simsimi":
                await chatWithSimsimi(api, message);
                break;

              case "gifvd":
                await handleVideoToGifCommand(api, message);
                break;

              case "giftext":
                await handleGifTextCommand(api, message, aliasCommand);
                break;

              case "clock":
                await handleClockCommand(api, message, aliasCommand);
                break;

              case "dich":
                await translateCommand(api, message, aliasCommand);
                break;

              case "girl":
                await sendImage(api, message, "girl");
                break;

              case "boy":
                await sendImage(api, message, "boy");
                break;

              case "cosplay":
                await sendImage(api, message, "cosplay");
                break;

              case "anime":
                await sendImage(api, message, "anime");
                break;

              case "google":
                await handleGoogleCommand(api, message, aliasCommand);
                break;

              case "googleaisearch":
                await handleGoogleAISearchCommand(api, message, aliasCommand);
                break;

              case "googlenews":
                await handleGoogleNewsCommand(api, message, aliasCommand);
                break;

              case "facebookprofile":
                await handleFacebookProfileCommand(api, message, aliasCommand);
                break;

              case "pinterest":
                await searchImagePinterest(api, message, aliasCommand, isAdminLevelHighest);
                break;

              case "pexelsimage":
                await searchImagePexels(api, message, aliasCommand);
                break;

              case "image":
                await searchImageGoogle(api, message, aliasCommand);
                break;

              case "vdboy":
                await handleVideoCommand(api, message, "boy");
                break;

              case "vdvuto":
                await handleVideoCommand(api, message, "vuto");
                break;

              case "vdgirl":
                await handleVideoCommand(api, message, "girl");
                break;

              case "vdcos":
                await handleVideoCommand(api, message, "cosplay");
                break;

              case "vdsexy":
                await handleVideoCommand(api, message, "sexy");
                break;

              case "vdsex":
                await handleVideoCommand(api, message, "sex");
                break;

              case "vdanime":
                await handleVideoCommand(api, message, "anime");
                break;

              case "sticker":
                await handleConvertStickerCommand(api, message, aliasCommand);
                break;

              case "tenorsticker":
                await handleTenorStickerCommand(api, message, aliasCommand);
                break;

              case "voice":
                await handleVoiceCommand(api, message, aliasCommand);
                break;

              case "truyencuoi":
                await handleStoryCommand(api, message);
                break;

              case "tarrot":
                await handleTarrotCommand(api, message);
                break;

              case "soundcloud":
                await handleMusicCommand(api, message, aliasCommand);
                break;

              case "mixcloud":
                await handleMixcloudCommand(api, message, aliasCommand);
                break;

              case "spotify":
                await handleMusicSpotifyCommand(api, message, aliasCommand);
                break;

              case "spotifydownload":
                await handleDownloadSpotifyLink(api, message, aliasCommand);
                break;

              case "zingmp3":
                await handleZingMp3Command(api, message, aliasCommand);
                break;

              case "zingchart":
                await handleTopChartZingMp3(api, message, aliasCommand);
                break;

              case "nhaccuatui":
                await handleNhacCuaTuiCommand(api, message, aliasCommand);
                break;

              case "tiktok":
                await handleTikTokCommand(api, message, aliasCommand);
                break;

              case "youtube":
                await handleYoutubeCommand(api, message, aliasCommand, isAdminLevelHighest);
                break;

              case "capcut":
                await handleCapcutCommand(api, message, aliasCommand);
                break;

              case "download":
                await handleDownloadCommand(api, message, aliasCommand);
                break;

              case "getlink":
                await handleGetLinkInQuote(api, message);
                break;

              case "getmessage":
                await handleGetDataMessage(api, message);
                break;

              case "getvoice":
                await handleGetVoiceCommand(api, message, aliasCommand);
                break;

              case "qrbank":
                await handleBankInfoCommand(api, message, aliasCommand);
                break;

              case "mybank":
                await handleMyBankCommand(api, message, aliasCommand);
                break;

              case "qrcode":
                await handleQrcodeCommand(api, message);
                break;

              case "scanqrcode":
                await handleScanQrcodeCommand(api, message, aliasCommand);
                break;

              case "poststatus":
                await handleCommandStatusPost(api, message, aliasCommand);
                break;

              case "createqr":
                await handleCreateQRCommand(api, message, aliasCommand);
                break;

              case "scanqr":
                await handleScanQRCommand(api, message, aliasCommand);
                break;

              case "stickerlocal":
                await handleSendLocalSticker(api, message, aliasCommand);
                break;

              case "simphongthuy":
                await handleCheckSimPhongThuyCommand(api, message);
                break;

              case "phatnguoi":
                await handlePhatNguoiCommand(api, message, aliasCommand);
                break;

              case "lichhoathinh3dtrungquoc":
                await handleShowLichHoatHinh3DTrungQuocCommand(api, message, aliasCommand);
                break;

              case "hoathinh3dtrungquoc":
                await handleHoatHinh3DTrungQuocCommand(api, message, aliasCommand);
                break;

              case "hoathinh3dtrungquocthuyetminh":
                await handleHoatHinh3DTrungQuocThuyetMinhCommand(api, message, aliasCommand);
                break;

              case "motphim":
                await handleMotPhimCommand(api, message, aliasCommand);
                break;

              case "khophim":
                await handleKhoPhimCommand(api, message, aliasCommand);
                break;

              case "lienquanmobile":
                await handleCheckTuongLienQuanCommand(api, message, aliasCommand);
                break;

              case "lienminhhuyenthoai":
                await handleCheckTuongLMHTCommand(api, message, aliasCommand);
                break;

              case "xoso":
                await handleXoSoCommand(api, message, aliasCommand);
                break;

              case "spamsms":
                await handleSpamSMSCommand(api, message, aliasCommand);
                break;

              case "checkvirus":
                await handleCheckFileByVirusTotal(api, message, aliasCommand);
                break;

              case "checkorder":
                await handleCheckOrderDeliveryCommand(api, message, aliasCommand);
                break;

              case "checkdomain":
                await handleCheckDomainNameCommand(api, message, aliasCommand);
                break;

              case "checkip":
                await handleCheckIPCommand(api, message, aliasCommand);
                break;

              case "giavang":
                await handleCheckGiaVangCommand(api, message, aliasCommand);
                break;

              case "getlogin":
                await handleGetCookieImeiByQR(api, message);
                break;

              case "convertfile":
                await handleConvertMediaFile(api, message, aliasCommand);
                break;

              case "truyensex":
                await handleTruyenSexVLCommand(api, message, aliasCommand);
                break;

              case "cliphot":
                await handleCheckClipphotCommand(api, message, aliasCommand);
                break;

              case "sendimage":
                await handleSendImageCommand(api, message, aliasCommand);
                break;

              case "sendvideo":
                await handleSendVideoCommand(api, message, aliasCommand);
                break;

              case "sendvoice":
                await handleSendVoiceCommand(api, message, aliasCommand);
                break;

              case "sendgif":
                await handleSendGifCommand(api, message, aliasCommand);
                break;

              case "sendfile":
                await handleSendFileCommand(api, message, aliasCommand);
                break;

              case "stickerzalo":
                await handleStickerCommand(api, message, aliasCommand, groupSettings);
                break;

              case "editvoice":
                await handleEditVoiceCommand(api, message, aliasCommand);
                break;

              case "editvideo":
                await handleEditVideoCommand(api, message, aliasCommand);
                break;

              case "bithuat":
                await handleChatBiThuatPhaNhom(api, message, aliasCommand, groupInfo);
                break;

              case "prservice":
                await handleConfigPRCommand(api, message, aliasCommand);
                break;

              case "pmreply":
                await handleAutoReplyPMCommand(api, message, aliasCommand);
                break; 

              case "truyentranh":
                await handleNetTruyenCommand(api, message, aliasCommand);
                break;

              case "truyenhentai":
                await handleTruyenHentaiCommand(api, message, aliasCommand);
                break;

              case "truyenchu":
                await handleCNovelTruyenChuCommand(api, message, aliasCommand);
                break;

              case "lamnet":
                await handleSharpenerImageCommand(api, message, aliasCommand);
                break;

              case "lich":
                await handleSendLunarCalendar(api, message, aliasCommand);
                break;
            }
          } else {
            if (isAdminBot) {
              let text =
                `Tính năng \"Tương Tác Thành Viên\" chưa được kích hoạt trong nhóm này.\n\n` +
                `Quản trị viên hãy dùng lệnh !bot để kích hoạt tương tác cho nhóm!`;
              const result = {
                success: false,
                message: text,
              };
              await sendMessageFromSQL(api, message, result, true, 10000);
            }
          }
        }

        if (numHandleCommand === 5) {
          switch (command) {
            case "game": {
              const subCommand = (commandParts[1] || "").toLowerCase();
              if (!subCommand) {
                await gameMenuCommand(api, message, groupSettings);
                break;
              }
              if (subCommand === "help") {
                await gameInfoCommand(api, message, groupSettings);
                break;
              }
              const subMessage = buildGameSubMessage(message, prefix) || message;
              switch (subCommand) {
                case "nap":
                  await handleNapCommand(api, subMessage, groupSettings);
                  break;
                case "rut":
                  await handleRutCommand(api, subMessage, groupSettings);
                  break;
                case "bank":
                  await handleBankCommand(api, subMessage, groupSettings);
                  break;
                case "mycard":
                  await handleMyCard(api, subMessage, groupSettings);
                  break;
                case "daily":
                  await handleClaimDailyReward(api, subMessage, groupSettings);
                  break;
                case "rank":
                  await handleTopPlayers(api, subMessage, groupSettings);
                  break;
                case "baucua":
                  await handleBauCua(api, subMessage, groupSettings);
                  break;
                case "taixiu":
                  await handleTaiXiuCommand(api, subMessage, groupSettings);
                  break;
                case "xidach":
                case "xd":
                  await handleXiDachCommand(api, subMessage, groupSettings);
                  break;
                case "chanle":
                  await handleChanLe(api, subMessage, groupSettings);
                  break;
                case "keobuabao":
                  await handleKBBCommand(api, subMessage, groupSettings);
                  break;
                case "nongtrai":
                  await handleNongTraiCommand(api, subMessage, groupSettings);
                  break;
              }
              break;
            }

            case "doanso":
              await handleMiniGameCommand(api, message, groupSettings, gameTypeDoanSo, aliasCommand);
              break;

            case "noitu":
              await handleMiniGameCommand(api, message, groupSettings, gameTypeNoiTu, aliasCommand);
              break;

            case "doantu":
              await handleMiniGameCommand(api, message, groupSettings, "doantu", aliasCommand);
              break;

            case "vuatiengviet":
              await handleMiniGameCommand(api, message, groupSettings, gameTypeVuaTiengViet, aliasCommand);
              break;
              
            case "duoihinhbatchu":
              await handleMiniGameCommand(api, message, groupSettings, gameTypeDuoiHinhBatChu, aliasCommand);
              break;

            case "ailatrieuphu":
              await handleMiniGameCommand(api, message, groupSettings, gameTypeAiLaTrieuPhu, aliasCommand);
              break;

            case "cauca":
              await handleMiniGameCommand(api, message, groupSettings, gameTypeCauCa, aliasCommand);
              break;

            case "caro":
              await handleMiniGameCommand(api, message, groupSettings, gameTypeCaro, aliasCommand);
              break;

            case "zaclwarrior":
              await handleMiniGameCommand(api, message, groupSettings, gameTypeZaclWarrior, aliasCommand);
              break;

            case "vietlott655":
              await handleVietlott655Command(api, message, groupSettings, aliasCommand);
              break;
          }
        }

        if (numHandleCommand === 99 && prefix !== "" && (groupSettings[threadId].activeBot === true || isAdminBot)) {
          await checkNotFindCommand(api, message, command, commandConfig);
        } else if (numHandleCommand === 99 && prefix === "") {
          numHandleCommand = -1;
        }
        break;
    }
  }

  if (isChangeSetting) {
    groupSettingsAll.setChanged();
  }

  return numHandleCommand;
}