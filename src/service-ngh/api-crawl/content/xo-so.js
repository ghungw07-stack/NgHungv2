import axios from "axios";
import * as cheerio from "cheerio";
import { removeMention } from "../../../utils/format-util.js";
import { sendMessageComplete, sendMessageFailed, sendMessageWarning } from "../../chat-zalo/chat-style/chat-style.js";
import { getGlobalPrefix } from "../../service.js";
import { remove_tone_marks, removeVietnameseTones } from "../../../utils/format-text.js";

const linkXoSo = [
  "https://xosominhngoc.net.vn/xsmn",
  "https://xosominhngoc.net.vn/xsmt",
  "https://xosominhngoc.net.vn/xsmb",
  "https://xosominhngoc.net.vn/xsvietlott",
  "https://xosominhngoc.net.vn/xsmega",
  "https://xosominhngoc.net.vn/xspower",
  "https://xosominhngoc.net.vn/xsmax3d",
  "https://xosominhngoc.net.vn/xskeno",
  "https://xosominhngoc.net.vn/xsmax3dpro",
  "https://xosominhngoc.net.vn/xsbingo18",
  "https://xosominhngoc.net.vn/kqxs-tp-hcm",
  "https://xosominhngoc.net.vn/kqxs-dong-thap",
  "https://xosominhngoc.net.vn/kqxs-ca-mau",
  "https://xosominhngoc.net.vn/kqxs-ben-tre",
  "https://xosominhngoc.net.vn/kqxs-vung-tau",
  "https://xosominhngoc.net.vn/kqxs-bac-lieu",
  "https://xosominhngoc.net.vn/kqxs-dong-nai",
  "https://xosominhngoc.net.vn/kqxs-can-tho",
  "https://xosominhngoc.net.vn/kqxs-soc-trang",
  "https://xosominhngoc.net.vn/kqxs-tay-ninh",
  "https://xosominhngoc.net.vn/kqxs-an-giang",
  "https://xosominhngoc.net.vn/kqxs-binh-thuan",
  "https://xosominhngoc.net.vn/kqxs-vinh-long",
  "https://xosominhngoc.net.vn/kqxs-binh-duong",
  "https://xosominhngoc.net.vn/kqxs-tra-vinh",
  "https://xosominhngoc.net.vn/kqxs-long-an",
  "https://xosominhngoc.net.vn/kqxs-hau-giang",
  "https://xosominhngoc.net.vn/kqxs-binh-phuoc",
  "https://xosominhngoc.net.vn/kqxs-tien-giang",
  "https://xosominhngoc.net.vn/kqxs-kien-giang",
  "https://xosominhngoc.net.vn/kqxs-da-lat",
  "https://xosominhngoc.net.vn/kqxs-ha-noi",
  "https://xosominhngoc.net.vn/kqxs-quang-ninh",
  "https://xosominhngoc.net.vn/kqxs-bac-ninh",
  "https://xosominhngoc.net.vn/kqxs-hai-phong",
  "https://xosominhngoc.net.vn/kqxs-nam-dinh",
  "https://xosominhngoc.net.vn/kqxs-thai-binh",
  "https://xosominhngoc.net.vn/kqxs-thua-thien-hue",
  "https://xosominhngoc.net.vn/kqxs-phu-yen",
  "https://xosominhngoc.net.vn/kqxs-quang-nam",
  "https://xosominhngoc.net.vn/kqxs-dak-lak",
  "https://xosominhngoc.net.vn/kqxs-da-nang",
  "https://xosominhngoc.net.vn/kqxs-khanh-hoa",
  "https://xosominhngoc.net.vn/kqxs-binh-dinh",
  "https://xosominhngoc.net.vn/kqxs-quang-tri",
  "https://xosominhngoc.net.vn/kqxs-quang-binh",
  "https://xosominhngoc.net.vn/kqxs-gia-lai",
  "https://xosominhngoc.net.vn/kqxs-ninh-thuan",
  "https://xosominhngoc.net.vn/kqxs-quang-ngai",
  "https://xosominhngoc.net.vn/kqxs-dak-nong",
  "https://xosominhngoc.net.vn/kqxs-kon-tum",
];

