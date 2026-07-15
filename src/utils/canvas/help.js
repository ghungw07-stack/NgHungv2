import { createCanvas, loadImage } from "canvas";
import fs from "fs";
import path from "path";
import * as cv from "./index.js";

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

// Tạo hình ảnh Menu dạng lưới thẻ (card grid), có phân trang, số lượng lệnh cập nhật động
export async function createMenuGridImage({ botName, commands, page, totalPages, totalCommands }) {
  const COLUMNS = 4;
  const CARD_WIDTH = 380;
  const CARD_HEIGHT = 190;
  const GAP = 26;
  const PADDING = 44;
  const HEADER_HEIGHT = 170;
  const FOOTER_HEIGHT = 90;

  const rows = Math.max(1, Math.ceil(commands.length / COLUMNS));
  const width = PADDING * 2 + COLUMNS * CARD_WIDTH + (COLUMNS - 1) * GAP;
  const height = HEADER_HEIGHT + rows * CARD_HEIGHT + (rows - 1) * GAP + FOOTER_HEIGHT + PADDING * 2;

  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext("2d");

  // Nền gradient dịu mắt (xanh lam nhạt -> tím nhạt), không chói không tối
  const bgGradient = ctx.createLinearGradient(0, 0, width, height);
  bgGradient.addColorStop(0, "#E6ECFB");
  bgGradient.addColorStop(0.5, "#ECE7FB");
  bgGradient.addColorStop(1, "#F3E8F7");
  ctx.fillStyle = bgGradient;
  ctx.fillRect(0, 0, width, height);

  // Thanh tiêu đề
  const headerX = PADDING;
  const headerY = PADDING;
  const headerWidth = width - PADDING * 2;
  const headerHeightBox = HEADER_HEIGHT - 20;
  drawRoundedBox(ctx, headerX, headerY, headerWidth, headerHeightBox, 22, "rgba(255,255,255,0.85)");

  ctx.textAlign = "center";
  ctx.font = "bold 44px Tahoma";
  const titleGradient = ctx.createLinearGradient(width / 2 - 200, 0, width / 2 + 200, 0);
  titleGradient.addColorStop(0, "#4338CA");
  titleGradient.addColorStop(1, "#7C3AED");
  ctx.fillStyle = titleGradient;
  ctx.fillText("✨ DANH SÁCH LỆNH ✨", width / 2, headerY + 60);

  ctx.font = "28px Tahoma";
  ctx.fillStyle = "#475569";
  ctx.fillText(`Bot: ${botName || "Bot"} - ${totalCommands} lệnh`, width / 2, headerY + 105);

  // Vẽ các thẻ lệnh
  const gridStartY = HEADER_HEIGHT + PADDING;
  commands.forEach((cmd, index) => {
    const col = index % COLUMNS;
    const row = Math.floor(index / COLUMNS);
    const cardX = PADDING + col * (CARD_WIDTH + GAP);
    const cardY = gridStartY + row * (CARD_HEIGHT + GAP);

    drawRoundedBox(ctx, cardX, cardY, CARD_WIDTH, CARD_HEIGHT, 18, "#FFFFFF", "rgba(99, 102, 241, 0.18)", 1.5);

    // Pill tên lệnh
    const pillX = cardX + 20;
    const pillY = cardY + 20;
    const pillWidth = CARD_WIDTH - 40;
    const pillHeight = 62;
    drawRoundedBox(ctx, pillX, pillY, pillWidth, pillHeight, 12, "#EEF2FF");

    ctx.textAlign = "center";
    ctx.font = "bold 38px Tahoma";
    ctx.fillStyle = "#4338CA";
    // Chỉ lấy phần tên lệnh gốc, bỏ tham số [..]/<..>/{..} và bỏ prefix (., !, /, ...) phía trước
    let commandLabel = String(cmd.name).split(/[\s\[<{|]/)[0].replace(/^[^a-zA-Z0-9À-ỹ]+/, "");
    while (ctx.measureText(commandLabel).width > pillWidth - 24 && commandLabel.length > 0) {
      commandLabel = commandLabel.slice(0, -1);
    }
    ctx.fillText(commandLabel, pillX + pillWidth / 2, pillY + 43);

    ctx.textAlign = "left";
    // Mô tả lệnh
    ctx.font = "22px Tahoma";
    ctx.fillStyle = "#475569";
    const descLines = wrapTextLines(ctx, cmd.description, CARD_WIDTH - 40, 3);
    let lineY = pillY + pillHeight + 34;
    for (const line of descLines) {
      ctx.fillText(line, cardX + 20, lineY);
      lineY += 28;
    }
  });

  // Thanh chân trang
  const footerY = gridStartY + rows * CARD_HEIGHT + (rows - 1) * GAP + 24;
  const footerWidth = width - PADDING * 2;
  drawRoundedBox(ctx, PADDING, footerY, footerWidth, FOOTER_HEIGHT - 24, 18, "rgba(255,255,255,0.85)");

  ctx.textAlign = "center";
  ctx.font = "bold 24px Tahoma";
  ctx.fillStyle = "#4338CA";
  ctx.fillText(`📄 Trang ${page}/${totalPages}`, width / 2, footerY + 32);
  ctx.font = "20px Tahoma";
  ctx.fillStyle = "#64748B";
  ctx.fillText(`Nhắn số trang bạn muốn xem (ví dụ: 2) để chuyển trang`, width / 2, footerY + 58);

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