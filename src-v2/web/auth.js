import crypto from "node:crypto";

export function timingSafeEqual(left, right) {
  const a = Buffer.from(String(left || "")), b = Buffer.from(String(right || ""));
  if (a.length !== b.length) { crypto.timingSafeEqual(a, a); return false; }
  return crypto.timingSafeEqual(a, b);
}

export function createBasicAuth({ username = process.env.ADMIN_USERNAME, password = process.env.ADMIN_PASSWORD } = {}) {
  return (req, res, next) => {
    if (!username || !password) return res.status(503).json({ success: false, message: "Admin web chưa được cấu hình" });
    const raw = String(req.headers.authorization || "");
    if (!raw.startsWith("Basic ")) return res.status(401).set("WWW-Authenticate", "Basic").json({ success: false });
    let suppliedUser = "", suppliedPassword = "";
    try {
      const decoded = Buffer.from(raw.slice(6), "base64").toString("utf8");
      const separator = decoded.indexOf(":");
      suppliedUser = decoded.slice(0, separator); suppliedPassword = decoded.slice(separator + 1);
    } catch {}
    if (!timingSafeEqual(suppliedUser, username) || !timingSafeEqual(suppliedPassword, password)) {
      return res.status(401).set("WWW-Authenticate", "Basic").json({ success: false });
    }
    next();
  };
}
