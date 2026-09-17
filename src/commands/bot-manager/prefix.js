import { getGlobalPrefix, setGlobalPrefix } from "../../service-ngh/service.js";
import { commandFilePath } from "../../utils/io-json.js";
import { readFileSync, writeFileSync } from "../../utils/util.js";
import {
  sendMessageComplete,
  sendMessageFailed,
  sendMessageInsufficientAuthority,
  sendMessageWarning,
} from "../../service-ngh/chat-zalo/chat-style/chat-style.js";

export async function handlePrefixCommand(api, message, threadId, isAdmin) {
  const content = message.data.content.trim();
  const idBot = api.getBotId();
  const currentPrefix = getGlobalPrefix(api.getBotId());

  if (!content.startsWith(`${currentPrefix}prefix`) && !content.startsWith(`prefix`)) {
    return false;
  }

  const args = content.slice(content.startsWith(currentPrefix) ? currentPrefix.length + 6 : 6).trim();

  if (!args) {
    await sendMessageComplete(
      api,
      message,
      currentPrefix ? `Prefix hiện tại của bot là: ${currentPrefix}` : "Bot hiện tại không có prefix",
      false,
      300000
    );
    return true;
  }

  if (!isAdmin) {
    await sendMessageInsufficientAuthority(api, message, "❌ Bạn không có quyền thay đổi prefix của bot!", false);
    return true;
  }

  if (args.includes(" ")) {
    await sendMessageWarning(api, message, "❌ Prefix không được chứa khoảng trắng!", false, 300000);
    return true;
  }

  try {
    const newPrefix = args === "none" ? "" : args;
    updatePrefix(idBot, newPrefix);
    setGlobalPrefix(idBot, newPrefix);
    await sendMessageComplete(
      api,
      message,
      `✅ Áp dụng thay đổi thành công!\n${newPrefix ? "Prefix mới là:  " + args : "Không set prefix nào!"}`,
      false,
      300000
    );
  } catch (error) {
    console.error("Lỗi khi cập nhật prefix:", error);
    await sendMessageFailed(api, message, "❌ Đã xảy ra lỗi khi thay đổi prefix!", false, 300000);
  }

  return true;
}

function updatePrefix(idBot, newPrefix) {
  try {
    const config = JSON.parse(readFileSync(commandFilePath));
    config.prefix[idBot] = newPrefix;
    writeFileSync(commandFilePath, JSON.stringify(config, null, 2));
  } catch (error) {
    console.error("Lỗi khi cập nhật prefix:", error);
    throw error;
  }
}
