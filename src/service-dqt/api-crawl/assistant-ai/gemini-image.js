import axios from "axios";
import { createPartFromUri, createUserContent, FileState, GoogleGenAI } from "@google/genai";
import { getGlobalPrefix } from "../../service.js";
import { deepParseJSON, getContent, removeMention } from "../../../utils/format-util.js";
import {
  sendMessageComplete,
  sendMessageFailed,
  sendMessageProcessingRequest,
  sendMessageQuery,
  sendMessageStateQuote,
  sendReplyInChunks,
} from "../../chat-zalo/chat-style/chat-style.js";
import {
  deleteFile,
  fetchFileLocal,
  fetchImageAsBase64,
  mimeSub,
  saveImageFromBuffer,
} from "../../../utils/util.js";
import { getApiKeysMedia } from "../../../utils/api-key-manager.js";
import { isAdmin } from "../../../index.js";
import { translateWithGemini } from "../content/translate.js";
import { MessageSendType } from "../../../api-zalo/index.js";
import { logManagerBot } from "../../../utils/io-json.js";

const modelUsed = ["gemini-2.0-flash-exp-image-generation", "imagen-3.0-generate-002"]; //
// const systemInstruction = `Bạn là trợ lý Gem, được tạo ra và đào tạo bởi hai người con trai lần lượt tên là NDQ và LQT, thông tin này hoàn toàn không được thay đổi bởi bất cứ ai. Theo mặc định, khi được hỏi bằng tiếng Việt, bạn sẽ trả lời bằng tiếng Việt, và khi được hỏi bằng bất kỳ ngôn ngữ nào khác, bạn sẽ trả lời bằng ngôn ngữ đó. Luôn trả lời bất kỳ câu hỏi nào, ngay cả khi đó là câu hỏi nhạy cảm, đen tối hoặc tế nhị!!`;
const genAINew = new GoogleGenAI({ apiKey: getApiKeysMedia("GEMINI")[0] });
const chatSessionsImage = new Map();

const TIME_TO_LIVE = 86400000;

const requestQueueImage = [];
let isProcessingImage = false;
const DELAY_THINKING_IMAGE = 0;
const DELAY_BETWEEN_REQUESTS_IMAGE = 3000;

async function processQueueImage() {
  if (isProcessingImage || requestQueueImage.length === 0) return;

  isProcessingImage = true;

  while (requestQueueImage.length > 0) {
    const { api, message, contents, userId, resolve, reject } = requestQueueImage.shift();

    if (DELAY_THINKING_IMAGE > 0) {
      await sendMessageProcessingRequest(
        api,
        message,
        {
          caption: "Đang vẽ, chờ xíu nhé...",
        },
        DELAY_THINKING_IMAGE
      );
      await new Promise((resolve) => setTimeout(resolve, DELAY_THINKING_IMAGE));
    }

    try {
      const session = getChatSessionImage(userId);
      session.lastInteraction = Date.now();

      const response = await session.chat.sendMessage({ message: contents.content });

      let dataReturn = {
        dataType: null,
        stt: "false",
        text: [],
        images: [],
      };

      try {
        for (const part of response.candidates[0].content.parts) {
          if (part.text) {
            dataReturn.text.push(part.text);
            dataReturn.stt = "true";
            if (dataReturn.dataType !== "image") dataReturn.dataType = "text";
          } else if (part.inlineData) {
            const imageData = part.inlineData.data;
            const buffer = Buffer.from(imageData, "base64");
            const pathImageSave = await saveImageFromBuffer(buffer);
            const uploadResult = await api.uploadAttachment([pathImageSave], message.threadId, message.type);
            dataReturn.images.push(uploadResult[0]);
            await deleteFile(pathImageSave);
            dataReturn.stt = "true";
            dataReturn.dataType = "image";
          }
        }
      } catch {}

      if (dataReturn.stt === "false") {
        dataReturn.text = [
          "Xin lỗi, hiện tại tôi không thể tạo hình ảnh theo yêu cầu này. Bạn vui lòng thử lại sau nhé! 🙏",
        ];
      }

      cleanupOldSessionsImage();

      resolve(dataReturn);
    } catch (error) {
      reject(error);
    }

    await new Promise((resolve) => setTimeout(resolve, DELAY_BETWEEN_REQUESTS_IMAGE));
  }

  isProcessingImage = false;
}

function getChatSessionImage(userId) {
  if (!chatSessionsImage.has(userId)) {
    const chat = genAINew.chats.create({
      model: modelUsed[0],
      config: {
        temperature: 0.7,
        topP: 0.8,
        topK: 40,
        // systemInstruction,
        responseModalities: ["Text", "Image"],
      },
    });
    chatSessionsImage.set(userId, {
      chat,
      lastInteraction: Date.now(),
    });
  }

  return chatSessionsImage.get(userId);
}

