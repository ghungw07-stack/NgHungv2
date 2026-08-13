import crypto from "node:crypto";

const TAROT = [
  ["The Fool", "Khởi đầu mới, hãy bước đi nhưng vẫn quan sát rủi ro."],
  ["The Magician", "Bạn có đủ công cụ để biến ý tưởng thành hành động."],
  ["The High Priestess", "Hãy lắng nghe trực giác và dành thời gian suy ngẫm."],
  ["The Empress", "Năng lượng nuôi dưỡng và sáng tạo đang thuận lợi."],
  ["The Emperor", "Kỷ luật và cấu trúc sẽ giúp bạn tiến xa."],
  ["The Lovers", "Một lựa chọn quan trọng cần sự chân thành và đồng thuận."],
  ["The Chariot", "Tập trung mục tiêu và giữ vững hướng đi."],
  ["Strength", "Sự bình tĩnh và kiên nhẫn mạnh hơn phản ứng nóng vội."],
  ["The Hermit", "Tạm chậm lại để tìm câu trả lời từ chính mình."],
  ["Wheel of Fortune", "Hoàn cảnh đang thay đổi; hãy linh hoạt nắm cơ hội."],
  ["Justice", "Quyết định công bằng cần dựa trên sự thật và trách nhiệm."],
  ["The Star", "Hy vọng và khả năng hồi phục đang mở ra."],
  ["The Moon", "Thông tin chưa rõ ràng; đừng quyết định chỉ vì lo lắng."],
  ["The Sun", "Sự rõ ràng, niềm vui và hợp tác tích cực đang đến."],
  ["The World", "Một chu kỳ sắp hoàn tất; hãy ghi nhận thành quả."],
];
const JOKES = [
  "Lập trình viên đi biển mang theo gì? Một chiếc phao… exception.",
  "Tại sao máy tính lạnh? Vì nó mở quá nhiều Windows.",
  "Bug nói với feature: Chỉ cần marketing tốt, chúng ta sẽ là một.",
  "Mật khẩu mạnh nhất là mật khẩu bạn quên ngay sau khi đặt.",
  "Dev bảo ‘chạy trên máy em’ — server nghe xong chỉ biết im lặng.",
];

function dailyNumber(...values) {
  const day = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Ho_Chi_Minh" }).format(new Date());
  const digest = crypto.createHash("sha256").update(`${day}:${values.map(String).sort().join(":")}`).digest();
  return digest.readUInt32BE(0);
}
function mentionIds(message) { return [...new Set((message?.data?.mentions || []).map((item) => String(item.uid || item.id)).filter(Boolean))]; }

export function registerFunCommands(registry) {
  registry.register({
    name: "matchmaking", aliases: ["ghepdoi"], cooldownMs: 5_000, description: "Ghép đôi vui với người được tag",
    async execute({ message, senderId, reply }) {
      const other = mentionIds(message)[0]; if (!other) { await reply("Hãy tag một người để ghép đôi."); return; }
      const score = dailyNumber(senderId, other) % 101;
      await reply(`💞 Độ hợp nhau hôm nay: ${score}%\n${score >= 80 ? "Rất ăn ý!" : score >= 50 ? "Có tiềm năng, hãy trò chuyện thêm." : "Khác biệt cũng có thể tạo nên điều thú vị."}\nChỉ mang tính giải trí.`);
    },
  });
  registry.register({
    name: "social", aliases: ["hung"], description: "Các tương tác vui về tính cách và tình bạn",
    async execute({ args, message, senderId, reply }) {
      const action = args[0]?.toLowerCase() || "info"; const other = mentionIds(message)[0];
      if (["ghepdoi", "tinhban", "kethon"].includes(action)) {
        if (!other) { await reply("Hãy tag một người."); return; }
        const score = dailyNumber(action, senderId, other) % 101; await reply(`${action.toUpperCase()}: ${score}% — kết quả vui, không phải đánh giá thật.`); return;
      }
      const traits = ["điềm tĩnh", "sáng tạo", "hài hước", "kiên trì", "thẳng thắn", "ấm áp"];
      await reply(`Tính cách vui hôm nay: ${traits[dailyNumber(senderId) % traits.length]}. Chỉ mang tính giải trí.`);
    },
  });
  registry.register({
    name: "tarrot", aliases: ["tarot"], cooldownMs: 5_000, description: "Rút một lá Tarot giải trí",
    async execute({ senderId, reply }) {
      const card = TAROT[dailyNumber("tarot", senderId) % TAROT.length]; await reply(`🔮 ${card[0]}\n${card[1]}\nDiễn giải chỉ mang tính giải trí.`);
    },
  });
  registry.register({
    name: "truyencuoi", aliases: ["joke"], cooldownMs: 3_000, description: "Kể một câu chuyện cười ngắn",
    async execute({ senderId, reply }) { await reply(JOKES[dailyNumber("joke", senderId, Date.now() >> 16) % JOKES.length]); },
  });
  registry.register({
    name: "simphongthuy", description: "Xem vui phong thủy bốn số cuối",
    async execute({ args, reply }) {
      const digits = args.join("").replace(/\D/g, ""); if (digits.length < 4) { await reply("Dùng: !simphongthuy <số điện thoại>"); return; }
      const tail = digits.slice(-4); const score = dailyNumber("sim", tail) % 101;
      await reply(`Bốn số cuối: ${tail}\nĐiểm phong thủy vui: ${score}/100\nKhông dùng kết quả này cho quyết định tài chính.`);
    },
  });
  registry.register({
    name: "dinhgia", description: "Định giá số điện thoại mang tính giải trí",
    async execute({ args, reply }) {
      const digits = args.join("").replace(/\D/g, ""); if (digits.length < 8) { await reply("Dùng: !dinhgia <số điện thoại>"); return; }
      const repeated = [...digits].filter((digit, index) => digit === digits[index - 1]).length;
      const memorable = /(?:68|86|39|79|888|999)$/.test(digits) ? 2 : 1;
      const value = Math.min(500, 1 + repeated * 5 * memorable);
      await reply(`Định giá vui: khoảng ${value}.000đ. Đây không phải thẩm định thị trường hoặc tư vấn mua bán.`);
    },
  });
}

export { dailyNumber };
