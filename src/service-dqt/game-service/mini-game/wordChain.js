import { MessageMention } from "zlbotdqt";
import {
  getActiveGames,
  addGame,
  removeGame,
  addPlayer,
  getGamePlayerKey,
  getPlayerInfo,
  removePlayer,
  getGamePlayers,
} from "./index.js";
import { sendMessageFromSQL } from "../../chat-zalo/chat-style/chat-style.js";
import { removeMention } from "../../../utils/format-util.js";
import { updateRankMiniGame } from "../../info-service/rank-chat.js";
import { searchWordWikipedia } from "../../api-crawl/content/vietnam-word/wikipedia.js";
import {
  getInitialWord,
  getNextWordNoiTu,
  getNextWordNoiTuV2,
  getDataWordsCrawlByKeyWord,
  getWordNoiTuLocal,
  setBeginEndKeyword,
} from "../../api-crawl/content/vietnam-word/vietnam-word.js";
import { jobSendClock, sendReactionWaitingCountdown } from "../../../commands/manager-command/check-countdown.js";
import { vos_oaoeuy } from "../../../utils/format-text.js";
import { findRecentMessages, getRecentMessage } from "../../../commands/bot-manager/recent-message.js";
import { getMessageByThreadAndMsgId } from "../../../utils/message-cache.js";

export const gameTypeNoiTu = "Nối Từ";
const TURN_TIMEOUT = 30000;
const TIME_TO_LIVE = 86400000;
const WIN_POINT = 3;
const VALID_WORD_POINT = 1;
const LOSS_POINT = -5;
const MAX_INVALID_ATTEMPTS = 3;
const REQUIRED_WORD_COUNT = 2;
const playerCooldowns = new Map();
const waitingPlayerReplyCooldowns = {};
const COOLDOWN_DURATION = 2000;

const historyOutGame = {};
setInterval(() => {
  const now = Date.now();

  for (const botId in historyOutGame) {
    for (const threadId in historyOutGame[botId]) {
      for (const playerId in historyOutGame[botId][threadId]) {
        const playerData = historyOutGame[botId][threadId][playerId];

        if (now - playerData.lastTimeUpdate >= 3 * 60 * 1000) {
          if (playerData.count > 0) {
            playerData.count -= 1;
            playerData.lastTimeUpdate = now;
            // console.log(
            //   `Đã giảm count của player ${playerId} trong thread ${threadId}, bot ${botId} xuống còn ${playerData.count}`
            // );
          }
        }
      }
    }
  }
}, 60 * 1000);

function upCountOutGame(botId, threadId, playerId, count = 1) {
  if (!historyOutGame[botId]) historyOutGame[botId] = {};
  if (!historyOutGame[botId][threadId]) historyOutGame[botId][threadId] = {};
  if (!historyOutGame[botId][threadId][playerId])
    historyOutGame[botId][threadId][playerId] = {
      count: 0,
      lastTimeUpdate: Date.now(),
    };
  historyOutGame[botId][threadId][playerId].count += count;
  historyOutGame[botId][threadId][playerId].lastTimeUpdate = Date.now();
}

function subCountOutGame(botId, threadId, playerId, count = 1) {
  if (!historyOutGame[botId]) historyOutGame[botId] = {};
  if (!historyOutGame[botId][threadId]) historyOutGame[botId][threadId] = {};
  if (!historyOutGame[botId][threadId][playerId])
    historyOutGame[botId][threadId][playerId] = {
      count: 0,
      lastTimeUpdate: Date.now(),
    };
  historyOutGame[botId][threadId][playerId].count -= count;
  if (historyOutGame[botId][threadId][playerId].count < 0) historyOutGame[botId][threadId][playerId].count = 0;
  historyOutGame[botId][threadId][playerId].lastTimeUpdate = Date.now();
}

function getNextPlayer(players, currentPlayer) {
  const playerArray = Array.from(players);
  const playerIds = playerArray.map((player) => player[0]);
  const currentIndex = playerIds.indexOf(currentPlayer);
  return playerIds[(currentIndex + 1) % playerIds.length];
}

