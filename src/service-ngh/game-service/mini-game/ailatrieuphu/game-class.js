import path from "path";
import fs from "fs";
import { JSON_DATA_PATH } from "../../../../utils/io-json.js";

// Dữ liệu câu hỏi được import từ file JSON
let questionsData = null;

// Load dữ liệu câu hỏi
async function loadQuestionsData() {
  if (!questionsData) {
    try {
      const questionsPath = path.join(JSON_DATA_PATH, "ailatrieuphu-resource", "altp-questions.json");
      const data = JSON.parse(fs.readFileSync(questionsPath, "utf8"));
      questionsData = data;
    } catch (error) {
      console.error("Lỗi khi load dữ liệu câu hỏi:", error);
      questionsData = { questions: [] };
    }
  }
  return questionsData;
}

// Cấu trúc tiền thưởng cho từng cấp độ
const MONEY_LEVELS = [
  { level: 1, amount: 200000, milestone: false },
  { level: 2, amount: 400000, milestone: false },
  { level: 3, amount: 600000, milestone: false },
  { level: 4, amount: 1000000, milestone: false },
  { level: 5, amount: 2000000, milestone: true }, // Mốc an toàn
  { level: 6, amount: 3000000, milestone: false },
  { level: 7, amount: 6000000, milestone: false },
  { level: 8, amount: 10000000, milestone: false },
  { level: 9, amount: 14000000, milestone: false },
  { level: 10, amount: 22000000, milestone: true }, // Mốc an toàn
  { level: 11, amount: 30000000, milestone: false },
  { level: 12, amount: 40000000, milestone: false },
  { level: 13, amount: 60000000, milestone: false },
  { level: 14, amount: 85000000, milestone: false },
  { level: 15, amount: 150000000, milestone: true }, // Thắng cuộc
];

// Class quản lý game
export class AiLaTrieuPhuGame {
  constructor(threadId, playerId, playerName) {
    this.threadId = threadId;
    this.playerId = playerId;
    this.playerName = playerName;
    this.currentLevel = 1;
    this.currentQuestion = null;
    this.usedHelps = {
      fifty50: false,
      audience: false,
  phone: false,
  change: false,
    };
    this.isActive = true;
    this.timeout = null;
    this.startTime = Date.now();
    this.lastActivity = Date.now();
    this.removedOptions = null; // Lưu trữ các đáp án bị loại bởi 50:50
  }

  // Sử dụng quyền trợ giúp đổi câu hỏi (giữ nguyên level, thay câu khác)
  async useChangeQuestion() {
    if (this.usedHelps.change || !this.currentQuestion) return null;

    const sameLevel = this.currentLevel;
    // Lấy câu hỏi mới khác câu hiện tại (nếu có)
    const newQ = await this.getRandomQuestion(sameLevel);
    if (!newQ) return null;

    // Nếu trùng, cố gắng lấy lại vài lần
    let attempts = 3;
    let candidate = newQ;
    while (
      attempts-- > 0 &&
      candidate &&
      (candidate.id && this.currentQuestion.id ? candidate.id === this.currentQuestion.id : candidate.question === this.currentQuestion.question)
    ) {
      candidate = await this.getRandomQuestion(sameLevel);
    }

    this.usedHelps.change = true;
    this.currentQuestion = candidate || newQ;
    this.removedOptions = null; // reset loại bỏ nếu có
    this.lastActivity = Date.now();
    return this.currentQuestion;
  }

  // Lấy câu hỏi ngẫu nhiên theo level
  async getRandomQuestion(level) {
    const data = await loadQuestionsData();
    const questions = data.questions.filter((q) => q.level === level);
    if (questions.length === 0) return null;

    const randomIndex = Math.floor(Math.random() * questions.length);
    return questions[randomIndex];
  }

  // Bắt đầu câu hỏi mới
  async startNewQuestion() {
    this.currentQuestion = await this.getRandomQuestion(this.currentLevel);
    if (!this.currentQuestion) {
      return null;
    }

    this.lastActivity = Date.now();
    this.removedOptions = null; // Reset removed options cho câu hỏi mới
    return this.currentQuestion;
  }

  // Kiểm tra đáp án
  checkAnswer(answer) {
    if (!this.currentQuestion) return false;

    const correctLetter = this.currentQuestion.correctAnswer.letter;
    const answerLetter = answer.toUpperCase();

    return answerLetter === correctLetter;
  }

