import { removeMention } from "../../utils/format-util.js";
import { sendMessageFromSQL } from "../../service-dqt/chat-zalo/chat-style/chat-style.js";
import { ThreadType } from "../../api-zalo/apis/sendReport.js";
import { getGlobalPrefix } from "../../service-dqt/service.js";

export async function handleCreateAutoReplyCommand(api, message, aliasCommand) {
  try {
    const prefix = getGlobalPrefix(api.getBotId());
    const content = removeMention(message);
    const parts = content.trim().split(/\s+/);
    
    if (parts.length < 3) {
      const obj = {
        success: false,
        message: `❌ Thiếu thông tin!\n\n💡 Cách sử dụng:\n${prefix}${aliasCommand} <nội dung> <scope> [uids]\n\n📌 Scope:\n- 0: Tất cả người dùng\n- 1: Người dùng cụ thể (cần uids)\n- 2: Tất cả nhóm\n- 3: Nhóm cụ thể (cần uids)\n\n💡 Ví dụ:\n${prefix}${aliasCommand} Xin chào! 0\n${prefix}${aliasCommand} Tự động trả lời 1 123456789,987654321`,
      };
      await sendMessageFromSQL(api, message, obj, false, 30000);
      return;
    }

    const lastPart = parts[parts.length - 1];
    const scope = parseInt(lastPart);
    
    let contentText = "";
    let uidsParam = null;
    
    if (isNaN(scope) || scope < 0 || scope > 3) {
      const obj = {
        success: false,
        message: `❌ Scope không hợp lệ! Scope phải là số cuối cùng (0-3)\n\n💡 Scope:\n- 0: Tất cả người dùng\n- 1: Người dùng cụ thể (cần uids)\n- 2: Tất cả nhóm\n- 3: Nhóm cụ thể (cần uids)`,
      };
      await sendMessageFromSQL(api, message, obj, false, 30000);
      return;
    }

    if (parts.length === 2) {
      const obj = {
        success: false,
        message: `❌ Vui lòng nhập nội dung!\n\n💡 Cách sử dụng:\n${prefix}${aliasCommand} <nội dung> <scope>`,
      };
      await sendMessageFromSQL(api, message, obj, false, 30000);
      return;
    }

    if ((scope === 1 || scope === 3) && parts.length < 4) {
      const obj = {
        success: false,
        message: `❌ Vui lòng nhập uids khi scope là 1 hoặc 3!\n\n💡 Cách sử dụng:\n${prefix}${aliasCommand} <nội dung> <uids> <scope>\n\nVí dụ: ${prefix}${aliasCommand} Xin chào! 123456789,987654321 1`,
      };
      await sendMessageFromSQL(api, message, obj, false, 30000);
      return;
    }

    if (scope === 1 || scope === 3) {
      uidsParam = parts[parts.length - 2];
      contentText = parts.slice(1, parts.length - 2).join(" ");
      
      if (!uidsParam || uidsParam.trim().length === 0) {
        const obj = {
          success: false,
          message: `❌ Vui lòng nhập uids khi scope là 1 hoặc 3!\n\n💡 Cách sử dụng:\n${prefix}${aliasCommand} <nội dung> <uids> <scope>\n\nVí dụ: ${prefix}${aliasCommand} Xin chào! 123456789,987654321 1`,
        };
        await sendMessageFromSQL(api, message, obj, false, 30000);
        return;
      }
    } else {
      contentText = parts.slice(1, parts.length - 1).join(" ");
    }

    if (!contentText || contentText.trim().length === 0) {
      const obj = {
        success: false,
        message: `❌ Vui lòng nhập nội dung!\n\n💡 Cách sử dụng:\n${prefix}${aliasCommand} <nội dung> <scope>`,
      };
      await sendMessageFromSQL(api, message, obj, false, 30000);
      return;
    }

    let uids = [];
    if ((scope === 1 || scope === 3) && uidsParam) {
      uids = uidsParam.split(",").map(uid => uid.trim()).filter(uid => uid.length > 0);
      if (uids.length === 0) {
        const obj = {
          success: false,
          message: `❌ UIDs không hợp lệ!\n\n💡 Cách sử dụng:\n${prefix}${aliasCommand} <nội dung> <uids> <scope>\n\nVí dụ: ${prefix}${aliasCommand} Xin chào! 123456789,987654321 1`,
        };
        await sendMessageFromSQL(api, message, obj, false, 30000);
        return;
      }
    }

    const payload = {
      content: contentText.trim(),
      isEnable: true,
      startTime: 0,
      endTime: Number.MAX_SAFE_INTEGER,
      scope: scope,
    };

    if (scope === 1 || scope === 3) {
      if (uids.length === 0) {
        const obj = {
          success: false,
          message: `❌ Vui lòng nhập uids khi scope là 1 hoặc 3!\n\n💡 Cách sử dụng:\n${prefix}${aliasCommand} <nội dung> <scope> <uids>\n\nVí dụ: ${prefix}${aliasCommand} Xin chào! 1 123456789,987654321`,
        };
        await sendMessageFromSQL(api, message, obj, false, 30000);
        return;
      }
      payload.uids = uids;
    }

    const result = await api.createAutoReply(payload);
    
    const scopeText = {
      0: "Tất cả người dùng",
      1: "Người dùng cụ thể",
      2: "Tất cả nhóm",
      3: "Nhóm cụ thể"
    }[scope] || "Không xác định";
    
    const obj = {
      success: true,
      message: `✅ Đã tạo auto reply thành công!\n\n📝 Nội dung: ${contentText}\n📌 Phạm vi: ${scopeText}\n⚙️ Trạng thái: Bật\n⏰ Thời gian: Cả ngày${uids.length > 0 ? `\n👥 UIDs: ${uids.join(", ")}` : ""}`,
    };
    await sendMessageFromSQL(api, message, obj, false, 30000);
  } catch (error) {
    console.error("❌ Lỗi khi tạo auto reply:", error);
    const obj = {
      success: false,
      message: `❌ Lỗi khi tạo auto reply: ${error.message || error}`,
    };
    await sendMessageFromSQL(api, message, obj, false, 30000);
  }
}

