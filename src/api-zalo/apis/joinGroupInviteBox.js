import { ZaloApiError } from "../Errors/ZaloApiError.js";
import { apiFactory } from "../utils.js";

export const joinGroupInviteBoxFactory = apiFactory()((api, appContext, utils) => {
    const serviceURL = utils.makeURL(`${api.zpwServiceMap.group[0]}/api/group/inv-box/join`);

    /**
     * Join group from invite box (accept group invitation)
     * Tham gia nhóm từ lời mời (chấp nhận lời mời tham gia nhóm)
     *
     * @param {string} groupId - Group ID to join
     *
     * @throws {ZaloApiError}
     */
    return async function joinGroupInviteBox(groupId) {
        if (!groupId) throw new ZaloApiError("Missing groupId");

        const params = {
            grid: groupId,
            lang: appContext.language || "vi",
        };

        const encryptedParams = utils.encodeAES(JSON.stringify(params));
        if (!encryptedParams) throw new ZaloApiError("Failed to encrypt params");

        const response = await utils.request(utils.makeURL(serviceURL, { params: encryptedParams }), {
            method: "GET",
        });

        return utils.resolve(response);
    };
});

