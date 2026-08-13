import path from "path";
import { createCanvas, loadImage } from "canvas";
import { FONT_MAIN, formatCurrency } from "../format-util.js";
import { writeFilePromise } from "../util.js";

const GAME_WIDTH = 960;
const GAME_HEIGHT = 540;
const DICE_ASSET_DIR = path.join(process.cwd(), "assets", "resources", "game", "taixiu");

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

function drawGameBackground(ctx, accent = "#f4c95d") {
  const gradient = ctx.createLinearGradient(0, 0, GAME_WIDTH, GAME_HEIGHT);
  gradient.addColorStop(0, "#071611");
  gradient.addColorStop(0.52, "#10281e");
  gradient.addColorStop(1, "#090e0c");
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, GAME_WIDTH, GAME_HEIGHT);

  const glow = ctx.createRadialGradient(GAME_WIDTH / 2, 255, 15, GAME_WIDTH / 2, 255, 430);
  glow.addColorStop(0, `${accent}2b`);
  glow.addColorStop(0.55, `${accent}0d`);
  glow.addColorStop(1, "rgba(0,0,0,0)");
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, GAME_WIDTH, GAME_HEIGHT);

  ctx.save();
  ctx.globalAlpha = 0.075;
  ctx.strokeStyle = "#ffffff";
  ctx.lineWidth = 1;
  for (let x = -GAME_HEIGHT; x < GAME_WIDTH; x += 36) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x + GAME_HEIGHT, GAME_HEIGHT);
    ctx.stroke();
  }
  ctx.restore();

  const edge = ctx.createLinearGradient(0, 0, 0, GAME_HEIGHT);
  edge.addColorStop(0, "rgba(255,255,255,0.08)");
  edge.addColorStop(0.5, "rgba(255,255,255,0)");
  edge.addColorStop(1, "rgba(0,0,0,0.35)");
  ctx.fillStyle = edge;
  ctx.fillRect(0, 0, GAME_WIDTH, GAME_HEIGHT);
}

function drawPanel(ctx, x, y, width, height, accent, active = false) {
  ctx.save();
  ctx.shadowColor = active ? `${accent}66` : "rgba(0,0,0,0.45)";
  ctx.shadowBlur = active ? 22 : 14;
  ctx.shadowOffsetY = 8;
  roundedRect(ctx, x, y, width, height, 24);
  const gradient = ctx.createLinearGradient(x, y, x, y + height);
  gradient.addColorStop(0, active ? `${accent}26` : "rgba(255,255,255,0.10)");
  gradient.addColorStop(1, "rgba(2,7,5,0.78)");
  ctx.fillStyle = gradient;
  ctx.fill();
  ctx.shadowColor = "transparent";
  ctx.strokeStyle = active ? `${accent}d9` : "rgba(255,255,255,0.16)";
  ctx.lineWidth = active ? 2.5 : 1.5;
  ctx.stroke();
  ctx.restore();
}

