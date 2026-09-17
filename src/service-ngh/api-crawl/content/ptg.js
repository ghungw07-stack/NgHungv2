// Play Together live shop/weather integration

import { EventEmitter } from 'events';
import { WebSocket } from 'ws';
import { createCanvas, loadImage, registerFont } from 'canvas';
import { unlinkSync, writeFileSync, existsSync, readFileSync, mkdirSync, renameSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { getGlobalPrefix } from '../../service.js';
import { nameServer } from '../../../database/index.js';
import { MessageStyle, MessageType } from '../../../api-zalo/index.js';
import { downloadFile } from '../../../utils/util.js';
import { DATA_ROOT, tempDir } from '../../../utils/io-json.js';

// --- REGISTER FONTS FOR VIETNAMESE ACCENTED CHARACTERS ---
const fontPathBeVN = join(process.cwd(), 'assets', 'fonts', 'BeVietnamPro-Bold.ttf');
const fontPathNoto = join(process.cwd(), 'assets', 'fonts', 'NotoSans-Bold.ttf');

if (existsSync(fontPathBeVN)) {
  try { registerFont(fontPathBeVN, { family: 'BeVietnamPro', weight: 'bold' }); } catch (e) {}
}
if (existsSync(fontPathNoto)) {
  try { registerFont(fontPathNoto, { family: 'NotoSansB', weight: 'bold' }); } catch (e) {}
}

const FONT_FAMILY = 'BeVietnamPro, NotoSansB, "Segoe UI", Arial, sans-serif';

const WS_URL = process.env.NGH_PTG_WS_URL || 'wss://dqt-tempfile.online/ptgfarm/ws?key=guest_ptg_8386';
// The profile provider is kept separate from the shop WebSocket.  The latter
// only publishes shop snapshots and cannot answer player lookups.
const PROFILE_API_URL = process.env.NGH_PTG_PROFILE_API_URL?.trim();
const PROFILE_API_KEY = process.env.NGH_PTG_PROFILE_API_KEY?.trim();
const FOLLOW_FILE = join(DATA_ROOT, 'json-data', 'ptg-follows.json');
const GROUP_SETTINGS_FILE = join(DATA_ROOT, 'json-data', 'ptg-group-settings.json');
const MAX_RECONNECT_DELAY_MS = 60_000;
const STYLE_COLORS = { green: '15a85f', red: 'db342e', yellow: 'f7b503' };

async function SendMessageStyle(api, message, text, options = {}) {
  const senderName = message.data?.dName || 'Người dùng';
  const shouldTag = options.tagSender && message.type === MessageType.GroupMessage;
  const serverLabel = options.hasNameServer ? getNameServer(api) : '';
  const prefixText = [shouldTag ? senderName : '', serverLabel].filter(Boolean).join('\n');
  const msg = [prefixText, text].filter(Boolean).join('\n');
  const color = STYLE_COLORS[options.color] || options.color || null;
  const payload = {
    msg,
    attachments: options.attachments || [],
    ttl: 180_000,
    ...(options.reply ? { quote: message } : {}),
    ...(msg ? { style: MessageStyle(0, msg.length, color, options.size || '18', options.isBold === true) } : {}),
  };
  if (shouldTag) {
    payload.mentions = [{ pos: 0, len: senderName.length, uid: message.data?.gameUid || message.data?.uidFrom }];
  }
  return api.sendMessage(payload, message.threadId, message.type);
}

function readFollowStore() {
  try {
    const data = JSON.parse(readFileSync(FOLLOW_FILE, 'utf8'));
    return Array.isArray(data) ? data : [];
  } catch {
    return [];
  }
}

function writeFollowStore(entries) {
  mkdirSync(join(DATA_ROOT, 'json-data'), { recursive: true });
  const temporaryFile = `${FOLLOW_FILE}.${process.pid}.tmp`;
  writeFileSync(temporaryFile, `${JSON.stringify(entries, null, 2)}\n`, 'utf8');
  renameSync(temporaryFile, FOLLOW_FILE);
}

function readGroupSettings() {
  try {
    const data = JSON.parse(readFileSync(GROUP_SETTINGS_FILE, 'utf8'));
    return data && typeof data === 'object' && !Array.isArray(data) ? data : {};
  } catch {
    return {};
  }
}

function writeGroupSettings(settings) {
  mkdirSync(join(DATA_ROOT, 'json-data'), { recursive: true });
  const temporaryFile = `${GROUP_SETTINGS_FILE}.${process.pid}.tmp`;
  writeFileSync(temporaryFile, `${JSON.stringify(settings, null, 2)}\n`, 'utf8');
  renameSync(temporaryFile, GROUP_SETTINGS_FILE);
}

const normalizeItemName = (value) => String(value || '').trim().toLocaleLowerCase('vi-VN');
const splitItemNames = (value) => String(value || '').split(',').map((item) => item.trim()).filter(Boolean);

function normalizeProfiles(payload) {
  const data = payload?.data ?? payload?.result ?? payload;
  const candidates = Array.isArray(data)
    ? data
    : Array.isArray(data?.players)
      ? data.players
      : Array.isArray(data?.results)
        ? data.results
        : Array.isArray(data?.friends)
          ? data.friends
          : [data?.player ?? data?.profile ?? data];

  return candidates
    .filter((player) => player && typeof player === 'object')
    .map((player) => ({
      ...player,
      name: player.name || player.nickname || player.playerName || player.displayName || 'Người chơi chưa rõ tên',
      avatarUrl: player.avatarUrl || player.avatar || player.profileImageUrl || player.imageUrl,
      online: player.online ?? player.isOnline,
      level: player.level ?? player.playerLevel,
      id: player.id || player.playerId || player.pid || player.code,
    }));
}

function getVNTime() { return new Date(Date.now() + 7 * 3600_000).toISOString().slice(11, 19); }

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}

function hexAlpha(hex, alpha) {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}

const CURRENCY_ICON_PATHS = {
  xu: join(process.cwd(), 'assets', 'resources', 'icon', 'xu.png'),
  ngoc: join(process.cwd(), 'assets', 'resources', 'icon', 'ngoc.png'),
  vang: join(process.cwd(), 'assets', 'resources', 'icon', 'vang.png'),
};

const loadedCurrencyIcons = {};

async function loadCurrencyIcons() {
  for (const [key, filePath] of Object.entries(CURRENCY_ICON_PATHS)) {
    if (!loadedCurrencyIcons[key]) {
      try {
        const rawImg = await loadImage(filePath);
        // Resample multi-step: Pre-render to 96x96 offscreen canvas for crisp anti-aliasing
        const thumbCanvas = createCanvas(96, 96);
        const tCtx = thumbCanvas.getContext('2d');
        tCtx.imageSmoothingEnabled = true;
        tCtx.imageSmoothingQuality = 'high';
        tCtx.drawImage(rawImg, 0, 0, 96, 96);
        loadedCurrencyIcons[key] = thumbCanvas;
      } catch (err) {
        console.error(`[PTG] Failed to load icon ${key}:`, err.message);
      }
    }
  }
}

