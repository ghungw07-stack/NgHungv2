import { MultiMsgStyle, MessageStyle } from "../../api-zalo/index.js";
import { getCommandConfig, getManagerCommandCustomConfig, isAdmin, reloadCommandConfig } from "../../index.js";
import * as cv from "../../utils/canvas/index.js";
import { checkBeforeJoinGame, checkPlayerBanned } from "../../service-ngh/game-service/index.js";
import { getGlobalPrefix } from "../../service-ngh/service.js";
import { COLOR_GREEN, SIZE_18, IS_BOLD, getTextStyle, sendMessageFromSQL } from "../../service-ngh/chat-zalo/chat-style/chat-style.js";
import { LRUCache } from "lru-cache";
import { removeMention } from "../../utils/format-util.js";
import { findRecentMessages } from "../bot-manager/recent-message.js";

const COMMANDS_PER_PAGE = 25;
const MENU_COMMANDS_PER_PAGE = 16;
const MENU_PAGE_TTL = 300000; // 5 phút chờ chọn trang
const FIND_PAGE_DELAY_MS = 5000;

// Lưu riêng theo bot + nhóm + người dùng để menu ở nơi khác không bắt nhầm tin nhắn.
const menuPageMap = new LRUCache({
  max: 500,
  ttl: MENU_PAGE_TTL,
});

const getMenuSessionKey = (api, message) =>
  `${api.getBotId()}:${message.threadId}:${message.data.uidFrom}`;

export async function helpCommand(api, message, isAdminBox) {
  const senderId = message.data.uidFrom;
  const threadId = message.threadId;
  const senderName = message.data.dName;
  const botId = api.getBotId();
  const botName = api.accountInfo?.name || "Bot";

  const commandConfig = getCommandConfig();
  const allCommands = (commandConfig.commands || []).filter((cmd) =>
    isAdminBox ? true : cmd.permission === "all"
  );

  const prefix = getGlobalPrefix(botId);
  const commandsForMenu = allCommands.map((cmd) => {
    const customerCommand = getManagerCommandCustomConfig(botId, cmd.name) || {};
    const syntax = cmd.syntax ? cmd.syntax.replace("{p}", prefix) : `${prefix}${cmd.name}`;
    return {
      name: syntax,
      description: customerCommand.description || cmd.description || "",
    };
  });

  const totalCommands = commandsForMenu.length;
  const totalPages = Math.max(1, Math.ceil(totalCommands / MENU_COMMANDS_PER_PAGE));

  try {
    const { imagePath, msgId } = await sendMenuPage(api, message, {
      botName,
      commandsForMenu,
      page: 1,
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

    await cv.clearImagePath(imagePath);
  } catch (error) {
    console.error("Lỗi khi gửi tin nhắn trợ giúp:", error);
    const fallback = commandsForMenu
      .slice(0, MENU_COMMANDS_PER_PAGE)
      .map((cmd, index) => `${index + 1}. ${cmd.name} — ${cmd.description}`)
      .join("\n");
    await api.sendMessage(
      {
        msg: `📚 ${botName} có ${totalCommands} lệnh.\n\n${fallback || "Chưa có lệnh khả dụng."}\n\nDùng ${prefix}command để xem và tìm lệnh.`,
        ttl: 600000,
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

  const imagePath = await cv.createMenuGridImage({
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
      ttl: 600000,
      isUseProphylactic: true,
    },
    threadId,
    message.type
  );

  const msgId = sentMessage?.message?.msgId || sentMessage?.attachment?.[0]?.msgId;
  return { imagePath, msgId };
}

// Chỉ nhận số trang khi người dùng reply đúng ảnh menu gần nhất.
// Nhờ vậy tin nhắn số thông thường trong nhóm không kích hoạt menu ngoài ý muốn.
export async function checkMenuPageReply(api, message) {
  const quote = message.data?.quote;
  if (!quote?.globalMsgId) return false;

  const sessionKey = getMenuSessionKey(api, message);
  if (!menuPageMap.has(sessionKey)) return false;

  const data = menuPageMap.get(sessionKey);
  if (!data?.lastMsgId || String(quote.globalMsgId) !== String(data.lastMsgId)) return false;

  const content = removeMention(message).trim();
  if (!/^\d+$/.test(content)) return false;

  const pageRequested = parseInt(content, 10);
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
    await cv.clearImagePath(imagePath);
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
  if (!(await checkBeforeJoinGame(api, message, groupSettings))) return;

  const prefix = getGlobalPrefix(api.getBotId());
  const senderId = String(message.data.uidFrom);
  const senderName = message.data.dName || senderId;

  const text =
    `${senderName}\n` +
    `《 🎮 MENU TRÒ CHƠI 🎮 》\n\n` +
    `➤ Tra cứu & tài khoản:\n` +
    `『${prefix}game help』\n` +
    `• Daily, thẻ, hạng, chuyển tiền, biến động số dư...\n\n` +
    `➤ MiniGame:\n` +
    `『${prefix}game minigame』\n` +
    `• Minigame - Tham gia các game như PNTT, Nuôi Rồng, Hàng Loạt Các Game Cờ, Nông Trại Câu Cá....\n\n` +
    `➤ BigGame:\n` +
    `『${prefix}game biggame』\n` +
    `• Biggame - Tham gia các game đặt cược giải trí và phán đoán vận may`;

  await api.sendMessage(
    {
      msg: text,
      mentions: [{ pos: 0, uid: senderId, len: senderName.length }],
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
      ...positions.map(({ pos, len }) =>
        MessageStyle(
          pos,
          len,
          COLOR_GREEN,
          textStyle.size,
          textStyle.bold,
          textStyle.italic,
          textStyle.underline,
          textStyle.strike
        )
      ),
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
      return {
        msg: responseMsg,
        style: style,
        ttl: 60000,
        pageDelayMs: FIND_PAGE_DELAY_MS,
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
      const title = isAdminMap ? "👑 Danh sách lệnh Admin" : "📜 Danh sách lệnh Thành Viên";
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

      return { parts, ttl: 300000 };
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
      let responseMsg = "⛔ Danh sách lệnh đang tắt:\n\n";
      const positions = [];

      commandsToShow.forEach((cmd, index) => {
        const customerCommand = getManagerCommandCustomConfig(botId, cmd.name);
        const linePrefix = `${index + 1 + startIndex}. ⭐ Lệnh: `;
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
        msg: responseMsg,
        style: createMapLikeStyle(responseMsg, positions),
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

      let responseMsg = isAdminRequest
        ? `👑 Danh sách lệnh Admin | Trang ${pageNumber}/${totalPages}\n\n`
        : `📜 Danh sách lệnh Thành Viên | Trang ${pageNumber}/${totalPages}\n\n`;
      let positions = [];

      commandsToShow.forEach((cmd, index) => {
        const linePrefix = `${index + 1 + startIndex}. `;
        const startPos = responseMsg.length + linePrefix.length;
        responseMsg += `${linePrefix}${cmd.name}: ${cmd.description}\n`;
        positions.push({ pos: startPos, len: cmd.name.length });
      });

      const style = createMapLikeStyle(responseMsg, positions);

      return {
        msg: responseMsg,
        style: style,
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
