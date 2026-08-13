import Big from "big.js";
import { CROPS, SHOP_ITEMS, PRODUCT_CODES, SOIL_STATUS } from "./data-nongtrai.js";
import {
  groupConsecutiveResults,
  parseSlotRanges,
  setHasChange,
  TIME_TO_LIVE,
  updatePlayerBagHasSetting,
} from "./nong-trai.js";
import { drawFarm } from "./cv-nongtrai.js";
import { MessageMention } from "../../../api-zalo/index.js";
import { clearImagePath } from "../../../utils/canvas/index.js";
import { formatSeconds } from "../../../utils/format-util.js";
import { getGlobalPrefix } from "../../service.js";

// Thêm hàm mới để tạo text từ kết quả
function formatStatusText(farm) {
  let statusText = "🌾 NÔNG TRẠI CỦA BẠN 🌾\n\n";
  let results = [];

  farm.plots.forEach((plot, index) => {
    let status = {
      plotIndex: index,
      success: true,
      message: "",
    };

    if (plot.crop) {
      const cropInfo = CROPS[plot.crop];
      const now = Date.now();
      const timeLeft = Math.max(0, (plot.plantedAt + cropInfo.growthTime * 1000 - now) / 1000);

      status.message = `Đang trồng ${cropInfo.icon} ${cropInfo.name} : `;
      status.message += `${timeLeft === 0 ? "✨ Có thể thu hoạch" : `⏳ Còn ${formatSeconds(Math.ceil(timeLeft))}`}\n`;

      // Thêm thông tin phân bón
      if (plot.fertilized && plot.fertilized.length > 0) {
        const fertilizers = plot.fertilized.map((type) => SHOP_ITEMS[type].name).join(", ");
        status.message += `Đã bón: ${fertilizers}\n`;
      }
    } else {
      status.message = `Chưa trồng cây 🚜\n`;
    }

    // Thêm thông tin độ ẩm
    status.message += `Độ ẩm: ${plot.waterLevel}% (${plot.status})`;

    results.push(status);
  });

  statusText += groupConsecutiveResults(results);
  return statusText;
}

// Xử lý việc tạo và gửi ảnh ng trại
export async function sendFarmImage(api, message, farm, status) {
  const threadId = message.threadId;
  const senderId = message.data.uidFrom;
  const senderName = message.data.dName;

  try {
    const imagePath = await drawFarm(farm);

    await api.sendMessage(
      {
        msg: `${senderName}\n${status ? status : "🌱 NÔNG TRẠI CỦA BẠN 🌱"}`,
        attachments: [imagePath],
        mentions: [MessageMention(senderId, senderName.length, 0, false)],
        isUseProphylactic: true,
        ttl: TIME_TO_LIVE,
      },
      threadId,
      message.type
    );

    await clearImagePath(imagePath);

    return true;
  } catch (error) {
    console.error("Lỗi khi tạo ảnh nông trại:", error);
    await api.sendMessage({ msg: status, quote: message, ttl: TIME_TO_LIVE }, threadId, message.type);
    return false;
  }
}

export async function handleSendStatusCommand(api, message, farm) {
  const statusText = formatStatusText(farm);
  await sendFarmImage(api, message, farm, statusText);
}

