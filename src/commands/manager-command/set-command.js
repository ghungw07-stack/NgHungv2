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

export function isCommandDisabledInGroup(botId, commandName, threadId) {
  if (!threadId || !commandName) return false;
  const managerCommand = getManagerCommandConfig(botId);
  const custom = managerCommand.customerCommand?.[String(commandName).toLowerCase()];
  return Array.isArray(custom?.disabledGroups) && custom.disabledGroups.includes(String(threadId));
}

export async function handleSetCommandActive(api, message, commandParts) {
  const botId = api.getBotId();
  const commandConfig = getCommandConfig();
  const prefix = getGlobalPrefix(botId);
  const senderId = message.data.uidFrom;
  const threadId = message.threadId;
  const isMainBot = api.apiManager.isMainBot;
  const isBotLeader = isMainBot && isAdmin(botId, senderId);
  const isAdminLevelHigh = isAdmin(botId, senderId);

  if (commandParts.length < 3) {
    await api.sendMessage(
      {
        msg:
          "⚠️ Vui lòng nhập đúng cú pháp:" +
          `\n${prefix}setcmd on/off <tên_lệnh> - Bật/tắt lệnh` +
          `\n${prefix}setcmd p <tên_lệnh> <level> - Đặt quyền hạn lệnh (1-4)` +
          `\n${prefix}setcmd pall <tên_lệnh> <level> - Đặt quyền cho tất cả bot con, kể cả bot tạo sau` +
          `\n${prefix}setcmd cd <tên_lệnh> <giây> - Đặt thời gian chờ lệnh` +
          `\n${prefix}setcmd group on/off <lệnh_1> <lệnh_2>... - Bật/tắt nhiều lệnh riêng trong nhóm`,
        quote: message,
        ttl: 300000,
      },
      threadId,
      message.type
    );
    return;
  }

  const action = commandParts[1].toLowerCase();
  const isGroupAction = action === "group";
  const groupState = isGroupAction ? commandParts[2]?.toLowerCase() : null;
  const groupCommandNames = isGroupAction
    ? [...new Set(commandParts.slice(3).flatMap((part) => String(part).split(",")).map((name) => name.trim().toLowerCase()).filter(Boolean))]
    : [];
  const cmdName = (isGroupAction ? groupCommandNames[0] : commandParts[2])?.toLowerCase();

  if (isGroupAction && (!isAdminLevelHigh || message.type !== 1)) {
    await sendMessageWarning(
      api,
      message,
      message.type !== 1
        ? "Cài đặt lệnh theo nhóm chỉ thực hiện trong nhóm"
        : "Chỉ quản trị viên cấp cao mới được bật/tắt lệnh trong nhóm"
    );
    return;
  }

  if (isGroupAction && (groupCommandNames.length === 0 || !["on", "off"].includes(groupState))) {
    await sendMessageWarning(api, message, `Cú pháp: ${prefix}setcmd group on/off <lệnh_1> <lệnh_2>...`);
    return;
  }

  if (isGroupAction) {
    const resolved = [];
    const missing = [];
    for (const name of groupCommandNames) {
      const found = commandConfig.commands.find(
        (cmd) => cmd.name === name || (Array.isArray(cmd.alias) && cmd.alias.includes(name))
      );
      if (!found) missing.push(name);
      else if (!resolved.some((item) => item.name === found.name)) resolved.push(found);
    }

    const protectedNames = resolved.filter((item) => item.name === "setcmd").map((item) => item.name);
    const applicable = resolved.filter((item) => item.name !== "setcmd");
    const normalizedThreadId = String(threadId);
    const shouldDisable = groupState === "off";
    const changed = [];
    const unchanged = [];

    for (const item of applicable) {
      const custom = getManagerCommandCustomConfig(botId, item.name);
      custom.disabledGroups = Array.isArray(custom.disabledGroups)
        ? [...new Set(custom.disabledGroups.map(String))]
        : [];
      const currentlyDisabled = custom.disabledGroups.includes(normalizedThreadId);
      if (currentlyDisabled === shouldDisable) {
        unchanged.push(item.name);
        continue;
      }
      if (shouldDisable) custom.disabledGroups.push(normalizedThreadId);
      else custom.disabledGroups = custom.disabledGroups.filter((id) => id !== normalizedThreadId);
      changed.push(item.name);
    }

    if (changed.length > 0) writeCommandConfig(commandConfig);
    const lines = [
      `Đã ${shouldDisable ? "tắt" : "bật"} ${changed.length} lệnh trong nhóm này: ${changed.join(", ") || "không có"}`,
    ];
    if (unchanged.length) lines.push(`Không đổi: ${unchanged.join(", ")}`);
    if (missing.length) lines.push(`Không tìm thấy: ${missing.join(", ")}`);
    if (protectedNames.length) lines.push("Bỏ qua setcmd để tránh mất quyền mở lại");
    await sendMessageComplete(api, message, lines.join("\n"), changed.length > 0, TIME_HOUR_24);
    return;
  }

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
    case "pall":
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

      if (action === "pall" && !isBotLeader) {
        await sendMessageWarning(
          api,
          message,
          "Chỉ có chủ sở hữu Bot Leader mới có quyền đặt quyền hạn cho tất cả bot con"
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

      if (action === "pall") {
        // Quyền ở command gốc là mặc định cho mọi bot con được tạo về sau.
        command.permission = newPermissionObj.key;

        // Xóa quyền tùy chỉnh cũ để toàn bộ bot con hiện có cũng kế thừa
        // quyền chung vừa đặt. Giữ nguyên các tùy chỉnh khác như countdown.
        for (const managerCommand of Object.values(commandConfig.managerCommand || {})) {
          const customCommand = managerCommand?.customerCommand?.[command.name];
          if (customCommand && Object.hasOwn(customCommand, "permission")) {
            delete customCommand.permission;
          }
        }
      } else if (isMainBot) {
        command.permission = newPermissionObj.key;
      } else {
        customerCommand.permission = newPermissionObj.key;
      }
      writeCommandConfig(commandConfig);

      await api.sendMessage(
        {
          msg:
            `✅ Đã thay đổi quyền hạn của lệnh "${cmdName}":\n- Quyền hạn mới: ${newPermissionObj.name}` +
            (action === "pall" ? "\n- Phạm vi: tất cả bot con hiện tại và bot tạo sau này" : ""),
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
            `\n- pall: Đặt quyền hạn cho tất cả bot con, kể cả bot tạo sau` +
            `\n- cd: Đặt thời gian chờ` +
            `\n- group on/off: Bật/tắt lệnh riêng trong nhóm`,
          quote: message,
          ttl: 300000,
        },
        threadId,
        message.type
      );
      break;
  }
}
