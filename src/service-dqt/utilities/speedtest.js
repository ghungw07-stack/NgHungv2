import speedTest from 'speedtest-net';
import { sendMessageCompleteRequest, sendMessageTag } from '../chat-zalo/chat-style/chat-style.js';
import fs from 'fs';
import path from 'path';
import { createCanvas, loadImage } from "canvas";
import * as cv from "../../utils/canvas/index.js";
import { deleteFile, loadImageBuffer } from '../../utils/util.js';
import { formatDate } from '../../utils/format-util.js';

const TIME_TO_LIVE_MESSAGE = 86400000;
const TEST_DURATION = 20000;

const SPEEDTEST_IMG_DIR = path.join(process.cwd(), "assets", "resources", "image", "speedtest");

const linkLogoISP = {
	"VNPT": path.join(SPEEDTEST_IMG_DIR, "Google.png"),
	"FPT Telecom": path.join(SPEEDTEST_IMG_DIR, "Google.png"),
	"Viettel": path.join(SPEEDTEST_IMG_DIR, "Google.png"),
	"Viettel Group": path.join(SPEEDTEST_IMG_DIR, "Google.png"),
	"CMC Telecom": path.join(SPEEDTEST_IMG_DIR, "Google.png"),
	"VNCloud": path.join(SPEEDTEST_IMG_DIR, "Google.png"),
	"Google Cloud": path.join(SPEEDTEST_IMG_DIR, "Google.png"),
	"Vpsttt Computer Company": path.join(SPEEDTEST_IMG_DIR, "Google.png"),
	"Hoang Dieu Cloud Computing Company": path.join(SPEEDTEST_IMG_DIR, "Google.png"),
	"CMC": path.join(SPEEDTEST_IMG_DIR, "Google.png.png"),
	"VNPT Group": path.join(SPEEDTEST_IMG_DIR, "Google.png"),
	"FPT": path.join(SPEEDTEST_IMG_DIR, "Google.png"),
};

const linkCoverIPS = {
	"VNPT": "https://i.postimg.cc/9MYVJ0wg/avt.jpg",
	"FPT Telecom": "https://i.postimg.cc/9MYVJ0wg/avt.jpg",
	"Viettel": "https://i.postimg.cc/9MYVJ0wg/avt.jpg",
	"CMC Telecom": "https://i.postimg.cc/9MYVJ0wg/avt.jpg",
	"Google Cloud": "https://i.postimg.cc/9MYVJ0wg/avt.jpg",
	"Vpsttt Computer Company": "https://i.postimg.cc/9MYVJ0wg/avt.jpg",
	"Hoang Dieu Cloud Computing Company": "https://i.postimg.cc/9MYVJ0wg/avt.jpg",
	"VNCloud": "https://i.postimg.cc/9MYVJ0wg/avt.jpg",
	"CMC": "https://i.postimg.cc/9MYVJ0wg/avt.jpg",
	"VNPT Group": "https://i.postimg.cc/9MYVJ0wg/avt.jpg",
	"FPT": "https://i.postimg.cc/9MYVJ0wg/avt.jpg",
	"Viettel Group": "https://i.postimg.cc/9MYVJ0wg/avt.jpg",
}

let isTestingSpeed = false;
let currentTester = { id: null, threadId: null, name: null };
let otherThreadRequester = {};

function evaluateSpeed(speed) {
	if (speed < 10) return "RÙA BÒ 🐌";
	if (speed < 30) return "HƠI CHẬM 🐢";
	if (speed < 60) return "ỔN ĐỊNH 🙂";
	if (speed < 100) return "NHANH 🚀";
	if (speed < 200) return "RẤT NHANH 🏎️";
	return "THẦN TỐC ⚡";
}

function drawCard(ctx, x, y, w, h, radius) {
	ctx.save();
	ctx.fillStyle = "rgba(15, 23, 42, 0.85)";
	ctx.shadowColor = "rgba(0, 0, 0, 0.8)";
	ctx.shadowBlur = 25;
	ctx.shadowOffsetY = 10;

	ctx.beginPath();
	ctx.roundRect(x, y, w, h, radius);
	ctx.fill();

	const borderGrad = ctx.createLinearGradient(x, y, x + w, y + h);
	borderGrad.addColorStop(0, "rgba(255, 255, 255, 0.2)");
	borderGrad.addColorStop(1, "rgba(255, 255, 255, 0.05)");
	ctx.strokeStyle = borderGrad;
	ctx.lineWidth = 1.5;
	ctx.stroke();
	ctx.restore();
}

