import schedule from "node-schedule";
import chalk from "chalk";
import path from "path";
import fs from "fs";
import { createCanvas, loadImage } from "canvas";
import { getGlobalPrefix } from "../service.js";
import { removeMention, getFontCanvas, FONT_MAIN } from "../../utils/format-util.js";
import { getUserInfoBasic, getUsersInfoData } from "./user-info.js";
import { sendMessageComplete, sendMessageFailed, sendMessageWarning, sendMessageImageTag } from "../chat-zalo/chat-style/chat-style.js";
import { managerDataCache } from "../../commands/bot-manager/active-bot.js";
import { MessageType } from "../../api-zalo/index.js";
import { writeFilePromise } from "../../utils/util.js";
import { tempDir } from "../../utils/io-json.js";
import { randomIDTemp } from "../../utils/format-util.js";
import * as cv from "../../utils/canvas/index.js";

export async function handleTargetBot(api, message, aliasCommand) {
  const botId = api.getBotId();
  const prefix = getGlobalPrefix(botId);
  const content = removeMention(message);
  const keyword = content.replace(prefix + aliasCommand, "").trim();
  const args = keyword.split(" ");
  const threadId = message.threadId;
  const type = message.type;
  const senderId = message.data.uidFrom;
  const senderName = message.data.dName;
  let caption;

  if (!keyword || !args || (args[0] !== "add" && args[0] !== "remove" && args[0] !== "list" && args[0] !== "removeall" && args[0] !== "remove_all")) {
    caption =
      `Hướng dẫn dùng lệnh:\n` +
      `${prefix + aliasCommand} add (@mention hoặc ID1 ID2 ...)\n` +
      `${prefix + aliasCommand} remove (@mention, ID hoặc index)\n` +
      `${prefix + aliasCommand} remove all (xóa tất cả)\n` +
      `${prefix + aliasCommand} list`;
    await sendMessageComplete(api, message, caption, true, 600000);
    return;
  }

  const action = args[0];
  
  const mngrData = api.apiManager.getDataManager();
  if (!mngrData.targetListTracking) mngrData.targetListTracking = {};
  const targetTracking = mngrData.targetListTracking;
  if (!targetTracking[threadId])
    targetTracking[threadId] = {
      type,
      targetTracking: {},
    };

  const isRemoveAll = action === "removeall" || action === "remove_all" || (action === "remove" && args[1]?.toLowerCase() === "all");
  
  if (isRemoveAll) {
    const targetList = targetTracking[threadId].targetTracking;
    let removedCount = 0;
    
    for (const [targetId, targetData] of Object.entries(targetList)) {
      if (targetData.userTarget && targetData.userTarget[senderId]) {
        delete targetData.userTarget[senderId];
        removedCount++;
        if (!targetData.userTarget || Object.keys(targetData.userTarget).length === 0) {
          delete targetTracking[threadId].targetTracking[targetId];
        }
      }
    }
    
    if (removedCount === 0) {
      await sendMessageWarning(api, message, "Bạn chưa theo dõi người dùng nào tại đây!");
    } else {
      await sendMessageComplete(api, message, `Đã ngừng theo dõi tất cả ${removedCount} người dùng!`, true, 600000);
    }
    managerDataCache.setChanged(botId);
    return;
  }
  
  const mentions = message.data?.mentions || [];
  let userTargetIDs = [];
  
  if (mentions.length > 0 && (action === "add" || action === "remove")) {
    userTargetIDs = mentions.map(m => m.uid);
  } else if (message.data?.reply && (action === "add" || action === "remove")) {
    userTargetIDs = [message.data.reply.uid];
  } else if (args.length > 1) {
    userTargetIDs = args.slice(1).filter(arg => arg && arg.trim());
  }

  if (action === "list") {
    const targetList = targetTracking[threadId].targetTracking;
    const userTargets = [];
    
    for (const [targetId, targetData] of Object.entries(targetList)) {
      if (targetData.userTarget && targetData.userTarget[senderId]) {
        userTargets.push({ id: targetId, name: targetData.name });
      }
    }

    if (userTargets.length === 0) {
      await sendMessageWarning(api, message, "Bạn chưa theo dõi người dùng nào tại đây!");
      return;
    }

    try {
      const userIds = userTargets.map(u => u.id);
      const usersInfo = await getUsersInfoData(api, userIds);
      
      const userList = userTargets.map(target => {
        const userInfo = usersInfo[target.id];
        return {
          displayName: userInfo ? userInfo.name : target.name,
          avatar: userInfo ? userInfo.avatar : null,
          id: target.id
        };
      });

      const imagePath = await createTargetListImage(userList, senderName);
      await sendMessageImageTag(api, message, {
        caption: `Danh sách ${userTargets.length} người dùng đang được theo dõi`,
        imagePath: imagePath,
      }, 600000);
      
      try {
        if (fs.existsSync(imagePath)) {
          fs.unlinkSync(imagePath);
        }
      } catch (deleteError) {
        console.error("Lỗi khi xóa file ảnh:", deleteError);
      }
    } catch (error) {
      console.error("Lỗi khi tạo ảnh danh sách:", error);
      let listMessage = "Danh sách người dùng đang được theo dõi:\n";
      let index = 1;
      for (const target of userTargets) {
        listMessage += `${index}. ID: ${target.id} - Tên: ${target.name}\n`;
        index++;
      }
      await sendMessageComplete(api, message, listMessage, true, 600000);
    }
    return;
  }

  if (userTargetIDs.length === 0) {
    if (action === "remove") {
      const targetList = targetTracking[threadId].targetTracking;
      const userTargets = [];
      for (const [targetId, targetData] of Object.entries(targetList)) {
        if (targetData.userTarget && targetData.userTarget[senderId]) {
          userTargets.push({ id: targetId, name: targetData.name });
        }
      }
      if (userTargets.length === 0) {
        await sendMessageWarning(api, message, "Bạn chưa theo dõi người dùng nào tại đây!");
        return;
      }
      await sendMessageWarning(api, message, `Vui lòng @mention người dùng, reply tin nhắn, nhập ID hoặc số thứ tự (1-${userTargets.length}) để xóa theo dõi!`);
      return;
    } else if (action === "add") {
      await sendMessageWarning(api, message, `Vui lòng @mention người dùng, reply tin nhắn hoặc nhập ID để thêm theo dõi!`);
      return;
    }
  }

  if (action === "remove" && userTargetIDs.length > 0) {
    const targetList = targetTracking[threadId].targetTracking;
    const userTargets = [];
    for (const [targetId, targetData] of Object.entries(targetList)) {
      if (targetData.userTarget && targetData.userTarget[senderId]) {
        userTargets.push({ id: targetId, name: targetData.name });
      }
    }
    
    const convertedIDs = [];
    const invalidIndexes = [];
    
    for (const arg of userTargetIDs) {
      const index = parseInt(arg);
      if (!isNaN(index) && index > 0 && index < 1000) {
        if (index <= userTargets.length) {
          convertedIDs.push(userTargets[index - 1].id);
        } else {
          invalidIndexes.push(index);
        }
      } else {
        convertedIDs.push(arg);
      }
    }
    
    if (invalidIndexes.length > 0) {
      await sendMessageWarning(api, message, `Số thứ tự không hợp lệ: ${invalidIndexes.join(", ")}. Vui lòng chọn từ 1 đến ${userTargets.length}.`);
      return;
    }
    
    if (convertedIDs.length > 0) {
      userTargetIDs = [...new Set(convertedIDs)];
    }
  }

  const results = await processMultipleUsers(api, message, action, userTargetIDs, targetTracking, threadId, senderId, senderName);
  
  if (results.success.length > 0 || results.failed.length > 0 || results.skipped.length > 0) {
    let resultMessage = "";
    
    if (results.success.length > 0) {
      if (action === "add") {
        resultMessage += `✅ Đã thêm theo dõi ${results.success.length} người dùng:\n${results.success.map(u => `- ${u.name}`).join("\n")}\n\n`;
      } else {
        resultMessage += `✅ Đã ngừng theo dõi ${results.success.length} người dùng:\n${results.success.map(u => `- ${u.name}`).join("\n")}\n\n`;
      }
    }
    
    if (results.skipped.length > 0) {
      resultMessage += `⚠️ Đã bỏ qua ${results.skipped.length} người dùng (đã tồn tại hoặc chưa theo dõi):\n${results.skipped.map(u => `- ${u.name}`).join("\n")}\n\n`;
    }
    
    if (results.failed.length > 0) {
      resultMessage += `❌ Không tìm thấy ${results.failed.length} người dùng:\n${results.failed.map(id => `- ID: ${id}`).join("\n")}`;
    }
    
    await sendMessageComplete(api, message, resultMessage.trim(), true, 600000);
  }

  managerDataCache.setChanged(botId);
}

