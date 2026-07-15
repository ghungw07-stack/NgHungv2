import axios from "axios";
import { findDescriptionOfVocabulary } from "../../assistant-ai/gemini.js";
import { addWordCrawlIntoData, sohaFindTuDien } from "./vietnam-word.js";

/**
 * Get vocabulary data information
 */
export async function searchWordWikipedia(term) {
  let status = "failed";
  const dataResult = { title: "", extract: "" };
  try {
    const url = `https://vi.wikipedia.org/w/api.php?action=query&prop=extracts&exsentences=5&exlimit=1&titles=${encodeURIComponent(
      term
    )}&explaintext=1&format=json`;
    const response = await axios.get(url);
    const data = response.data;
    if (data && data.query && data.query.pages) {
      const pageId = Object.keys(data.query.pages)[0];
      if (pageId === "-1") {
        status = "error";
        dataResult.title = "Không tìm thấy kết quả nào cho từ này";
      } else {
        const page = data.query.pages[pageId];
        status = "success";
        dataResult.title = page.title;
        dataResult.extract = page.extract.replace(/[\u00B2-\u00B3\u00B9]/g, "");
        addWordCrawlIntoData(dataResult.title, dataResult.extract);
      }
    }
  } catch (error) {
    console.error("Lỗi khi tra cứu Wikipedia:", error);
    status = "error";
    dataResult.title = "Lỗi khi tra cứu qua API Wikipedia";
  }
  if (dataResult.extract === "") {
    try {
      dataResult.title = term.toLowerCase();
      dataResult.extract = await sohaFindTuDien(term);
      if (!dataResult.extract) dataResult.extract = await findDescriptionOfVocabulary(term);
      status = "success";
      addWordCrawlIntoData(dataResult.title, dataResult.extract);
    } catch {}
  }
  return { status, data: dataResult };
}

/**
 * Tìm kiếm các bài viết trên Wikipedia dựa trên từ khóa
 * @param {string} keyword - Từ khóa tìm kiếm (ví dụ: "Hà Nội")
 * @returns {Promise<{status: string, data: {results: Array<{title: string, pageid: number, snippet: string}>}}>}
 */
export async function searchWikipedia(keyword) {
  let status = "failed";
  const dataResult = { results: [] };

  try {
    const url = `https://vi.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(
      keyword
    )}&format=json`;

    const response = await axios.get(url);
    const data = response.data;

    if (data && data.query && data.query.search) {
      dataResult.results = data.query.search.map((item) => ({
        title: item.title,
        pageid: item.pageid,
        snippet: item.snippet.replace(/<\/?[^>]+(>|$)/g, ""), // Loại bỏ các thẻ HTML
      }));
      status = "success";
    } else {
      status = "error";
      console.error("Không tìm thấy kết quả hoặc cấu trúc dữ liệu không như mong đợi");
    }
  } catch (error) {
    console.error("Lỗi khi tìm kiếm Wikipedia:", error);
    status = "error";
  }

  return { status, data: dataResult };
}

/**
 * Lấy nội dung chi tiết của một bài viết trên Wikipedia dựa vào tiêu đề
 * @param {string} title - Tiêu đề của bài viết (ví dụ: "Hà Nội")
 * @param {boolean} introOnly - Chỉ lấy phần giới thiệu (mặc định: true)
 * @returns {Promise<{status: string, data: {title: string, extract: string, pageid: number}}>}
 */
export async function getWikipediaArticle(title, introOnly = true) {
  let status = "failed";
  const dataResult = { title: "", extract: "", pageid: null };

  try {
    let url = `https://vi.wikipedia.org/w/api.php?action=query&prop=extracts${
      introOnly ? "&exintro" : ""
    }&titles=${encodeURIComponent(title)}&format=json`;

    const response = await axios.get(url);
    const data = response.data;

    if (data && data.query && data.query.pages) {
      const pageId = Object.keys(data.query.pages)[0];

      if (pageId === "-1") {
        status = "error";
        dataResult.title = "Không tìm thấy bài viết nào với tiêu đề này";
      } else {
        const page = data.query.pages[pageId];
        status = "success";
        dataResult.title = page.title;
        dataResult.extract = page.extract.replace(/<\/?[^>]+(>|$)/g, "");
        dataResult.pageid = parseInt(pageId);
      }
    } else {
      status = "error";
      console.error("Cấu trúc dữ liệu không như mong đợi");
    }
  } catch (error) {
    console.error("Lỗi khi lấy bài viết từ Wikipedia:", error);
    status = "error";
    dataResult.title = "Lỗi khi truy cập API Wikipedia";
  }

  return { status, data: dataResult };
}

/**
 * Tìm kiếm và lấy thông tin chi tiết trong một lần gọi
 * @param {string} term - Từ khóa tìm kiếm
 * @returns {Promise<{status: string, data: {search: Array, article: Object}}>}
 */
export async function searchAndGetArticle(term) {
  const searchResult = await searchWikipedia(term);

  const result = {
    status: searchResult.status,
    data: {
      search: searchResult.data.results,
      article: null,
    },
  };

  if (searchResult.status === "success" && searchResult.data.results.length > 0) {
    const firstArticle = searchResult.data.results[0];
    const articleResult = await getWikipediaArticle(firstArticle.title);

    result.data.article = articleResult.data;

    if (articleResult.status === "error") {
      result.status = "partial";
    }
  }

  return result;
}