function drawNeonBar(ctx, x, y, w, h, value, maxVal, colorStart, colorEnd) {
	ctx.fillStyle = "rgba(255, 255, 255, 0.1)";
	ctx.beginPath();
	ctx.roundRect(x, y, w, h, h / 2);
	ctx.fill();

	const ratio = Math.min(Math.max(value / maxVal, 0.05), 1);
	const fillW = w * ratio;

	const grad = ctx.createLinearGradient(x, y, x + fillW, y);
	grad.addColorStop(0, colorStart);
	grad.addColorStop(1, colorEnd);

	ctx.save();
	ctx.shadowColor = colorEnd;
	ctx.shadowBlur = 15;
	ctx.fillStyle = grad;
	ctx.beginPath();
	ctx.roundRect(x, y, fillW, h, h / 2);
	ctx.fill();
	ctx.restore();
}

function drawIconCircle(ctx, x, y, size, icon, color) {
	ctx.save();
	ctx.fillStyle = "rgba(255,255,255,0.08)";
	ctx.beginPath();
	ctx.arc(x, y, size / 2, 0, Math.PI * 2);
	ctx.fill();

	ctx.font = "normal " + size / 1.8 + "px 'BeVietnamPro'";
	ctx.textAlign = "center";
	ctx.textBaseline = "middle";
	ctx.fillStyle = color;
	ctx.fillText(icon, x, y + 3);
	ctx.restore();
}

