import { ZaloApiError, MessageType } from "../index.js";
import { apiFactory, removeUndefinedKeys, getVideoMetadata } from "../utils.js";
import path from "path";
import { deleteFile, downloadFile } from "../../utils/util.js";
import { tempDir } from "../../utils/io-json.js";
import { randomIDTemp } from "../../utils/format-util.js";

export const sendGifFactory = apiFactory()((api, appContext, utils) => {
  const directMessageServiceURL = utils.makeURL(`${api.zpwServiceMap.file[0]}/api/message/gif`, {
    nretry: "0",
  });

  const groupMessageServiceURL = utils.makeURL(`${api.zpwServiceMap.file[0]}/api/group/gif`, {
    nretry: "0",
  });

  async function processGif(gifUrl) {
    const tempGifPath = path.join(tempDir, `gif_send_${randomIDTemp()}.gif`);
    try {
      await downloadFile(gifUrl, tempGifPath);
      let thumbData = null;
      try {
        thumbData = await api.uploadThumbnail(tempGifPath);
      } catch {}

      return {
        url: thumbData?.url || gifUrl,
        width: thumbData.width,
        height: thumbData.height,
      };
    } catch (error) {
      throw new ZaloApiError(`Failed to process GIF: ${error.message}`);
    } finally {
      deleteFile(tempGifPath);
    }
  }

  /**
   * Gửi GIF Remote | Send GIF Remote
   *
   * @param {string} gifUrl URL của file GIF | URL of the GIF file
   * @param {string} message Tin nhắn kèm theo (tùy chọn) | Message with (optional)
   * @param {number} [ttl=0] Thời gian tồn tại của tin nhắn | Message TTL
   * @throws {ZaloApiError}
   */
  return async function sendGif(gifUrl, message, caption = "", ttl = 0, metaData = null) {
    if (!gifUrl) throw new ZaloApiError("Missing GIF URL");
    if (!message) throw new ZaloApiError("Missing message");

    const { url: thumbUrl, width, height } = metaData ? metaData : await processGif(gifUrl);

    const threadId = message.threadId;
    const threadType = message.type;
    const contentId = Date.now().toString();
    const clientId = Date.now().toString();

    const params = {
      thumb: thumbUrl,
      width: Number(width),
      height: Number(height),
      msg: caption,
      type: 0,
      href: gifUrl,
      contentId: contentId,
      src: 1,
      ttl: ttl,
      clientId: clientId,
      imei: appContext.imei,
    };

    let url;
    if (threadType === MessageType.DirectMessage) {
      url = directMessageServiceURL;
      params.toid = String(threadId);
    } else if (threadType === MessageType.GroupMessage) {
      url = groupMessageServiceURL;
      params.visibility = 0;
      params.grid = String(threadId);
    } else {
      throw new ZaloApiError("Thread type is invalid");
    }

    removeUndefinedKeys(params);

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
