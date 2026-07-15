import schedule from "node-schedule";

const countdownJobs = new Map();

export async function sendReactionWaitingCountdown(api, message, count, commandName, fnAfterCountdown) {
  const messages = Array(count).fill(message);
  const messageId = message.data.cliMsgId || Date.now().toString();
  const senderId = message.data.uidFrom;

  const jobKey = `${senderId}_${commandName}`;

  for (const [key, value] of countdownJobs.entries()) {
    if (value.jobKeyCommand === jobKey) {
      value.job.shouldStop = true;
      countdownJobs.delete(key);
    }
  }

  const date = new Date(Date.now() + 500);

  const job = schedule.scheduleJob(date, async () => {
    try {
      job.shouldStop = false;
      while (messages.length > 0 && !job.shouldStop) {
        try {
          await api.addReaction("CLOCK", messages);
          await new Promise((resolve) => setTimeout(resolve, 1000));
          await api.addReaction("UNDO", messages);
        } catch (error) {}
        messages.splice(0, 1);
        if (messages.length === 0) {
          if (fnAfterCountdown) {
            await fnAfterCountdown();
          }
        }
      }
    } catch (error) {
      console.error(`Error in countdown job ${messageId}:`, error);
    } finally {
      job.cancel();
      countdownJobs.delete(jobKey);
    }
  });

  countdownJobs.set(jobKey + Date.now().toString(), {
    job: job,
    jobKeyCommand: jobKey,
  });
}

class JobSendClock {
  constructor() {
    this.jobs = new Map();
  }

  /**
   * Thêm và chạy một countdown job
   */
  addJob(api, message, count, commandName, fnAfterCountdown) {
    const messages = Array(count).fill(message);
    const messageId = message.data.cliMsgId || Date.now().toString();
    const senderId = message.data.uidFrom;
    const threadId = message.threadId;
    const jobKey = `${senderId}_${threadId}_${commandName}`;

    for (const [key, value] of this.jobs.entries()) {
      if (value.jobKeyCommand === jobKey) {
        value.job.shouldStop = true;
        this.jobs.delete(key);
      }
    }

    const startDate = new Date(Date.now() + 500);

    const job = schedule.scheduleJob(startDate, async () => {
      try {
        job.shouldStop = false;
        while (messages.length > 0 && !job.shouldStop) {
          try {
            await api.addReaction("CLOCK", messages);
            await new Promise((resolve) => setTimeout(resolve, 1000));
            await api.addReaction("UNDO", messages);
          } catch (error) {
            console.error("Reaction error:", error);
          }

          messages.splice(0, 1);

          if (messages.length === 0 && fnAfterCountdown) {
            await fnAfterCountdown();
          }
        }
      } catch (error) {
        console.error(`Error in countdown job ${messageId}:`, error);
      } finally {
        job.cancel();
        this.jobs.delete(jobKey);
      }
    });

    this.jobs.set(jobKey + "_" + Date.now().toString(), {
      job: job,
      jobKeyCommand: jobKey,
    });

    return jobKey;
  }

  /**
   * Hủy job dựa vào senderId và commandName (nhưng cho phép vòng lặp hiện tại hoàn thành)
   */
  cancelJob(senderId, threadId, commandName) {
    const jobKey = `${senderId}_${threadId}_${commandName}`;
    for (const [key, value] of this.jobs.entries()) {
      if (value.jobKeyCommand === jobKey) {
        value.job.shouldStop = true;
        this.jobs.delete(key);
      }
    }
  }

  /**
   * Hủy job dựa vào jobKey (nhưng cho phép vòng lặp hiện tại hoàn thành)
   */
  async cancelJobByKey(jobKey) {
    if (!jobKey) return;

    const timeout = 60 * 1000;
    const interval = 1000;
    const start = Date.now();

    while (Date.now() - start < timeout) {
      for (const [key, value] of this.jobs.entries()) {
        if (value.jobKeyCommand === jobKey) {
          value.job.shouldStop = true;
          this.jobs.delete(key);
          return;
        }
      }

      await new Promise((resolve) => setTimeout(resolve, interval));
    }
  }
}

export const jobSendClock = new JobSendClock();
