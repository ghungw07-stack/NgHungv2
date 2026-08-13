import fs from "fs";
import { promises as fsPromises } from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { sendMessageStateQuote } from "../../service-dqt/chat-zalo/chat-style/chat-style.js";
import { getGlobalPrefix } from "../../service-dqt/service.js";
import { getUserInfoData } from "../../service-dqt/info-service/user-info.js";
import { isAdmin } from "../../index.js";
import { createCanvas, loadImage } from "canvas";
import { removeMention } from "../../utils/format-util.js";

async function loadAvatar(avatarUrl) {
  try {
    if (!avatarUrl) throw new Error("No avatar URL provided");
    const avatar = await loadImage(avatarUrl);
    return avatar;
  } catch {
    const canvas = createCanvas(200, 200);
    const ctx = canvas.getContext("2d");
    const gradient = ctx.createLinearGradient(0, 0, 200, 200);
    gradient.addColorStop(0, "#667eea");
    gradient.addColorStop(1, "#764ba2");
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, 200, 200);
    ctx.fillStyle = "#ffffff";
    ctx.font = "bold 80px Arial";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("?", 100, 100);
    return canvas;
  }
}

export async function createLesCheckImage(name, percent, msgType = "gay", avatarUrl = null) {
  const width = 1060, height = 400;
  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext("2d");

  const bgPath = path.resolve("./assets/resources/images/Google.png");
  try {
    const bg = await loadImage(bgPath);
    ctx.drawImage(bg, 0, 0, width, height);
  } catch {
    ctx.fillStyle = "#111";
    ctx.fillRect(0, 0, width, height);
  }

  ctx.fillStyle = "rgba(0,0,0,0.45)";
  ctx.fillRect(0, 0, width, height);
  const avatarSize = 140, avatarX = 120, avatarY = height / 2 - avatarSize / 2;
  const avatar = await loadAvatar(avatarUrl);
  ctx.save();
  ctx.beginPath();
  ctx.arc(avatarX + avatarSize / 2, avatarY + avatarSize / 2, avatarSize / 2, 0, Math.PI * 2);
  ctx.clip();
  ctx.drawImage(avatar, avatarX, avatarY, avatarSize, avatarSize);
  ctx.restore();
  ctx.shadowColor = "rgba(255, 215, 0, 0.6)";
  ctx.shadowBlur = 15;
  ctx.lineWidth = 6;
  ctx.strokeStyle = "#FFD700";
  ctx.beginPath();
  ctx.arc(avatarX + avatarSize / 2, avatarY + avatarSize / 2, avatarSize / 2 + 3, 0, Math.PI * 2);
  ctx.stroke();
  ctx.shadowBlur = 0;
  ctx.font = "bold 50px Arial";
  const grad = ctx.createLinearGradient(width / 2 - 150, 0, width / 2 + 150, 0);
  grad.addColorStop(0, "#00FF9D");
  grad.addColorStop(1, "#FFCC00");
  ctx.fillStyle = grad;
  ctx.textAlign = "center";
  ctx.fillText(`Kết Quả Check ${msgType.toUpperCase()}`, width / 2, 90);
  const textX = avatarX + avatarSize + 60;
  const baseY = height / 2 - 35;
  const lineSpacing = 55;
  ctx.textAlign = "left";
  ctx.font = "bold 30px Arial";
  ctx.shadowColor = "rgba(0,0,0,0.4)";
  ctx.shadowBlur = 8;
  ctx.fillStyle = "#00e676";
  ctx.fillText("👤 Tên:", textX, baseY);
  ctx.fillStyle = "#ffffff";
  ctx.fillText(name, textX + 120, baseY);
  ctx.fillStyle = "#00e5ff";
  const levelText = `🚩 Mức độ ${msgType}:`;
  ctx.fillText(levelText, textX, baseY + lineSpacing);
  const levelTextWidth = ctx.measureText(levelText).width;
  ctx.fillStyle = percent >= 50 ? "#ffcc00" : "#ff8800";
  ctx.fillText(`${percent}%`, textX + levelTextWidth + 15, baseY + lineSpacing);

  const comments = {
    gay: ["Chuẩn gay luôn 😭", "Có hơi cong cong nha 😅", "Không sao, vẫn men! 😎"],
    less: ["Cũng hơi less đó 😆", "Less chính hiệu 😳", "Chuẩn nữ tính luôn 😍"],
    "đẹp trai": ["Đỉnh kout, gái mê luôn 😎", "Đẹp trai vừa vừa thôi chứ 😏", "Tạm ổn nha 😅"],
    cute: ["Dễ thương cực kỳ 😍", "Cưng xỉu luôn 🥺", "Cũng được á 😆"],
    dâm: ["Độ dâm cao ngất 😈", "Thôi xong, dân chơi thứ thiệt 😳", "Cũng hiền lắm mà 😇"],
    giàu: ["Giàu sang phú quý 😎", "Có tiềm năng phết 💰", "Chắc đang tiết kiệm 🤣"],
    ngáo: ["Ngáo cực mạnh 🤪", "Đỉnh cao của sự ngáo 😵", "Cũng bình thường 😏"],
    hiền: ["Hiền như cục đất 😇", "Cực kỳ ngoan hiền 🕊️", "Không đến nỗi tệ 😆"],
    bựa: ["Bựa khỏi bàn 🤣", "Đỉnh của bựa 😜", "Tạm ổn, chưa tới mức bựa 😏"],
    ngu: ["Ngu si đần độn 🤡", "Cũng hơi ngu ngu 😂", "Không đến nỗi ngu 😅"],
  };

  const cmtList = comments[msgType.toLowerCase()] || ["Ổn định, không sao 😎"];
  const comment = percent >= 90 ? cmtList[0] : percent >= 50 ? cmtList[1] : cmtList[2];

  ctx.fillStyle = "#00ff90";
  ctx.fillText("💬 Nhận xét:", textX, baseY + lineSpacing * 2);
  const textWidth = ctx.measureText("💬 Nhận xét:").width + 25;
  ctx.fillStyle = "#ffffff";
  ctx.fillText(comment, textX + textWidth, baseY + lineSpacing * 2);
  ctx.shadowBlur = 0;

  ctx.font = "italic 15px Arial";
  ctx.fillStyle = "rgba(255,255,255,0.5)";
  ctx.textAlign = "center";
  ctx.fillText("Bot 1.5.5 by Ha Huy Hoang", width / 2, height - 20);

  const outputDir = "./assets/temp";
  await fsPromises.mkdir(outputDir, { recursive: true });
  const filePath = path.resolve(`${outputDir}/lescheck_${Date.now()}.png`);
  await fsPromises.writeFile(filePath, canvas.toBuffer());
  return filePath;
}

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const TAGERLES_FILE_PATH = path.join(__dirname, "tagerles.json");
if (!fs.existsSync(TAGERLES_FILE_PATH)) fs.writeFileSync(TAGERLES_FILE_PATH, "[]");

