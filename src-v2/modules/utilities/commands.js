function targetIds(message, args) {
  const mentions = (message?.data?.mentions || []).map((item) => String(item.uid));
  const raw = args.filter((item) => /^\d{6,}$/.test(item)).map(String);
  return [...new Set([...mentions, ...raw])];
}

export function registerUtilityCommands(registry, { client }) {
  registry.register({
    name: "uid",
    description: "Xem UID của bạn hoặc người được tag",
    async execute({ message, args, senderId, reply }) {
      const ids = targetIds(message, args);
      await reply((ids.length ? ids : [senderId]).map((id, index) => `${index + 1}. ${id}`).join("\n"));
    },
  });
  registry.register({
    name: "userinfo",
    aliases: ["info"],
    description: "Xem thông tin tài khoản Zalo",
    async execute({ message, args, senderId, reply }) {
      const id = targetIds(message, args)[0] || senderId;
      const response = await client.api.getInfoMembers([id]);
      const profile = response?.profiles?.[id] || Object.values(response?.profiles || {})[0];
      if (!profile) { await reply("Không lấy được thông tin người dùng."); return; }
      await reply([
        "THÔNG TIN NGƯỜI DÙNG",
        `Tên: ${profile.displayName || profile.zaloName || profile.dName || "Không rõ"}`,
        `UID: ${id}`,
        profile.gender != null ? `Giới tính: ${profile.gender}` : null,
        profile.sdob ? `Ngày sinh: ${profile.sdob}` : null,
      ].filter(Boolean).join("\n"));
    },
  });
}
