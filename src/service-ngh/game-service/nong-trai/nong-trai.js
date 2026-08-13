import schedule from "node-schedule";
import chalk from "chalk";
import { sendMessageFromSQL } from "../../chat-zalo/chat-style/chat-style.js";
import { getGlobalPrefix } from "../../service.js";
import { CROPS, PRODUCT_CODES, SHOP_ITEMS, SOIL_STATUS } from "./data-nongtrai.js";
import { checkBeforeJoinGame, checkPlayerBanned } from "../index.js";
import { getPlayerInfo } from "../../../database/player.js";
import { calculateLandPrice, formatShopItems, handleBuyProduct, handleSellProduct } from "./shop-nongtrai.js";
import { drawFarm, drawFarmBackground } from "./cv-nongtrai.js";
import { clearImagePath } from "../../../utils/canvas/index.js";
import {
  handleCuocDatCommand,
  handleSendStatusCommand,
  handleWaterPlotCommand,
  handleUseItemCommand,
  handleGieoHatCommand,
  handleHarvestCommand,
  sendFarmImage,
  useItem,
} from "./farm.js";
import { drawShopCanvas } from "./cv-shop.js";
import { farmDataJsonPath } from "../../../utils/io-json.js";
import { readFileSync, writeFileSync } from "../../../utils/util.js";

let farmDataCache = {};
let hasChanges = {};

export const getFarmDataCache = (idBot) =>
  farmDataCache[idBot] || {
    nongtrai: {},
  };

function loadFarmDataCache(idBot) {
  farmDataCache[idBot] = readFarmData(idBot);
}

export function setHasChange(idBot) {
  hasChanges[idBot] = true;
}

function saveFarmDataCache(idBot) {
  if (hasChanges[idBot]) {
    writeFarmData(idBot, getFarmDataCache(idBot));
    hasChanges[idBot] = false;
  }
}

function readFarmData(idBot) {
  try {
    const data = readFileSync(farmDataJsonPath(idBot));
    return JSON.parse(data);
  } catch (error) {
    console.error("Lỗi khi đọc file farm-data.json:", error);
    return { nongtrai: {} };
  }
}

function writeFarmData(idBot, data) {
  try {
    writeFileSync(farmDataJsonPath(idBot), JSON.stringify(data, null, 2));
  } catch (error) {
    console.error("Lỗi khi ghi file farm-data.json:", error);
  }
}

export const TIME_TO_LIVE = 10800000;

export async function initializeFarmService(api) {
  const idBot = api.getBotId();
  loadFarmDataCache(idBot);

  const jobCheckFarm = schedule.scheduleJob("*/10 * * * * *", async () => {
    try {
      saveFarmDataCache(idBot);
      await updateFarms(idBot);
    } catch (error) {
      console.error("Lỗi khi update nông trại:", error);
    }
  });

  api.apiInstance.schedule.jobCheckFarm = jobCheckFarm;
  console.log(chalk.magentaBright("Khởi động và nạp dữ liệu minigame nông trại hoàn tất"));
}

async function updateFarms(idBot) {}

async function initializeFarm(idBot, userName) {
  const farmData = getFarmDataCache(idBot);

  if (!farmData.nongtrai) {
    farmData.nongtrai = {};
  }

  if (!farmData.nongtrai[userName]) {
    farmData.nongtrai[userName] = {
      bag: {},
      plots: Array(4)
        .fill()
        .map(() => ({
          crop: null,
          plantedAt: null,
          waterLevel: 100,
          lastWateredAt: Date.now(),
          status: SOIL_STATUS.GOOD,
          fertilized: [],
        })),
    };
    setHasChange(idBot);
  } else if (!farmData.nongtrai[userName].plots) {
    farmData.nongtrai[userName].plots = Array(4)
      .fill()
      .map(() => ({
        crop: null,
        plantedAt: null,
        waterLevel: 100,
        lastWateredAt: Date.now(),
        status: SOIL_STATUS.GOOD,
        fertilized: [],
      }));
    setHasChange(idBot);
  } else if (!farmData.nongtrai[userName].bag) {
    farmData.nongtrai[userName].bag = {};
    setHasChange(idBot);
  }

  return farmData.nongtrai[userName];
}

