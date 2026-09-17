import { MessageType } from "../api-zalo/models/Message.js";

// Game accounts use a stable ID; Zalo mentions need the UID seen by this bot.
export function getGameMentionUid(message) {
  return String(message?.data?.gameUid || message?.data?.uidFrom || "");
}

export function gameMentionPlayer(api, message) {
  return {
    mentionUid: getGameMentionUid(message),
    name: String(message.data.dName || "Người chơi"),
    threadId: message.threadId,
    botId: api.getBotId(),
  };
}

// Build offsets while appending names, so duplicate names and emoji stay exact.
// A player part is { player, text? }; strings and nested arrays are literal text.
export function buildGamePlayerMessage(parts, { threadId, botId, type = MessageType.GroupMessage } = {}) {
  let msg = "";
  const mentions = [];
  function append(part) {
    if (Array.isArray(part)) {
      part.forEach(append);
      return;
    }
    if (part && typeof part === "object" && part.player) {
      const player = part.player;
      const name = String(part.text ?? player.name ?? player.playerName ?? "Người chơi");
      const uid = String(player.mentionUid ?? player.uid ?? "");
      const sameThread = threadId == null || player.threadId == null || String(player.threadId) === String(threadId);
      const sameBot = botId == null || player.botId == null || String(player.botId) === String(botId);
      if (type === MessageType.GroupMessage && sameThread && sameBot && name.length && uid && !["0", "-1"].includes(uid)) {
        mentions.push({ uid, pos: msg.length, len: name.length });
      }
      msg += name;
      return;
    }
    msg += String(part ?? "");
  }
  append(parts);
  return { msg, mentions };
}

export function gameSenderMessage(message, text) {
  if (message.type !== MessageType.GroupMessage) return { msg: text, mentions: [] };
  return buildGamePlayerMessage([
    { player: { mentionUid: getGameMentionUid(message), name: message.data.dName || "Người chơi" } },
    "\n", text,
  ]);
}
