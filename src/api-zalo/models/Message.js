export const MessageSendType = {
  webchat: 1,
  "chat.voice": 31,
  "chat.photo": 32,
  "chat.sticker": 36,
  "chat.doodle": 37,
  "chat.recommended": 38,
  "chat.link": 1,
  "chat.video.msg": 44,
  "share.file": 46,
  "chat.gif": 49,
  "chat.location.new": 43,
};
export const MessageType = {
  DirectMessage: 0,
  GroupMessage: 1,
};
export class Message {
  constructor(data, ownId) {
    this.type = MessageType.DirectMessage;
    this.data = data;
    this.threadId = data.uidFrom === "0" ? data.idTo : data.uidFrom;
    this.isSelf = data.uidFrom === "0";
    if (data.idTo === "0") data.idTo = ownId;
    if (data.uidFrom === "0") data.uidFrom = ownId;
  }
}
export class GroupMessage {
  constructor(data, ownId) {
    this.type = MessageType.GroupMessage;
    this.data = data;
    this.threadId = data.idTo;
    this.isSelf = data.uidFrom === "0";
    if (data.uidFrom === "0") data.uidFrom = ownId;
  }
}

export function MessageMention(uid, length = 1, offset = 0, autoFormat = false) {
  if (typeof offset !== "number" || typeof length !== "number") {
    throw new Error("Invalid Length, Offset! Length and Offset must be numbers");
  }

  const mention = {
    pos: offset,
    len: length,
    uid: uid,
    type: uid === "-1" ? 1 : 0,
  };

  if (autoFormat) {
    return JSON.stringify([mention]);
  } else {
    return mention;
  }
}

export function MessageStyle(
  offset = 0,
  length = 1,
  color = "ffffff",
  size = "18",
  bold = false,
  italic = false,
  underline = false,
  strike = false,
  autoFormat = true
) {
  if (typeof offset !== "number" || typeof length !== "number") {
    throw new Error("Invalid Length, Offset! Length and Offset must be numbers");
  }

  let styleValue = [];

  if (bold) styleValue.push("b");
  if (italic) styleValue.push("i");
  if (underline) styleValue.push("u");
  if (strike) styleValue.push("s");
  if (color) styleValue.push("c_" + color.replace("#", ""));
  if (size) styleValue.push("f_" + size);

  const styleObject = {
    start: offset,
    len: length,
    st: styleValue.join(","),
  };

  if (autoFormat) {
    return JSON.stringify({
      styles: [styleObject],
      ver: 0,
    });
  } else {
    return styleObject;
  }
}

export function MultiMsgStyle(listStyle) {
  const styles = listStyle.map((style) => {
    if (typeof style === "string") {
      return JSON.parse(style).styles[0];
    }
    return style;
  });

  const styleFormat = JSON.stringify({
    styles: styles,
    ver: 0,
  });

  return styleFormat;
}
