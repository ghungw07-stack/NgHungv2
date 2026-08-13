import { createCanvas, loadImage } from "canvas";
import { Canvas as SkiaCanvas, loadImage as loadSkiaImage } from "skia-canvas";
import fs from "fs";
import path from "path";
import * as cv from "./index.js";
import { FONT_MAIN, formatCurrency } from "../format-util.js";
import { loadImageBuffer } from "../util.js";
import { getNameServer } from "../../service-dqt/chat-zalo/chat-style/chat-style.js";

export function hanldeNameUser(name, maxLength = 16) {
  const words = name.split(" ");
  let line1 = "";
  let line2 = "";

  if (name.length <= maxLength) {
    return [name, ""];
  }

  if (words.length === 1) {
    line1 = name.substring(0, maxLength);
    line2 = name.substring(maxLength);
  } else {
    for (let i = 0; i < words.length; i++) {
      if ((line1 + " " + words[i]).trim().length <= maxLength) {
        line1 += (line1 ? " " : "") + words[i];
      } else {
        line2 = words.slice(i).join(" ");
        break;
      }
    }
  }

  return [line1.trim(), line2.trim()];
}

export function handleNameLong(name, lengthLine = 16) {
  const words = name.split(" ");
  const lines = [];
  let currentLine = "";

  for (const word of words) {
    if ((currentLine + " " + word).trim().length <= lengthLine) {
      currentLine += (currentLine ? " " : "") + word;
    } else {
      if (currentLine) {
        lines.push(currentLine.trim());
      }
      currentLine = word;
    }
  }

  if (currentLine) {
    lines.push(currentLine.trim());
  }

  if (lines.length === 0) {
    lines.push(name);
  }

  return {
    lines: lines,
    totalLines: lines.length,
  };
}

async function createUserInfoImageDesignA(userInfo) {
  let bioText = userInfo.bio;
  let hasBio =
    bioText && bioText !== "Không có thông tin bio" && bioText.trim() !== "";

  let bioLines = [];
  if (hasBio) {
    bioText.split("\n").forEach((line) => {
      const linesObj = handleNameLong(line, 80);
      bioLines.push(...linesObj.lines);
    });
  }

  // Thu hẹp chiều rộng lại theo yêu cầu (ngắn hơn 1 chút)
  const width = 1400;
  const bioLineHeight = 35;
  const bioPadding = 45;
  const bioBoxHeight = hasBio
    ? bioPadding * 2 + bioLines.length * bioLineHeight + 40
    : 0;

  let yPos = 80;
  yPos += 40;
  yPos += 60;
  const gridY = yPos - 10;
  const boxHeight = 110;
  const gapY = 20;

  const bioBoxY = gridY + 4 * (boxHeight + gapY) + 30;
  const totalHeight = bioBoxY + bioBoxHeight + (hasBio ? 60 : 0);

  const canvas = createCanvas(width, totalHeight);
  const ctx = canvas.getContext("2d");

  function fillRoundRect(x, y, w, h, radius) {
    ctx.beginPath();
    ctx.moveTo(x + radius, y);
    ctx.lineTo(x + w - radius, y);
    ctx.quadraticCurveTo(x + w, y, x + w, y + radius);
    ctx.lineTo(x + w, y + h - radius);
    ctx.quadraticCurveTo(x + w, y + h, x + w - radius, y + h);
    ctx.lineTo(x + radius, y + h);
    ctx.quadraticCurveTo(x, y + h, x, y + h - radius);
    ctx.lineTo(x, y + radius);
    ctx.quadraticCurveTo(x, y, x + radius, y);
    ctx.closePath();
    ctx.fill();
  }

  function strokeRoundRect(x, y, w, h, radius) {
    ctx.beginPath();
    ctx.moveTo(x + radius, y);
    ctx.arcTo(x + w, y, x + w, y + h, radius);
    ctx.arcTo(x + w, y + h, x, y + h, radius);
    ctx.arcTo(x, y + h, x, y, radius);
    ctx.arcTo(x, y, x + w, y, radius);
    ctx.stroke();
  }

  // 1. Nền - Dùng cover làm background
  try {
    if (userInfo.cover && cv.isValidUrl(userInfo.cover)) {
      const coverImg = await loadImage(userInfo.cover);
      ctx.drawImage(coverImg, 0, 0, width, totalHeight);
      // Overlay dark để làm mờ cover
      ctx.fillStyle = "rgba(0, 0, 0, 0.7)";
      ctx.fillRect(0, 0, width, totalHeight);
    } else {
      throw new Error("No cover image");
    }
  } catch (e) {
    // Nếu không có cover, dùng gradient mặc định
    const bgGrad = ctx.createRadialGradient(
      width / 2,
      0,
      0,
      width / 2,
      totalHeight / 2,
      width,
    );
    bgGrad.addColorStop(0, "#232336");
    bgGrad.addColorStop(1, "#111118");
    ctx.fillStyle = bgGrad;
    ctx.fillRect(0, 0, width, totalHeight);
  }

  // 2. Header - Gradient effect
  let topY = 90;
  ctx.textAlign = "center";
  ctx.font = "bold 60px Tahoma";
  const titleText = userInfo.title || "Thông Tin Người Dùng";

  if (titleText === "Thông Tin Người Dùng") {
    // Gradient từ cyan sang pink cho toàn bộ text
    const titleGrad = ctx.createLinearGradient(
      width / 2 - 250,
      topY,
      width / 2 + 250,
      topY,
    );
    titleGrad.addColorStop(0, "#00e0ff");
    titleGrad.addColorStop(0.5, "#ff00ff");
    titleGrad.addColorStop(1, "#ff007f");
    ctx.fillStyle = titleGrad;
    ctx.fillText("Thông Tin Người Dùng", width / 2, topY);
  } else {
    const titleGrad = ctx.createLinearGradient(
      width / 2 - 200,
      0,
      width / 2 + 200,
      0,
    );
    titleGrad.addColorStop(0, "#00e0ff");
    titleGrad.addColorStop(1, "#ff007f");
    ctx.fillStyle = titleGrad;
    ctx.fillText(titleText, width / 2, topY);
  }

  topY += 40;
  const divGrad = ctx.createLinearGradient(0, topY, width, topY);
  divGrad.addColorStop(0, "rgba(0, 224, 255, 0)");
  divGrad.addColorStop(0.3, "rgba(0, 224, 255, 0.8)");
  divGrad.addColorStop(0.7, "rgba(255, 0, 127, 0.8)");
  divGrad.addColorStop(1, "rgba(255, 0, 127, 0)");
  ctx.fillStyle = divGrad;
  ctx.fillRect(150, topY, width - 300, 4);

  // 3. Avatar
  const avatarSize = 250;
  const avatarX = 150;
  const avatarY = topY + 120;
  const cx = avatarX + avatarSize / 2;
  const cy = avatarY + avatarSize / 2;

  let avatarImg = null;
  try {
    if (cv.isValidUrl(userInfo.avatarFull || userInfo.avatar)) {
      avatarImg = await loadImage(userInfo.avatarFull || userInfo.avatar);
    }
  } catch (e) {}

  const avBorderGrad = ctx.createLinearGradient(
    avatarX,
    avatarY,
    avatarX + avatarSize,
    avatarY + avatarSize,
  );
  avBorderGrad.addColorStop(0, "#00e0ff");
  avBorderGrad.addColorStop(1, "#ff007f");
  ctx.fillStyle = avBorderGrad;

  ctx.shadowColor = "rgba(0,0,0,0.6)";
  ctx.shadowBlur = 40;
  ctx.shadowOffsetY = 15;
  ctx.beginPath();
  ctx.arc(cx, cy, avatarSize / 2 + 8, 0, Math.PI * 2);
  ctx.fill();

  ctx.shadowColor = "transparent";
  ctx.shadowBlur = 0;
  ctx.shadowOffsetY = 0;

  ctx.fillStyle = "#1a1a24";
  ctx.beginPath();
  ctx.arc(cx, cy, avatarSize / 2 + 2, 0, Math.PI * 2);
  ctx.fill();

  if (avatarImg) {
    ctx.save();
    ctx.beginPath();
    ctx.arc(cx, cy, avatarSize / 2, 0, Math.PI * 2);
    ctx.clip();
    ctx.drawImage(avatarImg, avatarX, avatarY, avatarSize, avatarSize);
    ctx.restore();
  } else {
    ctx.fillStyle = "#333";
    ctx.beginPath();
    ctx.arc(cx, cy, avatarSize / 2, 0, Math.PI * 2);
    ctx.fill();
  }

  // Online status dot - Social media style (centered on border)
  const dotRadius = 14;
  const borderRadius = dotRadius + 5;
  const dotX = avatarX + avatarSize - 30;
  const dotY = avatarY + avatarSize - 30;

  const isOnline = userInfo.isOnline;

  // Background circle (dark border) - thành phần ngoài
  ctx.fillStyle = "#1a1a24";
  ctx.beginPath();
  ctx.arc(dotX, dotY, borderRadius, 0, Math.PI * 2);
  ctx.fill();

  // Glow effect - chỉ khi online
  if (isOnline) {
    const glowGrad = ctx.createRadialGradient(
      dotX,
      dotY,
      borderRadius,
      dotX,
      dotY,
      borderRadius * 2,
    );
    glowGrad.addColorStop(0, "rgba(87, 255, 87, 0.5)");
    glowGrad.addColorStop(0.6, "rgba(87, 255, 87, 0.15)");
    glowGrad.addColorStop(1, "rgba(87, 255, 87, 0)");
    ctx.fillStyle = glowGrad;
    ctx.beginPath();
    ctx.arc(dotX, dotY, borderRadius * 2, 0, Math.PI * 2);
    ctx.fill();
  }

  // Colored dot (chính)
  ctx.fillStyle = isOnline ? "#57ff57" : "#888";
  ctx.beginPath();
  ctx.arc(dotX, dotY, dotRadius, 0, Math.PI * 2);
  ctx.fill();

  // Inner border
  ctx.strokeStyle = isOnline ? "#2d9d2d" : "#555";
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.arc(dotX, dotY, dotRadius, 0, Math.PI * 2);
  ctx.stroke();

  let leftTextY = avatarY + avatarSize + 60;
  ctx.textAlign = "center";
  ctx.fillStyle = "#fff";
  ctx.font = "bold 40px Tahoma";
  const [nameL1, nameL2] = hanldeNameUser(userInfo.name || "Unknown", 20);
  ctx.fillText(nameL1, cx, leftTextY);
  if (nameL2) {
    leftTextY += 45;
    ctx.fillText(nameL2, cx, leftTextY);
  }

  leftTextY += 40;
  ctx.fillStyle = "#999";
  ctx.font = "22px Tahoma";
  ctx.fillText("ID: " + (userInfo.uid || "Chưa xác định"), cx, leftTextY);

  // 4. Khối Grid Bảng Thông Tin (8 Hộp)
  const isOnlineStr = userInfo.isOnline ? "Trực tuyến" : "Ngoại tuyến";
  const iconsActive = [];
  if (userInfo.isActive) iconsActive.push("Mobile");
  if (userInfo.isActivePC) iconsActive.push("PC");
  if (userInfo.isActiveWeb) iconsActive.push("Web");
  const devicesStr =
    iconsActive.length > 0 ? iconsActive.join(" - ") : "Chưa xác định";

  const dataFields = [
    {
      label: "🆔 USERNAME",
      value: userInfo.username || "N/A",
      color: "#00e0ff",
    },
    { label: "🌐 ONLINE STATUS", value: isOnlineStr, color: "#00e0ff" },
    {
      label: "🎂 BIRTHDAY",
      value: userInfo.birthday || "N/A",
      color: "#ff007f",
    },
    {
      label: "🕰️ LAST ACTIVE",
      value: userInfo.lastActive || "N/A",
      color: "#ff007f",
    },
    { label: "🚻 GENDER", value: userInfo.gender || "N/A", color: "#00e0ff" },
    {
      label: "📅 CREATED AT",
      value: userInfo.createdDate || "N/A",
      color: "#00e0ff",
    },
    {
      label: "💼 ACCOUNT TYPE",
      value: userInfo.businessType || "N/A",
      color: "#ff007f",
    },
    { label: "📱 ACTIVE DEVICES", value: "", color: "#ff007f" },
  ];

  const gridX = avatarX + avatarSize + 80;
  const colWidth = 410;
  const colGapX = 30;

  ctx.textAlign = "left";
  for (let i = 0; i < dataFields.length; i++) {
    const col = i % 2;
    const row = Math.floor(i / 2);
    const originX = gridX + col * (colWidth + colGapX);
    const originY = gridY + row * (boxHeight + gapY);

    ctx.fillStyle = "rgba(255, 255, 255, 0.04)";
    fillRoundRect(originX, originY, colWidth, boxHeight, 18);

    ctx.strokeStyle = "rgba(255, 255, 255, 0.06)";
    ctx.lineWidth = 1.5;
    strokeRoundRect(originX, originY, colWidth, boxHeight, 18);

    // Vertical left border line matching label color
    ctx.strokeStyle = dataFields[i].color;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(originX + 20, originY + 20);
    ctx.lineTo(originX + 20, originY + 85);
    ctx.stroke();

    ctx.fillStyle = dataFields[i].color;
    ctx.font = "bold 20px Tahoma";
    ctx.fillText(dataFields[i].label, originX + 35, originY + 45);

    if (i === 7) {
      // ACTIVE DEVICES
      const devices = [
        { name: "Mobile", active: userInfo.isActive },
        { name: "Web", active: userInfo.isActiveWeb },
        { name: "PC", active: userInfo.isActivePC },
      ];
      let deviceX = originX + 35;
      devices.forEach((device, index) => {
        ctx.fillStyle = device.active ? "#ffffff" : "#666666";
        ctx.font = "bold 24px Tahoma";
        ctx.fillText(device.name, deviceX, originY + 86);
        deviceX += ctx.measureText(device.name).width;
        if (index < devices.length - 1) {
          ctx.fillStyle = "#cccccc"; // Màu cho dấu -
          ctx.fillText(" - ", deviceX, originY + 86);
          deviceX += ctx.measureText(" - ").width;
        }
      });
    } else {
      ctx.fillStyle = "#ffffff";
      ctx.font = "bold 26px Tahoma";
      ctx.fillText(dataFields[i].value, originX + 35, originY + 86);
    }
  }

  // 5. Khối Bio (chỉ vẽ nếu có bio)
  if (hasBio) {
    const bioBoxWidth = width - 300;
    const bioBoxX = 150;

    ctx.fillStyle = "rgba(255, 255, 255, 0.04)";
    fillRoundRect(bioBoxX, bioBoxY, bioBoxWidth, bioBoxHeight, 20);

    ctx.strokeStyle = "rgba(255, 255, 255, 0.1)";
    ctx.lineWidth = 2;
    strokeRoundRect(bioBoxX, bioBoxY, bioBoxWidth, bioBoxHeight, 20);

    const bTitleText = "Bio / Introduction";
    ctx.font = "bold 24px Tahoma";
    const bTitleWidth = ctx.measureText(bTitleText).width + 60;

    ctx.fillStyle = "#171720";
    fillRoundRect(
      width / 2 - bTitleWidth / 2,
      bioBoxY - 26,
      bTitleWidth,
      52,
      26,
    );
    ctx.strokeStyle = "rgba(255, 255, 255, 0.1)";
    ctx.lineWidth = 2;
    strokeRoundRect(
      width / 2 - bTitleWidth / 2,
      bioBoxY - 26,
      bTitleWidth,
      52,
      26,
    );

    ctx.textAlign = "center";
    ctx.fillStyle = "#ffffff";
    ctx.fillText(bTitleText, width / 2, bioBoxY + 12);

    let currentY = bioBoxY + bioPadding + 35;

    for (const line of bioLines) {
      if (line.includes("❄️")) {
        ctx.font = "32px Tahoma";
        ctx.fillStyle = "#ffffff";
      } else {
        ctx.font = "26px Tahoma";
        ctx.fillStyle = "#cccccc";
      }
      ctx.fillText(line, width / 2, currentY);
      currentY += bioLineHeight;
    }
  }

  const filePath = path.resolve(`./assets/temp/user_info_${Date.now()}.png`);
  const out = fs.createWriteStream(filePath);
  const stream = canvas.createPNGStream();
  stream.pipe(out);
  return new Promise((resolve, reject) => {
    out.on("finish", () => resolve(filePath));
    out.on("error", reject);
  });
}

