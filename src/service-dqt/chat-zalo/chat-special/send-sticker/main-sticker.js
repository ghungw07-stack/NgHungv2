import fs from "fs";
import path from "path";
import schedule from "node-schedule";
import chalk from "chalk";
import { createCanvas, loadImage } from "canvas";
import axios from "axios";
import { randomIDTemp, removeMention } from "../../../../utils/format-util.js";
import { getGlobalPrefix } from "../../../service.js";
import {
  sendMessageComplete,
  sendMessageCompleteRequest,
  sendMessageQuery,
  sendMessageWarning,
} from "../../chat-style/chat-style.js";
import { isAdmin } from "../../../../index.js";
import { DATA_STICKER_FILE_PATH, tempDir } from "../../../../utils/io-json.js";
import { deleteFile, downloadFile, getFileTypeRemote, readFilePromise, writeFileSync } from "../../../../utils/util.js";
import { getVideoMetadata } from "../../../../api-zalo/utils.js";
import { handleSpamStickerCommand, handleStopSpamCommand, handleSetDelayCommand } from "./spam-sticker.js";

class StickerManager {
  constructor() {
    this.data = null;
    this.hasChanges = false;
    this.saveInterval = setInterval(() => this.checkSave(), 30 * 1000);
  }

  async init() {
    try {
      if (this.data) return;
      const dataStickerReadFile = await readFilePromise(DATA_STICKER_FILE_PATH);
      this.data = JSON.parse(dataStickerReadFile);
    } catch (error) {
      console.error(chalk.red("Lỗi khi khởi tạo dữ liệu sticker:", error));
      this.data = {};
    }
  }

  get() {
    if (!this.data) this.init();
    return this.data;
  }

  save() {
    if (this.hasChanges) {
      try {
        writeFileSync(DATA_STICKER_FILE_PATH, JSON.stringify(this.data, null, 2));
        this.hasChanges = false;
      } catch (error) {
        console.error(chalk.red("Lỗi khi lưu dữ liệu sticker:", error));
      }
    }
  }

  getById(idSticker) {
    if (!this.data) this.init();
    for (const category of Object.values(this.data)) {
      if (category.stickers && Array.isArray(category.stickers)) {
        for (const sticker of category.stickers) {
          if (sticker && sticker.id === idSticker) {
            return sticker;
          }
        }
      }
    }
    return null;
  }

  setChange() {
    this.hasChanges = true;
  }

  checkSave() {
    this.save();
  }
}

export const dataSticker = new StickerManager();
await dataSticker.init();

export async function checkUrlStatus(url) {
  if (!url) return false;

  try {
    const response = await axios.head(url, {
      timeout: 5000,
    });
    return response.status === 200;
  } catch (error) {
    return false;
  }
}

// Hàm kiểm tra và xử lý quyền admin
function checkAdminPermission(api, message, action, isAdmin) {
  if (!isAdmin) {
    sendMessageWarning(api, message, `Chỉ có admin mới được phép sử dụng lệnh ${action}!`, false);
    return false;
  }
  return true;
}

// Hàm xử lý media và chuyển đổi thành sticker
async function processMediaToSticker(api, message, mediaUrl, ext) {
  try {
    const tempPath = path.join(tempDir, `sticker_${randomIDTemp()}.${ext}`);
    try {
      await downloadFile(mediaUrl, tempPath);
      const stickerData = await getVideoMetadata(tempPath);
      await sendMessageComplete(api, message, `Xử lý chuyển đổi sticker hoàn tất!`, false);
      await api.sendCustomSticker(message, mediaUrl, mediaUrl, stickerData.width, stickerData.height);
    } catch (error) {
      await sendMessageWarning(api, message, "Đã xảy ra lỗi khi xử lý data: " + error.message, false);
    } finally {
      deleteFile(tempPath);
    }
  } catch (error) {
    await sendMessageWarning(api, message, "Đã xảy ra lỗi trong quá trình xử lý: " + error.message, false);
  }
}

