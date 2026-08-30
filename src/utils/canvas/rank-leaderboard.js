import { createCanvas, loadImage } from "canvas";
import fs from "fs";
import path from "path";
import sharp from "sharp";
import * as cv from "./index.js";
import { tempDir } from "../io-json.js";
import { FONT_MAIN, randomIDTemp } from "../format-util.js";

// Màu sắc cho các rank
const RANK_COLORS = {
  dong: { color: "#CD7F32", gradient: ["#CD7F32", "#B87333"] },
  bac: { color: "#C0C0C0", gradient: ["#C0C0C0", "#A8A8A8"] },
  vang: { color: "#FFD700", gradient: ["#FFD700", "#FFA500"] },
  "bach-kim": { color: "#E5E4E2", gradient: ["#E5E4E2", "#98D8C8"] },
  "kim-cuong": { color: "#B9F2FF", gradient: ["#B9F2FF", "#00CED1"] },
  "tinh-anh": { color: "#DDA0DD", gradient: ["#DDA0DD", "#BA55D3"] },
  "cao-thu": { color: "#FF1493", gradient: ["#FF1493", "#C71585"] },
};

// Chuyển đổi số La Mã
const ROMAN_NUMERALS = ["I", "II", "III", "IV", "V"];

/**
 * Chuyển level number sang La Mã
 */
function toRoman(num) {
  return ROMAN_NUMERALS[num - 1] || num.toString();
}

/**
 * Tính rank và số sao dựa theo số tin nhắn
 * Mỗi 1 tin nhắn = 1 sao
 * @param {number} messageCount - Số tin nhắn trong ngày
 * @param {Object} rankStar - Cấu hình rank từ rank-chat.js
 * @returns {Object} Thông tin rank
 */
export function calculateRank(messageCount, rankStar) {
  let totalStars = 0;

  // Thứ tự các rank
  const ranks = ["dong", "bac", "vang", "bach-kim", "kim-cuong", "tinh-anh"];

  for (const rankKey of ranks) {
    const rankConfig = rankStar[rankKey];
    if (!rankConfig) continue;

    const maxStarInLevel = rankConfig.maxStarInLevel;
    const levels = rankConfig.levels || rankConfig.maxLevel || rankConfig.level || 1;

    // Tổng số sao cần để hoàn thành rank này
    const totalStarsInRank = maxStarInLevel * levels;

    if (messageCount <= totalStars + totalStarsInRank) {
      // Tính level và sao trong rank hiện tại
      const starsInCurrentRank = messageCount - totalStars;
      const currentLevelIndex = Math.floor(starsInCurrentRank / maxStarInLevel);
      let starsInCurrentLevel = starsInCurrentRank % maxStarInLevel;

      // Nếu đã đủ số sao trong level (ví dụ: 4/4 sao), giữ nguyên ở level đó
      if (starsInCurrentLevel === 0 && starsInCurrentRank > 0) {
        starsInCurrentLevel = maxStarInLevel;
        // Lùi lại 1 level
        const adjustedLevelIndex = currentLevelIndex - 1;
        const currentLevel = levels - adjustedLevelIndex;
        const levelDisplay = toRoman(currentLevel);

        const colors = RANK_COLORS[rankKey] || { color: "#FFFFFF", gradient: ["#FFFFFF", "#CCCCCC"] };

        return {
          rankKey,
          rankName: rankConfig.name,
          level: levelDisplay,
          stars: starsInCurrentLevel,
          maxStars: maxStarInLevel,
          totalMessages: messageCount,
          messagesForNextStar: 1,
          color: colors.color,
          gradient: colors.gradient,
          displayName: `${rankConfig.name} ${levelDisplay}`,
          img: rankConfig.img,
        };
      }

      // Level tính từ cao xuống thấp (ví dụ: Đồng III -> II -> I)
      const currentLevel = levels - currentLevelIndex;
      const levelDisplay = toRoman(currentLevel);

      const colors = RANK_COLORS[rankKey] || { color: "#FFFFFF", gradient: ["#FFFFFF", "#CCCCCC"] };

      return {
        rankKey,
        rankName: rankConfig.name,
        level: levelDisplay,
        stars: starsInCurrentLevel,
        maxStars: maxStarInLevel,
        totalMessages: messageCount,
        messagesForNextStar: maxStarInLevel - starsInCurrentLevel,
        color: colors.color,
        gradient: colors.gradient,
        displayName: `${rankConfig.name} ${levelDisplay}`,
        img: rankConfig.img,
      };
    }

    totalStars += totalStarsInRank;
  }

  // Nếu vượt qua tất cả rank thường, tính Cao Thủ
  const caoThuConfig = rankStar["cao-thu"];
  if (!caoThuConfig) {
    // Nếu không có config cao thủ, trả về rank cao nhất
    const colors = RANK_COLORS["tinh-anh"];
    return {
      rankKey: "tinh-anh",
      rankName: rankStar["tinh-anh"]?.name || "Tinh Anh",
      level: "I",
      stars: rankStar["tinh-anh"]?.maxStarInLevel || 5,
      maxStars: rankStar["tinh-anh"]?.maxStarInLevel || 5,
      totalMessages: messageCount,
      messagesForNextStar: 0,
      color: colors.color,
      gradient: colors.gradient,
      displayName: `${rankStar["tinh-anh"]?.name || "Tinh Anh"} I`,
      img: rankStar["tinh-anh"]?.img,
    };
  }

  const starsAboveBase = messageCount - totalStars;
  const messagesPerStar = caoThuConfig.messagesPerStar || 10;
  const stars = Math.floor(starsAboveBase / messagesPerStar);

  // Tìm title phù hợp dựa vào số sao
  let titleInfo = caoThuConfig.title?.[0] || { name: "Cao Thủ", belowLevel: 999999 };
  for (const t of caoThuConfig.title || []) {
    if (stars < t.belowLevel) {
      titleInfo = t;
      break;
    }
  }

  const colors = RANK_COLORS["cao-thu"];

  return {
    rankKey: "cao-thu",
    rankName: "Cao Thủ",
    title: titleInfo.name,
    stars,
    totalMessages: messageCount,
    messagesForNextStar: messagesPerStar - (starsAboveBase % messagesPerStar),
    color: colors.color,
    gradient: colors.gradient,
    displayName: titleInfo.name,
    img: titleInfo.img,
    isCaoThu: true,
  };
}

/**
 * Vẽ sao rank
 * @param {CanvasRenderingContext2D} ctx - Canvas context
 * @param {number} x - Vị trí x
 * @param {number} y - Vị trí y
 * @param {number} size - Kích thước sao
 * @param {boolean} filled - Sao đầy hay rỗng
 * @param {string} color - Màu sao
 */
function drawStar(ctx, x, y, size, filled, color = "#FFD700") {
  const spikes = 5;
  const outerRadius = size;
  const innerRadius = size / 2;

  ctx.save();
  ctx.beginPath();
  ctx.translate(x, y);

  for (let i = 0; i < spikes * 2; i++) {
    const radius = i % 2 === 0 ? outerRadius : innerRadius;
    const angle = (i * Math.PI) / spikes - Math.PI / 2;
    const px = Math.cos(angle) * radius;
    const py = Math.sin(angle) * radius;

    if (i === 0) {
      ctx.moveTo(px, py);
    } else {
      ctx.lineTo(px, py);
    }
  }

  ctx.closePath();

  if (filled) {
    ctx.fillStyle = color;
    ctx.fill();
  } else {
    ctx.strokeStyle = color;
    ctx.lineWidth = 2;
    ctx.stroke();
  }

  ctx.restore();
}

