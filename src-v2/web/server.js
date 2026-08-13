import express from "express";
import { createServer } from "node:http";
import { FixedWindowRateLimiter } from "../core/rate-limiter.js";
import { createBasicAuth, timingSafeEqual } from "./auth.js";

export class WebServer {
  constructor({ fleet, scheduler, payments, logger, port = Number(process.env.PORT || 3000), host = process.env.WEB_HOST || "0.0.0.0" }) {
    Object.assign(this, { fleet, scheduler, payments, logger, port, host });
    this.limiter = new FixedWindowRateLimiter({ limit: 30, windowMs: 60_000 });
  }
  async start() {
    const app = express();
    app.disable("x-powered-by");
    app.set("trust proxy", 1);
    app.use(express.json({ limit: "64kb" }));
    app.get("/health", (_req, res) => res.json({ status: "ok", uptime: process.uptime(), bots: this.fleet.list().length }));
    app.post("/api/payment-webhook", async (req, res) => {
      const ip = req.ip || req.socket.remoteAddress || "unknown";
      if (!this.limiter.consume(ip).allowed) return res.status(429).json({ success: false });
      const secret = process.env.WEBHOOK_SECRET;
      if (!secret) return res.status(503).json({ success: false, message: "Webhook chưa cấu hình" });
      const token = String(req.headers.authorization || "").replace(/^Apikey\s+/i, "").trim();
      if (!timingSafeEqual(token, secret)) return res.status(401).json({ success: false });
      try { return res.json(await this.payments.process(req.body || {})); }
      catch (error) { this.logger.error("Webhook thất bại", { error: error.message }); return res.status(400).json({ success: false, message: error.message }); }
    });
    const auth = createBasicAuth();
    app.get("/api/metrics", auth, (_req, res) => {
      const memory = process.memoryUsage();
      res.json({ bots: this.fleet.list().length, schedulerJobs: this.scheduler.size, memory, uptime: process.uptime() });
    });
    app.get("/api/bots", auth, (_req, res) => res.json(this.fleet.listChildren()));
    app.use((_req, res) => res.status(404).json({ success: false, message: "Not found" }));
    this.server = createServer(app);
    try {
      await new Promise((resolve, reject) => {
        this.server.once("error", reject);
        this.server.listen(this.port, this.host, resolve);
      });
    } catch (error) {
      this.server = null;
      throw error;
    }
    this.logger.info("Web v2 đã khởi động", { host: this.host, port: this.port });
  }
  async stop() {
    this.limiter.clear();
    if (!this.server) return;
    await new Promise((resolve, reject) => this.server.close((error) => error ? reject(error) : resolve()));
    this.server = null;
  }
}