// Thêm hàm xử lý cuốc đất
async function digSoil(botId, farm, plotIndex) {
  const plot = farm.plots[plotIndex];

  // Kiểm tra ô đất có tồn tại không
  if (!plot) {
    return { success: false, message: "Ô đất không tồn tại!", plotIndex };
  }

  // Tính toán độ ẩm hiện tại
  const now = Date.now();
  const oneHour = 60 * 60 * 1000;
  const timeSinceLastWatered = now - plot.lastWateredAt;
  const hoursElapsed = Math.floor(timeSinceLastWatered / oneHour);
  const currentWaterLevel = Math.max(0, 100 - hoursElapsed * 10);

  // Cập nhật trạng thái dựa trên độ ẩm hiện tại
  if (currentWaterLevel <= 0) {
    plot.status = SOIL_STATUS.DRY;
  } else if (currentWaterLevel <= 40) {
    plot.status = SOIL_STATUS.LOW_WATER;
  } else {
    plot.status = SOIL_STATUS.GOOD;
  }
  plot.waterLevel = currentWaterLevel;

  // Kiểm tra trạng thái đất
  if (plot.status !== SOIL_STATUS.DRY) {
    return { success: false, message: "Chỉ có thể cuốc đất khi đất ở trạng thái khô cằn!", plotIndex };
  }

  // Kiểm tra có cuốc trong túi đồ không
  if (!farm.bag["S1"] || farm.bag["S1"] <= 0) {
    return { success: false, message: "Bạn không có cuốc trong túi đồ! Hãy mua cuốc từ shop.", plotIndex };
  }

  // Trừ 1 cái cuốc
  farm.bag["S1"]--;
  if (farm.bag["S1"] <= 0) {
    delete farm.bag["S1"];
  }

  // Tăng độ ẩm thêm 10%
  const newWaterLevel = Math.min(100, 10); // Đặt độ ẩm là 10%
  plot.waterLevel = newWaterLevel;
  plot.status = SOIL_STATUS.LOW_WATER;
  plot.lastWateredAt = now - oneHour * 9; // Đặt thời gian để duy trì độ ẩm 10%

  setHasChange(botId);

  return {
    success: true,
    message: "Đã cuốc đất thành công! Hãy tưới nước để đất trở nên tốt hơn.",
    plotIndex,
  };
}

async function waterPlot(botId, farm, plotIndex) {
  const plot = farm.plots[plotIndex];

  if (!plot) {
    return { success: false, message: "Ô đất không tồn tại!", plotIndex };
  }

  // Tính toán độ ẩm hiện tại
  const now = Date.now();
  const oneHour = 60 * 60 * 1000;
  const timeSinceLastWatered = now - plot.lastWateredAt;
  const hoursElapsed = Math.floor(timeSinceLastWatered / oneHour);
  const currentWaterLevel = Math.max(0, 100 - hoursElapsed * 10);

  // Cập nhật trạng thái dựa trên độ ẩm hiện tại
  if (currentWaterLevel <= 0) {
    plot.status = SOIL_STATUS.DRY;
  } else if (currentWaterLevel <= 40) {
    plot.status = SOIL_STATUS.LOW_WATER;
  } else {
    plot.status = SOIL_STATUS.GOOD;
  }
  plot.waterLevel = currentWaterLevel;

  // Kiểm tra nếu đất khô cằn
  if (plot.status === SOIL_STATUS.DRY) {
    return {
      success: false,
      message: "Đất đã khô cằn, cần phải dùng cuốc (S1) để cuốc đất trước khi tưới nước!",
      plotIndex,
    };
  }

  // Kiểm tra nếu độ ẩm đã 100%
  if (currentWaterLevel >= 100) {
    return {
      success: false,
      message: "Độ ẩm đã đạt tối đa (100%), không cần tưới thêm nước!",
      plotIndex,
    };
  }

  // Kiểm tra có bình nước trong túi không
  if (!farm.bag["W1"] || farm.bag["W1"] <= 0) {
    return {
      success: false,
      message: "Bạn không có bình nước trong túi đồ! Hãy mua bình nước (W1) từ shop.",
      plotIndex,
    };
  }

  // Trừ 1 bình nước
  farm.bag["W1"]--;
  if (farm.bag["W1"] <= 0) {
    delete farm.bag["W1"];
  }

  // Tính thời gian cần thiết để đạt được độ ẩm mong muốn
  const targetWaterLevel = Math.min(100, currentWaterLevel + 60); // Tăng thêm 60% nhưng không vượt quá 100%
  const hoursNeeded = (100 - targetWaterLevel) / 10; // Số giờ để giảm xuống targetWaterLevel

  // Cập nhật lastWateredAt để khi updateStatus tính ra đúng targetWaterLevel
  plot.lastWateredAt = now - hoursNeeded * oneHour;
  plot.waterLevel = targetWaterLevel;
  plot.status = targetWaterLevel > 40 ? SOIL_STATUS.GOOD : SOIL_STATUS.LOW_WATER;

  setHasChange(botId);

  return {
    success: true,
    message: "Tưới nước thành công! Đất đã trở nên tươi tốt.",
    plotIndex,
  };
}

