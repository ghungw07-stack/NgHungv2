import axios from "axios";
import path from "path";
import fs from "fs";
import { createCanvas, loadImage } from "canvas";
import lunarCalendar from "lunar-calendar";
import Holidays from "date-holidays";
import * as cheerio from "cheerio";
import puppeteer from "puppeteer";
import { BACKGROUND_RESOURCE_PATH_TEMP, tempDir } from "../../../utils/io-json.js";
import { deleteFile } from "../../../utils/util.js";
import { sendMessageFailed, sendMessageFromSQL } from "../../chat-zalo/chat-style/chat-style.js";
import * as cv from "../../../utils/canvas/index.js";
import { removeMention } from "../../../utils/format-util.js";
import { getGlobalPrefix } from "../../service.js";
import { solarToVietnameseLunar } from "../../../utils/vietnamese-lunar.js";

function createHorizontalGradient(ctx, startX, endX, colors = ["#00e0ff", "#ff00ff", "#ff007f"]) {
  const gradient = ctx.createLinearGradient(startX, 0, endX, 0);
  const steps = colors.length - 1 || 1;

  for (let index = 0; index < colors.length; index++) {
    gradient.addColorStop(index / steps, colors[index]);
  }

  return gradient;
}

async function scrapeHorary(day, month, year) {
  const dayString = String(day).padStart(2, "0");
  const monthString = String(month).padStart(2, "0");
  const yearString = String(year);
  const url = `https://www.xemlicham.com/am-lich/nam/${yearString}/thang/${monthString}/ngay/${dayString}`;
  const { data } = await axios.get(url);

  const $ = cheerio.load(data);
  
  let container = $("div.rounded.break-words.my-2").first();
  if (!container.length) {
    container = $("div.rounded").first();
  }
  if (!container.length) {
    container = $("table").first().parent();
  }
  if (!container.length) {
    container = $("body");
  }

  const findRowText = (labelName) => {
    let row = container
      .find("tr")
      .filter((i, el) => {
        const lbl = $(el).find("label").first().text().trim();
        return lbl && lbl.includes(labelName);
      })
      .first();

    if (!row.length) {
      row = $("tr")
        .filter((i, el) => {
          const lbl = $(el).find("label").first().text().trim();
          return lbl && lbl.includes(labelName);
        })
        .first();
    }

    if (!row.length) {
      row = $("tr")
        .filter((i, el) => {
          const firstTd = $(el).find("td").first().text().trim();
          return firstTd && firstTd.includes(labelName);
        })
        .first();
    }

    if (!row.length) {
      row = $("tr")
        .filter((i, el) => {
          const firstTh = $(el).find("th").first().text().trim();
          return firstTh && firstTh.includes(labelName);
        })
        .first();
    }

    if (!row.length) {
      const labelEl = $("*")
        .filter((i, el) => {
          const text = $(el).text().trim();
          return text && text.includes(labelName) && text.length < 100;
        })
        .first();
      
      if (labelEl.length) {
        const nextTd = labelEl.closest("tr").find("td").eq(1);
        if (nextTd.length) {
          return nextTd.text().replace(/\s+/g, " ").trim();
        }
        const nextDiv = labelEl.next();
        if (nextDiv.length) {
          return nextDiv.text().replace(/\s+/g, " ").trim();
        }
      }
    }

    if (!row.length) return "";

    const tds = row.find("td");
    if (tds.length >= 2) {
      return tds.eq(1).text().replace(/\s+/g, " ").trim();
    } else if (tds.length === 1) {
      return tds.first().text().replace(/\s+/g, " ").trim();
    }

    return "";
  };

  const hoangDaoText = findRowText("Giờ Hoàng Đạo");
  const hacDaoText = findRowText("Giờ Hắc Đạo");
  const huongXuatHanhText = findRowText("Hướng xuất hành");

  const splitItems = (text) => {
    if (!text) return [];
    return text
      .split(/\s*;\s*/)
      .map((s) => s.trim())
      .filter(Boolean);
  };

  const splitSentences = (text) => {
    if (!text) return [];
    return String(text)
      .split(/[\.;]\s*/)
      .map((s) => s.replace(/\s+/g, " ").trim())
      .filter(Boolean);
  };

  const result = {
    hoangDao: splitItems(hoangDaoText),
    hacDao: splitItems(hacDaoText),
    huongXuatHanh: splitSentences(huongXuatHanhText),
    raw: {
      hoangDaoText,
      hacDaoText,
      huongXuatHanhText,
    },
  };

  return result;
}

const weekdays = ["CN", "T2", "T3", "T4", "T5", "T6", "T7"];
// const weekdays = ["Chủ nhật", "Thứ hai", "Thứ ba", "Thứ tư", "Thứ năm", "Thứ sáu", "Thứ bảy"];
const stems = {
  甲: "Giáp",
  乙: "Ất",
  丙: "Bính",
  丁: "Đinh",
  戊: "Mậu",
  己: "Kỷ",
  庚: "Canh",
  辛: "Tân",
  壬: "Nhâm",
  癸: "Quý",
};
const branches = {
  子: "Tý",
  丑: "Sửu",
  寅: "Dần",
  卯: "Mão",
  辰: "Thìn",
  巳: "Tỵ",
  午: "Ngọ",
  未: "Mùi",
  申: "Thân",
  酉: "Dậu",
  戌: "Tuất",
  亥: "Hợi",
};
const animals = {
  鼠: "Chuột",
  牛: "Trâu",
  虎: "Hổ",
  兔: "Mão/Thỏ",
  龙: "Rồng",
  蛇: "Rắn",
  马: "Ngựa",
  羊: "Dê",
  猴: "Khỉ",
  鸡: "Gà",
  狗: "Chó",
  猪: "Lợn",
};
const toCanChi = (gz) => (stems[gz[0]] || "") + " " + (branches[gz[1]] || "");
var hd = new Holidays();
hd.init("VN");

function roundedRect(ctx, x, y, width, height, radius = 28) {
  const r = Math.min(radius, width / 2, height / 2);
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + width, y, x + width, y + height, r);
  ctx.arcTo(x + width, y + height, x, y + height, r);
  ctx.arcTo(x, y + height, x, y, r);
  ctx.arcTo(x, y, x + width, y, r);
  ctx.closePath();
}

function wrapCalendarText(ctx, text, maxWidth, maxLines = 3) {
  const words = String(text || "").trim().split(/\s+/).filter(Boolean);
  const lines = [];
  let line = "";
  for (const word of words) {
    const next = line ? `${line} ${word}` : word;
    if (!line || ctx.measureText(next).width <= maxWidth) line = next;
    else {
      lines.push(line);
      line = word;
      if (lines.length === maxLines) break;
    }
  }
  if (line && lines.length < maxLines) lines.push(line);
  if (lines.length === maxLines && words.join(" ") !== lines.join(" ")) {
    while (lines[maxLines - 1].length > 1 && ctx.measureText(`${lines[maxLines - 1]}…`).width > maxWidth) {
      lines[maxLines - 1] = lines[maxLines - 1].slice(0, -1);
    }
    lines[maxLines - 1] += "…";
  }
  return lines;
}

