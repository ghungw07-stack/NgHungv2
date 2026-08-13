import { initGroupSettings, updateNameGroupSetting } from "../commands/command.js";
import { isAdmin } from "../index.js";
import { antiSpamUndoGroup } from "../service-dqt/anti-service/anti-spam.js";
import { antiUndoGroup } from "../service-dqt/anti-service/anti-undo.js";
import { getGroupAdmins, getGroupInfoData } from "../service-dqt/info-service/group-info.js";
import { groupSettingsAll } from "./event-send-msg.js";

const undoRateByUser = new Map();
const UNDO_RATE_WINDOW_MS = 10_000;
const MAX_UNDO_EVENTS_PER_WINDOW = 20;

function isUndoFlood(botId, senderId) {
  const now = Date.now();
  const key = `${botId}:${senderId}`;
  const recent = (undoRateByUser.get(key) || []).filter((timestamp) => now - timestamp < UNDO_RATE_WINDOW_MS);
  recent.push(now);
  undoRateByUser.set(key, recent);

  if (undoRateByUser.size > 2000) {
    for (const [entryKey, timestamps] of undoRateByUser) {
      if (!timestamps.some((timestamp) => now - timestamp < UNDO_RATE_WINDOW_MS)) undoRateByUser.delete(entryKey);
    }
  }
  return recent.length > MAX_UNDO_EVENTS_PER_WINDOW;
}

export async function undoMessageEvents(api, undo) {
  const threadId = undo.data.idTo;
  const senderId = undo.data.uidFrom;
  const idBot = api.getBotId();
  if (isUndoFlood(idBot, senderId)) return;
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
