import { runWithGameServer } from "../private-game-server.js";
import fs from "fs";
import path from "path";
import GIFEncoder from "gifencoder";
import { createCanvas } from "canvas";
import Big from "big.js";
import { MessageType } from "../../../api-zalo/index.js";
import { groupSettingsAll } from "../../../automations/event-send-msg.js";
import { ensurePlayerAccount } from "../../../database/index.js";
import { updatePlayerBalance } from "../../../database/player.js";
import { apiManager, isBotLeader } from "../../../index.js";
import { formatCurrency, parseGameAmount, removeMention } from "../../../utils/format-util.js";
import { tempDir } from "../../../utils/io-json.js";
import { getGlobalPrefix } from "../../service.js";
import { getActiveCanvasStyle } from "../../../utils/canvas/theme.js";
import { resolveSentMessageTarget } from "../../../utils/zalo-message-target.js";

const STATE_PATH = path.resolve("./assets/json-data/giveaway.json");
const DRAW_DELAY = 15_000;
const WHEEL_DURATION = 3_200;
const SCHEDULE_RECHECK_MS = 10_000;
let drawing = false;
let drawTimer = null;
let scheduledGiveawayId = null;
const participantListMessages = new Map();
const joinReactionMap = new Map();

function extractMsgId(sent) {
  return (
    sent?.message?.msgId ??
    sent?.message?.data?.msgId ??
    sent?.msgId ??
    sent?.attachment?.[0]?.msgId ??
    sent?.attachment?.[0]?.data?.msgId ??
    sent?.attachments?.[0]?.msgId ??
    sent?.data?.msgId ??
    (Array.isArray(sent?.data?.msgIds) ? sent.data.msgIds[0] : null) ??
    (Array.isArray(sent?.msgIds) ? sent.msgIds[0] : null) ??
    (Array.isArray(sent) ? sent[0]?.msgId : null) ??
    null
  );
}

function extractCliMsgId(sent) {
  return (
    sent?.message?.cliMsgId ??
    sent?.cliMsgId ??
    sent?.attachment?.[0]?.cliMsgId ??
    sent?.attachment?.[0]?.clientId ??
    sent?.attachments?.[0]?.cliMsgId ??
    sent?.attachments?.[0]?.clientId ??
    sent?.data?.cliMsgId ??
    (Array.isArray(sent) ? sent[0]?.cliMsgId : null) ??
    null
  );
}

function registerJoinMessage(msgId, cliMsgId, stateId, threadId, botId) {
  const meta = { giveawayId: stateId, threadId: String(threadId), botId: String(botId) };
  if (msgId) joinReactionMap.set(String(msgId), meta);
  if (cliMsgId) joinReactionMap.set(String(cliMsgId), meta);
}

function syncJoinReactionMap(state) {
  if (!state || state.status !== "waiting") {
    joinReactionMap.clear();
    return;
  }
  for (const group of state.groups || []) {
    for (const msg of group.joinMessages || []) {
      registerJoinMessage(msg.msgId, msg.cliMsgId, state.id, group.threadId, group.botId);
    }
  }
}

syncJoinReactionMap(loadState());

function parseDuration(value) {
  const match = String(value || "").match(/^(\d+)(?:p|m|min|ph|phut)$/iu);
  if (!match) return null;
  const minutes = Number(match[1]);
  return minutes >= 1 && minutes <= 24 * 60 ? minutes * 60_000 : null;
}

function loadState() {
  try { return JSON.parse(fs.readFileSync(STATE_PATH, "utf8")); } catch { return null; }
}

function saveState(state) {
  const latest = loadState();
  if (latest && latest.id !== state.id && Number(latest.createdAt) > Number(state.createdAt)) return;
  if (latest?.id === state.id && latest.status === "cancelled") {
    state.status = "cancelled";
    state.cancelledAt = latest.cancelledAt;
    state.cancelledBy = latest.cancelledBy;
  }
  fs.mkdirSync(path.dirname(STATE_PATH), { recursive: true });
  fs.writeFileSync(STATE_PATH, `${JSON.stringify(state, null, 2)}\n`);
}

function sleep(ms) { return new Promise((resolve) => setTimeout(resolve, ms)); }

function formatDrawTime(timestamp) {
  return new Date(timestamp).toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit" });
}

function joinMessageTtl(state) {
  return Math.max(60_000, Number(state.drawAt || Date.now()) - Date.now());
}

