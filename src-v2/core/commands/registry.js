import { Permission } from "../permissions.js";

export class CommandRegistry {
  #commands = new Map();
  #canonical = new Map();
  register(command) {
    if (!command?.name || typeof command.execute !== "function") throw new TypeError("Command không hợp lệ");
    const names = [command.name, ...(command.aliases || [])].map((value) => value.toLowerCase());
    const normalized = { permission: Permission.EVERYONE, cooldownMs: 0, ...command, aliases: command.aliases || [] };
    for (const name of names) {
      if (this.#commands.has(name)) throw new Error(`Trùng command: ${name}`);
      this.#commands.set(name, normalized);
    }
    this.#canonical.set(normalized.name.toLowerCase(), normalized);
    return this;
  }
  resolve(name) { return this.#commands.get(String(name).toLowerCase()); }
  list() { return [...this.#canonical.values()]; }
}
