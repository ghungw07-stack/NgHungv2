import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { savePlayerData } from "./dataManager.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const bankPath = path.join(__dirname, "data", "bank.json");

if (!fs.existsSync(path.dirname(bankPath))) fs.mkdirSync(path.dirname(bankPath), { recursive: true });
if (!fs.existsSync(bankPath)) fs.writeFileSync(bankPath, JSON.stringify({}, null, 2));

function loadBank() {
  try {
    return JSON.parse(fs.readFileSync(bankPath, "utf8"));
  } catch {
    return {};
  }
}

function saveBank(data) {
  fs.writeFileSync(bankPath, JSON.stringify(data, null, 2));
}

function secondsPassed(start) {
  return (Date.now() - start) / 1000;
}

function getBorrowLimit(level) {
  if (level < 20) return 0;
  if (level < 30) return 1_000_000;
  if (level < 40) return 2_000_000;
  if (level < 50) return 4_000_000;
  if (level < 60) return 6_000_000;
  if (level < 70) return 8_000_000;
  if (level < 80) return 10_000_000;
  if (level < 90) return 12_000_000;
  if (level < 100) return 15_000_000;
  return 20_000_000;
}

function resetPlayer(p) {
  p.money = 0;
  p.level = 0;
  p.exp = 0;
  p.inventory = {
    fish: {},
    baits: {},
    rods: [],
    tools: [],
    pets: [],
    potions: {},
    tickets: 0,
    skillCards: {},
  };
  p.equipment = { rod: null };
  return p;
}

// ==================== KIỂM TRA CHUNG ====================
function canUseBank(p, bank, allowRepayOnly = false) {
  if (!p) return { success: false, message: "Bạn chưa tham gia game." };
  if (p.level < 25)
    return { success: false, message: "❌ Bạn cần đạt cấp 25 mới có thể sử dụng ngân hàng." };

  const info = bank[p.uid] || {};
  if (allowRepayOnly) return { success: true };

  if (info.debt && info.debt.amount > 0)
    return { success: false, message: "⚠️ Bạn đang có khoản vay, chỉ có thể trả nợ hoặc xem thông tin." };

  return { success: true };
}

// ==================== LÃI & RESET ====================
export function checkBankInterest(allPlayers) {
  const bank = loadBank();
  let changed = false;

  for (const [uid, info] of Object.entries(bank)) {
    const p = allPlayers[uid];
    if (!p) continue;

    if (info.debt && info.debt.amount > 0) {
      const sec = secondsPassed(info.debt.start);
      if (sec >= 259200) {
        allPlayers[uid] = resetPlayer(p);
        delete bank[uid];
        console.log(`[BANK] ⚠️ Reset ${p.name} do không trả nợ sau 3 ngày`);
        changed = true;
      }
    }

    if (info.deposit && info.deposit.amount > 0) {
      const sec = secondsPassed(info.deposit.lastCheck || info.deposit.start);
      if (sec >= 3600) {
        const cycles = Math.floor(sec / 3600);
        const interestEachCycle = info.deposit.principal * 0.005 * cycles;
        info.deposit.interest = (info.deposit.interest || 0) + interestEachCycle;
        info.deposit.lastCheck = Date.now();
        changed = true;
      }
    }
  }

  if (changed) {
    saveBank(bank);
    savePlayerData(allPlayers);
  }
}

// ==================== CHỨC NĂNG CHÍNH ====================

// 💸 VAY TIỀN
export function borrowGold(uid, name, amount, allPlayers) {
  const p = allPlayers[uid];
  const bank = loadBank();
  const check = canUseBank(p, bank);
  if (!check.success) return check;
  if (amount <= 0 || isNaN(amount)) return { success: false, message: "Số tiền không hợp lệ." };

  const info = bank[uid] || {};
  if (info.debt && info.debt.amount > 0)
    return { success: false, message: "⚠️ Bạn đang có khoản nợ chưa trả!" };

  const limit = getBorrowLimit(p.level);
  if (limit === 0)
    return { success: false, message: "❌ Chỉ người chơi cấp 20 trở lên mới được vay tiền." };
  if (amount > limit)
    return { success: false, message: `⚠️ Giới hạn vay (Lv${p.level}) là ${limit.toLocaleString()} vàng.` };

  const fee = Math.floor(amount * 0.07);
  const received = amount - fee;
  p.money = (p.money || 0) + received;

  bank[uid] = { ...info, debt: { amount, start: Date.now() } };

  savePlayerData(allPlayers);
  saveBank(bank);

  return {
    success: true,
    message:
      `💰 Vay ${amount.toLocaleString()} vàng (phí 7% = ${fee.toLocaleString()} vàng, nhận ${received.toLocaleString()} vàng)\n` +
      `📅 Hạn trả: 3 ngày\n📈 Khi trả phải trả thêm 15% lãi (${(amount * 1.15).toLocaleString()} vàng)\n⏰ Quá hạn sẽ reset nhân vật.`,
  };
}

