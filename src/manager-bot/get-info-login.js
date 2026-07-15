import schedule from "node-schedule";
import cryptojs from "crypto-js";
import crypto from "node:crypto";
import path from "path";
import QRCode from "qrcode";
import {
  sendMessageComplete,
  sendMessageCompleteRequest,
  sendMessageFailed,
  sendMessageFromSQLImage,
  sendMessageWarning,
} from "../service-dqt/chat-zalo/chat-style/chat-style.js";
import * as toughCookie from "tough-cookie";
import { Zalo } from "../api-zalo/zalo.js";
import { tempDir } from "../utils/io-json.js";
import { deleteFile, loadImageBuffer, writeFileSync } from "../utils/util.js";
import { randomIDTemp } from "../utils/format-util.js";
import { MessageType } from "../api-zalo/index.js";
import { getMessageByThreadAndMsgId } from "../utils/message-cache.js";
import { createCanvas, loadImage } from "canvas";
import { getUserInfoBasic } from "../service-dqt/info-service/user-info.js";

const TIME_TO_LIVE = 1000 * 60 * 30;
const TIME_LIVE_QRCODE = 100000;
const sessionGetLogin = new Map();
// Ha Huy Hoang dz xoá làm chó
schedule.scheduleJob("*/5 * * * *", () => {
  const now = Date.now();
  for (const [key, value] of sessionGetLogin.entries()) {
    if (now - value.timestamp > TIME_LIVE_QRCODE) {
      sessionGetLogin.delete(key);
    }
  }
});

export async function getDefaultHeaders(ctx, origin = "https://chat.zalo.me") {
  if (!ctx.cookie) throw new ZaloApiError("Cookie is not available");
  if (!ctx.userAgent) throw new ZaloApiError("User agent is not available");
  return {
    Accept: "application/json, text/plain, */*",
    "Accept-Encoding": "gzip, deflate, br, zstd",
    "Accept-Language": "en-US,en;q=0.9",
    "content-type": "application/x-www-form-urlencoded",
    Cookie: await ctx.cookie.getCookieString(origin),
    Origin: "https://chat.zalo.me",
    Referer: "https://chat.zalo.me/",
    "User-Agent": ctx.userAgent,
  };
}

export async function request(ctx, url, options, raw = false) {
  if (!ctx.cookie) ctx.cookie = new toughCookie.CookieJar();
  const origin = new URL(url).origin;
  const defaultHeaders = await getDefaultHeaders(ctx, origin);
  if (!raw) {
    if (options) {
      options.headers = Object.assign(defaultHeaders, options.headers || {});
    } else options = { headers: defaultHeaders };
  }
  const _options = Object.assign(Object.assign({}, options !== null && options !== void 0 ? options : {}), {
    agent: ctx.options.agent,
  });
  const response = await ctx.options.polyfill(url, _options);
  const setCookieRaw = response.headers.get("set-cookie");
  if (setCookieRaw && !raw) {
    const splitCookies = setCookieRaw.split(", ");
    for (const cookie of splitCookies) {
      const parsed = toughCookie.Cookie.parse(cookie);
      try {
        if (parsed) await ctx.cookie.setCookie(parsed, origin);
      } catch (_a) {}
    }
  }
  const redirectURL = response.headers.get("location");
  if (redirectURL) {
    const redirectOptions = Object.assign({}, options);
    redirectOptions.method = "GET";
    if (!raw) redirectOptions.headers["Referer"] = "https://id.zalo.me/";
    return await request(ctx, redirectURL, redirectOptions);
  }
  return response;
}

