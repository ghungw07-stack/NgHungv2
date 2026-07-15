const _5_MINUTES = 5 * 60 * 1000;
class CallbacksMap extends Map {
  /**
   * @param ttl
   */
  set(key, value, ttl = _5_MINUTES) {
    setTimeout(() => {
      this.delete(key);
    }, ttl);
    return super.set(key, value);
  }
}
export const createContext = (credentials, options, apiType = 30, apiVersion = 665) => ({
  uploadCallbacks: new CallbacksMap(),
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
