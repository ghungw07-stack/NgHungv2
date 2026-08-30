import { MultiMsgStyle, MessageStyle } from "../../api-zalo/index.js";
import { getCommandConfig, getManagerCommandCustomConfig, isAdmin, reloadCommandConfig } from "../../index.js";
import * as cv from "../../utils/canvas/index.js";
import { checkBeforeJoinGame, checkPlayerBanned } from "../../service-ngh/game-service/index.js";
import { getGlobalPrefix } from "../../service-ngh/service.js";
import { COLOR_GREEN, SIZE_18, IS_BOLD, getTextStyle, getCommandMapColors, getNameServer, getServerStyle, sendMessageFromSQL } from "../../service-ngh/chat-zalo/chat-style/chat-style.js";
import { LRUCache } from "lru-cache";
import { removeMention } from "../../utils/format-util.js";
import { findRecentMessages } from "../bot-manager/recent-message.js";
import { parseMenuPage } from "../../utils/menu-page.js";
import crypto from "node:crypto";

const COMMANDS_PER_PAGE = 25;
const MENU_COMMANDS_PER_PAGE = 12;
const MENU_PAGE_TTL = 30000; // 30 giây không chuyển trang thì tự hết hạn
const COMMAND_PAGE_DELAY_MS = 1000;

// Lưu riêng theo bot + nhóm + người dùng để menu ở nơi khác không bắt nhầm tin nhắn.
const menuPageMap = new LRUCache({
  max: 500,
  ttl: MENU_PAGE_TTL,
});
const menuImageCache = new LRUCache({ max: 100, ttl: 10 * 60 * 1000 });
const menuRenderInFlight = new Map();

function getMenuImageKey(botName, pageCommands, page, totalPages, totalCommands) {
  return crypto
    .createHash("sha1")
    .update(JSON.stringify({ botName, pageCommands, page, totalPages, totalCommands }))
    .digest("hex");
}

async function getCachedMenuImage(options) {
  const pageCommands = options.commands;
  const key = getMenuImageKey(options.botName, pageCommands, options.page, options.totalPages, options.totalCommands);
  const cached = menuImageCache.get(key);
  if (cached) return cached;
  if (menuRenderInFlight.has(key)) return menuRenderInFlight.get(key);
  const rendering = cv.createMenuGridImage(options)
    .then((imagePath) => {
      menuImageCache.set(key, imagePath);
      return imagePath;
    })
    .finally(() => menuRenderInFlight.delete(key));
  menuRenderInFlight.set(key, rendering);
  return rendering;
}

const getMenuSessionKey = (api, message) =>
  `${api.getBotId()}:${message.threadId}:${message.data.uidFrom}`;

const COMPACT_HELP_FAMILIES = [
  { name: "media", options: "image|video|voice|gif|file", children: ["sendimage", "sendvideo", "sendvoice", "sendgif", "sendfile"], description: "Gửi ảnh, video, giọng nói, GIF hoặc tệp" },
  { name: "edit", options: "voice|video", children: ["editvoice", "editvideo"], description: "Cắt và chỉnh sửa voice hoặc video" },
  { name: "sticker", options: "create|zalo|tenor|local", children: ["sticker", "stickerzalo", "tenorsticker", "stickerlocal"], description: "Tạo, tìm và gửi sticker" },
  { name: "qr", options: "create|scan|bank", children: ["createqr", "qrcode", "scanqr", "scanqrcode", "qrbank"], description: "Tạo, quét QR hoặc tạo QR ngân hàng" },
  { name: "check", options: "virus|domain|ip|order", children: ["checkvirus", "checkdomain", "checkip", "checkorder"], description: "Kiểm tra tệp, tên miền, IP hoặc đơn hàng" },
  { name: "video", options: "boy|girl|anime|cosplay|sexy|vuto", children: ["vdboy", "vdgirl", "vdanime", "vdcos", "vdsexy", "vdvuto"], description: "Kho video giải trí theo chủ đề" },
  { name: "music", options: "soundcloud|mixcloud|zing|nct|spotify", children: ["soundcloud", "mixcloud", "zingmp3", "nhaccuatui", "spotify"], description: "Tìm nhạc trên nhiều nền tảng" },
  { name: "story", options: "text|comic|adult|funny", children: ["truyenchu", "truyentranh", "truyenhentai", "truyencuoi"], description: "Đọc truyện theo thể loại" },
  { name: "poll", options: "create|spam", children: ["createpoll", "spampoll"], description: "Tạo hoặc gửi nhiều bình chọn" },
  { name: "member", options: "kick|kickall|block|ban", children: ["kick", "kickall", "block", "ban"], description: "Quản lý thành viên nhóm" },
  { name: "group", options: "member|list|scan|create|disperse", children: ["datamembergroup", "listgroups", "scangroups", "creategroup", "dispersegroup"], description: "Thông tin và quản lý nhóm" },
  { name: "game", options: "reset-daily|reset-user", children: ["resetdaily", "resethu"], description: "Đặt lại dữ liệu game" },
];

