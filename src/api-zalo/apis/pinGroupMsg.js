import { ZaloApiError } from "../index.js";
import { apiFactory, getClientMessageType } from "../utils.js";

export const pinGroupMsgFactory = apiFactory()((api, appContext, utils) => {
  const serviceURL = utils.makeURL(`${api.zpwServiceMap.group_board[0]}/api/board/topic/createv2`);

  /**
   * Pin message in group by ID | Ghim tin nhắn trong nhóm theo ID
   *
   * @param {Object} pinMsg Message object to pin | Đối tượng tin nhắn cần ghim
   * @param {string|number} groupId Group ID to pin message | ID nhóm để ghim tin nhắn
   * @throws {ZaloApiError}
   */
  return async function pinGroupMsg(pinMsg, groupId) {
    if (!pinMsg) throw new ZaloApiError("Missing pinMsg");
    if (!groupId) throw new ZaloApiError("Missing groupId");

    const msgType = pinMsg.msgType || pinMsg.cliMsgType;
    if (!msgType) throw new ZaloApiError("Missing msgType in pinMsg");

    const cliMsgId = pinMsg.cliMsgId;
    const msgId = pinMsg.msgId || pinMsg.globalMsgId;
    const uidFrom = pinMsg.uidFrom || pinMsg.ownerId;
    const dName = pinMsg.dName || pinMsg.fromD || "";
    const content = pinMsg.content;
    const botUid = appContext.uid;

    if (!cliMsgId || !msgId) {
      throw new ZaloApiError("Missing cliMsgId or msgId in pinMsg");
    }

    const params = {
      zpw_ver: 645,
      zpw_type: 30,
    };

    const payload = {
      params: {
        grid: String(groupId),
        type: 2,
        color: -14540254,
        emoji: "📌",
        startTime: -1,
        duration: -1,
        repeat: 0,
        src: -1,
        imei: appContext.imei,
        pinAct: 1,
      },
    };

    // Build params based on message type
    let paramsData = {
      client_msg_id: String(cliMsgId),
      global_msg_id: String(msgId),
      senderUid: String(uidFrom || botUid),
      senderName: dName,
      msg_type: getClientMessageType(msgType),
    };

    if (msgType === "webchat") {
      paramsData.title = typeof content === "string" ? content : content?.title || "";
    } else if (msgType === "chat.voice") {
      // Voice message - no additional fields needed
    } else if (msgType === "chat.photo" || msgType === "chat.video.msg") {
      if (content && typeof content === "object") {
        paramsData.thumb = content.thumb || "";
        paramsData.title = content.description || content.title || "";
      }
    } else if (msgType === "chat.sticker") {
      if (content && typeof content === "object") {
        paramsData.extra = JSON.stringify({
          id: content.id || "",
          catId: content.catId || "",
          type: content.type || "",
        });
      }
    } else if (msgType === "chat.recommended" || msgType === "chat.link") {
      if (content && typeof content === "object") {
        let extra = {};
        try {
          if (content.params) {
            extra = typeof content.params === "string" ? JSON.parse(content.params) : content.params;
          }
        } catch (e) {
          // Ignore parse error
        }

        paramsData.href = content.href || "";
        paramsData.thumb = content.thumb || "";
        paramsData.title = content.title || "";
        paramsData.linkCaption = content.href || "";
        paramsData.redirect_url = extra.redirect_url || "";
        paramsData.streamUrl = extra.streamUrl || "";
        paramsData.artist = extra.artist || "";
        paramsData.stream_icon = extra.stream_icon || "";
        paramsData.type = 2;
        paramsData.extra = JSON.stringify({
          action: content.action || "",
          params: JSON.stringify({
            mediaTitle: extra.mediaTitle || "",
            artist: extra.artist || "",
            src: extra.src || "",
            stream_icon: extra.stream_icon || "",
            streamUrl: extra.streamUrl || "",
            type: 2,
          }),
        });
      }
    } else if (msgType === "chat.location.new") {
      if (content && typeof content === "object") {
        paramsData.title = content.title || content.description || "";
      }
    } else if (msgType === "share.file") {
      if (content && typeof content === "object") {
        let extra = {};
        try {
          if (content.params) {
            extra = typeof content.params === "string" ? JSON.parse(content.params) : content.params;
          }
        } catch (e) {
          // Ignore parse error
        }

        paramsData.title = content.title || "";
        paramsData.extra = JSON.stringify({
          fileSize: "7295",
          checksum: extra.checksum || "",
          fileExt: extra.fileExt || "",
          tWidth: extra.tWidth || 0,
          tHeight: extra.tHeight || 0,
          duration: extra.duration || 0,
          fType: extra.fType || 0,
          fdata: extra.fdata || "",
        });
      }
    } else if (msgType === "chat.gif") {
      if (content && typeof content === "object") {
        paramsData.thumb = content.thumb || "";
      }
    }

    payload.params.params = JSON.stringify(paramsData);

    // Encode params
    const encryptedParams = utils.encodeAES(JSON.stringify(payload.params));
    if (!encryptedParams) throw new ZaloApiError("Failed to encrypt params");

    // Add zpw_ver and zpw_type to URL
    const finalURL = utils.makeURL(serviceURL, params, false);

    const response = await utils.request(finalURL, {
      method: "POST",
      body: new URLSearchParams({
        params: encryptedParams,
      }),
    });

    const result = await utils.resolve(response);
    return result;
  };
});

