import { ZaloApiError } from "../index.js";
import { apiFactory } from "../utils.js";

export const UpdateSettingsType = {
  ViewBirthday: "view_birthday",
  ShowOnlineStatus: "show_online_status",
  DisplaySeenStatus: "display_seen_status",
  ReceiveMessage: "receive_message",
  AcceptCall: "accept_stranger_call",
  AddFriendViaPhone: "add_friend_via_phone",
  AddFriendViaQR: "add_friend_via_qr",
  AddFriendViaGroup: "add_friend_via_group",
  AddFriendViaContact: "add_friend_via_contact",
  DisplayOnRecommendFriend: "display_on_recommend_friend",
  ArchivedChat: "archivedChatStatus",
  QuickMessage: "quickMessageStatus",
};

export const updateSettingsFactory = apiFactory()((api, appContext, utils) => {
  const serviceURL = utils.makeURL(`https://wpa.chat.zalo.me/api/setting/update`);

  /**
   * Set account settings | Cài đặt tài khoản
   *
   * @param {string} type - The type of setting to update | Loại cài đặt cần cập nhật
   * @param {number} value - Value to set | Giá trị cần đặt
   *
   * ViewBirthday:
   * * 0: hide | ẩn
   * * 1: show full day/month/year | hiển thị đầy đủ ngày/tháng/năm
   * * 2: show day/month | hiển thị ngày/tháng
   *
   * ShowOnlineStatus:
   * * 0: hide | ẩn
   * * 1: show | hiển thị
   *
   * DisplaySeenStatus:
   * * 0: hide | ẩn
   * * 1: show | hiển thị
   *
   * ReceiveMessage:
   * * 1: everyone | mọi người
   * * 2: only friends | chỉ bạn bè
   *
   * AcceptCall:
   * * 2: only friends | chỉ bạn bè
   * * 3: everyone | mọi người
   * * 4: friends and person who contacted | bạn bè và người đã liên hệ
   *
   * AddFriendViaPhone:
   * * 0: disable | tắt
   * * 1: enable | bật
   *
   * AddFriendViaQR:
   * * 0: disable | tắt
   * * 1: enable | bật
   *
   * AddFriendViaGroup:
   * * 0: disable | tắt
   * * 1: enable | bật
   *
   * AddFriendViaContact:
   * * 0: disable | tắt
   * * 1: enable | bật
   *
   * DisplayOnRecommendFriend:
   * * 0: disable | tắt
   * * 1: enable | bật
   *
   * ArchivedChat:
   * * 0: disable | tắt
   * * 1: enable | bật
   *
   * QuickMessage:
   * * 0: disable | tắt
   * * 1: enable | bật
   *
   * @throws {ZaloApiError}
   */
  return async function updateSettings(type, value) {
    if (!type) throw new ZaloApiError("Missing type");
    if (value === undefined || value === null) throw new ZaloApiError("Missing value");

    const params = {
      [type]: value,
    };

    const encryptedParams = utils.encodeAES(JSON.stringify(params));
    if (!encryptedParams) throw new ZaloApiError("Failed to encrypt params");

    const response = await utils.request(utils.makeURL(serviceURL, { params: encryptedParams }), {
      method: "GET",
    });

    return await utils.resolve(response);
  };
});

