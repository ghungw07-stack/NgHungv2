export class TaskQueue {
  #active = 0;
  #pending = [];
  constructor({ concurrency = 4, capacity = 100 } = {}) {
    this.concurrency = concurrency;
    this.capacity = capacity;
  }
  add(task) {
    if (this.#pending.length >= this.capacity) return false;
    this.#pending.push(task);
    this.#drain();
    return true;
  }
  #drain() {
    while (this.#active < this.concurrency && this.#pending.length) {
      const task = this.#pending.shift();
      this.#active++;
      Promise.resolve().then(task).catch(() => {}).finally(() => { this.#active--; this.#drain(); });
    }
  }
  get stats() { return { active: this.#active, pending: this.#pending.length }; }
}