async function loadLoginPage(ctx) {
  const response = await request(ctx, "https://id.zalo.me/account?continue=https%3A%2F%2Fchat.zalo.me%2F", {
    headers: {
      accept:
        "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7",
      "accept-language": "vi-VN,vi;q=0.9,fr-FR;q=0.8,fr;q=0.7,en-US;q=0.6,en;q=0.5",
      "cache-control": "max-age=0",
      priority: "u=0, i",
      "sec-ch-ua": '"Chromium";v="130", "Google Chrome";v="130", "Not?A_Brand";v="99"',
      "sec-ch-ua-mobile": "?0",
      "sec-ch-ua-platform": '"Windows"',
      "sec-fetch-dest": "document",
      "sec-fetch-mode": "navigate",
      "sec-fetch-site": "same-site",
      "sec-fetch-user": "?1",
      "upgrade-insecure-requests": "1",
      Referer: "https://chat.zalo.me/",
      "Referrer-Policy": "strict-origin-when-cross-origin",
    },
    method: "GET",
  });
  const html = await response.text();
  const regex = /https:\/\/stc-zlogin\.zdn\.vn\/main-([\d.]+)\.js/;
  const match = html.match(regex);
  return match === null || match === void 0 ? void 0 : match[1];
}
async function getLoginInfo(ctx, version) {
  const form = new URLSearchParams();
  form.append("continue", "https://zalo.me/pc");
  form.append("v", version);
  return await request(ctx, "https://id.zalo.me/account/logininfo", {
    headers: {
      accept: "*/*",
      "accept-language": "vi-VN,vi;q=0.9,fr-FR;q=0.8,fr;q=0.7,en-US;q=0.6,en;q=0.5",
      "content-type": "application/x-www-form-urlencoded",
      priority: "u=1, i",
      "sec-ch-ua": '"Chromium";v="130", "Google Chrome";v="130", "Not?A_Brand";v="99"',
      "sec-ch-ua-mobile": "?0",
      "sec-ch-ua-platform": '"Windows"',
      "sec-fetch-dest": "empty",
      "sec-fetch-mode": "cors",
      "sec-fetch-site": "same-origin",
      Referer: "https://id.zalo.me/account?continue=https%3A%2F%2Fzalo.me%2Fpc",
      "Referrer-Policy": "strict-origin-when-cross-origin",
    },
    body: form,
    method: "POST",
  })
    .then((res) => res.json())
    .catch(console.error);
}
async function verifyClient(ctx, version) {
  const form = new URLSearchParams();
  form.append("type", "device");
  form.append("continue", "https://zalo.me/pc");
  form.append("v", version);
  return await request(ctx, "https://id.zalo.me/account/verify-client", {
    headers: {
      accept: "*/*",
      "accept-language": "vi-VN,vi;q=0.9,fr-FR;q=0.8,fr;q=0.7,en-US;q=0.6,en;q=0.5",
      "content-type": "application/x-www-form-urlencoded",
      priority: "u=1, i",
      "sec-ch-ua": '"Chromium";v="130", "Google Chrome";v="130", "Not?A_Brand";v="99"',
      "sec-ch-ua-mobile": "?0",
      "sec-ch-ua-platform": '"Windows"',
      "sec-fetch-dest": "empty",
      "sec-fetch-mode": "cors",
      "sec-fetch-site": "same-origin",
      Referer: "https://id.zalo.me/account?continue=https%3A%2F%2Fzalo.me%2Fpc",
      "Referrer-Policy": "strict-origin-when-cross-origin",
    },
    body: form,
    method: "POST",
  })
    .then((res) => res.json())
    .catch(console.error);
}
async function generate(ctx, version) {
  const form = new URLSearchParams();
  form.append("continue", "https://zalo.me/pc");
  form.append("v", version);
  return await request(ctx, "https://id.zalo.me/account/authen/qr/generate", {
    headers: {
      accept: "*/*",
      "accept-language": "vi-VN,vi;q=0.9,fr-FR;q=0.8,fr;q=0.7,en-US;q=0.6,en;q=0.5",
      "content-type": "application/x-www-form-urlencoded",
      priority: "u=1, i",
      "sec-ch-ua": '"Chromium";v="130", "Google Chrome";v="130", "Not?A_Brand";v="99"',
      "sec-ch-ua-mobile": "?0",
      "sec-ch-ua-platform": '"Windows"',
      "sec-fetch-dest": "empty",
      "sec-fetch-mode": "cors",
      "sec-fetch-site": "same-origin",
      Referer: "https://id.zalo.me/account?continue=https%3A%2F%2Fzalo.me%2Fpc",
      "Referrer-Policy": "strict-origin-when-cross-origin",
    },
    body: form,
    method: "POST",
  })
    .then((res) => res.json())
    .catch(console.error);
}
async function waitingScan(ctx, version, code, signal) {
  const form = new URLSearchParams();
  form.append("code", code);
  form.append("continue", "https://chat.zalo.me/");
  form.append("v", version);
  return await request(ctx, "https://id.zalo.me/account/authen/qr/waiting-scan", {
    headers: {
      accept: "*/*",
      "accept-language": "vi-VN,vi;q=0.9,fr-FR;q=0.8,fr;q=0.7,en-US;q=0.6,en;q=0.5",
      "content-type": "application/x-www-form-urlencoded",
      priority: "u=1, i",
      "sec-ch-ua": '"Chromium";v="130", "Google Chrome";v="130", "Not?A_Brand";v="99"',
      "sec-ch-ua-mobile": "?0",
      "sec-ch-ua-platform": '"Windows"',
      "sec-fetch-dest": "empty",
      "sec-fetch-mode": "cors",
      "sec-fetch-site": "same-origin",
      Referer: "https://id.zalo.me/account?continue=https%3A%2F%2Fchat.zalo.me%2F",
      "Referrer-Policy": "strict-origin-when-cross-origin",
    },
    body: form,
    method: "POST",
    signal,
  })
    .then((res) => res.json())
    .then((data) => {
      if (data.error_code == 8) {
        return waitingScan(ctx, version, code, signal);
      }
      return data;
    })
    .catch(console.error);
}
async function waitingConfirm(api, message, ctx, version, code, signal, qrResultMessage) {
  const botId = api.getBotId();
  const threadId = message.threadId;
  const form = new URLSearchParams();
  form.append("code", code);
  form.append("gToken", "");
  form.append("gAction", "CONFIRM_QR");
  form.append("continue", "https://chat.zalo.me/");
  form.append("v", version);
  const quotedMsgId = qrResultMessage?.message?.msgId || qrResultMessage?.attachment?.[0]?.msgId;
  const cacheMessage = quotedMsgId ? await getMessageByThreadAndMsgId(botId, threadId, quotedMsgId) : null;
  if (cacheMessage) {
    const msgDel = {
      type: cacheMessage.type,
      threadId: cacheMessage.threadId,
      data: {
        cliMsgId: cacheMessage.cliMsgId,
        msgId: cacheMessage.msgId,
        uidFrom: botId,
      },
    };
    await api.deleteMessage(msgDel, false);
  }

  await sendMessageComplete(api, message, `Vui lòng nhấn xác nhận trên điện thoại!`, false, 60000);
  return await request(ctx, "https://id.zalo.me/account/authen/qr/waiting-confirm", {
    headers: {
      accept: "*/*",
      "accept-language": "vi-VN,vi;q=0.9,fr-FR;q=0.8,fr;q=0.7,en-US;q=0.6,en;q=0.5",
      "content-type": "application/x-www-form-urlencoded",
      priority: "u=1, i",
      "sec-ch-ua": '"Chromium";v="130", "Google Chrome";v="130", "Not?A_Brand";v="99"',
      "sec-ch-ua-mobile": "?0",
      "sec-ch-ua-platform": '"Windows"',
      "sec-fetch-dest": "empty",
      "sec-fetch-mode": "cors",
      "sec-fetch-site": "same-origin",
      Referer: "https://id.zalo.me/account?continue=https%3A%2F%2Fchat.zalo.me%2F",
      "Referrer-Policy": "strict-origin-when-cross-origin",
    },
    body: form,
    method: "POST",
    signal,
  })
    .then((res) => res.json())
    .then((data) => {
      if (data.error_code == 8) {
        return waitingConfirm(ctx, version, code, signal);
      }
      return data;
    })
    .catch(console.error);
}
async function checkSession(ctx) {
  return await request(
    ctx,
    "https://id.zalo.me/account/checksession?continue=https%3A%2F%2Fchat.zalo.me%2Findex.html",
    {
      headers: {
        accept:
          "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7",
        "accept-language": "vi-VN,vi;q=0.9,fr-FR;q=0.8,fr;q=0.7,en-US;q=0.6,en;q=0.5",
        priority: "u=0, i",
        "sec-ch-ua": '"Chromium";v="130", "Google Chrome";v="130", "Not?A_Brand";v="99"',
        "sec-ch-ua-mobile": "?0",
        "sec-ch-ua-platform": '"Windows"',
        "sec-fetch-dest": "document",
        "sec-fetch-mode": "navigate",
        "sec-fetch-site": "same-origin",
        "upgrade-insecure-requests": "1",
        Referer: "https://id.zalo.me/account?continue=https%3A%2F%2Fchat.zalo.me%2F",
        "Referrer-Policy": "strict-origin-when-cross-origin",
      },
      redirect: "manual",
      method: "GET",
    }
  ).catch(console.error);
}

