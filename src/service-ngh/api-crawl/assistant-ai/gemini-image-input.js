const IMAGE_URL = /^https?:\/\//iu;

export function extractGeminiImageUrls(...values) {
  const urls = [];
  const visit = value => {
    if (!value) return;
    if (typeof value === "string") {
      if (IMAGE_URL.test(value) && !urls.includes(value)) urls.push(value);
      else if (/^[{[]/u.test(value.trim())) {
        try { visit(JSON.parse(value)); } catch {}
      }
      return;
    }
    if (Array.isArray(value)) return value.forEach(visit);
    if (typeof value !== "object") return;
    for (const [key, child] of Object.entries(value)) {
      if (/^(?:href|url|src|downloadUrl|originalUrl)$/iu.test(key)) visit(child);
      else if (/^(?:attachments?|images?|photos?|items?|params|webp)$/iu.test(key)) visit(child);
    }
  };
  values.forEach(visit);
  return urls.slice(0, 4);
}