function roundedPath(ctx, x, y, width, height, radius) {
  const r = Math.min(radius, width / 2, height / 2);
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + width, y, x + width, y + height, r);
  ctx.arcTo(x + width, y + height, x, y + height, r);
  ctx.arcTo(x, y + height, x, y, r);
  ctx.arcTo(x, y, x + width, y, r);
  ctx.closePath();
}

function fillRounded(ctx, x, y, width, height, radius, fill) {
  roundedPath(ctx, x, y, width, height, radius);
  ctx.fillStyle = fill;
  ctx.fill();
}

function fitText(ctx, text, maxWidth) {
  const value = String(text || "Ẩn Danh");
  if (ctx.measureText(value).width <= maxWidth) return value;
  let end = value.length;
  while (end > 0 && ctx.measureText(`${value.slice(0, end)}…`).width > maxWidth) end--;
  return `${value.slice(0, end).trim()}…`;
}

async function drawModernAvatar(ctx, user, x, y, size, ringColor) {
  ctx.save();
  ctx.beginPath();
  ctx.arc(x + size / 2, y + size / 2, size / 2, 0, Math.PI * 2);
  ctx.clip();
  let loaded = false;
  try {
    if (user.avatar && cv.isValidUrl(user.avatar)) {
      const avatar = await loadImage(user.avatar);
      const scale = Math.max(size / avatar.width, size / avatar.height);
      const sourceWidth = size / scale;
      const sourceHeight = size / scale;
      const sourceX = (avatar.width - sourceWidth) / 2;
      const sourceY = (avatar.height - sourceHeight) / 2;
      ctx.drawImage(avatar, sourceX, sourceY, sourceWidth, sourceHeight, x, y, size, size);
      loaded = true;
    }
  } catch {}
  if (!loaded) {
    const fallback = ctx.createLinearGradient(x, y, x + size, y + size);
    fallback.addColorStop(0, "#29334f");
    fallback.addColorStop(1, "#111729");
    ctx.fillStyle = fallback;
    ctx.fillRect(x, y, size, size);
    ctx.fillStyle = "rgba(255,255,255,0.9)";
    ctx.font = `bold ${Math.round(size * 0.34)}px ${FONT_MAIN}`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(String(user.name || "?").trim().charAt(0).toUpperCase(), x + size / 2, y + size / 2 + 1);
  }
  ctx.restore();
  ctx.beginPath();
  ctx.arc(x + size / 2, y + size / 2, size / 2 + 3, 0, Math.PI * 2);
  ctx.strokeStyle = ringColor;
  ctx.lineWidth = 5;
  ctx.stroke();
}

async function renderEditorialLeaderboard(topUsers, groupName, titleText, periodLabel) {
  const width = 1080;
  const lowerUsers = topUsers.slice(3);
  const height = Math.max(1040, 652 + lowerUsers.length * 88 + 86);
  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext("2d");

  ctx.fillStyle = "#f4efe4";
  ctx.fillRect(0, 0, width, height);

  ctx.fillStyle = "#e95d32";
  ctx.fillRect(0, 0, 18, height);
  ctx.fillStyle = "#15263c";
  ctx.fillRect(18, 0, width - 18, 20);

  ctx.fillStyle = "#e95d32";
  ctx.font = `bold 14px ${FONT_MAIN}`;
  ctx.textAlign = "left";
  ctx.fillText(`NGH / ${periodLabel}`, 62, 66);
  ctx.fillStyle = "#15263c";
  ctx.font = `bold 54px ${FONT_MAIN}`;
  ctx.fillText("TOP CHAT", 58, 130);
  ctx.font = `bold 22px ${FONT_MAIN}`;
  ctx.fillText(fitText(ctx, titleText.replaceAll("🏆", "").trim(), 650), 62, 169);
  ctx.fillStyle = "#6d6b65";
  ctx.font = `18px ${FONT_MAIN}`;
  ctx.fillText(fitText(ctx, groupName, 650), 62, 202);
  ctx.textAlign = "right";
  ctx.fillStyle = "#15263c";
  ctx.font = `bold 92px ${FONT_MAIN}`;
  ctx.fillText("10", width - 58, 151);
  ctx.fillStyle = "#e95d32";
  ctx.font = `bold 13px ${FONT_MAIN}`;
  ctx.fillText("THÀNH VIÊN NỔI BẬT", width - 62, 180);

  ctx.strokeStyle = "#15263c";
  ctx.lineWidth = 3;
  ctx.beginPath(); ctx.moveTo(58, 228); ctx.lineTo(width - 58, 228); ctx.stroke();

  const first = topUsers[0];
  if (first) {
    fillRounded(ctx, 58, 258, 600, 316, 4, "#15263c");
    ctx.fillStyle = "#e95d32";
    ctx.fillRect(58, 258, 16, 316);
    await drawModernAvatar(ctx, first, 102, 302, 170, "#f4efe4");
    ctx.fillStyle = "#e95d32";
    ctx.font = `bold 78px ${FONT_MAIN}`;
    ctx.textAlign = "left";
    ctx.fillText("01", 310, 354);
    ctx.fillStyle = "#ffffff";
    ctx.font = `bold 28px ${FONT_MAIN}`;
    ctx.fillText(fitText(ctx, first.name, 300), 310, 407);
    ctx.fillStyle = "#aeb9c2";
    ctx.font = `15px ${FONT_MAIN}`;
    ctx.fillText(fitText(ctx, first.rankInfo.displayName, 300), 310, 439);
    ctx.fillStyle = "#f4efe4";
    ctx.font = `bold 36px ${FONT_MAIN}`;
    ctx.fillText(Number(first.messageCount || 0).toLocaleString("vi-VN"), 310, 500);
    ctx.fillStyle = "#e95d32";
    ctx.font = `bold 12px ${FONT_MAIN}`;
    ctx.fillText("TIN NHẮN", 310, 526);
  }

  const sideUsers = [topUsers[1], topUsers[2]];
  for (let i = 0; i < sideUsers.length; i++) {
    const user = sideUsers[i];
    if (!user) continue;
    const y = 258 + i * 166;
    fillRounded(ctx, 680, y, 342, 150, 4, i === 0 ? "#d8d1c4" : "#e4ddd1");
    await drawModernAvatar(ctx, user, 704, y + 29, 92, i === 0 ? "#7f8a96" : "#b8734f");
    ctx.textAlign = "left";
    ctx.fillStyle = "#e95d32";
    ctx.font = `bold 24px ${FONT_MAIN}`;
    ctx.fillText(`0${i + 2}`, 824, y + 36);
    ctx.fillStyle = "#15263c";
    ctx.font = `bold 18px ${FONT_MAIN}`;
    ctx.fillText(fitText(ctx, user.name, 174), 824, y + 70);
    ctx.font = `bold 19px ${FONT_MAIN}`;
    ctx.fillText(Number(user.messageCount || 0).toLocaleString("vi-VN"), 824, y + 103);
    ctx.fillStyle = "#74716b";
    ctx.font = `11px ${FONT_MAIN}`;
    ctx.fillText(fitText(ctx, user.rankInfo.displayName, 174), 824, y + 127);
  }

  ctx.fillStyle = "#15263c";
  ctx.font = `bold 13px ${FONT_MAIN}`;
  ctx.textAlign = "left";
  ctx.fillText("HẠNG", 62, 625);
  ctx.fillText("THÀNH VIÊN", 174, 625);
  ctx.textAlign = "right";
  ctx.fillText("TIN NHẮN", width - 62, 625);
  ctx.strokeStyle = "#c7beb0";
  ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(58, 640); ctx.lineTo(width - 58, 640); ctx.stroke();

  const listY = 652;
  for (let i = 0; i < lowerUsers.length; i++) {
    const user = lowerUsers[i];
    const y = listY + i * 88;
    if (i % 2 === 0) fillRounded(ctx, 58, y, width - 116, 76, 2, "#ebe4d8");
    const rankNumber = i + 4;
    ctx.fillStyle = "#e95d32";
    ctx.font = `bold 26px ${FONT_MAIN}`;
    ctx.textAlign = "center";
    ctx.fillText(String(rankNumber).padStart(2, "0"), 94, y + 48);
    await drawModernAvatar(ctx, user, 138, y + 9, 58, "#15263c");
    ctx.textAlign = "left";
    ctx.fillStyle = "#15263c";
    ctx.font = `bold 19px ${FONT_MAIN}`;
    ctx.fillText(fitText(ctx, user.name, 540), 222, y + 31);
    ctx.fillStyle = "#77736c";
    ctx.font = `13px ${FONT_MAIN}`;
    ctx.fillText(fitText(ctx, user.rankInfo.displayName, 540), 222, y + 56);
    ctx.textAlign = "right";
    ctx.fillStyle = "#15263c";
    ctx.font = `bold 24px ${FONT_MAIN}`;
    ctx.fillText(Number(user.messageCount || 0).toLocaleString("vi-VN"), width - 62, y + 47);
  }

  const footerY = height - 34;
  ctx.textAlign = "left";
  ctx.fillStyle = "#77736c";
  ctx.font = `10px ${FONT_MAIN}`;
  ctx.fillText("NGH MEDIA  /  INTERACTION REPORT", 62, footerY);
  ctx.textAlign = "right";
  const now = new Date().toLocaleString("vi-VN", { timeZone: "Asia/Ho_Chi_Minh" });
  ctx.fillText(`CẬP NHẬT ${now}`, width - 62, footerY);

  const outputPath = path.join(tempDir, `rank_leaderboard_${randomIDTemp()}.png`);
  await fs.promises.writeFile(outputPath, canvas.toBuffer("image/png"));
  return outputPath;
}

