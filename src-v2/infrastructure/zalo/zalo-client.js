import { Zalo } from "../../../src/api-zalo/index.js";

function platformType(value) {
  return String(value || "web").toLowerCase() === "pc" ? 24 : 30;
}

export class ZaloClient {
  #zalo;
  #api;
  constructor(config, logger) {
    this.config = config;
    this.logger = logger;
  }
  async start() {
    this.#zalo = new Zalo(
      { cookie: this.config.cookie, imei: this.config.imei, userAgent: this.config.userAgent },
      { selfListen: true, typeLogin: platformType(this.config.infoOwner?.typePlatform), apiVersion: Zalo.API_VERSION, showLogs: false }
    );
    this.#api = await this.#zalo.login();
    const profile = await this.#api.getProfileMe();
    const rawProfile = profile?.profile || profile || {};
    this.#api.accountInfo = {
      ...rawProfile,
      uid: rawProfile.userId || this.#api.getBotId(),
      name: rawProfile.zaloName || rawProfile.displayName || rawProfile.name || String(this.#api.getBotId()),
      avatar: rawProfile.avatarFull || rawProfile.avatar || rawProfile.avatarUrl || "",
    };
    this.logger.info("Đã đăng nhập Zalo", { botId: this.botId });
    return this;
  }
  get api() { return this.#api; }
  get botId() { return this.#api?.getBotId(); }
  on(event, handler) { this.#api.listener.on(event, handler); }
  listen() { this.#api.listener.start(); }
  async sendText(threadId, type, text) { return this.#api.sendMessage({ msg: String(text) }, threadId, type); }
  async stop() { this.#api?.listener?.stop(); this.#api = null; this.#zalo = null; }
}
