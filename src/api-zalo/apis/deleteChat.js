import { ZaloApiError } from "../index.js";
import { ThreadType } from "../apis/sendReport.js";
import { apiFactory } from "../utils.js";

export const deleteChatFactory = apiFactory()((api, appContext, utils) => {
  const serviceURL = {
    [ThreadType.User]: utils.makeURL(`${api.zpwServiceMap.chat[0]}/api/message/deleteconver`, {
      nretry: 0,
    }),
    [ThreadType.Group]: utils.makeURL(`${api.zpwServiceMap.group[0]}/api/group/deleteconver`, {
      nretry: 0,
    }),
  };

  /**
   * Xóa cuộc trò chuyện (chat) | Delete chat
   *
   * @param {Object} lastMessage Thông tin tin nhắn cuối cùng để xóa ngược lại
   * @param {string} lastMessage.ownerId Owner ID của tin nhắn cuối cùng
   * @param {string} lastMessage.cliMsgId Client message ID của tin nhắn cuối cùng
   * @param {string} lastMessage.globalMsgId Global message ID của tin nhắn cuối cùng
   * @param {string} threadId Thread ID (User ID hoặc Group ID)
   * @param {ThreadType} [type=ThreadType.User] Loại cuộc trò chuyện (User/Group)
   *
   * @throws {ZaloApiError}
   */
  return async function deleteChat(lastMessage, threadId, type = ThreadType.User) {
    if (!lastMessage) throw new ZaloApiError("Missing lastMessage");
    if (!lastMessage.ownerId) throw new ZaloApiError("Missing lastMessage.ownerId");
    if (!lastMessage.cliMsgId) throw new ZaloApiError("Missing lastMessage.cliMsgId");
    if (!lastMessage.globalMsgId) throw new ZaloApiError("Missing lastMessage.globalMsgId");
    if (!threadId) throw new ZaloApiError("Missing threadId");

    const timestampString = Date.now().toString();

    const params =
      type === ThreadType.User
        ? {
            toid: threadId,
            cliMsgId: timestampString,
            conver: lastMessage,
            onlyMe: 1,
            imei: appContext.imei,
          }
        : {
            grid: threadId,
            cliMsgId: timestampString,
            conver: lastMessage,
            onlyMe: 1,
            imei: appContext.imei,
          };

    const encryptedParams = utils.encodeAES(JSON.stringify(params));
    if (!encryptedParams) throw new ZaloApiError("Failed to encrypt params");

    const response = await utils.request(serviceURL[type], {
      method: "POST",
      body: new URLSearchParams({
        params: encryptedParams,
      }),
    });

    return await utils.resolve(response);
  };
});