function drawHeader(ctx, subtitle, accent = "#f4c95d") {
  ctx.textBaseline = "middle";
  ctx.textAlign = "left";
  ctx.fillStyle = accent;
  ctx.font = `bold 16px ${FONT_MAIN}`;
  ctx.fillText("CASINO LIVE", 44, 40);
  ctx.fillStyle = "#ffffff";
  ctx.font = `bold 38px ${FONT_MAIN}`;
  ctx.fillText("TÀI XỈU", 44, 76);
  ctx.fillStyle = "rgba(255,255,255,0.62)";
  ctx.font = `bold 15px ${FONT_MAIN}`;
  ctx.fillText(subtitle, 44, 110);

  roundedRect(ctx, 804, 36, 112, 36, 18);
  ctx.fillStyle = "rgba(0,0,0,0.28)";
  ctx.fill();
  ctx.fillStyle = "#42e89c";
  ctx.beginPath();
  ctx.arc(828, 54, 5, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#e9fff5";
  ctx.font = `bold 14px ${FONT_MAIN}`;
  ctx.fillText("TRỰC TIẾP", 842, 55);
}

function fitText(ctx, text, maxWidth, startSize, minSize = 20) {
  let size = startSize;
  while (size > minSize) {
    ctx.font = `bold ${size}px ${FONT_MAIN}`;
    if (ctx.measureText(text).width <= maxWidth) break;
    size -= 2;
  }
  return size;
}

function drawBetPanel(ctx, { x, label, subtitle, total, accent, active = false }) {
  drawPanel(ctx, x, 154, 248, 302, accent, active);
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillStyle = active ? accent : "rgba(255,255,255,0.88)";
  ctx.font = `bold 54px ${FONT_MAIN}`;
  ctx.fillText(label, x + 124, 225);
  ctx.fillStyle = "rgba(255,255,255,0.48)";
  ctx.font = `bold 14px ${FONT_MAIN}`;
  ctx.fillText(subtitle, x + 124, 269);

  roundedRect(ctx, x + 24, 309, 200, 94, 18);
  ctx.fillStyle = "rgba(0,0,0,0.30)";
  ctx.fill();
  ctx.fillStyle = "rgba(255,255,255,0.54)";
  ctx.font = `bold 13px ${FONT_MAIN}`;
  ctx.fillText("TỔNG TIỀN CƯỢC", x + 124, 334);
  const money = formatCurrency(total, 1_000_000_000_000);
  ctx.fillStyle = active ? accent : "#ffffff";
  ctx.font = `bold ${fitText(ctx, money, 174, 29, 19)}px ${FONT_MAIN}`;
  ctx.fillText(money, x + 124, 370);
  ctx.fillStyle = "rgba(255,255,255,0.42)";
  ctx.font = `bold 12px ${FONT_MAIN}`;
  ctx.fillText("VNĐ", x + 124, 394);

  if (active) {
    roundedRect(ctx, x + 69, 423, 110, 25, 12);
    ctx.fillStyle = accent;
    ctx.fill();
    ctx.fillStyle = "#07110d";
    ctx.font = `bold 12px ${FONT_MAIN}`;
    ctx.fillText("CỬA THẮNG", x + 124, 436);
  }
}

async function drawDiceRow(ctx, dice, centerX, centerY, diceSize = 84) {
  const gap = diceSize + 18;
  const startX = centerX - gap;
  for (let index = 0; index < dice.length; index++) {
    const x = startX + index * gap;
    ctx.save();
    ctx.shadowColor = "rgba(0,0,0,0.72)";
    ctx.shadowBlur = 18;
    ctx.shadowOffsetY = 10;
    try {
      const image = await loadImage(path.join(DICE_ASSET_DIR, `dice_${dice[index]}.png`));
      ctx.drawImage(image, x - diceSize / 2, centerY - diceSize / 2, diceSize, diceSize);
    } catch (error) {
      console.error(`Không tìm thấy hình ảnh cho xúc xắc ${dice[index]}`);
    }
    ctx.restore();
  }
}

export async function createTaiXiuResultImage(result, taiTotal, xiuTotal, jackpotInfo) {
  const canvas = createCanvas(GAME_WIDTH, GAME_HEIGHT);
  const ctx = canvas.getContext("2d");
  const isTai = result.result === "tai";
  const accent = jackpotInfo?.isJackpot ? "#ffd665" : isTai ? "#ff6577" : "#55dbea";

  drawGameBackground(ctx, accent);
  drawHeader(ctx, jackpotInfo?.isJackpot ? "PHIÊN ĐẶC BIỆT • HŨ ĐÃ NỔ" : "KẾT QUẢ PHIÊN VỪA MỞ", accent);
  drawBetPanel(ctx, { x: 32, label: "TÀI", subtitle: "TỔNG TỪ 11 ĐẾN 17", total: taiTotal, accent: "#ff6577", active: isTai });
  drawBetPanel(ctx, { x: 680, label: "XỈU", subtitle: "TỔNG TỪ 4 ĐẾN 10", total: xiuTotal, accent: "#55dbea", active: !isTai });

  drawPanel(ctx, 300, 154, 360, 302, accent, true);
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillStyle = "rgba(255,255,255,0.55)";
  ctx.font = `bold 14px ${FONT_MAIN}`;
  ctx.fillText("KẾT QUẢ", 480, 180);
  ctx.fillStyle = accent;
  ctx.font = `bold 52px ${FONT_MAIN}`;
  ctx.shadowColor = `${accent}66`;
  ctx.shadowBlur = 18;
  ctx.fillText(isTai ? "TÀI" : "XỈU", 480, 224);
  ctx.shadowColor = "transparent";
  await drawDiceRow(ctx, result.dice, 480, 314, 82);

  roundedRect(ctx, 400, 377, 160, 54, 27);
  ctx.fillStyle = accent;
  ctx.fill();
  ctx.fillStyle = "#07110d";
  ctx.font = `bold 17px ${FONT_MAIN}`;
  ctx.fillText(`TỔNG  ${result.total}`, 480, 404);

  if (jackpotInfo?.isJackpot) {
    roundedRect(ctx, 224, 478, 512, 42, 21);
    const jackpotGradient = ctx.createLinearGradient(224, 0, 736, 0);
    jackpotGradient.addColorStop(0, "#b88721");
    jackpotGradient.addColorStop(0.5, "#ffe89c");
    jackpotGradient.addColorStop(1, "#b88721");
    ctx.fillStyle = jackpotGradient;
    ctx.fill();
    ctx.fillStyle = "#231704";
    const jackpotText = `NỔ HŨ  •  ${formatCurrency(jackpotInfo.jackpotAmount)} VNĐ`;
    ctx.font = `bold ${fitText(ctx, jackpotText, 458, 20, 15)}px ${FONT_MAIN}`;
    ctx.fillText(jackpotText, 480, 499);
  } else {
    ctx.fillStyle = "rgba(255,255,255,0.43)";
    ctx.font = `bold 14px ${FONT_MAIN}`;
    ctx.fillText("PHIÊN ĐÃ KẾT THÚC  •  CHỜ PHIÊN MỚI", 480, 500);
  }

  const filePath = path.resolve(`./assets/temp/taixiu_result_${Date.now()}.png`);
  await writeFilePromise(filePath, canvas.toBuffer());
  return filePath;
}

export async function createWaitingImage(remainingSeconds, taiTotal, xiuTotal) {
  const canvas = createCanvas(GAME_WIDTH, GAME_HEIGHT);
  const ctx = canvas.getContext("2d");

  drawGameBackground(ctx, "#f4c95d");
  drawHeader(ctx, "ĐANG NHẬN CƯỢC • CHỌN CỬA CỦA BẠN", "#f4c95d");
  drawBetPanel(ctx, { x: 32, label: "TÀI", subtitle: "TỔNG TỪ 11 ĐẾN 17", total: taiTotal, accent: "#ff6577" });
  drawBetPanel(ctx, { x: 680, label: "XỈU", subtitle: "TỔNG TỪ 4 ĐẾN 10", total: xiuTotal, accent: "#55dbea" });

  drawPanel(ctx, 300, 154, 360, 302, "#f4c95d", true);
  const centerX = 480;
  const centerY = 294;
  const seconds = Math.max(0, Math.ceil(Number(remainingSeconds) || 0));
  const progress = Math.min(1, seconds / 60);

  ctx.beginPath();
  ctx.arc(centerX, centerY, 94, 0, Math.PI * 2);
  ctx.strokeStyle = "rgba(255,255,255,0.11)";
  ctx.lineWidth = 12;
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(centerX, centerY, 94, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * progress);
  ctx.strokeStyle = "#f4c95d";
  ctx.lineWidth = 12;
  ctx.lineCap = "round";
  ctx.shadowColor = "rgba(244,201,93,0.55)";
  ctx.shadowBlur = 14;
  ctx.stroke();
  ctx.shadowColor = "transparent";

  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillStyle = "rgba(255,255,255,0.52)";
  ctx.font = `bold 13px ${FONT_MAIN}`;
  ctx.fillText("CÒN LẠI", centerX, centerY - 35);
  ctx.fillStyle = "#ffffff";
  ctx.font = `bold 68px ${FONT_MAIN}`;
  ctx.fillText(seconds.toString().padStart(2, "0"), centerX, centerY + 13);
  ctx.fillStyle = "#f4c95d";
  ctx.font = `bold 14px ${FONT_MAIN}`;
  ctx.fillText("GIÂY", centerX, centerY + 59);

  roundedRect(ctx, 376, 420, 208, 26, 13);
  ctx.fillStyle = "rgba(244,201,93,0.12)";
  ctx.fill();
  ctx.fillStyle = "#f8dda0";
  ctx.font = `bold 12px ${FONT_MAIN}`;
  ctx.fillText("ĐẶT CƯỢC NGAY", centerX, 433);

  ctx.fillStyle = "rgba(255,255,255,0.43)";
  ctx.font = `bold 14px ${FONT_MAIN}`;
  ctx.fillText("TÀI: >tx tai [tiền]     •     XỈU: >tx xiu [tiền]", 480, 500);

  const filePath = path.resolve(`./assets/temp/taixiu_waiting_${Date.now()}.png`);
  await writeFilePromise(filePath, canvas.toBuffer());
  return filePath;
}

export async function createSoiCauImage(history, maxHistory = 20) {
  const width = 800;
  const height = 600;
  const padding = 40;
  const graphHeight = (height - padding * 3) / 2;

  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext("2d");

  // Vẽ background
  const gradient = ctx.createLinearGradient(0, 0, 0, height);
  gradient.addColorStop(0, "#1a1a1a");
  gradient.addColorStop(1, "#000000");
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, width, height);

  // Thêm hiệu ứng lấp lánh
  for (let i = 0; i < 100; i++) {
    const x = Math.random() * width;
    const y = Math.random() * height;
    const radius = Math.random() * 1.5;
    ctx.beginPath();
    ctx.arc(x, y, radius, 0, Math.PI * 2);
    ctx.fillStyle = `rgba(255, 255, 255, ${Math.random() * 0.3})`;
    ctx.fill();
  }

  // Vẽ đồ thị chẵn lẻ
  ctx.save();
  ctx.translate(padding, padding);
  drawEvenOddGraph(ctx, history, width - padding * 2, graphHeight, maxHistory);
  ctx.restore();

  // Vẽ đồ thị đường đi xúc sắc
  ctx.save();
  ctx.translate(padding, padding * 2 + graphHeight);
  drawDicePathGraph(ctx, history, width - padding * 2, graphHeight, maxHistory);
  ctx.restore();

  // Lưu canvas thành file ảnh
  const filePath = path.resolve(`./assets/temp/taixiu_soicau_${Date.now()}.png`);
  await writeFilePromise(filePath, canvas.toBuffer());

  return filePath;
}

