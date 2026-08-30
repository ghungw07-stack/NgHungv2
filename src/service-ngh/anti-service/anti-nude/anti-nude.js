import path from "path";
import chalk from "chalk";
import schedule from "node-schedule";
import { MessageMention, MessageType } from "zlbotngh";
import { Worker } from "worker_threads";
import { fileURLToPath } from "url";

import { sendMessageStateQuote } from "../../chat-zalo/chat-style/chat-style.js";
import { createBlockSpamImage } from "../../../utils/canvas/event-image.js";
import { clearImagePath } from "../../../utils/canvas/index.js";
import { getGroupInfoData } from "../../info-service/group-info.js";
import { getUserInfoData } from "../../info-service/user-info.js";
import {
  checkContentIsLink,
  checkExstentionFileRemote,
  deleteFile,
  execAsync,
  loadImageBuffer,
} from "../../../utils/util.js";
import { tempDir } from "../../../utils/io-json.js";
import { isInWhiteList } from "../white-list.js";
import { randomIDTemp, removeMention } from "../../../utils/format-util.js";
import { getVideoMetadata } from "../../../api-zalo/utils.js";
import { getAntiConfig, updateAntiConfig } from "../index.js";
import { imageBufferCache } from "../../../utils/image-buffer-cache.js";
import { deleteMessageCustomer } from "../../../commands/bot-manager/utilities.js";

const blockedUsers = new Set();

// Điểm dưới mức này thường là ảnh đời thường bị model gán nhầm sang "Sexy".
// Chỉ xử lý khi model có độ tin cậy cao để hạn chế xóa nhầm ảnh/video bình thường.
export const PERCENT_NSFW = 65;
const WHITELIST_PERCENT_NSFW = 80;

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const workerPool = {
  workers: [],
  maxWorkers: 1,
  queue: [],
  initPromise: null,

  async init() {
    if (this.workers.length > 0) return;
    if (!this.initPromise) {
      this.initPromise = Promise.resolve().then(() => {
        for (let i = 0; i < this.maxWorkers; i++) {
          const worker = new Worker(path.join(__dirname, "anti-nude-worker.js"));
          this.workers.push({ worker, busy: false });
        }
      });
    }
    await this.initPromise;
  },

  async getWorker() {
    await this.init();
    const availableWorker = this.workers.find((w) => !w.busy);
    if (availableWorker) {
      availableWorker.busy = true;
      return availableWorker;
    }

    return new Promise((resolve) => {
      this.queue.push(resolve);
    });
  },

  releaseWorker(workerInfo) {
    workerInfo.busy = false;
    if (this.queue.length > 0) {
      const nextTask = this.queue.shift();
      nextTask(workerInfo);
    }
  },
};

async function loadViolations(botId) {
  const antiState = getAntiConfig(botId);
  return antiState.violationsNude || {};
}

async function saveViolation(botId, senderId, count, senderName, threadId, arrayLink) {
  const antiState = getAntiConfig(botId);
  const violations = antiState.violationsNude || {};
  const arr = arrayLink || violations[senderId].arrayLink;

  violations[senderId] = {
    count,
    lastViolation: Date.now(),
    senderName,
    threadId,
    arrayLink: arr,
  };

  updateAntiConfig(botId, {
    ...antiState,
    violationsNude: violations,
  });
}

class ImageQueue {
  constructor() {
    this.queue = [];
    this.processing = false;
  }

  async enqueue(task) {
    return new Promise((resolve, reject) => {
      this.queue.push({
        task,
        resolve,
        reject,
      });
      this.processQueue();
    });
  }

  async processQueue() {
    if (this.processing || this.queue.length === 0) return;

    this.processing = true;
    const { task, resolve, reject } = this.queue.shift();

    try {
      const result = await task();
      resolve(result);
    } catch (error) {
      reject(error);
    } finally {
      this.processing = false;
      this.processQueue();
    }
  }
}

const imageQueue = new ImageQueue();