async function rememberJoinMessage(api, state, threadId, sent) {
  if (!sent) return null;
  let msgId = extractMsgId(sent);
  let cliMsgId = extractCliMsgId(sent);

  if (!msgId && !cliMsgId) {
    const target = await resolveSentMessageTarget(api, { threadId, type: MessageType.GroupMessage, data: {} }, sent);
    msgId = target?.data?.msgId;
    cliMsgId = target?.data?.cliMsgId;
  }

  if (msgId || cliMsgId) {
    registerJoinMessage(msgId, cliMsgId, state.id, threadId, api.getBotId());
  }

  const latest = loadState();
  if (latest?.id !== state.id || latest.status !== "waiting") return { msgId, cliMsgId };
  const group = latest.groups?.find((item) => String(item.threadId) === String(threadId));
  if (group && (msgId || cliMsgId)) {
    group.joinMessages ??= [];
    const sMsgId = msgId ? String(msgId) : null;
    const sCliMsgId = cliMsgId ? String(cliMsgId) : null;
    if (!group.joinMessages.some((item) => (sMsgId && String(item.msgId) === sMsgId) || (sCliMsgId && String(item.cliMsgId) === sCliMsgId))) {
      group.joinMessages.push({ msgId: sMsgId, cliMsgId: sCliMsgId });
      saveState(latest);
    }
  }
  return { msgId, cliMsgId };
}

async function resolveUserName(api, uid, fallbackName = null) {
  if (fallbackName && fallbackName !== uid && !/^\d{10,}$/.test(fallbackName)) {
    return fallbackName;
  }
  try {
    if (typeof api.getInfoMembers === "function") {
      const info = await api.getInfoMembers([uid]);
      const profile = info?.profiles?.[uid];
      const name = profile?.zaloName || profile?.displayName || profile?.name;
      if (name) return name;
    }
  } catch (err) {
    // ignore
  }
  return fallbackName || uid;
}

function makeDeletableMessage(threadId, msgId, cliMsgId, botId, messageType = MessageType.GroupMessage) {
  if (!msgId || !cliMsgId) return null;
  return {
    type: messageType,
    threadId: String(threadId),
    data: {
      msgId: String(msgId),
      cliMsgId: String(cliMsgId),
      uidFrom: String(botId),
    },
  };
}

async function sendParticipantList(api, state, threadId, messageType) {
  const key = String(threadId);
  const previous = participantListMessages.get(key);
  if (previous) {
    await api.deleteMessage(previous, false).catch(() => {});
  }

  // Đảm bảo tên hiển thị là tên Zalo, không để UID thuần số
  let hasNameUpdated = false;
  for (const p of state.participants) {
    if (!p.name || p.name === p.uid || /^\d{10,}$/.test(p.name)) {
      const resolved = await resolveUserName(api, p.uid, p.name);
      if (resolved && resolved !== p.name) {
        p.name = resolved;
        hasNameUpdated = true;
      }
    }
  }
  if (hasNameUpdated) {
    saveState(state);
  }

  const participantList = state.participants.map((item) => `${item.number}: ${item.name}`).join("\n");
  const sent = await api.sendMessage(
    { msg: `💖 Thả tim vào tin nhắn này để tham gia hoặc gõ "tham gia"\n\n✅ Đã tham gia Giveaway\n👥 Số người tham gia: ${state.participants.length}/${state.capacity}\n\n📋 DANH SÁCH:\n${participantList}`, ttl: joinMessageTtl(state) },
    threadId,
    messageType
  );
  if (sent) {
    const target = await rememberJoinMessage(api, state, threadId, sent);
    const msgId = target?.msgId || extractMsgId(sent);
    const cliMsgId = target?.cliMsgId || extractCliMsgId(sent);
    if (msgId && cliMsgId) {
      const deletable = makeDeletableMessage(threadId, msgId, cliMsgId, api.getBotId(), messageType);
      if (deletable) participantListMessages.set(key, deletable);
    }
  }
}

function isMainBotAccount(api, senderId) {
  if (isBotLeader(api.getBotId(), senderId)) return true;
  const mainManager = Object.values(apiManager.apiManagerObject).find((manager) => manager.isMainBot);
  const mainBotId = mainManager?.id || mainManager?.apiZalo?.getBotId?.();
  return mainBotId != null && String(senderId) === String(mainBotId);
}

function groupApi(fallbackApi, group) {
  return apiManager.apiManagerObject[group.botId]?.apiZalo || fallbackApi;
}

async function broadcast(api, state, msg, attachments = [], mentions = []) {
  for (const group of state.groups) {
    const targetApi = groupApi(api, group);
    const sent = await targetApi.sendMessage({ msg, attachments, mentions, ttl: state.status === "waiting" ? joinMessageTtl(state) : 600_000, isUseProphylactic: true }, group.threadId, MessageType.GroupMessage)
      .catch((error) => console.error(`[GIVEAWAY] Không gửi được tới ${group.threadId}:`, error?.message || error));
    if (state.status === "waiting") await rememberJoinMessage(targetApi, state, group.threadId, sent);
    if (attachments.length) await sleep(800);
  }
}

