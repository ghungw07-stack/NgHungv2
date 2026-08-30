import axios from "axios";
import puppeteer from "puppeteer";
import { connect } from "puppeteer-real-browser";

let browser = null;
let browserReal = null;
let pageReal = null;
let browserLaunchPromise = null;
let browserRealLaunchPromise = null;
let client = axios.create({
  headers: {
    accept: "*/*",
    "accept-language": "en-US,en;q=0.9,vi;q=0.8",
    "user-agent":
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/135.0.0.0 Safari/537.36",
  },
});

// PERF: bật thêm các cờ giảm RAM cho Chromium. Mặc định puppeteer.launch({headless:true})
// không tắt GPU/extension/background-timers... khiến mỗi instance Chromium có thể tốn
// 200-400MB+ RAM. Các cờ dưới đây giúp giảm đáng kể mà không ảnh hưởng chức năng crawl/scrape.
const MEMORY_SAVING_ARGS = [
  "--disable-gpu",
  "--disable-dev-shm-usage", // tránh lỗi/crash khi /dev/shm nhỏ (phổ biến trên VPS RAM thấp), đồng thời giảm RAM ảo
  "--disable-extensions",
  "--disable-background-networking",
  "--disable-background-timer-throttling",
  "--disable-backgrounding-occluded-windows",
  "--disable-breakpad",
  "--disable-component-extensions-with-background-pages",
  "--disable-features=TranslateUI,BlinkGenPropertyTrees",
  "--disable-ipc-flooding-protection",
  "--disable-renderer-backgrounding",
  "--no-first-run",
  "--no-zygote", // giảm số tiến trình con -> giảm RAM tổng, đổi lại tốc độ khởi động chậm hơn chút
  "--js-flags=--max-old-space-size=256", // giới hạn heap V8 của trang render, tránh phình RAM khi crawl trang nặng
];

// PERF: nếu để browser singleton sống mãi mãi, nó chiếm RAM liên tục kể cả
// lúc không ai dùng tính năng crawl/scrape. Tự đóng sau 5 phút không hoạt động,
// lần gọi launchBrowser() tiếp theo sẽ tự mở lại (mất thêm ~1-2s nhưng đổi lại
// tiết kiệm RAM đáng kể lúc bot rảnh).
const BROWSER_IDLE_TIMEOUT_MS = 5 * 60 * 1000;
let browserIdleTimer = null;

function scheduleBrowserIdleClose() {
  if (browserIdleTimer) clearTimeout(browserIdleTimer);
  browserIdleTimer = setTimeout(() => {
    if (browser) {
      browser.close().catch(() => {});
      browser = null;
    }
  }, BROWSER_IDLE_TIMEOUT_MS);
  browserIdleTimer.unref?.(); // không giữ process sống chỉ vì timer này
}

export async function launchBrowser() {
  if (!browser?.connected) browser = null;
  if (!browser && !browserLaunchPromise) {
    browserLaunchPromise = puppeteer.launch({
      headless: true,
      args: MEMORY_SAVING_ARGS,
    }).then((launchedBrowser) => {
      browser = launchedBrowser;
      launchedBrowser.once("disconnected", () => {
        if (browser === launchedBrowser) browser = null;
      });
      return launchedBrowser;
    }).finally(() => {
      browserLaunchPromise = null;
    });
  }
  if (!browser) await browserLaunchPromise;
  scheduleBrowserIdleClose();
  return browser;
}

export async function launchBrowserReal() {
  if (!browserReal && !browserRealLaunchPromise) {
    browserRealLaunchPromise = connect({
      headless: false,
      args: ["--window-size=1920,1080", "--disable-blink-features=AutomationControlled"],
      customConfig: {},
      turnstile: true,
      connectOption: {},
      disableXvfb: false,
      ignoreAllFlags: false,
    }).then(({ browser: launchedBrowser, page }) => {
      browserReal = launchedBrowser;
      pageReal = page;
      return launchedBrowser;
    }).finally(() => {
      browserRealLaunchPromise = null;
    });
  }
  if (!browserReal) await browserRealLaunchPromise;
  return browserReal;
}

export async function launchPageBrowserReal() {
  if (!browserReal) {
    browserReal = await launchBrowserReal();
  }
  if (!pageReal) {
    pageReal = await browserReal.newPage();
  }
  return pageReal;
}

export async function closeBrowserReal() {
  if (browserReal) {
    await browserReal.close();
    browserReal = null;
    pageReal = null;
  }
}

export async function closeBrowser() {
  if (browserIdleTimer) {
    clearTimeout(browserIdleTimer);
    browserIdleTimer = null;
  }
  if (browser) {
    await browser.close();
    browser = null;
  }
}

export async function clearPage() {
  try {
    if (browser) {
      const pages = await browser.pages();
      for (const page of pages) {
        await page.close();
      }
    }
  } finally {
  }
}

export function getClientAxios() {
  return client;
}