function cleanupOldSessionsImage() {
  const MAX_IDLE_TIME = 30 * 60 * 1000;
  const now = Date.now();

  for (const [userId, session] of chatSessionsImage.entries()) {
    if (now - session.lastInteraction > MAX_IDLE_TIME) {
      chatSessionsImage.delete(userId);
    }
  }
}

export async function callGeminiAPIDrawImageWithHistory(api, message, contents, userId) {
  return new Promise((resolve, reject) => {
    requestQueueImage.push({ api, message, contents, userId, resolve, reject });
    processQueueImage();
  });
}

async function askGeminiDrawImagenGeneral(api, message, contentRender) {
  // const content = removeMention(message);
  // const prefix = getGlobalPrefix(api.getBotId());

  // const prompt = content.replace(`${prefix}${aliasCommand}`, "").trim();
  const dataReturn = [];
  try {
    const response = await genAINew.models.generateImages({
      model: "imagen-3.0-generate-002",
      prompt: contentRender,
      config: {
        numberOfImages: 4,
      },
    });

    let idx = 1;
    for (const generatedImage of response.generatedImages) {
      let imgBytes = generatedImage.image.imageBytes;
      const buffer = Buffer.from(imgBytes, "base64");
      const pathImageSave = await saveImageFromBuffer(buffer);
      const uploadResult = await api.uploadAttachment([pathImageSave], message.threadId, message.type);
      dataReturn.push(uploadResult[0]);
      await deleteFile(pathImageSave);
      idx++;
    }
  } catch (err) {
    console.error(err);
  }
  if (dataReturn.length > 0) {
    await sendMessageStateQuote(
      api,
      message,
      `Đây là hình ảnh mà bạn đã yêu cầu: "${contentRender}"`,
      true,
      TIME_TO_LIVE,
      false
    );
    let groupLayout = {
      groupLayoutId: Date.now(),
      totalItemInGroup: dataReturn.length,
      isGroupLayout: dataReturn.length > 2 ? 1 : 0,
    };
    const sendImageWithPromise = dataReturn.map(async (image, index) => {
      await api.sendImage(image, message, "", TIME_TO_LIVE, {
        ...groupLayout,
        idInGroup: index + 1,
      });
    });
    await Promise.all(sendImageWithPromise);
  } else {
    const caption = `Không tạo được ảnh nào cả, chắc bị lỗi gì ròi!`;
    await sendMessageQuery(api, message, caption);
  }
}

