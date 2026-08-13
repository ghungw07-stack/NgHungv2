import gtts from "gtts";
import fs from "fs";
import path from "path";
import { getGlobalPrefix } from "../../../service.js";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import { convertToM4A, downloadAndConvertAudio, ensureVoiceUrlExtension, extractAudioFromVideo, uploadAudioFile } from "./process-audio.js";
import {
  sendMessageCompleteRequest,
  sendMessageFailed,
  sendMessageFromSQL,
  sendMessageImageNotQuote,
  sendMessageState,
  sendMessageStateQuote,
  sendMessageWarningRequest,
} from "../../chat-style/chat-style.js";
import {
  checkExstentionFileRemote,
  checkLinkIsValid,
  checkUrlStatus,
  deleteFile,
  downloadFile,
  execAsync,
} from "../../../../utils/util.js";
import { tempDir, VOICES_RESOURCE_PATH } from "../../../../utils/io-json.js";
import { createSpinningDiscGif } from "../send-gif/create-gif.js";
import { normalizeSymbolName, randomIDTemp, removeMention } from "../../../../utils/format-util.js";
import { createCircleWebp, PLATFORM_CIRCLE_WEPB } from "../send-sticker/create-webp.js";
import { createMusicCard } from "../../../../utils/canvas/music-canvas.js";
import { getUserInfoData } from "../../../info-service/user-info.js";
import { handleCheckLinkFromVoicesLocal } from "../../../../utils/local-upload-cache.js";
import { getCachedMedia } from "../../../../utils/link-platform-cache.js";
import { asyncTaskManager } from "../../../../utils/async-task.js";
import { findVoiceMetadata, saveVoiceMetadata } from "../../../../utils/nova-store.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const TIME_24H = 86400000;
function rememberMusicMetadata(message, object, voiceUrl) {
  const metadata = {
    title: object.title || "Không rõ tên",
    artists: object.artists || object.artist || "Không rõ nghệ sĩ",
    source: object.source || "Không rõ nguồn",
    voiceUrl: String(voiceUrl || ""),
    savedAt: Date.now(),
  };
  if (metadata.voiceUrl && message?.threadId) saveVoiceMetadata(message.threadId, metadata.voiceUrl, metadata);
}

export function getRepliedMusicMetadata(message) {
  const quote = message?.data?.quote;
  if (!quote) return null;
  const candidates = [quote.href, quote.voiceUrl, quote.m4aUrl];
  try {
    const attach = typeof quote.attach === "string" ? JSON.parse(quote.attach) : quote.attach;
    candidates.push(attach?.href, attach?.voiceUrl, attach?.m4aUrl, attach?.url);
  } catch {}
  return findVoiceMetadata(message.threadId, candidates);
}

async function textToSpeech(text, api, message, lang = "vi") {
  return new Promise((resolve, reject) => {
    try {
      const tts = new gtts(text, lang);
      const fileName = `voice_${randomIDTemp()}.mp3`;
      const filePath = path.join(tempDir, fileName);

      tts.save(filePath, async (err) => {
        if (err) {
          reject(err);
          return;
        }
        try {
          const voiceUrl = await uploadAudioFile(filePath, api, message);
          resolve(voiceUrl);
        } catch (error) {
          reject(error);
        } finally {
          await deleteFile(filePath);
        }
      });
    } catch (error) {
      reject(error);
    }
  });
}

/**
 * Nhận diện ngôn ngữ từ text dựa trên bộ ký tự
 */