function drawStarCoin(ctx, cx, cy, size = 22, inStock = true) {
  if (loadedCurrencyIcons.xu) {
    const s = typeof size === 'number' ? size : 22;
    ctx.save();
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    if (!inStock) ctx.globalAlpha = 0.4;
    ctx.drawImage(loadedCurrencyIcons.xu, cx - s / 2, cy - s / 2, s, s);
    ctx.restore();
    return;
  }

  const r = (typeof size === 'number' ? size : 16) / 2;
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.fillStyle = inStock ? '#e59d00' : '#a0a0a0';
  ctx.fill();

  ctx.beginPath();
  ctx.arc(cx, cy, r * 0.85, 0, Math.PI * 2);
  ctx.fillStyle = inStock ? '#ffd200' : '#d0d0d0';
  ctx.fill();

  ctx.beginPath();
  ctx.arc(cx, cy, r * 0.65, 0, Math.PI * 2);
  ctx.strokeStyle = inStock ? '#f5b500' : '#b0b0b0';
  ctx.lineWidth = 1;
  ctx.stroke();

  const spikes = 5;
  const outerRadius = r * 0.55;
  const innerRadius = r * 0.25;
  let rot = Math.PI / 2 * 3;
  let x = cx;
  let y = cy;
  let step = Math.PI / spikes;

  ctx.beginPath();
  ctx.moveTo(cx, cy - outerRadius);
  for (let i = 0; i < spikes; i++) {
    x = cx + Math.cos(rot) * outerRadius;
    y = cy + Math.sin(rot) * outerRadius;
    ctx.lineTo(x, y);
    rot += step;

    x = cx + Math.cos(rot) * innerRadius;
    y = cy + Math.sin(rot) * innerRadius;
    ctx.lineTo(x, y);
    rot += step;
  }
  ctx.lineTo(cx, cy - outerRadius);
  ctx.closePath();
  ctx.fillStyle = inStock ? '#ffffff' : '#f0f0f0';
  ctx.fill();
}

function drawGem(ctx, cx, cy, size = 22, inStock = true) {
  if (loadedCurrencyIcons.ngoc) {
    const s = typeof size === 'number' ? size : 22;
    ctx.save();
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    if (!inStock) ctx.globalAlpha = 0.4;
    ctx.drawImage(loadedCurrencyIcons.ngoc, cx - s / 2, cy - s / 2, s, s);
    ctx.restore();
    return;
  }

  const w = size / 2;
  const h = size / 2;

  ctx.beginPath();
  ctx.moveTo(cx - w * 0.5, cy - h);
  ctx.lineTo(cx + w * 0.5, cy - h);
  ctx.lineTo(cx + w, cy - h * 0.2);
  ctx.lineTo(cx, cy + h);
  ctx.lineTo(cx - w, cy - h * 0.2);
  ctx.closePath();
  ctx.fillStyle = inStock ? '#ff1e75' : '#a8a8a8';
  ctx.fill();
}

function drawGoldBar(ctx, cx, cy, size = 22, inStock = true) {
  if (loadedCurrencyIcons.vang) {
    const s = typeof size === 'number' ? size : 22;
    ctx.save();
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    if (!inStock) ctx.globalAlpha = 0.4;
    ctx.drawImage(loadedCurrencyIcons.vang, cx - s / 2, cy - s / 2, s, s);
    ctx.restore();
    return;
  }

  const w = size;
  const h = size * 0.55;
  ctx.beginPath();
  ctx.moveTo(cx - w * 0.35, cy - h / 2);
  ctx.lineTo(cx + w * 0.35, cy - h / 2);
  ctx.lineTo(cx + w * 0.5, cy + h / 2);
  ctx.lineTo(cx - w * 0.5, cy + h / 2);
  ctx.closePath();
  ctx.fillStyle = inStock ? '#ffd700' : '#b0b0b0';
  ctx.fill();
}

// --- PRICE BADGE BOX DRAWER (3D DEPTH ENHANCED) ---
function drawPriceBadgeBox(ctx, rightX, centerY, value, type, inStock = true) {
  const iconSize = 20;
  const priceText = Number(value).toLocaleString();

  ctx.font = `bold 14px ${FONT_FAMILY}`;
  const textW = ctx.measureText(priceText).width;
  const paddingH = 9;
  const badgeW = textW + iconSize + paddingH * 2 + 4;
  const badgeH = 26;
  const badgeX = rightX - badgeW;
  const badgeY = centerY - badgeH / 2;

  // Custom colors per currency
  let bgColor = 'rgba(235, 245, 255, 0.95)';
  let borderColor = '#3182ce';
  let textColor = '#0d5aa7';
  let shadowColor = 'rgba(49, 130, 206, 0.25)';

  if (type === 5) { // Xu: Xanh nước biển
    bgColor = 'rgba(235, 245, 255, 0.95)';
    borderColor = '#3182ce';
    textColor = '#0d5aa7';
    shadowColor = 'rgba(49, 130, 206, 0.25)';
  } else if (type === 2) { // Ngọc: Tím
    bgColor = 'rgba(248, 240, 255, 0.95)';
    borderColor = '#9f7aea';
    textColor = '#6b46c1';
    shadowColor = 'rgba(159, 122, 234, 0.25)';
  } else if (type === 9) { // Vàng: Vàng kim
    bgColor = 'rgba(255, 250, 230, 0.95)';
    borderColor = '#d69e2e';
    textColor = '#9b6400';
    shadowColor = 'rgba(214, 158, 46, 0.25)';
  }

  if (!inStock) {
    bgColor = 'rgba(240, 240, 240, 0.8)';
    borderColor = '#cccccc';
    textColor = '#888888';
    shadowColor = 'rgba(0, 0, 0, 0.05)';
  }

  // 1. 3D Bottom Depth Shadow
  roundRect(ctx, badgeX, badgeY + 2, badgeW, badgeH, 8);
  ctx.fillStyle = shadowColor;
  ctx.fill();

  // 2. Main Pill Surface
  roundRect(ctx, badgeX, badgeY, badgeW, badgeH, 8);
  ctx.fillStyle = bgColor;
  ctx.fill();
  ctx.strokeStyle = borderColor;
  ctx.lineWidth = 1.2;
  ctx.stroke();

  // 3. Currency Icon FIRST (Left side inside box)
  const iconCenterX = badgeX + paddingH + iconSize / 2;
  if (type === 5) {
    drawStarCoin(ctx, iconCenterX, centerY, iconSize, inStock);
  } else if (type === 2) {
    drawGem(ctx, iconCenterX, centerY, iconSize, inStock);
  } else if (type === 9) {
    drawGoldBar(ctx, iconCenterX, centerY, iconSize, inStock);
  }

  // 4. Price Text SECOND (Right side inside box)
  const textX = badgeX + paddingH + iconSize + 4;
  ctx.fillStyle = textColor;
  ctx.font = `bold 14px ${FONT_FAMILY}`;
  ctx.textAlign = 'left';
  ctx.fillText(priceText, textX, centerY + 5);

  return badgeW;
}