async function setGroupsLocked(api, state, locked) {
  for (const group of state.groups) {
    try {
      const targetApi = groupApi(api, group);
      const info = await targetApi.getInfoOneGroup(group.threadId);
      const data = info?.gridInfoMap?.[group.threadId] || info;
      const setting = { ...(data?.setting || {}) };
      if (locked && group.previousLock == null) group.previousLock = Number(setting.lockSendMsg || 0);
      setting.lockSendMsg = locked ? 1 : Number(group.previousLock || 0);
      await targetApi.changeGroupSetting(group.threadId, setting);
      if (!locked) group.previousLock = null;
    } catch (error) {
      console.error(`[GIVEAWAY] Không ${locked ? "khóa" : "mở"} được nhóm ${group.threadId}:`, error?.message || error);
    }
  }
  const latest = loadState();
  if (latest?.id === state.id) {
    latest.groups = state.groups;
    saveState(latest);
  }
}

async function createWheelGif(participants, winner, round) {
  fs.mkdirSync(tempDir, { recursive: true });
  const outputPath = path.join(tempDir, `giveaway-${Date.now()}-${round}.gif`);
  const width = 800, height = 800;
  const centerX = width / 2, centerY = 425, radius = 292;
  const canvas = createCanvas(width, height), ctx = canvas.getContext("2d");
  const encoder = new GIFEncoder(width, height);
  const output = fs.createWriteStream(outputPath);
  const finished = new Promise((resolve, reject) => { output.once("finish", resolve); output.once("error", reject); });
  encoder.createReadStream().pipe(output); encoder.start(); encoder.setRepeat(0); encoder.setDelay(120); encoder.setQuality(15);

  const frames = 22;
  const slotCount = 12;
  const others = participants.filter((item) => item.uid !== winner.uid).sort(() => Math.random() - 0.5);
  const wheelSlots = [winner, ...others.slice(0, slotCount - 1)];
  while (wheelSlots.length < slotCount) wheelSlots.push(participants[wheelSlots.length % participants.length]);
  const step = (Math.PI * 2) / slotCount;
  const activeStyle = getActiveCanvasStyle();
  const wheelThemes = {
    1: { bg: ["#08162e", "#172957", "#070b18"], glow: "rgba(74,124,255,.28)", title: "#fff4c4", sub: "#95addd", wheel: ["#ef3f4f", "#f5b72e", "#36a648", "#326be0"] },
    2: { bg: ["#f1f5f3", "#f1f5f3", "#f1f5f3"], glow: "transparent", title: "#183b35", sub: "#647971", wheel: ["#087f68", "#497767", "#42695e", "#285549"] },
    3: { bg: ["#2b241b", "#6f5527", "#1c1917"], glow: "rgba(214,181,108,.30)", title: "#fffaf0", sub: "#d6b56c", wheel: ["#8c2946", "#b78b35", "#496b55", "#614a91"] },
    4: { bg: ["#fff1f2", "#ef476f", "#111827"], glow: "rgba(255,255,255,.28)", title: "#ffffff", sub: "#fecdd3", wheel: ["#ef476f", "#fb7185", "#111827", "#f59e0b"] },
    5: { bg: ["#160b35", "#28547a", "#071a2b"], glow: "rgba(217,70,239,.35)", title: "#ffffff", sub: "#99f6e4", wheel: ["#d946ef", "#14b8a6", "#6366f1", "#0ea5e9"] },
  };
  const wheelTheme = wheelThemes[activeStyle] || wheelThemes[1];
  const finalRotation = -Math.PI / 2 - step / 2; // tâm ô người thắng nằm đúng dưới mũi tên
  for (let frame = 0; frame < frames; frame++) {
    const finalFrame = frame >= frames - 4;
    const progress = Math.min(1, frame / (frames - 4));
    const eased = 1 - Math.pow(1 - progress, 3);
    const rotation = finalFrame ? finalRotation : finalRotation + (1 - eased) * Math.PI * 10;
    const bg = ctx.createLinearGradient(0, 0, width, height);
    bg.addColorStop(0, wheelTheme.bg[0]); bg.addColorStop(0.5, wheelTheme.bg[1]); bg.addColorStop(1, wheelTheme.bg[2]);
    ctx.fillStyle = bg; ctx.fillRect(0, 0, width, height);
    const glow = ctx.createRadialGradient(centerX, centerY, 80, centerX, centerY, 390);
    glow.addColorStop(0, wheelTheme.glow); glow.addColorStop(1, "rgba(5,8,20,0)"); ctx.fillStyle = glow; ctx.fillRect(0, 0, width, height);
    ctx.textAlign = "center"; ctx.fillStyle = wheelTheme.title; ctx.font = "bold 38px sans-serif"; ctx.fillText(activeStyle === 3 ? "THE ROYAL DRAW" : activeStyle === 4 ? "SAKURA LUCKY DRAW" : activeStyle === 5 ? "AURORA LUCKY DRAW" : "VÒNG QUAY MAY MẮN", centerX, 56);
    ctx.fillStyle = wheelTheme.sub; ctx.font = "bold 17px sans-serif"; ctx.fillText(`GIVEAWAY • LƯỢT ${round}`, centerX, 84);

    ctx.save(); ctx.translate(centerX, centerY); ctx.rotate(rotation);
    for (let i = 0; i < slotCount; i++) {
      const palette = wheelTheme.wheel;
      ctx.beginPath(); ctx.moveTo(0, 0); ctx.arc(0, 0, radius, i * step, (i + 1) * step); ctx.closePath();
      ctx.fillStyle = palette[i % palette.length]; ctx.fill();
      ctx.strokeStyle = "rgba(255,255,255,.42)"; ctx.lineWidth = 2; ctx.stroke();
    }
    ctx.restore();

    // Viền ngoài và các bóng đèn vàng tạo cảm giác vòng quay thật.
    ctx.shadowColor = "#ff9c2f"; ctx.shadowBlur = 18; ctx.beginPath(); ctx.arc(centerX, centerY, radius + 7, 0, Math.PI * 2);
    ctx.strokeStyle = "#ff6b19"; ctx.lineWidth = 15; ctx.stroke(); ctx.shadowBlur = 0;
    for (let light = 0; light < 32; light++) {
      const angle = (light / 32) * Math.PI * 2;
      const lx = centerX + Math.cos(angle) * (radius + 7), ly = centerY + Math.sin(angle) * (radius + 7);
      ctx.beginPath(); ctx.arc(lx, ly, 4.5, 0, Math.PI * 2); ctx.fillStyle = light % 2 === frame % 2 ? "#fff7a8" : "#ffb51f"; ctx.fill();
    }

    // Tên nằm dọc theo từng múi giống vòng quay may mắn thật.
    wheelSlots.forEach((participant, index) => {
      const angle = rotation + (index + 0.5) * step;
      const x = centerX + Math.cos(angle) * 205;
      const y = centerY + Math.sin(angle) * 205;
      const rawName = String(participant.name || participant.uid);
      const shortName = rawName.length > 14 ? `${rawName.slice(0, 13)}…` : rawName;
      ctx.save(); ctx.translate(x, y); ctx.rotate(angle);
      ctx.textAlign = "center"; ctx.fillStyle = "#ffffff"; ctx.font = "bold 17px sans-serif";
      ctx.shadowColor = "rgba(0,0,0,.8)"; ctx.shadowBlur = 3;
      ctx.fillText(shortName, 0, -2);
      ctx.fillStyle = "#fff2b1"; ctx.font = "bold 14px sans-serif"; ctx.fillText(`#${participant.number}`, 0, 17);
      ctx.restore();
    });
    ctx.shadowBlur = 0; ctx.beginPath(); ctx.arc(centerX, centerY, 68, 0, Math.PI * 2); ctx.fillStyle = "#182654"; ctx.fill();
    ctx.strokeStyle = "#ffffff"; ctx.lineWidth = 8; ctx.stroke();
    ctx.fillStyle = "#ffffff"; ctx.font = "bold 24px sans-serif"; ctx.fillText("QUAY", centerX, centerY + 8);

    // Mũi tên lớn nằm sát vành; khung cuối trỏ đúng tâm ô người thắng.
    ctx.shadowColor = "#ffdc65"; ctx.shadowBlur = 16;
    ctx.beginPath(); ctx.moveTo(centerX, 104); ctx.lineTo(centerX - 26, 151); ctx.lineTo(centerX + 26, 151); ctx.closePath();
    ctx.fillStyle = "#fff3ac"; ctx.fill(); ctx.strokeStyle = "#ff8a1f"; ctx.lineWidth = 5; ctx.stroke(); ctx.shadowBlur = 0;
    ctx.fillStyle = finalFrame ? "#69f0ae" : "#d7dcec"; ctx.font = "bold 22px sans-serif";
    ctx.fillText(finalFrame ? "ĐÃ DỪNG" : "ĐANG QUAY...", centerX, 770);
    encoder.addFrame(ctx);
  }
  encoder.finish(); await finished;
  return outputPath;
}

