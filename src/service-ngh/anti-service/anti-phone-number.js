import { MessageMention, MessageType } from "zlbotngh";
import schedule from "node-schedule";
import { sendMessageStateQuote } from "../chat-zalo/chat-style/chat-style.js";
import { isInWhiteList } from "./white-list.js";
import { removeMention } from "../../utils/format-util.js";
import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PHONE_WHITELIST_FILE = path.join(__dirname, "phone-whitelist.json");
const CACHE_TTL = 5 * 60 * 1000;
let phoneSettingsCache = {};
let lastCacheUpdate = 0;

const phoneRegex = /0[\d.\s]{9,12}\b/g;
const kickedUsers = new Set();

let phoneSendCount = {};
let phoneSendTime = {};

async function readPhoneSettings() {
  const now = Date.now();
  if (now - lastCacheUpdate < CACHE_TTL) {
    return phoneSettingsCache;
  }

  try {
    const data = await fs.readFile(PHONE_WHITELIST_FILE, "utf8");
    const parsedData = JSON.parse(data) || {};
    
    Object.keys(parsedData).forEach(groupId => {
      if (!parsedData[groupId].patterns) {
        parsedData[groupId] = {
          patterns: Array.isArray(parsedData[groupId]) ? parsedData[groupId] : []
        };
      }
    });

    phoneSettingsCache = parsedData;
    lastCacheUpdate = now;
    return parsedData;
  } catch (error) {
    if (error.code === "ENOENT") {
      const emptyObject = {};
      await fs.mkdir(path.dirname(PHONE_WHITELIST_FILE), { recursive: true });
      await fs.writeFile(PHONE_WHITELIST_FILE, JSON.stringify(emptyObject, null, 2));
      return emptyObject;
    }
    return {};
  }
}

async function writePhoneSettings(settings) {
  await fs.writeFile(PHONE_WHITELIST_FILE, JSON.stringify(settings, null, 2));
  phoneSettingsCache = settings;
  lastCacheUpdate = Date.now();
}

function normalizePhone(phone) {
  if (!phone || typeof phone !== 'string') return '';
  return phone.replace(/\D/g, '');
}

function isWhitelisted(phone, whitelistedPatterns) {
  if (!whitelistedPatterns.length) return false;
  const normalized = normalizePhone(phone);
  return whitelistedPatterns.some(pattern => normalized.includes(pattern));
}

export async function handleAntiPhoneNumber(api, message, groupSettings) {
  const threadId = message.threadId;
  const content = removeMention(message);
  const parts = content.split(" ");
  const subcommand = parts[1]?.toLowerCase();
  const phoneSettings = await readPhoneSettings();
  if (!phoneSettings[threadId]) {
    phoneSettings[threadId] = {
      patterns: []
    };
  }

  if (subcommand === "add" && parts[2]) {
    const pattern = normalizePhone(parts[2]);
    if (!phoneSettings[threadId].patterns.includes(pattern)) {
      phoneSettings[threadId].patterns.push(pattern);
      await writePhoneSettings(phoneSettings);
      await sendMessageStateQuote(api, message, `Đã thêm "${pattern}" vào danh sách trắng số điện thoại.`, true, 300000);
      return true;
    } else {
      await sendMessageStateQuote(api, message, `"${pattern}" đã có trong danh sách trắng số điện thoại.`, false, 300000);
      return false;
    }
  } else if (subcommand === "remove" && parts[2]) {
    const pattern = normalizePhone(parts[2]);
    if (phoneSettings[threadId].patterns.includes(pattern)) {
      phoneSettings[threadId].patterns = phoneSettings[threadId].patterns.filter(p => p !== pattern);
      if (phoneSettings[threadId].patterns.length === 0) {
        delete phoneSettings[threadId];
      }
      await writePhoneSettings(phoneSettings);
      await sendMessageStateQuote(api, message, `Đã xóa "${pattern}" khỏi danh sách trắng số điện thoại.`, true, 300000);
      return true;
    } else {
      await sendMessageStateQuote(api, message, `"${pattern}" không tồn tại trong danh sách trắng số điện thoại.`, false, 300000);
      return false;
    }
  } else if (subcommand === "list") {
    const patterns = phoneSettings[threadId]?.patterns || [];
    const caption = patterns.length > 0
      ? `Danh sách số điện thoại bỏ qua:\n${patterns.map((p, i) => `${i + 1}. ${p}`).join("\n")}`
      : "Hiện không có số điện thoại nào trong danh sách trắng.";
    await sendMessageStateQuote(api, message, caption, patterns.length > 0, 300000);
    return false;
  } else if (subcommand === "clearall") {
    if (phoneSettings[threadId]?.patterns?.length > 0) {
      phoneSettings[threadId].patterns = [];
      delete phoneSettings[threadId];
      await writePhoneSettings(phoneSettings);
      await sendMessageStateQuote(api, message, `Đã xóa tất cả số điện thoại khỏi danh sách trắng.`, true, 300000);
      return true;
    } else {
      await sendMessageStateQuote(api, message, `Danh sách trắng hiện đang rỗng.`, false, 300000);
      return false;
    }
  } else {
    if (!groupSettings[threadId]) {
      groupSettings[threadId] = {};
    }
    const status = parts[1]?.toLowerCase();
    const newStatus =
      status === "on"
        ? true
        : status === "off"
          ? false
          : !groupSettings[threadId].antiPhoneNumber;
    groupSettings[threadId].antiPhoneNumber = newStatus;
    const statusText = newStatus ? "bật" : "tắt";
    const caption = `Chức năng chống gửi số điện thoại đã được ${statusText}!`;
    await sendMessageStateQuote(api, message, caption, newStatus, 300000);
    return true;
  }
}

