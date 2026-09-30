import { MongoClient } from "mongodb";
import chalk from "chalk";
import { initializeBotLanguages } from "../utils/bot-language.js";
import { configureDatabaseState } from "./state.js";
import { initializeBotCredentialVault } from "../security/bot-credential-vault.js";
import { MongoConnection } from "./mongo-connection.js";

export * from "./player.js";
import { preloadPlayerAliases } from "./player.js";
export * from "./jdbc.js";
export { connection, NAME_TABLE_PLAYERS, NAME_TABLE_ACCOUNT, nameServer, DAILY_REWARD, pingDatabase } from "./state.js";

export async function initializeDatabase() {
    while (true) {
    try {
    const playersTable = "players_zalo";
    const accountTable = "account";
    const mongoUri = "mongodb://127.0.0.1:27017";
    const databaseName = "bot-zalo-ngh";
    const mongoClient = new MongoClient(mongoUri, {
      maxPoolSize: Math.max(10, Number(process.env.NGH_MONGO_POOL_MAX) || 50),
      minPoolSize: Math.max(0, Number(process.env.NGH_MONGO_POOL_MIN) || 5),
      maxIdleTimeMS: Math.max(10000, Number(process.env.NGH_MONGO_IDLE_MS) || 60000),
      waitQueueTimeoutMS: Math.max(1000, Number(process.env.NGH_MONGO_WAIT_QUEUE_MS) || 10000),
      retryReads: true,
      retryWrites: true,
    });
        await mongoClient.connect();
    const db = mongoClient.db(databaseName);
    await initializeBotCredentialVault(db);
        const databaseConnection = new MongoConnection(db, playersTable, accountTable);
    configureDatabaseState({
      serverName: "NgHung-Bot",
      playersTable,
      accountTable,
      dailyReward: 100000000,
      databaseConnection,
    });

    await initializeBotLanguages(db);
    try { await preloadPlayerAliases(); } catch (e) { console.error(e); }

    // Lịch sử web chat phải được giữ lâu dài như Zalo Web. Bản cũ tạo TTL
    // index 24 giờ nên MongoDB tự xóa dữ liệu dù code không chủ động cleanup.
    const messageLogs = db.collection("messages_log");
    await messageLogs.createIndex({ botId: 1, threadId: 1, msgId: 1 }, { unique: true });
    const messageIndexes = await messageLogs.indexes();
    for (const index of messageIndexes) {
      if (index.expireAfterSeconds != null && index.key?.createdAt === 1) {
        await messageLogs.dropIndex(index.name);
      }
    }
    await Promise.all([
      messageLogs.createIndex({ createdAt: 1 }),
      messageLogs.createIndex({ botId: 1, ts: -1 }),
    ]);

    await Promise.all([
      db.collection(playersTable).createIndex({ username: 1 }, { unique: true }),
      db.collection(playersTable).createIndex({ idUserZalo: 1 }, { unique: true }),
      db.collection(playersTable).createIndex({ serverId: 1, balance: -1 }),
      db.collection(playersTable).createIndex({ serverId: 1, rankPoints: -1 }),
      db.collection(accountTable).createIndex({ username: 1 }, { unique: true }),
      db.collection("player_identity").createIndex({ aliasId: 1 }, { unique: true, sparse: true }),
      db.collection("player_identity").createIndex({ identityKey: 1 }, { unique: true, sparse: true }),
      db.collection("bot_logs").createIndex({ createdAt: -1 }),
      db.collection("bot_logs").createIndex(
        { createdAt: 1 },
        { expireAfterSeconds: Math.max(86400, Number(process.env.NGH_BOT_LOG_RETENTION_SECONDS) || 7 * 86400) }
      ),
      db.collection("bot_logs").createIndex({ id: -1 }, { unique: true }),
      db.collection("game_transactions").createIndex({ referenceCode: 1 }, { unique: true }),
      db.collection("game_transactions").createIndex({ senderId: 1, createdAt: -1 }),
      db.collection("game_transactions").createIndex({ receiverId: 1, createdAt: -1 }),
      db.collection("game_loans").createIndex({ playerId: 1 }, { unique: true }),
      db.collection("game_loans").createIndex({ status: 1, collectionStartsAt: 1 }),
      db.collection("game_loan_transactions").createIndex({ playerId: 1, createdAt: -1 }),
      db.collection("game_captcha_challenges").createIndex({ playerId: 1 }, { unique: true }),
      db.collection("game_captcha_challenges").createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 }),
      db.collection("forex_positions").createIndex({ server: 1, playerId: 1, status: 1, openedAt: -1 }),
      db.collection("forex_positions").createIndex({ server: 1, status: 1, closedAt: -1 }),
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
