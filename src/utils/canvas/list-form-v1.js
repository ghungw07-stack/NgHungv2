import { Canvas, loadImage } from "skia-canvas";
import fs from "fs";
import path from "path";
import * as cv from "./index.js";
import { tempDir } from "../io-json.js";
import { FONT_MAIN, randomIDTemp } from "../format-util.js";

const DEFAULT_OPTIONS = {
  columnCount: 1, // Số cột hiển thị (1 hoặc 2)
  itemHeight: 120, // Chiều cao của mỗi item
  avatarSize: 80, // Kích thước avatar
  padding: 30, // Padding chung
  nameWidth: 400, // Chiều rộng phần tên
  extraWidth: 200, // Chiều rộng phần thông tin thêm
  headerHeight: 180, // Chiều cao phần header
  backgroundColor: {
    // Gradient màu nền
    start: "rgba(59, 130, 246, 0.9)",
    end: "rgba(17, 24, 39, 0.95)",
  },
  itemBackground: "rgba(29, 18, 18, 0.1)", // Màu nền của item
  font: {
    title: "bold 48px " + FONT_MAIN,
    subtitle: "bold 36px " + FONT_MAIN,
    item: "bold 32px " + FONT_MAIN,
    info: "28px " + FONT_MAIN,
  },
};

const DEFAULT_TITLE_CONFIG = {
  mainTitle: "Main Title",
  subTitle: "Sub Title",
  icon: "📝",
};

/**
 * Creates a list image with customizable layout and item rendering
 * @param {Object} options Configuration options for the list
 * @param {Array} items Array of items to display in the list
 * @param {Object} titleConfig Title configuration
 * @returns {Promise<string>} Path to the generated image
 */
async function createListImage(options = {}, items = [], titleConfig = {}) {
  // Deep merge options với default options
  const mergedOptions = {
    ...DEFAULT_OPTIONS,
    ...options,
    backgroundColor: {
      ...DEFAULT_OPTIONS.backgroundColor,
      ...(options.backgroundColor || {}),
    },
    font: {
      ...DEFAULT_OPTIONS.font,
      ...(options.font || {}),
    },
  };

  // Merge title config
  const mergedTitleConfig = {
    ...DEFAULT_TITLE_CONFIG,
    ...titleConfig,
  };

  // Tính toán kích thước canvas
  const useDoubleColumn = mergedOptions.columnCount === 2 && items.length > 10;
  const extraPadding = mergedOptions.padding * 4;

  // Tính width tổng
  const columnWidth = mergedOptions.avatarSize + mergedOptions.nameWidth + mergedOptions.extraWidth + extraPadding;
  const width = useDoubleColumn ? columnWidth * 2 + mergedOptions.padding * 2 : columnWidth;

  // Tính chiều cao
  const itemsPerColumn = useDoubleColumn ? Math.ceil(items.length / 2) : items.length;
  const height = mergedOptions.headerHeight + itemsPerColumn * mergedOptions.itemHeight + 40;

  // Tạo canvas
  const canvas = new Canvas(width, height);
  const ctx = canvas.getContext("2d");

  // Nền V2 pha loang được vẽ trực tiếp, không phụ thuộc ảnh nền.
  const gradient = ctx.createLinearGradient(0, 0, width, height);
  gradient.addColorStop(0, "#4b267e");
  gradient.addColorStop(0.48, "#243b78");
  gradient.addColorStop(1, "#08766f");
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, width, height);

  const blobs = [
    [width * 0.12, height * 0.08, width * 0.52, "rgba(255,88,190,.30)"],
    [width * 0.88, height * 0.16, width * 0.45, "rgba(96,122,255,.34)"],
    [width * 0.65, height * 0.92, width * 0.55, "rgba(35,230,176,.25)"],
  ];
  for (const [x, y, radius, color] of blobs) {
    const glow = ctx.createRadialGradient(x, y, 0, x, y, radius);
    glow.addColorStop(0, color);
    glow.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = glow;
    ctx.fillRect(0, 0, width, height);
  }

  // Vẽ tiêu đề
  let yPos = mergedOptions.padding * 2;
  ctx.textAlign = "center";
  ctx.font = mergedOptions.font.title;
  ctx.fillStyle = cv.getRandomGradient(ctx, width);
  ctx.fillText(mergedTitleConfig.mainTitle, width / 2, yPos);

  // Vẽ phụ đề
  yPos += 80;
  ctx.font = mergedOptions.font.subtitle;
  ctx.fillStyle = "#FFD700";
  ctx.fillText(mergedTitleConfig.subTitle, width / 2, yPos);
  yPos += 40;

  if (useDoubleColumn) {
    const midPoint = Math.ceil(items.length / 2);

    // Vẽ cột trái
    let leftYPos = yPos;
    for (let i = 0; i < midPoint; i++) {
      if (items[i]) {
        leftYPos = await drawListItem(ctx, items[i], leftYPos, i + 1, mergedOptions, 0, useDoubleColumn);
      }
    }

    // Vẽ cột phải
    let rightYPos = yPos;
    for (let i = midPoint; i < items.length; i++) {
      if (items[i]) {
        rightYPos = await drawListItem(
          ctx,
          items[i],
          rightYPos,
          i + 1,
          mergedOptions,
          columnWidth + mergedOptions.padding * 2 - 30,
          useDoubleColumn
        );
      }
    }

    // Vẽ đường phân cách giữa 2 cột
    ctx.fillStyle = "rgba(255, 255, 255, 0.2)";
    ctx.fillRect(width / 2, yPos - 20, 2, height - yPos);
  } else {
    // Vẽ 1 cột
    let index = 1;
    for (const item of items) {
      yPos = await drawListItem(ctx, item, yPos, index++, mergedOptions, 0, useDoubleColumn);
    }
  }

  // Lưu và trả về đường dẫn ảnh
  const outputPath = path.join(tempDir, `list_${randomIDTemp()}.png`);
  await fs.promises.writeFile(outputPath, await canvas.toBuffer("png"));
  return outputPath;
}

