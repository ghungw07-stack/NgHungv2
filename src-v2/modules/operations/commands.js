import os from "node:os";
import { Permission } from "../../core/permissions.js";

export function registerOperationCommands(registry, { settings, adminStore, botId }) {
  registry.register({
    name: "settinggroup", aliases: ["stg", "listkey"], permission: Permission.ADMIN, description: "Xem cấu hình nhóm hiện tại",
    async execute({ threadId, type, reply }) {
      if (type !== 1) { await reply("Lệnh này chỉ dùng trong nhóm."); return; }
      const value = await settings.get(threadId);
      await reply([
        "CẤU HÌNH NHÓM V2", `Prefix: ${await settings.getPrefix(threadId)}`,
        `Bot: ${value.botEnabled === false ? "tắt" : "bật"}`, `Game: ${value.gamesEnabled === false ? "tắt" : "bật"}`,
        `Welcome/Bye: ${value.welcomeGroup ? "on" : "off"}/${value.byeGroup ? "on" : "off"}`,
        `Anti spam/link: ${value.antiSpam ? "on" : "off"}/${value.removeLinks ? "on" : "off"}`,
        `Lệnh bị tắt: ${(value.disabledCommands || []).join(", ") || "không có"}`,
      ].join("\n"));
    },
  });
  registry.register({
    name: "gameactive", permission: Permission.ADMIN, description: "Bật hoặc tắt game trong nhóm",
    async execute({ args, threadId, type, reply }) {
      if (type !== 1) { await reply("Lệnh này chỉ dùng trong nhóm."); return; }
      const current = await settings.get(threadId); const action = args[0]?.toLowerCase();
      const enabled = action === "on" ? true : action === "off" ? false : current.gamesEnabled === false;
      await settings.patch(threadId, { gamesEnabled: enabled }); await reply(`Game trong nhóm: ${enabled ? "bật" : "tắt"}.`);
    },
  });
  registry.register({
    name: "bot", permission: Permission.ADMIN, description: "Bật hoặc tắt phản hồi bot trong nhóm",
    async execute({ args, threadId, type, reply }) {
      if (type !== 1) { await reply("Lệnh này chỉ dùng trong nhóm."); return; }
      const action = args[0]?.toLowerCase(); if (!["on", "off"].includes(action)) { await reply("Dùng: !bot on|off"); return; }
      await settings.patch(threadId, { botEnabled: action === "on" }); await reply(`Bot trong nhóm: ${action === "on" ? "bật" : "tắt"}.`);
    },
  });
  registry.register({
    name: "manager", permission: Permission.ADMIN, description: "Xem các lệnh quản trị",
    async execute({ prefix, reply }) {
      const list = registry.list().filter((command) => command.permission !== "everyone");
      await reply(["LỆNH QUẢN TRỊ", ...list.slice(0, 30).map((command) => `• ${prefix}${command.name}`)].join("\n"));
    },
  });
  registry.register({
    name: "resource", aliases: ["rsrc", "showresource", "showrsrc"], permission: Permission.ADMIN, description: "Xem tài nguyên tiến trình",
    async execute({ reply }) {
      const memory = process.memoryUsage(); await reply([`RSS: ${(memory.rss / 1048576).toFixed(1)} MB`, `Heap: ${(memory.heapUsed / 1048576).toFixed(1)} MB`, `RAM trống: ${(os.freemem() / 1048576).toFixed(0)} MB`, `CPU: ${os.loadavg().map((v) => v.toFixed(2)).join(" / ")}`].join("\n"));
    },
  });
  registry.register({
    name: "reloadconfig", aliases: ["reloadcfg"], permission: Permission.LEADER, description: "Nạp lại admin và cache cấu hình",
    async execute({ reply }) { await adminStore.reload(); settings.clear(); await reply(`Đã nạp lại cấu hình cho bot ${botId}. Registry lệnh dùng bản source đang chạy.`); },
  });
}
