import { removeBackgroundFromImageUrl } from "remove.bg";
import { getApiKeysMedia } from "../../utils/api-key-manager.js";
import sharp from "sharp";
import { getClientAxios } from "./browser-launch.js";

let apiInvalid = [];
export let API_KEY_HUNGDEV = getApiKeysMedia("HUNGDEV")[0];
const client = getClientAxios();

export async function removeBackground(imageUrl, ext = "png") {
  const removeBgKeys = getApiKeysMedia("REMOVEBG");
  if (apiInvalid.length === removeBgKeys.length) apiInvalid = [];

  let isWebp = ext === "webp";

  let inputBuffer = null;
  if (isWebp) {
    const res = await fetch(imageUrl);
    const webpBuffer = await res.arrayBuffer();
    inputBuffer = await sharp(Buffer.from(webpBuffer)).jpeg().toBuffer();
  }

  for (const apiKey of removeBgKeys) {
    if (apiInvalid.includes(apiKey)) continue;

    try {
      const result = await removeBackgroundFromImageUrl({
        url: isWebp ? undefined : imageUrl,
        imageFile: isWebp ? inputBuffer : undefined,
        apiKey: apiKey,
        size: "regular",
        type: "auto",
      });

      return Buffer.from(result.base64img, "base64");
    } catch (error) {
      console.warn(`API key ${apiKey} gặp lỗi:`, error);
      apiInvalid.push(apiKey);
      continue;
    }
  }

  console.error("Tất cả API key xóa phông nền đều không khả dụng, chuyển sang api thứ 3");
  try {
    const response = await client.get("https://hungdev.id.vn/ai/rpb", {
      params: {
        apikey: API_KEY_HUNGDEV,
        version: "v2",
        url: imageUrl,
      },
    });
    return Buffer.from(response.data.data.replace(/^data:image\/png;base64,/, ""), "base64");
  } catch (error) {
    console.error("Api Thứ 3 - Xóa Nền Không Khả Dụng...", error);
  }
  return null;
}
