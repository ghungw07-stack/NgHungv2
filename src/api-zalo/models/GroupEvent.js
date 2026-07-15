import { logMessageToFile } from "../../utils/io-json.js";

export const GroupEventType = {
  JOIN_REQUEST: 0,
  JOIN: 1,
  LEAVE: 2,
  REMOVE_MEMBER: 3,
  BLOCK_MEMBER: 4,
  UPDATE_SETTING: 5,
  UPDATE: 6,
  NEW_LINK: 7,
  ADD_ADMIN: 8,
  REMOVE_ADMIN: 9,
  NEW_PIN_TOPIC: 10,
  UPDATE_TOPIC: 11,
  UPDATE_BOARD: 12,
  REORDER_PIN_TOPIC: 13,
  UNPIN_TOPIC: 14,
  REMOVE_TOPIC: 15,
  NEW_INVITE_TO_GROUP: 16,
  REMOVE_GROUP_INVITATION: 17,
};

let TEMP_NOTIFICATION = "";

export function initializeGroupEvent(data, type, appContext) {
  const threadId = data.groupId;
  if (type === GroupEventType.JOIN_REQUEST) {
    return { type, data: data, threadId, isSelf: false };
  } else if (
    type === GroupEventType.NEW_PIN_TOPIC ||
    type === GroupEventType.UNPIN_TOPIC ||
    type === GroupEventType.REORDER_PIN_TOPIC || 
    type === GroupEventType.REMOVE_GROUP_INVITATION
  ) {
    return { type, data: data, threadId, isSelf: data.actorId === appContext.uid };
  } else {
    const baseData = data;
    const members = baseData.updateMembers || [];
    const lengthUpdateMember = members.length;
    let tempNotification = `${data.groupName}\nType Sự Kiện: ${typeToString(
      type
    )} - Số Lượng Member Trong Sự Kiện: ${lengthUpdateMember}`;
    if (lengthUpdateMember > 0) {
      const danhSach = members.map((member) => `${member.dName} - ${member.id}`).join("\n");
      tempNotification += `\nDanh Sách Member Trong Sự Kiện:\n${danhSach}`;
    }
    if (TEMP_NOTIFICATION !== tempNotification) {
      logMessageToFile(appContext.uid, tempNotification, "group");
      TEMP_NOTIFICATION = tempNotification;
    }
    if (baseData.updateMembers) {
      return {
        type,
        data: baseData,
        threadId,
        isSelf:
          baseData.updateMembers.some((member) => member.id === appContext.uid) || baseData.sourceId === appContext.uid,
      };
    } else {
      return { type, data: baseData, threadId, isSelf: false };
    }
  }
}

export function typeToString(type) {
  switch (type) {
    case GroupEventType.JOIN_REQUEST:
      return "Yêu Cầu Tham Gia Nhóm";
    case GroupEventType.JOIN:
      return "Tham Gia Nhóm";
    case GroupEventType.LEAVE:
      return "Rời Nhóm";
    case GroupEventType.REMOVE_MEMBER:
      return "Xóa Thành Viên";
    case GroupEventType.BLOCK_MEMBER:
      return "Chặn Thành Viên";
    case GroupEventType.UPDATE_SETTING:
      return "Cập Nhật Cài Đặt";
    case GroupEventType.UPDATE:
      return "Cập Nhật";
    case GroupEventType.NEW_LINK:
      return "Liên Kết Mới";
    case GroupEventType.ADD_ADMIN:
      return "Thêm Trưởng Phó Nhóm";
    case GroupEventType.REMOVE_ADMIN:
      return "Xóa Trưởng Phó Nhóm";
    case GroupEventType.NEW_PIN_TOPIC:
      return "Ghim Tin Nhắn Mới";
    case GroupEventType.UPDATE_TOPIC:
      return "Cập Nhật Tin Nhắn Ghim";
    case GroupEventType.UPDATE_BOARD:
      return "UPDATE_BOARD";
    case GroupEventType.REORDER_PIN_TOPIC:
      return "REORDER_PIN_TOPIC";
    case GroupEventType.UNPIN_TOPIC:
      return "UNPIN_TOPIC";
    case GroupEventType.REMOVE_TOPIC:
      return "REMOVE_TOPIC";
    case GroupEventType.NEW_INVITE_TO_GROUP:
      return "Ai Đó Mời Vào Nhóm";
    case GroupEventType.REMOVE_GROUP_INVITATION:
      return "Xóa Lời Mời Vào Nhóm";
    default:
      return String(type);
  }
}
