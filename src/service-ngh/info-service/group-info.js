import { MessageType } from "zlbotngh";
import { createGroupInfoImage, clearImagePath } from "../../utils/canvas/index.js";
import { sendMessageComplete, sendMessageWarning } from "../chat-zalo/chat-style/chat-style.js";
import { getUserInfoData } from "./user-info.js";
import { removeMention } from "../../utils/format-util.js";
import { getGlobalPrefix } from "../service.js";

const groupInfoCache = new Map();
const groupInfoRequests = new Map();
const CACHE_DURATION = Math.max(10000, Number(process.env.NGH_GROUP_CACHE_TTL_MS) || 180000);
const MAX_GROUP_CACHE_SIZE = Math.max(1000, Number(process.env.NGH_GROUP_CACHE_SIZE) || 5000);

export async function groupInfoCommand(api, message, aliasCommand, groupSettings) {
  const content = removeMention(message);
  const prefix = getGlobalPrefix(api.getBotId());
  const threadId = message.threadId;
  const type = message.type;
  const rawKeyword = content.replace(`${prefix + aliasCommand}`, "").trim();

  const args = rawKeyword.split(/\s+/).filter(Boolean);
  let requestTextMode = false;

  if (args.length > 0) {
    const textArgIndex = args.findIndex((arg) => {
      const lower = arg.toLowerCase();
      return lower === "text" || lower === "--text" || lower === "-t";
    });

    if (textArgIndex !== -1) {
      requestTextMode = true;
      args.splice(textArgIndex, 1);
    }
  }

  const keyword = args.join(" ").trim();
  const groupId = keyword || (type === MessageType.GroupMessage ? threadId : null);

  if (!groupId) {
    await sendMessageWarning(api, message, "Vui lòng điền ID Nhóm Cần Lấy Thông Tin!");
    return;
  }

  try {
    const groupInfo = await getGroupInfoData(api, groupId);
    if (requestTextMode) {
      await sendGroupInfoText(api, message, groupInfo, groupId, groupSettings, keyword.length > 0);
      return;
    }

    const owner = await getUserInfoData(api, groupInfo.creatorId);

    const { onConfigs, offConfigs } = getConfigStatus(groupId, groupSettings);
    const imagePath = await createGroupInfoImage(groupInfo, owner, onConfigs, offConfigs);

    await api.sendMessage({ msg: "", attachments: [imagePath], quote: message, ttl:600000, isUseProphylactic: true }, threadId, type);
    clearImagePath(imagePath);

    if (keyword) {
      const detailGroup = await api.getLinkGroupByID(groupId);
      await sendMessageComplete(api, message, "Link Nhóm: " + detailGroup.link);
    }
  } catch (error) {
    console.error("Lỗi khi lấy thông tin nhóm:", error);
    const errorMsg = keyword
      ? "ID Nhóm không tồn tại hoặc đã xảy ra lỗi"
      : "Đã xảy ra lỗi khi lấy thông tin nhóm. Vui lòng thử lại sau!";
    await sendMessageWarning(api, message, errorMsg);
  }
}

function formatMemberDisplayName(member, fallback = "") {
  if (!member) return fallback;
  return (
    member.dName ||
    member.name ||
    member.displayName ||
    member.alias ||
    member.fullName ||
    member.nickName ||
    fallback
  );
}

