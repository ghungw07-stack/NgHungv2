import { Permission } from "../../core/permissions.js";

export function registerConversationCommands(registry, { client }) {
  registry.register({
    name: "gim", aliases: ["pinchat"], permission: Permission.ADMIN, description: "Ghim hoặc bỏ ghim cuộc trò chuyện",
    async execute({ args, threadId, type, reply }) {
      const action = args[0]?.toLowerCase() || "on";
      if (!["on", "off"].includes(action)) { await reply("Dùng: !gim on|off"); return; }
      await client.api.setPinnedConversations(action === "on", threadId, type);
      await reply(`Đã ${action === "on" ? "ghim" : "bỏ ghim"} cuộc trò chuyện.`);
    },
  });
  registry.register({
    name: "gimtn", aliases: ["pinmsg"], permission: Permission.ADMIN, description: "Ghim tin nhắn đang reply trong nhóm",
    async execute({ message, threadId, type, reply }) {
      if (type !== 1 || !message?.data?.quote) { await reply("Hãy reply tin cần ghim trong nhóm rồi dùng !gimtn"); return; }
      await client.api.pinGroupMsg(message.data.quote, threadId);
      await reply("Đã ghim tin nhắn.");
    },
  });
  registry.register({
    name: "thongbao", permission: Permission.ADMIN, description: "Bật hoặc tắt thông báo cuộc trò chuyện",
    async execute({ args, threadId, type, reply }) {
      const enabled = args[0]?.toLowerCase() !== "off";
      await client.api.setMute({ duration: -1, action: enabled ? 3 : 1 }, threadId, type);
      await reply(`Đã ${enabled ? "bật" : "tắt"} thông báo.`);
    },
  });
}
