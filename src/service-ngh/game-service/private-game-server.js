import fs from "fs";
import path from "path";
import { AsyncLocalStorage } from "node:async_hooks";

const context = new AsyncLocalStorage();
const configPath = path.resolve("assets/data/private-game-servers.json");
let cache = {};
let lastMtime = -1;

function loadConfig() {
  try {
    const mtime = fs.statSync(configPath).mtimeMs;
    if (mtime !== lastMtime) {
      cache = JSON.parse(fs.readFileSync(configPath, "utf8"));
      lastMtime = mtime;
    }
  } catch {
    cache = {};
    lastMtime = -1;
  }
  return cache;
}

export function getPrivateGameServer(botId) {
  if (!botId) return null;
  const config = loadConfig();
  const idStr = String(botId);
  if (config[idStr]) return config[idStr];
  for (const server of Object.values(config)) {
    if (server?.botIds?.map(String).includes(idStr) || server?.ownerIds?.map(String).includes(idStr)) {
      return server;
    }
  }
  return null;
}

export function getPrivateGameServerForApi(api) {
  const candidates = [
    api?.apiManager?.ownerId,
    api?.apiManager?.idBotWithBotMain,
    api?.apiManager?.idBotMainWithBot,
    api?.getBotId?.(),
  ].filter(Boolean).map(String);
  const config = loadConfig();
  for (const candidate of candidates) {
    if (config[candidate]) return config[candidate];
    for (const server of Object.values(config)) {
      if (server?.botIds?.map(String).includes(candidate) || server?.ownerIds?.map(String).includes(candidate)) {
        return server;
      }
    }
  }
  return null;
}

export function getPrivateGameBotIds() {
  return [...new Set(Object.values(loadConfig()).flatMap((server) => server?.botIds || [] ).map(String))];
}

export function runWithGameServer(botId, callback) {
  const server = getPrivateGameServer(botId);
  return context.run(server ? { botId: String(botId), ...server } : null, callback);
}

export function getCurrentPrivateGameServer() {
  return context.getStore() || null;
}

export function isPrivateGameServerManager(api, userId) {
  const server = getPrivateGameServerForApi(api);
  return Boolean(server?.ownerIds?.map(String).includes(String(userId)));
}
