import { createCanvas, loadImage } from "canvas";
import path from "path";
import { getFontCanvas, formatCurrency } from "../../../../utils/format-util.js";
import { writeFilePromise } from "../../../../utils/util.js";
import { JSON_DATA_PATH } from "../../../../utils/io-json.js";

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

// Vẽ canvas câu hỏi với thiết kế hiện đại và đẹp mắt
export async function drawQuestionCanvas(game) {
  const question = game.currentQuestion;
  if (!question) return null;

  const width = 1200;
  const height = 900;
  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext("2d");

  // Helpers
  const RES_PATH = path.join(JSON_DATA_PATH, "ailatrieuphu-resource", "res");
  const DRAWABLE = path.join(RES_PATH, "drawable-xhdpi");
  const loadDrawable = async (file) => {
    try {
      return await loadImage(path.join(DRAWABLE, file));
    } catch {
      return null;
    }
  };
  const wrapText = (ctx2, text, maxWidth) => {
    const words = (text || "").split(" ");
    const lines = [];
    let line = "";
    for (const w of words) {
      const test = line + w + " ";
      if (ctx2.measureText(test).width > maxWidth && line !== "") {
        lines.push(line.trim());
        line = w + " ";
      } else {
        line = test;
      }
    }
    if (line.trim()) lines.push(line.trim());
    return lines;
  };
  const drawTimer = (x, y, r, ratio, text) => {
    // outer ring
    ctx.save();
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.strokeStyle = "#263238";
    ctx.lineWidth = 8;
    ctx.stroke();
    // progress
    ctx.beginPath();
    ctx.strokeStyle = "#FFB300";
    ctx.lineCap = "round";
    ctx.lineWidth = 8;
    ctx.arc(x, y, r, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * ratio, false);
    ctx.stroke();
    // text
    ctx.font = "bold 18px Arial";
    ctx.fillStyle = "#FFFFFF";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(String(text), x, y);
    ctx.restore();
  };

  // Background (xanh đậm giống app)
  const bg = ctx.createLinearGradient(0, 0, 0, height);
  bg.addColorStop(0, "#0b1a3a");
  bg.addColorStop(1, "#0a1330");
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, width, height);

  // Thanh thông tin trên cùng (level + tiền + timer)
  const topBarH = 80;
  ctx.fillStyle = "#11224a";
  ctx.fillRect(0, 0, width, topBarH);
  ctx.strokeStyle = "#1f3b73";
  ctx.lineWidth = 2;
  ctx.strokeRect(0, 0, width, topBarH);

  // Câu/Level
  ctx.font = "bold 28px " + getFontCanvas("Câu");
  ctx.fillStyle = "#FFFFFF";
  ctx.textAlign = "left";
  ctx.textBaseline = "middle";
  ctx.fillText(`Câu: ${game.currentLevel}/15`, 30, topBarH / 2);

  // Mức thưởng câu này (gần giống hiển thị TV level)
  const currentMoney = formatCurrency(game.getMoneyForCurrentLevel());
  ctx.font = "bold 24px " + getFontCanvas("Tiền");
  ctx.fillStyle = "#FFD54F";
  ctx.textAlign = "center";
  ctx.fillText(`Mức thưởng: ${currentMoney} VNĐ`, width / 2, topBarH / 2);

  // Timer vòng tròn giống ProgressBar
  const totalTime = 60;
  const timeLeft = typeof game.timerLeft === "number" ? Math.max(0, Math.min(totalTime, game.timerLeft)) : totalTime;
  drawTimer(width - 70, topBarH / 2, 26, timeLeft / totalTime, timeLeft);

  // Khung câu hỏi (một thanh dài bo góc)
  const qX = 60;
  const qY = topBarH + 30;
  const qW = width - 120;
  const qH = 150; // tăng chiều cao để hiển thị rõ hơn
  const qGrad = ctx.createLinearGradient(0, qY, 0, qY + qH);
  qGrad.addColorStop(0, "#1f356e");
  qGrad.addColorStop(1, "#162a5a");
  ctx.fillStyle = qGrad;
  ctx.beginPath();
  ctx.roundRect(qX, qY, qW, qH, 14);
  ctx.fill();
  ctx.strokeStyle = "#4b71c1";
  ctx.lineWidth = 3;
  ctx.stroke();

  // Nội dung câu hỏi (wrap trung tâm)
  ctx.font = "bold 28px " + getFontCanvas(question.question); // tăng kích thước chữ câu hỏi
  ctx.fillStyle = "#E3F2FD";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  const qLines = wrapText(ctx, question.question, qW - 40);
  const qLineH = 34; // line-height lớn hơn cho dễ đọc
  const qTotalH = qLines.length * qLineH;
  let qStartY = qY + (qH - qTotalH) / 2 + qLineH / 2;
  qLines.forEach((line, i) => ctx.fillText(line, qX + qW / 2, qStartY + i * qLineH));

  // Dải đáp án: 4 thanh xếp dọc như Android
  const ansX = 90;
  const ansY = qY + qH + 30;
  const ansW = width - 180;
  const ansH = 88; // tăng chiều cao đáp án
  const ansGap = 26; // tăng khoảng cách giữa các đáp án

  const bgNormal = await loadDrawable("player_answer_background_normal.png");
  const bgHide = await loadDrawable("player_answer_background_hide.png");

  const options = [
    { letter: "A", text: question.options?.A ?? question.caseA },
    { letter: "B", text: question.options?.B ?? question.caseB },
    { letter: "C", text: question.options?.C ?? question.caseC },
    { letter: "D", text: question.options?.D ?? question.caseD },
  ];

  const removed = Array.isArray(game.removedOptions) ? game.removedOptions : [];

  for (let i = 0; i < options.length; i++) {
    const opt = options[i];
    const y = ansY + i * (ansH + ansGap);
    const isRemoved = removed.includes(opt.letter);

    // Vẽ nền từ drawable gốc nếu có, fallback gradient nếu thiếu file
    if (isRemoved && bgHide) {
      ctx.drawImage(bgHide, ansX, y, ansW, ansH);
    } else if (!isRemoved && bgNormal) {
      ctx.drawImage(bgNormal, ansX, y, ansW, ansH);
    } else {
      const g = ctx.createLinearGradient(ansX, y, ansX, y + ansH);
      g.addColorStop(0, isRemoved ? "#424242" : "#1d4e96");
      g.addColorStop(1, isRemoved ? "#3a3a3a" : "#123b78");
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.roundRect(ansX, y, ansW, ansH, 12);
      ctx.fill();
      ctx.strokeStyle = isRemoved ? "#616161" : "#64B5F6";
      ctx.lineWidth = isRemoved ? 2 : 3;
      ctx.stroke();
    }

    // Text đáp án dạng "A: ..." giống Android
    ctx.textAlign = "left";
    ctx.textBaseline = "middle";
    ctx.font = "bold 24px " + getFontCanvas("Answer"); // nhãn đáp án lớn hơn
    ctx.fillStyle = isRemoved ? "#B0BEC5" : "#FFF59D";
    const label = `${opt.letter}:`;
    const labelX = ansX + 48;
    const labelY = y + ansH / 2;
    ctx.fillText(label, labelX, labelY);

    // Nội dung phương án (wrap trong thanh)
    const textX = labelX + ctx.measureText(label + "  ").width;
    const textMaxW = ansW - (textX - ansX) - 20;
    ctx.font = "22px " + getFontCanvas(opt.text); // chữ đáp án lớn hơn
    ctx.fillStyle = isRemoved ? "#9E9E9E" : "#FFFFFF";

    if (!isRemoved) {
      const lines = wrapText(ctx, opt.text || "", textMaxW);
      const maxLines = 2;
      const lineH = 24; // line-height đáp án lớn hơn
      const firstY = labelY - ((Math.min(lines.length, maxLines) - 1) * lineH) / 2;
      for (let li = 0; li < Math.min(lines.length, maxLines); li++) {
        ctx.fillText(lines[li], textX, firstY + li * lineH);
      }
    }
  }

  // Panel quyền trợ giúp: dùng icon gốc của app
  const helpPanelY = height - 120;
  const helpPanelH = 90; // cao hơn để icon & caption rõ hơn
  const helpPanelX = 90;
  const helpPanelW = width - 180;
  ctx.fillStyle = "#0f2048";
  ctx.beginPath();
  ctx.roundRect(helpPanelX, helpPanelY, helpPanelW, helpPanelH, 12);
  ctx.fill();
  ctx.strokeStyle = "#2a4e9f";
  ctx.lineWidth = 2;
  ctx.stroke();

  const helpDefs = [
    {
      key: "fifty50",
      file: "player_button_image_help_5050.png",
      fileUsed: "player_button_image_help_5050_x.png",
      label: "50:50",
    },
    {
      key: "audience",
      file: "player_button_image_help_audience.png",
      fileUsed: "player_button_image_help_audience_x.png",
      label: "Khán giả",
    },
    {
      key: "phone",
      file: "player_button_image_help_call.png",
      fileUsed: "player_button_image_help_call_x.png",
      label: "Điện thoại",
    },
    {
      key: "change",
      file: "player_button_image_help_change_question.png",
      fileUsed: "player_button_image_help_change_question_x.png",
      label: "Đổi câu",
    },
    {
      key: "stop",
      file: "player_button_image_help_stop.png",
      fileUsed: "player_button_image_help_stop_active.png",
      label: "Dừng",
    },
  ];

  const helpsUsed = game?.usedHelps || { fifty50: false, audience: false, phone: false };
  const icons = await Promise.all(
    helpDefs.map(async (h) => {
      const used = Boolean(helpsUsed[h.key]);
      const img = await loadDrawable(used && h.fileUsed ? h.fileUsed : h.file);
      return { img, used, label: h.label };
    })
  );

  const itemW = 68,
    itemH = 68; // icon to hơn một chút
  const gap = (helpPanelW - icons.length * itemW) / (icons.length + 1);
  let curX = helpPanelX + gap;
  for (const it of icons) {
    if (it.img) {
      ctx.drawImage(it.img, curX, helpPanelY + (helpPanelH - itemH) / 2, itemW, itemH);
    } else {
      // fallback button
      ctx.fillStyle = it.used ? "#6d1b1b" : "#1b5e20";
      ctx.beginPath();
      ctx.roundRect(curX, helpPanelY + (helpPanelH - itemH) / 2, itemW, itemH, 8);
      ctx.fill();
    }
    // label dưới icon
    ctx.font = "bold 14px Arial"; // chữ lớn & đậm hơn
    const labelY = helpPanelY + helpPanelH - 18;
    // shadow nhẹ cho rõ hơn
    ctx.fillStyle = "rgba(0,0,0,0.6)";
    ctx.textAlign = "center";
    ctx.textBaseline = "top";
    ctx.fillText(it.label, curX + itemW / 2, labelY + 1);
    // màu chữ chính
    ctx.fillStyle = it.used ? "#FFE0E0" : "#FFFFFF";
    ctx.fillText(it.label, curX + itemW / 2, labelY);
    curX += itemW + gap;
  }

  // Lưu ảnh
  const filePath = path.resolve(`./assets/temp/ailatrieuphu_${game.threadId}_${Date.now()}.png`);
  await writeFilePromise(filePath, canvas.toBuffer());

  return filePath;
}