async function findNextPhrase(keyword, game) {
  try {
    // const [result, resultV2] = await Promise.all([getNextWordNoiTu(lastPhrase), getWordNoiTuLocal(lastPhrase)]);
    // const isValidResult = result.isValid || resultV2.end?.includes(lastPhrase);
    // const isWin = result.isWin || !resultV2.begin?.includes(lastPhrase);
    const resultV2 = await getWordNoiTuLocal(keyword);
    const isValidResult = resultV2.isValid && resultV2.end?.includes(keyword);
    const isWin = resultV2.begin.length === 0;
    if (isValidResult) {
      setBeginEndKeyword(keyword, { beginLength: resultV2.begin.length, endLength: resultV2.end.length });
      if (isWin) {
        return {
          nextWord: await getInitialWord(),
          isWin: true,
          isValid: true,
          reasonWin: "Đây là từ không có từ nào có thể ghép đôi thành từ có nghĩa",
          reason: "",
        };
      } else {
        try {
          const twoWordList = resultV2.begin.filter((word) => word.split(" ").length === 2);
          if (twoWordList.length === 0) {
            return {
              nextWord: await getInitialWord(),
              isWin: true,
              reasonWin: "Đây là từ không có từ nào có thể ghép đôi thành từ có nghĩa",
              isValid: true,
              reason: "",
            };
          }
          const unusedWords = twoWordList.filter((word) => !game.usedWords.has(word));
          if (unusedWords.length > 0) {
            const randomWord = unusedWords[Math.floor(Math.random() * unusedWords.length)];
            return { isValid: true, reason: "", nextWord: randomWord, isWin: false, reasonWin: "" };
          } else {
            return {
              isWin: true,
              reasonWin: "Những từ có thể ghép nối đều đã được sử dụng trước đó!!!",
              isValid: true,
              reason: "",
              nextWord: await getInitialWord(),
            };
          }
        } catch {}
      }
    }
  } catch (error) {
    console.error("Error calling word chain API:", error);
  }

  return { isValid: false, reason: "", nextWord: "", isWin: false, reasonWin: "" };
}

async function notifyNextPlayer(api, message, game, nextPlayerId, lastWord, oldPlayerName) {
  const threadId = message.threadId;
  const nextPlayerName = getPlayerInfo(threadId, gameTypeNoiTu, nextPlayerId)?.name;
  // const lastWordEndsWith = lastWord.split(/\s+/).pop();
  const isBotTurn = nextPlayerId === api.getBotId();

  if (!nextPlayerName) return false;

  const prefix = `👤 Đến lượt của <`;
  const notification = {
    msg: `${prefix}${nextPlayerName}>!\n\n🎯 ${oldPlayerName}: ${lastWord}.`,
    quote: message,
    mentions: [MessageMention(nextPlayerId, nextPlayerName.length, prefix.length)],
    ttl: TIME_TO_LIVE,
  };

  const msgSend = await api.sendMessage(notification, threadId, message.type);

  if (!isBotTurn) {
    await startTurnTimer(api, message, nextPlayerId, game, msgSend);
  }

  return true;
}

export async function vocabularyLookup(api, message, keyword) {
  if (!keyword) {
    const result = {
      success: false,
      message: "Vui lòng nhập từ khóa cần tra cứu",
    };
    await sendMessageFromSQL(api, message, result, false, TIME_TO_LIVE);
    return;
  }

  const cachedWord = getDataWordsCrawlByKeyWord(keyword);
  if (!cachedWord || Object.keys(cachedWord).length === 0) {
    const result = {
      success: false,
      message: "Từ này tôi không tìm thấy trong danh sách lưu trữ...",
    };
    await sendMessageFromSQL(api, message, result, false, TIME_TO_LIVE);
    return;
  }

  try {
    if (cachedWord.extract) {
      await sendMessageFromSQL(api, message, { success: true, message: cachedWord.extract }, true, TIME_TO_LIVE);
      return;
    }

    const response = await searchWordWikipedia(keyword);
    const isSuccess = response.status === "success";
    const result = {
      success: isSuccess,
      message: isSuccess ? response.data.extract : response.data.title,
    };

    await sendMessageFromSQL(api, message, result, isSuccess, TIME_TO_LIVE);
  } catch (error) {
    console.error("Error with vocabulary lookup:", error);
    await sendMessageFromSQL(
      api,
      message,
      { success: false, message: "Có lỗi xảy ra khi tra cứu từ điển" },
      false,
      TIME_TO_LIVE
    );
  }
}

