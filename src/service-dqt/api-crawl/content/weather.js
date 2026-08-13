import path from "path";
import fs from "fs";
import * as cheerio from "cheerio";
import { createCanvas, loadImage } from "canvas";
import { getGlobalPrefix } from "../../service.js";
import { removeMention } from "../../../utils/format-util.js";
import { BACKGROUND_RESOURCE_PATH_TEMP, tempDir } from "../../../utils/io-json.js";
import { deleteFile } from "../../../utils/util.js";
import { MessageMention } from "../../../api-zalo/index.js";

export class WeatherForeCast {
  constructor() {
    this.baseUrlSearch = "https://www.accuweather.com/web-api/autocomplete";
    this.baseUrlWeather = "https://www.accuweather.com";
  }

  async fetchAutocomplete(query, language = "vi") {
    const url = `${this.baseUrlSearch}?query=${encodeURIComponent(query)}&language=${encodeURIComponent(language)}`;
    const res = await fetch(url, {
      headers: {
        accept: "*/*",
        "accept-language": "vi,vi-VN;q=0.9,fr-FR;q=0.8,fr;q=0.7,en-US;q=0.6,en;q=0.5,zh-TW;q=0.4,zh-CN;q=0.3,zh;q=0.2",
        priority: "u=1, i",
        "sec-ch-ua": '"Not;A=Brand";v="99", "Google Chrome";v="139", "Chromium";v="139"',
        "sec-ch-ua-mobile": "?0",
        "sec-ch-ua-platform": '"Windows"',
        "sec-fetch-dest": "empty",
        "sec-fetch-mode": "cors",
        "sec-fetch-site": "same-origin",
      },
      referrer: `${this.baseUrlWeather}/`,
      method: "GET",
      mode: "cors",
      credentials: "include",
    });
    if (!res.ok) return null;
    const data = await res.json();
    return Array.isArray(data) ? data : null;
  }

  levenshtein(a, b) {
    if (a === b) return 0;
    a = a || "";
    b = b || "";
    const al = a.length;
    const bl = b.length;
    if (al === 0) return bl;
    if (bl === 0) return al;
    const v0 = new Array(bl + 1);
    const v1 = new Array(bl + 1);
    for (let j = 0; j <= bl; j++) v0[j] = j;
    for (let i = 0; i < al; i++) {
      v1[0] = i + 1;
      for (let j = 0; j < bl; j++) {
        const cost = a.charAt(i) === b.charAt(j) ? 0 : 1;
        v1[j + 1] = Math.min(v1[j] + 1, v0[j + 1] + 1, v0[j] + cost);
      }
      for (let j = 0; j <= bl; j++) v0[j] = v1[j];
    }
    return v1[bl];
  }

  findBestMatch(results, query) {
    if (!results || results.length === 0) return null;

    // 1) filter Vietnam
    const vn = results.filter((r) => r && r.country && r.country.id === "VN");
    if (vn.length === 1) return vn[0];
    if (vn.length > 1) {
      // try exact localizedName match (case-insensitive)
      const exact = vn.find((r) => r.localizedName && r.localizedName.toLowerCase() === query.toLowerCase());
      if (exact) return exact;
      // fuzzy match among vn
      let best = null;
      let bestScore = Infinity;
      for (const r of vn) {
        const name = r.localizedName || r.name || "";
        const score = this.levenshtein(name.toLowerCase(), query.toLowerCase());
        if (score < bestScore) {
          bestScore = score;
          best = r;
        }
      }
      return best;
    }

    // // 2) no VN results — try exact localizedName in all results
    // const exactAll = results.find((r) => r.localizedName && r.localizedName.toLowerCase() === query.toLowerCase());
    // if (exactAll) return exactAll;

    // // 3) fuzzy match across all
    // let best = null;
    // let bestScore = Infinity;
    // for (const r of results) {
    //   const name = r.localizedName || r.name || "";
    //   const score = this.levenshtein(name.toLowerCase(), query.toLowerCase());
    //   if (score < bestScore) {
    //     bestScore = score;
    //     best = r;
    //   }
    // }
    // if (best) return best;

    // // 4) fallback to first
    // return results.length ? results[0] : null;
    return null;
  }

  async searchLocation(query, language = "vi") {
    if (!query || typeof query !== "string") return null;
    const results = await this.fetchAutocomplete(query, language);
    return this.findBestMatch(results, query);
  }

  /**
   * Follow the three-day redirect using the location key and return parsed data
   * @param {string|object} locationObj - location object from autocomplete or a key string
   */
  async fetchWeatherByLocation(locationObj) {
    const key = typeof locationObj === "string" ? locationObj : locationObj && locationObj.key;
    if (!key) return null;
    const redirectUrl = `${this.baseUrlWeather}/web-api/three-day-redirect?key=${encodeURIComponent(
      key
    )}&postalCode=&target=`;
    try {
      const res = await fetch(redirectUrl, {
        headers: {
          Accept: "text/html,application/xhtml+xml,application/xml",
          "Accept-Language": "vi",
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/115.0.0.0 Safari/537.36",
        },
        redirect: "follow",
      });
      if (!res || !res.ok) return null;
      const html = await res.text();
      if (!html) return null;
      return { ...this.parseWeatherHtml(html), locationObj };
    } catch (err) {
      return null;
    }
  }

  parseText(el) {
    if (!el) return "";
    return el.text().replace(/\s+/g, " ").trim();
  }

  parseWeatherHtml(html) {
    const $ = cheerio.load(html);
    const container = $(".page-content.content-module").first();
    if (!container || container.length === 0) return null;

    // Current weather
    const currentEl = container.find(".cur-con-weather-card").first();
    const current = {};
    if (currentEl && currentEl.length) {
      current.title = this.parseText(currentEl.find(".cur-con-weather-card__title"));
      current.subtitle = this.parseText(currentEl.find(".cur-con-weather-card__subtitle"));
      const tempEl = currentEl.find(".temp-container .temp").first();
      if (tempEl && tempEl.length) {
        current.temp = this.parseText(tempEl).replace(/[^0-9\-–°]/g, "");
        const unit = tempEl.find(".after-temp").first();
        current.unit = unit && unit.length ? this.parseText(unit) : "";
      }
      const weatherIconEl = currentEl.find(".weather-icon").first();
      current.weatherIcon = weatherIconEl && weatherIconEl.length ? weatherIconEl.attr("data-src") || "" : "";
      current.weatherIcon = current.weatherIcon ? `${this.baseUrlWeather}/${current.weatherIcon}` : "";
      current.realFeel = this.parseText(currentEl.find(".real-feel"));
      current.phrase = this.parseText(currentEl.find(".phrase"));
      current.details = {};
      currentEl.find(".spaced-content.detail").each((i, el) => {
        const label = this.parseText($(el).find(".label"));
        const value = this.parseText($(el).find(".value"));
        if (label) current.details[label] = value;
      });
    }

    // Hourly
    const hourly = [];
    container.find(".hourly-list__list__item").each((i, el) => {
      const it = $(el);
      hourly.push({
        time: this.parseText(it.find(".hourly-list__list__item-time")),
        icon: it.find("img").attr("src") || it.find("img").attr("data-src") || "",
        temp: this.parseText(it.find(".hourly-list__list__item-temp")),
        precip: this.parseText(it.find(".hourly-list__list__item-precip span")),
      });
    });

    // Daily
    const daily = [];
    container.find(".daily-list-item").each((i, el) => {
      const it = $(el);
      const dayPhrase = this.parseText(it.find(".phrase > p.no-wrap").first());
      const nightPhrase = this.parseText(it.find(".phrase .night p.no-wrap").first());
      // precip (độ ẩm / xác suất mưa) có thể nằm trong .precip hoặc .precip span
      let precip = this.parseText(it.find(".precip").first());
      if (!precip) precip = this.parseText(it.find(".precip span").first());
      // night icon: cố gắng lấy ảnh trong .phrase .night img hoặc .night-icon
      let nightIcon = it.find(".phrase .night img").attr("src") || it.find("img.night-icon").attr("src") || "";

      // also include grouped structures for easier rendering:
      const dayVal = this.parseText(it.find(".day"));
      const dateVal = this.parseText(it.find(".date p").last());
      const iconVal = it.find("img.icon").attr("src") || "";
      const highVal = this.parseText(it.find(".temp-hi"));
      const lowVal = this.parseText(it.find(".temp-lo"));

      const phraseText = [dayPhrase, nightPhrase].filter(Boolean).join(" | ");

      daily.push({
        dateGroup: {
          day: dayVal,
          date: dateVal,
        },
        iconTempGroup: {
          icon: iconVal,
          tempPhraseWrapper: {
            high: highVal,
            low: lowVal,
          },
        },
        phraseGroup: {
          day: dayPhrase || "",
          night: nightPhrase || "",
          nightIcon: nightIcon,
          text: phraseText,
        },
        precipGroup: {
          value: precip || "",
          icon: "https://www.awxcdn.com/adc-assets/images/components/weather/hourly-card-nfl/drop-icon.svg",
        },
      });
    });

    // Sunrise / Sunset
    const ss = { items: [] };
    const ssBody = container.find(".sunrise-sunset__body").first();
    if (ssBody && ssBody.length) {
      ssBody.find(".sunrise-sunset__item").each((i, el) => {
        const it = $(el);
        const icon = it.find("img.sunrise-sunset__icon").attr("src") || "";
        const phrase = this.parseText(it.find(".sunrise-sunset__phrase"));
        const times = [];
        it.find(".sunrise-sunset__times-item").each((j, t) => {
          const label = this.parseText($(t).find(".sunrise-sunset__times-label"));
          const value = this.parseText($(t).find(".sunrise-sunset__times-value"));
          times.push({ label, value });
        });
        let iconUrl = icon ? (icon.startsWith("http") ? icon : `${this.baseUrlWeather}${icon}`) : "";
        iconUrl = iconUrl.replace(
          "https://www.accuweather.com/images/whiteweathericons/1.svg",
          "https://www.awxcdn.com/adc-assets/images/weathericons/1.svg"
        );
        ss.items.push({
          icon: iconUrl,
          phrase,
          times,
        });
      });
    }

    let minutecast = null;
    try {
      const mcEl = container.find("a.minutecast-banner.content-module").first();
      if (mcEl && mcEl.length) {
        const heading = this.parseText(mcEl.find(".minutecast-banner__heading"));
        const phrase = this.parseText(mcEl.find(".minutecast-banner__phrase"));
        const chartPresent = mcEl.find("svg.minutecast-banner__chart").length > 0;
        const times = [];
        mcEl.find(".minutecast-banner__time__value").each((i, el) => {
          const v = this.parseText($(el));
          if (v) times.push(v);
        });
        minutecast = {
          heading: heading || null,
          phrase: phrase || null,
          chart: chartPresent,
          times: times.length ? times : null,
        };
      }
    } catch (e) {
      minutecast = null;
    }

    const air = {};
    const airEl = container.find(".air-quality-module").first();
    if (airEl && airEl.length) {
      air.category = this.parseText(container.find(".air-quality-module__row__category"));
      air.statement = this.parseText(container.find(".air-quality-module__statement"));
    }

    return { current, hourly, daily, sunriseSunset: ss, airQuality: air, minutecast };
  }
}

