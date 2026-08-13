import { sendMessageStateQuote } from "../../service-ngh/chat-zalo/chat-style/chat-style.js";
import { getGlobalPrefix } from "../../service-ngh/service.js";
import { getUserInfoData } from "../../service-ngh/info-service/user-info.js";
import { isAdmin } from "../../index.js";
import { removeMention } from "../../utils/format-util.js";
import { createTraitCheckImage } from "../../utils/canvas/trait-check-canvas.js";
import { createMatchmakingImage } from "../../utils/canvas/matchmaking.js";
import { createMarriageStatusImage } from "../../utils/canvas/marriage-status-canvas.js";
import { loadMarriages, findMarriage } from "./hung-data.js";
import { registerMarriagePending, registerDivorcePending } from "./hung-reaction.js";

// =========================================================
// HELPERS
// =========================================================

function removeAccents(str = "") {
  return str
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/g, "d")
    .replace(/Đ/g, "D");
}

function normalizeKey(str = "") {
  return removeAccents(str).toLowerCase().replace(/[^a-z0-9]/g, "").trim();
}

function randomPercent(min = 0, max = 100) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function todayStr() {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function isValidDate(str) {
  return /^\d{4}-\d{2}-\d{2}$/.test(str) && !isNaN(new Date(str).getTime());
}

async function resolveUserInfo(api, uid, fallbackName) {
  try {
    const info = await getUserInfoData(api, uid);
    return {
      name: info?.name || info?.displayName || fallbackName || "Người dùng",
      avatar: info?.avatar || info?.avatarFull || null,
      gender: info?.gender || "Không xác định",
      birthday: info?.birthday || "Ẩn",
    };
  } catch {
    return { name: fallbackName || "Người dùng", avatar: null, gender: "Không xác định", birthday: "Ẩn" };
  }
}

// =========================================================
// DANH SÁCH TRAIT
// =========================================================

const TRAIT_GROUPS = {
  "Tính cách": {
    iq: "IQ", ngu: "Ngu", cute: "Cute", ngao: "Ngáo", luoi: "Lười",
    cham: "Chăm", ngoan: "Ngoan", hu: "Hư", hai: "Hài", toxic: "Toxic",
  },
  "Tình cảm": {
    simp: "Simp", chungtinh: "Chung Tình", langnhang: "Lăng Nhăng", dam: "Dâm",
  },
  "Ngoại hình": {
    deptrai: "Đẹp Trai", depgai: "Đẹp Gái", xau: "Xấu",
    namtinh: "Nam Tính", nutinh: "Nữ Tính",
  },
  "Tài chính": {
    giau: "Giàu", ngheo: "Nghèo",
  },
  "Vibe nhãn": {
    gay: "Gay", les: "Les",
  },
};

const TRAIT_INDEX = {};
for (const [group, traits] of Object.entries(TRAIT_GROUPS)) {
  for (const [key, label] of Object.entries(traits)) {
    TRAIT_INDEX[key] = { label, group };
  }
}

const TRAIT_COMMENTS = {
  iq: [
    "Não to như hố đen, xử lý mọi bài toán khó trong tích tắc, đúng chuẩn thiên tài ẩn danh 🧠",
    "IQ tạm ổn, đủ xài, thỉnh thoảng vẫn lú vài giây nhưng nhìn chung là ổn áp 🙂",
    "Não hơi trôi, hay lụi bài lung tung nhưng vẫn dễ thương theo cách riêng 😅",
  ],
  ngu: [
    "Ngu chấp cả vũ trụ, những câu hỏi cơ bản nhất cũng có thể trả lời sai theo cách khó đỡ 🤡",
    "Cũng hơi lú lú, hay quên trước quên sau nhưng chưa đến mức báo động 😂",
    "Không đến nỗi ngu đâu, chỉ là đôi lúc hơi đãng trí thôi 😌",
  ],
  cute: [
    "Dễ thương xỉu ngang, chỉ cần cười một cái là tan chảy cả đám đông xung quanh 🥺",
    "Cute vừa đủ xài, có duyên và dễ mến trong mắt người khác 😊",
    "Cứng rắn hơn là cute, phong cách mạnh mẽ cá tính là chính 😎",
  ],
  ngao: [
    "Ngáo đời cực mạnh, lời nói và hành động luôn khiến người xung quanh phải ngơ ngác hỏi lại 🤪",
    "Có chút ngơ ngác đáng yêu, đôi lúc trả lời trớt quớt nhưng vui tính 😵",
    "Tỉnh táo, không ngáo, suy nghĩ khá logic và chắc chắn 🧊",
  ],
  luoi: [
    "Lười xuất sắc, deadline nhìn thấy còn phải né qua chỗ khác vì sợ 🦥",
    "Lười có chọn lọc, việc thích thì làm cả ngày không mệt, việc ghét thì trốn tới cùng 😌",
    "Chăm hơn lười, luôn cố gắng hoàn thành việc đúng hạn 💪",
  ],
  cham: [
    "Chăm như con ong thợ, làm việc không ngừng nghỉ, deadline nào cũng về đích sớm 🐝",
    "Chăm vừa đủ để sống sót qua ngày, không quá xuất sắc nhưng ổn định 🙂",
    "Hơi lười, cần cố gắng thêm để đạt được mục tiêu đề ra 😅",
  ],
  ngoan: [
    "Ngoan như thiên thần, lễ phép và biết điều trong mọi tình huống 😇",
    "Ngoan có điều kiện, tuỳ tâm trạng mà lúc ngoan lúc không 🙂",
    "Hư hư một xíu, thích làm trái ý người khác cho vui 😏",
  ],
  hu: [
    "Hư từ trong trứng, luôn có trăm phương ngàn kế để phá đảo mọi quy tắc 😈",
    "Hư vừa phải, thỉnh thoảng nghịch ngợm nhưng vẫn biết giới hạn 😏",
    "Ngoan hơn hư, phần lớn thời gian đều rất biết điều 😇",
  ],
  hai: [
    "Hài vô đối, chỉ cần mở miệng là cả nhóm cười sảng, diễn viên hài mất việc vì có đối thủ 🤣",
    "Cũng có duyên hài đó, thỉnh thoảng chọc vài câu khiến mọi người bật cười 😄",
    "Nghiêm túc hơn hài, phong cách trầm tính điềm đạm là chính 🧐",
  ],
  toxic: [
    "Toxic cấp độ boss cuối, câu nói nào cũng có thể khiến người khác phải suy nghĩ lại cuộc đời 🐍",
    "Hơi toxic tí thôi, đôi khi nói thẳng làm người khác chột dạ nhưng không ác ý 😬",
    "Lành tính, không toxic, luôn cư xử nhẹ nhàng với mọi người xung quanh 🌱",
  ],
  simp: [
    "Simp chúa, sẵn sàng nạp thẻ cả tháng lương chỉ để đổi lấy một lời chào từ thần tượng 💸",
    "Cũng có chút simp, thỉnh thoảng chiều lòng người thương hơi quá đà 😌",
    "Tỉnh táo, không simp ai, luôn giữ được lý trí trong chuyện tình cảm 🧊",
  ],
  chungtinh: [
    "Chung tình từ A đến Z, trái tim chỉ hướng về một người duy nhất bất kể thời gian 💍",
    "Cũng khá chung thuỷ, biết trân trọng người bên cạnh mình 🙂",
    "Dễ xao động lắm nha, hay để ý người mới dù đang có đôi có cặp 👀",
  ],
  langnhang: [
    "Lăng nhăng có tiếng trong giới, danh sách người thương dài như một cuốn tiểu thuyết 😳",
    "Hơi bay bướm xíu, thích trò chuyện với nhiều người nhưng chưa hẳn có ý gì sâu xa 🦋",
    "Chung tình, không lăng nhăng, chỉ tập trung vào một mối quan hệ duy nhất 💯",
  ],
  dam: [
    "Độ dâm max level, chỉ cần vài câu đùa nhạy cảm là hưởng ứng nhiệt tình không ngại ngùng 😈",
    "Cũng hơi dâm dâm, thỉnh thoảng chọc ghẹo bạn bè bằng vài câu ẩn ý 😳",
    "Trong sáng, không dâm, cách nói chuyện luôn giữ chừng mực lịch sự 😇",
  ],
  deptrai: [
    "Đẹp trai xuất chúng, mỗi lần xuất hiện là hội chị em phải quay đầu nhìn theo 😎",
    "Ưa nhìn, tạm ổn, ngoại hình sáng sủa dễ gây thiện cảm 🙂",
    "Đậm chất cá tính hơn là đẹp trai truyền thống, phong cách riêng biệt khó lẫn 😅",
  ],
  depgai: [
    "Đẹp gái sáng cả khung hình, chỉ cần một tấm ảnh cũng đủ gây bão mạng xã hội 😍",
    "Xinh xắn dễ nhìn, gương mặt sáng và có duyên ngầm 🙂",
    "Cá tính hơn là đẹp truyền thống, phong cách nổi bật khó ai quên 😅",
  ],
  xau: [
    "Xấu tới mức diễn viên hài cũng phải nể phục độ hài hước tự nhiên trên gương mặt 🤡",
    "Bình thường thôi, không xấu, nhìn ưa mắt theo cách riêng 🙂",
    "Ưa nhìn mà, đâu có xấu, chỉ là chưa quen mắt lúc đầu thôi 😊",
  ],
  namtinh: [
    "Nam tính đúng chuẩn men, phong thái mạnh mẽ và đáng tin cậy trong mọi tình huống 💪",
    "Cũng khá nam tính, biết cách thể hiện bản thân một cách chững chạc 🙂",
    "Hơi mềm mại tí, phong cách nhẹ nhàng tinh tế hơn là mạnh mẽ 😌",
  ],
  nutinh: [
    "Nữ tính dịu dàng chuẩn công chúa, từng cử chỉ đều toát lên vẻ mềm mại đáng yêu 👑",
    "Cũng khá nữ tính, biết chăm chút cho vẻ ngoài của mình 🙂",
    "Cá tính mạnh hơn là nữ tính, phong cách độc lập và quyết đoán 😎",
  ],
  giau: [
    "Giàu nứt đố đổ vách, tài khoản ngân hàng chắc phải mở thêm vài số 0 mới đủ chỗ 💰",
    "Có tiềm năng làm giàu, biết cách quản lý tài chính khá tốt 📈",
    "Đang trên đường làm giàu, hiện tại vẫn còn phải cố gắng nhiều 😅",
  ],
  ngheo: [
    "Nghèo bền vững, ví tiền rỗng tuếch quanh năm suốt tháng nhưng tinh thần vẫn lạc quan 😭",
    "Tạm đủ sống, không dư dả nhưng cũng không đến nỗi thiếu thốn 🙂",
    "Không đến nỗi nghèo đâu, tài chính khá ổn định 😊",
  ],
  gay: [
    "Chuẩn gay luôn, gu thẩm mỹ và phong cách sống cực kỳ tinh tế 🌈",
    "Có hơi cong cong nha, đôi lúc thể hiện phong cách khá mềm mại 😅",
    "Vẫn men theo cách riêng, phong thái nam tính rõ rệt 😎",
  ],
  les: [
    "Les chính hiệu, phong cách cá tính và mạnh mẽ toát lên rõ rệt 💜",
    "Cũng hơi les đó, đôi lúc thể hiện phong cách hơi khác biệt 😆",
    "Nữ tính chuẩn bài, phong cách dịu dàng nữ tính đúng chuẩn 😍",
  ],
};

// Trait "tốt" -> admin mặc định 100%, trait "xấu" -> admin mặc định 0%.
// Riêng gay/les là vibe nhãn, không xếp tốt/xấu nên vẫn random như thường.
const ADMIN_GOOD_TRAITS = new Set([
  "iq", "cute", "cham", "ngoan", "hai", "chungtinh",
  "deptrai", "depgai", "namtinh", "nutinh", "giau",
]);
const ADMIN_BAD_TRAITS = new Set([
  "ngu", "ngao", "luoi", "hu", "toxic", "simp",
  "langnhang", "dam", "xau", "ngheo", "gay", "les",
]);

const GENERIC_COMMENTS = [
  "Đỉnh nóc kịch trần, mọi người xung quanh đều phải công nhận độ chất riêng 🔥",
  "Cũng tạm ổn đó, không quá nổi bật nhưng vẫn có nét riêng dễ nhận ra 🙂",
  "Còn phải cố gắng thêm nè, tiềm năng vẫn còn rất nhiều để khai phá 😅",
];

function pickComment(traitKey, percent) {
  const list = TRAIT_COMMENTS[traitKey] || GENERIC_COMMENTS;
  if (percent >= 70) return list[0];
  if (percent >= 35) return list[1];
  return list[2];
}

function resolveTraitLabel(raw) {
  const key = normalizeKey(raw);
  if (TRAIT_INDEX[key]) return { key, ...TRAIT_INDEX[key] };
  return { key: key || "vibe", label: raw.trim() || "Vibe", group: "Tự do" };
}

function getMentions(message) {
  return message.data?.mentions || [];
}

function getSenderUid(message) {
  return message.data?.uidFrom || message.senderID || message.sender_id || message.senderId;
}

// =========================================================
// 1) TRAIT (1 user) — ảnh canvas
// =========================================================

async function handleTraitCommand(api, message, traitRaw) {
  const threadId = message.threadId;
  const mentions = getMentions(message);
  const senderUid = getSenderUid(message);

  let targetUid;
  if (mentions.length === 0) {
    targetUid = senderUid;
  } else {
    targetUid = mentions[0].uid;
  }

  const userInfo = await resolveUserInfo(api, targetUid, mentions.length === 0 ? "Bạn" : "Người này");
  const trait = resolveTraitLabel(traitRaw);
  const isTargetAdmin = await isAdmin(api.getBotId(), targetUid);

  let percent;
  if (isTargetAdmin && ADMIN_GOOD_TRAITS.has(trait.key)) {
    percent = 100;
  } else if (isTargetAdmin && ADMIN_BAD_TRAITS.has(trait.key)) {
    percent = 0;
  } else {
    percent = randomPercent(0, 100);
  }
  const comment = pickComment(trait.key, percent);

  let imagePath = null;
  try {
    imagePath = await createTraitCheckImage(userInfo, trait.label, percent, comment);
    await api.sendMessage(
      {
        msg: `Kết quả phân tích "${trait.label}" của ${userInfo.name} là ${percent}%`,
        ttl: 600000,
        attachments: [imagePath],
        isUseProphylactic: true,
      },
      threadId,
      message.type
    );
  } catch (err) {
    console.log("Lỗi gửi ảnh trait:", err.message);
    await sendMessageStateQuote(api, message, `❌ Có lỗi khi tạo ảnh, vui lòng thử lại.`, false, 30000, false);
  }
}

// =========================================================
// 2) INFO (tổng quan tất cả nhóm) — text
// =========================================================

async function handleInfoCommand(api, message) {
  const mentions = getMentions(message);
  const senderUid = getSenderUid(message);

  const targetUid = mentions.length === 0 ? senderUid : mentions[0].uid;
  const userInfo = await resolveUserInfo(api, targetUid, mentions.length === 0 ? "Bạn" : "Người này");
  const isTargetAdmin = await isAdmin(api.getBotId(), targetUid);

  let lines = [`📋 TỔNG QUAN — ${userInfo.name}\n`];
  for (const [group, traits] of Object.entries(TRAIT_GROUPS)) {
    const keys = Object.keys(traits);
    const randomKey = keys[randomPercent(0, keys.length - 1)];
    let percent;
    if (isTargetAdmin && ADMIN_GOOD_TRAITS.has(randomKey)) {
      percent = 100;
    } else if (isTargetAdmin && ADMIN_BAD_TRAITS.has(randomKey)) {
      percent = 0;
    } else {
      percent = randomPercent(0, 100);
    }
    lines.push(`• ${group}: ${traits[randomKey]} — ${percent}%`);
  }
  lines.push(`\n✏️ Kết quả chỉ mang tính vui, không phán xét người thật.`);

  return sendMessageStateQuote(api, message, lines.join("\n"), false, 60000, false);
}

// =========================================================
// 3) COUPLE (2 user) — dùng lại canvas matchmaking
// =========================================================

async function handleCoupleCommand(api, message, kieu) {
  const mentions = getMentions(message);
  const senderUid = getSenderUid(message);

  let uidA, uidB;
  if (mentions.length >= 2) {
    uidA = mentions[0].uid;
    uidB = mentions[1].uid;
  } else if (mentions.length === 1) {
    uidA = senderUid;
    uidB = mentions[0].uid;
  } else {
    return sendMessageStateQuote(
      api, message,
      `❌ Thiếu người để ghép! Cú pháp: !hung ${kieu} @a [@b]`,
      false, 30000, false
    );
  }

  const infoA = await resolveUserInfo(api, uidA, "Người A");
  const infoB = await resolveUserInfo(api, uidB, "Người B");
  const percent = randomPercent(0, 100);

  const title = kieu === "tinhban" ? "🤝 ĐỘ HỢP BẠN THÂN 🤝" : "💖 TỈ LỆ HỢP ĐÔI 💖";
  const subtitle = kieu === "tinhban" ? "MỨC ĐỘ THÂN THIẾT" : "MỨC ĐỘ PHÙ HỢP";

  let imagePath = null;
  try {
    imagePath = await createMatchmakingImage(infoA, infoB, percent, title, subtitle);
    await api.sendMessage(
      {
        msg: `${infoA.name} + ${infoB.name}: ${percent}%`,
        ttl: 600000,
        attachments: [imagePath],
        isUseProphylactic: true,
      },
      message.threadId,
      message.type
    );
  } catch (err) {
    console.log("Lỗi gửi ảnh couple:", err.message);
    await sendMessageStateQuote(api, message, `❌ Có lỗi khi tạo ảnh, vui lòng thử lại.`, false, 30000, false);
  }
}

// =========================================================
// 4) KẾT HÔN / LY HÔN — có xác nhận bằng reaction ❤️
// =========================================================

async function handleKethonCommand(api, message, restArgs) {
  const mentions = getMentions(message);
  const senderUid = getSenderUid(message);
  const records = loadMarriages();

  const isCheckMode = restArgs[0] && normalizeKey(restArgs[0]) === "check";

  // !hung kethon check @tag -> xem tình trạng người khác
  if (isCheckMode) {
    if (mentions.length === 0) {
      return sendMessageStateQuote(api, message, `❌ Cú pháp: !hung kethon check @tag`, false, 30000, false);
    }
    const uid = mentions[0].uid;
    const record = findMarriage(records, uid);
    const userInfo = await resolveUserInfo(api, uid, "Người này");
    if (!record) {
      return sendMessageStateQuote(api, message, `💔 ${userInfo.name} hiện đang độc thân.`, false, 30000, false);
    }
    const partnerUid = record.uid1 === uid ? record.uid2 : record.uid1;
    const partnerInfo = await resolveUserInfo(api, partnerUid, "Người ấy");
    return sendMarriageCard(api, message, userInfo, partnerInfo, record.date);
  }

  // !hung kethon (không tag) -> xem giấy chứng nhận của bản thân
  if (mentions.length === 0) {
    const record = findMarriage(records, senderUid);
    if (!record) {
      return sendMessageStateQuote(
        api, message,
        `💔 Bạn hiện đang độc thân.\n📌 Cầu hôn ai đó: !hung kethon @tag [yyyy-mm-dd]`,
        false, 30000, false
      );
    }
    const partnerUid = record.uid1 === senderUid ? record.uid2 : record.uid1;
    const selfInfo = await resolveUserInfo(api, senderUid, "Bạn");
    const partnerInfo = await resolveUserInfo(api, partnerUid, "Người ấy");
    return sendMarriageCard(api, message, selfInfo, partnerInfo, record.date);
  }

  // !hung kethon @a [@b] [yyyy-mm-dd] -> cầu hôn / se duyên
  let uid1, uid2;
  if (mentions.length >= 2) {
    uid1 = mentions[0].uid;
    uid2 = mentions[1].uid;
  } else {
    uid1 = senderUid;
    uid2 = mentions[0].uid;
  }

  if (uid1 === uid2) {
    return sendMessageStateQuote(api, message, `❌ Không thể tự cầu hôn chính mình 😅`, false, 30000, false);
  }

  const existing1 = findMarriage(records, uid1);
  const existing2 = findMarriage(records, uid2);
  if (existing1 || existing2) {
    return sendMessageStateQuote(
      api, message,
      `❌ Một trong hai người đã kết hôn với người khác rồi 💔`,
      false, 30000, false
    );
  }

  let dateArg = restArgs.find((a) => isValidDate(a));
  const date = dateArg || todayStr();

  const info1 = await resolveUserInfo(api, uid1, "Người A");
  const info2 = await resolveUserInfo(api, uid2, "Người B");

  // Nếu chủ thớt tự cầu hôn 1 người (mentions.length === 1) thì chỉ cần người đó xác nhận.
  // Nếu chủ thớt se duyên 2 người khác (mentions.length >= 2) thì cần cả 2 xác nhận.
  const requiredUids = mentions.length >= 2 ? [uid1, uid2] : [uid2];

  const proposeText =
    mentions.length >= 2
      ? `💍 ${(await resolveUserInfo(api, senderUid, "Bạn")).name} muốn se duyên ${info1.name} và ${info2.name}!\nCả hai hãy thả ❤️ vào tin nhắn này để đồng ý kết hôn (cần cả 2 trong 5 phút).`
      : `💍 ${info1.name} muốn cầu hôn ${info2.name}!\nHãy thả ❤️ vào tin nhắn này để đồng ý kết hôn (trong 5 phút).`;

  const sent = await sendMessageStateQuote(api, message, proposeText, false, 300000, false);
  const msgId = sent?.message?.msgId?.toString();
  if (!msgId) {
    return sendMessageStateQuote(api, message, `❌ Có lỗi khi gửi yêu cầu, vui lòng thử lại.`, false, 30000, false);
  }

  registerMarriagePending({
    msgId,
    threadId: message.threadId,
    message,
    uidsRequired: requiredUids,
    uid1,
    uid2,
    date,
  });
}

async function sendMarriageCard(api, message, userInfoA, userInfoB, date) {
  let imagePath = null;
  try {
    imagePath = await createMarriageStatusImage(userInfoA, userInfoB, date);
    await api.sendMessage(
      { msg: "", ttl: 600000, attachments: [imagePath], isUseProphylactic: true },
      message.threadId,
      message.type
    );
  } catch (err) {
    console.log("Lỗi gửi ảnh hôn nhân:", err.message);
    await sendMessageStateQuote(api, message, `❌ Có lỗi khi tạo ảnh, vui lòng thử lại.`, false, 30000, false);
  }
}

async function handleLyhonCommand(api, message) {
  const senderUid = getSenderUid(message);
  const records = loadMarriages();
  const record = findMarriage(records, senderUid);

  if (!record) {
    return sendMessageStateQuote(api, message, `❌ Bạn hiện đang độc thân, không thể ly hôn.`, false, 30000, false);
  }

  const partnerUid = record.uid1 === senderUid ? record.uid2 : record.uid1;
  const senderInfo = await resolveUserInfo(api, senderUid, "Bạn");
  const partnerInfo = await resolveUserInfo(api, partnerUid, "Người ấy");

  const text =
    `💔 ${senderInfo.name} muốn ly hôn với ${partnerInfo.name}.\n` +
    `Hãy thả ❤️ vào tin nhắn này trong 5 phút để chấp nhận ly hôn.\n` +
    `(không thả tim = không đồng ý, lời huỷ tự huỷ)`;

  const sent = await sendMessageStateQuote(api, message, text, false, 300000, false);
  const msgId = sent?.message?.msgId?.toString();
  if (!msgId) {
    return sendMessageStateQuote(api, message, `❌ Có lỗi khi gửi yêu cầu, vui lòng thử lại.`, false, 30000, false);
  }

  registerDivorcePending({
    msgId,
    threadId: message.threadId,
    message,
    requiredUid: partnerUid,
    senderUid,
    partnerUid,
  });
}

// =========================================================
// MENU / HELP
// =========================================================

function buildHelpMessage(prefix) {
  return (
    `👑 HUNG BOT — PHÂN TÍCH VUI 👑\n\n` +
    `📌 Cú pháp: ${prefix}hung <trait> [@tag]\n` +
    `  • Không tag → phân tích chính bạn\n` +
    `  • Có tag → phân tích người được tag\n\n` +
    `🎯 TRAIT (1 user, ra ảnh), vài ví dụ:\n` +
    `  iq, ngu, cute, ngao, luoi, cham, ngoan, hu, hai, toxic,\n` +
    `  simp, chungtinh, langnhang, dam,\n` +
    `  deptrai, depgai, xau, namtinh, nutinh,\n` +
    `  giau, ngheo, gay, les\n` +
    `  📋 Tổng quan: ${prefix}hung info [@tag]\n\n` +
    `❤️ COUPLE (2 user, ra ảnh): ${prefix}hung <kieu> @a [@b]\n` +
    `  ghepdoi, tinhban\n\n` +
    `💍 KẾT HÔN (cần thả ❤️ xác nhận):\n` +
    `  • ${prefix}hung kethon @tag [yyyy-mm-dd] → cầu hôn (người kia xác nhận)\n` +
    `  • ${prefix}hung kethon @a @b [yyyy-mm-dd] → se duyên 2 người (cả 2 xác nhận)\n` +
    `  • ${prefix}hung kethon → xem giấy chứng nhận của bạn (ra ảnh)\n` +
    `  • ${prefix}hung kethon check @tag → xem tình trạng người khác (ra ảnh)\n` +
    `  • ${prefix}hung lyhon → ly hôn (đối phương xác nhận bằng ❤️)\n\n` +
    `✨ Gõ có dấu / không dấu / in hoa / khoảng trắng đều được.\n` +
    `📎 Lưu ý: Kết quả CHỈ MANG TÍNH VUI, không phán xét người thật.`
  );
}

// =========================================================
// ROUTER CHÍNH
// =========================================================

export async function handleHungCommand(api, message, aliasCommand) {
  const prefix = getGlobalPrefix(api.getBotId());
  const rawContent = removeMention(message) || "";
  const escapedPrefix = prefix.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const escapedAlias = String(aliasCommand || "hung").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const cmdRegex = new RegExp(`^\\s*${escapedPrefix}?${escapedAlias}\\s*`, "i");
  const argsStr = rawContent.replace(cmdRegex, "").trim();
  const args = argsStr.split(/\s+/).filter(Boolean);

  if (args.length === 0) {
    return sendMessageStateQuote(api, message, buildHelpMessage(prefix), false, 60000, false);
  }

  const firstKey = normalizeKey(args[0]);

  if (firstKey === "info") {
    return handleInfoCommand(api, message);
  }
  if (firstKey === "kethon") {
    return handleKethonCommand(api, message, args.slice(1));
  }
  if (firstKey === "lyhon" || firstKey === "lihon") {
    return handleLyhonCommand(api, message);
  }
  if (firstKey === "ghepdoi" || firstKey === "tinhban") {
    return handleCoupleCommand(api, message, firstKey);
  }

  return handleTraitCommand(api, message, args.join(" "));
}