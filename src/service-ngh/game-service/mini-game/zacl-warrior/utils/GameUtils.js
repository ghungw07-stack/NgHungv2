/**
 * GameUtils.js
 * Các hàm tiện ích dùng chung trong game
 */

/**
 * Tạo ID ngẫu nhiên
 * @param {number} length - Độ dài của ID
 * @returns {string} - ID ngẫu nhiên
 */
export function generateId(length = 8) {
  const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
  let result = '';
  for (let i = 0; i < length; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

/**
 * Tạo số ngẫu nhiên trong khoảng
 * @param {number} min - Giá trị nhỏ nhất
 * @param {number} max - Giá trị lớn nhất
 * @returns {number} - Số ngẫu nhiên
 */
export function randomInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

/**
 * Tính xác suất
 * @param {number} chance - Xác suất (0-100)
 * @returns {boolean} - Kết quả
 */
export function rollChance(chance) {
  return Math.random() * 100 <= chance;
}

/**
 * Chọn một phần tử ngẫu nhiên từ mảng
 * @param {Array} array - Mảng cần chọn
 * @returns {*} - Phần tử được chọn
 */
export function randomElement(array) {
  if (!array || array.length === 0) return null;
  return array[Math.floor(Math.random() * array.length)];
}

/**
 * Chọn phần tử theo trọng số
 * @param {Array<{item: *, weight: number}>} weightedItems - Mảng các phần tử có trọng số
 * @returns {*} - Phần tử được chọn
 */
export function weightedRandom(weightedItems) {
  if (!weightedItems || weightedItems.length === 0) return null;
  
  const totalWeight = weightedItems.reduce((sum, item) => sum + (item.weight || 1), 0);
  let random = Math.random() * totalWeight;
  
  for (const weightedItem of weightedItems) {
    random -= (weightedItem.weight || 1);
    if (random <= 0) {
      return weightedItem.item;
    }
  }
  
  return weightedItems[0].item;
}

/**
 * Format số thành dạng rút gọn
 * @param {number} num - Số cần format
 * @returns {string} - Chuỗi đã format
 */
export function formatNumber(num) {
  if (num === null || num === undefined) return '0';
  
  if (num >= 1000000000) {
    return (num / 1000000000).toFixed(1) + 'B';
  }
  if (num >= 1000000) {
    return (num / 1000000).toFixed(1) + 'M';
  }
  if (num >= 1000) {
    return (num / 1000).toFixed(1) + 'K';
  }
  return num.toString();
}

/**
 * Lấy thời gian hiện tại dưới dạng chuỗi
 * @returns {string} - Chuỗi thời gian
 */
export function getCurrentTimeString() {
  const now = new Date();
  return now.toLocaleTimeString('vi-VN');
}

/**
 * Tạo chuỗi tiến độ
 * @param {number} current - Giá trị hiện tại
 * @param {number} max - Giá trị tối đa
 * @param {number} length - Độ dài của thanh tiến độ
 * @param {string} fillChar - Ký tự điền vào phần hoàn thành
 * @param {string} emptyChar - Ký tự điền vào phần chưa hoàn thành
 * @returns {string} - Chuỗi tiến độ
 */
export function createProgressBar(current, max, length = 10, fillChar = '■', emptyChar = '□') {
  if (max <= 0) max = 1;
  if (current > max) current = max;
  if (current < 0) current = 0;
  
  const progress = Math.floor((current / max) * length);
  let progressBar = '';
  
  for (let i = 0; i < length; i++) {
    progressBar += i < progress ? fillChar : emptyChar;
  }
  
  return progressBar;
}

/**
 * Format thời gian còn lại
 * @param {number} ms - Thời gian còn lại (ms)
 * @returns {string} - Chuỗi thời gian
 */
export function formatTimeLeft(ms) {
  if (ms <= 0) return 'Đã hoàn thành';
  
  const seconds = Math.floor(ms / 1000) % 60;
  const minutes = Math.floor(ms / (1000 * 60)) % 60;
  const hours = Math.floor(ms / (1000 * 60 * 60));
  
  if (hours > 0) {
    return `${hours}h ${minutes}m ${seconds}s`;
  }
  if (minutes > 0) {
    return `${minutes}m ${seconds}s`;
  }
  return `${seconds}s`;
}

/**
 * Làm tròn số với số chữ số phần thập phân
 * @param {number} num - Số cần làm tròn
 * @param {number} decimal - Số chữ số phần thập phân
 * @returns {number} - Số đã làm tròn
 */
export function roundNumber(num, decimal = 2) {
  const factor = Math.pow(10, decimal);
  return Math.round(num * factor) / factor;
}

/**
 * Tính hiệu quả của chỉ số theo đường cong logarit
 * @param {number} stat - Giá trị chỉ số
 * @param {number} base - Hệ số cơ sở
 * @param {number} cap - Giới hạn trên
 * @returns {number} - Hiệu quả của chỉ số
 */
export function calculateStatEffectiveness(stat, base = 10, cap = 100) {
  if (stat <= 0) return 0;
  const effectiveness = Math.log(stat + 1) / Math.log(base) * cap;
  return Math.min(effectiveness, cap);
}

/**
 * Kiểm tra xem người chơi có thể tấn công quái vật không dựa trên cấp độ
 * @param {number} playerLevel - Cấp độ người chơi
 * @param {number} monsterLevel - Cấp độ quái vật
 * @param {number} maxDifference - Chênh lệch cấp độ tối đa
 * @returns {boolean} - Kết quả kiểm tra
 */
export function canAttackByLevel(playerLevel, monsterLevel, maxDifference = 5) {
  return playerLevel >= monsterLevel - maxDifference;
}

/**
 * Tính sát thương dựa trên chỉ số
 * @param {Object} attacker - Đối tượng tấn công
 * @param {Object} defender - Đối tượng phòng thủ
 * @param {Object} options - Tùy chọn tính toán
 * @returns {Object} - Kết quả tính toán
 */
export function calculateDamage(attacker, defender, options = {}) {
  const {
    isCritical = rollChance(attacker.critRate || 5),
    isSkill = false,
    skillMultiplier = 1,
    damageType = 'physical', // physical, magical
  } = options;
  
  // Tính sát thương cơ bản
  let baseDamage;
  let attackStat;
  let defenseStat;
  
  if (damageType === 'physical') {
    attackStat = attacker.attack || 10;
    defenseStat = defender.defense || 5;
    baseDamage = Math.max(1, attackStat - defenseStat * 0.5);
  } else {
    attackStat = attacker.intelligence || attacker.magicAttack || 10;
    defenseStat = defender.magicDefense || defender.defense * 0.7 || 5;
    baseDamage = Math.max(1, attackStat - defenseStat * 0.4);
  }
  
  // Áp dụng biến động ngẫu nhiên (±15%)
  const randomFactor = 0.85 + Math.random() * 0.3;
  baseDamage *= randomFactor;
  
  // Áp dụng nhân tố kỹ năng
  if (isSkill) {
    baseDamage *= skillMultiplier;
  }
  
  // Áp dụng chí mạng
  let criticalMultiplier = 1;
  if (isCritical) {
    criticalMultiplier = (attacker.critDmg || 150) / 100;
    baseDamage *= criticalMultiplier;
  }
  
  // Làm tròn sát thương
  const finalDamage = Math.round(baseDamage);
  
  return {
    damage: finalDamage,
    isCritical,
    attackStat,
    defenseStat,
    damageType,
  };
}

/**
 * Kiểm tra xem có né tránh thành công không
 * @param {Object} attacker - Đối tượng tấn công
 * @param {Object} defender - Đối tượng phòng thủ
 * @returns {boolean} - Kết quả né tránh
 */
export function checkDodge(attacker, defender) {
  const attackerAccuracy = attacker.accuracy || 10;
  const defenderDodge = defender.dodge || 3;
  
  // Công thức: Tỉ lệ né = dodge * 3 / (dodge * 3 + accuracy)
  const dodgeChance = (defenderDodge * 3) / (defenderDodge * 3 + attackerAccuracy) * 100;
  
  // Giới hạn tỉ lệ né tối đa 75%
  const cappedDodgeChance = Math.min(dodgeChance, 75);
  
  return rollChance(cappedDodgeChance);
}

/**
 * Kiểm tra xem có chạy trốn thành công không
 * @param {Object} runner - Đối tượng chạy trốn
 * @param {Object} chaser - Đối tượng đuổi theo
 * @returns {boolean} - Kết quả chạy trốn
 */
export function checkEscape(runner, chaser) {
  const runnerSpeed = runner.speed || 10;
  const chaserSpeed = chaser.speed || 10;
  
  // Công thức: Tỉ lệ chạy trốn = runnerSpeed * 2 / (runnerSpeed * 2 + chaserSpeed) * 100
  const escapeChance = (runnerSpeed * 2) / (runnerSpeed * 2 + chaserSpeed) * 100;
  
  // Giới hạn tỉ lệ chạy trốn tối thiểu 10% và tối đa 90%
  const cappedEscapeChance = Math.min(Math.max(escapeChance, 10), 90);
  
  return rollChance(cappedEscapeChance);
}

/**
 * Lấy tên của nội tại trang bị
 * @param {string} traitId - ID của nội tại
 * @returns {string} - Tên hiển thị của nội tại
 */
export function getHiddenTraitName(traitId) {
  const traitNames = {
    // Nội tại tăng sát thương
    damage_boost_small: "Sát Thương Nhỏ",
    damage_boost_medium: "Sát Thương Vừa",
    damage_boost_large: "Sát Thương Lớn",
    
    // Nội tại tăng phòng thủ
    defense_boost_small: "Phòng Thủ Nhỏ",
    defense_boost_medium: "Phòng Thủ Vừa",
    defense_boost_large: "Phòng Thủ Lớn",
    
    // Nội tại tăng chí mạng
    crit_rate_boost_small: "Chí Mạng Nhỏ",
    crit_rate_boost_medium: "Chí Mạng Vừa",
    crit_rate_boost_large: "Chí Mạng Lớn",
    
    // Nội tại tăng sát thương chí mạng
    crit_dmg_boost_small: "ST Chí Mạng Nhỏ",
    crit_dmg_boost_medium: "ST Chí Mạng Vừa",
    crit_dmg_boost_large: "ST Chí Mạng Lớn",
    
    // Nội tại hút máu
    lifesteal_small: "Hút Máu Nhỏ",
    lifesteal_medium: "Hút Máu Vừa",
    lifesteal_large: "Hút Máu Lớn",
    
    // Nội tại phản đòn
    counter_small: "Phản Đòn Nhỏ",
    counter_medium: "Phản Đòn Vừa",
    counter_large: "Phản Đòn Lớn",
    
    // Nội tại né tránh
    dodge_small: "Né Tránh Nhỏ",
    dodge_medium: "Né Tránh Vừa",
    dodge_large: "Né Tránh Lớn",
    
    // Nội tại hồi máu
    hp_regen_small: "Hồi Máu Nhỏ",
    hp_regen_medium: "Hồi Máu Vừa",
    hp_regen_large: "Hồi Máu Lớn",
    
    // Nội tại hồi năng lượng
    mp_regen_small: "Hồi Năng Lượng Nhỏ",
    mp_regen_medium: "Hồi Năng Lượng Vừa",
    mp_regen_large: "Hồi Năng Lượng Lớn",
    
    // Nội tại tốc độ
    speed_boost_small: "Tốc Độ Nhỏ",
    speed_boost_medium: "Tốc Độ Vừa",
    speed_boost_large: "Tốc Độ Lớn",
    
    // Nội tại đặc biệt
    element_master: "Thông Thạo Nguyên Tố",
    berserker: "Cuồng Nộ",
    vampire: "Ma Cà Rồng",
    guardian: "Hộ Vệ",
    assassin: "Sát Thủ",
    mage_master: "Thông Thạo Phép Thuật",
    warrior_master: "Thông Thạo Chiến Đấu"
  };
  
  return traitNames[traitId] || "Nội Tại Bí Ẩn";
}

export function getCategoryName(category) {
  const categoryNames = {
    weapon: "⚔️ VŨ KHÍ",
    armor: "🛡️ GIÁP",
    accessory: "💍 PHỤ KIỆN",
    consumable: "🧪 TIÊU HAO",
    material: "📦 NGUYÊN LIỆU",
    misc: "🧰 VẬT PHẨM SỬ DỤNG",
    helmet: "🧢 MŨ",
    boots: "👢 GIÀY",
    cape: "🦸 ÁO CHOÀNG",
    potion: "🧪 THUỐC",
    scroll: "📜 CUỘN GIẤY"
  };
  return categoryNames[category] || category;
}

export default {
  generateId,
  randomInt,
  rollChance,
  randomElement,
  weightedRandom,
  formatNumber,
  getCurrentTimeString,
  createProgressBar,
  formatTimeLeft,
  roundNumber,
  calculateStatEffectiveness,
  canAttackByLevel,
  calculateDamage,
  checkDodge,
  checkEscape,
  getHiddenTraitName,
}; 