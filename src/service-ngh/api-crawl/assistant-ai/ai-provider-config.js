import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync, chmodSync } from 'node:fs';
import { join } from 'node:path';
import { JSON_DATA_PATH } from '../../../utils/io-json.js';

const CONFIG_FILE = join(JSON_DATA_PATH, 'ai-provider-config.json');
const SERVICES = new Set(['gpt', 'gemini']);
const KEYS = new Set(['apiKey', 'baseURL', 'model', 'instruction']);

function readStore() {
  try {
    const parsed = JSON.parse(readFileSync(CONFIG_FILE, 'utf8'));
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

function writeStore(store) {
  mkdirSync(JSON_DATA_PATH, { recursive: true });
  const temporaryFile = `${CONFIG_FILE}.${process.pid}.tmp`;
  writeFileSync(temporaryFile, `${JSON.stringify(store, null, 2)}\n`, { mode: 0o600 });
  try { chmodSync(temporaryFile, 0o600); } catch {}
  renameSync(temporaryFile, CONFIG_FILE);
  try { chmodSync(CONFIG_FILE, 0o600); } catch {}
}

function assertService(service) {
  const normalized = String(service || '').toLowerCase();
  if (!SERVICES.has(normalized)) throw new Error(`Dịch vụ AI không hợp lệ: ${service}`);
  return normalized;
}

export function maskAISecret(value) {
  const text = String(value || '');
  if (!text) return '(chưa đặt)';
  if (text.length <= 10) return `${text.slice(0, 2)}***`;
  return `${text.slice(0, 6)}...${text.slice(-4)}`;
}

export function getAIProviderConfig(botId, service) {
  const serviceKey = assertService(service);
  const store = readStore();
  const botConfig = store[String(botId)] || {};

  // Tương thích file cấu hình phẳng của bản bot cũ: coi nó là Gemini.
  if (serviceKey === 'gemini' && !botConfig.gemini && botConfig.apiKey) {
    return {
      apiKey: botConfig.apiKey,
      baseURL: botConfig.baseURL,
      model: botConfig.model || botConfig.modelNames,
      instruction: botConfig.instruction,
    };
  }
  return { ...(botConfig[serviceKey] || {}) };
}

export function isAIProviderConfigured(botId, service) {
  const config = getAIProviderConfig(botId, service);
  return Boolean(config.apiKey && config.baseURL && config.model);
}

export function setAIProviderConfig(botId, service, key, value) {
  const serviceKey = assertService(service);
  if (!KEYS.has(key)) throw new Error(`Khóa cấu hình không hợp lệ: ${key}`);
  const store = readStore();
  const botKey = String(botId);
  store[botKey] ||= {};
  store[botKey][serviceKey] ||= {};
  store[botKey][serviceKey][key] = value;
  writeStore(store);
  return getAIProviderConfig(botId, serviceKey);
}

export function clearAIProviderConfig(botId, service) {
  const serviceKey = assertService(service);
  const store = readStore();
  const botKey = String(botId);
  if (store[botKey]?.[serviceKey]) delete store[botKey][serviceKey];
  if (store[botKey] && Object.keys(store[botKey]).length === 0) delete store[botKey];
  writeStore(store);
}

export function formatAIProviderConfig(botId, service) {
  const serviceKey = assertService(service);
  const config = getAIProviderConfig(botId, serviceKey);
  const status = isAIProviderConfigured(botId, serviceKey) ? 'đã sẵn sàng' : 'chưa đủ cấu hình';
  return [
    `AI Provider ${serviceKey.toUpperCase()}: ${status}`,
    `• apiKey: ${maskAISecret(config.apiKey)}`,
    `• baseURL: ${config.baseURL || '(chưa đặt)'}`,
    `• model: ${config.model || '(chưa đặt)'}`,
    `• instruction: ${config.instruction ? `${config.instruction.slice(0, 100)}${config.instruction.length > 100 ? '…' : ''}` : '(mặc định)'}`,
  ].join('\n');
}

export function updateAIProviderFromCommand(botId, service, args = []) {
  const serviceKey = assertService(service);
  const [actionRaw, keyRaw, ...rest] = args;
  const action = String(actionRaw || '').toLowerCase();

  if (!action || action === 'help') return { action: 'help' };
  if (action === 'show' || action === 'status') {
    return { action: 'show', text: formatAIProviderConfig(botId, serviceKey) };
  }
  if (action === 'clear' || action === 'reset') {
    clearAIProviderConfig(botId, serviceKey);
    return { action: 'clear', text: `Đã xóa cấu hình ${serviceKey.toUpperCase()} riêng của bot này.` };
  }

  const hasSetPrefix = action === 'set';
  const key = hasSetPrefix ? keyRaw : actionRaw;
  const valueParts = hasSetPrefix ? rest : [keyRaw, ...rest];
  const value = valueParts.filter((part) => part !== undefined).join(' ').trim();
  if (!KEYS.has(key)) throw new Error('Chỉ hỗ trợ: apiKey, baseURL, model, instruction.');
  if (!value) throw new Error(`Thiếu giá trị cho ${key}.`);
  if (key === 'baseURL') {
    const parsed = new URL(value);
    if (!['http:', 'https:'].includes(parsed.protocol)) throw new Error('baseURL phải dùng HTTP hoặc HTTPS.');
  }

  setAIProviderConfig(botId, serviceKey, key, value);
  return {
    action: 'set',
    sensitive: key === 'apiKey',
    text: `Đã cập nhật ${serviceKey.toUpperCase()} ${key}: ${key === 'apiKey' ? maskAISecret(value) : value}`,
  };
}

function extractResponseText(data) {
  const content = data?.choices?.[0]?.message?.content;
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) {
    return content.map((part) => part?.text || '').filter(Boolean).join('\n');
  }
  return '';
}

export async function requestConfiguredAI({ botId, service, messages, timeoutMs = 60_000 }) {
  const config = getAIProviderConfig(botId, service);
  if (!config.apiKey || !config.baseURL || !config.model) {
    throw new Error(`${String(service).toUpperCase()} chưa đủ apiKey, baseURL và model.`);
  }

  const endpoint = `${String(config.baseURL).replace(/\/+$/, '')}/chat/completions`;
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${config.apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ model: config.model, messages, temperature: 0.7 }),
    signal: AbortSignal.timeout(timeoutMs),
  });

  if (!response.ok) {
    const detail = (await response.text().catch(() => '')).slice(0, 300);
    throw new Error(`AI Provider trả về HTTP ${response.status}${detail ? `: ${detail}` : ''}`);
  }
  const text = extractResponseText(await response.json());
  if (!text.trim()) throw new Error('AI Provider không trả về nội dung.');
  return text.trim();
}

export function getAIProviderConfigPath() {
  return CONFIG_FILE;
}

export function hasAIProviderConfigFile() {
  return existsSync(CONFIG_FILE);
}