async function scanSticker(api, message, cmdPrefix, numberScan, isAdminUser) {
  if (!checkAdminPermission(api, message, "scan", isAdminUser)) return;

  try {
    // Phân tích chuỗi đầu vào để lấy số bắt đầu và kết thúc
    let [startStr, endStr] = numberScan.split("-");
    let startNumber = parseInt(startStr);
    let endNumber = endStr ? parseInt(endStr) : startNumber;

    // Đảm bảo startNumber < endNumber
    if (endStr && startNumber > endNumber) {
      [startNumber, endNumber] = [endNumber, startNumber];
    }

    if (startNumber === endNumber) {
      startNumber = 1;
    }

    if (isNaN(startNumber) || startNumber <= 0 || (endStr && isNaN(endNumber))) {
      await sendMessageWarning(
        api,
        message,
        "Yêu cầu nhập số hợp lệ để tiến hành quét data sticker!" +
          `\nVí dụ:\n${cmdPrefix} scan|100 (quét từ 1 đến 100)` +
          `\n${cmdPrefix} scan|30-1000 (quét từ 30 đến 1000)`
      );
      return;
    }

    const stickerIDs = new Set(
      Object.values(dataSticker.data).flatMap((category) => category.stickers.map((sticker) => sticker.id))
    );

    // Tạo mảng từ startNumber đến endNumber
    const arrayGetSticker = Array.from({ length: endNumber - startNumber + 1 }, (_, i) => startNumber + i).filter(
      (id) => !stickerIDs.has(id)
    );

    if (arrayGetSticker.length === 0) {
      await sendMessageCompleteRequest(api, message, {
        caption: `Đã nạp hết sticker gốc từ ${startNumber} đến ${endNumber} của Zalo vào danh sách lưu trữ!`,
      });
      return;
    }

    // Chia thành các chunk nếu length > 1000
    const CHUNK_SIZE = 1000;
    const chunks = [];
    for (let i = 0; i < arrayGetSticker.length; i += CHUNK_SIZE) {
      chunks.push(arrayGetSticker.slice(i, i + CHUNK_SIZE));
    }

    let totalStickers = 0;

    // Xử lý từng chunk
    for (let i = 0; i < chunks.length; i++) {
      const chunk = chunks[i];
      const resultGetSticker = await api.getStickersDetail(chunk);
      let chunkCount = 0;

      for (const sticker of resultGetSticker) {
        try {
          if (!sticker) continue;

          if (!dataSticker.data[sticker.cateId]) {
            dataSticker.data[sticker.cateId] = {
              name: "Packed Sticker " + sticker.cateId,
              stickers: [],
            };
          }

          dataSticker.data[sticker.cateId].stickers.push({
            ...sticker,
          });

          chunkCount++;
          totalStickers++;
        } catch (error) {
          console.error(chalk.red("Lỗi khi quét sticker:", error));
          continue;
        }
      }

      if (chunks.length > 1 && chunkCount > 0) {
        await sendMessageCompleteRequest(
          api,
          message,
          {
            caption: `Chunk ${i + 1}/${chunks.length}: Đã nạp được ${chunkCount} sticker (${chunk[0]} -> ${
              chunk[chunk.length - 1]
            })`,
          },
          30000
        );
      }

      dataSticker.hasChanges = true;
    }

    await sendMessageCompleteRequest(api, message, {
      caption: `Hoàn tất quét! Đã nạp tổng cộng ${totalStickers} sticker gốc từ ${startNumber} đến ${endNumber} vào danh sách lưu trữ!`,
    });
  } catch (error) {
    console.error(chalk.red("Lỗi khi quét sticker:", error));
    await sendMessageWarning(api, message, "Lỗi khi quét sticker: " + error.message);
  }
}

