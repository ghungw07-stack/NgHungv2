import { MultiMsgStyle, MessageStyle, MessageType } from "../../../api-zalo/index.js";
import { nameServer } from "../../../database/index.js";
import { getLocalImageInfo, uploadTempFile } from "../../../utils/util.js";

// Upload ảnh trực tiếp lên Zalo Cloud (giống cách voice/video đang làm),
// thay vì đẩy qua host ngoài (tmpfiles/uguu/litterbox) dễ bị lỗi link chết.
async function uploadImageToZaloCloud(api, imagePath, senderId) {
  const uploadResult = await api.uploadAttachment([imagePath], senderId, 0, {
    uploadCloud: true,
    isUseProphylactic: true,
  });
  const fileUrl = uploadResult?.[0]?.fileUrl || uploadResult?.[0]?.normalUrl;
  if (!fileUrl) throw new Error("Upload ảnh lên Zalo Cloud thất bại, không có fileUrl trả về");
  return fileUrl;
}

// Palette RTF mà client Zalo thực sự render; RGB thuần như ff0000/00ff00
// được nhận trong payload nhưng client thường fallback thành màu đen.
export const COLOR_RED = "db342e";
export const COLOR_YELLOW = "f7b503";
export const COLOR_GREEN = "15a85f";
export const COLOR_BLACK = "1f2937";
export const SIZE_18 = "18";
export const SIZE_16 = "14";
export const IS_BOLD = true;

// ------------------------------------------------------------------
// TÙY CHỈNH STYLE CHO TÊN SERVER (".bot style ...")
// ------------------------------------------------------------------

// Các size chữ hợp lệ theo Zalo (đúng như danh sách bot khác báo lỗi khi nhập sai)
export const ALLOWED_STYLE_SIZES = ["10", "11", "12", "13", "14", "15", "16", "17", "18", "20", "22", "24"];

// Bảng màu tắt (gõ .bot style color:r) kèm hex đầy đủ (.bot style color:ff9800)
export const STYLE_COLOR_PRESETS = {
  r: COLOR_RED,
  do: COLOR_RED,
  "đỏ": COLOR_RED,
  red: COLOR_RED,
  y: COLOR_YELLOW,
  vang: COLOR_YELLOW,
  "vàng": COLOR_YELLOW,
  yellow: COLOR_YELLOW,
  g: COLOR_GREEN,
  xanhla: COLOR_GREEN,
  "xanh lá": COLOR_GREEN,
  green: COLOR_GREEN,
  k: COLOR_BLACK,
  den: COLOR_BLACK,
  "đen": COLOR_BLACK,
  black: COLOR_BLACK,
};

export function resolveStyleColor(input) {
  if (!input) return null;
  const key = input.trim().toLowerCase();
  if (STYLE_COLOR_PRESETS[key]) return STYLE_COLOR_PRESETS[key];
  return null;
}

function normalizeStoredColor(color) {
  const legacyColors = {
    ff0000: COLOR_RED,
    ef4444: COLOR_RED,
    "00ff00": COLOR_GREEN,
    "10b981": COLOR_GREEN,
    ffff00: COLOR_YELLOW,
    f59e0b: COLOR_YELLOW,
    "000000": COLOR_BLACK,
  };
  return legacyColors[color] || ([COLOR_RED, COLOR_GREEN, COLOR_YELLOW, COLOR_BLACK].includes(color) ? color : COLOR_BLACK);
}

export function getDefaultServerStyle() {
  return {
    color: COLOR_BLACK,
    size: SIZE_18,
    bold: true,
    italic: false,
    underline: false,
    strike: false,
  };
}

/**
 * Đọc style tùy chỉnh (nếu admin đã set qua ".bot style ...") từ managerData của bot,
 * fallback về style mặc định nếu chưa cấu hình gì.
 */
