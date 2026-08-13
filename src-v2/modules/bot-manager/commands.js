import { Permission } from "../../core/permissions.js";
import { isGroupChatLocked, normalizeGroupLink } from "../autojoin/service.js";

function formatRemaining(value) {
  if (value === -1) return "vô thời hạn";
  if (!Number.isFinite(Number(value)) || Number(value) <= 0) return "hết hạn";
  const days = Math.floor(Number(value) / 86_400_000);
  const hours = Math.floor((Number(value) % 86_400_000) / 3_600_000);
  return `${days} ngày ${hours} giờ`;
}

export function registerBotManagerCommands(registry, { fleet, identity }) {
  registry.register({
    name: "mybot",
    permission: Permission.LEADER,
    description: "Quản lý bot mẹ và bot con",
    async execute({ args, reply }) {
      if (!identity.isMain) {
        await reply("Lệnh này chỉ chạy trên bot mẹ.");
        return;
      }
      const action = String(args[0] || "help").toLowerCase();
      if (action === "help") {
        await reply([
          "QUẢN LÝ BOT V2",
          "• !mybot list",
          "• !mybot active <index>",
          "• !mybot shutdown <index>",
          "• !mybot restart <index>",
          "• !mybot blockcmd|unblockcmd <index> <lệnh>",
          "• !mybot gjoin <index> <link>",
          "• !mybot gleave <index> [groupId]",
          "• !mybot notify <nội dung>",
        ].join("\n"));
        return;
      }
      if (action === "list") {
        const children = fleet.listChildren();
        const lines = children.map((bot) =>
          `#${bot.index} ${bot.name} — ${bot.status} — ${formatRemaining(bot.timeRemaining)}`
        );
        await reply([`Danh sách bot con (${children.length})`, ...lines].join("\n"));
        return;
      }
      if (action === "notify") {
        const text = args.slice(1).join(" ").trim();
        if (!text) { await reply("Dùng: !mybot notify <nội dung>"); return; }
        const main = fleet.list().find((bot) => bot.identity.isMain);
        const results = await Promise.allSettled(fleet.listChildren().map((bot) => main.client.sendText(bot.ownerId, 0, `📢 Thông báo từ NGH Bot:\n${text.slice(0, 1800)}`)));
        await reply(`Đã gửi ${results.filter((item) => item.status === "fulfilled").length}/${results.length} khách thuê.`);
        return;
      }
      if (["blockcmd", "unblockcmd"].includes(action)) {
        const ownerId = fleet.resolveOwner(args[1]);
        const command = registry.resolve(args[2]);
        if (!ownerId || !command) { await reply("Dùng: !mybot blockcmd|unblockcmd <index> <lệnh>"); return; }
        if (["thuebot", "mybot"].includes(command.name)) { await reply("Không thể chặn lệnh cốt lõi này."); return; }
        const config = fleet.botStore.get(ownerId) || {};
        const blocked = new Set((config.notAllowedCommands || config.notAllowedCommand || []).map((value) => String(value).toLowerCase()));
        if (action === "blockcmd") blocked.add(command.name); else blocked.delete(command.name);
        await fleet.botStore.patch(ownerId, { notAllowedCommands: [...blocked].sort() });
        await reply(`Đã ${action === "blockcmd" ? "chặn" : "bỏ chặn"} ${command.name} trên bot #${args[1]}.`);
        return;
      }
      if (action === "gjoin") {
        const ownerId = fleet.resolveOwner(args[1]);
        const bot = ownerId && fleet.getByOwner(ownerId);
        const link = normalizeGroupLink(args[2]);
        if (!bot || !link) { await reply("Dùng: !mybot gjoin <index> <link nhóm>"); return; }
        const info = await bot.client.api.getGroupInfoByLink(link);
        if (isGroupChatLocked(info)) { await reply("Không join vì nhóm đang khóa chat."); return; }
        await bot.client.api.joinGroup(link);
        await reply(`Bot #${args[1]} đã gửi yêu cầu tham gia.`);
        return;
      }
      if (action === "gleave") {
        const ownerId = fleet.resolveOwner(args[1]);
        const bot = ownerId && fleet.getByOwner(ownerId);
        const groupId = args[2];
        if (!bot || !groupId) { await reply("Dùng: !mybot gleave <index> <groupId>"); return; }
        await bot.client.api.leaveGroup(groupId, true);
        await reply(`Bot #${args[1]} đã rời nhóm ${groupId}.`);
        return;
      }
      if (!["active", "shutdown", "restart"].includes(action)) {
        await reply("Thao tác không hợp lệ. Dùng !mybot help");
        return;
      }
      const ownerId = fleet.resolveOwner(args[1]);
      if (!ownerId) {
        await reply("Index hoặc owner bot không hợp lệ.");
        return;
      }
      if (action === "active") {
        const result = await fleet.startChild(ownerId);
        await reply(result.started ? `Đã bật bot #${args[1]}.` : `Không thể bật bot: ${result.reason}`);
        return;
      }
      if (action === "shutdown") {
        const stopped = await fleet.stopChild(ownerId);
        await reply(stopped ? `Đã tắt bot #${args[1]}.` : "Bot hiện không chạy.");
        return;
      }
      await fleet.stopChild(ownerId);
      const result = await fleet.startChild(ownerId);
      await reply(result.started ? `Đã khởi động lại bot #${args[1]}.` : `Khởi động lại thất bại: ${result.reason}`);
    },
  });

  registry.register({
    name: "event.sendmsg", permission: Permission.LEADER, cooldownMs: 0,
    description: "Yêu cầu mọi bot con đang chạy gửi tin vào nhóm hiện tại",
    async execute({ args, message, threadId, type, reply }) {
      if (!identity.isMain) { await reply("Lệnh này chỉ chạy trên bot mẹ."); return; }
      if (type !== 1) { await reply("Lệnh này chỉ dùng trong nhóm."); return; }
      const shouldTag = args.at(-1)?.toLowerCase() === "tag";
      const text = args.slice(0, shouldTag ? -1 : undefined).join(" ").trim().slice(0, 1_800);
      if (!text) { await reply("Dùng: !event.sendmsg <nội dung> [tag]"); return; }
      const children = fleet.list().filter((item) => !item.identity.isMain);
      const senderName = message?.data?.dName || "Bot Leader";
      const results = await Promise.allSettled(children.map(({ client, identity: childIdentity }) => {
        let msg = text; let mentions;
        if (shouldTag && childIdentity.ownerId) {
          const label = `@${senderName}`; msg += ` ${label}`;
          mentions = [{ uid: String(childIdentity.ownerId), pos: text.length + 1, len: label.length }];
        }
        return client.api.sendMessage({ msg, mentions }, threadId, 1);
      }));
      const success = results.filter((item) => item.status === "fulfilled").length;
      await reply(`event.sendmsg: ${success}/${children.length} bot con đã gửi tin; thất bại ${children.length - success}.`);
    },
  });
}
