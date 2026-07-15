import fs from 'fs';
import path from 'path';
import ffmpeg from 'fluent-ffmpeg';
import { MessageType, MessageMention } from "zlbotdqt";
import { getGlobalPrefix } from "../../../service.js";
import { sendMessageWarningRequest, sendMessageProcessingRequest, sendMessageCompleteRequest } from "../../chat-style/chat-style.js";
import { tempDir } from '../../../../utils/io-json.js';
import { deleteFile } from '../../../../utils/util.js';
import { downloadMedia } from './downloadMedia.js';

// Constants - Zalo-specific limits
const MAX_GIF_DURATION = 10;
const MAX_GIF_SIZE = 8 * 1024 * 1024; // 8MB - safe limit cho Zalo
const ZALO_UPLOAD_LIMIT = 10 * 1024 * 1024; // 10MB - Zalo actual limit
const TIME_24H = 3600000;
const DOWNLOAD_RETRIES = 5;
const DOWNLOAD_INITIAL_DELAY = 10000;
const SEND_MESSAGE_RETRIES = 1;

export async function handleVideoToGifCommand(api, message) {
  const threadId = message.threadId;
  const botId = api.getBotId();
  const prefix = getGlobalPrefix(botId);
  const isGroup = message.type === MessageType.GroupMessage;
  const msgType = isGroup ? MessageType.GroupMessage : MessageType.PersonalMessage;
  
  const dataGifPath = tempDir;
  
  let videoPath = null;
  let finalGifPath = null;

  try {
    const validationResult = await validateVideoMessage(message, prefix);
    if (!validationResult.isValid) {
      await sendMessageWarningRequest(api, message, {
        caption: validationResult.errorMessage
      }, 30000);
      return;
    }

    const { senderName, senderId, decodedUrl } = validationResult;

    await ensureDirectoryExists(dataGifPath);

    await sendMessageProcessingRequest(api, message, {
      caption: `${senderName}, Đang chuyển video thành GIF, vui lòng chờ...`
    }, 60000);

    videoPath = await downloadVideoWithRetry(decodedUrl, botId, dataGifPath);
    
    const conversionResult = await createReliableGif(videoPath, botId, dataGifPath, senderName);
    
    if (!conversionResult.success) {
      throw new Error(conversionResult.errorMessage);
    }

    finalGifPath = conversionResult.gifPath;
    let originalGifPath = finalGifPath; // Lưu file gốc để xóa sau

    const fileStats = fs.statSync(finalGifPath);
    if (fileStats.size > ZALO_UPLOAD_LIMIT) {
      console.error(`File quá lớn (${(fileStats.size / 1024 / 1024).toFixed(2)}MB), nén lại...`);
      const compressedPath = await compressForUpload(finalGifPath, botId, dataGifPath);
      await deleteFile(finalGifPath).catch(() => {});
      finalGifPath = compressedPath;
    }
    
    const messageToSend = {
      msg: `${senderName}, Đây là GIF từ video của bạn! 🎉`,
      attachments: [finalGifPath],
      mentions: [MessageMention(senderId, senderName.length, 0)],
      ttl: TIME_24H,
      isUseProphylactic: true
    };
    
    await sendGifWithSmartRetry(api, messageToSend, threadId, msgType, senderName);

    // Đợi một chút để file được giải phóng sau khi gửi
    await new Promise(resolve => setTimeout(resolve, 500));
    
    // Xóa file đã gửi (có thể là file gốc hoặc file nén)
    const sentFilePath = messageToSend.attachments?.[0] || finalGifPath;
    if (sentFilePath && fs.existsSync(sentFilePath)) {
      await cleanupGifFile(sentFilePath);
    }
    
    // Đảm bảo xóa file gốc nếu khác với file đã gửi
    if (originalGifPath && originalGifPath !== sentFilePath && fs.existsSync(originalGifPath)) {
      await cleanupGifFile(originalGifPath);
    }

  } catch (error) {
    console.error("Lỗi khi chuyển video thành GIF:", error);
    
    const senderName = message.data.dName || "Người dùng";
    const errorMessage = `${senderName}, Lỗi khi chuyển video thành GIF. Vui lòng thử video ngắn hơn hoặc liên hệ admin.`;
    
    await api.sendMessage(
      {
        msg: errorMessage,
        quote: message
      },
      threadId,
      msgType
    );
    
  } finally {
    await cleanupTempFiles(videoPath, finalGifPath);
  }
}

