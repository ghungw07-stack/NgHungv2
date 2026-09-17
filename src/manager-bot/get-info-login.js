import schedule from "node-schedule";
import cryptojs from "crypto-js";
import crypto from "node:crypto";
import path from "path";
import {
  sendMessageComplete,
  sendMessageCompleteRequest,
  sendMessageFailed,
  sendMessageWarning,
} from "../service-ngh/chat-zalo/chat-style/chat-style.js";
import * as toughCookie from "tough-cookie";
import { Zalo } from "../api-zalo/zalo.js";
import { tempDir } from "../utils/io-json.js";
import { deleteFile, writeFileSync } from "../utils/util.js";
import { randomIDTemp } from "../utils/format-util.js";
import { MessageType } from "../api-zalo/index.js";
import { getMessageByThreadAndMsgId } from "../utils/message-cache.js";
import { createLoginQRCardBuffer } from "../utils/canvas/login-qr-card.js";
import { createZaloProxyTransport } from "../api-zalo/proxy.js";

const TIME_TO_LIVE = 1000 * 60 * 30;
const TIME_LIVE_QRCODE = 100000;
const QR_EXPIRES_IN_SECONDS = Math.round(TIME_LIVE_QRCODE / 1000);
const sessionGetLogin = new Map();

function getLoginQRCaption(purpose) {
  const action = purpose === "mybot"
    ? "🤖 Quét QR để đăng nhập bot."
    : "🔐 Quét QR để lấy Cookie & IMEI.";
  return `${action}\n⏳ Hết hạn sau ${QR_EXPIRES_IN_SECONDS} giây — không chia sẻ.`;
}

// Nguyễn Gia Hưng dz xoá làm chó
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
  const cookieHeaders = typeof response.headers?.getSetCookie === "function"
    ? response.headers.getSetCookie()
    : (response.headers?.get("set-cookie") ? [response.headers.get("set-cookie")] : []);
  if (cookieHeaders.length > 0 && !raw) {
    for (const cookie of cookieHeaders) {
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
    const resolvedRedirect = new URL(redirectURL, url).toString();
    return await request(ctx, resolvedRedirect, redirectOptions);
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
      origin: "https://id.zalo.me",
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
      origin: "https://id.zalo.me",
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
      origin: "https://id.zalo.me",
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

  while (!signal.aborted) {
    try {
      const res = await request(ctx, "https://id.zalo.me/account/authen/qr/waiting-scan", {
        headers: {
          accept: "*/*",
          "accept-language": "vi-VN,vi;q=0.9,fr-FR;q=0.8,fr;q=0.7,en-US;q=0.6,en;q=0.5",
          "content-type": "application/x-www-form-urlencoded",
          origin: "https://id.zalo.me",
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
      });
      const data = await res.json();
      if (data.error_code == 8) {
        await new Promise((resolve) => setTimeout(resolve, 500));
        continue;
      }
      return data;
    } catch (err) {
      if (signal.aborted) return null;
      console.error("[waitingScan error]", err?.message || err);
      return null;
    }
  }
  return null;
}
async function waitingConfirm(api, message, ctx, version, code, signal, qrResultMessage) {
  try {
    const botId = typeof api?.getBotId === "function" ? api.getBotId() : null;
    const threadId = message?.threadId;
    const quotedMsgId = qrResultMessage?.message?.msgId || qrResultMessage?.attachment?.[0]?.msgId;
    if (botId && threadId && quotedMsgId) {
      const cacheMessage = await getMessageByThreadAndMsgId(botId, threadId, quotedMsgId);
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
        await api.deleteMessage(msgDel, false).catch(() => {});
      }
    }
    await sendMessageComplete(api, message, `Vui lòng nhấn xác nhận trên điện thoại!`, false, 60000).catch(() => {});
  } catch (err) {
    console.error("[waitingConfirm notify error]", err?.message || err);
  }

  const form = new URLSearchParams();
  form.append("code", code);
  form.append("gToken", "");
  form.append("gAction", "CONFIRM_QR");
  form.append("continue", "https://chat.zalo.me/");
  form.append("v", version);

  while (!signal.aborted) {
    try {
      const res = await request(ctx, "https://id.zalo.me/account/authen/qr/waiting-confirm", {
        headers: {
          accept: "*/*",
          "accept-language": "vi-VN,vi;q=0.9,fr-FR;q=0.8,fr;q=0.7,en-US;q=0.6,en;q=0.5",
          "content-type": "application/x-www-form-urlencoded",
          origin: "https://id.zalo.me",
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
      });
      const data = await res.json();
      if (data.error_code == 8) {
        await new Promise((resolve) => setTimeout(resolve, 500));
        continue;
      }
      return data;
    } catch (err) {
      if (signal.aborted) return null;
      console.error("[waitingConfirm polling error]", err?.message || err);
      return null;
    }
  }
  return null;
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

async function getUserInfo(ctx) {
  return await request(ctx, "https://jr.chat.zalo.me/jr/userinfo", {
    headers: {
      accept: "*/*",
      "accept-language": "vi-VN,vi;q=0.9,fr-FR;q=0.8,fr;q=0.7,en-US;q=0.6,en;q=0.5",
      priority: "u=1, i",
      "sec-ch-ua": '"Chromium";v="130", "Google Chrome";v="130", "Not?A_Brand";v="99"',
      "sec-ch-ua-mobile": "?0",
      "sec-ch-ua-platform": '"Windows"',
      "sec-fetch-dest": "empty",
      "sec-fetch-mode": "cors",
      "sec-fetch-site": "same-site",
      Referer: "https://chat.zalo.me/",
      "Referrer-Policy": "strict-origin-when-cross-origin",
    },
    method: "GET",
  })
    .then((res) => res.json())
    .catch(console.error);
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
    }
  );
}

export async function loginQR(api, message, ctx, options = {}) {
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

    let msgId = "";
    const qrPath = path.join(tempDir, `qrImg_${randomIDTemp()}.png`);
    try {
      // Dùng ảnh PNG gốc chuẩn của Zalo không chỉnh sửa màu/kích thước để giữ 100% chi tiết và tránh kích hoạt OCR/chống lừa đảo của Zalo App
      const base64Data = qrData.image.replace(/^data:image\/png;base64,/, "");
      writeFileSync(qrPath, Buffer.from(base64Data, "base64"));
      msgId = await sendMessageCompleteRequest(
        api,
        message,
        {
          caption: getLoginQRCaption(options.purpose),
          imagePath: qrPath,
        },
        TIME_LIVE_QRCODE
      );
    } catch (error) {
      console.error("[Login QR] Không thể tạo hoặc gửi ảnh QR:", error?.message || error);
      return reject({
        error: `Có lỗi khi xử lý dữ liệu QR!`,
      });
    } finally {
      await deleteFile(qrPath);
    }

    const controller = new AbortController();
    if (options.signal) {
      options.signal.addEventListener("abort", () => {
        controller.abort();
        reject({
          isAborted: true,
          error: "Phiên lấy QR đã bị hủy để tạo phiên mới.",
        });
      });
    }
    const timeout = setTimeout(() => {
      controller.abort();
      return reject({
        error: `QR đã hết hạn, kết thúc phiên lấy imei cookie này!`,
      });
    }, TIME_LIVE_QRCODE);
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

    if (confirmResult.error_code == -13) {
      return reject({
        error: "Bạn đã từ chối đăng nhập mã QR này!",
      });
    } else if (confirmResult.error_code != 0) {
      return reject({
        error: `Đã xảy ra lỗi!\nChi Tiết: ${JSON.stringify(confirmResult, null, 2)}`,
      });
    }

    const checkSessionResult = await checkSession(ctx);
    if (!checkSessionResult)
      return reject({
        error: "Không thể kiểm tra phiên truy cập của mã QR này!",
      });

    await getUserInfo(ctx);
    await establishSession(ctx);

    clearTimeout(timeout);
    resolve({
      cookies: ctx.cookie.toJSON().cookies,
      data: scanResult.data,
    });
   } catch (error) {
    if (error?.isAborted) return reject(error);
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
  userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36",
  options: { polyfill: global.fetch, ...createZaloProxyTransport() },
  secretKey: null,
});

