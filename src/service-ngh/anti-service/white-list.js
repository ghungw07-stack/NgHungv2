import { MessageType } from "zlbotngh";
import { isAdmin } from "../../index.js";
import {
  sendMessageComplete,
  sendMessageCompleteRequest,
  sendMessageQuery,
  sendMessageWarning,
} from "../chat-zalo/chat-style/chat-style.js";
import { getGlobalPrefix } from "../service.js";
import { FONT_MAIN, randomIDTemp, removeMention } from "../../utils/format-util.js";
import { createCanvas, loadImage } from "canvas";
import path from "path";
import fs from "fs";
import { tempDir } from "../../utils/io-json.js";
import * as cv from "../../utils/canvas/index.js";
import { deleteFile } from "../../utils/util.js";

export async function handleWhiteList(api, message, groupSettings, groupAdmins) {
  // White-list là cấu hình cấp bot, chỉ admin cấp cao; không dùng quyền admin nhóm.
  if (!isAdmin(api.getBotId(), message.data.uidFrom)) return false;

  const threadId = message.threadId;
  const content = removeMention(message);
  const prefix = getGlobalPrefix(api.getBotId());
  const parts = content.split(" ");
  const command = parts[1];
  let isChangeSetting = false;

  if (!command || (command !== "add" && command !== "remove")) {
    if (Object.keys(groupSettings[threadId].whiteList || {}).length === 0) {
      await sendMessageWarning(api, message, "Hiện không có người dùng nào trong danh sách white-list.");
      return isChangeSetting;
    }

    const idWhiteList = Object.keys(groupSettings[threadId].whiteList).map((id) => `${id}_0`);
    const whiteListInfo = await api.getInfoMembers(idWhiteList);
    const sortedProfiles = {};
    idWhiteList.forEach((id) => {
      const userId = id.split("_")[0];
      if (whiteListInfo.profiles[userId]) {
        sortedProfiles[userId] = whiteListInfo.profiles[userId];
      }
    });
    whiteListInfo.profiles = sortedProfiles;
    let imagePath = null;
    try {
      imagePath = await createWhiteListImage(api, whiteListInfo, groupSettings, threadId);
      await sendMessageCompleteRequest(
        api,
        message,
        {
          caption: "Đây là danh sách trắng của nhóm.",
          imagePath,
        },
        600000
      );
    } catch (error) {
      console.error("Lỗi khi tạo ảnh white-list:", error);
      let whiteListMessage = "Danh sách người dùng trong white-list:\n";
      const whiteListUsers = idWhiteList
        .map((id, index) => {
          const userId = id.split("_")[0];
          const profile = whiteListInfo.profiles[userId];
          return `${index + 1}. ${profile.zaloName}`;
        })
        .join("\n");

      whiteListMessage += whiteListUsers;
      await api.sendMessage({ msg: whiteListMessage, quote: message, ttl: 300000 }, threadId, message.type);
    } finally {
      deleteFile(imagePath);
    }
    return isChangeSetting;
  }

  const mentions = message.data.mentions;

  if (command === "remove") {
    const indexToRemove = parseInt(parts[2]);
    if (!isNaN(indexToRemove)) {
      const whiteList = groupSettings[threadId].whiteList || {};
      const whiteListArray = Object.entries(whiteList);

      if (indexToRemove > 0 && indexToRemove <= whiteListArray.length) {
        const [userId, userInfo] = whiteListArray[indexToRemove - 1];
        delete groupSettings[threadId].whiteList[userId];
        await sendMessageComplete(api, message, `Đã xóa ${userInfo.name} khỏi danh sách white-list.`);
        return true;
      } else {
        await sendMessageWarning(
          api,
          message,
          `Số thứ tự không hợp lệ. Vui lòng chọn số từ 1 đến ${whiteListArray.length}.`
        );
        return false;
      }
    }
  }

  if (!mentions || mentions.length === 0) {
    await sendMessageQuery(
      api,
      message,
      "Vui lòng đề cập (@mention) người dùng hoặc nhập số thứ tự để thêm/xóa khỏi white-list."
    );
    return isChangeSetting;
  }

  if (!groupSettings[threadId].whiteList) {
    groupSettings[threadId].whiteList = {};
  }

  for (const mention of mentions) {
    const userId = mention.uid;
    const userName = message.data.content.substr(mention.pos, mention.len).replace("@", "");

    if (command === "add") {
      if (isAdmin(api.getBotId(), userId, threadId)) {
        await sendMessageWarning(api, message, `${userName} đã là quản trị viên nên không cần thêm vào white-list`);
        continue;
      }

      if (!groupSettings[threadId].whiteList[userId]) {
        groupSettings[threadId].whiteList[userId] = {
          name: userName,
        };
        await sendMessageComplete(api, message, `Đã thêm ${userName} vào danh sách white-list.`);
        isChangeSetting = true;
      } else {
        await sendMessageWarning(api, message, `${userName} đã có trong danh sách white-list.`);
      }
    } else if (command === "remove") {
      if (groupSettings[threadId].whiteList[userId]) {
        const userName = groupSettings[threadId].whiteList[userId].name;
        delete groupSettings[threadId].whiteList[userId];
        await sendMessageComplete(api, message, `Đã xóa ${userName} khỏi danh sách white-list.`);
        isChangeSetting = true;
      } else {
        await sendMessageWarning(api, message, `${userName} không có trong danh sách white-list.`);
      }
    }
  }

  return isChangeSetting;
}

export function isInWhiteList(groupSettings, threadId, senderId) {
  const whiteList = groupSettings[threadId]?.whiteList || {};
  return whiteList[senderId];
}