function winnerCaption(winner, round, totalRounds, reward = null) {
  const tag = `@${winner.name}`;
  const msg = reward == null
    ? `🧪 TEST VÒNG QUAY\n🏆 ${tag} (số ${winner.number}) đã trúng thử!`
    : `🎉 LƯỢT ${round}/${totalRounds}\n🏆 ${tag} (số ${winner.number}) trúng ${formatCurrency(reward)} VNĐ!`;
  return { msg, mentions: [{ uid: winner.uid, pos: msg.indexOf(tag), len: tag.length }] };
}

async function getTestParticipants(api, threadId) {
  const info = await api.getInfoOneGroup(threadId);
  const data = info?.gridInfoMap?.[threadId] || info;
  const rawMembers = data?.memVerList || data?.members || data?.currentMems || [];
  const ids = [...new Set(rawMembers.map((item) => String(item?.id || item?.uid || item).replace(/_0$/u, "")))]
    .filter((id) => id && id !== String(api.getBotId()));
  let profiles = {};
  for (let index = 0; index < ids.length; index += 500) {
    const result = await api.getInfoMembers(ids.slice(index, index + 500)).catch(() => null);
    Object.assign(profiles, result?.profiles || {});
  }
  return ids.map((uid, index) => {
    const profile = profiles[uid] || profiles[`${uid}_0`] || Object.values(profiles).find((item) => String(item?.id || item?.uid) === uid);
    return {
      uid,
      number: index + 1,
      name: profile?.zaloName || profile?.displayName || profile?.name || `UID ${uid}`,
    };
  });
}

