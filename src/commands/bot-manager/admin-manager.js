import { readAdmins, tempDir, writeAdmins } from "../../utils/io-json.js";
import path from "path";
import {
  sendMessageComplete,
  sendMessageCompleteRequest,
  sendMessageInsufficientAuthority,
  sendMessageQuery,
  sendMessageWarning,
} from "../../service-dqt/chat-zalo/chat-style/chat-style.js";
import { getGlobalPrefix } from "../../service-dqt/service.js";
import { FONT_MAIN, randomIDTemp, removeMention } from "../../utils/format-util.js";
import { createCanvas, loadImage } from "canvas";
import * as cv from "../../utils/canvas/index.js";
import fs from "fs";
import { deleteFile } from "../../utils/util.js";
import { groupSettingsAll } from "../../automations/event-send-msg.js";
import { updateListAdminByIDBot } from "../../index.js";
import { getUserInfoBasic } from "../../service-dqt/info-service/user-info.js";

export async function handleAdminHighLevelCommands(api, message, groupAdmins, groupSettings, isAdminLevelHighest) {
  const prefix = getGlobalPrefix(api.getBotId());
  const normalizedContent = removeMention(message);
  const rawContent = typeof message.data?.content === "string" ? message.data.content : "";
  const commandMatch = rawContent.match(new RegExp(`${prefix.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?:add|remove)(?=\\s|$)`, "iu"));
  const content = commandMatch ? rawContent.slice(commandMatch.index) : normalizedContent;

  if (!content.includes(`${prefix}add`) && !content.includes(`${prefix}remove`)) {
    return false;
  }

  let action = null;
  if (content.includes(`${prefix}add`)) action = "add";
  if (content.includes(`${prefix}remove`)) action = "remove";

  if (!action) return false;

  if (!isAdminLevelHighest) {
    if (groupAdmins.includes(message.data.uidFrom)) {
      const caption = "Chỉ có quản trị bot cấp cao mới được sử dụng lệnh này!";
      await sendMessageInsufficientAuthority(api, message, caption);
    }
    return false;
  }

  await handleAddRemoveAdmin(api, message, groupSettings, action, isAdminLevelHighest);
  groupSettingsAll.setChanged();
  return true;
}

export async function handleListAdmin(api, message, groupSettings) {
  const threadId = message.threadId;
  let imagePath = null;
  let groupSetting = groupSettings ? groupSettings[threadId] : {};
  if (!groupSetting.adminList) groupSetting.adminList = [];

  const highLevelAdmins = api.apiManager.getListAdmin();
  const totalAdmin = highLevelAdmins.length + Object.keys(groupSetting.adminList).length;
  if (totalAdmin > 0) {
    let highLevelAdminInfo = { profiles: {} };
    if (highLevelAdmins.length > 0) {
      highLevelAdminInfo = await api.getInfoMembers(highLevelAdmins);
    }
    try {
      imagePath = await createAdminListImage(api, highLevelAdminInfo, groupSetting);

      await sendMessageCompleteRequest(
        api,
        message,
        {
          caption: "Đây là danh sách quản trị bot của nhóm này.",
          imagePath,
        },
        600000
      );
    } catch (error) {
      console.error("Lỗi khi tạo ảnh danh sách admin:", error);
    } finally {
      deleteFile(imagePath);
    }
  } else {
    await sendMessageCompleteRequest(
      api,
      message,
      {
        caption: "Hiện không có admin nào được thiết lập cho bot này.",
      },
      600000
    );
  }
}

