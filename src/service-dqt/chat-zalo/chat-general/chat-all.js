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
  const [contentTag, , , ttl = 0] = chatMessage.split("|");
  const countTag = 1;
  const delayTag = 0;
  const groupAdmins = await getGroupAdmins(groupInfo);

  if (chatMessage) {
    for (let i = 0; i < countTag; i++) {
      if (!groupAdmins.includes(botId)) {
        let newChatMessage = contentTag;
        const memberIds = (groupInfo.memVerList || [])
          .map((member) => {
            const rawId = typeof member === "object" ? member.uid ?? member.id : member;
            const memberId = String(rawId || "").replace(/_0$/, "");
            return memberId || null;
          })
          .filter(Boolean);
        const style = MultiMsgStyle([
          MessageStyle(-1, newChatMessage.length, null, null, true),
        ]);

        // Khi bot chưa có quyền phó nhóm, chỉ gửi một tin và gắn tối đa 3 UID.
        const mentions = memberIds.slice(0, 3).map((memberId) => ({
          pos: newChatMessage.length + 7,
          uid: memberId,
          id: memberId,
          len: 0,
        }));
        await api.sendMessage(
          {
            msg: newChatMessage,
            mentions,
            style,
            ttl,
          },
          threadId,
          message.type
        );
      } else {
        await api.sendMessage(
          {
            msg: contentTag,
            // style: MultiMsgStyle([MessageStyle(0, chatMessage.length, "ff3131", "18")]),
            mentions: [{ pos: 0, uid: "-1", id: "-1", len: contentTag.length }],
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
        `Hướng dẫn dùng lệnh tag all:\n` +
        `Cách Dùng:\n${prefix}${aliasCommand} <nội_dung>\n` +
        `Ví Dụ: ${prefix}${aliasCommand} Mọi người chú ý`,
    };
    await sendMessageWarningRequest(api, message, object, 30000);
  }
}
