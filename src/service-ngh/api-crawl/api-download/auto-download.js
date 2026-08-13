import { getGlobalPrefix } from "../../service.js";
import {
  sendMessageComplete,
  sendMessageStateQuote,
  sendMessageWarning,
} from "../../chat-zalo/chat-style/chat-style.js";
import { removeMention } from "../../../utils/format-util.js";
import { analyzeLinks } from "../../../api-zalo/utils.js";
import { managerDataCache } from "../../../commands/bot-manager/active-bot.js";
import { handleDownloadCommand } from "./aio-downlink.js";
import { sendReactionWaitingCountdown } from "../../../commands/manager-command/check-countdown.js";

const playerCooldowns = new Map();
export const typePlatform = "AutoDownload";

export async function handleDetectContentDownload(api, message, isAdminLevelHighest, groupSettings) {
  const threadId = message.threadId;
  const senderId = message.data.uidFrom;
  const content = removeMention(message);

  if (groupSettings) {
    if (!groupSettings[threadId]) groupSettings[threadId] = {};
    if (!groupSettings[threadId].autoDownload) return false;
  } else {
    const mngrData = api.apiManager.getDataManager();
    if (!mngrData.autoDownloadListIds) mngrData.autoDownloadListIds = [];
    if (!mngrData.autoDownloadListIds.includes(threadId)) return false;
  }

  const detectedLinkInContent = analyzeLinks(content);
  if (detectedLinkInContent.count > 0) {
    if (!isAdminLevelHighest) {
      const mngrData = api.apiManager.getDataManager();
      let duration = (mngrData.countdownAutoDownload || 6) * 1000;
      const lastGuessTime = playerCooldowns.get(`${threadId}-${senderId}`);
      const currentTime = Date.now();
      if (lastGuessTime && currentTime - lastGuessTime < duration) {
        const remainingTime = Math.ceil((duration - (currentTime - lastGuessTime)) / 1000);
        const fnAfterCountdown = async () => {
          await api.addReaction("CLOCK", message);
          const result = await handleDownloadCommand(api, message, null, "autodetected");
          await api.addReaction("UNDO", message);
          if (result.noAction) {
          } else {
            await api.addReaction("LIKE", message);
          }
        };
        await sendReactionWaitingCountdown(api, message, remainingTime, typePlatform, fnAfterCountdown);
        return false;
      }
      playerCooldowns.set(`${threadId}-${senderId}`, Date.now());
    }
    const firstLink = detectedLinkInContent.links[0];
    message.data.content = firstLink;
    await api.addReaction("CLOCK", message);
    const result = await handleDownloadCommand(api, message, null, "autodetected");
    await api.addReaction("UNDO", message);
    if (result) {
      if (result.noAction) {
        return false;
      } else {
        await api.addReaction("LIKE", message);
        return true;
      }
    }
  }
  return false;
}

export async function handleAutoDownloadAndReplyCommand(api, message, aliasCommand, groupSettings) {
  const botId = api.getBotId();
  const threadId = message.threadId;
  let isChangeSetting = false;
  const prefix = getGlobalPrefix(api.getBotId());
  const content = removeMention(message);
  const keyword = content.replace(`${prefix}${aliasCommand}`, "").trim();
  const args = keyword.split(" ");
  const status = args[0]?.toLowerCase();

  if (!status) {
    const caption =
      `📖 *Hướng dẫn sử dụng lệnh Auto Download:*` +
      `\n\n🔹 *Cú pháp bật|tắt:*` +
      `\n ➤  ${prefix}${aliasCommand} on|off` +
      `\n\n🔹 *Điều chỉnh countdown:*` +
      `\n ➤  ${prefix}${aliasCommand} countdown (số giây)`;
    await sendMessageComplete(api, message, caption, false, 180000);
    return;
  }

  if (status === "countdown") {
    const seconds = args[1];
    if (seconds) {
      let secondParse = parseInt(seconds);
      const mngrData = api.apiManager.getDataManager();
      mngrData.countdownAutoDownload = secondParse;
      const caption = `Đã điều chỉnh countdown nhận diện liên kết thành: ${secondParse}`;
      await sendMessageComplete(api, message, caption, true, 180000);
    } else {
      const caption = `Vui lòng nhập số giây cần điều chỉnh cho countdown nhận diện đường link liên kết...`;
      await sendMessageWarning(api, message, caption, true, 180000);
    }
    return;
  }

  if (groupSettings) {
    if (!groupSettings[threadId]) {
      groupSettings[threadId] = {};
    }
    const newStatus = status === "on" ? true : status === "off" ? false : !groupSettings[threadId].autoDownload;
    groupSettings[threadId].autoDownload = newStatus;
    isChangeSetting = true;
    const statusText = newStatus ? "bật" : "tắt";
    const caption = `Chức năng tự động nhận diện và tải nội dung từ liên kết đã được ${statusText}!`;
    await sendMessageStateQuote(api, message, caption, newStatus, 300000);
    return isChangeSetting;
  } else {
    const mngrData = api.apiManager.getDataManager();
    if (!mngrData.autoDownloadListIds) mngrData.autoDownloadListIds = [];
    const newStatus =
      status === "on" ? true : status === "off" ? false : !mngrData.autoDownloadListIds.includes(threadId);
    if (newStatus && !mngrData.autoDownloadListIds.includes(threadId)) {
      mngrData.autoDownloadListIds.push(threadId);
    } else if (!newStatus && mngrData.autoDownloadListIds.includes(threadId)) {
      mngrData.autoDownloadListIds = mngrData.autoDownloadListIds.filter((id) => id !== threadId);
    }
    isChangeSetting = true;
    managerDataCache.setChanged(botId);
    const statusText = newStatus ? "bật" : "tắt";
    const caption = `Chức năng tự động nhận diện và tải nội dung từ liên kết đã được ${statusText} tại đây!`;
    await sendMessageStateQuote(api, message, caption, newStatus, 300000);
    return isChangeSetting;
  }
}
