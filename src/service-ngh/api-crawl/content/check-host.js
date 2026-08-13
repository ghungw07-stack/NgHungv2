import * as cheerio from "cheerio";
import { deepParseJSON, removeMention } from "../../../utils/format-util.js";
import { sendMessageComplete, sendMessageFailed, sendMessageWarning } from "../../chat-zalo/chat-style/chat-style.js";
import { getGlobalPrefix } from "../../service.js";
import { getClientAxios } from "../../utilities/browser-launch.js";

const TIME_TO_LIVE = 86400000;

const LINK_CHECK_DOMAIN = "https://whois.inet.vn/api/whois/domainspecify";
export async function handleCheckDomainNameCommand(api, message, aliasCommand) {
  const botId = api.getBotId();
  const prefix = getGlobalPrefix(botId);
  const content = removeMention(message).replace(prefix, "").replace(aliasCommand, "").trim();

  if (!content) {
    const caption =
      `Hướng dẫn dùng lệnh:\n` +
      `${prefix + aliasCommand} [tên miền]\n` +
      `Lưu ý: Tính năng chỉ khả dụng khi bot không chặn gửi link...!`;
    await sendMessageWarning(api, message, caption, false, TIME_TO_LIVE);
    return;
  }

  const { hostname, pathname } = new URL(content.startsWith("http") ? content : "https://" + content);
  const client = getClientAxios();

  try {
    const response = await client.get(`${LINK_CHECK_DOMAIN}/${hostname}`);
    if (response.status === 200) {
      const jsonParse = deepParseJSON(response.data);
      if (jsonParse.code === 1) {
        const caption =
          `Tên miền này chưa có chủ sở hữu` +
          `\nGiá gốc: ${jsonParse.feeOrigin} vnd` +
          `\nGiá ưu đãi (Tham khảo): ${jsonParse.fee} vnd`;
        await sendMessageComplete(api, message, caption, true, TIME_TO_LIVE);
      } else {
        if (jsonParse.expirationDate) {
          const caption =
            `Thông Tin Tên Miền: ${hostname}` +
            `\nNgười Đăng Ký: ${jsonParse.registrantName || "Không Rõ"}` +
            `\nĐơn Vị Đăng Ký: ${jsonParse.registrar}` +
            `\nNgày Đăng Ký: ${jsonParse.creationDate}` +
            `\nNgày Hết Hạn: ${jsonParse.expirationDate}` +
            `\nDNSSEC: ${jsonParse.DNSSEC}` +
            `\nTên Máy Chủ: [ ${jsonParse.nameServer.join(", ")} ]` +
            `\nTrạng Thái: [ ${jsonParse.status.join(", ")} ]`;
          await sendMessageComplete(api, message, caption, true, TIME_TO_LIVE);
        } else {
          const caption = `Tên miền này không khả dụng: ${jsonParse.message}`;
          await sendMessageComplete(api, message, caption, false, TIME_TO_LIVE);
        }
      }
    } else {
      throw new Error("mã truy vấn: " + response.status);
    }
  } catch (error) {
    const caption = "CÓ lỗi khi tra cứu tên miền: " + error.message;
    await sendMessageFailed(api, message, caption, true, TIME_TO_LIVE);
  }
}

const LINK_CHECK_IP = "https://checkip.com.vn/locator?host=";
const LINK_CHECK_IP_2 = "https://checkip.vip/api/lookup";
export async function handleCheckIPCommand(api, message, aliasCommand) {
  const botId = api.getBotId();
  const prefix = getGlobalPrefix(botId);
  const content = removeMention(message).replace(prefix, "").replace(aliasCommand, "").trim();

  if (!content) {
    const caption = `Hướng dẫn dùng lệnh:\n` + `${prefix + aliasCommand} [IP]`;
    await sendMessageWarning(api, message, caption, false, TIME_TO_LIVE);
    return;
  }

  const client = getClientAxios();

  try {
    const response = await client.get(`${LINK_CHECK_IP}${content}`);
    if (response.status === 200) {
      const $ = cheerio.load(response.data);
      const result = {};
      $("table.w-full tr").each((index, element) => {
        const tds = $(element).find("td");
        const key = $(tds[0]).text().trim();
        const value = $(tds[1]).text().trim();
        if (value) {
          result[key] = value;
        }
      });
      if (Object.keys(result).length > 0) {
        let caption = `Thông Tin IP: ${content}\n`;
        Object.entries(result).forEach(([key, value]) => {
          caption += `${key}: ${value}\n`;
        });
        caption = caption.trim();
        await sendMessageComplete(api, message, caption, true, TIME_TO_LIVE);
      } else {
        throw new Error("không tìm thấy, chuyển sang ip phụ");
      }
    } else {
      throw new Error("mã truy vấn: " + response.status);
    }
  } catch (error) {
    try {
      const formIp = new FormData();
      formIp.append("ip", content);
      const response = await client.post(LINK_CHECK_IP_2, formIp, { params: { _: Date.now() } });
      if (response.status === 200) {
        const dataIp = response.data.data;
        let caption =
          `Thông Tin IP: ${dataIp.ip}` +
          `\nNhà Cung Cấp: ${dataIp.isp || "Không Rõ"}` +
          `\nTổ Chức: ${dataIp.org}` +
          `\nKhu Vực: ${dataIp.continent}` +
          `\nQuốc Gia: ${dataIp.country}` +
          `\nThành Phố: ${dataIp.city}` +
          `\nMã Zip: ${dataIp.zip}` +
          `\nTimezone: ${dataIp.timezone}` +
          `\nAS: ${dataIp.as}`;
        await sendMessageComplete(api, message, caption, true, TIME_TO_LIVE);
      } else {
        throw new Error("mã truy vấn: " + response.status);
      }
    } catch (error) {
      const caption = "Có lỗi khi tra cứu ip: " + error.message;
      await sendMessageFailed(api, message, caption, true, TIME_TO_LIVE);
    }
  }
}
