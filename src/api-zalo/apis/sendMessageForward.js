import { ZaloApiError, MessageType, ANTI_DELETE_MESSAGE } from "../index.js";
import { apiFactory } from "../utils.js";

export const sendMessageForwardFactory = apiFactory()((api, appContext, utils) => {
  const directMessageServiceURL = utils.makeURL(`${api.zpwServiceMap.file[0]}/api/message/mforward`);
  const groupMessageServiceURL = utils.makeURL(`${api.zpwServiceMap.file[0]}/api/group/mforward`);
  /**
   * Gửi tin nhắn chuyển tiếp | Send forward message
   *
   * @param {Message} message Nội Dung Tin Nhắn | Message content
   * @param {string|number} threadId ID Cuộc Trò Chuyện Sẽ Được Chuyển Tiếp | ID of the chat that will be forwarded
   * @param {number} [ttl=0] Thời gian tồn tại của tin nhắn (tùy chọn) | Message TTL (optional)
   * @throws {ZaloApiError}
   */
  return async function sendMessageForward(message, threadId, type, ttl = 0) {
    if (!message) throw new ZaloApiError("Missing message");
    if (!threadId) throw new ZaloApiError("Missing threadId");

    let params;
    let clientId = message.clientId || Date.now();
    const linkThumbDefault = "https://f16-zpcloud.zdn.vn/8964079290828659816/bab9c77ad5885ed60799.jpg";
    if (message.link) {
      const linkData = message?.linkData || (await api.parseLink(message.link));
      let src = linkData?.data?.src;
      if (!linkData) {
        try {
          src = new URL(message.link).hostname;
        } catch (error) {
          src = message.src || "NGH Bot Zalo";
        }
      }
      params = {
        grids: [
          {
            clientId,
            ttl: ttl,
          },
        ],
        ttl: ttl,
        msgType: "3",
        totalIds: 1,
        msgInfo: JSON.stringify({
          link: linkData?.data?.href || message.link,
          linkTitle: message.title || linkData?.data?.title || message.link,
          linkDesc:
            message.desc ||
            linkData?.data?.desc ||
            "NGH Developer: Bot > " + api.apiManager.getDataConfig()?.infoOwner?.nameServer ||
            "Not Name Server",
          linkThumb: message.thumb || linkData?.data?.thumb || linkThumbDefault || "",
          linkType: "",
          message: message.msg || "",
          extData: JSON.stringify({
            redirect_url: "",
            src: src,
            mediaTitle: message.title || linkData?.data?.media?.mediaTitle || "",
            streamUrl: linkData?.data?.media?.streamUrl || "",
            type: linkData?.data?.media?.type || 0,
            linkType: 0,
            artist: linkData?.data?.media?.artist || "",
            count: linkData?.data?.media?.count || "",
            stream_icon: linkData?.data?.media?.stream_icon || "",
            mediaId: linkData?.data?.media?.mediaId || "",
            video_duration: 0,
            arid: 0,
            href: message.link,
            tType: 1,
            tWidth: 0,
            tHeight: 0,
            brand_name: "Zalo Video",
            local_path_thumb_link: "",
            thumb_renew: message.thumb || linkData?.data?.thumb,
            thumb_src_type: 1,
            width: 250,
            height: 250,
          }),
        }),
      };
    } else {
      params = {
        grids: [
          {
            clientId,
            ttl: ttl,
          },
        ],
        ttl: ttl,
        msgType: "1",
        totalIds: 1,
        msgInfo: JSON.stringify({
          message: message.msg,
          ...(message.style && { rtfProps: message.style }),
        }),
      };
    }

    let url;
    if (type === MessageType.DirectMessage) {
      url = directMessageServiceURL;
      params.toIds = params.grids;
      delete params.grids;
      params.toIds[0].toUid = threadId.toString();
      params.toIds.imei = appContext.imei;
    } else if (type === MessageType.GroupMessage) {
      url = groupMessageServiceURL;
      params.visibility = 0;
      params.grids[0].grid = threadId.toString();
      params.grids[0].imei = appContext.imei;
    } else {
      throw new Error("Invalid thread type");
    }

    const encryptedParams = utils.encodeAES(JSON.stringify(params));
    if (!encryptedParams) throw new ZaloApiError("Failed to encrypt params");

    const response = await utils.request(url, {
      method: "POST",
      body: new URLSearchParams({
        params: encryptedParams,
      }),
    });

    return await utils.resolve(response);
  };
});
