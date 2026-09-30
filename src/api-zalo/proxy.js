import fetch from "node-fetch";
import http from "node:http";
import https from "node:https";
import { HttpsProxyAgent } from "https-proxy-agent";
import { SocksProxyAgent } from "socks-proxy-agent";

const HTTP_PROXY_PROTOCOLS = new Set(["http:", "https:"]);
const SOCKS_PROXY_PROTOCOLS = new Set(["socks:", "socks4:", "socks4a:", "socks5:", "socks5h:"]);
const directHttpAgent = new http.Agent({ keepAlive: true, maxSockets: 64, maxFreeSockets: 16 });
const directHttpsAgent = new https.Agent({ keepAlive: true, maxSockets: 64, maxFreeSockets: 16 });

export function createZaloProxyTransport(proxyUrl = process.env.ZALO_PROXY_URL) {
  const value = String(proxyUrl || "").trim();
  if (!value) {
    return {
      // WebSocket và node-fetch đều chấp nhận Agent object; không dùng
      // callback agent vì ws truyền thẳng options.agent vào https.request.
      agent: directHttpsAgent,
      polyfill: (url, options = {}) => fetch(url, {
        ...options,
        agent: options.agent || ((target) => String(target).startsWith("https:") ? directHttpsAgent : directHttpAgent),
      }),
    };
  }

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
