const LEVELS = Object.freeze({ debug: 10, info: 20, warn: 30, error: 40 });

export function createLogger({ level = process.env.LOG_LEVEL || "info", context = {} } = {}) {
  const threshold = LEVELS[level] ?? LEVELS.info;
  const write = (name, message, data = {}) => {
    if (LEVELS[name] < threshold) return;
    const record = { time: new Date().toISOString(), level: name, message, ...context, ...data };
    const output = JSON.stringify(record);
    (name === "error" ? console.error : name === "warn" ? console.warn : console.log)(output);
  };
  return {
    debug: (message, data) => write("debug", message, data),
    info: (message, data) => write("info", message, data),
    warn: (message, data) => write("warn", message, data),
    error: (message, data) => write("error", message, data),
    child: (extra) => createLogger({ level, context: { ...context, ...extra } }),
  };
}
