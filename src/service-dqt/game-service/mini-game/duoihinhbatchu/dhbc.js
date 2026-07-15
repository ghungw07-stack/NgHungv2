import fs from "fs";
import path from "path";
import { getActiveGames, addGame, removeGame, addPlayer } from "../index.js";
import { isAdmin } from "../../../../index.js";
import { sendReactionWaitingCountdown } from "../../../../commands/manager-command/check-countdown.js";
import {
  sendMessageCompleteRequest,
  sendMessageFromSQL,
  sendMessageImageNotQuote,
  sendMessageImageTag,
} from "../../../chat-zalo/chat-style/chat-style.js";
import { normalizeSymbolName, removeMention } from "../../../../utils/format-util.js";
import { getRankMiniGameInfo, updateRankMiniGame, usePointMiniGame } from "../../../info-service/rank-chat.js";
import { resourceDir } from "../../../../utils/io-json.js";

export const gameTypeDuoiHinhBatChu = "Đuổi Hình Bắt Chữ";
const COOLDOWN_DURATION = 3000;
const playerCooldowns = new Map();
const isCheckWinner = {};
const POINT_USE_MULTI = 5;
const TIME_TO_LIVE = 1000 * 60 * 60;

const DHBC_RESOURCE_PATH = path.join(resourceDir, "duoihinhbatchu");
const ANSWER_FILE_PATH = path.join(DHBC_RESOURCE_PATH, "answer.json");
const CHECKPOINT_FILE_PATH = path.join(DHBC_RESOURCE_PATH, "checkpoint-dhbc.json");
const IMAGE_FILE_PATH = path.join(DHBC_RESOURCE_PATH, "image");

function loadQuestionsData() {
  try {
    const data = fs.readFileSync(ANSWER_FILE_PATH, "utf8");
    return JSON.parse(data);
  } catch (error) {
    console.error("Lỗi khi đọc file answer.json:", error);
    return null;
  }
}

function loadCheckpointData() {
  try {
    const data = fs.readFileSync(CHECKPOINT_FILE_PATH, "utf8");
    return JSON.parse(data);
  } catch (error) {
    console.error("Lỗi khi đọc file checkpoint-dhbc.json:", error);
    return {};
  }
}

function saveCheckpointData(checkpointData) {
  try {
    fs.writeFileSync(CHECKPOINT_FILE_PATH, JSON.stringify(checkpointData, null, 2), "utf8");
  } catch (error) {
    console.error("Lỗi khi ghi file checkpoint-dhbc.json:", error);
  }
}

function getRandomQuestion(botId, threadId) {
  const questionsData = loadQuestionsData();
  if (!questionsData || !questionsData.questions) {
    return null;
  }

  const checkpointData = loadCheckpointData();
  const key = `${botId}_${threadId}`;

  if (!checkpointData[key]) {
    checkpointData[key] = {
      currentQuestionId: null,
      completedQuestions: [],
      revealedLetters: [],
    };
  }

  const botCheckpoint = checkpointData[key];
  const allQuestions = questionsData.questions;
  const completedIds = botCheckpoint.completedQuestions || [];

  const availableQuestions = allQuestions.filter((q) => !completedIds.includes(q.id));

  if (availableQuestions.length === 0) {
    botCheckpoint.completedQuestions = [];
    botCheckpoint.currentQuestionId = null;
    botCheckpoint.revealedLetters = [];
    saveCheckpointData(checkpointData);
    return getRandomQuestion(botId, threadId);
  }

  const randomIndex = Math.floor(Math.random() * availableQuestions.length);
  const selectedQuestion = availableQuestions[randomIndex];

  botCheckpoint.currentQuestionId = selectedQuestion.id;
  botCheckpoint.revealedLetters = [];
  saveCheckpointData(checkpointData);

  return selectedQuestion;
}

function getCurrentQuestion(botId, threadId) {
  const questionsData = loadQuestionsData();
  if (!questionsData || !questionsData.questions) {
    return null;
  }

  const checkpointData = loadCheckpointData();
  const key = `${botId}_${threadId}`;
  const botCheckpoint = checkpointData[key];

  if (!botCheckpoint || !botCheckpoint.currentQuestionId) {
    return null;
  }

  return questionsData.questions.find((q) => q.id === botCheckpoint.currentQuestionId);
}