async function processMultipleUsers(api, message, action, userTargetIDs, targetTracking, threadId, senderId, senderName) {
  const results = {
    success: [],
    failed: [],
    skipped: []
  };

  for (const targetID of userTargetIDs) {
    try {
      const userTarget = await getUserInfoBasic(api, targetID);
      
      if (!targetTracking[threadId].targetTracking[targetID]) {
        targetTracking[threadId].targetTracking[targetID] = {
          name: userTarget.zaloName,
        };
      }

      const target = targetTracking[threadId].targetTracking[targetID];
      if (!target.userTarget) target.userTarget = {};

      if (action === "add") {
        if (!target.userTarget[senderId]) {
          target.userTarget[senderId] = {
            id: senderId,
            name: senderName,
          };
          results.success.push({ id: targetID, name: userTarget.zaloName });
        } else {
          results.skipped.push({ id: targetID, name: userTarget.zaloName });
        }
      } else if (action === "remove") {
        if (target.userTarget[senderId]) {
          delete target.userTarget[senderId];
          results.success.push({ id: targetID, name: userTarget.zaloName });
          
          if (!target.userTarget || Object.keys(target.userTarget).length === 0) {
            delete targetTracking[threadId].targetTracking[targetID];
          }
        } else {
          results.skipped.push({ id: targetID, name: userTarget.zaloName });
        }
      }
    } catch (error) {
      results.failed.push(targetID);
    }
  }

  return results;
}