function detectLanguage(text) {
  const patterns = {
    vi: /[àáạảãâầấậẩẫăằắặẳẵèéẹẻẽêềếệểễìíịỉĩòóọỏõôồốộổỗơờớợởỡùúụủũưừứựửữỳýỵỷỹđ]/i,
    zh: /[\u4E00-\u9FFF]/,
    ja: /[\u3040-\u309F\u30A0-\u30FF]/,
    ko: /[\uAC00-\uD7AF\u1100-\u11FF\u3130-\u318F]/,
  };

  const counts = {
    vi: (text.match(patterns.vi) || []).length,
    zh: (text.match(patterns.zh) || []).length,
    ja: (text.match(patterns.ja) || []).length,
    ko: (text.match(patterns.ko) || []).length,
  };

  const maxLang = Object.entries(counts).reduce(
    (max, [lang, count]) => {
      return count > max.count ? { lang, count } : max;
    },
    { lang: "vi", count: 0 }
  );

  if (maxLang.count === 0 && /^[\x00-\x7F]*$/.test(text)) {
    return "vi";
  }

  return maxLang.count > 0 ? maxLang.lang : "vi";
}

/**
 * Tách văn bản thành các phần theo ngôn ngữ
 */
function splitByLanguage(text) {
  const words = text.split(" ");
  const parts = [];
  let currentPart = {
    text: words[0],
    lang: detectLanguage(words[0]),
  };

  for (let i = 1; i < words.length; i++) {
    const word = words[i];
    const lang = detectLanguage(word);

    if (lang === currentPart.lang) {
      currentPart.text += " " + word;
    } else {
      parts.push(currentPart);
      currentPart = {
        text: word,
        lang: lang,
      };
    }
  }
  parts.push(currentPart);
  return parts;
}

/**
 * Ghép các file audio
 */
async function concatenateAudios(audioPaths) {
  const outputPath = path.join(tempDir, `combined_${randomIDTemp()}.mp3`);

  const ffmpegCommand = [
    "ffmpeg",
    "-y",
    ...audioPaths.map((path) => ["-i", path]).flat(),
    "-filter_complex",
    `concat=n=${audioPaths.length}:v=0:a=1[out]`,
    "-map",
    "[out]",
    "-c:a",
    "libmp3lame",
    "-q:a",
    "2",
    outputPath,
  ].join(" ");

  await execAsync(ffmpegCommand);
  return outputPath;
}

/**
 * Chuyển văn bản đa ngôn ngữ thành giọng nói
 */
async function multilingualTextToSpeech(text, api, message) {
  let finalAudioPath = null;
  const audioFiles = [];
  try {
    const parts = splitByLanguage(text);

    for (const part of parts) {
      const fileName = `voice_${randomIDTemp()}_${part.lang}.mp3`;
      const filePath = path.join(tempDir, fileName);

      const tts = new gtts(part.text, part.lang);
      await new Promise((resolve, reject) => {
        tts.save(filePath, (err) => {
          if (err) reject(err);
          else resolve();
        });
      });

      audioFiles.push(filePath);
    }

    finalAudioPath = await concatenateAudios(audioFiles);

    const voiceUrl = await uploadAudioFile(finalAudioPath, api, message);

    return voiceUrl;
  } catch (error) {
    console.error("Lỗi khi xử lý audio đa ngôn ngữ:", error);
    throw error;
  } finally {
    await Promise.all(audioFiles.map((file) => deleteFile(file)));
    await deleteFile(finalAudioPath);
  }
}

/**
 * Xử lý lệnh chuyển văn bản thành giọng nói
 */
export async function handleVoiceCommand(api, message, command) {
  try {
    const prefix = getGlobalPrefix(api.getBotId());
    const content = removeMention(message);
    let text = content.slice(prefix.length + command.length).trim();
    if (message.data?.quote) {
      if (!text) text = message.data?.quote?.msg || null;
      if (!text) {
        try {
          const parseMessage = JSON.parse(message.data?.quote?.attach);
          text = parseMessage.description || parseMessage.title || null;
        } catch (error) {}
      }
    }

    if (!text) {
      await api.sendMessage(
        {
          msg: `Vui lòng nhập nội dung cần chuyển thành giọng nói.\nVí dụ: 
${prefix}${command} Nội dung cần send Voice bất kỳ`,
          quote: message,
          ttl: 600000,
        },
        message.threadId,
        message.type
      );
      return;
    }

    const voiceUrl = await multilingualTextToSpeech(text, api, message);

    if (!voiceUrl) {
      throw new Error("Không thể tạo file âm thanh");
    }

    await api.sendVoice(message, voiceUrl, 600000);
  } catch (error) {
    console.error("Lỗi khi xử lý lệnh voice:", error);
    await api.sendMessage(
      {
        msg: "Đã xảy ra lỗi khi chuyển văn bản thành giọng nói. Vui lòng thử lại sau.",
        quote: message,
        ttl: 600000,
      },
      message.threadId,
      message.type
    );
  }
}

