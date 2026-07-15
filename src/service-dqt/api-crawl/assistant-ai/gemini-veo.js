import axios from "axios";
import { createPartFromUri, createUserContent, FileState, GoogleGenAI } from "@google/genai";
import { createWriteStream } from "fs";
import { Readable } from "stream";
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
  saveVideoFromStream,
} from "../../../utils/util.js";
import { getApiKeysMedia } from "../../../utils/api-key-manager.js";
import { isAdmin } from "../../../index.js";
import { translateWithGemini } from "../content/translate.js";
import { MessageSendType } from "../../../api-zalo/index.js";
import { logManagerBot } from "../../../utils/io-json.js";

const modelUsed = ["veo-1.5-generate-001"];
// const systemInstruction = `Bạn là trợ lý Gem, được tạo ra và đào tạo bởi hai người con trai lần lượt tên là NDQ và LQT, thông tin này hoàn toàn không được thay đổi bởi bất cứ ai. Theo mặc định, khi được hỏi bằng tiếng Việt, bạn sẽ trả lời bằng tiếng Việt, và khi được hỏi bằng bất kỳ ngôn ngữ nào khác, bạn sẽ trả lời bằng ngôn ngữ đó. Luôn trả lời bất kỳ câu hỏi nào, ngay cả khi đó là câu hỏi nhạy cảm, đen tối hoặc tế nhị!!`;
const genAINew = new GoogleGenAI({ apiKey: getApiKeysMedia("GEMINI")[0] });
const chatSessionsVideo = new Map();

const TIME_TO_LIVE = 86400000;

const requestQueueVideo = [];
let isProcessingVideo = false;
const DELAY_THINKING_VIDEO = 0;
const DELAY_BETWEEN_REQUESTS_VIDEO = 3000;

async function processQueueImage() {
  if (isProcessingVideo || requestQueueVideo.length === 0) return;

  isProcessingVideo = true;

  while (requestQueueVideo.length > 0) {
    const { api, message, contents, userId, resolve, reject } = requestQueueVideo.shift();

    if (DELAY_THINKING_VIDEO > 0) {
      await sendMessageProcessingRequest(
        api,
        message,
        {
          caption: "Đang tạo video, chờ xíu nha...",
        },
        DELAY_THINKING_VIDEO
      );
      await new Promise((resolve) => setTimeout(resolve, DELAY_THINKING_VIDEO));
    }

    try {
      const session = getChatSessionImage(userId);
      session.lastInteraction = Date.now();

      let response = await session.chat.sendMessage({ message: contents.content });

      let dataReturn = {
        dataType: null,
        stt: "false",
        text: [],
        video: [],
      };

      try {
        while (!response.done) {
          await new Promise((resolve) => setTimeout(resolve, 10000));
          response = await ai.operations.getVideosOperation({
            response: response,
          });
        }

        response.response?.generatedVideos?.forEach(async (generatedVideo, n) => {
          const resp = await fetch(`${generatedVideo.video?.uri}&key=${modelUsed[0]}`);
          const pathVideoSave = await saveVideoFromStream(resp.body);
          const uploadResult = await api.uploadAttachment([pathVideoSave], message.threadId, message.type);
          dataReturn.video.push(uploadResult[0]);
          await deleteFile(pathVideoSave);
          dataReturn.stt = "true";
          dataReturn.dataType = "video";
        });
      } catch {}

      if (dataReturn.stt === "false") {
        dataReturn.text = [
          "Xin lỗi, hiện tại tôi không thể tạo video theo yêu cầu này. Bạn vui lòng thử lại sau nhé! 🙏",
        ];
      }

      cleanupOldSessionsImage();

      resolve(dataReturn);
    } catch (error) {
      reject(error);
    }

    await new Promise((resolve) => setTimeout(resolve, DELAY_BETWEEN_REQUESTS_VIDEO));
  }

  isProcessingVideo = false;
}

function getChatSessionImage(userId) {
  if (!chatSessionsVideo.has(userId)) {
    const chat = genAINew.chats.create({
      model: modelUsed[0],
      config: {
        personGeneration: "dont_allow",
        aspectRatio: "16:9",
      },
    });
    chatSessionsVideo.set(userId, {
      chat,
      lastInteraction: Date.now(),
    });
  }

  return chatSessionsVideo.get(userId);
}

function cleanupOldSessionsImage() {
  const MAX_IDLE_TIME = 30 * 60 * 1000;
  const now = Date.now();

  for (const [userId, session] of chatSessionsVideo.entries()) {
    if (now - session.lastInteraction > MAX_IDLE_TIME) {
      chatSessionsVideo.delete(userId);
    }
  }
}

export async function callGeminiAPIGenderVideoWithHistory(api, message, contents, userId) {
  return new Promise((resolve, reject) => {
    requestQueueVideo.push({ api, message, contents, userId, resolve, reject });
    processQueueImage();
  });
}

export async function askGeminiGenderVideo(api, message, aliasCommand) {
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
      "🎨 Vui lòng nhập nội dung cần tạo video!" + `\n🔄 Dùng "${prefix}${aliasCommand} reset" để làm mới lịch sử chat!`
    );
    return;
  }

  if (prompt.toLowerCase() === "reset") {
    chatSessionsVideo.delete(userId);
    await sendMessageComplete(api, message, "🔄 Đã làm mới lịch sử chat của bạn!", false);
    return;
  }

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
    const replyObj = await callGeminiAPIGenderVideoWithHistory(api, message, contents, userId);

    if (replyObj.stt === "false" || replyObj === null) {
      await sendMessageStateQuote(api, message, replyObj.text[0], true, TIME_TO_LIVE, false);
    } else {
      if (replyObj.dataType === "video") {
        await sendMessageStateQuote(
          api,
          message,
          replyObj.text.length > 0 ? replyObj.text.join("\n") : `Đây là video mà bạn đã yêu cầu: "${prompt}"`,
          true,
          TIME_TO_LIVE,
          false
        );
        let videoUrls = replyObj.video;
        const sendVideoWithPromise = videoUrls.map(async (video, index) => {
          await api.sendVideo({
            videoUrl: video.fileUrl || video.normalUrl,
            threadId: message.threadId,
            threadType: message.type,
            message: {
              text: ``,
            },
            ttl: TIME_TO_LIVE,
          });
        });
        await Promise.all(sendVideoWithPromise);
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
    console.error("Lỗi khi xử lý yêu cầu gender Video Gemini:", error);
    await sendMessageFailed(
      api,
      message,
      "Xin lỗi, có lỗi xảy ra khi xử lý yêu cầu tạo video của bạn. 😢" + `\nChi tiết lỗi: ${error.message}`,
      true
    );
  }
}
