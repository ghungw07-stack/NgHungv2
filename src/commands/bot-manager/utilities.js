import { MessageType, ThreadType, ReportReason } from "../../api-zalo/index.js";
import { getCommandConfig, getManagerCommandConfig, getManagerCommandCustomConfig, isAdmin } from "../../index.js";
import { scoldMessages } from "../../service-ngh/chat-bot/scold-user/scold-user.js";
import {
  sendMessageFailed,
  sendMessageFromSQL,
  sendMessageStateQuote,
  sendMessageComplete,
  sendMessageQuery,
  sendMessageWarning,
  sendMessageImageTag,
} from "../../service-ngh/chat-zalo/chat-style/chat-style.js";
import { getUserInfoBasic, getUsersInfoBasic } from "../../service-ngh/info-service/user-info.js";
import { getGlobalPrefix } from "../../service-ngh/service.js";
import { deepParseJSON, deepStringifyJSON, removeMention } from "../../utils/format-util.js";
import { writeCommandConfig } from "../../utils/io-json.js";
import { readFileSync, writeFileSync } from "../../utils/util.js";
import { getMessageCache, markMessageUndo } from "../../utils/message-cache.js";
import { checkAdminLevelHighest, permissionLevels } from "../command.js";
import { getPermissionCommandName } from "../manager-command/set-command.js";
import { getContent } from "../../utils/format-util.js";
import fs from 'fs/promises';  
import fsSync from 'fs';       
import path from 'path';
import { Worker } from 'worker_threads';
import { fileURLToPath } from 'url';
import axios from 'axios';
import { getGroupInfoData } from "../../service-ngh/info-service/group-info.js";
import { createListImage } from "../../utils/canvas/list-form-v1.js";
import * as cv from "../../utils/canvas/index.js";
import { createCanvas, loadImage } from "canvas";
import { tempDir } from "../../utils/io-json.js";
import { randomIDTemp, FONT_MAIN } from "../../utils/format-util.js";
import { createAvatarListCanvas } from "../../utils/canvas/avatar-list-canvas.js";

const SENDTASK_SUPPORTED_TYPES = [
  "sendTaskGirlVideo", "sendTaskGirlVideo:anime", "sendTaskGirlVideo:sexy",
  "sendTaskGirlVideo:cosplay", "sendTaskVideo", "sendTaskMusic",
  "sendTaskWeather", "sendTaskCalendar", "analyzeGroupInteractions",
];

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const friendRequestCache = {};
const groupInviteCache = {};
const friendBlockListCache = {};

function getSettingsFilePath(botId) {
  const logDir = path.join(process.cwd(), "logs");
  const loggingFolderDir = path.join(logDir, botId);
  return path.join(loggingFolderDir, "account-settings.json");
}

function loadSettings(botId) {
  try {
    const filePath = getSettingsFilePath(botId);
    const data = readFileSync(filePath);
    return JSON.parse(data);
  } catch (error) {
    return {};
  }
}

function saveSettings(botId, settings) {
  try {
    const filePath = getSettingsFilePath(botId);
    const dir = path.dirname(filePath);
    if (!fsSync.existsSync(dir)) {
      fsSync.mkdirSync(dir, { recursive: true });
    }
    writeFileSync(filePath, JSON.stringify(settings, null, 2));
  } catch (error) {
    console.error(`Error saving settings for bot ${botId}:`, error);
  }
}

async function downloadFile(url, filePath) {
  if (typeof fsSync.createWriteStream !== 'function') {
    throw new Error('createWriteStream is not a function. Check fsSync import.');
  }
  
  const writer = fsSync.createWriteStream(filePath);  

  try {
    const response = await axios({ 
      url, 
      method: 'GET', 
      responseType: 'stream',
      timeout: 15000,
      validateStatus: (status) => status < 400
    });

    return new Promise((resolve, reject) => {
      let fileSize = 0;
      const maxSize = 5 * 1024 * 1024; 
      
      response.data.on('data', (chunk) => {
        fileSize += chunk.length;
        if (fileSize > maxSize) {
          writer.destroy(new Error('File too large (max 5MB)'));
        }
      });

      response.data.pipe(writer);
      
      writer.on('finish', () => {

        resolve();
      });
      
      writer.on('error', (err) => {
        console.error('❌ Writer error:', err);
        reject(err);
      });
      
      response.data.on('error', (err) => {
        console.error('❌ Response stream error:', err);
        reject(err);
      });
    });
  } catch (axiosError) {
    console.error('❌ Axios error:', axiosError.message);
    throw axiosError;
  }
}

async function fileExists(filePath) {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

let activeTodo = false;
const TIME_TO_LIVE = 86400000;

export async function deleteMessageCustomer(api, message, isDeleteMsgAdmin) {
  const threadId = message.threadId;
  const botId = api.getBotId();
  try {
    let msgOrigin = null;
    if (isDeleteMsgAdmin) {
      const msgGroupCache = await getMessageCache(botId, threadId);
      let clientIdCustomer = message.data.cliMsgId;
      let tsTemp = 0;
      if (msgGroupCache) {
        for (const [msgId, msg] of Object.entries(msgGroupCache)) {
          if (msg.uidFrom === botId) {
            if (msg.cliMsgId !== clientIdCustomer && msg.ts > tsTemp) {
              clientIdCustomer = msg.cliMsgId;
              tsTemp = msg.ts;
            }
            if (!msgOrigin) {
              msgOrigin = msg;
            }
          }
        }
      }
    }
    await api.deleteMessage(message, false, msgOrigin?.msgId);
    return true;
  } catch {
    try {
      let msgOrigin = null;
      const msgGroupCache = await getMessageCache(botId, threadId);
      let clientIdCustomer = message.data.cliMsgId;
      let tsTemp = 0;
      if (msgGroupCache) {
        for (const [msgId, msg] of Object.entries(msgGroupCache)) {
          if (msg.uidFrom === botId) {
            if (msg.cliMsgId !== clientIdCustomer && msg.ts > tsTemp) {
              clientIdCustomer = msg.cliMsgId;
              tsTemp = msg.ts;
            }
            if (!msgOrigin) {
              msgOrigin = msg;
            }
          }
        }
      }
      await api.deleteMessage(message, false, msgOrigin?.msgId);
      return true;
    } catch {}
  }
  return false;
}

// Map: threadId → Worker instance
const activeNgh = new Map();

export async function handleNghCommand(api, message) {
  const args = message.data?.content?.split(" ") || [];
  const threadId = message.threadId;

  const cmdUsed = args[0]?.toLowerCase() || "";
  if (!cmdUsed.endsWith("ngh...")) {
    await api.sendMessage({ msg: "Nguyễn Gia Hưng nè", quote: message }, threadId, message.type);
    return;
  }

  // Lệnh stop
  if (args[1]?.toLowerCase() === "stop") {
    const worker = activeNgh.get(threadId);
    if (worker) {
      worker.postMessage("stop");
      setTimeout(() => worker.terminate(), 500);
      activeNgh.delete(threadId);
    }
    return;
  }

  const quote = message.data?.quote;
  if (!quote) {
    await api.sendMessage({ msg: "Nguyễn Gia Hưng nè", quote: message }, threadId, message.type);
    return;
  }

  const msgId = quote.msgId || quote.globalMsgId || quote.id;
  const cliMsgId = quote.cliMsgId || quote.clientMsgId || quote.clientId;
  const ownerId = quote.ownerId || quote.uidFrom || quote.fromId || quote.senderId || quote.userId;
  if (!msgId || !cliMsgId) {
    await api.sendMessage({ msg: "Nguyễn Gia Hưng nè", quote: message }, threadId, message.type);
    return;
  }

  const targetMessage = {
    type: message.type,
    threadId: message.threadId,
    data: {
      ...quote,
      msgId: String(msgId),
      cliMsgId: String(cliMsgId),
      uidFrom: String(ownerId || message.data.uidFrom),
    },
  };

  // Dừng worker cũ nếu có
  const prevWorker = activeNgh.get(threadId);
  if (prevWorker) {
    prevWorker.postMessage("stop");
    setTimeout(() => prevWorker.terminate(), 500);
  }

  // Pre-alloc junk buffer 1 lần, tái sử dụng (20KB mỗi lượt)
  const junkPayload = Buffer.alloc(20 * 1024, "NGH_JUNK_PAYLOAD");

  // Spawn worker thread riêng → loop phát action chạy trong thread riêng
  const workerPath = path.join(__dirname, "ngh-flood-worker.js");
  const worker = new Worker(workerPath, { type: "module" });

  // Concurrency limiter: tối đa 250 API call pending cùng lúc
  let pending = 0;
  const MAX_PENDING = 250;

  worker.on("message", (msg) => {
    if (msg.type !== "action") return;
    if (pending >= MAX_PENDING) return; // bỏ qua nếu đang bận, tránh tích lũy promises
    pending++;
    const done = () => { pending = Math.max(0, pending - 1); };
    const safeCall = (promise) => {
      if (promise && typeof promise.then === "function") {
        promise.then(done, done);
      } else {
        done();
      }
    };

    const sendJunk = () => {
      if (api.listener?.ws && api.listener.ws.readyState === 1) {
        try { api.listener.ws.send(junkPayload, () => {}); } catch (_) {}
      }
    };

    try {
      sendJunk();
      switch (msg.action) {
        case "reaction_LIKE":   safeCall(api.addReaction("LIKE", targetMessage)); break;
        case "reaction_HAHA":   safeCall(api.addReaction("HAHA", targetMessage)); break;
        case "reaction_UNDO":   safeCall(api.addReaction("UNDO", targetMessage)); break;
        case "delete":          safeCall(api.deleteMessage(targetMessage, false)); break;
        case "undo":            safeCall(api.undoMessage(message)); break;
        case "heartbeat":       try { api.listener?.sendHeartbeat?.(); } catch (_) {} done(); break;
        case "getRecent":       safeCall(api.getRecentMessages(threadId, 10000000000000000, 1)); break;
        case "getInfo":         safeCall(getGroupInfoData(api, threadId)); break;
        case "junk":            done(); break;
        default: done(); break;
      }
    } catch (_) {
      done();
    }
  });

  worker.on("error", () => {});
  worker.on("exit", () => { if (activeNgh.get(threadId) === worker) activeNgh.delete(threadId); });

  activeNgh.set(threadId, worker);
}


export function stopTodo() {
  activeTodo = false;
}

// export async function handleChangeGroupLink(api, message) {
//   try {
//     const threadId = message.threadId;
//     await api.changeGroupLink(threadId);
//   } catch (error) {
//     const result = {
//       success: false,
//       message: `Lỗi khi đổi link nhóm: ${error.message}`,
//     };
//     await sendMessageFailed(api, message, result);
//   }
// }

export async function handleUndoMessage(api, message) {
  try {
    const content = removeMention(message);
    const parts = content.trim().split(/\s+/);
    const botId = api.getBotId();
    const threadId = message.threadId;

    let count = 1;
    if (parts.length > 1) {
      const parsedCount = parseInt(parts[1]);
      if (!isNaN(parsedCount) && parsedCount > 0) {
        count = Math.min(parsedCount, 500); 
      }
    }

    if (message.data?.quote) {
      await api.undoMessage(message);
      return;
    }

    const messageCache = await getMessageCache(botId, threadId);
    if (!messageCache || Object.keys(messageCache).length === 0) {
      await sendMessageFromSQL(
        api,
        message,
        {
          success: false,
          message: `Không tìm thấy tin nhắn nào để thu hồi.`,
        },
        false,
        30000
      );
      return;
    }

    const messagesInThread = Object.values(messageCache);
    const botMessages = messagesInThread
      .filter((msg) => {
        return (
          msg.uidFrom === botId &&
          !msg.isUndo &&
          msg.msgId &&
          msg.cliMsgId &&
          msg.msgType
        );
      })
      .sort((a, b) => {
        const timeA = a.timestamp || a.ts || 0;
        const timeB = b.timestamp || b.ts || 0;
        return timeB - timeA;
      })
      .slice(0, count);

    if (botMessages.length === 0) {
      await sendMessageFromSQL(
        api,
        message,
        {
          success: false,
          message: `Không tìm thấy tin nhắn nào của bot để thu hồi.`,
        },
        false,
        30000
      );
      return;
    }

    let successCount = 0;
    let failCount = 0;

    for (const msg of botMessages) {
      try {
        const messageToUndo = {
          ...message,
          data: {
            ...message.data,
            quote: {
              globalMsgId: msg.msgId,
              cliMsgId: msg.cliMsgId,
            },
          },
        };

        await api.undoMessage(messageToUndo);
        successCount++;
        
        if (messageCache[msg.msgId]) {
          messageCache[msg.msgId].isUndo = true;
          await markMessageUndo(botId, threadId, msg.msgId);
        }

        if (botMessages.length > 1) {
          await new Promise((resolve) => setTimeout(resolve, 20));
        }
      } catch (error) {
        failCount++;
        console.error(`Lỗi khi undo tin nhắn ${msg.msgId}:`, error);
      }
    }

    let resultMessage = "";
    if (successCount > 0 && failCount === 0) {
      resultMessage = `✅ Đã thu hồi ${successCount} tin nhắn thành công!`;
    } else if (successCount > 0 && failCount > 0) {
      resultMessage = `⚠️ Đã thu hồi ${successCount} tin nhắn, ${failCount} tin nhắn thất bại.`;
    } else {
      resultMessage = `❌ Không thể thu hồi tin nhắn nào.`;
    }

    await sendMessageFromSQL(
      api,
      message,
      {
        success: successCount > 0,
        message: resultMessage,
      },
      false,
      30000
    );
  } catch (error) {
    await sendMessageFromSQL(
      api,
      message,
      {
        success: false,
        message: `Lỗi khi xử lý lệnh undo: ${error.message}`,
      },
      false,
      30000
    );
  }
}

export async function handleSendToDo(api, message, isAdminLevelHighest) {
  const content = removeMention(message);

  const mentions = message.data.mentions;
  const senderId = message.data.uidFrom;
  const senderName = message.data.dName;
  const prefix = getGlobalPrefix(api.getBotId());

  const parts = content.split("_");

  if (parts.length == 2 && parts[1].toLowerCase() === "stop") {
    if (activeTodo) {
      stopTodo();
      await sendMessageFromSQL(
        api,
        message,
        {
          success: true,
          message: "Đã dừng tất cả các todo đang chạy!",
        },
        false,
        30000
      );
    } else {
      await sendMessageFromSQL(
        api,
        message,
        {
          success: false,
          message: "Không có todo nào đang chạy!",
        },
        false,
        30000
      );
    }
    return;
  }

  if (parts.length < 2) {
    await sendMessageFromSQL(
      api,
      message,
      {
        success: false,
        message:
          `Hướng dẫn dùng lệnh:\n` +
          `${prefix}todo_[Nội dung công việc]_[Số lần] @user\n` +
          `hoặc: ${prefix}todo_[Nội dung công việc]_[Số lần]_[ID người nhận]`,
      },
      false,
      30000
    );
    return;
  }

  try {
    let todoContent = parts[1].trim();

    if (todoContent.length === 0) {
      await sendMessageFromSQL(
        api,
        message,
        {
          success: false,
          message: `Không Có Nội Dung Công Việc!`,
        },
        false,
        30000
      );
      return;
    }

    let repeatCount = 1;
    let userIds = [];

    if (parts.length >= 3) {
      const count = parseInt(parts[2]);
      if (!isNaN(count)) {
        repeatCount = count;
      }
    }

    if (!isAdminLevelHighest && repeatCount > 3) {
      repeatCount = 3;
    }

    if (mentions && Object.keys(mentions).length > 0) {
      userIds = Object.values(mentions).map((mention) => mention.uid);
    } else if (parts.length >= 4) {
      const specificId = parts[3].trim();
      if (specificId) {
        userIds = [specificId];
      }
    } else {
      await sendMessageFromSQL(
        api,
        message,
        {
          success: false,
          message: `Không Tìm Thấy Mục Tiêu Để Giao Việc!`,
        },
        false,
        30000
      );
      return;
    }

    const userInfo = await getUserInfoBasic(api, userIds[0]);

    const targetText =
      userIds.length === 1 && userIds[0] === senderId
        ? "bản thân"
        : userIds.length === 1
        ? `người dùng ${userInfo.displayName}`
        : `${userIds.length} người`;

    await sendMessageFromSQL(
      api,
      message,
      {
        success: true,
        message: `Đã giao việc "${todoContent}" ${repeatCount} lần cho ${targetText}`,
      },
      false,
      30000
    );

    activeTodo = true;
    for (let i = 0; i < repeatCount; i++) {
      if (!activeTodo) {
        break;
      }
      await api.sendTodo(message, todoContent, userIds, -1, todoContent);
    }
  } catch (error) {
    await sendMessageFromSQL(
      api,
      message,
      {
        success: false,
        message: `Lỗi khi giao việc: ${error.message}`,
      },
      false,
      30000
    );
  }
}

/**
 * Tính độ tương đồng giữa 2 chuỗi sử dụng thuật toán Levenshtein Distance
 */
function levenshteinDistance(str1, str2) {
  const m = str1.length;
  const n = str2.length;
  const dp = Array(m + 1)
    .fill()
    .map(() => Array(n + 1).fill(0));

  for (let i = 0; i <= m; i++) {
    dp[i][0] = i;
  }
  for (let j = 0; j <= n; j++) {
    dp[0][j] = j;
  }

  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      if (str1[i - 1] === str2[j - 1]) {
        dp[i][j] = dp[i - 1][j - 1];
      } else {
        dp[i][j] = Math.min(dp[i - 1][j - 1] + 1, dp[i - 1][j] + 1, dp[i][j - 1] + 1);
      }
    }
  }

  return dp[m][n];
}

/**
 * Tìm các lệnh tương tự dựa trên độ tương đồng của chuỗi
 */
function findSimilarCommands(command, availableCommands, threshold = 0.6) {
  const similarCommands = [];
  const commandLower = command.toLowerCase();
  const commandChars = commandLower.split("");
  const commonShortcuts = {
    dy: "daily",
    nt: "nongtrai",
    tx: "taixiu",
    kbb: "keobuabao",
    tt: "thongtin",
    bg: "background",
  };

  for (const cmd of availableCommands) {
    const cmdNameLower = cmd.name.toLowerCase();

    const isStartsWith = cmdNameLower.startsWith(commandLower);

    const isCommonShortcut = commonShortcuts[commandLower] === cmdNameLower;

    let matchesSequence = true;
    let lastIndex = -1;
    for (const char of commandChars) {
      const index = cmdNameLower.indexOf(char, lastIndex + 1);
      if (index === -1) {
        matchesSequence = false;
        break;
      }
      lastIndex = index;
    }

    const distance = levenshteinDistance(commandLower, cmdNameLower);
    const similarity = 1 - distance / Math.max(command.length, cmd.name.length);

    if (isStartsWith || isCommonShortcut || matchesSequence || similarity >= threshold) {
      similarCommands.push({
        command: cmd,
        similarity: isStartsWith ? 1 : isCommonShortcut ? 0.95 : matchesSequence ? 0.9 : similarity,
      });
    }
  }

  return similarCommands
    .sort((a, b) => {
      const permissionDiff = permissionLevels[a.permission] - permissionLevels[b.permission];
      if (permissionDiff !== 0) return permissionDiff;

      return b.similarity - a.similarity;
    })
    .slice(0, 5)
    .map((item) => item.command);
}

/**
 * Kiểm tra và gợi ý lệnh khi không tìm thấy command
 */
export async function checkNotFindCommand(api, message, command, availableCommands) {
  const prefix = getGlobalPrefix(api.getBotId());

  if (!command || command.trim() === "") {
    const managerData = api.apiManager?.getDataManager ? api.apiManager.getDataManager() : null;
    const emptyPrefixSticker = managerData?.emptyPrefixSticker;

    if (emptyPrefixSticker) {
      try {
        if (emptyPrefixSticker.kind === "custom" && emptyPrefixSticker.staticUrl && emptyPrefixSticker.animationUrl) {
          await api.sendCustomSticker(
            message,
            emptyPrefixSticker.staticUrl,
            emptyPrefixSticker.animationUrl,
            emptyPrefixSticker.width,
            emptyPrefixSticker.height
          );
        } else if (emptyPrefixSticker.kind === "image" && emptyPrefixSticker.staticUrl) {
          await api.sendImage(emptyPrefixSticker.staticUrl, message, "", 0);
        } else if (emptyPrefixSticker.id && emptyPrefixSticker.cateId) {
          await api.sendSticker(
            {
              id: emptyPrefixSticker.id,
              cateId: emptyPrefixSticker.cateId,
              type: emptyPrefixSticker.type,
            },
            message.threadId,
            message.type
          );
        }
      } catch (error) {
        console.log("[checkNotFindCommand] Lỗi khi gửi sticker mặc định:", error);
        // Vẫn tiếp tục gửi text hướng dẫn bên dưới dù gửi sticker thất bại
      }
    }

    await sendMessageFromSQL(
      api,
      message,
      {
        success: false,
        message:
          `Nếu Mày Thắc Mắc Tao Có Những Lệnh Gì, Hãy...\n` +
          `${prefix}help - Xem các lệnh cơ bản\n` +
          `${prefix}game - Xem các lệnh game\n` +
          `${prefix}command - Xem toàn bộ danh sách lệnh có sẵn`,
      },
      false,
      30000
    );
    return;
  }

  const similarCommands = findSimilarCommands(command, availableCommands);

  if (similarCommands.length > 0) {
    await sendMessageFromSQL(
      api,
      message,
      {
        success: false,
        message:
          `Không tìm thấy lệnh "${command}"\n` +
          `Có phải bạn muốn dùng:\n` +
          similarCommands.map((cmd) => `${prefix}${cmd.name} [${getPermissionCommandName(cmd)}]`).join("\n"),
      },
      false,
      30000
    );
  } else {
    await sendMessageFromSQL(
      api,
      message,
      {
        success: false,
        message:
          `Không tìm thấy lệnh "${command}". Vui lòng sử dụng:\n` +
          `${prefix}help - Xem hướng dẫn sử dụng\n` +
          `${prefix}game - Xem hướng dẫn chơi game\n` +
          `${prefix}command - Xem danh sách lệnh có sẵn`,
      },
      false,
      30000
    );
  }
}

