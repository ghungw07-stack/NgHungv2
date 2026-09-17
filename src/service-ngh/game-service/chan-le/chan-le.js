import { getGameMentionUid } from "../../../utils/game-mentions.js";
import chalk from "chalk";
import Big from "big.js";
import { updatePlayerBalance, getPlayerBalance, addGameRankPoints } from "../../../database/player.js";
import { nameServer } from "../../../database/index.js";
import { checkBeforeJoinGame } from "../index.js";
import { formatCurrency, parseGameAmount } from "../../../utils/format-util.js";
import { getGlobalPrefix } from "../../service.js";
import { createChanLeResultImage } from "./cv-chan-le.js";
import { clearImagePath } from "../../../utils/canvas/index.js";
import { gameState } from "../game-manager.js";
import { DEFAULT_JACKPOT, getGameJackpotKey, getGameJackpot, setGameJackpot, addGameJackpot } from "../jackpot-default.js";

const CHOICES = {
  CHAN: {
    name: "Chẵn",
    key: "chan",
    emoji: "⚪",
    aliases: ["chan", "chẵn", "chẳn", "chăn", "chắn", "c", "CHAN", "CHẴN", "CHẲN", "CHĂN", "CHẮN", "C"],
  },
  LE: {
    name: "Lẻ",
    key: "le",
    emoji: "⚫",
    aliases: ["le", "lẻ", "lẽ", "lẻ", "l", "LE", "LẺ", "LẼ", "LẺ", "L"],
  },
};

// Thay đổi phần random số thành lắc xúc sắc
const DICE_FACES = 6; // Mỗi xúc sắc có 6 mặt

// Thêm hàm lắc xúc sắc
function rollDice() {
  return Math.floor(Math.random() * DICE_FACES) + 1;
}

// Thêm hàm khởi tạo
export async function initializeGameChanLe() {
  try {
    if (!gameState.data.chanle) gameState.data.chanle = {};
    if (!gameState.data.chanle.jackpots) gameState.data.chanle.jackpots = {};
    if (!gameState.data.chanle.jackpot) gameState.data.chanle.jackpot = DEFAULT_JACKPOT;
    gameState.data.chanle.jackpot = new Big(gameState.data.chanle.jackpot);
    if (!gameState.data.chanle.history) gameState.data.chanle.history = [];
    console.log(chalk.magentaBright("Khởi động và nạp dữ liệu minigame chẵn lẻ hoàn tất"));
  } catch (error) {
    console.error("Lỗi khi khởi tạo dữ liệu chẵn lẻ:", error);
  }
}

// Thêm hàm lưu dữ liệu
function saveGameData() {
  gameState.changes.chanle = true;
}

// Thêm hàm lấy giá trị hũ hiện tại theo bot hoặc server riêng
export function getJackpot(key = "default") {
  return getGameJackpot(gameState, "chanle", key);
}

export function resetJackpot(key = null) {
  if (key) {
    setGameJackpot(gameState, "chanle", key, DEFAULT_JACKPOT);
  } else {
    gameState.data.chanle.jackpot = DEFAULT_JACKPOT;
    gameState.data.chanle.jackpots = {};
    saveGameData();
  }
  return new Big(DEFAULT_JACKPOT);
}

// Thêm biến lưu lịch sử
const MAX_HISTORY = 20; // Giữ tối đa 20 kết quả gần nhất

const WINNING_MULTIPLIER = 1.9; // Tỷ lệ tiền thắng cược
const MIN_JACKPOT_PERCENT = 0.0001; // 0.01% của hũ
const MAX_JACKPOT_MULTIPLIER = 1000; // Giới hạn 1000% tiền cược (x10 thành x1000)
const PLAYER_LOSS_RATE = 0.8;
const TTL_IMAGE = 10800000;

function getRandomJackpotContribution() {
  return (Math.floor(Math.random() * 30) + 30) / 100;
}

