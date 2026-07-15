import { ZaloApiError } from "../index.js";
import { apiFactory } from "../utils.js";

/**
 * AutoReplyScope enum
 * 0: All users
 * 1: Specific users (uids required)
 * 2: All groups
 * 3: Specific groups (uids required)
 */
export const AutoReplyScope = {
  AllUsers: 0,
  SpecificUsers: 1,
  AllGroups: 2,
  SpecificGroups: 3,
};

export const createAutoReplyFactory = apiFactory()((api, appContext, utils) => {
  const serviceURL = utils.makeURL(`${api.zpwServiceMap.auto_reply[0]}/api/autoreply/create`);

  /**
   * Tạo auto reply (tự động trả lời) | Create auto reply
   *
   * @param {Object} payload Payload chứa thông tin auto reply
   * @param {string} payload.content Nội dung tin nhắn tự động trả lời
   * @param {boolean} payload.isEnable Bật/tắt auto reply
   * @param {number} payload.startTime Thời gian bắt đầu (timestamp)
   * @param {number} payload.endTime Thời gian kết thúc (timestamp)
   * @param {number} payload.scope Phạm vi (0: Tất cả người dùng, 1: Người dùng cụ thể, 2: Tất cả nhóm, 3: Nhóm cụ thể)
   * @param {string|string[]} [payload.uids] Danh sách UID (bắt buộc nếu scope là 1 hoặc 3)
   *
   * @note API này dùng cho zBusiness
   * @throws {ZaloApiError}
   */
  return async function createAutoReply(payload) {
    if (!payload) throw new ZaloApiError("Missing payload");
    if (!payload.content) throw new ZaloApiError("Missing content");
    if (payload.scope === undefined || payload.scope === null) throw new ZaloApiError("Missing scope");
    if (payload.startTime === undefined || payload.startTime === null) throw new ZaloApiError("Missing startTime");
    if (payload.endTime === undefined || payload.endTime === null) throw new ZaloApiError("Missing endTime");

    const uids = Array.isArray(payload.uids) ? payload.uids : (payload.uids ? [payload.uids] : []);
    const resultUids = (payload.scope === 1 || payload.scope === 3) ? uids : [];

    if ((payload.scope === 1 || payload.scope === 3) && resultUids.length === 0) {
      throw new ZaloApiError("uids is required when scope is 1 (SpecificUsers) or 3 (SpecificGroups)");
    }

    let finalStartTime = payload.startTime;
    let finalEndTime = payload.endTime;
    
    if (finalStartTime === 0) {
      finalStartTime = Date.now();
    }
    
    if (finalEndTime === Number.MAX_SAFE_INTEGER) {
      finalEndTime = finalStartTime + (100 * 365 * 24 * 60 * 60 * 1000);
    }

    const params = {
      cliLang: appContext.language || "vi",
      enable: payload.isEnable !== undefined ? payload.isEnable : true,
      content: payload.content,
      startTime: finalStartTime,
      endTime: finalEndTime,
      recurrence: ["RRULE:FREQ=DAILY;"],
      scope: payload.scope,
      uids: resultUids,
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

