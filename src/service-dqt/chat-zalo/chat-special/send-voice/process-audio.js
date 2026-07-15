import axios from "axios";
import path from "path";
import fs from "fs";
import youtubeDl from "youtube-dl-exec";
import { getFileExtension, getFileSize } from "../../../../api-zalo/utils.js";
import { deleteFile, execAsync, getFileTypeRemote, writeFilePromise } from "../../../../utils/util.js";
import { tempDir } from "../../../../utils/io-json.js";
import { randomIDTemp } from "../../../../utils/format-util.js";

/**
 * Chuyển đổi file MP3 sang M4A
 */
export async function convertToM4A(inputPath) {
  const outputPath = inputPath.replace(".mp3", ".m4a");
  const timeStart = performance.now();
  try {
    const ffmpegCommand = ["ffmpeg", "-y", "-i", inputPath, "-vn", "-c:a", "aac", "-q:a", "2", outputPath].join(" ");

    await execAsync(ffmpegCommand);
    const timeEnd = performance.now();
    console.log(`Thời gian chuyển đổi sang M4A: ${((timeEnd - timeStart) / 1000).toFixed(2)} s`);
    return outputPath;
  } catch (error) {
    console.error("Lỗi khi chuyển đổi sang M4A:", error);
    throw error;
  }
}

/**
 * Chuyển đổi file MP3 sang AAC
 */
export async function convertToAAC(inputPath) {
  const outputPath = inputPath.replace(".mp3", ".aac");
  try {
    const ffmpegCommand = ["ffmpeg", "-y", "-i", inputPath, "-vn", "-c:a", "aac", "-q:a", "2", outputPath].join(" ");

    await execAsync(ffmpegCommand);
    return outputPath;
  } catch (error) {
    console.error("Lỗi khi chuyển đổi sang AAC:", error);
    throw error;
  }
}

/**
 * Upload file audio và trả về URL
 */
export async function uploadAudioFile(mp3Path, api, message, uploadCloud = false) {
  let accPath = null;
  try {
    let voiceFinalUrl;
    const fileSize = await getFileSize(mp3Path);
    if (fileSize > 9437184) {
      const ext = getFileExtension(mp3Path);
      if (ext == "aac" || ext == "m4a") {
        voiceFinalUrl = await api.uploadAttachment([mp3Path], message.threadId, message.type, {
          uploadCloud,
        });
      } else {
        const parsedPath = path.parse(mp3Path);
        accPath = path.join(parsedPath.dir, parsedPath.name + ".aac");
        fs.renameSync(mp3Path, accPath);
        voiceFinalUrl = await api.uploadAttachment([accPath], message.threadId, message.type, {
          uploadCloud,
        });
        fs.renameSync(accPath, mp3Path);
      }
      voiceFinalUrl = voiceFinalUrl[0].fileUrl;
    } else {
      voiceFinalUrl = await api.uploadAttachment([mp3Path], message.threadId, message.type, {
        uploadCloud,
      });
      voiceFinalUrl = voiceFinalUrl[0].fileUrl;
    }
    if (!voiceFinalUrl.endsWith(".aac")) {
      voiceFinalUrl = voiceFinalUrl + `/${Date.now()}.aac`;
    }
    return voiceFinalUrl;
  } catch (error) {
    throw error;
  } finally {
    deleteFile(accPath);
  }
}

/**
 * Tải Và Chuyển Đổi Âm Thanh Sang Dạng Tương Thích
 */
export async function downloadAndConvertAudio(url, api, message, uploadCloud = false) {
  let mp3Path;

  try {
    const response = await axios({
      url,
      method: "GET",
      responseType: "stream",
    });
    const fileType = await getFileTypeRemote(url);
    mp3Path = path.join(tempDir, `temp_${randomIDTemp()}.${fileType.ext}`);
    await new Promise((resolve, reject) => {
      const writer = fs.createWriteStream(mp3Path);
      response.data.pipe(writer);
      writer.on("finish", resolve);
      writer.on("error", reject);
    });

    const voiceFinalUrl = await uploadAudioFile(mp3Path, api, message, uploadCloud);

    return voiceFinalUrl;
  } catch (error) {
    throw error;
  } finally {
    await deleteFile(mp3Path);
  }
}

/**
 * Tải audio từ Mixcloud URL bằng yt-dlp
 * @param {string} mixcloudUrl - URL của Mixcloud track
 * @param {api} api - API instance
 * @param {message} message - Message object
 * @param {boolean} uploadCloud - Upload lên cloud storage
 * @returns {Promise<string>} URL của file âm thanh đã xử lý
 */