export async function createSpeedTestImage(result) {
	const width = 1200, height = 650;
	const canvas = createCanvas(width, height);
	const ctx = canvas.getContext("2d");
	const ispName = result.isp || "Unknown ISP";

	const bg = ctx.createRadialGradient(width / 2, height / 2, 50, width / 2, height / 2, width);
	bg.addColorStop(0, "#172554");
	bg.addColorStop(1, "#020617");
	ctx.fillStyle = bg;
	ctx.fillRect(0, 0, width, height);

	ctx.save();
	ctx.strokeStyle = "rgba(56, 189, 248, 0.05)";
	ctx.lineWidth = 1;
	const hexSize = 60;
	for (let y = 0; y < height + hexSize; y += hexSize * 1.5) {
		for (let x = 0; x < width + hexSize; x += hexSize * Math.sqrt(3)) {
			ctx.beginPath();
			for (let i = 0; i < 6; i++) {
				ctx.lineTo(x + hexSize * Math.cos(i * Math.PI / 3), y + hexSize * Math.sin(i * Math.PI / 3));
			}
			ctx.stroke();
		}
	}
	ctx.restore();

	ctx.textAlign = "center";
	ctx.shadowColor = "#38bdf8";
	ctx.shadowBlur = 20;
	ctx.fillStyle = "#e0f2fe";
	ctx.font = "bold 52px 'BeVietnamPro'";
	ctx.fillText("KẾT QUẢ ĐO TỐC ĐỘ MẠNG", width / 2, 75);
	ctx.shadowBlur = 0;

	const margin = 50;
	const panelY = 110;
	const panelH = height - panelY - 80;
	const leftW = 350;
	const rightW = width - leftW - margin * 3;
	const rightX = margin * 2 + leftW;

	drawCard(ctx, margin, panelY, leftW, panelH, 25);

	const logoSize = 160;
	const logoX = margin + leftW / 2;
	const logoY = panelY + 130;

	ctx.beginPath();
	ctx.arc(logoX, logoY, logoSize / 2 + 10, 0, Math.PI * 2);
	const ringGrad = ctx.createLinearGradient(logoX - 100, logoY - 100, logoX + 100, logoY + 100);
	ringGrad.addColorStop(0, "#f472b6");
	ringGrad.addColorStop(1, "#22d3ee");
	ctx.strokeStyle = ringGrad;
	ctx.lineWidth = 5;
	ctx.stroke();

	ctx.save();
	ctx.beginPath();
	ctx.arc(logoX, logoY, logoSize / 2, 0, Math.PI * 2);
	ctx.clip();
	ctx.fillStyle = "#FFFFFF";
	ctx.fill();

	try {
		if (linkLogoISP[ispName] && linkLogoISP[ispName] !== "") {
			const logoImg = await loadImage(linkLogoISP[ispName]);
			const aspect = logoImg.width / logoImg.height;
			let drawW = logoSize * 0.8, drawH = logoSize * 0.8;
			if (aspect > 1) drawH = drawW / aspect;
			else drawW = drawH * aspect;
			ctx.drawImage(logoImg, logoX - drawW / 2, logoY - drawH / 2, drawW, drawH);
		} else {
			ctx.fillStyle = "#0f172a";
			ctx.font = "bold 24px 'Arial'";
			ctx.textAlign = "center";
			ctx.textBaseline = "middle";
			ctx.fillText("NHÀ MẠNG", logoX, logoY);
		}
	} catch {
		ctx.fillStyle = "#0f172a";
		ctx.fillText("ISP", logoX, logoY);
	}
	ctx.restore();

	ctx.textAlign = "center";
	ctx.textBaseline = "alphabetic";
	ctx.fillStyle = "#38bdf8";
	ctx.font = "bold 34px 'BeVietnamPro'";
	const [line1, line2] = cv.hanldeNameUser(ispName);
	ctx.fillText(line1, logoX, logoY + logoSize / 2 + 60);
	if (line2) {
		ctx.font = "bold 28px 'BeVietnamPro'";
		ctx.fillText(line2, logoX, logoY + logoSize / 2 + 95);
	}

	const authorName = process.env.AUTHOR_NAME || "Admin Bot";
	ctx.font = "normal 20px 'BeVietnamPro'";
	ctx.fillStyle = "#94a3b8";
	ctx.fillText("Designed by:", logoX, panelY + panelH - 60);

	ctx.font = "bold 28px 'BeVietnamPro'";
	const nameGrad = ctx.createLinearGradient(logoX - 50, 0, logoX + 50, 0);
	nameGrad.addColorStop(0, "#fbbf24");
	nameGrad.addColorStop(1, "#f59e0b");
	ctx.fillStyle = nameGrad;
	ctx.fillText(authorName, logoX, panelY + panelH - 25);

	drawCard(ctx, rightX, panelY, rightW, panelH, 25);

	const download = (result.download.bandwidth / 125000).toFixed(2);
	const upload = (result.upload.bandwidth / 125000).toFixed(2);

	let metricY = panelY + 50;
	const metricsLeftMargin = rightX + 40;
	const barWidth = rightW - 80;
	const metricsRightEdge = rightX + rightW - 40;

	ctx.textAlign = "left";
	ctx.fillStyle = "#4ade80";
	ctx.font = "bold 24px 'BeVietnamPro'";
	ctx.fillText("DOWNLOAD", metricsLeftMargin, metricY);

	ctx.textAlign = "right";
	ctx.font = "bold 56px 'BeVietnamPro'";
	ctx.shadowColor = "#4ade80"; ctx.shadowBlur = 15;
	ctx.fillText(download, metricsRightEdge - 70, metricY + 10);
	ctx.shadowBlur = 0;

	ctx.font = "normal 20px 'BeVietnamPro'";
	ctx.fillStyle = "#ffffff";
	ctx.fillText("Mbps", metricsRightEdge, metricY + 10);

	drawNeonBar(ctx, metricsLeftMargin, metricY + 25, barWidth, 14, parseFloat(download), 150, "#22c55e", "#86efac");

	metricY += 120;

	ctx.textAlign = "left";
	ctx.fillStyle = "#c084fc";
	ctx.font = "bold 24px 'BeVietnamPro'";
	ctx.fillText("UPLOAD", metricsLeftMargin, metricY);

	ctx.textAlign = "right";
	ctx.font = "bold 56px 'BeVietnamPro'";
	ctx.fillStyle = "#c084fc";
	ctx.shadowColor = "#c084fc"; ctx.shadowBlur = 15;
	ctx.fillText(upload, metricsRightEdge - 70, metricY + 10);
	ctx.shadowBlur = 0;

	ctx.font = "normal 20px 'BeVietnamPro'";
	ctx.fillStyle = "#ffffff";
	ctx.fillText("Mbps", metricsRightEdge, metricY + 10);

	drawNeonBar(ctx, metricsLeftMargin, metricY + 25, barWidth, 14, parseFloat(upload), 150, "#9333ea", "#d8b4fe");

	metricY += 80;
	const gridY = metricY;
	const col1 = metricsLeftMargin;
	const col2 = metricsLeftMargin + rightW / 2;
	const rowGap = 70;

	const ping = Math.round(result.ping.latency);
	const jitter = Math.round(result.ping.jitter);
	const loss = result.packetLoss ? result.packetLoss.toFixed(1) : "0";
	const server = result.server?.location || "N/A";

	drawIconCircle(ctx, col1 + 25, gridY + 25, 50, "📶", "#38bdf8");
	ctx.textAlign = "left";
	ctx.fillStyle = "#94a3b8"; ctx.font = "normal 20px 'BeVietnamPro'";
	ctx.fillText("Ping", col1 + 65, gridY + 15);
	ctx.fillStyle = "#FFFFFF"; ctx.font = "bold 26px 'BeVietnamPro'";
	ctx.fillText(`${ping} ms`, col1 + 65, gridY + 45);

	drawIconCircle(ctx, col2 + 25, gridY + 25, 50, "📉", "#fbbf24");
	ctx.fillStyle = "#94a3b8"; ctx.font = "normal 20px 'BeVietnamPro'";
	ctx.fillText("Jitter", col2 + 65, gridY + 15);
	ctx.fillStyle = "#FFFFFF"; ctx.font = "bold 26px 'BeVietnamPro'";
	ctx.fillText(`${jitter} ms`, col2 + 65, gridY + 45);

	const r2Y = gridY + rowGap + 10;
	drawIconCircle(ctx, col1 + 25, r2Y + 25, 50, "📦", "#f87171");
	ctx.fillStyle = "#94a3b8"; ctx.font = "normal 20px 'BeVietnamPro'";
	ctx.fillText("Loss", col1 + 65, r2Y + 15);
	ctx.fillStyle = "#FFFFFF"; ctx.font = "bold 26px 'BeVietnamPro'";
	ctx.fillText(`${loss}%`, col1 + 65, r2Y + 45);

	drawIconCircle(ctx, col2 + 25, r2Y + 25, 50, "🌍", "#34d399");
	ctx.fillStyle = "#94a3b8"; ctx.font = "normal 20px 'BeVietnamPro'";
	ctx.fillText("Máy chủ", col2 + 65, r2Y + 15);
	ctx.fillStyle = "#FFFFFF"; ctx.font = "bold 26px 'BeVietnamPro'";
	let svName = server;
	if (ctx.measureText(svName).width > (rightW / 2 - 80)) svName = svName.substring(0, 18) + "...";
	ctx.fillText(svName, col2 + 65, r2Y + 45);

	const footerY = height - 25;
	ctx.textAlign = "center";

	ctx.fillStyle = "rgba(0,0,0,0.3)";
	ctx.fillRect(0, height - 50, width, 50);

	const timeStr = formatDate(new Date());
	const vpnStatus = result.interface?.isVpn ? 'BẬT' : 'TẮT';

	ctx.font = "bold 24px 'BeVietnamPro'";
	ctx.fillStyle = "#f1f5f9";
	ctx.shadowColor = "#000000";
	ctx.shadowBlur = 4;
	ctx.fillText(`Thời gian: ${timeStr}  •  VPN: ${vpnStatus}`, width / 2, footerY);
	ctx.shadowBlur = 0;

	const filePath = path.resolve(`./assets/temp/speedtest_${Date.now()}.png`);
	const out = fs.createWriteStream(filePath);
	const stream = canvas.createPNGStream();
	stream.pipe(out);

	return new Promise((resolve, reject) => {
		out.on("finish", () => resolve(filePath));
		out.on("error", reject);
	});
}