function getRevealedLetters(botId, threadId) {
  const checkpointData = loadCheckpointData();
  const key = `${botId}_${threadId}`;
  const botCheckpoint = checkpointData[key];

  return botCheckpoint?.revealedLetters || [];
}

function saveRevealedLetters(botId, threadId, revealedLetters) {
  const checkpointData = loadCheckpointData();
  const key = `${botId}_${threadId}`;

  if (!checkpointData[key]) {
    checkpointData[key] = {
      currentQuestionId: null,
      completedQuestions: [],
      revealedLetters: [],
    };
  }

  checkpointData[key].revealedLetters = revealedLetters;
  saveCheckpointData(checkpointData);
}

function markQuestionCompleted(botId, threadId, questionId) {
  const checkpointData = loadCheckpointData();
  const key = `${botId}_${threadId}`;

  if (!checkpointData[key]) {
    checkpointData[key] = {
      currentQuestionId: null,
      completedQuestions: [],
      revealedLetters: [],
    };
  }

  const botCheckpoint = checkpointData[key];
  if (!botCheckpoint.completedQuestions.includes(questionId)) {
    botCheckpoint.completedQuestions.push(questionId);
  }
  botCheckpoint.currentQuestionId = null;
  botCheckpoint.revealedLetters = [];

  saveCheckpointData(checkpointData);
}

function getImagePath(questionId) {
  return path.join(IMAGE_FILE_PATH, `${questionId}.jpg`);
}

function createHint(answer) {
  const words = answer.split(" ");

  let hint = "";
  words.forEach((word, index) => {
    for (let i = 0; i < word.length; i++) {
      hint += "🔲";
    }

    if (index < words.length - 1) {
      hint += "  ";
    }
  });

  return hint;
}

function createHintWithRevealedLetters(answer, revealedLetters) {
  const words = answer.split(" ");
  let hint = "";
  let letterIndex = 0;

  words.forEach((word, wordIndex) => {
    for (let i = 0; i < word.length; i++) {
      if (revealedLetters.includes(letterIndex)) {
        hint += word[i].toUpperCase();
      } else {
        hint += "🔲";
      }
      letterIndex++;
    }

    if (wordIndex < words.length - 1) {
      hint += "  ";
    }
  });

  return hint;
}

function createLetterHints(answer) {
  const cleanedAnswer = normalizeSymbolName(answer);
  const letters = cleanedAnswer.replace(/\s/g, "").split("");

  const circledLetters = {
    a: "Ⓐ",
    b: "Ⓑ",
    c: "Ⓒ",
    d: "Ⓓ",
    e: "Ⓔ",
    f: "Ⓕ",
    g: "Ⓖ",
    h: "Ⓗ",
    i: "Ⓘ",
    j: "Ⓙ",
    k: "Ⓚ",
    l: "Ⓛ",
    m: "Ⓜ",
    n: "Ⓝ",
    o: "Ⓞ",
    p: "Ⓟ",
    q: "Ⓠ",
    r: "Ⓡ",
    s: "Ⓢ",
    t: "Ⓣ",
    u: "Ⓤ",
    v: "Ⓥ",
    w: "Ⓦ",
    x: "Ⓧ",
    y: "Ⓨ",
    z: "Ⓩ",
  };

  const hintLetters = [];

  letters.forEach((letter) => {
    const circledLetter = circledLetters[letter.toLowerCase()];
    if (circledLetter) {
      hintLetters.push(circledLetter);
    }
  });

  const fakeLetters = [
    "a",
    "b",
    "c",
    "d",
    "e",
    "f",
    "g",
    "h",
    "i",
    "j",
    "k",
    "l",
    "m",
    "n",
    "o",
    "p",
    "q",
    "r",
    "s",
    "t",
    "u",
    "v",
    "w",
    "x",
    "y",
    "z",
  ];

  const uniqueAnswerLetters = [...new Set(letters.map((l) => l.toLowerCase()))];
  const availableFakeLetters = fakeLetters.filter((letter) => !uniqueAnswerLetters.includes(letter.toLowerCase()));

  const neededFakeCount = 18 - hintLetters.length;
  let fakeIndex = 0;

  for (let i = 0; i < neededFakeCount && fakeIndex < availableFakeLetters.length; i++) {
    const circledLetter = circledLetters[availableFakeLetters[fakeIndex]];
    if (circledLetter) {
      hintLetters.push(circledLetter);
    }
    fakeIndex++;
  }

  for (let i = hintLetters.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [hintLetters[i], hintLetters[j]] = [hintLetters[j], hintLetters[i]];
  }

  return hintLetters.join(" ");
}

