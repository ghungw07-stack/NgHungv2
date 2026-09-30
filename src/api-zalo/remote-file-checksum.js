import crypto from "node:crypto";
import axios from "axios";

export async function hashReadableFile(stream) {
  const hash = crypto.createHash("md5");
  let bytesRead = 0;
  for await (const chunk of stream) {
    hash.update(chunk);
    bytesRead += chunk.length;
  }
  return {
    currentChunk: Math.max(1, Math.ceil(bytesRead / 2097152)),
    data: hash.digest("hex"),
  };
}

export async function getMd5LargeFileFromUrl(url) {
  const response = await axios.get(url, {
    responseType: "stream",
    timeout: 60_000,
    maxRedirects: 5,
  });
  return hashReadableFile(response.data);
}
