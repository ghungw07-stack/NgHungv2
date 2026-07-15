import { MessageMention, MessageType } from "zlbotdqt";
import { createCanvas, loadImage } from "canvas";
import path from "path";
import fs from "fs";
import chalk from "chalk";
import { isAdmin } from "../../index.js";
import {
  sendMessageComplete,
  sendMessageCompleteRequest,
  sendMessageQuery,
  sendMessageWarning,
} from "../chat-zalo/chat-style/chat-style.js";
import { getGlobalPrefix } from "../service.js";
import { FONT_MAIN, formatMiliseconds, parseTime, randomIDTemp, removeMention } from "../../utils/format-util.js";
import schedule from "node-schedule";
import * as cv from "../../utils/canvas/index.js";
import { tempDir } from "../../utils/io-json.js";
import { deleteFile } from "../../utils/util.js";
import { groupSettingsAll } from "../../automations/event-send-msg.js";
import { getMessageCache } from "../../utils/message-cache.js";
import { deleteMessageCustomer } from "../../commands/bot-manager/utilities.js";

const PERMANENT_MUTE = -1;

function isMuted(groupSettings, threadId, senderId) {
  const muteInfo = groupSettings[threadId]?.muteList?.[senderId];
  if (!muteInfo) return false;

  if (muteInfo.timeMute === PERMANENT_MUTE) return true;

  const remainingTime = muteInfo.timeMute - Date.now();
  if (remainingTime <= 0) {
    delete groupSettings[threadId].muteList[senderId];
    return false;
  }
  return true;
}

function isAllMuted(groupSettings, threadId) {
  const muteInfo = groupSettings[threadId]?.muteList?.[-1];
  if (!muteInfo) return false;

  if (muteInfo.timeMute === PERMANENT_MUTE) return true;

  const remainingTime = muteInfo.timeMute - Date.now();
  if (remainingTime <= 0) {
    delete groupSettings[threadId].muteList[-1];
    return false;
  }
  return true;
}

export async function handleMute(api, message, groupSettings, isAdminLevelHighest, isAdminBox, botIsAdminBox, isSelf) {
  const senderId = message.data.uidFrom;
  const threadId = message.threadId;

  if (!groupSettings[threadId].muteList) {
    groupSettings[threadId].muteList = {};
  }

  if (!isAdminLevelHighest && !isSelf && botIsAdminBox) {
    if (isAllMuted(groupSettings, threadId) || isMuted(groupSettings, threadId, senderId)) {
      await deleteMessageCustomer(api, message, isAdminBox);
      return true;
    }
  }

  return false;
}

