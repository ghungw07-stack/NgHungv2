import fs from "node:fs/promises";
import { CommandRegistry } from "../src-v2/core/commands/registry.js";
import { registerRuntimeCommands } from "../src-v2/app/register-commands.js";
import { compareCommandParity } from "../src-v2/tools/parity.js";

const data = JSON.parse(await fs.readFile(new URL("../assets/data/command.json", import.meta.url), "utf8"));
const noop = {};
const registry = new CommandRegistry();
registerRuntimeCommands(registry, {
  startedAt: Date.now(), scheduler: noop, runtimeStats: () => ({}), fleet: noop,
  identity: { isMain: true }, groupSettings: noop, groups: noop, client: noop, media: noop,
  content: noop, players: noop, bigGames: noop, gameSessions: noop, xiDach: noop,
  ai: noop, aiConversations: noop, botId: "audit", sourceUpdater: noop, paymentQr: noop,
  qr: noop, reminders: noop, messageArchive: noop, bankAccounts: noop, adminStore: noop,
});
const report = compareCommandParity(data.commands, registry);
console.log(`Legacy: ${report.legacyTotal}`);
console.log(`Đã chuyển đúng tên: ${report.canonical}`);
console.log(`Được bao phủ bằng alias: ${report.alias}`);
console.log(`Còn thiếu: ${report.missing.length}`);
console.log(report.missing.join("\n"));
