export class EventBus {
  #handlers = new Map();
  constructor(logger) { this.logger = logger; }
  on(event, name, handler, { priority = 0 } = {}) {
    if (typeof handler !== "function") throw new TypeError(`Event handler ${name} không hợp lệ`);
    const handlers = this.#handlers.get(event) || [];
    if (handlers.some((item) => item.name === name)) throw new Error(`Trùng event handler: ${event}:${name}`);
    handlers.push({ name, handler, priority });
    handlers.sort((a, b) => b.priority - a.priority);
    this.#handlers.set(event, handlers);
    return () => this.off(event, name);
  }
  off(event, name) {
    const handlers = this.#handlers.get(event) || [];
    const next = handlers.filter((item) => item.name !== name);
    this.#handlers.set(event, next);
    return next.length !== handlers.length;
  }
  async emit(event, context) {
    for (const entry of this.#handlers.get(event) || []) {
      try {
        const result = await entry.handler(context);
        if (result?.stop === true) return result;
      } catch (error) {
        this.logger.error("Event handler thất bại", { event, handler: entry.name, error: error.stack || error.message });
      }
    }
    return undefined;
  }
  count(event) { return (this.#handlers.get(event) || []).length; }
}