// Thêm hàm mới để xử lý trồng cây
async function plantCrop(botId, farm, plotIndex, cropCode, senderId) {
  const plot = farm.plots[plotIndex];

  // Kiểm tra ô đất có tồn tại không
  if (!plot) {
    return { success: false, message: "Ô đất không tồn tại!", plotIndex };
  }

  // Kiểm tra ô đất đã có cây chưa
  if (plot.crop) {
    return { success: false, message: "Ô đất này đã có cây đang trồng!", plotIndex };
  }

  // Kiểm tra trạng thái đất và độ ẩm
  if (plot.status === SOIL_STATUS.DRY) {
    return {
      success: false,
      message: "Đất đã khô cằn, cần phải cuốc đất và tưới nước trước khi trồng cây!",
      plotIndex,
    };
  }

  if (plot.waterLevel <= 40) {
    return {
      success: false,
      message: "Độ ẩm đất quá thấp (≤40%), hãy tưới nước trước khi trồng cây!",
      plotIndex,
    };
  }

  // Lấy thông tin cây trồng
  const productInfo = PRODUCT_CODES[cropCode];
  if (!productInfo || productInfo.type !== "CROP") {
    return { success: false, message: "Mã hạt giống không hợp lệ!", plotIndex };
  }

  const bag = farm.bag;
  if (!bag[cropCode] || bag[cropCode] <= 0) {
    return { success: false, message: "Bạn không có hạt giống này trong túi đồ!", plotIndex };
  }

  // Trừ hạt giống
  bag[cropCode]--;
  if (bag[cropCode] <= 0) {
    delete bag[cropCode];
  }

  // Trồng cây
  plot.crop = productInfo.key;
  plot.plantedAt = Date.now();

  setHasChange(botId);

  const cropInfo = CROPS[productInfo.key];
  return {
    success: true,
    message: `Đã trồng thành công ${cropInfo.icon} ${cropInfo.name}!\nThu hoạch sau ${cropInfo.growthTime / 60} phút.`,
    plotIndex,
  };
}

// Sử dụng vật phẩm
export async function useItem(botId, plot, itemType, farm, plotIndex, senderId) {
  const item = SHOP_ITEMS[itemType];
  if (!item) {
    return { success: false, message: "Vật phẩm không tồn tại!", plotIndex };
  }

  switch (itemType) {
    case "WATER":
      return await waterPlot(botId, farm, plotIndex);

    case "SHOVEL":
      return await digSoil(botId, farm, plotIndex);

    case "FERTILIZER":
    case "MEDIUM_FERTILIZER":
    case "SUPER_FERTILIZER":
      if (!plot.crop) {
        return { success: false, message: "Không có cây để bón phân!", plotIndex };
      }

      if (!plot.fertilized) {
        plot.fertilized = [];
      }

      if (plot.fertilized.includes(itemType)) {
        return { success: false, message: `Cây này đã được bón ${item.name} rồi!`, plotIndex };
      }

      const now = new Big(Date.now());
      const totalGrowthTime = new Big(CROPS[plot.crop].growthTime).times(1000);
      const plantedAt = new Big(plot.plantedAt);
      const timeLeft = plantedAt.plus(totalGrowthTime).minus(now);

      if (timeLeft.lte(0)) {
        return { success: false, message: "Cây đã sẵn sàng thu hoạch, không thể bón phân!", plotIndex };
      }

      // Tính thời gian giảm
      const reduction = timeLeft.times(item.effect);

      // Giảm thời gian trồng
      plot.plantedAt = plantedAt.minus(reduction).toNumber();

      plot.fertilized.push(itemType);

      setHasChange(botId);

      const reducedMinutes = reduction.div(60000).round(0, 0).toNumber();

      return {
        success: true,
        message: `Đã bón ${item.name}, giảm ${reducedMinutes} phút thời gian phát triển!`,
        plotIndex,
      };

    default:
      return { success: false, message: "Không thể sử dụng vật phẩm này!", plotIndex };
  }
}

