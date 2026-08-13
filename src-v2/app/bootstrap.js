import { loadConfig } from "../config/load-config.js";
import { Lifecycle } from "../core/lifecycle.js";
import { createLogger } from "../core/logger.js";
import { Scheduler } from "../core/scheduler.js";
import { MongoDatabase } from "../infrastructure/database/mongodb.js";
import { BotFleet } from "./bot-fleet.js";
import { TempFiles } from "../infrastructure/files/temp-files.js";
import { SafeHttpClient } from "../infrastructure/http/safe-http-client.js";
import { MediaService } from "../modules/media/service.js";
import { WeatherProvider } from "../modules/content/weather-provider.js";
import { TranslateProvider } from "../modules/content/translate-provider.js";

export async function bootstrap() {
  const logger = createLogger({ context: { app: "ngh-bot-v2" } });
  const lifecycle = new Lifecycle();
  const config = await loadConfig();
  const scheduler = new Scheduler();
  lifecycle.add("scheduler", () => scheduler.stop());

  const database = new MongoDatabase(config.database, logger.child({ component: "mongodb" }));
  await database.start();
  lifecycle.add("mongodb", () => database.stop());

  const tempFiles = new TempFiles({ rootDir: config.rootDir, logger: logger.child({ component: "temp" }) });
  await tempFiles.start();
  lifecycle.add("temp-files", () => tempFiles.stop());
  scheduler.every("temp-files:cleanup", 10 * 60_000, () => tempFiles.cleanup());
  const http = new SafeHttpClient();
  const media = new MediaService({ http, tempFiles, concurrency: 2 });
  const content = { weather: new WeatherProvider(http), translator: new TranslateProvider(http) };

  const fleet = new BotFleet({ config, scheduler, database, media, content, logger: logger.child({ component: "fleet" }) });
  await fleet.start();
  lifecycle.add("fleet", () => fleet.stop());

  return { config, database, scheduler, fleet, media, lifecycle, logger };
}