async function drawStickerList(categoryId) {
  try {
    const category = dataSticker.data[categoryId];
    if (!category || !category.stickers || !category.stickers.length) return null;

    const STICKER_SIZE = 130; // Kích thước mỗi sticker
    const PADDING = 10; // Khoảng cách giữa các sticker
    const STICKERS_PER_ROW = 5; // Số sticker trên mỗi hàng
    const TEXT_HEIGHT = 20; // Chiều cao phần text hiển thị ID

    const rows = Math.ceil(category.stickers.length / STICKERS_PER_ROW);
    const canvasWidth = STICKERS_PER_ROW * (STICKER_SIZE + PADDING) + PADDING;
    const canvasHeight = rows * (STICKER_SIZE + TEXT_HEIGHT + PADDING) + PADDING;

    const canvas = createCanvas(canvasWidth, canvasHeight);
    const ctx = canvas.getContext("2d");

    // Vẽ nền trắng
    ctx.fillStyle = "white";
    ctx.fillRect(0, 0, canvasWidth, canvasHeight);
    let countCompleted = 0;

    // Sử dụng Promise.allSettled để xử lý tất cả các sticker đồng thời, kể cả khi có lỗi
    const drawPromises = category.stickers.map(async (sticker, i) => {
      const row = Math.floor(i / STICKERS_PER_ROW);
      const col = i % STICKERS_PER_ROW;

      const x = col * (STICKER_SIZE + PADDING) + PADDING;
      const y = row * (STICKER_SIZE + TEXT_HEIGHT + PADDING) + PADDING;

      try {
        // Thử tải từ stickerUrl trước
        try {
          const response = await axios.get(sticker.stickerUrl, {
            responseType: "arraybuffer",
            timeout: 5000, // Thêm timeout để tránh treo khi URL không phản hồi
          });
          const buffer = Buffer.from(response.data);
          const image = await loadImage(buffer);
          ctx.drawImage(image, x, y, STICKER_SIZE, STICKER_SIZE);
          return true; // Đánh dấu thành công
        } catch (error) {
          // Nếu thất bại, thử tải từ stickerSpriteUrl
          const response = await axios.get(sticker.stickerSpriteUrl, {
            responseType: "arraybuffer",
            timeout: 5000,
          });
          const buffer = Buffer.from(response.data);
          const image = await loadImage(buffer);

          // Tạo canvas mới để cắt đúng kích thước sticker
          const tempCanvas = createCanvas(130, 130);
          const tempCtx = tempCanvas.getContext("2d");
          tempCtx.drawImage(image, 0, 0, 130, 130);

          const croppedImage = await loadImage(tempCanvas.toBuffer());
          ctx.drawImage(croppedImage, x, y, STICKER_SIZE, STICKER_SIZE);
          return true; // Đánh dấu thành công
        }
      } catch (error) {
        console.error(`Không thể tải sticker ID ${sticker.id}:`, error.message);
        return false; // Đánh dấu thất bại
      } finally {
        // Vẽ ID sticker bất kể thành công hay thất bại
        ctx.fillStyle = "black";
        ctx.font = "14px Arial";
        ctx.textAlign = "center";
        ctx.fillText(`ID: ${sticker.id}`, x + STICKER_SIZE / 2, y + STICKER_SIZE + 15);
      }
    });

    // Đợi tất cả các sticker được xử lý
    const results = await Promise.allSettled(drawPromises);
    countCompleted = results.filter((r) => r.status === "fulfilled" && r.value).length;

    if (countCompleted === 0) {
      return null;
    }

    // Tạo file ảnh
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

function formatNumberRanges(numbers) {
  if (!numbers.length) return "";

  // Sắp xếp mảng số
  numbers.sort((a, b) => a - b);

  const ranges = [];
  let rangeStart = numbers[0];
  let prev = numbers[0];

  for (let i = 1; i <= numbers.length; i++) {
    const current = numbers[i];
    if (current !== prev + 1 || i === numbers.length) {
      if (rangeStart === prev) {
        ranges.push(rangeStart.toString());
      } else {
        ranges.push(`${rangeStart} -> ${prev}`);
      }
      rangeStart = current;
    }
    prev = current;
  }

  return ranges.join(", ");
}

function splitTextIntoChunks(text, maxLength = 1000) {
  const chunks = [];
  let currentChunk = "";
  const parts = text.split(", ");

  for (const part of parts) {
    if ((currentChunk + part + ", ").length <= maxLength) {
      currentChunk += (currentChunk ? ", " : "") + part;
    } else {
      chunks.push(currentChunk);
      currentChunk = part;
    }
  }

  if (currentChunk) {
    chunks.push(currentChunk);
  }

  return chunks;
}

async function handleQuoteSticker(api, message, quote, cmdPrefix) {
  const attach = quote?.attach;
  if (attach) {
    const attachData = JSON.parse(attach);
    const idSticker = attachData.id || null;
    const cateId = attachData.catId || null;
    const type = attachData.type || null;
    if (idSticker && cateId && type) {
      const stickerDetail = await api.getStickersDetail([idSticker]);
      if (stickerDetail && stickerDetail.length > 0) {
        await sendMessageComplete(
          api,
          message,
          `Thông Tin Của Sticker Đã Reply Trong Tin Nhắn:` +
            `\n- ID: ${idSticker}` +
            `\n- Cate ID: ${cateId}` +
            `\n- Type: ${type}` +
            (stickerDetail[0].stickerUrl ? `\n- Url Sticker: ${stickerDetail[0].stickerUrl}` : "") +
            (stickerDetail[0].stickerSpriteUrl ? `\n- Url Sticker Sprite: ${stickerDetail[0].stickerSpriteUrl}` : "") +
            (stickerDetail[0].stickerWebpUrl ? `\n- Url Sticker Webp: ${stickerDetail[0].stickerWebpUrl}` : ""),
          false
        );
      }
    } else {
      await sendMessageComplete(api, message, `Không tìm thấy thông tin sticker zalo trong tin nhắn reply`, false);
    }
    return true;
  }
  return false;
}

async function handleFindCommand(api, message, searchTerm, cmdPrefix) {
  if (!searchTerm) {
    await sendMessageWarning(api, message, `Vui lòng nhập từ khóa tìm kiếm!\nVí dụ: ${cmdPrefix} find|cute`, false);
    return;
  }

  const matchedCategories = Object.entries(dataSticker.data)
    .filter(([_, category]) => category.name.toLowerCase().includes(searchTerm.toLowerCase()))
    .map(([id, category]) => ({
      id: parseInt(id),
      name: category.name,
      stickerCount: category.stickers.length,
    }));

  if (matchedCategories.length === 0) {
    await sendMessageWarning(api, message, `Không tìm thấy category nào có tên chứa ${searchTerm}`, false);
    return;
  }

  const resultMessage = matchedCategories
    .map((cat) => `- ID: ${cat.id} | Tên: ${cat.name} | Số sticker: ${cat.stickerCount}`)
    .join("\n");

  await sendMessageComplete(
    api,
    message,
    `Tìm thấy ${matchedCategories.length} category khớp với từ khóa "${searchTerm}":\n\n${resultMessage}`,
    false
  );
}

export async function handleSearchCategoryCommand(api, message, searchTerm, cmdPrefix, notify = true) {
  if (!searchTerm) {
    await sendMessageWarning(
      api,
      message,
      "Vui lòng nhập id category để tìm kiếm và tải data sticker của category đó!" +
        `\nVí dụ: ${cmdPrefix} category|11906`,
      false
    );
    return;
  }

  const resultSearch = await api.getStickersCategory(searchTerm);
  if (!resultSearch || resultSearch.length === 0) {
    await sendMessageWarning(
      api,
      message,
      `Không tìm thấy category nào có id là ${searchTerm} trong pack sticker Zalo!`,
      false
    );
    return;
  }

  let newStickersCount = 0;

  for (const sticker of resultSearch) {
    if (!dataSticker.data[sticker.cateId]) {
      dataSticker.data[sticker.cateId] = {
        name: "Packed Sticker " + sticker.cateId,
        stickers: [],
      };
    }

    const existingSticker = dataSticker.data[sticker.cateId].stickers.find((s) => s.id === sticker.id);

    if (!existingSticker) {
      dataSticker.data[sticker.cateId].stickers.push({
        ...sticker,
      });
      newStickersCount++;
    }
  }

  if (newStickersCount > 0) {
    dataSticker.hasChanges = true;
  }

  if (notify) {
    if (newStickersCount > 0) {
      await sendMessageComplete(
        api,
        message,
        `Đã thêm ${newStickersCount} sticker mới từ category id ${searchTerm} vào dữ liệu của bot!`
      );
    } else {
      await sendMessageComplete(
        api,
        message,
        `Tất cả ${resultSearch.length} sticker từ category id ${searchTerm} đã có trong dữ liệu của bot!`
      );
    }
  }
}

async function handleSetNameCommand(api, message, categoryId, newName, cmdPrefix, isAdminUser) {
  if (!checkAdminPermission(api, message, "setname", isAdminUser)) return;

  if (!categoryId || !newName) {
    await sendMessageWarning(
      api,
      message,
      `Vui lòng nhập đủ ID category và tên mới!\nVí dụ: ${cmdPrefix} setname|11906|Cute Animals`,
      false
    );
    return;
  }

  if (!dataSticker.data[categoryId]) {
    await sendMessageWarning(api, message, `Không tìm thấy category có ID ${categoryId}!`, false);
    return;
  }

  const oldName = dataSticker.data[categoryId].name;
  dataSticker.data[categoryId].name = newName;
  dataSticker.hasChanges = true;

  await sendMessageComplete(
    api,
    message,
    `Đã đổi tên category ${categoryId} từ "${oldName}" thành "${newName}"`,
    false
  );
}

async function handleListCommand(api, message, categoryId, cmdPrefix, isAdmin) {
  try {
    if (!categoryId) {
      const categoryIds = Object.keys(dataSticker.data)
        .map(Number)
        .sort((a, b) => a - b);

      if (categoryIds.length === 0) {
        await sendMessageWarning(api, message, "Không có category nào trong cơ sở dữ liệu!", false);
        return;
      }

      const formattedCateIds = formatNumberRanges(categoryIds);
      const chunks = splitTextIntoChunks(formattedCateIds);

      await sendMessageQuery(api, message, `Vui lòng nhập ID category!\nVí dụ: ${cmdPrefix} list|0`);

      if (chunks.length > 0) {
        for (let i = 0; i < chunks.length; i++) {
          await sendMessageQuery(
            api,
            message,
            `Các id category hiện có ${chunks.length > 1 ? `(Phần ${i + 1}/${chunks.length})` : ""}:\n[${chunks[i]}]`,
            false
          );
        }
      }
      return;
    }

    let [startStr, endStr] = categoryId.split("-");
    let startNumber = parseInt(startStr);
    let endNumber = endStr ? parseInt(endStr) : startNumber;

    if (isNaN(startNumber) || (endStr && isNaN(endNumber))) {
      await sendMessageWarning(api, message, "ID category phải là số!", false);
      return;
    }

    if (endStr && startNumber > endNumber) {
      [startNumber, endNumber] = [endNumber, startNumber];
    }

    if (!isAdmin) {
      startNumber = endNumber;
    }

    let imagesDataDraw = [];
    let idInvalid = [];

    try {
      for (let i = startNumber; i <= endNumber; i++) {
        let imagePath;
        try {
          imagePath = await drawStickerList(i);
        } catch (error) {
          console.error(`Lỗi khi vẽ danh sách sticker cho category ${i}:`, error);
          imagePath = null;
        }

        if (imagePath) {
          const category = dataSticker.data[i];
          const caption = `${category.stickers.length} sticker trong gói category id "${i}"`;
          imagesDataDraw.push({
            imagePath,
            caption,
          });
        } else {
          idInvalid.push(i);
        }
      }

      if (startNumber === endNumber) {
        if (imagesDataDraw.length > 0) {
          await sendMessageCompleteRequest(api, message, imagesDataDraw[0], 600000);
        } else {
          await sendMessageWarning(
            api,
            message,
            `Không tìm thấy sticker nào trong category id "${categoryId}" hoặc category không tồn tại`
          );
        }
      } else {
        if (imagesDataDraw.length > 0) {
          let groupLayout = {
            groupLayoutId: Date.now(),
            totalItemInGroup: imagesDataDraw.length,
            isGroupLayout: imagesDataDraw.length > 2 ? 1 : 0,
          };

          for (let i = 0; i < imagesDataDraw.length; i++) {
            const imageData = imagesDataDraw[i];
            const uploadAttachments = await api.uploadAttachment([imageData.imagePath], message.threadId, message.type);

            if (uploadAttachments && uploadAttachments.length > 0) {
              let uploadItem = uploadAttachments[0];
              await api.sendImage(
                uploadItem.normalUrl,
                {
                  type: message.type,
                  threadId: message.threadId,
                },
                imageData.caption,
                600000,
                {
                  ...groupLayout,
                  idInGroup: i + 1,
                }
              );
            } else {
              console.error(`Không thể upload ảnh cho category`, imageData);
            }
          }
        } else {
          await sendMessageWarning(
            api,
            message,
            `Không tìm thấy sticker nào trong vùng id category "${categoryId}" hoặc các category không tồn tại`
          );
        }
      }
    } catch (error) {
      console.error(chalk.red("Lỗi khi tạo danh sách sticker:", error));
      await sendMessageWarning(api, message, "Đã xảy ra lỗi khi tạo danh sách sticker: " + error.message);
    } finally {
      for (const imageData of imagesDataDraw) {
        if (imageData.imagePath) {
          deleteFile(imageData.imagePath);
        }
      }
    }
  } catch (error) {
    console.error(chalk.red("Lỗi trong handleListCommand:", error));
    await sendMessageWarning(api, message, "Đã xảy ra lỗi khi xử lý lệnh list: " + error.message);
  }
}

async function handleSendSticker(api, message, stickerId, threadId) {
  try {
    const dataStickerStore = dataSticker.getById(stickerId);

    if (!dataStickerStore) {
      await sendMessageWarning(api, message, `Không tìm thấy sticker có id là ${stickerId}!`, false);
      return;
    }

    await api.sendSticker(
      {
        id: dataStickerStore.id,
        cateId: dataStickerStore.cateId,
        type: dataStickerStore.type,
      },
      threadId,
      message.type
    );
  } catch (error) {
    console.error(chalk.red("Lỗi khi gửi sticker:", error));
    await sendMessageWarning(api, message, "Đã xảy ra lỗi khi gửi sticker: " + error.message, false);
  }
}

async function handleFilterCommand(api, message, isAdminUser) {
  if (!checkAdminPermission(api, message, "filter", isAdminUser)) return;

  try {
    const invalidCategories = new Set();
    let totalStickersChecked = 0;
    let totalStickersRemoved = 0;
    let batchResults = [];
    const BATCH_SIZE = 10;
    const CONCURRENT_CHECKS = 5; // Số kiểm tra URL đồng thời

    const categories = Object.entries(dataSticker.data);
    await sendMessageQuery(api, message, `Bắt đầu quá trình kiểm tra ${categories.length} category...`);

    for (let i = 0; i < categories.length; i++) {
      const [cateId, category] = categories[i];
      let categoryInvalid = false;

      if (!category.stickers || !Array.isArray(category.stickers) || category.stickers.length === 0) {
        invalidCategories.add(cateId);
        continue;
      }

      const stickerBatches = [];
      for (let j = 0; j < category.stickers.length; j += CONCURRENT_CHECKS) {
        stickerBatches.push(category.stickers.slice(j, j + CONCURRENT_CHECKS));
      }

      for (const batch of stickerBatches) {
        if (categoryInvalid) break;

        const checkResults = await Promise.allSettled(
          batch.map(async (sticker) => {
            totalStickersChecked++;

            if (!sticker.stickerUrl && !sticker.stickerSpriteUrl) {
              return false;
            }

            const urlChecks = [];
            if (sticker.stickerUrl) {
              urlChecks.push(checkUrlStatus(sticker.stickerUrl));
            }
            if (sticker.stickerSpriteUrl) {
              urlChecks.push(checkUrlStatus(sticker.stickerSpriteUrl));
            }

            const results = await Promise.all(urlChecks);
            return results.some((result) => result === true);
          })
        );

        const allInvalid = checkResults.every((result) => result.status === "fulfilled" && result.value === false);

        if (allInvalid && checkResults.length > 0) {
          categoryInvalid = true;
          break;
        }
      }

      if (categoryInvalid) {
        invalidCategories.add(cateId);
        totalStickersRemoved += category.stickers.length;
        batchResults.push(`- Category ${cateId} (${category.name || "Không tên"})`);
      }

      if (batchResults.length >= BATCH_SIZE || i === categories.length - 1) {
        if (batchResults.length > 0) {
          const startIdx = Math.floor(i / BATCH_SIZE) * BATCH_SIZE;
          const endIdx = Math.min(startIdx + BATCH_SIZE, categories.length);
          await sendMessageComplete(
            api,
            message,
            `Đang kiểm tra các category từ ${startIdx + 1} đến ${endIdx}/${categories.length}\n` +
              `Các category không hợp lệ sẽ bị xóa:\n${batchResults.join("\n")}`
          );
          batchResults = [];
        }
      }
    }

    for (const cateId of invalidCategories) {
      delete dataSticker.data[cateId];
    }

    const remainingStickers = Object.values(dataSticker.data).reduce(
      (total, category) => total + (category.stickers?.length || 0),
      0
    );

    if (invalidCategories.size > 0) {
      dataSticker.hasChanges = true;
    }

    await sendMessageComplete(
      api,
      message,
      `Kết quả kiểm tra:\n` +
        `- Đã kiểm tra: ${totalStickersChecked} sticker\n` +
        `- Đã xóa: ${invalidCategories.size} category (${totalStickersRemoved} sticker)\n` +
        `- Còn lại: ${remainingStickers} sticker trong ${Object.keys(dataSticker.data).length} category`,
      false
    );
  } catch (error) {
    console.error(chalk.red("Lỗi khi lọc sticker:", error));
    await sendMessageWarning(api, message, "Đã xảy ra lỗi khi lọc sticker: " + error.message, false);
  }
}

async function handleInstallCommand(api, message, categoryId, cmdPrefix, isAdminUser) {
  if (!checkAdminPermission(api, message, "install", isAdminUser)) return;

  if (!categoryId) {
    await sendMessageWarning(api, message, "Vui lòng nhập id category để cài đặt sticker lên tài khoản bot!", false);
    return;
  }

  try {
    const dataStickerPersonal = await api.getStickersPersonal();
    const version = dataStickerPersonal.version;
    const stickerCates = dataStickerPersonal.sticker_cates;
    const parseCategoryId = parseInt(categoryId);
    if (stickerCates.includes(parseCategoryId)) {
      await sendMessageComplete(api, message, `Sticker id ${categoryId} đã có trong tài khoản này!`, false);
      return;
    } else {
      stickerCates.unshift(parseCategoryId);
      await api.getUpdateStickersPersonal(stickerCates, version);
      await sendMessageComplete(api, message, `Tải về thành công gói sticker id ${categoryId} lên tài khoản!`);
    }
  } catch (error) {
    console.error(chalk.red("Lỗi khi cài đặt sticker:", error));
    await sendMessageWarning(api, message, "Đã xảy ra lỗi khi cài đặt sticker: " + error.message, false);
  }
}

async function handleUninstallCommand(api, message, categoryId, cmdPrefix, isAdminUser) {
  if (!checkAdminPermission(api, message, "uninstall", isAdminUser)) return;

  if (!categoryId) {
    await sendMessageWarning(api, message, "Vui lòng nhập id category để gỡ bỏ sticker lên tài khoản!", false);
    return;
  }

  try {
    const dataStickerPersonal = await api.getStickersPersonal();
    const version = dataStickerPersonal.version;
    const stickerCates = dataStickerPersonal.sticker_cates;
    const stickerCatesIndex = stickerCates.indexOf(parseInt(categoryId));
    if (stickerCatesIndex !== -1) {
      stickerCates.splice(stickerCatesIndex, 1);
      await api.getUpdateStickersPersonal(stickerCates, version);
      await sendMessageComplete(api, message, `Đã gỡ bỏ gói sticker id ${categoryId} khỏi tài khoản!`);
    } else {
      await sendMessageWarning(api, message, `Gói sticker id ${categoryId} không có trong tài khoản này!`, false);
    }
  } catch (error) {
    console.error(chalk.red("Lỗi khi gỡ bỏ sticker:", error));
    await sendMessageWarning(api, message, "Đã xảy ra lỗi khi gỡ bỏ sticker: " + error.message, false);
  }
}

export async function handleStickerCommand(api, message, aliasCommand, groupSettings) {
  try {
    const quote = message.data.quote;
    const senderId = message.data.uidFrom;
    const threadId = message.threadId;
    const content = removeMention(message);
    const prefix = getGlobalPrefix(api.getBotId());
    const isAdminLevelHighest = isAdmin(api.getBotId(), senderId);
    const cmdPrefix = prefix + aliasCommand;
    const keyword = content.replace(cmdPrefix, "").trim();

    await dataSticker.init();

    if (quote && (await handleQuoteSticker(api, message, quote, cmdPrefix))) {
      return;
    }

    const stringHelp = (insertString = "") =>
      `${insertString}:` +
      `\n\n- ${cmdPrefix} (quote): hiển thị thông tin sticker của zalo được reply trong tin nhắn!` +
      `\n\n- ${cmdPrefix} [id sticker]: Gửi sticker theo id yêu cầu!` +
      `\n\n- ${cmdPrefix} list hoặc list|[id category]: Hiển thị tất cả sticker của id category từ danh sách lưu trữ!` +
      `\n\n- ${cmdPrefix} scan|[vùng id]: Quét load sticker gốc từ Zalo vào danh sách lưu trữ!` +
      `\n\n- ${cmdPrefix} find|[tên]: Tìm kiếm category trong local theo tên!` +
      `\n\n- ${cmdPrefix} category|[id category]: Tìm kiếm và tải về sticker của category id!` +
      `\n\n- ${cmdPrefix} setname|[id category]|[tên mới]: Đổi tên cho category!` +
      `\n\n- ${cmdPrefix} install|[id category]: Cài đặt sticker lên tài khoản!` +
      `\n\n- ${cmdPrefix} uninstall|[id category]: Gỡ bỏ sticker lên tài khoản!` +
      `\n\n- ${cmdPrefix} spam: Bắt đầu spam sticker` +
      `\n\n- ${cmdPrefix} stop: Dừng spam sticker` +
      `\n\n- ${cmdPrefix} setdelay|[thời gian]: Set delay cho spam (ví dụ: 1mls, 0.5s, 1s, 1p, 1h)`;

    if (!keyword) {
      await sendMessageComplete(api, message, stringHelp("Hướng Dẫn Sử Dụng Các Lệnh Sticker"), false);
      return;
    }

    const args = keyword.split("|");
    const command = args[0].toLowerCase();

    const commandHandlers = {
      scan: () => scanSticker(api, message, cmdPrefix, args[1], isAdminLevelHighest),
      find: () => handleFindCommand(api, message, args[1]?.trim(), cmdPrefix),
      category: () => handleSearchCategoryCommand(api, message, args[1]?.trim(), cmdPrefix),
      setname: () =>
        handleSetNameCommand(api, message, args[1]?.trim(), args[2]?.trim(), cmdPrefix, isAdminLevelHighest),
      list: () => handleListCommand(api, message, args[1]?.trim(), cmdPrefix, isAdminLevelHighest),
      filter: () => handleFilterCommand(api, message, isAdminLevelHighest),
      install: () => handleInstallCommand(api, message, args[1]?.trim(), cmdPrefix, isAdminLevelHighest),
      uninstall: () => handleUninstallCommand(api, message, args[1]?.trim(), cmdPrefix, isAdminLevelHighest),
      spam: () => handleSpamStickerCommand(api, message, cmdPrefix, isAdminLevelHighest),
      stop: () => handleStopSpamCommand(api, message, cmdPrefix),
      setdelay: () => handleSetDelayCommand(api, message, args[1]?.trim(), cmdPrefix, isAdminLevelHighest),
    };

    if (commandHandlers[command]) {
      await commandHandlers[command]();
    } else {
      const stickerId = parseInt(command);
      if (!isNaN(stickerId)) {
        if (!isAdminLevelHighest) {
          if (groupSettings && groupSettings[threadId] && groupSettings[threadId].antiStickerEffect) {
            const dataStickerStore = dataSticker.getById(stickerId);
            if (dataStickerStore.effectId !== 0) {
              await sendMessageWarning(
                api,
                message,
                "Chức năng chặn 'sticker hiệu ứng' đang bật, không thể gửi sticker này"
              );
              return;
            }
          }
        }
        await handleSendSticker(api, message, stickerId, threadId);
      } else {
        await sendMessageWarning(api, message, stringHelp("Lệnh không hợp lệ!\nHướng dẫn sử dụng lệnh sticker"));
      }
    }
  } catch (error) {
    console.error(chalk.red("Lỗi khi xử lý lệnh sticker:", error));
    await sendMessageWarning(api, message, "Đã xảy ra lỗi khi xử lý lệnh: " + error.message);
  }
}
