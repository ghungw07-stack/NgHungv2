import schedule from "node-schedule";
import { MessageType } from "../../api-zalo/index.js";
import { handleRandomChartZingMp3 } from "../api-crawl/music-content/zingmp3.js";
import { getRandomVideoFromArray } from "../api-crawl/tiktok/tiktok-service.js";
import { sendRandomGirlVideo } from "../chat-zalo/chat-special/send-video/send-video.js";
import { searchTiktok } from "../api-crawl/tiktok/tiktok-api.js";
import { getMessageCache } from "../../utils/message-cache.js";
import { groupSettingsAll } from "../../automations/event-send-msg.js";
import { analyzeGroupInteractionsByThreadId } from "../info-service/rank-chat.js";
import { generateLunarCalendarImage } from "../api-crawl/image-content/lichamlich.js";
import { getSendtaskOverallWeather } from "../api-crawl/content/weather.js";
import { deleteFile } from "../../utils/util.js";
import { getGroupInfoData } from "../info-service/group-info.js";
import { runLimited as runWithLimit } from "./sendtask-limiter.js";

const LOCK_CHAT_TIME_ZONE = "Asia/Ho_Chi_Minh";
const CUSTOM_TASK_TYPES = new Set([
  "sendTaskGirlVideo", "sendTaskGirlVideo:anime", "sendTaskGirlVideo:sexy",
  "sendTaskGirlVideo:cosplay", "sendTaskVideo", "sendTaskMusic",
  "sendTaskWeather", "sendTaskCalendar", "analyzeGroupInteractions",
]);
export const SENDTASK_SUPPORTED_TYPES = [...CUSTOM_TASK_TYPES];
const SENDTASK_FANOUT_CONCURRENCY = Math.max(1, Number.parseInt(process.env.NGH_SENDTASK_CONCURRENCY || "2", 10) || 2);

const runLimited = (items, worker) => runWithLimit(items, worker, SENDTASK_FANOUT_CONCURRENCY);

function getLockChatClock() {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: LOCK_CHAT_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(new Date());
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return {
    time: `${values.hour}:${values.minute}`,
    date: `${values.year}-${values.month}-${values.day}`,
  };
}

async function processLockChatSchedules(api) {
  const groupSettings = groupSettingsAll.getByID(api.getBotId());
  const clock = getLockChatClock();

  for (const [threadId, settings] of Object.entries(groupSettings)) {
    const config = settings?.lockChatSchedule;
    if (!config?.enabled) continue;

    const action = clock.time === config.lockTime
      ? "lock"
      : clock.time === config.unlockTime
        ? "unlock"
        : null;
    if (!action) continue;

    const actionKey = `${clock.date}:${clock.time}:${action}`;
    if (config.lastActionKey === actionKey) continue;

    const previousActionKey = config.lastActionKey;
    config.lastActionKey = actionKey;
    try {
      const groupInfo = await getGroupInfoData(api, threadId);
      const nextValue = action === "lock" ? 1 : 0;
      const currentSettings = { ...(groupInfo.setting || {}), lockSendMsg: nextValue };
      await api.changeGroupSetting(threadId, currentSettings);

      config.lastRunAt = Date.now();
      groupSettingsAll.setChanged();

      await api.sendMessage(
        {
          msg: action === "lock"
            ? `🔒 Đã tự động khóa chat theo lịch lúc ${config.lockTime}.`
            : `🔓 Đã tự động mở chat theo lịch lúc ${config.unlockTime}.`,
          ttl: 60000,
        },
        threadId,
        MessageType.GroupMessage
      ).catch(() => {});
    } catch (error) {
      if (config.lastActionKey === actionKey) config.lastActionKey = previousActionKey;
      console.error(`Lỗi chạy lịch lockchat nhóm ${threadId}:`, error);
    }
  }
}

