import { ZaloApiError } from "../index.js";
import { apiFactory } from "../utils.js";

export const sendBankCardFactory = apiFactory()((api, appContext, utils) => {
  const serviceURL = utils.makeURL(`${api.zpwServiceMap.zimsg[0]}/api/transfer/card`);

  /**
   * Gửi thông tin thẻ ngân hàng đến một cuộc trò chuyện | Send bank card information to a chat
   *
   * @param {Object} message Thông tin tin nhắn | Message information
   * @param {string|number} message.threadId ID của người dùng/nhóm | ID of the user/group
   * @param {number} message.type Loại tin nhắn (DirectMessage/GroupMessage) | Message type (DirectMessage/GroupMessage)
   * @param {string} binBank Mã BIN của ngân hàng | Bank BIN code
   * @param {string} accountNumber Số tài khoản | Account number
   * @param {string} accountName Tên chủ tài khoản | Account name
   * @throws {ZaloApiError}
   */
  return async function sendBankCard(message, binBank, accountNumber, accountName) {
    if (!message) throw new ZaloApiError("Missing message");
    if (!binBank) throw new ZaloApiError("Missing binBank");
    if (!accountNumber) throw new ZaloApiError("Missing accountNumber");
    if (!accountName) throw new ZaloApiError("Missing accountName");

    const params = {
      binBank: parseInt(binBank),
      numAccBank: accountNumber,
      nameAccBank: accountName,
      cliMsgId: message.data.cliMsgId,
      tsMsg: message.data.ts,
      destUid: message.threadId,
      destType: message.type,
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