async function payWinner(api, state, winner) {
  const group = state.groups.find(group => String(group.threadId) === String(winner.threadId)) || state.groups[0];
  await runWithGameServer(group.botId, async () => {
    const account = await ensurePlayerAccount(winner.uid, winner.name, group.botId);
    if (!account?.playerId) throw new Error("Không tìm thấy hồ sơ người thắng Giveaway");
    const result = await updatePlayerBalance(account.playerId, state.reward, true, state.reward);
    if (!result?.success) throw new Error(result?.message || "Không thể trả thưởng Giveaway");
  });
}

async function runDraw(api, state) {
  if (drawing || state.status !== "drawing") return;
  drawing = true;
  try {
    // Nếu tiến trình dừng sau lúc công bố nhưng trước lúc cộng tiền, hoàn tất
    // khoản còn thiếu trước khi quay lượt kế tiếp.
    for (const winner of state.winners) {
      if (!(state.paidUids || []).includes(winner.uid)) {
        await payWinner(api, state, winner);
        state.paidUids ??= []; state.paidUids.push(winner.uid); saveState(state);
      }
    }
    await setGroupsLocked(api, state, true);
    await broadcast(api, state, "🔒 Đã đủ người. Bot tạm khóa chat để bắt đầu quay Giveaway!");
    while (state.winners.length < state.winnerCount) {
      const persisted = loadState();
      if (!persisted || persisted.id !== state.id || persisted.status === "cancelled") {
        state.status = "cancelled";
        break;
      }
      const remaining = state.participants.filter((item) => !state.winners.some((winner) => winner.uid === item.uid));
      if (!remaining.length) break;
      const winner = remaining[Math.floor(Math.random() * remaining.length)];
      state.winners.push(winner); saveState(state);
      const gifPath = await createWheelGif(remaining, winner, state.winners.length);
      try {
        await broadcast(api, state, `🎡 ĐANG QUAY LƯỢT ${state.winners.length}/${state.winnerCount}...`, [gifPath]);
        await sleep(WHEEL_DURATION);
        const caption = winnerCaption(winner, state.winners.length, state.winnerCount, state.reward);
        await broadcast(api, state, caption.msg, [], caption.mentions);
      } finally { fs.promises.unlink(gifPath).catch(() => {}); }
      await payWinner(api, state, winner);
      state.paidUids ??= []; state.paidUids.push(winner.uid);
      const latestState = loadState();
      if (latestState?.id === state.id && latestState.status === "cancelled") state.status = "cancelled";
      saveState(state);
      if (state.status !== "cancelled" && state.winners.length < state.winnerCount) await sleep(DRAW_DELAY);
    }
    if (state.status !== "cancelled") {
      state.status = "completed"; state.completedAt = Date.now(); saveState(state);
      await broadcast(api, state, `✅ Giveaway đã kết thúc: ${state.winners.length} người thắng, mỗi người ${formatCurrency(state.reward)} VNĐ.`);
    }
  } catch (error) {
    console.error("[GIVEAWAY] Lỗi quay thưởng:", error);
    const latest = loadState();
    if (latest?.id === state.id) {
      latest.lastError = String(error?.message || error); saveState(latest);
    }
  } finally {
    await setGroupsLocked(api, state, false);
    drawing = false;
  }
}

