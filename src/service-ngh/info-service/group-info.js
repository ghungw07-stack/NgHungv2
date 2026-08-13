import { MessageType } from "zlbotngh";
import { createGroupInfoImage, clearImagePath } from "../../utils/canvas/index.js";
import { sendMessageComplete, sendMessageWarning } from "../chat-zalo/chat-style/chat-style.js";
import { getUserInfoData } from "./user-info.js";
import { removeMention } from "../../utils/format-util.js";
import { getGlobalPrefix } from "../service.js";

const groupInfoCache = new Map();
const CACHE_DURATION = 10000;

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
  const cachedData = groupInfoCache.get(threadId);

  if (cachedData && (now - cachedData.timestamp < CACHE_DURATION || arrGetInfoGroup.includes(threadId))) {
    return cachedData.data;
  }

  arrGetInfoGroup.push(threadId);

  let groupInfo;
  try {
    groupInfo = await api.getGroupInfo(threadId);
  } catch (error) {
    const cachedData = groupInfoCache.get(threadId);
    if (cachedData) {
      return cachedData.data;
    } else {
      await new Promise((resolve) => setTimeout(resolve, 1000));
      groupInfo = await api.getGroupInfo(threadId);
    }
  }

  const processedInfo = getAllInfoGroup(groupInfo, threadId);
  if (!historySettingGroup[threadId]) historySettingGroup[threadId] = processedInfo.setting;

  groupInfoCache.set(threadId, {
    data: processedInfo,
    timestamp: now,
  });

  arrGetInfoGroup.splice(arrGetInfoGroup.indexOf(threadId), 1);

  return processedInfo;
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
    const name = groupInfo.gridInfoMap[threadId].name || "Tên Không Xác Định";
    return {
      name,
      memberCount: groupInfo.gridInfoMap[threadId].memVerList.length,
      createdTime: new Date(groupInfo.gridInfoMap[threadId].createdTime).toLocaleString(),
      groupType: groupInfo.gridInfoMap[threadId].type,
      memVerList: groupInfo.gridInfoMap[threadId].memVerList,
      creatorId: groupInfo.gridInfoMap[threadId].creatorId,
      adminIds: groupInfo.gridInfoMap[threadId].adminIds,
      admins: groupInfo.gridInfoMap[threadId].admins,
      avt: groupInfo.gridInfoMap[threadId].avt,
      fullAvt: groupInfo.gridInfoMap[threadId].fullAvt,
      globalId: groupInfo.gridInfoMap[threadId].globalId,
      groupId: groupInfo.gridInfoMap[threadId].groupId,
      desc: groupInfo.gridInfoMap[threadId].desc,
      setting: groupInfo.gridInfoMap[threadId].setting,
      totalMember: groupInfo.gridInfoMap[threadId].totalMember,
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

    if (!allGroupsResult || !allGroupsResult.gridVerMap) {
      throw new Error("Không thể lấy danh sách nhóm");
    }

    const groupIds = Object.keys(allGroupsResult.gridVerMap);

    const allGroupsInfo = await Promise.all(
      groupIds.map(async (threadId) => {
        try {
          const groupInfo = await getGroupInfoData(api, threadId, groupIds);
          return groupInfo;
        } catch (error) {
          console.error(`Lỗi khi lấy thông tin nhóm ${threadId}:`, error);
          return null;
        }
      })
    );

    const validGroupsInfo = allGroupsInfo.filter((info) => info !== null);

    return validGroupsInfo;
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