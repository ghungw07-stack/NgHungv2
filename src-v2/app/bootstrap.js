import { loadConfig } from "../config/load-config.js";
import { Lifecycle } from "../core/lifecycle.js";
import { createLogger } from "../core/logger.js";
import { Scheduler } from "../core/scheduler.js";
import { MongoDatabase } from "../infrastructure/database/mongodb.js";
import { ZaloClient } from "../infrastructure/zalo/zalo-client.js";
import { BotRuntime } from "./bot-runtime.js";

export async function bootstrap() {
  const logger = createLogger({ context: { app: "ngh-bot-v2" } });
  const lifecycle = new Lifecycle();
  const config = await loadConfig();
  const scheduler = new Scheduler();
  lifecycle.add("scheduler", () => scheduler.stop());

  const database = new MongoDatabase(config.database, logger.child({ component: "mongodb" }));
  await database.start();
  lifecycle.add("mongodb", () => database.stop());

  const client = new ZaloClient(config.bot, logger.child({ component: "zalo" }));
  await client.start();
  const runtime = new BotRuntime({ client, config, scheduler, logger: logger.child({ component: "runtime" }) });
  await runtime.start();
  lifecycle.add("bot", () => runtime.stop());

  return { config, database, scheduler, runtime, lifecycle, logger };
}