export async function resumeGiveaway(api) {
  const state = loadState();
  if (!state) return;
  // Recovery must use the bot owning the group, never the main bot fallback.
  const ownerApi = apiManager.apiManagerObject[state.creatorBotId]?.apiZalo;
  if (!ownerApi) return;
  api = ownerApi;
  if (state.status === "drawing") {
    void runDraw(api, state);
  } else if (state.status === "waiting" && state.drawAt) {
    scheduleDraw(api, state);
  } else if (["completed", "cancelled"].includes(state.status) && state.groups?.some((group) => group.previousLock != null)) {
    await setGroupsLocked(api, state, false);
  }
}

function startDrawWhenDue(api, stateId) {
  const latest = loadState();
  if (!latest || latest.id !== stateId || latest.status !== "waiting") return;

  const remaining = Number(latest.drawAt) - Date.now();
  if (remaining > 0) {
    scheduleDraw(api, latest);
    return;
  }

  latest.status = "drawing";
  latest.drawingStartedAt = Date.now();
  saveState(latest);
  drawTimer = null;
  scheduledGiveawayId = null;
  void runDraw(api, latest);
}

function scheduleDraw(api, state) {
  if (drawTimer && scheduledGiveawayId === state.id) clearTimeout(drawTimer);
  const remaining = Math.max(0, Number(state.drawAt) - Date.now());
  const delay = remaining > 0 ? Math.min(remaining, SCHEDULE_RECHECK_MS) : 0;
  scheduledGiveawayId = state.id;
  drawTimer = setTimeout(() => startDrawWhenDue(api, state.id), delay);
}