/**
 * Draws a single item in the list
 */
async function drawListItem(ctx, item, yPos, index, options, xOffset, isDoubleColumn) {
  try {
    const itemPadding = 20;

    // Vẽ background cho item
    ctx.fillStyle = options.itemBackground;
    ctx.beginPath();

    // Tính toán width của background
    const backgroundWidth = isDoubleColumn
      ? (ctx.canvas.width - options.padding * 4) / 2
      : ctx.canvas.width - options.padding * 2;

    ctx.roundRect(options.padding + xOffset, yPos, backgroundWidth, options.itemHeight - itemPadding, 10);
    ctx.fill();

    // Vẽ avatar hoặc icon
    const avatarX = options.padding * 2 + xOffset;
    const avatarY = yPos + (options.itemHeight - options.avatarSize) / 2 - itemPadding / 2;

    // Vẽ viền avatar
    ctx.save();
    ctx.beginPath();
    ctx.arc(
      avatarX + options.avatarSize / 2,
      avatarY + options.avatarSize / 2,
      options.avatarSize / 2 + 3,
      0,
      Math.PI * 2
    );
    const borderGradient = ctx.createLinearGradient(
      avatarX,
      avatarY,
      avatarX + options.avatarSize,
      avatarY + options.avatarSize
    );
    borderGradient.addColorStop(0, "#FFA500");
    borderGradient.addColorStop(1, "#FF6347");
    ctx.fillStyle = borderGradient;
    ctx.fill();
    ctx.restore();

    // Xử lý avatar/icon dựa vào item.type
    await renderAvatar(ctx, item, avatarX, avatarY, options.avatarSize);

    // Vẽ separator
    const separatorX = options.padding * 3 + options.avatarSize + xOffset;
    ctx.fillStyle = "rgba(255, 255, 255, 0.2)";
    ctx.fillRect(separatorX, yPos + itemPadding - 8, 2, options.itemHeight - itemPadding * 2);

    // Vẽ thông tin
    const textX = separatorX + options.padding * 2 - 20;
    const textY = yPos + itemPadding;

    // Vẽ tên và thông tin
    ctx.textAlign = "left";
    ctx.font = options.font.item;
    ctx.fillStyle = "#FFFFFF";
    ctx.fillText(`${index}. ${item.name || item.title || "Untitled"}`, textX, textY + 20);

    // Vẽ thông tin phụ nếu có
    if (item.info) {
      ctx.font = options.font.info;
      ctx.fillStyle = cv.getRandomBrightColor();
      ctx.fillText(item.info, textX, textY + 60);
    }

    return yPos + options.itemHeight;
  } catch (error) {
    console.error("Error drawing list item:", error);
    return yPos + options.itemHeight;
  }
}

