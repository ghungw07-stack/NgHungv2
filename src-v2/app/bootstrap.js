import { loadConfig } from "../config/load-config.js";
import { Lifecycle } from "../core/lifecycle.js";
import { createLogger } from "../core/logger.js";
import { Scheduler } from "../core/scheduler.js";
import { MongoDatabase } from "../infrastructure/database/mongodb.js";
import { BotFleet } from "./bot-fleet.js";

export async function bootstrap() {
  const logger = createLogger({ context: { app: "ngh-bot-v2" } });
  const lifecycle = new Lifecycle();
  const config = await loadConfig();
  const scheduler = new Scheduler();
  lifecycle.add("scheduler", () => scheduler.stop());

  const database = new MongoDatabase(config.database, logger.child({ component: "mongodb" }));
  await database.start();
  lifecycle.add("mongodb", () => database.stop());

  const fleet = new BotFleet({ config, scheduler, database, logger: logger.child({ component: "fleet" }) });
  await fleet.start();
  lifecycle.add("fleet", () => fleet.stop());

  return { config, database, scheduler, fleet, lifecycle, logger };
}
