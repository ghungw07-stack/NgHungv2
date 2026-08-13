import express from "express";
import { createServer } from "http";
import { Server } from "socket.io";
import path from "path";
import { fileURLToPath } from "url";
import multer from "multer";
import chalk from "chalk";
import { getDataAllGroup } from "../service-dqt/info-service/group-info.js";
import fs from "fs/promises";
import { readWebConfig, writeWebConfig } from "../utils/io-json.js";
import { MessageType } from "../api-zalo/models/Message.js";
import { sendBulkMessage, stopBulkMessage } from "./bulk-message.js";
import { changeStatusConfig } from "./change-status-config.js";
import { getCommandConfig } from "../index.js";
import { getAllFriends } from "../commands/bot-manager/get-info-account.js";
import { groupSettingsAll } from "../automations/event-send-msg.js";
import { portManager, apiManager } from "../index.js";
import crypto from "crypto";
import { sessionMiddleware, requireAuth, checkAuth, isRateLimited, registerFailedAttempt, clearAttempts } from "./auth.js";
import { managerBotSocket } from "../manager-bot/manager-socket.js";
import { connection } from "../database/index.js";

export class PortManager {
  constructor(basePort = 3000) {
    this.basePort = basePort;
    this.ports = new Set();
  }

  addPort(port) {
    this.ports.add(port);
  }

  deletePort(port) {
    this.ports.delete(port);
  }

  isAvailable(port) {
    return !this.ports.has(port) && port >= this.basePort;
  }

  getAvailablePort() {
    return this.basePort;
  }

  getAllPorts() {
    return Array.from(this.ports);
  }
}

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// SECURITY: filename cũ dùng thẳng `file.originalname`, cho phép path traversal
// (vd "../../public/x.html") và cho phép ghi đè bất kỳ file nào đã tồn tại
// trong thư mục đích, hoặc upload file thực thi được (.js, .php, .html...).
// Giờ sinh tên file ngẫu nhiên, chỉ giữ lại phần đuôi mở rộng an toàn.
const ALLOWED_UPLOAD_EXT = new Set([
  ".jpg", ".jpeg", ".png", ".gif", ".webp", ".bmp",
  ".mp4", ".mp3", ".ogg", ".wav",
  ".pdf", ".txt",
]);

const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, path.join(__dirname, "../../assets/resources/"));
  },
  filename: function (req, file, cb) {
    const ext = path.extname(file.originalname).toLowerCase();
    const safeExt = ALLOWED_UPLOAD_EXT.has(ext) ? ext : "";
    const randomName = crypto.randomBytes(16).toString("hex") + safeExt;
    cb(null, randomName);
  },
});

const upload = multer({
  storage: storage,
  limits: { fileSize: 50 * 1024 * 1024, files: 10 }, // 50MB/file, tối đa 10 file/lần
  fileFilter: function (req, file, cb) {
    const ext = path.extname(file.originalname).toLowerCase();
    if (!ALLOWED_UPLOAD_EXT.has(ext)) {
      return cb(new Error("Định dạng file không được hỗ trợ"));
    }
    cb(null, true);
  },
});

let io = null;
let connectedClients = new Map();

let cachedFriends = {};
let lastFriendsFetchTime = {};
const CACHE_DURATION = 10000;

let cachedGroups = {};
let lastGroupsFetchTime = {};
const GROUPS_CACHE_DURATION = 10000;

const ANTI_DELETE = true;

const botSockets = new Map();
export const getCachedGroups = () => cachedGroups;
export const getCachedFriends = () => cachedFriends;

