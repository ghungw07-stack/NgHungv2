import { FONT_MAIN, removeMention } from "../../utils/format-util.js";
import { sendMessageFromSQL } from "../chat-zalo/chat-style/chat-style.js";
import { getGlobalPrefix } from "../service.js";
import { createCanvas, loadImage } from "canvas";
import axios from "axios";
import fs from "fs";
import path from "path";
import { deleteFile } from "../../utils/util.js";
import { MessageMention } from "../../api-zalo/index.js";
import { getUserInfoBasic } from "./user-info.js";
import { readFilePromise, writeFilePromise } from "../../utils/util.js";

const BANK_CODES = {
    "vcb": { bin: "970436", name: "VIETCOMBANK" },
    "vietcombank": { bin: "970436", name: "VIETCOMBANK" },
    "tcb": { bin: "970407", name: "TECHCOMBANK" },
    "techcombank": { bin: "970407", name: "TECHCOMBANK" },
    "mb": { bin: "970422", name: "MB BANK" },
    "mbbank": { bin: "970422", name: "MB BANK" },
    "mb bank": { bin: "970422", name: "MB BANK" },
    "acb": { bin: "970416", name: "ACB" },
    "vib": { bin: "970441", name: "VIB" },
    "bidv": { bin: "970418", name: "BIDV" },
    "vietinbank": { bin: "970415", name: "VIETINBANK" },
    "vtb": { bin: "970415", name: "VIETINBANK" },
    "tpbank": { bin: "970423", name: "TPBANK" },
    "vpbank": { bin: "970432", name: "VPBANK" },
    "agribank": { bin: "970405", name: "AGRIBANK" },
    "sacombank": { bin: "970403", name: "SACOMBANK" },
    "scb": { bin: "970429", name: "SCB" },
    "hdbank": { bin: "970437", name: "HDBANK" },
    "ocb": { bin: "970448", name: "OCB" },
    "msb": { bin: "970426", name: "MSB" },
    "maritimebank": { bin: "970426", name: "MSB" },
    "shb": { bin: "970443", name: "SHB" },
    "eximbank": { bin: "970431", name: "EXIMBANK" },
    "exim": { bin: "970431", name: "EXIMBANK" },
    "dongabank": { bin: "970406", name: "DONGABANK" },
    "dab": { bin: "970406", name: "DONGABANK" },
    "pvcombank": { bin: "970412", name: "PVCOMBANK" },
    "gpbank": { bin: "970408", name: "GPBANK" },
    "oceanbank": { bin: "970414", name: "OCEANBANK" },
    "namabank": { bin: "970428", name: "NAMABANK" },
    "ncb": { bin: "970419", name: "NCB" },
    "vietabank": { bin: "970427", name: "VIETABANK" },
    "vietbank": { bin: "970433", name: "VIETBANK" },
    "vrb": { bin: "970421", name: "VRB" },
    "wooribank": { bin: "970457", name: "WOORIBANK" },
    "uob": { bin: "970458", name: "UOB" },
    "standardchartered": { bin: "970410", name: "STANDARD CHARTERED" },
    "publicbank": { bin: "970439", name: "PUBLIC BANK" },
    "shinhanbank": { bin: "970424", name: "SHINHAN BANK" },
    "hsbc": { bin: "458761", name: "HSBC" },
    "coop": { bin: "970446", name: "COOPBANK" },
    "coopbank": { bin: "970446", name: "COOPBANK" },
    "lienvietpostbank": { bin: "970449", name: "LIENVIETPOSTBANK" },
    "lvb": { bin: "970449", name: "LIENVIETPOSTBANK" },
    "baovietbank": { bin: "970438", name: "BAOVIETBANK" },
    "bvb": { bin: "970438", name: "BAOVIETBANK" }
};

const BANK_INFO_FILE = path.join(process.cwd(), "assets", "json-data", "bank-info.json");

async function saveBankInfo(idUserZalo, serverId, bankBin, bankName, accountNumber, accountName) {
    try {
        let bankData = {};
        
        if (fs.existsSync(BANK_INFO_FILE)) {
            const fileContent = await readFilePromise(BANK_INFO_FILE);
            bankData = JSON.parse(fileContent);
        }
        
        const userKey = `${idUserZalo}_${serverId}`;
        
        bankData[userKey] = {
            bankBin,
            bankName,
            accountNumber,
            accountName,
            updatedAt: new Date().toISOString()
        };
        
        await writeFilePromise(BANK_INFO_FILE, JSON.stringify(bankData, null, 2));
        
        return { success: true };
    } catch (error) {
        console.error("Lỗi khi lưu thông tin ngân hàng:", error);
        return { success: false, error: error.message };
    }
}