async function checkInfoTargetList(api) {
  const botId = api.getBotId();
  const mngrData = api.apiManager.getDataManager();
  if (!mngrData.targetListTracking) mngrData.targetListTracking = {};
  const targetTrackingGroup = mngrData.targetListTracking;
  const objGetDataTracking = {};
  for (const [thread, target] of Object.entries(targetTrackingGroup)) {
    if (target.targetTracking) {
      for (const [idTarget, data] of Object.entries(target.targetTracking)) {
        if (!data.status) data.status = false;
        if (data.userTarget && Object.values(data.userTarget).length > 0) {
          objGetDataTracking[idTarget] = {};
          objGetDataTracking[idTarget].threadId = thread;
          objGetDataTracking[idTarget].type = target.type;
          objGetDataTracking[idTarget].userTargetId = Object.values(data.userTarget);
        }
      }
    }
  }
  let msg;
  let mentions = [];
  let mentionPos = 0;
  if (Object.values(objGetDataTracking).length > 0) {
    const listIds = Object.keys(objGetDataTracking);
    const dataInfoTarget = await getUsersInfoData(api, listIds);
    for (const [threadId, target] of Object.entries(targetTrackingGroup)) {
      if (target.targetTracking) {
        for (const [idTarget, data] of Object.entries(target.targetTracking)) {
          const targetInfo = dataInfoTarget[idTarget];
          if (targetInfo) {
            if (targetInfo.isOnline != data.status) {
              msg = `Người dùng ${targetInfo.name} ${
                targetInfo.isOnline ? "vừa mới online" : "đã offline (6 phút trước hoặc hơn)"
              }!\n`;
              if (target.type === MessageType.GroupMessage) {
                mentionPos = msg.length;
                msg += objGetDataTracking[idTarget].userTargetId
                  .map((userInfo, index) => {
                    const memberText = `@${userInfo.name} `;

                    const currentPos = mentionPos;

                    mentions.push({
                      uid: userInfo.id,
                      len: userInfo.name.length + 1,
                      pos: currentPos,
                    });

                    mentionPos += memberText.length + 1;
                    return memberText;
                  })
                  .join(" ");
              }
              try {
                await api.sendMessage(
                  {
                    msg: msg,
                    mentions: mentions,
                    ttl: 180000, //86400000,
                  },
                  threadId,
                  target.type
                );
              } catch (err) {
                delete targetTrackingGroup[threadId];
                managerDataCache.setChanged(botId);
              }
              data.status = targetInfo.isOnline;
            }
          }
        }
      }
    }
  }
  managerDataCache.setChanged(botId);
}

