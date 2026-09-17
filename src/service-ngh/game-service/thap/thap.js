import Big from 'big.js';
import fs from 'node:fs/promises';
import { randomInt } from 'node:crypto';
import { getPlayerBalance, getUsernameByIdZalo, updatePlayerBalanceByUsername, setLoserGameByUsername } from '../../../database/player.js';
import { parseGameAmount } from '../../../utils/format-util.js';
import { getGlobalPrefix } from '../../service.js';
import { checkBeforeJoinGame } from '../index.js';
import { MODES, normalize, payout, resolveTowerBomb } from './rules.js';
import { createTowerImage } from './canvas.js';
import { gameSenderMessage } from '../../../utils/game-mentions.js';
const sessions = new Map(), locks = new Map();
const towerCountdowns = new Map();
const MAX_COUNTDOWN_REACTIONS = 60;
const keyOf = (api, message) => JSON.stringify([api.getBotId(), message.type, message.threadId, message.data.gameUid || message.data.uidFrom]);
async function locked(key, fn) {
  const previous = locks.get(key) || Promise.resolve();
  const work = previous.catch(() => {}).then(fn); locks.set(key, work);
  try { return await work; } finally { if (locks.get(key) === work) locks.delete(key); }
}
export function towerContinuation(api, message, content) {
  if (!sessions.has(keyOf(api, message))) return null;
  const text = normalize(content.trim());
  if (!/^(?:[1-4]|chon\s+[1-4]|rut)$/.test(text)) return null;
  return `${getGlobalPrefix(api.getBotId())}thap ${text}`;
}
function help(p) {
  return `🏰 THÁP TIỀN — leo 8 tầng\n${p}thap <tiền|all|10%> [de/vua/kho]\nDễ: 4 ô · Vừa: 3 ô · Khó: 2 ô; mỗi lựa chọn có 80% trúng bom.\nChọn ô an toàn để leo; trúng bom mất cược.\n${p}thap chon <số ô> hoặc gõ số khi đang chơi.\n${p}thap rut hoặc gõ “rút” để nhận tiền.\nCược tối thiểu 10.000 xu. Phí 5% phần lãi; tự rút sau 90 giây không thao tác.`;
}
async function reply(api, message, text, session) {
  let image;
  try {
    if (session) image = await createTowerImage(session);
    const base = gameSenderMessage(message, text);
    return await api.sendMessage({
      ...base,
      quote: message,
      ...(image ? { attachments: [image] } : {}),
      ttl: 120_000,
    }, message.threadId, message.type);
  } catch (error) {
    console.error('[thap] Gửi bảng:', error.message);
    const base = gameSenderMessage(message, text);
    return await api.sendMessage({ ...base, quote: message, ttl: 120_000 }, message.threadId, message.type);
  } finally { if (image) await fs.unlink(image).catch(() => {}); }
}

function towerTarget(api, source, sent) {
  const sources = [sent?.message, sent?.message?.data, sent?.data, sent, sent?.attachment?.[0], sent?.attachment?.[0]?.data];
  let msgId = null, cliMsgId = null;
  for (const item of sources) {
    if (!item || typeof item !== 'object') continue;
    msgId ||= item.msgIds?.[0] || item.messageIds?.[0] || item.msgId || item.globalMsgId || item.messageId;
    cliMsgId ||= item.cliMsgId || item.clientId || item.clientMsgId;
  }
  if (!msgId || !cliMsgId || typeof api.addReaction !== 'function') return null;
  return { type: source.type, threadId: source.threadId, data: { msgId: String(msgId), cliMsgId: String(cliMsgId), uidFrom: String(api.getBotId()) } };
}

