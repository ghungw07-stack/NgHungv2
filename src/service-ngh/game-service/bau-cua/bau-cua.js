import { getGameMentionUid } from "../../../utils/game-mentions.js";
import { createCanvas, loadImage } from "canvas";
import path from "path";
import fs from "fs";
import chalk from "chalk";
import Big from "big.js";
import { updatePlayerBalance, getPlayerBalance, addGameRankPoints } from "../../../database/player.js";
import { nameServer } from "../../../database/index.js";
import { checkBeforeJoinGame } from "../index.js";
import { formatCurrency, normalizeSymbolName, parseGameAmount } from "../../../utils/format-util.js";
import { getGlobalPrefix } from "../../service.js";
import { clearImagePath } from "../../../utils/canvas/index.js";
import { gameState } from "../game-manager.js";
import { DEFAULT_JACKPOT, getGameJackpotKey, getGameJackpot, setGameJackpot, addGameJackpot } from "../jackpot-default.js";
import { getActiveCanvasStyle } from "../../../utils/canvas/theme.js";
import { renderCollectionStyle } from "../../../utils/canvas/collection-style-renderers.js";

const SYMBOLS = {
  BAU: {
    emoji: "🍐",
    name: "Bầu",
    key: "bau",
    icon: "bau",
  },
  CUA: {
    emoji: "🦀",
    name: "Cua",
    key: "cua",
    icon: "cua",
  },
  TOM: {
    emoji: "🦞",
    name: "Tôm",
    key: "tom",
    icon: "tom",
  },
  CA: {
    emoji: "🐟",
    name: "Cá",
    key: "ca",
    icon: "ca",
  },
  GA: {
    emoji: "🐓",
    name: "Gà",
    key: "ga",
    icon: "ga",
  },
  NAI: {
    emoji: "🦌",
    name: "Nai",
    key: "nai",
    icon: "nai",
  },
};

const TTL_IMAGE = 10800000;
const SYMBOL_LIST = Object.values(SYMBOLS).map((s) => s.emoji);
const SYMBOL_NAMES = Object.fromEntries(Object.values(SYMBOLS).map((s) => [s.emoji, s.name]));
const SYMBOL_EMOJIS = Object.fromEntries(Object.values(SYMBOLS).map((s) => [s.key, s.emoji]));
const SYMBOL_ICON_NAME = Object.fromEntries(Object.values(SYMBOLS).map((s) => [s.emoji, s.icon]));

const MAX_JACKPOT_MULTIPLIER = 1000;
const JACKPOT_CONTRIBUTION_PERCENT = 0.6;
const JACKPOT_CHANCE = 0.20; // Giảm tỉ lệ nổ hũ xuống 20%
const HOUSE_BIAS_CHANCE = 0.8;

function roundedRect(ctx, x, y, width, height, radius = 18) {
  ctx.beginPath(); ctx.roundRect(x, y, width, height, radius);
}

// Thêm hàm khởi tạo dữ liệu
export async function initializeGameBauCua() {
  try {
    if (!gameState.data.baucua) gameState.data.baucua = {};
    if (!gameState.data.baucua.jackpots) gameState.data.baucua.jackpots = {};
    if (!gameState.data.baucua.jackpot) gameState.data.baucua.jackpot = DEFAULT_JACKPOT;
    gameState.data.baucua.jackpot = new Big(gameState.data.baucua.jackpot);
    if (!gameState.data.baucua.history) gameState.data.baucua.history = [];

    console.log(chalk.magentaBright("Khởi động và nạp dữ liệu minigame bầu cua hoàn tất"));
  } catch (error) {
    console.error("Lỗi khi khởi tạo dữ liệu bầu cua:", error);
  }
}

// Thêm hàm lưu dữ liệu
async function saveGameData() {
  gameState.changes.baucua = true;
}

