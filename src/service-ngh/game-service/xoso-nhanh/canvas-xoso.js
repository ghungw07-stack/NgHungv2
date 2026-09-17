import path from "path";
import { createCanvas } from "canvas";
import { FONT_MAIN } from "../../../utils/format-util.js";
import { writeFilePromise } from "../../../utils/util.js";

function roundRect(ctx, x, y, width, height, radius) {
  const r = Math.min(radius, width / 2, height / 2);
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + width, y, x + width, y + height, r);
  ctx.arcTo(x + width, y + height, x, y + height, r);
  ctx.arcTo(x, y + height, x, y, r);
  ctx.arcTo(x, y, x + width, y, r);
  ctx.closePath();
}

/**
 * Vẽ bảng kết quả Xổ Số Miền Bắc Siêu Tốc 45s
 * @param {Object} xsmbResult
 * @param {string} sessionCode
 * @param {string} timeStr
 */
export async function createXoSo45sResultImage(xsmbResult, sessionCode = "1", timeStr = "") {
  const width = 860;
  const height = 720;
  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext("2d");

  // Nền đỏ đô sang trọng
  const bgGrad = ctx.createLinearGradient(0, 0, 0, height);
  bgGrad.addColorStop(0, "#4a0005");
  bgGrad.addColorStop(0.3, "#7a0c12");
  bgGrad.addColorStop(0.7, "#5a060b");
  bgGrad.addColorStop(1, "#360004");
  ctx.fillStyle = bgGrad;
  ctx.fillRect(0, 0, width, height);

  // Viền ngoài sang trọng
  ctx.strokeStyle = "#d4af37";
  ctx.lineWidth = 3;
  roundRect(ctx, 10, 10, width - 20, height - 20, 14);
  ctx.stroke();

  // Viền trong mỏng
  ctx.strokeStyle = "rgba(255, 215, 0, 0.4)";
  ctx.lineWidth = 1;
  roundRect(ctx, 15, 15, width - 30, height - 30, 10);
  ctx.stroke();

  // HEADER BANNER
  const headGrad = ctx.createLinearGradient(20, 20, 20, 95);
  headGrad.addColorStop(0, "#b8860b");
  headGrad.addColorStop(0.5, "#ffd700");
  headGrad.addColorStop(1, "#b8860b");

  ctx.fillStyle = headGrad;
  roundRect(ctx, 25, 22, width - 50, 72, 8);
  ctx.fill();
  ctx.strokeStyle = "#fff2a3";
  ctx.lineWidth = 1.5;
  ctx.stroke();

  ctx.textAlign = "center";
  ctx.textBaseline = "middle";

  ctx.font = `bold 24px ${FONT_MAIN}`;
  ctx.fillStyle = "#680004";
  ctx.shadowColor = "rgba(255, 255, 255, 0.6)";
  ctx.shadowBlur = 4;
  ctx.fillText("XỔ SỐ MIỀN BẮC • SIÊU TỐC 45 GIÂY", width / 2, 45);

  ctx.font = `bold 14px ${FONT_MAIN}`;
  ctx.fillStyle = "#4a0002";
  ctx.shadowBlur = 0;
  const timeDisplay = timeStr || new Date().toLocaleString("vi-VN", { timeZone: "Asia/Ho_Chi_Minh" });
  ctx.fillText(`Kỳ quay: #${sessionCode}  |  Thời gian: ${timeDisplay}`, width / 2, 72);

  // KHU VỰC BẢNG KẾT QUẢ 27 GIẢI
  const tableX = 25;
  const tableY = 104;
  const tableW = width - 50;
  const colNameW = 120;
  const colValW = tableW - colNameW;

  const rows = [
    { name: "ĐẶC BIỆT", values: [xsmbResult.db], isDb: true, h: 48 },
    { name: "Giải Nhất", values: [xsmbResult.g1], h: 38 },
    { name: "Giải Nhì", values: xsmbResult.g2, h: 38 },
    { name: "Giải Ba", values: xsmbResult.g3, h: 64, cols: 3 },
    { name: "Giải Tư", values: xsmbResult.g4, h: 38, cols: 4 },
    { name: "Giải Năm", values: xsmbResult.g5, h: 64, cols: 3 },
    { name: "Giải Sáu", values: xsmbResult.g6, h: 38, cols: 3 },
    { name: "Giải Bảy", values: xsmbResult.g7, h: 38, cols: 4 },
  ];

  let currentY = tableY;

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const rowH = row.h;
    const isEven = i % 2 === 0;

    // Nền cột Tên giải
    ctx.fillStyle = row.isDb ? "#800000" : isEven ? "#2b0305" : "#3b0508";
    ctx.fillRect(tableX, currentY, colNameW, rowH);

    // Viền ô Tên giải
    ctx.strokeStyle = "#d4af37";
    ctx.lineWidth = 1;
    ctx.strokeRect(tableX, currentY, colNameW, rowH);

    // Chữ Tên giải
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.font = row.isDb ? `bold 16px ${FONT_MAIN}` : `bold 14px ${FONT_MAIN}`;
    ctx.fillStyle = row.isDb ? "#ffd700" : "#ffebcd";
    ctx.fillText(row.name, tableX + colNameW / 2, currentY + rowH / 2);

    // Nền cột Giá trị giải
    ctx.fillStyle = row.isDb ? "#fff9e6" : isEven ? "#ffffff" : "#fdf6e7";
    ctx.fillRect(tableX + colNameW, currentY, colValW, rowH);
    ctx.strokeRect(tableX + colNameW, currentY, colValW, rowH);

    // Vẽ các số trúng giải
    const vals = row.values || [];
    const cols = row.cols || vals.length;

    if (row.isDb) {
      // Giải Đặc Biệt: số to đỏ nổi bật rực rỡ
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.font = `bold 32px ${FONT_MAIN}`;
      ctx.fillStyle = "#d32f2f";
      const dbStr = String(vals[0] || "00000").split("").join("  ");
      ctx.fillText(dbStr, tableX + colNameW + colValW / 2, currentY + rowH / 2);
    } else if (cols === 3 && vals.length === 6) {
      // 6 giải chia 2 dòng x 3 cột (G3, G5)
      const colStep = colValW / 3;
      const subRowH = rowH / 2;
      ctx.font = `bold 16px ${FONT_MAIN}`;
      ctx.fillStyle = "#111111";

      for (let idx = 0; idx < 6; idx++) {
        const c = idx % 3;
        const r = Math.floor(idx / 3);
        const cellX = tableX + colNameW + c * colStep + colStep / 2;
        const cellY = currentY + r * subRowH + subRowH / 2;
        ctx.fillText(String(vals[idx] || ""), cellX, cellY);
      }
    } else {
      // 1 dòng chia đều các cột
      const colStep = colValW / (cols || 1);
      ctx.font = row.name.includes("Bảy") ? `bold 20px ${FONT_MAIN}` : `bold 17px ${FONT_MAIN}`;
      ctx.fillStyle = row.name.includes("Bảy") ? "#c62828" : "#111111";

      for (let c = 0; c < vals.length; c++) {
        const cellX = tableX + colNameW + c * colStep + colStep / 2;
        const cellY = currentY + rowH / 2;
        ctx.fillText(String(vals[c] || ""), cellX, cellY);
      }
    }

    currentY += rowH;
  }

  // KHU VỰC TỔNG KẾT NHANH (FOOTER PANEL)
  const summaryY = currentY + 12;
  const summaryH = 105;

  // Hộp Đề Đặc Biệt & 3 Càng
  const boxW = (tableW - 20) / 2;

  // Box 1: Đề Đặc Biệt
  const box1Grad = ctx.createLinearGradient(tableX, summaryY, tableX + boxW, summaryY + summaryH);
  box1Grad.addColorStop(0, "#ffd700");
  box1Grad.addColorStop(1, "#ffaa00");
  ctx.fillStyle = box1Grad;
  roundRect(ctx, tableX, summaryY, boxW, summaryH, 10);
  ctx.fill();
  ctx.strokeStyle = "#ffffff";
  ctx.lineWidth = 1.5;
  ctx.stroke();

  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillStyle = "#7a0c12";
  ctx.font = `bold 15px ${FONT_MAIN}`;
  ctx.fillText("🔥 ĐỀ ĐẶC BIỆT (2 SỐ CUỐI)", tableX + boxW / 2, summaryY + 24);

  ctx.fillStyle = "#b71c1c";
  ctx.font = `bold 42px ${FONT_MAIN}`;
  ctx.fillText(xsmbResult.de || "--", tableX + boxW / 2, summaryY + 62);

  ctx.font = `bold 13px ${FONT_MAIN}`;
  ctx.fillStyle = "#4a0002";
  ctx.fillText("Tỉ lệ ăn: 1 ăn 70", tableX + boxW / 2, summaryY + 90);

  // Box 2: 3 Càng & Lô 27 giải
  const box2X = tableX + boxW + 20;
  const box2Grad = ctx.createLinearGradient(box2X, summaryY, box2X + boxW, summaryY + summaryH);
  box2Grad.addColorStop(0, "#1a237e");
  box2Grad.addColorStop(1, "#0d47a1");
  ctx.fillStyle = box2Grad;
  roundRect(ctx, box2X, summaryY, boxW, summaryH, 10);
  ctx.fill();
  ctx.strokeStyle = "#42a5f5";
  ctx.lineWidth = 1.5;
  ctx.stroke();

  ctx.fillStyle = "#ffd54f";
  ctx.font = `bold 15px ${FONT_MAIN}`;
  ctx.fillText("⭐ 3 CÀNG: [ " + (xsmbResult.baCang || "---") + " ]  (1 ăn 400)", box2X + boxW / 2, summaryY + 24);

  // Danh sách các số lô về trong kỳ (sắp xếp tăng dần)
  const uniqueLoto = Array.from(new Set(xsmbResult.lo27 || [])).sort();
  ctx.fillStyle = "#ffffff";
  ctx.font = `bold 12px ${FONT_MAIN}`;
  ctx.fillText(`Lô tô 27 giải (${uniqueLoto.length} con về):`, box2X + boxW / 2, summaryY + 48);

  ctx.fillStyle = "#81d4fa";
  ctx.font = `bold 13px ${FONT_MAIN}`;
  const lotoLine1 = uniqueLoto.slice(0, 10).join("  ");
  const lotoLine2 = uniqueLoto.slice(10, 20).join("  ");
  ctx.fillText(lotoLine1, box2X + boxW / 2, summaryY + 68);
  if (lotoLine2) {
    ctx.fillText(lotoLine2, box2X + boxW / 2, summaryY + 87);
  }

  // Xuất file ảnh
  const fileName = `xoso45s_result_${Date.now()}_${Math.floor(Math.random() * 1000)}.png`;
  const filePath = path.resolve(`./assets/temp/${fileName}`);
  await writeFilePromise(filePath, canvas.toBuffer());

  return filePath;
}