export async function handleStoryCommand(api, message) {
  try {
    const storyFilePath = path.join(__dirname, "z_truyencuoi.txt");
    const stories = fs
      .readFileSync(storyFilePath, "utf8")
      .split("\n")
      .filter((line) => line.trim());

    let randomStory = stories[Math.floor(Math.random() * stories.length)];

    if (!randomStory) {
      throw new Error("Không tìm thấy truyện cười");
    }

    randomStory = randomStory.replaceAll("\\n", "\n");
    const voiceUrl = await textToSpeech(randomStory, api, message);

    if (!voiceUrl) {
      throw new Error("Không thể tạo file âm thanh");
    }

    await Promise.all([
      api.sendVoice(message, voiceUrl, 600000),
      api.sendMessage(
        {
          msg: randomStory,
          quote: message,
          ttl: 600000,
        },
        message.threadId,
        message.type
      ),
    ]);
  } catch (error) {
    console.error("Lỗi khi xử lý lệnh story:", error);
    await api.sendMessage(
      {
        msg: "Đã xảy ra lỗi khi đọc truyện cười. Vui lòng thử lại sau.",
        quote: message,
        ttl: 600000,
      },
      message.threadId,
      message.type
    );
  }
}

export async function handleTarrotCommand(api, message) {
  try {
    const tarotFilePath = path.join(__dirname, "z_tarot.txt");
    const tarots = fs
      .readFileSync(tarotFilePath, "utf8")
      .split("\n")
      .filter((line) => line.trim());

    let randomTarot = tarots[Math.floor(Math.random() * tarots.length)];

    if (!randomTarot) {
      throw new Error("Không tìm thấy Tarot");
    }

    const tarotText = randomTarot
      .replaceAll("\\n", "\n")
      .replaceAll("♠", "Bích")
      .replaceAll("♥", "Cơ")
      .replaceAll("♣", "Chuồn")
      .replaceAll("♦", "Rô");
    const voiceUrl = await textToSpeech(tarotText, api, message);

    await Promise.all([
      api.sendMessage({ msg: randomTarot, quote: message, ttl: 600000 }, message.threadId, message.type),
      api.sendVoice(message, voiceUrl, 600000),
    ]);
  } catch (error) {
    console.error("Lỗi khi xử lý lệnh Tarot:", error);
    await api.sendMessage(
      {
        msg: "Đã xảy ra lỗi khi đọc Tarot. Vui lòng thử lại sau.",
        quote: message,
        ttl: 600000,
      },
      message.threadId,
      message.type
    );
  }
}