async function createUserInfoImageDesignB(userInfo) {
  let bioText = userInfo.bio;
  let hasBio =
    bioText && bioText !== "Không có thông tin bio" && bioText.trim() !== "";

  let bioLines = [];
  if (hasBio) {
    bioText.split("\n").forEach((line) => {
      const linesObj = handleNameLong(line, 80);
      bioLines.push(...linesObj.lines);
    });
  }

  const width = 1400;
  const bioLineHeight = 35;
  const bioPadding = 40;
  const bioBoxHeight = hasBio
    ? bioPadding * 2 + bioLines.length * bioLineHeight + 40
    : 0;

  function fillRoundRectOn(ctx, x, y, w, h, radius) {
    ctx.beginPath();
    ctx.moveTo(x + radius, y);
    ctx.lineTo(x + w - radius, y);
    ctx.quadraticCurveTo(x + w, y, x + w, y + radius);
    ctx.lineTo(x + w, y + h - radius);
    ctx.quadraticCurveTo(x + w, y + h, x + w - radius, y + h);
    ctx.lineTo(x + radius, y + h);
    ctx.quadraticCurveTo(x, y + h, x, y + h - radius);
    ctx.lineTo(x, y + radius);
    ctx.quadraticCurveTo(x, y, x + radius, y);
    ctx.closePath();
    ctx.fill();
  }

  function strokeRoundRectOn(ctx, x, y, w, h, radius) {
    ctx.beginPath();
    ctx.moveTo(x + radius, y);
    ctx.arcTo(x + w, y, x + w, y + h, radius);
    ctx.arcTo(x + w, y + h, x, y + h, radius);
    ctx.arcTo(x, y + h, x, y, radius);
    ctx.arcTo(x, y, x + w, y, radius);
    ctx.stroke();
  }

  // ---- Layout geometry (hàng dọc dạng "chip" thay vì lưới bảng của mẫu 1) ----
  const headerTop = 30;
  const headerH = 110;
  const avatarSize = 220;
  const avatarX = 110;
  const avatarY = headerTop + headerH + 50;

  const boxHeight = 130;
  const gapY = 24;
  const colGapX = 40;
  const gridX = 120;
  const colWidth = (width - gridX * 2 - colGapX) / 2;
  const gridY = avatarY + avatarSize + 90;

  const dataFields8 = 8;
  const rows = Math.ceil(dataFields8 / 2);
  const gridBottom = gridY + rows * (boxHeight + gapY) - gapY;

  const bioBoxY = gridBottom + 50;
  const totalHeight = bioBoxY + bioBoxHeight + (hasBio ? 70 : 50);

  const canvas = createCanvas(width, totalHeight);
  const ctx = canvas.getContext("2d");

  // 1. Nền tím than, dùng cover nếu có
  try {
    if (userInfo.cover && cv.isValidUrl(userInfo.cover)) {
      const coverImg = await loadImage(userInfo.cover);
      ctx.drawImage(coverImg, 0, 0, width, totalHeight);
      ctx.fillStyle = "rgba(12, 6, 20, 0.78)";
      ctx.fillRect(0, 0, width, totalHeight);
    } else {
      throw new Error("No cover image");
    }
  } catch (e) {
    const bgGrad = ctx.createRadialGradient(
      width / 2,
      0,
      0,
      width / 2,
      totalHeight / 2,
      width,
    );
    bgGrad.addColorStop(0, "#2b1a3d");
    bgGrad.addColorStop(1, "#0d0710");
    ctx.fillStyle = bgGrad;
    ctx.fillRect(0, 0, width, totalHeight);
  }

  const accentGrad = (x1, y1, x2, y2) => {
    const g = ctx.createLinearGradient(x1, y1, x2, y2);
    g.addColorStop(0, "#FFD86B");
    g.addColorStop(1, "#B36BFF");
    return g;
  };

  // 2. Header dạng viên thuốc (pill)
  const pillW = 760;
  const pillX = width / 2 - pillW / 2;
  ctx.fillStyle = "rgba(0, 0, 0, 0.35)";
  fillRoundRectOn(ctx, pillX, headerTop, pillW, headerH, headerH / 2);
  ctx.strokeStyle = accentGrad(pillX, headerTop, pillX + pillW, headerTop);
  ctx.lineWidth = 3;
  strokeRoundRectOn(ctx, pillX, headerTop, pillW, headerH, headerH / 2);

  ctx.textAlign = "center";
  ctx.fillStyle = accentGrad(width / 2 - 260, 0, width / 2 + 260, 0);
  ctx.font = "bold 44px Tahoma";
  ctx.fillText("HỒ SƠ NGƯỜI DÙNG", width / 2, headerTop + 55);
  ctx.fillStyle = "rgba(255,255,255,0.55)";
  ctx.font = "20px Tahoma";
  ctx.fillText("Z A L O   A C C O U N T   P R O F I L E", width / 2, headerTop + 90);

  // 3. Avatar bo góc vuông (khác với avatar tròn của mẫu 1)
  const avRadius = 42;
  ctx.save();
  ctx.shadowColor = "rgba(0,0,0,0.6)";
  ctx.shadowBlur = 35;
  ctx.shadowOffsetY = 12;
  ctx.fillStyle = accentGrad(avatarX, avatarY, avatarX + avatarSize, avatarY + avatarSize);
  fillRoundRectOn(ctx, avatarX - 8, avatarY - 8, avatarSize + 16, avatarSize + 16, avRadius + 8);
  ctx.restore();

  ctx.fillStyle = "#150b1f";
  fillRoundRectOn(ctx, avatarX - 3, avatarY - 3, avatarSize + 6, avatarSize + 6, avRadius + 3);

  let avatarImg = null;
  try {
    if (cv.isValidUrl(userInfo.avatarFull || userInfo.avatar)) {
      avatarImg = await loadImage(userInfo.avatarFull || userInfo.avatar);
    }
  } catch (e) {}

  ctx.save();
  ctx.beginPath();
  ctx.moveTo(avatarX + avRadius, avatarY);
  ctx.lineTo(avatarX + avatarSize - avRadius, avatarY);
  ctx.quadraticCurveTo(avatarX + avatarSize, avatarY, avatarX + avatarSize, avatarY + avRadius);
  ctx.lineTo(avatarX + avatarSize, avatarY + avatarSize - avRadius);
  ctx.quadraticCurveTo(avatarX + avatarSize, avatarY + avatarSize, avatarX + avatarSize - avRadius, avatarY + avatarSize);
  ctx.lineTo(avatarX + avRadius, avatarY + avatarSize);
  ctx.quadraticCurveTo(avatarX, avatarY + avatarSize, avatarX, avatarY + avatarSize - avRadius);
  ctx.lineTo(avatarX, avatarY + avRadius);
  ctx.quadraticCurveTo(avatarX, avatarY, avatarX + avRadius, avatarY);
  ctx.closePath();
  ctx.clip();
  if (avatarImg) {
    ctx.drawImage(avatarImg, avatarX, avatarY, avatarSize, avatarSize);
  } else {
    ctx.fillStyle = "#333";
    ctx.fillRect(avatarX, avatarY, avatarSize, avatarSize);
  }
  ctx.restore();

  // Trạng thái online dạng pill nhỏ phía dưới avatar
  const isOnline = userInfo.isOnline;
  const statusPillY = avatarY + avatarSize + 22;
  const statusPillH = 42;
  ctx.fillStyle = "rgba(0,0,0,0.4)";
  fillRoundRectOn(ctx, avatarX, statusPillY, avatarSize, statusPillH, statusPillH / 2);
  ctx.beginPath();
  ctx.arc(avatarX + 26, statusPillY + statusPillH / 2, 8, 0, Math.PI * 2);
  ctx.fillStyle = isOnline ? "#57ff57" : "#888";
  ctx.fill();
  ctx.textAlign = "left";
  ctx.font = "bold 20px Tahoma";
  ctx.fillStyle = "#ffffff";
  ctx.fillText(isOnline ? "Trực tuyến" : "Ngoại tuyến", avatarX + 44, statusPillY + statusPillH / 2 + 7);

  // 4. Tên + ID cạnh avatar
  const nameX = avatarX + avatarSize + 60;
  const nameRight = width - 100;
  ctx.textAlign = "left";
  ctx.fillStyle = "#ffffff";
  ctx.font = "bold 46px Tahoma";
  const [nameL1, nameL2] = hanldeNameUser(userInfo.name || "Unknown", 22);
  let nameY = avatarY + 60;
  ctx.fillText(nameL1, nameX, nameY);
  if (nameL2) {
    nameY += 50;
    ctx.fillText(nameL2, nameX, nameY);
  }
  nameY += 46;
  ctx.fillStyle = "rgba(255,255,255,0.5)";
  ctx.font = "22px Tahoma";
  ctx.fillText("ID: " + (userInfo.uid || "Chưa xác định"), nameX, nameY);

  nameY += 46;
  ctx.strokeStyle = accentGrad(nameX, 0, nameRight, 0);
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(nameX, nameY);
  ctx.lineTo(nameRight, nameY);
  ctx.stroke();

  // 5. Danh sách thông tin dạng "chip" bo tròn, icon nằm trong huy hiệu tròn
  const isOnlineStr = isOnline ? "Trực tuyến" : "Ngoại tuyến";
  const dataFields = [
    { icon: "🆔", label: "USERNAME", value: userInfo.username || "N/A" },
    { icon: "🌐", label: "ONLINE STATUS", value: isOnlineStr },
    { icon: "🎂", label: "BIRTHDAY", value: userInfo.birthday || "N/A" },
    { icon: "🕰️", label: "LAST ACTIVE", value: userInfo.lastActive || "N/A" },
    { icon: "🚻", label: "GENDER", value: userInfo.gender || "N/A" },
    { icon: "📅", label: "CREATED AT", value: userInfo.createdDate || "N/A" },
    { icon: "💼", label: "ACCOUNT TYPE", value: userInfo.businessType || "N/A" },
    { icon: "📱", label: "ACTIVE DEVICES", value: "" },
  ];

  for (let i = 0; i < dataFields.length; i++) {
    const col = i % 2;
    const row = Math.floor(i / 2);
    const originX = gridX + col * (colWidth + colGapX);
    const originY = gridY + row * (boxHeight + gapY);

    ctx.fillStyle = "rgba(255, 255, 255, 0.045)";
    fillRoundRectOn(ctx, originX, originY, colWidth, boxHeight, 26);
    ctx.strokeStyle = accentGrad(originX, originY, originX + colWidth, originY);
    ctx.lineWidth = 1.5;
    strokeRoundRectOn(ctx, originX, originY, colWidth, boxHeight, 26);

    // Huy hiệu icon tròn
    const badgeR = 34;
    const badgeCx = originX + 30 + badgeR;
    const badgeCy = originY + boxHeight / 2;
    ctx.fillStyle = accentGrad(badgeCx - badgeR, badgeCy - badgeR, badgeCx + badgeR, badgeCy + badgeR);
    ctx.beginPath();
    ctx.arc(badgeCx, badgeCy, badgeR, 0, Math.PI * 2);
    ctx.fill();
    ctx.textAlign = "center";
    ctx.font = "30px Tahoma";
    ctx.fillStyle = "#1a0f26";
    ctx.fillText(dataFields[i].icon, badgeCx, badgeCy + 11);

    const textX = badgeCx + badgeR + 26;
    ctx.textAlign = "left";
    ctx.fillStyle = "rgba(255,255,255,0.55)";
    ctx.font = "bold 18px Tahoma";
    ctx.fillText(dataFields[i].label, textX, originY + 46);

    if (i === 7) {
      const devices = [
        { name: "Mobile", active: userInfo.isActive },
        { name: "Web", active: userInfo.isActiveWeb },
        { name: "PC", active: userInfo.isActivePC },
      ];
      let deviceX = textX;
      ctx.font = "bold 24px Tahoma";
      devices.forEach((device, index) => {
        ctx.fillStyle = device.active ? "#ffffff" : "#665f6e";
        ctx.fillText(device.name, deviceX, originY + 90);
        deviceX += ctx.measureText(device.name).width;
        if (index < devices.length - 1) {
          ctx.fillStyle = "rgba(255,255,255,0.4)";
          ctx.fillText(" - ", deviceX, originY + 90);
          deviceX += ctx.measureText(" - ").width;
        }
      });
    } else {
      ctx.fillStyle = "#ffffff";
      ctx.font = "bold 26px Tahoma";
      ctx.fillText(dataFields[i].value, textX, originY + 90);
    }
  }

  // 6. Khối Bio căn trái với thanh nhấn gradient bên trái (khác kiểu tiêu đề nổi ở giữa của mẫu 1)
  if (hasBio) {
    const bioBoxWidth = width - 240;
    const bioBoxX = 120;

    ctx.fillStyle = "rgba(255, 255, 255, 0.045)";
    fillRoundRectOn(ctx, bioBoxX, bioBoxY, bioBoxWidth, bioBoxHeight, 22);
    ctx.strokeStyle = "rgba(255, 255, 255, 0.1)";
    ctx.lineWidth = 1.5;
    strokeRoundRectOn(ctx, bioBoxX, bioBoxY, bioBoxWidth, bioBoxHeight, 22);

    ctx.fillStyle = accentGrad(bioBoxX, bioBoxY, bioBoxX, bioBoxY + bioBoxHeight);
    fillRoundRectOn(ctx, bioBoxX, bioBoxY, 8, bioBoxHeight, 4);

    ctx.textAlign = "left";
    ctx.font = "bold 22px Tahoma";
    ctx.fillStyle = accentGrad(bioBoxX + 40, 0, bioBoxX + 300, 0);
    ctx.fillText("Bio / Introduction", bioBoxX + 40, bioBoxY + bioPadding);

    let currentY = bioBoxY + bioPadding + bioLineHeight;
    for (const line of bioLines) {
      ctx.font = "26px Tahoma";
      ctx.fillStyle = "#dcd3e6";
      ctx.fillText(line, bioBoxX + 40, currentY);
      currentY += bioLineHeight;
    }
  }

  const filePath = path.resolve(`./assets/temp/user_info_v2_${Date.now()}.png`);
  const out = fs.createWriteStream(filePath);
  const stream = canvas.createPNGStream();
  stream.pipe(out);
  return new Promise((resolve, reject) => {
    out.on("finish", () => resolve(filePath));
    out.on("error", reject);
  });
}

/**
 * Ảnh thông tin người dùng: mỗi lần gọi sẽ đổi luân phiên giữa 2 mẫu thiết kế khác nhau
 * (cùng một bộ dữ liệu `userInfo`), đảm bảo không lặp lại cùng 1 mẫu ở 2 lần gọi liên tiếp
 * (dùng Math.random() độc lập mỗi lần có xác suất ra cùng 1 mẫu nhiều lần liên tục).
 */
export async function createUserInfoImage(userInfo) {
  const width = 1100, height = 620;
  const canvas = new SkiaCanvas(width, height);
  const ctx = canvas.getContext("2d");
  const clean = (value, fallback = "Ẩn") => {
    const text = value == null ? "" : String(value).trim();
    return !text || text.toLowerCase() === "undefined" || text.toLowerCase() === "null" ? fallback : text;
  };
  const shorten = (value, maxWidth, font) => {
    let text = clean(value);
    ctx.font = font;
    while (text.length > 3 && ctx.measureText(text).width > maxWidth) text = text.slice(0, -4) + "…";
    return text;
  };
  const rounded = (x, y, w, h, radius, fill, stroke) => {
    ctx.beginPath(); ctx.roundRect(x, y, w, h, radius);
    ctx.fillStyle = fill; ctx.fill();
    if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = 1; ctx.stroke(); }
  };

  const bg = ctx.createLinearGradient(0, 0, width, height);
  bg.addColorStop(0, "#090d1a");
  bg.addColorStop(0.52, "#15112b");
  bg.addColorStop(1, "#071b28");
  ctx.fillStyle = bg; ctx.fillRect(0, 0, width, height);
  ctx.globalAlpha = 0.18;
  ctx.fillStyle = "#8b5cf6"; ctx.beginPath(); ctx.arc(90, 60, 230, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = "#22d3ee"; ctx.beginPath(); ctx.arc(1040, 580, 260, 0, Math.PI * 2); ctx.fill();
  ctx.globalAlpha = 1;

  rounded(42, 38, 1016, 544, 34, "rgba(17,24,39,0.92)", "rgba(255,255,255,0.16)");
  let avatar = null;
  try {
    const avatarUrl = userInfo.avatarFull || userInfo.avatar;
    if (cv.isValidUrl(avatarUrl)) avatar = await loadSkiaImage(avatarUrl);
  } catch {}
  const avatarX = 78, avatarY = 92, avatarSize = 254;
  rounded(avatarX - 5, avatarY - 5, avatarSize + 10, avatarSize + 10, 25, "#67e8f9");
  rounded(avatarX, avatarY, avatarSize, avatarSize, 21, "#111827");
  if (avatar) {
    ctx.save(); ctx.beginPath(); ctx.roundRect(avatarX, avatarY, avatarSize, avatarSize, 21); ctx.clip();
    const sourceWidth = avatar.width || avatarSize;
    const sourceHeight = avatar.height || avatarSize;
    const sourceSize = Math.min(sourceWidth, sourceHeight);
    const sourceX = (sourceWidth - sourceSize) / 2;
    const sourceY = (sourceHeight - sourceSize) / 2;
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(avatar, sourceX, sourceY, sourceSize, sourceSize, avatarX, avatarY, avatarSize, avatarSize);
    ctx.restore();
  } else {
    ctx.fillStyle = "#64748b"; ctx.font = "700 72px Arial"; ctx.textAlign = "center";
    ctx.fillText(clean(userInfo.name, "?").charAt(0).toUpperCase(), 205, 245);
  }

  ctx.textAlign = "center";
  ctx.fillStyle = "#f8fafc"; ctx.font = "700 32px Arial";
  ctx.fillText(shorten(userInfo.name, 280, "700 32px Arial"), 205, 397);
  ctx.fillStyle = "#94a3b8"; ctx.font = "17px Arial";
  ctx.fillText("UID  " + clean(userInfo.uid, "N/A"), 205, 432);
  rounded(122, 461, 166, 38, 19, userInfo.isOnline ? "rgba(16,185,129,0.18)" : "rgba(100,116,139,0.2)");
  ctx.fillStyle = userInfo.isOnline ? "#6ee7b7" : "#cbd5e1"; ctx.font = "700 14px Arial";
  ctx.fillText(userInfo.isOnline ? "●  ĐANG ONLINE" : "●  OFFLINE", 205, 486);

  ctx.textAlign = "left";
  ctx.fillStyle = "#67e8f9"; ctx.font = "700 15px Arial"; ctx.fillText("ZALO PROFILE", 390, 102);
  ctx.fillStyle = "#f8fafc"; ctx.font = "700 38px Arial";
  ctx.fillText(shorten(userInfo.name, 610, "700 38px Arial"), 390, 150);
  ctx.fillStyle = "#94a3b8"; ctx.font = "17px Arial";
  ctx.fillText("Thông tin tài khoản người dùng", 390, 181);

  const fields = [
    ["USERNAME", clean(userInfo.username)],
    ["GIỚI TÍNH", clean(userInfo.gender, "Không xác định")],
    ["NGÀY SINH", clean(userInfo.birthday)],
    ["HOẠT ĐỘNG", clean(userInfo.lastActive)],
  ];
  fields.forEach(([label, value], index) => {
    const col = index % 2, row = Math.floor(index / 2);
    const x = 390 + col * 300, y = 220 + row * 112;
    rounded(x, y, 272, 88, 18, "rgba(255,255,255,0.055)", "rgba(255,255,255,0.10)");
    ctx.fillStyle = "#a78bfa"; ctx.font = "700 12px Arial"; ctx.fillText(label, x + 20, y + 27);
    ctx.fillStyle = "#e5e7eb"; ctx.font = "600 20px Arial";
    ctx.fillText(shorten(value, 230, "600 20px Arial"), x + 20, y + 59);
  });

  rounded(390, 456, 572, 82, 18, "rgba(34,211,238,0.07)", "rgba(34,211,238,0.18)");
  ctx.fillStyle = "#67e8f9"; ctx.font = "700 12px Arial"; ctx.fillText("GIỚI THIỆU", 410, 483);
  ctx.fillStyle = "#cbd5e1"; ctx.font = "17px Arial";
  ctx.fillText(shorten(userInfo.bio, 525, "17px Arial"), 410, 515);

  const filePath = path.resolve("./assets/temp/user_info_modern_" + Date.now() + ".png");
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  await fs.promises.writeFile(filePath, await canvas.toBuffer("png"));
  return filePath;
}

