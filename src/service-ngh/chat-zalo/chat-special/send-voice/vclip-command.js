import { isAdmin } from "../../../../index.js";
import { removeMention } from "../../../../utils/format-util.js";
import { getGlobalPrefix } from "../../../service.js";
import {
  sendMessageComplete,
  sendMessageFailed,
  sendMessageQuery,
  sendMessageWarning,
} from "../../chat-style/chat-style.js";
import { convertToAAC, uploadAudioFile } from "./process-audio.js";
import {
  addVoiceToConfig,
  clearVoiceConfig,
  deleteFileVClip,
  downloadFileVClip,
  getRemainingLimit,
  getVoiceConfig,
  getVoicesByBot,
  parseSpeed,
  removeVoiceFromConfig,
  updateVoiceConfig,
  vclipTTS,
} from "./vclip-service.js";

const TTL = 10 * 60 * 1000;

function maskSecret(value) {
  const text = String(value || "");
  if (!text) return "(chưa đặt)";
  return text.length > 10 ? `${text.slice(0, 6)}...${text.slice(-4)}` : `${text.slice(0, 2)}***`;
}

function help(prefix, alias, config, voices) {
  const cmd = `${prefix}${alias}`;
  return [
    "🎙️ VCLIP TTS",
    `${cmd} list`,
    `${cmd} <nội dung> — dùng giọng ngẫu nhiên`,
    `${cmd} <số giọng> [tốc độ] <nội dung>`,
    `${cmd} <tốc độ 0.5-2.0> <nội dung>`,
    "",
    "Admin:",
    `${cmd} config show`,
    `${cmd} config apiKey <key>`,
    `${cmd} config baseURL <url>`,
    `${cmd} config characterLimit <số>`,
    `${cmd} config addvoice <id> <tên>`,
    `${cmd} config delvoice <id hoặc số thứ tự>`,
    `${cmd} config clear`,
    "",
    `Hạn mức: ${Number(config.characterLimit || 0).toLocaleString("vi-VN")} ký tự/ngày`,
    `Số giọng: ${voices.length}`,
  ].join("\n");
}

async function handleConfig(api, message, alias, args) {
  const botId = api.getBotId();
  const prefix = getGlobalPrefix(botId);
  if (!isAdmin(botId, message.data.uidFrom)) {
    await sendMessageFailed(api, message, "Chỉ quản trị viên cấp cao được cấu hình VClip.", true, 30000);
    return;
  }

  const action = String(args[0] || "show").toLowerCase();
  if (action === "show") {
    const config = getVoiceConfig(botId);
    const voices = getVoicesByBot(botId);
    await sendMessageComplete(
      api,
      message,
      `VClip của bot này:\n• apiKey: ${maskSecret(config.apiKey)}\n• baseURL: ${config.baseURL}\n• characterLimit: ${config.characterLimit}\n• voices: ${voices.length}`,
      true,
      60000
    );
    return;
  }
  if (action === "clear") {
    clearVoiceConfig(botId);
    await sendMessageComplete(api, message, "Đã xóa cấu hình VClip riêng của bot.", true, 30000);
    return;
  }
  if (action === "addvoice") {
    const id = args[1];
    const name = args.slice(2).join(" ").trim();
    if (!id || !name) {
      await sendMessageQuery(api, message, `${prefix}${alias} config addvoice <id> <tên>`);
      return;
    }
    addVoiceToConfig(botId, id, name);
    await sendMessageComplete(api, message, `Đã thêm giọng ${name}.`, true, 30000);
    return;
  }
  if (action === "delvoice") {
    if (!args[1]) {
      await sendMessageQuery(api, message, `${prefix}${alias} config delvoice <id hoặc số thứ tự>`);
      return;
    }
    removeVoiceFromConfig(botId, args[1]);
    await sendMessageComplete(api, message, "Đã xóa giọng VClip.", true, 30000);
    return;
  }

  const keyMap = { apikey: "apiKey", baseurl: "baseURL", characterlimit: "characterLimit" };
  const key = keyMap[action];
  const value = args.slice(1).join(" ").trim();
  if (!key || !value) {
    await sendMessageQuery(api, message, help(prefix, alias, getVoiceConfig(botId), getVoicesByBot(botId)));
    return;
  }
  if (key === "baseURL") {
    const url = new URL(value);
    if (!["http:", "https:"].includes(url.protocol)) throw new Error("baseURL không hợp lệ.");
  }
  updateVoiceConfig(botId, key, value);
  if (key === "apiKey") {
    try { await api.deleteMessage(message, false); } catch {}
  }
  await sendMessageComplete(api, message, `Đã cập nhật VClip ${key}.`, true, 30000);
}