export function getServerStyle(api) {
  try {
    const managerData = api.apiManager?.getDataManager ? api.apiManager.getDataManager() : null;
    const custom = managerData?.chatStyle;
    if (!custom) return getDefaultServerStyle();

    return {
      color: normalizeStoredColor(custom.color),
      size: custom.size || SIZE_18,
      bold: custom.bold !== undefined ? custom.bold : false,
      italic: !!custom.italic,
      underline: !!custom.underline,
      strike: !!custom.strike,
    };
  } catch (error) {
    return getDefaultServerStyle();
  }
}

/**
 * Đọc style cho phần text body (nếu đặt riêng qua "style size text/all" hoặc "style type text/all").
 * Fallback về serverStyle nếu chưa cấu hình riêng.
 */
export function getTextStyle(api) {
  try {
    const managerData = api.apiManager?.getDataManager ? api.apiManager.getDataManager() : null;
    const custom = managerData?.chatStyle;
    const t = custom?.text || {};
    return {
      color: normalizeStoredColor(custom?.textColor),
      size: custom?.textSize || SIZE_18,
      bold:      t.bold      !== undefined ? t.bold      : false,
      italic:    t.italic    !== undefined ? t.italic    : false,
      underline: t.underline !== undefined ? t.underline : false,
      strike:    t.strike    !== undefined ? t.strike    : false,
    };
  } catch {
    return { color: COLOR_BLACK, size: SIZE_18, bold: false, italic: false, underline: false, strike: false };
  }
}

export function getNameServer(api) {
  const dataBot = api.apiManager.getDataConfig();
  return dataBot.infoOwner?.nameServer || nameServer;
}

export async function sendMessageInsufficientAuthority(api, message, caption, hasState = true) {
  try {
    const senderName = message.data.dName;
    // uidFrom có thể là globalId dùng cho database; khi mention trên Zalo
    // phải dùng UID gốc của bot hiện tại.
    const senderId = message.data.gameUid || message.data.uidFrom;
    const threadId = message.threadId;
    const iconState = "\n🚫🚫🚫";
    const isGroup = message.type === MessageType.GroupMessage;
    const nameServer = getNameServer(api);
    const serverStyle = getServerStyle(api);
    const textStyle = getTextStyle(api);

    const nameOffset = isGroup ? senderName.length + 1 : 0;
    const bodyText = `\n${caption}${hasState ? iconState : ""}`;
    const style = MultiMsgStyle([
      MessageStyle(nameOffset, nameServer.length, serverStyle.color, serverStyle.size, serverStyle.bold, serverStyle.italic, serverStyle.underline, serverStyle.strike),
      MessageStyle(nameOffset + nameServer.length, bodyText.length, textStyle.color, textStyle.size, textStyle.bold, textStyle.italic, textStyle.underline, textStyle.strike),
    ]);

    let msg = `${isGroup ? senderName + "\n" : ""}${nameServer}` + bodyText;
    return await api.sendMessage(
      {
        msg: msg,
        quote: message,
        mentions: [{ pos: 0, uid: senderId, len: senderName.length }],
        ttl: 180000,
        style: style,
        linkOn: false,
      },
      threadId,
      message.type
    );
  } catch (error) {
    console.log(error);
  }
}

export async function sendMessageQuery(api, message, caption, hasState = true) {
  try {
    const senderName = message.data.dName;
    const senderId = message.data.uidFrom;
    const threadId = message.threadId;
    const isGroup = message.type === MessageType.GroupMessage;
    const iconState = "\n❓❓❓";
    const nameServer = getNameServer(api);
    const serverStyle = getServerStyle(api);
    const textStyle = getTextStyle(api);

    const nameOffset = isGroup ? senderName.length + 1 : 0;
    const bodyText = `\n${caption}${hasState ? iconState : ""}`;
    const style = MultiMsgStyle([
      MessageStyle(nameOffset, nameServer.length, serverStyle.color, serverStyle.size, serverStyle.bold, serverStyle.italic, serverStyle.underline, serverStyle.strike),
      MessageStyle(nameOffset + nameServer.length, bodyText.length, textStyle.color, textStyle.size, textStyle.bold, textStyle.italic, textStyle.underline, textStyle.strike),
    ]);

    let msg = `${isGroup ? senderName + "\n" : ""}${nameServer}` + bodyText;
    return await api.sendMessage(
      {
        msg: msg,
        quote: message,
        mentions: [{ pos: 0, uid: senderId, len: senderName.length }],
        ttl: 180000,
        style: style,
        linkOn: false,
      },
      threadId,
      message.type
    );
  } catch (error) {
    console.log(error);
  }
}

