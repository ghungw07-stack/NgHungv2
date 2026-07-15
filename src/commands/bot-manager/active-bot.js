import schedule from "node-schedule";
import { MessageStyle, MessageType } from "../../api-zalo/index.js";
import {
  sendMessageComplete,
  sendMessageCompleteRequest,
  sendMessageFailed,
  sendMessageQuery,
  sendMessageResultRequest,
  sendMessageStateQuote,
  sendMessageWarning,
  ALLOWED_STYLE_SIZES,
  resolveStyleColor,
  getDefaultServerStyle,
} from "../../service-dqt/chat-zalo/chat-style/chat-style.js";
import { getGlobalPrefix } from "../../service-dqt/service.js";
import { removeMention } from "../../utils/format-util.js";
import { parseTime } from "../../utils/format-util.js";
import { addOrUpdateMute } from "../../service-dqt/anti-service/mute-user.js";
import { readManagerFile, writeManagerFile } from "../../utils/io-json.js";
import { loadApiKeysMedia } from "../../utils/api-key-manager.js";
import { getGlobalApi } from "../../index.js";
import { getUsersInfoBasic } from "../../service-dqt/info-service/user-info.js";
import { createListImage } from "../../utils/canvas/list-form-v1.js";
import { deleteFile } from "../../utils/util.js";

class ManagerDataCache {
  constructor() {
    this.cache = {};
    this.hasChanges = {};
  }

  get(idBot) {
    if (!this.cache[idBot]) {
      // Tự load từ file nếu chưa có trong cache,
      // đảm bảo getDataManager() luôn trả về đúng object trong cache
      const fromFile = readManagerFile(idBot);
      this.cache[idBot] = {
        msgRequestReset: {},
        onBotPrivate: false,
        onGamePrivate: true,
        ...fromFile,
      };
    }
    return this.cache[idBot];
  }

  load(idBot) {
    const fromFile = readManagerFile(idBot);
    this.cache[idBot] = {
      msgRequestReset: {},
      onBotPrivate: false,
      onGamePrivate: true,
      ...fromFile,
    };
  }

  setChanged(idBot) {
    this.hasChanges[idBot] = true;
  }

  save(idBot) {
    if (this.hasChanges[idBot]) {
      writeManagerFile(idBot, this.get(idBot));
      this.hasChanges[idBot] = false;
    }
  }
}

export const managerDataCache = new ManagerDataCache();

/**
 * Xử phạt người vi phạm anti (link/file/nude/sđt/ảnh...) theo cấu hình chung
 * đã đặt qua "{p}bot anti block|kick|mute <time>". Mặc định là block nếu chưa cấu hình.
 * Dùng chung cho tất cả các module anti-service để tránh lặp code.
 */
export async function applyAntiPunishment(api, message, threadId, senderId, senderName, groupSettings) {
  const managerData = api.apiManager.getDataManager();
  const antiAction = managerData.antiAction || { type: "block" };
  const action = antiAction.type || "block";
  const duration = antiAction.duration || 3600000; // mặc định 1 giờ nếu là mute

  try {
    if (action === "kick") {
      await api.removeUserFromGroup(threadId, [senderId]);
      return;
    }

    if (action === "mute" && groupSettings?.[threadId]) {
      if (!groupSettings[threadId].muteList) groupSettings[threadId].muteList = {};
      await addOrUpdateMute(api, message, senderId, senderName, duration, groupSettings);
      return;
    }

    // Mặc định hoặc fallback (mute nhưng không truyền được groupSettings vào scope): block
    await api.blockUsers(threadId, [senderId]);
  } catch (error) {
    console.error(`[applyAntiPunishment] Lỗi khi xử phạt ${senderName}:`, error);
  }
}

export async function initializeManagerService(api) {
  const idBot = api.getBotId();
  managerDataCache.load(idBot);

  api.apiInstance.schedule.managerDataService = schedule.scheduleJob("*/10 * * * * *", () => {
    managerDataCache.save(idBot);
  });
}

export async function notifyResetCompleteInGroup(api) {
  const idBot = api.getBotId();
  const managerData = api.apiManager.getDataManager();
  const msgRequestReset = managerData.msgRequestReset;

  if (msgRequestReset && msgRequestReset.threadId) {
    await sendMessageResultRequest(
      api,
      msgRequestReset.type,
      msgRequestReset.threadId,
      "Khởi động lại hoàn tất!\nBot đã hoạt động trở lại!",
      true,
      300000
    );

    const resetInfo = { threadId: msgRequestReset.threadId, type: msgRequestReset.type };
    managerData.msgRequestReset = {};
    // Lưu tạm lại để lần gọi kế tiếp (vd: activeBotChildren dùng để gửi thống kê bot con)
    // vẫn lấy được threadId/type dù msgRequestReset đã bị xoá ở trên.
    managerData.lastRestartNotify = resetInfo;
    managerDataCache.setChanged(idBot);
    return resetInfo;
  }

  if (managerData.lastRestartNotify) {
    const resetInfo = managerData.lastRestartNotify;
    managerData.lastRestartNotify = null;
    managerDataCache.setChanged(idBot);
    return resetInfo;
  }

  return null;
}

