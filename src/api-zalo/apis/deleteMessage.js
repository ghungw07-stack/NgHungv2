import { ZaloApiError, MessageType } from "../index.js";
import { apiFactory, handleZaloResponse, removeUndefinedKeys } from "../utils.js";

export const deleteMessageFactory = apiFactory()((api, appContext, utils) => {
  const URLType = {
    [MessageType.DirectMessage]: utils.makeURL(`${api.zpwServiceMap.chat[0]}/api/message/delete`),
    [MessageType.GroupMessage]: utils.makeURL(`${api.zpwServiceMap.group[0]}/api/group/deletemsg`),
  };
  /**
   * Delete a message | Xóa một tin nhắn
   *
   * @param {Message|GroupMessage} message Message or GroupMessage instance | Tin nhắn hoặc tin nhắn nhóm
   * @param {boolean} onlyMe Delete message for only you | Xóa tin nhắn cho bạn
   * @param {string} myGlobalMsgId Global message ID | ID tin nhắn toàn cục
   * @throws {ZaloApiError}
   */
  return async function deleteMessage(message, onlyMe = true, myGlobalMsgId) {
    if (!message) throw new ZaloApiError("Missing message");
    // Khi gọi delete từ một tin reply, ID cần xóa nằm trong quote chứ không
    // nằm ở message.data của chính lệnh reply (đặc biệt khi reply có tag).
    if (message.data?.quote && !message.data?.msgId) {
      const quote = message.data.quote;
      message = {
        ...message,
        data: {
          ...quote,
          msgId: quote.msgId || quote.globalMsgId,
          cliMsgId: quote.cliMsgId || quote.clientId,
          uidFrom: quote.uidFrom || quote.ownerId || message.data.uidFrom,
        },
      };
    }
    const isGroupMessage = message.type === MessageType.GroupMessage;
    // const params = {
    //   toid: !isGroupMessage ? message.threadId : undefined,
    //   grid: isGroupMessage ? message.threadId : undefined,
    //   cliMsgId: Date.now(),
    //   msgs: [
    //     {
    //       cliMsgId: String(message.data.cliMsgId),
    //       globalMsgId: String(message.data.msgId),
    //       ownerId: String(message.data.uidFrom),
    //       destId: String(message.threadId),
    //     },
    //   ],
    //   onlyMe: onlyMe ? 1 : 0,
    //   imei: !isGroupMessage ? appContext.imei : undefined,
    // };
    // removeUndefinedKeys(params);
    // const encryptedParams = encodeAES(appContext.secretKey, JSON.stringify(params));
    // if (!encryptedParams) throw new ZaloApiError("Failed to encrypt message");
    // const response = await utils.request(URLType[message.type], {
    //   method: "POST",
    //   body: new URLSearchParams({
    //     params: encryptedParams,
    //   }),
    // });
    // const result = await handleZaloResponse(response, appContext);
    // if (result.error) throw new ZaloApiError(result.error.message, result.error.code);
    // return result.data;

    async function attemptRequest(fCliMsgId, cliMsgId, globalMsgId) {
      const params = {
        toid: !isGroupMessage ? message.threadId : undefined,
        grid: isGroupMessage ? message.threadId : undefined,
        cliMsgId: fCliMsgId,
        msgs: [
          {
            cliMsgId: cliMsgId,
            globalMsgId: globalMsgId,
            ownerId: String(message.data.uidFrom),
            destId: String(message.threadId),
          },
        ],
        onlyMe: onlyMe ? 1 : 0,
        imei: !isGroupMessage ? appContext.imei : undefined,
      };
      removeUndefinedKeys(params);
      const encryptedParams = utils.encodeAES(JSON.stringify(params));
      if (!encryptedParams) throw new ZaloApiError("Failed to encrypt message");
      const response = await utils.request(URLType[message.type], {
        method: "POST",
        body: new URLSearchParams({
          params: encryptedParams,
        }),
      });
      return await handleZaloResponse(response, appContext);
    }

    const cliMsgIdNow = Date.now().toString();
    const cliMsgId = String(message.data.cliMsgId);
    const globalMsgId = String(message.data.msgId);
    let result = null;

    // Za-go dùng timestamp mới cho cliMsgId ngoài cùng; hai ID trong `msgs`
    // vẫn là ID gốc của tin nhắn cần xóa.
    result = await attemptRequest(cliMsgIdNow, cliMsgId, globalMsgId);
    if (!result.error) return result.data;

    // Fallback cho các phiên Zalo cũ chấp nhận cliMsgId gốc ở ngoài cùng.
    result = await attemptRequest(cliMsgId, cliMsgId, globalMsgId);
    if (!result.error) return result.data;

    // Case 3: Sử dụng cliMsgIdNow = Date.now().toString() và globalMsgId
    result = await attemptRequest(cliMsgIdNow, cliMsgIdNow, globalMsgId);
    if (!result.error) return result.data;

    // Case 4: Nếu có myGlobalMsgId thì sử dụng String(message.data.cliMsgId) và String(message.data.msgId)
    if (myGlobalMsgId) {
      result = await attemptRequest(cliMsgIdNow, cliMsgId, String(myGlobalMsgId));
      if (!result.error) return result.data;
    }

    // Nếu tất cả case đều thất bại
    if (result.error) {
      throw new ZaloApiError(result.error.message, result.error.code);
    }

    return result.data;
  };
});
