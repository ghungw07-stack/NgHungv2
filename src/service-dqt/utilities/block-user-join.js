import fs from "fs";
import path from "path";
import { GroupEventType } from "../../api-zalo/models/GroupEvent.js";
import {
  sendMessageWarning,
  sendMessageStateQuote,
  sendMessageCompleteRequest,
} from "../chat-zalo/chat-style/chat-style.js";
import { getGlobalPrefix } from "../service.js";
import { removeMention } from "../../utils/format-util.js";
import { getUserInfoData } from "../info-service/user-info.js";
import { createCanvas, loadImage } from "canvas";
import { FONT_MAIN, randomIDTemp } from "../../utils/format-util.js";
import { tempDir } from "../../utils/io-json.js";
import { deleteFile } from "../../utils/util.js";
import * as cv from "../../utils/canvas/index.js";

const blockedUIDPath = path.join(process.cwd(), "assets/json-data/blocked-uids.json");

function loadBlockedUIDsByGroup(groupId) {
  try {
    if (!fs.existsSync(blockedUIDPath)) return [];
    const data = JSON.parse(fs.readFileSync(blockedUIDPath, "utf-8"));
    return Array.isArray(data[groupId]) ? data[groupId] : [];
  } catch {
    return [];
  }
}

function saveBlockedUIDs(data) {
  try {
    fs.writeFileSync(blockedUIDPath, JSON.stringify(data, null, 2), "utf-8");
    return true;
  } catch {
    return false;
  }
}

export async function handleAutoBlockOnJoin(api, event) {
  try {
    if (!event || !event.data || !event.data.groupId || !event.type) return;
    if (event.type !== GroupEventType.JOIN) return;

    const threadId = event.data.groupId;
    const members = Array.isArray(event.data?.updateMembers) ? event.data.updateMembers : [];
    if (!members.length) return;

    const blockedUIDs = loadBlockedUIDsByGroup(threadId);

    for (const member of members) {
      if (!member?.id) continue;
      const uid = member.id;

      if (blockedUIDs.includes(uid)) {
        try {
          await api.blockUsers(threadId, [uid]);
          console.log(`🚫 Đã block user ${uid} khi join vì trong blacklist.`);
        } catch (err) {
          console.error(`⚠️ Không thể block ${uid}:`, err.message);
        }
      }
    }
  } catch (err) {
    console.error("Lỗi handleAutoBlockOnJoin:", err);
  }
}

