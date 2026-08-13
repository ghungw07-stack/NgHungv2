import fs from "fs";
import path from "path";
import axios from "axios";
import { MessageMention } from "zlbotngh";
import { IMAGES_RESOURCE_PATH, tempDir } from "../../../../utils/io-json.js";
import { randomIDTemp, removeMention } from "../../../../utils/format-util.js";
import { handleCheckLinkFromImageLocal } from "../../../../utils/local-upload-cache.js";
import { checkLinkIsValid, deleteFile, readFileSync, writeFileSync } from "../../../../utils/util.js";
import {
  sendMessageCompleteRequest,
  sendMessageStateQuote,
  sendMessageWarning,
  sendMessageWarningRequest,
} from "../../chat-style/chat-style.js";
import { getGlobalPrefix } from "../../../service.js";
import { removeBackground } from "../../../utilities/remove-background.js";
import { isAdmin } from "../../../../index.js";

// Cấu hình
const CONFIG = {
  saveDir: tempDir,
  baseDataPath: path.resolve(process.cwd(), "src", "service-ngh", "chat-zalo", "chat-special", "data-send"),
  maxAttempts: 300,
  minImageSize: 10,
  downloadTimeout: 1500,
  timeToLiveSendImage: 86400000,
};

// Cấu hình loại ảnh
const IMAGE_TYPES = {
  girl: {
    variants: {
      default: { source: "girl.txt", ttl: 300000, downloadTimeout: 1500 },
      sexy: { source: "girlsexy.txt", ttl: 180000, type: "Sexy" },
      nguc: { source: "girlnguc.txt", ttl: 180000, type: "Ngực" },
      lon: { source: "girllon.txt", ttl: 30000, show: false, type: "Butterfly" },
      nude: { source: "girlnude.txt", ttl: 30000, type: "Khỏa Thân" },
      cosplay: { source: "cosplay.txt", ttl: 300000, type: "Cosplay" },
      anime: { source: "anime.txt", ttl: 300000, type: "Anime" },
    },
    text: "z_thinh_girl.txt",
  },
  boy: {
    variants: {
      default: { source: "boy.txt", ttl: 300000 },
      "6mui": { source: "boy6mui.txt", ttl: 300000, type: "6 Múi" },
    },
    text: "z_thinh_boy.txt",
  },
  cosplay: {
    variants: {
      default: { source: "cosplay.txt", ttl: 300000 },
    },
    text: "z_thinh_cosplay.txt",
  },
  anime: {
    variants: {
      default: { source: "anime.txt", ttl: 300000 },
    },
    text: "z_thinh_anime.txt",
  },
};

const KEYWORD_MAPPING = {
  girl: {
    sexy: ["sexy", "hot", "gợi cảm"],
    nguc: ["nguc", "ngực", "vú", "vu", "dú", "du", "zu", "zú"],
    lon: ["lonofes"],
    // nude: ["nude", "khỏa thân"],
    cosplay: ["cos", "cosplay", "phim ảnh"],
    anime: ["anime", "wibu", "anm"],
  },
  boy: {
    "6mui": ["6mui", "6 múi", "cơ bụng"],
  },
};

async function downloadImage(url, filePath, timeout) {
  try {
    const client = axios.create();
    const response = await client.get(url, {
      responseType: "stream",
      timeout: timeout,
    });

    return new Promise((resolve, reject) => {
      const writer = fs.createWriteStream(filePath);
      response.data.pipe(writer);

      writer.on("finish", () => {
        const fileSizeInKb = fs.statSync(filePath).size / 1024;
        if (fileSizeInKb < CONFIG.minImageSize) {
          fs.unlinkSync(filePath);
          reject(new Error("Kích thước ảnh quá nhỏ"));
        } else {
          resolve();
        }
      });

      writer.on("error", (err) => {
        if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
        reject(err);
      });
    });
  } catch (error) {
    if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
    throw error.code === "ECONNABORTED" ? new Error("Hết thời gian chờ khi tải ảnh") : error;
  }
}