export async function sendMessageWarning(api, message, caption, hasState = true, ttl) {
  try {
    const senderName = message.data.dName;
    const senderId = message.data.uidFrom;
    const threadId = message.threadId;
    const isGroup = message.type === MessageType.GroupMessage;
    const iconState = "\n🚨🚨🚨";
    const nameServer = getNameServer(api);
    const serverStyle = getServerStyle(api);
    const textStyle = getTextStyle(api);

    const nameOffset = isGroup ? senderName.length + 1 : 0;
    const bodyText = `\n${caption}${hasState ? iconState : ""}`;
    const style = MultiMsgStyle([
      MessageStyle(nameOffset, nameServer.length, serverStyle.color, serverStyle.size, serverStyle.bold, serverStyle.italic, serverStyle.underline, serverStyle.strike),
      MessageStyle(nameOffset + nameServer.length, bodyText.length, textStyle.color, textStyle.size, textStyle.bold, textStyle.italic, textStyle.underline, textStyle.strike),
    ]);

    let msg = `${isGroup ? senderName + "\n" : ""}${nameServer}` + bodyText;
    return await api.sendMessage(
      {
        msg: msg,
        quote: message,
        mentions: [{ pos: 0, uid: senderId, len: senderName.length }],
        ttl: ttl || 180000,
        style: style,
        linkOn: false,
      },
      threadId,
      message.type
    );
  } catch (error) {
    console.log(error);
  }
}

export async function sendMessageComplete(api, message, caption, hasState = true, ttl = 180000) {
  try {
    const senderName = message.data.dName;
    const senderId = message.data.uidFrom;
    const threadId = message.threadId;
    const isGroup = message.type === MessageType.GroupMessage;
    const iconState = "\n✅✅✅";
    const nameServer = getNameServer(api);
    const serverStyle = getServerStyle(api);
    const textStyle = getTextStyle(api);

    const nameOffset = isGroup ? senderName.length + 1 : 0;
    const bodyText = `\n${caption}${hasState ? iconState : ""}`;
    const style = MultiMsgStyle([
      MessageStyle(nameOffset, nameServer.length, serverStyle.color, serverStyle.size, serverStyle.bold, serverStyle.italic, serverStyle.underline, serverStyle.strike),
      MessageStyle(nameOffset + nameServer.length, bodyText.length, textStyle.color, textStyle.size, textStyle.bold, textStyle.italic, textStyle.underline, textStyle.strike),
    ]);

    let msg = `${isGroup ? senderName + "\n" : ""}${nameServer}` + bodyText;
    return await api.sendMessage(
      {
        msg: msg,
        quote: message,
        mentions: [{ pos: 0, uid: senderId, len: senderName.length }],
        ttl,
        style: style,
        linkOn: false,
      },
      threadId,
      message.type
    );
  } catch (error) {
    console.log(error);
  }
}