export async function notifyResettingInGroup(api, message) {
  const idBot = api.getBotId();
  const threadId = message.threadId;
  const managerData = api.apiManager.getDataManager();

  managerData.msgRequestReset = {
    threadId,
    type: message.type,
  };
  managerDataCache.setChanged(idBot);
  managerDataCache.save(idBot);

  await sendMessageResultRequest(api, message.type, threadId, "Tiến hành khởi động lại...", true, 12000);
}

export async function exitRestartBot(api, message) {
  try {
    await notifyResettingInGroup(api, message);
    await new Promise((resolve) => setTimeout(resolve, 1000));
    process.exit(0);
  } catch (error) {
    await sendMessageFailed(api, message, "Không thể tắt bot: " + error.message, false, 15000);
  }
}

export async function handleActiveBotUser(api, message, aliasCommand, groupSettings, isAdminLevelHighest) {
  const idBot = api.getBotId();
  const isMainBot = api.apiManager.isMainBot;
  const content = removeMention(message);
  const threadId = message.threadId;
  const senderId = message.data.uidFrom;
  const prefix = getGlobalPrefix(idBot);
  const botCommand = content.replace(`${prefix}bot`, "").trim();
  const managerData = api.apiManager.getDataManager();

  if (!botCommand) {
    const caption =
      `📖 *Hướng dẫn cho sự khởi đầu:*` +
      `\n\n🔹 *Bật|tắt tương tác bot với thành viên:*` +
      `\n ➤  ${prefix}${aliasCommand} on|off` +
      `\n\n🔹 *Bật|tắt tương tác bot với tất cả nhóm:*` +
      `\n ➤  ${prefix}${aliasCommand} all on|off` +
      `\n\n🔹 *Bật|tắt tương tác tin nhắn riêng:*` +
      `\n ➤  ${prefix}${aliasCommand} privatebot on|off` +
	  `\n\n🔹 *Bật|tắt tương tác game tin nhắn riêng:*` +
	  `\n ➤  ${prefix}${aliasCommand} privategame on|off` +
      `\n\n🔹 *Đổi cấu hình anti:*` +
      `\n ➤  ${prefix}${aliasCommand} anti block|kick|mute <time>` +
      `\n ➤  ${prefix}${aliasCommand} check - Kiểm tra cấu hình anti` +
      `\n\n🔹 *Bật tắt gửi đĩa xoay:*` +
      `\n ➤  ${prefix}${aliasCommand} spindisk on|off` +
      `\n\n🔹 *Bật|tắt tự xóa khi thả tym:*` +
      `\n ➤  ${prefix}${aliasCommand} autodelete on|off` +
      `\n\n🔹 *Bật|tắt chống bị kéo vào nhóm:*` +
      `\n ➤  ${prefix}${aliasCommand} antiinvite on|off` +
      `\n\n🔹 *Đếch quan tâm user:*` +
      `\n ➤  ${prefix}${aliasCommand} dontcare add/remove/list` +
      `\n\n🔹 *Cài đặt câu tạm biệt nhóm:*` +
      `\n ➤  ${prefix}${aliasCommand} set leave <nội dung>` +
      `\n\n🔹 *Bật|tắt tự động block khi spam riêng:*` +
      `\n ➤  ${prefix}${aliasCommand} autoblock on|off` +
      `\n\n🔹 *Tự động tắt thông báo nhóm mới / tin nhắn riêng:*` +
      `\n ➤  ${prefix}${aliasCommand} autosetmute on|off` +
      `\n\n🔹 *Sticker thông báo:*` +
      `\n ➤  ${prefix}${aliasCommand} sticker help` +
      `\n\n🔹 *Khởi động lại bot:*` +
      `\n ➤  ${prefix}${aliasCommand} restart`;
    await sendMessageComplete(api, message, caption, false, 180000);
    return;
  }

  if (botCommand === "on" || botCommand === "off") {
    if (groupSettings) {
      let newStatus;
      if (!botCommand) {
        newStatus = !groupSettings[threadId].activeBot;
      } else {
        newStatus = botCommand === "off" ? false : true;
      }

      groupSettings[threadId].activeBot = newStatus;

      const statusMessage = newStatus ? "kích hoạt" : "vô hiệu hóa";
      const caption = `Đã ${statusMessage} tương tác với bot trong nhóm này.`;
      if (newStatus) {
        await sendMessageComplete(api, message, caption);
      } else {
        await sendMessageFailed(api, message, caption);
      }
    } else {
      await sendMessageFailed(api, message, "Không thể setup nhóm ở tin nhắn riêng tư!");
    }

    return true;
  } else if (botCommand.includes("privatebot")) {
    const privateCommand = botCommand.replace("privatebot", "").trim();
    let newStatus;
    if (!privateCommand) {
      newStatus = !managerData.onBotPrivate;
    } else {
      newStatus = privateCommand === "on" ? true : false;
    }
    managerData.onBotPrivate = newStatus;
    managerDataCache.setChanged(idBot);

    const statusMessage = newStatus ? "kích hoạt" : "vô hiệu hóa";
    const caption = `Đã ${statusMessage} tương tác lệnh trong tin nhắn riêng tư với tất cả người dùng.`;
    if (newStatus) {
      await sendMessageComplete(api, message, caption);
    } else {
      await sendMessageFailed(api, message, caption);
    }
  } else if (botCommand.includes("privategame")) {
    const privateCommand = botCommand.replace("privategame", "").trim();
    let newStatus;
    if (!privateCommand) {
      newStatus = !managerData.onGamePrivate;
    } else {
      newStatus = privateCommand === "on" ? true : false;
    }
    managerData.onGamePrivate = newStatus;
    managerDataCache.setChanged(idBot);

    const statusMessage = newStatus ? "kích hoạt" : "vô hiệu hóa";
    const caption = `Đã ${statusMessage} tương tác game trong tin nhắn riêng tư với tất cả người dùng.`;
    if (newStatus) {
      await sendMessageComplete(api, message, caption);
    } else {
      await sendMessageFailed(api, message, caption);
    }
  } else if (botCommand.includes("spindisk")) {
    const privateCommand = botCommand.replace("spindisk", "").trim();
    let newStatus;
    if (!privateCommand) {
      newStatus = !managerData.spinDisk;
    } else {
      newStatus = privateCommand === "on" ? true : false;
    }
    managerData.spinDisk = newStatus;
    managerDataCache.setChanged(idBot);

    const statusMessage = newStatus ? "kích hoạt" : "vô hiệu hóa";
    const caption = `Đã ${statusMessage} gửi đĩa xoay khi gửi các tác vụ liên quan.`;
    if (newStatus) {
      await sendMessageComplete(api, message, caption);
    } else {
      await sendMessageFailed(api, message, caption);
    }
  } else if (botCommand.includes("autodelete")) {
    const privateCommand = botCommand.replace("autodelete", "").trim();
    let newStatus;
    if (!privateCommand) {
      newStatus = !managerData.heartReactionDelete;
    } else {
      newStatus = privateCommand === "on" ? true : false;
    }
    managerData.heartReactionDelete = newStatus;
    managerDataCache.setChanged(idBot);

    const statusMessage = newStatus ? "kích hoạt" : "vô hiệu hóa";
    const caption = `Đã ${statusMessage} tự động xóa tin nhắn khi có reaction thả tym.`;
    if (newStatus) {
      await sendMessageComplete(api, message, caption);
    } else {
      await sendMessageFailed(api, message, caption);
    }
  } else if (botCommand.includes("antiinvite")) {
    const privateCommand = botCommand.replace("antiinvite", "").trim();
    let newStatus;
    if (!privateCommand) {
      newStatus = !managerData.antiInvite;
    } else {
      newStatus = privateCommand === "on" ? true : false;
    }
    managerData.antiInvite = newStatus;
    managerDataCache.setChanged(idBot);

    const statusMessage = newStatus ? "kích hoạt" : "vô hiệu hóa";
    const caption = `Đã ${statusMessage} chống bị kéo vào nhóm lạ.`;
    if (newStatus) {
      await sendMessageComplete(api, message, caption);
    } else {
      await sendMessageFailed(api, message, caption);
    }
  } else if (botCommand.includes("replyuser")) {
    const privateCommand = botCommand.replace("replyuser", "").trim();
    let newStatus;
    if (!privateCommand) {
      newStatus = !managerData.replyUser;
    } else {
      newStatus = privateCommand === "on" ? true : false;
    }
    managerData.replyUser = newStatus;
    managerDataCache.setChanged(idBot);

    const statusMessage = newStatus ? "kích hoạt" : "vô hiệu hóa";
    const caption = `Đã ${statusMessage} tự động phản hồi tin nhắn khi bot được nhắc đến (tính năng chỉ khả dụng khi onbot và có bật reply).`;
    if (newStatus) {
      await sendMessageComplete(api, message, caption);
    } else {
      await sendMessageFailed(api, message, caption);
    }
  } else if (botCommand.includes("reloadapi")) {
    loadApiKeysMedia();
    const caption = `Đã reload danh sách API Key Media.`;
    await sendMessageComplete(api, message, caption);
  } else if (botCommand === "style" || botCommand.startsWith("style ") || botCommand.startsWith("style:")) {
    const styleArg = botCommand.replace(/^style\s*/, "").trim();
    const currentStyle = managerData.chatStyle || getDefaultServerStyle();

    if (!styleArg) {
      const textStyleInfo = currentStyle.text
        ? `\n➤ textbold: ${currentStyle.text.bold !== undefined ? currentStyle.text.bold : true}` +
          `\n➤ textitalic: ${currentStyle.text.italic ? "true" : "false"}` +
          `\n➤ textunderline: ${currentStyle.text.underline ? "true" : "false"}` +
          `\n➤ textstrike: ${currentStyle.text.strike ? "true" : "false"}`
        : "\n➤ (mặc định: bold, không italic/underline/strike)";
      const textSizeView = currentStyle.textSize ? `\n➤ textsize: ${currentStyle.textSize}` : `\n➤ textsize: (mặc định ${SIZE_18})`;

      const caption =
        `🎨 *Cấu hình style hiện tại:*` +
        `\n\n[NameServer]` +
        `\n➤ color: ${currentStyle.color}` +
        `\n➤ size: ${currentStyle.size}` +
        `\n➤ bold: ${currentStyle.bold ? "true" : "false"}` +
        `\n➤ italic: ${currentStyle.italic ? "true" : "false"}` +
        `\n➤ underline: ${currentStyle.underline ? "true" : "false"}` +
        `\n➤ strike: ${currentStyle.strike ? "true" : "false"}` +
        `\n\n[Text Body]` +
        textSizeView +
        textStyleInfo +
        `\n\nCú pháp nameServer: ${prefix}${aliasCommand} style color:r;size:16;italic:true;bold:true` +
        `\nCú pháp text body: ${prefix}${aliasCommand} style textsize:14;textbold:true;textitalic:false` +
        `\nMàu hỗ trợ: r/do, y/vang, g/xanhla, b/xanhduong, p/tim, o/cam, w/trang, k/den, hex (vd ff9800)` +
        `\nSize hỗ trợ: ${ALLOWED_STYLE_SIZES.join(", ")}` +
        `\nDùng "${prefix}${aliasCommand} style reset" để về mặc định.`;
      await sendMessageComplete(api, message, caption, false, 180000);
      return;
    }

    if (styleArg.toLowerCase() === "reset") {
      managerData.chatStyle = null;
      managerDataCache.setChanged(idBot);
      await sendMessageComplete(api, message, `Đã đặt lại style tên server về mặc định.`);
      return;
    }

    // Parse cú pháp "key:value;key:value"
    const pairs = styleArg.split(";").map((p) => p.trim()).filter(Boolean);
    const newStyle = { ...currentStyle };
    const errors = [];
    const boolKeys = ["bold", "italic", "underline", "strike"];

    for (const pair of pairs) {
      const [rawKey, rawValue] = pair.split(":").map((s) => s?.trim());
      const key = rawKey?.toLowerCase();
      if (!key || rawValue === undefined) {
        errors.push(`Đối số không hợp lệ: "${pair}"`);
        continue;
      }

      if (key === "color") {
        const resolved = resolveStyleColor(rawValue);
        if (!resolved) {
          errors.push(`Màu "${rawValue}" không hợp lệ! Dùng r/y/g/b/p/o/w/k hoặc mã hex 6 ký tự.`);
        } else {
          newStyle.color = resolved;
        }
      } else if (key === "size") {
        const sizeValue = rawValue.replace(/\D/g, "");
        if (!ALLOWED_STYLE_SIZES.includes(sizeValue)) {
          errors.push(`Size "${rawValue}" không hợp lệ! Các size hỗ trợ: ${ALLOWED_STYLE_SIZES.join(", ")}`);
        } else {
          newStyle.size = sizeValue;
        }
      } else if (boolKeys.includes(key)) {
        const boolValue = rawValue.toLowerCase();
        if (boolValue !== "true" && boolValue !== "false") {
          errors.push(`Giá trị "${key}:${rawValue}" không hợp lệ! Chỉ nhận true|false.`);
        } else {
          newStyle[key] = boolValue === "true";
        }
      } else if (key === "textsize") {
        const sizeValue = rawValue.replace(/\D/g, "");
        if (!ALLOWED_STYLE_SIZES.includes(sizeValue)) {
          errors.push(`textsize "${rawValue}" không hợp lệ! Các size hỗ trợ: ${ALLOWED_STYLE_SIZES.join(", ")}`);
        } else {
          newStyle.textSize = sizeValue;
        }
      } else if (["textbold", "textitalic", "textunderline", "textstrike"].includes(key)) {
        const boolValue = rawValue.toLowerCase();
        if (boolValue !== "true" && boolValue !== "false") {
          errors.push(`Giá trị "${key}:${rawValue}" không hợp lệ! Chỉ nhận true|false.`);
        } else {
          // lưu vào newStyle.text.bold / .italic / ...
          if (!newStyle.text) newStyle.text = {};
          const textProp = key.replace("text", ""); // bold/italic/underline/strike
          newStyle.text[textProp] = boolValue === "true";
        }
      } else {
        errors.push(`Không hỗ trợ tùy chỉnh "${key}". Chỉ hỗ trợ: color, size, bold, italic, underline, strike, textsize, textbold, textitalic, textunderline, textstrike.`);
      }
    }

    if (errors.length > 0) {
      await sendMessageWarning(api, message, `❌ Cập nhật style thất bại:\n${errors.join("\n")}`, false);
      return;
    }

    managerData.chatStyle = newStyle;
    managerDataCache.setChanged(idBot);

    const textInfo = newStyle.text
      ? `\n➤ textbold: ${newStyle.text.bold !== undefined ? newStyle.text.bold : true}` +
        `\n➤ textitalic: ${newStyle.text.italic ? "true" : "false"}` +
        `\n➤ textunderline: ${newStyle.text.underline ? "true" : "false"}` +
        `\n➤ textstrike: ${newStyle.text.strike ? "true" : "false"}`
      : "";
    const textSizeInfo = newStyle.textSize ? `\n➤ textsize: ${newStyle.textSize}` : "";

    const caption =
      `Đã cập nhật style:` +
      `\n\n[NameServer]` +
      `\n➤ color: ${newStyle.color}` +
      `\n➤ size: ${newStyle.size}` +
      `\n➤ bold: ${newStyle.bold ? "true" : "false"}` +
      `\n➤ italic: ${newStyle.italic ? "true" : "false"}` +
      `\n➤ underline: ${newStyle.underline ? "true" : "false"}` +
      `\n➤ strike: ${newStyle.strike ? "true" : "false"}` +
      `\n\n[Text Body]` +
      textSizeInfo +
      textInfo;
    await sendMessageComplete(api, message, caption);
  } else if (botCommand === "all on" || botCommand === "all off") {
    if (!isAdminLevelHighest) {
      await sendMessageFailed(api, message, "Chỉ chủ bot mới có quyền bật/tắt tương tác ở TẤT CẢ nhóm!");
      return false;
    }
    if (!groupSettings) {
      await sendMessageFailed(api, message, "Không thể dùng lệnh này ở tin nhắn riêng tư!");
      return false;
    }
    const newStatus = botCommand === "all on";
    const allThreadIds = Object.keys(groupSettings);
    for (const tid of allThreadIds) {
      if (groupSettings[tid]) groupSettings[tid].activeBot = newStatus;
    }
    const statusMessage = newStatus ? "kích hoạt" : "vô hiệu hóa";
    await sendMessageComplete(
      api,
      message,
      `Đã ${statusMessage} tương tác bot ở TẤT CẢ ${allThreadIds.length} nhóm mà bot đang tham gia.`
    );
    return true;
  } else if (botCommand.startsWith("dontcare")) {
    if (!isAdminLevelHighest) {
      await sendMessageFailed(api, message, "Chỉ chủ bot mới có quyền quản lý danh sách này!");
      return false;
    }
    const args = botCommand.replace("dontcare", "").trim().split(/\s+/).filter(Boolean);
    const subCmd = (args[0] || "list").toLowerCase();
    if (!managerData.dontCareList) managerData.dontCareList = [];

    if (subCmd === "list") {
      if (managerData.dontCareList.length === 0) {
        await sendMessageComplete(api, message, `Danh sách "đếch quan tâm" hiện đang trống.`);
      } else {
        await sendMessageComplete(
          api,
          message,
          `📋 Danh sách người dùng bot không quan tâm (${managerData.dontCareList.length}):\n` +
            managerData.dontCareList.map((id, i) => `${i + 1}. ${id}`).join("\n")
        );
      }
      return false;
    }

    if (subCmd !== "add" && subCmd !== "remove") {
      await sendMessageFailed(
        api,
        message,
        `Cú pháp không hợp lệ!\n${prefix}${aliasCommand} dontcare add|remove (tag người dùng)\n${prefix}${aliasCommand} dontcare list`
      );
      return false;
    }

    const mentions = message.data.mentions;
    if (!mentions || mentions.length === 0) {
      await sendMessageFailed(
        api,
        message,
        `Vui lòng tag người dùng cần ${subCmd === "remove" ? "xóa khỏi" : "thêm vào"} danh sách!`
      );
      return false;
    }

    let changed = false;
    for (const mention of mentions) {
      const uid = mention.uid;
      if (subCmd === "add") {
        if (!managerData.dontCareList.includes(uid)) {
          managerData.dontCareList.push(uid);
          changed = true;
        }
      } else {
        const idx = managerData.dontCareList.indexOf(uid);
        if (idx !== -1) {
          managerData.dontCareList.splice(idx, 1);
          changed = true;
        }
      }
    }

    if (changed) {
      managerDataCache.setChanged(idBot);
      await sendMessageComplete(api, message, `Đã cập nhật danh sách "đếch quan tâm".`);
    } else {
      await sendMessageFailed(api, message, `Không có thay đổi nào được thực hiện (user đã ở trong/ngoài danh sách rồi).`);
    }
    return true;
  } else if (botCommand.startsWith("set leave")) {
    if (!groupSettings || !groupSettings[threadId]) {
      await sendMessageFailed(api, message, "Không thể cài đặt câu tạm biệt ở tin nhắn riêng tư!");
      return false;
    }
    const leaveText = botCommand.replace("set leave", "").trim();
    if (!leaveText) {
      groupSettings[threadId].leaveMessage = null;
      await sendMessageComplete(api, message, `Đã xóa câu tạm biệt tùy chỉnh, dùng lại ảnh mặc định khi có người rời nhóm.`);
      return true;
    }
    groupSettings[threadId].leaveMessage = leaveText;
    await sendMessageComplete(
      api,
      message,
      `Đã cài đặt câu tạm biệt nhóm:\n"${leaveText}"\n\n(Dùng {name} trong nội dung để chèn tên người rời nhóm)`
    );
    return true;
  } else if (botCommand === "check") {
    const threadSettings = groupSettings?.[threadId] || {};
    const antiAction = managerData.antiAction || { type: "block" };
    const actionLabel = antiAction.type === "kick" ? "Kick" : antiAction.type === "mute" ? "Mute" : "Block";
    const actionTimeLabel =
      antiAction.type === "mute" ? ` (${Math.round((antiAction.duration || 3600000) / 60000)} phút)` : "";

    const antiList = [
      ["Anti Link", threadSettings.removeLinks],
      ["Anti Từ Cấm", threadSettings.filterBadWords],
      ["Anti Nude", threadSettings.antiNude],
      ["Anti Bot", threadSettings.antiBot],
      ["Anti File", threadSettings.antiFile],
      ["Anti Media", threadSettings.antiMediaFile],
      ["Anti SĐT", threadSettings.antiPhoneNumber],
      ["Anti Ảnh/Video", threadSettings.antiPhotoVideo],
      ["Anti Spam", threadSettings.antiSpam],
      ["Anti Sticker", threadSettings.antiSticker],
      ["Anti Sticker Hiệu Ứng", threadSettings.antiStickerEffect],
      ["Anti Tag", threadSettings.antiTag],
      ["Anti Thu Hồi", threadSettings.antiUndo],
      ["Anti Voice", threadSettings.antiVoice],
      ["Anti Chuyển Tiếp", threadSettings.antiforward],
      ["Anti Gif", threadSettings.antigif],
      ["Anti Mời Bot", managerData.antiInvite],
    ];

    const caption =
      `🛡️ *Cấu hình Anti hiện tại:*\n\n` +
      `⚔️ Hình phạt khi vi phạm: ${actionLabel}${actionTimeLabel}\n\n` +
      antiList.map(([name, val]) => `${val ? "✅" : "❌"} ${name}`).join("\n") +
      `\n\nDùng "${prefix}${aliasCommand} anti block|kick|mute <time>" để đổi hình phạt.`;

    await sendMessageComplete(api, message, caption, false, 180000);
    return false;
  } else if (botCommand.startsWith("anti ")) {
    if (!isAdminLevelHighest) {
      await sendMessageFailed(api, message, "Chỉ chủ bot mới có quyền đổi cấu hình anti!");
      return false;
    }
    const antiArgs = botCommand.replace("anti", "").trim().split(/\s+/).filter(Boolean);
    const actionType = (antiArgs[0] || "").toLowerCase();
    const timeArg = antiArgs[1];

    if (!["block", "kick", "mute"].includes(actionType)) {
      await sendMessageFailed(
        api,
        message,
        `Cú pháp không hợp lệ!\n${prefix}${aliasCommand} anti block|kick|mute <time>\nVí dụ: ${prefix}${aliasCommand} anti mute 30p`
      );
      return false;
    }

    const antiActionConfig = { type: actionType };
    if (actionType === "mute") {
      const duration = parseTime(timeArg, 3600000);
      antiActionConfig.duration = duration;
    }

    managerData.antiAction = antiActionConfig;
    managerDataCache.setChanged(idBot);

    const actionLabel = actionType === "kick" ? "Kick khỏi nhóm" : actionType === "mute" ? "Mute (cấm chat)" : "Block";
    const timeLabel = actionType === "mute" ? ` trong ${Math.round(antiActionConfig.duration / 60000)} phút` : "";
    await sendMessageComplete(api, message, `Đã đổi hình phạt vi phạm anti thành: ${actionLabel}${timeLabel}.`);
    return true;
  } else if (botCommand.includes("autoblock")) {
    const privateCommand = botCommand.replace("autoblock", "").trim();
    let newStatus;
    if (!privateCommand) {
      newStatus = !managerData.autoBlockSpam;
    } else {
      newStatus = privateCommand === "on" ? true : false;
    }
    managerData.autoBlockSpam = newStatus;
    managerDataCache.setChanged(idBot);

    const statusMessage = newStatus ? "kích hoạt" : "vô hiệu hóa";
    const caption = `Đã ${statusMessage} tự động block người dùng khi spam tin nhắn riêng.`;
    if (newStatus) {
      await sendMessageComplete(api, message, caption);
    } else {
      await sendMessageFailed(api, message, caption);
    }
    return true;
  } else if (botCommand.includes("autosetmute")) {
    const privateCommand = botCommand.replace("autosetmute", "").trim();
    let newStatus;
    if (!privateCommand) {
      newStatus = !managerData.autoSetMute;
    } else {
      newStatus = privateCommand === "on" ? true : false;
    }
    managerData.autoSetMute = newStatus;
    managerDataCache.setChanged(idBot);

    const statusMessage = newStatus ? "kích hoạt" : "vô hiệu hóa";
    const caption = `Đã ${statusMessage} tự động tắt thông báo khi có nhóm mới/tin nhắn riêng mới.`;
    if (newStatus) {
      await sendMessageComplete(api, message, caption);
    } else {
      await sendMessageFailed(api, message, caption);
    }
    return true;
  } else if (botCommand === "sticker help") {
    const caption =
      `📖 *Sticker thông báo:*\n\n` +
      `Đây là sticker bot sẽ tự gửi khi có ai gõ "${prefix}" mà không kèm lệnh nào.\n\n` +
      `➤ Cách đặt: reply vào 1 tin nhắn sticker rồi gõ\n` +
      `   ${prefix}${aliasCommand} set sticker`;
    await sendMessageComplete(api, message, caption, false, 180000);
    return true;
  } else if (botCommand === "set sticker" || botCommand.startsWith("set sticker")) {
    const quote = message.data.quote;
    if (!quote || !quote.attach) {
      await sendMessageFailed(
        api,
        message,
        `Vui lòng reply vào 1 sticker để đặt làm sticker mặc định!\nCú pháp: ${prefix}${aliasCommand} set sticker (reply vào tin nhắn sticker)`
      );
      return true;
    }

    try {
      const attachData = JSON.parse(quote.attach);

      // Helper: parse params (có thể là string JSON hoặc object) - dùng cho sticker cá nhân/custom
      const parseParams = (params) => {
        if (typeof params === "string") {
          try {
            return JSON.parse(params);
          } catch {
            return {};
          }
        }
        return params || {};
      };

      const idSticker = attachData.id || null;
      const cateId = attachData.catId || attachData.cateId || null;
      const type = attachData.type || null;

      let newEmptyPrefixSticker = null;

      if (idSticker && cateId) {
        // 1) Sticker kho chính thức của Zalo
        newEmptyPrefixSticker = { id: idSticker, cateId: cateId, type: type || null };
      } else if (attachData.params) {
        // 2) Sticker cá nhân / custom sticker (không nằm trong kho, có params.contentId, webp...)
        const params = parseParams(attachData.params);
        const animationUrl = params.webp?.url || params.hd || params.hdUrl || attachData.href || "";
        const staticUrl =
          params.thumbUrl || params.oriUrl || params.normalUrl || params.hd || params.hdUrl || attachData.thumbUrl || attachData.href || "";
        const width = params.width || params.webp?.width || 480;
        const height = params.height || params.webp?.height || 480;

        if (animationUrl && staticUrl) {
          newEmptyPrefixSticker = { kind: "custom", staticUrl, animationUrl, width, height };
        } else if (staticUrl) {
          newEmptyPrefixSticker = { kind: "image", staticUrl };
        }
      }

      if (!newEmptyPrefixSticker) {
        // 3) Fallback: ảnh/gif thường được gửi kèm (không phải sticker) - vẫn cho phép đặt làm mặc định
        const fallbackUrl = attachData.hdUrl || attachData.href || attachData.oriUrl || attachData.normalUrl || attachData.thumbUrl || null;
        if (fallbackUrl) {
          newEmptyPrefixSticker = { kind: "image", staticUrl: fallbackUrl };
        }
      }

      if (!newEmptyPrefixSticker) {
        await sendMessageFailed(
          api,
          message,
          `Tin nhắn được reply không phải là sticker/ảnh hợp lệ để đặt làm mặc định!`
        );
        return true;
      }

      managerData.emptyPrefixSticker = newEmptyPrefixSticker;
      managerDataCache.setChanged(idBot);

      await sendMessageComplete(
        api,
        message,
        `Đã đặt sticker mặc định! Từ giờ khi có ai gõ "${prefix}" mà không kèm lệnh, bot sẽ gửi sticker này.`
      );
    } catch (error) {
      await sendMessageFailed(api, message, `Lỗi khi đọc sticker từ tin nhắn reply: ${error.message}`);
    }
    return true;
  } else if (botCommand.includes("restart")) {
    if (isAdminLevelHighest && isMainBot) {
      await exitRestartBot(api, message);
      return true;
    }
    await sendMessageFailed(api, message, "Bạn không có quyền khởi động lại hệ thống chạy bot!");
  } else {
    await sendMessageFailed(
      api,
      message,
      `Hành động không hợp lệ!\nVui lòng dùng lại lệnh "${prefix}${aliasCommand}" để xem hướng dẫn!`
    );
  }

  return false;
}