// Validation helper
async function validateVideoMessage(message, prefix) {
  const senderName = message.data.dName || "Người dùng";
  const senderId = message.data.uidFrom;
  const quote = message.data.quote;

  if (!quote || !quote.attach) {
    return {
      isValid: false,
      errorMessage: `${senderName}, Vui lòng reply một tin nhắn chứa video! Ví dụ: ${prefix}gifvd (kèm video).`
    };
  }

  let attachData;
  try {
    attachData = JSON.parse(quote.attach);
  } catch (error) {
    return {
      isValid: false,
      errorMessage: `${senderName}, Dữ liệu video không hợp lệ. Vui lòng thử video khác.`
    };
  }

  const videoUrl = attachData.hdUrl || attachData.href;
  if (!videoUrl) {
    return {
      isValid: false,
      errorMessage: `${senderName}, Không tìm thấy URL video trong tin nhắn bạn reply.`
    };
  }

  const decodedUrl = decodeURIComponent(videoUrl.replace(/\\\//g, "/"));

  return {
    isValid: true,
    senderName,
    senderId,
    decodedUrl
  };
}

// Helper function to ensure directory exists
async function ensureDirectoryExists(directoryPath) {
  return new Promise((resolve) => {
    if (!fs.existsSync(directoryPath)) {
      fs.mkdirSync(directoryPath, { recursive: true });
    }
    resolve();
  });
}

// Download video with retry
async function downloadVideoWithRetry(url, botId, dataGifPath, maxRetries = DOWNLOAD_RETRIES, initialDelay = DOWNLOAD_INITIAL_DELAY) {
  const videoPath = path.join(dataGifPath, `temp_video_${botId}_${Date.now()}.mp4`);
  
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      await downloadMedia(url, videoPath);
      if (fs.existsSync(videoPath) && fs.statSync(videoPath).size > 0) {
        return videoPath;
      } else {
        throw new Error("Downloaded file is empty");
      }
    } catch (error) {
      if (error.message.includes("429") && attempt < maxRetries) {
        const retryAfter = error.response?.headers?.['retry-after'] ? 
          parseInt(error.response.headers['retry-after']) * 1000 : initialDelay;
        await new Promise(resolve => setTimeout(resolve, retryAfter || initialDelay));
        initialDelay *= 2;
      } else {
        throw error;
      }
    }
  }
  throw new Error(`Không thể tải video sau ${maxRetries} lần thử`);
}

// Create GIF with size validation
async function createReliableGif(inputPath, botId, dataGifPath, senderName) {
  const outputPath = path.join(dataGifPath, `final_gif_${botId}_${Date.now()}.gif`);
  const palettePath = path.join(dataGifPath, `palette_${Date.now()}.png`);
  
  try {
    await createPalette(inputPath, palettePath);
    
    await createGifFromPalette(inputPath, palettePath, outputPath);
    
    if (!fs.existsSync(outputPath)) {
      throw new Error(`Output file not created: ${outputPath}`);
    }
    
    const stats = fs.statSync(outputPath);
    if (stats.size === 0) {
      throw new Error(`Output file is empty: ${outputPath}`);
    }
    
    // Nếu file > 8MB, tự động nén
    if (stats.size > MAX_GIF_SIZE) {
      const compressedPath = await compressGifFinal(outputPath, botId, dataGifPath);
      await deleteFile(outputPath).catch(() => {});
      return { success: true, gifPath: compressedPath, size: fs.statSync(compressedPath).size };
    }
    
    return { success: true, gifPath: outputPath, size: stats.size };
    
  } catch (error) {
    return await createSimpleGifFallback(inputPath, botId, dataGifPath, senderName);
  } finally {
    if (fs.existsSync(palettePath)) {
      await deleteFile(palettePath).catch(() => {});
    }
  }
}

// Step 1: Create palette with 30 FPS
async function createPalette(inputPath, palettePath) {
  return new Promise((resolve, reject) => {
    ffmpeg(inputPath)
      .setDuration(MAX_GIF_DURATION)
      .outputOptions([
        '-vf', 'fps=30,scale=320:240:flags=lanczos,format=rgb24,split[s0][s1];[s0]palettegen=max_colors=64:stats_mode=diff[p];[s1][p]paletteuse=dither=floyd_steinberg',
        '-f', 'gif',
        '-y'
      ])
      .on('end', () => {
        if (fs.existsSync(palettePath)) {
          resolve();
        } else {
          reject(new Error('Palette file not created'));
        }
      })
      .on('error', (err) => {
        reject(new Error(`Palette creation failed: ${err.message}`));
      })
      .save(palettePath);
  });
}

