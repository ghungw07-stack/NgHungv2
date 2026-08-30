import { removeMention } from "../../utils/format-util.js";
import {
  imgWebPrConfigFolderDir,
  readWebConfig,
  videoWebPrConfigFolderDir,
  writeWebConfig,
} from "../../utils/io-json.js";
import { sendMessageComplete, sendMessageFailed } from "../chat-zalo/chat-style/chat-style.js";
import { getDataAllGroup } from "../info-service/group-info.js";
import { getGlobalPrefix } from "../service.js";
import path from "path";
import fs from "fs";
import { checkExstentionFileRemote, downloadFile } from "../../utils/util.js";
import { cancelConfiguredPRMessages, queueConfiguredPRMessages } from "./pr-zalo.js";

const TIME_TO_LIVE = 720000;
const DEFAULT_FORM_NAME = "Form 1";
const DEFAULT_ZALO_ID = "-1";
const DEFAULT_TIME_FORMAT = "HH:mm";
const DEFAULT_TEXT_TRUNCATE_LENGTH = 30;
const TIME_FORMAT_REGEX = /^([01]?[0-9]|2[0-3]):[0-5][0-9]$/;

async function parseGroupIdFromLink(api, input) {
  const zaloLinkRegex = /(?:https?:\/\/)?(?:www\.)?zalo\.me\/g\/([a-zA-Z0-9_-]+)/i;
  const match = input.match(zaloLinkRegex);
  
  if (match) {
    try {
      const link = match[0].startsWith('http') ? match[0] : `https://${match[0]}`;
      const groupInfo = await api.getGroupInfoByLink(link);
      if (groupInfo && groupInfo.groupId) {
        return groupInfo.groupId;
      }
    } catch (error) {
      console.error(`Lỗi khi lấy thông tin nhóm từ link ${input}:`, error);
      throw new Error(`Không thể lấy thông tin nhóm từ link: ${error.message}`);
    }
  }
  
  return input;
}