// Tạo voice cho câu hỏi với các tùy chọn âm thanh
export async function createQuestionVoice(game, options = {}) {
  try {
    const question = game.currentQuestion;
    if (!question) return null;

    const level = game.currentLevel;
    const money = formatCurrency(game.getMoneyForCurrentLevel());
    const isMilestone = MONEY_LEVELS[level - 1].milestone;

    // Tạo text cho voice với nhiều phiên bản
    let voiceText = "";

    if (options.includeIntro !== false) {
      if (level === 1) {
        voiceText += "Chào mừng đến với Ai Là Triệu Phú! ";
      } else if (isMilestone) {
        voiceText += `Bạn đã đến mốc an toàn ${money} đồng. `;
      }
    }

    voiceText += `Câu hỏi số ${level}`;

    if (options.includeMoney !== false) {
      voiceText += `, mức tiền thưởng ${money} đồng`;
    }

    voiceText += ". ";

    if (options.includeQuestion !== false) {
      voiceText += question.question + " ";
    }

    if (options.includeOptions !== false) {
      voiceText += `Đáp án A: ${question.options.A}. `;
      voiceText += `Đáp án B: ${question.options.B}. `;
      voiceText += `Đáp án C: ${question.options.C}. `;
      voiceText += `Đáp án D: ${question.options.D}. `;
    }

    if (options.includePrompt !== false) {
      voiceText += "Bạn chọn đáp án nào?";
    }

    return {
      text: voiceText,
      audioFiles: getQuestionAudioPath(level),
      suggested: getSuggestedAudioSequence(level, question),
    };
  } catch (error) {
    console.error("Lỗi tạo voice:", error);
    return null;
  }
}