export async function sendMessageFailed(api, message, caption, hasState = true, ttl = 180000) {
  try {
    const senderName = message.data.dName;
    const senderId = message.data.uidFrom;
    const threadId = message.threadId;
    const isGroup = message.type === MessageType.GroupMessage;
    const iconState = "\n❌❌❌";
    const nameServer = getNameServer(api);
    const serverStyle = getServerStyle(api);
    const textStyle = getTextStyle(api);

    const nameOffset = isGroup ? senderName.length + 1 : 0;
    const bodyText = `\n${caption}${hasState ? iconState : ""}`;
    const style = MultiMsgStyle([
      MessageStyle(nameOffset, nameServer.length, serverStyle.color, serverStyle.size, serverStyle.bold, serverStyle.italic, serverStyle.underline, serverStyle.strike),
      MessageStyle(nameOffset + nameServer.length, bodyText.length, textStyle.color, textStyle.size, textStyle.bold, textStyle.italic, textStyle.underline, textStyle.strike),
    ]);

    let msg = `${isGroup ? senderName + "\n" : ""}${nameServer}` + bodyText;
    return await api.sendMessage(
      {
        msg: msg,
        quote: message,
        mentions: [{ pos: 0, uid: senderId, len: senderName.length }],
        ttl: ttl,
        style: style,
        linkOn: false,
      },
      threadId,
      message.type
    );
  } catch (error) {
    console.log(error);
  }
}

export async function sendMessageStateQuote(api, message, caption, state, ttl = 0, onState = true) {
  try {
    const senderName = message.data.dName;
    const senderId = message.data.uidFrom;
    const threadId = message.threadId;
    const iconState = state ? "✅✅✅" : "❌❌❌";
    const nameServer = getNameServer(api);
    const serverStyle = getServerStyle(api);
    const textStyle = getTextStyle(api);

    const nameOffset = senderName.length + 1;
    const bodyText = `\n${caption}${onState ? "\n" + iconState : ""}`;
    const style = MultiMsgStyle([
      MessageStyle(nameOffset, nameServer.length, serverStyle.color, serverStyle.size, serverStyle.bold, serverStyle.italic, serverStyle.underline, serverStyle.strike),
      MessageStyle(nameOffset + nameServer.length, bodyText.length, textStyle.color, textStyle.size, textStyle.bold, textStyle.italic, textStyle.underline, textStyle.strike),
    ]);
    let msg = `${senderName}\n${nameServer}` + bodyText;
    return await api.sendMessage(
      {
        msg: msg,
        quote: message,
        mentions: [{ pos: 0, uid: senderId, len: senderName.length }],
        style: style,
        ttl: ttl,
        linkOn: false,
      },
      threadId,
      message.type
    );
  } catch (error) {
    console.log(error);
  }
}

export async function sendMessageStateNotQuote(api, message, caption, state, ttl = 0, onState = true) {
  try {
    const senderName = message.data.dName;
    const senderId = message.data.uidFrom;
    const threadId = message.threadId;
    const iconState = state ? "✅✅✅" : "❌❌❌";
    const nameServer = getNameServer(api);
    const serverStyle = getServerStyle(api);
    const textStyle = getTextStyle(api);

    const nameOffset = senderName.length + 1;
    const bodyText = `\n${caption}${onState ? "\n" + iconState : ""}`;
    const style = MultiMsgStyle([
      MessageStyle(nameOffset, nameServer.length, serverStyle.color, serverStyle.size, serverStyle.bold, serverStyle.italic, serverStyle.underline, serverStyle.strike),
      MessageStyle(nameOffset + nameServer.length, bodyText.length, textStyle.color, textStyle.size, textStyle.bold, textStyle.italic, textStyle.underline, textStyle.strike),
    ]);
    let msg = `${senderName}\n${nameServer}` + bodyText;
    return await api.sendMessage(
      {
        msg: msg,
        mentions: [{ pos: 0, uid: senderId, len: senderName.length }],
        style: style,
        ttl: ttl,
        linkOn: false,
      },
      threadId,
      message.type
    );
  } catch (error) {
    console.log(error);
  }
}

