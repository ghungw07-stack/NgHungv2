import { MessageType } from "./Message.js";

export class UserDeliveredMessage {
  constructor(data) {
    this.type = MessageType.DirectMessage;
    this.data = data;
    this.threadId = data.deliveredUids[0];
    this.isSelf = false;
  }
}

export class GroupDeliveredMessage {
  constructor(uid, data) {
    this.type = MessageType.GroupMessage;
    this.data = data;
    this.threadId = data.groupId;
    this.isSelf = data.deliveredUids.includes(uid);
  }
}
