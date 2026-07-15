import { apiFactory } from "../utils.js";
export const getProfileMeFactory = apiFactory()((api, _, utils) => {
  const serviceURL = utils.makeURL(`${api.zpwServiceMap.profile[0]}/api/social/profile/me-v2`);
  return async function getProfileMe() {
    const response = await utils.request(serviceURL, {
      method: "GET",
    });
    return utils.resolve(response);
  };
});