async function createWhiteListImage(api, whiteListInfo, groupSettings, threadId) {
  const tempCanvas = createCanvas(1, 1);
  const tempCtx = tempCanvas.getContext("2d");
  tempCtx.font = "bold 32px " + FONT_MAIN;

  // Tính toán kích thước cần thiết
  const avatarSize = 80;
  const padding = 30;
  const nameWidth = 400;
  const levelWidth = 200;
  const extraPadding = padding * 4;

  // Tính tổng số người dùng trong white-list
  const totalWhiteListUsers = Object.keys(groupSettings[threadId].whiteList || {}).length;
  const useDoubleColumn = totalWhiteListUsers > 10;

  // Tính width tổng (nhân đôi nếu 2 cột)
  const columnWidth = avatarSize + nameWidth + levelWidth + extraPadding;
  const width = useDoubleColumn ? columnWidth * 2 + padding * 2 : columnWidth;

  // Tính chiều cao (chia 2 nếu 2 cột)
  const headerHeight = 180;
  const itemHeight = 120;
  const itemsPerColumn = useDoubleColumn ? Math.ceil(totalWhiteListUsers / 2) : totalWhiteListUsers;
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
  ctx.fillText("WHITE-LIST-IN-GROUP", width / 2, yPos);

  // Vẽ danh sách người dùng
  yPos += 80;
  ctx.font = "bold 36px " + FONT_MAIN;
  ctx.fillStyle = "#FFD700";
  ctx.fillText("Danh Sách Trắng", width / 2, yPos);
  yPos += 40;

  const profiles = whiteListInfo.profiles || {};
  const profileArray = Object.entries(profiles);

  if (useDoubleColumn) {
    // Chia danh sách thành 2 cột
    const midPoint = Math.ceil(profileArray.length / 2);

    // Vẽ cột trái
    let leftYPos = yPos;
    for (let i = 0; i < midPoint; i++) {
      const [id, profile] = profileArray[i];
      if (profile) {
        leftYPos = await drawWhiteListItem(ctx, profile, leftYPos, i + 1, padding, 0, useDoubleColumn);
      }
    }

    // Vẽ cột phải
    let rightYPos = yPos;
    for (let i = midPoint; i < profileArray.length; i++) {
      const [id, profile] = profileArray[i];
      if (profile) {
        rightYPos = await drawWhiteListItem(
          ctx,
          profile,
          rightYPos,
          i + 1,
          padding,
          columnWidth + padding * 2 - 30,
          useDoubleColumn
        );
      }
    }

    // Vẽ đường phân cách giữa 2 cột
    ctx.fillStyle = "rgba(255, 255, 255, 0.2)";
    ctx.fillRect(width / 2, yPos - 20, 2, height - yPos);
  } else {
    // Vẽ 1 cột như bình thường
    let index = 1;
    for (const [id, profile] of profileArray) {
      if (profile) {
        yPos = await drawWhiteListItem(ctx, profile, yPos, index++, padding, 0, useDoubleColumn);
      }
    }
  }

  // Lưu và trả về đường dẫn ảnh
  const outputPath = path.join(tempDir, `white_list_${randomIDTemp()}.png`);
  const out = fs.createWriteStream(outputPath);
  const stream = canvas.createPNGStream();
  stream.pipe(out);

  return new Promise((resolve, reject) => {
    out.on("finish", () => resolve(outputPath));
    out.on("error", reject);
  });
}

async function drawWhiteListItem(ctx, profile, yPos, index, padding, xOffset, isDoubleColumn) {
  const itemHeight = 120;
  try {
    const avatarSize = 80;
    const itemPadding = 20;

    // Vẽ background cho item - Sửa lại cách tính width
    ctx.fillStyle = "rgba(29, 18, 18, 0.1)";
    ctx.beginPath();

    // Tính toán width của background dựa vào canvas width
    const backgroundWidth = isDoubleColumn
      ? (ctx.canvas.width - padding * 4) / 2 // Nếu 2 cột thì chia đôi width
      : ctx.canvas.width - padding * 2; // Nếu 1 cột thì full width trừ padding

    ctx.roundRect(padding + xOffset, yPos, backgroundWidth, itemHeight - itemPadding, 10);
    ctx.fill();

    // Vẽ avatar
    if (profile.avatar && cv.isValidUrl(profile.avatar)) {
      const avatar = await loadImage(profile.avatar);
      const avatarX = padding * 2 + xOffset;
      const avatarY = yPos + (itemHeight - avatarSize) / 2 - itemPadding / 2;

      // Vẽ viền avatar
      ctx.save();
      ctx.beginPath();
      ctx.arc(avatarX + avatarSize / 2, avatarY + avatarSize / 2, avatarSize / 2 + 3, 0, Math.PI * 2);
      const borderGradient = ctx.createLinearGradient(avatarX, avatarY, avatarX + avatarSize, avatarY + avatarSize);
      borderGradient.addColorStop(0, "#4CAF50");
      borderGradient.addColorStop(1, "#45a049");
      ctx.fillStyle = borderGradient;
      ctx.fill();

      // Vẽ avatar trong clip path tròn
      ctx.beginPath();
      ctx.arc(avatarX + avatarSize / 2, avatarY + avatarSize / 2, avatarSize / 2, 0, Math.PI * 2);
      ctx.clip();
      ctx.drawImage(avatar, avatarX, avatarY, avatarSize, avatarSize);
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
    ctx.fillText(`${index}. ${profile.zaloName}`, textX, textY + 20);

    ctx.font = "28px " + FONT_MAIN;
    ctx.fillStyle = "#4CAF50";
    ctx.fillText("Người Dùng Được Miễn Trừ Vi Phạm", textX, textY + 60);

    return yPos + itemHeight;
  } catch (error) {
    console.error("Lỗi khi vẽ thông tin người dùng:", error);
    return yPos + itemHeight;
  }
}
