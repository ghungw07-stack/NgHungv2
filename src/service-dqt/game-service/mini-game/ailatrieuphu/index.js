import { formatCurrency, removeMention } from "../../../../utils/format-util.js";
import { updateRankMiniGame } from "../../../info-service/rank-chat.js";
import { sendMessageFromSQL, sendMessageImageTag } from "../../../chat-zalo/chat-style/chat-style.js";
import { deleteFile } from "../../../../utils/util.js";
import {
  gameTypeAiLaTrieuPhu,
  GAME_MESSAGE_TIME_TO_LIVE,
  FINAL_MESSAGE_TIME_TO_LIVE,
  playerCooldowns,
  clearQuestionTimeout,
  setProcessingAnswer,
  isProcessingAnswer,
  startAiLaTrieuPhuGame,
  startNewQuestion,
  endGame,
  addToQueue,
  removeFromQueue,
  getQueueInfo,
  isGameActive,
  getCurrentGame,
} from "./game-manager.js";
import { drawQuestionCanvas, drawAudienceCanvas, drawPhoneCanvas } from "./render.js";
export { gameTypeAiLaTrieuPhu };

// Xử lý command game
export async function handleAiLaTrieuPhuCommand(api, message, aliasCommand) {
  const threadId = message.threadId;
  const senderId = message.data.uidFrom;
  const senderName = message.data.dName;
  const content = removeMention(message).toLowerCase().trim();
  const args = content.split(/\s+/);
  const command = args[1]; // args[0] là tên lệnh game
  // Kiểm tra cooldown
  const cooldownKey = `${threadId}-${senderId}`;
  const lastPlayTime = playerCooldowns.get(cooldownKey);
  const now = Date.now();

  if (command === "play" || command === "start" || command === "join") {
    // Kiểm tra xem có game đang chạy không
    if (isGameActive(threadId)) {
      const currentGame = getCurrentGame(threadId);

      if (currentGame && currentGame.playerId === senderId) {
        const result = {
          success: false,
          message: `🎮 **AI LÀ TRIỆU PHÚ** 🎮\n\n🎯 ${senderName} - Bạn đã tham gia phiên game này!\n📊 Câu hiện tại: ${currentGame.currentLevel}/15\n💡 Vui lòng trả lời câu hỏi hiện tại.`,
        };
        await sendMessageFromSQL(api, message, result, false, FINAL_MESSAGE_TIME_TO_LIVE);
        return;
      }

      // Thêm vào hàng chờ
      const added = addToQueue(message);
      if (added) {
        const queue = getQueueInfo(threadId);
        const position = queue.findIndex((p) => p.playerId === senderId) + 1;

        const result = {
          success: true,
          message: `🎮 **AI LÀ TRIỆU PHÚ** 🎮\n\n✅ ${senderName} đã được thêm vào hàng chờ!\n📊 Vị trí: ${position}/${queue.length}\n⏰ Vui lòng chờ đến lượt của bạn.`,
        };
        await sendMessageFromSQL(api, message, result, false, FINAL_MESSAGE_TIME_TO_LIVE);
      } else {
        const result = {
          success: false,
          message: "❌ Bạn đã có trong hàng chờ rồi!",
        };
        await sendMessageFromSQL(api, message, result, false, FINAL_MESSAGE_TIME_TO_LIVE);
      }
      return;
    }

    if (lastPlayTime && now - lastPlayTime < 60000) {
      const remainingTime = Math.ceil((60000 - (now - lastPlayTime)) / 1000);
      const result = {
        success: false,
        message: `⏰ Vui lòng đợi ${remainingTime} giây nữa để chơi lại!`,
      };
      await sendMessageFromSQL(api, message, result, false, FINAL_MESSAGE_TIME_TO_LIVE);
      return;
    }

    // Bắt đầu game mới
    playerCooldowns.set(cooldownKey, now);
    await startAiLaTrieuPhuGame(api, message, { playerId: senderId, playerName: senderName });
    return;
  }

  // Lệnh xem hàng chờ
  if (command === "queue" || command === "hangcho" || command === "list") {
    const queue = getQueueInfo(threadId);
    const currentGame = getCurrentGame(threadId);

    let resultText = `🎮 **HÀNG CHỜ AI LÀ TRIỆU PHÚ** 🎮\n\n`;

    if (currentGame) {
      resultText += `🎯 **Đang chơi:** ${currentGame.playerName}\n`;
      resultText += `📊 Câu: ${currentGame.currentLevel}/15\n\n`;
    }

    if (queue.length === 0) {
      resultText += `📋 Hàng chờ trống\n`;
      resultText += `💡 Dùng \`${aliasCommand} start\` để bắt đầu game!`;
    } else {
      resultText += `📋 **Hàng chờ (${queue.length} người):**\n`;
      queue.forEach((player, index) => {
        resultText += `${index + 1}. ${player.playerName}\n`;
      });
    }

    const result = {
      success: true,
      message: resultText,
    };
    await sendMessageFromSQL(api, message, result, false, FINAL_MESSAGE_TIME_TO_LIVE);
    return;
  }

  // Lệnh rời hàng chờ
  if (command === "leave" || command === "roi" || command === "cancel") {
    const removed = removeFromQueue(threadId, senderId);
    if (removed) {
      const result = {
        success: true,
        message: `✅ ${senderName} đã rời khỏi hàng chờ!`,
      };
      await sendMessageFromSQL(api, message, result, false, FINAL_MESSAGE_TIME_TO_LIVE);
    } else {
      const result = {
        success: false,
        message: "❌ Bạn không có trong hàng chờ!",
      };
      await sendMessageFromSQL(api, message, result, false, FINAL_MESSAGE_TIME_TO_LIVE);
    }
    return;
  }

  // Lệnh help
  if (command === "help" || command === "huongdan" || !command) {
    const helpText = `🎮 **HƯỚNG DẪN GAME AI LÀ TRIỆU PHÚ** 🎮

📋 **Cách chơi:**
• Trả lời 15 câu hỏi để thắng 150 triệu VNĐ
• Mỗi câu có 4 đáp án A, B, C, D
• Thời gian suy nghĩ: 60 giây/câu
• Có 3 quyền trợ giúp: 50:50, Hỏi khán giả, Gọi điện

💰 **Mốc an toàn:**
• Câu 5: 2 triệu VNĐ
• Câu 10: 22 triệu VNĐ  
• Câu 15: 150 triệu VNĐ

🎯 **Lệnh điều khiển:**
• \`${aliasCommand} start|play|join\` - Bắt đầu game hoặc tham gia hàng chờ
• \`${aliasCommand} queue\` - Xem hàng chờ hiện tại
• \`${aliasCommand} leave\` - Rời khỏi hàng chờ
• \`a/b/c/d\` - Chọn đáp án
• \`5050\` - Sử dụng quyền 50:50
• \`audience\` - Hỏi ý kiến khán giả
• \`phone\` - Gọi điện cho bạn bè
• \`stop\` - Dừng cuộc chơi và nhận tiền

🏆 **Luật chơi:**
• Trả lời sai = về mốc an toàn gần nhất
• Mỗi quyền trợ giúp chỉ dùng 1 lần
• Có thể dừng bất cứ lúc nào để nhận tiền
• Hệ thống hàng chờ: người sau chơi khi người trước hoàn thành`;

    const result = {
      success: true,
      message: helpText,
    };
    await sendMessageFromSQL(api, message, result, false, FINAL_MESSAGE_TIME_TO_LIVE);
    return;
  }

  // Kiểm tra xem có game đang chạy không
  const currentGame = getCurrentGame(threadId);
  if (!currentGame || !currentGame.isActive || currentGame.playerId !== senderId) {
    const result = {
      success: false,
      message: `❌ Không có game nào đang chạy! Dùng \`${aliasCommand} start\` để bắt đầu hoặc tham gia hàng chờ.`,
    };
    await sendMessageFromSQL(api, message, result, false, FINAL_MESSAGE_TIME_TO_LIVE);
    return;
  }

  // Cập nhật thời gian hoạt động
  currentGame.lastActivity = Date.now();

  // Xử lý các lệnh trong game
  const input = content.replace(aliasCommand, "").trim();

  // Lệnh trả lời câu hỏi
  if (["a", "b", "c", "d"].includes(input)) {
    await handleAnswer(api, message, currentGame, input.toUpperCase());
    return;
  }

  // Alias trợ giúp (gom về 1 hàm chung)
  if (await handleHelpAlias(api, message, currentGame, input)) return;

  // Lệnh dừng game
  if (input === "stop" || input === "dung") {
    await handleStop(api, message, currentGame);
    return;
  }

  // Lệnh xem trạng thái
  if (input === "status" || input === "trangthai") {
    await showGameStatus(api, message, currentGame);
    return;
  }

  // Lệnh không hợp lệ
  const result = {
    success: false,
    message: "❌ Lệnh không hợp lệ! Dùng a/b/c/d để trả lời, hoặc 5050/audience/phone cho quyền trợ giúp.",
  };
  await sendMessageFromSQL(api, message, result, false, FINAL_MESSAGE_TIME_TO_LIVE);
}

