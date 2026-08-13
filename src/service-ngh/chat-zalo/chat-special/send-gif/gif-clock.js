import ffmpeg from "fluent-ffmpeg";
import fs from "fs";
import path from "path";
import { createCanvas } from "canvas";
import * as cv from "../../../../utils/canvas/index.js";
import { tempDir, BACKGROUND_RESOURCE_PATH_TEMP } from "../../../../utils/io-json.js";
import { randomIDTemp } from "../../../../utils/format-util.js";
import GIFEncoder from 'gifencoder';
import { MessageType } from "zlbotngh";
import { getGlobalPrefix } from '../../../service.js';
import { removeMention } from '../../../../utils/format-util.js';
import { sendMessageStateQuote, sendMessageWarningRequest } from '../../chat-style/chat-style.js';

const TIME_24H = 60000;

const createRoundedRectPath = (ctx, x, y, width, height, radius = 12) => {
  const r = Math.min(radius, width / 2, height / 2);
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
};

const deleteFile = async (filePath) => {
  try {
    if (fs.existsSync(filePath)) {
      await fs.promises.unlink(filePath);
    }
  } catch (error) {
    console.error('Lỗi khi xóa file:', error);
  }
};

export async function createClockGif() {
  try {
    const width = 400;
    const height = 400;
    const centerX = width / 2;
    const centerY = height / 2 - 30;
    const radius = 172;
    const gifPath = path.join(tempDir, `clock_${randomIDTemp()}.gif`);
    const canvas = createCanvas(width, height);
    const ctx = canvas.getContext('2d');
    const backgroundGradient = cv.getRandomGradient(ctx, width);
    const encoder = new GIFEncoder(width, height);

    const stream = fs.createWriteStream(gifPath);
    encoder.createReadStream().pipe(stream);
    encoder.start();
    encoder.setRepeat(0);
    encoder.setDelay(1000); // 1000ms per frame for real-time animation
    encoder.setQuality(10);

    const now = new Date();
    const totalFrames = 30; // 30 frames for 30 seconds animation
    const totalMs = 30 * 1000; // 30 seconds in milliseconds
    const msPerFrame = totalMs / totalFrames; // 1000ms per frame

    // Load background image similar to lichamlich.js
    const imageDir = path.join(BACKGROUND_RESOURCE_PATH_TEMP, "1080x1920");
    let bgImage = null;
    try {
      if (fs.existsSync(imageDir)) {
        const files = fs.readdirSync(imageDir).filter((f) => /\.(jpe?g|png|webp)$/i.test(f));
        if (files.length > 0) {
          const file = files[Math.floor(Math.random() * files.length)];
          const { loadImage } = await import('canvas');
          bgImage = await loadImage(path.join(imageDir, file));
        }
      }
    } catch (e) {
      bgImage = null;
    }

    for (let frame = 0; frame < totalFrames; frame++) {
      const currentTime = new Date(now.getTime() + frame * msPerFrame);
      const currentHour = currentTime.getHours() % 12;
      const currentMinute = currentTime.getMinutes();
      const currentSecond = currentTime.getSeconds();

      ctx.clearRect(0, 0, width, height);

      const rawHour = currentTime.getHours();
      const accentHue = Math.round(((currentMinute * 60) + currentSecond) / 3600 * 360) % 360;
      const accentColor = `hsl(${accentHue}, 78%, 55%)`;
      const accentGlow = `hsla(${accentHue}, 90%, 65%, 0.35)`;
      const dialRadius = radius - 22;
      const padTime = (value) => value.toString().padStart(2, "0");
      const weekDays = ["CN", "T2", "T3", "T4", "T5", "T6", "T7"];
      const timeLabel = `${padTime(rawHour)}:${padTime(currentMinute)}:${padTime(currentSecond)}`;
      const dateLabel = `${weekDays[currentTime.getDay()]} ${padTime(currentTime.getDate())}/${padTime(currentTime.getMonth() + 1)}`;

      // Base gradient background
      ctx.fillStyle = backgroundGradient || "#111827";
      ctx.fillRect(0, 0, width, height);

      // Subtle dynamic color wash
      const ambientGradient = ctx.createLinearGradient(0, 0, width, height);
      ambientGradient.addColorStop(0, `hsl(${(accentHue + 20) % 360}, 62%, 22%)`);
      ambientGradient.addColorStop(0.55, `hsl(${accentHue}, 58%, 15%)`);
      ambientGradient.addColorStop(1, `hsl(${(accentHue + 200) % 360}, 60%, 24%)`);
      ctx.save();
      ctx.globalAlpha = 0.85;
      ctx.fillStyle = ambientGradient;
      ctx.fillRect(0, 0, width, height);
      ctx.restore();

      // Draw background image if available and softened
      if (bgImage) {
        ctx.save();
        ctx.globalAlpha = 0.45;
        ctx.filter = "blur(10px)";
        const scale = Math.max(width / bgImage.width, height / bgImage.height);
        const drawWidth = bgImage.width * scale;
        const drawHeight = bgImage.height * scale;
        const offsetX = (width - drawWidth) / 2;
        const offsetY = (height - drawHeight) / 2;
        ctx.drawImage(bgImage, offsetX, offsetY, drawWidth, drawHeight);
        ctx.filter = "none";
        ctx.restore();
      }

      // Glow overlay
      ctx.save();
      const glowGradient = ctx.createRadialGradient(centerX, centerY, dialRadius * 0.4, centerX, centerY, dialRadius * 1.4);
      glowGradient.addColorStop(0, "rgba(255, 255, 255, 0.25)");
      glowGradient.addColorStop(1, "rgba(0, 0, 0, 0.55)");
      ctx.globalAlpha = 0.6;
      ctx.fillStyle = glowGradient;
      ctx.fillRect(0, 0, width, height);
      ctx.restore();

      // Outer soft shadow ring
      ctx.save();
      ctx.shadowColor = "rgba(0, 0, 0, 0.55)";
      ctx.shadowBlur = 28;
      ctx.beginPath();
      ctx.arc(centerX, centerY, dialRadius + 8, 0, Math.PI * 2);
      ctx.strokeStyle = "rgba(10, 14, 25, 0.4)";
      ctx.lineWidth = 6;
      ctx.stroke();
      ctx.restore();

      // Dial base
      const dialGradient = ctx.createRadialGradient(centerX, centerY, dialRadius * 0.1, centerX, centerY, dialRadius);
      dialGradient.addColorStop(0, "rgba(255, 255, 255, 0.95)");
      dialGradient.addColorStop(0.45, "rgba(236, 240, 246, 0.92)");
      dialGradient.addColorStop(0.75, "rgba(210, 214, 226, 0.85)");
      dialGradient.addColorStop(1, "rgba(170, 178, 192, 0.8)");
      ctx.beginPath();
      ctx.arc(centerX, centerY, dialRadius, 0, Math.PI * 2);
      ctx.fillStyle = dialGradient;
      ctx.fill();

      // Dial gloss
      ctx.save();
      ctx.beginPath();
      ctx.arc(centerX, centerY, dialRadius, 0, Math.PI * 2);
      ctx.clip();
      const glossGradient = ctx.createLinearGradient(centerX, centerY - dialRadius, centerX, centerY + dialRadius);
      glossGradient.addColorStop(0, "rgba(255, 255, 255, 0.4)");
      glossGradient.addColorStop(0.5, "rgba(255, 255, 255, 0.05)");
      glossGradient.addColorStop(1, "rgba(0, 0, 0, 0.2)");
      ctx.globalCompositeOperation = "lighter";
      ctx.fillStyle = glossGradient;
      ctx.fillRect(centerX - dialRadius, centerY - dialRadius, dialRadius * 2, dialRadius * 2);
      ctx.restore();

      // Outer ring detailing
      ctx.save();
      ctx.lineWidth = 6;
      ctx.strokeStyle = "rgba(255, 255, 255, 0.36)";
      ctx.beginPath();
      ctx.arc(centerX, centerY, dialRadius, 0, Math.PI * 2);
      ctx.stroke();
      ctx.lineWidth = 2;
      ctx.strokeStyle = "rgba(0, 0, 0, 0.25)";
      ctx.beginPath();
      ctx.arc(centerX, centerY, dialRadius - 8, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();

      // Hour + minute markers
      ctx.save();
      ctx.lineCap = "round";
      for (let i = 0; i < 60; i++) {
        const isHourMarker = i % 5 === 0;
        const isQuarterMarker = i % 15 === 0;
        const angle = (i * Math.PI) / 30 - Math.PI / 2;
        const cos = Math.cos(angle);
        const sin = Math.sin(angle);
        const startRadius = dialRadius - 12;
        const endRadius = isHourMarker ? (isQuarterMarker ? dialRadius - 45 : dialRadius - 38) : dialRadius - 30;

        ctx.beginPath();
        ctx.moveTo(centerX + cos * startRadius, centerY + sin * startRadius);
        ctx.lineTo(centerX + cos * endRadius, centerY + sin * endRadius);
        ctx.lineWidth = isHourMarker ? (isQuarterMarker ? 4 : 2.5) : 1.3;
        ctx.strokeStyle = isQuarterMarker ? accentColor : (isHourMarker ? "rgba(30, 36, 50, 0.85)" : "rgba(30, 36, 50, 0.35)");
        ctx.stroke();

        if (isQuarterMarker) {
          ctx.beginPath();
          ctx.fillStyle = accentGlow;
          ctx.arc(centerX + cos * (dialRadius - 53), centerY + sin * (dialRadius - 53), 4.2, 0, Math.PI * 2);
          ctx.fill();
        }
      }
      ctx.restore();

      // Inner guide ring
      ctx.save();
      ctx.setLineDash([6, 12]);
      ctx.strokeStyle = "rgba(15, 20, 32, 0.18)";
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.arc(centerX, centerY, dialRadius - 90, 0, Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.restore();

      // Draw numbers
      ctx.save();
      ctx.fillStyle = "rgba(20, 26, 40, 0.95)";
      ctx.font = '550 30px "Segoe UI"';
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.shadowColor = "rgba(255, 255, 255, 0.35)";
      ctx.shadowBlur = 7;
      for (let i = 1; i <= 12; i++) {
        const angle = (i * Math.PI) / 6 - Math.PI / 2;
        const x = centerX + Math.cos(angle) * (dialRadius - 70);
        const y = centerY + Math.sin(angle) * (dialRadius - 70);
        ctx.fillText(i.toString(), x, y);
      }
      ctx.restore();

      // Calculate angles (radians adjusted for canvas orientation)
      const hourAngle = ((currentHour + currentMinute / 60 + currentSecond / 3600) * Math.PI) / 6 - Math.PI / 2;
      const minuteAngle = ((currentMinute + currentSecond / 60) * Math.PI) / 30 - Math.PI / 2;
      const secondAngle = (currentSecond * Math.PI) / 30 - Math.PI / 2;

      // Hour hand
      ctx.save();
      ctx.strokeStyle = "rgba(20, 26, 40, 0.95)";
      ctx.lineWidth = 9;
      ctx.lineCap = "round";
      ctx.shadowColor = "rgba(0, 0, 0, 0.45)";
      ctx.shadowBlur = 12;
      ctx.beginPath();
      ctx.moveTo(centerX + Math.cos(hourAngle + Math.PI) * (dialRadius * 0.12), centerY + Math.sin(hourAngle + Math.PI) * (dialRadius * 0.12));
      ctx.lineTo(centerX + Math.cos(hourAngle) * (dialRadius * 0.55), centerY + Math.sin(hourAngle) * (dialRadius * 0.55));
      ctx.stroke();
      ctx.restore();

      // Minute hand
      ctx.save();
      ctx.strokeStyle = "rgba(30, 36, 50, 0.95)";
      ctx.lineWidth = 6;
      ctx.lineCap = "round";
      ctx.shadowColor = "rgba(0, 0, 0, 0.35)";
      ctx.shadowBlur = 10;
      ctx.beginPath();
      ctx.moveTo(centerX + Math.cos(minuteAngle + Math.PI) * (dialRadius * 0.15), centerY + Math.sin(minuteAngle + Math.PI) * (dialRadius * 0.15));
      ctx.lineTo(centerX + Math.cos(minuteAngle) * (dialRadius * 0.78), centerY + Math.sin(minuteAngle) * (dialRadius * 0.78));
      ctx.stroke();
      ctx.restore();

      // Second hand
      ctx.save();
      ctx.strokeStyle = "#ff4d4d";
      ctx.lineWidth = 2.4;
      ctx.lineCap = "round";
      ctx.shadowColor = "rgba(255, 77, 77, 0.75)";
      ctx.shadowBlur = 18;
      ctx.beginPath();
      ctx.moveTo(centerX + Math.cos(secondAngle + Math.PI) * (dialRadius * 0.2), centerY + Math.sin(secondAngle + Math.PI) * (dialRadius * 0.2));
      ctx.lineTo(centerX + Math.cos(secondAngle) * (dialRadius * 0.88), centerY + Math.sin(secondAngle) * (dialRadius * 0.88));
      ctx.stroke();
      ctx.restore();

      // Center caps
      ctx.save();
      ctx.fillStyle = "rgba(15, 18, 28, 0.95)";
      ctx.beginPath();
      ctx.arc(centerX, centerY, 10, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = accentColor;
      ctx.beginPath();
      ctx.arc(centerX, centerY, 5, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();

      // Glass highlight
      ctx.save();
      ctx.beginPath();
      ctx.arc(centerX, centerY, dialRadius - 6, 0, Math.PI * 2);
      ctx.clip();
      const reflection = ctx.createLinearGradient(centerX - dialRadius, centerY - dialRadius, centerX + dialRadius, centerY + dialRadius);
      reflection.addColorStop(0, "rgba(255, 255, 255, 0.28)");
      reflection.addColorStop(0.35, "rgba(255, 255, 255, 0.08)");
      reflection.addColorStop(1, "rgba(255, 255, 255, 0)");
      ctx.globalCompositeOperation = "lighter";
      ctx.fillStyle = reflection;
      ctx.fillRect(centerX - dialRadius, centerY - dialRadius, dialRadius * 2, dialRadius * 2);
      ctx.restore();

      // Time & date panel
      const panelWidth = width - 150;
      const panelHeight = 52;
      const panelX = (width - panelWidth) / 2;
      const panelYBase = centerY + dialRadius + 18;
      const panelMaxY = height - panelHeight - 12;
      const panelY = Math.min(panelYBase, panelMaxY);

      ctx.save();
      ctx.shadowColor = "rgba(0, 0, 0, 0.55)";
      ctx.shadowBlur = 26;
      ctx.shadowOffsetY = 12;
      const panelGradient = ctx.createLinearGradient(panelX, panelY, panelX, panelY + panelHeight);
      panelGradient.addColorStop(0, "rgba(22, 26, 40, 0.96)");
      panelGradient.addColorStop(1, "rgba(10, 12, 22, 0.9)");
      ctx.fillStyle = panelGradient;
      createRoundedRectPath(ctx, panelX, panelY, panelWidth, panelHeight, 22);
      ctx.fill();

      ctx.shadowBlur = 0;
      ctx.shadowOffsetY = 0;
      ctx.lineWidth = 1.2;
      ctx.strokeStyle = "rgba(255, 255, 255, 0.12)";
      createRoundedRectPath(ctx, panelX, panelY, panelWidth, panelHeight, 22);
      ctx.stroke();
      ctx.restore();

      ctx.save();
      ctx.globalCompositeOperation = "lighter";
      ctx.globalAlpha = 0.3;
      const panelHighlight = ctx.createLinearGradient(panelX, panelY, panelX, panelY + panelHeight);
      panelHighlight.addColorStop(0, "rgba(255, 255, 255, 0.35)");
      panelHighlight.addColorStop(0.45, "rgba(255, 255, 255, 0.08)");
      panelHighlight.addColorStop(1, "rgba(255, 255, 255, 0)");
      ctx.fillStyle = panelHighlight;
      createRoundedRectPath(ctx, panelX, panelY, panelWidth, panelHeight, 22);
      ctx.fill();
      ctx.restore();

      ctx.save();
      ctx.shadowColor = accentColor;
      ctx.shadowBlur = 14;
      ctx.fillStyle = accentColor;
      ctx.beginPath();
      ctx.arc(panelX + 32, panelY + panelHeight / 2, 5, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();

      ctx.save();
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillStyle = "rgba(255, 255, 255, 0.95)";
      ctx.shadowColor = "rgba(0, 0, 0, 0.45)";
      ctx.shadowBlur = 16;
      ctx.font = '530 18px "Segoe UI"';
      ctx.fillText(timeLabel, centerX, panelY + panelHeight / 2 - 6);
      ctx.shadowBlur = 0;
      ctx.fillStyle = "rgba(210, 214, 225, 0.82)";
      ctx.font = '500 15px "Segoe UI"';
      ctx.fillText(dateLabel, centerX, panelY + panelHeight / 2 + 10);
      ctx.restore();

      encoder.addFrame(ctx);
    }

    encoder.finish();

    await new Promise((resolve, reject) => {
      stream.on('finish', resolve);
      stream.on('error', reject);
    });

    return gifPath;
  } catch (error) {
    console.error('Lỗi khi tạo GIF đồng hồ:', error);
    throw error;
  }
}

export async function createAndSendClockGif(api, message, threadId, msgType, senderName) {
  let gifPath = null;

  try {
    gifPath = await createClockGif();

    await sendMessageStateQuote(api, message, `Đồng hồ của bạn đây!`, false, 10000, false);
    await api.sendMessage(
      {
        msg: ``,
        attachments: [gifPath],
        ttl: 30000
      },
      threadId,
      msgType,
    );

    if (gifPath && fs.existsSync(gifPath)) {
      await deleteFile(gifPath);
    }
  } catch (error) {
    console.error('Lỗi trong createAndSendClockGif:', error);
    const object = {
      caption: `${senderName || 'Người dùng'}, Đã có lỗi khi tạo và gửi GIF đồng hồ. Vui lòng thử lại.`,
    };
    await sendMessageWarningRequest(api, message, object, TIME_24H);
  } finally {
    if (gifPath && fs.existsSync(gifPath)) {
      await deleteFile(gifPath);
    }
  }
}

export async function handleClockCommand(api, message, aliasCommand) {
  try {
    const threadId = message.threadId;
    let prefix = getGlobalPrefix(api.getBotId());
    const isGroup = message.type === MessageType.GroupMessage;
    const msgType = isGroup ? MessageType.GroupMessage : MessageType.PersonalMessage;
    const senderName = message.data?.dName || 'Người dùng';

    await createAndSendClockGif(api, message, threadId, msgType, senderName);
  } catch (error) {
    console.error('Lỗi trong handleClockCommand:', error);
    const fallbackSenderName = message.data?.dName || 'Người dùng';
    const object = {
      caption: `${fallbackSenderName}, Đã có lỗi xảy ra khi xử lý lệnh ${aliasCommand}. Vui lòng thử lại sau.`,
    };
    await sendMessageWarningRequest(api, message, object, TIME_24H);
  }
}
