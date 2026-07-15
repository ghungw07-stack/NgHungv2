import { ZaloApiError } from "../index.js";
import { apiFactory } from "../utils.js";

export const getUserByPhoneFactory = apiFactory()((api, appContext, utils) => {
  const serviceURL = utils.makeURL(`${api.zpwServiceMap.friend[0]}/api/friend/profile/get`);
  /**
   * Find user by phone number | Tìm người dùng bằng số điện thoại
   *
   * @param {string} phoneNumber Phone number | Số điện thoại
   * @throws {ZaloApiError}
   */
  return async function getUserByPhone(phoneNumber) {
    if (!phoneNumber) throw new ZaloApiError("Missing phoneNumber");
    if (phoneNumber.startsWith("0")) {
      if (appContext.language == "vi") phoneNumber = "84" + phoneNumber.slice(1);
    }
    const params = {
      phone: phoneNumber,
      avatar_size: 240,
      language: appContext.language,
      imei: appContext.imei,
      reqSrc: 40,
    };
    const encryptedParams = utils.encodeAES(JSON.stringify(params));
    if (!encryptedParams) throw new ZaloApiError("Failed to encrypt message");
    const response = await utils.request(serviceURL, {
      method: "POST",
      body: new URLSearchParams({
        params: encryptedParams,
      }),
    });
    return await utils.resolve(response);
  };
});
