import Big from "big.js";
import { registerFont } from "canvas";
import JSONbig from "json-bigint";
import path from "path";
import { fileURLToPath } from "url";

// Đảm bảo load font an toàn, không làm crash tiến trình nếu font lỗi
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const FONT_DIR = path.resolve(__dirname, "../../assets/fonts");

function safeRegisterFont(fileName, family) {
  try {
    const fontPath = path.join(FONT_DIR, fileName);
    registerFont(fontPath, { family });
  } catch (err) {
    console.warn(`[canvas] Không thể load font ${fileName} (${family}):`, err?.message || err);
  }
}

safeRegisterFont("SVN-Transformer.ttf", "Transformer");
safeRegisterFont("BeVietnamPro-Bold.ttf", "BeVietnamPro");
safeRegisterFont("NotoSans-Bold.ttf", "NotoSansB");
safeRegisterFont("NotoSans-Bold.ttf", "NotoSansCJK-Bold");
export const FONT_MAIN = "BeVietnamPro";
export function getFontCanvas(text) {
  const trimmed = text.trim();
  for (const ch of trimmed) {
    const code = ch.codePointAt(0);
    if (
      (code >= 0x4e00 && code <= 0x9fff) ||   // CJK Unified Ideographs
      (code >= 0x3400 && code <= 0x4dbf) ||   // CJK Extension A
      (code >= 0x20000 && code <= 0x2a6df) || // CJK Extension B
      (code >= 0x3040 && code <= 0x309f) ||   // Hiragana
      (code >= 0x30a0 && code <= 0x30ff) ||   // Katakana
      (code >= 0x31f0 && code <= 0x31ff)      // Katakana Phonetic Ext.
    ) {
      return "NotoSansCJK-Bold";
    }
  }

  return FONT_MAIN;
}

function parseTime(timeStr, PERMANENT_TIME = -1) {
  if (!timeStr) return PERMANENT_TIME;

  const value = parseInt(timeStr.slice(0, -1));
  const unit = timeStr.slice(-1).toLowerCase();

  if (isNaN(value)) return PERMANENT_TIME;

  switch (unit) {
    case "s":
    case "gi":
      return value * 1000;
    case "m":
    case "p":
      return value * 60 * 1000;
    case "h":
    case "g":
      return value * 3600 * 1000;
    case "d":
    case "n":
      return value * 86400 * 1000;
    case "mo":
    case "t":
    case "th":
      return value * 30 * 86400 * 1000;
    case "y":
    case "nm":
      return value * 12 * 30 * 86400 * 1000;
    default:
      return parseInt(timeStr);
  }
}

function formatTime(date) {
  const hours = date.getHours().toString().padStart(2, "0");
  const minutes = date.getMinutes().toString().padStart(2, "0");
  const seconds = date.getSeconds().toString().padStart(2, "0");
  return `${hours}:${minutes}:${seconds}`;
}

function getTimeNow() {
  const now = new Date();
  return new Date(
    now.toLocaleString("en-US", {
      timeZone: "Asia/Ho_Chi_Minh",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    })
  );
}

function formatDateText(date) {
  return new Date(date).toLocaleString("en-US", {
    timeZone: "Asia/Ho_Chi_Minh",
  });
}

function formatDate(date) {
  return date.toLocaleString("en-US", {
    timeZone: "Asia/Ho_Chi_Minh",
  });
}

function getTimeToString(timeInput) {
  const year = timeInput.getFullYear();
  const month = String(timeInput.getMonth() + 1).padStart(2, "0");
  const day = String(timeInput.getDate()).padStart(2, "0");
  const hours = String(timeInput.getHours()).padStart(2, "0");
  const minutes = String(timeInput.getMinutes()).padStart(2, "0");
  const seconds = String(timeInput.getSeconds()).padStart(2, "0");

  return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
}