/**
 * Xử lý thêm alias cho command
 */
export async function handleAliasCommand(api, message, commandParts) {
  const botId = api.getBotId();
  const senderId = message.data.uidFrom;
  const isAdminLeverHigh = isAdmin(botId, senderId);
  const prefix = getGlobalPrefix(botId);
  const subCommand = commandParts[1]?.toLowerCase();
  const cmdName = commandParts[2]?.toLowerCase();
  const aliasName = commandParts[3]?.toLowerCase();

  if (!subCommand) {
    await handleListAlias(api, message);
    return;
  }

  switch (subCommand) {
    case "add":
      if (!(await checkAdminLevelHighest(api, message, isAdminLeverHigh))) return;
      if (!cmdName || !aliasName) {
        await sendMessageFromSQL(
          api,
          message,
          {
            success: false,
            message: `Cú pháp không đúng. Vui lòng sử dụng:\n${prefix}alias add [tên lệnh] [tên alias]`,
          },
          false,
          300000
        );
        return;
      }
      await handleAddAlias(api, message, cmdName, aliasName);
      break;

    case "remove":
      if (!(await checkAdminLevelHighest(api, message, isAdminLeverHigh))) return;
      if (!cmdName || !aliasName) {
        await sendMessageFromSQL(
          api,
          message,
          {
            success: false,
            message: `Cú pháp không đúng. Vui lòng sử dụng:\n${prefix}alias remove [tên lệnh] [tên alias]`,
          },
          false,
          300000
        );
        return;
      }
      await handleRemoveAlias(api, message, cmdName, aliasName);
      break;

    case "list":
      await handleListAlias(api, message, cmdName);
      break;

    default:
      await sendMessageFromSQL(
        api,
        message,
        {
          success: false,
          message:
            `Cú pháp không đúng. Sử dụng:\n` +
            `${prefix}alias add [tên lệnh] [tên alias] - Thêm alias\n` +
            `${prefix}alias remove [tên lệnh] [tên alias] - Xóa alias\n` +
            `${prefix}alias list [tên lệnh] - Xem danh sách alias\n` +
            `${prefix}alias - Xem tất cả alias`,
        },
        false,
        300000
      );
      break;
  }
}

export async function handleAddAlias(api, message, commandName, aliasName) {
  try {
    const botId = api.getBotId();
    const isMainBot = api.apiManager.isMainBot;
    const commandConfig = getCommandConfig();
    const command = commandConfig.commands.find((cmd) => cmd.name === commandName);

    if (!command) {
      await sendMessageFromSQL(
        api,
        message,
        {
          success: false,
          message: `Không tìm thấy lệnh "${commandName}" để thêm alias`,
        },
        false,
        300000
      );
      return;
    }

    command.alias ??= [];

    if (isMainBot) {
      if (command.alias.includes(aliasName)) {
        await sendMessageFromSQL(
          api,
          message,
          {
            success: false,
            message: `Alias "${aliasName}" đã tồn tại cho lệnh "${commandName}"`,
          },
          false,
          300000
        );
        return;
      }

      const checkAliasExist = commandConfig.commands.find(
        (cmd) => cmd.name === aliasName || (cmd.alias && cmd.alias.includes(aliasName))
      );

      if (checkAliasExist) {
        await sendMessageFromSQL(
          api,
          message,
          {
            success: false,
            message: `Không thể thêm alias "${aliasName}" vì đã tồn tại như một lệnh hoặc alias khác của lệnh ${checkAliasExist.name}`,
          },
          false,
          300000
        );
        return;
      }

      command.alias.push(aliasName);
      writeCommandConfig(commandConfig);

      await sendMessageFromSQL(
        api,
        message,
        {
          success: true,
          message: `Đã thêm alias "${aliasName}" cho lệnh "${commandName}"`,
        },
        false,
        300000
      );
    } else {
      const customerCommand = getManagerCommandCustomConfig(botId, command.name);
      customerCommand.alias ??= [];
      if (command.alias.includes(aliasName) || customerCommand.alias.includes(aliasName)) {
        await sendMessageFromSQL(
          api,
          message,
          {
            success: false,
            message: `Alias "${aliasName}" đã tồn tại cho lệnh "${commandName}"`,
          },
          false,
          300000
        );
        return;
      }

      let commandConfigCustom = getManagerCommandConfig(botId);
      let checkAliasExist = commandConfig.commands.find(
        (cmd) => cmd.name === aliasName || (cmd.alias && cmd.alias.includes(aliasName))
      );
      checkAliasExist ??= Object.values(commandConfigCustom.customerCommand || {}).find(
        (cmd) => cmd.name === aliasName || (cmd.alias && cmd.alias.includes(aliasName))
      );

      if (checkAliasExist) {
        await sendMessageFromSQL(
          api,
          message,
          {
            success: false,
            message: `Không thể thêm alias "${aliasName}" vì đã tồn tại như một lệnh hoặc alias khác của lệnh ${checkAliasExist.name}`,
          },
          false,
          300000
        );
        return;
      }

      customerCommand.alias.push(aliasName);
      writeCommandConfig(commandConfig);

      await sendMessageFromSQL(
        api,
        message,
        {
          success: true,
          message: `Đã thêm alias "${aliasName}" cho lệnh "${commandName}"`,
        },
        false,
        300000
      );
    }
  } catch (error) {
    await sendMessageFromSQL(
      api,
      message,
      {
        success: false,
        message: `Lỗi khi thêm alias: ${error.message}`,
      },
      false,
      300000
    );
  }
}

/**
 * Xử lý xóa alias của command
 */
export async function handleRemoveAlias(api, message, commandName, aliasName) {
  try {
    const botId = api.getBotId();
    const isMainBot = api.apiManager.isMainBot;
    const commandConfig = getCommandConfig();
    const command = commandConfig.commands.find((cmd) => cmd.name === commandName);

    if (!command) {
      await sendMessageFromSQL(
        api,
        message,
        {
          success: false,
          message: `Không tìm thấy lệnh "${commandName}" để xóa alias`,
        },
        false,
        300000
      );
      return;
    }

    command.alias ??= [];

    if (isMainBot) {
      if (!command.alias.includes(aliasName)) {
        await sendMessageFromSQL(
          api,
          message,
          {
            success: false,
            message: `Không tìm thấy alias "${aliasName}" trong lệnh "${commandName}"`,
          },
          false,
          300000
        );
        return;
      }

      command.alias = command.alias.filter((a) => a !== aliasName);
      writeCommandConfig(commandConfig);

      await sendMessageFromSQL(
        api,
        message,
        {
          success: true,
          message: `Đã xóa alias "${aliasName}" khỏi lệnh "${commandName}"`,
        },
        false,
        300000
      );
    } else {
      const customerCommand = getManagerCommandCustomConfig(botId, command.name);
      customerCommand.alias ??= [];
      if (!command.alias.includes(aliasName) && !customerCommand.alias.includes(aliasName)) {
        await sendMessageFromSQL(
          api,
          message,
          {
            success: false,
            message: `Không tìm thấy alias "${aliasName}" trong lệnh "${commandName}"`,
          },
          false,
          300000
        );
        return;
      }

      if (command.alias.includes(aliasName)) {
        await sendMessageFromSQL(
          api,
          message,
          {
            success: false,
            message:
              `Alias "${aliasName}" được tổng quản trị bot cấp cao đặt cho lệnh "${commandName}"` +
              `\nChỉ có Bot Leader mới được phép gỡ alias "${aliasName}"`,
          },
          false,
          300000
        );
        return;
      }

      customerCommand.alias = customerCommand.alias.filter((a) => a !== aliasName);
      writeCommandConfig(commandConfig);

      await sendMessageFromSQL(
        api,
        message,
        {
          success: true,
          message: `Đã xóa alias "${aliasName}" khỏi lệnh "${commandName}"`,
        },
        false,
        300000
      );
    }
  } catch (error) {
    await sendMessageFromSQL(
      api,
      message,
      {
        success: false,
        message: `Lỗi khi xóa alias: ${error.message}`,
      },
      false,
      300000
    );
  }
}

/**
 * Xử lý hiển thị danh sách alias của command
 */
export async function handleListAlias(api, message, commandName) {
  try {
    const commandConfig = getCommandConfig();

    if (commandName) {
      const command = commandConfig.commands.find((cmd) => cmd.name === commandName);

      if (!command) {
        await sendMessageFromSQL(
          api,
          message,
          {
            success: false,
            message: `Không tìm thấy lệnh "${commandName}"`,
          },
          false,
          300000
        );
        return;
      }

      const aliases = command.alias || [];
      await sendMessageFromSQL(
        api,
        message,
        {
          success: true,
          message:
            aliases.length > 0
              ? `Danh sách alias của lệnh "${commandName}":\n${aliases.join(", ")}`
              : `Lệnh "${commandName}" không có alias nào`,
        },
        false,
        300000
      );
    } else {
      const aliasRows = commandConfig.commands
        .filter((cmd) => cmd.alias && cmd.alias.length > 0)
        .map((cmd) => `• ${cmd.name}: ${cmd.alias.join(", ")}`);

      if (aliasRows.length === 0) {
        await sendMessageFromSQL(api, message, { success: true, message: "Không có alias nào được cấu hình" }, false, 300000);
        return;
      }

      // Danh sách alias có thể vượt giới hạn độ dài một tin Zalo. Chia trang
      // thay vì gửi một khối lớn khiến API từ chối và người dùng thấy bot im lặng.
      const pages = [];
      let page = [];
      let pageLength = 0;
      for (const row of aliasRows) {
        if (page.length && pageLength + row.length + 1 > 1700) {
          pages.push(page);
          page = [];
          pageLength = 0;
        }
        page.push(row);
        pageLength += row.length + 1;
      }
      if (page.length) pages.push(page);

      for (let index = 0; index < pages.length; index++) {
        const header = `🏷️ DANH SÁCH ALIAS · Trang ${index + 1}/${pages.length}\n\n`;
        await api.sendMessage(
          { msg: header + pages[index].join("\n"), ttl: 300000 },
          message.threadId,
          message.type
        );
      }
    }
  } catch (error) {
    await sendMessageFromSQL(
      api,
      message,
      {
        success: false,
        message: `Lỗi khi hiển thị alias: ${error.message}`,
      },
      false,
      300000
    );
  }
}

export async function handleSendMessagePrivate(api, message, isAdminLevelHighest) {
  const content = removeMention(message);
  const mentions = message.data.mentions;
  const senderId = message.data.uidFrom;
  const prefix = getGlobalPrefix(api.getBotId());

  const parts = content.split("_");

  if (parts.length < 2) {
    await sendMessageFromSQL(
      api,
      message,
      {
        success: false,
        message:
          `Cú pháp không đúng. Vui lòng sử dụng:\n` +
          `${prefix}sendp_[Nội dung tin nhắn]_[Số lần] @user\n` +
          `hoặc: ${prefix}sendp_[Nội dung tin nhắn]_[Số lần]_[ID người nhận]`,
      },
      false,
      30000
    );
    return;
  }

  try {
    let smsContent = parts[1].trim();

    if (smsContent.length === 0) {
      await sendMessageFromSQL(
        api,
        message,
        {
          success: false,
          message: `Không có nội dung tin nhắn!`,
        },
        false,
        30000
      );
      return;
    }

    let repeatCount = 1;
    let userIds = [];

    if (parts.length >= 3) {
      const count = parseInt(parts[2]);
      if (!isNaN(count)) {
        repeatCount = count;
      }
    }

    if (!isAdminLevelHighest && repeatCount > 999) {
      repeatCount = 999;
    }

    if (mentions && Object.keys(mentions).length > 0) {
      userIds = Object.values(mentions).map((mention) => mention.uid);
    } else if (parts.length >= 4) {
      const specificId = parts[3].trim();
      if (specificId) {
        userIds = [specificId];
      }
    } else {
      await sendMessageFromSQL(
        api,
        message,
        {
          success: false,
          message: `Không tìm thấy người nhận!`,
        },
        false,
        30000
      );
      return;
    }

    const userInfo = await getUserInfoBasic(api, userIds[0]);

    const targetText =
      userIds.length === 1 && userIds[0] === senderId
        ? "bản thân"
        : userIds.length === 1
        ? `người dùng ${userInfo.displayName}`
        : `${userIds.length} người`;

    await sendMessageFromSQL(
      api,
      message,
      {
        success: true,
        message: `Đã bắt đầu send tin nhắn riêng "${smsContent}" ${repeatCount} lần cho ${targetText}`,
      },
      false,
      30000
    );

    let count = 0;
    let contentSend = smsContent;
    for (const userId of userIds) {
      for (let i = 0; i < repeatCount; i++) {
        if (smsContent === "scold") {
          contentSend = scoldMessages[count];
          count++;
          if (count >= scoldMessages.length) {
            count = 0;
          }
        }
        try {
          await api.sendMessageForward(
            {
              msg: contentSend,
            },
            userId,
            MessageType.DirectMessage,
            18000000
          );
        } catch (error) {
          console.error(`Lỗi khi gửi tin nhắn riêng cho ${userId}:`, error);
          continue;
        }
      }
    }

    await sendMessageFromSQL(
      api,
      message,
      {
        success: true,
        message: `Đã hoàn thành gửi tin nhắn riêng cho ${targetText}`,
      },
      false,
      30000
    );
  } catch (error) {
    await sendMessageFromSQL(
      api,
      message,
      {
        success: false,
        message: `Lỗi khi gửi tin nhắn riêng: ${error.message}`,
      },
      false,
      30000
    );
  }
}

export async function handleSendTaskCommand(api, message, groupSettings) {
  const content = removeMention(message);
  const input = content.trim().split(/\s+/).slice(1).join(" ");
  const [rawAction = "", ...rest] = input.split(/\s+/);
  const action = rawAction.toLowerCase();
  const threadId = message.threadId;

  if (!groupSettings[threadId]) {
    groupSettings[threadId] = {};
  }

  const help = `📋 *Danh sách các loại task hỗ trợ cấu hình:*\n${SENDTASK_SUPPORTED_TYPES.map((type) => `- *${type}*`).join("\n")}\n\n📌 *Cú pháp đặt lịch:*\n👉 sendtask custom <HH:MM> <loại_task> "<caption>"\n📌 *Đặt cho tất cả nhóm:*\n👉 sendtask customall <HH:MM> <loại_task> "<caption>"\n\n📌 *Quản lý:*\n- sendtask on/off\n- sendtask show\n- sendtask delete <HH:MM>\n- sendtask deleteall <HH:MM>\n- sendtask reset`;
  const ensureTasks = (settings) => {
    if (!Array.isArray(settings.customSendTasks)) settings.customSendTasks = [];
    return settings.customSendTasks;
  };
  const parseTask = () => {
    const match = rest.join(" ").match(/^(\d{2}:\d{2})\s+(\S+)(?:\s+["“](.*)["”])?$/s);
    if (!match) return null;
    const [, time, type, caption = ""] = match;
    const [hour, minute] = time.split(":").map(Number);
    if (hour > 23 || minute > 59 || !SENDTASK_SUPPORTED_TYPES.includes(type)) return null;
    return { time, type, caption: caption.trim() };
  };
  const isOwner = isAdmin(api.getBotId(), message.data.uidFrom);

  if (!action) {
    await sendMessageStateQuote(api, message, help, true, 300000);
    return false;
  }
  if (action === "on") {
    groupSettings[threadId].sendTask = true;
    await sendMessageStateQuote(api, message, "✅ Đã bật sendtask cho nhóm này.", true, 300000);
  } else if (action === "off") {
    groupSettings[threadId].sendTask = false;
    await sendMessageStateQuote(api, message, "⛔ Đã tắt sendtask cho nhóm này.", false, 300000);
  } else if (action === "show") {
    const tasks = ensureTasks(groupSettings[threadId]);
    const lines = tasks.length ? [...tasks].sort((a, b) => a.time.localeCompare(b.time)).map((t, i) => `${i + 1}. ${t.time} · ${t.type}${t.caption ? ` · “${t.caption}”` : ""}`) : ["Chưa có lịch tùy chỉnh."];
    await sendMessageStateQuote(api, message, `Sendtask: ${groupSettings[threadId].sendTask ? "BẬT" : "TẮT"}\n\n${lines.join("\n")}`, true, 300000);
    return false;
  } else if (action === "custom" || action === "customall") {
    const task = parseTask();
    if (!task) {
      await sendMessageStateQuote(api, message, `Sai cú pháp hoặc loại task.\n\n${help}`, false, 300000);
      return false;
    }
    if (action === "customall" && !isOwner) {
      await sendMessageStateQuote(api, message, "Chỉ admin cấp cao nhất được đặt lịch cho tất cả nhóm.", false, 300000);
      return false;
    }
    const targets = action === "customall" ? Object.values(groupSettings) : [groupSettings[threadId]];
    for (const settings of targets) {
      const tasks = ensureTasks(settings);
      const oldIndex = tasks.findIndex((item) => item.time === task.time);
      if (oldIndex >= 0) tasks[oldIndex] = task;
      else tasks.push(task);
      settings.sendTask = true;
    }
    await sendMessageStateQuote(api, message, `✅ Đã đặt ${task.type} lúc ${task.time}${action === "customall" ? " cho tất cả nhóm" : ""}.`, true, 300000);
  } else if (action === "delete" || action === "deleteall") {
    const time = rest[0];
    if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(time || "")) {
      await sendMessageStateQuote(api, message, "Cú pháp: sendtask delete <HH:MM>", false, 300000);
      return false;
    }
    if (action === "deleteall" && !isOwner) {
      await sendMessageStateQuote(api, message, "Chỉ admin cấp cao nhất được xóa lịch của tất cả nhóm.", false, 300000);
      return false;
    }
    const targets = action === "deleteall" ? Object.values(groupSettings) : [groupSettings[threadId]];
    let deleted = 0;
    for (const settings of targets) {
      const tasks = ensureTasks(settings);
      settings.customSendTasks = tasks.filter((task) => task.time !== time);
      deleted += tasks.length - settings.customSendTasks.length;
    }
    await sendMessageStateQuote(api, message, `✅ Đã xóa ${deleted} lịch lúc ${time}.`, true, 300000);
  } else if (action === "reset") {
    groupSettings[threadId].customSendTasks = [];
    groupSettings[threadId].sendTask = true;
    await sendMessageStateQuote(api, message, "✅ Đã xóa lịch tùy chỉnh và dùng lại lịch mặc định.", true, 300000);
  } else {
    await sendMessageStateQuote(api, message, help, false, 300000);
    return false;
  }
  return true;
}

export async function handleGetLinkInQuote(api, message) {
  const quote = message.data.quote;
  if (!quote || !quote.attach) {
    const obj = {
      success: false,
      message: `Không tìm thấy link trong tin nhắn được reply!`,
    };
    await sendMessageFromSQL(api, message, obj, false, 30000);
    return;
  }

  try {
    const attachData = JSON.parse(quote.attach);

    if (!attachData.href) {
      const obj = {
        success: false,
        message: `Không tìm thấy link trong tin nhắn được reply!`,
      };
      await sendMessageFromSQL(api, message, obj, false, 30000);
      return;
    }

    const obj = {
      success: true,
      message: `Link: ${attachData.href}`,
    };
    await sendMessageFromSQL(api, message, obj, false, TIME_TO_LIVE);
  } catch (error) {
    const obj = {
      success: false,
      message: `Lỗi khi xử lý link: ${error.message}`,
    };
    await sendMessageFromSQL(api, message, obj, false, 30000);
  }
}

export async function handleGetDataMessage(api, message) {
  const quote = message.data.quote;
  if (!quote) {
    const obj = {
      success: false,
      message: `Vui lòng reply vào tin nhắn cần lấy thông tin!`,
    };
    await sendMessageFromSQL(api, message, obj, false, 30000);
    return;
  }

  try {
    let msgResult = "";
    msgResult += `Người gửi: ${quote.fromD}\n`;
    msgResult += `ID Người Gửi: ${quote.ownerId}\n`;
    msgResult += `cliMsgId: ${quote.cliMsgId}\n`;
    msgResult += `cliMsgType: ${quote.cliMsgType}\n`;
    msgResult += `Time to live: ${quote.ttl}\n`;
    msgResult += `Msg: ${quote.msg}\n`;
    msgResult += `Đính kèm: ${
      quote.attach ? deepStringifyJSON(deepParseJSON(quote.attach), 2) : "Không có đính kèm"
    }\n`;
    const obj = {
      success: true,
      message: msgResult,
    };
    await sendMessageFromSQL(api, message, obj, false, TIME_TO_LIVE);
  } catch (error) {
    const obj = {
      success: false,
      message: `Lỗi khi xử lý tin nhắn quote: ${error.message}`,
    };
    await sendMessageFromSQL(api, message, obj, false, 30000);
  }
}