async function checkNudeImage(imagePath) {
  const processImage = async () => {
    try {
      const timeoutPromise = new Promise((_, reject) => {
        setTimeout(() => reject(new Error("Timeout: Xử lý ảnh quá 10 giây")), 10000);
      });

      const processPromise = (async () => {
        let imageBuffer;
        if (imagePath.startsWith("http")) {
          imageBuffer = await imageBufferCache.getBuffer(imagePath);
        } else {
          imageBuffer = await loadImageBuffer(imagePath);
        }
        // let imageData;
        // if (imagePath.startsWith("http")) {
        //   imageData = { type: "url_image", url: imagePath };
        // } else {
        //   const stats = fs.statSync(imagePath);
        //   const file = fs.createReadStream(imagePath);
        //   imageData = { type: "file_image", file, options: { knownLength: stats.size } };
        // }

        const workerInfo = await workerPool.getWorker();

        try {
          const result = await new Promise((resolve, reject) => {
            workerInfo.worker.once("message", (result) => {
              if (result.success) {
                resolve(result.score);
              } else {
                reject(new Error(result.error));
              }
            });

            workerInfo.worker.postMessage({ imageBuffer });
            // workerInfo.worker.postMessage({ imageData });
          });

          return result;
        } finally {
          workerPool.releaseWorker(workerInfo);
        }
      })();

      return await Promise.race([timeoutPromise, processPromise]);
    } catch (error) {
      console.error("Lỗi khi kiểm tra ảnh:", error.message);
      return 0;
    } finally {
      if (!imagePath.startsWith("http")) {
        await deleteFile(imagePath);
      }
    }
  };

  return imageQueue.enqueue(processImage);
}

async function processVideoFrames(linkImage, timeSplits, tempFrameFiles) {
  const framePromises = timeSplits.map(async (time, i) => {
    try {
      await execAsync(`ffmpeg -ss ${time} -i "${linkImage}" -vframes 1 "${tempFrameFiles[i]}"`);
      const nsfw_prob = await checkNudeImage(tempFrameFiles[i]);
      return nsfw_prob;
    } catch (frameError) {
      console.error(`Lỗi khi xử lý frame ${i}:`, frameError);
      return 0;
    }
  });

  const scores = await Promise.all(framePromises);
  return Math.max(...scores);
}

export async function downloadAndAnalyzeNudeImage(linkImage, messageType, thumbnail = null) {
  const extLinkImage = await checkExstentionFileRemote(linkImage);
  const isDynamicMedia =
    messageType === "chat.video.msg" ||
    extLinkImage === "mp4" ||
    messageType === "chat.gif" ||
    extLinkImage === "gif" ||
    extLinkImage === "webp";

  const basenamePath = path.basename(linkImage);
  const baseNameFile = basenamePath.split(".")[0] || basenamePath;
  const tempFrameFiles = [
    path.join(tempDir, `frame_start_${randomIDTemp()}_${baseNameFile}.jpg`),
    path.join(tempDir, `frame_middle_${randomIDTemp()}_${baseNameFile}.jpg`),
    path.join(tempDir, `frame_end_${randomIDTemp()}_${baseNameFile}.jpg`),
  ];

  try {
    if (thumbnail) {
      const extLinkThumbnail = await checkExstentionFileRemote(thumbnail);
      if (extLinkThumbnail && (extLinkThumbnail == "jpg" || extLinkThumbnail == "png")) {
        const nsfw_prob = await checkNudeImage(thumbnail);
        if (nsfw_prob > PERCENT_NSFW) {
          return Number(nsfw_prob.toFixed(0));
        }
      }
    }

    if (!extLinkImage) return 0;

    if (isDynamicMedia) {
      if (extLinkImage === "webp") {
        const tempWebpFile = path.join(tempDir, `temp_${randomIDTemp()}_${baseNameFile}.jpg`);
        try {
          await execAsync(`ffmpeg -i "${linkImage}" -vf "select=eq(n\\,0)" -vframes 1 "${tempWebpFile}"`);
          const nsfw_prob = await checkNudeImage(tempWebpFile);
          return Number(nsfw_prob.toFixed(0));
        } catch (webpError) {
          return Number((await checkNudeImage(linkImage)).toFixed(0));
        } finally {
          await deleteFile(tempWebpFile);
        }
      }

      try {
        const { duration } = await getVideoMetadata(linkImage);
        const middleTime = Math.floor(duration / 1000 / 2);
        const endTime = Math.ceil((duration / 1000) * 0.8);
        let timeSplits = [
          ...new Set([0, middleTime, endTime].filter((time) => typeof time === "number" && !isNaN(time))),
        ];

        const maxNsfwScore = await processVideoFrames(linkImage, timeSplits, tempFrameFiles);
        return Number(maxNsfwScore.toFixed(0));
      } catch (videoError) {
        console.error("Lỗi khi xử lý video/gif:", videoError);
        return 0;
      }
    } else {
      const nsfw_prob = await checkNudeImage(linkImage);
      return Number(nsfw_prob.toFixed(0));
    }
  } catch (error) {
    console.error("Lỗi khi phân tích ảnh:", error);
    return 0;
  } finally {
    for (const tempFile of tempFrameFiles) {
      try {
        await deleteFile(tempFile);
      } catch (error) {
        console.error("Lỗi khi xóa file tạm:", error);
      }
    }
  }
}

const listCheckNude = ["chat.photo", "chat.gif", "chat.video.msg", "chat.sticker"];

