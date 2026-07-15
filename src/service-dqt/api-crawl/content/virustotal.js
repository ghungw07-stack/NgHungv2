import axios from "axios";
import fs from "fs";
import { removeMention } from "../../../utils/format-util.js";
import { getGlobalPrefix } from "../../service.js";
import { sendMessageCompleteRequest, sendMessageFromSQL } from "../../chat-zalo/chat-style/chat-style.js";
import { getApiKeysMedia } from "../../../utils/api-key-manager.js";
import FormData from "form-data";
import { deleteFile, downloadFile, TIME_HOUR_24 } from "../../../utils/util.js";

class VirusTotalScanner {
  constructor(apiKey) {
    this.apiKey = apiKey;
    this.baseUrl = "https://www.virustotal.com/api/v3";
  }

  async scanUrl(pathFile) {
    const form = new FormData();
    form.append("file", fs.createReadStream(pathFile));

    let response;
    try {
      response = await axios.post(`${this.baseUrl}/files`, form, {
        headers: {
          ...form.getHeaders(),
          "x-apikey": this.apiKey,
        },
        validateStatus: () => true,
      });
    } catch (err) {
      throw new Error("Request failed: " + (err.message || err));
    } finally {
      await deleteFile(pathFile);
    }

    if (response.status === 400) {
      return { error: "Bad request to send Url check VirusTotal API (status 400)" };
    }

    const analysisId = response.data.data.id;
    let responseResult,
      status = "queued";

    while (status === "queued") {
      await new Promise((resolve) => setTimeout(resolve, 5000));
      responseResult = await axios.get(`${this.baseUrl}/analyses/${analysisId}`, {
        headers: {
          accept: "application/json",
          "x-apikey": this.apiKey,
        },
      });
      status = responseResult.data.data.attributes.status;
    }

    if (responseResult.status === 400) {
      return { error: "Bad request to get report from VirusTotal API (status 400)" };
    }

    const resultData = responseResult.data.data.attributes;
    const scanResults = resultData.stats;
    return scanResults;
  }
}

const vtScanner = new VirusTotalScanner(getApiKeysMedia("VIRUSTOTAL")[0]);

let requestQueue = [];
let isProcessing = false;
const DELAY_BETWEEN_REQUESTS = 15000;
let lastSpamTime = new Map();

async function processQueue() {
  if (isProcessing || requestQueue.length === 0) return;

  isProcessing = true;

  while (requestQueue.length > 0) {
    const { api, message, url, resolve, reject } = requestQueue.shift();

    try {
      await checkFileByVirusTotal(api, message, url);
      if (typeof resolve === "function") resolve();
    } catch (error) {
      if (typeof reject === "function") reject(error);
    }

    await new Promise((resolve) => setTimeout(resolve, DELAY_BETWEEN_REQUESTS));
  }

  isProcessing = false;
}

async function checkFileByVirusTotal(api, message, url) {
  let tempPath;
  try {
    const notify = `Tiến hành quét file...!`;
    const objNotify = {
      success: true,
      message: notify,
    };
    await sendMessageFromSQL(api, message, objNotify, false, 5000);

    tempPath = await downloadFile(url);
    const scanResults = await vtScanner.scanUrl(tempPath);
    if (scanResults.error) {
      throw new Error(scanResults.error);
    }
    let resultMessage = `🔍 Kết quả kiểm tra file thông qua URL: ${url}\n\n`;
    resultMessage +=
      `- Kết quả phát hiện:\n` +
      `${scanResults.malicious ? `  • Độc hại: ${scanResults.malicious}\n` : ""}` +
      `${scanResults.suspicious ? `  • Đáng ngờ: ${scanResults.suspicious}\n` : ""}` +
      `${scanResults.undetected ? `  • Không phát hiện: ${scanResults.undetected}\n` : ""}` +
      `${scanResults.harmless ? `  • An toàn: ${scanResults.harmless}\n` : ""}` +
      `${scanResults["type-unsupported"] ? `  • Không hỗ trợ: ${scanResults["type-unsupported"]}\n` : ""}`;

    const result = {
      success: true,
      message: resultMessage.trim(),
    };
    await sendMessageFromSQL(api, message, result, true, TIME_HOUR_24);
  } catch (error) {
    if (api && message) {
      const result = {
        success: false,
        message:
          `URL không hợp lệ hoặc truy vấn thất bại!!!, URL ${url} đã bị xóa khỏi hàng chờ.\n` +
          `Lỗi: ${error.message || error}`,
      };
      await sendMessageFromSQL(api, message, result, true, 300000);
    }
  } finally {
    await deleteFile(tempPath);
  }
}

function addToQueue(api, message, url) {
  return new Promise((resolve, reject) => {
    requestQueue.push({ api, message, url, resolve, reject });
    processQueue();
  });
}

function getQueueInfo() {
  if (requestQueue.length === 0) {
    return null;
  }

  const queueInfo = requestQueue.map((request, index) => {
    const position = index + 1;
    const estimatedTime = position * (DELAY_BETWEEN_REQUESTS / 1000);
    return {
      url: request.url,
      position: position,
      estimatedSeconds: estimatedTime,
    };
  });

  return queueInfo;
}

function isUrlInQueue(url) {
  return requestQueue.some((request) => request.url === url);
}

