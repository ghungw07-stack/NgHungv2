import Big from "big.js";
import nodeFetch from "node-fetch";
import path from "path";
import fs from "fs";
import {
  claimDailyReward,
  getTopPlayers,
  getMyCard,
  isHaveLoginAccount,
  banPlayer,
  unbanPlayer,
  isPlayerBanned,
  ensurePlayerAccount,
  connection,
  NAME_TABLE_PLAYERS,
} from "../../database/index.js";
import {
  getPlayerBalance,
  updatePlayerBalance,
  getPlayerInfo,
  getAccountVND,
  updateAccountVND,
  setPlayerBalance,
  recordGameTransfer,
  getGameTransferHistory,
} from "../../database/player.js";
import { getUserInfoData } from "../info-service/user-info.js";
import { sendMessageFromSQL, sendMessageCompleteRequest } from "../../service-dqt/chat-zalo/chat-style/chat-style.js";
import * as cv from "../../utils/canvas/index.js";
import { isAdmin, isBotLeader } from "../../index.js";
import { getGlobalPrefix } from "../service.js";
import { formatBigNumber, formatCurrency, parseGameAmount, removeMention } from "../../utils/format-util.js";
import { sendReactionConfirmReceive } from "../../commands/command.js";

export async function checkBeforeJoinGame(api, message, groupSettings, checkLogin = true) {
  const threadId = message.threadId;
  const senderId = message.data.uidFrom;
  const isAdminBot = isAdmin(api.getBotId(), senderId, threadId);

  if (!connection) {
    if (isAdminBot) {
      const text =
        "Cơ sở dữ liệu chưa được khởi động,\n" + "vui lòng kết nối với cơ sở dữ liệu và khởi động lại bot rồi thử lại!";
      const result = {
        success: false,
        message: text,
      };
      await sendMessageFromSQL(api, message, result, true, 30000);
      return false;
    }
  }

  if (groupSettings) {
    const activeGame = groupSettings[threadId].activeGame;
    const isAdminLevelHighest = isAdmin(api.getBotId(), senderId);
    if (!isAdminLevelHighest && activeGame === false) {
      let text = "";
      if (isAdminBot) {
        text =
          "Trò chơi hiện tại không được kích hoạt trong nhóm này.\n\n" +
          "Quản trị viên hãy dùng lệnh !gameactive để kích hoạt tương tác game cho nhóm!";
        const result = {
          success: false,
          message: text,
        };
        await sendMessageFromSQL(api, message, result, true, 30000);
      }
      return false;
    }
  }

  if (await checkPlayerBanned(api, message, threadId, senderId)) {
    return false;
  }

  // Mọi lệnh game đều tự tạo hồ sơ theo UID Zalo; người chơi không cần đăng ký/đăng nhập.
  if (checkLogin) {
    if (!(await checkPlayerLogin(api, message, threadId, senderId))) {
      return false;
    }
  }

  await sendReactionConfirmReceive(api, message, 5);
  return true;
}

export async function handleClaimDailyReward(api, message, groupSettings) {
  if (!(await checkBeforeJoinGame(api, message, groupSettings, true))) return;

  const senderId = message.data.uidFrom;
  const result = await claimDailyReward(senderId);
  await sendMessageFromSQL(api, message, result, true, 30000);
}

export async function handleTopPlayers(api, message, groupSettings) {
  if (!(await checkBeforeJoinGame(api, message, groupSettings))) return;
  const botId = api.getBotId();

  const threadId = message.threadId;
  const topPlayers = await getTopPlayers(botId);
  // Admin cấp cao vẫn là người chơi hợp lệ và được xếp hạng theo số dư như
  // thành viên bình thường; quyền quản trị không loại họ khỏi BXH game.
  const rankedPlayers = topPlayers.map((player, index) => ({ ...player, rank: index + 1 }));
  const topTen = rankedPlayers.slice(0, 10);
  const playersWithAvatar = await Promise.all(
    topTen.map(async (player) => {
      try {
        const userInfo = await getUserInfoData(api, player.idUser);
        return { ...player, avatar: userInfo?.avatarFull || userInfo?.avatar || null };
      } catch {
        return { ...player, avatar: null };
      }
    })
  );
  const viewer = rankedPlayers.find((player) => String(player.idUser) === String(message.data.uidFrom));
  let viewerWithAvatar = viewer || null;
  if (viewer) {
    try {
      const userInfo = await getUserInfoData(api, viewer.idUser);
      viewerWithAvatar = { ...viewer, avatar: userInfo?.avatarFull || userInfo?.avatar || null };
    } catch {}
  }

  const imagePath = await cv.createGameRankImage(playersWithAvatar, "BẢNG XẾP HẠNG TÀI PHÚ", viewerWithAvatar);
  try {
    await api.sendMessage(
      { msg: "", attachments: imagePath ? [imagePath] : [], ttl: 300000, isUseProphylactic: true },
      threadId,
      message.type
    );
  } finally {
    await cv.clearImagePath(imagePath);
  }
}