async function createAdminListImage(api, highLevelAdminInfo, groupSettings) {
  // Tạo canvas tạm để tính toán độ dài text
  const tempCanvas = createCanvas(1, 1);
  const tempCtx = tempCanvas.getContext("2d");
  tempCtx.font = "bold 32px " + FONT_MAIN;

  // Tính toán kích thước cần thiết
  const avatarSize = 80;
  const padding = 30;
  const nameWidth = 400; // Độ rộng cố định cho tên
  const levelWidth = 200; // Độ rộng cố định cho cấp bậc
  const extraPadding = padding * 4;

  // Tính width tổng
  const width = avatarSize + nameWidth + levelWidth + extraPadding;

  // Tính tổng số admin
  const totalHighLevelAdmins = Object.keys(highLevelAdminInfo.profiles || {}).length;
  const totalGroupAdmins = Object.keys(groupSettings.adminList || {}).length;
  const totalAdmins = totalHighLevelAdmins + totalGroupAdmins;

  // Tính chiều cao
  const headerHeight = totalHighLevelAdmins > 0 ? 180 : 90; // Chiều cao cho phần header
  const itemHeight = 120; // Chiều cao cho mỗi admin
  const sectionPadding = 40; // Padding giữa các section
  const height = headerHeight + totalAdmins * itemHeight + (totalGroupAdmins > 0 ? sectionPadding + 40 : 0);

  // Tạo canvas chính
  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext("2d");

  // Vẽ background với gradient
  const gradient = ctx.createLinearGradient(0, 0, 0, height);
  gradient.addColorStop(0, "rgba(59, 130, 246, 0.9)"); // #3B82F6 với alpha
  gradient.addColorStop(1, "rgba(17, 24, 39, 0.95)"); // #111827 với alpha
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, width, height);

  let yPos = padding * 2;
  ctx.textAlign = "center";
  ctx.font = "bold 48px " + FONT_MAIN;
  ctx.fillStyle = cv.getRandomGradient(ctx, width);
  ctx.fillText("DANH SÁCH QUẢN TRỊ BOT", width / 2, yPos);

  let index = 1;

  if (totalHighLevelAdmins > 0) {
    yPos += 80;
    ctx.font = "bold 36px " + FONT_MAIN;
    ctx.fillStyle = "#FFD700";
    ctx.fillText("Quản Trị Cấp Cao", width / 2, yPos);
    yPos += 40;

    if (highLevelAdminInfo.profiles && Object.keys(highLevelAdminInfo.profiles).length > 0) {
      for (const profile of Object.values(highLevelAdminInfo.profiles)) {
        yPos = await drawAdminItem(ctx, profile, yPos, index++, "high", padding);
      }
    }
  } else {
    yPos += 30;
  }

  if (Object.keys(groupSettings.adminList).length > 0) {
    yPos += sectionPadding;
    ctx.font = "bold 36px " + FONT_MAIN;
    ctx.fillStyle = "#C0C0C0";
    ctx.textAlign = "center";
    ctx.fillText("Quản Trị Viên Bot", width / 2, yPos);
    yPos += 40;
    index = 1;

    const idAdminList = Object.keys(groupSettings.adminList).map((id) => `${id}_0`);
    const adminListInfo = await api.getInfoMembers(idAdminList);

    for (const id of idAdminList) {
      const userId = id.split("_")[0];
      const profile = adminListInfo.profiles[userId];
      if (profile) {
        yPos = await drawAdminItem(ctx, profile, yPos, index++, "normal", padding);
      }
    }
  }

  const outputPath = path.join(tempDir, `admin_list_${randomIDTemp()}.png`);
  const out = fs.createWriteStream(outputPath);
  const stream = canvas.createPNGStream();
  stream.pipe(out);

  return new Promise((resolve, reject) => {
    out.on("finish", () => resolve(outputPath));
    out.on("error", reject);
  });
}

