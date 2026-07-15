import path from "path";
import fs from "fs";
import { mkdir } from "fs/promises";
import { getGlobalPrefix } from "../service.js";
import { removeMention } from "../../utils/format-util.js";
import { downloadFile, checkExstentionFileRemote } from "../../utils/util.js";
import { sendMessageWarningRequest, sendMessageCompleteRequest } from "../chat-zalo/chat-style/chat-style.js";
import { mkdirRecursive, RESOURCE_PATH } from "../../utils/io-json.js";
import getFolderSize from "get-folder-size";

/**
 * Kiểm tra tính hợp lệ của tên thư mục
 */
function isValidDirectory(botId, dirName) {
  const fullPath = path.join(RESOURCE_PATH(botId), dirName);
  return fs.existsSync(fullPath) && fs.statSync(fullPath).isDirectory();
}

/**
 * Xử lý lệnh tải resource
 */
export async function handleDownloadResource(api, message, aliasCommand) {
  const botId = api.getBotId();
  const prefix = getGlobalPrefix(botId);
  const resourcePath = RESOURCE_PATH(botId);
  const content = removeMention(message);
  const args = content.replace(`${prefix}${aliasCommand}`, "").trim().split("|");

  if (args.length < 2) {
    const object = {
      caption: `Vui lòng nhập đúng cú pháp: ${prefix}${aliasCommand} [thư mục]|[tên file]|[link (nếu không reply)]`,
    };
    await sendMessageWarningRequest(api, message, object, 30000);
    return;
  }

  const [dirName, fileName, link] = args;

  if (!isValidDirectory(botId, dirName)) {
    const object = {
      caption: `Thư mục "${dirName}" không tồn tại trong resource!`,
    };
    await sendMessageWarningRequest(api, message, object, 30000);
    return;
  }

  let fileUrl = null;
  const quote = message.data?.quote;

  if (quote) {
    try {
      const parseMessage = JSON.parse(quote.attach);
      fileUrl = parseMessage?.href;
    } catch (error) {
      console.error("Lỗi khi parse quote:", error);
    }
  } else if (link) {
    fileUrl = link;
  }

  if (!fileUrl) {
    const object = {
      caption: `Vui lòng cung cấp link hoặc reply tin nhắn chứa file cần tải!`,
    };
    await sendMessageWarningRequest(api, message, object, 30000);
    return;
  }

  try {
    const ext = await checkExstentionFileRemote(fileUrl);
    const fullFileName = fileName.includes(".") ? fileName : `${fileName}.${ext}`;
    const savePath = path.join(resourcePath, dirName, fullFileName);

    if (fs.existsSync(savePath)) {
      const object = {
        caption: `❌ File "${fullFileName}" đã tồn tại trong thư mục "${dirName}"!\nVui lòng chọn tên file khác.`,
      };
      await sendMessageWarningRequest(api, message, object, 30000);
      return;
    }

    let totalResourceSize = 0;

    try {
      totalResourceSize = await getFolderSize.loose(resourcePath);
    } catch (error) {
    }

    const fileSize = await getRemoteFileSize(fileUrl);
    if (totalResourceSize + fileSize >= 2 * 1024 * 1024 * 1024) {
      const object = {
        caption: `❌ Bạn đã sử dụng hết 2GB bộ nhớ được cấp trên hệ thống bot và không thể tải thêm, vui lòng xóa bớt dữ liệu và thử lại!`,
      };
      await sendMessageWarningRequest(api, message, object, 30000);
      return;
    }

    mkdirRecursive(path.join(resourcePath, dirName));
    await downloadFile(fileUrl, savePath);

    const object = {
      caption: `✅ Đã tải và lưu file thành công!\n📂 Thư mục: ${dirName}\n📄 Tên file: ${fullFileName}`,
    };
    await sendMessageCompleteRequest(api, message, object, 30000);
  } catch (error) {
    console.error("Lỗi khi tải file:", error);
    const object = {
      caption: `❌ Đã xảy ra lỗi khi tải file. Vui lòng thử lại sau!`,
    };
    await sendMessageWarningRequest(api, message, object, 30000);
  }
}

/**
 * Helper function to get the size of a remote file
 */
async function getRemoteFileSize(url) {
  const response = await fetch(url, { method: "HEAD" });
  if (!response.ok) {
    throw new Error(`Failed to fetch file size for URL: ${url}`);
  }
  const contentLength = response.headers.get("content-length");
  return contentLength ? parseInt(contentLength, 10) : 0;
}