// Tạo voice cho kết quả trả lời
export function createAnswerResultVoice(game, selectedAnswer, isCorrect, correctAnswer) {
  try {
    let voiceText = "";
    const level = game.currentLevel;
    const money = formatCurrency(game.getMoneyForCurrentLevel());

    if (isCorrect) {
      voiceText = `Chính xác! Đáp án ${selectedAnswer} là đúng. `;

      if (level === 15) {
        voiceText += `Chúc mừng! Bạn đã hoàn thành tất cả 15 câu hỏi và giành được ${money} đồng!`;
      } else if (MONEY_LEVELS[level - 1].milestone) {
        voiceText += `Bạn đã đạt mốc an toàn với ${money} đồng. `;
      } else {
        voiceText += `Bạn đã giành được ${money} đồng. `;
      }
    } else {
      voiceText = `Rất tiếc, đáp án ${selectedAnswer} không chính xác. `;
      voiceText += `Đáp án đúng là ${correctAnswer}. `;

      // Tìm mốc an toàn
      let safeMoney = 0;
      for (let i = level - 1; i >= 0; i--) {
        if (MONEY_LEVELS[i].milestone) {
          safeMoney = MONEY_LEVELS[i].amount;
          break;
        }
      }

      if (safeMoney > 0) {
        voiceText += `Bạn vẫn giữ được ${formatCurrency(safeMoney)} đồng từ mốc an toàn.`;
      } else {
        voiceText += "Chúc bạn may mắn lần sau!";
      }
    }

    return {
      text: voiceText,
      audioFiles: getAnswerAudioPath(isCorrect, correctAnswer),
    };
  } catch (error) {
    console.error("Lỗi tạo voice kết quả:", error);
    return null;
  }
}

// Tạo voice cho quyền trợ giúp
export function createHelpVoice(helpType, helpData) {
  try {
    let voiceText = "";

    switch (helpType) {
      case "fifty50":
        voiceText = "Quyền trợ giúp 50:50 đã được sử dụng. Hai đáp án sai đã bị loại bỏ.";
        break;

      case "audience":
        if (helpData && helpData.results) {
          voiceText = "Kết quả hỏi ý kiến khán giả: ";
          Object.entries(helpData.results).forEach(([option, percentage]) => {
            voiceText += `Đáp án ${option}: ${percentage}%. `;
          });
        } else {
          voiceText = "Khán giả đã bỏ phiếu. Hãy xem kết quả trên màn hình.";
        }
        break;

      case "phone":
        if (helpData && helpData.expert && helpData.suggestion) {
          voiceText = `Chuyên gia ${helpData.expert} gợi ý: ${helpData.suggestion}`;
        } else {
          voiceText = "Chuyên gia đã đưa ra lời khuyên. Quyết định cuối cùng thuộc về bạn.";
        }
        break;

      default:
        voiceText = "Quyền trợ giúp đã được sử dụng.";
    }

    return {
      text: voiceText,
      audioFiles: getHelpAudioPath(helpType),
    };
  } catch (error) {
    console.error("Lỗi tạo voice trợ giúp:", error);
    return null;
  }
}

// Gợi ý trình tự âm thanh cho câu hỏi
function getSuggestedAudioSequence(level, question) {
  const audioPath = path.join(JSON_DATA_PATH, "ailatrieuphu-resource", "res", "raw");

  return {
    intro: level === 1 ? null : `${audioPath}/ready.mp3`,
    question: `${audioPath}/ques${level}.mp3`,
    background: `${audioPath}/background_music.mp3`,
    thinking: `${audioPath}/background_music_b.mp3`, // Nhạc nền khi suy nghĩ
  };
}

// Lấy đường dẫn âm thanh cho kết quả trả lời
function getAnswerAudioPath(isCorrect, correctAnswer) {
  const audioPath = path.join(JSON_DATA_PATH, "ailatrieuphu-resource", "res", "raw");

  if (isCorrect) {
    return {
      result: `${audioPath}/true_${correctAnswer.toLowerCase()}.mp3`,
      celebration: `${audioPath}/chuc_mung_vuot_moc_01_0.mp3`,
    };
  } else {
    return {
      result: `${audioPath}/lose_${correctAnswer.toLowerCase()}.mp3`,
      correct: `${audioPath}/true_${correctAnswer.toLowerCase()}.mp3`,
      background: `${audioPath}/lose.mp3`,
    };
  }
}

// Lấy đường dẫn âm thanh cho quyền trợ giúp
function getHelpAudioPath(helpType) {
  const audioPath = path.join(JSON_DATA_PATH, "ailatrieuphu-resource", "res", "raw");

  switch (helpType) {
    case "fifty50":
      return {
        main: `${audioPath}/sound5050.mp3`,
        background: `${audioPath}/background_music.mp3`,
      };
    case "audience":
      return {
        main: `${audioPath}/khan_gia.mp3`,
        background: `${audioPath}/background_music_b.mp3`,
      };
    case "phone":
      return {
        main: `${audioPath}/help_call.mp3`,
        background: `${audioPath}/background_music_c.mp3`,
      };
    default:
      return {
        main: `${audioPath}/touch_sound.mp3`,
      };
  }
}

