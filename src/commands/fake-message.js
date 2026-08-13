import { MessageMention, MessageStyle, MessageType } from "../api-zalo/index.js";
import { getImageInfo } from "../utils/util.js";

function getQuotedUserId(quote) {
  return quote?.uidFrom || quote?.ownerId || quote?.uid || quote?.senderId || null;
}

function getHttpUrl(value) {
  try {
    const url = new URL(String(value || "").trim());
    return ["http:", "https:"].includes(url.protocol) ? url.toString() : null;
  } catch {
    return null;
  }
}

function findHttpUrl(value) {
  const match = String(value || "").match(/https?:\/\/[^\s|]+/iu);
  return match ? getHttpUrl(match[0]) : null;
}

async function undoCommandMessage(api, message) {
  const globalMsgId = message.data?.globalMsgId || message.data?.msgId;
  const cliMsgId = message.data?.cliMsgId;
  if (!globalMsgId || !cliMsgId) return;

  try {
    await api.undoMessage({
      ...message,
      data: {
        ...message.data,
        quote: { globalMsgId, cliMsgId },
      },
    });
  } catch {
    // Zalo chỉ cho tài khoản thu hồi tin do chính tài khoản đó gửi.
  }
}

/**
 * Tạo một reply có nội dung quote do người dùng nhập, nhưng vẫn gắn owner
 * với người được reply để Zalo hiển thị đúng như tin nhắn của người đó.
 * Cú pháp: fakemsg <nội dung giả>|<câu trả lời thật>|[tag|@người]
 */