function compactCommandsForHelp(commands, prefix) {
  const familyByChild = new Map();
  for (const family of COMPACT_HELP_FAMILIES) {
    for (const child of family.children) familyByChild.set(child, family);
  }
  const emitted = new Set();
  const result = [];
  for (const command of commands) {
    const family = familyByChild.get(command.canonicalName);
    if (!family) { result.push(command); continue; }
    if (emitted.has(family.name)) continue;
    emitted.add(family.name);
    const members = commands.filter((item) => family.children.includes(item.canonicalName));
    result.push({
      canonicalName: family.name,
      name: `${prefix}${family.name} <${family.options}>`,
      description: family.description,
      permission: members.some((item) => item.permission !== "all") ? "adminLevelHigh" : "all",
    });
  }
  return result;
}

export async function helpCommand(api, message, isAdminBox, requestedPage) {
  const senderId = message.data.uidFrom;
  const threadId = message.threadId;
  const senderName = message.data.dName;
  const botId = api.getBotId();
  const botName = getNameServer(api) || api.accountInfo?.name || "Bot";

  const commandConfig = getCommandConfig();
  const allCommands = (commandConfig.commands || []).filter((cmd) =>
    isAdminBox ? true : cmd.permission === "all"
  );

  const prefix = getGlobalPrefix(botId);
  const rawCommandsForMenu = allCommands.map((cmd) => {
    const customerCommand = getManagerCommandCustomConfig(botId, cmd.name) || {};
    const syntax = cmd.syntax ? cmd.syntax.replace("{p}", prefix) : `${prefix}${cmd.name}`;
    return {
      canonicalName: cmd.name,
      name: syntax,
      description: customerCommand.description || cmd.description || "",
      permission: customerCommand.permission || cmd.permission || "all",
    };
  });
  const commandsForMenu = compactCommandsForHelp(rawCommandsForMenu, prefix);

  const totalCommands = commandsForMenu.length;
  const totalPages = Math.max(1, Math.ceil(totalCommands / MENU_COMMANDS_PER_PAGE));
  const page = parseMenuPage(requestedPage, totalPages);

  try {
    const { imagePath, msgId } = await sendMenuPage(api, message, {
      botName,
      commandsForMenu,
      page,
      totalPages,
      totalCommands,
    });

    menuPageMap.set(getMenuSessionKey(api, message), {
      threadId,
      type: message.type,
      commandsForMenu,
      totalPages,
      totalCommands,
      botName,
      lastMsgId: msgId,
    });

    // Ảnh được cache theo nội dung để lần mở menu sau không render canvas lại.
  } catch (error) {
    console.error("Lỗi khi gửi tin nhắn trợ giúp:", error);
    const fallback = commandsForMenu
      .slice((page - 1) * MENU_COMMANDS_PER_PAGE, page * MENU_COMMANDS_PER_PAGE)
      .map((cmd, index) => `${index + 1}. ${cmd.name} — ${cmd.description}`)
      .join("\n");
    await api.sendMessage(
      {
        msg: `📚 ${botName} có ${totalCommands} lệnh.\n\n${fallback || "Chưa có lệnh khả dụng."}\n\nDùng ${prefix}command để xem và tìm lệnh.`,
        ttl: MENU_PAGE_TTL,
      },
      threadId,
      message.type
    ).catch((sendError) => console.error("Lỗi gửi menu dự phòng:", sendError));
  }
}

// Render + gửi 1 trang menu, trả về msgId để phục vụ thu hồi khi đổi trang
async function sendMenuPage(api, message, { botName, commandsForMenu, page, totalPages, totalCommands }) {
  const senderId = message.data.uidFrom;
  const senderName = message.data.dName;
  const threadId = message.threadId;

  const startIndex = (page - 1) * MENU_COMMANDS_PER_PAGE;
  const pageCommands = commandsForMenu.slice(startIndex, startIndex + MENU_COMMANDS_PER_PAGE);

  const imagePath = await getCachedMenuImage({
    botName,
    commands: pageCommands,
    page,
    totalPages,
    totalCommands,
  });

  const sentMessage = await api.sendMessage(
    {
      msg: `✨ ${senderName} - Danh sách lệnh của tôi ✨`,
      attachments: imagePath ? [imagePath] : [],
      mentions: [{ pos: 2, uid: senderId, len: senderName.length }],
      ttl: MENU_PAGE_TTL,
      isUseProphylactic: true,
    },
    threadId,
    message.type
  );

  const msgId = sentMessage?.message?.msgId || sentMessage?.attachment?.[0]?.msgId;
  return { imagePath, msgId };
}