export async function antiNude(api, message, isAdminBox, groupSettings, botIsAdminBox, isSelf) {
  if (!listCheckNude.includes(message.data.msgType)) return;
  const botId = api.getBotId();
  const senderId = message.data.uidFrom;
  const senderName = message.data.dName;
  const threadId = message.threadId;

  const content = message.data?.content || {};
  const urlCandidates = [
    content?.href,
    content?.url,
    content?.hdUrl,
    content?.normalUrl,
    content?.fileUrl,
    content?.oriUrl,
    content?.link,
    content?.src,
  ];
  const linkContent =
    urlCandidates.find((candidate) => typeof candidate === "string" && checkContentIsLink(candidate)) || null;

  const thumbCandidates = [content?.thumb, content?.thumbUrl, content?.thumbnail, content?.previewUrl];
  const thumbnail =
    thumbCandidates.find((candidate) => typeof candidate === "string" && checkContentIsLink(candidate)) || null;

  if ((!linkContent && !thumbnail) || isAdminBox || isSelf || !botIsAdminBox) return false;

  const isWhiteList = isInWhiteList(groupSettings, threadId, senderId);
  let percentNsfw = PERCENT_NSFW;
  if (isWhiteList) percentNsfw = WHITELIST_PERCENT_NSFW;

  if (groupSettings[threadId]?.antiNude) {
    if (linkContent || thumbnail) {
      try {
        const nsfw_prob = await downloadAndAnalyzeNudeImage(linkContent, message.data.msgType, thumbnail);

        if (nsfw_prob > percentNsfw) {
          const violations = await loadViolations(botId);
          const userViolation = violations[senderId] || {
            count: 0,
            lastViolation: 0,
          };

          if (Date.now() - userViolation.lastViolation > 3600000) {
            userViolation.count = 0;
          }

          userViolation.count++;
          let arrayLink = userViolation.arrayLink;
          if (!arrayLink) arrayLink = [];
          arrayLink.push(linkContent);
          if (arrayLink.length > 12) arrayLink.shift();
          await saveViolation(botId, senderId, userViolation.count, senderName, threadId, arrayLink);

          if (isWhiteList) {
            await deleteMessageCustomer(api, message);
            await api.sendMessage(
              {
                msg: `⚠️ ${senderName}!\nUầy bạn ơi, cái này múp quá, tôi phải giấu thôi... (Độ nhạy cảm: ${Math.max(
                  nsfw_prob,
                  50
                )}%).`,
                quote: message,
                mentions: [MessageMention(senderId, senderName.length, "⚠️ ".length)],
                ttl: 30000,
              },
              threadId,
              MessageType.GroupMessage
            );
          } else if (userViolation.count >= 5) {
            await handleNudeContent(api, message, threadId, senderId, senderName, groupSettings);
            await saveViolation(botId, senderId, 0, senderName, threadId);
          } else {
            await deleteMessageCustomer(api, message);
            await api.sendMessage(
              {
                msg:
                  `⚠️ Cảnh cáo ${senderName}!\n` +
                  `Ở đây cấm gửi nội dung nhạy cảm!!! (Độ nhạy cảm: ${Math.max(nsfw_prob, 50)}%).` +
                  `\nVi phạm nhiều lần, tao đá khỏi box!`,
                quote: message,
                mentions: [MessageMention(senderId, senderName.length, "⚠️ Cảnh cáo ".length)],
                ttl: 30000,
              },
              threadId,
              MessageType.GroupMessage
            );
          }
          return true;
        }
      } catch (error) {
        console.error("Lỗi khi kiểm tra nội dung ảnh:", error);
      }
    }
  }
  return false;
}

async function handleNudeContent(api, message, threadId, senderId, senderName, groupSettings) {
  let imagePath = null;
  try {
    if (blockedUsers.has(senderId)) return;
    blockedUsers.add(senderId);
    
    try {
      await deleteMessageCustomer(api, message);
    } catch (error) {
      console.error("Lỗi khi xóa tin nhắn nude:", error);
    }
    
    try {
      await api.blockUsers(threadId, [senderId]);
      console.log(`Đã block user ${senderName} (${senderId}) khỏi nhóm ${threadId}`);
    } catch (error) {
      console.error(`Lỗi khi block user ${senderName} (${senderId}):`, error);
      blockedUsers.delete(senderId);
      return;
    }

    const isEnableBlockImage = groupSettings?.[threadId]?.enableBlockImage === true;
    
    if (isEnableBlockImage) {
      try {
        const groupInfo = await getGroupInfoData(api, threadId);
        const userInfo = await getUserInfoData(api, senderId);
        const botId = api.getBotId();
        const botInfo = await getUserInfoData(api, botId);
        const botName = botInfo?.name || botInfo?.zaloName || api.accountInfo?.name || "Bot";
        imagePath = await createBlockSpamImage(userInfo, groupInfo.name, groupInfo.groupType, userInfo.gender, botName);

        await api.sendMessage(
          {
            msg: "",
            attachments: imagePath ? [imagePath] : [],
            ttl: 86400000,
            isUseProphylactic: true,
          },
          threadId,
          MessageType.GroupMessage
        );

        await clearImagePath(imagePath);
      } catch (error) {
        console.error("Lỗi khi tạo và gửi ảnh block nude:", error);
      }
    }

    setTimeout(() => {
      blockedUsers.delete(senderId);
      console.log(`Đã xóa ${senderId} khỏi danh sách blockedUsers.`);
    }, 300000);
  } catch (error) {
    console.error(`Lỗi khi xử lý nội dung nhạy cảm:`, error);
  }
}

