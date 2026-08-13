import axios from "axios";
import fs from "fs";
import path from "path";
import { MessageMention } from "zlbotngh";
import { tempDir } from  "../../../utils/io-json.js";
import { deleteFile, downloadFile } from "../../../utils/util.js";
import { removeMention } from "../../../utils/format-util.js";
import { getGlobalPrefix } from "../../service.js";

// Author : Hà Huy Hoàng
// Description: Pexels Image code by H H H

const CONFIG = {
  paths: {
    saveDir: tempDir,
  },
  download: {
    maxAttempts: 3,
    timeout: 5000,
    minSize: 1024,
  },
  api: {
    pexelsBaseUrl: "https://api.pexels.com/v1/search",
    pexelsApiKey: process.env.PEXELS_API_KEY || "26WqqKYxBteywqR1nEQUcm6YwipAWyA49wudto7GCsexbWpDp9iTY6hw", // TODO: key đã lộ trong source -> đổi key mới, set qua PEXELS_API_KEY
  },
  messages: {
    noQuery: (name, prefix, command) =>
      `${name} Vui lòng nhập từ khóa tìm kiếm. Ví dụ: ${prefix}${command} hoa cúc`,
    searchResult: (name, query) => `[${name}] "${query}"`,
    downloadFailed: (name, attempts) =>
      `${name} không thể tải ảnh sau ${attempts} lần thử. Vui lòng thử lại sau.`,
    noResults: (name) => `${name} không tìm thấy ảnh nào phù hợp. Vui lòng thử từ khóa khác.`,
    apiError: (name) => `${name} Lỗi khi kết nối API. Vui lòng thử lại sau.`,
  },
};

async function fetchImagesFromPexels(query, perPage = 20) {
  try {
    const response = await axios.get(CONFIG.api.pexelsBaseUrl, {
      headers: {
        Authorization: CONFIG.api.pexelsApiKey,
      },
      params: {
        query,
        per_page: perPage,
      },
    });

    if (response.data && response.data.photos) {
      return response.data.photos.map((photo) => photo.src.original);
    }

    return [];
  } catch (error) {
    console.error("Lỗi khi gọi API Pexels:", error);
    throw error;
  }
}

async function downloadAndSendImage(api, message, imageUrls, query) {
  const { threadId, type } = message;
  const senderId = message.data.uidFrom;
  const senderName = message.data.dName;

  const maxImages = 30;
  const downloadedImages = [];
  const usedIndexes = new Set();
  let attempts = 0;

  while (downloadedImages.length < maxImages && usedIndexes.size < imageUrls.length && attempts < imageUrls.length * 2) {
    let randomIndex;
    do {
      randomIndex = Math.floor(Math.random() * imageUrls.length);
    } while (usedIndexes.has(randomIndex));

    usedIndexes.add(randomIndex);
    const imageUrl = imageUrls[randomIndex];
    const tempFileName = `pexels_${Date.now()}_${randomIndex}.jpg`;
    const imagePath = path.join(CONFIG.paths.saveDir, tempFileName);

    try {
      await downloadFile(imageUrl, imagePath);

      const stats = fs.statSync(imagePath);
      if (stats.size < CONFIG.download.minSize) {
        throw new Error("Ảnh tải về quá nhỏ");
      }

      downloadedImages.push(imagePath);
    } catch (error) {
      console.error(`Tải ảnh thất bại (attempt ${attempts + 1}):`, error);
    }

    attempts++;
  }

  if (downloadedImages.length === 0) {
    await api.sendMessage(
      {
        msg: CONFIG.messages.downloadFailed(senderName, CONFIG.download.maxAttempts),
        quote: message,
        mentions: [MessageMention(senderId, senderName.length, 0)],
        ttl: 5000000
      },
      threadId,
      type
    );
    return false;
  }

  await api.sendMessage(
    {
      msg: CONFIG.messages.searchResult(senderName, query),
      mentions: [MessageMention(senderId, senderName.length, 1)],
      attachments: downloadedImages,
      ttl: 5000000
    },
    threadId,
    type
  );

  for (const img of downloadedImages) {
    await deleteFile(img);
  }

  return true;
}


export async function searchImagePexels(api, message, command) {
  const content = removeMention(message).trim();
  const senderId = message.data.uidFrom;
  const senderName = message.data.dName;
  const threadId = message.threadId;
  const prefix = getGlobalPrefix();

  const query = content.replace(`${prefix}${command}`, "").trim();
  console.log("[PEXELS QUERY] Truy vấn người dùng:", query);

  if (!query) {
    await api.sendMessage(
      {
        msg: CONFIG.messages.noQuery(senderName, prefix, command),
        quote: message,
        mentions: [MessageMention(senderId, senderName.length, 0)],
        ttl: 6000000
      },
      threadId,
      message.type
    );
    return;
  }

  try {
    const imageUrls = await fetchImagesFromPexels(query);

    if (imageUrls.length === 0) {
      await api.sendMessage(
        {
          msg: CONFIG.messages.noResults(senderName),
          quote: message,
          mentions: [MessageMention(senderId, senderName.length, 0)],
          ttl: 6000000
        },
        threadId,
        message.type
      );
      return;
    }

    await downloadAndSendImage(api, message, imageUrls, query);
  } catch (error) {
    console.error("Lỗi khi tìm kiếm ảnh:", error);
    await api.sendMessage(
      {
        msg: CONFIG.messages.apiError(senderName),
        quote: message,
        mentions: [MessageMention(senderId, senderName.length, 0)],
        ttl: 6000000
      },
      threadId,
      message.type
    );
  }
}
