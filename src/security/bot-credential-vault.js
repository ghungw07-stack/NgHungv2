import crypto from "node:crypto";

export const BOT_CREDENTIAL_FIELDS = Object.freeze(["imei", "cookie", "userAgent"]);

const COLLECTION_NAME = "bot_credentials";
const ALGORITHM = "aes-256-gcm";
const VERSION = 1;
const IV_BYTES = 12;

function parseMasterKey(value = process.env.NGH_CREDENTIAL_MASTER_KEY) {
  const raw = String(value || "").trim();
  let key;

  if (/^[a-f\d]{64}$/i.test(raw)) key = Buffer.from(raw, "hex");
  else {
    try {
      key = Buffer.from(raw, "base64");
    } catch {
      key = null;
    }
  }

  if (!key || key.length !== 32) {
    throw new Error(
      "NGH_CREDENTIAL_MASTER_KEY phải là khóa 32 byte (base64) hoặc 64 ký tự hex"
    );
  }
  return key;
}

export function pickBotCredentials(value = {}) {
  return Object.fromEntries(
    BOT_CREDENTIAL_FIELDS
      .filter((field) => value[field] !== undefined && value[field] !== null && value[field] !== "")
      .map((field) => [field, value[field]])
  );
}

export function hasBotCredentials(value = {}) {
  const credentials = pickBotCredentials(value);
  return credentials.imei !== undefined && credentials.cookie !== undefined;
}

export function withoutBotCredentials(value = {}) {
  if (!value || typeof value !== "object") return value;
  const safe = { ...value };
  for (const field of BOT_CREDENTIAL_FIELDS) delete safe[field];
  return safe;
}

export function sanitizeBotMap(value = {}) {
  return Object.fromEntries(
    Object.entries(value || {}).map(([ownerId, bot]) => [ownerId, withoutBotCredentials(bot)])
  );
}

export class BotCredentialVault {
  constructor(db, masterKey = process.env.NGH_CREDENTIAL_MASTER_KEY) {
    if (!db?.collection) throw new Error("MongoDB chưa sẵn sàng cho credential vault");
    this.collection = db.collection(COLLECTION_NAME);
    this.key = parseMasterKey(masterKey);
  }

  async initialize() {
    await this.collection.createIndex({ scope: 1, identity: 1 }, { unique: true });
    await this.collection.createIndex({ updatedAt: -1 });
    return this;
  }

  documentId(scope, identity) {
    return `${String(scope)}:${String(identity)}`;
  }

  aad(scope, identity) {
    return Buffer.from(`nghung-bot-credential:v${VERSION}:${scope}:${identity}`, "utf8");
  }

  encrypt(scope, identity, credentials) {
    if (!hasBotCredentials(credentials)) {
      throw new Error("Credential phải có đủ IMEI và cookie");
    }
    const iv = crypto.randomBytes(IV_BYTES);
    const cipher = crypto.createCipheriv(ALGORITHM, this.key, iv);
    cipher.setAAD(this.aad(scope, identity));
    const encrypted = Buffer.concat([
      cipher.update(JSON.stringify(pickBotCredentials(credentials)), "utf8"),
      cipher.final(),
    ]);
    return {
      algorithm: ALGORITHM,
      version: VERSION,
      iv: iv.toString("base64"),
      ciphertext: encrypted.toString("base64"),
      authTag: cipher.getAuthTag().toString("base64"),
    };
  }

  decrypt(document) {
    if (!document) return null;
    if (document.version !== VERSION || document.algorithm !== ALGORITHM) {
      throw new Error(`Định dạng credential không được hỗ trợ: ${document._id || "unknown"}`);
    }
    try {
      const decipher = crypto.createDecipheriv(
        ALGORITHM,
        this.key,
        Buffer.from(document.iv, "base64")
      );
      decipher.setAAD(this.aad(document.scope, document.identity));
      decipher.setAuthTag(Buffer.from(document.authTag, "base64"));
      const plaintext = Buffer.concat([
        decipher.update(Buffer.from(document.ciphertext, "base64")),
        decipher.final(),
      ]).toString("utf8");
      return JSON.parse(plaintext);
    } catch {
      throw new Error(`Không giải mã được credential ${document._id}; kiểm tra master key`);
    }
  }

  async get(scope, identity) {
    const document = await this.collection.findOne({ _id: this.documentId(scope, identity) });
    return this.decrypt(document);
  }

  async getAll(scope) {
    const documents = await this.collection.find({ scope: String(scope) }).toArray();
    return new Map(documents.map((document) => [String(document.identity), this.decrypt(document)]));
  }

  async set(scope, identity, credentials) {
    const normalizedScope = String(scope);
    const normalizedIdentity = String(identity);
    const encrypted = this.encrypt(normalizedScope, normalizedIdentity, credentials);
    await this.collection.updateOne(
      { _id: this.documentId(normalizedScope, normalizedIdentity) },
      {
        $set: {
          scope: normalizedScope,
          identity: normalizedIdentity,
          ...encrypted,
          updatedAt: new Date(),
        },
        $setOnInsert: { createdAt: new Date() },
      },
      { upsert: true }
    );
  }

  async delete(scope, identity) {
    await this.collection.deleteOne({ _id: this.documentId(scope, identity) });
  }
}

let credentialVault = null;

export async function initializeBotCredentialVault(db) {
  if (credentialVault) return credentialVault;
  credentialVault = await new BotCredentialVault(db).initialize();
  return credentialVault;
}

export function getBotCredentialVault() {
  if (!credentialVault) throw new Error("Credential vault chưa được khởi tạo");
  return credentialVault;
}
