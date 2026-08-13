import { sendMessageStateQuote } from "../../service-ngh/chat-zalo/chat-style/chat-style.js";
import { getUserInfoData } from "../../service-ngh/info-service/user-info.js";
import { createMarriageStatusImage } from "../../utils/canvas/marriage-status-canvas.js";
import { loadMarriages, saveMarriages, findMarriage } from "./hung-data.js";

const CONFIRM_TIMEOUT = 5 * 60 * 1000; // 5 phút

// msgId -> { threadId, message, requiredUids: Set, confirmedUids: Set, uid1, uid2, date, timer }
const pendingMarriage = new Map();
// msgId -> { threadId, message, requiredUid, senderUid, partnerUid, timer }
const pendingDivorce = new Map();

async function resolveName(api, uid, fallback) {
  try {
    const info = await getUserInfoData(api, uid);
    return info?.displayName || info?.name || fallback || "Người dùng";
  } catch {
    return fallback || "Người dùng";
  }
}

export function registerMarriagePending({ msgId, threadId, message, uidsRequired, uid1, uid2, date }) {
  const timer = setTimeout(() => {
    pendingMarriage.delete(msgId);
  }, CONFIRM_TIMEOUT);
  pendingMarriage.set(msgId, {
    threadId,
    message,
    requiredUids: new Set(uidsRequired),
    confirmedUids: new Set(),
    uid1,
    uid2,
    date,
    timer,
  });
}

export function registerDivorcePending({ msgId, threadId, message, requiredUid, senderUid, partnerUid }) {
  const timer = setTimeout(() => {
    pendingDivorce.delete(msgId);
  }, CONFIRM_TIMEOUT);
  pendingDivorce.set(msgId, {
    threadId,
    message,
    requiredUid,
    senderUid,
    partnerUid,
    timer,
  });
}

export async function handleHungReaction(api, reaction) {
  try {
    const rIcon = reaction.data?.content?.rIcon;
    if (rIcon !== "/-heart") return false; // chỉ nhận reaction trái tim ❤️

    const rMsg = reaction.data?.content?.rMsg?.[0];
    const msgId = rMsg?.gMsgID?.toString();
    if (!msgId) return false;

    const reactorUid = reaction.data.uidFrom;

    // ===== KẾT HÔN =====
    const marriageData = pendingMarriage.get(msgId);
    if (marriageData) {
      if (!marriageData.requiredUids.has(reactorUid)) return false;
      marriageData.confirmedUids.add(reactorUid);

      if (marriageData.confirmedUids.size < marriageData.requiredUids.size) {
        return false; // còn chờ người kia
      }

      clearTimeout(marriageData.timer);
      pendingMarriage.delete(msgId);

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
    const divorceData = pendingDivorce.get(msgId);
    if (divorceData) {
      if (reactorUid !== divorceData.requiredUid) return false;

      clearTimeout(divorceData.timer);
      pendingDivorce.delete(msgId);

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
        `💔 ${senderName} và ${partnerName} đã chính thức ly hôn.`,
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