import { createCanvas, loadImage } from "canvas";
import fs from "fs";
import path from "path";
import { FONT_MAIN, randomIDTemp } from "../format-util.js";
import { tempDir } from "../io-json.js";

// Helper function to calculate optimal dimensions
function calculateOptimalDimensions(helpContent, isAdminBox) {
  const tempCanvas = createCanvas(1, 1);
  const tempCtx = tempCanvas.getContext("2d");

  const commandFont = "bold 28px Tahoma";
  const descFont = "bold 28px Tahoma";

  let maxCommandWidth = 0;
  let maxDescWidth = 0;
  let maxTotalWidth = 0; // Tổng độ dài command + description lớn nhất
  let totalCommands = 0;

  // Calculate for all members
  tempCtx.font = commandFont;
  for (const key in helpContent.allMembers) {
    if (helpContent.allMembers.hasOwnProperty(key)) {
      const command = `${helpContent.allMembers[key].icon} ${helpContent.allMembers[key].command}`;
      const commandWidth = tempCtx.measureText(command).width;
      maxCommandWidth = Math.max(maxCommandWidth, commandWidth);

      tempCtx.font = descFont;
      const desc = helpContent.allMembers[key].description;
      const descWidth = tempCtx.measureText(desc).width;
      maxDescWidth = Math.max(maxDescWidth, descWidth);

      const totalWidth = commandWidth + descWidth;
      maxTotalWidth = Math.max(maxTotalWidth, totalWidth);

      tempCtx.font = commandFont;
      totalCommands++;
    }
  }

  // Calculate for admin commands if needed
  if (isAdminBox && helpContent.admin) {
    tempCtx.font = commandFont;
    for (const key in helpContent.admin) {
      if (helpContent.admin.hasOwnProperty(key)) {
        const command = `${helpContent.admin[key].icon} ${helpContent.admin[key].command}`;
        const commandWidth = tempCtx.measureText(command).width;
        maxCommandWidth = Math.max(maxCommandWidth, commandWidth);

        tempCtx.font = descFont;
        const desc = helpContent.admin[key].description;
        const descWidth = tempCtx.measureText(desc).width;
        maxDescWidth = Math.max(maxDescWidth, descWidth);

        // Tính tổng độ dài command + description
        const totalWidth = commandWidth + descWidth;
        maxTotalWidth = Math.max(maxTotalWidth, totalWidth);

        tempCtx.font = commandFont;
        totalCommands++;
      }
    }
  }

  // Calculate optimal canvas dimensions
  const padding = 40;
  const boxSpacing = 30;
  const commandBoxWidth = Math.max(400, maxCommandWidth + 60);
  const descBoxWidth = Math.max(400, maxDescWidth + 60);
  const totalWidth = padding * 2 + commandBoxWidth + boxSpacing + descBoxWidth;
  const totalWidthFinal = padding * 2 + maxTotalWidth + boxSpacing + 120;


  const rowHeight = 88;
  const titleHeight = 80;
  const sectionSpacing = 20;
  const totalHeight =
    titleHeight + totalCommands * rowHeight + (isAdminBox ? sectionSpacing + titleHeight : 0) + padding * 2;

  return {
    width: Math.max(1, totalWidthFinal),
    height: Math.max(700, totalHeight),
    commandBoxWidth,
    descBoxWidth,
    boxSpacing,
    padding,
    maxTotalWidth, // Thêm giá trị tổng độ dài lớn nhất
  };
}

// Helper function to draw rounded rectangle with transparency
function drawRoundedBox(ctx, x, y, width, height, radius, fillColor, strokeColor = null, strokeWidth = 2) {
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
  if (fillColor) {
    ctx.fillStyle = fillColor;
    ctx.fill();
  }
  if (strokeColor) {
    ctx.strokeStyle = strokeColor;
    ctx.lineWidth = strokeWidth;
    ctx.stroke();
  }
}