async function drawRankEmblem(ctx, rankInfo, x, y, size) {
  try {
    if (rankInfo?.img && fs.existsSync(rankInfo.img)) {
      const image = await loadImage(rankInfo.img);
      ctx.drawImage(image, x, y, size, size);
      return;
    }
  } catch {}

  const color = rankInfo?.color || "#6ee7ff";
  ctx.save();
  ctx.translate(x + size / 2, y + size / 2);
  ctx.rotate(Math.PI / 4);
  const gradient = ctx.createLinearGradient(-size / 2, -size / 2, size / 2, size / 2);
  gradient.addColorStop(0, color);
  gradient.addColorStop(1, "#ffffff");
  fillRounded(ctx, -size * 0.3, -size * 0.3, size * 0.6, size * 0.6, 8, gradient);
  ctx.restore();
}

async function renderModernLeaderboard(topUsers, groupName, titleText, periodLabel) {
  const width = 1080;
  const headerHeight = 190;
  const rowHeight = 112;
  const rowGap = 12;
  const footerHeight = 72;
  const height = headerHeight + topUsers.length * (rowHeight + rowGap) + footerHeight;
  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext("2d");

  ctx.fillStyle = "#030708";
  ctx.fillRect(0, 0, width, height);

  const headerGlow = ctx.createRadialGradient(width / 2, 0, 0, width / 2, 0, 620);
  headerGlow.addColorStop(0, "rgba(0, 229, 255, 0.22)");
  headerGlow.addColorStop(0.55, "rgba(0, 120, 160, 0.07)");
  headerGlow.addColorStop(1, "rgba(0,0,0,0)");
  ctx.fillStyle = headerGlow;
  ctx.fillRect(0, 0, width, 340);

  fillRounded(ctx, 28, 24, width - 56, 138, 24, "rgba(8, 15, 18, 0.92)");
  roundedPath(ctx, 28, 24, width - 56, 138, 24);
  ctx.strokeStyle = "rgba(111, 235, 255, 0.34)";
  ctx.lineWidth = 2;
  ctx.stroke();

  fillRounded(ctx, 54, 48, 132, 34, 17, "#00d6e8");
  ctx.fillStyle = "#031012";
  ctx.font = `bold 12px ${FONT_MAIN}`;
  ctx.textAlign = "center";
  ctx.fillText(periodLabel, 120, 70);

  ctx.textAlign = "left";
  ctx.fillStyle = "#ffffff";
  ctx.font = `bold 39px ${FONT_MAIN}`;
  ctx.fillText(fitText(ctx, titleText.replaceAll("🏆", "").trim(), 690), 54, 121);
  ctx.fillStyle = "#91a7ad";
  ctx.font = `17px ${FONT_MAIN}`;
  ctx.fillText(fitText(ctx, groupName, 680), 54, 148);

  ctx.textAlign = "right";
  ctx.fillStyle = "rgba(255,255,255,0.08)";
  ctx.font = `bold 72px ${FONT_MAIN}`;
  ctx.fillText("TOP 10", width - 52, 117);

  const accents = ["#ffd45a", "#70e8ff", "#ff9767"];
  for (let i = 0; i < topUsers.length; i++) {
    const user = topUsers[i];
    const rank = i + 1;
    const y = headerHeight + i * (rowHeight + rowGap);
    const accent = accents[i] || user.rankInfo?.color || "#59676b";

    const rowGradient = ctx.createLinearGradient(30, y, width - 30, y + rowHeight);
    if (rank === 1) {
      rowGradient.addColorStop(0, "rgba(118, 83, 12, 0.56)");
      rowGradient.addColorStop(0.5, "rgba(32, 28, 17, 0.94)");
      rowGradient.addColorStop(1, "rgba(8, 13, 15, 0.96)");
    } else if (rank === 2) {
      rowGradient.addColorStop(0, "rgba(34, 85, 96, 0.52)");
      rowGradient.addColorStop(0.5, "rgba(15, 25, 29, 0.95)");
      rowGradient.addColorStop(1, "rgba(7, 12, 14, 0.97)");
    } else if (rank === 3) {
      rowGradient.addColorStop(0, "rgba(105, 49, 30, 0.48)");
      rowGradient.addColorStop(0.5, "rgba(27, 20, 17, 0.95)");
      rowGradient.addColorStop(1, "rgba(7, 12, 14, 0.97)");
    } else {
      rowGradient.addColorStop(0, i % 2 ? "rgba(13, 20, 22, 0.96)" : "rgba(20, 29, 31, 0.96)");
      rowGradient.addColorStop(1, "rgba(5, 10, 11, 0.98)");
    }

    ctx.save();
    if (rank <= 3) {
      ctx.shadowColor = `${accent}55`;
      ctx.shadowBlur = 15;
    }
    fillRounded(ctx, 30, y, width - 60, rowHeight, 18, rowGradient);
    ctx.restore();
    roundedPath(ctx, 30.5, y + 0.5, width - 61, rowHeight - 1, 18);
    ctx.strokeStyle = rank <= 3 ? `${accent}bb` : "rgba(103, 142, 149, 0.24)";
    ctx.lineWidth = rank <= 3 ? 2 : 1;
    ctx.stroke();
    ctx.fillStyle = accent;
    ctx.fillRect(30, y + 22, 5, rowHeight - 44);

    ctx.textAlign = "center";
    ctx.fillStyle = rank <= 3 ? accent : "#d8e0e2";
    ctx.font = `bold ${rank === 10 ? 27 : 31}px ${FONT_MAIN}`;
    ctx.fillText(`#${rank}`, 78, y + 69);

    await drawModernAvatar(ctx, user, 118, y + 15, 82, accent);

    ctx.textAlign = "left";
    ctx.fillStyle = "#ffffff";
    ctx.font = `bold 22px ${FONT_MAIN}`;
    ctx.fillText(fitText(ctx, user.name, 430), 226, y + 46);
    ctx.fillStyle = "#8fa0a5";
    ctx.font = `15px ${FONT_MAIN}`;
    ctx.fillText(`${Number(user.messageCount || 0).toLocaleString("vi-VN")} tin nhắn`, 226, y + 77);

    await drawRankEmblem(ctx, user.rankInfo, 718, y + 27, 58);
    ctx.textAlign = "left";
    ctx.fillStyle = user.rankInfo?.color || "#70e8ff";
    ctx.font = `bold 17px ${FONT_MAIN}`;
    ctx.fillText(fitText(ctx, user.rankInfo?.displayName, 225), 798, y + 45);

    const stars = Math.max(0, Number(user.rankInfo?.stars || 0));
    const maxStars = Math.min(5, Number(user.rankInfo?.maxStars || 5));
    ctx.fillStyle = accent;
    ctx.font = `bold 17px ${FONT_MAIN}`;
    const starText = user.rankInfo?.isCaoThu
      ? `★  ×${stars.toLocaleString("vi-VN")}`
      : `${"★".repeat(Math.min(stars, maxStars))}${"☆".repeat(Math.max(0, maxStars - stars))}`;
    ctx.fillText(starText, 798, y + 76);
  }

  const footerY = height - 30;
  ctx.fillStyle = "#718388";
  ctx.font = `11px ${FONT_MAIN}`;
  ctx.textAlign = "left";
  ctx.fillText("NGH MEDIA  •  CHAT ARENA", 38, footerY);
  ctx.textAlign = "right";
  const now = new Date().toLocaleString("vi-VN", { timeZone: "Asia/Ho_Chi_Minh" });
  ctx.fillText(`CẬP NHẬT ${now}`, width - 38, footerY);

  const outputPath = path.join(tempDir, `rank_leaderboard_${randomIDTemp()}.png`);
  await fs.promises.writeFile(outputPath, canvas.toBuffer("image/png"));
  return outputPath;
}

