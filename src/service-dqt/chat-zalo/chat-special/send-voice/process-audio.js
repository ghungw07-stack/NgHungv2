import axios from "axios";
import path from "path";
import fs from "fs";
import youtubeDl from "youtube-dl-exec";
import { deleteFile, execAsync, writeFilePromise } from "../../../../utils/util.js";
import { tempDir } from "../../../../utils/io-json.js";
import { randomIDTemp } from "../../../../utils/format-util.js";

/**
 * Chuyển đổi file MP3 sang M4A
 */
export async function convertToM4A(inputPath) {
  const outputPath = inputPath.replace(".mp3", ".m4a");
  const timeStart = performance.now();
  try {
    const ffmpegCommand = ["ffmpeg", "-y", "-i", inputPath, "-vn", "-c:a", "aac", "-b:a", "96k", "-ar", "44100", "-ac", "1", outputPath].join(" ");

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
export async function convertToAAC(inputPath, outputPath = inputPath.replace(/\.mp3$/i, ".aac")) {
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
  try {
    const uploadResult = await api.uploadAttachment([mp3Path], message.threadId, message.type, {
      uploadCloud,
      isCloudVoice: uploadCloud,
    });
    let voiceFinalUrl = uploadResult?.[0]?.fileUrl || uploadResult?.[0]?.normalUrl;
    if (!voiceFinalUrl) throw new Error("Zalo không trả về link nhạc sau khi upload");
    // Zalo cloud/regular-file URLs are extensionless; voice forwarding needs
    // the generated extension suffix (for example .../<fileId>/<timestamp>.aac).
    const ext = path.extname(mp3Path).replace(".", "") || "aac";
    voiceFinalUrl = ensureVoiceUrlExtension(voiceFinalUrl, ext);
    return voiceFinalUrl;
  } catch (error) {
    throw error;
  }
}

/**
 * Zalo cloud URLs often contain a query string. The synthetic filename must be
 * added to the pathname, never after the query (which produces an invalid URL
 * such as `...?createby=bot/123.aac`). This also repairs URLs already stored in
 * the media cache by older versions.
 */
export function ensureVoiceUrlExtension(value, extension = "aac") {
  if (!value || typeof value !== "string") return value;

  const ext = String(extension).replace(/^\./, "").toLowerCase() || "aac";
  try {
    const url = new URL(value);
    const brokenSuffix = url.search.match(/\/([0-9]+\.(?:aac|m4a|mp3))(?:&|$)/i);
    if (brokenSuffix) {
      url.pathname = `${url.pathname.replace(/\/$/, "")}/${brokenSuffix[1]}`;
      url.search = url.search.replace(`/${brokenSuffix[1]}`, "");
    }

    if (!/\.(?:aac|m4a|mp3)$/i.test(url.pathname)) {
      url.pathname = `${url.pathname.replace(/\/$/, "")}/${Date.now()}.${ext}`;
    }
    return url.toString();
  } catch {
    return value;
  }
}

/**
 * Tải Và Chuyển Đổi Âm Thanh Sang Dạng Tương Thích
 */
export async function downloadAndConvertAudio(url, api, message, uploadCloud = false) {
  const isM3u8 = url.includes(".m3u8") || url.includes("playlist.m3u8");
  const isMp3 = !isM3u8 && (url.includes(".mp3") || url.includes("sndcdn"));
  const ext = isM3u8 ? ".m4a" : (isMp3 ? ".mp3" : ".aac");
  const audioPath = path.join(tempDir, `temp_${randomIDTemp()}${ext}`);
  let convertedAudioPath = null;

  try {

    const headers = {
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/127.0.0.1 Safari/537.36",
      "Accept": "*/*",
      "Referer": "https://www.youtube.com/"
    };
    
    // NẾU LÀ HLS M3U8 (Tải cực nhanh & Không cần transcode ffmpeg)
    if (url.includes(".m3u8") || url.includes("playlist.m3u8")) {
      const m3u8Content = (await axios.get(url, { headers })).data;
      const lines = m3u8Content.split('\n');
      
      const initLine = lines.find(l => l.startsWith('#EXT-X-MAP:URI="'));
      const initUrl = initLine ? initLine.match(/URI="(.*?)"/)[1] : null;
      
      let segmentUrls = lines.filter(l => l && !l.startsWith('#'));
      
      // Giới hạn max 95MB ~ 600 segments (mỗi segment ~150KB)
      if (segmentUrls.length > 600) {
        segmentUrls = segmentUrls.slice(0, 600);
      }
      
      const handle = await fs.promises.open(audioPath, "w");
      let offset = 0;
      
      if (initUrl) {
        const initRes = await axios.get(initUrl, { responseType: "arraybuffer", headers });
        await handle.write(initRes.data, 0, initRes.data.byteLength, offset);
        offset += initRes.data.byteLength;
      }
      
      const MAX_CONCURRENT = 50;
      for (let i = 0; i < segmentUrls.length; i += MAX_CONCURRENT) {
        const batch = segmentUrls.slice(i, i + MAX_CONCURRENT);
        const buffers = await Promise.all(batch.map(async (segUrl) => {
          let retries = 3;
          while (retries > 0) {
            try {
              const res = await axios.get(segUrl, { responseType: "arraybuffer", headers, timeout: 8000 });
              return res.data;
            } catch (e) {
              retries--;
              if (retries === 0) throw e;
            }
          }
        }));
        
        for (const buf of buffers) {
          await handle.write(buf, 0, buf.byteLength, offset);
          offset += buf.byteLength;
        }
      }
      await handle.close();
      
      const extractedAacPath = audioPath.replace(".m4a", "_adts.aac");
      try {
        await execAsync(`ffmpeg -y -i "${audioPath}" -c:a copy "${extractedAacPath}"`);
        const voiceFinalUrl = await uploadAudioFile(extractedAacPath, api, message, uploadCloud);
        return voiceFinalUrl;
      } catch (e) {
        console.error("Lỗi extract AAC từ fMP4:", e.message);
        // Fallback to original
        return await uploadAudioFile(audioPath, api, message, uploadCloud);
      } finally {
        await deleteFile(extractedAacPath).catch(() => {});
      }
    }
    
    // NẾU LÀ PROGRESSIVE MP3 (Tải chunks)
    const head = await axios.head(url, { headers, timeout: 8_000, validateStatus: (s) => s >= 200 && s < 400 }).catch(() => ({ headers: {} }));
    let totalSize = Number(head.headers["content-length"] || 0);
    const contentType = head.headers["content-type"] || "";

    // Nếu là MP3 và > 95MB (nhạc Soundcloud >1h40p), cắt ngang ở 95MB để Zalo vẫn nhận là Voice message (<100MB)
    if (contentType.includes("mpeg") || url.includes("sndcdn")) {
      const MAX_VOICE_SIZE = 95 * 1024 * 1024;
      if (totalSize > MAX_VOICE_SIZE) {
        totalSize = MAX_VOICE_SIZE;
      }
    }

    const canRange = /bytes/i.test(String(head.headers["accept-ranges"] || ""));
    const chunkSize = 2 * 1024 * 1024;
    if (totalSize > chunkSize && canRange) {
      const handle = await fs.promises.open(audioPath, "w");
      await handle.truncate(totalSize);
      const ranges = [];
      for (let start = 0; start < totalSize; start += chunkSize) {
        ranges.push([start, Math.min(totalSize - 1, start + chunkSize - 1)]);
      }
      let cursor = 0;
      const worker = async () => {
        while (true) {
          const index = cursor++;
          if (index >= ranges.length) return;
          const [start, end] = ranges[index];
          let retries = 3;
          while (retries > 0) {
            try {
              const response = await axios.get(url, {
                responseType: "arraybuffer",
                headers: { ...headers, Range: `bytes=${start}-${end}` },
                timeout: 60_000,
                maxContentLength: Infinity,
                maxBodyLength: Infinity,
              });
              await handle.write(Buffer.from(response.data), 0, end - start + 1, start);
              break; // Success
            } catch (err) {
              retries--;
              if (retries === 0) throw err;
              await new Promise(r => setTimeout(r, 1000));
            }
          }
        }
      };
      
      try {
        await Promise.all(Array.from({ length: Math.min(50, ranges.length) }, worker));
      } finally {
        await handle.close();
      }
    } else {
      const MAX_VOICE_SIZE = 95 * 1024 * 1024;
      const isCapped = contentType.includes("mpeg") || url.includes("sndcdn");
      const response = await axios.get(url, { headers, responseType: "stream", timeout: 0 });
      await new Promise((resolve, reject) => {
        const writer = fs.createWriteStream(audioPath);
        let downloaded = 0;
        
        response.data.on("data", (chunk) => {
          downloaded += chunk.length;
          if (isCapped && downloaded > MAX_VOICE_SIZE) {
            response.data.destroy(); // Dừng tải khi đạt 95MB
            writer.end();
            resolve();
          }
        });

        response.data.pipe(writer);
        writer.on("finish", resolve);
        writer.on("error", reject);
        response.data.on("error", reject);
      });
    }
    // Zalo có thể nhận upload MP3 nhưng voice tạo ra lại không phát được trên
    // client. Chuẩn hóa progressive audio thành AAC trước khi upload voice.
    convertedAudioPath = path.join(tempDir, `voice_${randomIDTemp()}.aac`);
    await convertToAAC(audioPath, convertedAudioPath);
    const voiceFinalUrl = await uploadAudioFile(convertedAudioPath, api, message, uploadCloud);

    return voiceFinalUrl;
  } catch (error) {
    throw error;
  } finally {
    await deleteFile(audioPath);
    if (convertedAudioPath) await deleteFile(convertedAudioPath);
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
      if (actualPath !== tempAudioPath && fs.existsSync(actualPath)) {
        fs.renameSync(actualPath, tempAudioPath);
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
        timeout: 0,
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
