import { formatTime, removeMention } from "../../utils/format-util.js";
import { sendMessageStateQuote } from "../chat-zalo/chat-style/chat-style.js";
import { getMessageByThreadAndMsgId, markMessageUndo } from "../../utils/message-cache.js";

const undoQueue = [];
const queuedUndoKeys = new Set();
let isProcessingQueue = false;
const TIME_SHOW_UNDO_MESSAGE = 300000;
const MAX_UNDO_QUEUE_SIZE = 100;
const UNDO_QUEUE_DELAY_MS = 250;

function getUndoQueueKey(api, undoEvent) {
  const botId = api?.getBotId?.() || "unknown";
  const threadId = undoEvent?.data?.idTo || "unknown";
  const rawContent = undoEvent?.data?.content;
  const content = Array.isArray(rawContent) ? rawContent[0] : rawContent;
  const messageId =
    content?.globalMsgId ||
    content?.globalDelMsgId ||
    content?.clientMsgId ||
    content?.clientDelMsgId ||
    undoEvent?.data?.msgId ||
    `${undoEvent?.data?.uidFrom || "unknown"}:${undoEvent?.data?.ts || Date.now()}`;
  return `${botId}:${threadId}:${messageId}`;
}

function getUndoMessageId(undoEvent) {
  const rawContent = undoEvent?.data?.content;
  const content = Array.isArray(rawContent) ? rawContent[0] : rawContent;
  return (content?.globalMsgId || content?.globalDelMsgId)?.toString();
}

function parseParams(params) {
  if (typeof params === "string") {
    try {
      return JSON.parse(params);
    } catch {
      return {};
    }
  }
  return params || {};
}

function detectMessageType(originalMessage, contentObj, isContentObject, undoEvent) {
  let detectedMsgType = originalMessage.msgType || originalMessage.data?.msgType || "webchat";
  const cliMsgType = originalMessage.cliMsgType || originalMessage.data?.cliMsgType || undoEvent.data?.content?.cliMsgType;
  
  if (detectedMsgType === "chat.gif") {
    return "chat.gif";
  }
  
  if (detectedMsgType === "chat.sticker") {
    return "chat.sticker";
  }
  
  if (cliMsgType === 36) {
    if (isContentObject && contentObj.params) {
      const params = parseParams(contentObj.params);
      if (params.pStickerType !== undefined) {
        return "chat.sticker";
      }
      if (contentObj.href) {
        const href = String(contentObj.href).toLowerCase();
        if (href.includes(".gif") || href.includes("gif")) {
          return "chat.gif";
        }
      }
    }
    return "chat.sticker";
  }
  
  if (isContentObject && contentObj.params) {
    const params = parseParams(contentObj.params);
    if (params.pStickerType !== undefined) {
      return "chat.sticker";
    }
    if (params.contentId !== undefined) {
      if (contentObj.href) {
        const href = String(contentObj.href).toLowerCase();
        if (href.includes(".gif") || href.includes("gif")) {
          return "chat.gif";
        }
      }
      if (contentObj.id || contentObj.catId || contentObj.cateId || contentObj.categoryId) {
        return "chat.sticker";
      }
    }
  }
  
  return detectedMsgType;
}

export async function handleAntiUndoCommand(api, message, groupSettings) {
  const content = removeMention(message);
  const parts = content.split(" ");
  const threadId = message.threadId;
  const command = parts[1]?.toLowerCase();

  let newStatus;
  if (command === "on") {
    groupSettings[threadId].antiUndo = true;
    newStatus = "bật";
  } else if (command === "off") {
    groupSettings[threadId].antiUndo = false;
    newStatus = "tắt";
  } else {
    groupSettings[threadId].antiUndo = !groupSettings[threadId].antiUndo;
    newStatus = groupSettings[threadId].antiUndo ? "bật" : "tắt";
  }

  const caption = `Chức năng chống thu hồi tin nhắn đã được ${newStatus}!`;
  await sendMessageStateQuote(api, message, caption, groupSettings[threadId].antiUndo, 300000);

  return true;
}

