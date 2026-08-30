import { createCanvas, loadImage } from "canvas";
import fs from "fs";
import path from "path";
import { FONT_MAIN, FONT_MENU, FONT_MENU_SORA, randomIDTemp } from "../format-util.js";
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

// Card bo tròn bất đối xứng, hai cạnh được đẩy nhẹ để tạo cảm giác "xéo".
function drawSlantedCard(ctx, x, y, width, height, radius, slant, fillColor, strokeColor = null, strokeWidth = 1) {
  const topLeft = x + Math.max(0, slant);
  const topRight = x + width + Math.min(0, slant);
  const bottomLeft = x + Math.max(0, -slant);
  const bottomRight = x + width + Math.min(0, -slant);
  ctx.beginPath();
  ctx.moveTo(topLeft + radius, y);
  ctx.lineTo(topRight - radius, y);
  ctx.quadraticCurveTo(topRight, y, topRight, y + radius);
  ctx.lineTo(bottomRight, y + height - radius);
  ctx.quadraticCurveTo(bottomRight, y + height, bottomRight - radius, y + height);
  ctx.lineTo(bottomLeft + radius, y + height);
  ctx.quadraticCurveTo(bottomLeft, y + height, bottomLeft, y + height - radius);
  ctx.lineTo(topLeft, y + radius);
  ctx.quadraticCurveTo(topLeft, y, topLeft + radius, y);
  ctx.closePath();
  if (fillColor) { ctx.fillStyle = fillColor; ctx.fill(); }
  if (strokeColor) { ctx.strokeStyle = strokeColor; ctx.lineWidth = strokeWidth; ctx.stroke(); }
}

// Bo chéo mềm: hai góc đối diện bo rộng, hai góc còn lại bo gọn.
function drawDiagonalRoundCard(ctx, x, y, width, height, fillColor, strokeColor = null, strokeWidth = 1) {
  const large = 46;
  const small = 22;
  ctx.beginPath();
  ctx.moveTo(x + large, y);
  ctx.lineTo(x + width - small, y);
  ctx.quadraticCurveTo(x + width, y, x + width, y + small);
  ctx.lineTo(x + width, y + height - large);
  ctx.quadraticCurveTo(x + width, y + height, x + width - large, y + height);
  ctx.lineTo(x + small, y + height);
  ctx.quadraticCurveTo(x, y + height, x, y + height - small);
  ctx.lineTo(x, y + large);
  ctx.quadraticCurveTo(x, y, x + large, y);
  ctx.closePath();
  if (fillColor) { ctx.fillStyle = fillColor; ctx.fill(); }
  if (strokeColor) { ctx.strokeStyle = strokeColor; ctx.lineWidth = strokeWidth; ctx.stroke(); }
}

