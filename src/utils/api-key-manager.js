import { join } from "path";
import { DATA_API_FILE_PATH } from "./io-json.js";
import { readFileSync, writeFileSync } from "./util.js";

let apiKeys = JSON.parse(readFileSync(join(DATA_API_FILE_PATH)));
const apiKeyRotationIndexes = new Map();

export function getApiKeys() {
  return apiKeys;
}

export function getApiKeysMedia(typeGet) {
  return apiKeys[typeGet] || [];
}

export function getNextApiKeyMedia(typeGet, excludedKey = null) {
  const configuredKeys = getApiKeysMedia(typeGet).filter(
    (key) => typeof key === "string" && key.trim() !== ""
  );
  if (configuredKeys.length === 0) {
    throw new Error(`Không có API key hợp lệ cho ${typeGet}`);
  }

  const remainingKeys = excludedKey ? configuredKeys.filter((key) => key !== excludedKey) : configuredKeys;
  const keys = remainingKeys.length > 0 ? remainingKeys : configuredKeys;

  const currentIndex = apiKeyRotationIndexes.get(typeGet) || 0;
  apiKeyRotationIndexes.set(typeGet, (currentIndex + 1) % keys.length);
  return keys[currentIndex % keys.length];
}

export function loadApiKeysMedia() {
  apiKeys = JSON.parse(readFileSync(join(DATA_API_FILE_PATH)));
  apiKeyRotationIndexes.clear();
}

export function setApiKeysMedia(apiKeys) {
  writeFileSync(DATA_API_FILE_PATH, JSON.stringify(apiKeys, null, 2));
}
