import { ZaloApiError } from "../index.js";
import { apiFactory, encryptPin } from "../utils.js";

export const updateHiddenConversPinFactory = apiFactory()((api, appContext, utils) => {
  const serviceURL = utils.makeURL(`${api.zpwServiceMap.conversation[0]}/api/hiddenconvers/update-pin`);

  /** Đặt/cập nhật PIN 4 chữ số dùng chung cho các cuộc trò chuyện ẩn. */
  return async function updateHiddenConversPin(pin) {
    const normalizedPin = String(pin ?? "");
    if (!/^\d{4}$/.test(normalizedPin)) {
      throw new ZaloApiError("PIN must contain exactly 4 digits");
    }

    const params = { new_pin: encryptPin(normalizedPin), imei: appContext.imei };
    const encryptedParams = utils.encodeAES(JSON.stringify(params));
    if (!encryptedParams) throw new ZaloApiError("Failed to encrypt params");

    const response = await utils.request(utils.makeURL(serviceURL, { params: encryptedParams }), {
      method: "GET",
    });
    return await utils.resolve(response);
  };
});
