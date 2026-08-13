import fs from "fs";
import path from "path";
import { LRUCache } from "lru-cache";
import { createCanvas, loadImage } from "canvas";
import { randomIDTemp, removeMention } from "../../../utils/format-util.js";
import { getGlobalPrefix } from "../../service.js";
import { getClientAxios } from "../../utilities/browser-launch.js";
import { deleteFile, loadImageBuffer } from "../../../utils/util.js";
import { MessageMention } from "../../../api-zalo/index.js";
import { sendMessageCompleteRequest, sendMessageWarningRequest } from "../../chat-zalo/chat-style/chat-style.js";
import { setSelectionsMapData } from "../index.js";
import { tempDir } from "../../../utils/io-json.js";
import { processAndSendSticker } from "../../chat-zalo/chat-special/send-sticker/convert-sticker.js";

export const PLATFORM_TENOR = "tenor";
const TIME_TO_SELECT = 120000;
const client = getClientAxios();

async function searchGifInTenor(keyword, limit = 20) {
  try {
    const response = await client.get("https://tenor.googleapis.com/v2/search", {
      params: {
        appversion: "browser-r20250506-1",
        prettyPrint: "false",
        key: "AIzaSyC-P6_qz3FzCoXGLk6tgitZo4jEJ5mLzD8",
        client_key: "tenor_web",
        locale: "vi",
        anon_id: "AAY13GEzCuQBi8aSBwUVlg",
        q: keyword,
        limit,
        contentfilter: "low",
        media_filter: "gif,gif_transparent,webp,webp_transparent,gifpreview",
        fields:
          "next,results.id,results.media_formats,results.title,results.h1_title,results.long_title,results.itemurl,results.url,results.created,results.user,results.shares,results.embed,results.hasaudio,results.policy_status,results.source_id,results.flags,results.tags,results.content_rating,results.bg_color,results.legacy_info,results.geographic_restriction,results.content_description",
        searchfilter: "sticker",
        component: "web_desktop",
      },
    });
    if (response.data && response.data.results) {
      return response.data.results;
    } else {
      return null;
    }
  } catch (error) {
    console.error("Lỗi khi search Tenor: ", error);
    return null;
  }
}

const tenorSelectionsMap = new LRUCache({
  max: 500,
  ttl: TIME_TO_SELECT,
});

export async function handleTenorStickerCommand(api, message, aliasCommand) {
  const senderId = message.data.uidFrom;
  const senderName = message.data.dName;
  let imagePath = null;

  try {
    const content = removeMention(message);
    const prefix = getGlobalPrefix(api.getBotId());
    const commandContent = content.replace(`${prefix}${aliasCommand}`, "").trim();
    const [keyword, numberResult] = commandContent.split("&&");

    if (!keyword) {
      const object = {
        caption: `Vui lòng nhập từ khóa tìm kiếm\nVí dụ:\n${prefix}${aliasCommand} meme cần tìm`,
      };
      await sendMessageWarningRequest(api, message, object, 30000);
      return;
    }

    let limit = Math.min(parseInt(numberResult) || 10, 50);
    const result = await searchGifInTenor(keyword, limit);

    if (!result || result.length === 0) {
      const object = {
        caption: `Không tìm kết quả nào với từ khóa: ${keyword}`,
      };
      await sendMessageWarningRequest(api, message, object, 30000);
      return;
    }

    let tenorSearchListTxt = "Đây là danh sách kết quả mà tôi tìm được:\n";
    tenorSearchListTxt += "Hãy trả lời tin nhắn này với số index của kết quả mà bạn muốn tạo sticker!\n\n";

    imagePath = await drawStickerList(result);

    const object = {
      caption: tenorSearchListTxt,
      imagePath: imagePath,
    };
    const tenorListMessage = await sendMessageCompleteRequest(api, message, object, TIME_TO_SELECT);

    const quotedMsgId = tenorListMessage?.message?.msgId || tenorListMessage?.attachment[0]?.msgId;

    tenorSelectionsMap.set(quotedMsgId.toString(), {
      userRequest: senderId,
      collection: result,
      timestamp: Date.now(),
    });
    setSelectionsMapData(senderId, {
      quotedMsgId: quotedMsgId.toString(),
      collection: result,
      timestamp: Date.now(),
      platform: PLATFORM_TENOR,
    });
  } catch (error) {
    console.error("Lỗi xử lý lệnh Tenor Sticker:", error);
    await api.sendMessage(
      {
        msg: `${senderName} Đã xảy ra lỗi khi xử lý lệnh của bạn. Vui lòng thử lại sau.`,
        mentions: [MessageMention(senderId, senderName.length, 0)],
        ttl: 30000,
      },
      message.threadId,
      message.type
    );
  } finally {
    if (imagePath) deleteFile(imagePath);
  }
}

