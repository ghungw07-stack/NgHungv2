import schedule from "node-schedule";
import { MANAGER_BOTS_FILE_PATH, writeConfig, tempDir, writeCommandConfig } from "../utils/io-json.js";
import {
  createBot,
  deleteApiManager,
  getApiManagerWithOwner,
  getGlobalApi,
  getCommandConfig,
  getManagerCommandConfig,
  isBotLeader,
} from "../index.js";
import {
  sendMessageComplete,
  sendMessageCompleteRequest,
  sendMessageResultRequest,
  sendMessageStatePrivate,
  sendMessageWarning,
  ALLOWED_STYLE_SIZES,
  resolveStyleColor,
  getDefaultServerStyle,
} from "../service-ngh/chat-zalo/chat-style/chat-style.js";
import { deepParseJSON, formatSeconds, parseTime, removeMention, FONT_MAIN, randomIDTemp } from "../utils/format-util.js";
import { getGlobalPrefix } from "../service-ngh/service.js";
import { checkAdminLevelHighest } from "../commands/command.js";
import { MessageType, resolveReactionInput, resolveReactionKey } from "../api-zalo/index.js";
import { notifyResetCompleteInGroup, notifyResettingInGroup, managerDataCache } from "../commands/bot-manager/active-bot.js";
import { deleteFile, downloadFile } from "../utils/util.js";
import { handleGetCookieImeiByQR } from "./get-info-login.js";
import { getUserInfoBasic, getUsersInfoBasic } from "../service-ngh/info-service/user-info.js";
import { createListImage } from "../utils/canvas/list-form-v1.js";
import { createManagerBotInfoImage } from "../utils/canvas/info.js";
import { BotChildrenStore } from "./bot-children-store.js";
import { handleNotifyParentOnPM } from "./notify-parent-pm.js";
import { updateSourceOnGithub } from "./github-update.js";
import fs from "fs/promises";
import path from "path";
import nodeFetch from "node-fetch";
import { createCanvas, loadImage } from "canvas";

// ── CẤU HÌNH THANH TOÁN ──────────────────────────────────────────────────────
const PAYMENT_CONFIG = {
  bankBin: "970448",           // OCB
  bankAccount: "SEPNGH66300",  // Sepay VA OCB
  price: 80000,
  // SECURITY: đồng bộ với WEBHOOK_SECRET dùng trong web-server.js — set qua
  // biến môi trường WEBHOOK_SECRET, KHÔNG hardcode secret thật vào source.
  webhookSecret: process.env.WEBHOOK_SECRET || "mybot2024secretkey",
  durationDays: 30,
};
const ONE_DAY_MS = 24 * 60 * 60 * 1000;
const FIVE_MINUTES_MS = 5 * 60 * 1000;