// Xử lý trả lời câu hỏi
async function handleAnswer(api, message, game, answer) {
  if (isProcessingAnswer(game.threadId)) {
    return; // Đang xử lý đáp án khác
  }

  setProcessingAnswer(game.threadId, true);

  try {
    // Xóa timeout cũ
    clearQuestionTimeout(game.threadId);

    const isCorrect = game.checkAnswer(answer);
    const question = game.currentQuestion;
    const correctAnswer = question.correctAnswer?.letter;

    if (!correctAnswer) return;

    if (isCorrect) {
      // Đáp án đúng - lấy tiền thưởng cho câu hiện tại
      const earnedMoney = formatCurrency(game.getMoneyForCurrentLevel());
      let resultText = `✅ **CHÍNH XÁC!** ✅\n\n`;
      resultText += `🎉 ${game.playerName} đã trả lời đúng!\n`;
      resultText += `💰 Tiền thưởng: ${earnedMoney} VNĐ\n\n`;

      if (game.currentLevel === 15) {
        // Thắng cuộc
        resultText += `🏆 **CHÚC MỪNG! BẠN ĐÃ THẮNG CUỘC!** 🏆\n`;
        resultText += `💎 Tổng giải thưởng: 150,000,000 VNĐ\n`;
        resultText += `🌟 Bạn là triệu phú mới!`;

        // Cập nhật thành tích
        updateRankMiniGame(
          api.getBotId(),
          game.threadId,
          game.playerId,
          game.playerName,
          "Ai Là Triệu Phú",
          gameTypeAiLaTrieuPhu,
          1000 // Điểm thưởng cho việc thắng cuộc
        );

        const result = {
          success: true,
          message: resultText,
        };
        await sendMessageFromSQL(api, message, result, false, FINAL_MESSAGE_TIME_TO_LIVE);
        endGame(api, message, game.threadId, game);
        return;
      } else {
        // Chuyển câu tiếp theo
        game.levelUp();

        // Kiểm tra mốc an toàn
        if (game.currentLevel === 6 || game.currentLevel === 11) {
          // Sau khi level up, kiểm tra mốc
          resultText += `🛡️ Đây là mốc an toàn!\n`;
        }

        resultText += `\n➡️ Chuẩn bị cho câu tiếp theo...`;

        const result = {
          success: true,
          message: resultText,
        };
        await sendMessageFromSQL(api, message, result, false, FINAL_MESSAGE_TIME_TO_LIVE);

        // Đợi 3 giây rồi hiển thị câu mới
        setTimeout(async () => {
          await startNewQuestion(api, message, game.threadId, game);
        }, 3000);
      }
    } else {
      // Đáp án sai
      const safeMoney = formatCurrency(game.getSafeMoney());
      let resultText = `❌ **SAI RỒI!** ❌\n\n`;
      resultText += `😞 ${game.playerName} đã trả lời sai!\n`;
      resultText += `📝 Đáp án đúng là: **${correctAnswer}** - ${question.options[correctAnswer]}\n`;
      resultText += `💸 Bạn về mốc an toàn: ${safeMoney} VNĐ\n`;
      resultText += `🎯 Đã chơi được ${game.currentLevel - 1} câu`;

      // Cập nhật thành tích
      const points = Math.max(10, (game.currentLevel - 1) * 5);
      updateRankMiniGame(
        api.getBotId(),
        game.threadId,
        game.playerId,
        game.playerName,
        "Ai Là Triệu Phú",
        gameTypeAiLaTrieuPhu,
        points
      );

      const result = {
        success: true,
        message: resultText,
      };
      await sendMessageFromSQL(api, message, result, false, FINAL_MESSAGE_TIME_TO_LIVE);
      endGame(api, message, game.threadId, game);
    }
  } finally {
    setProcessingAnswer(game.threadId, false);
  }
}