// Sửa đổi hàm xử lý lệnh bầu cua
export async function handleBauCua(api, message, groupSettings) {
  if (!(await checkBeforeJoinGame(api, message, groupSettings, true))) return;

  const senderId = message.data.uidFrom;
  const threadId = message.threadId;

  const prefix = getGlobalPrefix(api.getBotId());
  const content = message.data.content.toLowerCase().replace(`${prefix}baucua`, "").trim();

  const senderName = message.data.dName;
  let bets = {};
  const requestBalance = await getPlayerBalance(senderId);
  if (requestBalance.success) {
    try {
      bets = await parseBets(content, requestBalance.balance);
    } catch (error) {
      await api.sendMessage({ msg: `❌ ${error.message}`, quote: message,  ttl: 600000 }, threadId, message.type);
      return;
    }
  } else {
    await api.sendMessage({ msg: `${requestBalance.message}`, quote: message,  ttl: 600000 }, threadId, message.type);
    return;
  }

  if (Object.keys(bets).length === 0) {
    await api.sendMessage(
      { msg: `Vui lòng đặt cược theo định dạng: !baucua [loại] [số tiền]:[loại] [số tiền]...`, quote: message, ttl: 600000 },
      threadId,
      message.type
    );
    return;
  }

  const totalBet = Object.values(bets).reduce((sum, bet) => sum.plus(new Big(bet)), new Big(0));
  if (totalBet.lt(new Big(1000))) {
    await api.sendMessage({ msg: `❌ Mỗi lần cược tối thiểu 1000 VNĐ.`, quote: message }, threadId, message.type);
    return;
  }

  const requestData = await getPlayerBalance(senderId);
  const status = requestData.success ? "✅" : "❌";

  if (requestData.success) {
    const bigNumBalance = new Big(requestData.balance);
    if (bigNumBalance.lt(totalBet)) {
      await api.sendMessage(
        { msg: `${status} Số dư không đủ. Bạn chỉ có ${formatCurrency(bigNumBalance)} VNĐ.`, quote: message,  ttl: 600000 },
        threadId,
        message.type
      );
      return;
    }
  } else {
    await api.sendMessage({ msg: `${status} ${requestData.message}`, quote: message,  ttl: 600000 }, threadId, message.type);
    return;
  }
  const currentBalance = new Big(requestData.balance);

  const jackpotKey = getGameJackpotKey(api);

  const result = rollDice(Object.keys(bets));
  const winnings = calculateWinnings(bets, result);
  let netWinnings = new Big(winnings).minus(totalBet);
  const isWin = netWinnings.gt(0);

  // Điều kiện nổ hũ Bầu Cua:
  // 1. Kết quả lắc ra 3 linh vật giống nhau (ví dụ: 3 gà, 3 cua, 3 tôm, 3 cá, 3 bầu, 3 nai)
  const isTriple = Array.isArray(result) && result.length === 3 && result[0] === result[1] && result[1] === result[2];
  const tripleSymbol = isTriple ? result[0] : null;

  // 2. Người chơi CÓ cược vào đúng linh vật triple đó mới nổ hũ
  const betOnTriple = Boolean(tripleSymbol && bets[tripleSymbol] && new Big(bets[tripleSymbol]).gt(0));

  // 3. Ra triple + cược đúng cửa → nổ hũ | Cược sai cửa → không nổ
  const isJackpot = betOnTriple;

  let jackpotAmount = new Big(0);
  if (isJackpot) {
    const currentPot = getGameJackpot(gameState, "baucua", jackpotKey);
    const tripleBet = new Big(bets[tripleSymbol]);
    const maxJackpotWin = tripleBet.mul(MAX_JACKPOT_MULTIPLIER);

    if (currentPot.gt(maxJackpotWin)) {
      jackpotAmount = maxJackpotWin;
      setGameJackpot(gameState, "baucua", jackpotKey, currentPot.minus(maxJackpotWin));
    } else {
      jackpotAmount = currentPot.gt(0) ? currentPot : new Big(0);
      setGameJackpot(gameState, "baucua", jackpotKey, DEFAULT_JACKPOT);
    }

    // Tiền trúng hũ cộng vào lợi nhuận
    netWinnings = netWinnings.plus(jackpotAmount);
  }

  // Sau khi tính netWinnings, nếu người chơi thua thì góp 60% số tiền thua vào hũ của bot / server riêng này
  if (netWinnings.lt(0)) {
    const contribution = netWinnings.abs().mul(JACKPOT_CONTRIBUTION_PERCENT);
    addGameJackpot(gameState, "baucua", jackpotKey, contribution);
  }

  // Cập nhật số dư người chơi với tổng tiền thắng/thua
  await updatePlayerBalance(senderId, netWinnings, isWin || isJackpot, isWin || isJackpot ? netWinnings : 0, {
    gameName: isJackpot ? "Bầu Cua (NỔ HŨ)" : "Bầu Cua",
    gameKey: isJackpot ? "baucua_hu" : "baucua",
    choice: Object.keys(bets).map((symbol) => SYMBOL_NAMES[symbol] || symbol).join(", "),
    betAmount: totalBet.toNumber(),
    detail: isJackpot ? `Nổ hũ 3 ${SYMBOL_NAMES[tripleSymbol] || tripleSymbol}` : `Kết quả: ${result.join("-")}`,
  });
  await addGameRankPoints(senderId, { won: isWin || isJackpot, jackpot: isJackpot });

  // Lưu dữ liệu game
  await saveGameData();

  const currentBalanceTotal = currentBalance.plus(netWinnings);
  const currentJackpot = getGameJackpot(gameState, "baucua", jackpotKey);

  const resultMessage = formatResultMessage(
    senderName,
    result,
    bets,
    winnings,
    netWinnings,
    currentBalance,
    currentBalanceTotal,
    isJackpot,
    jackpotAmount,
    currentJackpot
  );

  // Tạo hình ảnh kết quả
  const resultImagePath = await createResultImage(result);

  // Gửi kết quả kèm hình ảnh
  await api.sendMessage(
    {
      msg: resultMessage,
      mentions: [{ pos: 2, uid: getGameMentionUid(message), len: senderName.length }],
      attachments: [resultImagePath],
      isUseProphylactic: true,
      ttl: TTL_IMAGE,
    },
    threadId,
    message.type
  );

  // Xóa file ảnh tạm sau khi gửi
  await clearImagePath(resultImagePath);
}

