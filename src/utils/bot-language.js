const SUPPORTED_LANGUAGES = Object.freeze({
  vi: "Tiếng Việt",
  en: "English",
});

const languageByBotId = new Map();
let languageCollection = null;

const normalizeBotId = (botId) => botId == null ? "" : String(botId).trim();

export function normalizeBotLanguage(language) {
  const value = String(language || "").trim().toLowerCase();
  const aliases = {
    vi: "vi", vn: "vi", vietnam: "vi", vietnamese: "vi", "tiếng việt": "vi", tiengviet: "vi",
    en: "en", eng: "en", english: "en", "tiếng anh": "en", tienganh: "en",
  };
  return aliases[value] || null;
}

export async function initializeBotLanguages(db) {
  languageCollection = db.collection("bot_languages");
  await languageCollection.createIndex({ botId: 1 }, { unique: true });
  const stored = await languageCollection.find({}, { projection: { _id: 0, botId: 1, language: 1 } }).toArray();
  languageByBotId.clear();
  for (const item of stored) {
    const botId = normalizeBotId(item.botId);
    const language = normalizeBotLanguage(item.language);
    if (botId && language) languageByBotId.set(botId, language);
  }
}

export function getBotLanguage(botId) {
  return languageByBotId.get(normalizeBotId(botId)) || "vi";
}

export function getBotLanguageName(language) {
  return SUPPORTED_LANGUAGES[normalizeBotLanguage(language)] || SUPPORTED_LANGUAGES.vi;
}

export function getSupportedBotLanguages() {
  return { ...SUPPORTED_LANGUAGES };
}

export async function setBotLanguage(botId, language) {
  const id = normalizeBotId(botId);
  const normalized = normalizeBotLanguage(language);
  if (!id || !normalized) return false;
  if (!languageCollection) throw new Error("Database bot language chưa được khởi tạo");

  await languageCollection.updateOne(
    { botId: id },
    {
      $set: { language: normalized, updatedAt: new Date() },
      $setOnInsert: { botId: id, createdAt: new Date() },
    },
    { upsert: true }
  );
  languageByBotId.set(id, normalized);
  return true;
}

export function botText(botId, translations) {
  const language = getBotLanguage(botId);
  return translations?.[language] || translations?.vi || translations?.en || "";
}