async function createMuteListImage(api, muteList, currentTime) {
  const tempCanvas = createCanvas(1, 1);
  const tempCtx = tempCanvas.getContext("2d");
  tempCtx.font = "bold 32px " + FONT_MAIN;

  // Tính toán kích thước cần thiết
  const avatarSize = 80;
  const padding = 30;
  const nameWidth = 400;
  const levelWidth = 200;
  const extraPadding = padding * 4;

  // Tính tổng số người dùng bị mute
  const memberIds = Object.keys(muteList)
    .filter((id) => id !== "-1")
    .map((id) => `${id}_0`);
  const groupMembers = await api.getInfoMembers(memberIds);
  const sortedProfiles = {};
  memberIds.forEach((id) => {
    const userId = id.split("_")[0];
    if (groupMembers.profiles[userId]) {
      sortedProfiles[userId] = groupMembers.profiles[userId];
    }
  });
  const mutedUsers = Object.entries(muteList)
    .filter(([id]) => id !== "-1")
    .map(([id, info]) => ({
      id,
      name: sortedProfiles[id].zaloName,
      timeMute: info.timeMute,
      avatar: sortedProfiles[id].avatar,
    }));

  const totalMutedUsers = mutedUsers.length + (muteList[-1] ? 1 : 0);
  const useDoubleColumn = totalMutedUsers > 10;

  // Tính width tổng
  const columnWidth = avatarSize + nameWidth + levelWidth + extraPadding;
  const width = useDoubleColumn ? columnWidth * 2 + padding * 2 : columnWidth;

  // Tính chiều cao
  const headerHeight = 180;
  const itemHeight = 120;
  const itemsPerColumn = useDoubleColumn ? Math.ceil(totalMutedUsers / 2) : totalMutedUsers;
  const height = headerHeight + itemsPerColumn * itemHeight + 40;

  // Tạo canvas chính
  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext("2d");

  // Vẽ background với gradient
  const gradient = ctx.createLinearGradient(0, 0, 0, height);
  gradient.addColorStop(0, "rgba(59, 130, 246, 0.9)");
  gradient.addColorStop(1, "rgba(17, 24, 39, 0.95)");
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, width, height);

  // Vẽ tiêu đề chính
  let yPos = padding * 2;
  ctx.textAlign = "center";
  ctx.font = "bold 48px " + FONT_MAIN;
  ctx.fillStyle = cv.getRandomGradient(ctx, width);
  ctx.fillText("MUTE-LIST-IN-GROUP", width / 2, yPos);

  // Vẽ phụ đề
  yPos += 80;
  ctx.font = "bold 36px " + FONT_MAIN;
  ctx.fillStyle = "#FFD700";
  ctx.fillText("Danh Sách Thành Viên Bị Cấm Chat", width / 2, yPos);
  yPos += 40;

  // Tạo mảng tất cả người dùng bị mute, bao gồm cả "all"
  let allMutedUsers = [...mutedUsers];
  if (muteList[-1]) {
    allMutedUsers.unshift({
      id: "-1",
      name: "Tất Cả Thành Viên",
      timeMute: muteList[-1].timeMute,
    });
  }

  if (useDoubleColumn) {
    const midPoint = Math.ceil(allMutedUsers.length / 2);

    // Vẽ cột trái
    let leftYPos = yPos;
    for (let i = 0; i < midPoint; i++) {
      if (allMutedUsers[i]) {
        leftYPos = await drawMutedItem(
          ctx,
          allMutedUsers[i],
          leftYPos,
          i + 1,
          padding,
          0,
          useDoubleColumn,
          currentTime
        );
      }
    }

    // Vẽ cột phải
    let rightYPos = yPos;
    for (let i = midPoint; i < allMutedUsers.length; i++) {
      if (allMutedUsers[i]) {
        rightYPos = await drawMutedItem(
          ctx,
          allMutedUsers[i],
          rightYPos,
          i + 1,
          padding,
          columnWidth + padding * 2 - 30,
          useDoubleColumn,
          currentTime
        );
      }
    }

    // Vẽ đường phân cách giữa 2 cột
    ctx.fillStyle = "rgba(255, 255, 255, 0.2)";
    ctx.fillRect(width / 2, yPos - 20, 2, height - yPos);
  } else {
    // Vẽ 1 cột
    let index = 1;
    for (const mutedUser of allMutedUsers) {
      yPos = await drawMutedItem(ctx, mutedUser, yPos, index++, padding, 0, useDoubleColumn, currentTime);
    }
  }

  // Lưu và trả về đường dẫn ảnh
  const outputPath = path.join(tempDir, `mute_list_${randomIDTemp()}.png`);
  const out = fs.createWriteStream(outputPath);
  const stream = canvas.createPNGStream();
  stream.pipe(out);

  return new Promise((resolve, reject) => {
    out.on("finish", () => resolve(outputPath));
    out.on("error", reject);
  });
}

