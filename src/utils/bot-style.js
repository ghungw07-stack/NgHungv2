import { readSettingConfig } from "./io-json.js";

const VALID_STYLES = new Set(["v2"]);
const DEFAULT_STYLE = "v2";
const stylesByBotId = new Map();
let stylesCollection = null;

const normalizeBotId = (botId) => botId == null ? "" : String(botId).trim();
const normalizeStyle = (style) => {
  const normalized = String(style || "").toLowerCase();
  return VALID_STYLES.has(normalized) ? normalized : null;
};

/**
 * Nạp style của từng bot từ MongoDB vào cache đồng bộ dành cho các hàm vẽ.
 * Dữ liệu BOT_STYLE cũ trong JSON chỉ được dùng để migrate một lần.
 */
export async function initializeBotStyles(db) {
  stylesCollection = db.collection("bot_styles");
  await stylesCollection.createIndex({ botId: 1 }, { unique: true });

  const legacyStyles = readSettingConfig().BOT_STYLE;
  if (legacyStyles && typeof legacyStyles === "object" && !Array.isArray(legacyStyles)) {
    const migrations = Object.entries(legacyStyles)
      .map(([botId]) => ({ botId: normalizeBotId(botId), style: DEFAULT_STYLE }))
      .filter((item) => item.botId && item.style)
      .map(({ botId, style }) => stylesCollection.updateOne(
        { botId },
        { $setOnInsert: { botId, style, createdAt: new Date() } },
        { upsert: true }
      ));
    await Promise.all(migrations);
  }

  const storedStyles = await stylesCollection.find({}, { projection: { _id: 0, botId: 1, style: 1 } }).toArray();
  stylesByBotId.clear();
  for (const item of storedStyles) {
    const botId = normalizeBotId(item.botId);
    const style = normalizeStyle(item.style);
    if (botId && style) stylesByBotId.set(botId, style);
  }

  // V1 đã bị loại bỏ: đưa toàn bộ cấu hình cũ về V2 để database không còn
  // giữ một lựa chọn mà giao diện và canvas không hỗ trợ nữa.
  await stylesCollection.updateMany(
    { style: { $ne: DEFAULT_STYLE } },
    { $set: { style: DEFAULT_STYLE, updatedAt: new Date() } }
  );
}

export function getBotStyle(botId) {
  const id = normalizeBotId(botId);
  return (id && stylesByBotId.get(id)) || DEFAULT_STYLE;
}

export async function setBotStyle(botId, style) {
  const id = normalizeBotId(botId);
  const normalized = normalizeStyle(style);
  if (!id || !normalized) return false;
  if (!stylesCollection) throw new Error("Database bot style chưa được khởi tạo");

  await stylesCollection.updateOne(
    { botId: id },
    {
      $set: { style: normalized, updatedAt: new Date() },
      $setOnInsert: { botId: id, createdAt: new Date() },
    },
    { upsert: true }
  );
  stylesByBotId.set(id, normalized);
  return true;
}
