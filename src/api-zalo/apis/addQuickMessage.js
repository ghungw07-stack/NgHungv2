import { ZaloApiError } from "../index.js";
import { apiFactory } from "../utils.js";

export const addQuickMessageFactory = apiFactory()((api, appContext, utils) => {
  const baseServiceURL = `${api.zpwServiceMap.quick_message[0]}/api/quickmessage/create`;

  /**
   * Thêm quick message (tin nhắn nhanh) | Add quick message
   *
   * @param {Object} addPayload Payload chứa thông tin quick message
   * @param {string} addPayload.keyword Từ khóa để gọi quick message
   * @param {string} addPayload.title Tiêu đề/nội dung của quick message
   * @param {Object} [addPayload.media] Media đính kèm (optional)
   *
   * @note Zalo có thể throw error với code 821 nếu đã đạt giới hạn quick messages
   *
   * @throws {ZaloApiError}
   */
  return async function addQuickMessage(addPayload) {
    if (!addPayload) throw new ZaloApiError("Missing addPayload");
    if (!addPayload.keyword) throw new ZaloApiError("Missing keyword");
    if (!addPayload.title) throw new ZaloApiError("Missing title");

    const isType = addPayload.media ? 1 : 0;

    const params = {
      keyword: addPayload.keyword,
      message: {
        title: addPayload.title,
        params: "",
      },
      type: isType,
      imei: appContext.imei,
    };

    if (isType === 1) {
      if (!addPayload.media) throw new ZaloApiError("Media is required when type is 1");
      params.media = {
        items: [
          {
            type: 0,
            photoId: addPayload.media.photoId || "",
            title: addPayload.media.title || "",
            width: addPayload.media.width || "",
            height: addPayload.media.height || "",
            previewThumb: addPayload.media.previewThumb || addPayload.media.thumbUrl || "",
            rawUrl: addPayload.media.rawUrl || addPayload.media.normalUrl || addPayload.media.hdUrl || "",
            thumbUrl: addPayload.media.thumbUrl || "",
            normalUrl: addPayload.media.normalUrl || addPayload.media.hdUrl || "",
            hdUrl: addPayload.media.hdUrl || addPayload.media.normalUrl || "",
          },
        ],
      };
    }

    const encryptedParams = utils.encodeAES(JSON.stringify(params));
    if (!encryptedParams) throw new ZaloApiError("Failed to encrypt params");

    const serviceURL = utils.makeURL(baseServiceURL, { params: encryptedParams });
    const response = await utils.request(serviceURL, {
      method: "GET",
    });

    return await utils.resolve(response);
  };
});