async function executeCustomTask(api, threadId, taskConfig) {
  const message = { threadId, type: MessageType.GroupMessage };
  const caption = taskConfig.caption || `-> SendTask ${taskConfig.time} <-`;
  const ttl = 60 * 60 * 1000;
  if (taskConfig.type.startsWith("sendTaskGirlVideo")) {
    return sendRandomGirlVideo(api, message, caption, taskConfig.type.split(":")[1] || "default", ttl);
  }
  switch (taskConfig.type) {
    case "sendTaskVideo": {
      const videos = await searchTiktok("video TikTok chill dưới 45 giây");
      if (!videos?.length) throw new Error("Không tìm thấy video TikTok phù hợp");
      const videoUrl = await getRandomVideoFromArray(api, message, videos);
      return api.sendVideo({ videoUrl, threadId, threadType: MessageType.GroupMessage, message: { text: caption }, ttl });
    }
    case "sendTaskMusic": return handleRandomChartZingMp3(api, message, caption, ttl);
    case "sendTaskWeather": return getSendtaskOverallWeather(api, message, caption, ttl);
    case "sendTaskCalendar": {
      let imagePath;
      try {
        imagePath = await generateLunarCalendarImage();
        const uploaded = await api.uploadAttachment([imagePath], threadId, MessageType.GroupMessage);
        const imageUrl = uploaded?.[0]?.fileUrl || uploaded?.[0]?.normalUrl;
        if (!imageUrl) throw new Error("Upload lịch không trả về URL");
        return api.sendImage(imageUrl, message, caption, ttl);
      } finally {
        if (imagePath) await deleteFile(imagePath).catch(() => {});
      }
    }
    case "analyzeGroupInteractions": return analyzeGroupInteractionsByThreadId(api, threadId, caption, ttl);
    default: throw new Error(`Loại sendtask không hỗ trợ: ${taskConfig.type}`);
  }
}

async function processCustomSendTasks(api) {
  const groupSettings = groupSettingsAll.getByID(api.getBotId());
  const clock = getLockChatClock();
  const runKey = `${clock.date}:${clock.time}`;
  await runLimited(Object.entries(groupSettings), async ([threadId, settings]) => {
    if (!settings?.sendTask || !Array.isArray(settings.customSendTasks)) return;
    const dueTasks = settings.customSendTasks.filter((task) =>
      task?.time === clock.time && CUSTOM_TASK_TYPES.has(task.type) && task.lastRunKey !== runKey
    );
    for (const task of dueTasks) {
      task.lastRunKey = runKey;
      groupSettingsAll.setChanged();
      try {
        await executeCustomTask(api, threadId, task);
      } catch (error) {
        task.lastRunKey = null;
        groupSettingsAll.setChanged();
        console.error(`Lỗi custom sendtask ${task.type} (${task.time}) vào nhóm ${threadId}:`, error);
      }
    }
  });
}

