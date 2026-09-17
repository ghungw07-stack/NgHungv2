import { getActiveCanvasStyle } from "../../../utils/canvas/theme.js";
import { renderBoardV2 } from "../../../utils/canvas/board-style-v2.js";
import { Canvas } from 'skia-canvas';
import fs from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { MODES, multiplier, payout } from './rules.js';
export async function createTowerImage(s) {
  if (getActiveCanvasStyle() === 2) {
    const mode = MODES[s.mode];
    return renderBoardV2({ title: "THÁP TIỀN", subtitle: `${s.name} · ${mode.label} · ${s.status}`, columns: mode.columns,
      cells: Array.from({ length: 8 * mode.columns }, (_, i) => { const floor = 8 - Math.floor(i / mode.columns), col = i % mode.columns + 1, bomb = s.status !== "playing" && s.bombs[floor - 1] === col, picked = s.picks[floor - 1] === col; return { label: `T${floor} · Ô ${col}`, state: bomb ? "lost" : picked ? "selected" : "", detail: bomb ? "BOM" : picked ? "ĐÃ CHỌN" : `×${multiplier(s.mode, floor).toFixed(2)}` }; }),
      footer: `Cược ${s.amount.toFixed(0)} · ${s.status === "lost" ? "0" : payout(s.amount, s.mode, s.picks.length)} xu\nMỗi hàng là một tầng, từ tầng 8 xuống tầng 1` }, "thap");
  }
  const canvas = new Canvas(900, 900), ctx = canvas.getContext('2d');
  const mode = MODES[s.mode];
  const gradient = ctx.createLinearGradient(0, 0, 900, 900);
  gradient.addColorStop(0, '#252219'); gradient.addColorStop(1, '#080b10');
  ctx.fillStyle = gradient; ctx.fillRect(0, 0, 900, 900);
  ctx.textAlign = 'center'; ctx.fillStyle = '#f2ce72'; ctx.font = 'bold 38px sans-serif';
  ctx.fillText(`THÁP TIỀN · ${mode.label}`, 450, 65);
  ctx.font = '18px sans-serif'; ctx.fillStyle = '#c1beb4';
  ctx.fillText(s.status === 'lost' ? 'TRÚNG BOM' : s.status === 'cashed' ? 'ĐÃ RÚT TIỀN' : 'LEO 8 TẦNG', 450, 99);
  for (let floor = 8; floor >= 1; floor--) {
    const y = 130 + (8 - floor) * 76;
    if (s.status === 'playing' && floor === s.picks.length + 1) {
      ctx.fillStyle = '#4a4230'; ctx.fillRect(22, y - 5, 856, 70);
    }
    ctx.textAlign = 'center'; ctx.font = 'bold 22px sans-serif'; ctx.fillStyle = '#d6cfae'; ctx.fillText(`T${floor}`, 58, y + 37);
    const width = 620 / mode.columns;
    for (let col = 1; col <= mode.columns; col++) {
      const picked = s.picks[floor - 1] === col;
      const bomb = s.status !== 'playing' && s.bombs[floor - 1] === col;
      ctx.beginPath(); ctx.roundRect(103 + (col - 1) * width, y, width - 12, 60, 12);
      ctx.fillStyle = bomb ? '#763231' : picked ? '#24694e' : '#26282c'; ctx.fill();
      ctx.strokeStyle = picked ? '#f2ce72' : '#707070'; ctx.stroke();
      ctx.fillStyle = picked || bomb ? '#fff0bc' : '#b9b9b9';
      ctx.fillText(bomb ? '✹' : picked ? '✓' : String(col), 103 + (col - 1) * width + (width - 12) / 2, y + 38);
    }
    ctx.fillStyle = '#f2ce72'; ctx.fillText(`${multiplier(s.mode, floor).toFixed(2)}x`, 800, y + 37);
  }
  ctx.textAlign = 'left'; ctx.fillStyle = '#eee'; ctx.font = 'bold 23px sans-serif';
  ctx.fillText(String(s.name).slice(0, 35), 40, 775);
  ctx.font = '20px sans-serif'; ctx.fillStyle = '#c1beb4';
  ctx.fillText(`Cược ${s.amount.toFixed(0)} · ${mode.columns} ô/tầng · 1 bom`, 40, 814);
  ctx.fillText(`Đã qua ${s.status === 'lost' ? s.picks.length - 1 : s.picks.length}/8 tầng`, 40, 851);
  ctx.textAlign = 'right'; ctx.fillStyle = '#f2ce72'; ctx.font = 'bold 25px sans-serif';
  ctx.fillText(`${s.status === 'lost' ? '0' : payout(s.amount, s.mode, s.picks.length)} xu`, 855, 775);
  ctx.font = '17px sans-serif'; ctx.fillText('Sau phí 5% phần lãi', 855, 813);
  await fs.mkdir(path.resolve('assets/temp'), { recursive: true });
  const output = path.resolve(`assets/temp/thap_${randomUUID()}.png`);
  await fs.writeFile(output, await canvas.toBuffer('image/png')); return output;
}