export async function startDuoiHinhBatChuGame(api, message, threadId) {
  const senderId = message.data.uidFrom;
  const senderName = message.data.dName;
  const botId = api.getBotId();

  let questionData = getCurrentQuestion(botId, threadId);

  if (!questionData) {
    questionData = getRandomQuestion(botId, threadId);
    if (!questionData) {
      const result = {
        success: false,
        message: `🔴 Có lỗi xảy ra khi khởi tạo trò chơi. Vui lòng thử lại sau.`,
      };
      await sendMessageFromSQL(api, message, result, true, 30000);
      return;
    }
  }

  const imagePath = getImagePath(questionData.id);

  const hint = createHint(questionData.answer);
  const letterHints = createLetterHints(questionData.answer);
  const revealedLetters = getRevealedLetters(botId, threadId);

  const gameInstance = {
    type: gameTypeDuoiHinhBatChu,
    questionId: questionData.id,
    answer: questionData.answer,
    imagePath: imagePath,
    hint: hint,
    letterHints: letterHints,
    guesses: 0,
    players: new Map(),
    revealedLetters: revealedLetters,
    questionMsgId: null,
  };

  const displayHint =
    revealedLetters.length > 0 ? createHintWithRevealedLetters(questionData.answer, revealedLetters) : hint;

  const result = {
    message:
      `📝 Trò chơi Đuổi Hình Bắt Chữ đã bắt đầu!` +
      `\n🎯 Hãy đoán từ dựa trên hình ảnh bên trên` +
      `\n\n📝 Đáp án (${questionData.answer.split(" ").length} từ): \n${displayHint}` +
      `\n🔤 Gợi ý chữ cái: ${letterHints}`,
  };
  const sentMsg = await sendMessageImageNotQuote(api, result, threadId, imagePath, TIME_TO_LIVE, true);
  gameInstance.questionMsgId = sentMsg?.data?.msgId || sentMsg?.msgId || null;

  addGame(threadId, gameTypeDuoiHinhBatChu, gameInstance);
  addPlayer(threadId, gameTypeDuoiHinhBatChu, senderId, senderName);
}

export async function checkIsWinDuoiHinhBatChu(api, message, botId, threadId) {
  isCheckWinner[botId] ??= {};
  isCheckWinner[botId][threadId] ??= null;

  if (isCheckWinner[botId][threadId]) {
    if (isCheckWinner[botId][threadId].type === "playerWin") {
      const result = {
        success: true,
        message: `🎯 Đáp án đã được giải bởi: ${isCheckWinner[botId][threadId].playerName}\nĐang chuẩn bị câu hỏi mới, vui lòng chờ...`,
      };
      await sendMessageFromSQL(api, message, result, true, TIME_TO_LIVE);
    } else if (isCheckWinner[botId][threadId].type === "adminResult") {
      const result = {
        success: true,
        message: `🎯 Admin ${isCheckWinner[botId][threadId].playerName} đã kết thúc phiên game\nĐang chuẩn bị câu hỏi mới, vui lòng chờ...`,
      };
      await sendMessageFromSQL(api, message, result, true, TIME_TO_LIVE);
    } else if (isCheckWinner[botId][threadId].type === "userResult") {
      const result = {
        success: true,
        message: `🎯 Người chơi ${isCheckWinner[botId][threadId].playerName} đã sử dụng quyền xem đáp án\nĐang chuẩn bị câu hỏi mới, vui lòng chờ...`,
      };
      await sendMessageFromSQL(api, message, result, true, TIME_TO_LIVE);
    }
    return true;
  }
  return false;
}

