import { initGroupSettings, updateNameGroupSetting } from "../commands/command.js";
import { isAdmin } from "../index.js";
import { antiSpamUndoGroup } from "../service-dqt/anti-service/anti-spam.js";
import { antiUndoGroup } from "../service-dqt/anti-service/anti-undo.js";
import { getGroupAdmins, getGroupInfoData } from "../service-dqt/info-service/group-info.js";
import { groupSettingsAll } from "./event-send-msg.js";

export async function undoMessageEvents(api, undo) {
  const threadId = undo.data.idTo;
  const senderId = undo.data.uidFrom;
  const idBot = api.getBotId();
  const isAdminLevelHighest = isAdmin(idBot, senderId);
  // const isAdminBot = isAdmin(idBot, senderId, threadId);
  let isSelf = idBot === senderId;
  const isGroup = undo.isGroup;

  if (isGroup) {
    const groupSettings = groupSettingsAll.getByID(idBot);
    initGroupSettings(groupSettings, threadId);
    const onFeatureUndo = groupSettings[threadId]?.antiUndo || groupSettings[threadId]?.antiSpam;

    if (onFeatureUndo) {
      const groupInfo = await getGroupInfoData(api, threadId);
      updateNameGroupSetting(groupSettings, threadId, groupInfo.name);

      const groupAdmins = await getGroupAdmins(groupInfo);
      const botIsAdminBox = groupAdmins.includes(idBot.toString());

      await Promise.all([
        antiUndoGroup(api, undo, isAdminLevelHighest, groupSettings, botIsAdminBox, isSelf),
        antiSpamUndoGroup(api, undo, isAdminLevelHighest, groupSettings, groupInfo, botIsAdminBox, isSelf),
      ]);
    }
  }
}