// Lấy đường dẫn file âm thanh theo level (phiên bản mở rộng)
export function getQuestionAudioPath(level) {
  const audioPath = path.join(JSON_DATA_PATH, "ailatrieuphu-resource", "res", "raw");

  // Kiểm tra file âm thanh cho câu hỏi (có nhiều phiên bản)
  const questionFiles = {
    main: `ques${level}.mp3`,
    alternative: `ques${level}_b.mp3`, // Phiên bản thay thế nếu có
  };

  // File âm thanh cho đáp án
  const answerFiles = {
    A: [`ans_a.mp3`, `ans_a2.mp3`],
    B: [`ans_b.mp3`, `ans_b2.mp3`],
    C: [`ans_c.mp3`, `ans_c2.mp3`],
    D: [`ans_d.mp3`, `ans_d2.mp3`],
  };

  // File âm thanh cho kết quả
  const resultFiles = {
    correct: {
      A: [`true_a.mp3`, `true_a2.mp3`, `true_a3.mp3`],
      B: [`true_b.mp3`, `true_b2.mp3`, `true_b3.mp3`],
      C: [`true_c.mp3`, `true_c2.mp3`, `true_c3.mp3`],
      D: [`true_d2.mp3`, `true_d3.mp3`], // true_d.mp3 không có trong danh sách
    },
    wrong: {
      A: [`lose_a.mp3`, `lose_a2.mp3`],
      B: [`lose_b.mp3`, `lose_b2.mp3`],
      C: [`lose_c.mp3`, `lose_c2.mp3`],
      D: [`lose_d.mp3`, `lose_d2.mp3`],
    },
  };

  // Background music theo level
  let backgroundMusic = "background_music.mp3";
  if (level >= 5 && level < 10) {
    backgroundMusic = "background_music_b.mp3";
  } else if (level >= 10) {
    backgroundMusic = "background_music_c.mp3";
  }

  return {
    // Đường dẫn đầy đủ cho các file
    question: {
      main: path.join(audioPath, questionFiles.main),
      alternative: path.join(audioPath, questionFiles.alternative),
    },
    answers: {
      A: answerFiles.A.map((file) => path.join(audioPath, file)),
      B: answerFiles.B.map((file) => path.join(audioPath, file)),
      C: answerFiles.C.map((file) => path.join(audioPath, file)),
      D: answerFiles.D.map((file) => path.join(audioPath, file)),
    },
    results: {
      correct: {
        A: resultFiles.correct.A.map((file) => path.join(audioPath, file)),
        B: resultFiles.correct.B.map((file) => path.join(audioPath, file)),
        C: resultFiles.correct.C.map((file) => path.join(audioPath, file)),
        D: resultFiles.correct.D.map((file) => path.join(audioPath, file)),
      },
      wrong: {
        A: resultFiles.wrong.A.map((file) => path.join(audioPath, file)),
        B: resultFiles.wrong.B.map((file) => path.join(audioPath, file)),
        C: resultFiles.wrong.C.map((file) => path.join(audioPath, file)),
        D: resultFiles.wrong.D.map((file) => path.join(audioPath, file)),
      },
    },
    background: path.join(audioPath, backgroundMusic),
    help: {
      fifty50: [path.join(audioPath, "sound5050.mp3"), path.join(audioPath, "sound5050_2.mp3")],
      audience: path.join(audioPath, "khan_gia.mp3"),
      phone: [path.join(audioPath, "help_call.mp3"), path.join(audioPath, "help_callb.mp3")],
    },
    special: {
      timeout: path.join(audioPath, "out_of_time.mp3"),
      gameStart: path.join(audioPath, "gofind.mp3"),
      milestone: [
        path.join(audioPath, "chuc_mung_vuot_moc_01_0.mp3"),
        path.join(audioPath, "chuc_mung_vuot_moc_01_1.mp3"),
        path.join(audioPath, "chuc_mung_vuot_moc_02_0.mp3"),
      ],
      winner: path.join(audioPath, "best_player.mp3"),
      lose: [path.join(audioPath, "lose.mp3"), path.join(audioPath, "lose2.mp3")],
      ready: [
        path.join(audioPath, "ready.mp3"),
        path.join(audioPath, "ready_b.mp3"),
        path.join(audioPath, "ready_c.mp3"),
      ],
      important: path.join(audioPath, "important.mp3"),
      touch: path.join(audioPath, "touch_sound.mp3"),
    },
  };
}

// Utility function để chọn ngẫu nhiên file âm thanh từ mảng
export function getRandomAudioFile(audioArray) {
  if (Array.isArray(audioArray) && audioArray.length > 0) {
    return audioArray[Math.floor(Math.random() * audioArray.length)];
  }
  return audioArray;
}

// Kiểm tra file âm thanh có tồn tại không
export function checkAudioFileExists(filePath) {
  try {
    return require("fs").existsSync(filePath);
  } catch (error) {
    console.error("Lỗi kiểm tra file âm thanh:", error);
    return false;
  }
}

// Tạo playlist âm thanh cho một sequence hoàn chỉnh
export function createAudioPlaylist(level, sequence = "question") {
  const audioPaths = getQuestionAudioPath(level);
  const playlist = [];

  switch (sequence) {
    case "question":
      playlist.push({
        file: audioPaths.question.main,
        type: "question",
        description: `Câu hỏi số ${level}`,
      });
      break;

    case "correct_answer":
      playlist.push({
        file: getRandomAudioFile(audioPaths.special.milestone),
        type: "celebration",
        description: "Chúc mừng trả lời đúng",
      });
      break;

    case "wrong_answer":
      playlist.push({
        file: getRandomAudioFile(audioPaths.special.lose),
        type: "lose",
        description: "Trả lời sai",
      });
      break;

    case "help_fifty50":
      playlist.push({
        file: getRandomAudioFile(audioPaths.help.fifty50),
        type: "help",
        description: "Quyền trợ giúp 50:50",
      });
      break;

    case "help_audience":
      playlist.push({
        file: audioPaths.help.audience,
        type: "help",
        description: "Hỏi ý kiến khán giả",
      });
      break;

    case "help_phone":
      playlist.push({
        file: getRandomAudioFile(audioPaths.help.phone),
        type: "help",
        description: "Gọi điện cho người thân",
      });
      break;

    case "game_start":
      playlist.push({
        file: audioPaths.special.gameStart,
        type: "intro",
        description: "Bắt đầu game",
      });
      break;

    case "milestone":
      playlist.push({
        file: getRandomAudioFile(audioPaths.special.milestone),
        type: "milestone",
        description: "Đạt mốc an toàn",
      });
      break;

    case "winner":
      playlist.push({
        file: audioPaths.special.winner,
        type: "victory",
        description: "Chiến thắng cuối cùng",
      });
      break;
  }

  // Thêm background music nếu cần
  if (["question", "help_fifty50", "help_audience", "help_phone"].includes(sequence)) {
    playlist.push({
      file: audioPaths.background,
      type: "background",
      description: "Nhạc nền",
      loop: true,
      volume: 0.3,
    });
  }

  return playlist;
}

