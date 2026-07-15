import fs from "fs";

function parseLrcToString(lrcContent, isShowTime) {
  const lines = lrcContent.trim().split("\n");
  const lyrics = [];

  for (const line of lines) {
    let lyricText;
    if (!isShowTime) {
      const closingBracketPos = line.indexOf("]");
      if (closingBracketPos !== -1) {
        lyricText = line.substring(closingBracketPos + 1).trim();
      }
    } else {
      lyricText = line.trim();
    }
    if (lyricText) {
      lyrics.push(lyricText);
    }
  }

  const fullLyrics = lyrics.join("\n");
  return fullLyrics;
}

export async function processLrcFile(filePath, isShowTime) {
  return new Promise((resolve, reject) => {
    fs.readFile(filePath, "utf8", (err, data) => {
      if (err) {
        reject(`Error reading file: ${err.message}`);
        return;
      }

      const lyricsString = parseLrcToString(data, isShowTime);
      resolve(lyricsString);
    });
  });
}