export async function handleChanLe(api, message, groupSettings) {
  if (!(await checkBeforeJoinGame(api, message, groupSettings, true))) return;

  const senderId = message.data.uidFrom;
  const threadId = message.threadId;
  const senderName = message.data.dName;

  const prefix = getGlobalPrefix(api.getBotId());
  const content = message.data.content.toLowerCase().replace(`${prefix}chanle`, "").replace(`${prefix}cl`, "").trim();

  const parts = content.split(/\s+/);
  if (parts.length !== 2) {
    await api.sendMessage(
      { msg: `Vui lòng đặt cược theo định dạng: ${prefix}chanle [chẵn/lẻ] [số tiền/all/10%/100k/1m/1b]`, quote: message, ttl: 600000 },
      threadId,
      message.type
    );
    return;
  }

  const playerChoice = normalizeChoice(parts[0]);
  if (!playerChoice) {
    const validChoices = [
      ...CHOICES.CHAN.aliases.slice(0, 5),
      ...CHOICES.LE.aliases.slice(0, 5),
    ].join(", ");

    await api.sendMessage(
      {
        msg: `Lựa chọn không hợp lệ.\nCác cách nhập hợp lệ: ${validChoices}`,
        quote: message,
        ttl: 600000,
      },
      threadId,
      message.type
    );
    return;
  }

  const balance = await getPlayerBalance(senderId);
  if (!balance.success) {
    await api.sendMessage({ msg: `${balance.message}`, quote: message }, threadId, message.type);
    return;
  }

  let betAmount;
  try {
    const parsedAmount = parseGameAmount(parts[1], balance.balance);
    if (parsedAmount === "allin") {
      betAmount = new Big(balance.balance);
    } else {
      betAmount = parsedAmount;
    }

    if (betAmount.lt(1000)) {
      await api.sendMessage({ msg: `Số tiền cược tối thiểu là 1,000 VNĐ`, quote: message, ttl: 600000 }, threadId, message.type);
      return;
    }
  } catch (error) {
    await api.sendMessage({ msg: `${error.message}`, quote: message }, threadId, message.type);
    return;
  }

  if (new Big(balance.balance).lt(betAmount)) {
    await api.sendMessage(
      { msg: `Số dư không đủ. Bạn chỉ có ${formatCurrency(new Big(balance.balance))} VNĐ`, quote: message, ttl: 600000 },
      threadId,
      message.type
    );
    return;
  }

  const expectedKey = Math.random() < PLAYER_LOSS_RATE ? (playerChoice.key === "chan" ? "le" : "chan") : playerChoice.key;
  const dice1 = rollDice(), dice2 = rollDice();
  let dice3 = rollDice();
  const rolledKey = (dice1 + dice2 + dice3) % 2 === 0 ? "chan" : "le";
  if (rolledKey !== expectedKey) dice3 = dice3 === DICE_FACES ? dice3 - 1 : dice3 + 1;
  const total = dice1 + dice2 + dice3;
  const result = total % 2 === 0 ? CHOICES.CHAN : CHOICES.LE;
  const isWin = result.key === playerChoice.key;
  const jackpotKey = getGameJackpotKey(api);

  // Ba mặt xúc xắc giống nhau là jackpot (1-1-1 đến 6-6-6), tỉ lệ nổ hũ 20%.
  const isTriple = dice1 === dice2 && dice2 === dice3;
  let isJackpot = isTriple && isWin && Math.random() < 0.20;
  let isMissedJackpot = false;

  let winnings;
  let jackpotAmount = new Big(0);

  if (isJackpot) {
    const currentPot = getGameJackpot(gameState, "chanle", jackpotKey);
    const maxJackpotWin = betAmount.mul(MAX_JACKPOT_MULTIPLIER);

    if (currentPot.gt(maxJackpotWin)) {
      jackpotAmount = maxJackpotWin;
      setGameJackpot(gameState, "chanle", jackpotKey, currentPot.minus(maxJackpotWin));
    } else {
      jackpotAmount = currentPot.gt(0) ? currentPot : new Big(0);
      setGameJackpot(gameState, "chanle", jackpotKey, DEFAULT_JACKPOT);
    }

    winnings = betAmount.mul(WINNING_MULTIPLIER).plus(jackpotAmount).round(0, Big.roundDown);
  } else {
    winnings = isWin ? betAmount.mul(WINNING_MULTIPLIER).round(0, Big.roundDown) : new Big(0);

    if (!isWin) {
      const contributionRate = getRandomJackpotContribution();
      let contribution = betAmount.mul(contributionRate);

      const pot = getGameJackpot(gameState, "chanle", jackpotKey);
      const minContribution = pot.mul(MIN_JACKPOT_PERCENT);
      if (contribution.lt(minContribution)) {
        contribution = minContribution;
      }

      addGameJackpot(gameState, "chanle", jackpotKey, contribution);
    }
  }

  const netWinnings = winnings.minus(betAmount).round(0, Big.roundDown);

  await updatePlayerBalance(senderId, netWinnings, isWin || isJackpot, isWin ? netWinnings : 0, {
    gameName: isJackpot ? "Chẵn Lẻ (NỔ HŨ)" : "Chẵn Lẻ",
    gameKey: isJackpot ? "chanle_hu" : "chanle",
    choice: playerChoice,
    betAmount: betAmount.toNumber(),
    detail: isJackpot ? `Nổ hũ 3 xúc xắc ${dice1}` : `Xúc xắc: ${dice1}-${dice2}-${dice3} (${total})`,
  });
  await addGameRankPoints(senderId, { won: isWin || isJackpot, jackpot: isJackpot });

  const currentJackpot = getGameJackpot(gameState, "chanle", jackpotKey);

  const resultMessage = formatResultMessage(
    senderName,
    playerChoice,
    result,
    [dice1, dice2, dice3],
    total,
    betAmount,
    winnings,
    netWinnings,
    balance.balance,
    new Big(balance.balance).plus(netWinnings),
    isJackpot,
    isMissedJackpot,
    jackpotAmount,
    currentJackpot
  );

  gameState.data.chanle.history.push({
    dice: [dice1, dice2, dice3],
    total: total,
    result: result.key,
    timestamp: Date.now(),
  });

  if (gameState.data.chanle.history.length > MAX_HISTORY) {
    gameState.data.chanle.history.shift();
  }

  saveGameData();

  let imagePath = null;
  try {
    imagePath = await createChanLeResultImage(
      [dice1, dice2, dice3],
      total,
      playerChoice.key,
      betAmount,
      isJackpot,
      gameState.data.chanle.history,
      winnings
    );

    await api.sendMessage(
      {
        msg: resultMessage,
        mentions: [{ pos: 2, uid: getGameMentionUid(message), len: senderName.length }],
        attachments: [imagePath],
        isUseProphylactic: true,
        ttl: TTL_IMAGE,
      },
      threadId,
      message.type
    );
  } catch (error) {
    console.error("Lỗi khi tạo và gửi ảnh kết quả:", error);
    await api.sendMessage(
      {
        msg: resultMessage,
        mentions: [{ pos: 2, uid: getGameMentionUid(message), len: senderName.length }],
        ttl: TTL_IMAGE,
      },
      threadId,
      message.type
    ).catch(() => {});
  } finally {
    await clearImagePath(imagePath);
  }
}