// Sửa đổi hàm parseBets
async function parseBets(content, currentBalance) {
  const bets = {};
  const allInBets = [];
  const betPairs = content.split(":");
  let remainingBalance = new Big(currentBalance);
  let insufficientFunds = false;

  for (const pair of betPairs) {
    const [type, amountBet] = pair.trim().split(" ");
    let emoji = null;
    let normalizedType = null;
    let amount = null;

    if (!amountBet) {
      const match = pair.trim().match(/^([a-zà-ỹ]+)(\d+%|\d+k|\d+m|\d+b|\d+|all|allin)$/i);
      if (!match) continue;

      const [, type, amountBet] = match;
      normalizedType = normalizeSymbolName(type);
      emoji = SYMBOL_EMOJIS[normalizedType];
      amount = amountBet;
    } else {
      normalizedType = normalizeSymbolName(type);
      emoji = SYMBOL_EMOJIS[normalizedType];
      amount = amountBet;
    }

    if (emoji) {
      try {
        const parsedAmount = parseGameAmount(amount, currentBalance);

        if (parsedAmount === "allin") {
          allInBets.push(emoji);
        } else {
          if (parsedAmount.gt(remainingBalance)) {
            insufficientFunds = true;
            break;
          }
          bets[emoji] = parsedAmount;
          remainingBalance = remainingBalance.minus(parsedAmount);
        }
      } catch (error) {
        throw new Error(error.message);
      }
    }
  }

  if (insufficientFunds) {
    throw new Error(`Số dư không đủ. Bạn chỉ có ${formatCurrency(new Big(currentBalance))} VNĐ.`);
  }

  if (allInBets.length > 0) {
    const allInAmount = remainingBalance.div(allInBets.length).round(0, Big.roundDown);
    for (const emoji of allInBets) {
      bets[emoji] = (bets[emoji] || new Big(0)).plus(allInAmount);
      remainingBalance = remainingBalance.minus(allInAmount);
    }

    if (remainingBalance.gt(0) && allInBets.length > 0) {
      bets[allInBets[0]] = bets[allInBets[0]].plus(remainingBalance);
    }
  }

  return bets;
}

