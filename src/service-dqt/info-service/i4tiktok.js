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

  const tikTokUsername = keyword;
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

    const user = data.data.user;
    const stats = data.data.stats;
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

    const avatarPaths = await downloadImages([user.avatarLarger], tmpDir);
    const avatarPath = avatarPaths[0] || null;
    await sendMessageFromSQL(api, message, { success: true, message: `` }, false, 3600000);
    await api.sendMessage(
      {
        msg: msgText,
        attachments: avatarPath ? [avatarPath] : [],
        ttl: 3600000
      },
      threadId,
      isGroup ? 1 : 0
    );

    if (avatarPath) fs.unlinkSync(avatarPath);

  } catch (err) {
    console.error('❌ TikTok Error:', err);
    await sendMessageFromSQL(api, message, `❌ Lỗi: ${err.message}`, false, 60000, uidFrom);
  }
}
