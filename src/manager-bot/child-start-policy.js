const INVALID_CREDENTIAL_PATTERN =
  /cookie|credential|imei|master key|không giải mã|đăng nhập.{0,40}(?:không hợp lệ|hết hạn)|login.{0,40}(?:invalid|expired)|session.{0,40}(?:invalid|expired)|phiên.{0,40}(?:không hợp lệ|hết hạn)/i;
const START_TIMEOUT_PATTERN = /khởi động bot quá\s+\d+(?:\.\d+)?s/i;

function getErrorMessage(reason) {
  return reason?.message || String(reason || "");
}

export function isInvalidChildCredentialError(reason) {
  return INVALID_CREDENTIAL_PATTERN.test(getErrorMessage(reason));
}

export function shouldRetryChildStart(reason) {
  if (reason?.code === "CHILD_START_TIMEOUT") return false;
  const message = getErrorMessage(reason);
  if (START_TIMEOUT_PATTERN.test(message)) return false;
  if (isInvalidChildCredentialError(reason)) return false;
  return !/bot chưa được thanh toán|hết hạn kích hoạt/i.test(message);
}

export function runChildPostStartTask(task, { timeoutMs = 30_000, onError } = {}) {
  if (typeof task !== "function") throw new TypeError("Child post-start task phải là function");

  let timeoutId;
  const timeout = new Promise((_, reject) => {
    timeoutId = setTimeout(() => {
      const error = new Error(`Tác vụ sau khởi động bot quá ${timeoutMs}ms`);
      error.code = "CHILD_POST_START_TIMEOUT";
      reject(error);
    }, timeoutMs);
    timeoutId.unref?.();
  });

  return Promise.race([Promise.resolve().then(task), timeout])
    .then((value) => ({ ok: true, value }))
    .catch((error) => {
      onError?.(error);
      return { ok: false, error };
    })
    .finally(() => clearTimeout(timeoutId));
}
