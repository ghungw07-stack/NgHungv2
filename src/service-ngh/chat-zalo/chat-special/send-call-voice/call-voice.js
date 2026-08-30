import { removeMention } from "../../../../utils/format-util.js";
import { getGlobalPrefix } from "../../../service.js";
import { sendMessageCompleteRequest, sendMessageWarningRequest } from "../../chat-style/chat-style.js";

export async function spamCallVoice(api, message, aliasCommand) {
  const content = removeMention(message);
  const prefix = getGlobalPrefix(api.getBotId());
  const keyContent = content.replace(`${prefix}${aliasCommand}`, "").trim();

  let [countNumberCall, delayBetweenCall, idTarget = ""] = keyContent.split("|");
  countNumberCall = parseInt(countNumberCall) || 1;
  delayBetweenCall = parseInt(delayBetweenCall) || 1000;
  let targetUserId = message.data.mentions?.[0]?.uid || idTarget;

  if (targetUserId) {
    for (let i = 0; i < countNumberCall; i++) {
      await api.callVoice(targetUserId);
      await new Promise((resolve) => setTimeout(resolve, delayBetweenCall));
    }
    const object = {
      caption:
        `Đã gửi ${countNumberCall} lần call voice đến ${targetUserId}`,
    };
    await sendMessageCompleteRequest(api, message, object, 30000);
  } else {
    const object = {
      caption:
        `Hướng dẫn dùng lệnh call:\n` +
        `Cách Dùng:\n${prefix}${aliasCommand} <số lần gọi>|<thời gian delay các lần gọi>|<@người_tag> hoặc id người nhận>\n` +
        `Ví Dụ: ${prefix}${aliasCommand} 10|1000|<@người_tag>`,
    };
    await sendMessageWarningRequest(api, message, object, 30000);
  }
}