export async function handleSpeedTestCommand(api, message) {
	const senderId = message.data.uidFrom;
	const senderName = message.data.dName;
	const threadId = message.threadId;

	if (isTestingSpeed) {
		await sendMessageCompleteRequest(api, message, {
			caption: `Bot đang kiểm tra mạng cho ${currentTester.name}. Vui lòng đợi trong giây lát.`
		}, 30000);

		if (threadId !== currentTester.threadId && !otherThreadRequester[threadId]) {
			otherThreadRequester[threadId] = {
				name: senderName,
				id: senderId,
				type: message.type
			};
		}
		return;
	}

	let imagePath = null;

	try {
		isTestingSpeed = true;
		currentTester = { id: senderId, name: senderName, threadId };

		await sendMessageCompleteRequest(api, message, {
			caption: `🚀 Đang kết nối máy chủ và đo tốc độ mạng... (Khoảng 20s)`
		}, TEST_DURATION);

		const result = await speedTest({ acceptLicense: true, acceptGdpr: true });
		imagePath = await createSpeedTestImage(result);

		await sendMessageTag(api, message, {
			caption: `Kết quả đo tốc độ mạng 🌪️\nNgười yêu cầu: ${senderName}`,
			imagePath
		}, TIME_TO_LIVE_MESSAGE);

		for (const tid in otherThreadRequester) {
			if (tid !== threadId) {
				await sendMessageTag(api, {
					threadId: tid,
					type: otherThreadRequester[tid].type,
					data: {
						uidFrom: otherThreadRequester[tid].id,
						dName: otherThreadRequester[tid].name
					}
				}, {
					caption: `Kết quả đo tốc độ mạng đã xong!`,
					imagePath
				}, TIME_TO_LIVE_MESSAGE);
			}
		}

	} catch (err) {
		console.error('Lỗi khi test tốc độ mạng:', err);
		await sendMessageCompleteRequest(api, message, {
			caption: `❌ Lỗi kết nối hoặc quá thời gian chờ.`
		}, 30000);
	} finally {
		isTestingSpeed = false;
		currentTester = { id: null, threadId: null, name: null };
		otherThreadRequester = {};
		if (imagePath) {
			setTimeout(() => deleteFile(imagePath), 60000);
		}
	}
}
