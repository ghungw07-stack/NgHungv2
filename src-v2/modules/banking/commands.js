const BANKS = Object.freeze({
  vietinbank: ["970415", "VIETINBANK"], vietcombank: ["970436", "VIETCOMBANK"],
  bidv: ["970418", "BIDV"], agribank: ["970405", "AGRIBANK"], mbbank: ["970422", "MBBANK"],
  techcombank: ["970407", "TECHCOMBANK"], acb: ["970416", "ACB"], vpbank: ["970432", "VPBANK"],
  tpbank: ["970423", "TPBANK"], sacombank: ["970403", "SACOMBANK"],
});

function resolveBank(value) {
  const key = String(value || "").toLowerCase().replace(/[^a-z0-9]/g, "");
  if (/^\d{6}$/.test(key)) return [key, key];
  return BANKS[key] || null;
}

export function registerBankingCommands(registry, { accounts, client, paymentQr }) {
  registry.register({
    name: "mybank", description: "Lưu và gửi thông tin tài khoản ngân hàng",
    async execute({ args, senderId, message, reply }) {
      const action = args[0]?.toLowerCase() || "list";
      if (action === "set") {
        const bank = resolveBank(args[1]);
        const accountNumber = args[2];
        const accountName = args.slice(3).join(" ").trim().toUpperCase();
        if (!bank || !/^\d{6,20}$/.test(accountNumber || "") || accountName.length < 2) {
          await reply("Dùng: !mybank set <mã BIN|tên ngân hàng> <số tài khoản> <tên chủ tài khoản>"); return;
        }
        await accounts.add(senderId, { bankBin: bank[0], bankName: bank[1], accountNumber, accountName });
        await reply("Đã lưu tài khoản ngân hàng."); return;
      }
      if (action === "remove") {
        await reply(await accounts.remove(senderId, Number(args[1]) - 1) ? "Đã xóa tài khoản." : "Số thứ tự không hợp lệ."); return;
      }
      const rows = await accounts.list(senderId);
      if (action === "list") {
        await reply(rows.length ? ["TÀI KHOẢN ĐÃ LƯU", ...rows.map((row, index) => `${index + 1}. ${row.bankName} — ${row.accountNumber} — ${row.accountName}`)].join("\n") : "Chưa lưu tài khoản. Dùng !mybank set ..."); return;
      }
      const selected = rows[(Number(action) || 1) - 1];
      if (!selected) { await reply("Số thứ tự tài khoản không hợp lệ."); return; }
      await client.api.sendBankCard(message, selected.bankBin, selected.accountNumber, selected.accountName);
    },
  });
  registry.register({
    name: "qrbank", aliases: ["qrb"], cooldownMs: 5_000, description: "Tạo VietQR chuyển khoản",
    async execute({ args, senderId, threadId, type, reply }) {
      let bank, accountNumber, accountName, amount, content;
      if (/^\d+$/.test(args[0] || "") && args.length <= 3) {
        const selected = (await accounts.list(senderId))[Number(args[0]) - 1];
        if (selected) { bank = [selected.bankBin, selected.bankName]; accountNumber = selected.accountNumber; accountName = selected.accountName; amount = Number(args[1] || 0); content = args.slice(2).join(" "); }
      } else {
        bank = resolveBank(args[0]); accountNumber = args[1]; amount = Number(args[2] || 0);
        const parts = args.slice(3).join(" ").split("|").map((value) => value.trim());
        [accountName, content] = parts;
      }
      if (!bank || !/^\d{6,20}$/.test(accountNumber || "") || !accountName || !Number.isSafeInteger(amount) || amount < 0) {
        await reply("Dùng: !qrbank <BIN|bank> <STK> <số tiền> <tên chủ TK> | <nội dung>; hoặc !qrbank <STT đã lưu> <tiền> <nội dung>"); return;
      }
      const card = await paymentQr.create({ targetId: senderId, kind: "BANK", amount, bank: { bankBin: bank[0], bankName: bank[1], accountNumber, accountName }, transferContent: content || "CHUYEN KHOAN" });
      try { await client.api.sendMessage({ msg: "", attachments: [card.path] }, threadId, type); }
      finally { await paymentQr.tempFiles.remove(card.path).catch(() => {}); }
    },
  });
}

export { resolveBank };
