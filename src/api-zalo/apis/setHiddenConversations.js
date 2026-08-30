import { ZaloApiError } from "../index.js";
import { apiFactory } from "../utils.js";
import { MessageType } from "../index.js";

export const setHiddenConversationsFactory = apiFactory()((api, appContext, utils) => {
  const serviceURL = utils.makeURL(`${api.zpwServiceMap.conversation[0]}/api/hiddenconvers/add-remove`);

  /** Ẩn hoặc bỏ ẩn một hay nhiều cuộc trò chuyện. */
  return async function setHiddenConversations(hidden, threadId, type = MessageType.DirectMessage) {
    const threadIds = Array.isArray(threadId) ? threadId : [threadId];
    if (threadIds.length === 0 || threadIds.some((id) => !id)) {
      throw new ZaloApiError("Missing threadId");
    }

    const targetKey = hidden ? "add_threads" : "del_threads";
    const otherKey = hidden ? "del_threads" : "add_threads";
    const params = {
      [targetKey]: JSON.stringify(
        threadIds.map((id) => ({
          thread_id: String(id),
          is_group: type === MessageType.GroupMessage ? 1 : 0,
        }))
      ),
      [otherKey]: "[]",
      imei: appContext.imei,
    };

    const encryptedParams = utils.encodeAES(JSON.stringify(params));
    if (!encryptedParams) throw new ZaloApiError("Failed to encrypt params");

    const response = await utils.request(serviceURL, {
      method: "POST",
      body: new URLSearchParams({ params: encryptedParams }),
    });
    return await utils.resolve(response);
  };
});