export async function handleWaterPlotCommand(api, message, farm, args) {
  const threadId = message.threadId;
  const botId = api.getBotId();
  const prefix = getGlobalPrefix(botId);

  if (args.length < 2) {
    await api.sendMessage(
      {
        msg: `Vui lòng nhập số ô đất cần tưới nước. Ví dụ:\n${prefix}nongtrai tuoinuoc 1-4\n${prefix}nongtrai tuoinuoc 1 3-5 7`,
        quote: message,
      },
      threadId,
      message.type
    );
    return;
  }

  const plotIndexesToWater = parseSlotRanges(args.slice(1).join(" "));
  let waterResults = [];
  let waterSuccessCount = 0;

  for (const plotIndex of plotIndexesToWater) {
    const waterResult = await waterPlot(botId, farm, plotIndex);
    waterResults.push(waterResult);
    if (waterResult.success) waterSuccessCount++;
  }

  let waterResultMsg = `💧 KẾT QUẢ TƯỚI NƯỚC 💧\n\n`;
  waterResultMsg += groupConsecutiveResults(waterResults);
  waterResultMsg += `\n\n📊 THỐNG KÊ:\n`;
  waterResultMsg += `- Đã tưới thành công: ${waterSuccessCount}/${plotIndexesToWater.length} ô\n`;

  await sendFarmImage(api, message, farm, waterResultMsg);
}

export async function handleCuocDatCommand(api, message, farm, args) {
  const threadId = message.threadId;
  const botId = api.getBotId();
  const prefix = getGlobalPrefix(botId);
  const senderId = message.data.uidFrom;

  if (args.length < 2) {
    await api.sendMessage(
      {
        msg: `Vui lòng nhập số ô đất cần cuốc. Ví dụ:\n${prefix}nongtrai cuocdat 1-4\n${prefix}nongtrai cuocdat 1 3-5 7`,
        quote: message,
      },
      threadId,
      message.type
    );
    return;
  }

  const plotIndexesToDig = parseSlotRanges(args.slice(1).join(" "));
  let digResults = [];
  let digSuccessCount = 0;

  for (const plotIndex of plotIndexesToDig) {
    const digResult = await digSoil(botId, farm, plotIndex);
    digResults.push(digResult);
    if (digResult.success) digSuccessCount++;
  }

  let digResultMsg = `⛏️ KẾT QUẢ CUỐC ĐẤT ⛏️\n\n`;
  digResultMsg += groupConsecutiveResults(digResults);
  digResultMsg += `\n\n📊 THỐNG KÊ:\n`;
  digResultMsg += `- Đã cuốc thành công: ${digSuccessCount}/${plotIndexesToDig.length} ô\n`;
  if (farm.bag["S1"]) {
    digResultMsg += `- Cuốc còn lại: ${farm.bag["S1"]} cái\n`;
  }

  await sendFarmImage(api, message, farm, digResultMsg);
}

export async function handleUseItemCommand(api, message, farm, args) {
  const threadId = message.threadId;
  const senderId = message.data.uidFrom;
  const botId = api.getBotId();
  const prefix = getGlobalPrefix(botId);

  if (args.length < 3) {
    await api.sendMessage(
      {
        msg: `Vui lòng nhập mã vật phẩm và số ô đất. Ví dụ:\n${prefix}nongtrai use W1 1-4\n${prefix}nongtrai use L1 1 3-5 7`,
        quote: message,
      },
      threadId,
      message.type
    );
    return;
  }

  const useItemType = args[1].toUpperCase();
  const plotIndexesToUse = parseSlotRanges(args.slice(2).join(" "));

  // Lấy thông tin sản phẩm từ PRODUCT_CODES
  const useProduct = PRODUCT_CODES[useItemType];
  if (!useProduct) {
    await api.sendMessage({ msg: "Mã sản phẩm không hợp lệ!", quote: message, ttl: TIME_TO_LIVE }, threadId, message.type);
    return;
  }

  // Kiểm tra số lượng vật phẩm
  const itemQuantity = farm.bag[useItemType] || 0;
  if (itemQuantity < plotIndexesToUse.length) {
    const itemName = useProduct.type === "CROP" ? CROPS[useProduct.key].name : SHOP_ITEMS[useProduct.key].name;
    await api.sendMessage(
      { msg: `Bạn chỉ có ${itemQuantity} ${itemName}, không đủ để dùng cho ${plotIndexesToUse.length} ô!`, quote: message },
      threadId,
      message.type
    );
    return;
  }

  let useResults = [];
  let useSuccessCount = 0;

  for (const plotIndex of plotIndexesToUse) {
    if (!farm.plots[plotIndex]) {
      useResults.push({
        success: false,
        message: "Ô đất không tồn tại!",
        plotIndex,
      });
      continue;
    }

    let useResult;
    if (useProduct.type === "CROP") {
      useResult = await plantCrop(botId, farm, plotIndex, useItemType, senderId);
    } else {
      useResult = await useItem(botId, farm.plots[plotIndex], useProduct.key, farm, plotIndex, senderId);
    }

    useResults.push(useResult);
    if (useResult.success) {
      useSuccessCount++;
      await updatePlayerBagHasSetting(botId, farm, useItemType, -1);
    }
  }

  let useResultMsg = `🛠️ KẾT QUẢ SỬ DỤNG VẬT PHẨM 🛠️\n\n`;
  useResultMsg += groupConsecutiveResults(useResults);
  useResultMsg += `\n\n📊 THỐNG KÊ:\n`;
  useResultMsg += `- Đã sử dụng thành công: ${useSuccessCount}/${plotIndexesToUse.length} ô\n`;
  useResultMsg += `- ${useProduct.type === "CROP" ? "Hạt giống" : "Vật phẩm"} còn lại: ${farm.bag[useItemType] || 0} cái\n`;

  await sendFarmImage(api, message, farm, useResultMsg);
}