export async function checkResultNoiTu(api, message, keyword) {
  if (!keyword) {
    const result = {
      success: false,
      message: "Vui lòng nhập từ khóa cần kiểm tra đáp án",
    };
    await sendMessageFromSQL(api, message, result, false, TIME_TO_LIVE);
    return;
  }

  try {
    const resultV2 = await getNextWordNoiTuV2(keyword);
    let caption;
    if (!resultV2 || !resultV2.begin) {
      caption = `Từ này không ghép được với từ nào để thành hai từ hợp lệ!`;
    } else {
      const wordList = resultV2.begin.filter((word) => word.split(" ").length === 2);
      if (wordList && wordList.length > 0) {
        caption = `Danh sách kết quả: ${wordList.join(", ")}!`;
      } else {
        caption = `Từ này không ghép được với từ nào để thành hai từ hợp lệ!`;
      }
    }

    const result = { message: caption };

    await sendMessageFromSQL(api, message, result, false, TIME_TO_LIVE);
  } catch (error) {
    console.error("Error with vocabulary lookup:", error);
    await sendMessageFromSQL(
      api,
      message,
      { success: false, message: "Có lỗi xảy ra khi check đáp án... vui lòng thử lại sau!" },
      false,
      TIME_TO_LIVE
    );
  }
}

async function startNewGameSession(api, message, game, winner = null) {
  const threadId = message.threadId;
  const botId = api.getBotId();

  game.usedWords.clear();
  game.invalidAttempts.clear();

  const initialWord = await getInitialWord();
  if (!initialWord) {
    await api.sendMessage(
      {
        msg: "🔴 Không thể khởi tạo trò chơi mới. Vui lòng thử lại sau!",
        quote: message,
        ttl: TIME_TO_LIVE,
      },
      threadId,
      message.type
    );
    return false;
  }

  game.lastPhrase = initialWord;
  game.usedWords.add(initialWord);

  const key = getGamePlayerKey(threadId, gameTypeNoiTu);
  const players = getGamePlayers().get(key);

  if (winner) {
    game.currentPlayer = winner;
  } else {
    game.currentPlayer = getNextPlayer(players, botId);
  }

  const nextPlayerName = getPlayerInfo(threadId, gameTypeNoiTu, game.currentPlayer)?.name;
  const prefix = `📝 Phiên game mới bắt đầu!\n👤 Đến lượt của <`;

  const msgSend = await api.sendMessage(
    {
      msg: `${prefix}${nextPlayerName}>!\n\n` + `🤖 Bot: ${initialWord}`,
      mentions: [MessageMention(game.currentPlayer, nextPlayerName.length, prefix.length)],
      ttl: TIME_TO_LIVE,
    },
    threadId,
    message.type
  );

  if (game.currentPlayer !== botId) {
    await startTurnTimer(api, message, game.currentPlayer, game, msgSend);
  }

  return true;
}

async function handleBotTurn(api, message, game, players, botPhraseIn = null) {
  const botId = api.getBotId();
  const threadId = message.threadId;
  const senderId = message.data.uidFrom;
  const senderName = message.data.dName;

  const botPhrase = botPhraseIn || (await findNextPhrase(game.lastPhrase, game));

  if (botPhrase.isValid && botPhrase.nextWord && !game.usedWords.has(botPhrase.nextWord)) {
    game.lastPhrase = botPhrase.nextWord;
    game.usedWords.add(botPhrase.nextWord);
    game.currentPlayer = getNextPlayer(players, botId);

    const nextPlayerName = getPlayerInfo(threadId, gameTypeNoiTu, game.currentPlayer)?.name;
    const checkWordBot = await findNextPhrase(game.lastPhrase, game);
    let msgSend;

    if (checkWordBot.isWin) {
      msgSend = await api.sendMessage(
        {
          msg: `🤖 Bot: ${game.lastPhrase}\nCụm từ bot đưa ra không có từ ghép nối hợp lệ, kết thúc phiên game này!`,
          quote: message,
          ttl: TIME_TO_LIVE,
        },
        threadId,
        message.type
      );
      await startNewGameSession(api, message, game, senderId);
    } else {
      const prefix = `👤 Đến lượt của <`;
      msgSend = await api.sendMessage(
        {
          msg: `${prefix}${nextPlayerName}>!\n\n` + `🤖 Bot: ${botPhrase.nextWord}`,
          quote: message,
          mentions: [MessageMention(game.currentPlayer, nextPlayerName.length, prefix.length)],
          ttl: TIME_TO_LIVE,
        },
        threadId,
        message.type
      );
    }

    if (game.currentPlayer !== botId) {
      await startTurnTimer(api, message, game.currentPlayer, game, msgSend);
    }

    return true;
  } else {
    const winPointWithBot = WIN_POINT - 1;
    const groupInfo = message.groupInfo || { name: "Unknown Group" };

    await api.sendMessage(
      {
        msg: `🤖 Bot không tìm được cụm từ phù hợp chưa được sử dụng => Bạn thắng với ${winPointWithBot} điểm! 🎉`,
        quote: message,
        ttl: TIME_TO_LIVE,
      },
      threadId,
      message.type
    );

    updateRankMiniGame(botId, threadId, senderId, senderName, groupInfo.name, gameTypeNoiTu, winPointWithBot);
    await startNewGameSession(api, message, game);

    return false;
  }
}

