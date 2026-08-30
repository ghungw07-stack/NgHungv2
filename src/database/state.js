export let nameServer = "";
export let connection;
export let NAME_TABLE_PLAYERS;
export let NAME_TABLE_ACCOUNT;
export let DAILY_REWARD;

export async function pingDatabase() {
  if (!connection?.db) throw new Error("MongoDB is not initialized");
  return connection.db.command({ ping: 1 });
}

export function configureDatabaseState({
  serverName,
  playersTable,
  accountTable,
  dailyReward,
  databaseConnection,
}) {
  nameServer = serverName || "";
  NAME_TABLE_PLAYERS = playersTable;
  NAME_TABLE_ACCOUNT = accountTable;
  DAILY_REWARD = dailyReward;
  connection = databaseConnection;
}
