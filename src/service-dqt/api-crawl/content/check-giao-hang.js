import axios from "axios";
import * as cheerio from "cheerio";
import { formatDateText, maskPhoneNumber, removeMention } from "../../../utils/format-util.js";
import { sendMessageComplete, sendMessageFailed, sendMessageWarning, sendReplyInChunks } from "../../chat-zalo/chat-style/chat-style.js";
import { getGlobalPrefix } from "../../service.js";

const checkOrderGHN = async (ORDERCODE) => {
  try {
    const response = await axios.post(
      "https://fe-online-gateway.ghn.vn/order-tracking/public-api/client/tracking-logs",
      {
        order_code: ORDERCODE,
      },
      {
        headers: {
          authority: "fe-online-gateway.ghn.vn",
          accept: "application/json",
          "accept-language": "vi-VN,vi;q=0.9,fr-FR;q=0.8,fr;q=0.7,en-US;q=0.6,en;q=0.5",
          "content-type": "application/json",
          origin: "https://donhang.ghn.vn",
          referer: "https://donhang.ghn.vn/",
          "user-agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/109.0.0.0 Safari/537.36",
        },
      }
    );
    return response.data;
  } catch {
    return { code: 400, message: "Failed" };
  }
};

const checkOrderSPX = async (ORDERCODE) => {
  try {
    const response = await axios.get("https://spx.vn/shipment/order/open/order/get_order_info", {
      params: {
        spx_tn: ORDERCODE,
        language_code: "vi",
      },
      headers: {
        accept: "application/json, text/plain, */*",
        "accept-language": "en-US,en;q=0.9,vi;q=0.8",
        priority: "u=1, i",
        referer: "https://spx.vn/track",
        "user-agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/135.0.0.0 Safari/537.36",
      },
    });
    if (response.data.retcode === 0) {
      return response.data;
    } else {
      return { code: 400, message: "Failed" };
    }
  } catch {
    return { code: 400, message: "Failed" };
  }
};

const checkOrderJtexpress = async (ORDERCODE) => {
  const baseUrl = `https://lendon.jtexpress.vn`;

  try {
    const client = axios.create({
      headers: {
        "Content-Type": "application/json",
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36",
      },
    });

    const formData = new URLSearchParams();
    formData.append("billcode", ORDERCODE);

    const response = await client.post(`${baseUrl}/tracking`, formData, {
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
    });

    const $ = cheerio.load(response.data);
    const results = [];

    $("ol > li").each((index, element) => {
      const time = $(element).find("h4").text().trim();
      const content = $(element).find("p").text().trim();

      results.push({ time, content });
    });

    if (results.length > 0) {
      return { code: 200, data: results };
    } else {
      return { code: 400, message: "No tracking data found" };
    }
  } catch (error) {
    console.error("Error:", error.message);
    return { code: 400, message: "Failed" };
  }
};

const checkOrderGHTK = async (ORDERCODE) => {
  try {
    const response = await axios.get(`https://services.giaohangtietkiem.vn/services/shipment/v2/${ORDERCODE}`, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/109.0.0.0 Safari/537.36",
      },
    });
    return response.data;
  } catch {
    return {
      code: 400,
      message: "Failed",
    };
  }
};

const SHIPPING_PROVIDERS = {
  ghn: {
    name: "Giao Hàng Nhanh",
    aliases: ["ghn", "giaohangnhanh", "ghnvn"],
    api: checkOrderGHN,
  },
  spx: {
    name: "SPX Express Vietnam",
    aliases: ["spx"],
    api: checkOrderSPX,
  },
  jtexpress: {
    name: "J&T Express",
    aliases: ["jtexpress", "j&t"],
    api: checkOrderJtexpress,
  },
//   ghtk: {
//     name: "Giao Hàng Tiết Kiệm",
//     aliases: ["ghtk", "giaohangtietkiem", "ghtkvn"],
//     api: checkOrderGHTK,
//   },
};

function getProviderFromAlias(alias) {
  const normalizedAlias = alias.toLowerCase();
  for (const [providerKey, provider] of Object.entries(SHIPPING_PROVIDERS)) {
    if (provider.aliases.includes(normalizedAlias)) {
      return provider;
    }
  }
  return null;
}