const scheduledTasks = [
  {
    cronExpression: "5 0 * * *",
    task: async (api) => {
      const caption =
        `-> SendTask 00:05 <-\nChúc cả nhà một ngày mới an lành!\n` +
        `\nGửi bạn lịch âm dương, giờ hoàng đạo và dịp lễ gần nhất nhé.`;
      const timeToLive = 1000 * 60 * 60 * 1;
      await sendTaskLunarCalendar(api, caption, timeToLive);
    },
  },
  {
    cronExpression: "5 1 * * *",
    task: async (api) => {
      const caption =
        `-> SendTask 01:05 <- \n\nCung cấp vitamin gái cực sexy cho anh em đây!!!`;
      const timeToLive = 1000 * 60 * 60 * 1;
      await sendTaskGirlVideo(api, caption, timeToLive, "sexy");
    },
  },
  {
    cronExpression: "5 2 * * *",
    task: async (api) => {
      const caption =
        `-> SendTask 02:05 <-\nGiải trí với nữ cosplay cho anh em đây!!!`;
      const timeToLive = 1000 * 60 * 60 * 1;
      await sendTaskGirlVideo(api, caption, timeToLive, "cosplay");
    },
  },
  {
    cronExpression: "5 3 * * *",
    task: async (api) => {
      const caption = `-> SendTask 03:05 <-\nNgày mới chúc các bạn may mắn!\n\n`;
      const timeToLive = 1000 * 60 * 60 * 1;
      await sendTaskMusic(api, caption, timeToLive);
    },
  },
  {
    cronExpression: "5 4 * * *",
    task: async (api) => {
      const caption =
        `-> SendTask 04:05 <-\nGiải trí anime cho bớt căng não anh em nhé!!!`;
      const timeToLive = 1000 * 60 * 60 * 1;
      await sendTaskGirlVideo(api, caption, timeToLive, "anime");
    },
  },
  {
    cronExpression: "5 5 * * *",
    task: async (api) => {
      const caption =
        `-> SendTask 05:05 <- \n\nCung cấp vitamin gái cực sexy cho anh em đây!!!`;
      const timeToLive = 1000 * 60 * 60 * 1;
      await sendTaskGirlVideo(api, caption, timeToLive, "sexy");
    },
  },
  {
    cronExpression: "5 6 * * *",
    task: async (api) => {
      const caption =
        `-> SendTask 06:05 <-\nThức dậy cho một ngày mới\nđầy năng lượng thôi nào!` +
        `\n\nĐón bình minh ngày mới cùng tớ nhé!!!`;
      const timeToLive = 1000 * 60 * 60 * 1;
      await sendTaskGirlVideo(api, caption, timeToLive);
    },
  },
  {
    cronExpression: "30 6 * * *",
    task: async (api) => {
      const caption =
        `-> SendTask 06:30 <-\nCập nhật nhanh thời tiết tổng quan hôm nay cho mọi người nè!\n` +
        `\nNhớ mang theo ô nếu có mưa và giữ gìn sức khỏe nhé.`;
      const timeToLive = 1000 * 60 * 60 * 1;
      await sendTaskOverallWeather(api, caption, timeToLive);
    },
  },
  {
    cronExpression: "5 7 * * *",
    task: async (api) => {
      const caption =
        `-> SendTask 07:05 <-\nChào một buổi sáng đầy năng lượng!` +
        `\n\nCung cấp vitamin gái cực sexy cho anh em đây!!!`;
      const timeToLive = 1000 * 60 * 60 * 1;
      await sendTaskGirlVideo(api, caption, timeToLive, "sexy");
    },
  },
  {
    cronExpression: "30 7 * * *",
    task: async (api) => {
      await sendTaskMarketPrice(api, "gold", "-> SendTask 07:30 <-\nCập nhật bảng giá vàng tổng hợp hôm nay.", 60 * 60 * 1000);
    },
  },
  {
    cronExpression: "5 8 * * *",
    task: async (api) => {
      const caption =
        `-> SendTask 08:05 <-\nCung cấp vitamin gái cho anh em đây!!!`;
      const timeToLive = 1000 * 60 * 60 * 1;
      await sendTaskGirlVideo(api, caption, timeToLive);
    },
  },
  {
    cronExpression: "5 9 * * *",
    task: async (api) => {
      const caption =
        `-> SendTask 09:05 <-\nChào buổi sáng\ncùng đón nắng ấm suơng mưa nhé!` +
        `\n\nGiải trí một chút để bớt căng thẳng thôi nào!!!`;
      const timeToLive = 1000 * 60 * 60 * 1;
      await sendTaskGirlVideo(api, caption, timeToLive);
    },
  },
  {
    cronExpression: "5 10 * * *",
    task: async (api) => {
      const caption =
        `-> SendTask 10:05 <-\nChào một buổi trưa đầy năng lượng!` + `\n\nCung cấp vitamin gái cho anh em đây!!!`;
      const timeToLive = 1000 * 60 * 60 * 1;
      await sendTaskGirlVideo(api, caption, timeToLive, "sexy");
    },
  },
  {
    cronExpression: "5 11 * * *",
    task: async (api) => {
      const caption =
        `-> SendTask 11:05 <-\nChào một buổi trưa đầy năng lượng!` +
        `\n\nCung cấp vitamin gái cực sexy cho anh em đây!!!`;
      const timeToLive = 1000 * 60 * 60 * 1;
      await sendTaskGirlVideo(api, caption, timeToLive, "sexy");
    },
  },
  {
    cronExpression: "5 12 * * *",
    task: async (api) => {
      const caption =
        `-> SendTask 12:05 <-\nChào một buổi trưa đầy năng lượng!` + `\n\nGiải trí với nữ cosplay cho anh em đây!!!`;
      const timeToLive = 1000 * 60 * 60 * 1;
      await sendTaskGirlVideo(api, caption, timeToLive, "cosplay");
    },
  },
  {
    cronExpression: "5 13 * * *",
    task: async (api) => {
      const caption =
        `-> SendTask 13:05 <-\nChào một buổi trưa đầy năng lượng!` +
        `\n\nGiải trí anime cho bớt căng não anh em nhé!!!`;
      const timeToLive = 1000 * 60 * 60 * 1;
      await sendTaskGirlVideo(api, caption, timeToLive, "anime");
    },
  },
  {
    cronExpression: "5 14 * * *",
    task: async (api) => {
      const caption = `-> SendTask 14:05 <-\nChào buổi trưa tràn đầy năng lượng!`;
      const timeToLive = 1000 * 60 * 60 * 1;
      await analyzeGroupInteractions(api, caption, timeToLive, true);
    },
  },
  {
    cronExpression: "5 15 * * *",
    task: async (api) => {
      const caption =
        `-> SendTask 15:05 <-\nChào một buổi xế chiều đầy năng lượng!` + `\n\nCung cấp vitamin gái cho anh em đây!!!`;
      const timeToLive = 1000 * 60 * 60 * 1;
      await sendTaskGirlVideo(api, caption, timeToLive);
    },
  },
  {
    cronExpression: "30 15 * * *",
    task: async (api) => {
      const caption =
        `-> SendTask 15:30 <-\nChúc cả nhà một ngày mới an lành!`;
      const timeToLive = 1000 * 60 * 60 * 1;
      await sendTaskLunarCalendar(api, caption, timeToLive);
    },
  },
  {
    cronExpression: "5 16 * * *",
    task: async (api) => {
      const caption =
        `-> SendTask 16:05 <-\nChào một buổi xế chiều đầy năng lượng!` +
        `\n\nCung cấp vitamin gái cực sexy cho anh em đây!!!`;
      const timeToLive = 1000 * 60 * 60 * 1;
      await sendTaskGirlVideo(api, caption, timeToLive, "sexy");
    },
  },
  {
    cronExpression: "5 17 * * *",
    task: async (api) => {
      const caption =
        `-> SendTask 17:05 <-\nChào một buổi xế chiều đầy năng lượng!` +
        `\n\nGiải trí với nữ cosplay cho anh em đây!!!`;
      const timeToLive = 1000 * 60 * 60 * 1;
      await sendTaskGirlVideo(api, caption, timeToLive, "cosplay");
    },
  },
  {
    cronExpression: "30 17 * * *",
    task: async (api) => {
      await sendTaskMarketPrice(api, "fuel", "-> SendTask 17:30 <-\nCập nhật bảng giá xăng dầu mới nhất.", 60 * 60 * 1000);
    },
  },
  {
    cronExpression: "5 18 * * *",
    task: async (api) => {
      const caption =
        `-> SendTask 18:05 <-\nChúc buổi chiều thật chill và vui vẻ nhé!` +
        `\n\nĐón hoàng hôn ánh chiều tà thôi nào!!!`;
      const timeToLive = 1000 * 60 * 60 * 1;
      await sendTaskGirlVideo(api, caption, timeToLive, "sexy");
    },
  },
  {
    cronExpression: "5 19 * * *",
    task: async (api) => {
      const caption =
        `-> SendTask 19:05 <-\nChúc các bạn một buổi tối vui vẻ bên gia đình!` + `\n\nThư giãn cuối ngày thôi nào!!!`;
      const timeToLive = 1000 * 60 * 60 * 1;
      await sendTaskVideo(api, caption, timeToLive, "âm nhạc nhẹ nhàng");
    },
  },
  {
    cronExpression: "5 20 * * *",
    task: async (api) => {
      const caption =
        `-> SendTask 20:05 <-\nGiải trí bằng 1 bài nhạc` + `\ncho thời gian tỉnh táo nhất trong ngày!\n\n`;
      const timeToLive = 1000 * 60 * 60 * 2;
      await sendTaskMusic(api, caption, timeToLive);
    },
  },
  {
    cronExpression: "5 21 * * *",
    task: async (api) => {
      const caption = `-> SendTask 21:05 <-\nChào buổi tối bình yên!`;
      const timeToLive = 1000 * 60 * 60 * 1;
      await analyzeGroupInteractions(api, caption, timeToLive, false);
    },
  },
  {
    cronExpression: "5 22 * * *",
    task: async (api) => {
      const caption = `-> SendTask 22:05 <-\nChúc các bạn ngủ ngon!\n\n`;
      const timeToLive = 1000 * 60 * 60 * 5;
      await sendTaskMusic(api, caption, timeToLive);
    },
  },
  {
    cronExpression: "55 23 * * *",
    task: async (api) => {
      const caption = `-> SendTask 23:55 <-\nChuẩn Bị Đón Một Ngày Mới Thật Mới Mẻ Nào!`;
      const timeToLive = 1000 * 60 * 60 * 1;
      await analyzeGroupInteractions(api, caption, timeToLive, false);
    },
  },
];

