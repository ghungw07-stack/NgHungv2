export class TtlCache {
  #values = new Map();
  constructor({ ttlMs, maxSize = 10_000 }) {
    this.ttlMs = ttlMs;
    this.maxSize = maxSize;
  }
  has(key, now = Date.now()) {
    const expiresAt = this.#values.get(key);
    if (!expiresAt) return false;
    if (expiresAt <= now) { this.#values.delete(key); return false; }
    return true;
  }
  add(key, now = Date.now()) {
    if (this.#values.size >= this.maxSize) this.cleanup(now, Math.ceil(this.maxSize * 0.1));
    this.#values.set(key, now + this.ttlMs);
  }
  cleanup(now = Date.now(), minimum = 0) {
    let removed = 0;
    for (const [key, expiresAt] of this.#values) {
      if (expiresAt <= now || removed < minimum) { this.#values.delete(key); removed++; }
    }
    return removed;
  }
  get size() { return this.#values.size; }
  clear() { this.#values.clear(); }
}
