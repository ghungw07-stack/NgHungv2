import fs from "node:fs/promises";
import path from "node:path";

const DEFAULT_MAX_BYTES = 25 * 1024 * 1024;
const writeQueues = new Map();
const fullFiles = new Set();

function safeFilePart(value) {
  return String(value || "unknown").replace(/[^a-zA-Z0-9_-]/g, "_");
}

function stringifyPayload(value) {
  return JSON.stringify(value, (_key, item) => {
    if (typeof item === "bigint") return item.toString();
    if (item instanceof Error) {
      return { name: item.name, message: item.message, stack: item.stack };
    }
    return item;
  });
}

/**
 * Lưu payload WebSocket đã giải mã để điều tra các message/control bất thường.
 * File dừng nhận thêm dữ liệu khi đạt giới hạn, nhờ vậy bằng chứng cũ không bị
 * ghi đè và một nhóm đông không thể làm đầy ổ đĩa.
 */
export function logWsForensicEvent(botId, channel, payload, options = {}) {
  const enabled = options.enabled ?? process.env.NGH_WS_FORENSIC_LOG === "1";
  if (!enabled) return Promise.resolve(false);

  const logRoot = path.resolve(options.logRoot || process.env.NGH_LOG_ROOT || path.join(process.cwd(), "logs"));
  const maxBytes = Math.max(1024, Number(options.maxBytes || process.env.NGH_WS_FORENSIC_MAX_BYTES) || DEFAULT_MAX_BYTES);
  const botDirectory = path.join(logRoot, safeFilePart(botId));
  const filePath = path.join(botDirectory, "ws-forensic.jsonl");
  if (fullFiles.has(filePath)) return Promise.resolve(false);

  const record = `${stringifyPayload({
    capturedAt: new Date().toISOString(),
    botId: String(botId || "unknown"),
    channel: String(channel || "unknown"),
    payload,
  })}\n`;

  const previous = writeQueues.get(filePath) || Promise.resolve();
  const current = previous
    .catch(() => {})
    .then(async () => {
      await fs.mkdir(botDirectory, { recursive: true });
      const size = await fs.stat(filePath).then((stat) => stat.size).catch((error) => {
        if (error.code === "ENOENT") return 0;
        throw error;
      });
      if (size + Buffer.byteLength(record) > maxBytes) {
        fullFiles.add(filePath);
        const marker = `${stringifyPayload({
          capturedAt: new Date().toISOString(),
          channel: "logger",
          event: "max_size_reached",
          maxBytes,
        })}\n`;
        if (size + Buffer.byteLength(marker) <= maxBytes) await fs.appendFile(filePath, marker, "utf8");
        return false;
      }
      await fs.appendFile(filePath, record, "utf8");
      return true;
    })
    .catch((error) => {
      console.error("Lỗi ghi WebSocket forensic log:", error?.message || error);
      return false;
    })
    .finally(() => {
      if (writeQueues.get(filePath) === current) writeQueues.delete(filePath);
    });

  writeQueues.set(filePath, current);
  return current;
}

export async function flushWsForensicLogs() {
  await Promise.allSettled([...writeQueues.values()]);
}
