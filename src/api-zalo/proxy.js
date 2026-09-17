import fetch from "node-fetch";
import { HttpsProxyAgent } from "https-proxy-agent";
import { SocksProxyAgent } from "socks-proxy-agent";

const HTTP_PROXY_PROTOCOLS = new Set(["http:", "https:"]);
const SOCKS_PROXY_PROTOCOLS = new Set(["socks:", "socks4:", "socks4a:", "socks5:", "socks5h:"]);

export function createZaloProxyTransport(proxyUrl = process.env.ZALO_PROXY_URL) {
  const value = String(proxyUrl || "").trim();
  if (!value) return {};

  let protocol;
  try {
    protocol = new URL(value).protocol.toLowerCase();
  } catch {
    throw new Error("ZALO_PROXY_URL không hợp lệ");
  }

  let agent;
  if (HTTP_PROXY_PROTOCOLS.has(protocol)) agent = new HttpsProxyAgent(value);
  else if (SOCKS_PROXY_PROTOCOLS.has(protocol)) agent = new SocksProxyAgent(value);
  else throw new Error("ZALO_PROXY_URL chỉ hỗ trợ HTTP, HTTPS hoặc SOCKS");

  return {
    agent,
    polyfill: (url, options = {}) => fetch(url, { ...options, agent }),
  };
}