export async function handleDeleteAutoReplyCommand(api, message, aliasCommand) {
  let id = null;
  try {
    const prefix = getGlobalPrefix(api.getBotId());
    const content = removeMention(message);
    const parts = content.trim().split(/\s+/);
    
    if (parts.length < 2) {
      const obj = {
        success: false,
        message: `❌ Thiếu thông tin!\n\n💡 Cách sử dụng:\n${prefix}${aliasCommand} <id>\n\n💡 Ví dụ:\n${prefix}${aliasCommand} 123\n💡 Dùng ${prefix}listautoreply để xem danh sách và ID`,
      };
      await sendMessageFromSQL(api, message, obj, false, 30000);
      return;
    }

    id = parseInt(parts[1]);

    if (isNaN(id)) {
      const obj = {
        success: false,
        message: `❌ ID không hợp lệ! ID phải là số.\n\n💡 Cách sử dụng:\n${prefix}${aliasCommand} <id>\n\n💡 Ví dụ:\n${prefix}${aliasCommand} 123\n💡 Dùng ${prefix}listautoreply để xem danh sách và ID`,
      };
      await sendMessageFromSQL(api, message, obj, false, 30000);
      return;
    }

    const result = await api.deleteAutoReply(id);
    
    const obj = {
      success: true,
      message: `✅ Đã xóa auto reply thành công!\n\n🆔 ID: ${id}`,
    };
    await sendMessageFromSQL(api, message, obj, false, 30000);
  } catch (error) {
    console.error("❌ Lỗi khi xóa auto reply:", error);
    const prefix = getGlobalPrefix(api.getBotId());
    let errorMessage = `❌ Lỗi khi xóa auto reply: ${error.message || error}`;
    
    if (error.code === 212) {
      errorMessage = `❌ Không tìm thấy auto reply với ID ${id !== null ? id : "không xác định"}!\n\n💡 Có thể ID không tồn tại hoặc đã bị xóa.\n💡 Dùng ${prefix}listautoreply để xem danh sách và ID hợp lệ.`;
    }
    
    const obj = {
      success: false,
      message: errorMessage,
    };
    await sendMessageFromSQL(api, message, obj, false, 30000);
  }
}

