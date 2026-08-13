import schedule from "node-schedule";
import chalk from "chalk";
import { initializeGameTaiXiu } from "./tai-xiu/tai-xiu.js";
import { initializeGameVietlott655 } from "./vietlott/vietlott655.js";
import { initializeGameXiDach } from "./xi-dach/xi-dach.js";
import { DATA_GAME_FILE_PATH } from "../../utils/io-json.js";
import { readFilePromise, writeFileSync } from "../../utils/util.js";

// Biến quản lý data game toàn cục
export const gameState = {
  data: {
    taixiu: {
      players: {},
      activeThreads: [],
      history: [],
      jackpot: "1000000",
    },
    chanle: {
      jackpot: "1000000",
      history: [],
    },
    baucua: {
      jackpot: "1000000",
      history: [],
    },
    vietlott655: {
      players: {},
      activeThreads: [],
      jackpot: "1000000",
      history: [],
    },
    xidach: {},
  },
  changes: {
    taixiu: false,
    chanle: false,
    baucua: false,
    vietlott655: false,
    xidach: false,
  },
};

// Hàm đọc data từ file
async function loadGameData() {
  try {
    const data = JSON.parse(await readFilePromise(DATA_GAME_FILE_PATH));
    gameState.data = data;
    console.log(chalk.magentaBright("Đã nạp dữ liệu game từ file thành công"));
  } catch (error) {
    console.error("Lỗi khi đọc file data game:", error);
  }
}

// Hàm lưu data vào file
function saveGameData() {
  try {
    writeFileSync(DATA_GAME_FILE_PATH, JSON.stringify(gameState.data, null, 2));
  } catch (error) {
    console.error("Lỗi khi ghi file data game:", error);
  }
}

// Dùng cho các lệnh quản trị cần đảm bảo dữ liệu đã nằm trên đĩa
// trước khi báo thao tác thành công.
export function saveGameDataNow() {
  saveGameData();
  Object.keys(gameState.changes).forEach((key) => {
    gameState.changes[key] = false;
  });
}

// Hàm kiểm tra và lưu thay đổi
async function checkAndSaveChanges() {
  const hasChanges = Object.values(gameState.changes).some((change) => change);

  if (hasChanges) {
    saveGameData();
    Object.keys(gameState.changes).forEach((key) => {
      gameState.changes[key] = false;
    });
  }
}

await loadGameData();
schedule.scheduleJob("*/5 * * * * *", async () => {
  await checkAndSaveChanges();
});

// Khởi tạo service
export async function initializeGameDataManager(api) {
  await Promise.all([initializeGameTaiXiu(api), initializeGameVietlott655(api), initializeGameXiDach(api)]);
  console.log(chalk.magentaBright("Khởi động service quản lý data game hoàn tất"));
}