function getUrlQueuePosition(url) {
  const index = requestQueue.findIndex((request) => request.url === url);
  if (index === -1) return null;

  const position = index + 1;
  const estimatedTime = position * (DELAY_BETWEEN_REQUESTS / 1000);
  return {
    position,
    estimatedSeconds: estimatedTime,
  };
}

export async function handleCheckFileByVirusTotal(api, message, aliasCommand) {
  const content = removeMention(message);
  const prefix = getGlobalPrefix(api.getBotId());
  const args = content.replace(`${prefix}${aliasCommand}`, "").trim();

  if (args.toLowerCase() === "list") {
    const queueInfo = getQueueInfo();
    if (!queueInfo) {
      const result = {
        success: true,
        message: "Hiện tại không có URL nào trong hàng chờ kiểm tra.",
      };
      await sendMessageFromSQL(api, message, result, false, 60000);
      return;
    }

    const queueList = queueInfo
      .map(
        (info) =>
          `- URL: ${info.url}:\n` +
          `  + Vị trí: ${info.position}\n` +
          `  + Thời gian chờ: ${info.estimatedSeconds} giây`
      )
      .join("\n\n");

    const result = {
      success: true,
      message:
        `📋 Danh sách hàng chờ kiểm tra URL:\n\n${queueList}\n\n` +
        `Tổng số trong hàng chờ: ${queueInfo.length}\n` +
        `Thời gian chờ tối đa: ${queueInfo.length * (DELAY_BETWEEN_REQUESTS / 60000)} phút`,
    };
    await sendMessageFromSQL(api, message, result, false, 300000);
    return;
  }

  let urlCheck = args;
  if (!urlCheck) {
    const quotedMessage = message?.data?.quote;
    if (quotedMessage) {
      try {
        const parseMessage = JSON.parse(quotedMessage.attach);
        urlCheck = parseMessage.href || parseMessage.title || quotedMessage.msg || null;
      } catch (error) {
        urlCheck = quotedMessage.msg || null;
      }
    }
  }

  if (!urlCheck) {
    const result = {
      success: false,
      message:
        "Vui lòng quote vào tệp lệnh cần check hoặc nhập link file cần check!\n" +
        `Cú pháp: ${prefix}${aliasCommand} (quote hoặc link file cần check)\n` +
        `Ví dụ: ${prefix}${aliasCommand} https://example.com/file.txt\n` +
        `Xem hàng chờ: ${prefix}${aliasCommand} list`,
    };
    await sendMessageFromSQL(api, message, result, false, 60000);
    return;
  }

  const checkValidUrl = isValidUrl(urlCheck);
  if (!checkValidUrl.valid) {
    const result = {
      success: false,
      message: checkValidUrl.reason
        ? checkValidUrl.reason
        : `Định dạng URL không hợp lệ!\n` +
          `Cú pháp: ${prefix}${aliasCommand} (URL cần check)\n` +
          `Ví dụ: ${prefix}${aliasCommand} https://example.com/file.txt`,
    };
    await sendMessageFromSQL(api, message, result, true, 60000);
    return;
  }

  if (isUrlInQueue(urlCheck)) {
    const queueInfo = getUrlQueuePosition(urlCheck);
    const result = {
      success: false,
      message:
        `URL ${urlCheck} đã có trong hàng chờ!\n` +
        `Vị trí hiện tại: ${queueInfo.position}\n` +
        `Thời gian chờ còn lại: ${queueInfo.estimatedSeconds} giây`,
    };
    await sendMessageFromSQL(api, message, result, true, 300000);
    return;
  }

  const lastTime = lastSpamTime.get(urlCheck);
  if (lastTime && Date.now() - lastTime < DELAY_BETWEEN_REQUESTS) {
    const remainingTime = Math.ceil((DELAY_BETWEEN_REQUESTS - (Date.now() - lastTime)) / 1000);
    const result = {
      success: false,
      message: `Vui lòng đợi ${remainingTime} giây nữa trước khi kiểm tra lại URL này.`,
    };
    await sendMessageFromSQL(api, message, result, true, 300000);
    return;
  }

  const queuePosition = requestQueue.length + (isProcessing ? 1 : 0);
  if (queuePosition > 0) {
    const result = {
      success: true,
      message: `Đã thêm URL ${urlCheck} vào hàng đợi.\nVị trí trong hàng đợi: ${queuePosition}\nThời gian chờ ước tính: ${
        queuePosition * (DELAY_BETWEEN_REQUESTS / 1000)
      } giây`,
    };
    await sendMessageFromSQL(api, message, result, true, queuePosition * 5 * 1000);
  }

  try {
    await addToQueue(api, message, urlCheck);
  } catch (error) {
    console.error("Lỗi khi xử lý kiểm tra Virus trong file:", error);
  }
}

function isValidUrl(urlString) {
  try {
    if (typeof urlString !== "string") {
      return {
        valid: false,
        reason: "URL must be a string",
        url: null,
      };
    }
    if (!urlString.startsWith("http://") && !urlString.startsWith("https://")) {
      urlString = "http://" + urlString;
    }
    const url = new URL(urlString);
    return {
      valid: true,
      reason: null,
      url: url.href,
    };
  } catch (error) {
    return {
      valid: false,
      reason: error.message,
      url: null,
    };
  }
}
