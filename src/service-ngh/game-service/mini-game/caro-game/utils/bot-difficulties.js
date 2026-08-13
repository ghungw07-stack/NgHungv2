import { capitalizeEachWord } from "../../../../../utils/format-util.js";

// Bot difficulty levels với cấu hình chi tiết
const BOT_DIFFICULTIES = {
  dễ: {
    level: 1,
    winPoints: 80,
    losePoints: -40,
    description: "Độ khó cơ bản, nhiều sơ hở cho người chơi làm quen",
  },
  thường: {
    level: 2,
    winPoints: 200,
    losePoints: -100,
    description: "Độ khó trung bình, thích hợp với người chơi muốn tập triển khai tấn công",
  },
  khó: {
    level: 3,
    winPoints: 1000,
    losePoints: -150,
    description: "Độ khó cao, tư duy tấn công đa điểm, thích hợp với người có kinh nghiệm và giỏi phòng thủ phản công",
  },
  "thách đấu": {
    level: 4,
    winPoints: 3000,
    losePoints: -300,
    description: "Độ khó cực cao, tương đương cấp độ tuyển thủ top cơ bản",
  },
};

/**
 * Trả về danh sách các cấu hình độ khó của bot
 * @returns {Object} - Danh sách độ khó của bot
 */
export function getBotDifficulties() {
  return BOT_DIFFICULTIES;
}

/**
 * Trả về cấu hình cho một độ khó cụ thể
 * @param {string} difficulty - Tên độ khó
 * @returns {Object|null} - Cấu hình độ khó hoặc null nếu không tồn tại
 */
export function getDifficultyConfig(difficulty) {
  return BOT_DIFFICULTIES[difficulty] || null;
}

/**
 * Kiểm tra xem một độ khó có tồn tại không
 * @param {string} difficulty - Tên độ khó cần kiểm tra
 * @returns {boolean} - true nếu độ khó tồn tại, false nếu không
 */
export function isDifficultyValid(difficulty) {
  return !!BOT_DIFFICULTIES[difficulty];
}

/**
 * Lấy danh sách tên các độ khó có sẵn
 * @returns {string[]} - Mảng tên các độ khó
 */
export function getAvailableDifficulties() {
  return Object.keys(BOT_DIFFICULTIES);
}

/**
 * Lấy thông tin hiển thị về các độ khó
 * @returns {string} - Chuỗi mô tả các độ khó cho người dùng
 */
export function getBotDifficultiesInfo() {
  return Object.entries(BOT_DIFFICULTIES)
    .map(
      ([name, info]) =>
        `📊 ${capitalizeEachWord(name)}: ${info.description} (+${info.winPoints}/${info.losePoints} điểm)`
    )
    .join("\n");
}
