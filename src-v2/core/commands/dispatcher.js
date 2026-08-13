export class CommandDispatcher {
  constructor({ prefix, prefixResolver, registry, permissions, logger }) {
    Object.assign(this, { prefix, prefixResolver, registry, permissions, logger });
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
    if (!this.permissions.allows(command.permission, context.senderId)) {
      await context.reply("Bạn không có quyền sử dụng lệnh này.");
      return true;
    }
    try {
      await command.execute({ ...context, args: parsed.args, command });
    } catch (error) {
      this.logger.error("Command thất bại", { command: command.name, error: error.stack || error.message });
      await context.reply("Lệnh gặp lỗi trong lúc xử lý.");
    }
    return true;
  }
}
