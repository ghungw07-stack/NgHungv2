import { MongoClient } from "mongodb";
import Big from "big.js";
import chalk from "chalk";
import path from "path";
import { claimDailyReward, getMyCard } from "./player.js";
import { getTopPlayers } from "./jdbc.js";
import { readFilePromise } from "../utils/util.js";
import { JSON_DATA_PATH } from "../utils/io-json.js";
import { initializeBotStyles } from "../utils/bot-style.js";
import { initializeBotLanguages } from "../utils/bot-language.js";
import { configureDatabaseState } from "./state.js";

// Mặc định tất cả bot dùng chung một MongoDB. Chỉ tách khi chủ động đổi
// `database`/`uri` trong database-config.json.
const DEFAULT_SHARED_DATABASE = "bot-zalo-ngh";
const DEFAULT_SHARED_URI = "mongodb://127.0.0.1:27017";

export * from "./player.js";
export * from "./jdbc.js";
export { connection, NAME_TABLE_PLAYERS, NAME_TABLE_ACCOUNT, nameServer, DAILY_REWARD } from "./state.js";

async function loadConfig() {
  const configFile = await readFilePromise(path.join(JSON_DATA_PATH, "database-config.json"));
  return JSON.parse(configFile);
}

const clean = (sql) => sql.replace(/\s+/g, " ").trim();
const value = (v) => (typeof v === "bigint" ? v.toString() : v);

class MongoConnection {
  constructor(db, players, accounts) {
    this.db = db;
    this.players = players;
    this.accounts = accounts;
  }

  collection(name) {
    return this.db.collection(name);
  }