// --- STOCK / QUANTITY BADGE BOX DRAWER (3D DEPTH ENHANCED) ---
function drawStockBadgeBox(ctx, rightX, centerY, stock) {
  const stockText = `SL: ${stock}`;
  ctx.font = `bold 13px ${FONT_FAMILY}`;
  const textW = ctx.measureText(stockText).width;
  const paddingH = 8;
  const badgeW = textW + paddingH * 2;
  const badgeH = 22;
  const badgeX = rightX - badgeW;
  const badgeY = centerY - badgeH / 2;

  // Stock < 3: Red (#e53e3e), Stock >= 3: Green (#2f855a)
  const isLowStock = stock < 3;
  const bgColor = isLowStock ? 'rgba(254, 235, 235, 0.95)' : 'rgba(235, 248, 240, 0.95)';
  const borderColor = isLowStock ? '#e53e3e' : '#38a169';
  const textColor = isLowStock ? '#c53030' : '#22543d';
  const shadowColor = isLowStock ? 'rgba(229, 62, 62, 0.2)' : 'rgba(56, 161, 105, 0.2)';

  // 1. 3D Bottom Depth Shadow
  roundRect(ctx, badgeX, badgeY + 1.8, badgeW, badgeH, 6);
  ctx.fillStyle = shadowColor;
  ctx.fill();

  // 2. Main Pill Surface
  roundRect(ctx, badgeX, badgeY, badgeW, badgeH, 6);
  ctx.fillStyle = bgColor;
  ctx.fill();
  ctx.strokeStyle = borderColor;
  ctx.lineWidth = 1;
  ctx.stroke();

  ctx.fillStyle = textColor;
  ctx.font = `bold 13px ${FONT_FAMILY}`;
  ctx.textAlign = 'center';
  ctx.fillText(stockText, badgeX + badgeW / 2, centerY + 4.5);
  ctx.textAlign = 'left';

  return badgeW;
}

const HEADER_ICONS = {
  weather: 'https://cdnjs.cloudflare.com/ajax/libs/twemoji/14.0.2/72x72/1f326.png',
  seeds: 'https://cdnjs.cloudflare.com/ajax/libs/twemoji/14.0.2/72x72/1f331.png',
  tools: 'https://cdnjs.cloudflare.com/ajax/libs/twemoji/14.0.2/72x72/1f6e0.png',
  furniture: 'https://cdnjs.cloudflare.com/ajax/libs/twemoji/14.0.2/72x72/1f6cb.png',
  friend: 'https://cdnjs.cloudflare.com/ajax/libs/twemoji/14.0.2/72x72/1f464.png'
};

async function drawHeader(ctx, W, HDR, title, sub, ns, time, bgColor, icon) {
  ctx.save();
  
  // 1. Draw base rounded header container
  roundRect(ctx, 10, 10, W - 20, HDR - 15, 18);
  ctx.fillStyle = bgColor;
  ctx.fill();

  // 2. Clip inner header bounds for pattern
  roundRect(ctx, 10, 10, W - 20, HDR - 15, 18);
  ctx.clip();

  // 3. Draw stylish white diagonal stripes/slashes (vết trắng xéo)
  ctx.fillStyle = 'rgba(255, 255, 255, 0.12)';
  const stripeW = 28;
  const stripeGap = 42;
  for (let x = -HDR * 2; x < W + HDR * 2; x += stripeGap) {
    ctx.beginPath();
    ctx.moveTo(x, 10);
    ctx.lineTo(x + stripeW, 10);
    ctx.lineTo(x + stripeW - 35, HDR - 5);
    ctx.lineTo(x - 35, HDR - 5);
    ctx.closePath();
    ctx.fill();
  }

  // 4. Subtle top light glow overlay
  const grad = ctx.createLinearGradient(0, 10, 0, HDR - 5);
  grad.addColorStop(0, 'rgba(255, 255, 255, 0.18)');
  grad.addColorStop(1, 'rgba(255, 255, 255, 0)');
  ctx.fillStyle = grad;
  ctx.fillRect(10, 10, W - 20, (HDR - 15) / 2);

  ctx.restore();

  // 5. Draw Header Icon
  if (icon) {
    if (icon.startsWith('http')) {
      try {
        const img = await loadImage(icon);
        ctx.drawImage(img, 22, Math.floor((HDR - 15 - 52) / 2) + 10, 52, 52);
      } catch (e) {
        console.error('[PTG] Failed to load header icon:', e);
      }
    } else {
      ctx.fillStyle = '#ffffff';
      ctx.font = `36px ${FONT_FAMILY}`;
      ctx.fillText(icon, 24, 52);
    }
  }

  // 6. Draw Subtitle & Title
  ctx.fillStyle = 'rgba(255,255,255,0.85)';
  ctx.font = `bold 12px ${FONT_FAMILY}`;
  ctx.fillText(sub, 84, 32);

  const titleFontSize = W <= 500 ? 21 : 26;
  ctx.fillStyle = '#ffffff';
  ctx.font = `bold ${titleFontSize}px ${FONT_FAMILY}`;
  ctx.fillText(title, 84, 60);

  // 7. Right-aligned NameServer & Time
  ctx.fillStyle = '#ffdc64';
  ctx.font = `bold ${W <= 500 ? 12 : 14}px ${FONT_FAMILY}`;
  ctx.textAlign = 'right';
  ctx.fillText(ns, W - 20, 32);

  ctx.fillStyle = '#ffffff';
  ctx.font = `bold ${W <= 500 ? 14 : 16}px ${FONT_FAMILY}`;
  ctx.fillText(`⏰ ${time}`, W - 20, 56);

  ctx.textAlign = 'left';
}

function drawFooter(ctx, W, H) {
  ctx.fillStyle = '#968264';
  ctx.font = `bold 15px ${FONT_FAMILY}`;
  ctx.textAlign = 'center';
  ctx.fillText('Ngh code by gpt', W / 2, H - 15);
  ctx.textAlign = 'left';
}

function canvasToTempFile(canvas) {
  const buf = canvas.toBuffer('image/png');
  const path = join(tmpdir(), `ptg_${Date.now()}.png`);
  writeFileSync(path, buf);
  return path;
}

const WEATHER_EMOJI = {
  'gió cát': '🌬️', 'mưa': '🌧️', 'tuyết': '❄️', 'bão': '⚡',
  'nắng nóng': '☀️', 'sương sớm': '🌤️', 'ánh trăng': '🌙',
  'cực quang': '🌈', 'gió': '💨', 'nắng': '☀️', 'mây': '☁️',
};

const WEATHER_COLOR = {
  'gió cát': '#ffa500', 'mưa': '#6495ed', 'tuyết': '#87ceeb',
  'bão': '#ffd700', 'nắng nóng': '#ff8c00', 'sương sớm': '#add8e6',
  'ánh trăng': '#9370db', 'cực quang': '#90ee90', 'gió': '#64c8c8',
  'nắng': '#ffc800', 'mây': '#b4b4c8',
};

const SEED_EMOJI = {
  'hạt dưa hấu': '🍉', 'hạt cà rốt': '🥕', 'hạt bí ngô': '🎃',
  'hạt ngô': '🌽', 'hạt táo': '🍎', 'hạt anh đào': '🍒',
  'hạt dâu': '🍓', 'hạt chuối': '🍌', 'hạt cam': '🍊',
};

const TOOL_EMOJI = {
  'cào đất': '🪚', 'bình tưới': '🪣', 'búa': '🔨',
  'rìu': '🪓', 'cuốc': '⛏️', 'dao': '🔪',
};

const FURN_EMOJI = {
  'ghế gỗ': '🪑', 'bàn tròn': '🪞', 'giường đôi': '🛏️',
  'đèn sàn': '🪔', 'chậu hoa': '🪴', 'tranh tường': '🖼️',
};

const SHOP_CFG = {
  seeds: { title: 'KHO HẠT GIỐNG', color: '#228b22', emoji: SEED_EMOJI },
  tools: { title: 'KHO DỤNG CỤ', color: '#1e64c8', emoji: TOOL_EMOJI },
  furniture: { title: 'KHO NỘI THẤT', color: '#dc6400', emoji: FURN_EMOJI },
};