export async function handleConfigPRCommand(api, message, aliasCommand) {
  const botId = api.getBotId();
  const prefix = getGlobalPrefix(botId);
  const content = removeMention(message);
  const contentCommand = content.replace(`${prefix + aliasCommand}`, "").trim();
  const threadId = message.threadId;

  if (!contentCommand || contentCommand === "help") {
    let caption =
      `Hướng dẫn tính năng cấu hình gửi tin nhắn định kỳ đến đa cộng đồng/nhóm` +
      `\nKích hoạt tính năng: ${prefix + aliasCommand} on` +
      `\nVô hiệu hóa tính năng: ${prefix + aliasCommand} off` +
      `\nGửi ngay một lượt: ${prefix + aliasCommand} send` +
      `\nTự động thêm group mới: ${prefix + aliasCommand} auto <on|off>` +
      `\nXem cấu hình hiện tại: ${prefix + aliasCommand} show` +
      `\nQuản lý nhóm:` +
      `\n   ${prefix + aliasCommand} group <add|remove> <groupId1 groupId2, all ...>` +
      `\nQuản lý whitelist nhóm:` +
      `\n   ${prefix + aliasCommand} group whitelist <add|remove|show> <groupId1 groupId2 ...>` +
      `\nChỉnh sửa cấu hình chung:` +
      `\n1. Sửa tên/nội dung:` +
      `\n   ${prefix + aliasCommand} edit <ten|noidung> <value>` +
      `\n2. Quản lý hình ảnh/video:` +
      `\n   ${prefix + aliasCommand} edit <image|video> <add|remove> <value>` +
      `\n   ${prefix + aliasCommand} edit <image|video> <download|dl> <tên file> (Reply vào tin nhắn chứa link)` +
      `\n   ${prefix + aliasCommand} edit <image|video> <delete|del> <tên file>` +
      `\n3. Quản lý thời gian:` +
      `\n   ${prefix + aliasCommand} edit thoigian <add|remove> <value>` +
      `\n4. Quản lý card:` +
      `\n   ${prefix + aliasCommand} edit card <add|remove> <zaloId|@user|me> [nội dung]` +
      `\n5. Xóa tất cả:` +
      `\n   ${prefix + aliasCommand} edit remove all` +
      `\nChỉnh sửa nội dung tùy chỉnh cho nhóm:` +
      `\n1. Thêm/Xóa cấu hình nhóm:` +
      `\n   ${prefix + aliasCommand} custom <groupId> <add|remove>` +
      `\n2. Sửa nội dung cho nhóm:` +
      `\n   ${prefix + aliasCommand} custom <groupId> noidung <value>` +
      `\n3. Quản lý media cho nhóm:` +
      `\n   ${prefix + aliasCommand} custom <groupId> <image|video> <add|remove> <value>` +
      `\n   ${prefix + aliasCommand} custom <groupId> card <add|remove> <zaloId|@user|me> [nội dung]` +
      `\n`;
    await sendMessageComplete(api, message, caption, false, TIME_TO_LIVE);
    return;
  }

  const config = await readWebConfig(api.getBotId());
  const argsCommand = contentCommand.split(" ");
  const command = argsCommand[0].toLowerCase();

  if (command === "send") {
    if (!Array.isArray(config.prObjects) || config.prObjects.length === 0) {
      await sendMessageFailed(api, message, "Chưa có nội dung PR để gửi.", false, TIME_TO_LIVE);
      return true;
    }

    const queued = queueConfiguredPRMessages(api, config);
    if (!queued.accepted) {
      await sendMessageFailed(api, message, "Một lượt PR đang chạy hoặc đang chờ, không tạo thêm lượt trùng.", false, TIME_TO_LIVE);
      return true;
    }
    await sendMessageComplete(api, message, "✅ Đã đưa lượt PR vào hàng đợi nền. Bot vẫn xử lý các tính năng khác bình thường.", true, TIME_TO_LIVE);
    void queued.promise.then(
      () => sendMessageComplete(api, message, "✅ Lượt PR đã hoàn tất.", true, TIME_TO_LIVE),
      (error) => sendMessageFailed(api, message, `Lượt PR lỗi: ${error?.message || error}`, false, TIME_TO_LIVE)
    ).catch(() => {});
    return true;
  }

  if (command === "on" || command === `off`) {
    if (command === "on") {
      config.activePr = true;
    } else {
      config.activePr = false;
      // Persist a cancellation epoch so PR loops running in other
      // shard/process instances can observe `off` as well.
      config.prCancelToken = (Number(config.prCancelToken) || 0) + 1;
      // activePr only prevents the next cron run. Explicitly invalidate the
      // current/queued run as well so `prs off` takes effect immediately.
      cancelConfiguredPRMessages(botId);
    }

    // Commit the state before replying. Otherwise an active loop can keep
    // sending while the confirmation message is being delivered.
    writeWebConfig(botId, config);

    const statusMessage = config.activePr ? "kích hoạt" : "vô hiệu hóa";
    const caption = `Đã ${statusMessage} tính năng gửi tin nhắn định kỳ đến đa cộng đồng/nhóm.`;
    if (config.activePr) {
      await sendMessageComplete(api, message, caption, true, TIME_TO_LIVE);
    } else {
      await sendMessageFailed(api, message, caption, true, TIME_TO_LIVE);
    }
    return true;
  }

  if (command === "auto") {
    if (argsCommand.length < 2) {
      await sendMessageFailed(
        api,
        message,
        "Cú pháp không hợp lệ. Dùng:\n" +
          `📌 ${prefix + aliasCommand} auto on ➝ Bật tự động thêm group mới\n` +
          `📌 ${prefix + aliasCommand} auto off ➝ Tắt tự động thêm group mới`,
        false,
        TIME_TO_LIVE
      );
      return true;
    }

    const autoAction = argsCommand[1].toLowerCase();
    if (autoAction === "on") {
      config.autoAddGroup = true;
      config.activePr = true;
      const statusMessage = "kích hoạt";
      const caption = `✅ Đã ${statusMessage} tính năng gửi tin nhắn định kỳ đến đa cộng đồng/nhóm.`;
      await sendMessageComplete(api, message, caption, true, TIME_TO_LIVE);
    } else if (autoAction === "off") {
      config.autoAddGroup = false;
      const caption = "❌ Đã tắt chế độ tự động thêm group mới.";
      await sendMessageFailed(api, message, caption, true, TIME_TO_LIVE);
    } else {
      await sendMessageFailed(
        api,
        message,
        "Hành động không hợp lệ. Chỉ chấp nhận: on, off.",
        false,
        TIME_TO_LIVE
      );
      return true;
    }

    writeWebConfig(botId, config);
    return true;
  }

  if (command === "show") {
    const prObjects = config.prObjects || [];
    if (prObjects.length === 0) {
      await sendMessageComplete(api, message, "Chưa có cấu hình nào được thiết lập.", false, TIME_TO_LIVE);
      return true;
    }

    const groups = await getDataAllGroup(api);
    const groupsObject = {};
    groups.forEach((group) => {
      groupsObject[group.groupId] = {
        ...group,
      };
    });

    const truncateText = (text, maxLength = DEFAULT_TEXT_TRUNCATE_LENGTH) => {
      if (!text || text.length <= maxLength * 2) return text;
      const start = text.substring(0, maxLength);
      const end = text.substring(text.length - maxLength);
      return `${start}...${end}`;
    };

    const activePrStatus = config.activePr ? "✅ Đã bật" : "❌ Đã tắt";
    const autoAddGroupStatus = config.autoAddGroup ? "✅ Đã bật" : "❌ Đã tắt";
    
    let caption = "⚙️ Trạng thái tính năng:\n";
    caption += `   • Tính năng PR: ${activePrStatus}\n`;
    caption += `   • Tự động thêm group mới: ${autoAddGroupStatus}\n\n`;
    caption += "📋 Danh sách cấu hình gửi tin nhắn định kỳ:\n\n";
    prObjects.forEach((obj, index) => {
      caption += `${index + 1}. ${obj.ten}\n`;
      caption += `   📝 Nội dung: ${truncateText(obj.noiDung)}\n`;
      caption += `   🖼️ Hình ảnh: ${
        Array.isArray(obj.hinhAnh) && obj.hinhAnh.length > 0 ? obj.hinhAnh.join(", ") : "Không có"
      }\n`;
      caption += `   🎥 Video: ${
        Array.isArray(obj.video) && obj.video.length > 0 ? obj.video.join(", ") : "Không có"
      }\n`;
      caption += `   🃏 Card: ${obj.card?.zaloId ? `${obj.card.zaloId}${obj.card.content ? ` - "${obj.card.content}"` : ""}` : "Không có"}\n`;
      caption += `   ⏰ Thời gian gửi: ${Array.isArray(obj.thoiGianGui) ? obj.thoiGianGui.join(", ") : ""}\n`;

      if (obj.customContent && Object.keys(obj.customContent).length > 0) {
        caption += ` 📌 Nội dung tùy chỉnh cho các nhóm:\n`;
        for (const [groupId, content] of Object.entries(obj.customContent)) {
          caption += `    - Nhóm ${groupsObject[groupId]?.name || groupId}:\n`;
          caption += `      Nội dung: ${truncateText(content.noiDung)}\n`;
          caption += `      Hình ảnh: ${content.hinhAnh.join(", ") || "Không có"}\n`;
          caption += `      Video: ${content.video.length > 0 ? content.video.join(", ") : "Không có"}\n`;
          caption += `      Card: ${content.card?.zaloId ? `${content.card.zaloId}${content.card.content ? ` - "${content.card.content}"` : ""}` : "Không có"}\n`;
        }
      }
      caption += "\n";
    });

    caption += "📑 Danh sách nhóm được chọn để gửi tin nhắn định kỳ:\n";
    if (!config.prSelectedGroups || Object.keys(config.prSelectedGroups).length === 0) {
      caption += "   Chưa có nhóm nào được chọn\n";
    } else {
      for (const [groupId, groupInfo] of Object.entries(config.prSelectedGroups)) {
        const groupName = groupsObject[groupId]?.name || groupInfo.name || groupId;
        caption += `   • ${groupName}\n`;
      }
    }

    const MAX_MESSAGE_LENGTH = 1800;
    const splitCaptionIntoChunks = (text, maxLength) => {
      const chunks = [];
      let currentIndex = 0;

      while (currentIndex < text.length) {
        let endIndex = Math.min(currentIndex + maxLength, text.length);

        if (endIndex < text.length) {
          const lastNewLine = text.lastIndexOf("\n", endIndex);
          const lastSpace = text.lastIndexOf(" ", endIndex);
          const splitIndex = Math.max(lastNewLine, lastSpace);

          if (splitIndex > currentIndex) {
            endIndex = splitIndex;
          }
        }

        if (endIndex <= currentIndex) {
          endIndex = Math.min(currentIndex + maxLength, text.length);
        }

        let chunk = text.slice(currentIndex, endIndex).trimEnd();
        if (chunk.startsWith("\n")) {
          chunk = chunk.trimStart();
        }

        if (chunk.length > 0) {
          chunks.push(chunk);
        }

        currentIndex = endIndex;
        while (currentIndex < text.length && (text[currentIndex] === "\n" || text[currentIndex] === " ")) {
          currentIndex++;
        }
      }

      return chunks;
    };

    const chunks = splitCaptionIntoChunks(caption, MAX_MESSAGE_LENGTH);
    const totalChunks = chunks.length || 1;

    for (let index = 0; index < chunks.length; index++) {
      const prefix = totalChunks > 1 ? `(Phần ${index + 1}/${totalChunks})\n\n` : "";
      await sendMessageComplete(api, message, `${prefix}${chunks[index]}`, false, TIME_TO_LIVE);
      if (index < chunks.length - 1) {
        await new Promise((resolve) => setTimeout(resolve, 300));
      }
    }

    return true;
  }

  if (command === "edit") {
    if (argsCommand.length < 3) {
      await sendMessageFailed(
        api,
        message,
        "Cú pháp không hợp lệ. Vui lòng xem hướng dẫn sử dụng.",
        false,
        TIME_TO_LIVE
      );
      return true;
    }

    if (!config.prObjects || config.prObjects.length === 0) {
      config.prObjects = [
        {
          ten: DEFAULT_FORM_NAME,
          idZalo: DEFAULT_ZALO_ID,
          noiDung: "",
          hinhAnh: [],
          video: [],
          card: { zaloId: "", content: "" },
          link: {},
          thoiGianGui: [],
          customContent: {},
        },
      ];
    }

    const obj = config.prObjects[0];
    const field = argsCommand[1].toLowerCase();
    let successMessage = "";

    if (field === "remove" && argsCommand[2] === "all") {
      obj.noiDung = "";
      obj.hinhAnh = [];
      obj.video = [];
      obj.card = { zaloId: "", content: "" };
      obj.thoiGianGui = [];
      obj.idZalo = DEFAULT_ZALO_ID;
      obj.customContent = {};
      
      successMessage = "Đã xóa tất cả cấu hình tùy chỉnh.";
      writeWebConfig(botId, config);
      await sendMessageComplete(api, message, successMessage, true, TIME_TO_LIVE);
      return true;
    }

    if (field === "ten" || field === "noidung") {
      const value = argsCommand.slice(2).join(" ");
      if (field === "ten") {
        obj.ten = value;
        successMessage = "Đã cập nhật tên cấu hình cho tính năng gửi tin nhắn định kỳ.";
      } else {
        let content = message.data.content;
        if (content && typeof content === "object" && content.title) {
          content = content.title;
        }
        if (typeof content === "string") {
          obj.noiDung = content
            .replace(prefix, "")
            .replace(aliasCommand, "")
            .replace("edit", "")
            .replace("noidung", "")
            .trim();
          successMessage = "Đã cập nhật nội dung cấu hình cho tính năng gửi tin nhắn định kỳ.";
        } else {
          await sendMessageFailed(
            api,
            message,
            "Không thể lấy nội dung từ tin nhắn. Vui lòng thử lại.",
            false,
            TIME_TO_LIVE
          );
          return true;
        }
      }
    }

    else if (field === "image" || field === "video" || field === "card" || field === "thoigian") {
      const action = argsCommand[2]?.toLowerCase();
      
      if (field === "card" && (action === "add" || action === "remove")) {
        if (argsCommand.length < 3) {
          await sendMessageFailed(
            api,
            message,
            "Cú pháp không hợp lệ. Thiếu tham số add/remove.",
            false,
            TIME_TO_LIVE
          );
          return true;
        }
      } else if (argsCommand.length < 4) {
        await sendMessageFailed(
          api,
          message,
          "Cú pháp không hợp lệ. Thiếu tham số add/remove/download/delete hoặc giá trị.",
          false,
          TIME_TO_LIVE
        );
        return true;
      }
      let values = argsCommand
        .slice(3)
        .join(" ")
        .split(" ")
        .filter((v) => v);

      if (!["add", "remove", "download", "dl", "delete", "del"].includes(action)) {
        await sendMessageFailed(
          api,
          message,
          "Hành động không hợp lệ. Chỉ chấp nhận: add, remove, download (dl), delete (del).",
          false,
          TIME_TO_LIVE
        );
        return true;
      }

      let targetArray;
      let itemName;
      let mediaFolder;

      switch (field) {
        case "image":
          targetArray = obj.hinhAnh;
          itemName = "hình ảnh";
          mediaFolder = imgWebPrConfigFolderDir(botId);
          break;
        case "video":
          targetArray = obj.video;
          itemName = "video";
          mediaFolder = videoWebPrConfigFolderDir(botId);
          break;
        case "card":
          if (action === "add") {
            const mentions = message.data?.mentions || [];
            let zaloId = null;
            
            if (mentions.length > 0) {
              zaloId = String(mentions[0].uid);
            } else {
              const cardArgs = argsCommand.slice(3);
              if (cardArgs.length === 0) {
                await sendMessageFailed(api, message, "Vui lòng nhập Zalo ID, @mention hoặc 'me' cho card.", false, TIME_TO_LIVE);
                return true;
              }
              if (cardArgs[0].toLowerCase() === "me") {
                zaloId = String(message.data.uidFrom);
              } else {
                zaloId = cardArgs[0];
              }
            }
            
            const contentArgs = mentions.length > 0 
              ? argsCommand.slice(3).join(" ").trim()
              : argsCommand[3]?.toLowerCase() === "me"
                ? argsCommand.slice(4).join(" ").trim()
                : argsCommand.slice(4).join(" ").trim();
            const content = contentArgs && contentArgs.length > 0 ? contentArgs : "Danh Thiếp Liên Hệ"; 
            
            obj.card = { zaloId, content };
            obj.idZalo = zaloId; 
            successMessage = `Đã thêm card với Zalo ID: ${zaloId}${content !== "Danh Thiếp Liên Hệ" ? ` và nội dung: "${content}"` : ""}`;
          } else if (action === "remove") {
            const mentions = message.data?.mentions || [];
            let targetZaloId = null;
            
            if (mentions.length > 0) {
              targetZaloId = String(mentions[0].uid);
            } else {
              const cardArgs = argsCommand.slice(3);
              if (cardArgs.length > 0) {
                if (cardArgs[0].toLowerCase() === "me") {
                  targetZaloId = String(message.data.uidFrom);
                } else {
                  targetZaloId = cardArgs[0];
                }
              }
            }
            
            if (targetZaloId) {
              if (obj.card?.zaloId === targetZaloId) {
                obj.card = { zaloId: "", content: "" };
                obj.idZalo = DEFAULT_ZALO_ID;
                successMessage = `Đã xóa card của Zalo ID: ${targetZaloId} khỏi cấu hình.`;
              } else {
                await sendMessageFailed(api, message, `Không tìm thấy card của Zalo ID: ${targetZaloId} trong cấu hình.`, false, TIME_TO_LIVE);
                return true;
              }
            } else {
              obj.card = { zaloId: "", content: "" };
              obj.idZalo = DEFAULT_ZALO_ID;
              successMessage = "Đã xóa card khỏi cấu hình.";
            }
          } else {
            await sendMessageFailed(
              api,
              message,
              "Hành động không hợp lệ cho card. Chỉ chấp nhận: add, remove.",
              false,
              TIME_TO_LIVE
            );
            return true;
          }
          break;
        case "thoigian":
          const formattedTimes = [];
          const invalidTimes = [];

          const formatTime = (time) => {
            if (!TIME_FORMAT_REGEX.test(time)) {
              return null;
            }
            const [hours, minutes] = time.split(":");
            return `${hours.padStart(2, "0")}:${minutes}`;
          };

          values.forEach((time) => {
            const formatted = formatTime(time);
            if (formatted) {
              formattedTimes.push(formatted);
            } else {
              invalidTimes.push(time);
            }
          });

          if (invalidTimes.length > 0) {
            await sendMessageFailed(
              api,
              message,
              `Format thời gian không hợp lệ: ${invalidTimes.join(
                ", "
              )}.\nVui lòng sử dụng định dạng HH:mm (ví dụ: 08:00 12:00 15:00).`,
              false,
              TIME_TO_LIVE
            );
            return true;
          }

          values = formattedTimes;
          targetArray = obj.thoiGianGui;
          itemName = "thời gian";
          break;
      }

      if (action === "download" || action === "dl") {
        const quote = message.data?.quote;
        if (!quote) {
          await sendMessageFailed(
            api,
            message,
            `Vui lòng trả lời (reply/quote) tin nhắn chứa link ${itemName} cần tải.`,
            false,
            TIME_TO_LIVE
          );
          return true;
        }

        const attach = quote.attach;
        if (!attach) {
          await sendMessageFailed(
            api,
            message,
            `Không có đính kèm nào trong nội dung reply của bạn.`,
            false,
            TIME_TO_LIVE
          );
          return;
        }

        const fileName = values[0];
        if (!fileName) {
          await sendMessageFailed(api, message, `Vui lòng nhập tên file cho ${itemName}.`, false, TIME_TO_LIVE);
          return true;
        }

        const attachData = JSON.parse(attach);
        const mediaUrl = attachData.hdUrl || attachData.href;
        if (!mediaUrl) {
          await sendMessageFailed(
            api,
            message,
            `Không tìm thấy link ${itemName} trong tin nhắn được trả lời.`,
            false,
            TIME_TO_LIVE
          );
          return true;
        }

        try {
          const fullFileName = fileName + "." + (await checkExstentionFileRemote(mediaUrl));
          const filePath = path.join(mediaFolder, fullFileName);

          await downloadFile(mediaUrl, filePath);
          successMessage = `Đã tải ${itemName} "${fullFileName}" thành công.`;
        } catch (error) {
          await sendMessageFailed(api, message, `Lỗi khi tải ${itemName}: ${error.message}`, false, TIME_TO_LIVE);
          return true;
        }
      }
      else if (action === "delete" || action === "del") {
        const deletedFiles = [];
        const notFoundFiles = [];
        const inUseFiles = [];

        await Promise.all(
          values.map(async (fileName) => {
            const filePath = path.join(mediaFolder, fileName);
            try {
              await fs.promises.unlink(filePath);
              deletedFiles.push(fileName);
            } catch (error) {
              if (error?.code === "ENOENT") {
                notFoundFiles.push(fileName);
              } else {
                inUseFiles.push(fileName);
              }
            }
          })
        );

        if (deletedFiles.length > 0) {
          successMessage = `Đã xóa ${itemName}: ${deletedFiles.join(", ")}`;
        }
        if (notFoundFiles.length > 0) {
          if (successMessage) {
            successMessage += `\nKhông tìm thấy ${itemName}: ${notFoundFiles.join(", ")}`;
          } else {
            successMessage = `Không tìm thấy ${itemName}: ${notFoundFiles.join(", ")}`;
          }
        }
        if (inUseFiles.length > 0) {
          if (successMessage) {
            successMessage += `\nKhông thể xóa ${itemName} (đang được sử dụng): ${inUseFiles.join(", ")}`;
          } else {
            successMessage = `Không thể xóa ${itemName} (đang được sử dụng): ${inUseFiles.join(", ")}`;
          }
        }
      }

      else if (field !== "card") {
        let addedItems = [];
        let existingItems = [];
        let removedItems = [];
        let notFoundItems = [];

        if (action === "add") {
          const quote = message.data?.quote;
          
          if (quote) {
            const attach = quote.attach;
            if (attach) {
              try {
                const attachData = JSON.parse(attach);
                const mediaUrl = attachData.hdUrl || attachData.href;
                if (mediaUrl) {
                  let fileName;
                  if (values.length > 0) {
                    const userFileName = values[0];
                    const ext = await checkExstentionFileRemote(mediaUrl);
                    if (userFileName.includes(".")) {
                      fileName = userFileName;
                    } else {
                      fileName = `${userFileName}.${ext}`;
                    }
                  } else {
                    const ext = await checkExstentionFileRemote(mediaUrl);
                    fileName = `auto_${Date.now()}.${ext}`;
                  }
                  
                  const filePath = path.join(mediaFolder, fileName);

                  await downloadFile(mediaUrl, filePath);
                  
                  if (!targetArray.includes(fileName)) {
                    targetArray.push(fileName);
                    addedItems.push(fileName);
                  } else {
                    existingItems.push(fileName);
                  }
                  
                  if (addedItems.length > 0) {
                    successMessage = `Đã thêm ${itemName}: ${addedItems.join(", ")} cho cấu hình gửi tin nhắn định kỳ.`;
                  }
                  if (existingItems.length > 0) {
                    successMessage += `\n${itemName} đã tồn tại: ${existingItems.join(", ")}.`;
                  }
                  writeWebConfig(botId, config);
                  await sendMessageComplete(api, message, successMessage || `Đã tải và thêm ${itemName} thành công.`, true, TIME_TO_LIVE);
                  return true;
                }
              } catch (error) {
                await sendMessageFailed(api, message, `Lỗi khi tải ${itemName}: ${error.message}`, false, TIME_TO_LIVE);
                return true;
              }
            }
          }
          
          if (values.length > 0) {
            values.forEach((value) => {
              if (!targetArray.includes(value)) {
                targetArray.push(value);
                addedItems.push(value);
              } else {
                existingItems.push(value);
              }
            });
          }

          if (addedItems.length > 0) {
            successMessage = `Đã thêm ${itemName}: ${addedItems.join(", ")} cho cấu hình gửi tin nhắn định kỳ.`;
          }
          if (existingItems.length > 0) {
            successMessage += `\n${itemName} đã tồn tại: ${existingItems.join(", ")}.`;
          }
        } else {
          values.forEach((value) => {
            const index = targetArray.indexOf(value);
            if (index !== -1) {
              targetArray.splice(index, 1);
              removedItems.push(value);
            } else {
              notFoundItems.push(value);
            }
          });

          if (removedItems.length > 0) {
            successMessage = `Đã xóa ${itemName}: ${removedItems.join(", ")} cho cấu hình gửi tin nhắn định kỳ.`;
          }
          if (notFoundItems.length > 0) {
            successMessage += `\nKhông tìm thấy ${itemName}: ${notFoundItems.join(", ")}.`;
          }
        }
      }

      if (!successMessage && field !== "card") {
        successMessage = `Không có ${itemName} nào được ${action}.`;
      }
    } else {
      await sendMessageFailed(
        api,
        message,
        "Trường dữ liệu không hợp lệ. Chỉ chấp nhận: ten, noidung, image, video, card, thoigian",
        false,
        TIME_TO_LIVE
      );
      return true;
    }

    writeWebConfig(botId, config);
    await sendMessageComplete(api, message, successMessage, true, TIME_TO_LIVE);
    return true;
  }

  if (command === "custom") {
    if (argsCommand.length < 3) {
      await sendMessageFailed(
        api,
        message,
        "Cú pháp không hợp lệ. Vui lòng xem hướng dẫn sử dụng.",
        false,
        TIME_TO_LIVE
      );
      return true;
    }

    if (!config.prObjects || config.prObjects.length === 0) {
      config.prObjects = [
        {
          ten: DEFAULT_FORM_NAME,
          idZalo: DEFAULT_ZALO_ID,
          noiDung: "",
          hinhAnh: [],
          video: [],
          card: { zaloId: "", content: "" },
          link: {},
          thoiGianGui: [],
          customContent: {},
        },
      ];
    }

    const obj = config.prObjects[0];
    const groupId = argsCommand[1];
    if (!groupId) {
      await sendMessageFailed(api, message, "Thiếu groupId, vui lòng bổ sung thêm.", false, TIME_TO_LIVE);
      return true;
    }

    const action = argsCommand[2].toLowerCase();
    let successMessage = "";

    if (action === "add" || action === "remove") {
      if (action === "add") {
        if (!obj.customContent[groupId]) {
          obj.customContent[groupId] = {
            noiDung: obj.noiDung,
            hinhAnh: [...obj.hinhAnh],
            video: [...obj.video],
            card: { ...obj.card },
            idZalo: obj.idZalo,
          };
          successMessage = `Đã thêm cấu hình tùy chỉnh cho nhóm ${groupId}`;
        } else {
          successMessage = `Nhóm ${groupId} đã có cấu hình tùy chỉnh`;
        }
      } else {
        if (obj.customContent[groupId]) {
          delete obj.customContent[groupId];
          successMessage = `Đã xóa cấu hình tùy chỉnh của nhóm ${groupId}`;
        } else {
          successMessage = `Không tìm thấy cấu hình tùy chỉnh của nhóm ${groupId}`;
        }
      }
    }
    else if (action === "noidung") {
      if (!obj.customContent[groupId]) {
        await sendMessageFailed(
          api,
          message,
          `Chưa có cấu hình tùy chỉnh cho nhóm ${groupId}. Hãy thêm trước bằng lệnh custom ${groupId} add`,
          false,
          TIME_TO_LIVE
        );
        return true;
      }
      let content = message.data.content;
      if (content && typeof content === "object" && content.title) {
        content = content.title;
      }
      if (typeof content !== "string") {
        await sendMessageFailed(
          api,
          message,
          "Không thể lấy nội dung từ tin nhắn. Vui lòng thử lại.",
          false,
          TIME_TO_LIVE
        );
        return true;
      }
      const value = content
        .replace(prefix, "")
        .replace(aliasCommand, "")
        .replace("edit", "")
        .replace("custom", "")
        .replace("noidung", "")
        .replace(groupId, "")
        .trim();
      if (!value) {
        await sendMessageFailed(api, message, "Thiếu giá trị nội dung, vui lòng bổ sung thêm.", false, TIME_TO_LIVE);
        return true;
      }
      obj.customContent[groupId].noiDung = value;
      successMessage = `Đã cập nhật nội dung tùy chỉnh cho nhóm ${groupId}`;
    }
    else if (action === "image" || action === "video" || action === "card") {
      const mediaAction = argsCommand[3]?.toLowerCase();
      
      if (action === "card" && (mediaAction === "add" || mediaAction === "remove")) {
        if (argsCommand.length < 4) {
          await sendMessageFailed(
            api,
            message,
            "Cú pháp không hợp lệ. Thiếu tham số add/remove.",
            false,
            TIME_TO_LIVE
          );
          return true;
        }
      } else if (argsCommand.length < 5) {
        await sendMessageFailed(
          api,
          message,
          "Cú pháp không hợp lệ. Thiếu tham số add/remove/download/delete hoặc giá trị.",
          false,
          TIME_TO_LIVE
        );
        return true;
      }

      if (!obj.customContent[groupId]) {
        await sendMessageFailed(
          api,
          message,
          `Chưa có cấu hình tùy chỉnh cho nhóm ${groupId}. Hãy thêm trước bằng lệnh custom ${groupId} add`,
          false,
          TIME_TO_LIVE
        );
        return true;
      }

      const value = argsCommand.slice(4).join(" ");

      if (mediaAction !== "add" && mediaAction !== "remove") {
        await sendMessageFailed(
          api,
          message,
          "Hành động không hợp lệ. Chỉ chấp nhận add hoặc remove.",
          false,
          TIME_TO_LIVE
        );
        return true;
      }

      if (action === "card") {
        if (mediaAction === "add") {
          const mentions = message.data?.mentions || [];
          let zaloId = null;
          
          if (mentions.length > 0) {
            zaloId = String(mentions[0].uid);
          } else {
            const cardArgs = argsCommand.slice(4);
            if (cardArgs.length === 0) {
              await sendMessageFailed(api, message, "Vui lòng nhập Zalo ID, @mention hoặc 'me' cho card.", false, TIME_TO_LIVE);
              return true;
            }
            if (cardArgs[0].toLowerCase() === "me") {
              zaloId = String(message.data.uidFrom);
            } else {
              zaloId = cardArgs[0];
            }
          }
          
          const contentArgs = mentions.length > 0 
            ? argsCommand.slice(4).join(" ").trim()
            : argsCommand[4]?.toLowerCase() === "me"
              ? argsCommand.slice(5).join(" ").trim()
              : argsCommand.slice(5).join(" ").trim();
          const content = contentArgs && contentArgs.length > 0 ? contentArgs : "Danh Thiếp Liên Hệ";
          
          obj.customContent[groupId].card = { zaloId, content };
          obj.customContent[groupId].idZalo = zaloId;
          successMessage = `Đã thêm card với Zalo ID "${zaloId}"${content !== "Danh Thiếp Liên Hệ" ? ` và nội dung: "${content}"` : ""} cho nhóm ${groupId}`;
        } else if (mediaAction === "remove") {
          const mentions = message.data?.mentions || [];
          let targetZaloId = null;
          
          if (mentions.length > 0) {
            targetZaloId = String(mentions[0].uid);
          } else {
            const cardArgs = argsCommand.slice(4);
            if (cardArgs.length > 0) {
              if (cardArgs[0].toLowerCase() === "me") {
                targetZaloId = String(message.data.uidFrom);
              } else {
                targetZaloId = cardArgs[0];
              }
            }
          }
          
          if (targetZaloId) {
            if (obj.customContent[groupId].card?.zaloId === targetZaloId) {
              obj.customContent[groupId].card = { zaloId: "", content: "" };
              obj.customContent[groupId].idZalo = DEFAULT_ZALO_ID;
              successMessage = `Đã xóa card của Zalo ID: ${targetZaloId} khỏi nhóm ${groupId}`;
            } else {
              await sendMessageFailed(api, message, `Không tìm thấy card của Zalo ID: ${targetZaloId} trong cấu hình nhóm ${groupId}.`, false, TIME_TO_LIVE);
              return true;
            }
          } else {
            obj.customContent[groupId].card = { zaloId: "", content: "" };
            obj.customContent[groupId].idZalo = DEFAULT_ZALO_ID;
            successMessage = `Đã xóa card khỏi nhóm ${groupId}`;
          }
        } else {
          await sendMessageFailed(
            api,
            message,
            "Hành động không hợp lệ cho card. Chỉ chấp nhận add hoặc remove.",
            false,
            TIME_TO_LIVE
          );
          return true;
        }
      } else {
        const targetArray = action === "image" ? obj.customContent[groupId].hinhAnh : obj.customContent[groupId].video;
        const itemName = action === "image" ? "hình ảnh" : "video";
        const mediaFolder = action === "image" ? imgWebPrConfigFolderDir(botId) : videoWebPrConfigFolderDir(botId);

        if (mediaAction === "add") {
          const quote = message.data?.quote;
          
          if (quote) {
            const attach = quote.attach;
            if (attach) {
              try {
                const attachData = JSON.parse(attach);
                const mediaUrl = attachData.hdUrl || attachData.href;
                if (mediaUrl) {
                  let fileName;
                  if (value) {
                    const ext = await checkExstentionFileRemote(mediaUrl);
                    if (value.includes(".")) {
                      fileName = value;
                    } else {
                      fileName = `${value}.${ext}`;
                    }
                  } else {
                    const ext = await checkExstentionFileRemote(mediaUrl);
                    fileName = `auto_${Date.now()}.${ext}`;
                  }
                  
                  const filePath = path.join(mediaFolder, fileName);

                  await downloadFile(mediaUrl, filePath);
                  
                  if (!targetArray.includes(fileName)) {
                    targetArray.push(fileName);
                    successMessage = `Đã thêm ${itemName} "${fileName}" cho nhóm ${groupId}`;
                  } else {
                    successMessage = `${itemName} "${fileName}" đã tồn tại trong cấu hình của nhóm ${groupId}`;
                  }
                  
                  writeWebConfig(botId, config);
                  await sendMessageComplete(api, message, successMessage, true, TIME_TO_LIVE);
                  return true;
                }
              } catch (error) {
                await sendMessageFailed(api, message, `Lỗi khi tải ${itemName}: ${error.message}`, false, TIME_TO_LIVE);
                return true;
              }
            }
          }
          
          if (value) {
            if (!targetArray.includes(value)) {
              targetArray.push(value);
              successMessage = `Đã thêm ${itemName} "${value}" cho nhóm ${groupId}`;
            } else {
              successMessage = `${itemName} "${value}" đã tồn tại trong cấu hình của nhóm ${groupId}`;
            }
          }
        } else {
          const index = targetArray.indexOf(value);
          if (index !== -1) {
            targetArray.splice(index, 1);
            successMessage = `Đã xóa ${itemName} "${value}" khỏi nhóm ${groupId}`;
          } else {
            successMessage = `Không tìm thấy ${itemName} "${value}" trong cấu hình của nhóm ${groupId}`;
          }
        }
      }
    } else {
      await sendMessageFailed(
        api,
        message,
        `Hành động không hợp lệ. Vui lòng xem hướng dẫn sử dụng bằng lệnh ${prefix + aliasCommand}.`,
        false,
        TIME_TO_LIVE
      );
      return true;
    }

    writeWebConfig(botId, config);
    await sendMessageComplete(api, message, successMessage, true, TIME_TO_LIVE);
    return true;
  }

if (command === "group") {
  if (argsCommand.length < 2) {
    await sendMessageFailed(
      api,
      message,
      "Cú pháp không hợp lệ. Dùng:\n" +
        "📌 group add [groupId1 groupId2 ...]\n" +
        "📌 group remove [groupId1 groupId2 ...]\n" +
        "📌 group add all  ➝ Thêm toàn bộ nhóm\n" +
        "📌 group remove all ➝ Xóa toàn bộ nhóm\n" +
        "📌 group whitelist add [groupId1 groupId2 ...] ➝ Thêm nhóm vào whitelist\n" +
        "📌 group whitelist remove [index1|groupId1 index2|groupId2 ...] ➝ Xóa nhóm khỏi whitelist\n" +
        "📌 group whitelist show ➝ Xem danh sách whitelist\n" +
        "💡 Nếu không nhập groupId, hệ thống sẽ tự lấy nhóm hiện tại.",
      false,
      TIME_TO_LIVE
    );
    return true;
  }

  const action = argsCommand[1].toLowerCase();
  
  if (action === "whitelist") {
    if (argsCommand.length < 3) {
      await sendMessageFailed(
        api,
        message,
        "Cú pháp không hợp lệ. Dùng:\n" +
          "📌 group whitelist add [groupId1 groupId2 ...]\n" +
          "📌 group whitelist remove [index1|groupId1 index2|groupId2 ...] ➝ Xóa nhóm khỏi whitelist\n" +
          "📌 group whitelist show ➝ Xem danh sách whitelist\n" +
          "💡 Nếu không nhập groupId, hệ thống sẽ tự lấy nhóm hiện tại.",
        false,
        TIME_TO_LIVE
      );
      return true;
    }

    if (!config.groupWhitelist) config.groupWhitelist = [];

    const whitelistAction = argsCommand[2].toLowerCase();
    const groups = await getDataAllGroup(api);
    const groupsObject = {};
    groups.forEach((group) => {
      groupsObject[group.groupId] = { ...group };
    });

    let groupIds = argsCommand.slice(3).filter((id) => id);
    if (groupIds.length === 0 && whitelistAction !== "show") {
      groupIds = [message.threadId];
    }

    if (whitelistAction === "show") {
      if (config.groupWhitelist.length === 0) {
        await sendMessageComplete(
          api,
          message,
          "📋 Danh sách whitelist hiện tại: Trống",
          false,
          TIME_TO_LIVE
        );
        return true;
      }

      let caption = "📋 Danh sách nhóm trong whitelist:\n\n";
      config.groupWhitelist.forEach((groupId, index) => {
        const groupInfo = groupsObject[groupId];
        const groupName = groupInfo?.name || groupId;
        caption += `${index + 1}. ${groupName} (${groupId})\n`;
      });

      await sendMessageComplete(api, message, caption, false, TIME_TO_LIVE);
      return true;
    }

    if (whitelistAction === "add") {
      const addedGroups = [];
      const existingGroups = [];
      const invalidGroups = [];
      const errorGroups = [];

      for (const input of groupIds) {
        let groupId;
        try {
          groupId = await parseGroupIdFromLink(api, input);
        } catch (error) {
          errorGroups.push({ input, error: error.message });
          continue;
        }

        if (!groupsObject[groupId]) {
          try {
            const allGroups = await getDataAllGroup(api);
            allGroups.forEach((group) => {
              groupsObject[group.groupId] = { ...group };
            });
          } catch (error) {
            console.error("Lỗi khi refresh danh sách nhóm:", error);
          }
        }

        if (!groupsObject[groupId]) {
          invalidGroups.push(input);
          continue;
        }

        if (config.groupWhitelist.includes(groupId)) {
          existingGroups.push(groupsObject[groupId].name || groupId);
          continue;
        }

        config.groupWhitelist.push(groupId);
        addedGroups.push(groupsObject[groupId].name || groupId);
      }

      let successMessage = "";
      if (addedGroups.length > 0) {
        successMessage += `✅ Đã thêm ${addedGroups.length} nhóm vào whitelist:\n`;
        addedGroups.forEach((name, index) => {
          successMessage += `${index + 1}. ${name}\n`;
        });
      }
      if (existingGroups.length > 0) {
        successMessage += `\n⚠️ Nhóm đã có trong whitelist:\n`;
        existingGroups.forEach((name, index) => {
          successMessage += `${index + 1}. ${name}\n`;
        });
      }
      if (invalidGroups.length > 0) {
        successMessage += `\n❌ Không tìm thấy nhóm:\n`;
        invalidGroups.forEach((id, index) => {
          successMessage += `${index + 1}. ${id}\n`;
        });
      }
      if (errorGroups.length > 0) {
        successMessage += `\n❌ Lỗi khi xử lý link:\n`;
        errorGroups.forEach((item, index) => {
          successMessage += `${index + 1}. ${item.input}: ${item.error}\n`;
        });
      }

      if (!successMessage) {
        successMessage = "ℹ️ Không có thay đổi nào được thực hiện.";
      }

      writeWebConfig(botId, config);
      await sendMessageComplete(api, message, successMessage, true, TIME_TO_LIVE);
      return true;
    }

    if (whitelistAction === "remove") {
      const removedGroups = [];
      const notFoundGroups = [];
      const errorGroups = [];

      for (const input of groupIds) {
        let groupId = input;
        let removeIndex = -1;

        if (/^\d+$/.test(input.trim())) {
          const num = parseInt(input.trim());
          if (num > 0 && num <= config.groupWhitelist.length && num <= 1000) {
            const index = num - 1;
            groupId = config.groupWhitelist[index];
            removeIndex = index;
          } else {
            removeIndex = config.groupWhitelist.indexOf(input);
            if (removeIndex === -1) {
              notFoundGroups.push(input);
              continue;
            }
            groupId = input;
          }
        } else {
          try {
            groupId = await parseGroupIdFromLink(api, input);
            removeIndex = config.groupWhitelist.indexOf(groupId);
          } catch (error) {
            removeIndex = config.groupWhitelist.indexOf(input);
            if (removeIndex === -1) {
              errorGroups.push({ input, error: error.message });
              continue;
            }
            groupId = input;
          }
        }

        if (removeIndex !== -1) {
          config.groupWhitelist.splice(removeIndex, 1);
          const groupInfo = groupsObject[groupId];
          removedGroups.push(groupInfo?.name || groupId);
        } else {
          notFoundGroups.push(input);
        }
      }

      let successMessage = "";
      if (removedGroups.length > 0) {
        successMessage += `🗑️ Đã xóa ${removedGroups.length} nhóm khỏi whitelist:\n`;
        removedGroups.forEach((name, index) => {
          successMessage += `${index + 1}. ${name}\n`;
        });
      }
      if (notFoundGroups.length > 0) {
        successMessage += `\n⚠️ Không tìm thấy trong whitelist:\n`;
        notFoundGroups.forEach((id, index) => {
          successMessage += `${index + 1}. ${id}\n`;
        });
      }
      if (errorGroups.length > 0) {
        successMessage += `\n❌ Lỗi khi xử lý link:\n`;
        errorGroups.forEach((item, index) => {
          successMessage += `${index + 1}. ${item.input}: ${item.error}\n`;
        });
      }

      if (!successMessage) {
        successMessage = "ℹ️ Không có thay đổi nào được thực hiện.";
      }

      writeWebConfig(botId, config);
      await sendMessageComplete(api, message, successMessage, true, TIME_TO_LIVE);
      return true;
    }

    await sendMessageFailed(
      api,
      message,
      "Hành động không hợp lệ. Chỉ chấp nhận: add, remove, show.",
      false,
      TIME_TO_LIVE
    );
    return true;
  }

  const groups = await getDataAllGroup(api);
  const groupsObject = {};
  groups.forEach((group) => {
    groupsObject[group.groupId] = { ...group };
  });

  if (!config.prSelectedGroups) {
    config.prSelectedGroups = {};
  }

  let groupIds = argsCommand.slice(2).filter((id) => id);
  if (groupIds.length === 0 && action !== "all") {
    groupIds = [message.threadId];
  }

  if (action === "add" && groupIds.length > 0 && groupIds[0] === "all") {
    if (!config.groupWhitelist) config.groupWhitelist = [];
    
    let added = 0;
    let updated = 0;
    let skipped = 0;
    
    for (const groupId in groupsObject) {
      if (config.groupWhitelist.includes(groupId)) {
        skipped++;
        continue;
      }
      
      if (!config.prSelectedGroups[groupId]) {
        config.prSelectedGroups[groupId] = {
          name: groupsObject[groupId].name,
          avatar: groupsObject[groupId].avatar || "",
          timestamp: Date.now(),
        };
        added++;
      } else {
        config.prSelectedGroups[groupId].name = groupsObject[groupId].name;
        config.prSelectedGroups[groupId].avatar = groupsObject[groupId].avatar || "";
        updated++;
      }
    }
    writeWebConfig(botId, config);
    
    let caption = `✅ Đã thêm ${added} nhóm vào danh sách gửi quảng cáo`;
    if (updated > 0) {
      caption += ` và cập nhật ${updated} nhóm`;
    }
    if (skipped > 0) {
      caption += `\n⚠️ Đã bỏ qua ${skipped} nhóm trong whitelist`;
    }
    
    await sendMessageComplete(
      api,
      message,
      caption,
      true,
      TIME_TO_LIVE
    );
    return true;
  }

  if (action === "remove" && groupIds.length > 0 && groupIds[0] === "all") {
    const total = Object.keys(config.prSelectedGroups).length;
    config.prSelectedGroups = {};
    writeWebConfig(botId, config);
    await sendMessageComplete(
      api,
      message,
      `🗑️ Đã xóa toàn bộ ${total} nhóm khỏi danh sách quảng cáo.`,
      true,
      TIME_TO_LIVE
    );
    return true;
  }

  if (!config.groupWhitelist) config.groupWhitelist = [];

  const successGroups = [];
  const failedGroups = [];
  const existingGroups = [];
  const notFoundGroups = [];
  const whitelistedGroups = [];

  if (action === "add") {
    const errorGroups = [];
    for (const input of groupIds) {
      let groupId;
      try {
        groupId = await parseGroupIdFromLink(api, input);
      } catch (error) {
        errorGroups.push({ input, error: error.message });
        continue;
      }

      if (!groupsObject[groupId]) {
        try {
          const allGroups = await getDataAllGroup(api);
          allGroups.forEach((group) => {
            groupsObject[group.groupId] = { ...group };
          });
        } catch (error) {
          console.error("Lỗi khi refresh danh sách nhóm:", error);
        }
      }

      if (!groupsObject[groupId]) {
        failedGroups.push(input);
        continue;
      }
      const groupInfo = groupsObject[groupId];
      if (config.groupWhitelist.includes(groupId)) {
        whitelistedGroups.push(groupInfo.name || groupId);
        continue;
      }
      
      if (config.prSelectedGroups[groupId]) {
        existingGroups.push(groupInfo.name);
        continue;
      }

      config.prSelectedGroups[groupId] = {
        name: groupInfo.name,
        avatar: groupInfo.avatar || "",
        timestamp: Date.now(),
      };
      successGroups.push(groupInfo.name);
    }

    if (errorGroups.length > 0) {
      errorGroups.forEach((item) => {
        failedGroups.push(`${item.input} (${item.error})`);
      });
    }
  } else if (action === "remove") {
    const errorGroups = [];
    for (const input of groupIds) {
      let groupId;
      try {
        groupId = await parseGroupIdFromLink(api, input);
      } catch (error) {
        groupId = input;
      }

      if (!config.prSelectedGroups[groupId]) {
        notFoundGroups.push(input);
        continue;
      }

      const groupName = config.prSelectedGroups[groupId].name || groupId;
      delete config.prSelectedGroups[groupId];
      successGroups.push(groupName);
    }
  } else {
    await sendMessageFailed(
      api,
      message,
      "Hành động không hợp lệ. Chỉ chấp nhận add hoặc remove.",
      false,
      TIME_TO_LIVE
    );
    return true;
  }

  let successMessage = "";
  if (action === "add") {
    if (successGroups.length > 0) {
      successMessage += `✅ Đã thêm ${successGroups.length} nhóm:\n`;
      successGroups.forEach((name, index) => {
        successMessage += `${index + 1}. ${name}\n`;
      });
    }
    if (existingGroups.length > 0) {
      successMessage += `\n⚠️ Nhóm đã tồn tại:\n`;
      existingGroups.forEach((name, index) => {
        successMessage += `${index + 1}. ${name}\n`;
      });
    }
    if (whitelistedGroups.length > 0) {
      successMessage += `\n🚫 Không thể thêm (nhóm trong whitelist):\n`;
      whitelistedGroups.forEach((name, index) => {
        successMessage += `${index + 1}. ${name}\n`;
      });
    }
    if (failedGroups.length > 0) {
      successMessage += `\n❌ Không thể thêm (không tồn tại):\n`;
      failedGroups.forEach((id, index) => {
        successMessage += `${index + 1}. ${id}\n`;
      });
    }
  } else {
    if (successGroups.length > 0) {
      successMessage += `🗑️ Đã xóa ${successGroups.length} nhóm:\n`;
      successGroups.forEach((name, index) => {
        successMessage += `${index + 1}. ${name}\n`;
      });
    }
    if (notFoundGroups.length > 0) {
      successMessage += `\n⚠️ Không tìm thấy trong danh sách:\n`;
      notFoundGroups.forEach((id, index) => {
        successMessage += `${index + 1}. ${id}\n`;
      });
    }
  }

  if (!successMessage) {
    successMessage = `ℹ️ Không có thay đổi nào được thực hiện.`;
  }

  writeWebConfig(botId, config);
  await sendMessageComplete(api, message, successMessage, true, TIME_TO_LIVE);
  return true;
}
}
