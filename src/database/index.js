import { MongoClient } from "mongodb";
import Big from "big.js";
import chalk from "chalk";
import path from "path";
import { readFilePromise } from "../utils/util.js";
import { JSON_DATA_PATH } from "../utils/io-json.js";
import { initializeBotLanguages } from "../utils/bot-language.js";
import { configureDatabaseState } from "./state.js";
import { initializeBotCredentialVault } from "../security/bot-credential-vault.js";
import { MongoConnection } from "./mongo-connection.js";

// Mặc định tất cả bot dùng chung một MongoDB. Chỉ tách khi chủ động đổi
// `database`/`uri` trong database-config.json.
const DEFAULT_SHARED_DATABASE = "bot-zalo-ngh";
const DEFAULT_SHARED_URI = "mongodb://127.0.0.1:27017";


async function loadConfig() {
  const configFile = await readFilePromise(path.join(JSON_DATA_PATH, "database-config.json"));
  return JSON.parse(configFile);
}


export * from "./player.js";
import { preloadPlayerAliases } from "./player.js";
export * from "./jdbc.js";
export { connection, NAME_TABLE_PLAYERS, NAME_TABLE_ACCOUNT, nameServer, DAILY_REWARD, pingDatabase } from "./state.js";

export async function initializeDatabase() {
    while (true) {
    try {
    const config = await loadConfig();
    const playersTable = config.tablePlayerZalo || "players_zalo";
    const accountTable = config.tableAccount || "account";
    const mongoUri = config.uri || DEFAULT_SHARED_URI;
    const databaseName = config.database || DEFAULT_SHARED_DATABASE;
    const mongoClient = new MongoClient(mongoUri, {
      maxPoolSize: Math.max(10, Number(process.env.NGH_MONGO_POOL_MAX) || 50),
      minPoolSize: Math.max(0, Number(process.env.NGH_MONGO_POOL_MIN) || 5),
      maxIdleTimeMS: Math.max(10000, Number(process.env.NGH_MONGO_IDLE_MS) || 60000),
      waitQueueTimeoutMS: Math.max(1000, Number(process.env.NGH_MONGO_WAIT_QUEUE_MS) || 10000),
      retryReads: true,
      retryWrites: true,
    });
        const db = mongoClient.db(databaseName);
        const databaseConnection = new MongoConnection(db, playersTable, accountTable);
    configureDatabaseState({
      serverName: config.nameServer,
      playersTable,
      accountTable,
      dailyReward: config.dailyReward,
      databaseConnection,
    });

    await initializeBotLanguages(db);
    try { await preloadPlayerAliases(); } catch (e) { console.error(e); }

    await Promise.all([
      db.collection(playersTable).createIndex({ username: 1 }, { unique: true }),
      db.collection(playersTable).createIndex({ idUserZalo: 1 }, { unique: true }),
      db.collection(playersTable).createIndex({ serverId: 1, balance: -1 }),
      db.collection(playersTable).createIndex({ serverId: 1, rankPoints: -1 }),
      db.collection(accountTable).createIndex({ username: 1 }, { unique: true }),
      db.collection("messages_log").createIndex({ botId: 1, threadId: 1, msgId: 1 }, { unique: true }),
      db.collection("messages_log").createIndex({ createdAt: 1 }, { expireAfterSeconds: 86400 }),
      db.collection("bot_logs").createIndex({ createdAt: -1 }),
      db.collection("bot_logs").createIndex(
        { createdAt: 1 },
        { expireAfterSeconds: Math.max(86400, Number(process.env.NGH_BOT_LOG_RETENTION_SECONDS) || 7 * 86400) }
      ),
      db.collection("bot_logs").createIndex({ id: -1 }, { unique: true }),
      db.collection("game_transactions").createIndex({ referenceCode: 1 }, { unique: true }),
      db.collection("game_transactions").createIndex({ senderId: 1, createdAt: -1 }),
      db.collection("game_transactions").createIndex({ receiverId: 1, createdAt: -1 }),
      db.collection("game_history").createIndex({ playerId: 1, createdAt: -1 }),
      db.collection("game_history").createIndex({ idUserZalo: 1, createdAt: -1 }),
      db.collection("game_history").createIndex({ username: 1, createdAt: -1 }),
      db.collection("game_history").createIndex({ createdAt: -1 }),
    ]);
          return;
    } catch (error) {
      console.error(chalk.red("Lỗi khi khởi tạo MongoDB, thử lại sau 5 giây: "), error?.message || error);
      await new Promise((resolve) => setTimeout(resolve, 5000));
    }
  }
}