export async function renderWeather(items, ns, time) {
  const isSingleCol = items.length < 10;
  const W = isSingleCol ? 460 : 780;
  const PAD = 16, HDR = 90, CH = 74, GAP = 10, FTR = 50;
  const cols = isSingleCol ? 1 : 2;
  const CW = isSingleCol ? (W - PAD * 2) : ((W - PAD * 3) / 2);
  const rows = isSingleCol ? items.length : Math.ceil(items.length / 2);
  const H = HDR + 10 + rows * (CH + GAP) + PAD + FTR;

  const SCALE = 2;
  const canvas = createCanvas(W * SCALE, H * SCALE);
  const ctx = canvas.getContext('2d');
  ctx.scale(SCALE, SCALE);
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';

  ctx.fillStyle = '#fff5e1';
  ctx.fillRect(0, 0, W, H);

  await drawHeader(ctx, W, HDR, 'DỰ BÁO THỜI TIẾT', 'PLAY TOGETHER', ns, time, '#6233bc', HEADER_ICONS.weather);

  for (const [i, item] of items.entries()) {
    const col = isSingleCol ? 0 : i % 2;
    const row = isSingleCol ? i : Math.floor(i / 2);
    const x = PAD + col * (CW + PAD);
    const y = HDR + 10 + row * (CH + GAP);
    const key = (item.vi || item.name || '').toLowerCase();
    const color = WEATHER_COLOR[key] || '#9696b4';
    const emoji = WEATHER_EMOJI[key] || '🌦️';

    roundRect(ctx, x, y, CW, CH, 14);
    ctx.fillStyle = '#ffffff';
    ctx.fill();
    ctx.strokeStyle = color;
    ctx.lineWidth = 3;
    ctx.stroke();

    roundRect(ctx, x, y, 6, CH, 6);
    ctx.fillStyle = color;
    ctx.fill();

    if (item.iconUrl) {
      try {
        const img = await loadImage(item.iconUrl);
        ctx.drawImage(img, x + 12, y + (CH - 52) / 2, 52, 52);
      } catch (_) {
        ctx.font = `32px ${FONT_FAMILY}`;
        ctx.fillStyle = '#323238';
        ctx.fillText(emoji, x + 26, y + CH / 2 + 12);
      }
    } else {
      ctx.font = `32px ${FONT_FAMILY}`;
      ctx.fillStyle = '#323238';
      ctx.fillText(emoji, x + 26, y + CH / 2 + 12);
    }

    ctx.fillStyle = '#323238';
    let fontSize = 18;
    ctx.font = `bold ${fontSize}px ${FONT_FAMILY}`;
    const displayName = item.vi || item.name || '';
    while (ctx.measureText(displayName).width > CW - 160 && fontSize > 12) {
      fontSize -= 1;
      ctx.font = `bold ${fontSize}px ${FONT_FAMILY}`;
    }
    ctx.fillText(displayName, x + 76, y + 30);

    ctx.fillStyle = color;
    ctx.font = `bold 15px ${FONT_FAMILY}`;
    ctx.fillText(`⏰ ${item.time}`, x + 78, y + 54);
  }

  drawFooter(ctx, W, H);
  return canvasToTempFile(canvas);
}

export async function renderShop(items, shopType, ns, time) {
  await loadCurrencyIcons();
  const cfg = SHOP_CFG[shopType] || SHOP_CFG.seeds;
  const isSingleCol = items.length < 10;
  const W = isSingleCol ? 460 : 780;
  const PAD = 16, HDR = 90, CH = 84, GAP = 10, FTR = 50;
  const cols = isSingleCol ? 1 : 2;
  const CW = isSingleCol ? (W - PAD * 2) : ((W - PAD * 3) / 2);
  const rows = isSingleCol ? items.length : Math.ceil(items.length / 2);
  const H = HDR + 10 + rows * (CH + GAP) + PAD + FTR;

  const SCALE = 2;
  const canvas = createCanvas(W * SCALE, H * SCALE);
  const ctx = canvas.getContext('2d');
  ctx.scale(SCALE, SCALE);
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';

  ctx.fillStyle = '#fff5e1';
  ctx.fillRect(0, 0, W, H);

  await drawHeader(ctx, W, HDR, cfg.title, 'PLAY TOGETHER', ns, time, cfg.color, HEADER_ICONS[shopType]);

  for (const [i, item] of items.entries()) {
    const col = isSingleCol ? 0 : i % 2;
    const row = isSingleCol ? i : Math.floor(i / 2);
    const x = PAD + col * (CW + PAD);
    const y = HDR + 10 + row * (CH + GAP);
    const name = item.vi || item.name || '?';
    const stock = Number(item.stock) || 0;
    const inStock = stock > 0;
    const emoji = cfg.emoji[name.toLowerCase()] || '📦';
    const color = inStock ? cfg.color : '#c8c8c8';

    // 1. 3D Card Depth Shadow
    roundRect(ctx, x, y + 3, CW, CH, 14);
    ctx.fillStyle = inStock ? 'rgba(0, 0, 0, 0.07)' : 'rgba(0, 0, 0, 0.03)';
    ctx.fill();

    // 2. Main Card Surface
    roundRect(ctx, x, y, CW, CH, 14);
    ctx.fillStyle = inStock ? '#ffffff' : '#f0f0f0';
    ctx.fill();
    ctx.strokeStyle = color;
    ctx.lineWidth = 3;
    ctx.stroke();

    roundRect(ctx, x, y, 6, CH, 6);
    ctx.fillStyle = color;
    ctx.fill();

    ctx.beginPath();
    ctx.arc(x + 38, y + CH / 2, 22, 0, Math.PI * 2);
    ctx.fillStyle = hexAlpha(cfg.color, inStock ? 0.15 : 0.06);
    ctx.fill();

    if (item.iconUrl) {
      try {
        const img = await loadImage(item.iconUrl);
        ctx.drawImage(img, x + 38 - 19, y + CH / 2 - 19, 38, 38);
      } catch (_) {
        ctx.font = `26px ${FONT_FAMILY}`;
        ctx.fillText(emoji, x + 22, y + CH / 2 + 10);
      }
    } else {
      ctx.font = `26px ${FONT_FAMILY}`;
      ctx.fillText(emoji, x + 22, y + CH / 2 + 10);
    }

    // 1. Draw Price badge box(es) at top-right & calculate total width
    const prices = [];
    if (item.price > 0 && item.currency) prices.push({ value: item.price, type: item.currency });
    if (item.priceAlt > 0 && item.currencyAlt) prices.push({ value: item.priceAlt, type: item.currencyAlt });

    prices.sort((a, b) => {
      if (a.type === 5) return 1;
      if (b.type === 5) return -1;
      return 0;
    });

    let totalPricesWidth = 0;
    let currentRightX = x + CW - 12;
    const priceCenterY = y + 26;

    if (prices.length > 0) {
      prices.forEach((p) => {
        const badgeW = drawPriceBadgeBox(ctx, currentRightX, priceCenterY, p.value, p.type, inStock);
        currentRightX -= (badgeW + 5);
        totalPricesWidth += (badgeW + 5);
      });
    }

    // 2. Calculate exact dynamic available width for Item Name
    const nameStartX = x + 68;
    const availableNameWidth = totalPricesWidth > 0 ? (x + CW - 12 - totalPricesWidth - nameStartX - 8) : (CW - 80);

    // 3. Draw Item Name dynamically scaled & truncated with "..." (CHỐNG ĐÈ CHỮ 100%)
    ctx.fillStyle = inStock ? '#323238' : '#969696';
    let fontSize = 17;
    let displayName = name;
    ctx.font = `bold ${fontSize}px ${FONT_FAMILY}`;

    while (ctx.measureText(displayName).width > availableNameWidth && fontSize > 12) {
      fontSize -= 1;
      ctx.font = `bold ${fontSize}px ${FONT_FAMILY}`;
    }

    if (ctx.measureText(displayName).width > availableNameWidth) {
      while (ctx.measureText(displayName + '...').width > availableNameWidth && displayName.length > 0) {
        displayName = displayName.slice(0, -1);
      }
      displayName += '...';
    }

    ctx.fillText(displayName, nameStartX, y + 34);

    // Sub info (Category)
    ctx.fillStyle = inStock ? '#786c5c' : '#b4b4b4';
    ctx.font = `bold 13px ${FONT_FAMILY}`;
    ctx.fillText(cfg.title, nameStartX, y + 58);

    // 4. Draw Stock Badge Box at bottom-right (BELOW price badge box!)
    const stockCenterY = y + 58;
    drawStockBadgeBox(ctx, x + CW - 12, stockCenterY, stock);
  }

  drawFooter(ctx, W, H);
  return canvasToTempFile(canvas);
}

