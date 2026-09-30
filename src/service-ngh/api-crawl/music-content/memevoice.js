import axios from "axios";
import * as cheerio from "cheerio";
import {
  sendMessageComplete,
  sendMessageFailed,
  sendMessageQuery,
  sendMessageStateQuote,
  sendMessageWarning,
} from "../../chat-zalo/chat-style/chat-style.js";
import { getGlobalPrefix } from "../../service.js";
import { removeMention } from "../../../utils/format-util.js";
import { setSelectionsMapData } from "../index.js";
import { downloadAndConvertAudio } from "../../chat-zalo/chat-special/send-voice/process-audio.js";

const TIME_TO_LIVE = 600000;
const MYINSTANTS_BASE = "https://www.myinstants.com";
const SEARCH_URL = (q) => `${MYINSTANTS_BASE}/en/search/?name=${encodeURIComponent(q)}`;

const USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36";

const HEADERS = {
  accept: "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
  "accept-language": "vi-VN,vi;q=0.9,en-US;q=0.8,en;q=0.7",
  "User-Agent": USER_AGENT,
  Referer: "https://www.myinstants.com/",
};

const MP3_REGEX = /['"]([^'"]+\.mp3)['"]/gi;
const PLAY_REGEX = /play\(\s*['"]([^'"]+\.mp3)['"]/i;

/** Normalize relative path → absolute URL */
function toAbsUrl(path) {
  if (!path) return null;
  if (path.startsWith("http://") || path.startsWith("https://")) return path;
  if (path.startsWith("//")) return "https:" + path;
  if (path.startsWith("/")) return MYINSTANTS_BASE + path;
  return MYINSTANTS_BASE + "/" + path;
}

/**
 * Tìm meme voice trên myinstants.com — parser robust với nhiều selector
 * @returns {Array<{title:string, mp3Url:string, slug:string}>}
 */
export async function searchMemeVoice(query) {
  // Thử nhiều URL variant
  const urls = [
    SEARCH_URL(query),
    `${MYINSTANTS_BASE}/search/?name=${encodeURIComponent(query)}`,  // no /en/
  ];

  let html = "";
  let lastErr = null;
  for (const url of urls) {
    try {
      const { data, status } = await axios.get(url, {
        headers: HEADERS,
        timeout: 25000,
        maxRedirects: 5,
      });
      if (data && typeof data === "string" && data.length > 500) {
        html = data;
        break;
      }
    } catch (err) {
      lastErr = err;
    }
  }

  if (!html) {
    console.error("[memevoice] Không lấy được HTML, lỗi cuối:", lastErr?.message);
    return [];
  }

  const $ = cheerio.load(html);
  const seen = new Set();
  const results = [];

  const pushResult = (title, mp3Path, slug) => {
    const mp3Url = toAbsUrl(mp3Path);
    if (!mp3Url || seen.has(mp3Url)) return;
    seen.add(mp3Url);
    results.push({
      title: (title || "Untitled meme").trim().slice(0, 80),
      mp3Url,
      slug: slug || mp3Path,
    });
  };

  // Selector 1: div.instant với button.small-button onmousedown
  $("div.instant").each((_, el) => {
    const $el = $(el);
    const onmouse =
      $el.find(".small-button").attr("onmousedown") ||
      $el.find("button").attr("onmousedown") ||
      $el.find("[onmousedown]").attr("onmousedown") ||
      "";
    const m = onmouse.match(PLAY_REGEX);
    if (!m) return;

    const title = (
      $el.find("a.instant-link").first().text() ||
      $el.find(".instant-link").first().text() ||
      $el.find("a").first().text() ||
      ""
    ).trim();

    const href = $el.find("a.instant-link").attr("href") || $el.find("a").first().attr("href") || "";
    const slug = (href.match(/\/instant\/([^/]+)/) || [])[1] || m[1];

    pushResult(title || "Untitled meme", m[1], slug);
  });

  // Selector 2: [onmousedown*='play(']
  if (results.length === 0) {
    $("[onmousedown*='play(']").each((_, el) => {
      const $el = $(el);
      const onmouse = $el.attr("onmousedown") || "";
      const m = onmouse.match(PLAY_REGEX);
      if (!m) return;
      const title =
        $el.attr("title") ||
        $el.text() ||
        $el.parent().find("a").first().text() ||
        "Untitled";
      pushResult(title, m[1], m[1]);
    });
  }

  // Selector 3: data-url attribute (myinstants version mới hơn)
  if (results.length === 0) {
    $("[data-url]").each((_, el) => {
      const $el = $(el);
      const dataUrl = $el.attr("data-url");
      if (!dataUrl || !/\.mp3/i.test(dataUrl)) return;
      const title =
        $el.attr("data-name") ||
        $el.attr("title") ||
        $el.find("a").first().text() ||
        $el.parent().find("a.instant-link").first().text() ||
        "";
      pushResult(title, dataUrl, dataUrl);
    });
  }

  // Selector 4 (last resort): regex toàn bộ HTML để bắt mọi link .mp3 + đoán title gần đó
  if (results.length === 0) {
    let m;
    while ((m = MP3_REGEX.exec(html)) !== null && results.length < 30) {
      const mp3 = m[1];
      if (!mp3 || !/myinstants|media\/sounds/i.test(mp3)) continue;
      // Tìm title context: lấy text trong vòng 300 ký tự sau mp3 link
      const ctx = html.slice(m.index, m.index + 500);
      const titleMatch = ctx.match(/instant-link[^>]*>([^<]{1,80})</);
      const title = titleMatch ? titleMatch[1].trim() : "Meme #" + (results.length + 1);
      pushResult(title, mp3, mp3);
    }
  }

  if (results.length === 0) {
    console.error(`[memevoice] Search "${query}": HTML có ${html.length} ký tự nhưng không parse được result. Selectors có thể đã đổi.`);
  } else {
  }

  return results;
}

/**
 * Lấy file mp3 + upload làm voice, gửi tới user
 */
export async function handleSendMemeVoice(api, message, media) {
  try {
    await api.addReaction("HEART", message).catch(() => {});
    const voiceUrl = await downloadAndConvertAudio(media.mp3Url, api, message);
    if (!voiceUrl) {
      await sendMessageFailed(api, message, `Không tải được mp3 cho "${media.title}".`, false, 30000);
      return false;
    }
    // chat-style caption trước voice — báo meme đang phát
    await sendMessageComplete(api, message, `🔊 Đang phát: ${media.title}`, false, 60000);
    await api.sendVoice(message, voiceUrl, TIME_TO_LIVE);
    await api.addReaction("LIKE", message).catch(() => {});
    return true;
  } catch (err) {
    console.error("[memevoice] lỗi gửi voice:", err?.message || err);
    await sendMessageFailed(api, message, `Lỗi khi gửi voice: ${err?.message || err}`, false, 30000);
    return false;
  }
}

/**
 * Handler cho lệnh <memevoice <keyword>
 */
export async function handleMemeVoiceCommand(api, message, aliasCommand) {
  const senderId = message.data.uidFrom;
  const prefix = getGlobalPrefix(api.getBotId());
  const content = removeMention(message);
  const query = content.replace(`${prefix}${aliasCommand}`, "").trim();

  if (!query) {
    await sendMessageQuery(
      api, message,
      `Vui lòng nhập từ khóa tìm kiếm\nVí dụ:\n${prefix}${aliasCommand} vietnam`
    );
    return;
  }

  let results;
  try {
    results = await searchMemeVoice(query);
  } catch (err) {
    console.error("[memevoice] lỗi search:", err?.message || err);
    await sendMessageFailed(api, message, `Lỗi khi search myinstants: ${err?.message || err}`, false, 30000);
    return;
  }

  if (!results || results.length === 0) {
    await sendMessageWarning(
      api, message,
      `Không tìm thấy meme voice nào với từ khoá "${query}".`,
      false,
      45000
    );
    return;
  }

  // Cắt top 15
  const list = results.slice(0, 15);

  let caption = `🔊 Danh sách âm thanh meme tìm thấy cho "${query}":\n`;
  caption += `Hãy trả lời tin nhắn này với số thứ tự của âm thanh bạn muốn nghe!\n\n`;
  list.forEach((item, i) => {
    caption += `${i + 1}. ${item.title}\n`;
  });

  const listMsg = await sendMessageStateQuote(
    api, message,
    caption,
    true,    // state = success
    120000,
    false    
  );

  const quotedMsgId =
    listMsg?.message?.msgId?.toString() ||
    listMsg?.attachment?.[0]?.msgId?.toString();

  if (!quotedMsgId) {
    console.error("[memevoice] không lấy được quotedMsgId");
    return;
  }

  setSelectionsMapData(senderId, {
    quotedMsgId,
    collection: list,
    platform: "memevoice",
    timestamp: Date.now(),
  });
}