async function drawMutedItem(ctx, mutedUser, yPos, index, padding, xOffset, isDoubleColumn, currentTime) {
  const itemHeight = 120;
  try {
    const avatarSize = 80;
    const itemPadding = 20;

    // Vẽ background cho item
    ctx.fillStyle = "rgba(29, 18, 18, 0.1)";
    ctx.beginPath();

    // Tính toán width của background
    const backgroundWidth = isDoubleColumn ? (ctx.canvas.width - padding * 4) / 2 : ctx.canvas.width - padding * 2;

    ctx.roundRect(padding + xOffset, yPos, backgroundWidth, itemHeight - itemPadding, 10);
    ctx.fill();

    // Vẽ avatar hoặc icon
    const avatarX = padding * 2 + xOffset;
    const avatarY = yPos + (itemHeight - avatarSize) / 2 - itemPadding / 2;

    // Vẽ viền avatar
    ctx.save();
    ctx.beginPath();
    ctx.arc(avatarX + avatarSize / 2, avatarY + avatarSize / 2, avatarSize / 2 + 3, 0, Math.PI * 2);
    const borderGradient = ctx.createLinearGradient(avatarX, avatarY, avatarX + avatarSize, avatarY + avatarSize);
    borderGradient.addColorStop(0, "#FFA500");
    borderGradient.addColorStop(1, "#FF6347");
    ctx.fillStyle = borderGradient;
    ctx.fill();
    ctx.restore();

    // Nếu là "Tất cả thành viên" thì vẽ icon mute lớn
    if (mutedUser.id === "-1") {
      ctx.save();
      ctx.fillStyle = "#FFFFFF";
      ctx.font = "bold 40px " + FONT_MAIN;
      ctx.textAlign = "center";
      ctx.fillText("🔇", avatarX + avatarSize / 2, avatarY + avatarSize / 2 + 15);
      ctx.restore();
    } else {
      // Vẽ avatar nếu có
      ctx.save();
      ctx.beginPath();
      ctx.arc(avatarX + avatarSize / 2, avatarY + avatarSize / 2, avatarSize / 2, 0, Math.PI * 2);
      ctx.clip();

      // Vẽ background màu xám nếu không có avatar
      ctx.fillStyle = "#4A5568";
      ctx.fillRect(avatarX, avatarY, avatarSize, avatarSize);

      // Vẽ chữ cái đầu nếu không có avatar
      if (!mutedUser.avatar) {
        ctx.fillStyle = "#FFFFFF";
        ctx.font = "bold 40px " + FONT_MAIN;
        ctx.textAlign = "center";
        ctx.fillText(mutedUser.name.charAt(0).toUpperCase(), avatarX + avatarSize / 2, avatarY + avatarSize / 2 + 15);
      } else {
        // Vẽ avatar nếu có
        const avatar = await loadImage(mutedUser.avatar);
        ctx.drawImage(avatar, avatarX, avatarY, avatarSize, avatarSize);
      }
      ctx.restore();

      // Vẽ icon mute nhỏ ở góc dưới phải avatar
      ctx.save();
      const iconSize = 30;
      const iconX = avatarX + avatarSize - iconSize;
      const iconY = avatarY + avatarSize - iconSize;

      // Vẽ background tròn cho icon
      ctx.beginPath();
      ctx.arc(iconX + iconSize / 2, iconY + iconSize / 2, iconSize / 2, 0, Math.PI * 2);
      ctx.fillStyle = "#DC2626";
      ctx.fill();

      // Vẽ icon mute
      ctx.fillStyle = "#FFFFFF";
      ctx.font = "bold 20px " + FONT_MAIN;
      ctx.textAlign = "center";
      ctx.fillText("🔇", iconX + iconSize / 2, iconY + iconSize / 2 + 8);
      ctx.restore();
    }

    // Vẽ separator
    const separatorX = padding * 3 + avatarSize + xOffset;
    ctx.fillStyle = "rgba(255, 255, 255, 0.2)";
    ctx.fillRect(separatorX, yPos + itemPadding - 8, 2, itemHeight - itemPadding * 2);

    // Vẽ thông tin
    const textX = separatorX + padding * 2 - 20;
    const textY = yPos + itemPadding;

    ctx.textAlign = "left";
    ctx.font = "bold 32px " + FONT_MAIN;
    ctx.fillStyle = "#FFFFFF";
    ctx.fillText(`${index}. ${mutedUser.name}`, textX, textY + 20);

    // Hiển thị thời gian mute
    ctx.font = "28px " + FONT_MAIN;
    ctx.fillStyle = "#FFA500";
    const timeStr =
      mutedUser.timeMute === PERMANENT_MUTE
        ? "Vô Thời Hạn"
        : `Còn ${formatMiliseconds(mutedUser.timeMute - currentTime)}`;
    ctx.fillText(timeStr, textX, textY + 60);

    return yPos + itemHeight;
  } catch (error) {
    console.error("Lỗi khi vẽ thông tin người dùng bị mute:", error);
    return yPos + itemHeight;
  }
}