async function sendTaskGirlVideo(api, caption, timeToLive, type = "default") {
  const groupSettings = groupSettingsAll.getByID(api.getBotId());
  const enabledThreadIds = Object.keys(groupSettings).filter((threadId) => groupSettings[threadId].sendTask);
  await runLimited(enabledThreadIds, async (threadId) => {
    const message = {
      threadId: threadId,
      type: MessageType.GroupMessage,
    };

    try {
      await sendRandomGirlVideo(api, message, caption, type, timeToLive);
    } catch (error) {
      console.error(`Lỗi khi gửi video gái in ${threadId}:`, error);
      if (error.message && error.message.includes("không tồn tại")) {
        groupSettings[threadId].sendTask = false;
        groupSettingsAll.setChanged();
      }
    }
  });
}

async function sendTaskVideo(api, caption, timeToLive, query) {
  const chillListVideo = await searchTiktok(query);
  if (chillListVideo) {
    const groupSettings = groupSettingsAll.getByID(api.getBotId());
    let captionFinal = `${caption}`;
    const enabledThreadIds = Object.keys(groupSettings).filter((threadId) => groupSettings[threadId].sendTask);
    await runLimited(enabledThreadIds, async (threadId) => {
      const message = {
        threadId: threadId,
        type: MessageType.GroupMessage,
      };

      try {
        const videoUrl = await getRandomVideoFromArray(api, message, chillListVideo);
        await api.sendVideo({
          videoUrl: videoUrl,
          threadId: message.threadId,
          threadType: message.type,
          message: {
            text: captionFinal,
          },
          ttl: timeToLive,
        });
      } catch (error) {
        console.error(`Lỗi khi gửi video tiktok in ${threadId}:`, error);
        if (error.message && error.message.includes("không tồn tại")) {
          groupSettings[threadId].sendTask = false;
          groupSettingsAll.setChanged();
        }
      }
    });
  }
}

