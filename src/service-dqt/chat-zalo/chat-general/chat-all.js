import { MessageStyle, MultiMsgStyle } from "../../../api-zalo/index.js";
import { removeMention } from "../../../utils/format-util.js";
import { getGroupAdmins } from "../../info-service/group-info.js";
import { getGlobalPrefix } from "../../service.js";
import { sendMessageWarningRequest } from "../chat-style/chat-style.js";

export async function chatAll(api, message, groupInfo, aliasCommand) {
  const content = removeMention(message);
  const prefix = getGlobalPrefix(api.getBotId());
  const threadId = message.threadId;
  const botId = api.getBotId();
  const chatMessage = content.replace(`${prefix}${aliasCommand}`, "").trim();
  const [contentTag, countTag = 1, delayTag = 1000, ttl = 0] = chatMessage.split("|");
  const groupAdmins = await getGroupAdmins(groupInfo);

  if (chatMessage) {
    for (let i = 0; i < countTag; i++) {
      if (!groupAdmins.includes(botId)) {
        let newChatMessage = contentTag;
        const mentions = groupInfo.memVerList.map((member, index) => {
          // newChatMessage += " ";
          return {
            pos: newChatMessage.length + 7, // + index,
            uid: member.replace(/_0$/, ""),
            len: 0
          };
        });
        const style = MultiMsgStyle([
          MessageStyle(-1, newChatMessage.length, null, null, true),
        ]);
        await api.sendMessage(
          {
            msg: newChatMessage,
            // style: MultiMsgStyle([MessageStyle(0, newChatMessage.length, "ff3131", "18")]),
            mentions: mentions,
            style: style,
            ttl
          },
          threadId,
          message.type
        );
      } else {
        await api.sendMessage(
          {
            msg: contentTag,
            // style: MultiMsgStyle([MessageStyle(0, chatMessage.length, "ff3131", "18")]),
            mentions: [{ pos: 0, uid: -1, len: contentTag.length }],
            ttl
          },
          threadId,
          message.type
        );
      }
      await new Promise(resolve => setTimeout(resolve, delayTag));
    }
  } else {
    const object = {
      caption:
        `Hướng dẫn dùng lệnh spam tag all:\n` +
        `Cách Dùng:\n${prefix}${aliasCommand} <nội_dung>|<số lần tag>|<thời gian delay>|<thời gian tin tồn tại>\n` +
        `Ví Dụ: ${prefix}${aliasCommand} <nội_dung>|10|1000|0`,
    };
    await sendMessageWarningRequest(api, message, object, 30000);
  }
}