// TODO: các key dưới đây đã nằm sẵn trong source code (nên coi như đã lộ).
// Nên đổi key mới trên dashboard nhà cung cấp và set qua biến môi trường.
const TOMORROW_API_KEY = process.env.TOMORROW_API_KEY || "mdTWQAInBIDB3mHiDtkwuTlwhVB50rqn";
const OPENWEATHER_API_KEY = process.env.OPENWEATHER_API_KEY || "e707d13f116e5f7ac80bd21c37883e5e";
const WEATHERAPI_KEY = process.env.WEATHERAPI_KEY || "fe221e3a25734f0297994922240611";

const weatherForeCast = new WeatherForeCast();

// Hàm mapping màu sắc theo chất lượng không khí
function getAirQualityColor(category) {
  if (!category) return "#ffffff";
  
  const categoryLower = String(category).toLowerCase();
  
  // Tuyệt vời (0-19) - Màu xanh dương nhạt
  if (categoryLower.includes("tuyệt vời") || categoryLower.includes("excellent")) {
    return "#4FC3F7";
  }
  
  // Vừa phải (20-49) - Màu xanh lá nhạt  
  if (categoryLower.includes("vừa") || categoryLower.includes("moderate")) {
    return "#8BC34A";
  }
  
  // Xấu (50-99) - Màu vàng cam
  if (categoryLower.includes("xấu") || categoryLower.includes("unhealthy for sensitive") || categoryLower.includes("poor")) {
    return "#FFCA28";
  }
  
  // Có hại (100-149) - Màu đỏ
  if (categoryLower.includes("có hại") || categoryLower.includes("unhealthy")) {
    return "#EF5350";
  }
  
  // Rất có hại (150-249) - Màu tím
  if (categoryLower.includes("rất có hại") || categoryLower.includes("very unhealthy")) {
    return "#AB47BC";
  }
  
  // Nguy hiểm (250+) - Màu đỏ đậm
  if (categoryLower.includes("nguy hiểm") || categoryLower.includes("hazardous")) {
    return "#B71C1C";
  }
  
  // Mặc định trắng nếu không khớp
  return "#ffffff";
}

export async function weatherCommand(api, message, aliasCommand) {
  const content = removeMention(message);
  const threadId = message.threadId;
  const prefix = getGlobalPrefix(api.getBotId());

  const location = content.replace(`${prefix}${aliasCommand}`, "").trim();

  if (!location) {
    await getOverallWeather(api, message, threadId);
  } else {
    await getLocalWeather(api, message, threadId, location);
  }
}