function drawImageCover(ctx, image, x, y, width, height) {
  const scale = Math.max(width / image.width, height / image.height);
  const sourceWidth = width / scale;
  const sourceHeight = height / scale;
  const sourceX = (image.width - sourceWidth) / 2;
  const sourceY = (image.height - sourceHeight) / 2;
  ctx.drawImage(image, sourceX, sourceY, sourceWidth, sourceHeight, x, y, width, height);
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

function saveMenuCanvas(canvas) {
  if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir, { recursive: true });
  const filePath = path.join(tempDir, `menu_${randomIDTemp()}.jpg`);
  const out = fs.createWriteStream(filePath);
  canvas.createJPEGStream({ quality: 0.9, chromaSubsampling: true }).pipe(out);
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
    if (["doanso", "noitu", "doantu", "vuatiengviet", "duoihinhbatchu", "ailatrieuphu", "cauca", "caro", "covua", "cotuong", "nuoithu", "tutien", "zaclwarrior"].includes(key)) return "MINI GAME & NHẬP VAI";
    return "TRÒ CHƠI GIẢI TRÍ";
  };

  const sections = [];
  for (const title of ["HỒ SƠ & XẾP HẠNG", "TRÒ CHƠI GIẢI TRÍ", "MINI GAME & NHẬP VAI", "NGÂN HÀNG GAME"]) {
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

async function createMenuGridImageLegacy({ botName, commands, page, totalPages, totalCommands }) {
  const COLUMNS = 4;
  const CARD_WIDTH = 350;
  const CARD_HEIGHT = 154;
  const GAP_X = 20;
  const GAP_Y = 20;
  const PADDING = 44;
  const HEADER_HEIGHT = 220;
  const FOOTER_HEIGHT = 104;

  const rows = Math.max(1, Math.ceil(commands.length / COLUMNS));
  const width = PADDING * 2 + COLUMNS * CARD_WIDTH + (COLUMNS - 1) * GAP_X;
  const height = HEADER_HEIGHT + rows * CARD_HEIGHT + (rows - 1) * GAP_Y + FOOTER_HEIGHT + PADDING * 2;

  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext("2d");

  // Nền vẫn hoạt động khi file ảnh trang trí bị thiếu lúc deploy.
  const base = ctx.createLinearGradient(0, 0, width, height);
  base.addColorStop(0, "#07152d");
  base.addColorStop(0.5, "#092c40");
  base.addColorStop(1, "#160f32");
  ctx.fillStyle = base;
  ctx.fillRect(0, 0, width, height);
  try {
    const landscape = await loadImage(path.resolve("./assets/images/help-landscape.png"));
    ctx.save();
    ctx.globalAlpha = 0.64;
    drawImageCover(ctx, landscape, 0, 0, width, height);
    ctx.restore();
  } catch (error) {
    console.warn("[canvas-menu] Không thể load ảnh nền, dùng gradient:", error?.message || error);
  }

  // Các dải sáng aurora giúp nền có chiều sâu mà không cạnh tranh với nội dung.
  const glows = [
    [width * 0.12, height * 0.2, width * 0.72, "rgba(31,213,196,.2)"],
    [width * 0.92, height * 0.42, width * 0.62, "rgba(139,92,246,.24)"],
    [width * 0.48, height * 1.02, width * 0.68, "rgba(41,156,255,.18)"],
  ];
  for (const [x, y, radius, color] of glows) {
    const glow = ctx.createRadialGradient(x, y, 0, x, y, radius);
    glow.addColorStop(0, color);
    glow.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = glow;
    ctx.fillRect(0, 0, width, height);
  }
  const shade = ctx.createLinearGradient(0, 0, 0, height);
  shade.addColorStop(0, "rgba(2,10,25,.16)");
  shade.addColorStop(.48, "rgba(2,14,26,.28)");
  shade.addColorStop(1, "rgba(2,8,20,.7)");
  ctx.fillStyle = shade; ctx.fillRect(0, 0, width, height);
  drawRoundedBox(ctx, 18, 18, width - 36, height - 36, 34, null, "rgba(216,244,255,.22)", 2);

  // Header
  const title = String(botName || "BOT").toUpperCase();
  ctx.textAlign = "left";
  ctx.font = `600 18px ${FONT_MENU_SORA}`;
  ctx.fillStyle = "#75e8d3";
  ctx.fillText("COMMAND CENTER", PADDING + 4, 70);
  ctx.shadowColor = "rgba(0,0,0,.4)"; ctx.shadowBlur = 16; ctx.shadowOffsetY = 6;
  ctx.font = `800 56px ${FONT_MENU_SORA}`; ctx.fillStyle = "#f7fbff";
  ctx.fillText(truncateText(ctx, title, width - 390), PADDING, 137);
  ctx.shadowBlur = 0; ctx.shadowOffsetY = 0;
  ctx.font = `400 21px ${FONT_MENU_SORA}`; ctx.fillStyle = "#b9ccdc";
  ctx.fillText(`${totalCommands} lệnh đang sẵn sàng  •  Chọn trang bằng cách reply số`, PADDING + 2, 177);

  const pageChipW = 198;
  const pageChipX = width - PADDING - pageChipW;
  drawRoundedBox(ctx, pageChipX, 65, pageChipW, 92, 24, "rgba(5,20,38,.66)", "rgba(117,232,211,.38)", 1.5);
  ctx.textAlign = "center";
  ctx.font = `500 14px ${FONT_MENU_SORA}`; ctx.fillStyle = "#84aabd";
  ctx.fillText("TRANG HIỆN TẠI", pageChipX + pageChipW / 2, 96);
  ctx.font = `800 36px ${FONT_MENU_SORA}`; ctx.fillStyle = "#f7fbff";
  ctx.fillText(`${String(page).padStart(2, "0")} / ${String(totalPages).padStart(2, "0")}`, pageChipX + pageChipW / 2, 137);

  const divider = ctx.createLinearGradient(PADDING, 0, width - PADDING, 0);
  divider.addColorStop(0, "rgba(117,232,211,.7)");
  divider.addColorStop(.5, "rgba(139,180,255,.2)");
  divider.addColorStop(1, "rgba(139,180,255,0)");
  ctx.fillStyle = divider;
  ctx.fillRect(PADDING, 205, width - PADDING * 2, 2);

  // Vẽ các thẻ lệnh
  const gridStartY = HEADER_HEIGHT + PADDING;
  commands.forEach((cmd, index) => {
    const col = index % COLUMNS;
    const row = Math.floor(index / COLUMNS);
    const cardX = PADDING + col * (CARD_WIDTH + GAP_X);
    const cardY = gridStartY + row * (CARD_HEIGHT + GAP_Y);
    const accent = cmd.permission === "all" ? "#75e8d3" : "#ffca80";
    ctx.shadowColor = "rgba(0,0,0,.34)"; ctx.shadowBlur = 14; ctx.shadowOffsetY = 7;
    drawRoundedBox(ctx, cardX, cardY, CARD_WIDTH, CARD_HEIGHT, 24, "rgba(4,19,34,.78)", "rgba(190,226,238,.22)", 1.25);
    ctx.shadowBlur = 0;
    ctx.shadowOffsetY = 0;

    drawRoundedBox(ctx, cardX + 17, cardY + 18, 46, 46, 14, `${accent}18`, `${accent}66`, 1.5);
    ctx.textAlign = "center";
    ctx.font = `700 16px ${FONT_MENU_SORA}`;
    ctx.fillStyle = accent;
    ctx.fillText(String((page - 1) * 16 + index + 1).padStart(2, "0"), cardX + 40, cardY + 47);

    ctx.textAlign = "left";
    ctx.font = `700 21px ${FONT_MENU_SORA}`;
    ctx.fillStyle = "#f4f8fc";
    const commandLabel = String(cmd.name).replace(/^[^a-zA-Z0-9À-ỹ]+/, "");
    ctx.fillText(truncateText(ctx, commandLabel, CARD_WIDTH - 168), cardX + 76, cardY + 46);

    ctx.font = `400 16px ${FONT_MENU_SORA}`; ctx.fillStyle = "#b9cad7";
    const descLines = wrapTextLines(ctx, cmd.description, CARD_WIDTH - 36, 3);
    let lineY = cardY + 86;
    for (const line of descLines) {
      ctx.fillText(line, cardX + 18, lineY); lineY += 23;
    }

    const isMemberCommand = cmd.permission === "all";
    const badgeText = isMemberCommand ? "ALL" : "ADMIN";
    const badgeColor = isMemberCommand ? "#75e8d3" : "#ffca80";
    const badgeFill = isMemberCommand ? "rgba(54,196,173,.12)" : "rgba(218,145,63,.14)";
    ctx.font = `700 12px ${FONT_MENU_SORA}`;
    const badgeWidth = ctx.measureText(badgeText).width + 24;
    const badgeX = cardX + CARD_WIDTH - badgeWidth - 14;
    const badgeY = cardY + 18;
    drawRoundedBox(ctx, badgeX, badgeY, badgeWidth, 23, 11, badgeFill, `${badgeColor}44`, 1);
    ctx.fillStyle = badgeColor;
    ctx.textAlign = "center";
    ctx.fillText(badgeText, badgeX + badgeWidth / 2, badgeY + 16);
  });

  // Thanh chân trang (Phân trang)
  const footerY = gridStartY + rows * CARD_HEIGHT + (rows - 1) * GAP_Y + 25;
  const footerWidth = width - PADDING * 2;

  drawRoundedBox(ctx, PADDING, footerY, footerWidth, FOOTER_HEIGHT - 10, 24, "rgba(4,18,33,.72)", "rgba(117,232,211,.24)", 1);

  ctx.textAlign = "center";
  ctx.font = `500 18px ${FONT_MENU_SORA}`;
  ctx.fillStyle = "#c5d8e4";
  ctx.fillText(`Reply 1–${totalPages} để chuyển trang     •     Nhập 0 để đóng menu`, width / 2, footerY + 42);

  const filePath = path.resolve(`./assets/menu_${Date.now()}.png`);
  const out = fs.createWriteStream(filePath);
  const stream = canvas.createPNGStream();
  stream.pipe(out);
  return new Promise((resolve, reject) => {
    out.on("finish", () => resolve(filePath));
    out.on("error", reject);
  });
}

export interface MenuCommand {
  name: string;
  description?: string;
  permission?: string;
}

export interface MenuGridOptions {
  botName?: string;
  commands: MenuCommand[];
  page: number;
  totalPages: number;
  totalCommands: number;
}

// Bo tròn theo cung tròn thật như CSS border-radius. Helper canvas cũ dùng
// quadraticCurveTo nên khi radius lớn sẽ tạo cảm giác góc bị phồng.
function drawMenuRoundedBox(
  ctx,
  x,
  y,
  width,
  height,
  radius,
  fillColor = null,
  strokeColor = null,
  strokeWidth = 1
) {
  const r = Math.max(0, Math.min(radius, width / 2, height / 2));
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + width - r, y);
  ctx.arcTo(x + width, y, x + width, y + r, r);
  ctx.lineTo(x + width, y + height - r);
  ctx.arcTo(x + width, y + height, x + width - r, y + height, r);
  ctx.lineTo(x + r, y + height);
  ctx.arcTo(x, y + height, x, y + height - r, r);
  ctx.lineTo(x, y + r);
  ctx.arcTo(x, y, x + r, y, r);
  ctx.closePath();
  if (fillColor) { ctx.fillStyle = fillColor; ctx.fill(); }
  if (strokeColor) { ctx.strokeStyle = strokeColor; ctx.lineWidth = strokeWidth; ctx.stroke(); }
}

