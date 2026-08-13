export class FixedWindowRateLimiter {
  #entries = new Map();
  constructor({ limit, windowMs, maxKeys = 10_000 }) { Object.assign(this, { limit, windowMs, maxKeys }); }
  consume(key, now = Date.now()) {
    let entry = this.#entries.get(key);
    if (!entry || now - entry.startedAt >= this.windowMs) entry = { count: 0, startedAt: now };
    entry.count++;
    if (this.#entries.size >= this.maxKeys && !this.#entries.has(key)) this.#entries.delete(this.#entries.keys().next().value);
    this.#entries.set(key, entry);
    return { allowed: entry.count <= this.limit, remaining: Math.max(0, this.limit - entry.count), resetAt: entry.startedAt + this.windowMs };
  }
  clear() { this.#entries.clear(); }
}
