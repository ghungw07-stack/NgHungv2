import { handleMuteList, handleMuteUser, handleUnmuteUser } from "../service-ngh/anti-service/mute-user.js";
import { handleWelcomeBye, handleApprove, handleUpdateGroup, handleKickImageCommand, handleBlockImageCommand, handleSendUserMemberCommand } from "./bot-manager/welcome-bye.js";
import { handleBlock,
  handleKick,
  handleKickAll,
  handleSetMuteAll,
  handlePinConversation, 
  handleHiddenConversation,
  handleUpgradeGroupToCommunity,
  handlePinGroupMsg
} from "./bot-manager/group-manage.js";
import { handleUpdateProfile, handleCreatePoll, handleSpamPoll, handleSendReport } from "./bot-manager/utilities.js";
import { handleActiveBotUser, handleActiveGameUser, handleActivePrivateBot } from "./bot-manager/active-bot.js";
import { helpCommand, adminCommand, gameInfoCommand, gameMenuCommand, checkMenuPageReply } from "./instructions/help.js";
import { askGPTCommand } from "../service-ngh/api-crawl/assistant-ai/gpt.js";
import { askGeminiCommand } from "../service-ngh/api-crawl/assistant-ai/gemini.js";
import { askNovaCommand, isNovaAwaitingMusic, isNovaSessionActive } from "../service-ngh/api-crawl/assistant-ai/nova.js";
import { isNovaEnabled, isNovaGroupBot, setNovaEnabled } from "../utils/nova-store.js";
import { translateCommand } from "../service-ngh/api-crawl/content/translate.js";
import { weatherCommand } from "../service-ngh/api-crawl/content/weather.js";
import { handlePTGCommand } from "../service-ngh/api-crawl/content/ptg.js";
import { handlePhatNguoiCommand } from "../service-ngh/api-crawl/content/phatnguoi.js";
import {
  handleHoatHinh3DTrungQuocCommand,
  handleHoatHinh3DTrungQuocThuyetMinhCommand,
  handleShowLichHoatHinh3DTrungQuocCommand,
} from "../service-ngh/api-crawl/video-content/hh3dtq.js";
import { handleSpamSMSCommand } from "../service-ngh/api-crawl/content/spamsms.js";
import { handleCheckTuongLienQuanCommand } from "../service-ngh/api-crawl/content/info-lien-quan.js";
import { handleCheckTuongLMHTCommand } from "../service-ngh/api-crawl/content/info-lmht.js";
import { handleCheckOrderDeliveryCommand } from "../service-ngh/api-crawl/content/check-giao-hang.js";
import { handleShopeeCommand } from "../service-ngh/api-crawl/content/shopee.js";
import { handleCheckDomainNameCommand, handleCheckIPCommand } from "../service-ngh/api-crawl/content/check-host.js";
import { handleCheckClipphotCommand } from "../service-ngh/api-crawl/video-content/cliphot.js";
import { handleMotPhimCommand } from "../service-ngh/api-crawl/video-content/mot-phim.js";
import { handleKhoPhimCommand } from "../service-ngh/api-crawl/video-content/kho-phim.js";
import { handleXoSoCommand } from "../service-ngh/api-crawl/content/xo-so.js";
import { handleFootballCommand } from "../service-ngh/api-crawl/content/football.js";
import { handleAutoDownloadAndReplyCommand } from "../service-ngh/api-crawl/api-download/auto-download.js";
import { searchImagePinterest } from "../service-ngh/api-crawl/image-content/pinterest-service.js";
import { handleTikTokCommand } from "../service-ngh/api-crawl/tiktok/tiktok-service.js";
import { handleMusicCommand } from "../service-ngh/api-crawl/music-content/soundcloud.js";
import { handleMixcloudCommand } from "../service-ngh/api-crawl/music-content/mixcloud.js";
import { handleTopChartZingMp3, handleZingMp3Command } from "../service-ngh/api-crawl/music-content/zingmp3.js";
import { handleYoutubeCommand } from "../service-ngh/api-crawl/youtube/youtube-service.js";
import { handleNhacCuaTuiCommand } from "../service-ngh/api-crawl/music-content/nhaccuatui.js";
import { handleDownloadCommand } from "../service-ngh/api-crawl/api-download/aio-downlink.js";
import { handleCapcutCommand } from "../service-ngh/api-crawl/capcut/capcut-service.js";
import { searchImageGoogle } from "../service-ngh/api-crawl/google/google-image.js";
import { handleGoogleCommand } from "../service-ngh/api-crawl/google/google-search.js";
import { handleGoogleAISearchCommand } from "../service-ngh/api-crawl/google/google-ai-search.js";
import { handleGoogleNewsCommand } from "../service-ngh/api-crawl/google/google-news.js";
import { handleTvplCommand } from "../service-ngh/api-crawl/content/thuvien-phap-luat.js";
import { handleHorseRaceCommand } from "../service-ngh/game-service/dua-ngua/dua-ngua.js";
import { handleChessCommand } from "../service-ngh/game-service/mini-game/chess-game/index.js";
import { handleXiangqiCommand } from "../service-ngh/game-service/mini-game/xiangqi-game/index.js";
import { handlePetCommand } from "../service-ngh/game-service/pet-game/index.js";
import { handleTuTienCommand } from "../service-ngh/game-service/tu-tien/index.js";
import { handleFacebookProfileCommand } from "../service-ngh/api-crawl/facebook/facebook-profile.js";
import { handleDataCommand } from "../service-ngh/utilities/data-manager.js";
import { groupInfoCommand } from "../service-ngh/info-service/group-info.js";
import { handleDataMemberGroupCommand } from "../service-ngh/info-service/group-demographics.js";
import { userInfoCommand } from "../service-ngh/info-service/user-info.js";
import { handleI4ImageCommand } from "../service-ngh/info-service/i4image.js";
import { handleUidCommand } from "../service-ngh/info-service/uid.js";
import { handleRankCommand } from "../service-ngh/info-service/rank-chat.js";
import { handleAutoJoinCommand } from "../service-ngh/anti-service/auto-join.js";
import { chatAll } from "../service-ngh/chat-zalo/chat-general/chat-all.js";
import { handlePingIdCommand } from "./send-all/ping-id.js";
import { handleSendGifCommand } from "../service-ngh/chat-zalo/chat-special/send-gif/send-gif.js";
import { handleSendImageCommand, sendImage } from "../service-ngh/chat-zalo/chat-special/send-image/send-image.js";
import {
  handleSendVideoCommand,
  handleVideoCommand,
} from "../service-ngh/chat-zalo/chat-special/send-video/send-video.js";
import { gameTypeDuoiHinhBatChu } from "../service-ngh/game-service/mini-game/duoihinhbatchu/dhbc.js";
import { handleAntiForwardCommand } from "../service-ngh/anti-service/anti-forward.js";
import { chatWithSimsimi } from "../service-ngh/chat-bot/simsimi/simsimi-api.js";
import { handleLearnCommand, handleReplyCommand } from "../service-ngh/chat-bot/bot-learning/ngh-bot.js";
import { handleOnlyText } from "../service-ngh/anti-service/anti-not-text.js";
import { scoldUser } from "../service-ngh/chat-bot/scold-user/scold-user.js";
import { handleFakeMessageCommand } from "./fake-message.js";
import { handleBanThoCommand } from "./send-all/bantho.js";
import { handleThueBotCommand } from "./bot-manager/thuebot.js";
import { getBotStyle, setBotStyle } from "../utils/bot-style.js";
import { botText, getBotLanguage, getBotLanguageName, setBotLanguage } from "../utils/bot-language.js";
import { getBotDetails } from "../service-ngh/info-service/bot-info.js";
import {
  handleBanCommand,
  handleBankCommand,
  handleBuffCommand,
  handleSetTierCommand,
  handleClaimDailyReward,
  handleMyCard,
  handleTestMyCard,
  handleNapCommand,
  handleRutCommand,
  handleSetVNDCommand,
  handleStatementCommand,
  handleTopPlayers,
  handleUnbanCommand,
  handleDonateRankCommand,
  handleDonateCommand,
  handleGameTierCommand,
  handleResetDailyCommand,
  handleResetJackpotCommand,
  handleResetAllGameDataCommand,
} from "../service-ngh/game-service/index.js";
import { handleAntiLinkCommand } from "../service-ngh/anti-service/anti-link.js";
import { apiManager, canBotUseMainBotCommand, getCommandConfig, getManagerCommandConfig, getManagerCommandCustomConfig, isAdmin, isBotLeader, reloadCommandConfig } from "../index.js";
import {
  sendMessageFromSQL,
  sendMessageInsufficientAuthority,
  sendMessageFailed,
} from "../service-ngh/chat-zalo/chat-style/chat-style.js";
import { handleAdminHighLevelCommands, handleListAdmin } from "./bot-manager/admin-manager.js";
import { handleAntiSpamCommand } from "../service-ngh/anti-service/anti-spam.js";
import { handleBlockBot, handleUnblockBot, handleListBlockBot, handleBlockBotAll, handleUnblockBotAll, isUserBlocked, handleCreateGroup, handleTarget } from "./bot-manager/group-manage.js";
import { listCommands } from "./instructions/help.js";
import { handleTaiXiuCommand } from "../service-ngh/game-service/tai-xiu/tai-xiu.js";
import { handleXiDachCommand, handleXiDachPrivateAction } from "../service-ngh/game-service/xi-dach/xi-dach.js";
import { handleCardTableCommand } from "../service-ngh/game-service/card-tables/card-tables.js";
import { handleWerewolfCommand, handleWerewolfPrivateAction } from "../service-ngh/game-service/ma-soi/index.js";
import { handlePrefixCommand } from "./bot-manager/prefix.js";
import { getGlobalPrefix, reloadServiceConfig } from "../service-ngh/service.js";
import { handleNongTraiCommand } from "../service-ngh/game-service/nong-trai/nong-trai.js";
import { userBussinessCardCommand } from "../service-ngh/info-service/bussiness-card.js";
import { handleConvertStickerCommand } from "../service-ngh/chat-zalo/chat-special/send-sticker/convert-sticker.js";
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
  handleNghCommand,
} from "./bot-manager/utilities.js";
import { handleBauCua } from "../service-ngh/game-service/bau-cua/bau-cua.js";
import { handleKBBCommand } from "../service-ngh/game-service/keobuabao/keobuabao.js";
import { handleAntiBadWordCommand } from "../service-ngh/anti-service/anti-badword.js";
import { handleChanLe } from "../service-ngh/game-service/chan-le/chan-le.js";
import {
  handleGetVoiceCommand,
  handleSendVoiceCommand,
  handleStoryCommand,
  handleTarrotCommand,
  handleVoiceCommand,
} from "../service-ngh/chat-zalo/chat-special/send-voice/send-voice.js";
import { antiNude, handleAntiNudeCommand } from "../service-ngh/anti-service/anti-nude/anti-nude.js";
import { handleSettingGroupCommand } from "./bot-manager/group-manage.js";
import { handleVietlott655Command } from "../service-ngh/game-service/vietlott/vietlott655.js";
import { handleMiniGameCommand } from "../service-ngh/game-service/mini-game/index.js";
import { handleJoinGroup, handleLeaveGroup, handleShowGroupsList, handleLeaveLockedGroups, handleLeaveAllGroup } from "./bot-manager/remote-action-group.js";
import { removeMention } from "../utils/format-util.js";
import { handleWhiteList } from "../service-ngh/anti-service/white-list.js";
import { handleAntiUndoCommand } from "../service-ngh/anti-service/anti-undo.js";
import { handleBankInfoCommand, handleMyBankCommand } from "../service-ngh/info-service/bank-info.js";
import { sendReactionWaitingCountdown } from "./manager-command/check-countdown.js";
import { handleBaccaratBet } from "../service-ngh/game-service/baccarat/baccarat.js";
import { getPermissionCommandName, handleSetCommandActive, isCommandDisabledInGroup } from "./manager-command/set-command.js";
import { scanGroupsWithAction } from "./bot-manager/scan-group.js";
import { handleDeleteMessage } from "./bot-manager/recent-message.js";
import { handleCommandStatusPost } from "../utils/canvas/status-post.js";
import { handleCreateQRCommand } from "../service-ngh/utilities/qr-creater.js";
import { handleScanQRCommand } from "../service-ngh/utilities/qr-scan.js";
import { handleSpeedTestCommand } from "../service-ngh/utilities/speedtest.js";
import { handleSendLocalSticker } from "../service-ngh/chat-zalo/chat-special/send-sticker/customer-sticker.js";
import {
  handleDeleteResource,
  handleDownloadResource,
  handleShowResource,
} from "../service-ngh/utilities/download-resource.js";
import { handleStickerCommand } from "../service-ngh/chat-zalo/chat-special/send-sticker/main-sticker.js";
import { testFutureUser } from "../automations/ngh-test.js";
import { handleEditVoiceCommand } from "../service-ngh/chat-zalo/chat-special/send-voice/edit-voice.js";
import { handleEditVideoCommand } from "../service-ngh/chat-zalo/chat-special/send-video/edit-video.js";
import { spamCallVoice } from "../service-ngh/chat-zalo/chat-special/send-call-voice/call-voice.js";
import { handleChatBiThuatPhaNhom, handleChatSpamLink } from "../service-ngh/chat-zalo/chat-general/chat-hide.js";
import { groupSettingsAll } from "../automations/event-send-msg.js";
import { handleManagerBot } from "../manager-bot/index.js";
import { handleConfigPRCommand } from "../service-ngh/scheduler/pr-command.js";
import { handleAutoRaiLinkCommand } from "../service-ngh/scheduler/auto-rai-link.js";
import { gameTypeDoanSo } from "../service-ngh/game-service/mini-game/guessNumber.js";
import { gameTypeNoiTu } from "../service-ngh/game-service/mini-game/wordChain.js";
import { gameTypeVuaTiengViet } from "../service-ngh/game-service/mini-game/vuatiengviet.js";
import { handleAntiMediaCommand } from "../service-ngh/anti-service/anti-media-file.js";
import { handleTargetBot } from "../service-ngh/info-service/target-user.js";
import { handleGetCookieImeiByQR } from "../manager-bot/get-info-login.js";
import { handleConvertMediaFile } from "../service-ngh/utilities/convert-media.js";
import { handleSendFileCommand } from "../service-ngh/chat-zalo/chat-special/send-file/send-file.js";
import { handleSupportGameCommand } from "../service-ngh/chat-bot/additional-features/support-game.js";
import { handleAntiSendStickerEffectCommand } from "../service-ngh/anti-service/anti-sticker-effect.js";
import { handleNetTruyenCommand } from "../service-ngh/api-crawl/image-content/nettruyen.js";
import { handleCNovelTruyenChuCommand } from "../service-ngh/api-crawl/content/cnovel-truyen-chu.js";
import {
  handleDownloadSpotifyLink,
  handleMusicSpotifyCommand,
} from "../service-ngh/api-crawl/music-content/spotify/spotify.js";
import { askGeminiGenderVideo } from "../service-ngh/api-crawl/assistant-ai/gemini-veo.js";
import { gameTypeZaclWarrior } from "../service-ngh/game-service/mini-game/zacl-warrior/index.js";
import { handleTenorStickerCommand } from "../service-ngh/api-crawl/image-content/tenor.js";
import { handleSharpenerImageCommand } from "../service-ngh/api-crawl/image-content/lamnet.js";
import { handleTruyenHentaiCommand } from "../service-ngh/api-crawl/image-content/hentai.js";
import { handleCheckFileByVirusTotal } from "../service-ngh/api-crawl/content/virustotal.js";
import { gameTypeCaro } from "../service-ngh/game-service/mini-game/caro-game/index.js";
import { handleSendLunarCalendar } from "../service-ngh/api-crawl/image-content/lichamlich.js";
import { gameTypeAiLaTrieuPhu } from "../service-ngh/game-service/mini-game/ailatrieuphu/game-manager.js";
import { gameTypeCauCa } from "../service-ngh/game-service/mini-game/cauca/index.js";
import { handleBenchmarkCommand } from "../service-ngh/utilities/benchmark/index.js";
import { handleAntiFile } from "../service-ngh/anti-service/anti-file.js";
import { handleAutoReplyCommand } from "../service-ngh/api-crawl/assistant-ai/auto-reply-gemini.js";
import { handleGifTextCommand } from "../service-ngh/chat-zalo/chat-special/send-gif/send-gif.js";
import { handleVideoToGifCommand } from "../service-ngh/chat-zalo/chat-special/send-gif/gifvd.js";
import { handleSimValuationCommand } from "./send-all/dinhgiasim.js";
import { spamgroup } from "./spam/spamgroup.js";
import { spamjoin } from "./spam/spamjoin.js";
import { handleAntiAll } from "../service-ngh/anti-service/anti-all.js";
import { handleAntiPhoneNumber } from "../service-ngh/anti-service/anti-phone-number.js";
import { handleAntiAdsCommand } from "../service-ngh/anti-service/anti-ads.js";
import { handleCheckSimPhongThuyCommand } from "./send-all/phong-thuy-sim.js";
import { handleTruyenSexVLCommand } from "./send-all/truyensex.js";
import { searchImagePexels } from "../service-ngh/api-crawl/image-content/pexels-image.js";
import { handleLoveCommand } from "./send-all/lovelink.js";
import { handleQrcodeCommand, handleScanQrcodeCommand } from "./send-all/send-qrcode.js"
import { handleAntiTagCommand } from "../service-ngh/anti-service/anti-tag.js";
import { handleAntiBotCommand } from "../service-ngh/anti-service/anti-bot.js";
import { sendMessageToMentioned } from "./send-all/sendmsg-user.js";
import { handleAntiAllEffectGifCommand } from "../service-ngh/anti-service/anti-gif.js";
import { handleBlockUIDByCommand } from "../service-ngh/utilities/block-user-join.js";
import { handleAntiVoiceCommand } from "../service-ngh/anti-service/anti-voice.js";
import { handleAntiAllEffectStickerCommand } from "../service-ngh/anti-service/anti-sticker.js";
import { handleAntiPhotoVideo } from "../service-ngh/anti-service/anti-photo.js";
import { userBussinessCardQrCommand } from "../service-ngh/info-service/business-card-qr.js";
import { handleCheckquocgia } from "./send-all/quocgia.js";
import { handleInviteAllFriendsCommand } from "./send-all/invite-all-friends.js";
import { handleAddUserToGroupCommand } from "./bot-manager/add-user-to-group.js";
import { handleGiveawayCommand } from "../service-ngh/game-service/giveaway/giveaway.js";
import { handleHungCommand } from "./send-all/hung.js";
import { handleAttackCommand } from "./bot-manager/attack.js";
import { handleAutoReplyPMCommand } from "./bot-manager/welcome-bye.js";
import { handleI4tiktokCommand } from "../service-ngh/info-service/i4tiktok.js";
import { handleTagReactionCommand } from "./bot-manager/tag-reaction.js";
import { handleClockCommand } from "../service-ngh/chat-zalo/chat-special/send-gif/gif-clock.js";
import { matchmakingCommand } from "../service-ngh/info-service/matchmaking.js";
import { handleCreateAutoReplyCommand, 
  handleDeleteAutoReplyCommand, 
  handleGetAutoReplyListCommand, 
  handleCreateReminderCommand, 
  handleDeleteChatCommand 
} from "./bot-manager/summary.js";
import { handleCheckGiaVangCommand } from "./send-all/check-gia-vang.js";
import { handleCheckGiaXangCommand } from "./send-all/check-gia-xang.js";
import { handleTrolGayLessCommand } from "./send-all/checkgayless.js";
import { handleAntiInvite } from "../service-ngh/anti-service/anti-invite.js";
import { handleHeartReactionDeleteCommand } from "../automations/reaction-delete.js";
import { resolveReactionInput } from "../api-zalo/models/Reaction.js";
import { handleEventSendMessage } from "./bot-manager/event-sendmsg.js";
import { canUseBarePrefix } from "../utils/bare-prefix-cooldown.js";
import { getCommandCooldownSeconds } from "../utils/command-cooldown.js";
import { checkUserSpamGuard, isUserSilenced } from "../utils/user-antispam.js";

