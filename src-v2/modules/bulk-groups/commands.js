import { Permission } from "../../core/permissions.js";
import { groupIdsFromList } from "../groups/commands.js";
import { isGroupChatLocked } from "../autojoin/service.js";

function mentioned(message, args = []) {
  return String(message?.data?.mentions?.[0]?.uid || message?.data?.mentions?.[0]?.id || args.find((value) => /^\d{6,}$/.test(value)) || "");
}

function exactConfirmation(args, id) { return args[0]?.toLowerCase() === "confirm" && String(args[1]) === String(id); }

async function allGroupInfo(api) {
  const ids = groupIdsFromList(await api.getAllGroups());
  const rows = [];
  for (let index = 0; index < ids.length; index += 20) {
    const response = await api.getGroupInfo(ids.slice(index, index + 20));
    const map = response?.gridInfoMap || response?.data?.gridInfoMap || {};
    rows.push(...Object.entries(map).map(([id, value]) => ({ id, ...value })));
  }
  return rows;
}

export function registerBulkGroupCommands(registry, { client, groups }) {
  registry.register({
    name: "scangroups", aliases: ["scgr"], permission: Permission.LEADER, cooldownMs: 30_000, description: "Quét danh sách nhóm bot",
    async execute({ args, reply }) {
      const query = args.join(" ").trim().toLowerCase(); const rows = await allGroupInfo(client.api);
      const filtered = query ? rows.filter((row) => String(row.name || "").toLowerCase().includes(query)) : rows;
      await reply([`KẾT QUẢ QUÉT NHÓM (${filtered.length}/${rows.length})`, ...filtered.slice(0, 40).map((row, index) => `${index + 1}. ${row.name || "Không tên"} — ${row.id} — ${row.memVerList?.length || row.totalMember || 0} thành viên${isGroupChatLocked(row) ? " — khóa chat" : ""}`)].join("\n"));
    },
  });
  registry.register({
    name: "leavelock", permission: Permission.LEADER, cooldownMs: 30_000, description: "Rời các nhóm đang khóa chat",
    async execute({ args, reply }) {
      const rows = (await allGroupInfo(client.api)).filter(isGroupChatLocked);
      if (args[0]?.toLowerCase() !== "confirm") { await reply(`Có ${rows.length} nhóm khóa chat. Xác nhận: !leavelock confirm`); return; }
      if (rows.length) await client.api.leaveGroup(rows.map((row) => row.id), true);
      await reply(`Đã rời ${rows.length} nhóm khóa chat.`);
    },
  });
  registry.register({
    name: "leaveall", permission: Permission.LEADER, cooldownMs: 60_000, description: "Rời toàn bộ nhóm",
    async execute({ args, reply }) {
      const ids = groupIdsFromList(await client.api.getAllGroups());
      if (!exactConfirmation(args, client.botId)) { await reply(`Thao tác sẽ rời ${ids.length} nhóm. Xác nhận: !leaveall confirm ${client.botId}`); return; }
      if (ids.length) await client.api.leaveGroup(ids, true); await reply(`Đã rời ${ids.length} nhóm.`);
    },
  });
  registry.register({
    name: "kickall", permission: Permission.LEADER, cooldownMs: 60_000, description: "Xóa toàn bộ thành viên thường khỏi nhóm",
    async execute({ args, threadId, type, reply }) {
      if (type !== 1) { await reply("Lệnh này chỉ dùng trong nhóm."); return; }
      const info = await groups.info(threadId); const protectedIds = new Set([String(client.botId), info.creatorId, ...info.adminIds]);
      const targets = info.memberIds.filter((id) => !protectedIds.has(id));
      if (!exactConfirmation(args, threadId)) { await reply(`Sẽ xóa ${targets.length} thành viên thường. Xác nhận: !kickall confirm ${threadId}`); return; }
      for (let index = 0; index < targets.length; index += 20) await client.api.removeUserFromGroup(threadId, targets.slice(index, index + 20));
      groups.invalidate(threadId); await reply(`Đã xử lý ${targets.length} thành viên.`);
    },
  });
  registry.register({
    name: "inviteall", aliases: ["addall"], permission: Permission.LEADER, cooldownMs: 60_000, description: "Mời toàn bộ bạn bè vào nhóm",
    async execute({ args, threadId, type, reply }) {
      if (type !== 1) { await reply("Lệnh này chỉ dùng trong nhóm."); return; }
      if (!exactConfirmation(args, threadId)) { await reply(`Xác nhận: !inviteall confirm ${threadId}`); return; }
      const response = await client.api.getAllFriends();
      const profiles = response?.profiles || response?.data?.profiles || response || [];
      const ids = (Array.isArray(profiles) ? profiles : Object.values(profiles)).map((row) => String(row.userId || row.uid || row.id || "")).filter(Boolean).slice(0, 500);
      for (let index = 0; index < ids.length; index += 20) await client.api.addUserToGroup(threadId, ids.slice(index, index + 20));
      await reply(`Đã gửi lời mời tới ${ids.length} bạn bè.`);
    },
  });
  registry.register({
    name: "dispersegroup", aliases: ["giaitan"], permission: Permission.LEADER, description: "Giải tán nhóm hiện tại",
    async execute({ args, threadId, type, reply }) {
      if (type !== 1 || !exactConfirmation(args, threadId)) { await reply(`Xác nhận giải tán bằng: !dispersegroup confirm ${threadId}`); return; }
      await client.api.disperseGroup(threadId);
    },
  });
  registry.register({
    name: "upgradecommunity", aliases: ["nangcd"], permission: Permission.LEADER, description: "Nâng nhóm thành cộng đồng",
    async execute({ args, threadId, type, reply }) {
      if (type !== 1 || !exactConfirmation(args, threadId)) { await reply(`Xác nhận bằng: !upgradecommunity confirm ${threadId}`); return; }
      await client.api.upgradeGroupToCommunity(threadId); await reply("Đã gửi yêu cầu nâng cấp cộng đồng.");
    },
  });
  registry.register({
    name: "blockfeed", permission: Permission.ADMIN, description: "Chặn hoặc bỏ chặn người dùng xem feed",
    async execute({ args, message, reply }) {
      const action = args[0]?.toLowerCase(); const id = mentioned(message, args.slice(1));
      if (!["on", "off"].includes(action) || !id) { await reply("Dùng: !blockfeed on|off @người"); return; }
      await client.api.blockViewFeed(action === "on", id); await reply(`Đã ${action === "on" ? "chặn" : "bỏ chặn"} feed với ${id}.`);
    },
  });
  registry.register({
    name: "unreadmark", aliases: ["chuadoc"], permission: Permission.ADMIN, description: "Đánh dấu cuộc trò chuyện chưa đọc",
    async execute({ args, threadId, type, reply }) {
      await client.api.addUnreadMark(args[0] || threadId, (args[1] || (type === 1 ? "group" : "user")).toLowerCase() === "group" ? 1 : 0); await reply("Đã đánh dấu chưa đọc.");
    },
  });
  registry.register({
    name: "deletemessage", aliases: ["delmsg", "del"], permission: Permission.ADMIN, description: "Xóa tin nhắn đang reply",
    async execute({ message, threadId, type, reply }) {
      const quote = message?.data?.quote; if (!quote) { await reply("Hãy reply tin cần xóa."); return; }
      await client.api.deleteMessage({ data: quote, threadId, type }, false); await reply("Đã xóa tin nhắn.");
    },
  });
  registry.register({
    name: "deletechat", aliases: ["delchat"], permission: Permission.LEADER, description: "Xóa lịch sử cuộc trò chuyện phía bot",
    async execute({ args, message, threadId, type, reply }) {
      if (!exactConfirmation(args, threadId) || !message?.data?.quote) { await reply(`Reply tin cuối và xác nhận: !deletechat confirm ${threadId}`); return; }
      const quote = message.data.quote; await client.api.deleteChat({ ownerId: quote.uidFrom || quote.ownerId, cliMsgId: quote.cliMsgId, globalMsgId: quote.msgId || quote.globalMsgId }, threadId, type); await reply("Đã xóa lịch sử cuộc trò chuyện phía bot.");
    },
  });
}

export { exactConfirmation, allGroupInfo };
