import { ZaloApiError, MessageType } from "../index.js";
import { apiFactory } from "../utils.js";

export const undoMessageFactory = apiFactory()((api, appContext, utils) => {
  const URLType = {
    [MessageType.DirectMessage]: utils.makeURL(`${api.zpwServiceMap.chat[0]}/api/message/undo?`),
    [MessageType.GroupMessage]: utils.makeURL(`${api.zpwServiceMap.group[0]}/api/group/undomsg?`),
  };
  /**
   * Undo a message | Hoàn tác tin nhắn
   *
   * @param message Message or GroupMessage instance that has quote to undo | Tin nhắn hoặc instance GroupMessage có quote để hoàn tác
   *
   * @throws {ZaloApiError}
   */
  return async function undo(message) {
    if (!message.data.quote) throw new ZaloApiError("Message does not have quote");
    const quote = message.data.quote;
    const params = {
      msgId: quote.globalMsgId || quote.msgId,
      clientId: Date.now(),
      cliMsgIdUndo: quote.cliMsgId || quote.clientId,
    };

    if (message.type === MessageType.GroupMessage) {
      params["grid"] = message.threadId;
      params["visibility"] = 0;
      params["imei"] = appContext.imei;
    } else params["toid"] = message.threadId;
    const encryptedParams = utils.encodeAES(JSON.stringify(params));
    if (!encryptedParams) throw new ZaloApiError("Failed to encrypt message");
    const response = await utils.request(URLType[message.type], {
      method: "POST",
      body: new URLSearchParams({
        params: encryptedParams,
      }),
    });
    return await utils.resolve(response);
  };
});