  async execute(rawSql, params = []) {
    const sql = clean(rawSql);
    if (/^(CREATE|ALTER|SHOW) /i.test(sql)) return [[], []];

    const tableMatch = sql.match(/\b(?:FROM|INTO|UPDATE)\s+`?([\w-]+)`?/i);
    const table = tableMatch?.[1];
    const col = this.collection(table);

    if (/^SELECT /i.test(sql)) return [await this.#select(col, sql, params), []];
    if (/^INSERT /i.test(sql)) return [await this.#insert(col, sql, params), []];
    if (/^UPDATE /i.test(sql)) return [await this.#update(col, sql, params), []];
    if (/^DELETE /i.test(sql)) {
      const filter = this.#where(sql, params).filter;
      const limit = Number(sql.match(/ LIMIT (\d+)/i)?.[1] || 0);
      let deletedCount = 0;
      if (limit) {
        const ids = await col.find(filter, { projection: { _id: 1 } }).limit(limit).toArray();
        if (ids.length) deletedCount = (await col.deleteMany({ _id: { $in: ids.map((x) => x._id) } })).deletedCount;
      } else deletedCount = (await col.deleteMany(filter)).deletedCount;
      return [{ affectedRows: deletedCount }, []];
    }
    throw new Error(`Mongo compatibility: unsupported query: ${sql}`);
  }

  async query(sql, params = []) {
    const normalized = clean(sql);
    if (/^INSERT INTO bot_logs/i.test(normalized) && Array.isArray(params[0])) {
      const counter = await this.collection("_counters").findOneAndUpdate(
        { _id: "bot_logs" }, { $inc: { value: params[0].length } }, { upsert: true, returnDocument: "after" }
      );
      const baseId = counter.value - params[0].length + 1;
      const docs = params[0].map(([level, botId, message, createdAt], index) => ({
        id: baseId + index, level, botId, message, createdAt,
      }));
      if (docs.length) await this.collection("bot_logs").insertMany(docs);
      return [{ affectedRows: docs.length }, []];
    }
    return this.execute(sql, params);
  }

  #where(sql, params) {
    const where = sql.match(/ WHERE (.*?)(?: ORDER BY| LIMIT|$)/i)?.[1];
    if (!where) return { filter: {}, used: 0 };
    let used = 0;
    const filter = {};
    let simpleWhere = where;
    const specialMessageFilter = simpleWhere.match(/\(msgType = 'webchat' OR \(ttl > 0 AND ttl < \?\)\)/i);
    if (specialMessageFilter) simpleWhere = simpleWhere.replace(specialMessageFilter[0], "__MESSAGE_FILTER__");
    for (const part of simpleWhere.split(/\s+AND\s+/i)) {
      let m;
      if ((m = part.match(/^([\w]+)\s*=\s*\?$/i))) filter[m[1]] = value(params[used++]);
      else if ((m = part.match(/^([\w]+)\s*<>\s*\?$/i))) filter[m[1]] = { $ne: value(params[used++]) };
      else if ((m = part.match(/^([\w]+)\s*>=\s*\?$/i))) filter[m[1]] = { $gte: value(params[used++]) };
      else if ((m = part.match(/^([\w]+)\s*<\s*\?$/i))) filter[m[1]] = { $lt: value(params[used++]) };
      else if ((m = part.match(/^([\w]+) IS NOT NULL$/i))) filter[m[1]] = { $ne: null };
      else if ((m = part.match(/^([\w]+) <> ''$/i))) filter[m[1]] = { ...(filter[m[1]] || {}), $ne: "" };
      else if ((m = part.match(/^([\w]+) LIKE \?$/i))) filter[m[1]] = new RegExp(String(params[used++]).replace(/^%|%$/g, ""), "i");
      else if (/^createdAt >= \(NOW\(\) - INTERVAL \? MINUTE\)$/i.test(part)) {
        filter.createdAt = { $gte: new Date(Date.now() - Number(params[used++]) * 60000) };
      } else if (part === "__MESSAGE_FILTER__") {
        filter.$or = [{ msgType: "webchat" }, { ttl: { $gt: 0, $lt: Number(params[used++]) } }];
      } else throw new Error(`Mongo compatibility: unsupported WHERE: ${part}`);
    }
    return { filter, used };
  }

  async #select(col, sql, params) {
    const { filter } = this.#where(sql, params);
    if (/COUNT\(\*\) as count/i.test(sql)) return [{ count: await col.countDocuments(filter) }];
    if (/^SELECT DISTINCT /i.test(sql)) {
      const field = sql.match(/^SELECT DISTINCT ([\w]+)/i)[1];
      return (await col.distinct(field, filter)).slice(0, Number(sql.match(/LIMIT (\d+)/i)?.[1] || 200)).sort().map((v) => ({ [field]: v }));
    }
    const fields = sql.match(/^SELECT (.*?) FROM/i)?.[1];
    const projection = fields === "*" ? undefined : Object.fromEntries(fields.split(",").map((f) => [f.trim(), 1]));
    let cursor = col.find(filter, projection ? { projection: { ...projection, _id: 0 } } : {});
    const order = sql.match(/ORDER BY ([\w]+)(?: (ASC|DESC))?/i);
    if (order) cursor = cursor.sort({ [order[1]]: order[2]?.toUpperCase() === "DESC" ? -1 : 1 });
    const limit = Number(sql.match(/LIMIT (\d+)/i)?.[1] || 0);
    if (limit) cursor = cursor.limit(limit);
    return cursor.toArray();
  }

  async #insert(col, sql, params) {
    const fields = sql.match(/\(([^)]+)\) VALUES/i)?.[1].split(",").map((x) => x.trim());
    if (!fields) throw new Error(`Mongo compatibility: invalid INSERT: ${sql}`);
    const doc = Object.fromEntries(fields.map((field, i) => [field, value(params[i])]));
    if (/NOW\(\)/i.test(sql)) doc.registrationTime = new Date();
    if (/ON DUPLICATE KEY UPDATE/i.test(sql)) {
      const filter = { botId: doc.botId, threadId: doc.threadId, msgId: doc.msgId };
      await col.updateOne(filter, { $set: doc, $setOnInsert: { createdAt: new Date() } }, { upsert: true });
      return { affectedRows: 1 };
    }
    if (col.collectionName === this.players) {
      Object.assign(doc, { balance: "10000", rankPoints: 0, totalWinnings: "0", totalLosses: "0", netProfit: "0", totalWinGames: 0, totalGames: 0, winRate: 0, isBanned: false });
    } else if (col.collectionName === this.accounts) {
      Object.assign(doc, { is_admin: false, active: false, vnd: "0" });
    }
    const result = await col.insertOne(doc);
    return { affectedRows: result.acknowledged ? 1 : 0, insertId: result.insertedId };
  }

  async #update(col, sql, params) {
    if (/winRate = \(totalWinGames \/ NULLIF\(totalGames, 0\)\) \* 100/i.test(sql)) {
      const field = /WHERE idUserZalo = \?/i.test(sql) ? "idUserZalo" : "username";
      const filter = { [field]: value(params[0]) };
      const player = await col.findOne(filter);
      if (!player) return { affectedRows: 0 };
      const games = Number(player.totalGames) || 0;
      const winRate = games ? (Number(player.totalWinGames || 0) / games) * 100 : 0;
      const result = await col.updateOne(filter, { $set: { winRate } });
      return { affectedRows: result.matchedCount };
    }
    if (/CASE WHEN \? > 0/i.test(sql)) {
      const field = /WHERE idUserZalo = \?/i.test(sql) ? "idUserZalo" : "username";
      const filter = { [field]: value(params[params.length - 1]) };
      const player = await col.findOne(filter);
      if (!player) return { affectedRows: 0 };
      const totalWinnings = new Big(player.totalWinnings || 0).plus(params[2] || 0).toString();
      const totalLosses = new Big(player.totalLosses || 0).minus(params[4] || 0).toString();
      const result = await col.updateOne(filter, { $set: {
        balance: value(params[0]), totalWinnings, totalLosses,
        totalGames: Number(player.totalGames || 0) + 1,
        totalWinGames: Number(player.totalWinGames || 0) + Number(params[5] || 0),
      } });
      return { affectedRows: result.matchedCount };
    }
    const setText = sql.match(/ SET (.*?) WHERE /i)?.[1];
    if (!setText) throw new Error(`Mongo compatibility: invalid UPDATE: ${sql}`);
    const assignments = setText.split(",").map((x) => x.trim());
    const $set = {}, $inc = {};
    let used = 0;
    for (const assignment of assignments) {
      let m;
      if ((m = assignment.match(/^([\w]+)\s*=\s*\?$/))) $set[m[1]] = value(params[used++]);
      else if ((m = assignment.match(/^([\w]+)\s*=\s*([\w]+)\s*\+\s*\?$/))) $inc[m[1]] = params[used++];
      else if ((m = assignment.match(/^([\w]+)\s*=\s*(-?\d+)$/))) $set[m[1]] = Number(m[2]);
      else throw new Error(`Mongo compatibility: unsupported SET: ${assignment}`);
    }
    const whereSql = ` WHERE ${sql.match(/ WHERE (.*)$/i)[1]}`;
    const { filter } = this.#where(whereSql, params.slice(used));
    if (Object.keys($inc).length) {
      const current = await col.findOne(filter);
      if (!current) return { affectedRows: 0, changedRows: 0 };
      for (const [field, amount] of Object.entries($inc)) {
        $set[field] = typeof current[field] === "string"
          ? new Big(current[field] || 0).plus(amount).toString()
          : Number(current[field] || 0) + Number(amount);
      }
    }
    const update = {};
    if (Object.keys($set).length) update.$set = $set;
    const result = await col.updateMany(filter, update);
    return { affectedRows: result.modifiedCount, changedRows: result.modifiedCount };
  }
}