/**
 * Vẽ hàng xếp hạng cho một người dùng
 */
async function drawRankRow(ctx, user, yPos, index, width) {
  const rowHeight = 110;
  const padding = 20;
  const avatarSize = 80;

  // Background cho row
  ctx.save();
  const bgAlpha = index % 2 === 0 ? 0.1 : 0.05;
  ctx.fillStyle = `rgba(255, 255, 255, ${bgAlpha})`;
  cv.roundRect(ctx, padding, yPos, width - padding * 2, rowHeight, 10, true, false);
  ctx.restore();

  // Vẽ vị trí xếp hạng
  ctx.save();
  ctx.font = `bold 32px ${FONT_MAIN}`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";

  // Màu cho top 3
  if (index === 1) {
    ctx.fillStyle = "#FFD700"; // Vàng
  } else if (index === 2) {
    ctx.fillStyle = "#C0C0C0"; // Bạc
  } else if (index === 3) {
    ctx.fillStyle = "#CD7F32"; // Đồng
  } else {
    ctx.fillStyle = "#FFFFFF";
  }

  const rankX = padding + 40;
  const rankY = yPos + rowHeight / 2;
  ctx.fillText(`#${index}`, rankX, rankY);
  ctx.restore();

  // Vẽ avatar
  const avatarX = padding + 90;
  const avatarY = yPos + (rowHeight - avatarSize) / 2;

  try {
    if (user.avatar && cv.isValidUrl(user.avatar)) {
      const avatar = await loadImage(user.avatar);
      ctx.save();
      ctx.beginPath();
      ctx.arc(avatarX + avatarSize / 2, avatarY + avatarSize / 2, avatarSize / 2, 0, Math.PI * 2);
      ctx.closePath();
      ctx.clip();
      ctx.drawImage(avatar, avatarX, avatarY, avatarSize, avatarSize);
      ctx.restore();

      // Vẽ viền avatar
      ctx.save();
      ctx.beginPath();
      ctx.arc(avatarX + avatarSize / 2, avatarY + avatarSize / 2, avatarSize / 2 + 2, 0, Math.PI * 2);
      ctx.strokeStyle = user.rankInfo.color;
      ctx.lineWidth = 3;
      ctx.stroke();
      ctx.restore();
    } else {
      // Vẽ avatar mặc định
      ctx.save();
      ctx.beginPath();
      ctx.arc(avatarX + avatarSize / 2, avatarY + avatarSize / 2, avatarSize / 2, 0, Math.PI * 2);
      ctx.fillStyle = "#4A5568";
      ctx.fill();
      ctx.restore();
    }
  } catch (error) {
    // Avatar mặc định nếu lỗi
    ctx.save();
    ctx.beginPath();
    ctx.arc(avatarX + avatarSize / 2, avatarY + avatarSize / 2, avatarSize / 2, 0, Math.PI * 2);
    ctx.fillStyle = "#4A5568";
    ctx.fill();
    ctx.restore();
  }

  // Vẽ tên người dùng
  const nameX = avatarX + avatarSize + 20;
  const nameY = yPos + 48;

  ctx.save();
  ctx.font = `bold 28px ${FONT_MAIN}`;
  ctx.fillStyle = "#FFFFFF";
  ctx.textAlign = "left";
  ctx.fillText(user.name, nameX, nameY);
  ctx.restore();

  // Vẽ thông tin tin nhắn
  ctx.save();
  ctx.font = `22px ${FONT_MAIN}`;
  ctx.fillStyle = "#B0B0B0";
  ctx.fillText(`${user.messageCount} tin nhắn`, nameX, nameY + 32);
  ctx.restore();

  // Vẽ rank badge ở bên phải - lùi ra phía trước 12px
  const badgeX = width - padding - 282;
  const badgeY = yPos + rowHeight / 2;

  // Vẽ rank icon nếu có
  let hasRankIcon = false;
  try {
    if (user.rankInfo.img && fs.existsSync(user.rankInfo.img)) {
      const rankIconSize = 60;
      const ext = path.extname(user.rankInfo.img).toLowerCase();

      // Nếu là webp, chuyển sang PNG trước
      if (ext === ".webp") {
        const pngBuffer = await sharp(user.rankInfo.img)
          .png()
          .resize(rankIconSize, rankIconSize, {
            fit: "contain",
            background: { r: 0, g: 0, b: 0, alpha: 0 },
          })
          .toBuffer();

        const rankImg = await loadImage(pngBuffer);
        ctx.drawImage(rankImg, badgeX, badgeY - rankIconSize / 2, rankIconSize, rankIconSize);
      } else {
        // Load trực tiếp nếu không phải webp
        const rankImg = await loadImage(user.rankInfo.img);
        ctx.drawImage(rankImg, badgeX, badgeY - rankIconSize / 2, rankIconSize, rankIconSize);
      }

      hasRankIcon = true;
    }
  } catch (error) {
    // Nếu không load được icon, vẽ emoji rank thay thế
    ctx.save();
    ctx.font = `48px Arial`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";

    // Emoji cho các rank
    const rankEmojis = {
      dong: "🥉",
      bac: "🥈",
      vang: "🥇",
      "bach-kim": "💎",
      "kim-cuong": "💠",
      "tinh-anh": "⭐",
      "cao-thu": "👑",
    };

    const emoji = rankEmojis[user.rankInfo.rankKey] || "🏆";
    ctx.fillText(emoji, badgeX + 30, badgeY);
    ctx.restore();
    hasRankIcon = true;
  }

  // Vẽ tên rank
  const textOffsetX = hasRankIcon ? 90 : 10;
  ctx.save();
  ctx.font = `bold 22px ${FONT_MAIN}`;
  ctx.fillStyle = user.rankInfo.color;
  ctx.textAlign = "left";
  ctx.fillText(user.rankInfo.displayName, badgeX + textOffsetX, badgeY - 10);
  ctx.restore();

  // Vẽ sao
  const starsY = badgeY + 18;
  const starSize = 11;
  const starSpacing = 24;
  const starsStartX = badgeX + textOffsetX + 10;

  if (user.rankInfo.isCaoThu) {
    // Cao thủ chỉ hiển thị số sao
    ctx.save();
    ctx.font = `bold 20px ${FONT_MAIN}`;
    ctx.fillStyle = "#FFD700";
    ctx.fillText(`${user.rankInfo.stars} ⭐`, starsStartX, starsY);
    ctx.restore();
  } else {
    // Các rank khác hiển thị sao
    for (let i = 0; i < user.rankInfo.maxStars; i++) {
      const starX = starsStartX + i * starSpacing;
      drawStar(ctx, starX, starsY, starSize, i < user.rankInfo.stars, user.rankInfo.color);
    }
  }

  return yPos + rowHeight + 10;
}

