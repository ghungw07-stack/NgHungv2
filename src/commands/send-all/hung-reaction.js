import { sendMessageStateQuote } from "../../service-ngh/chat-zalo/chat-style/chat-style.js";
import { getUserInfoData } from "../../service-ngh/info-service/user-info.js";
import { createMarriageStatusImage } from "../../utils/canvas/marriage-status-canvas.js";
import { loadMarriages, saveMarriages, findMarriage } from "./hung-data.js";

const CONFIRM_TIMEOUT = 5 * 60 * 1000; // 5 phút

// msgId -> { threadId, message, requiredUids: Set, confirmedUids: Set, uid1, uid2, date, timer }
const pendingMarriage = new Map();
// msgId -> { threadId, message, requiredUid, senderUid, partnerUid, timer }
const pendingDivorce = new Map();
const pendingForcedByThread = new Map();

async function resolveName(api, uid, fallback) {
  try {
    const info = await getUserInfoData(api, uid);
    return info?.displayName || info?.name || fallback || "Người dùng";
  } catch {
    return fallback || "Người dùng";
  }
}

function deletePendingAliases(map, data) {
  for (const id of data.msgIds || []) map.delete(id);
  if (data.forced && pendingForcedByThread.get(String(data.threadId)) === data) {
    pendingForcedByThread.delete(String(data.threadId));
  }
}

export function registerMarriagePending({ msgIds, threadId, message, uidsRequired, uid1, uid2, date }) {
  const normalizedIds = [...new Set((msgIds || []).map(String))];
  let data;
  const timer = setTimeout(() => {
    deletePendingAliases(pendingMarriage, data);
  }, CONFIRM_TIMEOUT);
  data = {
    msgIds: normalizedIds,
    threadId,
    message,
    requiredUids: new Set(uidsRequired),
    confirmedUids: new Set(),
    uid1,
    uid2,
    date,
    timer,
  };
  for (const id of normalizedIds) pendingMarriage.set(id, data);
}

export function registerDivorcePending({ msgIds, threadId, message, requiredUid, allowedUids, senderUid, partnerUid, forced = false }) {
  const normalizedIds = [...new Set((msgIds || []).map(String))];
  let data;
  const timer = setTimeout(() => {
    deletePendingAliases(pendingDivorce, data);
  }, CONFIRM_TIMEOUT);
  data = {
    msgIds: normalizedIds,
    threadId,
    message,
    requiredUid,
    allowedUids: new Set((allowedUids || (requiredUid ? [requiredUid] : [])).map(String)),
    senderUid,
    partnerUid,
    forced,
    timer,
  };
  for (const id of normalizedIds) pendingDivorce.set(id, data);
  if (forced) pendingForcedByThread.set(String(threadId), data);
}

export async function handleHungReaction(api, reaction) {
  try {
    const rIcon = reaction.data?.content?.rIcon;
    if (!["/-heart", "❤️", "❤", "/heart"].includes(rIcon)) return false;

    const rMsg = reaction.data?.content?.rMsg?.[0];
    const msgIds = [rMsg?.gMsgID, rMsg?.cMsgID].filter(Boolean).map(String);
    if (msgIds.length === 0) return false;

    const reactorUid = reaction.data.uidFrom;

    // ===== KẾT HÔN =====
    const marriageData = msgIds.map((id) => pendingMarriage.get(id)).find(Boolean);
    if (marriageData) {
      if (!marriageData.requiredUids.has(reactorUid)) return false;
      marriageData.confirmedUids.add(reactorUid);

      if (marriageData.confirmedUids.size < marriageData.requiredUids.size) {
        return false; // còn chờ người kia
      }

      clearTimeout(marriageData.timer);
      deletePendingAliases(pendingMarriage, marriageData);

      const records = loadMarriages();
      if (findMarriage(records, marriageData.uid1) || findMarriage(records, marriageData.uid2)) {
        await sendMessageStateQuote(
          api, marriageData.message,
          `❌ Cầu hôn thất bại: một trong hai người đã kết hôn với người khác trước đó.`,
          false, 30000, false
        );
        return true;
      }

      records.push({
        threadId: marriageData.threadId,
        uid1: marriageData.uid1,
        uid2: marriageData.uid2,
        date: marriageData.date,
        timestamp: Date.now(),
      });
      saveMarriages(records);

      const name1 = await resolveName(api, marriageData.uid1, "Người A");
      const name2 = await resolveName(api, marriageData.uid2, "Người B");
      const info1 = await getUserInfoData(api, marriageData.uid1).catch(() => null);
      const info2 = await getUserInfoData(api, marriageData.uid2).catch(() => null);

      let imagePath = null;
      try {
        imagePath = await createMarriageStatusImage(
          { name: name1, avatar: info1?.avatar },
          { name: name2, avatar: info2?.avatar },
          marriageData.date
        );
        await api.sendMessage(
          { msg: `💍 ${name1} & ${name2} đã chính thức kết hôn! Chúc trăm năm hạnh phúc 🎉`, ttl: 600000, attachments: [imagePath], isUseProphylactic: true },
          marriageData.threadId,
          marriageData.message.type
        );
      } catch (err) {
        console.log("Lỗi gửi ảnh kết hôn:", err.message);
      }
      return true;
    }

    // ===== LY HÔN =====
    const reactionThread = String(reaction.threadId || reaction.data?.idTo || "");
    const divorceData = msgIds.map((id) => pendingDivorce.get(id)).find(Boolean) ||
      pendingForcedByThread.get(reactionThread);
    if (divorceData) {
      if (!divorceData.allowedUids.has(String(reactorUid))) return false;

      clearTimeout(divorceData.timer);
      deletePendingAliases(pendingDivorce, divorceData);

      const records = loadMarriages();
      const record = findMarriage(records, divorceData.senderUid);
      if (!record) {
        await sendMessageStateQuote(api, divorceData.message, `❌ Mối quan hệ này không còn tồn tại.`, false, 30000, false);
        return true;
      }
      const remaining = records.filter((r) => r !== record);
      saveMarriages(remaining);

      const senderName = await resolveName(api, divorceData.senderUid, "Người này");
      const partnerName = await resolveName(api, divorceData.partnerUid, "Người kia");
      await sendMessageStateQuote(
        api, divorceData.message,
        divorceData.forced
          ? `⚖️ ${senderName} và ${partnerName} đã chính thức ly hôn theo yêu cầu cưỡng chế.`
          : `💔 ${senderName} và ${partnerName} đã chính thức ly hôn.`,
        false, 60000, false
      );
      return true;
    }

    return false;
  } catch (err) {
    console.log("Lỗi xử lý reaction hung:", err.message);
    return false;
  }
}
