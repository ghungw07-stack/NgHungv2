import { parentPort } from "worker_threads";
import * as nsfwjs from "nsfwjs";
import sharp from "sharp";
import axios from "axios";

let model = null;

const initModel = async () => {
  try {
    if (!model) {
      model = await nsfwjs.load(); //"InceptionV3"
      parentPort.postMessage({ type: "init", success: true });
    }
  } catch (error) {
    parentPort.postMessage({
      type: "init",
      success: false,
      error: error.message,
    });
  }
};

async function loadImageWithSharp(imageBuffer) {
  const { data, info } = await sharp(imageBuffer).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  return { data, width: info.width, height: info.height };
}

async function analyzeImage(imageBuffer) {
  if (!model) {
    await initModel();
  }

  const { data, width, height } = await loadImageWithSharp(imageBuffer);
  const imageData = { data, width, height };
  const predictions = await model.classify(imageData);
  const nsfw_score = predictions.reduce((score, pred) => {
    if (["Porn", "Sexy", "Hentai"].includes(pred.className)) {
      return score + pred.probability;
    }
    return score;
  }, 0);

  return nsfw_score * 100;
}

initModel();

const picpurifyUrl = "https://www.picpurify.com/analyse/1.1";
export let API_KEY_PICPURIFY = "eW470CfhLhbA8UASItPKtLHAKYzd8PUF";
/**
 * Hàm phân tích hình ảnh, hỗ trợ URL, file path, hoặc Buffer
 * @param {string|Buffer} srcCheck - Đường dẫn ảnh, URL, hoặc Buffer dữ liệu ảnh
 * @returns {Promise<number>} - Trả về độ rủi ro (0 nếu an toàn, hoặc từ 60–100 nếu có nội dung nhạy cảm)
 */
async function analyzeImageApiPICPURIFY(srcCheck) {
  try {
    const form = new FormData();
    form.append("API_KEY", API_KEY_PICPURIFY);
    form.append("task", "porn_moderation,suggestive_nudity_moderation");

    if (Buffer.isBuffer(srcCheck)) {
      const bufferStream = new stream.PassThrough();
      bufferStream.end(srcCheck);
      form.append("file_image", bufferStream, {
        filename: "buffer_image.jpg",
        contentType: "image/jpeg",
        knownLength: srcCheck.length,
      });
    } else if (typeof srcCheck === "string" && srcCheck.startsWith("http")) {
      form.append("url_image", srcCheck);
    } else if (typeof srcCheck === "string" && fs.existsSync(srcCheck)) {
      const stats = fs.statSync(srcCheck);
      const file = fs.createReadStream(srcCheck);
      form.append("file_image", file, { knownLength: stats.size });
    } else {
      throw new Error("Invalid input: Must be Buffer, URL, or file path.");
    }

    const headers = {
      ...form.getHeaders(),
      "Content-Length": await new Promise((resolve, reject) => {
        form.getLength((err, length) => {
          if (err) reject(err);
          else resolve(length);
        });
      }),
    };

    const response = await axios.post(picpurifyUrl, form, { headers });

    if (response.status === 200 && response.data.status === "success") {
      const isNude =
        response.data.porn_moderation?.porn_content ||
        response.data.suggestive_nudity_moderation?.suggestive_nudity_content;
      return isNude ? Math.floor(Math.random() * (100 - 60 + 1)) + 60 : 0;
    }

    return 0;
  } catch (error) {
    console.error("Image analysis failed:", error.message || error);
    return 0;
  }
}

parentPort.on("message", async (data) => {
  try {
    if (!model) throw new Error("Model chưa được khởi tạo");
    const score = await analyzeImage(data.imageBuffer);
    // const score = await analyzeImageApiPICPURIFY(data.imageBuffer);
    parentPort.postMessage({ type: "result", success: true, score });
  } catch (error) {
    parentPort.postMessage({
      type: "result",
      success: false,
      error: error.message,
    });
  }
});
