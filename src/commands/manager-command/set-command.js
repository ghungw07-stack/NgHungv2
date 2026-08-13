import { getCommandConfig, getManagerCommandConfig, getManagerCommandCustomConfig, isAdmin } from "../../index.js";
import { sendMessageComplete, sendMessageWarning } from "../../service-ngh/chat-zalo/chat-style/chat-style.js";
import { getGlobalPrefix } from "../../service-ngh/service.js";
import { writeCommandConfig } from "../../utils/io-json.js";
import { TIME_HOUR_24 } from "../../utils/util.js";

const permissionMap = {
  1: {
    key: "all",
    name: "Tất Cả Người Dùng",
  },
  2: {
    key: "adminBox",
    name: "Trưởng / Phó Cộng Đồng",
  },
  3: {
    key: "adminBot",
    name: "Quản Trị Bot",
  },
  4: {
    key: "adminLevelHigh",
    name: "Quản Trị Cấp Cao",
  },
};

export function getPermissionCommandName(command) {
  const permission = Object.values(permissionMap).find((p) => p.key === command.permission);
  return permission ? permission.name : "Tất Cả Người Dùng";
}

export async function handleSetCommandActive(api, message, commandParts) {
  const botId = api.getBotId();
  const commandConfig = getCommandConfig();
  const prefix = getGlobalPrefix(botId);
  const senderId = message.data.uidFrom;
  const threadId = message.threadId;
  const isMainBot = api.apiManager.isMainBot;
  const isBotLeader = isMainBot && isAdmin(botId, senderId);

  if (commandParts.length < 3) {
    await api.sendMessage(
      {
        msg:
          "⚠️ Vui lòng nhập đúng cú pháp:" +
          `\n${prefix}setcmd on/off <tên_lệnh> - Bật/tắt lệnh` +
          `\n${prefix}setcmd p <tên_lệnh> <level> - Đặt quyền hạn lệnh (1-4)` +
          `\n${prefix}setcmd cd <tên_lệnh> <giây> - Đặt thời gian chờ lệnh`,
        quote: message,
        ttl: 300000,
      },
      threadId,
      message.type
    );
    return;
  }

  const action = commandParts[1].toLowerCase();
  const cmdName = commandParts[2].toLowerCase();
  const command = commandConfig.commands.find(
    (cmd) => cmd.name === cmdName || (cmd.alias && cmd.alias.includes(cmdName))
  );

  if (!command) {
    await api.sendMessage(
      {
        msg: `❌ Không tìm thấy lệnh "${cmdName}"`,
        quote: message,
        ttl: 300000,
      },
      threadId,
      message.type
    );
    return;
  }

  const customerCommand = getManagerCommandCustomConfig(botId, command.name);

  switch (action) {
    case "on":
    case "off":
      if (isBotLeader) {
        const newActive = action === "on";
        command.active = newActive;
        writeCommandConfig(commandConfig);
        await api.sendMessage(
          {
            msg: `✅ Đã ${newActive ? "bật" : "tắt"} lệnh "${cmdName}"`,
            quote: message,
            ttl: 300000,
          },
          threadId,
          message.type
        );
      } else {
        await sendMessageWarning(api, message, "Chỉ có chủ sở hữu Bot Leader mới có quyền bật tắt lệnh chỉ định");
      }
      break;
    case "p":
      if (commandParts.length < 4) {
        await api.sendMessage(
          {
            msg:
              "⚠️ Vui lòng nhập level quyền hạn (1-4):" +
              "\n1: all (Tất cả)" +
              "\n2: adminBox (Quản trị viên nhóm)" +
              "\n3: adminBot (Quản trị viên bot)" +
              "\n4: adminLevelHigh (Quản trị viên cấp cao)",
            quote: message,
            ttl: 300000,
          },
          threadId,
          message.type
        );
        return;
      }

      const permissionLevel = parseInt(commandParts[3]);
      const newPermissionObj = permissionMap[permissionLevel];

      if (!newPermissionObj) {
        await api.sendMessage(
          {
            msg:
              "❌ Level quyền hạn không hợp lệ. Vui lòng chọn từ 1-4:\n" +
              Object.entries(permissionMap)
                .map(([level, { key, name }]) => `${level}: ${key} (${name})`)
                .join("\n"),
            quote: message,
            ttl: 300000,
          },
          threadId,
          message.type
        );
        return;
      }

      if (isMainBot) {
        command.permission = newPermissionObj.key;
      } else {
        customerCommand.permission = newPermissionObj.key;
      }
      writeCommandConfig(commandConfig);

      await api.sendMessage(
        {
          msg: `✅ Đã thay đổi quyền hạn của lệnh "${cmdName}":\n- Quyền hạn mới: ${newPermissionObj.name}`,
          quote: message,
          ttl: 300000,
        },
        threadId,
        message.type
      );
      break;

    case "cd":
      if (commandParts.length < 4) {
        await api.sendMessage(
          {
            msg: `⚠️ Vui lòng nhập thời gian chờ (tính bằng giây)`,
            quote: message,
            ttl: 300000,
          },
          threadId,
          message.type
        );
        return;
      }

      const newCountdown = parseInt(commandParts[3]);
      if (isNaN(newCountdown) || newCountdown < 0) {
        await api.sendMessage(
          {
            msg: "❌ Thời gian countdown phải là số nguyên dương",
            quote: message,
            ttl: 300000,
          },
          threadId,
          message.type
        );
        return;
      }

      let oldCountdown = command.countdown || 0;
      if (isMainBot) {
        command.countdown = newCountdown;
      } else {
        oldCountdown = customerCommand.countdown || oldCountdown;
        customerCommand.countdown = newCountdown;
      }
      writeCommandConfig(commandConfig);

      await api.sendMessage(
        {
          msg: `✅ Đã cập nhật thời gian chờ của lệnh "${cmdName}":\n- Cũ: ${oldCountdown}s\n- Mới: ${newCountdown}s`,
          quote: message,
          ttl: 300000,
        },
        threadId,
        message.type
      );
      break;

    case "ongr":
    case "offgr":
      customerCommand.activegroup ??= [];
      if (action === "ongr") {
        if (customerCommand.activegroup.includes(threadId)) {
          const tmpCaption = `Lệnh "${cmdName}" hiện đã được mở cho tất cả thành viên trong nhóm sử dụng`;
          await sendMessageComplete(api, message, tmpCaption, false, TIME_HOUR_24);
        } else {
          customerCommand.activegroup.push(threadId);
          writeCommandConfig(getManagerCommandConfig(botId));
          const tmpCaption = `Lệnh "${cmdName}" đã được mở cho tất cả thành viên trong nhóm sử dụng`;
          await sendMessageComplete(api, message, tmpCaption, true, TIME_HOUR_24);
        }
        writeCommandConfig(commandConfig);
      } else if (action === "offgr") {
        if (customerCommand.activegroup.includes(threadId)) {
          customerCommand.activegroup = customerCommand.activegroup.filter((id) => id !== threadId);
          writeCommandConfig(getManagerCommandConfig(botId));
          const tmpCaption = `Lệnh "${cmdName}" đã được tắt, thành viên trong nhóm sẽ không thể sử dụng lệnh này nếu không đủ quyền hạn`;
          await sendMessageComplete(api, message, tmpCaption, true, TIME_HOUR_24);
        } else {
          const tmpCaption = `Lệnh "${cmdName}" chưa được bật cho thành viên sử dụng trong nhóm này`;
          await sendMessageComplete(api, message, tmpCaption, false, TIME_HOUR_24);
        }
      }
      break;

    default:
      await api.sendMessage(
        {
          msg:
            `❌ Hành động không hợp lệ. Vui lòng sử dụng:` +
            `\n- on/off: Bật/tắt lệnh` +
            `\n- p: Đặt quyền hạn` +
            `\n- cd: Đặt thời gian chờ`,
          quote: message,
          ttl: 300000,
        },
        threadId,
        message.type
      );
      break;
  }
}
