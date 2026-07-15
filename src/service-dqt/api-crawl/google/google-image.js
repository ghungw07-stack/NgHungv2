import { MessageMention } from "zlbotdqt";
import axios from "axios";
import fs from "fs";
import path from "path";
import * as cheerio from "cheerio";
import { getGlobalPrefix } from "../../service.js";
import { tempDir } from "../../../utils/io-json.js";
import { randomIDTemp, removeMention } from "../../../utils/format-util.js";
import { deleteFile, downloadFile } from "../../../utils/util.js";

const CONFIG = {
	paths: {
		saveDir: tempDir,
	},
	download: {
		maxAttempts: 10,
		timeout: 5000,
		minSize: 1024,
	},
	messages: {
		noQuery: (name, prefix, command) => `${name} Vui lòng nhập từ khóa tìm kiếm. Ví dụ: ${prefix}${command} anime girl`,
		searchResult: (name, query) => `[${name}] [${query}]`,
		downloadFailed: (name, attempts) => `${name} không thể tải ảnh sau ${attempts} lần thử. Vui lòng thử lại sau.`,
		noResults: (name) => `${name} không tìm thấy ảnh. Vui lòng thử lại sau.`,
		apiError: (name) => `${name} Lỗi khi tìm kiếm ảnh :(((.`,
		bannedKeyword: (name) => `${name} Từ khóa tìm kiếm này bị cấm!`,
	},
	headers: {
		'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
		'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
		'Accept-Language': 'vi-VN,vi;q=0.9,en-US;q=0.8,en;q=0.7',
		'Accept-Encoding': 'gzip, deflate, br',
		'Referer': 'https://www.google.com/',
		'Sec-Ch-Ua': '"Not_A Brand";v="8", "Chromium";v="120", "Google Chrome";v="120"',
		'Sec-Ch-Ua-Mobile': '?0',
		'Sec-Ch-Ua-Platform': '"Windows"',
		'Sec-Fetch-Dest': 'document',
		'Sec-Fetch-Mode': 'navigate',
		'Sec-Fetch-Site': 'same-origin',
		'Sec-Fetch-User': '?1',
		'Upgrade-Insecure-Requests': '1'
	},
	bannedKeywords: [
		// Từ nhạy cảm tiếng Việt
		"lồn", "l0n", "lon", "l.on", "l*n", "loz", "l0z", "l.z",
		"ngực", "nguc", "nguwc", "ngưc",
		"vú", "vu", "vếu", "veu", "du", "dú",
		"cặc", "cac", "cak", "kak", "cặk", "cứt", "cut", "shit",
		"buồi", "buoi", "b`uoi", "b.uoi",
		"địt", "dit", "đụ", "du", "đ!t", "đyt", "dyt",
		"đéo", "deo", "đít", "dit", "đ!t", "đụ", "du",
		"nứng", "nung", "nug", "nung",
		"bím", "bim", "b!m", "bịm", "bym",
		"chim", "ch1m", "chym",
		"mông", "mong", "m0ng", "m.ong",

		// Từ nhạy cảm tiếng Anh
		"sex", "sexy", "porn", "pornhub", "xxx", "18+",
		"dick", "cock", "penis", "pussy", "vagina", "boob", "breast",
		"nude", "naked", "hentai", "nsfw", "adult", "strip",
		"fuck", "fucking", "fck", "fuk", "fuking",
		"horny", "hot", "erotic", "ero",

		// Cụm từ
		"khiêu dâm", "khieu dam", "làm tình", "lam tinh",
		"gái gọi", "gai goi", "cave", "gái ngành", "gai nganh",
		"phim sex", "clip sex", "anh sex", "ảnh sex",
		"bộ ngực", "bo nguc", "vú to", "vu to",
		"show hàng", "show hang", "lộ hàng", "lo hang",
		"không mặc", "khong mac", "cởi đồ", "coi do",

		// Biến thể và viết tắt
		"ml", "đm", "dm", "vl", "vcl", "vlxx", "vlxxx",
		"cc", "cl", "đcm", "dcm", "cmm", "cdm", "đcmm",
		"s3x", "sexx", "sẽx", "sẽxx"
	]
};

