import { getGlobalPrefix, setGlobalPrefix } from "../../service-dqt/service.js";
import { commandFilePath } from "../../utils/io-json.js";
import { readFileSync, writeFileSync } from "../../utils/util.js";

export async function handlePrefixCommand(api, message, threadId, isAdmin) {
  const content = message.data.content.trim();
  const idBot = api.getBotId();
  const currentPrefix = getGlobalPrefix(api.getBotId());

  if (!content.startsWith(`${currentPrefix}prefix`) && !content.startsWith(`prefix`)) {
    return false;
  }

  const args = content.slice(content.startsWith(currentPrefix) ? currentPrefix.length + 6 : 6).trim();

  if (!args) {
    await api.sendMessage(
      {
        msg: currentPrefix ? `Prefix hiện tại của bot là: ${currentPrefix}` : `Bot hiện tại không có prefix`,
        quote: message,
        ttl: 300000,
      },
      threadId,
      message.type
    );
    return true;
  }

  if (!isAdmin) {
    await api.sendMessage(
      {
        msg: "❌ Bạn không có quyền thay đổi prefix của bot!",
        quote: message,
        ttl: 300000,
      },
      threadId,
      message.type
    );
    return true;
  }

  if (args.includes(" ")) {
    await api.sendMessage(
      {
        msg: "❌ Prefix không được chứa khoảng trắng!",
        quote: message,
        ttl: 300000,
      },
      threadId,
      message.type
    );
    return true;
  }

  try {
    const newPrefix = args === "none" ? "" : args;
    updatePrefix(idBot, newPrefix);
    setGlobalPrefix(idBot, newPrefix);
    await api.sendMessage(
      {
        msg: `✅ Áp dụng thay đổi thành công!\n${newPrefix ? "Prefix mới là:  " + args : "Không set prefix nào!"}`,
        quote: message,
        ttl: 300000,
      },
      threadId,
      message.type
    );
  } catch (error) {
    console.error("Lỗi khi cập nhật prefix:", error);
    await api.sendMessage(
      {
        msg: "❌ Đã xảy ra lỗi khi thay đổi prefix!",
        quote: message,
        ttl: 300000,
      },
      threadId,
      message.type
    );
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
