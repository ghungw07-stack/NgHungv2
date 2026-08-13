import crypto from "node:crypto";
import { formatMoney, parseAmount } from "../economy/amount.js";

const VIET_WORDS = [
  "việt nam", "hạnh phúc", "bình minh", "tình yêu", "gia đình", "thành công", "bạn bè", "mùa xuân",
  "quê hương", "hy vọng", "nụ cười", "tuổi trẻ", "ước mơ", "bầu trời", "dũng cảm", "kiên trì",
];
const KBB = ["keo", "bua", "bao"];
const beats = { keo: "bao", bua: "keo", bao: "bua" };
const randomItem = (items) => items[crypto.randomInt(items.length)];
const normalize = (value) => String(value || "").trim().toLowerCase().replace(/\s+/g, " ");

function scramble(value) {
  const chars = [...value.replace(/\s/g, "")];
  for (let i = chars.length - 1; i > 0; i--) {
    const j = crypto.randomInt(i + 1);
    [chars[i], chars[j]] = [chars[j], chars[i]];
  }
  const result = chars.join(" ");
  return result.replace(/\s/g, "") === value.replace(/\s/g, "") ? chars.reverse().join(" ") : result;
}

export function registerMiniGameCommands(registry, { sessions, players }) {
  registry.register({
    name: "doanso",
    category: "game",
    aliases: ["guess"],
    description: "Đoán số từ 1 đến 100",
    async execute({ args, threadId, senderId, message, reply }) {
      const action = String(args[0] || "").toLowerCase();
      if (action === "start") {
        const session = await sessions.create(threadId, "doanso", { secret: crypto.randomInt(1, 101), attempts: 0 }, 5 * 60_000);
        await reply(`Đã mở ván đoán số 1–100. Dùng !doanso <số>. Vòng ${session._id}`);
        return;
      }
      const guess = Number(action);
      if (!Number.isInteger(guess) || guess < 1 || guess > 100) { await reply("Dùng: !doanso start hoặc !doanso <1-100>"); return; }
      const session = await sessions.get(threadId, "doanso");
      if (!session) { await reply("Chưa có ván đoán số. Dùng !doanso start"); return; }
      if (guess === session.data.secret) {
        const won = await sessions.finish(session, "won", { winnerId: senderId, answer: guess });
        if (!won) throw new Error("Ván đã có người trả lời đúng");
        await players.creditOnce(senderId, "1000000", `doanso:${session._id}`, { name: message?.data?.dName });
        await reply(`Chính xác! Đáp án ${guess}. Bạn nhận ${formatMoney("1000000")} coin.`);
        return;
      }
      await sessions.update(session, { ...session.data, attempts: session.data.attempts + 1 });
      await reply(guess < session.data.secret ? "Số cần tìm lớn hơn." : "Số cần tìm nhỏ hơn.");
    },
  });

  registry.register({
    name: "noitu",
    category: "game",
    aliases: ["wordchain"],
    description: "Trò chơi nối từ",
    async execute({ args, threadId, senderId, reply }) {
      const value = normalize(args.join(" "));
      if (value.startsWith("start ")) {
        const word = value.slice(6).trim();
        if (word.split(" ").length < 2) { await reply("Dùng: !noitu start <cụm từ ít nhất 2 tiếng>"); return; }
        await sessions.create(threadId, "noitu", { current: word, used: [word], lastUserId: senderId }, 10 * 60_000);
        await reply(`Bắt đầu nối từ: ${word}`);
        return;
      }
      const session = await sessions.get(threadId, "noitu");
      if (!session) { await reply("Dùng: !noitu start <cụm từ>"); return; }
      if (session.data.lastUserId === senderId) { await reply("Hãy chờ người khác nối lượt này."); return; }
      const previous = session.data.current.split(" ").at(-1);
      const first = value.split(" ")[0];
      if (!value || first !== previous) { await reply(`Từ mới phải bắt đầu bằng “${previous}”.`); return; }
      if (session.data.used.includes(value)) { await reply("Cụm từ này đã được sử dụng."); return; }
      await sessions.update(session, { current: value, used: [...session.data.used.slice(-199), value], lastUserId: senderId });
      await reply(`Hợp lệ: ${value}`);
    },
  });

  registry.register({
    name: "vuatiengviet",
    category: "game",
    aliases: ["vtv"],
    description: "Sắp xếp chữ thành cụm từ tiếng Việt",
    async execute({ args, threadId, senderId, message, reply }) {
      const action = normalize(args.join(" "));
      if (action === "start") {
        const answer = randomItem(VIET_WORDS);
        const session = await sessions.create(threadId, "vuatiengviet", { answer, puzzle: scramble(answer) }, 3 * 60_000);
        await reply(`Sắp xếp lại: ${session.data.puzzle}\nDùng !vuatiengviet <đáp án>`);
        return;
      }
      const session = await sessions.get(threadId, "vuatiengviet");
      if (!session) { await reply("Dùng: !vuatiengviet start"); return; }
      if (action !== session.data.answer) { await reply("Chưa đúng, thử lại nhé."); return; }
      const won = await sessions.finish(session, "won", { winnerId: senderId });
      if (!won) throw new Error("Ván đã kết thúc");
      await players.creditOnce(senderId, "500000", `vtv:${session._id}`, { name: message?.data?.dName });
      await reply(`Chính xác: ${session.data.answer}. Thưởng ${formatMoney("500000")} coin.`);
    },
  });

  registry.register({
    name: "kbb",
    category: "game",
    aliases: ["keobuabao"],
    description: "Kéo búa bao có cược",
    async execute({ args, senderId, message, reply }) {
      const choice = normalize(args[0]);
      if (!KBB.includes(choice) || !args[1]) { await reply("Dùng: !kbb <keo|bua|bao> <tiền>"); return; }
      const balance = await players.balance(senderId, message?.data?.dName);
      const stake = parseAmount(args[1], balance);
      await players.debit(senderId, stake, { name: message?.data?.dName, game: "kbb" });
      const bot = randomItem(KBB);
      const result = choice === bot ? "draw" : beats[choice] === bot ? "win" : "lose";
      const payout = result === "win" ? stake.times(2) : result === "draw" ? stake : null;
      if (payout) await players.creditOnce(senderId, payout, `kbb:${crypto.randomUUID()}`, { game: "kbb" });
      await reply(`Bạn: ${choice.toUpperCase()} — Bot: ${bot.toUpperCase()}\n${result === "win" ? "Bạn thắng" : result === "draw" ? "Hòa" : "Bạn thua"}${payout ? ` — nhận ${formatMoney(payout)} coin` : ""}`);
    },
  });
}
