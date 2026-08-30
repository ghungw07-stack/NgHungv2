import fs from "fs";
import path from "path";
import { handleCheckLinkFromVoicesLocal } from "../../utils/local-upload-cache.js";
import { uploadAudioFile } from "../chat-zalo/chat-special/send-voice/process-audio.js";
import { VOICES_RESOURCE_PATH, VOICES_RESOURCE_PATH_GLOBAL } from "../../utils/io-json.js";

const triggerCooldowns = new Map();
const COOLDOWN_MS = 5000; // 5s cooldown per thread

/**
 * Tự động reply voice khi có người nhắn "ai hỏi" hoặc "ai hoi" trong group
 */
export async function checkAutoVoiceTriggers(api, message, groupSettings) {
  try {
    const threadId = message?.threadId;
    if (!threadId) return false;

    // Chỉ chạy khi bot đang bật (activeBot === true) trong nhóm
    if (message.type !== 1 || !groupSettings?.[threadId]?.activeBot) {
      return false;
    }

    const content = typeof message?.data?.content === "string" ? message.data.content.trim() : "";
    if (!content) return false;

    // Kiểm tra từ khóa "ai hỏi" hoặc "ai hoi"
    const isAiHoi = /(?:^|\s)ai\s*(hỏi|hoi)(?:[\s?!.,~:;]|$)/iu.test(content);
    if (!isAiHoi) return false;

    // Cooldown để tránh spam
    const now = Date.now();
    const lastTrigger = triggerCooldowns.get(threadId) || 0;
    if (now - lastTrigger < COOLDOWN_MS) return false;
    triggerCooldowns.set(threadId, now);

    const botId = api.getBotId();
    const targetFileName = "ai hỏi con cặc.aac";

    // Tìm file voice cục bộ
    const possiblePaths = [
      path.join(VOICES_RESOURCE_PATH(botId), targetFileName),
      path.join(VOICES_RESOURCE_PATH_GLOBAL, targetFileName),
      path.join(VOICES_RESOURCE_PATH(botId), "aihoi.aac"),
      path.join(VOICES_RESOURCE_PATH_GLOBAL, "aihoi.aac"),
      path.join(process.cwd(), "logs", String(botId), "resource", "voices", targetFileName),
      path.join(process.cwd(), "assets", "resources", "voices", targetFileName),
    ];

    let foundPath = possiblePaths.find((p) => fs.existsSync(p));

    let voiceUrl = null;
    if (foundPath) {
      try {
        const fileLocal = await handleCheckLinkFromVoicesLocal(path.basename(foundPath), api);
        voiceUrl = fileLocal?.fileUrl || null;
      } catch {}

      if (!voiceUrl) {
        try {
          voiceUrl = await uploadAudioFile(foundPath, api, message);
        } catch (e) {
          console.error("[auto-voice] uploadAudioFile error:", e.message);
        }
      }
    }

    if (voiceUrl) {
      const senderId = message?.data?.uidFrom;
      const senderName = message?.data?.dName || "bạn";
      const tagText = `@${senderName}`;

      // Gửi tin nhắn reply + tag tên người hỏi
      if (senderId) {
        try {
          await api.sendMessage(
            {
              msg: tagText,
              mentions: [{ pos: 0, uid: String(senderId), len: tagText.length }],
              quote: message,
              ttl: 86400000,
            },
            threadId,
            message.type
          );
        } catch (e) {
          console.warn("[auto-voice] sendMessage tag error:", e.message);
        }
      }

      // Gửi voice
      await api.sendVoice(message, voiceUrl, 86400000);
      return true;
    }

    return false;
  } catch (err) {
    console.error("[auto-voice] Error in checkAutoVoiceTriggers:", err);
    return false;
  }
}
