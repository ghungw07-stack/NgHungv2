import { Permission } from "../../core/permissions.js";
import { isGroupChatLocked, normalizeGroupLink } from "../autojoin/service.js";

function requireGroup(type) {
  if (type !== 1) throw new Error("Lệnh này chỉ sử dụng trong nhóm");
}

function targetsFrom(message, args) {
  const mentions = (message?.data?.mentions || []).map((mention) => String(mention.uid));
  const ids = args.filter((value) => /^\d{6,}$/.test(value)).map(String);
  return [...new Set([...mentions, ...ids])];
}

function groupIdsFromList(response) {
  const maps = [response?.gridVerMap, response?.data?.gridVerMap, response?.gridInfoMap, response?.data?.gridInfoMap];
  const map = maps.find((value) => value && typeof value === "object") || {};
  return Object.keys(map);
}

export function registerGroupCommands(registry, { groups, client }) {
  registry.register({
    name: "groupinfo",
    aliases: ["grinfo", "group", "infogr", "gr"],
    description: "Xem thông tin nhóm",
    async execute({ args, threadId, type, reply }) {
      const groupId = args[0] || (type === 1 ? threadId : null);
      if (!groupId) { await reply("Hãy nhập ID nhóm."); return; }
      const info = await groups.info(groupId);
      await reply([
        "THÔNG TIN NHÓM",
        `Tên: ${info.name}`,
        `ID: ${info.id}`,
        `Thành viên: ${info.memberCount}`,
        `Trưởng nhóm: ${info.creatorId || "Không rõ"}`,
        `Quản trị viên: ${info.adminIds.length}`,
        info.description ? `Mô tả: ${info.description}` : null,
      ].filter(Boolean).join("\n"));
    },
  });

  for (const [name, method, success] of [
    ["kick", "removeUserFromGroup", "Đã xóa thành viên khỏi nhóm"],
    ["block", "blockUsers", "Đã chặn thành viên trong nhóm"],
    ["unblock", "unblockUsers", "Đã bỏ chặn thành viên trong nhóm"],
  ]) {
    registry.register({
      name,
      permission: Permission.ADMIN,
      description: `${success} bằng mention hoặc UID`,
      async execute({ args, message, threadId, type, reply }) {
        requireGroup(type);
        const targets = targetsFrom(message, args);
        if (!targets.length) { await reply(`Hãy tag hoặc nhập UID người cần ${name}.`); return; }
        const info = await groups.info(threadId);
        const protectedIds = new Set([String(client.botId), info.creatorId, ...info.adminIds]);
        const allowed = method === "unblockUsers" ? targets : targets.filter((id) => !protectedIds.has(id));
        if (!allowed.length) { await reply("Không thể thao tác với bot hoặc quản trị viên nhóm."); return; }
        const result = await client.api[method](threadId, allowed);
        const failed = result?.errorMembers?.length || 0;
        groups.invalidate(threadId);
        await reply(`${success}: ${allowed.length - failed}/${allowed.length}.`);
      },
    });
  }

  registry.register({
    name: "join", permission: Permission.LEADER, cooldownMs: 10_000,
    description: "Tham gia nhóm bằng link Zalo nếu nhóm không khóa chat",
    async execute({ args, reply }) {
      const link = normalizeGroupLink(args.join(" "));
      if (!link) { await reply("Dùng: !join <link nhóm Zalo>"); return; }
      const info = await client.api.getGroupInfoByLink(link);
      if (isGroupChatLocked(info)) { await reply("Không tham gia vì nhóm đang khóa chat."); return; }
      await client.api.joinGroup(link);
      await reply("Đã gửi yêu cầu tham gia nhóm.");
    },
  });

  registry.register({
    name: "leave", permission: Permission.LEADER, description: "Cho bot rời nhóm hiện tại",
    async execute({ args, threadId, type, reply }) {
      requireGroup(type);
      if (args[0]?.toLowerCase() !== "confirm") { await reply("Xác nhận bằng: !leave confirm"); return; }
      await reply("Bot sẽ rời nhóm.");
      await client.api.leaveGroup(threadId, true);
      groups.invalidate(threadId);
    },
  });

  registry.register({
    name: "listgroups", aliases: ["groups"], permission: Permission.LEADER, cooldownMs: 10_000,
    description: "Liệt kê các nhóm bot đang tham gia",
    async execute({ args, reply }) {
      const ids = groupIdsFromList(await client.api.getAllGroups());
      const pageSize = 20;
      const pages = Math.max(1, Math.ceil(ids.length / pageSize));
      const page = Math.min(Math.max(1, Number(args[0]) || 1), pages);
      const selected = ids.slice((page - 1) * pageSize, page * pageSize);
      await reply([`NHÓM ĐANG THAM GIA — ${page}/${pages} (${ids.length})`, ...selected.map((id, index) => `${(page - 1) * pageSize + index + 1}. ${id}`)].join("\n"));
    },
  });

  registry.register({
    name: "creategroup", permission: Permission.LEADER, cooldownMs: 30_000,
    description: "Tạo nhóm mới với người được tag hoặc UID",
    async execute({ content, prefix, message, reply }) {
      const raw = content.slice(prefix.length).trim().replace(/^\S+\s*/u, "");
      const [name, memberText = ""] = raw.split("|").map((value) => value.trim());
      const members = targetsFrom(message, memberText.split(/\s+/));
      if (!name || !members.length) { await reply("Dùng: !creategroup <tên nhóm> | <tag hoặc UID>"); return; }
      const result = await client.api.createGroup({ name: name.slice(0, 100), members });
      await reply(`Đã tạo nhóm “${name.slice(0, 100)}”${result?.groupId ? ` — ID: ${result.groupId}` : ""}.`);
    },
  });

  registry.register({
    name: "createpoll", aliases: ["poll"], permission: Permission.ADMIN, cooldownMs: 10_000,
    description: "Tạo bình chọn trong nhóm",
    async execute({ content, prefix, threadId, type, reply }) {
      requireGroup(type);
      const raw = content.slice(prefix.length).trim().replace(/^\S+\s*/u, "");
      const [question, ...options] = raw.split("|").map((value) => value.trim()).filter(Boolean);
      if (!question || options.length < 2) { await reply("Dùng: !createpoll Câu hỏi | Lựa chọn 1 | Lựa chọn 2"); return; }
      await client.api.createPoll({ question: question.slice(0, 300), options: options.slice(0, 10).map((value) => value.slice(0, 100)) }, threadId);
      await reply("Đã tạo bình chọn.");
    },
  });

  registry.register({
    name: "approve", permission: Permission.ADMIN, cooldownMs: 10_000,
    description: "Duyệt toàn bộ yêu cầu tham gia nhóm",
    async execute({ threadId, type, reply }) {
      requireGroup(type);
      await client.api.handleGroupPendingMembers(threadId, true);
      await reply("Đã xử lý danh sách thành viên chờ duyệt.");
    },
  });
}

export { groupIdsFromList };