export async function handleGetCookieImeiByQR(api, message, options = {}) {
  const senderId = message.data.uidFrom;
  const sessionKey = `${api.getBotId()}:${senderId}`;

  if (sessionGetLogin.has(sessionKey)) {
    const prev = sessionGetLogin.get(sessionKey);
    const elapsed = Date.now() - (prev?.timestamp || 0);
    // Cho phép hủy phiên cũ và tạo lại nếu đã qua ít nhất 10 giây
    if (elapsed > 10000 && prev?.controller) {
      try {
        prev.controller.abort();
      } catch {}
      sessionGetLogin.delete(sessionKey);
    } else {
      const caption = `Bạn đã yêu cầu get data login trước đó. vui lòng quét QR đã gửi trước đó để có thể lấy thông tin cookie imei`;
      await sendMessageWarning(api, message, caption, true, TIME_LIVE_QRCODE);
      return;
    }
  }

  const sessionController = new AbortController();
  sessionGetLogin.set(sessionKey, {
    timestamp: Date.now(),
    controller: sessionController,
  });

  try {
    const ctx = createContext();
    const loginQRResult = await loginQR(api, message, ctx, {
      ...options,
      signal: sessionController.signal,
    });
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

    if (options.purpose === "mybot") {
      await sendMessageComplete(api, message, "Quét QR đăng nhập thành công. Đang lưu thông tin bot…", true, TIME_TO_LIVE);
    } else {
      const caption =
        `Get cookie imei thành công!\n\n` +
        `Tài Khoản: ${loginQRResult.data.display_name}\nIMEI: ${ctx.imei}\nCookie: ${cookie}`;
      if (message.type === MessageType.GroupMessage) {
        try {
          await api.sendMessage({ msg: caption, ttl: TIME_TO_LIVE }, senderId, MessageType.DirectMessage);
        } catch {
          await sendMessageFailed(api, message, "Không gửi được Cookie/IMEI qua tin nhắn riêng. Hãy kết bạn với bot rồi dùng getlogin lại.", true, TIME_TO_LIVE);
          return null;
        }
        await sendMessageComplete(api, message, "Đã gửi Cookie/IMEI vào tin nhắn riêng của bạn.", true, TIME_TO_LIVE);
      } else {
        await sendMessageComplete(api, message, caption, true, TIME_TO_LIVE);
      }
    }
    return {
      imei: ctx.imei,
      cookie: cookie,
      ctx: ctx,
    };
  } catch (error) {
    if (error?.isAborted) {
      return null;
    }
    await sendMessageFailed(
      api,
      message,
      error.message ? `Có lỗi xảy ra: ` + error.message : error.error,
      true,
      TIME_TO_LIVE
    );
    return null;
  } finally {
    if (sessionGetLogin.get(sessionKey)?.controller === sessionController) {
      sessionGetLogin.delete(sessionKey);
    }
  }
}