/**
 * Tạo ảnh bảng xếp hạng
 * @param {Array} users - Danh sách người dùng với thông tin rank
 * @param {string} groupName - Tên nhóm
 * @param {Object} rankStar - Cấu hình rank từ rank-chat.js
 * @returns {Promise<string>} Đường dẫn đến ảnh đã tạo
 */
export async function createRankLeaderboard(users, groupName = "Nhóm", rankStar, titleText = "🏆 BXH TƯƠNG TÁC HÔM NAY 🏆") {
  const usersWithRank = users.map((user) => ({
    ...user,
    rankInfo: calculateRank(user.messageCount || 0, rankStar),
  }));
  usersWithRank.sort((a, b) => b.messageCount - a.messageCount);
  const topUsers = usersWithRank.slice(0, 10);
  const normalizedTitle = titleText.toLowerCase();
  const periodLabel = normalizedTitle.includes("tuần")
    ? "TUẦN NÀY"
    : normalizedTitle.includes("tháng") ? "THÁNG NÀY" : "HÔM NAY";
  return renderModernLeaderboard(topUsers, groupName, titleText, periodLabel);
}
/**
 * Tạo ảnh bảng xếp hạng tổng
 * @param {Array} users - Danh sách người dùng với thông tin rank
 * @param {string} groupName - Tên nhóm
 * @param {Object} rankStar - Cấu hình rank từ rank-chat.js
 * @returns {Promise<string>} Đường dẫn đến ảnh đã tạo
 */
export async function createRankLeaderboardTotal(users, groupName = "Nhóm", rankStar) {
  const usersWithRank = users.map((user) => {
    const normalizedCount = Math.floor((user.messageCount || 0) / 1000);
    return {
      ...user,
      rankInfo: calculateRank(normalizedCount, rankStar),
    };
  });
  usersWithRank.sort((a, b) => b.messageCount - a.messageCount);
  const topUsers = usersWithRank.slice(0, 10);
  return renderModernLeaderboard(topUsers, groupName, "BXH TƯƠNG TÁC TỔNG", "TOÀN THỜI GIAN");
}

/**
 * Lấy thông tin rank để hiển thị text
 * @param {number} messageCount - Số tin nhắn
 * @param {Object} rankStar - Cấu hình rank
 * @returns {string} Thông tin rank dạng text
 */
export function getRankText(messageCount, rankStar) {
  const rankInfo = calculateRank(messageCount, rankStar);

  if (rankInfo.isCaoThu) {
    return `${rankInfo.displayName} (${rankInfo.stars} ⭐) - ${rankInfo.totalMessages} tin nhắn`;
  } else {
    const starText = "⭐".repeat(rankInfo.stars) + "☆".repeat(rankInfo.maxStars - rankInfo.stars);
    return `${rankInfo.displayName} ${starText} - ${rankInfo.totalMessages} tin nhắn`;
  }
}

/**
 * Tạo card rank cá nhân
 * @param {Object} user - Thông tin người dùng
 * @param {Object} rankStar - Cấu hình rank
 * @returns {Promise<string>} Đường dẫn đến ảnh đã tạo
 */
