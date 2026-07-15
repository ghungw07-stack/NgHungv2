import axios from "axios";
import fs from "fs";
import { exec, spawn } from "child_process";
import * as cheerio from "cheerio";
import youtubeDl from "youtube-dl-exec";
import HttpsProxyAgent from "https-proxy-agent";
import { asyncPool, getVideoMetadata } from "../../api-zalo/utils.js";
import { getClientAxios } from "../../service-dqt/utilities/browser-launch.js";
import { readSettingConfig } from "../io-json.js";
import { deleteFile, execAsync, measureTime } from "../util.js";

export async function getLinkFileM3U8(linkRaw) {
  let objReturn = { type: "", url: "" };
  const clientAxios = getClientAxios();
  if (linkRaw.includes("www.facebook.com/plugins")) {
    const [_, linkPluginFacebook] = linkActive.split("href=");
    if (linkPluginFacebook) {
      const streamLink = await youtubeDl(decodeURIComponent(linkPluginFacebook), {
        dumpSingleJson: true,
        noWarnings: true,
        noCheckCertificate: true,
        preferFreeFormats: true,
        youtubeSkipDashManifest: true,
      });
      let findLink = streamLink.formats.find((item) => item["format_id"] === "hd");
      if (findLink) {
        objReturn.url = findLink.url;
        objReturn.type = "stream";
      }
    }
  } else if (linkRaw.includes("/play-fb")) {
    const responseFilmNow = await clientAxios.get(linkRaw);
    let $ = cheerio.load(responseFilmNow.data);
    const scriptTags = $("script");
    for (const script of scriptTags) {
      const scriptContent = $(script).html();
      if (scriptContent && scriptContent.includes("var cccc =")) {
        const regex = /var cccc = "(.*?)"/;
        const match = scriptContent.match(regex);
        if (match && match[1]) {
          objReturn.url = match[1];
          objReturn.type = "stream";
        }
      }
    }
  } else if (linkRaw.includes("cdn.ink") || linkRaw.includes("hlstream")) {
    objReturn.url = linkRaw + "/master.html";
    objReturn.type = "m3u8";
  } else if (linkRaw.endsWith("m3u8")) {
    if (
      (linkRaw.includes("phim1280") | linkRaw.includes("kkphimplayer") || linkRaw.includes("vip")) &&
      linkRaw.endsWith(".m3u8")
    ) {
      const baseUrl = linkRaw.substring(0, linkRaw.lastIndexOf("/") + 1);
      const masterContent = (await clientAxios.get(linkRaw)).data;
      const subPath = masterContent.split("\n").find((line) => line.endsWith(".m3u8"));
      const subUrl = baseUrl + subPath;
      objReturn.url = subUrl;
      objReturn.type = "m3u8";
    } else {
      objReturn.url = linkRaw;
      objReturn.type = "m3u8";
    }
  }
  return objReturn;
}

async function extractMediaLinksM3U8(sourcePathOrUrl, headers = {}) {
  let content;

  if (/^https?:\/\//i.test(sourcePathOrUrl)) {
    const response = await axios.get(sourcePathOrUrl, { headers });
    content = response.data;
  } else {
    content = await fs.promises.readFile(sourcePathOrUrl, "utf8");
  }

  const lines = content.split(/\r?\n/);

  const mediaLinks = lines.map((line) => line.trim()).filter((line) => line && !line.startsWith("#"));

  return mediaLinks;
}