// Thêm hàm mới để lấy links ảnh
async function getImageLinks(config) {
  const variantConfig = config.variantConfig;

  if (variantConfig.source) {
    // Nếu là source, đọc từ file txt
    const imagePath = path.join(CONFIG.baseDataPath, variantConfig.source);
    return readFileSync(imagePath, "utf-8").split("\n").filter(Boolean);
  } else if (variantConfig.api) {
    // Nếu là api, gọi API để lấy data
    try {
      const response = await axios.get(variantConfig.api);
      if (response.status === 200) {
        return response.data.url.trim();
      }
      throw new Error(`Lỗi khi tải ảnh từ nguồn: mã trạng thái ${response.status}`);
    } catch (error) {
      console.error("Lỗi khi lấy dữ liệu từ API:", error);
      throw error;
    }
  }
  throw new Error("Không tìm thấy nguồn ảnh");
}

function getImageConfig(type, content) {
  const typeConfig = IMAGE_TYPES[type];
  if (!typeConfig) return null;

  let variant = "default";

  const typeKeywords = KEYWORD_MAPPING[type];
  if (typeKeywords) {
    const normalizedContent = content.toLowerCase();
    for (const [variantName, keywords] of Object.entries(typeKeywords)) {
      if (keywords.some((keyword) => normalizedContent.includes(keyword))) {
        variant = variantName;
        break;
      }
    }
  }

  const variantConfig = typeConfig.variants[variant];
  return {
    variantConfig,
    textFile: typeConfig.text,
    ttl: variantConfig.ttl,
    downloadTimeout: variantConfig.downloadTimeout || CONFIG.downloadTimeout,
    variant: variantConfig.type ? variantConfig.type : variant,
  };
}

async function tryDownloadImage(imageLinks, type, downloadTimeout, isApiSource) {
  let attempts = 0;

  if (isApiSource) {
    // Xử lý cho source (từ file txt)
    let currentLinks = [...imageLinks];
    while (attempts < CONFIG.maxAttempts && currentLinks.length > 0) {
      const randomIndex = Math.floor(Math.random() * currentLinks.length);
      const imageUrl = currentLinks[randomIndex];
      const imagePath = path.join(CONFIG.saveDir, `${type}_${Date.now()}.jpg`);

      try {
        await downloadImage(imageUrl, imagePath, downloadTimeout);
        return {
          success: true,
          path: imagePath,
          remainingLinks: currentLinks,
          hadDieLinks: attempts > 0,
        };
      } catch (error) {
        console.error(`Lỗi tải ảnh: ${error.message}`);
        currentLinks.splice(randomIndex, 1);
        attempts++;
      }
    }
    return {
      success: false,
      remainingLinks: currentLinks,
      hadDieLinks: attempts > 0,
    };
  } else {
    // Xử lý cho api source
    while (attempts < CONFIG.maxAttempts) {
      const imagePath = path.join(CONFIG.saveDir, `${type}_${Date.now()}.jpg`);
      try {
        await downloadImage(imageLinks, imagePath, downloadTimeout);
        return {
          success: true,
          path: imagePath,
        };
      } catch (error) {
        console.error(`Lỗi tải ảnh: ${error.message}`);
        attempts++;
      }
    }
    return {
      success: false,
    };
  }
}

// Thêm hàm mới để lấy danh sách đối số
function getArgumentList(type) {
  const typeConfig = IMAGE_TYPES[type];
  const typeKeywords = KEYWORD_MAPPING[type];
  if (!typeConfig || !typeKeywords) return null;

  // Tạo danh sách mô tả chi tiết cho từng biến thể
  const descriptions = Object.entries(typeKeywords)
    .filter(([variant]) => {
      const variantConfig = typeConfig.variants[variant];
      const isShow = variantConfig?.show ?? true;
      return isShow;
    })
    .map(([variant, keywords]) => {
      return `${
        typeConfig.variants[variant].type ? `${typeConfig.variants[variant].type}` : "Default"
      }: ${keywords.join(", ")}`;
    })
    .join("\n");

  return descriptions || null;
}

