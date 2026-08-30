import { format } from "node:util";

/**
 * ============================================================================
 *  LOGGER - Chặn console.log/info/warn/debug và lưu vào MongoDB `bot_logs`.
 *  Muốn xem lại log thường (info/warn) thì dùng trang log hoặc read-logs.js.
 * ============================================================================
 *
 * File này CHỦ Ý không import trực tiếp `../database/index.js` ở đầu file,
 * vì lúc file này được nạp (rất sớm trong quá trình khởi động, để bắt được
 * console.log của toàn bộ module khác kể cả log lúc import) thì pool kết nối
 * DB (`connection`) trong database/index.js còn chưa được tạo xong
 * (initializeDatabase() gọi sau). Dùng dynamic import() mỗi lần flush để luôn
 * lấy được giá trị `connection` mới nhất (module ESM export "live binding").
 *
 * Cách dùng: chỉ cần import file này ở DÒNG ĐẦU TIÊN của entry point
 * (src/index.js), không cần gọi hàm gì thêm - nó tự chặn console ngay khi
 * được import.
 */

const LOG_TABLE = "bot_logs";
const FLUSH_INTERVAL_MS = 1000;
const MAX_QUEUE_SIZE = 5000; // an toàn cho RAM nếu DB down lâu, log dư sẽ bị rớt bớt (giữ log mới nhất)
const MAX_MESSAGE_LENGTH = 60000; // TEXT ~ giới hạn 65535 bytes, chừa dư ra
const LOG_LEVELS = { debug: 10, info: 20, warn: 30, error: 40 };
const minimumLogLevel = LOG_LEVELS[String(process.env.NGH_SQL_LOG_LEVEL || "info").toLowerCase()] ?? LOG_LEVELS.info;

let queue = [];
let tableReady = false;
let flushing = false;
let lastFlushErrorAt = 0;

// eslint-disable-next-line no-control-regex
const ANSI_REGEX = /\x1b\[[0-9;]*m/g;

function stripAnsi(str) {
  return str.replace(ANSI_REGEX, "");
}

/** Cố gắng nhận diện botId đứng đầu message dạng "[123456789] ..." (không bắt buộc phải có). */
function extractBotId(message) {
  const m = message.match(/^\[(\d{4,})\]/);
  return m ? m[1] : null;
}

function pushLog(level, args) {
  if ((LOG_LEVELS[level] ?? LOG_LEVELS.info) < minimumLogLevel) return;
  try {
    const raw = format(...args);
    const message = stripAnsi(raw).slice(0, MAX_MESSAGE_LENGTH);
    const botId = extractBotId(message);

    queue.push({
      level,
      botId,
      message,
      createdAt: new Date(),
    });

    if (queue.length > MAX_QUEUE_SIZE) {
      // Bỏ bớt các log cũ nhất trong hàng đợi (chưa kịp ghi) để không phình RAM
      queue.splice(0, queue.length - MAX_QUEUE_SIZE);
    }
  } catch {
    // Không được phép để việc log làm crash app - im lặng bỏ qua nếu format lỗi
  }
}

export function enqueueSqlLog(level, ...args) {
  pushLog(level || "info", args);
}

async function ensureLogTable(connection) {
  if (tableReady) return;
  await connection.execute(`
    CREATE TABLE IF NOT EXISTS ${LOG_TABLE} (
      id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
      level VARCHAR(10) NOT NULL,
      botId VARCHAR(64) DEFAULT NULL,
      message TEXT NOT NULL,
      createdAt DATETIME NOT NULL,
      KEY idx_created (createdAt),
      KEY idx_level (level),
      KEY idx_bot (botId)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);
  tableReady = true;
}

async function flush() {
  if (flushing || queue.length === 0) return;
  flushing = true;

  const batch = queue;
  queue = [];

  try {
    // Import the tiny state module, not database/index.js. This logger is loaded
    // by index.js before database initialization; importing the parent module
    // back from here creates an ESM evaluation cycle that leaves flush pending.
    const { connection } = await import("../database/state.js");
    if (!connection) {
      // DB chưa sẵn sàng (initializeDatabase() chưa chạy xong) -> để log lại vào hàng đợi, chờ lượt sau
      queue = batch.concat(queue);
      return;
    }

    await ensureLogTable(connection);

    const rows = batch.map((item) => [item.level, item.botId, item.message, item.createdAt]);
    await connection.query(`INSERT INTO ${LOG_TABLE} (level, botId, message, createdAt) VALUES ?`, [rows]);
  } catch (error) {
    // Ghi MongoDB thất bại -> đẩy batch trở lại đầu hàng đợi để thử lại lượt sau
    queue = batch.concat(queue);
    if (queue.length > MAX_QUEUE_SIZE) {
      queue.splice(0, queue.length - MAX_QUEUE_SIZE);
    }
    const now = Date.now();
    if (now - lastFlushErrorAt >= 60_000) {
      lastFlushErrorAt = now;
      originalConsole.error(`[sql-logger] Flush failed: ${error?.message || error}`);
    }
  } finally {
    flushing = false;
  }
}

setInterval(() => {
  flush().catch(() => {});
}, FLUSH_INTERVAL_MS).unref();

// Cố gắng flush nốt phần còn lại trong hàng đợi khi tiến trình sắp thoát
process.on("beforeExit", () => {
  flush().catch(() => {});
});

const originalConsole = {
  log: console.log.bind(console),
  info: console.info.bind(console),
  warn: console.warn.bind(console),
  error: console.error.bind(console),
  debug: console.debug ? console.debug.bind(console) : console.log.bind(console),
};

// Giữ lại bản gốc phòng khi cần debug thủ công (vd: process.env.FORCE_CONSOLE=1)
export const rawConsole = originalConsole;

const FORCE_CONSOLE = process.env.FORCE_CONSOLE === "1";

console.log = (...args) => {
  pushLog("info", args);
  if (FORCE_CONSOLE) originalConsole.log(...args);
};
console.info = (...args) => {
  pushLog("info", args);
  if (FORCE_CONSOLE) originalConsole.info(...args);
};
console.warn = (...args) => {
  pushLog("warn", args);
  if (FORCE_CONSOLE) originalConsole.warn(...args);
};
console.error = (...args) => {
  pushLog("error", args);
  // Lỗi thì LUÔN in ra terminal (để còn biết ngay khi có sự cố), khác với
  // log/info/warn/debug chỉ nằm trong MongoDB.
  originalConsole.error(...args);
};
console.debug = (...args) => {
  pushLog("debug", args);
  if (FORCE_CONSOLE) originalConsole.debug(...args);
};