export async function handleGieoHatCommand(api, message, farm, args) {
  const threadId = message.threadId;
  const senderId = message.data.uidFrom;
  const botId = api.getBotId();
  const prefix = getGlobalPrefix(botId);

  if (args.length >= 2) {
    // Nếu có đối số thì xử lý trồng cây
    const cropCode = args[1].toUpperCase();
    const plotIndexes = parseSlotRanges(args.slice(2).join(" "));

    if (plotIndexes.length === 0) {
      await api.sendMessage(
        { msg: `Vui lòng nhập số ô đất cần trồng. Ví dụ: ${prefix}nongtrai gieohat L1 1 2 3 4-10`, quote: message },
        threadId,
        message.type
      );
      return;
    }

    // Kiểm tra mã hạt giống
    const productInfo = PRODUCT_CODES[cropCode];
    if (!productInfo || productInfo.type !== "CROP") {
      await api.sendMessage({ msg: "Mã hạt giống không hợp lệ!", quote: message }, threadId, message.type);
      return;
    }

    // Kiểm tra số lượng hạt giống
    const seedCount = farm.bag[cropCode] || 0;
    if (seedCount < plotIndexes.length) {
      await api.sendMessage(
        {
          msg: `Bạn chỉ có ${seedCount} hạt giống ${CROPS[productInfo.key].name}, không đủ để trồng ${plotIndexes.length} ô!`,
          quote: message,
        },
        threadId,
        message.type
      );
      return;
    }

    // Kết quả trồng từng ô
    let farmResults = [];
    let successCount = 0;

    for (const plotIndex of plotIndexes) {
      const plantResult = await plantCrop(botId, farm, plotIndex, cropCode, senderId);
      farmResults.push(plantResult);
      if (plantResult.success) successCount++;
    }

    let resultMsg = `🌱 KẾT QUẢ TRỒNG CÂY 🌱\n\n`;
    resultMsg += groupConsecutiveResults(farmResults);

    // Thêm thống kê vào cuối thông báo
    const cropInfo = CROPS[productInfo.key];
    resultMsg += `\n📊 THỐNG KÊ:\n`;
    resultMsg += `- Đã trồng thành công: ${successCount}/${plotIndexes.length} ô\n`;
    resultMsg += `- Loại cây: ${cropInfo.icon} ${cropInfo.name}\n`;
    resultMsg += `- Hạt giống còn lại: ${farm.bag[cropCode] || 0} hạt\n`;

    await sendFarmImage(api, message, farm, resultMsg);
  } else {
    // Nếu không có đối số thì hiển thị danh sách hạt giống trong túi
    const seeds = [];
    for (const [itemCode, quantity] of Object.entries(farm.bag)) {
      const productInfo = PRODUCT_CODES[itemCode];
      if (productInfo && productInfo.type === "CROP") {
        const cropInfo = CROPS[productInfo.key];
        seeds.push(`${cropInfo.icon} [${itemCode}] ${cropInfo.name}: ${quantity} hạt`);
      }
    }

    let msg = "🌱 HẠT GIỐNG TRONG TÚI 🌱\n\n";
    if (seeds.length > 0) {
      msg += seeds.join("\n");
      msg += `\n\nCách sử dụng: ${prefix}nongtrai farm [mã hạt giống] [ô đất số.. cách nhau bằng dấu cách]`;
    } else {
      msg += "Bạn chưa có hạt giống nào trong túi!\nDùng lệnh !nongtrai shop để mua hạt giống.";
    }

    await api.sendMessage({ msg: msg, quote: message, ttl: TIME_TO_LIVE }, threadId, message.type);
  }
}

