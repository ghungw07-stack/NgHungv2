const DEFAULT_TTL_MS = 30 * 60 * 1000;
const MAX_ENTRIES = 1000;
const uploadSizes = new WeakMap();

export function rememberUploadSize(context, value, size, ttlMs = DEFAULT_TTL_MS) {
  if (!Number.isSafeInteger(size) || size < 0) return;
  let url;
  try { url = new URL(value).toString(); } catch { return; }
  let cache = uploadSizes.get(context);
  if (!cache) uploadSizes.set(context, cache = new Map());
  cache.delete(url);
  cache.set(url, { size, expiresAt: Date.now() + ttlMs });
  if (cache.size > MAX_ENTRIES) cache.delete(cache.keys().next().value);
}

export function getUploadSize(context, value) {
  const cache = uploadSizes.get(context);
  if (!cache) return undefined;
  let url;
  try { url = new URL(value); } catch { return undefined; }
  const candidates = [url.toString()];
  // uploadAudioFile appends /<timestamp>.aac to extensionless Zalo URLs.
  // Preserve the origin and query so another file/account cannot share its size.
  if (/\/\d{13,}\.(?:aac|m4a|mp3)$/i.test(url.pathname)) {
    url.pathname = url.pathname.replace(/\/\d{13,}\.(?:aac|m4a|mp3)$/i, "");
    candidates.push(url.toString());
  }
  for (const key of candidates) {
    const entry = cache.get(key);
    if (!entry) continue;
    if (entry.expiresAt <= Date.now()) {
      cache.delete(key);
      continue;
    }
    return entry.size;
  }
  return undefined;
}