function traceMenuRoundedPath(ctx, x, y, width, height, radius) {
  const r = Math.max(0, Math.min(radius, width / 2, height / 2));
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + width - r, y);
  ctx.arcTo(x + width, y, x + width, y + r, r);
  ctx.lineTo(x + width, y + height - r);
  ctx.arcTo(x + width, y + height, x + width - r, y + height, r);
  ctx.lineTo(x + r, y + height);
  ctx.arcTo(x, y + height, x, y + height - r, r);
  ctx.lineTo(x, y + r);
  ctx.arcTo(x, y, x + r, y, r);
  ctx.closePath();
}

// Card menu chỉ bo hai góc đối diện: trên-trái và dưới-phải.
function drawDiagonalMenuCard(ctx, x, y, width, height, radius, fillColor, strokeColor, strokeWidth = 1) {
  const r = Math.max(0, Math.min(radius, width / 2, height / 2));
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + width, y);
  ctx.lineTo(x + width, y + height - r);
  ctx.arcTo(x + width, y + height, x + width - r, y + height, r);
  ctx.lineTo(x, y + height);
  ctx.lineTo(x, y + r);
  ctx.arcTo(x, y, x + r, y, r);
  ctx.closePath();
  ctx.fillStyle = fillColor;
  ctx.fill();
  ctx.strokeStyle = strokeColor;
  ctx.lineWidth = strokeWidth;
  ctx.stroke();
}

