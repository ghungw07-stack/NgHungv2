import axios from "axios";
import * as cheerio from "cheerio";
import schedule from "node-schedule";
import path from "path";
import fs from "fs";
import { FONT_MAIN, removeMention } from "../../../utils/format-util.js";
import { getGlobalPrefix } from "../../service.js";
import {
  sendMessageComplete,
  sendMessageCompleteRequest,
  sendMessageFailed,
  sendMessageStateQuote,
} from "../../chat-zalo/chat-style/chat-style.js";
import { setSelectionsMapData } from "../index.js";
import { deleteFile, loadImageRetryMultiRequest } from "../../../utils/util.js";
import { createCanvas, loadImage } from "canvas";

import * as cv from "../../../utils/canvas/index.js";
import { hanldeNameUser } from "../../../utils/canvas/info.js";

export const PLATFORM_LMHT = "lienminhhuyenthoai";
const URL_LMHT = "https://www.leagueoflegends.com";
const TIME_24H = 86400000;

const CONFIG = {
  maxResults: 10,
  timeWaitSelection: 60000,
};

const listInfoTuongLienMinhHuyenThoai = new Map();

schedule.scheduleJob("*/5 * * * * *", () => {
  const currentTime = Date.now();
  for (const [msgId, data] of listInfoTuongLienMinhHuyenThoai.entries()) {
    if (currentTime - data.timestamp > CONFIG.timeWaitSelection) {
      listInfoTuongLienMinhHuyenThoai.delete(msgId);
    }
  }
});

// ===== Find Tuong Lien Minh Huyen Thoai =====
export async function handleFindTuongCommand() {
  try {
    const response = await getWithRetry(`${URL_LMHT}/vi-vn/champions/`);
    const $ = cheerio.load(response.data);
    const dataHero = [];

    $("a[role='button']").each((index, element) => {
      const link = $(element).attr("href");
      const icon = $(element).find("img").attr("src");
      const name = $(element).find("[data-testid='card-title']").text().trim();

      dataHero.push({ link, icon, name });
    });

    return dataHero;
  } catch (error) {
    console.error("Lỗi khi xử lý lệnh tìm tướng Liên Minh Huyền Thoại:", error.message);
  }
}

export async function handleCheckTuongLMHTCommand(api, message, aliasCommand) {
  const content = removeMention(message);
  const prefix = getGlobalPrefix(api.getBotId());
  const keyword = content.replace(`${prefix}${aliasCommand}`, "").trim();

  try {
    const dataHero = await handleFindTuongCommand();
    const filterFindHero = dataHero.filter((item) => item.name.toLowerCase().includes(keyword.toLowerCase()));
    if (filterFindHero.length > 0) {
      if (filterFindHero.length === 1) {
        const data = {
          userRequest: message.data.uidFrom,
          collection: filterFindHero,
          timestamp: Date.now(),
          stage: 1,
        };
        await processStageLienMinhHuyenThoaiReply(api, message, data, 0);
      } else {
        let responseText = `🔎 Kết quả tìm kiếm tướng Liên Minh Huyền Thoại cho từ khóa: ${keyword}\n`;
        filterFindHero.forEach((item, index) => {
          responseText += `${index + 1}. ${item.name}\n`;
        });
        responseText += `Hãy trả lời tin nhắn này với số thứ tự của tướng bạn muốn xem thông tin!`;

        const listMessage = await sendMessageComplete(api, message, responseText, false);
        const quotedMsgId = listMessage?.message?.msgId || listMessage?.attachment[0]?.msgId;

        listInfoTuongLienMinhHuyenThoai.set(quotedMsgId.toString(), {
          userRequest: message.data.uidFrom,
          collection: filterFindHero,
          timestamp: Date.now(),
          stage: 1,
        });
        setSelectionsMapData(message.data.uidFrom, {
          quotedMsgId: quotedMsgId.toString(),
          collection: filterFindHero,
          timestamp: Date.now(),
          platform: PLATFORM_LMHT,
          stage: 1,
        });
      }
    } else {
      await sendMessageFailed(api, message, "Không tìm thấy tướng nào cho từ khóa: " + keyword, false, 30000);
      return;
    }
  } catch (error) {
    console.error("Lỗi khi xử lý lệnh xem tướng Liên Minh Huyền Thoại:", error.message);
    await sendMessageFailed(
      api,
      message,
      "Lỗi khi xử lý lệnh xem tướng Liên Minh Huyền Thoại, vui lòng liên hệ Admin để kiểm tra lỗi",
      false,
      30000
    );
  }
}

