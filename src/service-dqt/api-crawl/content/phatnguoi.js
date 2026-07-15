import axios from "axios";
import sharp from 'sharp';
import * as cheerio from "cheerio";
import { sendMessageFromSQL } from "../../chat-zalo/chat-style/chat-style.js";
import { getGlobalPrefix } from "../../service.js";
import { removeMention } from "../../../utils/format-util.js";
import Tesseract from 'tesseract.js';

const CONFIG = {
	baseUrl: "https://www.csgt.vn",
	urlCaptcha: "https://www.csgt.vn/lib/captcha/captcha.class.php",
	headers: {
		"User-Agent":
			"Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
		"Accept-Language": "vi,vi-VN;q=0.9,fr-FR;q=0.8,fr;q=0.7,en-US;q=0.6,en;q=0.5,zh-TW;q=0.4,zh-CN;q=0.3,zh;q=0.2",
		Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7",
		Cookie: "_ga=GA1.1.1731549083.1737638798; PHPSESSID=nhq2hltpeju5abqierr5dlo696; _gtpk_testcookie..undefined=1; _gtpk_ref.4061.2d24=%5B%22%22%2C%22%22%2C1737663990%2C%22https%3A%2F%2Fwww.google.com%2F%22%5D; _gtpk_id.4061.2d24=100a376a0de4766d.1737638798.2.1737663996.1737663990.; _ga_LHSBE18PPX=GS1.1.1737663990.2.1.1737663996.0.0.0"
	},
};

// Hàm nhận diện loại xe từ biển số
function detectVehicleType(bienSo) {
	// Chuẩn hóa biển số - loại bỏ tất cả khoảng trắng và ký tự đặc biệt
	const normalizedPlate = bienSo.replace(/[-./\s]/g, "").toUpperCase();

	// Pattern cho xe máy:
	// [Hai số tỉnh thành][1 ký tự chữ cái và 1 ký tự số hoặc 2 ký tự chữ cái][4 số hoặc 5 số]
	const motorbikePatterns = [
		/^\d{2}[A-Z]\d{1}\d{5}$/, // VD: 29B123456
		/^\d{2}[A-Z][A-Z]\d{4}$/, // VD: 29BB1234
		/^\d{2}[A-Z][A-Z]\d{5}$/, // VD: 29BB12345
	];

	for (const pattern of motorbikePatterns) {
		if (pattern.test(normalizedPlate)) {
			return 2;
		}
	}

	return 1;
}

function isValidLicensePlate(bienSo) {
	const normalizedPlate = bienSo.replace(/[-./\s]/g, "").toUpperCase();

	if (normalizedPlate.length < 6 || normalizedPlate.length > 9) {
		return false;
	}

	const basicPattern = /^\d{2}[A-Z]/;
	if (!basicPattern.test(normalizedPlate)) {
		return false;
	}

	return true;
}

async function solveCaptcha() {
	try {
		const captchaResponse = await axios.get(CONFIG.urlCaptcha, {
			headers: CONFIG.headers,
			responseType: 'arraybuffer'
		});

		const processedBuffer = await sharp(captchaResponse.data)
			.resize({ width: 800 })
			.grayscale()
			.threshold(128)
			.negate()
			.linear(1.5, 0)
			.toBuffer();

		const { data: { text } } = await Tesseract.recognize(
			processedBuffer,
			'eng',
			{
				tessedit_char_whitelist: 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789',
				tessedit_pageseg_mode: 7,
			}
		);

		const captchaText = text.trim().replace(/\s/g, '');

		return captchaText;
	} catch (error) {
		console.error("Lỗi khi xử lý captcha:", error);
		throw error;
	}
}