const lastCommandUsage = {};
const COMMAND_USAGE_RETENTION_MS = 24 * 60 * 60 * 1000;
let cachedCommandList = null;
let cachedCommandLookup = new Map();

// Tránh quét toàn bộ danh sách command cho mỗi lần kiểm tra cooldown, quyền,
// alias và dispatch. Cache tự dựng lại khi mảng cấu hình được reload/thay thế.
function getCommandLookup() {
  const commands = getCommandConfig().commands || [];
  if (commands === cachedCommandList) return cachedCommandLookup;

  const lookup = new Map();
  for (const command of commands) {
    lookup.set(command.name, command);
    for (const alias of command.alias || []) lookup.set(alias, command);
  }
  cachedCommandList = commands;
  cachedCommandLookup = lookup;
  return lookup;
}

export function cleanupLastCommandUsage(now = Date.now()) {
  for (const [userId, usages] of Object.entries(lastCommandUsage)) {
    for (const [commandName, timestamp] of Object.entries(usages || {})) {
      if (!Number.isFinite(timestamp) || now - timestamp > COMMAND_USAGE_RETENTION_MS) {
        delete usages[commandName];
      }
    }
    if (Object.keys(usages || {}).length === 0) delete lastCommandUsage[userId];
  }
}

const commandUsageCleanupTimer = setInterval(cleanupLastCommandUsage, 60 * 60 * 1000);
commandUsageCleanupTimer.unref?.();