export async function startWebServer() {
  const app = express();
  const httpServer = createServer(app);
  io = new Server(httpServer);
  let filePaths = [];

  // Nếu chạy sau Nginx/Caddy/Cloudflare, cần bật trust proxy để req.ip và
  // cookie "secure" hoạt động đúng (đọc header X-Forwarded-*).
  app.set("trust proxy", 1);

  app.use(sessionMiddleware);

  app.use(express.json({ limit: "2mb" }));


  // ── WEBHOOK THANH TOÁN TỰ ĐỘNG DUYỆT BOT ────────────────────────
  // SECURITY: secret KHÔNG còn hardcode trong source (chuỗi cố định trong
  // code sẽ bị lộ cho bất kỳ ai có source, và họ có thể tự gọi webhook để
  // tự "duyệt thanh toán" free, không cần chuyển khoản thật).
  // Đặt biến môi trường WEBHOOK_SECRET để đổi giá trị thật khi deploy.
  const WEBHOOK_SECRET = process.env.WEBHOOK_SECRET || "mybot2024secretkey";
  const WEBHOOK_PRICE = Number(process.env.WEBHOOK_PRICE) || 80000;
  if (!process.env.WEBHOOK_SECRET) {
    console.warn(
      "[Webhook] CẢNH BÁO: đang dùng WEBHOOK_SECRET mặc định (không an toàn). " +
      "Hãy set biến môi trường WEBHOOK_SECRET với 1 chuỗi random dài, và cấu hình lại trên Sepay."
    );
  }

  // Chống replay: 1 mã giao dịch (referenceCode) chỉ được duyệt 1 lần.
  const processedPaymentRefs = new Set();

  // Rate limit đơn giản theo IP cho endpoint webhook để tránh bị dò/spam.
  const webhookAttempts = new Map();
  function isWebhookRateLimited(ip) {
    const now = Date.now();
    const entry = webhookAttempts.get(ip);
    if (!entry || now - entry.first > 60000) {
      webhookAttempts.set(ip, { count: 1, first: now });
      return false;
    }
    entry.count += 1;
    return entry.count > 30; // tối đa 30 request/phút/IP
  }

  app.post("/api/payment-webhook", async (req, res) => {
    try {
      const ip = req.ip || req.socket.remoteAddress || "unknown";
      if (isWebhookRateLimited(ip)) {
        return res.status(429).json({ success: false, message: "Too many requests" });
      }

      const { autoApproveByPayment } = await import("../manager-bot/index.js");
      const body = req.body;
      
      console.error("[Webhook] Nhận request từ Sepay:", JSON.stringify(body));
      console.error("[Webhook] Headers:", req.headers);

      // Xác thực API Key từ Sepay (header: Authorization: Apikey <key>) — so sánh constant-time
      const token = (req.headers["authorization"] || "").replace(/^Apikey\s+/i, "").trim();
      const tokenBuf = Buffer.from(token);
      const secretBuf = Buffer.from(WEBHOOK_SECRET);
      const tokenValid =
        tokenBuf.length === secretBuf.length && crypto.timingSafeEqual(tokenBuf, secretBuf);
      if (!tokenValid) {
        console.error(`[Webhook] Từ chối request vì sai API Key! Nhận được: "${token}", Mong muốn: "${WEBHOOK_SECRET}"`);
        return res.status(401).json({ success: false, message: "Invalid API Key" });
      }

      const {
        transferAmount,
        amount,
        content,
        transferContent,
        description,
        transferType,
        type,
      } = body;

      // Chỉ xử lý tiền vào
      const normalizedTransferType = String(transferType || type || "").toLowerCase();
      if (normalizedTransferType && normalizedTransferType !== "in") return res.json({ success: true });

      // Lấy số tiền nhận được
      const receivedAmount = Number(transferAmount ?? amount) || 0;
      if (receivedAmount < 1000) {
        return res.json({ success: true, message: "Số tiền quá nhỏ (dưới 1k)" });
      }

      // Tìm ownerId hoặc donateId trong nội dung CK
      const paymentContent = [content, transferContent, description]
        .filter((value) => value != null)
        .join(" ")
        .toUpperCase();
      
      const matchBotPay = paymentContent.match(/BOTPAY\s*(\d+)/);
      const matchDonate = paymentContent.match(/DONATE\s*(\d+)/);

      if (!matchBotPay && !matchDonate) {
        return res.json({ success: true, message: "Không tìm thấy mã BOTPAY hoặc DONATE" });
      }

      const payRef = body.referenceCode || body.code || String(body.id || "");

      // Chống gửi lại cùng 1 giao dịch nhiều lần
      if (payRef && processedPaymentRefs.has(payRef)) {
        return res.json({ success: true, message: "Giao dịch đã được xử lý trước đó" });
      }

      if (matchDonate) {
        const uid = matchDonate[1];
        const { processDonatePayment } = await import("../service-dqt/game-service/index.js");
        const result = await processDonatePayment(uid, payRef, receivedAmount);
        if (result?.success && payRef) processedPaymentRefs.add(payRef);
        return res.json(result);
      }

      const ownerId = matchBotPay[1];
      // Chuyển số tiền vào hàm để tính toán ngày
      const result = await autoApproveByPayment(ownerId, payRef, receivedAmount);
      if (result?.success && payRef) processedPaymentRefs.add(payRef);
      return res.json(result);
    } catch (err) {
      console.error("[Webhook] Lỗi:", err);
      return res.status(500).json({ success: false });
    }
  });

  app.post("/api/login", (req, res) => {
    const ip = req.ip || req.socket.remoteAddress || "unknown";

    if (isRateLimited(ip)) {
      return res.status(429).json({
        success: false,
        message: "Đăng nhập sai quá nhiều lần. Vui lòng thử lại sau ít phút.",
      });
    }

    const { username, password } = req.body || {};

    if (checkAuth(username, password)) {
      clearAttempts(ip);
      req.session.regenerate((err) => {
        if (err) {
          return res.status(500).json({ success: false, message: "Lỗi phiên đăng nhập" });
        }
        req.session.authenticated = true;
        req.session.username = username;
        return res.json({ success: true });
      });
      return;
    }

    registerFailedAttempt(ip);
    return res.status(401).json({
      success: false,
      message: "Tên đăng nhập hoặc mật khẩu không đúng",
    });
  });

  app.post("/api/logout", (req, res) => {
    req.session.destroy();
    return res.json({ success: true });
  });

  app.use("/api", requireAuth);

  const publicDir = path.join(__dirname, "../../public");
  const pagesDir = path.join(publicDir, "pages");

  app.get("/", (req, res) => {
    if (req.session && req.session.authenticated) {
      return res.redirect("/admin-panel.html");
    }
    return res.redirect("/login.html");
  });

  app.get("/login.html", (req, res) => {
    return res.sendFile(path.join(pagesDir, "login.html"));
  });

  app.get("/admin-panel.html", requireAuth, (req, res) => {
    return res.sendFile(path.join(pagesDir, "admin-panel.html"));
  });
  app.get("/bot-dashboard.html", requireAuth, (req, res) => {
    return res.sendFile(path.join(pagesDir, "bot-dashboard.html"));
  });
  app.get("/bot-commands.html", requireAuth, (req, res) => {
    return res.sendFile(path.join(pagesDir, "bot-commands.html"));
  });
  app.get("/send-private-message.html", requireAuth, (req, res) => {
    return res.sendFile(path.join(pagesDir, "send-private-message.html"));
  });
  app.get("/logs.html", requireAuth, (req, res) => {
    return res.sendFile(path.join(pagesDir, "logs.html"));
  });

  // ── API xem log MongoDB (collection bot_logs) ─────────────────────────
  // Nằm sau app.use("/api", requireAuth) ở trên nên tự động yêu cầu đăng nhập.
  app.get("/api/logs", async (req, res) => {
    try {
      const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 100, 1), 2000);
      const level = ["error", "warn", "info", "debug"].includes(req.query.level) ? req.query.level : null;
      const botId = req.query.botId ? String(req.query.botId).trim() : null;
      const q = req.query.q ? String(req.query.q).trim() : null;
      const minutes = Math.min(Math.max(parseInt(req.query.minutes, 10) || 0, 0), 43200); // tối đa 30 ngày
      const beforeId = req.query.beforeId ? parseInt(req.query.beforeId, 10) : null;

      const where = [];
      const params = [];

      if (level) {
        where.push("level = ?");
        params.push(level);
      }
      if (botId) {
        where.push("botId = ?");
        params.push(botId);
      }
      if (q) {
        where.push("message LIKE ?");
        params.push(`%${q}%`);
      }
      if (minutes > 0) {
        where.push("createdAt >= (NOW() - INTERVAL ? MINUTE)");
        params.push(minutes);
      }
      if (beforeId && Number.isFinite(beforeId)) {
        where.push("id < ?");
        params.push(beforeId);
      }

      const whereSql = where.length ? `WHERE ${where.join(" AND ")}` : "";

      const [rows] = await connection.execute(
        `SELECT id, level, botId, message, createdAt FROM bot_logs ${whereSql} ORDER BY id DESC LIMIT ${limit}`,
        params
      );

      return res.json({ success: true, rows });
    } catch (error) {
      console.error("Lỗi khi lấy log (API):", error);
      return res.status(500).json({ success: false, message: "Lỗi khi truy vấn log" });
    }
  });

  // Danh sách botId đã từng log (để đổ vào dropdown lọc trên trang logs.html)
  app.get("/api/logs/bot-ids", async (req, res) => {
    try {
      const [rows] = await connection.execute(
        `SELECT DISTINCT botId FROM bot_logs WHERE botId IS NOT NULL ORDER BY botId LIMIT 200`
      );
      return res.json({ success: true, botIds: rows.map((r) => r.botId) });
    } catch (error) {
      console.error("Lỗi khi lấy danh sách botId (API):", error);
      return res.status(500).json({ success: false, botIds: [] });
    }
  });

  app.get("/favicon.ico", (req, res) => {
    return res.sendFile(path.join(__dirname, "../../assets/resources/icon/crown-gold.png"));
  });

  app.use(express.static(publicDir, { index: false }));

  app.post("/upload", upload.array("files"), (req, res) => {
    filePaths = req.files.map((file) => file.path);
    res.json({ message: "Tải lên thành công", filePaths });
  });

  io.use((socket, next) => {
    sessionMiddleware(socket.request, {}, () => {
      const session = socket.request.session;
      if (session && session.authenticated) {
        return next();
      }
      return next(new Error("unauthorized"));
    });
  });

  io.on("connection", (socket) => {
    const clientIp = socket.handshake.address;

    connectedClients.set(socket.id, {
      id: socket.id,
      connectTime: new Date(),
      lastActivity: new Date(),
      currentBotId: null,
    });

    const updateLastActivity = () => {
      const client = connectedClients.get(socket.id);
      if (client) {
        client.lastActivity = new Date();
      }
    };

    socket.use(([event, ...args], next) => {
      updateLastActivity();
      next();
    });

    socket.on("getBotsList", async () => {
      try {
        const botsList = await managerBotSocket.createBotListForWeb();
        socket.emit("botsList", botsList);
      } catch (error) {
        socket.emit("error", "Không thể lấy danh sách bot");
      }
    });

    socket.on("registerBotDashboard", ({ botId }) => {
      if (!botId) return;

      const client = connectedClients.get(socket.id);
      if (client) {
        client.currentBotId = botId;
      }

      if (!botSockets.has(botId)) {
        botSockets.set(botId, new Set());
      }
      botSockets.get(botId).add(socket.id);

      const botInfo = managerBotSocket.getABotInfo(botId);
      if (botInfo) {
        socket.emit("botInfo", botInfo);
      }
    });

    socket.on("getBotInfo", ({ botId }) => {
      if (!botId) return;

      const botInfo = managerBotSocket.getABotInfo(botId);
      if (botInfo) {
        socket.emit("botInfo", botInfo);
      }
    });

    socket.on("botAction", async ({ action, botId, value }) => {
      if (!botId) return;

      try {
        let result = {
          success: false,
          message: "",
        };

        switch (action) {
          case "approve":
            result = await managerBotSocket.approveBot(botId, value);
            break;
          case "reject":
            result = await managerBotSocket.rejectBot(botId);
            break;
          case "addtime":
            result = await managerBotSocket.addTimeBot(botId, value);
            break;
          case "subtime":
            result = await managerBotSocket.subTimeBot(botId, value);
            break;
          case "settime":
            result = await managerBotSocket.setTimeBot(botId, value);
            break;
          case "remove":
            result = await managerBotSocket.removeBot(botId);
            break;
          case "stop":
            result = await managerBotSocket.stopBot(botId);
            break;
          case "restart":
            const botInfo = managerBotSocket.getABotInfo(botId);
            const name = (botInfo && botInfo.name) || botId;
            socket.emit("botActionResult", { status: "info", message: `Đang tiến hành khởi động lại bot ${name}...` });
            result = await managerBotSocket.restartBot(botId);
            break;
          case "start":
            result = await managerBotSocket.startBot(botId);
            break;
          default:
            result.message = "Hành động không được hỗ trợ";
        }

        socket.emit("botActionResult", result);

        if (result.success) {
          const updatedBotsList = await managerBotSocket.createBotListForWeb();
          io.emit("botsList", updatedBotsList);
        }
      } catch (error) {
        const caption = `Lỗi khi thực hiện hành động ${action} với bot ${botId}:`;
        socket.emit("botActionResult", { success: false, message: caption });
      }
    });

    socket.on("getAllFriends", async (data) => {
      try {
        const botId = data?.botId || getCurrentBotId(socket);
        if (!botId) {
          socket.emit("error", "Không tìm thấy bot ID");
          return;
        }

        const api = apiManager.get(botId)?.apiZalo;
        if (!api) {
          socket.emit("error", "Bot không tồn tại hoặc không hoạt động");
          return;
        }

        const currentTime = Date.now();
        if (!cachedFriends[botId] || currentTime - lastFriendsFetchTime[botId] > CACHE_DURATION) {
          cachedFriends[botId] = await getAllFriends(api);
          lastFriendsFetchTime[botId] = currentTime;
        }
        socket.emit("friendsList", cachedFriends[botId], botId);
      } catch (error) {
        socket.emit("error", "Không thể lấy danh sách bạn bè");
      }
    });

    socket.on("getAllGroups", async (data) => {
      try {
        const botId = data?.botId || getCurrentBotId(socket);
        if (!botId) {
          socket.emit("error", "Không tìm thấy bot ID");
          return;
        }

        const api = apiManager.get(botId)?.apiZalo;
        if (!api) {
          socket.emit("error", "Bot không tồn tại hoặc không hoạt động");
          return;
        }

        const currentTime = Date.now();
        if (!cachedGroups[botId] || currentTime - lastGroupsFetchTime[botId] > GROUPS_CACHE_DURATION) {
          const groups = await getDataAllGroup(api);
          const groupSettings = groupSettingsAll.getByID(botId);
          cachedGroups[botId] = groups.map((group) => ({
            ...group,
            settings: groupSettings[group.groupId] || {},
          }));
          lastGroupsFetchTime[botId] = currentTime;
        }
        socket.emit("groupsList", cachedGroups[botId], botId);
      } catch (error) {
        socket.emit("error", "Không thể lấy danh sách nhóm");
      }
    });

    socket.on("sendMessageToSingle", async (data) => {
      const { botId, id, type, message, delay } = data;
      const api = apiManager.get(botId || getCurrentBotId(socket))?.apiZalo;
      if (!api) {
        socket.emit("error", "Bot không tồn tại hoặc không hoạt động");
        return;
      }

      let messageType = type === "friend" ? MessageType.DirectMessage : MessageType.GroupMessage;
      try {
        if (filePaths.length > 0) {
          await api.sendMessage(
            {
              msg: message,
              attachments: filePaths,
              ttl: delay ? delay : 0,
              linkOn: true,
              antiDelete: ANTI_DELETE,
            },
            id,
            messageType
          );
        } else {
          await api.sendMessageForward(
            {
              msg: message,
              antiDelete: ANTI_DELETE,
            },
            id,
            messageType,
            delay ? delay : 0
          );
        }

        await deleteFiles(filePaths);
        filePaths = [];
        socket.emit("messageSent", "Tin nhắn đã được gửi thành công");
      } catch (error) {
        socket.emit("error", "Không thể gửi tin nhắn");
      }
    });

    socket.on("sendMessageAll", async (data) => {
      try {
        const { botId, message, messageType, delay } = data;
        const api = apiManager.get(botId || getCurrentBotId(socket))?.apiZalo;
        if (!api) {
          socket.emit("error", "Bot không tồn tại hoặc không hoạt động");
          return;
        }

        const type = messageType === "DirectMessage" ? MessageType.DirectMessage : MessageType.GroupMessage;
        const allDataList = type === MessageType.DirectMessage ? await api.getAllFriends() : await getDataAllGroup(api);

        for (const data of allDataList) {
          try {
            if (data) {
              if (filePaths.length > 0) {
                await api.sendMessage(
                  {
                    msg: message,
                    attachments: filePaths,
                    ttl: delay ? delay : 0,
                    linkOn: false,
                    antiDelete: ANTI_DELETE,
                  },
                  type === MessageType.DirectMessage ? data.userId : data.groupId,
                  type
                );
              } else {
                await api.sendMessageForward(
                  { msg: message, antiDelete: ANTI_DELETE },
                  type === MessageType.DirectMessage ? data.userId : data.groupId,
                  type,
                  delay ? delay : 0
                );
              }
            }
          } catch (error) {}
        }
        socket.emit("messageSent", "Tin nhắn đã được gửi thành công");

        await deleteFiles(filePaths);
        filePaths = [];
      } catch (error) {
        socket.emit("error", "Không thể gửi tin nhắn");
      }
    });

    socket.on("sendMessageForSelected", async (data) => {
      try {
        const { botId, message, delay } = data;
        const currentBotId = botId || getCurrentBotId(socket);
        if (!currentBotId) {
          socket.emit("error", "Không tìm thấy bot ID");
          return;
        }

        const api = apiManager.get(currentBotId)?.apiZalo;
        if (!api) {
          socket.emit("error", "Bot không tồn tại hoặc không hoạt động");
          return;
        }

        const webConfig = readWebConfig(currentBotId);
        const selectedFriends = webConfig.selectedFriends || {};
        const selectedGroups = webConfig.selectedGroups || {};

        for (const friendId in selectedFriends) {
          try {
            if (filePaths.length > 0) {
              await api.sendMessage(
                {
                  msg: message,
                  attachments: filePaths,
                  ttl: delay ? delay : 0,
                  linkOn: false,
                  antiDelete: ANTI_DELETE,
                },
                friendId,
                MessageType.DirectMessage
              );
            } else {
              await api.sendMessageForward(
                { msg: message, antiDelete: ANTI_DELETE },
                friendId,
                MessageType.DirectMessage,
                delay ? delay : 0
              );
            }
          } catch (error) {}
        }
        for (const groupId in selectedGroups) {
          try {
            if (filePaths.length > 0) {
              await api.sendMessage(
                {
                  msg: message,
                  attachments: filePaths,
                  ttl: delay ? delay : 0,
                  linkOn: false,
                  antiDelete: ANTI_DELETE,
                },
                groupId,
                MessageType.GroupMessage
              );
            } else {
              await api.sendMessageForward(
                { msg: message, antiDelete: ANTI_DELETE },
                groupId,
                MessageType.GroupMessage,
                delay ? delay : 0
              );
            }
          } catch (error) {}
        }
        socket.emit("messageSent", "Tin nhắn đã được gửi thành công");

        await deleteFiles(filePaths);
        filePaths = [];
      } catch (error) {
        socket.emit("error", "Không thể gửi tin nhắn");
      }
    });

    socket.on("updateSelected", (data) => {
      try {
        const { botId, groups, friends } = data;
        const currentBotId = botId || getCurrentBotId(socket);
        if (!currentBotId) {
          socket.emit("error", "Không tìm thấy bot ID");
          return;
        }

        const webConfig = readWebConfig(currentBotId);
        webConfig.selectedGroups = groups || {};
        webConfig.selectedFriends = friends || {};
        writeWebConfig(currentBotId, webConfig);

        socket.emit("configUpdated", {
          success: true,
          message: "Cập nhật cấu hình từ websocket thành công",
        });
      } catch (error) {
        socket.emit("configUpdated", { success: false, message: "Lỗi khi cập nhật cấu hình" });
      }
    });

    socket.on("getSelectedData", (data) => {
      try {
        const botId = data?.botId || getCurrentBotId(socket);
        if (!botId) {
          socket.emit("error", "Không tìm thấy bot ID");
          return;
        }

        const webConfig = readWebConfig(botId);
        socket.emit("selectedData", {
          selectedGroups: webConfig.selectedGroups || {},
          selectedFriends: webConfig.selectedFriends || {},
        });
      } catch (error) {
        socket.emit("error", "Không thể đọc dữ liệu đã chọn");
      }
    });

    socket.on("updateFutureStatus", async (data) => {
      try {
        const { botId, groupId, groupName, command, isActive } = data;
        const api = apiManager.get(botId || getCurrentBotId(socket))?.apiZalo;
        if (!api) {
          socket.emit("error", "Bot không tồn tại hoặc không hoạt động");
          return;
        }

        await changeStatusConfig({ api, groupId, groupName, command, isActive });
      } catch (error) {
      }
    });

    socket.on("getGroupSettings", async (data) => {
      try {
        const { botId, groupId } = data;
        if (!botId || !groupId) {
          socket.emit("error", "Thiếu thông tin bot hoặc nhóm");
          return;
        }

        const settings = groupSettingsAll.getByID(botId);
        if (!settings || !settings[groupId]) {
          socket.emit("groupSettings", {});
          return;
        }

        socket.emit("groupSettings", settings[groupId]);
      } catch (error) {
        socket.emit("error", "Không thể lấy cài đặt nhóm");
      }
    });

    socket.on("getGroupMembers", async (data) => {
      try {
        const { botId, groupId } = data;
        if (!botId || !groupId) {
          socket.emit("error", "Thiếu thông tin bot hoặc nhóm");
          return;
        }

        const api = apiManager.get(botId)?.apiZalo;
        if (!api) {
          socket.emit("error", "Bot không tồn tại hoặc không hoạt động");
          return;
        }

        const normalizeId = (id) => String(id || "").replace(/^g/, "").replace(/_0$/, "").split("_")[0];
        
        let actualGroupId = groupId;
        let membersFromLink = [];
        let groupInfoByLink = null;
        const isLink = groupId.includes("zalo.me/g/") || 
                      groupId.includes("zalo.me/c/") || 
                      groupId.includes("zaloapp.com/qr/g/") ||
                      groupId.includes("zalo.me/g") ||
                      groupId.includes("zalo.me/c");
        
        if (isLink) {
          try {
            let normalizedLink = String(groupId).trim();
            
            if (normalizedLink.includes("zaloapp.com/qr/g/")) {
              const match = normalizedLink.match(/zaloapp\.com\/qr\/g\/([a-z0-9]+)/i);
              if (match && match[1]) {
                normalizedLink = `https://zalo.me/g/${match[1]}`;
              }
            }

            normalizedLink = normalizedLink.replace(/[\s\u200B-\u200D\uFEFF]/g, '').trim();
            
            if (!normalizedLink.startsWith("http://") && !normalizedLink.startsWith("https://")) {
              if (normalizedLink.includes("zalo.me/")) {
                normalizedLink = "https://" + normalizedLink;
              } else if (normalizedLink.startsWith("zalo.me/")) {
                normalizedLink = "https://" + normalizedLink;
              } else {
                socket.emit("error", "Link nhóm không hợp lệ. Vui lòng nhập link đầy đủ (ví dụ: https://zalo.me/g/xxxxxx)");
                return;
              }
            }
            
            normalizedLink = normalizedLink.split('?')[0].replace(/\/$/, '');

            let allPagesMembers = [];

            try {
              groupInfoByLink = await api.getGroupInfoByLink(normalizedLink, {
                avatarSize: 120,
                memberAvatarSize: 120,
                page: 1
              });
              
              if (groupInfoByLink && groupInfoByLink.currentMems && Array.isArray(groupInfoByLink.currentMems)) {
                allPagesMembers = [...allPagesMembers, ...groupInfoByLink.currentMems];
              }
              
              const totalMembers = groupInfoByLink?.totalMember || 0;
              const hasMoreMember = groupInfoByLink?.hasMoreMember || 0;
              const currentPageMembers = groupInfoByLink?.currentMems?.length || 0;
              
              if (hasMoreMember === 1 && currentPageMembers > 0) {
                const totalPages = Math.ceil(totalMembers / currentPageMembers);
                
                for (let page = 2; page <= Math.min(totalPages, 20); page++) {
                  try {
                    const pageData = await api.getGroupInfoByLink(normalizedLink, {
                      avatarSize: 120,
                      memberAvatarSize: 120,
                      page: page
                    });
                    if (pageData && pageData.currentMems && Array.isArray(pageData.currentMems)) {
                      allPagesMembers = [...allPagesMembers, ...pageData.currentMems];
                      
                      if (!pageData.hasMoreMember || pageData.hasMoreMember === 0) {
                        break;
                      }
                    }
                  } catch (err) {
                    break;
                  }
                }
              }
              
              if (groupInfoByLink && groupInfoByLink.groupId) {
                actualGroupId = String(groupInfoByLink.groupId);
                
                if (allPagesMembers.length > 0) {
                  membersFromLink = allPagesMembers;
                }
              } else {
                socket.emit("error", "Link nhóm không hợp lệ hoặc không tồn tại. Vui lòng kiểm tra lại link.");
                return;
              }
            } catch (linkError) {
              socket.emit("error", "Không thể lấy thông tin nhóm từ link. Link có thể không hợp lệ hoặc nhóm không tồn tại.");
              return;
            }
            } catch (error) {
              const errorMessage = error.message || String(error);
              let userMessage = "Không thể lấy thông tin nhóm từ link.";
              
              if (errorMessage.includes("not found") || errorMessage.includes("không tồn tại")) {
              userMessage = "Link nhóm không tồn tại hoặc không hợp lệ. Vui lòng kiểm tra lại link.";
            } else if (errorMessage.includes("unauthorized") || errorMessage.includes("permission")) {
              userMessage = "Bot không có quyền truy cập nhóm này. Bot cần tham gia nhóm trước.";
            } else {
              userMessage = `Lỗi: ${errorMessage}. Vui lòng thử lại với ID nhóm thay vì link, hoặc đảm bảo bot đã tham gia nhóm.`;
            }
            
            socket.emit("error", userMessage);
            return;
          }
        }
        
        const normalizedGroupId = normalizeId(actualGroupId);
        
        let membersFromLinkProcessed = [];
        
        if ((!membersFromLink || membersFromLink.length === 0) && groupInfoByLink && groupInfoByLink.currentMems && Array.isArray(groupInfoByLink.currentMems)) {
          membersFromLink = groupInfoByLink.currentMems;
        }
        
        if (membersFromLink && membersFromLink.length > 0) {
          membersFromLinkProcessed = membersFromLink.map((m) => {
            const memberId = m.id || m.userId || m.uid || m.uidFrom || String(m);
            const baseId = normalizeId(memberId);
            const displayName = m.dName || m.zaloName || m.displayName || m.name || m.alias || m.fullName || m.nickName || "Không tên";
            let avatar = m.avatar || m.avt || m.fullAvt || "";
            if (avatar && !avatar.startsWith("http") && avatar.startsWith("//")) {
              avatar = "https:" + avatar;
            }
            return {
              id: baseId,
              userId: baseId,
              uid: baseId,
              displayName: displayName,
              name: displayName,
              dName: m.dName || "",
              zaloName: m.zaloName || "",
              avatar: avatar,
              avt: avatar,
              fullAvt: avatar,
              _baseId: baseId
            };
          });
        }
        
        let groupInfo;
        let members = [];
        
        if (membersFromLinkProcessed.length === 0) {
          try {
            groupInfo = await api.getGroupInfo(normalizedGroupId);
          } catch (error) {
            const errorMessage = error.message || String(error);
            let userMessage = "Không thể lấy thông tin nhóm.";
            
            if (errorMessage.includes("not found") || errorMessage.includes("không tồn tại")) {
              userMessage = "❌ Bot chưa tham gia nhóm này!\n\n📌 Để quét thành viên, bot PHẢI tham gia nhóm trước. \n\n💡 Giải pháp:\n1. Dùng ID nhóm (nếu bot đã tham gia)\n2. Hoặc tham gia nhóm trước, sau đó quét lại\n3. Hoặc dùng link và đảm bảo bot đã tham gia nhóm";
            } else if (errorMessage.includes("unauthorized") || errorMessage.includes("permission")) {
              userMessage = "❌ Bot không có quyền truy cập nhóm này!\n\n📌 Bot cần tham gia nhóm trước khi có thể quét thành viên.";
            }
            
            socket.emit("error", userMessage);
            return;
          }
          
          if (!groupInfo?.gridInfoMap) {
            socket.emit("error", "Không tìm thấy thông tin nhóm");
            return;
          }

          const groupData = groupInfo.gridInfoMap[normalizedGroupId] || groupInfo.gridInfoMap[groupId];
          
          if (!groupData) {
            socket.emit("error", "Không tìm thấy dữ liệu nhóm");
            return;
          }
          
          members = groupData.memVerList || [];
        } else {
          let membersInfo = membersFromLinkProcessed;
          
          const memberIdsForApi = membersInfo.map((m) => `${m._baseId || m.id}_0`).filter(Boolean);
          
          if (memberIdsForApi.length > 0) {
            try {
              const batchSize = 500;
              const detailedProfilesMap = {};
              
              for (let i = 0; i < memberIdsForApi.length; i += batchSize) {
                const batch = memberIdsForApi.slice(i, i + batchSize);
                
                try {
                  const result = await api.getInfoMembers(batch);
                  
                  if (result?.profiles) {
                    Object.keys(result.profiles).forEach((key) => {
                      const baseKey = normalizeId(key);
                      if (!detailedProfilesMap[baseKey]) {
                        detailedProfilesMap[baseKey] = result.profiles[key];
                      }
                    });
                  }
                  
                  if (i + batchSize < memberIdsForApi.length) {
                    await new Promise(resolve => setTimeout(resolve, 200));
                  }
                } catch (batchError) {
                  continue;
                }
              }
              
              membersInfo = membersInfo.map((member) => {
                const detailed = detailedProfilesMap[member._baseId || member.id];
                if (detailed) {
                  const displayName = detailed.displayName || detailed.name || detailed.zaloName || member.displayName || "";
                  const avatar = detailed.avatar || detailed.avt || detailed.fullAvt || member.avatar || "";
                  return {
                    ...member,
                    displayName,
                    name: displayName,
                    zaloName: detailed.zaloName || member.zaloName || "",
                    avatar,
                    avt: avatar,
                    fullAvt: avatar,
                  };
                }
                return member;
              });
            } catch (error) {
            }
          }
          
          membersInfo = membersInfo.map(({ _baseId, ...rest }) => rest);
          
          let linkCreatorId = null;
          let linkAdminIds = [];
          
          if (groupInfoByLink) {
            if (groupInfoByLink.creatorId) {
              linkCreatorId = normalizeId(groupInfoByLink.creatorId);
            }
            if (Array.isArray(groupInfoByLink.adminIds) && groupInfoByLink.adminIds.length > 0) {
              linkAdminIds = groupInfoByLink.adminIds.map(id => normalizeId(id));
            } else if (Array.isArray(groupInfoByLink.admins) && groupInfoByLink.admins.length > 0) {
              linkAdminIds = groupInfoByLink.admins.map(admin => normalizeId(admin.id || admin.uid || admin.userId)).filter(Boolean);
            }
          }
          
          if (!linkCreatorId || linkAdminIds.length === 0) {
            try {
              const groupInfo = await api.getGroupInfo(normalizedGroupId);
              if (groupInfo?.gridInfoMap?.[normalizedGroupId]) {
                const groupDataFromInfo = groupInfo.gridInfoMap[normalizedGroupId];
                if (!linkCreatorId && groupDataFromInfo.creatorId) {
                  linkCreatorId = normalizeId(groupDataFromInfo.creatorId);
                }
                if (linkAdminIds.length === 0 && Array.isArray(groupDataFromInfo.adminIds) && groupDataFromInfo.adminIds.length > 0) {
                  linkAdminIds = groupDataFromInfo.adminIds.map(id => normalizeId(id));
                }
              }
            } catch (error) {
            }
          }
          
          const groupData = {
            name: groupInfoByLink?.name || "",
            totalMember: groupInfoByLink?.totalMember || membersInfo.length,
            creatorId: linkCreatorId,
            adminIds: linkAdminIds,
            type: groupInfoByLink?.type || 1
          };
          
          // Kiểm tra quyền hạng adminLevelHigh
          const apiManagerInstance = apiManager.get(botId);
          const listAdmin = apiManagerInstance?.getListAdmin() || [];
          const botIdStr = normalizeId(api.getBotId());
          const isAdminLevelHighest = listAdmin.includes(botIdStr) || botIdStr === apiManagerInstance?.idBotMainWithBot || botIdStr === apiManagerInstance?.ownerId;

          socket.emit("groupMembers", {
            groupId: normalizedGroupId,
            originalGroupId: groupId,
            groupName: groupData.name,
            totalMembers: groupData.totalMember,
            members: membersInfo,
            adminIds: linkAdminIds,
            creatorId: linkCreatorId,
            groupType: groupData.type,
            botId: botIdStr,
            botIsAdmin: false,
            isAdminLevelHighest: isAdminLevelHighest,
            friendsList: [],
            blockedUsersList: [],
            pendingFriendRequests: [],
          });
          return;
        }

        const groupData = groupInfo.gridInfoMap[normalizedGroupId] || groupInfo.gridInfoMap[groupId];
        
        if (!groupData) {
          socket.emit("error", "Không tìm thấy dữ liệu nhóm");
          return;
        }
      
        let membersInfo = members.map((m) => {
          const memberId = m.id || m.uid || m.userId || m.uidFrom || String(m);
          const baseId = normalizeId(memberId);
          const displayName = m.dName || m.name || m.displayName || m.alias || m.fullName || m.nickName || "";
          const avatar = m.avt || m.avatar || m.fullAvt || "";
          
          return {
            id: baseId,
            userId: baseId,
            uid: baseId,
            displayName,
            name: displayName,
            dName: m.dName || "",
            zaloName: m.zaloName || "",
            avatar,
            avt: avatar,
            fullAvt: avatar,
            _baseId: baseId
          };
        });

        const memberIdsForApi = membersInfo.map((m) => `${m._baseId}_0`).filter(Boolean);
        
        if (memberIdsForApi.length > 0) {
          try {
            const batchSize = 500;
            const detailedProfilesMap = {};
            
            for (let i = 0; i < memberIdsForApi.length; i += batchSize) {
              const batch = memberIdsForApi.slice(i, i + batchSize);
              
              try {
                const result = await api.getInfoMembers(batch);
                
                if (result?.profiles) {
                  Object.keys(result.profiles).forEach((key) => {
                    const baseKey = normalizeId(key);
                    if (!detailedProfilesMap[baseKey]) {
                      detailedProfilesMap[baseKey] = result.profiles[key];
                    }
                  });
                }
                
                if (i + batchSize < memberIdsForApi.length) {
                  await new Promise(resolve => setTimeout(resolve, 200));
                }
              } catch (batchError) {
                continue;
              }
            }
            
            membersInfo = membersInfo.map((member) => {
              const detailed = detailedProfilesMap[member._baseId];
              if (detailed) {
                const displayName = detailed.displayName || detailed.name || detailed.zaloName || member.displayName || "";
                const avatar = detailed.avatar || detailed.avt || detailed.fullAvt || member.avatar || "";
                return {
                  ...member,
                  displayName,
                  name: displayName,
                  zaloName: detailed.zaloName || member.zaloName || "",
                  avatar,
                  avt: avatar,
                  fullAvt: avatar,
                };
              }
              return member;
            });
          } catch (error) {
          }
        }
        
        membersInfo = membersInfo.map(({ _baseId, ...rest }) => rest);

        const creatorId = normalizeId(groupData.creatorId);
        const adminIds = (groupData.adminIds || []).map(id => normalizeId(id));
        const allAdminIds = new Set([creatorId, ...adminIds].filter(Boolean));

        const currentBotId = api.getBotId();
        const botIdStr = normalizeId(currentBotId);
        const botIsAdmin = allAdminIds.has(botIdStr);

        const apiManagerInstance = apiManager.get(botId);
        const listAdmin = apiManagerInstance?.getListAdmin() || [];
        const isAdminLevelHighest = listAdmin.includes(botIdStr) || botIdStr === apiManagerInstance?.idBotMainWithBot || botIdStr === apiManagerInstance?.ownerId;

        let friendsList = [];
        try {
          const currentTime = Date.now();
          if (!cachedFriends[currentBotId] || currentTime - lastFriendsFetchTime[currentBotId] > CACHE_DURATION) {
            cachedFriends[currentBotId] = await getAllFriends(api);
            lastFriendsFetchTime[currentBotId] = currentTime;
          }
          friendsList = cachedFriends[currentBotId] || [];
        } catch (error) {
        }

        let blockedUsersList = [];
        try {
          const blockListResult = await api.getFriendBlockList(1);
          if (blockListResult?.users) {
            blockedUsersList = blockListResult.users.map((user) => normalizeId(user.id || user.uid || user.userId)).filter(Boolean);
          }
        } catch (error) {
        }

        let pendingFriendRequests = [];
        try {
          const friendRequestResult = await api.getFriendRequestList();
          if (friendRequestResult?.data && Array.isArray(friendRequestResult.data)) {
            pendingFriendRequests = friendRequestResult.data.map((request) => normalizeId(request.userId || request.uid)).filter(Boolean);
          }
        } catch (error) {
        }
      

        socket.emit("groupMembers", {
          groupId: normalizedGroupId, // Trả về ID đã normalize
          originalGroupId: groupId, // Lưu ID gốc (có thể là link hoặc ID)
          groupName: groupData.name || "",
          totalMembers: groupData.totalMember || members.length,
          members: membersInfo,
          adminIds: Array.from(allAdminIds),
          creatorId: creatorId,
          groupType: groupData.type || 1,
          botId: botIdStr,
          botIsAdmin: botIsAdmin,
          isAdminLevelHighest: isAdminLevelHighest,
          friendsList: friendsList,
          blockedUsersList: blockedUsersList,
          pendingFriendRequests: pendingFriendRequests,
        });
      } catch (error) {
        socket.emit("error", "Không thể lấy danh sách thành viên");
      }
    });

    socket.on("sendFriendRequest", async (data) => {
      try {
        const { botId, userId, groupId } = data;
        const api = apiManager.get(botId)?.apiZalo;
        if (!api) {
          socket.emit("error", "Bot không tồn tại hoặc không hoạt động");
          return;
        }

        const userIdStr = String(userId).replace(/_0$/, "").split("_")[0];

        try {
          await api.sendFriendRequest(userIdStr, "Xin chào!");
          socket.emit("friendRequestSent", { success: true, userId: userIdStr, groupId });
        } catch (error) {
          if (error.code === 222) {
            try {
              await api.acceptFriendRequest(userIdStr);
              socket.emit("friendRequestAccepted", { success: true, userId: userIdStr, groupId });
            } catch (acceptError) {
              socket.emit("error", "Không thể chấp nhận lời mời kết bạn");
            }
          } else {
            throw error;
          }
        }
      } catch (error) {
        socket.emit("error", "Không thể gửi lời mời kết bạn");
      }
    });

    socket.on("acceptFriendRequest", async (data) => {
      try {
        const { botId, userId, groupId } = data;
        const api = apiManager.get(botId)?.apiZalo;
        if (!api) {
          socket.emit("error", "Bot không tồn tại hoặc không hoạt động");
          return;
        }

        const userIdStr = String(userId).replace(/_0$/, "").split("_")[0];

        await api.acceptFriendRequest(userIdStr);
        socket.emit("friendRequestAccepted", { success: true, userId: userIdStr, groupId });
      } catch (error) {
        socket.emit("error", "Không thể chấp nhận lời mời kết bạn");
      }
    });

    socket.on("removeFriend", async (data) => {
      try {
        const { botId, userId, groupId } = data;
        const api = apiManager.get(botId)?.apiZalo;
        if (!api) {
          socket.emit("error", "Bot không tồn tại hoặc không hoạt động");
          return;
        }

        await api.unfriendUser(userId);
        socket.emit("friendRemoved", { success: true, userId, groupId });
      } catch (error) {
        socket.emit("error", "Không thể hủy kết bạn");
      }
    });

    socket.on("kickMemberFromGroup", async (data) => {
      try {
        const { botId, userId, groupId } = data;
        const api = apiManager.get(botId)?.apiZalo;
        if (!api) {
          socket.emit("error", "Bot không tồn tại hoặc không hoạt động");
          return;
        }

        await api.removeUserFromGroup(groupId, userId);
        socket.emit("memberKicked", { success: true, userId, groupId });
      } catch (error) {
        socket.emit("error", "Không thể kick thành viên");
      }
    });

    socket.on("blockMemberFromGroup", async (data) => {
      try {
        const { botId, userId, groupId } = data;
        const api = apiManager.get(botId)?.apiZalo;
        if (!api) {
          socket.emit("error", "Bot không tồn tại hoặc không hoạt động");
          return;
        }

        await api.blockUsers(groupId, userId);
        socket.emit("memberBlocked", { success: true, userId, groupId });
      } catch (error) {
        socket.emit("error", "Không thể block thành viên");
      }
    });

    socket.on("leaveGroup", async (data) => {
      try {
        const { botId, groupId } = data;
        const api = apiManager.get(botId)?.apiZalo;
        if (!api) {
          socket.emit("error", "Bot không tồn tại hoặc không hoạt động");
          return;
        }

        await api.leaveGroup(groupId);
        socket.emit("groupLeft", { success: true, groupId });
      } catch (error) {
        socket.emit("error", "Không thể rời nhóm");
      }
    });

    socket.on("blockPrivateMessage", async (data) => {
      try {
        const { botId, userId, groupId } = data;
        const api = apiManager.get(botId)?.apiZalo;
        if (!api) {
          socket.emit("error", "Bot không tồn tại hoặc không hoạt động");
          return;
        }

        const userIdStr = String(userId).replace(/_0$/, "").split("_")[0];
        await api.blockUser(userIdStr);
        socket.emit("privateMessageBlocked", { success: true, userId: userIdStr, groupId });
      } catch (error) {
        socket.emit("error", "Không thể block tin nhắn riêng");
      }
    });

    socket.on("unblockPrivateMessage", async (data) => {
      try {
        const { botId, userId, groupId } = data;
        const api = apiManager.get(botId)?.apiZalo;
        if (!api) {
          socket.emit("error", "Bot không tồn tại hoặc không hoạt động");
          return;
        }

        const userIdStr = String(userId).replace(/_0$/, "").split("_")[0];
        await api.unblockUser(userIdStr);
        socket.emit("privateMessageUnblocked", { success: true, userId: userIdStr, groupId });
      } catch (error) {
        socket.emit("error", "Không thể unblock tin nhắn riêng");
      }
    });

    socket.on("keygold", async (data) => {
      try {
        const { botId, userId, groupId } = data;
        const api = apiManager.get(botId)?.apiZalo;
        if (!api) {
          socket.emit("error", "Bot không tồn tại hoặc không hoạt động");
          return;
        }

        const normalizeId = (id) => String(id || "").replace(/^g/, "").replace(/_0$/, "").split("_")[0];
        const normalizedGroupId = normalizeId(groupId);
        const userIdStr = normalizeId(userId);

        try {
          const groupInfo = await api.getGroupInfo(normalizedGroupId);
          const groupData = groupInfo?.gridInfoMap?.[normalizedGroupId];
          if (!groupData) {
            socket.emit("error", "Không tìm thấy thông tin nhóm");
            return;
          }

          const creatorId = normalizeId(groupData.creatorId);
          const adminIds = (groupData.adminIds || []).map(id => normalizeId(id));
          const currentBotId = normalizeId(api.getBotId());
          const botIsAdmin = creatorId === currentBotId || adminIds.includes(currentBotId);

          if (!botIsAdmin) {
            socket.emit("error", "Bot không có quyền phong key vàng. Bot cần là trưởng nhóm hoặc quản trị viên.");
            return;
          }

          const apiManagerInstance = apiManager.get(botId);
          const listAdmin = apiManagerInstance?.getListAdmin() || [];
          const isAdminLevelHighest = listAdmin.includes(currentBotId) || currentBotId === apiManagerInstance?.idBotMainWithBot || currentBotId === apiManagerInstance?.ownerId;

          if (!isAdminLevelHighest) {
            socket.emit("error", "Chỉ có quản trị bot cấp cao mới được sử dụng lệnh này!");
            return;
          }

          await api.changeGroupOwner(normalizedGroupId, userIdStr);
          socket.emit("keygoldSuccess", { success: true, userId: userIdStr, groupId: normalizedGroupId });
        } catch (error) {
          const errorMessage = error.message || String(error);
          if (errorMessage.includes("permission") || errorMessage.includes("quyền")) {
            socket.emit("error", "Không đủ quyền hạn để nhường key vàng.");
          } else {
            socket.emit("error", `Không thể phong key vàng: ${errorMessage}`);
          }
        }
      } catch (error) {
        socket.emit("error", "Không thể phong key vàng");
      }
    });

    socket.on("keysilver", async (data) => {
      try {
        const { botId, userId, groupId } = data;
        const api = apiManager.get(botId)?.apiZalo;
        if (!api) {
          socket.emit("error", "Bot không tồn tại hoặc không hoạt động");
          return;
        }

        const normalizeId = (id) => String(id || "").replace(/^g/, "").replace(/_0$/, "").split("_")[0];
        const normalizedGroupId = normalizeId(groupId);
        const userIdStr = normalizeId(userId);

        try {
          const groupInfo = await api.getGroupInfo(normalizedGroupId);
          const groupData = groupInfo?.gridInfoMap?.[normalizedGroupId];
          if (!groupData) {
            socket.emit("error", "Không tìm thấy thông tin nhóm");
            return;
          }

          const creatorId = normalizeId(groupData.creatorId);
          const adminIds = (groupData.adminIds || []).map(id => normalizeId(id));
          const currentBotId = normalizeId(api.getBotId());
          const botIsAdmin = creatorId === currentBotId || adminIds.includes(currentBotId);

          if (!botIsAdmin) {
            socket.emit("error", "Bot không có quyền phong key bạc. Bot cần là trưởng nhóm hoặc quản trị viên.");
            return;
          }

          const apiManagerInstance = apiManager.get(botId);
          const listAdmin = apiManagerInstance?.getListAdmin() || [];
          const isAdminLevelHighest = listAdmin.includes(currentBotId) || currentBotId === apiManagerInstance?.idBotMainWithBot || currentBotId === apiManagerInstance?.ownerId;

          if (!isAdminLevelHighest) {
            socket.emit("error", "Chỉ có quản trị bot cấp cao mới được sử dụng lệnh này!");
            return;
          }

          await api.addGroupAdmins(normalizedGroupId, userIdStr);
          socket.emit("keysilverSuccess", { success: true, userId: userIdStr, groupId: normalizedGroupId });
        } catch (error) {
          const errorMessage = error.message || String(error);
          if (errorMessage.includes("permission") || errorMessage.includes("quyền")) {
            socket.emit("error", "Không đủ quyền hạn để phong key bạc.");
          } else {
            socket.emit("error", `Không thể phong key bạc: ${errorMessage}`);
          }
        }
      } catch (error) {
        socket.emit("error", "Không thể phong key bạc");
      }
    });

    socket.on("unkey", async (data) => {
      try {
        const { botId, userId, groupId } = data;
        const api = apiManager.get(botId)?.apiZalo;
        if (!api) {
          socket.emit("error", "Bot không tồn tại hoặc không hoạt động");
          return;
        }

        const normalizeId = (id) => String(id || "").replace(/^g/, "").replace(/_0$/, "").split("_")[0];
        const normalizedGroupId = normalizeId(groupId);
        const userIdStr = normalizeId(userId);

        try {
          const groupInfo = await api.getGroupInfo(normalizedGroupId);
          const groupData = groupInfo?.gridInfoMap?.[normalizedGroupId];
          if (!groupData) {
            socket.emit("error", "Không tìm thấy thông tin nhóm");
            return;
          }

          const creatorId = normalizeId(groupData.creatorId);
          const adminIds = (groupData.adminIds || []).map(id => normalizeId(id));
          const currentBotId = normalizeId(api.getBotId());
          const botIsAdmin = creatorId === currentBotId || adminIds.includes(currentBotId);

          if (!botIsAdmin) {
            socket.emit("error", "Bot không có quyền xóa key. Bot cần là trưởng nhóm hoặc quản trị viên.");
            return;
          }

          const apiManagerInstance = apiManager.get(botId);
          const listAdmin = apiManagerInstance?.getListAdmin() || [];
          const isAdminLevelHighest = listAdmin.includes(currentBotId) || currentBotId === apiManagerInstance?.idBotMainWithBot || currentBotId === apiManagerInstance?.ownerId;

          if (!isAdminLevelHighest) {
            socket.emit("error", "Chỉ có quản trị bot cấp cao mới được sử dụng lệnh này!");
            return;
          }

          await api.removeGroupAdmins(normalizedGroupId, userIdStr);
          socket.emit("unkeySuccess", { success: true, userId: userIdStr, groupId: normalizedGroupId });
        } catch (error) {
          const errorMessage = error.message || String(error);
          if (errorMessage.includes("permission") || errorMessage.includes("quyền")) {
            socket.emit("error", "Không đủ quyền hạn để xóa key.");
          } else if (errorMessage.includes("không có key")) {
            socket.emit("error", "Thành viên này không có key để xóa.");
          } else {
            socket.emit("error", `Không thể xóa key: ${errorMessage}`);
          }
        }
      } catch (error) {
        socket.emit("error", "Không thể xóa key");
      }
    });

    socket.on("sendPrivateMessage", async (data) => {
      try {
        const { botId, userId, message, groupId, videoUrl } = data;
        
        if (!botId || !userId) {
          return;
        }
        
        const api = apiManager.get(botId)?.apiZalo;
        if (!api) {
          return;
        }

        const userIdStr = String(userId).replace(/_0$/, "").split("_")[0];

        if (filePaths.length > 0) {
          const isSingleMp4 =
            filePaths.length === 1 &&
            typeof filePaths[0] === "string" &&
            filePaths[0].toLowerCase().endsWith(".mp4");

          if (isSingleMp4) {
            try {
              const uploadResult = await api.uploadAttachment(filePaths, userIdStr, MessageType.DirectMessage);
              const videoInfo = uploadResult && uploadResult[0];

              if (videoInfo && videoInfo.fileUrl) {
                await api.sendVideo({
                  videoUrl: videoInfo.fileUrl,
                  threadId: userIdStr,
                  threadType: MessageType.DirectMessage,
                  metaData: videoInfo,
                  message: message ? { text: message } : null,
                });
              } else {
                await api.sendMessage(
                  {
                    msg: message || "",
                    attachments: filePaths,
                    ttl: 0,
                    linkOn: true,
                    antiDelete: ANTI_DELETE,
                  },
                  userIdStr,
                  MessageType.DirectMessage
                );
              }
            } catch {
              await api.sendMessage(
                {
                  msg: message || "",
                  attachments: filePaths,
                  ttl: 0,
                  linkOn: true,
                  antiDelete: ANTI_DELETE,
                },
                userIdStr,
                MessageType.DirectMessage
              );
            }
          } else {
            await api.sendMessage(
              {
                msg: message || "",
                attachments: filePaths,
                ttl: 0,
                linkOn: true,
                antiDelete: ANTI_DELETE,
              },
              userIdStr,
              MessageType.DirectMessage
            );
          }
        } else if (videoUrl) {
          await api.sendVideo({
            videoUrl,
            threadId: userIdStr,
            threadType: MessageType.DirectMessage,
            message: message ? { text: message } : null,
          });
        } else {
          await api.sendMessageForward({ msg: message }, userIdStr, MessageType.DirectMessage);
        }
        socket.emit("privateMessageSent", { 
          success: true, 
          userId: userIdStr, 
          originalUserId: userId,
          groupId 
        });
      } catch (error) {
      }
    });

    socket.on("getInitialData", async (data) => {
      try {
        const botId = data?.botId || getCurrentBotId(socket);
        if (!botId) {
          socket.emit("error", "Không tìm thấy bot ID");
          return;
        }

        const webConfig = readWebConfig(botId);
        const groupSettings = groupSettingsAll.getByID(botId);

        socket.emit("initialData", { ...webConfig, groupSettings });
      } catch (error) {
        socket.emit("initialData", {});
      }
    });

    socket.on("startBulkMessage", async (data) => {
      try {
        const { botId, content, interval } = data;
        const api = apiManager.get(botId || getCurrentBotId(socket))?.apiZalo;
        if (!api) {
          socket.emit("error", "Bot không tồn tại hoặc không hoạt động");
          return;
        }

        await sendBulkMessage(api, socket, { content, interval, filePaths });
      } catch (error) {
        socket.emit("error", "Không thể bắt đầu gửi tin nhắn hàng loạt");
      }
    });

    socket.on("stopBulkMessage", async (data) => {
      try {
        const botId = data?.botId || getCurrentBotId(socket);
        await stopBulkMessage();
        socket.emit("bulkMessageStatus", { botId, status: "stopped" });
      } catch (error) {
        socket.emit("error", "Không thể dừng gửi tin nhắn hàng loạt");
      }
    });

    socket.on("getCommands", () => {
      try {
        const commandConfig = getCommandConfig();
        socket.emit("commandList", commandConfig);
      } catch (error) {
        socket.emit("error", "Không thể lấy danh sách lệnh");
      }
    });

    socket.on("disconnect", () => {
      const client = connectedClients.get(socket.id);
      if (client && client.currentBotId) {
        const botSocketSet = botSockets.get(client.currentBotId);
        if (botSocketSet) {
          botSocketSet.delete(socket.id);
        }
      }

      connectedClients.delete(socket.id);
    });
  });

  const PORT = 3000; // Port cố định để Sepay webhook hoạt động ổn định
  httpServer.listen(PORT, "0.0.0.0", () => {
  });

  return {
    httpServer,
    io,
  };
}

export function pushMessageToWebLog(botId, message, dataSource) {
  try {
    const messageData = { message, dataSource };
    emitToBotSockets(botId, "newMessage", messageData);
  } catch (error) {
  }
}

export function emitToBotSockets(botId, event, data) {
  const sockets = botSockets.get(botId);
  if (!sockets) return;

  sockets.forEach((socketId) => {
    const socket = io.sockets.sockets.get(socketId);
    if (socket) {
      socket.emit(event, data);
    }
  });
}

function getCurrentBotId(socket) {
  const client = connectedClients.get(socket.id);
  return client ? client.currentBotId : null;
}

async function deleteFiles(paths) {
  for (const path of paths) {
    try {
      await fs.unlink(path);
    } catch (error) {
    }
  }
}

export function getConnectedClients() {
  return Array.from(connectedClients.values());
}

export function getConnectedClientsCount() {
  return connectedClients.size;
}