async function endAndStartNewGame(api, message, botId, threadId, senderName, game, isAdminUser) {
  const result = {
    success: true,
    message:
      `🎯 ${
        isAdminUser
          ? `Admin ${senderName} đã sử dụng quyền giải đáp án!`
          : `Người chơi ${senderName} đã sử dụng ${game.answer.length * POINT_USE_MULTI} điểm để giải đáp án!`
      } \n` + `Đáp án là: "${game.answer}"`,
  };
  await sendMessageFromSQL(api, message, result, true, TIME_TO_LIVE);

  await deleteQuestionImageMessage(api, message, game.questionMsgId);

  markQuestionCompleted(botId, threadId, game.questionId);
  removeGame(threadId, gameTypeDuoiHinhBatChu, false);

  const questionData = getRandomQuestion(botId, threadId);
  if (questionData) {
    const imagePath = getImagePath(questionData.id);
    const hint = createHint(questionData.answer);
    const letterHints = createLetterHints(questionData.answer);

    const revealedLetters = getRevealedLetters(botId, threadId);

    const newGameInstance = {
      type: gameTypeDuoiHinhBatChu,
      questionId: questionData.id,
      answer: questionData.answer,
      imagePath: imagePath,
      hint: hint,
      letterHints: letterHints,
      guesses: 0,
      players: new Map(),
      revealedLetters: revealedLetters,
      questionMsgId: null,
    };

    isCheckWinner[botId][threadId] = null;
    addGame(threadId, gameTypeDuoiHinhBatChu, newGameInstance);

    const displayHint =
      revealedLetters.length > 0 ? createHintWithRevealedLetters(questionData.answer, revealedLetters) : hint;

    const newGameMsg = {
      message:
        `🎮 Câu hỏi mới!\nHãy đoán từ dựa trên hình ảnh bên dưới:` +
        `\n\n📝 Đáp án (${questionData.answer.split(" ").length} từ): ${displayHint}` +
        `\n🔤 Gợi ý chữ cái: ${letterHints}`,
    };
    const sentMsg = await sendMessageImageNotQuote(api, newGameMsg, threadId, imagePath, TIME_TO_LIVE, true);
    newGameInstance.questionMsgId = sentMsg?.data?.msgId || sentMsg?.msgId || null;
  }
}

async function deleteQuestionImageMessage(api, message, questionMsgId) {
  if (!questionMsgId) return;

  try {
    await api.deleteMessage(
      {
        threadId: message.threadId,
        type: message.type,
        data: {
          msgId: questionMsgId,
          uidFrom: String(api.getBotId()),
        },
      },
      false,
      String(questionMsgId),
    );
  } catch (error) {
    console.error("Lỗi khi xóa ảnh câu hỏi DHBC:", error.message || error);
  }
}