async function createUserInfoImageSimple(userInfo) {
  const width = 960, height = 540;
  const canvas = new SkiaCanvas(width, height);
  const ctx = canvas.getContext("2d");
  const safe = (value, fallback = "N/A") => {
    if (value === undefined || value === null || String(value).toLowerCase() === "undefined" || String(value).trim() === "") return fallback;
    return String(value);
  };
  const fit = (value, max) => {
    let text = safe(value);
    ctx.font = "600 22px Arial";
    while (text.length > 3 && ctx.measureText(text).width > max) text = text.slice(0, -4) + "...";
    return text;
  };
  ctx.fillStyle = "#e0e7ff"; ctx.fillRect(0, 0, width, height);
  ctx.fillStyle = "#7c3aed"; ctx.fillRect(0, 0, width, 12);
  ctx.fillStyle = "#ffffff"; ctx.beginPath(); ctx.roundRect(32, 34, width - 64, height - 68, 26); ctx.fill();
  ctx.fillStyle = "#312e81"; ctx.beginPath(); ctx.roundRect(32, 34, 250, height - 68, 26); ctx.fill();
  let avatar = null;
  try {
    const avatarUrl = userInfo.avatarFull || userInfo.avatar;
    if (cv.isValidUrl(avatarUrl)) avatar = await loadSkiaImage(avatarUrl);
  } catch {}
  ctx.fillStyle = "#334155"; ctx.beginPath(); ctx.arc(145, 170, 92, 0, Math.PI * 2); ctx.fill();
  if (avatar) {
    ctx.save(); ctx.beginPath(); ctx.arc(145, 170, 86, 0, Math.PI * 2); ctx.clip();
    ctx.drawImage(avatar, 59, 84, 172, 172); ctx.restore();
  }
  ctx.textAlign = "center"; ctx.fillStyle = "#fff"; ctx.font = "700 27px Arial";
  ctx.fillText(fit(userInfo.name, 230), 145, 300);
  ctx.fillStyle = "#94a3b8"; ctx.font = "16px Arial";
  ctx.fillText("UID: " + safe(userInfo.uid), 145, 330);
  ctx.textAlign = "left"; ctx.fillStyle = "#7c3aed"; ctx.font = "700 16px Arial";
  ctx.fillText("THÔNG TIN NGƯỜI DÙNG", 285, 92);
  ctx.fillStyle = "#111827"; ctx.font = "700 34px Arial"; ctx.fillText(fit(userInfo.name, 570), 285, 140);
  const fields = [
    ["USERNAME", safe(userInfo.username, "Ẩn")],
    ["GIỚI TÍNH", safe(userInfo.gender, "Không xác định")],
    ["NGÀY SINH", safe(userInfo.birthday, "Ẩn")],
    ["TRẠNG THÁI", userInfo.isOnline ? "Đang online" : "Offline"],
    ["HOẠT ĐỘNG", safe(userInfo.lastActive, "Ẩn")],
    ["TÀI KHOẢN", safe(userInfo.businessType, "Cá nhân")],
  ];
  fields.forEach(([label, value], index) => {
    const x = 285 + (index % 2) * 295, y = 195 + Math.floor(index / 2) * 78;
    ctx.fillStyle = "#7c3aed"; ctx.font = "700 12px Arial"; ctx.fillText(label, x, y);
    ctx.fillStyle = "#1f2937"; ctx.font = "600 20px Arial"; ctx.fillText(fit(value, 260), x, y + 29);
  });
  ctx.fillStyle = "#64748b"; ctx.font = "15px Arial";
  ctx.fillText("Bio: " + fit(userInfo.bio, 600), 285, 460);
  ctx.fillText("ZALO USER INFO", 285, 490);
  const filePath = path.resolve("./assets/temp/user_info_simple_" + Date.now() + ".png");
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  await fs.promises.writeFile(filePath, await canvas.toBuffer("png"));
  return filePath;
}

async function createUserInfoImageOld(userInfo) {
  const width = 1200;
  const height = 760;
  const canvas = new SkiaCanvas(width, height);
  const ctx = canvas.getContext("2d");
  const navy = "#18324a";
  const blue = "#3478b8";
  const ink = "#20272d";
  const muted = "#737d84";
  const line = "#dfe3e3";

  function card(x, y, w, h, radius, color, stroke = null) {
    ctx.beginPath();
    ctx.roundRect(x, y, w, h, radius);
    ctx.fillStyle = color;
    ctx.fill();
    if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = 1; ctx.stroke(); }
  }
  function fit(text, maxWidth, font) {
    let output = String(text || "N/A");
    ctx.font = font;
    if (ctx.measureText(output).width <= maxWidth) return output;
    while (output.length > 1 && ctx.measureText(`${output}…`).width > maxWidth) output = output.slice(0, -1);
    return `${output}…`;
  }

  ctx.fillStyle = "#f3f1eb";
  ctx.fillRect(0, 0, width, height);
  ctx.fillStyle = navy;
  ctx.fillRect(0, 0, width, 18);
  card(38, 48, 350, 664, 26, navy);

  ctx.fillStyle = "#8fc0eb";
  ctx.font = "700 14px Arial";
  ctx.textAlign = "left";
  ctx.fillText("ZALO / USER PROFILE", 72, 88);

  const avatarX = 91;
  const avatarY = 122;
  const avatarSize = 244;
  let avatar = null;
  try {
    const url = userInfo.avatarFull || userInfo.avatar;
    if (cv.isValidUrl(url)) avatar = await loadSkiaImage(url);
  } catch {}
  card(avatarX - 5, avatarY - 5, avatarSize + 10, avatarSize + 10, 31, "#8fc0eb");
  ctx.save();
  ctx.beginPath();
  ctx.roundRect(avatarX, avatarY, avatarSize, avatarSize, 27);
  ctx.clip();
  if (avatar) ctx.drawImage(avatar, avatarX, avatarY, avatarSize, avatarSize);
  else {
    ctx.fillStyle = "#d8e8f4";
    ctx.fillRect(avatarX, avatarY, avatarSize, avatarSize);
  }
  ctx.restore();

  ctx.fillStyle = "#ffffff";
  ctx.font = "700 30px Arial";
  ctx.textAlign = "center";
  ctx.fillText(fit(userInfo.name || "Người dùng Zalo", 280, "700 30px Arial"), 213, 422);
  ctx.fillStyle = "#aebdca";
  ctx.font = "16px Arial";
  ctx.fillText(`UID ${userInfo.uid || "N/A"}`, 213, 456);
  card(116, 486, 194, 38, 19, userInfo.isOnline ? "#245948" : "#374b5c");
  ctx.fillStyle = userInfo.isOnline ? "#83ddb9" : "#bdc8cf";
  ctx.font = "700 14px Arial";
  ctx.fillText(userInfo.isOnline ? "●  TRỰC TUYẾN" : "●  NGOẠI TUYẾN", 213, 511);
  ctx.fillStyle = "#8295a5";
  ctx.font = "14px Arial";
  ctx.fillText("Thông tin công khai từ Zalo", 213, 668);

  const contentX = 438;
  ctx.textAlign = "left";
  ctx.fillStyle = navy;
  ctx.font = "700 38px Arial";
  ctx.fillText("Thông tin cá nhân", contentX, 92);
  ctx.fillStyle = muted;
  ctx.font = "17px Arial";
  ctx.fillText("Tổng quan tài khoản và trạng thái hoạt động", contentX, 124);

  const fields = [
    ["Tên đăng nhập", userInfo.username || "Chưa thiết lập"],
    ["Giới tính", userInfo.gender || "Không xác định"],
    ["Ngày sinh", userInfo.birthday || "Ẩn"],
    ["Loại tài khoản", userInfo.businessType || "Cá nhân"],
    ["Hoạt động gần nhất", userInfo.lastActive || "Ẩn"],
    ["Ngày tạo", userInfo.createdDate || "Ẩn"],
  ];
  fields.forEach(([fieldLabel, fieldValue], index) => {
    const col = index % 2;
    const row = Math.floor(index / 2);
    const x = contentX + col * 350;
    const y = 182 + row * 112;
    ctx.fillStyle = blue;
    ctx.font = "700 13px Arial";
    ctx.fillText(fieldLabel.toUpperCase(), x, y);
    ctx.fillStyle = ink;
    ctx.font = "600 21px Arial";
    ctx.fillText(fit(fieldValue, 305, "600 21px Arial"), x, y + 36);
    ctx.strokeStyle = line;
    ctx.beginPath();
    ctx.moveTo(x, y + 66);
    ctx.lineTo(x + 310, y + 66);
    ctx.stroke();
  });

  card(contentX, 528, 704, 145, 20, "#e6edf2");
  ctx.fillStyle = blue;
  ctx.font = "700 13px Arial";
  ctx.fillText("GIỚI THIỆU", contentX + 26, 562);
  ctx.fillStyle = ink;
  ctx.font = "18px Arial";
  const bio = fit(String(userInfo.bio || "Không có thông tin bio").replace(/\s+/g, " "), 646, "18px Arial");
  ctx.fillText(bio, contentX + 26, 604);
  ctx.fillStyle = "#98a1a5";
  ctx.font = "13px Arial";
  ctx.textAlign = "right";
  ctx.fillText("NGHUNG • PROFILE", 1142, 714);

  const filePath = path.resolve(`./assets/temp/user_info_${Date.now()}.png`);
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  await fs.promises.writeFile(filePath, await canvas.toBuffer("png"));
  return filePath;
}

async function createUserInfoImageLegacy(userInfo) {
  const width = 1200;
  const height = 760;
  const canvas = new SkiaCanvas(width, height);
  const ctx = canvas.getContext("2d");
  const round = (x, y, w, h, r, color) => {
    ctx.beginPath();
    ctx.roundRect(x, y, w, h, r);
    ctx.fillStyle = color;
    ctx.fill();
  };

  const fitText = (text, maxWidth) => {
    let value = String(text || "");
    if (ctx.measureText(value).width <= maxWidth) return value;
    while (value.length > 1 && ctx.measureText(value + "…").width > maxWidth) value = value.slice(0, -1);
    return value + "…";
  };

  const bg = ctx.createLinearGradient(0, 0, width, height);
  bg.addColorStop(0, "#07111f");
  bg.addColorStop(1, "#101d31");
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, width, height);
  ctx.fillStyle = "rgba(34,211,238,.08)";
  ctx.beginPath();
  ctx.arc(1110, 70, 190, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.arc(1030, 730, 250, 0, Math.PI * 2);
  ctx.fill();

  round(34, 34, 350, 692, 28, "#0c1a2c");
  ctx.strokeStyle = "rgba(148,163,184,.16)";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.roundRect(34, 34, 350, 692, 28);
  ctx.stroke();

  ctx.fillStyle = "#22d3ee";
  ctx.font = "700 15px Arial";
  ctx.fillText("BOT MANAGER", 72, 83);
  ctx.fillStyle = "#64748b";
  ctx.fillRect(72, 101, 58, 3);

  let avatar = null;
  try {
    const avatarUrl = userInfo.avatarFull || userInfo.avatar;
    if (cv.isValidUrl(avatarUrl)) avatar = await loadSkiaImage(avatarUrl);
  } catch {}
  ctx.save();
  ctx.beginPath();
  ctx.arc(209, 224, 96, 0, Math.PI * 2);
  ctx.clip();
  if (avatar) ctx.drawImage(avatar, 113, 128, 192, 192);
  else {
    ctx.fillStyle = "#164e63";
    ctx.fillRect(113, 128, 192, 192);
  }
  ctx.restore();
  ctx.strokeStyle = "#22d3ee";
  ctx.lineWidth = 5;
  ctx.beginPath();
  ctx.arc(209, 224, 100, 0, Math.PI * 2);
  ctx.stroke();

  ctx.textAlign = "center";
  ctx.fillStyle = "#ffffff";
  ctx.font = "700 30px Arial";
  ctx.fillText(fitText(userInfo.name || "Người dùng Zalo", 290), 209, 370);
  ctx.fillStyle = "#94a3b8";
  ctx.font = "16px Arial";
  ctx.fillText(`UID  ${userInfo.uid || "N/A"}`, 209, 404);
  const online = !!userInfo.isOnline;
  round(119, 435, 180, 38, 19, online ? "rgba(34,197,94,.13)" : "rgba(148,163,184,.12)");
  ctx.fillStyle = online ? "#4ade80" : "#94a3b8";
  ctx.font = "700 15px Arial";
  ctx.fillText(online ? "●  ĐANG TRỰC TUYẾN" : "●  ĐANG NGOẠI TUYẾN", 209, 460);

  ctx.textAlign = "left";
  ctx.fillStyle = "#64748b";
  ctx.font = "14px Arial";
  ctx.fillText("ZALO USER PROFILE", 72, 655);
  ctx.fillStyle = "#cbd5e1";
  ctx.font = "18px Arial";
  ctx.fillText("Thông tin cá nhân", 72, 684);

  ctx.fillStyle = "#f8fafc";
  ctx.font = "700 30px Arial";
  ctx.fillText("Profile overview", 438, 86);
  ctx.fillStyle = "#64748b";
  ctx.font = "16px Arial";
  ctx.fillText("Thông tin công khai từ tài khoản Zalo", 438, 116);

  const fields = [
    ["Username", userInfo.username || "Chưa thiết lập"],
    ["Giới tính", userInfo.gender || "Không xác định"],
    ["Ngày sinh", userInfo.birthday || "Ẩn"],
    ["Loại tài khoản", userInfo.businessType || "Cá nhân"],
    ["Hoạt động gần nhất", userInfo.lastActive || "Ẩn"],
    ["Ngày tạo", userInfo.createdDate || "Ẩn"],
  ];
  fields.forEach(([label, value], index) => {
    const col = index % 2;
    const row = Math.floor(index / 2);
    const x = 438 + col * 360;
    const y = 165 + row * 116;
    ctx.fillStyle = "#22d3ee";
    ctx.beginPath();
    ctx.arc(x + 5, y + 8, 5, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#64748b";
    ctx.font = "14px Arial";
    ctx.fillText(label.toUpperCase(), x + 20, y + 13);
    ctx.fillStyle = "#e2e8f0";
    ctx.font = "700 20px Arial";
    ctx.fillText(fitText(value, 315), x, y + 50);
    ctx.fillStyle = "rgba(148,163,184,.15)";
    ctx.fillRect(x, y + 75, 320, 1);
  });

  round(438, 530, 704, 150, 20, "rgba(15,35,57,.78)");
  ctx.fillStyle = "#22d3ee";
  ctx.font = "700 15px Arial";
  ctx.fillText("GIỚI THIỆU", 468, 568);
  ctx.fillStyle = "#cbd5e1";
  ctx.font = "18px Arial";
  const bio = String(userInfo.bio || "Không có thông tin bio").replace(/\s+/g, " ");
  const words = bio.split(" ");
  let line = "", lineY = 608;
  for (const word of words) {
    const test = `${line}${line ? " " : ""}${word}`;
    if (ctx.measureText(test).width > 642) {
      ctx.fillText(line, 468, lineY);
      line = word;
      lineY += 29;
      if (lineY > 650) break;
    } else line = test;
  }
  if (lineY <= 650) ctx.fillText(line, 468, lineY);
  ctx.fillStyle = "#475569";
  ctx.font = "13px Arial";
  ctx.textAlign = "right";
  ctx.fillText("BOT MANAGER  •  PROFILE CARD", 1142, 714);

  const filePath = path.resolve(`./assets/temp/user_info_${Date.now()}.png`);
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  await fs.promises.writeFile(filePath, await canvas.toBuffer("png"));
  return filePath;
}

export async function createManagerBotInfoImage(cardData) {
  const width = 1200;
  const margin = 40;
  const overviewFields = cardData.overviewFields || cardData.fields || [];
  const registrationFields = cardData.registrationFields || [];
  const extraFields = cardData.extraFields || [];
  const sections = [
    { title: cardData.overviewTitle || "Tổng quan", fields: overviewFields },
    ...(cardData.showRegistrationSection === false
      ? []
      : [{ title: cardData.registrationTitle || "Đăng ký", fields: registrationFields }]),
    ...(cardData.showExtraSection === false
      ? []
      : [{
          title: cardData.extraTitle || "Thông tin thêm",
          fields: extraFields.length
            ? extraFields
            : [{ label: "Thông tin", value: cardData.extraText || "Chưa cập nhật" }],
        }]),
  ];
  const rowHeight = 110;
  const sectionHeights = sections.map(({ fields }) =>
    90 + Math.max(1, Math.ceil(Math.max(1, fields.length) / 2)) * rowHeight,
  );
  const totalHeight = 350 + sectionHeights.reduce((sum, height) => sum + height + 30, 0);
  const canvas = createCanvas(width, totalHeight);
  const ctx = canvas.getContext("2d");

  function roundRect(x, y, w, h, radius, fill, stroke) {
    ctx.beginPath();
    ctx.roundRect(x, y, w, h, radius);
    if (fill) { ctx.fillStyle = fill; ctx.fill(); }
    if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = 2; ctx.stroke(); }
  }

  function fitText(text, maxWidth, font, suffix = "…") {
    ctx.font = font;
    const value = String(text ?? "N/A");
    if (ctx.measureText(value).width <= maxWidth) return value;
    let output = value;
    while (output.length && ctx.measureText(output + suffix).width > maxWidth) output = output.slice(0, -1);
    return output + suffix;
  }

  // Material Design 3 Surface (Background)
  ctx.fillStyle = "#F3EDF7"; // Soft pastel lavender
  ctx.fillRect(0, 0, width, totalHeight);

  // Avatar
  const avatarSize = 160;
  const avatarX = margin;
  const avatarY = 60;
  let avatarImg = null;
  try {
    if (cv.isValidUrl(cardData.avatar)) avatarImg = await loadImage(cardData.avatar);
  } catch {}

  // MD3 Large Rounded Avatar (instead of perfect circle, squircle-like)
  ctx.save();
  ctx.beginPath();
  ctx.roundRect(avatarX, avatarY, avatarSize, avatarSize, 48); // Very rounded corners
  ctx.clip();
  if (avatarImg) {
    ctx.drawImage(avatarImg, avatarX, avatarY, avatarSize, avatarSize);
  } else {
    ctx.fillStyle = "#E8DEF8"; // Secondary container
    ctx.fillRect(avatarX, avatarY, avatarSize, avatarSize);
    ctx.fillStyle = "#1D1B20"; // On Surface
    ctx.font = "bold 64px Roboto, sans-serif";
    ctx.textAlign = "center";
    ctx.fillText("B", avatarX + avatarSize / 2, avatarY + 105);
  }
  ctx.restore();
  
  // Header Title
  const titleX = avatarX + avatarSize + 40;
  ctx.textAlign = "left";
  
  ctx.fillStyle = "#6750A4"; // Primary MD3 Purple
  ctx.font = "600 20px Roboto, sans-serif";
  ctx.fillText("BOT MANAGER", titleX, 95);
  
  ctx.fillStyle = "#1D1B20";
  ctx.font = "bold 48px Roboto, sans-serif";
  ctx.fillText(fitText(cardData.title || "Thông Tin Hệ Thống", 850, "bold 48px Roboto"), titleX, 155);
  
  ctx.fillStyle = "#49454F"; // On Surface Variant
  ctx.font = "400 24px Roboto, sans-serif";
  ctx.fillText("Trạng thái và Thông số chi tiết", titleX, 200);

  function drawSection(section, y, height) {
    const cardWidth = width - margin * 2;
    
    // MD3 Card (Surface Container Lowest or High)
    // No shadow, relying on color elevation
    roundRect(margin, y, cardWidth, height, 32, "#FEF7FF"); // Very rounded card
    
    // Section Title Container (Pill)
    const titleText = section.title;
    ctx.font = "500 24px Roboto, sans-serif";
    const textWidth = ctx.measureText(titleText).width;
    roundRect(margin + 40, y + 40, textWidth + 40, 48, 24, "#E8DEF8"); // Pill container for title
    
    ctx.fillStyle = "#1D192B"; // On Secondary Container
    ctx.textAlign = "center";
    ctx.fillText(titleText, margin + 40 + (textWidth + 40)/2, y + 72);

    const fields = section.fields.length ? section.fields : [{ label: "Thông tin", value: "Chưa cập nhật" }];
    const colWidth = (cardWidth - 80) / 2;
    
    fields.forEach((field, index) => {
      const col = index % 2;
      const row = Math.floor(index / 2);
      const x = margin + 40 + col * colWidth;
      const itemY = y + 130 + row * rowHeight;
      
      // Secondary pill background for field value
      const fieldBoxY = itemY - 25;
      const fieldBoxHeight = 85;
      roundRect(x, fieldBoxY, colWidth - 40, fieldBoxHeight, 20, "#F3EDF7"); // Surface Container Highest
      
      ctx.textAlign = "left";
      // Field Label
      ctx.fillStyle = "#6750A4"; // Primary color for label
      ctx.font = "500 18px Roboto, sans-serif";
      ctx.fillText(String(field.label || "THÔNG TIN"), x + 20, itemY);
      
      // Field Value 
      ctx.fillStyle = "#1D1B20"; // On Surface
      ctx.font = "400 28px Roboto, sans-serif";
      ctx.fillText(fitText(field.value, colWidth - 80, "400 28px Roboto"), x + 20, itemY + 40);
    });
  }

  let sectionY = 300;
  sections.forEach((section, index) => {
    drawSection(section, sectionY, sectionHeights[index]);
    sectionY += sectionHeights[index] + 40;
  });

  // Footer
  ctx.fillStyle = "#49454F";
  ctx.font = "400 18px Roboto, sans-serif";
  ctx.textAlign = "center";
  ctx.fillText("HỆ THỐNG VẬN HÀNH BOT • MATERIAL DESIGN", width / 2, totalHeight - 40);

  const filePath = path.resolve(
    `./assets/temp/manager_bot_info_${Date.now()}.png`,
  );
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const out = fs.createWriteStream(filePath);
  const stream = canvas.createPNGStream();
  stream.pipe(out);
  return new Promise((resolve, reject) => {
    out.on("finish", () => resolve(filePath));
    out.on("error", reject);
  });
}