export async function handleMuteList(api, message, groupSettings) {
  const threadId = message.threadId;
  const muteList = groupSettings[threadId].muteList || {};

  if (Object.keys(muteList).length === 0) {
    await sendMessageWarning(api, message, "Hiện không có người dùng nào bị cấm chat.");
    return;
  }

  const currentTime = Date.now();
  let imagePath = null;

  try {
    imagePath = await createMuteListImage(api, muteList, currentTime);
    await sendMessageCompleteRequest(
      api,
      message,
      {
        caption: "Đây là danh sách người dùng bị cấm chat.",
        imagePath,
      },
      1800000
    );
  } catch (error) {
    console.error("Lỗi khi tạo ảnh mute list:", error);
    // Fallback về text nếu có lỗi
    let muteListMessage = "Danh sách người dùng bị cấm chat:\n";

    if (muteList[-1]) {
      const muteInfo = muteList[-1];
      const timeStr =
        muteInfo.timeMute === PERMANENT_MUTE
          ? "vô thời hạn"
          : `còn ${formatMiliseconds(muteInfo.timeMute - currentTime)}`;
      muteListMessage += `- Tất cả thành viên (${timeStr})\n`;
    }

    const mutedUsers = Object.entries(muteList)
      .filter(([id]) => id !== "-1")
      .map(([id, muteInfo], index) => {
        const timeStr =
          muteInfo.timeMute === PERMANENT_MUTE
            ? "vô thời hạn"
            : `còn ${formatMiliseconds(muteInfo.timeMute - currentTime)}`;
        return `${index + 1}. ${muteInfo.name} (${timeStr})`;
      });

    muteListMessage += mutedUsers.join("\n");
    await api.sendMessage({ msg: muteListMessage, quote: message, ttl: 1800000 }, threadId, MessageType.GroupMessage);
  } finally {
    if (imagePath) {
      deleteFile(imagePath);
    }
  }
}

export async function addOrUpdateMute(api, message, userId, userName, duration, groupSettings) {
  const threadId = message.threadId;
  const currentTime = Date.now();
  let isChangeSetting = false;

  if (!groupSettings[threadId].muteList[userId]) {
    groupSettings[threadId].muteList[userId] = {
      name: userName,
      timeMute: duration === PERMANENT_MUTE ? PERMANENT_MUTE : currentTime + duration,
    };
    const timeMsg = duration === PERMANENT_MUTE ? "vô thời hạn" : `trong ${formatMiliseconds(duration)}`;
    await sendMessageComplete(api, message, `Đã cấm chat người dùng ${userName} ${timeMsg}.`);
    isChangeSetting = true;
  } else {
    const existingMute = groupSettings[threadId].muteList[userId];
    const oldDuration =
      existingMute.timeMute === PERMANENT_MUTE ? "vô thời hạn" : formatMiliseconds(existingMute.timeMute - currentTime);

    existingMute.timeMute = duration === PERMANENT_MUTE ? PERMANENT_MUTE : currentTime + duration;
    const newDuration = duration === PERMANENT_MUTE ? "vô thời hạn" : `trong ${formatMiliseconds(duration)}`;

    await sendMessageComplete(
      api,
      message,
      `Đã cập nhật thời gian cấm chat cho ${userName}:\n- Cũ: ${oldDuration}\n- Mới: ${newDuration}`
    );
    isChangeSetting = true;
  }

  return isChangeSetting;
}

export async function handleMuteUser(api, message, groupSettings, groupAdmins) {
  const threadId = message.threadId;
  const content = removeMention(message);
  const prefix = getGlobalPrefix(api.getBotId());
  const parts = content.split(" ");

  let isChangeSetting = false;

  if (content.includes(`${prefix}mute all`)) {
    let timeStr = parts[2];
    const duration = parseTime(timeStr, PERMANENT_MUTE);
    isChangeSetting = await addOrUpdateMute(api, message, -1, "All Users", duration, groupSettings);
    return isChangeSetting;
  }
  const mentions = message.data.mentions;
  if (mentions && mentions.length > 0) {
    let timeStr = parts[1];
    const duration = parseTime(timeStr, PERMANENT_MUTE);

    for (const mention of mentions) {
      const userId = mention.uid;
      const userName = message.data.content.substr(mention.pos, mention.len).replace("@", "");

      if (isAdmin(api.getBotId(), userId, threadId)) {
        await sendMessageWarning(api, message, `Không thể cấm chat ${userName} vì họ là quản trị viên`);
        continue;
      }

      isChangeSetting = await addOrUpdateMute(api, message, userId, userName, duration, groupSettings);
    }
  } else {
    await sendMessageQuery(api, message, "Vui lòng đề cập (@mention) người dùng cần cấm chat.");
  }
  return isChangeSetting;
}