export async function handleMyCard(api, message, groupSettings) {
  if (!(await checkBeforeJoinGame(api, message, groupSettings, true))) return;

  const senderId = message.data.uidFrom;
  const threadId = message.threadId;
  const mention = message.data.mentions?.[0];
  if (mention && !isAdmin(api.getBotId(), senderId)) {
    await sendMessageFromSQL(api, message, { success: false, message: "Chỉ admin cấp cao bot mới xem được mycard của người khác." }, true, 30000);
    return;
  }
  const targetId = mention?.uid || senderId;
  if (mention) {
    const targetName = String(message.data.content?.title || message.data.content || "")
      .substring(mention.pos, mention.pos + mention.len)
      .replace("@", "");
    await ensurePlayerAccount(targetId, targetName || targetId, api.getBotId());
  }
  const result = await getMyCard(api, targetId);
  if (result.success) {
    const playerInfo = result.data;
    playerInfo.title = "Thông Tin Người Chơi";
    let msg = `🎴 Thông tin của bạn 🎴\n\n`;
    msg += `👤 Tên: ${playerInfo.playerName}\n`;
    msg += `💰 Số dư: ${formatCurrency(playerInfo.balance)} VNĐ\n`;
    msg += `🏆 Tổng Thắng: ${formatCurrency(playerInfo.totalWinnings)} VNĐ\n`;
    msg += `💸 Tổng Thua: ${formatCurrency(playerInfo.totalLosses)} VNĐ\n`;
    msg += `💹 Lợi Nhuận Ròng: ${formatCurrency(playerInfo.netProfit)} VNĐ\n`;
    msg += `🎮 Tổng Số Lượt Chơi: ${playerInfo.totalGames}\n`;
    msg += `📊 Tỉ Lệ Thắng: ${playerInfo.winRate}%\n`;
    msg += `📅 Ngày Tham Gia: ${playerInfo.registrationTime}\n`;
    msg += `🎁 Nhận Quà Mỗi Ngày: ${playerInfo.lastDailyReward}`;

    const imagePath = await cv.createUserCardGame(playerInfo);
    await api.sendMessage({ msg: "", attachments: imagePath ? [imagePath] : [] }, threadId, message.type);
    await cv.clearImagePath(imagePath);
  } else {
    await api.sendMessage({ msg: result.message, quote: message }, threadId, message.type);
  }
}

export async function handleGameTierCommand(api, message, groupSettings) {
  if (!(await checkBeforeJoinGame(api, message, groupSettings, true))) return;
  const senderId = message.data.uidFrom;
  const mention = message.data.mentions?.[0];
  const isHighAdmin = isAdmin(api.getBotId(), senderId);
  const content = removeMention(message).trim().split(/\s+/).filter(Boolean);
  const action = String(content[1] || "").toLowerCase();
  const wantsRaise = action === "set" || action === "up" || action === "nang";

  if (wantsRaise) {
    await sendMessageFromSQL(api, message, { success: false, message: "Hạng game không thể nâng thủ công. Hệ thống chỉ tự lên hạng theo tổng tiền đã nạp." }, true, 30000);
    return;
  }

  if (mention && !isHighAdmin) {
    await sendMessageFromSQL(api, message, { success: false, message: "Chỉ admin cấp cao bot mới kiểm tra hoặc nâng hạng cho người khác." }, true, 30000);
    return;
  }

  const targetId = mention?.uid || senderId;
  const rawContent = String(message.data.content?.title || message.data.content || "");
  const targetName = mention
    ? rawContent.substring(mention.pos, mention.pos + mention.len).replace("@", "")
    : message.data.dName || senderId;
  await ensurePlayerAccount(targetId, targetName || targetId, api.getBotId());

  const player = await getPlayerInfo(targetId);
  const userInfo = await getUserInfoData(api, targetId);
  const imagePath = await cv.createVIPTierImage({
    playerName: player?.playerName || targetName,
    rankPoints: Number(player?.rankPoints || 0),
    balance: Number(player?.balance || 0),
    avatarUrl: userInfo?.avatar || null,
  });
  try {
    await api.sendMessage({ msg: "", attachments: [imagePath], ttl: 300000, isUseProphylactic: true }, message.threadId, message.type);
  } finally {
    await cv.clearImagePath(imagePath);
  }
}

export async function handleDonateRankCommand(api, message, groupSettings) {
  await sendMessageFromSQL(api, message, {
    success: false,
    message: "Lệnh đổi tiền game lấy điểm hạng đã được bỏ. Hạng chỉ tăng khi nạp tiền.",
  }, true, 30000);
}

function canUseLeaderGameReset(api, message) {
  return api.apiManager?.isMainBot === true && isBotLeader(api.getBotId(), message.data.uidFrom);
}

export async function handleResetDailyCommand(api, message) {
  if (!canUseLeaderGameReset(api, message)) {
    return sendMessageFromSQL(api, message, { success: false, message: "Chỉ Bot Leader và admin cấp cao nhất mới được reset Daily." }, true, 30000);
  }
  const mention = message.data.mentions?.[0];
  const filter = mention ? { idUserZalo: String(mention.uid) } : {};
  const result = await connection.collection(NAME_TABLE_PLAYERS).updateMany(filter, { $set: { lastDailyReward: null } });
  const target = mention ? "người được tag" : "toàn bộ người chơi";
  return sendMessageFromSQL(api, message, { success: true, message: `✅ Đã reset Daily cho ${target} (${result.matchedCount} tài khoản).` }, true, 120000);
}

export async function handleResetJackpotCommand(api, message) {
  if (!canUseLeaderGameReset(api, message)) {
    return sendMessageFromSQL(api, message, { success: false, message: "Chỉ Bot Leader và admin cấp cao nhất mới được reset hũ." }, true, 30000);
  }
  const [{ gameState, saveGameDataNow }, taiXiu, vietlott] = await Promise.all([
    import("./game-manager.js"),
    import("./tai-xiu/tai-xiu.js"),
    import("./vietlott/vietlott655.js"),
  ]);
  taiXiu.resetJackpot();
  vietlott.resetJackpot();
  gameState.data.chanle.jackpot = new Big(1000000);
  gameState.data.baucua.jackpot = new Big(1000000);
  gameState.changes.chanle = true;
  gameState.changes.baucua = true;
  saveGameDataNow();
  return sendMessageFromSQL(api, message, {
    success: true,
    message: "✅ Đã reset toàn bộ hũ về 1.000.000 VNĐ: Tài Xỉu, Chẵn Lẻ, Bầu Cua và Vietlott.",
  }, true, 120000);
}

