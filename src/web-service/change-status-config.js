import { groupSettingsAll } from "../automations/event-send-msg.js";
import { initGroupSettings } from "../commands/command.js";
import { sendMessageState } from "../service-ngh/chat-zalo/chat-style/chat-style.js";
import { getSettingName } from "../service-ngh/info-service/group-info.js";

export const changeStatusConfig = async ({ api, groupId, groupName, command, isActive }) => {
  const groupSettings = groupSettingsAll.getByID(api.getBotId());
  initGroupSettings(groupSettings, groupId, groupName);

  switch (command) {
    case "activeBot":
      groupSettings[groupId].activeBot = isActive;
      break;
    case "antiSpam":
      groupSettings[groupId].antiSpam = isActive;
      break;
    case "filterBadWords":
      groupSettings[groupId].filterBadWords = isActive;
      break;
    case "removeLinks":
      groupSettings[groupId].removeLinks = isActive;
      break;
    case "antiStickerEffect":
      groupSettings[groupId].antiStickerEffect = isActive;
      break;
    case "antiBot":
      groupSettings[groupId].antiBot = isActive;
      break;
    case "autoDownload":
      groupSettings[groupId].autoDownload = isActive;
      break;
    case "autoJoinGroup":
      groupSettings[groupId].autoJoinGroup = isActive;
      break;
    case "learnEnabled":
      groupSettings[groupId].learnEnabled = isActive;
      break;
    case "replyEnabled":
      groupSettings[groupId].replyEnabled = isActive;
      break;
    case "onlyText":
      groupSettings[groupId].onlyText = isActive;
      break;
    case "memberApprove":
      groupSettings[groupId].memberApprove = isActive;
      break;
    case "welcomeGroup":
      groupSettings[groupId].welcomeGroup = isActive;
      break;
    case "byeGroup":
      groupSettings[groupId].byeGroup = isActive;
      break;
    case "activeGame":
      groupSettings[groupId].activeGame = isActive;
      break;
    case "antiNude":
      groupSettings[groupId].antiNude = isActive;
      break;
    case "antiUndo":
      groupSettings[groupId].antiUndo = isActive;
      break;
    case "sendTask":
      groupSettings[groupId].sendTask = isActive;
      break;
    case "updateGroup":
      groupSettings[groupId].updateGroup = isActive;
      break;
    case "antiMediaFile":
      groupSettings[groupId].antiMediaFile = isActive;
      break;
    case "antiVoice":
      groupSettings[groupId].antiVoice = isActive;
      break;
    case "antiTag":
      groupSettings[groupId].antiTag = isActive;
      break;
    case "antiSticker":
      groupSettings[groupId].antiSticker = isActive;
      break;
    case "antiPhotoVideo":
      groupSettings[groupId].antiPhotoVideo = isActive;
      break;
    case "antiPhoneNumber":
      groupSettings[groupId].antiPhoneNumber = isActive;
      break;
    case "antiAds":
      groupSettings[groupId].antiAds = isActive;
      break;
    case "antigif":
      groupSettings[groupId].antigif = isActive;
      break;
    case "antiforward":
      groupSettings[groupId].antiforward = isActive;
      break;
    case "antiFile":
      groupSettings[groupId].antiFile = isActive;
      break;
    default:
      return;
  }
  groupSettingsAll.setChanged();
  await sendStatusBot(api, groupId, command, isActive);
};

export async function sendStatusBot(api, threadId, command, newStatus) {
  const statusMessage = newStatus ? "được kích hoạt" : "bị vô hiệu hóa";
  const caption = `${getSettingName(command)} đã ${statusMessage} trong nhóm này.`;
  if (newStatus) {
    await sendMessageState(api, threadId, caption, true, 10000);
  } else {
    await sendMessageState(api, threadId, caption, false, 10000);
  }
}
