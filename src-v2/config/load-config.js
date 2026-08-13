import fs from "node:fs/promises";
import path from "node:path";
import { ValidationError } from "../core/errors.js";

async function readJson(file) {
  try { return JSON.parse(await fs.readFile(file, "utf8")); }
  catch (error) { throw new ValidationError(`Không đọc được cấu hình ${file}`, { cause: error.message }); }
}

export async function loadConfig(rootDir = process.cwd()) {
  const bot = await readJson(path.join(rootDir, "assets", "config.json"));
  const database = await readJson(path.join(rootDir, "assets", "json-data", "database-config.json"));
  const admins = await readJson(path.join(rootDir, "assets", "data", "list_admin.json"));
  let leaders = {};
  try { leaders = await readJson(path.join(rootDir, "assets", "data", "bot_leader.json")); } catch {}
  if (!bot.cookie || !bot.imei || !bot.userAgent) {
    throw new ValidationError("assets/config.json thiếu cookie, imei hoặc userAgent");
  }
  return Object.freeze({
    rootDir,
    prefix: bot.prefix || "!",
    bot,
    admins,
    leaders,
    database: Object.freeze({
      uri: process.env.MONGODB_URI || database.uri || "mongodb://127.0.0.1:27017",
      name: process.env.MONGODB_DATABASE || database.database || "bot-zalo-ngh",
    }),
  });
}