// Nhận số trang trực tiếp sau khi mở menu; không cần reply vào ảnh.
export async function checkMenuPageReply(api, message) {
  const sessionKey = getMenuSessionKey(api, message);
  if (!menuPageMap.has(sessionKey)) return false;

  const data = menuPageMap.get(sessionKey);
  const content = removeMention(message).trim();
  if (!/^\d+$/.test(content)) return false;

  const pageRequested = parseInt(content, 10);
  if (pageRequested === 0) {
    menuPageMap.delete(sessionKey);
    const senderName = String(message.data?.dName || message.data?.uidFrom || "Bạn").replace(/^@+/u, "");
    const mentionName = `@${senderName}`;
    const nameServer = getNameServer(api) || "Bot";
    const cancelText = `${mentionName}\n${nameServer}\n✅ Đã huỷ menu.`;
    const textStyle = getTextStyle(api);
    const serverStyle = getServerStyle(api);
    const style = MultiMsgStyle([
      MessageStyle(0, mentionName.length, textStyle.color, textStyle.size, textStyle.bold, textStyle.italic, textStyle.underline, textStyle.strike),
      MessageStyle(mentionName.length + 1, nameServer.length, serverStyle.color, serverStyle.size, serverStyle.bold, serverStyle.italic, serverStyle.underline, serverStyle.strike),
      MessageStyle(mentionName.length + nameServer.length + 2, "✅ Đã huỷ menu.".length, textStyle.color, textStyle.size, textStyle.bold, textStyle.italic, textStyle.underline, textStyle.strike),
    ]);
    await api.sendMessage({
      msg: cancelText,
      style,
      mentions: [{ uid: String(message.data?.uidFrom), pos: 0, len: mentionName.length }],
      ttl: 30000,
    }, message.threadId, message.type);
    return true;
  }
  if (!data || pageRequested < 1 || pageRequested > data.totalPages) return false;

  try {
    if (data.lastMsgId) {
      try {
        const foundMsg = await findRecentMessages(api, message, data.lastMsgId);
        if (foundMsg) {
          const msgDel = {
            type: data.type,
            threadId: data.threadId,
            data: {
              cliMsgId: foundMsg.cliMsgId,
              msgId: data.lastMsgId,
              uidFrom: api.getBotId(),
            },
          };
          await api.deleteMessage(msgDel, false);
        }
      } catch (error) {
        // Bỏ qua lỗi thu hồi, vẫn tiếp tục gửi trang mới
      }
    }

    const { imagePath, msgId } = await sendMenuPage(api, message, {
      botName: data.botName,
      commandsForMenu: data.commandsForMenu,
      page: pageRequested,
      totalPages: data.totalPages,
      totalCommands: data.totalCommands,
    });

    menuPageMap.set(sessionKey, { ...data, lastMsgId: msgId });
    // Không xóa ảnh cache; runtime maintenance sẽ dọn file cũ theo TTL/tuổi.
  } catch (error) {
    console.error("Lỗi khi chuyển trang menu:", error);
  }

  return true;
}

