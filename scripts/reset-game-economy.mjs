import fs from "node:fs/promises";
import path from "node:path";
import { MongoClient } from "mongodb";
import {
  GAME_ECONOMY_COLLECTIONS,
  resetGameEconomy,
  resetPersistedGameState,
} from "../src/service-ngh/game-service/game-economy-reset.js";

const APPLY_FLAG = "--apply";
const apply = process.argv.includes(APPLY_FLAG);
const uri = process.env.NGH_MONGO_URI || "mongodb://127.0.0.1:27017";
const databaseName = process.env.NGH_MONGO_DATABASE || "bot-zalo-ngh";
const playersTable = process.env.NGH_PLAYERS_TABLE || "players_zalo";
const root = path.resolve(import.meta.dirname, "..");

const client = new MongoClient(uri);
await client.connect();
try {
  const database = client.db(databaseName);
  if (!apply) {
    const collections = Object.fromEntries(await Promise.all(
      GAME_ECONOMY_COLLECTIONS.map(async (name) => [name, await database.collection(name).countDocuments({})]),
    ));
    console.log(JSON.stringify({ apply: false, players: await database.collection(playersTable).countDocuments({}), collections }, null, 2));
    console.log(`Chạy lại với ${APPLY_FLAG} sau khi đã tạo backup để xác nhận reset.`);
    process.exitCode = 2;
  } else {
    const result = await resetGameEconomy(database, playersTable);
    const dataGamePath = path.join(root, "assets/json-data/data-game.json");
    const dataGame = JSON.parse(await fs.readFile(dataGamePath, "utf8"));
    await fs.writeFile(dataGamePath, `${JSON.stringify(resetPersistedGameState(dataGame, "0"), null, 2)}\n`);

    const lotteryPath = path.join(root, "assets/json-data/ve-so.json");
    await fs.writeFile(lotteryPath, `${JSON.stringify({ version: 1, nextCode: 1, current: null, history: [] }, null, 2)}\n`);
    console.log(JSON.stringify({ apply: true, ...result, stateFiles: [dataGamePath, lotteryPath] }, null, 2));
  }
} finally {
  await client.close();
}
