import Tesseract from "tesseract.js";
import { createCanvas, loadImage } from "canvas";
import schedule from "node-schedule";
import chalk from "chalk";
import { MessageMention } from "zlbotdqt";
import { extendMuteDuration } from "./mute-user.js";
import { isInWhiteList } from "./white-list.js";
import { sendMessageStateQuote } from "../chat-zalo/chat-style/chat-style.js";
import { removeMention } from "../../utils/format-util.js";
import { getAntiConfig, updateAntiConfig } from "./index.js";
import { imageBufferCache } from "../../utils/image-buffer-cache.js";
import { deleteFile, downloadFile, getFileTypeRemote } from "../../utils/util.js";
import { deleteMessageCustomer } from "../../commands/bot-manager/utilities.js";

function checkBadWords(botId, content) {
  let badWords = getAntiConfig(botId)?.badWords || [];
  const normalizedContent = normalizeText(content);

  for (const badWord of badWords) {
    const normalizedBadWord = normalizeText(badWord);

    if (normalizedContent.includes(normalizedBadWord)) {
      return {
        found: true,
        word: badWord,
      };
    }

    const words = normalizedContent.split(/\s+/);
    for (const word of words) {
      if (word === normalizedBadWord) {
        return {
          found: true,
          word: badWord,
        };
      }
    }
  }

  return {
    found: false,
    word: null,
  };
}

async function handleBadWordModification(api, message, action, word) {
  const botId = api.getBotId();
  const threadId = message.threadId;

  if (!word) {
    await api.sendMessage(
      {
        msg: `Vui lòng nhập từ khóa cần ${action === "add" ? "thêm" : "xóa"}`,
        quote: message,
      },
      threadId,
      message.type
    );
    return;
  }

  const antiState = getAntiConfig(botId);
  const currentBadWords = [...antiState.badWords]; // Tạo bản sao của mảng hiện tại

  if (action === "add") {
    if (!currentBadWords.includes(word)) {
      currentBadWords.push(word);
      updateAntiConfig(botId, {
        ...antiState,
        badWords: currentBadWords,
      });

      await api.sendMessage(
        {
          msg: `Đã thêm "${word}" vào danh sách từ cấm`,
          quote: message,
          ttl: 30000,
        },
        threadId,
        message.type
      );
    } else {
      await api.sendMessage(
        {
          msg: `Từ "${word}" đã có trong danh sách từ cấm`,
          quote: message,
          ttl: 30000,
        },
        threadId,
        message.type
      );
    }
  } else if (action === "remove") {
    const index = currentBadWords.indexOf(word);
    if (index !== -1) {
      currentBadWords.splice(index, 1);
      updateAntiConfig(botId, {
        ...antiState,
        badWords: currentBadWords,
      });

      await api.sendMessage(
        {
          msg: `Đã xóa "${word}" khỏi danh sách từ cấm`,
          quote: message,
          ttl: 30000,
        },
        threadId,
        message.type
      );
    } else {
      await api.sendMessage(
        {
          msg: `Không tìm thấy "${word}" trong danh sách từ cấm`,
          quote: message,
          ttl: 30000,
        },
        threadId,
        message.type
      );
    }
  }
}

// Thêm hàm mới để hiển thị danh sách từ cấm
async function showBadWordsList(api, message) {
  const botId = api.getBotId();
  const threadId = message.threadId;
  try {
    const antiState = getAntiConfig(botId);
    const wordsList = antiState.badWords.map((pattern) => {
      return pattern.replace(/\\b/g, "").replace(/\+/g, "").replace(/\\/g, "").replace(/\*/g, " ");
    });

    if (wordsList.length === 0) {
      await api.sendMessage(
        {
          msg: "Hiện tại chưa có từ ngữ nào bị cấm.",
          quote: message,
        },
        threadId,
        message.type
      );
      return;
    }

    const formattedList = wordsList.map((word) => `${word}`).join(", ");
    await api.sendMessage(
      {
        msg: `📝 Danh sách từ ngữ bị cấm (${wordsList.length} từ):\n[${formattedList}]\n\n💡 Dùng lệnh:\n- !antibadword add [từ] để thêm\n- !antibadword remove [từ] để xóa`,
        quote: message,
        ttl: 30000,
      },
      threadId,
      message.type
    );
  } catch (error) {
    console.error("Lỗi khi đọc danh sách từ cấm:", error);
    await api.sendMessage(
      {
        msg: "Đã xảy ra lỗi khi đọc danh sách từ cấm.",
        quote: message,
        ttl: 30000,
      },
      threadId,
      message.type
    );
  }
}

