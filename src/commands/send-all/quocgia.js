import axios from "axios";
import { removeMention } from "../../utils/format-util.js";
import { sendMessageComplete, sendMessageFailed, sendMessageStateQuote } from "../../service-ngh/chat-zalo/chat-style/chat-style.js";
import { getGlobalPrefix } from "../../service-ngh/service.js";

const TIME_TO_LIVE = 3600000;

export async function handleCheckquocgia(api, message, aliasCommand) {
  const botId = api.getBotId();
  const prefix = getGlobalPrefix(botId);
  const content = removeMention(message).replace(prefix, "").replace(aliasCommand, "").trim();

  if (!content) {
    const caption =
      `Hướng dẫn dùng lệnh:\n` +
      `${prefix + aliasCommand} [tên quốc gia]\n` +
      `Ví dụ: ${prefix + aliasCommand} viet nam`;
    await sendMessageStateQuote(api, message, caption, false, 120000);
    return;
  }

  const countryName = encodeURIComponent(content);
  const fields = [
    "name",
    "capital",
    "region",
    "subregion",
    "population",
    "languages",
    "timezones",
    "continents",
    "maps",
    "flags",
    "flag",
    "currencies",
    "borders",
    "demonyms"
  ].join(",");
  const url = `https://restcountries.com/v3.1/name/${countryName}?fields=${fields}`;

  try {
    const res = await axios.get(url, { timeout: 15000 });
    const list = Array.isArray(res.data) ? res.data : [];
    if (list.length === 0) {
      await sendMessageComplete(api, message, `Không tìm thấy thông tin cho quốc gia "${content}".`, false, TIME_TO_LIVE);
      return;
    }

    const info = list[0];

    const name = info?.name?.common || content;
    const officialName = info?.name?.official || "N/A";
    const nativeCommon = info?.name?.nativeName?.vie?.common || "N/A";
    const nativeOfficial = info?.name?.nativeName?.vie?.official || "N/A";
    const capitals = Array.isArray(info?.capital) ? info.capital.join(", ") : "N/A";
    const region = info?.region || "N/A";
    const subregion = info?.subregion || "N/A";
    const population = typeof info?.population === "number" ? info.population.toLocaleString("vi-VN") : "N/A";
    const languages = info?.languages ? Object.values(info.languages).join(", ") : "N/A";
    const timezones = Array.isArray(info?.timezones) ? info.timezones.join(", ") : "N/A";
    const continents = Array.isArray(info?.continents) ? info.continents.join(", ") : "N/A";
    const googleMaps = info?.maps?.googleMaps || "N/A";
    const openStreetMaps = info?.maps?.openStreetMaps || "N/A";
    const flagsPNG = info?.flags?.png || null;
    const flagsSVG = info?.flags?.svg || null;
    const flagAlt = info?.flags?.alt || "N/A";
    const emojiFlag = info?.flag || "";

    const currencies = info?.currencies
      ? Object.entries(info.currencies)
          .map(([code, { name, symbol }]) => `${name} (${code}, ${symbol || "N/A"})`)
          .join(", ")
      : "N/A";

    const borders = Array.isArray(info?.borders) ? info.borders.join(", ") : "N/A";

    const lines = [
      `${emojiFlag} Quốc gia: ${name} (${officialName})`,
      `🏠 Tên bản địa: ${nativeCommon} (${nativeOfficial})`,
      `🏛️ Thủ đô: ${capitals}`,
      `🌐 Khu vực: ${region} - ${subregion}`,
      `👤 Dân số: ${population}`,
      `🗣️ Ngôn ngữ: ${languages}`,
      `💰 Tiền tệ: ${currencies}`,
      `⏰ Múi giờ: ${timezones}`,
      `🌍 Lục địa: ${continents}`,
      `🗺️ Google Maps: ${googleMaps}`,
      `🗾 OpenStreetMap: ${openStreetMaps}`,
      `🔗 Nước láng giềng: ${borders}`,
      `🏴 Mô tả cờ: ${emojiFlag} ${flagAlt}`
    ];

    await sendMessageComplete(api, message, lines.join("\n"), true, TIME_TO_LIVE);
  } catch (err) {
    await sendMessageFailed(api, message, "Đã xảy ra lỗi khi tìm thông tin quốc gia: " + err.message, true, TIME_TO_LIVE);
  }
}