export async function sendVoiceMusic(api, message, object, ttl = 86400000) {
  let thumbnailPath = path.resolve(tempDir, `${randomIDTemp()}.jpg`);
  const voiceUrl = ensureVoiceUrlExtension(object.voiceUrl);
  object.voiceUrl = voiceUrl;
  rememberMusicMetadata(message, object, voiceUrl);
  if (!voiceUrl) {
    sendMessageFailed(api, message, "Upload file nhạc thất bại!", true);
    await api.addReaction("UNDO", message);
    await api.addReaction("TIEUTAN", message);
    return;
  }
  if (object.fastMode) {
    try {
      await sendMessageCompleteRequest(api, message, object, 180000);
      await api.sendVoice(message, voiceUrl, ttl);
      await Promise.allSettled([api.addReaction("UNDO", message), api.addReaction("LIKE", message)]);
    } catch (error) {
      console.error("Lỗi khi gửi nhạc nhanh:", error);
      await Promise.allSettled([api.addReaction("UNDO", message), api.addReaction("TIEUTAN", message)]);
    }
    return;
  }
  let spinningWebp = null;
  // if (object.imageUrl) {
  //   asyncTaskManager.runAsync(object.imageUrl, () => createCircleWebp(api, message, object.imageUrl, object.trackId));
  // }
  let imagePath = null;
  try {
    const [userInfoResult, , spinResult] = await Promise.allSettled([
      message?.data?.uidFrom ? getUserInfoData(api, message.data.uidFrom) : Promise.resolve(null),
      object.imageUrl ? downloadFile(object.imageUrl, thumbnailPath) : Promise.resolve(null),
      (object.imageUrl && object.trackId) ? getCachedMedia(PLATFORM_CIRCLE_WEPB, object.trackId, "webp") : Promise.resolve(null),
    ]);

    if (userInfoResult.status === 'fulfilled' && userInfoResult.value) {
      object.dataUser = userInfoResult.value;
    }
    if (spinResult.status === 'fulfilled' && spinResult.value) {
      spinningWebp = spinResult.value;
    }

    if (object.imageUrl) {
      try {
        object.thumbnailPath = thumbnailPath;
        imagePath = await createMusicCard(object, api.getBotId());
      } catch (error) {
        console.error("Lỗi khi tạo music card:", error);
        imagePath = null;
      }
    }

    if (!object.directStream && !(await checkUrlStatus(voiceUrl))) {
      sendMessageFailed(api, message, "Không thể kết nối đến liên kết của nhạc..!\nVui lòng thử lại sau.", true);
      return;
    }
    
    const managerData = api.apiManager.getDataManager();
    const spinDisk = managerData.spinDisk && !object.skipSpin;
    
    // Nếu bật spindisk và có imageUrl nhưng chưa có spinningWebp trong cache, tạo ngay
    if (spinDisk && object.imageUrl && !spinningWebp && object.trackId) {
      try {
        spinningWebp = await createCircleWebp(api, message, object.imageUrl, object.trackId);
      } catch (error) {
        console.error("Lỗi khi tạo spindisk:", error);
        // Tiếp tục gửi nhạc dù không tạo được spindisk
      }
    }
    
    await sendMessageCompleteRequest(api, message, object, 180000);
    if (imagePath) {
      await api.sendMessage({ msg: ``, attachments: [imagePath], ttl: ttl }, message.threadId, message.type);
    }
    if (spinningWebp && spinDisk) {
      await api.sendCustomSticker(
        message,
        spinningWebp.url,
        spinningWebp.url,
        spinningWebp.stickerData.width,
        spinningWebp.stickerData.height
      );
    }
    await api.sendVoice(message, voiceUrl, ttl);
    await Promise.allSettled([api.addReaction("UNDO", message), api.addReaction("LIKE", message)]);
    
    // Tạo async để cache cho lần sau nếu chưa có
    if (!object.skipSpin && !spinningWebp && object.imageUrl && object.trackId) {
      asyncTaskManager.runAsync(object.imageUrl, () => createCircleWebp(api, message, object.imageUrl, object.trackId));
    }
  } catch (error) {
    console.error("Lỗi khi gửi voice music:", error);
    await Promise.allSettled([api.addReaction("UNDO", message), api.addReaction("TIEUTAN", message)]);
  } finally {
    await deleteFile(thumbnailPath);
    if (imagePath && imagePath !== thumbnailPath) await deleteFile(imagePath);
  }
}

export async function sendVoiceMusicNotQuote(api, message, object, ttl) {
  let thumbnailPath = path.resolve(tempDir, `${randomIDTemp()}.jpg`);
  let imagePath = null;
  try {
    const voiceUrl = object.voiceUrl;
    if (object.imageUrl) {
      await downloadFile(object.imageUrl, thumbnailPath);
      try {
        object.thumbnailPath = thumbnailPath;
        imagePath = await createMusicCard(object, api.getBotId());
      } catch (error) {
        console.error("Lỗi khi tạo music card:", error);
        imagePath = null;
      }
    }

    const result = {
      message: object.caption,
      success: true,
    };

    await sendMessageImageNotQuote(api, result, message.threadId, imagePath, ttl, false);
    await api.sendVoice(message, voiceUrl, ttl);
  } catch (error) {
    console.error("Lỗi khi gửi voice music:", error);
  } finally {
    await deleteFile(thumbnailPath);
    if (imagePath && imagePath !== thumbnailPath) await deleteFile(imagePath);
  }
}

