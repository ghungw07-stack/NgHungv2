import schedule from "node-schedule";

/**
 * Bộ gom cron toàn cục: các cron expression trùng nhau sẽ dùng chung 1 job nền
 * và lần lượt gọi danh sách handler đã đăng ký. Giúp giảm số lượng timer
 * chạy song song và dễ huỷ theo từng handler.
 */
const cronBuckets = new Map();
const originalScheduleJob = schedule.scheduleJob.bind(schedule);
let handlerSeq = 0;

function nextId() {
  handlerSeq += 1;
  return `job-${Date.now()}-${handlerSeq}`;
}

async function runBucket(rule) {
  const bucket = cronBuckets.get(rule);
  if (!bucket) return;

  for (const handler of bucket.handlers.values()) {
    try {
      // đảm bảo tuần tự để tránh dồn tải nếu handler nặng
      // eslint-disable-next-line no-await-in-loop
      await handler();
    } catch (err) {
      console.error(`[shared-schedule][${rule}]`, err);
    }
  }
}

function createSharedJob(rule, handler, id) {
  let bucket = cronBuckets.get(rule);
  if (!bucket) {
    const job = originalScheduleJob(rule, () => {
      runBucket(rule);
    });
    bucket = { job, handlers: new Map() };
    cronBuckets.set(rule, bucket);
  }

  const handlerId = id || nextId();
  bucket.handlers.set(handlerId, handler);

  const handle = {
    name: `shared:${rule}:${handlerId}`,
    cancel() {
      const current = cronBuckets.get(rule);
      if (!current) return;
      current.handlers.delete(handlerId);
      if (current.handlers.size === 0) {
        current.job.cancel();
        cronBuckets.delete(rule);
      }
    },
    nextInvocation() {
      return bucket.job?.nextInvocation?.();
    },
    pendingInvocations() {
      return bucket.job?.pendingInvocations?.();
    },
    // chạy thủ công 1 lần handler đang đăng ký
    async invoke() {
      return Promise.resolve()
        .then(() => handler())
        .catch((err) => {
          console.error(`[shared-schedule][invoke][${rule}]`, err);
        });
    },
  };

  return handle;
}

/**
 * scheduleJob thay thế: nếu rule là cron string & callback là function,
 * gộp theo cron; các trường hợp khác fallback về node-schedule gốc.
 */
function patchedScheduleJob(rule, callback, ...rest) {
  if (typeof rule === "string" && typeof callback === "function" && rest.length === 0) {
    return createSharedJob(rule, callback);
  }
  // Giữ nguyên hành vi cũ cho các kiểu rule khác (Date, RecurrenceRule, name,...)
  return originalScheduleJob(rule, callback, ...rest);
}

// Gắn đè toàn cục
if (!global.__SHARED_SCHEDULE_PATCHED__) {
  // eslint-disable-next-line no-underscore-dangle
  global.__SHARED_SCHEDULE_PATCHED__ = true;
  schedule.scheduleJob = patchedScheduleJob;
}

export { patchedScheduleJob as scheduleJob, createSharedJob, cronBuckets, originalScheduleJob };
export default schedule;
