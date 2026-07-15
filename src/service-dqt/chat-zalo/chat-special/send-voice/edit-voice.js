import path from "path";
import { execAsync, deleteFile, writeFilePromise } from "../../../../utils/util.js";
import { tempDir } from "../../../../utils/io-json.js";
import { sendVoiceMusic } from "./send-voice.js";
import { getGlobalPrefix } from "../../../service.js";
import { randomIDTemp, removeMention } from "../../../../utils/format-util.js";
import { sendMessageWarningRequest } from "../../chat-style/chat-style.js";
import axios from "axios";
import fs from "fs";

/**
 * Xóa nhiều file cùng lúc và bỏ qua lỗi
 * @param {...string} files - Danh sách đường dẫn file cần xóa
 */
async function cleanupFiles(...files) {
  await Promise.all(files.map((file) => (file ? deleteFile(file).catch(() => {}) : Promise.resolve())));
}

/**
 * Cắt file audio theo thời gian chỉ định
 * @param {string} inputPath - Đường dẫn file input
 * @param {string} start - Thời điểm bắt đầu (format: MM:SS)
 * @param {string} end - Thời điểm kết thúc (format: MM:SS), null nếu cắt đến cuối
 * @param {Object} options - Tùy chọn thêm
 * @param {boolean} options.fadeIn - Thêm hiệu ứng fade in
 * @param {boolean} options.fadeOut - Thêm hiệu ứng fade out
 * @param {number} options.fadeInDuration - Thời lượng fade in (giây)
 * @param {number} options.fadeOutDuration - Thời lượng fade out (giây)
 * @param {number} options.speed - Tốc độ phát (1 = bình thường, >1 = nhanh hơn, <1 = chậm hơn)
 */
async function cutAudio(inputPath, start, end = null, options = {}) {
  const outputPath = path.join(tempDir, `cut_${randomIDTemp()}.aac`);
  const tempInputPath = path.join(tempDir, `input_${randomIDTemp()}.aac`);
  const tempCutPath = path.join(tempDir, `cut_temp_${randomIDTemp()}.aac`);
  const tempSpeedPath = path.join(tempDir, `speed_temp_${randomIDTemp()}.aac`);
  const fadeInDuration = options.fadeInDuration || 1.5;
  const fadeOutDuration = options.fadeOutDuration || 1.5;
  const speed = options.speed || 1.0;

  try {
    const response = await axios({
      method: "GET",
      url: inputPath,
      responseType: "arraybuffer",
    });
    await writeFilePromise(tempInputPath, response.data);

    const cutCommand = [
      "ffmpeg",
      "-y",
      "-analyzeduration",
      "10M",
      "-probesize",
      "10M",
      "-i",
      tempInputPath,
      "-vn",
      "-ss",
      start,
      ...(end ? ["-t", getTimeDuration(start, end)] : []),
      "-c:a",
      "aac",
      "-b:a",
      "128k",
      tempCutPath,
    ].join(" ");

    await execAsync(cutCommand);

    // Áp dụng thay đổi tốc độ nếu khác 1.0
    let currentInputFile = tempCutPath;
    let currentOutputFile = tempCutPath;

    if (speed !== 1.0) {
      const speedCommand = [
        "ffmpeg",
        "-y",
        "-i",
        currentInputFile,
        "-filter:a",
        `atempo=${speed}`,
        "-c:a",
        "aac",
        "-b:a",
        "128k",
        tempSpeedPath,
      ].join(" ");

      await execAsync(speedCommand);
      currentInputFile = tempSpeedPath;
      currentOutputFile = tempSpeedPath;
    }

    if (options.fadeIn || options.fadeOut) {
      let filterComplex = [];

      if (options.fadeIn) {
        filterComplex.push(`afade=t=in:st=0:d=${fadeInDuration}`);
      }

      if (options.fadeOut) {
        const durationCommand = `ffprobe -i "${currentInputFile}" -show_entries format=duration -v quiet -of csv="p=0"`;
        const durationResult = await execAsync(durationCommand);
        const duration = Math.floor(parseFloat(durationResult.stdout.trim()));

        if (duration > fadeOutDuration * 2) {
          filterComplex.push(`afade=t=out:st=${duration - fadeOutDuration}:d=${fadeOutDuration}`);
        }
      }

      const fadeCommand = [
        "ffmpeg",
        "-y",
        "-i",
        currentInputFile,
        "-af",
        filterComplex.join(","),
        "-c:a",
        "aac",
        "-b:a",
        "128k",
        outputPath,
      ].join(" ");

      await execAsync(fadeCommand);
    } else {
      await fs.promises.rename(currentOutputFile, outputPath);
    }

    await cleanupFiles(tempInputPath, tempCutPath, tempSpeedPath);

    return outputPath;
  } catch (error) {
    await cleanupFiles(tempInputPath, tempCutPath, tempSpeedPath, outputPath);
    console.error("Lỗi khi cắt audio:", error);
    throw error;
  }
}

