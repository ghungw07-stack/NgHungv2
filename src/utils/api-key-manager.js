import { join } from "path";
import { DATA_API_FILE_PATH } from "./io-json.js";
import { readFileSync, writeFileSync } from "./util.js";

let apiKeys = JSON.parse(readFileSync(join(DATA_API_FILE_PATH)));

export function getApiKeys() {
  return apiKeys;
}

export function getApiKeysMedia(typeGet) {
  return apiKeys[typeGet] || [];
}

export function loadApiKeysMedia() {
  apiKeys = JSON.parse(readFileSync(join(DATA_API_FILE_PATH)));
}

export function setApiKeysMedia(apiKeys) {
  writeFileSync(DATA_API_FILE_PATH, JSON.stringify(apiKeys, null, 2));
}