function drawInfoCard(ctx, { x, y, width, title, value, accent, icon, minHeight = 150 }) {
  ctx.save();
  ctx.font = "600 32px Tahoma";
  const lines = wrapCalendarText(ctx, value || "Đang cập nhật", width - 72, 3);
  const height = Math.max(minHeight, 84 + lines.length * 43);

  roundedRect(ctx, x, y, width, height, 30);
  ctx.fillStyle = "rgba(13, 20, 31, 0.78)";
  ctx.fill();
  ctx.strokeStyle = "rgba(255,255,255,0.12)";
  ctx.lineWidth = 2;
  ctx.stroke();

  roundedRect(ctx, x + 24, y + 24, 52, 52, 16);
  ctx.fillStyle = `${accent}2b`;
  ctx.fill();
  ctx.font = "28px Tahoma";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillStyle = accent;
  ctx.fillText(icon, x + 50, y + 50);

  ctx.textAlign = "left";
  ctx.textBaseline = "top";
  ctx.font = "700 28px Tahoma";
  ctx.fillStyle = accent;
  ctx.fillText(title.toUpperCase(), x + 92, y + 32);
  ctx.font = "600 32px Tahoma";
  ctx.fillStyle = "#f8fafc";
  lines.forEach((line, index) => ctx.fillText(line, x + 36, y + 91 + index * 43));
  ctx.restore();
  return height;
}

function drawModernLunarCalendar(ctx, data) {
  const { width, height } = ctx.canvas;
  const margin = 64;
  const contentWidth = width - margin * 2;

  const shade = ctx.createLinearGradient(0, 0, 0, height);
  shade.addColorStop(0, "rgba(5,10,18,0.35)");
  shade.addColorStop(0.42, "rgba(5,10,18,0.70)");
  shade.addColorStop(1, "rgba(4,8,15,0.96)");
  ctx.fillStyle = shade;
  ctx.fillRect(0, 0, width, height);

  const glow = ctx.createRadialGradient(width * 0.8, 180, 20, width * 0.8, 180, 600);
  glow.addColorStop(0, "rgba(251,191,36,0.24)");
  glow.addColorStop(1, "rgba(251,191,36,0)");
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, width, 800);

  ctx.textAlign = "left";
  ctx.textBaseline = "top";
  ctx.fillStyle = "rgba(255,255,255,0.72)";
  ctx.font = "700 28px Tahoma";
  ctx.fillText("LỊCH VIỆT • HÔM NAY", margin, 62);
  ctx.textAlign = "right";
  ctx.fillStyle = "#fbbf24";
  ctx.font = "700 42px Tahoma";
  ctx.fillText(data.timeText, width - margin, 52);

  ctx.textAlign = "left";
  ctx.fillStyle = "#ffffff";
  ctx.font = "800 60px Tahoma";
  ctx.fillText(data.weekdayName, margin, 150);
  ctx.font = "900 300px Tahoma";
  ctx.fillStyle = "#f8fafc";
  ctx.fillText(String(data.day).padStart(2, "0"), margin - 10, 190);

  ctx.fillStyle = "#fbbf24";
  ctx.font = "800 62px Tahoma";
  ctx.fillText(`THÁNG ${String(data.month).padStart(2, "0")}`, 610, 295);
  ctx.fillStyle = "rgba(255,255,255,0.92)";
  ctx.font = "800 92px Tahoma";
  ctx.fillText(String(data.year), 610, 365);

  roundedRect(ctx, margin, 540, contentWidth, 300, 38);
  const lunarGradient = ctx.createLinearGradient(margin, 540, width - margin, 840);
  lunarGradient.addColorStop(0, "rgba(120,53,15,0.92)");
  lunarGradient.addColorStop(1, "rgba(55,24,8,0.86)");
  ctx.fillStyle = lunarGradient;
  ctx.fill();
  ctx.strokeStyle = "rgba(251,191,36,0.38)";
  ctx.lineWidth = 2;
  ctx.stroke();

  ctx.fillStyle = "#fde68a";
  ctx.font = "700 28px Tahoma";
  ctx.fillText("ÂM LỊCH", margin + 42, 580);
  ctx.fillStyle = "#ffffff";
  ctx.font = "900 104px Tahoma";
  ctx.fillText(`${String(data.lunarDay).padStart(2, "0")} / ${String(data.lunarMonth).padStart(2, "0")}`, margin + 38, 628);
  ctx.fillStyle = "rgba(255,255,255,0.82)";
  ctx.font = "600 32px Tahoma";
  ctx.fillText(`Năm ${data.canChi.namCanChi} • ${data.canChi.conGiapNam}`, margin + 44, 758);

  ctx.textAlign = "right";
  ctx.fillStyle = "#fde68a";
  ctx.font = "700 30px Tahoma";
  ctx.fillText(`Ngày ${data.canChi.ngayCanChi}`, width - margin - 42, 604);
  ctx.fillStyle = "rgba(255,255,255,0.82)";
  ctx.fillText(`Tháng ${data.canChi.thangCanChi}`, width - margin - 42, 658);
  ctx.fillText(`Năm ${data.canChi.namCanChi}`, width - margin - 42, 712);
  ctx.textAlign = "left";

  let y = 878;
  const holidays = data.holidays.slice(0, 2);
  if (holidays.length) {
    const holidayText = holidays.map((item) => `${item._isUpcoming ? item.rule : "Hôm nay"}: ${item.name}`).join("  •  ");
    y += drawInfoCard(ctx, { x: margin, y, width: contentWidth, title: "Ngày đặc biệt", value: holidayText, accent: "#fbbf24", icon: "✦" }) + 20;
  }

  const gap = 20;
  const half = (contentWidth - gap) / 2;
  const goodText = data.auspiciousHour?.slice(0, 6).join(" • ") || "Chưa có dữ liệu";
  const badText = data.inauspiciousHours?.slice(0, 6).join(" • ") || "Chưa có dữ liệu";
  const goodH = drawInfoCard(ctx, { x: margin, y, width: half, title: "Giờ hoàng đạo", value: goodText, accent: "#4ade80", icon: "✓", minHeight: 260 });
  const badH = drawInfoCard(ctx, { x: margin + half + gap, y, width: half, title: "Giờ hắc đạo", value: badText, accent: "#fb7185", icon: "!", minHeight: 260 });
  y += Math.max(goodH, badH) + 20;

  const direction = data.huongXuatHanh?.join(" • ") || "Thông tin hướng xuất hành đang được cập nhật";
  y += drawInfoCard(ctx, { x: margin, y, width: contentWidth, title: "Hướng xuất hành", value: direction, accent: "#60a5fa", icon: "➜", minHeight: 190 }) + 20;

  const footerY = height - margin - 112;
  roundedRect(ctx, margin, footerY, contentWidth, 112, 30);
  ctx.fillStyle = "rgba(255,255,255,0.07)";
  ctx.fill();
  ctx.fillStyle = "rgba(255,255,255,0.58)";
  ctx.font = "600 27px Tahoma";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText("Bình an trong tâm • Thuận lợi trong ngày", width / 2, footerY + 56);
}

