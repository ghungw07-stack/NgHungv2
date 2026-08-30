import { parentPort, workerData } from "worker_threads";
import youtubedl from "youtube-dl-exec";

async function downloadVideo(videoUrl, videoPath, options) {
  const isYoutube = /(?:youtube\.com|youtu\.be)/i.test(videoUrl);
  const isAudio = Boolean(options.extractAudio);
  const attempts = isYoutube
    ? [
        options,
        {
          ...options,
          // Progressive MP4 contains both video and audio and is much less
          // likely to be rejected than separate DASH media URLs. For audio,
          // yt-dlp/ffmpeg extracts MP3 from this fallback automatically.
          extractorArgs: "youtube:player_client=android_vr",
          format: "18",
          forceOverwrites: true,
        },
        {
          ...options,
          // Keep clients in separate attempts. Combining clients can mix a
          // format URL and a client identity, which YouTube rejects with 403.
          extractorArgs: "youtube:player_client=tv",
          forceOverwrites: true,
        },
        {
          ...options,
          // Safari's HLS streams currently do not require a GVS PO token.
          extractorArgs: "youtube:player_client=web_safari",
          format: isAudio ? "bestaudio[protocol^=m3u8]/best[protocol^=m3u8]" : "best[protocol^=m3u8]",
          forceOverwrites: true,
        },
      ]
    : [options];

  let lastError;
  for (const attemptOptions of attempts) {
    try {
      await youtubedl(videoUrl, attemptOptions);
      parentPort.postMessage({ success: true, videoPath });
      return;
    } catch (error) {
      lastError = error;
      const forbidden = /(?:HTTP Error 403|403 Forbidden|status code 403)/i.test(error.message || "");
      const unavailable = /(?:requested format is not available|no video formats found)/i.test(error.message || "");
      const reloadRequired = /page needs to be reloaded/i.test(error.message || "");
      if (!forbidden && !unavailable && !reloadRequired) break;
    }
  }

  parentPort.postMessage({
    success: false,
    error: lastError?.message || "Không thể tải dữ liệu video YouTube",
  });
}

downloadVideo(workerData.videoUrl, workerData.videoPath, workerData.options);
