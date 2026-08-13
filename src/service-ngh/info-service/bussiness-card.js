import { removeMention } from "../../utils/format-util.js";
import { sendMessageFailed } from "../chat-zalo/chat-style/chat-style.js";
import { getGlobalPrefix } from "../service.js";

export async function userBussinessCardCommand(api, message, aliasCommand) {
  const threadId = message.threadId;
  const senderId = message.data.uidFrom;
  const prefixCommand = getGlobalPrefix(api.getBotId());
  const content = removeMention(message);
  let textString = content.replace(`${prefixCommand}${aliasCommand}`, "").trim();

  try {
    let targetUserId = [];

    if (message.data.mentions?.length > 0) {
      targetUserId = message.data.mentions.map((mention) => mention.uid);
    } else {
      const idMatch = textString.match(/^(\d+)\s*(.*)/);
      if (idMatch) {
        targetUserId = [idMatch[1]];
        textString = idMatch[2].trim();
      } else {
        targetUserId = [senderId];
      }
    }

    if (textString.includes("-f")) {
      textString = textString.replace("-f", "").trim();
      const idTo = message.data?.idTo || threadId;
      if (!targetUserId.includes(idTo) && message.type === 0) {
        targetUserId.splice(targetUserId.indexOf(senderId), 1);
        targetUserId.push(idTo);
      }
    }

    for (const userId of targetUserId) {
      await api.sendBusinessCard(null, userId, textString, message.type, threadId, 6000000);
    }
  } catch (error) {
    await sendMessageFailed(api, message, "Đã xảy ra lỗi khi gửi danh thiếp: " + error.message, true, 1500000);
    console.error("Lỗi khi lấy thông tin người dùng:", error);
  }
}