function drawEvenOddGraph(ctx, history, width, height, maxHistory = 20) {
  const step = width / (maxHistory - 1);
  const totalPoints = 15; // Giảm xuống 15 để có 16 hàng (0-15)
  const gridSize = height / totalPoints;

  // Vẽ khung đồ thị
  ctx.strokeStyle = "#333333";
  ctx.lineWidth = 1;
  ctx.strokeRect(0, 0, width, height);

  // Vẽ lưới ô vuông với màu sáng hơn
  ctx.strokeStyle = "rgba(255, 255, 255, 0.2)";
  ctx.lineWidth = 1;

  // Vẽ đường ngang và số điểm
  for (let i = 0; i <= totalPoints; i++) {
    const y = i * gridSize;
    const points = 18 - i; // Điểm tương ứng (từ 18 xuống 3)

    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(width, y);
    ctx.stroke();

    // Hiển thị số điểm bên trái đồ thị
    if (points >= 3 && points <= 18) {
      ctx.fillStyle = "#ffffff";
      ctx.font = "bold 14px Arial";
      ctx.textAlign = "right";
      ctx.textBaseline = "middle";
      ctx.fillText(points.toString(), -10, y);
    }
  }

  // Vẽ đường dọc
  for (let x = step; x < width; x += step) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, height);
    ctx.stroke();
  }

  // Vẽ tiêu đề
  ctx.font = "bold 20px Arial";
  ctx.fillStyle = "#FFFFFF";
  ctx.textAlign = "center";
  ctx.fillText("Thống Kê Tài/Xỉu", width / 2, -26);

  // Vẽ đường kết nối các điểm trước khi vẽ các điểm
  ctx.beginPath();
  ctx.strokeStyle = "rgba(255, 255, 255, 0.3)"; // Màu trắng mờ
  ctx.lineWidth = 2;
  ctx.setLineDash([5, 5]); // Đường nét đứt

  const reversedHistory = [...history].slice(0, maxHistory).reverse();

  reversedHistory.forEach((result, index) => {
    const x = index * step;
    const y = ((18 - result.total) * height) / totalPoints;

    if (index === 0) {
      ctx.moveTo(x, y);
    } else {
      ctx.lineTo(x, y);
    }
  });
  ctx.stroke();
  ctx.setLineDash([]); // Reset đưng nét đứt

  // Vẽ các điểm kết quả
  reversedHistory.forEach((result, index) => {
    const x = index * step;
    const y = ((18 - result.total) * height) / totalPoints;

    // Vẽ vòng tròn nền
    ctx.beginPath();
    ctx.arc(x, y, 18, 0, Math.PI * 2);
    ctx.fillStyle = "rgba(0, 0, 0, 0.7)";
    ctx.fill();
    ctx.strokeStyle = result.total > 10 ? "#ff0000" : "#00ffff";
    ctx.lineWidth = 2;
    ctx.stroke();

    // Vẽ điểm đánh dấu
    ctx.beginPath();
    ctx.arc(x, y, 15, 0, Math.PI * 2);
    ctx.fillStyle = result.total > 10 ? "#ff0000" : "#00ffff";
    ctx.fill();

    // Hiển thị tổng điểm
    ctx.font = "bold 16px Arial";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.strokeStyle = "#000000";
    ctx.lineWidth = 4;
    ctx.strokeText(result.total.toString(), x, y);
    ctx.fillStyle = "#ffffff";
    ctx.fillText(result.total.toString(), x, y);

    // Vẽ đường nối với điểm tiếp theo nếu có
    if (index < reversedHistory.length - 1) {
      const nextResult = reversedHistory[index + 1];
      const nextX = (index + 1) * step;
      const nextY = ((18 - nextResult.total) * height) / totalPoints;

      // Vẽ mũi tên chỉ hướng
      const angle = Math.atan2(nextY - y, nextX - x);
      const arrowLength = 10;
      const arrowWidth = 5;

      ctx.beginPath();
      ctx.moveTo(
        x + Math.cos(angle) * 20, // Điểm bắt đầu từ mép vòng tròn
        y + Math.sin(angle) * 20
      );
      ctx.lineTo(
        nextX - Math.cos(angle) * 20, // Điểm kết thúc trước vòng tròn tiếp theo
        nextY - Math.sin(angle) * 20
      );

      // Vẽ mũi tên
      const midX = (x + nextX) / 2;
      const midY = (y + nextY) / 2;

      ctx.moveTo(midX, midY);
      ctx.lineTo(midX - arrowLength * Math.cos(angle - Math.PI / 6), midY - arrowLength * Math.sin(angle - Math.PI / 6));
      ctx.moveTo(midX, midY);
      ctx.lineTo(midX - arrowLength * Math.cos(angle + Math.PI / 6), midY - arrowLength * Math.sin(angle + Math.PI / 6));

      // Màu đường nối dựa trên kết quả hiện tại và tiếp theo
      const gradient = ctx.createLinearGradient(x, y, nextX, nextY);
      gradient.addColorStop(0, result.total > 10 ? "#ff0000" : "#00ffff");
      gradient.addColorStop(1, nextResult.total > 10 ? "#ff0000" : "#00ffff");

      ctx.strokeStyle = gradient;
      ctx.lineWidth = 2;
      ctx.stroke();
    }
  });

  // Điều chỉnh vị trí đường phân chia Tài/Xỉu
  const taiXiuLine = ((18 - 10.5) * height) / totalPoints;
  ctx.beginPath();
  ctx.strokeStyle = "rgba(255, 255, 0, 0.5)";
  ctx.setLineDash([5, 5]);
  ctx.moveTo(0, taiXiuLine);
  ctx.lineTo(width, taiXiuLine);
  ctx.stroke();
  ctx.setLineDash([]);

  // Điều chỉnh vị trí chú thích Tài/Xỉu
  ctx.font = "bold 14px Arial";
  ctx.textBaseline = "middle";
  ctx.fillStyle = "#ff0000";
  ctx.textAlign = "left";
  ctx.fillText("TÀI", 5, taiXiuLine - gridSize / 2);
  ctx.fillStyle = "#00ffff";
  ctx.fillText("XỈU", 5, taiXiuLine + gridSize / 2);
}