function getCommandPayload(message, prefix, aliasCommand) {
  const content = typeof message.data?.content === "string" ? message.data.content : "";
  const commandText = `${prefix}${aliasCommand}`;
  return content.toLowerCase().startsWith(commandText.toLowerCase())
    ? content.slice(commandText.length).trim()
    : "";
}

function createRoutedCommandMessage(message, content) {
  const originalContent = typeof message.data?.content === "string" ? message.data.content : "";
  const mentions = (message.data?.mentions || []).map((mention) => {
    const mentionText = originalContent.substring(mention.pos, mention.pos + mention.len);
    const nextPos = content.indexOf(mentionText);
    return { ...mention, pos: nextPos >= 0 ? nextPos : mention.pos };
  });

  return {
    ...message,
    data: {
      ...message.data,
      content,
      __originalContent: originalContent,
      mentions,
    },
  };
}

const COMPACT_COMMAND_FAMILIES = {
  media: { image: "sendimage", video: "sendvideo", voice: "sendvoice", gif: "sendgif", file: "sendfile" },
  edit: { voice: "editvoice", video: "editvideo" },
  sticker: { create: "sticker", zalo: "stickerzalo", tenor: "tenorsticker", local: "stickerlocal" },
  qr: { create: "createqr", scan: "scanqr", bank: "qrbank" },
  check: { virus: "checkvirus", domain: "checkdomain", ip: "checkip", order: "checkorder" },
  video: { boy: "vdboy", girl: "vdgirl", anime: "vdanime", cosplay: "vdcos", sexy: "vdsexy", vuto: "vdvuto" },
  music: { soundcloud: "soundcloud", mixcloud: "mixcloud", zing: "zingmp3", nct: "nhaccuatui", spotify: "spotify" },
  story: { text: "truyenchu", comic: "truyentranh", adult: "truyenhentai", funny: "truyencuoi" },
  poll: { create: "createpoll", spam: "spampoll" },
  member: { kick: "kick", kickall: "kickall", block: "block", ban: "ban" },
  group: { member: "datamembergroup", list: "listgroups", scan: "scangroups", create: "creategroup", disperse: "dispersegroup" },
  game: { "reset-daily": "resetdaily", "reset-user": "resethu" },
};

function rewriteCompactCommand(content, prefix) {
  if (typeof content !== "string" || !content.startsWith(prefix)) return null;
  const body = content.slice(prefix.length).trim();
  const [family = "", action = "", ...rest] = body.split(/\s+/);
  const target = COMPACT_COMMAND_FAMILIES[family.toLowerCase()]?.[action.toLowerCase()];
  if (!target) return null;
  return `${prefix}${target}${rest.length ? ` ${rest.join(" ")}` : ""}`;
}

async function handleInfoCommandFamily(api, message, aliasCommand) {
  const prefix = getGlobalPrefix(api.getBotId());
  const payload = getCommandPayload(message, prefix, aliasCommand);
  const [flag = "", ...restParts] = payload.split(/\s+/);
  const rest = restParts.join(" ").trim();
  const route = (name) => createRoutedCommandMessage(
    message,
    `${prefix}${name}${rest ? ` ${rest}` : ""}`
  );

  if (["image", "img", "-i"].includes(flag)) {
    return handleI4ImageCommand(api, route("i4image"), "i4image");
  }
  if (flag === "-c") return userBussinessCardCommand(api, route("card"), "card");
  if (flag === "-q") return userBussinessCardQrCommand(api, route("qrcard"), "qrcard");
  return userInfoCommand(api, message, aliasCommand);
}

async function handleLeaveCommandFamily(api, message, groupSettings, aliasCommand) {
  const prefix = getGlobalPrefix(api.getBotId());
  const flag = getCommandPayload(message, prefix, aliasCommand).split(/\s+/)[0]?.toLowerCase();
  if (flag === "-a") return handleLeaveAllGroup(api, message);
  if (flag === "-l") return handleLeaveLockedGroups(api, message);
  return handleLeaveGroup(api, message, groupSettings);
}

const antiCommandAliases = {
  anti: "antiall",
  antiall: "antiall",
  all: "antiall",
  antibadword: "antibadword",
  badword: "antibadword",
  atbw: "antibadword",
  antimedia: "antimedia",
  media: "antimedia",
  atmda: "antimedia",
  antifile: "antifile",
  file: "antifile",
  antiforward: "antiforward",
  forward: "antiforward",
  antichuyentiep: "antiforward",
  antiinvite: "antiinvite",
  invite: "antiinvite",
  antimoi: "antiinvite",
  antibot: "antibot",
  bot: "antibot",
  antilink: "antilink",
  link: "antilink",
  atl: "antilink",
  antigif: "antigif",
  gif: "antigif",
  antispam: "antispam",
  spam: "antispam",
  antinude: "antinude",
  nude: "antinude",
  antiundo: "antiundo",
  undo: "antiundo",
  antistickereffect: "antistickereffect",
  stickereffect: "antistickereffect",
  antistickerlag: "antistickereffect",
  antistklag: "antistickereffect",
  onlytext: "onlytext",
  text: "onlytext",
  antivoice: "antivoice",
  voice: "antivoice",
  antitag: "antitag",
  tag: "antitag",
  antiphonenumber: "antiphonenumber",
  phonenumber: "antiphonenumber",
  phone: "antiphonenumber",
  antisdt: "antiphonenumber",
  antisticker: "antisticker",
  sticker: "antisticker",
  antistk: "antisticker",
  antiphoto: "antiphoto",
  photo: "antiphoto",
  antiads: "antiads",
  ads: "antiads",
};

async function handleBotStyleSubcommand(api, message, commandParts, prefix) {
  if (commandParts[1]?.toLowerCase() !== "style") return false;

  const currentBotId = api.getBotId();
  const requestedStyle = commandParts[2]?.toLowerCase();
  if (!requestedStyle) {
    await sendMessageCompleteRequest(api, message, {
      caption: `Style bot ${currentBotId}: ${getBotStyle(currentBotId).toUpperCase()}\nV2 là style mặc định duy nhất.`,
    }, 15000);
    return true;
  }
  if (!(await setBotStyle(currentBotId, requestedStyle))) {
    await sendMessageFailed(api, message, `Style V1 đã được xoá. Dùng: ${prefix}bot style v2.`, false, 15000);
    return true;
  }
  await sendMessageCompleteRequest(api, message, {
    caption: `Đã lưu style ${requestedStyle.toUpperCase()} riêng cho bot ${currentBotId}.`,
  }, 15000);
  return true;
}

