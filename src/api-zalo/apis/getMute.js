import { ZaloApiError } from "../index.js";
import { apiFactory } from "../utils.js";

export const getMuteFactory = apiFactory()((api, appContext, utils) => {
  const serviceURL = utils.makeURL(`${api.zpwServiceMap.profile[0]}/api/social/profile/getmute`);

  /**
   * Get mute entries | Lấy thông tin mute
   *
   * @throws {ZaloApiError}
   */
  return async function getMute() {
    const params = {
      imei: appContext.imei,
    };

    const encryptedParams = utils.encodeAES(JSON.stringify(params));
    if (!encryptedParams) throw new ZaloApiError("Failed to encrypt params");

    const response = await utils.request(
      utils.makeURL(serviceURL, {
        params: encryptedParams,
      }),
      {
        method: "GET",
      }
    );

    return await utils.resolve(response);
  };
});

