import schedule from "node-schedule";
import chalk from "chalk";
import { DATA_CONFIG_ANTI_PATH } from "../../utils/io-json.js";
import { readFilePromise, writeFileSync } from "../../utils/util.js";

let antiStateObj = {};
let hasChangeAntiStateObj = {};

export async function loadAntiConfig(botId) {
  try {
    const data = await readFilePromise(DATA_CONFIG_ANTI_PATH(botId));
    const config = JSON.parse(data);
    if (Object.keys(config).length === 0) {
      antiStateObj[botId] = {
        badWords: [
          "ngu",
          "dốt",
          "dot",
          "đần",
          "cặc",
          "kặc",
          "kac",
          "lồn",
          "lon",
          "loz",
          "óc",
          "oc",
          "fuck",
          "fuk",
          "fck",
          "buồi",
          "buoi",
          "đít",
          "đit",
          "dit",
          "đụ má",
          "đụ mẹ",
          "đù má",
          "đù mẹ",
          "du me",
          "du ma",
          "mẹ mày",
          "má mày",
          "me may",
          "ma may",
          "chó má",
          "chó mẹ",
          "cho ma",
          "cho me",
          "bố mày",
          "bo may",
          "shit",
          "shiet",
          "shjt",
          "đm",
          "đmm",
          "dmm",
          "cl",
          "cld",
          "clđ",
          "cc",
          "cặc",
          "đb",
          "đĩ",
          "điếm",
          "sv",
          "súc vật",
          "suc vat",
          "damn",
          "đm",
          "sex",
          "segs",
          "sech",
          "sẽch",
          "nứng",
          "nung",
          "nưng",
          "cave",
          "cave",
          "cavẽ",
          "stupid",
          "ngu",
          "Iồn",
          "Ⓛồn",
          "ồn",
          "scam",
          "𝙻ồ𝚗",
          "nguu",
          "hentai",
        ],
        linkRegex:
          "(?:https?:\\/\\/|www\\.)\\S+|(?<!\\w)[a-zA-Z0-9-]+[.,](?:com|net|org|vn|info|biz|io|xyz|me|tv|online|store|club|site|app|blog|dev|tech|cloud|game|shop|click|space|asia|fun|tokyo|xyz|website)(?:\\/\\S*)?(?!\\w)",
        violationsNude: {},
        violations: {},
        whiteLinks: {},
      };
    } else {
      antiStateObj[botId] = config;
    }
    hasChangeAntiStateObj[botId] = true;
    console.log(chalk.yellow("Đã tải xong config anti service"));
  } catch (error) {
    console.error("Lỗi khi đọc file config anti:", error);
  }
}

export function saveAntiConfig(botId) {
  try {
    writeFileSync(DATA_CONFIG_ANTI_PATH(botId), JSON.stringify(antiStateObj[botId], null, 2));
  } catch (error) {
    console.error("Lỗi khi ghi file config anti:", error);
  }
}

export async function startAntiConfigCheck(api) {
  const botId = api.getBotId();
  await loadAntiConfig(botId);

  const job = schedule.scheduleJob("*/5 * * * * *", async () => {
    if (hasChangeAntiStateObj[botId]) {
      saveAntiConfig(botId);
      hasChangeAntiStateObj[botId] = false;
    }
  });

  api.apiInstance.schedule.checkAntiConfig = job;

  console.log(chalk.yellow("Đã khởi động schedule kiểm tra thay đổi config anti"));
}

export function updateAntiConfig(botId, newData) {
  antiStateObj[botId] = { ...antiStateObj[botId], ...newData };
  hasChangeAntiStateObj[botId] = true;
}

export const getAntiConfig = (botId) => antiStateObj[botId];