async function updateSoilStatus(idBot, farm) {
  const now = Date.now();
  const oneHour = 60 * 60 * 1000; // 1 giờ tính bằng milliseconds
  let hasChanges = false;

  farm.plots.forEach((plot) => {
    if (!plot.lastWateredAt) return;

    const timeSinceLastWatered = now - plot.lastWateredAt;
    const hoursElapsed = Math.floor(timeSinceLastWatered / oneHour);

    // Cập nhật độ ẩm dựa trên số giờ đã trôi qua
    // Giảm 10% độ ẩm mỗi giờ
    const waterLevelReduction = Math.min(hoursElapsed * 10, 100);
    const newWaterLevel = Math.max(0, 100 - waterLevelReduction);

    // Cập nhật trạng thái dựa trên độ ẩm mới
    let newStatus;
    if (newWaterLevel <= 0) {
      newStatus = SOIL_STATUS.DRY;
    } else if (newWaterLevel <= 40) {
      newStatus = SOIL_STATUS.LOW_WATER;
    } else {
      newStatus = SOIL_STATUS.GOOD;
    }

    // Chỉ cập nhật nếu có thay đổi
    if (plot.waterLevel !== newWaterLevel || plot.status !== newStatus) {
      plot.waterLevel = newWaterLevel;
      plot.status = newStatus;
      hasChanges = true;
    }
  });

  if (hasChanges) {
    setHasChange(idBot);
  }
}

// Thêm hàm mới để quản lý túi đồ
export async function updatePlayerBagHasSetting(idBot, farm, itemKey, quantity) {
  if (!farm.bag[itemKey]) {
    farm.bag[itemKey] = 0;
  }
  farm.bag[itemKey] += quantity;

  // Xóa item nếu số lượng = 0
  if (farm.bag[itemKey] <= 0) {
    delete farm.bag[itemKey];
  }

  setHasChange(idBot);
  return farm.bag[itemKey] || 0;
}

export function parseSlotRanges(rangeStr) {
  const slots = new Set();

  // Tách các phần tử bởi dấu cách
  const parts = rangeStr.split(/\s+/);

  for (const part of parts) {
    // Kiểm tra nếu là phạm vi (có dấu -)
    if (part.includes("-")) {
      const [start, end] = part.split("-").map((num) => parseInt(num));
      if (!isNaN(start) && !isNaN(end)) {
        // Thêm tất cả các số trong phạm vi
        for (let i = Math.min(start, end); i <= Math.max(start, end); i++) {
          slots.add(i - 1); // Trừ 1 vì index bắt đầu từ 0
        }
      }
    } else {
      // Nếu là số đơn lẻ
      const num = parseInt(part);
      if (!isNaN(num)) {
        slots.add(num - 1);
      }
    }
  }

  return Array.from(slots);
}

// Thêm hàm kiểm tra số lượng vật phẩm
export async function checkItemQuantity(farm, itemKey) {
  return farm.bag?.[itemKey] || 0;
}