export async function handleChooseTuongLMHTReply(api, message) {
  const senderId = message.data.uidFrom;
  const idBot = api.getBotId();

  try {
    if (!message.data.quote || !message.data.quote.globalMsgId) return false;

    const quotedMsgId = message.data.quote.globalMsgId.toString();

    if (!listInfoTuongLienMinhHuyenThoai.has(quotedMsgId)) return false;

    const dataInfoTuongLMHT = listInfoTuongLienMinhHuyenThoai.get(quotedMsgId);
    if (dataInfoTuongLMHT.userRequest !== senderId) return false;

    const content = removeMention(message);
    const [index] = content.split(" ");
    const selectedIndex = parseInt(index) - 1;
    if (dataInfoTuongLMHT.stage === 1) {
      if (isNaN(selectedIndex) || selectedIndex < 0 || selectedIndex >= dataInfoTuongLMHT.collection.length) {
        await sendMessageFailed(api, message, "Lựa chọn không hợp lệ. Vui lòng chọn lại.", false, 30000);
        return true;
      }
    }

    const msgDel = {
      type: message.type,
      threadId: message.threadId,
      data: {
        cliMsgId: message.data.quote.cliMsgId,
        msgId: message.data.quote.globalMsgId,
        uidFrom: idBot,
      },
    };
    await api.deleteMessage(msgDel, false);
    await api.addReaction("CLOCK", message);
    // await api.undoMessage(message);
    listInfoTuongLienMinhHuyenThoai.delete(quotedMsgId);

    await processStageLienMinhHuyenThoaiReply(api, message, dataInfoTuongLMHT, selectedIndex);
    return true;
  } catch (error) {
    console.error("Lỗi khi xử lý lệnh xem thông tin tướng Liên Minh Huyền Thoại:", error.message);
    await sendMessageFailed(
      api,
      message,
      "Lỗi khi xử lý lệnh xem tướng Liên Minh Huyền Thoại, vui lòng liên hệ Admin để kiểm tra lỗi",
      false,
      30000
    );
    return true;
  }
}

async function getWithRetry(url, retries = 3) {
  for (let attempt = 0; attempt < retries; attempt++) {
    try {
      const response = await axios.get(url);
      return response;
    } catch (error) {
      if (error.response && error.response.status === 403) {
        //   console.warn(`Lỗi 403 khi truy cập ${url}. Thử lại... (${attempt + 1}/${retries})`);
        await new Promise((resolve) => setTimeout(resolve, 1000));
      } else {
        console.error(`Lỗi khi truy cập ${url}:`, error.message);
        throw error;
      }
    }
  }
  throw new Error(`Không thể truy cập ${url} sau ${retries} lần thử.`);
}