export async function spamCallInGroup(api, message, aliasCommand) {
  try {
    const senderName = message.data?.dName || "Người dùng";
    const senderId = message.data?.uidFrom;
    let mentions = message.data?.mentions || [];

    if (mentions.length === 0 && message.data?.reply) {
      mentions.push({
        uid: message.data.reply.uid,
        dName: message.data.reply.dName || "Người dùng"
      });
    }

    if (mentions.length === 0) {
      return sendMessageFailed(api, message, `Vui lòng mention hoặc reply người bạn muốn gọi.`);
    }

    const prefix = getGlobalPrefix();
    const rawContent = removeMention(message) || '';
    const content = rawContent.replace(`${prefix}${aliasCommand}`, '').trim();
    const args = content.split(' ');
    const count = parseInt(args[0]);

    if (isNaN(count) || count <= 0) {
      return sendMessageFailed(api, message, `Cú pháp sai. Ví dụ: ${prefix}${aliasCommand} @user 5`);
    }

    const targetUid = String(mentions[0].uid);
    const targetName = mentions[0].dName || "Người dùng";
    const sleep = (ms) => new Promise(res => setTimeout(res, ms));
    
    for (let i = 0; i < count; i++) {
      try {
        await api.sendCallVoice(targetUid);
        if (i < count - 1) await sleep(3000);
      } catch (err) {
        console.error(`❌ Lỗi khi gọi lần ${i + 1}:`, err.message || err);
        break;
      }
    }
    const msg = `@${senderName} Đã dùng bí thuật ${count} lần đến @${targetName}`;
    const mentionList = [
      { uid: senderId, pos: 0, len: senderName.length + 1 },
      { uid: targetUid, pos: msg.indexOf(`@${targetName}`), len: targetName.length + 1 }
    ];

    await api.sendMessage({
      msg,
      mentions: mentionList,
      ttl: 360000,
    }, message.threadId, message.type);

  } catch (err) {
    console.error("❌ Lỗi spam call:", err);
    await sendMessageFailed(api, message, `Lỗi: ${err.message}`);
  }
}

export async function handleDisperseGroup(api, message) {
  const senderId   = message.data?.uidFrom;
  const senderName = message.data?.dName || "Người dùng";
  const threadId   = message.threadId; 

  if (!isAdmin(api.getBotId(), senderId)) {
    return sendMessageStateQuote(
      api,
      message,
      `${senderName} Chỉ chủ bot mới dùng được lệnh này!`,
      false,
      30000
    );
  }

  if (!threadId || threadId === "0" || threadId.length < 18) {
    return sendMessageStateQuote(
      api,
      message,
      `Lệnh chỉ dùng trong NHÓM CHAT!\n` +
      `Thread ID hiện tại: ${threadId || "Không có"}`,
      false,
      30000
    );
  }

  let groupName = "Nhóm chat";
  try {
    const info = await getGroupInfoData(api, threadId);
    groupName = info?.groupName || groupName;
  } catch (e) {
    console.warn("Lấy tên nhóm lỗi:", e.message);
  }

  try {
    await api.disperseGroup(threadId);

  } catch (error) {
    console.error("DisperseGroup error:", error);
    if (error.code === 114) {
      await sendMessageFailed(
        api,
        message,
        `❌ LỖI 114: Tham số không hợp lệ!\n`,
      );
    } else {
      await sendMessageFailed(
        api,
        message,
        `❌ Giải tán thất bại!\n` +
        `Code: ${error.code || "N/A"}\n` +
        `Lỗi: ${error.message || error}`
      );
    }
  }
}