// Xử lý quyền trợ giúp 50:50
async function handleFiftyFifty(api, message, game) {
  const removedOptions = game.use5050();
  if (!removedOptions) {
    const result = {
      success: false,
      message: "❌ Bạn đã sử dụng quyền trợ giúp 50:50 rồi!",
    };
    await sendMessageFromSQL(api, message, result, false, FINAL_MESSAGE_TIME_TO_LIVE);
    return;
  }

  let resultText = `🎯 **QUYỀN TRỢ GIÚP 50:50** 🎯\n\n`;
  resultText += `❌ Đã loại bỏ 2 đáp án sai: ${removedOptions.join(", ")}\n`;
  resultText += `✅ Còn lại 2 đáp án để lựa chọn\n\n`;
  resultText += `💡 Hãy chọn đáp án của bạn!`;

  // Vẽ lại canvas với đáp án bị loại
  const imagePath = await drawQuestionCanvas(game);
  if (imagePath) {
    const result = {
      caption: resultText,
      imagePath: imagePath,
    };
    await sendMessageImageTag(api, message, result, FINAL_MESSAGE_TIME_TO_LIVE);
    setTimeout(() => deleteFile(imagePath), 5000);
  }
}

// Xử lý quyền trợ giúp hỏi khán giả
async function handleAudience(api, message, game) {
  const percentages = game.useAudience();
  if (!percentages) {
    const result = {
      success: false,
      message: "❌ Bạn đã sử dụng quyền trợ giúp hỏi khán giả rồi!",
    };
    await sendMessageFromSQL(api, message, result, false, FINAL_MESSAGE_TIME_TO_LIVE);
    return;
  }

  let caption = `👥 **HỎI Ý KIẾN KHÁN GIẢ** 👥\n\n`;
  caption += `📊 Kết quả bình chọn: A ${percentages.A || 0}% • B ${percentages.B || 0}% • C ${
    percentages.C || 0
  }% • D ${percentages.D || 0}%\n`;
  caption += `\n💭 Khán giả đã bầu chọn! Quyết định cuối cùng thuộc về bạn.`;

  // Vẽ canvas Audience
  const imagePath = await drawAudienceCanvas(game, percentages);
  if (imagePath) {
    const result = {
      caption,
      imagePath,
    };
    await sendMessageImageTag(api, message, result, FINAL_MESSAGE_TIME_TO_LIVE);
    setTimeout(() => deleteFile(imagePath), 5000);
  } else {
    const result = { success: true, message: caption };
    await sendMessageFromSQL(api, message, result, false, FINAL_MESSAGE_TIME_TO_LIVE);
  }
}