const nolesgay = [];
function loadList(filePath) {
  try { return JSON.parse(fs.readFileSync(filePath, "utf8")); }
  catch { return []; }
}
function getRandomLesLevel() { return Math.floor(Math.random() * 101); }
function getRandomTagerLesLevel() { return Math.floor(Math.random() * (100 - 97 + 1)) + 97; }

export async function handleTrolGayLessCommand(api, message) {
  const prefix = getGlobalPrefix();
  const threadId = message.threadId;
  const content = message.data?.content || "";
  const mentions = message.data?.mentions || [];
  const tagerList = loadList(TAGERLES_FILE_PATH);
  const senderUid = message.data?.uidFrom || message.senderID || message.sender_id || message.senderId;

  let targetUid, targetName;
  if (mentions.length === 0) {
    targetUid = senderUid;
    const senderInfo = await getUserInfoData(api, targetUid);
    targetName = senderInfo?.displayName || senderInfo?.name || "Bạn";
  } else {
    const { uid, pos, len } = mentions[0];
    targetUid = uid;
    targetName = message.data.content.substring(pos, pos + len).replace("@", "");
  }

  const userInfo = await getUserInfoData(api, targetUid);
  const avatarUrl = userInfo?.avatar || userInfo?.avatarFull || null;
  const contentWithoutMention = removeMention(message) || content;
  const contentLower = contentWithoutMention.toLowerCase();
  const typeMap = {
    gay: "gay",
    less: "less",
    "đẹp trai": "đẹp trai",
    "dep trai": "đẹp trai",
    cute: "cute",
    dâm: "dâm",
    dam: "dâm",
    giàu: "giàu",
    giau: "giàu",
    ngáo: "ngáo",
    hientrai: "hiền",
    hien: "hiền",
    bựa: "bựa",
    bua: "bựa",
    ngu: "ngu",
  };
  const sortedKeys = Object.keys(typeMap).sort((a, b) => b.length - a.length);

  let msgType = "gay";
  for (const key of sortedKeys) {
    const escapedKey = key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const regex = new RegExp(`(^|[\\s\\W])${escapedKey}([\\s\\W]|$)`, 'i');
    if (regex.test(contentLower)) {
      msgType = typeMap[key];
      break;
    }
  }

  let percent = tagerList.includes(targetUid) ? getRandomTagerLesLevel() : getRandomLesLevel();
  if (await isAdmin(api.getBotId(), targetUid)) percent = 0;

  const caption = `Độ ${msgType} của ${targetName} là ${percent}%`;

  let imagePath = null;
  try {
    imagePath = await createLesCheckImage(targetName, percent, msgType, avatarUrl);
    await api.sendMessage({ msg: caption, ttl: 600000, attachments: [imagePath], isUseProphylactic: true }, threadId, message.type);
  } catch (err) {
    console.log("Lỗi khi gửi ảnh:", err.message);
  } finally {
    if (imagePath) {
      try { await fsPromises.unlink(imagePath); }
      catch { console.log("Không thể xóa ảnh:", err.message); }
    }
  }
}