async function getBankInfo(idUserZalo, serverId) {
    try {
        if (!fs.existsSync(BANK_INFO_FILE)) {
            return { success: false, message: "Chưa có thông tin ngân hàng được lưu" };
        }
        
        const fileContent = await readFilePromise(BANK_INFO_FILE);
        const bankData = JSON.parse(fileContent);
        
        const userKey = `${idUserZalo}_${serverId}`;
        
        if (bankData[userKey]) {
            return { success: true, data: bankData[userKey] };
        } else {
            return { success: false, message: "Chưa có thông tin ngân hàng được lưu" };
        }
    } catch (error) {
        console.error("Lỗi khi lấy thông tin ngân hàng:", error);
        return { success: false, error: error.message };
    }
}


function findAccountNumber(text) {
    const numbers = text.match(/\d+/g);
    if (!numbers) return null;

    return numbers[0];
}

function findBankCode(text) {
    const words = text.toLowerCase().split(/[\s,.-]+/);

    for (const word of words) {
        if (BANK_CODES[word]) {
            return {
                bin: BANK_CODES[word].bin,
                name: BANK_CODES[word].name,
                word
            };
        }
    }
    return null;
}

function normalizeAccountName(name) {
    const vietnameseMap = {
        'Đ': 'D',
        'đ': 'd'
    };

    return name
        .trim()
        .toUpperCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/[ĐĐ]/g, m => vietnameseMap[m] || m)
}

function normalizeDescription(name) {
    const vietnameseMap = {
        'Đ': 'D',
        'đ': 'd'
    };

    return name
        .trim()
        .toUpperCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/[ĐĐ]/g, m => vietnameseMap[m] || m)
        .replace(/[^A-Z0-9\s]/g, "");
}
function normalizeString(name) {
    const vietnameseMap = {
        'Đ': 'D',
        'đ': 'd'
    };

    return name
        .trim()
        .toUpperCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/[ĐĐ]/g, m => vietnameseMap[m] || m);
}

function generateVietQRLink(bankInfo, accountNumber, accountName, amount = 0, addInfo = "") {
    const baseUrl = "https://img.vietqr.io/image";
    const template = "qr_only";

    const encodedAccountName = encodeURIComponent(accountName);
    return `${baseUrl}/${bankInfo.bin}-${accountNumber}-${template}.jpg?accountName=${encodedAccountName}&amount=${amount}&addInfo=${addInfo}`;
}

function findAmount(text, accountNumber) {
    const numbers = text.match(/\d+/g) || [];
    return numbers.find(num => num !== accountNumber && num.length > 3) || 0;
}

function findTransferInfo(text, bankCode, accountNumber, amount) {
    return text
        .replace(bankCode, '')
        .replace(accountNumber, '')
        .replace(amount, '')
        .trim();
}

async function loadImageWithRetry(url, maxRetries = 3, timeout = 10000) {
    let lastError;

    for (let i = 0; i < maxRetries; i++) {
        try {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), timeout);

            const response = await fetch(url, {
                signal: controller.signal,
                timeout: timeout
            });

            if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
            const buffer = await response.arrayBuffer();
            clearTimeout(timeoutId);

            return await loadImage(Buffer.from(buffer));
        } catch (error) {
            lastError = error;
            console.error(`Lần thử ${i + 1} thất bại:`, error);
            await new Promise(resolve => setTimeout(resolve, 1000 * (i + 1))); // Exponential backoff
        }
    }
    throw lastError;
}