export async function createPersonalRankCard(user, rankStar, titleText = "Thành Tích Tương Tác Của Bạn Hôm Nay") {
  // Tính toán rank
  const rankInfo = calculateRank(user.messageCount || 0, rankStar);

  // Kích thước card
  const width = 750;
  const height = 370;

  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext("2d");

  // Vẽ background gradient
  const gradient = ctx.createLinearGradient(0, 0, width, height);
  gradient.addColorStop(0, "#1a1a2e");
  gradient.addColorStop(0.5, "#16213e");
  gradient.addColorStop(1, "#0f3460");
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, width, height);

  // Vẽ hiệu ứng particles
  cv.drawAnimatedBackground(ctx, width, height);

  // Viền card với glow effect
  ctx.save();
  ctx.shadowColor = "rgba(255, 215, 0, 0.5)";
  ctx.shadowBlur = 15;
  ctx.strokeStyle = "rgba(255, 215, 0, 0.6)";
  ctx.lineWidth = 3;
  cv.roundRect(ctx, 15, 15, width - 30, height - 30, 25, false, true);
  ctx.restore();

  // Avatar bên trái - căn cân bằng
  const avatarSize = 150;
  const leftMargin = 80;
  const rightMargin = 80;
  const avatarX = leftMargin;
  const avatarY = height / 2 - avatarSize / 2;

  try {
    if (user.avatar && cv.isValidUrl(user.avatar)) {
      const avatar = await loadImage(user.avatar);
      
      // Vẽ shadow cho avatar
      ctx.save();
      ctx.shadowColor = "rgba(0, 0, 0, 0.5)";
      ctx.shadowBlur = 20;
      ctx.shadowOffsetX = 0;
      ctx.shadowOffsetY = 5;
      ctx.beginPath();
      ctx.arc(avatarX + avatarSize / 2, avatarY + avatarSize / 2, avatarSize / 2, 0, Math.PI * 2);
      ctx.fillStyle = "rgba(0, 0, 0, 0.3)";
      ctx.fill();
      ctx.restore();

      // Vẽ avatar
      ctx.save();
      ctx.beginPath();
      ctx.arc(avatarX + avatarSize / 2, avatarY + avatarSize / 2, avatarSize / 2, 0, Math.PI * 2);
      ctx.closePath();
      ctx.clip();
      ctx.drawImage(avatar, avatarX, avatarY, avatarSize, avatarSize);
      ctx.restore();

      // Viền gradient đẹp quanh avatar
      ctx.save();
      ctx.shadowColor = rankInfo.color;
      ctx.shadowBlur = 15;
      ctx.beginPath();
      ctx.arc(avatarX + avatarSize / 2, avatarY + avatarSize / 2, avatarSize / 2 + 4, 0, Math.PI * 2);
      const avatarGradient = ctx.createLinearGradient(avatarX, avatarY, avatarX + avatarSize, avatarY + avatarSize);
      avatarGradient.addColorStop(0, "#FFD700");
      avatarGradient.addColorStop(0.5, rankInfo.color);
      avatarGradient.addColorStop(1, "#FFD700");
      ctx.strokeStyle = avatarGradient;
      ctx.lineWidth = 5;
      ctx.stroke();
      ctx.restore();
    }
  } catch {
    ctx.save();
    ctx.beginPath();
    ctx.arc(avatarX + avatarSize / 2, avatarY + avatarSize / 2, avatarSize / 2, 0, Math.PI * 2);
    ctx.fillStyle = "#4A5568";
    ctx.fill();
    ctx.strokeStyle = "#FFD700";
    ctx.lineWidth = 5;
    ctx.stroke();
    ctx.restore();
  }

  // ==== Thông tin bên phải (căn giữa trong phần còn lại) ====
  const infoStartX = avatarX + avatarSize + 50;
  const infoEndX = width - rightMargin;
  const contentCenterX = (infoStartX + infoEndX) / 2;
  let contentY = height / 2 - 140;

  // Tiêu đề với gradient (căn giữa toàn bộ card)
  ctx.save();
  ctx.font = `bold 32px ${FONT_MAIN}`;
  ctx.fillStyle = cv.getRandomGradient(ctx, width);
  ctx.textAlign = "center";
  ctx.fillText(titleText, width / 2, contentY + 10);
  ctx.restore();

  // Divider line
  contentY += 10;
  ctx.save();
  ctx.strokeStyle = "rgba(255, 255, 255, 0.1)";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(infoStartX, contentY);
  ctx.lineTo(infoEndX, contentY);
  ctx.stroke();
  ctx.restore();

  // Tên người dùng với shadow (căn giữa)
  contentY += 65;
  ctx.save();
  ctx.shadowColor = "rgba(0, 0, 0, 0.5)";
  ctx.shadowBlur = 5;
  ctx.shadowOffsetX = 2;
  ctx.shadowOffsetY = 2;
  ctx.font = `bold 42px ${FONT_MAIN}`;
  ctx.fillStyle = "#FFFFFF";
  ctx.textAlign = "center";
  ctx.fillText(user.name || "Người dùng", contentCenterX, contentY);
  ctx.restore();

  // Số tin nhắn (căn giữa)
  contentY += 45;
  ctx.save();
  ctx.font = `26px ${FONT_MAIN}`;
  ctx.fillStyle = "#CBD5E1";
  ctx.textAlign = "center";
  ctx.fillText(`💬 ${user.messageCount || 0} tin nhắn trong hôm nay`, contentCenterX, contentY);
  ctx.restore();
  contentY += 70;
  // Rank icon + tên rank (căn giữa chính xác)
  const rankIconSize = 70;
  
  // Tính toán để căn giữa cả icon và text
  ctx.save();
  ctx.font = `bold 34px ${FONT_MAIN}`;
  const rankText = rankInfo.displayName;
  const rankTextWidth = ctx.measureText(rankText).width;
  const rankIconSpacing = 15;
  const rankTotalWidth = rankIconSize + rankIconSpacing + rankTextWidth;
  const rankStartX = contentCenterX - rankTotalWidth / 2;
  const rankIconX = rankStartX;
  const rankIconY = contentY - rankIconSize / 2;
  ctx.restore();

  try {
    if (rankInfo.img && fs.existsSync(rankInfo.img)) {
      const ext = path.extname(rankInfo.img).toLowerCase();
      let rankImg;
      if (ext === ".webp") {
        const pngBuffer = await sharp(rankInfo.img)
          .png()
          .resize(rankIconSize, rankIconSize, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } })
          .toBuffer();
        rankImg = await loadImage(pngBuffer);
      } else {
        rankImg = await loadImage(rankInfo.img);
      }
      // Vẽ glow effect cho rank icon
      ctx.save();
      ctx.shadowColor = rankInfo.color;
      ctx.shadowBlur = 20;
      ctx.drawImage(rankImg, rankIconX, rankIconY, rankIconSize, rankIconSize);
      ctx.restore();
    }
  } catch {
    ctx.save();
    ctx.shadowColor = rankInfo.color;
    ctx.shadowBlur = 15;
    ctx.font = `60px Arial`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    const rankEmojis = {
      dong: "🥉",
      bac: "🥈",
      vang: "🥇",
      "bach-kim": "💎",
      "kim-cuong": "💠",
      "tinh-anh": "⭐",
      "cao-thu": "👑",
    };
    const emoji = rankEmojis[rankInfo.rankKey] || "🏆";
    ctx.fillText(emoji, rankIconX + rankIconSize / 2, rankIconY + rankIconSize / 2);
    ctx.restore();
  }

  // 📍 Căn lại vị trí tên rank — đẩy lên cao nhẹ cho thoáng
  const rankTextY = contentY - 27; // ↑ Dịch cao hơn một chút (từ -27 → -35)

  ctx.save();
  ctx.shadowColor = "rgba(0, 0, 0, 0.5)";
  ctx.shadowBlur = 5;
  ctx.shadowOffsetX = 2;
  ctx.shadowOffsetY = 2;
  ctx.font = `bold 34px ${FONT_MAIN}`;
  ctx.fillStyle = rankInfo.color;
  ctx.textAlign = "left";
  ctx.textBaseline = "middle";
  ctx.fillText(rankText, rankStartX + rankIconSize + rankIconSpacing, rankTextY);
  ctx.restore();

  // ===== chuẩn: dãy sao đều, thẳng hàng và cân bằng giữa filled & stroke =====
  const starsY = contentY + 20;       // vị trí dọc cố định (không random)
  const starSize = 17;                // kích thước sao cơ bản
  const starSpacing = 38;             // khoảng cách đều giữa sao
  const rankOffsetX = 42;             // offset ngang nếu cần đẩy sang phải
  const maxDisplayStars = rankInfo.isCaoThu ? 5 : Math.min(rankInfo.maxStars || 5, 5);

  // Tính điểm bắt đầu (căn giữa theo contentCenterX rồi + offset)
  const starsStartX = contentCenterX - ((maxDisplayStars - 1) * starSpacing / 2) + rankOffsetX;

  // Cập nhật drawStar để nhất quán giữa fill và stroke
  function drawStarConsistent(ctx, x, y, size, filled, color) {
    const spikes = 5;
    const outerRadius = size * (filled ? 1 : 0.9); // sao rỗng nhỏ hơn ~10%
    const innerRadius = outerRadius / 2.4;
    const step = Math.PI / spikes;
    let rot = Math.PI / 2 * 3;

    ctx.beginPath();
    ctx.moveTo(x, y - outerRadius);
    for (let i = 0; i < spikes; i++) {
      ctx.lineTo(x + Math.cos(rot) * outerRadius, y + Math.sin(rot) * outerRadius);
      rot += step;
      ctx.lineTo(x + Math.cos(rot) * innerRadius, y + Math.sin(rot) * innerRadius);
      rot += step;
    }
    ctx.closePath();

    if (filled) {
      // ⭐ Sao đầy (có shadow, màu đậm)
      ctx.save();
      ctx.fillStyle = color;
      ctx.shadowColor = color;
      ctx.shadowBlur = 6;
      ctx.fill();
      ctx.restore();
    } else {
      // ☆ Sao rỗng (outline mảnh, không bóng)
      ctx.save();
      ctx.strokeStyle = color;
      ctx.lineWidth = Math.max(1, size * 0.07); // viền nhỏ để không phình
      ctx.shadowColor = "transparent";
      ctx.shadowBlur = 0;
      ctx.stroke();
      ctx.restore();
    }
  }


  // Vẽ dãy sao (đều, cùng tâm Y)
  for (let i = 0; i < maxDisplayStars; i++) {
    const starX = starsStartX + i * starSpacing;
    const isFilled = i < (rankInfo.stars || 0);

    // Nếu cần sao rỗng hiển thị khác (ví dụ dùng màu khác), truyền màu tương ứng
    const color = rankInfo.color;
    // Vẽ shadow/đậm cho sao filled, giữ sao rỗng mỏng hơn nhưng cùng tâm
    if (isFilled) {
      // slightly stronger drop shadow for filled ones
      ctx.save();
      ctx.shadowColor = rankInfo.color;
      ctx.shadowBlur = 8;
      ctx.globalAlpha = 1.0;
      drawStarConsistent(ctx, starX, starsY, starSize, true, color);
      ctx.restore();
    } else {
      // stroke only, no random offset, no alpha changes
      ctx.save();
      ctx.globalAlpha = 1.0;
      drawStarConsistent(ctx, starX, starsY, starSize, false, color);
      ctx.restore();
    }
  }

  // Divider line trước progress
  contentY += 60;
  ctx.save();
  ctx.strokeStyle = "rgba(255, 215, 0, 0.2)";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(infoStartX, contentY);
  ctx.lineTo(infoEndX, contentY);
  ctx.stroke();
  ctx.restore();

  // Tiến độ với gradient và shadow (căn giữa toàn bộ card)
  contentY += 20;
  ctx.save();
  ctx.font = `22px ${FONT_MAIN}`;
  let progressText;
  if (rankInfo.messagesForNextStar > 0) {
    progressText = `📈 Còn ${rankInfo.messagesForNextStar} tin nhắn nữa để lên bậc`;
  } else {
    progressText = `🎉 Bạn đã đạt tối đa rank này!`;
  }
  const progressTextWidth = ctx.measureText(progressText).width;
  const progressGradient = ctx.createLinearGradient(width / 2 - progressTextWidth / 2 - 50, contentY - 20, width / 2 + progressTextWidth / 2 + 50, contentY - 20);
  progressGradient.addColorStop(0, "#FFD700");
  progressGradient.addColorStop(1, "#FFA500");
  ctx.fillStyle = progressGradient;
  ctx.textAlign = "center";
  ctx.shadowColor = "rgba(236, 217, 113, 1)";
  ctx.shadowBlur = 8;
  ctx.shadowOffsetX = 1;
  ctx.shadowOffsetY = 1;
  ctx.fillText(progressText, width / 2 + 110, contentY);
  ctx.restore();

  // Xuất ảnh
  const outputPath = path.join(tempDir, `personal_rank_${randomIDTemp()}.png`);
  const out = fs.createWriteStream(outputPath);
  const stream = canvas.createPNGStream();
  stream.pipe(out);

  return new Promise((resolve, reject) => {
    out.on("finish", () => resolve(outputPath));
    out.on("error", reject);
  });
}

