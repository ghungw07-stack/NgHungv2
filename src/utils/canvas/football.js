import { createCanvas } from "canvas";
import fs from "fs";
import path from "path";
import { FONT_MAIN, randomIDTemp } from "../format-util.js";
import { tempDir } from "../io-json.js";

function save(canvas) {
  if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir, { recursive: true });
  const file = path.join(tempDir, `football_${randomIDTemp()}.png`);
  return new Promise((resolve, reject) => {
    const out = fs.createWriteStream(file);
    canvas.createPNGStream().pipe(out);
    out.on("finish", () => resolve(file));
    out.on("error", reject);
  });
}

export async function createFootballScheduleImage({ dateLabel, events = [] }) {
  const width = 1280;
  const rowH = 112;
  const height = 190 + Math.max(1, events.length) * rowH + 80;
  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext("2d");
  const bg = ctx.createLinearGradient(0, 0, width, height);
  bg.addColorStop(0, "#071b34"); bg.addColorStop(0.55, "#103b53"); bg.addColorStop(1, "#071525");
  ctx.fillStyle = bg; ctx.fillRect(0, 0, width, height);
  ctx.textAlign = "center";
  ctx.fillStyle = "#8ff0d0"; ctx.font = `bold 42px ${FONT_MAIN}`;
  ctx.fillText("FOOTBALL FIXTURES", width / 2, 70);
  ctx.fillStyle = "#dcecff"; ctx.font = `bold 25px ${FONT_MAIN}`;
  ctx.fillText(String(dateLabel || "TODAY"), width / 2, 112);
  ctx.fillStyle = "#79a7c7"; ctx.font = `18px ${FONT_MAIN}`;
  ctx.fillText("LIVE DATA • cập nhật theo thời gian thực khi gọi lệnh", width / 2, 146);

  if (!events.length) {
    ctx.fillStyle = "#dcecff"; ctx.font = `bold 26px ${FONT_MAIN}`;
    ctx.fillText("Không có trận đấu trong ngày này", width / 2, 270);
  }
  events.forEach((event, index) => {
    const y = 178 + index * rowH;
    ctx.fillStyle = index % 2 ? "rgba(10,31,55,.78)" : "rgba(18,53,75,.82)";
    ctx.fillRect(42, y, width - 84, rowH - 10);
    ctx.textAlign = "left"; ctx.fillStyle = "#7ee6c1"; ctx.font = `bold 18px ${FONT_MAIN}`;
    ctx.fillText(event.league || "Football", 70, y + 28);
    ctx.textAlign = "center"; ctx.fillStyle = "#f3f8ff"; ctx.font = `bold 25px ${FONT_MAIN}`;
    ctx.fillText(`${event.home}  vs  ${event.away}`, width / 2, y + 48);
    ctx.fillStyle = "#ffd477"; ctx.font = `bold 20px ${FONT_MAIN}`;
    ctx.fillText(event.status || event.time || "TBD", width / 2, y + 79);
  });
  ctx.textAlign = "center"; ctx.fillStyle = "#8caecc"; ctx.font = `17px ${FONT_MAIN}`;
  ctx.fillText("Nguồn: ESPN scoreboard", width / 2, height - 28);
  return save(canvas);
}