async function handleBotLanguageSubcommand(api, message, commandParts, prefix) {
  const subcommand = commandParts[1]?.toLowerCase();
  if (subcommand !== "language" && subcommand !== "lang") return false;

  const botId = api.getBotId();
  const requestedLanguage = commandParts.slice(2).join(" ");
  if (!requestedLanguage) {
    const current = getBotLanguage(botId);
    await sendMessageCompleteRequest(api, message, {
      caption: botText(botId, {
        vi: `Ngôn ngữ bot ${botId}: ${getBotLanguageName(current)} (${current})\nDùng: ${prefix}bot lang <vi|en>`,
        en: `Bot ${botId} language: ${getBotLanguageName(current)} (${current})\nUsage: ${prefix}bot lang <vi|en>`,
      }),
    }, 15000);
    return true;
  }

  if (!(await setBotLanguage(botId, requestedLanguage))) {
    await sendMessageFailed(api, message, botText(botId, {
      vi: `Ngôn ngữ không hợp lệ. Hiện hỗ trợ: vi, en.\nDùng: ${prefix}bot lang <vi|en>`,
      en: `Invalid language. Supported languages: vi, en.\nUsage: ${prefix}bot lang <vi|en>`,
    }), false, 15000);
    return true;
  }

  await sendMessageCompleteRequest(api, message, {
    caption: botText(botId, {
      vi: `Đã đổi ngôn ngữ riêng của bot ${botId} sang Tiếng Việt.`,
      en: `Bot ${botId} language has been changed to English.`,
    }),
  }, 15000);
  return true;
}

async function handleBotSubcommand(api, message, commandParts, prefix) {
  if (await handleBotStyleSubcommand(api, message, commandParts, prefix)) return true;
  return await handleBotLanguageSubcommand(api, message, commandParts, prefix);
}

async function handleAntiCommandFamily(api, message, aliasCommand, groupSettings) {
  const prefix = getGlobalPrefix(api.getBotId());
  let payload = getCommandPayload(message, prefix, aliasCommand);
  let antiCommand = antiCommandAliases[String(aliasCommand).toLowerCase()];

  if (String(aliasCommand).toLowerCase() === "anti") {
    const [feature = "", ...rest] = payload.split(/\s+/).filter(Boolean);
    antiCommand = antiCommandAliases[feature.toLowerCase()];
    payload = rest.join(" ");
  }

  if (!antiCommand) {
    await sendMessageFailed(
      api,
      message,
      `Dùng: ${prefix}anti <all|badword|media|file|forward|invite|bot|link|gif|spam|nude|undo|stickereffect|text|voice|tag|phone|sticker|photo> <on|off>`,
      false
    );
    return false;
  }

  const routedMessage = createRoutedCommandMessage(
    message,
    `${prefix}${antiCommand}${payload ? ` ${payload}` : ""}`
  );

  switch (antiCommand) {
    case "antiall": return await handleAntiAll(api, routedMessage, groupSettings);
    case "antibadword": return await handleAntiBadWordCommand(api, routedMessage, groupSettings);
    case "antimedia": return await handleAntiMediaCommand(api, routedMessage, antiCommand, groupSettings);
    case "antifile": return await handleAntiFile(api, routedMessage, groupSettings);
    case "antiforward": return await handleAntiForwardCommand(api, routedMessage, groupSettings);
    case "antiinvite": return await handleAntiInvite(api, routedMessage);
    case "antibot": return await handleAntiBotCommand(api, routedMessage, groupSettings);
    case "antilink": return await handleAntiLinkCommand(api, routedMessage, groupSettings);
    case "antigif": return await handleAntiAllEffectGifCommand(api, routedMessage, groupSettings);
    case "antispam": return await handleAntiSpamCommand(api, routedMessage, groupSettings);
    case "antinude": return await handleAntiNudeCommand(api, routedMessage, groupSettings);
    case "antiundo": return await handleAntiUndoCommand(api, routedMessage, groupSettings);
    case "antistickereffect": return await handleAntiSendStickerEffectCommand(api, routedMessage, antiCommand, groupSettings);
    case "onlytext": return await handleOnlyText(api, routedMessage, groupSettings);
    case "antivoice": return await handleAntiVoiceCommand(api, routedMessage, groupSettings);
    case "antitag": return await handleAntiTagCommand(api, routedMessage, groupSettings);
    case "antiphonenumber": return await handleAntiPhoneNumber(api, routedMessage, groupSettings);
    case "antisticker": return await handleAntiAllEffectStickerCommand(api, routedMessage, groupSettings);
    case "antiphoto": return await handleAntiPhotoVideo(api, routedMessage, groupSettings, antiCommand);
    case "antiads": return await handleAntiAdsCommand(api, routedMessage, groupSettings);
    default: return false;
  }
}

async function handleBlockBotFamily(api, message, aliasCommand, groupSettings) {
  const prefix = getGlobalPrefix(api.getBotId());
  const alias = String(aliasCommand).toLowerCase();
  let payload = getCommandPayload(message, prefix, aliasCommand);
  let action = alias === "unblockbot" ? "remove" : alias === "listblockbot" ? "list" : "add";

  if (alias === "blockbot") {
    const [possibleAction = "", ...rest] = payload.split(/\s+/).filter(Boolean);
    if (possibleAction.toLowerCase() === "all") {
      // blockbot all @someone / blockbot all <uid> → block toàn hệ thống
      return await handleBlockBotAll(api, message, groupSettings);
    } else if (["add", "block"].includes(possibleAction.toLowerCase())) {
      action = "add";
      payload = rest.join(" ");
    } else if (["remove", "unblock", "del"].includes(possibleAction.toLowerCase())) {
      action = "remove";
      payload = rest.join(" ");
    } else if (["list", "show"].includes(possibleAction.toLowerCase())) {
      action = "list";
      payload = rest.join(" ");
    }
  }

  // unblockbot all @someone / unblockbot all <uid> → unblock toàn hệ thống
  // (unblockbot all không có target → giữ hành vi cũ: gỡ hết trên bot hiện tại)
  if (alias === "unblockbot") {
    const words = payload.split(/\s+/).filter(Boolean);
    if (words[0]?.toLowerCase() === "all") {
      const hasMentions = message.data?.mentions && message.data.mentions.length > 0;
      const hasUidAfterAll = words.length > 1 && /^\d+$/.test(words[1]);
      if (hasMentions || hasUidAfterAll) {
        return await handleUnblockBotAll(api, message, groupSettings);
      }
    }
  }

  if (action === "list") return await handleListBlockBot(api, message);
  if (action === "remove") {
    const routedMessage = createRoutedCommandMessage(
      message,
      `${prefix}unblockbot${payload ? ` ${payload}` : ""}`
    );
    return await handleUnblockBot(api, routedMessage, groupSettings);
  }
  return await handleBlockBot(api, message, groupSettings);
}

async function handleResourceFamily(api, message, aliasCommand) {
  const prefix = getGlobalPrefix(api.getBotId());
  const alias = String(aliasCommand).toLowerCase();
  let payload = getCommandPayload(message, prefix, aliasCommand);
  let action = alias.includes("delete") || alias === "delrsrc"
    ? "delete"
    : alias.includes("show")
      ? "show"
      : alias === "resource"
        ? ""
        : "download";

  if (alias === "resource") {
    const [possibleAction = "", ...rest] = payload.split(/\s+/).filter(Boolean);
    const normalizedAction = possibleAction.toLowerCase();
    action = ["download", "dl", "add"].includes(normalizedAction)
      ? "download"
      : ["delete", "del", "remove"].includes(normalizedAction)
        ? "delete"
        : ["show", "list"].includes(normalizedAction)
          ? "show"
          : "";
    payload = rest.join(" ");
  }

  if (!action) {
    await sendMessageFailed(api, message, `Dùng: ${prefix}resource <download|delete|show> ...`, false);
    return;
  }

  const commandName = action === "download" ? "downloadresource" : action === "delete" ? "deleteresource" : "showresource";
  const routedMessage = createRoutedCommandMessage(
    message,
    `${prefix}${commandName}${payload ? ` ${payload}` : ""}`
  );
  if (action === "download") return await handleDownloadResource(api, routedMessage, commandName);
  if (action === "delete") return await handleDeleteResource(api, routedMessage, commandName);
  return await handleShowResource(api, routedMessage, commandName);
}

async function handleZaloAutoReplyFamily(api, message, aliasCommand) {
  const prefix = getGlobalPrefix(api.getBotId());
  const alias = String(aliasCommand).toLowerCase();
  let payload = getCommandPayload(message, prefix, aliasCommand);
  let action = alias === "setautoreply" ? "set" : alias === "delautoreply" ? "delete" : alias === "listautoreply" ? "list" : "";

  if (alias === "zautoreply") {
    const [possibleAction = "", ...rest] = payload.split(/\s+/).filter(Boolean);
    const normalizedAction = possibleAction.toLowerCase();
    action = ["set", "add", "create"].includes(normalizedAction)
      ? "set"
      : ["delete", "del", "remove"].includes(normalizedAction)
        ? "delete"
        : ["list", "show"].includes(normalizedAction)
          ? "list"
          : "";
    payload = rest.join(" ");
  }

  if (!action) {
    await sendMessageFailed(api, message, `Dùng: ${prefix}zautoreply <set|delete|list> ...`, false);
    return;
  }

  const commandName = action === "set" ? "setautoreply" : action === "delete" ? "delautoreply" : "listautoreply";
  const routedMessage = createRoutedCommandMessage(
    message,
    `${prefix}${commandName}${payload ? ` ${payload}` : ""}`
  );
  if (action === "set") return await handleCreateAutoReplyCommand(api, routedMessage, commandName);
  if (action === "delete") return await handleDeleteAutoReplyCommand(api, routedMessage, commandName);
  return await handleGetAutoReplyListCommand(api, routedMessage, commandName);
}