async function eliminatePlayer(api, message, playerId, reason, game) {
  if (!game) return false;

  const botId = api.getBotId();
  const threadId = message.threadId;
  const key = getGamePlayerKey(threadId, gameTypeNoiTu);
  const players = getGamePlayers().get(key);
  const namePlayer = getPlayerInfo(threadId, gameTypeNoiTu, playerId)?.name || "Unknown";

  removePlayer(threadId, gameTypeNoiTu, playerId);

  if (players.size <= 1) {
    game.currentPlayer = getNextPlayer(players, playerId);
    const playerWin = getPlayerInfo(threadId, gameTypeNoiTu, game.currentPlayer)?.name;

    await api.sendMessage(
      {
        msg: `🔴 Người chơi ${namePlayer} đã bị loại do ${reason} (${LOSS_POINT} điểm rank)!\n${
          game.currentPlayer === botId ? "Bot" : playerWin
        } chiến thắng phiên game này! 🎉`,
        mentions: [MessageMention(playerId, namePlayer.length, `🔴 Người chơi `.length)],
        ttl: TIME_TO_LIVE,
      },
      threadId,
      message.type
    );

    updateRankMiniGame(botId, threadId, playerId, namePlayer, null, gameTypeNoiTu, LOSS_POINT);
    cleanupGameNoiTu(threadId);
    return true;
  }

  updateRankMiniGame(botId, threadId, playerId, namePlayer, null, gameTypeNoiTu, LOSS_POINT);
  game.currentPlayer = getNextPlayer(players, playerId);
  const nextPlayerName = getPlayerInfo(threadId, gameTypeNoiTu, game.currentPlayer)?.name;
  const prefix = `🔴 Người chơi ${namePlayer} đã bị loại do ${reason} (${LOSS_POINT} điểm rank)!\n👤 Đến lượt của <`;
  const lastPhrase = game.lastPhrase;

  const msgSend = await api.sendMessage(
    {
      msg:
        `${prefix}${nextPlayerName}>!\n` + `🎯 Cụm từ tiếp theo phải bắt đầu bằng "${lastPhrase.split(/\s+/).pop()}".`,
      mentions: [
        MessageMention(playerId, namePlayer.length, `🔴 Người chơi `.length),
        MessageMention(game.currentPlayer, nextPlayerName.length, prefix.length),
      ],
      ttl: TIME_TO_LIVE,
    },
    threadId,
    message.type
  );

  if (game.currentPlayer !== botId) {
    await startTurnTimer(api, message, game.currentPlayer, game, msgSend);
    return false;
  } else {
    const validationResult = await findNextPhrase(lastPhrase, game);
    return await handleBotTurn(api, message, game, players, validationResult);
  }
}

export async function memberLeaveGameNoiTu(api, message) {
  const botId = api.getBotId();
  const threadId = message.threadId;
  const playerId = message.data.uidFrom;
  const threadGames = getActiveGames().get(threadId);
  const game = threadGames?.get(gameTypeNoiTu);
  upCountOutGame(botId, threadId, playerId);
  return await eliminatePlayer(api, message, playerId, "rời khỏi cuộc chơi", game);
}

