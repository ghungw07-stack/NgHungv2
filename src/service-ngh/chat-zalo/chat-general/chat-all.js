import { removeMention } from "../../../utils/format-util.js";
import { getGlobalPrefix } from "../../service.js";
import { sendMessageWarningRequest } from "../chat-style/chat-style.js";

export async function chatAll(api, message, groupInfo, aliasCommand) {
  const content = removeMention(message);
  const prefix = getGlobalPrefix(api.getBotId());
  const threadId = message.threadId;
  const chatMessage = content.replace(`${prefix}${aliasCommand}`, "").trim();
  const [contentTag, , , ttl = 0] = chatMessage.split("|");
  const countTag = 1;
  const delayTag = 0;

  if (chatMessage) {
    for (let i = 0; i < countTag; i++) {
      // Mobile nhận tag-all ổn định khi marker hiện hữu và dùng UID -1.
      const taggedMessage = `${contentTag.trim()}\n@All`;
      const allMentions = [
        { pos: taggedMessage.length - 4, uid: -1, len: 4, type: 1 },
      ];
      await api.sendMessage(
        { msg: taggedMessage, mentions: allMentions, ttl },
        threadId,
        message.type
      );
      await new Promise(resolve => setTimeout(resolve, delayTag));
    }
  } else {
    const object = {
      caption:
        `Hướng dẫn dùng lệnh tag all:\n` +
        `Cách Dùng:\n${prefix}${aliasCommand} <nội_dung>\n` +
        `Ví Dụ: ${prefix}${aliasCommand} Mọi người chú ý`,
    };
    await sendMessageWarningRequest(api, message, object, 30000);
  }
}