// Vẽ canvas kết quả Hỏi ý kiến khán giả
export async function drawAudienceCanvas(game, percentages) {
  try {
    const width = 1000;
    const height = 700;
    const padding = 60;
    const canvas = createCanvas(width, height);
    const ctx = canvas.getContext("2d");

    // Background theo tông màu game
    const bg = ctx.createLinearGradient(0, 0, 0, height);
    bg.addColorStop(0, "#0b1a3a");
    bg.addColorStop(1, "#0a1330");
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, width, height);

    // Header
    ctx.fillStyle = "#11224a";
    ctx.fillRect(0, 0, width, 80);
    ctx.strokeStyle = "#1f3b73";
    ctx.lineWidth = 2;
    ctx.strokeRect(0, 0, width, 80);

    ctx.font = "bold 30px " + getFontCanvas("Hỏi ý kiến khán giả");
    ctx.fillStyle = "#FFD54F";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("👥 HỎI Ý KIẾN KHÁN GIẢ", width / 2, 40);

    // Thông tin câu/level
    ctx.font = "bold 22px " + getFontCanvas("Level");
    ctx.fillStyle = "#FFFFFF";
    ctx.textAlign = "left";
    ctx.fillText(`Câu: ${game.currentLevel}/15`, padding, 110);

    // Khu vực biểu đồ
    const chartX = padding + 20;
    const chartY = 150;
    const chartW = width - chartX - padding;
    const chartH = height - chartY - 140;

    // Trục và khung
    ctx.strokeStyle = "#2a4e9f";
    ctx.lineWidth = 2;
    ctx.strokeRect(chartX, chartY, chartW, chartH);

    // Đường lưới ngang 20% một vạch
    ctx.save();
    ctx.strokeStyle = "rgba(255,255,255,0.12)";
    ctx.lineWidth = 1;
    ctx.setLineDash([6, 6]);
    for (let p = 20; p < 100; p += 20) {
      const y = chartY + chartH * (1 - p / 100);
      ctx.beginPath();
      ctx.moveTo(chartX, y);
      ctx.lineTo(chartX + chartW, y);
      ctx.stroke();
      // Nhãn phần trăm bên trái
      ctx.font = "14px Arial";
      ctx.fillStyle = "rgba(255,255,255,0.7)";
      ctx.textAlign = "right";
      ctx.textBaseline = "middle";
      ctx.fillText(`${p}%`, chartX - 8, y);
    }
    ctx.restore();

    // Dữ liệu và cột
    const opts = ["A", "B", "C", "D"];
    const values = opts.map((k) => Math.max(0, Math.min(100, Number(percentages?.[k] ?? 0))));
    const maxVal = Math.max(...values, 1);
    const barGap = 40;
    const barWidth = (chartW - barGap * (opts.length + 1)) / opts.length;

    // Tìm cột cao nhất để highlight
    const maxIndex = values.indexOf(maxVal);

    for (let i = 0; i < opts.length; i++) {
      const val = values[i];
      const h = (val / 100) * chartH;
      const x = chartX + barGap + i * (barWidth + barGap);
      const y = chartY + (chartH - h);

      // Gradient màu cột
      const grad = ctx.createLinearGradient(0, y, 0, y + h);
      if (i === maxIndex) {
        grad.addColorStop(0, "#ffb300");
        grad.addColorStop(1, "#ff6f00");
      } else {
        grad.addColorStop(0, "#1d4e96");
        grad.addColorStop(1, "#123b78");
      }
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.roundRect(x, y, barWidth, h, 8);
      ctx.fill();

      // Viền
      ctx.strokeStyle = i === maxIndex ? "#ffd54f" : "#64B5F6";
      ctx.lineWidth = i === maxIndex ? 3 : 2;
      ctx.strokeRect(x, y, barWidth, h);

      // Phần trăm phía trên
      ctx.font = "bold 22px " + getFontCanvas("%");
      ctx.fillStyle = "#FFFFFF";
      ctx.textAlign = "center";
      ctx.textBaseline = "bottom";
      ctx.fillText(`${val}%`, x + barWidth / 2, y - 8);

      // Nhãn A/B/C/D dưới cột
      ctx.font = "bold 24px " + getFontCanvas("Option");
      ctx.textBaseline = "top";
      ctx.fillText(opts[i], x + barWidth / 2, chartY + chartH + 10);
    }

    // Gợi ý dưới cùng
    ctx.font = "24px Arial";
    ctx.fillStyle = "rgba(255,255,255,0.85)";
    ctx.textAlign = "center";
    ctx.fillText("Khán giả đã bỏ phiếu. Quyết định cuối cùng thuộc về bạn!", width / 2, height - 40);

    const filePath = path.resolve(`./assets/temp/ailatrieuphu_audience_${game.threadId}_${Date.now()}.png`);
    await writeFilePromise(filePath, canvas.toBuffer());
    return filePath;
  } catch (e) {
    console.error("Lỗi vẽ canvas Audience:", e);
    return null;
  }
}