/**
 * Renders avatar or icon for an item
 */
async function renderAvatar(ctx, item, x, y, size) {
  ctx.save();
  ctx.beginPath();
  ctx.arc(x + size / 2, y + size / 2, size / 2, 0, Math.PI * 2);
  ctx.clip();

  // Vẽ background màu xám
  ctx.fillStyle = "#4A5568";
  ctx.fillRect(x, y, size, size);

  if (item.icon) {
    // Nếu có icon, vẽ icon
    ctx.fillStyle = "#FFFFFF";
    ctx.font = `bold ${size / 2}px BeVietnamPro`;
    ctx.textAlign = "center";
    ctx.fillText(item.icon, x + size / 2, y + size / 2 + size / 4);
  } else if (item.avatar) {
    // Nếu có avatar, vẽ avatar
    const avatar = await loadImage(item.avatar);
    ctx.drawImage(avatar, x, y, size, size);
  } else {
    // Nếu không có cả hai, vẽ chữ cái đầu của tên
    ctx.fillStyle = "#FFFFFF";
    ctx.font = `bold ${size / 2}px BeVietnamPro`;
    ctx.textAlign = "center";
    const initial = (item.name || item.title || "?").charAt(0).toUpperCase();
    ctx.fillText(initial, x + size / 2, y + size / 2 + size / 4);
  }

  if (item.badge) {
    const badgeSize = size * 0.375;
    const badgeX = x + size - badgeSize;
    const badgeY = y + size - badgeSize;

    ctx.restore();
    ctx.save();
    ctx.beginPath();
    ctx.arc(badgeX + badgeSize / 2, badgeY + badgeSize / 2, badgeSize / 2, 0, Math.PI * 2);
    ctx.fillStyle = item.badgeColor || "#DC2626";
    ctx.fill();

    ctx.fillStyle = "#FFFFFF";
    ctx.font = `bold ${badgeSize * 0.67}px BeVietnamPro`;
    ctx.textAlign = "center";
    ctx.fillText(item.badge, badgeX + badgeSize / 2, badgeY + badgeSize / 2 + badgeSize / 4);
  } else if (item.status) {
    let statusColor;
    switch (item.status) {
      case "active":
        statusColor = "#22C55E"; // Green
        break;
      case "inactive":
        statusColor = "#6B7280"; // Gray
        break;
      case "pending":
        statusColor = "#FACC15"; // Yellow
        break;
      case "reject":
        statusColor = "#DC2626"; // Red
        break;
      default:
        statusColor = "#D1D5DB"; // Light gray
    }
    const badgeSize = size * 0.375;
    const statusX = x + size - badgeSize + 8;
    const statusY = y + size - badgeSize + 8;
    ctx.restore();
    ctx.save();
    ctx.beginPath();
    ctx.arc(statusX + badgeSize / 2, statusY + badgeSize / 2, badgeSize / 3, 0, Math.PI * 2);
    ctx.fillStyle = statusColor;
    ctx.shadowColor = "#00000033";
    ctx.shadowBlur = 2;
    ctx.fill();
    ctx.strokeStyle = "#FFFFFF";
    ctx.lineWidth = 3;
    ctx.stroke();
  }

  ctx.restore();
}

export { createListImage };