export async function generateWeatherForeCastImage(data) {
  const width = 1280;
  const height = 1920;
  const margin = 64;
  const contentWidth = width - margin * 2;
  const navy = "#0b1730";
  const muted = "#aebbd2";
  const white = "#f8fbff";
  const cyan = "#6ee7f9";
  const violet = "#9b8cff";

  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext("2d");

  const roundRect = (x, y, w, h, radius, fill, stroke) => {
    ctx.beginPath();
    ctx.roundRect(x, y, w, h, radius);
    if (fill) {
      ctx.fillStyle = fill;
      ctx.fill();
    }
    if (stroke) {
      ctx.strokeStyle = stroke;
      ctx.lineWidth = 2;
      ctx.stroke();
    }
  };

  const truncate = (value, maxWidth, font) => {
    let text = String(value || "");
    ctx.font = font;
    while (text.length > 1 && ctx.measureText(`${text}…`).width > maxWidth) text = text.slice(0, -1);
    return text === String(value || "") ? text : `${text}…`;
  };

  const drawText = (value, x, y, font, color = white, align = "left") => {
    ctx.save();
    ctx.font = font;
    ctx.fillStyle = color;
    ctx.textAlign = align;
    ctx.textBaseline = "top";
    ctx.fillText(String(value || ""), x, y);
    ctx.restore();
  };

  const drawIcon = async (url, x, y, size) => {
    if (!url) return false;
    try {
      const image = await loadImage(String(url));
      ctx.drawImage(image, x, y, size, size);
      return true;
    } catch {
      return false;
    }
  };

  // Nền gradient nhẹ, không phụ thuộc ảnh ngoài nên render ổn định và nhanh.
  const background = ctx.createLinearGradient(0, 0, width, height);
  background.addColorStop(0, "#172b50");
  background.addColorStop(0.52, "#0c1831");
  background.addColorStop(1, "#07101f");
  ctx.fillStyle = background;
  ctx.fillRect(0, 0, width, height);

  ctx.fillStyle = "rgba(110,231,249,0.08)";
  ctx.beginPath();
  ctx.arc(width - 80, 80, 300, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "rgba(155,140,255,0.07)";
  ctx.beginPath();
  ctx.arc(80, height - 90, 360, 0, Math.PI * 2);
  ctx.fill();

  const location = data?.locationObj?.longName || data?.locationObj?.localizedName || "Thời tiết hiện tại";
  const current = data?.current || {};
  const hourly = Array.isArray(data?.hourly) ? data.hourly.slice(0, 6) : [];
  const daily = Array.isArray(data?.daily) ? data.daily.slice(0, 3) : [];
  const air = data?.airQuality || {};

  drawText("DỰ BÁO THỜI TIẾT", margin, 58, "bold 30px Tahoma", cyan);
  drawText(truncate(location, 720, "bold 66px Tahoma"), margin, 100, "bold 66px Tahoma");
  drawText(current.subtitle || "Cập nhật mới nhất", margin, 184, "32px Tahoma", muted);
  drawText(new Date().toLocaleDateString("vi-VN", { weekday: "long", day: "2-digit", month: "2-digit" }), width - margin, 72, "30px Tahoma", muted, "right");

  // Current weather card.
  const currentY = 260;
  const currentH = 430;
  roundRect(margin, currentY, contentWidth, currentH, 34, "rgba(27,48,83,0.92)", "rgba(131,194,255,0.22)");
  const iconSize = 190;
  await drawIcon(current.weatherIcon, margin + 52, currentY + 72, iconSize);
  drawText(current.phrase || current.title || "Không rõ", margin + 52, currentY + 288, "bold 30px Tahoma", white);
  drawText("NHIỆT ĐỘ HIỆN TẠI", margin + 310, currentY + 64, "24px Tahoma", muted);
  drawText(current.temp || "--", margin + 306, currentY + 92, "bold 142px Tahoma", white);
  drawText(current.unit || "°", margin + 520, currentY + 126, "bold 54px Tahoma", cyan);
  drawText(current.realFeel ? `Cảm giác ${current.realFeel}` : "", margin + 316, currentY + 260, "32px Tahoma", muted);

  const detailEntries = Object.entries(current.details || {}).slice(0, 3);
  const detailX = margin + 700;
  detailEntries.forEach(([label, value], index) => {
    const y = currentY + 72 + index * 94;
    ctx.strokeStyle = "rgba(255,255,255,0.10)";
    ctx.beginPath();
    ctx.moveTo(detailX, y + 62);
    ctx.lineTo(width - margin - 42, y + 62);
    ctx.stroke();
    drawText(truncate(label, 230, "26px Tahoma"), detailX, y, "26px Tahoma", muted);
    drawText(truncate(value, 230, "bold 30px Tahoma"), width - margin - 42, y - 2, "bold 30px Tahoma", white, "right");
  });

  // Hourly forecast.
  const hourlyY = currentY + currentH + 34;
  const hourlyH = 345;
  roundRect(margin, hourlyY, contentWidth, hourlyH, 30, "rgba(18,35,64,0.88)", "rgba(131,194,255,0.16)");
  drawText("DỰ BÁO THEO GIỜ", margin + 32, hourlyY + 28, "bold 28px Tahoma", white);
  const hourlyTop = hourlyY + 98;
  const hourlyW = (contentWidth - 48) / Math.max(hourly.length, 1);
  for (let i = 0; i < hourly.length; i++) {
    const item = hourly[i] || {};
    const cx = margin + 24 + hourlyW * i + hourlyW / 2;
    drawText(item.time || "--", cx, hourlyTop, "26px Tahoma", muted, "center");
    await drawIcon(item.icon, cx - 48, hourlyTop + 42, 96);
    drawText(item.temp || "--", cx, hourlyTop + 150, "bold 32px Tahoma", white, "center");
    drawText(item.precip || "", cx, hourlyTop + 204, "24px Tahoma", cyan, "center");
  }

  // Three-day forecast rows.
  const dailyY = hourlyY + hourlyH + 34;
  const dailyH = 500;
  roundRect(margin, dailyY, contentWidth, dailyH, 30, "rgba(18,35,64,0.88)", "rgba(131,194,255,0.16)");
  drawText("DỰ BÁO 3 NGÀY", margin + 32, dailyY + 28, "bold 28px Tahoma", white);
  for (let i = 0; i < daily.length; i++) {
    const item = daily[i] || {};
    const rowY = dailyY + 96 + i * 126;
    if (i > 0) {
      ctx.strokeStyle = "rgba(255,255,255,0.10)";
      ctx.beginPath();
      ctx.moveTo(margin + 28, rowY - 22);
      ctx.lineTo(width - margin - 28, rowY - 22);
      ctx.stroke();
    }
    drawText(item.dateGroup?.day || `Ngày ${i + 1}`, margin + 34, rowY + 18, "bold 30px Tahoma", white);
    drawText(item.dateGroup?.date || "", margin + 34, rowY + 58, "24px Tahoma", muted);
    await drawIcon(item.iconTempGroup?.icon, margin + 270, rowY, 90);
    const temp = item.iconTempGroup?.tempPhraseWrapper || {};
    drawText(`${temp.high || "--"} / ${temp.low || "--"}`, margin + 390, rowY + 24, "bold 32px Tahoma", white);
    const phrase = item.phraseGroup?.day || item.phraseGroup?.text || "";
    drawText(truncate(phrase, 360, "28px Tahoma"), margin + 650, rowY + 28, "28px Tahoma", muted);
    drawText(item.precipGroup?.value || "", width - margin - 34, rowY + 28, "bold 28px Tahoma", cyan, "right");
  }

  // Sunrise/sunset and air-quality footer.
  const footerY = dailyY + dailyH + 34;
  const footerH = 230;
  roundRect(margin, footerY, contentWidth, footerH, 30, "rgba(18,35,64,0.88)", "rgba(131,194,255,0.16)");
  const sunItems = data?.sunriseSunset?.items || [];
  const sunText = sunItems.slice(0, 2).map((item) => {
    const time = (item.times || []).map((t) => `${t.label || ""} ${t.value || ""}`).join(" · ");
    return `${item.phrase || ""} ${time}`.trim();
  }).filter(Boolean).join("   |   ");
  drawText("MẶT TRỜI", margin + 34, footerY + 34, "bold 24px Tahoma", violet);
  drawText(truncate(sunText || "Chưa có dữ liệu", 650, "28px Tahoma"), margin + 34, footerY + 78, "28px Tahoma", white);
  drawText("CHẤT LƯỢNG KHÔNG KHÍ", margin + 750, footerY + 34, "bold 24px Tahoma", violet);
  drawText(truncate(air.category || "Chưa có dữ liệu", 390, "bold 30px Tahoma"), margin + 750, footerY + 76, "bold 30px Tahoma", getAirQualityColor(air.category));
  drawText(truncate(air.statement || "", 390, "24px Tahoma"), margin + 750, footerY + 124, "24px Tahoma", muted);

  const outPath = path.join(tempDir, `weather-forecast_${Date.now()}.png`);
  const out = fs.createWriteStream(outPath);
  canvas.createPNGStream().pipe(out);
  await new Promise((resolve, reject) => {
    out.on("finish", resolve);
    out.on("error", reject);
  });
  return outPath;
}

// Bản render cũ giữ lại tạm để dễ đối chiếu khi cần rollback.
async function generateWeatherForeCastImageLegacy(data) {
  const width = 1280;
  const height = 1920;

  // Choose background provider (local assets folder or fallback)
  const imageDir = path.join(BACKGROUND_RESOURCE_PATH_TEMP, "1080x1920");
  let providers = [];
  try {
    if (fs.existsSync(imageDir)) {
      const files = fs.readdirSync(imageDir).filter((f) => /\.(jpe?g|png|webp)$/i.test(f));
      if (files.length > 0) {
        const file = files[Math.floor(Math.random() * files.length)];
        providers = [path.join(imageDir, file)];
      }
    }
  } catch (e) {
    providers = [];
  }
  if (!providers || providers.length === 0) providers = [`https://picsum.photos/${width}/${height}`];

  // Load background image (first available)
  let bgImage = null;
  for (const provider of providers) {
    try {
      let imageBuffer = null;
      if (/^https?:\/\//i.test(provider)) {
        const resp = await axios.get(provider, { responseType: "arraybuffer" });
        imageBuffer = Buffer.from(resp.data, "binary");
      } else {
        imageBuffer = fs.readFileSync(provider);
      }
      bgImage = await loadImage(imageBuffer);
      break;
    } catch (e) {
      continue;
    }
  }

  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext("2d");

  // draw background image or gradient fallback (darken bgImage with overlay to reduce glare)
  if (bgImage) {
    ctx.drawImage(bgImage, 0, 0, width, height);
    try {
      ctx.save();
      ctx.fillStyle = "rgba(0,0,0,0.36)"; // adjust alpha to taste
      ctx.fillRect(0, 0, width, height);
      ctx.restore();
    } catch (e) {}
  } else {
    const g = ctx.createLinearGradient(0, 0, 0, height);
    g.addColorStop(0, "#1e3c72");
    g.addColorStop(1, "#2a5298");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, width, height);
  }

  // Keep basic layout: header, main card and footer placeholders
  ctx.save();

  // main rounded panel
  const panelX = Math.floor(width * 0.05);
  const panelW = Math.floor(width * 0.9);
  const panelY = Math.floor(height * 0.06);
  const ratioH = data.minutecast ? 0.28 : 0.25;
  const panelH = Math.floor(height * ratioH);
  ctx.fillStyle = "rgba(0,0,0,0.6)";
  const r = 28;
  ctx.beginPath();
  ctx.moveTo(panelX + r, panelY);
  ctx.lineTo(panelX + panelW - r, panelY);
  ctx.quadraticCurveTo(panelX + panelW, panelY, panelX + panelW, panelY + r);
  ctx.lineTo(panelX + panelW, panelY + panelH - r);
  ctx.quadraticCurveTo(panelX + panelW, panelY + panelH, panelX + panelW - r, panelY + panelH);
  ctx.lineTo(panelX + r, panelY + panelH);
  ctx.quadraticCurveTo(panelX, panelY + panelH, panelX, panelY + panelH - r);
  ctx.lineTo(panelX, panelY + r);
  ctx.quadraticCurveTo(panelX, panelY, panelX + r, panelY);
  ctx.closePath();
  ctx.fill();

  // draw location name left-aligned on the semi-transparent panel if provided

  let pointY = panelY + 24;

  try {
    const locationText =
      data && data.locationObj && data.locationObj.longName
        ? String(data.locationObj.longName).trim()
        : data && data.locationObj && data.locationObj.localizedName
        ? String(data.locationObj.localizedName).trim()
        : "";
    if (locationText) {
      const pad = 28;
      const textX = panelX + pad;
      const textY = pointY; // slightly down from top of panel
      ctx.save();
      ctx.font = `bold 48px Tahoma`;
      ctx.fillStyle = "#ffffff";
      ctx.textAlign = "left";
      ctx.textBaseline = "top";
      ctx.shadowColor = "rgba(0,0,0,0.6)";
      ctx.shadowBlur = 6;
      // ellipsize
      const maxW = panelW - pad * 2;
      let txt = locationText;
      if (ctx.measureText(txt).width > maxW) {
        while (txt.length > 0 && ctx.measureText(txt + "...").width > maxW) txt = txt.slice(0, -1);
        txt = txt + "...";
      }
      ctx.fillText(txt, textX, textY);
      ctx.restore();
    }

    let subtitleText = data && data.current && data.current.subtitle ? String(data.current.subtitle).trim() : "";
    try {
      if (typeof subtitleText === "string" && subtitleText) {
        ctx.save();
        ctx.font = `bold 36px Tahoma`;
        ctx.fillStyle = "#ffffff";
        ctx.textAlign = "right";
        ctx.textBaseline = "top";
        const subX = panelX + panelW - 28;
        const subY = pointY;
        ctx.fillText(subtitleText, subX, subY);
        ctx.restore();
      }
    } catch (e) {}
  } catch (e) {}

  // draw current.title under the location text and above the current weather block
  try {
    pointY += 82;
    let titleText = data && data.current && data.current.title ? String(data.current.title).trim() : "";

    if (titleText) {
      const pad = 28;
      const titleX = panelX + pad;
      const titleY = pointY; // place between location and current block
      ctx.save();
      ctx.font = `bold 36px Tahoma`;
      ctx.fillStyle = "#ffffff";
      ctx.textAlign = "left";
      ctx.textBaseline = "top";
      ctx.shadowColor = "rgba(0,0,0,0.5)";
      ctx.shadowBlur = 6;
      // ellipsize if necessary within panel
      const maxW = panelW - pad * 2;
      let t = titleText;
      if (ctx.measureText(t).width > maxW) {
        while (t.length > 0 && ctx.measureText(t + "...").width > maxW) t = t.slice(0, -1);
        t = t + "...";
      }
      ctx.fillText(t, titleX, titleY);
      ctx.restore();
    }
  } catch (e) {}

  try {
    const current = data && data.current ? data.current : null;
    if (current) {
      const pad = 28;
      const iconW = 166;
      const iconH = 166;
      const iconX = panelX + pad;
      const iconY = pointY + 80;

      let iconImg = null;
      try {
        if (current.weatherIcon) {
          iconImg = await loadImage(String(current.weatherIcon));
        }
      } catch (e) {
        iconImg = null;
      }

      if (iconImg) {
        ctx.drawImage(iconImg, iconX, iconY, iconW, iconH);
      }

      const tempX = iconX + iconW + 36;
      const tempY = iconY - 18;
      ctx.save();
      ctx.fillStyle = "#ffffff";
      ctx.textAlign = "left";
      ctx.textBaseline = "top";
      ctx.font = `128px Tahoma`;
      const tempText = String(current.temp || "");
      ctx.fillText(tempText, tempX, tempY);

      if (current.unit) {
        const unitX = tempX + ctx.measureText(tempText).width - 52;
        ctx.font = `60px Tahoma`;
        const unitY = tempY + 85;
        ctx.fillText(String(current.unit), unitX, unitY);
      }

      ctx.font = `42px Tahoma`;
      const realFeelY = tempY + 150;
      if (current.realFeel) {
        ctx.fillStyle = "#e6e6e6";
        ctx.fillText(String(current.realFeel), tempX, realFeelY);
      }

      if (current.phrase) {
        ctx.font = `36px Tahoma`;
        ctx.fillStyle = "#ffffff";
        const phraseY = iconY + iconH + 24;
        ctx.fillText(String(current.phrase), iconX, phraseY);
      }

      try {
        const details = current.details || {};
        const entries = Object.entries(details);
        if (entries.length > 0) {
          const boxW = 560;
          const boxX = panelX + panelW - 36 - boxW;
          const boxY = tempY - 64;
          const itemH = 84;
          const boxH = itemH * entries.length + 16;
          ctx.save();
          ctx.fillStyle = "rgba(255,255,255,0.02)";
          const br = 10;
          ctx.beginPath();
          ctx.moveTo(boxX + br, boxY);
          ctx.lineTo(boxX + boxW - br, boxY);
          ctx.quadraticCurveTo(boxX + boxW, boxY, boxX + boxW, boxY + br);
          ctx.lineTo(boxX + boxW, boxY + boxH - br);
          ctx.quadraticCurveTo(boxX + boxW, boxY + boxH, boxX + boxW - br, boxY + boxH);
          ctx.lineTo(boxX + br, boxY + boxH);
          ctx.quadraticCurveTo(boxX, boxY + boxH, boxX, boxY + boxH - br);
          ctx.lineTo(boxX, boxY + br);
          ctx.quadraticCurveTo(boxX, boxY, boxX + br, boxY);
          ctx.closePath();
          ctx.fill();
          ctx.restore();

          for (let i = 0; i < entries.length; i++) {
            const [label, val] = entries[i];
            const rowY = boxY + 8 + i * itemH;
            if (i > 0) {
              ctx.save();
              ctx.strokeStyle = "rgba(255,255,255,0.08)";
              ctx.lineWidth = 1;
              ctx.beginPath();
              ctx.moveTo(boxX + 8, rowY);
              ctx.lineTo(boxX + boxW - 8, rowY);
              ctx.stroke();
              ctx.restore();
            }
            ctx.save();
            ctx.font = `32px Tahoma`;
            ctx.fillStyle = "#ffffff";
            ctx.textAlign = "left";
            ctx.textBaseline = "middle";
            ctx.fillText(String(label), boxX + 16, rowY + itemH / 2);
            ctx.restore();

            ctx.save();
            const isAir = /air|không khí|Chất lượng/i.test(label);
            ctx.font = `36px Tahoma`;
            ctx.textAlign = "right";
            ctx.textBaseline = "middle";
            ctx.fillStyle = isAir ? getAirQualityColor(val) : "#ffffff";
            ctx.fillText(String(val), boxX + boxW - 16, rowY + itemH / 2);
            ctx.restore();
          }
        }
      } catch (e) {}

      ctx.restore();
    }
  } catch (e) {}

  try {
    const mcPhrase = data && data.minutecast && data.minutecast.phrase ? String(data.minutecast.phrase).trim() : null;
    if (mcPhrase) {
      const pad = 28;
      const phraseY = panelY + panelH - 18;
      ctx.save();
      ctx.font = `36px Tahoma`;
      ctx.fillStyle = "#ffffff";
      ctx.textAlign = "center";
      ctx.textBaseline = "bottom";
      ctx.shadowColor = "rgba(0,0,0,0.6)";
      ctx.shadowBlur = 6;
      const maxW = panelW - pad * 2;
      let t = mcPhrase;
      if (ctx.measureText(t).width > maxW) {
        while (t.length > 0 && ctx.measureText(t + "...").width > maxW) t = t.slice(0, -1);
        t = t + "...";
      }
      ctx.fillText(t, panelX + panelW / 2, phraseY);
      ctx.restore();
    }
  } catch (e) {}

  const panel2Y = panelY + panelH + 32;
  const panel2H = Math.floor(height * 0.18);
  const panel2X = panelX;
  const panel2W = panelW;
  const br2 = 24;
  ctx.save();
  ctx.fillStyle = "rgba(0,0,0,0.45)";
  ctx.beginPath();
  ctx.moveTo(panel2X + br2, panel2Y);
  ctx.lineTo(panel2X + panel2W - br2, panel2Y);
  ctx.quadraticCurveTo(panel2X + panel2W, panel2Y, panel2X + panel2W, panel2Y + br2);
  ctx.lineTo(panel2X + panel2W, panel2Y + panel2H - br2);
  ctx.quadraticCurveTo(panel2X + panel2W, panel2Y + panel2H, panel2X + panel2W - br2, panel2Y + panel2H);
  ctx.lineTo(panel2X + br2, panel2Y + panel2H);
  ctx.quadraticCurveTo(panel2X, panel2Y + panel2H, panel2X, panel2Y + panel2H - br2);
  ctx.lineTo(panel2X, panel2Y + br2);
  ctx.quadraticCurveTo(panel2X, panel2Y, panel2X + br2, panel2Y);
  ctx.closePath();
  ctx.fill();
  ctx.restore();

  try {
    const items = Array.isArray(data.hourly) ? data.hourly.slice(0, 7) : [];
    if (items.length > 0) {
      const pad = 24;
      let precipIconImg = null;
      try {
        precipIconImg = await loadImage(
          "https://www.awxcdn.com/adc-assets/images/components/weather/hourly-card-nfl/drop-icon.svg"
        );
      } catch (e) {
        precipIconImg = null;
      }
      const areaX = panel2X + pad;
      const areaY = panel2Y + 24;
      const areaW = panel2W - pad * 2;
      const itemW = Math.floor(areaW / items.length);
      for (let i = 0; i < items.length; i++) {
        const it = items[i] || {};
        const x = areaX + i * itemW;
        const cx = x + Math.floor(itemW / 2);

        ctx.save();
        ctx.fillStyle = "#ffffff";
        ctx.font = `36px Tahoma`;
        ctx.textAlign = "center";
        ctx.textBaseline = "top";
        ctx.fillText(String(it.time || ""), cx, areaY);
        ctx.restore();

        const iconSize = 128;
        const iconY = areaY + 56;
        if (it.icon) {
          try {
            const img = await loadImage(String(it.icon));
            const ix = cx - Math.floor(iconSize / 2);
            ctx.drawImage(img, ix, iconY, iconSize, iconSize);
          } catch (e) {}
        }

        ctx.save();
        ctx.fillStyle = "#ffffff";
        ctx.font = `44px Tahoma`;
        ctx.textAlign = "center";
        ctx.textBaseline = "top";
        const tempY = iconY + iconSize + 6;
        ctx.fillText(String(it.temp || ""), cx, tempY);
        ctx.restore();

        ctx.save();
        ctx.fillStyle = "#d0d0d0";
        ctx.font = `36px Tahoma`;
        ctx.textBaseline = "top";
        const precipY = tempY + 72;
        const dropSize = 32;
        const dropX = cx - Math.floor(itemW / 4) - 12;
        if (precipIconImg) {
          try {
            ctx.drawImage(precipIconImg, dropX, precipY, dropSize, dropSize);
          } catch (e) {}
        }
        const textX = dropX + dropSize + 8;
        ctx.textAlign = "left";
        ctx.fillText(String(it.precip || ""), textX, precipY - 8);
        ctx.restore();
      }
    }
  } catch (e) {}

  const panel3Y = panel2Y + panel2H + 32;
  const panel3H = Math.floor(height * 0.18);
  const panel3X = panelX;
  const panel3W = panelW;
  const br3 = 24;
  ctx.save();
  ctx.fillStyle = "rgba(0,0,0,0.45)"; // similar opacity to top panel
  ctx.beginPath();
  ctx.moveTo(panel3X + br3, panel3Y);
  ctx.lineTo(panel3X + panel3W - br3, panel3Y);
  ctx.quadraticCurveTo(panel3X + panel3W, panel3Y, panel3X + panel3W, panel3Y + br3);
  ctx.lineTo(panel3X + panel3W, panel3Y + panel3H - br3);
  ctx.quadraticCurveTo(panel3X + panel3W, panel3Y + panel3H, panel3X + panel3W - br3, panel3Y + panel3H);
  ctx.lineTo(panel3X + br3, panel3Y + panel3H);
  ctx.quadraticCurveTo(panel3X, panel3Y + panel3H, panel3X, panel3Y + panel3H - br3);
  ctx.lineTo(panel3X, panel3Y + br3);
  ctx.quadraticCurveTo(panel3X, panel3Y, panel3X + br3, panel3Y);
  ctx.closePath();
  ctx.fill();
  ctx.restore();

  try {
    const ss = data && data.sunriseSunset && Array.isArray(data.sunriseSunset.items) ? data.sunriseSunset.items : [];
    const air = data && data.airQuality ? data.airQuality : null;
    // draw three boxes inside panel3 with ratio 1:1:2 (sunrise:moon:air)
    const gap = 20;
    const innerPad = 20;
    const weights = [1, 1, 2];
    const totalGap = gap * (weights.length - 1);
    const availableW = panel3W - 32 - totalGap;
    const totalWeight = weights.reduce((a, b) => a + b, 0);
    const unitW = Math.floor(availableW / totalWeight);
    const widths = weights.map((w) => w * unitW);
    const boxH = panel3H - 32;
    const startX = panel3X + 16;
    const boxY = panel3Y + 16;

    // compute left x for each box
    const bxPositions = [];
    let curX = startX;
    for (let i = 0; i < widths.length; i++) {
      bxPositions.push(curX);
      curX += widths[i] + gap;
    }

    for (let i = 0; i < widths.length; i++) {
      const bx = bxPositions[i];
      const bw = widths[i];
      // background
      ctx.save();
      ctx.fillStyle = "rgba(255,255,255,0.02)";
      const br = 14;
      ctx.beginPath();
      ctx.moveTo(bx + br, boxY);
      ctx.lineTo(bx + bw - br, boxY);
      ctx.quadraticCurveTo(bx + bw, boxY, bx + bw, boxY + br);
      ctx.lineTo(bx + bw, boxY + boxH - br);
      ctx.quadraticCurveTo(bx + bw, boxY + boxH, bx + bw - br, boxY + boxH);
      ctx.lineTo(bx + br, boxY + boxH);
      ctx.quadraticCurveTo(bx, boxY + boxH, bx, boxY + boxH - br);
      ctx.lineTo(bx, boxY + br);
      ctx.quadraticCurveTo(bx, boxY, bx + br, boxY);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    }

    // Sunrise box (left) - icon centered on one row, larger fonts
    try {
      const it = ss[0] || null;
      const bx = bxPositions[0];
      const iconSize = 84;
      const centerX = bx + Math.floor(widths[0] / 2);
      let iconDrawn = false;
      if (it && it.icon) {
        try {
          const img = await loadImage(String(it.icon));
          const ix = centerX - Math.floor(iconSize / 2);
          ctx.drawImage(img, ix, boxY + innerPad, iconSize, iconSize);
          iconDrawn = true;
        } catch (e) {}
      }
      ctx.save();
      ctx.fillStyle = "#ffffff";
      ctx.font = `36px Tahoma`;
      ctx.textAlign = "center";
      ctx.textBaseline = "top";
      const titleY = boxY + innerPad + (iconDrawn ? iconSize + 8 : 0);
      ctx.fillText(it && it.phrase ? String(it.phrase) : "", centerX, titleY);
      ctx.font = `32px Tahoma`;
      const times = it && Array.isArray(it.times) ? it.times : [];
      for (let j = 0; j < Math.min(2, times.length); j++) {
        const t = times[j];
        const ty = titleY + 56 + j * 42;
        ctx.fillStyle = "#d0d0d0";
        ctx.fillText(`${t.label || ""}: ${t.value || ""}`, centerX, ty);
      }
      ctx.restore();
    } catch (e) {}

    try {
      const it = ss[1] || null;
      const bx = bxPositions[1];
      const iconSize = 84;
      const centerX = bx + Math.floor(widths[1] / 2);
      let iconDrawn = false;
      if (it && it.icon) {
        try {
          const img = await loadImage(String(it.icon));
          const ix = centerX - Math.floor(iconSize / 2);
          ctx.drawImage(img, ix, boxY + innerPad, iconSize, iconSize);
          iconDrawn = true;
        } catch (e) {}
      }
      ctx.save();
      ctx.fillStyle = "#ffffff";
      ctx.font = `36px Tahoma`;
      ctx.textAlign = "center";
      ctx.textBaseline = "top";
      const titleY = boxY + innerPad + (iconDrawn ? iconSize + 8 : 0);
      ctx.fillText(it && it.phrase ? String(it.phrase) : "", centerX, titleY);
      // times
      ctx.font = `32px Tahoma`;
      const times = it && Array.isArray(it.times) ? it.times : [];
      for (let j = 0; j < Math.min(2, times.length); j++) {
        const t = times[j];
        const ty = titleY + 56 + j * 42;
        ctx.fillStyle = "#d0d0d0";
        ctx.fillText(`${t.label || ""}: ${t.value || ""}`, centerX, ty);
      }
      ctx.restore();
    } catch (e) {}

    try {
      const bx = bxPositions[2];
      ctx.save();
      ctx.fillStyle = "#ffffff";
      ctx.font = `36px Tahoma`;
      ctx.textAlign = "left";
      ctx.textBaseline = "top";
      const textX = bx + innerPad;
      // Title
      ctx.fillText("Chất lượng không khí", textX, boxY + innerPad);
      // Category below title
      ctx.font = `32px Tahoma`;
      const catY = boxY + innerPad + 56;
      ctx.fillStyle = air && air.category ? getAirQualityColor(air.category) : "#ffffff";
      ctx.fillText(air && air.category ? String(air.category) : "Không có dữ liệu", textX, catY);
      // Statement wrapped into multiple lines
      ctx.font = `26px Tahoma`;
      ctx.fillStyle = "#d0d0d0";
      const stmtY = catY + 56;
      const stmt = air && air.statement ? String(air.statement) : "";
      const maxW = widths[2] - innerPad * 2;
      // simple word-wrap
      const words = stmt.split(" ");
      let line = "";
      let curY = stmtY;
      for (let w = 0; w < words.length; w++) {
        const testLine = line ? line + " " + words[w] : words[w];
        if (ctx.measureText(testLine).width > maxW) {
          if (line) {
            ctx.fillText(line, textX, curY);
            curY += 34;
            line = words[w];
          } else {
            // single long word
            ctx.fillText(testLine, textX, curY);
            curY += 34;
            line = "";
          }
        } else {
          line = testLine;
        }
      }
      if (line) {
        ctx.fillText(line, textX, curY);
      }
      ctx.restore();
    } catch (e) {}
  } catch (e) {}

  // draw panel4
  const panel4Y = panel3Y + panel3H + 32;
  const panel4H = Math.floor(height * 0.23);
  const panel4X = panelX;
  const panel4W = panelW;
  const br4 = 24;
  ctx.save();
  ctx.fillStyle = "rgba(0,0,0,0.45)";
  ctx.beginPath();
  ctx.moveTo(panel4X + br4, panel4Y);
  ctx.lineTo(panel4X + panel4W - br4, panel4Y);
  ctx.quadraticCurveTo(panel4X + panel4W, panel4Y, panel4X + panel4W, panel4Y + br4);
  ctx.lineTo(panel4X + panel4W, panel4Y + panel4H - br4);
  ctx.quadraticCurveTo(panel4X + panel4W, panel4Y + panel4H, panel4X + panel4W - br4, panel4Y + panel4H);
  ctx.lineTo(panel4X + br4, panel4Y + panel4H);
  ctx.quadraticCurveTo(panel4X, panel4Y + panel4H, panel4X, panel4Y + panel4H - br4);
  ctx.lineTo(panel4X, panel4Y + br4);
  ctx.quadraticCurveTo(panel4X, panel4Y, panel4X + br4, panel4Y);
  ctx.closePath();
  ctx.fill();
  ctx.restore();

  try {
    const items = Array.isArray(data.daily) ? data.daily.slice(0, 3) : [];
    if (items.length > 0) {
      const pad = 20;
      const areaX = panel4X + pad;
      const areaY = panel4Y + 32;
      const areaW = panel4W - pad * 2;
      const rowH = Math.floor(panel4H / items.length);

      const leftW = 160; // day/date column
      const midW = 200; // icon + temp column

      for (let i = 0; i < items.length; i++) {
        const it = items[i] || {};
        const ry = areaY + i * rowH;

        // divider
        if (i > 0) {
          ctx.save();
          ctx.strokeStyle = "rgba(255,255,255,0.06)";
          ctx.lineWidth = 3;
          ctx.beginPath();
          ctx.moveTo(areaX, ry - 32);
          ctx.lineTo(areaX + areaW, ry - 32);
          ctx.stroke();
          ctx.restore();
        }

        // left: day and date
        ctx.save();
        ctx.font = `36px Tahoma`;
        ctx.fillStyle = "#ffffff";
        ctx.textAlign = "left";
        ctx.textBaseline = "top";
        ctx.fillText(String(it.dateGroup.day || ""), areaX, ry - 12);
        ctx.font = `32px Tahoma`;
        ctx.fillStyle = "#d0d0d0";
        ctx.fillText(String(it.dateGroup.date || ""), areaX, ry + 48);
        ctx.restore();

        // middle: icon + temps
        const iconSize = 80;
        const iconX = areaX + leftW - 54;
        const iconY = ry + 6;
        if (it.iconTempGroup.icon) {
          try {
            const img = await loadImage(String(it.iconTempGroup.icon));
            ctx.drawImage(img, iconX, iconY, iconSize, iconSize);
          } catch (e) {}
        }

        ctx.save();
        ctx.fillStyle = "#ffffff";
        ctx.font = `44px Tahoma`;
        ctx.textAlign = "left";
        ctx.textBaseline = "top";
        ctx.fillText(String(it.iconTempGroup.tempPhraseWrapper.high || ""), iconX + iconSize + 12, iconY + 6);
        ctx.font = `36px Tahoma`;
        ctx.fillStyle = "#d0d0d0";
        const highW = ctx.measureText(String(it.iconTempGroup.tempPhraseWrapper.high || "")).width;
        ctx.fillText(
          String(it.iconTempGroup.tempPhraseWrapper.low || ""),
          iconX + iconSize + 12 + highW + 8,
          iconY + 36
        );
        ctx.restore();

        // right: main phrase and subtitle
        const descX = areaX + leftW + midW + 12;
        const maxWDesc = areaX + areaW - descX - 16;
        ctx.save();
        ctx.fillStyle = "#ffffff";
        const main =
          it.phraseGroup && it.phraseGroup.day
            ? String(it.phraseGroup.day)
            : it.phraseGroup && it.phraseGroup.text
            ? String(it.phraseGroup.text).split("|")[0]
            : "";
        const sub =
          it.phraseGroup && it.phraseGroup.night
            ? String(it.phraseGroup.night)
            : it.phraseGroup && it.phraseGroup.text && String(it.phraseGroup.text).includes("|")
            ? String(it.phraseGroup.text).split("|")[1]
            : "";
        // main line (wrap or ellipsize)
        ctx.font = `32px Tahoma`;
        let dy = ry + 28;
        if (ctx.measureText(main).width > maxWDesc) {
          let t = main;
          while (t.length > 0 && ctx.measureText(t + "...").width > maxWDesc) t = t.slice(0, -1);
          ctx.fillText(t + "...", descX, dy);
          dy += 42;
        } else {
          ctx.fillText(main, descX, dy);
          dy += 42;
        }
        // subtitle
        if (sub) {
          ctx.font = `28px Tahoma`;
          ctx.fillStyle = "#d0d0d0";
          if (ctx.measureText(sub).width > maxWDesc) {
            let t = sub;
            while (t.length > 0 && ctx.measureText(t + "...").width > maxWDesc) t = t.slice(0, -1);
            ctx.fillText(t + "...", descX, dy);
          } else {
            ctx.fillText(sub, descX, dy);
          }
        }
        ctx.restore();

        try {
          const precipVal =
            it && it.precipGroup && it.precipGroup.value
              ? String(it.precipGroup.value)
              : it && it.precip
              ? String(it.precip)
              : null;
          const precipIcon = it && it.precipGroup && it.precipGroup.icon ? String(it.precipGroup.icon) : null;
          if (precipVal) {
            const pIconSize = 32;
            const rightPad = 24;
            const iconX = areaX + areaW - rightPad - pIconSize + 18;
            const iconY = ry + Math.floor((rowH - pIconSize) / 2);
            if (precipIcon) {
              try {
                const pImg = await loadImage(precipIcon);
                ctx.save();
                ctx.globalAlpha = 1.0; // Đảm bảo không bị mờ
                ctx.filter = "brightness(1.2) contrast(1.5)"; // Tăng độ đậm cho icon
                ctx.drawImage(pImg, iconX, iconY, pIconSize, pIconSize);
                ctx.filter = "none";
                ctx.restore();
              } catch (e) {}
            }
            ctx.save();
            ctx.font = `32px Tahoma`;
            ctx.fillStyle = "#ffffff";
            ctx.textAlign = "right";
            ctx.textBaseline = "middle";
            const textX = iconX - 8;
            const textY = ry + Math.floor(rowH / 2);
            ctx.fillText(precipVal, textX, textY);
            ctx.restore();
          }
        } catch (e) {}
      }
    }
  } catch (e) {}

  const outPath = path.join(tempDir, `weather-forecast_${Date.now()}.png`);
  const out = fs.createWriteStream(outPath);
  const stream = canvas.createPNGStream();
  stream.pipe(out);
  await new Promise((resolve, reject) => {
    out.on("finish", resolve);
    out.on("error", reject);
  });
  return outPath;
}