export async function handleGetVoiceCommand(api, message, aliasCommand) {
  const quote = message.data.quote;
  const prefix = getGlobalPrefix(api.getBotId());
  const content = removeMention(message);
  let voiceUrl = null;
  let videoUrl = null;
  let keyContent = content.replace(`${prefix}${aliasCommand}`, "").trim();
  let ext = null;

  if (!quote && !keyContent) {
    const object = {
      caption: `Nhập link video hoặc reply nội dung video cần tách âm thanh và dùng lại lệnh ${prefix}${aliasCommand}.`,
      state: false,
      ttl: 30000,
    };
    await sendMessageStateQuote(api, message, object.caption, object.state, object.ttl);
    return;
  }

  if (keyContent) {
    ext = await checkExstentionFileRemote(keyContent);
    if (ext === "mp4") {
      videoUrl = keyContent;
    } else if (ext === "aac" || ext === "m4a") {
      voiceUrl = keyContent;
    } else if (ext === "mp3") {
      voiceUrl = await downloadAndConvertAudio(keyContent, api, message);
    } else {
      await sendMessageFromSQL(
        api,
        message,
        {
          success: false,
          message: `Chỉ hỗ trợ get voice cho định dạng video`,
        },
        false,
        30000
      );
      return;
    }
  }

  if (quote) {
    const attachData = quote.attach ? JSON.parse(quote.attach) : null;
    if (attachData?.href) {
      ext = await checkExstentionFileRemote(attachData.href);
      if (ext === "mp4") {
        videoUrl = attachData.href;
      } else if (ext === "aac" || ext === "m4a") {
        voiceUrl = attachData.href;
      } else if (ext === "mp3") {
        voiceUrl = await downloadAndConvertAudio(attachData.href, api, message);
      } else {
        await sendMessageFromSQL(
          api,
          message,
          {
            success: false,
            message: `Chỉ hỗ trợ get voice cho định dạng video`,
          },
          false,
          30000
        );
        return;
      }
    } else {
      await sendMessageFromSQL(
        api,
        message,
        {
          success: false,
          message: `Không tìm thấy link đính kèm trong tin nhắn được reply!`,
        },
        false,
        30000
      );
      return;
    }
  }

  if (voiceUrl) {
    if (ext === "mp3") {
      await sendVoiceMusic(api, message, {
        voiceUrl,
        caption: "Chuyển đổi voice từ mp3 thành công!!!",
      });
    } else {
      await sendVoiceMusic(api, message, {
        voiceUrl,
        caption: "Đã Là Định Dạng Voice!!!",
      });
    }
    return;
  } else {
    if (videoUrl) {
      try {
        const voiceUrl = await extractAudioFromVideo(videoUrl, api, message);
        await sendVoiceMusic(api, message, {
          voiceUrl,
          caption: "Chuyển đổi voice từ video thành công!!!",
        });
      } catch (error) {
        console.error("Lỗi khi tách âm thanh:", error);
        await sendMessageFromSQL(
          api,
          message,
          {
            success: false,
            message: `Đã xảy ra lỗi khi get voice, vui lòng thử lại với link khác.`,
          },
          false,
          30000
        );
      }
      return;
    }
  }
}

/**
 * Xử lý lệnh send video
 */
