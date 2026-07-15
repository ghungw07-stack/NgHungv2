import { createCanvas, loadImage } from "canvas";
import path from "path";
import { writeFile } from "fs/promises";
import { tempDir } from "../../../../../utils/io-json.js";
import { FONT_MAIN } from "../../../../../utils/format-util.js";

// Hàm vẽ bảng xếp hạng Caro
export async function renderCaroRankBoard(rankData, currentUserId = null, fullRankList = null) {
  // Kiểm tra xem có cần hiển thị phần tử thứ 11 không
  const needExtraRow = currentUserId && fullRankList && !rankData.find(user => user.UID === currentUserId);
  const canvasHeight = needExtraRow ? 650 : 600; // Tăng chiều cao nếu cần
  const canvasWidth = 800;
  
  const canvas = createCanvas(canvasWidth, canvasHeight);
  const ctx = canvas.getContext("2d");

  // Thiết lập background gradient
  const gradient = ctx.createLinearGradient(0, 0, 0, canvasHeight);
  gradient.addColorStop(0, "#1a1a2e");
  gradient.addColorStop(1, "#16213e");
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, canvasWidth, canvasHeight);

  // Vẽ tiêu đề
  ctx.fillStyle = "#ffffff";
  ctx.font = "bold 32px " + FONT_MAIN;
  ctx.textAlign = "center";
  ctx.fillText("🏆 BẢNG XẾP HẠNG CARO", 400, 50);

  // Vẽ subtitle
  ctx.font = "16px " + FONT_MAIN;
  ctx.fillStyle = "#cccccc";
  ctx.fillText("Top 10 Cao Thủ", 400, 80);

  // Vẽ khung bảng
  ctx.strokeStyle = "#4a90e2";
  ctx.lineWidth = 3;
  const tableHeight = needExtraRow ? 450 : 400; // Tăng chiều cao bảng nếu cần
  ctx.strokeRect(50, 100, canvasWidth - 100, tableHeight);

  // Vẽ header của bảng
  ctx.fillStyle = "#4a90e2";
  ctx.fillRect(50, 100, canvasWidth - 100, 40);

  ctx.fillStyle = "#ffffff";
  ctx.font = "bold 16px " + FONT_MAIN;
  ctx.textAlign = "left";
  ctx.fillText("Hạng", 70, 125);
  ctx.fillText("Tên", 150, 125);
  ctx.fillText("Điểm", 350, 125);
  ctx.fillText("Thống kê", 450, 125);

  // Vẽ từng hàng người chơi (top 10)
  rankData.forEach((user, index) => {
    const y = 150 + index * 40;

    // Xác định màu sắc theo hạng
    let rankColor, textColor;
    if (index < 3) {
      // Top 3 - màu vàng gold
      rankColor = "#ffd700";
      textColor = "#000000";
    } else if (index < 6) {
      // Hạng 4-6 - màu bạc
      rankColor = "#c0c0c0";
      textColor = "#000000";
    } else if (index < 10) {
      // Hạng 7-10 - màu đồng
      rankColor = "#cd7f32";
      textColor = "#ffffff";
    } else {
      // Các hạng khác
      rankColor = "#2c3e50";
      textColor = "#ffffff";
    }

    // Vẽ background cho hàng
    ctx.fillStyle = rankColor;
    ctx.fillRect(50, y, canvasWidth - 100, 35);

    // Vẽ viền
    ctx.strokeStyle = "#34495e";
    ctx.lineWidth = 1;
    ctx.strokeRect(50, y, canvasWidth - 100, 35);

    // Vẽ thông tin người chơi
    ctx.fillStyle = textColor;
    ctx.font = "bold 14px " + FONT_MAIN;

    // Hạng
    ctx.textAlign = "center";
    ctx.fillText(`#${index + 1}`, 100, y + 22);

    // Tên người chơi
    ctx.textAlign = "left";
    const name = user.UserName.length > 15 ? user.UserName.substring(0, 15) + "..." : user.UserName;
    ctx.fillText(name, 150, y + 22);

    // Điểm
    ctx.textAlign = "center";
    ctx.fillText(user.Rank.toLocaleString(), 368, y + 22);

    // Thống kê
    const inventory = user.inventory || {};
    const stats = {
      D: (inventory.D || 0) + "/" + (inventory.DL || 0),
      T: (inventory.T || 0) + "/" + (inventory.TL || 0),
      K: (inventory.K || 0) + "/" + (inventory.KL || 0),
      TD: (inventory.TD || 0) + "/" + (inventory.TDL || 0),
      SL: (inventory.SL || 0) + "/" + (inventory.SLT || 0),
    };

    ctx.font = "12px " + FONT_MAIN;
    ctx.textAlign = "left";
    ctx.fillText(`D:${stats.D} T:${stats.T}`, 450, y + 15);
    ctx.fillText(`K:${stats.K} TD:${stats.TD} SL:${stats.SL}`, 450, y + 28);

    // Vẽ icon cho top 3
    if (index < 3) {
      const icons = ["🥇", "🥈", "🥉"];
      ctx.font = "20px " + FONT_MAIN;
      ctx.fillText(icons[index], 650, y + 22);
    }
  });

  // Vẽ thông tin người dùng hiện tại nếu không có trong top 10
  if (currentUserId && fullRankList) {
    const currentUser = rankData.find((user) => user.UID === currentUserId);
    if (!currentUser) {
      // Tìm người dùng trong toàn bộ danh sách
      const userInFullList = fullRankList.find((user) => user.UID === currentUserId);
      if (userInFullList) {
        const userRank = fullRankList.findIndex((user) => user.UID === currentUserId) + 1;
        const y = 150 + 10 * 40; // Vị trí hàng thứ 11

        // Vẽ background cho hàng người dùng hiện tại
        ctx.fillStyle = "#34495e";
        ctx.fillRect(50, y, canvasWidth - 100, 35);

        // Vẽ viền đặc biệt
        ctx.strokeStyle = "#e74c3c";
        ctx.lineWidth = 2;
        ctx.strokeRect(50, y, canvasWidth - 100, 35);

        // Vẽ thông tin người dùng
        ctx.fillStyle = "#ffffff";
        ctx.font = "bold 14px " + FONT_MAIN;

        // Hạng thực tế
        ctx.textAlign = "center";
        ctx.fillText(`#${userRank}`, 100, y + 22);

        // Tên người chơi
        ctx.textAlign = "left";
        ctx.fillText(userInFullList.UserName.substring(0, 15), 150, y + 22);

        // Điểm
        ctx.textAlign = "center";
        ctx.fillText(userInFullList.Rank.toLocaleString(), 368, y + 22);

        // Thống kê
        const inventory = userInFullList.inventory || {};
        const stats = {
          D: (inventory.D || 0) + "/" + (inventory.DL || 0),
          T: (inventory.T || 0) + "/" + (inventory.TL || 0),
          K: (inventory.K || 0) + "/" + (inventory.KL || 0),
          TD: (inventory.TD || 0) + "/" + (inventory.TDL || 0),
          SL: (inventory.SL || 0) + "/" + (inventory.SLT || 0),
        };

        ctx.font = "12px " + FONT_MAIN;
        ctx.textAlign = "left";
        ctx.fillText(`D:${stats.D} T:${stats.T}`, 450, y + 15);
        ctx.fillText(`K:${stats.K} TD:${stats.TD} SL:${stats.SL}`, 450, y + 28);

        // Icon đặc biệt
        ctx.font = "20px " + FONT_MAIN;
        ctx.fillText("👤", 650, y + 22);
      }
    }
  }

  // Vẽ thông tin người dùng hiện tại
  let userRankInfo = "";
  if (currentUserId && fullRankList) {
    const currentUser = fullRankList.find((user) => user.UID === currentUserId);
    if (currentUser) {
      const userIndex = fullRankList.findIndex((user) => user.UID === currentUserId);
      userRankInfo = `Bạn đang xếp hạng #${userIndex + 1} với ${currentUser.Rank.toLocaleString()} điểm Rank`;
    } else {
      userRankInfo = "Bạn chưa có thông tin trong bảng xếp hạng";
    }
  } else {
    userRankInfo = "Bạn chưa có thông tin trong bảng xếp hạng";
  }

  // Vẽ thông tin người dùng
  ctx.fillStyle = "#ffffff";
  ctx.font = "bold 16px " + FONT_MAIN;
  ctx.textAlign = "center";
  const captionY = canvasHeight - 30; // Điều chỉnh vị trí caption
  ctx.fillText(userRankInfo, 400, captionY);

  // Vẽ chú thích
  ctx.font = "12px " + FONT_MAIN;
  ctx.fillStyle = "#cccccc";
  const legendY = canvasHeight - 12; // Điều chỉnh vị trí chú thích
  ctx.fillText("D:Dễ | T:Thường | K:Khó | TD:Thách đấu | SL:Solo", canvasWidth / 2, legendY);

  // Lưu canvas thành file ảnh trong thư mục temp
  const filePath = path.join(tempDir, `caro_rank_${Date.now()}.png`);
  await writeFile(filePath, canvas.toBuffer("image/png"));

  return filePath;
}