// Vẽ canvas quyền trợ giúp: Gọi điện
export async function drawPhoneCanvas(game, advice) {
  try {
    const width = 1000;
    const height = 600;
    const canvas = createCanvas(width, height);
    const ctx = canvas.getContext("2d");

    // Nền gradient xanh tím nhẹ
    const bg = ctx.createLinearGradient(0, 0, width, height);
    bg.addColorStop(0, "#0b1a3a");
    bg.addColorStop(1, "#16213E");
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, width, height);

    // Header
    ctx.fillStyle = "#11224a";
    ctx.fillRect(0, 0, width, 70);
    ctx.strokeStyle = "#1f3b73";
    ctx.lineWidth = 2;
    ctx.strokeRect(0, 0, width, 70);
    ctx.font = "bold 28px " + getFontCanvas("Gọi điện");
    ctx.fillStyle = "#FFD54F";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("📞 GỌI ĐIỆN CHO BẠN BÈ", width / 2, 35);

    // Khung hội thoại
    const boxX = 80, boxY = 120, boxW = width - 160, boxH = height - 220;
    ctx.fillStyle = "rgba(255,255,255,0.08)";
    ctx.beginPath();
    ctx.roundRect(boxX, boxY, boxW, boxH, 16);
    ctx.fill();
    ctx.strokeStyle = "rgba(255,255,255,0.25)";
    ctx.lineWidth = 2;
    ctx.strokeRect(boxX, boxY, boxW, boxH);

    // Icon avatar và thông tin
    ctx.font = "56px Arial";
    ctx.textAlign = "left";
    ctx.textBaseline = "middle";
    ctx.fillText("👨‍🎓", boxX + 24, boxY + 40);
    ctx.font = "bold 26px " + getFontCanvas("Chuyên gia");
    ctx.fillStyle = "#FFFFFF";
    ctx.fillText("Bạn bè tư vấn", boxX + 90, boxY + 40);

    // Nội dung lời khuyên
    const contentX = boxX + 40;
    const contentY = boxY + 100;
    const contentW = boxW - 80;
    ctx.font = "22px " + getFontCanvas("Advice");
    ctx.fillStyle = "#E3F2FD";
    ctx.textAlign = "left";
    const lines = (advice?.confidence || "Tôi nghĩ đáp án hợp lý nhất là ...").match(/.{1,60}(\s|$)/g) || [];
    let y = contentY;
    for (const line of lines) {
      ctx.fillText(line.trim(), contentX, y);
      y += 32;
    }

    // Gợi ý đáp án cụ thể
    ctx.font = "bold 28px " + getFontCanvas("Đáp án");
    ctx.fillStyle = "#FFD700";
    ctx.textAlign = "center";
    const suggest = advice?.answer ? `Gợi ý: ${advice.answer}` : "Hãy cân nhắc thật kỹ";
    ctx.fillText(suggest, boxX + boxW / 2, boxY + boxH - 40);

    // Footer
    ctx.font = "18px Arial";
    ctx.fillStyle = "rgba(255,255,255,0.85)";
    ctx.textAlign = "center";
    ctx.fillText("Cuộc gọi đã kết thúc. Quyết định cuối cùng thuộc về bạn!", width / 2, height - 30);

    const filePath = path.resolve(`./assets/temp/ailatrieuphu_phone_${game.threadId}_${Date.now()}.png`);
    await writeFilePromise(filePath, canvas.toBuffer());
    return filePath;
  } catch (e) {
    console.error("Lỗi vẽ canvas Phone:", e);
    return null;
  }
}

// Vẽ canvas kết quả trả lời (đúng/sai)
export async function drawAnswerResultCanvas(game, selectedAnswer, isCorrect, correctAnswer) {
  const width = 1200;
  const height = 600;
  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext("2d");

  // Background với hiệu ứng gradient động
  const bgGradient = ctx.createRadialGradient(
    width / 2,
    height / 2,
    0,
    width / 2,
    height / 2,
    Math.max(width, height) / 2
  );
  if (isCorrect) {
    bgGradient.addColorStop(0, "#2E7D32"); // Xanh lá thành công
    bgGradient.addColorStop(0.5, "#388E3C");
    bgGradient.addColorStop(1, "#1B5E20");
  } else {
    bgGradient.addColorStop(0, "#D32F2F"); // Đỏ thất bại
    bgGradient.addColorStop(0.5, "#F44336");
    bgGradient.addColorStop(1, "#B71C1C");
  }
  ctx.fillStyle = bgGradient;
  ctx.fillRect(0, 0, width, height);

  // Hiệu ứng trang trí
  ctx.save();
  ctx.globalAlpha = 0.1;
  ctx.strokeStyle = "#FFFFFF";
  ctx.lineWidth = 2;
  for (let i = 0; i < 10; i++) {
    ctx.beginPath();
    ctx.arc(Math.random() * width, Math.random() * height, Math.random() * 50 + 10, 0, Math.PI * 2);
    ctx.stroke();
  }
  ctx.restore();

  // Main result container
  const containerHeight = 400;
  const containerY = (height - containerHeight) / 2;

  // Background container với viền
  ctx.fillStyle = "rgba(255, 255, 255, 0.1)";
  ctx.fillRect(100, containerY, width - 200, containerHeight);

  ctx.strokeStyle = "rgba(255, 255, 255, 0.3)";
  ctx.lineWidth = 3;
  ctx.strokeRect(100, containerY, width - 200, containerHeight);

  // Icon và text chính
  const iconSize = 80;
  const iconY = containerY + 60;

  ctx.font = `${iconSize}px Arial`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";

  if (isCorrect) {
    ctx.fillStyle = "#4CAF50";
    ctx.fillText("✅", width / 2, iconY);

    ctx.font = "bold 48px " + getFontCanvas("CHÍNH XÁC!");
    ctx.fillStyle = "#FFFFFF";
    ctx.fillText("CHÍNH XÁC!", width / 2, iconY + 80);

    ctx.font = "28px " + getFontCanvas("Chúc mừng");
    ctx.fillText("Bạn đã trả lời đúng!", width / 2, iconY + 130);
  } else {
    ctx.fillStyle = "#F44336";
    ctx.fillText("❌", width / 2, iconY);

    ctx.font = "bold 48px " + getFontCanvas("SAI RỒI!");
    ctx.fillStyle = "#FFFFFF";
    ctx.fillText("SAI RỒI!", width / 2, iconY + 80);

    ctx.font = "28px " + getFontCanvas("Đáp án đúng");
    ctx.fillText("Đáp án đúng là:", width / 2, iconY + 130);

    ctx.font = "bold 32px " + getFontCanvas("Đáp án");
    ctx.fillStyle = "#FFD700";
    ctx.fillText(`${correctAnswer}`, width / 2, iconY + 170);
  }

  // Level và money info
  const currentMoney = formatCurrency(MONEY_LEVELS[game.currentLevel - 1].amount);
  ctx.font = "24px " + getFontCanvas("Money");
  ctx.fillStyle = "#FFFFFF";
  ctx.textAlign = "center";

  if (isCorrect) {
    ctx.fillText(`Bạn đã giành được: ${currentMoney} VNĐ`, width / 2, iconY + 200);
  } else {
    // Tìm mốc an toàn gần nhất
    let safeMoney = 0;
    for (let i = game.currentLevel - 1; i >= 0; i--) {
      if (MONEY_LEVELS[i].milestone) {
        safeMoney = MONEY_LEVELS[i].amount;
        break;
      }
    }
    const safeMoneyText = formatCurrency(safeMoney);
    ctx.fillText(`Số tiền còn lại: ${safeMoneyText} VNĐ`, width / 2, iconY + 200);
  }

  // Footer
  ctx.font = "18px Arial";
  ctx.fillStyle = "rgba(255, 255, 255, 0.8)";
  ctx.fillText("🎮 Ai Là Triệu Phú Bot", width / 2, height - 30);

  // Lưu canvas
  const filePath = path.resolve(`./assets/temp/ailatrieuphu_result_${game.threadId}_${Date.now()}.png`);
  await writeFilePromise(filePath, canvas.toBuffer());

  return filePath;
}

