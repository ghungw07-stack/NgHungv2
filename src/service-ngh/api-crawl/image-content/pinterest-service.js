import { MessageMention, MessageType } from "zlbotngh";
import axios from "axios";
import fs from "fs";
import path from "path";
import { getGlobalPrefix } from "../../service.js";
import { tempDir } from "../../../utils/io-json.js";
import { randomIDTemp, removeMention } from "../../../utils/format-util.js";
import { deleteFile, downloadFile, getLocalImageInfo, uploadTempFile } from "../../../utils/util.js";
import { sendMessageCompleteRequest } from "../../chat-zalo/chat-style/chat-style.js";
import { clearImagePath } from "../../../utils/canvas/index.js";

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
    pinterestLimit: 12,
  },
  messages: {
    noQuery: (name, prefix, command) => `${name} Vui lòng nhập từ khóa tìm kiếm. Ví dụ: ${prefix}${command} con mèo`,
    searchResult: (name, query) => `[${name}] [${query}]`,
    downloadFailed: (name, attempts) => `${name} không thể tải ảnh sau ${attempts} lần thử. Vui lòng thử lại sau.`,
    noResults: (name) => `${name} không tìm thấy ảnh. Vui lòng thử lại sau.`,
    apiError: (name) => `${name} Gãy mẹ API rồi :(((.`,
  },
  TIME_TO_LIVE: 60000 * 60,
};

async function handleOriginalPinterest(query, count) {
  try {
    const encodedQuery = encodeURIComponent(query);
    const searchUrl = `https://www.pinterest.com/resource/BaseSearchResource/get/`;

    const data = {
      options: {
        applied_unified_filters: null,
        appliedProductFilters: "---",
        article: null,
        auto_correction_disabled: false,
        corpus: null,
        customized_rerank_type: null,
        domains: null,
        dynamicPageSizeExpGroup: null,
        filters: null,
        journey_depth: null,
        page_size: count ? count + 2 : CONFIG.api.pinterestLimit,
        price_max: null,
        price_min: null,
        query_pin_sigs: null,
        query: query,
        redux_normalize_feed: true,
        request_params: null,
        rs: "typed",
        scope: "pins",
        selected_one_bar_modules: null,
        seoDrawerEnabled: false,
        source_id: null,
        source_module_id: null,
        source_url: `/search/pins/?q=${encodedQuery}&rs=typed`,
        top_pin_id: null,
        top_pin_ids: null,
      },
      context: {},
    };

    const headers = {
      Accept: "application/json, text/javascript, */*, q=0.01",
      Referer: `https://www.pinterest.com/`,
      "x-app-version": "9237374",
      "x-pinterest-appstate": "active",
      "x-pinterest-source-url": `/search/pins/?q=${encodedQuery}&rs=typed`,
      "x-requested-with": "XMLHttpRequest",
      "x-pinterest-pws-handler": "www/search/[scope].js",
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/133.0.0.0 Safari/537.36",
    };

    const response = await axios({
      method: "get",
      url: searchUrl,
      headers: headers,
      params: {
        source_url: `/search/pins/?q=${encodedQuery}&rs=typed`,
        data: JSON.stringify(data),
        _: Date.now(),
      },
      timeout: CONFIG.download.timeout * 2,
    });

    if (response.data && response.data.resource_response && response.data.resource_response.data) {
      const results = response.data.resource_response.data.results;

      const imageUrls = results
        .filter((pin) => {
          return (
            pin &&
            pin.images &&
            (pin.images.orig || pin.images["736x"] || pin.images["474x"] || pin.images["1200x"] || pin.images["600x"])
          );
        })
        .map((pin) => {
          return (
            pin.images.orig?.url ||
            pin.images["1200x"]?.url ||
            pin.images["736x"]?.url ||
            pin.images["600x"]?.url ||
            pin.images["474x"]?.url
          );
        })
        .filter((url) => url);

      return imageUrls;
    } else if (response.data) {
      console.log("Cấu trúc response không như mong đợi:", JSON.stringify(response.data).substring(0, 200) + "...");
    }

    return [];
  } catch (error) {
    console.error("Lỗi Pinterest gốc:", error.message);
    if (error.response) {
      console.error("Status:", error.response.status);
      console.error("Headers:", JSON.stringify(error.response.headers));
    }
    return [];
  }
}