export async function generateLunarCalendarImage() {
  const width = 1280;
  const height = 1920;

  const now = new Date();

  const hours = String(now.getHours()).padStart(2, "0");
  const minutes = String(now.getMinutes()).padStart(2, "0");
  const timeText = `${hours}:${minutes}`;
  const weekday = weekdays[now.getDay()];
  const day = now.getDate();
  const month = now.getMonth() + 1;
  const year = now.getFullYear();
  const lunar = lunarCalendar.solarToLunar(year, month, day);
  const vietnameseLunar = solarToVietnameseLunar(day, month, year, 7);
  const { lunarDay, lunarMonth, lunarYear, isLeapMonth } = vietnameseLunar;
  const vnStringDate = {
    namCanChi: toCanChi(lunar.GanZhiYear), // "Ất Tỵ"
    thangCanChi: toCanChi(lunar.GanZhiMonth), // "Giáp Thân"
    ngayCanChi: toCanChi(lunar.GanZhiDay), // "Bính Dần"
    conGiapNam: animals[lunar.zodiac], // "Rắn"
  };
  let holidays = [];
  try {
    const hPrev = hd.getHolidays(year - 1, "VN") || [];
    const hCur = hd.getHolidays(year, "VN") || [];
    const hNext = hd.getHolidays(year + 1, "VN") || [];
    holidays = [].concat(hPrev, hCur, hNext);
  } catch (e) {
    holidays = hd.getHolidays(year, "VN") || [];
  }
  let holidayNow = [];
  try {
    const localDate = new Date(year, month - 1, day, now.getHours(), now.getMinutes(), 0, 0);
    if (Array.isArray(holidays) && holidays.length > 0) {
      const todayMatches = holidays.filter((h) => {
        try {
          const start = h.start ? new Date(h.start) : h.date ? new Date(h.date) : null;
          const end = h.end ? new Date(h.end) : h.date ? new Date(h.date) : null;
          if (!start || !end) return false;
          return localDate.getTime() >= start.getTime() && localDate.getTime() <= end.getTime();
        } catch (e) {
          return false;
        }
      });

      const upcoming = [];
      for (let offset = 1; offset <= 999; offset++) {
        const checkDate = new Date(year, month - 1, day + offset, 12, 0, 0, 0);
        for (const h of holidays) {
          try {
            const start = h.start ? new Date(h.start) : h.date ? new Date(h.date) : null;
            const end = h.end ? new Date(h.end) : h.date ? new Date(h.date) : null;
            if (!start || !end) continue;
            if (checkDate.getTime() >= start.getTime() && checkDate.getTime() <= end.getTime()) {
              // clone and mark upcoming
              const clone = Object.assign({}, h);
              clone._isUpcoming = true;
              if (offset === 1) clone.rule = "Ngày mai";
              else if (offset === 2) clone.rule = "Ngày mốt";
              else clone.rule = `${offset} ngày nữa`;
              upcoming.push({ offset, holiday: clone });
            }
          } catch (e) {
            continue;
          }
        }
      }

      const merged = [];
      const seen = new Set();
      const maxCards = 10;
      function normalizeRule(rule) {
        rule = rule.replace("1 day before vietnamese 1-0-1 P5D", "1DB-1/1");
        rule = rule.split(" ").pop().replace("-0-", "/");
        return rule;
      }
      for (const h of todayMatches) {
        h.rule = normalizeRule(h.rule);
        const key = `${h.name}|${h.date || h.start}`;
        if (!seen.has(key)) {
          merged.push(h);
          seen.add(key);
        }
      }
      upcoming.sort((a, b) => a.offset - b.offset);
      for (const up of upcoming) {
        const h = up.holiday;
        const key = `${h.name}|${h.date || h.start}`;
        if (!seen.has(key)) {
          merged.push(h);
          seen.add(key);
        }
        if (merged.length >= maxCards) break;
      }

      holidayNow = merged.slice(0, maxCards);
    }
  } catch (e) {
    holidayNow = [];
  }

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

  let img = null;
  let auspiciousHour = null;
  let inauspiciousHours = null;
  let huongXuatHanh = null;

  try {
    const [imgResult, horaryResult] = await Promise.all([
      (async () => {
        for (const provider of providers) {
          try {
            let imageBuffer = null;
            if (/^https?:\/\//i.test(provider)) {
              const resp = await axios.get(provider, { responseType: "arraybuffer" });
              imageBuffer = Buffer.from(resp.data, "binary");
            } else {
              imageBuffer = fs.readFileSync(provider);
            }
            return await loadImage(imageBuffer);
          } catch (err) {
            console.warn("Provider failed:", provider, err.code || err.message);
          }
        }
        return null;
      })(),
      (async () => {
        try {
          return await scrapeHorary(day, month, year);
        } catch (err) {
          console.warn("Failed to scrape horary:", err.message || err);
          return null;
        }
      })(),
    ]);
    img = imgResult;
    auspiciousHour = horaryResult.hoangDao;
    inauspiciousHours = horaryResult.hacDao;
    huongXuatHanh = horaryResult.huongXuatHanh;
  } catch (err) {
    console.warn("Lỗi khi tải ảnh hoặc lấy giờ hoàng đạo:", err.message || err);
  }

  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext("2d");

  if (img) ctx.drawImage(img, 0, 0, width, height);
  else {
    const fallback = ctx.createLinearGradient(0, 0, width, height);
    fallback.addColorStop(0, "#172033");
    fallback.addColorStop(1, "#060a12");
    ctx.fillStyle = fallback;
    ctx.fillRect(0, 0, width, height);
  }

  drawModernLunarCalendar(ctx, {
    timeText,
    weekdayName: ["CHỦ NHẬT", "THỨ HAI", "THỨ BA", "THỨ TƯ", "THỨ NĂM", "THỨ SÁU", "THỨ BẢY"][now.getDay()],
    day,
    month,
    year,
    lunarDay,
    lunarMonth,
    lunarYear,
    canChi: vnStringDate,
    holidays: holidayNow,
    auspiciousHour,
    inauspiciousHours,
    huongXuatHanh,
  });

  const modernOutPath = path.join(tempDir, `lunar-calendar-${Date.now()}.png`);
  await fs.promises.writeFile(modernOutPath, canvas.toBuffer("image/png"));
  return modernOutPath;

  try {
    const dateText = `${weekday}, Ngày ${day} Tháng ${month} Năm ${year}`;
    const fontSizeDate = 52;
    const fontSizeTime = 168;
    const labelFont = 42;
    const dateFont = 52;
    const canChiFont = 42;

    const lunarDateStr = `Âm Lịch - ${String(lunarDay).padStart(2, "0")}/${String(lunarMonth).padStart(
      2,
      "0"
    )}/${lunarYear}`;
    const canChiLine = `Ngày ${vnStringDate.ngayCanChi} Tháng ${vnStringDate.thangCanChi} Năm ${vnStringDate.namCanChi}`;

    const x = width / 2;
    const y = (2.2 / 24) * height;

    const timeX = width / 2;
    const timeY = y + fontSizeDate / 2 + 48;
    const lunarLabelY = timeY + fontSizeTime + 24;
    const lunarDateY = lunarLabelY + labelFont + 8;
    const canChiY = lunarDateY + dateFont + 36;

    ctx.save();
    ctx.font = `bold ${fontSizeDate}px Tahoma`;
    const dateW = ctx.measureText(dateText).width;
    ctx.font = `bold ${fontSizeTime}px Tahoma`;
    const timeW = ctx.measureText(timeText).width;
    ctx.font = `bold ${dateFont}px Tahoma`;
    const lunarDateW = ctx.measureText(lunarDateStr).width;
    ctx.font = `bold ${canChiFont}px Tahoma`;
    const canChiW = ctx.measureText(canChiLine).width;
    ctx.font = `bold ${labelFont}px Tahoma`;
    const labelW = ctx.measureText("Âm Lịch").width;
    ctx.restore();

    const maxW = Math.max(dateW, timeW, lunarDateW, canChiW, labelW);
    const paddingX = 60;
    const paddingY = 36;

    // const rectWidth = maxW + paddingX * 2;
    // const rectTop = y - fontSizeDate / 2 - paddingY;
    // const rectBottom = canChiY + canChiFont + paddingY;
    // const rectHeight = rectBottom - rectTop;
    // const rectX = x - rectWidth / 2;
    // const rectY = rectTop;

    const rectX = Math.floor(width * 0.05);
    const rectWidth = Math.floor(width * 0.9);
    const rectTop = y - fontSizeDate / 2 - paddingY;
    const rectBottom = canChiY + canChiFont + paddingY;
    const rectHeight = rectBottom - rectTop;
    const rectY = rectTop;

    const radius = 24;
    ctx.save();
    ctx.fillStyle = "rgba(0, 0, 0, 0.5)";
    ctx.beginPath();
    ctx.moveTo(rectX + radius, rectY);
    ctx.lineTo(rectX + rectWidth - radius, rectY);
    ctx.quadraticCurveTo(rectX + rectWidth, rectY, rectX + rectWidth, rectY + radius);
    ctx.lineTo(rectX + rectWidth, rectY + rectHeight - radius);
    ctx.quadraticCurveTo(rectX + rectWidth, rectY + rectHeight, rectX + rectWidth - radius, rectY + rectHeight);
    ctx.lineTo(rectX + radius, rectY + rectHeight);
    ctx.quadraticCurveTo(rectX, rectY + rectHeight, rectX, rectY + rectHeight - radius);
    ctx.lineTo(rectX, rectY + radius);
    ctx.quadraticCurveTo(rectX, rectY, rectX + radius, rectY);
    ctx.closePath();
    ctx.fill();
    ctx.restore();

    ctx.save();
    ctx.fillStyle = "#ffffff";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.font = `bold ${fontSizeDate}px Tahoma`;
    ctx.shadowColor = "rgba(0,0,0,0.6)";
    ctx.shadowBlur = 8;
    ctx.fillText(dateText, x, y);
    ctx.restore();

    try {
      ctx.save();
      ctx.textAlign = "center";
      ctx.textBaseline = "top";
      ctx.font = `bold ${fontSizeTime}px Tahoma`;

      const timeGradient = createHorizontalGradient(ctx, timeX - timeW / 2, timeX + timeW / 2);
      ctx.fillStyle = timeGradient;
      ctx.shadowColor = "rgba(0,0,0,0.6)";
      ctx.shadowBlur = 10;
      ctx.fillText(timeText, timeX, timeY);
      ctx.restore();
    } catch (err) {
      console.warn("Failed to draw time text:", err.message || err);
    }

    try {
      ctx.save();
      ctx.fillStyle = "#ffffff";
      ctx.textAlign = "center";
      ctx.textBaseline = "top";
      ctx.font = `bold ${dateFont}px Tahoma`;
      ctx.shadowColor = "rgba(0,0,0,0.6)";
      ctx.shadowBlur = 6;
      ctx.fillText(lunarDateStr, x, lunarDateY);
      ctx.restore();

      ctx.save();
      ctx.textAlign = "left";
      ctx.textBaseline = "top";
      ctx.font = `bold ${canChiFont}px Tahoma`;
      const canChiParts = [
        "Ngày ",
        vnStringDate.ngayCanChi,
        " Tháng ",
        vnStringDate.thangCanChi,
        " Năm ",
        vnStringDate.namCanChi,
      ];
      const partWidths = canChiParts.map((p) => ctx.measureText(p).width);
      const totalCanChiW = partWidths.reduce((a, b) => a + b, 0);
      let curX = x - totalCanChiW / 2;
      for (let i = 0; i < canChiParts.length; i++) {
        const text = canChiParts[i];
        const w = partWidths[i];
        if (i % 2 === 1) {
          const g = createHorizontalGradient(ctx, curX, curX + w);
          ctx.fillStyle = g;
        } else {
          ctx.fillStyle = "#ffffff";
        }
        ctx.fillText(text, curX, canChiY);
        curX += w;
      }
      ctx.restore();

      let afterHolidaysY;
      let cardY = canChiY + canChiFont + 72;
      afterHolidaysY = cardY;
      let isHaveHoliday = false;
      try {
        if (Array.isArray(holidayNow) && holidayNow.length > 0) {
          const maxCards = Math.min(5, holidayNow.length);
          const cardGap = 12;
          const cardPaddingY = 28;
          const cardPaddingX = 18;
          const rulePaddingX = 12;
          const maxRuleBoxW = Math.floor(width * 0.28);
          const nameFont = 42;
          const ruleFont = 36;
          let ruleW = 0;

          for (let i = 0; i < maxCards; i++) {
            const h = holidayNow[i];
            const ruleText = h.rule || "";
            ctx.font = `bold ${ruleFont}px DarleySans`;
            ruleW = Math.max(ruleW, ctx.measureText(ruleText).width);
          }

          for (let i = 0; i < maxCards; i++) {
            const h = holidayNow[i];
            const ruleText = h.rule || "";
            const nameText = h.name ? `${h.name}` : "";

            ctx.save();
            ctx.font = `bold ${nameFont}px DarleySans`;
            const nameW = ctx.measureText(nameText).width;
            // ctx.font = `bold ${ruleFont}px Tahoma`;
            // ruleW = Math.max(ruleW, ctx.measureText(ruleText).width);

            ctx.restore();

            // compute rule box width based on text + padding, cap it
            const computedRuleW = Math.ceil(ruleW) + rulePaddingX * 2;
            const ruleBoxWidth = Math.min(maxRuleBoxW, Math.max(60, computedRuleW));
            const cardX = Math.floor(width * 0.05);
            const cardWidth = Math.floor(width * 0.9);
            const cardHeight = Math.max(nameFont, ruleFont) + cardPaddingY * 2;

            ctx.save();
            ctx.fillStyle = "rgba(0,0,0,0.5)"; // subtle light on dark
            const cardRadius = 12;
            ctx.beginPath();
            ctx.moveTo(cardX + cardRadius, cardY);
            ctx.lineTo(cardX + cardWidth - cardRadius, cardY);
            ctx.quadraticCurveTo(cardX + cardWidth, cardY, cardX + cardWidth, cardY + cardRadius);
            ctx.lineTo(cardX + cardWidth, cardY + cardHeight - cardRadius);
            ctx.quadraticCurveTo(
              cardX + cardWidth,
              cardY + cardHeight,
              cardX + cardWidth - cardRadius,
              cardY + cardHeight
            );
            ctx.lineTo(cardX + cardRadius, cardY + cardHeight);
            ctx.quadraticCurveTo(cardX, cardY + cardHeight, cardX, cardY + cardHeight - cardRadius);
            ctx.lineTo(cardX, cardY + cardRadius);
            ctx.quadraticCurveTo(cardX, cardY, cardX + cardRadius, cardY);
            ctx.closePath();
            ctx.fill();
            ctx.restore();

            const ruleBoxX = cardX + cardPaddingX;
            const ruleBoxY = cardY + cardPaddingY - 6;
            const ruleBoxH = cardHeight - cardPaddingY * 2 + 12;
            ctx.save();
            // highlight upcoming events with green background for rule box
            ctx.fillStyle = h._isUpcoming ? "rgba(30,150,70,0.95)" : "rgba(255,255,255,0.12)";
            ctx.beginPath();
            const rbRadius = 8;
            ctx.moveTo(ruleBoxX + rbRadius, ruleBoxY);
            ctx.lineTo(ruleBoxX + ruleBoxWidth - rbRadius, ruleBoxY);
            ctx.quadraticCurveTo(ruleBoxX + ruleBoxWidth, ruleBoxY, ruleBoxX + ruleBoxWidth, ruleBoxY + rbRadius);
            ctx.lineTo(ruleBoxX + ruleBoxWidth, ruleBoxY + ruleBoxH - rbRadius);
            ctx.quadraticCurveTo(
              ruleBoxX + ruleBoxWidth,
              ruleBoxY + ruleBoxH,
              ruleBoxX + ruleBoxWidth - rbRadius,
              ruleBoxY + ruleBoxH
            );
            ctx.lineTo(ruleBoxX + rbRadius, ruleBoxY + ruleBoxH);
            ctx.quadraticCurveTo(ruleBoxX, ruleBoxY + ruleBoxH, ruleBoxX, ruleBoxY + ruleBoxH - rbRadius);
            ctx.lineTo(ruleBoxX, ruleBoxY + rbRadius);
            ctx.quadraticCurveTo(ruleBoxX, ruleBoxY, ruleBoxX + rbRadius, ruleBoxY);
            ctx.closePath();
            ctx.fill();
            ctx.restore();

            ctx.save();
            ctx.fillStyle = "#ffffff";
            ctx.textAlign = "center";
            ctx.textBaseline = "middle";
            ctx.font = `bold ${ruleFont}px Tahoma`;
            ctx.fillText(ruleText, ruleBoxX + ruleBoxWidth / 2, ruleBoxY + ruleBoxH / 2);
            ctx.restore();

            const nameX = ruleBoxX + ruleBoxWidth + 16;
            ctx.save();
            ctx.fillStyle = "#ffffff";
            ctx.textAlign = "left";
            ctx.textBaseline = "middle";
            ctx.font = `bold ${nameFont}px Tahoma`;
            ctx.fillText(nameText, nameX, cardY + cardHeight / 2);
            ctx.restore();

            cardY += cardHeight + cardGap;
            afterHolidaysY = cardY;
            isHaveHoliday = true;
          }
        }
      } catch (err) {
        console.warn("Failed to draw holiday cards:", err.message || err);
      }

      try {
        if (auspiciousHour && (Array.isArray(auspiciousHour) || typeof auspiciousHour === "string")) {
          const baseY = isHaveHoliday ? afterHolidaysY + 0 : afterHolidaysY - 20;
          const horaryCardX = Math.floor(width * 0.05);
          const horaryCardW = Math.floor(width * 0.9);
          const horaryTitleFont = 40;
          const horaryTextFont = 34;
          const horaryPaddingY = 18;
          const rowSpacing = 12;

          let items = [];
          if (Array.isArray(auspiciousHour)) {
            items = auspiciousHour.map((s) => (s || "").trim()).filter(Boolean);
          } else {
            const text = String(auspiciousHour || "").trim();
            const afterColon = text.includes(":") ? text.split(":").slice(1).join(":").trim() : text;
            items = afterColon
              .split(/\s*[;,-]\s*/)
              .map((s) => s.trim())
              .filter(Boolean);
          }

          // keep up to 6 items and layout in 2 rows x 3 columns
          const gridItems = items.slice(0, 6);
          const cols = 3;
          const rows = 2;

          const title = "Giờ Hoàng Đạo";
          ctx.restore();

          const contentH = rows * (horaryTextFont + rowSpacing);
          const horaryCardH = horaryPaddingY * 2 + horaryTitleFont + contentH + 8;
          const horaryCardY = baseY + 16;

          // draw card background
          ctx.save();
          ctx.fillStyle = "rgba(0,0,0,0.55)";
          const hrRadius2 = 12;
          ctx.beginPath();
          ctx.moveTo(horaryCardX + hrRadius2, horaryCardY);
          ctx.lineTo(horaryCardX + horaryCardW - hrRadius2, horaryCardY);
          ctx.quadraticCurveTo(
            horaryCardX + horaryCardW,
            horaryCardY,
            horaryCardX + horaryCardW,
            horaryCardY + hrRadius2
          );
          ctx.lineTo(horaryCardX + horaryCardW, horaryCardY + horaryCardH - hrRadius2);
          ctx.quadraticCurveTo(
            horaryCardX + horaryCardW,
            horaryCardY + horaryCardH,
            horaryCardX + horaryCardW - hrRadius2,
            horaryCardY + horaryCardH
          );
          ctx.lineTo(horaryCardX + hrRadius2, horaryCardY + horaryCardH);
          ctx.quadraticCurveTo(
            horaryCardX,
            horaryCardY + horaryCardH,
            horaryCardX,
            horaryCardY + horaryCardH - hrRadius2
          );
          ctx.lineTo(horaryCardX, horaryCardY + hrRadius2);
          ctx.quadraticCurveTo(horaryCardX, horaryCardY, horaryCardX + hrRadius2, horaryCardY);
          ctx.closePath();
          ctx.fill();
          ctx.restore();

          // draw title centered
          ctx.save();
          ctx.textAlign = "center";
          ctx.textBaseline = "top";
          ctx.font = `bold ${horaryTitleFont}px DarleySans`;
          const titleX = horaryCardX + horaryCardW / 2;
          const titleY = horaryCardY + horaryPaddingY - 4;
          const titleW = ctx.measureText(title).width;
          const g2 = createHorizontalGradient(ctx, titleX - titleW / 2, titleX + titleW / 2);
          ctx.fillStyle = g2;
          ctx.fillText(title, titleX, titleY);
          ctx.restore();

          // draw grid 2 rows x 3 cols
          ctx.save();
          ctx.font = `bold ${horaryTextFont}px DarleySans`;
          ctx.textBaseline = "top";
          ctx.fillStyle = "#ffffff";
          const innerPadX = 40;
          const availableW = horaryCardW - innerPadX * 2;
          const cellW = Math.floor(availableW / cols);
          const startY = titleY + horaryTitleFont + rowSpacing;

          for (let r = 0; r < rows; r++) {
            for (let c = 0; c < cols; c++) {
              const idx = r * cols + c;
              const text = gridItems[idx] || "";
              const cellCenterX = horaryCardX + innerPadX + c * cellW + Math.floor(cellW / 2);
              const cellY = startY + r * (horaryTextFont + rowSpacing);
              if (text) {
                ctx.textAlign = "center";
                ctx.fillText(text, cellCenterX, cellY);
              }
            }
          }
          ctx.restore();

          // update afterHolidaysY so next card (Giờ Hắc Đạo) is positioned below this card
          try {
            afterHolidaysY = horaryCardY + horaryCardH + 12;
          } catch (e) {}
        }
      } catch (err) {
        console.warn("Failed to draw horary card:", err.message || err);
      }
      try {
        // draw inauspicious hours (Giờ Hắc Đạo) similar layout (2 rows x 3 cols)
        if (inauspiciousHours && (Array.isArray(inauspiciousHours) || typeof inauspiciousHours === "string")) {
          const baseY2 = afterHolidaysY;
          const horaryCardX2 = Math.floor(width * 0.05);
          const horaryCardW2 = Math.floor(width * 0.9);
          const titleFont2 = 40;
          const textFont2 = 34;
          const padY2 = 18;
          const spacing2 = 12;

          let items2 = [];
          if (Array.isArray(inauspiciousHours)) {
            items2 = inauspiciousHours.map((s) => (s || "").trim()).filter(Boolean);
          } else {
            const txt = String(inauspiciousHours || "").trim();
            const afterColon2 = txt.includes(":") ? txt.split(":").slice(1).join(":").trim() : txt;
            items2 = afterColon2
              .split(/\s*[;,-]\s*/)
              .map((s) => s.trim())
              .filter(Boolean);
          }

          // keep up to 6 items and layout in 2 rows x 3 cols
          const gridItems2 = items2.slice(0, 6);
          const cols2 = 3;
          const rowsCount2 = 2;

          const cardH2 = padY2 * 2 + titleFont2 + rowsCount2 * (textFont2 + spacing2) + 8;
          const cardY2 = baseY2 + 16;

          // background
          ctx.save();
          ctx.fillStyle = "rgba(0,0,0,0.55)";
          const r2 = 12;
          ctx.beginPath();
          ctx.moveTo(horaryCardX2 + r2, cardY2);
          ctx.lineTo(horaryCardX2 + horaryCardW2 - r2, cardY2);
          ctx.quadraticCurveTo(horaryCardX2 + horaryCardW2, cardY2, horaryCardX2 + horaryCardW2, cardY2 + r2);
          ctx.lineTo(horaryCardX2 + horaryCardW2, cardY2 + cardH2 - r2);
          ctx.quadraticCurveTo(
            horaryCardX2 + horaryCardW2,
            cardY2 + cardH2,
            horaryCardX2 + horaryCardW2 - r2,
            cardY2 + cardH2
          );
          ctx.lineTo(horaryCardX2 + r2, cardY2 + cardH2);
          ctx.quadraticCurveTo(horaryCardX2, cardY2 + cardH2, horaryCardX2, cardY2 + cardH2 - r2);
          ctx.lineTo(horaryCardX2, cardY2 + r2);
          ctx.quadraticCurveTo(horaryCardX2, cardY2, horaryCardX2 + r2, cardY2);
          ctx.closePath();
          ctx.fill();
          ctx.restore();

          // title
          ctx.save();
          ctx.textAlign = "center";
          ctx.textBaseline = "top";
          ctx.font = `bold ${titleFont2}px Tahoma`;
          const title2 = "Giờ Hắc Đạo";
          const titleX2 = horaryCardX2 + horaryCardW2 / 2;
          // red-ish gradient for title
          const gradR = ctx.createLinearGradient(titleX2 - 120, 0, titleX2 + 120, 0);
          gradR.addColorStop(0, "#ff8a80");
          gradR.addColorStop(1, "#ff5252");
          ctx.fillStyle = gradR;
          ctx.fillText(title2, titleX2, cardY2 + padY2 - 4);
          ctx.restore();

          // draw grid 2 rows x 3 cols centered
          ctx.save();
          ctx.font = `bold ${textFont2}px Tahoma`;
          ctx.textBaseline = "top";
          ctx.fillStyle = "#ffffff";
          const padX2 = 40;
          const availableW2 = horaryCardW2 - padX2 * 2;
          const cellW2 = Math.floor(availableW2 / cols2);
          const startY2 = cardY2 + padY2 + titleFont2 + spacing2;
          for (let r = 0; r < rowsCount2; r++) {
            for (let c = 0; c < cols2; c++) {
              const idx = r * cols2 + c;
              const text = gridItems2[idx] || "";
              const cellCenterX = horaryCardX2 + padX2 + c * cellW2 + Math.floor(cellW2 / 2);
              const cellY = startY2 + r * (textFont2 + spacing2);
              if (text) {
                ctx.textAlign = "center";
                ctx.fillText(text, cellCenterX, cellY);
              }
            }
          }
          ctx.restore();
          // update afterHolidaysY so next card (Hướng xuất hành) is positioned below this card
          try {
            afterHolidaysY = cardY2 + cardH2 + 12;
          } catch (e) {}
        }
        // draw Hướng xuất hành centered below Giờ Hắc Đạo (use same width as horary cards)
        try {
          if (huongXuatHanh && Array.isArray(huongXuatHanh) && huongXuatHanh.length > 0) {
            const speech = String(huongXuatHanh.join(" ") || "").trim();
            if (speech) {
              const cardX = Math.floor(width * 0.05); // same as horaryCardX2
              const cardW = Math.floor(width * 0.9); // same as horaryCardW2
              const titleFont = 36;
              const textFont = 34;
              const padY = 18;
              // wrap speech into lines and allow up to 4 lines (usually 2-3)
              ctx.save();
              ctx.font = `bold ${textFont}px Tahoma`;
              const maxW = cardW - 40;
              const words = speech.split(/\s+/);
              const lines = [];
              let cur = "";
              for (const w of words) {
                const test = cur ? cur + " " + w : w;
                if (ctx.measureText(test).width <= maxW) cur = test;
                else {
                  if (cur) lines.push(cur);
                  cur = w;
                }
              }
              if (cur) lines.push(cur);
              ctx.restore();
              const maxLines = 4;
              const shownLines = lines.slice(0, maxLines);

              const cardH = padY * 2 + titleFont + shownLines.length * (textFont + 8) + 8;
              const cardY = (typeof afterHolidaysY === "number" ? afterHolidaysY : canChiY + canChiFont + 72) + 16;

              // background (same style)
              ctx.save();
              ctx.fillStyle = "rgba(30,30,30,0.6)";
              const r = 12;
              ctx.beginPath();
              ctx.moveTo(cardX + r, cardY);
              ctx.lineTo(cardX + cardW - r, cardY);
              ctx.quadraticCurveTo(cardX + cardW, cardY, cardX + cardW, cardY + r);
              ctx.lineTo(cardX + cardW, cardY + cardH - r);
              ctx.quadraticCurveTo(cardX + cardW, cardY + cardH, cardX + cardW - r, cardY + cardH);
              ctx.lineTo(cardX + r, cardY + cardH);
              ctx.quadraticCurveTo(cardX, cardY + cardH, cardX, cardY + cardH - r);
              ctx.lineTo(cardX, cardY + r);
              ctx.quadraticCurveTo(cardX, cardY, cardX + r, cardY);
              ctx.closePath();
              ctx.fill();
              ctx.restore();

              // title
              ctx.save();
              ctx.textAlign = "center";
              ctx.textBaseline = "top";
              ctx.font = `bold ${titleFont}px Tahoma`;
              ctx.fillStyle = "#ffd54f";
              ctx.fillText("Hướng xuất hành", cardX + cardW / 2, cardY + padY - 6);
              ctx.restore();

              // speech lines (centered)
              ctx.save();
              ctx.font = `bold ${textFont}px Tahoma`;
              ctx.fillStyle = "#ffffff";
              ctx.textAlign = "center";
              ctx.textBaseline = "top";
              let ty = cardY + padY + titleFont + 6;
              for (const ln of shownLines) {
                ctx.fillText(ln, cardX + cardW / 2, ty);
                ty += textFont + 8;
              }
              ctx.restore();

              // advance afterHolidaysY to avoid overlap with subsequent content
              try {
                afterHolidaysY = cardY + cardH + 12;
              } catch (e) {}
            }
          }
        } catch (err) {
          console.warn("Failed to draw Hướng xuất hành card:", err.message || err);
        }
      } catch (err) {
        console.warn("Failed to draw inauspicious horary card:", err.message || err);
      }
    } catch (err) {
      console.warn("Failed to draw lunar text:", err.message || err);
    }
  } catch (e) {
    console.warn("Failed to draw date text:", e.message || e);
  }

  const outPath = path.join(tempDir, `lunar-calendar-${Date.now()}.png`);
  const out = fs.createWriteStream(outPath);
  const stream = canvas.createPNGStream();
  stream.pipe(out);
  await new Promise((resolve, reject) => {
    out.on("finish", resolve);
    out.on("error", reject);
  });
  return outPath;
}

