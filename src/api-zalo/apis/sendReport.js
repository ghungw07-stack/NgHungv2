import { ZaloApiError } from "../Errors/ZaloApiError.js";
import { apiFactory, removeUndefinedKeys } from "../utils.js";

/**
 * Thread type enum
 */
export const ThreadType = {
  User: 0,
  Group: 1,
};

/**
 * Report reason enum
 */
export const ReportReason = {
  Sensitive: 1,
  Annoy: 2,
  Fraud: 3,
  Other: 0,
};

/**
 * Options for sending a report.
 * @typedef {Object} SendReportOptions
 * @property {number} reason - Report reason (ReportReason enum)
 * @property {string} [content] - Content for "Other" reason (required if reason is Other)
 */

/**
 * @typedef {Object} SendReportResponse
 * @property {string} reportId
 */

export const sendReportFactory = apiFactory()((api, ctx, utils) => {
  const serviceURL = {
    [ThreadType.User]: utils.makeURL(`${api.zpwServiceMap.profile[0]}/api/report/abuse-v2`),
    [ThreadType.Group]: utils.makeURL(`${api.zpwServiceMap.profile[0]}/api/social/profile/reportabuse`),
  };

  /**
   * Send report to Zalo
   *
   * @param {SendReportOptions} options Report options
   * @param {string} threadId The threadID to report
   * @param {number} [type=ThreadType.User] Thread type, default User
   * @returns {Promise<SendReportResponse>}
   * @throws {ZaloApiError}
   */
  return async function sendReport(options, threadId, type = ThreadType.User) {
    if (!options || typeof options.reason !== "number") {
      throw new ZaloApiError("Report reason is required");
    }
    if (!threadId) {
      throw new ZaloApiError("Thread ID is required");
    }
    if (options.reason === ReportReason.Other && !options.content) {
      throw new ZaloApiError("Content is required when reason is Other");
    }

    const params =
      type === ThreadType.User
        ? {
            idTo: threadId,
            objId: "person.profile",
            reason: options.reason.toString(),
            content: options.reason === ReportReason.Other ? options.content : undefined,
          }
        : {
            uidTo: threadId,
            type: 14,
            reason: options.reason,
            content: options.reason === ReportReason.Other ? options.content : "",
            imei: ctx.imei,
          };

    removeUndefinedKeys(params);

    const encryptedParams = utils.encodeAES(JSON.stringify(params));
    if (!encryptedParams) throw new ZaloApiError("Failed to encrypt params");

    const response = await utils.request(serviceURL[type], {
      method: "POST",
      body: new URLSearchParams({
        params: encryptedParams,
      }),
    });

    return utils.resolve(response);
  };
});