export async function sendImage(api, message, type) {
  const idBot = api.getBotId();
  const { dName: senderName, uidFrom: senderId } = message.data;
  const isAdminLevelHighest = isAdmin(idBot, senderId);
  const content = removeMention(message);
  const commandParts = content.split(" ");

  if (commandParts.length > 1 && commandParts[1] === "map") {
    const argList = getArgumentList(type);
    if (argList) {
      await api.sendMessage(
        {
          msg: `Các đối số có thể dùng cho lệnh ${type}:\n${argList}`,
          quote: message,
          ttl: 30000,
        },
        message.threadId,
        message.type
      );
    }
    return;
  }

  const config = getImageConfig(type, content);
  if (!config) return;
  const isApiSource = !!config.variantConfig.source;
  if (!isAdminLevelHighest && config.variant === IMAGE_TYPES["girl"].variants.lon.type) {
    await sendMessageWarning(api, message, `Chỉ có quản trị cấp cao mới được yêu cầu coi cái này...!`);
    return;
  }

  let isDieLinks = false;
  let remainingLinks = [];

  try {
    const thinhPath = path.join(CONFIG.baseDataPath, "Text", config.textFile);
    const thinhList = readFileSync(thinhPath, "utf-8").split("\n").filter(Boolean);
    const randomThing = thinhList[Math.floor(Math.random() * thinhList.length)];

    const imageLinks = await getImageLinks(config);
    const downloadTimeout = config.downloadTimeout;

    const downloadResult = await tryDownloadImage(imageLinks, type, downloadTimeout, isApiSource);
    remainingLinks = downloadResult.remainingLinks ? [...downloadResult.remainingLinks] : [...imageLinks];
    isDieLinks = downloadResult.hadDieLinks ? true : false;
    if (downloadResult.success) {
      await api.sendMessage(
        {
          msg: `[ ${senderName} ] ${
            config.variant != "default" ? `( ${config.variant} )` : ""
          }\n${randomThing.replaceAll("\\n", "\n")}`,
          mentions: [MessageMention(senderId, senderName.length, 2, false)],
          attachments: [downloadResult.path],
          ttl: config.ttl,
        },
        message.threadId,
        message.type
      );

      await deleteFile(downloadResult.path);
    } else {
      await api.sendMessage(
        {
          msg: "Xin lỗi, không thể tải ảnh. Vui lòng thử lại sau.",
          quote: message,
          ttl: 30000,
        },
        message.threadId,
        message.type
      );
    }
  } catch (error) {
    console.error(`Lỗi trong quá trình xử lý: ${error.message}`);
    await api.sendMessage(
      {
        msg: "Hình như gãy API..., vui lòng liên hệ quản trị để sửa chữa lỗi này!",
        quote: message,
        ttl: 300000,
      },
      message.threadId,
      message.type
    );
  }

  // Chỉ cập nhật file txt
  if (isApiSource && isDieLinks) {
    const imagePath = path.join(CONFIG.baseDataPath, config.variantConfig.source);
    writeFileSync(imagePath, remainingLinks.join("\n"));
  }
}

/**
 * Xử lý lệnh send image
 */