async function scrapeMonth(month, year) {
  const url = `https://licham.vn/lich-thang-${String(month).padStart(2, "0")}-${year}`;
  let browser = null;
  let page = null;
  
  try {
    browser = await puppeteer.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-blink-features=AutomationControlled', '--disable-dev-shm-usage', '--disable-accelerated-2d-canvas', '--no-first-run', '--no-zygote', '--disable-gpu']
    });
    
    page = await browser.newPage();
    await page.setViewport({ width: 1920, height: 1080 });
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
    await page.setExtraHTTPHeaders({
      'Accept-Language': 'vi-VN,vi;q=0.9,en-US;q=0.8,en;q=0.7',
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
      'Referer': 'https://licham.vn/'
    });
    
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });
    
    try {
      await page.waitForSelector('table', { timeout: 30000 });
    } catch (e) {
      await new Promise(resolve => setTimeout(resolve, 5000));
      const pageContent = await page.content();
      if (pageContent.includes('Just a moment') || pageContent.includes('cf-browser-verification')) {
        await new Promise(resolve => setTimeout(resolve, 10000));
        await page.waitForSelector('table', { timeout: 20000 });
      }
    }
    
    await new Promise(resolve => setTimeout(resolve, 2000));
    const data = await page.content();
    
    if (!data) throw new Error('Failed to fetch data');
    
    const $ = cheerio.load(data);
    const days = [];
    let table = $("table.table").first();
    if (!table.length) table = $("table").first();
    if (!table.length) {
      const tableContainer = $("div").has("table").first();
      if (tableContainer.length) table = tableContainer.find("table").first();
    }

    if (!table.length) {
      console.warn("Table not found for monthly calendar");
      return days;
    }

    const rows = table.find("tbody tr").length ? table.find("tbody tr") : table.find("tr");
    const canChiPattern = /(Giáp|Ất|Bính|Đinh|Mậu|Kỷ|Canh|Tân|Nhâm|Quý)\s+(Tý|Sửu|Dần|Mão|Thìn|Tỵ|Ngọ|Mùi|Thân|Dậu|Tuất|Hợi)/;

    rows.each((r, tr) => {
      $(tr).find("td").each((c, td) => {
        const $td = $(td);
        const href = $td.find("a").first().attr("href") || "";
        
        let dayText = $td.find(".text-1").first().text().trim() || $td.find(".box-items .text-1").text().trim();
        if (!dayText) {
          const numMatch = $td.text().trim().match(/^(\d{1,2})/);
          if (numMatch) dayText = numMatch[1];
        }
        const solar = dayText ? parseInt(dayText, 10) || null : null;
        
        let lunarNumberRaw = $td.find(".text-2").first().text().replace(/\s+/g, " ").trim() || $td.find("[class*='text']").eq(1).text().replace(/\s+/g, " ").trim();
        if (!lunarNumberRaw) {
          const lunarMatch = $td.text().match(/(\d{1,2}\/\d{1,2})/);
          if (lunarMatch) lunarNumberRaw = lunarMatch[1];
        }
        const lunarNumber = lunarNumberRaw ? lunarNumberRaw.replace(/[^0-9\/]/g, "") : "";
        
        let lunarText = $td.find(".text-3").first().text().replace(/\s+/g, " ").trim() || $td.find("[class*='text']").eq(2).text().replace(/\s+/g, " ").trim();
        if (!lunarText) {
          const raw = ($td.html() || "").replace(/\n|\r/g, " ");
          const m = raw.match(/Ngày\s+[\w\s\/]+/i);
          if (m) lunarText = m[0].trim();
        }
        if (!lunarText) {
          const allText = $td.text();
          if (canChiPattern.test(allText)) lunarText = allText.replace(/\s+/g, " ").trim();
        }
        
        const match = href.match(/lich-ngay-(\d{1,2})-(\d{1,2})-(\d{4})/);
        let linkDate = null;
        if (match) {
          linkDate = { day: parseInt(match[1], 10), month: parseInt(match[2], 10), year: parseInt(match[3], 10) };
        } else if (solar) {
          linkDate = { day: solar, month: month, year: year };
        }
        const rawHtml = $td.html() || "";
        const isHighlight = /text-hight|highlight|hight/i.test(rawHtml) || $td.hasClass("highlight");
        const isHiddenAttr = ($td.hasClass && $td.hasClass("next-day")) || $td.hasClass("hidden") || $td.css("display") === "none";
        
        days.push({ solar, lunarNumber, lunarText, isHighlight, isHidden: isHiddenAttr, href, linkDate, rawHtml });
      });
    });

    return days;
  } catch (error) {
    throw new Error(`Failed to fetch lunar calendar with Puppeteer: ${error.message}`);
  } finally {
    if (page) try { await page.close(); } catch (e) {}
    if (browser) try { await browser.close(); } catch (e) {}
  }
}