// Thêm hàm mới để xử lý lệnh mybag
export async function handleMyBagCommand(api, message, groupSettings) {
  const threadId = message.threadId;
  const botId = api.getBotId();

  const senderId = message.data.uidFrom;

  // Hồ sơ đã được tự động tạo bởi checkBeforeJoinGame.
  const playerInfo = await getPlayerInfo(senderId);
  if (playerInfo === null) {
    const result = {
      success: false,
      message: `Không thể khởi tạo hồ sơ game. Vui lòng thử lại.`,
    };
    await sendMessageFromSQL(api, message, result);
    return;
  }

  if (await checkPlayerBanned(api, message, threadId, senderId)) {
    return;
  }

  const userName = playerInfo.username;
  const farm = await initializeFarm(botId, userName);
  const playerBag = farm.bag;
  let bagMsg = "🎒 TÚI ĐỒ CỦA BẠN 🎒\n\n";

  if (Object.keys(playerBag).length === 0) {
    bagMsg += "Túi đồ trống!";
  } else {
    const seeds = [];
    const products = [];
    const items = [];

    for (const [itemCode, quantity] of Object.entries(playerBag)) {
      const productInfo = PRODUCT_CODES[itemCode];
      if (productInfo) {
        switch (productInfo.type) {
          case "CROP":
            const cropInfo = CROPS[productInfo.key];
            seeds.push(`${cropInfo.icon} [${itemCode}] ${cropInfo.name} (Hạt giống): ${quantity}`);
            break;
          case "PRODUCT":
            const harvestInfo = CROPS[productInfo.key];
            products.push(`${harvestInfo.icon} [${itemCode}] ${harvestInfo.name} (Thu hoạch): ${quantity}`);
            break;
          case "ITEM":
            const itemInfo = SHOP_ITEMS[productInfo.key];
            items.push(`${itemInfo.icon} [${itemCode}] ${itemInfo.name}: ${quantity}`);
            break;
        }
      }
    }

    if (seeds.length > 0) bagMsg += "🌱 HẠT GIỐNG:\n" + seeds.join("\n") + "\n\n";
    if (products.length > 0) bagMsg += "🌾 THÀNH PHẨM:\n" + products.join("\n") + "\n\n";
    if (items.length > 0) bagMsg += "🛠️ VẬT PHẨM:\n" + items.join("\n");
  }

  await api.sendMessage({ msg: bagMsg, quote: message, ttl: TIME_TO_LIVE }, threadId, message.type);
}

async function handleShopCommand(api, message, farm, args) {
  const threadId = message.threadId;
  if (args.length >= 2) {
    const buyProductCode = args[1].toUpperCase();
    const quantity = args[2] ? parseInt(args[2]) : 1;
    await handleBuyProduct(api, message, farm, buyProductCode, quantity);
  } else {
    const landPrice = calculateLandPrice(farm.plots.length);
    const shopMsg = formatShopItems(landPrice);
    const shopCanvas = await drawShopCanvas(landPrice);
    await api.sendMessage(
      { msg: "", attachments: [shopCanvas], ttl: TIME_TO_LIVE, isUseProphylactic: true },
      threadId,
      message.type
    );
    await clearImagePath(shopCanvas);
  }
}

async function handleBuyProductCommand(api, message, farm, args) {
  const threadId = message.threadId;
  const prefix = getGlobalPrefix(api.getBotId());

  if (args.length < 2) {
    await api.sendMessage(
      { msg: `Vui lòng nhập mã sản phẩm cần mua. Ví dụ: ${prefix}nongtrai buy W1`, quote: message },
      threadId,
      message.type
    );
    return;
  }

  const buyProductCode = args[1].toUpperCase();
  const quantity = args[2] ? parseInt(args[2]) : 1;
  await handleBuyProduct(api, message, farm, buyProductCode, quantity);
}

export function groupConsecutiveResults(results) {
  const grouped = [];
  let currentGroup = {
    start: results[0].plotIndex,
    message: results[0].message,
    success: results[0].success,
  };

  for (let i = 1; i <= results.length; i++) {
    if (
      i < results.length &&
      results[i].message === currentGroup.message &&
      results[i].success === currentGroup.success &&
      results[i].plotIndex === results[i - 1].plotIndex + 1
    ) {
      // Kiểm tra tính liên tục
      continue;
    }

    const startPlot = currentGroup.start + 1; // Số thứ tự bắt đầu từ 1
    const endPlot = i < results.length ? results[i - 1].plotIndex + 1 : results[i - 1].plotIndex + 1;

    if (startPlot === endPlot) {
      grouped.push(`Ô ${startPlot}: ${currentGroup.success ? "✅" : "❌"} ${currentGroup.message}`);
    } else {
      grouped.push(`Ô ${startPlot}->${endPlot}: ${currentGroup.success ? "✅" : "❌"} ${currentGroup.message}`);
    }

    if (i < results.length) {
      currentGroup = {
        start: results[i].plotIndex,
        message: results[i].message,
        success: results[i].success,
      };
    }
  }

  return grouped.join("\n\n");
}

