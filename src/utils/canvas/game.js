import path from "path";
import { createCanvas, loadImage } from "canvas";
import { FONT_MAIN, formatCurrency } from "../format-util.js";
import { nameServer } from "../../database/index.js";
import { writeFilePromise } from "../util.js";

export async function createTaiXiuResultImage(result, taiTotal, xiuTotal, jackpotInfo) {
  const width = 800;
  let height = 300;
  if (jackpotInfo?.isJackpot) {
    height = 360;
  }
  const widthCenter = width / 2;
  const heightCenter = height / 2;
  const leftCenter = width * 0.25;
  const rightCenter = width * 0.75;

  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext("2d");

  const gradient = ctx.createRadialGradient(widthCenter, heightCenter, 0, widthCenter, heightCenter, width / 2);
  if (jackpotInfo?.isJackpot) {
    // Gradient vàng tối hơn và sang trọng hơn
    gradient.addColorStop(0, "#B8860B"); // Vàng đậm ở tâm
    gradient.addColorStop(0.7, "#8B6914"); // Vàng nâu ở giữa
    gradient.addColorStop(1, "#654321"); // Nâu đậm ở ngoài
  } else {
    gradient.addColorStop(0, "#4c0000"); // Đỏ xậm ở tâm
    gradient.addColorStop(0.7, "#2a0000"); // Đỏ xậm đen ở giữa
    gradient.addColorStop(1, "#320202"); // Gần như đen ở ngoài
  }
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, width, height);

  // Điều chỉnh hiệu ứng ánh sáng cho jackpot
  const lightGradient = ctx.createRadialGradient(widthCenter, heightCenter, 0, widthCenter, heightCenter, width / 2);
  if (jackpotInfo?.isJackpot) {
    lightGradient.addColorStop(0, "rgba(255, 215, 0, 0.3)"); // Ánh sáng vàng
    lightGradient.addColorStop(0.5, "rgba(255, 215, 0, 0.1)");
    lightGradient.addColorStop(1, "rgba(255, 215, 0, 0.05)");
  } else {
    lightGradient.addColorStop(0, "rgba(255, 255, 255, 0.15)");
    lightGradient.addColorStop(0.5, "rgba(255, 255, 255, 0.05)");
    lightGradient.addColorStop(1, "rgba(255, 255, 255, 0)");
  }
  ctx.fillStyle = lightGradient;
  ctx.fillRect(0, 0, width, height);

  // Thêm hiệu ứng lấp lánh
  for (let i = 0; i < 70; i++) {
    const x = Math.random() * width;
    const y = Math.random() * height;
    const radius = Math.random() * 1.5;
    ctx.beginPath();
    ctx.arc(x, y, radius, 0, Math.PI * 2);
    ctx.fillStyle = `rgba(255, 255, 255, ${Math.random() * 0.7})`;
    ctx.fill();
  }

  // Vẽ dĩa tròn ở giữa
  const centerX = widthCenter;
  const centerY = heightCenter;
  const radius = 100;
  ctx.beginPath();
  ctx.arc(centerX, centerY, radius, 0, 2 * Math.PI);
  ctx.fillStyle = "rgba(255, 255, 255, 0.2)";
  ctx.fill();
  ctx.strokeStyle = "rgba(255, 255, 255, 0.5)";
  ctx.lineWidth = 3;
  ctx.stroke();

  // Kích thước xúc xắc
  const diceSize = 40;
  const minDistance = diceSize * 1.5;

  // Mảng lưu vị trí các xúc xắc
  const dicePositions = [];

  // Hàm kiểm tra xúc sắc mới có đè lên xúc sắc cũ không
  const isOverlapping = (x, y, positions) => {
    const minDistance = diceSize * 1.2; // Khoảng cách tối thiểu giữa các xúc sắc
    return positions.some((pos) => {
      const distance = Math.sqrt(Math.pow(pos.x - x, 2) + Math.pow(pos.y - y, 2));
      return distance < minDistance;
    });
  };

  // Vẽ 3 xúc xắc 3D với vị trí ngẫu nhiên không chồng lên nhau
  for (let i = 0; i < result.dice.length; i++) {
    const diceValue = result.dice[i];
    let x, y;
    let attempts = 0;
    const maxAttempts = 1000;

    do {
      const angle = Math.random() * 2 * Math.PI;
      const distance = Math.random() * (radius - diceSize);
      x = centerX + distance * Math.cos(angle);
      y = centerY + distance * Math.sin(angle);
      attempts++;
    } while (isOverlapping(x, y, dicePositions) && attempts < maxAttempts);

    dicePositions.push({ x, y });

    const imagePath = path.join(process.cwd(), "assets", "resources", "game", "taixiu", `dice_${diceValue}.png`);

    try {
      const img = await loadImage(imagePath);
      ctx.save();

      // Di chuyển gốc tọa độ đến tâm của xúc xắc
      ctx.translate(x, y);

      // Xoay ngẫu nhiên
      const rotation = Math.random() * 2 * Math.PI;
      ctx.rotate(rotation);

      // Vẽ xúc xắc
      ctx.drawImage(img, -diceSize / 2, -diceSize / 2, diceSize, diceSize);

      // Khôi phục trạng thái canvas
      ctx.restore();
    } catch (error) {
      console.error(`Không tìm thấy hình ảnh cho xúc xắc ${diceValue}`);
    }
  }

  const gradientWin = ["#FFFF00", "#FFD700", "#FFA500"];
  const gradientLose = ["#A9A9A9", "#808080", "#696969"];

  // Vẽ kết quả (Tài hoặc Xỉu)
  const resultText = result.result === "tai" ? "TÀI" : "XỈU";
  const resultGradient = result.result === "tai" ? ["#FF0000", "#EB1542", "#FF0000"] : ["#00FFFF", "#00CED1", "#00FFFF"];
  drawTextWithEffects(ctx, resultText, width / 2, centerY - radius, 35, "bold", resultGradient, "#000000", 4, "rgba(0,0,0,0.5)", 10);

  let taiTotalText = formatCurrency(taiTotal, 1000000000000);
  let xiuTotalText = formatCurrency(xiuTotal, 1000000000000);

  // Vẽ chữ "Tài" và số tiền đặt cược
  drawTextWithEffects(
    ctx,
    "Tài",
    leftCenter - radius / 2,
    centerY - 20,
    30,
    "bold",
    resultText === "TÀI" ? gradientWin : gradientLose,
    "#000000",
    3,
    "rgba(0,0,0,0.3)",
    5
  );
  drawTextWithEffects(
    ctx,
    taiTotalText,
    leftCenter - radius / 2,
    centerY + 20,
    28,
    "normal",
    resultText === "TÀI" ? gradientWin : gradientLose,
    "#000000",
    2,
    "rgba(0,0,0,0.3)",
    3
  );

  // Vẽ chữ "Xỉu" và số tiền đặt cược
  drawTextWithEffects(
    ctx,
    "Xỉu",
    rightCenter + radius / 2,
    centerY - 20,
    30,
    "bold",
    resultText === "XỈU" ? gradientWin : gradientLose,
    "#000000",
    3,
    "rgba(0,0,0,0.3)",
    5
  );
  drawTextWithEffects(
    ctx,
    xiuTotalText,
    rightCenter + radius / 2,
    centerY + 20,
    28,
    "normal",
    resultText === "XỈU" ? gradientWin : gradientLose,
    "#000000",
    2,
    "rgba(0,0,0,0.3)",
    3
  );

  const gradientPink = ["#FF69B4", "#FF1493", "#C71585"];
  // Vẽ tổng điểm
  drawTextWithEffects(
    ctx,
    result.total.toString(),
    centerX,
    centerY + radius / 2 + 45,
    30,
    "bold",
    resultGradient,
    "#000000",
    4,
    "rgba(0,0,0,0.5)",
    10
  );

  // Nếu có jackpot, vẽ thêm thông tin số tiền trúng
  if (jackpotInfo?.isJackpot) {
    // Tạo gradient cho text tiền hũ
    const textGradient = ctx.createLinearGradient(0, height - 40, 0, height);
    textGradient.addColorStop(0, "#FFD700"); // Vàng sáng
    textGradient.addColorStop(0.5, "#FFF8DC"); // Vàng nhạt
    textGradient.addColorStop(1, "#FFD700"); // Vàng sáng

    ctx.font = "bold 28px Arial";
    ctx.textAlign = "center";
    ctx.strokeStyle = "#000000";
    ctx.lineWidth = 3;
    const jackpotText = `NỔ HŨ: ${formatCurrency(jackpotInfo.jackpotAmount)} VNĐ 💰`;

    // Vẽ viền đen
    ctx.strokeText(jackpotText, width / 2, height - 20);

    // Vẽ text với gradient
    ctx.fillStyle = textGradient;
    ctx.fillText(jackpotText, width / 2, height - 20);
  }

  // Lưu canvas thành file ảnh
  const filePath = path.resolve(`./assets/temp/taixiu_result_${Date.now()}.png`);
  await writeFilePromise(filePath, canvas.toBuffer());

  return filePath;
}

