import { addOrUpdateMute } from "./mute-user.js";

export function shouldSendBlockImage(api) {
  const action = api.apiManager?.getDataManager?.()?.antiAction?.type || "block";
  return action !== "mute";
}

/** Apply the action selected through `{prefix}bot anti ...` consistently. */
export async function applyAntiPunishment(api, message, threadId, senderId, senderName, groupSettings) {
  const managerData = api.apiManager?.getDataManager?.() || {};
  const antiAction = managerData.antiAction || { type: "block" };
  const action = antiAction.type || "block";

  if (action === "kick") {
    await api.removeUserFromGroup(threadId, [senderId]);
    return;
  }

  if (action === "mute" && groupSettings?.[threadId]) {
    const duration = antiAction.duration || 3600000;
    if (!groupSettings[threadId].muteList) groupSettings[threadId].muteList = {};
    await addOrUpdateMute(api, message, senderId, senderName, duration, groupSettings);
    return;
  }

  await api.blockUsers(threadId, [senderId]);
}
