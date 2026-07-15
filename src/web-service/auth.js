import session from "express-session";
import crypto from "crypto";

// ─────────────────────────────────────────────────────────────────────────
// SECURITY: Tài khoản admin không còn để mật khẩu dạng plain-text trong
// mã nguồn. Cấu hình qua biến môi trường ADMIN_USERNAME / ADMIN_PASSWORD.
// Nếu không set, sinh mật khẩu ngẫu nhiên mỗi lần khởi động và in ra log
// (an toàn hơn nhiều so với 1 mật khẩu cố định nằm sẵn trong source).
// ─────────────────────────────────────────────────────────────────────────
const ADMIN_USERNAME = process.env.ADMIN_USERNAME || "admin";
let ADMIN_PASSWORD = process.env.ADMIN_PASSWORD;

if (!ADMIN_PASSWORD) {
  ADMIN_PASSWORD = crypto.randomBytes(9).toString("base64url");
  console.warn(
    "[auth] Chưa cấu hình ADMIN_PASSWORD trong biến môi trường.\n" +
    "        Mật khẩu admin tạm thời cho phiên chạy này là:\n" +
    `        >>> ${ADMIN_PASSWORD} <<<\n` +
    "        Hãy set biến môi trường ADMIN_USERNAME / ADMIN_PASSWORD để cố định mật khẩu " +
    "(vd trong file .env hoặc script khởi động PM2/systemd)."
  );
}

// So sánh an toàn (constant-time) để tránh timing attack, và không bao giờ
// so sánh trực tiếp chuỗi người dùng nhập với `===`.
function timingSafeStringEqual(a, b) {
  const bufA = Buffer.from(String(a));
  const bufB = Buffer.from(String(b));
  if (bufA.length !== bufB.length) {
    // vẫn chạy so sánh để không lộ thông tin qua độ trễ theo độ dài chuỗi
    crypto.timingSafeEqual(bufA, bufA);
    return false;
  }
  return crypto.timingSafeEqual(bufA, bufB);
}

export const sessionSecret = process.env.SESSION_SECRET || crypto.randomBytes(32).toString("hex");

export const sessionMiddleware = session({
  secret: sessionSecret,
  resave: false,
  saveUninitialized: false,
  name: "bot.sid", // tránh dùng tên mặc định "connect.sid" giúp giảm khả năng bị dò quét tự động
  cookie: {
    httpOnly: true,
    // Bật cookie "secure" khi chạy production (giả định có HTTPS/reverse proxy).
    // Set NODE_ENV=production khi deploy thật để cookie không bị gửi qua HTTP thường.
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 86400000,
  },
});

// ── Chống brute-force đăng nhập (giới hạn theo IP, lưu trong RAM) ─────────
const loginAttempts = new Map(); // ip -> { count, firstAttempt }
const MAX_ATTEMPTS = 5;
const WINDOW_MS = 10 * 60 * 1000; // 10 phút

export function isRateLimited(ip) {
  const now = Date.now();
  const entry = loginAttempts.get(ip);
  if (!entry) return false;
  if (now - entry.firstAttempt > WINDOW_MS) {
    loginAttempts.delete(ip);
    return false;
  }
  return entry.count >= MAX_ATTEMPTS;
}

export function registerFailedAttempt(ip) {
  const now = Date.now();
  const entry = loginAttempts.get(ip);
  if (!entry || now - entry.firstAttempt > WINDOW_MS) {
    loginAttempts.set(ip, { count: 1, firstAttempt: now });
  } else {
    entry.count += 1;
  }
}

export function clearAttempts(ip) {
  loginAttempts.delete(ip);
}

export function checkAuth(username, password) {
  if (typeof username !== "string" || typeof password !== "string") return false;
  const userOk = timingSafeStringEqual(username, ADMIN_USERNAME);
  const passOk = timingSafeStringEqual(password, ADMIN_PASSWORD);
  return userOk && passOk;
}

export function requireAuth(req, res, next) {
  if (req.session && req.session.authenticated) {
    return next();
  }
  // Trả JSON cho request API thay vì redirect (redirect gây lỗi khó hiểu cho fetch/XHR)
  if (req.path.startsWith("/api") || req.xhr) {
    return res.status(401).json({ success: false, message: "Unauthorized" });
  }
  return res.redirect("/login.html");
}