export async function createHeroInfoCard(dataHero, selectedSkin) {
  const [nameLine1, nameLine2] = hanldeNameUser(selectedSkin.name, 22);
  const width = 1080;
  const lineHeight = 25;
  const padding = 20;
  const iconSize = 86;
  const baseHeight = 200;

  const tempCanvas = createCanvas(width, 1);
  const tempCtx = tempCanvas.getContext("2d");

  let totalHeight = baseHeight + padding;
  for (const skill of dataHero.skills) {
    totalHeight += 24;
    tempCtx.font = "20px " + FONT_MAIN;
    const linesCount = wrapText(skill.description, tempCtx, 0, 0, 560, lineHeight);
    totalHeight += linesCount * lineHeight + padding;
  }

  const canvas = createCanvas(width, totalHeight);
  const ctx = canvas.getContext("2d");

  if (selectedSkin.cover) {
    try {
      const cover = await loadImageRetryMultiRequest(selectedSkin.cover);
      ctx.drawImage(cover, 0, 0, width, totalHeight);

      ctx.fillStyle = "rgba(0, 0, 0, 0.5)";
      ctx.fillRect(0, 0, width, totalHeight);
    } catch (error) {
      console.error("Lỗi load cover:", error);
      const backgroundGradient = ctx.createLinearGradient(0, 0, 0, totalHeight);
      backgroundGradient.addColorStop(0, "#3B82F6");
      backgroundGradient.addColorStop(1, "#111827");
      ctx.fillStyle = backgroundGradient;
      ctx.fillRect(0, 0, width, totalHeight);
    }
  } else {
    const backgroundGradient = ctx.createLinearGradient(0, 0, 0, totalHeight);
    backgroundGradient.addColorStop(0, "#3B82F6");
    backgroundGradient.addColorStop(1, "#111827");
    ctx.fillStyle = backgroundGradient;
    ctx.fillRect(0, 0, width, totalHeight);
  }

  let xAvatar = 170;
  let widthAvatar = 180;
  let heightAvatar = 180;
  let yAvatar = 100;
  let yA1 = totalHeight / 2 - heightAvatar / 2 - yAvatar;

  if (selectedSkin) {
    try {
      const avatar = await loadImageRetryMultiRequest(selectedSkin.cover);

      const borderWidth = 10;
      const gradient = ctx.createLinearGradient(
        xAvatar - widthAvatar / 2 - borderWidth,
        yAvatar - borderWidth,
        xAvatar + widthAvatar / 2 + borderWidth,
        yAvatar + heightAvatar + borderWidth
      );

      gradient.addColorStop(0, "#FFD700");
      gradient.addColorStop(0.3, "#DAA520");
      gradient.addColorStop(0.5, "#FFF8DC");
      gradient.addColorStop(0.7, "#DAA520");
      gradient.addColorStop(1, "#FFD700");

      ctx.save();
      ctx.beginPath();
      ctx.arc(xAvatar, yAvatar + heightAvatar / 2, widthAvatar / 2 + borderWidth, 0, Math.PI * 2, true);
      ctx.fillStyle = gradient;
      ctx.fill();

      ctx.beginPath();
      ctx.arc(xAvatar, yAvatar + heightAvatar / 2, widthAvatar / 2, 0, Math.PI * 2, true);
      ctx.clip();
      ctx.drawImage(avatar, xAvatar - widthAvatar / 2, yAvatar, widthAvatar, heightAvatar);
      ctx.restore();

      ctx.font = "bold 32px Tahoma";
      ctx.fillStyle = "#FFFFFF";
      ctx.textAlign = "center";
      let nameY = yAvatar + heightAvatar + 54;
      if (nameLine2) {
        ctx.font = "bold 24px Tahoma";
        ctx.fillText(nameLine1, xAvatar, nameY);
        ctx.font = "bold 24px Tahoma";
        ctx.fillText(nameLine2, xAvatar, nameY + 28);
      } else {
        ctx.fillText(nameLine1, xAvatar, nameY);
      }

      const labelY = nameY + (nameLine2 ? 72 : 48);
      ctx.font = "20px " + FONT_MAIN;
      ctx.fillStyle = "#FFFFFF";
      ctx.fillText(dataHero.difficulty.label, xAvatar, labelY);
      ctx.fillText(dataHero.difficulty.name + ` (${dataHero.difficulty.value})`, xAvatar, labelY + 28);
    } catch (error) {
      console.error("Lỗi load avatar:", error);
    }
  }

  let y1 = 60;

  ctx.textAlign = "center";
  ctx.font = "bold 48px " + FONT_MAIN;
  ctx.fillStyle = cv.getRandomGradient(ctx, width);
  ctx.fillText("Liên Minh Huyền Thoại", width / 2, y1);

  const infoStartX = xAvatar + widthAvatar / 2 + 92;
  let y = y1;

  ctx.textAlign = "left";

  const skillStartY = y + 20;

  function wrapText(text, context, x, y, maxWidth, lineHeight) {
    const lines = text.split("\n");
    let totalLines = 0;

    for (const line of lines) {
      const words = line.split(" ");
      let currentLine = "";

      for (let n = 0; n < words.length; n++) {
        const testLine = currentLine.length > 0 ? currentLine + " " + words[n] : words[n];
        const metrics = context.measureText(testLine);
        const testWidth = metrics.width;

        if (testWidth > maxWidth && currentLine.length > 0) {
          context.fillText(currentLine, x, y);
          currentLine = words[n];
          y += lineHeight;
          totalLines++;
        } else {
          currentLine = testLine;
        }
      }
      context.fillText(currentLine, x, y);
      y += lineHeight;
      totalLines++;
    }
    return totalLines;
  }

  let currentY = skillStartY;

  for (let index = 0; index < dataHero.skills.length; index++) {
    const skill = dataHero.skills[index];
    const iconSize = 86;
    currentY += 10;
    const textX = infoStartX + iconSize + 10;

    if (skill.icon) {
      try {
        const icon = await loadImageRetryMultiRequest(skill.icon);
        const iconX = infoStartX;

        ctx.save();
        ctx.beginPath();
        ctx.arc(iconX + iconSize / 2, currentY + iconSize / 2, iconSize / 2, 0, Math.PI * 2, true);
        ctx.clip();
        ctx.drawImage(icon, iconX, currentY, iconSize, iconSize);
        ctx.restore();
      } catch (error) {
        console.error("Lỗi khi tải icon kỹ năng:", error.message);
      }
    }

    ctx.font = "bold 24px " + FONT_MAIN;
    ctx.fillStyle = cv.getRandomBrightColor(); // Sử dụng màu ngẫu nhiên cho tên kỹ năng
    ctx.fillText(`[${skill.type}] ${skill.name}`, textX, currentY + 24);

    ctx.fillStyle = "#FFFFFF";
    ctx.font = "20px " + FONT_MAIN;
    const linesCount = wrapText(skill.description, ctx, textX, currentY + iconSize / 2 + 15, 560, 25);

    currentY += 40 + linesCount * 25 + 24;

    ctx.fillStyle = "#FFFFFF";
    ctx.fillRect(infoStartX, currentY - 10, 650, 2);
  }

  const filePath = path.resolve(`./assets/temp/hero_info_${Date.now()}.png`);
  const out = fs.createWriteStream(filePath);
  const stream = canvas.createPNGStream();
  stream.pipe(out);
  return new Promise((resolve, reject) => {
    out.on("finish", () => resolve(filePath));
    out.on("error", reject);
  });
}

