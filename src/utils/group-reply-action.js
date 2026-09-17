export function parseGroupReplyAction(content, prefix = "") {
  if (typeof content !== "string") return null;

  const input = content.trim();
  if (!input) return null;

  // Hỗ trợ cả cú pháp mới "1 leave" và cú pháp cũ "1 -> !leave".
  const match = input.match(/^(\d+)\s*->\s*(.+)$/s) || input.match(/^(\d+)\s+(.+)$/s);
  if (!match) return null;

  const index = Number(match[1]);
  const inputAction = match[2].trim();
  if (!Number.isSafeInteger(index) || !inputAction) return null;

  const action = prefix && !inputAction.startsWith(prefix) ? `${prefix}${inputAction}` : inputAction;
  return { index, action, inputAction };
}