export async function getSendtaskOverallWeather(api, message, caption, ttl) {
  let imagePath = null;
  try {
    const majorCities = ["Hà Nội", "Thành Phố Hồ Chí Minh", "Đà Nẵng", "Hải Phòng", "Cần Thơ", "Huế"];
    const randomCity = majorCities[Math.floor(Math.random() * majorCities.length)];
    const findLocation = await weatherForeCast.searchLocation(randomCity);
    if (findLocation) {
      const dataWeatherForeCast = await weatherForeCast.fetchWeatherByLocation(findLocation);
      imagePath = await generateWeatherForeCastImage(dataWeatherForeCast);
      const dataUpload = await api.uploadAttachment([imagePath], message.threadId, message.type, { isUseProphylactic: true });
      const imageUrl = dataUpload[0].fileUrl || dataUpload[0].normalUrl;
      await api.sendImage(imageUrl, message, caption, ttl);
    }
  } catch (error) {
    throw error;
  } finally {
    deleteFile(imagePath);
  }
}

async function getOverallWeather(api, message, threadId) {
  try {
    const majorCities = ["Hà Nội", "Thành Phố Hồ Chí Minh", "Đà Nẵng", "Hải Phòng", "Cần Thơ", "Huế"];
    const randomCity = majorCities[Math.floor(Math.random() * majorCities.length)];
    const findLocation = await weatherForeCast.searchLocation(randomCity);

    if (findLocation) {
      let imagePath = null;
      try {
        const dataWeatherForeCast = await weatherForeCast.fetchWeatherByLocation(findLocation);
        imagePath = await generateWeatherForeCastImage(dataWeatherForeCast);
        const senderId = message.data.uidFrom;
        const senderName = message.data.dName;
        const mentions = [MessageMention(senderId, senderName.length, 0)];
        await api.sendMessage(
          {
            msg: `${senderName} thông tin thời tiết tổng quan tại ${randomCity}`,
            attachments: imagePath ? [imagePath] : [],
            mentions: mentions,
            ttl: 3600000 * 6,
            isUseProphylactic: true,
          },
          threadId,
          message.type
        );
      } catch (e) {
        console.error("Lỗi khi lấy thông tin thời tiết tổng quan:", e);
      } finally {
        deleteFile(imagePath);
      }
    } else {
      await getLocalWeather(api, message, threadId, randomCity, true);
    }
  } catch (error) {
    console.error("Lỗi khi lấy thông tin thời tiết tổng quan:", error);
    await api.sendMessage(
      { msg: "Đã xảy ra lỗi khi lấy thông tin thời tiết tổng quan. Vui lòng thử lại sau.", quote: message },
      threadId,
      message.type
    );
  }
}

