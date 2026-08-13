import { Permission } from "../permissions.js";

export class CommandRegistry {
  #commands = new Map();
  register(command) {
    if (!command?.name || typeof command.execute !== "function") throw new TypeError("Command không hợp lệ");
    const names = [command.name, ...(command.aliases || [])].map((value) => value.toLowerCase());
    for (const name of names) {
      if (this.#commands.has(name)) throw new Error(`Trùng command: ${name}`);
      this.#commands.set(name, { permission: Permission.EVERYONE, ...command });
    }
    return this;
  }
  resolve(name) { return this.#commands.get(String(name).toLowerCase()); }
  list() { return [...new Map([...this.#commands.values()].map((cmd) => [cmd.name, cmd])).values()]; }
}
