import { ZaloApiError } from "../index.js";
import { apiFactory } from "../utils.js";
import { MessageType } from "../index.js";

export const MuteAction = {
  MUTE: 1,
  UNMUTE: 3,
};

export const setMuteFactory = apiFactory()((api, appContext, utils) => {
  const serviceURL = utils.makeURL(`${api.zpwServiceMap.profile[0]}/api/social/profile/setmute`);

  /**
   * Set mute for conversation | Bật/tắt thông báo cho cuộc trò chuyện
   *
   * @param {Object} params - Mute parameters
   * @param {number} params.duration - Mute duration in seconds, -1 = forever
   * @param {number} params.action - 1 = MUTE, 3 = UNMUTE
   * @param {string|number} threadID - ID of the thread to mute
   * @param {number} type - MessageType.DirectMessage (0) = User, MessageType.GroupMessage (1) = Group
   * @throws {ZaloApiError}
   */
  return async function setMute(params = {}, threadID, type = MessageType.DirectMessage) {
    if (!threadID) throw new ZaloApiError("Missing threadID");

    const { duration = -1, action = MuteAction.MUTE } = params;

    let muteDuration;

    if (action === MuteAction.UNMUTE) {
      muteDuration = -1;
    } else if (duration === -1) {
      muteDuration = -1;
    } else {
      muteDuration = duration;
    }

    const requestParams = {
      toid: String(threadID),
      duration: muteDuration,
      action: action,
      startTime: Math.floor(Date.now() / 1000),
      muteType: type === MessageType.DirectMessage ? 1 : 2,
      imei: appContext.imei,
    };

    const encryptedParams = utils.encodeAES(JSON.stringify(requestParams));
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