async function getLocalWeather(api, message, threadId, location, isOverall = false) {
  let imagePath = null;
  try {
    const findLocation = await weatherForeCast.searchLocation(location);
    if (findLocation) {
      const dataWeatherForeCast = await weatherForeCast.fetchWeatherByLocation(findLocation);
      imagePath = await generateWeatherForeCastImage(dataWeatherForeCast);
      const senderId = message.data.uidFrom;
      const senderName = message.data.dName;
      const mentions = [MessageMention(senderId, senderName.length, 0)];
      await api.sendMessage(
        {
          msg: `${senderName} thông tin thời tiết ${location}`,
          attachments: imagePath ? [imagePath] : [],
          mentions: mentions,
          ttl: 3600000 * 6,
          isUseProphylactic: true,
        },
        threadId,
        message.type
      );
    } else {
      const geoResponse = await fetch(
        `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(
          location
        )}&count=1&language=vi&format=json`
      );
      const geoData = await geoResponse.json();

      if (!geoData.results || geoData.results.length === 0) {
        await api.sendMessage(
          { msg: "Không tìm thấy thành phố. Vui lòng kiểm tra lại tên thành phố.", quote: message },
          threadId,
          message.type
        );
        return;
      }

      const { latitude, longitude, name, admin1, country } = geoData.results[0];

      const [tomorrowData, openWeatherData, weatherApiData] = await Promise.all([
        getTomorrowWeather(latitude, longitude),
        getOpenWeatherData(latitude, longitude),
        getWeatherApiData(latitude, longitude),
      ]);

      const weatherInfo = getWeatherDataObject(
        name,
        admin1,
        country,
        tomorrowData,
        openWeatherData,
        weatherApiData,
        isOverall
      );

      const weatherInfoString = formatWeatherInfo(weatherInfo);
      await api.sendMessage({ msg: weatherInfoString, quote: message, ttl: 3600000 }, threadId, message.type);
    }
  } catch (error) {
    console.error("Lỗi khi lấy thông tin thời tiết địa phương:", error);
    await api.sendMessage(
      { msg: "Đã xảy ra lỗi khi lấy thông tin thời tiết địa phương. Vui lòng thử lại sau.", quote: message },
      threadId,
      message.type
    );
  } finally {
    deleteFile(imagePath);
  }
}