export async function handleGetAutoReplyListCommand(api, message, aliasCommand) {
  try {
    const result = await api.getAutoReplyList();
    
    const items = result?.item || [];
    
    if (items.length === 0) {
      const obj = {
        success: true,
        message: `📋 Danh sách auto reply:\n\n❌ Chưa có auto reply nào được tạo.`,
      };
      await sendMessageFromSQL(api, message, obj, false, 30000);
      return;
    }

    let messageText = `📋 Danh sách auto reply (${items.length}):\n\n`;
    
    items.forEach((item, index) => {
      const scopeText = {
        0: "Tất cả người dùng",
        1: "Người dùng cụ thể",
        2: "Tất cả nhóm",
        3: "Nhóm cụ thể"
      }[item.scope] || "Không xác định";
      
      const isEnabled = item.enable ? "✅ Bật" : "❌ Tắt";
      const contentPreview = item.content ? (item.content.length > 50 ? item.content.substring(0, 50) + "..." : item.content) : "Không có nội dung";
      
      messageText += `${index}. [ID: ${item.id || index}]\n`;
      messageText += `   📝 Nội dung: ${contentPreview}\n`;
      messageText += `   📌 Phạm vi: ${scopeText}\n`;
      messageText += `   ⚙️ Trạng thái: ${isEnabled}\n`;
      if (item.uids && item.uids.length > 0) {
        messageText += `   👥 UIDs: ${item.uids.join(", ")}\n`;
      }
      messageText += `\n`;
    });

    const obj = {
      success: true,
      message: messageText,
    };
    await sendMessageFromSQL(api, message, obj, false, 30000);
  } catch (error) {
    console.error("❌ Lỗi khi lấy danh sách auto reply:", error);
    const obj = {
      success: false,
      message: `❌ Lỗi khi lấy danh sách auto reply: ${error.message || error}`,
    };
    await sendMessageFromSQL(api, message, obj, false, 30000);
  }
}

export async function handleCreateReminderCommand(api, message, aliasCommand) {
  try {
    const prefix = getGlobalPrefix(api.getBotId());
    const content = removeMention(message);
    const parts = content.trim().split(/\s+/);
    
    if (parts.length < 2) {
      const obj = {
        success: false,
        message: `❌ Thiếu thông tin!\n\n💡 Cách sử dụng:\n${prefix}${aliasCommand} <tiêu đề> [threadId] [type] [emoji] [repeat]\n\n📌 Type:\n- user: Tin nhắn riêng (mặc định)\n- group: Nhóm\n\n💡 Repeat:\n- 0: Không lặp lại (mặc định)\n- 1: Hàng ngày\n- 2: Hàng tuần\n- 3: Hàng tháng\n- 4: Hàng năm\n\n💡 Ví dụ:\n${prefix}${aliasCommand} Họp lúc 3h chiều\n${prefix}${aliasCommand} Nhắc nhở group123 group\n${prefix}${aliasCommand} Nhắc nhở 123456789 user 📅 1`,
      };
      await sendMessageFromSQL(api, message, obj, false, 30000);
      return;
    }

    let title = parts[1];
    let threadId = null;
    let type = "user";
    let emoji = "⏰";
    let repeat = 0;
    let startTime = null;

    for (let i = 2; i < parts.length; i++) {
      const part = parts[i].toLowerCase();
      if (part === "user" || part === "group") {
        type = part;
      } else if (part.startsWith("repeat:") || part.startsWith("r:")) {
        const repeatValue = parseInt(part.split(":")[1]);
        if (!isNaN(repeatValue) && repeatValue >= 0 && repeatValue <= 4) {
          repeat = repeatValue;
        }
      } else if (part.startsWith("time:") || part.startsWith("t:")) {
        const timeValue = parseInt(part.split(":")[1]);
        if (!isNaN(timeValue)) {
          startTime = timeValue;
        }
      } else if (/^[\u{1F300}-\u{1F9FF}]$/u.test(parts[i]) || parts[i].length === 1) {
        emoji = parts[i];
      } else if (!threadId && /^\d+$/.test(parts[i])) {
        threadId = parts[i];
      } else {
        title += " " + parts[i];
      }
    }

    if (!threadId) {
      threadId = message.threadId;
      if (message.type === 1) {
        type = "group";
      }
    }

    const threadType = type === "group" ? ThreadType.Group : ThreadType.User;

    const options = {
      title: title.trim(),
      emoji: emoji,
      startTime: startTime,
      repeat: repeat,
    };

    const result = await api.createReminder(options, String(threadId), threadType);
    
    const typeText = type === "group" ? "Nhóm" : "Người dùng";
    const repeatText = {
      0: "Không lặp lại",
      1: "Hàng ngày",
      2: "Hàng tuần",
      3: "Hàng tháng",
      4: "Hàng năm"
    }[repeat] || "Không lặp lại";
    
    const obj = {
      success: true,
      message: `✅ Đã tạo reminder thành công!\n\n📝 Tiêu đề: ${title}\n📌 Loại: ${typeText}\n🆔 Thread ID: ${threadId}\n⏰ Thời gian: ${startTime ? new Date(startTime).toLocaleString() : "Ngay bây giờ"}\n🔄 Lặp lại: ${repeatText}\n${emoji !== "⏰" ? `😀 Emoji: ${emoji}` : ""}`,
    };
    await sendMessageFromSQL(api, message, obj, false, 30000);
  } catch (error) {
    console.error("❌ Lỗi khi tạo reminder:", error);
    const obj = {
      success: false,
      message: `❌ Lỗi khi tạo reminder: ${error.message || error}`,
    };
    await sendMessageFromSQL(api, message, obj, false, 30000);
  }
}