  // Lên level tiếp theo
  levelUp() {
    this.currentLevel++;
    this.currentQuestion = null;
    this.removedOptions = null;
  }

  // Lấy tiền thưởng hiện tại
  getCurrentMoney() {
    if (this.currentLevel <= 1) return 0;
    return MONEY_LEVELS[this.currentLevel - 2].amount;
  }

  // Lấy tiền thưởng khi trả lời đúng câu hiện tại
  getMoneyForCurrentLevel() {
    if (this.currentLevel > MONEY_LEVELS.length) return MONEY_LEVELS[MONEY_LEVELS.length - 1].amount;
    return MONEY_LEVELS[this.currentLevel - 1].amount;
  }

  // Lấy mốc an toàn gần nhất
  getSafeMoney() {
    for (let i = this.currentLevel - 1; i >= 0; i--) {
      if (MONEY_LEVELS[i] && MONEY_LEVELS[i].milestone) {
        return MONEY_LEVELS[i].amount;
      }
    }
    return 0;
  }

  // Sử dụng quyền trợ giúp 50:50
  use5050() {
    if (this.usedHelps.fifty50 || !this.currentQuestion) return null;

    this.usedHelps.fifty50 = true;
    const correctAnswer = this.currentQuestion.correctAnswer.letter;
    const options = ["A", "B", "C", "D"];
    const wrongOptions = options.filter((opt) => opt !== correctAnswer);

    // Loại bỏ 2 đáp án sai ngẫu nhiên
    const toRemove = [];
    while (toRemove.length < 2) {
      const randomIndex = Math.floor(Math.random() * wrongOptions.length);
      const option = wrongOptions[randomIndex];
      if (!toRemove.includes(option)) {
        toRemove.push(option);
      }
    }

    this.removedOptions = toRemove;
    return toRemove;
  }

  // Sử dụng quyền trợ giúp hỏi khán giả
  useAudience() {
    if (this.usedHelps.audience || !this.currentQuestion) return null;

    this.usedHelps.audience = true;
    const correctAnswer = this.currentQuestion.correctAnswer.letter;
    const options = ["A", "B", "C", "D"];

    // Tạo phần trăm ngẫu nhiên với bias về đáp án đúng
    const percentages = {};
    let total = 0;

    // Đáp án đúng có tỷ lệ cao hơn (40-70%)
    percentages[correctAnswer] = Math.floor(Math.random() * 31) + 40; // 40-70%
    total += percentages[correctAnswer];

    // Phân chia phần trăm còn lại cho các đáp án khác
    const remaining = 100 - total;
    const otherOptions = options.filter((opt) => opt !== correctAnswer);

    for (let i = 0; i < otherOptions.length; i++) {
      if (i === otherOptions.length - 1) {
        percentages[otherOptions[i]] = 100 - total;
      } else {
        const max = Math.floor(remaining / (otherOptions.length - i));
        percentages[otherOptions[i]] = Math.floor(Math.random() * (max + 1));
        total += percentages[otherOptions[i]];
      }
    }

    return percentages;
  }

  // Sử dụng quyền trợ giúp gọi điện
  usePhone() {
    if (this.usedHelps.phone || !this.currentQuestion) return null;

    this.usedHelps.phone = true;
    const correctAnswer = this.currentQuestion.correctAnswer.letter;

    // 80% khả năng bạn bè đưa ra đáp án đúng
    const isCorrect = Math.random() < 0.8;
    const advice = isCorrect ? correctAnswer : ["A", "B", "C", "D"][Math.floor(Math.random() * 4)];

    const confidence = isCorrect
      ? `Tôi khá chắc chắn là đáp án ${advice}`
      : `Tôi không chắc lắm, nhưng tôi nghĩ là đáp án ${advice}`;

    return { answer: advice, confidence };
  }

  // Dừng cuộc chơi
  stop() {
    this.isActive = false;
    if (this.timeout) {
      clearTimeout(this.timeout);
      this.timeout = null;
    }
  }

  // Lấy thông tin trạng thái game
  getGameStatus() {
    return {
      playerName: this.playerName,
      currentLevel: this.currentLevel,
      currentMoney: this.getCurrentMoney(),
      safeMoney: this.getSafeMoney(),
      usedHelps: { ...this.usedHelps },
      timeElapsed: Math.floor((Date.now() - this.startTime) / 1000),
      isActive: this.isActive
    };
  }
} 