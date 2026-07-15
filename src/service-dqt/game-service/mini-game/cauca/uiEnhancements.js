// uiEnhancements.js - Cau Ca Game UI
export function createProgressBar(current, max, length = 20, filledChar = '█', emptyChar = '░') {
  const percentage = Math.min(current / max, 1);
  const filledLength = Math.floor(percentage * length);
  const emptyLength = length - filledLength;
  return `${filledChar.repeat(filledLength)}${emptyChar.repeat(emptyLength)} ${Math.round(percentage * 100)}%`;
}

export function createLevelIndicator(level) {
  const stars = Math.floor(level / 10);
  const starEmoji = '⭐'.repeat(Math.min(stars, 5));
  const levelEmoji = level >= 50 ? '🌟' : level >= 30 ? '✨' : level >= 15 ? '💫' : '⭐';
  return `${levelEmoji}${starEmoji}`;
}

export function getRarityEmoji(rarity) {
  const map = { 
    common: '⚪', 
    rare: '🔵', 
    legendary: '🟡', 
    mythical: '🟣', 
    junk: '🗑️' 
  };
  return map[rarity] || '⚪';
}

export function formatNumber(num) {
  if (num >= 1e9) return `${(num / 1e9).toFixed(1)}B`;
  if (num >= 1e6) return `${(num / 1e6).toFixed(1)}M`;
  if (num >= 1e3) return `${(num / 1e3).toFixed(1)}K`;
  return num.toString();
}

export function createDivider(char = '─', length = 30) {
  return char.repeat(length);
}

export function formatPlayerInfo(player, userName, config) {
  if (!player || !userName) {
    return "❌ Dữ liệu người chơi không hợp lệ!";
  }

  const expBar = createProgressBar(player.exp || 0, player.expToNext || 100);

  let statsText = `💰 Vàng: ${formatNumber(player.money || 0)} VND\n`;
  statsText += `🎣 Cần câu: ${player.equipment?.rods?.filter(r => r)?.length || 0}/${player.activeSlots || 1} slot\n`;

  if (player.inventory?.pets && player.inventory.pets.length > 0) {
    statsText += `🐾 Pet: ${player.inventory.pets[0].name || 'Chưa có'}\n`;
  }

  statsText += `🎒 Túi đồ: ${(player.inventory?.fish && Object.keys(player.inventory.fish).length) || 0} loại cá\n`;
  statsText += `🎟️ Vé quay: ${player.inventory?.tickets || 0}\n`;

  return `THÔNG TIN NGƯỜI CHƠI
👤 Tên: ${userName || 'Unknown'}
📊 Cấp: ${player.level || 0} ${createLevelIndicator(player.level || 0)}
📈 Kinh nghiệm: ${formatNumber(player.exp || 0)} / ${formatNumber(player.expToNext || 100)}
${expBar}

${statsText}
📍 Khu vực: ${player.currentArea || 1}
💡 Gõ: cau | shop | status | stop`;
}

export function formatHelpDisplay(prefix = "!cauca") {
  return `🎣 HƯỚNG DẪN GAME CÂU CÁ

 🎣 cauca - Câu cá (mua mòi và cần trong shop)
 🔄 giatcau|reel - Giật câu hoặc kéo cá khi cắn câu
 📊 info - Xem thông tin cá nhân chi tiết
 🚢 location - Kiểm tra vị trí hiện tại
 🗾 map - Xem bản đồ câu cá
 🚢 goto [khu vực] - Di chuyển đến khu vực câu cá
 🎒 inventory|bag - Xem túi đồ cá nhân
 🔧 set [tên cần câu] [slot] - Trang bị cần câu vào slot
 🎣 use [tên mồi câu|tên item đặc biệt] - Đặt mồi câu chính | sử dụng item đặc biệt
 🔍 check @tag - Kiểm tra thông tin của người chơi được tag đầu tiên
 🎁 give [vật phẩm] [số lượng] @tag - Cho vật phẩm cho người chơi
 🏪 shop - Xem cửa hàng vật phẩm
 🛒 buy [vật phẩm] [số lượng] - Mua vật phẩm từ cửa hàng
 💰 sell [tên cá/all/common/rare/legendary] [số lượng] - Bán cá (chỉ tại bến cảng)
 🐟 fishinfo [tên cá] - Xem thông tin chi tiết về loài cá
 🎁 daily - Nhận thưởng hàng ngày (coins + vé may mắn)
 📋 quests [claim] - Xem nhiệm vụ hàng ngày/tuần | nhận thưởng nhiệm vụ
 🎰 lucky [số lần] - Quay vòng quay may mắn (x1, x10, all)
 🎁 giftcode [use|info] ... - Quản lý/nhập mã quà tặng
 🏆 bxh|rank [level|cauca|coin] - Bảng xếp hạng (mặc định: level)

💡 Mẹo: Bạn cần có vé câu để đến khu vực câu cá, cần câu và mồi câu để có thể câu cá!
 📈 Các loại cá sẽ cho bạn EXP khác nhau khi câu được.
 🏆 Khi bán cá: hiếm trở lên có tỉ lệ được thưởng vé quay, cá cực hiếm tỉ lệ thưởng cao hơn!
 🔥 Streak Bonus: Câu liên tiếp thành công tăng EXP/Coins!
 💰 Ví dụ bán: sell all (bán hết), sell rare (bán cá hiếm), sell cá rô 3 (bán 3 con)
 🔧 Ví dụ set: set cần câu tre 1 (trang bị cần câu vào slot 1)
 🎣 Ví dụ use: use mồi cơm (đặt mồi câu chính), use double exp potion (sử dụng item)`;
}