export async function handleDeleteChatCommand(api, message, aliasCommand) {
  try {
    const prefix = getGlobalPrefix(api.getBotId());
    const content = removeMention(message);
    const parts = content.trim().split(/\s+/);
    
    let threadId = null;
    let type = "user";
    let lastMessage = null;

    const quote = message.data?.quote;
    
    if (quote && quote.ownerId && quote.cliMsgId && quote.globalMsgId) {
      lastMessage = {
        ownerId: String(quote.ownerId),
        cliMsgId: String(quote.cliMsgId),
        globalMsgId: String(quote.globalMsgId),
      };
    }

    if (parts.length >= 2) {
      const secondPart = parts[1].toLowerCase();
      if (secondPart === "user" || secondPart === "group") {
        type = secondPart;
        if (parts.length >= 3) {
          threadId = parts[2];
        }
      } else {
        threadId = parts[1];
        if (parts.length >= 3) {
          const thirdPart = parts[2].toLowerCase();
          if (thirdPart === "user" || thirdPart === "group") {
            type = thirdPart;
          }
        }
      }
    }

    if (!threadId) {
      threadId = message.threadId;
      if (message.type === 1) {
        type = "group";
      }
    }

    if (!lastMessage) {
      if (parts.length >= 2) {
        try {
          const jsonStr = parts.slice(1).join(" ");
          const parsed = JSON.parse(jsonStr);
          if (parsed.ownerId && parsed.cliMsgId && parsed.globalMsgId) {
            lastMessage = {
              ownerId: String(parsed.ownerId),
              cliMsgId: String(parsed.cliMsgId),
              globalMsgId: String(parsed.globalMsgId),
            };
          }
        } catch (e) {

        }
      }
      
      if (!lastMessage) {
        const obj = {
          success: false,
          message: `❌ Thiếu thông tin lastMessage!\n\n💡 Cách sử dụng:\n${prefix}${aliasCommand} [threadId] [type]\n\n💡 Hoặc reply vào tin nhắn cuối cùng:\n${prefix}${aliasCommand}\n${prefix}${aliasCommand} threadId\n\n💡 Ví dụ:\n${prefix}${aliasCommand}\n${prefix}${aliasCommand} 123456789 user\n${prefix}${aliasCommand} group123 group`,
        };
        await sendMessageFromSQL(api, message, obj, false, 30000);
        return;
      }
    }

    const threadType = type === "group" ? ThreadType.Group : ThreadType.User;

    const result = await api.deleteChat(lastMessage, String(threadId), threadType);
    
    const typeText = type === "group" ? "Nhóm" : "Người dùng";
    
    const obj = {
      success: true,
      message: `✅ Đã xóa cuộc trò chuyện thành công!`,
    };
    await sendMessageFromSQL(api, message, obj, false, 30000);
  } catch (error) {
    console.error("❌ Lỗi khi xóa chat:", error);
    const obj = {
      success: false,
      message: `❌ Lỗi khi xóa chat: ${error.message || error}`,
    };
    await sendMessageFromSQL(api, message, obj, false, 30000);
  }
}
