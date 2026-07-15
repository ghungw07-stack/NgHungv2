/**
 * commandBridge.js
 * -----------------------------------------------------------------------------
 * C?u n?i gi?a h? th?ng switch-case cu (command.js) và auto-loader m?i.
 *
 * CÁCH TÍCH H?P VÀO command.js:
 * ------------------------------
 *  1. Import ? d?u file command.js:
 *       import { initBridge, tryDispatch } from "./commandBridge.js";
 *
 *  2. G?i initBridge() m?t l?n khi bot kh?i d?ng (trong createBot ho?c index.js):
 *       await initBridge();
 *
 *  3. Trong handleCommand / handleCommandPrivate, ? cu?i default: c?a switch,
 *     TRU?C khi g?i checkNotFindCommand, thêm:
 *
 *       // Th? auto-loader tru?c khi báo "không tìm th?y l?nh"
 *       const handled = await tryDispatch(command, api, message, aliasCommand, groupSettings);
 *       if (handled) break;
 *
 *       // Sau dó m?i d?n:
 *       if (numHandleCommand === 99 && ...) {
 *         await checkNotFindCommand(...);
 *       }
 *
 * -----------------------------------------------------------------------------
 * Khi tích h?p xong, ch? c?n th? file .js vào thu m?c
 *   src/commands/modules/
 * là l?nh t? du?c dang ký — không c?n s?a command.js n?a.
 * -----------------------------------------------------------------------------
 */

import path from "path";
import { fileURLToPath } from "url";
import {
  loadCommands,
  dispatchCommand,
  syncCommandConfig,
  getCommandList,
} from "./commandLoader.js";
import { readCommandConfig, writeCommandConfig } from "../utils/io-json.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Thu m?c ch?a các module l?nh m?i
const MODULES_DIR = path.join(__dirname, "modules");

let _initialized = false;

/**
 * G?i m?t l?n khi bot kh?i d?ng.
 * Load t?t c? l?nh trong thu m?c modules/ và sync vào command.json.
 */
export async function initBridge() {
  if (_initialized) return;
  await loadCommands(MODULES_DIR);
  syncCommandConfig(readCommandConfig, writeCommandConfig);
  _initialized = true;
  console.log(
    `[commandBridge] Ðã kh?i t?o. L?nh module: ${getCommandList().length}`
  );
}

/**
 * Reload t?t c? l?nh (dùng khi mu?n hot-reload không c?n restart bot).
 */
export async function reloadBridge() {
  await loadCommands(MODULES_DIR, true);
  syncCommandConfig(readCommandConfig, writeCommandConfig);
  console.log(
    `[commandBridge] Ðã reload. L?nh module: ${getCommandList().length}`
  );
}

/**
 * Th? dispatch l?nh qua auto-loader.
 * @returns {boolean} true n?u dã x? lý
 */
export async function tryDispatch(commandName, api, message, alias, groupSettings) {
  return dispatchCommand(commandName, api, message, alias, groupSettings);
}

/**
 * L?y danh sách config t?t c? l?nh dã load qua module (dùng cho help/menu).
 */
export { getCommandList as getModuleCommandList };