function normalizeChoice(choice) {
  choice = choice.trim();

  // Loại bỏ dấu cách thừa và ký tự đặc biệt
  choice = choice.replace(/\s+/g, "");

  // Chuyển đổi các ký tự có dấu thành không dấu để so sánh
  const normalizedChoice = choice.normalize("NFD").replace(/[\u0300-\u036f]/g, "");

  // Kiểm tra trong danh sách aliases của từng lựa chọn
  for (const [key, value] of Object.entries(CHOICES)) {
    if (
      value.aliases.some((alias) => alias.toLowerCase() === choice.toLowerCase() || alias.toLowerCase() === normalizedChoice.toLowerCase())
    ) {
      return value;
    }
  }

  return null;
}

function formatResultMessage(
  playerName,
  playerChoice,
  result,
  diceResults,
  total,
  betAmount,
  winnings,
  netWinnings,
  oldBalance,
  newBalance,
  isJackpot,
  isMissedJackpot,
  jackpotAmount,
  currentJackpot
) {
  // Emoji cho xúc sắc
  const diceEmoji = {
    1: "⚀",
    2: "⚁",
    3: "⚂",
    4: "⚃",
    5: "⚄",
    6: "⚅",
  };

  let message = `[ ${playerName} ]\n🎲 KẾT QUẢ CHẴN LẺ 🎲\n`;
  message += `• Đặt: ${playerChoice.name} ${playerChoice.emoji}\n`;
  message += `• Cược: ${formatCurrency(betAmount)} VNĐ\n\n`;

  if (isJackpot) {
    message += "🎰 NỔ HŨ 🎰\n";
    message += `💰 +${formatCurrency(jackpotAmount)} VNĐ 💰\n`;
    message += "🎉 CHÚC MỪNG BẠN ĐÃ THẮNG LỚN! 🎉\n\n";
  } else if (isMissedJackpot) {
    message += "😭 TRƯỢT HŨ 😭\n";
    message += "❌ Ra ba số giống nhau nhưng đặt sai kết quả!\n";
    message += `💸 -${formatCurrency(betAmount)} VNĐ\n\n`;
  } else if (netWinnings.gt(0)) {
    message += "🎉 THẮNG CƯỢC: ";
    message += `💰 +${formatCurrency(netWinnings)} VNĐ\n\n`;
  } else {
    message += "💸 THUA CƯỢC: ";
    message += `📉 -${formatCurrency(betAmount)} VNĐ\n\n`;
  }

  message += `💳 Số dư: ${formatCurrency(oldBalance)} → ${formatCurrency(newBalance)} VNĐ`;
  if (!isJackpot) message += `\n\n🎰 HŨ HIỆN TẠI: ${formatCurrency(currentJackpot)} VNĐ`;

  return message;
}
