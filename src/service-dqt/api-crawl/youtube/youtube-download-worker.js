import { parentPort, workerData } from "worker_threads";
import youtubedl from "youtube-dl-exec";

async function downloadVideo(videoUrl, videoPath, options) {
  try {
    await youtubedl(videoUrl, options);
    parentPort.postMessage({ success: true, videoPath });
  } catch (error) {
    parentPort.postMessage({
      success: false,
      error: error.message,
    });
  }
}

downloadVideo(workerData.videoUrl, workerData.videoPath, workerData.options);