// Hàm helper để format số Big.js thành chuỗi đầy đủ không có ký hiệu e+
function formatBigNumber(bigNum) {
  // Chuyển đổi sang chuỗi khoa học
  const scientificStr = bigNum.toString();

  // Nếu không có ký hiệu e, format luôn với dấu chấm
  if (!scientificStr.includes("e")) {
    return scientificStr.replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  }

  // Tách phần số và số mũ
  const [base, exponent] = scientificStr.split("e");
  const exp = parseInt(exponent);

  // Xử lý phần cơ số
  const baseNum = base.replace(".", "");
  const baseLength = baseNum.length;

  let result;
  if (exp > 0) {
    // Thêm số 0 vào cuối nếu cần
    const zerosToAdd = exp - (baseLength - 1);
    result = baseNum + "0".repeat(Math.max(0, zerosToAdd));
  } else {
    // Xử lý số âm nếu cần
    const absExp = Math.abs(exp);
    result = "0." + "0".repeat(absExp - 1) + baseNum;
  }

  // Thêm dấu chấm phân cách mỗi 3 số
  return result.replace(/\B(?=(\d{3})+(?!\d))/g, ".");
}

function formatCurrency(value, minChange = 900_000_000_000_000_000n) {
  const tempValue = Big(value).abs();
  if (tempValue <= minChange) return formatBigNumber(value);

  const locale = new Intl.NumberFormat("vi-VN", {
    maximumFractionDigits: 1,
  });

  // Lưu lại dấu của số
  const isNegative = value < 0;
  // Lấy giá trị tuyệt đối xử lý
  value = Math.abs(value);

  let strConvert = "";
  let conD = 0;

  // Xử lý tỷ
  while (value >= 1_000_000_000) {
    value /= 1_000_000_000;
    strConvert = " Tỷ " + strConvert;
    conD = 3;
  }

  // Xử lý triệu
  while (value >= 1_000_000) {
    value /= 1_000_000;
    strConvert = " Triệu " + strConvert;
    conD = 2;
  }

  // Xử lý nghìn
  while (value >= 1_000) {
    value /= 1_000;
    strConvert = " Nghìn " + strConvert;
    conD = 1;
  }

  // Xử lý các trường hợp đặc biệt
  switch (conD) {
    case 1:
      value *= 1000;
      strConvert = strConvert.substring(6);
      break;
    default:
      break;
  }

  strConvert = strConvert.replaceAll("  ", " ");
  // Thêm dấu trừ vào kết quả nếu là số âm
  return (isNegative ? "-" : "") + locale.format(value) + strConvert;
}

export function formatStatistic(value) {
  if (!value) return null;

  const matches = value
    .toString()
    .replace(/[,.]/g, "")
    .match(/^(\d+[,.]?\d*)\s*(.*)$/);
  if (!matches) return value;

  const [_, numberPart, textPart] = matches;
  const cleanNumber = numberPart.replace(/[,.]/g, "");

  const number = parseInt(cleanNumber);
  if (isNaN(number)) return value;

  let formattedNumber;
  if (number >= 1000000000) {
    formattedNumber = (number / 1000000000).toFixed(1).replace(".", ",") + "B";
  } else if (number >= 1000000) {
    formattedNumber = (number / 1000000).toFixed(1).replace(".", ",") + "M";
  } else if (number >= 1000) {
    formattedNumber = (number / 1000).toFixed(1).replace(".", ",") + "K";
  } else {
    formattedNumber = number.toString();
  }

  return textPart ? `${formattedNumber} ${textPart}` : formattedNumber;
}