async function showNudeViolationHistory(api, message) {
  try {
    const botId = api.getBotId();
    const threadId = message.threadId;
    const mentions = message.data.mentions;

    if (!mentions || mentions.length === 0) {
      await api.sendMessage(
        {
          msg: "Vui lòng tag (@mention) người dùng để xem lịch sử vi phạm.",
          quote: message,
          ttl: 30000,
        },
        threadId,
        message.type
      );
      return;
    }

    const antiState = getAntiConfig(botId);
    const violations = antiState.violationsNude || {};

    let responseMsg = "📝 Lịch sử vi phạm gửi ảnh nhạy cảm:\n\n";
    const messageMentions = [];
    let mentionPosition = responseMsg.length;

    for (const mention of mentions) {
      const userId = mention.uid;
      const userName = message.data.content.substr(mention.pos, mention.len).replace("@", "");
      const violation = violations[userId];

      messageMentions.push(MessageMention(userId, userName.length, mentionPosition));

      if (!violation) {
        responseMsg += `${userName} chưa có vi phạm nào.\n\n`;
      } else {
        responseMsg += `${userName}:\n`;
        responseMsg += `Lần vi phạm gần nhất: ${new Date(violation.lastViolation).toLocaleString()}\n\n`;
      }

      mentionPosition = responseMsg.length;
    }

    await api.sendMessage(
      {
        msg: responseMsg.trim(),
        quote: message,
        mentions: messageMentions,
        ttl: 30000,
      },
      threadId,
      message.type
    );
  } catch (error) {
    console.error("Lỗi khi đọc lịch sử vi phạm:", error);
    await api.sendMessage(
      {
        msg: "Đã xảy ra lỗi khi đọc lịch sử vi phạm.",
        quote: message,
        ttl: 30000,
      },
      threadId,
      message.type
    );
  }
}

export async function handleAntiNudeCommand(api, message, groupSettings) {
  const content = removeMention(message);
  const threadId = message.threadId;
  const args = content.split(" ");
  const command = args[1]?.toLowerCase();

  if (!groupSettings[threadId]) {
    groupSettings[threadId] = {};
  }

  if (command === "list") {
    await showNudeViolationHistory(api, message);
    return true;
  }

  let newStatus;
  if (command === "on") {
    groupSettings[threadId].antiNude = true;
    newStatus = "bật";
  } else if (command === "off") {
    groupSettings[threadId].antiNude = false;
    newStatus = "tắt";
  } else {
    groupSettings[threadId].antiNude = !groupSettings[threadId].antiNude;
    newStatus = groupSettings[threadId].antiNude ? "bật" : "tắt";
  }

  const caption = `Chức năng chống nội dung nhạy cảm đã được ${newStatus}!`;
  await sendMessageStateQuote(api, message, caption, groupSettings[threadId].antiNude, 300000);

  return true;
}

export async function startNudeViolationCheck(api) {
  const botId = api.getBotId();

  api.apiInstance.schedule.checkNudeViolation = schedule.scheduleJob("*/5 * * * * *", async () => {
    try {
      const antiState = getAntiConfig(botId);
      let hasChanges = false;
      const currentTime = Date.now();
      const VIOLATION_TIMEOUT = 1000 * 60 * 60 * 24;

      if (antiState.violationsNude) {
        const violations = { ...antiState.violationsNude };

        for (const userId in violations) {
          const violation = violations[userId];

          if (currentTime - violation.lastViolation > VIOLATION_TIMEOUT) {
            hasChanges = true;
            delete violations[userId];
          }
        }

        if (hasChanges) {
          updateAntiConfig(botId, {
            ...antiState,
            violationsNude: violations,
          });
        }
      }
    } catch (error) {
      console.error("Lỗi khi kiểm tra vi phạm nude với id: " + botId, error);
    }
  });

  console.log(chalk.yellow("Đã khởi động schedule kiểm tra vi phạm nude"));
}