function drawDicePathGraph(ctx, history, width, height, maxHistory = 20) {
  const step = width / (maxHistory - 1);
  const padding = 20;
  const gridSize = height / 6;

  // Vẽ khung đồ thị
  ctx.strokeStyle = "#333333";
  ctx.lineWidth = 1;
  ctx.strokeRect(0, 0, width, height);

  // Vẽ lưới ô vuông với màu sáng hơn
  ctx.strokeStyle = "rgba(255, 255, 255, 0.2)";
  ctx.lineWidth = 1;

  // Vẽ đường ngang
  for (let y = gridSize; y < height; y += gridSize) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(width, y);
    ctx.stroke();
  }

  // Vẽ đường dọc
  for (let x = step; x < width; x += step) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, height);
    ctx.stroke();
  }

  // Vẽ tiêu đề
  ctx.font = "bold 20px Arial";
  ctx.fillStyle = "#FFFFFF";
  ctx.textAlign = "center";
  ctx.fillText("Đường đi của 3 xúc sắc", width / 2, -10);

  const colors = ["#ff0000", "#00ff00", "#0000ff"];
  const reversedHistory = [...history].slice(0, maxHistory).reverse();

  // Vẽ điểm đánh dấu và số trước
  reversedHistory.forEach((result, index) => {
    // Tạo mảng để lưu các vị trí đã vẽ tại mỗi điểm x
    const usedPositions = new Map();

    result.dice.forEach((value, diceIndex) => {
      const x = index * step;
      let y = height - (value / 6) * height;

      // Kiểm tra xem đã c điểm nào ở vị trí y này chưa
      if (usedPositions.has(y)) {
        const offset = 15;
        const direction = diceIndex % 2 === 0 ? 1 : -1;
        y += offset * direction;
      }
      usedPositions.set(y, true);

      // Vẽ vòng tròn nền lớn hơn
      ctx.beginPath();
      ctx.arc(x, y, 15, 0, Math.PI * 2); // Tăng kích thước từ 12 lên 15
      ctx.fillStyle = "rgba(0, 0, 0, 0.7)"; // Tăng độ đậm của nền
      ctx.fill();
      ctx.strokeStyle = colors[diceIndex];
      ctx.lineWidth = 2;
      ctx.stroke();

      // Vẽ điểm đánh dấu
      ctx.beginPath();
      ctx.arc(x, y, 12, 0, Math.PI * 2); // Tăng kích thước từ 8 lên 12
      ctx.fillStyle = colors[diceIndex];
      ctx.fill();

      // Hiển thị giá trị xúc sắc với viền đen và font lớn hơn
      ctx.font = "bold 16px Arial"; // Tăng kích thước font từ 12px lên 16px
      ctx.textAlign = "center";
      ctx.strokeStyle = "#000000";
      ctx.lineWidth = 4; // Tăng độ dày viền
      ctx.strokeText(value.toString(), x, y + 6);
      ctx.fillStyle = "#ffffff";
      ctx.fillText(value.toString(), x, y + 6);
    });
  });

  // Vẽ đường kết nối sau khi đã vẽ tất cả các điểm
  colors.forEach((color, diceIndex) => {
    ctx.beginPath();
    ctx.strokeStyle = color;
    ctx.lineWidth = 2;
    ctx.globalAlpha = 0.5; // Làm mờ đường kết nối

    let firstPoint = true;
    reversedHistory.forEach((result, index) => {
      const x = index * step;
      let y = height - (result.dice[diceIndex] / 6) * height;

      // Điều chỉnh y nếu có điểm trùng
      const sameValueIndices = result.dice
        .map((val, idx) => ({ val, idx }))
        .filter((item) => item.val === result.dice[diceIndex])
        .map((item) => item.idx);

      if (sameValueIndices.length > 1) {
        const offset = 15;
        const direction = diceIndex % 2 === 0 ? 1 : -1;
        y += offset * direction;
      }

      if (firstPoint) {
        ctx.moveTo(x, y);
        firstPoint = false;
      } else {
        ctx.lineTo(x, y);
      }
    });
    ctx.stroke();
    ctx.globalAlpha = 1; // Khôi phục độ trong suốt
  });

  // Vẽ chú thích
  const legend = ["Xúc sắc 1", "Xúc sắc 2", "Xúc sắc 3"];
  const legendStartX = width * 0.02;
  const legendY = height + 10;
  const legendSpacing = 120;
  const legendBoxSize = 20;

  legend.forEach((text, index) => {
    const x = legendStartX + index * legendSpacing;

    // Vẽ hộp màu với viền đen
    ctx.fillStyle = colors[index];
    ctx.fillRect(x, legendY, legendBoxSize, legendBoxSize);
    ctx.strokeStyle = "#000000";
    ctx.lineWidth = 2;
    ctx.strokeRect(x, legendY, legendBoxSize, legendBoxSize);

    // Vẽ chữ với viền đen để dễ đọc
    ctx.font = "bold 16px Arial";
    ctx.textAlign = "left";

    // Vẽ viền đen cho chữ
    ctx.strokeStyle = "#000000";
    ctx.lineWidth = 3;
    ctx.strokeText(text, x + legendBoxSize + 10, legendY + legendBoxSize / 2 + 5);

    // Vẽ chữ
    ctx.fillStyle = "#ffffff";
    ctx.fillText(text, x + legendBoxSize + 10, legendY + legendBoxSize / 2 + 5);
  });
}

