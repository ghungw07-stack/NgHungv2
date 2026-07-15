import { MessageType } from "../api-zalo/index.js";
import { getGlobalApi } from "../index.js";
import { getTimeToString } from "../utils/format-util.js";

export async function handleNotifyParentOnPM(api, message) {
  const botId = api.getBotId();
  const isMainBot = api.apiManager.isMainBot;

  if (isMainBot) return;

  if (message.type !== MessageType.DirectMessage) return;

  const managerData = api.apiManager.getDataManager();

  if (!managerData.notifyParentPM) return;

  const senderId = message.data.uidFrom;
  const idTo = message.data.idTo;
  const senderName = message.data.dName || "Người dùng";
  const botIdChild = api.getBotId();
  const botNameChild = api.accountInfo.name || "Bot con";

  const mainBotApi = getGlobalApi();
  if (!mainBotApi) {
    return;
  }

  const mainBotId = mainBotApi.getBotId();
  const idBotMainWithBot = api.apiManager.idBotMainWithBot;
  
  const normalizeId = (id) => {
    if (!id) return "";
    const idStr = String(id).replace(/_0$/, "").split("_")[0];
    return idStr;
  };

  const normalizedSenderId = normalizeId(senderId);
  const normalizedIdTo = normalizeId(idTo);
  const normalizedMainBotId = normalizeId(mainBotId);
  const normalizedIdBotMainWithBot = normalizeId(idBotMainWithBot);
  const normalizedBotIdChild = normalizeId(botIdChild);
  const normalizedOwnerId = normalizeId(api.apiManager.ownerId);

  if (normalizedSenderId === normalizedMainBotId || 
      normalizedSenderId === normalizedIdBotMainWithBot ||
      String(senderId) === String(mainBotId) ||
      (idBotMainWithBot && String(senderId) === String(idBotMainWithBot))) {
    return;
  }

  if (normalizedSenderId === normalizedBotIdChild) {
    return;
  }

  if (normalizedSenderId === normalizedOwnerId) {
    return;
  }

  if (normalizedIdTo !== normalizedBotIdChild) {
    return;
  }

  let contentText = "";
  const content = message.data.content;
  const msgType = message.data.msgType || "";
  const isPlainText = typeof content === "string";

  if (isPlainText) {
    const text = String(content || "").trim();
    if (text.includes("🔔 Có người đã nhắn tin riêng 🔔") ||
        text.includes("🔔 *🔔 Có người đã nhắn tin riêng 🔔*") ||
        text.startsWith("🔔 🔔 Có người đã nhắn tin riêng 🔔")) {
      return;
    }
  } else if (content && typeof content === "object") {
    const title = String(content.title || "").trim();
    const href = String(content.href || "").trim();
    if (title.includes("🔔 🔔 Có người đã nhắn tin riêng 🔔") ||
        href.includes("🔔 🔔 Có người đã nhắn tin riêng 🔔")) {
      return;
    }
  }

  let imageUrl = null;
  let videoUrl = null;
  let videoThumb = null;
  let stickerUrl = null;
  let gifUrl = null;
  let fileUrl = null;

  if (isPlainText) {
    contentText = content;
  } else if (content) {
    if (msgType === "chat.photo" || msgType === "chat.image") {
      imageUrl = content.href || content.attach;
      contentText = content.title || "";
    } else if (msgType === "chat.video.msg" || msgType === "chat.video") {
      videoUrl = content.href;
      videoThumb = content.thumb;
      contentText = content.title || "";
    } else if (msgType === "chat.sticker") {
      if (content.id) {
        stickerUrl = `https://zalo-api.zadn.vn/api/emoticon/sticker/webpc?eid=${encodeURIComponent(content.id)}&size=512&version=4`;
      } else {
        stickerUrl = content.attach || content.href;
      }
      contentText = content.title || "";
    } else if (msgType === "chat.gif") {
      gifUrl = content.href;
      contentText = content.title || "";
    } else if (msgType === "chat.voice") {
      fileUrl = content.href;
      contentText = content.title || "[Voice message]";
    } else if (msgType === "chat.file") {
      fileUrl = content.href;
      contentText = content.title || "[File]";
    } else {
      if (content.href) {
        const href = String(content.href).toLowerCase();
        if (href.includes(".mp4") || href.includes("video")) {
          videoUrl = content.href;
          videoThumb = content.thumb;
          contentText = content.title || "";
        } else if (href.includes(".gif")) {
          gifUrl = content.href;
          contentText = content.title || "";
        } else if (href.includes(".webp") || href.includes("zfcloud.zdn.vn")) {
          stickerUrl = content.href;
          contentText = content.title || "";
        } else {
          imageUrl = content.href;
          contentText = content.title || "";
        }
      } else if (content.attach) {
        const attach = String(content.attach).toLowerCase();
        if (attach.includes(".webp") || attach.includes("zfcloud.zdn.vn")) {
          stickerUrl = content.attach;
        } else {
          imageUrl = content.attach;
        }
        contentText = content.title || "";
      } else if (content.title) {
        contentText = content.title;
      } else if (content.catId) {
        contentText = `Sticker ID: ${content.id || ""} | ${content.catId} | ${content.type || ""}`;
      } else {
        contentText = "[Nội dung đặc biệt]";
      }
    }
  }

  let timeStr = "Không xác định";
  try {
    const timestamp = message.data.ts || Date.now();
    const validTimestamp = typeof timestamp === 'number' && !isNaN(timestamp) ? timestamp : Date.now();
    const date = new Date(validTimestamp);
    if (!isNaN(date.getTime())) {
      timeStr = getTimeToString(date);
    }
  } catch (error) {
    timeStr = new Date().toLocaleString("vi-VN");
  }

  const ownerId = api.apiManager.ownerId;
  if (!ownerId) {
    return;
  }

  const targetMainBotId = idBotMainWithBot || mainBotId;
  if (!targetMainBotId) {
    return;
  }

  const targetMessage = {
    threadId: targetMainBotId,
    type: MessageType.DirectMessage,
    data: {}
  };

  try {
    const notificationMessage =
      `🔔 Có người đã nhắn tin riêng 🔔\n` +
      `🤖 Bot: ${botNameChild}\n` +
      `👤 Người gửi: ${senderName}\n` +
      `⏰ Thời gian: ${timeStr}\n` +
      (contentText ? `💬 Nội dung: ${contentText}` : "");

    await api.sendMessageForward(
      {
        msg: notificationMessage,
        antiDelete: false,
      },
      targetMainBotId,
      MessageType.DirectMessage,
      0
    );

    await new Promise(resolve => setTimeout(resolve, 300));

    const messageHandlers = {
      "chat.photo": async () => {
        let isCustomSticker = false;
        let webpUrl = null;
        let width = null;
        let height = null;
        const href = content?.href || "";
        
        try {
          if (content?.msgBubbleLayoutType === 3) {
            isCustomSticker = true;
          }

          if (href.includes("CreateByHwH")) {
            isCustomSticker = true;
            webpUrl = href;
          }

          if (content?.params) {
            const params = typeof content.params === "string" ? JSON.parse(content.params) : content.params;
            
            if (params.convertible === "jpg" && !params.webp) {
              isCustomSticker = false;
            }
            
            if (params.webp) {
              const webp = typeof params.webp === "string" ? JSON.parse(params.webp) : params.webp;
              if (webp && webp.url) {
                isCustomSticker = true;
                webpUrl = webp.url;
                width = webp.width || params.width || params.thumb_width || 360;
                height = webp.height || params.height || params.thumb_height || 360;
              }
            }
            
            if (params.contentId) {
              isCustomSticker = true;
            }
            
            if (params.jcp) {
              const jcp = typeof params.jcp === "string" ? JSON.parse(params.jcp) : params.jcp;
              if (jcp && jcp.pStickerType === 1) {
                isCustomSticker = true;
              }
            }
            
            if (params.properties) {
              const properties = typeof params.properties === "string" ? JSON.parse(params.properties) : params.properties;
              if (properties && properties.type === 3) {
                isCustomSticker = true;
              }
            }

            if (params.zsource === -1) {
              isCustomSticker = true;
            }

            if (isCustomSticker && !webpUrl) {
              if (params.webp) {
                const webp = typeof params.webp === "string" ? JSON.parse(params.webp) : params.webp;
                webpUrl = webp?.url || params.hdUrl || params.oriUrl || params.thumbUrl || href;
              } else {
                webpUrl = params.hdUrl || params.oriUrl || params.thumbUrl || href;
              }
              
              if (!width || !height) {
                width = params.width || params.thumb_width || params.thumb_height || 360;
                height = params.height || params.thumb_height || params.thumb_width || 360;
              }
            }
          }

          if (!isCustomSticker && href.endsWith(".webp")) {
            let isNormalImage = false;
            if (content?.params) {
              try {
                const params = typeof content.params === "string" ? JSON.parse(content.params) : content.params;
                if (params.convertible === "jpg" && !params.webp) {
                  isNormalImage = true;
                }
              } catch (e) {
              }
            }
            if (!isNormalImage) {
              isCustomSticker = true;
              webpUrl = href;
            }
          }

          if (isCustomSticker && !webpUrl) {
            webpUrl = href;
          }
        } catch (error) {
        }

        if (isCustomSticker && webpUrl) {
          try {
            await api.sendCustomSticker(
              targetMessage,
              webpUrl,
              webpUrl,
              width || 360,
              height || 360,
              0
            );
          } catch (error) {
            if (content?.thumb) {
              try {
                await api.sendImage(content.thumb, targetMessage, content?.title || "", 0);
              } catch (thumbError) {
              }
            }
          }
        } else {
          try {
            await api.sendImage(
              content?.href || content?.attach,
              targetMessage,
              content?.title || "",
              0
            );
          } catch (error) {
            if (content?.thumb) {
              try {
                await api.sendImage(content.thumb, targetMessage, content?.title || "", 0);
              } catch (thumbError) {
              }
            }
          }
        }
      },

      "chat.image": async () => {
        try {
          await api.sendImage(
            content?.href || content?.attach,
            targetMessage,
            content?.title || "",
            0
          );
        } catch (error) {
          if (content?.thumb) {
            try {
              await api.sendImage(content.thumb, targetMessage, content?.title || "", 0);
            } catch (thumbError) {
            }
          }
        }
      },

      "chat.gif": async () => {
        try {
          await api.sendGif(
            content?.href,
            targetMessage,
            content?.title || "",
            0
          );
        } catch (error) {
          if (content?.thumb) {
            try {
              await api.sendImage(content.thumb, targetMessage, content?.title || "", 0);
            } catch (thumbError) {
            }
          }
        }
      },

      "chat.video.msg": async () => {
        try {
          await api.sendVideo({
            videoUrl: content?.href,
            thumbnail: content?.thumb,
            threadId: targetMainBotId,
            threadType: MessageType.DirectMessage,
            message: { text: content?.title || "" },
            ttl: 0,
          });
        } catch (error) {
          if (content?.thumb) {
            try {
              await api.sendImage(content.thumb, targetMessage, content?.title || "[Video]", 0);
            } catch (thumbError) {
            }
          }
        }
      },

      "chat.video": async () => {
        try {
          await api.sendVideo({
            videoUrl: content?.href,
            thumbnail: content?.thumb,
            threadId: targetMainBotId,
            threadType: MessageType.DirectMessage,
            message: { text: content?.title || "" },
            ttl: 0,
          });
        } catch (error) {
          if (content?.thumb) {
            try {
              await api.sendImage(content.thumb, targetMessage, content?.title || "[Video]", 0);
            } catch (thumbError) {
            }
          }
        }
      },

      "chat.sticker": async () => {
        try {
          await api.sendSticker(
            {
              id: content?.id,
              cateId: content?.catId,
              type: content?.type,
            },
            targetMainBotId,
            MessageType.DirectMessage,
            0
          );
        } catch (error) {
          if (content?.thumb || content?.attach) {
            try {
              const thumbUrl = content?.thumb || content?.attach;
              await api.sendImage(thumbUrl, targetMessage, content?.title || "[Sticker]", 0);
            } catch (thumbError) {
            }
          }
        }
      },

      "chat.voice": async () => {
        await api.sendVoice(
          { threadId: targetMainBotId, type: MessageType.DirectMessage },
          content?.href,
          0
        );
      },

      "share.file": async () => {
        const dataFile = content?.params ? (typeof content.params === "string" ? JSON.parse(content.params) : content.params) : {};
        try {
          await api.sendFile(
            targetMessage,
            content?.href,
            0,
            content?.title || "",
            dataFile.fileSize,
            dataFile.fileExt,
            dataFile.checksum
          );
        } catch (error) {
          if (content?.thumb) {
            try {
              await api.sendImage(content.thumb, targetMessage, content?.title || "[File]", 0);
            } catch (thumbError) {
            }
          }
        }
      },

      "chat.file": async () => {
        try {
          await api.sendFile(
            targetMessage,
            content?.href,
            0,
            content?.title || "",
            null,
            null,
            null
          );
        } catch (error) {
          if (content?.thumb) {
            try {
              await api.sendImage(content.thumb, targetMessage, content?.title || "[File]", 0);
            } catch (thumbError) {
            }
          }
        }
      },
    };

    const handler = messageHandlers[msgType];
    if (handler) {
      try {
        await handler();
      } catch (error) {
      }
    }
  } catch (error) {
  }
}

