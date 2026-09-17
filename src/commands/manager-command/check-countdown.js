const START_DELAY_MS = 500;
const MAX_COUNTDOWN_REACTIONS = 60;

function countdownTicks(count) {
  return Math.max(0, Math.ceil(Number(count) || 0));
}

function cancelClock(entry) {
  clearTimeout(entry.startTimer);
  clearTimeout(entry.endTimer);
  entry.cancelled = true;
  if (entry.batch?.length) {
    void entry.api.addReaction("UNDO", entry.batch).catch(() => {});
    entry.batch = null;
  }
}

// Zalo hiển thị số trên CLOCK theo số phần tử trong batch. Vì vậy phải gửi
// cùng tin nhắn lặp `số giây còn lại` lần, rồi UNDO sau một giây.
function startCountdownClock(api, message, count, onComplete, onError) {
  const entry = { api, cancelled: false, startTimer: null, endTimer: null, batch: null };
  entry.startTimer = setTimeout(async () => {
    if (entry.cancelled) return;
    const deadline = Date.now() + countdownTicks(count) * 1000;
    while (!entry.cancelled) {
      const remaining = Math.ceil((deadline - Date.now()) / 1000);
      if (remaining <= 0) break;
      const batch = Array(Math.min(remaining, MAX_COUNTDOWN_REACTIONS)).fill(message);
      entry.batch = batch;
      try {
        await api.addReaction("CLOCK", batch);
      } catch (error) {
        onError?.(error);
      }
      entry.endTimer = setTimeout(async () => {
        if (entry.cancelled || entry.batch !== batch) return;
        try {
          await api.addReaction("UNDO", batch);
        } catch (error) {
          onError?.(error);
        }
      }, 1000);
      await new Promise((resolve) => { entry.endTimer = setTimeout(resolve, 1000); });
      if (entry.cancelled) break;
      entry.batch = null;
    }
    if (!entry.cancelled) await onComplete?.();
  }, START_DELAY_MS);
  return entry;
}

const countdownJobs = new Map();

export async function sendReactionWaitingCountdown(api, message, count, commandName, fnAfterCountdown) {
  const senderId = message.data.uidFrom;
  const jobKey = `${api.getBotId()}_${message.threadId}_${senderId}_${commandName}`;
  const previous = countdownJobs.get(jobKey);
  if (previous) cancelClock(previous);

  const entry = startCountdownClock(
    api,
    message,
    count,
    async () => {
      countdownJobs.delete(jobKey);
      await fnAfterCountdown?.();
    },
    (error) => console.warn(`[countdown] ${commandName} reaction lỗi:`, error?.message || error)
  );
  countdownJobs.set(jobKey, entry);
  return jobKey;
}

class JobSendClock {
  constructor() {
    this.jobs = new Map();
  }

  addJob(api, message, count, commandName, fnAfterCountdown) {
    const senderId = message.data.uidFrom;
    const threadId = message.threadId;
    const jobKey = `${senderId}_${threadId}_${commandName}`;
    const previous = this.jobs.get(jobKey);
    if (previous) cancelClock(previous);

    const entry = startCountdownClock(
      api,
      message,
      count,
      async () => {
        this.jobs.delete(jobKey);
        await fnAfterCountdown?.();
      },
      (error) => console.warn(`[countdown] ${commandName} reaction lỗi:`, error?.message || error)
    );
    this.jobs.set(jobKey, entry);
    return jobKey;
  }

  cancelJob(senderId, threadId, commandName) {
    const jobKey = `${senderId}_${threadId}_${commandName}`;
    const entry = this.jobs.get(jobKey);
    if (!entry) return;
    cancelClock(entry);
    this.jobs.delete(jobKey);
  }

  async cancelJobByKey(jobKey) {
    const entry = this.jobs.get(jobKey);
    if (!entry) return;
    cancelClock(entry);
    this.jobs.delete(jobKey);
  }
}

export const jobSendClock = new JobSendClock();