async function createBankCardImage(bankInfo, accountNumber, accountName, amount, description, qrCodeUrl, userInfo) {
    const width = 1000;
    const height = 400;
    const canvas = createCanvas(width, height);
    const ctx = canvas.getContext("2d");

    try {
        // Vẽ avatar làm background
        let backgroundImage;
        try {
            backgroundImage = await loadImageWithRetry(userInfo.avatar);
            ctx.filter = 'blur(8px)';
            ctx.drawImage(backgroundImage, 0, 0, width, height);
            ctx.filter = 'none';
        } catch (error) {
            console.error("Lỗi khi load avatar:", error);
            const gradient = ctx.createLinearGradient(0, 0, width, height);
            gradient.addColorStop(0, "#1a237e");
            gradient.addColorStop(1, "#0d47a1");
            ctx.fillStyle = gradient;
            ctx.fillRect(0, 0, width, height);
        }

        const overlay = ctx.createLinearGradient(0, 0, width, height);
        overlay.addColorStop(0, "rgba(26, 35, 126, 0.3)");
        overlay.addColorStop(1, "rgba(13, 71, 161, 0.3)");
        ctx.fillStyle = overlay;
        ctx.fillRect(0, 0, width, height);

        const qrImage = await loadImageWithRetry(qrCodeUrl);

        const qrSize = 300;
        const qrPadding = 50;

        // Vẽ khung cho QR code
        ctx.save();
        ctx.shadowColor = 'rgba(0, 0, 0, 0.5)';
        ctx.shadowBlur = 15;
        ctx.shadowOffsetX = 5;
        ctx.shadowOffsetY = 5;
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(qrPadding - 10, (height - qrSize) / 2 - 10, qrSize + 20, qrSize + 20);
        ctx.restore();

        // Vẽ QR code
        ctx.drawImage(qrImage, qrPadding, (height - qrSize) / 2, qrSize, qrSize);

        // Vẽ đường phân cách
        ctx.beginPath();
        ctx.moveTo(qrSize + qrPadding * 2, 50);
        ctx.lineTo(qrSize + qrPadding * 2, height - 50);
        ctx.strokeStyle = "rgba(255, 255, 255, 0.3)";
        ctx.lineWidth = 2;
        ctx.stroke();

        // Vẽ thông tin ngân hàng
        ctx.textAlign = "left";
        const infoX = qrSize + qrPadding * 3;
        let infoY = 82;
        const lineHeight = 50;

        // Tạo gradient cho text
        const textGradient = ctx.createLinearGradient(infoX, 0, width - 50, 0);
        textGradient.addColorStop(0, "#ffd700");
        textGradient.addColorStop(1, "#ffeb3b");

        // Vẽ tiêu đề
        ctx.font = "bold 32px " + FONT_MAIN;
        ctx.fillStyle = textGradient;
        ctx.fillText("THÔNG TIN CHUYỂN KHOẢN", infoX, infoY);
        infoY += lineHeight;

        // Vẽ thông tin chi tiết
        ctx.font = "bold 28px " + FONT_MAIN;
        ctx.fillStyle = "#ffffff";

        const fields = [
            { label: "Ngân hàng:", value: bankInfo.name },
            { label: "Số tài khoản:", value: accountNumber },
            { label: "Chủ tài khoản:", value: accountName },
            { label: "Số tiền:", value: amount ? amount.toLocaleString('vi-VN') + ' VNĐ' : 'Không có' },
            { label: "Nội dung:", value: description ? (description.length > 20 ? description.substring(0, 20) + '...' : description) : 'Không có' }
        ];

        fields.forEach(field => {
            ctx.fillStyle = "rgba(255, 255, 255, 0.7)";
            ctx.fillText(field.label, infoX, infoY);

            const labelWidth = ctx.measureText(field.label).width;
            ctx.fillStyle = "#ffffff";
            ctx.fillText(field.value, infoX + labelWidth + 15, infoY);

            infoY += lineHeight;
        });

        // Lưu canvas thành file ảnh
        const filePath = path.resolve(`./assets/temp/bank_card_${Date.now()}.png`);
        const out = fs.createWriteStream(filePath);
        const stream = canvas.createPNGStream();
        stream.pipe(out);

        return new Promise((resolve, reject) => {
            out.on("finish", () => resolve(filePath));
            out.on("error", reject);
        });
    } catch (error) {
        console.error("Lỗi khi tạo ảnh bank card:", error);
        return null;
    }
}

