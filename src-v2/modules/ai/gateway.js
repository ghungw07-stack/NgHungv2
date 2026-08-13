import { Semaphore } from "../../core/semaphore.js";

export class AiGateway {
  constructor({ provider, concurrency = 2, maxQueue = 20 }) {
    this.provider = provider;
    this.semaphore = new Semaphore(concurrency, maxQueue);
  }

  get available() { return Boolean(this.provider?.available); }

  generate(request) {
    if (!this.available) throw new Error("AI chưa cấu hình GEMINI_API_KEY");
    return this.semaphore.run(() => this.provider.generate(request));
  }

  get stats() { return this.semaphore.stats; }
}
