import { ZaloApiError } from "../index.js";
import { apiFactory } from "../utils.js";

export const updateProfileFactory = apiFactory()((api, appContext, utils) => {
  const serviceURL = utils.makeURL(`${api.zpwServiceMap.profile[0]}/api/social/profile/update`);

  /**
   * Change account setting information | Thay đổi thông tin cài đặt tài khoản
   *
   * @param {Object} payload - Payload data
   * @param {Object} payload.profile - Profile information
   * @param {string} payload.profile.name - Name | Tên
   * @param {string} payload.profile.dob - Date of birth in format YYYY-MM-DD | Ngày sinh định dạng YYYY-MM-DD
   * @param {number} payload.profile.gender - Gender (0 = male, 1 = female, 2 = other) | Giới tính
   * @param {Object} payload.biz - Business information (optional) | Thông tin doanh nghiệp (tùy chọn)
   * @param {number} payload.biz.cate - Business category | Danh mục doanh nghiệp
   * @param {string} payload.biz.description - Description | Mô tả
   * @param {string} payload.biz.address - Address | Địa chỉ
   * @param {string} payload.biz.website - Website | Website
   * @param {string} payload.biz.email - Email | Email
   * @throws {ZaloApiError}
   */
  return async function updateProfile(payload) {
    if (!payload || !payload.profile) throw new ZaloApiError("Missing profile in payload");
    if (!payload.profile.name) throw new ZaloApiError("Missing name in profile");
    if (!payload.profile.dob) throw new ZaloApiError("Missing dob in profile");
    if (payload.profile.gender === undefined || payload.profile.gender === null) {
      throw new ZaloApiError("Missing gender in profile");
    }

    const params = {
      profile: JSON.stringify({
        name: payload.profile.name,
        dob: payload.profile.dob,
        gender: payload.profile.gender,
      }),
      biz: JSON.stringify({
        desc: payload.biz?.description || "",
        cate: payload.biz?.cate || "",
        addr: payload.biz?.address || "",
        website: payload.biz?.website || "",
        email: payload.biz?.email || "",
      }),
      language: appContext.language || "vi",
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

