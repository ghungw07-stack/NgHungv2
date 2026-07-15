import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
export const MARRIAGE_FILE_PATH = path.join(__dirname, "hung-marriages.json");
if (!fs.existsSync(MARRIAGE_FILE_PATH)) fs.writeFileSync(MARRIAGE_FILE_PATH, "[]");

export function loadMarriages() {
  try {
    return JSON.parse(fs.readFileSync(MARRIAGE_FILE_PATH, "utf8"));
  } catch {
    return [];
  }
}

export function saveMarriages(data) {
  fs.writeFileSync(MARRIAGE_FILE_PATH, JSON.stringify(data, null, 2));
}

export function findMarriage(records, uid) {
  return records.find((r) => r.uid1 === uid || r.uid2 === uid);
}