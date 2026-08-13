import { updatePlayerBalance, getPlayerBalance, addGameRankPoints } from "../../../database/player.js";
import { isHaveLoginAccount, nameServer } from "../../../database/index.js";
import { checkBeforeJoinGame, checkPlayerBanned } from "../index.js";
import { formatCurrency, parseGameAmount } from "../../../utils/format-util.js";
import { getGlobalPrefix } from "../../service.js";
import Big from "big.js";
import { createKBBResultImage } from "../../../utils/canvas/keobuabao.js";
import { clearImagePath } from "../../../utils/canvas/index.js";

const CHOICES = {
  KEO: {
    emoji: "✌️",
    name: "Kéo",
    key: "keo",
    beats: "bao",
  },
  BUA: {
    emoji: "✊",
    name: "Búa",
    key: "bua",
    beats: "keo",
  },
  BAO: {
    emoji: "🖐️",
    name: "Bao",
    key: "bao",
    beats: "bua",
  },
};

const TTL_IMAGE = 10800000;

export async function handleKBBCommand(api, message, groupSettings) {
  if (!(await checkBeforeJoinGame(api, message, groupSettings, true))) return;

  const senderId = message.data.uidFrom;
  const threadId = message.threadId;

  const prefix = getGlobalPrefix(api.getBotId());
  const content = message.data.content.toLowerCase().replace(`${prefix}kbb`, "").replace(`${prefix}keobuabao`, "").trim();

  // Parse lựa chọn và số tiền cược
  const parts = content.split(/\s+/);
  if (parts.length !== 2) {
    await api.sendMessage(
      { msg: `Vui lòng đặt cược theo định dạng: !kbb [kéo/búa/bao] [số tiền/all/10%/100k/1m/1b]`, quote: message, ttl: 30000 },
      threadId,
      message.type
    );
    return;
  }

  const playerChoice = normalizeChoice(parts[0]);
  if (!playerChoice) {
    await api.sendMessage(
      { msg: `Lựa chọn không hợp lệ. Vui lòng chọn: kéo, búa hoặc bao`, quote: message, ttl: 30000 },
      threadId,
      message.type
    );
    return;
  }

  // Kiểm tra số dư trước
  const balance = await getPlayerBalance(senderId);
  if (!balance.success) {
    await api.sendMessage({ msg: `${balance.message}`, quote: message, ttl: 30000 }, threadId, message.type);
    return;
  }

  // Parse số tiền cược với hàm mới
  let betAmount;
  try {
    const parsedAmount = parseGameAmount(parts[1], balance.balance);
    if (parsedAmount === 'allin') {
      betAmount = new Big(balance.balance);
    } else {
      betAmount = parsedAmount;
    }

    if (betAmount.lt(1000)) {
      await api.sendMessage({ msg: `Số tiền cược tối thiểu là 1,000 VNĐ`, quote: message, ttl: 30000 }, threadId, message.type);
      return;
    }
  } catch (error) {
    await api.sendMessage({ msg: `${error.message}`, quote: message, ttl: 30000 }, threadId, message.type);
    return;
  }

  // Kiểm tra số dư đủ không
  if (new Big(balance.balance).lt(betAmount)) {
    await api.sendMessage(
      { msg: `Số dư không đủ. Bạn chỉ có ${formatCurrency(new Big(balance.balance))} VNĐ`, quote: message, ttl: 30000 },
      threadId,
      message.type
    );
    return;
  }

  // Bot random lựa chọn
  const botChoice = randomChoice(playerChoice);

  // Tính kết quả
  const result = calculateResult(playerChoice, botChoice);
  const winnings = calculateWinnings(betAmount, result);
  const netWinnings = winnings.minus(betAmount);

  // Cập nhật số dư
  await updatePlayerBalance(senderId, netWinnings, result === "win");
  await addGameRankPoints(senderId, { won: result === "win" });

  // Format tin nhắn kết quả
  const resultMessage = formatResultMessage(
    message.data.dName,
    playerChoice,
    botChoice,
    result,
    betAmount,
    winnings,
    netWinnings,
    balance.balance,
    new Big(balance.balance).plus(netWinnings)
  );

  // Tạo ảnh kết quả
  const imagePath = await createKBBResultImage(playerChoice, botChoice, betAmount, result);

  if (imagePath) {
    // Gửi kết quả kèm ảnh
    await api.sendMessage(
      {
        msg: resultMessage,
        mentions: [{ pos: 2, uid: senderId, len: message.data.dName.length }],
        attachments: [imagePath],
        isUseProphylactic: true,
        ttl: TTL_IMAGE,
      },
      threadId,
      message.type
    );

    // Xóa file ảnh cache
    try {
      await clearImagePath(imagePath);
    } catch (error) {
      console.error("Lỗi khi xóa file cache:", error);
    }
  } else {
    // Fallback nếu không tạo được ảnh
    await api.sendMessage(
      {
        msg: resultMessage,
        mentions: [{ pos: 2, uid: senderId, len: message.data.dName.length }],
      },
      threadId,
      message.type
    );
  }
}

function normalizeChoice(choice) {
  choice = choice.toLowerCase().trim();
  for (const [key, value] of Object.entries(CHOICES)) {
    if (choice === value.key || choice === value.name.toLowerCase()) {
      return value;
    }
  }
  return null;
}

function randomChoice(playerChoice) {
  const rand = Math.random() * 100;
  
  if (rand < 35) {
    // 35% thua - trả về lựa chọn thắng playerChoice
    return Object.values(CHOICES).find(choice => choice.beats === playerChoice.key);
  } else if (rand < 70) {
    // 35% hòa - trả về cùng lựa chọn với player
    return playerChoice;
  } else {
    // 30% thắng - trả về lựa chọn thua playerChoice
    return Object.values(CHOICES).find(choice => playerChoice.beats === choice.key);
  }
}

function calculateResult(playerChoice, botChoice) {
  if (playerChoice.key === botChoice.key) return "draw";
  if (playerChoice.beats === botChoice.key) return "win";
  return "lose";
}

function calculateWinnings(betAmount, result) {
  switch (result) {
    case "win":
      return betAmount.mul(2);
    case "draw":
      return betAmount;
    case "lose":
      return new Big(0);
  }
}

function formatResultMessage(playerName, playerChoice, botChoice, result, betAmount, winnings, netWinnings, oldBalance, newBalance) {
  let message = `[ ${playerName} ] đã chọn ${playerChoice.name} ${playerChoice.emoji}\n`;
  message += `Bot chọn ${botChoice.name} ${botChoice.emoji}\n\n`;

  switch (result) {
    case "win":
      message += "🎉 Bạn đã thắng!\n";
      break;
    case "draw":
      message += "🤝 Hòa!\n";
      break;
    case "lose":
      message += "😢 Bạn đã thua!\n";
      break;
  }

  message += `Đặt cược: ${formatCurrency(betAmount)} VNĐ\n`;

  if (netWinnings.eq(0)) {
    message += `Hoàn Tiền: ${formatCurrency(betAmount)} VNĐ\n`;
  } else if (netWinnings.gt(0)) {
    message += `Tiền Thắng Cược: +${formatCurrency(netWinnings)} VNĐ 🎉\n`;
  } else {
    message += `Thua Lỗ: ${formatCurrency(netWinnings)} VNĐ 😢\n`;
  }

  if (!netWinnings.eq(0)) {
    message += `Số dư biến động: ${formatCurrency(new Big(oldBalance))} -> ${formatCurrency(new Big(newBalance))} VNĐ`;
  }

  return message;
}
