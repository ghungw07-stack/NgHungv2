import { MessageType } from "../../api-zalo/index.js";
import { getGroupInfoData } from "./group-info.js";
import { calculateGenderStats, normalizeMemberId } from "../../utils/group-demographics.js";

const PROFILE_BATCH_SIZE = Math.max(10, Number(process.env.NGH_MEMBER_PROFILE_BATCH_SIZE) || 50);
const PROFILE_CONCURRENCY = Math.max(1, Number(process.env.NGH_MEMBER_PROFILE_CONCURRENCY) || 3);

async function fetchProfilesInBatches(api, memberIds) {
  const chunks = [];
  for (let index = 0; index < memberIds.length; index += PROFILE_BATCH_SIZE) {
    chunks.push(memberIds.slice(index, index + PROFILE_BATCH_SIZE));
  }
  const profiles = {};
  let nextChunk = 0;
  const worker = async () => {
    while (nextChunk < chunks.length) {
      const chunk = chunks[nextChunk++];
      try {
        // getInfoMembers is a lightweight group endpoint but does not expose
        // gender. getUserInfo/getprofiles-v2 returns gender for visible profiles.
        const response = await api.getUserInfo(chunk);
        const batchProfiles = {
          ...(response?.unchanged_profiles || {}),
          ...(response?.changed_profiles || {}),
          ...(response?.profiles || {}),
        };
        for (const [key, profile] of Object.entries(batchProfiles)) {
          const id = normalizeMemberId(profile?.userId ?? profile?.uid ?? key);
          if (id) profiles[id] = profile;
        }
      } catch (error) {
        console.warn(`[datamembergroup] Không lấy được batch ${chunk.length} thành viên: ${error?.message || error}`);
      }
    }
  };
  await Promise.all(Array.from({ length: Math.min(PROFILE_CONCURRENCY, chunks.length) }, () => worker()));
  return profiles;
}

export async function handleDataMemberGroupCommand(api, message) {
  if (message.type !== MessageType.GroupMessage) {
    await api.sendMessage({ msg: "Lệnh datamembergroup chỉ dùng trong nhóm." }, message.threadId, message.type);
    return;
  }

  const groupInfo = await getGroupInfoData(api, message.threadId);
  if (!groupInfo) throw new Error("Không lấy được thông tin nhóm");
  const memberIds = [...new Set((groupInfo.memVerList || []).map(normalizeMemberId).filter(Boolean))];
  if (memberIds.length === 0) {
    await api.sendMessage({ msg: "Không lấy được danh sách thành viên của nhóm." }, message.threadId, message.type);
    return;
  }

  const profiles = await fetchProfilesInBatches(api, memberIds);
  const stats = calculateGenderStats(memberIds, profiles);
  const identified = stats.male + stats.female;
  const identifiedPercent = stats.total === 0 ? 0 : ((identified * 100) / stats.total).toFixed(1);
  const result = [
    `📊 PHÂN TÍCH THÀNH VIÊN NHÓM`,
    `🏷️ ${groupInfo.name || "Nhóm không tên"}`,
    `👥 Tổng thành viên: ${stats.total.toLocaleString("vi-VN")}`,
    "",
    `👨 Nam: ${stats.male.toLocaleString("vi-VN")} (${stats.malePercent.toLocaleString("vi-VN")}%)`,
    `👩 Nữ: ${stats.female.toLocaleString("vi-VN")} (${stats.femalePercent.toLocaleString("vi-VN")}%)`,
    `❔ Không xác định: ${stats.unknown.toLocaleString("vi-VN")} (${stats.unknownPercent.toLocaleString("vi-VN")}%)`,
    "",
    `✅ Đã nhận diện giới tính: ${identified.toLocaleString("vi-VN")}/${stats.total.toLocaleString("vi-VN")} (${identifiedPercent}%)`,
  ].join("\n");
  await api.sendMessage({ msg: result, quote: message, ttl: 600000 }, message.threadId, message.type);
}
