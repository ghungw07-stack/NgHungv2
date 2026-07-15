import { loadPlayerData, savePlayerData } from "./dataManager.js";

// 🎁 Cấu hình cơ bản
const baseRewardVND = 15000;  //  VND
const baseRewardEXP = 500;   //  EXP
const growthRate = 0.1;      // Tăng 10% mỗi ngày

// 📊 Hàm xem thông tin điểm danh
export function getDailyInfo(player, prefix = "cauca") {
  const today = new Date().toISOString().split("T")[0];
  const streak = player.daily?.streak || 0;

  const rewardVND = Math.floor(baseRewardVND * Math.pow(1 + growthRate, streak));
  const rewardEXP = Math.floor(baseRewardEXP * Math.pow(1 + growthRate, streak));

  let message = `📊 THÔNG TIN ĐIỂM DANH HÔM NAY 📆\n\n`;
  message += `📆 Ngày hôm nay: ${today}\n`;
  message += `🔥 Chuỗi điểm danh: ${streak} ngày\n`;
  message += `💰 Phần thưởng hôm nay: ${rewardVND.toLocaleString('en-US')} VND\n⭐ EXP: ${rewardEXP.toLocaleString('en-US')}\n\n`;

  if (player.daily?.lastCheckIn === today) {
    message += `✅ Bạn đã điểm danh hôm nay rồi!`;
  } else {
    message += `📌 Bạn CHƯA điểm danh hôm nay.\nGõ ${prefix} daily get để nhận thưởng.`;
  }

  return message;
}

// 🎁 Hàm nhận thưởng điểm danh
export function claimDailyReward(player) {
  const today = new Date().toISOString().split("T")[0];
  const yesterday = new Date(Date.now() - 86400000).toISOString().split("T")[0];

  if (!player.daily) {
    player.daily = { streak: 0, lastCheckIn: null };
  }

  if (player.daily.lastCheckIn === today) {
    return `✅ Bạn đã điểm danh hôm nay rồi!\n📆 Chuỗi hiện tại: ${player.daily.streak} ngày.`;
  }

  if (player.daily.lastCheckIn === yesterday) {
    player.daily.streak++;
  } else {
    player.daily.streak = 1;
  }

  player.daily.lastCheckIn = today;

  const rewardVND = Math.floor(baseRewardVND * Math.pow(1 + growthRate, player.daily.streak - 1));
  const rewardEXP = Math.floor(baseRewardEXP * Math.pow(1 + growthRate, player.daily.streak - 1));

  player.money += rewardVND;
  player.exp += rewardEXP;

  // ✅ Lưu dữ liệu 
  const allPlayers = loadPlayerData();
  allPlayers[player.userId] = player;
  savePlayerData(allPlayers);

  let message = `🎉 Điểm danh thành công! 📆\n`;
  message += `🔥 Ngày thứ: ${player.daily.streak}\n`;
  message += `💰 Nhận: ${rewardVND.toLocaleString('en-US')} VND\n⭐ Nhận: ${rewardEXP.toLocaleString('en-US')} EXP\n\n`;
  message += `📅 Tiếp tục điểm danh mỗi ngày để không mất chuỗi và tăng thưởng 10%!`;

  return message;
}
