import fs from "fs";
import path from "path";
import { createCanvas, loadImage } from "canvas";
import GIFEncoder from "gifencoder";
import { tempDir } from "../io-json.js";
import { FONT_MAIN, randomIDTemp } from "../format-util.js";

const WIDTH = 760;
const HEADER_HEIGHT = 88;
const LANE_HEIGHT = 62;
const FOOTER_HEIGHT = 28;
const TOTAL_FRAMES = 48;
const FRAME_DELAY = 100;
const START_X = 138;
const FINISH_X = WIDTH - 62;
const HORSE_SIZE = 40;
const LANE_COLORS = ["#F6C85F", "#6F4E7C", "#9FD356", "#CA472F", "#4C78A8", "#E07B9A", "#72B7B2", "#B279A2"];

function savePng(canvas, prefix) {
  fs.mkdirSync(tempDir, { recursive: true });
  const outputPath = path.join(tempDir, `${prefix}-${randomIDTemp()}.png`);
  const output = fs.createWriteStream(outputPath);
  canvas.createPNGStream().pipe(output);
  return new Promise((resolve, reject) => {
    output.once("finish", () => resolve(outputPath));
    output.once("error", reject);
  });
}

function shuffleIndexes(length) {
  const indexes = Array.from({ length }, (_, index) => index);
  for (let index = indexes.length - 1; index > 0; index -= 1) {
    const target = Math.floor(Math.random() * (index + 1));
    [indexes[index], indexes[target]] = [indexes[target], indexes[index]];
  }
  return indexes;
}

function truncateName(ctx, value, maxWidth) {
  const text = String(value || "Tay đua");
  if (ctx.measureText(text).width <= maxWidth) return text;
  let result = text;
  while (result.length > 1 && ctx.measureText(`${result}…`).width > maxWidth) result = result.slice(0, -1);
  return `${result}…`;
}

function roundedRect(ctx, x, y, width, height, radius) {
  const r = Math.min(radius, width / 2, height / 2);
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + width, y, x + width, y + height, r);
  ctx.arcTo(x + width, y + height, x, y + height, r);
  ctx.arcTo(x, y + height, x, y, r);
  ctx.arcTo(x, y, x + width, y, r);
  ctx.closePath();
}

function drawAvatar(ctx, image, x, y, color, initials) {
  ctx.save();
  ctx.beginPath();
  ctx.arc(x, y, 17, 0, Math.PI * 2);
  ctx.clip();
  if (image) {
    const scale = Math.max(34 / image.width, 34 / image.height);
    const width = image.width * scale;
    const height = image.height * scale;
    ctx.drawImage(image, x - width / 2, y - height / 2, width, height);
  } else {
    ctx.fillStyle = color;
    ctx.fillRect(x - 17, y - 17, 34, 34);
    ctx.fillStyle = "#FFFFFF";
    ctx.font = `bold 14px ${FONT_MAIN}`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(initials, x, y + 1);
  }
  ctx.restore();
  ctx.strokeStyle = "#FFFFFF";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(x, y, 18, 0, Math.PI * 2);
  ctx.stroke();
}

function drawFinishLine(ctx, top, bottom) {
  const block = 8;
  for (let y = top; y < bottom; y += block) {
    for (let column = 0; column < 2; column += 1) {
      ctx.fillStyle = (Math.floor((y - top) / block) + column) % 2 === 0 ? "#FFFFFF" : "#111827";
      ctx.fillRect(FINISH_X + column * block, y, block, block);
    }
  }
}

function drawConfetti(ctx, frame, height) {
  const colors = ["#FACC15", "#FB7185", "#22D3EE", "#A3E635", "#C084FC"];
  for (let index = 0; index < 34; index += 1) {
    const x = (index * 97 + frame * 13) % WIDTH;
    const y = HEADER_HEIGHT + ((index * 53 + frame * 11) % Math.max(1, height - HEADER_HEIGHT));
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate((index + frame) * 0.3);
    ctx.fillStyle = colors[index % colors.length];
    ctx.fillRect(-3, -5, 6, 10);
    ctx.restore();
  }
}

async function loadAvatars(players) {
  return Promise.all(
    players.map(async (player) => {
      if (!player.avatar) return null;
      try {
        return await loadImage(player.avatar);
      } catch {
        return null;
      }
    })
  );
}

