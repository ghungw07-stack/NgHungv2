export class Scheduler {
  #jobs = new Map();
  constructor(onError = (error, name) => console.error(`[scheduler:${name}]`, error)) { this.onError = onError; }

  every(name, intervalMs, handler) {
    if (this.#jobs.has(name)) throw new Error(`Scheduler job already exists: ${name}`);
    if (!Number.isSafeInteger(intervalMs) || intervalMs < 1000) throw new Error(`Invalid interval: ${intervalMs}`);
    let running = false;
    const timer = setInterval(async () => {
      if (running) return;
      running = true;
      try { await handler(); }
      catch (error) { this.onError(error, name); }
      finally { running = false; }
    }, intervalMs);
    timer.unref?.();
    this.#jobs.set(name, timer);
    return () => this.cancel(name);
  }

  cancel(name) {
    const timer = this.#jobs.get(name);
    if (!timer) return false;
    clearInterval(timer);
    this.#jobs.delete(name);
    return true;
  }

  stop() {
    for (const timer of this.#jobs.values()) clearInterval(timer);
    this.#jobs.clear();
  }

  get size() { return this.#jobs.size; }
}
