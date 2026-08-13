import { GroupEventType } from "../../api-zalo/models/GroupEvent.js";
import { getDataAllGroup, getGroupAdmins } from "../../service-ngh/info-service/group-info.js";
import { getUsersInfoBasic } from "../../service-ngh/info-service/user-info.js";
import { createListImage } from "../../utils/canvas/list-form-v1.js";
import { managerDataCache } from "./active-bot.js";

const DELAY_BETWEEN_CALLS = 300;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function getTargetStore(api) {
  const mngrData = api.apiManager.getDataManager();
  if (!Array.isArray(mngrData.kickTargets)) mngrData.kickTargets = [];
  if (!Array.isArray(mngrData.blockTargets)) mngrData.blockTargets = [];
  return mngrData;
}

export function isKickTarget(api, uid) {
  return getTargetStore(api).kickTargets.some((t) => t.idUserZalo === uid);
}

export function isBlockTarget(api, uid, threadId) {
  return getTargetStore(api).blockTargets.some((t) => {
    if (t.idUserZalo !== uid) return false;
    if (!t.scope || t.scope === "all") return true;
    return Array.isArray(t.threadIds) && t.threadIds.map(String).includes(String(threadId));
  });
}

export function addKickTarget(api, targetId, targetName, addedBy) {
  const mngrData = getTargetStore(api);
  if (mngrData.kickTargets.some((t) => t.idUserZalo === targetId)) return false;
  mngrData.kickTargets.push({
    idUserZalo: targetId,
    targetName: targetName || `ID ${targetId}`,
    addedBy,
    addedAt: Date.now(),
  });
  managerDataCache.setChanged(api.getBotId());
  return true;
}

export function addBlockTarget(api, targetId, targetName, addedBy, scope = "all", threadId = null) {
  const mngrData = getTargetStore(api);
  const existing = mngrData.blockTargets.find((t) => t.idUserZalo === targetId);
  if (existing) {
    if (scope === "all") {
      if (!existing.scope || existing.scope === "all") return false;
      existing.scope = "all";
      existing.threadIds = [];
      existing.addedBy = addedBy;
      existing.addedAt = Date.now();
      managerDataCache.setChanged(api.getBotId());
      return true;
    }
    if (!existing.scope || existing.scope === "all") return false;
    existing.threadIds ??= [];
    if (existing.threadIds.map(String).includes(String(threadId))) return false;
    existing.threadIds.push(String(threadId));
    existing.addedBy = addedBy;
    existing.addedAt = Date.now();
    managerDataCache.setChanged(api.getBotId());
    return true;
  }
  mngrData.blockTargets.push({
    idUserZalo: targetId,
    targetName: targetName || `ID ${targetId}`,
    addedBy,
    addedAt: Date.now(),
    scope,
    threadIds: scope === "group" && threadId ? [String(threadId)] : [],
  });
  managerDataCache.setChanged(api.getBotId());
  return true;
}

export function removeKickTarget(api, targetId) {
  const mngrData = getTargetStore(api);
  const idx = mngrData.kickTargets.findIndex((t) => t.idUserZalo === targetId);
  if (idx === -1) return null;
  const [removed] = mngrData.kickTargets.splice(idx, 1);
  managerDataCache.setChanged(api.getBotId());
  return removed;
}

export function removeBlockTarget(api, targetId) {
  const mngrData = getTargetStore(api);
  const idx = mngrData.blockTargets.findIndex((t) => t.idUserZalo === targetId);
  if (idx === -1) return null;
  const [removed] = mngrData.blockTargets.splice(idx, 1);
  managerDataCache.setChanged(api.getBotId());
  return removed;
}

export function getKickTargets(api) {
  return getTargetStore(api).kickTargets;
}

export function getBlockTargets(api) {
  return getTargetStore(api).blockTargets;
}

function isUidRef(token) {
  return /^\d{6,}$/.test(token);
}

function isIndexRef(token) {
  return /^\d{1,5}$/.test(token) && !isUidRef(token);
}

/**
 * Gỡ nhiều mục tiêu khỏi danh sách kick-target / block-target.
 * Mỗi phần tử trong `refs` có thể là:
 *  - UID Zalo (>= 6 chữ số)
 *  - Số thứ tự hiển thị trong danh sách (1-based, dựa theo thứ tự trong mảng hiện tại)
 * Index luôn được quy đổi ra UID trước khi xóa để tránh lệch vị trí khi xóa nhiều phần tử cùng lúc.
 */
export function removeTargetsByRefs(api, kind, refs) {
  const mngrData = getTargetStore(api);
  const list = kind === "kick" ? mngrData.kickTargets : mngrData.blockTargets;
  const removeFn = kind === "kick" ? removeKickTarget : removeBlockTarget;

  const idsToRemove = new Set();
  for (const ref of refs) {
    const token = String(ref).trim();
    if (!token) continue;
    if (isUidRef(token)) {
      idsToRemove.add(token);
    } else if (isIndexRef(token)) {
      const idx = parseInt(token, 10);
      const item = list[idx - 1];
      if (item) idsToRemove.add(item.idUserZalo);
    }
  }

  const removed = [];
  for (const uid of idsToRemove) {
    const result = removeFn(api, uid);
    if (result) removed.push(result);
  }
  return removed;
}

