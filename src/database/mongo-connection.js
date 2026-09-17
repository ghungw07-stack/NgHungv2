import Big from "big.js";

const clean = (sql) => sql.replace(/\s+/g, " ").trim();
const value = (v) => (typeof v === "bigint" ? v.toString() : v);

export class MongoConnection {
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
      const { filter } = this.#where(sql, params);
      const result = await col.deleteMany(filter);
      return [{ affectedRows: result.deletedCount }, []];
    }
    throw new Error(`Mongo compatibility: unsupported SQL: ${rawSql}`);
  }

  async query(rawSql, params = []) {
    const [rows] = await this.execute(rawSql, params);
    return rows;
  }

  async batchInsertBotLogs(sql, params) {
    if (clean(sql).startsWith("INSERT INTO bot_logs")) {
      const counter = await this.collection("counters").findOneAndUpdate(
        { _id: "bot_log_id" },
        { $inc: { value: params[0].length } },
        { upsert: true, returnDocument: "after" }
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
    const setClause = sql.match(/ SET (.*?) WHERE /i)?.[1];
    if (!setClause) throw new Error(`Mongo compatibility: invalid UPDATE: ${sql}`);
    let used = 0;
    const $set = {};
    const $inc = {};
    for (const assignment of setClause.split(",").map((s) => s.trim())) {
      let m;
      if (/NOW\(\)/i.test(assignment)) {
        const field = assignment.split("=")[0].trim();
        $set[field] = new Date();
        continue;
      }
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