export async function handleTenorStickerReply(api, message) {
  const senderId = message.data.uidFrom;
  const idBot = api.getBotId();
  let stickerSelected;

  try {
    if (!message.data.quote || !message.data.quote.globalMsgId) return false;

    const quotedMsgId = message.data.quote.globalMsgId.toString();
    if (!tenorSelectionsMap.has(quotedMsgId)) return false;

    const stickerDataSelection = tenorSelectionsMap.get(quotedMsgId);
    if (stickerDataSelection.userRequest !== senderId) return false;

    let selection = removeMention(message);
    const selectedIndex = parseInt(selection) - 1;
    if (isNaN(selectedIndex)) {
      const object = {
        caption: `Lựa chọn không hợp lệ. Vui lòng chọn một số từ danh sách.`,
      };
      await sendMessageWarningRequest(api, message, object, 30000);
      return true;
    }

    const { collection } = tenorSelectionsMap.get(quotedMsgId);
    if (selectedIndex < 0 || selectedIndex >= collection.length) {
      const object = {
        caption: `Số bạn chọn không nằm trong danh sách. Vui lòng chọn lại.`,
      };
      await sendMessageWarningRequest(api, message, object, 30000);
      return true;
    }

    stickerSelected = collection[selectedIndex];
    // const msgDel = {
    //   type: message.type,
    //   threadId: message.threadId,
    //   data: {
    //     cliMsgId: message.data.quote.cliMsgId,
    //     msgId: message.data.quote.globalMsgId,
    //     uidFrom: idBot,
    //   },
    // };
    // await api.deleteMessage(msgDel, false);
    await api.addReaction("CLOCK", message);
    // await api.undoMessage(message);
    // musicSelectionsMap.delete(quotedMsgId);
    return await processSendTenorSticker(api, message, stickerSelected);
  } catch (error) {
    console.error("Lỗi xử lý reply Tenor Sticker:", error);
    const object = {
      caption: `Đã xảy ra lỗi khi xử lý Sticker cho bạn, vui lòng thử lại sau.`,
    };
    await sendMessageWarningRequest(api, message, object, 30000);
    return true;
  }
}

export async function processSendTenorSticker(api, message, stickerSelected) {
  const linksSticker = stickerSelected.media_formats;
  const linkMainSticker =
    linksSticker.webp_transparent || linksSticker.webp || linksSticker.gif_transparent || linksSticker.gif;
  try {
    await processAndSendSticker(api, message, linkMainSticker.url);
    await api.addReaction("UNDO", message);
    await api.addReaction("LIKE", message);
  } catch (error) {
    await api.addReaction("UNDO", message);
    await api.addReaction("TIEUTAN", message);
  }
  return true;
}

async function drawStickerList(tenorListSearch) {
  try {
    if (!tenorListSearch || !tenorListSearch.length) return null;

    const STICKER_SIZE = 180;
    const PADDING = 10;
    const STICKERS_PER_ROW = 5;
    const TEXT_HEIGHT = 20;

    const rows = Math.ceil(tenorListSearch.length / STICKERS_PER_ROW);
    const canvasWidth = STICKERS_PER_ROW * (STICKER_SIZE + PADDING) + PADDING;
    const canvasHeight = rows * (STICKER_SIZE + TEXT_HEIGHT + PADDING) + PADDING;

    const canvas = createCanvas(canvasWidth, canvasHeight);
    const ctx = canvas.getContext("2d");

    ctx.fillStyle = "white";
    ctx.fillRect(0, 0, canvasWidth, canvasHeight);
    ctx.strokeStyle = "#ccc";
    ctx.lineWidth = 1;

    for (let i = 1; i < STICKERS_PER_ROW; i++) {
      const x = i * (STICKER_SIZE + PADDING);
      ctx.beginPath();
      ctx.moveTo(x + PADDING / 2, 0);
      ctx.lineTo(x + PADDING / 2, canvasHeight);
      ctx.stroke();
    }

    for (let j = 1; j < rows; j++) {
      const y = j * (STICKER_SIZE + TEXT_HEIGHT + PADDING);
      ctx.beginPath();
      ctx.moveTo(0, y + PADDING / 2);
      ctx.lineTo(canvasWidth, y + PADDING / 2);
      ctx.stroke();
    }
    let countCompleted = 0;

    const drawPromises = tenorListSearch.map(async (sticker, i) => {
      const row = Math.floor(i / STICKERS_PER_ROW);
      const col = i % STICKERS_PER_ROW;

      const x = col * (STICKER_SIZE + PADDING) + PADDING;
      const y = row * (STICKER_SIZE + TEXT_HEIGHT + PADDING) + PADDING;
      const linksSticker = sticker.media_formats;

      try {
        try {
          const linkMainSticker = linksSticker.gifpreview || linksSticker.webp_transparent || linksSticker.webp;
          const buffer = await loadImageBuffer(linkMainSticker.url);
          const image = await loadImage(buffer);
          ctx.drawImage(image, x, y, STICKER_SIZE, STICKER_SIZE);
          return true;
        } catch (error) {
          const linkMainSticker = linksSticker.gif_transparent || linksSticker.gif;
          const buffer = await loadImageBuffer(linkMainSticker.url);
          const image = await loadImage(buffer);

          const tempCanvas = createCanvas(130, 130);
          const tempCtx = tempCanvas.getContext("2d");
          tempCtx.drawImage(image, 0, 0, 130, 130);

          const croppedImage = await loadImage(tempCanvas.toBuffer());
          ctx.drawImage(croppedImage, x, y, STICKER_SIZE, STICKER_SIZE);
          return false;
        }
      } catch (error) {
        console.error(`Không thể tải sticker ID ${sticker.id}:`, error.message);
        return false;
      } finally {
        ctx.fillStyle = "black";
        ctx.font = "14px Arial";
        ctx.textAlign = "center";
        ctx.fillText(`ID: ${i + 1}`, x + STICKER_SIZE / 2, y + STICKER_SIZE + 15);
      }
    });

    const results = await Promise.allSettled(drawPromises);
    countCompleted = results.filter((r) => r.status === "fulfilled" && r.value).length;

    if (countCompleted === 0) {
      return null;
    }

    const outputPath = path.join(tempDir, `sticker_list_${randomIDTemp()}.png`);
    return new Promise((resolve, reject) => {
      const out = fs.createWriteStream(outputPath);
      const stream = canvas.createPNGStream();

      stream.pipe(out);
      out.on("finish", () => resolve(outputPath));
      out.on("error", (err) => {
        console.error("Lỗi khi lưu ảnh:", err);
        reject(err);
      });
    });
  } catch (error) {
    console.error(chalk.red("Lỗi trong drawStickerList:", error));
    return null;
  }
}