// Step 2: Create GIF from palette with 30 FPS
async function createGifFromPalette(inputPath, palettePath, outputPath) {
  return new Promise((resolve, reject) => {
    ffmpeg()
      .input(inputPath)
      .input(palettePath)
      .setDuration(MAX_GIF_DURATION)
      .outputOptions([
        '-filter_complex', '[0:v]fps=30,scale=320:240:flags=lanczos[vid];[vid][1:v]paletteuse=dither=floyd_steinberg',
        '-c:v', 'gif',
        '-b:v', '600k',
        '-r', '30',
        '-loop', '0',
        '-y'
      ])
      .on('end', () => resolve())
      .on('error', (err) => {
        reject(new Error(`Final GIF creation failed: ${err.message}`));
      })
      .save(outputPath);
  });
}

// Fallback: Ultra-simple GIF conversion with conservative settings
async function createSimpleGifFallback(inputPath, botId, dataGifPath, senderName) {
  const outputPath = path.join(dataGifPath, `simple_gif_${botId}_${Date.now()}.gif`);
  
  return new Promise((resolve, reject) => {
    // Conservative settings để đảm bảo file nhỏ
    ffmpeg(inputPath)
      .setDuration(Math.min(MAX_GIF_DURATION, 6)) // Max 6s
      .outputOptions([
        '-vf', 'fps=20,scale=240:180', // Giảm FPS và resolution
        '-c:v', 'gif',
        '-b:v', '250k', // Bitrate thấp
        '-r', '20',
        '-loop', '0',
        '-y'
      ])
      .on('end', async () => {
        if (!fs.existsSync(outputPath) || fs.statSync(outputPath).size === 0) {
          reject(new Error('Simple GIF file not created'));
          return;
        }
        
        const stats = fs.statSync(outputPath);
        
        if (stats.size > MAX_GIF_SIZE) {
          const jpgPath = await createStaticJpgFallback(inputPath, botId, dataGifPath);
          resolve({ success: true, gifPath: jpgPath, size: fs.statSync(jpgPath).size, isStatic: true });
        } else {
          resolve({ success: true, gifPath: outputPath, size: stats.size });
        }
      })
      .on('error', (err) => {
        reject(new Error(`Simple GIF failed: ${err.message}`));
      })
      .save(outputPath);
  });
}

// Aggressive compression for upload
async function compressForUpload(inputPath, botId, dataGifPath) {
  const outputPath = path.join(dataGifPath, `upload_gif_${botId}_${Date.now()}.gif`);
  
  return new Promise((resolve) => {
    // Ultra-aggressive compression
    ffmpeg(inputPath)
      .setDuration(Math.min(MAX_GIF_DURATION, 4)) // Max 4s
      .outputOptions([
        '-vf', 'fps=15,scale=200:150', // Giảm FPS và resolution
        '-c:v', 'gif',
        '-b:v', '150k', // Bitrate rất thấp
        '-r', '15',
        '-loop', '0',
        '-y'
      ])
      .on('end', () => {
        if (fs.existsSync(outputPath)) {
          const stats = fs.statSync(outputPath);
          if (stats.size < ZALO_UPLOAD_LIMIT) {
            resolve(outputPath);
          } else {
            // Nếu vẫn quá lớn, fallback to JPG
            createStaticJpgFallback(inputPath, botId, dataGifPath).then(jpgPath => {
              resolve(jpgPath);
            }).catch(() => {
              resolve(outputPath); // Fallback cuối
            });
          }
        } else {
          resolve(inputPath);
        }
      })
      .on('error', () => {
        resolve(inputPath);
      })
      .save(outputPath);
  });
}

// Final compression if needed
async function compressGifFinal(inputPath, botId, dataGifPath) {
  const outputPath = path.join(dataGifPath, `compressed_gif_${botId}_${Date.now()}.gif`);
  
  return new Promise((resolve) => {
    ffmpeg(inputPath)
      .setDuration(Math.min(MAX_GIF_DURATION, 7)) // Max 7s
      .outputOptions([
        '-vf', 'fps=25,scale=280:210',
        '-c:v', 'gif',
        '-b:v', '400k',
        '-r', '25',
        '-loop', '0',
        '-y'
      ])
      .on('end', () => {
        if (fs.existsSync(outputPath)) {
          resolve(outputPath);
        } else {
          resolve(inputPath);
        }
      })
      .on('error', () => {
        resolve(inputPath);
      })
      .save(outputPath);
  });
}

