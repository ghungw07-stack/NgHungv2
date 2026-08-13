import { formatMoney, parseAmount } from "./amount.js";

const MENU = `《 🎮 MENU TRÒ CHƠI 🎮 》

➤ Tra cứu & tài khoản:
『!game help』
• Daily, thẻ, hạng, chuyển tiền, biến động số dư...

➤ MiniGame:
『!game minigame』
• Minigame - Tham gia các game như PNTT, Nuôi Rồng, Hàng Loạt Các Game Cờ, Nông Trại Câu Cá....

➤ BigGame:
『!game biggame』
• Biggame - Tham gia các game đặt cược giải trí và phán đoán vận may`;

function dateKey() {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Ho_Chi_Minh" }).format(new Date());
}
function target(message, args) {
  return String(message?.data?.mentions?.[0]?.uid || args.find((item) => /^\d{6,}$/.test(item)) || "");
}

export function registerEconomyCommands(registry, { players }) {
  registry.register({
    name: "game",
    description: "Menu trò chơi và tài khoản game",
    async execute({ args, message, senderId, reply }) {
      const action = String(args[0] || "menu").toLowerCase();
      const name = message?.data?.dName || senderId;
      if (["menu", "help", "minigame", "biggame"].includes(action)) { await reply(MENU); return; }
      if (["bank", "balance", "sodu"].includes(action)) {
        await reply(`Số dư của bạn: ${formatMoney(await players.balance(senderId, name))} coin`);
        return;
      }
      if (action === "daily") {
        const result = await players.claimDaily(senderId, name, dateKey());
        await reply(result.claimed
          ? `Daily thành công: +${formatMoney(result.reward)} coin\nSố dư: ${formatMoney(result.balance)} coin`
          : "Bạn đã nhận daily hôm nay rồi.");
        return;
      }
      if (["transfer", "chuyen"].includes(action)) {
        const toId = target(message, args.slice(1));
        const amountArg = args.slice(1).find((item) => /^(?:\d+(?:\.\d+)?[kmbt]?|all)$/i.test(item));
        if (!toId || !amountArg) { await reply("Dùng: !game transfer @người_nhận <số tiền|all>"); return; }
        const balance = await players.balance(senderId, name);
        const result = await players.transfer(senderId, toId, parseAmount(amountArg, balance), { fromName: name });
        await reply(`Chuyển thành công ${formatMoney(result.amount)} coin.\nMã: ${result.reference}\nCòn lại: ${formatMoney(result.fromBalance)} coin`);
        return;
      }
      if (action === "top") {
        const rows = await players.top(10);
        await reply(["TOP TÀI SẢN", ...rows.map((row, i) => `${i + 1}. ${row.name} — ${formatMoney(row.balance.toString())}`)].join("\n"));
        return;
      }
      if (["history", "statement", "biendong"].includes(action)) {
        const rows = await players.history(senderId, 10);
        await reply(["BIẾN ĐỘNG SỐ DƯ", ...rows.map((row) => `• ${row.type}: ${formatMoney(row.amount.toString())}`)].join("\n"));
        return;
      }
      await reply(MENU);
    },
  });
  registry.register({ name: "bank", description: "Xem số dư game", execute: (context) => registry.resolve("game").execute({ ...context, args: ["bank"] }) });
  registry.register({ name: "daily", description: "Nhận thưởng hằng ngày", execute: (context) => registry.resolve("game").execute({ ...context, args: ["daily"] }) });
  registry.register({ name: "rank", description: "Xem bảng xếp hạng tài sản game", execute: (context) => registry.resolve("game").execute({ ...context, args: ["top"] }) });
  registry.register({
    name: "tier", aliases: ["hanggame", "gametier"], description: "Xem hạng tài sản game",
    async execute({ senderId, message, reply }) {
      const balance = await players.balance(senderId, message?.data?.dName);
      const amount = BigInt(balance);
      const tiers = [[10n ** 15n, "Kim Cương"], [10n ** 12n, "Bạch Kim"], [10n ** 9n, "Vàng"], [10n ** 6n, "Bạc"], [0n, "Đồng"]];
      const tier = tiers.find(([minimum]) => amount >= minimum)[1];
      await reply(`Hạng game: ${tier}\nTài sản: ${formatMoney(balance)} coin`);
    },
  });
}