export async function adminCommand(api, message) {
  const senderId = message.data.uidFrom;
  const threadId = message.threadId;
  const senderName = message.data.dName;
  const prefix = getGlobalPrefix(api.getBotId());

  let commandMessage = "👮 Danh sách lệnh Admin:\n";
  commandMessage += "╔���════════\n";
  commandMessage += `║ 🤖 ${prefix}bot on/off - Kích hoạt tương tác với bot\n`;
  commandMessage += `║ 📋 ${prefix}mute list - Xem danh sách mute\n`;
  commandMessage += `║ 🔖 ${prefix}adminbot add/remove/list - Quản lý admin bot nhóm\n`;
  commandMessage += `║ 🚫 ${prefix}anti [tính năng] on/off - Quản lý toàn bộ chống vi phạm\n`;
  commandMessage += `║ 👢 ${prefix}kick @mention - Kick thành viên\n`;
  commandMessage += `║ 🔇 ${prefix}mute @user 30m - Cấm chat có thời hạn\n`;
  commandMessage += `║ 🔊 ${prefix}unmute @user - Mở chat\n`;
  commandMessage += `║ 👋 ${prefix}welcome welcome/bye on/off - Quản lý lời chào\n`;
  commandMessage += `║ 📢 ${prefix}all [Cụm từ cần tag all] - Chat với tất cả thành viên\n`;
  commandMessage += "╚═════════\n";

  let commandAdmin = {
    title: "👮 DANH SÁCH LỆNH ADMIN 👮",
    allMembers: {
      bot: {
        command: `${prefix}bot on/off`,
        description: "Kích hoạt tương tác với bot",
        icon: "🤖",
      },
      adminbot: {
        command: `${prefix}adminbot <add|remove|list> [@người dùng]`,
        description: "Quản lý admin bot nhóm",
        icon: "🔖",
      },
      mute: {
        command: `${prefix}mute [add] <@người dùng|all> [thời gian]`,
        description: "Cấm chat theo s/m/h/d/w; bỏ thời gian để mute vĩnh viễn",
        icon: "🔇",
      },
      anti: {
        command: `${prefix}anti <tính năng> <on|off>`,
        description: "Quản lý toàn bộ chức năng chống vi phạm",
        icon: "⛔",
      },
      kick: {
        command: `${prefix}kick [@người dùng]`,
        description: "Kick thành viên",
        icon: "👢",
      },
      block: {
        command: `${prefix}block [@người dùng]`,
        description: "Chặn thành viên",
        icon: "👢",
      },
      welcome: {
        command: `${prefix}welcome <welcome|bye> <on|off>`,
        description: "Quản lý lời chào vào/rời nhóm",
        icon: "👋",
      },
      approve: {
        command: `${prefix}approve on/off`,
        description: "Tự động phê duyệt thành viên vào nhóm",
        icon: "🔖",
      },
      all: {
        command: `${prefix}all [Cụm từ cần tag all]`,
        description: "Chat với tất cả thành viên",
        icon: "📢",
      },
      settinggroup: {
        command: `${prefix}stg <keygold|keysilver|unkey|listkey|noactive> [trang|reset|@người dùng]`,
        description: "Cài đặt nhóm, quản lý key và lọc thành viên ít tương tác",
        icon: "🔖",
      },
    },
  };

  try {
    // await api.sendMessage({ msg: commandMessage, quote: message }, threadId, message.type);
    const imagePath = await cv.createInstructionsImage(commandAdmin, false, 960);
    await api.sendMessage(
      {
        msg: `🌟 ${senderName} - Danh sách lệnh quản trị 🌟`,
        attachments: imagePath ? [imagePath] : [],
        mentions: [{ pos: 3, uid: senderId, len: senderName.length }],
        ttl: 600000,
        isUseProphylactic: true,
      },
      threadId,
      message.type
    );
    await cv.clearImagePath(imagePath);
  } catch (error) {
    console.error("Lỗi khi gửi tin nhắn danh sách lệnh admin:", error);
  }
}

// Menu ngắn hiển thị khi gõ lệnh game trống (không kèm lệnh con), hướng dẫn dùng "!game help" để xem đầy đủ
export async function gameMenuCommand(api, message, groupSettings) {
  // Opening the menu must not create/resolve a game account. Account identity
  // resolution can replace uidFrom with a global player id, which is invalid
  // as a Zalo mention UID and causes sendMessage error 114.
  if (!(await checkBeforeJoinGame(api, message, groupSettings, false))) return;

  const prefix = getGlobalPrefix(api.getBotId());
  const senderId = String(message.data.gameUid || message.data.uidFrom);
  const senderName = String(message.data.dName || senderId).replace(/^@+/u, "");
  const mentionName = `@${senderName}`;
  const nameServer = getNameServer(api) || "Bot";

  const text =
    `${mentionName}\n` +
    `${nameServer}\n` +
    `《 🎮 MENU TRÒ CHƠI 🎮 》\n\n` +
    `➤ MiniGame:\n` +
    `『${prefix}game minigame』\n` +
    `• Minigame - không cần đăng nhập\n\n` +
    `➤ BigGame:\n` +
    `『${prefix}game biggame』\n` +
    `• Biggame - cần đăng nhập, sử dụng tiền ảo\n\n` +
    `➤ Hướng dẫn tài khoản:\n` +
    `『${prefix}game help』\n` +
    `• Hướng dẫn sử dụng tài khoản và ví ảo`;

  const textStyle = getTextStyle(api);
  const serverStyle = getServerStyle(api);
  const nameServerOffset = mentionName.length + 1;
  const style = MultiMsgStyle([
    MessageStyle(
      0,
      text.length,
      textStyle.color,
      textStyle.size,
      textStyle.bold,
      textStyle.italic,
      textStyle.underline,
      textStyle.strike,
      false
    ),
    MessageStyle(
      nameServerOffset,
      nameServer.length,
      serverStyle.color,
      serverStyle.size,
      serverStyle.bold,
      serverStyle.italic,
      serverStyle.underline,
      serverStyle.strike,
      false
    ),
  ]);

  await api.sendMessage(
    {
      msg: text,
      style,
      mentions: [{ pos: 0, uid: senderId, len: mentionName.length }],
      quote: message,
      ttl: 60000,
    },
    message.threadId,
    message.type
  );
}