export async function handleBlockUIDByCommand(api, message, aliasCommand) {
  const prefix = getGlobalPrefix(api.getBotId());
  const threadId = message.threadId;
  const content = removeMention(message).replace(`${prefix}${aliasCommand}`, "").trim();
  const args = content.split(/\s+/);
  const command = args[0]?.toLowerCase();
  let data = {};

  try {
    if (fs.existsSync(blockedUIDPath)) {
      data = JSON.parse(fs.readFileSync(blockedUIDPath, "utf-8"));
    }
  } catch {
    data = {};
  }

  if (!Array.isArray(data[threadId])) data[threadId] = [];

  if (command === "add") {
    const mentions = Array.isArray(message.data?.mentions) ? message.data.mentions : [];

    const idsFromMentions = mentions
      .filter(m => m?.uid && typeof m.uid === "string")
      .map(m => m.uid);

    const rawIDs = args.slice(1).filter(id => /^\d+$/.test(id));
    const newIds = [...new Set([...idsFromMentions, ...rawIDs])]
      .filter(uid => !data[threadId].includes(uid));

    if (!newIds.length) {
      await sendMessageWarning(api, message, "Không có UID hợp lệ để thêm.", threadId);
      return;
    }

    const nameMap = {};
    for (const uid of newIds) {
      const userInfo = await getUserInfoData(api, uid);
      const name = userInfo ? userInfo.name : `ID ${uid}`;
      nameMap[uid] = name;

      try {
        await api.blockUsers(threadId, [uid]);
        console.log(`🚫 Đã block trực tiếp user ${uid}`);
      } catch (err) {
        if (err?.message?.includes("Nhóm không có thành viên")) {
          console.log(`⚠️ UID ${uid} không có trong nhóm, chỉ thêm vào blacklist.`);
        } else {
          console.error("Lỗi blockUsers:", err.message);
        }
      }
    }

    data[threadId].push(...newIds);
    const saved = saveBlockedUIDs(data);

    if (saved) {
      const names = newIds.map(id => nameMap[id]).join(", ");
      await sendMessageWarning(api, message, `Đã thêm ${names} vào danh sách đen.`, threadId);
    } else {
      await sendMessageWarning(api, message, "Không thể lưu file.", threadId);
    }
    return;
  }

  if (command === "list") {
    const list = data[threadId];
    if (!list.length) {
      await sendMessageStateQuote(api, message, "Danh sách UID bị block đang trống.", false, 10000, threadId);
      return;
    }

    const userList = [];
    for (const uid of list) {
      const userInfo = await getUserInfoData(api, uid);
      if (userInfo) {
        userList.push({
          displayName: userInfo.name,
          avatar: userInfo.avatar,
          id: uid
        });
      } else {
        userList.push({
          displayName: `ID ${uid}`,
          avatar: null,
          id: uid
        });
      }
    }

    let imagePath = null;
    try {
      imagePath = await createBlacklistImage(userList);
  
      await sendMessageCompleteRequest(
        api,
        message,
        {
          caption: `Đây là danh sách người dùng bị chặn tham gia nhóm.`,
          imagePath,
        },
        600000
      );
    } catch (error) {
      console.error("Lỗi khi tạo ảnh danh sách blacklist:", error);
      const text = userList.map((user, index) => `${index + 1}. ${user.displayName} (${user.id})`).join("\n");
      await sendMessageStateQuote(api, message, `Danh sách UID bị block:\n${text}`, true, 20000, threadId);
    } finally {
      deleteFile(imagePath);
    }
    return;
  }

  if (command === "remove") {
    const index = parseInt(args[1]);
    if (isNaN(index) || index < 1 || index > data[threadId].length) {
      await sendMessageWarning(api, message, "Số thứ tự không hợp lệ.", threadId);
      return;
    }

    const removedUID = data[threadId][index - 1];
    const userInfo = await getUserInfoData(api, removedUID);
    const removedName = userInfo ? userInfo.name : `ID ${removedUID}`;

    try {
      await api.unblockUsers(threadId, [removedUID]);
    } catch (err) {}
    
    data[threadId].splice(index - 1, 1);
    const saved = saveBlockedUIDs(data);

    if (saved) {
      await sendMessageStateQuote(
        api,
        message,
        `🗑️ Đã xoá: ${removedName} (${removedUID})`,
        true,
        10000,
        threadId
      );
    } else {
      await sendMessageWarning(api, message, "Không thể lưu sau khi xoá.", threadId);
    }
    return;
  }

  await sendMessageWarning(
    api,
    message,
    `Sai cú pháp. Dùng:\n- ${prefix}${aliasCommand} add @mention hoặc <uid>\n- ${prefix}${aliasCommand} list\n- ${prefix}${aliasCommand} remove <số>`,
    threadId
  );
}