// Cập nhật hàm handleAntiBadWordCommand để thêm lệnh list
export async function handleAntiBadWordCommand(api, message, groupSettings) {
  const content = removeMention(message);
  const threadId = message.threadId;
  const args = content.split(" ");
  const command = args[1]?.toLowerCase();

  if (!groupSettings[threadId]) {
    groupSettings[threadId] = {};
  }

  // Thêm case xử lý lệnh list
  if (command === "list") {
    await showBadWordsList(api, message);
    return true;
  }

  if (command === "show") {
    await showViolationHistory(api, message, threadId);
    return true;
  }

  if (command === "add" || command === "remove") {
    const word = args.slice(2).join(" ");
    await handleBadWordModification(api, message, command, word);
    return true;
  }

  if (command === "on") {
    groupSettings[threadId].filterBadWords = true;
  } else if (command === "off") {
    groupSettings[threadId].filterBadWords = false;
  } else {
    groupSettings[threadId].filterBadWords = !groupSettings[threadId].filterBadWords;
  }

  const newStatus = groupSettings[threadId].filterBadWords ? "bật" : "tắt";
  const caption = `Chức năng lọc từ khóa thô tục đã được ${newStatus}!`;
  await sendMessageStateQuote(api, message, caption, groupSettings[threadId].filterBadWords, 300000);
  return true;
}

// Hàm chuẩn hóa văn bản
function normalizeText(text) {
  return (
    text
      .toLowerCase()
      // .replace(/[àáạảãâầấậẩẫăằắặẳẵ]/g, "a")
      // .replace(/[èéẹẻẽêềếệểễ]/g, "e")
      // .replace(/[ìíịỉĩ]/g, "i")
      // .replace(/[òóọỏõôồốộổỗơờớợởỡ]/g, "o")
      // .replace(/[ùúụủũưừứựửữ]/g, "u")
      // .replace(/[ỳýỵỷỹ]/g, "y")
      // .replace(/đ/g, "d")
      // .replace(/\s+/g, " ")
      .trim()
  );
}

// Hàm lưu vi phạm
async function saveViolation(botId, threadId, userId, userName, badWord) {
  const antiState = getAntiConfig(botId);
  const violations = antiState.violations || {};

  if (!violations[threadId]) {
    violations[threadId] = {};
  }

  if (!violations[threadId][userId]) {
    violations[threadId][userId] = {
      count: 0,
      words: [],
      name: userName,
    };
  }

  violations[threadId][userId].count++;
  violations[threadId][userId].words.push({
    word: badWord,
    time: Date.now(),
  });

  if (violations[threadId][userId].words.length > 3) {
    violations[threadId][userId].words = violations[threadId][userId].words.slice(-3);
  }

  updateAntiConfig(botId, {
    ...antiState,
    violations,
  });

  return violations[threadId][userId];
}

export async function antiBadWord(api, message, groupSettings, isAdminBox, botIsAdminBox, isSelf) {
  if (isSelf) return false;
  const botId = api.getBotId();
  let content = removeMention(message);
  const threadId = message.threadId;
  const senderId = message.data.uidFrom;
  const isPlainText = typeof content === "string";
  const isPicture = message.data.msgType === "chat.photo";
  let checkBadWordsResult = { found: false };

  if (groupSettings[threadId]?.filterBadWords) {
    if (isPlainText) {
      if (!botIsAdminBox || isAdminBox || isInWhiteList(groupSettings, threadId, senderId)) return false;
      const normalizedContent = content.toLowerCase();
      checkBadWordsResult = checkBadWords(botId, normalizedContent);
    }
    if (!checkBadWordsResult.found && isPicture) {
      const linkHrefCheckImage = message.data.content.href;
      let pathTempImage;
      try {
        const fileType = await getFileTypeRemote(linkHrefCheckImage);
        if (fileType.ext === "jpg" || fileType.ext === "jpeg" || fileType.ext === "png") {
          pathTempImage = await downloadFile(linkHrefCheckImage);
          const {
            data: { text },
          } = await Tesseract.recognize(pathTempImage, "vie");
          checkBadWordsResult = checkBadWords(botId, text.toLowerCase());
        }
      } catch {
      } finally {
        await deleteFile(pathTempImage);
      }
    }
    if (checkBadWordsResult.found) {
      try {
        await deleteMessageCustomer(api, message);
        const senderName = message.data.dName;
        const senderId = message.data.uidFrom;

        const violation = await saveViolation(botId, threadId, senderId, senderName, checkBadWordsResult.word);

        let warningMsg = `${senderName} -> Tin nhắn bị xóa vì chứa từ ngữ bị cấm: "${checkBadWordsResult.word}"\n`;
        warningMsg += `Cảnh cáo lần ${violation.count}/3`;

        if (violation.count >= 3) {
          await extendMuteDuration(threadId, senderId, senderName, groupSettings, 900);

          const antiState = getAntiConfig(botId);
          const violations = { ...antiState.violations };

          if (violations[threadId]?.[senderId]) {
            violations[threadId][senderId].count = 0;

            updateAntiConfig(botId, {
              ...antiState,
              violations,
            });
          }

          warningMsg += "\n⚠️ Vi phạm 3 lần, bạn bị cấm chat trong 15 phút!";
        }

        await api.sendMessage(
          {
            msg: warningMsg,
            mentions: [MessageMention(senderId, senderName.length, 0)],
            ttl: 30000,
          },
          threadId,
          message.type
        );
        return true;
      } catch (error) {
        console.error("Có lỗi xảy ra khi anti badword:", error.message);
      }
    }
  }
  return false;
}

