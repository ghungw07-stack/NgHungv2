import axios from "axios";
import fs from "fs";
import path from "path";
import { tempDir as projectTempDir } from "../../../../utils/io-json.js";
import {
  getVoiceConfig,
  saveVoiceConfig,
  getVoicesByBot,
  getRandomVoiceByBot,
  getUserVIPConfig,
  setLastVoiceUser,
  checkAndResetDailyLimit,
  getRemainingLimit,
} from "./voice-config-manager.js";

export async function vclipTTS(text, voiceId, speed = 1.0, userId = null, botId = null) {
  if (!botId) throw new Error("vclipTTS: thiếu botId — voice config tách riêng theo bot");

  const config = getVoiceConfig(botId);
  const performance = config.performance || {};

  // Kiểm tra VIP user
  const vipConfig = userId ? getUserVIPConfig(botId, userId) : null;
  
  // Xác định API key và config sử dụng
  let apiKey = config.apiKey;
  let charLimit = config.characterLimit;
  let baseURL = config.baseURL;
  let model = null;

  if (vipConfig && vipConfig.enabled && (!vipConfig.expiresAt || vipConfig.expiresAt > Date.now())) {
    // User VIP dùng config riêng
    if (vipConfig.apiKey) {
      apiKey = vipConfig.apiKey;
    }
    if (vipConfig.limitPerDay) {
      charLimit = vipConfig.limitPerDay;
    }
    if (vipConfig.baseURL) {
      baseURL = vipConfig.baseURL;
    }
    model = vipConfig.model;
  }

  // 1. Giới hạn độ dài ký tự
  if (text.length > charLimit) {
    throw new Error(`Văn bản quá dài (tối đa ${charLimit} ký tự).`);
  }

  // 2. Kiểm tra limit theo ngày
  if (userId) {
    const limitInfo = getRemainingLimit(botId, userId);
    
    if (limitInfo.remaining - text.length < 0) {
      throw new Error(`Bạn đã hết hạn mức ký tự trong ngày. Còn lại: ${limitInfo.remaining < 0 ? 0 : limitInfo.remaining} ký tự.`);
    }
  }

  if (!apiKey || apiKey === "YOUR_VCLIP_API_KEY_HERE" || apiKey === "") {
    throw new Error("VClip API Key chưa được cấu hình.");
  }

  try {
    const response = await axios.post(
      `${baseURL}/json-rpc`,
      {
        method: "ttsLongText",
        input: {
          text: text,
          userVoiceId: voiceId,
          speed: speed,
          ...(model && { model: model })
        },
      },
      {
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        timeout: performance.responseTimeout || 60000
      }
    );

    if (!response.data?.result?.projectExportId) {
      throw new Error(`Lỗi từ VClip API: ${JSON.stringify(response.data)}`);
    }

    const projectExportId = response.data.result.projectExportId;
    let audioUrl = null;
    let attempts = 0;
    const maxAttempts = performance.retryAttempts || 30;
    const pollInterval = 3000;

    while (!audioUrl && attempts < maxAttempts) {
      await new Promise((resolve) => setTimeout(resolve, pollInterval));
      attempts++;

      const statusResponse = await axios.post(
        `${baseURL}/json-rpc`,
        {
          method: "getExportStatus",
          input: {
            projectExportId: projectExportId,
          },
        },
        {
          headers: {
            Authorization: `Bearer ${apiKey}`,
            "Content-Type": "application/json",
          },
          timeout: performance.responseTimeout || 60000
        }
      );

      const result = statusResponse.data?.result;
      if (result?.state === "completed") {
        audioUrl = result.url;
      } else if (result?.state === "failed") {
        throw new Error("VClip TTS failed to generate audio.");
      }
    }

    if (!audioUrl) {
      throw new Error("VClip TTS timed out.");
    }

    // Cập nhật lastVoice và stats
    if (userId) {
      const senderName = userId; // Có thể truyền thêm userName nếu cần
      setLastVoiceUser(botId, userId, senderName, text.length);
    }

    return audioUrl;
  } catch (error) {
    console.error("Lỗi VClip TTS:", error.response?.data || error.message);
    throw error;
  }
}

// Lấy danh sách giọng của bot (alias cho getVoicesByBot — giữ tên cũ để khỏi vỡ caller)
export function getVClipVoices(botId) {
  if (!botId) throw new Error("getVClipVoices: thiếu botId");
  return getVoicesByBot(botId);
}

// Giọng ngẫu nhiên của bot
export function getRandomVClipVoice(botId) {
  if (!botId) throw new Error("getRandomVClipVoice: thiếu botId");
  return getRandomVoiceByBot(botId);
}

// Tải file từ URL
export async function downloadFileVClip(url) {
  const tempFilePath = path.join(projectTempDir, `vclip_${Date.now()}.mp3`);
  
  if (!fs.existsSync(projectTempDir)) {
    fs.mkdirSync(projectTempDir, { recursive: true });
  }

  const response = await axios({
    url,
    method: "GET",
    responseType: "stream",
  });

  return new Promise((resolve, reject) => {
    const writer = fs.createWriteStream(tempFilePath);
    response.data.pipe(writer);
    writer.on("finish", () => resolve(tempFilePath));
    writer.on("error", reject);
  });
}

// Xóa file tạm
export function deleteFileVClip(filePath) {
  try {
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }
  } catch (error) {
    console.error("Lỗi xóa file tạm VClip:", error);
  }
}

// Re-export các hàm config (consumer chỉ cần import từ vclip-service.js)
export {
  getVoiceConfig,
  saveVoiceConfig,
  getVoicesByBot,
  getRandomVoiceByBot,
  getUserVIPConfig,
  setLastVoiceUser,
  getLastVoiceUser,
  getRemainingLimit,
  addVoiceToConfig,
  removeVoiceFromConfig,
  updateVoiceConfig,
  clearVoiceConfig,
  getVIPListByBot,
  addUserVIP,
  removeUserVIP,
  hasBotConfig,
  hasDefaultConfig,
} from "./voice-config-manager.js";

// Export thêm các hàm tiện ích
export function parseSpeed(speedStr) {
  const speed = parseFloat(speedStr);
  if (isNaN(speed) || speed < 0.5 || speed > 2.0) {
    return 1.0; // Mặc định
  }
  return speed;
}

export function formatTimeRemaining(seconds) {
  if (seconds < 60) {
    return `${seconds} giây`;
  }
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  if (minutes < 60) {
    return `${minutes} phút ${remainingSeconds} giây`;
  }
  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;
  return `${hours} giờ ${remainingMinutes} phút`;
}