export async function gameInfoCommand(api, message, groupSettings) {
  if (!(await checkBeforeJoinGame(api, message, groupSettings))) return;

  const senderId = message.data.uidFrom;
  const threadId = message.threadId;
  const senderName = message.data.dName;
  const isAdminBox = isAdmin(api.getBotId(), senderId, threadId);
  const prefix = getGlobalPrefix(api.getBotId());

  const gameCommand = {
    title: "📜 DANH SÁCH LỆNH TRÒ CHƠI 📜",
    allMembers: {
      daily: {
        command: `${prefix}game daily`,
        description: "Nhận phần thưởng hàng ngày",
        icon: "🔖",
      },
      giveaway: {
        command: `${prefix}game giveaway`,
        description: "Tham gia Giveaway đang mở trong nhóm",
        icon: "🎁",
      },
      mycard: {
        command: `${prefix}game mycard`,
        description: "Xem thông tin cá nhân",
        icon: "🔖",
      },
      rank: {
        command: `${prefix}game rank`,
        description: "Xem top người chơi game",
        icon: "🏆",
      },
      tier: {
        command: `${prefix}game tier [@tag]`,
        description: "Xem hạng và tổng tiền đã nạp",
        icon: "🛡️",
      },
      donate: {
        command: `${prefix}game donate`,
        description: "Lấy mã QR donate và tự động nhận hạng thành viên VIP trong 30 ngày",
        icon: "🎖️",
      },
      nongtrai: {
        command: `${prefix}game nongtrai`,
        description: "Chơi trò chơi Nông Trại",
        icon: "🎲",
      },
      taixiu: {
        command: `${prefix}game taixiu`,
        description: "Chơi trò chơi Tài Xỉu",
        icon: "🎲",
      },
      xidach: {
        command: `${prefix}game xidach`,
        description: "Chơi bài Xì Dách nhiều người (gõ để xem hướng dẫn)",
        icon: "🎴",
      },
      baicao: {
        command: `${prefix}game baicao`,
        description: "Chơi Bài Cào 3 lá, nhà cái so bài từng người",
        icon: "🎴",
      },
      tienlen: {
        command: `${prefix}game tienlen`,
        description: "Chơi Tiến Lên Miền Nam nhiều người",
        icon: "🎴",
      },
      chanle: {
        command: `${prefix}game chanle`,
        description: "Chơi trò chơi Chẵn Lẻ",
        icon: "🎲",
      },
      baucua: {
        command: `${prefix}game baucua`,
        description: "Chơi trò chơi Bầu Cua",
        icon: "🎲",
      },
      keobuabao: {
        command: `${prefix}game keobuabao`,
        description: "Chơi trò chơi Kéo Búa Bao",
        icon: "🎲",
      },
      doanso: { command: `${prefix}game doanso`, description: "Trò chơi đoán số", icon: "🔢" },
      noitu: { command: `${prefix}game noitu`, description: "Trò chơi nối từ", icon: "🔤" },
      doantu: { command: `${prefix}game doantu`, description: "Trò chơi đoán từ", icon: "🧩" },
      vuatiengviet: { command: `${prefix}game vuatiengviet`, description: "Đố vui Vua Tiếng Việt", icon: "📚" },
      duoihinhbatchu: { command: `${prefix}game duoihinhbatchu`, description: "Đuổi hình bắt chữ", icon: "🖼️" },
      ailatrieuphu: { command: `${prefix}game ailatrieuphu`, description: "Ai là triệu phú", icon: "💡" },
      cauca: { command: `${prefix}game cauca`, description: "Câu cá và nâng cấp cần câu", icon: "🎣" },
      caro: { command: `${prefix}game caro`, description: "Chơi cờ Caro", icon: "⭕" },
      covua: { command: `${prefix}game covua`, description: "Chơi cờ vua", icon: "♟️" },
      cotuong: { command: `${prefix}game cotuong`, description: "Chơi cờ tướng", icon: "♜" },
      nuoithu: { command: `${prefix}game nuoithu`, description: "Nuôi thú ảo", icon: "🐾" },
      tutien: { command: `${prefix}tutien`, description: "Tu tiên nhập vai & môn phái", icon: "☯️" },
      zaclwarrior: { command: `${prefix}game zaclwarrior`, description: "ZACL Warrior nhập vai", icon: "⚔️" },
      masoi: { command: `${prefix}game masoi`, description: "Ma Sói nhiều người", icon: "🐺" },
      duangua: { command: `${prefix}duangua`, description: "Đua ngựa nhiều người", icon: "🏇" },
      vietlott655: { command: `${prefix}game vietlott655`, description: "Dự đoán Vietlott 6/55", icon: "🎟️" },
      bank: {
        command: `${prefix}game bank [số tiền] [@người nhận]`,
        description: "Chuyển tiền cho người khác",
        icon: "💰",
      },
      saoke: {
        command: `${prefix}game saoke`,
        description: "Xem lịch sử chuyển và nhận tiền",
        icon: "🧾",
      },
    },
    titleAdmin: "👑 Lệnh dành cho Admin 👑",
    admin: {
      buff: {
        command: `${prefix}buff [số tiền] [@người nhận]`,
        description: "Tặng tiền cho người chơi",
        icon: "💰",
      },
      ban: {
        command: `${prefix}ban <add|remove> [@người chơi]`,
        description: "Khóa hoặc mở khóa người chơi",
        icon: "🔒",
      },
    },
  };

  try {
    // await api.sendMessage({ msg: helpMessage, quote: message }, threadId, message.type);
    const imagePath = await cv.createGameHelpImage(gameCommand, isAdminBox);
    await api.sendMessage(
      {
        msg: `🌟 ${senderName} - Danh sách lệnh trò chơi 🌟`,
        attachments: imagePath ? [imagePath] : [],
        mentions: [{ pos: 3, uid: senderId, len: senderName.length }],
        ttl: 600000,
        isUseProphylactic: true,
      },
      threadId,
      message.type
    );
    await cv.clearImagePath(imagePath);
  } catch (error) {
    console.error("Lỗi khi gửi tin nhắn danh sách lệnh trò chơi:", error);
  }
}

