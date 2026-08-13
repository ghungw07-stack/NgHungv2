
import { sendMessageCompleteRequest, sendMessageProcessingRequest, sendMessageWarningRequest, sendMessageStateQuote } from "../chat-zalo/chat-style/chat-style.js";
import { getGlobalPrefix } from "../service.js";
import * as fs from 'fs';
import path from 'path';
import axios from 'axios';
import FormData from 'form-data';
import { MessageSendType } from "../../api-zalo/models/Message.js";
import { removeMention } from "../../utils/format-util.js";
import { deleteFile, downloadAndSaveVideo, uploadToUguu } from "../../utils/util.js";
/* Author:HA HUY HOANG
Date:2025-08-15
Description:file này dùng để quản lý dữ liệu */
const BASE_DATA_PATH = path.resolve(process.cwd(), "src", "service-ngh","chat-zalo", "chat-special", "data-send");
const removedLinksDir = path.resolve(process.cwd(), "src", "service-ngh", "chat-zalo", "chat-special", "data-send", "removed-links");

if (!fs.existsSync(removedLinksDir)) {
    fs.mkdirSync(removedLinksDir, { recursive: true });
}

const VALID_STATUS_CODES = [200, 201, 202, 204, 301, 302, 307, 308];

const DEFAULT_HEADERS = {
    'User-Agent': 'Mozilla/5.0 (compatible; LinkChecker/1.0)',
    'Accept': '*/*',
    'Accept-Language': 'en-US,en;q=0.9'
};

function normalizeDataFileName(input, quote) {
    let fileName = String(input || "default").trim().replace(/\.txt$/i, "").toLowerCase();
    const isVideo = String(quote?.cliMsgType) === String(MessageSendType["chat.video.msg"]);

    // Cho phép nhập tên nhóm ngắn khi đang reply video.
    if (isVideo && fileName === "anime") fileName = "vdanime";
    if (isVideo && fileName === "girl") fileName = "vdgirl";
    if (fileName === "chill") fileName = "vdchill";
    if (fileName === "vdgril") fileName = "vdgirl";

    return /^[\p{L}\p{N}_-]+$/u.test(fileName) ? fileName : null;
}