async function downloadAndSendImage(api, message, imageUrls, query) {
  const { threadId, type } = message;
  const senderId = message.data.uidFrom;
  const senderName = message.data.dName;

  let attempts = 0;
  let success = false;

  while (attempts < CONFIG.download.maxAttempts && !success) {
    const randomIndex = Math.floor(Math.random() * imageUrls.length);
    const imageUrl = imageUrls[randomIndex];
    const tempFileName = `search_${randomIDTemp()}.jpg`;
    const imagePath = path.join(CONFIG.paths.saveDir, tempFileName);

    try {
      await downloadFile(imageUrl, imagePath);

      const stats = fs.statSync(imagePath);
      if (stats.size < CONFIG.download.minSize) {
        throw new Error("Ảnh tải về quá nhỏ");
      }

      await api.sendMessage(
        {
          msg: CONFIG.messages.searchResult(senderName, query),
          mentions: [MessageMention(senderId, senderName.length, 1)],
          attachments: [imagePath],
        },
        threadId,
        type
      );

      success = true;
    } catch (error) {
      console.error(`Lần thử ${attempts + 1} thất bại:`, error);
      attempts++;

      if (attempts === CONFIG.download.maxAttempts) {
        await api.sendMessage(
          {
            msg: CONFIG.messages.downloadFailed(senderName, CONFIG.download.maxAttempts),
            quote: message,
            mentions: [MessageMention(senderId, senderName.length, 0)],
            ttl: 300000,
          },
          threadId,
          type
        );
      }
    } finally {
      await deleteFile(imagePath);
    }
  }
  return success;
}

export async function searchImagePinterest(api, message, command, isAdminLevelHighest) {
  const content = removeMention(message);
  const senderId = message.data.uidFrom;
  const senderName = message.data.dName;
  const threadId = message.threadId;
  const prefix = getGlobalPrefix(api.getBotId());

  let [query, count = CONFIG.api.pinterestLimit] = content.replace(`${prefix}${command}`, "").trim().split("&&");
  count = parseInt(count) || CONFIG.api.pinterestLimit;
  if (!isAdminLevelHighest) {
    if (count > 20) count = 20;
  } else {
    if (count > 50) count = 50;
  }

  if (!query) {
    await api.sendMessage(
      {
        msg: CONFIG.messages.noQuery(senderName, prefix, command),
        quote: message,
        mentions: [MessageMention(senderId, senderName.length, 0)],
      },
      threadId,
      message.type
    );
    return;
  }

  let imageUrls = [];
  let imagePaths = [];
  try {
    let finalImageUrls = await handleOriginalPinterest(query, count);

    if (finalImageUrls.length === 0) {
      await api.sendMessage(
        {
          msg: CONFIG.messages.noResults(senderName),
          quote: message,
          mentions: [MessageMention(senderId, senderName.length, 0)],
          ttl: 30000,
        },
        threadId,
        message.type
      );
      return;
    }

    finalImageUrls = finalImageUrls.slice(0, count);

    const imageProcessingPromises = finalImageUrls.map(async (imageUrl) => {
      try {
        const tempImagePath = path.join(tempDir, `temp_image_${Date.now() + Math.random() * 10000}.jpg`);
        await downloadFile(imageUrl, tempImagePath);
        const tempFile = await uploadTempFile(tempImagePath, 2, { api, message });
        imagePaths.push(tempImagePath);
        const dataImage = await getLocalImageInfo(tempImagePath);
        if (dataImage.totalSize > CONFIG.download.minSize) {
          return {
            url: tempFile, //tempFile[0].normalUrl
            width: dataImage.width,
            height: dataImage.height,
          };
        }
        return null;
      } catch (error) {
        console.error("Lỗi khi xử lý ảnh:", error);
        return null;
      }
    });

    const processedImages = await Promise.all(imageProcessingPromises);
    imageUrls = processedImages.filter((img) => img !== null);

    if (imageUrls.length !== 0) {
      const object = {
        caption: `Đây là kết quả tìm kiếm ảnh với từ khóa: [${query}]`,
      };
      await sendMessageCompleteRequest(api, message, object, CONFIG.TIME_TO_LIVE);
      let groupLayout = {
        groupLayoutId: Date.now(),
        totalItemInGroup: imageUrls.length,
        isGroupLayout: imageUrls.length > 1 ? 1 : 0,
      };
      for (const [index, image] of imageUrls.entries()) {
        await api.sendImage(image, message, "", CONFIG.TIME_TO_LIVE, {
          ...groupLayout,
          idInGroup: index + 1,
        });
      }
    } else {
      await api.sendMessage(
        {
          msg: CONFIG.messages.noResults(senderName),
          quote: message,
          mentions: [MessageMention(senderId, senderName.length, 0)],
          ttl: 30000,
        },
        threadId,
        message.type
      );
    }
  } catch (error) {
    console.error("Lỗi khi tìm kiếm ảnh:", error);
    await api.sendMessage(
      {
        msg: CONFIG.messages.apiError(senderName),
        quote: message,
        mentions: [MessageMention(senderId, senderName.length, 0)],
      },
      threadId,
      message.type
    );
  } finally {
    for (const path of imagePaths) {
      await clearImagePath(path);
    }
  }
}