import Big from "big.js";
import { getCurrentPrivateGameServer, getPrivateGameServer, getPrivateGameServerForApi } from "./private-game-server.js";

export const DEFAULT_JACKPOT = "0"; // Khởi tạo hũ về 0 VNĐ

/**
 * Lấy khóa phân vùng hũ:
 * - Nếu bot thuộc server riêng (như bot Hâm Và Cute) thì dùng hũ server riêng (ví dụ "hun-7557227884309571581").
 * - Mọi bot thông thường còn lại đều dùng chung một hũ "global".
 */
export function getGameJackpotKey(api, botId = null) {
  const currentPrivate = getCurrentPrivateGameServer();
  if (currentPrivate?.serverId) return String(currentPrivate.serverId);

  if (api) {
    const apiPrivate = getPrivateGameServerForApi(api);
    if (apiPrivate?.serverId) return String(apiPrivate.serverId);
  }

  const id = botId || api?.getBotId?.();
  if (id) {
    const serverFromBot = getPrivateGameServer(id);
    if (serverFromBot?.serverId) return String(serverFromBot.serverId);
  }

  return "global";
}

/**
 * Lấy giá trị hũ hiện tại theo gameName và key (global hoặc serverId riêng).
 */
export function getGameJackpot(gameState, gameName, key = "global") {
  if (!gameState?.data) return new Big(DEFAULT_JACKPOT);
  if (!gameState.data[gameName]) gameState.data[gameName] = {};
  if (!gameState.data[gameName].jackpots || typeof gameState.data[gameName].jackpots !== "object" || Array.isArray(gameState.data[gameName].jackpots)) {
    gameState.data[gameName].jackpots = {};
  }
  const effectiveKey = key || "global";
  const current = gameState.data[gameName].jackpots[effectiveKey];
  if (current == null) {
    if (effectiveKey === "global" && gameState.data[gameName].jackpot != null) {
      gameState.data[gameName].jackpots[effectiveKey] = String(gameState.data[gameName].jackpot);
      return new Big(gameState.data[gameName].jackpot);
    }
    gameState.data[gameName].jackpots[effectiveKey] = DEFAULT_JACKPOT;
    return new Big(DEFAULT_JACKPOT);
  }
  return new Big(current);
}

/**
 * Cập nhật giá trị hũ theo gameName và key (global hoặc serverId riêng).
 */
export function setGameJackpot(gameState, gameName, key = "global", value = DEFAULT_JACKPOT) {
  if (!gameState?.data) return new Big(value);
  if (!gameState.data[gameName]) gameState.data[gameName] = {};
  if (!gameState.data[gameName].jackpots || typeof gameState.data[gameName].jackpots !== "object" || Array.isArray(gameState.data[gameName].jackpots)) {
    gameState.data[gameName].jackpots = {};
  }
  const effectiveKey = key || "global";
  const bigVal = new Big(value);
  const valStr = bigVal.toString();
  gameState.data[gameName].jackpots[effectiveKey] = valStr;
  if (effectiveKey === "global" || !gameState.data[gameName].jackpot) {
    gameState.data[gameName].jackpot = valStr;
  }
  if (gameState.changes) gameState.changes[gameName] = true;
  return bigVal;
}

/**
 * Cộng thêm tiền vào hũ của botId hoặc serverId riêng.
 */
export function addGameJackpot(gameState, gameName, key, amount) {
  const current = getGameJackpot(gameState, gameName, key);
  const updated = current.plus(amount);
  setGameJackpot(gameState, gameName, key, updated);
  return updated;
}
