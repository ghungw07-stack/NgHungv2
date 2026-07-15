import { ZaloApiError } from "../Errors/ZaloApiError.js";
import { apiFactory } from "../utils.js";

/**
 * @typedef {Object} PollDetail
 * @property {string} pollId
 * @property {string} question
 * @property {Array} options
 * @property {number} expiredTime
 * @property {boolean} allowMultiChoices
 * @property {boolean} allowAddNewOption
 * @property {boolean} hideVotePreview
 * @property {boolean} isAnonymous
 */

/**
 * Options for creating a poll.
 * @typedef {Object} CreatePollOptions
 * @property {string} question - Question for the poll.
 * @property {string[]} options - List of options for the poll.
 * @property {number} [expiredTime] - Poll expiration time in milliseconds (0 = no expiration).
 * @property {boolean} [allowMultiChoices] - Allows multiple choices in the poll.
 * @property {boolean} [allowAddNewOption] - Allows members to add new options to the poll.
 * @property {boolean} [hideVotePreview] - Hides voting results until the user has voted.
 * @property {boolean} [isAnonymous] - Hides poll voters (anonymous poll).
 */

/**
 * @typedef {PollDetail} CreatePollResponse
 */

export const createPollFactory = apiFactory()((api, ctx, utils) => {
  const serviceURL = utils.makeURL(`${api.zpwServiceMap.group[0]}/api/poll/create`);

  /**
   * Create a poll in a group.
   *
   * @param {CreatePollOptions} options Poll options
   * @param {string} groupId Group ID to create poll from
   * @returns {Promise<CreatePollResponse>}
   * @throws {ZaloApiError}
   */
  return async function createPoll(options, groupId) {
    if (!options.question) throw new ZaloApiError("Question is required");
    if (!options.options || !Array.isArray(options.options) || options.options.length === 0) {
      throw new ZaloApiError("Options array is required and must not be empty");
    }
    if (!groupId) throw new ZaloApiError("Group ID is required");

    const params = {
      group_id: groupId,
      question: options.question,
      options: options.options,
      expired_time: options.expiredTime ?? 0,
      pinAct: false,
      allow_multi_choices: !!options.allowMultiChoices,
      allow_add_new_option: !!options.allowAddNewOption,
      is_hide_vote_preview: !!options.hideVotePreview,
      is_anonymous: !!options.isAnonymous,
      poll_type: 0,
      src: 1,
      imei: ctx.imei,
    };

    const encryptedParams = utils.encodeAES(JSON.stringify(params));
    if (!encryptedParams) throw new ZaloApiError("Failed to encrypt params");

    const response = await utils.request(serviceURL, {
      method: "POST",
      body: new URLSearchParams({
        params: encryptedParams,
      }),
    });

    return utils.resolve(response);
  };
});

