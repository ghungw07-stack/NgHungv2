import { MessageMention, MessageType } from "zlbotngh";
import { sendMessageStateQuote } from "../chat-zalo/chat-style/chat-style.js";
import { removeMention } from "../../utils/format-util.js";
import { getAntiConfig, updateAntiConfig } from "./index.js";
import { isInWhiteList } from "./white-list.js";
import { deleteMessageCustomer } from "../../commands/bot-manager/utilities.js";

function normalizeText(text) {
  return text.toLowerCase().trim();
}

function checkAdsWords(botId, content) {
  let adsWords = getAntiConfig(botId)?.adsWords || [
    "cày thuê", "kéo rank", "mua bán acc", "nạp game", "nạp thẻ", 
    "bán tài khoản", "liên hệ zalo", "lh zalo", "nhận kéo", 
    "nhận cày", "chuyển khoản", "giá rẻ", "khuyến mãi",
    "bán sll", "inbox mua", "ib mua", "ib nhận", "thu mua sll",
    "chốt số", "soi cầu", "số lô", "số đề", "lô đề", "dự đoán xs",
    "cho vay", "vay tiền", "giải ngân", "tín dụng", "vay tín chấp",
    "tuyển ctv", "tuyển cộng tác viên", "việc làm tại nhà", "kiếm tiền online", "thu nhập", "việc nhẹ lương",
    "bán tool", "hack like", "tăng follow", "tăng like", "buff like", "dịch vụ fb", "dịch vụ zalo",
    "xả kho", "thanh lý", "giảm giá", "chạy ads", "chạy quảng cáo",
    "bán tk", "bán nick", "mua bán tài khoản", "thu mua acc", "bán acc",
    "nổ hũ", "tài xỉu", "cá cược", "casino", "baccarat", "kubet", "thabet", "sunwin", "go88", "bóng đá",
    "nhóm kín", "link nhóm", "tham gia nhóm", "vô nhóm", "vào nhóm",
    "khóa học", "đào tạo", "chứng khoán", "đầu tư", "forex", "crypto", "tiền ảo",
    "tut", "trick", "nhận dame", "nhận die"
  ];
  
  const normalizedContent = normalizeText(content);
  for (const adWord of adsWords) {
    if (normalizedContent.includes(normalizeText(adWord))) {
      return { found: true, word: adWord };
    }
  }

  // Bắt các mẫu tin rác bán tài khoản, thu mua bank/zalo, dịch vụ, kiếm tiền online, link nhóm zalo
  const adsRegex = /(\d+\s*k\s*\/\s*(1|acc|tk|tài khoản|\d+\s*(tuần|tháng|năm|ngày)))|(thu\s+(sll|mua)\s+(zalo|tele|bank|tài khoản|acc))|(ib\s+nhận\s+sll)|(bảng\s+giá\s+dịch\s+vụ)|(chụp\s+bill)|(tut\s+(dame|die))|(zalo\.me\/g\/)|(vô\s+box)|(góp\s+acc)|(kiếm\s+tiền\s+online)|(telegram\s*:\s*@)/i;
  const match = normalizedContent.match(adsRegex);
  if (match) {
    return { found: true, word: match[0] };
  }

  return { found: false, word: null };
}

export async function handleAntiAdsCommand(api, message, groupSettings) {
  const content = removeMention(message);
  const threadId = message.threadId;
  const args = content.split(" ");
  const command = args[1]?.toLowerCase();
  const botId = api.getBotId();

  if (!groupSettings[threadId]) groupSettings[threadId] = {};

  if (command === "list") {
    const antiState = getAntiConfig(botId);
    const wordsList = antiState.adsWords || [];
    if (wordsList.length === 0) {
      await api.sendMessage({ msg: "Hiện tại chưa có từ quảng cáo nào.", quote: message }, threadId, message.type);
      return true;
    }
    await api.sendMessage(
      {
        msg: `📝 Danh sách từ quảng cáo bị cấm (${wordsList.length} từ):\n[${wordsList.join(", ")}]\n\n💡 Dùng lệnh:\n- antiads add [từ] để thêm\n- antiads remove [từ] để xóa`,
        quote: message,
        ttl: 30000,
      },
      threadId,
      message.type
    );
    return true;
  }

  if (command === "add" || command === "remove") {
    const word = args.slice(2).join(" ");
    if (!word) {
      await api.sendMessage({ msg: `Vui lòng nhập từ khóa cần ${command === "add" ? "thêm" : "xóa"}`, quote: message }, threadId, message.type);
      return true;
    }

    const antiState = getAntiConfig(botId);
    let currentAdsWords = antiState.adsWords || [];

    if (command === "add") {
      if (!currentAdsWords.includes(word)) {
        currentAdsWords.push(word);
        updateAntiConfig(botId, { ...antiState, adsWords: currentAdsWords });
        await api.sendMessage({ msg: `Đã thêm "${word}" vào danh sách từ quảng cáo`, quote: message, ttl: 30000 }, threadId, message.type);
      } else {
        await api.sendMessage({ msg: `Từ "${word}" đã có trong danh sách quảng cáo`, quote: message, ttl: 30000 }, threadId, message.type);
      }
    } else {
      const index = currentAdsWords.indexOf(word);
      if (index !== -1) {
        currentAdsWords.splice(index, 1);
        updateAntiConfig(botId, { ...antiState, adsWords: currentAdsWords });
        await api.sendMessage({ msg: `Đã xóa "${word}" khỏi danh sách từ quảng cáo`, quote: message, ttl: 30000 }, threadId, message.type);
      } else {
        await api.sendMessage({ msg: `Không tìm thấy "${word}" trong danh sách quảng cáo`, quote: message, ttl: 30000 }, threadId, message.type);
      }
    }
    return true;
  }

  if (command === "on") groupSettings[threadId].antiAds = true;
  else if (command === "off") groupSettings[threadId].antiAds = false;
  else groupSettings[threadId].antiAds = !groupSettings[threadId].antiAds;

  const newStatus = groupSettings[threadId].antiAds ? "bật" : "tắt";
  const caption = `Chức năng chống quảng cáo (anti-ads) đã được ${newStatus}!`;
  await sendMessageStateQuote(api, message, caption, groupSettings[threadId].antiAds, 300000);
  return true;
}

const adsWarningCount = {};

export async function antiAds(api, message, isAdminBox, groupSettings, botIsAdminBox, isSelf) {
  const threadId = message.threadId;
  const senderId = message.data.uidFrom;
  const senderName = message.data.dName;

  if (isSelf || isAdminBox || !botIsAdminBox || !groupSettings[threadId]?.antiAds) return false;
  if (isInWhiteList(groupSettings, threadId, senderId)) return false;

  let content = message.data.content;
  if (typeof content === 'object' && content !== null) {
    content = content.caption || content.title || "";
  }
  if (typeof content !== 'string') content = String(content || '');

  const result = checkAdsWords(api.getBotId(), content);
  if (result.found) {
    await deleteMessageCustomer(api, message);
    await api.sendMessage(
      {
        msg: `⚠️ Cảnh cáo ${senderName}!\nBạn đã vi phạm lỗi gửi quảng cáo (chứa từ: "${result.word}"). Tin nhắn của bạn đã bị xóa.`,
        quote: message,
        mentions: [MessageMention(senderId, senderName.length, "⚠️ Cảnh cáo ".length)],
        ttl: 30000,
      },
      threadId,
      MessageType.GroupMessage
    );
    return true;
  }
  return false;
}