export async function renderFriend(friends, query, ns, time) {
  const PINK = '#dc3c78';
  const list = friends || [];

  const W = 780, PAD = 16, HDR = 90, CH = 185, GAP = 14, FTR = 50;
  const CW = W - PAD * 2;
  const H = HDR + 10 + Math.max(1, list.length) * (CH + GAP) + PAD + FTR;

  const SCALE = 2;
  const canvas = createCanvas(W * SCALE, H * SCALE);
  const ctx = canvas.getContext('2d');
  ctx.scale(SCALE, SCALE);
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';

  ctx.fillStyle = '#fff5e1';
  ctx.fillRect(0, 0, W, H);

  const title = `HỒ SƠ BẠN BÈ${query ? ': ' + query : ''}`;
  await drawHeader(ctx, W, HDR, title, 'PLAY TOGETHER', ns, time, PINK, HEADER_ICONS.friend);

  if (!list.length) {
    ctx.fillStyle = '#969696';
    ctx.font = `bold 20px ${FONT_FAMILY}`;
    ctx.textAlign = 'center';
    ctx.fillText('Không tìm thấy thông tin người chơi', W / 2, HDR + 60);
    ctx.textAlign = 'left';
  }

  for (const [i, f] of list.entries()) {
    const y = HDR + 10 + i * (CH + GAP);
    const x = PAD;
    const online = f.online !== false;
    const dotColor = online ? '#32c864' : '#b4b4b4';

    // 1. 3D Card Depth Shadow
    roundRect(ctx, x, y + 3, CW, CH, 16);
    ctx.fillStyle = 'rgba(0, 0, 0, 0.07)';
    ctx.fill();

    // 2. Main Card Surface
    roundRect(ctx, x, y, CW, CH, 16);
    ctx.fillStyle = '#ffffff';
    ctx.fill();
    ctx.strokeStyle = PINK;
    ctx.lineWidth = 2.5;
    ctx.stroke();

    // Left Accent Bar
    roundRect(ctx, x, y, 8, CH, 8);
    ctx.fillStyle = PINK;
    ctx.fill();

    // 3. Avatar Frame & Image
    const avX = x + 24, avY = y + 20, avSize = 72;
    ctx.save();
    ctx.beginPath();
    ctx.arc(avX + avSize / 2, avY + avSize / 2, avSize / 2, 0, Math.PI * 2);
    ctx.fillStyle = '#ffeaf2';
    ctx.fill();
    ctx.strokeStyle = PINK;
    ctx.lineWidth = 2;
    ctx.stroke();

    if (f.avatarUrl) {
      try {
        const img = await loadImage(f.avatarUrl);
        ctx.save();
        ctx.beginPath();
        ctx.arc(avX + avSize / 2, avY + avSize / 2, avSize / 2 - 2, 0, Math.PI * 2);
        ctx.clip();
        ctx.drawImage(img, avX, avY, avSize, avSize);
        ctx.restore();
      } catch (_) {
        ctx.font = `36px ${FONT_FAMILY}`;
        ctx.fillStyle = '#323238';
        ctx.fillText('👤', avX + 16, avY + 50);
      }
    } else {
      ctx.font = `36px ${FONT_FAMILY}`;
      ctx.fillStyle = '#323238';
      ctx.fillText('👤', avX + 16, avY + 50);
    }
    ctx.restore();

    // Online Status Dot
    ctx.beginPath();
    ctx.arc(avX + avSize - 6, avY + avSize - 6, 9, 0, Math.PI * 2);
    ctx.fillStyle = dotColor;
    ctx.fill();
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 2;
    ctx.stroke();

    // 4. Player Name & Info Header
    const nameX = avX + avSize + 16;
    const nameText = f.name || f.nickname || 'Unknown';
    ctx.fillStyle = '#222228';
    ctx.font = `bold 20px ${FONT_FAMILY}`;
    ctx.fillText(nameText, nameX, avY + 24);

    ctx.fillStyle = '#787888';
    ctx.font = `bold 13px ${FONT_FAMILY}`;
    ctx.fillText(`ID: ${f.id || 'N/A'}  •  Lv.${f.level || 1}`, nameX, avY + 48);

    // Online Badge
    roundRect(ctx, nameX, avY + 56, 82, 22, 6);
    ctx.fillStyle = online ? 'rgba(50, 200, 100, 0.12)' : 'rgba(180, 180, 180, 0.15)';
    ctx.fill();
    ctx.fillStyle = online ? '#27964c' : '#787878';
    ctx.font = `bold 12px ${FONT_FAMILY}`;
    ctx.fillText(online ? '🟢 Online' : '⚪ Offline', nameX + 10, avY + 71);

    // 5. Player Stats Row (Likes, Views, Followers)
    const statsY = y + 115;
    const statsList = [
      { label: '❤️ Lượt thích', val: (f.likes || f.likeCount || 0).toLocaleString(), color: '#e53e3e' },
      { label: '👁️ Lượt ghé', val: (f.views || f.visitCount || 0).toLocaleString(), color: '#3182ce' },
      { label: '👥 Theo dõi', val: (f.followers || f.followCount || 0).toLocaleString(), color: '#805ad5' },
    ];

    let statX = avX;
    statsList.forEach((st) => {
      roundRect(ctx, statX, statsY, 114, 52, 10);
      ctx.fillStyle = 'rgba(245, 245, 250, 0.9)';
      ctx.fill();
      ctx.strokeStyle = 'rgba(200, 200, 220, 0.6)';
      ctx.lineWidth = 1;
      ctx.stroke();

      ctx.fillStyle = st.color;
      ctx.font = `bold 12px ${FONT_FAMILY}`;
      ctx.fillText(st.label, statX + 10, statsY + 22);

      ctx.fillStyle = '#2d3748';
      ctx.font = `bold 15px ${FONT_FAMILY}`;
      ctx.fillText(st.val, statX + 10, statsY + 42);

      statX += 122;
    });

    // 6. Costume & Pet Box (Trang phục 6 món & Thú cưng)
    const outfitX = x + 405;
    const outfitY = y + 15;
    const outfitW = CW - 420;
    const outfitH = CH - 30;

    roundRect(ctx, outfitX, outfitY, outfitW, outfitH, 12);
    ctx.fillStyle = 'rgba(255, 245, 250, 0.85)';
    ctx.fill();
    ctx.strokeStyle = 'rgba(220, 100, 150, 0.3)';
    ctx.lineWidth = 1.2;
    ctx.stroke();

    ctx.fillStyle = PINK;
    ctx.font = `bold 13px ${FONT_FAMILY}`;
    ctx.fillText('🎽 TRANG PHỤC & THÚ CƯNG', outfitX + 12, outfitY + 22);

    const outfit = f.outfit || f.costume || {};
    const outfitItems = [
      `💇 Tóc: ${outfit.hair || 'Mặc định'}`,
      `🎭 Mặt: ${outfit.face || 'Mặc định'}`,
      `👕 Thân: ${outfit.shirt || outfit.body || 'Mặc định'}`,
      `👖 Quần: ${outfit.pants || 'Mặc định'}`,
      `👓 Phụ kiện: ${outfit.acc || 'Không'}`,
      `🎨 Nước da: ${outfit.skin || 'Thường'}`,
    ];

    ctx.fillStyle = '#4a5568';
    ctx.font = `12px ${FONT_FAMILY}`;
    outfitItems.forEach((itemText, idx) => {
      const colIdx = idx % 2;
      const rowIdx = Math.floor(idx / 2);
      const itemX = outfitX + 12 + colIdx * 165;
      const itemY = outfitY + 44 + rowIdx * 23;

      let truncated = itemText;
      if (ctx.measureText(truncated).width > 155) {
        while (ctx.measureText(truncated + '...').width > 155 && truncated.length > 0) {
          truncated = truncated.slice(0, -1);
        }
        truncated += '...';
      }
      ctx.fillText(truncated, itemX, itemY);
    });

    const petText = `🐾 Thú cưng: ${f.pet?.name || f.pet || 'Chưa trang bị'}`;
    ctx.fillStyle = '#c53030';
    ctx.font = `bold 12px ${FONT_FAMILY}`;
    let truncPet = petText;
    if (ctx.measureText(truncPet).width > outfitW - 24) {
      while (ctx.measureText(truncPet + '...').width > outfitW - 24 && truncPet.length > 0) {
        truncPet = truncPet.slice(0, -1);
      }
      truncPet += '...';
    }
    ctx.fillText(truncPet, outfitX + 12, outfitY + outfitH - 12);
  }

  drawFooter(ctx, W, H);
  return canvasToTempFile(canvas);
}

