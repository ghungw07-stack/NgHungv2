import os from "node:os";
import { Permission } from "../../core/permissions.js";

function targetIds(message, args = []) {
  return [...new Set([
    ...(message?.data?.mentions || []).map((item) => item.uid || item.id),
    ...args.filter((value) => /^\d{6,}$/.test(value)),
  ].filter(Boolean).map(String))];
}

async function editUserList(settings, scope, field, action, ids) {
  const current = await settings.get(scope);
  const values = new Set((current[field] || []).map(String));
  if (action === "add") for (const id of ids) values.add(id);
  if (action === "remove") for (const id of ids) values.delete(id);
  if (action === "clear") values.clear();
  await settings.patch(scope, { [field]: [...values], updatedAt: new Date() });
  return [...values];
}

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

  registry.register({
    name: "whitelist", aliases: ["wl"], permission: Permission.LEADER, cooldownMs: 1_000, description: "Miễn kiểm duyệt cho người dùng trong nhóm",
    async execute({ args, message, threadId, type, reply }) {
      if (type !== 1) { await reply("Lệnh này chỉ dùng trong nhóm."); return; }
      const action = args[0]?.toLowerCase();
      const ids = targetIds(message, args.slice(1));
      if (!action || action === "list") {
        const value = await settings.get(threadId);
        await reply(`Whitelist nhóm (${(value.whitelistedUsers || []).length}):\n${(value.whitelistedUsers || []).join("\n") || "Trống"}`); return;
      }
      if (!["add", "remove", "clear"].includes(action) || (action !== "clear" && !ids.length)) {
        await reply("Dùng: !whitelist add|remove @tag|UID; list; clear"); return;
      }
      const values = await editUserList(settings, threadId, "whitelistedUsers", action, ids);
      await reply(`Đã cập nhật whitelist. Hiện có ${values.length} người.`);
    },
  });

  registry.register({
    name: "blockbot", aliases: ["listblockbot", "unblockbot"], permission: Permission.LEADER, cooldownMs: 1_000, description: "Chặn người dùng sử dụng tài khoản bot ở mọi nơi",
    async execute({ args, message, reply }) {
      const action = args[0]?.toLowerCase(); const ids = targetIds(message, args.slice(1)); const scope = "__global__";
      if (!action || action === "list") {
        const value = await settings.get(scope);
        await reply(`Danh sách blockbot (${(value.blockedUsers || []).length}):\n${(value.blockedUsers || []).join("\n") || "Trống"}`); return;
      }
      if (!["add", "remove", "clear"].includes(action) || (action !== "clear" && !ids.length)) { await reply("Dùng: !blockbot add|remove @tag|UID; list; clear"); return; }
      const values = await editUserList(settings, scope, "blockedUsers", action, ids);
      await reply(`Đã cập nhật blockbot. Hiện có ${values.length} người.`);
    },
  });

  registry.register({
    name: "privatebot", permission: Permission.LEADER, cooldownMs: 1_000, description: "Bật hoặc tắt lệnh bot trong tin nhắn riêng",
    async execute({ args, message, senderId, type, reply }) {
      const scope = "__global__"; const action = args[0]?.toLowerCase(); const current = await settings.get(scope);
      const accepted = new Set((current.acceptedPrivateUsers || []).map(String));
      if (action === "list") { await reply(`Danh sách ưu tiên phản hồi riêng (${accepted.size}):\n${[...accepted].join("\n") || "Trống"}`); return; }
      if (!["add", "remove"].includes(action)) { await reply("Dùng: !privatebot add|remove [@mention] hoặc !privatebot list"); return; }
      const mentioned = (message?.data?.mentions || []).map((item) => String(item.uid || item.id)).filter(Boolean);
      const targets = type === 1 ? mentioned : [String(senderId)];
      if (!targets.length) { await reply("Vui lòng đề cập người dùng cần thêm/xóa trong danh sách phản hồi tin nhắn riêng."); return; }
      for (const id of targets) action === "add" ? accepted.add(id) : accepted.delete(id);
      await settings.patch(scope, { acceptedPrivateUsers: [...accepted], updatedAt: new Date() });
      await reply(`Đã ${action === "add" ? "thêm" : "xóa"} ${targets.length} người ${action === "add" ? "vào" : "khỏi"} danh sách ưu tiên phản hồi riêng.`);
    },
  });
}

export { targetIds, editUserList };