export async function handleBuffCommand(api, message, groupSettings) {
  const senderId = message.data.uidFrom;
  if (!isAdmin(api.getBotId(), senderId)) {
    return;
  }

  await ensurePlayerAccount(senderId, message.data.dName || senderId, api.getBotId());

  const mentions = message.data.mentions || [];
  let content = removeMention(message);
  const contentParts = content.split(" ");
  let buffAmount;
  try {
    const parsedAmount = parseGameAmount(contentParts[1], Number.MAX_SAFE_INTEGER);
    if (parsedAmount === "allin") {
      const result = {
        success: false,
        message: `Không thể sử dụng all/allin cho lệnh buff.`,
      };
      await sendMessageFromSQL(api, message, result, true, 300000);
      return;
    }
    buffAmount = new Big(parsedAmount);
  } catch (error) {
    const result = {
      success: false,
      message: "Số tiền không hợp lệ.",
    };
    await sendMessageFromSQL(api, message, result, true, 300000);
    return;
  }

  if (buffAmount.lte(0)) {
    const result = {
      success: false,
      message: `Số tiền không hợp lệ.`,
    };
    await sendMessageFromSQL(api, message, result, true, 300000);
    return;
  }

  if (!mentions || mentions.length === 0) {
    if (await isHaveLoginAccount(senderId)) {
      // Lấy số dư hiện tại
      const currentBalance = await getPlayerBalance(senderId);
      const oldBalance = new Big(currentBalance.balance);

      // Thực hiện buff
      await updatePlayerBalance(senderId, buffAmount);

      // Tính số dư mới
      const newBalance = oldBalance.plus(buffAmount);

      const result = {
        success: true,
        message:
          `🔄 Buff tiền thành công!\n\n` +
          `💰 Số tiền buff: ${formatBigNumber(buffAmount)} VNĐ\n\n` +
          `📊 Biến động số dư:\n` +
          `- Trước: ${formatBigNumber(oldBalance)} VNĐ\n` +
          `- Sau: ${formatBigNumber(newBalance)} VNĐ`,
      };
      await sendMessageFromSQL(api, message, result, true, 300000);
    } else {
      const result = {
        success: false,
        message: `Không thể khởi tạo hồ sơ game của bạn.`,
      };
      await sendMessageFromSQL(api, message, result, true, 300000);
    }
    return;
  }

  let successMessages = [];
  let failureMessages = [];

  for (const mention of mentions) {
    const targetId = mention.uid;
    const targetName = message.data.content.substring(mention.pos, mention.pos + mention.len).replace("@", "");

    await ensurePlayerAccount(targetId, targetName, api.getBotId());
    if (await isHaveLoginAccount(targetId)) {
      // Lấy số dư hiện tại của người được buff
      const currentBalance = await getPlayerBalance(targetId);
      const oldBalance = new Big(currentBalance.balance);

      // Thực hiện buff
      await updatePlayerBalance(targetId, buffAmount);

      // Tính số dư mới
      const newBalance = oldBalance.plus(buffAmount);

      successMessages.push(
        `✅ ${targetName}:\n` +
          `- Buff: +${formatBigNumber(buffAmount)} VNĐ\n` +
          `- Trước: ${formatBigNumber(oldBalance)} VNĐ\n` +
          `- Sau: ${formatBigNumber(newBalance)} VNĐ`
      );
    } else {
      failureMessages.push(`❌ ${targetName}: không thể khởi tạo hồ sơ game.`);
    }
  }

  let finalMessage = `🔄 Kết quả buff tiền:\n`;
  if (successMessages.length > 0) {
    finalMessage += "\n✅ Thành công:\n" + successMessages.join("\n\n") + "\n";
  }
  if (failureMessages.length > 0) {
    finalMessage += "\n❌ Thất bại:\n" + failureMessages.join("\n");
  }

  const result = {
    success: true,
    message: finalMessage,
  };
  await sendMessageFromSQL(api, message, result, false, 300000);
}

export async function handleSetVNDCommand(api, message, groupSettings) {
  const senderId = message.data.uidFrom;
  if (!isAdmin(api.getBotId(), senderId)) {
    return;
  }

  await ensurePlayerAccount(senderId, message.data.dName || senderId, api.getBotId());

  const mentions = message.data.mentions || [];
  let content = removeMention(message);
  const contentParts = content.split(" ");
  let buffAmount;
  try {
    const parsedAmount = parseGameAmount(contentParts[1], Number.MAX_SAFE_INTEGER);
    if (parsedAmount === "allin") {
      const result = {
        success: false,
        message: `Không thể sử dụng all/allin cho lệnh set.`,
      };
      await sendMessageFromSQL(api, message, result, true, 300000);
      return;
    }
    buffAmount = new Big(parsedAmount);
  } catch (error) {
    const result = {
      success: false,
      message: "Số tiền không hợp lệ.",
    };
    await sendMessageFromSQL(api, message, result, true, 300000);
    return;
  }

  if (buffAmount.lte(0)) {
    const result = {
      success: false,
      message: `Số tiền không hợp lệ.`,
    };
    await sendMessageFromSQL(api, message, result, true, 300000);
    return;
  }

  if (!mentions || mentions.length === 0) {
    if (await isHaveLoginAccount(senderId)) {
      const currentBalance = await getPlayerBalance(senderId);
      const oldBalance = new Big(currentBalance.balance);

      await setPlayerBalance(senderId, buffAmount);

      const result = {
        success: true,
        message:
          `🔄 Set tiền thành công!\n\n` +
          `💰 Số tiền set: ${formatBigNumber(buffAmount)} VNĐ\n\n` +
          `📊 Biến động số dư:\n` +
          `- Trước: ${formatBigNumber(oldBalance)} VNĐ\n` +
          `- Sau: ${formatBigNumber(buffAmount)} VNĐ`,
      };
      await sendMessageFromSQL(api, message, result, true, 300000);
    } else {
      const result = {
        success: false,
        message: `Không thể khởi tạo hồ sơ game của bạn.`,
      };
      await sendMessageFromSQL(api, message, result, true, 300000);
    }
    return;
  }

  let successMessages = [];
  let failureMessages = [];

  for (const mention of mentions) {
    const targetId = mention.uid;
    const targetName = message.data.content.substring(mention.pos, mention.pos + mention.len).replace("@", "");

    await ensurePlayerAccount(targetId, targetName, api.getBotId());
    if (await isHaveLoginAccount(targetId)) {
      const currentBalance = await getPlayerBalance(targetId);
      const oldBalance = new Big(currentBalance.balance);

      await setPlayerBalance(targetId, buffAmount);

      successMessages.push(
        `✅ ${targetName}:\n` +
          `- Set: +${formatBigNumber(buffAmount)} VNĐ\n` +
          `- Trước: ${formatBigNumber(oldBalance)} VNĐ\n` +
          `- Sau: ${formatBigNumber(buffAmount)} VNĐ`
      );
    } else {
      failureMessages.push(`❌ ${targetName}: không thể khởi tạo hồ sơ game.`);
    }
  }

  let finalMessage = `🔄 Kết quả set tiền:\n`;
  if (successMessages.length > 0) {
    finalMessage += "\n✅ Thành công:\n" + successMessages.join("\n\n") + "\n";
  }
  if (failureMessages.length > 0) {
    finalMessage += "\n❌ Thất bại:\n" + failureMessages.join("\n");
  }

  const result = {
    success: true,
    message: finalMessage,
  };
  await sendMessageFromSQL(api, message, result, false, 300000);
}

