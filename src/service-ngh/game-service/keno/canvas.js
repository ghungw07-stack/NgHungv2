import { renderCollectionStyle } from "../../../utils/canvas/collection-style-renderers.js";
import { getActiveCanvasStyle } from "../../../utils/canvas/theme.js";
import { renderBoardV2 } from "../../../utils/canvas/board-style-v2.js";
import { Canvas } from "skia-canvas";
import fs from "fs/promises";
import path from "path";

function rounded(ctx, x, y, width, height, radius = 16) { ctx.beginPath(); ctx.roundRect(x, y, width, height, radius); }
function background(ctx, width, height) { const g = ctx.createLinearGradient(0, 0, width, height); g.addColorStop(0, "#07172b"); g.addColorStop(.55, "#113e68"); g.addColorStop(1, "#050c18"); ctx.fillStyle = g; ctx.fillRect(0, 0, width, height); }

function drawGrid(ctx, numbers, top = 190) {
  const drawn = new Set(numbers); const cols = 8, gap = 10, margin = 42, cellW = (1200 - margin * 2 - gap * (cols - 1)) / cols, cellH = 92;
  for (let number = 1; number <= 40; number += 1) {
    const index = number - 1, col = index % cols, row = Math.floor(index / cols); const x = margin + col * (cellW + gap), y = top + row * (cellH + gap); const active = drawn.has(number);
    rounded(ctx, x, y, cellW, cellH, 18); const g = ctx.createLinearGradient(x, y, x, y + cellH); g.addColorStop(0, active ? "#fff19b" : "rgba(14,53,88,.9)"); g.addColorStop(1, active ? "#d9a93d" : "rgba(5,24,48,.94)"); ctx.fillStyle = g; ctx.fill();
    ctx.strokeStyle = active ? "#fff3ae" : "rgba(115,183,237,.25)"; ctx.lineWidth = active ? 4 : 1.5; ctx.stroke(); ctx.textAlign = "center"; ctx.textBaseline = "middle"; ctx.fillStyle = active ? "#15263a" : "#d8ecff"; ctx.font = `bold ${active ? 37 : 29}px sans-serif`; ctx.fillText(String(number), x + cellW / 2, y + cellH / 2 + 2);
    if (active) { rounded(ctx, x + cellW - 58, y + 8, 49, 22, 11); ctx.fillStyle = "#c12a37"; ctx.fill(); ctx.fillStyle = "#fff"; ctx.font = "bold 10px sans-serif"; ctx.fillText("ĐÃ RA", x + cellW - 33, y + 19); }
  }
}