export async function sendMessageState(api, threadId, caption, state, ttl = 0) {
  try {
    const iconState = state ? "✅✅✅" : "❌❌❌";
    const nameServer = getNameServer(api);
    const serverStyle = getServerStyle(api);
    const textStyle = getTextStyle(api);

    const bodyText = `\n${caption}\n${iconState}`;
    const style = MultiMsgStyle([
      MessageStyle(0, nameServer.length, serverStyle.color, serverStyle.size, serverStyle.bold, serverStyle.italic, serverStyle.underline, serverStyle.strike),
      MessageStyle(nameServer.length, bodyText.length, textStyle.color, textStyle.size, textStyle.bold, textStyle.italic, textStyle.underline, textStyle.strike),
    ]);
    let msg = `${nameServer}` + bodyText;
    return await api.sendMessage(
      {
        msg: msg,
        style: style,
        ttl: ttl,
        linkOn: false,
      },
      threadId,
      MessageType.GroupMessage
    );
  } catch (error) {
    console.log(error);
  }
}

export async function sendMessageStatePrivate(api, threadId, caption, state, ttl = 0) {
  try {
    const iconState = state ? "✅✅✅" : "❌❌❌";
    const nameServer = getNameServer(api);
    const serverStyle = getServerStyle(api);
    const textStyle = getTextStyle(api);

    const bodyText = `\n${caption}\n${iconState}`;
    const style = MultiMsgStyle([
      MessageStyle(0, nameServer.length, serverStyle.color, serverStyle.size, serverStyle.bold, serverStyle.italic, serverStyle.underline, serverStyle.strike),
      MessageStyle(nameServer.length, bodyText.length, textStyle.color, textStyle.size, textStyle.bold, textStyle.italic, textStyle.underline, textStyle.strike),
    ]);
    let msg = `${nameServer}` + bodyText;
    return await api.sendMessage(
      {
        msg: msg,
        style: style,
        ttl: ttl,
        linkOn: false,
      },
      threadId,
      MessageType.DirectMessage
    );
  } catch (error) {
    console.log(error);
  }
}

export async function sendMessageResultRequest(
  api,
  type = MessageType.GroupMessage,
  threadId,
  caption,
  state,
  ttl = 0
) {
  try {
    const iconState = state ? "✅✅✅" : "❌❌❌";
    const nameServer = getNameServer(api);
    const serverStyle = getServerStyle(api);
    const textStyle = getTextStyle(api);

    const bodyText = `\n${caption}\n${iconState}`;
    const style = MultiMsgStyle([
      MessageStyle(0, nameServer.length, serverStyle.color, serverStyle.size, serverStyle.bold, serverStyle.italic, serverStyle.underline, serverStyle.strike),
      MessageStyle(nameServer.length, bodyText.length, textStyle.color, textStyle.size, textStyle.bold, textStyle.italic, textStyle.underline, textStyle.strike),
    ]);
    let msg = `${nameServer}` + bodyText;
    return await api.sendMessage(
      {
        msg: msg,
        style: style,
        ttl: ttl,
        linkOn: false,
      },
      threadId,
      type
    );
  } catch (error) {
    console.log(error);
  }
}

export async function sendMessageFromSQL(api, message, result, hasState = true, ttl = 0, mentionSender = true) {
  try {
    const threadId = message.threadId;
    const senderId = message.data.gameUid || message.data.uidFrom;
    const senderName = message.data.dName;
    const isGroup = message.type === MessageType.GroupMessage;
    const nameServer = getNameServer(api);
    const serverStyle = getServerStyle(api);
    const textStyle = getTextStyle(api);

    const nameOffset = isGroup ? senderName.length + 1 : 0;
    let bodyText = `\n${result.message}`;
    if (hasState) {
      const state = result.success ? "✅✅✅" : "❌❌❌";
      bodyText += `\n${state}`;
    }
    const style = MultiMsgStyle([
      MessageStyle(nameOffset, nameServer.length, serverStyle.color, serverStyle.size, serverStyle.bold, serverStyle.italic, serverStyle.underline, serverStyle.strike),
      MessageStyle(nameOffset + nameServer.length, bodyText.length, textStyle.color, textStyle.size, textStyle.bold, textStyle.italic, textStyle.underline, textStyle.strike),
    ]);

    let msg = `${isGroup ? senderName + "\n" : ""}${nameServer}` + bodyText;
    return await api.sendMessage(
      {
        msg: msg,
        ...(mentionSender ? { mentions: [{ pos: 0, uid: senderId, len: senderName.length }] } : {}),
        style: style,
        // Luôn reply/quote tin nhắn gốc; mentionSender chỉ điều khiển phần mention.
        quote: message,
        linkOn: false,
        ttl: ttl,
      },
      threadId,
      message.type
    );
  } catch (error) {
    console.log(error);
  }
}

