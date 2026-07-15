import { MessageType } from "./Message.js";

export class UserSeenMessage {
  constructor(data) {
    this.type = MessageType.DirectMessage;
    this.data = data;
    this.threadId = data.idTo;
    this.isSelf = false;
  }
}

export class GroupSeenMessage {
  constructor(uid, data) {
    this.type = MessageType.GroupMessage;
    this.data = data;
    this.threadId = data.groupId;
    this.isSelf = data.seenUids.includes(uid);
  }
}