class PTGService extends EventEmitter {
  constructor() {
    super();
    this.cache = { categories: [], lastUpdate: null };
    this.followMap = new Map(readFollowStore().map((entry) => [entry.key, entry]));
    this.apis = new Map();
    this.reconnectAttempts = 0;
    this.reconnectTimer = null;
    this.closed = false;
    this.groupSettings = readGroupSettings();
    this.connect();
    this.followTimer = setInterval(() => this.checkFollows(), 30_000);
    this.followTimer.unref?.();
  }

  connect() {
    if (this.closed || this.ws?.readyState === WebSocket.CONNECTING || this.ws?.readyState === WebSocket.OPEN) return;
    this.ws = new WebSocket(WS_URL);
    this.ws.on('open', () => {
      this.reconnectAttempts = 0;
      console.log('[PTG] WebSocket connected');
    });
    this.ws.on('message', (data) => this.handleMessage(data));
    this.ws.on('error', (err) => console.error('[PTG] WebSocket error:', err.message));
    this.ws.on('close', () => {
      if (this.closed) return;
      const delay = Math.min(MAX_RECONNECT_DELAY_MS, 5_000 * 2 ** Math.min(this.reconnectAttempts++, 4));
      console.warn(`[PTG] WebSocket closed, reconnecting in ${delay / 1000}s`);
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = setTimeout(() => this.connect(), delay);
      this.reconnectTimer.unref?.();
    });
  }

  registerApi(api) {
    this.apis.set(String(api.getBotId()), api);
  }

  getGroupSetting(botId, threadId) {
    const key = `${botId}:${threadId}`;
    const current = this.groupSettings[key] || {};
    return {
      key, botId: String(botId), threadId: String(threadId),
      followTags: current.followTags !== false,
      notify: current.notify === true,
      hiddenItems: Array.isArray(current.hiddenItems) ? current.hiddenItems : [],
    };
  }

  updateGroupSetting(botId, threadId, changes) {
    const setting = this.getGroupSetting(botId, threadId);
    this.groupSettings[setting.key] = { ...setting, ...changes };
    writeGroupSettings(this.groupSettings);
    return this.getGroupSetting(botId, threadId);
  }

  getUserFollows(api, message) {
    const botId = String(api.getBotId());
    const threadId = String(message.threadId);
    const userId = String(message.data.uidFrom);
    return [...this.followMap.values()].filter((entry) =>
      entry.botId === botId && entry.threadId === threadId && entry.userId === userId
    );
  }

  persistFollows() {
    try {
      writeFollowStore([...this.followMap.values()]);
    } catch (error) {
      console.error('[PTG] Failed to save follows:', error.message);
    }
  }

  handleMessage(data) {
    try {
      const f = JSON.parse(data);
      if (f.type === 'snapshot' || f.type === 'update') {
        if (f.data?.categories) {
          const previousCategories = this.cache.categories;
          this.cache.categories = f.data.categories;
          this.cache.lastUpdate = Date.now();
          this.emit('update', this.cache);
          if (previousCategories.length) this.notifyGroupsOnUpdate(previousCategories).catch((error) => {
            console.error('[PTG] Failed to notify groups:', error.message);
          });
        }
      } else if (f.type === 'exhausted') {
        console.warn('lỗi chấm hết');
      } else if (f.type === 'error') {
        console.error('lỗi key', f.reason);
      }
    } catch (e) {
      console.error('lỗi phân tích', e);
    }
  }

  getCategory(key) {
    return this.cache.categories.find((c) => c.key === key) || { items: [] };
  }

  async findPlayers(query) {
    if (!PROFILE_API_URL) {
      return { ok: false, reason: 'unconfigured' };
    }

    try {
      const url = new URL(PROFILE_API_URL);
      url.searchParams.set('q', query);
      const response = await fetch(url, {
        headers: {
          accept: 'application/json',
          ...(PROFILE_API_KEY ? { authorization: `Bearer ${PROFILE_API_KEY}` } : {}),
        },
        signal: AbortSignal.timeout(12_000),
      });
      if (!response.ok) {
        console.warn(`[PTG] Profile lookup failed: HTTP ${response.status}`);
        return { ok: false, reason: 'unavailable' };
      }
      return { ok: true, players: normalizeProfiles(await response.json()) };
    } catch (error) {
      console.error('[PTG] Profile lookup failed:', error.message);
      return { ok: false, reason: 'unavailable' };
    }
  }

  followItem(api, message, itemName) {
    const items = splitItemNames(itemName);
    if (!items.length) return 'Vui lòng nhập tên vật phẩm cần theo dõi.';
    for (const item of items) {
      const normalizedName = normalizeItemName(item);
      const entry = {
        key: `${api.getBotId()}:${message.type}:${message.threadId}:${message.data.uidFrom}:${normalizedName}`,
        botId: String(api.getBotId()), threadId: String(message.threadId), type: message.type,
        userId: String(message.data.uidFrom), userName: message.data?.dName || 'Người dùng',
        itemName: normalizedName, createdAt: Date.now(),
      };
      this.followMap.set(entry.key, entry);
    }
    this.persistFollows();
    return `Đã đăng ký theo dõi: ${items.map((item) => `"${item}"`).join(', ')}.`;
  }