function getSupportedProviders() {
  return Object.values(SHIPPING_PROVIDERS)
    .map((provider) => `📦 ${provider.name} (${provider.aliases.join(", ")})`)
    .join("\n");
}

export async function handleCheckOrderDeliveryCommand(api, message, aliasCommand) {
  const content = removeMention(message);
  const prefix = getGlobalPrefix(api.getBotId());
  const args = content.replace(`${prefix}${aliasCommand}`, "").trim();

  const [providerAlias, orderCode] = args.split(" ");

  if (!providerAlias || !orderCode) {
    const caption = `Hướng dẫn tra cứu đơn hàng:\n${prefix}${aliasCommand} [nhà cung cấp] [mã đơn hàng]\n\nCác nhà cung cấp hỗ trợ:\n${getSupportedProviders()}`;
    await sendMessageComplete(api, message, caption, false, 180000);
    return;
  }

  const provider = getProviderFromAlias(providerAlias);
  if (!provider) {
    const caption = `Nhà cung cấp không được hỗ trợ. Vui lòng thử lại với các nhà cung cấp sau:\n${getSupportedProviders()}`;
    await sendMessageWarning(api, message, caption, false, 180000);
    return;
  }

  const result = await provider.api(orderCode);

  if (result.code === 400) {
    const caption = `Không thể kiểm tra đơn hàng ${orderCode} của ${provider.name}. Vui lòng thử lại sau hoặc kiểm tra lại nhà cung cấp.`;
    await sendMessageFailed(api, message, caption, true, 180000);
    return;
  }

  let messageText = `[${provider.name}]\nThông tin đơn hàng ${orderCode}:\n\n`;
  let orderInfo;

  switch (provider.name) {
    case "Giao Hàng Nhanh":
      orderInfo = result.data.order_info;
      messageText += `🌟 THÔNG TIN ĐƠN HÀNG: 🌟\n`;
      messageText += `📅 Ngày Lấy Dự Kiến: ${formatDateText(orderInfo.picktime)}\n`;
      messageText +=
        `📦 Ngày Giao Dự Kiến: Từ ${formatDateText(orderInfo.leadtime_order.from_estimate_date)} ` +
        `đến ${formatDateText(orderInfo.leadtime_order.to_estimate_date)}\n`;
      messageText += `🔍 Trạng Thái: ${orderInfo.status_name}\n\n`;
      messageText += `🛍️ ITEM: \n`;
      messageText += orderInfo.items.map((item, index) => `    ${index + 1}. [${item.name}]`).join("\n");
      messageText += `\n\n`;
      messageText += `👤 NGƯỜI NHẬN:\n`;
      messageText += `  📝 Tên: ${orderInfo.to_name}\n`;
      messageText += `  📞 Điện Thoại: ${orderInfo.to_phone}\n`;
      messageText += `  📍 Địa chỉ: ${orderInfo.to_address}\n\n`;
    //   messageText += `📦 NGƯỜI GỬI:\n`;
    //   messageText += `  📝 Tên: ${orderInfo.from_name}\n`;
    //   messageText += `  📞 Điện Thoại: ${orderInfo.from_phone}\n`;
    //   messageText += `  📍 Địa chỉ: ${orderInfo.from_address}\n\n`;
      messageText += `🕒 LỊCH SỬ THAO TÁC:\n`;
      messageText += result.data.tracking_logs
        .map((item, index) => {
          const time = formatDateText(item.action_at);
          return `\n  📍 ${time}: ${item.status_name}\n  ${item.executor?.name || ""}: ${
            item.location?.address || ""
          }\n`;
        })
        .join("");
      messageText = messageText.trim();
      break;
    case "SPX Express Vietnam":
      result.data.sls_tracking_info.records.map((item) => {
        messageText += `📦 Mốc: ${item.tracking_name}\n`;
        messageText += `⏰ Thời gian: ${new Date(item.actual_time * 1000).toLocaleString("vi-VN")}\n`;
        messageText += `📝 Mô tả: ${item.buyer_description}\n\n`;
      });
      messageText = messageText.trim();
      break;
    case "J&T Express":
      result.data.map((item) => {
        messageText += `⏰ Thời gian: ${item.time}\n`;
        messageText += `📝 Mô tả: ${item.content}\n\n`;
      });
      break;
  }

  return await sendReplyInChunks(api, message, maskPhoneNumber(messageText), 3600000);
}

