import fs from "fs";
import path from "path";
import schedule from "node-schedule";
import chalk from "chalk";
import { MessageType } from "zlbotngh";
import {
  imgWebPrConfigFolderDir,
  readWebConfig,
  videoWebPrConfigFolderDir,
  writeWebConfig,
} from "../../utils/io-json.js";
import { enqueueBackgroundTask } from "../../utils/background-work-queue.js";
import { waitForInteractiveCapacity } from "../../utils/runtime-work-queue.js";

const CAPTION_CARD = "Danh Thiếp Liên Hệ";
const PR_SEND_INTERVAL_MINUTES = 15;
const PR_SEND_INTERVAL_MS = PR_SEND_INTERVAL_MINUTES * 60 * 1000;
// PR dùng chung socket với tin nhắn tương tác; nhịp quá sát dễ làm API Zalo
// nghẽn và khiến hàng đợi chat tăng đột biến.
const PR_TARGET_DELAY_MS = Math.max(1000, Number(process.env.NGH_PR_TARGET_DELAY_MS) || 2000);
const prRunGenerations = new Map();

function getPrRunGeneration(botId) {
  return prRunGenerations.get(String(botId)) || 0;
}

// Invalidate both an active PR loop and a queued snapshot. The background
// queue itself is shared by several services, so cancellation belongs here.
export function cancelConfiguredPRMessages(botId) {
  const key = String(botId);
  prRunGenerations.set(key, getPrRunGeneration(key) + 1);
}

// Group IDs can be persisted in slightly different forms (for example with a
// trailing `_0`).  Always compare a canonical value so the whitelist is a
// hard deny-list regardless of how the ID was entered or stored.
function normalizeGroupId(value) {
  return String(value ?? "").trim().replace(/_0$/u, "");
}

async function checkAndFixAttachments(api, prObject, idZaloGroup, cache = {}) {
  const botId = api.getBotId();
  const { hinhAnh, video, link } = prObject;
  const updatedLinks = { ...link };

  if (updatedLinks) {
    for (const fileName in updatedLinks) {
      if (!hinhAnh.includes(fileName) && !video.includes(fileName)) {
        delete updatedLinks[fileName];
      }
    }
  }

  if (hinhAnh) {
    for (const imageName of hinhAnh) {
      const cacheKey = `img:${imageName}`;
      const imagePath = path.join(imgWebPrConfigFolderDir(botId), imageName);

      if (cache[cacheKey]) {
        updatedLinks[imageName] = cache[cacheKey];
        continue;
      }

      try {
        await fs.promises.access(imagePath, fs.constants.R_OK);
      } catch {
        continue;
      }

      if (!updatedLinks[imageName]) {
        try {
          const uploadResult = await api.uploadAttachment([imagePath], idZaloGroup, MessageType.GroupMessage);
          if (uploadResult && uploadResult[0]) {
            const url = uploadResult[0].fileUrl || uploadResult[0].normalUrl;
            updatedLinks[imageName] = url;
            cache[cacheKey] = url;
          }
        } catch (error) {
          console.error(`Lỗi khi upload ảnh ${imageName}:`, error);
        }
      } else {
        cache[cacheKey] = updatedLinks[imageName];
      }
    }
  }

  if (video) {
    for (const videoName of video) {
      const cacheKey = `video:${videoName}`;
      const videoPath = path.join(videoWebPrConfigFolderDir(botId), videoName);

      if (cache[cacheKey]) {
        updatedLinks[videoName] = cache[cacheKey];
        continue;
      }

      try {
        await fs.promises.access(videoPath, fs.constants.R_OK);
      } catch {
        continue;
      }

      if (!updatedLinks[videoName]) {
        try {
          const uploadResult = await api.uploadAttachment([videoPath], idZaloGroup, MessageType.GroupMessage);
          if (uploadResult && uploadResult[0]) {
            const url = uploadResult[0].fileUrl || uploadResult[0].normalUrl;
            updatedLinks[videoName] = url;
            cache[cacheKey] = url;
          }
        } catch (error) {
          console.error(`Lỗi khi upload video ${videoName}:`, error);
        }
      } else {
        cache[cacheKey] = updatedLinks[videoName];
      }
    }
  }

  return updatedLinks;
}