async function sendGroupInfoText(api, message, groupInfo, groupId, groupSettings, includeLink) {
  const membersMap = new Map();
  (groupInfo.memVerList || []).forEach((member) => {
    const memberId = member?.id || member?.uid || member?.uidFrom;
    if (memberId) {
      membersMap.set(String(memberId), member);
    }
  });

  const resolveMemberName = (memberId) => {
    if (!memberId) return "";
    const member = membersMap.get(String(memberId));
    return formatMemberDisplayName(member, String(memberId));
  };

  let ownerName = resolveMemberName(groupInfo.creatorId);
  if (!ownerName || ownerName === String(groupInfo.creatorId)) {
    try {
      const ownerInfo = await getUserInfoData(api, groupInfo.creatorId);
      ownerName = ownerInfo?.name || ownerInfo?.displayName || ownerName;
    } catch {
    }
  }

  let adminNames = [];
  if (Array.isArray(groupInfo.admins) && groupInfo.admins.length > 0) {
    adminNames = groupInfo.admins
      .map((admin) => formatMemberDisplayName(admin))
      .filter(Boolean);
  }
  if (adminNames.length === 0 && Array.isArray(groupInfo.adminIds)) {
    adminNames = groupInfo.adminIds.map((adminId) => resolveMemberName(adminId)).filter(Boolean);
  }
  adminNames = Array.from(new Set(adminNames));
  const adminCount = adminNames.length;
  const ADMIN_LIMIT = 8;
  let adminDisplay = adminNames.join(", ");
  if (adminNames.length > ADMIN_LIMIT) {
    const remaining = adminNames.length - ADMIN_LIMIT;
    adminDisplay = `${adminNames.slice(0, ADMIN_LIMIT).join(", ")}, ... (+${remaining})`;
  }

  const { onConfigs, offConfigs } = getConfigStatus(groupId, groupSettings);
  const typeGroup = {
    1: "Nhóm",
    2: "Cộng đồng",
  };
  const groupTypeName = typeGroup[groupInfo.groupType] || "Nhóm";
  
  const lines = [
    `[ THÔNG TIN ${groupTypeName.toUpperCase()} ]`,
    `👥 Tên: ${groupInfo.name || "Không xác định"}`,
  ];

  if (ownerName) {
    const ownerLabel = groupInfo.groupType === 2 ? "Trưởng cộng đồng" : "Trưởng nhóm";
    lines.push(`👑 ${ownerLabel}: ${ownerName}`);
  }

  lines.push(`🆔 ID: ${groupInfo.groupId || groupId}`);

  const memberCurrent = groupInfo.memberCount ?? groupInfo.totalMember;
  const memberTotal = groupInfo.totalMember;
  let memberLine = memberCurrent ?? "Không rõ";
  if (memberCurrent && memberTotal && memberTotal !== memberCurrent) {
    memberLine = `${memberCurrent}/${memberTotal}`;
  }
  lines.push(`👨‍👩‍👧‍👦 Số thành viên: ${memberLine}`);

  if (groupInfo.createdTime) {
    lines.push(`📅 Ngày tạo: ${groupInfo.createdTime}`);
  }

  if (adminCount > 0) {
    lines.push(`🛡️ Số quản trị: ${adminCount}`);
  }

  const settings = groupInfo.setting || {};

  lines.push("");
  lines.push(`[ CÀI ĐẶT ${groupTypeName.toUpperCase()} ]`);

  const settingsMap = {
    blockName: {
      label: "Chặn đổi thông tin",
      isEnabled: (val) => val === 1,
    },
    signAdminMsg: {
      label: "Hiển thị key QTV",
      isEnabled: (val) => val === 1,
    },
    addMemberOnly: {
      label: "Chỉ QTV thêm thành viên",
      isEnabled: (val) => val === 1,
    },
    setTopicOnly: {
      label: "Chỉ QTV đặt chủ đề",
      isEnabled: (val) => val === 1,
    },
    enableMsgHistory: {
      label: "Lịch sử tin nhắn",
      isEnabled: (val) => val === 1,
    },
    lockCreatePost: {
      label: "Khóa tạo bài viết",
      isEnabled: (val) => val === 1,
    },
    lockCreatePoll: {
      label: "Khóa tạo bình chọn",
      isEnabled: (val) => val === 1,
    },
    joinAppr: {
      label: "Phê duyệt tham gia",
      isEnabled: (val) => val === 1,
    },
    lockSendMsg: {
      label: "Khóa gửi tin nhắn",
      isEnabled: (val) => val === 1,
    },
    lockViewMember: {
      label: "Khóa xem thành viên",
      isEnabled: (val) => val === 1,
    },
  };

  for (const [key, config] of Object.entries(settingsMap)) {
    const value = settings[key];
    if (value !== undefined && value !== null) {
      const isEnabled = config.isEnabled(value);
      const status = isEnabled ? "Bật ✅" : "Tắt ❌";
      lines.push(`- ${config.label}: ${status}`);
    }
  }

  const caption = lines.join("\n");
  await sendMessageComplete(api, message, caption, false, 600000);
}