export async function handleGiveawayCommand(api, message) {
  const prefix = getGlobalPrefix(api.getBotId());
  const content = removeMention(message).trim();
  const parts = content.replace(new RegExp(`^${String(prefix).replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?:game\\s+)?giveaway\\s*`, "iu"), "").trim().split(/\s+/u).filter(Boolean);
  let state = loadState();

  if (["test", "thu", "thử"].includes((parts[0] || "").toLowerCase())) {
    if (!isMainBotAccount(api, message.data.uidFrom)) return;
    if (message.type !== MessageType.GroupMessage) return true;
    const participants = await getTestParticipants(api, message.threadId);
    if (participants.length < 2) {
      await api.sendMessage({ msg: "❌ Nhóm cần ít nhất 2 thành viên để test vòng quay.", quote: message }, message.threadId, message.type); return true;
    }
    const winner = participants[Math.floor(Math.random() * participants.length)];
    const gifPath = await createWheelGif(participants, winner, 1);
    try {
      await api.sendMessage(
        { msg: "🎡 ĐANG QUAY THỬ...", attachments: [gifPath], ttl: 600_000, isUseProphylactic: true },
        message.threadId,
        MessageType.GroupMessage
      );
      await sleep(WHEEL_DURATION);
      const caption = winnerCaption(winner, 1, 1);
      await api.sendMessage(
        { msg: caption.msg, mentions: caption.mentions, ttl: 600_000 },
        message.threadId,
        MessageType.GroupMessage
      );
    } finally { fs.promises.unlink(gifPath).catch(() => {}); }
    return true;
  }

  if (["start", "batdau", "bắtđầu", "quay"].includes((parts[0] || "").toLowerCase())) {
    if (!isMainBotAccount(api, message.data.uidFrom)) return;
    if (!state || !["waiting", "drawing"].includes(state.status)) {
      await api.sendMessage({ msg: "❌ Không có Giveaway nào đang chờ để bắt đầu.", quote: message }, message.threadId, message.type); return true;
    }
    const group = state.groups?.find((item) =>
      String(item.threadId) === String(message.threadId) && String(item.botId) === String(api.getBotId())
    );
    if (message.type !== MessageType.GroupMessage || !group) return true;
    if (drawing) {
      await api.sendMessage({ msg: "🎡 Giveaway đang quay thưởng.", quote: message }, message.threadId, message.type);
      return true;
    }
    state.status = "drawing";
    state.drawingStartedAt = Date.now();
    state.startedManuallyBy = String(message.data.uidFrom);
    saveState(state);
    if (drawTimer && scheduledGiveawayId === state.id) clearTimeout(drawTimer);
    drawTimer = null;
    scheduledGiveawayId = null;
    void runDraw(api, state);
    return true;
  }

  if (["huy", "hủy", "cancel"].includes((parts[0] || "").toLowerCase())) {
    if (!isMainBotAccount(api, message.data.uidFrom)) return;
    if (!state || !["waiting", "drawing"].includes(state.status)) {
      await api.sendMessage({ msg: "❌ Không có Giveaway nào đang hoạt động để hủy.", quote: message }, message.threadId, message.type); return true;
    }
    if (!state.groups?.some((group) => String(group.threadId) === String(message.threadId))) return true;
    if (drawTimer) clearTimeout(drawTimer);
    drawTimer = null; scheduledGiveawayId = null;
    state.status = "cancelled"; state.cancelledAt = Date.now(); state.cancelledBy = String(message.data.uidFrom); saveState(state);
    await setGroupsLocked(api, state, false);
    await broadcast(api, state, `🛑 Giveaway đã được Bot Leader hủy.${state.winners.length ? `\n${state.winners.length} người đã trúng trước đó vẫn được giữ tiền thưởng.` : ""}`);
    return true;
  }

  if (["tao", "tạo", "create"].includes((parts[0] || "").toLowerCase())) {
    if (!isMainBotAccount(api, message.data.uidFrom)) return;
    if (message.type !== MessageType.GroupMessage) {
      await api.sendMessage({ msg: "❌ Hãy tạo Giveaway trực tiếp trong nhóm muốn tổ chức.", quote: message }, message.threadId, message.type); return true;
    }
    const currentSettings = groupSettingsAll.getByID(api.getBotId())?.[message.threadId];
    if (currentSettings?.activeGame !== true) {
      await api.sendMessage({ msg: `❌ Nhóm này chưa bật gameactive.`, quote: message }, message.threadId, message.type); return true;
    }
    if (state && ["waiting", "drawing"].includes(state.status)) {
      await api.sendMessage({ msg: "❌ Đang có một Giveaway chưa kết thúc.", quote: message }, message.threadId, message.type); return true;
    }
    const reward = parseGameAmount(parts[1], Number.MAX_SAFE_INTEGER);
    const match = String(parts[2] || "").match(/^(\d+)\/(\d+)$/u);
    const durationMs = parseDuration(parts[3]);
    if (!(reward instanceof Big) || reward.lte(0) || !match || !durationMs) {
      await api.sendMessage({ msg: `Cú pháp: ${prefix}giveaway tạo 10b 3/10 30p`, quote: message }, message.threadId, message.type); return true;
    }
    const winnerCount = Number(match[1]), capacity = Number(match[2]);
    if (winnerCount < 1 || capacity < 2 || winnerCount > capacity || capacity > 200) {
      await api.sendMessage({ msg: "❌ Số người thắng/người tham gia không hợp lệ (tối đa 200 người).", quote: message }, message.threadId, message.type); return true;
    }
    const groups = [{
      threadId: String(message.threadId),
      botId: String(api.getBotId()),
      name: currentSettings.nameGroup || String(message.threadId),
    }];
    state = { id: Date.now(), creatorBotId: String(api.getBotId()), reward: reward.round(0).toString(), winnerCount, capacity, durationMs, drawAt: Date.now() + durationMs, participants: [], winners: [], paidUids: [], groups, status: "waiting", createdAt: Date.now() };
    saveState(state);
    await broadcast(api, state, `🎁 GIVEAWAY NHÓM ${groups[0].name}\n💰 ${winnerCount} người thắng, mỗi người ${formatCurrency(state.reward)} VNĐ\n👥 Tối đa ${capacity} người tham gia\n🕒 Bắt đầu quay lúc ${formatDrawTime(state.drawAt)}\n\nGõ "tham gia" hoặc thả ❤️ vào tin nhắn này.`);
    scheduleDraw(api, state);
    return true;
  }

  if (!state || ["completed", "cancelled"].includes(state.status)) {
    await api.sendMessage({ msg: "Hiện không có Giveaway đang mở.", quote: message }, message.threadId, message.type); return true;
  }
  if (message.type !== MessageType.GroupMessage || !state.groups?.some((group) =>
    String(group.threadId) === String(message.threadId) && String(group.botId) === String(api.getBotId())
  )) return true;
  if (state.status !== "waiting") {
    if (state.status === "drawing" && api.apiManager?.isMainBot && isBotLeader(api.getBotId(), message.data.uidFrom)) {
      void runDraw(api, state);
    }
    await api.sendMessage({ msg: "🎡 Giveaway đang quay thưởng, không thể tham gia thêm.", quote: message }, message.threadId, message.type); return true;
  }
  if (!groupSettingsAll.getByID(api.getBotId())?.[message.threadId]?.activeGame) return true;
  const uid = String(message.data.uidFrom);
  const existing = state.participants.find((item) => item.uid === uid);
  if (existing) {
    await api.sendMessage({ msg: `Bạn đã tham gia với số ${existing.number}.`, quote: message }, message.threadId, message.type); return true;
  }
  if (state.participants.length >= state.capacity) {
    await api.sendMessage({ msg: "👥 Giveaway đã đủ người tham gia.", quote: message }, message.threadId, message.type); return true;
  }
  let name = message.data?.dName;
  name = await resolveUserName(api, uid, name);
  const joined = await addParticipant(api, state, uid, name, message.threadId);
  if (joined) await sendParticipantList(api, joined, message.threadId, message.type);
  // Không quay sớm khi đủ người; luôn chờ đúng thời lượng đã đặt.
  return true;
}