export async function processStageLienMinhHuyenThoaiReply(api, message, dataRequest, selectedIndex) {
  const senderId = message.data.uidFrom;
  const senderName = message.data.dName;

  if (dataRequest.stage === 1) {
    const selectedTuong = dataRequest.collection[selectedIndex];

    try {
      const response = await getWithRetry(`${URL_LMHT}${selectedTuong.link}`);
      const $ = cheerio.load(response.data);
      const dataTuong = {
        skins: [],
        skills: [],
        difficulty: {},
      };

      $("section[data-testid='landing-media-carousel'] .sc-127f821f-0").each((index, element) => {
        const skinName = $(element).find(".sc-48874027-1").text().trim();
        const skinCover = $(element).find("img[data-testid='mediaImage']").attr("src");

        dataTuong.skins.push({
          name: skinName,
          cover: skinCover,
        });
      });

      const nextDataScript = $("script#__NEXT_DATA__").html();
      const jsonData = JSON.parse(nextDataScript);

      const bladesHero = jsonData.props.pageProps.page.blades.filter((blade) => blade.type === "characterMasthead");

      dataTuong.difficulty = {
        label: bladesHero[0].difficulty.label,
        name: bladesHero[0].difficulty.name,
        value: `${bladesHero[0].difficulty.value}/${bladesHero[0].difficulty.maxValue}`,
      };

      jsonData.props.pageProps.page.blades
        .filter((blade) => blade.type === "iconTab")
        .forEach((blade) => {
          blade.groups.forEach((skill) => {
            dataTuong.skills.push({
              name: skill.content.title,
              type: skill.content.subtitle,
              icon: skill.thumbnail.url,
              description: skill.content.description.body,
            });
          });
        });

      if (dataTuong.skins.length === 1) {
        const data = {
          userRequest: message.data.uidFrom,
          dataHero: dataTuong,
          collection: dataTuong.skins,
          timestamp: Date.now(),
          stage: 2,
        };
        await processStageLienMinhHuyenThoaiReply(api, message, data, 0);
        return;
      }

      const responseText =
        `Chọn một trang phục cho tướng ${selectedTuong.name}:\n\n` +
        `**Trang phục:**\n` +
        dataTuong.skins.map((skin, index) => `  - ${index + 1}. ${skin.name}`).join("\n");

      const responseMessage = await sendMessageComplete(api, message, responseText, false);
      const quotedMsgId = responseMessage?.message?.msgId || responseMessage?.attachment[0]?.msgId;

      listInfoTuongLienMinhHuyenThoai.set(quotedMsgId.toString(), {
        userRequest: message.data.uidFrom,
        dataHero: dataTuong,
        collection: dataTuong.skins,
        timestamp: Date.now(),
        stage: 2,
      });
      setSelectionsMapData(message.data.uidFrom, {
        quotedMsgId: quotedMsgId.toString(),
        dataHero: dataTuong,
        collection: dataTuong.skins,
        timestamp: Date.now(),
        platform: PLATFORM_LMHT,
        stage: 2,
      });
      await api.addReaction("UNDO", message);
      await api.addReaction("LIKE", message);
    } catch (error) {
      console.error("Lỗi khi xử lý lệnh xem thông tin tướng Liên Minh Huyền Thoại:", error.message);
      await api.addReaction("UNDO", message);
      await api.addReaction("TIEUTAN", message);
    }
  } else if (dataRequest.stage === 2) {
    const selectedSkin = dataRequest.collection[selectedIndex];
    const dataHero = dataRequest.dataHero;
    let filePath = null;

    try {
      filePath = await createHeroInfoCard(dataHero, selectedSkin);
      await sendMessageStateQuote(
        api,
        message,
        `Đây là thông tin của tướng ${selectedSkin.name} mà bạn yêu cầu!`,
        true,
        TIME_24H
      );
      await api.sendMessage(
        {
          msg: ``,
          attachments: [filePath],
          ttl: TIME_24H,
        },
        message.threadId,
        message.type
      );
      await api.addReaction("UNDO", message);
      await api.addReaction("LIKE", message);
    } catch (error) {
      console.error("Lỗi khi tạo card thông tin tướng:", error.message);
      await api.addReaction("UNDO", message);
      await api.addReaction("TIEUTAN", message);
    } finally {
      await deleteFile(filePath);
    }
  }
  return true;
}