// Xử lý quyền trợ giúp gọi điện
async function handlePhone(api, message, game) {
  const advice = game.usePhone();
  if (!advice) {
    const result = {
      success: false,
      message: "❌ Bạn đã sử dụng quyền trợ giúp gọi điện rồi!",
    };
    await sendMessageFromSQL(api, message, result, false, FINAL_MESSAGE_TIME_TO_LIVE);
    return;
  }

  const caption = `📞 **GỌI ĐIỆN CHO BẠN BÈ** 📞\n\n "${advice.confidence}"`;
  const imagePath = await drawPhoneCanvas(game, advice);
  if (imagePath) {
    await sendMessageImageTag(api, message, { caption, imagePath }, FINAL_MESSAGE_TIME_TO_LIVE);
    setTimeout(() => deleteFile(imagePath), 5000);
  } else {
    await sendMessageFromSQL(api, message, { success: true, message: caption }, false, FINAL_MESSAGE_TIME_TO_LIVE);
  }
}

async function handleChangeQuestion(api, message, game) {
  const changed = await game.useChangeQuestion?.();
  if (!changed) {
    const result = {
      success: false,
      message: "❌ Bạn đã dùng quyền đổi câu hoặc không thể đổi lúc này!",
    };
    await sendMessageFromSQL(api, message, result, false, FINAL_MESSAGE_TIME_TO_LIVE);
    return;
  }

  // Vẽ lại canvas câu hỏi mới (cùng level)
  const imagePath = await drawQuestionCanvas(game);
  const caption = `🔄 **ĐÃ ĐỔI CÂU HỎI**\n📈 Câu hiện tại: ${game.currentLevel}/15`;
  if (imagePath) {
    await sendMessageImageTag(api, message, { caption, imagePath }, GAME_MESSAGE_TIME_TO_LIVE);
    setTimeout(() => deleteFile(imagePath), 5000);
  } else {
    await sendMessageFromSQL(api, message, { success: true, message: caption }, false, GAME_MESSAGE_TIME_TO_LIVE);
  }
}

