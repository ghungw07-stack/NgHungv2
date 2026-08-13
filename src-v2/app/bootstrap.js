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
import { BotConfigStore } from "../modules/bot-manager/config-store.js";
import { PaymentService } from "../modules/payments/service.js";
import { WebServer } from "../web/server.js";
import { GeminiProvider } from "../modules/ai/gemini-provider.js";
import { AiGateway } from "../modules/ai/gateway.js";
import { SourceUpdateService } from "../modules/source-update/service.js";
import { PaymentQrService } from "../modules/payments/qr-service.js";

export async function bootstrap() {
  const logger = createLogger({ context: { app: "ngh-bot-v2" } });
  const lifecycle = new Lifecycle();
  const config = await loadConfig();
  const scheduler = new Scheduler((error, job) => logger.error("Scheduler job thất bại", { job, error: error.stack || error.message }));
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
  const ai = new AiGateway({ provider: new GeminiProvider(), concurrency: 2, maxQueue: 20 });
  const sourceUpdater = new SourceUpdateService({ rootDir: config.rootDir, logger: logger.child({ component: "source-update" }) });
  const paymentQr = new PaymentQrService({ rootDir: config.rootDir, http, tempFiles, price: 80_000 });
  const botStore = new BotConfigStore({ rootDir: config.rootDir, data: config.childBots });

  const fleet = new BotFleet({ config, scheduler, database, media, content, ai, sourceUpdater, paymentQr, logger: logger.child({ component: "fleet" }) });
  await fleet.start();
  lifecycle.add("fleet", () => fleet.stop());

  const payments = new PaymentService({ database, botStore, fleet, logger: logger.child({ component: "payments" }) });
  await payments.start();
  const web = new WebServer({ fleet, scheduler, payments, logger: logger.child({ component: "web" }) });
  await web.start();
  lifecycle.add("web", () => web.stop());

  return { config, database, scheduler, fleet, media, payments, web, lifecycle, logger };
}