function drawGalaxyBackground(ctx, width, height) {
  // Petrol glass: xanh trung tính vừa sáng, dịu mắt và giữ chữ trắng nổi rõ.
  const space = ctx.createLinearGradient(0, 0, width, height);
  space.addColorStop(0, "#07263e");
  space.addColorStop(0.32, "#104c67");
  space.addColorStop(0.68, "#267386");
  space.addColorStop(1, "#4b8790");
  ctx.fillStyle = space;
  ctx.fillRect(0, 0, width, height);

  ctx.save();
  ctx.globalCompositeOperation = "screen";
  const glows = [
    [width * 0.04, height * 0.08, width * 0.48, "rgba(41,161,206,.24)"],
    [width * 0.45, height * 0.95, width * 0.5, "rgba(74,202,190,.18)"],
    [width * 0.76, height * 0.12, width * 0.5, "rgba(122,194,207,.16)"],
    [width * 1.02, height * 0.55, width * 0.36, "rgba(217,202,151,.12)"],
  ];
  for (const [x, y, radius, color] of glows) {
    const glow = ctx.createRadialGradient(x, y, 0, x, y, radius);
    glow.addColorStop(0, color);
    glow.addColorStop(0.48, color.replace(/\.[0-9]+\)$/, ".08)"));
    glow.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = glow;
    ctx.fillRect(0, 0, width, height);
  }

  // Các dải ánh sáng xanh-bạc tạo chiều sâu nhưng không gây rối bên dưới nội dung.
  const ribbons = [
    [height * 0.78, "rgba(132,220,225,.13)", 150],
    [height * 0.67, "rgba(55,163,188,.14)", 105],
    [height * 0.57, "rgba(211,199,153,.06)", 72],
  ];
  for (const [centerY, color, thickness] of ribbons) {
    ctx.beginPath();
    ctx.moveTo(-120, centerY + 60);
    ctx.bezierCurveTo(width * 0.22, centerY - 260, width * 0.46, centerY + 190, width * 0.7, centerY - 80);
    ctx.bezierCurveTo(width * 0.84, centerY - 230, width * 0.96, centerY + 35, width + 120, centerY - 190);
    ctx.lineTo(width + 120, centerY - 190 + thickness);
    ctx.bezierCurveTo(width * 0.84, centerY + thickness, width * 0.72, centerY - 10, width * 0.54, centerY + thickness);
    ctx.bezierCurveTo(width * 0.32, centerY + thickness + 110, width * 0.12, centerY - 80, -120, centerY + thickness + 60);
    ctx.closePath();
    ctx.fillStyle = color;
    ctx.shadowColor = color;
    ctx.shadowBlur = 42;
    ctx.fill();
  }
  ctx.shadowBlur = 0;
  ctx.restore();

  // Họa tiết đường cong mảnh đem lại cảm giác công nghệ, chỉ hiện nhẹ ở nền.
  ctx.save();
  ctx.globalAlpha = 0.2;
  for (let index = 0; index < 9; index++) {
    const y = height * 0.42 + index * 55;
    ctx.beginPath();
    ctx.moveTo(-40, y);
    ctx.bezierCurveTo(width * 0.25, y - 170, width * 0.58, y + 120, width + 40, y - 100);
    ctx.strokeStyle = index % 2 ? "rgba(171,225,230,.2)" : "rgba(64,153,176,.18)";
    ctx.lineWidth = 1.2;
    ctx.stroke();
  }
  ctx.restore();

  // Hạt sáng cố định, thưa và dịu hơn để menu không bị cảm giác lấm tấm.
  let seed = 0x4e474855;
  const random = () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 0x100000000;
  };
  for (let index = 0; index < 90; index++) {
    const x = random() * width;
    const y = random() * height;
    const radius = 0.5 + random() * 1.4;
    ctx.beginPath();
    ctx.arc(x, y, radius, 0, Math.PI * 2);
    ctx.fillStyle = `rgba(240,252,255,${0.14 + random() * 0.3})`;
    ctx.fill();
  }

  const vignette = ctx.createRadialGradient(width / 2, height * 0.48, height * 0.12, width / 2, height * 0.48, width * 0.68);
  vignette.addColorStop(0, "rgba(0,0,0,0)");
  vignette.addColorStop(0.72, "rgba(0,19,34,.06)");
  vignette.addColorStop(1, "rgba(0,15,29,.4)");
  ctx.fillStyle = vignette;
  ctx.fillRect(0, 0, width, height);
}

