/**
 * Công cụ xem log nhanh từ bảng SQL `bot_logs` (không cần mở workbench/phpMyAdmin).
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
import mysql from "mysql2/promise";
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

  const connection = await mysql.createConnection({
    host: config.host,
    user: config.user,
    password: config.password,
    database: config.database,
    port: config.port,
  });

  const where = [];
  const params = [];
  if (level) {
    where.push("level = ?");
    params.push(level);
  }
  if (botId) {
    where.push("botId = ?");
    params.push(botId);
  }
  const whereSql = where.length ? `WHERE ${where.join(" AND ")}` : "";

  const [rows] = await connection.execute(
    `SELECT id, level, botId, message, createdAt FROM bot_logs ${whereSql} ORDER BY id DESC LIMIT ${limit}`,
    params
  );

  rows.reverse().forEach((row) => {
    const time = new Date(row.createdAt).toLocaleString("vi-VN");
    const tag = row.botId ? `[${row.botId}]` : "";
    console.log(`${time} [${row.level.toUpperCase()}]${tag} ${row.message}`);
  });

  console.log(`\n-- ${rows.length} dòng log (mới nhất bên dưới) --`);
  await connection.end();
}

main().catch((error) => {
  console.error("Lỗi khi đọc log:", error);
  process.exit(1);
});