export async function sendMessageImageNotQuote(
  api,
  result,
  threadId,
  waitingImagePath,
  ttl = 0,
  isUseProphylactic = false
) {
  const nameServer = getNameServer(api);
  const serverStyle = getServerStyle(api);
  const style = MultiMsgStyle([MessageStyle(0, nameServer.length, serverStyle.color, serverStyle.size, serverStyle.bold, serverStyle.italic, serverStyle.underline, serverStyle.strike)]);
  try {
    return await api.sendMessage(
      {
        msg: result.message,
        attachments: [waitingImagePath],
        isUseProphylactic: isUseProphylactic,
        ttl: ttl,
        style: style,
        linkOn: false,
        mentions: result.mentions,
      },
      threadId,
      MessageType.GroupMessage
    );
  } catch (error) {
    throw error;
  }
}

export async function sendMessageFromSQLImage(api, message, result, hasState = true, waitingImagePath) {
  try {
    const threadId = message.threadId;
    const senderId = message.data.uidFrom;
    const senderName = message.data.dName;
    const isGroup = message.type === MessageType.GroupMessage;
    const nameServer = getNameServer(api);
    const serverStyle = getServerStyle(api);
    const textStyle = getTextStyle(api);

    const nameOffset = isGroup ? senderName.length + 1 : 0;
    let bodyText = `\n${result.message}`;
    if (hasState) {
      const state = result.success ? "✅✅✅" : "❌❌❌";
      bodyText += `\n${state}`;
    }
    const style = MultiMsgStyle([
      MessageStyle(nameOffset, nameServer.length, serverStyle.color, serverStyle.size, serverStyle.bold, serverStyle.italic, serverStyle.underline, serverStyle.strike),
      MessageStyle(nameOffset + nameServer.length, bodyText.length, textStyle.color, textStyle.size, textStyle.bold, textStyle.italic, textStyle.underline, textStyle.strike),
    ]);

    let msg = `${isGroup ? senderName + "\n" : ""}${nameServer}` + bodyText;
    return await api.sendMessage(
      {
        msg: msg,
        mentions: [{ pos: 0, uid: senderId, len: senderName.length }],
        attachments: waitingImagePath ? [waitingImagePath] : [],
        style: style,
        linkOn: false,
      },
      threadId,
      message.type
    );
  } catch (error) {
    console.log(error);
  }
}

export async function sendMessageWarningRequest(api, message, objectData, ttl = 0) {
  const threadId = message.threadId;
  const senderId = message.data.uidFrom;
  const senderName = message.data.dName;
  const isGroup = message.type === MessageType.GroupMessage;

  const textStyle = getTextStyle(api);
  const style = MultiMsgStyle([
    MessageStyle(isGroup ? senderName.length + 1 : 0, objectData.caption.length, textStyle.color, textStyle.size, textStyle.bold, textStyle.italic, textStyle.underline, textStyle.strike),
  ]);
  let msg = `${isGroup ? senderName + "\n" : ""}` + `${objectData.caption}`;

  return await api.sendMessage(
    {
      msg: msg,
      mentions: [{ pos: 0, uid: senderId, len: senderName.length }],
      attachments: objectData.imagePath ? [objectData.imagePath] : [],
      style,
      ttl,
      linkOn: false,
    },
    threadId,
    message.type
  );
}

