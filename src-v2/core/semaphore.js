export class Semaphore {
  #active = 0;
  #waiting = [];
  constructor(limit = 2, maxQueue = 20) {
    this.limit = limit;
    this.maxQueue = maxQueue;
  }
  async run(task) {
    if (this.#active >= this.limit) {
      if (this.#waiting.length >= this.maxQueue) throw new Error("Hàng đợi tác vụ đã đầy");
      await new Promise((resolve) => this.#waiting.push(resolve));
    }
    this.#active++;
    try { return await task(); }
    finally {
      this.#active--;
      this.#waiting.shift()?.();
    }
  }
  get stats() { return { active: this.#active, waiting: this.#waiting.length }; }
}