export async function handleFakeMessageCommand(api, message) {
  const content = typeof message.data?.content === "string" ? message.data.content : "";
  let commandText = content.replace(/^\s*[^\s]+\s*/u, "");
  const directSeparator = commandText.match(/\.\s*\|/u);
  const commandMentions = Array.isArray(message.data?.mentions) ? message.data.mentions : [];
  const commandToken = content.match(/^\s*[^\s]+/u)?.[0] || "";
  const commandEnd = commandToken.length;
  const directTarget = commandMentions
    .filter((mention) => Number.isInteger(mention?.pos) && mention.pos >= commandEnd)
    .sort((a, b) => a.pos - b.pos)
    .find((mention) => content.slice(commandEnd, mention.pos).trim() === "");

  // Chế độ gửi riêng:
  //   fakemsg @Tên người dùng .| nội dung
  // UID lấy trực tiếp từ mention, không dò theo tên để tránh gửi nhầm người.
  if (directSeparator && directTarget) {
    const target = directTarget;
    const targetId = target?.uid || target?.userId || target?.id;
    const targetName =
      target?.dName ||
      target?.name ||
      content.slice(target.pos, target.pos + target.len).replace(/^@+/, "").trim() ||
      "người dùng";
    const privateText = commandText
      .slice((directSeparator.index || 0) + directSeparator[0].length)
      .trim()
      .slice(0, 2000);

    if (!targetId) return;
    if (!privateText) {
      await api.sendMessage(
        { msg: "Nội dung gửi riêng không được để trống.\nVí dụ: fakemsg @Tên .| xin chào", quote: message },
        message.threadId,
        message.type
      );
      return;
    }

    try {
      await api.sendMessage(
        { msg: privateText, ttl: 300000 },
        String(targetId),
        MessageType.DirectMessage
      );
      await api.sendMessage(
        { msg: `Đã gửi tin nhắn riêng tới ${targetName}.`, quote: message, ttl: 15000 },
        message.threadId,
        message.type
      );
      await undoCommandMessage(api, message);
    } catch (error) {
      await api.sendMessage(
        {
          msg: `Không thể gửi tin nhắn riêng tới ${targetName}: ${error?.message || "Zalo từ chối yêu cầu"}`,
          quote: message,
          ttl: 30000,
        },
        message.threadId,
        message.type
      );
    }
    return;
  }

  // Khi reply trong nhóm, Zalo có thể tự chèn mention người được reply ngay
  // sau tên lệnh. Bỏ mention này khỏi cú pháp để người dùng không phải xóa tay,
  // đồng thời giữ lại tên để gắn mention vào câu trả lời giả lập.
  let repliedMentionName = "";
  const replyMention = commandMentions
    .filter((mention) => Number.isInteger(mention?.pos) && mention.pos >= commandEnd)
    .sort((a, b) => a.pos - b.pos)
    // Chỉ xem là mention tự chèn khi nó nằm ngay sau tên lệnh. Mention dùng
    // làm tag ở phần thứ ba (sau dấu |) phải được giữ nguyên trong cú pháp.
    .find((mention) => content.slice(commandEnd, mention.pos).trim() === "");
  if (replyMention) {
    const mentionEnd = replyMention.pos + Number(replyMention.len || 0);
    const textBeforeUrl = commandText.split("|")[0].split(/https?:\/\//iu)[0].trim();
    repliedMentionName = String(
      replyMention.dName ||
        replyMention.name ||
        textBeforeUrl ||
        content.slice(replyMention.pos, mentionEnd)
    )
      .replace(/^@+/, "")
      .trim();
    if (Number.isInteger(replyMention.pos) && replyMention.pos >= commandEnd) {
      commandText = content.slice(mentionEnd).trimStart();
    } else if (textBeforeUrl && commandText.startsWith(textBeforeUrl)) {
      commandText = commandText.slice(textBeforeUrl.length).trimStart();
    }
  }

  // Với fake ảnh, luôn bắt đầu phần nội dung từ URL. Cách này không phụ thuộc
  // Zalo trả vị trí mention theo toàn bộ câu hay theo phần sau prefix.
  const firstSeparatorIndex = commandText.indexOf("|");
  const firstPart = firstSeparatorIndex >= 0 ? commandText.slice(0, firstSeparatorIndex) : commandText;
  const imageUrlIndex = firstPart.search(/https?:\/\//iu);
  if (imageUrlIndex > 0) commandText = commandText.slice(imageUrlIndex);

  const quote = message.data?.quote;
  const userId = getQuotedUserId(quote);
  if (!quote || !userId) {
    await api.sendMessage(
      {
        msg:
          "Hãy reply tin nhắn của người cần giả lập.\nVí dụ: fakemsg tin nhắn ảo|câu trả lời\n" +
          "Hoặc gửi riêng: fakemsg @Tên .| nội dung",
        quote: message,
      },
      message.threadId,
      message.type
    );
    return;
  }

  const parts = commandText.split("|").map((part) => part.trim());
  if (parts.length < 2 || !parts[0] || !parts[1]) {
    await api.sendMessage(
      {
        msg:
          "Sai cú pháp. Dùng: fakemsg <tin nhắn ảo>|<câu trả lời thật>|[tag|@người]\n" +
          "Gửi riêng: fakemsg @Tên .| nội dung",
        quote: message,
      },
      message.threadId,
      message.type
    );
    return;
  }

  const fakeText = parts[0].slice(0, 2000);
  // Cho phép URL đứng sau mention Zalo tự chèn khi người dùng bấm reply.
  const fakeImageUrl = getHttpUrl(fakeText) || findHttpUrl(fakeText);
  const realReply = parts[1].slice(0, 2000);

  let replyText = realReply;
  let mentions;
  const tagRequest = parts.slice(2).join("|").trim();
  if (tagRequest) {
    const normalizedTag = tagRequest.replace(/^tag\s+/i, "").trim();
    let tagId = null;
    let tagName = "";

    if (!normalizedTag || normalizedTag.toLowerCase() === "tag") {
      tagId = message.data.uidFrom;
      tagName = message.data.dName || String(tagId);
    } else if (normalizedTag.startsWith("@")) {
      const requestedName = normalizedTag.slice(1).trim().toLowerCase();
      const candidates = Array.isArray(message.data.mentions) ? message.data.mentions : [];
      const mention = candidates.find((item) => {
        const name = item.dName || item.name || "";
        return !requestedName || name.toLowerCase() === requestedName;
      }) || candidates[0];

      if (mention?.uid) {
        tagId = mention.uid;
        tagName = mention.dName || mention.name || normalizedTag.slice(1).trim();
      } else {
        tagId = userId;
        tagName = normalizedTag.slice(1).trim();
      }
    }

    if (tagId && tagName) {
      tagName = tagName.replace(/^@+/, "").trim();
      const tagOffset = replyText.length + 1;
      replyText = `${replyText} ${tagName}`;
      mentions = [MessageMention(String(tagId), tagName.length, tagOffset)];
    }
  } else if (fakeImageUrl) {
    // Reply ảnh trên Zalo thường kèm tên người sở hữu tin được trả lời.
    const quotedName = String(
      repliedMentionName || quote?.dName || quote?.displayName || quote?.senderName || ""
    )
      .replace(/^@+/, "")
      .trim();
    if (quotedName) {
      replyText = `${quotedName} ${replyText}`;
      const quotedUserId = replyMention?.uid || replyMention?.userId || replyMention?.id || userId;
      mentions = [MessageMention(String(quotedUserId), quotedName.length, 0)];
    }
  }

  const now = Date.now();
  const imageInfo = fakeImageUrl ? await getImageInfo(fakeImageUrl) : null;
  const fakeQuote = {
    data: {
      uidFrom: String(userId),
      msgId: String(now),
      cliMsgId: String(now + 1),
      msgType: fakeImageUrl ? "chat.photo" : "webchat",
      ts: now,
      ttl: 0,
      content: fakeImageUrl
        ? {
            title: "",
            href: fakeImageUrl,
            thumb: fakeImageUrl,
            thumbUrl: fakeImageUrl,
            oriUrl: fakeImageUrl,
            normalUrl: fakeImageUrl,
            hdUrl: fakeImageUrl,
            width: imageInfo?.width || 500,
            height: imageInfo?.height || 500,
            hdSize: String(imageInfo?.totalSize || 0),
          }
        : fakeText,
    },
    threadId: message.threadId,
    type: message.type || MessageType.GroupMessage,
  };

  // Ghi style trực tiếp để lớp sendMessage không thay bằng chatStyle tùy chỉnh
  // của bot. Đây là đúng style text mặc định Zalo: màu đen, size 18, không bold.
  const defaultZaloStyle = MessageStyle(0, replyText.length, "1f2937", "18", false, false, false, false);
  await api.sendMessage(
    { msg: replyText, mentions, quote: fakeQuote, style: defaultZaloStyle, ttl: 300000 },
    message.threadId,
    message.type
  );
  await undoCommandMessage(api, message);
}