/**
 * Tính thời lượng giữa 2 mốc thời gian
 * @param {string} start - Thời điểm bắt đầu (MM:SS)
 * @param {string} end - Thời điểm kết thúc (MM:SS)
 * @returns {string} Thời lượng (MM:SS)
 */
function getTimeDuration(start, end) {
  const [startMin, startSec] = start.split(":").map(Number);
  const [endMin, endSec] = end.split(":").map(Number);

  const startSeconds = startMin * 60 + startSec;
  const endSeconds = endMin * 60 + endSec;

  return endSeconds - startSeconds;
}

/**
 * Kiểm tra format thời gian hợp lệ (MM:SS)
 */
function isValidTimeFormat(time) {
  if (!time) return false;
  const regex = /^([0-9]{1,2}):([0-5][0-9])$/;
  if (!regex.test(time)) return false;

  const [min, sec] = time.split(":").map(Number);
  return min >= 0 && sec >= 0 && sec < 60;
}

export async function handleEditVoiceCommand(api, message, aliasCommand) {
  const prefix = getGlobalPrefix(api.getBotId());
  const content = removeMention(message);
  const quote = message.data.quote;
  let voiceUrl = null;
  let tempOutputPath = null;
  const startTime = Date.now();

  try {
    const args = content.replace(`${prefix}${aliasCommand}`, "").trim().split(" ");
    let start = "0:00";
    let end = null;
    let url = null;
    let fadeIn = false;
    let fadeOut = false;
    let fadeInDuration = 1.5;
    let fadeOutDuration = 1.5;
    let speed = 1.0;

    if (args.length >= 1) {
      const fadeInRegex = /-fi(\d+)?/;
      const fadeOutRegex = /-fo(\d+)?/;
      const fadeRegex = /-f(\d+)?/;
      const speedRegex = /-s(\d*\.?\d*)?/;

      args.forEach((arg) => {
        if (arg.match(fadeInRegex)) {
          fadeIn = true;
          const match = arg.match(fadeInRegex);
          if (match && match[1]) {
            const duration = parseInt(match[1]);
            if (!isNaN(duration)) {
              fadeInDuration = duration;
            }
          }
        } else if (arg.match(fadeOutRegex)) {
          fadeOut = true;
          const match = arg.match(fadeOutRegex);
          if (match && match[1]) {
            const duration = parseInt(match[1]);
            if (!isNaN(duration)) {
              fadeOutDuration = duration;
            }
          }
        } else if (arg.match(fadeRegex)) {
          fadeIn = fadeOut = true;
          const match = arg.match(fadeRegex);
          if (match && match[1]) {
            const duration = parseInt(match[1]);
            if (!isNaN(duration)) {
              fadeInDuration = fadeOutDuration = duration;
            }
          }
        } else if (arg.startsWith("-s")) {
          const match = arg.match(speedRegex);
          if (match && match[1]) {
            const speedValue = parseFloat(match[1]);
            if (!isNaN(speedValue) && speedValue > 0) {
              speed = speedValue;
            }
          } else {
            speed = 1.0;
          }
        }
      });

      // Kiểm tra thêm các tham số không có số
      if (!fadeIn && !fadeOut) {
        fadeIn = args.includes("-fi") || args.includes("--fade-in");
        fadeOut = args.includes("-fo") || args.includes("--fade-out");
        
        if (args.includes("-f") || args.includes("--fade")) {
          fadeIn = fadeOut = true;
        }
      }

      const filteredArgs = args.filter((arg) => !arg.startsWith("-"));

      if (filteredArgs[0]?.includes(":")) {
        start = filteredArgs[0];
        if (filteredArgs[1]?.includes(":")) {
          end = filteredArgs[1];
          url = filteredArgs[2];
        } else {
          url = filteredArgs[1];
        }
      } else {
        url = filteredArgs[0];
      }
    }

    if (!isValidTimeFormat(start) || (end && !isValidTimeFormat(end))) {
      const object = {
        caption:
          `Hướng dẫn dùng lệnh chỉnh sửa Audio:\n` +
          `Ví dụ:\n${prefix}${aliasCommand} 1:30 2:45 [link]\n` +
          `${prefix}${aliasCommand} 1:30 [link] (cắt từ 1:30 đến hết)\n` +
          `${prefix}${aliasCommand} 0:00 1:30 [link] (cắt từ đầu đến 1:30)\n` +
          `Thêm -s để điều chỉnh tốc độ (ví dụ: -s1.5 để tăng tốc độ lên 1.5 lần)\n` +
          `Thêm -fi2 để thêm hiệu ứng fade in 2 giây\n` +
          `Thêm -fo3 để thêm hiệu ứng fade out 3 giây\n` +
          `Thêm -f để thêm cả hiệu ứng fade in và fade out (mặc định 2 giây)`,
      };
      await sendMessageWarningRequest(api, message, object, 30000);
      return;
    }

    if (!url && quote?.attach) {
      const attachData = JSON.parse(quote.attach);
      url = attachData.href;
    }

    if (!url) {
      const object = {
        caption:
          `Vui lòng cung cấp link audio hoặc reply một tin nhắn chứa audio!` +
          `\nCách dùng: ${prefix}${aliasCommand} <thời gian bắt đầu> <thời gian kết thúc> <link hoặc quote tin nhắn>` +
          `\nVí dụ:` +
          `\n${prefix}${aliasCommand} 1:30 2:45 [link]` +
          `\n${prefix}${aliasCommand} 1:30 [link] (cắt từ 1:30 đến hết)` +
          `\n${prefix}${aliasCommand} 0:00 1:30 [link] (cắt từ đầu đến 1:30)` +
          `\n${prefix}${aliasCommand} -s1.2 -fi2 -fo3 1:30 [link] (tăng tốc độ 1.2 lần, fade in 2s, fade out 3s)`,
      };
      await sendMessageWarningRequest(api, message, object, 30000);
      return;
    }

    tempOutputPath = await cutAudio(url, start, end, { fadeIn, fadeOut, fadeInDuration, fadeOutDuration, speed });
    voiceUrl = await api.uploadAttachment([tempOutputPath], message.threadId, message.type);
    voiceUrl = voiceUrl[0].fileUrl;

    if (!voiceUrl.endsWith(".aac")) {
      voiceUrl = voiceUrl + `/${Date.now()}.aac`;
    }

    const processTime = ((Date.now() - startTime) / 1000).toFixed(1);

    let effectsText = "";
    if (fadeIn || fadeOut) {
      const effects = [];
      if (fadeIn) {
        effects.push(`rõ dần (${fadeInDuration}s)`);
      }
      if (fadeOut) {
        effects.push(`mờ dần (${fadeOutDuration}s)`);
      }
      effectsText = `\nHiệu ứng: ${effects.join(", ")}`;
    }

    let speedText = "";
    if (speed !== 1.0) {
      speedText = `\nTốc độ: ${speed}x`;
    }

    const object = {
      caption:
        `Đã chỉnh sửa audio thành công!\n` +
        `Thời gian: ${start}${end ? ` đến ${end}` : " đến đoạn kết thúc"}` +
        effectsText +
        speedText +
        `\nThời gian xử lý: ${processTime}s`,
      voiceUrl: voiceUrl,
    };
    await sendVoiceMusic(api, message, object);
  } catch (error) {
    console.error("Lỗi khi chỉnh sửa voice:", error);
    const object = {
      caption: "Đã xảy ra lỗi khi chỉnh sửa voice, vui lòng thử lại sau.",
    };
    await sendMessageWarningRequest(api, message, object, 30000);
  } finally {
    await cleanupFiles(tempOutputPath);
  }
}