export async function handleBankInfoCommand(api, message, aliasCommand) {
    const prefixGlobal = getGlobalPrefix(api.getBotId());
    const content = removeMention(message);
    const senderName = message.data.dName;
    const senderId = message.data.uidFrom;
    let stringCommand = content.replace(`${prefixGlobal}${aliasCommand}`, "").trim();
    let imagePath = "";
    try {

        if (!stringCommand) {
            const result = {
                success: false,
                message: `Vui lòng nhập thông tin ngân hàng theo định dạng:\n!bankinfo [Số tài khoản] [Tên ngân hàng] [Số Tiền Chuyển Khoản] (Nội Dung Chuyển Khoản)>(Tên Người Nhận)`
            };
            await sendMessageFromSQL(api, message, result, false, 15000);
            return;
        }

        const accountNumber = findAccountNumber(stringCommand);
        if (!accountNumber) {
            const result = {
                success: false,
                message: `Không tìm thấy số tài khoản trong nội dung.`
            };
            await sendMessageFromSQL(api, message, result, false, 15000);
            return;
        }
        stringCommand = stringCommand.replace(accountNumber, "").trim();

        const bankInfo = findBankCode(stringCommand);
        if (!bankInfo) {
            const words = stringCommand.toLowerCase().split(/\s+/);
            const suggestions = Object.entries(BANK_CODES)
                .filter(([key]) => {
                    const bankName = key.toLowerCase();
                    return words.some(word =>
                        bankName.includes(word) || word.includes(bankName)
                    );
                })
                .map(([_, info]) => info.name)
                .slice(0, 5);

            const uniqueSuggestions = [...new Set(suggestions)];
            const suggestionText = uniqueSuggestions.length > 0
                ? `\nCác ngân hàng gần giống:\n${uniqueSuggestions.join('\n')}`
                : '';

            const result = {
                success: false,
                message: `Không tìm thấy tên ngân hàng hợp lệ trong nội dung.${suggestionText}`
            };
            await sendMessageFromSQL(api, message, result, false, 15000);
            return;
        }

        stringCommand = normalizeString(stringCommand);
        stringCommand = stringCommand
            .replace(bankInfo.name.toUpperCase(), "")
            .replace(bankInfo.word.toUpperCase(), "")
            .trim();

        const amount = findAmount(stringCommand, accountNumber);

        const transferInfo = findTransferInfo(stringCommand, bankInfo.word, accountNumber, amount);

        let [description = "", accountName = "---"] = transferInfo.split(">");
        description = description || "";
        accountName = accountName !== "---" ? normalizeAccountName(accountName) : "---";

        const vietQRLink = generateVietQRLink(bankInfo, accountNumber, accountName, amount, description);
        const userInfo = await getUserInfoBasic(api, senderId);

        imagePath = await createBankCardImage(bankInfo, accountNumber, accountName, amount, description, vietQRLink, userInfo);

        if (!imagePath) {
            const result = {
                success: false,
                message: "Đã xảy ra lỗi khi tạo ảnh thông tin ngân hàng."
            };
            await sendMessageFromSQL(api, message, result, true, 15000);
            return;
        }

        await api.sendMessage({
            msg: `${senderName} đây là QR chuyển khoản mà bạn cần!!!`,
            ttl: 6000000,
            attachments: [imagePath],
            mentions: [MessageMention(senderId, senderName.length, 0)],
            isUseProphylactic: true
        }, message.threadId, message.type);

    } catch (error) {
        console.error("Lỗi khi xử lý lệnh bankinfo:", error);
        const result = {
            success: false,
            message: `Đã xảy ra lỗi khi xử lý thông tin ngân hàng.`
        };
        await sendMessageFromSQL(api, message, result, true, 15000);
    } finally {
        if (imagePath) {
            await deleteFile(imagePath);
        }
    }
}
// === HÀM HỖ TRỢ MỚI ===
async function getAllBankInfo(idUserZalo, serverId) {
    try {
        if (!fs.existsSync(BANK_INFO_FILE)) {
            return { success: false, message: "Chưa có thông tin ngân hàng được lưu" };
        }

        const fileContent = await readFilePromise(BANK_INFO_FILE);
        const bankData = JSON.parse(fileContent);
        const userKey = `${idUserZalo}_${serverId}`;

        if (bankData[userKey] && Array.isArray(bankData[userKey])) {
            return { success: true, data: bankData[userKey] };
        } else if (bankData[userKey]) {
            // Migrate old single object to array
            const oldData = bankData[userKey];
            bankData[userKey] = [oldData];
            await writeFilePromise(BANK_INFO_FILE, JSON.stringify(bankData, null, 2));
            return { success: true, data: [oldData] };
        } else {
            return { success: false, message: "Chưa có thông tin ngân hàng được lưu" };
        }
    } catch (error) {
        console.error("Lỗi khi lấy danh sách ngân hàng:", error);
        return { success: false, error: error.message };
    }
}