function escapeRegExp(value) {
    return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function isValidUrl(string) {
    try {
        const url = new URL(string.trim());
        return ['http:', 'https:'].includes(url.protocol);
    } catch {
        return false;
    }
}

async function checkLinkStatus(url, retryCount = 0, maxRetries = 3) {
    try {
        const response = await axios.head(url, {
            timeout: 5000,
            maxRedirects: 5,
            headers: DEFAULT_HEADERS,
            validateStatus: (status) => status < 500
        });
        return VALID_STATUS_CODES.includes(response.status);
    } catch (error) {
        if (error.response?.status === 405) {
            try {
                const response = await axios.get(url, {
                    timeout: 5000,
                    maxRedirects: 5,
                    headers: DEFAULT_HEADERS,
                    responseType: 'stream',
                    validateStatus: (status) => status < 500
                });
                response.data.destroy();
                return VALID_STATUS_CODES.includes(response.status);
            } catch (getError) {
                console.log(`GET request failed for ${url}: ${getError.message}`);
                return false;
            }
        }

        if (error.response?.status === 429 && retryCount < maxRetries) {
            const backoffTime = 2000 * Math.pow(2, retryCount); // Exponential backoff
            console.log(`Rate limited for ${url}, retrying in ${backoffTime}ms (attempt ${retryCount + 1}/${maxRetries})`);
            await new Promise(r => setTimeout(r, backoffTime));
            return checkLinkStatus(url, retryCount + 1, maxRetries);
        }

        console.log(`Link check failed for ${url}: ${error.message} (Status: ${error.response?.status || 'N/A'})`);
        return false;
    }
}

async function processInBatches(links, batchSize = 5) {
    const validLinks = [];
    const invalidLinks = [];

    console.log(`Starting to process ${links.length} links in batches of ${batchSize}`);

    for (let i = 0; i < links.length; i += batchSize) {
        const batch = links.slice(i, i + batchSize);
        console.log(`Processing batch ${Math.floor(i / batchSize) + 1}/${Math.ceil(links.length / batchSize)}`);

        const results = await Promise.allSettled(
            batch.map(link => checkLinkStatus(link.trim()))
        );

        results.forEach((result, index) => {
            const link = batch[index].trim();
            if (result.status === "fulfilled" && result.value === true) {
                validLinks.push(link);
            } else {
                invalidLinks.push({
                    url: link,
                    error: result.reason?.message || 'Link not accessible',
                    status: result.reason?.response?.status || 'N/A'
                });
            }
        });

        if (i + batchSize < links.length) {
            await new Promise(resolve => setTimeout(resolve, 1000));
        }
    }

    return { validLinks, invalidLinks };
}

export async function handleDataCommand(api, message, aliasCommand) {
    // removeMention xử lý mention ở mọi vị trí, kể cả khi reply người khác
    // rồi tag họ trong cùng câu lệnh.
    const content = removeMention(message).trim();
    const senderName = message.data?.dName || "Người dùng";
    const prefix = getGlobalPrefix(api.getBotId());
    const quote = message.data?.quote;
    const commandRegex = new RegExp(`^${escapeRegExp(prefix + aliasCommand)}\\s*`, "i");
    const contentWithoutCommand = content.replace(commandRegex, "").trim();
    const args = contentWithoutCommand.split(/\s+/).filter(arg => arg.length > 0);
    const action = args[0]?.toLowerCase() === "check" ? "check" : "add";
    const param = action === "check" ? args[1] : args[0];
    let fileName = normalizeDataFileName(param, quote);

    if (!fileName) {
        await sendMessageWarningRequest(api, message, {
            caption: `${senderName}, cú pháp không đúng!\n` +
                `Sử dụng:\n` +            
                `• ${prefix}${aliasCommand} <tên_file> (để thêm link video)\n` +
                `• ${prefix}${aliasCommand} check <tên file> (để kiểm tra link)`
        }, 30000);
        return;
    }

    if (action === "check") {
        try {
            if (!fileName) {
                await sendMessageWarningRequest(api, message, {
                    caption: `${senderName}, vui lòng chỉ định tên file cần kiểm tra.`
                }, 30000);
                return;
            }

            if (!fileName.toLowerCase().endsWith('.txt')) {
                fileName += '.txt';
            }

            const fullPath = path.join(BASE_DATA_PATH, fileName);

            if (!fs.existsSync(fullPath)) {
                await sendMessageWarningRequest(api, message, {
                    caption: `${senderName}, không tìm thấy file ${fileName}.`
                }, 30000);
                return;
            }

            let fileContent = fs.readFileSync(fullPath, "utf-8").trim();

            let links = fileContent.split("\n")
                .map(link => link.trim())
                .filter(link => link && !link.startsWith('#') && isValidUrl(link));

            if (links.length === 0) {
                await sendMessageWarningRequest(api, message, {
                    caption: `${senderName}, file ${fileName} không chứa link hợp lệ nào.`
                }, 30000);
                return;
            }

            links = [...new Set(links)];

            await sendMessageProcessingRequest(api, message, {
                caption: `${senderName}, đang kiểm tra ${links.length} links (đã loại bỏ trùng lặp)...`
            }, 60000);

            const { validLinks, invalidLinks } = await processInBatches(links, 5);

            const updatedContent = validLinks.length > 0 ? validLinks.join("\n") : "# No valid links left";
            fs.writeFileSync(fullPath, updatedContent);

            if (invalidLinks.length > 0) {
                const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
                const removedLinksFile = path.join(
                    removedLinksDir,
                    `removed_links_${fileName.replace('.txt', '')}_${timestamp}.txt`
                );

                const removedLinksContent =
                    `# Links đã xóa từ file ${fileName}\n` +
                    `# Thời gian: ${new Date().toLocaleString('vi-VN')}\n` +
                    `# Số lượng: ${invalidLinks.length}\n` +
                    `# Tổng links đã kiểm tra: ${links.length}\n\n` +
                    invalidLinks.map(item => `${item.url} # Error: ${item.error} (Status: ${item.status})`).join("\n");

                fs.writeFileSync(removedLinksFile, removedLinksContent);

                await sendMessageCompleteRequest(api, message, {
                    caption: `${senderName}, kết quả kiểm tra file ${fileName}:\n\n` +
                        `✅ Links còn hoạt động: ${validLinks.length}\n` +
                        `❌ Links đã xóa: ${invalidLinks.length}\n`
                }, 300000);
            } else {
                await sendMessageCompleteRequest(api, message, {
                    caption: `${senderName},Tất cả ${validLinks.length} links trong file ${fileName} đều hoạt động tốt.`
                }, 60000);
            }
        } catch (error) {
            console.error("Lỗi xử lý lệnh kiểm tra:", error);
            await sendMessageWarningRequest(api, message, {
                caption: `${senderName}, đã xảy ra lỗi khi thực hiện lệnh kiểm tra: ${error.message}\nVui lòng thử lại sau.`
            }, 30000);
        }
    } else if (action === "add") {
        if (!quote || !quote.attach) {
            await sendMessageStateQuote(api, message, "Mày Reply vào cái video đó xem nào!", false, 10000);
            return;
        }

        const finalFileName = `${fileName}.txt`;
        const filePath = path.join(BASE_DATA_PATH, finalFileName);

        try {
            const attachData = JSON.parse(quote.attach);
            const fileUrl = attachData.hdUrl || attachData.href || attachData.oriUrl || attachData.normalUrl || attachData.thumbUrl;

            if (!fileUrl) {
                await sendMessageStateQuote(api, message, "Không tìm thấy URL hợp lệ", false, 10000);
                return;
            }

            if (!isValidUrl(fileUrl)) {
                await sendMessageStateQuote(api, message, "URL không hợp lệ", false, 10000);
                return;
            }
            const apiEndpoint = `https://catbox.moe/user/api.php`;
            let response;
            let tempFilePath;
            try {
                // urlupload khiến Catbox tự truy cập link nguồn và dễ bị 412
                // với các link Imgur/CDN có chống hotlink. Tải file về bot
                // trước rồi upload multipart sẽ ổn định hơn.
                try {
                    tempFilePath = await downloadAndSaveVideo(fileUrl);
                } catch (error) {
                    const status = error.response?.status ? ` (HTTP ${error.response.status})` : "";
                    throw new Error(`Tải video nguồn thất bại${status}: ${error.message}`);
                }
                const formData = new FormData();
                formData.append('reqtype', 'fileupload');
                formData.append('fileToUpload', fs.createReadStream(tempFilePath));

                response = await axios.post(apiEndpoint, formData, {
                    headers: {
                        ...formData.getHeaders(),
                        ...DEFAULT_HEADERS
                    },
                    timeout: 120000,
                    maxContentLength: Infinity,
                    maxBodyLength: Infinity
                });
            } catch (error) {
                console.error("Lỗi khi gọi API upload:", error.message);
                // Catbox đôi lúc trả 412 theo IP/khu vực. Dùng Uguu dự phòng
                // với chính file đã tải xuống, không bắt dịch vụ bên ngoài
                // phải tự truy cập link nguồn.
                if (tempFilePath && !error.message.startsWith("Tải video")) {
                    const fallbackLink = await uploadToUguu(tempFilePath);
                    if (fallbackLink) {
                        response = { data: fallbackLink };
                    } else {
                        await sendMessageStateQuote(api, message, `Upload Catbox và Uguu đều thất bại: ${error.message}`, false, 10000);
                        return;
                    }
                } else {
                    await sendMessageStateQuote(api, message, error.message, false, 10000);
                    return;
                }
            } finally {
                if (tempFilePath) await deleteFile(tempFilePath);
            }

            const uploadedLink = response.data.trim();
            console.log("Phản hồi từ API:", uploadedLink);

            if (!uploadedLink || uploadedLink.startsWith('Error') || !isValidUrl(uploadedLink)) {
                const errorMessage = uploadedLink.replace('Error: ', '');
                await sendMessageStateQuote(api, message, `Upload thất bại. Thông báo từ API: ${errorMessage}`, false, 30000);
                return;
            }

            try {
                await fs.promises.mkdir(BASE_DATA_PATH, { recursive: true });
            } catch (error) {
                console.error("Lỗi khi tạo thư mục:", error.message);
                await sendMessageStateQuote(api, message, `Đã xảy ra lỗi khi tạo thư mục lưu trữ: ${error.message}`, false, 10000);
                return;
            }

            let existingContent = "";
            let fileExists = false;
            try {
                if (fs.existsSync(filePath)) {
                    fileExists = true;
                    existingContent = fs.readFileSync(filePath, "utf8");
                    if (existingContent && existingContent.trim()) {
                        const existingLinks = existingContent
                            .split("\n")
                            .map(link => link.trim())
                            .filter(link => link && !link.startsWith('#') && isValidUrl(link));
                        
                        const normalizedUploadedLink = uploadedLink.trim();
                        const isDuplicate = existingLinks.some(link => link.trim() === normalizedUploadedLink);
                        
                        if (isDuplicate) {
                            await sendMessageStateQuote(api, message, `Link này đã tồn tại trong file ${fileName || 'default'}`, false, 10000);
                            return;
                        }
                    }
                }
            } catch (error) {
                console.error("Lỗi khi đọc file:", error.message);
                await sendMessageStateQuote(api, message, `Đã xảy ra lỗi khi đọc file: ${error.message}. Vui lòng thử lại.`, false, 10000);
                return;
            }

            try {
                if (fileExists && existingContent && existingContent.trim()) {
                    const contentToWrite = existingContent.endsWith('\n') 
                        ? `${uploadedLink}\n` 
                        : `\n${uploadedLink}\n`;
                    await fs.promises.appendFile(filePath, contentToWrite, "utf8");
                } else {
                    await fs.promises.writeFile(filePath, `${uploadedLink}\n`, "utf8");
                }
            } catch (error) {
                console.error("Lỗi khi ghi vào file:", error.message);
                await sendMessageStateQuote(api, message, `Đã xảy ra lỗi khi lưu link: ${error.message}`, false, 10000);
                return;
            }

            await sendMessageStateQuote(api, message, `✅ Lưu thành công vào tệp ${fileName || 'default'}`, true, 30000);
        } catch (error) {
            console.error("Lỗi khi xử lý upload:", error.message);
            await sendMessageStateQuote(api, message, `Đã xảy ra lỗi khi xử lý: ${error.message}`, false, 10000);
        }
    }
}
