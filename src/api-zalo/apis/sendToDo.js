import { ZaloApiError, MessageType } from "../index.js";
import { apiFactory } from "../utils.js";

export const sendToDoFactory = apiFactory()((api, appContext, utils) => {
  const serviceURL = utils.makeURL(`${api.zpwServiceMap.boards[0]}/api/board/personal/todo/create`);

  /**
   * Gửi một todo đến người dùng hoặc nhóm | Send a todo to user or group
   * @param {Message} message Tin nhắn gốc | Original message
   * @param {string} content Nội dung todo | Todo content
   * @param {Array<number>} assignees Danh sách ID người nhận | List of assignee IDs
   * @param {number} dueDate Thời hạn (-1 nếu không có) | Due date (-1 if not set)
   * @param {string} description Mô tả (có thể trống) | Description (can be empty)
   * @throws {ZaloApiError}
   */
  return async function sendToDo(message, content, assignees, dueDate = -1, description = "") {
    if (!message) throw new ZaloApiError("Missing message");
    if (!content) throw new ZaloApiError("Missing todo content");
    if (!assignees?.length) throw new ZaloApiError("Missing assignees");

    const threadId = message.threadId;
    const isGroup = message.type === MessageType.GroupMessage;
    const cliMsgId = message.data.cliMsgId;
    const msgId = message.data.msgId;

    const params = {
      assignees: JSON.stringify(assignees),
      dueDate,
      content,
      description,
      extra: JSON.stringify({
        msgId,
        toUid: threadId,
        isGroup,
        cliMsgId,
        msgType: 1,
        mention: [],
        ownerMsgUId: appContext.uid,
        message: content,
      }),
      dateDefaultType: 0,
      status: -1,
      watchers: "[]",
      schedule: null,
      src: 5,
      imei: appContext.imei,
    };

    const encryptedParams = utils.encodeAES(JSON.stringify(params));
    if (!encryptedParams) throw new ZaloApiError("Failed to encrypt params");

    const response = await utils.request(serviceURL, {
      method: "POST",
      body: new URLSearchParams({
        params: encryptedParams,
      }),
    });

    return await utils.resolve(response);
  };
});