async function sendPRMessage(api, config, prObject, ttl, shouldContinue = () => true) {
  const botId = api.getBotId();
  const { idZalo } = prObject;
  const selectedFriends = config.selectedFriends || {};
  const selectedGroups = config.prSelectedGroups || {};
  const whitelistedGroups = new Set(
    (Array.isArray(config.groupWhitelist) ? config.groupWhitelist : [])
      .map(normalizeGroupId)
      .filter(Boolean)
  );
  let point = 0;

  try {
    if (!shouldContinue()) return false;
    const attachmentCache = {};
    let defaultLinks = prObject.link || {};
    try {
      const firstGroupId = Object.keys(selectedGroups).find(
        (groupId) => selectedGroups[groupId] && !whitelistedGroups.has(normalizeGroupId(groupId))
      );
      if (firstGroupId) {
        defaultLinks = await checkAndFixAttachments(api, prObject, firstGroupId, attachmentCache);
      }
    } catch (error) {
      console.error(`Lỗi khi check default attachments:`, error.message);
      defaultLinks = prObject.link || {};
    }
    let hasLinksChanged = JSON.stringify(prObject.link) !== JSON.stringify(defaultLinks);

    let configDirty = false;
    if (hasLinksChanged) {
      prObject.link = defaultLinks;
      const prIndex = config.prObjects.findIndex((pr) => pr.ten === prObject.ten);
      if (prIndex !== -1) {
        config.prObjects[prIndex] = prObject;
        configDirty = true;
      }
    }

    for (const groupId in selectedGroups) {
      if (!shouldContinue()) return false;
      // Whitelist must take precedence over every other PR setting.  A group
      // can remain in prSelectedGroups after being whitelisted; it is still
      // skipped here so it cannot receive scheduled or manual PR sends.
      if (selectedGroups[groupId] && !whitelistedGroups.has(normalizeGroupId(groupId))) {
        try {
          await waitForInteractiveCapacity();
          if (!shouldContinue()) return false;
          const customGroupContent = prObject.customContent?.[groupId];

          const tempPrObject = {
            ...prObject,
            noiDung: customGroupContent?.noiDung || prObject.noiDung,
            hinhAnh: customGroupContent?.hinhAnh || prObject.hinhAnh,
            video: customGroupContent?.video || prObject.video,
            link: defaultLinks,
          };

          if (customGroupContent) {
            try {
              const customLinks = await checkAndFixAttachments(api, tempPrObject, groupId, attachmentCache);
              if (JSON.stringify(tempPrObject.link) !== JSON.stringify(customLinks)) {
                tempPrObject.link = customLinks;
                const prIndex = config.prObjects.findIndex((pr) => pr.ten === prObject.ten);
                if (prIndex !== -1) {
                  config.prObjects[prIndex].customContent[groupId] = {
                    ...customGroupContent,
                    link: customLinks,
                  };
                  configDirty = true;
                }
              }
            } catch (error) {
              console.error(`Lỗi khi check attachments cho group ${groupId}:`, error.message);
            }
          }

          try {
            point = (tempPrObject.hinhAnh.length > 0 ? 1 : 0) + (tempPrObject.video.length > 0 ? 2 : 0);

            if (point === 0) {
              await api.sendMessage({ msg: tempPrObject.noiDung, ttl: ttl }, groupId, MessageType.GroupMessage);
            } else if (point === 1) {
              if (tempPrObject.hinhAnh.length > 1) {
                let groupLayout = {
                  groupLayoutId: Date.now(),
                  totalItemInGroup: tempPrObject.hinhAnh.length,
                  isGroupLayout: tempPrObject.hinhAnh.length > 2 ? 1 : 0,
                };
                for (let i = 0; i < tempPrObject.hinhAnh.length; i++) {
                  try {
                    let link = tempPrObject.link[tempPrObject.hinhAnh[i]];
                    await api.sendImage(link, { type: MessageType.GroupMessage, threadId: groupId }, null, ttl, {
                      ...groupLayout,
                      idInGroup: i + 1,
                    });
                  } catch (error) {
                    console.error(`Lỗi khi gửi hình ảnh ${tempPrObject.hinhAnh[i]} đến group ${groupId}:`, error.message);
                  }
                }
                try {
                  await api.sendMessage({ msg: tempPrObject.noiDung, ttl: ttl }, groupId, MessageType.GroupMessage);
                } catch (error) {
                  console.error(`Lỗi khi gửi nội dung đến group ${groupId}:`, error.message);
                }
              } else {
                let link = tempPrObject.link[tempPrObject.hinhAnh[0]];
                await api.sendImage(
                  link,
                  { type: MessageType.GroupMessage, threadId: groupId },
                  tempPrObject.noiDung,
                  ttl
                );
              }
            } else if (point === 2 || point === 3) {
              if (tempPrObject.hinhAnh.length > 0) {
                let groupLayout = {
                  groupLayoutId: Date.now(),
                  totalItemInGroup: tempPrObject.hinhAnh.length,
                  isGroupLayout: tempPrObject.hinhAnh.length > 2 ? 1 : 0,
                };
                for (let i = 0; i < tempPrObject.hinhAnh.length; i++) {
                  try {
                    let link = tempPrObject.link[tempPrObject.hinhAnh[i]];
                    await api.sendImage(link, { type: MessageType.GroupMessage, threadId: groupId }, null, ttl, {
                      ...groupLayout,
                      idInGroup: i + 1,
                    });
                  } catch (error) {
                    console.error(`Lỗi khi gửi hình ảnh ${tempPrObject.hinhAnh[i]} đến group ${groupId}:`, error.message);
                  }
                }
              }

              for (const videoName of tempPrObject.video) {
                let videoUrl = tempPrObject.link[videoName];
                if (videoUrl) {
                  try {
                    await api.sendVideo({
                      videoUrl,
                      threadId: groupId,
                      threadType: MessageType.GroupMessage,
                      message: {
                        text: tempPrObject.noiDung,
                      },
                      ttl: ttl,
                    });
                  } catch (error) {
                    console.error(`Lỗi khi gửi video ${videoName} đến group ${groupId}:`, error.message);
                  }
                }
              }
            }
          } catch (error) {
            console.error(`Lỗi khi gửi PR message đến group ${groupId} (có thể bot bị block):`, error.message);
            continue;
          }

          if (!shouldContinue()) return false;
          
          if (idZalo != -1) {
            try {
              const cardContent = customGroupContent?.card?.content || prObject.card?.content || CAPTION_CARD;
              await api.sendBusinessCard(null, idZalo, cardContent, MessageType.GroupMessage, groupId, ttl);
            } catch (error) {
              console.error(`Lỗi khi gửi business card đến group ${groupId}:`, error.message);
            }
          }
          
          await new Promise((resolve) => setTimeout(resolve, PR_TARGET_DELAY_MS));
          if (!shouldContinue()) return false;
        } catch (error) {
          console.error(`Lỗi tổng quát khi xử lý PR cho group ${groupId} (có thể bot bị block):`, error.message);
          continue;
        }
      }
    }

    const defaultPrObject = {
      ...prObject,
      link: defaultLinks,
    };
    point = (defaultPrObject.hinhAnh.length > 0 ? 1 : 0) + (defaultPrObject.video.length > 0 ? 2 : 0);
    for (const friendId in selectedFriends) {
      if (!shouldContinue()) return false;
      if (selectedFriends[friendId]) {
        try {
          await waitForInteractiveCapacity();
          if (!shouldContinue()) return false;
          if (point === 0) {
            await api.sendMessage(
              {
                msg: defaultPrObject.noiDung,
                ttl: ttl,
              },
              friendId,
              MessageType.DirectMessage
            );
          } else if (point === 1) {
            if (defaultPrObject.hinhAnh.length > 1) {
              let groupLayout = {
                groupLayoutId: Date.now(),
                totalItemInGroup: defaultPrObject.hinhAnh.length,
                isGroupLayout: defaultPrObject.hinhAnh.length > 2 ? 1 : 0,
              };
              for (let i = 0; i < defaultPrObject.hinhAnh.length; i++) {
                let link = defaultPrObject.link[defaultPrObject.hinhAnh[i]];
                await api.sendImage(
                  link,
                  {
                    type: MessageType.DirectMessage,
                    threadId: friendId,
                  },
                  null,
                  ttl,
                  {
                    ...groupLayout,
                    idInGroup: i + 1,
                  }
                );
              }
              await api.sendMessage(
                {
                  msg: defaultPrObject.noiDung,
                  ttl: ttl,
                },
                friendId,
                MessageType.DirectMessage
              );
            } else {
              let link = defaultPrObject.link[defaultPrObject.hinhAnh[0]];
              await api.sendImage(
                link,
                {
                  type: MessageType.DirectMessage,
                  threadId: friendId,
                },
                defaultPrObject.noiDung,
                ttl
              );
            }
          } else if (point === 2 || point === 3) {
            if (defaultPrObject.hinhAnh.length > 0) {
              let groupLayout = {
                groupLayoutId: Date.now(),
                totalItemInGroup: defaultPrObject.hinhAnh.length,
                isGroupLayout: defaultPrObject.hinhAnh.length > 2 ? 1 : 0,
              };
              for (let i = 0; i < defaultPrObject.hinhAnh.length; i++) {
                let link = defaultPrObject.link[defaultPrObject.hinhAnh[i]];
                await api.sendImage(
                  link,
                  {
                    type: MessageType.DirectMessage,
                    threadId: friendId,
                  },
                  null,
                  ttl,
                  {
                    ...groupLayout,
                    idInGroup: i + 1,
                  }
                );
              }
            }

            for (const videoName of defaultPrObject.video) {
              let videoUrl = defaultPrObject.link[videoName];
              if (videoUrl) {
                try {
                  await api.sendVideo({
                    videoUrl,
                    threadId: friendId,
                    threadType: MessageType.DirectMessage,
                    message: {
                      text: defaultPrObject.noiDung,
                    },
                    ttl: ttl,
                  });
                } catch (error) {
                  console.error(`Lỗi khi gửi video ${videoName} đến friend ${friendId}:`, error.message);
                }
              }
            }
          }
        } catch (error) {
          console.error(`Lỗi khi gửi PR message đến friend ${friendId}:`, error.message);
        }

        if (!shouldContinue()) return false;
        
        if (idZalo != -1) {
          try {
            const cardContent = defaultPrObject.card?.content || CAPTION_CARD;
            await api.sendBusinessCard(null, idZalo, CAPTION_CARD, MessageType.DirectMessage, friendId, ttl);
          } catch (error) {
            console.error(`Lỗi khi gửi business card đến friend ${friendId}:`, error.message);
          }
        }

        // Direct-message targets use the same websocket/session as groups.
        // Without a pause this loop could fire hundreds of requests back to
        // back and starve interactive replies.
        await new Promise((resolve) => setTimeout(resolve, PR_TARGET_DELAY_MS));
      }
    }

    if (configDirty) {
      // Attachment refresh may finish after an administrator used `prs off`.
      // Never let this run's stale config turn PR back on or roll back the
      // cross-process cancellation token.
      const latestConfig = readWebConfig(botId);
      config.activePr = latestConfig?.activePr === true;
      config.prCancelToken = Number(latestConfig?.prCancelToken) || 0;
      writeWebConfig(botId, config);
    }

    console.log(`Đã gửi PR thành công cho ${prObject.ten}`);
    return true;
  } catch (error) {
    console.error(`Lỗi khi gửi PR cho ${prObject.ten}:`, error);
    return false;
  }
}