async function drawAdminItem(ctx, profile, yPos, index, level, padding) {
  const itemHeight = 120;
  try {
    const avatarSize = 80;
    const itemPadding = 20;

    // Vẽ background cho item
    ctx.fillStyle = "rgba(255, 255, 255, 0.1)";
    ctx.beginPath();
    ctx.roundRect(padding, yPos, ctx.canvas.width - padding * 2, itemHeight - itemPadding, 10);
    ctx.fill();

    // Vẽ avatar
    if (profile.avatar && cv.isValidUrl(profile.avatar)) {
      const avatar = await loadImage(profile.avatar);
      const avatarX = padding * 2;
      const avatarY = yPos + (itemHeight - avatarSize) / 2 - itemPadding / 2;

      // Vẽ viền avatar
      ctx.save();
      ctx.beginPath();
      ctx.arc(avatarX + avatarSize / 2, avatarY + avatarSize / 2, avatarSize / 2 + 3, 0, Math.PI * 2);
      const borderGradient = ctx.createLinearGradient(avatarX, avatarY, avatarX + avatarSize, avatarY + avatarSize);
      borderGradient.addColorStop(0, level === "high" ? "#FFD700" : "#C0C0C0");
      borderGradient.addColorStop(1, level === "high" ? "#FFA500" : "#A0A0A0");
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
    const separatorX = padding * 3 + avatarSize;
    ctx.fillStyle = "rgba(255, 255, 255, 0.2)";
    ctx.fillRect(separatorX, yPos + itemPadding - 8, 2, itemHeight - itemPadding * 2);

    // Vẽ thông tin
    const textX = separatorX + padding * 2;
    const textY = yPos + itemPadding;

    ctx.textAlign = "left";
    ctx.font = "bold 32px " + FONT_MAIN;
    ctx.fillStyle = "#FFFFFF";
    ctx.fillText(`${index}. ${profile.zaloName}`, textX, textY + 25);

    ctx.font = "28px " + FONT_MAIN;
    ctx.fillStyle = level === "high" ? "#FFD700" : "#C0C0C0";
    ctx.fillText(level === "high" ? "Quản Trị Cấp Cao" : "Quản Trị Viên", textX, textY + 65);

    return yPos + itemHeight;
  } catch (error) {
    console.error("Lỗi khi vẽ thông tin admin:", error);
    return yPos + itemHeight;
  }
}

async function handleAddRemoveAdmin(api, message, groupSettings, action, isAdminLevelHighest = false) {
  const mentions = message.data.mentions;
  const threadId = message.threadId;
  const content = removeMention(message);
  const botId = api.getBotId();
  const senderId = message.data.uidFrom;
  const apiManager = api.apiManager;
  let isPermission = botId === senderId || senderId === apiManager.idBotMainWithBot || isAdminLevelHighest;
  const isGlobalAdmin = content.toLowerCase().includes("admin");

  if (isGlobalAdmin && !isPermission) {
    await sendMessageWarning(api, message, `Quyền hạn chỉnh sửa admin cấp cao chỉ dành cho quản trị bot cấp cao hoặc chính tài khoản này`);
    return;
  }

  if (action === "remove" && content.toLowerCase().includes("all")) {
    if (isGlobalAdmin) {
      const listAdmin = api.apiManager.getListAdmin();
      if (!listAdmin) listAdmin = [];
      const totalCount = listAdmin.length;
      if (totalCount > 0) {
        listAdmin.length = 0;
        updateListAdminByIDBot(botId, listAdmin);
        await sendMessageComplete(api, message, `Đã xóa tất cả ${totalCount} admin cấp cao của bot.`);
      } else {
        await sendMessageWarning(api, message, `Không có admin cấp cao nào để xóa.`);
      }
    } else {
      const adminList = groupSettings[threadId]?.adminList || {};
      const totalCount = Object.keys(adminList).length;
      if (totalCount > 0) {
        groupSettings[threadId]["adminList"] = {};
        await sendMessageComplete(api, message, `Đã xóa tất cả ${totalCount} quản trị viên bot khỏi nhóm này.`);
      } else {
        await sendMessageWarning(api, message, `Không có quản trị viên bot nào để xóa.`);
      }
    }
    return;
  }

  if (action === "remove" && /\d+/.test(content)) {
    const indexMatch = content.match(/\d+/);
    if (indexMatch) {
      const index = parseInt(indexMatch[0]) - 1;
      if (isGlobalAdmin) {
        const listAdmin = api.apiManager.getListAdmin();
        if (!listAdmin) listAdmin = [];

        if (index >= 0 && index < listAdmin.length) {
          const removedAdmin = listAdmin.splice(index, 1)[0];
          updateListAdminByIDBot(botId, listAdmin);
          const userInfo = await getUserInfoBasic(api, removedAdmin);
          await sendMessageComplete(api, message, `Đã xóa quyền admin cấp cao của tài khoản: ${userInfo.displayName}`);
        } else {
          await sendMessageWarning(
            api,
            message,
            `Số thứ tự không hợp lệ. Vui lòng kiểm tra lại danh sách admin cấp cao.`
          );
        }
        return;
      } else {
        const adminList = Object.entries(groupSettings[threadId].adminList);
        if (index >= 0 && index < adminList.length) {
          const [targetId, targetName] = adminList[index];
          delete groupSettings[threadId]["adminList"][targetId];
          await sendMessageComplete(api, message, `Đã xóa ${targetName} khỏi danh sách quản trị bot của nhóm này.`);
        } else {
          await sendMessageWarning(
            api,
            message,
            `Số thứ tự không hợp lệ. Vui lòng kiểm tra lại danh sách quản trị viên.`
          );
        }
        return;
      }
    }
  }

  if ((action === "add" || action === "remove") && (!mentions || mentions.length === 0)) {
    const prefix = getGlobalPrefix(api.getBotId());
    let cleanContent = content
      .replace(new RegExp(`${prefix}add`, "gi"), "")
      .replace(new RegExp(`${prefix}remove`, "gi"), "")
      .replace(/admin/gi, "")
      .trim();
    const args = cleanContent.split(/\s+/).filter(arg => arg.trim());
    const uidPattern = /^\d+$/;
    const rawUIDs = args.filter(arg => uidPattern.test(arg));
    // Cho phép reply trực tiếp tin nhắn của thành viên thay cho @mention/UID.
    // Zalo lưu UID người gửi tin nhắn được reply ở quote.ownerId.
    const repliedOwnerId = message.data.quote?.ownerId;
    if (
      rawUIDs.length === 0 &&
      repliedOwnerId != null &&
      String(repliedOwnerId) !== "0" &&
      String(repliedOwnerId) !== String(botId)
    ) {
      rawUIDs.push(String(repliedOwnerId));
    }
    
    if (rawUIDs.length > 0) {
      let listAdmin = null;
      let needUpdate = false;
      
      if (isGlobalAdmin) {
        listAdmin = api.apiManager.getListAdmin();
        if (!listAdmin) listAdmin = [];
      }
      
      for (const uid of rawUIDs) {
        let targetName = `ID ${uid}`;
        try {
          const userInfo = await getUserInfoBasic(api, uid);
          if (userInfo && userInfo.displayName) {
            targetName = userInfo.displayName;
          }
        } catch (error) {
          console.error(`Lỗi khi lấy thông tin user ${uid}:`, error);
        }

        if (isGlobalAdmin) {
          if (action === "add") {
            if (!listAdmin.includes(uid)) {
              listAdmin.push(uid);
              await sendMessageComplete(api, message, `Đã thêm ${targetName} vào danh sách admin cấp cao của bot.`);
              needUpdate = true;
            } else {
              await sendMessageWarning(api, message, `${targetName} đã là admin cấp cao của bot.`);
            }
          } else if (action === "remove") {
            const index = listAdmin.indexOf(uid);
            if (index !== -1) {
              listAdmin.splice(index, 1);
              await sendMessageComplete(api, message, `Đã xóa ${targetName} khỏi danh sách admin cấp cao của bot.`);
              needUpdate = true;
            } else {
              await sendMessageWarning(api, message, `${targetName} không phải là admin cấp cao của bot.`);
            }
          }
        } else {
          if (action === "add") {
            if (!groupSettings[threadId]["adminList"][uid]) {
              groupSettings[threadId]["adminList"][uid] = targetName;
              await sendMessageComplete(api, message, `Đã thêm ${targetName} vào danh sách quản trị bot của nhóm này.`);
            } else {
              await sendMessageWarning(api, message, `${targetName} đã có trong danh sách quản trị bot của nhóm này.`);
            }
          } else if (action === "remove") {
            if (groupSettings[threadId]["adminList"][uid]) {
              delete groupSettings[threadId]["adminList"][uid];
              await sendMessageComplete(api, message, `Đã xóa ${targetName} khỏi danh sách quản trị bot của nhóm này.`);
            } else {
              await sendMessageWarning(api, message, `${targetName} không có trong danh sách quản trị bot của nhóm này.`);
            }
          }
        }
      }
      
      if (isGlobalAdmin && needUpdate) {
        updateListAdminByIDBot(botId, listAdmin);
      }
      
      return;
    }
  }

  if (!mentions || mentions.length === 0) {
    const caption = "Vui lòng reply tin nhắn, đề cập (@mention) người dùng hoặc cung cấp UID để thêm/xóa quản trị viên.";
    await sendMessageQuery(api, message, caption);
    return;
  }

  let listAdmin = null;
  let needUpdate = false;
  
  if (isGlobalAdmin) {
    listAdmin = api.apiManager.getListAdmin();
    if (!listAdmin) listAdmin = [];
  }
  
  for (const mention of mentions) {
    const targetId = String(mention.uid || mention.userId || mention.id || "");
    if (!targetId) continue;
    // Pos/len của mention tự chèn khi reply bị lệch trên một số client Zalo,
    // có thể cắt trúng `>add`. Lấy tên theo metadata/UID thay vì substring.
    let targetName = String(mention.dName || mention.name || "").replace(/^@+/u, "").trim();
    if (!targetName) {
      try {
        const userInfo = await getUserInfoBasic(api, targetId);
        targetName = userInfo?.displayName || userInfo?.zaloName || "";
      } catch (error) {
        console.error(`Lỗi khi lấy tên user ${targetId}:`, error);
      }
    }
    if (!targetName) targetName = `ID ${targetId}`;

    if (isGlobalAdmin) {
      if (action === "add") {
        if (!listAdmin.includes(targetId)) {
          listAdmin.push(targetId);
          await sendMessageComplete(api, message, `Đã thêm ${targetName} vào danh sách admin cấp cao của bot.`);
          needUpdate = true;
        } else {
          await sendMessageWarning(api, message, `${targetName} đã là admin cấp cao của bot.`);
        }
      } else if (action === "remove") {
        const index = listAdmin.indexOf(targetId);
        if (index !== -1) {
          listAdmin.splice(index, 1);
          await sendMessageComplete(api, message, `Đã xóa ${targetName} khỏi danh sách admin cấp cao của bot.`);
          needUpdate = true;
        } else {
          await sendMessageWarning(api, message, `${targetName} không phải là admin cấp cao của bot.`);
        }
      }
    } else {
      switch (action) {
        case "add":
          if (!groupSettings[threadId]["adminList"][targetId]) {
            groupSettings[threadId]["adminList"][targetId] = targetName;
            await sendMessageComplete(api, message, `Đã thêm ${targetName} vào danh sách quản trị bot của nhóm này.`);
          } else {
            await sendMessageWarning(api, message, `${targetName} đã có trong danh sách quản trị bot của nhóm này.`);
          }
          break;
        case "remove":
          if (groupSettings[threadId]["adminList"][targetId]) {
            delete groupSettings[threadId]["adminList"][targetId];
            await sendMessageComplete(api, message, `Đã xóa ${targetName} khỏi danh sách quản trị bot của nhóm này.`);
          } else {
            await sendMessageWarning(api, message, `${targetName} không có trong danh sách quản trị bot của nhóm này.`);
          }
          break;
      }
    }
  }
  
  if (isGlobalAdmin && needUpdate) {
    updateListAdminByIDBot(botId, listAdmin);
  }
}
