// Chuyển dương lịch sang âm lịch Việt Nam theo điểm Sóc và Trung khí tại UTC+7.
// Công thức thiên văn Jean Meeus, cách đánh số tháng theo lịch Việt Nam.
const PI = Math.PI;
const int = Math.floor;

function jdFromDate(day, month, year) {
  const a = int((14 - month) / 12);
  const y = year + 4800 - a;
  const m = month + 12 * a - 3;
  let jd = day + int((153 * m + 2) / 5) + 365 * y + int(y / 4) - int(y / 100) + int(y / 400) - 32045;
  if (jd < 2299161) jd = day + int((153 * m + 2) / 5) + 365 * y + int(y / 4) - 32083;
  return jd;
}

function newMoon(k) {
  const t = k / 1236.85;
  const t2 = t * t;
  const t3 = t2 * t;
  const dr = PI / 180;
  let jd = 2415020.75933 + 29.53058868 * k + 0.0001178 * t2 - 0.000000155 * t3;
  jd += 0.00033 * Math.sin((166.56 + 132.87 * t - 0.009173 * t2) * dr);
  const m = 359.2242 + 29.10535608 * k - 0.0000333 * t2 - 0.00000347 * t3;
  const mp = 306.0253 + 385.81691806 * k + 0.0107306 * t2 + 0.00001236 * t3;
  const f = 21.2964 + 390.67050646 * k - 0.0016528 * t2 - 0.00000239 * t3;
  let correction = (0.1734 - 0.000393 * t) * Math.sin(m * dr) + 0.0021 * Math.sin(2 * m * dr);
  correction -= 0.4068 * Math.sin(mp * dr) - 0.0161 * Math.sin(2 * mp * dr);
  correction -= 0.0004 * Math.sin(3 * mp * dr);
  correction += 0.0104 * Math.sin(2 * f * dr) - 0.0051 * Math.sin((m + mp) * dr);
  correction -= 0.0074 * Math.sin((m - mp) * dr) - 0.0004 * Math.sin((2 * f + m) * dr);
  correction -= 0.0004 * Math.sin((2 * f - m) * dr) + 0.0006 * Math.sin((2 * f + mp) * dr);
  correction += 0.001 * Math.sin((2 * f - mp) * dr) + 0.0005 * Math.sin((2 * mp + m) * dr);
  const delta = t < -11
    ? 0.001 + 0.000839 * t + 0.0002261 * t2 - 0.00000845 * t3 - 0.000000081 * t * t3
    : -0.000278 + 0.000265 * t + 0.000262 * t2;
  return jd + correction - delta;
}

function sunLongitude(jdn) {
  const t = (jdn - 2451545) / 36525;
  const t2 = t * t;
  const dr = PI / 180;
  const m = 357.5291 + 35999.0503 * t - 0.0001559 * t2 - 0.00000048 * t * t2;
  const l0 = 280.46645 + 36000.76983 * t + 0.0003032 * t2;
  const dl = (1.9146 - 0.004817 * t - 0.000014 * t2) * Math.sin(dr * m)
    + (0.019993 - 0.000101 * t) * Math.sin(2 * dr * m)
    + 0.00029 * Math.sin(3 * dr * m);
  const longitude = (l0 + dl) * dr;
  return longitude - PI * 2 * int(longitude / (PI * 2));
}

const newMoonDay = (k, timezone) => int(newMoon(k) + 0.5 + timezone / 24);
const sunSector = (dayNumber, timezone) => int(sunLongitude(dayNumber - 0.5 - timezone / 24) / PI * 6);

function lunarMonth11(year, timezone) {
  const off = jdFromDate(31, 12, year) - 2415021;
  const k = int(off / 29.530588853);
  let nm = newMoonDay(k, timezone);
  if (sunSector(nm, timezone) >= 9) nm = newMoonDay(k - 1, timezone);
  return nm;
}

function leapMonthOffset(a11, timezone) {
  const k = int((a11 - 2415021.076998695) / 29.530588853 + 0.5);
  let last;
  let i = 1;
  let arc = sunSector(newMoonDay(k + i, timezone), timezone);
  do {
    last = arc;
    i += 1;
    arc = sunSector(newMoonDay(k + i, timezone), timezone);
  } while (arc !== last && i < 14);
  return i - 1;
}

export function solarToVietnameseLunar(day, month, year, timezone = 7) {
  const dayNumber = jdFromDate(day, month, year);
  const k = int((dayNumber - 2415021.076998695) / 29.530588853);
  let monthStart = newMoonDay(k + 1, timezone);
  if (monthStart > dayNumber) monthStart = newMoonDay(k, timezone);
  let a11 = lunarMonth11(year, timezone);
  let b11 = a11;
  let lunarYear;
  if (a11 >= monthStart) {
    lunarYear = year;
    a11 = lunarMonth11(year - 1, timezone);
  } else {
    lunarYear = year + 1;
    b11 = lunarMonth11(year + 1, timezone);
  }
  const lunarDay = dayNumber - monthStart + 1;
  const diff = int((monthStart - a11) / 29);
  let lunarLeap = 0;
  let lunarMonth = diff + 11;
  if (b11 - a11 > 365) {
    const leapDiff = leapMonthOffset(a11, timezone);
    if (diff >= leapDiff) {
      lunarMonth = diff + 10;
      if (diff === leapDiff) lunarLeap = 1;
    }
  }
  if (lunarMonth > 12) lunarMonth -= 12;
  if (lunarMonth >= 11 && diff < 4) lunarYear -= 1;
  return { lunarDay, lunarMonth, lunarYear, isLeapMonth: lunarLeap === 1 };
}