// Sửa lại hàm showViolationHistory để gộp thông báo
export async function showViolationHistory(api, message, threadId) {
  const botId = api.getBotId();
  try {
    const mentions = message.data.mentions;

    if (!mentions || mentions.length === 0) {
      await api.sendMessage(
        {
          msg: "Vui lòng tag (@mention) người dùng để xem lịch sử vi phạm.",
          quote: message,
          ttl: 30000,
        },
        threadId,
        message.type
      );
      return;
    }

    const antiState = getAntiConfig(botId);
    const violations = antiState.violations || {};

    let responseMsg = "📝 Lịch sử vi phạm:\n\n";
    const messageMentions = [];
    let mentionPosition = responseMsg.length;

    for (const mention of mentions) {
      const userId = mention.uid;
      const userName = message.data.content.substr(mention.pos, mention.len).replace("@", "");
      const userViolations = violations[threadId]?.[userId];

      // Thêm mention vào danh sách
      messageMentions.push(MessageMention(userId, userName.length, mentionPosition));

      if (!userViolations || userViolations.words.length === 0) {
        responseMsg += `${userName} chưa có vi phạm nào.\n\n`;
      } else {
        const countViolations = userViolations.count;
        let recentViolations = "Những vi phạm gần nhất:\n";
        recentViolations += userViolations.words
          .slice(-3)
          .map((v, i) => `  ${i + 1}. "${v.word}" - ${new Date(v.time).toLocaleString()}`)
          .join("\n");

        responseMsg += `${userName}:\n`;
        responseMsg += `Số lần vi phạm: ${countViolations}\n`;
        responseMsg += `${recentViolations}\n`;
      }

      mentionPosition = responseMsg.length;
    }

    await api.sendMessage(
      {
        msg: responseMsg.trim(),
        quote: message,
        ttl: 30000,
      },
      threadId,
      message.type
    );
  } catch (error) {
    console.error("Lỗi khi đọc lịch sử vi phạm:", error);
    await api.sendMessage(
      {
        msg: "Đã xảy ra lỗi khi đọc lịch sử vi phạm.",
        quote: message,
        ttl: 30000,
      },
      threadId,
      message.type
    );
  }
}

export async function startBadWordViolationCheck(api) {
  const botId = api.getBotId();

  api.apiInstance.schedule.checkBadWordsViolation = schedule.scheduleJob("*/5 * * * * *", async () => {
    try {
      const antiState = getAntiConfig(botId);
      let hasChanges = false;
      const currentTime = Date.now();
      const VIOLATION_TIMEOUT = 30 * 60 * 1000; // 30 phút

      const violations = { ...antiState.violations };

      // Duyệt qua từng nhóm
      for (const threadId in violations) {
        // Duyệt qua từng người dùng trong nhóm
        for (const userId in violations[threadId]) {
          const userViolations = violations[threadId][userId];

          // Lọc ra các vi phạm trong vòng 30 phút
          const recentViolations = userViolations.words.filter((violation) => {
            return currentTime - violation.time < VIOLATION_TIMEOUT;
          });

          // Nếu số lượng vi phạm thay đổi
          if (recentViolations.length < userViolations.words.length) {
            hasChanges = true;
            userViolations.words = recentViolations;

            // Cập nhật lại số lần vi phạm
            userViolations.count = recentViolations.length;

            // Nếu không còn vi phạm nào, xóa user khỏi danh sách
            if (recentViolations.length === 0) {
              delete violations[threadId][userId];
            }
          }
        }

        // Nếu không còn user nào trong nhóm, xóa nhóm
        if (Object.keys(violations[threadId]).length === 0) {
          delete violations[threadId];
        }
      }

      // Lưu lại nếu có thay đổi
      if (hasChanges) {
        updateAntiConfig(botId, {
          ...antiState,
          violations,
        });
      }
    } catch (error) {
      console.error("Lỗi khi kiểm tra vi phạm:", error);
    }
  });

  console.log(chalk.yellow("Đã khởi động schedule kiểm tra vi phạm từ khóa thô tục"));
}