// Lấy dữ liệu từ Tomorrow.io (tốt cho dự báo ngắn hạn và chi tiết theo giờ)
async function getTomorrowWeather(lat, lon) {
  const response = await fetch(
    `https://api.tomorrow.io/v4/weather/forecast?location=${lat},${lon}&apikey=${TOMORROW_API_KEY}`
  );
  return await response.json();
}

// Lấy dữ liệu từ OpenWeather (tốt cho thông tin hiện tại và chất lượng không khí)
async function getOpenWeatherData(lat, lon) {
  const response = await fetch(
    `https://api.openweathermap.org/data/2.5/weather?lat=${lat}&lon=${lon}&appid=${OPENWEATHER_API_KEY}&units=metric&lang=vi`
  );
  return await response.json();
}

// Lấy dữ liệu từ WeatherAPI (tốt cho dự báo dài hạn và thông tin thiên văn)
async function getWeatherApiData(lat, lon) {
  const response = await fetch(
    `http://api.weatherapi.com/v1/forecast.json?key=${WEATHERAPI_KEY}&q=${lat},${lon}&days=3&aqi=yes&lang=vi`
  );
  return await response.json();
}

function getWeatherDataObject(name, admin1, country, tomorrow, openWeather, weatherApi, isOverall) {
  const tm = tomorrow || {};
  const ow = openWeather || {};
  const wa = weatherApi || {};
  const waCurrent = wa.current || {};

  const nowMs = ow.dt ? ow.dt * 1000 : Date.now();
  const loc = isOverall ? "Tổng Quan" : `${name}${admin1 ? `, ${admin1}` : ""}${country ? `, ${country}` : ""}`;

  // NHIỆT ĐỘ VÀ ĐỘ ẨM: ưu tiên hoàn toàn dữ liệu từ Tomorrow.io (temperature, temperatureApparent)
  const tempC =
    tm.timelines &&
    tm.timelines.hourly &&
    tm.timelines.hourly[0] &&
    tm.timelines.hourly[0].values.temperature !== undefined
      ? tm.timelines.hourly[0].values.temperature
      : waCurrent.temp_c !== undefined && waCurrent.temp_c !== null
      ? waCurrent.temp_c
      : ow.main && ow.main.temp !== undefined
      ? ow.main.temp
      : undefined;

  // Cảm giác (feels like) lấy từ temperatureApparent của Tomorrow.io nếu có, ngược lại dùng WeatherAPI -> OpenWeather
  const feelsLikeC =
    tm.timelines &&
    tm.timelines.hourly &&
    tm.timelines.hourly[0] &&
    tm.timelines.hourly[0].values.temperatureApparent !== undefined
      ? tm.timelines.hourly[0].values.temperatureApparent
      : waCurrent.feelslike_c !== undefined && waCurrent.feelslike_c !== null
      ? waCurrent.feelslike_c
      : ow.main && ow.main.feels_like !== undefined
      ? ow.main.feels_like
      : undefined;

  // Độ ẩm ưu tiên từ Tomorrow.io
  const humidity =
    tm.timelines &&
    tm.timelines.hourly &&
    tm.timelines.hourly[0] &&
    tm.timelines.hourly[0].values.humidity !== undefined
      ? tm.timelines.hourly[0].values.humidity
      : waCurrent.humidity !== undefined && waCurrent.humidity !== null
      ? waCurrent.humidity
      : ow.main && ow.main.humidity !== undefined
      ? ow.main.humidity
      : undefined;

  const pressureMb =
    waCurrent.pressure_mb !== undefined && waCurrent.pressure_mb !== null
      ? waCurrent.pressure_mb
      : ow.main && ow.main.pressure !== undefined
      ? ow.main.pressure
      : tm.timelines && tm.timelines.hourly && tm.timelines.hourly[0]
      ? tm.timelines.hourly[0].values.pressureSeaLevel
      : undefined;

  const visibilityKm =
    waCurrent.vis_km !== undefined && waCurrent.vis_km !== null
      ? waCurrent.vis_km
      : ow.visibility !== undefined
      ? ow.visibility / 1000
      : tm.timelines && tm.timelines.hourly && tm.timelines.hourly[0]
      ? tm.timelines.hourly[0].values.visibility
      : undefined;

  // Wind: normalize to m/s
  const windSpeedMs =
    waCurrent.wind_kph !== undefined && waCurrent.wind_kph !== null
      ? Number((waCurrent.wind_kph / 3.6).toFixed(2))
      : ow.wind && ow.wind.speed !== undefined
      ? ow.wind.speed
      : tm.timelines && tm.timelines.hourly && tm.timelines.hourly[0]
      ? tm.timelines.hourly[0].values.windSpeed
      : undefined;

  const windGustMs =
    waCurrent.gust_kph !== undefined && waCurrent.gust_kph !== null
      ? Number((waCurrent.gust_kph / 3.6).toFixed(2))
      : ow.wind && ow.wind.gust !== undefined
      ? ow.wind.gust
      : tm.timelines && tm.timelines.hourly && tm.timelines.hourly[0]
      ? tm.timelines.hourly[0].values.windGust
      : undefined;

  const windDeg =
    waCurrent.wind_degree !== undefined && waCurrent.wind_degree !== null
      ? waCurrent.wind_degree
      : ow.wind && ow.wind.deg !== undefined
      ? ow.wind.deg
      : tm.timelines && tm.timelines.hourly && tm.timelines.hourly[0]
      ? tm.timelines.hourly[0].values.windDirection
      : undefined;

  // Mưa hiện tại (last 1h) ưu tiên OpenWeather -> WeatherAPI -> Tomorrow
  const precip1h =
    ow.rain && ow.rain["1h"] !== undefined
      ? ow.rain["1h"]
      : waCurrent.precip_mm !== undefined
      ? waCurrent.precip_mm
      : tm.timelines && tm.timelines.hourly && tm.timelines.hourly[0]
      ? tm.timelines.hourly[0].values.rainIntensity || 0
      : 0;

  // Khả năng mưa (probability) lấy từ Tomorrow hourly nếu có, hoặc WeatherAPI forecast chance_of_rain
  let precipProb;
  try {
    // Ưu tiên lấy xác suất mưa từ WeatherAPI forecast trước
    if (wa.forecast && wa.forecast.forecastday && wa.forecast.forecastday[0]) {
      // weatherapi hourly có chance_of_rain trong forecast.forecastday[0].hour[0]
      const hr = wa.forecast.forecastday[0].hour && wa.forecast.forecastday[0].hour[0];
      if (hr && hr.chance_of_rain !== undefined) precipProb = hr.chance_of_rain;
    }
    // Nếu chưa có, lấy từ Tomorrow hourly
    if (precipProb === undefined && tm.timelines && Array.isArray(tm.timelines.hourly)) {
      const nextHour = tm.timelines.hourly[0];
      precipProb =
        nextHour && nextHour.values && nextHour.values.precipitationProbability !== undefined
          ? nextHour.values.precipitationProbability
          : undefined;
    }
  } catch (e) {
    precipProb = precipProb;
  }

  const uvIndex =
    waCurrent.uv !== undefined && waCurrent.uv !== null
      ? waCurrent.uv
      : tm.timelines && tm.timelines.hourly && tm.timelines.hourly[0]
      ? tm.timelines.hourly[0].values.uvIndex
      : undefined;
  const uvLevel = uvIndex !== undefined ? getUVLevel(uvIndex) : "Không có dữ liệu";

  // AQI: ưu tiên WeatherAPI air_quality
  let aqiText = "Không có dữ liệu AQI";
  try {
    if (waCurrent.air_quality) {
      const aq = waCurrent.air_quality;
      // take pm2_5 as main indicator if present
      if (aq.pm2_5 !== undefined) aqiText = `PM2.5: ${Number(aq.pm2_5).toFixed(1)} µg/m³`;
      else if (wa.current && wa.current.air_quality && wa.current.air_quality["us-epa-index"] !== undefined)
        aqiText = `US-EPA: ${wa.current.air_quality["us-epa-index"]}`;
    } else if (wa.current && wa.current.air_quality) {
      const aq = wa.current.air_quality;
      if (aq.pm2_5 !== undefined) aqiText = `PM2.5: ${Number(aq.pm2_5).toFixed(1)} µg/m³`;
    }
  } catch (e) {
    aqiText = aqiText;
  }

  // Mô tả thời tiết: ưu tiên WeatherAPI -> OpenWeather -> Tomorrow
  const descArr = [];
  if (waCurrent.condition && waCurrent.condition.text) descArr.push(waCurrent.condition.text);
  if (ow.weather && ow.weather[0] && ow.weather[0].description) descArr.push(ow.weather[0].description);
  if (
    tm.timelines &&
    tm.timelines.daily &&
    tm.timelines.daily[0] &&
    tm.timelines.daily[0].values &&
    (tm.timelines.daily[0].values.weatherCodeMax || tm.timelines.daily[0].values.weatherCodeMin)
  ) {
    descArr.push(
      getWeatherDescription(tm.timelines.daily[0].values.weatherCodeMax || tm.timelines.daily[0].values.weatherCodeMin)
    );
  }
  const desc = descArr.length > 0 ? descArr.join(", ") : "Không rõ";

  // Thời gian bình minh/hoàng hôn
  let sunrise = null,
    sunset = null;
  try {
    if (wa.forecast && wa.forecast.forecastday && wa.forecast.forecastday[0] && wa.forecast.forecastday[0].astro) {
      sunrise = wa.forecast.forecastday[0].astro.sunrise;
      sunset = wa.forecast.forecastday[0].astro.sunset;
    } else if (ow.sys && ow.sys.sunrise) {
      sunrise = formatTime(ow.sys.sunrise * 1000);
      sunset = formatTime(ow.sys.sunset * 1000);
    }
  } catch (e) {
    // ignore
  }

  // Trả về object chuẩn
  const dailyValues =
    tm.timelines && tm.timelines.daily && tm.timelines.daily[0]
      ? tm.timelines.daily[0].values
      : wa.forecast && wa.forecast.forecastday && wa.forecast.forecastday[0]
      ? {
          temperatureMax: wa.forecast.forecastday[0].day && wa.forecast.forecastday[0].day.maxtemp_c,
          temperatureMin: wa.forecast.forecastday[0].day && wa.forecast.forecastday[0].day.mintemp_c,
        }
      : null;

  return {
    location: loc,
    updatedAt: nowMs,
    temperature: tempC,
    feelsLike: feelsLikeC,
    humidity,
    pressureMb,
    visibilityKm,
    windSpeedMs,
    windGustMs,
    windDeg,
    precip1h,
    precipProb,
    uvIndex,
    uvLevel,
    aqiText,
    description: desc,
    sunrise,
    sunset,
    daily: dailyValues,
    raw: { tomorrow: tm, openWeather: ow, weatherApi: wa },
  };
}