// Xử lý dừng game
async function handleStop(api, message, game) {
  const currentMoney = game.getCurrentMoney();
  const moneyText = formatCurrency(currentMoney);

  let resultText = `🛑 **DỪNG CUỘC CHƠI** 🛑\n\n`;
  resultText += `👤 Người chơi: ${game.playerName}\n`;
  resultText += `📊 Đã chơi được: ${game.currentLevel - 1} câu\n`;
  resultText += `💰 Tiền thưởng nhận được: ${moneyText} VNĐ\n`;
  resultText += `⏱️ Thời gian chơi: ${Math.floor((Date.now() - game.startTime) / 1000)} giây\n\n`;
  resultText += `🎉 Cảm ơn bạn đã tham gia!`;

  // Cập nhật thành tích
  const points = Math.max(5, (game.currentLevel - 1) * 3);
  updateRankMiniGame(
    api.getBotId(),
    game.threadId,
    game.playerId,
    game.playerName,
    "Ai Là Triệu Phú",
    gameTypeAiLaTrieuPhu,
    points
  );

  const result = {
    success: true,
    message: resultText,
  };
  await sendMessageFromSQL(api, message, result, false, FINAL_MESSAGE_TIME_TO_LIVE);
  endGame(api, message, game.threadId, game);
}

// Hiển thị trạng thái game
async function showGameStatus(api, message, game) {
  const status = game.getGameStatus();
  const currentMoney = formatCurrency(status.currentMoney);
  const safeMoney = formatCurrency(status.safeMoney);

  let statusText = `📊 **TRẠNG THÁI GAME** 📊\n\n`;
  statusText += `👤 Người chơi: ${status.playerName}\n`;
  statusText += `📈 Câu hiện tại: ${status.currentLevel}/15\n`;
  statusText += `💰 Tiền thưởng hiện tại: ${currentMoney} VNĐ\n`;
  statusText += `🛡️ Mốc an toàn: ${safeMoney} VNĐ\n`;
  statusText += `⏱️ Thời gian đã chơi: ${status.timeElapsed} giây\n\n`;
  statusText += `💡 **Quyền trợ giúp:**\n`;
  statusText += `• 50:50: ${status.usedHelps.fifty50 ? "❌ Đã dùng" : "✅ Còn lại"}\n`;
  statusText += `• Hỏi khán giả: ${status.usedHelps.audience ? "❌ Đã dùng" : "✅ Còn lại"}\n`;
  statusText += `• Gọi điện: ${status.usedHelps.phone ? "❌ Đã dùng" : "✅ Còn lại"}`;

  const result = {
    success: true,
    message: statusText,
  };
  await sendMessageFromSQL(api, message, result, false, FINAL_MESSAGE_TIME_TO_LIVE);
}

// Xử lý tin nhắn trong game (cho các phản hồi tự nhiên)
export async function handleAiLaTrieuPhuMessage(api, message) {
  const threadId = message.threadId;
  const senderId = message.data.uidFrom;
  const content = message.data.content;

  if (typeof content !== "string") return false;

  const currentGame = getCurrentGame(threadId);

  if (!currentGame || !currentGame.isActive || currentGame.playerId !== senderId) {
    return false;
  }

  const input = content.trim().toLowerCase();

  // Kiểm tra đáp án trực tiếp
  if (["a", "b", "c", "d"].includes(input)) {
    await handleAnswer(api, message, currentGame, input.toUpperCase());
    return true;
  }

  // Kiểm tra các lệnh trợ giúp (gom alias)
  if (await handleHelpAlias(api, message, currentGame, input)) return true;

  return false;
}

// Gom alias xử lý quyền trợ giúp để tránh lặp code
async function handleHelpAlias(api, message, game, rawInput) {
  const s = (rawInput || "").toLowerCase().trim();
  // 50:50
  const fifty = ["5050", "50:50", "50-50", "fifty", "fifty50"];
  if (fifty.includes(s)) {
    await handleFiftyFifty(api, message, game);
    return true;
  }
  // Audience (hỏi khán giả)
  const audience = ["audience", "khanggia", "khán giả", "hoi", "hoikhangia"];
  if (audience.includes(s)) {
    await handleAudience(api, message, game);
    return true;
  }
  // Phone (gọi điện)
  const phone = ["phone", "goi", "gọi", "call", "dien thoai", "điện thoại"];
  if (phone.includes(s)) {
    await handlePhone(api, message, game);
    return true;
  }
  // Change question (đổi câu)
  const change = ["change", "changeq", "changequestion", "doi", "doicau", "đổi câu"];
  if (change.includes(s)) {
    await handleChangeQuestion(api, message, game);
    return true;
  }
  // Stop game (dừng chơi)
  const stop = ["stop", "dung", "quit", "dừng"];
  if (stop.includes(s)) {
    await handleStop(api, message, game);
    return true;
  }
  return false;
}