export async function sendMessageProcessingRequest(api, message, objectData, ttl = 0) {
  const threadId = message.threadId;
  const senderId = message.data.uidFrom;
  const senderName = message.data.dName;
  const isGroup = message.type === MessageType.GroupMessage;

  const textStyle = getTextStyle(api);
  const style = MultiMsgStyle([
    MessageStyle(isGroup ? senderName.length + 1 : 0, objectData.caption.length, textStyle.color, textStyle.size, textStyle.bold, textStyle.italic, textStyle.underline, textStyle.strike),
  ]);
  let msg = `${isGroup ? senderName + "\n" : ""}` + `${objectData.caption}`;

  return await api.sendMessage(
    {
      msg: msg,
      mentions: [{ pos: 0, uid: senderId, len: senderName.length }],
      attachments: objectData.imagePath ? [objectData.imagePath] : [],
      style,
      ttl,
      linkOn: false,
    },
    threadId,
    message.type
  );
}

export async function sendMessageCompleteRequest(api, message, objectData, ttl = 0) {
  const threadId = message.threadId;
  const senderId = message.data.uidFrom;
  const senderName = message.data.dName;
  const isGroup = message.type === MessageType.GroupMessage;

  const textStyle = getTextStyle(api);
  const caption = String(objectData.caption || "");
  const captionOffset = isGroup ? senderName.length + 1 : 0;
  const greenHeader = caption.match(/^> From [^\n]+ <\nNhạc Bạn Chọn Đâyy?!!!/i)?.[0] || "";
  const styles = [];
  if (greenHeader) {
    styles.push(MessageStyle(captionOffset, greenHeader.length, COLOR_GREEN, textStyle.size, textStyle.bold, textStyle.italic, textStyle.underline, textStyle.strike));
  }
  if (caption.length > greenHeader.length) {
    styles.push(MessageStyle(captionOffset + greenHeader.length, caption.length - greenHeader.length, textStyle.color, textStyle.size, textStyle.bold, textStyle.italic, textStyle.underline, textStyle.strike));
  }
  const style = MultiMsgStyle(styles);
  let msg = `${isGroup ? senderName + "\n" : ""}` + caption;

  return await api.sendMessage(
    {
      msg: msg,
      mentions: [{ pos: 0, uid: senderId, len: senderName.length }],
      attachments: objectData.imagePath ? [objectData.imagePath] : [],
      style,
      ttl,
      linkOn: false,
    },
    threadId,
    message.type
  );
}

