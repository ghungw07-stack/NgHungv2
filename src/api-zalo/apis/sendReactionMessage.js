import { ZaloApiError, MessageType } from "../index.js";
import { apiFactory } from "../utils.js";
import { ReactionMap } from "../models/Reaction.js";

export const sendReactionMessageFactory = apiFactory()((api, appContext, utils) => {
  const directMessageServiceURL = utils.makeURL(`${api.zpwServiceMap.reaction[0]}/api/message/reaction`);
  const groupMessageServiceURL = utils.makeURL(`${api.zpwServiceMap.reaction[0]}/api/group/reaction`);

  /**
   * Add reaction to one or multiple messages | Thêm phản hồi vào một hoặc nhiều tin nhắn
   *
   * @param icon Reaction icon | Biểu tượng phản hồi
   * @param messages Single message object or array of message objects to react to | Tin nhắn đơn hoặc mảng các tin nhắn để phản hồi
   * @param rType Optional reaction type (default: 75) | Loại phản hồi tùy chọn (mặc định: 75)
   *
   * @throws {ZaloApiError}
   */
  return async function sendReactionMessage(icon, messages) {
    const messageArray = Array.isArray(messages) ? messages : [messages];
    if (messageArray.length === 0) throw new ZaloApiError("No messages to react to");
    const isGroupMessage = messageArray[0].type === MessageType.GroupMessage;
    const threadId = messageArray[0].threadId;

    const reaction = ReactionMap[icon] || ReactionMap.NONE;
    const { rType, text } = reaction;
    const rMsg = messageArray.map((msg) => ({
      gMsgID: parseInt(msg.data.msgId),
      cMsgID: parseInt(msg.data.cliMsgId),
      msgType: parseInt(msg.type),
    }));

    const params = {
      react_list: [
        {
          message: JSON.stringify({
            rMsg,
            rIcon: text,
            rType,
            source: 6,
          }),
          clientId: Date.now(),
        },
      ],
      toid: isGroupMessage ? undefined : String(threadId),
      grid: isGroupMessage ? String(threadId) : undefined,
    };

    const encryptedParams = utils.encodeAES(JSON.stringify(params));
    if (!encryptedParams) throw new ZaloApiError("Failed to encrypt message");

    const url = isGroupMessage ? groupMessageServiceURL : directMessageServiceURL;
    const response = await utils.request(url, {
      method: "POST",
      body: new URLSearchParams({
        params: encryptedParams,
      }),
    });

    return await utils.resolve(response);
  };
});