function rollDice(playerBets) {
  const randomRoll = () => Array.from({ length: 3 }, () => SYMBOL_LIST[Math.floor(Math.random() * SYMBOL_LIST.length)]);
  const isTripleResult = (r) => r.length === 3 && r[0] === r[1] && r[1] === r[2];

  if (Math.random() >= HOUSE_BIAS_CHANCE) return randomRoll();

  // Chọn trong nhiều lượt lắc hợp lệ kết quả có nghĩa vụ trả thưởng thấp nhất.
  // Triple bị loại trừ khỏi house bias — vì khi triple, hũ sẽ trả thay (không thiệt house).
  // Chỉ xét chính vé cược hiện tại, tuyệt đối không đọc số dư người chơi.
  let bestResult = randomRoll();
  let bestPayout = calculateWinnings(playerBets, bestResult);
  for (let attempt = 1; attempt < 24; attempt++) {
    const candidate = randomRoll();
    if (isTripleResult(candidate)) continue; // Không tránh triple — để jackpot xử lý
    const payout = calculateWinnings(playerBets, candidate);
    if (payout.lt(bestPayout) && !isTripleResult(bestResult)) {
      bestResult = candidate;
      bestPayout = payout;
    }
  }
  return bestResult;
}

function calculateWinnings(bets, result) {
  let winnings = new Big(0);
  for (const [symbol, amount] of Object.entries(bets)) {
    const count = result.filter((s) => s === symbol).length;
    if (count > 0) {
      winnings = winnings.plus(new Big(amount).mul(new Big(1).plus(new Big(0.95).mul(count))));
    }
  }
  return winnings.round(0, Big.roundDown);
}

function formatResultMessage(
  senderName,
  result,
  bets,
  winnings,
  netWinnings,
  currentBalance,
  currentBalanceTotal,
  isJackpot,
  jackpotAmount,
  currentJackpot
) {
  let message = "";
  message += `[ ${senderName} ] đã đặt:\n`;
  for (const [symbol, amount] of Object.entries(bets)) {
    const isWin = result.includes(symbol);
    message += `${SYMBOL_NAMES[symbol]}: ${formatCurrency(new Big(amount))} VNĐ (${isWin ? "Win" : "Lose"})\n`;
  }

  message += `Tổng thắng: ${formatCurrency(new Big(winnings))} VNĐ\n`;

  if (isJackpot) {
    message += `🎉 NỔ HŨ 🎉\n`;
    message += `Tiền trúng hũ: +${formatCurrency(jackpotAmount)} VNĐ\n`;
  }

  if (netWinnings.gt(0)) {
    message += `Lợi nhuận: +${formatCurrency(netWinnings)} VNĐ 🎉`;
  } else {
    message += `Thua lỗ: ${formatCurrency(netWinnings)} VNĐ 😢`;
  }
  if (!isJackpot) {
    message += `\nHũ hiện tại: ${formatCurrency(currentJackpot)} VNĐ 💰`;
  }
  message += `\n\nSố dư biến động: ${formatCurrency(currentBalance)} -> ${formatCurrency(currentBalanceTotal)} VNĐ`;

  return message;
}