function normalizeSymbolName(input) {
  const normalized = input
    .toLowerCase()
    .trim()
    .replace(/à|á|ạ|ả|ã|â|ầ|ấ|ậ|ẩ|ẫ|ă|ằ|ắ|ặ|ẳ|ẵ/g, "a")
    .replace(/è|é|ẹ|ẻ|ẽ|ê|ề|ế|ệ|ể|ễ/g, "e")
    .replace(/ì|í|ị|ỉ|ĩ/g, "i")
    .replace(/ò|ó|ọ|ỏ|õ|ô|ồ|ố|ộ|ổ|ỗ|ơ|ờ|ớ|ợ|ở|ỡ/g, "o")
    .replace(/ù|ú|ụ|ủ|ũ|ư|ừ|ứ|ự|ử|ữ/g, "u")
    .replace(/ỳ|ý|ỵ|ỷ|ỹ/g, "y")
    .replace(/đ/g, "d")
    .replace(/\s+/g, "");
  return normalized;
}

// Thêm hàm mới để xử lý parse số tiền
function parseGameAmount(amount, currentBalance) {
  if (!amount) return null;

  amount = amount.toString().toLowerCase().trim();
  let value = new Big(0);

  // Xử lý all/allin
  if (amount === "all" || amount === "allin") {
    return "allin";
  }

  try {
    // Xử lý phần trăm
    if (amount.endsWith("%")) {
      const percentage = parseFloat(amount.slice(0, -1));
      if (isNaN(percentage) || percentage <= 0 || percentage > 100) {
        throw new Error("Phần trăm cược không hợp lệ (1-100%)");
      }
      value = new Big(currentBalance).mul(percentage).div(100).round(0, Big.roundDown);
    }
    // Xử lý các đơn vị tiền tệ
    else {
      let normalized = amount.toLowerCase();
      let multiplier = new Big(1);

      // Tạo map các đơn vị và giá trị
      const units = {
        k: new Big(1000),
        m: new Big(1000000),
        b: new Big(1000000000),
        kb: new Big(100000), // 100k
        bb: new Big(1000000000000), // 1000b
      };

      // Xử lý từng ký tự đơn vị từ phải sang trái
      while (normalized.length > 0) {
        let found = false;
        for (const [unit, value] of Object.entries(units)) {
          if (normalized.endsWith(unit)) {
            multiplier = multiplier.mul(value);
            normalized = normalized.slice(0, -1);
            found = true;
            break;
          }
        }
        if (!found) break;
      }

      // Xử lý số
      const number = parseFloat(normalized);
      if (isNaN(number)) {
        throw new Error("Số tiền không hợp lệ");
      }

      value = new Big(number).mul(multiplier);
    }

    if (value.lt(0)) {
      throw new Error("Số tiền cược phải lớn hơn 0");
    }

    return value;
  } catch (error) {
    throw new Error("Số tiền không hợp lệ: " + error.message);
  }
}

function formatMiliseconds(milisecond) {
  const seconds = Math.floor(milisecond / 1000);
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const remainingSeconds = seconds % 60;

  const parts = [];
  if (days > 0) {
    parts.push(`${days}d`);
  }
  if (hours > 0 || days > 0) {
    parts.push(`${hours}h`);
  }
  if (minutes > 0 || hours > 0 || days > 0) {
    parts.push(`${minutes}p`);
  }
  parts.push(`${remainingSeconds}s`);

  return parts.join(" ");
}

function formatSeconds(seconds) {
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const remainingSeconds = seconds % 60;

  const parts = [];
  if (days > 0) {
    parts.push(`${days}d`);
  }
  if (hours > 0 || days > 0) {
    parts.push(`${hours}h`);
  }
  if (minutes > 0 || hours > 0 || days > 0) {
    parts.push(`${minutes}p`);
  }
  parts.push(`${remainingSeconds}s`);

  return parts.join(" ");
}

function getContent(message) {
  return message.data.content.title || message.data.content;
}

function removeMention(message) {
  let content = message.data.content;
  try {
    content = content.title ? content.title : content;
    const mentions = message.data.mentions || [];
    if (content && typeof content === "string") {
      if (!mentions) return content.trim();
      const sortedMentions = [...mentions].sort((a, b) => b.pos - a.pos);
      sortedMentions.forEach((mention) => {
        content = content.replace(content.substr(mention.pos, mention.len), "");
      });
      return content
        .split("\n")
        .map((line) => line.replace(/\s+/g, " ").trim())
        .join("\n");
    } else {
      return "";
    }
  } catch (error) {
    console.log("Error remove mention: ", content);
    return message.data.content;
  }
}

