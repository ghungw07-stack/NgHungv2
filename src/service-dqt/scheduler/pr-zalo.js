import fs from "fs";
import path from "path";
import schedule from "node-schedule";
import chalk from "chalk";
import { MessageType } from "zlbotdqt";
import {
  imgWebPrConfigFolderDir,
  readWebConfig,
  videoWebPrConfigFolderDir,
  writeWebConfig,
} from "../../utils/io-json.js";
import { checkUrlStatus } from "../../utils/util.js";

const CAPTION_CARD = "Danh Thiếp Liên Hệ";

function calculateTimeLive(currentTime, prObjects) {
  const sortedPRs = prObjects
    .flatMap((obj) => obj.thoiGianGui.map((time) => ({ time, object: obj })))
    .sort((a, b) => {
      const timeA = new Date(currentTime.toDateString() + " " + a.time);
      const timeB = new Date(currentTime.toDateString() + " " + b.time);
      return timeA - timeB;
    });

  const currentIndex = sortedPRs.findIndex(
    (pr) =>
      pr.time ===
      `${currentTime.getHours().toString().padStart(2, "0")}:${currentTime.getMinutes().toString().padStart(2, "0")}`
  );

  if (currentIndex === -1) return 0;

  const nextPRIndex = (currentIndex + 1) % sortedPRs.length;
  const nextPRTime = new Date(currentTime.toDateString() + " " + sortedPRs[nextPRIndex].time);

  if (nextPRIndex <= currentIndex) {
    nextPRTime.setDate(nextPRTime.getDate() + 1);
  }

  return nextPRTime.getTime() - currentTime.getTime();
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

async function sendPRMessage(api, config, prObject, ttl) {
  const botId = api.getBotId();
  const { idZalo } = prObject;
  const selectedFriends = config.selectedFriends;
  const selectedGroups = config.prSelectedGroups || {};
  let point = 0;

  try {
    const attachmentCache = {};
    let defaultLinks = prObject.link || {};
    try {
      const firstGroupId = Object.keys(selectedGroups)[0];
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
      if (selectedGroups[groupId]) {
        try {
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
          
          if (idZalo != -1) {
            try {
              const cardContent = customGroupContent?.card?.content || prObject.card?.content || CAPTION_CARD;
              await api.sendBusinessCard(null, idZalo, cardContent, MessageType.GroupMessage, groupId, ttl);
            } catch (error) {
              console.error(`Lỗi khi gửi business card đến group ${groupId}:`, error.message);
            }
          }
          
          await new Promise((resolve) => setTimeout(resolve, 500));
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
      if (selectedFriends[friendId]) {
        try {
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
        
        if (idZalo != -1) {
          try {
            const cardContent = defaultPrObject.card?.content || CAPTION_CARD;
            await api.sendBusinessCard(null, idZalo, CAPTION_CARD, MessageType.DirectMessage, friendId, ttl);
          } catch (error) {
            console.error(`Lỗi khi gửi business card đến friend ${friendId}:`, error.message);
          }
        }
      }
    }

    if (configDirty) {
      writeWebConfig(botId, config);
    }

    console.log(`Đã gửi PR thành công cho ${prObject.ten}`);
  } catch (error) {
    console.error(`Lỗi khi gửi PR cho ${prObject.ten}:`, error);
  }
}

async function schedulePR(api) {
  const botId = api.getBotId();
  api.apiInstance.schedule.schedulePRService = schedule.scheduleJob("*/1 * * * *", async function () {
    const config = await readWebConfig(botId);
    if (config?.activePr) {
      const currentTime = new Date();
      const currentHourMinute = `${currentTime.getHours().toString().padStart(2, "0")}:${currentTime
        .getMinutes()
        .toString()
        .padStart(2, "0")}`;

      const ttl = calculateTimeLive(currentTime, config.prObjects);

      for (const prObject of config.prObjects) {
        if (prObject.thoiGianGui.includes(currentHourMinute)) {
          await sendPRMessage(api, config, prObject, ttl);
        }
      }
    }
  });
}

export async function initPRService(api) {
  await schedulePR(api);
  console.log(chalk.green("Dịch vụ PR đã khởi tạo thành công"));
}

