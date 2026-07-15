import { ZaloApiError } from "../index.js";
import { ThreadType } from "../apis/sendReport.js";
import { apiFactory } from "../utils.js";

export const ReminderRepeatMode = {
  None: 0,
  Daily: 1,
  Weekly: 2,
  Monthly: 3,
  Yearly: 4,
};

export const createReminderFactory = apiFactory()((api, appContext, utils) => {
  const serviceURL = {
    [ThreadType.User]: utils.makeURL(`${api.zpwServiceMap.group_board[0]}/api/board/oneone/create`),
    [ThreadType.Group]: utils.makeURL(`${api.zpwServiceMap.group_board[0]}/api/board/topic/createv2`),
  };

  /**
   * Tạo nhắc nhở (reminder) trong nhóm hoặc tin nhắn riêng
   * Create a reminder in a group or private message
   *
   * @param {Object} options Tùy chọn nhắc nhở
   * @param {string} options.title Tiêu đề nhắc nhở
   * @param {string} [options.emoji] Emoji (mặc định: "⏰")
   * @param {number} [options.startTime] Thời gian bắt đầu (timestamp, mặc định: hiện tại)
   * @param {number} [options.repeat] Chế độ lặp lại (0: Không, 1: Hàng ngày, 2: Hàng tuần, 3: Hàng tháng, 4: Hàng năm)
   * @param {string} threadId ID nhóm hoặc người dùng
   * @param {ThreadType} [type=ThreadType.User] Loại cuộc trò chuyện (User/Group)
   *
   * @throws {ZaloApiError}
   */
  return async function createReminder(options, threadId, type = ThreadType.User) {
    if (!options) throw new ZaloApiError("Missing options");
    if (!options.title) throw new ZaloApiError("Missing title");
    if (!threadId) throw new ZaloApiError("Missing threadId");

    const params =
      type === ThreadType.User
        ? {
            objectData: JSON.stringify({
              toUid: threadId,
              type: 0,
              color: -16245706,
              emoji: options.emoji ?? "⏰",
              startTime: options.startTime ?? Date.now(),
              duration: -1,
              params: { title: options.title },
              needPin: false,
              repeat: options.repeat ?? ReminderRepeatMode.None,
              creatorUid: appContext.uid,
              src: 1,
            }),
            imei: appContext.imei,
          }
        : {
            grid: threadId,
            type: 0,
            color: -16245706,
            emoji: options.emoji ?? "⏰",
            startTime: options.startTime ?? Date.now(),
            duration: -1,
            params: JSON.stringify({
              title: options.title,
            }),
            repeat: options.repeat ?? ReminderRepeatMode.None,
            src: 1,
            imei: appContext.imei,
            pinAct: 0,
          };

    const encryptedParams = utils.encodeAES(JSON.stringify(params));
    if (!encryptedParams) throw new ZaloApiError("Failed to encrypt params");

    const response = await utils.request(serviceURL[type], {
      method: "POST",
      body: new URLSearchParams({
        params: encryptedParams,
      }),
    });

    return await utils.resolve(response);
  };
});