export { createGamePlayerCard as createUserCardGame } from "./game-finance.js";

async function createUserCardGameLegacy(playerInfo) {
  const [nameLine1, nameLine2] = hanldeNameUser(
    playerInfo.playerName || "Unknown",
    20,
  );
  const width = 1400;
  const boxHeight = 110;
  const gapY = 20;

  let yPos = 80;
  yPos += 40;
  yPos += 60;
  const gridY = yPos - 10;

  const GRID_ROWS = 4;
  const wideBoxY = gridY + GRID_ROWS * (boxHeight + gapY) + 20;
  const wideBoxH = 120;
  const totalHeight = wideBoxY + wideBoxH + 60;

  const canvas = createCanvas(width, totalHeight);
  const ctx = canvas.getContext("2d");

  function fillRoundRect(x, y, w, h, radius) {
    ctx.beginPath();
    ctx.moveTo(x + radius, y);
    ctx.lineTo(x + w - radius, y);
    ctx.quadraticCurveTo(x + w, y, x + w, y + radius);
    ctx.lineTo(x + w, y + h - radius);
    ctx.quadraticCurveTo(x + w, y + h, x + w - radius, y + h);
    ctx.lineTo(x + radius, y + h);
    ctx.quadraticCurveTo(x, y + h, x, y + h - radius);
    ctx.lineTo(x, y + radius);
    ctx.quadraticCurveTo(x, y, x + radius, y);
    ctx.closePath();
    ctx.fill();
  }

  function strokeRoundRect(x, y, w, h, radius) {
    ctx.beginPath();
    ctx.moveTo(x + radius, y);
    ctx.arcTo(x + w, y, x + w, y + h, radius);
    ctx.arcTo(x + w, y + h, x, y + h, radius);
    ctx.arcTo(x, y + h, x, y, radius);
    ctx.arcTo(x, y, x + w, y, radius);
    ctx.stroke();
  }

  // 1. Background
  const BG_URL = "https://files.catbox.moe/hffimt.jpg";
  try {
    const bgImg = await loadImage(BG_URL);
    const scale = Math.max(width / bgImg.width, totalHeight / bgImg.height);
    const bw = bgImg.width * scale;
    const bh = bgImg.height * scale;
    ctx.drawImage(bgImg, (width - bw) / 2, (totalHeight - bh) / 2, bw, bh);
    ctx.fillStyle = "rgba(0,0,0,0.68)";
    ctx.fillRect(0, 0, width, totalHeight);
  } catch {
    const bgGrad = ctx.createRadialGradient(
      width / 2,
      0,
      0,
      width / 2,
      totalHeight / 2,
      width,
    );
    bgGrad.addColorStop(0, "#232336");
    bgGrad.addColorStop(1, "#111118");
    ctx.fillStyle = bgGrad;
    ctx.fillRect(0, 0, width, totalHeight);
  }

  // 2. Header
  let topY = 90;
  ctx.textAlign = "center";
  ctx.font = "bold 60px Tahoma";
  const titleText = playerInfo.title || "Thông Tin Game";
  const titleGrad = ctx.createLinearGradient(
    width / 2 - 250,
    topY,
    width / 2 + 250,
    topY,
  );
  titleGrad.addColorStop(0, "#00e0ff");
  titleGrad.addColorStop(0.5, "#ff00ff");
  titleGrad.addColorStop(1, "#ff007f");
  ctx.fillStyle = titleGrad;
  ctx.fillText(titleText, width / 2, topY);

  topY += 40;
  const divGrad = ctx.createLinearGradient(0, topY, width, topY);
  divGrad.addColorStop(0, "rgba(0,224,255,0)");
  divGrad.addColorStop(0.3, "rgba(0,224,255,0.8)");
  divGrad.addColorStop(0.7, "rgba(255,0,127,0.8)");
  divGrad.addColorStop(1, "rgba(255,0,127,0)");
  ctx.fillStyle = divGrad;
  ctx.fillRect(150, topY, width - 300, 4);

  // 3. Avatar (left side)
  const avatarSize = 250;
  const avatarX = 150;
  const avatarY = topY + 120;
  const cx = avatarX + avatarSize / 2;
  const cy = avatarY + avatarSize / 2;

  let avatarImg = null;
  try {
    if (cv.isValidUrl(playerInfo.avatar)) {
      avatarImg = await loadImage(playerInfo.avatar);
    }
  } catch {}

  const avBorderGrad = ctx.createLinearGradient(
    avatarX,
    avatarY,
    avatarX + avatarSize,
    avatarY + avatarSize,
  );
  avBorderGrad.addColorStop(0, "#00e0ff");
  avBorderGrad.addColorStop(1, "#ff007f");
  ctx.fillStyle = avBorderGrad;
  ctx.shadowColor = "rgba(0,0,0,0.6)";
  ctx.shadowBlur = 40;
  ctx.shadowOffsetY = 15;
  ctx.beginPath();
  ctx.arc(cx, cy, avatarSize / 2 + 8, 0, Math.PI * 2);
  ctx.fill();
  ctx.shadowColor = "transparent";
  ctx.shadowBlur = 0;
  ctx.shadowOffsetY = 0;

  ctx.fillStyle = "#1a1a24";
  ctx.beginPath();
  ctx.arc(cx, cy, avatarSize / 2 + 2, 0, Math.PI * 2);
  ctx.fill();

  if (avatarImg) {
    ctx.save();
    ctx.beginPath();
    ctx.arc(cx, cy, avatarSize / 2, 0, Math.PI * 2);
    ctx.clip();
    ctx.drawImage(avatarImg, avatarX, avatarY, avatarSize, avatarSize);
    ctx.restore();
  } else {
    ctx.fillStyle = "#333";
    ctx.beginPath();
    ctx.arc(cx, cy, avatarSize / 2, 0, Math.PI * 2);
    ctx.fill();
  }

  // Name below avatar
  let leftTextY = avatarY + avatarSize + 60;
  ctx.textAlign = "center";
  ctx.fillStyle = "#fff";
  ctx.font = "bold 40px Tahoma";
  ctx.fillText(nameLine1, cx, leftTextY);
  if (nameLine2) {
    leftTextY += 45;
    ctx.fillText(nameLine2, cx, leftTextY);
  }

  // Device badges (3 mini boxes always shown, active = bright, inactive = dim)
  {
    leftTextY += 42;
    const devices = [
      { label: "Mobile", active: !!playerInfo.isActive },
      { label: "PC", active: !!playerInfo.isActivePC },
      { label: "Web", active: !!playerInfo.isActiveWeb },
    ];
    const badgeW = 100;
    const badgeH = 38;
    const badgeGap = 14;
    const totalBadgeW =
      devices.length * badgeW + (devices.length - 1) * badgeGap;
    const badgeStartX = cx - totalBadgeW / 2;

    ctx.font = "bold 20px Tahoma";
    for (let i = 0; i < devices.length; i++) {
      const bx = badgeStartX + i * (badgeW + badgeGap);
      const by = leftTextY;
      const { label, active } = devices[i];

      // Box fill
      ctx.fillStyle = active
        ? "rgba(0,224,255,0.15)"
        : "rgba(255,255,255,0.04)";
      ctx.beginPath();
      ctx.moveTo(bx + 10, by);
      ctx.lineTo(bx + badgeW - 10, by);
      ctx.quadraticCurveTo(bx + badgeW, by, bx + badgeW, by + 10);
      ctx.lineTo(bx + badgeW, by + badgeH - 10);
      ctx.quadraticCurveTo(
        bx + badgeW,
        by + badgeH,
        bx + badgeW - 10,
        by + badgeH,
      );
      ctx.lineTo(bx + 10, by + badgeH);
      ctx.quadraticCurveTo(bx, by + badgeH, bx, by + badgeH - 10);
      ctx.lineTo(bx, by + 10);
      ctx.quadraticCurveTo(bx, by, bx + 10, by);
      ctx.closePath();
      ctx.fill();

      // Box stroke
      ctx.strokeStyle = active
        ? "rgba(0,224,255,0.6)"
        : "rgba(255,255,255,0.10)";
      ctx.lineWidth = 1.5;
      ctx.stroke();

      // Label text
      ctx.textAlign = "center";
      ctx.fillStyle = active ? "#00e0ff" : "rgba(255,255,255,0.25)";
      ctx.fillText(label, bx + badgeW / 2, by + badgeH / 2 + 7);
    }
    leftTextY += badgeH;
  }

  // 4. Grid boxes (2-col × 4 rows = 8 fields)
  const dataFields = [
    {
      label: "🆔 TÊN ĐĂNG NHẬP",
      value: playerInfo.account || "N/A",
      color: "#00e0ff",
    },
    {
      label: "💰 SỐ DƯ HIỆN TẠI",
      value: formatCurrency(playerInfo.balance) + " VNĐ",
      color: "#ffd700",
    },
    {
      label: "🏆 TỔNG THẮNG",
      value: formatCurrency(playerInfo.totalWinnings) + " VNĐ",
      color: "#00e0ff",
    },
    {
      label: "💸 TỔNG THUA",
      value: formatCurrency(playerInfo.totalLosses) + " VNĐ",
      color: "#ff007f",
    },
    {
      label: "💹 LỢI NHUẬN RÒNG",
      value: formatCurrency(playerInfo.netProfit) + " VNĐ",
      color: "#00e0ff",
    },
    {
      label: "🎮 SỐ LƯỢT CHƠI",
      value: `${playerInfo.totalGames} Games [${playerInfo.totalWinGames}W/${playerInfo.totalGames - playerInfo.totalWinGames}L]`,
      color: "#ff007f",
    },
    {
      label: "📅 NGÀY ĐĂNG KÝ",
      value: playerInfo.registrationTime || "N/A",
      color: "#ff007f",
    },
    {
      label: "🎁 NHẬN QUÀ DAILY",
      value: playerInfo.lastDailyReward || "N/A",
      color: "#ffd700",
    },
  ];

  const gridX = avatarX + avatarSize + 80;
  const colWidth = 410;
  const colGapX = 30;

  ctx.textAlign = "left";
  for (let i = 0; i < dataFields.length; i++) {
    const col = i % 2;
    const row = Math.floor(i / 2);
    const originX = gridX + col * (colWidth + colGapX);
    const originY = gridY + row * (boxHeight + gapY);

    ctx.fillStyle = "rgba(255,255,255,0.04)";
    fillRoundRect(originX, originY, colWidth, boxHeight, 18);
    ctx.strokeStyle = "rgba(255,255,255,0.06)";
    ctx.lineWidth = 1.5;
    strokeRoundRect(originX, originY, colWidth, boxHeight, 18);

    ctx.strokeStyle = dataFields[i].color;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(originX + 20, originY + 20);
    ctx.lineTo(originX + 20, originY + 85);
    ctx.stroke();

    ctx.fillStyle = dataFields[i].color;
    ctx.font = "bold 20px Tahoma";
    ctx.fillText(dataFields[i].label, originX + 35, originY + 45);

    ctx.fillStyle = "#ffffff";
    ctx.font = "bold 26px Tahoma";
    ctx.fillText(dataFields[i].value, originX + 35, originY + 86);
  }

  // 5. Win Rate box (full-width, with progress bar)
  const winRate = parseFloat(playerInfo.winRate) || 0;
  const wideBoxX = gridX;
  const wideBoxW = colWidth * 2 + colGapX;

  ctx.fillStyle = "rgba(255,255,255,0.04)";
  fillRoundRect(wideBoxX, wideBoxY, wideBoxW, wideBoxH, 18);
  ctx.strokeStyle = "rgba(255,255,255,0.06)";
  ctx.lineWidth = 1.5;
  strokeRoundRect(wideBoxX, wideBoxY, wideBoxW, wideBoxH, 18);

  ctx.strokeStyle = "#00e0ff";
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(wideBoxX + 20, wideBoxY + 20);
  ctx.lineTo(wideBoxX + 20, wideBoxY + wideBoxH - 20);
  ctx.stroke();

  ctx.fillStyle = "#00e0ff";
  ctx.font = "bold 22px Tahoma";
  ctx.textAlign = "left";
  ctx.fillText("📊 TỈ LỆ THẮNG", wideBoxX + 35, wideBoxY + 46);

  ctx.fillStyle = "#ffffff";
  ctx.font = "bold 34px Tahoma";
  ctx.textAlign = "right";
  ctx.fillText(`${winRate}%`, wideBoxX + wideBoxW - 20, wideBoxY + 46);

  const barX = wideBoxX + 20;
  const barW = wideBoxW - 40;
  const barH = 18;
  const barY = wideBoxY + 75;
  const filledW = Math.max(0, Math.min(1, winRate / 100)) * barW;

  ctx.fillStyle = "rgba(255,255,255,0.1)";
  fillRoundRect(barX, barY, barW, barH, 9);
  if (filledW > 0) {
    const barGrad = ctx.createLinearGradient(barX, 0, barX + barW, 0);
    barGrad.addColorStop(0, "#00e0ff");
    barGrad.addColorStop(1, "#ff007f");
    ctx.fillStyle = barGrad;
    fillRoundRect(barX, barY, filledW, barH, 9);
  }

  const filePath = path.resolve(`./assets/temp/user_info_${Date.now()}.png`);
  const out = fs.createWriteStream(filePath);
  const stream = canvas.createPNGStream();
  stream.pipe(out);
  return new Promise((resolve, reject) => {
    out.on("finish", () => resolve(filePath));
    out.on("error", reject);
  });
}

/* ------------------------------------------------------------------ */
/*  Helpers cho createBotInfoImage (thiết kế flat card, nhiều màu)     */
/* ------------------------------------------------------------------ */

function fillRoundRect(ctx, x, y, w, h, radius) {
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.lineTo(x + w - radius, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + radius);
  ctx.lineTo(x + w, y + h - radius);
  ctx.quadraticCurveTo(x + w, y + h, x + w - radius, y + h);
  ctx.lineTo(x + radius, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - radius);
  ctx.lineTo(x, y + radius);
  ctx.quadraticCurveTo(x, y, x + radius, y);
  ctx.closePath();
  ctx.fill();
}

function strokeRoundRect(ctx, x, y, w, h, radius) {
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.arcTo(x + w, y, x + w, y + h, radius);
  ctx.arcTo(x + w, y + h, x, y + h, radius);
  ctx.arcTo(x, y + h, x, y, radius);
  ctx.arcTo(x, y, x + w, y, radius);
  ctx.stroke();
}

/** Parse chuỗi dạng "3.6 GB / 8.0 GB (Free 4.4 GB)" hoặc "347.7 MB on 511.02 MB (Mem)" */
function parseUsedTotal(str) {
  if (!str) return { used: 0, total: 0, ratio: 0, text: "N/A" };
  const m = String(str).match(
    /([\d.]+)\s*(GB|MB)\s*(?:\/|on)\s*([\d.]+)\s*(GB|MB)/i,
  );
  if (!m) return { used: 0, total: 0, ratio: 0, text: str };

  let used = parseFloat(m[1]);
  let total = parseFloat(m[3]);
  const unitUsed = m[2].toUpperCase();
  const unitTotal = m[4].toUpperCase();

  if (unitUsed !== unitTotal) {
    if (unitUsed === "MB" && unitTotal === "GB") used /= 1024;
    if (unitUsed === "GB" && unitTotal === "MB") total /= 1024;
  }

  const ratio = total > 0 ? Math.max(0, Math.min(1, used / total)) : 0;
  const text = `${m[1]} ${m[2]} / ${m[3]} ${m[4]}`;
  return { used, total, ratio, text };
}

