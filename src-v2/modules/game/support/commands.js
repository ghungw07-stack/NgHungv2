import { Permission } from "../../../core/permissions.js";

const PLATFORMS = new Set(["apk", "ios", "pc", "java"]);
const EDIT_ACTIONS = new Set(["add", "remove", "set"]);
const defaults = () => ({ codes: [], web: "", platforms: {}, aliases: {} });
const unique = (values) => [...new Set(values.map(String).filter(Boolean))];

function resolveAction(config, action) {
  if (["code", "web", "alias", ...PLATFORMS].includes(action)) return action;
  for (const [canonical, values] of Object.entries(config.aliases || {})) if ((values || []).includes(action)) return canonical;
  return action;
}

async function save(settings, threadId, supportGame) {
  await settings.patch(threadId, { supportGame, updatedAt: new Date() });
}

export function registerSupportGameCommand(registry, { settings, media, client, accessControl }) {
  registry.register({
    name: "supportgame", category: "game", description: "Code, web và file tải game được cấu hình theo nhóm",
    async execute(context) {
      const { args, threadId, type, reply } = context;
      if (type !== 1) { await reply("Lệnh supportgame chỉ dùng trong nhóm."); return; }
      const group = await settings.get(threadId);
      const config = { ...defaults(), ...(group.supportGame || {}) };
      const action = resolveAction(config, String(args[0] || "").toLowerCase());
      const sub = String(args[1] || "").toLowerCase();
      const canEdit = Boolean(await accessControl?.allows?.(Permission.ADMIN, context.senderId, context));
      if (!action) {
        await reply(["HỖ TRỢ GAME", "• !supportgame code", "• !supportgame web", "• !supportgame apk|ios|pc|java", "Quản trị: thêm `add`, `remove`, hoặc `set` sau mục."].join("\n")); return;
      }
      if (EDIT_ACTIONS.has(sub) && !canEdit) { await reply("Bạn không có quyền thay đổi dữ liệu hỗ trợ game."); return; }
      if (action === "code") {
        const value = args.slice(2).join(" ").trim();
        if (sub === "add" && value) { config.codes = unique([...(config.codes || []), value]); await save(settings, threadId, config); await reply("Đã thêm code game."); return; }
        if (sub === "remove" && value) { config.codes = (config.codes || []).filter((item) => item !== value); await save(settings, threadId, config); await reply("Đã xóa code game."); return; }
        await reply(["CODE GAME", ...(config.codes || []).map((item, index) => `${index + 1}. ${item}`)].join("\n") || "Chưa có code game."); return;
      }
      if (action === "web") {
        if (["set", "add"].includes(sub)) { const value = args.slice(2).join(" ").trim(); if (!/^https?:\/\//iu.test(value)) { await reply("Web phải là URL HTTP/HTTPS."); return; } config.web = value; await save(settings, threadId, config); await reply("Đã cập nhật web game."); return; }
        await reply(config.web ? `Web game chính thức: ${config.web}` : "Chưa thiết lập web game."); return;
      }
      if (PLATFORMS.has(action)) {
        const value = args.slice(2).join(" ").trim(); const list = config.platforms[action] || [];
        if (sub === "add" && /^https?:\/\//iu.test(value)) { config.platforms = { ...config.platforms, [action]: unique([...list, value]) }; await save(settings, threadId, config); await reply(`Đã thêm file ${action}.`); return; }
        if (sub === "remove" && value) { config.platforms = { ...config.platforms, [action]: list.filter((item) => item !== value) }; await save(settings, threadId, config); await reply(`Đã xóa file ${action}.`); return; }
        if (!list.length) { await reply(`Chưa có file ${action}.`); return; }
        await reply([`FILE ${action.toUpperCase()}`, ...list.map((url, index) => `${index + 1}. ${url}`)].join("\n"));
        if (sub === "send") await media.sendUrl({ client, threadId, type, url: list[0], caption: `File ${action.toUpperCase()}` });
        return;
      }
      if (action === "alias") {
        const canonical = String(args[2] || "").toLowerCase(); const alias = String(args[3] || "").toLowerCase();
        if (["add", "remove"].includes(sub) && (!canonical || !alias || !["code", "web", ...PLATFORMS].includes(canonical))) { await reply("Dùng: !supportgame alias add|remove <code|web|apk|ios|pc|java> <alias>"); return; }
        if (sub === "add") config.aliases[canonical] = unique([...(config.aliases[canonical] || []), alias]);
        else if (sub === "remove") config.aliases[canonical] = (config.aliases[canonical] || []).filter((item) => item !== alias);
        else { await reply(["ALIAS SUPPORT GAME", ...Object.entries(config.aliases).map(([key, values]) => `${key}: ${values.join(", ")}`)].join("\n")); return; }
        await save(settings, threadId, config); await reply("Đã cập nhật alias support game."); return;
      }
      await reply("Mục hỗ trợ game không hợp lệ.");
    },
  });
}

export { resolveAction };