function formatWeatherInfo(weatherData) {
  const wd = weatherData || {};
  const nowMs = wd.updatedAt || Date.now();
  const parts = [];
  parts.push("[ THÔNG BÁO THỜI TIẾT ]");
  parts.push(`📍 ${wd.location || "Không xác định"}`);
  parts.push(`⏰ Cập nhật: ${new Date(nowMs).toLocaleString("vi-VN")}`);
  parts.push("");

  parts.push("🌡️ NHIỆT ĐỘ VÀ ĐỘ ẨM");
  parts.push(
    `• Hiện tại: ${wd.temperature !== undefined ? Number(wd.temperature).toFixed(1) + "°C" : "Không có dữ liệu"} ${
      wd.feelsLike !== undefined ? `(Cảm giác như ${Number(wd.feelsLike).toFixed(1)}°C)` : ""
    }`
  );

  if (wd.daily) {
    const tmin = wd.daily.temperatureMin !== undefined ? wd.daily.temperatureMin : undefined;
    const tmax = wd.daily.temperatureMax !== undefined ? wd.daily.temperatureMax : undefined;
    if (tmin !== undefined) parts.push(`• Thấp Nhất: ${Number(tmin).toFixed(1)}°C`);
    if (tmax !== undefined) parts.push(`• Cao Nhất: ${Number(tmax).toFixed(1)}°C`);
  }
  parts.push(`• Độ ẩm: ${wd.humidity !== undefined ? Math.round(wd.humidity) + "%" : "Không có dữ liệu"}`);
  parts.push("");

  parts.push("🌤️ ĐIỀU KIỆN THỜI TIẾT");
  parts.push(`• Hiện tại: ${wd.description || "Không rõ"}`);
  parts.push(
    `• Mây che phủ: ${
      wd.raw && wd.raw.openWeather && wd.raw.openWeather.clouds && wd.raw.openWeather.clouds.all !== undefined
        ? wd.raw.openWeather.clouds.all + "%"
        : wd.raw &&
          wd.raw.tomorrow &&
          wd.raw.tomorrow.timelines &&
          wd.raw.tomorrow.timelines.hourly &&
          wd.raw.tomorrow.timelines.hourly[0]
        ? wd.raw.tomorrow.timelines.hourly[0].values.cloudCover + "%"
        : "Không có dữ liệu"
    }`
  );
  parts.push(
    `• Tầm nhìn: ${wd.visibilityKm !== undefined ? Number(wd.visibilityKm).toFixed(1) + " km" : "Không có dữ liệu"}`
  );
  parts.push("");

  parts.push("🌧️ LƯỢNG MƯA VÀ KHẢ NĂNG MƯA");
  parts.push(`• Lượng mưa (1h qua): ${wd.precip1h !== undefined ? wd.precip1h + " mm" : "Không có dữ liệu"}`);
  parts.push(`• Khả năng mưa (gần nhất): ${wd.precipProb !== undefined ? wd.precipProb + "%" : "Không có dữ liệu"}`);
  if (wd.raw && wd.raw.tomorrow && wd.raw.tomorrow.timelines && wd.raw.tomorrow.timelines.hourly)
    parts.push(`• Dự báo: ${getPrecipitationForecast(wd.raw.tomorrow.timelines.hourly)}`);
  parts.push("");

  parts.push("💨 GIÓ VÀ ÁP SUẤT");
  parts.push(
    `• Tốc độ gió: ${wd.windSpeedMs !== undefined ? Number(wd.windSpeedMs).toFixed(1) + " m/s" : "Không có dữ liệu"}`
  );
  parts.push(
    `• Hướng gió: ${wd.windDeg !== undefined ? getWindDirection(wd.windDeg) + ` (${wd.windDeg}°)` : "Không có dữ liệu"}`
  );
  parts.push(
    `• Gió giật: ${wd.windGustMs !== undefined ? Number(wd.windGustMs).toFixed(1) + " m/s" : "Không có dữ liệu"}`
  );
  parts.push(`• Áp suất: ${wd.pressureMb !== undefined ? Math.round(wd.pressureMb) + " hPa" : "Không có dữ liệu"}`);
  parts.push("");

  parts.push("🌅 THÔNG TIN THIÊN VĂN & CHÍNH SÁCH UV/AQI");
  if (wd.sunrise && wd.sunset) parts.push(`• Bình minh: ${wd.sunrise}  •  Hoàng hôn: ${wd.sunset}`);
  parts.push(`• Chỉ số UV: ${wd.uvIndex !== undefined ? wd.uvIndex + ` (${wd.uvLevel})` : "Không có dữ liệu"}`);
  parts.push(`• Chất lượng không khí: ${wd.aqiText || "Không có dữ liệu AQI"}`);
  parts.push("");

  return parts.join("\n");
}