/** Parse "5.9 GB (Sent) / 8.8 GB (Received)" -> { sent, received } */
function parseTraffic(str) {
  if (!str) return { sent: "N/A", received: "N/A" };
  const m = String(str).match(
    /([\d.]+\s*(?:GB|MB))\s*\(Sent\)\s*\/\s*([\d.]+\s*(?:GB|MB))\s*\(Received\)/i,
  );
  if (!m) return { sent: str, received: "" };
  return { sent: m[1], received: m[2] };
}

/**
 * Vẽ một icon vector đơn giản (không dùng emoji, tránh lỗi font/canvas
 * không render được glyph emoji khiến chữ bị chồng lên nhau).
 * type: 'shield' | 'cpu' | 'os' | 'clock' | 'tag' | 'ram' | 'disk' | 'box' | 'net'
 */
function drawIcon(ctx, type, cx, cy, size, color) {
  ctx.save();
  ctx.strokeStyle = color;
  ctx.fillStyle = color;
  ctx.lineWidth = Math.max(1.5, size * 0.12);
  ctx.lineJoin = "round";
  ctx.lineCap = "round";
  const s = size;

  switch (type) {
    case "shield": {
      ctx.beginPath();
      ctx.moveTo(cx, cy - s * 0.55);
      ctx.lineTo(cx + s * 0.5, cy - s * 0.3);
      ctx.lineTo(cx + s * 0.5, cy + s * 0.12);
      ctx.quadraticCurveTo(cx + s * 0.5, cy + s * 0.5, cx, cy + s * 0.6);
      ctx.quadraticCurveTo(cx - s * 0.5, cy + s * 0.5, cx - s * 0.5, cy + s * 0.12);
      ctx.lineTo(cx - s * 0.5, cy - s * 0.3);
      ctx.closePath();
      ctx.stroke();
      break;
    }
    case "cpu": {
      const half = s * 0.32;
      ctx.strokeRect(cx - half, cy - half, half * 2, half * 2);
      const legs = 3;
      for (let i = -legs; i <= legs; i += 2) {
        const off = (i / (legs * 2)) * half * 1.6;
        ctx.beginPath();
        ctx.moveTo(cx + off, cy - half);
        ctx.lineTo(cx + off, cy - half - s * 0.16);
        ctx.moveTo(cx + off, cy + half);
        ctx.lineTo(cx + off, cy + half + s * 0.16);
        ctx.moveTo(cx - half, cy + off);
        ctx.lineTo(cx - half - s * 0.16, cy + off);
        ctx.moveTo(cx + half, cy + off);
        ctx.lineTo(cx + half + s * 0.16, cy + off);
        ctx.stroke();
      }
      ctx.beginPath();
      ctx.rect(cx - half * 0.4, cy - half * 0.4, half * 0.8, half * 0.8);
      ctx.fill();
      break;
    }
    case "os": {
      ctx.strokeRect(cx - s * 0.5, cy - s * 0.36, s, s * 0.62);
      ctx.beginPath();
      ctx.moveTo(cx - s * 0.22, cy + s * 0.42);
      ctx.lineTo(cx + s * 0.22, cy + s * 0.42);
      ctx.stroke();
      break;
    }
    case "clock": {
      ctx.beginPath();
      ctx.arc(cx, cy, s * 0.5, 0, Math.PI * 2);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.lineTo(cx, cy - s * 0.3);
      ctx.moveTo(cx, cy);
      ctx.lineTo(cx + s * 0.22, cy + s * 0.1);
      ctx.stroke();
      break;
    }
    case "tag": {
      ctx.beginPath();
      ctx.moveTo(cx - s * 0.5, cy - s * 0.15);
      ctx.lineTo(cx + s * 0.1, cy - s * 0.5);
      ctx.lineTo(cx + s * 0.5, cy - s * 0.1);
      ctx.lineTo(cx - s * 0.1, cy + s * 0.5);
      ctx.closePath();
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(cx - s * 0.2, cy - s * 0.28, s * 0.08, 0, Math.PI * 2);
      ctx.fill();
      break;
    }
    case "ram": {
      ctx.strokeRect(cx - s * 0.5, cy - s * 0.3, s, s * 0.6);
      for (let i = 0; i < 4; i++) {
        const x = cx - s * 0.35 + i * (s * 0.23);
        ctx.beginPath();
        ctx.moveTo(x, cy + s * 0.3);
        ctx.lineTo(x, cy + s * 0.44);
        ctx.stroke();
      }
      break;
    }
    case "disk": {
      ctx.beginPath();
      ctx.ellipse(cx, cy, s * 0.5, s * 0.32, 0, 0, Math.PI * 2);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(cx, cy, s * 0.1, 0, Math.PI * 2);
      ctx.fill();
      break;
    }
    case "box": {
      ctx.strokeRect(cx - s * 0.45, cy - s * 0.35, s * 0.9, s * 0.7);
      ctx.beginPath();
      ctx.moveTo(cx - s * 0.45, cy - s * 0.05);
      ctx.lineTo(cx + s * 0.45, cy - s * 0.05);
      ctx.stroke();
      break;
    }
    case "net": {
      ctx.beginPath();
      ctx.arc(cx, cy + s * 0.15, s * 0.08, 0, Math.PI * 2);
      ctx.fill();
      for (let r = 1; r <= 3; r++) {
        ctx.beginPath();
        ctx.arc(cx, cy + s * 0.15, r * s * 0.16, Math.PI * 1.15, Math.PI * 1.85);
        ctx.stroke();
      }
      break;
    }
    default:
      break;
  }
  ctx.restore();
}

/* ------------------------------------------------------------------ */
/*  createBotInfoImage - flat card, không nền xám bao ngoài            */
/* ------------------------------------------------------------------ */

export async function createBotInfoImage(api, botInfo, uptime, botStats) {
  const WIDTH = 1080;
  const HEIGHT = 1400;
  const PAD = 48;
  const GAP = 18;
  const canvas = new SkiaCanvas(WIDTH, HEIGHT);
  const ctx = canvas.getContext("2d");

  const COLORS = {
    bgTop: "#07111F",
    bgBottom: "#0B1626",
    panel: "#101E30",
    panelAlt: "#0D1A2A",
    border: "rgba(148, 163, 184, 0.18)",
    text: "#F8FAFC",
    secondary: "#A8B5C7",
    muted: "#718096",
    cyan: "#22D3EE",
    blue: "#60A5FA",
    violet: "#A78BFA",
    green: "#34D399",
    amber: "#FBBF24",
  };

  const serverName = api?.apiManager ? getNameServer(api) : "Hệ thống Bot";
  const botName = botInfo?.zaloName || botInfo?.name || "Zalo Bot";
  const ram = parseUsedTotal(botStats?.ram);
  const disk = parseUsedTotal(botStats?.disk);
  const memory = parseUsedTotal(botStats?.memoryUsage);
  const traffic = parseTraffic(botStats?.network?.traffic);
  const cpuMatch = String(botStats?.cpu || "").match(/Utilization\s+([\d.]+)%/i);
  const cpuPercent = cpuMatch ? Math.max(0, Math.min(100, Number(cpuMatch[1]))) : 0;
  const cpu = {
    ratio: cpuPercent / 100,
    text: `${cpuPercent.toFixed(1)}%`,
    detail: String(botStats?.cpu || "N/A").replace(/\s*-\s*Utilization\s+[\d.]+%/i, ""),
  };

  function rounded(x, y, w, h, radius, fill, stroke = COLORS.border, lineWidth = 1) {
    ctx.fillStyle = fill;
    fillRoundRect(ctx, x, y, w, h, radius);
    if (stroke) {
      ctx.strokeStyle = stroke;
      ctx.lineWidth = lineWidth;
      strokeRoundRect(ctx, x, y, w, h, radius);
    }
  }

  function fitText(value, maxWidth, font) {
    const text = String(value ?? "N/A");
    ctx.font = font;
    if (ctx.measureText(text).width <= maxWidth) return text;
    let output = text;
    while (output.length && ctx.measureText(`${output}…`).width > maxWidth) output = output.slice(0, -1);
    return `${output}…`;
  }

  function sectionTitle(index, title, y) {
    ctx.textAlign = "left";
    ctx.fillStyle = COLORS.cyan;
    ctx.font = "700 14px Arial";
    ctx.fillText(index, PAD, y);
    ctx.fillStyle = COLORS.text;
    ctx.font = "700 22px Arial";
    ctx.fillText(title.toUpperCase(), PAD + 34, y);
    ctx.strokeStyle = "rgba(148, 163, 184, 0.16)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(PAD + 220, y - 7);
    ctx.lineTo(WIDTH - PAD, y - 7);
    ctx.stroke();
  }

  function metricCard(x, y, w, icon, label, parsed, accent) {
    rounded(x, y, w, 150, 24, COLORS.panel);
    rounded(x + 20, y + 18, 48, 48, 15, `${accent}20`, `${accent}55`);
    drawIcon(ctx, icon, x + 44, y + 42, 22, accent);

    ctx.textAlign = "left";
    ctx.fillStyle = COLORS.secondary;
    ctx.font = "700 14px Arial";
    ctx.fillText(label.toUpperCase(), x + 82, y + 37);
    ctx.fillStyle = COLORS.text;
    ctx.font = "700 30px Arial";
    const percent = `${Math.round(Math.max(0, Math.min(1, parsed.ratio || 0)) * 100)}%`;
    ctx.fillText(percent, x + 82, y + 65);

    ctx.fillStyle = COLORS.secondary;
    ctx.font = "600 16px Arial";
    ctx.fillText(fitText(parsed.text || parsed.detail || "N/A", w - 40, "600 16px Arial"), x + 20, y + 96);
    rounded(x + 20, y + 116, w - 40, 8, 4, "#1F3045", null);
    const fillWidth = Math.max(8, (w - 40) * Math.max(0, Math.min(1, parsed.ratio || 0)));
    const progress = ctx.createLinearGradient(x + 20, 0, x + w - 20, 0);
    progress.addColorStop(0, accent);
    progress.addColorStop(1, COLORS.cyan);
    rounded(x + 20, y + 116, fillWidth, 8, 4, progress, null);
  }

  function infoRow(y, icon, label, rawValue, accent, last = false) {
    const iconX = PAD + 34;
    rounded(iconX, y + 12, 44, 44, 14, `${accent}18`, `${accent}45`);
    drawIcon(ctx, icon, iconX + 22, y + 34, 19, accent);
    ctx.textAlign = "left";
    ctx.fillStyle = COLORS.muted;
    ctx.font = "700 13px Arial";
    ctx.fillText(label.toUpperCase(), iconX + 60, y + 29);
    ctx.fillStyle = COLORS.text;
    ctx.font = "600 18px Arial";
    ctx.textAlign = "right";
    ctx.fillText(fitText(rawValue, 650, "600 18px Arial"), WIDTH - PAD - 26, y + 48);
    if (!last) {
      ctx.strokeStyle = "rgba(148, 163, 184, 0.10)";
      ctx.beginPath();
      ctx.moveTo(PAD + 26, y + 68);
      ctx.lineTo(WIDTH - PAD - 26, y + 68);
      ctx.stroke();
    }
  }

  // Background nhiều lớp và lưới mờ.
  const background = ctx.createLinearGradient(0, 0, WIDTH, HEIGHT);
  background.addColorStop(0, COLORS.bgTop);
  background.addColorStop(1, COLORS.bgBottom);
  ctx.fillStyle = background;
  ctx.fillRect(0, 0, WIDTH, HEIGHT);
  const glow = ctx.createRadialGradient(820, 120, 20, 820, 120, 650);
  glow.addColorStop(0, "rgba(34, 211, 238, 0.14)");
  glow.addColorStop(1, "rgba(34, 211, 238, 0)");
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, WIDTH, 760);
  ctx.strokeStyle = "rgba(148, 163, 184, 0.035)";
  ctx.lineWidth = 1;
  for (let x = 0; x <= WIDTH; x += 54) {
    ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, HEIGHT); ctx.stroke();
  }
  for (let y = 0; y <= HEIGHT; y += 54) {
    ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(WIDTH, y); ctx.stroke();
  }

  // Header.
  const headerGradient = ctx.createLinearGradient(PAD, 38, WIDTH - PAD, 230);
  headerGradient.addColorStop(0, "rgba(22, 38, 62, 0.98)");
  headerGradient.addColorStop(1, "rgba(13, 37, 53, 0.96)");
  rounded(PAD, 38, WIDTH - PAD * 2, 192, 30, headerGradient, "rgba(34, 211, 238, 0.28)", 1.5);

  const avatarSize = 116;
  const avatarX = PAD + 28;
  const avatarY = 76;
  let avatar = null;
  try {
    if (botInfo?.avatar && cv.isValidUrl(botInfo.avatar)) avatar = await loadSkiaImage(botInfo.avatar);
  } catch {}
  ctx.beginPath();
  ctx.arc(avatarX + avatarSize / 2, avatarY + avatarSize / 2, avatarSize / 2 + 5, 0, Math.PI * 2);
  ctx.fillStyle = COLORS.cyan;
  ctx.fill();
  ctx.save();
  ctx.beginPath();
  ctx.arc(avatarX + avatarSize / 2, avatarY + avatarSize / 2, avatarSize / 2, 0, Math.PI * 2);
  ctx.clip();
  if (avatar) ctx.drawImage(avatar, avatarX, avatarY, avatarSize, avatarSize);
  else {
    const avatarGradient = ctx.createLinearGradient(avatarX, avatarY, avatarX + avatarSize, avatarY + avatarSize);
    avatarGradient.addColorStop(0, "#155E75");
    avatarGradient.addColorStop(1, "#312E81");
    ctx.fillStyle = avatarGradient;
    ctx.fillRect(avatarX, avatarY, avatarSize, avatarSize);
    ctx.fillStyle = COLORS.text;
    ctx.font = "700 48px Arial";
    ctx.textAlign = "center";
    ctx.fillText("B", avatarX + avatarSize / 2, avatarY + 76);
  }
  ctx.restore();

  const headerX = avatarX + avatarSize + 30;
  ctx.textAlign = "left";
  ctx.fillStyle = COLORS.cyan;
  ctx.font = "700 14px Arial";
  ctx.fillText("BOT CONTROL CENTER", headerX, 91);
  ctx.fillStyle = COLORS.text;
  ctx.font = "700 38px Arial";
  ctx.fillText(fitText(botName, 560, "700 38px Arial"), headerX, 137);

  ctx.fillStyle = COLORS.secondary;
  ctx.font = "600 15px Arial";
  ctx.fillText(`UPTIME · ${fitText(uptime || "N/A", 500, "600 15px Arial")}`, headerX, 178);

  rounded(WIDTH - PAD - 124, 66, 94, 38, 19, "rgba(96, 165, 250, 0.13)", "rgba(96, 165, 250, 0.35)");
  ctx.fillStyle = "#BFDBFE";
  ctx.font = "700 13px Arial";
  ctx.textAlign = "center";
  ctx.fillText(`v${botStats?.version || "N/A"}`, WIDTH - PAD - 77, 90);

  sectionTitle("01", "Tài nguyên trực tiếp", 278);
  const metricWidth = (WIDTH - PAD * 2 - GAP) / 2;
  metricCard(PAD, 306, metricWidth, "cpu", "CPU", cpu, COLORS.cyan);
  metricCard(PAD + metricWidth + GAP, 306, metricWidth, "ram", "RAM hệ thống", ram, COLORS.green);
  metricCard(PAD, 474, metricWidth, "disk", "Ổ đĩa", disk, COLORS.amber);
  metricCard(PAD + metricWidth + GAP, 474, metricWidth, "box", "Bộ nhớ bot", memory, COLORS.violet);

  sectionTitle("02", "Thông tin vận hành", 686);
  rounded(PAD, 714, WIDTH - PAD * 2, 374, 26, COLORS.panelAlt);
  const rows = [
    ["shield", "Tên đại diện", serverName, COLORS.green],
    ["cpu", "Bộ xử lý", botStats?.cpuModel || "N/A", COLORS.cyan],
    ["os", "Hệ điều hành", botStats?.os || "N/A", COLORS.blue],
    ["box", "Tiến trình", botStats?.processes || "N/A", COLORS.violet],
    ["clock", "Uptime hệ thống", botStats?.uptimeOS || "N/A", COLORS.amber],
  ];
  rows.forEach(([icon, label, rowValue, accent], index) => {
    infoRow(726 + index * 70, icon, label, rowValue, accent, index === rows.length - 1);
  });

  sectionTitle("03", "Kết nối mạng", 1142);
  rounded(PAD, 1170, WIDTH - PAD * 2, 168, 26, "#0C2030", "rgba(34, 211, 238, 0.22)");
  const net = botStats?.network || {};
  const networkFields = [
    ["Giao diện", net.interface || "N/A", COLORS.cyan],
    ["Loại kết nối", net.type || "N/A", COLORS.blue],
    ["Đã gửi", traffic.sent || "N/A", COLORS.violet],
    ["Đã nhận", traffic.received || "N/A", COLORS.green],
  ];
  const networkColWidth = (WIDTH - PAD * 2 - 56) / 2;
  networkFields.forEach(([label, rawValue, accent], index) => {
    const col = index % 2;
    const row = Math.floor(index / 2);
    const x = PAD + 28 + col * (networkColWidth + 18);
    const y = 1206 + row * 66;
    ctx.fillStyle = accent;
    ctx.beginPath(); ctx.arc(x + 5, y - 4, 5, 0, Math.PI * 2); ctx.fill();
    ctx.textAlign = "left";
    ctx.fillStyle = COLORS.muted;
    ctx.font = "700 12px Arial";
    ctx.fillText(label.toUpperCase(), x + 18, y);
    ctx.fillStyle = COLORS.text;
    ctx.font = "600 18px Arial";
    ctx.fillText(fitText(rawValue, networkColWidth - 20, "600 18px Arial"), x, y + 27);
  });

  ctx.fillStyle = COLORS.muted;
  ctx.font = "700 12px Arial";
  ctx.textAlign = "left";
  ctx.fillText("NGHUNG / LIVE SYSTEM METRICS", PAD, 1372);
  ctx.textAlign = "right";
  ctx.fillText(
    new Date().toLocaleString("vi-VN", { timeZone: "Asia/Ho_Chi_Minh", hour12: false }),
    WIDTH - PAD,
    1372
  );

  const filePath = path.resolve(`./assets/temp/bot_info_${Date.now()}.png`);
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  await fs.promises.writeFile(filePath, await canvas.toBuffer("png"));
  return filePath;
}

