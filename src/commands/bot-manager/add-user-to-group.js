import { LRUCache } from "lru-cache";
import { removeMention } from "../../utils/format-util.js";
import { getGlobalPrefix } from "../../service-dqt/service.js";
import { isAdmin } from "../../index.js";

const SESSION_TTL = 10 * 60 * 1000;
const BATCH_SIZE = 5;
const BATCH_DELAY_MS = 3000;
const selectionSessions = new LRUCache({ max: 500, ttl: SESSION_TTL });
const i4ImageTargets = new LRUCache({ max: 500, ttl: SESSION_TTL });

function sentMessageId(result) {
  return result?.message?.msgId || result?.attachment?.[0]?.msgId || null;
}

function normalizeMembers(value) {
  const groupFromMap = value?.gridInfoMap && Object.values(value.gridInfoMap)[0];
  const candidates = [
    Array.isArray(value) ? value : null,
    value?.members,
    value?.currentMems,
    value?.memVerList,
    value?.data?.members,
    value?.data?.currentMems,
    value?.data?.memVerList,
    value?.groupInfo?.members,
    groupFromMap?.members,
    groupFromMap?.memVerList,
  ].find(Array.isArray) || [];

  return candidates
    .map((member) => {
      if (typeof member === "string" || typeof member === "number") {
        const id = String(member).replace(/_0$/u, "");
        return { id, name: `UID ${id}` };
      }
      const rawId = member?.id || member?.uid || member?.userId;
      const id = rawId ? String(rawId).replace(/_0$/u, "") : null;
      if (!id) return null;
      return {
        id,
        name: member?.dName || member?.zaloName || member?.displayName || member?.name || `UID ${id}`,
      };
    })
    .filter(Boolean)
    .filter((member, index, list) => list.findIndex((item) => item.id === member.id) === index);
}

export function registerI4ImageTarget(sendResult, message, target) {
  const msgId = sentMessageId(sendResult);
  if (!msgId || !target?.id) return;
  i4ImageTargets.set(String(msgId), {
    requesterId: String(message.data.uidFrom),
    target: { id: String(target.id), name: target.name || `UID ${target.id}` },
  });
}

async function inviteMembers(api, message, members) {
  const currentInfo = await api.getInfoOneGroup(message.threadId);
  const currentIds = new Set(normalizeMembers(currentInfo).map((member) => member.id));
  const pending = members.filter((member) => !currentIds.has(member.id) && member.id !== String(api.getBotId()));
  if (!pending.length) {
    await api.sendMessage({ msg: "ℹ️ Những người đã chọn đều đang ở trong nhóm.", quote: message }, message.threadId, message.type);
    return;
  }

  let success = 0;
  let failed = 0;
  const errorCounts = new Map();
  const rememberError = (error) => {
    const reason = String(error?.message || error || "Zalo từ chối").slice(0, 160);
    errorCounts.set(reason, (errorCounts.get(reason) || 0) + 1);
  };
  try {
    await api.addReaction("CLOCK", message);
  } catch {}
  for (let index = 0; index < pending.length; index += BATCH_SIZE) {
    const batch = pending.slice(index, index + BATCH_SIZE);
    try {
      await api.addUserToGroup(message.threadId, batch.map((member) => member.id));
      success += batch.length;
    } catch (batchError) {
      // Một UID bị Zalo chặn có thể làm hỏng cả batch. Thử lại từng người để
      // `add all` vẫn mời được những UID hợp lệ còn lại.
      for (const member of batch) {
        try {
          await api.addUserToGroup(message.threadId, [member.id]);
          success++;
        } catch (memberError) {
          failed++;
          rememberError(memberError || batchError);
        }
        await new Promise((resolve) => setTimeout(resolve, 500));
      }
    }
    if (index + BATCH_SIZE < pending.length) {
      await new Promise((resolve) => setTimeout(resolve, BATCH_DELAY_MS));
    }
  }

  try {
    await api.addReaction("UNDO", message);
  } catch {}

  const errorSummary = [...errorCounts.entries()]
    .slice(0, 3)
    .map(([reason, count]) => `• ${count} người: ${reason}`)
    .join("\n");

  await api.sendMessage(
    {
      msg: `✅ Đã gửi mời: ${success}\n❌ Không mời được: ${failed}${errorSummary ? `\n\nLý do:\n${errorSummary}` : ""}`,
      quote: message,
      ttl: 60000,
    },
    message.threadId,
    message.type
  );
}

