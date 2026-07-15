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
  const promises = Object.keys(groupSettings).map(async (threadId) => {
    if (!groupSettings[threadId].sendTask) return;

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

  await Promise.allSettled(promises);
}

async function sendTaskVideo(api, caption, timeToLive, query) {
  const chillListVideo = await searchTiktok(query);
  if (chillListVideo) {
    const groupSettings = groupSettingsAll.getByID(api.getBotId());
    let captionFinal = `${caption}`;
    const promises = Object.keys(groupSettings).map(async (threadId) => {
      if (!groupSettings[threadId].sendTask) return;

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

    await Promise.allSettled(promises);
  }
}

async function sendTaskMusic(api, caption, timeToLive) {
  const groupSettings = groupSettingsAll.getByID(api.getBotId());
  const promises = Object.keys(groupSettings).map(async (threadId) => {
    if (!groupSettings[threadId].sendTask) return;

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

  await Promise.allSettled(promises);
}

async function sendTaskLunarCalendar(api, caption, timeToLive) {
  const groupSettings = groupSettingsAll.getByID(api.getBotId());
  const promises = Object.keys(groupSettings).map(async (threadId) => {
    if (!groupSettings[threadId].sendTask) return;

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

  await Promise.allSettled(promises);
}

async function sendTaskOverallWeather(api, caption, timeToLive) {
  const groupSettings = groupSettingsAll.getByID(api.getBotId());
  const promises = Object.keys(groupSettings).map(async (threadId) => {
    if (!groupSettings[threadId].sendTask) return;

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

  await Promise.allSettled(promises);
}

async function analyzeGroupInteractions(api, caption, timeToLive) {
  const idBot = api.getBotId();
  const groupSettings = groupSettingsAll.getByID(idBot);

  const promises = Object.keys(groupSettings).map(async (threadId) => {
    if (!groupSettings[threadId].sendTask) return;

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

  await Promise.allSettled(promises);
}

export async function initializeScheduler(api) {
  scheduledTasks.forEach((taskConfig) => {
    api.apiInstance.schedule[taskConfig.cronExpression] = schedule.scheduleJob(taskConfig.cronExpression, () => {
      taskConfig.task(api).catch((error) => {
        console.error("Lỗi khi thực thi tác vụ định kỳ:", error);
      });
    });
  });
}