export async function createHorseRaceLobbyImage({ hostName, betLabel, players, maxPlayers = 8 }) {
  const width = 900;
  const columns = 2;
  const rows = Math.ceil(maxPlayers / columns);
  const cardWidth = 385;
  const cardHeight = 76;
  const gapX = 30;
  const gapY = 18;
  const startX = 50;
  const startY = 188;
  const height = startY + rows * cardHeight + (rows - 1) * gapY + 82;
  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext("2d");
  const avatars = await loadAvatars(players);

  const background = ctx.createLinearGradient(0, 0, width, height);
  background.addColorStop(0, "#071827");
  background.addColorStop(0.55, "#123B35");
  background.addColorStop(1, "#0B2521");
  ctx.fillStyle = background;
  ctx.fillRect(0, 0, width, height);

  ctx.strokeStyle = "#F6C85F";
  ctx.lineWidth = 4;
  roundedRect(ctx, 18, 18, width - 36, height - 36, 26);
  ctx.stroke();

  ctx.fillStyle = "#F8FAFC";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.font = `bold 38px ${FONT_MAIN}`;
  ctx.fillText("🏇 PHÒNG ĐUA NGỰA", width / 2, 57);
  ctx.fillStyle = "#FACC15";
  ctx.font = `bold 21px ${FONT_MAIN}`;
  ctx.fillText(`CƯỢC ${betLabel} VNĐ / NGƯỜI`, width / 2, 101);
  ctx.fillStyle = "#BFDBFE";
  ctx.font = `17px ${FONT_MAIN}`;
  ctx.fillText(`Chủ phòng: ${hostName}  •  ${players.length}/${maxPlayers} tay đua`, width / 2, 135);
  ctx.fillStyle = "#D1FAE5";
  ctx.font = `bold 16px ${FONT_MAIN}`;
  ctx.fillText('THẢ ❤️ VÀO ẢNH ĐỂ GHI DANH', width / 2, 163);

  for (let index = 0; index < maxPlayers; index += 1) {
    const column = index % columns;
    const row = Math.floor(index / columns);
    const x = startX + column * (cardWidth + gapX);
    const y = startY + row * (cardHeight + gapY);
    const player = players[index];

    ctx.fillStyle = player ? "rgba(15, 50, 47, 0.94)" : "rgba(15, 23, 42, 0.58)";
    roundedRect(ctx, x, y, cardWidth, cardHeight, 17);
    ctx.fill();
    ctx.strokeStyle = player ? LANE_COLORS[index] : "rgba(148, 163, 184, 0.28)";
    ctx.lineWidth = 2;
    roundedRect(ctx, x, y, cardWidth, cardHeight, 17);
    ctx.stroke();

    ctx.fillStyle = player ? LANE_COLORS[index] : "#64748B";
    ctx.font = `bold 18px ${FONT_MAIN}`;
    ctx.textAlign = "center";
    ctx.fillText(String(index + 1), x + 28, y + cardHeight / 2);

    if (player) {
      drawAvatar(ctx, avatars[index], x + 72, y + cardHeight / 2, LANE_COLORS[index], player.initials);
      ctx.fillStyle = "#F8FAFC";
      ctx.font = `bold 17px ${FONT_MAIN}`;
      ctx.textAlign = "left";
      ctx.fillText(truncateName(ctx, player.name, 245), x + 102, y + 31);
      ctx.fillStyle = index === 0 ? "#FACC15" : "#A7F3D0";
      ctx.font = `14px ${FONT_MAIN}`;
      ctx.fillText(index === 0 ? "👑 Chủ phòng" : "✅ Đã ghi danh", x + 102, y + 53);
    } else {
      ctx.fillStyle = "#94A3B8";
      ctx.font = `italic 16px ${FONT_MAIN}`;
      ctx.textAlign = "left";
      ctx.fillText("Đang chờ tay đua...", x + 62, y + cardHeight / 2);
    }
  }

  ctx.fillStyle = "#CBD5E1";
  ctx.font = `15px ${FONT_MAIN}`;
  ctx.textAlign = "center";
  ctx.fillText('Chủ phòng dùng "duangua start" khi có ít nhất 2 người', width / 2, height - 45);

  return savePng(canvas, "horse-race-lobby");
}