  removeUserFollows(api, message, itemNames) {
    const requested = splitItemNames(itemNames).map(normalizeItemName);
    if (!requested.length) return 'Vui lòng nhập vật phẩm cần bỏ theo dõi.';
    let removed = 0;
    for (const entry of this.getUserFollows(api, message)) {
      if (requested.some((name) => entry.itemName.includes(name) || name.includes(entry.itemName))) {
        this.followMap.delete(entry.key);
        removed++;
      }
    }
    if (removed) this.persistFollows();
    return removed ? `Đã bỏ ${removed} theo dõi.` : 'Không tìm thấy vật phẩm theo dõi phù hợp.';
  }

  clearUserFollows(api, message) {
    const follows = this.getUserFollows(api, message);
    for (const entry of follows) this.followMap.delete(entry.key);
    if (follows.length) this.persistFollows();
    return follows.length ? `Đã xoá ${follows.length} theo dõi của bạn.` : 'Bạn chưa theo dõi vật phẩm nào.';
  }

  async notifyGroupsOnUpdate(previousCategories) {
    const previous = new Map(previousCategories.map((category) => [category.key, category]));
    for (const setting of Object.values(this.groupSettings)) {
      if (!setting?.notify) continue;
      const api = this.apis.get(String(setting.botId));
      if (!api) continue;
      const hidden = new Set((setting.hiddenItems || []).map(normalizeItemName));
      const updates = [];
      for (const category of this.cache.categories) {
        if (!['seeds', 'tools', 'weather'].includes(category.key)) continue;
        const oldKeys = new Set((previous.get(category.key)?.items || []).map((item) => String(item.id || item.name || item.vi)));
        const isAvailable = (item) => category.key === 'weather' ? Date.parse(item.endTime || 0) > Date.now() : (item.stock ?? 0) > 0;
        for (const item of (category.items || []).filter(isAvailable)) {
          const name = item.vi || item.name;
          if (!oldKeys.has(String(item.id || item.name || item.vi)) && !hidden.has(normalizeItemName(name))) {
            updates.push(`• ${category.key === 'weather' ? 'Thời tiết: ' : ''}${name}`);
          }
        }
      }
      if (updates.length) await api.sendMessage({ msg: `🔔 PTG vừa có cập nhật:\n${updates.slice(0, 12).join('\n')}`, ttl: 300_000 }, setting.threadId, MessageType.GroupMessage);
    }
  }

  checkFollows() {
    let changed = false;
    for (const [key, entry] of this.followMap.entries()) {
      // Keep persisted subscriptions until the owning bot has registered in
      // this process; otherwise a restart could consume a notification before
      // there is an API instance capable of delivering it.
      if (!this.apis.has(entry.botId)) continue;
      for (const catKey of ['seeds', 'tools', 'furniture']) {
        const cat = this.getCategory(catKey);
        const found = cat.items?.find(
          (it) => (it.vi || it.name).toLowerCase().includes(entry.itemName) && it.stock > 0
        );
        if (found) {
          this.emit('notify', entry, `Mặt hàng "${found.vi || found.name}" hiện đã có trong cửa hàng!`);
          this.followMap.delete(key);
          changed = true;
          break;
        }
      }
    }
    if (changed) this.persistFollows();
  }

  async buildWeatherCanvas(ns) {
    const now = Date.now();
    const items = (this.getCategory('weather').items || [])
      .filter((e) => Date.parse(e.endTime) > now)
      .map((e) => ({ vi: e.vi || e.name, name: e.name, time: e.endTime?.slice(11, 16) || '', iconUrl: e.iconUrl }));
    if (!items.length) return null;
    return await renderWeather(items, ns, getVNTime());
  }

  async buildShopCanvas(shopType, ns) {
    const items = (this.getCategory(shopType).items || [])
      .filter((it) => (it.stock ?? 0) > 0)
      .map((it) => ({
        vi: it.vi || it.name,
        name: it.name,
        stock: it.stock ?? 0,
        iconUrl: it.iconUrl,
        price: it.price ?? 0,
        currency: it.currency,
        priceAlt: it.priceAlt ?? 0,
        currencyAlt: it.currencyAlt,
      }));
    if (!items.length) return null;
    return await renderShop(items, shopType, ns, getVNTime());
  }

  async buildFriendCanvas(friends, query, ns) {
    return await renderFriend(friends, query, ns, getVNTime());
  }
}

export function getNameServer(api) {
  const dataBot = api.apiManager.getDataConfig();
  return dataBot.infoOwner?.nameServer || nameServer;
}

export const ptgService = new PTGService();