function getUVLevel(index) {
  if (index <= 2) return "Thấp";
  if (index <= 5) return "Trung bình";
  if (index <= 7) return "Cao";
  if (index <= 10) return "Rất cao";
  return "Nguy hiểm";
}

function getWindDirection(degrees) {
  const directions = ["Bắc", "Đông Bắc", "Đông", "Đông Nam", "Nam", "Tây Nam", "Tây", "Tây Bắc"];
  const index = Math.round(degrees / 45) % 8;
  return directions[index];
}

function formatTime(timestamp) {
  return new Date(timestamp).toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit" });
}

function getPrecipitationForecast(hourlyData) {
  if (!Array.isArray(hourlyData)) return "Không có dữ liệu dự báo mưa";

  const next24Hours = hourlyData.slice(0, 24);
  const rainHour = next24Hours.find((hour) => hour && hour.values && hour.values.precipitationProbability > 50);

  if (!rainHour) {
    const lightRainHour = next24Hours.find((hour) => hour && hour.values && hour.values.precipitationProbability > 30);

    if (lightRainHour) {
      return "Có thể có mưa nhỏ trong 24 giờ tới";
    }
    return "Dự kiến không có mưa trong 24 giờ tới";
  }

  try {
    const time = new Date(rainHour.time);
    const hour = time.getHours();
    const dayNames = ["Chủ Nhật", "Thứ Hai", "Thứ Ba", "Thứ Tư", "Thứ Năm", "Thứ Sáu", "Thứ Bảy"];
    const dayName = dayNames[time.getDay()];

    let timeOfDay;
    if (hour >= 5 && hour < 12) timeOfDay = "sáng";
    else if (hour >= 12 && hour < 18) timeOfDay = "chiều";
    else if (hour >= 18 && hour < 22) timeOfDay = "tối";
    else timeOfDay = "đêm";

    const probability = rainHour.values.precipitationProbability;
    const intensity = getRainIntensity(rainHour.values.rainIntensity || 0);

    return `Dự báo ${intensity} vào ${timeOfDay} ${dayName} (${probability}% khả năng)`;
  } catch (error) {
    console.error("Lỗi khi dự báo mưa:", error);
    return "Không thể dự đoán chính xác thời gian mưa";
  }
}

function getRainIntensity(intensity) {
  if (intensity === 0) return "không mưa";
  if (intensity < 2.5) return "mưa nhỏ";
  if (intensity < 7.6) return "mưa vừa";
  if (intensity < 15.2) return "mưa to";
  if (intensity < 30.4) return "mưa rất to";
  return "mưa đặc biệt to";
}

function getWeatherDescription(code) {
  const weatherCodes = {
    1000: "Quang đãng",
    1100: "Có mây nhẹ",
    1101: "Có mây",
    1102: "Nhiều mây",
    1001: "Âm u",
    2000: "Sương mù",
    2100: "Sương mù nhẹ",
    4000: "Mưa nhỏ",
    4001: "Mưa",
    4200: "Mưa nhẹ",
    4201: "Mưa vừa",
    4202: "Mưa to",
    5000: "Tuyết",
    5001: "Tuyết rơi nhẹ",
    5100: "Mưa tuyết nhẹ",
    6000: "Mưa đá",
    6200: "Mưa đá nhẹ",
    6201: "Mưa đá nặng",
    7000: "Sấm sét",
    7101: "Sấm sét mạnh",
    7102: "Giông bão",
    8000: "Một vài cơn mưa rào",
  };
  return weatherCodes[code] || "Không rõ";
}
