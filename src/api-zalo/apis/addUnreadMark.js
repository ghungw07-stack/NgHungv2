import { ZaloApiError, ThreadType } from "../index.js";
import { apiFactory } from "../utils.js";

export const addUnreadMarkFactory = apiFactory()((api, appContext, utils) => {
  const serviceURL = utils.makeURL(`${api.zpwServiceMap.conversation[0]}/api/conv/addUnreadMark`);

  /**
   * Thêm dấu chưa đọc vào cuộc trò chuyện | Add unread mark to conversation
   *
   * @param {string} threadId ID của cuộc trò chuyện | Thread ID
   * @param {ThreadType} [type=ThreadType.User] Loại cuộc trò chuyện (User/Group) | Thread type
   *
   * @throws {ZaloApiError}
   */
  return async function addUnreadMark(threadId, type = ThreadType.User) {
    if (!threadId) throw new ZaloApiError("Missing threadId");

    const timestamp = Date.now();
    const timestampString = timestamp.toString();
    const isGroup = type === ThreadType.Group;

    const requestParams = {
      param: JSON.stringify({
        [isGroup ? "convsGroup" : "convsUser"]: [
          {
            id: threadId,
            cliMsgId: timestampString,
            fromUid: "0",
            ts: timestamp,
          },
        ],
        [isGroup ? "convsUser" : "convsGroup"]: [],
        imei: appContext.imei,
      }),
    };

    const encryptedParams = utils.encodeAES(JSON.stringify(requestParams));
    if (!encryptedParams) throw new ZaloApiError("Failed to encrypt params");

    const response = await utils.request(serviceURL, {
      method: "POST",
      body: new URLSearchParams({
        params: encryptedParams,
      }),
    });

    return await utils.resolve(response, (result) => {
      const data = result.data;
      if (typeof data === "object" && data !== null) {
        if (typeof data.data === "string") {
          return {
            data: JSON.parse(data.data),
            status: data.status,
          };
        }
        return data;
      }
      return result.data;
    });
  };
});

