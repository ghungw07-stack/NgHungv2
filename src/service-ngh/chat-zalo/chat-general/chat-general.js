import {
  handleCheckLinkFromFilesLocal,
  handleCheckLinkFromStickersLocal,
  handleCheckLinkFromVideoLocal,
} from "../../../utils/local-upload-cache.js";
import { checkExstentionFileRemote, checkLinkIsValid } from "../../../utils/util.js";
import { sendMessageStateQuote } from "../chat-style/chat-style.js";

const TIME_SHOW_CONTENT = 86400000;
const extFile = ["apk", "ipa", "zip", "rar", "7z", "tar", "gz", "bz2", "xz", "jar"];
const extVoice = ["aac", "mp3", "m4a"];

export async function chatGeneralTypeContent(api, message, object) {
  const threadId = message.threadId;
  const threadType = message.type;
  const caption = object.message.trim();
  const [nameFile, note = ""] = caption.split(":");
  const [link, noteLink = ""] = caption.split(">");
  const ttl = object.ttl || TIME_SHOW_CONTENT;

  let checkFileLocal = await handleCheckLinkFromFilesLocal(nameFile, api);
  if (checkFileLocal) {
    if (extFile.includes(checkFileLocal.type)) {
      await sendMessageStateQuote(api, message, note, true, ttl, false);
      await api.sendFile(
        message,
        checkFileLocal.fileUrl,
        ttl,
        checkFileLocal.fileName,
        checkFileLocal.totalSize,
        checkFileLocal.type,
        checkFileLocal.checksum
      );
      return;
    }
  }
  checkFileLocal = await handleCheckLinkFromStickersLocal(nameFile, api);
  if (checkFileLocal) {
    await sendMessageStateQuote(api, message, note, true, ttl, false);
    await api.sendCustomSticker(
      message,
      checkFileLocal.fileUrl,
      checkFileLocal.fileUrl,
      checkFileLocal.width,
      checkFileLocal.height,
      ttl
    );
    return;
  }
  checkFileLocal = await handleCheckLinkFromVideoLocal(nameFile, api);
  if (checkFileLocal) {
    await sendMessageStateQuote(api, message, note, true, ttl, false);
    await api.sendVideo({
      videoUrl,
      threadId: message.threadId,
      threadType: message.type,
      message: {
        text: ``,
      },
      ttl: ttl,
    });
    return;
  }

  if (await checkLinkIsValid(link)) {
    const ext = await checkExstentionFileRemote(link);
    if (ext === "png" || ext === "jpg" || ext === "jpeg") {
      await sendMessageStateQuote(api, message, "", true, ttl, false);
      await api.sendImage(link, message, "", ttl);
    } else if (ext === "mp4") {
      await sendMessageStateQuote(api, message, "", true, ttl, false);
      await api.sendVideo({
        videoUrl: link,
        thumbnail: "",
        threadId: threadId,
        threadType: threadType,
        message: { text: "" },
        ttl: ttl,
      });
    } else if (ext === "gif") {
      await sendMessageStateQuote(api, message, "", true, ttl, false);
      await api.sendGif(link, message, "", ttl);
    } else if (ext === "webp") {
      await sendMessageStateQuote(api, message, "", true, ttl, false);
      await api.sendCustomSticker(message, link, link, null, null, ttl);
    } else if (extVoice.includes(ext)) {
      await sendMessageStateQuote(api, message, "", true, ttl, false);
      await api.sendVoice({ threadId: threadId, type: threadType }, link, ttl);
    } else if (extFile.includes(ext)) {
      await api.sendFile(message, link, ttl, link, null, ext, null);
      await sendMessageStateQuote(api, message, "File cậu cần nè!", true, ttl, false);
    } else {
      await sendMessageStateQuote(api, message, noteLink, true, ttl, false);
      await api.sendMessageForward(
        {
          link: link,
        },
        threadId,
        threadType,
        ttl
      );
    }
  } else {
    await sendMessageStateQuote(api, message, caption, true, ttl, false);
    // const blocks = caption.split(/(card:|video:|audio:|image:|file:)/g).filter((block) => block.trim() !== "");

    // let currentType = null;

    // for (const block of blocks) {
    //   if (["card:", "video:", "audio:", "image:", "file:"].includes(block)) {
    //     currentType = block.replace(":", ""); // Lấy loại lệnh
    //     continue;
    //   }

    //   const content = block.trim();

    //   if (!currentType) {
    //     // Text thường
    //     if (content) {
    //       await sendMessageStateQuote(api, message, content, true, TIME_SHOW_CONTENT, false);
    //     }
    //   } else {
    //     try {
    //       switch (currentType) {
    //         case "card":
    //           const argsCard = content.split(`:`);
    //           for (const arg of argsCard) {
    //             const [uid, ...textArgs] = arg.trim().split(" ");
    //             const stringCard = textArgs.join(" ");
    //             await api.sendBusinessCard(message, uid, stringCard, null, null, TIME_SHOW_CONTENT);
    //           }
    //           break;

    //         case "video":
    //           await api.sendVideoMessage(message, content, TIME_SHOW_CONTENT);
    //           break;

    //         case "audio":
    //           await api.sendAudioMessage(message, content, TIME_SHOW_CONTENT);
    //           break;

    //         case "image":
    //           await api.sendImageMessage(message, content, TIME_SHOW_CONTENT);
    //           break;

    //         case "file":
    //           await api.sendFileMessage(message, content, TIME_SHOW_CONTENT);
    //           break;

    //         default:
    //           // Không xác định được loại, gửi như text
    //           await sendMessageStateQuote(api, message, content, true, TIME_SHOW_CONTENT, false);
    //           break;
    //       }
    //     } catch (e) {
    //       await sendMessageStateQuote(
    //         api,
    //         message,
    //         `Failed to send ${currentType}: ${content}`,
    //         true,
    //         TIME_SHOW_CONTENT,
    //         false
    //       );
    //     }

    //     currentType = null; // Reset type
    //   }
    // }
  }
}