export async function antiPhoneNumber(api, message, isAdminBox, groupSettings, botIsAdminBox, isSelf) {
  const threadId = message.threadId;
  const senderId = message.data.uidFrom;
  const senderName = message.data.dName;

  if (
    !botIsAdminBox ||
    isAdminBox ||
    isSelf ||
    !groupSettings[threadId]?.antiPhoneNumber
  ) {
    return false;
  }

  let content = message.data.content;
  if (typeof content === 'object' && content !== null) {
    content = content.caption || content.title || JSON.stringify(content);
  }
  if (typeof content !== 'string') {
    content = String(content || '');
  }

  const isUserWhiteList = isInWhiteList(groupSettings, threadId, senderId);
  const phoneSettings = await readPhoneSettings();
  const whitelistedPatterns = phoneSettings[threadId]?.patterns || [];

  if (isUserWhiteList) {
    return false;
  }

  const matches = content.match(phoneRegex);
  if (!matches) {
    return false;
  }

  const validPhones = matches.filter(phone => {
    const digitsOnly = normalizePhone(phone);
    return digitsOnly.length === 10 || digitsOnly.length === 11;
  });

  if (validPhones.length === 0) {
    return false;
  }

  if (!validPhones.some(phone => isWhitelisted(phone, whitelistedPatterns))) {
    try {
      const deleteResult = await api.deleteMessage(message, false);
      if (deleteResult && deleteResult.status === 0) {
        const warningCount = await sendWarningMessage(api, message, senderId, senderName, threadId);
        if (warningCount >= 3) {
          await handleViolationDetected(api, message, threadId, senderId, senderName);
        }
        return true;
        } else {
          await api.sendMessage(
            {
              msg: `Không thể xóa tin nhắn chứa số điện thoại của ${senderName} (có thể bot cần quyền admin).`,
              quote: message,
              ttl: 300000,
            },
            threadId,
            MessageType.GroupMessage
          );
          return false;
        }
    } catch (error) {
      return false;
    }
  }

  return false;
}

async function sendWarningMessage(api, message, senderId, senderName, threadId) {
  try {
    if (!phoneSendCount[senderId]) {
      phoneSendCount[senderId] = 0;
      phoneSendTime[senderId] = Date.now();
    }

    phoneSendCount[senderId]++;
    const currentTime = Date.now();

    if (currentTime - phoneSendTime[senderId] > 60 * 1000) {
      phoneSendCount[senderId] = 1;
      phoneSendTime[senderId] = currentTime;
    }

    let caption = `⚠️ Cảnh cáo ${senderName}!\nỞ đây cấm gửi số điện thoại!`;
    if (phoneSendCount[senderId] === 2) {
      caption = `⚠️ Cảnh cáo ${senderName}!\nNgừng gửi số điện thoại, trước khi bị chặn khỏi nhóm!`;
    }

    await api.sendMessage(
      {
        msg: caption,
        mentions: [MessageMention(senderId, senderName.length, "⚠️ Cảnh cáo ".length)],
        ttl: 300000,
      },
      threadId,
      MessageType.GroupMessage
    );

    return phoneSendCount[senderId];
  } catch (error) {
    return 0;
  }
}

async function handleViolationDetected(api, message, threadId, senderId, senderName) {
  try {
    if (kickedUsers.has(senderId)) {
      return;
    }
    kickedUsers.add(senderId);
    await api.blockUsers(threadId, [senderId]);


    delete phoneSendCount[senderId];
    delete phoneSendTime[senderId];
  } catch (error) {
  }

  setTimeout(() => {
    kickedUsers.delete(senderId);
  }, 5000);
}

schedule.scheduleJob("*/30 * * * *", () => {
  const currentTime = Date.now();
  for (const senderId in phoneSendTime) {
    if (currentTime - phoneSendTime[senderId] > 60 * 1000 * 30) {
      delete phoneSendCount[senderId];
      delete phoneSendTime[senderId];
    }
  }
});
