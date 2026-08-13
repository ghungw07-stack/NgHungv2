import dns from "node:dns/promises";
import fs from "node:fs/promises";
import net from "node:net";

function isPrivateIp(ip) {
  if (net.isIPv4(ip)) {
    const [a, b] = ip.split(".").map(Number);
    return a === 10 || a === 127 || a === 0 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168);
  }
  const value = ip.toLowerCase();
  return value === "::1" || value === "::" || value.startsWith("fc") || value.startsWith("fd") || value.startsWith("fe80:");
}

export class SafeHttpClient {
  constructor({ timeoutMs = 20_000, maxBytes = 25 * 1024 * 1024 } = {}) {
    this.timeoutMs = timeoutMs;
    this.maxBytes = maxBytes;
  }
  async validate(rawUrl) {
    const url = new URL(rawUrl);
    if (!["http:", "https:"].includes(url.protocol)) throw new Error("URL phải dùng HTTP hoặc HTTPS");
    const hostname = url.hostname.replace(/^\[|\]$/g, "");
    const addresses = await dns.lookup(hostname, { all: true });
    if (!addresses.length || addresses.some(({ address }) => isPrivateIp(address))) throw new Error("URL nội bộ không được phép");
    return url;
  }
  async request(rawUrl, options = {}) {
    let url = await this.validate(rawUrl);
    for (let redirects = 0; redirects <= 3; redirects++) {
      const signal = AbortSignal.timeout(options.timeoutMs || this.timeoutMs);
      const response = await fetch(url, { ...options, signal, redirect: "manual" });
      if (response.status >= 300 && response.status < 400) {
        const location = response.headers.get("location");
        if (!location || redirects === 3) throw new Error("Quá nhiều chuyển hướng HTTP");
        url = await this.validate(new URL(location, url).href);
        continue;
      }
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return response;
    }
    throw new Error("Không thể tải URL");
  }
  async json(rawUrl, options = {}) {
    const response = await this.request(rawUrl, options);
    const length = Number(response.headers.get("content-length") || 0);
    if (length > 2 * 1024 * 1024) throw new Error("JSON phản hồi quá lớn");
    return response.json();
  }
  async download(rawUrl, destination, options = {}) {
    const maxBytes = options.maxBytes || this.maxBytes;
    const response = await this.request(rawUrl, options);
    const length = Number(response.headers.get("content-length") || 0);
    if (length > maxBytes) throw new Error("File vượt quá giới hạn dung lượng");
    const handle = await fs.open(destination, "wx");
    let total = 0;
    try {
      for await (const chunk of response.body) {
        total += chunk.length;
        if (total > maxBytes) throw new Error("File vượt quá giới hạn dung lượng");
        await handle.write(chunk);
      }
    } catch (error) {
      await handle.close();
      await fs.unlink(destination).catch(() => {});
      throw error;
    }
    await handle.close();
    return { path: destination, bytes: total, contentType: response.headers.get("content-type") || "" };
  }
}