// Helper: bọc text theo nhiều dòng, giới hạn số dòng tối đa (thêm ... nếu vượt quá)
function wrapTextLines(ctx, text, maxWidth, maxLines) {
  const words = String(text || "").split(" ");
  const lines = [];
  let line = "";

  for (const word of words) {
    const testLine = line ? `${line} ${word}` : word;
    if (ctx.measureText(testLine).width > maxWidth && line) {
      lines.push(line);
      line = word;
      if (lines.length === maxLines) break;
    } else {
      line = testLine;
    }
  }
  if (lines.length < maxLines && line) lines.push(line);

  if (lines.length === maxLines) {
    let lastLine = lines[maxLines - 1];
    while (ctx.measureText(lastLine + "...").width > maxWidth && lastLine.length > 0) {
      lastLine = lastLine.slice(0, -1);
    }
    lines[maxLines - 1] = lastLine.trimEnd() + (lastLine.length < String(text || "").length ? "..." : "");
  }
  return lines;
}

function truncateText(ctx, text, maxWidth) {
  const source = String(text || "");
  if (ctx.measureText(source).width <= maxWidth) return source;
  let value = source;
  while (value.length > 1 && ctx.measureText(`${value}…`).width > maxWidth) value = value.slice(0, -1);
  return `${value.trimEnd()}…`;
}

function saveHelpCanvas(canvas, prefix) {
  if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir, { recursive: true });
  const filePath = path.join(tempDir, `${prefix}_${randomIDTemp()}.png`);
  const out = fs.createWriteStream(filePath);
  canvas.createPNGStream().pipe(out);
  return new Promise((resolve, reject) => {
    out.on("finish", () => resolve(filePath));
    out.on("error", reject);
  });
}

