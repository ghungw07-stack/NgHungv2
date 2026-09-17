import { Canvas } from "skia-canvas";
import fs from "fs/promises";
import path from "path";
import { formatCurrency } from "../../../utils/format-util.js";

function rounded(ctx, x, y, width, height, radius = 16) { ctx.beginPath(); ctx.roundRect(x, y, width, height, radius); }
function background(ctx, width, height) { const g = ctx.createRadialGradient(width / 2, 260, 30, width / 2, height / 2, height); g.addColorStop(0, "#342b0e"); g.addColorStop(.5, "#16150d"); g.addColorStop(1, "#080a09"); ctx.fillStyle = g; ctx.fillRect(0, 0, width, height); }

export async function createMinesImage(session, { status = "playing", hitCell = null, returned = null } = {}) {
  const width = 720, height = 920; const canvas = new Canvas(width, height); const ctx = canvas.getContext("2d"); background(ctx, width, height);
  for (let i = 0; i < 62; i++) { ctx.fillStyle = i % 4 ? "rgba(255,211,80,.2)" : "rgba(255,241,153,.55)"; ctx.fillRect((i * 89 + 19) % width, (i * 137 + 31) % height, i % 6 === 0 ? 2 : 1, i % 6 === 0 ? 2 : 1); }
  const statusMap = { playing: "ĐANG LẬT Ô", lost: "TRÚNG MÌN", cashed: "ĐÃ RÚT", completed: "HOÀN THÀNH" };
  ctx.textAlign = "center"; ctx.textBaseline = "middle"; ctx.fillStyle = "#f5d46f"; ctx.font = "bold 29px sans-serif"; ctx.fillText(`💣 DÒ MÌN · ${session.mineCount} mìn`, width / 2, 44);
  rounded(ctx, 40, 70, 640, 790, 20); ctx.fillStyle = "rgba(8,10,10,.8)"; ctx.fill(); ctx.strokeStyle = "rgba(246,207,100,.35)"; ctx.lineWidth = 2; ctx.stroke();
  rounded(ctx, 508, 87, 148, 35, 17); ctx.fillStyle = status === "lost" ? "#8e2731" : status === "playing" ? "#51451c" : "#216140"; ctx.fill(); ctx.fillStyle = "#fff4c5"; ctx.font = "bold 13px sans-serif"; ctx.fillText(statusMap[status], 582, 105);

  const margin = 63, gap = 10, cell = (width - margin * 2 - gap * 4) / 5, top = 145;
  for (let number = 1; number <= 25; number += 1) {
    const index = number - 1, col = index % 5, row = Math.floor(index / 5), x = margin + col * (cell + gap), y = top + row * (cell + gap);
    const mine = session.mines.has(number), opened = session.opened.has(number), revealMine = mine && status !== "playing", hit = number === hitCell;
    rounded(ctx, x, y, cell, cell, 10);
    const g = ctx.createLinearGradient(x, y, x, y + cell);
    if (revealMine) { g.addColorStop(0, hit ? "#ff6c67" : "#7b2830"); g.addColorStop(1, hit ? "#a71925" : "#40151d"); }
    else if (opened) { g.addColorStop(0, "#c7a844"); g.addColorStop(1, "#5d4611"); }
    else { g.addColorStop(0, "#2c2c2c"); g.addColorStop(1, "#151515"); }
    ctx.fillStyle = g; ctx.fill(); ctx.strokeStyle = hit ? "#fff09b" : opened ? "#f9dd80" : "rgba(255,255,255,.25)"; ctx.lineWidth = hit ? 4 : opened ? 2.5 : 1.5; ctx.stroke();
    ctx.textAlign = "center"; ctx.textBaseline = "middle";
    if (revealMine) { ctx.font = "43px sans-serif"; ctx.fillStyle = "#fff"; ctx.fillText("✹", x + cell / 2, y + cell / 2); }
    else if (opened) { ctx.font = "38px sans-serif"; ctx.fillStyle = "#fff4af"; ctx.fillText("◆", x + cell / 2, y + cell / 2); }
    else { ctx.font = "bold 21px sans-serif"; ctx.fillStyle = "#bbb9b1"; ctx.fillText(String(number), x + cell / 2, y + cell / 2); }
  }

  const multiplier = session.multiplier; const potential = session.amount.times(String(multiplier)).round(0, 0);
  rounded(ctx, 63, 758, 594, 62, 13); ctx.fillStyle = "rgba(3,4,4,.88)"; ctx.fill(); ctx.strokeStyle = "rgba(246,207,100,.25)"; ctx.lineWidth = 1.5; ctx.stroke();
  const details = [
    ["TIỀN CƯỢC", `${formatCurrency(session.amount)} VNĐ`], ["SỐ MÌN", String(session.mineCount)], ["Ô AN TOÀN", String(session.opened.size)], ["HỆ SỐ", `×${multiplier.toFixed(2)}`], [returned ? "ĐÃ NHẬN" : "CÓ THỂ NHẬN", `${formatCurrency(returned || potential)} VNĐ`],
  ];
  details.forEach(([label, value], index) => { const x = 82 + index * 119; ctx.textAlign = "center"; ctx.fillStyle = "rgba(255,255,255,.5)"; ctx.font = "bold 10px sans-serif"; ctx.fillText(label, x, 780); ctx.fillStyle = index === 4 ? "#f5d46f" : "#fff"; ctx.font = "bold 13px sans-serif"; ctx.fillText(value, x, 804); });
  ctx.textAlign = "center"; ctx.fillStyle = "rgba(255,255,255,.53)"; ctx.font = "bold 13px sans-serif"; ctx.fillText(status === "playing" ? "Gõ số ô để mở · Gõ “rút” để nhận tiền" : "Ván chơi đã kết thúc", width / 2, 842);
  await fs.mkdir(path.resolve("./assets/temp"), { recursive: true }); const output = path.resolve(`./assets/temp/mines_${Date.now()}.png`); await fs.writeFile(output, await canvas.toBuffer("image/png")); return output;
}