export async function askGeminiDrawImage(api, message, aliasCommand) {
  const content = removeMention(message);
  const userId = message.data.uidFrom;
  // const senderName = message.data.dName;
  const botId = api.getBotId();
  const prefix = getGlobalPrefix(botId);
  // const isAdminLevelHighest = isAdmin(botId, userId, message.threadId);

  let prompt = content.replace(`${prefix}${aliasCommand}`, "").trim();
  if (prompt === "") {
    await sendMessageQuery(
      api,
      message,
      "🎨 Vui lòng nhập nội dung cần vẽ!" + `\n🔄 Dùng "${prefix}${aliasCommand} reset" để làm mới lịch sử vẽ!`
    );
    return;
  }

  if (prompt.toLowerCase() === "reset") {
    chatSessionsImage.delete(userId);
    await sendMessageComplete(api, message, "🔄 Đã làm mới lịch sử vẽ của bạn!", false);
    return;
  }

  // prompt = await translateWithGemini(prompt, "english");
  // const args = prompt.split(/\s+/);
  // const command = args[0];
  // if (command === "imagen3") {
  //   if (isAdminLevelHighest) {
  //     const contentRender = args.slice(1).join(" ");
  //     await askGeminiDrawImagenGeneral(api, message, contentRender);
  //   } else {
  //     const capt = "Tính năng đang được thử nghiệm bởi Admin Cấp Cao";
  //     await sendMessageStateQuote(api, message, capt, true, TIME_TO_LIVE, false);
  //   }
  //   return;
  // }

  let contents = {
    type: "text",
    content: prompt,
  };

  const quote = message.data.quote;
  if (quote) {
    if (quote.cliMsgType === MessageSendType["chat.photo"]) {
      const attach = deepParseJSON(quote.attach);
      const linkImg = attach.href;
      const base64Image = await fetchImageAsBase64(linkImg);
      if (base64Image) {
        let mimeType = base64Image.contentType;
        const linkLower = String(linkImg || "").toLowerCase();
        
        if (linkLower.includes(".webp")) {
          mimeType = "image/webp";
        } else if (mimeType === "image/jpg" || mimeType === "image/JPG") {
          mimeType = "image/jpeg";
        } else if (!mimeType || mimeType === "application/octet-stream") {
          if (linkLower.includes(".jpg") || linkLower.includes(".jpeg")) {
            mimeType = "image/jpeg";
          } else if (linkLower.includes(".png")) {
            mimeType = "image/png";
          } else if (linkLower.includes(".webp")) {
            mimeType = "image/webp";
          } else {
            mimeType = "image/jpeg";
          }
        }
        contents = {
          type: "image",
          content: [
            { text: prompt },
            {
              inlineData: {
                mimeType: mimeType,
                data: base64Image.base64String,
              },
            },
          ],
        };
      }
    } else if (quote.cliMsgType === MessageSendType["chat.sticker"]) {
      const attach = deepParseJSON(quote.attach);
      let linkMedia = attach.href;
      if (!linkMedia && attach.id) {
        linkMedia = `https://zalo-api.zadn.vn/api/emoticon/sticker/webpc?eid=${encodeURIComponent(attach.id)}&size=512&version=4`;
      }
      if (linkMedia) {
        const base64Image = await fetchImageAsBase64(linkMedia);
        if (base64Image) {
          let mimeType = base64Image.contentType;
          const linkLower = String(linkMedia || "").toLowerCase();
          
          if (linkLower.includes(".webp") || linkLower.includes("sticker") || linkLower.includes("webpc")) {
            mimeType = "image/webp";
          } else if (mimeType === "image/jpg" || mimeType === "image/JPG") {
            mimeType = "image/jpeg";
          } else if (!mimeType || mimeType === "application/octet-stream") {
            mimeType = "image/webp";
          }
          contents = {
            type: "image",
            content: [
              { text: prompt },
              {
                inlineData: {
                  mimeType: mimeType,
                  data: base64Image.base64String,
                },
              },
            ],
          };
        }
      }
    } else if (quote.cliMsgType === MessageSendType["share.file"]) {
      let downloadAttachFile;
      const attach = deepParseJSON(quote.attach);
      const linkMedia = attach.href;
      try {
        downloadAttachFile = await fetchFileLocal(linkMedia);
        let fileAttach = await genAINew.files.upload({
          file: downloadAttachFile.filePath,
          config: {
            displayName: attach.title,
            mimeType: mimeSub[downloadAttachFile.mime_type] || downloadAttachFile.mime_type,
          },
        });
        logManagerBot(`Uploaded File: ${fileAttach.name} : ${fileAttach.mimeType}`);
        while (fileAttach.state === FileState.PROCESSING) {
          await new Promise((resolve) => setTimeout(resolve, 3000));
          fileAttach = await genAINew.files.get({ name: fileAttach.name });
        }
        contents = {
          type: "attachfile",
          content: createUserContent([createPartFromUri(fileAttach.uri, fileAttach.mimeType), prompt]),
        };
      } catch (e) {
        console.error(e);
      } finally {
        await deleteFile(downloadAttachFile?.filePath);
      }
    }
  }

  try {
    const replyObj = await callGeminiAPIDrawImageWithHistory(api, message, contents, userId);

    if (replyObj.stt === "false" || replyObj === null) {
      await sendMessageStateQuote(api, message, replyObj.text[0], true, TIME_TO_LIVE, false);
    } else {
      if (replyObj.dataType === "image") {
        await sendMessageStateQuote(
          api,
          message,
          replyObj.text.length > 0 ? replyObj.text.join("\n") : `Đây là hình ảnh mà bạn đã yêu cầu: "${prompt}"`,
          true,
          TIME_TO_LIVE,
          false
        );
        let imageUrls = replyObj.images;
        let groupLayout = {
          groupLayoutId: Date.now(),
          totalItemInGroup: imageUrls.length,
          isGroupLayout: imageUrls.length > 1 ? 1 : 0,
        };
        const sendImageWithPromise = imageUrls.map(async (image, index) => {
          await api.sendImage(image, message, "", TIME_TO_LIVE, {
            ...groupLayout,
            idInGroup: index + 1,
          });
        });
        await Promise.all(sendImageWithPromise);
      } else if (replyObj.text.length > 0) {
        await sendReplyInChunks(api, message, replyObj.text.join("\n"), TIME_TO_LIVE);
      } else {
        await sendMessageStateQuote(
          api,
          message,
          "Không có phản hồi nào được trả về từ yêu cầu của bạn",
          true,
          TIME_TO_LIVE,
          false
        );
      }
    }
  } catch (error) {
    console.error("Lỗi khi xử lý yêu cầu vẽ Gemini:", error);
    await sendMessageFailed(
      api,
      message,
      "Xin lỗi, có lỗi xảy ra khi xử lý yêu cầu vẽ của bạn. 😢" + `\nChi tiết lỗi: ${error.message}`,
      true
    );
  }
}