function startTowerReactionCountdown(api, message, seconds) {
  if (!message || !seconds) return;
  const key = String(message.threadId || '');
  const old = towerCountdowns.get(key);
  if (old) { old.cancelled = true; void api.addReaction('UNDO', old.batch?.length ? old.batch : old.message).catch(() => {}); }
  const state = { message, batch: null, cancelled: false };
  towerCountdowns.set(key, state);
  void (async () => {
    const deadline = Date.now() + Number(seconds) * 1000;
    try {
      await new Promise(resolve => setTimeout(resolve, 300));
      while (!state.cancelled) {
        const remaining = Math.ceil((deadline - Date.now()) / 1000);
        if (remaining <= 0) break;
        const batch = Array(Math.min(remaining, MAX_COUNTDOWN_REACTIONS)).fill(message);
        state.batch = batch;
        await api.addReaction('CLOCK', batch).catch(() => {});
        await new Promise(resolve => setTimeout(resolve, 1000));
        if (state.cancelled) break;
        await api.addReaction('UNDO', batch).catch(() => {});
        state.batch = null;
      }
    } finally {
      if (towerCountdowns.get(key) === state) towerCountdowns.delete(key);
      if (state.batch) await api.addReaction('UNDO', state.batch).catch(() => {});
    }
  })();
}
async function credit(s, amount, meta = null) {
  const result = await updatePlayerBalanceByUsername(s.username, amount, null, 0, meta);
  if (!result?.success) throw new Error(result?.message || 'Không thể cập nhật số dư');
}
async function settle(key, s) {
  const returned = payout(s.amount, s.mode, s.picks.length);
  await credit(s, returned, {
    gameName: "Tháp Tiền",
    gameKey: "thap",
    choice: `Tầng ${s.picks.length}`,
    betAmount: Number(s.amount),
    detail: `Rút thưởng tầng ${s.picks.length}/8`,
  });
  clearTimeout(s.timer); sessions.delete(key); s.status = 'cashed';
  return returned;
}
function arm(key, s) {
  clearTimeout(s.timer);
  s.timer = setTimeout(() => {
    locked(key, async () => {
      if (sessions.get(key) !== s) return;
      let returned;
      try { returned = await settle(key, s); }
      catch (error) { console.error('[thap] Tự rút:', error.message); arm(key, s); return; }
      await reply(s.api, s.message, `⏱ Tháp Tiền: tự rút ${returned} xu sau 90 giây không thao tác.`, s);
    }).catch(error => console.error('[thap]', error.message));
  }, 90_000);
  s.timer.unref?.();
}
export async function handleTower(api, message, groupSettings) {
  const key = keyOf(api, message);
  return locked(key, async () => {
    if (!(await checkBeforeJoinGame(api, message, groupSettings, true))) return true;
    const p = getGlobalPrefix(api.getBotId());
    const raw = message.data.content;
    const text = String(typeof raw === 'object' ? raw.title || '' : raw || '').trim();
    const parts = normalize(text.slice(p.length)).split(/\s+/).slice(1);
    let s = sessions.get(key);
    if (!parts.length || parts[0] === 'help') { await reply(api, message, help(p)); return true; }
    try {
      if (s) {
        if (parts[0] === 'rut' && parts.length === 1) {
          const returned = await settle(key, s);
          await reply(api, message, `💰 Tháp Tiền: nhận ${returned} xu (đã trừ phí lãi).`, s); return true;
        }
        const cellText = parts[0] === 'chon' && parts.length === 2 ? parts[1] : parts.length === 1 ? parts[0] : '';
        const col = /^[1-4]$/.test(cellText) ? Number(cellText) : 0;
        if (!col || col > MODES[s.mode].columns) throw new Error(`Chọn ô 1–${MODES[s.mode].columns} bằng ${p}thap chon <ô>, hoặc ${p}thap rut.`);
        if (s.picks.length === 8) throw new Error(`Đã lên đỉnh; dùng ${p}thap rut để thử nhận tiền lại.`);
        s.picks.push(col);
        s.bombs[s.picks.length - 1] = resolveTowerBomb(MODES[s.mode].columns, col);
        if (s.bombs[s.picks.length - 1] === col) {
          clearTimeout(s.timer); sessions.delete(key); s.status = 'lost';
          await setLoserGameByUsername(s.username, new Big(s.amount).neg().toNumber(), {
            gameName: "Tháp Tiền",
            gameKey: "thap",
            choice: `Tầng ${s.picks.length}`,
            betAmount: Number(s.amount),
            detail: `Trúng bom tầng ${s.picks.length}`,
          }).catch(() => {});
          await reply(api, message, `💥 Trúng bom tầng ${s.picks.length}! Mất ${s.amount} xu.`, s); return true;
        }
        arm(key, s);
        if (s.picks.length === 8) {
          const returned = await settle(key, s);
          await reply(api, message, `🏆 Chinh phục Tháp Tiền! Nhận ${returned} xu.`, s);
        } else await reply(api, message, `✅ Qua tầng ${s.picks.length}/8. Chọn ô 1–${MODES[s.mode].columns} hoặc ${p}thap rut để nhận ${payout(s.amount, s.mode, s.picks.length)} xu.`, s);
        return true;
      }
      if (['rut', 'chon'].includes(parts[0])) throw new Error(`Bạn chưa có ván Tháp Tiền.\n${help(p)}`);
      const mode = parts[1] || 'vua';
      if (!MODES[mode] || parts.length > 2) throw new Error(help(p));
      const uid = message.data.uidFrom, username = await getUsernameByIdZalo(uid), balance = await getPlayerBalance(uid);
      if (!username || !balance.success) throw new Error('Không thể lấy số dư người chơi.');
      const parsed = parseGameAmount(parts[0], balance.balance), amount = parsed === 'allin' ? new Big(balance.balance) : new Big(parsed);
      if (amount.lt(10000) || amount.gt(balance.balance) || !amount.eq(amount.round(0))) throw new Error('Cược phải là số nguyên từ 10.000 xu và không vượt số dư.');
      s = { username, name: message.data.dName || username, amount, mode, picks: [], bombs: Array.from({ length: 8 }, () => randomInt(1, MODES[mode].columns + 1)), status: 'playing', api, message };
      await credit(s, amount.neg()); sessions.set(key, s); arm(key, s);
      const sentStart = await reply(api, message, `🏰 Tháp Tiền · ${MODES[mode].label} · cược ${amount} xu.\nTầng 1/8: chọn 1–${MODES[mode].columns} hoặc ${p}thap rut.`, s);
      const countdownTarget = towerTarget(api, message, sentStart);
      if (countdownTarget) startTowerReactionCountdown(api, countdownTarget, 90);
    } catch (error) { await reply(api, message, error.message); }
    return true;
  });
}