async function createBotInfoImageLegacy(api, botInfo, uptime, botStats) {
  const WIDTH = 1000;
  const PAD = 32;

  let serverName = "Hệ thống Bot";
  if (api && api.apiManager) {
    serverName = getNameServer(api);
  }

  /* ---- Colour tokens (flat palette) ---- */
  const COL = {
    cardBg: "#FFFFFF",
    cardBorder: "#E4E4DE",
    textPrimary: "#1F1F1D",
    textSecondary: "#6B6B66",
    textMuted: "#9A9A93",
    divider: "#EFEFEA",

    blueBg: "#E6F1FB",
    blueLabel: "#185FA5",
    blueValue: "#042C53",
    blueTrack: "#B5D4F4",
    blueFill: "#185FA5",

    greenBg: "#EAF3DE",
    greenLabel: "#3B6D11",
    greenValue: "#173404",
    greenTrack: "#C0DD97",
    greenFill: "#3B6D11",

    amberBg: "#FAEEDA",
    amberLabel: "#854F0B",
    amberValue: "#412402",
    amberTrack: "#F4D9A8",
    amberFill: "#854F0B",

    pinkBg: "#FBEAF0",
    pinkLabel: "#993556",
    pinkValue: "#4B1528",

    coral: "#D85A30",
    purple: "#7F77DD",
    pink: "#D4537E",
    teal: "#1D9E75",
    gray: "#888780",

    online: "#1D9E75",
  };

  const X = PAD;
  const contentW = WIDTH - PAD * 2;
  const R = WIDTH - PAD;

  /* ---- Layout: tính trước để biết chiều cao canvas ---- */
  let y = PAD;

  const headerH = 128;
  y += headerH;

  const sectionGap = 28;
  y += sectionGap;

  const sectionTitleH = 30;
  const dualCardH = 118;
  const dualCardGap = 16;
  const wideBarH = 74;
  const innerGap = 14;

  const storageBlockTop = y;
  y += sectionTitleH + dualCardH + innerGap + wideBarH;

  y += sectionGap;

  const cpuValueText = `${botStats?.cpuModel || "N/A"}  ·  ${botStats?.cpu || "N/A"}`;
  const perfTitleTop = y;
  y += sectionTitleH;
  const perfRows = [
    { icon: "shield", color: COL.teal, label: "Tên đại diện", value: serverName },
    { icon: "cpu", color: COL.coral, label: "CPU", value: cpuValueText },
    { icon: "os", color: COL.purple, label: "Hệ điều hành", value: botStats?.os || "N/A" },
    { icon: "clock", color: COL.pink, label: "Uptime hệ thống", value: botStats?.uptimeOS || "N/A" },
    { icon: "tag", color: COL.gray, label: "Phiên bản", value: botStats?.version || "N/A" },
  ];
  const baseRowH = 58;
  const wrapRowH = 78; // hàng có giá trị dài phải xuống dòng riêng để không đè lên nhãn
  const maxValueWidthGuess = contentW - 260; // ước lượng để quyết định wrap
  const measureCtxTmp = new SkiaCanvas(10, 10).getContext("2d");
  measureCtxTmp.font = "bold 22px Tahoma";
  const rowHeights = perfRows.map((r) => {
    const w = measureCtxTmp.measureText(String(r.value)).width;
    return w > maxValueWidthGuess ? wrapRowH : baseRowH;
  });
  const perfTop = y;
  y += rowHeights.reduce((a, b) => a + b, 0);

  y += sectionGap;

  const netTitleTop = y;
  y += sectionTitleH;
  const netCardH = 150;
  const netTop = y;
  y += netCardH;

  const totalHeight = y + PAD;

  // node-canvas 2.x có thể render toàn màu đen trên Node 24.
  // Dùng Skia riêng cho ảnh detail để output ổn định.
  const canvas = new SkiaCanvas(WIDTH, totalHeight);
  const ctx = canvas.getContext("2d");

  /* ---- Nền sáng hiện đại ---- */
  const pageGradient = ctx.createLinearGradient(0, 0, WIDTH, totalHeight);
  pageGradient.addColorStop(0, "#EEF2FF");
  pageGradient.addColorStop(0.55, "#F8FAFC");
  pageGradient.addColorStop(1, "#ECFEFF");
  ctx.fillStyle = pageGradient;
  ctx.fillRect(0, 0, WIDTH, totalHeight);

  /* ================== HEADER ================== */
  {
    const avatarSize = 84;
    const avatarX = X;
    const avatarY = PAD;

    const headerGradient = ctx.createLinearGradient(X, avatarY, R, avatarY + 110);
    headerGradient.addColorStop(0, "#4F46E5");
    headerGradient.addColorStop(0.55, "#7C3AED");
    headerGradient.addColorStop(1, "#0891B2");
    ctx.fillStyle = headerGradient;
    fillRoundRect(ctx, X - 12, avatarY - 12, contentW + 24, 116, 26);

    const avGrad = ctx.createLinearGradient(avatarX, avatarY, avatarX + avatarSize, avatarY + avatarSize);
    avGrad.addColorStop(0, "#E6F1FB");
    avGrad.addColorStop(1, "#D7E9FB");
    ctx.fillStyle = avGrad;
    fillRoundRect(ctx, avatarX, avatarY, avatarSize, avatarSize, 20);

    let avatarImg = null;
    try {
      if (botInfo?.avatar && cv.isValidUrl(botInfo.avatar)) {
        avatarImg = await loadSkiaImage(botInfo.avatar);
      }
    } catch {}

    if (avatarImg) {
      ctx.save();
      const r = 20;
      ctx.beginPath();
      ctx.moveTo(avatarX + r, avatarY);
      ctx.arcTo(avatarX + avatarSize, avatarY, avatarX + avatarSize, avatarY + avatarSize, r);
      ctx.arcTo(avatarX + avatarSize, avatarY + avatarSize, avatarX, avatarY + avatarSize, r);
      ctx.arcTo(avatarX, avatarY + avatarSize, avatarX, avatarY, r);
      ctx.arcTo(avatarX, avatarY, avatarX + avatarSize, avatarY, r);
      ctx.closePath();
      ctx.clip();
      ctx.drawImage(avatarImg, avatarX, avatarY, avatarSize, avatarSize);
      ctx.restore();
    } else {
      drawIcon(ctx, "shield", avatarX + avatarSize / 2, avatarY + avatarSize / 2, avatarSize * 0.55, COL.blueLabel);
    }

    const nameX = avatarX + avatarSize + 20;
    ctx.textAlign = "left";
    ctx.fillStyle = "#FFFFFF";
    ctx.font = "bold 32px Tahoma";
    ctx.fillText(botInfo?.zaloName || "Không có tên", nameX, avatarY + 38);

    const dotY = avatarY + 66;
    ctx.fillStyle = COL.online;
    ctx.beginPath();
    ctx.arc(nameX + 5, dotY - 5, 5, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = "rgba(255,255,255,.82)";
    ctx.font = "22px Tahoma";
    ctx.fillText(`Đang hoạt động  ·  ${uptime || "N/A"}`, nameX + 18, dotY);

    // Đường kẻ phân tách dưới header
    ctx.strokeStyle = "rgba(255,255,255,.3)";
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(X, avatarY + headerH - sectionGap / 2);
    ctx.lineTo(R, avatarY + headerH - sectionGap / 2);
    ctx.stroke();
  }

  /* ============ BỘ NHỚ & LƯU TRỮ ============ */
  {
    ctx.textAlign = "left";
    ctx.fillStyle = COL.textMuted;
    ctx.font = "bold 20px Tahoma";
    ctx.fillText("BỘ NHỚ & LƯU TRỮ", X, storageBlockTop + 20);

    const cardsY = storageBlockTop + sectionTitleH;
    const cardW = (contentW - dualCardGap) / 2;

    const ram = parseUsedTotal(botStats?.ram);
    const disk = parseUsedTotal(botStats?.disk);

    function drawStatCard(cx, label, iconType, valueText, ratio, colors) {
      ctx.fillStyle = colors.bg;
      fillRoundRect(ctx, cx, cardsY, cardW, dualCardH, 16);

      drawIcon(ctx, iconType, cx + 30, cardsY + 30, 22, colors.label);

      ctx.fillStyle = colors.label;
      ctx.font = "bold 18px Tahoma";
      ctx.fillText(label, cx + 52, cardsY + 36);

      ctx.fillStyle = colors.value;
      ctx.font = "bold 26px Tahoma";
      ctx.fillText(valueText, cx + 20, cardsY + 70);

      const barX = cx + 20;
      const barW = cardW - 40;
      const barY = cardsY + 88;
      const barH = 8;
      ctx.fillStyle = colors.track;
      fillRoundRect(ctx, barX, barY, barW, barH, 4);
      ctx.fillStyle = colors.fill;
      fillRoundRect(ctx, barX, barY, Math.max(6, barW * ratio), barH, 4);
    }

    drawStatCard(X, "RAM", "ram", ram.text, ram.ratio, {
      bg: COL.blueBg,
      label: COL.blueLabel,
      value: COL.blueValue,
      track: COL.blueTrack,
      fill: COL.blueFill,
    });

    drawStatCard(X + cardW + dualCardGap, "Ổ đĩa", "disk", disk.text, disk.ratio, {
      bg: COL.greenBg,
      label: COL.greenLabel,
      value: COL.greenValue,
      track: COL.greenTrack,
      fill: COL.greenFill,
    });

    const memY = cardsY + dualCardH + innerGap;
    const mem = parseUsedTotal(botStats?.memoryUsage);
    ctx.fillStyle = COL.amberBg;
    fillRoundRect(ctx, X, memY, contentW, wideBarH, 16);

    drawIcon(ctx, "box", X + 30, memY + 24, 20, COL.amberLabel);
    ctx.fillStyle = COL.amberLabel;
    ctx.font = "bold 18px Tahoma";
    ctx.fillText("Bộ nhớ bot sử dụng", X + 52, memY + 30);

    ctx.fillStyle = COL.amberValue;
    ctx.font = "bold 20px Tahoma";
    ctx.textAlign = "right";
    ctx.fillText(mem.text, R - 20, memY + 30);
    ctx.textAlign = "left";

    const mbarX = X + 20;
    const mbarW = contentW - 40;
    const mbarY = memY + 46;
    ctx.fillStyle = COL.amberTrack;
    fillRoundRect(ctx, mbarX, mbarY, mbarW, 8, 4);
    ctx.fillStyle = COL.amberFill;
    fillRoundRect(ctx, mbarX, mbarY, Math.max(6, mbarW * mem.ratio), 8, 4);
  }

  /* ================== HIỆU NĂNG ================== */
  {
    ctx.fillStyle = COL.textMuted;
    ctx.font = "bold 20px Tahoma";
    ctx.fillText("HIỆU NĂNG", X, perfTitleTop + 20);

    let rowY = perfTop;
    perfRows.forEach((row, i) => {
      const rh = rowHeights[i];
      const wraps = rh === wrapRowH;
      const midY = wraps ? rowY + 26 : rowY + rh / 2;

      drawIcon(ctx, row.icon, X + 12, midY, 18, row.color);

      ctx.textAlign = "left";
      ctx.fillStyle = COL.textSecondary;
      ctx.font = "22px Tahoma";
      ctx.fillText(row.label, X + 32, midY + 7);

      ctx.fillStyle = COL.textPrimary;
      ctx.font = "bold 22px Tahoma";
      if (wraps) {
        ctx.textAlign = "left";
        ctx.fillText(String(row.value), X + 32, midY + 34);
      } else {
        ctx.textAlign = "right";
        ctx.fillText(String(row.value), R, midY + 7);
      }
      ctx.textAlign = "left";

      if (i < perfRows.length - 1) {
        ctx.strokeStyle = COL.divider;
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(X, rowY + rh);
        ctx.lineTo(R, rowY + rh);
        ctx.stroke();
      }
      rowY += rh;
    });
  }

  /* ================== MẠNG ================== */
  {
    ctx.fillStyle = COL.textMuted;
    ctx.font = "bold 20px Tahoma";
    ctx.fillText("MẠNG", X, netTitleTop + 20);

    const cardY = netTitleTop + sectionTitleH;
    ctx.fillStyle = COL.pinkBg;
    fillRoundRect(ctx, X, cardY, contentW, netCardH, 16);

    const traffic = parseTraffic(botStats?.network?.traffic);
    const fields = [
      { label: "Giao diện", value: botStats?.network?.interface || "N/A" },
      { label: "Kết nối", value: `${botStats?.network?.type || "N/A"}` },
      { label: "Đã gửi", value: traffic.sent },
      { label: "Đã nhận", value: traffic.received },
    ];

    const colW = contentW / 2;
    const rowH = netCardH / 2;
    fields.forEach((f, i) => {
      const col = i % 2;
      const row = Math.floor(i / 2);
      const fx = X + 24 + col * colW;
      const fy = cardY + 30 + row * rowH;

      ctx.fillStyle = COL.pinkLabel;
      ctx.font = "18px Tahoma";
      ctx.fillText(f.label, fx, fy);

      ctx.fillStyle = COL.pinkValue;
      ctx.font = "bold 24px Tahoma";
      ctx.fillText(f.value, fx, fy + 32);
    });
  }

  // JPEG nền trắng tránh một số client Zalo render kênh alpha PNG thành nền đen.
  const filePath = path.resolve(`./assets/temp/bot_info_${Date.now()}.jpg`);
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const output = await canvas.toBuffer("jpg", { quality: 0.94, matte: "white" });
  await fs.promises.writeFile(filePath, output);
  return filePath;
}


async function createGroupInfoImageLegacy(
  groupInfo,
  owner,
  onConfigs = [],
  offConfigs = [],
) {
  let width = 1000;
  let height = 80;
  let nowY = 60;

  const typeGroup = {
    1: "Nhóm",
    2: "Cộng đồng",
  };

  const keyTitle = {
    infogroup: `Thông tin ${typeGroup[groupInfo.groupType]}`,
    settinggroup: `Cài đặt ${typeGroup[groupInfo.groupType]}`,
    descgroup: `Mô tả ${typeGroup[groupInfo.groupType]}`,
    botconfigs: "Cấu Hình Bot",
  };

  const nameConfigGroup = {
    lockViewMember: {
      label: "Quyền xem danh sách thành viên",
      value: { 0: "Tất Cả", 1: "Chỉ Admin" },
    },
    blockName: {
      label: `Quyền sửa thông tin ${typeGroup[groupInfo.groupType]}`,
      value: { 0: "Tất Cả", 1: "Chỉ Admin" },
    },
    signAdminMsg: {
      label: `Nổi bật tin nhắn từ trưởng/phó ${typeGroup[groupInfo.groupType]}`,
      value: { 0: "Tắt", 1: "Bật" },
    },
    addMemberOnly: {
      label: `Chỉ thêm members (Khi tắt link)`,
      value: { 0: "Tắt", 1: "Bật" },
    },
    enableMsgHistory: {
      label: "Thành viên mới xem được tin gửi gần đây",
      value: { 0: "Tắt", 1: "Bật" },
    },
    lockCreatePost: {
      label: "Quyền tạo ghi chú, nhắc hẹn",
      value: { 0: "Tất Cả", 1: "Chỉ Admin" },
    },
    lockCreatePoll: {
      label: "Quyền tạo bình chọn",
      value: { 0: "Tất Cả", 1: "Chỉ Admin" },
    },
    joinAppr: {
      label: "Chế độ phê duyệt thành viên",
      value: { 0: "Tắt", 1: "Bật" },
    },
    lockSendMsg: {
      label: "Quyền gửi tin nhắn",
      value: { 0: "Tất Cả", 1: "Chỉ Admin" },
    },
  };

  let fields = [
    { label: `💾 Trưởng ${typeGroup[groupInfo.groupType]}`, value: owner.name },
    { label: "💾 Số thành viên", value: groupInfo.memberCount },
    { label: "🔢 Ngày tạo", value: groupInfo.createdTime },
  ];

  let descGroup = groupInfo.desc;
  let descLinesArray = [];

  if (descGroup !== "") {
    const descLines = [...descGroup.split("\n")];

    descLines.forEach((line) => {
      const { lines: descLines } = handleNameLong(line, 48);
      descLines.forEach((descLine) => {
        descLinesArray.push(descLine);
      });
    });
  }

  let settingGroup = [];

  for (const [key, value] of Object.entries(groupInfo.setting)) {
    if (nameConfigGroup[key]) {
      settingGroup.push({
        label: nameConfigGroup[key].label,
        value: nameConfigGroup[key].value[value],
      });
    }
  }

  let numA =
    58 +
    fields.length * 38 +
    26 +
    settingGroup.length * 38 +
    (descLinesArray.length > 0 ? descLinesArray.length * 32 + 62 : 0);
  let numB = 48 + (offConfigs.length + onConfigs.length) * 34;
  numB += offConfigs.length > 0 ? 34 : 0;
  numB += onConfigs.length > 0 ? 34 : 0;
  let maxHeight = Math.max(numA, numB);

  height = maxHeight + height;

  const bgUrl = groupInfo.fullAvt || owner.avatarFull;

  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext("2d");

  const gradient = ctx.createLinearGradient(0, 0, width, height);
  gradient.addColorStop(0, "#000814");
  gradient.addColorStop(0.5, "#001f3f");
  gradient.addColorStop(1, "#003366");

  if (bgUrl && cv.isValidUrl(bgUrl)) {
    try {
      const img = await loadImage(bgUrl);
      ctx.drawImage(img, 0, 0, width, height);
      ctx.fillStyle = gradient;
      ctx.globalAlpha = 0.8;
      ctx.fillRect(0, 0, width, height);
      ctx.globalAlpha = 1;
    } catch (err) {
      ctx.fillStyle = gradient;
      ctx.fillRect(0, 0, width, height);
    }
  } else {
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, width, height);
  }

  ctx.fillStyle = "rgba(0,0,0,0.8)";
  ctx.fillRect(0, 0, width, height);

  ctx.textAlign = "center";
  ctx.font = "bold 42px Tahoma";
  const titleText = groupInfo.name;
  const metricsTitle = ctx.measureText(titleText);
  const ascent = metricsTitle.actualBoundingBoxAscent || 36;
  const descent = metricsTitle.actualBoundingBoxDescent || 12;
  const titlePaddingY = 12;
  const bgXTitle = 10;
  const bgWTitle = width - 24;
  const bgHTitle = ascent + descent + titlePaddingY + 10;
  const bgYTitle = nowY - ascent - Math.round(titlePaddingY / 2) - 5;
  ctx.fillStyle = "rgba(255,255,255,0.06)";

  ctx.fillStyle = cv.getRandomGradient(ctx, width);
  ctx.textAlign = "center";
  ctx.fillText(titleText, width / 2, nowY);
  nowY += 30;

  const leftWidth = 620;
  const rightWidth = width - leftWidth;

  const sectionY = nowY;
  const sectionPadding = 10;
  const sectionHeight = height - sectionY - sectionPadding;

  ctx.fillStyle = "rgba(255,255,255,0.06)";
  ctx.fillRect(
    sectionPadding,
    sectionY,
    leftWidth - sectionPadding * 2,
    sectionHeight,
  );

  ctx.fillStyle = "rgba(255,255,255,0.04)";
  ctx.fillRect(
    leftWidth + Math.floor(sectionPadding / 2),
    sectionY,
    rightWidth - sectionPadding * 2,
    sectionHeight,
  );

  const leftX = sectionPadding + 16;
  const rightX = leftWidth + Math.floor(sectionPadding / 2) + 16;

  (function drawRightConfigs() {
    let cfgY = sectionY + 38;
    const dotRadius = 6;
    const fontSizeTitle = 26;
    const fontSizeItem = 20;

    const rightColX = leftWidth + Math.floor(sectionPadding / 2);
    const rightColInnerWidth = rightWidth - sectionPadding * 2;

    ctx.fillStyle = "#FFFFFF";
    ctx.font = `bold ${fontSizeTitle}px Tahoma`;
    const titleX = rightColX + rightColInnerWidth / 2;
    const titleY = sectionY + 20;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    const titleText = keyTitle.botconfigs;
    const metrics = ctx.measureText(titleText);
    const textWidth = metrics.width;
    const paddingX = 14;
    const paddingY = 8;
    const bgH = fontSizeTitle + paddingY + 2;
    const bgX = rightColX + 8;
    const bgW = rightColInnerWidth - 16;
    const bgY = titleY - bgH / 2 + 2;
    ctx.fillStyle = cv.getRandomBrightColor();
    ctx.fillText(titleText, titleX, titleY + 8);
    ctx.textBaseline = "alphabetic";
    ctx.font = `${fontSizeItem}px Tahoma`;
    cfgY = bgY + bgH + 32;
    ctx.textAlign = "left";

    if (onConfigs.length > 0) {
      ctx.font = `bold ${fontSizeItem}px Tahoma`;
      ctx.fillStyle = "rgb(87, 255, 87)";
      ctx.textAlign = "left";
      ctx.fillText("Cấu hình đang bật", rightX, cfgY);
      cfgY += 32;

      ctx.font = `${fontSizeItem}px Tahoma`;

      for (const cfg of onConfigs) {
        const dotX = rightX;
        const textX = rightX + 16;
        ctx.beginPath();
        ctx.arc(dotX, cfgY - 8, dotRadius, 0, Math.PI * 2);
        ctx.fillStyle = "rgba(0,200,0,1)";
        ctx.fill();
        ctx.fillStyle = "#FFFFFF";
        ctx.fillText(cfg, textX, cfgY);
        cfgY += 32;
      }
    }

    cfgY += 8;

    if (offConfigs.length > 0) {
      ctx.font = `bold ${fontSizeItem}px Tahoma`;
      ctx.fillStyle = "rgb(255, 61, 61)";
      ctx.textAlign = "left";
      ctx.fillText("Cấu hình đang tắt", rightX, cfgY);
      cfgY += 32;

      ctx.font = `${fontSizeItem}px Tahoma`;

      for (const cfg of offConfigs) {
        const dotX = rightX;
        const textX = rightX + 16;
        ctx.beginPath();
        ctx.arc(dotX, cfgY - 8, dotRadius, 0, Math.PI * 2);
        ctx.fillStyle = "rgba(200,0,0,1)";
        ctx.fill();
        ctx.fillStyle = "#FFFFFF";
        ctx.fillText(cfg, textX, cfgY);
        cfgY += 32;
      }
    }

    ctx.textAlign = "center";
  })();

  await (async function drawLeftContent() {
    const avatarSize = 80;
    const avatarX = sectionPadding + 30;
    const contentX = avatarX + avatarSize + 30;
    const contentRight = leftWidth - 30;
    const lineHeight = 36;
    const fieldsCount = fields.length;

    const fieldsPadding = 12;
    const fieldsBoxH = fieldsCount * lineHeight + fieldsPadding * 2;
    const fieldsBoxY = sectionY + 8;
    const fieldsBoxX = sectionPadding + 8;
    const fieldsBoxW = leftWidth - sectionPadding * 2 - 16;
    const radiusBox = 12;

    const avatarY = Math.round(fieldsBoxY + fieldsBoxH / 2 - avatarSize / 2);

    ctx.save();
    ctx.fillStyle = "rgba(255,255,255,0.05)";
    ctx.strokeStyle = "rgba(255,255,255,0.06)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(fieldsBoxX + radiusBox, fieldsBoxY);
    ctx.arcTo(
      fieldsBoxX + fieldsBoxW,
      fieldsBoxY,
      fieldsBoxX + fieldsBoxW,
      fieldsBoxY + fieldsBoxH,
      radiusBox,
    );
    ctx.arcTo(
      fieldsBoxX + fieldsBoxW,
      fieldsBoxY + fieldsBoxH,
      fieldsBoxX,
      fieldsBoxY + fieldsBoxH,
      radiusBox,
    );
    ctx.arcTo(
      fieldsBoxX,
      fieldsBoxY + fieldsBoxH,
      fieldsBoxX,
      fieldsBoxY,
      radiusBox,
    );
    ctx.arcTo(
      fieldsBoxX,
      fieldsBoxY,
      fieldsBoxX + fieldsBoxW,
      fieldsBoxY,
      radiusBox,
    );
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.restore();

    const cx = avatarX + avatarSize / 2;
    const cy = avatarY + avatarSize / 2;
    const haloRadius = Math.round(avatarSize / 2 + 20);
    const haloGrad = ctx.createRadialGradient(
      cx,
      cy,
      avatarSize / 2,
      cx,
      cy,
      haloRadius,
    );
    haloGrad.addColorStop(0, "rgba(159,178,255,0.18)");
    haloGrad.addColorStop(0.5, "rgba(62,130,255,0.10)");
    haloGrad.addColorStop(1, "rgba(0,0,0,0)");
    ctx.save();
    ctx.beginPath();
    ctx.arc(cx, cy, haloRadius, 0, Math.PI * 2);
    ctx.closePath();
    ctx.fillStyle = haloGrad;
    ctx.fill();
    ctx.restore();

    try {
      const avatarUrl = owner.avatarFull || owner.avatar;
      if (avatarUrl && cv.isValidUrl(avatarUrl)) {
        const avatarImg = await loadImage(avatarUrl);
        ctx.save();
        ctx.beginPath();
        ctx.arc(cx, cy, avatarSize / 2, 0, Math.PI * 2);
        ctx.closePath();
        ctx.clip();
        ctx.drawImage(avatarImg, avatarX, avatarY, avatarSize, avatarSize);
        ctx.restore();
      } else {
        ctx.fillStyle = "rgba(255,255,255,0.06)";
        ctx.fillRect(avatarX, avatarY, avatarSize, avatarSize);
      }
    } catch (err) {
      ctx.fillStyle = "rgba(255,255,255,0.06)";
      ctx.fillRect(avatarX, avatarY, avatarSize, avatarSize);
    }

    ctx.font = "bold 19px Tahoma";
    ctx.textBaseline = "middle";
    for (let i = 0; i < fieldsCount; i++) {
      const f = fields[i];
      const labelText = f.label + (String(f.label).endsWith(":") ? "" : ":");
      const val =
        f.value !== undefined && f.value !== null ? String(f.value) : "N/A";

      const lineCenterY =
        fieldsBoxY + fieldsPadding + lineHeight / 2 + i * lineHeight;

      ctx.textAlign = "left";
      ctx.fillStyle = cv.getRandomGradient(ctx, width);
      ctx.fillText(labelText, contentX, lineCenterY);

      ctx.textAlign = "right";
      ctx.fillStyle = "#e6f0ff";
      ctx.fillText(val, contentRight, lineCenterY);
    }

    ctx.textBaseline = "alphabetic";

    const gapBetween = 18;
    const descBoxY = fieldsBoxY + fieldsBoxH + gapBetween;
    const descCount = descLinesArray.length;
    const descTitleFont = 24;
    const descLineH = 32;
    const descPadding = 12;
    const descBoxX = fieldsBoxX;
    const descBoxW = fieldsBoxW;
    const descBoxH = descPadding * 2 + descTitleFont + descCount * descLineH;
    const descRadius = 12;
    if (descLinesArray && descLinesArray.length > 0) {
      ctx.save();
      ctx.fillStyle = "rgba(255,255,255,0.05)";
      ctx.strokeStyle = "rgba(255,255,255,0.06)";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(descBoxX + descRadius, descBoxY);
      ctx.arcTo(
        descBoxX + descBoxW,
        descBoxY,
        descBoxX + descBoxW,
        descBoxY + descBoxH,
        descRadius,
      );
      ctx.arcTo(
        descBoxX + descBoxW,
        descBoxY + descBoxH,
        descBoxX,
        descBoxY + descBoxH,
        descRadius,
      );
      ctx.arcTo(descBoxX, descBoxY + descBoxH, descBoxX, descBoxY, descRadius);
      ctx.arcTo(descBoxX, descBoxY, descBoxX + descBoxW, descBoxY, descRadius);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      ctx.restore();

      const titleX = descBoxX + descBoxW / 2;
      const titleY = descBoxY + descPadding + descTitleFont / 1.2;
      ctx.fillStyle = cv.getRandomBrightColor();
      ctx.font = `bold ${descTitleFont}px Tahoma`;
      ctx.textAlign = "center";
      ctx.fillText(keyTitle.descgroup, titleX, titleY + 2);

      ctx.font = ` ${19}px Tahoma`;
      ctx.fillStyle = "#FFFFFF";
      let lineY = titleY + descTitleFont / 2 + descPadding + 12;
      for (let i = 0; i < descCount; i++) {
        const line = descLinesArray[i];
        ctx.fillText(line, titleX, lineY + i * descLineH);
      }
      ctx.textAlign = "left";
    }

    let afterDescY = fieldsBoxY + fieldsBoxH;
    if (descLinesArray && descLinesArray.length > 0) {
      afterDescY = descBoxY + descBoxH;
    }

    if (settingGroup && settingGroup.length > 0) {
      const gapBetween2 = 18;
      const setPadding = 12;
      const setLineH = 36;
      const setCount = settingGroup.length;

      const setBoxY = afterDescY + gapBetween2;
      const setBoxX = sectionPadding + 8;
      const setBoxW = leftWidth - sectionPadding * 2 - 16;
      const setBoxH = setPadding * 2 + setCount * setLineH;
      const setRadius = 12;

      ctx.save();
      ctx.fillStyle = "rgba(255,255,255,0.05)";
      ctx.strokeStyle = "rgba(255,255,255,0.06)";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(setBoxX + setRadius, setBoxY);
      ctx.arcTo(
        setBoxX + setBoxW,
        setBoxY,
        setBoxX + setBoxW,
        setBoxY + setBoxH,
        setRadius,
      );
      ctx.arcTo(
        setBoxX + setBoxW,
        setBoxY + setBoxH,
        setBoxX,
        setBoxY + setBoxH,
        setRadius,
      );
      ctx.arcTo(setBoxX, setBoxY + setBoxH, setBoxX, setBoxY, setRadius);
      ctx.arcTo(setBoxX, setBoxY, setBoxX + setBoxW, setBoxY, setRadius);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      ctx.restore();

      ctx.font = `bold 20px Tahoma`;
      ctx.textBaseline = "middle";
      for (let i = 0; i < setCount; i++) {
        const meta = settingGroup[i];
        const label = meta.label || "";
        const valText = meta.value || "";
        const y = setBoxY + setPadding + i * setLineH + setLineH / 2;

        ctx.textAlign = "left";
        ctx.fillStyle = cv.getRandomGradient(ctx, width);
        ctx.fillText(label, setBoxX + setPadding + 8, y);

        ctx.textAlign = "right";
        ctx.fillStyle = "#FFFFFF";
        ctx.fillText(valText, setBoxX + setBoxW - setPadding - 8, y);
      }
      ctx.textBaseline = "alphabetic";
    }
  })();

  const filePath = path.resolve(`./assets/temp/group_info_${Date.now()}.png`);
  const out = fs.createWriteStream(filePath);
  const stream = canvas.createPNGStream();
  stream.pipe(out);

  return new Promise((resolve, reject) => {
    out.on("finish", () => resolve(filePath));
    out.on("error", reject);
  });
}