export function getConfigStatus(threadId, groupSettings) {
  const settings = groupSettings[threadId] || {};
  const onConfigs = [];
  const offConfigs = [];

  Object.entries(settings)
    .filter(([key, value]) => typeof value === "boolean")
    .forEach(([key, value]) => {
      const configLine = `${getSettingEmoji(key)} ${getSettingName(key)}`;
      if (value) {
        onConfigs.push(configLine);
      } else {
        offConfigs.push(configLine);
      }
    });

  return { onConfigs, offConfigs };
}

export async function getGroupAdmins(groupInfo) {
  try {
    const admins = groupInfo.adminIds || [];
    const creatorId = groupInfo.creatorId;

    if (creatorId && !admins.includes(creatorId)) {
      admins.push(creatorId);
    }

    return admins;
  } catch (error) {
    console.error("Lỗi khi lấy danh sách quản trị viên nhóm:", error);
    return [];
  }
}

export async function getGroupName(api, threadId) {
  try {
    const groupInfo = await getGroupInfoData(api, threadId);
    return groupInfo.name;
  } catch (error) {
    console.error("Lỗi khi lấy tên nhóm:", error);
    return [];
  }
}

const arrGetInfoGroup = [];
const historySettingGroup = {};

export async function getHistorySettingGroup(api, threadId) {
  if (!historySettingGroup[threadId]) {
    const groupInfo = await getGroupInfoData(api, threadId);
    historySettingGroup[threadId] = groupInfo.setting;
  }
  return historySettingGroup[threadId];
}

export async function updateHistorySettingGroup(threadId, settingNew) {
  historySettingGroup[threadId] = settingNew;
}

export async function getGroupInfoData(api, threadId) {
  const now = Date.now();
  const cacheKey = `${api.getBotId()}:${threadId}`;
  const cachedData = groupInfoCache.get(cacheKey);

  if (cachedData && now - cachedData.timestamp < CACHE_DURATION) {
    return cachedData.data;
  }
  if (groupInfoRequests.has(cacheKey)) return groupInfoRequests.get(cacheKey);

  const request = (async () => {
    try {
      const groupInfo = await api.getGroupInfo(threadId);
      const processedInfo = getAllInfoGroup(groupInfo, threadId);
      if (!historySettingGroup[threadId]) historySettingGroup[threadId] = processedInfo.setting;
      groupInfoCache.set(cacheKey, { data: processedInfo, timestamp: Date.now() });
      while (groupInfoCache.size > MAX_GROUP_CACHE_SIZE) {
        groupInfoCache.delete(groupInfoCache.keys().next().value);
      }
      return processedInfo;
    } catch (error) {
      if (cachedData) return cachedData.data;
      throw error;
    } finally {
      groupInfoRequests.delete(cacheKey);
    }
  })();
  groupInfoRequests.set(cacheKey, request);
  // Expired metadata is still good enough for the hot message path. Return it
  // immediately and refresh in the background instead of pausing a command on
  // a Zalo round-trip every TTL interval.
  if (cachedData) {
    void request;
    return cachedData.data;
  }
  return request;
}

// export async function getGroupInfoData(api, threadId, allGroupIds) {
//   const now = Date.now();
//   const cachedData = groupInfoCache.get(threadId);

//   if (cachedData && (now - cachedData.timestamp < CACHE_DURATION || arrGetInfoGroup.includes(threadId))) {
//     return cachedData.data;
//   }

//   arrGetInfoGroup.push(threadId);
//   let groupIds = [];

//   if (allGroupIds) {
//     groupIds = allGroupIds;
//   } else {
//     const allGroupsResult = allGroupIds || (await api.getAllGroups());
//     groupIds = Object.keys(allGroupsResult.gridVerMap);
//   }