export async function handleSendVoiceCommand(api, message, aliasCommand) {
  const botId = api.getBotId();
  const prefix = getGlobalPrefix(botId);
  const dataVoicesPath = VOICES_RESOURCE_PATH(botId);
  const content = removeMention(message);
  let keyword = content.replace(`${prefix}${aliasCommand}`, "").trim();
  let text = keyword;

  const senderName = message.data.dName;
  const senderId = message.data.uidFrom;
  const threadId = message.threadId;
  const type = message.type;

  const prepareVoiceUrl = async (value) => {
    const url = String(value || "").trim();
    if (!url) return url;
    const extension = await checkExstentionFileRemote(url).catch(() => null);
    if (extension === "mp3" || /\.mp3(?:[?#]|$)/iu.test(url)) {
      return await downloadAndConvertAudio(url, api, message);
    }
    return ensureVoiceUrlExtension(url, extension === "m4a" ? "m4a" : "aac");
  };

  try {
    if (keyword.trim() === "list") {
      const files = fs.readdirSync(dataVoicesPath);
      if (files.length > 0) {
        const fileList = files.map((file, index) => `${index + 1}. ${file}`).join("\n");
        await sendMessageCompleteRequest(
          api,
          message,
          {
            caption:
              `Đây là những voice đã lưu trữ:\n${fileList}` +
              `\n\nDùng lệnh: ${prefix}${aliasCommand} <số thứ tự voice> để gửi voice`,
          },
          1800000
        );
      } else {
        await sendMessageCompleteRequest(
          api,
          message,
          {
            caption: `Chưa có voice nào được lưu trên bộ nhớ của bot!`,
          },
          1800000
        );
      }
      return;
    }

    const index = parseInt(keyword.trim());
    if (!isNaN(index)) {
      const files = fs.readdirSync(dataVoicesPath);
      if (index > 0 && index <= files.length) {
        const selectedFile = files[index - 1];
        const fileLocal = await handleCheckLinkFromVoicesLocal(selectedFile, api);
        if (!fileLocal?.fileUrl) throw new Error(`Không lấy được link voice ${selectedFile}`);
        const voiceUrl = await prepareVoiceUrl(fileLocal.fileUrl);
        await sendMessageStateQuote(api, message, fileLocal.title, true, TIME_24H, false);
        await api.sendVoice(message, voiceUrl, TIME_24H);
        return;
      } else {
        await sendMessageWarningRequest(
          api,
          message,
          { caption: "Số thứ tự không nằm trong phạm vi danh sách voice đã lưu trữ." },
          300000
        );
        return;
      }
    }

    const quote = message.data?.quote;
    if (quote) {
      if (!text) {
        try {
          const parseMessage = JSON.parse(quote.attach);
          text = parseMessage.href || parseMessage.title || quote.msg || null;
        } catch (error) {
          text = quote.msg || null;
        }
      }
    }

    if (!text) {
      const object = {
        caption:
          `Vui lòng reply vào voice hoặc nhập link,\n` +
          `Hoặc dùng lệnh: "${prefix}${aliasCommand} list" để xem danh sách voice đã lưu trữ trong thư mục voice!`,
      };
      await sendMessageWarningRequest(api, message, object, 300000);
      return;
    }

    let linkUpload;
    let type = 0;
    const fileLocal = await handleCheckLinkFromVoicesLocal(text, api);
    if (fileLocal) {
      linkUpload = fileLocal.fileUrl;
      type = 1;
    } else {
      linkUpload = text;
      type = 0;
    }

    if (await checkLinkIsValid(linkUpload)) {
      linkUpload = await prepareVoiceUrl(linkUpload);
      await sendMessageStateQuote(
        api,
        message,
        "Đây là voice bạn yêu cầu" + (type === 1 ? ": " + fileLocal.title : "!"),
        true,
        TIME_24H,
        false
      );
      await api.sendVoice(message, linkUpload, TIME_24H);
    } else {
      const object = {
        caption:
          type === 0
            ? "Link voice yêu cầu không thể truy cập"
            : "Lỗi truy cập link voice cục bộ từ tập tin lưu trữ, vui lòng thử lại.",
      };
      await sendMessageWarningRequest(api, message, object, 300000);
    }
  } catch (error) {
    console.error("Lỗi khi send voice:", error);
    const object = {
      caption: "Đã xảy ra lỗi khi send voice từ nguồn cung cấp.",
    };
    await sendMessageWarningRequest(api, message, object, 300000);
  } finally {
  }
}