export async function initializeDatabase() {
  try {
    const config = await loadConfig();
    const playersTable = config.tablePlayerZalo || "players_zalo";
    const accountTable = config.tableAccount || "account";
    const mongoUri = config.uri || DEFAULT_SHARED_URI;
    const databaseName = config.database || DEFAULT_SHARED_DATABASE;
    const mongoClient = new MongoClient(mongoUri);
    await mongoClient.connect();
    const db = mongoClient.db(databaseName);
    const databaseConnection = new MongoConnection(db, playersTable, accountTable);
    configureDatabaseState({
      serverName: config.nameServer,
      playersTable,
      accountTable,
      dailyReward: config.dailyReward,
      databaseConnection,
    });

    await Promise.all([initializeBotStyles(db), initializeBotLanguages(db)]);

    await Promise.all([
      db.collection(playersTable).createIndex({ username: 1 }, { unique: true }),
      db.collection(playersTable).createIndex({ idUserZalo: 1 }, { unique: true }),
      db.collection(playersTable).createIndex({ serverId: 1, balance: -1 }),
      db.collection(playersTable).createIndex({ serverId: 1, rankPoints: -1 }),
      db.collection(accountTable).createIndex({ username: 1 }, { unique: true }),
      db.collection("messages_log").createIndex({ botId: 1, threadId: 1, msgId: 1 }, { unique: true }),
      db.collection("messages_log").createIndex({ createdAt: 1 }, { expireAfterSeconds: 86400 }),
      db.collection("bot_logs").createIndex({ createdAt: -1 }),
      db.collection("bot_logs").createIndex({ id: -1 }, { unique: true }),
      db.collection("game_transactions").createIndex({ referenceCode: 1 }, { unique: true }),
      db.collection("game_transactions").createIndex({ senderId: 1, createdAt: -1 }),
      db.collection("game_transactions").createIndex({ receiverId: 1, createdAt: -1 }),
    ]);
    console.log(chalk.green(`✓ Khởi tạo MongoDB thành công (${databaseName})`));
  } catch (error) {
    console.error(chalk.red("Lỗi khi khởi tạo MongoDB: "), error);
    throw error;
  }
}
