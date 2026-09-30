import { ZaloApiError } from "../Errors/ZaloApiError.js";
import { apiFactory } from "../utils.js";

export const upgradeBusinessBasicFactory = apiFactory()((api, appContext, utils) => {
    const serviceURL = utils.makeURL(`${api.zpwServiceMap.profile[0]}/api/social/profile/biz-register-trial-v2`, {});

    /**
     * Upgrade account to business basic (trial)
     * @param {object} [options]
     * @param {string} [options.uid] Target user ID (defaults to bot's own UID)
     * @param {string} [options.language] Language code (defaults to context language or "vi")
     * @throws {ZaloApiError}
     */
    return async function upgradeBusinessBasic(options = {}) {
        const params = {
            uid: options.uid || appContext.uid,
            language: options.language || appContext.language || "vi",
        };

        const encryptedParams = utils.encodeAES(JSON.stringify(params));
        if (!encryptedParams) throw new ZaloApiError("Failed to encrypt params");

        const response = await utils.request(serviceURL, {
            method: "POST",
            body: new URLSearchParams({
                params: encryptedParams,
            }),
        });

        return utils.resolve(response);
    };
});

