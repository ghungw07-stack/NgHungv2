import { createCanvas, loadImage } from "canvas";
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
let __lastUserInfoDesignWasB = null;
export async function createUserInfoImage(userInfo) {
  const useDesignB =
    __lastUserInfoDesignWasB === null ? Math.random() < 0.5 : !__lastUserInfoDesignWasB;
  __lastUserInfoDesignWasB = useDesignB;
  return useDesignB
    ? createUserInfoImageDesignB(userInfo)
    : createUserInfoImageDesignA(userInfo);
}

export async function createManagerBotInfoImage(cardData) {
  const width = 1400;
  const defaultBackgroundUrl = "https://i.imgur.com/rpMuZww.jpeg";
  const bioLineHeight = 35;
  const bioPadding = 45;
  const overviewFields = cardData.overviewFields || cardData.fields || [];
  const registrationFields = cardData.registrationFields || [];
  const extraFields = cardData.extraFields || [];
  const showRegistrationSection = cardData.showRegistrationSection !== false;
  const showExtraSection = cardData.showExtraSection !== false;
  const section2Text = cardData.extraText || "Chưa cập nhật";

  const section2Lines = [];
  section2Text.split("\n").forEach((line) => {
    const linesObj = handleNameLong(line, 80);
    section2Lines.push(...linesObj.lines);
  });

  const section2Height =
    bioPadding * 2 + Math.max(1, section2Lines.length) * bioLineHeight + 40;

  let yPos = 80;
  yPos += 40;
  yPos += 60;
  const headerBottomY = yPos - 10;
  const boxHeight = 110;
  const gapY = 20;

  const frame1X = 60;
  const frame1W = 1280;
  const frame1Y = headerBottomY + 25;
  const sectionGap = 20;
  const avatarSize = 250;
  const avatarX = frame1X + 65;
  const avatarY = frame1Y + 200;
  const overviewCardsY = avatarY - 95;
  const frame1GridX = avatarX + avatarSize + 70;
  const frame1ColGapX = 30;
  const frame1InnerRight = frame1X + frame1W - 35;
  const frame1ColWidth = Math.floor(
    (frame1InnerRight - frame1GridX - frame1ColGapX) / 2,
  );

  const overviewRows = overviewFields.length
    ? 1 + Math.ceil(Math.max(0, overviewFields.length - 1) / 2)
    : 0;
  const overviewCardsBottom = overviewRows
    ? overviewCardsY + overviewRows * (boxHeight + gapY) - gapY
    : overviewCardsY;
  const frame1H = overviewCardsBottom - frame1Y - 78;

  let sectionY = frame1Y + frame1H + sectionGap + 20;
  const frame2X = frame1X;
  const frame2W = frame1W;
  const frame2ColGapX = 30;
  const frame2ColWidth = Math.floor((frame2W - 40 - frame2ColGapX) / 2);
  const regRows = registrationFields.length
    ? 1 + Math.ceil(Math.max(0, registrationFields.length - 1) / 2)
    : 1;
  const frame2CardsY = sectionY + 68;
  const frame2H =
    frame2CardsY + regRows * (boxHeight + gapY) - gapY + 30 - sectionY;

  let section3Y = sectionY;
  if (showRegistrationSection) {
    section3Y = sectionY + frame2H + sectionGap + 20;
  }

  const section3Rows = Math.max(
    1,
    Math.ceil(Math.max(1, extraFields.length) / 2),
  );
  const section3CardsY = section3Y + 68;

  // Tính chiều cao phần 3 dựa trên nội dung thực tế
  let section3H;
  if (extraFields.length) {
    // Khi có extraFields: dùng logic cũ
    section3H =
      section3CardsY +
      section3Rows * (boxHeight + gapY) -
      gapY +
      30 -
      section3Y;
  } else {
    // Khi không có extraFields: tính dựa trên số dòng text thực tế
    const lineCount = Math.max(1, section2Lines.length);
    // Công thức: bioPadding + 35 + (dòng * bioLineHeight) + 30
    section3H = bioPadding + 35 + lineCount * bioLineHeight + 30;
  }

  let totalHeight = frame1Y + frame1H + 40;
  if (showRegistrationSection) {
    totalHeight = sectionY + frame2H + 40;
  }
  if (showExtraSection) {
    totalHeight = section3Y + section3H + 40;
  }

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

  try {
    const bgSource =
      (cardData.backgroundUrl && cv.isValidUrl(cardData.backgroundUrl)
        ? cardData.backgroundUrl
        : defaultBackgroundUrl) || cardData.cover;

    if (!bgSource || !cv.isValidUrl(bgSource)) {
      throw new Error("No valid background image");
    }

    const coverImg = await loadImage(bgSource);
    ctx.drawImage(coverImg, 0, 0, width, totalHeight);
    ctx.fillStyle = "rgba(0, 0, 0, 0.7)";
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

  let topY = 90;
  ctx.textAlign = "center";
  ctx.font = "bold 60px Tahoma";
  const titleText = cardData.title || "Thông Tin Chi Tiết Bot";

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
  divGrad.addColorStop(0, "rgba(0, 224, 255, 0)");
  divGrad.addColorStop(0.3, "rgba(0, 224, 255, 0.8)");
  divGrad.addColorStop(0.7, "rgba(255, 0, 127, 0.8)");
  divGrad.addColorStop(1, "rgba(255, 0, 127, 0)");
  ctx.fillStyle = divGrad;
  ctx.fillRect(150, topY, width - 300, 4);

  function drawSectionFrame(title, x, y, w, h) {
    ctx.fillStyle = "rgba(255, 255, 255, 0.04)";
    fillRoundRect(x, y, w, h, 20);

    ctx.strokeStyle = "rgba(255, 255, 255, 0.1)";
    ctx.lineWidth = 2;
    strokeRoundRect(x, y, w, h, 20);

    ctx.font = "bold 24px Tahoma";
    const titleW = ctx.measureText(title).width + 60;
    ctx.fillStyle = "#171720";
    fillRoundRect(width / 2 - titleW / 2, y - 26, titleW, 52, 26);

    ctx.strokeStyle = "rgba(255, 255, 255, 0.1)";
    ctx.lineWidth = 2;
    strokeRoundRect(width / 2 - titleW / 2, y - 26, titleW, 52, 26);

    ctx.textAlign = "center";
    ctx.fillStyle = "#ffffff";
    ctx.fillText(title, width / 2, y + 12);
  }

  function drawFieldCards(fields, options = {}) {
    const {
      startX,
      startY,
      colWidth,
      colGapX,
      rowHeight,
      rowGapY,
      firstFullWidth = false,
      valueLength = 28,
      firstValueLength = 56,
    } = options;

    ctx.textAlign = "left";
    for (let i = 0; i < fields.length; i++) {
      let col = i % 2;
      let row = Math.floor(i / 2);
      let boxW = colWidth;

      if (firstFullWidth && i === 0) {
        col = 0;
        row = 0;
        boxW = colWidth * 2 + colGapX;
      } else if (firstFullWidth) {
        const idx = i - 1;
        col = idx % 2;
        row = 1 + Math.floor(idx / 2);
      }

      const originX = startX + col * (colWidth + colGapX);
      const originY = startY + row * (rowHeight + rowGapY);
      const labelColor = fields[i].color || "#00e0ff";

      ctx.fillStyle = "rgba(255, 255, 255, 0.04)";
      fillRoundRect(originX, originY, boxW, rowHeight, 18);

      ctx.strokeStyle = "rgba(255, 255, 255, 0.06)";
      ctx.lineWidth = 1.5;
      strokeRoundRect(originX, originY, boxW, rowHeight, 18);

      ctx.strokeStyle = labelColor;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(originX + 20, originY + 20);
      ctx.lineTo(originX + 20, originY + rowHeight - 25);
      ctx.stroke();

      ctx.fillStyle = labelColor;
      ctx.font = "bold 20px Tahoma";
      ctx.fillText(fields[i].label || "", originX + 35, originY + 42);

      const valueText = String(fields[i].value ?? "N/A");
      const valueLines = handleNameLong(
        valueText,
        firstFullWidth && i === 0 ? firstValueLength : valueLength,
      ).lines;
      ctx.fillStyle = "#ffffff";
      ctx.font = "bold 24px Tahoma";
      ctx.fillText(valueLines[0] || "N/A", originX + 35, originY + 80);
      if (valueLines[1]) {
        ctx.font = "bold 20px Tahoma";
        ctx.fillText(valueLines[1], originX + 35, originY + 104);
      }
    }
  }

  drawSectionFrame(
    cardData.overviewTitle || "Tổng quan bot",
    frame1X,
    frame1Y,
    frame1W,
    frame1H,
  );

  const cx = avatarX + avatarSize / 2;
  const cy = avatarY + avatarSize / 2;

  let avatarImg = null;
  try {
    if (cv.isValidUrl(cardData.avatar)) {
      avatarImg = await loadImage(cardData.avatar);
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

  let leftTextY = avatarY + avatarSize + 60;

  drawFieldCards(overviewFields, {
    startX: frame1GridX,
    startY: overviewCardsY,
    colWidth: frame1ColWidth,
    colGapX: frame1ColGapX,
    rowHeight: boxHeight,
    rowGapY: gapY,
    firstFullWidth: false,
  });

  function drawTextSection(title, lines, y, h) {
    const boxWidth = frame2W;
    const boxX = frame2X;

    // Tính chiều cao thực tế cần thiết để chứa hết toàn bộ text
    const requiredHeight = bioPadding + 35 + lines.length * bioLineHeight + 30;
    const finalHeight = Math.max(h, requiredHeight);

    ctx.fillStyle = "rgba(255, 255, 255, 0.04)";
    fillRoundRect(boxX, y, boxWidth, finalHeight, 20);

    ctx.strokeStyle = "rgba(255, 255, 255, 0.1)";
    ctx.lineWidth = 2;
    strokeRoundRect(boxX, y, boxWidth, finalHeight, 20);

    ctx.font = "bold 24px Tahoma";
    const titleW = ctx.measureText(title).width + 60;

    ctx.fillStyle = "#171720";
    fillRoundRect(width / 2 - titleW / 2, y - 26, titleW, 52, 26);
    ctx.strokeStyle = "rgba(255, 255, 255, 0.1)";
    ctx.lineWidth = 2;
    strokeRoundRect(width / 2 - titleW / 2, y - 26, titleW, 52, 26);

    ctx.textAlign = "center";
    ctx.fillStyle = "#ffffff";
    ctx.fillText(title, width / 2, y + 12);

    let currentY = y + bioPadding + 35;
    for (const line of lines) {
      ctx.font = "26px Tahoma";
      ctx.fillStyle = "#cccccc";
      ctx.fillText(line, width / 2, currentY);
      currentY += bioLineHeight;
    }
  }

  if (showRegistrationSection) {
    drawSectionFrame(
      cardData.registrationTitle || "Thông tin đăng ký",
      frame2X,
      sectionY,
      frame2W,
      frame2H,
    );

    drawFieldCards(
      registrationFields.length
        ? registrationFields
        : [{ label: "Thông tin", value: "Chưa cập nhật", color: "#00e0ff" }],
      {
        startX: frame2X + 20,
        startY: frame2CardsY,
        colWidth: frame2ColWidth,
        colGapX: frame2ColGapX,
        rowHeight: boxHeight,
        rowGapY: gapY,
        firstFullWidth: true,
        firstValueLength: 72,
        valueLength: 30,
      },
    );
  }

  if (showExtraSection) {
    if (extraFields.length) {
      drawSectionFrame(
        cardData.extraTitle || "Giới thiệu và Thông tin bot",
        frame2X,
        section3Y,
        frame2W,
        section3H,
      );

      drawFieldCards(extraFields, {
        startX: frame2X + 20,
        startY: section3CardsY,
        colWidth: frame2ColWidth,
        colGapX: frame2ColGapX,
        rowHeight: boxHeight,
        rowGapY: gapY,
        valueLength: 34,
      });
    } else {
      drawTextSection(
        cardData.extraTitle || "Giới thiệu và Thông tin bot",
        section2Lines.length ? section2Lines : ["Chưa cập nhật"],
        section3Y,
        section3H,
      );
    }
  }

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

export async function createUserCardGame(playerInfo) {
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
  const measureCtxTmp = createCanvas(10, 10).getContext("2d");
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

  const canvas = createCanvas(WIDTH, totalHeight);
  const ctx = canvas.getContext("2d");

  /* ---- Nền: chỉ dùng màu của thẻ, không viền xám bao ngoài ---- */
  ctx.fillStyle = COL.cardBg;
  ctx.fillRect(0, 0, WIDTH, totalHeight);

  /* ================== HEADER ================== */
  {
    const avatarSize = 84;
    const avatarX = X;
    const avatarY = PAD;

    const avGrad = ctx.createLinearGradient(avatarX, avatarY, avatarX + avatarSize, avatarY + avatarSize);
    avGrad.addColorStop(0, "#E6F1FB");
    avGrad.addColorStop(1, "#D7E9FB");
    ctx.fillStyle = avGrad;
    fillRoundRect(ctx, avatarX, avatarY, avatarSize, avatarSize, 20);

    let avatarImg = null;
    try {
      if (botInfo?.avatar && cv.isValidUrl(botInfo.avatar)) {
        avatarImg = await loadImage(botInfo.avatar);
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
    ctx.fillStyle = COL.textPrimary;
    ctx.font = "bold 32px Tahoma";
    ctx.fillText(botInfo?.zaloName || "Không có tên", nameX, avatarY + 38);

    const dotY = avatarY + 66;
    ctx.fillStyle = COL.online;
    ctx.beginPath();
    ctx.arc(nameX + 5, dotY - 5, 5, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = COL.textSecondary;
    ctx.font = "22px Tahoma";
    ctx.fillText(`Đang hoạt động  ·  ${uptime || "N/A"}`, nameX + 18, dotY);

    // Đường kẻ phân tách dưới header
    ctx.strokeStyle = COL.divider;
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

  const filePath = path.resolve(`./assets/temp/bot_info_${Date.now()}.png`);
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const out = fs.createWriteStream(filePath);
  const stream = canvas.createPNGStream();
  stream.pipe(out);

  return new Promise((resolve, reject) => {
    out.on("finish", () => resolve(filePath));
    out.on("error", reject);
  });
}


export async function createGroupInfoImage(
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