// Ultimate fallback: Static JPG
async function createStaticJpgFallback(inputPath, botId, dataGifPath) {
  const outputPath = path.join(dataGifPath, `static_${botId}_${Date.now()}.jpg`);
  
  return new Promise((resolve, reject) => {
    ffmpeg(inputPath)
      .setDuration(1)
      .outputOptions([
        '-vf', 'scale=320:240:flags=lanczos',
        '-vframes', '1',
        '-q:v', '2',
        '-y'
      ])
      .on('end', () => {
        if (fs.existsSync(outputPath) && fs.statSync(outputPath).size > 0) {
          resolve(outputPath);
        } else {
          reject(new Error('Static JPG file empty'));
        }
      })
      .on('error', (err) => {
        reject(new Error(`Static JPG failed: ${err.message}`));
      })
      .save(outputPath);
  });
}

// Smart retry logic cho upload
async function sendGifWithSmartRetry(api, message, threadId, msgType, senderName, maxRetries = 3) {
  const attachmentPath = message.attachments?.[0];
  const isStaticImage = attachmentPath && (attachmentPath.endsWith('.jpg') || attachmentPath.endsWith('.png'));
  
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      // Kiểm tra file size trước khi gửi
      if (fs.existsSync(attachmentPath)) {
        const stats = fs.statSync(attachmentPath);
        if (stats.size > ZALO_UPLOAD_LIMIT && attempt === 1) {
          console.log(`File quá lớn (${(stats.size / 1024 / 1024).toFixed(2)}MB), nén lại...`);
          const originalPath = attachmentPath;
          const compressedPath = await compressForUpload(attachmentPath, api.getBotId(), path.dirname(attachmentPath));
          if (compressedPath !== originalPath) {
            // Xóa file gốc sau khi tạo file nén
            await deleteFile(originalPath).catch(() => {});
          }
          message.attachments[0] = compressedPath;
        }
      }
      
      await api.sendMessage(message, threadId, msgType);
      
      // Nếu là static image, update message text
      if (isStaticImage) {
        message.msg = `${senderName}, Đây là ảnh tĩnh từ video của bạn! 📸`;
      }
      
      return;
      
    } catch (error) {
      console.error(`Upload attempt ${attempt}/${maxRetries} failed:`, error.message, `Code: ${error.code}`);
      
      if (error.code === 115) {
        if (attempt < maxRetries) {
          // Nếu là lần đầu fail, thử nén lại
          if (attempt === 1) {
            console.log("Nén file cho lần thử tiếp theo...");
            const compressedPath = await compressForUpload(attachmentPath, api.getBotId(), path.dirname(attachmentPath));
            if (compressedPath !== attachmentPath) {
              await deleteFile(attachmentPath).catch(() => {});
              message.attachments[0] = compressedPath;
            }
          }
          
          // Chờ trước khi retry
          await new Promise(resolve => setTimeout(resolve, 2000 * attempt));
        } else {
          // Lần cuối fail, fallback to text
          try {
            const textMessage = {
              msg: `${senderName}, Không thể gửi file GIF (quá lớn). Vui lòng thử video ngắn hơn! 🎥`,
              quote: message
            };
            await api.sendMessage(textMessage, threadId, msgType);
            return;
          } catch (textError) {
            throw error;
          }
        }
      } else {
        throw error;
      }
    }
  }
  
  throw new Error('Không thể gửi GIF sau nhiều lần thử');
}

// Cleanup GIF file
async function cleanupGifFile(gifPath) {
  if (!gifPath) {
    return;
  }
  
  try {
    if (fs.existsSync(gifPath)) {
      await deleteFile(gifPath);
      // Kiểm tra lại sau khi xóa
      if (fs.existsSync(gifPath)) {
        console.warn(`File vẫn tồn tại sau khi xóa: ${gifPath}`);
      } else {
        console.log(`Đã xóa file thành công: ${path.basename(gifPath)}`);
      }
    }
  } catch (error) {
    console.error(`Failed to cleanup GIF: ${gifPath}`, error.message);
  }
}

// Enhanced cleanup - xóa temp files (video và GIF nếu còn sót)
async function cleanupTempFiles(videoPath, gifPath) {
  const filesToClean = [videoPath, gifPath].filter(Boolean);
  
  for (const filePath of filesToClean) {
    if (filePath && fs.existsSync(filePath)) {
      try {
        await deleteFile(filePath);
        if (fs.existsSync(filePath)) {
          console.warn(`File vẫn tồn tại sau cleanup: ${path.basename(filePath)}`);
        }
      } catch (err) {
        console.error(`Lỗi khi xóa file trong cleanup: ${filePath}`, err.message);
      }
    }
  }
}