//   function chunkArray(array, size) {
//     const result = [];
//     for (let i = 0; i < array.length; i += size) {
//       result.push(array.slice(i, i + size));
//     }
//     return result;
//   }

//   const chunkedGroupIds = groupIds.length > 50 ? chunkArray(groupIds, 50) : [groupIds];
//   let allGroupsInfo = {
//     gridInfoMap: {},
//   };

//   for (const chunk of chunkedGroupIds) {
//     const chunkInfo = await api.getGroupInfo(chunk);
//     if (chunkInfo && chunkInfo.gridInfoMap) {
//       Object.assign(allGroupsInfo.gridInfoMap, chunkInfo.gridInfoMap);
//     }
//   }

//   let processedInfo;

//   for (const groupId of groupIds) {
//     const fetchInfo = getAllInfoGroup(allGroupsInfo, groupId);
//     if (!historySettingGroup[groupId]) {
//       historySettingGroup[groupId] = fetchInfo.setting;
//     }

//     groupInfoCache.set(groupId, {
//       data: fetchInfo,
//       timestamp: now,
//     });

//     if (groupId === threadId) {
//       processedInfo = fetchInfo;
//     }
//   }

//   arrGetInfoGroup.splice(arrGetInfoGroup.indexOf(threadId), 1);
//   return processedInfo;
// }

function getAllInfoGroup(groupInfo, threadId) {
  try {
    const infoMap = groupInfo?.gridInfoMap || groupInfo?.data?.gridInfoMap || {};
    const info = infoMap[String(threadId)] || infoMap[threadId];
    if (!info) return null;
    const memVerList = Array.isArray(info.memVerList) ? info.memVerList : [];
    const name = info.name || "Tên Không Xác Định";
    return {
      name,
      memberCount: memVerList.length,
      createdTime: info.createdTime ? new Date(info.createdTime).toLocaleString() : "Không rõ",
      groupType: info.type,
      memVerList,
      creatorId: String(info.creatorId || ""),
      adminIds: info.adminIds || [],
      admins: info.admins || [],
      avt: info.avt,
      fullAvt: info.fullAvt,
      globalId: info.globalId,
      groupId: String(info.groupId || threadId),
      desc: info.desc,
      setting: info.setting || {},
      totalMember: Number(info.totalMember ?? info.memberCount ?? memVerList.length),
    };
  } catch (error) {
    console.error("Lỗi khi xử lý thông tin nhóm:", error);
    console.log(groupInfo);
    return null;
  }
}

export async function getDataAllGroup(api) {
  try {
    const allGroupsResult = await api.getAllGroups();
    const listData = allGroupsResult?.data || allGroupsResult;
    const gridVerMap = listData?.gridVerMap || {};
    const listedInfoMap = listData?.gridInfoMap || {};
    // Zalo can return a stale entry in either map.  When both maps are
    // available, only keep IDs present in both: this is the set that is both
    // currently listed for the account and backed by live group metadata.
    // Falling back to the non-empty map keeps the function usable when Zalo
    // omits one of the maps (which happens intermittently).
    const versionIds = Object.keys(gridVerMap);
    const infoIds = Object.keys(listedInfoMap);
    let listedIds;
    if (versionIds.length > 0 && infoIds.length > 0) {
      const infoIdSet = new Set(infoIds.map(String));
      listedIds = versionIds.filter((id) => infoIdSet.has(String(id)));
      // Do not turn a transiently inconsistent response into an empty list.
      // If Zalo gives two disjoint maps, retain the membership map for this
      // request and let the next refresh reconcile it.
      if (listedIds.length === 0) listedIds = versionIds;
    } else {
      listedIds = versionIds.length > 0 ? versionIds : infoIds;
    }
    const groupIds = [...new Set(listedIds.map(String))];

    if (groupIds.length === 0) {
      throw new Error("Không thể lấy danh sách nhóm");
    }

    const combinedInfoMap = { ...listedInfoMap };
    for (let index = 0; index < groupIds.length; index += 50) {
      const chunk = groupIds.slice(index, index + 50);
      try {
        const response = await api.getGroupInfo(chunk);
        Object.assign(combinedInfoMap, response?.gridInfoMap || response?.data?.gridInfoMap || {});
      } catch (error) {
        console.error(`Lỗi khi lấy batch nhóm ${index / 50 + 1}:`, error);
      }
    }

    const combinedResponse = { gridInfoMap: combinedInfoMap };
    const now = Date.now();
    const groups = groupIds
      .map((threadId) => {
        const info = getAllInfoGroup(combinedResponse, threadId);
        if (info) groupInfoCache.set(`${api.getBotId()}:${threadId}`, { data: info, timestamp: now });
        return info;
      })
      .filter(Boolean);
    // Keep the authoritative membership list alongside hydrated metadata. A
    // failed info batch must not make cleanup mistake a live group for a stale
    // one.
    groups.activeGroupIds = groupIds;
    return groups;
  } catch (error) {
    console.error("Lỗi khi lấy thông tin tất cả các nhóm:", error);
    return [];
  }
}