function capitalizeEachWord(string) {
  if (!string) return "";
  return string
    .split(" ")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

function deepParseJSON(obj) {
  if (typeof obj === "string") {
    try {
      return deepParseJSON(JSONbig.parse(obj));
    } catch (e) {
      return obj;
    }
  } else if (Array.isArray(obj)) {
    return obj.map(deepParseJSON);
  } else if (typeof obj === "object" && obj !== null) {
    if (obj && typeof obj === "object" && obj.constructor && obj.constructor.name === "BigNumber") {
      return obj.toString();
    }
    return Object.fromEntries(Object.entries(obj).map(([key, value]) => [key, deepParseJSON(value)]));
  }
  return obj;
}

function deepStringifyJSON(obj, space = null) {
  try {
    const processObject = (value) => {
      if (value === null || value === undefined) {
        return value;
      }
      if (typeof value === "object" && value.constructor && value.constructor.name === "BigNumber") {
        return value.toString();
      }
      if (typeof value === "bigint") {
        return value.toString();
      }
      if (Array.isArray(value)) {
        return value.map(processObject);
      }
      if (typeof value === "object") {
        const result = {};
        for (const [k, v] of Object.entries(value)) {
          result[k] = processObject(v);
        }
        return result;
      }
      return value;
    };
    const processed = processObject(obj);
    return JSONbig.stringify(processed, null, space);
  } catch (error) {
    console.error("Lỗi chuyển đổi object sang JSON:", error);
    try {
      return JSON.stringify(obj, null, space);
    } catch (e) {
      return String(obj);
    }
  }
}

function randomIntFromInterval(min, max) {
  return Math.floor(Math.random() * (max - min + 1) + min);
}

function randomIDTemp() {
  return Date.now() + randomIntFromInterval(10000, 99999);
}

function maskPhoneNumber(messageText) {
  return messageText.replace(/(?:\+84|\+8|\b0)?\d{8,10}\b/g, (match) => {
    const last4 = match.slice(-4);
    return `xxxx${last4}`;
  });
}

function formatSelectionRanges(arr) {
  const result = [];
  let i = 0;

  const isValidNumber = (str) => {
    return /^[1-9]\d*$/.test(str) || str === "0";
  };

  while (i < arr.length) {
    const current = arr[i];

    if (isValidNumber(current)) {
      let start = Number(current);
      let end = start;
      let j = i + 1;

      let direction = null;
      if (j < arr.length && isValidNumber(arr[j])) {
        const next = Number(arr[j]);
        if (next === end + 1) direction = 1;
        else if (next === end - 1) direction = -1;
      }

      while (j < arr.length && isValidNumber(arr[j]) && Number(arr[j]) === end + direction) {
        end = Number(arr[j]);
        j++;
      }

      if (start === end) {
        result.push(start.toString());
      } else {
        result.push(`${start} >>> ${end}`);
      }

      i = j;
    } else {
      result.push(arr[i]);
      i++;
    }
  }

  return result.join(", ");
}

function randomEmoji() {
  const emojis = ["😊", "🌟", "🎉", "🌈", "🌺", "🍀", "🌞", "🌸"];
  return emojis[Math.floor(Math.random() * emojis.length)];
}

export {
  parseTime,
  formatDate,
  formatDateText,
  formatTime,
  getTimeToString,
  getTimeNow,
  formatCurrency,
  normalizeSymbolName,
  formatBigNumber,
  parseGameAmount,
  formatMiliseconds,
  formatSeconds,
  getContent,
  removeMention,
  capitalizeEachWord,
  deepParseJSON,
  deepStringifyJSON,
  randomIntFromInterval,
  randomIDTemp,
  maskPhoneNumber,
  formatSelectionRanges,
  randomEmoji,
};