export async function handleAddUserToGroupCommand(api, message, aliasCommand) {
  // Chốt quyền ngay tại handler để không thể lọt qua do alias/cấu hình routing.
  if (!isAdmin(api.getBotId(), message.data.uidFrom)) return;

  if (message.type !== 1) {
    await api.sendMessage({ msg: "❌ Lệnh này chỉ dùng trong nhóm.", quote: message }, message.threadId, message.type);
    return;
  }

  const prefix = getGlobalPrefix(api.getBotId());
  const content = removeMention(message)
    .replace(new RegExp(`^${prefix.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}${aliasCommand}\\s*`, "iu"), "")
    .trim();
  const link = content.match(/https?:\/\/(?:www\.)?(?:zalo\.me|zaloapp\.com)\/[^\s]+/iu)?.[0];
  if (!link || !/\ball\b/iu.test(content)) {
    await api.sendMessage(
      { msg: `Cú pháp: ${prefix}${aliasCommand} <link nhóm> all`, quote: message },
      message.threadId,
      message.type
    );
    return;
  }

  try {
    const linkInfo = await api.getGroupInfoByLink(link, { page: 1 });
    const sourceGroupId = String(linkInfo?.groupId || linkInfo?.data?.groupId || "");
    let members = normalizeMembers(linkInfo);

    // API link chỉ trả một trang trong `currentMems`. Đọc tiếp tới khi
    // hasMoreMember tắt hoặc không còn nhận thêm UID mới.
    let hasMore = Number(linkInfo?.hasMoreMember || linkInfo?.data?.hasMoreMember || 0) === 1;
    const totalMembers = Number(linkInfo?.totalMember || linkInfo?.data?.totalMember || 0);
    const firstPageSize = normalizeMembers(linkInfo).length;
    const estimatedPages = firstPageSize > 0 && totalMembers > 0 ? Math.ceil(totalMembers / firstPageSize) : 100;
    for (let page = 2; hasMore && page <= Math.min(estimatedPages, 100); page++) {
      const before = members.length;
      try {
        const pageInfo = await api.getGroupInfoByLink(link, { page });
        members = normalizeMembers([...members, ...normalizeMembers(pageInfo)]);
        hasMore = Number(pageInfo?.hasMoreMember || pageInfo?.data?.hasMoreMember || 0) === 1;
        if (members.length === before) break;
      } catch {
        break;
      }
    }
    if (sourceGroupId) {
      try {
        const fullInfo = await api.getInfoOneGroup(sourceGroupId);
        const fullMembers = normalizeMembers(fullInfo);
        if (fullMembers.length) members = fullMembers;
      } catch {}
    }
    members = members.filter((member) => member.id !== String(api.getBotId()));
    if (!members.length) throw new Error("Bot không đọc được danh sách thành viên của nhóm nguồn");

    // Danh sách nhóm thường chỉ chứa UID; lấy tên theo từng lô để hiển thị lựa chọn.
    for (let index = 0; index < members.length; index += 500) {
      try {
        const profilesResult = await api.getInfoMembers(members.slice(index, index + 500).map((member) => member.id));
        const profiles = profilesResult?.profiles || profilesResult?.data?.profiles || {};
        for (const member of members.slice(index, index + 500)) {
          const profile = profiles[member.id] || Object.values(profiles).find((item) => String(item?.id || item?.uid) === member.id);
          if (profile) member.name = profile.zaloName || profile.displayName || profile.name || member.name;
        }
      } catch {}
    }

    const pageSize = 30;
    const totalPages = Math.ceil(members.length / pageSize);
    for (let page = 0; page < totalPages; page++) {
      const start = page * pageSize;
      const lines = members.slice(start, start + pageSize)
        .map((member, index) => `${start + index + 1}. ${member.name} — ${member.id}`);
      const result = await api.sendMessage(
        {
          msg: `👥 Tìm thấy ${members.length} thành viên — trang ${page + 1}/${totalPages}.\n\n${lines.join("\n")}\n\nReply: add 1,2,4 hoặc add all`,
          quote: page === 0 ? message : null,
          ttl: SESSION_TTL,
        },
        message.threadId,
        message.type
      );
      const msgId = sentMessageId(result);
      if (msgId) {
        selectionSessions.set(String(msgId), {
          requesterId: String(message.data.uidFrom),
          targetGroupId: String(message.threadId),
          members,
        });
      }
      if (page < totalPages - 1) await new Promise((resolve) => setTimeout(resolve, 3500));
    }
  } catch (error) {
    await api.sendMessage(
      { msg: `❌ Không lấy được thành viên: ${error?.message || error}`, quote: message },
      message.threadId,
      message.type
    );
  }
}

export async function handleAddUserToGroupReply(api, message, isAdminLevelHighest = false) {
  const quotedMsgId = message.data?.quote?.globalMsgId;
  if (!quotedMsgId) return false;
  const normalizedText = removeMention(message).trim();
  const rawText = typeof message.data?.content === "string" ? message.data.content : "";
  const addIndex = rawText.search(/(?:^|\s)add(?=\s|$)/iu);
  const text = addIndex >= 0 ? rawText.slice(addIndex).trim() : normalizedText;
  if (!/^add(?:\s|$)/iu.test(text)) return false;
  if (!isAdminLevelHighest) {
    await api.sendMessage({ msg: "❌ Chỉ quản trị viên cấp cao được mời thành viên.", quote: message }, message.threadId, message.type);
    return true;
  }

  const requesterId = String(message.data.uidFrom);
  const i4Session = i4ImageTargets.get(String(quotedMsgId));
  if (i4Session) {
    if (i4Session.requesterId !== requesterId) return true;
    await inviteMembers(api, message, [i4Session.target]);
    return true;
  }

  const session = selectionSessions.get(String(quotedMsgId));
  if (!session) return false;
  if (session.requesterId !== requesterId || session.targetGroupId !== String(message.threadId)) return true;

  const selection = text.replace(/^add\s*/iu, "").trim();
  let selected;
  if (selection.toLowerCase() === "all") {
    selected = session.members;
  } else {
    const indexes = [...new Set(selection.split(/[\s,]+/u).map(Number))]
      .filter((number) => Number.isInteger(number) && number >= 1 && number <= session.members.length);
    selected = indexes.map((number) => session.members[number - 1]);
  }
  if (!selected?.length) {
    await api.sendMessage({ msg: "❌ Chọn theo dạng: add 1,2,4 hoặc add all", quote: message }, message.threadId, message.type);
    return true;
  }
  await inviteMembers(api, message, selected);
  return true;
}