export async function handleDuoiHinhBatChuGame(api, message, groupInfo) {
  const botId = api.getBotId();
  const threadId = message.threadId;
  const threadGames = getActiveGames().get(threadId);
  if (!threadGames?.has(gameTypeDuoiHinhBatChu)) return false;

  const senderId = message.data.uidFrom;
  const senderName = message.data.dName;
  const game = threadGames.get(gameTypeDuoiHinhBatChu);
  const content = removeMention(message).trim().toLowerCase();
  const isAdminLevelHighest = isAdmin(botId, senderId);

  if (content === "goiy") {
    if (await checkIsWinDuoiHinhBatChu(api, message, botId, threadId)) return true;

    const answerLettersOnly = game.answer.replace(/\s/g, "");
    const maxRevealCount = Math.ceil(answerLettersOnly.length * 0.2);
    const currentRevealCount = game.revealedLetters ? game.revealedLetters.length : 0;

    if (currentRevealCount >= maxRevealCount) {
      const result = {
        success: false,
        message: `🔒 Gợi ý đã được sử dụng tối đa mức cho phép (${maxRevealCount}/${maxRevealCount} chữ cái)!`,
      };
      await sendMessageFromSQL(api, message, result, true, 120000);
      await api.addReaction("TIEUTAN", [message]);
      return false;
    }

    if (!isAdminLevelHighest) {
      const infoRankPlayer = getRankMiniGameInfo(botId, threadId, gameTypeDuoiHinhBatChu, senderId);
      const pointRequest = (currentRevealCount + 1) * POINT_USE_MULTI;
      const currentPoint = infoRankPlayer?.Point || 0;

      if (!infoRankPlayer || currentPoint < pointRequest) {
        const result = {
          success: false,
          message: `Bạn không đủ ${currentPoint}/${pointRequest} điểm để sử dụng gợi ý!`,
        };
        await sendMessageFromSQL(api, message, result, true, 120000);
        await api.addReaction("TIEUTAN", [message]);
        return false;
      }

      usePointMiniGame(botId, threadId, gameTypeDuoiHinhBatChu, senderId, pointRequest);
    }

    const answerLettersForReveal = game.answer.replace(/\s/g, "");
    const revealedLetters = game.revealedLetters || [];
    const availablePositions = [];

    for (let i = 0; i < answerLettersForReveal.length; i++) {
      if (!revealedLetters.includes(i)) {
        availablePositions.push(i);
      }
    }

    if (availablePositions.length === 0) {
      const result = {
        success: false,
        message: `🔒 Tất cả chữ cái đã được tiết lộ!`,
      };
      await sendMessageFromSQL(api, message, result, true, 120000);
      return false;
    }

    const randomPosition = availablePositions[Math.floor(Math.random() * availablePositions.length)];
    revealedLetters.push(randomPosition);
    game.revealedLetters = revealedLetters;

    saveRevealedLetters(botId, threadId, revealedLetters);

    const newHint = createHintWithRevealedLetters(game.answer, revealedLetters);

    const result = {
      success: true,
      message: `💡 ${isAdminLevelHighest ? "Admin" : senderName} đã sử dụng gợi ý!${
        !isAdminLevelHighest ? ` (Tốn ${(currentRevealCount + 1) * POINT_USE_MULTI} điểm)` : ""
      }\n\n📝 Đáp án cập nhật: ${newHint}\n🔤 Gợi ý chữ cái: ${game.letterHints}\n\n📊 Đã tiết lộ: ${
        revealedLetters.length
      }/${maxRevealCount} chữ cái`,
    };
    await sendMessageFromSQL(api, message, result, false, TIME_TO_LIVE);
    return true;
  } else if (content === "check") {
    await api.addReaction("CLOCK", message);
    const hint =
      game.revealedLetters && game.revealedLetters.length > 0
        ? createHintWithRevealedLetters(game.answer, game.revealedLetters)
        : createHint(game.answer);
    const result = {
      imagePath: game.imagePath,
      caption:
        `🎯 Hãy đoán từ dựa trên hình ảnh bên trên` +
        `\n\n📝 Đáp án (${game.answer.split(" ").length} từ): ${hint}` +
        `\n🔤 Gợi ý chữ cái: ${game.letterHints}`,
    };
    await sendMessageImageTag(api, message, result, TIME_TO_LIVE);
    return true;
  }

  const contentReplyLower = content.toLowerCase().trim();
  const answerLower = game.answer.toLowerCase().trim();

  if (contentReplyLower === answerLower) {
    const lastGuessTime = playerCooldowns.get(`${threadId}-${senderId}`);
    const currentTime = Date.now();
    if (lastGuessTime && currentTime - lastGuessTime < COOLDOWN_DURATION) {
      const remainingTime = Math.ceil((COOLDOWN_DURATION - (currentTime - lastGuessTime)) / 1000);
      await sendReactionWaitingCountdown(api, message, remainingTime, gameTypeDuoiHinhBatChu);
      return false;
    }

    if (await checkIsWinDuoiHinhBatChu(api, message, botId, threadId)) return true;
    isCheckWinner[botId][threadId] = {
      type: "playerWin",
      playerName: senderName,
    };
    await api.addReaction("TIASET", [message]);
    playerCooldowns.set(`${threadId}-${senderId}`, currentTime);
    game.guesses++;
    if (!game.players.has(senderId)) {
      game.players.set(senderId, 0);
    }
    game.players.set(senderId, game.players.get(senderId) + 1);

    const result = {
      success: true,
      message: `🎉 Chúc mừng! Bạn đã đoán đúng từ "${game.answer}", +${game.answer.length} điểm 🎉.`,
    };
    await sendMessageFromSQL(api, message, result, false, TIME_TO_LIVE);
    updateRankMiniGame(
      botId,
      threadId,
      senderId,
      senderName,
      groupInfo.name,
      gameTypeDuoiHinhBatChu,
      game.answer.length
    );

    await deleteQuestionImageMessage(api, message, game.questionMsgId);

    markQuestionCompleted(botId, threadId, game.questionId);
    removeGame(threadId, gameTypeDuoiHinhBatChu, false);

    const questionData = getRandomQuestion(botId, threadId);
    if (questionData) {
      const imagePath = getImagePath(questionData.id);
      const hint = createHint(questionData.answer);
      const letterHints = createLetterHints(questionData.answer);

      const revealedLetters = getRevealedLetters(botId, threadId);

      const newGameInstance = {
        type: gameTypeDuoiHinhBatChu,
        questionId: questionData.id,
        answer: questionData.answer,
        imagePath: imagePath,
        hint: hint,
        letterHints: letterHints,
        guesses: 0,
        players: new Map(),
        revealedLetters: revealedLetters,
        questionMsgId: null,
      };

      isCheckWinner[botId][threadId] = null;
      addGame(threadId, gameTypeDuoiHinhBatChu, newGameInstance);

      const displayHint =
        revealedLetters.length > 0 ? createHintWithRevealedLetters(questionData.answer, revealedLetters) : hint;

      const result = {
        message:
          `🎮 Câu hỏi mới!\nHãy đoán từ dựa trên hình ảnh bên trên` +
          `\n\n📝 Đáp án (${questionData.answer.split(" ").length} từ): ${displayHint}` +
          `\n🔤 Gợi ý chữ cái: ${letterHints}`,
      };
      const sentMsg = await sendMessageImageNotQuote(api, result, threadId, imagePath, TIME_TO_LIVE, true);
      newGameInstance.questionMsgId = sentMsg?.data?.msgId || sentMsg?.msgId || null;
    }
  } else {
    const contentWords = contentReplyLower.split(/\s+/);
    const answerWords = answerLower.split(/\s+/);

    const isSameWordCount = contentWords.length === answerWords.length;
    const contentLetters = content.replace(/\s/g, "").toLowerCase();
    const answerLetters = game.answer.replace(/\s/g, "").toLowerCase();
    const isSameLetterCount = contentLetters.length === answerLetters.length;

    if (isSameWordCount && isSameLetterCount) {
      await api.addReaction("THING", message);
      const answerLettersArray = answerLetters.split("");
      const contentLettersArray = contentLetters.split("");

      let matchCount = 0;
      for (let i = 0; i < answerLettersArray.length; i++) {
        if (answerLettersArray[i] === contentLettersArray[i]) {
          matchCount++;
        }
      }

      const similarityPercentage = (matchCount / answerLettersArray.length) * 100;

      let answerLettersArrayNormalized = normalizeSymbolName(answerLetters).split("");
      let contentLettersArrayNormalized = normalizeSymbolName(contentLetters).split("");
      const allLettersInHints = answerLettersArrayNormalized.every((letter) =>
        contentLettersArrayNormalized.includes(letter)
      );

      if (similarityPercentage >= 80) {
        const result = {
          success: false,
          message: `❌ Bạn đã trả lời gần đúng, hãy suy nghĩ kỹ hơn chút!`,
        };
        await sendMessageFromSQL(api, message, result, false, TIME_TO_LIVE);
        return true;
      } else if (allLettersInHints) {
        const result = {
          success: false,
          message: `❌ Cố lên, gần với đáp án đúng rồi, suy nghĩ kỹ hơn nào!`,
        };
        await sendMessageFromSQL(api, message, result, false, TIME_TO_LIVE);
        return true;
      }
    }

    return false;
  }
  return true;
}
