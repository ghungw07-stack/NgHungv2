/**
 * index.js
 * Entry point cho game Zalo Commandline Warrior
 */
import chalk from "chalk";
import { initializeServices } from "./services/ServiceInitializer.js";

export const gameTypeZaclWarrior = "Zalo Commandline Warrior";

// Khởi tạo tất cả services
// const registry = initializeServices(gameTypeZaclWarrior);

/**
 * Lấy service từ registry
 * @param {string} serviceName - Tên của service
 * @returns {Object} - Service instance
 */
// export function getService(serviceName) {
//   return registry.getService(serviceName);
// }

/**
 * Xử lý tin nhắn từ người chơi trong game Zacl Warrior
 * @param {Object} api - API đối tượng
 * @param {Object} message - Thông tin tin nhắn
 * @returns {boolean} Kết quả xử lý tin nhắn
 */
export async function handleGameZaclWarriorMessage(api, message) {
  // /** @type {import('./services/GameService.js').GameService} */
  // const gameService = getService("GameService");
  // return await gameService.handleMessage(api, message);
}

/**
 * Xử lý lệnh từ người dùng
 * @param {Object} api - API object
 * @param {Object} message - Message object
 * @param {string} aliasCommand - Alias command
 * @param {Object} groupSettings - Group settings
 */
export async function handleZaclWarriorCommand(api, message, aliasCommand, groupSettings) {
  // /** @type {import('./services/GameService.js').GameService} */
  // const gameService = getService("GameService");
  // await gameService.handleZaclWarriorCommand(api, message, aliasCommand);
}

/**
 * Khởi tạo game Zacl Warrior
 */
// await (async () => {
//   console.log(chalk.yellow(`[${gameTypeZaclWarrior}] Đang khởi tạo game...`));

//   try {
//     const gameService = getService("GameService");
//     const success = await gameService.initialize();

//     if (success) {
//       console.log(chalk.greenBright(`[${gameTypeZaclWarrior}] Khởi tạo game thành công!`));
//     } else {
//       console.error(chalk.redBright(`[${gameTypeZaclWarrior}] Khởi tạo game thất bại!`));
//     }
//   } catch (error) {
//     console.error(chalk.redBright(`[${gameTypeZaclWarrior}] Lỗi khi khởi tạo game:`, error));
//   }
// })();