export async function downloadMixcloudWithYtDlp(mixcloudUrl, api, message, uploadCloud = true) {
  const tempAudioPath = path.join(tempDir, `temp_mixcloud_${randomIDTemp()}.m4a`);

  try {
    const outputTemplate = tempAudioPath.replace(/\.m4a$/, "");
    await youtubeDl(mixcloudUrl, {
      format: "bestaudio",
      concurrentFragments: 8,
      noPart: true,
      extractAudio: true,
      audioFormat: "m4a", 
      output: outputTemplate + ".%(ext)s",
      noCheckCertificates: true,
      noWarnings: true,
    });
    
    const dir = path.dirname(tempAudioPath);
    const baseName = path.basename(outputTemplate);
    const files = fs.readdirSync(dir);
    const actualFile = files.find(f => f.startsWith(baseName) && (f.endsWith(".m4a") || f.endsWith(".aac") || f.endsWith(".mp3")));
    
    if (actualFile) {
      const actualPath = path.join(dir, actualFile);
      if (actualPath !== tempAudioPath) {
        if (fs.existsSync(actualPath)) {
          if (actualPath.endsWith(".m4a")) {
            fs.renameSync(actualPath, tempAudioPath);
          } else {
            fs.renameSync(actualPath, tempAudioPath);
          }
        }
      }
    }

    const voiceFinalUrl = await uploadAudioFile(tempAudioPath, api, message, uploadCloud);
    return voiceFinalUrl;
  } catch (error) {
    throw error;
  } finally {
    await deleteFile(tempAudioPath);
  }
}

/**
 * Stream trực tiếp từ M3U8 URL sang audio 
 * @param {string} m3u8Url - URL của M3U8 stream
 * @param {api} api - API instance
 * @param {message} message - Message object
 * @param {number} maxDuration - Thời lượng 0 để không giới hạn
 * @param {boolean} uploadCloud - Upload lên cloud storage
 * @returns {Promise<string>} URL của file âm thanh đã xử lý
 */
export async function extractAudioFromM3U8(m3u8Url, api, message, maxDuration = 0, uploadCloud = true) {
  const tempAudioPath = path.join(tempDir, `temp_audio_m3u8_${randomIDTemp()}.m4a`);

  try {
    const ffmpegArgs = [
      "ffmpeg",
      "-y",
      "-loglevel", "error",
      "-reconnect", "1",
      "-reconnect_streamed", "1",
      "-reconnect_delay_max", "5",
      "-i", m3u8Url,
      "-c", "copy",
      "-bsf:a", "aac_adtstoasc",
    ];

    if (maxDuration > 0) {
      ffmpegArgs.push("-t", maxDuration.toString());
    }

    ffmpegArgs.push(tempAudioPath);
    const ffmpegCommand = ffmpegArgs.join(" ");

    await execAsync(ffmpegCommand);

    const voiceFinalUrl = await uploadAudioFile(tempAudioPath, api, message, uploadCloud);

    return voiceFinalUrl;
  } catch (error) {
    throw error;
  } finally {
    await deleteFile(tempAudioPath);
  }
}

/**
 * Tách âm thanh từ video và chuyển đổi sang định dạng audio
 * @param {string|Buffer} input - URL video hoặc buffer của video
 * @param {api} api - API instance
 * @param {message} message - Message object
 * @param {boolean} uploadCloud - Upload lên cloud storage
 * @returns {Promise<string>} URL của file âm thanh đã xử lý
 */
export async function extractAudioFromVideo(input, api, message, uploadCloud = true) {
  // const timeStart = performance.now();
  const tempVideoPath = path.join(tempDir, `temp_video_${randomIDTemp()}.mp4`);
  const tempAudioPath = path.join(tempDir, `temp_audio_${randomIDTemp()}.aac`);

  try {
    if (typeof input === "string") {
      const response = await axios({
        url: input,
        method: "GET",
        responseType: "stream",
      });
      await new Promise((resolve, reject) => {
        const writer = fs.createWriteStream(tempVideoPath);
        response.data.pipe(writer);
        writer.on("finish", resolve);
        writer.on("error", reject);
      });
    } else {
      await writeFilePromise(tempVideoPath, input);
    }

    const ffmpegCommand = ["ffmpeg", "-y", "-i", tempVideoPath, "-vn", "-c:a", "aac", "-q:a", "2", tempAudioPath].join(
      " "
    );

    await execAsync(ffmpegCommand);

    const voiceFinalUrl = await uploadAudioFile(tempAudioPath, api, message, uploadCloud);

    // const timeEnd = performance.now();
    // console.log(`Thời gian xử lý âm thanh: ${((timeEnd - timeStart) / 1000).toFixed(2)} s`);

    return voiceFinalUrl;
  } catch (error) {
    throw error;
  } finally {
    await Promise.all([deleteFile(tempVideoPath), deleteFile(tempAudioPath)]);
  }
}