export async function handleUpdateProfile(api, message, aliasCommand) {
  const content = removeMention(message);
  const prefix = getGlobalPrefix(api.getBotId());
  const args = content.replace(`${prefix}${aliasCommand}`, "").trim();
  let argsArray = args.split(/\s+/);
  const settingsConfig = [
    {
      key: "view_birthday",
      name: "Hiện Ngày Sinh",
      values: [
        { val: 0, label: "Ẩn" },
        { val: 1, label: "Hiển thị tất cả" },
        { val: 2, label: "Chỉ hiển thị ngày/tháng" },
      ],
    },
    {
      key: "show_online_status",
      name: "Trạng Thái Truy Cập",
      values: [
        { val: 0, label: "Tắt" },
        { val: 1, label: "Mở" },
      ],
    },
    {
      key: "display_seen_status",
      name: "Hiện Trạng Thái Đã Xem",
      values: [
        { val: 0, label: "Tắt" },
        { val: 1, label: "Mở" },
      ],
    },
    {
      key: "receive_message",
      name: "Nhận Tin Nhắn",
      values: [
        { val: 1, label: "Tất Cả" },
        { val: 2, label: "Chỉ Bạn Bè" },
      ],
    },
    {
      key: "accept_stranger_call",
      name: "Nhận Cuộc Gọi Từ Người Lạ",
      values: [
        { val: 2, label: "Bạn Bè" },
        { val: 3, label: "Tất Cả" },
        { val: 4, label: "Bạn Bè và Người từng liên hệ" },
      ],
    },
    {
      key: "add_friend_via_phone",
      name: "Kết bạn qua Số Điện Thoại",
      values: [
        { val: 0, label: "Tắt" },
        { val: 1, label: "Mở" },
      ],
    },
    {
      key: "add_friend_via_qr",
      name: "Kết bạn qua QR",
      values: [
        { val: 0, label: "Tắt" },
        { val: 1, label: "Mở" },
      ],
    },
    {
      key: "add_friend_via_group",
      name: "Kết bạn qua Nhóm Chung",
      values: [
        { val: 0, label: "Tắt" },
        { val: 1, label: "Mở" },
      ],
    },
    {
      key: "add_friend_via_contact",
      name: "Kết bạn qua Danh Thiếp",
      values: [
        { val: 0, label: "Tắt" },
        { val: 1, label: "Mở" },
      ],
    },
    {
      key: "display_on_recommend_friend",
      name: "Hiển thị trên danh sách bạn bè đề xuất",
      values: [
        { val: 0, label: "Tắt" },
        { val: 1, label: "Mở" },
      ],
    },
    {
      key: "quickMessageStatus",
      name: "Tin Nhắn Nhanh",
      values: [
        { val: 0, label: "Tắt" },
        { val: 1, label: "Mở" },
      ],
    },
    {
      key: "archivedChatStatus",
      name: "Chia mục Ưu tiên và Khác",
      values: [
        { val: 0, label: "Tắt" },
        { val: 1, label: "Mở" },
      ],
    },
  ];

  try {
    if (!args || argsArray.length === 0 || (argsArray.length === 1 && argsArray[0] === "")) {
      await sendMessageQuery(
        api,
        message,
        `⚙️ Quản lý tài khoản:\n\n` +
          `1. Cập nhật Profile:\n` +
          `   • Đổi tên: ${prefix}${aliasCommand} setting [tên]\n` +
          `   • Cập nhật đầy đủ: ${prefix}${aliasCommand} setting [tên] [ngày_sinh] [giới_tính]\n` +
          `   • Đổi biệt danh bạn bè: ${prefix}${aliasCommand} friendalias [@user hoặc userId] [biệt danh mới]\n` +
          `   • Xóa biệt danh bạn bè: ${prefix}${aliasCommand} friendalias remove [@user hoặc userId]\n` +
          `2. Đổi ảnh đại diện:\n` +
          `   • Đổi avatar mới: ${prefix}${aliasCommand} avatar\n` +
          `     (Reply ảnh, hoặc gửi URL ảnh)\n` +
          `   • Sử dụng lại avatar cũ: ${prefix}${aliasCommand} avatarOld [index]\n` +
          `   • Danh sách avatar: ${prefix}${aliasCommand} avatarOld\n` +
          `   • Xóa avatar: ${prefix}${aliasCommand} avatarOld remove [index] ...\n` +
          `3. Quản lý bạn bè:\n` +
          `   • Gửi lời mời kết bạn: ${prefix}${aliasCommand} friend add (mention/reply)\n` +
          `   • Hủy kết bạn: ${prefix}${aliasCommand} friend remove (mention/reply)\n` +
          `   • Chấp nhận lời mời: ${prefix}${aliasCommand} friend accept (mention/reply)\n` +
          `   • Từ chối lời mời: ${prefix}${aliasCommand} friend reject (mention/reply)\n` +
          `   • Danh sách lời mời: ${prefix}${aliasCommand} friend list\n` +
          `   • Hủy lời mời đã gửi: ${prefix}${aliasCommand} friend undo [index/mention/reply]\n` +
          `   • Chặn bạn bè: ${prefix}${aliasCommand} friend block (mention/reply)\n` +
          `   • Bỏ chặn bạn bè: ${prefix}${aliasCommand} friend unblock (mention/reply/all)\n` +
          `   • Danh sách bạn bè bị chặn: ${prefix}${aliasCommand} friend listblock \n\n` +
          `4. Quản lý nhóm:\n` +
          `   • Xem danh sách group đang được mời: ${prefix}${aliasCommand} group list\n` +
          `   • Tham gia group được mời: ${prefix}${aliasCommand} group join [index/groupId]\n` +
          `   • Từ chối group được mời: ${prefix}${aliasCommand} group reject [index/groupId]\n\n` +
          `5. Cài đặt Settings:\n` +
          `   ${prefix}${aliasCommand} settings [thứ tự] [giá trị]\n` +
          `   Ví dụ: ${prefix}${aliasCommand} settings 2 1\n\n` +
          `Hoặc ${prefix}${aliasCommand} settings để xem danh sách cài đặt`,
        false
      );
      return;
    }

    if (argsArray[0].toLowerCase() === "avatar") {
      const botId = api.getBotId();
      let avatarPath = null;
      const { tempDir } = await import("../../utils/io-json.js");
      
      try {
        const quote = message.data?.quote;
        if (quote && quote.attach) {
          let imageUrl;
          try {
            const attachData = JSON.parse(quote.attach);
            const params = attachData.params ? JSON.parse(attachData.params) : {};
            imageUrl = params.hd || attachData.href;
          } catch (error) {
            console.error('❌ Parse error:', error);
            await sendMessageWarning(api, message, "Dữ liệu ảnh không hợp lệ trong tin nhắn được reply!", false);
            return;
          }
          
          if (!imageUrl) {
            await sendMessageWarning(api, message, "Không tìm thấy URL ảnh hợp lệ trong tin nhắn được reply!", false);
            return;
          }
          const tempFilePath = path.join(tempDir, `account_avatar_${botId}_${Date.now()}.jpg`);
          await fs.mkdir(tempDir, { recursive: true });
          await downloadFile(imageUrl, tempFilePath);
          avatarPath = tempFilePath;
        } else {
          const attachments = message.data?.attachments || [];
          if (attachments.length > 0) {
            const firstAttachment = attachments[0];
            if (firstAttachment.url || firstAttachment.href) {
              const imageUrl = firstAttachment.url || firstAttachment.href;
              const tempFilePath = path.join(tempDir, `account_avatar_${botId}_${Date.now()}.jpg`);
              await fs.mkdir(tempDir, { recursive: true });
              await downloadFile(imageUrl, tempFilePath);
              avatarPath = tempFilePath;
            }
          } else {
            const content = removeMention(message);
            const urlMatch = content.match(/https?:\/\/[^\s]+/);
            if (urlMatch) {
              const imageUrl = urlMatch[0];
              const tempFilePath = path.join(tempDir, `account_avatar_${botId}_${Date.now()}.jpg`);
              await fs.mkdir(tempDir, { recursive: true });
              await downloadFile(imageUrl, tempFilePath);
              avatarPath = tempFilePath;
            } else {
              await sendMessageWarning(api, message, "⚠️ Vui lòng reply vào tin nhắn có ảnh, gửi ảnh kèm lệnh, hoặc gửi URL ảnh!", false);
              return;
            }
          }
        }
        
        if (!avatarPath) {
          await sendMessageWarning(api, message, "⚠️ Không thể lấy được ảnh để đổi avatar!", false);
          return;
        }

        await api.changeAccountAvatar(avatarPath);
        await sendMessageComplete(api, message, "✅ Đã đổi ảnh đại diện tài khoản thành công!", true);
      } catch (error) {
        console.error('❌ Error changing account avatar:', error);
        await sendMessageWarning(api, message, `❌ Lỗi khi đổi ảnh đại diện: ${error.message}`, false);
      } finally {
        if (avatarPath && await fileExists(avatarPath)) {
          try {
            await fs.unlink(avatarPath);
          } catch (cleanupError) {
            console.error('⚠️ Cleanup error:', cleanupError);
          }
        }
      }
      return;
    }

    if (argsArray[0].toLowerCase() === "listavatar" || argsArray[0].toLowerCase() === "getavatarlist") {
      try {
        let count = 50;
        let page = 1;

        if (argsArray.length > 1 && argsArray[1] !== "") {
          const countArg = parseInt(argsArray[1]);
          if (!isNaN(countArg) && countArg > 0) {
            count = Math.min(countArg, 100); 
          }
        }

        if (argsArray.length > 2 && argsArray[2] !== "") {
          const pageArg = parseInt(argsArray[2]);
          if (!isNaN(pageArg) && pageArg > 0) {
            page = pageArg;
          }
        }

        const response = await api.getAvatarList(count, page);
        
        if (!response || !response.photos || response.photos.length === 0) {
          await sendMessageQuery(
            api,
            message,
            `📷 Danh sách avatar:\n\n` +
              `📄 Trang: ${page}\n` +
              `📊 Số lượng: ${count}\n\n` +
              `❌ Không tìm thấy avatar nào.`,
        true
      );
          return;
        }

        try {
          const imagePath = await createAvatarListCanvas(response.photos);
          let caption = `💡 Sử dụng: ${prefix}${aliasCommand} avatarOld [index]\n`;
          caption += `Ví dụ: ${prefix}${aliasCommand} avatarOld 1`;
          
          await sendMessageImageTag(api, message, {
            caption: caption,
            imagePath: imagePath,
          }, 300000);

          try {
            if (fsSync.existsSync(imagePath)) {
              fsSync.unlinkSync(imagePath);
            }
          } catch (deleteError) {
            console.error("Lỗi khi xóa file ảnh:", deleteError);
          }
        } catch (imageError) {
          console.error("Lỗi khi tạo canvas avatar list:", imageError);
          await sendMessageWarning(api, message, `❌ Lỗi khi tạo canvas danh sách avatar: ${imageError.message}`, false);
        }
      } catch (error) {
        console.error("Error getting avatar list:", error);
        await sendMessageWarning(api, message, `❌ Lỗi khi lấy danh sách avatar: ${error.message}`, false);
      }
      return;
    }

    if (argsArray[0].toLowerCase() === "avatarold" && argsArray[1]?.toLowerCase() === "remove") {
      argsArray = ["deleteavatarold", ...argsArray.slice(2)];
    }

    if (argsArray[0].toLowerCase() === "deleteavatarold" || argsArray[0].toLowerCase() === "delavatarold") {
      try {
        const inputArgs = argsArray.slice(1).filter(id => id.trim() !== "");
        
        if (inputArgs.length === 0) {
          await sendMessageQuery(
            api,
            message,
            `🗑️ Xóa avatar:\n\n` +
              `Cú pháp: ${prefix}${aliasCommand} avatarOld remove [index/photoId1] [index/photoId2] ...\n\n` +
              `Ví dụ:\n` +
              `${prefix}${aliasCommand} avatarOld remove 1\n` +
              `${prefix}${aliasCommand} avatarOld remove 1 2 3\n` +
              `${prefix}${aliasCommand} avatarOld remove photo123\n` +
              `${prefix}${aliasCommand} avatarOld remove photo123 photo456 photo789`,
            true
          );
          return;
        }

        const hasNumbers = inputArgs.some(arg => !isNaN(parseInt(arg)) && parseInt(arg) > 0);
        let photoIds = [];

        if (hasNumbers) {
          const avatarListResponse = await api.getAvatarList(100, 1);
          
          if (!avatarListResponse || !avatarListResponse.photos || avatarListResponse.photos.length === 0) {
            await sendMessageWarning(api, message, "❌ Không tìm thấy avatar nào trong lịch sử!", false);
            return;
          }

          for (const arg of inputArgs) {
            const num = parseInt(arg);
            if (!isNaN(num) && num > 0) {
              if (num > avatarListResponse.photos.length) {
                await sendMessageWarning(api, message, `⚠️ index ${num} không hợp lệ! Chỉ có ${avatarListResponse.photos.length} avatar trong danh sách.`, false);
                return;
              }
              photoIds.push(avatarListResponse.photos[num - 1].photoId);
            } else {
              photoIds.push(arg);
            }
          }
        } else {
          photoIds = inputArgs;
        }

        if (photoIds.length === 0) {
          await sendMessageWarning(api, message, "⚠️ Không có avatar nào để xóa!", false);
          return;
        }

        const response = await api.deleteAvatar(photoIds);
        
        let messageText = ``;
        
        if (response.delPhotoIds && response.delPhotoIds.length > 0) {
          messageText += `✅ Đã xóa thành công (${response.delPhotoIds.length}):\n`;
          response.delPhotoIds.forEach((id, index) => {
            messageText += `${index + 1}. ${id}\n`;
          });
          messageText += ``;
        }

        if (response.errMap && Object.keys(response.errMap).length > 0) {
          messageText += `❌ Lỗi (${Object.keys(response.errMap).length}):\n`;
          Object.entries(response.errMap).forEach(([photoId, error], index) => {
            messageText += `${index + 1}. ${photoId}: Lỗi ${error.err}\n`;
          });
        }

        if (!response.delPhotoIds || response.delPhotoIds.length === 0) {
          messageText = `❌ Không thể xóa avatar nào. Vui lòng kiểm tra lại photo ID!`;
        }

        await sendMessageComplete(api, message, messageText, true);
      } catch (error) {
        console.error("Error deleting avatar:", error);
        await sendMessageWarning(api, message, `❌ Lỗi khi xóa avatar: ${error.message}`, false);
      }
      return;
    }

    if (argsArray[0].toLowerCase() === "reuseavatar" || argsArray[0].toLowerCase() === "reuse" || argsArray[0].toLowerCase() === "avatarold") {
      try {
        if (argsArray.length < 2 || !argsArray[1] || argsArray[1].trim() === "") {
          const response = await api.getAvatarList(100, 1);
          
          if (!response || !response.photos || response.photos.length === 0) {
            await sendMessageQuery(
              api,
              message,
              `📷 Danh sách avatar:\n\n` +
                `❌ Không tìm thấy avatar nào.`,
              true
            );
            return;
          }

          try {
            const imagePath = await createAvatarListCanvas(response.photos);
            let caption = `💡 Sử dụng: ${prefix}${aliasCommand} avatarOld [index]\n`;
            caption += `Ví dụ: ${prefix}${aliasCommand} avatarOld 1`;
            
            if (response.hasMore && response.nextPhotoId) {
              caption += `\n\n📄 Dùng: ${prefix}${aliasCommand} listavatar để xem thêm`;
            }

            await sendMessageImageTag(api, message, {
              caption: caption,
              imagePath: imagePath,
            }, 300000);

            try {
              if (fsSync.existsSync(imagePath)) {
                fsSync.unlinkSync(imagePath);
              }
            } catch (deleteError) {
              console.error("Lỗi khi xóa file ảnh:", deleteError);
            }
          } catch (imageError) {
            console.error("Lỗi khi tạo canvas avatar list:", imageError);
            await sendMessageWarning(api, message, `❌ Lỗi khi tạo canvas danh sách avatar: ${imageError.message}`, false);
          }
          return;
        }

        const orderNumber = parseInt(argsArray[1]);
        if (isNaN(orderNumber) || orderNumber < 1) {
          await sendMessageWarning(api, message, "⚠️ index phải là số nguyên dương!", false);
          return;
        }

        const response = await api.getAvatarList(100, 1);
        
        if (!response || !response.photos || response.photos.length === 0) {
          await sendMessageWarning(api, message, "❌ Không tìm thấy avatar nào trong lịch sử!", false);
          return;
        }

        if (orderNumber > response.photos.length) {
          await sendMessageWarning(api, message, `⚠️ index không hợp lệ! Chỉ có ${response.photos.length} avatar trong danh sách.`, false);
          return;
        }

        const selectedPhoto = response.photos[orderNumber - 1];
        const photoId = selectedPhoto.photoId;
        
        await api.reuseAvatar(photoId);
        const photoUrl = selectedPhoto.url || selectedPhoto.bkUrl || selectedPhoto.thumbnail || "N/A";
        await sendMessageComplete(api, message, `✅ Đã đặt lại avatar cũ`, true);
      } catch (error) {
        console.error("Error reusing avatar:", error);
        await sendMessageWarning(api, message, `❌ Lỗi khi sử dụng lại avatar: ${error.message}`, false);
      }
      return;
    }

    if (argsArray[0].toLowerCase() === "friend") {
      const subCommand = argsArray[1]?.toLowerCase();
      
      if (subCommand === "add") {
        argsArray[0] = "addfriend";
        argsArray = ["addfriend", ...argsArray.slice(2)];
      } else if (subCommand === "remove") {
        argsArray[0] = "unfriend";
        argsArray = ["unfriend", ...argsArray.slice(2)];
      } else if (subCommand === "accept") {
        argsArray[0] = "acceptfriend";
        argsArray = ["acceptfriend", ...argsArray.slice(2)];
      } else if (subCommand === "reject") {
        argsArray[0] = "rejectfriend";
        argsArray = ["rejectfriend", ...argsArray.slice(2)];
      } else if (subCommand === "list") {
        argsArray[0] = "listfriendrequest";
        argsArray = ["listfriendrequest", ...argsArray.slice(2)];
      } else if (subCommand === "undo") {
        argsArray[0] = "undofriend";
        argsArray = ["undofriend", ...argsArray.slice(2)];
      } else if (subCommand === "block") {
        argsArray[0] = "blockfriend";
        argsArray = ["blockfriend", ...argsArray.slice(2)];
      } else if (subCommand === "unblock") {
        argsArray[0] = "unblockfriend";
        argsArray = ["unblockfriend", ...argsArray.slice(2)];
      } else if (subCommand === "listblock") {
        argsArray[0] = "listblockfriend";
        argsArray = ["listblockfriend", ...argsArray.slice(2)];
      } else {
        await sendMessageStateQuote(
          api,
          message,
          `❌ Lệnh không hợp lệ!\n\n💡 Các lệnh friend:\n` +
          `• ${prefix}${aliasCommand} friend add (mention/reply)\n` +
          `• ${prefix}${aliasCommand} friend remove (mention/reply)\n` +
          `• ${prefix}${aliasCommand} friend accept [index/mention/reply]\n` +
          `• ${prefix}${aliasCommand} friend reject [index/mention/reply]\n` +
          `• ${prefix}${aliasCommand} friend list\n` +
          `• ${prefix}${aliasCommand} friend undo [index/mention/reply]\n` +
          `• ${prefix}${aliasCommand} friend block (mention/reply)\n` +
          `• ${prefix}${aliasCommand} friend unblock (mention/reply/all)\n` +
          `• ${prefix}${aliasCommand} friend listblock `,
          false,
          30000
        );
        return;
      }
    }

    if (argsArray[0].toLowerCase() === "group") {
      const subCommand = argsArray[1]?.toLowerCase();
      
      if (subCommand === "list") {
        argsArray[0] = "listgroupinvite";
        argsArray = ["listgroupinvite", ...argsArray.slice(2)];
      } else if (subCommand === "join") {
        argsArray[0] = "joininvite";
        argsArray = ["joininvite", ...argsArray.slice(2)];
      } else if (subCommand === "reject") {
        argsArray[0] = "rejectinvite";
        argsArray = ["rejectinvite", ...argsArray.slice(2)];
      } else {
        await sendMessageStateQuote(
          api,
          message,
          `❌ Lệnh không hợp lệ!\n\n💡 Các lệnh group:\n` +
          `• ${prefix}${aliasCommand} group list [trang]\n` +
          `• ${prefix}${aliasCommand} group join [index/groupId]\n` +
          `• ${prefix}${aliasCommand} group reject [index/groupId]`,
          false,
          30000
        );
        return;
      }
    }

    if (argsArray[0].toLowerCase() === "addfriend" || argsArray[0].toLowerCase() === "kb") {
      try {
        const senderName = message.data?.dName || "Người dùng";
        let mentions = message.data?.mentions || [];

        if (mentions.length === 0 && message.data?.reply) {
          mentions.push({
            uid: message.data.reply.uid,
            dName: message.data.reply.dName || "Người dùng"
          });
        }

        if (mentions.length === 0) {
          await sendMessageStateQuote(
            api,
            message,
            `Dùng "${prefix}${aliasCommand} friend add @mention" hoặc trả lời tin nhắn để gửi lời mời kết bạn!`,
            false,
            30000
          );
          return;
        }

        const customMessage = argsArray.slice(1).join(" ") || "Chào Bạn, Tớ Là Bot của Hà Huy Hoàng ạ...";
        const successfulMentions = [];
        await Promise.all(
          mentions.map(async mention => {
            try {
              await api.sendFriendRequest(mention.uid, customMessage, "vi");
              successfulMentions.push({
                uid: mention.uid,
                dName: mention.dName || message.data?.content?.substring(mention.pos, mention.pos + mention.len)?.replace("@", "") || null
              });
            } catch {}
          })
        );

        if (successfulMentions.length === 0) {
          await sendMessageStateQuote(
            api,
            message,
            `❌ Không thể gửi lời mời kết bạn đến bất kỳ ai.`,
            false,
            30000
          );
          return;
        }

        const uidsToFetch = successfulMentions.filter(m => !m.dName).map(m => m.uid);
        let userInfos = {};
        if (uidsToFetch.length > 0) {
          try {
            userInfos = await getUsersInfoBasic(api, uidsToFetch);
          } catch (error) {
            console.error("Error getting user info:", error);
          }
        }
        
        let messageText = `📩 Đã gửi lời mời kết bạn đến: `;
        let currentPos = messageText.length;
        const mentionList = [];
        
        successfulMentions.forEach(mention => {
          let displayName = mention.dName;
          if (!displayName) {
            const userInfo = userInfos[mention.uid];
            displayName = userInfo?.displayName || userInfo?.zaloName || `ID ${mention.uid}`;
          }
          const nameText = `${displayName} \n`;
          const pos = currentPos;
          messageText += nameText;
          mentionList.push({
            uid: mention.uid,
            len: displayName.length,
            pos: pos
          });
          currentPos += nameText.length;
        });

        await sendMessageStateQuote(
          api,
          message,
          messageText.trim(),
          true,
          30000
        );
      } catch (error) {
        console.error("❌ Lỗi khi gửi kết bạn:", error);
        await sendMessageWarning(api, message, `❌ Lỗi khi gửi kết bạn: ${error.message}`, false);
      }
      return;
    }

    if (argsArray[0].toLowerCase() === "acceptfriend" || argsArray[0].toLowerCase() === "accept") {
      try {
        const senderName = message.data?.dName || "Người dùng";
        let mentions = message.data?.mentions || [];
        const botId = api.getBotId();
        const userId = message.data?.uidFrom;

        if (mentions.length === 0 && argsArray.length >= 2) {
          const indexArg = argsArray[1];
          const index = parseInt(indexArg);
          
          if (!isNaN(index) && index > 0) {
            if (friendRequestCache[botId] && friendRequestCache[botId][userId]) {
              const cachedData = friendRequestCache[botId][userId];
              if (Date.now() - cachedData.timestamp < 10 * 60 * 1000) {
                const friendRequests = cachedData.list;
                
                if (index <= friendRequests.length) {
                  const request = friendRequests[index - 1]; 
                  const uid = request.uid || request.userId;
                  
                  if (uid) {
                    mentions.push({
                      uid: String(uid),
                      dName: request.displayName || request.zaloName || "Người dùng"
                    });
                  } else {
                    await sendMessageStateQuote(
                      api,
                      message,
                      `❌ Không tìm thấy UID của người dùng ở vị trí ${index}.`,
                      false,
                      30000
                    );
                    return;
                  }
                } else {
                  await sendMessageStateQuote(
                    api,
                    message,
                    `❌ index không hợp lệ! Vui lòng dùng số từ 1 đến ${friendRequests.length}.\n\n💡 Dùng "${prefix}${aliasCommand} friend list" để xem danh sách.`,
                    false,
                    30000
                  );
                  return;
                }
              } else {
                await sendMessageStateQuote(
                  api,
                  message,
                  `❌ Danh sách đã hết hạn. Vui lòng dùng "${prefix}${aliasCommand} friend list" để xem lại danh sách.`,
                  false,
                  30000
                );
                return;
              }
            } else {
              await sendMessageStateQuote(
                api,
                message,
                `❌ Không tìm thấy danh sách lời mời. Vui lòng dùng "${prefix}${aliasCommand} friend list" để xem danh sách trước.`,
                false,
                30000
              );
              return;
            }
          }
        }

        if (mentions.length === 0 && message.data?.reply) {
          mentions.push({
            uid: message.data.reply.uid,
            dName: message.data.reply.dName || "Người dùng"
          });
        }

        if (mentions.length === 0) {
          await sendMessageStateQuote(
            api,
            message,
            `Dùng "${prefix}${aliasCommand} friend accept [index/@mention/reply]" để chấp nhận kết bạn!\n\n💡 Ví dụ:\n${prefix}${aliasCommand} friend accept 1\n${prefix}${aliasCommand} friend accept @user`,
            false,
            30000
          );
          return;
        }

        const successList = [];
        await Promise.all(
          mentions.map(async mention => {
            try {
              await api.acceptFriendRequest(mention.uid);
              successList.push({
                uid: mention.uid,
                dName: mention.dName || message.data?.content?.substring(mention.pos, mention.pos + mention.len)?.replace("@", "") || null
              });
            } catch (err) {
              console.error(`❌ Lỗi khi chấp nhận kết bạn với ${mention.uid}:`, err.message || err);
            }
          })
        );

        if (successList.length === 0) {
          await sendMessageStateQuote(
            api,
            message,
            `❌ Không thể chấp nhận lời mời kết bạn với bất kỳ ai.`,
            false,
            30000
          );
          return;
        }
        const uidsToFetch = successList.filter(m => !m.dName).map(m => m.uid);
        let userInfos = {};
        if (uidsToFetch.length > 0) {
          try {
            userInfos = await getUsersInfoBasic(api, uidsToFetch);
          } catch (error) {
            console.error("Error getting user info:", error);
          }
        }

        let messageText = `🤝 Đã chấp nhận kết bạn với: `;
        let currentPos = messageText.length;
        const mentionList = [];
        
        successList.forEach(mention => {
          let displayName = mention.dName;
          if (!displayName) {
            const userInfo = userInfos[mention.uid];
            displayName = userInfo?.displayName || userInfo?.zaloName || `ID ${mention.uid}`;
          }
          const nameText = `${displayName}\n`;
          const pos = currentPos;
          messageText += nameText;
          mentionList.push({
            uid: mention.uid,
            len: displayName.length,
            pos: pos
          });
          currentPos += nameText.length;
        });

        await sendMessageStateQuote(
          api,
          message,
          messageText.trim(),
          true,
          30000
        );
      } catch (error) {
        console.error("❌ Lỗi khi chấp nhận kết bạn:", error);
        await sendMessageWarning(api, message, `❌ Lỗi khi chấp nhận kết bạn: ${error.message}`, false);
      }
      return;
    }

    if (argsArray[0].toLowerCase() === "rejectfriend" || argsArray[0].toLowerCase() === "reject") {
      try {
        const senderName = message.data?.dName || "Người dùng";
        let mentions = message.data?.mentions || [];
        const botId = api.getBotId();
        const userId = message.data?.uidFrom;

        if (mentions.length === 0 && argsArray.length >= 2) {
          const indexArg = argsArray[1];
          const index = parseInt(indexArg);
          
          if (!isNaN(index) && index > 0) {
            if (friendRequestCache[botId] && friendRequestCache[botId][userId]) {
              const cachedData = friendRequestCache[botId][userId];
              if (Date.now() - cachedData.timestamp < 10 * 60 * 1000) {
                const friendRequests = cachedData.list;
                
                if (index <= friendRequests.length) {
                  const request = friendRequests[index - 1];
                  const uid = request.uid || request.userId;
                  
                  if (uid) {
                    mentions.push({
                      uid: String(uid),
                      dName: request.displayName || request.zaloName || "Người dùng"
                    });
                  } else {
                    await sendMessageStateQuote(
                      api,
                      message,
                      `❌ Không tìm thấy UID của người dùng ở vị trí ${index}.`,
                      false,
                      30000
                    );
                    return;
                  }
                } else {
                  await sendMessageStateQuote(
                    api,
                    message,
                    `❌ index không hợp lệ! Vui lòng dùng số từ 1 đến ${friendRequests.length}.\n\n💡 Dùng "${prefix}${aliasCommand} friend list" để xem danh sách.`,
                    false,
                    30000
                  );
                  return;
                }
              } else {
                await sendMessageStateQuote(
                  api,
                  message,
                  `❌ Danh sách đã hết hạn. Vui lòng dùng "${prefix}${aliasCommand} friend list" để xem lại danh sách.`,
                  false,
                  30000
                );
                return;
              }
            } else {
              await sendMessageStateQuote(
                api,
                message,
                `❌ Không tìm thấy danh sách lời mời. Vui lòng dùng "${prefix}${aliasCommand} friend list" để xem danh sách trước.`,
                false,
                30000
              );
              return;
            }
          }
        }

        if (mentions.length === 0 && message.data?.reply) {
          mentions.push({
            uid: message.data.reply.uid,
            dName: message.data.reply.dName || "Người dùng"
          });
        }

        if (mentions.length === 0) {
          await sendMessageStateQuote(
            api,
            message,
            `Dùng "${prefix}${aliasCommand} friend reject [index/@mention/reply]" để từ chối kết bạn!\n\n💡 Ví dụ:\n${prefix}${aliasCommand} friend reject 1\n${prefix}${aliasCommand} friend reject @user`,
            false,
            30000
          );
          return;
        }

        const successList = [];
        await Promise.all(
          mentions.map(async mention => {
            try {
              await api.rejectFriendRequest(mention.uid);
              successList.push({
                uid: mention.uid,
                dName: mention.dName || message.data?.content?.substring(mention.pos, mention.pos + mention.len)?.replace("@", "") || null
              });
            } catch (err) {
              console.error(`❌ Lỗi khi từ chối kết bạn với ${mention.uid}:`, err.message || err);
            }
          })
        );

        if (successList.length === 0) {
          await sendMessageStateQuote(
            api,
            message,
            `❌ Không thể từ chối lời mời kết bạn với bất kỳ ai.`,
            false,
            30000
          );
          return;
        }
        const uidsToFetch = successList.filter(m => !m.dName).map(m => m.uid);
        let userInfos = {};
        if (uidsToFetch.length > 0) {
          try {
            userInfos = await getUsersInfoBasic(api, uidsToFetch);
          } catch (error) {
            console.error("Error getting user info:", error);
          }
        }

        let messageText = `❌ Đã từ chối kết bạn với: `;
        let currentPos = messageText.length;
        const mentionList = [];
        
        successList.forEach(mention => {
          let displayName = mention.dName;
          if (!displayName) {
            const userInfo = userInfos[mention.uid];
            displayName = userInfo?.displayName || userInfo?.zaloName || `ID ${mention.uid}`;
          }
          const nameText = `${displayName}\n`;
          const pos = currentPos;
          messageText += nameText;
          mentionList.push({
            uid: mention.uid,
            len: displayName.length,
            pos: pos
          });
          currentPos += nameText.length;
        });

        await sendMessageStateQuote(
          api,
          message,
          messageText.trim(),
          true,
          30000
        );
      } catch (error) {
        console.error("❌ Lỗi khi từ chối kết bạn:", error);
        await sendMessageWarning(api, message, `❌ Lỗi khi từ chối kết bạn: ${error.message}`, false);
      }
      return;
    }

    async function createFriendRequestListImage(friendRequests, prefix, aliasCommand) {
      const tempCanvas = createCanvas(1, 1);
      const tempCtx = tempCanvas.getContext("2d");
      tempCtx.font = "bold 32px " + FONT_MAIN;

      const avatarSize = 80;
      const padding = 30;
      const nameWidth = 400;
      const messageWidth = 500;
      const extraPadding = padding * 4;

      const totalRequests = friendRequests.length;
      const useDoubleColumn = totalRequests > 8;

      const columnWidth = avatarSize + nameWidth + messageWidth + extraPadding;
      const width = useDoubleColumn ? columnWidth * 2 + padding * 2 : columnWidth;

      const headerHeight = 180;
      const itemHeight = 120;
      const itemsPerColumn = useDoubleColumn ? Math.ceil(totalRequests / 2) : totalRequests;
      const height = headerHeight + itemsPerColumn * itemHeight + 40;

      const canvas = createCanvas(width, height);
      const ctx = canvas.getContext("2d");

      const gradient = ctx.createLinearGradient(0, 0, 0, height);
      gradient.addColorStop(0, "rgba(0, 119, 255, 0.9)");
      gradient.addColorStop(1, "rgba(62, 142, 248, 0.95)");
      ctx.fillStyle = gradient;
      ctx.fillRect(0, 0, width, height);

      let yPos = padding * 2;
      ctx.textAlign = "center";
      ctx.font = "bold 48px " + FONT_MAIN;
      ctx.fillStyle = cv.getRandomGradient(ctx, width);
      ctx.fillText("FRIEND REQUESTS", width / 2, yPos);

      yPos += 80;
      ctx.font = "bold 36px " + FONT_MAIN;
      ctx.fillStyle = "#FFD700";
      ctx.fillText(`Danh Sách Lời Mời Kết Bạn (${totalRequests})`, width / 2, yPos);
      yPos += 40;

      if (useDoubleColumn) {
        const midPoint = Math.ceil(friendRequests.length / 2);

        let leftYPos = yPos;
        for (let i = 0; i < midPoint; i++) {
          if (friendRequests[i]) {
            leftYPos = await drawFriendRequestItem(ctx, friendRequests[i], leftYPos, i + 1, padding, 0, useDoubleColumn);
          }
        }

        let rightYPos = yPos;
        for (let i = midPoint; i < friendRequests.length; i++) {
          if (friendRequests[i]) {
            rightYPos = await drawFriendRequestItem(
              ctx,
              friendRequests[i],
              rightYPos,
              i + 1,
              padding,
              columnWidth + padding * 2 - 30,
              useDoubleColumn
            );
          }
        }

        ctx.fillStyle = "rgba(255, 255, 255, 0.2)";
        ctx.fillRect(width / 2, yPos - 20, 2, height - yPos);
      } else {
        let index = 1;
        for (const request of friendRequests) {
          yPos = await drawFriendRequestItem(ctx, request, yPos, index++, padding, 0, useDoubleColumn);
        }
      }

      const outputPath = path.join(tempDir, `friend_requests_${randomIDTemp()}.png`);
      const out = fsSync.createWriteStream(outputPath);
      const stream = canvas.createPNGStream();
      stream.pipe(out);

      return new Promise((resolve, reject) => {
        out.on("finish", () => resolve(outputPath));
        out.on("error", reject);
      });
    }

async function drawFriendRequestItem(ctx, request, yPos, index, padding, xOffset, isDoubleColumn) {
  const itemHeight = 120;
  try {
    const avatarSize = 80;
    const itemPadding = 20;

    ctx.fillStyle = "rgba(29, 18, 18, 0.1)";
    ctx.beginPath();

    const backgroundWidth = isDoubleColumn ? (ctx.canvas.width - padding * 4) / 2 : ctx.canvas.width - padding * 2;

    ctx.roundRect(padding + xOffset, yPos, backgroundWidth, itemHeight - itemPadding, 10);
    ctx.fill();

    const uid = request.uid || request.userId || null;
    const name = request.displayName || request.zaloName || `Người dùng ${index}`;
    const avatar = request.avatar || request.avatarUrl || null;
    const recommTime = request.recommTime ? new Date(request.recommTime * 1000).toLocaleString('vi-VN') : "";

    if (avatar && cv.isValidUrl(avatar)) {
      try {
        const avatarImg = await loadImage(avatar);
        const avatarX = padding * 2 + xOffset;
        const avatarY = yPos + (itemHeight - avatarSize) / 2 - itemPadding / 2;

        ctx.save();
        ctx.beginPath();
        ctx.arc(avatarX + avatarSize / 2, avatarY + avatarSize / 2, avatarSize / 2 + 3, 0, Math.PI * 2);
        const borderGradient = ctx.createLinearGradient(avatarX, avatarY, avatarX + avatarSize, avatarY + avatarSize);
        borderGradient.addColorStop(0, "#4a9eff");
        borderGradient.addColorStop(1, "#0077ff");
        ctx.fillStyle = borderGradient;
        ctx.fill();

        ctx.beginPath();
        ctx.arc(avatarX + avatarSize / 2, avatarY + avatarSize / 2, avatarSize / 2, 0, Math.PI * 2);
        ctx.clip();
        ctx.drawImage(avatarImg, avatarX, avatarY, avatarSize, avatarSize);
        ctx.restore();
      } catch (error) {
        console.error("Lỗi khi load avatar:", error);
      }
    }

    const separatorX = padding * 3 + avatarSize + xOffset;
    ctx.fillStyle = "rgba(255, 255, 255, 0.2)";
    ctx.fillRect(separatorX, yPos + itemPadding - 8, 2, itemHeight - itemPadding * 2);

    const textX = separatorX + padding * 2 - 20;
    const textY = yPos + itemPadding;

    ctx.textAlign = "left";
    ctx.font = "bold 32px " + FONT_MAIN;
    ctx.fillStyle = "#FFFFFF";
    ctx.fillText(`${index}. ${name}`, textX, textY + 20);

    if (uid) {
      ctx.font = "24px " + FONT_MAIN;
      ctx.fillStyle = "#4a9eff";
      ctx.fillText(`UID: ${uid}`, textX, textY + 50);
    }

    if (recommTime) {
      ctx.font = "20px " + FONT_MAIN;
      ctx.fillStyle = "#BDBDBD";
      ctx.fillText(`⏰ ${recommTime}`, textX, textY + 75);
    }

    return yPos + itemHeight;
  } catch (error) {
    console.error("Lỗi khi vẽ thông tin lời mời:", error);
    return yPos + itemHeight;
  }
}

    if (argsArray[0].toLowerCase() === "listfriendrequest" || argsArray[0].toLowerCase() === "listfr" || argsArray[0].toLowerCase() === "dsloimoi") {
      try {
        const response = await api.getFriendRequestList();
        
        if (!response) {
          await sendMessageStateQuote(
            api,
            message,
            `❌ Không thể lấy danh sách lời mời kết bạn.`,
            false,
            30000
          );
          return;
        }
        const friendRequests = Array.isArray(response.data) ? response.data : [];
        if (friendRequests.length === 0) {
          await sendMessageStateQuote(
            api,
            message,
            `📭 Không có lời mời kết bạn nào.`,
            false,
            30000
          );
          return;
        }

        const botId = api.getBotId();
        const userId = message.data?.uidFrom;
        if (!friendRequestCache[botId]) {
          friendRequestCache[botId] = {};
        }
        friendRequestCache[botId][userId] = {
          list: friendRequests,
          timestamp: Date.now()
        };

        try {
          const userIds = friendRequests.map(r => r.uid || r.userId).filter(Boolean);
          const usersInfo = userIds.length > 0 ? await getUsersInfoBasic(api, userIds) : {};
          
          const enrichedRequests = friendRequests.map(request => {
            const uid = request.uid || request.userId;
            const userInfo = usersInfo[uid];
            return {
              ...request,
              avatar: request.avatar || request.avatarUrl || (userInfo ? (userInfo.avatar || userInfo.avatarUrl) : null),
              displayName: request.displayName || request.zaloName || (userInfo ? (userInfo.displayName || userInfo.zaloName) : `Người dùng`),
            };
          });

          const imagePath = await createFriendRequestListImage(enrichedRequests, prefix, aliasCommand);
          
          if (!imagePath || !fsSync.existsSync(imagePath)) {
            throw new Error("Không thể tạo file ảnh hoặc file ảnh không tồn tại");
          }
          
          const stats = fsSync.statSync(imagePath);
          if (stats.size < 1024) {
            throw new Error("File ảnh quá nhỏ hoặc không hợp lệ");
          }
          
          await sendMessageImageTag(api, message, {
            caption: `Danh sách lời mời kết bạn`,
            imagePath: imagePath,
          }, 300000);
          
          try {
            if (fsSync.existsSync(imagePath)) {
              fsSync.unlinkSync(imagePath);
            }
          } catch (deleteError) {
            console.error("Lỗi khi xóa file ảnh:", deleteError);
          }
        } catch (imageError) {
          console.error("Lỗi khi tạo hoặc gửi ảnh danh sách:", imageError);
        }
      } catch (error) {
        console.error("❌ Lỗi khi lấy danh sách lời mời kết bạn:", error);
        console.error("Error stack:", error.stack);
        await sendMessageWarning(api, message, `❌ Lỗi khi lấy danh sách lời mời kết bạn: ${error.message}`, false);
      }
      return;
    }

    if (argsArray[0].toLowerCase() === "listgroupinvite" || argsArray[0].toLowerCase() === "listgroupinv" || argsArray[0].toLowerCase() === "dsloimoinhom") {
      try {
        const mpage = parseInt(argsArray[1]) || 1;
        const page = parseInt(argsArray[2]) || 0;
        const invPerPage = parseInt(argsArray[3]) || 12;
        const mcount = parseInt(argsArray[4]) || 10;
        const response = await api.getGroupInvitationList({ mpage, page, invPerPage, mcount });

        if (!response) {
          await sendMessageStateQuote(
            api,
            message,
            `❌ Không thể lấy danh sách lời mời tham gia nhóm. Response: null`,
            false,
            30000
          );
          return;
        }

        let invitations = [];
        let total = 0;
        let hasMore = false;
        
        if (response.invitations && Array.isArray(response.invitations)) {
          invitations = response.invitations;
          total = response.total || response.totalCount || invitations.length;
          hasMore = response.hasMore || false;
        }
        else if (response.data && response.data.invitations && Array.isArray(response.data.invitations)) {
          invitations = response.data.invitations;
          total = response.data.total || response.data.totalCount || response.total || invitations.length;
          hasMore = response.data.hasMore || response.hasMore || false;
        }
        else if (response.data && Array.isArray(response.data)) {
          invitations = response.data;
          total = response.total || invitations.length;
          hasMore = response.hasMore || false;
        }
        else if (response.data && response.data.list && Array.isArray(response.data.list)) {
          invitations = response.data.list;
          total = response.data.total || response.data.totalCount || response.total || invitations.length;
          hasMore = response.data.hasMore || response.hasMore || false;
        }
        else if (response.data && response.data.items && Array.isArray(response.data.items)) {
          invitations = response.data.items;
          total = response.data.total || response.data.totalCount || response.total || invitations.length;
          hasMore = response.data.hasMore || response.hasMore || false;
        }
        else if (response.data && response.data.data && Array.isArray(response.data.data)) {
          invitations = response.data.data;
          total = response.data.total || response.data.totalCount || response.total || invitations.length;
          hasMore = response.data.hasMore || response.hasMore || false;
        }
        else if (Array.isArray(response)) {
          invitations = response;
          total = invitations.length;
        }
        
        if (invitations.length > 0 && Array.isArray(invitations[0])) {
          invitations = invitations.flat();
        }
        
        if (invitations.length === 0) {
          await sendMessageStateQuote(
            api,
            message,
            `📭 Không có lời mời tham gia nhóm nào.`,
            false,
            30000
          );
          return;
        }

        const botId = api.getBotId();
        const userId = message.data?.uidFrom;
        if (!groupInviteCache[botId]) {
          groupInviteCache[botId] = {};
        }
        groupInviteCache[botId][userId] = {
          list: invitations,
          timestamp: Date.now()
        };

        let messageText = `📬 Danh sách lời mời tham gia nhóm (${invitations.length}${total > 0 ? `/${total}` : ''}):\n\n`;
        
        invitations.forEach((invitation, index) => {
          const groupInfo = invitation.groupInfo || invitation.group || invitation.groupData || invitation || {};
          
          const inviterInfo = invitation.inviterInfo || invitation.inviter || invitation.inviterData || 
                             invitation.inviterUser || invitation.user || invitation.sender || {};

          const groupName = groupInfo.name || groupInfo.groupName || groupInfo.title || 
                           invitation.groupName || invitation.name || invitation.title || 
                           invitation.group_name || "Nhóm không tên";
          
          const groupId = groupInfo.groupId || groupInfo.id || groupInfo.grid || groupInfo.gid ||
                         invitation.groupId || invitation.id || invitation.grid || invitation.gid ||
                         invitation.group_id || "N/A";
          
          const inviterName = inviterInfo.dName || inviterInfo.zaloName || inviterInfo.name || 
                             inviterInfo.displayName || inviterInfo.nickname ||
                             invitation.inviterName || invitation.inviter_name || 
                             invitation.senderName || invitation.userName ||
                             invitation.dName || "Người dùng";
          
          let expiredTs = "N/A";
          if (invitation.expiredTs) {
            const ts = typeof invitation.expiredTs === 'string' ? parseInt(invitation.expiredTs) : invitation.expiredTs;
            if (!isNaN(ts) && ts > 0) {
              expiredTs = new Date(ts).toLocaleString("vi-VN");
            }
          } else if (invitation.expiredTime) {
            const ts = typeof invitation.expiredTime === 'string' ? parseInt(invitation.expiredTime) : invitation.expiredTime;
            if (!isNaN(ts) && ts > 0) {
              expiredTs = new Date(ts).toLocaleString("vi-VN");
            }
          } else if (invitation.expireTime) {
            const ts = typeof invitation.expireTime === 'string' ? parseInt(invitation.expireTime) : invitation.expireTime;
            if (!isNaN(ts) && ts > 0) {
              expiredTs = new Date(ts).toLocaleString("vi-VN");
            }
          } else if (invitation.expire_time) {
            const ts = typeof invitation.expire_time === 'string' ? parseInt(invitation.expire_time) : invitation.expire_time;
            if (!isNaN(ts) && ts > 0) {
              expiredTs = new Date(ts).toLocaleString("vi-VN");
            }
          }
          
          messageText += `${index + 1}. ${groupName}\n`;
          messageText += `   🆔 ID: ${groupId}\n`;
          messageText += `   👤 Người mời: ${inviterName}\n`;
          if (expiredTs !== "N/A") {
            messageText += `   ⏰ Hết hạn: ${expiredTs}\n`;
          }
          messageText += `\n`;
        });

        if (hasMore) {
          messageText += `📄 Dùng: ${prefix}${aliasCommand} group list ${mpage + 1} để xem thêm`;
        }
        
        messageText += `\n\n💡 Dùng: ${prefix}${aliasCommand} group join [index] để tham gia\n💡 Dùng: ${prefix}${aliasCommand} group reject [index] để từ chối`;

        await sendMessageStateQuote(
          api,
          message,
          messageText.trim(),
          true,
          30000
        );
      } catch (error) {
        console.error("❌ Lỗi khi lấy danh sách lời mời tham gia nhóm:", error);
        await sendMessageWarning(api, message, `❌ Lỗi khi lấy danh sách lời mời tham gia nhóm: ${error.message}`, false);
      }
      return;
    }

    if (argsArray[0].toLowerCase() === "joininvite" || argsArray[0].toLowerCase() === "acceptinvite" || argsArray[0].toLowerCase() === "chapnhanloimoi") {
      try {
        const botId = api.getBotId();
        const userId = message.data?.uidFrom;
        let groupId = null;

        const indexArg = argsArray[1];
        if (indexArg && !isNaN(parseInt(indexArg))) {
          const index = parseInt(indexArg) - 1;
          
          if (groupInviteCache[botId] && groupInviteCache[botId][userId]) {
            const cachedData = groupInviteCache[botId][userId];
            if (Date.now() - cachedData.timestamp < 10 * 60 * 1000) {
              const invitations = cachedData.list;
              
              if (index >= 0 && index < invitations.length) {
                const invitation = invitations[index];
                const groupInfo = invitation.groupInfo || invitation.group || {};
                groupId = groupInfo.groupId || groupInfo.id;
                
                if (!groupId) {
                  await sendMessageStateQuote(
                    api,
                    message,
                    `❌ Không tìm thấy Group ID ở vị trí ${index + 1}.`,
                    false,
                    30000
                  );
                  return;
                }
              } else {
                await sendMessageStateQuote(
                  api,
                  message,
                  `❌ index không hợp lệ! Vui lòng dùng số từ 1 đến ${invitations.length}.\n\n💡 Dùng "${prefix}${aliasCommand} group list" để xem danh sách.`,
                  false,
                  30000
                );
                return;
              }
            } else {
              await sendMessageStateQuote(
                api,
                message,
                `❌ Danh sách đã hết hạn. Vui lòng dùng "${prefix}${aliasCommand} group list" để xem lại danh sách.`,
                false,
                30000
              );
              return;
            }
          } else {
            await sendMessageStateQuote(
              api,
              message,
              `❌ Không tìm thấy danh sách lời mời. Vui lòng dùng "${prefix}${aliasCommand} group list" để xem danh sách trước.`,
              false,
              30000
            );
            return;
          }
        } else if (argsArray[1]) {
          groupId = argsArray[1];
        } else {
          await sendMessageStateQuote(
            api,
            message,
            `Dùng "${prefix}${aliasCommand} group join [index]" hoặc "${prefix}${aliasCommand} group join [groupId]" để tham gia nhóm!\n\n💡 Ví dụ:\n${prefix}${aliasCommand} group join 1\n${prefix}${aliasCommand} group join 123456789`,
            false,
            30000
          );
          return;
        }

        if (!groupId) {
          await sendMessageStateQuote(
            api,
            message,
            `❌ Không tìm thấy Group ID.`,
            false,
            30000
          );
          return;
        }

        await api.joinGroupInviteBox(groupId);
        
        await sendMessageComplete(
          api,
          message,
          `✅ Đã tham gia nhóm thành công!\n\n🆔 Group ID: ${groupId}`,
          true,
          30000
        );
      } catch (error) {
        console.error("❌ Lỗi khi tham gia nhóm:", error);
        await sendMessageWarning(api, message, `❌ Lỗi khi tham gia nhóm: ${error.message || error}`, false);
      }
      return;
    }

    if (argsArray[0].toLowerCase() === "rejectinvite" || argsArray[0].toLowerCase() === "tuchoiloimoi" || argsArray[0].toLowerCase() === "delinvite") {
      try {
        const botId = api.getBotId();
        const userId = message.data?.uidFrom;
        let groupId = null;

        const indexArg = argsArray[1];
        if (indexArg && !isNaN(parseInt(indexArg))) {
          const index = parseInt(indexArg) - 1;
        
          if (groupInviteCache[botId] && groupInviteCache[botId][userId]) {
            const cachedData = groupInviteCache[botId][userId];
            if (Date.now() - cachedData.timestamp < 10 * 60 * 1000) {
              const invitations = cachedData.list;
              
              if (index >= 0 && index < invitations.length) {
                const invitation = invitations[index];
                const groupInfo = invitation.groupInfo || invitation.group || {};
                groupId = groupInfo.groupId || groupInfo.id;
                
                if (!groupId) {
                  await sendMessageStateQuote(
                    api,
                    message,
                    `❌ Không tìm thấy Group ID ở vị trí ${index + 1}.`,
                    false,
                    30000
                  );
                  return;
                }
              } else {
                await sendMessageStateQuote(
                  api,
                  message,
                  `❌ index không hợp lệ! Vui lòng dùng số từ 1 đến ${invitations.length}.\n\n💡 Dùng "${prefix}${aliasCommand} group list" để xem danh sách.`,
                  false,
                  30000
                );
                return;
              }
            } else {
              await sendMessageStateQuote(
                api,
                message,
                `❌ Danh sách đã hết hạn. Vui lòng dùng "${prefix}${aliasCommand} group list" để xem lại danh sách.`,
                false,
                30000
              );
              return;
            }
          } else {
            await sendMessageStateQuote(
              api,
              message,
              `❌ Không tìm thấy danh sách lời mời. Vui lòng dùng "${prefix}${aliasCommand} group list" để xem danh sách trước.`,
              false,
              30000
            );
            return;
          }
        } else if (argsArray[1]) {
          groupId = argsArray[1];
        } else {
          await sendMessageStateQuote(
            api,
            message,
            `Dùng "${prefix}${aliasCommand} group reject [index]" hoặc "${prefix}${aliasCommand} group reject [groupId]" để từ chối lời mời!\n\n💡 Ví dụ:\n${prefix}${aliasCommand} group reject 1\n${prefix}${aliasCommand} group reject 123456789`,
            false,
            30000
          );
          return;
        }

        if (!groupId) {
          await sendMessageStateQuote(
            api,
            message,
            `❌ Không tìm thấy Group ID.`,
            false,
            30000
          );
          return;
        } 
        await api.removeGroupInviteBox(groupId);
        
        await sendMessageComplete(
          api,
          message,
          `✅ Đã từ chối/xóa lời mời tham gia nhóm!\n\n🆔 Group ID: ${groupId}`,
          true,
          30000
        );
      } catch (error) {
        console.error("❌ Lỗi khi từ chối lời mời nhóm:", error);
        await sendMessageWarning(api, message, `❌ Lỗi khi từ chối lời mời nhóm: ${error.message || error}`, false);
      }
      return;
    }

    if (argsArray[0].toLowerCase() === "undofriend" || argsArray[0].toLowerCase() === "undofriendrequest") {
      try {
        const senderName = message.data?.dName || "Người dùng";
        const botId = api.getBotId();
        const userId = message.data?.uidFrom;
        let mentions = message.data?.mentions || [];

        const indexArg = argsArray[1];
        if (indexArg && !isNaN(parseInt(indexArg))) {
          const index = parseInt(indexArg) - 1;

          if (friendRequestCache[botId] && friendRequestCache[botId][userId]) {
            const cachedData = friendRequestCache[botId][userId];
            if (Date.now() - cachedData.timestamp < 10 * 60 * 1000) {
              const friendRequests = cachedData.list;
              
              if (index >= 0 && index < friendRequests.length) {
                const request = friendRequests[index];
                const uid = request.uid || request.fid || request.userId || request.id;
                
                if (uid) {
                  mentions.push({
                    uid: uid,
                    dName: request.name || request.displayName || request.zaloName || request.nickname || "Người dùng"
                  });
                } else {
                  await sendMessageStateQuote(
                    api,
                    message,
                    `❌ Không tìm thấy UID của người dùng ở vị trí ${index + 1}.`,
                    false,
                    30000
                  );
                  return;
                }
              } else {
                await sendMessageStateQuote(
                  api,
                  message,
                  `❌ index không hợp lệ! Vui lòng dùng số từ 1 đến ${friendRequests.length}.\n\n💡 Dùng "${prefix}${aliasCommand} friend list" để xem danh sách.`,
                  false,
                  30000
                );
                return;
              }
            } else {
              await sendMessageStateQuote(
                api,
                message,
                `❌ Danh sách đã hết hạn. Vui lòng dùng "${prefix}${aliasCommand} friend list" để xem lại danh sách.`,
                false,
                30000
              );
              return;
            }
          } else {
            await sendMessageStateQuote(
              api,
              message,
              `❌ Không tìm thấy danh sách lời mời. Vui lòng dùng "${prefix}${aliasCommand} friend list" để xem danh sách trước.`,
              false,
              30000
            );
            return;
          }
        }

        if (mentions.length === 0 && message.data?.reply) {
          mentions.push({
            uid: message.data.reply.uid,
            dName: message.data.reply.dName || "Người dùng"
          });
        }

        if (mentions.length === 0) {
          await sendMessageStateQuote(
            api,
            message,
            `Dùng "${prefix}${aliasCommand} friend undo [index]" hoặc "${prefix}${aliasCommand} friend undo @mention" hoặc reply tin nhắn để hủy lời mời kết bạn đã gửi!\n\n💡 Ví dụ:\n${prefix}${aliasCommand} friend undo 1\n${prefix}${aliasCommand} friend undo @user`,
            false,
            30000
          );
          return;
        }

        const successList = [];
        await Promise.all(
          mentions.map(async mention => {
            try {
              await api.undoFriendRequest(mention.uid);
              successList.push({
                uid: mention.uid,
                dName: mention.dName || message.data?.content?.substring(mention.pos, mention.pos + mention.len)?.replace("@", "") || null
              });
            } catch (err) {
              console.error(`❌ Lỗi khi hủy lời mời kết bạn với ${mention.uid}:`, err.message || err);
            }
          })
        );

        if (successList.length === 0) {
          await sendMessageStateQuote(
            api,
            message,
            `❌ Không thể hủy lời mời kết bạn với bất kỳ ai.`,
            false,
            30000
          );
          return;
        }

        const uidsToFetch = successList.filter(m => !m.dName).map(m => m.uid);
        let userInfos = {};
        if (uidsToFetch.length > 0) {
          try {
            userInfos = await getUsersInfoBasic(api, uidsToFetch);
          } catch (error) {
            console.error("Error getting user info:", error);
          }
        }
        
        let messageText = `↩️ Đã hủy lời mời kết bạn với: `;
        let currentPos = messageText.length;
        const mentionList = [];
        
        successList.forEach(mention => {
          let displayName = mention.dName;
          if (!displayName) {
            const userInfo = userInfos[mention.uid];
            displayName = userInfo?.displayName || userInfo?.zaloName || `ID ${mention.uid}`;
          }
          const nameText = `${displayName} \n`;
          const pos = currentPos;
          messageText += nameText;
          mentionList.push({
            uid: mention.uid,
            len: displayName.length,
            pos: pos
          });
          currentPos += nameText.length;
        });

        await sendMessageStateQuote(
          api,
          message,
          messageText.trim(),
          true,
          30000
        );
      } catch (error) {
        console.error("❌ Lỗi khi hủy lời mời kết bạn:", error);
        await sendMessageWarning(api, message, `❌ Lỗi khi hủy lời mời kết bạn: ${error.message}`, false);
      }
      return;
    }

    if (argsArray[0].toLowerCase() === "unfriend") {
      try {
        const senderName = message.data?.dName || "Người dùng";
        let mentions = message.data?.mentions || [];

        if (mentions.length === 0 && message.data?.reply) {
          mentions.push({
            uid: message.data.reply.uid,
            dName: message.data.reply.dName || "Người dùng"
          });
        }

        if (mentions.length === 0) {
          await sendMessageStateQuote(
            api,
            message,
            `Dùng "${prefix}${aliasCommand} friend remove @mention" hoặc trả lời tin nhắn để huỷ kết bạn!`,
            false,
            30000
          );
          return;
        }

        const successUnfriend = [];
        await Promise.all(
          mentions.map(async mention => {
            try {
              await api.removeFriend(mention.uid);
              successUnfriend.push({
                uid: mention.uid,
                dName: mention.dName || message.data?.content?.substring(mention.pos, mention.pos + mention.len)?.replace("@", "") || null
              });
            } catch {}
          })
        );

        if (successUnfriend.length === 0) {
          await sendMessageStateQuote(
            api,
            message,
            `❌ Không thể huỷ kết bạn với bất kỳ ai.`,
            false,
            30000
          );
          return;
        }

        const uidsToFetch = successUnfriend.filter(m => !m.dName).map(m => m.uid);
        let userInfos = {};
        if (uidsToFetch.length > 0) {
          try {
            userInfos = await getUsersInfoBasic(api, uidsToFetch);
          } catch (error) {
            console.error("Error getting user info:", error);
          }
        }
        
        let messageText = `📤 Đã huỷ kết bạn với: `;
        let currentPos = messageText.length;
        const mentionList = [];
        
        successUnfriend.forEach(mention => {
          let displayName = mention.dName;
          if (!displayName) {
            const userInfo = userInfos[mention.uid];
            displayName = userInfo?.displayName || userInfo?.zaloName || `ID ${mention.uid}`;
          }
          const nameText = `${displayName} \n`;
          const pos = currentPos;
          messageText += nameText;
          mentionList.push({
            uid: mention.uid,
            len: displayName.length,
            pos: pos
          });
          currentPos += nameText.length;
        });

        await sendMessageStateQuote(
          api,
          message,
          messageText.trim(),
          true,
          30000
        );
      } catch (error) {
        console.error("❌ Lỗi huỷ kết bạn:", error);
        await sendMessageWarning(api, message, `❌ Lỗi khi hủy kết bạn: ${error.message}`, false);
      }
      return;
    }

    if (argsArray[0].toLowerCase() === "blockfriend") {
      try {
        let mentions = message.data?.mentions || [];

        if (mentions.length === 0 && message.data?.reply) {
          mentions.push({
            uid: message.data.reply.uid,
            dName: message.data.reply.dName || "Người dùng"
          });
        }

        if (mentions.length === 0 && argsArray.length > 1) {
          const userId = argsArray[1];
          if (userId) {
            mentions.push({
              uid: String(userId),
              dName: null
            });
          }
        }

        if (mentions.length === 0) {
          await sendMessageStateQuote(
            api,
            message,
            `Dùng "${prefix}${aliasCommand} friend block @mention" hoặc trả lời tin nhắn để chặn bạn bè!\n\n💡 Ví dụ:\n${prefix}${aliasCommand} friend block @user\n${prefix}${aliasCommand} friend block 123456789`,
            false,
            30000
          );
          return;
        }

        const successList = [];
        await Promise.all(
          mentions.map(async mention => {
            try {
              await api.blockUser(mention.uid);
              successList.push({
                uid: mention.uid,
                dName: mention.dName || null
              });
            } catch (err) {
              console.error(`❌ Lỗi khi chặn bạn bè ${mention.uid}:`, err.message || err);
            }
          })
        );

        if (successList.length === 0) {
          await sendMessageStateQuote(
            api,
            message,
            `❌ Không thể chặn bạn bè nào.`,
            false,
            30000
          );
          return;
        }

        const uidsToFetch = successList.filter(m => !m.dName).map(m => m.uid);
        let userInfos = {};
        if (uidsToFetch.length > 0) {
          try {
            userInfos = await getUsersInfoBasic(api, uidsToFetch);
          } catch (error) {
            console.error("Error getting user info:", error);
          }
        }

        let messageText = `🚫 Đã chặn tin nhắn: \n `;
        let currentPos = messageText.length;
        const mentionList = [];
        
        successList.forEach(mention => {
          let displayName = mention.dName;
          if (!displayName) {
            const userInfo = userInfos[mention.uid];
            displayName = userInfo?.displayName || userInfo?.zaloName || `ID ${mention.uid}`;
          }
          const nameText = `${displayName}\n`;
          const pos = currentPos;
          messageText += nameText;
          mentionList.push({
            uid: mention.uid,
            len: displayName.length,
            pos: pos
          });
          currentPos += nameText.length;
        });

        await sendMessageStateQuote(
          api,
          message,
          messageText.trim(),
          true,
          30000
        );
      } catch (error) {
        console.error("❌ Lỗi khi chặn bạn bè:", error);
        await sendMessageWarning(api, message, `❌ Lỗi khi chặn bạn bè: ${error.message}`, false);
      }
      return;
    }

    if (argsArray[0].toLowerCase() === "unblockfriend") {
      try {
        let mentions = message.data?.mentions || [];
        const botId = api.getBotId();
        const userId = message.data?.uidFrom;

        if (mentions.length === 0 && argsArray.length > 1 && argsArray[1].toLowerCase() === "all") {
          let allBlockedUsers = [];
          let currentPage = 1;
          let count = 50;
          let continueFetching = true;

          while (continueFetching) {
            const response = await api.getFriendBlockList(currentPage, count);
            let blockedUsers = [];
            let currentHasMore = false;

            if (response) {
              if (Array.isArray(response)) {
                blockedUsers = response;
              } else if (response.data && Array.isArray(response.data)) {
                blockedUsers = response.data;
                currentHasMore = response.hasMore || false;
              } else if (response.list && Array.isArray(response.list)) {
                blockedUsers = response.list;
                currentHasMore = response.hasMore || false;
              } else if (response.data && response.data.list && Array.isArray(response.data.list)) {
                blockedUsers = response.data.list;
                currentHasMore = response.data.hasMore || response.hasMore || false;
              } else if (response.items && Array.isArray(response.items)) {
                blockedUsers = response.items;
                currentHasMore = response.hasMore || false;
              } else if (typeof response === 'object') {
                for (const key in response) {
                  if (Array.isArray(response[key])) {
                    blockedUsers = response[key];
                    break;
                  }
                }
                currentHasMore = response.hasMore || false;
              }
            }

            if (blockedUsers.length > 0) {
              allBlockedUsers = [...allBlockedUsers, ...blockedUsers];
              
              if (blockedUsers.length < count || currentHasMore === false) {
                continueFetching = false;
              } else {
                currentPage++;
              }
            } else {
              continueFetching = false;
            }

            if (currentPage > 100) {
              continueFetching = false;
            }
          }

          if (allBlockedUsers.length === 0) {
            await sendMessageStateQuote(
              api,
              message,
              `❌ Không có bạn bè nào bị chặn.`,
              false,
              30000
            );
            return;
          }

          const successList = [];
          const failList = [];
        
          for (const user of allBlockedUsers) {
            try {
              const uid = user.uid || user.userId;
              if (uid) {
                await api.unblockUser(String(uid));
                successList.push({
                  uid: String(uid),
                  dName: user.displayName || user.zaloName || null
                });
              }
            } catch (err) {
              const uid = user.uid || user.userId;
              failList.push({
                uid: String(uid || "unknown"),
                error: err.message || err
              });
            }
          }

          let resultText = `✅ Đã bỏ chặn: ${successList.length}/${allBlockedUsers.length} người \n`;
          if (failList.length > 0) {
            resultText += `\n❌ Thất bại: ${failList.length} người`;
          }

          await sendMessageStateQuote(
            api,
            message,
            resultText,
            true,
            30000
          );
          return;
        }

        if (mentions.length === 0 && argsArray.length > 1) {
          const indexArg = argsArray[1];
          const index = parseInt(indexArg);
          
          if (!isNaN(index) && index > 0) {
            if (friendBlockListCache[botId] && friendBlockListCache[botId][userId]) {
              const cachedData = friendBlockListCache[botId][userId];
              if (Date.now() - cachedData.timestamp < 10 * 60 * 1000) {
                const blockedUsers = cachedData.list;
                
                if (index <= blockedUsers.length) {
                  const user = blockedUsers[index - 1];
                  const uid = user.uid || user.userId;
                  
                  if (uid) {
                    mentions.push({
                      uid: String(uid),
                      dName: user.displayName || user.zaloName || "Người dùng"
                    });
                  } else {
                    await sendMessageStateQuote(
                      api,
                      message,
                      `❌ Không tìm thấy UID của người dùng ở vị trí ${index}.`,
                      false,
                      30000
                    );
                    return;
                  }
                } else {
                  await sendMessageStateQuote(
                    api,
                    message,
                    `❌ index không hợp lệ! Vui lòng dùng số từ 1 đến ${blockedUsers.length}.\n\n💡 Dùng "${prefix}${aliasCommand} friend listblock" để xem danh sách.`,
                    false,
                    30000
                  );
                  return;
                }
              } else {
                await sendMessageStateQuote(
                  api,
                  message,
                  `❌ Danh sách đã hết hạn. Vui lòng dùng "${prefix}${aliasCommand} friend listblock" để xem lại danh sách.`,
                  false,
                  30000
                );
                return;
              }
            } else {
              const userIdArg = argsArray[1];
              if (userIdArg) {
                mentions.push({
                  uid: String(userIdArg),
                  dName: null
                });
              }
            }
          } else {
            const userIdArg = argsArray[1];
            if (userIdArg) {
              mentions.push({
                uid: String(userIdArg),
                dName: null
              });
            }
          }
        }

        if (mentions.length === 0 && message.data?.reply) {
          mentions.push({
            uid: message.data.reply.uid,
            dName: message.data.reply.dName || "Người dùng"
          });
        }

        if (mentions.length === 0) {
          await sendMessageStateQuote(
            api,
            message,
            `Dùng "${prefix}${aliasCommand} friend unblock [index/@mention/reply/all]" để bỏ chặn bạn bè!\n\n💡 Ví dụ:\n${prefix}${aliasCommand} friend unblock 1\n${prefix}${aliasCommand} friend unblock @user\n${prefix}${aliasCommand} friend unblock 123456789\n${prefix}${aliasCommand} friend unblock all\n\n💡 Dùng "${prefix}${aliasCommand} friend listblock" để xem danh sách trước.`,
            false,
            30000
          );
          return;
        }

        const successList = [];
        await Promise.all(
          mentions.map(async mention => {
            try {
              await api.unblockUser(mention.uid);
              successList.push({
                uid: mention.uid,
                dName: mention.dName || null
              });
            } catch (err) {
              console.error(`❌ Lỗi khi bỏ chặn bạn bè ${mention.uid}:`, err.message || err);
            }
          })
        );

        if (successList.length === 0) {
          await sendMessageStateQuote(
            api,
            message,
            `❌ Không thể bỏ chặn bạn bè nào.`,
            false,
            30000
          );
          return;
        }

        const uidsToFetch = successList.filter(m => !m.dName).map(m => m.uid);
        let userInfos = {};
        if (uidsToFetch.length > 0) {
          try {
            userInfos = await getUsersInfoBasic(api, uidsToFetch);
          } catch (error) {
            console.error("Error getting user info:", error);
          }
        }

        let messageText = `✅ Đã bỏ chặn tin nhắn: `;
        let currentPos = messageText.length;
        const mentionList = [];
        
        successList.forEach(mention => {
          let displayName = mention.dName;
          if (!displayName) {
            const userInfo = userInfos[mention.uid];
            displayName = userInfo?.displayName || userInfo?.zaloName || `ID ${mention.uid}`;
          }
          const nameText = `${displayName}\n`;
          const pos = currentPos;
          messageText += nameText;
          mentionList.push({
            uid: mention.uid,
            len: displayName.length,
            pos: pos
          });
          currentPos += nameText.length;
        });

        await sendMessageStateQuote(
          api,
          message,
          messageText.trim(),
          true,
          30000
        );
      } catch (error) {
        console.error("❌ Lỗi khi bỏ chặn bạn bè:", error);
        await sendMessageWarning(api, message, `❌ Lỗi khi bỏ chặn bạn bè: ${error.message}`, false);
      }
      return;
    }

    if (argsArray[0].toLowerCase() === "listblockfriend") {
      try {
        let page = 1;
        let count = 50;
        let getAllPages = false;

        if (argsArray.length > 1 && argsArray[1] !== "") {
          const pageArg = parseInt(argsArray[1]);
          if (!isNaN(pageArg) && pageArg > 0) {
            page = pageArg;
            getAllPages = false; 
          }
        } else {
          getAllPages = true;
        }

        if (argsArray.length > 2 && argsArray[2] !== "") {
          const countArg = parseInt(argsArray[2]);
          if (!isNaN(countArg) && countArg > 0) {
            count = countArg;
          }
        }

        let allBlockedUsers = [];
        let hasMore = false;
        let currentPage = page;

        if (getAllPages) {
          let continueFetching = true;
          
          while (continueFetching) {
            const response = await api.getFriendBlockList(currentPage, count);
            let blockedUsers = [];
            let currentHasMore = false;

            if (response) {
              if (Array.isArray(response)) {
                blockedUsers = response;
              } else if (response.data && Array.isArray(response.data)) {
                blockedUsers = response.data;
                currentHasMore = response.hasMore || false;
              } else if (response.list && Array.isArray(response.list)) {
                blockedUsers = response.list;
                currentHasMore = response.hasMore || false;
              } else if (response.data && response.data.list && Array.isArray(response.data.list)) {
                blockedUsers = response.data.list;
                currentHasMore = response.data.hasMore || response.hasMore || false;
              } else if (response.items && Array.isArray(response.items)) {
                blockedUsers = response.items;
                currentHasMore = response.hasMore || false;
              } else if (typeof response === 'object') {
                for (const key in response) {
                  if (Array.isArray(response[key])) {
                    blockedUsers = response[key];
                    break;
                  }
                }
                currentHasMore = response.hasMore || false;
              }
            }

            if (blockedUsers.length > 0) {
              allBlockedUsers = [...allBlockedUsers, ...blockedUsers];
              
              if (blockedUsers.length < count) {
                continueFetching = false;
                hasMore = false;
              } else if (currentHasMore === false) {
                continueFetching = false;
                hasMore = false;
              } else {
                continueFetching = true;
                hasMore = currentHasMore;
                currentPage++;
              }
            } else {
              continueFetching = false;
              hasMore = false;
            }

            if (currentPage > 100) {
              continueFetching = false;
            }
          }
        } else {
          const response = await api.getFriendBlockList(page, count);

          if (response) {
            if (Array.isArray(response)) {
              allBlockedUsers = response;
            } else if (response.data && Array.isArray(response.data)) {
              allBlockedUsers = response.data;
              hasMore = response.hasMore || false;
            } else if (response.list && Array.isArray(response.list)) {
              allBlockedUsers = response.list;
              hasMore = response.hasMore || false;
            } else if (response.data && response.data.list && Array.isArray(response.data.list)) {
              allBlockedUsers = response.data.list;
              hasMore = response.data.hasMore || response.hasMore || false;
            } else if (response.items && Array.isArray(response.items)) {
              allBlockedUsers = response.items;
              hasMore = response.hasMore || false;
            } else if (typeof response === 'object') {
              for (const key in response) {
                if (Array.isArray(response[key])) {
                  allBlockedUsers = response[key];
                  break;
                }
              }
              hasMore = response.hasMore || false;
            }
          }
        }

        const blockedUsers = allBlockedUsers;

        if (!blockedUsers || blockedUsers.length === 0) {
          await sendMessageQuery(
            api,
            message,
              `❌ Không tìm thấy bạn bè nào bị chặn.`,
            true
          );
          return;
        }

        const botId = api.getBotId();
        const userId = message.data?.uidFrom;
        if (!friendBlockListCache[botId]) {
          friendBlockListCache[botId] = {};
        }
        friendBlockListCache[botId][userId] = {
          list: blockedUsers,
          timestamp: Date.now()
        };

        const userIds = blockedUsers.map(user => String(user.uid || user.userId)).filter(Boolean);
        let userInfos = {};
        if (userIds.length > 0) {
          try {
            userInfos = await getUsersInfoBasic(api, userIds);
          } catch (error) {
            console.error("Error getting user info for block list:", error);
          }
        }

        const listItems = blockedUsers.map((user, index) => {
          const uid = String(user.uid || user.userId || "");
          const userInfo = userInfos[uid] || {};
          const name = user.displayName || user.zaloName || userInfo.displayName || userInfo.zaloName || `Người dùng ${index + 1}`;
          const avatar = user.avatar || userInfo.avatar || null;
          
          return {
            name: name,
            avatar: avatar,
            info: "Đã bị chặn",
            badge: null,
          };
        });

        const maxItemsPerCanvas = 150;
        const totalItems = listItems.length;
        
        if (totalItems <= maxItemsPerCanvas) {
          let imagePath = null;
          try {
            imagePath = await createListImage(
              { 
                columnCount: blockedUsers.length > 10 ? 2 : 1,
                backgroundColor: {
                  start: "rgba(220, 38, 38, 0.9)",
                  end: "rgba(17, 24, 39, 0.95)",
                }
              },
              listItems,
              {
                mainTitle: "DANH SÁCH BẠN BÈ BỊ CHẶN",
                subTitle: `Tổng: ${blockedUsers.length} người${hasMore ? " (còn tiếp)" : ""}`,
                icon: "🚫",
              }
            );
            await sendMessageFromSQL(api, message, {success: true, message: ``}, false, 600000);
            await api.sendMessage(
              {
                msg: "",
                attachments: [imagePath],
                quote: message,
                ttl: 600000,
                isUseProphylactic: true,
              },
              message.threadId,
              message.type
            );

            if (imagePath) {
              try {
                await cv.clearImagePath(imagePath);
              } catch (cleanupError) {
                console.error("Error cleaning up image:", cleanupError);
              }
            }
          } catch (error) {
            console.error("❌ Lỗi khi tạo canvas cho danh sách block list:", error);
            await sendMessageQuery(
              api,
              message,
              `🚫 Danh sách bạn bè bị chặn (${blockedUsers.length}):\n\n` +
              blockedUsers.map((user, index) => {
                const name = user.displayName || user.zaloName || `Người dùng ${index + 1}`;
                return `${index + 1}. ${name}`;
              }).join("\n") +
              (hasMore ? `\n\n💡 Dùng: ${prefix}${aliasCommand} friend listblock ${page + 1} để xem trang tiếp theo` : "") +
              `\n💡 Dùng: ${prefix}${aliasCommand} friend unblock [index/@user/reply] để bỏ chặn`,
              true
            );
          }
        } else {
          const totalPages = Math.ceil(totalItems / maxItemsPerCanvas);
          const imagePaths = [];
          
          try {
            for (let i = 0; i < totalPages; i++) {
              const startIndex = i * maxItemsPerCanvas;
              const endIndex = Math.min(startIndex + maxItemsPerCanvas, totalItems);
              const pageItems = listItems.slice(startIndex, endIndex);
              
              const imagePath = await createListImage(
                { 
                  columnCount: pageItems.length > 10 ? 2 : 1,
                  backgroundColor: {
                    start: "rgba(220, 38, 38, 0.9)",
                    end: "rgba(17, 24, 39, 0.95)",
                  }
                },
                pageItems,
                {
                  mainTitle: "DANH SÁCH BẠN BÈ BỊ CHẶN",
                  subTitle: `Trang ${i + 1}/${totalPages} - ${startIndex + 1}-${endIndex}/${totalItems} người${hasMore ? " (còn tiếp)" : ""}`,
                  icon: "🚫",
                }
              );
              
              imagePaths.push(imagePath);
            }

            for (const imagePath of imagePaths) {
              await api.sendMessage(
                {
                  msg: "",
                  attachments: [imagePath],
                  quote: message,
                  ttl: 600000,
                  isUseProphylactic: true,
                },
                message.threadId,
                message.type
              );

              if (imagePath) {
                try {
                  await cv.clearImagePath(imagePath);
                } catch (cleanupError) {
                  console.error("Error cleaning up image:", cleanupError);
                }
              }
            }
          } catch (error) {
            console.error("❌ Lỗi khi tạo canvas cho danh sách block list:", error);
            for (const imagePath of imagePaths) {
              try {
                await cv.clearImagePath(imagePath);
              } catch (cleanupError) {
                console.error("Error cleaning up image:", cleanupError);
              }
            }
            await sendMessageQuery(
              api,
              message,
              `🚫 Danh sách bạn bè bị chặn (${blockedUsers.length}):\n\n` +
              blockedUsers.map((user, index) => {
                const name = user.displayName || user.zaloName || `Người dùng ${index + 1}`;
                return `${index + 1}. ${name}`;
              }).join("\n") +
              (hasMore ? `\n\n💡 Dùng: ${prefix}${aliasCommand} friend listblock ${page + 1} để xem trang tiếp theo` : "") +
              `\n💡 Dùng: ${prefix}${aliasCommand} friend unblock [index/@user/reply] để bỏ chặn`,
              true
            );
          }
        }
      } catch (error) {
        console.error("❌ Lỗi khi lấy danh sách bạn bè bị chặn:", error);
        await sendMessageWarning(api, message, `❌ Lỗi khi lấy danh sách bạn bè bị chặn: ${error.message}`, false);
      }
      return;
    }

    if (argsArray[0].toLowerCase() === "settings") {
      const settingsArgs = argsArray.slice(1);

      if (settingsArgs.length === 0 || (settingsArgs.length === 1 && settingsArgs[0] === "")) {
        const botId = api.getBotId();
        let currentSettings = loadSettings(botId);

        let settingsText = `⚙️ Danh sách cài đặt:\n\nDùng: ${prefix}${aliasCommand} settings [thứ tự] [giá trị]\n\n`;
        settingsConfig.forEach((setting, index) => {
          let currentValue = currentSettings[setting.key];
          if (currentValue === undefined || currentValue === null) {
            currentValue = setting.key === "archivedChatStatus" ? 0 : 1;
          }
          currentValue = Number(currentValue);
          
          settingsText += `${index + 1}. ${setting.name}: ${currentValue}\n`;
          settingsText += "   Giá trị:\n";
          setting.values.forEach((valueOption) => {
            const valueOptionVal = Number(valueOption.val);
            const isSelected = valueOptionVal === currentValue;
            
            const marker = isSelected ? "『 " : "   ";
            const endMarker = isSelected ? " 』" : "";
            settingsText += `${marker}${valueOption.val} -> ${valueOption.label}${endMarker}\n`;
          });
          if (index < settingsConfig.length - 1) {
            settingsText += "\n";
          }
        });
        await sendMessageQuery(api, message, settingsText, false);
        return;
      }

      if (settingsArgs.length < 2) {
        await sendMessageQuery(
          api,
          message,
          `⚠️ Cú pháp: ${prefix}${aliasCommand} settings [thứ tự] [giá_trị]\n\n` +
            `Ví dụ: ${prefix}${aliasCommand} settings 2 1\n` +
            `(Thứ tự 2 = Trạng Thái Truy Cập, giá trị 1 = Mở)`,
          true
        );
        return;
      }

      const order = parseInt(settingsArgs[0]);
      const value = parseInt(settingsArgs[1]);

      if (isNaN(order) || isNaN(value)) {
        await sendMessageWarning(api, message, "⚠️ Thứ tự và giá trị phải là số!", false);
        return;
      }

      if (order < 1 || order > settingsConfig.length) {
        await sendMessageWarning(api, message, `⚠️ Thứ tự phải từ 1 đến ${settingsConfig.length}!`, false);
        return;
      }

      const selectedSetting = settingsConfig[order - 1];
      const type = selectedSetting.key;

      const validValues = selectedSetting.values.map(v => v.val);
      if (!validValues.includes(value)) {
        await sendMessageWarning(api, message, `⚠️ Giá trị không hợp lệ! Các giá trị hợp lệ: ${validValues.join(", ")}`, false);
        return;
      }

      await api.updateSettings(type, value);
      
      const botId = api.getBotId();
      const currentSettings = loadSettings(botId);
      currentSettings[type] = value;
      saveSettings(botId, currentSettings);
      
      const valueLabel = selectedSetting.values.find(v => v.val === value)?.label || value;
      
      await sendMessageComplete(api, message, `✅ Đã cập nhật cài đặt "${selectedSetting.name}" thành ${valueLabel}!`, true);
      return;
    }

    if (argsArray[0].toLowerCase() === "setting") {
      const profileArgs = argsArray.slice(1);
      const parts = profileArgs;

      if (parts.length === 0) {
        await sendMessageWarning(api, message, "⚠️ Vui lòng nhập tên hoặc đầy đủ: tên, ngày sinh (YYYY-MM-DD), giới tính (0/1/2)", false);
        return;
      }

      const dobPattern = /^\d{4}-\d{2}-\d{2}$/;
      let hasDob = false;
      for (let i = 0; i < parts.length; i++) {
        if (dobPattern.test(parts[i])) {
          hasDob = true;
          break;
        }
      }

      if (!hasDob) {
        const name = parts.join(" ").trim();
        if (!name) {
          await sendMessageWarning(api, message, "⚠️ Vui lòng nhập tên hợp lệ!", false);
          return;
        }

        let currentProfile;
        try {
          const profileResponse = await api.getProfileMe();
          currentProfile = profileResponse.profile;
        } catch (error) {
          await sendMessageWarning(api, message, "⚠️ Không thể lấy thông tin profile hiện tại!", false);
          return;
        }

        const formatDobToYYYYMMDD = (dob) => {
          if (!dob) return "2000-01-01";
          if (typeof dob === "string" && /^\d{4}-\d{2}-\d{2}$/.test(dob)) {
            return dob;
          }
          if (typeof dob === "number") {
            const date = new Date(dob * 1000);
            const year = date.getFullYear();
            const month = String(date.getMonth() + 1).padStart(2, "0");
            const day = String(date.getDate()).padStart(2, "0");
            return `${year}-${month}-${day}`;
          }
          try {
            const date = new Date(dob);
            if (!isNaN(date.getTime())) {
              const year = date.getFullYear();
              const month = String(date.getMonth() + 1).padStart(2, "0");
              const day = String(date.getDate()).padStart(2, "0");
              return `${year}-${month}-${day}`;
            }
          } catch (e) {
          }
          return "2000-01-01";
        };

        const getGenderValue = (gender) => {
          if (gender === undefined || gender === null) return 0;
          const genderNum = typeof gender === "string" ? parseInt(gender) : gender;
          return isNaN(genderNum) ? 0 : genderNum;
        };

        const payload = {
          profile: {
            name: name,
            dob: formatDobToYYYYMMDD(currentProfile.dob || currentProfile.sdob),
            gender: getGenderValue(currentProfile.gender),
          },
        };

        await api.updateProfile(payload);
        await sendMessageComplete(api, message, `✅ Đã cập nhật tên: ${name}`, true);
        return;
      }

      if (parts.length < 3) {
        await sendMessageWarning(api, message, "⚠️ Vui lòng nhập đủ: tên, ngày sinh (YYYY-MM-DD), giới tính (0/1/2)", false);
        return;
      }

      let dob = null;
      let gender = null;
      let nameParts = [];

      for (let i = 0; i < parts.length; i++) {
        if (dobPattern.test(parts[i])) {
          dob = parts[i];
          nameParts = parts.slice(0, i);
          if (i + 1 < parts.length) {
            const genderValue = parseInt(parts[i + 1]);
            if (!isNaN(genderValue) && [0, 1, 2].includes(genderValue)) {
              gender = genderValue;
            }
          }
          break;
        }
      }

      if (!dob && parts.length >= 3) {
        const lastPart = parseInt(parts[parts.length - 1]);
        if (!isNaN(lastPart) && [0, 1, 2].includes(lastPart)) {
          gender = lastPart;
          const secondLast = parts[parts.length - 2];
          if (dobPattern.test(secondLast)) {
            dob = secondLast;
            nameParts = parts.slice(0, -2);
          }
        }
      }

      if (!dob || !nameParts.length) {
        await sendMessageWarning(api, message, "⚠️ Không tìm thấy ngày sinh hợp lệ (YYYY-MM-DD)!", false);
        return;
      }

      if (gender === null) {
        await sendMessageWarning(api, message, "⚠️ Vui lòng nhập giới tính: 0 = Nam, 1 = Nữ, 2 = Khác", false);
        return;
      }

      const name = nameParts.join(" ");

      const payload = {
        profile: {
          name: name,
          dob: dob,
          gender: gender,
        },
      };

      await api.updateProfile(payload);
      const genderText = gender === 0 ? "Nam" : gender === 1 ? "Nữ" : "Khác";
      await sendMessageComplete(api, message, `✅ Đã cập nhật thông tin:\n- Tên: ${name}\n- Ngày sinh: ${dob}\n- Giới tính: ${genderText}`, true);
      return;
    }

    if (argsArray[0].toLowerCase() === "friendalias") {
      try {
        const parts = argsArray.slice(1);
        const isRemove = parts[0]?.toLowerCase() === "remove";
        
        if (isRemove) {
          const removeParts = parts.slice(1);
          let friendId = null;
          
          const mentions = message.data?.mentions || [];
          
          if (mentions.length > 0) {
            friendId = String(mentions[0].uid);
          } else if (removeParts.length >= 1) {
            friendId = removeParts[0];
          } else {
            await sendMessageWarning(
              api,
              message,
              `❌ Thiếu thông tin!\n\n💡 Cách sử dụng:\n${prefix}${aliasCommand} friendalias remove [@user hoặc userId]\n\nVí dụ:\n${prefix}${aliasCommand} friendalias remove @user\n${prefix}${aliasCommand} friendalias remove 123456789`,
              false
            );
            return;
          }

          if (!friendId) {
            await sendMessageWarning(
              api,
              message,
              `❌ Vui lòng mention người dùng hoặc nhập friendId!\n\n💡 Cách sử dụng:\n${prefix}${aliasCommand} friendalias remove [@user hoặc userId]`,
              false
            );
            return;
          }

          friendId = String(friendId);
          await api.removeFriendAlias(friendId);
          await sendMessageComplete(api, message, `✅ Đã xóa biệt danh thành công!`, true);
        } else {
          let friendId = null;
          let alias = null;
          
          const mentions = message.data?.mentions || [];
          
          if (mentions.length > 0) {
            friendId = String(mentions[0].uid);
            if (parts.length > 0) {
              alias = parts.join(" ").trim();
            }
          } else if (parts.length >= 2) {
            friendId = parts[0];
            alias = parts.slice(1).join(" ").trim();
          } else {
            await sendMessageWarning(
              api,
              message,
              `❌ Thiếu thông tin!\n\n💡 Cách sử dụng:\n${prefix}${aliasCommand} friendalias [@user hoặc userId] [biệt danh mới]\n\nVí dụ:\n${prefix}${aliasCommand} friendalias @user Tên mới\n${prefix}${aliasCommand} friendalias 123456789 Tên mới`,
              false
            );
            return;
          }

          if (!friendId) {
            await sendMessageWarning(
              api,
              message,
              `❌ Vui lòng mention người dùng hoặc nhập friendId!\n\n💡 Cách sử dụng:\n${prefix}${aliasCommand} friendalias [@user hoặc userId] [biệt danh mới]`,
              false
            );
            return;
          }

          if (!alias || alias.length === 0) {
            await sendMessageWarning(
              api,
              message,
              `❌ Vui lòng nhập biệt danh mới!\n\n💡 Cách sử dụng:\n${prefix}${aliasCommand} friendalias [@user hoặc userId] [biệt danh mới]`,
              false
            );
            return;
          }

          friendId = String(friendId);
          await api.changeFriendAlias(alias, friendId);
          await sendMessageComplete(api, message, `✅ Đã đổi biệt danh thành công!`, true);
        }
      } catch (error) {
        console.error("❌ Lỗi khi xử lý biệt danh:", error);
        await sendMessageWarning(api, message, `❌ Lỗi: ${error.message || error}`, false);
      }
      return;
    }

    if (argsArray[0].toLowerCase() === "changefriendalias" || argsArray[0].toLowerCase() === "setalias") {
      try {
        const parts = argsArray.slice(1);
        let friendId = null;
        let alias = null;
        
        const mentions = message.data?.mentions || [];
        
        if (mentions.length > 0) {
          friendId = String(mentions[0].uid);
          if (parts.length > 0) {
            alias = parts.join(" ").trim();
          }
        } else if (parts.length >= 2) {
          friendId = parts[0];
          alias = parts.slice(1).join(" ").trim();
        } else {
          await sendMessageWarning(
            api,
            message,
            `❌ Thiếu thông tin!\n\n💡 Cách sử dụng:\n${prefix}${aliasCommand} changefriendalias [@user hoặc userId] [biệt danh mới]\n\nVí dụ:\n${prefix}${aliasCommand} changefriendalias @user Tên mới\n${prefix}${aliasCommand} changefriendalias 123456789 Tên mới`,
            false
          );
          return;
        }

        if (!friendId) {
          await sendMessageWarning(
            api,
            message,
            `❌ Vui lòng mention người dùng hoặc nhập friendId!\n\n💡 Cách sử dụng:\n${prefix}${aliasCommand} changefriendalias [@user hoặc userId] [biệt danh mới]`,
            false
          );
          return;
        }

        if (!alias || alias.length === 0) {
          await sendMessageWarning(
            api,
            message,
            `❌ Vui lòng nhập biệt danh mới!\n\n💡 Cách sử dụng:\n${prefix}${aliasCommand} changefriendalias [@user hoặc userId] [biệt danh mới]`,
            false
          );
          return;
        }

        friendId = String(friendId);
        await api.changeFriendAlias(alias, friendId);
        await sendMessageComplete(api, message, `✅ Đã đổi biệt danh thành công!`, true);
      } catch (error) {
        console.error("❌ Lỗi khi đổi biệt danh:", error);
        await sendMessageWarning(api, message, `❌ Lỗi khi đổi biệt danh: ${error.message || error}`, false);
      }
      return;
    }

    if (argsArray[0].toLowerCase() === "removefriendalias" || argsArray[0].toLowerCase() === "removealias" || argsArray[0].toLowerCase() === "deletealias") {
      try {
        const parts = argsArray.slice(1);
        let friendId = null;
        
        const mentions = message.data?.mentions || [];
        
        if (mentions.length > 0) {
          friendId = String(mentions[0].uid);
        } else if (parts.length >= 1) {
          friendId = parts[0];
        } else {
          await sendMessageWarning(
            api,
            message,
            `❌ Thiếu thông tin!\n\n💡 Cách sử dụng:\n${prefix}${aliasCommand} removefriendalias [@user hoặc userId]\n\nVí dụ:\n${prefix}${aliasCommand} removefriendalias @user\n${prefix}${aliasCommand} removefriendalias 123456789`,
            false
          );
          return;
        }

        if (!friendId) {
          await sendMessageWarning(
            api,
            message,
            `❌ Vui lòng mention người dùng hoặc nhập friendId!\n\n💡 Cách sử dụng:\n${prefix}${aliasCommand} removefriendalias [@user hoặc userId]`,
            false
          );
          return;
        }

        friendId = String(friendId);
        await api.removeFriendAlias(friendId);
        await sendMessageComplete(api, message, `✅ Đã xóa biệt danh thành công!`, true);
      } catch (error) {
        console.error("❌ Lỗi khi xóa biệt danh:", error);
        await sendMessageWarning(api, message, `❌ Lỗi khi xóa biệt danh: ${error.message || error}`, false);
      }
      return;
    }

    await sendMessageQuery(
      api,
      message,
      `⚠️ Cú pháp không hợp lệ!\n\n` +
        `• Đổi tên: ${prefix}${aliasCommand} setting [tên]\n` +
        `• Cập nhật Profile: ${prefix}${aliasCommand} setting [tên] [ngày_sinh] [giới_tính]\n` +
        `• Đổi biệt danh bạn bè: ${prefix}${aliasCommand} friendalias [@user hoặc userId] [biệt danh mới]\n` +
        `• Xóa biệt danh bạn bè: ${prefix}${aliasCommand} friendalias remove [@user hoặc userId]\n` +
        `• Đổi ảnh đại diện: ${prefix}${aliasCommand} avatar (reply ảnh/gửi ảnh/URL)\n` +
        `• Sử dụng lại avatar cũ: ${prefix}${aliasCommand} avatarOld [index]\n` +
        `• Danh sách avatar: ${prefix}${aliasCommand} avatarOld\n` +
        `• Xóa avatar: ${prefix}${aliasCommand} avatarOld remove [index/photoId1] [index/photoId2] ...\n` +
        `• Gửi lời mời kết bạn: ${prefix}${aliasCommand} friend add (@user/reply)\n` +
        `• Hủy kết bạn: ${prefix}${aliasCommand} friend remove (@user/reply)\n` +
        `• Chấp nhận lời mời: ${prefix}${aliasCommand} friend accept (@user/reply)\n` +
        `• Từ chối lời mời: ${prefix}${aliasCommand} friend reject (@user/reply)\n` +
        `• Danh sách lời mời: ${prefix}${aliasCommand} friend list [trang]\n` +
        `• Hủy lời mời đã gửi: ${prefix}${aliasCommand} friend undo [index/@user/reply]\n` +
        `• Xem danh sách group đang được mời: ${prefix}${aliasCommand} group list\n` +
        `• Tham gia group được mời: ${prefix}${aliasCommand} group join [index/groupId]\n` +
        `• Từ chối group được mời: ${prefix}${aliasCommand} group reject [index/groupId]\n` +
        `• Cài đặt Settings: ${prefix}${aliasCommand} settings [thứ tự] [giá trị]\n`,
      true
    );
  } catch (error) {
    console.error("Error handling update profile/settings:", error);
    await sendMessageWarning(api, message, `❌ Lỗi: ${error.message}`, false);
  }
}
const spamPollSessions = new Map();

