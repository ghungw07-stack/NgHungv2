export class CommandCooldowns {
  #entries = new Map();
  constructor({ maxEntries = 50_000 } = {}) { this.maxEntries = maxEntries; }

  consume(key, durationMs, now = Date.now()) {
    if (!durationMs) return { allowed: true, remainingMs: 0 };
    const expiresAt = this.#entries.get(key) || 0;
    if (expiresAt > now) return { allowed: false, remainingMs: expiresAt - now };
    if (this.#entries.size >= this.maxEntries) {
      for (const [entryKey, expiry] of this.#entries) {
        if (expiry <= now || this.#entries.size >= this.maxEntries) this.#entries.delete(entryKey);
        if (this.#entries.size < this.maxEntries) break;
      }
    }
    this.#entries.set(key, now + durationMs);
    return { allowed: true, remainingMs: 0 };
  }

  clear() { this.#entries.clear(); }
}