/** Canvas riêng cho `game help`, bố cục dashboard 2 cột để dễ đọc trên điện thoại. */
export async function createGameHelpImage(helpContent, isAdminBox) {
  const memberCommands = Object.entries(helpContent.allMembers || {}).map(([key, value]) => ({ key, ...value }));
  const adminCommands = isAdminBox
    ? Object.entries(helpContent.admin || {}).map(([key, value]) => ({ key, ...value }))
    : [];
  const categoryOf = (key) => {
    if (["daily", "giveaway", "mycard", "rank", "tier", "donenat", "donate"].includes(key)) return "HỒ SƠ & XẾP HẠNG";
    if (["bank", "saoke"].includes(key)) return "NGÂN HÀNG GAME";
    return "TRÒ CHƠI GIẢI TRÍ";
  };

  const sections = [];
  for (const title of ["HỒ SƠ & XẾP HẠNG", "TRÒ CHƠI GIẢI TRÍ", "NGÂN HÀNG GAME"]) {
    const commands = memberCommands.filter((item) => categoryOf(item.key) === title);
    if (commands.length) sections.push({ title, commands, admin: false });
  }
  if (adminCommands.length) sections.push({ title: "QUẢN TRỊ VIÊN", commands: adminCommands, admin: true });

  const width = 1400;
  const margin = 54;
  const headerH = 205;
  const sectionHeaderH = 58;
  const cardH = 126;
  const gap = 20;
  const sectionGap = 28;
  const footerH = 96;
  const contentHeight = sections.reduce(
    (sum, section) => sum + sectionHeaderH + Math.ceil(section.commands.length / 2) * (cardH + gap) + sectionGap,
    0
  );
  const height = headerH + contentHeight + footerH;
  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext("2d");

  const bg = ctx.createRadialGradient(width / 2, 220, 40, width / 2, height / 2, width);
  bg.addColorStop(0, "#173b62");
  bg.addColorStop(0.48, "#0b203b");
  bg.addColorStop(1, "#040b18");
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, width, height);

  ctx.save();
  ctx.globalAlpha = 0.055;
  ctx.strokeStyle = "#9bd4ff";
  for (let x = -height; x < width + height; x += 46) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x + height, height);
    ctx.stroke();
  }
  ctx.restore();

  drawRoundedBox(ctx, 18, 18, width - 36, height - 36, 32, null, "#4b84b9", 6);
  drawRoundedBox(ctx, 25, 25, width - 50, height - 50, 27, null, "#d6b45c", 2);

  ctx.textAlign = "center";
  ctx.fillStyle = "#f6cf67";
  ctx.font = `bold 50px ${FONT_MAIN}`;
  ctx.fillText("GAME CENTER", width / 2, 78);
  ctx.fillStyle = "#e8f4ff";
  ctx.font = `bold 27px ${FONT_MAIN}`;
  ctx.fillText("DANH SÁCH LỆNH & HƯỚNG DẪN NHANH", width / 2, 122);
  ctx.fillStyle = "#8eb2d0";
  ctx.font = `20px ${FONT_MAIN}`;
  ctx.fillText(`${memberCommands.length} tính năng dành cho người chơi${adminCommands.length ? `  ·  ${adminCommands.length} lệnh quản trị` : ""}`, width / 2, 158);
  ctx.fillStyle = "#d6b45c";
  ctx.fillRect(width / 2 - 190, 180, 380, 2);
  ctx.beginPath();
  ctx.arc(width / 2, 181, 6, 0, Math.PI * 2);
  ctx.fill();

  const colGap = 24;
  const cardW = (width - margin * 2 - colGap) / 2;
  let y = headerH;
  let globalIndex = 1;

  for (const section of sections) {
    const accent = section.admin ? "#efb85b" : section.title === "TRÒ CHƠI GIẢI TRÍ" ? "#57d4a2" : "#67b8ff";
    ctx.textAlign = "left";
    ctx.fillStyle = accent;
    ctx.font = `bold 24px ${FONT_MAIN}`;
    ctx.fillText(section.title, margin + 16, y + 35);
    ctx.fillStyle = `${accent}55`;
    ctx.fillRect(margin, y + 50, width - margin * 2, 2);
    y += sectionHeaderH;

    for (let i = 0; i < section.commands.length; i++) {
      const command = section.commands[i];
      const col = i % 2;
      const row = Math.floor(i / 2);
      const x = margin + col * (cardW + colGap);
      const cardY = y + row * (cardH + gap);

      ctx.save();
      ctx.shadowColor = "rgba(0,0,0,.42)";
      ctx.shadowBlur = 14;
      ctx.shadowOffsetY = 6;
      drawRoundedBox(ctx, x, cardY, cardW, cardH, 18, "rgba(11,31,54,.9)", `${accent}88`, 2);
      ctx.restore();

      ctx.fillStyle = accent;
      drawRoundedBox(ctx, x + 18, cardY + 20, 58, 58, 15, `${accent}22`, `${accent}99`, 2);
      ctx.textAlign = "center";
      ctx.font = `bold 23px ${FONT_MAIN}`;
      ctx.fillText(String(globalIndex).padStart(2, "0"), x + 47, cardY + 58);

      const textX = x + 94;
      ctx.textAlign = "left";
      ctx.fillStyle = "#f8fbff";
      ctx.font = `bold 22px ${FONT_MAIN}`;
      ctx.fillText(truncateText(ctx, command.command, cardW - 120), textX, cardY + 39);
      ctx.fillStyle = "#a9c0d5";
      ctx.font = `18px ${FONT_MAIN}`;
      const lines = wrapTextLines(ctx, command.description, cardW - 122, 2);
      lines.forEach((line, lineIndex) => ctx.fillText(line, textX, cardY + 72 + lineIndex * 25));
      globalIndex++;
    }
    y += Math.ceil(section.commands.length / 2) * (cardH + gap) + sectionGap;
  }

  ctx.textAlign = "center";
  ctx.fillStyle = "#8faac1";
  ctx.font = `19px ${FONT_MAIN}`;
  ctx.fillText("Tiền và vật phẩm trong game chỉ mang tính giải trí, không quy đổi thành tiền thật.", width / 2, height - 47);

  return saveHelpCanvas(canvas, "game_help");
}