async function establishSession(ctx) {
  return await request(
    ctx,
    "https://chat.zalo.me/",
    {
      headers: {
        accept:
          "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7",
        "accept-language": "vi-VN,vi;q=0.9,en-US;q=0.6,en;q=0.5",
        "sec-fetch-dest": "document",
        "sec-fetch-mode": "navigate",
        "sec-fetch-site": "same-origin",
        "upgrade-insecure-requests": "1",
      },
      method: "GET",
    },
    true
  );
}

function isInFinderPattern(x, y, moduleCount) {
  const inTopLeft = x <= 6 && y <= 6;
  const inTopRight = x >= moduleCount - 7 && y <= 6;
  const inBottomLeft = x <= 6 && y >= moduleCount - 7;
  return inTopLeft || inTopRight || inBottomLeft;
}

async function createQRWithCircularAvatar(qrImageBase64, avatarPath, outputPath) {
  const canvasWidth = 600;
  const canvasHeight = 800;
  const qrSize = 500;
  const avatarSize = 80;
  const qrX = (canvasWidth - qrSize) / 2;
  const qrY = 100;

  const canvas = createCanvas(canvasWidth, canvasHeight);
  const ctx = canvas.getContext("2d");

  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, canvasWidth, canvasHeight);

  // Dùng đúng ảnh QR do server Zalo trả về (giữ nguyên nội dung mã hoá gốc),
  // KHÔNG tự vẽ lại QR từ token vì token thô không đủ để app Zalo nhận diện đúng.
  const qrBuffer = Buffer.from(qrImageBase64.replace(/^data:image\/png;base64,/, ""), "base64");
  const qrImage = await loadImage(qrBuffer);
  ctx.drawImage(qrImage, qrX, qrY, qrSize, qrSize);

  const imageBuffer = await loadImageBuffer(avatarPath);
  const avatar = await loadImage(imageBuffer);
  const avatarX = qrX + (qrSize - avatarSize) / 2;
  const avatarY = qrY + (qrSize - avatarSize) / 2;

  // Vẽ nền trắng lót dưới avatar để không đè lên module QR xung quanh viền avatar
  ctx.save();
  ctx.beginPath();
  ctx.arc(avatarX + avatarSize / 2, avatarY + avatarSize / 2, avatarSize / 2 + 6, 0, Math.PI * 2);
  ctx.closePath();
  ctx.fillStyle = "#ffffff";
  ctx.fill();
  ctx.restore();

  ctx.save();
  ctx.beginPath();
  ctx.arc(avatarX + avatarSize / 2, avatarY + avatarSize / 2, avatarSize / 2, 0, Math.PI * 2);
  ctx.closePath();
  ctx.clip();
  ctx.drawImage(avatar, avatarX, avatarY, avatarSize, avatarSize);
  ctx.restore();

  const textContent = "Mở ứng dụng Zalo và quét QR bằng camera";
  ctx.font = "bold 24px Arial";
  ctx.fillStyle = "#000000";
  ctx.textAlign = "center";
  ctx.fillText(textContent, canvasWidth / 2, qrY + qrSize + 60);

  const buffer = canvas.toBuffer("image/png");
  writeFileSync(outputPath, buffer);
}