// Thêm hàm helper để chia nhỏ tin nhắn
function splitMessage(message, maxLength = 2000) {
  if (message.length <= maxLength) {
    return [message];
  }

  const parts = [];
  let currentPart = "";
  const lines = message.split("\n");

  for (const line of lines) {
    if ((currentPart + line + "\n").length > maxLength) {
      if (currentPart) {
        parts.push(currentPart.trim());
        currentPart = "";
      }
      // Nếu một dòng quá dài, chia nhỏ nó
      if (line.length > maxLength) {
        const chunks = line.match(new RegExp(`.{1,${maxLength}}`, "g")) || [];
        parts.push(...chunks);
        continue;
      }
    }
    currentPart += line + "\n";
  }

  if (currentPart) {
    parts.push(currentPart.trim());
  }

  return parts;
}

export async function listCommands(api, message, args) {
  const botId = api.getBotId();
  const senderId = message.data.uidFrom;
  const threadId = message.threadId;
  const prefix = getGlobalPrefix(api.getBotId());
  const commandConfig = getCommandConfig();

  const command = args[0]?.toLowerCase();
  const subCommand = args[1]?.toLowerCase();

  const createMapLikeStyle = (text, positions) => {
    const textStyle = getTextStyle(api);
    const mapColors = getCommandMapColors(api);
    const styles = [
      MessageStyle(
        0,
        text.length,
        textStyle.color,
        textStyle.size,
        textStyle.bold,
        textStyle.italic,
        textStyle.underline,
        textStyle.strike
      ),
      ...positions
        .filter(({ kind = "command" }) => kind === "command" || mapColors.hasCustomDescription)
        .map(({ pos, len, kind = "command" }) => {
          const isCommandName = kind === "command";
          const color = isCommandName ? mapColors.command : mapColors.description;
          return MessageStyle(
            pos,
            len,
            color,
            textStyle.size,
            isCommandName ? true : textStyle.bold,
            textStyle.italic,
            textStyle.underline,
            textStyle.strike
          );
        }),
    ];
    return MultiMsgStyle(styles);
  };

  const commandHandlers = {
    async find() {
      const searchTerm = args.slice(1).join(" ").toLowerCase();
      if (!searchTerm) {
        return {
          msg: "⚠️ Vui lòng nhập từ khóa để tìm kiếm!\nVí dụ: !cmd find thời tiết",
          ttl: 30000,
        };
      }

      const searchResults = commandConfig.commands.filter(
        (cmd) =>
          cmd.name.toLowerCase().includes(searchTerm) ||
          cmd.description.toLowerCase().includes(searchTerm) ||
          (cmd.alias && cmd.alias.some((alias) => alias.toLowerCase().includes(searchTerm)))
      );

      if (searchResults.length === 0) {
        return {
          msg: `❌ Không tìm thấy lệnh nào liên quan đến từ khóa "${searchTerm}"`,
          ttl: 30000,
        };
      }

      let responseMsg = `🔍 Kết quả tìm kiếm cho "${searchTerm}":\n\n`;
      let positions = [];

      searchResults.forEach((cmd, index) => {
        const customerCommand = getManagerCommandCustomConfig(botId, cmd.name);
        const linePrefix = `${index + 1}. ⭐ Lệnh: `;
        const startPos = responseMsg.length + linePrefix.length;
        responseMsg += `${linePrefix}${cmd.name}\n`;
        positions.push({ pos: startPos, len: cmd.name.length });

        responseMsg += `   📝 Mô tả: ${cmd.description}\n`;
        responseMsg += `   💡 Cú pháp: ${cmd.syntax.replace("{p}", prefix)}\n`;
        if (cmd.alias?.length) {
          responseMsg += `   🔖 Tên gọi khác: ${cmd.alias.join(", ")}\n`;
        }
        responseMsg += `   🔒 Quyền hạn: ${getPermissionName(customerCommand.permission || cmd.permission)}\n`;
        responseMsg += `   ⏱️ Countdown: ${customerCommand.countdown || cmd.countdown} giây\n\n`;
      });

      let style = null;
      if (searchResults.length < 5) {
        style = MultiMsgStyle(positions.map(({ pos, len }) => MessageStyle(pos, len, COLOR_GREEN, SIZE_18, IS_BOLD)));
      }
      const parts = splitMessage(responseMsg).map((msg, index) => ({
        msg,
        style: index === 0 ? style : null,
      }));

      return {
        parts,
        ttl: 60000,
        pageDelayMs: COMMAND_PAGE_DELAY_MS,
      };
    },

    // Tải lại cấu hình lệnh
    async load() {
      const commandConfigNew = reloadCommandConfig();
      const allCommands = commandConfigNew.commands.filter((cmd) => cmd.permission === "all");
      const adminCommands = commandConfigNew.commands.filter((cmd) =>
        ["adminBox", "adminBot", "adminLevelHigh"].includes(cmd.permission)
      );

      const statsMessage = [
        "📊 Reload Thành Công Lệnh Bot:\n",
        `👥 Lệnh cho thành viên: ${allCommands.length} lệnh`,
        `👑 Lệnh cho admin: ${adminCommands.length} lệnh`,
        `📝 Tổng số lệnh: ${commandConfigNew.commands.length} lệnh`,
      ].join("\n");

      return { msg: statsMessage, ttl: 300000 };
    },

    async map() {
      const isNoactiveMap = subCommand === "noactive";
      const isAdminMap = subCommand === "admin";
      if (isNoactiveMap) return commandHandlers.noactive();

      const filteredCommands = commandConfig.commands.filter((cmd) =>
        isAdminMap ? ["adminBox", "adminBot", "adminLevelHigh"].includes(cmd.permission) : cmd.permission === "all"
      );
      const totalPages = Math.max(1, Math.ceil(filteredCommands.length / COMMANDS_PER_PAGE));
      const title = isAdminMap ? "Danh sách lệnh Admin" : "Danh sách lệnh Thành Viên";
      const parts = [];

      for (let pageNumber = 1; pageNumber <= totalPages; pageNumber++) {
        const startIndex = (pageNumber - 1) * COMMANDS_PER_PAGE;
        const commandsToShow = filteredCommands.slice(startIndex, startIndex + COMMANDS_PER_PAGE);
        let responseMsg = `${title} | Trang ${pageNumber}/${totalPages}\n\n`;
        const positions = [];

        commandsToShow.forEach((cmd, index) => {
          const linePrefix = `${index + 1 + startIndex}. `;
          const startPos = responseMsg.length + linePrefix.length;
          responseMsg += `${linePrefix}${cmd.name}: ${cmd.description}\n`;
          positions.push({ pos: startPos, len: cmd.name.length });
        });

        const msg = responseMsg.trim();
        parts.push({ msg, style: createMapLikeStyle(msg, positions) });
      }

      return {
        parts,
        ttl: 300000,
        pageDelayMs: COMMAND_PAGE_DELAY_MS,
      };
    },

    async noactive() {
      const disabledCommands = commandConfig.commands.filter((cmd) => cmd.active === false);

      if (disabledCommands.length === 0) {
        return {
          msg: "✅ Hiện không có lệnh nào đang tắt.",
          ttl: 180000,
        };
      }

      const requestedPage = Number.parseInt(args[1], 10);
      const pageNumber = Number.isInteger(requestedPage) && requestedPage > 0 ? requestedPage : 1;
      const totalPages = Math.ceil(disabledCommands.length / COMMANDS_PER_PAGE);

      if (pageNumber > totalPages) {
        return {
          msg: `⚠️ Trang không hợp lệ. Danh sách lệnh đang tắt chỉ có ${totalPages} trang.`,
          ttl: 60000,
        };
      }

      const startIndex = (pageNumber - 1) * COMMANDS_PER_PAGE;
      const commandsToShow = disabledCommands.slice(startIndex, startIndex + COMMANDS_PER_PAGE);
      let responseMsg = "Danh sách lệnh đang tắt:\n\n";
      const positions = [];

      commandsToShow.forEach((cmd, index) => {
        const customerCommand = getManagerCommandCustomConfig(botId, cmd.name);
        const linePrefix = `${index + 1 + startIndex}. Lệnh: `;
        const startPos = responseMsg.length + linePrefix.length;
        responseMsg += `${linePrefix}${cmd.name}\n`;
        positions.push({ pos: startPos, len: cmd.name.length });
        responseMsg += `   📝 Mô Tả: ${customerCommand.description || cmd.description}\n`;
        responseMsg += `   ⏱️ Countdown: ${customerCommand.countdown ?? cmd.countdown} giây\n\n`;
      });

      responseMsg += [
        `Trang ${pageNumber}/${totalPages}`,
        `💡 Dùng ${prefix}cmd noactive [số trang] để xem các trang khác.`,
        `ℹ️ Dùng ${prefix}cmd map noactive để xem toàn bộ lệnh đang tắt.`,
      ].join("\n");

      return {
        parts: [{ msg: responseMsg, style: createMapLikeStyle(responseMsg, positions) }],
        ttl: 180000,
      };
    },

    async default() {
      const isAdminRequest = command === "admin";
      const pageNumber = parseInt(args[isAdminRequest ? 1 : 0]) || 1;

      const filteredCommands = commandConfig.commands.filter((cmd) =>
        isAdminRequest ? ["adminBox", "adminBot", "adminLevelHigh"].includes(cmd.permission) : cmd.permission === "all"
      );

      const totalPages = Math.ceil(filteredCommands.length / COMMANDS_PER_PAGE);
      const startIndex = (pageNumber - 1) * COMMANDS_PER_PAGE;
      const endIndex = startIndex + COMMANDS_PER_PAGE;
      const commandsToShow = filteredCommands.slice(startIndex, endIndex);

      const title = isAdminRequest ? "Danh sách lệnh Admin" : "Danh sách lệnh Thành Viên";
      let responseMsg = `${title} | Trang ${pageNumber}/${totalPages}\n\n`;
      let positions = [];

      commandsToShow.forEach((cmd, index) => {
        const linePrefix = `${index + 1 + startIndex}. `;
        const startPos = responseMsg.length + linePrefix.length;
        responseMsg += `${linePrefix}${cmd.name}: ${cmd.description}\n`;
        positions.push({ pos: startPos, len: cmd.name.length });
      });

      const style = createMapLikeStyle(responseMsg, positions);

      return {
        parts: [{ msg: responseMsg, style: style }],
        ttl: 180000,
      };
    },
  };

  try {
    const handler = commandHandlers[command] || commandHandlers.default;
    const response = await handler();

    if (Array.isArray(response.parts)) {
      // Trường hợp handler tự chia nhỏ và tính style riêng cho từng phần (vd: map())
      for (let i = 0; i < response.parts.length; i++) {
        const { msg, style } = response.parts[i];
        try {
          await api.sendMessage(
            {
              msg,
              style: style || null,
              quote: i === 0 ? message : null,
              ttl: response.ttl,
            },
            threadId,
            message.type
          );
        } catch (sendError) {
          const styleCount = style ? (JSON.parse(style).styles || []).length : 0;
          console.error(
            `Lỗi khi gửi phần ${i + 1}/${response.parts.length} kèm style ` +
              `(msg.length=${msg.length}, styleCount=${styleCount}):`,
            sendError
          );
          // Gửi lại không kèm style để người dùng vẫn nhận được nội dung
          await api.sendMessage(
            {
              msg,
              quote: i === 0 ? message : null,
              ttl: response.ttl,
            },
            threadId,
            message.type
          );
        }

        if (response.pageDelayMs && i < response.parts.length - 1) {
          await new Promise((resolve) => setTimeout(resolve, response.pageDelayMs));
        }
      }
    } else {
      // Chia nhỏ tin nhắn nếu cần
      const messageParts = splitMessage(response.msg);

      for (let i = 0; i < messageParts.length; i++) {
        const part = messageParts[i];
        // Chỉ áp dụng style cho phần đầu tiên
        const messageStyle = i === 0 ? response.style : null;

        await api.sendMessage(
          {
            msg: part,
            style: messageStyle,
            quote: i === 0 ? message : null, // Chỉ trích dẫn tin nhắn gốc ở phần đầu
            ttl: response.ttl,
          },
          threadId,
          message.type
        );
        if (response.pageDelayMs && i < messageParts.length - 1) {
          await new Promise((resolve) => setTimeout(resolve, response.pageDelayMs));
        }
      }
    }
  } catch (error) {
    console.error("Lỗi khi gửi tin nhắn danh sách lệnh:", error);
    await api.sendMessage(
      {
        msg: error.message,
        quote: message,
      },
      threadId,
      message.type
    );
  }
}

function getPermissionName(permission) {
  switch (permission) {
    case "all":
      return "Toàn Bộ Thành Viên";
    case "adminBox":
      return "Quản Trị Viên Nhóm";
    case "adminBot":
      return "Quản Trị Viên Bot";
    case "adminLevelHigh":
      return "Quản Trị Viên Cấp Cao";
    default:
      return "Không xác định";
  }
}
