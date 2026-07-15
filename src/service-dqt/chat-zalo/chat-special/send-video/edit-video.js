import path from "path";
import { execAsync, deleteFile } from "../../../../utils/util.js";
import { tempDir } from "../../../../utils/io-json.js";
import { getGlobalPrefix } from "../../../service.js";
import { randomIDTemp, removeMention } from "../../../../utils/format-util.js";
import { sendMessageWarningRequest } from "../../chat-style/chat-style.js";
import axios from "axios";
import fs from "fs";

/**
 * Cắt video theo thời gian chỉ định
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
async function cutVideo(inputPath, start, end = null, options = {}) {
  const outputPath = path.join(tempDir, `cut_${randomIDTemp()}.mp4`);
  const tempFiles = [];
  const fadeInDuration = options.fadeInDuration || 3;
  const fadeOutDuration = options.fadeOutDuration || 3;
  const speed = options.speed || 1.0;

  try {
    const tempInputPath = path.join(tempDir, `input_${randomIDTemp()}.mp4`);
    tempFiles.push(tempInputPath);

    const writer = fs.createWriteStream(tempInputPath);

    try {
      const response = await axios({
        method: "GET",
        url: inputPath,
        responseType: "stream",
        headers: {
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
        },
      });

      await new Promise((resolve, reject) => {
        response.data.pipe(writer);
        writer.on("finish", resolve);
        writer.on("error", reject);
      });
    } catch (error) {
      throw new Error(`Lỗi khi tải video: ${error.message}`);
    }

    try {
      const checkCommand = `ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "${tempInputPath}"`;
      await execAsync(checkCommand);
    } catch (error) {
      throw new Error(`Nguồn file video không hợp lệ hoặc đã bị hỏng`);
    }

    let tempCutPath = path.join(tempDir, `cut_temp_${randomIDTemp()}.mp4`);
    tempFiles.push(tempCutPath);

    const startSeconds = convertTimeToSeconds(start);
    const endSeconds = end ? convertTimeToSeconds(end) : null;

    if (endSeconds !== null && endSeconds <= startSeconds) {
      throw new Error(`Thời gian kết thúc (${end}) phải lớn hơn thời gian bắt đầu (${start})`);
    }

    const cutCommand = [
      "ffmpeg",
      "-y",
      "-i",
      `"${tempInputPath}"`,
      "-ss",
      startSeconds,
      ...(endSeconds !== null ? ["-to", endSeconds] : []),
      "-c:v",
      "libx264",
      "-c:a",
      "aac",
      "-avoid_negative_ts",
      "make_zero",
      "-strict",
      "experimental",
      `"${tempCutPath}"`,
    ].join(" ");

    try {
      await execAsync(cutCommand);
    } catch (error) {
      throw new Error(`Lỗi khi cắt video: ${error.message}`);
    }

    if (!fs.existsSync(tempCutPath)) {
      throw new Error("Không thể tạo file video sau khi cắt");
    }

    try {
      const checkCutCommand = `ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "${tempCutPath}"`;
      const { stdout } = await execAsync(checkCutCommand);
      const duration = parseFloat(stdout.trim());

      if (isNaN(duration) || duration === 0) {
        throw new Error("Video sau khi cắt có thời lượng không hợp lệ");
      }
    } catch (error) {
      throw new Error(`Video sau khi cắt không hợp lệ: ${error.message}`);
    }

    if (speed !== 1.0) {
      const tempSpeedPath = path.join(tempDir, `speed_temp_${Date.now()}.mp4`);
      tempFiles.push(tempSpeedPath);

      let speedFilters = [];
      
      if (speed > 0 && speed <= 2.0) {
        speedFilters.push(`setpts=${1/speed}*PTS`);
        
        const audioFilter = speed <= 2.0 ? `atempo=${speed}` : `atempo=2.0,atempo=${speed/2.0}`;
        speedFilters.push(audioFilter);
      } else if (speed > 2.0) {
        speedFilters.push(`setpts=${1/speed}*PTS`);
        
        let tempSpeed = speed;
        let audioFilters = [];
        
        while (tempSpeed > 2.0) {
          audioFilters.push("atempo=2.0");
          tempSpeed /= 2.0;
        }
        
        if (tempSpeed > 1.0) {
          audioFilters.push(`atempo=${tempSpeed}`);
        }
        
        speedFilters.push(audioFilters.join(','));
      } else if (speed < 1.0 && speed >= 0.5) {
        speedFilters.push(`setpts=${1/speed}*PTS`);
        speedFilters.push(`atempo=${speed}`);
      } else if (speed < 0.5) {
        speedFilters.push(`setpts=${1/speed}*PTS`);
        
        let tempSpeed = speed;
        let audioFilters = [];
        
        while (tempSpeed < 0.5) {
          audioFilters.push("atempo=0.5");
          tempSpeed /= 0.5;
        }
        
        if (tempSpeed < 1.0) {
          audioFilters.push(`atempo=${tempSpeed}`);
        }
        
        speedFilters.push(audioFilters.join(','));
      }

      const speedCommand = [
        "ffmpeg",
        "-y",
        "-i",
        `"${tempCutPath}"`,
        "-filter_complex",
        `"[0:v]${speedFilters[0]}[v];[0:a]${speedFilters[1]}[a]"`,
        "-map",
        "[v]",
        "-map",
        "[a]",
        "-c:v",
        "libx264",
        "-c:a",
        "aac",
        `"${tempSpeedPath}"`,
      ].join(" ");

      try {
        await execAsync(speedCommand);
        if (fs.existsSync(tempSpeedPath)) {
          tempCutPath = tempSpeedPath;
          tempFiles.push(tempSpeedPath);
        }
      } catch (error) {
        console.error("Lỗi khi thay đổi tốc độ video:", error);
      }
    }

    if (options.fadeIn || options.fadeOut) {
      let videoFilters = [];
      let audioFilters = [];

      if (options.fadeIn) {
        videoFilters.push(`fade=t=in:st=0:d=${fadeInDuration}`);
        audioFilters.push(`afade=t=in:st=0:d=${fadeInDuration}`);
      }

      if (options.fadeOut) {
        const durationCommand = `ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "${tempCutPath}"`;
        const durationResult = await execAsync(durationCommand);
        const duration = Math.floor(parseFloat(durationResult.stdout.trim()));

        if (duration > fadeOutDuration) {
          videoFilters.push(`fade=t=out:st=${duration - fadeOutDuration}:d=${fadeOutDuration}`);
          audioFilters.push(`afade=t=out:st=${duration - fadeOutDuration}:d=${fadeOutDuration}`);
        } else {
          console.log(`Cảnh báo: Thời lượng video (${duration}s) quá ngắn cho hiệu ứng fade out (${fadeOutDuration}s)`);
        }
      }

      const fadeCommand = [
        "ffmpeg",
        "-y",
        "-i",
        `"${tempCutPath}"`,
        "-vf",
        `"${videoFilters.join(",")}"`,
        "-af",
        `"${audioFilters.join(",")}"`,
        "-c:v",
        "libx264",
        "-c:a",
        "aac",
        `"${outputPath}"`,
      ].join(" ");

      try {
        await execAsync(fadeCommand);
      } catch (error) {
        console.error("Lỗi khi thêm hiệu ứng fade, sử dụng video đã cắt:", error);
        await fs.promises.copyFile(tempCutPath, outputPath);
      }
    } else {
      await fs.promises.copyFile(tempCutPath, outputPath);
    }

    return outputPath;
  } catch (error) {
    console.error("Lỗi khi xử lý video:", error);
    try {
      await Promise.all([...tempFiles, outputPath].map((file) => deleteFile(file)));
    } catch (cleanupError) {
      console.error("Lỗi khi dọn dẹp file tạm:", cleanupError);
    }
    throw error;
  } finally {
    try {
      await Promise.all(tempFiles.map((file) => deleteFile(file)));
    } catch (cleanupError) {
      console.error("Lỗi khi dọn dẹp file tạm:", cleanupError);
    }
  }
}

/**
 * Chuyển đổi từ định dạng MM:SS sang số giây
 * @param {string} time - Thời gian định dạng MM:SS
 * @returns {number} Số giây
 */