async function startTurnTimer(api, message, playerId, game, msgSend) {
  const botId = api.getBotId();
  const threadId = message.threadId;
  const senderId = message.data.uidFrom;
  waitingPlayerReplyCooldowns[botId] ??= {};
  jobSendClock.cancelJobByKey(waitingPlayerReplyCooldowns[botId][threadId]);

  if (game.turnTimer) {
    clearTimeout(game.turnTimer);
  }

  game.turnTimer = setTimeout(async () => {
    upCountOutGame(botId, threadId, playerId, 3);
    await eliminatePlayer(api, message, playerId, "không trả lời trong 30 giây", game);
  }, TURN_TIMEOUT);

  waitingPlayerReplyCooldowns[botId][threadId] = `${senderId}_${threadId}_${gameTypeNoiTu}`;
  (async () => {
    await new Promise((resolve) => setTimeout(resolve, 1000));
    const msgGroupCache = await getMessageByThreadAndMsgId(botId, message.threadId, msgSend.message.msgId.toString());
    if (msgGroupCache) {
      msgGroupCache.data = { ...msgGroupCache };
      jobSendClock.addJob(api, msgGroupCache, 25, gameTypeNoiTu);
    }
  })();
}

async function handleInvalidAttempt(api, message, senderId, game, reason) {
  const botId = api.getBotId();
  const threadId = message.threadId;

  const attempts = (game.invalidAttempts.get(senderId) || 0) + 1;
  game.invalidAttempts.set(senderId, attempts);

  if (attempts >= MAX_INVALID_ATTEMPTS) {
    game.invalidAttempts.delete(senderId);
    upCountOutGame(botId, threadId, senderId);
    return await eliminatePlayer(api, message, senderId, "trả lời không hợp lệ 3 lần", game);
  }

  const result = {
    success: false,
    message: reason || "🔴 Từ này không hợp lệ! Vui lòng thử lại.",
  };
  const msgSend = await sendMessageFromSQL(api, message, result, false, TIME_TO_LIVE);
  await startTurnTimer(api, message, senderId, game, msgSend);

  return false;
}

export async function handleWordChainCommand(api, message) {
  const threadId = message.threadId;
  const senderId = message.data.uidFrom;
  const senderName = message.data.dName;
  const botId = api.getBotId();

  if (!historyOutGame[botId]) historyOutGame[botId] = {};
  if (!historyOutGame[botId][threadId]) historyOutGame[botId][threadId] = {};
  if (!historyOutGame[botId][threadId][senderId])
    historyOutGame[botId][threadId][senderId] = {
      count: 0,
      lastTimeUpdate: Date.now(),
    };
  const countOut = historyOutGame[botId][threadId][senderId].count;
  if (countOut >= 5) {
    const result = {
      success: false,
      message: `🔴 Bạn đã rời khỏi trò chơi quá nhiều lần bất hợp lệ, trong vài phút tới sẽ không được phép tham gia tiếp!`,
    };
    await sendMessageFromSQL(api, message, result, false, TIME_TO_LIVE);
    return;
  }

  const initialWord = await getInitialWord();
  if (!initialWord) {
    const result = {
      success: false,
      message: "🔴 Không thể khởi tạo trò chơi. Vui lòng thử lại sau!",
    };
    await sendMessageFromSQL(api, message, result, false, 30000);
    return;
  }

  const gameInstance = {
    type: gameTypeNoiTu,
    lastPhrase: initialWord,
    usedWords: new Set([initialWord]),
    currentPlayer: senderId,
    invalidAttempts: new Map(),
    turnTimer: null,
  };

  addGame(threadId, gameTypeNoiTu, gameInstance);
  addPlayer(threadId, gameTypeNoiTu, senderId, senderName);
  addPlayer(threadId, gameTypeNoiTu, botId, api.accountInfo.name);

  const result = {
    success: true,
    message:
      `📝 Trò chơi nối từ đã bắt đầu!\n` +
      `🤖 Bot bắt đầu với từ: "${initialWord}"\n` +
      `🎯 Cụm từ tiếp theo phải bắt đầu bằng "${initialWord.split(/\s+/).pop()}".\n\n` +
      `👤 Người chơi khác có thể tham gia bằng lệnh !noitu join`,
  };
  const msgSend = await sendMessageFromSQL(api, message, result, true, TIME_TO_LIVE);

  await startTurnTimer(api, message, senderId, gameInstance, msgSend);
}