export async function handleSpamPoll(api, message, aliasCommand, groupInfo) {
  const content = removeMention(message);
  const prefix = getGlobalPrefix(api.getBotId());
  const threadId = message.threadId;
  
  if (message.type !== MessageType.GroupMessage) {
    await sendMessageWarning(api, message, "⚠️ Lệnh này chỉ có thể sử dụng trong nhóm!", false);
    return;
  }

  const groupId = groupInfo?.groupId || threadId;
  if (!groupId) {
    await sendMessageWarning(api, message, "❌ Không tìm thấy ID nhóm!", false);
    return;
  }

  try {
    const args = content.replace(`${prefix}${aliasCommand}`, "").trim();
    
    let session = spamPollSessions.get(threadId);
    if (!session) {
      session = {
        isSpamming: false,
        pollOptions: null,
        delay: 5000,  
        interval: null,
        groupId: groupId,
        api: api, 
        threadId: threadId, 
      };
      spamPollSessions.set(threadId, session);
    } else {
      session.api = api;
      session.threadId = threadId;
    }

    if (args.toLowerCase() === "stop") {
      if (session.isSpamming) {
        clearInterval(session.interval);
        session.isSpamming = false;
        session.interval = null;
        await sendMessageComplete(api, message, "✅ Đã dừng spam poll!", true, 30000);
        return;
      }
      await sendMessageWarning(api, message, "⚠️ Không có spam poll nào đang chạy!", false);
      return;
    }

    if (args.toLowerCase().startsWith("delay|")) {
      const newDelay = parseInt(args.split("|")[1]);
      if (isNaN(newDelay) || newDelay < 1000) {
        await sendMessageWarning(api, message, "⚠️ Delay phải >= 1000ms (1 giây)!", false);
        return;
      }
      session.delay = newDelay;
      if (session.isSpamming) {
        clearInterval(session.interval);
        session.interval = setInterval(() => {
          createPollInSession(api, threadId, session);
        }, session.delay);
      }
      await sendMessageComplete(api, message, `✅ Đã đổi delay thành ${session.delay}ms (${Math.floor(session.delay / 1000)}s)!`, true, 30000);
      return;
    }

    if (!args) {
      await sendMessageQuery(
        api,
        message,
        `📊 Cú pháp spam poll:\n\n` +
        `${prefix}${aliasCommand} "<câu hỏi>" | <lựa chọn 1> | <lựa chọn 2> | ... | delay=<giây>\n\n` +
        `Ví dụ:\n` +
        `${prefix}${aliasCommand} "Bạn thích mùa nào?" | Xuân | Hè | Thu | Đông | delay=10\n\n` +
        `Tùy chọn:\n` +
        `- multi: Cho phép chọn nhiều đáp án\n` +
        `- add: Cho phép thêm lựa chọn mới\n` +
        `- hide: Ẩn kết quả trước khi vote\n` +
        `- anon: Ẩn danh\n` +
        `- time=<phút>: Thời gian hết hạn\n` +
        `- delay=<giây>: Khoảng thời gian giữa các poll (mặc định: 5s)\n\n` +
        `Lệnh khác:\n` +
        `${prefix}${aliasCommand} stop - Dừng spam poll\n` +
        `${prefix}${aliasCommand} delay|<ms> - Đổi delay (ví dụ: delay|10000)`,
        true
      );
      return;
    }

    let question = "";
    let options = [];
    let allowMultiChoices = false;
    let allowAddNewOption = false;
    let hideVotePreview = false;
    let isAnonymous = false;
    let expiredTime = 0;
    let delay = 5000; 

    const parts = args.split("|").map(p => p.trim()).filter(p => p);
    
    if (parts.length < 2) {
      await sendMessageWarning(api, message, "⚠️ Vui lòng nhập câu hỏi và ít nhất 2 lựa chọn!\nSử dụng dấu | để phân cách.", false);
      return;
    }

    question = parts[0].replace(/^["']|["']$/g, "").trim();
    
    if (!question) {
      await sendMessageWarning(api, message, "⚠️ Câu hỏi không được để trống!", false);
      return;
    }

    for (let i = 1; i < parts.length; i++) {
      const part = parts[i].toLowerCase();
      if (part === "multi") {
        allowMultiChoices = true;
      } else if (part === "add") {
        allowAddNewOption = true;
      } else if (part === "hide") {
        hideVotePreview = true;
      } else if (part === "anon") {
        isAnonymous = true;
      } else if (part.startsWith("time=")) {
        const minutes = parseInt(part.replace("time=", ""));
        if (!isNaN(minutes) && minutes > 0) {
          expiredTime = minutes * 60 * 1000;
        }
      } else if (part.startsWith("delay=")) {
        const seconds = parseInt(part.replace("delay=", ""));
        if (!isNaN(seconds) && seconds >= 1) {
          delay = seconds * 1000;
        }
      } else {
        const option = parts[i].trim();
        if (option) {
          options.push(option);
        }
      }
    }

    if (options.length < 2) {
      await sendMessageWarning(api, message, "⚠️ Poll cần ít nhất 2 lựa chọn!", false);
      return;
    }

    if (options.length > 10) {
      await sendMessageWarning(api, message, "⚠️ Poll chỉ được tối đa 10 lựa chọn!", false);
      return;
    }

    session.pollOptions = {
      question: question,
      options: options,
      expiredTime: expiredTime,
      allowMultiChoices: allowMultiChoices,
      allowAddNewOption: allowAddNewOption,
      hideVotePreview: hideVotePreview,
      isAnonymous: isAnonymous,
    };
    session.delay = delay;
    session.groupId = groupId;

    if (session.isSpamming) {
      clearInterval(session.interval);
    }

    session.isSpamming = true;
    session.interval = setInterval(() => {
      createPollInSession(api, threadId, session);
    }, session.delay);
    await createPollInSession(api, threadId, session);

    let successMsg = `✅ Đã bắt đầu spam poll!\n\n`;
    successMsg += `📊 Câu hỏi: ${question}\n`;
    successMsg += `📝 Lựa chọn:\n`;
    options.forEach((opt, idx) => {
      successMsg += `   ${idx + 1}. ${opt}\n`;
    });
    successMsg += `\n⏱ Delay: ${Math.floor(delay / 1000)} giây\n`;
    if (allowMultiChoices) successMsg += `✓ Cho phép chọn nhiều đáp án\n`;
    if (allowAddNewOption) successMsg += `✓ Cho phép thêm lựa chọn mới\n`;
    if (hideVotePreview) successMsg += `✓ Ẩn kết quả trước khi vote\n`;
    if (isAnonymous) successMsg += `✓ Ẩn danh\n`;
    if (expiredTime > 0) {
      const minutes = Math.floor(expiredTime / 60000);
      successMsg += `⏰ Hết hạn sau: ${minutes} phút\n`;
    }
    successMsg += `\n💡 Dùng: ${prefix}${aliasCommand} stop để dừng`;

    await sendMessageComplete(api, message, successMsg, true, 60000);
  } catch (error) {
    console.error("Error handling spam poll:", error);
    await sendMessageWarning(api, message, `❌ Lỗi khi spam poll: ${error.message || error}`, false);
  }
}

async function createPollInSession(api, threadId, session) {
  try {
    if (!session.pollOptions || !session.groupId) {
      return;
    }

    const result = await api.createPoll(session.pollOptions, session.groupId);
    const pollId = result?.pollId || result?.data?.pollId || result?.poll?.pollId || result?.id;
    
    if (result !== null && result !== undefined) {
      if (pollId) {
      } else {
      }
    } else {
      console.warn(`[Spam Poll] Result is null/undefined in thread ${threadId}`);
    }
  } catch (error) {
    console.error(`[Spam Poll] Error creating poll in thread ${threadId}:`, error);
    
    const errorMessage = error.message || "";
    const errorCode = error.code;
    
    const isPermissionError = 
      errorCode === 166 ||
      errorMessage.includes("Không đủ quyền") ||
      errorMessage.includes("permission") ||
      errorMessage.includes("quyền");
    const isRateLimit = 
      errorMessage.includes("rate limit") || 
      errorMessage.includes("too many");
    if ((isPermissionError || isRateLimit) && session && session.isSpamming) {
      clearInterval(session.interval);
      session.isSpamming = false;
      session.interval = null;
      if (isPermissionError && session.api && session.threadId) {
        try {
          await session.api.sendMessage({
            msg: "❌ Không đủ quyền. Bot cần là admin hoặc có quyền tạo poll trong nhóm.",
            ttl: 60000
          }, session.threadId, 1);
        } catch (notifyError) {
        }
      }
      
      const reason = isPermissionError ? "không đủ quyền" : "rate limit";
    }
  }
}

export async function handleCreatePoll(api, message, aliasCommand, groupInfo) {
  const content = removeMention(message);
  const prefix = getGlobalPrefix(api.getBotId());
  const threadId = message.threadId;
  if (message.type !== MessageType.GroupMessage) {
    await sendMessageWarning(api, message, "⚠️ Lệnh này chỉ có thể sử dụng trong nhóm!", false);
    return;
  }

  const groupId = groupInfo?.groupId || threadId;
  if (!groupId) {
    await sendMessageWarning(api, message, "❌ Không tìm thấy ID nhóm!", false);
    return;
  }

  try {
    const args = content.replace(`${prefix}${aliasCommand}`, "").trim();
    
    if (!args) {
      await sendMessageQuery(
        api,
        message,
        `📊 Cú pháp tạo poll:\n\n` +
        `${prefix}${aliasCommand} "<câu hỏi>" | <lựa chọn 1> | <lựa chọn 2> | ...\n\n` +
        `Ví dụ:\n` +
        `${prefix}${aliasCommand} "Bạn thích mùa nào nhất?" | Mùa xuân | Mùa hè | Mùa thu | Mùa đông\n\n` +
        `Tùy chọn nâng cao (thêm vào cuối):\n` +
        `- multi: Cho phép chọn nhiều đáp án\n` +
        `- add: Cho phép thêm lựa chọn mới\n` +
        `- hide: Ẩn kết quả trước khi vote\n` +
        `- anon: Ẩn danh (không hiển thị người vote)\n` +
        `- time=<phút>: Thời gian hết hạn (ví dụ: time=60)\n\n` +
        `Ví dụ đầy đủ:\n` +
        `${prefix}${aliasCommand} "Bạn thích mùa nào?" | Xuân | Hè | Thu | Đông multi time=60`,
        true
      );
      return;
    }

    let question = "";
    let options = [];
    let allowMultiChoices = false;
    let allowAddNewOption = false;
    let hideVotePreview = false;
    let isAnonymous = false;
    let expiredTime = 0;
    const parts = args.split("|").map(p => p.trim()).filter(p => p);
    
    if (parts.length < 2) {
      await sendMessageWarning(api, message, "⚠️ Vui lòng nhập câu hỏi và ít nhất 2 lựa chọn!\nSử dụng dấu | để phân cách.", false);
      return;
    }

    question = parts[0].replace(/^["']|["']$/g, "").trim();
    
    if (!question) {
      await sendMessageWarning(api, message, "⚠️ Câu hỏi không được để trống!", false);
      return;
    }

    for (let i = 1; i < parts.length; i++) {
      const part = parts[i].toLowerCase();
      
      if (part === "multi") {
        allowMultiChoices = true;
      } else if (part === "add") {
        allowAddNewOption = true;
      } else if (part === "hide") {
        hideVotePreview = true;
      } else if (part === "anon") {
        isAnonymous = true;
      } else if (part.startsWith("time=")) {
        const minutes = parseInt(part.replace("time=", ""));
        if (!isNaN(minutes) && minutes > 0) {
          expiredTime = minutes * 60 * 1000;
        }
      } else {
        const option = parts[i].trim();
        if (option) {
          options.push(option);
        }
      }
    }

    if (options.length < 2) {
      await sendMessageWarning(api, message, "⚠️ Poll cần ít nhất 2 lựa chọn!", false);
      return;
    }

    if (options.length > 10) {
      await sendMessageWarning(api, message, "⚠️ Poll chỉ được tối đa 10 lựa chọn!", false);
      return;
    }

    const pollOptions = {
      question: question,
      options: options,
      expiredTime: expiredTime,
      allowMultiChoices: allowMultiChoices,
      allowAddNewOption: allowAddNewOption,
      hideVotePreview: hideVotePreview,
      isAnonymous: isAnonymous,
    };

    const result = await api.createPoll(pollOptions, groupId);
    const pollId = result?.pollId || result?.data?.pollId || result?.poll?.pollId || result?.id;
    if (result !== null && result !== undefined) {
      if (pollId) {
      } else {
      }
      return;
    } else {
      console.error("[Create Poll] Result is null or undefined:", result);
      await sendMessageWarning(api, message, "❌ Không thể tạo poll. Vui lòng thử lại sau!", false);
    }
  } catch (error) {
    console.error("Error handling create poll:", error);
    
    const errorMessage = error.message || "";
    const errorCode = error.code;
    
    const isPermissionError = 
      errorCode === 166 ||
      errorMessage.includes("Không đủ quyền") ||
      errorMessage.includes("permission") ||
      errorMessage.includes("quyền");
    if (isPermissionError) {
      await sendMessageWarning(api, message, "❌ Không đủ quyền. Bot cần là admin hoặc có quyền tạo poll trong nhóm.", false);
      return;
    }
    
    await sendMessageWarning(api, message, `❌ Lỗi khi tạo poll: ${error.message || error}`, false);
  }
}

export async function handleSendReport(api, message, aliasCommand, groupInfo) {
  const content = removeMention(message);
  const prefix = getGlobalPrefix(api.getBotId());
  const threadId = message.threadId;
  
  let targetThreadId = null;
  let threadType = null;
  let reportReason = null;
  let reportContent = null;
  
  try {
    const args = content.replace(`${prefix}${aliasCommand}`, "").trim();
    
    if (!args) {
      await sendMessageQuery(
        api,
        message,
        `📢 Cú pháp báo cáo:\n\n` +
        `${prefix}${aliasCommand} <lý_do> [nội_dung]\n\n` +
        `Lý do báo cáo:\n` +
        `- sensitive (1): Nội dung nhạy cảm\n` +
        `- annoy (2): Quấy rối\n` +
        `- fraud (3): Lừa đảo\n` +
        `- other (0): Khác (cần nhập nội dung)\n\n` +
        `Ví dụ:\n` +
        `${prefix}${aliasCommand} sensitive\n` +
        `${prefix}${aliasCommand} other "Nội dung vi phạm cụ thể"\n\n` +
        `💡 Có thể reply tin nhắn để báo cáo người gửi hoặc mention user.`,
        true
      );
      return;
    }

    const quote = message.data?.quote;
    const mentions = message.data?.mentions || [];
    
    if (quote && quote.uidFrom) {
      targetThreadId = quote.uidFrom;
      threadType = ThreadType.User;
    } else if (mentions.length > 0) {
      targetThreadId = mentions[0].uid;
      threadType = ThreadType.User;
    } else if (message.type === MessageType.GroupMessage) {
      targetThreadId = groupInfo?.groupId || threadId;
      threadType = ThreadType.Group;
    } else {
      await sendMessageWarning(api, message, "⚠️ Vui lòng reply tin nhắn hoặc mention user để báo cáo!\n\n💡 Cách sử dụng:\n- Reply tin nhắn + lệnh\n- Mention user + lệnh", false);
      return;
    }

    const parts = args.split(/\s+/);
    const reasonStr = parts[0].toLowerCase();
    
    const reasonMap = {
      "sensitive": ReportReason.Sensitive,
      "1": ReportReason.Sensitive,
      "annoy": ReportReason.Annoy,
      "2": ReportReason.Annoy,
      "fraud": ReportReason.Fraud,
      "3": ReportReason.Fraud,
      "other": ReportReason.Other,
      "0": ReportReason.Other,
      "khác": ReportReason.Other,
    };

    reportReason = reasonMap[reasonStr];
    
    if (reportReason === undefined) {
      await sendMessageWarning(api, message, "⚠️ Lý do báo cáo không hợp lệ!\nLý do: sensitive, annoy, fraud, other", false);
      return;
    }

    if (reportReason === ReportReason.Other) {
      if (parts.length < 2) {
        await sendMessageWarning(api, message, "⚠️ Khi chọn lý do 'other', vui lòng nhập nội dung báo cáo!\nVí dụ: " + prefix + aliasCommand + " other \"Nội dung vi phạm\"", false);
        return;
      }
      reportContent = parts.slice(1).join(" ").trim();
      if (!reportContent) {
        await sendMessageWarning(api, message, "⚠️ Nội dung báo cáo không được để trống!", false);
        return;
      }
    }

    const reportOptions = {
      reason: reportReason,
      ...(reportContent && { content: reportContent }),
    };

    const result = await api.sendReport(reportOptions, targetThreadId, threadType);

    if (result && (result.reportId || result !== null)) {
      const reasonText = {
        [ReportReason.Sensitive]: "Nội dung nhạy cảm",
        [ReportReason.Annoy]: "Quấy rối",
        [ReportReason.Fraud]: "Lừa đảo",
        [ReportReason.Other]: "Khác",
      }[reportReason] || "Không xác định";

      let successMsg = `✅ Đã gửi báo cáo thành công!\n\n`;
      successMsg += `📋 Lý do: ${reasonText}\n`;
      if (reportContent) {
        successMsg += `📝 Nội dung: ${reportContent}\n`;
      }
      successMsg += `👤 Đối tượng: ${targetThreadId}\n`;
      if (result.reportId) {
        successMsg += `🆔 ID Báo cáo: ${result.reportId}`;
      }

      await sendMessageComplete(api, message, successMsg, true, 30000);
    } else {
      await sendMessageWarning(api, message, "❌ Không thể gửi báo cáo. Vui lòng thử lại sau!", false);
    }
  } catch (error) {
    console.error("Error handling send report:", error);
    console.error("Error details:", {
      code: error.code,
      message: error.message,
      targetThreadId,
      threadType,
      reportReason,
    });
    
    const errorMessage = error.message || "";
    const errorCode = error.code;
    
    const isPermissionError = 
      errorCode === 166 ||
      errorMessage.includes("Không đủ quyền") ||
      errorMessage.includes("permission") ||
      errorMessage.includes("quyền");
    
    if (isPermissionError) {
      await sendMessageWarning(api, message, "❌ Không đủ quyền để gửi báo cáo.", false);
      return;
    }
    
    if (errorCode === 112) {
      await sendMessageWarning(api, message, "❌ Không thể gửi báo cáo. Vui lòng thử lại hoặc kiểm tra đối tượng báo cáo có hợp lệ không.", false);
      return;
    }
    
    await sendMessageWarning(api, message, `❌ Lỗi khi gửi báo cáo: ${error.message || error}`, false);
  }
}

export async function handleAddQuickMessageCommand(api, message, prefix, aliasCommand) {
  try {
    const content = removeMention(message);
    const parts = content.trim().split(/\s+/);
    
    if (parts.length < 2) {
      const obj = {
        success: false,
        message: `❌ Vui lòng nhập payload JSON cho quick message!\n\n📝 Cấu trúc:\n{\"keyword\":\"từ_khóa\",\"title\":\"Nội dung\"}\n\n💡 Ví dụ:\n${prefix}${aliasCommand} {\"keyword\":\"ok\",\"title\":\"OK\"}\n\n${prefix}${aliasCommand} {\"keyword\":\"dongy\",\"title\":\"Đồng ý\"}\n\n📌 Lưu ý: Quick message được tạo sẽ có thể sử dụng bằng cách gõ từ khóa trong chat.`,
      };
      await sendMessageFromSQL(api, message, obj, false, 30000);
      return;
    }

    const jsonStr = parts.slice(1).join(" ");
    let addPayload;
    
    try {
      addPayload = JSON.parse(jsonStr);
    } catch (parseError) {
      const obj = {
        success: false,
        message: `❌ JSON không hợp lệ: ${parseError.message}\n\n📝 Cấu trúc đúng:\n{\"keyword\":\"từ_khóa\",\"title\":\"Nội dung\"}\n\n💡 Ví dụ:\n${prefix}${aliasCommand} {\"keyword\":\"ok\",\"title\":\"OK\"}`,
      };
      await sendMessageFromSQL(api, message, obj, false, 30000);
      return;
    }

    if (!addPayload.keyword) {
      const obj = {
        success: false,
        message: `❌ Thiếu trường "keyword"!\n\n📝 Cấu trúc:\n{\"keyword\":\"từ_khóa\",\"title\":\"Nội dung\"}`,
      };
      await sendMessageFromSQL(api, message, obj, false, 30000);
      return;
    }

    if (!addPayload.title) {
      const obj = {
        success: false,
        message: `❌ Thiếu trường "title"!\n\n📝 Cấu trúc:\n{\"keyword\":\"từ_khóa\",\"title\":\"Nội dung\"}`,
      };
      await sendMessageFromSQL(api, message, obj, false, 30000);
      return;
    }

    const result = await api.addQuickMessage(addPayload);
    
    const obj = {
      success: true,
      message: `✅ Đã tạo quick message thành công!\n\n📌 Từ khóa: ${addPayload.keyword}\n📝 Nội dung: ${addPayload.title}\n\n💡 Bạn có thể sử dụng quick message này bằng cách gõ "${addPayload.keyword}" trong chat.`,
    };
    await sendMessageFromSQL(api, message, obj, false, 30000);
  } catch (error) {
    console.error("❌ Lỗi khi tạo quick message:", error);
    let errorMessage = `❌ Lỗi khi tạo quick message: ${error.message || error}`;
    
    if (error.code === 821 || error.message?.includes("821")) {
      errorMessage = "❌ Đã đạt giới hạn số lượng quick message. Vui lòng xóa một số quick message cũ trước khi tạo mới.";
    }
    
    const obj = {
      success: false,
      message: errorMessage,
    };
    await sendMessageFromSQL(api, message, obj, false, 30000);
  }
}

export async function handleAddUnreadMarkCommand(api, message, prefix, aliasCommand) {
  try {
    const content = removeMention(message);
    const parts = content.trim().split(/\s+/);  
    let threadId = null;
    let threadType = null;

    if (parts.length >= 2) {
      threadId = parts[1];
      threadType = parts[2]?.toLowerCase() || (message.type === MessageType.GroupMessage ? "group" : "user");
    } else {
      threadId = String(message.threadId);
      threadType = message.type === MessageType.GroupMessage ? "group" : "user";
    }

    if (!threadId) {
      const obj = {
        success: false,
        message: `❌ Không tìm thấy threadId!\n\n💡 Cách sử dụng:\n${prefix}${aliasCommand} [threadId] [user|group]\n\nHoặc dùng lệnh trong cuộc trò chuyện cần đánh dấu chưa đọc.`,
      };
      await sendMessageFromSQL(api, message, obj, false, 30000);
      return;
    }

    threadId = String(threadId);
    const type = threadType === "group" ? ThreadType.Group : ThreadType.User;

    const result = await api.addUnreadMark(threadId, type);
    
    const obj = {
      success: true,
      message: `✅ Đã thêm dấu chưa đọc thành công!\n\n📌 Thread ID: ${threadId}\n📝 Loại: ${threadType === "group" ? "Nhóm" : "Người dùng"}`,
    };
    await sendMessageFromSQL(api, message, obj, false, 30000);
  } catch (error) {
    console.error("❌ Lỗi khi thêm dấu chưa đọc:", error);
    const obj = {
      success: false,
      message: `❌ Lỗi khi thêm dấu chưa đọc: ${error.message || error}`,
    };
    await sendMessageFromSQL(api, message, obj, false, 30000);
  }
}

export async function handleBlockViewFeedCommand(api, message, prefix, aliasCommand) {
  try {
    const content = removeMention(message);
    const parts = content.trim().split(/\s+/);
    
    let userId = null;
    let isBlock = true;
    
    const mentions = message.data?.mentions || [];
    
    if (mentions.length > 0) {
      userId = String(mentions[0].uid);
      if (parts.length >= 2) {
        const action = parts[1]?.toLowerCase();
        isBlock = action === "on" || action === "block" || (action !== "off" && action !== "unblock");
      }
    } else if (parts.length >= 2) {
      const firstPart = parts[1]?.toLowerCase();
      if (firstPart === "on" || firstPart === "off" || firstPart === "block" || firstPart === "unblock") {
        isBlock = firstPart === "on" || firstPart === "block";
        userId = parts[2] || null;
      } else {
        userId = parts[1];
        if (parts.length >= 3) {
          const action = parts[2]?.toLowerCase();
          isBlock = action === "on" || action === "block" || (action !== "off" && action !== "unblock");
        }
      }
    }

    if (!userId) {
      const obj = {
        success: false,
        message: `❌ Vui lòng mention người dùng hoặc nhập userId!\n\n💡 Cách sử dụng:\n${prefix}${aliasCommand} [on|off] [@user hoặc userId]\n\nVí dụ:\n${prefix}${aliasCommand} on @user\n${prefix}${aliasCommand} off 123456789\n${prefix}${aliasCommand} 123456789 on`,
      };
      await sendMessageFromSQL(api, message, obj, false, 30000);
      return;
    }

    userId = String(userId);
    const result = await api.blockViewFeed(isBlock, userId);
    
    const actionText = isBlock ? "chặn" : "bỏ chặn";
    const obj = {
      success: true,
      message: `✅ Đã ${actionText} xem feed thành công!\n\n📌 User ID: ${userId}\n📝 Hành động: ${actionText}`,
    };
    await sendMessageFromSQL(api, message, obj, false, 30000);
  } catch (error) {
    console.error("❌ Lỗi khi chặn/bỏ chặn xem feed:", error);
    const obj = {
      success: false,
      message: `❌ Lỗi khi chặn/bỏ chặn xem feed: ${error.message || error}`,
    };
    await sendMessageFromSQL(api, message, obj, false, 30000);
  }
}
