import { MultiMsgStyle, MessageStyle } from "../../api-zalo/index.js";
import { getCommandConfig, getManagerCommandCustomConfig, isAdmin, reloadCommandConfig } from "../../index.js";
import * as cv from "../../utils/canvas/index.js";
import { checkBeforeJoinGame, checkPlayerBanned } from "../../service-dqt/game-service/index.js";
import { getGlobalPrefix } from "../../service-dqt/service.js";
import { COLOR_GREEN, SIZE_18, IS_BOLD, sendMessageFromSQL } from "../../service-dqt/chat-zalo/chat-style/chat-style.js";
import { LRUCache } from "lru-cache";
import { removeMention } from "../../utils/format-util.js";
import { findRecentMessages } from "../bot-manager/recent-message.js";

const COMMANDS_PER_PAGE = 10;
const MENU_COMMANDS_PER_PAGE = 16;
const MENU_PAGE_TTL = 300000; // 5 phút chờ chọn trang

// Lưu trạng thái phân trang menu theo từng người dùng (không cần reply/prefix để đổi trang)
const menuPageMap = new LRUCache({
  max: 500,
  ttl: MENU_PAGE_TTL,
});

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

    menuPageMap.set(senderId, {
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

// Cho phép người dùng nhắn thẳng số trang (không cần prefix, không cần reply) để chuyển trang menu.
// Trang cũ sẽ được thu hồi trước khi gửi trang mới.
export async function checkMenuPageReply(api, message) {
  if (message.data?.quote) return false;

  const senderId = message.data.uidFrom;
  if (!menuPageMap.has(senderId)) return false;

  const content = removeMention(message).trim();
  if (!/^\d+$/.test(content)) return false;

  const pageRequested = parseInt(content, 10);
  const data = menuPageMap.get(senderId);
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

    menuPageMap.set(senderId, { ...data, lastMsgId: msgId });
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
  commandMessage += `║ 📋 ${prefix}listmute - Xem danh sách mute\n`;
  commandMessage += `║ 🔖 ${prefix}listadmin - xem danh sách admin bot nhóm\n`;
  commandMessage += `║ 📥 ${prefix}add/remove - thêm/xóa admin bot nhóm\n`;
  commandMessage += `║ 🚫 ${prefix}antibadword on/off - Lọc từ thô tục\n`;
  commandMessage += `║ 🔗 ${prefix}antilink on/off - Chặn liên kết\n`;
  commandMessage += `║ 🚫 ${prefix}antispam on/off - Chống spam\n`;
  commandMessage += `║ 🚫 ${prefix}antistag on/off - Chặn tag thành viên\n`;
  commandMessage += `║ 🚫 ${prefix}antiforward on/off - Chặn chuyển tiếp tin nhắn\n`;
  commandMessage += `║ 🚫 ${prefix}antifile on/off - Chặn gửi file\n`;  
  commandMessage += `║ 🚫 ${prefix}antiphoto on/off - Chặn gửi ảnh/video\n`; 
  commandMessage += `║ 🚫 ${prefix}antivoice on/off - Chặn gửi voice\n`;  
  commandMessage += `║ 🚫 ${prefix}antisticker on/off - Chống sticker gây phiền\n`; 
  commandMessage += `║ ⚡ ${prefix}antistickereffect on/off - Chống sticker gây lag\n`;
  commandMessage += `║ 🅰 ${prefix}onlytext on/off - Chỉ nhắn tin văn bản\n`;
  commandMessage += `║ 👢 ${prefix}kick @mention - Kick thành viên\n`;
  commandMessage += `║ 🔇 ${prefix}mute @mention - Mute thành viên\n`;
  commandMessage += `║ 🔊 ${prefix}unmute @mention - Unmute thành viên\n`;
  commandMessage += `║ 👋 ${prefix}welcome on/off - Chào mừng thành viên mới\n`;
  commandMessage += `║ 👋 ${prefix}bye on/off - Tạm biệt thành viên rời nhóm\n`;
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
      addremove: {
        command: `${prefix}add/remove [@người dùng]`,
        description: "Thêm/xóa admin bot nhóm",
        icon: "🔖",
      },
      mute: {
        command: `${prefix}mute/unmute [@người dùng]`,
        description: "Mute/Unmute thành viên",
        icon: "🔇",
      },
      antibadword: {
        command: `${prefix}antibadword on/off`,
        description: "Lọc từ thô tục",
        icon: "🅰",
      },
      antilink: {
        command: `${prefix}antilink on/off`,
        description: "Chặn gửi liên kết",
        icon: "🔗",
      },
      antispam: {
        command: `${prefix}antispam on/off`,
        description: "Chống spam tin nhắn",
        icon: "⛔",
      },
      onlytext: {
        command: `${prefix}onlytext on/off`,
        description: "Chỉ nhắn tin văn bản",
        icon: "🅰",
      },
      antinude: {
        command: `${prefix}antinude on/off`,
        description: "Chống gửi ảnh nhạy cảm",
        icon: "🅰",
      },
      antiundo: {
        command: `${prefix}antiundo on/off`,
        description: "Chống thu hồi tin nhắn",
        icon: "🅰",
      },
      antiStickerEffect: {
        command: `${prefix}antiStickerEffect on/off`,
        description: "Chống gửi sticker hiệu ứng",
        icon: "🅰",
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
        command: `${prefix}welcome on/off`,
        description: "Chào mừng thành viên mới",
        icon: "👋",
      },
      bye: {
        command: `${prefix}bye on/off`,
        description: "Tạm biệt thành viên rời nhóm",
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
      keygold: {
        command: `${prefix}keygold [@người dùng]`,
        description: "Nhường cộng đổng cho người đề cập",
        icon: "🔖",
      },
      keysilver: {
        command: `${prefix}keysilver [@người dùng]`,
        description: "Phong key bạc cho thành viên đề cập",
        icon: "🔖",
      },
      unkey: {
        command: `${prefix}unkey [@người dùng]`,
        description: "Gỡ quyền phó cộng đồng của người được đề cập",
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

  const text =
    `🎮 MENU TRÒ CHƠI 🎮\n\n` +
    `➤ Không cần đăng ký, tài khoản game tự động liên kết theo Zalo của bạn.\n\n` +
    `➤ Xem đầy đủ danh sách lệnh:\n\`${prefix}game help\`\n\n` +
    `➤ Chơi ngay, ví dụ:\n` +
    `\`${prefix}game daily\` - Nhận thưởng hàng ngày\n` +
    `\`${prefix}game mycard\` - Xem thông tin cá nhân\n` +
    `\`${prefix}game taixiu\` - Chơi Tài Xỉu`;

  const result = { success: true, message: text };
  await sendMessageFromSQL(api, message, result, true, 60000);
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
      mycard: {
        command: `${prefix}game mycard`,
        description: "Xem thông tin cá nhân",
        icon: "🔖",
      },
      rank: {
        command: `${prefix}game rank`,
        description: "Xem top 10 người chơi giàu nhất",
        icon: "🏆",
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
    },
    titleAdmin: "👑 Lệnh dành cho Admin 👑",
    admin: {
      buff: {
        command: `${prefix}buff [số tiền] [@người nhận]`,
        description: "Tặng tiền cho người chơi",
        icon: "💰",
      },
      ban: {
        command: `${prefix}ban [@người chơi]`,
        description: "Khóa tài khoản người chơi",
        icon: "🔒",
      },
      unban: {
        command: `${prefix}unban [@người chơi]`,
        description: "Mở khóa tài khoản người chơi",
        icon: "🔓",
      },
    },
  };

  try {
    // await api.sendMessage({ msg: helpMessage, quote: message }, threadId, message.type);
    const imagePath = await cv.createInstructionsImage(gameCommand, isAdminBox, 760);
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
        const startPos = responseMsg.length;
        responseMsg += `${index + 1}. ⭐ Lệnh: ${cmd.name}\n`;
        positions.push({ pos: startPos, len: cmd.name.length + 11 });

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
      const isAdminMap = subCommand === "admin";
      const filteredCommands = commandConfig.commands
        .filter((cmd) =>
          isAdminMap ? ["adminBox", "adminBot", "adminLevelHigh"].includes(cmd.permission) : cmd.permission === "all"
        )
        .map((cmd) => ({
          name: cmd.name,
          description: cmd.description,
          permission: cmd.permission,
        }));

      const title = isAdminMap ? "Admin" : "Thành Viên";
      const header = `🔍 Liệt Kê Toàn Bộ Lệnh ${title}:\n\n`;
      const MAX_CHUNK_LEN = 1800; // chừa an toàn dưới giới hạn 2000 của splitMessage
      const MAX_STYLE_PER_CHUNK = 15; // giới hạn số đoạn tô màu/1 tin, phòng Zalo giới hạn số lượng style

      const parts = [];
      let currentMsg = header;
      let currentPositions = [];

      const flushChunk = () => {
        if (!currentMsg.trim()) return;
        const style = currentPositions.length
          ? MultiMsgStyle(
              currentPositions.map(({ pos, len }) => MessageStyle(pos, len, COLOR_GREEN, SIZE_18, IS_BOLD))
            )
          : null;
        parts.push({ msg: currentMsg.trim(), style });
      };

      filteredCommands.forEach((cmd, index) => {
        const linePrefix = `${index + 1}. `;
        const line = `${linePrefix}${cmd.name}: ${cmd.description}\n`;

        if ((currentMsg + line).length > MAX_CHUNK_LEN || currentPositions.length >= MAX_STYLE_PER_CHUNK) {
          flushChunk();
          currentMsg = "";
          currentPositions = [];
        }

        const startPos = currentMsg.length + linePrefix.length;
        currentPositions.push({ pos: startPos, len: cmd.name.length });
        currentMsg += line;
      });

      flushChunk();

      return {
        parts,
        ttl: 300000,
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

      let responseMsg = isAdminRequest ? "👑 Danh sách lệnh Admin:\n\n" : "📜 Danh sách lệnh:\n\n";
      let positions = [];

      commandsToShow.forEach((cmd, index) => {
        const startPos = responseMsg.length + 11;
        responseMsg += `${index + 1 + startIndex}. ⭐ Lệnh: ${cmd.name}\n`;
        positions.push({ pos: startPos, len: cmd.name.length + 1 });

        responseMsg += `   📝 Mô Tả: ${cmd.description}\n`;
        if (cmd.permission !== "all") {
          responseMsg += `   🔒 Quyền Hạn: ${getPermissionName(cmd.permission)}\n`;
        }
        responseMsg += `   ⏱️ Countdown: ${cmd.countdown} Giây\n\n`;
      });

      responseMsg += [
        `📄 Trang ${pageNumber}/${totalPages}`,
        `💡 Dùng ${prefix}cmd ${isAdminRequest ? "admin " : ""}[số trang] để xem các trang khác.`,
        `ℹ️ Dùng ${prefix}cmd map ${isAdminRequest ? "admin " : ""}` +
          `để xem toàn bộ lệnh dành cho ${isAdminRequest ? "admin" : "thành viên"}.`,
      ].join("\n");

      const style = MultiMsgStyle(
        positions.map(({ pos, len }) => MessageStyle(pos, len, COLOR_GREEN, SIZE_18, IS_BOLD))
      );

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