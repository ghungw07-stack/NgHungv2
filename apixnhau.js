import axios from "axios";
import { pathToFileURL } from "node:url";

export const ADULT_API_BASE_URL = "https://www.pornhub.com/webmasters";
const client = axios.create({ baseURL: ADULT_API_BASE_URL, timeout: 20_000, headers: { Accept: "application/json", "User-Agent": "Mozilla/5.0 (compatible; NgHungBot/1.0)" } });
const MINOR_TERMS = /(?:^|\W)(?:under\s*18|minor|teen(?:ager)?|school\s*(?:girl|boy|student)|high\s*school|middle\s*school|child|kid|preteen|lolita|2k(?:0[89]|1\d)|lớp\s*(?:[1-9]|10|11|12)|học\s*sinh|trẻ\s*em|vị\s*thành\s*niên|chưa\s*đủ\s*18)(?:\W|$)/iu;

function assertAdultQuery(value) {
  if (MINOR_TERMS.test(String(value || ""))) throw new Error("Từ khóa không phù hợp với nguồn chỉ dành cho người trưởng thành");
}

function isAdultSafe(video) {
  const metadata = [video?.title, ...(video?.tags || []).map((item) => item?.tag_name || item), ...(video?.categories || []).map((item) => item?.category || item)].join(" ");
  return !MINOR_TERMS.test(metadata);
}

function normalizeVideo(video) {
  return { id: String(video.video_id || ""), title: String(video.title || "Video 18+").trim(), url: String(video.url || ""), thumbnail: video.thumb || video.default_thumb || video.thumbs?.[0]?.src || "", preview: "", duration: String(video.duration || ""), publishedAt: video.publish_date || "", provider: "Pornhub Webmasters API" };
}

function normalizeList(payload, limit) {
  return (Array.isArray(payload?.videos) ? payload.videos : []).filter((video) => video?.video_id && video?.url && isAdultSafe(video)).slice(0, Math.max(1, Math.min(Number(limit) || 12, 50))).map(normalizeVideo);
}

export async function getLatestVideos({ page = 1, limit = 12 } = {}) {
  const safePage = Math.max(1, Math.min(Number(page) || 1, 100));
  const { data } = await client.get("/search", { params: { search: "verified", ordering: "mostviewed", page: safePage, thumbsize: "medium" } });
  return normalizeList(data, limit);
}

export async function searchVideos(keyword, { page = 1, limit = 12 } = {}) {
  const query = String(keyword || "").trim();
  if (!query) return getLatestVideos({ page, limit });
  assertAdultQuery(query);
  const safePage = Math.max(1, Math.min(Number(page) || 1, 100));
  const { data } = await client.get("/search", { params: { search: query, ordering: "newest", page: safePage, thumbsize: "medium" } });
  return normalizeList(data, limit);
}

function parseVideoId(value) {
  const input = String(value || "");
  return input.match(/[?&]viewkey=([a-z0-9]+)/i)?.[1] || (/^[a-z0-9]+$/i.test(input) ? input : "");
}

function readJsonArray(html, propertyName) {
  const marker = `"${propertyName}":`;
  const start = html.indexOf(marker);
  if (start < 0) return [];
  const arrayStart = html.indexOf("[", start + marker.length);
  if (arrayStart < 0) return [];
  let depth = 0;
  let quoted = false;
  let escaped = false;
  for (let index = arrayStart; index < html.length; index++) {
    const char = html[index];
    if (quoted) {
      if (escaped) escaped = false;
      else if (char === "\\") escaped = true;
      else if (char === '"') quoted = false;
      continue;
    }
    if (char === '"') quoted = true;
    else if (char === "[") depth++;
    else if (char === "]" && --depth === 0) {
      try { return JSON.parse(html.slice(arrayStart, index + 1)); } catch { return []; }
    }
  }
  return [];
}

export async function getVideoDetails(videoUrlOrId) {
  const id = parseVideoId(videoUrlOrId);
  if (!id) throw new Error("URL video 18+ không hợp lệ");
  const { data } = await client.get("/video_by_id", { params: { id, thumbsize: "medium" } });
  const raw = data?.video;
  if (!raw || !isAdultSafe(raw)) throw new Error("Video không vượt qua bộ lọc an toàn 18+");
  const { data: embedHtml } = await client.get(`https://www.pornhub.com/embed/${encodeURIComponent(id)}`, { responseType: "text" });
  const definitions = readJsonArray(String(embedHtml), "mediaDefinitions");
  const resolvedDefinitions = (await Promise.all(definitions.map(async (item) => {
    if (item?.format !== "mp4" || !/\/video\/get_media\?/i.test(item?.videoUrl || "")) return [item];
    try {
      const { data: media } = await client.get(item.videoUrl);
      return Array.isArray(media) ? media : [];
    } catch { return []; }
  }))).flat();
  const sources = resolvedDefinitions
    .filter((item) => item?.videoUrl && ["mp4", "hls"].includes(item.format))
    .map((item) => ({ quality: `${item.quality || item.height || "video"}p`, url: item.videoUrl, format: item.format }))
    .sort((a, b) => (a.format === "mp4" ? -1 : 1) - (b.format === "mp4" ? -1 : 1));
  return { ...normalizeVideo(raw), pageUrl: raw.url, categories: (raw.categories || []).map((item) => item?.category || item).filter(Boolean).join(", "), sources };
}

async function runCli() {
  const [action = "latest", ...args] = process.argv.slice(2);
  const result = action === "detail" ? await getVideoDetails(args[0]) : action === "search" ? await searchVideos(args.join(" ")) : await getLatestVideos({ page: Number(args[0]) || 1 });
  console.log(JSON.stringify(result, null, 2));
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  runCli().catch((error) => { console.error(error.response?.status ? `HTTP ${error.response.status}: ${error.message}` : error.message); process.exitCode = 1; });
}