async function processUndoQueue() {
  if (isProcessingQueue || undoQueue.length === 0) return;

  isProcessingQueue = true;
  const queueItem = undoQueue.shift();
  const { api, undoEvent, isAdminBox, groupSettings, botIsAdminBox, isSelf, queueKey } = queueItem;

  try {
    await processUndo(api, undoEvent, isAdminBox, groupSettings, botIsAdminBox, isSelf);
    await new Promise((resolve) => setTimeout(resolve, UNDO_QUEUE_DELAY_MS));
  } catch (error) {
    console.error("Lỗi khi xử lý tin nhắn thu hồi trong queue:", error);
  } finally {
    queuedUndoKeys.delete(queueKey);
  }

  isProcessingQueue = false;
  processUndoQueue();
}

async function processUndo(api, undoEvent, isAdminBox, groupSettings, botIsAdminBox, isSelf) {
  const threadId = undoEvent.data.idTo;
  const senderId = undoEvent.data.uidFrom;

  if (isSelf || isAdminBox || !groupSettings[threadId]?.antiUndo) {
    return;
  }

  const messageId = getUndoMessageId(undoEvent);
  if (!messageId) {
    return;
  }

  const idBot = api.getBotId();
  const originalMessage = await getMessageByThreadAndMsgId(idBot, threadId, messageId);
  if (!originalMessage || originalMessage.isUndo) return;

  const senderName = originalMessage.dName || originalMessage.data?.dName || "Người dùng";
  const timestamp = formatTime(new Date());
  const timestampString = originalMessage.timestampString || formatTime(new Date(originalMessage.timestamp || originalMessage.ts || Date.now()));
  const baseContent =
    `👤 ${senderName} đã thu hồi tin nhắn sau...\n` +
    `⏰ Thời gian gửi: ${timestampString}\n` +
    `🔔 Thời gian thu hồi: ${timestamp}\n` +
    `📝 Nội Dung: `;

  try {
    const content = originalMessage.content || originalMessage.data?.content || "";
    const isContentObject = typeof content === "object" && content !== null;
    const contentObj = isContentObject ? content : {};
    const contentStr = isContentObject ? (content.title || content.text || JSON.stringify(content)) : String(content || "");
    const msgType = detectMessageType(originalMessage, contentObj, isContentObject, undoEvent);
    const threadType = originalMessage.type || originalMessage.data?.type || undoEvent.type;

    const messageHandlers = {
      webchat: async () => {
        await sendBaseMessage(contentStr);
      },

      "chat.photo": async () => {
        if (!isContentObject || !contentObj.href) {
          await sendBaseMessage("Ảnh...");
          return;
        }
        await sendBaseMessage("Ảnh...");
        await api.sendImage(
          contentObj.href,
          originalMessage,
          contentObj.title || "",
          TIME_SHOW_UNDO_MESSAGE
        );
      },

      "chat.gif": async () => {
        if (!isContentObject || !contentObj.href) {
          await sendBaseMessage("Gif...");
          return;
        }
        await sendBaseMessage("Gif...");
        await api.sendGif(
          contentObj.href,
          originalMessage,
          contentObj.title || "",
          TIME_SHOW_UNDO_MESSAGE
        );
      },

      "chat.video.msg": async () => {
        if (!isContentObject || !contentObj.href) {
          await sendBaseMessage("Video...");
          return;
        }
        await sendBaseMessage("Video...");
        await api.sendVideo({
          videoUrl: contentObj.href,
          thumbnail: contentObj.thumb || contentObj.thumbnail || "",
          threadId,
          threadType: threadType,
          message: { text: contentObj.title || "" },
          ttl: TIME_SHOW_UNDO_MESSAGE,
        });
      },

      "chat.recommended": async () => {
        if (!isContentObject) {
          await sendBaseMessage("Link...");
          return;
        }
        if (contentObj.action === "recommened.link") {
          try {
            const params = parseParams(contentObj.params);
            await sendBaseMessage("Link...");
            await api.sendMessageForward(
              {
                msg: contentObj.title || "",
                title: params.mediaTitle || "",
                src: params.src || "",
                link: contentObj.href || "",
                desc: contentObj.description || "",
                thumb: contentObj.thumb || contentObj.thumbnail || "",
              },
              threadId,
              threadType,
              TIME_SHOW_UNDO_MESSAGE
            );
          } catch (error) {
            console.error("Lỗi khi xử lý link recommended:", error);
            await sendBaseMessage("Link...");
          }
        } else if (contentObj.action === "recommened.user") {
          try {
            const description = parseParams(contentObj.description);
            await sendBaseMessage("Danh thiếp...");
            await api.sendBusinessCard(
              null,
              contentObj.params || "",
              description.phone || null,
              threadType,
              threadId,
              TIME_SHOW_UNDO_MESSAGE
            );
          } catch (error) {
            console.error("Lỗi khi xử lý user recommended:", error);
            await sendBaseMessage("Danh thiếp...");
          }
        }
      },

      "chat.sticker": async () => {
        if (!isContentObject) {
          await sendBaseMessage("Sticker...");
          return;
        }
        
        if (contentObj.params) {
          const params = parseParams(contentObj.params);
          
          if (params.contentId) {
            await sendBaseMessage("Sticker...");
            const animationUrl = params.webp?.url || params.hd || params.hdUrl || contentObj.href || "";
            const staticUrl = params.thumbUrl || params.oriUrl || params.normalUrl || params.hd || params.hdUrl || contentObj.thumbUrl || contentObj.href || "";
            const width = params.width || params.webp?.width || 480;
            const height = params.height || params.webp?.height || 480;
            
            if (animationUrl && staticUrl) {
              const messageForSticker = {
                ...originalMessage,
                threadId: threadId,
                type: threadType,
              };
              
              try {
                await api.sendCustomSticker(
                  messageForSticker,
                  staticUrl,
                  animationUrl,
                  width,
                  height,
                  TIME_SHOW_UNDO_MESSAGE
                );
              } catch (error) {
                console.error("Lỗi khi gửi custom sticker:", error);
                if (staticUrl) {
                  await api.sendImage(staticUrl, originalMessage, "", TIME_SHOW_UNDO_MESSAGE);
                }
              }
            } else if (staticUrl) {
              await api.sendImage(staticUrl, originalMessage, "", TIME_SHOW_UNDO_MESSAGE);
            }
            return;
          }
        }
        
        const stickerId = contentObj.id;
        if (!stickerId) {
          await sendBaseMessage("Sticker...");
          return;
        }
        
        await sendBaseMessage("Sticker...");
        await api.sendSticker(
          {
            id: stickerId,
            cateId: contentObj.catId || contentObj.cateId || contentObj.categoryId || "",
            type: contentObj.type || "",
          },
          threadId,
          threadType,
          TIME_SHOW_UNDO_MESSAGE
        );
      },

      "chat.voice": async () => {
        if (!isContentObject || !contentObj.href) {
          await sendBaseMessage("Voice...");
          return;
        }
        await sendBaseMessage("Voice...");
        await api.sendVoice(
          { threadId, type: threadType },
          contentObj.href,
          TIME_SHOW_UNDO_MESSAGE
        );
      },

      "share.file": async () => {
        if (!isContentObject || !contentObj.href) {
          await sendBaseMessage("File...");
          return;
        }
        try {
          const dataFile = parseParams(contentObj.params);
          await sendBaseMessage("File...");
          await api.sendFile(
            originalMessage,
            contentObj.href,
            TIME_SHOW_UNDO_MESSAGE,
            contentObj.title || "",
            dataFile.fileSize || 0,
            dataFile.fileExt || "",
            dataFile.checksum || ""
          );
        } catch (error) {
          console.error("Lỗi khi xử lý file:", error);
          await sendBaseMessage("File...");
        }
      },
    };

    async function sendBaseMessage(additionalContent = "") {
      return await api.sendMessageForward(
        {
          msg: baseContent + (additionalContent || ""),
        },
        threadId,
        threadType,
        TIME_SHOW_UNDO_MESSAGE
      );
    }

    originalMessage.isUndo = true;
    await markMessageUndo(idBot, threadId, messageId);
    const handler = messageHandlers[msgType];
    if (handler) {
      await handler();
    } else {
      await sendBaseMessage(contentStr || "Tin nhắn");
    }
  } catch (error) {
    console.error("Lỗi khi xử lý tin nhắn thu hồi:", error);
  }
}

export async function antiUndoGroup(api, undoEvent, isAdminBox, groupSettings, botIsAdminBox, isSelf) {
  const queueKey = getUndoQueueKey(api, undoEvent);
  if (queuedUndoKeys.has(queueKey)) return;

  if (undoQueue.length >= MAX_UNDO_QUEUE_SIZE) {
    const droppedItem = undoQueue.shift();
    if (droppedItem?.queueKey) queuedUndoKeys.delete(droppedItem.queueKey);
  }

  queuedUndoKeys.add(queueKey);
  undoQueue.push({ api, undoEvent, isAdminBox, groupSettings, botIsAdminBox, isSelf, queueKey });
  processUndoQueue();
}
