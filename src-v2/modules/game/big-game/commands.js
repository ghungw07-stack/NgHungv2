import { formatMoney, parseAmount } from "../economy/amount.js";
import { BIG_GAMES, resolveBigGame } from "./definitions.js";

export function registerBigGameCommands(registry, { engine, players }) {
  for (const [name, definition] of Object.entries(BIG_GAMES)) {
    registry.register({
      name,
      category: "game",
      aliases: definition.aliases,
      description: `Đặt cược ${name}`,
      async execute({ args, senderId, message, reply }) {
        const action = String(args[0] || "help").toLowerCase();
        if (["help", "menu"].includes(action)) {
          await reply(`GAME ${name.toUpperCase()}\nDùng: !${name} <${definition.selections.join("|")}> <tiền>\nDùng: !${name} status`);
          return;
        }
        if (["status", "result", "kq"].includes(action)) {
          const round = await engine.current(name);
          if (!round) { await reply("Chưa có vòng cược đang mở."); return; }
          await reply(`Vòng ${round._id}\nCòn ${Math.max(0, Math.ceil((round.closesAt - Date.now()) / 1000))} giây\nCommit: ${round.commitment}`);
          return;
        }
        const amountArg = args[1];
        if (!amountArg) { await reply(`Dùng: !${name} <${definition.selections.join("|")}> <tiền>`); return; }
        const balance = await players.balance(senderId, message?.data?.dName);
        const amount = parseAmount(amountArg, balance);
        const bet = await engine.bet({
          game: name, userId: senderId, userName: message?.data?.dName || senderId,
          selection: action, amount,
        });
        await reply([
          `Đặt ${action.toUpperCase()} thành công: ${formatMoney(bet.stake)} coin`,
          `Còn ${bet.remainingSeconds} giây`,
          `Vòng: ${bet.roundId}`,
          `Commit: ${bet.commitment}`,
        ].join("\n"));
      },
    });
  }
}