async function createResultImage(result) {
  const activeStyle = getActiveCanvasStyle();
  if (activeStyle !== 1) {
    return createBauCuaV2Image(result);
    /* const images = await Promise.all(result.map(async (symbol) => {
      try {
        const imagePath = path.join(process.cwd(), "src", "service-ngh", "game-service", "bau-cua", "image", `${SYMBOL_ICON_NAME[symbol].toLowerCase()}.png`);
        return fs.existsSync(imagePath) ? await loadImage(imagePath) : null;
      } catch { return null; }
    }));
    return renderCollectionStyle(activeStyle, {
      kicker: "MYBOT • BẦU CUA LIVE",
      title: "KẾT QUẢ BẦU CUA",
      subtitle: result.map((symbol) => SYMBOL_NAMES[symbol]).join(" • "),
      footer: "Ba linh vật của phiên vừa mở",
      items: result.map((symbol, index) => ({
        title: SYMBOL_NAMES[symbol] || symbol,
        subtitle: `Ô kết quả ${index + 1}`,
        meta: SYMBOL_ICON_NAME[symbol]?.toUpperCase() || "RESULT",
        image: images[index],
        badge: String(index + 1).padStart(2, "0"),
      })),
    }, "baucua_result"); */
  }
  const imageWidth = 400;
  const imageHeight = 400;
  const canvasWidth = imageWidth * 3;
  const canvasHeight = imageHeight;

  const canvas = createCanvas(canvasWidth, canvasHeight);
  const ctx = canvas.getContext("2d");

  // Vẽ nền
  ctx.fillStyle = "#f0f0f0";
  ctx.fillRect(0, 0, canvasWidth, canvasHeight);

  for (let i = 0; i < result.length; i++) {
    const symbol = result[i];
    const imagePath = path.join(
      process.cwd(),
      "src",
      "service-ngh",
      "game-service",
      "bau-cua",
      "image",
      `${SYMBOL_ICON_NAME[symbol].toLowerCase()}.png`
    );

    if (fs.existsSync(imagePath)) {
      const img = await loadImage(imagePath);
      ctx.drawImage(img, i * imageWidth, 0, imageWidth, imageHeight);
    } else {
      console.error(`Không tìm thấy hình ảnh cho ${SYMBOL_NAMES[symbol]}`);
    }
  }

  // Lưu canvas thành file ảnh
  const filePath = path.resolve(`./assets/temp/baucua_result_${Date.now()}.png`);
  const out = fs.createWriteStream(filePath);
  const stream = canvas.createPNGStream();
  stream.pipe(out);

  return new Promise((resolve, reject) => {
    out.on("finish", () => resolve(filePath));
    out.on("error", reject);
  });
}

