import fs from 'fs';
import path from 'path';
import { MessageType } from "zlbotdqt";
import { getGlobalPrefix } from '../../../service.js';
import { removeMention, randomIDTemp } from '../../../../utils/format-util.js';
import { sendMessageCompleteRequest, sendMessageStateQuote, sendMessageWarningRequest } from '../../chat-style/chat-style.js';
import { checkLinkIsValid, deleteFile } from '../../../../utils/util.js';
import { handleCheckLinkFromGifLocal } from '../../../../utils/local-upload-cache.js';
import { GIFS_RESOURCE_PATH } from '../../../../utils/io-json.js';
import { createTextEffectGif } from './create-gif.js';

const TIME_24H = 86400000;

export async function sendGifLocal(api, message) {
  try {
    const dataGifPath = GIFS_RESOURCE_PATH(api.getBotId());
    const gifFiles = fs.readdirSync(dataGifPath).filter(file => file.endsWith('.gif'));

    if (gifFiles.length === 0) {
      throw new Error("Không tìm thấy file GIF nào trong thư mục.");
    }

    const randomGif = gifFiles[Math.floor(Math.random() * gifFiles.length)];
    const gifPath = path.join(dataGifPath, randomGif);

    await api.sendMessage(
      {
        msg: '',
        attachments: [gifPath]
      },
      message.threadId,
      MessageType.GroupMessage
    );

  } catch (error) {
    console.error(`Lỗi trong quá trình xử lý: ${error.message}`);
    await api.sendMessage(
      {
        msg: "Đã xảy ra lỗi khi gửi GIF. Vui lòng thử lại sau.",
        quote: message
      },
      message.threadId,
      MessageType.GroupMessage
    );
  }
}

export async function handleSendGifCommand(api, message, aliasCommand) {
  const botId = api.getBotId();
  const prefix = getGlobalPrefix(botId);
  const dataGifPath = GIFS_RESOURCE_PATH(botId);
  const content = removeMention(message);
  let keyword = content.replace(`${prefix}${aliasCommand}`, "").trim();
  let text = keyword;

  const senderName = message.data.dName;
  const senderId = message.data.uidFrom;
  const threadId = message.threadId;
  const type = message.type;

  try {
    if (keyword.trim() === "list") {
      const files = fs.readdirSync(dataGifPath);
      if (files.length > 0) {
        const fileList = files.map((file, index) => `${index + 1}. ${file}`).join("\n");
        await sendMessageCompleteRequest(
          api,
          message,
          {
            caption:
              `Đây là những gif đã lưu trữ:\n${fileList}` +
              `\n\nDùng lệnh: ${prefix}${aliasCommand} <số thứ tự gif> để gửi gif`,
          },
          1800000
        );
      } else {
        await sendMessageCompleteRequest(
          api,
          message,
          {
            caption: `Chưa có gif nào được lưu trên bộ nhớ của bot!`,
          },
          1800000
        );
      }
      return;
    }

    const index = parseInt(keyword.trim());
    if (!isNaN(index)) {
      const files = fs.readdirSync(dataGifPath);
      if (index > 0 && index <= files.length) {
        const selectedFile = files[index - 1]; 
        const fileLocal = await handleCheckLinkFromGifLocal(selectedFile, api);
        await sendMessageStateQuote(api, message, "Đây là gif bạn yêu cầu!", true, TIME_24H, false);
        await api.sendGif(fileLocal.fileUrl, message, "H H H Đại Nhân", TIME_24H);
        return;
      } else {
        await sendMessageWarningRequest(
          api,
          message,
          {
            caption: "Số thứ tự không nằm trong phạm vi danh sách gif đã lưu trữ.",
          },
          300000
        );
        return;
      }
    }

    const quote = message.data?.quote;
    if (quote) {
      if (!text) {
        try {
          const parseMessage = JSON.parse(quote.attach);
          text = parseMessage.href || parseMessage.title || quote.msg || null;
        } catch (error) {
          text = quote.msg || null;
        }
      }
    }

    if (!text) {
      const object = {
        caption:
          `Vui lòng reply vào gif hoặc nhập link,\n` +
          `Hoặc dùng lệnh: "${prefix}${aliasCommand} list" để xem danh sách gif đã lưu trữ trong thư mục gif!`,
      };
      await sendMessageWarningRequest(api, message, object, 300000);
      return;
    }

    let linkUpload;
    const fileLocal = await handleCheckLinkFromGifLocal(text, api);
    if (fileLocal) {
      linkUpload = fileLocal.fileUrl;
    } else {
      linkUpload = text;
    }

    if (await checkLinkIsValid(linkUpload)) {
      await sendMessageStateQuote(api, message, "Đây là gif bạn yêu cầu!", true, TIME_24H, false);
      await api.sendGif(linkUpload, message, "H H H Đại Nhân", TIME_24H);
    } else {
      const object = {
        caption: "Link gif không hợp lệ hoặc không có gif nào có tên tương tự được lưu trong bộ nhớ bot.",
      };
      await sendMessageWarningRequest(api, message, object, 300000);
    }
  } catch (error) {
    console.error("Lỗi khi send gif:", error);
    const object = {
      caption: "Đã xảy ra lỗi khi send gif từ nguồn cung cấp.",
    };
    await sendMessageWarningRequest(api, message, object, 300000);
  } finally {
  }
}
export async function createAndSendTextGif(api, message, threadId, text, msgType, senderName, textColors = null, backgroundColor = null) {
  let gifPath = null;
  
  try {
    gifPath = await createTextEffectGif(text, textColors, backgroundColor);

    await sendMessageStateQuote(api, message, `GIF văn bản của bạn đây!`, false, 60000, false);
    await api.sendMessage(
      {
        msg: ``,
        attachments: [gifPath],
        ttl: 6000000
      },
      threadId,
      msgType,
    );
    
    if (gifPath && fs.existsSync(gifPath)) {
      await deleteFile(gifPath);
    }
  } catch (error) {
    console.error('Lỗi trong createAndSendTextGif:', error);
    const object = {
      caption: `${senderName || 'Người dùng'}, Đã có lỗi khi tạo và gửi GIF văn bản. Vui lòng thử lại.`,
    };
    await sendMessageWarningRequest(api, message, object, TIME_24H);
  } finally {
    if (gifPath && fs.existsSync(gifPath)) {
      await deleteFile(gifPath);
    }
  }
}