function drawAbstractMenuBackground(ctx, width, height) {
  const base = ctx.createLinearGradient(0, height, width, 0);
  base.addColorStop(0, "#061a31");
  base.addColorStop(0.34, "#0b4161");
  base.addColorStop(0.68, "#287b8f");
  base.addColorStop(1, "#d29a4e");
  ctx.fillStyle = base;
  ctx.fillRect(0, 0, width, height);

  const lights = [
    [width * 0.06, height * 0.15, width * 0.52, "rgba(0,15,42,.72)"],
    [width * 0.55, height * 0.62, width * 0.38, "rgba(48,172,192,.3)"],
    [width * 0.96, height * 0.05, width * 0.42, "rgba(255,196,104,.58)"],
  ];
  for (const [x, y, radius, color] of lights) {
    const glow = ctx.createRadialGradient(x, y, 0, x, y, radius);
    glow.addColorStop(0, color);
    glow.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = glow;
    ctx.fillRect(0, 0, width, height);
  }

  ctx.save();
  ctx.globalCompositeOperation = "screen";
  for (let index = 0; index < 18; index++) {
    const offset = index * 54 - 180;
    ctx.beginPath();
    ctx.moveTo(-120, height + offset * 0.42);
    ctx.bezierCurveTo(
      width * 0.22,
      height * 0.92 + offset,
      width * 0.58,
      height * 0.15 + offset * 0.48,
      width + 160,
      -80 + offset * 0.24
    );
    ctx.strokeStyle = index % 3 === 0
      ? "rgba(177,229,238,.12)"
      : index % 3 === 1
        ? "rgba(70,157,191,.1)"
        : "rgba(247,204,129,.08)";
    ctx.lineWidth = 18 + (index % 5) * 8;
    ctx.stroke();
  }
  ctx.restore();

  ctx.save();
  ctx.globalCompositeOperation = "overlay";
  for (let index = 0; index < 10; index++) {
    const x = width * (0.58 + index * 0.055);
    const y = height * (0.08 + (index % 4) * 0.12);
    const radius = 48 + (index % 3) * 34;
    const bubble = ctx.createRadialGradient(x, y, radius * 0.1, x, y, radius);
    bubble.addColorStop(0, "rgba(255,227,172,.3)");
    bubble.addColorStop(0.72, "rgba(196,138,66,.1)");
    bubble.addColorStop(1, "rgba(30,78,99,0)");
    ctx.fillStyle = bubble;
    ctx.beginPath();
    ctx.arc(x, y, radius, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();

  let seed = 0x5455414e;
  const random = () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 0x100000000;
  };
  ctx.save();
  ctx.globalCompositeOperation = "soft-light";
  for (let index = 0; index < 520; index++) {
    const x = random() * width;
    const y = random() * height;
    const radius = 0.5 + random() * 2.7;
    ctx.beginPath();
    ctx.arc(x, y, radius, 0, Math.PI * 2);
    ctx.fillStyle = random() > 0.55
      ? `rgba(222,240,241,${0.04 + random() * 0.12})`
      : `rgba(4,22,42,${0.05 + random() * 0.14})`;
    ctx.fill();
  }
  ctx.restore();

  const vignette = ctx.createRadialGradient(width / 2, height / 2, height * 0.2, width / 2, height / 2, width * 0.72);
  vignette.addColorStop(0, "rgba(0,0,0,0)");
  vignette.addColorStop(1, "rgba(0,9,20,.34)");
  ctx.fillStyle = vignette;
  ctx.fillRect(0, 0, width, height);
}

function drawEditorialLandscapeBackground(ctx, width, height) {
  // Bầu trời xanh xám kiểu poster editorial, không dùng dải màu neon/aurora.
  const sky = ctx.createLinearGradient(0, 0, 0, height);
  sky.addColorStop(0, "#19364a");
  sky.addColorStop(0.48, "#416b78");
  sky.addColorStop(1, "#c49a72");
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, width, height);

  // Mặt trời mờ phía chân trời, đặt lệch để không cạnh tranh với tiêu đề.
  ctx.save();
  const sunX = width * 0.83;
  const sunY = height * 0.34;
  const sunGlow = ctx.createRadialGradient(sunX, sunY, 18, sunX, sunY, 245);
  sunGlow.addColorStop(0, "rgba(255,224,158,.68)");
  sunGlow.addColorStop(0.35, "rgba(242,174,104,.24)");
  sunGlow.addColorStop(1, "rgba(242,174,104,0)");
  ctx.fillStyle = sunGlow;
  ctx.fillRect(0, 0, width, height);
  ctx.beginPath();
  ctx.arc(sunX, sunY, 82, 0, Math.PI * 2);
  ctx.fillStyle = "rgba(255,215,143,.82)";
  ctx.fill();
  ctx.restore();

  // Sương ngang giúp các lớp núi có chiều sâu.
  const mist = ctx.createLinearGradient(0, height * 0.28, 0, height * 0.7);
  mist.addColorStop(0, "rgba(226,226,205,0)");
  mist.addColorStop(0.52, "rgba(226,226,205,.16)");
  mist.addColorStop(1, "rgba(226,226,205,0)");
  ctx.fillStyle = mist;
  ctx.fillRect(0, height * 0.2, width, height * 0.58);

  const drawMountainLayer = (baseY, color, points) => {
    ctx.beginPath();
    ctx.moveTo(0, height);
    ctx.lineTo(0, baseY);
    for (const [x, y] of points) ctx.lineTo(x, y);
    ctx.lineTo(width, baseY);
    ctx.lineTo(width, height);
    ctx.closePath();
    ctx.fillStyle = color;
    ctx.fill();
  };

  drawMountainLayer(height * 0.57, "rgba(53,82,85,.54)", [
    [width * 0.08, height * 0.48], [width * 0.18, height * 0.57], [width * 0.32, height * 0.39],
    [width * 0.46, height * 0.56], [width * 0.61, height * 0.43], [width * 0.74, height * 0.58],
    [width * 0.9, height * 0.46],
  ]);
  drawMountainLayer(height * 0.69, "rgba(22,61,68,.7)", [
    [width * 0.1, height * 0.58], [width * 0.24, height * 0.7], [width * 0.4, height * 0.52],
    [width * 0.53, height * 0.68], [width * 0.7, height * 0.54], [width * 0.84, height * 0.7],
    [width * 0.95, height * 0.6],
  ]);
  drawMountainLayer(height * 0.82, "rgba(7,38,51,.9)", [
    [width * 0.12, height * 0.68], [width * 0.26, height * 0.82], [width * 0.43, height * 0.66],
    [width * 0.59, height * 0.81], [width * 0.76, height * 0.65], [width * 0.9, height * 0.8],
  ]);

  // Vân giấy rất nhẹ để nền bớt cảm giác kỹ thuật số phẳng.
  let seed = 0x504f5354;
  const random = () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 0x100000000;
  };
  ctx.save();
  ctx.globalCompositeOperation = "soft-light";
  for (let index = 0; index < 520; index++) {
    const alpha = 0.025 + random() * 0.045;
    ctx.fillStyle = random() > 0.5 ? `rgba(255,255,255,${alpha})` : `rgba(0,20,28,${alpha})`;
    ctx.fillRect(random() * width, random() * height, 1 + random() * 2, 1 + random() * 2);
  }
  ctx.restore();

  const vignette = ctx.createRadialGradient(width / 2, height / 2, height * 0.18, width / 2, height / 2, width * 0.7);
  vignette.addColorStop(0, "rgba(0,0,0,0)");
  vignette.addColorStop(1, "rgba(2,20,29,.32)");
  ctx.fillStyle = vignette;
  ctx.fillRect(0, 0, width, height);
}