async function saveBankInfoArray(idUserZalo, serverId, bankBin, bankName, accountNumber, accountName) {
    try {
        let bankData = {};
        if (fs.existsSync(BANK_INFO_FILE)) {
            const fileContent = await readFilePromise(BANK_INFO_FILE);
            bankData = JSON.parse(fileContent);
        }

        const userKey = `${idUserZalo}_${serverId}`;
        if (!bankData[userKey] || !Array.isArray(bankData[userKey])) {
            bankData[userKey] = [];
        }

        // Kiểm tra trùng (bin + số TK)
        const exists = bankData[userKey].some(b =>
            b.bankBin === bankBin && b.accountNumber === accountNumber
        );
        if (exists) {
            return { success: false, message: "Ngân hàng này đã được lưu trước đó!" };
        }

        // Thêm mới
        bankData[userKey].push({
            bankBin,
            bankName,
            accountNumber,
            accountName,
            updatedAt: new Date().toISOString()
        });

        // Giới hạn 5 ngân hàng
        if (bankData[userKey].length > 5) {
            bankData[userKey].shift(); // Xóa ngân hàng cũ nhất
        }

        await writeFilePromise(BANK_INFO_FILE, JSON.stringify(bankData, null, 2));
        return { success: true };
    } catch (error) {
        console.error("Lỗi khi lưu thông tin ngân hàng:", error);
        return { success: false, error: error.message };
    }
}

