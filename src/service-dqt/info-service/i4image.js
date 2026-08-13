import { removeMention } from "../../utils/format-util.js";
import { getGlobalPrefix } from "../service.js";
import { getUserInfoData } from "./user-info.js";
import axios from "axios";
import sharp from "sharp";
import fs from "fs";
import path from "path";
import os from "os";
import { registerI4ImageTarget } from "../../commands/bot-manager/add-user-to-group.js";

/**
 * Lệnh i4image — gửi ảnh đại diện (avatar) và ảnh bìa (cover) của người dùng Zalo
 * kèm thông tin cơ bản dưới dạng caption text.
 * Cú pháp: {prefix}i4image || {prefix}i4image @tag || {prefix}i4image <uid>
 */
export async function handleI4ImageCommand(api, message, aliasCommand) {
  const threadId = message.threadId;
  const senderId = message.data.uidFrom;
  let content = removeMention(message);
  const prefix = getGlobalPrefix(api.getBotId());
  content = content.replace(`${prefix}${aliasCommand}`, "").trim();

  const tempPaths = [];

  try {
    // Xác định target user
    let targetUserId =
      message.data.mentions?.[0]?.uid ||
      (content === "-f"
        ? message.data?.idTo || threadId
        : content
        ? content
        : senderId);

    if (targetUserId === threadId && message.type === 1) {
      targetUserId = senderId;
    }

    // Lấy thông tin user
    const userInfo = await getUserInfoData(api, targetUserId);
    if (!userInfo) {
      await api.sendMessage(
        { msg: "❌ Không thể lấy thông tin người dùng này.", quote: message },
        threadId,
        message.type
      );
      return;
    }

    const avatarUrl = userInfo.avatar || userInfo.avatarFull || null;
    const coverUrl = userInfo.cover || null;

    if (!avatarUrl && !coverUrl) {
      await api.sendMessage(
        {
          msg: `❌ Người dùng ${userInfo.name} không có ảnh đại diện hoặc ảnh bìa nào.`,
          quote: message,
        },
        threadId,
        message.type
      );
      return;
    }

    // Tải và lưu ảnh tạm
    const tmpDir = path.join(os.tmpdir(), "i4image-bot");
    if (!fs.existsSync(tmpDir)) fs.mkdirSync(tmpDir, { recursive: true });

    const downloadImage = async (url, label) => {
      try {
        const res = await axios.get(url, {
          responseType: "arraybuffer",
          timeout: 15000,
        });
        const filePath = path.join(tmpDir, `${label}_${Date.now()}.jpg`);
        await sharp(Buffer.from(res.data)).jpeg({ quality: 95 }).toFile(filePath);
        tempPaths.push(filePath);
        return filePath;
      } catch {
        return null;
      }
    };

    const attachments = [];
    if (avatarUrl) {
      const p = await downloadImage(avatarUrl, "avt");
      if (p) attachments.push(p);
    }
    if (coverUrl) {
      const p = await downloadImage(coverUrl, "cover");
      if (p) attachments.push(p);
    }

    if (attachments.length === 0) {
      await api.sendMessage(
        { msg: "❌ Không tải được ảnh, vui lòng thử lại sau.", quote: message },
        threadId,
        message.type
      );
      return;
    }

    // Build mention object nếu có tag
    const mentionUid = message.data.mentions?.[0]?.uid;
    const mentionName = message.data.mentions?.[0]?.name || userInfo.name;

    // Format caption thông tin
    const caption =
      `🏷️ ${userInfo.name}\n` +
      `🎂 Ngày sinh: ${userInfo.birthday || "Ẩn"}\n` +
      `🧑‍🤝‍🧑 Giới tính: ${userInfo.gender}\n` +
      `📅 Ngày tạo: ${userInfo.createdDate}\n` +
      `🕰️ Hoạt động cuối: ${userInfo.lastActive}`;

    // Build mentions array nếu tag ai đó
    const mentions =
      mentionUid && mentionUid !== senderId
        ? [{ uid: mentionUid, pos: 0, len: mentionName.length }]
        : [];

    const msgPayload = {
      msg: mentionUid && mentionUid !== senderId
        ? `${mentionName}\n${caption}`
        : caption,
      attachments,
      ttl: 6000000,
      isUseProphylactic: true,
    };

    if (mentions.length > 0) {
      msgPayload.mentions = mentions;
    }

    const sentMessage = await api.sendMessage(msgPayload, threadId, message.type);
    registerI4ImageTarget(sentMessage, message, { id: targetUserId, name: userInfo.name });
  } catch (error) {
    console.error("[i4image] Lỗi:", error);
    await api.sendMessage(
      {
        msg: "❌ Đã xảy ra lỗi khi lấy ảnh. Vui lòng thử lại sau.",
        quote: message,
      },
      threadId,
      message.type
    );
  } finally {
    // Dọn file tạm
    for (const p of tempPaths) {
      try {
        if (fs.existsSync(p)) fs.unlinkSync(p);
      } catch {}
    }
  }
}
