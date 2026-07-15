import { createCanvas, loadImage } from "canvas";
import fs from "fs";
import path from "path";
import * as cv from "./index.js";
import { tempDir } from "../io-json.js";
import { FONT_MAIN, randomIDTemp } from "../format-util.js";
import { loadImageWithRetry } from "../util.js";

const DEFAULT_OPTIONS = {
  avatarSize: 160, 
  padding: 50, 
  gap: 30,
  avatarsPerRow: 5,
  headerHeight: 150, 
  cardPadding: 20, 
  backgroundColor: {
    start: "rgb(54, 130, 228)",
    end: "rgb(92, 142, 248)",
  },
  font: {
    title: "bold 56px " + FONT_MAIN,
    subtitle: "bold 36px " + FONT_MAIN,
    index: "bold 28px " + FONT_MAIN,
    id: "22px " + FONT_MAIN,
  },
};

/**
 * Tạo canvas hiển thị danh sách avatar
 * @param {Array} photos - Mảng các object photo từ API
 * @param {Object} options - Tùy chọn tùy chỉnh
 * @returns {Promise<string>} Đường dẫn đến file ảnh đã tạo
 */
export async function createAvatarListCanvas(photos = [], options = {}) {
  if (!photos || photos.length === 0) {
    throw new Error("Không có avatar nào để hiển thị");
  }

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

  const rows = Math.ceil(photos.length / mergedOptions.avatarsPerRow);
  const itemWidth = mergedOptions.avatarSize + mergedOptions.cardPadding * 2 + mergedOptions.gap;
  const itemHeight = mergedOptions.avatarSize + mergedOptions.cardPadding * 2 + mergedOptions.gap;
  
  const actualAvatarsInLastRow = photos.length % mergedOptions.avatarsPerRow || mergedOptions.avatarsPerRow;
  const canvasWidth = mergedOptions.avatarsPerRow * itemWidth + mergedOptions.padding * 2;
  const canvasHeight = mergedOptions.headerHeight + rows * itemHeight + mergedOptions.padding * 2;

  const canvas = createCanvas(canvasWidth, canvasHeight);
  const ctx = canvas.getContext("2d");

  const gradient = ctx.createLinearGradient(0, 0, 0, canvasHeight);
  gradient.addColorStop(0, mergedOptions.backgroundColor.start);
  gradient.addColorStop(0.5, "rgba(8, 8, 12, 1)");
  gradient.addColorStop(1, mergedOptions.backgroundColor.end);
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, canvasWidth, canvasHeight);

  ctx.fillStyle = "rgba(255, 255, 255, 0.02)";
  for (let i = 0; i < canvasWidth; i += 50) {
    for (let j = 0; j < canvasHeight; j += 50) {
      if ((i + j) % 100 === 0) {
        ctx.beginPath();
        ctx.arc(i, j, 1.5, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }

  let yPos = mergedOptions.padding + 60;
  ctx.textAlign = "center";
  ctx.font = mergedOptions.font.title;
  
  ctx.shadowColor = "rgba(0, 0, 0, 0.6)";
  ctx.shadowBlur = 12;
  ctx.shadowOffsetX = 0;
  ctx.shadowOffsetY = 5;
  
  ctx.fillStyle = cv.getRandomGradient(ctx, canvasWidth);
  ctx.fillText("📸 LỊCH SỬ AVATAR", canvasWidth / 2, yPos);

  ctx.shadowColor = "transparent";
  ctx.shadowBlur = 0;
  ctx.shadowOffsetX = 0;
  ctx.shadowOffsetY = 0;

  const startY = mergedOptions.headerHeight;
  let photoIndex = 0;

  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < mergedOptions.avatarsPerRow && photoIndex < photos.length; col++) {
      const photo = photos[photoIndex];
      let x = mergedOptions.padding + col * itemWidth;
      if (row === rows - 1 && actualAvatarsInLastRow < mergedOptions.avatarsPerRow) {
        const totalWidth = actualAvatarsInLastRow * itemWidth;
        const offsetX = (canvasWidth - totalWidth) / 2;
        x = offsetX + col * itemWidth;
      }
      const y = startY + row * itemHeight + mergedOptions.padding;

      await drawAvatarItem(ctx, photo, photoIndex + 1, x, y, mergedOptions);
      photoIndex++;
    }
  }

  const outputPath = path.join(tempDir, `avatar_list_${randomIDTemp()}.png`);
  const out = fs.createWriteStream(outputPath);
  const stream = canvas.createPNGStream();
  stream.pipe(out);

  return new Promise((resolve, reject) => {
    out.on("finish", () => resolve(outputPath));
    out.on("error", reject);
  });
}

/**
 * Vẽ một item avatar
 */