async function handleMuteCommandFamily(api, message, aliasCommand, groupSettings, groupAdmins) {
  const prefix = getGlobalPrefix(api.getBotId());
  const alias = String(aliasCommand).toLowerCase();
  let payload = getCommandPayload(message, prefix, aliasCommand);
  let action = alias === "unmute" || alias === "nói" ? "remove" : alias === "listmute" ? "list" : "add";

  if (alias === "mute") {
    const [possibleAction = "", ...rest] = payload.split(/\s+/).filter(Boolean);
    const normalizedAction = possibleAction.toLowerCase();
    if (["add", "on"].includes(normalizedAction)) {
      action = "add";
      payload = rest.join(" ");
    } else if (["remove", "unmute", "off", "del"].includes(normalizedAction)) {
      action = "remove";
      payload = rest.join(" ");
    } else if (["list", "show"].includes(normalizedAction)) {
      action = "list";
      payload = rest.join(" ");
    }
  }

  if (action === "list") return await handleMuteList(api, message, groupSettings);
  const commandName = action === "remove" ? "unmute" : "mute";
  const routedMessage = createRoutedCommandMessage(
    message,
    `${prefix}${commandName}${payload ? ` ${payload}` : ""}`
  );
  if (action === "remove") return await handleUnmuteUser(api, routedMessage, groupSettings);
  return await handleMuteUser(api, routedMessage, groupSettings, groupAdmins);
}

async function handleBanCommandFamily(api, message, aliasCommand, groupSettings) {
  const prefix = getGlobalPrefix(api.getBotId());
  const alias = String(aliasCommand).toLowerCase();
  let payload = getCommandPayload(message, prefix, aliasCommand);
  let action = alias === "unban" ? "remove" : "add";

  if (alias === "ban") {
    const [possibleAction = "", ...rest] = payload.split(/\s+/).filter(Boolean);
    const normalizedAction = possibleAction.toLowerCase();
    if (["add", "lock"].includes(normalizedAction)) {
      action = "add";
      payload = rest.join(" ");
    } else if (["remove", "unban", "unlock", "del"].includes(normalizedAction)) {
      action = "remove";
      payload = rest.join(" ");
    }
  }

  const commandName = action === "remove" ? "unban" : "ban";
  const routedMessage = createRoutedCommandMessage(
    message,
    `${prefix}${commandName}${payload ? ` ${payload}` : ""}`
  );
  if (action === "remove") return await handleUnbanCommand(api, routedMessage, groupSettings);
  return await handleBanCommand(api, routedMessage, groupSettings);
}

async function handleWelcomeCommandFamily(api, message, aliasCommand, groupSettings) {
  const prefix = getGlobalPrefix(api.getBotId());
  const alias = String(aliasCommand).toLowerCase();
  let payload = getCommandPayload(message, prefix, aliasCommand);
  let action = alias === "bye" ? "bye" : "welcome";

  if (alias === "welcome") {
    const [possibleAction = "", ...rest] = payload.split(/\s+/).filter(Boolean);
    if (["welcome", "bye"].includes(possibleAction.toLowerCase())) {
      action = possibleAction.toLowerCase();
      payload = rest.join(" ");
    }
  }

  const routedMessage = createRoutedCommandMessage(
    message,
    `${prefix}${action}${payload ? ` ${payload}` : ""}`
  );
  return await handleWelcomeBye(api, routedMessage, groupSettings);
}

async function handleLearnCommandFamily(api, message, aliasCommand, groupSettings) {
  const prefix = getGlobalPrefix(api.getBotId());
  const alias = String(aliasCommand).toLowerCase();
  let payload = getCommandPayload(message, prefix, aliasCommand);
  let commandName = alias;

  if (alias === "learn") {
    const normalizedPayload = payload.toLowerCase();
    if (normalizedPayload === "list" || normalizedPayload === "show") {
      commandName = "learnlist";
      payload = "";
    } else if (/^(delete|remove|unlearn)(\s+|$)/i.test(payload)) {
      commandName = "unlearn";
      payload = payload.replace(/^(delete|remove|unlearn)\s*/i, "");
    } else if (/^now(_|\s+|$)/i.test(payload)) {
      commandName = "learnnow";
      payload = payload.replace(/^now\s*/i, "");
      if (payload && !payload.startsWith("_")) payload = `_${payload}`;
    }
  }

  const routedContent = commandName === "learnnow"
    ? `${prefix}${commandName}${payload ? (payload.startsWith("_") ? payload : `_${payload}`) : ""}`
    : `${prefix}${commandName}${payload ? ` ${payload}` : ""}`;
  const routedMessage = createRoutedCommandMessage(
    message,
    routedContent
  );
  return await handleLearnCommand(api, routedMessage, groupSettings);
}

async function handleAdminBotCommandFamily(
  api,
  message,
  aliasCommand,
  groupAdmins,
  groupSettings,
  isAdminLevelHighest
) {
  const prefix = getGlobalPrefix(api.getBotId());
  const alias = String(aliasCommand).toLowerCase();
  let payload = getCommandPayload(message, prefix, aliasCommand);
  let action = alias === "listadmin" || alias === "ladm" ? "list" : alias;

  if (alias === "adminbot") {
    const [possibleAction = "", ...rest] = payload.split(/\s+/).filter(Boolean);
    action = possibleAction.toLowerCase();
    payload = rest.join(" ");
  }

  if (["list", "show"].includes(action)) return await handleListAdmin(api, message, groupSettings);
  if (!["add", "remove"].includes(action)) {
    await sendMessageFailed(api, message, `Dùng: ${prefix}adminbot <add|remove|list> [@người_tag]`, false);
    return false;
  }

  const routedMessage = createRoutedCommandMessage(
    message,
    `${prefix}${action}${payload ? ` ${payload}` : ""}`
  );
  return await handleAdminHighLevelCommands(
    api,
    routedMessage,
    groupAdmins,
    groupSettings,
    isAdminLevelHighest
  );
}
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
      // Các handler game cũ dùng chính message này để quote. Giữ lại message
      // nguyên bản để reply `!game daily` không bị quote thành `!daily`.
      __originalQuoteMessage: message,
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

// Các lệnh này chỉ hợp lệ dưới dạng "<prefix>game <lệnh>". Nếu người dùng
// gõ trực tiếp (vd. "!daily"), bỏ qua hoàn toàn để không thả reaction/icon.
const GAME_COMMANDS_REQUIRING_PREFIX = new Set([
  "daily",
  "nap",
  "rut",
  "bank",
  "tier",
  "rank",
  "mycard",
]);

function isBareGameCommand(command) {
  return GAME_COMMANDS_REQUIRING_PREFIX.has(String(command || "").toLowerCase());
}

async function handleCoreGameCommand(api, message, command, groupSettings, aliasCommand = command) {
  switch (command) {
    case "minigame":
    case "biggame":
      // Hai mục này là nhóm lệnh trong menu; hiển thị danh sách lệnh thực tế
      // thay vì rơi vào default rồi không phản hồi.
      await gameInfoCommand(api, message, groupSettings);
      return true;
    case "nap":
      await handleNapCommand(api, message, groupSettings);
      return true;
    case "rut":
      await handleRutCommand(api, message, groupSettings);
      return true;
    case "bank":
      await handleBankCommand(api, message, groupSettings);
      return true;
    case "saoke":
      await handleStatementCommand(api, message, groupSettings);
      return true;
    case "donenat":
      await handleDonateRankCommand(api, message, groupSettings);
      return true;
    case "donate":
      await handleDonateCommand(api, message, groupSettings);
      return true;
    case "tier":
      await handleGameTierCommand(api, message, groupSettings);
      return true;
    case "mycard":
      await handleMyCard(api, message, groupSettings);
      return true;
    case "testmycard":
      await handleTestMyCard(api, message, groupSettings);
      return true;
    case "daily":
      await handleClaimDailyReward(api, message, groupSettings);
      return true;
    case "giveaway":
      await handleGiveawayCommand(api, message);
      return true;
    case "resetdaily":
      await handleResetDailyCommand(api, message);
      return true;
    case "resethu":
      await handleResetJackpotCommand(api, message);
      return true;
    case "resetgame":
      await handleResetAllGameDataCommand(api, message);
      return true;
    case "rank":
      await handleTopPlayers(api, message, groupSettings);
      return true;
    case "baucua":
      await handleBauCua(api, message, groupSettings);
      return true;
    case "taixiu":
      await handleTaiXiuCommand(api, message, groupSettings);
      return true;
    case "bcr":
      await handleBaccaratBet(api, message, groupSettings);
      return true;
    case "xidach":
      await handleXiDachCommand(api, message, groupSettings);
      return true;
    case "baicao":
    case "tienlen":
      await handleCardTableCommand(api, message, groupSettings, command);
      return true;
    case "chanle":
      await handleChanLe(api, message, groupSettings);
      return true;
    case "keobuabao":
      await handleKBBCommand(api, message, groupSettings);
      return true;
    case "nongtrai":
      await handleNongTraiCommand(api, message, groupSettings);
      return true;
    case "tutien":
      await handleTuTienCommand(api, message);
      return true;
    case "vietlott655":
      await handleVietlott655Command(api, message, groupSettings, aliasCommand);
      return true;
    default:
      return false;
  }
}

export const permissionLevels = {
  all: 0,
  adminBox: 1,
  adminBot: 2,
  adminLevelHigh: 3,
};

