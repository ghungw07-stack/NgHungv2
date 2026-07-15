import { MessageType } from "zlbotdqt";
import { readWebConfig } from "../utils/io-json.js";

let bulkMessageInterval = null;

let botIdRunningBulk = null;

export async function sendBulkMessage(api, socket, data) {
  const botId = api.getBotId();
  botIdRunningBulk = botId;
  const { content, interval, filePaths } = data;
  console.log("Nhận yêu cầu startBulkMessage:", content, interval);
  const bulkMessageContent = content;
  const bulkImageUrls = filePaths;
  if (bulkMessageInterval) {
    clearInterval(bulkMessageInterval);
  }

  const sendMessages = async () => {
    const webConfig = readWebConfig(botId);
    const selectedFriends = webConfig.selectedFriends;
    const selectedGroups = webConfig.selectedGroups;

    for (const friendId in selectedFriends) {
      if (selectedFriends[friendId]) {
        try {
          await api.sendMessage(
            {
              msg: bulkMessageContent,
              attachments: bulkImageUrls,
              ttl: interval,
            },
            friendId,
            MessageType.DirectMessage
          );
        } catch (error) {
        }
      }
    }

    for (const groupId in selectedGroups) {
      if (selectedGroups[groupId]) {
        try {
          await api.sendMessage(
            {
              msg: bulkMessageContent,
              attachments: bulkImageUrls,
              ttl: interval,
            },
            groupId,
            MessageType.GroupMessage
          );
        } catch (error) {
        }
      }
    }
  };

  await sendMessages();

  bulkMessageInterval = setInterval(sendMessages, interval);

  console.log("Đã bắt đầu gửi tin nhắn hàng loạt");
  socket.emit("bulkMessageStatus", { botId: botIdRunningBulk, status: "started" });
}

export async function stopBulkMessage() {
  if (bulkMessageInterval) {
    clearInterval(bulkMessageInterval);
    bulkMessageInterval = null;
  }
  return botIdRunningBulk;
}