export async function createHorseRaceGif(players) {
  if (!Array.isArray(players) || players.length < 2 || players.length > 8) {
    throw new Error("Đua ngựa cần từ 2 đến 8 người chơi");
  }

  fs.mkdirSync(tempDir, { recursive: true });
  const outputPath = path.join(tempDir, `horse-race-${randomIDTemp()}.gif`);
  const height = HEADER_HEIGHT + players.length * LANE_HEIGHT + FOOTER_HEIGHT;
  const canvas = createCanvas(WIDTH, height);
  const ctx = canvas.getContext("2d");
  const encoder = new GIFEncoder(WIDTH, height);
  const output = fs.createWriteStream(outputPath);
  const avatars = await loadAvatars(players);
  const finishOrder = shuffleIndexes(players.length);
  const rankByPlayer = new Map(finishOrder.map((playerIndex, rank) => [playerIndex, rank]));
  const finishFrames = finishOrder.map((_, rank) => 28 + rank * 2);
  const streamFinished = new Promise((resolve, reject) => {
    output.once("finish", resolve);
    output.once("error", reject);
  });

  encoder.createReadStream().pipe(output);
  encoder.start();
  encoder.setRepeat(0);
  encoder.setDelay(FRAME_DELAY);
  encoder.setQuality(14);

  for (let frame = 0; frame < TOTAL_FRAMES; frame += 1) {
    const sky = ctx.createLinearGradient(0, 0, 0, height);
    sky.addColorStop(0, "#102A43");
    sky.addColorStop(1, "#1F3B54");
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, WIDTH, height);

    ctx.fillStyle = "#071827";
    ctx.fillRect(0, 0, WIDTH, HEADER_HEIGHT);
    ctx.fillStyle = "#F8FAFC";
    ctx.font = `bold 28px ${FONT_MAIN}`;
    ctx.textAlign = "left";
    ctx.textBaseline = "middle";
    ctx.fillText("🏇 ĐƯỜNG ĐUA", 24, 34);
    ctx.fillStyle = "#93C5FD";
    ctx.font = `bold 14px ${FONT_MAIN}`;
    ctx.fillText(`${players.length} tay đua • GIF mô phỏng trực tiếp`, 26, 65);

    for (let index = 0; index < players.length; index += 1) {
      const laneTop = HEADER_HEIGHT + index * LANE_HEIGHT;
      const laneCenter = laneTop + LANE_HEIGHT / 2;
      ctx.fillStyle = index % 2 === 0 ? "#315C45" : "#294E3B";
      ctx.fillRect(0, laneTop, WIDTH, LANE_HEIGHT);
      ctx.strokeStyle = "rgba(255,255,255,0.24)";
      ctx.setLineDash([10, 8]);
      ctx.beginPath();
      ctx.moveTo(0, laneTop + LANE_HEIGHT);
      ctx.lineTo(WIDTH, laneTop + LANE_HEIGHT);
      ctx.stroke();
      ctx.setLineDash([]);

      ctx.fillStyle = "rgba(3, 15, 26, 0.78)";
      ctx.fillRect(0, laneTop, 126, LANE_HEIGHT);
      drawAvatar(ctx, avatars[index], 25, laneCenter, LANE_COLORS[index], players[index].initials);
      ctx.fillStyle = "#F8FAFC";
      ctx.font = `bold 13px ${FONT_MAIN}`;
      ctx.textAlign = "left";
      ctx.textBaseline = "middle";
      ctx.fillText(truncateName(ctx, players[index].name, 75), 49, laneCenter);

      const rank = rankByPlayer.get(index);
      const finishFrame = finishFrames[rank];
      const normalized = Math.min(1, frame / finishFrame);
      const eased = 0.12 * normalized + 0.88 * Math.pow(normalized, 1.35);
      const wobble = normalized < 0.98 ? Math.sin(frame * 0.72 + index * 1.8) * 5 * normalized : 0;
      const postFinish = frame > finishFrame ? Math.min(13, (frame - finishFrame) * 1.5) : 0;
      const x = START_X + eased * (FINISH_X - START_X - HORSE_SIZE) + wobble + postFinish;
      const bounce = Math.sin(frame * 1.4 + index) * 2.2;

      ctx.fillStyle = LANE_COLORS[index];
      roundedRect(ctx, x - 7, laneCenter - 22 + bounce, 22, 17, 6);
      ctx.fill();
      ctx.fillStyle = "#FFFFFF";
      ctx.font = `bold 11px ${FONT_MAIN}`;
      ctx.textAlign = "center";
      ctx.fillText(String(index + 1), x + 4, laneCenter - 13 + bounce);
      ctx.font = `38px Symbola, ${FONT_MAIN}`;
      ctx.textAlign = "left";
      ctx.fillStyle = "#F8FAFC";
      ctx.fillText("🐎", x, laneCenter + 7 + bounce);

      if (frame >= finishFrame) {
        ctx.fillStyle = "#FACC15";
        ctx.font = `bold 13px ${FONT_MAIN}`;
        ctx.textAlign = "right";
        ctx.fillText(`#${rank + 1}`, WIDTH - 8, laneCenter);
      }
    }

    drawFinishLine(ctx, HEADER_HEIGHT, HEADER_HEIGHT + players.length * LANE_HEIGHT);

    if (frame >= 37) {
      drawConfetti(ctx, frame, height);
      ctx.fillStyle = "rgba(2, 8, 23, 0.86)";
      roundedRect(ctx, 330, 13, 405, 58, 18);
      ctx.fill();
      ctx.fillStyle = "#FACC15";
      ctx.font = `bold 19px ${FONT_MAIN}`;
      ctx.textAlign = "center";
      ctx.fillText(`🏆 ${players[finishOrder[0]].name} VỀ NHẤT!`, 532, 42);
    }

    encoder.addFrame(ctx);
  }

  encoder.finish();
  await streamFinished;
  return {
    gifPath: outputPath,
    ranking: finishOrder.map((playerIndex) => players[playerIndex]),
    durationMs: TOTAL_FRAMES * FRAME_DELAY,
  };
}