/**
 * Quét toàn bộ box (nhóm) mà bot có quyền quản trị và kick target khỏi những nhóm đó.
 * Chỉ chạy 1 lần ngay lúc thêm target (không có schedule định kỳ).
 */
export async function scanAndKickEverywhere(api, targetId, excludeThreadId) {
  const idBot = api.getBotId();
  let success = 0;
  let failed = 0;
  try {
    const groups = await getDataAllGroup(api);
    for (const group of groups) {
      const threadId = group.groupId;
      if (excludeThreadId && threadId === excludeThreadId) continue;
      try {
        const admins = await getGroupAdmins(group);
        if (!admins.map(String).includes(String(idBot))) continue;
        const memberIds = (group.memVerList || []).map((m) => m.replace(/_0$/, ""));
        if (!memberIds.includes(targetId)) continue;
        const result = await api.removeUserFromGroup(threadId, [targetId]);
        if (!result?.errorMembers?.length) success++;
        else failed++;
      } catch (err) {
        failed++;
        console.error(`[target-enforcement] Lỗi kick ${targetId} tại ${threadId}:`, err.message);
      }
      await sleep(DELAY_BETWEEN_CALLS);
    }
  } catch (err) {
    console.error("[target-enforcement] Lỗi khi quét toàn bộ box để kick:", err);
  }
  return { success, failed };
}

/**
 * Quét toàn bộ box (nhóm) mà bot có quyền quản trị và block target ở những nhóm đó.
 * Chỉ chạy 1 lần ngay lúc thêm target (không có schedule định kỳ).
 */
export async function scanAndBlockEverywhere(api, targetId, excludeThreadId) {
  const idBot = api.getBotId();
  let success = 0;
  let failed = 0;
  try {
    const groups = await getDataAllGroup(api);
    for (const group of groups) {
      const threadId = group.groupId;
      if (excludeThreadId && threadId === excludeThreadId) continue;
      try {
        const admins = await getGroupAdmins(group);
        if (!admins.map(String).includes(String(idBot))) continue;
        const result = await api.blockUsers(threadId, [targetId]);
        if (!result?.errorMembers?.length) success++;
        else failed++;
      } catch (err) {
        failed++;
        console.error(`[target-enforcement] Lỗi block ${targetId} tại ${threadId}:`, err.message);
      }
      await sleep(DELAY_BETWEEN_CALLS);
    }
  } catch (err) {
    console.error("[target-enforcement] Lỗi khi quét toàn bộ box để block:", err);
  }
  return { success, failed };
}

/**
 * Render danh sách kick-target / block-target bằng canvas list-form-v1 có sẵn.
 */
export async function renderTargetListImage(api, targets, kind) {
  if (!targets.length) return null;
  const ids = targets.map((t) => t.idUserZalo);
  let usersInfo = {};
  try {
    usersInfo = await getUsersInfoBasic(api, ids);
  } catch (err) {
    console.error("[target-enforcement] Lỗi lấy thông tin user:", err.message);
  }

  const items = targets.map((t) => {
    const info = usersInfo?.[t.idUserZalo];
    const scopeText = !t.scope || t.scope === "all"
      ? "Phạm vi: Tất cả nhóm"
      : `Phạm vi: ${t.threadIds?.length || 0} nhóm`;
    return {
      name: info?.displayName || t.targetName,
      avatar: info?.avatar || null,
      info: `UID: ${t.idUserZalo} • ${scopeText}`,
      badge: kind === "kick" ? "K" : "B",
      badgeColor: kind === "kick" ? "#FF6347" : "#DC2626",
    };
  });

  return createListImage(
    { columnCount: 2 },
    items,
    {
      mainTitle: kind === "kick" ? "KICK-TARGETS" : "BLOCK-TARGETS",
      subTitle:
        kind === "kick"
          ? "Danh Sách Mục Tiêu Bị Kick Toàn Bộ Box"
          : "Danh Sách Mục Tiêu Bị Block Toàn Bộ Box",
      icon: kind === "kick" ? "🚪" : "🚫",
    }
  );
}

/**
 * Hook gọi khi có sự kiện JOIN trong nhóm: nếu người vừa vào (hoặc vào lại sau khi bị
 * admin khác trong nhóm mở block/thêm vào) nằm trong kick-target / block-target thì
 * xử lý lại ngay lập tức. Đây là cơ chế enforcement duy nhất ngoài lúc thêm target
 * (không có schedule quét định kỳ).
 */
export async function handleTargetEnforcementOnJoin(api, event) {
  try {
    if (!event || event.type !== GroupEventType.JOIN) return;
    const threadId = event.data?.groupId;
    const members = Array.isArray(event.data?.updateMembers) ? event.data.updateMembers : [];
    if (!threadId || !members.length) return;

    const idBot = api.getBotId();
    const mngrData = getTargetStore(api);
    if (!mngrData.blockTargets.length) return;

    for (const member of members) {
      const uid = member?.id;
      if (!uid || uid === idBot) continue;

      if (isBlockTarget(api, uid, threadId)) {
        try {
          await api.blockUsers(threadId, [uid]);
          console.log(`🚫 [target-enforcement] Re-block ${uid} khi vào lại nhóm ${threadId}`);
        } catch (err) {
          console.error(`[target-enforcement] Không thể re-block ${uid} tại ${threadId}:`, err.message);
        }
      }
    }
  } catch (err) {
    console.error("[target-enforcement] Lỗi handleTargetEnforcementOnJoin:", err);
  }
}
