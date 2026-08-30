import { MessageMention, MessageType } from "zlbotngh";
import axios from "axios";
import fs from "fs";
import path from "path";
import { getGlobalPrefix } from "../../service.js";
import { tempDir } from "../../../utils/io-json.js";
import { randomIDTemp, removeMention } from "../../../utils/format-util.js";
import { deleteFile, downloadFile } from "../../../utils/util.js";
import { sendMessageCompleteRequest } from "../../chat-zalo/chat-style/chat-style.js";
import { clearImagePath } from "../../../utils/canvas/index.js";

const searchCache = new Map();
const SEARCH_CACHE_TTL_MS = 5 * 60 * 1000;
const MAX_SEARCH_CACHE = 200;

function cachePinterestResults(cacheKey, results) {
  searchCache.set(cacheKey, { timestamp: Date.now(), results });
  while (searchCache.size > MAX_SEARCH_CACHE) searchCache.delete(searchCache.keys().next().value);
  return results;
}

async function handlePinterestHtmlFallback(query, count, cacheKey) {
  try {
    const html = await axios.get(`https://www.pinterest.com/search/pins/?q=${encodeURIComponent(query)}`, {
      headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/133 Safari/537.36" },
      timeout: 7000,
    });
    const normalized = String(html.data).replaceAll("\\u002F", "/").replaceAll("\\/", "/");
    const urls = [...new Set(normalized.match(/https:\/\/i\.pinimg\.com\/[A-Za-z0-9_./%-]+\.(?:jpg|jpeg|png|webp)/gi) || [])]
      .slice(0, count)
      .map((url) => ({ url, width: 500, height: 500 }));
    return urls.length ? cachePinterestResults(cacheKey, urls) : [];
  } catch (error) {
    console.error("Pinterest fallback lỗi:", error.message);
    return [];
  }
}

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
  const cacheKey = `${query.trim().toLowerCase()}:${count}`;
  const cached = searchCache.get(cacheKey);
  if (cached && Date.now() - cached.timestamp < SEARCH_CACHE_TTL_MS) return cached.results;
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
          const image = pin.images.orig || pin.images["1200x"] || pin.images["736x"] ||
            pin.images["600x"] || pin.images["474x"];
          return image?.url ? { url: image.url, width: image.width || 500, height: image.height || 500 } : null;
        })
        .filter(Boolean);

      if (imageUrls.length) return cachePinterestResults(cacheKey, imageUrls);
    } else if (response.data) {
      console.log("Cấu trúc response không như mong đợi:", JSON.stringify(response.data).substring(0, 200) + "...");
    }

    // Resource endpoint changes/blocking are common. Fall back to the public
    // search HTML and extract pinimg CDN URLs instead of failing the command.
    return handlePinterestHtmlFallback(query, count, cacheKey);
  } catch (error) {
    console.error("Lỗi Pinterest gốc:", error.message);
    if (error.response) {
      console.error("Status:", error.response.status);
      console.error("Headers:", JSON.stringify(error.response.headers));
    }
    return handlePinterestHtmlFallback(query, count, cacheKey);
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
  count = Math.max(1, parseInt(count) || CONFIG.api.pinterestLimit);
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

    // Pinterest CDN URLs can be sent directly. The old flow downloaded every
    // image and uploaded it to another temporary host before sending, adding
    // two network hops per result and making one weak host break the whole job.
    imageUrls = finalImageUrls.filter((img) => img?.url);

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
      let nextIndex = 0;
      let sentCount = 0;
      const workers = Array.from({ length: Math.min(3, imageUrls.length) }, async () => {
        while (nextIndex < imageUrls.length) {
          const index = nextIndex++;
          try {
            await api.sendImage(imageUrls[index], message, "", CONFIG.TIME_TO_LIVE, {
              ...groupLayout,
              idInGroup: index + 1,
            });
            sentCount++;
          } catch (error) {
            console.error(`Pinterest gửi ảnh ${index + 1} lỗi:`, error?.message || error);
          }
        }
      });
      await Promise.all(workers);
      if (sentCount === 0) throw new Error("Không gửi được ảnh Pinterest nào");
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
