import { Permission } from "../../core/permissions.js";

function requireGroup(type) {
  if (type !== 1) throw new Error("Lệnh này chỉ sử dụng trong nhóm");
}

function targetsFrom(message, args) {
  const mentions = (message?.data?.mentions || []).map((mention) => String(mention.uid));
  const ids = args.filter((value) => /^\d{6,}$/.test(value)).map(String);
  return [...new Set([...mentions, ...ids])];
}

export function registerGroupCommands(registry, { groups, client }) {
  registry.register({
    name: "groupinfo",
    aliases: ["grinfo"],
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
}
