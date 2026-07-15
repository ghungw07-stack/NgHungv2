import { ZaloApiError } from "../index.js";
import { apiFactory } from "../utils.js";
import { MessageType } from "../index.js";

export const setPinnedConversationsFactory = apiFactory()((api, appContext, utils) => {
  const serviceURL = utils.makeURL(`${api.zpwServiceMap.conversation[0]}/api/pinconvers/updatev2`);

  /**
   * Pin and unpin conversations | Ghim và bỏ ghim cuộc trò chuyện
   *
   * @param {boolean} pinned Should pin conversations | Có ghim hay không
   * @param {string|string[]} threadId The ID(s) of the thread | ID của cuộc trò chuyện
   * @param {number} type Type of thread, default DirectMessage | Loại cuộc trò chuyện
   * @throws {ZaloApiError}
   */
  return async function setPinnedConversations(pinned, threadId, type = MessageType.DirectMessage) {
    if (!threadId) throw new ZaloApiError("Missing threadId");

    if (typeof threadId === "string") threadId = [threadId];

    const params = {
      actionType: pinned ? 1 : 2,
      conversations:
        type === MessageType.GroupMessage
          ? threadId.map((id) => `g${id}`)
          : threadId.map((id) => `u${id}`),
    };

    console.log("setPinnedConversations params:", JSON.stringify(params, null, 2));

    const encryptedParams = utils.encodeAES(JSON.stringify(params));
    if (!encryptedParams) throw new ZaloApiError("Failed to encrypt params");

    const response = await utils.request(serviceURL, {
      method: "POST",
      body: new URLSearchParams({
        params: encryptedParams,
      }),
    });

    const result = await utils.resolve(response);
    console.log("setPinnedConversations response:", result);
    return result;
  };
});

