import { CommandCooldowns } from "./cooldowns.js";

export class CommandDispatcher {
  constructor({ prefix, prefixResolver, commandEnabledResolver, registry, permissions, logger, cooldowns = new CommandCooldowns() }) {
    Object.assign(this, { prefix, prefixResolver, commandEnabledResolver, registry, permissions, logger, cooldowns });
  }
  parse(content, prefix = this.prefix) {
    if (typeof content !== "string" || !content.startsWith(prefix)) return null;
    const tokens = content.slice(prefix.length).trim().split(/\s+/).filter(Boolean);
    if (!tokens.length) return null;
    return { name: tokens[0].toLowerCase(), args: tokens.slice(1) };
  }
  async dispatch(context) {
    const prefix = this.prefixResolver ? await this.prefixResolver(context) : this.prefix;
    const parsed = this.parse(context.content, prefix);
    if (!parsed) return false;
    const command = this.registry.resolve(parsed.name);
    if (!command) return false;
    if (this.commandEnabledResolver && !(await this.commandEnabledResolver(command.name, context))) {
      await context.reply("Lệnh này đang bị tắt trong nhóm.");
      return true;
    }
    if (!(await this.permissions.allows(command.permission, context.senderId, context))) {
      await context.reply("Bạn không có quyền sử dụng lệnh này.");
      return true;
    }
    const cooldown = this.cooldowns.consume(
      `${context.threadId || "private"}:${context.senderId}:${command.name}`,
      Number(command.cooldownMs) || 0,
    );
    if (!cooldown.allowed) {
      await context.reply(`Vui lòng chờ ${Math.ceil(cooldown.remainingMs / 1000)} giây trước khi dùng lại lệnh này.`);
      return true;
    }
    try {
      await command.execute({ ...context, args: parsed.args, command, prefix });
    } catch (error) {
      this.logger.error("Command thất bại", { command: command.name, error: error.stack || error.message });
      await context.reply("Lệnh gặp lỗi trong lúc xử lý.");
    }
    return true;
  }
}
