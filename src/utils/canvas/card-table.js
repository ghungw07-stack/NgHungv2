import fs from "fs";
import path from "path";
import { createCanvas } from "canvas";
import { FONT_MAIN, formatCurrency, randomIDTemp } from "../format-util.js";
import { tempDir } from "../io-json.js";

function rounded(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, r);
}

function fit(ctx, text, width) {
  let value = String(text || "?");
  if (ctx.measureText(value).width <= width) return value;
  while (value.length > 1 && ctx.measureText(`${value}…`).width > width) value = value.slice(0, -1);
  return `${value}…`;
}

function save(canvas, game) {
  if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir, { recursive: true });
  const filePath = path.join(tempDir, `${game}_waiting_${randomIDTemp()}.png`);
  const out = fs.createWriteStream(filePath);
  canvas.createPNGStream().pipe(out);
  return new Promise((resolve, reject) => {
    out.on("finish", () => resolve(filePath));
    out.on("error", reject);
  });
}

export async function createCardTableLobbyImage({ game, ownerName, players, betAmount, maxPlayers = 4 }) {
  const width = 1200;
  const height = 720;
  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext("2d");
  const isTienLen = game === "tienlen";
  const accent = isTienLen ? "#62d6a7" : "#f1c75b";

  const bg = ctx.createRadialGradient(600, 330, 20, 600, 360, 780);
  bg.addColorStop(0, isTienLen ? "#145b44" : "#174e38");
  bg.addColorStop(0.55, "#092d24");
  bg.addColorStop(1, "#03130f");
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, width, height);
  ctx.save();
  ctx.globalAlpha = 0.045;
  ctx.strokeStyle = "#fff";
  for (let x = -height; x < width + height; x += 42) {
    ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x + height, height); ctx.stroke();
  }
  ctx.restore();

  ctx.strokeStyle = accent;
  ctx.lineWidth = 5;
  rounded(ctx, 18, 18, width - 36, height - 36, 30);
  ctx.stroke();
  ctx.textAlign = "center";
  ctx.fillStyle = accent;
  ctx.font = `bold 47px ${FONT_MAIN}`;
  ctx.fillText(isTienLen ? "TIẾN LÊN MIỀN NAM" : "BÀI CÀO 3 LÁ", width / 2, 70);
  ctx.fillStyle = "#b8d0c7";
  ctx.font = `bold 21px ${FONT_MAIN}`;
  ctx.fillText("SẢNH CHỜ · THẢ TIM ĐỂ THAM GIA", width / 2, 108);

  // Bàn trung tâm.
  ctx.save();
  ctx.shadowColor = "rgba(0,0,0,.6)";
  ctx.shadowBlur = 24;
  ctx.fillStyle = "#0b3d2e";
  ctx.strokeStyle = "#9d2635";
  ctx.lineWidth = 12;
  rounded(ctx, 390, 155, 420, 430, 56);
  ctx.fill(); ctx.stroke();
  ctx.shadowBlur = 0;
  ctx.strokeStyle = accent;
  ctx.lineWidth = 2;
  rounded(ctx, 402, 167, 396, 406, 46);
  ctx.stroke();
  ctx.restore();

  ctx.fillStyle = `${accent}22`;
  ctx.beginPath(); ctx.arc(600, 320, 86, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = accent;
  ctx.font = `bold 74px ${FONT_MAIN}`;
  ctx.fillText("♥", 600, 342);
  ctx.font = `bold 27px ${FONT_MAIN}`;
  ctx.fillText("THẢ TIM ĐỂ VÀO", 600, 400);
  ctx.fillStyle = "#17110d";
  ctx.strokeStyle = accent;
  ctx.lineWidth = 2;
  rounded(ctx, 470, 435, 260, 48, 24); ctx.fill(); ctx.stroke();
  ctx.fillStyle = accent;
  ctx.font = `bold 22px ${FONT_MAIN}`;
  ctx.fillText(`CƯỢC ${formatCurrency(betAmount)}`, 600, 467);

  const positions = [
    { x: 42, y: 160 }, { x: 42, y: 325 },
    { x: 838, y: 160 }, { x: 838, y: 325 },
  ];
  for (let index = 0; index < maxPlayers; index++) {
    const player = players[index];
    const { x, y } = positions[index];
    ctx.save();
    ctx.fillStyle = player ? "rgba(8,40,31,.88)" : "rgba(3,22,17,.56)";
    ctx.strokeStyle = player ? accent : "#376453";
    ctx.lineWidth = 2;
    ctx.setLineDash(player ? [] : [8, 7]);
    rounded(ctx, x, y, 320, 130, 18); ctx.fill(); ctx.stroke();
    ctx.restore();
    if (!player) {
      ctx.fillStyle = "#86a99b";
      ctx.font = `bold 21px ${FONT_MAIN}`;
      ctx.fillText("GHẾ TRỐNG", x + 160, y + 58);
      ctx.font = `17px ${FONT_MAIN}`;
      ctx.fillText("Thả ♥ để ngồi", x + 160, y + 88);
      continue;
    }
    ctx.fillStyle = `${accent}25`;
    ctx.strokeStyle = accent;
    ctx.setLineDash([]);
    ctx.beginPath(); ctx.arc(x + 62, y + 65, 38, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    ctx.fillStyle = accent;
    ctx.font = `bold 32px ${FONT_MAIN}`;
    ctx.fillText((player.name || "?").slice(0, 1).toUpperCase(), x + 62, y + 76);
    ctx.textAlign = "left";
    ctx.fillStyle = "#fff";
    ctx.font = `bold 22px ${FONT_MAIN}`;
    ctx.fillText(fit(ctx, player.name, 185), x + 116, y + 58);
    ctx.fillStyle = accent;
    ctx.font = `bold 17px ${FONT_MAIN}`;
    ctx.fillText(index === 0 ? "CHỦ BÀN" : `NGƯỜI CHƠI ${index}`, x + 116, y + 87);
    ctx.textAlign = "center";
  }

  ctx.fillStyle = "#9db9ae";
  ctx.font = `19px ${FONT_MAIN}`;
  ctx.fillText(`${players.length}/${maxPlayers} người · Chủ bàn: ${ownerName} · Gõ "batdau" khi đủ người`, 600, 658);
  return save(canvas, game);
}