async function getPhatNguoiInfo(bienSo, loaiXe = 1) {
	const MAX_RETRIES = 50;
	let attempt = 0;

	while (attempt < MAX_RETRIES) {
		try {
			const captchaText = await solveCaptcha();

			const checkUrl = `${CONFIG.baseUrl}/?mod=contact&task=tracuu_post&ajax`;

			const formData = new URLSearchParams();
			formData.append('BienKS', bienSo);
			formData.append('Xe', loaiXe);
			formData.append('captcha', captchaText);
			formData.append('ipClient', '9.9.9.91');
			formData.append('cUrl', '1');

			const checkResponse = await axios.post(checkUrl, formData, {
				headers: {
					...CONFIG.headers,
					'Content-Type': 'application/x-www-form-urlencoded'
				}
			});

			const checkResult = checkResponse.data;
			if (!checkResult.success) {
				attempt++;
				if (attempt >= MAX_RETRIES) {
					throw new Error('Đã thử lại nhiều lần nhưng captcha vẫn không chính xác');
				}
				continue;
			}

			const resultUrl = checkResult.href;
			const response = await axios.get(resultUrl, {
				headers: CONFIG.headers
			});

			const $ = cheerio.load(response.data);

			const violations = [];
			let currentViolation = null;

			$('#bodyPrint123 .form-group').each((index, element) => {
				const label = $(element).find('.control-label span').text().trim();
				const value = $(element).find('.col-md-9').text().trim();

				if (label === 'Biển kiểm soát:') {
					if (currentViolation) {
						violations.push(currentViolation);
					}
					currentViolation = {
						bienSo: '',
						mauBien: '',
						loaiXe: '',
						thoiGian: '',
						diaDiem: '',
						hanhViViPham: '',
						trangThai: '',
						donViPhatHien: '',
						noiGiaiQuyet: '',
						thongTinLienHe: []
					};
				}

				if (currentViolation) {
					switch (label) {
						case 'Biển kiểm soát:':
							currentViolation.bienSo = value;
							break;
						case 'Màu biển:':
							currentViolation.mauBien = value;
							break;
						case 'Loại phương tiện:':
							currentViolation.loaiXe = value;
							break;
						case 'Thời gian vi phạm:':
							currentViolation.thoiGian = value;
							break;
						case 'Địa điểm vi phạm:':
							currentViolation.diaDiem = value;
							break;
						case 'Hành vi vi phạm:':
							currentViolation.hanhViViPham = value;
							break;
						case 'Trạng thái:':
							currentViolation.trangThai = $(element).find('.badge').text().trim();
							break;
						case 'Đơn vị phát hiện vi phạm:':
							currentViolation.donViPhatHien = value;
							break;
						case 'Nơi giải quyết vụ việc:':
							currentViolation.noiGiaiQuyet = value;
							break;
						default:
							const text = $(element).text().trim();
							if (text && !text.includes('Biển kiểm soát:') && text.length > 0) {
								currentViolation.thongTinLienHe.push(text);
							}
					}
				}
			});

			if (currentViolation && currentViolation.bienSo) {
				violations.push(currentViolation);
			}

			return violations.filter(v => v.bienSo && v.thoiGian);

		} catch (error) {
			attempt++;
			if (attempt >= MAX_RETRIES || !error.message.includes('Captcha')) {
				throw error;
			}
			console.log(`Lần thử ${attempt}: Lỗi xử lý captcha, đang thử lại...`);
		}
	}
}

