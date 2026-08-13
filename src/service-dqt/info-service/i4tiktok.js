import { fileURLToPath } from 'url';
import fetch from 'node-fetch';
import { sendMessageFromSQL } from '../../service-dqt/chat-zalo/chat-style/chat-style.js';
import { getGlobalPrefix } from '../service.js';
import fs from "fs";
import path from "path";
import os from "os";
import axios from "axios";
import sharp from "sharp";
import { tempDir } from "../../utils/io-json.js";
import { randomIDTemp } from "../../utils/format-util.js";

if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir, { recursive: true });

async function downloadImages(imageLinks, dir = tempDir) {
  const downloadPromises = imageLinks.map(async (imageUrl, idx) => {
    try {
      const imagePath = path.join(dir, `image_${idx}_${randomIDTemp()}.jpg`);
      const imageResponse = await axios.get(imageUrl, {
        responseType: "arraybuffer",
      });
      const buffer = Buffer.from(imageResponse.data);
      await sharp(buffer).jpeg().toFile(imagePath);
      return imagePath;
    } catch (error) {
      console.error(`Lỗi khi tải link: ${imageUrl}`, error);
      return null;
    }
  });

  const paths = await Promise.all(downloadPromises);
  return paths.filter(p => p);
}

function escapeXml(value) {
  const text = value === undefined || value === null || String(value).toLowerCase() === "undefined" ? "N/A" : String(value);
  return text.replace(/[<>&'\"]/g, (char) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", "'": "&apos;", "\"": "&quot;" })[char]);
}

function safeValue(...values) {
  const value = values.find((item) => item !== undefined && item !== null && String(item).trim() && String(item).toLowerCase() !== "undefined");
  return value ?? "N/A";
}

async function createSimpleCard(user, stats, avatarPath) {
  const avatar = avatarPath ? fs.readFileSync(avatarPath).toString("base64") : "";
  const nickname = escapeXml(user.nickname || "N/A");
  const username = escapeXml(`@${user.uniqueId || "N/A"}`);
  const signature = escapeXml(user.signature || "Không có tiểu sử").slice(0, 90);
  const svg = `
  <svg width="1000" height="560" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#111827"/><stop offset="1" stop-color="#312e81"/></linearGradient>
      <clipPath id="avatar"><circle cx="130" cy="145" r="78"/></clipPath>
    </defs>
    <rect width="1000" height="560" rx="32" fill="url(#bg)"/>
    ${avatar ? `<image href="data:image/jpeg;base64,${avatar}" x="52" y="67" width="156" height="156" preserveAspectRatio="xMidYMid slice" clip-path="url(#avatar)"/>` : `<circle cx="130" cy="145" r="78" fill="#475569"/>`}
    <text x="250" y="105" fill="#67e8f9" font-size="28" font-family="Arial" font-weight="bold">TIKTOK PROFILE</text>
    <text x="250" y="155" fill="white" font-size="42" font-family="Arial" font-weight="bold">${nickname}</text>
    <text x="250" y="195" fill="#cbd5e1" font-size="26" font-family="Arial">${username}</text>
    <text x="55" y="285" fill="#e2e8f0" font-size="24" font-family="Arial">${signature}</text>
    <line x1="55" y1="325" x2="945" y2="325" stroke="#64748b" stroke-width="2"/>
    <text x="75" y="385" fill="#67e8f9" font-size="24" font-family="Arial">FOLLOWERS</text>
    <text x="75" y="430" fill="white" font-size="32" font-family="Arial" font-weight="bold">${stats.followerCount || 0}</text>
    <text x="300" y="385" fill="#67e8f9" font-size="24" font-family="Arial">FOLLOWING</text>
    <text x="300" y="430" fill="white" font-size="32" font-family="Arial" font-weight="bold">${stats.followingCount || 0}</text>
    <text x="525" y="385" fill="#67e8f9" font-size="24" font-family="Arial">LIKES</text>
    <text x="525" y="430" fill="white" font-size="32" font-family="Arial" font-weight="bold">${stats.heartCount || 0}</text>
    <text x="750" y="385" fill="#67e8f9" font-size="24" font-family="Arial">VIDEOS</text>
    <text x="750" y="430" fill="white" font-size="32" font-family="Arial" font-weight="bold">${stats.videoCount || 0}</text>
    <text x="55" y="510" fill="#94a3b8" font-size="20" font-family="Arial">${user.verified ? "✓ Verified" : "Public profile"}${user.privateAccount ? " • Private" : ""}</text>
  </svg>`;
  const cardPath = path.join(os.tmpdir(), `i4tiktok_${randomIDTemp()}.png`);
  await sharp(Buffer.from(svg)).png().toFile(cardPath);
  return cardPath;
}