async function createPaymentQRCard(qrBuffer, { price, durationDays, transferContent, isExtend }) {
  const width = 1080;
  const height = 1380;
  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext("2d");

  const background = ctx.createLinearGradient(0, 0, width, height);
  background.addColorStop(0, "#07152f");
  background.addColorStop(0.5, "#102b5c");
  background.addColorStop(1, "#086f72");
  ctx.fillStyle = background;
  ctx.fillRect(0, 0, width, height);

  ctx.globalAlpha = 0.16;
  ctx.fillStyle = "#5ff7dc";
  ctx.beginPath();
  ctx.arc(930, 80, 300, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#6395ff";
  ctx.beginPath();
  ctx.arc(80, 1290, 360, 0, Math.PI * 2);
  ctx.fill();
  ctx.globalAlpha = 1;

  ctx.textAlign = "center";
  ctx.fillStyle = "#8ff9e9";
  ctx.font = `700 31px ${FONT_MAIN}`;
  ctx.fillText("THANH TOÁN DỊCH VỤ BOT", width / 2, 88);
  ctx.fillStyle = "#ffffff";
  ctx.font = `700 54px ${FONT_MAIN}`;
  ctx.fillText(isExtend ? "GIA HẠN BOT" : "KÍCH HOẠT BOT", width / 2, 155);
  ctx.fillStyle = "#c9d9f5";
  ctx.font = `26px ${FONT_MAIN}`;
  ctx.fillText("Quét mã bằng ứng dụng ngân hàng", width / 2, 202);

  ctx.shadowColor = "rgba(0,0,0,.35)";
  ctx.shadowBlur = 28;
  ctx.fillStyle = "#ffffff";
  ctx.beginPath();
  ctx.roundRect(135, 245, 810, 810, 48);
  ctx.fill();
  ctx.shadowBlur = 0;

  const qrImage = await loadImage(qrBuffer);
  ctx.drawImage(qrImage, 180, 290, 720, 720);

  ctx.fillStyle = "rgba(3,16,39,.72)";
  ctx.beginPath();
  ctx.roundRect(135, 1090, 810, 205, 34);
  ctx.fill();

  ctx.textAlign = "left";
  ctx.fillStyle = "#a9bedc";
  ctx.font = `24px ${FONT_MAIN}`;
  ctx.fillText("ĐỊNH MỨC", 180, 1140);
  ctx.fillStyle = "#ffffff";
  ctx.font = `700 39px ${FONT_MAIN}`;
  ctx.fillText(`${price.toLocaleString("vi-VN")}đ / ${durationDays} ngày`, 180, 1184);
  ctx.fillStyle = "#a9bedc";
  ctx.font = `22px ${FONT_MAIN}`;
  ctx.fillText("NỘI DUNG CHUYỂN KHOẢN", 180, 1230);
  ctx.fillStyle = "#66f2d8";
  ctx.font = `700 30px ${FONT_MAIN}`;
  ctx.fillText(transferContent, 180, 1270);

  ctx.textAlign = "center";
  ctx.fillStyle = "#d9e5f7";
  ctx.font = `22px ${FONT_MAIN}`;
  ctx.fillText("Giữ nguyên nội dung chuyển khoản để hệ thống tự động xác nhận", width / 2, 1340);

  return canvas.toBuffer("image/png");
}

/**
 * Gửi QR banking cho khách ngay sau khi QR login thành công
 */
async function sendPaymentQRToOwner(api, message, ownerId, isExtend = false, reminderText = "") {
  let qrPath = null;
  try {
    const { bankBin, bankAccount, price, durationDays } = PAYMENT_CONFIG;
    const transferContent = `BOTPAY ${ownerId}`;

    // Dùng mẫu QR thuần rồi đặt vào card riêng; vẫn không khóa số tiền để
    // người dùng có thể nạp tùy ý và hệ thống tự quy đổi số ngày.
    const qrUrl =
      `https://img.vietqr.io/image/${bankBin}-${bankAccount}-qr_only.png` +
      `?addInfo=${encodeURIComponent(transferContent)}&accountName=THUE%20BOT`;

    const res = await nodeFetch(qrUrl);
    if (!res.ok) throw new Error("VietQR không phản hồi");

    const qrBuffer = Buffer.from(await res.arrayBuffer());
    const buffer = await createPaymentQRCard(qrBuffer, {
      price,
      durationDays,
      transferContent,
      isExtend,
    });
    qrPath = path.join(tempDir, `pay_${randomIDTemp()}.png`);
    await fs.writeFile(qrPath, buffer);

    const title = isExtend ? "Thanh Toán Để Gia Hạn Bot" : "Thanh Toán Để Kích Hoạt Bot";

    const caption =
      (reminderText ? `${reminderText}\n\n` : "") +
      `💳 ${title.toUpperCase()}\n\n` +
      `💰 Định mức: ${price.toLocaleString("vi-VN")}đ / ${durationDays} ngày (Nạp tùy ý, bot tự quy đổi ngày)\n` +
      `📝 NỘI DUNG CK: ${transferContent}\n\n` +
      `⚡ Quét mã QR, tự điền số tiền và giữ NGUYÊN nội dung CK để bot tự động duyệt!`;

    if (message) {
      await sendMessageCompleteRequest(api, message, { caption, imagePath: qrPath }, TIME_TO_LIVE);
    } else {
      await api.sendMessage(
        { msg: caption, attachments: [qrPath] },
        String(ownerId),
        MessageType.DirectMessage
      );
    }
    return true;
  } catch (err) {
    console.error("[PaymentQR] Lỗi:", err.message);
    return false;
  } finally {
    if (qrPath) deleteFile(qrPath).catch(() => {});
  }
}

/**
 * Tự động phê duyệt bot khi webhook Sepay xác nhận nhận tiền
 */
export async function autoApproveByPayment(ownerId, payRef = "", receivedAmount = 0) {
  if (!botChildrenStore.has(ownerId)) {
    return { success: false, message: `Không tìm thấy bot ownerId=${ownerId}` };
  }

  const botData = botChildrenStore.get(ownerId);

  // Tính số ngày tương ứng với số tiền (Mặc định: 80k = 30 ngày)
  const basePrice = PAYMENT_CONFIG.price || 80000;
  const baseDays = PAYMENT_CONFIG.durationDays || 30;
  const actualAmount = receivedAmount > 0 ? receivedAmount : basePrice;

  const proportion = actualAmount / basePrice;
  const durationMs = proportion * (baseDays * 86400000);
  const actualDays = (durationMs / 86400000).toFixed(1);

  const wasActive = botData.status === "active" && botData.timeRemaining > 1000;

  // Mỗi lần thanh toán tạo một kỳ hạn mới tính ngay từ lúc nhận tiền.
  // Bot đang chạy không bị tắt; bot đã hết hạn vẫn chờ chủ bot bật lại.
  botData.timeRemaining = durationMs;
  botData.approvedAt = Date.now();
  botData.approvedBy = "AUTO_PAYMENT";
  botData.paymentRef = payRef;
  botData.status = wasActive ? "active" : "inactive";
  delete botData.renewalReminder1DaySent;
  delete botData.renewalReminder5MinSent;
  delete botData.rejectAt;
  delete botData.rejectBy;
  botChildrenStore.markDirty();
  botChildrenStore.saveIfDirty();

  // Gửi tin xác nhận cho owner
  try {
    const globalApi = getGlobalApi();
    const prefix = getGlobalPrefix(globalApi.getBotId());
    const expireDate = new Date(Date.now() + botData.timeRemaining).toLocaleDateString("vi-VN", {
      hour: "2-digit",
      minute: "2-digit",
    });

    await globalApi.sendMessage(
      {
        msg:
          `✅ Thanh toán thành công!\n\n` +
          `💰 Số tiền nhận: ${actualAmount.toLocaleString("vi-VN")}đ\n` +
          `⏳ Thời hạn mới từ hiện tại: ${actualDays} ngày\n` +
          `📅 Hết hạn: ${expireDate}\n` +
          `🧾 Mã GD: ${payRef || "N/A"}\n\n` +
          (wasActive
            ? `🤖 Bot vẫn đang hoạt động bình thường.`
            : `➤ Dùng lệnh ${prefix}mybot active để khởi chạy bot!`),
      },
      ownerId,
      MessageType.DirectMessage
    );
  } catch (e) {
    console.warn("[AutoApprove] Không gửi được tin:", e.message);
  }

  console.log(`[AutoApprove] ✅ ownerId=${ownerId} | ref=${payRef} | amount=${actualAmount}`);
  return { success: true, message: "Đã phê duyệt thành công" };
}

const botChildrenStore = new BotChildrenStore(MANAGER_BOTS_FILE_PATH);
botChildrenStore.load();
const TIME_TO_LIVE = 6000000;
const PERMANENT_TIME = -1;

schedule.scheduleJob("*/1 * * * * *", async () => {
  checkTimeRemainingBot();
});

schedule.scheduleJob("*/30 * * * * *", async () => {
  botChildrenStore.saveIfDirty();
});

export const getBotChildrenStore = () => botChildrenStore;

export const getDataBotChildren = () => botChildrenStore.getAll();

export const getDataBotFromOwnerCache = (owner) => botChildrenStore.get(owner);

async function checkTimeRemainingBot() {
  for (const [ownerId, botData] of Object.entries(botChildrenStore.getAll())) {
    if (botData.status === "active" && botData.timeRemaining > 0) {
      botData.timeRemaining -= 1000;

      if (botData.timeRemaining > ONE_DAY_MS) {
        if (botData.renewalReminder1DaySent || botData.renewalReminder5MinSent) {
          delete botData.renewalReminder1DaySent;
          delete botData.renewalReminder5MinSent;
        }
      } else if (botData.timeRemaining > 0 && botData.timeRemaining <= FIVE_MINUTES_MS) {
        if (!botData.renewalReminder5MinSent) {
          botData.renewalReminder5MinSent = Date.now();
          await sendPaymentQRToOwner(
            getGlobalApi(),
            null,
            ownerId,
            true,
            "⚠️ Bot của bạn chỉ còn khoảng 5 phút sử dụng và sẽ tự tắt nếu chưa gia hạn."
          );
        }
      } else if (!botData.renewalReminder1DaySent) {
        botData.renewalReminder1DaySent = Date.now();
        await sendPaymentQRToOwner(
          getGlobalApi(),
          null,
          ownerId,
          true,
          "⏰ Bot của bạn còn khoảng 1 ngày sử dụng. Gia hạn sớm để bot không bị gián đoạn."
        );
      }

      if (botData.timeRemaining <= 0) {
        botData.timeRemaining = 0;
        await shutdownBotByOwnerId(ownerId);
        await sendMessageResultRequest(
          getGlobalApi(),
          MessageType.DirectMessage,
          ownerId,
          "Bot đã bị tắt do hết hạn chạy bot, vui lòng liên hệ quản trị để gia hạn sử dụng!",
          true,
          TIME_TO_LIVE
        );
      }
      botChildrenStore.markDirty();
    }
  }
}

export async function startBotChildren(api, ownerId) {
  try {
    const dataBotChildren = botChildrenStore.get(ownerId);
    const apiBot = await createBot(dataBotChildren);
    dataBotChildren.status = "active";
    botChildrenStore.markDirty();
    dataBotChildren.idBot = apiBot.getBotId();
    dataBotChildren.nameBot = apiBot.accountInfo.name;
    dataBotChildren.avatarBot =
      apiBot.accountInfo.avatar || apiBot.accountInfo.avatarFull || dataBotChildren.avatarBot || null;
    // Việc bot con tìm bot chính qua số điện thoại chỉ dùng để
    // ánh xạ quyền quản trị. Zalo có thể trả "Không tìm thấy" khi hai
    // tài khoản chưa kết bạn; không được coi đó là lỗi đăng nhập
    // và tắt bot con đã khởi động thành công.
    try {
      const dataMainBot = await apiBot.findUserByPhone(api.getPhoneNumber());
      if (dataMainBot?.uid) {
        dataBotChildren.idBotMainWithBot = String(dataMainBot.uid);
        apiBot.apiManager.idBotMainWithBot = String(dataMainBot.uid);
      }
    } catch (error) {
      console.warn(
        `Bot con ${apiBot.getBotId()} không thể tìm bot chính qua số điện thoại: ` +
          (error?.message || String(error))
      );
      if (dataBotChildren.idBotMainWithBot) {
        apiBot.apiManager.idBotMainWithBot = String(dataBotChildren.idBotMainWithBot);
      }
    }
    const numberPhone = apiBot.getPhoneNumber();
    let dataOfBot;
    try {
      const numberPhone = apiBot.getPhoneNumber();
      dataBotChildren.numberPhone = numberPhone;
      // UID của bot con khác nhau tùy tài khoản Zalo đang tra cứu. Gjoin
      // chạy từ main bot nên phải lưu UID mà chính main bot nhìn thấy.
      dataOfBot = await api.findUserByPhone(numberPhone);
      if (dataOfBot?.uid) {
        dataBotChildren.idBotWithBotMain = String(dataOfBot.uid);
        apiBot.apiManager.idBotWithBotMain = String(dataOfBot.uid);
      }
    } catch (err) {
      console.error(`Có Lỗi Get Data Acc Bot Qua Số Điện Thoại ${numberPhone}\n`);
    }

    botChildrenStore.markDirty();
    return { dataOfBot, apiBot };
  } catch (error) {
    await shutdownBotByOwnerId(ownerId);
    throw error;
  }
}

async function checkActiveAllBot(api) {
  const result = { started: [], skipped: [], failed: [] };
  const entries = Object.entries(botChildrenStore.getAll());

  for (const [index, [ownerId, botData]] of entries.entries()) {
    const botLabel = botData.nameBot || botData.numberPhone || ownerId;
    try {
      if (getApiManagerWithOwner(ownerId)) {
        result.skipped.push({ index: index + 1, label: botLabel });
        continue;
      }

      await startBotChildren(api, ownerId);
      delete botData.lastStartError;
      delete botData.lastStartErrorAt;
      botChildrenStore.markDirty();
      result.started.push({ index: index + 1, label: botLabel });
    } catch (error) {
      // Một bot lỗi (thường do cookie hết hạn) không được làm dừng activeall.
      const reason = error?.message || String(error);
      botData.lastStartError = reason;
      botData.lastStartErrorAt = Date.now();
      botChildrenStore.markDirty();
      console.error(`[mybot activeall] Bot #${index + 1} (${ownerId}) lỗi: ${reason}`);
      result.failed.push({ index: index + 1, label: botLabel, reason });
    }
  }

  return result;
}

async function shutdownAllBot() {
  for (const [ownerId, botData] of Object.entries(botChildrenStore.getAll())) {
    await shutdownBotByOwnerId(ownerId);
  }
}

export async function activeBotChildren(api) {
  const grRqReset = await notifyResetCompleteInGroup(api);
  const statsBot = {
    totalBot: 0,
    totalBotActive: 0,
    totalBotInactive: 0,
    totalBotRunError: 0,
    totalBotPending: 0,
  };
  for (const [ownerId, botData] of Object.entries(botChildrenStore.getAll())) {
    statsBot.totalBot++;
    const apiManager = getApiManagerWithOwner(ownerId);
    const canRun = botData.timeRemaining > 0 || botData.timeRemaining === -1;

    if (botData.status === "active" && canRun) {
      if (apiManager) {
        // Bot đã được active từ trước cũng phải được tính vào thống kê.
        statsBot.totalBotActive++;
        continue;
      }
      try {
        await startBotChildren(api, ownerId);
        delete botData.lastStartError;
        delete botData.lastStartErrorAt;
        botChildrenStore.markDirty();
        statsBot.totalBotActive++;
      } catch (error) {
        const reason = error?.message || String(error);
        botData.lastStartError = reason;
        botData.lastStartErrorAt = Date.now();
        botChildrenStore.markDirty();
        console.error(`Có lỗi khi khởi động bot của ${ownerId}: ${reason}`);
        await shutdownBotByOwnerId(ownerId);

        // UID owner có thể không tồn tại trong phạm vi tài khoản bot chính
        // (Zalo trả về "Không tìm thấy"). Việc thông báo thất bại
        // không được phép thoát ra ngoài và làm sập toàn bộ bot chính.
        try {
          await sendMessageStatePrivate(
            api,
            ownerId,
            "Có lỗi xảy ra khi khởi động lại bot: " + reason,
            true,
            TIME_TO_LIVE
          );
        } catch (notifyError) {
          console.error(
            `Không thể gửi thông báo lỗi khởi động tới owner ${ownerId}: ` +
              (notifyError?.message || String(notifyError))
          );
        }

        // Ghi ngay trạng thái inactive/lastStartError. Nếu process gặp
        // sự cố khác trước lịch autosave 30 giây, bot lỗi sẽ không
        // bị thử khởi động lại vô hạn sau mỗi lần restart.
        botChildrenStore.saveIfDirty();
        statsBot.totalBotRunError++;
      }
    } else if (botData.lastStartError) {
      statsBot.totalBotRunError++;
    } else if (botData.status === "inactive" || !canRun) {
      statsBot.totalBotInactive++;
    } else if (botData.status === "pending") {
      statsBot.totalBotPending++;
    }
  }
  if (grRqReset && grRqReset.threadId) {
    const caption =
      "Thống kê hệ thống bot con:\n" +
      `• Tổng số bot: ${statsBot.totalBot}\n` +
      `• Bot đang hoạt động: ${statsBot.totalBotActive}\n` +
      `• Bot đã tắt: ${statsBot.totalBotInactive}\n` +
      `• Bot đang chờ phê duyệt: ${statsBot.totalBotPending}\n` +
      `• Bot có lỗi khi khởi chạy: ${statsBot.totalBotRunError}`;
    await sendMessageResultRequest(api, grRqReset.type, grRqReset.threadId, caption, true, 300000);
  }
}

export async function shutdownBotByOwnerId(ownerId) {
  const apiManager = getApiManagerWithOwner(ownerId);
  let hasShutdown = false;
  if (apiManager) {
    try {
      const api = apiManager.apiZalo;

      // Hủy cron của bot trước khi stop listener. Nếu không, các job cũ
      // vẫn còn sống trong node-schedule và lần restart tiếp theo sẽ đăng ký
      // thêm một bản nữa (sendtask bị gửi 2 lần).
      const schedules = api.apiInstance?.schedule || {};
      for (const job of Object.values(schedules)) {
        try {
          if (typeof job?.cancel === "function") job.cancel();
        } catch (error) {
          console.error(`[schedule] Không thể hủy job của bot ${ownerId}:`, error?.message || error);
        }
      }
      if (api.apiInstance?.schedule) api.apiInstance.schedule = {};
      api.listener.stop();
    } catch (error) {
      console.error(error);
    }
    deleteApiManager(apiManager.id);
    hasShutdown = true;
  } else {
    hasShutdown = false;
  }
  if (botChildrenStore.has(ownerId)) {
    botChildrenStore.get(ownerId).status = "inactive";
    botChildrenStore.markDirty();
  }
  return hasShutdown;
}

export async function handleManagerBot(api, message, aliasCommand, isAdminLevelHighest) {
  const botId = api.getBotId();
  const prefix = getGlobalPrefix(botId);
  const isMainBot = api.apiManager.isMainBot;
  const senderId = message.data.uidFrom;
  const senderName = message.data.dName;
  const content = removeMention(message)
    .replace(`${prefix + aliasCommand}`, "")
    .trim();

  const contentParts = content ? content.split(/\s+/) : [];
  const action = contentParts[0]?.toLowerCase() || "";
  const params = contentParts.slice(1);

  if (action === "gjoin" || action === "gleave") {
    await handleGroupBotsAction(api, message, action, params.join(" "));
    return;
  }

  if (action === "sendimck") {
    await handleSendImeiCookie(api, message, isAdminLevelHighest);
    return;
  }

  if (action === "github" || action === "pushcode") {
    if (!isMainBot || !isBotLeader(botId, senderId)) {
      await sendMessageWarning(api, message, "Chỉ Bot Leader của bot mẹ mới được dùng lệnh này!", false, TIME_TO_LIVE);
      return;
    }

    await sendMessageComplete(api, message, "Đang kiểm tra code và cập nhật GitHub...", false, TIME_TO_LIVE);
    const result = await updateSourceOnGithub(params.join(" "));
    const sendResult = result.ok ? sendMessageComplete : sendMessageWarning;
    await sendResult(api, message, result.message, false, TIME_TO_LIVE);
    return;
  }
  
  if (!isMainBot) {
    await handleNotifyParentOnPM(api, message);
    
    const ownerId = api.apiManager.ownerId;
    switch (action) {
      case "info":
        await handleInfoBot(api, message, ownerId);
        break;
      case "set":
        await handleSetInfoBot(api, message, params, ownerId, isAdminLevelHighest);
        break;
      case "detail":
        await handleDetailBot(api, message, ownerId);
        break;
      case "shutdown":
        if (!(await checkAdminLevelHighest(api, message, isAdminLevelHighest))) return;
        await sendMessageComplete(
          api,
          message,
          `Bot sẽ được tắt sau 5s...\n` +
            `Nếu bạn muốn khởi động lại tôi, vui lòng dùng lệnh mybot active với Bot Leader ${
              getGlobalApi().accountInfo.name
            }`,
          false,
          TIME_TO_LIVE
        );
        await shutdownBotByOwnerId(ownerId);
        break;
      case "restart":
        if (!(await checkAdminLevelHighest(api, message, isAdminLevelHighest))) return;
        await notifyResettingInGroup(api, message);
        await shutdownBotByOwnerId(ownerId);
        await new Promise((resolve) => setTimeout(resolve, 3000));
        await startBotChildren(getGlobalApi(), ownerId);
        break;
      case "style":
        if (!(await checkAdminLevelHighest(api, message, isAdminLevelHighest))) return;
        await handleStyleBot(api, message, params, aliasCommand, prefix);
        break;
      case "showinfo":
        await handleShowInfoBot(api, message, ownerId, aliasCommand, prefix);
        break;
      case "extend":
        await sendPaymentQRToOwner(api, message, ownerId, true);
        break;
      default:
        await handleHelpBotWithBotChildren(api, message, prefix, aliasCommand);
    }
    return;
  } else {
    const ownerId = botId;
    switch (action) {
      case "set":
        await handleSetInfoBot(api, message, params, ownerId, isAdminLevelHighest);
        return;
      case "style":
        if (!(await checkAdminLevelHighest(api, message, isAdminLevelHighest))) return;
        await handleStyleBot(api, message, params, aliasCommand, prefix);
        return;
      case "showinfo":
        await handleShowInfoBot(api, message, ownerId, aliasCommand, prefix);
        return;
    }
  }

  if (!content) {
    let caption =
      "╭───  NGHUNG BOT CENTER  ───╮\n" +
      "│  Quản lý bot nhanh & an toàn\n" +
      "╰────────────────────────╯\n\n" +
      "🚀  KHỞI TẠO BOT\n" +
      `┌  ${prefix + aliasCommand} qrlogin\n` +
      "└  Đăng nhập nhanh bằng mã QR\n\n" +
      `┌  ${prefix + aliasCommand} create <imei> <cookie>\n` +
      "└  Tạo hoặc cập nhật bot thủ công\n\n" +
      "🎨  TÙY CHỈNH GIAO DIỆN\n" +
      `┌  ${prefix + aliasCommand} style\n` +
      "└  Đổi màu, cỡ chữ, kiểu chữ và reaction\n\n" +
      "📚  TRỢ GIÚP\n" +
      `┌  ${prefix + aliasCommand} help\n` +
      "└  Xem toàn bộ hướng dẫn quản lý\n\n" +
      "🔐 Cookie chỉ nên gửi trong tin nhắn riêng.";

    if (isAdminLevelHighest) {
      caption +=
        `\n\n🛡️  QUẢN TRỊ\n┌  ${prefix + aliasCommand} manager\n└  Mở bảng lệnh quản trị hệ thống`;
    }

    await sendMessageComplete(api, message, caption, false, TIME_TO_LIVE);
    return;
  }

  let ownerId = senderId;
  let index = 0;

  if (
    isMainBot &&
    isAdminLevelHighest &&
    params.length > 0 &&
    [
      "active",
      "approve",
      "addtime",
      "subtime",
      "settime",
      "reject",
      "restart",
      "shutdown",
      "detail",
      "info",
      "set",
      "remove",
      "notifypm",
    ].includes(action)
  ) {
    index = parseInt(params[0]) - 1;
    const botIds = Object.keys(botChildrenStore.getAll());
    if (!isNaN(index)) {
      if (index >= 0 && index < botIds.length) {
        ownerId = botIds[index];
      } else {
        await sendMessageWarning(
          api,
          message,
          "Index bot không hợp lệ, phải nằm trong vùng từ 1 đến " + botIds.length + "!"
        );
        return;
      }
    } else {
      await sendMessageWarning(api, message, "Vui lòng nhập index bot từ 1 đến " + botIds.length + " để kiểm tra!");
      return;
    }
  } else {
    index = -1;
    ownerId = senderId;
  }

  if (
    isMainBot &&
    ownerId === botId &&
    index === -1 &&
    ["active", "restart", "shutdown", "approve", "reject", "addtime", "subtime", "settime", "remove"].includes(action)
  ) {
    const caption = `Vui lòng nhập thêm index cần hành động với lệnh "${aliasCommand + " " + action}"!`;
    await sendMessageWarning(api, message, caption);
    return;
  }

  switch (action) {
    case "qrlogin":
      await handleCreateBotWithQR(api, message, ownerId, senderName);
      break;

    case "create":
      await handleCreateInfoBot(api, message, params, ownerId, senderName);
      break;

    case "active":
      await handleActiveBot(api, message, ownerId, isAdminLevelHighest);
      break;

    case "restart":
      await handleRestartBot(api, message, ownerId);
      break;

    case "shutdown":
      await handleShutdownBot(api, message, ownerId);
      break;

    case "approve":
      await handleApproveBot(api, message, params, prefix, aliasCommand, isAdminLevelHighest);
      break;

    case "addtime":
      await handleAddTimeBot(api, message, params, prefix, aliasCommand, isAdminLevelHighest);
      break;

    case "subtime":
      await handleSubtractTimeBot(api, message, params, prefix, aliasCommand, isAdminLevelHighest);
      break;

    case "settime":
      await handleSetTimeBot(api, message, params, prefix, aliasCommand, isAdminLevelHighest);
      break;

    case "reject":
      await handleRejectBot(api, message, ownerId, isAdminLevelHighest);
      break;

    case "remove":
      await handleRemoveBot(api, message, ownerId, isAdminLevelHighest);
      break;

    case "list":
      await handleListBot(api, message);
      break;

    case "detail":
      await handleDetailBot(api, message, ownerId);
      break;

    case "load":
      botChildrenStore.load();
      await sendMessageComplete(api, message, "Đã Load Lại Data Manager Bot Thành Công", false, 300000);
      break;

    case "activeall":
      if (!(await checkAdminLevelHighest(api, message, isAdminLevelHighest))) return;
      {
        const result = await checkActiveAllBot(api);
        const lines = [
          `✅ Đã xử lý ${result.started.length + result.skipped.length + result.failed.length} bot`,
          `🚀 Bật mới: ${result.started.length}`,
          `ℹ️ Đang chạy: ${result.skipped.length}`,
          `❌ Lỗi: ${result.failed.length}`,
        ];
        if (result.failed.length) {
          lines.push("", "Chi tiết bot lỗi:");
          for (const bot of result.failed) {
            lines.push(`• #${bot.index} ${bot.label}: ${bot.reason}`);
          }
        }
        await sendMessageComplete(api, message, lines.join("\n"), false, 300000);
      }
      break;

    case "shutdownall":
      if (!(await checkAdminLevelHighest(api, message, isAdminLevelHighest))) return;
      await shutdownAllBot();
      await sendMessageComplete(api, message, "Đã Tắt Toàn Bộ Bot", false, 300000);
      break;

    case "help":
      await handleHelpBot(api, message, prefix, aliasCommand, isAdminLevelHighest);
      break;

    case "manager":
      await handleManagerCommands(api, message, prefix, aliasCommand, isAdminLevelHighest);
      break;

    case "info":
      await handleInfoBot(api, message, ownerId);
      break;

    case "set":
      await handleSetInfoBot(api, message, params, ownerId, isAdminLevelHighest);
      break;

    case "notify":
      await handleNotifyCustomer(api, message, params, isAdminLevelHighest);
      break;

    case "blockcmd":
      await handleBlockCommand(api, message, params, prefix, aliasCommand, isAdminLevelHighest);
      break;

    case "notifypm":
      await handleNotifyPM(api, message, params, prefix, aliasCommand, isAdminLevelHighest);
      break;

    default:
      await sendMessageComplete(api, message, `Lệnh không hợp lệ,.. chat "${prefix + aliasCommand}" để xem hướng dẫn!`);
  }
}

function resolveGroupBotTargets(selector) {
  const botEntries = Object.entries(botChildrenStore.getAll());
  if (!selector) {
    return { error: "Thiếu index bot. Dùng: mybot gjoin <index|all> hoặc mybot gleave <index|all>" };
  }

  if (selector.toLowerCase() === "all") {
    return { targets: botEntries };
  }

  const indexes = selector.split(",").map((value) => value.trim()).filter(Boolean);
  if (indexes.length === 0 || indexes.some((value) => !/^\d+$/.test(value))) {
    return { error: "Index không hợp lệ. Ví dụ: mybot gjoin 1,2,4 hoặc mybot gjoin all" };
  }

  const targets = [];
  const seen = new Set();
  for (const value of indexes) {
    const index = Number(value) - 1;
    if (index < 0 || index >= botEntries.length) {
      return { error: `Index bot không hợp lệ, chỉ từ 1 đến ${botEntries.length}!` };
    }
    if (!seen.has(index)) {
      seen.add(index);
      targets.push(botEntries[index]);
    }
  }

  return { targets };
}

function invitationContainsGroup(value, groupId, parentKey = "") {
  if (!value || typeof value !== "object") return false;
  if (Array.isArray(value)) return value.some((item) => invitationContainsGroup(item, groupId, parentKey));

  for (const [key, child] of Object.entries(value)) {
    const normalizedKey = key.toLowerCase();
    if (
      ["groupid", "grid", "gid", "group_id", "id"].includes(normalizedKey) &&
      child != null &&
      String(child) === String(groupId)
    ) {
      return true;
    }
    if (child && typeof child === "object" && invitationContainsGroup(child, groupId, normalizedKey)) {
      return true;
    }
  }

  return false;
}

async function acceptGroupInviteForBot(childApi, groupId) {
  if (!childApi?.getGroupInvitationList || !childApi?.joinGroupInviteBox) return false;

  // Lời mời có thể xuất hiện trễ hơn lời gọi invite vài giây.
  for (let attempt = 0; attempt < 6; attempt++) {
    if (attempt > 0) await new Promise((resolve) => setTimeout(resolve, 1000));
    try {
      const invitations = await childApi.getGroupInvitationList();
      if (!invitationContainsGroup(invitations, groupId)) continue;
      await childApi.joinGroupInviteBox(String(groupId));
      return true;
    } catch (error) {
      console.warn(`[mybot gjoin] Bot con chưa thể tự chấp nhận lời mời:`, error?.message || error);
    }
  }

  return false;
}

async function joinGroupByLinkForBot(childApi, groupLink) {
  if (!childApi?.joinGroup || !groupLink) return { joined: false, pending: false };
  try {
    await childApi.joinGroup(groupLink);
    return { joined: true, pending: false };
  } catch (error) {
    return {
      joined: false,
      pending: String(error?.message || error).includes("Waiting for approve"),
    };
  }
}

async function handleGroupBotsAction(api, message, action, selector) {
  const senderId = message.data?.uidFrom;
  if (!api.apiManager?.isMainBot || !isBotLeader(api.getBotId(), senderId)) {
    await sendMessageWarning(api, message, "Chỉ Bot Leader mới được sử dụng lệnh này!", false, TIME_TO_LIVE);
    return;
  }

  if (message.type !== MessageType.GroupMessage) {
    await sendMessageWarning(api, message, "Lệnh này chỉ dùng trong nhóm cần thao tác!", false, TIME_TO_LIVE);
    return;
  }

  const result = resolveGroupBotTargets(selector?.replace(/\s*,\s*/g, ",").trim());
  if (result.error) {
    await sendMessageWarning(api, message, result.error, false, TIME_TO_LIVE);
    return;
  }

  const groupId = String(message.threadId);
  const targets = result.targets;
  if (action === "gjoin") {
    const inviteIds = [];
    for (const [, botData] of targets) {
      let botIdInMain = botData?.idBotWithBotMain;

      // Dữ liệu bot đã chạy từ trước có thể chưa có UID theo main bot; tra
      // bổ sung ngay lúc gjoin để không bắt buộc người dùng khởi động lại bot.
      if (!botIdInMain && botData?.numberPhone) {
        try {
          const profile = await api.findUserByPhone(String(botData.numberPhone));
          botIdInMain = profile?.uid ? String(profile.uid) : null;
          if (botIdInMain) {
            botData.idBotWithBotMain = botIdInMain;
            botChildrenStore.markDirty();
          }
        } catch (error) {
          console.warn(`[mybot gjoin] Không tra được UID bot ${botData.nameBot || botData.idBot}:`, error?.message || error);
        }
      }

      if (botIdInMain) inviteIds.push(botIdInMain);
    }

    if (inviteIds.length === 0) {
      await sendMessageWarning(
        api,
        message,
        "Không tìm được UID bot con trong danh bạ của main bot. Hãy khởi động lại bot con rồi thử lại!",
        false,
        TIME_TO_LIVE
      );
      return;
    }

    try {
      await api.addUserToGroup(groupId, inviteIds);
      await sendMessageComplete(
        api,
        message,
        `✅ Đã gửi lời mời ${inviteIds.length} bot vào nhóm này.`,
        false,
        TIME_TO_LIVE
      );
    } catch (error) {
      if (String(error?.message || error).includes("MAX_QUOTA_INVITE_STRANGER_PHONEID")) {
        try {
          const groupLinkData = await api.getLinkGroupByID(groupId);
          const groupLink = groupLinkData?.link;
          if (!groupLink) throw new Error("Nhóm chưa bật link tham gia");

          const linkResults = await Promise.all(
            targets.map(async ([ownerId]) => {
              const childApi = getApiManagerWithOwner(ownerId)?.apiZalo;
              return joinGroupByLinkForBot(childApi, String(groupLink).startsWith("http") ? groupLink : `https://${groupLink}`);
            })
          );
          const joinedCount = linkResults.filter((result) => result.joined).length;
          const pendingCount = linkResults.filter((result) => result.pending).length;
          if (joinedCount > 0 || pendingCount > 0) {
            await sendMessageComplete(
              api,
              message,
              `⚠️ Zalo đã giới hạn mời UID lạ. Đã chuyển sang mời bằng link: ${joinedCount} bot vào ngay` +
                (pendingCount ? `, ${pendingCount} bot đang chờ duyệt.` : "."),
              false,
              TIME_TO_LIVE
            );
            return;
          }
          throw new Error("Không có bot con nào tham gia được bằng link");
        } catch (linkError) {
          await sendMessageWarning(
            api,
            message,
            `Zalo đã chặn quota mời tài khoản lạ. ${linkError?.message || linkError}. Hãy bật link nhóm hoặc kết bạn các bot con với main bot rồi thử lại.`,
            false,
            TIME_TO_LIVE
          );
          return;
        }
      }
      if (String(error?.message || error).includes("Waiting for approve")) {
        const joinResults = await Promise.all(
          targets.map(async ([ownerId, botData]) => {
            const botIdInMain = botData?.idBotWithBotMain;
            if (!botIdInMain || !inviteIds.includes(String(botIdInMain))) return false;
            const childApi = getApiManagerWithOwner(ownerId)?.apiZalo;
            return acceptGroupInviteForBot(childApi, groupId);
          })
        );
        const joinedCount = joinResults.filter(Boolean).length;
        if (joinedCount > 0) {
          await sendMessageComplete(
            api,
            message,
            `✅ Đã gửi lời mời và tự chấp nhận cho ${joinedCount}/${inviteIds.length} bot con.`,
            false,
            TIME_TO_LIVE
          );
          return;
        }
        await sendMessageWarning(
          api,
          message,
          `Đã gửi lời mời ${inviteIds.length} bot con, nhưng đang chờ bot con chấp nhận. Hãy thử lại sau vài giây nếu chưa vào nhóm.`,
          false,
          TIME_TO_LIVE
        );
        return;
      }
      await sendMessageWarning(api, message, `Không thể mời bot vào nhóm: ${error?.message || error}`, false, TIME_TO_LIVE);
    }
    return;
  }

  let success = 0;
  let skipped = 0;
  for (const [ownerId] of targets) {
    const childManager = getApiManagerWithOwner(ownerId);
    const childApi = childManager?.apiZalo;
    if (!childApi) {
      skipped++;
      continue;
    }

    try {
      await childApi.leaveGroup(groupId, true);
      success++;
      await new Promise((resolve) => setTimeout(resolve, 400));
    } catch (error) {
      skipped++;
      console.error(`[mybot gleave] Không thể cho bot ${ownerId} rời nhóm:`, error?.message || error);
    }
  }

  await sendMessageComplete(
    api,
    message,
    `✅ Đã cho ${success} bot rời nhóm${skipped ? `, bỏ qua ${skipped} bot chưa chạy/lỗi` : ""}.`,
    false,
    TIME_TO_LIVE
  );
}

async function handleDetailBot(api, message, ownerId) {
  if (!botChildrenStore.has(ownerId)) {
    await sendMessageWarning(api, message, "Bot không tồn tại!", true, TIME_TO_LIVE);
    return;
  }

  const botData = botChildrenStore.get(ownerId);
  const apiManager = getApiManagerWithOwner(ownerId);
  const isRunning = !!apiManager;

  let botName = botData.nameBot || "Chưa xác định";
  if (isRunning) {
    botName = apiManager.apiZalo.accountInfo.name;
  }

  let timeRemaining;
  let expireDateText = "";
  if (botData.timeRemaining === PERMANENT_TIME) {
    timeRemaining = "♾️ Vô thời hạn";
  } else if (botData.timeRemaining <= 0) {
    timeRemaining = "⏰ Hết hạn";
  } else {
    timeRemaining = `⏳ Thời hạn còn: ${formatSeconds(Math.floor(botData.timeRemaining / 1000))}`;
    const expiredAt = new Date(Date.now() + botData.timeRemaining);
    expireDateText = `📅 Ngày hết hạn: ${expiredAt.toLocaleString("vi-VN")}`;
  }
  const expireDateLine = expireDateText ? `${expireDateText}\n` : "";

  let statusEmoji;
  switch (botData.status) {
    case "active":
      statusEmoji = "🟢";
      break;
    case "inactive":
      statusEmoji = "🔴";
      break;
    case "pending":
      statusEmoji = "🟡";
      break;
    case "reject":
      statusEmoji = "⛔";
      break;
    default:
      statusEmoji = "⚪";
  }

  const createdDate = new Date(botData.createdAt).toLocaleString("vi-VN");
  const approvedDate = botData.approvedAt
    ? new Date(botData.approvedAt).toLocaleString("vi-VN")
    : "Chưa được phê duyệt";

  const idAdmin = botData.approvedBy || botData.rejectBy;
  const idOwner = botData.ownerId;
  const listIdGet = [idAdmin, idOwner].filter((id) => id);
  const userInfoData = await getUsersInfoBasic(getGlobalApi(), listIdGet).catch(() => ({}));

  const runningAccount = apiManager?.apiZalo?.accountInfo || null;
  const ownerProfile = userInfoData[idOwner] || {};
  const ownerName =
    ownerProfile.zaloName ||
    ownerProfile.displayName ||
    botData.infoOwner?.name ||
    botData.createdBy ||
    idOwner;
  const adminName = userInfoData[idAdmin]?.zaloName || "Hệ thống";
  const ownerAvatar =
    runningAccount?.avatar ||
    runningAccount?.avatarFull ||
    botData.avatarBot ||
    ownerProfile.avatar ||
    ownerProfile.avatarFull ||
    null;
  const infoOwner = botData.infoOwner || {};

  const overviewFields = [
    { label: "Tên", value: ownerName, color: "#00e0ff" },
    { label: "Bot Đang Chạy", value: botName, color: "#00e0ff" },
    { label: "Tên Đại Diện Bot", value: infoOwner.nameServer || "Chưa cập nhật", color: "#ff00ff" },
    { label: "ID Owner", value: ownerId, color: "#ff00ff" },
    { label: "Trạng Thái Bot", value: botData.status.toUpperCase(), color: "#57ff57" },
    { label: "Đang Chạy", value: isRunning ? "Có" : "Không", color: "#57ff57" },
    { label: "Thời Hạn Còn", value: timeRemaining.replace(/^\S+\s*/u, ""), color: "#ffb020" },
    { label: "Ngày Hết Hạn", value: expireDateText ? expireDateText.replace(/^\S+\s*/u, "") : "N/A", color: "#ffb020" },
  ];

  const registrationFields = [
    { label: "Người Tạo", value: ownerName, color: "#00e0ff" },
    { label: "Ngày Tạo", value: createdDate, color: "#00e0ff" },
    { label: "Thời Gian Xem Xét", value: approvedDate, color: "#ff00ff" },
    {
      label: "Phê Duyệt Bởi",
      value: botData.approvedBy || botData.rejectBy ? adminName : "Chưa có",
      color: "#ff00ff",
    },
    { label: "Nền Tảng Đăng Nhập", value: infoOwner.typePlatform || "web", color: "#57ff57" },
  ];

  if (botData.rejectAt) {
    registrationFields.push({
      label: "Bị Từ Chối Vào",
      value: new Date(botData.rejectAt).toLocaleString("vi-VN"),
      color: "#ff3b3b",
    });
  }

  const extraFields = [
    { label: "Giới Thiệu", value: infoOwner.description || "Chưa cập nhật", color: "#00e0ff" },
    { label: "Thông Tin Bot", value: infoOwner.botInfo || "Chưa cập nhật", color: "#ff00ff" },
  ];

  let imagePath;
  try {
    imagePath = await createManagerBotInfoImage({
      title: "Thông Tin Chi Tiết Bot",
      avatar: ownerAvatar,
      overviewFields,
      registrationFields,
      extraFields,
    });

    await sendMessageCompleteRequest(api, message, { caption: "", imagePath }, TIME_TO_LIVE);
  } catch (error) {
    console.error("Lỗi khi tạo ảnh chi tiết bot:", error);
    await sendMessageWarning(
      api,
      message,
      "Có lỗi xảy ra khi tạo ảnh chi tiết bot: " + error.message,
      true,
      TIME_TO_LIVE
    );
  } finally {
    if (imagePath) deleteFile(imagePath).catch(() => {});
  }
}
async function handleCreateBotWithQR(api, message, ownerId, senderName) {
  const botId = api.getBotId();
  const prefix = getGlobalPrefix(botId);
  const isAdminAskCommand = ownerId === botId;

  if (isAdminAskCommand) ownerId = message.threadId;

  try {
    const dataLogin = await handleGetCookieImeiByQR(api, message);
    if (dataLogin) {
      const { imei, cookie } = dataLogin;
      let dataBotChildren = botChildrenStore.get(ownerId);
      if (!dataBotChildren) {
        dataBotChildren = {
          ownerId,
          imei,
          cookie,
          userAgent:
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36",
          timeRemaining: 0,
          status: "pending",
          createdAt: Date.now(),
          createdBy: senderName,
          infoOwner: {
            name: senderName,
            description: "",
            botInfo: "",
            nameServer: "",
            typePlatform: "web",
          },
        };
        await sendMessageComplete(
          api,
          message,
          `Đã gửi yêu cầu đăng ký bot mới. ${
            isAdminAskCommand
              ? "Có thể phê duyệt để có thể tiến hành kích hoạt bot"
              : "Vui lòng thông báo cho quản trị cấp cao để được phê duyệt"
          }!`,
          true,
          TIME_TO_LIVE
        );

        botChildrenStore.set(ownerId, dataBotChildren);
        botChildrenStore.markDirty();

        // Tự động gửi QR banking ngay sau khi login thành công
        await sendPaymentQRToOwner(api, message, ownerId);
      } else {
        // Đổi tài khoản/IMEI chỉ thay thông tin đăng nhập; không được làm mất
        // thời hạn đã được duyệt trước đó.
        const previousTimeRemaining = dataBotChildren.timeRemaining;
        const apiManager = getApiManagerWithOwner(ownerId);

        if (apiManager) {
          await shutdownBotByOwnerId(ownerId);
          const captionTemp = `Đã kết thúc phiên bot ${apiManager.apiZalo.accountInfo.name}!`;
          await sendMessageComplete(api, message, captionTemp, true, TIME_TO_LIVE);
        }

        dataBotChildren.cookie = cookie;
        dataBotChildren.imei = imei;
        dataBotChildren.createdAt = Date.now();
        dataBotChildren.createdBy = senderName;
        dataBotChildren.timeRemaining = previousTimeRemaining;
        const timeRemaining = dataBotChildren.timeRemaining;
        await sendMessageComplete(
          api,
          message,
          `Cập nhật dữ liệu thành công, ${
            timeRemaining > 0
              ? `➤ Dùng lệnh ${prefix}mybot active để khởi chạy bot`
              : isAdminAskCommand
              ? "bot đã hết hạn kích hoạt, quản trị hãy gia hạn lại để có thể kích hoạt bot này"
              : "vui lòng liên hệ quản trị để gia hạn mới có thể kích hoạt bot"
          }!`,
          true,
          TIME_TO_LIVE
        );
      }

      botChildrenStore.markDirty();
    }
  } catch (error) {
    await sendMessageWarning(api, message, `Có lỗi xảy ra: ` + (error.message || error.error), false, TIME_TO_LIVE);
  }
}

async function handleCreateInfoBot(api, message, params, ownerId, senderName) {
  if (message.type !== MessageType.DirectMessage) {
    await sendMessageWarning(api, message, "Vui lòng sử dụng lệnh này trong tin nhắn riêng!", true, TIME_TO_LIVE);
    return;
  }

  const botId = api.getBotId();
  const prefix = getGlobalPrefix(botId);
  const isAdminAskCommand = ownerId === botId;

  let caption =
    "Hướng dẫn dùng thao tác create bot:\n" +
    `${prefix}mybot create imei cookie\n` +
    ` => Trong đó: \n` +
    ` => imei và cookie cách nhau giấu cách\n` +
    ` => imei là 1 chuỗi ký tự dài\n` +
    ` => cookie là 1 chuỗi có dạng {"url": "https://chat.zalo.me","cookies": [{"domain": ".chat.zalo.me","expirationDate":123456,"hostOnly": false,"httpOnly": true,"name": "zpw_sek","path": "/","sameSite": "lax","secure": true,"session": false,"storeId": "0","value": "abcdxyz"}]}`;

  if (params.length < 2) {
    await sendMessageWarning(api, message, caption, false, TIME_TO_LIVE);
    return;
  }

  if (isAdminAskCommand) ownerId = message.threadId;

  try {
    let [imei, ...cookieParts] = params;
    let cookie = cookieParts.join(" ");
    const jsonCookie = deepParseJSON(cookie);
    let dataBotChildren = botChildrenStore.get(ownerId);

    if (!dataBotChildren) {
      dataBotChildren = {
        ownerId,
        imei,
        cookie: jsonCookie,
        userAgent:
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36",
        timeRemaining: 0,
        status: "pending",
        createdAt: Date.now(),
        createdBy: senderName,
        infoOwner: {
          name: senderName,
          description: "",
          botInfo: "",
          nameServer: "",
          typePlatform: "web",
        },
      };
      await sendMessageComplete(
        api,
        message,
        `Đã gửi yêu cầu đăng ký bot mới. ${
          isAdminAskCommand
            ? "Có thể phê duyệt để có thể tiến hành kích hoạt bot"
            : "Vui lòng thông báo cho quản trị cấp cao để được phê duyệt"
        }!`,
        true,
        TIME_TO_LIVE
      );
      botChildrenStore.set(ownerId, dataBotChildren);
    } else {
      // Cập nhật cookie/IMEI không phải là đăng ký bot mới, nên giữ nguyên
      // thời hạn cũ để khách chỉ cần chạy lại lệnh active.
      const previousTimeRemaining = dataBotChildren.timeRemaining;
      const apiManager = getApiManagerWithOwner(ownerId);

      if (apiManager) {
        await shutdownBotByOwnerId(ownerId);
        const captionTemp = `Đã kết thúc phiên bot ${apiManager.apiZalo.accountInfo.name}!`;
        await sendMessageComplete(api, message, captionTemp, true, TIME_TO_LIVE);
      }

      dataBotChildren.cookie = jsonCookie;
      dataBotChildren.imei = imei;
      dataBotChildren.createdAt = Date.now();
      dataBotChildren.createdBy = senderName;
      dataBotChildren.timeRemaining = previousTimeRemaining;
      const timeRemaining = dataBotChildren.timeRemaining;
      await sendMessageComplete(
        api,
        message,
        `Cập nhật dữ liệu thành công, ${
            timeRemaining > 0
            ? `➤ Dùng lệnh ${prefix}mybot active để khởi chạy bot`
            : isAdminAskCommand
            ? "bot đã hết hạn kích hoạt, quản trị hãy gia hạn lại để có thể kích hoạt bot này"
            : "vui lòng liên hệ quản trị để gia hạn mới có thể kích hoạt bot"
        }!`,
        true,
        TIME_TO_LIVE
      );
    }
    botChildrenStore.markDirty();
  } catch (error) {
    console.error("Lỗi khi tạo bot:", error);
    await sendMessageWarning(api, message, caption, false, TIME_TO_LIVE);
  }
}

async function handleActiveBot(api, message, ownerId, isAdminLevelHighest) {
  const dataBot = botChildrenStore.get(ownerId);
  
  const isAdmin = !!isAdminLevelHighest;
  const notExistMsg = isAdmin
    ? "Bot không tồn tại!"
    : "Bạn chưa đăng ký bot, vui lòng dùng lệnh với cú pháp create để đăng ký!";
  const pendingMsg = isAdmin
    ? "Bot chưa được phê duyệt, vui lòng phê duyệt bot và cấp hạn sử dụng để có thể kích hoạt chạy bot!"
    : "Bot chưa được phê duyệt, vui lòng liên hệ admin để phê duyệt bot!";
  const expiredMsg = isAdmin
    ? "Bot đã hết hạn sử dụng, vui lòng phê duyệt và cấp lại thời hạn sử dụng mới cho bot!"
    : "Bot đã hết hạn sử dụng, vui lòng liên hệ admin để gia hạn!";

  if (!dataBot) {
    await sendMessageWarning(api, message, notExistMsg, true, TIME_TO_LIVE);
    return false;
  }

  if (dataBot.status === "pending") {
    await sendMessageWarning(api, message, pendingMsg, true, TIME_TO_LIVE);
    return false;
  }

  if (dataBot.timeRemaining !== -1 && dataBot.timeRemaining <= 1000) {
    await sendMessageWarning(api, message, expiredMsg, true, TIME_TO_LIVE);
    return false;
  }

  if (getApiManagerWithOwner(ownerId)) {
    await sendMessageWarning(api, message, "Bot đang được khởi chạy!", true, TIME_TO_LIVE);
    return false;
  }

  try {
    await sendMessageComplete(api, message, `Đang khởi chạy bot...`, false, TIME_TO_LIVE);

    const { apiBot } = await startBotChildren(api, ownerId);

    const remainingTime =
      dataBot.timeRemaining === PERMANENT_TIME
        ? "vô thời hạn"
        : formatSeconds(Math.floor(dataBot.timeRemaining / 1000));

    await sendMessageComplete(
      api,
      message,
      `Khởi chạy bot thành công!` +
        `\nTài khoản hoạt động: ${apiBot.accountInfo.name}` +
        `\nID tài khoản: ${dataBot?.uid || ownerId}` +
        `\nThời hạn còn lại: ${remainingTime}`,
      true,
      TIME_TO_LIVE
    );
    return true;
  } catch (error) {
    await sendMessageWarning(api, message, "Có lỗi xảy ra khi khởi chạy bot: " + error.message, true, TIME_TO_LIVE);
    return false;
  }
}

async function handleRestartBot(api, message, ownerId) {
  const dataBotChildren = botChildrenStore.get(ownerId);
  if (!dataBotChildren) {
    await sendMessageWarning(api, message, "Bot không tồn tại!", true, TIME_TO_LIVE);
    return;
  }

  if (!getApiManagerWithOwner(ownerId)) {
    await sendMessageWarning(api, message, "Bot chưa được khởi chạy!", true, TIME_TO_LIVE);
    return;
  }

  await sendMessageComplete(api, message, `Đang khởi động lại bot...`);

  await shutdownBotByOwnerId(ownerId);
  await new Promise((resolve) => setTimeout(resolve, 3000));
  const { dataOfBot, apiBot } = await startBotChildren(api, ownerId);

  await sendMessageComplete(
    api,
    message,
    `Khởi động lại bot thành công!` +
      `\nTài khoản hoạt động: ${apiBot.accountInfo.name}` +
      `\nID tài khoản: ${dataOfBot?.uid || ownerId}`,
    true,
    TIME_TO_LIVE
  );
}

async function handleShutdownBot(api, message, ownerId) {
  const dataBotChildren = botChildrenStore.get(ownerId);
  if (!dataBotChildren) {
    await sendMessageWarning(api, message, "Bot không tồn tại!", true, TIME_TO_LIVE);
    return;
  }

  const apiManager = getApiManagerWithOwner(ownerId);

  if (!apiManager) {
    await sendMessageWarning(api, message, "Bot chưa được khởi chạy!", true, TIME_TO_LIVE);
    return;
  }

  await shutdownBotByOwnerId(ownerId);
  botChildrenStore.markDirty();

  await sendMessageComplete(
    api,
    message,
    `Đã tắt bot ${apiManager.apiZalo.accountInfo.name} thành công!`,
    true,
    TIME_TO_LIVE
  );
}

async function handleApproveBot(api, message, params, prefix, aliasCommand, isAdminLevelHighest) {
  if (!(await checkAdminLevelHighest(api, message, isAdminLevelHighest))) return;

  if (params.length < 2) {
    await sendMessageWarning(
      api,
      message,
      `Cú pháp không đúng!\nVui lòng sử dụng: ${prefix}${aliasCommand} approve [ID/index] [thời hạn]\n` +
        `Ví dụ: ${prefix}${aliasCommand} approve 1 24h hoặc ${prefix}${aliasCommand} approve 1 -1 (vô hạn)`
    );
    return;
  }

  const [botIdentifier, timeStr] = params;

  let timeInMs;
  if (timeStr === "-1") {
    timeInMs = PERMANENT_TIME;
  } else {
    timeInMs = parseTime(timeStr, 0);
  }

  if (timeInMs !== PERMANENT_TIME && timeInMs <= 0) {
    await sendMessageWarning(
      api,
      message,
      "Thời hạn không hợp lệ!\n" +
        "Định dạng: số + đơn vị\n" +
        "Đơn vị: s (giây), m (phút), h (giờ), d (ngày)\n" +
        "Ví dụ: 30s, 15m, 24h, 7d hoặc -1 (vô hạn)"
    );
    return;
  }

  let botToApprove = botIdentifier;
  if (!isNaN(parseInt(botIdentifier))) {
    const index = parseInt(botIdentifier) - 1;
    const botIds = Object.keys(botChildrenStore.getAll());
    if (index >= 0 && index < botIds.length) {
      botToApprove = botIds[index];
    }
  }

  if (!botChildrenStore.has(botToApprove)) {
    await sendMessageWarning(api, message, "ID/Index không hợp lệ hoặc bot chưa được đăng ký!");
    return;
  }

  await shutdownBotByOwnerId(botToApprove);
  const dataBotChildren = botChildrenStore.get(botToApprove);
  dataBotChildren.timeRemaining = timeInMs; // -1 tự động sẽ là PERMANENT_TIME
  dataBotChildren.approvedAt = Date.now();
  dataBotChildren.approvedBy = message.data.uidFrom;
  dataBotChildren.status = "inactive";
  delete dataBotChildren.rejectAt;
  delete dataBotChildren.rejectBy;
  botChildrenStore.markDirty();

  const timeDisplay = timeInMs === PERMANENT_TIME ? "vô thời hạn" : formatSeconds(Math.floor(timeInMs / 1000));

  await sendMessageComplete(
    api,
    message,
    `Đã phê duyệt bot ${botToApprove} thành công!\nThời hạn sử dụng: ${timeDisplay}`
  );
}

async function handleAddTimeBot(api, message, params, prefix, aliasCommand, isAdminLevelHighest) {
  if (!(await checkAdminLevelHighest(api, message, isAdminLevelHighest))) return;

  if (params.length < 2) {
    await sendMessageWarning(
      api,
      message,
      `Cú pháp không đúng!\nVui lòng sử dụng: ${prefix}${aliasCommand} addtime [ID/index] [thời hạn]\n` +
        `Ví dụ: ${prefix}${aliasCommand} addtime 1 24h hoặc ${prefix}${aliasCommand} addtime 1 -1 (vô hạn)`
    );
    return;
  }

  const [botIdentifier, timeStr] = params;

  let timeInMs;
  if (timeStr === "-1") {
    timeInMs = PERMANENT_TIME;
  } else {
    timeInMs = parseTime(timeStr, 0);
  }

  if (timeInMs !== PERMANENT_TIME && timeInMs <= 0) {
    await sendMessageWarning(
      api,
      message,
      "Thời hạn không hợp lệ!\n" +
        "Định dạng: số + đơn vị\n" +
        "Đơn vị: s (giây), m (phút), h (giờ), d (ngày)\n" +
        "Ví dụ: 30s, 15m, 24h, 7d hoặc -1 (vô hạn)"
    );
    return;
  }

  let botToApprove = botIdentifier;
  if (!isNaN(parseInt(botIdentifier))) {
    const index = parseInt(botIdentifier) - 1;
    const botIds = Object.keys(botChildrenStore.getAll());
    if (index >= 0 && index < botIds.length) {
      botToApprove = botIds[index];
    }
  }

  if (!botChildrenStore.has(botToApprove)) {
    await sendMessageWarning(api, message, "ID/Index không hợp lệ hoặc bot chưa được đăng ký!");
    return;
  }

  const dataBotChildren = botChildrenStore.get(botToApprove);

  // ➤ Nếu nhập -1 thì đặt vô hạn, còn không thì cộng thêm
  if (timeInMs === PERMANENT_TIME) {
    dataBotChildren.timeRemaining = PERMANENT_TIME;
  } else if (dataBotChildren.timeRemaining !== PERMANENT_TIME) {
    dataBotChildren.timeRemaining += timeInMs;
  }

  delete dataBotChildren.rejectAt;
  delete dataBotChildren.rejectBy;
  botChildrenStore.markDirty();

  const timeRemaining = dataBotChildren.timeRemaining;
  const timeDisplay = timeRemaining === PERMANENT_TIME ? "vô thời hạn" : formatSeconds(Math.floor(timeRemaining / 1000));

  await sendMessageComplete(
    api,
    message,
    `Đã tăng thêm thời gian cho botId ${botToApprove} thành công!\nThời hạn sử dụng: ${timeDisplay}`
  );
}

async function handleSubtractTimeBot(api, message, params, prefix, aliasCommand, isAdminLevelHighest) {
  if (!(await checkAdminLevelHighest(api, message, isAdminLevelHighest))) return;

  if (params.length < 2) {
    await sendMessageWarning(
      api,
      message,
      `Cú pháp không đúng!\nVui lòng sử dụng: ${prefix}${aliasCommand} subtime [ID/index] [thời gian muốn trừ]\n` +
        `Ví dụ: ${prefix}${aliasCommand} subtime 1 2h`
    );
    return;
  }

  const [botIdentifier, timeStr] = params;

  // ➤ Không cho trừ -1
  if (timeStr === "-1") {
    await sendMessageWarning(api, message, "Không thể trừ thời gian với giá trị -1 (vô hạn)!");
    return;
  }

  const timeInMs = parseTime(timeStr, 0);
  if (timeInMs <= 0) {
    await sendMessageWarning(
      api,
      message,
      "Thời gian trừ không hợp lệ!\n" +
        "Định dạng: số + đơn vị\n" +
        "Đơn vị: s (giây), m (phút), h (giờ), d (ngày)\n" +
        "Ví dụ: 30s, 15m, 24h, 7d"
    );
    return;
  }

  let botToUpdate = botIdentifier;
  if (!isNaN(parseInt(botIdentifier))) {
    const index = parseInt(botIdentifier) - 1;
    const botIds = Object.keys(botChildrenStore.getAll());
    if (index >= 0 && index < botIds.length) {
      botToUpdate = botIds[index];
    }
  }

  const botData = botChildrenStore.get(botToUpdate);
  if (!botData) {
    await sendMessageWarning(api, message, "ID/Index không hợp lệ hoặc bot chưa được đăng ký!");
    return;
  }

  if (botData.timeRemaining === PERMANENT_TIME) {
    await sendMessageWarning(
      api,
      message,
      `Bot ${botToUpdate} đang có thời hạn sử dụng vô hạn, không thể trừ thời gian.`
    );
    return;
  }

  botData.timeRemaining -= timeInMs;
  if (botData.timeRemaining < 0) botData.timeRemaining = 0;

  botChildrenStore.markDirty();

  const timeRemainingDisplay =
    botData.timeRemaining === PERMANENT_TIME
      ? "vô thời hạn"
      : formatSeconds(Math.floor(botData.timeRemaining / 1000));

  await sendMessageComplete(
    api,
    message,
    `Đã trừ thời gian của botId ${botToUpdate} thành công!\nThời hạn sử dụng còn lại: ${timeRemainingDisplay}`
  );
}


async function handleSetTimeBot(api, message, params, prefix, aliasCommand, isAdminLevelHighest) {
  if (!(await checkAdminLevelHighest(api, message, isAdminLevelHighest))) return;

  if (params.length < 2) {
    await sendMessageWarning(
      api,
      message,
      `Cú pháp không đúng!\nVui lòng sử dụng: ${prefix}${aliasCommand} settime [ID/index] [thời hạn]\n` +
        `Ví dụ: ${prefix}${aliasCommand} settime 1 24h\n` +
        `Ví dụ: ${prefix}${aliasCommand} settime 1 -1 (để set vô thời hạn)`
    );
    return;
  }

  const [botIdentifier, timeStr] = params;

  let timeInMs;
  if (timeStr === "-1") {
    timeInMs = PERMANENT_TIME;
  } else {
    timeInMs = parseTime(timeStr, 0);

    if (timeInMs <= 0) {
      await sendMessageWarning(
        api,
        message,
        "Thời hạn không hợp lệ!\n" +
          "Định dạng: số + đơn vị hoặc -1\n" +
          "Đơn vị: s (giây), m (phút), h (giờ), d (ngày)\n" +
          "Ví dụ: 30s, 15m, 24h, 7d, -1 (vô thời hạn)"
      );
      return;
    }
  }

  let botToUpdate = botIdentifier;
  if (!isNaN(parseInt(botIdentifier))) {
    const index = parseInt(botIdentifier) - 1;
    const botIds = Object.keys(botChildrenStore.getAll());
    if (index >= 0 && index < botIds.length) {
      botToUpdate = botIds[index];
    }
  }

  const botData = botChildrenStore.get(botToUpdate);
  if (!botData) {
    await sendMessageWarning(api, message, "ID/Index không hợp lệ hoặc bot chưa được đăng ký!");
    return;
  }

  const oldTimeRemaining = botData.timeRemaining;

  botData.timeRemaining = timeInMs;

  botData.approvedAt = Date.now();
  botData.approvedBy = message.data.uidFrom;
  delete botData.rejectAt;
  delete botData.rejectBy;

  botChildrenStore.markDirty();

  const timeDisplay = timeInMs === PERMANENT_TIME ? "vô thời hạn" : formatSeconds(Math.floor(timeInMs / 1000));
  const oldTimeDisplay =
    oldTimeRemaining === PERMANENT_TIME ? "vô thời hạn" : formatSeconds(Math.floor(oldTimeRemaining / 1000));

  await sendMessageComplete(
    api,
    message,
    `Đã set thời gian cho bot ${botToUpdate} thành công!\n` +
      `Thời gian cũ: ${oldTimeDisplay}\n` +
      `Thời gian mới: ${timeDisplay}`
  );
}

async function handleRejectBot(api, message, ownerId, isAdminLevelHighest) {
  if (!(await checkAdminLevelHighest(api, message, isAdminLevelHighest))) return;

  const botToReject = botChildrenStore.get(ownerId);
  if (!botToReject) {
    await sendMessageWarning(api, message, "Bot không tồn tại!");
    return;
  }

  await shutdownBotByOwnerId(ownerId);
  botToReject.status = "reject";
  botToReject.timeRemaining = 0;
  delete botToReject.approvedAt;
  delete botToReject.approvedBy;
  botToReject.rejectAt = Date.now();
  botToReject.rejectBy = message.data.uidFrom;
  botChildrenStore.markDirty();

  await sendMessageComplete(api, message, `Đã từ chối phê duyệt và chấm dứt bot ${botToReject.createdBy}!`);
}

async function handleRemoveBot(api, message, ownerId, isAdminLevelHighest) {
  if (!(await checkAdminLevelHighest(api, message, isAdminLevelHighest))) return;

  if (!botChildrenStore.has(ownerId)) {
    await sendMessageWarning(api, message, "Bot không tồn tại!");
    return;
  }

  const botData = botChildrenStore.get(ownerId);
  const apiManager = getApiManagerWithOwner(ownerId);
  const botName = apiManager ? apiManager.apiZalo.accountInfo.name : botData.nameBot || "Chưa xác định";

  // Tắt bot trước khi xóa
  await shutdownBotByOwnerId(ownerId);

  // Xóa bot khỏi hệ thống
  botChildrenStore.delete(ownerId);
  botChildrenStore.markDirty();

  await sendMessageComplete(
    api,
    message,
    `🗑️ Đã xóa bot thành công!\n` +
      `👤 ID Owner: ${ownerId}\n` +
      `📱 Tên Bot: ${botName}\n` +
      `👤 Người tạo: ${botData.createdBy}\n` +
      `📅 Ngày tạo: ${new Date(botData.createdAt).toLocaleString("vi-VN")}\n\n` +
      `⚠️ Lưu ý: Dữ liệu bot đã bị xóa vĩnh viễn!`
  );
}

async function handleListBot(api, message) {
  const arrList = await createBotListFromChildren(api, PERMANENT_TIME);
  if (arrList.length === 0) {
    await sendMessageWarning(api, message, "Hiện tại chưa có bot nào được đăng ký!");
    return;
  }

  let imagePath;
  try {
    imagePath = await createListImage({ columnCount: 2 }, arrList, {
      mainTitle: "BOT MANAGER",
      subTitle: `Danh Sách Quản Lý Bot`,
    });

    await sendMessageCompleteRequest(api, message, { caption: "", imagePath }, 600000);
  } catch (error) {
    console.error("Lỗi khi tạo ảnh danh sách:", error);
  } finally {
    deleteFile(imagePath);
  }

  // let listMessage = "📋 DANH SÁCH BOT 📋\n\n";

  // for (const [index, [botId, botData]] of botList.entries()) {
  //   let statusEmoji;
  // switch (botData.status) {
  //   case "active":
  //     statusEmoji = "🟢";
  //     break;
  //   case "inactive":
  //     statusEmoji = "🔴";
  //     break;
  //   case "pending":
  //     statusEmoji = "🟡";
  //     break;
  //   case "reject":
  //     statusEmoji = "⛔";
  //     break;
  //   default:
  //     statusEmoji = "⚪";
  //   }

  //   let timeStatus;
  //   if (botData.timeRemaining === PERMANENT_TIME) {
  //     timeStatus = "♾️ Vô thời hạn";
  //   } else if (botData.timeRemaining <= 0) {
  //     timeStatus = "⏰ Hết hạn";
  //   } else {
  //     timeStatus = `⏳ Thời hạn còn: ${formatSeconds(Math.floor(botData.timeRemaining / 1000))}`;
  //   }

  //   listMessage += `${index + 1}. Bot: ${botData.nameBot ? botData.nameBot : "Chưa được khởi động"} [${botId}]\n`;
  //   listMessage += `   ${statusEmoji} Trạng thái: ${botData.status.toUpperCase()}\n`;
  //   listMessage += `   ${timeStatus}\n`;

  //   const createdDate = new Date(botData.createdAt).toLocaleString("vi-VN");
  //   listMessage += `   👤 Người tạo: ${botData.createdBy}\n`;
  //   listMessage += `   📅 Ngày tạo: ${createdDate}\n\n`;
  // }

  // listMessage += "📝 Chú thích trạng thái:\n";
  // listMessage += "🟢 ACTIVE: Bot đang hoạt động\n";
  // listMessage += "🔴 INACTIVE: Bot đã tắt\n";
  // listMessage += "🟡 PENDING: Đang chờ phê duyệt\n";
  // listMessage += "⛔ REJECT: Đã bị từ chối\n";

  // await sendMessageComplete(api, message, listMessage, false, 300000);
}

// ─────────────────────────────────────────────────────────────────
// STYLE BOT: !mybot style size|color|type|icon|reset
// size  [nameServer|text|all] [10-24]
// color [tên màu / hex]
// type  [nameServer|text|all] [bold,italic,underline,strike|none]
// icon  [emoji/text]
// reset
// ─────────────────────────────────────────────────────────────────
function normalizeStyleTarget(input) {
  const value = String(input || "")
    .replace(/[\u200B-\u200D\uFEFF]/g, "")
    .toLowerCase()
    .replace(/[\s_-]+/g, "");
  if (["nameserver", "server", "name", "ns"].includes(value)) return "nameserver";
  if (["text", "body", "noidung"].includes(value)) return "text";
  if (["all", "tatca"].includes(value)) return "all";
  return value;
}

async function handleStyleBot(api, message, params, aliasCommand, prefix) {
  const idBot = api.getBotId();
  const managerData = api.apiManager.getDataManager();
  const sub = (params[0] || "").toLowerCase();

  if (!sub || !["size", "color", "type", "icon", "reset"].includes(sub)) {
    const guide =
      `📖 *Hướng dẫn style bot:*\n\n` +
      `🔷 *Cỡ chữ (10→24):*\n` +
      ` ➤  ${prefix}${aliasCommand} style size [nameServer|text|all] [10→24]\n\n` +
      `🔷 *Màu sắc:*\n` +
      ` ➤  ${prefix}${aliasCommand} style color [nameServer|text|all] [màu]\n` +
      `   Màu sẵn: đỏ, xanh lá, vàng, đen\n\n` +
      `🔷 *Kiểu chữ:*\n` +
      ` ➤  ${prefix}${aliasCommand} style type [nameServer|text|all] [bold,italic,underline,strike|none]\n` +
      `   Hỗ trợ kết hợp: bold,italic,underline,strike\n\n` +
      `🔷 *Icon bot thả khi nhận lệnh:*\n` +
      ` ➤  ${prefix}${aliasCommand} style icon [emoji hoặc tên reaction]\n` +
      `   Dùng reaction Zalo, emoji hỗ trợ hoặc ký tự bàn phím như :d, :), :p...\n\n` +
      `🔷 *Khôi phục mặc định:*\n` +
      ` ➤  ${prefix}${aliasCommand} style reset`;
    await sendMessageComplete(api, message, guide, false, TIME_TO_LIVE);
    return;
  }

  if (!managerData.chatStyle) managerData.chatStyle = {};

  if (sub === "reset") {
    delete managerData.chatStyle;
    delete managerData.chatIcon;
    managerDataCache.setChanged(idBot);
    await sendMessageComplete(api, message, "✅ Đã khôi phục giao diện về mặc định!", false, TIME_TO_LIVE);
    return;
  }

  if (sub === "icon") {
    const icon = params.slice(1).join(" ").trim();
    if (!icon) {
      await sendMessageComplete(api, message, `Vui lòng nhập icon/emoji!\nVD: ${prefix}${aliasCommand} style icon ❤️`, false, TIME_TO_LIVE);
      return;
    }
    const reactionKey = resolveReactionKey(icon);
    const fallbackReaction = "SMILE";
    const reaction = resolveReactionInput(icon) || fallbackReaction;
    const isCustomReaction = reaction && typeof reaction === "object";
    managerData.chatIcon = reactionKey || (isCustomReaction ? icon : fallbackReaction);
    managerDataCache.setChanged(idBot);
    // Lệnh style đã được thả reaction cũ trước khi vào handler; cập nhật ngay
    // reaction trên chính tin nhắn này để người dùng thấy thay đổi tức thì.
    await api.addReaction("UNDO", message).catch(() => false);
    await api.addReaction(reaction, message).catch(() => false);
    await sendMessageComplete(
      api,
      message,
      `✅ Đã đặt icon bot thả: ${reactionKey || isCustomReaction ? icon : ":d"} (${reactionKey || (isCustomReaction ? "CUSTOM" : fallbackReaction)})${reactionKey || isCustomReaction ? "" : " — nội dung quá dài, đã dùng mặc định"}`,
      false,
      TIME_TO_LIVE
    );
    return;
  }

  if (sub === "color") {
    const requestedTarget = normalizeStyleTarget(params[1]);
    const target = ["nameserver", "text", "all"].includes(requestedTarget) ? requestedTarget : "nameserver";
    const colorInput = (target === "nameserver" && !["nameserver", "text", "all"].includes(requestedTarget)
      ? params.slice(1).join(" ")
      : params.slice(2).join(" ")).trim();
    const hex = resolveStyleColor(colorInput);
    if (!hex) {
      await sendMessageComplete(api, message, `Màu không hợp lệ!\nChỉ hỗ trợ: đỏ, xanh lá, vàng, đen.`, false, TIME_TO_LIVE);
      return;
    }
    if (target === "nameserver" || target === "all") managerData.chatStyle.color = hex;
    if (target === "text" || target === "all") managerData.chatStyle.textColor = hex;
    managerDataCache.setChanged(idBot);
    await sendMessageComplete(api, message, `✅ Đã đổi màu ${target} thành #${hex}`, false, TIME_TO_LIVE);
    return;
  }

  if (sub === "size") {
    // size [nameServer|text|all] [10-24]
    const target = normalizeStyleTarget(params[1]);
    const sizeVal = (params[2] || params[1] || "").trim();
    const validTargets = ["nameserver", "text", "all"];

    if (!validTargets.includes(target) && ALLOWED_STYLE_SIZES.includes(target)) {
      // người dùng nhập: style size 18  (bỏ target)
      managerData.chatStyle.size = target;
      managerDataCache.setChanged(idBot);
      await sendMessageComplete(api, message, `✅ Đã đổi cỡ chữ nameServer thành ${target}`, false, TIME_TO_LIVE);
      return;
    }

    if (!validTargets.includes(target)) {
      await sendMessageComplete(api, message, `Cú pháp: ${prefix}${aliasCommand} style size [nameServer|text|all] [10-24]`, false, TIME_TO_LIVE);
      return;
    }

    if (!ALLOWED_STYLE_SIZES.includes(sizeVal)) {
      await sendMessageComplete(api, message, `Cỡ chữ không hợp lệ!\nGiá trị hợp lệ: ${ALLOWED_STYLE_SIZES.join(", ")}`, false, TIME_TO_LIVE);
      return;
    }

    if (target === "nameserver" || target === "all") {
      managerData.chatStyle.size = sizeVal;
    }
    if (target === "text" || target === "all") {
      managerData.chatStyle.textSize = sizeVal;
    }
    managerDataCache.setChanged(idBot);

    const targetLabel = target === "all" ? "nameServer & text" : target;
    await sendMessageComplete(api, message, `✅ Đã đổi cỡ chữ [${targetLabel}] thành ${sizeVal}`, false, TIME_TO_LIVE);
    return;
  }

  if (sub === "type") {
    // type [nameServer|text|all] [bold,italic,underline,strike|none]
    const target = normalizeStyleTarget(params[1]);
    const typeInput = params
      .slice(2)
      .join(",")
      .toLowerCase()
      .replace(/[，;|+\s]+/g, ",");
    const validTargets = ["nameserver", "text", "all"];
    const validTypes = ["bold", "italic", "underline", "strike", "none"];

    if (!validTargets.includes(target)) {
      await sendMessageComplete(api, message, `Cú pháp: ${prefix}${aliasCommand} style type [nameServer|text|all] [bold,italic,underline,strike|none]`, false, TIME_TO_LIVE);
      return;
    }

    const typeParts = typeInput.split(",").map(t => t.trim()).filter(Boolean);
    const invalidTypes = typeParts.filter(t => !validTypes.includes(t));
    if (typeParts.length === 0 || invalidTypes.length > 0) {
      await sendMessageComplete(api, message, `Kiểu chữ không hợp lệ: ${invalidTypes.join(", ")}\nHỗ trợ: bold, italic, underline, strike, none (hoặc kết hợp: bold,italic)`, false, TIME_TO_LIVE);
      return;
    }

    const isNone = typeParts.includes("none");
    const applyStyle = (obj) => {
      obj.bold      = !isNone && typeParts.includes("bold");
      obj.italic    = !isNone && typeParts.includes("italic");
      obj.underline = !isNone && typeParts.includes("underline");
      obj.strike    = !isNone && typeParts.includes("strike");
    };

    if (target === "nameserver" || target === "all") {
      applyStyle(managerData.chatStyle);
    }
    if (target === "text" || target === "all") {
      if (!managerData.chatStyle.text) managerData.chatStyle.text = {};
      applyStyle(managerData.chatStyle.text);
    }

    managerDataCache.setChanged(idBot);
    const targetLabel = target === "all" ? "nameServer & text" : target;
    await sendMessageComplete(api, message, `✅ Đã đổi kiểu chữ [${targetLabel}] thành: ${isNone ? "none" : typeParts.join(", ")}`, false, TIME_TO_LIVE);
  }
}

// ─────────────────────────────────────────────────────────────────
// SHOWINFO: !mybot showinfo — Xem toàn bộ thông tin bot của bạn
// ─────────────────────────────────────────────────────────────────
async function handleShowInfoBot(api, message, ownerId, aliasCommand, prefix) {
  const botData = botChildrenStore.has(ownerId) ? botChildrenStore.get(ownerId) : null;
  const apiManager = getApiManagerWithOwner(ownerId);
  const idBot = api.getBotId();
  const managerData = api.apiManager.getDataManager();

  const botName = apiManager ? apiManager.apiZalo.accountInfo.name : (botData?.nameBot || "Chưa xác định");
  const infoOwner = botData?.infoOwner || {};

  // Thời hạn
  let timeText = "Chưa có thông tin";
  if (botData) {
    if (botData.timeRemaining === -1) {
      timeText = "♾️ Vô thời hạn";
    } else if (botData.timeRemaining <= 0) {
      timeText = "⏰ Hết hạn";
    } else {
      const expiredAt = new Date(Date.now() + botData.timeRemaining);
      timeText = `⏳ Còn lại: ${formatSeconds(Math.floor(botData.timeRemaining / 1000))}\n📅 Hết hạn: ${expiredAt.toLocaleString("vi-VN")}`;
    }
  }

  // Style hiện tại
  const style = managerData?.chatStyle || getDefaultServerStyle();
  const def = getDefaultServerStyle();
  const styleText =
    `🎨 Màu: #${style.color || def.color}\n` +
    `📐 Cỡ chữ nameServer: ${style.size || def.size} | text: ${style.textSize || style.size || def.size}\n` +
    `✏️ Kiểu: ${[
      style.bold ? "bold" : null,
      style.italic ? "italic" : null,
      style.underline ? "underline" : null,
      style.strike ? "strike" : null,
    ].filter(Boolean).join(", ") || "none"}`;

  const caption =
    `📊 *THÔNG TIN BOT ĐẦY ĐỦ*\n\n` +
    `🤖 Bot: ${botName}\n` +
    `👤 Tên chủ: ${infoOwner.name || "Chưa cập nhật"}\n` +
    `${infoOwner.nameServer ? `🛡️ Tên đại diện: ${infoOwner.nameServer}\n` : ""}` +
    `🖊️ Giới thiệu: ${infoOwner.description || "Chưa cập nhật"}\n` +
    `📄 Thông tin bot: ${infoOwner.botInfo || "Chưa cập nhật"}\n` +
    `⚙️ Nền tảng: ${infoOwner.typePlatform || "Chưa cập nhật"}\n\n` +
    `⏱️ Thời hạn:\n${timeText}\n\n` +
    `🎨 *Style hiện tại:*\n${styleText}\n\n` +
    `💡 Dùng "${prefix}${aliasCommand} style" để thay đổi giao diện`;

  await sendMessageComplete(api, message, caption, false, TIME_TO_LIVE);
}

async function handleHelpBotWithBotChildren(api, message, prefix, aliasCommand) {
  let helpMessage =
    "📋 HƯỚNG DẪN QUẢN LÝ BOT 📋\n\n" +
    "1️⃣ Đây là danh sách lệnh quản lý Bot cá nhân\n\n" +
    `➤『${prefix}${aliasCommand} detail』 - Xem thông tin chi tiết bot và chủ bot\n` +
    `➤『${prefix}${aliasCommand} set』 - Cập nhật thông tin chủ bot\n` +
    `   • ${prefix}${aliasCommand} set name [tên của bạn]\n` +
    `   • ${prefix}${aliasCommand} set nameServer [tên đại diện của bot]\n` +
    `   • ${prefix}${aliasCommand} set description [giới thiệu]\n` +
    `   • ${prefix}${aliasCommand} set botInfo [thông tin bot]\n` +
    `   • ${prefix}${aliasCommand} set typePlatform [đăng nhập bot]\n` +
    `➤『${prefix}${aliasCommand} style』 - Định dạng kiểu chữ, cỡ chữ, màu sắc\n` +
    `   • ${prefix}${aliasCommand} style size [nameServer|text|all] [10->24]\n` +
      `   • ${prefix}${aliasCommand} style color [nameServer|text|all] [màu]\n` +
    `   • ${prefix}${aliasCommand} style type [nameServer|text|all] [bold,italic,underline,strike|none]\n` +
    `      └ Hỗ trợ kết hợp: bold,italic,underline,strike\n` +
    `   • ${prefix}${aliasCommand} style icon [tên icon/emoji]\n` +
    `   • ${prefix}${aliasCommand} style reset - Khôi phục giao diện mặc định\n` +
    `➤『${prefix}${aliasCommand} restart』 - Khởi động lại bot\n` +
    `➤『${prefix}${aliasCommand} shutdown』 - Tắt bot\n\n` +
    "2️⃣ Đối với quản trị viên\n\n" +
    `➤『${prefix}${aliasCommand} extend [number month]』 - Gia hạn bot\n` +
    `➤『${prefix}${aliasCommand} showinfo』 - Xem toàn bộ thông tin bot của bạn\n`;

  await sendMessageComplete(api, message, helpMessage, true, TIME_TO_LIVE);
}

async function handleHelpBot(api, message, prefix, aliasCommand) {
  let helpMessage =
    "📋 HƯỚNG DẪN QUẢN LÝ BOT 📋\n\n" +
    "1️⃣ Đây là danh sách lệnh quản lý Bot cá nhân\n\n" +
    `➤『${prefix}${aliasCommand} info』 - Xem thông tin chủ bot\n` +
    `➤『${prefix}${aliasCommand} detail』 - Xem thông tin chi tiết bot\n` +
    `➤『${prefix}${aliasCommand} active』 - Kích hoạt bot\n` +
    `➤『${prefix}${aliasCommand} restart』 - Khởi động lại bot\n` +
    `➤『${prefix}${aliasCommand} shutdown』 - Tắt bot\n\n` +
    `2️⃣ Lệnh Bot Leader trong nhóm\n\n` +
    `➤『${prefix}${aliasCommand} gjoin [index|all]』 - Mời bot con vào nhóm hiện tại (ví dụ: 1,2,4)\n` +
    `➤『${prefix}${aliasCommand} gleave [index|all]』 - Cho bot con rời nhóm hiện tại\n` +
    `➤『${prefix}${aliasCommand} github [ghi chú]』 - Kiểm tra, commit và đẩy source lên GitHub\n\n` +
    `3️⃣ Đối với quản trị viên\n\n` +
    `➤『${prefix}${aliasCommand} manager』 - Xem danh sách lệnh quản lý bot\n` +
    `➤『${prefix}${aliasCommand} sendimck』 - Nhận IMEI/Cookie của bot đang dùng qua tin nhắn riêng\n`;
  await sendMessageComplete(api, message, helpMessage, true, TIME_TO_LIVE);
}

async function handleManagerCommands(api, message, prefix, aliasCommand, isAdminLevelHighest) {
  if (!(await checkAdminLevelHighest(api, message, isAdminLevelHighest))) {
    return;
  }

  const managerMessage =
    "👮 LỆNH QUẢN TRỊ BOT 👮\n\n" +
    "➤ Quản lý danh sách:\n" +
    `• ${prefix}${aliasCommand} list - Xem danh sách tất cả bot\n` +
    `• ${prefix}${aliasCommand} load - Tải lại dữ liệu bot từ file json\n\n` +
    `• ${prefix}${aliasCommand} notify - Thông báo cho tất cả khách hàng đang thuê bot\n\n` +
    "➤ Quản lý bot cụ thể:\n" +
    `• ${prefix}${aliasCommand} detail [index] - Xem thông tin bot theo số thứ tự\n` +
    `• ${prefix}${aliasCommand} active [index] - Kích hoạt bot theo số thứ tự\n` +
    `• ${prefix}${aliasCommand} restart [index] - Khởi động lại bot theo số thứ tự\n` +
    `• ${prefix}${aliasCommand} shutdown [index] - Tắt bot theo số thứ tự\n\n` +
    "➤ Phê duyệt/Từ chối bot:\n" +
    `• ${prefix}${aliasCommand} addtime [index/ID] [thời hạn] - Tăng thời hạn dùng bot\n` +
    `• ${prefix}${aliasCommand} subtime [index/ID] [thời hạn] - Giảm thời hạn dùng bot\n` +
    `• ${prefix}${aliasCommand} settime [index/ID] [thời hạn] - Set thời hạn dùng bot\n` +
    `• ${prefix}${aliasCommand} approve [index/ID] [thời hạn] - Phê duyệt bot\n` +
    `   Ví dụ: ${prefix}${aliasCommand} approve 1 24h\n` +
    `• ${prefix}${aliasCommand} reject [index/ID] - Từ chối bot\n` +
    `• ${prefix}${aliasCommand} remove [index/ID] - Xóa bot\n\n` +
    "➤ Quản lý hệ thống:\n" +
    `• ${prefix}${aliasCommand} activeall - Khởi chạy tất cả bot\n` +
    `• ${prefix}${aliasCommand} shutdownall - Tắt tất cả bot\n` +
    `• ${prefix}${aliasCommand} sendimck - Gửi riêng IMEI/Cookie của bot nhận lệnh\n\n` +
    "➤ Quản lý chặn lệnh:\n" +
    `• ${prefix}${aliasCommand} blockcmd add [index/ID] [tên lệnh] - Chặn lệnh của bot\n` +
    `• ${prefix}${aliasCommand} blockcmd remove [index/ID] [tên lệnh] - Bỏ chặn lệnh của bot\n` +
    `• ${prefix}${aliasCommand} blockcmd list [index/ID] - Xem danh sách lệnh bị chặn\n\n` +
    "➤ Quản lý thông báo:\n" +
    `• ${prefix}${aliasCommand} notifypm [index/ID] [on/off] - Bật/tắt thông báo tin nhắn riêng cho bot mẹ\n` +
    `   Ví dụ: ${prefix}${aliasCommand} notifypm 1 on\n` +
    "📝 Lưu ý về thời hạn:\n" +
    "• Định dạng: số + đơn vị\n" +
    "• Đơn vị: s (giây), m (phút), h (giờ), d (ngày)\n" +
    "• Ví dụ: 30s, 15m, 24h, 7d, -1 (vô thời hạn)\n" +
    "• settime: Set trực tiếp thời hạn (thay thế thời hạn cũ)\n" +
    "• addtime: Cộng thêm vào thời hạn hiện tại\n" +
    "• subtime: Trừ đi từ thời hạn hiện tại";

  await sendMessageComplete(api, message, managerMessage, false, TIME_TO_LIVE);
}

async function handleSendImeiCookie(api, message, isAdminLevelHighest) {
  if (!(await checkAdminLevelHighest(api, message, isAdminLevelHighest))) return;

  const requesterId = String(message.data.uidFrom);
  const botId = String(api.getBotId());
  const imei = api.appContext?.imei;
  const cookie = api.appContext?.cookie;

  if (!imei || !cookie) {
    await sendMessageWarning(api, message, "Không lấy được IMEI/Cookie của bot đang dùng!", true, TIME_TO_LIVE);
    return;
  }

  const cookieText = typeof cookie === "string" ? cookie : JSON.stringify(cookie);
  const credentialMessage =
    `🔐 IMEI/COOKIE BOT ĐANG DÙNG\n\n` +
    `Bot ID: ${botId}\n` +
    `IMEI: ${imei}\n` +
    `Cookie: ${cookieText}\n\n` +
    `⚠️ Không chia sẻ thông tin đăng nhập này cho người khác.`;

  try {
    await api.sendMessage({ msg: credentialMessage }, requesterId, MessageType.DirectMessage);

    if (message.type !== MessageType.DirectMessage) {
      await sendMessageComplete(api, message, "Đã gửi IMEI/Cookie vào tin nhắn riêng của bạn.", false, TIME_TO_LIVE);
    }
  } catch (error) {
    console.error(`[mybot sendimck] Không thể gửi riêng cho ${requesterId}:`, error?.message || error);
    await sendMessageWarning(
      api,
      message,
      "Không thể gửi IMEI/Cookie qua tin nhắn riêng. Hãy kết bạn với bot rồi thử lại!",
      true,
      TIME_TO_LIVE
    );
  }
}

async function handleInfoBot(api, message, ownerId) {
  let dataBot = botChildrenStore.get(ownerId);
  if (!dataBot & (ownerId === getGlobalApi().getBotId())) dataBot = getGlobalApi().apiManager.getDataConfig();
  if (!dataBot) {
    await sendMessageWarning(api, message, "Bot không tồn tại!", true, TIME_TO_LIVE);
    return;
  }
  if (!dataBot.infoOwner) {
    const userInfoData = await getUserInfoBasic(getGlobalApi(), ownerId);
    dataBot.infoOwner = {
      name: userInfoData.zaloName,
      description: "Chưa cập nhật",
      botInfo: "Chưa cập nhật",
    };

    botChildrenStore.markDirty();
  }

  const infoOwner = dataBot.infoOwner;
  const apiManager = getApiManagerWithOwner(ownerId);
  const botName = apiManager ? apiManager.apiZalo.accountInfo.name : dataBot.nameBot || "Chưa xác định";

  const infoMessage =
    `✨ THÔNG TIN CHỦ BOT ✨\n\n` +
    `👤 Tên: ${infoOwner.name}\n` +
    `🤖 Bot đang chạy: ${botName}\n` +
    `${infoOwner.nameServer ? `🛡️ Tên Đại Diện: ${infoOwner.nameServer}\n` : ""}` +
    `🖊️ Giới thiệu: ${infoOwner.description}\n` +
    `📄 Thông tin Bot: ${infoOwner.botInfo}\n\n`;

  await sendMessageComplete(api, message, infoMessage, false, TIME_TO_LIVE);
}

function formatDobToYYYYMMDD(dob) {
  if (!dob) return "2000-01-01";
  if (typeof dob === "string" && /^\d{4}-\d{2}-\d{2}$/.test(dob)) {
    return dob;
  }
  if (typeof dob === "number") {
    const date = new Date(dob * 1000);
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  }
  try {
    const date = new Date(dob);
    if (!isNaN(date.getTime())) {
      const year = date.getFullYear();
      const month = String(date.getMonth() + 1).padStart(2, "0");
      const day = String(date.getDate()).padStart(2, "0");
      return `${year}-${month}-${day}`;
    }
  } catch (e) {}
  return "2000-01-01";
}

function getGenderValueFromProfile(gender) {
  if (gender === undefined || gender === null) return 0;
  const genderNum = typeof gender === "string" ? parseInt(gender) : gender;
  return isNaN(genderNum) ? 0 : genderNum;
}

async function handleSetInfoBot(api, message, params, ownerId, isAdminLevelHighest) {
  // Cho phép Bot Leader/chủ bot tự cập nhật thông tin bot của mình.
  // Trước đây lệnh này chỉ kiểm tra adminLevelHighest nên chủ bot con
  // thường bị từ chối dù đang thao tác trên chính bot của mình.
  const senderId = message.data?.uidFrom;
  const isBotOwner = !api.apiManager?.isMainBot && String(senderId) === String(ownerId);
  const canManageInfo = isAdminLevelHighest || isBotLeader(api.getBotId(), senderId) || isBotOwner;
  if (!canManageInfo) {
    await sendMessageWarning(api, message, "Chỉ Bot Leader hoặc chủ bot mới được sử dụng lệnh này!", true, TIME_TO_LIVE);
    return;
  }
  const fieldValid = ["name", "description", "botInfo", "nameServer", "typePlatform", "avatarAccount"];

  const fieldCheck = params[0];

  if (fieldCheck && fieldCheck.toLowerCase() === "avataraccount") {
    const botId = api.getBotId();
    let avatarPath = null;

    try {
      const quote = message.data?.quote;
      if (quote && quote.attach) {
        let imageUrl;
        try {
          const attachData = JSON.parse(quote.attach);
          const attachParams = attachData.params ? JSON.parse(attachData.params) : {};
          imageUrl = attachParams.hd || attachData.href;
        } catch (error) {
          await sendMessageWarning(api, message, "Dữ liệu ảnh không hợp lệ trong tin nhắn được reply!", true, TIME_TO_LIVE);
          return;
        }

        if (!imageUrl) {
          await sendMessageWarning(api, message, "Không tìm thấy URL ảnh hợp lệ trong tin nhắn được reply!", true, TIME_TO_LIVE);
          return;
        }

        const tempFilePath = path.join(tempDir, `account_avatar_${botId}_${Date.now()}.jpg`);
        await fs.mkdir(tempDir, { recursive: true });
        await downloadFile(imageUrl, tempFilePath);
        avatarPath = tempFilePath;
      } else {
        const attachments = message.data?.attachments || [];
        if (attachments.length > 0) {
          const firstAttachment = attachments[0];
          const imageUrl = firstAttachment.url || firstAttachment.href;
          if (imageUrl) {
            const tempFilePath = path.join(tempDir, `account_avatar_${botId}_${Date.now()}.jpg`);
            await fs.mkdir(tempDir, { recursive: true });
            await downloadFile(imageUrl, tempFilePath);
            avatarPath = tempFilePath;
          }
        } else {
          const content = removeMention(message);
          const urlMatch = content.match(/https?:\/\/[^\s]+/);
          if (urlMatch) {
            const imageUrl = urlMatch[0];
            const tempFilePath = path.join(tempDir, `account_avatar_${botId}_${Date.now()}.jpg`);
            await fs.mkdir(tempDir, { recursive: true });
            await downloadFile(imageUrl, tempFilePath);
            avatarPath = tempFilePath;
          }
        }
      }

      if (!avatarPath) {
        await sendMessageWarning(
          api,
          message,
          `⚠️ Vui lòng reply vào tin nhắn có ảnh, gửi ảnh kèm lệnh, hoặc gửi URL ảnh!\nCú pháp: ${getGlobalPrefix(botId)}mybot set avatarAccount`,
          true,
          TIME_TO_LIVE
        );
        return;
      }

      await api.changeAccountAvatar(avatarPath);
      await sendMessageComplete(api, message, "✅ Đã đổi ảnh đại diện tài khoản Zalo thành công!", true, TIME_TO_LIVE);
    } catch (error) {
      await sendMessageWarning(api, message, `❌ Lỗi khi đổi ảnh đại diện: ${error.message}`, true, TIME_TO_LIVE);
    } finally {
      if (avatarPath) deleteFile(avatarPath).catch(() => {});
    }
    return;
  }

  if (params.length < 2) {
    await sendMessageWarning(
      api,
      message,
      `Hướng dẫn set info!\nCú pháp: ${getGlobalPrefix(api.getBotId())}mybot set [trường] [giá trị]\n` +
        `Các trường có thể đặt: {${fieldValid.join(", ")}}\n` +
        `Riêng typePlatform: Nhập pc hoặc web\n` +
        `Riêng avatarAccount: Reply ảnh, gửi kèm ảnh, hoặc gửi URL ảnh (không cần giá trị text)\n` +
        `Ví dụ: ${getGlobalPrefix(api.getBotId())}mybot set name Nguyễn Văn A`,
      true,
      TIME_TO_LIVE
    );
    return;
  }

  // Tên trường không phân biệt hoa/thường để tránh lệnh bị trượt chỉ vì
  // cách viết `nameServer`/`nameserver` khác nhau.
  const fieldInput = params[0];
  const field = fieldValid.find((validField) => validField.toLowerCase() === fieldInput.toLowerCase());
  const value = params.slice(1).join(" ");

  if (!field) {
    await sendMessageWarning(
      api,
      message,
      `Trường không hợp lệ!\nCác trường có thể đặt: ${fieldValid.join(", ")}`,
      true,
      TIME_TO_LIVE
    );
    return;
  }

  let dataBot = botChildrenStore.get(ownerId);
  const apiGlobal = getGlobalApi();
  const isGetDataAdmin = ownerId === apiGlobal.getBotId();
  if (!dataBot & isGetDataAdmin) dataBot = apiGlobal.apiManager.getDataConfig();
  if (!dataBot) {
    await sendMessageWarning(api, message, "Bot không tồn tại!", true, TIME_TO_LIVE);
    return;
  }

  if (!dataBot.infoOwner) {
    const userInfoData = await getUserInfoBasic(getGlobalApi(), ownerId);
    dataBot.infoOwner = {
      name: userInfoData.zaloName,
      description: "Chưa cập nhật",
      botInfo: "Chưa cập nhật",
    };
  }

  // "name" và "description" thao tác trực tiếp lên tài khoản Zalo thật của bot
  if (field === "name" || field === "description") {
    try {
      const profileResponse = await api.getProfileMe();
      const currentProfile = profileResponse.profile;

      const payload = {
        profile: {
          name: field === "name" ? value : currentProfile.name || currentProfile.zaloName || dataBot.infoOwner.name,
          dob: formatDobToYYYYMMDD(currentProfile.dob || currentProfile.sdob),
          gender: getGenderValueFromProfile(currentProfile.gender),
        },
      };

      // Lưu ý: Zalo chỉ hỗ trợ cập nhật "mô tả" ở mục biz (thông tin doanh nghiệp) qua API này,
      // không có endpoint công khai để đổi trạng thái/bio cá nhân. Với tài khoản cá nhân thường,
      // trường này có thể không hiển thị ra ngoài hồ sơ.
      if (field === "description") {
        payload.biz = { description: value };
      }

      await api.updateProfile(payload);
    } catch (error) {
      await sendMessageWarning(
        api,
        message,
        `Có lỗi khi cập nhật ${field === "name" ? "tên" : "mô tả"} trên tài khoản Zalo: ` + error.message,
        true,
        TIME_TO_LIVE
      );
      return;
    }
  }

  dataBot.infoOwner[field] = value;
  if (isGetDataAdmin) {
    writeConfig(dataBot);
  } else {
    botChildrenStore.markDirty();
  }

  await sendMessageComplete(
    api,
    message,
    `Đã cập nhật thành công thông tin ${field} thành: ${value}`,
    true,
    TIME_TO_LIVE
  );
}

async function handleNotifyCustomer(api, message, params, isAdminLevelHighest) {
  if (!(await checkAdminLevelHighest(api, message, isAdminLevelHighest))) return;

  let ownerCount = 0;
  let ownerSuccessCount = 0;
  let botTotalCount = 0;
  let botSuccessCount = 0;
  const caption = `🤖 Admin Leader Bot 🤖\n📄 Notify To Customer:\n` + params.join(" ");
  
  for (const [ownerId, dataBot] of Object.entries(botChildrenStore.getAll())) {
    if (!dataBot || ownerId === getGlobalApi().getBotId()) continue;
    if (dataBot.status !== "active") continue;
    
    ownerCount++;
    
    // Gửi đến owner (khách hàng) từ bot chính
    try {
      await api.sendMessageForward({ msg: caption }, ownerId, MessageType.DirectMessage, 18000000);
      ownerSuccessCount++;
    } catch (error) {
      console.error(`Lỗi khi gửi thông báo đến owner ${ownerId}:`, error);
    }
    
    // Đếm và gửi từ bot con
    const botApiManager = getApiManagerWithOwner(ownerId);
    if (botApiManager && botApiManager.apiZalo && botApiManager.id && botApiManager.id !== ownerId) {
      botTotalCount++;
      try {
        const mainBotPhone = api.getPhoneNumber();
        if (mainBotPhone) {
          const ownerUserInfo = await botApiManager.apiZalo.findUserByPhone(mainBotPhone);
          if (ownerUserInfo && ownerUserInfo.uid === ownerId) {
            await botApiManager.apiZalo.sendMessageForward({ msg: caption }, ownerId, MessageType.DirectMessage, 18000000);
            botSuccessCount++;
          }
        }
      } catch (error) {
        // Bot con không thể gửi, bỏ qua
      }
    }
  }

  const infoMessage = `✨ Đã gửi thông báo đến ${ownerSuccessCount}/${ownerCount} khách hàng${botTotalCount > 0 ? ` và ${botSuccessCount}/${botTotalCount} bot con` : ''} đang chạy.`;
  await sendMessageComplete(api, message, infoMessage, false, TIME_TO_LIVE);
}

export async function createBotListFromChildren(api, PERMANENT_TIME = -1) {
  const botList = Object.entries(botChildrenStore.getAll());
  if (botList.length === 0) return [];

  const listIds = Object.keys(botChildrenStore.getAll());
  let infoListBot = {};
  try {
    infoListBot = (await getUsersInfoBasic(api, listIds)) || {};
  } catch (error) {
    console.warn("Không lấy được một số hồ sơ chủ bot, sử dụng dữ liệu đã lưu:", error?.message || error);
  }
  const arrList = [];

  for (const [index, [botId, botData]] of botList.entries()) {
    const ownerInfo = infoListBot?.[botId] || {};
    let timeStatus;
    if (botData.timeRemaining === PERMANENT_TIME) {
      timeStatus = "♾️ Vô thời hạn";
    } else if (botData.timeRemaining <= 0) {
      timeStatus = "⏰ Hết hạn";
    } else {
      timeStatus = `⏳ Thời hạn còn: ${formatSeconds(Math.floor(botData.timeRemaining / 1000))}`;
    }
    arrList.push({
      name: ownerInfo.displayName || botData.infoOwner?.name || botData.createdBy || `UID ${botId}`,
      avatar: botData.avatarBot || ownerInfo.avatar || ownerInfo.avatarFull || null,
      info: timeStatus,
      status: botData.status,
    });
  }

  return arrList;
}
function getBotIdFromOwnerId(ownerId) {
  const apiManager = getApiManagerWithOwner(ownerId);
  if (apiManager) {
    return apiManager.id;
  }
  
  const botData = botChildrenStore.get(ownerId);
  if (botData && botData.idBot) {
    return botData.idBot;
  }
  
  return ownerId;
}
function parseBotIdentifier(botIdentifier) {
  let targetOwnerId = botIdentifier;
  if (!isNaN(parseInt(botIdentifier))) {
    const index = parseInt(botIdentifier) - 1;
    const botIds = Object.keys(botChildrenStore.getAll());
    if (index >= 0 && index < botIds.length) {
      targetOwnerId = botIds[index];
    } else {
      return { error: "Index bot không hợp lệ!" };
    }
  }

  if (!botChildrenStore.has(targetOwnerId)) {
    return { error: "ID/Index không hợp lệ hoặc bot chưa được đăng ký!" };
  }

  const botId = getBotIdFromOwnerId(targetOwnerId);
  const botData = botChildrenStore.get(targetOwnerId);
  const botName = botData?.nameBot || targetOwnerId;
  const isNotStarted = botId === targetOwnerId;

  return { botId, targetOwnerId, botName, isNotStarted };
}

function parseMultipleBotIdentifiers(botIdentifiersStr) {
  const identifiers = botIdentifiersStr.split(',').map(id => id.trim()).filter(id => id);
  const botInfos = [];
  const errors = [];

  for (const identifier of identifiers) {
    const botInfo = parseBotIdentifier(identifier);
    if (botInfo.error) {
      errors.push(`${identifier}: ${botInfo.error}`);
    } else {
      botInfos.push(botInfo);
    }
  }

  return { botInfos, errors };
}

async function handleBlockCommand(api, message, params, prefix, aliasCommand, isAdminLevelHighest) {
  if (!(await checkAdminLevelHighest(api, message, isAdminLevelHighest))) return;

  if (params.length < 1) {
    await sendMessageWarning(
      api,
      message,
      `Cú pháp không đúng!\n` +
        `• ${prefix}${aliasCommand} blockcmd add [ID/index] [tên lệnh] - Chặn lệnh\n` +
        `• ${prefix}${aliasCommand} blockcmd remove [ID/index] [tên lệnh] - Bỏ chặn lệnh\n` +
        `• ${prefix}${aliasCommand} blockcmd list [ID/index] - Xem danh sách lệnh bị chặn\n\n` +
        `Ví dụ:\n` +
        `• ${prefix}${aliasCommand} blockcmd add 1 help\n` +
        `• ${prefix}${aliasCommand} blockcmd remove 1 help\n` +
        `• ${prefix}${aliasCommand} blockcmd list 1`
    );
    return;
  }

  const action = params[0].toLowerCase();
  const remainingParams = params.slice(1);

  switch (action) {
    case "add": {
      if (remainingParams.length < 2) {
        await sendMessageWarning(
          api,
          message,
          `Cú pháp không đúng!\nVui lòng sử dụng: ${prefix}${aliasCommand} blockcmd add [ID/index] [tên lệnh]\n` +
            `Ví dụ: ${prefix}${aliasCommand} blockcmd add 1 help`
        );
        return;
      }

      const botIdentifiersStr = remainingParams[0];
      const commandNames = remainingParams.slice(1);
      
      const { botInfos, errors } = parseMultipleBotIdentifiers(botIdentifiersStr);
      
      if (botInfos.length === 0) {
        await sendMessageWarning(
          api,
          message,
          `Không tìm thấy bot hợp lệ nào!\n${errors.join('\n')}`
        );
        return;
      }

      const allResults = [];
      let hasChanges = false;

      for (const botInfo of botInfos) {
        const { botId, targetOwnerId, botName, isNotStarted } = botInfo;
        const managerCommand = getManagerCommandConfig(botId);

        const addedCommands = [];
        const alreadyBlocked = [];
        const failedCommands = [];

        const blockedSet = new Set(managerCommand.notAllowedCommand);

        for (const commandName of commandNames) {
          const commandLower = commandName.toLowerCase().trim();
          
          if (!commandLower) {
            failedCommands.push(commandName);
            continue;
          }

          if (blockedSet.has(commandLower)) {
            alreadyBlocked.push(commandName);
          } else {
            managerCommand.notAllowedCommand.push(commandLower);
            blockedSet.add(commandLower);
            addedCommands.push(commandName);
            hasChanges = true;
          }
        }

        allResults.push({
          botName,
          targetOwnerId,
          isNotStarted,
          addedCommands,
          alreadyBlocked,
          failedCommands
        });
      }

      if (hasChanges) {
        const commandConfig = getCommandConfig();
        if (!commandConfig.prefix) {
          const existingConfig = readCommandConfig();
          commandConfig.prefix = existingConfig.prefix || {};
        }
        writeCommandConfig(commandConfig);
      }

      const messageParts = [];
      
      for (const result of allResults) {
        const { botName, targetOwnerId, isNotStarted, addedCommands, alreadyBlocked, failedCommands } = result;
        messageParts.push(`\n📌 Bot: ${botName} (${targetOwnerId})`);
        
        if (addedCommands.length > 0) {
          messageParts.push(`✅ Đã chặn ${addedCommands.length} lệnh:\n${addedCommands.map(cmd => `   • ${cmd}`).join('\n')}`);
        }

        if (alreadyBlocked.length > 0) {
          messageParts.push(`⚠️ Đã bị chặn trước đó (${alreadyBlocked.length} lệnh):\n${alreadyBlocked.map(cmd => `   • ${cmd}`).join('\n')}`);
        }

        if (failedCommands.length > 0) {
          messageParts.push(`❌ Lỗi (${failedCommands.length} lệnh):\n${failedCommands.map(cmd => `   • ${cmd}`).join('\n')}`);
        }

        if (isNotStarted) {
          messageParts.push(`⚠️ Lưu ý: Bot chưa khởi động. Cấu hình sẽ được áp dụng khi bot khởi động.`);
        }
      }

      if (errors.length > 0) {
        messageParts.push(`\n❌ Lỗi khi xử lý:\n${errors.join('\n')}`);
      }

      const resultMessage = messageParts.join('\n');

      await sendMessageComplete(api, message, resultMessage, true, TIME_TO_LIVE);
      break;
    }

    case "remove": {
      if (remainingParams.length < 1) {
        await sendMessageWarning(
          api,
          message,
          `Cú pháp không đúng!\nVui lòng sử dụng: ${prefix}${aliasCommand} blockcmd remove [ID/index hoặc ID1,ID2,ID3...] [tên lệnh...] hoặc all\n` +
            `Ví dụ: ${prefix}${aliasCommand} blockcmd remove 1 help\n` +
            `Ví dụ: ${prefix}${aliasCommand} blockcmd remove 1,2,3 help\n` +
            `Ví dụ: ${prefix}${aliasCommand} blockcmd remove 1 all`
        );
        return;
      }

      const botIdentifiersStr = remainingParams[0];
      const commandNames = remainingParams.slice(1);

      const { botInfos, errors } = parseMultipleBotIdentifiers(botIdentifiersStr);
      
      if (botInfos.length === 0) {
        await sendMessageWarning(
          api,
          message,
          `Không tìm thấy bot hợp lệ nào!\n${errors.join('\n')}`
        );
        return;
      }

      // Xử lý trường hợp "all"
      if (commandNames.length === 1 && commandNames[0].toLowerCase() === "all") {
        const allResults = [];
        let hasChanges = false;

        for (const botInfo of botInfos) {
          const { botId, targetOwnerId, botName, isNotStarted } = botInfo;
          const managerCommand = getManagerCommandConfig(botId);
          const totalBlocked = managerCommand.notAllowedCommand.length;
          
          if (totalBlocked === 0) {
            allResults.push({
              botName,
              targetOwnerId,
              isNotStarted,
              message: `📋 Bot ${botName} (${targetOwnerId}) không có lệnh nào bị chặn!`
            });
          } else {
            managerCommand.notAllowedCommand = [];
            hasChanges = true;
            let resultMessage = `✅ Đã bỏ chặn tất cả ${totalBlocked} lệnh cho bot ${botName} (${targetOwnerId})!`;
            if (isNotStarted) {
              resultMessage += `\n⚠️ Lưu ý: Bot chưa khởi động. Cấu hình sẽ được áp dụng khi bot khởi động.`;
            }
            allResults.push({
              botName,
              targetOwnerId,
              isNotStarted,
              message: resultMessage
            });
          }
        }

        if (hasChanges) {
          const commandConfig = getCommandConfig();
          if (!commandConfig.prefix) {
            const existingConfig = readCommandConfig();
            commandConfig.prefix = existingConfig.prefix || {};
          }
          writeCommandConfig(commandConfig);
        }

        const messageParts = allResults.map(r => `📌 Bot: ${r.botName} (${r.targetOwnerId})\n${r.message}`);
        if (errors.length > 0) {
          messageParts.push(`\n❌ Lỗi khi xử lý:\n${errors.join('\n')}`);
        }

        await sendMessageComplete(api, message, messageParts.join('\n\n'), true, TIME_TO_LIVE);
        return;
      }

      if (commandNames.length === 0) {
        await sendMessageWarning(
          api,
          message,
          `Cú pháp không đúng!\nVui lòng sử dụng: ${prefix}${aliasCommand} blockcmd remove [ID/index hoặc ID1,ID2,ID3...] [tên lệnh...] hoặc all\n` +
            `Ví dụ: ${prefix}${aliasCommand} blockcmd remove 1 help\n` +
            `Ví dụ: ${prefix}${aliasCommand} blockcmd remove 1,2,3 help\n` +
            `Ví dụ: ${prefix}${aliasCommand} blockcmd remove 1 all`
        );
        return;
      }

      const allResults = [];
      let hasChanges = false;

      for (const botInfo of botInfos) {
        const { botId, targetOwnerId, botName, isNotStarted } = botInfo;
        const managerCommand = getManagerCommandConfig(botId);

        const removedCommands = [];
        const notBlocked = [];
        const failedCommands = [];

        for (const commandName of commandNames) {
          const commandLower = commandName.toLowerCase().trim();
          
          if (!commandLower) {
            failedCommands.push(commandName);
            continue;
          }

          const index = managerCommand.notAllowedCommand.indexOf(commandLower);
          if (index === -1) {
            notBlocked.push(commandName);
          } else {
            managerCommand.notAllowedCommand.splice(index, 1);
            removedCommands.push(commandName);
            hasChanges = true;
          }
        }

        allResults.push({
          botName,
          targetOwnerId,
          isNotStarted,
          removedCommands,
          notBlocked,
          failedCommands
        });
      }

      if (hasChanges) {
        const commandConfig = getCommandConfig();
        if (!commandConfig.prefix) {
          const existingConfig = readCommandConfig();
          commandConfig.prefix = existingConfig.prefix || {};
        }
        writeCommandConfig(commandConfig);
      }

      const messageParts = [];
      
      for (const result of allResults) {
        const { botName, targetOwnerId, isNotStarted, removedCommands, notBlocked, failedCommands } = result;
        messageParts.push(`\n📌 Bot: ${botName} (${targetOwnerId})`);
        
        if (removedCommands.length > 0) {
          messageParts.push(`✅ Đã bỏ chặn ${removedCommands.length} lệnh:\n${removedCommands.map(cmd => `   • ${cmd}`).join('\n')}`);
        }

        if (notBlocked.length > 0) {
          messageParts.push(`⚠️ Chưa bị chặn (${notBlocked.length} lệnh):\n${notBlocked.map(cmd => `   • ${cmd}`).join('\n')}`);
        }

        if (failedCommands.length > 0) {
          messageParts.push(`❌ Lỗi (${failedCommands.length} lệnh):\n${failedCommands.map(cmd => `   • ${cmd}`).join('\n')}`);
        }

        if (isNotStarted) {
          messageParts.push(`⚠️ Lưu ý: Bot chưa khởi động. Cấu hình sẽ được áp dụng khi bot khởi động.`);
        }
      }

      if (errors.length > 0) {
        messageParts.push(`\n❌ Lỗi khi xử lý:\n${errors.join('\n')}`);
      }

      const resultMessage = messageParts.join('\n');

      await sendMessageComplete(api, message, resultMessage, true, TIME_TO_LIVE);
      break;
    }

    case "list": {
      if (remainingParams.length < 1) {
        await sendMessageWarning(
          api,
          message,
          `Cú pháp không đúng!\nVui lòng sử dụng: ${prefix}${aliasCommand} blockcmd list [ID/index]\n` +
            `Ví dụ: ${prefix}${aliasCommand} blockcmd list 1`
        );
        return;
      }

      const botIdentifier = remainingParams[0];
      
      const botInfo = parseBotIdentifier(botIdentifier);
      if (botInfo.error) {
        await sendMessageWarning(api, message, botInfo.error);
        return;
      }

      const { botId, targetOwnerId, botName } = botInfo;
      const managerCommand = getManagerCommandConfig(botId);
      const blockedCommands = managerCommand.notAllowedCommand || [];

      if (blockedCommands.length === 0) {
        await sendMessageComplete(
          api,
          message,
          `📋 Danh sách lệnh bị chặn của bot ${botName} (${targetOwnerId}):\n\n` +
            `❌ Không có lệnh nào bị chặn.`,
          true,
          TIME_TO_LIVE
        );
        return;
      }

      const listMessage = `📋 Danh sách lệnh bị chặn của bot ${botName} (${targetOwnerId}):\n\n` +
        blockedCommands.map((cmd, index) => `${index + 1}. ❌ ${cmd}`).join('\n') +
        `\n\n📊 Tổng cộng: ${blockedCommands.length} lệnh bị chặn`;

      await sendMessageComplete(api, message, listMessage, true, TIME_TO_LIVE);
      break;
    }

    default:
      await sendMessageWarning(
        api,
        message,
        `Action không hợp lệ: "${action}"\n` +
          `Các action hợp lệ: add, remove, list\n\n` +
          `Ví dụ:\n` +
          `• ${prefix}${aliasCommand} blockcmd add 1 help\n` +
          `• ${prefix}${aliasCommand} blockcmd remove 1 help\n` +
          `• ${prefix}${aliasCommand} blockcmd list 1`
      );
  }
}

async function handleNotifyPM(api, message, params, prefix, aliasCommand, isAdminLevelHighest) {
  if (!(await checkAdminLevelHighest(api, message, isAdminLevelHighest))) return;

  if (params.length < 2) {
    await sendMessageWarning(
      api,
      message,
      `Cú pháp không đúng!\nVui lòng sử dụng: ${prefix}${aliasCommand} notifypm [ID/index] [on/off]\n` +
        `Ví dụ: ${prefix}${aliasCommand} notifypm 1 on\n` +
        `Ví dụ: ${prefix}${aliasCommand} notifypm 1 off`
    );
    return;
  }

  const [botIdentifier, action] = params;
  const actionLower = action.toLowerCase();

  if (actionLower !== "on" && actionLower !== "off") {
    await sendMessageWarning(
      api,
      message,
      `Action không hợp lệ: "${action}"\n` +
        `Chỉ chấp nhận: on hoặc off\n\n` +
        `Ví dụ:\n` +
        `• ${prefix}${aliasCommand} notifypm 1 on\n` +
        `• ${prefix}${aliasCommand} notifypm 1 off`
    );
    return;
  }

  const botInfo = parseBotIdentifier(botIdentifier);
  if (botInfo.error) {
    await sendMessageWarning(api, message, botInfo.error);
    return;
  }

  const { botId, targetOwnerId, botName, isNotStarted } = botInfo;
  
  const apiManagerBot = getApiManagerWithOwner(targetOwnerId);
  const actualBotId = apiManagerBot ? apiManagerBot.id : botId;
  
  const managerData = managerDataCache.get(actualBotId);
  const currentStatus = managerData.notifyParentPM ? "on" : "off";
  const newStatus = actionLower === "on";

  if (currentStatus === actionLower) {
    await sendMessageWarning(
      api,
      message,
      `Bot ${botName} (${targetOwnerId}) đã có trạng thái notify PM là "${currentStatus}"!`
    );
    return;
  }

  managerData.notifyParentPM = newStatus;
  managerDataCache.setChanged(actualBotId);
  managerDataCache.save(actualBotId);

  const statusText = newStatus ? "bật" : "tắt";
  const statusEmoji = newStatus ? "✅" : "❌";
  
  let resultMessage = `${statusEmoji} Đã ${statusText} thông báo tin nhắn riêng cho bot ${botName} (${targetOwnerId})!\n`;
  resultMessage += `Trạng thái: ${newStatus ? "Bật" : "Tắt"}`;
  
  if (isNotStarted) {
    resultMessage += `\n⚠️ Lưu ý: Bot chưa khởi động. Cấu hình sẽ được áp dụng khi bot khởi động.`;
  }

  await sendMessageComplete(api, message, resultMessage, true, TIME_TO_LIVE);
}
