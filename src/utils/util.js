import FormData from "form-data";
import axios from "axios";
import fs from "fs";
import path from "path";
import ffmpeg from "fluent-ffmpeg";
import { exec, spawn } from "child_process";
import { promisify } from "util";
import sharp from "sharp";
import { Readable } from "stream";
import HttpsProxyAgent from "https-proxy-agent";
import { fileTypeFromStream } from "file-type";
import { loadImage } from "canvas";
import { readSettingConfig, tempDir } from "./io-json.js";
import { asyncPool, getFileSize, getVideoMetadata } from "../api-zalo/utils.js";
import { randomIDTemp } from "./format-util.js";
import { getClientAxios } from "../service-dqt/utilities/browser-launch.js";

export const TIME_HOUR_24 = 86400000;

export async function checkUrlStatus(url) {
  if (!url) return false;
  try {
    const response = await axios.head(url, {
      timeout: 5000,
      maxRedirects: 5,
      validateStatus: () => true,
    });
    if (response.status >= 200 && response.status < 400) return true;
  } catch (error) {
    console.log(`HEAD không kiểm tra được link, chuyển sang GET Range: ${error.message}`);
  }

  // Nhiều CDN nhạc chặn HEAD nhưng vẫn cho tải/phát. Chỉ lấy byte đầu
  // để xác nhận link, tránh tải lại toàn bộ file âm thanh.
  try {
    const response = await axios.get(url, {
      timeout: 8000,
      maxRedirects: 5,
      responseType: "stream",
      headers: {
        Range: "bytes=0-0",
        "User-Agent": "Mozilla/5.0",
        Accept: "*/*",
      },
      validateStatus: () => true,
    });
    response.data?.destroy?.();
    return response.status >= 200 && response.status < 400;
  } catch (error) {
    console.log(`Link đã gãy hoặc timeout: ${url}`, error.message);
    return false;
  }
}

export function checkContentIsLink(content) {
  try {
    new URL(content);
    return true;
  } catch (err) {
    return false;
  }
}

