export class TaskQueue {
  #active = 0;
  #pending = [];
  #closed = false;
  constructor({ concurrency = 4, capacity = 100 } = {}) {
    this.concurrency = concurrency;
    this.capacity = capacity;
  }
  add(task) {
    if (this.#closed) return false;
    if (this.#pending.length >= this.capacity) return false;
    this.#pending.push(task);
    this.#drain();
    return true;
  }
  #drain() {
    if (this.#closed) return;
    while (this.#active < this.concurrency && this.#pending.length) {
      const task = this.#pending.shift();
      this.#active++;
      Promise.resolve().then(task).catch(() => {}).finally(() => { this.#active--; this.#drain(); });
    }
  }
  close() {
    this.#closed = true;
    const discarded = this.#pending.length;
    this.#pending.length = 0;
    return discarded;
  }
  get stats() { return { active: this.#active, pending: this.#pending.length, closed: this.#closed }; }
}