async function drawAvatarItem(ctx, photo, index, x, y, options) {
  try {
    const cardX = x;
    const cardY = y;
    const avatarSize = options.avatarSize;
    const cardPadding = options.cardPadding;
    
    const cardWidth = avatarSize + cardPadding * 2;
    const cardHeight = avatarSize + cardPadding * 2;
    const cardCenterX = cardX + cardWidth / 2;
    const cardCenterY = cardY + cardHeight / 2;
    
    ctx.save();
    ctx.shadowColor = "rgba(0, 0, 0, 0.4)";
    ctx.shadowBlur = 20;
    ctx.shadowOffsetX = 0;
    ctx.shadowOffsetY = 8;
    
    const cardGradient = ctx.createLinearGradient(
      cardX, cardY,
      cardX + cardWidth, cardY + cardHeight
    );
    cardGradient.addColorStop(0, "rgba(255, 255, 255, 0.12)");
    cardGradient.addColorStop(0.5, "rgba(255, 255, 255, 0.08)");
    cardGradient.addColorStop(1, "rgba(255, 255, 255, 0.05)");
    ctx.fillStyle = cardGradient;
    cv.roundRect(ctx, cardX, cardY, cardWidth, cardHeight, 25, true, false);
    
    ctx.strokeStyle = "rgba(255, 255, 255, 0.15)";
    ctx.lineWidth = 2;
    cv.roundRect(ctx, cardX, cardY, cardWidth, cardHeight, 25, false, true);
    
    ctx.restore();

    const avatarX = cardX + cardPadding;
    const avatarY = cardY + cardPadding;
    const avatarCenterX = avatarX + avatarSize / 2;
    const avatarCenterY = avatarY + avatarSize / 2;

    ctx.save();
    ctx.shadowColor = "rgba(44, 155, 247, 0.6)";
    ctx.shadowBlur = 20;
    ctx.shadowOffsetX = 0;
    ctx.shadowOffsetY = 0;
    
    ctx.beginPath();
    ctx.arc(
      avatarCenterX,
      avatarCenterY,
      avatarSize / 2 + 6,
      0,
      Math.PI * 2
    );
    const borderGradient = ctx.createLinearGradient(
      avatarX - 6,
      avatarY - 6,
      avatarX + avatarSize + 6,
      avatarY + avatarSize + 6
    );
    borderGradient.addColorStop(0, "rgba(59, 130, 246, 0.9)");
    borderGradient.addColorStop(0.5, "rgba(37, 99, 235, 1)");
    borderGradient.addColorStop(1, "rgba(59, 130, 246, 0.9)");
    ctx.fillStyle = borderGradient;
    ctx.fill();
    ctx.restore();

    const allUrls = [
      photo.url,
      photo.bkUrl,
      photo.thumbnail,
      photo.hdUrl,
      photo.normalUrl
    ].filter(url => url && url !== "N/A");
    
    const photoUrls = [
      ...allUrls.filter(url => !url.endsWith('.jxl')),
      ...allUrls.filter(url => url.endsWith('.jxl'))
    ];

    let avatarLoaded = false;
    
    if (photoUrls.length > 0) {
      for (const photoUrl of photoUrls) {
        try {
          const maxRetries = photoUrl.endsWith('.jxl') ? 1 : 2;
          const timeout = photoUrl.endsWith('.jxl') ? 2000 : 3000;
          
          const avatarImage = await loadImageWithRetry(photoUrl, maxRetries, timeout);
          ctx.save();
          ctx.beginPath();
          ctx.arc(
            avatarCenterX,
            avatarCenterY,
            avatarSize / 2,
            0,
            Math.PI * 2
          );
          ctx.clip();
          ctx.drawImage(avatarImage, avatarX, avatarY, avatarSize, avatarSize);
          ctx.restore();
          avatarLoaded = true;
          break;
        } catch (error) {
          continue;
        }
      }
    }

    if (!avatarLoaded) {
      ctx.save();
      ctx.beginPath();
      ctx.arc(
        avatarCenterX,
        avatarCenterY,
        avatarSize / 2,
        0,
        Math.PI * 2
      );
      ctx.clip();
      
      const placeholderGradient = ctx.createLinearGradient(
        avatarX, avatarY,
        avatarX + avatarSize, avatarY + avatarSize
      );
      placeholderGradient.addColorStop(0, "#475569");
      placeholderGradient.addColorStop(1, "#334155");
      ctx.fillStyle = placeholderGradient;
      ctx.fillRect(avatarX, avatarY, avatarSize, avatarSize);
      
      ctx.restore();
      ctx.save();
      ctx.fillStyle = "#94a3b8";
      ctx.font = `bold ${avatarSize * 0.35}px ${FONT_MAIN}`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.shadowColor = "rgba(0, 0, 0, 0.3)";
      ctx.shadowBlur = 4;
      ctx.fillText("?", avatarCenterX, avatarCenterY);
      ctx.restore();
    }

    const badgeX = avatarX + 30;
    const badgeY = avatarY + 30;
    const badgeRadius = 26;
    
    ctx.save();
    ctx.shadowColor = "rgba(0, 0, 0, 0.6)";
    ctx.shadowBlur = 12;
    ctx.shadowOffsetX = 0;
    ctx.shadowOffsetY = 4;
    
    ctx.beginPath();
    ctx.arc(badgeX, badgeY, badgeRadius, 0, Math.PI * 2);
    
    const badgeGradient = ctx.createRadialGradient(
      badgeX - 6, badgeY - 6, 0,
      badgeX, badgeY, badgeRadius
    );
    badgeGradient.addColorStop(0, "#FF6B6B");
    badgeGradient.addColorStop(0.5, "#FF5252");
    badgeGradient.addColorStop(1, "#E53935");
    ctx.fillStyle = badgeGradient;
    ctx.fill();
    
    ctx.strokeStyle = "#FFFFFF";
    ctx.lineWidth = 3.5;
    ctx.stroke();
    ctx.restore();

    ctx.save();
    ctx.font = options.font.index;
    ctx.fillStyle = "#FFFFFF";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.shadowColor = "rgba(0, 0, 0, 0.9)";
    ctx.shadowBlur = 6;
    ctx.shadowOffsetX = 0;
    ctx.shadowOffsetY = 2;
    ctx.fillText(index.toString(), badgeX, badgeY);
    ctx.restore();

  } catch (error) {
    console.error(`Lỗi khi vẽ avatar item ${index}:`, error);
  }
}