const nameXoSo = [
  "Mega",
  "Power",
  // "Max3D",
  // "Keno",
  // "Max3dpro",
  // "Bingo18",
  "MN",
  "MT",
  "MB",
  "TP HCM",
  "Đồng Tháp",
  "Cà Mau",
  "Bến Tre",
  "Vũng Tàu",
  "Bạc Liêu",
  "Đồng Nai",
  "Cần Thơ",
  "Sóc Trăng",
  "Tây Ninh",
  "An Giang",
  "Bình Thuận",
  "Vĩnh Long",
  "Bình Dương",
  "Trà Vinh",
  "Long An",
  "Hậu Giang",
  "Bình Phước",
  "Tiền Giang",
  "Kiên Giang",
  "Đà Lạt",
  "Hà Nội",
  "Quảng Ninh",
  "Bắc Ninh",
  "Hải Phòng",
  "Nam Định",
  "Thái Bình",
  "Thừa Thiên Huế",
  "Phú Yên",
  "Quảng Nam",
  "Đắk Lắk",
  "Đà Nẵng",
  "Khánh Hòa",
  "Bình Định",
  "Quảng Trị",
  "Quảng Bình",
  "Gia Lai",
  "Ninh Thuận",
  "Quảng Ngãi",
  "Đắk Nông",
  "Kon Tum",
];

// const specialXoSo = ["Vietlott", "Mega", "Power", "Max3D", "Keno", "Max3dpro", "Bingo18"];

const TIME_SHOW_MESSAGE = 1800000;

