import { MessageType } from "zlbotdqt";
import { getActiveGames, addGame, removeGame } from "./index.js";

export const gameTypeDoanTu = "Đoán Từ";

const words = [
  "zalo",
  "chatbot",
  "trò chơi",
  "lập trình",
  "thông minh nhân tạo",
  "mạng xã hội",
  "công nghệ",
  "internet",
  "điện thoại",
  "máy tính",
];

function chooseRandomWord() {
  const randomIndex = Math.floor(Math.random() * words.length);
  return words[randomIndex];
}

export async function handleWordGuessCommand(api, message, threadId, command) {
  if (command === "cancel") {
    await cancelWordGuessGame(api, message, threadId);
  } else {
    await startWordGuessGame(api, message, threadId);
  }
}

export async function startWordGuessGame(api, message, threadId) {
  const word = chooseRandomWord();
  const gameInstance = {
    type: gameTypeDoanTu,
    word: word,
    guesses: 0,
    maxGuesses: 10
  };

  addGame(threadId, gameTypeDoanTu, gameInstance);

  await api.sendMessage(
    {
      msg: "Trò chơi Đoán Từ đã bắt đầu! Hãy đoán từ có " + word.length + " chữ cái.",
      quote: message,
    },
    threadId,
    MessageType.GroupMessage
  );
}

export async function handleWordGuessGame(api, message) {
  const threadId = message.threadId;
  const threadGames = getActiveGames().get(threadId);
  if (!threadGames?.has(gameTypeDoanTu)) return;

  const game = threadGames.get(gameTypeDoanTu);
  const content = message.data.content.trim().toLowerCase();
  game.guesses++;

  if (content === game.word) {
    await api.sendMessage(
      { 
        msg: `Chúc mừng! Bạn đã đoán đúng từ "${game.word}" sau ${game.guesses} lần thử.`, 
        quote: message 
      },
      threadId,
      MessageType.GroupMessage
    );
    removeGame(threadId, gameTypeDoanTu);
  } else {
    await api.sendMessage(
      { 
        msg: "Đoán sai rồi! Hãy thử lại.", 
        quote: message 
      }, 
      threadId, 
      MessageType.GroupMessage
    );
  }

  if (game.guesses >= game.maxGuesses) {
    await api.sendMessage(
      { 
        msg: `Trò chơi kết thúc! Từ cần đoán là "${game.word}".`, 
        quote: message 
      },
      threadId,
      MessageType.GroupMessage
    );
    removeGame(threadId, gameTypeDoanTu);
  }
}

export async function cancelWordGuessGame(api, message, threadId) {
  const threadGames = getActiveGames().get(threadId);
  if (!threadGames?.has(gameTypeDoanTu)) {
    await api.sendMessage(
      { 
        msg: "Không có trò chơi Đoán Từ nào đang diễn ra để hủy.", 
        quote: message 
      },
      threadId,
      MessageType.GroupMessage
    );
    return;
  }

  const game = threadGames.get(gameTypeDoanTu);
  removeGame(threadId, gameTypeDoanTu);
  
  await api.sendMessage(
    { 
      msg: `Trò chơi Đoán Từ đã bị hủy. Từ cần đoán là: ${game.word}`, 
      quote: message 
    },
    threadId,
    MessageType.GroupMessage
  );
}