// Vẽ canvas tổng kết game
export async function drawGameSummaryCanvas(game, finalMoney, totalCorrectAnswers, isWinner = false) {
  const width = 1200;
  const height = 800;
  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext("2d");

  // Background gradient theo kết quả
  const bgGradient = ctx.createLinearGradient(0, 0, 0, height);
  if (isWinner) {
    bgGradient.addColorStop(0, "#FF6F00"); // Vàng chiến thắng
    bgGradient.addColorStop(0.5, "#FF8F00");
    bgGradient.addColorStop(1, "#E65100");
  } else {
    bgGradient.addColorStop(0, "#1A237E"); // Xanh thông thường
    bgGradient.addColorStop(0.5, "#283593");
    bgGradient.addColorStop(1, "#1A1A2E");
  }
  ctx.fillStyle = bgGradient;
  ctx.fillRect(0, 0, width, height);

  // Header
  ctx.font = "bold 42px " + getFontCanvas("Kết quả");
  ctx.fillStyle = "#FFD700";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText("🏆 KẾT QUẢ CUỐI GAME 🏆", width / 2, 60);

  // Player info container
  const playerContainer = {
    x: 100,
    y: 120,
    width: width - 200,
    height: 150,
  };

  ctx.fillStyle = "rgba(255, 255, 255, 0.1)";
  ctx.fillRect(playerContainer.x, playerContainer.y, playerContainer.width, playerContainer.height);

  ctx.strokeStyle = "#FFD700";
  ctx.lineWidth = 3;
  ctx.strokeRect(playerContainer.x, playerContainer.y, playerContainer.width, playerContainer.height);

  // Player name
  ctx.font = "bold 32px " + getFontCanvas("Player");
  ctx.fillStyle = "#FFFFFF";
  ctx.fillText(`👤 ${game.playerName}`, width / 2, playerContainer.y + 50);

  // Final result
  const finalMoneyText = formatCurrency(finalMoney);
  ctx.font = "bold 36px " + getFontCanvas("Money");
  ctx.fillStyle = "#4CAF50";
  if (isWinner) {
    ctx.fillStyle = "#FFD700";
    ctx.fillText("🎉 CHIẾN THẮNG! 🎉", width / 2, playerContainer.y + 100);
    ctx.font = "bold 28px " + getFontCanvas("Money");
    ctx.fillText(`Giải thưởng: ${finalMoneyText} VNĐ`, width / 2, playerContainer.y + 135);
  } else {
    ctx.fillText(`Tiền thắng: ${finalMoneyText} VNĐ`, width / 2, playerContainer.y + 100);
    ctx.font = "24px " + getFontCanvas("Correct");
    ctx.fillStyle = "#81C784";
    ctx.fillText(`Trả lời đúng: ${totalCorrectAnswers}/15 câu`, width / 2, playerContainer.y + 135);
  }

  // Stats container
  const statsContainer = {
    x: 100,
    y: 300,
    width: width - 200,
    height: 300,
  };

  ctx.fillStyle = "rgba(255, 255, 255, 0.05)";
  ctx.fillRect(statsContainer.x, statsContainer.y, statsContainer.width, statsContainer.height);

  ctx.strokeStyle = "rgba(255, 255, 255, 0.2)";
  ctx.lineWidth = 2;
  ctx.strokeRect(statsContainer.x, statsContainer.y, statsContainer.width, statsContainer.height);

  // Stats title
  ctx.font = "bold 28px " + getFontCanvas("Thống kê");
  ctx.fillStyle = "#FFFFFF";
  ctx.fillText("📊 THỐNG KÊ CHI TIẾT", width / 2, statsContainer.y + 40);

  // Progress bar cho từng level
  const progressBarWidth = statsContainer.width - 100;
  const progressBarHeight = 20;
  const progressBarX = statsContainer.x + 50;
  let progressBarY = statsContainer.y + 80;

  // Background cho tất cả levels
  ctx.fillStyle = "#37474F";
  ctx.fillRect(progressBarX, progressBarY, progressBarWidth, progressBarHeight);

  // Fill cho levels đã hoàn thành
  const completedWidth = (totalCorrectAnswers / 15) * progressBarWidth;
  const progressGradient = ctx.createLinearGradient(
    progressBarX,
    progressBarY,
    progressBarX + completedWidth,
    progressBarY
  );
  progressGradient.addColorStop(0, "#4CAF50");
  progressGradient.addColorStop(1, "#8BC34A");
  ctx.fillStyle = progressGradient;
  ctx.fillRect(progressBarX, progressBarY, completedWidth, progressBarHeight);

  // Markers cho milestones
  [5, 10, 15].forEach((milestone) => {
    const markerX = progressBarX + (milestone / 15) * progressBarWidth;
    ctx.fillStyle = milestone <= totalCorrectAnswers ? "#FFD700" : "#666666";
    ctx.fillRect(markerX - 1, progressBarY - 5, 2, progressBarHeight + 10);

    ctx.font = "12px Arial";
    ctx.textAlign = "center";
    ctx.fillText(milestone.toString(), markerX, progressBarY - 10);
  });

  // Help usage stats
  progressBarY += 60;
  ctx.font = "20px " + getFontCanvas("Helps");
  ctx.fillStyle = "#FFFFFF";
  ctx.textAlign = "left";
  ctx.fillText("Quyền trợ giúp đã sử dụng:", progressBarX, progressBarY);

  const helps = [
    { name: "50:50", icon: "⚡", used: game.usedHelps.fifty50 },
    { name: "Hỏi khán giả", icon: "👥", used: game.usedHelps.audience },
    { name: "Gọi điện", icon: "📞", used: game.usedHelps.phone },
  ];

  progressBarY += 30;
  helps.forEach((help, index) => {
    const helpX = progressBarX + index * 200;

    ctx.fillStyle = help.used ? "#F44336" : "#4CAF50";
    ctx.fillText(`${help.icon} ${help.name}: ${help.used ? "Đã dùng" : "Chưa dùng"}`, helpX, progressBarY);
  });

  // Achievement badges
  progressBarY += 60;
  ctx.font = "18px " + getFontCanvas("Achievements");
  ctx.fillStyle = "#FFD700";
  ctx.textAlign = "center";
  ctx.fillText("🏅 THÀNH TÍCH ĐẠT ĐƯỢC", width / 2, progressBarY);

  progressBarY += 40;
  const achievements = [];

  if (totalCorrectAnswers >= 5) achievements.push("🥉 Vượt qua 5 câu hỏi");
  if (totalCorrectAnswers >= 10) achievements.push("🥈 Vượt qua 10 câu hỏi");
  if (totalCorrectAnswers >= 15) achievements.push("🥇 Hoàn thành tất cả câu hỏi");
  if (!game.usedHelps.fifty50 && !game.usedHelps.audience && !game.usedHelps.phone) {
    achievements.push("💎 Không sử dụng quyền trợ giúp");
  }

  ctx.font = "16px Arial";
  ctx.fillStyle = "#FFFFFF";
  achievements.forEach((achievement, index) => {
    ctx.fillText(achievement, width / 2, progressBarY + index * 25);
  });

  // Footer
  ctx.font = "16px Arial";
  ctx.fillStyle = "rgba(255, 255, 255, 0.7)";
  ctx.textAlign = "center";
  ctx.fillText("Cảm ơn bạn đã chơi Ai Là Triệu Phú! 🎮", width / 2, height - 40);
  ctx.fillText(`Thời gian: ${new Date().toLocaleString("vi-VN")}`, width / 2, height - 20);

  // Lưu canvas
  const filePath = path.resolve(`./assets/temp/ailatrieuphu_summary_${game.threadId}_${Date.now()}.png`);
  await writeFilePromise(filePath, canvas.toBuffer());

  return filePath;
}