async function createBlacklistImage(blockList) {
  const tempCanvas = createCanvas(1, 1);
  const tempCtx = tempCanvas.getContext("2d");
  tempCtx.font = "bold 32px " + FONT_MAIN;

  // Tính toán kích thước cần thiết
  const avatarSize = 80;
  const padding = 30;
  const nameWidth = 400;
  const levelWidth = 200;
  const extraPadding = padding * 4;

  // Tính tổng số người dùng bị block
  const totalBlockedUsers = blockList.length;
  const useDoubleColumn = totalBlockedUsers > 10;

  // Tính width tổng (nhân đôi nếu 2 cột)
  const columnWidth = avatarSize + nameWidth + levelWidth + extraPadding;
  const width = useDoubleColumn ? columnWidth * 2 + padding * 2 : columnWidth;

  // Tính chiều cao (chia 2 nếu 2 cột)
  const headerHeight = 180;
  const itemHeight = 120;
  const itemsPerColumn = useDoubleColumn ? Math.ceil(totalBlockedUsers / 2) : totalBlockedUsers;
  const height = headerHeight + itemsPerColumn * itemHeight + 40;

  // Tạo canvas chính
  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext("2d");

  // Vẽ background với gradient
  const gradient = ctx.createLinearGradient(0, 0, 0, height);
  gradient.addColorStop(0, "rgba(0, 119, 255, 0.9)");
  gradient.addColorStop(1, "rgba(55, 131, 230, 0.95)");
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, width, height);

  // Vẽ tiêu đề chính
  let yPos = padding * 2;
  ctx.textAlign = "center";
  ctx.font = "bold 48px " + FONT_MAIN;
  ctx.fillStyle = cv.getRandomGradient(ctx, width);
  ctx.fillText("BLACKLIST-USERS", width / 2, yPos);

  // Vẽ phụ đề
  yPos += 80;
  ctx.font = "bold 36px " + FONT_MAIN;
  ctx.fillStyle = "#FFD700";
  ctx.fillText("Danh Sách Người Dùng Bị Chặn", width / 2, yPos);
  yPos += 40;

  if (useDoubleColumn) {
    // Chia danh sách thành 2 cột
    const midPoint = Math.ceil(blockList.length / 2);

    // Vẽ cột trái
    let leftYPos = yPos;
    for (let i = 0; i < midPoint; i++) {
      if (blockList[i]) {
        leftYPos = await drawBlacklistItem(ctx, blockList[i], leftYPos, i + 1, padding, 0, useDoubleColumn);
      }
    }

    // Vẽ cột phải
    let rightYPos = yPos;
    for (let i = midPoint; i < blockList.length; i++) {
      if (blockList[i]) {
        rightYPos = await drawBlacklistItem(
          ctx,
          blockList[i],
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
    for (const blockedUser of blockList) {
      yPos = await drawBlacklistItem(ctx, blockedUser, yPos, index++, padding, 0, useDoubleColumn);
    }
  }

  // Lưu và trả về đường dẫn ảnh
  const outputPath = path.join(tempDir, `blacklist_users_${randomIDTemp()}.png`);
  const out = fs.createWriteStream(outputPath);
  const stream = canvas.createPNGStream();
  stream.pipe(out);

  return new Promise((resolve, reject) => {
    out.on("finish", () => resolve(outputPath));
    out.on("error", reject);
  });
}

async function drawBlacklistItem(ctx, blockedUser, yPos, index, padding, xOffset, isDoubleColumn) {
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

    // Vẽ avatar
    if (blockedUser.avatar && cv.isValidUrl(blockedUser.avatar)) {
      const avatar = await loadImage(blockedUser.avatar);
      const avatarX = padding * 2 + xOffset;
      const avatarY = yPos + (itemHeight - avatarSize) / 2 - itemPadding / 2;

      // Vẽ viền avatar
      ctx.save();
      ctx.beginPath();
      ctx.arc(avatarX + avatarSize / 2, avatarY + avatarSize / 2, avatarSize / 2 + 3, 0, Math.PI * 2);
      const borderGradient = ctx.createLinearGradient(avatarX, avatarY, avatarX + avatarSize, avatarY + avatarSize);
      borderGradient.addColorStop(0, "#dc3545");
      borderGradient.addColorStop(1, "#c82333");
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
    ctx.fillText(`${index}. ${blockedUser.displayName}`, textX, textY + 20);

    ctx.font = "28px " + FONT_MAIN;
    ctx.fillStyle = "#dc3545";
    ctx.fillText(`UID: ${blockedUser.id}`, textX, textY + 60);

    return yPos + itemHeight;
  } catch (error) {
    console.error("Lỗi khi vẽ thông tin người dùng bị blacklist:", error);
    return yPos + itemHeight;
  }
}