// 💵 TRẢ NỢ
export function repayDebt(uid, amount, allPlayers) {
  const p = allPlayers[uid];
  const bank = loadBank();
  const info = bank[uid];
  if (!info?.debt || info.debt.amount <= 0)
    return { success: false, message: "Bạn không có khoản nợ nào." };

  const totalOwed = Math.floor(info.debt.amount * 1.15);
  if (p.money < totalOwed)
    return { success: false, message: `⚠️ Bạn cần ${totalOwed.toLocaleString()} vàng để trả cả gốc và lãi.` };

  p.money -= totalOwed;
  delete info.debt;

  savePlayerData(allPlayers);
  saveBank(bank);

  return {
    success: true,
    message: `💸 Bạn đã trả ${totalOwed.toLocaleString()} vàng (bao gồm 15% lãi). 🎉 Hết nợ!`,
  };
}

// 💰 GỬI TIẾT KIỆM
export function depositGold(uid, amount, allPlayers) {
  const p = allPlayers[uid];
  const bank = loadBank();
  const check = canUseBank(p, bank);
  if (!check.success) return check;

  if (amount <= 0 || isNaN(amount)) return { success: false, message: "Số tiền không hợp lệ." };
  if (p.money < amount) return { success: false, message: "Không đủ tiền để gửi." };

  const info = bank[uid] || {};
  if (info.debt && info.debt.amount > 0)
    return { success: false, message: "⚠️ Bạn đang có khoản vay, không thể gửi tiết kiệm cho đến khi trả hết nợ." };

  p.money -= amount;
  info.deposit = {
    principal: (info.deposit?.principal || 0) + amount,
    interest: info.deposit?.interest || 0,
    amount: (info.deposit?.principal || 0) + amount,
    start: Date.now(),
    lastCheck: Date.now(),
  };

  bank[uid] = info;
  savePlayerData(allPlayers);
  saveBank(bank);
  return { success: true, message: `🏦 Gửi ${amount.toLocaleString()} vàng. Lãi đơn +0.5% mỗi giờ.` };
}

// 💎 RÚT TIẾT KIỆM
export function withdrawGold(uid, amount, allPlayers) {
  const p = allPlayers[uid];
  const bank = loadBank();
  const check = canUseBank(p, bank);
  if (!check.success) return check;

  const info = bank[uid];
  if (!info?.deposit || info.deposit.principal <= 0)
    return { success: false, message: "Không có tiền gửi." };

  const totalAvailable = info.deposit.principal + (info.deposit.interest || 0);
  if (amount === "all") amount = totalAvailable;
  if (amount > totalAvailable)
    return { success: false, message: "Không đủ số dư để rút." };

  p.money += amount;
  const remaining = totalAvailable - amount;

  if (remaining <= 0) delete info.deposit;
  else {
    const ratio = amount / totalAvailable;
    info.deposit.principal *= 1 - ratio;
    info.deposit.interest *= 1 - ratio;
  }

  savePlayerData(allPlayers);
  saveBank(bank);
  return { success: true, message: `💎 Rút ${amount.toLocaleString()} vàng (bao gồm cả lãi).` };
}

// 📊 THÔNG TIN NGÂN HÀNG
export function getInfo(uid, allPlayers) {
  const p = allPlayers[uid];
  const bank = loadBank();
  const info = bank[uid] || {};

  const money = p?.money || 0;
  const debt = info.debt?.amount || 0;
  const deposit = info.deposit?.principal || 0;
  const interest = info.deposit?.interest || 0;

  const remaining =
    info.debt && info.debt.start
      ? (3 * 24 - secondsPassed(info.debt.start) / 3600).toFixed(1)
      : null;

  let msg = `🏦 THÔNG TIN NGÂN HÀNG \n`;
  msg += `💰 Tiền mặt: ${money.toLocaleString()} vàng\n`;
  msg += `💳 Tiền gửi gốc: ${deposit > 0 ? deposit.toLocaleString() + " vàng" : "Không có"}\n`;
  msg += `💹 Lãi tạm tính: ${interest > 0 ? interest.toLocaleString() + " vàng" : "0"}\n`;
  msg += `💸 Nợ hiện tại: ${debt > 0 ? debt.toLocaleString() + " vàng" : "Không có"}\n`;
  if (remaining) msg += `⏰ Còn khoảng ${remaining} giờ trước khi bị reset\n`;
  msg += `\n📊 Phí vay: 7%\n📈 Lãi vay: 15% tính khi trả | Lãi gửi: +0.5% mỗi 1 giờ (lãi đơn)`;

  return { success: true, message: msg };
}
// 🧩 Lấy dữ liệu ngân hàng (cho phép file khác như index.js dùng)
export function loadBankPublic() {
  try {
    return JSON.parse(fs.readFileSync(bankPath, "utf8"));
  } catch {
    return {};
  }
}

// 💳 Kiểm tra người chơi có đang nợ không
export function isPlayerInDebt(uid) {
  try {
    const bank = JSON.parse(fs.readFileSync(bankPath, "utf8"));
    const info = bank[uid];
    return info?.debt && info.debt.amount > 0;
  } catch {
    return false;
  }
}
