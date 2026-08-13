import { bootstrap } from "./app/bootstrap.js";

const app = await bootstrap();
let stopping = false;
async function shutdown(signal) {
  if (stopping) return;
  stopping = true;
  app.logger.info("Đang dừng NGH Bot v2", { signal });
  await app.lifecycle.stop(app.logger);
  process.exit(0);
}
process.on("SIGINT", () => void shutdown("SIGINT"));
process.on("SIGTERM", () => void shutdown("SIGTERM"));
process.on("uncaughtException", (error) => { app.logger.error("Lỗi ngoài kiểm soát", { error: error.stack }); void shutdown("uncaughtException"); });
process.on("unhandledRejection", (error) => { app.logger.error("Promise ngoài kiểm soát", { error: error?.stack || String(error) }); void shutdown("unhandledRejection"); });
