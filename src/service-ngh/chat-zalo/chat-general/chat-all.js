import { removeMention } from "../../../utils/format-util.js";
import { getGlobalPrefix } from "../../service.js";
import { sendMessageWarningRequest } from "../chat-style/chat-style.js";

export async function chatAll(api, message, groupInfo, aliasCommand) {
  const content = removeMention(message);
  const prefix = getGlobalPrefix(api.getBotId());
  const threadId = message.threadId;
  const botId = String(api.getBotId());
  // Tin được gửi bởi tài khoản bot, nên UID mention type 1 phải trùng ID bot gửi tin.
  const senderId = botId;
  const chatMessage = content.replace(`${prefix}${aliasCommand}`, "").trim();
  const [contentTag, , , ttl = 0] = chatMessage.split("|");
  const countTag = 1;
  const delayTag = 0;

  if (chatMessage) {
    for (let i = 0; i < countTag; i++) {
      // Ký tự zero-width giữ mention type 1 ở cuối tin mà không hiện chữ @ALL.
      const taggedMessage = `${contentTag.trim()}\u200B`;
      const allMentions = [
        { pos: taggedMessage.length, uid: senderId, len: 0, type: 1 },
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
