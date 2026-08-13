import axios from "axios";
import * as cheerio from "cheerio";

const TVPL_MOBILE_ORIGIN = "https://m.thuvienphapluat.vn";
const TVPL_SEARCH_URL = `${TVPL_MOBILE_ORIGIN}/tim-kiem-van-ban.html`;
const DUCKDUCKGO_SEARCH_URL = "https://html.duckduckgo.com/html/";
const VIETLEX_SEARCH_URL = "https://vietlex.vn/api/v1/search";
const VIETLEX_DOCUMENT_URL = "https://vietlex.vn/api/v1/document";
const REQUEST_TIMEOUT = 12000;
const MAX_RESULTS = 5;
const OPEN_API_RESULT_LIMIT = 10;
const MAX_QUERY_LENGTH = 160;
const BLOCK_RETRY_DELAY = 10 * 60 * 1000;
const MAX_PDF_SIZE = 40 * 1024 * 1024;
const FULL_TEXT_CACHE_TTL = 30 * 60 * 1000;

const GAME_RULES_FROM_JULY_2026 = {
  documentNumber: "174/2026/NĐ-CP",
  searchQuery: "174/2026/NĐ-CP",
  title:
    "Nghị định số 174/2026/NĐ-CP quy định xử phạt vi phạm hành chính trong lĩnh vực bưu chính, viễn thông, tần số vô tuyến điện, giao dịch điện tử và công nghệ thông tin",
  type: "Nghị định",
  issuedDate: "2026-05-15",
  effectiveDate: "2026-07-01",
  relevantArticles: "Điều 98, 99, 100 và 101",
  tvplUrl:
    "https://m.thuvienphapluat.vn/van-ban/Cong-nghe-thong-tin/Nghi-dinh-174-2026-ND-CP-xu-phat-vi-pham-hanh-chinh-linh-vuc-buu-chinh-vien-thong-706354.aspx",
  officialUrl:
    "https://congbao.chinhphu.vn/van-ban/nghi-dinh-so-174-2026-nd-cp-469616.htm",
  pdfUrl:
    "https://congbaocdn.chinhphu.vn/180507251028987904/2026/6/5/469616-1780456267_v1_1780620736_signed.pdf",
  source: "congbao.chinhphu.vn",
};

let directSearchBlockedUntil = 0;
const fullTextCache = new Map();

const REQUEST_HEADERS = {
  Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
  "Accept-Language": "vi-VN,vi;q=0.9,en;q=0.7",
  "Cache-Control": "no-cache",
  "User-Agent":
    "Mozilla/5.0 (Linux; Android 13) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Mobile Safari/537.36",
};

export function cleanTvplText(value, maxLength = 300) {
  const text = String(value || "")
    .replace(/\s+/g, " ")
    .replace(/\s+([,.;:!?])/g, "$1")
    .trim();
  if (text.length <= maxLength) return text;
  return `${text.slice(0, maxLength - 1).trimEnd()}…`;
}