export function getSettingEmoji(settingKey) {
  const emojiMap = {
    antiSpam: "🔰",
    removeLinks: "🔗",
    filterBadWords: "🚫",
    welcomeGroup: "👋",
    byeGroup: "👋",
    learnEnabled: "💡",
    replyEnabled: "💬",
    activeBot: "🤖",
    activeGame: "🎮",
    memberApprove: "👥",
    antiNude: "🚫",
    antiUndo: "🚫",
    sendTask: "🔔",
    antiforward: "🚫",
    onlyText: "📝",
    updateGroup: "📢",
    antiMediaFile: "📁",
    sendUserMember: "📩",
    antiPhoneNumber: "📞",
    antiAds: "📢",
    antiFile: "📁",
    antiPhotoVideo: "📷",
    antiTag: "🏷️",
    antigif: "🎬",
    allowGif: "🎬",
    antiVoice: "🎤",
    tagReaction: "👍",
    enableBlockImage: "🖼️",
    enableKickImage: "🖼️"
  };
  return emojiMap[settingKey] || "⚙️";
}

export function getSettingName(settingKey) {
  const nameMap = {
    activeBot: "Tương tác với thành viên",
    activeGame: "Kích hoạt tương tác trò chơi",
    antiSpam: "Chống spam",
    removeLinks: "Chặn liên kết",
    antiStickerEffect: "Chặn sticker hiệu ứng",
    antiBot: "Chặn Bot trong nhóm",
    autoDownload: "Nhận diện và tải nội dung",
    autoJoinGroup: "Tự động tham gia link nhóm",
    filterBadWords: "Xoá tin nhắn thô tục",
    welcomeGroup: "Chào thành viên mới",
    byeGroup: "Báo thành viên rời nhóm",
    learnEnabled: "Học máy",
    replyEnabled: "Trả lời tin nhắn nhóm",
    onlyText: "Chỉ được nhắn tin văn bản",
    memberApprove: "Phê duyệt thành viên mới",
    antiNude: "Chống ảnh nhạy cảm",
    antiUndo: "Chống thu hồi tin nhắn",
    sendTask: "Gửi nội dung tự động",
    updateGroup: "Thông báo cài đặt nhóm",
    antiMediaFile: "Xóa media file chỉ định",
    antiforward: "Chặn tin nhắn chuyển tiếp",
    sendUserMember: "Quảng cảo tới tin nhắn riêng",
    antiPhoneNumber: "Chặn số điện thoại",
    antiAds: "Chặn quảng cáo",
    antiFile: "Chặn gửi file",
    antiSticker: "Chặn sticker",
    antiPhotoVideo: "Chặn ảnh & video",
    antiTag: "Chặn tag thành viên",
    antigif: "Chặn gửi gif",
    antiVoice: "Chặn voice",
    tagReaction: "Thả Reaction khi được tag",
    leaveLock: "Tự động rời box khoá chát",
    autoReplyCommand: "Tự động reply Gemini",
    enableBlockImage: "Tạo ảnh bị block",
    enableKickImage: "Tạo ảnh bị kick"
  };
  return nameMap[settingKey] || settingKey;
}