export async function checkLinkIsValid(content) {
  try {
    if (!content || typeof content !== "string") return false;
    content = content.trim();
    if (!content.match(/^https?:\/\//i)) {
      content = "https://" + content;
    }
    new URL(content);
    const client = getClientAxios();
    await client.head(content, {
      timeout: 2000,
    });
    return true;
  } catch {
    return false;
  }
}

export const execAsync = promisify(exec);
async function uploadToMyHostCustom(imagePath) {
  try {
    const form = new FormData();
    form.append("image", fs.createReadStream(imagePath));

    const res = await axios.post("https://hahuyhoang.io.vn/upload", form, {
      headers: {
        ...form.getHeaders(),
        "x-api-key": "HHH_agXde89",
      },
    });

    if (res.data.status === "success") return res.data.url;
    return null;
  } catch (e) {
    return null;
  }
}

export async function uploadTempFile(pathLocal, serviceType = 1, apiObj) {
  const { api = null, message = null } = apiObj || {};
  // const startTime = performance.now();
  let result = null;

  // Ưu tiên upload thẳng lên Zalo Cloud (giống cách voice/video đang làm) để có link bền,
  // không phụ thuộc host ngoài (tmpfiles/uguu/litterbox) hay bị chết link / không xem được.
  if (api) {
    try {
      const threadIdForUpload = message?.data?.uidFrom || api.getBotId();
      const uploadResult = await api.uploadAttachment([pathLocal], threadIdForUpload, 0, {
        uploadCloud: true,
        isUseProphylactic: true,
      });
      const zaloUrl = uploadResult?.[0]?.fileUrl || uploadResult?.[0]?.normalUrl;
      if (zaloUrl) return zaloUrl;
      throw new Error("Zalo không trả về URL sau khi upload");
    } catch (error) {
      console.error("Core upload Zalo thất bại:", error);
      throw error;
    }
  }

  result = await uploadToMyHostCustom(pathLocal);
    if (result) return result;

  try {
    if (serviceType === 3) result = await uploadToLitterBox(pathLocal);
    if (!result) {
      result = await uploadToUguu(pathLocal);
    }
  } catch (error) {
    result = await uploadToTmpFile(pathLocal);
  }
  try {
    if (serviceType === 2) result = await uploadToTmpFile(pathLocal);
    if (!result) {
      result = await uploadToUguu(pathLocal);
    }
  } catch (error) {
    result = await uploadToLitterBox(pathLocal);
  }
  try {
    if (serviceType === 1) result = await uploadToUguu(pathLocal);
    if (!result) {
      result = await uploadToTmpFile(pathLocal);
    }
  } catch (error) {
    result = await uploadToLitterBox(pathLocal);
  }

  // const endTime = performance.now();
  // const duration = (endTime - startTime) / 1000;

  // if (duration.toFixed(2) > 1) {
  //   console.log(`⏱️ Thời gian upload file bằng service ${serviceType}: ${duration.toFixed(2)} giây`);
  // }
  return result;
}


/**
 * Upload file lên tmpfiles.org
 */
export async function uploadToTmpFile(pathLocal) {
  try {
    const fileName = path.basename(pathLocal);
    const buffer = fs.createReadStream(pathLocal);
    const formData = new FormData();
    formData.append("file", buffer, {
      filename: fileName,
    });

    const response = await axios.post("https://tmpfiles.org/api/v1/upload", formData, {
      headers: formData.getHeaders(),
    });

    if (response.status === 200 && response.data.data.url) {
      const downloadUrl = response.data.data.url.replace("tmpfiles.org/", "tmpfiles.org/dl/");
      return downloadUrl;
    } else {
      console.error("Lỗi khi upload:", response.data);
      return null;
    }
  } catch (error) {
    console.error("Lỗi khi upload lên dịch vụ tempfile:", error);
    return null;
  }
}

/**
 * Upload file lên LitterBox
 */
export async function uploadToLitterBox(pathLocal, expiry = "24h") {
  const form = new FormData();
  form.append("reqtype", "fileupload");
  form.append("time", expiry); // các lựa chọn: '1h', '12h', '24h', '72h'
  form.append("fileToUpload", fs.createReadStream(pathLocal));

  try {
    const response = await axios.post("https://litterbox.catbox.moe/resources/internals/api.php", form, {
      headers: form.getHeaders(),
    });

    if (typeof response.data === "string" && response.data.startsWith("https://")) {
      return response.data;
    } else {
      console.error("❌ Upload thất bại:", response.data);
      return null;
    }
  } catch (err) {
    console.error("❌ Lỗi khi upload:", err.message);
    return null;
  }
}

/**
 * Upload file lên uguu.se
 */
export async function uploadToUguu(pathLocal) {
  try {
    const fileName = path.basename(pathLocal);
    const buffer = fs.createReadStream(pathLocal);

    const formData = new FormData();
    formData.append("files[]", buffer, fileName);
    formData.append("randomname", "true");

    const response = await axios.post("https://uguu.se/upload.php", formData, {
      headers: {
        ...formData.getHeaders(),
        accept: "application/json",
      },
    });

    if (response.status === 200 && response.data) {
      return response.data.files[0].url;
    } else {
      console.error("Lỗi upload:", response.data);
      return null;
    }
  } catch (error) {
    console.error("Lỗi khi upload lên Uguu:", error.message);
    return null;
  }
}

/**
 * Download file từ URL và lưu vào file với các options phù hợp theo loại file
 */
export async function downloadFile(url, filepath) {
  const client = getClientAxios();
  const response = await client.get(url, {
    responseType: "stream",
    timeout: 30_000,
  });
  // Abort stalled streams instead of leaving commands waiting forever.
  if (typeof response.data.setTimeout === "function") {
    response.data.setTimeout(30_000, () => response.data.destroy(new Error("Download stream timeout")));
  }
  const tempFilePath =
    filepath || path.join(tempDir, `fileDownload_${randomIDTemp()}.${await checkExstentionFileRemote(url)}`);
  return new Promise((resolve, reject) => {
    const writer = fs.createWriteStream(tempFilePath);
    response.data.pipe(writer);
    writer.on("finish", () => {
      resolve(tempFilePath);
    });
    writer.on("error", reject);
  });
}

/**
 * Download video từ URL bằng ffmpeg và lưu vào file
 */
export async function downloadVideoWithFFmpeg(url, filepath) {
  const tempFilePath =
    filepath || path.join(tempDir, `videoDownload_${randomIDTemp()}.${url.split(".").pop().toLowerCase()}`);

  return new Promise((resolve, reject) => {
    ffmpeg(url)
      .outputOptions("-c copy") // không re-encode, giữ nguyên chất lượng
      .on("end", () => {
        resolve(tempFilePath);
      })
      .on("error", (err) => {
        reject(err);
      })
      .save(tempFilePath);
  });
}

/**
 * Download video từ URL và lưu vào file
 */
export async function downloadAndSaveVideo(videoUrl) {
  const settingConfig = readSettingConfig();
  const USE_PROXY = settingConfig["USE_PROXY"] || false;
  const PROXY = settingConfig["PROXY_HTTP"] || "";
  const client = getClientAxios();
  const videoResponse = await client.get(videoUrl, {
    responseType: "arraybuffer",
    httpsAgent:
      (USE_PROXY && (PROXY.startsWith("http") || PROXY.startsWith("https") ? new HttpsProxyAgent(PROXY) : undefined)) ||
      undefined,
  });

  if (!fs.existsSync(tempDir)) {
    fs.mkdirSync(tempDir);
  }

  const tempFilePath = path.join(tempDir, `video_${randomIDTemp()}.mp4`);
  fs.writeFileSync(tempFilePath, videoResponse.data);

  return tempFilePath;
}

/**
 * Bất đồng bộ: Mở file với promise
 */
export async function readFilePromise(path, options = null) {
  return await fs.promises.readFile(path, options);
}

/**
 * Đồng bộ: Mở file với sync
 */
export function readFileSync(path, options = null) {
  return fs.readFileSync(path, options);
}

/**
 * Bất đồng bộ: Lưu file vào thư mục cụ thể
 */
export function writeFile(path, data) {
  fs.writeFile(path, data, (err) => {
    if (err) {
      console.error("Lỗi khi lưu file", err);
    }
    console.log("Ghi file xong!");
  });
  return path;
}

/**
 * Bất đồng bộ: Lưu file vào thư mục cụ thể
 */
export async function writeFilePromise(path, data, options = null) {
  await fs.promises.writeFile(path, data, options);
  return path;
}

/**
 * Đồng bộ: Lưu file vào thư mục cụ thể
 */
export function writeFileSync(path, data, options = null) {
  fs.writeFileSync(path, data, options);
  return path;
}

/**
 * Xóa file theo đường dẫn
 */
export async function deleteFile(pathFile) {
  if (!pathFile) return;
  let attempts = 0;
  const maxAttempts = 3;

  while (attempts < maxAttempts) {
    try {
      if (fs.existsSync(pathFile)) {
        fs.unlinkSync(pathFile);
        if (!fs.existsSync(pathFile)) {
          return;
        }
      } else {
        return;
      }
    } catch (error) {
      // console.error(error)
    }
    attempts++;

    if (attempts < maxAttempts) {
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
  }
}

const mimeToExt = {
  "image/jpeg": "jpg",
  "image/jpg": "jpg",
  "image/png": "png",
  "image/gif": "gif",
  "image/webp": "webp",
  "image/bmp": "bmp",
  "image/tiff": "tiff",
  "image/svg+xml": "svg",
  "image/x-icon": "ico",
  "image/vnd.microsoft.icon": "ico",

  "video/mp4": "mp4",
  "video/webm": "webm",
  "video/quicktime": "mov",
  "video/x-msvideo": "avi",
  "video/x-ms-wmv": "wmv",
  "video/mpeg": "mpeg",
  "video/ogg": "ogv",

  "audio/mpeg": "mp3",
  "audio/mp4": "m4a",
  "audio/wav": "wav",
  "audio/webm": "weba",
  "audio/aac": "aac",
  "audio/ogg": "oga",
  "audio/flac": "flac",
  "audio/x-ms-wma": "wma",

  "application/pdf": "pdf",
  "application/msword": "doc",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "docx",
  "application/vnd.ms-excel": "xls",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": "xlsx",
  "application/vnd.ms-powerpoint": "ppt",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation": "pptx",
  "text/plain": "txt",
  "application/rtf": "rtf",
  "text/csv": "csv",
  "text/html": "html",
  "text/css": "css",
  "text/md": "md",
  "application/json": "json",
  "application/xml": "xml",

  "application/zip": "zip",
  "application/x-rar-compressed": "rar",
  "application/x-7z-compressed": "7z",
  "application/x-tar": "tar",
  "application/x-gzip": "gz",
  "application/x-bzip2": "bz2",
  "application/x-xz": "xz",

  "application/vnd.android.package-archive": "apk",
  "application/java-archive": "jar",
  "application/x-msdownload": "exe",
  "application/x-shockwave-flash": "swf",
  "application/x-msinstaller": "msi",

  "application/javascript": "js",
  "application/x-python": "py",
  "text/x-java-source": "java",
  "text/x-c": "c",
  "text/x-c++": "cpp",
  "text/x-shellscript": "sh",
  "application/x-httpd-php": "php",

  "application/vnd.apple.mpegurl": "m3u8",
};
export const mimeSub = {
  "application/javascript": "text/javascript",
  "application/x-python": "text/x-python",
  "application/xml": "text/xml",
  "application/rtf": "text/rtf",
};
export const getMimeFromExt = (ext) => {
  for (const [key, value] of Object.entries(mimeToExt)) {
    if (value === ext) return key;
  }
  return null;
};

/**
 * Kiểm tra định dạng file từ URL remote
 */
export async function checkExstentionFileRemote(url, logError = true) {
  if (!checkContentIsLink(url)) return null;

  let attempts = 0;
  const maxAttempts = 3;
  const client = getClientAxios();

  while (attempts < maxAttempts) {
    try {
      const response = await client.head(url);
      const contentType = response.headers["content-type"];

      if (!contentType) return null;

      let ext = mimeToExt[contentType] || null;
      if (ext) return ext;

      let extension = url.split(".").pop().toLowerCase();
      if (extension && extension.length <= 4) {
        return extension;
      }

      if (contentType.includes("octet-stream") && response.headers["content-disposition"]) {
        const contentDisposition = response.headers["content-disposition"];
        const filenameMatch = contentDisposition.match(/filename=["']?([^"']+)["']?/);
        if (filenameMatch && filenameMatch[1]) {
          const extension = filenameMatch[1].split(".").pop().toLowerCase();
          return extension;
        }
      }

      return null;
    } catch (error) {
      if (error.response && error.response.headers && error.response.headers["content-type"]) {
        const contentType = error.response.headers["content-type"];

        let ext = mimeToExt[contentType] || null;
        if (ext) return ext;
      }

      attempts++;
      if (attempts === maxAttempts) {
        if (logError) {
          console.error(`Lỗi khi kiểm tra định dạng file sau 3 lần thử với link ${url}\n`, error);
        }
        return null;
      }
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }
  }
}

export async function getFileTypeRemote(url, logError = true) {
  if (!checkContentIsLink(url)) return null;

  let attempts = 0;
  const maxAttempts = 3;
  const client = getClientAxios();

  while (attempts < maxAttempts) {
    try {
      const response = await client.get(url, {
        responseType: "stream",
      });
      const contentType = response.headers["content-type"];
      if (mimeToExt[contentType]) {
        return {
          ext: mimeToExt[contentType],
          contentType,
        };
      }

      const fileType = await fileTypeFromStream(response.data);
      if (fileType) {
        return {
          ext: fileType.ext,
          contentType: fileType.mime,
        };
      } else {
        if (contentType.includes("octet-stream") && response.headers["content-disposition"]) {
          const contentDisposition = response.headers["content-disposition"];
          const filenameMatch = contentDisposition.match(/filename=["']?([^"']+)["']?/);
          if (filenameMatch && filenameMatch[1]) {
            const extension = filenameMatch[1].split(".").pop().toLowerCase();
            const mime = getMimeFromExt(extension);
            return {
              ext: extension,
              contentType: mime,
            };
          }
        }
      }
    } catch (error) {
      if (error.response && error.response.headers && error.response.headers["content-type"]) {
        const contentType = error.response.headers["content-type"];

        let ext = mimeToExt[contentType] || null;
        if (ext)
          return {
            ext,
            contentType,
          };
      }
      if (attempts === maxAttempts) {
        if (logError) {
          console.error(`Lỗi khi kiểm tra định dạng file sau 3 lần thử với link ${url}\n`, error);
        }
        return null;
      }
      await new Promise((resolve) => setTimeout(resolve, 1000));
    } finally {
      attempts++;
    }
  }
}

/**
 * Tải và chuyển đổi ảnh sang PNG buffer từ đường dẫn hoặc URL
 * @param {string} source - Đường dẫn file hoặc URL của ảnh
 * @returns {Promise<Buffer>} Buffer dạng PNG của ảnh
 */
export async function loadImageBuffer(source, headers) {
  let buffer;
  try {
    if (source.startsWith("http://") || source.startsWith("https://")) {
      const client = getClientAxios();
      const response = await client.get(source, {
        responseType: "arraybuffer",
        timeout: 3000,
        headers: headers || undefined,
      });
      buffer = Buffer.from(response.data);
    } else {
      buffer = await fs.promises.readFile(source);
    }

    const pngBuffer = await sharp(buffer).png().toBuffer();

    return pngBuffer;
  } catch (error) {
    throw new Error(`Lỗi khi xử lý ảnh với src: ${source}\n`, error);
  }
}

/**
 * Lấy thông tin kích thước và dung lượng của ảnh thông qua ffmpeg
 * @param {string} imageUrl - URL hoặc đường dẫn của ảnh
 * @returns {Promise<{width: number, height: number, totalSize: number}>} Thông tin kích thước và dung lượng của ảnh
 */
export async function getImageInfo(imageUrl) {
  const maxRetries = 3;
  let attempt = 0;

  while (attempt < maxRetries) {
    try {
      const response = await axios.head(imageUrl);
      const totalSize = parseInt(response.headers["content-length"] || 0);

      const imageResponse = await axios.get(imageUrl, {
        responseType: "arraybuffer",
        validateStatus: function (status) {
          return status < 500; // Chấp nhận status code < 500
        },
      });

      // Kiểm tra status code 409
      if (imageResponse.status === 409) {
        console.log("Nhận được status code 409, thử lại sau 1 giây...");
        await new Promise((resolve) => setTimeout(resolve, 1000));
        attempt++;
        continue;
      }

      // Kiểm tra các status code lỗi khác
      if (imageResponse.status !== 200) {
        throw new Error(`Lỗi HTTP status ${imageResponse.status}`);
      }

      const metadata = await sharp(Buffer.from(imageResponse.data)).metadata();

      return {
        width: metadata.width || 500,
        height: metadata.height || 500,
        totalSize: totalSize || 0,
      };
    } catch (error) {
      // console.error(`Lần thử ${attempt + 1}/${maxRetries} thất bại:`, error.message);

      if (attempt === maxRetries - 1) {
        console.error("Đã hết 3 lần thử lại, trả về kích thước mặc định của ảnh");
        return {
          width: 500,
          height: 500,
          totalSize: 0,
        };
      }

      await new Promise((resolve) => setTimeout(resolve, 1000));
      attempt++;
    }
  }
}

/**
 * Chia Chunk mảng thành các mảng con
 * @param {Array} array - Mảng cần chia
 * @param {number} chunkSize - Số lượng phần tử trong mỗi mảng con
 */
export function chunkArray(array, chunkSize) {
  const chunks = [];
  for (let i = 0; i < array.length; i += chunkSize) {
    chunks.push(array.slice(i, i + chunkSize));
  }
  return chunks;
}

/**
 * Đo tốc độ chạy tác vụ
 * @param {String} label - Nhãn thông báo
 * @param {Function} asyncFn - Hàm chạy tác vụ
 */
export async function measureTime(label, asyncFn) {
  const start = performance.now();
  const result = await asyncFn();
  const end = performance.now();
  const duration = (end - start) / 1000;
  console.log(`⏱️ ${label}: ${duration.toFixed(2)} giây`);
  return result;
}

/**
 * Lấy thông tin kích thước và dung lượng của ảnh từ đường dẫn cục bộ
 * @param {string} imagePath - Đường dẫn cục bộ của ảnh
 * @returns {Promise<{width: number, height: number, totalSize: number}>} Thông tin kích thước và dung lượng của ảnh
 */
export async function getLocalImageInfo(imagePath) {
  try {
    if (!fs.existsSync(imagePath)) {
      throw new Error("File không tồn tại");
    }

    const stats = await fs.promises.stat(imagePath);
    const totalSize = stats.size;

    const buffer = fs.readFileSync(imagePath);
    const metadata = await sharp(buffer).metadata();

    return {
      width: metadata.width || 500,
      height: metadata.height || 500,
      totalSize: totalSize || 0,
    };
  } catch (error) {
    console.error("Lỗi khi đọc thông tin ảnh:", error.message);
    return {
      width: 500,
      height: 500,
      totalSize: 0,
    };
  }
}

export async function saveImageFromBuffer(buffer) {
  const tempPath = path.resolve(tempDir, `${randomIDTemp()}.${"jpg"}`);
  fs.writeFileSync(tempPath, buffer);
  return tempPath;
}

export async function saveVideoFromStream(stream) {
  const tempPath = path.resolve(tempDir, `${randomIDTemp()}.${"mp4"}`);
  const writer = fs.createWriteStream(tempPath);
  Readable.fromWeb(stream).pipe(writer);
  return tempPath;
}

export async function fetchImageAsBase64(imageUrl) {
  try {
    const client = getClientAxios();
    const response = await client.get(imageUrl, {
      responseType: "arraybuffer",
    });
    // const base64String = Buffer.from(response.data, "binary").toString("base64");
    // const contentType = response.headers["content-type"];
    // return `data:${contentType};base64,${base64String}`;
    return {
      base64String: Buffer.from(response.data, "binary").toString("base64"),
      contentType: response.headers["content-type"],
    };
  } catch (error) {
    console.error("Error fetching image:", error);
    return null;
  }
}

export async function fetchFileLocal(mediaUrl) {
  try {
    const fileType = await getFileTypeRemote(mediaUrl);
    const response = await axios({
      url: mediaUrl,
      method: "GET",
      responseType: "stream",
    });
    const tempFilePath = path.join(tempDir, `fileDownload_${randomIDTemp()}.${fileType.ext}`);
    return new Promise((resolve, reject) => {
      const writer = fs.createWriteStream(tempFilePath);
      response.data.pipe(writer);
      writer.on("finish", () => {
        resolve({
          filePath: tempFilePath,
          fileName: path.basename(tempFilePath),
          mime_type: fileType.contentType,
        });
      });
      writer.on("error", reject);
    });
  } catch (error) {
    console.error("Error fetching audio to local:", error);
    return null;
  }
}

export async function fetchVideoAsBase64(mediaUrl) {
  try {
    const response = await axios({
      url: mediaUrl,
      method: "GET",
      responseType: "stream",
    });
    const fileType = await getFileTypeRemote(mediaUrl);
    const tempFilePath = path.join(tempDir, `fileDownload_${randomIDTemp()}.${fileType.ext}`);
    return new Promise((resolve, reject) => {
      const writer = fs.createWriteStream(tempFilePath);
      response.data.pipe(writer);
      writer.on("finish", async () => {
        resolve({
          size: await getFileSize(tempFilePath),
          filePath: tempFilePath,
          fileName: path.basename(tempFilePath),
          contentType: fileType.mime,
          videoBytes: fs.readFileSync(tempFilePath, { encoding: "base64" }),
        });
      });
      writer.on("error", reject);
    });
  } catch (error) {
    console.error("Error fetching audio to local:", error);
    return null;
  }
}

export async function loadImageWithRetry(url, maxRetries = 3, timeout = 10000, headers) {
  let lastError;

  for (let i = 0; i < maxRetries; i++) {
    try {
      const imageBuffer = await loadImageBuffer(url, headers);
      return await loadImage(imageBuffer);
    } catch (error) {
      lastError = error;
      await new Promise((resolve) => setTimeout(resolve, 1000 * (i + 1))); // Exponential backoff
    }
  }
  console.error(`Lỗi khi load ảnh sau ${maxRetries} lần thất bại:`, lastError.message);
  throw lastError;
}

export async function loadImageRetryMultiRequest(url, retries = 3) {
  for (let attempt = 0; attempt < retries; attempt++) {
    try {
      const response = await axios.get(url, { responseType: "arraybuffer" });
      return await loadImage(Buffer.from(response.data));
    } catch (error) {
      if (error.response && error.response.status === 403) {
        // console.warn(`Lỗi 403 khi tải hình ảnh từ ${url}. Thử lại... (${attempt + 1}/${retries})`);
        await new Promise((resolve) => setTimeout(resolve, 1000));
      } else {
        console.error(`Lỗi khi tải hình ảnh từ ${url}:`, error.message);
        throw error;
      }
    }
  }
  throw new Error(`Không thể tải hình ảnh từ ${url} sau ${retries} lần thử.`);
}
export function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
