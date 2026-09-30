export function parseSoundCloudRelayJson(value) {
  if (value && typeof value === "object") return value;
  const text = String(value || "");
  const marker = "Markdown Content:";
  const start = text.indexOf(marker);
  return JSON.parse((start >= 0 ? text.slice(start + marker.length) : text).trim());
}

export function buildSoundCloudDownloadRelayUrl(track) {
  const trackUrl = String(track?.permalink_url || "").trim();
  if (!/^https?:\/\/soundcloud\.com\//i.test(trackUrl)) return null;

  const relayUrl = new URL("https://soundcloudmp3.org/download.php");
  relayUrl.searchParams.set("sc", trackUrl);
  relayUrl.searchParams.set("title", String(track?.title || "SoundCloud audio"));
  relayUrl.searchParams.set("artist", String(track?.user?.username || "SoundCloud"));
  return relayUrl.toString();
}

function normalizeSoundCloudArtwork(source) {
  return source
    .replace(/-large(?=\.[a-z]+(?:\?|$))/i, "-t500x500")
    .replace(/-t50x50(?=\.[a-z]+(?:\?|$))/i, "-t500x500");
}

export function resolveSoundCloudArtworkCandidates(track) {
  return [...new Set([
    track?.artwork_url,
    track?.publisher_metadata?.artwork_url,
    track?.visuals?.visuals?.[0]?.visual_url,
    track?.waveform_url,
    track?.user?.avatar_url,
  ]
    .filter((value) => typeof value === "string" && /^https?:\/\//i.test(value))
    .map(normalizeSoundCloudArtwork))];
}

export function resolveSoundCloudArtwork(track) {
  return resolveSoundCloudArtworkCandidates(track)[0] || null;
}

export function resolveSoundCloudCanvasArtwork(track) {
  const artwork = resolveSoundCloudArtwork(track);
  if (!artwork) return null;
  try {
    const url = new URL(artwork);
    if (!url.hostname.endsWith("sndcdn.com")) return artwork;
    return `https://images.weserv.nl/?url=${encodeURIComponent(artwork)}&w=180&h=180&fit=cover&output=jpg`;
  } catch {
    return artwork;
  }
}
