import { ZaloApiError } from "../index.js";
import { apiFactory } from "../utils.js";

export const cancelGroupJoinFactory = apiFactory()((api, appContext, utils) => {
  const serviceURL = utils.makeURL(`${api.zpwServiceMap.group[0]}/api/group/link/cancel`);

  return async function cancelGroupJoin(link) {
    if (!link) throw new ZaloApiError("Missing link");

    const params = {
      link: String(link),
      imei: appContext.imei,
      clientLang: appContext.language || "vi",
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