// Vẽ canvas bảng xếp hạng tiền thưởng
export async function drawMoneyLadderCanvas(currentLevel, highlightLevel = null) {
  const width = 500;
  const height = 800;
  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext("2d");

  // Background
  const bgGradient = ctx.createLinearGradient(0, 0, 0, height);
  bgGradient.addColorStop(0, "#1A1A2E");
  bgGradient.addColorStop(0.5, "#16213E");
  bgGradient.addColorStop(1, "#0F3460");
  ctx.fillStyle = bgGradient;
  ctx.fillRect(0, 0, width, height);

  // Header
  ctx.font = "bold 24px Arial";
  ctx.fillStyle = "#FFD700";
  ctx.textAlign = "center";
  ctx.fillText("💰 BẢNG TIỀN THƯỞNG", width / 2, 40);

  // Money ladder
  const itemHeight = 45;
  const startY = 80;

  MONEY_LEVELS.slice()
    .reverse()
    .forEach((level, index) => {
      const actualLevel = 15 - index;
      const y = startY + index * itemHeight;
      const isCurrentLevel = actualLevel === currentLevel;
      const isHighlighted = actualLevel === highlightLevel;
      const isPassed = actualLevel < currentLevel;

      // Background cho item
      if (isCurrentLevel) {
        ctx.fillStyle = "#FF6B35"; // Màu cam cho level hiện tại
      } else if (isHighlighted) {
        ctx.fillStyle = "#4CAF50"; // Màu xanh cho highlight
      } else if (isPassed) {
        ctx.fillStyle = "#2E7D32"; // Màu xanh đậm cho đã qua
      } else if (level.milestone) {
        ctx.fillStyle = "#FFD700"; // Màu vàng cho milestone
      } else {
        ctx.fillStyle = "rgba(255, 255, 255, 0.1)";
      }

      ctx.fillRect(50, y - 15, width - 100, itemHeight - 5);

      // Viền
      if (isCurrentLevel || isHighlighted) {
        ctx.strokeStyle = "#FFFFFF";
        ctx.lineWidth = 3;
        ctx.strokeRect(50, y - 15, width - 100, itemHeight - 5);
      }

      // Level number
      ctx.font = "bold 16px Arial";
      ctx.fillStyle = "#FFFFFF";
      ctx.textAlign = "left";
      ctx.fillText(`${actualLevel}`, 70, y + 5);

      // Money amount
      ctx.textAlign = "right";
      const moneyText = formatCurrency(level.amount) + " VNĐ";
      ctx.fillText(moneyText, width - 70, y + 5);

      // Milestone indicator
      if (level.milestone) {
        ctx.fillStyle = "#FFD700";
        ctx.textAlign = "left";
        ctx.fillText("🏆", 320, y + 5);
      }
    });

  // Current position indicator
  if (currentLevel <= 15) {
    const indicatorY = startY + (15 - currentLevel) * itemHeight;
    ctx.fillStyle = "#FF6B35";
    ctx.fillText("👈", 30, indicatorY + 5);
  }

  // Lưu canvas
  const filePath = path.resolve(`./assets/temp/ailatrieuphu_ladder_${Date.now()}.png`);
  await writeFilePromise(filePath, canvas.toBuffer());

  return filePath;
}