export async function handleVClipCommand(api, message, aliasCommand) {
  const botId = api.getBotId();
  const prefix = getGlobalPrefix(botId);
  const query = removeMention(message).replace(`${prefix}${aliasCommand}`, "").trim();
  const args = query ? query.split(/\s+/) : [];

  try {
    if (args[0]?.toLowerCase() === "config") {
      await handleConfig(api, message, aliasCommand, args.slice(1));
      return;
    }

    const config = getVoiceConfig(botId);
    const voices = getVoicesByBot(botId);
    if (!args.length || args[0].toLowerCase() === "list") {
      const list = voices.length
        ? `\n\n${voices.map((voice, index) => `${index + 1}. ${voice.name}`).join("\n")}`
        : "\n\nChưa có giọng nào; admin cần dùng config addvoice.";
      await sendMessageComplete(api, message, `${help(prefix, aliasCommand, config, voices)}${list}`, true, 120000);
      return;
    }
    if (!config.apiKey) throw new Error("Bot chưa cấu hình API key VClip.");
    if (!voices.length) throw new Error("Bot chưa cấu hình giọng VClip.");

    let selectedVoice;
    let speed = 1;
    let textStart = 0;
    const firstIndex = /^\d+$/.test(args[0]) ? Number(args[0]) - 1 : -1;
    if (firstIndex >= 0 && firstIndex < voices.length) {
      selectedVoice = voices[firstIndex];
      textStart = 1;
      if (/^\d+(?:\.\d+)?$/.test(args[1] || "") && Number(args[1]) >= 0.5 && Number(args[1]) <= 2) {
        speed = parseSpeed(args[1]);
        textStart = 2;
      }
    } else if (/^\d+\.\d+$/.test(args[0]) && Number(args[0]) >= 0.5 && Number(args[0]) <= 2) {
      speed = parseSpeed(args[0]);
      selectedVoice = voices[Math.floor(Math.random() * voices.length)];
      textStart = 1;
    } else {
      selectedVoice = voices[Math.floor(Math.random() * voices.length)];
    }

    let text = args.slice(textStart).join(" ").trim();
    if (!text && message.data?.quote) text = String(message.data.quote.msg || "").trim();
    if (!text) throw new Error("Thiếu nội dung cần tạo voice.");
    const remaining = getRemainingLimit(botId, message.data.uidFrom);
    if (text.length > remaining.remaining) throw new Error(`Hết hạn mức VClip; còn ${remaining.remaining} ký tự.`);

    await sendMessageComplete(api, message, `Đang tạo voice ${selectedVoice.name} (${speed}x)...`, true, 60000);
    let mp3Path;
    let aacPath;
    try {
      const audioUrl = await vclipTTS(text, selectedVoice.id, speed, message.data.uidFrom, botId);
      mp3Path = await downloadFileVClip(audioUrl);
      aacPath = await convertToAAC(mp3Path);
      const uploaded = await uploadAudioFile(aacPath, api, message);
      await api.sendVoice(message, uploaded, TTL);
    } finally {
      if (mp3Path) deleteFileVClip(mp3Path);
      if (aacPath) deleteFileVClip(aacPath);
    }
  } catch (error) {
    await sendMessageWarning(api, message, error?.message || "Không thể tạo voice VClip.", true, 60000);
  }
}