export async function createWaitingImage(remainingSeconds, taiTotal, xiuTotal) {
  const width = 800;
  const height = 300;
  const widthCenter = width / 2;
  const heightCenter = height / 2;
  const leftCenter = width * 0.25;
  const rightCenter = width * 0.75;

  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext("2d");

  // Vẽ background gradient từ tâm ra ngoài
  const gradient = ctx.createRadialGradient(widthCenter, heightCenter, 0, widthCenter, heightCenter, width / 2);
  gradient.addColorStop(0, "#4c0000");
  gradient.addColorStop(0.7, "#2a0000");
  gradient.addColorStop(1, "#320202");
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, width, height);

  // Thêm hiệu ứng ánh sáng nhẹ
  const lightGradient = ctx.createRadialGradient(widthCenter, heightCenter, 0, widthCenter, heightCenter, width / 2);
  lightGradient.addColorStop(0, "rgba(255, 255, 255, 0.15)");
  lightGradient.addColorStop(0.5, "rgba(255, 255, 255, 0.05)");
  lightGradient.addColorStop(1, "rgba(255, 255, 255, 0)");
  ctx.fillStyle = lightGradient;
  ctx.fillRect(0, 0, width, height);

  // Thêm hiệu ứng lấp lánh
  for (let i = 0; i < 70; i++) {
    const x = Math.random() * width;
    const y = Math.random() * height;
    const radius = Math.random() * 1.5;
    ctx.beginPath();
    ctx.arc(x, y, radius, 0, Math.PI * 2);
    ctx.fillStyle = `rgba(255, 255, 255, ${Math.random() * 0.7})`;
    ctx.fill();
  }

  // Vẽ dĩa tròn úp ở giữa
  const centerX = widthCenter;
  const centerY = heightCenter;
  const radius = 100;
  ctx.beginPath();
  ctx.arc(centerX, centerY, radius, 0, 2 * Math.PI);
  ctx.fillStyle = "rgba(100, 100, 100, 0.7)";
  ctx.fill();
  ctx.strokeStyle = "rgba(255, 255, 255, 0.5)";
  ctx.lineWidth = 3;
  ctx.stroke();

  // Vẽ số giây còn lại
  drawTextWithEffects(
    ctx,
    remainingSeconds.toString(),
    centerX,
    centerY,
    60,
    "bold",
    ["#FFFFFF", "#DDDDDD", "#FFFFFF"],
    "#000000",
    4,
    "rgba(0,0,0,0.5)",
    10
  );

  // const gradiantTai = ["#FF1493", "#FF0000", "#8B0000"];
  const gradiantTai = ["#FF9999", "#FF6666", "#FF3333"];
  const gradiantXiu = ["#E0FFFF", "#AFEEEE", "#87CEEB"];
  const fontSize1 = 38;
  const fontSize2 = 32;

  // Vẽ chữ "Tài" và số tiền đặt cược
  let taiTotalText = formatCurrency(taiTotal, 1000000000000);
  drawTextWithEffects(
    ctx,
    "Tài",
    leftCenter - radius / 2,
    centerY - 28,
    fontSize1,
    "bold",
    gradiantTai,
    "#000000",
    3,
    "rgba(0,0,0,0.3)",
    5
  );
  drawTextWithEffects(
    ctx,
    taiTotalText,
    leftCenter - radius / 2,
    centerY + 28,
    fontSize2,
    "normal",
    gradiantTai,
    "#000000",
    2,
    "rgba(0,0,0,0.3)",
    3
  );

  // Vẽ chữ "Xỉu" và số tiền đặt cược
  let xiuTotalText = formatCurrency(xiuTotal, 1000000000000);
  drawTextWithEffects(
    ctx,
    "Xỉu",
    rightCenter + radius / 2,
    centerY - 28,
    fontSize1,
    "bold",
    gradiantXiu,
    "#000000",
    3,
    "rgba(0,0,0,0.3)",
    5
  );
  drawTextWithEffects(
    ctx,
    xiuTotalText,
    rightCenter + radius / 2,
    centerY + 28,
    fontSize2,
    "normal",
    gradiantXiu,
    "#000000",
    2,
    "rgba(0,0,0,0.3)",
    3
  );

  // Lưu canvas thành file ảnh
  const filePath = path.resolve(`./assets/temp/taixiu_waiting_${Date.now()}.png`);
  await writeFilePromise(filePath, canvas.toBuffer());

  return filePath;
}