export async function handleWordChainMessage(api, message, groupInfo) {
  const threadId = message.threadId;
  const senderId = message.data.uidFrom;
  const senderName = message.data.dName;
  const botId = api.getBotId();

  const threadGames = getActiveGames().get(threadId);
  const game = threadGames?.get(gameTypeNoiTu);

  if (!game || game.currentPlayer !== senderId) return false;

  const content = removeMention(message);
  const cleanContent = vos_oaoeuy(content).trim().toLowerCase();
  const wordCount = cleanContent.split(/\s+/).length;

  if (wordCount !== REQUIRED_WORD_COUNT) {
    return false;
    // return await handleInvalidAttempt(
    //   api,
    //   message,
    //   senderId,
    //   game,
    //   `🔴 Cụm từ phải chứa đúng ${REQUIRED_WORD_COUNT} từ! Vui lòng nhập lại.`
    // );
  }

  const lastWordEnding = vos_oaoeuy(game.lastPhrase.split(/\s+/).pop());
  if (!cleanContent.startsWith(lastWordEnding)) {
    return await handleInvalidAttempt(
      api,
      message,
      senderId,
      game,
      `🔴 Từ của bạn phải bắt đầu bằng "${lastWordEnding}"`
    );
  }

  if (game.usedWords.has(cleanContent)) {
    return await handleInvalidAttempt(
      api,
      message,
      senderId,
      game,
      "🔴 Từ này đã được sử dụng rồi! Vui lòng chọn từ khác."
    );
  }

  const lastGuessTime = playerCooldowns.get(`${threadId}-${senderId}`);
  const currentTime = Date.now();
  if (lastGuessTime && currentTime - lastGuessTime < COOLDOWN_DURATION) {
    const remainingTime = Math.ceil((COOLDOWN_DURATION - (currentTime - lastGuessTime)) / 1000);
    await sendReactionWaitingCountdown(api, message, remainingTime, gameTypeNoiTu);
    return false;
  } else {
    await api.addReaction("TIASET", [message]);
  }

  playerCooldowns.set(`${threadId}-${senderId}`, Date.now());

  const validationResult = await findNextPhrase(cleanContent, game);
  if (!validationResult.isValid) {
    return await handleInvalidAttempt(
      api,
      message,
      senderId,
      game,
      `🔴 Từ này không hợp lệ! Vui lòng nối từ khác có nghĩa và khớp với từ "${lastWordEnding}".`
    );
  }

  if (validationResult.isWin) {
    await api.sendMessage(
      {
        msg:
          `🤖 ${validationResult.reasonWin || "Đây là từ không có từ nào có thể ghép đôi thành từ có nghĩa"}` +
          "\n🎉 Bạn thắng ván này và dành được 3 điểm!!! 🎉",
        quote: message,
        ttl: TIME_TO_LIVE,
      },
      threadId,
      message.type
    );

    updateRankMiniGame(botId, threadId, senderId, senderName, groupInfo.name, gameTypeNoiTu, WIN_POINT);
    await startNewGameSession(api, message, game, senderId);
    return true;
  }

  game.invalidAttempts.delete(senderId);
  game.lastPhrase = cleanContent;
  game.usedWords.add(cleanContent);

  updateRankMiniGame(botId, threadId, senderId, senderName, groupInfo.name, gameTypeNoiTu, VALID_WORD_POINT);

  const key = getGamePlayerKey(threadId, gameTypeNoiTu);
  const players = getGamePlayers().get(key);
  game.currentPlayer = getNextPlayer(players, senderId);

  if (game.currentPlayer === botId) {
    return await handleBotTurn(api, message, game, players, validationResult);
  } else {
    return await notifyNextPlayer(api, message, game, game.currentPlayer, cleanContent, senderName);
  }
}

export function cleanupGameNoiTu(threadId) {
  const threadGames = getActiveGames().get(threadId);
  const game = threadGames?.get(gameTypeNoiTu);

  if (game?.turnTimer) {
    clearTimeout(game.turnTimer);
  }

  removeGame(threadId, gameTypeNoiTu);
}