export async function sendConfiguredPRMessages(api, config, shouldContinue = () => true) {
  for (const prObject of config?.prObjects || []) {
    if (!shouldContinue()) return false;
    const completed = await sendPRMessage(api, config, prObject, PR_SEND_INTERVAL_MS, shouldContinue);
    if (!completed && !shouldContinue()) return false;
  }
  return true;
}

export function queueConfiguredPRMessages(api, config) {
  const botId = String(api.getBotId());
  const generation = getPrRunGeneration(botId);
  const cancelToken = Number(config?.prCancelToken) || 0;
  let lastPersistentCheckAt = 0;
  let persistentTokenMatches = true;
  const shouldContinue = () => {
    if (getPrRunGeneration(botId) !== generation || !persistentTokenMatches) return false;
    const now = Date.now();
    if (now - lastPersistentCheckAt >= 500) {
      lastPersistentCheckAt = now;
      // The generation map only covers this process. The persisted token also
      // cancels copies of the run held by another PM2 shard/process.
      const latestConfig = readWebConfig(botId);
      persistentTokenMatches = (Number(latestConfig?.prCancelToken) || 0) === cancelToken;
    }
    return persistentTokenMatches;
  };
  return enqueueBackgroundTask(`prs:${botId}`, () => sendConfiguredPRMessages(api, config, shouldContinue));
}

async function schedulePR(api) {
  const botId = String(api.getBotId());
  if (api.apiInstance.schedule.schedulePRService) return;
  const numericBotId = BigInt(botId.replace(/\D/g, "") || "0");
  const scheduleSecond = Number(numericBotId % 60n);
  const minuteOffset = Number((numericBotId / 60n) % BigInt(PR_SEND_INTERVAL_MINUTES));
  const scheduledMinutes = [];
  for (let minute = minuteOffset; minute < 60; minute += PR_SEND_INTERVAL_MINUTES) {
    scheduledMinutes.push(minute);
  }
  api.apiInstance.schedule.schedulePRService = schedule.scheduleJob(
    `${scheduleSecond} ${scheduledMinutes.join(",")} * * * *`,
    async function () {
      const config = await readWebConfig(botId);
      if (config?.activePr) {
        const queued = queueConfiguredPRMessages(api, config);
        if (queued.accepted) {
          void queued.promise.catch((error) => console.error(`[PR] Lỗi lượt gửi bot ${botId}:`, error));
        }
      }
    }
  );
}

export async function initPRService(api) {
  await schedulePR(api);
  console.log(chalk.green("Dịch vụ PR đã khởi tạo thành công"));
}
