import fs from "node:fs";
import path from "node:path";

export function removeBotReferences(value, ids) {
  if (Array.isArray(value)) return value.map((item) => removeBotReferences(item, ids));
  if (!value || typeof value !== "object") return value;
  const cleaned = {};
  for (const [key, child] of Object.entries(value)) {
    if (ids.has(String(key)) || [...ids].some((id) => String(key).startsWith(`${id}:`))) continue;
    cleaned[key] = removeBotReferences(child, ids);
  }
  return cleaned;
}

export async function purgeBotDataFiles(dataRoot, identifiers) {
  const ids = new Set(identifiers.filter(Boolean).map(String));
  if (ids.size === 0) return { changedFiles: [] };
  const dataDirectory = path.join(dataRoot, "data");
  const filenames = [
    "autojoin-queue.json",
    "bot_leader.json",
    "command.json",
    "group_settings.json",
    "join-leave-blocks.json",
    "list_admin.json",
    "live_group_counts.json",
  ];
  const changedFiles = [];
  for (const filename of filenames) {
    const target = path.join(dataDirectory, filename);
    let source;
    try {
      source = await fs.promises.readFile(target, "utf8");
    } catch (error) {
      if (error.code === "ENOENT") continue;
      throw error;
    }
    const parsed = JSON.parse(source);
    const cleaned = JSON.stringify(removeBotReferences(parsed, ids));
    if (cleaned === JSON.stringify(parsed)) continue;
    const temporary = `${target}.purge.tmp`;
    await fs.promises.writeFile(temporary, cleaned, "utf8");
    await fs.promises.rename(temporary, target);
    changedFiles.push(filename);
  }
  return { changedFiles };
}