async function sendTaskMusic(api, caption, timeToLive) {
  const groupSettings = groupSettingsAll.getByID(api.getBotId());
  const enabledThreadIds = Object.keys(groupSettings).filter((threadId) => groupSettings[threadId].sendTask);
  await runLimited(enabledThreadIds, async (threadId) => {
    const message = {
      threadId: threadId,
      type: MessageType.GroupMessage,
    };

    try {
      await handleRandomChartZingMp3(api, message, caption, timeToLive);
    } catch (error) {
      console.error(`Lỗi khi gửi nhạc in ${threadId}:`, error);
      if (error.message && error.message.includes("không tồn tại")) {
        groupSettings[threadId].sendTask = false;
        groupSettingsAll.setChanged();
      }
    }
  });
}

async function sendTaskLunarCalendar(api, caption, timeToLive) {
  const groupSettings = groupSettingsAll.getByID(api.getBotId());
  const enabledThreadIds = Object.keys(groupSettings).filter((threadId) => groupSettings[threadId].sendTask);
  await runLimited(enabledThreadIds, async (threadId) => {
    const message = {
      threadId,
      type: MessageType.GroupMessage,
    };

    let imagePath = null;
    try {
      imagePath = await generateLunarCalendarImage();
      const dataUpload = await api.uploadAttachment([imagePath], message.threadId, message.type);
      const imageUrl = dataUpload[0].fileUrl || dataUpload[0].normalUrl;

      await api.sendImage(imageUrl, message, caption, timeToLive);
    } catch (error) {
      console.error(`Lỗi khi gửi lịch âm dương in ${threadId}:`, error);
      if (error.message && error.message.includes("không tồn tại")) {
        groupSettings[threadId].sendTask = false;
        groupSettingsAll.setChanged();
      }
    } finally {
      deleteFile(imagePath);
    }
  });
}