export async function handleUnmuteUser(api, message, groupSettings) {
  let isChangeSetting = false;
  const content = removeMention(message);
  const threadId = message.threadId;

  if (content.includes(`${getGlobalPrefix(api.getBotId())}unmute all`)) {
    if (groupSettings[threadId].muteList[-1]) {
      delete groupSettings[threadId].muteList[-1];
      isChangeSetting = true;
      await sendMessageComplete(api, message, "Đã mở chat tất cả thành viên trong nhóm.");
    } else {
      await sendMessageWarning(api, message, "Tất cả thành viên chưa bị cấm chat.");
    }
    return isChangeSetting;
  }

  const unmuteReferences = message.data.mentions;
  if (unmuteReferences && unmuteReferences.length > 0) {
    for (const mention of unmuteReferences) {
      const userId = mention.uid;
      if (groupSettings[threadId].muteList[userId]) {
        const userName = groupSettings[threadId].muteList[userId];
        delete groupSettings[threadId].muteList[userId];
        isChangeSetting = true;
        await sendMessageComplete(api, message, `Đã mở chat người dùng ${userName.name || userId || userName}.`);
      } else {
        const userName = message.data.content.substr(mention.pos, mention.pos + mention.len).replace("@", "");
        await sendMessageWarning(
          api,
          message,
          `Người dùng ${userName.name || userName || userId} không tồn tại trong danh sách cấm chat.`
        );
      }
    }
  } else {
    await sendMessageQuery(api, message, "Vui lòng đề cập (@mention) người dùng cần mở chat.");
  }
  return isChangeSetting;
}

export async function startMuteCheck(api) {
  const botId = api.getBotId();

  api.apiInstance.schedule.muteCheckJob = schedule.scheduleJob("*/5 * * * * *", async () => {
    const groupSettings = groupSettingsAll.getByID(botId);

    let changeSetting = false;
    const currentTime = Date.now();

    for (const [threadId, threadSettings] of Object.entries(groupSettings)) {
      if (!threadSettings.muteList) continue;

      for (const [userId, muteInfo] of Object.entries(threadSettings.muteList)) {
        if (muteInfo.timeMute === PERMANENT_MUTE) continue;

        if (currentTime >= muteInfo.timeMute) {
          try {
            delete threadSettings.muteList[userId];
            changeSetting = true;

            const name = userId === "-1" ? "Tất cả thành viên" : muteInfo.name;
            const capText = " đã được mở chat, hãy phát biểu tích cực hơn nhé!";
            await api.sendMessage(
              {
                msg: name + capText,
                mentions: [MessageMention(userId, name.length, 0)],
                ttl: 6000000
              },
              threadId,
              MessageType.GroupMessage
            );
          } catch (error) {
            console.error("Lỗi khi kiểm tra và xử lý danh sách mute:", error);
          }
        }
      }
    }

    if (changeSetting) {
      groupSettingsAll.setChanged();
    }
  });

  console.log(chalk.yellow("Đã khởi động schedule kiểm tra cấm chat"));
}

export async function extendMuteDuration(threadId, userId, userName, groupSettings, extensionDuration = 900) {
  const currentTime = Date.now();
  extensionDuration = extensionDuration * 1000;
  let isChangeSetting = false;

  if (!groupSettings[threadId].muteList) {
    groupSettings[threadId].muteList = {};
  }

  if (!groupSettings[threadId].muteList[userId]) {
    groupSettings[threadId].muteList[userId] = {
      name: userName,
      timeMute: currentTime + extensionDuration,
    };
    isChangeSetting = true;
  } else {
    const existingMute = groupSettings[threadId].muteList[userId];

    // Nếu đang mute vĩnh viễn thì giữ nguyên
    if (existingMute.timeMute === PERMANENT_MUTE) {
      return isChangeSetting;
    }

    const remainingTime = Math.max(0, existingMute.timeMute - currentTime);
    existingMute.timeMute = currentTime + remainingTime + extensionDuration;
    isChangeSetting = true;
  }

  if (isChangeSetting) {
    groupSettingsAll.setChanged();
  }
  return isChangeSetting;
}