async function addParticipant(api, state, uid, name, threadId) {
  await ensurePlayerAccount(uid, name, api.getBotId());
  // Đọc lại sau await để không ghi đè lượt tham gia khác hoặc hồi sinh ván đã hủy/quay.
  const latest = loadState();
  if (latest?.id !== state.id || latest.status !== "waiting") return null;
  if (latest.drawAt && Date.now() >= Number(latest.drawAt)) return null;
  if (latest.participants.some((item) => String(item.uid) === uid) || latest.participants.length >= latest.capacity) return null;
  latest.participants.push({ uid, name, number: latest.participants.length + 1, threadId: String(threadId) });
  saveState(latest);
  return latest;
}

// Thả ❤️ vào tin nhắn Giveaway cũng được tính là tham gia.
export async function handleGiveawayReaction(api, reaction) {
  const content = reaction.data?.content;
  const rMsg = content?.rMsg?.[0];
  const msgIds = [rMsg?.gMsgID, rMsg?.cMsgID].filter(Boolean).map(String);
  const reactionType = content?.rType;
  const icon = String(content?.rIcon || "").replace(/\uFE0F/gu, "");

  const isHeart = Number(reactionType) === 5 ||
    ((reactionType == null || Number(reactionType) === 200) && ["/-heart", "❤", "❤️", "💖", "💗", "💓"].includes(icon));
  if (!isHeart || reaction.isSelf || reaction.isGroup === false) return false;

  const state = loadState();
  if (!state || state.status !== "waiting") return false;

  if (joinReactionMap.size === 0) {
    syncJoinReactionMap(state);
  }

  // 1. Tìm thông tin nhóm từ tin nhắn được thả tim qua joinReactionMap (chuẩn như Xì Dách)
  const matchedId = msgIds.find((id) => joinReactionMap.has(id));
  let meta = matchedId && joinReactionMap.get(matchedId);

  // 2. Dự phòng: tìm trong state.groups[].joinMessages
  if (!meta && msgIds.length > 0) {
    for (const g of state.groups || []) {
      const match = msgIds.some((id) =>
        g.joinMessages?.some((m) => String(m.msgId) === id || String(m.cliMsgId) === id)
      );
      if (match) {
        meta = { giveawayId: state.id, threadId: String(g.threadId), botId: String(g.botId) };
        break;
      }
    }
  }

  // 3. Dự phòng 3: nếu reaction chứa ID nhóm trực tiếp
  if (!meta) {
    const rawThreadId = String(reaction.data?.idTo || reaction.data?.grid || reaction.threadId || "");
    const g = state.groups?.find((item) => String(item.threadId) === rawThreadId);
    const hasTracked = joinReactionMap.size > 0 || state.groups?.some((item) => item.joinMessages?.length > 0);
    if (g && !hasTracked && msgIds.length > 0) {
      meta = { giveawayId: state.id, threadId: String(g.threadId), botId: String(g.botId) };
    }
  }

  if (!meta) return false;

  // Kiểm tra idTo: nếu idTo là một ID nhóm khác với nhóm của bàn thì bỏ qua
  const reactionGroupId = String(reaction.data?.idTo || reaction.data?.grid || "");
  if (reactionGroupId && reactionGroupId !== "0" && reactionGroupId !== String(api.getBotId()) && reactionGroupId !== meta.threadId) {
    return false;
  }

  // Đúng bot phụ trách nhóm mới xử lý (như Xì Dách)
  if (String(meta.botId) !== String(api.getBotId())) return false;

  const threadId = meta.threadId;
  if (!groupSettingsAll.getByID(api.getBotId())?.[threadId]?.activeGame) return false;

  const uid = String(reaction.data?.uidFrom || "");
  if (!uid || uid === "0" || uid === String(api.getBotId())) return false;

  if (state.participants.some((item) => String(item.uid) === uid) || state.participants.length >= state.capacity) return true;

  let name = reaction.data?.dName;
  name = await resolveUserName(api, uid, name);
  const joined = await addParticipant(api, state, uid, name, threadId);
  if (joined) await sendParticipantList(api, joined, threadId, MessageType.GroupMessage);
  return true;
}
