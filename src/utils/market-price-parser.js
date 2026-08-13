import * as cheerio from "cheerio";

function clean(value) {
  return String(value || "").replace(/\s+/gu, " ").trim();
}

export function parseFuelPriceHtml(html) {
  const $ = cheerio.load(html);
  const prices = [];
  const seen = new Set();

  $("table tr").each((_, row) => {
    const cells = $(row).find("th,td").map((__, cell) => clean($(cell).text())).get();
    if (cells.length < 2 || !/(xăng|dầu|ron|diesel|mazut|madút)/iu.test(cells[0])) return;
    const values = cells.slice(1).filter((cell) => /^\d[\d.,]*(?:\s*(?:₫|đ|VNĐ)(?:\/[A-Za-z]+)?)?$/iu.test(cell));
    if (!values.length) return;
    const name = cells[0];
    if (seen.has(name)) return;
    seen.add(name);
    prices.push({ name, region1: values[0], region2: values[1] || "—" });
  });

  if (!prices.length) {
    const text = clean($("body").text());
    const pattern = /((?:Xăng|Dầu)\s+(?:E\d+|RON|DO|Diesel|hỏa|madút|mazút)[^\d]{0,35})\s+(\d{1,3}(?:[.,]\d{3})+)\s*(?:đ|VNĐ)?(?:\s+(\d{1,3}(?:[.,]\d{3})+))?/giu;
    for (const match of text.matchAll(pattern)) {
      const name = clean(match[1]);
      if (!seen.has(name)) {
        seen.add(name);
        prices.push({ name, region1: match[2], region2: match[3] || "—" });
      }
    }
  }

  return prices.slice(0, 10);
}

export function parseGoldPriceHtml(html) {
  const $ = cheerio.load(html);
  const prices = [];
  const seen = new Set();

  $("table").each((_, table) => {
    const header = clean($(table).find("tr").first().text());
    if (!/(loại vàng|mua vào|bán ra)/iu.test(header)) return;

    $(table).find("tr").slice(1).each((__, row) => {
      const cells = $(row).find("th,td").map((___, cell) => clean($(cell).text())).get();
      if (cells.length < 3) return;
      const numericCells = cells.slice(1).filter((cell) => /^\d[\d.,]*(?:\s*(?:₫|đ|VNĐ))?$/iu.test(cell));
      if (numericCells.length < 2 || seen.has(cells[0])) return;
      seen.add(cells[0]);
      prices.push({ name: cells[0], buy: numericCells[0], sell: numericCells[1] });
    });
  });

  return prices.slice(0, 24);
}