export async function searchGoogleImages(query) {
	try {
		const params = new URLSearchParams({
			q: query,
			tbm: 'isch',
			hl: 'vi',
			safe: 'active'
		});

		const url = `https://www.google.com/search?${params.toString()}`;

		const response = await axios.get(url, {
			headers: CONFIG.headers,
			timeout: 15000,
			validateStatus: (status) => status === 200
		});

		const $ = cheerio.load(response.data);
		const images = new Set(); // Dùng Set để tránh trùng lặp

		// Phương pháp 1: Parse từ script tags với pattern mới
		$('script').each((i, element) => {
			const scriptContent = $(element).html();
			if (scriptContent) {
				try {
					// Pattern 1: Tìm trong var m={...}
					const startMatch = scriptContent.indexOf('var m={');
					if (startMatch !== -1) {
						const endMatch = scriptContent.indexOf('var a=m;', startMatch);
						if (endMatch !== -1) {
							const mContent = scriptContent.substring(startMatch + 6, endMatch).trim();
							const matches = mContent.match(/\["(https:\/\/[^"]+)",\s*(\d+),\s*(\d+)\]/g);
							if (matches) {
								matches.forEach(match => {
									try {
										const [url, width, height] = JSON.parse(match);
										if (url && width && height && 
											!url.startsWith('https://encrypted-tbn0.gst') &&
											!url.includes('googleusercontent.com/imgres') &&
											url.match(/\.(jpg|jpeg|png|gif|webp)/i)) {
											images.add(url);
										}
									} catch (e) {}
								});
							}
						}
					}

					// Pattern 2: Tìm trong AF_initDataCallback hoặc window._initData
					const afInitMatches = scriptContent.match(/AF_initDataCallback\([^)]+\)\s*\{[^}]*"https:\/\/[^"]+"/g);
					if (afInitMatches) {
						afInitMatches.forEach(match => {
							const urlMatches = match.match(/https:\/\/[^"]+\.(jpg|jpeg|png|gif|webp)/gi);
							if (urlMatches) {
								urlMatches.forEach(url => {
									if (!url.includes('encrypted-tbn') && !url.includes('imgres')) {
										images.add(url);
									}
								});
							}
						});
					}

					// Pattern 3: Tìm trong JSON.parse hoặc JSON.stringify
					const jsonMatches = scriptContent.match(/https:\/\/[^"'\s]+\.(jpg|jpeg|png|gif|webp)/gi);
					if (jsonMatches) {
						jsonMatches.forEach(url => {
							if (!url.includes('encrypted-tbn') && 
								!url.includes('imgres') &&
								!url.includes('googleusercontent.com/imgres') &&
								url.startsWith('http')) {
								images.add(url);
							}
						});
					}

					// Pattern 4: Tìm trong _setImagesSrc hoặc similar functions
					const setImagesMatches = scriptContent.match(/\["https:\/\/[^"]+",\d+,\d+\]/g);
					if (setImagesMatches) {
						setImagesMatches.forEach(match => {
							try {
								const parsed = JSON.parse(match);
								if (Array.isArray(parsed) && parsed[0] && typeof parsed[0] === 'string') {
									const url = parsed[0];
									if (url.match(/\.(jpg|jpeg|png|gif|webp)/i) &&
										!url.includes('encrypted-tbn') &&
										!url.includes('imgres')) {
										images.add(url);
									}
								}
							} catch (e) {}
						});
					}
				} catch (error) {
					// Bỏ qua lỗi parse
				}
			}
		});

		// Phương pháp 2: Parse từ thẻ img với data-src hoặc src
		$('img[data-src], img[src]').each((i, element) => {
			const imgSrc = $(element).attr('data-src') || $(element).attr('src');
			if (imgSrc && imgSrc.startsWith('http') && 
				imgSrc.match(/\.(jpg|jpeg|png|gif|webp)/i) &&
				!imgSrc.includes('encrypted-tbn') &&
				!imgSrc.includes('logo') &&
				!imgSrc.includes('icon')) {
				images.add(imgSrc);
			}
		});

		// Phương pháp 3: Parse từ các thẻ div với style background-image
		$('div[style*="background-image"]').each((i, element) => {
			const style = $(element).attr('style');
			if (style) {
				const urlMatch = style.match(/url\(['"]?(https:\/\/[^'")]+)['"]?\)/);
				if (urlMatch && urlMatch[1] && 
					urlMatch[1].match(/\.(jpg|jpeg|png|gif|webp)/i) &&
					!urlMatch[1].includes('encrypted-tbn')) {
					images.add(urlMatch[1]);
				}
			}
		});

		// Chuyển Set thành Array và lọc các URL hợp lệ
		const imageArray = Array.from(images).filter(url => {
			try {
				const urlObj = new URL(url);
				return urlObj.protocol === 'http:' || urlObj.protocol === 'https:';
			} catch {
				return false;
			}
		});

		console.log(`Tìm thấy ${imageArray.length} ảnh cho query: ${query}`);
		return imageArray.slice(0, 20);
	} catch (error) {
		console.error('Lỗi khi tìm kiếm ảnh Google:', error.message);
		return [];
	}
}

async function downloadAndSendImage(api, message, imageUrls, query) {
	const { threadId, type } = message;
	const senderId = message.data.uidFrom;
	const senderName = message.data.dName;

	let attempts = 0;
	let success = false;

	while (attempts < CONFIG.download.maxAttempts && !success) {
		const randomIndex = Math.floor(Math.random() * imageUrls.length);
		const imageUrl = imageUrls[randomIndex];
		const tempFileName = `google_${randomIDTemp()}.jpg`;
		const imagePath = path.join(CONFIG.paths.saveDir, tempFileName);

		try {
			await api.sendImage(imageUrl,
				message,
				CONFIG.messages.searchResult(senderName, query),
				300000
			);

			success = true;
		} catch (error) {
			console.error(`Lần thử ${attempts + 1} thất bại:`, error.message);
			attempts++;

			if (attempts === CONFIG.download.maxAttempts) {
				await api.sendMessage(
					{
						msg: CONFIG.messages.downloadFailed(senderName, CONFIG.download.maxAttempts),
						quote: message,
						mentions: [MessageMention(senderId, senderName.length, 0)],
						ttl: 30000
					},
					threadId,
					type
				);
			}
		} finally {
			await deleteFile(imagePath);
		}
	}
	return success;
}

export async function searchImageGoogle(api, message, command) {
	const content = removeMention(message);
	const senderId = message.data.uidFrom;
	const senderName = message.data.dName;
	const threadId = message.threadId;
	const prefix = getGlobalPrefix(api.getBotId());

	const query = content.replace(`${prefix}${command}`, "").trim().toLowerCase();

	if (!query) {
		await api.sendMessage(
			{
				msg: CONFIG.messages.noQuery(senderName, prefix, command),
				quote: message,
				mentions: [MessageMention(senderId, senderName.length, 0)],
				ttl: 30000
			},
			threadId,
			message.type
		);
		return;
	}

	const hasBannedKeyword = CONFIG.bannedKeywords.some(keyword =>
		query.includes(keyword.toLowerCase()) ||
		query.replace(/\s+/g, '').includes(keyword.toLowerCase())
	);

	if (hasBannedKeyword) {
		await api.sendMessage(
			{
				msg: CONFIG.messages.bannedKeyword(senderName),
				quote: message,
				mentions: [MessageMention(senderId, senderName.length, 0)],
				ttl: 30000
			},
			threadId,
			message.type
		);
		return;
	}

	try {
		const imageUrls = await searchGoogleImages(query);

		if (imageUrls.length === 0) {
			await api.sendMessage(
				{
					msg: CONFIG.messages.noResults(senderName),
					quote: message,
					mentions: [MessageMention(senderId, senderName.length, 0)],
					ttl: 30000
				},
				threadId,
				message.type
			);
			return;
		}

		await downloadAndSendImage(api, message, imageUrls, query);
	} catch (error) {
		console.error("Lỗi khi tìm kiếm ảnh:", error);
		await api.sendMessage(
			{
				msg: CONFIG.messages.apiError(senderName),
				quote: message,
				mentions: [MessageMention(senderId, senderName.length, 0)],
			},
			threadId,
			message.type
		);
	}
}
