import { createCanvas, loadImage } from "canvas";
import fs from "fs";
import path from "path";
import * as cs from "./index.js";
import { handleCheckLinkFromImageLocal } from "../local-upload-cache.js";
import { FONT_MAIN, getFontCanvas } from "../format-util.js";

export const linkBackgroundDefault = path.resolve("./assets/resources/images/hhhbot.png");
export const linkBackgroundDefaultZalo = "https://files.catbox.moe/hiygtb.png";

const CANVAS_CONFIG = {
  default: { width: 1200, height: 400 },
  updateGroupO: { width: 1200, height: 400 }
};
const IMAGE_TYPES = {
  WELCOME: 0,
  GOODBYE: 1,
  BLOCKED: 2,
  ADD_MEMBER: 3,
  REMOVE_MEMBER: 4
};
const GRADIENT_PALETTES = {
  [IMAGE_TYPES.WELCOME]: [
    "#00f5ff", "#00d9ff", "#00bfff", "#00a8ff", "#0099ff",
    "#00ffcc", "#00ffaa", "#00ff88", "#1aff8c", "#33ff99"
  ],
  [IMAGE_TYPES.GOODBYE]: [
    "#e0e0e0", "#f0f0f0", "#fafafa", "#ffffff", "#f5f5f5",
    "#e8e8e8", "#dcdcdc", "#d0d0d0"
  ],
  [IMAGE_TYPES.BLOCKED]: [
    "#ff1744", "#ff3d00", "#ff6f00", "#ff0000", "#ff1a1a",
    "#ff3333", "#ff4444", "#cc0000"
  ],
  [IMAGE_TYPES.ADD_MEMBER]: [
    "#ffd700", "#ffed4e", "#fff44f", "#ffeb3b", "#fdd835",
    "#fbc02d", "#f9a825", "#f57f17"
  ],
  [IMAGE_TYPES.REMOVE_MEMBER]: [
    "#b0bec5", "#cfd8dc", "#eceff1", "#ffffff", "#f5f5f5",
    "#e0e0e0", "#bdbdbd", "#9e9e9e"
  ],
  default: [
    "#ff6b9d", "#c44569", "#f8b500", "#ffa502", "#ff6348",
    "#00d2d3", "#54a0ff", "#5f27cd"
  ]
};
const CARD_CONFIG = {
  padding: 40,
  borderRadius: 30,
  blur: 20,
  glassOpacity: 0.15,
  shadowBlur: 40,
  shadowOffset: { x: 0, y: 10 }
};
const AVATAR_CONFIG = {
  x: 200,
  y: 200,
  size: 180,
  borderWidth: 5,
  glowRadius: 30
};
const TEXT_CONFIG = {
  title: { fontSize: 42, fontWeight: "bold", y: 120, color: "#ffffff" },
  userName: { fontSize: 38, fontWeight: "bold", spacing: 55, color: "#ffffff" },
  subtitle: { fontSize: 28, fontWeight: "normal", spacing: 50, color: "#e0e0e0" },
  author: { fontSize: 24, fontWeight: "normal", spacing: 45, color: "#b0b0b0" },
  info: { fontSize: 18, fontWeight: "normal", spacing: 60, color: "#a0a0a0" }
};
async function loadImageWithRetry(url, maxRetries = 3, delay = 500) {
  let lastError;
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const img = await loadImage(url);
      if (attempt > 1) {
        console.log(`✅ Thành công sau ${attempt} lần thử - URL: ${url}`);
      }
      return img;
    } catch (error) {
      lastError = error;
      console.warn(`🔄 Lần thử ${attempt}/${maxRetries} - URL: ${url}`);
      if (attempt < maxRetries) {
        await new Promise(resolve => setTimeout(resolve, delay));
        delay *= 1.5; 
      }
    }
  }
  console.error(`❌ Đã thử ${maxRetries} lần nhưng không thành công - URL: ${url}`);
  throw lastError;
}
export async function getLinkBackgroundDefault(userInfo) {
  try {
    if (userInfo.birth && userInfo.birth !== linkBackgroundDefaultZalo) {
      try {
        return await loadImageWithRetry(userInfo.birth);
      } catch {
        console.log('🔄 Chuyển sang dùng ảnh nền mặc định');
        return await loadImageWithRetry(linkBackgroundDefault);
      }
    }
    return await loadImageWithRetry(linkBackgroundDefault);
  } catch (error) {
    console.error('❌ Không thể tải cả ảnh nền mặc định:', error);
    return null;
  }
}
export async function getImageBackgroundDefault(userInfo, linkDefault) {
  let backgroundImage;
  try {
    if (userInfo && userInfo.cover && userInfo.cover !== linkBackgroundDefaultZalo) {
      backgroundImage = await loadImage(userInfo.cover);
    } else {
      const linkBackgroundDefault = linkDefault || (await handleCheckLinkFromImageLocal("dqtbot.jpg")).fileUrl;
      backgroundImage = await loadImage(linkBackgroundDefault);
    }
  } catch (error) {
    const linkBackgroundDefault = await handleCheckLinkFromImageLocal("dqtbot.jpg");
    backgroundImage = await loadImage(linkBackgroundDefault.fileUrl);
  }
  return backgroundImage;
}
function getImageType(fileName) {
  if (fileName.includes("welcome") || fileName.includes("update_group_on")) {
    return IMAGE_TYPES.WELCOME;
  } else if (fileName.includes("goodbye") || fileName.includes("update_group_off")) {
    return IMAGE_TYPES.GOODBYE;
  } else if (["blocked", "kicked", "kicked_spam"].some((keyword) => fileName.includes(keyword))) {
    return IMAGE_TYPES.BLOCKED;
  } else if (fileName.includes("update_group_add")) {
    return IMAGE_TYPES.ADD_MEMBER;
  } else if (fileName.includes("update_group_remove")) {
    return IMAGE_TYPES.REMOVE_MEMBER;
  }
  return -1;
}
function getGradientColors(typeImage) {
  const palette = GRADIENT_PALETTES[typeImage] || GRADIENT_PALETTES.default;
  return [...palette].sort(() => Math.random() - 0.5);
}
async function drawBackground(ctx, width, height, userInfo) {
  try {
    const bg = await getLinkBackgroundDefault(userInfo);
    if (bg) {
      const scale = Math.max(width / bg.width, height / bg.height);
      const scaledWidth = bg.width * scale;
      const scaledHeight = bg.height * scale;
      const x = (width - scaledWidth) / 2;
      const y = (height - scaledHeight) / 2;
      ctx.drawImage(bg, x, y, scaledWidth, scaledHeight);
      const overlay = ctx.createLinearGradient(0, 0, width, height);
      overlay.addColorStop(0, "rgba(0,0,0,0.7)");
      overlay.addColorStop(0.5, "rgba(0,0,0,0.8)");
      overlay.addColorStop(1, "rgba(0,0,0,0.85)");
      ctx.fillStyle = overlay;
      ctx.fillRect(0, 0, width, height);
      const vignette = ctx.createRadialGradient(
        width / 2, height / 2, 0,
        width / 2, height / 2, Math.max(width, height) * 0.9
      );
      vignette.addColorStop(0, "rgba(0,0,0,0)");
      vignette.addColorStop(0.7, "rgba(0,0,0,0.3)");
      vignette.addColorStop(1, "rgba(0,0,0,0.6)");
      ctx.fillStyle = vignette;
      ctx.fillRect(0, 0, width, height);
    } else {
      const gradient = ctx.createLinearGradient(0, 0, width, height);
      gradient.addColorStop(0, "#0a0a0a");
      gradient.addColorStop(0.5, "#1a1a2e");
      gradient.addColorStop(1, "#16213e");
      ctx.fillStyle = gradient;
      ctx.fillRect(0, 0, width, height);
    }
  } catch (e) {
    console.error("Lỗi background:", e);
    const gradient = ctx.createLinearGradient(0, 0, width, height);
    gradient.addColorStop(0, "#0a0a0a");
    gradient.addColorStop(0.5, "#1a1a2e");
    gradient.addColorStop(1, "#16213e");
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, width, height);
  }
}
function drawDecorativeShapes(ctx, width, height, gradientColors) {
  ctx.save();
  const orbCount = 3;
  for (let i = 0; i < orbCount; i++) {
    const x = width * (0.2 + i * 0.3);
    const y = height * (0.1 + (i % 2) * 0.8);
    const radius = 60 + i * 20;
    const gradient = ctx.createRadialGradient(x, y, 0, x, y, radius);
    const color = gradientColors[i % gradientColors.length];
    gradient.addColorStop(0, color + "40");
    gradient.addColorStop(1, color + "00");
    ctx.fillStyle = gradient;
    ctx.beginPath();
    ctx.arc(x, y, radius, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}
function drawGlassCard(ctx, width, height, gradientColors) {
  const { padding, borderRadius, glassOpacity, shadowBlur, shadowOffset } = CARD_CONFIG;
  const cardX = padding;
  const cardY = padding;
  const cardWidth = width - padding * 2;
  const cardHeight = height - padding * 2;
  ctx.save();
  ctx.shadowColor = "rgba(0,0,0,0.5)";
  ctx.shadowBlur = shadowBlur;
  ctx.shadowOffsetX = shadowOffset.x;
  ctx.shadowOffsetY = shadowOffset.y;
  const cardGradient = ctx.createLinearGradient(cardX, cardY, cardX + cardWidth, cardY + cardHeight);
  cardGradient.addColorStop(0, `rgba(255,255,255,${glassOpacity})`);
  cardGradient.addColorStop(0.5, `rgba(255,255,255,${glassOpacity * 0.8})`);
  cardGradient.addColorStop(1, `rgba(255,255,255,${glassOpacity * 0.6})`);
  ctx.fillStyle = cardGradient;
  roundRect(ctx, cardX, cardY, cardWidth, cardHeight, borderRadius);
  ctx.fill();
  ctx.restore();
  ctx.save();
  const borderGradient = ctx.createLinearGradient(cardX, cardY, cardX + cardWidth, cardY + cardHeight);
  gradientColors.slice(0, 3).forEach((color, index) => {
    borderGradient.addColorStop(index / 2, color + "60");
  });
  ctx.strokeStyle = borderGradient;
  ctx.lineWidth = 2;
  roundRect(ctx, cardX, cardY, cardWidth, cardHeight, borderRadius);
  ctx.stroke();
  ctx.restore();
}
function roundRect(ctx, x, y, width, height, radius) {
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.lineTo(x + width - radius, y);
  ctx.quadraticCurveTo(x + width, y, x + width, y + radius);
  ctx.lineTo(x + width, y + height - radius);
  ctx.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
  ctx.lineTo(x + radius, y + height);
  ctx.quadraticCurveTo(x, y + height, x, y + height - radius);
  ctx.lineTo(x, y + radius);
  ctx.quadraticCurveTo(x, y, x + radius, y);
  ctx.closePath();
}
function drawBlockedIcon(ctx, x, y, size = 30) {
  ctx.save();
  ctx.fillStyle = "#ff1744";
  ctx.beginPath();
  ctx.arc(x, y, size / 2, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = "#ffffff";
  ctx.lineWidth = 3;
  ctx.lineCap = "round";
  ctx.beginPath();
  const offset = size * 0.25;
  ctx.moveTo(x - size / 2 + offset, y - size / 2 + offset);
  ctx.lineTo(x + size / 2 - offset, y + size / 2 - offset);
  ctx.stroke();
  ctx.restore();
}
async function drawAvatar(ctx, userInfo, gradientColors, showBlockedIcon = false) {
  const { x, y, size, borderWidth, glowRadius } = AVATAR_CONFIG;
  const userAvatarUrl = userInfo.avatar;
  if (!userAvatarUrl || !cs.isValidUrl(userAvatarUrl)) {
    console.error("URL avatar không hợp lệ:", userAvatarUrl);
    return;
  }
    try {
      const avatar = await loadImage(userAvatarUrl);
    ctx.save();
    const glowGradient = ctx.createRadialGradient(x, y, size / 2, x, y, size / 2 + glowRadius);
    gradientColors.slice(0, 3).forEach((color, index) => {
      glowGradient.addColorStop(index / 2, color + "80");
      glowGradient.addColorStop(1, color + "00");
    });
    ctx.fillStyle = glowGradient;
    ctx.beginPath();
    ctx.arc(x, y, size / 2 + glowRadius, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
    ctx.save();
    const borderGradient = ctx.createLinearGradient(
      x - size / 2 - borderWidth,
      y - size / 2 - borderWidth,
      x + size / 2 + borderWidth,
      y + size / 2 + borderWidth
    );
    gradientColors.forEach((color, index) => {
      borderGradient.addColorStop(index / (gradientColors.length - 1), color);
    });
    ctx.shadowColor = gradientColors[0] + "80";
    ctx.shadowBlur = 20;
    ctx.shadowOffsetX = 0;
    ctx.shadowOffsetY = 0;
      ctx.beginPath();
    ctx.arc(x, y, size / 2 + borderWidth, 0, Math.PI * 2);
    ctx.fillStyle = borderGradient;
      ctx.fill();
    ctx.restore();
    ctx.save();
      ctx.beginPath();
    ctx.arc(x, y, size / 2, 0, Math.PI * 2);
      ctx.clip();
    ctx.drawImage(avatar, x - size / 2, y - size / 2, size, size);
      ctx.restore();
    if (showBlockedIcon) {
      const iconX = x + size / 2 - 20;
      const iconY = y + size / 2 - 20;
      drawBlockedIcon(ctx, iconX, iconY, 30);
    }
    ctx.save();
    const separatorX = x + size / 2 + borderWidth + 30;
    const separatorY1 = y - size / 2 + 30;
    const separatorY2 = y + size / 2 - 30;
    ctx.shadowColor = "rgba(255,255,255,0.8)";
    ctx.shadowBlur = 10;
      ctx.strokeStyle = "white";
      ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(separatorX, separatorY1);
    ctx.lineTo(separatorX, separatorY2);
      ctx.stroke();
    ctx.restore();
    } catch (error) {
      console.error("Lỗi load avatar:", error);
    }
}
function drawText(ctx, text, x, y, config, gradientColors, isGradient = true, align = "center", uppercase = false) {
  if (!text) return;
  ctx.save();
  const displayText = uppercase ? text.toUpperCase() : text;
  if (isGradient) {
    const colors = gradientColors.slice(0, 4);
    const gradient = ctx.createLinearGradient(x - 300, y - 20, x + 300, y + 20);
    colors.forEach((color, index) => {
      gradient.addColorStop(index / (colors.length - 1), color);
    });
    ctx.fillStyle = gradient;
  } else {
    ctx.fillStyle = config.color || "#ffffff";
  }
  ctx.shadowColor = "rgba(0,0,0,0.8)";
  ctx.shadowBlur = 15;
  ctx.shadowOffsetX = 3;
  ctx.shadowOffsetY = 3;
  ctx.textAlign = align;
  ctx.textBaseline = "middle";
  const fontFamily = getFontCanvas(displayText);
  ctx.font = `${config.fontWeight} ${config.fontSize}px ${fontFamily}`;
  ctx.fillText(displayText, x, y);
  ctx.restore();
}
function formatDateTime() {
  const now = new Date();
  const day = String(now.getDate()).padStart(2, '0');
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const year = now.getFullYear();
  const hours = String(now.getHours()).padStart(2, '0');
  const minutes = String(now.getMinutes()).padStart(2, '0');
  return `${day}/${month}/${year} ${hours}:${minutes}`;
}
function drawCalendarIcon(ctx, x, y, size = 24) {
  ctx.save();
  const iconGradient = ctx.createLinearGradient(x, y - size, x, y + size);
  iconGradient.addColorStop(0, "#d4a574");
  iconGradient.addColorStop(0.5, "#c49b5f");
  iconGradient.addColorStop(1, "#b8864a");
  ctx.fillStyle = iconGradient;
  roundRect(ctx, x - size / 2, y - size / 2 + 2, size, size * 0.85, 3);
  ctx.fill();
  ctx.fillStyle = "#8b6f47";
  roundRect(ctx, x - size / 2, y - size / 2, size, size * 0.25, 3);
  ctx.fill();
  ctx.fillStyle = "#f4d03f";
  ctx.beginPath();
  ctx.arc(x, y - size / 2 + size * 0.15, size * 0.15, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = "#8b6f47";
  ctx.lineWidth = 1.5;
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(x, y - size / 2 + size * 0.15);
  ctx.lineTo(x, y - size / 2 + size * 0.15 - size * 0.08);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(x, y - size / 2 + size * 0.15);
  ctx.lineTo(x + size * 0.06, y - size / 2 + size * 0.15);
  ctx.stroke();
  ctx.strokeStyle = "#8b6f47";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(x - size * 0.15, y - size / 2 + size * 0.4);
  ctx.lineTo(x + size * 0.15, y - size / 2 + size * 0.4);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(x - size * 0.15, y - size / 2 + size * 0.55);
  ctx.lineTo(x + size * 0.15, y - size / 2 + size * 0.55);
  ctx.stroke();
  ctx.restore();
}
function drawKeyIcon(ctx, x, y, size = 20) {
  ctx.save();
  ctx.fillStyle = "#4a5568";
  ctx.strokeStyle = "#4a5568";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(x - size * 0.15, y, size * 0.25, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(x - size * 0.15, y + size * 0.25);
  ctx.lineTo(x - size * 0.15, y + size * 0.5);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(x - size * 0.15, y + size * 0.35);
  ctx.lineTo(x + size * 0.1, y + size * 0.35);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(x - size * 0.15, y + size * 0.45);
  ctx.lineTo(x + size * 0.15, y + size * 0.45);
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(x + size * 0.15, y + size * 0.5, size * 0.1, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}
async function createImage(userInfo, message, fileName) {
  const width = fileName.includes("update_group_o") 
    ? CANVAS_CONFIG.updateGroupO.width 
    : CANVAS_CONFIG.default.width;
  const height = CANVAS_CONFIG.default.height;
  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext("2d");
  const typeImage = getImageType(fileName);
  const gradientColors = getGradientColors(typeImage);
  await drawBackground(ctx, width, height, userInfo);
  drawDecorativeShapes(ctx, width, height, gradientColors);
  drawGlassCard(ctx, width, height, gradientColors);
  const showBlockedIcon = typeImage === IMAGE_TYPES.BLOCKED || fileName.includes("kicked");
  await drawAvatar(ctx, userInfo, gradientColors, showBlockedIcon);
  const textStartX = AVATAR_CONFIG.x + AVATAR_CONFIG.size / 2 + 60;
  const textEndX = width - CARD_CONFIG.padding - 20;
  const centerX = textStartX + (textEndX - textStartX) / 2;
  let currentY = TEXT_CONFIG.title.y;
  const isBlockedEvent = typeImage === IMAGE_TYPES.BLOCKED || fileName.includes("kicked");
  if (isBlockedEvent) {
    ctx.save();
    ctx.fillStyle = "#ff1744";
  ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.shadowColor = "rgba(0,0,0,0.8)";
    ctx.shadowBlur = 15;
    ctx.shadowOffsetX = 3;
    ctx.shadowOffsetY = 3;
    const fontFamily = getFontCanvas(message.title);
    ctx.font = `bold ${TEXT_CONFIG.title.fontSize}px ${fontFamily}`;
    ctx.fillText(message.title.toUpperCase(), centerX, currentY);
    ctx.restore();
  } else {
    drawText(
      ctx,
      message.title,
      centerX,
      currentY,
      TEXT_CONFIG.title,
      gradientColors,
      true,
      "center"
    );
  }
  currentY += TEXT_CONFIG.userName.spacing;
  drawText(
    ctx,
    message.userName,
    centerX,
    currentY,
    TEXT_CONFIG.userName,
    gradientColors,
    true,
    "center"
  );
  currentY += TEXT_CONFIG.subtitle.spacing;
  drawText(
    ctx,
    message.subtitle,
    centerX,
    currentY,
    TEXT_CONFIG.subtitle,
    gradientColors,
    false,
    "center"
  );
  currentY += TEXT_CONFIG.author.spacing;
  drawText(
    ctx,
    message.author,
    centerX,
    currentY,
    TEXT_CONFIG.author,
    gradientColors,
    false,
    "center"
  );
  if (message.customMessage) {
    currentY += TEXT_CONFIG.author.spacing - 10;
    drawText(
      ctx,
      message.customMessage,
      centerX,
      currentY,
      { ...TEXT_CONFIG.author, fontSize: 22, color: "#a0a0a0" },
      gradientColors,
      false,
      "center"
    );
  }
  currentY += TEXT_CONFIG.info.spacing;
  const infoY = currentY;
  const dateTime = formatDateTime();
  const executedByText = message.executedBy || "Executed by";
  const calendarIconX = centerX - 250;
  drawCalendarIcon(ctx, calendarIconX, infoY, 24);
  ctx.save();
  ctx.fillStyle = TEXT_CONFIG.info.color;
  ctx.textAlign = "left";
  ctx.textBaseline = "middle";
  ctx.font = `${TEXT_CONFIG.info.fontWeight} ${TEXT_CONFIG.info.fontSize}px ${FONT_MAIN}`;
  ctx.shadowColor = "rgba(0,0,0,0.5)";
  ctx.shadowBlur = 8;
  ctx.shadowOffsetX = 2;
  ctx.shadowOffsetY = 2;
  ctx.fillText(dateTime, calendarIconX + 20, infoY);
  ctx.restore();
  ctx.save();
  ctx.fillStyle = TEXT_CONFIG.info.color;
  ctx.textAlign = "left";
  ctx.textBaseline = "middle";
  ctx.font = `${TEXT_CONFIG.info.fontWeight} ${TEXT_CONFIG.info.fontSize}px ${FONT_MAIN}`;
  ctx.shadowColor = "rgba(0,0,0,0.5)";
  ctx.shadowBlur = 8;
  ctx.shadowOffsetX = 2;
  ctx.shadowOffsetY = 2;
  const textX = centerX + 50;
  ctx.fillText(executedByText, textX, infoY);
  ctx.restore();
  const filePath = path.resolve(`./assets/temp/${fileName}`);
  const out = fs.createWriteStream(filePath);
  const stream = canvas.createPNGStream();
  stream.pipe(out);
  return new Promise((resolve, reject) => {
    out.on("finish", () => resolve(filePath));
    out.on("error", reject);
  });
}
export async function createWelcomeImage(userInfo, groupName, groupType, userActionName, isAdmin) {
  const userName = userInfo.name || "";
  const authorText = userActionName === userName 
    ? "Tham Gia Trực Tiếp Hoặc Được Mời" 
    : `Duyệt bởi ${userActionName}`;
  return createImage(
    userInfo,
    {
      title: `${groupName}`,
      userName: `Chào mừng ${isAdmin ? "Cán Bộ " : ""}${userName}`,
      subtitle: `Đã Tham Gia ${groupType ? (groupType === 2 ? "Cộng Đồng" : "Nhóm") : "Nhóm"}`,
      author: `${authorText}`,
      executedBy: userActionName ? `Executed by ${userActionName}` : "Executed by",
    },
    `welcome_${Date.now()}.png`
  );
}
export async function createUpdateMemberGroupImage(userInfo, groupName, groupType, userActionName, typeUpdate) {
  const userName = userInfo.name || "";
  const beforeText = typeUpdate === "add" ? "Chúc Mừng" : "Rất Tiếc,";
  const afterText = typeUpdate === "add" 
    ? `Đã Được Phong Làm Phó` 
    : `Đã Bị Cắt Chức Phó`;
  const authorText = `Thực hiện bởi Trưởng ${groupType === 2 ? "Cộng Đồng" : "Nhóm"} ${userActionName}`;
  return createImage(
    userInfo,
    {
      title: `${groupName}`,
      userName: `${beforeText} ${userName}`,
      subtitle: `${afterText} ${groupType ? (groupType === 2 ? "Cộng Đồng" : "Nhóm") : "Nhóm"}`,
      author: `${authorText}`,
      executedBy: userActionName ? `Executed by ${userActionName}` : "Executed by",
    },
    `${typeUpdate === "add" ? "update_group_add" : "update_group_remove"}_${Date.now()}.png`
  );
}
export async function createUpdateSettingGroupImage(userActionInfo, setting, groupName, groupType) {
  let beforeText;
  let afterText;
  switch (setting.type) {
    case 1:
      beforeText = "" + setting.content;
      afterText = "Đã cập nhật thành: " + setting.result;
      break;
    case 2:
      beforeText = setting.content;
      afterText = "Đã được " + setting.result;
      break;
    default:
      beforeText = setting.content || "";
      afterText = setting.result || "";
  }
  const authorText = `Thực hiện bởi Quản Trị ${groupType === 2 ? "Cộng Đồng" : "Nhóm"} ${userActionInfo.zaloName}`;
  return createImage(
    userActionInfo,
    {
      title: `${groupName}`,
      userName: `${beforeText}`,
      subtitle: `${afterText}`,
      author: `${authorText}`,
      executedBy: userActionInfo.zaloName ? `Executed by ${userActionInfo.zaloName}` : "Executed by",
    },
    `${setting.value ? "update_group_on" : "update_group_off"}_${Date.now()}.png`
  );
}
export async function createGoodbyeImage(userInfo, groupName, groupType, isAdmin) {
  const userName = userInfo.name || "";
  return createImage(
    userInfo,
    {
      title: "Member Left The Group",
      userName: `${isAdmin ? "Cán Bộ " : ""}${userName}`,
      subtitle: `Vừa rời khỏi ${groupType ? (groupType === 2 ? "Cộng Đồng" : "Nhóm") : "Nhóm"}`,
      author: `${groupName}`,
      executedBy: `Executed by ${userName}`,
    },
    `goodbye_${Date.now()}.png`
  );
}
export async function createKickImage(userInfo, groupName, groupType, gender, userActionName, isAdmin) {
  const userName = userInfo.name || "";
  const genderText = gender === 0 ? "Thằng" : gender === 1 ? "Con" : "Thằng";
  const userNameText = isAdmin 
    ? `Cán Bộ ${userName}` 
    : `${genderText} Oắt Con ${userName}`;
  return createImage(
    userInfo,
    {
      title: `Kicked Out Member`,
      userName: `${userNameText}`,
      subtitle: `Đã Bị ${userActionName} Sút Khỏi ${groupType ? (groupType === 2 ? "Cộng Đồng" : "Nhóm") : "Nhóm"}`,
      author: `${groupName}`,
      executedBy: userActionName ? `Executed by ${userActionName}` : "Executed by",
    },
    `kicked_${Date.now()}.png`
  );
}
export async function createBlockImage(userInfo, groupName, groupType, gender, userActionName, isAdmin) {
  const userName = userInfo.name || "";
  const genderText = gender === 0 ? "Thằng" : gender === 1 ? "Con" : "Thằng";
  const userNameText = isAdmin 
    ? `Cán Bộ ${userName}` 
    : `${genderText} Oắt Con ${userName}`;
  return createImage(
    userInfo,
    {
      title: `Blocked Out Member`,
      userName: `${userNameText}`,
      subtitle: `Đã Bị ${userActionName} Chặn Khỏi ${groupType ? (groupType === 2 ? "Cộng Đồng" : "Nhóm") : "Nhóm"}`,
      author: `${groupName}`,
      executedBy: userActionName ? `Executed by ${userActionName}` : "Executed by",
    },
    `blocked_${Date.now()}.png`
  );
}
export async function createBlockSpamImage(userInfo, groupName, groupType, gender, userActionName) {
  const userName = userInfo.name || "";
  const genderText = gender === 0 ? "Thằng" : gender === 1 ? "Con" : "Thằng";
  return createImage(
    userInfo,
    {
      title: `Blocked Out Spam Member`,
      userName: `${genderText} Oắt Con ${userName}`,
      subtitle: `Do spam đã bị chặn khỏi ${groupType ? (groupType === 2 ? "Cộng Đồng" : "Nhóm") : "Nhóm"}`,
      author: `${groupName}`,
      executedBy: userActionName ? `Executed by ${userActionName}` : "Executed by",
    },
    `blocked_spam_${Date.now()}.png`
  );
}
export async function createBlockSpamLinkImage(userInfo, groupName, groupType, gender, userActionName) {
  const userName = userInfo.name || "";
  const genderText = gender === 0 ? "Thằng" : gender === 1 ? "Con" : "Thằng";
  return createImage(
    userInfo,
    {
      title: `Blocked Out Spam Link Member`,
      userName: `${genderText} Oắt Con ${userName}`,
      subtitle: `Do spam link đã bị chặn khỏi ${groupType ? (groupType === 2 ? "Cộng Đồng" : "Nhóm") : "Nhóm"}`,
      author: `${groupName}`,
      executedBy: userActionName ? `Executed by ${userActionName}` : "Executed by",
    },
    `blocked_spam_link_${Date.now()}.png`
  );
}
export async function createBlockSpamStickerEffect(userInfo, groupName, groupType, gender, userActionName) {
  const userName = userInfo.name || "";
  const genderText = gender === 0 ? "Thằng" : gender === 1 ? "Con" : "Thằng";
  return createImage(
    userInfo,
    {
      title: `Blocked Out Spam Sticker Effect`,
      userName: `${genderText} Oắt Con ${userName}`,
      subtitle: `Do spam sticker eff đã bị chặn khỏi ${groupType ? (groupType === 2 ? "Cộng Đồng" : "Nhóm") : "Nhóm"}`,
      author: `${groupName}`,
      executedBy: userActionName ? `Executed by ${userActionName}` : "Executed by",
    },
    `blocked_spam_stk_eff_${Date.now()}.png`
  );
}