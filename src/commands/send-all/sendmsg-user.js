import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { MessageType } from "zlbotdqt";
import { sendMessageCompleteRequest } from '../../service-dqt/chat-zalo/chat-style/chat-style.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const MESSAGE_FILE = path.join(__dirname, "data", "noidung.txt");

function readMessageLines() {
  try {
    if (!fs.existsSync(MESSAGE_FILE)) {
      return [];
    }
    return fs.readFileSync(MESSAGE_FILE, "utf-8")
      .split("\n")
      .map(line => line.trim())
      .filter(line => line);
  } catch {
    return [];
  }
}
export async function sendMessageToMentioned(api, message) {
  const threadId = message.threadId;
  const commandParts = message.data.content ? message.data.content.split("|") : [];
  if (commandParts.length < 3) {
    await sendMessageCompleteRequest(api, message, {
      caption: "❌ Sai cú pháp. Vui lòng dùng: !senduser @Tên|delay|số lần",
    }, 10000);
    return;
  }

  let delay = parseInt(commandParts[1]) || 1000;
  let repeatCount = parseInt(commandParts[2]) || 1;

  if (!message.data || !message.data.mentions || message.data.mentions.length === 0) {
    await sendMessageCompleteRequest(api, message, {
      caption: "❌ Không có ai được tag trong tin nhắn.",
    }, 10000);
    return;
  }

  const messageLines = readMessageLines();
  if (messageLines.length === 0) {
    await sendMessageCompleteRequest(api, message, {
      caption: "❌ Không có nội dung hợp lệ trong file noidung.txt.",
    }, 10000);
    return;
  }

  const uids = [];
  const sendNames = [];
  for (const mention of message.data.mentions) {
    uids.push(mention.uid);
    sendNames.push(mention.name || `${mention.uid}`);
  }

  if (uids.length === 0) {
    await sendMessageCompleteRequest(api, message, {
      caption: "❌ Không có người dùng hợp lệ để gửi tin nhắn.",
    }, 10000);
    return;
  }

  const sendNameList = sendNames.join(", ");
  await sendMessageCompleteRequest(api, message, {
    caption: `📩 Tiến hành gửi tin nhắn tới ${sendNameList}...`,
  }, 30000);

  for (let i = 0; i < repeatCount; i++) {
    for (const userId of uids) {
      for (const line of messageLines) {
        try {
          await api.sendMessage(
            {
              msg: line,
              message,
              ttl: 5000000,
            },
            userId,
            MessageType.DirectMessage
          );
        } catch {}
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
  }

  await sendMessageCompleteRequest(api, message, {
    caption: `✅ Đã hoàn thành gửi tin nhắn tới ${sendNameList}.`,
  }, 30000);
}