export async function handlePhatNguoiCommand(api, message, aliasCommand) {
	const content = removeMention(message);
	const prefix = getGlobalPrefix(api.getBotId());
	const keyword = content.replace(`${prefix}${aliasCommand}`, "").trim();

	if (!keyword) {
		const result = {
			success: false,
			message: "Vui lòng nhập biển số xe cần tra cứu!\n" +
				`Cú pháp: ${prefix}${aliasCommand} [biển số] [loại xe]\n` +
				`Loại xe: 1-Ô tô, 2-Xe máy\n` +
				`(Hoặc để trống để tự động nhận diện [có thể bị sai])\n` +
				`Ví dụ: ${prefix}${aliasCommand} 29A 12345\n` +
				`Hoặc: ${prefix}${aliasCommand} 29A12345 1`
		};
		await sendMessageFromSQL(api, message, result, true, 60000);
		return;
	}

	const args = keyword.split(" ");

	let bienSo, loaiXe;
	const lastArg = args[args.length - 1];

	if (args.length > 1 && ['1', '2', '3'].includes(lastArg)) {
		bienSo = args.slice(0, -1).join("").replace(/[-./\s]/g, "");
		loaiXe = parseInt(lastArg);
		if (loaiXe === 3) loaiXe = 2;
	} else {
		bienSo = args.join("").replace(/[-./\s]/g, "");
		loaiXe = detectVehicleType(bienSo);
	}

	if (!isValidLicensePlate(bienSo)) {
		const result = {
			success: false,
			message: "Biển số không hợp lệ! Vui lòng kiểm tra lại."
		};
		await sendMessageFromSQL(api, message, result, true, 30000);
		return;
	}

	try {
		const violations = await getPhatNguoiInfo(bienSo, loaiXe);

		if (violations.length === 0) {
			const result = {
				success: true,
				message: `🚗 Biển số ${bienSo} không có vi phạm nào!\n` +
					`Loại xe: ${loaiXe === 1 ? "Ô tô" : "Xe máy"} (${args.length > 1 && ['1', '2', '3'].includes(lastArg) ? "Chỉ định" : "Tự động nhận diện"})\n\n` +
					`Nguồn: Cổng thông tin điện tử Cục Cảnh sát giao thông`
			};
			await sendMessageFromSQL(api, message, result, true, 300000);
			return;
		}

		const headerMessage = `🚔 THÔNG TIN PHẠT NGUỘI 🚔\n` +
			`📝 Biển số: ${violations[0].bienSo}\n` +
			`🚗 Loại xe: ${loaiXe === 1 ? "Ô tô" : "Xe máy"} (${args.length > 1 && ['1', '2', '3'].includes(lastArg) ? "Chỉ định" : "Tự động nhận diện"})\n`
			+ `Màu Biển Số: ${violations[0].mauBien}\n`;

		const numberInMessage = 1;

		if (violations.length <= numberInMessage) {
			let responseMessage = headerMessage;
			violations.forEach((violation, index) => {
				responseMessage += formatViolation(violation, index);
			});
			responseMessage += `\nNguồn: Cổng thông tin điện tử Cục Cảnh sát giao thông`;

			const result = {
				success: true,
				message: responseMessage
			};
			await sendMessageFromSQL(api, message, result, true, 1800000);
		} else {
			let firstMessage = headerMessage;
			for (let i = 0; i < numberInMessage; i++) {
				firstMessage += formatViolation(violations[i], i);
			}
			firstMessage += `\nCòn tiếp...`;

			await sendMessageFromSQL(api, message, { success: true, message: firstMessage }, true, 1800000);

			for (let i = numberInMessage; i < violations.length; i += numberInMessage) {
				let batchMessage = `Tiếp theo...\n`;
				
				for (let j = i; j < i + numberInMessage && j < violations.length; j++) {
					batchMessage += formatViolation(violations[j], j);
				}
		
				if (i + numberInMessage >= violations.length) {
					batchMessage += `\nNguồn: Cổng thông tin điện tử Cục Cảnh sát giao thông`;
				} else {
					batchMessage += `\nCòn tiếp...`;
				}
				await new Promise((resolve) => setTimeout(resolve, 1000));
				await sendMessageFromSQL(api, message, { success: true, message: batchMessage }, true, 1800000);
			}
		}

	} catch (error) {
		console.error("Lỗi khi xử lý tra cứu phạt nguội:", error);
		const result = {
			success: false,
			message: "Đã xảy ra lỗi khi tra cứu thông tin phạt nguội. Vui lòng thử lại sau!"
		};
		await sendMessageFromSQL(api, message, result, true, 30000);
	}
}

function formatViolation(violation, index) {
	let violationMessage = `\n❗ Vi phạm ${index + 1}:\n`;
	violationMessage += `⏰ Thời gian: ${violation.thoiGian}\n`;
	violationMessage += `📍 Địa điểm: ${violation.diaDiem}\n`;
	violationMessage += `❌ Lỗi: ${violation.hanhViViPham}\n`;
	violationMessage += `⚠️ Trạng thái: ${violation.trangThai}\n`;
	violationMessage += `👮 Đơn vị phát hiện: ${violation.donViPhatHien}\n`;

	if (violation.thongTinLienHe.length > 0) {
		violationMessage += `📞 Thông tin liên hệ:\n`;
		violation.thongTinLienHe.forEach(info => {
			violationMessage += `   ${info}\n`;
		});
	}

	return violationMessage;
}