export async function createMenuGridImage({ botName, commands, page, totalPages, totalCommands }) {
  const COLUMNS = 4;
  const CARD_WIDTH = 340;
  const CARD_HEIGHT = 170;
  const GAP = 25;
  const PADDING = 40;
  const HEADER_HEIGHT = 140;
  const FOOTER_HEIGHT = 70;

  const rows = Math.max(1, Math.ceil(commands.length / COLUMNS));
  const width = PADDING * 2 + COLUMNS * CARD_WIDTH + (COLUMNS - 1) * GAP;
  const height = HEADER_HEIGHT + rows * CARD_HEIGHT + (rows - 1) * GAP + FOOTER_HEIGHT + PADDING * 2;

  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext("2d");

  // Nền menu V2 pha loang, không còn tải ảnh background cũ.
  const background = ctx.createLinearGradient(0, 0, width, height);
  background.addColorStop(0, "#4b267e");
  background.addColorStop(0.46, "#283d7a");
  background.addColorStop(1, "#08766f");
  ctx.fillStyle = background;
  ctx.fillRect(0, 0, width, height);

  const colorClouds = [
    [width * 0.1, height * 0.08, width * 0.5, "rgba(255,92,190,.32)"],
    [width * 0.88, height * 0.15, width * 0.42, "rgba(104,126,255,.35)"],
    [width * 0.64, height * 0.94, width * 0.56, "rgba(34,235,178,.25)"],
  ];
  for (const [x, y, radius, color] of colorClouds) {
    const cloud = ctx.createRadialGradient(x, y, 0, x, y, radius);
    cloud.addColorStop(0, color);
    cloud.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = cloud;
    ctx.fillRect(0, 0, width, height);
  }

  function drawRoundedBox(ctx, x, y, w, h, radius, fill, stroke, strokeWidth = 1) {
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
    if (fill) { ctx.fillStyle = fill; ctx.fill(); }
    if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = strokeWidth; ctx.stroke(); }
  }

  const mainFont = "'Segoe UI', Tahoma, Verdana, sans-serif";

  // Header
  const headerX = PADDING;
  const headerY = PADDING;
  const headerWidth = width - PADDING * 2;
  const headerHeightBox = HEADER_HEIGHT - 20;

  // Khung kính tối để vẫn nhìn thấy background phía sau.
  ctx.shadowColor = "rgba(0, 0, 0, 0.28)";
  ctx.shadowBlur = 10;
  ctx.shadowOffsetY = 4;
  drawRoundedBox(ctx, headerX, headerY, headerWidth, headerHeightBox, 16, "rgba(8, 12, 30, 0.62)", "rgba(255,255,255,.22)", 1);
  ctx.shadowBlur = 0;
  ctx.shadowOffsetY = 0;

  ctx.textAlign = "center";
  ctx.font = `bold 42px ${mainFont}`;
  ctx.fillStyle = "#FFFFFF";
  ctx.fillText("Danh Sách Lệnh", width / 2, headerY + 68);

  ctx.font = `600 24px ${mainFont}`;
  ctx.fillStyle = "#D7E5FF";
  ctx.fillText(`Mạng lưới: ${botName || "Bot"}   •   Đang chạy ${totalCommands} lệnh`, width / 2, headerY + 105);

  // Vẽ các thẻ lệnh
  const gridStartY = HEADER_HEIGHT + PADDING;
  commands.forEach((cmd, index) => {
    const col = index % COLUMNS;
    const row = Math.floor(index / COLUMNS);
    const cardX = PADDING + col * (CARD_WIDTH + GAP);
    const cardY = gridStartY + row * (CARD_HEIGHT + GAP);

    // Card kính mờ để lớp màu pha loang vẫn hiện nhẹ phía sau.
    ctx.shadowColor = "rgba(0, 0, 0, 0.28)";
    ctx.shadowBlur = 8;
    ctx.shadowOffsetY = 3;
    drawRoundedBox(ctx, cardX, cardY, CARD_WIDTH, CARD_HEIGHT, 12, "rgba(8, 12, 30, 0.64)", "rgba(255,255,255,.20)", 1);
    ctx.shadowBlur = 0;
    ctx.shadowOffsetY = 0;

    // Tên lệnh (Centered, Bigger)
    ctx.textAlign = "center";
    ctx.font = `bold 30px ${mainFont}`;
    ctx.fillStyle = "#8DE9FF";
    let commandLabel = String(cmd.name).split(/[\s\[<{|]/)[0].replace(/^[^a-zA-Z0-9À-ỹ]+/, "");
    ctx.fillText(commandLabel, cardX + CARD_WIDTH / 2, cardY + 45);

    // Decorative tiny line (Centered)
    ctx.fillStyle = "rgba(141, 233, 255, .42)";
    ctx.fillRect(cardX + CARD_WIDTH / 2 - 30, cardY + 58, 60, 4);

    // Mô tả lệnh
    ctx.textAlign = "left";
    ctx.font = `20px ${mainFont}`;
    ctx.fillStyle = "#E6EEFF";
    const descLines = wrapTextLines(ctx, cmd.description, CARD_WIDTH - 48, 3);
    let lineY = cardY + 95;
    for (const line of descLines) {
      ctx.fillText(line, cardX + 24, lineY);
      lineY += 28;
    }

    // Badge "Sử dụng" ở góc dưới
    const badgeText = "Xem chi tiết ➔";
    ctx.font = `600 15px ${mainFont}`;
    const badgeWidth = ctx.measureText(badgeText).width + 24;
    const badgeHeight = 28;
    const badgeX = cardX + CARD_WIDTH - badgeWidth - 16;
    const badgeY = cardY + CARD_HEIGHT - badgeHeight - 12;

    drawRoundedBox(ctx, badgeX, badgeY, badgeWidth, badgeHeight, 8, "rgba(141, 233, 255, .14)", "rgba(141, 233, 255, .22)", 1);
    ctx.fillStyle = "#8DE9FF";
    ctx.textAlign = "center";
    ctx.fillText(badgeText, badgeX + badgeWidth / 2, badgeY + 19);
  });

  // Thanh chân trang (Phân trang)
  const footerY = gridStartY + rows * CARD_HEIGHT + (rows - 1) * GAP + 25;
  const footerWidth = width - PADDING * 2;

  drawRoundedBox(ctx, PADDING, footerY, footerWidth, FOOTER_HEIGHT - 10, 16, "rgba(8, 12, 30, 0.62)", "rgba(255,255,255,.20)", 1);

  ctx.textAlign = "center";
  ctx.font = `600 22px ${mainFont}`;
  ctx.fillStyle = "#E6EEFF";
  ctx.fillText(`Trang ${page} / ${totalPages}   •   Reply menu và nhập số trang`, width / 2, footerY + 38);

  const filePath = path.resolve(`./assets/menu_${Date.now()}.png`);
  const out = fs.createWriteStream(filePath);
  const stream = canvas.createPNGStream();
  stream.pipe(out);
  return new Promise((resolve, reject) => {
    out.on("finish", () => resolve(filePath));
    out.on("error", reject);
  });
}

// Tạo Hình Lệnh !Help với giao diện hiện đại
export async function createInstructionsImage(helpContent, isAdminBox) {
  const dimensions = calculateOptimalDimensions(helpContent, isAdminBox);
  const canvas = createCanvas(dimensions.width, dimensions.height);
  const ctx = canvas.getContext("2d");

  const backgroundGradient = ctx.createLinearGradient(0, 0, 0, dimensions.height);
  backgroundGradient.addColorStop(0, "#052E2A");
  backgroundGradient.addColorStop(0.5, "#02221E");
  backgroundGradient.addColorStop(1, "#000000");
  ctx.fillStyle = backgroundGradient;
  ctx.fillRect(0, 0, dimensions.width, dimensions.height);

  let currentY = dimensions.padding + 20;

  ctx.textAlign = "center";
  ctx.font = "bold 40px Tahoma";
  const titleGradient = ctx.createLinearGradient(0, currentY - 30, dimensions.width, currentY + 10);
  titleGradient.addColorStop(0, "#60A5FA");
  titleGradient.addColorStop(1, "#A78BFA");
  ctx.fillStyle = titleGradient;
  ctx.fillText(helpContent.title, dimensions.width / 2, currentY);

  ctx.strokeStyle = titleGradient;
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(dimensions.width / 2 - 150, currentY + 15);
  ctx.lineTo(dimensions.width / 2 + 150, currentY + 15);
  ctx.stroke();

  currentY += 80;

  currentY = drawCommandSection(ctx, helpContent.allMembers, currentY, dimensions, "Commands");

  if (isAdminBox && helpContent.admin && Object.keys(helpContent.admin).length > 0) {
    currentY += 20;
    currentY = drawCommandSection(
      ctx,
      helpContent.admin,
      currentY,
      dimensions,
      helpContent.titleAdmin || "Admin Commands"
    );
  }

  const filePath = path.resolve(`./assets/help_.png`);
  const out = fs.createWriteStream(filePath);
  const stream = canvas.createPNGStream();
  stream.pipe(out);
  return new Promise((resolve, reject) => {
    out.on("finish", () => resolve(filePath));
    out.on("error", reject);
  });
}

function drawCommandSection(ctx, commands, startY, dimensions, sectionTitle) {
  let currentY = startY;

  if (sectionTitle && sectionTitle !== "Commands") {
    ctx.textAlign = "left";
    ctx.font = "bold 32px Tahoma";
    const sectionGradient = ctx.createLinearGradient(0, currentY - 20, dimensions.width, currentY + 10);
    sectionGradient.addColorStop(0, "#F59E0B");
    sectionGradient.addColorStop(1, "#EF4444");
    ctx.fillStyle = sectionGradient;
    ctx.fillText(sectionTitle, dimensions.padding, currentY);
    currentY += 50;
  }

  for (const key in commands) {
    if (commands.hasOwnProperty(key)) {
      const command = commands[key];
      const rowY = currentY;

      ctx.font = "bold 28px Tahoma";
      const commandText = `${command.icon} ${command.command}`;
      const commandTextWidth = ctx.measureText(commandText).width;

      ctx.font = "bold 28px Tahoma";
      const descTextWidth = ctx.measureText(command.description).width;

      const totalAvailableWidth = dimensions.width - dimensions.padding * 2 - dimensions.boxSpacing;

      const commandActualWidth = commandTextWidth + 40;
      const descActualWidth = descTextWidth + 40;

      const totalUsedWidth = commandActualWidth + descActualWidth;
      const remainingSpace = Math.max(0, totalAvailableWidth - totalUsedWidth);
      const extraSpacePerBox = remainingSpace / 2;

      // Final widths
      const finalCommandWidth = commandActualWidth + extraSpacePerBox;
      const finalDescWidth = descActualWidth + extraSpacePerBox;

      const commandBoxX = dimensions.padding;
      const commandBoxY = rowY - 28;

      drawRoundedBox(
        ctx,
        commandBoxX,
        commandBoxY,
        finalCommandWidth,
        70,
        12,
        "rgba(59, 130, 246, 0.15)",
        "rgba(59, 130, 246, 0.3)",
        1
      );

      ctx.textAlign = "left";
      ctx.font = "bold 28px Tahoma";
      const commandGradient = ctx.createLinearGradient(
        commandBoxX,
        commandBoxY,
        commandBoxX + finalCommandWidth,
        commandBoxY + 60
      );
      commandGradient.addColorStop(0, "#60A5FA");
      commandGradient.addColorStop(1, "#3B82F6");
      ctx.fillStyle = commandGradient;
      ctx.fillText(commandText, commandBoxX + 20, rowY + 15);

      const descBoxX = commandBoxX + finalCommandWidth + dimensions.boxSpacing;
      const descBoxY = rowY - 28;

      drawRoundedBox(
        ctx,
        descBoxX,
        descBoxY,
        finalDescWidth,
        70,
        12,
        "rgba(34, 197, 94, 0.15)",
        "rgba(34, 197, 94, 0.3)",
        1
      );

      ctx.textAlign = "right";
      ctx.font = "bold 28px Tahoma";
      ctx.fillStyle = "#E2E8F0";

      const maxDescWidth = finalDescWidth - 40;
      const words = command.description.split(" ");
      let line = "";
      let lineY = rowY + 15;

      for (let i = 0; i < words.length; i++) {
        const testLine = line + words[i] + " ";
        const testWidth = ctx.measureText(testLine).width;

        if (testWidth > maxDescWidth && i > 0) {
          ctx.fillText(line, descBoxX + finalDescWidth - 20, lineY);
          line = words[i] + " ";
          lineY += 30;
        } else {
          line = testLine;
        }
      }
      ctx.fillText(line, descBoxX + finalDescWidth - 20, lineY);

      currentY += 90;
    }
  }

  return currentY;
}
