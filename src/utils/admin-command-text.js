// Reply mentions can carry offsets relative to the quoted caption on Zalo.
// Recover only an explicit admin command following a leading reply mention.
export function getReplyAdminCommandText(message, prefix) {
  const raw = message.data?.content;
  if (typeof raw !== "string" || !prefix || !message.data?.quote) return null;
  const escaped = prefix.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const command = new RegExp(`(?:^|\\s)${escaped}(?:add|remove)\\s+admin(?=\\s|$)`, "iu");
  const match = command.exec(raw);
  if (!match) return null;
  const before = raw.slice(0, match.index).trim();
  if (before && (!before.startsWith("@") || /[\r\n]/u.test(before))) return null;
  return raw.slice(match.index).trim();
}