// Thêm hàm mới để vẽ kết quả Vietlott
export async function createVietlott655ResultImage(mainNumbers, extraNumber, isJackpot = false) {
  const width = 800;
  const height = 200;
  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext("2d");

  // Vẽ background gradient
  const gradient = ctx.createLinearGradient(0, 0, 0, height);
  gradient.addColorStop(0, "#1a237e");
  gradient.addColorStop(1, "#0d47a1");
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, width, height);

  // Vẽ hiệu ứng ánh sáng nếu trúng jackpot
  if (isJackpot) {
    const lightGradient = ctx.createRadialGradient(width/2, height/2, 0, width/2, height/2, Math.max(width, height));
    lightGradient.addColorStop(0, "rgba(255, 215, 0, 0.3)");
    lightGradient.addColorStop(1, "rgba(255, 215, 0, 0)");
    ctx.fillStyle = lightGradient;
    ctx.fillRect(0, 0, width, height);
  }

  // Cấu hình cho các viên bi
  const circleRadius = 35;
  const spacing = 90; // Khoảng cách giữa các bi
  
  // Tính toán tổng chiều rộng cần thiết cho tất cả 7 bi
  const totalWidth = spacing * 6; // 6 khoảng cách cho 7 bi
  const startX = (width - totalWidth) / 2; // Điểm bắt đầu để căn giữa tất cả 7 bi
  const centerY = height / 2;

  // Vẽ tất cả 7 bi (6 bi chính + 1 bi phụ)
  const allNumbers = [...mainNumbers, extraNumber];
  
  allNumbers.forEach((number, index) => {
    const x = startX + (spacing * index);
    const isExtraNumber = index === 6; // Kiểm tra có phải là số phụ không
    
    // Vẽ hình tròn
    ctx.beginPath();
    ctx.arc(x, centerY, circleRadius, 0, Math.PI * 2);
    ctx.fillStyle = isExtraNumber ? "#ffd700" : "#d32f2f"; // Màu vàng cho số phụ, đỏ cho số chính
    ctx.fill();

    // Thêm viền trắng
    ctx.strokeStyle = "#ffffff";
    ctx.lineWidth = 2;
    ctx.stroke();

    // Vẽ số với màu tương ứng
    ctx.font = "bold 32px " + FONT_MAIN;
    ctx.fillStyle = isExtraNumber ? "#000000" : "#ffffff"; // Màu đen cho số phụ, trắng cho số chính
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(number.toString(), x, centerY);
  });

  // Lưu canvas thành file ảnh
  const fileName = `vietlott655_result_${Date.now()}.png`;
  const filePath = path.resolve(`./assets/temp/${fileName}`);
  await writeFilePromise(filePath, canvas.toBuffer());

  return filePath;
}