export async function chatGeneralTypeContentNotQuote(api, message, object) {
  const threadId = message.threadId;
  const threadType = message.type;
  const caption = object.message.trim();
  const mentions = object.mentions || null;
  const ttl = object.ttl || 0;

  let checkFileLocal = await handleCheckLinkFromFilesLocal(caption, api);
  if (checkFileLocal) {
    if (extFile.includes(checkFileLocal.type)) {
      await api.sendFile(
        message,
        checkFileLocal.fileUrl,
        ttl,
        checkFileLocal.fileName,
        checkFileLocal.totalSize,
        checkFileLocal.type,
        checkFileLocal.checksum
      );
      return;
    }
  }
  checkFileLocal = await handleCheckLinkFromStickersLocal(caption, api);
  if (checkFileLocal) {
    await api.sendCustomSticker(
      message,
      checkFileLocal.fileUrl,
      checkFileLocal.fileUrl,
      checkFileLocal.width,
      checkFileLocal.height,
      ttl
    );
    return;
  }

  if (await checkLinkIsValid(caption)) {
    const ext = await checkExstentionFileRemote(caption);
    if (ext === "png" || ext === "jpg" || ext === "jpeg") {
      await api.sendImage(caption, message, "", ttl);
    } else if (ext === "mp4") {
      await api.sendVideo({
        videoUrl: caption,
        thumbnail: "",
        threadId: threadId,
        threadType: threadType,
        message: { text: "" },
        ttl: ttl,
      });
    } else if (ext === "gif") {
      await api.sendGif(caption, message, "", ttl);
    } else if (ext === "webp") {
      await api.sendCustomSticker(message, caption, caption, null, null, ttl);
    } else if (extVoice.includes(ext)) {
      await api.sendVoice({ threadId: threadId, type: threadType }, caption, ttl);
    } else if (extFile.includes(ext)) {
      await api.sendFile(message, caption, ttl, caption, null, ext, null);
    } else {
      await api.sendMessageForward(
        {
          link: caption,
        },
        threadId,
        threadType,
        ttl
      );
    }
  } else {
    await api.sendMessage(
      {
        msg: caption,
        ttl: ttl,
        mentions: mentions,
      },
      threadId,
      threadType
    );
  }
}
