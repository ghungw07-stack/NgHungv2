import fs from "fs";
import path from "path";
import { AsyncLocalStorage } from "node:async_hooks";

const context = new AsyncLocalStorage();
const configPath = path.resolve("assets/data/private-game-servers.json");
const configuredCheckIntervalMs = Number(process.env.NGH_PRIVATE_GAME_CONFIG_CHECK_MS);
const CONFIG_CHECK_INTERVAL_MS = Math.max(
  250,
  Number.isFinite(configuredCheckIntervalMs) ? configuredCheckIntervalMs : 5000
);
let cache = {};
let serverByIdentity = new Map();
let lastMtime = -1;
let nextConfigCheckAt = 0;

function indexConfig(config) {
  const lookup = new Map();
  for (const [configId, server] of Object.entries(config || {})) {
    lookup.set(String(configId), server);
    for (const id of server?.botIds || []) lookup.set(String(id), server);
    for (const id of server?.ownerIds || []) lookup.set(String(id), server);
  }
  return lookup;
}

function loadConfig({ force = false } = {}) {
  const now = Date.now();
  if (!force && now < nextConfigCheckAt) return cache;
  nextConfigCheckAt = now + CONFIG_CHECK_INTERVAL_MS;
  try {
    const mtime = fs.statSync(configPath).mtimeMs;
    if (mtime !== lastMtime) {
      cache = JSON.parse(fs.readFileSync(configPath, "utf8"));
      serverByIdentity = indexConfig(cache);
      lastMtime = mtime;
    }
  } catch {
    cache = {};
    serverByIdentity = new Map();
    lastMtime = -1;
  }
  return cache;
}

loadConfig({ force: true });

export function getPrivateGameServer(botId) {
  if (!botId) return null;
  loadConfig();
  return serverByIdentity.get(String(botId)) || null;
}

export function getPrivateGameServerForApi(api) {
  const candidates = [
    api?.apiManager?.ownerId,
    api?.apiManager?.idBotWithBotMain,
    api?.apiManager?.idBotMainWithBot,
    api?.getBotId?.(),
  ].filter(Boolean).map(String);
  loadConfig();
  for (const candidate of candidates) {
    const server = serverByIdentity.get(candidate);
    if (server) return server;
  }
  return null;
}

export function getPrivateGameBotIds() {
  return [...new Set(Object.values(loadConfig()).flatMap((server) => server?.botIds || []).map(String))];
}

export function reloadPrivateGameServers() {
  nextConfigCheckAt = 0;
  loadConfig({ force: true });
  return cache;
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