// Canvas thông tin nhóm V2: bố cục ổn định, màu cố định và tự giãn theo nội dung.
export async function createGroupInfoImage(groupInfo, owner, onConfigs = [], offConfigs = []) {
  const W = 1080;
  const PAD = 44;
  const GAP = 24;
  const LEFT_W = 650;
  const RIGHT_W = W - PAD * 2 - GAP - LEFT_W;
  const typeName = Number(groupInfo?.groupType) === 2 ? "Cộng đồng" : "Nhóm";
  const safe = (value, fallback = "Chưa cập nhật") => {
    const text = String(value ?? "").trim();
    return text || fallback;
  };

  const settingNames = {
    lockViewMember: ["Xem danh sách thành viên", ["Tất cả", "Chỉ quản trị viên"]],
    blockName: [`Sửa thông tin ${typeName.toLowerCase()}`, ["Tất cả", "Chỉ quản trị viên"]],
    signAdminMsg: ["Làm nổi bật tin quản trị", ["Tắt", "Bật"]],
    addMemberOnly: ["Chỉ thêm thành viên khi tắt link", ["Tắt", "Bật"]],
    enableMsgHistory: ["Xem tin nhắn gần đây", ["Tắt", "Bật"]],
    lockCreatePost: ["Tạo ghi chú, nhắc hẹn", ["Tất cả", "Chỉ quản trị viên"]],
    lockCreatePoll: ["Tạo bình chọn", ["Tất cả", "Chỉ quản trị viên"]],
    joinAppr: ["Phê duyệt thành viên", ["Tắt", "Bật"]],
    lockSendMsg: ["Gửi tin nhắn", ["Tất cả", "Chỉ quản trị viên"]],
  };
  const settings = Object.entries(groupInfo?.setting || {})
    .filter(([key]) => settingNames[key])
    .map(([key, value]) => ({ label: settingNames[key][0], value: settingNames[key][1][Number(value)] ?? safe(value) }));

  const measureCanvas = createCanvas(W, 200);
  const measureCtx = measureCanvas.getContext("2d");
  const wrapText = (text, maxWidth, font) => {
    measureCtx.font = font;
    const result = [];
    for (const paragraph of safe(text, "").split(/\r?\n/)) {
      const words = paragraph.trim().split(/\s+/).filter(Boolean);
      if (!words.length) continue;
      let line = "";
      for (const word of words) {
        const next = line ? `${line} ${word}` : word;
        if (measureCtx.measureText(next).width <= maxWidth || !line) line = next;
        else { result.push(line); line = word; }
      }
      if (line) result.push(line);
    }
    return result;
  };

  const descLines = wrapText(groupInfo?.desc, LEFT_W - 64, "21px Tahoma");
  const titleLines = wrapText(groupInfo?.name, W - PAD * 2 - 180, "bold 40px Tahoma").slice(0, 2);
  const infoH = 246;
  const descH = descLines.length ? 72 + descLines.length * 31 + 24 : 0;
  const settingsH = settings.length ? 76 + settings.length * 46 + 18 : 0;
  const leftH = infoH + (descH ? GAP + descH : 0) + (settingsH ? GAP + settingsH : 0);
  const configCount = onConfigs.length + offConfigs.length;
  const configH = 76 + (onConfigs.length ? 48 + onConfigs.length * 42 : 0) +
    (offConfigs.length ? 48 + offConfigs.length * 42 : 0) + (configCount ? 16 : 80);
  const headerH = 230 + Math.max(0, titleLines.length - 1) * 46;
  const H = Math.max(720, headerH + Math.max(leftH, configH) + 54);
  const canvas = createCanvas(W, H);
  const ctx = canvas.getContext("2d");

  const card = (x, y, w, h, fill = "#1e293b") => {
    ctx.fillStyle = fill;
    fillRoundRect(ctx, x, y, w, h, 22);
    ctx.strokeStyle = "#334155";
    ctx.lineWidth = 1.5;
    strokeRoundRect(ctx, x, y, w, h, 22);
  };
  const sectionTitle = (text, x, y, color = "#60a5fa") => {
    ctx.textAlign = "left";
    ctx.font = "bold 18px Tahoma";
    ctx.fillStyle = color;
    ctx.fillText(text.toUpperCase(), x, y);
  };
  const iconBadge = (x, y, symbol, bgColor, color = "#ffffff", size = 42) => {
    ctx.fillStyle = bgColor;
    fillRoundRect(ctx, x, y, size, size, 12);
    const cx = x + size / 2;
    const cy = y + size / 2;
    const unit = size / 42;
    ctx.save();
    ctx.strokeStyle = color;
    ctx.fillStyle = color;
    ctx.lineWidth = Math.max(2, 2.6 * unit);
    ctx.lineCap = "round";
    ctx.lineJoin = "round";

    if (symbol === "M" || symbol === "users") {
      // Hai thành viên.
      ctx.beginPath(); ctx.arc(cx - 5 * unit, cy - 6 * unit, 5 * unit, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.arc(cx + 7 * unit, cy - 4 * unit, 4 * unit, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.arc(cx - 5 * unit, cy + 10 * unit, 9 * unit, Math.PI, 0); ctx.stroke();
      ctx.beginPath(); ctx.arc(cx + 7 * unit, cy + 9 * unit, 7 * unit, Math.PI, 0); ctx.stroke();
    } else if (symbol === "N") {
      // Lịch ngày tạo.
      ctx.strokeRect(cx - 10 * unit, cy - 9 * unit, 20 * unit, 19 * unit);
      ctx.beginPath(); ctx.moveTo(cx - 10 * unit, cy - 3 * unit); ctx.lineTo(cx + 10 * unit, cy - 3 * unit); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(cx - 5 * unit, cy - 12 * unit); ctx.lineTo(cx - 5 * unit, cy - 6 * unit);
      ctx.moveTo(cx + 5 * unit, cy - 12 * unit); ctx.lineTo(cx + 5 * unit, cy - 6 * unit); ctx.stroke();
    } else if (symbol === "★") {
      // Vương miện trưởng nhóm.
      ctx.beginPath();
      ctx.moveTo(cx - 11 * unit, cy - 6 * unit); ctx.lineTo(cx - 5 * unit, cy + 7 * unit);
      ctx.lineTo(cx + 7 * unit, cy + 7 * unit); ctx.lineTo(cx + 11 * unit, cy - 6 * unit);
      ctx.lineTo(cx + 4 * unit, cy - 1 * unit); ctx.lineTo(cx, cy - 9 * unit);
      ctx.lineTo(cx - 4 * unit, cy - 1 * unit); ctx.closePath(); ctx.fill();
      ctx.fillRect(cx - 6 * unit, cy + 9 * unit, 13 * unit, 2.5 * unit);
    } else if (symbol === "✓") {
      ctx.beginPath(); ctx.moveTo(cx - 9 * unit, cy); ctx.lineTo(cx - 2 * unit, cy + 7 * unit);
      ctx.lineTo(cx + 10 * unit, cy - 8 * unit); ctx.stroke();
    } else if (symbol === "×") {
      ctx.beginPath(); ctx.moveTo(cx - 8 * unit, cy - 8 * unit); ctx.lineTo(cx + 8 * unit, cy + 8 * unit);
      ctx.moveTo(cx + 8 * unit, cy - 8 * unit); ctx.lineTo(cx - 8 * unit, cy + 8 * unit); ctx.stroke();
    } else if (symbol === "chat") {
      ctx.beginPath();
      ctx.moveTo(cx - 10 * unit, cy - 8 * unit); ctx.lineTo(cx + 10 * unit, cy - 8 * unit);
      ctx.lineTo(cx + 10 * unit, cy + 5 * unit); ctx.lineTo(cx + 1 * unit, cy + 5 * unit);
      ctx.lineTo(cx - 6 * unit, cy + 11 * unit); ctx.lineTo(cx - 5 * unit, cy + 5 * unit);
      ctx.lineTo(cx - 10 * unit, cy + 5 * unit); ctx.closePath(); ctx.stroke();
      ctx.beginPath(); ctx.arc(cx - 4 * unit, cy - 1 * unit, 1.3 * unit, 0, Math.PI * 2);
      ctx.arc(cx + 1 * unit, cy - 1 * unit, 1.3 * unit, 0, Math.PI * 2);
      ctx.arc(cx + 6 * unit, cy - 1 * unit, 1.3 * unit, 0, Math.PI * 2); ctx.fill();
    } else if (symbol === "shield") {
      ctx.beginPath(); ctx.moveTo(cx, cy - 11 * unit); ctx.lineTo(cx + 10 * unit, cy - 7 * unit);
      ctx.lineTo(cx + 8 * unit, cy + 4 * unit); ctx.quadraticCurveTo(cx, cy + 13 * unit, cx, cy + 13 * unit);
      ctx.quadraticCurveTo(cx - 8 * unit, cy + 4 * unit, cx - 10 * unit, cy - 7 * unit); ctx.closePath(); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(cx - 5 * unit, cy); ctx.lineTo(cx - 1 * unit, cy + 4 * unit);
      ctx.lineTo(cx + 6 * unit, cy - 4 * unit); ctx.stroke();
    } else if (symbol === "link") {
      ctx.beginPath(); ctx.arc(cx - 5 * unit, cy, 7 * unit, Math.PI * .55, Math.PI * 1.45); ctx.stroke();
      ctx.beginPath(); ctx.arc(cx + 5 * unit, cy, 7 * unit, Math.PI * 1.55, Math.PI * .45); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(cx - 5 * unit, cy); ctx.lineTo(cx + 5 * unit, cy); ctx.stroke();
    } else if (symbol === "game") {
      ctx.beginPath(); ctx.moveTo(cx - 11 * unit, cy + 7 * unit); ctx.lineTo(cx - 8 * unit, cy - 5 * unit);
      ctx.quadraticCurveTo(cx, cy - 10 * unit, cx + 8 * unit, cy - 5 * unit); ctx.lineTo(cx + 11 * unit, cy + 7 * unit);
      ctx.quadraticCurveTo(cx + 8 * unit, cy + 11 * unit, cx + 4 * unit, cy + 4 * unit);
      ctx.lineTo(cx - 4 * unit, cy + 4 * unit); ctx.quadraticCurveTo(cx - 8 * unit, cy + 11 * unit, cx - 11 * unit, cy + 7 * unit); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(cx - 6 * unit, cy - 2 * unit); ctx.lineTo(cx - 6 * unit, cy + 4 * unit);
      ctx.moveTo(cx - 9 * unit, cy + 1 * unit); ctx.lineTo(cx - 3 * unit, cy + 1 * unit); ctx.stroke();
      ctx.beginPath(); ctx.arc(cx + 5 * unit, cy, 1.5 * unit, 0, Math.PI * 2); ctx.fill();
    } else if (symbol === "image") {
      ctx.strokeRect(cx - 11 * unit, cy - 9 * unit, 22 * unit, 18 * unit);
      ctx.beginPath(); ctx.arc(cx + 5 * unit, cy - 4 * unit, 2.5 * unit, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.moveTo(cx - 9 * unit, cy + 6 * unit); ctx.lineTo(cx - 3 * unit, cy);
      ctx.lineTo(cx + 1 * unit, cy + 4 * unit); ctx.lineTo(cx + 5 * unit, cy + 1 * unit); ctx.lineTo(cx + 10 * unit, cy + 7 * unit); ctx.stroke();
    } else if (symbol === "bell") {
      ctx.beginPath(); ctx.moveTo(cx - 8 * unit, cy + 6 * unit); ctx.quadraticCurveTo(cx - 5 * unit, cy + 2 * unit, cx - 5 * unit, cy - 4 * unit);
      ctx.quadraticCurveTo(cx, cy - 12 * unit, cx + 5 * unit, cy - 4 * unit); ctx.quadraticCurveTo(cx + 5 * unit, cy + 2 * unit, cx + 8 * unit, cy + 6 * unit);
      ctx.closePath(); ctx.stroke(); ctx.beginPath(); ctx.arc(cx, cy + 9 * unit, 2 * unit, 0, Math.PI * 2); ctx.fill();
    } else if (symbol === "file") {
      ctx.beginPath(); ctx.moveTo(cx - 8 * unit, cy - 11 * unit); ctx.lineTo(cx + 3 * unit, cy - 11 * unit);
      ctx.lineTo(cx + 9 * unit, cy - 5 * unit); ctx.lineTo(cx + 9 * unit, cy + 11 * unit);
      ctx.lineTo(cx - 8 * unit, cy + 11 * unit); ctx.closePath(); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(cx + 3 * unit, cy - 11 * unit); ctx.lineTo(cx + 3 * unit, cy - 5 * unit); ctx.lineTo(cx + 9 * unit, cy - 5 * unit); ctx.stroke();
    } else if (symbol === "bot") {
      ctx.strokeRect(cx - 10 * unit, cy - 7 * unit, 20 * unit, 16 * unit);
      ctx.beginPath(); ctx.moveTo(cx, cy - 7 * unit); ctx.lineTo(cx, cy - 12 * unit); ctx.stroke();
      ctx.beginPath(); ctx.arc(cx, cy - 13 * unit, 1.5 * unit, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.arc(cx - 5 * unit, cy, 2 * unit, 0, Math.PI * 2); ctx.arc(cx + 5 * unit, cy, 2 * unit, 0, Math.PI * 2); ctx.fill();
    } else {
      ctx.beginPath(); ctx.moveTo(cx - 8 * unit, cy); ctx.lineTo(cx + 8 * unit, cy); ctx.stroke();
    }
    ctx.restore();
  };
  const ellipsis = (text, width, font) => {
    ctx.font = font;
    let result = safe(text);
    while (result.length > 1 && ctx.measureText(result).width > width) result = result.slice(0, -1);
    return result === safe(text) ? result : `${result.trim()}…`;
  };

  const bg = ctx.createLinearGradient(0, 0, W, H);
  bg.addColorStop(0, "#0f172a");
  bg.addColorStop(.52, "#111c31");
  bg.addColorStop(1, "#172033");
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, W, H);
  const coverUrl = groupInfo?.fullAvt || owner?.avatarFull || owner?.avatar;
  if (coverUrl && cv.isValidUrl(coverUrl)) {
    try {
      const cover = await loadImage(coverUrl);
      ctx.save(); ctx.globalAlpha = .08; ctx.drawImage(cover, 0, 0, W, H); ctx.restore();
      ctx.fillStyle = "rgba(15,23,42,.82)"; ctx.fillRect(0, 0, W, H);
    } catch {}
  }
  ctx.fillStyle = "#1e3a5f"; fillRoundRect(ctx, PAD, 40, 170, 38, 19);
  ctx.font = "bold 16px Tahoma"; ctx.fillStyle = "#93c5fd"; ctx.textAlign = "center";
  ctx.fillText(typeName.toUpperCase(), PAD + 85, 65);
  ctx.textAlign = "left"; ctx.fillStyle = "#f8fafc"; ctx.font = "bold 40px Tahoma";
  titleLines.forEach((line, index) => ctx.fillText(line, PAD, 125 + index * 46));
  ctx.fillStyle = "#94a3b8"; ctx.font = "19px Tahoma";
  ctx.fillText(`${safe(groupInfo?.memberCount, "0")} thành viên  •  ID ${safe(groupInfo?.groupId || groupInfo?.id, "—")}`, PAD, 184 + (titleLines.length - 1) * 46);

  const contentY = headerH;
  let y = contentY;
  card(PAD, y, LEFT_W, infoH);
  sectionTitle("Thông tin chung", PAD + 28, y + 39);
  const ownerTileX = PAD + 20, ownerTileY = y + 60, ownerTileW = 330, tileH = 166;
  ctx.fillStyle = "#263449"; fillRoundRect(ctx, ownerTileX, ownerTileY, ownerTileW, tileH, 16);
  ctx.strokeStyle = "#3b4a61"; ctx.lineWidth = 1; strokeRoundRect(ctx, ownerTileX, ownerTileY, ownerTileW, tileH, 16);
  const avatarSize = 76, avatarX = ownerTileX + 20, avatarY = ownerTileY + 45;
  ctx.fillStyle = "#334155"; ctx.beginPath(); ctx.arc(avatarX + 38, avatarY + 38, 38, 0, Math.PI * 2); ctx.fill();
  try {
    const avatarUrl = owner?.avatarFull || owner?.avatar;
    if (avatarUrl && cv.isValidUrl(avatarUrl)) {
      const avatar = await loadImage(avatarUrl); ctx.save(); ctx.beginPath(); ctx.arc(avatarX + 38, avatarY + 38, 36, 0, Math.PI * 2); ctx.clip(); ctx.drawImage(avatar, avatarX + 2, avatarY + 2, 72, 72); ctx.restore();
    }
  } catch {}
  ctx.strokeStyle = "#3b82f6"; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(avatarX + 38, avatarY + 38, 38, 0, Math.PI * 2); ctx.stroke();
  iconBadge(ownerTileX + 18, ownerTileY + 14, "★", "#2563eb", "#ffffff", 30);
  ctx.textAlign = "left"; ctx.fillStyle = "#94a3b8"; ctx.font = "bold 13px Tahoma";
  ctx.fillText(`TRƯỞNG ${typeName.toUpperCase()}`, ownerTileX + 56, ownerTileY + 35);
  ctx.fillStyle = "#f8fafc"; ctx.font = "bold 19px Tahoma";
  ctx.fillText(ellipsis(owner?.name, 195, "bold 19px Tahoma"), avatarX + avatarSize + 16, ownerTileY + 88);
  ctx.fillStyle = "#94a3b8"; ctx.font = "15px Tahoma";
  ctx.fillText("Người quản lý chính", avatarX + avatarSize + 16, ownerTileY + 116);

  const statX = ownerTileX + ownerTileW + 16, statW = LEFT_W - 56 - ownerTileW;
  const drawStatTile = (tileY, symbol, label, value, bg, color) => {
    ctx.fillStyle = "#263449"; fillRoundRect(ctx, statX, tileY, statW, 75, 16);
    ctx.strokeStyle = "#3b4a61"; ctx.lineWidth = 1; strokeRoundRect(ctx, statX, tileY, statW, 75, 16);
    iconBadge(statX + 14, tileY + 16, symbol, bg, color, 43);
    ctx.textAlign = "left"; ctx.fillStyle = "#94a3b8"; ctx.font = "13px Tahoma"; ctx.fillText(label, statX + 70, tileY + 28);
    ctx.fillStyle = "#f8fafc"; ctx.font = "bold 20px Tahoma"; ctx.fillText(ellipsis(value, statW - 84, "bold 20px Tahoma"), statX + 70, tileY + 55);
  };
  drawStatTile(ownerTileY, "M", "THÀNH VIÊN", safe(groupInfo?.memberCount, "0"), "#14532d", "#86efac");
  drawStatTile(ownerTileY + 91, "N", "NGÀY TẠO", safe(groupInfo?.createdTime), "#78350f", "#fcd34d");
  y += infoH;

  if (descH) {
    y += GAP; card(PAD, y, LEFT_W, descH); sectionTitle(`Mô tả ${typeName.toLowerCase()}`, PAD + 28, y + 39);
    ctx.fillStyle = "#cbd5e1"; ctx.font = "21px Tahoma";
    descLines.forEach((line, index) => ctx.fillText(line, PAD + 28, y + 77 + index * 31)); y += descH;
  }
  if (settingsH) {
    y += GAP; card(PAD, y, LEFT_W, settingsH); sectionTitle("Quyền và cài đặt", PAD + 28, y + 39);
    settings.forEach((item, index) => {
      const rowY = y + 72 + index * 46;
      ctx.fillStyle = "#263449"; fillRoundRect(ctx, PAD + 18, rowY - 28, LEFT_W - 36, 42, 11);
      ctx.strokeStyle = "#3b4a61"; ctx.lineWidth = 1; strokeRoundRect(ctx, PAD + 18, rowY - 28, LEFT_W - 36, 42, 11);
      const enabled = /^(Bật|Tất cả)$/i.test(String(item.value));
      const iconColors = [
        ["#1d4ed8", "#bfdbfe"], ["#7e22ce", "#e9d5ff"],
        ["#c2410c", "#fed7aa"], ["#be185d", "#fbcfe8"],
        ["#0f766e", "#99f6e4"], ["#a16207", "#fde68a"],
      ];
      const [iconBg, iconColor] = iconColors[index % iconColors.length];
      iconBadge(PAD + 26, rowY - 22, enabled ? "✓" : "–", iconBg, iconColor, 30);
      ctx.font = "16px Tahoma"; ctx.fillStyle = "#cbd5e1"; ctx.textAlign = "left"; ctx.fillText(ellipsis(item.label, 350, "16px Tahoma"), PAD + 66, rowY);
      const valueW = Math.min(150, ctx.measureText(String(item.value)).width + 28);
      ctx.fillStyle = enabled ? "#14532d" : "#3b475a"; fillRoundRect(ctx, PAD + LEFT_W - 28 - valueW, rowY - 21, valueW, 28, 14);
      ctx.font = "bold 14px Tahoma"; ctx.fillStyle = enabled ? "#86efac" : "#cbd5e1"; ctx.textAlign = "center";
      ctx.fillText(item.value, PAD + LEFT_W - 28 - valueW / 2, rowY - 1);
    });
  }

  const rightX = PAD + LEFT_W + GAP;
  card(rightX, contentY, RIGHT_W, Math.max(configH, leftH));
  sectionTitle("Cấu hình bot", rightX + 26, contentY + 39);
  let cfgY = contentY + 78;
  const configIconMeta = (value) => {
    const text = String(value).toLowerCase();
    if (/tương tác|trả lời|reply|tin nhắn nhóm/.test(text)) return ["chat", "#1d4ed8", "#bfdbfe"];
    if (/trò chơi|game/.test(text)) return ["game", "#7e22ce", "#e9d5ff"];
    if (/spam|thô tục|nhạy cảm|chống|chặn bot/.test(text)) return ["shield", "#be123c", "#fecdd3"];
    if (/liên kết|link/.test(text)) return ["link", "#c2410c", "#fed7aa"];
    if (/thành viên|tham gia|chào|rời nhóm/.test(text)) return ["users", "#0f766e", "#99f6e4"];
    if (/ảnh|video|gif|media|sticker/.test(text)) return ["image", "#be185d", "#fbcfe8"];
    if (/file/.test(text)) return ["file", "#0369a1", "#bae6fd"];
    if (/thông báo|tự động|task/.test(text)) return ["bell", "#a16207", "#fde68a"];
    if (/bot|gemini|học máy/.test(text)) return ["bot", "#6d28d9", "#ddd6fe"];
    return ["shield", "#334155", "#cbd5e1"];
  };
  const drawConfigGroup = (title, items, color, dim) => {
    if (!items.length) return;
    ctx.fillStyle = dim; fillRoundRect(ctx, rightX + 20, cfgY - 25, RIGHT_W - 40, 38, 12);
    ctx.fillStyle = color; ctx.font = "bold 17px Tahoma"; ctx.textAlign = "left"; ctx.fillText(`${title}  ${items.length}`, rightX + 34, cfgY); cfgY += 48;
    for (const item of items) {
      const [configIcon, configBg, configColor] = configIconMeta(item);
      ctx.fillStyle = "#263449"; fillRoundRect(ctx, rightX + 20, cfgY - 28, RIGHT_W - 40, 36, 10);
      ctx.strokeStyle = "#3b4a61"; ctx.lineWidth = 1; strokeRoundRect(ctx, rightX + 20, cfgY - 28, RIGHT_W - 40, 36, 10);
      iconBadge(rightX + 25, cfgY - 24, configIcon, configBg, configColor, 28);
      ctx.fillStyle = "#e2e8f0"; ctx.font = "16px Tahoma"; ctx.textAlign = "left";
      const cleanItem = String(item).replace(/^\p{Extended_Pictographic}(?:\uFE0F)?\s*/u, "");
      ctx.fillText(ellipsis(cleanItem, RIGHT_W - 98, "16px Tahoma"), rightX + 62, cfgY - 3); cfgY += 42;
    }
  };
  drawConfigGroup("Đang bật", onConfigs, "#86efac", "#14532d");
  drawConfigGroup("Đang tắt", offConfigs, "#fda4af", "#881337");
  if (!configCount) {
    ctx.fillStyle = "#64748b"; ctx.font = "18px Tahoma"; ctx.textAlign = "center";
    ctx.fillText("Chưa có cấu hình", rightX + RIGHT_W / 2, contentY + 145);
  }

  ctx.textAlign = "right"; ctx.fillStyle = "rgba(148,163,184,.65)"; ctx.font = "14px Tahoma";
  ctx.fillText("GROUP OVERVIEW", W - PAD, H - 24);
  const filePath = path.resolve(`./assets/temp/group_info_${Date.now()}.png`);
  await fs.promises.mkdir(path.dirname(filePath), { recursive: true });
  await fs.promises.writeFile(filePath, canvas.toBuffer("image/png"));
  return filePath;
}
