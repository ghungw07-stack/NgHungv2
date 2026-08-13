import fs from "fs";
import path, { dirname } from "path";
import os from "os";
import { fileURLToPath } from "url";
import fetch from "node-fetch";
import { sendMessageStateQuote } from "../../service-ngh/chat-zalo/chat-style/chat-style.js";
import { getGlobalPrefix } from "../../service-ngh/service.js";
import { removeMention } from "../../utils/format-util.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

export const des = {
  name: "lovelink",
  type: 1,
  permission: "all",
  countdown: 5,
  active: true,
};

// ===== STYLE =====
function applyMessageStyle(text) {
  const COLORS = ["#f30505ff", "#15a85f", "#f27806", "#f7b503"];
  const color = COLORS[Math.floor(Math.random() * COLORS.length)];
  return {
    text,
    style: {
      color,
      fontSize: 16,
      bold: true,
    },
  };
}

// ===== AUDIO OPTIONS =====
const AUDIO_OPTIONS = {
  nnca: "Nơi Này Có Anh",
  pm: "Phép Màu", 
  thttt: "Tín Hiệu Từ Trái Tim",
  ccyld: "Có Chắc Đây Là Yêu",
  cgm52: "Cô Gái M52",
  hgedat: "Hẹn Em Dưới Ánh Trăng",
  mrtt: "Mượn Rượu Tỏ Tình",
  nap: "Người Âm Phủ"
};
const ALLOWED_AUDIOS = Object.keys(AUDIO_OPTIONS);

function selectRandomAudio() {
  const randomIndex = Math.floor(Math.random() * ALLOWED_AUDIOS.length);
  const code = ALLOWED_AUDIOS[randomIndex];
  return { code, name: AUDIO_OPTIONS[code] };
}

function getAudioMenu() {
  return Object.entries(AUDIO_OPTIONS)
    .map(([code, name], i) => `${i + 1}. ${code.toUpperCase()} - ${name}`)
    .join("\n");
}

function parseAudioSelection(input) {
  const choice = input.toLowerCase().trim();
  if (choice === "random") return selectRandomAudio();

  const num = parseInt(choice);
  if (num >= 1 && num <= ALLOWED_AUDIOS.length) {
    const code = ALLOWED_AUDIOS[num - 1];
    return { code, name: AUDIO_OPTIONS[code] };
  }
  return null;
}

// ===== API =====
async function getLoveAudio(text, audioCode) {
  const apiUrl = `https://api.nemg.me/love?text=${encodeURIComponent(text)}&audio=${audioCode}`;

  try {
    const response = await fetch(apiUrl, {
      method: "GET",
      headers: { "User-Agent": "Mozilla/5.0" },
    });
    const data = await response.json();

    if (data.error) {
      return { error: data.error, success: false };
    }
    return { url: data.url, success: true };
  } catch (error) {
    return { error: error.message, success: false };
  }
}

// ===== COMMAND =====
export async function handleLoveCommand(api, message, aliasCommand) {
  const prefix = getGlobalPrefix(api.getBotId());
  const content = removeMention(message)
    .replace(`${prefix}${aliasCommand}`, "")
    .trim();

  if (!content) {
    const menuMsg = `💕 CHỌN NHẠC NỀN:\n\n${getAudioMenu()}\n\nCú pháp: lovelink "nội dung" [số/random]`;
    const styled = applyMessageStyle(menuMsg);
    return sendMessageStateQuote(api, message, styled.text, false, 60000, false, styled.style);
  }

  // Regex: cho phép "..." hoặc text thường + số/random
  const match = content.match(/^(?:"([^"]+)"|([\s\S]+?))\s*(\d+|random)?$/iu);
  if (!match) {
    const menuMsg = `❌ Sai cú pháp!\n\nVí dụ: lovelink "Xin chào Việt Nam" 2\n\n${getAudioMenu()}`;
    const styled = applyMessageStyle(menuMsg);
    return sendMessageStateQuote(api, message, styled.text, false, 60000, false, styled.style);
  }

  let text = (match[1] || match[2] || "").trim();
  let selection = match[3] || "random";

  try { text = text.normalize("NFC"); } catch (e) {}

  // Validate text
  const invalid =
    !text ||
    text.length > 1000 ||
    /[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/u.test(text) ||
    /[<>]/.test(text);

  if (invalid) {
    const styled = applyMessageStyle("❌ Nội dung không hợp lệ! Không được dùng ký tự điều khiển hoặc < >. Độ dài tối đa 1000 ký tự.");
    return sendMessageStateQuote(api, message, styled.text, false, 60000, false, styled.style);
  }

  // Chọn audio
  const selectedAudio = parseAudioSelection(selection);
  if (!selectedAudio) {
    const errorMsg = `❌ Lựa chọn nhạc không hợp lệ! Hãy nhập số (1-${ALLOWED_AUDIOS.length}) hoặc 'random'.\nVí dụ: lovelink "${text}" random`;
    const styled = applyMessageStyle(errorMsg);
    return sendMessageStateQuote(api, message, styled.text, false, 60000, false, styled.style);
  }

  // Gọi API
  const result = await getLoveAudio(text, selectedAudio.code);
  if (!result.success) {
    const errorMsg = `❌ Lỗi: ${result.error}\n\nThử lại: lovelink "${text}" random`;
    const styled = applyMessageStyle(errorMsg);
    return sendMessageStateQuote(api, message, styled.text, false, 60000, false, styled.style);
  }

  // Thành công
  const msg = `💖 LOVE LINK ĐÃ TẠO THÀNH CÔNG

➤ Text: ${text}
➤ Audio: ${selectedAudio.name}
➤ Link: ${result.url}`;

  const styled = applyMessageStyle(msg);
  return sendMessageStateQuote(api, message, styled.text, false, 3000000, false, styled.style);
}