export async function handleGifTextCommand(api, message, aliasCommand) {
  try {
    const content = removeMention(message)?.trim();
    const threadId = message.threadId;
    let prefix = getGlobalPrefix(api.getBotId());
    const isGroup = message.type === MessageType.GroupMessage;
    const msgType = isGroup ? MessageType.GroupMessage : MessageType.PersonalMessage;
    const senderName = message.data?.dName || 'Người dùng';
    const senderId = message.data?.uidFrom || 'unknown';

    let text = content.replace(`${prefix}${aliasCommand}`, '').trim();

    if (!text) {
      await sendGifTextInstructions(api, message, prefix, aliasCommand);
      return;
    }

    let textColors = null;
    let backgroundColor = null;
    let gifText = text;
    const textColorMatch = text.match(/t#\[([^\]]+)\]/);
    if (textColorMatch) {
      try {
        const colorString = textColorMatch[1];
        textColors = colorString.split(',').map(c => {
          let trimmed = c.trim();
          trimmed = trimmed.replace(/^["']+|["']+$/g, '');
          if (trimmed && !trimmed.startsWith('#')) {
            trimmed = '#' + trimmed;
          }
          return trimmed;
        }).filter(c => c && c.length > 0);
        gifText = gifText.replace(/t#\[[^\]]+\]/, '').trim();
      } catch (error) {
        console.error('Lỗi parse text colors:', error);
      }
    }

    const bgColorMatch = text.match(/b#(\[[^\]]+\]|[^\s]+)/);
    if (bgColorMatch) {
      try {
        let bgColor = bgColorMatch[1];
        bgColor = bgColor.replace(/^\[|\]$/g, '');
        bgColor = bgColor.replace(/^["']+|["']+$/g, '');
        if (bgColor && !bgColor.startsWith('#')) {
          bgColor = '#' + bgColor;
        }
        backgroundColor = bgColor;
        gifText = gifText.replace(/b#(\[[^\]]+\]|[^\s]+)/, '').trim();
      } catch (error) {
        console.error('Lỗi parse background color:', error);
      }
    }

    if (!gifText || gifText.length === 0) {
      await sendGifTextInstructions(api, message, prefix, aliasCommand);
      return;
    }

    if (gifText.length > 500) {
      await api.sendMessage(
        {
          msg: `${senderName}, Văn bản quá dài! Vui lòng nhập tối đa 500 ký tự.`,
          quote: message,
        },
        threadId,
        msgType,
        TIME_24H
      );
      return;
    }

    await createAndSendTextGif(api, message, threadId, gifText, msgType, senderName, textColors, backgroundColor);
  } catch (error) {
    console.error('Lỗi trong handleGifTextCommand:', error);
    const fallbackSenderName = message.data?.dName || 'Người dùng';
    const object = {
      caption: `${fallbackSenderName}, Đã có lỗi xảy ra khi xử lý lệnh ${aliasCommand}. Vui lòng thử lại sau.`,
    };
    await sendMessageWarningRequest(api, message, object, TIME_24H);
  }
}

async function sendGifTextInstructions(api, message, prefix, aliasCommand) {
  try {
    const objectData = {
      caption: `Vui lòng nhập nội dung text để tạo GIF!\n\n` +
        `Cú pháp: ${prefix}${aliasCommand} <nội dung> [t#["màu1","màu2",...]] [b#màu_nền]\n\n` +
        `Ví dụ:\n` +
        `• ${prefix}${aliasCommand} Hello World\n` +
        `• ${prefix}${aliasCommand} Hello World t#["#FF6B6B","#4ECDC4"]\n` +
        `• ${prefix}${aliasCommand} Hello World b#000000\n` +
        `• ${prefix}${aliasCommand} Hello World t#["#FF6B6B","#4ECDC4"] b#000000\n\n` +
        `Lưu ý: Màu có thể có hoặc không có dấu #`,
    };
    await sendMessageWarningRequest(api, message, objectData, 300000);
  } catch (error) {
    console.error('Lỗi trong sendGifTextInstructions:', error);
    const object = {
      caption: `Lỗi khi hiển thị hướng dẫn sử dụng lệnh ${aliasCommand}. Vui lòng thử lại.`,
    };
    await sendMessageWarningRequest(api, message, object, 300000);
  }
}