const MAX_CHUNK_LENGTH = 1800;
export async function sendReplyInChunks(api, message, replyText, TIME_TO_LIVE) {
  const chunks = [];
  let currentIndex = 0;

  while (currentIndex < replyText.length) {
    let endIndex = currentIndex + MAX_CHUNK_LENGTH;

    if (endIndex < replyText.length && replyText[endIndex] !== " ") {
      endIndex = replyText.lastIndexOf(" ", endIndex);

      if (endIndex <= currentIndex) {
        endIndex = replyText.indexOf(" ", currentIndex + MAX_CHUNK_LENGTH);
        if (endIndex === -1) {
          endIndex = replyText.length;
        }
      }
    }

    if (endIndex > replyText.length) {
      endIndex = replyText.length;
    }

    chunks.push(replyText.slice(currentIndex, endIndex));
    currentIndex = endIndex + 1;
  }

  for (let chunk of chunks) {
    await sendMessageStateQuote(api, message, chunk, true, TIME_TO_LIVE, false);
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
}

export async function sendMessageInChunks(api, message, replyText, TIME_TO_LIVE) {
  const chunks = [];
  let currentIndex = 0;

  while (currentIndex < replyText.length) {
    let endIndex = currentIndex + MAX_CHUNK_LENGTH;

    if (endIndex < replyText.length && replyText[endIndex] !== " ") {
      endIndex = replyText.lastIndexOf(" ", endIndex);

      if (endIndex <= currentIndex) {
        endIndex = replyText.indexOf(" ", currentIndex + MAX_CHUNK_LENGTH);
        if (endIndex === -1) {
          endIndex = replyText.length;
        }
      }
    }

    if (endIndex > replyText.length) {
      endIndex = replyText.length;
    }

    chunks.push(replyText.slice(currentIndex, endIndex));
    currentIndex = endIndex + 1;
  }

  for (let chunk of chunks) {
    await sendMessageStateNotQuote(api, message, chunk, true, TIME_TO_LIVE, false);
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
}

export async function sendMessageTag(api, message, objectData, ttl = 0) {
  const threadId = message.threadId;
  const senderId = message.data.uidFrom;
  const senderName = message.data.dName;
  const isGroup = message.type === MessageType.GroupMessage;

  const style = MultiMsgStyle([
    MessageStyle(isGroup ? senderName.length + 1 : 0, objectData.caption.length, COLOR_GREEN, SIZE_16, IS_BOLD),
  ]);

  // Tạo prefix string
  let temp = `${isGroup ? senderName + "\n" : ""}`;
  let msg = temp + `${objectData.caption}`;

  // Điều chỉnh vị trí mentions
  if (objectData.mentions && Array.isArray(objectData.mentions)) {
    objectData.mentions = objectData.mentions.map((mention) => ({
      ...mention,
      pos: mention.pos + temp.length,
    }));
  }

  return await api.sendMessage(
    {
      msg: msg,
      mentions: [{ pos: 0, uid: senderId, len: senderName.length }, ...(objectData.mentions || [])],
      attachments: objectData.imagePath ? [objectData.imagePath] : [],
      style,
      ttl,
      linkOn: false,
    },
    threadId,
    message.type
  );
}

export async function sendMessageImageTag(api, message, objectData, ttl = 0) {
  const senderId = message.data.uidFrom;
  const senderName = message.data.dName;
  const isGroup = message.type === MessageType.GroupMessage;

  if (!objectData.imagePath) {
    console.error("Chưa cung cấp hình ảnh");
    return;
  }

  let imageData = null;
  try {
    const dataImage = await getLocalImageInfo(objectData.imagePath);
    if (dataImage.totalSize > 1024) {
      let finalUrl;
      try {
        // Ưu tiên upload thẳng lên Zalo Cloud (giống voice/video) để có link bền, không lỗi.
        finalUrl = await uploadImageToZaloCloud(api, objectData.imagePath, senderId);
      } catch (zaloUploadError) {
        console.error("Upload ảnh lên Zalo Cloud thất bại, fallback sang host ngoài:", zaloUploadError);
        // Fallback: nếu upload Zalo Cloud lỗi (vd. mất kết nối tới Zalo), vẫn còn đường lui qua host ngoài.
        finalUrl = await uploadTempFile(objectData.imagePath, 1);
      }
      imageData = {
        url: finalUrl,
        width: dataImage.width,
        height: dataImage.height,
      };
    }
  } catch (error) {
    console.error("Lỗi khi xử lý ảnh:", error);
  }

  const style = MultiMsgStyle([
    MessageStyle(isGroup ? senderName.length + 1 : 0, objectData.caption.length, COLOR_GREEN, SIZE_16, IS_BOLD),
  ]);
  let msg = `${isGroup ? senderName + "\n" : ""}`;

  const mentions = [
    { pos: 0, uid: senderId, len: senderName.length, type: 0 },
    ...(objectData.mentions?.map((mention) => ({ ...mention, pos: mention.pos + msg.length, type: 0 })) || []),
  ];

  msg += `${objectData.caption}`;

  const newMessage = {
    ...message,
    mentions: mentions,
  };

  return await api.sendImage(imageData, newMessage, msg, ttl);
}