function normalizeForComparison(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/g, "d")
    .replace(/Đ/g, "D")
    .toLowerCase()
    .replace(/[^a-z0-9/.-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeDocumentNumber(value) {
  return normalizeForComparison(value).replace(/[^a-z0-9]/g, "");
}

function resolveKnownNaturalQuery(query) {
  const normalized = normalizeForComparison(query);
  const years = normalized.match(/\b20\d{2}\b/g) || [];
  const isGameQuery = /\bgame\b|\btro choi dien tu\b/.test(normalized);
  const mentionsJulyFirst =
    /\b0?1[/.\-]0?7(?:[/.\-]20\d{2})?\b/.test(normalized) ||
    /\bngay 0?1 thang 0?7\b/.test(normalized);
  const targets2026 = years.length === 0 || years.every((year) => year === "2026");

  return isGameQuery && mentionsJulyFirst && targets2026 ? GAME_RULES_FROM_JULY_2026 : null;
}

function joinPdfTextItems(items) {
  const lines = [];
  let currentLine = "";

  for (const item of items) {
    const value = String(item?.str || "");
    currentLine += value;
    if (item?.hasEOL) {
      if (currentLine.trim()) lines.push(currentLine.trim());
      currentLine = "";
    }
  }
  if (currentLine.trim()) lines.push(currentLine.trim());
  return lines.join("\n");
}

export async function extractOfficialDocumentText(pdfUrl) {
  if (!pdfUrl) throw new Error("Văn bản không có nguồn PDF để trích xuất nội dung");

  const cached = fullTextCache.get(pdfUrl);
  if (cached && Date.now() - cached.createdAt < FULL_TEXT_CACHE_TTL) return cached.value;

  const response = await axios.get(pdfUrl, {
    responseType: "arraybuffer",
    headers: REQUEST_HEADERS,
    timeout: 60_000,
    maxContentLength: MAX_PDF_SIZE,
    maxBodyLength: MAX_PDF_SIZE,
  });
  const pdfData = new Uint8Array(response.data);
  if (pdfData.byteLength > MAX_PDF_SIZE) throw new Error("Văn bản vượt quá giới hạn trích xuất");

  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const loadingTask = pdfjs.getDocument({ data: pdfData, disableWorker: true });
  const pdf = await loadingTask.promise;
  const pageCount = pdf.numPages;
  const pages = [];

  try {
    for (let pageNumber = 1; pageNumber <= pageCount; pageNumber += 1) {
      const page = await pdf.getPage(pageNumber);
      const textContent = await page.getTextContent();
      const pageText = joinPdfTextItems(textContent.items)
        .replace(/[ \t]+\n/g, "\n")
        .replace(/\n{3,}/g, "\n\n")
        .trim();
      pages.push(`=== TRANG ${pageNumber}/${pageCount} ===\n${pageText || "[Trang không có lớp chữ]"}`);
      page.cleanup();
    }
  } finally {
    await pdf.destroy();
  }

  const value = {
    text: pages.join("\n\n"),
    pageCount,
  };
  fullTextCache.set(pdfUrl, { value, createdAt: Date.now() });
  return value;
}

function isTvplDocumentUrl(value) {
  try {
    const url = new URL(value);
    const hostname = url.hostname.toLowerCase();
    const pathname = url.pathname.toLowerCase();
    return (
      (hostname === "thuvienphapluat.vn" ||
        hostname === "www.thuvienphapluat.vn" ||
        hostname === "m.thuvienphapluat.vn") &&
      (pathname.startsWith("/van-ban/") || pathname.startsWith("/cong-van/")) &&
      pathname.endsWith(".aspx")
    );
  } catch {
    return false;
  }
}

function toMobileTvplUrl(value) {
  try {
    const url = new URL(value);
    if (!isTvplDocumentUrl(url.href)) return null;
    url.protocol = "https:";
    url.hostname = "m.thuvienphapluat.vn";
    url.port = "";
    url.search = "";
    url.hash = "";
    return url.href;
  } catch {
    return null;
  }
}

function decodeDuckDuckGoUrl(value) {
  try {
    const absolute = new URL(value, "https://duckduckgo.com");
    const target = absolute.searchParams.get("uddg");
    return target ? decodeURIComponent(target) : absolute.href;
  } catch {
    return value;
  }
}

function addUniqueResult(results, seenUrls, result) {
  const url = toMobileTvplUrl(result.url);
  const title = cleanTvplText(result.title, 180);
  if (!url || !title || seenUrls.has(url)) return;
  seenUrls.add(url);
  results.push({
    title,
    description: cleanTvplText(result.description, 280),
    url,
  });
}

function parseTvplSearchHtml(html) {
  const $ = cheerio.load(html);
  const results = [];
  const seenUrls = new Set();

  $("a[href]").each((_, element) => {
    if (results.length >= MAX_RESULTS) return false;
    const anchor = $(element);
    const rawUrl = anchor.attr("href");
    let absoluteUrl;
    try {
      absoluteUrl = new URL(rawUrl, TVPL_MOBILE_ORIGIN).href;
    } catch {
      return;
    }
    if (!isTvplDocumentUrl(absoluteUrl)) return;

    const container = anchor.closest("article, li, .news-card, .item, .result, .row").first();
    const containerText = container.length ? container.text() : anchor.parent().text();
    const title = cleanTvplText(anchor.text(), 180);
    const description = cleanTvplText(containerText.replace(anchor.text(), ""), 280);
    addUniqueResult(results, seenUrls, { title, description, url: absoluteUrl });
  });

  return results;
}

function isCloudflareChallenge(html) {
  const content = String(html || "").toLowerCase();
  return (
    content.includes("cf-chl-") ||
    content.includes("just a moment") ||
    content.includes("challenges.cloudflare.com")
  );
}

async function searchTvplDirect(query) {
  if (Date.now() < directSearchBlockedUntil) return [];

  try {
    const response = await axios.get(TVPL_SEARCH_URL, {
      params: { keyword: query },
      headers: REQUEST_HEADERS,
      timeout: REQUEST_TIMEOUT,
      maxContentLength: 3 * 1024 * 1024,
    });
    if (isCloudflareChallenge(response.data)) {
      directSearchBlockedUntil = Date.now() + BLOCK_RETRY_DELAY;
      return [];
    }
    return parseTvplSearchHtml(response.data);
  } catch (error) {
    const status = Number(error?.response?.status || 0);
    if (status === 403 || status === 429 || status === 503) {
      directSearchBlockedUntil = Date.now() + BLOCK_RETRY_DELAY;
    }
    return [];
  }
}

async function searchTvplThroughDuckDuckGo(query) {
  const response = await axios.get(DUCKDUCKGO_SEARCH_URL, {
    params: { q: `site:thuvienphapluat.vn ${query}` },
    headers: { ...REQUEST_HEADERS, "User-Agent": "Mozilla/5.0" },
    timeout: REQUEST_TIMEOUT,
    maxContentLength: 3 * 1024 * 1024,
  });
  const $ = cheerio.load(response.data);
  const results = [];
  const seenUrls = new Set();

  $(".result").each((_, element) => {
    if (results.length >= MAX_RESULTS) return false;
    const item = $(element);
    const anchor = item.find("a.result__a").first();
    addUniqueResult(results, seenUrls, {
      title: anchor.text(),
      description: item.find(".result__snippet").first().text(),
      url: decodeDuckDuckGoUrl(anchor.attr("href")),
    });
  });

  return results;
}

function createTvplSearchLink(keyword) {
  const url = new URL(TVPL_SEARCH_URL);
  url.searchParams.set("keyword", keyword);
  return url.href;
}

async function fetchOpenLegalRows(query, limit = OPEN_API_RESULT_LIMIT) {
  const response = await axios.get(VIETLEX_SEARCH_URL, {
    params: { q: query, limit },
    headers: REQUEST_HEADERS,
    timeout: REQUEST_TIMEOUT,
  });
  return Array.isArray(response.data?.results) ? response.data.results : [];
}

async function fetchOpenLegalDocument(id) {
  if (!id) return null;
  try {
    const response = await axios.get(`${VIETLEX_DOCUMENT_URL}/${encodeURIComponent(id)}`, {
      headers: REQUEST_HEADERS,
      timeout: REQUEST_TIMEOUT,
    });
    return response.data?.document || null;
  } catch {
    return null;
  }
}

function toOpenLegalResult(row, knownDocument = null) {
  const title = cleanTvplText(row?.title || knownDocument?.title, 500);
  const documentNumber = cleanTvplText(row?.soHieu || knownDocument?.documentNumber, 80);
  if (!title) return null;

  const metadata = [
    documentNumber ? `Số hiệu: ${documentNumber}` : "",
    row?.loai || knownDocument?.type
      ? `Loại: ${cleanTvplText(row?.loai || knownDocument?.type, 50)}`
      : "",
    row?.ngayBanHanh || knownDocument?.issuedDate
      ? `Ban hành: ${cleanTvplText(row?.ngayBanHanh || knownDocument?.issuedDate, 30)}`
      : "",
    row?.linhVuc ? `Lĩnh vực: ${cleanTvplText(row.linhVuc, 80)}` : "",
  ].filter(Boolean);

  return {
    id: row?.id || null,
    title,
    documentNumber,
    type: cleanTvplText(row?.loai || knownDocument?.type, 50),
    issuedDate: cleanTvplText(row?.ngayBanHanh || knownDocument?.issuedDate, 30),
    effectiveDate: knownDocument?.effectiveDate || "",
    relevantArticles: knownDocument?.relevantArticles || "",
    description: metadata.join(" · "),
    url: knownDocument?.tvplUrl || createTvplSearchLink(documentNumber || title),
    officialUrl: row?._detailUrl || row?.url || knownDocument?.officialUrl || "",
    pdfUrl: row?.pdfUrl || knownDocument?.pdfUrl || "",
    source: row?.nguon || knownDocument?.source || "vietlex.vn",
    metadataSource: row ? "vietlex.vn" : "built-in-resolution",
  };
}

function scoreOpenLegalRow(row, query, index) {
  const normalizedQuery = normalizeForComparison(query);
  const queryNumber = normalizeDocumentNumber(query);
  const rowNumber = normalizeDocumentNumber(row?.soHieu);
  const haystack = normalizeForComparison(`${row?.soHieu || ""} ${row?.title || ""}`);
  const ignoredWords = new Set([
    "luat",
    "nghi",
    "dinh",
    "quy",
    "dinh",
    "van",
    "ban",
    "sau",
    "tu",
    "ngay",
    "ve",
    "va",
    "cua",
  ]);
  const tokens = normalizedQuery
    .split(" ")
    .filter((token) => token.length > 1 && !ignoredWords.has(token));
  const matchingTokens = tokens.filter((token) => haystack.includes(token)).length;
  let score = Math.max(0, 20 - index);

  if (queryNumber && rowNumber && queryNumber === rowNumber) score += 1000;
  if (rowNumber && queryNumber.includes(rowNumber)) score += 250;
  score += matchingTokens * 20;
  if (tokens.length > 0 && matchingTokens === tokens.length) score += 80;
  if (row?.pdfUrl) score += 5;
  return score;
}

async function searchThroughOpenLegalApi(query) {
  const rows = await fetchOpenLegalRows(query, MAX_RESULTS);
  const seen = new Set();
  const results = [];

  for (const row of rows) {
    const result = toOpenLegalResult(row);
    const dedupeKey = `${result?.documentNumber}|${result?.title}`.toLowerCase();
    if (!result || seen.has(dedupeKey)) continue;
    seen.add(dedupeKey);
    results.push(result);
    if (results.length >= MAX_RESULTS) break;
  }

  return results;
}

export async function resolveTvplDocument(rawQuery) {
  const query = cleanTvplText(rawQuery, MAX_QUERY_LENGTH);
  if (!query) return null;

  const knownDocument = resolveKnownNaturalQuery(query);
  const searchQuery = knownDocument?.searchQuery || query;

  // Quy tắc này đã được đối chiếu với TVPL và Công báo; trả ngay để
  // câu hỏi tự nhiên không bị API tìm kiếm xếp sang văn bản thể thao không liên quan.
  if (knownDocument) return toOpenLegalResult(null, knownDocument);

  try {
    const rows = await fetchOpenLegalRows(searchQuery);
    const rankedRows = rows
      .map((row, index) => ({ row, score: scoreOpenLegalRow(row, searchQuery, index) }))
      .sort((left, right) => right.score - left.score);
    const selectedRow = rankedRows[0]?.row;

    if (selectedRow) {
      const detail = await fetchOpenLegalDocument(selectedRow.id);
      return toOpenLegalResult({ ...selectedRow, ...detail });
    }
  } catch {
    // Tiếp tục bằng quy tắc đã xác minh hoặc kết quả TVPL khi API dự phòng gián đoạn.
  }

  const results = await searchTvplDocuments(query);
  return results[0] || null;
}

export async function searchTvplDocuments(rawQuery) {
  const query = cleanTvplText(rawQuery, MAX_QUERY_LENGTH);
  if (!query) return [];

  const directResults = await searchTvplDirect(query);
  if (directResults.length > 0) return directResults;

  try {
    const indexedResults = await searchTvplThroughDuckDuckGo(query);
    if (indexedResults.length > 0) return indexedResults;
  } catch {
    // Chuyển sang API dữ liệu pháp luật mở khi công cụ tìm kiếm bật chống bot.
  }

  return searchThroughOpenLegalApi(query);
}
