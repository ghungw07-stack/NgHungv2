const _5_MINUTES = 5 * 60 * 1000;
class CallbacksMap extends Map {
  constructor(...args) {
    super(...args);
    this.expiryTimers = new Map();
  }

  /**
   * @param ttl
   */
  set(key, value, ttl = _5_MINUTES) {
    const previousTimer = this.expiryTimers.get(key);
    if (previousTimer) clearTimeout(previousTimer);
    const timer = setTimeout(() => {
      // A key can be reused by a later upload. Only expire the exact value
      // which installed this timer, otherwise an old timer deletes new state.
      if (this.get(key) === value) super.delete(key);
      this.expiryTimers.delete(key);
    }, ttl);
    timer.unref?.();
    this.expiryTimers.set(key, timer);
    return super.set(key, value);
  }

  delete(key) {
    const timer = this.expiryTimers.get(key);
    if (timer) clearTimeout(timer);
    this.expiryTimers.delete(key);
    return super.delete(key);
  }

  clear() {
    for (const timer of this.expiryTimers.values()) clearTimeout(timer);
    this.expiryTimers.clear();
    return super.clear();
  }
}
export const createContext = (credentials, options, apiType = 30, apiVersion = 665) => ({
  uploadCallbacks: new CallbacksMap(),
  // Upload completion events can arrive before uploadAttachment has finished
  // processing the last chunk. Keep those events briefly instead of dropping
  // them when no waiter has been registered yet.
  uploadResults: new CallbacksMap(),
  imei: credentials.imei,
  userAgent: credentials.userAgent,
  language: credentials.language || "vi",
  timeMessage: credentials.timeMessage || 0,
  secretKey: null,
  options: Object.assign(
    {
      polyfill: global.fetch,
    },
    {
      apiVersion: apiVersion,
      typeLogin: apiType,
    },
    options
  ),
});
export function isContextHaveSecretKey(ctx) {
  return !!ctx.secretKey;
}