// Thêm hàm vẽ ảnh chờ cho Vietlott
export async function createVietlott655WaitingImage(remainingSeconds, totalPlayers, totalBets, jackpotAmount) {
  const width = 600;
  const height = 300;
  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext("2d");

  // Vẽ background gradient
  const gradient = ctx.createLinearGradient(0, 0, 0, height);
  gradient.addColorStop(0, "#1a237e");
  gradient.addColorStop(1, "#0d47a1");
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, width, height);

  // Thêm hiệu ứng lấp lánh
  for (let i = 0; i < 50; i++) {
    const x = Math.random() * width;
    const y = Math.random() * height;
    const radius = Math.random() * 1.5;
    ctx.beginPath();
    ctx.arc(x, y, radius, 0, Math.PI * 2);
    ctx.fillStyle = `rgba(255, 255, 255, ${Math.random() * 0.5})`;
    ctx.fill();
  }

  // Vẽ tiêu đề
  ctx.font = "bold 40px " + FONT_MAIN;
  ctx.fillStyle = "#ffffff";
  ctx.textAlign = "center";
  ctx.fillText("VIETLOTT 6/55", width / 2, height / 5);

  // Vẽ thời gian còn lại
  const minutes = Math.floor(remainingSeconds / 60);
  const seconds = remainingSeconds % 60;
  const timeText = `${minutes}:${seconds.toString().padStart(2, "0")}`;

  ctx.font = "bold 60px " + FONT_MAIN;
  ctx.fillStyle = "#ffd700";
  ctx.fillText(timeText, width / 2, height / 2);

  // Vẽ thông tin người chơi và tổng tiền cược
  ctx.font = "bold 24px " + FONT_MAIN;
  ctx.fillStyle = "#ffffff";

  // Thêm hiệu ứng viền cho text
  const drawTextWithShadow = (text, x, y) => {
    ctx.shadowColor = "rgba(0, 0, 0, 0.5)";
    ctx.shadowBlur = 5;
    ctx.shadowOffsetX = 2;
    ctx.shadowOffsetY = 2;
    ctx.fillText(text, x, y);
    ctx.shadowColor = "transparent";
  };

  // Vẽ thông tin với khoảng cách đều nhau
  const startY = height / 2 + 50;
  const lineHeight = 35;

  drawTextWithShadow(`Số người tham gia: ${totalPlayers}`, width / 2, startY);
  drawTextWithShadow(`Tổng tiền cược: ${formatCurrency(totalBets)} VNĐ`, width / 2, startY + lineHeight);

  // Thêm dòng tiền hũ với gradient màu vàng
  const jackpotGradient = ctx.createLinearGradient(width / 4, startY + lineHeight * 2, (width * 3) / 4, startY + lineHeight * 2 + 30);
  jackpotGradient.addColorStop(0, "#FFD700");
  jackpotGradient.addColorStop(0.5, "#FFF8DC");
  jackpotGradient.addColorStop(1, "#FFD700");

  ctx.font = "bold 28px " + FONT_MAIN; // Tăng kích thước font cho dòng tiền hũ
  ctx.fillStyle = jackpotGradient;
  drawTextWithShadow(`💰 Tiền hũ: ${formatCurrency(jackpotAmount)} VNĐ`, width / 2, startY + lineHeight * 2);

  // Lưu canvas thành file ảnh
  const fileName = `vietlott655_waiting_${Date.now()}.png`;
  const filePath = path.resolve(`./assets/temp/${fileName}`);
  await writeFilePromise(filePath, canvas.toBuffer());

  return filePath;
}