function drawAuroraMenuBackground(ctx, width, height) {
  const base = ctx.createLinearGradient(0, 0, width, height);
  base.addColorStop(0, "#030817");
  base.addColorStop(0.42, "#071d35");
  base.addColorStop(0.72, "#102442");
  base.addColorStop(1, "#160d2f");
  ctx.fillStyle = base;
  ctx.fillRect(0, 0, width, height);

  ctx.save();
  ctx.globalCompositeOperation = "screen";
  const auroras = [
    [width * 0.08, height * 0.2, width * 0.5, "rgba(20,112,220,.38)"],
    [width * 0.38, height * 0.82, width * 0.44, "rgba(14,190,186,.3)"],
    [width * 0.62, height * 0.26, width * 0.4, "rgba(72,89,226,.32)"],
    [width * 0.9, height * 0.18, width * 0.34, "rgba(170,68,226,.28)"],
    [width * 0.86, height * 0.92, width * 0.42, "rgba(42,115,225,.26)"],
  ];
  for (const [x, y, radius, color] of auroras) {
    const glow = ctx.createRadialGradient(x, y, 0, x, y, radius);
    glow.addColorStop(0, color);
    glow.addColorStop(0.5, color.replace(/\.[0-9]+\)$/, ".1)"));
    glow.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = glow;
    ctx.fillRect(0, 0, width, height);
  }

  ctx.beginPath();
  ctx.moveTo(-120, height * 0.72);
  ctx.bezierCurveTo(width * 0.22, height * 0.34, width * 0.48, height * 0.98, width * 0.74, height * 0.48);
  ctx.bezierCurveTo(width * 0.86, height * 0.24, width * 0.96, height * 0.38, width + 120, height * 0.12);
  ctx.lineTo(width + 120, height * 0.56);
  ctx.bezierCurveTo(width * 0.8, height * 0.78, width * 0.62, height * 0.62, width * 0.4, height);
  ctx.bezierCurveTo(width * 0.2, height * 0.72, width * 0.08, height * 1.08, -120, height * 0.94);
  ctx.closePath();
  const ribbon = ctx.createLinearGradient(0, height, width, 0);
  ribbon.addColorStop(0, "rgba(20,112,210,.08)");
  ribbon.addColorStop(0.48, "rgba(39,221,201,.14)");
  ribbon.addColorStop(1, "rgba(173,91,244,.1)");
  ctx.fillStyle = ribbon;
  ctx.fill();
  ctx.restore();

  let seed = 0x4e47484d;
  const random = () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 0x100000000;
  };
  for (let index = 0; index < 150; index++) {
    const x = random() * width;
    const y = random() * height;
    const radius = 0.4 + random() * 1.5;
    ctx.beginPath();
    ctx.arc(x, y, radius, 0, Math.PI * 2);
    ctx.fillStyle = `rgba(205,231,255,${0.08 + random() * 0.24})`;
    ctx.fill();
  }

  const vignette = ctx.createRadialGradient(width / 2, height / 2, height * 0.15, width / 2, height / 2, width * 0.72);
  vignette.addColorStop(0, "rgba(0,0,0,0)");
  vignette.addColorStop(1, "rgba(0,3,13,.5)");
  ctx.fillStyle = vignette;
  ctx.fillRect(0, 0, width, height);
}

function drawMeshMenuBackground(ctx, width, height) {
  const base = ctx.createLinearGradient(0, 0, width, height);
  base.addColorStop(0, "#031321");
  base.addColorStop(0.42, "#08324a");
  base.addColorStop(0.72, "#15516a");
  base.addColorStop(1, "#725631");
  ctx.fillStyle = base;
  ctx.fillRect(0, 0, width, height);

  ctx.save();
  ctx.globalCompositeOperation = "screen";
  const mesh = [
    [width * 0.02, height * 0.14, width * 0.48, "rgba(2,29,57,.58)"],
    [width * 0.26, height * 0.88, width * 0.44, "rgba(0,128,164,.22)"],
    [width * 0.55, height * 0.28, width * 0.42, "rgba(48,145,169,.2)"],
    [width * 0.76, height * 0.82, width * 0.38, "rgba(31,105,130,.18)"],
    [width * 0.98, height * 0.06, width * 0.42, "rgba(236,178,91,.32)"],
  ];
  for (const [x, y, radius, color] of mesh) {
    const glow = ctx.createRadialGradient(x, y, 0, x, y, radius);
    glow.addColorStop(0, color);
    glow.addColorStop(0.44, color.replace(/\.[0-9]+\)$/, ".14)"));
    glow.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = glow;
    ctx.fillRect(0, 0, width, height);
  }
  ctx.restore();

  const haze = ctx.createLinearGradient(0, height, width, 0);
  haze.addColorStop(0, "rgba(29,137,163,.06)");
  haze.addColorStop(0.58, "rgba(104,176,184,.025)");
  haze.addColorStop(1, "rgba(255,205,124,.08)");
  ctx.fillStyle = haze;
  ctx.fillRect(0, 0, width, height);

  let seed = 0x57484954;
  const random = () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 0x100000000;
  };
  for (let index = 0; index < 110; index++) {
    const x = random() * width;
    const y = random() * height;
    const radius = 0.4 + random() * 1.2;
    ctx.beginPath();
    ctx.arc(x, y, radius, 0, Math.PI * 2);
    ctx.fillStyle = `rgba(230,242,255,${0.06 + random() * 0.2})`;
    ctx.fill();
  }

  const vignette = ctx.createRadialGradient(width / 2, height / 2, height * 0.18, width / 2, height / 2, width * 0.7);
  vignette.addColorStop(0, "rgba(0,0,0,0)");
  vignette.addColorStop(1, "rgba(0,3,15,.42)");
  ctx.fillStyle = vignette;
  ctx.fillRect(0, 0, width, height);
}

function drawGlassMenuCard(ctx, blurredBackground, canvasWidth, canvasHeight, x, y, width, height, radius) {
  ctx.save();
  ctx.shadowColor = "rgba(0,0,0,.24)";
  ctx.shadowBlur = 18;
  ctx.shadowOffsetY = 8;
  drawMenuRoundedBox(ctx, x, y, width, height, radius, "rgba(3,10,24,.2)", null);
  ctx.restore();

  ctx.save();
  traceMenuRoundedPath(ctx, x, y, width, height, radius);
  ctx.clip();
  ctx.drawImage(blurredBackground, 0, 0, canvasWidth, canvasHeight);
  ctx.fillStyle = "rgba(224,241,248,.12)";
  ctx.fillRect(x, y, width, height);
  ctx.restore();

  const border = ctx.createLinearGradient(x, y, x + width, y + height);
  border.addColorStop(0, "rgba(255,255,255,.62)");
  border.addColorStop(0.32, "rgba(255,255,255,.3)");
  border.addColorStop(0.72, "rgba(255,255,255,.16)");
  border.addColorStop(1, "rgba(255,255,255,.42)");
  drawMenuRoundedBox(ctx, x + 0.75, y + 0.75, width - 1.5, height - 1.5, radius - 0.75, null, border, 1.5);

  const sheen = ctx.createLinearGradient(x, y, x + width * 0.68, y + height * 0.5);
  sheen.addColorStop(0, "rgba(255,255,255,.11)");
  sheen.addColorStop(0.45, "rgba(255,255,255,.025)");
  sheen.addColorStop(1, "rgba(255,255,255,0)");
  drawMenuRoundedBox(ctx, x + 3, y + 3, width - 6, height - 6, radius - 3, sheen, null);
}