async function createTargetListImage(userList, userName) {
  const tempCanvas = createCanvas(1, 1);
  const tempCtx = tempCanvas.getContext("2d");
  tempCtx.font = "bold 32px " + FONT_MAIN;

  const avatarSize = 80;
  const padding = 30;
  const nameWidth = 400;
  const levelWidth = 200;
  const extraPadding = padding * 4;

  const totalUsers = userList.length;
  const useDoubleColumn = totalUsers > 10;

  const columnWidth = avatarSize + nameWidth + levelWidth + extraPadding;
  const width = useDoubleColumn ? columnWidth * 2 + padding * 2 : columnWidth;

  const headerHeight = 180;
  const itemHeight = 120;
  const itemsPerColumn = useDoubleColumn ? Math.ceil(totalUsers / 2) : totalUsers;
  const height = headerHeight + itemsPerColumn * itemHeight + 40;

  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext("2d");

  const gradient = ctx.createLinearGradient(0, 0, 0, height);
  gradient.addColorStop(0, "rgba(0, 119, 255, 0.9)");
  gradient.addColorStop(1, "rgba(11, 144, 184, 0.95)");
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, width, height);

  let yPos = padding * 2;
  ctx.textAlign = "center";
  ctx.font = "bold 48px " + FONT_MAIN;
  ctx.fillStyle = cv.getRandomGradient(ctx, width);
  ctx.fillText("TARGET-USERS", width / 2, yPos);

  yPos += 80;
  ctx.font = "bold 36px " + FONT_MAIN;
  ctx.fillStyle = "#FFD700";
  ctx.fillText(`Danh Sách Người Dùng Đang Theo Dõi`, width / 2, yPos);
  yPos += 40;

  if (useDoubleColumn) {
    const midPoint = Math.ceil(userList.length / 2);

    let leftYPos = yPos;
    for (let i = 0; i < midPoint; i++) {
      if (userList[i]) {
        leftYPos = await drawTargetItem(ctx, userList[i], leftYPos, i + 1, padding, 0, useDoubleColumn);
      }
    }

    let rightYPos = yPos;
    for (let i = midPoint; i < userList.length; i++) {
      if (userList[i]) {
        rightYPos = await drawTargetItem(
          ctx,
          userList[i],
          rightYPos,
          i + 1,
          padding,
          columnWidth + padding * 2 - 30,
          useDoubleColumn
        );
      }
    }

    ctx.fillStyle = "rgba(255, 255, 255, 0.2)";
    ctx.fillRect(width / 2, yPos - 20, 2, height - yPos);
  } else {
    let index = 1;
    for (const user of userList) {
      yPos = await drawTargetItem(ctx, user, yPos, index++, padding, 0, useDoubleColumn);
    }
  }

  const outputPath = path.join(tempDir, `target_users_${randomIDTemp()}.png`);
  const out = fs.createWriteStream(outputPath);
  const stream = canvas.createPNGStream();
  stream.pipe(out);

  return new Promise((resolve, reject) => {
    out.on("finish", () => resolve(outputPath));
    out.on("error", reject);
  });
}

async function drawTargetItem(ctx, user, yPos, index, padding, xOffset, isDoubleColumn) {
  const itemHeight = 120;
  try {
    const avatarSize = 80;
    const itemPadding = 20;

    ctx.fillStyle = "rgba(29, 18, 18, 0.1)";
    ctx.beginPath();

    const backgroundWidth = isDoubleColumn ? (ctx.canvas.width - padding * 4) / 2 : ctx.canvas.width - padding * 2;

    ctx.roundRect(padding + xOffset, yPos, backgroundWidth, itemHeight - itemPadding, 10);
    ctx.fill();

    if (user.avatar && cv.isValidUrl(user.avatar)) {
      const avatar = await loadImage(user.avatar);
      const avatarX = padding * 2 + xOffset;
      const avatarY = yPos + (itemHeight - avatarSize) / 2 - itemPadding / 2;

      ctx.save();
      ctx.beginPath();
      ctx.arc(avatarX + avatarSize / 2, avatarY + avatarSize / 2, avatarSize / 2 + 3, 0, Math.PI * 2);
      const borderGradient = ctx.createLinearGradient(avatarX, avatarY, avatarX + avatarSize, avatarY + avatarSize);
      borderGradient.addColorStop(0, "#4a9eff");
      borderGradient.addColorStop(1, "#0077ff");
      ctx.fillStyle = borderGradient;
      ctx.fill();

      ctx.beginPath();
      ctx.arc(avatarX + avatarSize / 2, avatarY + avatarSize / 2, avatarSize / 2, 0, Math.PI * 2);
      ctx.clip();
      ctx.drawImage(avatar, avatarX, avatarY, avatarSize, avatarSize);
      ctx.restore();
    }

    const separatorX = padding * 3 + avatarSize + xOffset;
    ctx.fillStyle = "rgba(255, 255, 255, 0.2)";
    ctx.fillRect(separatorX, yPos + itemPadding - 8, 2, itemHeight - itemPadding * 2);

    const textX = separatorX + padding * 2 - 20;
    const textY = yPos + itemPadding;

    ctx.textAlign = "left";
    ctx.font = "bold 32px " + FONT_MAIN;
    ctx.fillStyle = "#FFFFFF";
    ctx.fillText(`${index}. ${user.displayName}`, textX, textY + 20);

    ctx.font = "28px " + FONT_MAIN;
    ctx.fillStyle = "#4a9eff";
    ctx.fillText(`UID: ${user.id}`, textX, textY + 60);

    return yPos + itemHeight;
  } catch (error) {
    console.error("Lỗi khi vẽ thông tin người dùng:", error);
    return yPos + itemHeight;
  }
}

export async function initCheckTargetService(api) {
  const job = schedule.scheduleJob("*/1 * * * *", async function () {
    try {
      await checkInfoTargetList(api);
    } catch (error) {
      console.error(chalk.red("Đã xảy ra lỗi trong schedule Tracking User:"), error);
      job.cancel();
      console.log(chalk.red("Đã hủy schedule Tracking User do lỗi."));
    }
  });

  api.apiInstance.schedule.saveCheckTargetService = job;
  console.log(chalk.yellow("Khởi tạo schedule Tracking User thành công!"));
}