export async function renderMonthlyCalendarImage(month, year, opts = {}) {
  const width = opts.width || 1920;
  const height = opts.height || 1400;
  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext("2d");

  const bgDir = path.join(BACKGROUND_RESOURCE_PATH_TEMP, "1920x1080");
  let bgImage = null;
  try {
    if (fs.existsSync(bgDir)) {
      const files = fs.readdirSync(bgDir).filter((f) => /\.(jpe?g|png|webp)$/i.test(f));
      if (files.length > 0) {
        const sel = files[Math.floor(Math.random() * files.length)];
        const buf = fs.readFileSync(path.join(bgDir, sel));
        bgImage = await loadImage(buf);
      }
    }
  } catch (e) {
    bgImage = null;
  }

  if (bgImage) {
    const arCanvas = width / height;
    const arImg = bgImage.width / bgImage.height;
    let dw = width,
      dh = height,
      dx = 0,
      dy = 0;
    if (arImg > arCanvas) {
      dh = height;
      dw = Math.round(height * arImg);
      dx = Math.round((width - dw) / 2);
    } else {
      dw = width;
      dh = Math.round(width / arImg);
      dy = Math.round((height - dh) / 2);
    }
    ctx.drawImage(bgImage, dx, dy, dw, dh);
    ctx.fillStyle = "rgba(0,0,0,0.25)";
    ctx.fillRect(0, 0, width, height);
  } else {
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, width, height);
  }

  const days = await scrapeMonth(month, year);

  ctx.fillStyle = "#4caf50";
  ctx.fillRect(0, 0, width, 140);
  ctx.fillStyle = "#ffffff";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.font = "bold 44px Tahoma";
  ctx.fillText(`THÁNG ${String(month).padStart(2, "0")} - ${year}`, width / 2, 70);

  const cols = 7;
  const cellW = Math.floor(width / cols);
  const rowsNeeded = Math.ceil(days.length / cols) || 6;
  const headerH = 140 + 56;
  const availableH = height - headerH - 200;
  const extraCell = typeof opts.extraCellHeight === "number" ? opts.extraCellHeight : 40;
  const cellH = Math.floor(availableH / rowsNeeded) + extraCell;
  ctx.font = "bold 28px Tahoma";
  const headers = ["Thứ hai", "Thứ ba", "Thứ tư", "Thứ năm", "Thứ sáu", "Thứ bảy", "Chủ nhật"];
  for (let i = 0; i < cols; i++) {
    ctx.fillStyle = "#e8f5e9";
    ctx.fillRect(i * cellW, 140, cellW - 2, 56);
    ctx.fillStyle = "#444";
    ctx.textAlign = "center";
    ctx.fillText(headers[i], i * cellW + cellW / 2, 140 + 28);
  }

  let row = 0;
  let col = 0;

  function wrapTextToLines(ctx, text, maxWidth) {
    if (!text) return [];
    const words = String(text).split(/\s+/);
    const lines = [];
    let cur = "";
    for (let i = 0; i < words.length; i++) {
      const w = words[i];
      const test = cur ? cur + " " + w : w;
      const wWidth = ctx.measureText(test).width;
      if (wWidth <= maxWidth) {
        cur = test;
      } else {
        if (cur) lines.push(cur);
        if (ctx.measureText(w).width > maxWidth) {
          let part = "";
          for (let ch of w) {
            const testPart = part + ch;
            if (ctx.measureText(testPart).width <= maxWidth) part = testPart;
            else {
              if (part) lines.push(part);
              part = ch;
            }
          }
          if (part) cur = part;
          else cur = "";
        } else {
          cur = w;
        }
      }
    }
    if (cur) lines.push(cur);
    return lines;
  }
  const gapX = typeof opts.cellGapX === "number" ? opts.cellGapX : 2;
  const gapY = typeof opts.cellGapY === "number" ? opts.cellGapY : 0;
  const now = new Date();
  const dayNow = now.getDate();
  const monthNow = now.getMonth() + 1;
  const yearNow = now.getFullYear();
  for (let i = 0; i < days.length; i++) {
    const d = days[i];
    const x = col * cellW + gapX + 8;
    const y = headerH + row * cellH + gapY + 8;

    const cellX = col * cellW + gapX;
    const cellY = headerH + row * cellH + gapY;
    const cellInnerW = cellW - gapX * 2;
    const cellInnerH = cellH - gapY * 2 - 4;
    const isToday = d.linkDate && yearNow === d.linkDate.year && monthNow === d.linkDate.month && dayNow === d.linkDate.day;
    ctx.fillStyle = isToday ? "#ffeaca" : "rgba(255,255,255,0.75)";
    ctx.fillRect(cellX, cellY, cellInnerW, cellInnerH);
    ctx.strokeStyle = "#bdbdbd";
    ctx.lineWidth = 3;
    ctx.strokeRect(cellX + 1, cellY + 1, Math.max(0, cellInnerW - 2), Math.max(0, cellInnerH - 2));

    const isHigh = !!d.isHighlight;
    const isHidden = !!d.isHidden;
    ctx.textAlign = "left";
    ctx.font = "bold 40px Tahoma";
    const primaryColor = isHidden ? (isHigh ? "#5d342b" : "#9e9e9e") : isHigh ? "#c62828" : "#000";
    ctx.fillStyle = primaryColor;
    ctx.fillText(d.solar ? String(d.solar).padStart(2, "0") : "", x, y + 32);

    ctx.font = "bold 28px Tahoma";
    ctx.textAlign = "right";
    const lunarDrawX = cellX + cellInnerW - 12;
    ctx.fillStyle = isHidden ? (isHigh ? "#5d342b" : "#9e9e9e") : isHigh ? "#c62828" : "#333";
    if (d.lunarNumber) ctx.fillText(d.lunarNumber, lunarDrawX, y + 64);
    ctx.textAlign = "left";

    ctx.font = "bold 20px Tahoma";
    ctx.fillStyle = isHidden ? (isHigh ? "#5d342b" : "#9e9e9e") : isHigh ? "#c62828" : "#333";
    const lunar = d.lunarText || "";
    const maxTextW = cellInnerW - 24;
    const wrapped = wrapTextToLines(ctx, lunar, maxTextW);
    const textStartY = y + 106;
    const lineH = 22;
    const availableLines = Math.floor((cellInnerH - (textStartY - cellY) - 12) / lineH);
    for (let li = 0; li < Math.min(wrapped.length, Math.max(0, availableLines)); li++) {
      ctx.fillText(wrapped[li].trim(), x, textStartY + li * lineH);
    }

    col++;
    if (col >= cols) {
      col = 0;
      row++;
    }
  }

  const outPath = path.join(tempDir, `monthly_${year}_${String(month).padStart(2, "0")}_${Date.now()}.png`);
  const out = fs.createWriteStream(outPath);
  const stream = canvas.createPNGStream();
  stream.pipe(out);
  await new Promise((resolve, reject) => {
    out.on("finish", resolve);
    out.on("error", reject);
  });
  return outPath;
}