export async function handleSendImageCommand(api, message, aliasCommand) {
  const botId = api.getBotId();
  const prefix = getGlobalPrefix(botId);
  const dataImagePath = IMAGES_RESOURCE_PATH(botId);
  const content = removeMention(message);
  let keyword = content.replace(`${prefix}${aliasCommand}`, "");
  let text = keyword;

  let isXoaPhong = text.includes(" xp");
  text = text.replace(" xp", " ");

  text = text.trim();
  const senderName = message.data.dName;
  const senderId = message.data.uidFrom;
  const threadId = message.threadId;
  const type = message.type;
  const tempPath = path.join(tempDir, `xpImg_${randomIDTemp()}.png`);
  // let imagePath = path.join(CONFIG.saveDir, `${Date.now()}.jpg`);

  try {
    if (keyword.trim() === "list") {
      const files = fs.readdirSync(dataImagePath);
      if (files.length > 0) {
        const fileList = files.map((file, index) => `${index + 1}. ${file}`).join("\n");
        await sendMessageCompleteRequest(
          api,
          message,
          {
            caption:
              `Đây là những hình ảnh đã lưu trữ:\n${fileList}` +
              `\n\nDùng lệnh: ${prefix}${aliasCommand} <số thứ tự hình ảnh> để gửi hình ảnh`,
          },
          1800000
        );
      } else {
        await sendMessageCompleteRequest(
          api,
          message,
          {
            caption: `Chưa có hình ảnh nào được lưu trên bộ nhớ của bot!`,
          },
          1800000
        );
      }
      return;
    }

    const index = parseInt(keyword.trim());
    if (!isNaN(index)) {
      const files = fs.readdirSync(dataImagePath);
      if (index > 0 && index <= files.length) {
        const selectedFile = files[index - 1];
        const fileLocal = await handleCheckLinkFromImageLocal(selectedFile, api);
        await sendMessageStateQuote(api, message, "Đây là hình ảnh bạn yêu cầu!", true, 300000, false);
        await api.sendImage(fileLocal.fileUrl, message, "", CONFIG.timeToLiveSendImage);
        return;
      } else {
        await sendMessageWarningRequest(
          api,
          message,
          {
            caption: "Số thứ tự không nằm trong phạm vi danh sách hình ảnh đã lưu trữ.",
          },
          300000
        );
        return;
      }
    }

    const quote = message.data?.quote;
    if (quote) {
      if (!text) {
        try {
          const parseMessage = JSON.parse(quote.attach);
          text = parseMessage.href || parseMessage.title || quote.msg || null;
        } catch (error) {
          text = quote.msg || null;
        }
      }
    }

    if (!text) {
      const object = {
        caption:
          `Vui lòng reply vào hình ảnh hoặc nhập link!\n` +
          `Các đối số bổ sung:\n` +
          `xp: Xóa Phông.` +
          `\n\nChat "${prefix}${aliasCommand} list" để xem danh sách hình ảnh đã lưu trữ`,
      };
      await sendMessageWarningRequest(api, message, object, 30000);
      return;
    }

    let linkUpload;
    let type = 0;
    const fileLocal = await handleCheckLinkFromImageLocal(text, api);
    if (fileLocal) {
      linkUpload = fileLocal.fileUrl;
      type = 1;
    } else {
      linkUpload = text;
      type = 0;
    }

    if (await checkLinkIsValid(linkUpload)) {
      if (isXoaPhong) {
        const imageData = await removeBackground(linkUpload);
        if (!imageData) {
          await api.sendMessage(
            {
              msg: `${senderName}, Ựa, xóa phông lỗi hoặc hết lượt mịa ròi.`,
              quote: message,
              mentions: [MessageMention(senderId, senderName.length, 0)],
              ttl: 30000,
            },
            threadId,
            type
          );
          return;
        }
        writeFileSync(tempPath, imageData);
        const dataUpload = await api.uploadAttachment([tempPath], threadId, type);
        linkUpload = dataUpload[0].fileUrl || dataUpload[0].normalUrl;
      }

      await sendMessageStateQuote(api, message, "Đây là hình ảnh bạn yêu cầu!", true, 300000, false);
      await api.sendImage(linkUpload, message, "", CONFIG.timeToLiveSendImage);
    } else {
      const object = {
        caption:
          type === 0
            ? "Link ảnh yêu cầu không thể truy cập"
            : "Lỗi truy cập link ảnh cục bộ từ tập tin lưu trữ, vui lòng thử lại.",
      };
      await sendMessageWarningRequest(api, message, object, 30000);
    }
  } catch (error) {
    console.error("Lỗi khi send ảnh:", error);
    const object = {
      caption: "Đã xảy ra lỗi khi send ảnh từ nguồn cung cấp.",
    };
    await sendMessageWarningRequest(api, message, object, 30000);
  } finally {
    if (tempPath) await deleteFile(tempPath);
    // if (imagePath) await deleteFile(imagePath);
  }
}