export async function createPersonalRankCardTotal(user, rankStar) {
  // Tính toán rank
  const normalizedCount = Math.floor((user.messageCount || 0) / 1000);
  const rankInfo = calculateRank(normalizedCount, rankStar);

  // Kích thước card
  const width = 750;
  const height = 370;

  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext("2d");

  // Vẽ background gradient
  const gradient = ctx.createLinearGradient(0, 0, width, height);
  gradient.addColorStop(0, "#1a1a2e");
  gradient.addColorStop(0.5, "#16213e");
  gradient.addColorStop(1, "#0f3460");
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, width, height);

  // Vẽ hiệu ứng particles
  cv.drawAnimatedBackground(ctx, width, height);

  // Viền card với glow effect
  ctx.save();
  ctx.shadowColor = "rgba(255, 215, 0, 0.5)";
  ctx.shadowBlur = 15;
  ctx.strokeStyle = "rgba(255, 215, 0, 0.6)";
  ctx.lineWidth = 3;
  cv.roundRect(ctx, 15, 15, width - 30, height - 30, 25, false, true);
  ctx.restore();

  // Avatar bên trái - căn cân bằng
  const avatarSize = 150;
  const leftMargin = 80;
  const rightMargin = 80;
  const avatarX = leftMargin;
  const avatarY = height / 2 - avatarSize / 2;

  try {
    if (user.avatar && cv.isValidUrl(user.avatar)) {
      const avatar = await loadImage(user.avatar);
      
      // Vẽ shadow cho avatar
      ctx.save();
      ctx.shadowColor = "rgba(0, 0, 0, 0.5)";
      ctx.shadowBlur = 20;
      ctx.shadowOffsetX = 0;
      ctx.shadowOffsetY = 5;
      ctx.beginPath();
      ctx.arc(avatarX + avatarSize / 2, avatarY + avatarSize / 2, avatarSize / 2, 0, Math.PI * 2);
      ctx.fillStyle = "rgba(0, 0, 0, 0.3)";
      ctx.fill();
      ctx.restore();

      // Vẽ avatar
      ctx.save();
      ctx.beginPath();
      ctx.arc(avatarX + avatarSize / 2, avatarY + avatarSize / 2, avatarSize / 2, 0, Math.PI * 2);
      ctx.closePath();
      ctx.clip();
      ctx.drawImage(avatar, avatarX, avatarY, avatarSize, avatarSize);
      ctx.restore();

      // Viền gradient đẹp quanh avatar
      ctx.save();
      ctx.shadowColor = rankInfo.color;
      ctx.shadowBlur = 15;
      ctx.beginPath();
      ctx.arc(avatarX + avatarSize / 2, avatarY + avatarSize / 2, avatarSize / 2 + 4, 0, Math.PI * 2);
      const avatarGradient = ctx.createLinearGradient(avatarX, avatarY, avatarX + avatarSize, avatarY + avatarSize);
      avatarGradient.addColorStop(0, "#FFD700");
      avatarGradient.addColorStop(0.5, rankInfo.color);
      avatarGradient.addColorStop(1, "#FFD700");
      ctx.strokeStyle = avatarGradient;
      ctx.lineWidth = 5;
      ctx.stroke();
      ctx.restore();
    }
  } catch {
    ctx.save();
    ctx.beginPath();
    ctx.arc(avatarX + avatarSize / 2, avatarY + avatarSize / 2, avatarSize / 2, 0, Math.PI * 2);
    ctx.fillStyle = "#4A5568";
    ctx.fill();
    ctx.strokeStyle = "#FFD700";
    ctx.lineWidth = 5;
    ctx.stroke();
    ctx.restore();
  }

  // ==== Thông tin bên phải (căn giữa trong phần còn lại) ====
  const infoStartX = avatarX + avatarSize + 50;
  const infoEndX = width - rightMargin;
  const contentCenterX = (infoStartX + infoEndX) / 2;
  let contentY = height / 2 - 140;

  // Tiêu đề với gradient (căn giữa toàn bộ card)
  ctx.save();
  ctx.font = `bold 26px ${FONT_MAIN}`;
  ctx.fillStyle = cv.getRandomGradient(ctx, width);
  ctx.textAlign = "center";
  ctx.fillText("Thành Tích Tương Tác Của Bạn Từ Trước Tới Nay", width / 2, contentY + 10);
  ctx.restore();

  // Divider line
  contentY += 10;
  ctx.save();
  ctx.strokeStyle = "rgba(255, 255, 255, 0.1)";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(infoStartX, contentY);
  ctx.lineTo(infoEndX, contentY);
  ctx.stroke();
  ctx.restore();

  // Tên người dùng với shadow (căn giữa)
  contentY += 65;
  ctx.save();
  ctx.shadowColor = "rgba(0, 0, 0, 0.5)";
  ctx.shadowBlur = 5;
  ctx.shadowOffsetX = 2;
  ctx.shadowOffsetY = 2;
  ctx.font = `bold 42px ${FONT_MAIN}`;
  ctx.fillStyle = "#FFFFFF";
  ctx.textAlign = "center";
  ctx.fillText(user.name || "Người dùng", contentCenterX, contentY);
  ctx.restore();

  // Số tin nhắn (căn giữa)
  contentY += 45;
  ctx.save();
  ctx.font = `26px ${FONT_MAIN}`;
  ctx.fillStyle = "#CBD5E1";
  ctx.textAlign = "center";
  ctx.fillText(`💬 ${user.messageCount || 0} tin nhắn tổng`, contentCenterX, contentY);
  ctx.restore();
  contentY += 70;
  // Rank icon + tên rank (căn giữa chính xác)
  const rankIconSize = 70;
  
  // Tính toán để căn giữa cả icon và text
  ctx.save();
  ctx.font = `bold 34px ${FONT_MAIN}`;
  const rankText = rankInfo.displayName;
  const rankTextWidth = ctx.measureText(rankText).width;
  const rankIconSpacing = 15;
  const rankTotalWidth = rankIconSize + rankIconSpacing + rankTextWidth;
  const rankStartX = contentCenterX - rankTotalWidth / 2;
  const rankIconX = rankStartX;
  const rankIconY = contentY - rankIconSize / 2;
  ctx.restore();

  try {
    if (rankInfo.img && fs.existsSync(rankInfo.img)) {
      const ext = path.extname(rankInfo.img).toLowerCase();
      let rankImg;
      if (ext === ".webp") {
        const pngBuffer = await sharp(rankInfo.img)
          .png()
          .resize(rankIconSize, rankIconSize, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } })
          .toBuffer();
        rankImg = await loadImage(pngBuffer);
      } else {
        rankImg = await loadImage(rankInfo.img);
      }
      // Vẽ glow effect cho rank icon
      ctx.save();
      ctx.shadowColor = rankInfo.color;
      ctx.shadowBlur = 20;
      ctx.drawImage(rankImg, rankIconX, rankIconY, rankIconSize, rankIconSize);
      ctx.restore();
    }
  } catch {
    ctx.save();
    ctx.shadowColor = rankInfo.color;
    ctx.shadowBlur = 15;
    ctx.font = `60px Arial`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    const rankEmojis = {
      dong: "🥉",
      bac: "🥈",
      vang: "🥇",
      "bach-kim": "💎",
      "kim-cuong": "💠",
      "tinh-anh": "⭐",
      "cao-thu": "👑",
    };
    const emoji = rankEmojis[rankInfo.rankKey] || "🏆";
    ctx.fillText(emoji, rankIconX + rankIconSize / 2, rankIconY + rankIconSize / 2);
    ctx.restore();
  }

  // 📍 Căn lại vị trí tên rank — đẩy lên cao nhẹ cho thoáng
  const rankTextY = contentY - 27; // ↑ Dịch cao hơn một chút (từ -27 → -35)

  ctx.save();
  ctx.shadowColor = "rgba(0, 0, 0, 0.5)";
  ctx.shadowBlur = 5;
  ctx.shadowOffsetX = 2;
  ctx.shadowOffsetY = 2;
  ctx.font = `bold 34px ${FONT_MAIN}`;
  ctx.fillStyle = rankInfo.color;
  ctx.textAlign = "left";
  ctx.textBaseline = "middle";
  ctx.fillText(rankText, rankStartX + rankIconSize + rankIconSpacing, rankTextY);
  ctx.restore();

  // ===== chuẩn: dãy sao đều, thẳng hàng và cân bằng giữa filled & stroke =====
  const starsY = contentY + 20;       // vị trí dọc cố định (không random)
  const starSize = 17;                // kích thước sao cơ bản
  const starSpacing = 38;             // khoảng cách đều giữa sao
  const rankOffsetX = 42;             // offset ngang nếu cần đẩy sang phải
  const maxDisplayStars = rankInfo.isCaoThu ? 5 : Math.min(rankInfo.maxStars || 5, 5);

  // Tính điểm bắt đầu (căn giữa theo contentCenterX rồi + offset)
  const starsStartX = contentCenterX - ((maxDisplayStars - 1) * starSpacing / 2) + rankOffsetX;

  // Cập nhật drawStar để nhất quán giữa fill và stroke
  function drawStarConsistent(ctx, x, y, size, filled, color) {
    const spikes = 5;
    const outerRadius = size * (filled ? 1 : 0.9); // sao rỗng nhỏ hơn ~10%
    const innerRadius = outerRadius / 2.4;
    const step = Math.PI / spikes;
    let rot = Math.PI / 2 * 3;

    ctx.beginPath();
    ctx.moveTo(x, y - outerRadius);
    for (let i = 0; i < spikes; i++) {
      ctx.lineTo(x + Math.cos(rot) * outerRadius, y + Math.sin(rot) * outerRadius);
      rot += step;
      ctx.lineTo(x + Math.cos(rot) * innerRadius, y + Math.sin(rot) * innerRadius);
      rot += step;
    }
    ctx.closePath();

    if (filled) {
      // ⭐ Sao đầy (có shadow, màu đậm)
      ctx.save();
      ctx.fillStyle = color;
      ctx.shadowColor = color;
      ctx.shadowBlur = 6;
      ctx.fill();
      ctx.restore();
    } else {
      // ☆ Sao rỗng (outline mảnh, không bóng)
      ctx.save();
      ctx.strokeStyle = color;
      ctx.lineWidth = Math.max(1, size * 0.07); // viền nhỏ để không phình
      ctx.shadowColor = "transparent";
      ctx.shadowBlur = 0;
      ctx.stroke();
      ctx.restore();
    }
  }

  // Vẽ dãy sao (đều, cùng tâm Y)
  for (let i = 0; i < maxDisplayStars; i++) {
    const starX = starsStartX + i * starSpacing;
    const isFilled = i < (rankInfo.stars || 0);

    // Nếu cần sao rỗng hiển thị khác (ví dụ dùng màu khác), truyền màu tương ứng
    const color = rankInfo.color;
    // Vẽ shadow/đậm cho sao filled, giữ sao rỗng mỏng hơn nhưng cùng tâm
    if (isFilled) {
      // slightly stronger drop shadow for filled ones
      ctx.save();
      ctx.shadowColor = rankInfo.color;
      ctx.shadowBlur = 8;
      ctx.globalAlpha = 1.0;
      drawStarConsistent(ctx, starX, starsY, starSize, true, color);
      ctx.restore();
    } else {
      // stroke only, no random offset, no alpha changes
      ctx.save();
      ctx.globalAlpha = 1.0;
      drawStarConsistent(ctx, starX, starsY, starSize, false, color);
      ctx.restore();
    }
  }

  // Divider line trước progress
  contentY += 60;
  ctx.save();
  ctx.strokeStyle = "rgba(255, 215, 0, 0.2)";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(infoStartX, contentY);
  ctx.lineTo(infoEndX, contentY);
  ctx.stroke();
  ctx.restore();

  // Tiến độ với gradient và shadow (căn giữa toàn bộ card)
  contentY += 20;
  ctx.save();
  ctx.font = `22px ${FONT_MAIN}`;

  const msgCount = user.messageCount || 0;
  const mod = msgCount % 1000;
  let remainingMessages = 1000 - mod;

  // Nếu đã chẵn nghìn (vừa đủ sao mới hoặc đạt max rank)
  if (mod === 0 && msgCount > 0) remainingMessages = 0;

  const nf = new Intl.NumberFormat("vi-VN");
  let progressText;

  if (remainingMessages > 0) {
    progressText = `📈 Còn ${nf.format(remainingMessages)} tin nhắn nữa để lên bậc`;
  } else {
    progressText = `🎉 Bạn đã đạt tối đa bậc/level hiện tại!`;
  }
  const progressTextWidth = ctx.measureText(progressText).width;
  const progressGradient = ctx.createLinearGradient(width / 2 - progressTextWidth / 2 - 50, contentY - 20, width / 2 + progressTextWidth / 2 + 50, contentY - 20);
  progressGradient.addColorStop(0, "#FFD700");
  progressGradient.addColorStop(1, "#FFA500");
  ctx.fillStyle = progressGradient;
  ctx.textAlign = "center";
  ctx.shadowColor = "rgba(236, 217, 113, 1)";
  ctx.shadowBlur = 8;
  ctx.shadowOffsetX = 1;
  ctx.shadowOffsetY = 1;
  ctx.fillText(progressText, width / 2 + 110, contentY);
  ctx.restore();

  // Xuất ảnh
  const outputPath = path.join(tempDir, `personal_rank_${randomIDTemp()}.png`);
  const out = fs.createWriteStream(outputPath);
  const stream = canvas.createPNGStream();
  stream.pipe(out);

  return new Promise((resolve, reject) => {
    out.on("finish", () => resolve(outputPath));
    out.on("error", reject);
  });
}