export async function handleSendLunarCalendar(api, message, aliasCommand) {
  let imagePath;
  try {
    const content = removeMention(message);
    const prefix = getGlobalPrefix(api.getBotId());
    const keyword = content.replace(`${prefix}${aliasCommand}`, "").trim();
    const args = keyword.split(/\s+/).filter(Boolean);
    const listMonthCommand = ["thang", "month", "tháng"];
    if (args[0] && listMonthCommand.includes(args[0].toLowerCase())) {
      const now = new Date();
      let m = now.getMonth() + 1;
      let y = now.getFullYear();
      
      if (args[1]) {
        const parsedM = parseInt(args[1], 10);
        if (!isNaN(parsedM) && parsedM >= 1 && parsedM <= 12) m = parsedM;
      }
      
      const yearKeywords = ["năm", "nam", "year"];
      let yearIndex = args.findIndex(arg => yearKeywords.includes(arg.toLowerCase()));
      if (yearIndex >= 0 && args[yearIndex + 1]) {
        const parsedY = parseInt(args[yearIndex + 1], 10);
        if (!isNaN(parsedY) && parsedY > 1954 && parsedY < 2055) y = parsedY;
      } else if (args[2]) {
        const parsedY = parseInt(args[2], 10);
        if (!isNaN(parsedY) && parsedY > 1954 && parsedY < 2055) y = parsedY;
      }

      imagePath = await renderMonthlyCalendarImage(m, y);
    } else {
      imagePath = await generateLunarCalendarImage();
    }

    const dataUpload = await api.uploadAttachment([imagePath], message.threadId, message.type, { isUseProphylactic: true });
    const imageUrl = dataUpload[0].fileUrl || dataUpload[0].normalUrl;
    const now = new Date();
    const tomorrow = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 0, 0, 0, 0);
    const ttl = tomorrow.getTime() - now.getTime();
    await sendMessageFromSQL(api, message, {
      success: true,
      message: ``
    }, false, ttl);
    await api.sendImage(imageUrl, message, "", ttl);
  } catch (error) {
    console.error("Failed to send lunar calendar image:", error);
    await sendMessageFailed(
      api,
      message,
      "Có lỗi xảy ra khi xử lý lệnh hiển thị lịch âm dương, vui lòng thử lại sau",
      true,
      180000
    );
  } finally {
    deleteFile(imagePath);
  }
}
