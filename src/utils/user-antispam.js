/**
 * Module chống spam tương tác và lệnh Bot (User Anti-Spam Guard)
 * 
 * Quy tắc:
 * 1. Khoảng cách an toàn giữa các lệnh/tương tác: tối thiểu 1.5s.
 * 2. Nếu spam quá nhanh (dưới 1.5s hoặc gửi dồn dập > 3 lệnh trong 3 giây):
 *    - Bot tự động IM LẶNG (bỏ qua hoàn toàn, KHÔNG gửi bất kỳ tin nhắn/cảnh báo nào).
 *    - Phạt lần 1: Im lặng trong 30 giây.
 *    - Phạt lần 2: Im lặng trong 1 phút (60 giây).
 *    - Phạt lần 3 trở lên: Nhân đôi thời gian phạt (2 phút, 4 phút, 8 phút...).
 * 3. Sau 1 tiếng (3600s) kể từ lần phạt cuối: Tự động reset dữ liệu phạt của người đó để xử lý lại từ đầu.
 * 4. Bot chủ/Leader/Admin tối cao và chính tài khoản bot được miễn kiểm tra.
 */

const userSpamMap = new Map();
const MIN_INTERVAL_MS = 1500; // Khoảng cách tối thiểu giữa 2 lần gọi bot (1.5 giây)
const RAPID_WINDOW_MS = 3000;  // Khung thời gian xét spam dồn dập (3 giây)
const RAPID_MAX_COUNT = 3;     // Tối đa 3 lần trong 3 giây
const BASE_SILENCE_MS = 30 * 1000; // Mức phạt lần 1: 30s
const RESET_WINDOW_MS = 60 * 60 * 1000; // 1 tiếng (3600s) để reset phạt

/**
 * Kiểm tra xem người dùng có đang trong thời gian bị phạt im lặng hay không.
 * @param {string} userId
 * @returns {boolean} true nếu đang bị im lặng
 */
export function isUserSilenced(userId) {
  if (!userId) return false;
  const userRecord = userSpamMap.get(String(userId));
  if (!userRecord) return false;

  const now = Date.now();
  // Nếu đã quá 1 tiếng kể từ lần spam cuối -> tự reset
  if (userRecord.lastSpamTime > 0 && now - userRecord.lastSpamTime >= RESET_WINDOW_MS) {
    userRecord.penaltyCount = 0;
    userRecord.silenceUntil = 0;
    userRecord.lastSpamTime = 0;
    return false;
  }

  return now < userRecord.silenceUntil;
}

/**
 * Kiểm tra và áp dụng cơ chế chống spam cho người dùng khi gọi lệnh / tương tác bot.
 * @param {string} userId - ID người dùng gửi tin
 * @param {boolean} isExempt - true nếu được miễn (chủ bot, admin tối cao, self)
 * @returns {boolean} true nếu hợp lệ (cho phép tiếp tục), false nếu bị chặn/im lặng
 */
export function checkUserSpamGuard(userId, isExempt = false) {
  if (!userId || isExempt) return true;

  const uid = String(userId);
  const now = Date.now();
  let userRecord = userSpamMap.get(uid);

  if (!userRecord) {
    userRecord = {
      penaltyCount: 0,
      silenceUntil: 0,
      lastInteractionTime: now,
      lastSpamTime: 0,
      recentTimestamps: [now],
    };
    userSpamMap.set(uid, userRecord);
    return true;
  }

  // Nếu đã qua 1 tiếng kể từ lần phạt/spam cuối cùng -> reset mức phạt về 0
  if (userRecord.lastSpamTime > 0 && now - userRecord.lastSpamTime >= RESET_WINDOW_MS) {
    userRecord.penaltyCount = 0;
    userRecord.silenceUntil = 0;
    userRecord.lastSpamTime = 0;
  }

  // Nếu đang trong thời gian phạt im lặng -> âm thầm bỏ qua
  if (now < userRecord.silenceUntil) {
    return false;
  }

  // Lọc các timestamp trong khung 3s
  userRecord.recentTimestamps = userRecord.recentTimestamps.filter(
    (ts) => now - ts < RAPID_WINDOW_MS
  );
  userRecord.recentTimestamps.push(now);

  const timeSinceLast = now - userRecord.lastInteractionTime;
  const isTooFast = timeSinceLast < MIN_INTERVAL_MS;
  const isBurstSpam = userRecord.recentTimestamps.length > RAPID_MAX_COUNT;

  if (isTooFast || isBurstSpam) {
    userRecord.penaltyCount += 1;
    userRecord.lastSpamTime = now;

    // Lần 1: 30s, Lần 2: 60s (1p), Lần 3: 120s (2p), Lần 4: 240s (4p)...
    const silenceDuration = BASE_SILENCE_MS * Math.pow(2, userRecord.penaltyCount - 1);
    userRecord.silenceUntil = now + silenceDuration;
    userRecord.lastInteractionTime = now;
    return false;
  }

  userRecord.lastInteractionTime = now;
  return true;
}

/**
 * Xóa trạng thái phạt thủ công cho 1 user nếu cần
 */
export function resetUserSpamGuard(userId) {
  if (userId) {
    userSpamMap.delete(String(userId));
  }
}

// Tự động dọn dẹp bộ nhớ định kỳ mỗi 15 phút cho các user không còn hoạt động
setInterval(() => {
  const now = Date.now();
  for (const [userId, record] of userSpamMap.entries()) {
    if (now - record.lastInteractionTime > RESET_WINDOW_MS && now > record.silenceUntil) {
      userSpamMap.delete(userId);
    }
  }
}, 15 * 60 * 1000).unref?.();