// Sửa lại hàm harvestCrop
async function harvestCrop(botId, farm, plotIndex, senderId) {
  const plot = farm.plots[plotIndex];

  if (!plot) {
    return { success: false, message: "Ô đất không tồn tại!", plotIndex };
  }

  if (!plot.crop) {
    return { success: false, message: "Không có cây để thu hoạch!", plotIndex };
  }

  const cropInfo = CROPS[plot.crop];
  const now = Date.now();
  const growthTime = plot.plantedAt + cropInfo.growthTime * 1000;

  if (now < growthTime) {
    const timeLeft = Math.ceil((growthTime - now) / 1000);
    return {
      success: false,
      message: `Cây chưa đủ thời gian thu hoạch!\nCòn ${formatSeconds(timeLeft)} nữa.`,
      plotIndex,
    };
  }

  const harvestCode = `${cropInfo.code}_TP`;
  await updatePlayerBagHasSetting(botId, farm, harvestCode, 1);

  plot.crop = null;
  plot.plantedAt = null;
  plot.fertilized = [];
  
  setHasChange(botId);

  return {
    success: true,
    message: `Thu hoạch thành công ${cropInfo.icon} ${cropInfo.name}!`,
    product: {
      name: cropInfo.name,
      icon: cropInfo.icon,
      code: harvestCode,
    },
    plotIndex,
  };
}

export async function handleHarvestCommand(api, message, farm, args) {
  const threadId = message.threadId;
  const senderId = message.data.uidFrom;
  const botId = api.getBotId();
  const prefix = getGlobalPrefix(botId);

  if (args.length < 2) {
    await api.sendMessage(
      {
        msg: `Vui lòng nhập số ô đất cần thu hoạch. Ví dụ:\n${prefix}nongtrai thuhoach 1-4\n${prefix}nongtrai thuhoach 1 3-5 7`,
        quote: message,
      },
      threadId,
      message.type
    );
    return;
  }

  const plotIndexesToHarvest = parseSlotRanges(args.slice(1).join(" "));
  let harvestResults = [];
  let harvestSuccessCount = 0;
  let harvestedProducts = {};

  for (const plotIndex of plotIndexesToHarvest) {
    const harvestResult = await harvestCrop(botId, farm, plotIndex, senderId);
    harvestResults.push(harvestResult);
    if (harvestResult.success) {
      harvestSuccessCount++;
      if (harvestResult.product) {
        harvestedProducts[harvestResult.product.name] = (harvestedProducts[harvestResult.product.name] || 0) + 1;
      }
    }
  }

  let harvestResultMsg = `🌾 KẾT QUẢ THU HOẠCH 🌾\n\n`;
  harvestResultMsg += groupConsecutiveResults(harvestResults);
  harvestResultMsg += `\n\n📊 THỐNG KÊ:\n`;
  harvestResultMsg += `- Đã thu hoạch thành công: ${harvestSuccessCount}/${plotIndexesToHarvest.length} ô\n`;
  if (Object.keys(harvestedProducts).length > 0) {
    harvestResultMsg += `- Sản phẩm thu được:\n`;
    for (const [name, count] of Object.entries(harvestedProducts)) {
      harvestResultMsg += `  • ${name}: ${count}\n`;
    }
  }

  await sendFarmImage(api, message, farm, harvestResultMsg);
}