export async function handleI4tiktokCommand(api, message, aliasCommand) {
  const threadId = message.threadId;
  const uidFrom = message?.data?.uidFrom || message?.senderId || threadId;
  const content = message.data?.content?.trim() || '';
  const prefix = getGlobalPrefix(api.getBotId());
  let isGroup = threadId !== uidFrom;
  if (typeof message.isGroup !== 'undefined') isGroup = message.isGroup;

  const keyword = content.replace(prefix + aliasCommand, "").trim();
  if (!keyword) {
    return sendMessageFromSQL(
        api,
        message,
        `❌ Thiếu username! Dùng: ${prefix + aliasCommand} <username>`,
        false,
        60000,
        uidFrom
    );
  }

  const tikTokUsername = keyword.replace(/^@+/, "");
  if (!/^[a-zA-Z0-9._]+$/.test(tikTokUsername)) {
    return sendMessageFromSQL(
        api,
        message,
        `❌ Username TikTok không hợp lệ!`,
        false,
        60000,
        uidFrom
    );
  }

  try {
    const apiUrl = `https://api.zeidteam.xyz/tiktok/user-info?username=${encodeURIComponent(tikTokUsername)}`;
    const response = await fetch(apiUrl);
    const data = await response.json();

    if (!response.ok || !data.status || !data.data?.user) {
      const errMsg = data?.msg || 'Không thể lấy dữ liệu từ API!';
      throw new Error(errMsg);
    }

    const rawUser = data.data.user || {};
    const rawStats = data.data.stats || {};
    const user = {
      ...rawUser,
      nickname: safeValue(rawUser.nickname, rawUser.nick_name, rawUser.display_name),
      uniqueId: safeValue(rawUser.uniqueId, rawUser.unique_id, rawUser.username, rawUser.handle),
      id: safeValue(rawUser.id, rawUser.uid),
      signature: safeValue(rawUser.signature, rawUser.bio, "Không có"),
      avatarLarger: safeValue(rawUser.avatarLarger, rawUser.avatar_larger, rawUser.avatar, ""),
      privateAccount: rawUser.privateAccount ?? rawUser.private_account,
      verified: rawUser.verified ?? rawUser.is_verified,
    };
    const stats = {
      followerCount: safeValue(rawStats.followerCount, rawStats.follower_count, 0),
      followingCount: safeValue(rawStats.followingCount, rawStats.following_count, 0),
      heartCount: safeValue(rawStats.heartCount, rawStats.heart_count, rawStats.likes, 0),
      videoCount: safeValue(rawStats.videoCount, rawStats.video_count, 0),
    };
    const msgText = 
`🎬 Thông tin TikTok 🎬

👤 Tên hiển thị: ${user.nickname || 'N/A'}
🆔 Username: @${user.uniqueId || 'N/A'}
🧩 Mã người dùng: ${user.id || 'N/A'}
📜 Tiểu sử: ${user.signature || 'Không có'}
📊 Số liệu thống kê:
• 👥 Người theo dõi: ${stats.followerCount || 0}
• 👤 Đang theo dõi: ${stats.followingCount || 0}
• ❤️ Lượt thích: ${stats.heartCount || 0}
• 🎞️ Video: ${stats.videoCount || 0}

🔒 Trạng thái: ${user.privateAccount ? 'Riêng tư 🔒' : 'Công khai 🌐'}
✔️ Xác minh: ${user.verified ? 'Đã xác minh ✅' : 'Chưa xác minh ❌'}

👤 Founder: Ha Huy Hoang`;

    const tmpDir = path.join(os.tmpdir(), 'tiktok-avatar');
    if (!fs.existsSync(tmpDir)) fs.mkdirSync(tmpDir, { recursive: true });

    const avatarPaths = user.avatarLarger ? await downloadImages([user.avatarLarger], tmpDir) : [];
    const avatarPath = avatarPaths[0] || null;
    const cardPath = await createSimpleCard(user, stats, avatarPath);
    await sendMessageFromSQL(api, message, { success: true, message: `` }, false, 3600000);
    await api.sendMessage(
      {
        msg: `🎬 Thông tin TikTok của ${user.nickname || user.uniqueId || "người dùng"}`,
        attachments: [cardPath],
        ttl: 3600000
      },
      threadId,
      isGroup ? 1 : 0
    );

    if (avatarPath) fs.unlinkSync(avatarPath);
    if (fs.existsSync(cardPath)) fs.unlinkSync(cardPath);

  } catch (err) {
    console.error('❌ TikTok Error:', err);
    await sendMessageFromSQL(api, message, `❌ Lỗi: ${err.message}`, false, 60000, uidFrom);
  }
}
