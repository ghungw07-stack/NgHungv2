import { ZaloApiError } from "../index.js";
import { apiFactory } from "../utils.js";

export const getRecentMessageFactory = apiFactory()((api, appContext, utils) => {
  const serviceURL = utils.makeURL(`${api.zpwServiceMap.group_cloud_message[0]}/api/cm/getrecentv2`, {
    nretry: 0,
  });

  /**
   * Lấy tin nhắn gần đây của nhóm | Get recent messages of group
   *
   * @param {string|number} groupId - ID của nhóm cần lấy tin nhắn | ID of the group to get messages
   * @param {number} [globalMsgId] - ID tin nhắn để lấy từ đó trở về trước (msgId) | Message ID to get from (msgId)
   * @param {number} [count=50] - Số lượng tin nhắn cần lấy | Number of messages to get
   * @throws {ZaloApiError}
   */
  return async function getRecentMessage(groupId, globalMsgId = 10000000000000000, count = 50) {
    if (!groupId) throw new ZaloApiError("Group ID is not available");

    const params = {
      groupId: String(groupId),
      globalMsgId: globalMsgId,
      count: count,
      msgIds: [],
      imei: appContext.imei,
      src: 1,
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