export async function handlePTGCommand(api, message, alias, parts, permissions = {}) {
  ptgService.registerApi(api);

  let commandParts = [...parts];
  let sub = (commandParts[0] || '').toLowerCase();
  if (sub === 'thời' && commandParts[1]?.toLowerCase() === 'tiết') {
    sub = 'thoitiet';
    commandParts = ['thoitiet', ...commandParts.slice(2)];
  }
  if (['tt', 'thoitiet'].includes(sub)) sub = 'thoitiet';
  if (sub === 'timban' || sub === 'tb') sub = 'friend';
  if (sub === 'hoso' || sub === 'profile') sub = 'friend';
  // Play Together also issues share IDs such as RKHX-VT9L-LMYU, not only
  // numeric player IDs.
  if (/^\d{4,}$/.test(sub) || /^[a-z0-9]{3,}(?:-[a-z0-9]{2,})+$/i.test(sub)) {
    commandParts = ['friend', sub, ...commandParts.slice(1)];
    sub = 'friend';
  }
  const prefix = getGlobalPrefix(api.getBotId());
  const isGroupAdmin = Boolean(permissions.isAdminLevelHighest || permissions.isAdminBot || permissions.isAdminBox);
  const requireGroupAdmin = () => {
    if (message.type !== MessageType.GroupMessage) return 'Lệnh này chỉ dùng trong nhóm.';
    if (!isGroupAdmin) return 'Chỉ quản trị viên nhóm mới dùng được lệnh này.';
    return null;
  };

  const styleOpts = {
    color: 'green', size: '10', isBold: true,
    reply: true, tagSender: true, hasNameServer: true,
  };
  const ns = getNameServer(api);

  async function sendCanvas(imgPath, fallbackText) {
    if (!imgPath)
      return SendMessageStyle(api, message, fallbackText, styleOpts);

    try {
      const result = await SendMessageStyle(api, message, '', {
        ...styleOpts,
        attachments: [imgPath]
      });
      try {
        unlinkSync(imgPath);
      } catch { }

      return result;

    } catch (e) {
      console.error('[PTG] sendCanvas fail:', e);

      try {
        unlinkSync(imgPath);
      } catch { }

      return SendMessageStyle(api, message, fallbackText, styleOpts);
    }
  }

  switch (sub) {
    case 'thoitiet': {
      const img = await ptgService.buildWeatherCanvas(ns);
      return sendCanvas(img, 'Không có thông tin thời tiết.');
    }
    case 'hatgiong':
    case 'seeds':
      {
        const img = await ptgService.buildShopCanvas('seeds', ns);
        return sendCanvas(img, 'Không có dữ liệu hạt giống.');
      }
    case 'dungcu':
    case 'tools':
      {
        const img = await ptgService.buildShopCanvas('tools', ns);
        return sendCanvas(img, 'Không có dữ liệu dụng cụ.');
      }
    case 'noithat':
    case 'furniture':
      {
        const img = await ptgService.buildShopCanvas('furniture', ns);
        return sendCanvas(img, 'Không có dữ liệu nội thất.');
      }
    case 'friend':
      {
        const query = commandParts.slice(1).join(' ').trim();
        if (!query) {
          return SendMessageStyle(api, message, `Dùng: ${prefix}${alias} <mã người chơi|tên>\nVí dụ: ${prefix}${alias} 123456 hoặc ${prefix}${alias} timban Nguyen`, styleOpts);
        }
        const result = await ptgService.findPlayers(query);
        if (!result.ok) {
          const text = result.reason === 'unconfigured'
            ? 'Tra cứu hồ sơ chưa được cấu hình. Quản trị viên cần đặt NGH_PTG_PROFILE_API_URL để kết nối nguồn dữ liệu Play Together.'
            : 'Không thể kết nối nguồn dữ liệu hồ sơ Play Together. Vui lòng thử lại sau.';
          return SendMessageStyle(api, message, text, { ...styleOpts, color: 'red' });
        }
        const img = await ptgService.buildFriendCanvas(result.players.slice(0, 10), query, ns);
        return sendCanvas(img, 'Không tìm thấy thông tin người chơi.');
      }
    case 'follow':
      {
        const action = (commandParts[1] || '').toLowerCase();
        if (action === 'list') {
          const follows = ptgService.getUserFollows(api, message);
          const text = follows.length ? `🔔 Bạn đang theo dõi:\n${follows.map((entry, index) => `${index + 1}. ${entry.itemName}`).join('\n')}` : 'Bạn chưa theo dõi vật phẩm nào.';
          return SendMessageStyle(api, message, text, styleOpts);
        }
        if (action === 'clear') return SendMessageStyle(api, message, ptgService.clearUserFollows(api, message), styleOpts);
        if (action === 'remove' || action === 'rm') return SendMessageStyle(api, message, ptgService.removeUserFollows(api, message, commandParts.slice(2).join(' ')), styleOpts);
        if (action === 'on' || action === 'off') {
          const error = requireGroupAdmin();
          if (error) return SendMessageStyle(api, message, error, { ...styleOpts, color: 'red' });
          ptgService.updateGroupSetting(api.getBotId(), message.threadId, { followTags: action === 'on' });
          return SendMessageStyle(api, message, `Đã ${action === 'on' ? 'bật' : 'tắt'} tag người theo dõi trong nhóm.`, styleOpts);
        }
        return SendMessageStyle(api, message, ptgService.followItem(api, message, commandParts.slice(1).join(' ')), styleOpts);
      }
    case 'notify': {
      const action = (commandParts[1] || '').toLowerCase();
      const error = requireGroupAdmin();
      if (error) return SendMessageStyle(api, message, error, { ...styleOpts, color: 'red' });
      if (!['on', 'off'].includes(action)) return SendMessageStyle(api, message, `Dùng: ${prefix}${alias} notify on hoặc ${prefix}${alias} notify off`, styleOpts);
      ptgService.updateGroupSetting(api.getBotId(), message.threadId, { notify: action === 'on' });
      return SendMessageStyle(api, message, `Đã ${action === 'on' ? 'bật' : 'tắt'} báo cập nhật PTG cho nhóm.`, styleOpts);
    }
    case 'unfollow': {
      const error = requireGroupAdmin();
      if (error) return SendMessageStyle(api, message, error, { ...styleOpts, color: 'red' });
      const setting = ptgService.getGroupSetting(api.getBotId(), message.threadId);
      const action = (commandParts[1] || '').toLowerCase();
      if (action === 'list') {
        const text = setting.hiddenItems.length ? `🔕 Nhóm đang ẩn:\n${setting.hiddenItems.map((name, index) => `${index + 1}. ${name}`).join('\n')}` : 'Nhóm chưa ẩn vật phẩm nào.';
        return SendMessageStyle(api, message, text, styleOpts);
      }
      if (action === 'rm') {
        const requested = commandParts.slice(2).join(' ').trim();
        const hiddenItems = requested.toLowerCase() === 'all' ? [] : setting.hiddenItems.filter((item) => !splitItemNames(requested).map(normalizeItemName).includes(normalizeItemName(item)));
        ptgService.updateGroupSetting(api.getBotId(), message.threadId, { hiddenItems });
        return SendMessageStyle(api, message, requested.toLowerCase() === 'all' ? 'Đã bỏ ẩn toàn bộ vật phẩm.' : 'Đã bỏ ẩn vật phẩm đã chọn.', styleOpts);
      }
      const items = splitItemNames(commandParts.slice(1).join(' '));
      if (!items.length) return SendMessageStyle(api, message, `Dùng: ${prefix}${alias} unfollow <tên vật phẩm>`, styleOpts);
      ptgService.updateGroupSetting(api.getBotId(), message.threadId, { hiddenItems: [...new Set([...setting.hiddenItems, ...items.map(normalizeItemName)])] });
      return SendMessageStyle(api, message, `Đã ẩn khỏi báo nhóm: ${items.join(', ')}.`, styleOpts);
    }
    case 'donate':
      {
        const qrUrl = 'https://files.catbox.moe/7ha8rx.jpeg';
        const savePath = join(tempDir, `ptg_donate_${Date.now()}.jpg`);
        try {
          const tempQrPath = await downloadFile(qrUrl, savePath);
          return await sendCanvas(tempQrPath, '📦 Cảm ơn bạn đã ủng hộ Bot Play Together!');
        } catch (e) {
          console.error('[PTG] Lỗi khi tải ảnh QR donate:', e.message);
          return SendMessageStyle(api, message, '📦 Lỗi khi tải ảnh QR donate, vui lòng thử lại sau.', { ...styleOpts, color: 'red' });
        }
      }
    default: {
      const helpText =
        `🔍 Hướng dẫn lệnh Play Together:\n\n` +
        `• ${prefix}${alias} thoitiet (tt) - Xem thời tiết farm\n` +
        `• ${prefix}${alias} <mã người chơi|tên> - Tra cứu hồ sơ\n` +
        `• ${prefix}${alias} timban <tên> - Tìm người chơi\n` +
        `• ${prefix}${alias} hatgiong · dungcu · noithat - Xem shop\n` +
        `• ${prefix}${alias} follow <tên 1, tên 2> - Theo dõi hàng về\n` +
        `• ${prefix}${alias} follow list | remove <tên> | clear\n` +
        `• ${prefix}${alias} follow on|off - Bật/tắt tag theo dõi (admin)\n` +
        `• ${prefix}${alias} notify on|off - Bật/tắt báo nhóm (admin)\n` +
        `• ${prefix}${alias} unfollow <tên> | list | rm <tên|all> (admin)`;
      return SendMessageStyle(api, message, helpText, {
        color: 'red', size: '10', isBold: true,
        reply: true, tagSender: true, hasNameServer: false,
      });
    }
  }
}

ptgService.on('notify', async (entry, text) => {
  const api = ptgService.apis.get(entry.botId);
  if (!api) return;
  try {
    const fakeMessage = {
      threadId: entry.threadId, type: entry.type,
      data: { uidFrom: entry.userId, dName: entry.userName || 'Người dùng' },
    };
    const setting = ptgService.getGroupSetting(entry.botId, entry.threadId);
    await SendMessageStyle(api, fakeMessage, text, {
      color: 'green', size: '10', isBold: true,
      reply: false, tagSender: setting.followTags && entry.type === MessageType.GroupMessage, hasNameServer: true,
    });
  } catch (e) {
    console.error('Lỗi gửi notify:', e);
  }
});