/**
 * Xử lý lệnh xóa resource
 */
export async function handleDeleteResource(api, message, aliasCommand) {
  const botId = api.getBotId();
  const prefix = getGlobalPrefix(botId);
  const resourcePath = RESOURCE_PATH(botId);
  const content = removeMention(message);
  const args = content.replace(`${prefix}${aliasCommand}`, "").trim().split("|");

  if (args.length < 2) {
    const object = {
      caption: `Vui lòng nhập đúng cú pháp: ${prefix}${aliasCommand} [thư mục]|[tên file]`,
    };
    await sendMessageWarningRequest(api, message, object, 30000);
    return;
  }

  const [dirName, fileName] = args;
  const dirPath = path.join(resourcePath, dirName);

  if (!isValidDirectory(botId, dirName)) {
    // const object = {
    //   caption: `Thư mục "${dirName}" không tồn tại trong resource!`,
    // };
    // await sendMessageWarningRequest(api, message, object, 30000);
    await mkdir(dirPath, { recursive: true });
    return;
  }

  const files = fs.readdirSync(dirPath);
  const matchingFilesExact = files.filter((file) => file === fileName);

  if (matchingFilesExact.length === 0) {
    const matchingFilesFind = files.filter((file) => file.toLowerCase().startsWith(fileName.toLowerCase()));
    const matchText = matchingFilesFind.length > 0 ? "\nCác File gần giống:\n" + matchingFilesFind.join("\n") : "";
    const object = {
      caption: `Không tìm thấy file "${fileName}" trong thư mục "${dirName}"!` + matchText,
    };
    await sendMessageWarningRequest(api, message, object, 30000);
    return;
  }

  try {
    for (const file of matchingFilesExact) {
      const filePath = path.join(dirPath, file);
      fs.unlinkSync(filePath);
    }

    const object = {
      caption: `✅ Đã xóa ${
        matchingFilesExact.length
      } file thành công!\n📂 Thư mục: ${dirName}\n📄 Các file đã xóa:\n${matchingFilesExact.join("\n")}`,
    };
    await sendMessageCompleteRequest(api, message, object, 30000);
  } catch (error) {
    console.error("Lỗi khi xóa file:", error);
    const object = {
      caption: `❌ Đã xảy ra lỗi khi xóa file. Vui lòng thử lại sau!`,
    };
    await sendMessageWarningRequest(api, message, object, 30000);
  }
}

export async function handleShowResource(api, message, aliasCommand) {
  const botId = api.getBotId();
  const prefix = getGlobalPrefix(botId);
  const resourcePath = RESOURCE_PATH(botId);
  const content = removeMention(message);
  const keyword = content.replace(`${prefix}${aliasCommand}`, "").trim();
  const args = keyword.split(" ");

  if (!keyword) {
    if (!isValidDirectory(botId, "")) {
      const object = {
        caption: `Thư mục resources không tồn tại!`,
      };
      await sendMessageWarningRequest(api, message, object, 30000);
      return;
    }
    const files = fs.readdirSync(resourcePath);
    const object = {
      caption:
        `Lệnh dùng để kiểm tra file trong thư mục resource.` +
        `\nCú pháp: ${prefix}${aliasCommand} [tên thư mục]` +
        `\nVí dụ: ${prefix}${aliasCommand} file` +
        `\n\nCác thư mục hiện có trong resource:` +
        `\n${files.join("\n")}`,
    };
    await sendMessageCompleteRequest(api, message, object, 30000);
    return;
  }

  const dirName = args[0];
  const dirPath = path.join(resourcePath, dirName);

  if (!isValidDirectory(botId, dirName)) {
    const object = {
      caption: `Thư mục "${dirName}" không tồn tại trong resource!`,
    };
    await sendMessageWarningRequest(api, message, object, 30000);
    return;
  }

  const files = fs.readdirSync(dirPath);
  let caption = "";
  if (files.length === 0) {
    caption = `Thư mục "${dirName}" chưa có file nào!`;
  } else {
    const fileList = files.map((file) => `${file}`).join(", ");
    caption = `Thư mục "${dirName}" có các file sau:\n[ ${fileList} ]`;
  }
  const object = {
    caption: caption,
  };
  await sendMessageCompleteRequest(api, message, object, 600000);
}
