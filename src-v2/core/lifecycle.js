export class Lifecycle {
  #resources = [];
  #stopping = false;

  add(name, stop) {
    if (typeof stop !== "function") throw new TypeError(`Resource ${name} must provide a stop function`);
    this.#resources.push({ name, stop });
    return stop;
  }

  async stop(logger) {
    if (this.#stopping) return;
    this.#stopping = true;
    for (const resource of this.#resources.reverse()) {
      try {
        await resource.stop();
      } catch (error) {
        logger?.error("Không thể dừng tài nguyên", { resource: resource.name, error: error.message });
      }
    }
    this.#resources = [];
  }
}