async function sendTaskOverallWeather(api, caption, timeToLive) {
  const groupSettings = groupSettingsAll.getByID(api.getBotId());
  const enabledThreadIds = Object.keys(groupSettings).filter((threadId) => groupSettings[threadId].sendTask);
  await runLimited(enabledThreadIds, async (threadId) => {
    const message = {
      threadId,
      type: MessageType.GroupMessage,
    };

    try {
      await getSendtaskOverallWeather(api, message, caption, timeToLive);
    } catch (error) {
      console.error(`Lỗi khi gửi thời tiết tổng quan in ${threadId}:`, error);
      if (error.message && error.message.includes("không tồn tại")) {
        groupSettings[threadId].sendTask = false;
        groupSettingsAll.setChanged();
      }
    }
  });
}

async function sendTaskMarketPrice(api, kind, caption, timeToLive) {
  const groupSettings = groupSettingsAll.getByID(api.getBotId());
  const enabledThreadIds = Object.keys(groupSettings).filter((threadId) => groupSettings[threadId].sendTask);
  if (!enabledThreadIds.length) return;

  let imagePath;
  try {
    if (kind === "gold") {
      const { createGoldImage, fetchGoldOverview } = await import("../../commands/send-all/check-gia-vang.js");
      const prices = await fetchGoldOverview();
      imagePath = await createGoldImage("Vàng tổng hợp thị trường", prices);
    } else {
      const { createFuelPriceImage, fetchFuelPrices } = await import("../../commands/send-all/check-gia-xang.js");
      const { prices, source } = await fetchFuelPrices();
      imagePath = await createFuelPriceImage(prices, source);
    }

    await runLimited(enabledThreadIds, async (threadId) => {
      const message = { threadId, type: MessageType.GroupMessage };
      try {
        const uploaded = await api.uploadAttachment([imagePath], threadId, MessageType.GroupMessage);
        const imageUrl = uploaded?.[0]?.fileUrl || uploaded?.[0]?.normalUrl;
        if (!imageUrl) throw new Error("Upload canvas không trả về URL");
        await api.sendImage(imageUrl, message, caption, timeToLive);
      } catch (error) {
        console.error(`Lỗi gửi sendtask ${kind} vào nhóm ${threadId}:`, error);
        if (error.message?.includes("không tồn tại")) {
          groupSettings[threadId].sendTask = false;
          groupSettingsAll.setChanged();
        }
      }
    });
  } catch (error) {
    console.error(`Lỗi tạo sendtask ${kind}:`, error);
  } finally {
    if (imagePath) await deleteFile(imagePath).catch(() => {});
  }
}

async function analyzeGroupInteractions(api, caption, timeToLive) {
  const idBot = api.getBotId();
  const groupSettings = groupSettingsAll.getByID(idBot);

  const enabledThreadIds = Object.keys(groupSettings).filter((threadId) => groupSettings[threadId].sendTask);
  await runLimited(enabledThreadIds, async (threadId) => {
    try {
      await analyzeGroupInteractionsByThreadId(api, threadId, caption, timeToLive);
    } catch (error) {
      console.error(`Lỗi khi phân tích tương tác nhóm ${threadId}:`, error);
      if (error.message && error.message.includes("không tồn tại")) {
        groupSettings[threadId].sendTask = false;
        groupSettingsAll.setChanged();
      }
    }
  });
}

export async function initializeScheduler(api) {
  scheduledTasks.forEach((taskConfig) => {
    if (api.apiInstance.schedule[taskConfig.cronExpression]) return;
    api.apiInstance.schedule[taskConfig.cronExpression] = schedule.scheduleJob(taskConfig.cronExpression, () => {
      taskConfig.task(api).catch((error) => {
        console.error("Lỗi khi thực thi tác vụ định kỳ:", error);
      });
    });
  });

  const lockChatJobKey = "lockChatDailySchedule";
  if (!api.apiInstance.schedule[lockChatJobKey]) {
    api.apiInstance.schedule[lockChatJobKey] = schedule.scheduleJob("*/10 * * * * *", () => {
      processLockChatSchedules(api).catch((error) => {
        console.error("Lỗi kiểm tra lịch khóa/mở chat:", error);
      });
    });
  }

  const customTaskJobKey = "customSendTaskSchedule";
  if (!api.apiInstance.schedule[customTaskJobKey]) {
    api.apiInstance.schedule[customTaskJobKey] = schedule.scheduleJob("5 * * * * *", () => {
      processCustomSendTasks(api).catch((error) => console.error("Lỗi kiểm tra lịch sendtask tùy chỉnh:", error));
    });
  }
}