export async function downloadVideoFromM3U8(m3u8Url, mp4OutputPath, headers) {
  const settingConfig = readSettingConfig();
  const CHUNK_DOWN = settingConfig["CHUNK_M3U8"] || 16;
  const USE_PROXY = settingConfig["USE_PROXY"] || false;
  const PROXY = settingConfig["PROXY_HTTP"] || "";
  console.log(`Start Download Video From: ${m3u8Url}`);

  try {
    const linksM3U8 = await extractMediaLinksM3U8(m3u8Url, headers);
    const segmentCount = linksM3U8.length;
    const segmentBuffers = new Array(segmentCount).fill(null);
    let nextWriteIndex = 0;
    const ffmpegProcess = spawn("ffmpeg", ["-y", "-f", "mpegts", "-i", "pipe:0", "-c", "copy", mp4OutputPath]);
    // ffmpegProcess.stderr.on("data", (data) => {
    //   console.log(`[ffmpeg] ${data}`);
    // });
    // ffmpegProcess.on("close", (code) => {
    //   console.log(`✅ FFmpeg exited with code ${code}`);
    // });

    const writeInOrderToFfmpeg = async () => {
      while (nextWriteIndex < segmentCount) {
        try {
          while (segmentBuffers[nextWriteIndex]) {
            ffmpegProcess.stdin.write(segmentBuffers[nextWriteIndex]);
            segmentBuffers[nextWriteIndex] = null;
            nextWriteIndex++;
          }

          if (nextWriteIndex === segmentCount) {
            ffmpegProcess.stdin.end();
            await new Promise((resolve, reject) => {
              ffmpegProcess.on("exit", (code, signal) => {
                if (code === 0) {
                  resolve();
                } else {
                  reject(new Error(`FFmpeg exited with code ${code} and signal ${signal}`));
                }
              });

              ffmpegProcess.on("error", (err) => {
                reject(err);
              });
            });
            break;
          }
        } catch (error) {
          try {
            ffmpegProcess.stdin.end();
          } catch (e) {}
          throw new Error("❌ Lỗi khi ghi vào ffmpeg:", error);
        }
        await new Promise((resolve) => setTimeout(resolve, 100));
      }
    };

    let hasError = false;
    const downloadPromises = linksM3U8.map((seg, i) => async () => {
      if (hasError) return;
      try {
        const url = new URL(seg, m3u8Url).toString();
        let attempts = 0;
        const maxAttempts = 3;
        let res;

        while (attempts < maxAttempts) {
          try {
            res = await axios.get(url, {
              responseType: "arraybuffer",
              httpsAgent:
                (USE_PROXY &&
                  (PROXY.startsWith("http") || PROXY.startsWith("https") ? new HttpsProxyAgent(PROXY) : undefined)) ||
                undefined,
            });
            break;
          } catch (error) {
            attempts++;
            await new Promise((resolve) => setTimeout(resolve, 1000 * attempts));
          }
        }

        const fileContent = res.data;
        let contentOrigin = fileContent;

        if (fileContent[0] === 0x89 && fileContent[1] === 0x50 && fileContent[2] === 0x4e && fileContent[3] === 0x47) {
          let tsStartOffset = 0;
          for (let i = 0; i < fileContent.length - 188 * 2; i++) {
            if (fileContent[i] === 0x47 && fileContent[i + 188] === 0x47 && fileContent[i + 376] === 0x47) {
              tsStartOffset = i;
              break;
            }
          }

          if (tsStartOffset > 0) {
            contentOrigin = fileContent.slice(tsStartOffset);
          }
        }

        segmentBuffers[i] = contentOrigin;
      } catch (err) {
        hasError = true;
        console.error(`❌ Lỗi tải segment ${i}:`, err);
        try {
          ffmpegProcess.stdin.end();
        } catch (e) {}
        throw err;
      }
    });

    await measureTime(`Download Video From M3U8 with link ${m3u8Url}`, () =>
      Promise.all([writeInOrderToFfmpeg(), asyncPool(CHUNK_DOWN, downloadPromises, (fn) => fn())])
    );

    let objDataVideo = await getVideoMetadata(mp4OutputPath);
    const tempSize = objDataVideo.totalSize / (1024 * 1024);
    let numParts = 1;

    while (tempSize > 1024 * numParts) {
      numParts++;
    }

    if (numParts > 1) {
      const partDuration = Math.floor(objDataVideo.duration / numParts / 1000);
      const partPaths = [];

      for (let i = 0; i < numParts; i++) {
        const partPath = mp4OutputPath.replace(/\.mp4$/, `_part${i + 1}.mp4`);
        const startTime = i * partDuration;

        await execAsync(`ffmpeg -y -ss ${startTime} -i "${mp4OutputPath}" -t ${partDuration} -c copy "${partPath}"`);
        partPaths.push(partPath);
      }

      await deleteFile(mp4OutputPath);
      return {
        length: numParts,
        paths: partPaths,
      };
    }

    return {
      length: 1,
      paths: [mp4OutputPath],
    };
  } catch (error) {
    throw new Error("Error when convert M3U8 To Video MP4: " + error);
  }
}