export async function handleNongTraiCommand(api, message, groupSettings) {
  const idBot = api.getBotId();
  if (!(await checkBeforeJoinGame(api, message, groupSettings, true))) return;

  const threadId = message.threadId;
  const senderId = message.data.uidFrom;
  const prefix = getGlobalPrefix(idBot);
  const content = message.data.content.toLowerCase().trim();

  // Hồ sơ đã được tự động tạo bởi checkBeforeJoinGame.
  const playerInfo = await getPlayerInfo(senderId);
  if (playerInfo === null) {
    const result = {
      success: false,
      message: `Không thể khởi tạo hồ sơ game. Vui lòng thử lại.`,
    };
    await sendMessageFromSQL(api, message, result);
    return;
  }

  if (await checkPlayerBanned(api, message, threadId, senderId)) {
    return;
  }

  const args = content.split(/\s+/);
  args.shift(); // Bỏ lệnh !nongtrai

  // Nếu chưa có args hoặc xem help
  if (args.length === 0 || args[0] === "help") {
    const background = await drawFarmBackground();
    let helpMsg =
      `🌾 HƯỚNG DẪN NÔNG TRẠI 🌾\n\n` +
      `1. ${prefix}nongtrai farm - Xem trạng thái nông trại\n` +
      `2. ${prefix}nongtrai cuocdat [các slot đất] - Cuốc đất\n` +
      `3. ${prefix}nongtrai tuoinuoc [các slot đất] - Tưới nước\n` +
      `4. ${prefix}nongtrai gieohat [mã hạt giống] [các slot đất] - Trồng hạt giống\n` +
      `5. ${prefix}nongtrai use [mã SP] [các slot đất] - Sử dụng vật phẩm\n` +
      `6. ${prefix}nongtrai thuhoach [các slot đất] - Thu hoạch\n` +
      `7. ${prefix}nongtrai shop - Xem cửa hàng\n` +
      `8. ${prefix}nongtrai buy [mã SP] [SL] - Mua vật phẩm\n` +
      `9. ${prefix}nongtrai kho - Xem vật phẩm trong kho\n` +
      `10. ${prefix}nongtrai sell [mã SP] [SL] - Bán sản phẩm\n\n` +
      `Lưu ý:\n` +
      `- Đất sẽ thiếu nước sau 4h không tưới\n` +
      `- Đất sẽ khô cằn sau 8h không tưới\n` +
      `- Đất khô cằn cần cuốc trước khi tưới\n` +
      `- Dùng lệnh ntr nếu bn thấy nongtrai là quá dài!!!`;

    await api.sendMessage(
      { msg: helpMsg, attachments: [background], ttl: TIME_TO_LIVE, isUseProphylactic: true },
      threadId,
      message.type
    );
    await clearImagePath(background);

    return;
  }

  // Khởi tạo hoặc lấy dữ liệu nông trại
  const userName = playerInfo.username;
  const farm = await initializeFarm(idBot, userName);
  await updateSoilStatus(idBot, farm);

  // Xử lý các lệnh khác
  switch (args[0]) {
    case "farm":
    case "check":
      await handleSendStatusCommand(api, message, farm);
      break;

    case "tuoinuoc":
      await handleWaterPlotCommand(api, message, farm, args);
      break;

    case "cuocdat":
      await handleCuocDatCommand(api, message, farm, args);
      break;

    case "shop":
      await handleShopCommand(api, message, farm, args);
      break;

    case "buy":
      await handleBuyProductCommand(api, message, farm, args);
      break;

    case "use":
      await handleUseItemCommand(api, message, farm, args);
      break;

    case "kho":
    case "bag":
      return handleMyBagCommand(api, message, groupSettings);

    case "thuhoach":
      await handleHarvestCommand(api, message, farm, args);
      break;

    case "sell":
      await handleSellProduct(api, message, farm, args);
      break;

    case "gieohat":
      await handleGieoHatCommand(api, message, farm, args);
      break;

    default:
      await api.sendMessage(
        { msg: `Lệnh không hợp lệ. Sử dụng ${prefix}nongtrai help để xem hướng dẫn.`, quote: message },
        threadId,
        message.type
      );
  }
}