export function getCommand(botId, command) {
  const commandConfigFinal = getCommandConfig().commands || [];
  let cmdFind = getCommandLookup().get(command);
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

function isMainBotAccount(api, userId) {
  if (userId == null) return false;

  const botId = api.getBotId();
  const mainBotId = api.apiManager?.isMainBot ? botId : api.apiManager?.idBotMainWithBot;
  return mainBotId != null && String(userId) === String(mainBotId);
}

async function checkPermission(api, message, commandName, userPermissionLevel, isNotify = true) {
  const botId = api.getBotId();
  const command = getCommand(botId, commandName);

  if (!command) return true;

  const customerCommand = getManagerCommandCustomConfig(botId, command.name);

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
  // inviteall co the can chay lien tiep tren nhieu group. Tach cooldown theo
  // thread de mot lan chay o group A khong khoa group B den khi restart bot.
  const threadId = message?.threadId ?? message?.threadID ?? message?.thread_id;
  const usageOwner = command.name === "inviteall" && threadId != null
    ? `${userId}:${threadId}`
    : userId;
  const lastUsage = commandUsage[usageOwner]?.[command.name] || 0;
  const customerCommand = getManagerCommandCustomConfig(botId, command.name);
  const countdown = getCommandCooldownSeconds(command, customerCommand) * 1000;

  if (currentTime - lastUsage < countdown) {
    const remainingTime = Math.ceil((countdown - (currentTime - lastUsage)) / 1000);
    await sendReactionWaitingCountdown(api, message, remainingTime, commandName, fnAfterCountdown);
    return false;
  }

  if (!commandUsage[usageOwner]) commandUsage[usageOwner] = {};
  commandUsage[usageOwner][command.name] = currentTime;

  return true;
}

export function sendReactionConfirmReceive(api, message, numHandleCommand) {
  if (Number.isFinite(numHandleCommand) && numHandleCommand > 0 && numHandleCommand !== 99) {
    const managerData = api.apiManager?.getDataManager?.();
    const fallbackReaction = "SMILE";
    const configured = managerData?.chatIcon || fallbackReaction;
    const reaction = resolveReactionInput(configured) || fallbackReaction;
    // Reaction chỉ là hiệu ứng phụ. Không chặn command bằng một round-trip Zalo
    // vì request này có thể đứng sau upload/PR và làm phản hồi trễ vài giây.
    void api.addReaction(reaction, message).catch(async (error) => {
      console.warn(`[reaction] Icon ${String(configured)} thất bại: ${error?.message || error}`);
      if (reaction === fallbackReaction) return;
      try {
        await api.addReaction(fallbackReaction, message);
      } catch (fallbackError) {
        console.warn(`[reaction] Icon mặc định :d (${fallbackReaction}) cũng thất bại: ${fallbackError?.message || fallbackError}`);
      }
    });
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
    welcomeMessage: "",
    byeGroup: false,
    leaveMessage: "",
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
    antiAds: false,
    antiBot: false,
    antigif: false,
    antiforward: false,
    antiFile: false,
    lockChatSchedule: null
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
  let content = removeMention(message);
  const botId = api.getBotId();
  const prefix = getGlobalPrefix(botId);
  const managerBot = api.apiManager.getDataManager();

  if (isUserBlocked(botId, senderId)) return -1;

  // Ma Sói dùng toàn bộ thao tác bí mật và mã vào phòng qua tin nhắn riêng, không cần prefix.
  if (await handleWerewolfPrivateAction(api, message)) return 0;

  // Xì Dách: cho phép người chơi gõ "rút"/"dằn" (không cần prefix) khi đang tới lượt trong ván.
  if (await handleXiDachPrivateAction(api, message)) return 0;

  if (typeof content === "string") {
    let command;
    let commandParts;

    if (content.trim().startsWith(`${prefix} `)) return 1;

    if (prefix && content.trim() === prefix && !canUseBarePrefix(botId, senderId)) return 1;


    if (content.startsWith(`${prefix}prefix`) || content.startsWith(`prefix`)) {
      // Cho phép xem prefix trong tin riêng kể cả khi bot tắt chat riêng;
      // handlePrefixCommand vẫn tự chặn thao tác đổi prefix nếu không có quyền.
      return await handlePrefixCommand(api, message, threadId, isAdminLevelHighest);
    }

    if (!content.startsWith(prefix)) return 1;

    const compactContent = rewriteCompactCommand(content, prefix);
    if (compactContent) {
      message = createRoutedCommandMessage(message, compactContent);
      content = compactContent;
    }

    const isExempt = isAdminLevelHighest || isBotLeader(botId, senderId);
    if (!checkUserSpamGuard(senderId, isExempt)) {
      return 0;
    }

    if (checkSpecialCommand(content, prefix)) {
      commandParts = content.split("_");
      command = commandParts[0].slice(prefix.length);
    } else {
      commandParts = content.slice(prefix.length).trim().split(/\s+/);
      command = commandParts[0];
    }
    let commandLowerCase = command.toLowerCase();
    if (isBareGameCommand(commandLowerCase)) return 1;
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
    const activeCommand = commandInfo ? commandInfo.active !== false : true;
    // setcmd off là khóa tuyệt đối với mọi người, kể cả admin cấp cao.
    // Chỉ chính tài khoản mainbot được phép gọi lệnh đã tắt.
    const canBypassDisabledCommand = isMainBotAccount(api, senderId);
    if (aliasCommand !== "" && !activeCommand && !canBypassDisabledCommand) return numHandleCommand;

    const managerCommand = getManagerCommandConfig(botId);
    if (!canBotUseMainBotCommand(api, command, senderId)) return numHandleCommand;
    if (
      managerCommand.notAllowedCommand.includes("all") ||
      managerCommand.notAllowedCommand.includes(command)
    ) return numHandleCommand;

    await sendReactionConfirmReceive(api, message, numHandleCommand);
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
          case "datamembergroup":
            await handleDataMemberGroupCommand(api, message);
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
            await handleInfoCommandFamily(api, message, aliasCommand);
            return 0;
          case "i4image":
            await handleI4ImageCommand(api, message, aliasCommand);
            return 0;
          case "bantho":
            await handleBanThoCommand(api, message);
            return 0;
          case "thuebot":
            await handleThueBotCommand(api, message, groupSettings);
            return 0;
          case "uid":
            await handleUidCommand(api, message);
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
            await helpCommand(api, message, false, commandParts[1]);
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
          case "addusertogroup":
            await handleAddUserToGroupCommand(api, message, aliasCommand);
            return 0;
          case "gemini":
            await askGeminiCommand(api, message, aliasCommand);
            return 0;
          case "nova":
            await askNovaCommand(api, message, aliasCommand);
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
          case "ptg":
            await handlePTGCommand(api, message, aliasCommand, commandParts.slice(1));
            return 0;
          case "myacc":
            await handleUpdateProfile(api, message, aliasCommand);
            return 0;           
          case "social":
            await handleHungCommand(api, message, aliasCommand);
            return 0;
          case "soc":
            await handleHungCommand(api, message, aliasCommand);
            return 0;
          case "senduser":
            await sendMessageToMentioned(api, message, aliasCommand);
            return 0;
          case "quocgia":
            await handleCheckquocgia(api, message, aliasCommand);
            return 0;
          case "check":
            await handleTrolGayLessCommand(api, message);
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
          case "tvpl":
            await handleTvplCommand(api, message, aliasCommand);
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
          case "shopee":
            await handleShopeeCommand(api, message, aliasCommand);
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
          case "football":
            await handleFootballCommand(api, message, aliasCommand);
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
          case "giaxang":
            await handleCheckGiaXangCommand(api, message);
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
            await handleSendFileCommand(api, message, aliasCommand, isAdminLevelHighest);
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
          if (await handleBotSubcommand(api, message, commandParts, prefix)) return 0;
          await handleActiveBotUser(api, message, aliasCommand, undefined, isAdminLevelHighest);
          return 0;
        case "adminbot":
          await handleAdminBotCommandFamily(
            api,
            message,
            aliasCommand,
            [],
            groupSettings,
            isAdminLevelHighest
          );
          return 0;
        case "settier":
        await handleSetTierCommand(api, message, groupSettings);
        break;

      case "settier":
        await handleSetTierCommand(api, message, groupSettings);
        break;

      case "buff":
          await handleBuffCommand(api, message);
          break;
        case "settier":
          await handleSetTierCommand(api, message);
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
          await handleBlockBotFamily(api, message, aliasCommand);
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
        case "resource":
          await handleResourceFamily(api, message, aliasCommand);
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
        case "setmute":
          await handleSetMuteAll(api, message, aliasCommand);
          return 0;
        case "gim":
          await handlePinConversation(api, message, aliasCommand);
          return 0;
        case "anbox":
          await handleHiddenConversation(api, message, aliasCommand);
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
        case "zautoreply":
          await handleZaloAutoReplyFamily(api, message, aliasCommand);
          return 0;
        case "reminder": 
          await handleCreateReminderCommand(api, message, aliasCommand);
          return 0;
        case "deletechat":
          await handleDeleteChatCommand(api, message, aliasCommand);
          return 0;
        case "attack":
          await handleAttackCommand(api, message);
          return 0;
      }
    }

    if (numHandleCommand === 5) {
      if (managerBot.onGamePrivate || isAdminLevelHighest) {
        switch (command) {
          case "duangua":
            await handleHorseRaceCommand(api, message, aliasCommand);
            return 0;
          case "tutien":
            await handleTuTienCommand(api, message);
            return 0;
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
            await handleCoreGameCommand(api, subMessage, subCommand);
            return 0;
          }
          case "saoke":
          case "donenat":
          case "donate":
          case "testmycard":
          case "giveaway":
          case "resetdaily":
          case "resethu":
          case "baucua":
          case "bcr":
          case "taixiu":
          case "xidach":
          case "baicao":
          case "tienlen":
          case "chanle":
          case "keobuabao":
          case "nongtrai":
          case "vietlott655":
            await handleCoreGameCommand(api, message, command, undefined, aliasCommand);
            return 0;
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
  if (await checkMenuPageReply(api, message)) return 99;
  const mentions = Array.isArray(message.data?.mentions) ? message.data.mentions : [];
  const normalizeNovaId = (value) => String(value ?? "").replace(/_0$/u, "").split("_")[0];
  const knownBotIds = new Set();
  for (const manager of Object.values(apiManager.apiManagerObject || {})) {
    for (const value of [manager?.id, manager?.idBotMainWithBot, manager?.idBotWithBotMain]) {
      const normalized = normalizeNovaId(value);
      if (normalized) knownBotIds.add(normalized);
    }
  }
  knownBotIds.add(normalizeNovaId(botId));
  const novaSenderIsBotAccount = knownBotIds.has(normalizeNovaId(senderId));
  const novaSenderIsCurrentBot = normalizeNovaId(senderId) === normalizeNovaId(botId);
  // Tài khoản main cũng có thể được chủ bot dùng để gõ tin nhắn thủ công trên
  // bot con. Zalo gửi tin thủ công dạng string, còn phần lớn output tự động của
  // bot là object/caption. Chỉ chặn output tự động để tránh bot-to-bot loop.
  const novaSenderIsAutomatedBot = (novaSenderIsCurrentBot || novaSenderIsBotAccount) &&
    typeof message.data?.content !== "string";
  const botMentioned = mentions.some((mention) =>
    normalizeNovaId(mention?.uid || mention?.userId || mention?.id) === normalizeNovaId(botId)
  );
  const explicitNovaName = !novaSenderIsAutomatedBot &&
    /^(?:(?:hey|hi|hello)\s+nova|nova(?:\s+ơi)?|assistant)(?:\s|$)/iu.test(content.trim());
  const novaGroupRoute = isNovaGroupBot(botId, threadId);
  const canHandleUntaggedNova = novaGroupRoute === true ||
    (novaGroupRoute === null && (isNovaEnabled(botId, threadId) || api.apiManager?.isMainBot));
  if (explicitNovaName && !botMentioned && !canHandleUntaggedNova) {
    return numHandleCommand;
  }
  // Tin nhắn thường trong phiên được tiếp tục không cần tag. Riêng mọi tin
  // reply đều phải gọi/tag Nova rõ ràng, kể cả khi reply chính tin của Nova.
  const canContinueFromMessage = !message.data?.quote;
  const continuingNova = !novaSenderIsAutomatedBot && canHandleUntaggedNova &&
    canContinueFromMessage && !content.startsWith(prefix) && isNovaSessionActive(api, message);
  // Nova chỉ được gọi bởi autoreply; giữ nguyên cách tương tác cũ: phải tag bot.
  const naturalNova = false;

  if (!naturalNova && content.trim().startsWith(`${prefix} `)) return numHandleCommand;

  if (!naturalNova && prefix && content.trim() === prefix && !canUseBarePrefix(botId, senderId)) {
    return numHandleCommand;
  }

  // Chặn toàn bộ lệnh nhóm khi bot đang tắt trước cả nhánh prefix. Nếu để
  // sau, `prefix` sẽ được xử lý và trả lời trước khi kiểm tra activeBot.
  // Bot Leader/admin cấp cao và admin bot vẫn được dùng lệnh bật lại bot.
  if (
    message.type === MessageType.GroupMessage &&
    groupSettings?.[threadId]?.activeBot !== true &&
    !isAdminLevelHighest &&
    !isAdminBot
  ) {
    return numHandleCommand;
  }

  if (
    (content.startsWith(`${prefix}prefix`) || content.startsWith(`prefix`))
  ) {
    // Ai cũng được xem prefix hiện tại; chỉ Bot Leader/admin mới được đổi.
    // Việc kiểm tra quyền thay đổi nằm bên trong handlePrefixCommand.
    return await handlePrefixCommand(api, message, threadId, isAdminBot || isAdminLevelHighest);
  }

  if (!naturalNova && !content.startsWith(prefix)) return numHandleCommand;

  const compactContent = rewriteCompactCommand(content, prefix);
  if (compactContent) {
    message = createRoutedCommandMessage(message, compactContent);
    content = compactContent;
  }

  let commandParts;
  let command;

  if (botMentioned || continuingNova || explicitNovaName) {
    commandParts = ["nova", ...content.trim().split(/\s+/u).filter(Boolean)];
    command = "nova";
  } else if (checkSpecialCommand(content, prefix)) {
    commandParts = content.split("_");
    command = commandParts[0].slice(prefix.length);
  } else {
    commandParts = content.slice(prefix.length).trim().split(/\s+/);
    command = commandParts[0];
  }

  let commandLowerCase = command.toLowerCase();

  // Không xác nhận/reaction cho daily, tier, bank, rank, mycard nếu thiếu
  // tiền tố "game"; các lệnh này phải được gọi như "!game daily".
  if (isBareGameCommand(commandLowerCase)) return numHandleCommand;

  if (isUserBlocked(botId, senderId)) return numHandleCommand;

  const isExempt = isAdminLevelHighest || isBotLeader(botId, senderId) || novaSenderIsCurrentBot || novaSenderIsBotAccount;
  if (!checkUserSpamGuard(senderId, isExempt)) {
    return numHandleCommand;
  }

  if (!handleChat) return numHandleCommand;

  // Nova đã tắt phải dừng trước kiểm tra cooldown. Nếu để sau cooldown,
  // bộ đếm vẫn thả CLOCK/UNDO dù Nova không còn xử lý hay trả lời.
  if (
    commandLowerCase === "nova" &&
    !isNovaEnabled(botId, threadId) &&
    !/(?:^|\s)on$/iu.test(content.trim())
  ) {
    return numHandleCommand;
  }

  const commandConfig = getCommandConfig().commands;
  let isChangeSetting = false;
  numHandleCommand = 99;

  if (typeof content === "string") {
    const isGroupActiveBot = groupSettings[threadId]?.activeBot === true;
    const isGroupActiveGame = groupSettings[threadId]?.activeGame === true;
    // Khi bot nhóm OFF, chỉ Bot Leader/admin cấp cao hoặc admin bot được
    // tiếp tục dùng lệnh (đặc biệt là lệnh bật bot lại). Thành viên thường
    // phải được im lặng hoàn toàn, kể cả khi gọi bare prefix.
    if (!isGroupActiveBot && !isAdminLevelHighest && !isAdminBot) {
      return numHandleCommand;
    }
    const groupCommandInfo = getCommand(botId, commandLowerCase);
    const canonicalGroupCommand = groupCommandInfo?.name || commandLowerCase;
    if (isCommandDisabledInGroup(botId, canonicalGroupCommand, threadId)) return numHandleCommand;
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

    const isNovaCancel = naturalNova && /^(?:cancel|cút|cut|câm|cam)$/iu.test(content.trim());
    const isNovaToggle = naturalNova && /(?:^|\s)(?:on|off)$/iu.test(content.trim());
    const isNovaMusicChoice = naturalNova && isNovaAwaitingMusic(api, message) &&
      /^(?:[1-5]|soundcloud|scl|spotify|sptf|zing|zingmp3|zmp3|nct|nhaccuatui|youtube|yt|ytb)$/iu.test(content.trim());
    if (
      !isNovaCancel && !isNovaToggle && !isNovaMusicChoice &&
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
    const activeCommand = commandInfo ? commandInfo.active !== false : true;
    // setcmd off là khóa tuyệt đối với mọi người, kể cả admin cấp cao.
    // Chỉ chính tài khoản mainbot được phép gọi lệnh đã tắt.
    const canBypassDisabledCommand = isMainBotAccount(api, senderId);
    if (aliasCommand !== "" && !activeCommand && !canBypassDisabledCommand) return numHandleCommand;
    numHandleCommand = commandInfo?.type || 99;
    command = commandInfo?.name || command;

    if (command === "nova" && novaSenderIsAutomatedBot) return numHandleCommand;
    const adminCanUseWhileBotOff = isAdminLevelHighest || isAdminBot || isAdminBox;
    // Khi nhóm tắt bot, thành viên không được gọi Nova; quản trị viên vẫn được
    // dùng để kiểm tra, quản lý và bật lại chức năng trong nhóm.
    if (command === "nova" && !isGroupActiveBot && !adminCanUseWhileBotOff) return numHandleCommand;
    if (command === "nova" && !isNovaEnabled(botId, threadId) && !/(?:^|\s)on$/iu.test(content.trim())) {
      return numHandleCommand;
    }

    // Lệnh game chỉ chạy khi bật cả bot lẫn game. Riêng admin cấp cao được phép
    // kiểm tra/vận hành khi đang tắt; admin bot/admin nhóm không được bỏ qua.
    if (numHandleCommand === 5 && (!isGroupActiveBot || !isGroupActiveGame) && !isAdminLevelHighest) {
      if (isAdminBot) {
        const requiredCommands = [];
        if (!isGroupActiveBot) requiredCommands.push(`${prefix}bot on`);
        if (!isGroupActiveGame) requiredCommands.push(`${prefix}gameactive on`);

        await sendMessageFromSQL(
          api,
          message,
          {
            success: false,
            message:
              "Tương tác game đang bị tắt trong nhóm này.\n\n" +
              `Hãy bật trước bằng: ${requiredCommands.join(" và ")}`,
          },
          true,
          10000
        );
      }
      return numHandleCommand;
    }

    const managerCommand = getManagerCommandConfig(botId);
    if (!canBotUseMainBotCommand(api, command, senderId)) return numHandleCommand;
    if (
      managerCommand.notAllowedCommand.includes("all") ||
      managerCommand.notAllowedCommand.includes(command)
    ) return numHandleCommand;

    // Ma Sói chỉ hoạt động khi Bot đã được bật trong nhóm. Không cho quyền admin
    // vô tình vượt qua trạng thái này vì cả timer và tin nhắn game đều chạy dài hạn.
    if (command === "masoi" && groupSettings[threadId]?.activeBot !== true) return numHandleCommand;

    // Lệnh đã vượt qua kiểm tra quyền và trạng thái ở phía trên thì luôn xác
    // nhận bằng reaction. Trước đây admin chạy lệnh khi bot group đang OFF vẫn
    // nhận được kết quả, nhưng reaction bị bỏ qua vì phụ thuộc activeBot.
    await sendReactionConfirmReceive(api, message, numHandleCommand);

    switch (command) {
      case "event.sendmsg":
        await handleEventSendMessage(api, message, aliasCommand);
        break;

      case "test":
        await testFutureUser(api, message, aliasCommand);
        break;

      case "adminbot":
        await handleAdminBotCommandFamily(
          api,
          message,
          aliasCommand,
          groupAdmins,
          groupSettings,
          isAdminLevelHighest
        );
        break;

      case "report":
        await handleSendReport(api, message, aliasCommand, groupInfo);
        break;

      case "setmute":
        await handleSetMuteAll(api, message, aliasCommand);
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

      case "anbox":
        await handleHiddenConversation(api, message, aliasCommand);
        break;

      case "gimtn":
        await handlePinGroupMsg(api, message, aliasCommand);
        break;

      case "bot":
        if (await handleBotSubcommand(api, message, commandParts, prefix)) break;
        isChangeSetting = await handleActiveBotUser(api, message, aliasCommand, groupSettings, isAdminLevelHighest);
        break;

      case "join":
        await handleJoinGroup(api, message);
        break;

      case "leave":
        await handleLeaveCommandFamily(api, message, groupSettings, aliasCommand);
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
        isChangeSetting = await handleMuteCommandFamily(api, message, aliasCommand, groupSettings, groupAdmins);
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

      case "zautoreply":
        await handleZaloAutoReplyFamily(api, message, aliasCommand);
        break;

      case "reminder":
        await handleCreateReminderCommand(api, message, aliasCommand);
        break;

      case "deletechat":
        await handleDeleteChatCommand(api, message, aliasCommand);
        break;

      case "attack":
        await handleAttackCommand(api, message);
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
        isChangeSetting = await handleWelcomeCommandFamily(api, message, aliasCommand, groupSettings);
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

      case "all":
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
        isChangeSetting = await handleLearnCommandFamily(api, message, aliasCommand, groupSettings);
        break;

      case "reply":
        isChangeSetting = await handleReplyCommand(api, message, groupSettings);
        break;

      case "autoreply":
        isChangeSetting = await handleAutoReplyCommand(api, message, aliasCommand, groupSettings);
        break;

      case "scold":
        await scoldUser(api, message);
        break;

      case "fakemsg":
        await handleFakeMessageCommand(api, message);
        break;

      case "reloadconfig": {
        const config = reloadServiceConfig();
        await sendMessageCompleteRequest(api, message, {
          caption: `Đã reload config thành công.\n✅ ${config.commands?.length || 0} lệnh đã được nạp lại.`,
        }, 15000);
        break;
      }

      case "spamgroup":
        await spamgroup(api, message, aliasCommand);
        break;

      case "spamjoin":
        await spamjoin(api, message, aliasCommand);
        break;

      case "autojoin":
        isChangeSetting = await handleAutoJoinCommand(api, message, groupSettings, aliasCommand);
        break;

      case "autorailink":
        await handleAutoRaiLinkCommand(api, message, aliasCommand);
        break;

      case "anti":
        isChangeSetting = await handleAntiCommandFamily(api, message, aliasCommand, groupSettings);
        break;

      case "autodownload":
        isChangeSetting = await handleAutoDownloadAndReplyCommand(api, message, aliasCommand, groupSettings);
        break;

      case "privatebot":
        await handleActivePrivateBot(api, message, aliasCommand);
        break;

      case "heartdelete":
        isChangeSetting = await handleHeartReactionDeleteCommand(api, message, aliasCommand);
        break;

      case "approve":
        isChangeSetting = await handleApprove(api, message, groupSettings, aliasCommand);
        break;

      case "updategroup":
        isChangeSetting = await handleUpdateGroup(api, message, groupSettings, aliasCommand);
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

      case "ngh":
      case "ngh...":
        await handleNghCommand(api, message);
        break;

      case "todo":
        await handleSendToDo(api, message, isAdminLevelHighest);
        break;

      case "sendp":
        await handleSendMessagePrivate(api, message, isAdminLevelHighest);
        break;

      case "settier":
        await handleSetTierCommand(api, message, groupSettings);
        break;

      case "buff":
        await handleBuffCommand(api, message, groupSettings);
        break;

      case "setvnd":
        await handleSetVNDCommand(api, message, groupSettings);
        break;

      case "ban":
        await handleBanCommandFamily(api, message, aliasCommand, groupSettings);
        break;

      case "blockbot":
        await handleBlockBotFamily(api, message, aliasCommand, groupSettings);
        break;

      case "alias":
        await handleAliasCommand(api, message, commandParts);
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

      case "resource":
        await handleResourceFamily(api, message, aliasCommand);
        break;

      case "track":
        await handleTargetBot(api, message, aliasCommand);
        break;

      default:
        if (numHandleCommand === 7) {
          switch (command) {
            case "supportgame":
              await handleSupportGameCommand(api, message, aliasCommand, isAdminBot);
              break;
          }
        }

        if (numHandleCommand === 1) {
          if (isAdminLevelHighest || isAdminBot || isAdminBox || groupSettings[threadId].activeBot === true) {
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
              case "datamembergroup":
                await handleDataMemberGroupCommand(api, message);
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
                await handleInfoCommandFamily(api, message, aliasCommand);
                break;

              case "i4image":
                await handleI4ImageCommand(api, message, aliasCommand);
                break;
              case "bantho":
                await handleBanThoCommand(api, message);
                break;
              case "thuebot":
                await handleThueBotCommand(api, message, groupSettings);
                break;


              case "uid":
                await handleUidCommand(api, message);
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

              case "help":
                await helpCommand(api, message, isAdminBox, commandParts[1]);
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
              case "addusertogroup":
                await handleAddUserToGroupCommand(api, message, aliasCommand);
                break;

              case "gemini":
                await askGeminiCommand(api, message, aliasCommand);
                break;
              case "nova":
                isChangeSetting = await askNovaCommand(api, message, aliasCommand, {
                  canManage: isAdminBot || isAdminLevelHighest,
                  canCancelOthers: isAdminLevelHighest,
                  canCode: isAdminLevelHighest,
                  setEnabled: (enabled) => {
                    setNovaEnabled(botId, threadId, enabled);
                    if (groupSettings[threadId]) groupSettings[threadId].autoReplyCommand = enabled;
                    groupSettingsAll.setChanged();
                  },
                  toolCatalog: commandConfig
                    .filter((item) => item.active !== false && item.name !== "nova")
                    .map((item) => ({
                      name: item.name,
                      aliases: Array.isArray(item.alias) ? item.alias : [],
                      description: item.description,
                      syntax: item.syntax,
                      permission: item.permission,
                    })),
                  commandCount: commandConfig.filter((item) => item.active !== false).length,
                  executeBotCommand: async (toolName, args = "") => {
                    const toolMessage = {
                      ...message,
                      data: {
                        ...message.data,
                        content: `${prefix}${toolName}${args ? ` ${args}` : ""}`,
                      },
                    };
                    await handleCommand(
                      api, toolMessage, groupInfo, groupAdmins, groupSettings,
                      isAdminLevelHighest, isAdminBot, isAdminBox, handleChat
                    );
                  },
                });
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
              case "check":
                await handleTrolGayLessCommand(api, message);
                break;

              case "thoitiet":
                await weatherCommand(api, message, aliasCommand);
                break;

              case "ptg":
                await handlePTGCommand(api, message, aliasCommand, commandParts.slice(1));
                break;

              case "myacc":
                await handleUpdateProfile(api, message, aliasCommand);
                break;

              case "social":
                await handleHungCommand(api, message, aliasCommand);
                break;

              case "soc":
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
                await spamjoin(api, message, aliasCommand);
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
              case "tvpl":
                await handleTvplCommand(api, message, aliasCommand);
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

              case "shopee":
                await handleShopeeCommand(api, message, aliasCommand);
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
              case "football":
                await handleFootballCommand(api, message, aliasCommand);
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

              case "giaxang":
                await handleCheckGiaXangCommand(api, message);
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
                await handleSendFileCommand(api, message, aliasCommand, isAdminLevelHighest);
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
            case "duangua":
              await handleHorseRaceCommand(api, message, aliasCommand);
              break;
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
              await handleCoreGameCommand(api, subMessage, subCommand, groupSettings, subCommand);
              break;
            }

            case "testmycard":
            case "giveaway":
            case "resetdaily":
            case "resethu":
            case "saoke":
            case "donenat":
            case "nongtrai":
            case "baucua":
            case "bcr":
            case "taixiu":
            case "xidach":
            case "baicao":
            case "tienlen":
            case "chanle":
            case "keobuabao":
              await handleCoreGameCommand(api, message, command, groupSettings, aliasCommand);
              break;

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

            case "covua":
              await handleChessCommand(api, message, aliasCommand);
              break;

            case "cotuong":
              await handleXiangqiCommand(api, message, aliasCommand);
              break;

            case "nuoithu":
              await handlePetCommand(api, message, aliasCommand);
              break;

            case "tutien":
              await handleTuTienCommand(api, message);
              break;

            case "zaclwarrior":
              await handleMiniGameCommand(api, message, groupSettings, gameTypeZaclWarrior, aliasCommand);
              break;

            case "vietlott655":
              await handleCoreGameCommand(api, message, command, groupSettings, aliasCommand);
              break;

            case "masoi":
              await handleWerewolfCommand(api, message, isAdminLevelHighest || isAdminBot || isAdminBox, groupInfo);
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