export async function handleBankCommand(api, message, groupSettings) {
  if (!(await checkBeforeJoinGame(api, message, groupSettings, true))) return;

  const senderId = message.data.uidFrom;
  const threadId = message.threadId;
  // if (!(await isPlayerActive(senderId))) {
  //   const result = {
  //     success: false,
  //     message: `Bạn cần mở thành viên để có thể chuyển tiền cho người khác.`,
  //   };
  //   await sendMessageFromSQL(api, message, result);
  //   return;
  // }

  const mentions = message.data.mentions;
  if (!mentions || mentions.length === 0) {
    const result = {
      success: false,
      message: `Vui lòng đề cập (@mention) người dùng cần chuyển tiền!`,
    };
    await sendMessageFromSQL(api, message, result, true, 300000);
    return;
  }

  // Lấy số dư người gửi trước
  const requestData = await getPlayerBalance(senderId);
  if (!requestData.success) {
    await sendMessageFromSQL(api, message, requestData, true, 300000);
    return;
  }

  // Sau đó mới parse số tiền
  let content = removeMention(message);
  const amount = content.split(" ")[1];
  let bankAmount;
  try {
    const parsedAmount = parseGameAmount(amount, requestData.balance);
    if (parsedAmount === "allin") {
      bankAmount = new Big(requestData.balance);
    } else {
      bankAmount = parsedAmount;
    }

    if (bankAmount.lt(1000)) {
      const result = {
        success: false,
        message: `Số tiền chuyển tối thiểu là 1,000 VNĐ`,
      };
      await sendMessageFromSQL(api, message, result, true, 300000);
      return;
    }
  } catch (error) {
    const result = {
      success: false,
      message: error.message,
    };
    await sendMessageFromSQL(api, message, result, true, 300000);
    return;
  }

  // Kiểm tra số dư
  if (new Big(requestData.balance).lt(bankAmount)) {
    const result = {
      success: false,
      message: `Số dư không đủ. Bạn chỉ có ${formatBigNumber(new Big(requestData.balance))} VNĐ.`,
    };
    await sendMessageFromSQL(api, message, result, true, 300000);
    return;
  }

  const targetId = mentions[0].uid;
  const targetName = message.data.content
    .substring(mentions[0].pos, mentions[0].pos + mentions[0].len)
    .replace("@", "");

  if (String(targetId) === String(senderId)) {
    await sendMessageFromSQL(
      api,
      message,
      { success: false, message: "Bạn không thể chuyển tiền cho chính mình." },
      true,
      30000
    );
    return;
  }

  await ensurePlayerAccount(targetId, targetName, api.getBotId());

  if (await isPlayerBanned(targetId)) {
    const result = {
      success: false,
      message: `${targetName} đã bị khóa tài khoản, không thể chuyển tiền cho người dùng này.`,
    };
    await sendMessageFromSQL(api, message, result, true, 300000);
    return;
  }

  if (await isHaveLoginAccount(targetId)) {
    // Lấy số dư hiện tại của người gửi và người nhận
    const senderBalance = new Big(requestData.balance);
    const receiverData = await getPlayerBalance(targetId);
    const receiverBalance = new Big(receiverData.balance);

    // Thực hiện chuyển tiền
    const senderUpdate = await updatePlayerBalance(senderId, bankAmount.neg().toString());
    if (!senderUpdate.success) {
      await sendMessageFromSQL(
        api,
        message,
        { success: false, message: "Không thể trừ số dư người chuyển. Vui lòng thử lại." },
        true,
        300000
      );
      return;
    }
    const receiverUpdate = await updatePlayerBalance(targetId, bankAmount.toString());
    if (!receiverUpdate.success) {
      await updatePlayerBalance(senderId, bankAmount.toString());
      const result = {
        success: false,
        message: "Không thể cộng số dư người nhận; tiền đã được hoàn lại cho bạn.",
      };
      await sendMessageFromSQL(api, message, result, true, 300000);
      return;
    }

    // Tính toán số dư mới
    const newSenderBalance = senderBalance.minus(bankAmount);
    const newReceiverBalance = receiverBalance.plus(bankAmount);

    const createdAt = new Date();
    const referenceCode = `TX${Date.now().toString(36).toUpperCase()}${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
    const senderName = message.data.dName || senderId;
    const transferData = {
      referenceCode,
      amount: bankAmount.toString(),
      createdAt,
      sender: {
        id: senderId,
        name: senderName,
        balanceBefore: senderBalance.toString(),
        balanceAfter: newSenderBalance.toString(),
        avatar: null,
        rankPoints: Number((await getPlayerInfo(senderId))?.rankPoints || 0),
      },
      receiver: {
        id: targetId,
        name: targetName,
        balanceBefore: receiverBalance.toString(),
        balanceAfter: newReceiverBalance.toString(),
        avatar: null,
        rankPoints: Number((await getPlayerInfo(targetId))?.rankPoints || 0),
      },
    };

    await recordGameTransfer({
      referenceCode,
      senderId,
      senderName,
      receiverId: targetId,
      receiverName: targetName,
      amount: bankAmount,
      senderBalanceBefore: senderBalance,
      senderBalanceAfter: newSenderBalance,
      receiverBalanceBefore: receiverBalance,
      receiverBalanceAfter: newReceiverBalance,
      botId: api.getBotId(),
      threadId,
      createdAt,
    });

    const [senderInfo, receiverInfo] = await Promise.all([
      getUserInfoData(api, senderId).catch(() => null),
      getUserInfoData(api, targetId).catch(() => null),
    ]);
    transferData.sender.avatar = senderInfo?.avatarFull || senderInfo?.avatar || null;
    transferData.receiver.avatar = receiverInfo?.avatarFull || receiverInfo?.avatar || null;

    const result = {
      success: true,
      message:
        `🔄 Giao dịch chuyển tiền thành công!\n\n` +
        `💰 Số tiền chuyển: ${formatBigNumber(new Big(bankAmount))} VNĐ\n\n` +
        `📊 Biến động số dư:\n` +
        `👤 Người gửi:\n` +
        `- Trước: ${formatBigNumber(senderBalance)} VNĐ\n` +
        `- Sau: ${formatBigNumber(newSenderBalance)} VNĐ\n\n` +
        `👥 Người nhận (${targetName}):\n` +
        `- Trước: ${formatBigNumber(receiverBalance)} VNĐ\n` +
        `- Sau: ${formatBigNumber(newReceiverBalance)} VNĐ\n\n` +
        `🧾 Mã giao dịch: ${referenceCode}`,
    };
    let imagePath = null;
    try {
      imagePath = await cv.createGameBankTransferImage(transferData);
      await api.sendMessage(
        {
          msg: result.message,
          attachments: imagePath ? [imagePath] : [],
          quote: message,
          ttl: 300000,
          isUseProphylactic: true,
        },
        threadId,
        message.type
      );
    } catch (error) {
      console.error("Lỗi khi tạo ảnh chuyển tiền game:", error);
      await sendMessageFromSQL(api, message, result, true, 300000);
    } finally {
      await cv.clearImagePath(imagePath);
    }
  } else {
    const result = {
      success: false,
      message: `Không thể khởi tạo hồ sơ game cho ${targetName}.`,
    };
    await sendMessageFromSQL(api, message, result, true, 300000);
  }
}

export async function handleStatementCommand(api, message, groupSettings) {
  if (!(await checkBeforeJoinGame(api, message, groupSettings, true))) return;

  const senderId = message.data.uidFrom;
  const playerInfo = await getPlayerInfo(senderId);
  if (!playerInfo) {
    await sendMessageFromSQL(api, message, { success: false, message: "Không thể lấy hồ sơ game của bạn." }, true, 30000);
    return;
  }

  const history = await getGameTransferHistory(senderId, 10);
  const transactions = history.map((transaction) => {
    const incoming = String(transaction.receiverId) === String(senderId);
    return {
      direction: incoming ? "in" : "out",
      counterpartyName: incoming ? transaction.senderName : transaction.receiverName,
      amount: transaction.amount,
      balanceAfter: incoming ? transaction.receiverBalanceAfter : transaction.senderBalanceAfter,
      createdAt: transaction.createdAt,
      referenceCode: transaction.referenceCode,
    };
  });

  const imagePath = await cv.createGameStatementImage({
    playerName: playerInfo.playerName || message.data.dName || senderId,
    balance: playerInfo.balance,
    rankPoints: Number(playerInfo.rankPoints || 0),
    transactions,
  });
  try {
    await api.sendMessage(
      { msg: "", attachments: imagePath ? [imagePath] : [], ttl: 300000, isUseProphylactic: true },
      message.threadId,
      message.type
    );
  } finally {
    await cv.clearImagePath(imagePath);
  }
}

export async function handleBanCommand(api, message, groupSettings) {
  const senderId = message.data.uidFrom;
  const threadId = message.threadId;

  if (!isAdmin(api.getBotId(), senderId, threadId)) {
    const result = {
      success: false,
      message: `Bạn không có quyền sử dụng lệnh này.`,
    };
    await sendMessageFromSQL(api, message, result, true, 300000);
    return;
  }

  const mentions = message.data.mentions;
  if (!mentions || mentions.length === 0) {
    const result = {
      success: false,
      message: `Vui lòng đề cập (@mention) người dùng cần ban.`,
    };
    await sendMessageFromSQL(api, message, result, true, 300000);
    return;
  }

  for (const mention of mentions) {
    const targetId = mention.uid;
    const targetName = message.data.content.substring(mention.pos, mention.pos + mention.len).replace("@", "");

    if (isAdmin(api.getBotId(), targetId, threadId)) {
      const result = {
        success: false,
        message: `${targetName} là quản trị viên, không thể khóa tài khoản được.`,
      };
      await sendMessageFromSQL(api, message, result, true, 300000);
      return;
    }

    if (await isHaveLoginAccount(targetId)) {
      if (await isPlayerBanned(targetId)) {
        const result = {
          success: false,
          message: `${targetName} đã bị khóa tài khoản.`,
        };
        await sendMessageFromSQL(api, message, result, true, 300000);
        return;
      } else {
        await banPlayer(targetId);
        const result = {
          success: true,
          message: `Đã khóa tài khoản của ${targetName} khỏi hệ thống game.`,
        };
        await sendMessageFromSQL(api, message, result, true, 300000);
      }
    } else {
      const result = {
        success: false,
        message: `${targetName} chưa có dữ liệu game.`,
      };
      await sendMessageFromSQL(api, message, result, true, 300000);
      return;
    }
  }
}

export async function handleUnbanCommand(api, message, groupSettings) {
  const senderId = message.data.uidFrom;
  const threadId = message.threadId;

  if (!isAdmin(api.getBotId(), senderId, threadId)) {
    const result = {
      success: false,
      message: `Bạn không có quyền sử dụng lệnh này.`,
    };
    await sendMessageFromSQL(api, message, result);
    return;
  }

  const mentions = message.data.mentions;
  if (!mentions || mentions.length === 0) {
    const result = {
      success: false,
      message: `Vui lòng đề cập (@mention) người dùng cần mở khóa tài khoản.`,
    };
    await sendMessageFromSQL(api, message, result, true, 300000);
    return;
  }

  for (const mention of mentions) {
    const targetId = mention.uid;
    const targetName = message.data.content.substring(mention.pos, mention.pos + mention.len).replace("@", "");

    if (await isHaveLoginAccount(targetId)) {
      if (await isPlayerBanned(targetId)) {
        await unbanPlayer(targetId);
        const result = {
          success: true,
          message: `Đã unban ${targetName}, người chơi có thể tham gia lại các trò chơi.`,
        };
        await sendMessageFromSQL(api, message, result, true, 300000);
      } else {
        const result = {
          success: false,
          message: `${targetName} không bị khóa tài khoản.`,
        };
        await sendMessageFromSQL(api, message, result, true, 300000);
      }
    } else {
      const result = {
        success: false,
        message: `${targetName} chưa có dữ liệu game.`,
      };
      await sendMessageFromSQL(api, message, result, true, 300000);
    }
  }
}

export async function checkPlayerBanned(api, message, threadId, senderId) {
  if (await isPlayerBanned(senderId)) {
    const result = {
      success: false,
      message: `Tài khoản của bạn đã bị khóa, không thể thực hiện bất kỳ lệnh game nào nữa!`,
    };
    await sendMessageFromSQL(api, message, result, true, 300000);
    return true;
  }
  return false;
}

export async function checkPlayerLogin(api, message, threadId, senderId) {
  const senderName = message.data.dName || senderId;
  const result = await ensurePlayerAccount(senderId, senderName, api.getBotId());
  if (!result.success) {
    const errorResult = {
      success: false,
      message: `Đã xảy ra lỗi khi khởi tạo tài khoản game của bạn, vui lòng thử lại.`,
    };
    await sendMessageFromSQL(api, message, errorResult, true, 300000);
    return false;
  }
  return true;
}

// Đã bỏ hoàn toàn hệ thống đăng ký/đăng nhập/đăng xuất tài khoản game bằng username+password.
// Tài khoản game được tự động tạo và liên kết theo UID Zalo ngay khi chơi lệnh game đầu tiên
// (xem hàm ensurePlayerAccount trong database/player.js và checkPlayerLogin ở trên).

// Hàm xử lý lệnh nạp tiền
export async function handleNapCommand(api, message, groupSettings) {
  try {
    if (!(await checkBeforeJoinGame(api, message, groupSettings, true))) return;

    const senderId = message.data.uidFrom;
    const content = removeMention(message);
    const parts = content.split(" ");

    if (parts.length !== 2) {
      const result = {
        success: false,
        message: `Vui lòng sử dụng lệnh đúng cú pháp:\n!nap [Số Tiền/10%/100k/1m/1b]`,
      };
      await sendMessageFromSQL(api, message, result, true, 30000);
      return;
    }

    // Lấy thông tin người chơi từ bảng player_zalo
    const playerInfo = await getPlayerInfo(senderId);
    if (!playerInfo) {
      const result = {
        success: false,
        message: `Không tìm thấy thông tin tài khoản.`,
      };
      await sendMessageFromSQL(api, message, result, true, 300000);
      return;
    }

    // Lấy số dư VND từ bảng account
    const accountVND = await getAccountVND(playerInfo.username);
    if (accountVND === null) {
      const result = {
        success: false,
        message: `Không thể lấy thông tin số dư VND từ tài khoản game ${playerInfo.username}.`,
      };
      await sendMessageFromSQL(api, message, result, true, 300000);
      return;
    }

    const accountBalance = new Big(accountVND);

    // Parse số tiền sau khi đã có accountBalance
    let napAmount;
    try {
      const parsedAmount = parseGameAmount(parts[1], accountBalance);
      if (parsedAmount === "allin") {
        napAmount = accountBalance;
      } else {
        napAmount = parsedAmount;
      }

      if (napAmount.lt(20000)) {
        const result = {
          success: false,
          message: `Số tiền nạp tối thiểu là 20,000 VNĐ.`,
        };
        await sendMessageFromSQL(api, message, result, true, 300000);
        return;
      }
    } catch (error) {
      const result = {
        success: false,
        message: error.message,
      };
      await sendMessageFromSQL(api, message, result, true, 300000);
      return;
    }

    if (accountBalance.lt(napAmount)) {
      const result = {
        success: false,
        message: `Số dư VND trong tài khoản ${playerInfo.username} chỉ có ${formatBigNumber(accountBalance)} VNĐ.`,
      };
      await sendMessageFromSQL(api, message, result, true, 300000);
      return;
    }

    const oldAccountBalance = accountBalance;
    const oldBotBalance = new Big(playerInfo.balance);

    // Cập nhật số dư trong game
    const gameAmount = napAmount;
    await updatePlayerBalance(senderId, gameAmount.toNumber());
    // Cập nhật số dư VND trong account
    await updateAccountVND(playerInfo.username, napAmount.neg().toNumber());

    const oldTier = cv.getGameTier(playerInfo.rankPoints || 0);
    const newTotalDeposited = new Big(playerInfo.rankPoints || 0).plus(napAmount);
    await connection.collection(NAME_TABLE_PLAYERS).updateOne(
      { idUserZalo: String(senderId) },
      { $set: { rankPoints: Number(newTotalDeposited.toString()), vipExpireAt: null } }
    );
    const newTier = cv.getGameTier(newTotalDeposited.toString());
    const tierNotice = oldTier.key === newTier.key ? "" : `\n\n🎉 Lên hạng: ${oldTier.name} → ${newTier.name}`;

    const newAccountBalance = oldAccountBalance.minus(napAmount);
    const newBotBalance = oldBotBalance.plus(gameAmount);

    const result = {
      success: true,
      message:
        `🔄 Giao dịch nạp tiền thành công!\n\n` +
        `💰 Số tiền nạp: ${formatBigNumber(napAmount)} VNĐ\n\n` +
        `📊 Biến động số dư:\n` +
        `🎮 Tài khoản ${playerInfo.username}:\n` +
        `- Trước: ${formatBigNumber(oldAccountBalance)} VNĐ\n` +
        `- Sau: ${formatBigNumber(newAccountBalance)} VNĐ\n\n` +
        `🤖 Tài khoản Bot Zalo:\n` +
        `- Trước: ${formatBigNumber(oldBotBalance)} VNĐ\n` +
        `- Sau: ${formatBigNumber(newBotBalance)} VNĐ\n\n` +
        `🏅 Tổng đã nạp: ${formatBigNumber(newTotalDeposited)} VNĐ${tierNotice}`,
    };
    await sendMessageFromSQL(api, message, result, true, 300000);
  } catch (error) {
    console.error("Lỗi khi xử lý lệnh nạp:", error);
    const result = {
      success: false,
      message: `Đã xảy ra lỗi khi xử lý lệnh nạp!`,
    };
    await sendMessageFromSQL(api, message, result, true, 300000);
  }
}

// Hàm xử lý lệnh rút tiền
export async function handleRutCommand(api, message, groupSettings) {
  try {
    if (!(await checkBeforeJoinGame(api, message, groupSettings, true))) return;

    const senderId = message.data.uidFrom;
    const content = removeMention(message);
    const parts = content.split(" ");

    if (parts.length !== 2) {
      const result = {
        success: false,
        message: `Vui lòng sử dụng lệnh đúng cú pháp:\n!rut [Số Tiền/10%/100k/1m/1b]`,
      };
      await sendMessageFromSQL(api, message, result, true, 30000);
      return;
    }

    // Lấy thông tin người chơi từ bảng player_zalo trước
    const playerInfo = await getPlayerInfo(senderId);
    if (!playerInfo) {
      const result = {
        success: false,
        message: `Không tìm thấy thông tin tài khoản.`,
      };
      await sendMessageFromSQL(api, message, result, true, 300000);
      return;
    }

    // Lấy số dư hiện tại
    const currentBotBalance = new Big(playerInfo.balance);
    const accountVND = await getAccountVND(playerInfo.username);
    const currentAccountBalance = new Big(accountVND);

    // Parse số tiền sau khi đã có currentBotBalance
    let rutAmount;
    try {
      const parsedAmount = parseGameAmount(parts[1], currentBotBalance);
      if (parsedAmount === "allin") {
        rutAmount = currentBotBalance;
      } else {
        rutAmount = parsedAmount;
      }

      if (rutAmount.lt(20000)) {
        const result = {
          success: false,
          message: `Số tiền rút tối thiểu là 20,000 VNĐ.`,
        };
        await sendMessageFromSQL(api, message, result, true, 300000);
        return;
      }
    } catch (error) {
      const result = {
        success: false,
        message: error.message,
      };
      await sendMessageFromSQL(api, message, result, true, 300000);
      return;
    }

    // Kiểm tra số dư
    if (currentBotBalance.lt(rutAmount)) {
      const result = {
        success: false,
        message: `Số dư trong tài khoản bot không đủ để rút ${formatBigNumber(rutAmount)} VNĐ về tài khoản ${
          playerInfo.username
        }!`,
      };
      await sendMessageFromSQL(api, message, result, true, 300000);
      return;
    }

    // Cập nhật số dư trong game
    await updatePlayerBalance(senderId, rutAmount.neg().toNumber());
    // Cập nhật số dư VND trong account
    await updateAccountVND(playerInfo.username, rutAmount.toNumber());

    const newBotBalance = currentBotBalance.minus(rutAmount);
    const newAccountBalance = currentAccountBalance.plus(rutAmount);

    const result = {
      success: true,
      message:
        `🔄 Giao dịch rút tiền thành công!\n\n` +
        `💰 Số tiền rút: ${formatBigNumber(rutAmount)} VNĐ\n\n` +
        `📊 Biến động số dư:\n` +
        `🤖 Tài khoản Bot Zalo:\n` +
        `- Trước: ${formatBigNumber(currentBotBalance)} VNĐ\n` +
        `- Sau: ${formatBigNumber(newBotBalance)} VNĐ\n\n` +
        `🎮 Tài khoản ${playerInfo.username}:\n` +
        `- Trước: ${formatBigNumber(currentAccountBalance)} VNĐ\n` +
        `- Sau: ${formatBigNumber(newAccountBalance)} VNĐ`,
    };
    await sendMessageFromSQL(api, message, result, true, 300000);
  } catch (error) {
    console.error("Lỗi khi xử lý lệnh rút:", error);
    const result = {
      success: false,
      message: `Đã xảy ra lỗi khi xử lý lệnh rút!`,
    };
    await sendMessageFromSQL(api, message, result, true, 300000);
  }
}


export async function handleDonateCommand(api, message, groupSettings) {
  try {
    const senderId = message.data.uidFrom;
    const accountResult = await ensurePlayerAccount(
      senderId,
      message.data.dName || senderId,
      api.getBotId()
    );
    if (!accountResult.success) {
      await sendMessageFromSQL(
        api,
        message,
        { success: false, message: "Không thể khởi tạo hồ sơ game để nhận hạng donate. Vui lòng thử lại." },
        true,
        30000
      );
      return;
    }

    const { createDonateQR } = await import("../../utils/canvas/game-donate-qr.js");
    const qrPath = await createDonateQR(senderId);
    if (api && api.addReaction) await api.addReaction("LIKE", message);

    const caption =
      `⚜️ Thu Hoa Bot Team ⚜️\n` +
      `🤖 Bot vận hành miễn phí cho mọi người, nhưng mỗi tháng vẫn tốn chi phí thuê VPS, Host Upload và AI Assistant.\n` +
      `💝 Nếu thấy bot hữu ích và muốn góp một tay, bạn có thể ủng hộ bằng cách quét mã QR trong ảnh.\n` +
      `🎖️ Tổng tiền nạp được cộng dồn để mở hạng thành viên vĩnh viễn:\n` +
      `🥇 Mức 50.000đ — hạng Vàng\n` +
      `⚪ Mức 100.000đ — hạng Bạch Kim\n` +
      `💚 Mức 200.000đ — hạng Lục Bảo\n` +
      `♦️ Mức 500.000đ — hạng Hồng Ngọc\n` +
      `💎 Mức 1.000.000đ — hạng Kim Cương\n` +
      `🤖 Hệ thống tự nhận chuyển khoản và nâng hạng trong ít phút.\n` +
      `📝 Giữ nguyên nội dung chuyển khoản in trong ảnh để hệ thống nhận đúng người.\n` +
      `🙏 Cảm ơn bạn đã ủng hộ và đồng hành cùng bot.`;

    await sendMessageCompleteRequest(
      api,
      message,
      {
        caption: caption,
        imagePath: qrPath,
      },
      86400000
    );

    await fs.promises.unlink(qrPath).catch(() => {});
  } catch (error) {
    console.error("Lỗi khi xử lý lệnh donate:", error);
  }
}

export async function processDonatePayment(uid, payRef, receivedAmount) {
  try {
    const { getGlobalApi } = await import("../../index.js");
    const api = getGlobalApi();
    if (!api) throw new Error("Bot chính chưa sẵn sàng để xử lý donate");

    const normalizedUid = String(uid || "").trim();
    const amount = Number(receivedAmount);
    if (!/^\d+$/.test(normalizedUid)) throw new Error("UID donate không hợp lệ");
    if (!Number.isFinite(amount) || amount < 1000) throw new Error("Số tiền donate không hợp lệ");

    const accountResult = await ensurePlayerAccount(normalizedUid, null, api.getBotId());
    if (!accountResult.success) throw new Error("Không thể khởi tạo hồ sơ game cho người donate");

    const { getGameTier } = await import("../../utils/canvas/game-finance.js");
    const playerCollection = connection.collection(NAME_TABLE_PLAYERS);
    const player = await playerCollection.findOne({ idUserZalo: normalizedUid });
    if (!player) throw new Error("Không tìm thấy hồ sơ game sau khi khởi tạo");

    const currentRankPoints = Number(player.rankPoints || 0);
    const oldTier = getGameTier(currentRankPoints);
    const newRankPoints = currentRankPoints + amount;
    const tier = getGameTier(newRankPoints);

    const updateResult = await playerCollection.updateOne(
      { _id: player._id },
      { $set: { rankPoints: newRankPoints, vipExpireAt: null } }
    );
    if (updateResult.matchedCount !== 1) throw new Error("Không thể cập nhật hạng donate");

    try {
      await api.sendMessage(
        {
          msg: `🎉 CẢM ƠN BẠN ĐÃ DONATE ${formatCurrency(amount)} VNĐ! 🎉\n\n` +
               `Tổng tiền đã nạp: ${formatCurrency(newRankPoints)} VNĐ\n` +
               (oldTier.key === tier.key ? `Hạng hiện tại: ${tier.name} 🏆\n` : `Chúc mừng lên hạng: ${oldTier.name} → ${tier.name} 🏆\n`) +
               `Hạng được giữ vĩnh viễn và chỉ tăng theo tổng tiền nạp.\n` +
               `Hãy dùng lệnh !daily mỗi ngày để nhận ${formatBigNumber(new Big(tier.daily))} VNĐ nhé!`
        },
        normalizedUid,
        1
      );
    } catch (notifyError) {
      console.warn(`[Donate] Đã nâng hạng nhưng không thể báo cho ${normalizedUid}:`, notifyError?.message || notifyError);
    }

    const { getListAdminByIDBot } = await import("../../index.js");
    const admins = getListAdminByIDBot(api.getBotId()) || [];
    for (const adminId of admins) {
      try {
        await api.sendMessage(
          { msg: `🔔 [VIP DONATE] Người dùng ${normalizedUid} vừa donate ${formatCurrency(amount)} VNĐ và nhận hạng ${tier.name}!` },
          adminId,
          1
        );
      } catch (e) {}
    }

    return {
      success: true,
      message: `Nâng hạng VIP ${tier.name} thành công`,
      uid: normalizedUid,
      rankPoints: newRankPoints,
      vipExpireAt: null,
      payRef: String(payRef || ""),
    };
  } catch (error) {
    console.error("Lỗi khi xử lý donate webhook:", error);
    return { success: false, error: error.message };
  }
}
