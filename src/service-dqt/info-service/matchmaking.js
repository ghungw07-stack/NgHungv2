import { removeMention } from "../../utils/format-util.js";
import { getGlobalPrefix } from "../service.js";
import { getUserInfoData } from "./user-info.js";
import { createMatchmakingImage } from "../../utils/canvas/matchmaking.js";
import * as cv from "../../utils/canvas/index.js";
import { sendMessageFailed } from "../chat-zalo/chat-style/chat-style.js";
import { uploadTempFile, getLocalImageInfo } from "../../utils/util.js";

function calculateCompatibility(user1Id, user2Id) {
  const combined = user1Id.toString() + user2Id.toString();
  let hash = 0;
  for (let i = 0; i < combined.length; i++) {
    const char = combined.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  const random = Math.abs(hash) % 101;
  return random;
}

export async function matchmakingCommand(api, message, aliasCommand) {
  const threadId = message.threadId;
  const senderId = message.data.uidFrom;
  let content = removeMention(message);
  const prefix = getGlobalPrefix(api.getBotId());
  content = content.replace(`${prefix}${aliasCommand}`, "").trim();
  
  let imagePath = null;

  try {
    let user1Id = senderId;
    let user2Id = null;

    if (message.data.mentions && message.data.mentions.length > 0) {
      if (message.data.mentions.length === 1) {
        user2Id = message.data.mentions[0].uid;
      } else if (message.data.mentions.length >= 2) {
        user1Id = message.data.mentions[0].uid;
        user2Id = message.data.mentions[1].uid;
      }
    } else {
      const contentParts = content.trim().split(/\s+/);
      if (contentParts.length >= 1 && contentParts[0]) {
        user2Id = contentParts[0];
      } else {
        await sendMessageFailed(
          api,
          message,
          "❌ Vui lòng tag một người hoặc nhập ID người dùng để ghép đôi!\nVí dụ: " + prefix + aliasCommand + " @Tên hoặc " + prefix + aliasCommand + " [ID]",
          true,
          30000
        );
        return;
      }
    }

    if (!user2Id) {
      await sendMessageFailed(
        api,
        message,
        "❌ Không tìm thấy người dùng thứ hai để ghép đôi!",
        true,
        30000
      );
      return;
    }

    const [user1Info, user2Info] = await Promise.all([
      getUserInfoData(api, user1Id),
      getUserInfoData(api, user2Id)
    ]);

    if (!user1Info || !user2Info) {
      await sendMessageFailed(
        api,
        message,
        "❌ Không thể lấy thông tin một trong hai người dùng.",
        true,
        30000
      );
      return;
    }

    const compatibilityPercent = calculateCompatibility(user1Id, user2Id);

    imagePath = await createMatchmakingImage(user1Info, user2Info, compatibilityPercent);

    const mentions = [];
    const name1 = user1Info.name || user1Info.displayName || user1Info.zaloName || "Người dùng 1";
    const name2 = user2Info.name || user2Info.displayName || user2Info.zaloName || "Người dùng 2";
    
    let captionText = "";
    if (compatibilityPercent < 20) {
      captionText = "😔 KHÔNG PHÙ HỢP";
    } else if (compatibilityPercent < 40) {
      captionText = "🤔 CẦN SUY NGHĨ";
    } else if (compatibilityPercent < 65) {
      captionText = "💓 CÓ THỂ THỬ!";
    } else if (compatibilityPercent < 85) {
      captionText = "💕 KHÁ PHÙ HỢP!";
    } else if (compatibilityPercent < 90) {
      captionText = "💖 RẤT PHÙ HỢP!";
    } else {
      captionText = "💝 HOÀN HẢO!";
    }
    
    let caption = `${captionText}\n\n`;
    let currentPos = caption.length;
    
    const mentionText1 = `👤 ${name1}\n`;
    const pos1 = currentPos + mentionText1.indexOf(`${name1}`);
    caption += mentionText1;
    mentions.push({
      uid: user1Id,
      len: name1.length,
      pos: pos1
    });
    currentPos += mentionText1.length;

    const mentionText2 = `💞\n👤 ${name2}\n`;
    const pos2 = currentPos + mentionText2.indexOf(`${name2}`);
    caption += mentionText2;
    mentions.push({
      uid: user2Id,
      len: name2.length,
      pos: pos2
    });
    
    caption += `💕 Tỉ lệ hợp đôi: ${compatibilityPercent}%`;
    
    let imageData = null;
    try {
      const tempFile = await uploadTempFile(imagePath, 1, { api, message });
      const dataImage = await getLocalImageInfo(imagePath);
      if (dataImage.totalSize > 1024) {
        imageData = {
          url: tempFile,
          width: dataImage.width,
          height: dataImage.height,
        };
      }
    } catch (error) {
      console.error("Lỗi khi xử lý ảnh:", error);
    }

    if (imageData) {
      const newMessage = {
        ...message,
        mentions: mentions.map(m => ({ ...m, type: 0 })),
      };
      await api.sendImage(imageData, newMessage, caption, 6000000);
    } else {
      await api.sendMessage(
        {
          msg: caption,
          attachments: [imagePath],
          mentions: mentions,
          ttl: 6000000,
          isUseProphylactic: true,
        },
        threadId,
        message.type
      );
    }
  } catch (error) {
    console.error("Lỗi khi tạo ảnh ghép đôi:", error);
    await sendMessageFailed(
      api,
      message,
      "❌ Đã xảy ra lỗi khi tạo ảnh ghép đôi. Vui lòng thử lại sau.",
      true,
      30000
    );
  } finally {
    if (imagePath) {
      await cv.clearImagePath(imagePath);
    }
  }
}