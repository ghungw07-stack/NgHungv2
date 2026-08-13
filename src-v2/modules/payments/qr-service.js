import fs from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
import { Semaphore } from "../../core/semaphore.js";

function escapeXml(value) {
  return String(value).replace(/[<>&"']/g, (char) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", '"': "&quot;", "'": "&apos;" })[char]);
}

export class PaymentQrService {
  constructor({ rootDir, http, tempFiles, price = 80_000 }) {
    Object.assign(this, { rootDir, http, tempFiles, price });
    this.semaphore = new Semaphore(2, 10);
  }

  async bankAccount() {
    const raw = JSON.parse(await fs.readFile(path.join(this.rootDir, "assets/json-data/bank-info.json"), "utf8"));
    for (const value of Object.values(raw)) {
      const accounts = Array.isArray(value) ? value : Object.values(value || {});
      const account = accounts.find((item) => item?.bankBin && item?.accountNumber && item?.accountName);
      if (account) return account;
    }
    throw new Error("Chưa cấu hình tài khoản ngân hàng nhận thanh toán");
  }

  async create({ targetId, kind = "BOTPAY", amount = this.price, bank: suppliedBank, transferContent }) {
    return this.semaphore.run(async () => {
      const bank = suppliedBank || await this.bankAccount();
      if (!/^\d{6}$/.test(String(bank.bankBin)) || !/^\d{6,20}$/.test(String(bank.accountNumber))) {
        throw new Error("Thông tin ngân hàng không hợp lệ");
      }
      const content = String(transferContent || `${kind} ${String(targetId)}`).slice(0, 100);
      const url = new URL(`https://img.vietqr.io/image/${bank.bankBin}-${bank.accountNumber}-qr_only.png`);
      url.searchParams.set("amount", String(amount));
      url.searchParams.set("addInfo", content);
      url.searchParams.set("accountName", bank.accountName);
      const downloaded = this.tempFiles.path(".png");
      const output = this.tempFiles.path(".png");
      let completed = false;
      try {
        await this.http.download(url.href, downloaded, { maxBytes: 5 * 1024 * 1024 });
        const title = kind === "BOTPAY" ? "THANH TOÁN THUÊ BOT" : kind === "DONATE" ? "ỦNG HỘ GAME" : "CHUYỂN KHOẢN NGÂN HÀNG";
        const svg = `<svg width="1000" height="1400" xmlns="http://www.w3.org/2000/svg">
          <defs><linearGradient id="bg" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#071426"/><stop offset="1" stop-color="#102b4f"/></linearGradient></defs>
          <rect width="1000" height="1400" rx="56" fill="url(#bg)"/><rect x="70" y="210" width="860" height="860" rx="42" fill="#fff"/>
          <text x="500" y="105" text-anchor="middle" fill="#67e8f9" font-size="46" font-weight="700">NGH BOT</text>
          <text x="500" y="165" text-anchor="middle" fill="#fff" font-size="34">${title}</text>
          <text x="500" y="1155" text-anchor="middle" fill="#67e8f9" font-size="52" font-weight="700">${Number(amount).toLocaleString("vi-VN")}đ</text>
          <text x="500" y="1220" text-anchor="middle" fill="#fff" font-size="28">${escapeXml(bank.bankName || bank.bankBin)} • ${escapeXml(bank.accountName)}</text>
          <text x="500" y="1270" text-anchor="middle" fill="#cbd5e1" font-size="26">Nội dung: ${escapeXml(content)}</text>
          <text x="500" y="1330" text-anchor="middle" fill="#94a3b8" font-size="22">Quét QR và giữ nguyên nội dung chuyển khoản</text>
        </svg>`;
        const qr = await sharp(downloaded).resize(760, 760, { fit: "contain" }).png().toBuffer();
        await sharp(Buffer.from(svg)).composite([{ input: qr, left: 120, top: 260 }]).png().toFile(output);
        completed = true;
        return { path: output, content, bank };
      } finally {
        await this.tempFiles.remove(downloaded).catch(() => {});
        if (!completed) await this.tempFiles.remove(output).catch(() => {});
      }
    });
  }

  async send({ client, threadId, type, targetId, kind = "BOTPAY" }) {
    const card = await this.create({ targetId, kind });
    try {
      await client.api.sendMessage({ msg: "", attachments: [card.path] }, threadId, type);
    } finally {
      await this.tempFiles.remove(card.path).catch(() => {});
    }
  }
}
