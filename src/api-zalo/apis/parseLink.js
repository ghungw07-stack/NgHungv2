import { ZaloApiError } from "../index.js";
import { apiFactory } from "../utils.js";

export const parseLinkFactory = apiFactory()((api, appContext, utils) => {
  const serviceURL = utils.makeURL(`${api.zpwServiceMap.file[0]}/api/message/parselink`);

  /**
   * Parse link Zalo để lấy thông tin | Parse link Zalo to get information
   *
   * @param {string} link - Link Zalo cần parse | Link Zalo to parse
   * @throws {ZaloApiError}
   */
  return async function parseLink(link) {
    if (!link) throw new ZaloApiError("Link is not available");

    const params = {
      link: link,
      version: 1,
      imei: appContext.imei,
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

    //data:
    // thumb: link ảnh
    // title: tiêu đề
    // desc: mô tả
    // src: nguồn
    // href: link
    // media:
    // type:
    // count:
    // mediaTitle: "",
    // artist: "",
    // streamUrl: "",
    // stream_icon: "",
    // error_maps:
  };
});
