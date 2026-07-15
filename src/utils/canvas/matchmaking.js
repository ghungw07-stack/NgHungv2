import { createCanvas, loadImage } from "canvas";
import fs from "fs";
import path from "path";
import * as cv from "./index.js";
import { FONT_MAIN, getFontCanvas } from "../format-util.js";

export async function createMatchmakingImage(user1Info, user2Info, compatibilityPercent, titleText = "💖 TỈ LỆ HỢP ĐÔI 💖", subtitleText = "MỨC ĐỘ PHÙ HỢP") {
  const width = 1400;
  const height = 900;
  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext("2d");

  let color1, color2, color3, color4;
  if (compatibilityPercent < 50) {
    color1 = "#FFE4E1"; 
    color2 = "#FFB6C1"; 
    color3 = "#FFC0CB"; 
    color4 = "#FFB6C1"; 
  } else if (compatibilityPercent < 75) {
    color1 = "#FF69B4";
    color2 = "#FF1493"; 
    color3 = "#FF69B4"; 
    color4 = "#FF1493"; 
  } else {
    color1 = "#DC143C"; 
    color2 = "#C71585";
    color3 = "#FF1493";
    color4 = "#DC143C"; 
  }

  const bgGradient = ctx.createLinearGradient(0, 0, width, height);
  bgGradient.addColorStop(0, color1);
  bgGradient.addColorStop(0.3, color2);
  bgGradient.addColorStop(0.6, color3);
  bgGradient.addColorStop(1, color4);
  ctx.fillStyle = bgGradient;
  ctx.fillRect(0, 0, width, height);

  const sparkleCount = compatibilityPercent < 50 ? 30 : compatibilityPercent < 75 ? 40 : 50;
  for (let i = 0; i < sparkleCount; i++) {
    const x = Math.random() * width;
    const y = Math.random() * height;
    const radius = Math.random() * 3 + 1;
    ctx.beginPath();
    ctx.arc(x, y, radius, 0, Math.PI * 2);
    ctx.fillStyle = `rgba(255, 255, 255, ${Math.random() * 0.5 + 0.3})`;
    ctx.fill();
  }

  const titleY = 100;
  ctx.textAlign = "center";
  
  ctx.shadowColor = "rgba(0, 0, 0, 0.3)";
  ctx.shadowBlur = 10;
  ctx.shadowOffsetX = 0;
  ctx.shadowOffsetY = 5;
  
  const titleText2 = titleText;
  ctx.font = "bold 72px " + getFontCanvas(titleText2);
  ctx.fillStyle = cv.getRandomGradient(ctx, width);
  
  ctx.textAlign = "center";
  ctx.textBaseline = "alphabetic";
  ctx.fillText(titleText2, width / 2, titleY + 30);
  
  ctx.shadowColor = "transparent";
  ctx.shadowBlur = 0;
  ctx.shadowOffsetX = 0;
  ctx.shadowOffsetY = 0;

  const avatarSize = 280;
  const avatarY = 250;
  const spacing = 380; 
  const avatar1X = width / 2 - spacing / 2 - avatarSize / 2;
  const avatar2X = width / 2 + spacing / 2 + avatarSize / 2;
  const avatarCenterY = avatarY + avatarSize / 2;

  if (user1Info && user1Info.avatar && cv.isValidUrl(user1Info.avatar)) {
    try {
      const avatar1 = await loadImage(user1Info.avatar);
      
      ctx.save();
      ctx.shadowColor = "rgba(0, 0, 0, 0.4)";
      ctx.shadowBlur = 30;
      ctx.shadowOffsetX = 0;
      ctx.shadowOffsetY = 10;
      ctx.beginPath();
      ctx.arc(avatar1X, avatarCenterY, avatarSize / 2 + 5, 0, Math.PI * 2);
      ctx.fillStyle = "rgba(0, 0, 0, 0.2)";
      ctx.fill();
      ctx.restore();
      
      const borderGradient = ctx.createLinearGradient(
        avatar1X - avatarSize / 2 - 8,
        avatarY - 8,
        avatar1X + avatarSize / 2 + 8,
        avatarY + avatarSize + 8
      );
      borderGradient.addColorStop(0, "#FFFFFF");
      borderGradient.addColorStop(0.5, "#FFB6C1");
      borderGradient.addColorStop(1, "#FFFFFF");
      
      ctx.strokeStyle = borderGradient;
      ctx.lineWidth = 8;
      ctx.beginPath();
      ctx.arc(avatar1X, avatarCenterY, avatarSize / 2, 0, Math.PI * 2);
      ctx.stroke();
      
      ctx.save();
      ctx.beginPath();
      ctx.arc(avatar1X, avatarCenterY, avatarSize / 2 - 4, 0, Math.PI * 2);
      ctx.closePath();
      ctx.clip();
      ctx.drawImage(avatar1, avatar1X - avatarSize / 2, avatarY, avatarSize, avatarSize);
      ctx.restore();
    } catch (error) {
      console.error("Lỗi load avatar 1:", error);
    }
  }

  if (user2Info && user2Info.avatar && cv.isValidUrl(user2Info.avatar)) {
    try {
      const avatar2 = await loadImage(user2Info.avatar);
      
      ctx.save();
      ctx.shadowColor = "rgba(0, 0, 0, 0.4)";
      ctx.shadowBlur = 30;
      ctx.shadowOffsetX = 0;
      ctx.shadowOffsetY = 10;
      ctx.beginPath();
      ctx.arc(avatar2X, avatarCenterY, avatarSize / 2 + 5, 0, Math.PI * 2);
      ctx.fillStyle = "rgba(0, 0, 0, 0.2)";
      ctx.fill();
      ctx.restore();
      
      const borderGradient = ctx.createLinearGradient(
        avatar2X - avatarSize / 2 - 8,
        avatarY - 8,
        avatar2X + avatarSize / 2 + 8,
        avatarY + avatarSize + 8
      );
      borderGradient.addColorStop(0, "#FFFFFF");
      borderGradient.addColorStop(0.5, "#FFB6C1");
      borderGradient.addColorStop(1, "#FFFFFF");
      
      ctx.strokeStyle = borderGradient;
      ctx.lineWidth = 8;
      ctx.beginPath();
      ctx.arc(avatar2X, avatarCenterY, avatarSize / 2, 0, Math.PI * 2);
      ctx.stroke();
      
      ctx.save();
      ctx.beginPath();
      ctx.arc(avatar2X, avatarCenterY, avatarSize / 2 - 4, 0, Math.PI * 2);
      ctx.closePath();
      ctx.clip();
      ctx.drawImage(avatar2, avatar2X - avatarSize / 2, avatarY, avatarSize, avatarSize);
      ctx.restore();
    } catch (error) {
      console.error("Lỗi load avatar 2:", error);
    }
  }

  const centerHeartX = width / 2;
  const centerHeartY = avatarCenterY;
  const centerHeartSize = 100; 
  
  ctx.shadowColor = "rgba(255, 20, 147, 0.5)";
  ctx.shadowBlur = 20;
  ctx.shadowOffsetX = 0;
  ctx.shadowOffsetY = 0;
  
  ctx.font = `${centerHeartSize}px Arial`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText("💖", centerHeartX, centerHeartY);

  ctx.shadowColor = "transparent";
  ctx.shadowBlur = 0;

  const nameY = avatarY + avatarSize + 60;
  ctx.shadowColor = "rgba(0, 0, 0, 0.5)";
  ctx.shadowBlur = 8;
  ctx.shadowOffsetX = 0;
  ctx.shadowOffsetY = 3;
  
  ctx.fillStyle = "#FFFFFF";
  ctx.textAlign = "center";
  const name1 = user1Info.name || user1Info.displayName || user1Info.zaloName || "Người dùng 1";
  const name2 = user2Info.name || user2Info.displayName || user2Info.zaloName || "Người dùng 2";
  
  const maxNameLength = 18;
  const displayName1 = name1.length > maxNameLength ? name1.substring(0, maxNameLength) + "..." : name1;
  const displayName2 = name2.length > maxNameLength ? name2.substring(0, maxNameLength) + "..." : name2;
  
  ctx.font = "bold 48px " + getFontCanvas(displayName1 + displayName2);
  
  ctx.fillText(displayName1, avatar1X, nameY);
  ctx.fillText(displayName2, avatar2X, nameY);
  
  ctx.shadowColor = "transparent";
  ctx.shadowBlur = 0;
  ctx.shadowOffsetX = 0;
  ctx.shadowOffsetY = 0;

  const compatibilityTextY = nameY + 70;
  ctx.font = "36px " + getFontCanvas(subtitleText);
  ctx.fillStyle = "rgba(255, 255, 255, 0.95)";
  ctx.shadowColor = "rgba(0, 0, 0, 0.3)";
  ctx.shadowBlur = 5;
  ctx.shadowOffsetY = 2;
  ctx.fillText(subtitleText, width / 2, compatibilityTextY);
  
  ctx.shadowColor = "transparent";
  ctx.shadowBlur = 0;
  ctx.shadowOffsetY = 0;

  const boxY = compatibilityTextY + 50; 
  const boxWidth = 700; 
  const boxHeight = 150;
  const boxX = (width - boxWidth) / 2;
  const borderRadius = 25;

  ctx.save();
  ctx.shadowColor = "rgba(0, 0, 0, 0.4)";
  ctx.shadowBlur = 30;
  ctx.shadowOffsetX = 0;
  ctx.shadowOffsetY = 15;
  
  ctx.fillStyle = "#FFFFFF";
  ctx.beginPath();
  ctx.moveTo(boxX + borderRadius, boxY);
  ctx.lineTo(boxX + boxWidth - borderRadius, boxY);
  ctx.quadraticCurveTo(boxX + boxWidth, boxY, boxX + boxWidth, boxY + borderRadius);
  ctx.lineTo(boxX + boxWidth, boxY + boxHeight - borderRadius);
  ctx.quadraticCurveTo(boxX + boxWidth, boxY + boxHeight, boxX + boxWidth - borderRadius, boxY + boxHeight);
  ctx.lineTo(boxX + borderRadius, boxY + boxHeight);
  ctx.quadraticCurveTo(boxX, boxY + boxHeight, boxX, boxY + boxHeight - borderRadius);
  ctx.lineTo(boxX, boxY + borderRadius);
  ctx.quadraticCurveTo(boxX, boxY, boxX + borderRadius, boxY);
  ctx.closePath();
  ctx.fill();
  ctx.restore();

  const percentText = `${compatibilityPercent}%`;
  ctx.font = "bold 110px " + getFontCanvas(percentText); 
  
  let percentColor1, percentColor2;
  if (compatibilityPercent < 50) {
    percentColor1 = "#FF69B4"; 
    percentColor2 = "#FF1493"; 
  } else if (compatibilityPercent < 75) {
    percentColor1 = "#FF1493"; 
    percentColor2 = "#DC143C"; 
  } else {
    percentColor1 = "#DC143C";
    percentColor2 = "#8B0000"; 
  }
  
  const percentGradient = ctx.createLinearGradient(
    boxX,
    boxY + boxHeight / 2 - 60,
    boxX + boxWidth,
    boxY + boxHeight / 2 + 60
  );
  percentGradient.addColorStop(0, percentColor1);
  percentGradient.addColorStop(0.5, percentColor2);
  percentGradient.addColorStop(1, percentColor1);
  
  ctx.fillStyle = percentGradient;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.shadowColor = "rgba(255, 0, 0, 0.3)";
  ctx.shadowBlur = 10;
  ctx.shadowOffsetX = 0;
  ctx.shadowOffsetY = 5;
  ctx.fillText(percentText, width / 2, boxY + boxHeight / 2);
  
  ctx.shadowColor = "transparent";
  ctx.shadowBlur = 0;
  ctx.shadowOffsetY = 0;

  const filePath = path.resolve(`./assets/temp/matchmaking_${Date.now()}.png`);
  const out = fs.createWriteStream(filePath);
  const stream = canvas.createPNGStream();
  stream.pipe(out);
  
  return new Promise((resolve, reject) => {
    out.on("finish", () => resolve(filePath));
    out.on("error", reject);
  });
}