export async function loginQR(api, message, ctx) {
  const senderId = message.data.uidFrom;
  return new Promise(async (resolve, reject) => {
   try {
    const loginVersion = await loadLoginPage(ctx);
    if (!loginVersion)
      return reject({
        error: "Không lấy được Zalo Login Version...!",
      });
    await getLoginInfo(ctx, loginVersion);
    await verifyClient(ctx, loginVersion);
    const qrGenResult = await generate(ctx, loginVersion);
    if (!qrGenResult || !qrGenResult.data)
      return reject({
        error: `Không thể khởi tạo QR Code Login Zalo\nChi Tiết: ${JSON.stringify(qrGenResult, null, 2)}`,
      });
    const qrData = qrGenResult.data;
    const token = qrData.token;

    let msgId = "";
    const qrPath = path.join(tempDir, `qrImg_${randomIDTemp()}.png`);
    try {
      const userInfo = await getUserInfoBasic(api, senderId);

      // writeFileSync(qrPath, Buffer.from(qrData.image.replace(/^data:image\/png;base64,/, ""), "base64"));
      await createQRWithCircularAvatar(qrData.image, userInfo.avatar, qrPath);
      msgId = await sendMessageCompleteRequest(
        api,
        message,
        {
          caption:
            `Vui lòng quét QR sau để lấy thông tin đăng nhập cho bạn!\n` +
            `Lưu ý: Nhớ quét qr có @ tag bạn, đừng quét qr có @ tag của người khác = ) ahihi...!`,
          imagePath: qrPath,
        },
        TIME_LIVE_QRCODE
      );
    } catch (error) {
      return reject({
        error: `Có lỗi khi xử lý dữ liệu QR!`,
      });
    } finally {
      await deleteFile(qrPath);
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => {
      controller.abort();
      return reject({
        error: `QR đã hết hạn, kết thúc phiên lấy imei cookie này!`,
      });
    }, 100000);
    const scanResult = await waitingScan(ctx, loginVersion, qrGenResult.data.code, controller.signal);
    if (!scanResult || !scanResult.data)
      return reject({
        error: "Không kiểm tra được kết quả quét QR!",
      });
    const confirmResult = await waitingConfirm(
      api,
      message,
      ctx,
      loginVersion,
      qrGenResult.data.code,
      controller.signal,
      msgId
    );
    if (!confirmResult)
      return reject({
        error: "Không nhận được xác nhận mã QR từ bạn!",
      });
    const checkSessionResult = await checkSession(ctx);
    if (!checkSessionResult)
      return reject({
        error: "Không thể kiểm tra phiên truy cập của mã QR này!",
      });

    // Establish session to get fresh cookies from chat.zalo.me
    await establishSession(ctx);

    if (confirmResult.error_code == 0) {
    } else if (confirmResult.error_code == -13) {
      return reject({
        error: "Bạn đã từ chối đăng nhập mã QR này!",
      });
    } else {
      return reject({
        error: `Đã xảy ra lỗi!\nChi Tiết: ${JSON.stringify(confirmResult, null, 2)}`,
      });
    }
    clearTimeout(timeout);
    resolve({
      cookies: ctx.cookie.toJSON().cookies,
      data: scanResult.data,
    });
   } catch (error) {
    return reject({
      error: `Lỗi không xác định trong luồng QR Login!\nChi Tiết: ${error?.message || error}`,
    });
   }
  });
}