let menuBackgroundImagePromise;
function loadMenuBackgroundImage() {
  menuBackgroundImagePromise ||= loadImage(
    path.resolve("./assets/resources/background/menu-landscape-3d.png")
  ).catch((error) => {
    menuBackgroundImagePromise = undefined;
    throw error;
  });
  return menuBackgroundImagePromise;
}

/** Menu help chính: canvas ngang 4 cột × 4 hàng theo mẫu NGHUNG-BOT. */
export async function createMenuGridImage({
  botName,
  commands,
  page,
  totalPages,
  totalCommands,
}: MenuGridOptions): Promise<string> {
  const width = 2048;
  const height = 938;
  const columns = 4;
  const rows = 3;
  const outer = 34;
  const gapX = 36;
  const gapY = 28;
  const gridTop = 200;
  const gridBottom = 904;
  const cardWidth = (width - outer * 2 - gapX * (columns - 1)) / columns;
  const cardHeight = (gridBottom - gridTop - gapY * (rows - 1)) / rows;
  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext("2d");

  // Dùng artwork riêng thay cho nền gradient/phong cảnh canvas. Nếu asset bị
  // thiếu khi deploy, nền petrol vẫn đảm bảo menu có thể render bình thường.
  let cardBackground;
  try {
    cardBackground = await loadMenuBackgroundImage();
    drawImageCover(ctx, cardBackground, 0, 0, width, height);
  } catch (error) {
    console.warn("[canvas-menu] Không thể load menu-landscape-3d.png:", error?.message || error);
    drawGalaxyBackground(ctx, width, height);
  }

  const shade = ctx.createLinearGradient(0, 0, width, height);
  shade.addColorStop(0, "rgba(1,7,21,.12)");
  shade.addColorStop(0.55, "rgba(7,16,44,.03)");
  shade.addColorStop(1, "rgba(15,5,35,.14)");
  ctx.fillStyle = shade;
  ctx.fillRect(0, 0, width, height);

  const title = String(botName || "BOT").toUpperCase();
  ctx.textAlign = "center";
  ctx.fillStyle = "#fff";
  ctx.shadowColor = "rgba(0,0,0,.3)";
  ctx.shadowBlur = 8;
  ctx.shadowOffsetY = 4;
  ctx.font = `800 104px ${FONT_MENU}`;
  ctx.fillText(truncateText(ctx, title, width - 500), width / 2, 146);
  ctx.shadowBlur = 0;
  ctx.shadowOffsetY = 0;

  drawMenuRoundedBox(ctx, width - 185, 42, 150, 110, 48, "rgba(255,255,255,.1)", "rgba(255,255,255,.52)", 1.5);
  ctx.fillStyle = "#fff";
  ctx.shadowColor = "rgba(0,0,0,.28)";
  ctx.shadowBlur = 6;
  ctx.font = `800 62px ${FONT_MENU}`;
  ctx.fillText(String(page).padStart(2, "0"), width - 110, 120);
  ctx.shadowBlur = 0;

  commands.slice(0, columns * rows).forEach((command, index) => {
    const column = index % columns;
    const row = Math.floor(index / columns);
    const x = outer + column * (cardWidth + gapX);
    const y = gridTop + row * (cardHeight + gapY);
    // Không chạy sharp.blur trên PNG 2048px cho từng lệnh. Lớp kính mờ và
    // background gốc vẫn giữ độ sâu nhưng giảm mạnh CPU/native memory.
    drawGlassMenuCard(ctx, cardBackground || canvas, width, height, x, y, cardWidth, cardHeight, 30);

    ctx.textAlign = "left";
    ctx.fillStyle = "#f7f9fc";
    ctx.shadowColor = "rgba(0,0,0,.25)";
    ctx.shadowBlur = 5;
    ctx.shadowOffsetY = 2;
    ctx.font = `500 42px ${FONT_MENU}`;
    const commandName = String(command.name || "")
      .replace(/^[^a-zA-Z0-9À-ỹ]+/u, "")
      .split(/[\s[<{|]/u)[0];
    ctx.fillText(truncateText(ctx, commandName, cardWidth - 58), x + 28, y + 63);

    ctx.fillStyle = "#f0f3f8";
    ctx.font = `500 24px ${FONT_MENU}`;
    wrapTextLines(ctx, command.description, cardWidth - 56, 1).forEach((line, lineIndex) => {
      ctx.fillText(line, x + 28, y + 98 + lineIndex * 30);
    });
    ctx.shadowBlur = 0;
    ctx.shadowOffsetY = 0;

    const isMember = command.permission === "all";
    const badge = isMember ? "USER" : "ADMIN";
    ctx.font = `800 17px ${FONT_MENU}`;
    const badgeWidth = ctx.measureText(badge).width + 25;
    const badgeX = x + cardWidth - badgeWidth - 17;
    const badgeY = y + cardHeight - 42;
    drawMenuRoundedBox(
      ctx,
      badgeX,
      badgeY,
      badgeWidth,
      28,
      14,
      isMember ? "rgba(78,139,170,.24)" : "rgba(142,91,25,.4)",
      isMember ? "rgba(220,239,249,.38)" : "rgba(255,218,144,.46)"
    );
    ctx.textAlign = "center";
    ctx.fillStyle = isMember ? "#9dd9ff" : "#ffd27d";
    ctx.fillText(badge, badgeX + badgeWidth / 2, badgeY + 20);
  });

  // Nền menu là ảnh phong cảnh; JPEG nhỏ và encode nhanh hơn PNG đáng kể,
  // giảm thời gian chặn event-loop khi nhiều người mở menu cùng lúc.
  return saveMenuCanvas(canvas);
}

// Tạo Hình Lệnh !Help với giao diện hiện đại
export async function createInstructionsImage(helpContent, isAdminBox) {
  const memberCommands = Object.values(helpContent.allMembers || {});
  const adminCommands = isAdminBox ? Object.values(helpContent.admin || {}) : [];
  const sections = [
    { title: "LỆNH DÀNH CHO MỌI THÀNH VIÊN", color: "#63d7b0", items: memberCommands, badge: "ALL" },
    ...(adminCommands.length
      ? [{ title: helpContent.titleAdmin || "LỆNH QUẢN TRỊ", color: "#ffc56b", items: adminCommands, badge: "ADMIN" }]
      : []),
  ];
  const width = 1280;
  const margin = 48;
  const gap = 22;
  const cardW = (width - margin * 2 - gap) / 2;
  const cardH = 122;
  const sectionH = 56;
  const sectionGap = 30;
  const headerH = 210;
  const footerH = 72;
  const rows = sections.reduce((sum, section) => sum + sectionH + Math.ceil(section.items.length / 2) * (cardH + 16) + sectionGap, 0);
  const height = headerH + rows + footerH;
  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext("2d");

  const bg = ctx.createLinearGradient(0, 0, width, height);
  bg.addColorStop(0, "#101a3a");
  bg.addColorStop(0.5, "#17264d");
  bg.addColorStop(1, "#0a1027");
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, width, height);
  ctx.save();
  ctx.globalAlpha = 0.08;
  ctx.strokeStyle = "#b4c7ff";
  ctx.lineWidth = 2;
  for (let x = -height; x < width + height; x += 54) {
    ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x + height, height); ctx.stroke();
  }
  ctx.restore();
  drawRoundedBox(ctx, 18, 18, width - 36, height - 36, 30, null, "#7896e6", 3);

  const title = String(helpContent.title || "HƯỚNG DẪN BOT").toUpperCase();
  ctx.textAlign = "center";
  ctx.fillStyle = "#f7d47a";
  ctx.font = `bold 48px ${FONT_MAIN}`;
  ctx.fillText(title, width / 2, 78);
  ctx.fillStyle = "#e6edff";
  ctx.font = `bold 25px ${FONT_MAIN}`;
  ctx.fillText("DANH SÁCH LỆNH", width / 2, 120);
  ctx.fillStyle = "#9eb1d8";
  ctx.font = `19px ${FONT_MAIN}`;
  ctx.fillText(`${memberCommands.length} lệnh thành viên${adminCommands.length ? `  •  ${adminCommands.length} lệnh quản trị` : ""}`, width / 2, 157);
  ctx.fillStyle = "#f7d47a";
  ctx.fillRect(width / 2 - 170, 181, 340, 3);

  let y = headerH;
  let index = 1;
  for (const section of sections) {
    ctx.textAlign = "left";
    ctx.fillStyle = section.color;
    ctx.font = `bold 23px ${FONT_MAIN}`;
    ctx.fillText(section.title, margin, y + 33);
    ctx.fillStyle = `${section.color}55`;
    ctx.fillRect(margin, y + 45, width - margin * 2, 2);
    y += sectionH;
    section.items.forEach((item, itemIndex) => {
      const col = itemIndex % 2;
      const row = Math.floor(itemIndex / 2);
      const x = margin + col * (cardW + gap);
      const cardY = y + row * (cardH + 16);
      ctx.save();
      ctx.shadowColor = "rgba(0,0,0,.35)"; ctx.shadowBlur = 12; ctx.shadowOffsetY = 5;
      drawRoundedBox(ctx, x, cardY, cardW, cardH, 18, "rgba(18,31,66,.94)", `${section.color}66`, 2);
      ctx.restore();
      drawRoundedBox(ctx, x + 18, cardY + 18, 52, 52, 14, `${section.color}20`, `${section.color}88`, 2);
      ctx.textAlign = "center"; ctx.fillStyle = section.color; ctx.font = `bold 17px ${FONT_MAIN}`;
      ctx.fillText(String(index++).padStart(2, "0"), x + 44, cardY + 50);
      const textX = x + 86;
      ctx.textAlign = "left"; ctx.fillStyle = "#f5f7ff"; ctx.font = `bold 23px ${FONT_MAIN}`;
      const command = String(item.command || "").replace(/^\s+/, "");
      ctx.fillText(truncateText(ctx, command, cardW - 190), textX, cardY + 42);
      ctx.fillStyle = "#afbddb"; ctx.font = `17px ${FONT_MAIN}`;
      wrapTextLines(ctx, item.description, cardW - 108, 2).forEach((line, lineIndex) => ctx.fillText(line, textX, cardY + 73 + lineIndex * 23));
      const badgeW = section.badge === "ADMIN" ? 78 : 60;
      drawRoundedBox(ctx, x + cardW - badgeW - 16, cardY + 16, badgeW, 25, 12, `${section.color}20`, `${section.color}55`, 1);
      ctx.textAlign = "center"; ctx.fillStyle = section.color; ctx.font = `bold 12px ${FONT_MAIN}`;
      ctx.fillText(section.badge, x + cardW - badgeW / 2 - 16, cardY + 33);
    });
    y += Math.ceil(section.items.length / 2) * (cardH + 16) + sectionGap;
  }
  ctx.textAlign = "center"; ctx.fillStyle = "#91a4cc"; ctx.font = `18px ${FONT_MAIN}`;
  ctx.fillText("Dùng lệnh với tiền tố bot • Gõ help để xem trang tiếp theo", width / 2, height - 40);
  return saveHelpCanvas(canvas, "help");
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