export async function handleXoSoCommand(api, message, aliasCommand) {
  const botId = api.getBotId();
  const prefix = getGlobalPrefix(botId);
  const keyword = removeMention(message).replace(aliasCommand, "").replace(prefix, "").trim();

  if (!keyword) {
    const tempCapt =
      "Vui lòng nhập tên của kênh xổ số mà bạn muốn xem\n" +
      `Đây là các đài xổ số hiện có mà tôi biết: ${nameXoSo.join(", ")}`;
    await sendMessageWarning(api, message, tempCapt, false, TIME_SHOW_MESSAGE);
    return;
  }

  const normalizedKeyword = removeVietnameseTones(keyword)
    .replace(/[\s_]+/g, "-")
    .toLowerCase();
  const matchedLink = linkXoSo.find((link) => link.includes(normalizedKeyword));

  if (matchedLink) {
    try {
      const response = await axios.get(matchedLink, { timeout: 10000 });
      const $ = cheerio.load(response.data);
      let result = "";
      if (matchedLink.includes("xsmega")) {
        const megaBox = $("article.xsmega");
        if (megaBox.length) {
          const title = megaBox.find(".title a").eq(1).text().trim();
          const kyVe = megaBox.find(".kyve a").text().trim();
          const ngay = megaBox.find(".ngay a").text().trim();
          result += `🎲 ${title}\n📅 Ngày: ${ngay}\n🎫 Kỳ vé: ${kyVe}\n`;

          const numbers = [];
          megaBox.find(".result span.kq").each((_, span) => {
            numbers.push($(span).text().trim());
          });
          if (numbers.length) {
            result += `\n➤➤ Dãy số trúng: ${numbers.join("🔹")}\n\n`;
          }

          // const jackpot = megaBox.find(".jackpot").first().text().trim();
          // if (jackpot) {
          //   result += `💰 Jackpot: ${jackpot}\n`;
          // }

          const rows = megaBox.find("table.tblsltmega tbody tr");
          rows.each((_, row) => {
            const cols = $(row).find("td");
            if (cols.length === 4) {
              const giai = $(cols[0]).text().trim();
              const trung = $(cols[1]).text().trim();
              const sl = $(cols[2]).text().trim();
              const giatri = $(cols[3]).text().trim();
              result += `💰 ${giai} (${trung}): ${sl} giải, Giá trị: ${giatri}\n`;
            }
          });
          result += "\n";
        } else {
          result = "Không tìm thấy dữ liệu Mega.";
        }
      } else if (matchedLink.includes("xspower")) {
        const powerBox = $(".xspower");
        if (powerBox.length) {
          // Lấy tiêu đề đúng: <a> thứ 1 trong .title
          const title = powerBox.find(".title a").eq(1).text().trim();
          const kyVe = powerBox.find(".kyve a").text().trim();
          const ngay = powerBox.find(".ngay a").text().trim();
          result += `🎲 ${title}\n📅 Ngày: ${ngay}\n🎫 Kỳ vé: ${kyVe}\n`;

          // Lấy dãy số trúng
          const numbers = [];
          powerBox.find(".result span.kq").each((_, span) => {
            numbers.push($(span).text().trim());
          });

          if (numbers.length) {
            let numbersStr = "";
            if (numbers.length === 7) {
              numbersStr = numbers.slice(0, 6).join("🔹") + "🔸" + numbers[6];
            } else {
              numbersStr = numbers.join("🔹");
            }
            result += `\n➤➤ Dãy số trúng: ${numbersStr}\n\n`;
          }

          // // Lấy giá trị Jackpot 1 & 2
          // const jackpot1 = powerBox.find(".boxjackpot .jackpot").first().text().trim();
          // if (jackpot1) {
          //   result += `💰 Jackpot 1: ${jackpot1}\n`;
          // }
          // const jackpot2 = powerBox.find(".boxjackpot .jackpot2").first().text().trim();
          // if (jackpot2) {
          //   result += `💰 Jackpot 2: ${jackpot2}\n`;
          // }

          // Lấy bảng số lượng trúng giải
          const rows = powerBox.find("table.table.table-striped tbody tr");
          rows.each((_, row) => {
            const cols = $(row).find("td");
            if (cols.length === 4) {
              const giai = $(cols[0]).text().trim();
              const trung = $(cols[1]).text().trim();
              const sl = $(cols[2]).text().trim();
              const giatri = $(cols[3]).text().trim();
              result += `💰 ${giai} (${trung}): ${sl} giải, Giá trị: ${giatri}\n`;
            }
          });
          result += "\n";
        } else {
          result = "Không tìm thấy dữ liệu Power.";
        }
      } else {
        const boxes = $(".box_kqxs");
        if (!boxes.length) {
          await sendMessageFailed(api, message, "Không tìm thấy kết quả xổ số cho tỉnh này.", false, TIME_SHOW_MESSAGE);
          return;
        }
        boxes.each((_, box) => {
          const $box = $(box);
          const title = $box.find(".kqxstitle>a").text().replace(/\s+/g, " ").trim();
          const date = $box.find(".xsdate .daymonth").text().replace(/\s+/g, " ").trim();
          const year = $box.find(".xsdate .year").text().replace(/\s+/g, " ").trim();
          const loaiVe = $box.find(".kyve").text().replace(/\s+/g, " ").trim();
          result += `🎲 ${title}\n📅 Ngày: ${date}/${year}\n🎫 ${loaiVe}\n`;

          const rows = $box.find("table.kqxs_content tbody tr");
          rows.each((_, row) => {
            const prizeName = $(row).find("th[scope='row']").text().replace(/\s+/g, " ").trim();
            const numbers = [];
            $(row)
              .find("td span.kq")
              .each((_, span) => {
                numbers.push($(span).text().trim());
              });
            if (prizeName && numbers.length) {
              result += `• ${prizeName}: ${numbers.join(" - ")}\n`;
            }
          });
          result += "\n";
        });
      }
      await sendMessageComplete(api, message, result, false, TIME_SHOW_MESSAGE);
    } catch (err) {
      const tempCapt = "Có lỗi khi lấy dữ liệu xổ số. Vui lòng thử lại sau.";
      await sendMessageFailed(api, message, tempCapt, false, TIME_SHOW_MESSAGE);
    }
  } else {
    const tempCapt = "Từ khóa bạn yêu cầu không khớp với đài xổ số nào mà tôi biết.";
    await sendMessageFailed(api, message, tempCapt, false, TIME_SHOW_MESSAGE);
  }
}