async function removeBankInfoByIndex(idUserZalo, serverId, index) {
    try {
        if (!fs.existsSync(BANK_INFO_FILE)) {
            return { success: false, message: "Chưa có thông tin ngân hàng nào để xóa" };
        }

        const fileContent = await readFilePromise(BANK_INFO_FILE);
        const bankData = JSON.parse(fileContent);
        const userKey = `${idUserZalo}_${serverId}`;

        if (!bankData[userKey] || !Array.isArray(bankData[userKey]) || bankData[userKey].length === 0) {
            return { success: false, message: "Không có ngân hàng nào để xóa" };
        }

        const idx = parseInt(index) - 1;
        if (isNaN(idx) || idx < 0 || idx >= bankData[userKey].length) {
            return { success: false, message: "Số thứ tự không hợp lệ" };
        }

        bankData[userKey].splice(idx, 1);

        if (bankData[userKey].length === 0) {
            delete bankData[userKey];
        }

        await writeFilePromise(BANK_INFO_FILE, JSON.stringify(bankData, null, 2));
        return { success: true };
    } catch (error) {
        console.error("Lỗi khi xóa thông tin ngân hàng:", error);
        return { success: false, error: error.message };
    }
}
// === HÀM GỢI Ý NGÂN HÀNG (SỬA LỖI ReferenceError) ===
function getBankSuggestions(text) {
    const words = text.toLowerCase().split(/\s+/);
    const suggestions = Object.entries(BANK_CODES)
        .filter(([key]) => {
            const bankName = key.toLowerCase();
            return words.some(word =>
                bankName.includes(word) || word.includes(bankName)
            );
        })
        .map(([_, info]) => info.name)
        .slice(0, 5);

    const uniqueSuggestions = [...new Set(suggestions)];
    return uniqueSuggestions.length > 0
        ? `\nGợi ý: ${uniqueSuggestions.join(', ')}`
        : '';
}
export async function handleMyBankCommand(api, message, aliasCommand) {
    const prefixGlobal = getGlobalPrefix(api.getBotId());
    const content = removeMention(message);
    const senderName = message.data.dName;
    const senderId = message.data.uidFrom;
    const botId = api.getBotId();
    let stringCommand = content.replace(`${prefixGlobal}${aliasCommand}`, "").trim().toLowerCase();

    try {
        // === XỬ LÝ LỆNH SET ===
        if (stringCommand.startsWith("set ")) {
            const input = content.replace(`${prefixGlobal}${aliasCommand} set`, "").trim();
            if (!input) {
                await sendMessageFromSQL(api, message, {
                    success: false,
                    message: `Vui lòng nhập thông tin ngân hàng theo định dạng:\n!mybank set [Số tài khoản] [Tên ngân hàng] [Tên chủ tài khoản]`
                }, false, 15000);
                return;
            }

            const accountNumber = findAccountNumber(input);
            if (!accountNumber) {
                await sendMessageFromSQL(api, message, { success: false, message: "Không tìm thấy số tài khoản." }, false, 15000);
                return;
            }
            let temp = input.replace(accountNumber, "").trim();

            const bankInfo = findBankCode(temp);
            if (!bankInfo) {
                const suggestions = getBankSuggestions(temp);
                await sendMessageFromSQL(api, message, {
                    success: false,
                    message: `Không tìm thấy ngân hàng hợp lệ.${suggestions}`
                }, false, 15000);
                return;
            }

            temp = normalizeString(temp).replace(bankInfo.name.toUpperCase(), "").replace(bankInfo.word.toUpperCase(), "").trim();
            const accountName = temp || "---";
            const normalizedAccountName = accountName !== "---" ? normalizeAccountName(accountName) : "---";

            if (normalizedAccountName === "---") {
                await sendMessageFromSQL(api, message, { success: false, message: "Vui lòng nhập tên chủ tài khoản." }, false, 15000);
                return;
            }

            const saveResult = await saveBankInfoArray(senderId, botId, bankInfo.bin, bankInfo.name, accountNumber, normalizedAccountName);
            if (saveResult.success) {
                await sendMessageFromSQL(api, message, {
                    success: true,
                    message: `Đã lưu ngân hàng thành công!\n\nNgân hàng: ${bankInfo.name}\nSố TK: ${accountNumber}\nChủ TK: ${normalizedAccountName}\n\nDùng !mybank list để xem danh sách.`
                }, false, 15000);
            } else {
                await sendMessageFromSQL(api, message, { success: false, message: saveResult.message || "Lỗi lưu ngân hàng." }, false, 15000);
            }
            return;
        }

        // === XỬ LÝ LỆNH LIST ===
        if (stringCommand === "list" || stringCommand === "") {
            const result = await getAllBankInfo(senderId, botId);
            if (!result.success) {
                await sendMessageFromSQL(api, message, {
                    success: false,
                    message: `${result.message}\n\nDùng: !mybank set [STK] [Ngân hàng] [Tên] để thêm.`
                }, false, 15000);
                return;
            }

            const banks = result.data;
            let msg = `Danh sách ngân hàng của ${senderName} (tối đa 5):\n\n`;
            banks.forEach((b, i) => {
                msg += `${i + 1}. ${b.bankName}\n   STK: ${b.accountNumber}\n   Chủ TK: ${b.accountName}\n\n`;
            });
            msg += `Gửi: ${prefixGlobal}${aliasCommand} <STT>\nXóa: ${prefixGlobal}${aliasCommand} remove <STT>\nThêm: ${prefixGlobal}${aliasCommand} set [STK] [Ngân hàng] [Tên]`;

            await sendMessageFromSQL(api, message, { success: true, message: msg }, false, 60000);
            return;
        }

        // === XỬ LÝ LỆNH REMOVE ===
        if (stringCommand.startsWith("remove ")) {
            const index = stringCommand.replace("remove ", "").trim();
            const removeResult = await removeBankInfoByIndex(senderId, botId, index);
            if (removeResult.success) {
                await sendMessageFromSQL(api, message, {
                    success: true,
                    message: `Đã xóa ngân hàng ${index} thành công!`
                }, false, 15000);
            } else {
                await sendMessageFromSQL(api, message, {
                    success: false,
                    message: removeResult.message
                }, false, 15000);
            }
            return;
        }

        // === XỬ LÝ GỬI THEO STT (hoặc mặc định là 1) ===
        let targetIndex = 0;
        if (stringCommand && !isNaN(stringCommand)) {
            targetIndex = parseInt(stringCommand) - 1;
        }

        const bankList = await getAllBankInfo(senderId, botId);
        if (!bankList.success || bankList.data.length === 0) {
            await sendMessageFromSQL(api, message, {
                success: false,
                message: "Bạn chưa lưu ngân hàng nào!\nDùng: !mybank set [STK] [Ngân hàng] [Tên]"
            }, false, 15000);
            return;
        }

        if (targetIndex < 0 || targetIndex >= bankList.data.length) {
            await sendMessageFromSQL(api, message, {
                success: false,
                message: `Số thứ tự không hợp lệ. Bạn có ${bankList.data.length} ngân hàng.`
            }, false, 15000);
            return;
        }

        const selectedBank = bankList.data[targetIndex];
        await api.sendBankCard(message, selectedBank.bankBin, selectedBank.accountNumber, selectedBank.accountName, 6000000);

    } catch (error) {
        console.error("Lỗi khi xử lý lệnh mybank:", error);
        await sendMessageFromSQL(api, message, {
            success: false,
            message: "Đã xảy ra lỗi khi xử lý lệnh mybank."
        }, true, 15000);
    }
}