/**
 * Công cụ xem log nhanh từ collection MongoDB `bot_logs`.
 *
 * Cách dùng (chạy ở thư mục gốc project, cùng cấp với thư mục "src" và "assets"):
 *   node read-logs.js                 -> 50 dòng log mới nhất
 *   node read-logs.js 200              -> 200 dòng log mới nhất
 *   node read-logs.js 100 error         -> 100 dòng log mới nhất, chỉ level=error
 *   node read-logs.js 100 all 6267859557 -> 100 dòng log mới nhất của botId đó
 *
 * File này KHÔNG bị chặn console.log (vì nó không import src/utils/sql-logger.js),
 * nên in ra terminal bình thường để bạn đọc.
 */
import { MongoClient } from "mongodb";
import path from "path";
import fs from "fs";

const JSON_DATA_PATH = path.join(process.cwd(), "assets", "json-data");
const CONFIG_PATH = path.join(JSON_DATA_PATH, "database-config.json");

async function main() {
  const [limitArg, levelArg, botIdArg] = process.argv.slice(2);
  const limit = Math.min(Math.max(parseInt(limitArg, 10) || 50, 1), 2000);
  const level = levelArg && levelArg !== "all" ? levelArg : null;
  const botId = botIdArg || null;

  const config = JSON.parse(fs.readFileSync(CONFIG_PATH, "utf8"));

  const client = new MongoClient(config.uri || "mongodb://127.0.0.1:27017");
  await client.connect();
  const filter = {};
  if (level) filter.level = level;
  if (botId) filter.botId = botId;
  const rows = await client.db(config.database).collection("bot_logs")
    .find(filter, { projection: { _id: 0 } }).sort({ id: -1 }).limit(limit).toArray();

  rows.reverse().forEach((row) => {
    const time = new Date(row.createdAt).toLocaleString("vi-VN");
    const tag = row.botId ? `[${row.botId}]` : "";
    console.log(`${time} [${row.level.toUpperCase()}]${tag} ${row.message}`);
  });

  console.log(`\n-- ${rows.length} dòng log (mới nhất bên dưới) --`);
  await client.close();
}

main().catch((error) => {
  console.error("Lỗi khi đọc log:", error);
  process.exit(1);
});