// Hàm tạo hiệu ứng chữ nổi với viền, bóng đổ và gradient từ tâm
function drawTextWithEffects(ctx, text, x, y, fontSize, fontWeight, gradientColors, outlineColor, outlineWidth, shadowColor, shadowBlur) {
  ctx.save();
  ctx.font = `${fontWeight} ${fontSize}px 'Bebas Neue', 'Oswald', sans-serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";

  // Thêm bóng đổ
  ctx.shadowColor = shadowColor;
  ctx.shadowBlur = shadowBlur;
  ctx.shadowOffsetX = 2;
  ctx.shadowOffsetY = 2;

  // Tạo gradient cho chữ từ tâm ra hai phía
  const textWidth = ctx.measureText(text).width;
  const gradient = ctx.createLinearGradient(x - textWidth / 2, y, x + textWidth / 2, y);
  gradientColors.forEach((color, index) => {
    const stop = index / (gradientColors.length - 1);
    gradient.addColorStop(stop, color);
  });

  // Vẽ viền
  ctx.strokeStyle = outlineColor;
  ctx.lineWidth = outlineWidth;
  ctx.strokeText(text, x, y);

  // Vẽ chữ với gradient
  ctx.fillStyle = gradient;
  ctx.fillText(text, x, y);

  ctx.restore();
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
  ctx.fillText(`Thống Kê Tài/Xỉu - ${nameServer}`, width / 2, -26);

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