async function createBauCuaV2Image(result) {
  const width = 900, height = 1200, canvas = createCanvas(width, height), ctx = canvas.getContext("2d");
  const gold = "#e8c86c", bg = ctx.createLinearGradient(0, 0, width, height);
  bg.addColorStop(0, "#160b08"); bg.addColorStop(.45, "#4a160d"); bg.addColorStop(1, "#090807"); ctx.fillStyle = bg; ctx.fillRect(0, 0, width, height);
  roundedRect(ctx, 22, 22, width - 44, height - 44, 32); ctx.strokeStyle = "rgba(232,200,108,.72)"; ctx.lineWidth = 3; ctx.stroke();
  ctx.textAlign = "center"; ctx.textBaseline = "middle"; ctx.fillStyle = gold; ctx.font = "bold 38px sans-serif"; ctx.fillText("BẦU CUA TÔM CÁ", 450, 70);
  ctx.fillStyle = "rgba(255,255,255,.58)"; ctx.font = "bold 16px sans-serif"; ctx.fillText("KẾT QUẢ PHIÊN VỪA MỞ", 450, 103);
  const iconFor = async (symbol) => { const file = path.join(process.cwd(), "src", "service-ngh", "game-service", "bau-cua", "image", `${SYMBOL_ICON_NAME[symbol]?.toLowerCase()}.png`); try { return await loadImage(file); } catch { return null; } };
  const allSymbols = Object.values(SYMBOLS), allIcons = await Promise.all(allSymbols.map((s) => iconFor(s.emoji))), resultNames = result.map(symbol => SYMBOL_NAMES[symbol] || symbol);
  ctx.beginPath(); ctx.arc(450, 255, 154, 0, Math.PI * 2); ctx.fillStyle = "#c84a18"; ctx.fill(); ctx.strokeStyle = gold; ctx.lineWidth = 12; ctx.stroke(); ctx.beginPath(); ctx.arc(450, 255, 130, 0, Math.PI * 2); ctx.fillStyle = "#ffb21c"; ctx.fill(); ctx.strokeStyle = "#ffe6a0"; ctx.lineWidth = 4; ctx.stroke();
  for (let i = 0; i < result.length; i++) { const icon = await iconFor(result[i]); if (icon) { const p = [[-48, -34], [48, -8], [0, 48]][i] || [0, 0]; ctx.drawImage(icon, 420 + p[0], 225 + p[1], 60, 60); } }
  ctx.fillStyle = "#fff4bc"; ctx.font = "bold 18px sans-serif"; ctx.fillText(resultNames.join(" • "), 450, 405);
  const cardW = 260, cardH = 220, gap = 22, left = 48, top = 450;
  allSymbols.forEach((symbol, index) => { const col = index % 3, row = Math.floor(index / 3), x = left + col * (cardW + gap), y = top + row * (cardH + gap), hit = result.includes(symbol.emoji); roundedRect(ctx, x, y, cardW, cardH, 24); ctx.fillStyle = hit ? "rgba(205,63,35,.82)" : "rgba(22,12,12,.76)"; ctx.fill(); ctx.strokeStyle = hit ? "#ffdd70" : "rgba(232,200,108,.38)"; ctx.lineWidth = hit ? 4 : 2; ctx.stroke(); if (allIcons[index]) ctx.drawImage(allIcons[index], x + 75, y + 25, 110, 110); ctx.fillStyle = hit ? "#fff1a2" : "#e8d8b0"; ctx.font = "bold 25px sans-serif"; ctx.fillText(symbol.name.toUpperCase(), x + cardW / 2, y + 165); ctx.fillStyle = "rgba(255,255,255,.54)"; ctx.font = "bold 15px sans-serif"; ctx.fillText(hit ? "XUẤT HIỆN" : "CỬA CƯỢC", x + cardW / 2, y + 193); });
  roundedRect(ctx, 48, 970, 804, 112, 22); ctx.fillStyle = "rgba(3,3,3,.66)"; ctx.fill(); ctx.strokeStyle = "rgba(232,200,108,.5)"; ctx.stroke(); ctx.fillStyle = gold; ctx.font = "bold 17px sans-serif"; ctx.fillText("KẾT QUẢ", 450, 1000); ctx.fillStyle = "#fff8df"; ctx.font = "bold 30px sans-serif"; ctx.fillText(resultNames.join("  •  "), 450, 1042);
  const filePath = path.resolve(`./assets/temp/baucua_result_v2_${Date.now()}.png`); await new Promise((resolve, reject) => { const out = fs.createWriteStream(filePath); canvas.createPNGStream().pipe(out); out.on("finish", resolve); out.on("error", reject); }); return filePath;
}

// Thêm hàm để lấy giá trị hũ hiện tại theo bot hoặc server riêng
export function getJackpot(key = "default") {
  return getGameJackpot(gameState, "baucua", key);
}

export function resetJackpot(key = null) {
  if (key) {
    setGameJackpot(gameState, "baucua", key, DEFAULT_JACKPOT);
  } else {
    gameState.data.baucua.jackpot = DEFAULT_JACKPOT;
    gameState.data.baucua.jackpots = {};
    saveGameData();
  }
  return new Big(DEFAULT_JACKPOT);
}