export async function createKenoResultImage(result, history = []) {
  if (getActiveCanvasStyle() === 2) {
    return renderBoardV2({ title: "KENO", subtitle: `Kết quả: ${result.numbers.join(" · ")}`, columns: 8,
      cells: Array.from({ length: 40 }, (_, i) => ({ label: String(i + 1), state: result.numbers.includes(i + 1) ? "selected" : "", detail: result.numbers.includes(i + 1) ? "ĐÃ RA" : "" })),
      footer: `6 phiên gần nhất: ${history.slice(-6).map(h => h.numbers.join(", ")).join(" / ")}` }, "keno");
  }
  const width = 1200, height = 900; const canvas = new Canvas(width, height); const ctx = canvas.getContext("2d"); background(ctx, width, height);
  ctx.fillStyle = "rgba(0,0,0,.25)"; ctx.fillRect(0, 0, width, 100); ctx.fillStyle = "#f4d86d"; ctx.textAlign = "left"; ctx.font = "bold 16px sans-serif"; ctx.fillText("KẾT QUẢ QUAY SỐ", 42, 34); ctx.fillStyle = "#fff"; ctx.font = "bold 42px sans-serif"; ctx.fillText("KENO 1–40", 42, 79);
  ctx.textAlign = "right"; ctx.fillStyle = "#f7e596"; ctx.font = "bold 17px sans-serif"; ctx.fillText("CHỌN TỐI ĐA 5 SỐ • MỖI PHIÊN RA 10 SỐ", width - 42, 60);
  rounded(ctx, 42, 120, 1116, 54, 27); ctx.fillStyle = "rgba(2,15,32,.72)"; ctx.fill(); ctx.strokeStyle = "rgba(255,232,130,.5)"; ctx.stroke(); ctx.fillStyle = "#ffe98f"; ctx.textAlign = "center"; ctx.font = "bold 23px sans-serif"; ctx.fillText(result.numbers.join("  •  "), width / 2, 154);
  drawGrid(ctx, result.numbers);
  rounded(ctx, 42, 710, 1116, 112, 20); ctx.fillStyle = "rgba(2,15,31,.75)"; ctx.fill(); ctx.textAlign = "left"; ctx.fillStyle = "#f3d96f"; ctx.font = "bold 14px sans-serif"; ctx.fillText("TỶ LỆ TRẢ THƯỞNG", 64, 742); ctx.fillStyle = "#d9edff"; ctx.font = "bold 15px sans-serif"; ctx.fillText("1 số: trúng 1 trả 1:2.8  •  2 số: trúng đủ trả 1:15  •  3 số: trúng 2 hoàn cược, trúng đủ trả 1:69", 64, 774); ctx.fillText("4 số: trúng 3 trả 1:7, đủ trả 1:299  •  5 số: trúng 3 trả 1:1, trúng 4 trả 1:29, đủ trả 1:1499", 64, 802);
  ctx.fillStyle = "rgba(255,255,255,.5)"; ctx.font = "bold 12px sans-serif"; ctx.fillText("6 PHIÊN GẦN NHẤT", 47, 858); history.slice(-6).forEach((item, index) => { const x = 260 + index * 148; rounded(ctx, x, 837, 132, 38, 19); ctx.fillStyle = "rgba(255,255,255,.08)"; ctx.fill(); ctx.fillStyle = "#d9edff"; ctx.textAlign = "center"; ctx.font = "bold 10px sans-serif"; ctx.fillText(item.numbers.slice(0, 5).join("•"), x + 66, 856); });
  await fs.mkdir(path.resolve("./assets/temp"), { recursive: true }); const output = path.resolve(`./assets/temp/keno_result_${Date.now()}.png`); await fs.writeFile(output, await canvas.toBuffer("image/png")); return output;
}

export async function createKenoHistoryImage(history) {
  if (getActiveCanvasStyle() === 2) return renderCollectionStyle(2, { title: "LỊCH SỬ KENO", subtitle: "Phiên mới nhất ở đầu danh sách", items: history.slice(-30).reverse().map((item, i) => ({ badge: String(i + 1), title: item.numbers.join(" · ") })) }, "history");
  const width = 1100, height = 700; const canvas = new Canvas(width, height); const ctx = canvas.getContext("2d"); background(ctx, width, height);
  ctx.fillStyle = "#f4d86d"; ctx.textAlign = "left"; ctx.font = "bold 16px sans-serif"; ctx.fillText("THỐNG KÊ QUAY SỐ", 42, 38); ctx.fillStyle = "#fff"; ctx.font = "bold 39px sans-serif"; ctx.fillText("SOI CẦU KENO", 42, 84);
  if (!history.length) { ctx.textAlign = "center"; ctx.fillStyle = "rgba(255,255,255,.55)"; ctx.font = "bold 24px sans-serif"; ctx.fillText("CHƯA CÓ KẾT QUẢ", width / 2, 370); }
  else history.slice(-12).reverse().forEach((item, index) => { const y = 126 + index * 43; rounded(ctx, 48, y, 1004, 34, 17); ctx.fillStyle = index === 0 ? "rgba(244,216,109,.18)" : "rgba(255,255,255,.06)"; ctx.fill(); ctx.fillStyle = index === 0 ? "#ffe98f" : "#d7eaff"; ctx.textAlign = "left"; ctx.font = "bold 14px sans-serif"; ctx.fillText(`Phiên ${history.length - index}`, 68, y + 22); ctx.textAlign = "center"; ctx.fillText(item.numbers.join("  •  "), 630, y + 22); });
  ctx.textAlign = "center"; ctx.fillStyle = "rgba(255,255,255,.5)"; ctx.font = "bold 13px sans-serif"; ctx.fillText("Kết quả mới nhất nằm trên cùng", width / 2, 665);
  await fs.mkdir(path.resolve("./assets/temp"), { recursive: true }); const output = path.resolve(`./assets/temp/keno_soicau_${Date.now()}.png`); await fs.writeFile(output, await canvas.toBuffer("image/png")); return output;
}