export function generateZaloUUID(userAgent) {
  return crypto.randomUUID() + "-" + cryptojs.MD5(userAgent).toString();
}

export const createContext = (apiType = Zalo.API_TYPE, apiVersion = Zalo.API_VERSION) => ({
  API_TYPE: apiType,
  API_VERSION: apiVersion,
  imei: "",
  cookie: new toughCookie.CookieJar(),
  userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:133.0) Gecko/20100101 Firefox/133.0",
  options: { polyfill: global.fetch },
  secretKey: null,
});

export async function handleGetCookieImeiByQR(api, message) {
  const senderId = message.data.uidFrom;

  if (sessionGetLogin.has(senderId)) {
    const caption = `Bạn đã yêu cầu get data login trước đó. vui lòng quét QR đã gửi trước đó để có thể lấy thông tin cookie imei`;
    await sendMessageWarning(api, message, caption, true, TIME_LIVE_QRCODE);
    return;
  }

  try {
    sessionGetLogin.set(senderId, {
      timestamp: Date.now(),
    });
    const ctx = createContext();
    const loginQRResult = await loginQR(api, message, ctx);
    if (!loginQRResult) {
      await sendMessageFailed(api, message, "Không thể get info login...!", true, TIME_TO_LIVE);
      return;
    }

    let sessionCookieEntry = loginQRResult.cookies.find(
      (cookie) => cookie.key === "zpw_sek" && cookie.domain === "chat.zalo.me"
    );

    if (!sessionCookieEntry) {
      sessionCookieEntry = loginQRResult.cookies.find((cookie) => cookie.key === "zpw_sek");
    }

    if (!sessionCookieEntry) {
      throw new Error("Không tìm thấy cookie zpw_sek!");
    }

    if (!sessionCookieEntry.value || sessionCookieEntry.value === "EXPIRED") {
      const freshCookies = ctx.cookie.toJSON().cookies;
      const freshSessionCookie = freshCookies.find(
        (cookie) => cookie.key === "zpw_sek" && cookie.domain === "chat.zalo.me" && cookie.value !== "EXPIRED"
      );

      if (freshSessionCookie && freshSessionCookie.value) {
        sessionCookieEntry = freshSessionCookie;
      } else {
        throw new Error("Cookie zpw_sek không hợp lệ (EXPIRED). Vui lòng đợi 1-2 phút rồi thử lại!");
      }
    }
    const cookie = sessionCookieEntry.key + "=" + sessionCookieEntry.value;

    ctx.imei = generateZaloUUID(ctx.userAgent);

    let caption = ``;
    if (message.type === MessageType.GroupMessage) {
      caption += `Get Imei Cookie Thành Công!\nThông tin đã được gửi đến tin nhắn riêng của bạn!`;
      await sendMessageComplete(api, message, caption, true, TIME_TO_LIVE);
      message.threadId = senderId;
      message.type = MessageType.DirectMessage;
    }
    caption =
      `Get cookie imei thành công!\n\n` +
      `Tài Khoản: ${loginQRResult.data.display_name}\nIMEI: ${ctx.imei}\nCookie: ${cookie}`;
    await sendMessageComplete(api, message, caption, true, TIME_TO_LIVE);
    return {
      imei: ctx.imei,
      cookie: cookie,
      ctx: ctx,
    };
  } catch (error) {
    await sendMessageFailed(
      api,
      message,
      error.message ? `Có lỗi xảy ra: ` + error.message : error.error,
      true,
      TIME_TO_LIVE
    );
    return null;
  } finally {
    if (sessionGetLogin.has(senderId)) {
      sessionGetLogin.delete(senderId);
    }
  }
}