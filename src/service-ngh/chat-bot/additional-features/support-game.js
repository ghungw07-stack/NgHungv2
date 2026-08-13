import { API, Message } from "../../../api-zalo/index.js";
import { removeMention } from "../../../utils/format-util.js";
import { readSupportGameConfig, writeSupportGameConfig } from "../../../utils/io-json.js";
import { handleCheckLinkFromFilesLocal } from "../../../utils/local-upload-cache.js";
import {
  sendMessageComplete,
  sendMessageStateQuote,
  sendMessageWarning,
} from "../../chat-zalo/chat-style/chat-style.js";
import { getGlobalPrefix } from "../../service.js";

const CODE_STRING = "code";
const WEB_STRING = "web";
const APK_STRING = "apk";
const IOS_STRING = "ios";
const PC_STRING = "pc";
const JAVA_STRING = "java";
const ALIAS_STRING = "alias";

const TIME_SHOW_CHAT = 1800000;

/**
 *
 * @param {API} api
 * @param {Message} message
 * @param {String} aliasCommand
 */
export async function handleSupportGameCommand(api, message, aliasCommand, isAdminCommand) {
  const botId = api.getBotId();
  let changeSettingConfig = false;
  const threadId = message.threadId;
  const dataConfigSupport = readSupportGameConfig(botId);
  if (!dataConfigSupport[threadId]) dataConfigSupport[threadId] = {};
  const dataConfigSupportGameInThread = dataConfigSupport[threadId];
  const prefix = getGlobalPrefix(botId);
  const keyword = removeMention(message).replace(prefix, "").replace(aliasCommand, "").trim();
  const args = keyword.split(" ");
  const action = args[0];
  const subCommand = args[1];
  let originAction = action;
  if (dataConfigSupportGameInThread[ALIAS_STRING]) {
    for (const [key, values] of Object.entries(dataConfigSupportGameInThread[ALIAS_STRING])) {
      if (values.includes(action)) {
        originAction = key;
        break;
      }
    }
  }

  if (!action) {
    const actionGuide =
      `🎮 Xin chào! Đây là lệnh hỗ trợ game của nhóm:\n\n` +
      `🔹 ${prefix}${aliasCommand} code\n   → Xem danh sách code game\n` +
      `🔹 ${prefix}${aliasCommand} apk | ios | tf | pc | java\n   → Nhận file tải game cho từng nền tảng\n` +
      `🔹 ${prefix}${aliasCommand} web\n   → Nhận link web chính thức\n` +
      `🔹 ${prefix}${aliasCommand} alias\n   → (Quản trị viên) Thiết lập biệt danh cho các lệnh trên\n\n` +
      `✨ Hãy chọn lệnh phù hợp để nhận hỗ trợ nhé!`;
    await sendMessageWarning(api, message, actionGuide, false, TIME_SHOW_CHAT);
    return;
  }

  const listSubCommand = ["add", "remove", "edit"];
  if (!isAdminCommand && listSubCommand.includes(subCommand)) {
    const captionWarning = `Bạn chỉ có thể nhận thông tin chứ không thể sửa đổi, thêm, xóa!`;
    await sendMessageWarning(api, message, captionWarning, false, TIME_SHOW_CHAT);
  }

  switch (originAction) {
    case "apk":
    case "ios":
    case "pc":
    case "java":
      if (!dataConfigSupportGameInThread[originAction]) dataConfigSupportGameInThread[originAction] = [];
      const fileList = dataConfigSupportGameInThread[originAction];
      if (subCommand === "add") {
        const fileNameToAdd = args.slice(2).join(" ").trim();
        if (!fileNameToAdd) {
          const captionWarning = `Vui lòng nhập tên file cần thêm.`;
          await sendMessageWarning(api, message, captionWarning, false, TIME_SHOW_CHAT);
        } else if (fileList.includes(fileNameToAdd)) {
          const captionWarning = `File này đã tồn tại trong danh sách!`;
          await sendMessageWarning(api, message, captionWarning, false, TIME_SHOW_CHAT);
        } else {
          const checkFileLocal = await handleCheckLinkFromFilesLocal(fileNameToAdd, api);
          if (!checkFileLocal) {
            const captionWarning = `Tên file này chưa có trong thư mục files của bot, vui lòng tải file bằng lệnh downloadresource và thử lại!`;
            await sendMessageWarning(api, message, captionWarning, false, TIME_SHOW_CHAT);
            return;
          }
          fileList.push(fileNameToAdd);
          changeSettingConfig = true;
          const captionComplete = `Đã thêm file mới thành công!`;
          await sendMessageComplete(api, message, captionComplete, false, TIME_SHOW_CHAT);
        }
      } else if (subCommand === "remove") {
        const fileNameToRemove = args.slice(2).join(" ").trim();
        if (!fileNameToRemove) {
          const captionWarning = `Vui lòng nhập tên file cần xóa.`;
          await sendMessageWarning(api, message, captionWarning, false, TIME_SHOW_CHAT);
        } else {
          const index = fileList.indexOf(fileNameToRemove);
          if (index === -1) {
            const captionWarning = `Không tìm thấy file trong danh sách!`;
            await sendMessageWarning(api, message, captionWarning, false, TIME_SHOW_CHAT);
          } else {
            fileList.splice(index, 1);
            changeSettingConfig = true;
            const captionComplete = `Đã xóa file thành công!`;
            await sendMessageComplete(api, message, captionComplete, false, TIME_SHOW_CHAT);
          }
        }
      } else if (subCommand === "list") {
        if (fileList && fileList.length > 0) {
          const captionList =
            `📄 Danh sách file cho ${originAction}:\n` + fileList.map((f, i) => `🔹 ${i + 1}. ${f}`).join("\n");
          await sendMessageComplete(api, message, captionList, false, TIME_SHOW_CHAT);
        } else {
          const captionWarning = `Chưa có file nào được thiết lập cho ${originAction}!`;
          await sendMessageWarning(api, message, captionWarning, false, TIME_SHOW_CHAT);
        }
      } else if (listSubCommand.includes(subCommand)) {
        const captionWarning = `Đối với file chỉ có thể thêm hoặc xóa!`;
        await sendMessageWarning(api, message, captionWarning, false, TIME_SHOW_CHAT);
      } else {
        if (fileList && fileList.length > 0) {
          let note = `Đây là những file liên quan tới ${originAction} mà bạn cần!`;
          await sendMessageStateQuote(api, message, note, true, TIME_SHOW_CHAT, false);
          for (const nameFile of fileList) {
            if (typeof nameFile === "string" && nameFile.startsWith("http")) {
              await api.sendMessageForward({ link: nameFile }, message.threadId, message.type, TIME_SHOW_CHAT);
              break;
            } else {
              const checkFileLocal = await handleCheckLinkFromFilesLocal(nameFile, api);
              if (checkFileLocal) {
                await api.sendFile(
                  message,
                  checkFileLocal.fileUrl,
                  TIME_SHOW_CHAT,
                  checkFileLocal.fileName,
                  checkFileLocal.totalSize,
                  checkFileLocal.type,
                  checkFileLocal.checksum
                );
              }
            }
          }
        } else {
          const captionWarning = `Quản trị chưa thiết lập file tải dành cho ${originAction}!`;
          await sendMessageWarning(api, message, captionWarning, false, TIME_SHOW_CHAT);
        }
      }
      break;
    case CODE_STRING:
      if (!dataConfigSupportGameInThread[CODE_STRING]) dataConfigSupportGameInThread[CODE_STRING] = [];
      const listCode = dataConfigSupportGameInThread[CODE_STRING];
      if (subCommand === "add") {
        if (!isAdminCommand) {
          const captionWarning = `Bạn không có quyền thêm code!`;
          await sendMessageWarning(api, message, captionWarning, false, TIME_SHOW_CHAT);
        } else {
          const codeToAdd = args.slice(2).join(" ").trim();
          if (!codeToAdd) {
            const captionWarning = `Vui lòng nhập code cần thêm.`;
            await sendMessageWarning(api, message, captionWarning, false, TIME_SHOW_CHAT);
          } else if (listCode.includes(codeToAdd)) {
            const captionWarning = `Code này đã tồn tại trong danh sách!`;
            await sendMessageWarning(api, message, captionWarning, false, TIME_SHOW_CHAT);
          } else {
            listCode.push(codeToAdd);
            changeSettingConfig = true;
            const captionComplete = `Đã thêm code mới thành công!`;
            await sendMessageComplete(api, message, captionComplete, false, TIME_SHOW_CHAT);
          }
        }
      } else if (subCommand === "remove") {
        if (!isAdminCommand) {
          const captionWarning = `Bạn không có quyền xóa code!`;
          await sendMessageWarning(api, message, captionWarning, false, TIME_SHOW_CHAT);
        } else {
          const codeToRemove = args.slice(2).join(" ").trim();
          if (!codeToRemove) {
            const captionWarning = `Vui lòng nhập code cần xóa.`;
            await sendMessageWarning(api, message, captionWarning, false, TIME_SHOW_CHAT);
          } else {
            const index = listCode.indexOf(codeToRemove);
            if (index === -1) {
              const captionWarning = `Không tìm thấy code trong danh sách!`;
              await sendMessageWarning(api, message, captionWarning, false, TIME_SHOW_CHAT);
            } else {
              listCode.splice(index, 1);
              changeSettingConfig = true;
              const captionComplete = `Đã xóa code thành công!`;
              await sendMessageComplete(api, message, captionComplete, false, TIME_SHOW_CHAT);
            }
          }
        }
      } else {
        if (listCode.length > 0) {
          const captionCode = `✨ Danh sách các code đang hoạt động:\n\n${listCode
            .map((code, idx) => `🔹 ${idx + 1}. ${code}`)
            .join("\n")}\n\n🎉 Hãy vào game nhập code để được nhận những ưu đãi hấp dẫn nhé...!`;
          await sendMessageComplete(api, message, captionCode, false, TIME_SHOW_CHAT);
        } else {
          const captionCode =
            `⚠️ Hiện tại admin chưa cung cấp code nào trong danh sách code trong nhóm này!` +
            `\nVui lòng thử lại sau nhé.`;
          await sendMessageComplete(api, message, captionCode, false, TIME_SHOW_CHAT);
        }
      }
      break;
    case WEB_STRING:
      const webInfo = dataConfigSupportGameInThread[WEB_STRING];
      if (subCommand === "edit") {
        const newInfo = args.slice(2).join(" ").trim();
        if (webInfo !== newInfo) {
          dataConfigSupportGameInThread[WEB_STRING] = newInfo;
          changeSettingConfig = true;
          const captionComplete = `Sửa đổi thông tin web hoàn tất!`;
          await sendMessageComplete(api, message, captionComplete, false, TIME_SHOW_CHAT);
        } else {
          const captionWarning = `Thông tin web bạn yêu cầu đổi không có gì khác so với hiện tại...!`;
          await sendMessageWarning(api, message, captionWarning, false, TIME_SHOW_CHAT);
        }
        changeSettingConfig = true;
      } else if (subCommand === "list") {
        if (webInfo) {
          const [link, caption = "Đây là web game chính thức mà bạn cần!"] = webInfo.split(">");
          const msg = `🌐 Web hiện tại: ${link}\n${caption}`;
          await sendMessageComplete(api, message, msg, false, TIME_SHOW_CHAT);
        } else {
          const captionWarning = `Chưa có thông tin web nào được thiết lập!`;
          await sendMessageWarning(api, message, captionWarning, false, TIME_SHOW_CHAT);
        }
      } else if (listSubCommand.includes(subCommand)) {
        const captionWarning = `Thông tin web chỉ có thể sửa đổi, không thể dùng thao tác thêm/xóa!`;
        await sendMessageWarning(api, message, captionWarning, false, TIME_SHOW_CHAT);
      } else {
        if (webInfo) {
          const [link, caption = "Đây là web game chính thức mà bạn cần!"] = webInfo.split(">");
          await sendMessageStateQuote(api, message, caption, true, TIME_SHOW_CHAT, false);
          await api.sendMessageForward({ link: link }, message.threadId, message.type, TIME_SHOW_CHAT);
        } else {
          const captionCode =
            `⚠️ Hiện tại admin chưa cung cấp web game chính thức cho nhóm này.` + `\nVui lòng thử lại sau nhé.`;
          await sendMessageComplete(api, message, captionCode, false, TIME_SHOW_CHAT);
        }
      }
      break;
    case ALIAS_STRING:
      if (!isAdminCommand) {
        const captionWarning = `Bạn không có quyền chỉnh sửa alias!`;
        await sendMessageWarning(api, message, captionWarning, false, TIME_SHOW_CHAT);
      } else {
        if (subCommand === "add") {
          const key = args[2];
          const value = args[3];
          if (!key || !value) {
            const captionWarning = `Vui lòng nhập đủ key và value để thêm alias.`;
            await sendMessageWarning(api, message, captionWarning, false, TIME_SHOW_CHAT);
          } else {
            if (!dataConfigSupportGameInThread[ALIAS_STRING][key]) {
              dataConfigSupportGameInThread[ALIAS_STRING][key] = [];
            }
            if (dataConfigSupportGameInThread[ALIAS_STRING][key].includes(value)) {
              const captionWarning = `Alias này đã tồn tại cho key ${key}!`;
              await sendMessageWarning(api, message, captionWarning, false, TIME_SHOW_CHAT);
            } else {
              dataConfigSupportGameInThread[ALIAS_STRING][key].push(value);
              changeSettingConfig = true;
              const captionComplete = `Đã thêm alias "${value}" cho key "${key}" thành công!`;
              await sendMessageComplete(api, message, captionComplete, false, TIME_SHOW_CHAT);
            }
          }
        } else if (subCommand === "remove") {
          const key = args[2];
          const value = args[3];
          if (!key || !value) {
            const captionWarning = `Vui lòng nhập đủ key và value để xóa alias.`;
            await sendMessageWarning(api, message, captionWarning, false, TIME_SHOW_CHAT);
          } else if (!dataConfigSupportGameInThread[ALIAS_STRING][key]) {
            const captionWarning = `Không tìm thấy key alias "${key}"!`;
            await sendMessageWarning(api, message, captionWarning, false, TIME_SHOW_CHAT);
          } else {
            const idx = dataConfigSupportGameInThread[ALIAS_STRING][key].indexOf(value);
            if (idx === -1) {
              const captionWarning = `Không tìm thấy alias "${value}" trong key "${key}"!`;
              await sendMessageWarning(api, message, captionWarning, false, TIME_SHOW_CHAT);
            } else {
              dataConfigSupportGameInThread[ALIAS_STRING][key].splice(idx, 1);
              changeSettingConfig = true;
              const captionComplete = `Đã xóa alias "${value}" khỏi key "${key}" thành công!`;
              await sendMessageComplete(api, message, captionComplete, false, TIME_SHOW_CHAT);
            }
          }
        } else {
          let aliasListMsg = "Danh sách alias hiện tại:\n";
          const data = dataConfigSupportGameInThread[ALIAS_STRING] || {};
          for (const [key, values] of Object.entries(data)) {
            aliasListMsg += `🔹 ${key}: ${values.join(", ")}\n`;
          }
          await sendMessageComplete(api, message, aliasListMsg, false, TIME_SHOW_CHAT);
        }
      }
      break;
  }

  if (changeSettingConfig) {
    writeSupportGameConfig(botId, dataConfigSupport);
  }
}