export async function handleActiveGameUser(api, message, groupSettings) {
  const content = removeMention(message);
  const threadId = message.threadId;
  const prefix = getGlobalPrefix(api.getBotId());
  const gameCommand = `${prefix}gameactive`;

  if (content === gameCommand || content === `${gameCommand} on` || content === `${gameCommand} off`) {
    let newStatus;
    if (content === gameCommand) {
      newStatus = !groupSettings[threadId].activeGame;
    } else {
      newStatus = content === `${gameCommand} off` ? false : true;
    }

    groupSettings[threadId].activeGame = newStatus;

    const statusMessage = newStatus ? "kích hoạt" : "vô hiệu hóa";
    const caption = `Đã ${statusMessage} xử lý tương tác trò chơi trong nhóm này.`;
    if (newStatus) {
      await sendMessageComplete(api, message, caption);
    } else {
      await sendMessageFailed(api, message, caption);
    }

    return true;
  }

  return false;
}

export async function handleActivePrivateBot(api, message, aliasCommand) {
  const botId = api.getBotId();
  const isMainBot = api.apiManager.isMainBot;
  const content = removeMention(message);
  const threadId = message.threadId;
  const senderId = message.data.uidFrom;
  const prefix = getGlobalPrefix(botId);
  const managerData = api.apiManager.getDataManager();
  if (!managerData.listAcceptUseCommandPrivate) managerData.listAcceptUseCommandPrivate = [];
  const botCommand = content.replace(`${prefix + aliasCommand}`, "").trim();
  const args = botCommand.split(" ");
  const action = args[0]?.toLowerCase();
  const mentions = message.data.mentions;
  const listAction = ["add", "remove", "list"];

  if (!botCommand || !listAction.includes(action)) {
    const caption =
      `📖 *Hướng dẫn sử dụng lệnh PrivateBot:*` +
      `\n\n🔹 *Cú pháp thêm|xóa trong tin nhắn riêng:*` +
      `\n ➤  ${prefix}${aliasCommand} add|remove` +
      `\n\n🔹 *Cú pháp thêm|xóa trong tin nhắn nhóm:*` +
      `\n ➤  ${prefix}${aliasCommand} add|remove @mention` +
      `\n\n🔹 *Xem danh sách người dùng được phê duyệt:*` +
      `\n ➤  ${prefix}${aliasCommand} list`;
    await sendMessageComplete(api, message, caption, false, 180000);
    return;
  }

  if (action === "list") {
    let imagePath = null;

    const listAccept = managerData.listAcceptUseCommandPrivate;
    if (listAccept.length > 0) {
      let infoListAccept = await getUsersInfoBasic(api, listAccept);

      try {
        imagePath = await createListImage(
          { columnCount: 2 },
          Object.values(infoListAccept).map((member) => ({
            name: member.displayName,
            avatar: member.avatar,
            info: `Ưu tiên xử lý tin nhắn riêng`,
            badge: null,
          })),
          {
            mainTitle: "List Priority PrivateBot",
            subTitle: `Danh Sách Ưu Tiên`,
          }
        );

        await sendMessageCompleteRequest(
          api,
          message,
          {
            caption: "Đây là danh sách ưu tiên xử lý lệnh trong tin nhắn riêng.",
            imagePath,
          },
          600000
        );
      } catch (error) {
        console.error("Lỗi khi tạo ảnh danh sách:", error);
      } finally {
        deleteFile(imagePath);
      }
    } else {
      await sendMessageCompleteRequest(
        api,
        message,
        { caption: "Hiện không có người nào được ưu tiên xử lý lệnh trong tin nhắn riêng." },
        600000
      );
    }
    return;
  }

  if (message.type === MessageType.GroupMessage) {
    if (!mentions || mentions.length === 0) {
      const caption = "Vui lòng đề cập (@mention) người dùng cần thêm/xóa trong danh sách phản hồi tin nhắn riêng.";
      await sendMessageQuery(api, message, caption);
      return;
    }

    const tempCaption = "danh sách ưu tiên phản hồi riêng khi dùng lệnh";
    for (const mention of mentions) {
      const targetId = mention.uid;
      const targetName = message.data.content.substring(mention.pos, mention.pos + mention.len).replace("@", "");

      if (action === "add") {
        if (!managerData.listAcceptUseCommandPrivate.includes(targetId)) {
          managerData.listAcceptUseCommandPrivate.push(targetId);
          await sendMessageComplete(api, message, `Đã thêm ${targetName} vào ${tempCaption}`);
        } else {
          await sendMessageWarning(api, message, `${targetName} đã nằm trong ${tempCaption}.`);
        }
      } else if (action === "remove") {
        const index = managerData.listAcceptUseCommandPrivate.indexOf(targetId);
        if (index !== -1) {
          managerData.listAcceptUseCommandPrivate.splice(index, 1);
          await sendMessageComplete(api, message, `Đã xóa ${targetName} khỏi ${tempCaption}.`);
        } else {
          await sendMessageWarning(api, message, `${targetName} không nằm trong ${tempCaption}.`);
        }
      }
      managerDataCache.setChanged(botId);
    }
  } else {
    const newStatus =
      action === "add"
        ? true
        : action === "remove"
          ? false
          : !managerData.listAcceptUseCommandPrivate.includes(threadId);
    if (newStatus && !managerData.listAcceptUseCommandPrivate.includes(threadId)) {
      managerData.listAcceptUseCommandPrivate.push(threadId);
    } else if (!newStatus && managerData.listAcceptUseCommandPrivate.includes(threadId)) {
      managerData.listAcceptUseCommandPrivate = managerData.listAcceptUseCommandPrivate.filter((id) => id !== threadId);
    }
    managerDataCache.setChanged(botId);
    const statusText = newStatus ? "bật" : "tắt";
    const caption = `Tiếp nhận lệnh trong tin nhắn riêng tư đã được ${statusText} tại đây!`;
    await sendMessageStateQuote(api, message, caption, newStatus, 300000);
    return;
  }
}