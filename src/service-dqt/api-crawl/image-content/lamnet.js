import { getGlobalPrefix } from "../../service.js";
import { analyzeLinks } from "../../../api-zalo/utils.js";
import {
  sendMessageFailed,
  sendMessageStateQuote,
  sendMessageWarning,
  sendMessageWarningRequest,
} from "../../chat-zalo/chat-style/chat-style.js";
import { checkExstentionFileRemote, TIME_HOUR_24 } from "../../../utils/util.js";
import { removeMention } from "../../../utils/format-util.js";
import { getClientAxios } from "../../utilities/browser-launch.js";

const client = getClientAxios();

/**
 * Xử lý lệnh làm nét ảnh
 */
export async function handleSharpenerImageCommand(api, message, aliasCommand) {
  const botId = api.getBotId();
  const prefix = getGlobalPrefix(botId);
  let content = removeMention(message);
  let targetLink;

  const quote = message.data?.quote;
  if (quote) {
    try {
      const parseMessage = JSON.parse(quote.attach);
      const href = parseMessage?.href;
      if (href) {
        targetLink = href;
      }
    } catch (error) {}
  }

  if (!targetLink) {
    const checkLinkInContent = analyzeLinks(content);
    if (checkLinkInContent.count > 0) {
      targetLink = checkLinkInContent.links[0];
    }
  }

  if (!targetLink) {
    const caption = `Hãy reply tin nhắn chứa nội dung hoặc link ảnh cần làm nét!`;
    await sendMessageWarning(api, message, caption, false);
    return;
  }

  const ext = await checkExstentionFileRemote(targetLink);
  const acceptsExt = ["png", "jpg", "jpeg"];
  if (!acceptsExt.includes(ext)) {
    const object = {
      caption: ` Định dạng của ảnh cần làm nét phải là một trong các định dạng sau: ${acceptsExt.join(", ")}!`,
    };
    await sendMessageWarningRequest(api, message, object, 30000);
    return;
  }

  try {
    const response = await client.get("https://adidaphat.site/lamnet", {
      params: {
        link: targetLink,
      },
    });

    if (response?.data?.data || response?.data?.url || response?.data) {
      const imageUrl = response?.data?.data || response?.data?.url || response?.data;
      await sendMessageStateQuote(api, message, "Đây là hình ảnh làm nét theo yêu cầu của bạn!", true, TIME_HOUR_24, false);
      await api.sendImage(imageUrl, message, "", TIME_HOUR_24);
    } else {
      throw new Error("Lỗi API");
    }
  } catch (error) {
    console.error("Có lỗi khi làm nét ảnh: ", error);
    await sendMessageFailed(api, message, `Xin lỗi, có lỗi xảy ra khi làm nét ảnh, vui lòng thử lại sau...`, true);
  }
}