function convertTimeToSeconds(time) {
  const [min, sec] = time.split(":").map(Number);
  return min * 60 + sec;
}

/**
 * Tính thời lượng giữa 2 mốc thời gian
 * @param {string} start - Thời điểm bắt đầu (MM:SS)
 * @param {string} end - Thời điểm kết thúc (MM:SS)
 * @returns {string} Thời lượng (MM:SS)
 */
function getTimeDuration(start, end) {
  const startSeconds = convertTimeToSeconds(start);
  const endSeconds = convertTimeToSeconds(end);

  if (endSeconds <= startSeconds) {
    throw new Error(`Thời gian kết thúc (${end}) phải lớn hơn thời gian bắt đầu (${start})`);
  }

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

export async function handleEditVideoCommand(api, message, aliasCommand) {
  const prefix = getGlobalPrefix(api.getBotId());
  const content = removeMention(message);
  const quote = message.data.quote;
  let videoUrl = null;
  const tempFiles = [];
  const startTime = Date.now();

  try {
    const args = content.replace(`${prefix}${aliasCommand}`, "").trim().split(" ");
    let start = "0:00";
    let end = null;
    let url = null;
    let fadeIn = false;
    let fadeOut = false;
    let fadeInDuration = 3;
    let fadeOutDuration = 3;
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
          `Hướng dẫn dùng lệnh cắt Video:\n` +
          `Ví dụ:\n${prefix}${aliasCommand} 1:30 2:45 [link]\n` +
          `${prefix}${aliasCommand} 1:30 [link] (cắt từ 1:30 đến hết)\n` +
          `${prefix}${aliasCommand} 0:00 1:30 [link] (cắt từ đầu đến 1:30)\n` +
          `Thêm -s để điều chỉnh tốc độ (ví dụ: -s1.5 để tăng tốc độ lên 1.5 lần)\n` +
          `Thêm -fi2 để thêm hiệu ứng fade in 2 giây\n` +
          `Thêm -fo3 để thêm hiệu ứng fade out 3 giây\n` +
          `Thêm -f2 để thêm cả hiệu ứng fade in và fade out 2 giây`,
      };
      await sendMessageWarningRequest(api, message, object, 30000);
      return;
    }

    if (end) {
      const startSeconds = convertTimeToSeconds(start);
      const endSeconds = convertTimeToSeconds(end);
      if (endSeconds <= startSeconds) {
        const object = {
          caption: `Thời gian kết thúc (${end}) phải lớn hơn thời gian bắt đầu (${start})`,
        };
        await sendMessageWarningRequest(api, message, object, 30000);
        return;
      }
    }

    if (!url && quote?.attach) {
      const attachData = JSON.parse(quote.attach);
      url = attachData.href;
    }

    if (!url) {
      const object = {
        caption:
          `Vui lòng cung cấp link video hoặc reply một tin nhắn chứa video` +
          `\nCách dùng: ${prefix}${aliasCommand} <thời gian bắt đầu> <thời gian kết thúc> <link hoặc quote tin nhắn>` +
          `\nVí dụ:` +
          `\n${prefix}${aliasCommand} 1:30 2:45 [link]` +
          `\n${prefix}${aliasCommand} 1:30 [link] (cắt từ 1:30 đến hết)` +
          `\n${prefix}${aliasCommand} 0:00 1:30 [link] (cắt từ đầu đến 1:30)` +
          `\n${prefix}${aliasCommand} -s1.5 -fi2 -fo3 1:30 [link] (tăng tốc độ 1.5 lần, fade in 2s, fade out 3s)`,
      };
      await sendMessageWarningRequest(api, message, object, 30000);
      return;
    }

    await api.sendMessage(
      {
        msg: `⏳ Đang xử lý video... Vui lòng đợi trong giây lát.`,
        quote: message,
        ttl: 10000,
      },
      message.threadId,
      message.type
    );

    const tempOutputPath = await cutVideo(url, start, end, {
      fadeIn,
      fadeOut,
      fadeInDuration,
      fadeOutDuration,
      speed,
    });
    tempFiles.push(tempOutputPath);

    const uploadResult = await api.uploadAttachment([tempOutputPath], message.threadId, message.type, { isUseProphylactic: true });
    videoUrl = uploadResult[0].fileUrl;

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

    await api.sendVideo({
      videoUrl,
      threadId: message.threadId,
      threadType: message.type,
      message: {
        text:
          `Đã cắt video thành công!\n` +
          `Thời gian: ${start}${end ? ` đến ${end}` : " đến hết"}` +
          effectsText +
          speedText +
          `\nThời gian xử lý: ${processTime}s`,
      },
      ttl: 86400000,
    });
  } catch (error) {
    console.error("Lỗi khi cắt video:", error);
    const errorMessage = error.message || "Không rõ lỗi";
    const object = {
      caption: `Đã xảy ra lỗi khi cắt video: ${errorMessage}. Vui lòng thử lại sau.`,
    };
    await sendMessageWarningRequest(api, message, object, 30000);
  } finally {
    await Promise.all(tempFiles.map((file) => deleteFile(file)));
  }
}
