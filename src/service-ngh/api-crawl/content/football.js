import axios from "axios";
import * as cv from "../../../utils/canvas/index.js";
import { removeMention } from "../../../utils/format-util.js";
import { getGlobalPrefix } from "../../service.js";
import { sendMessageFailed } from "../../chat-zalo/chat-style/chat-style.js";

const LEAGUES = ["eng.1", "esp.1", "ita.1", "ger.1", "fra.1", "uefa.champions", "usa.1"];
const cache = new Map();
const watchers = new Map();

function dateValue(value) {
  const now = new Date();
  const input = String(value || "today").toLowerCase();
  if (input === "tomorrow") now.setDate(now.getDate() + 1);
  else if (/^\d{4}-\d{2}-\d{2}$/.test(input)) return input.replaceAll("-", "");
  return `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, "0")}${String(now.getDate()).padStart(2, "0")}`;
}

function formatDate(dateKey) {
  return `${dateKey.slice(6, 8)}/${dateKey.slice(4, 6)}/${dateKey.slice(0, 4)}`;
}

async function fetchFixtures(dateKey) {
  const cached = cache.get(dateKey);
  if (cached && Date.now() - cached.at < 60_000) return cached.events;
  const responses = await Promise.allSettled(LEAGUES.map((league) => axios.get(
    `https://site.api.espn.com/apis/site/v2/sports/soccer/${league}/scoreboard`,
    { params: { dates: dateKey }, timeout: 12000 }
  )));
  const events = [];
  responses.forEach((result, index) => {
    if (result.status !== "fulfilled") return;
    for (const event of result.value.data?.events || []) {
      const competition = event.competitions?.[0];
      const competitors = competition?.competitors || [];
      const home = competitors.find((item) => item.homeAway === "home")?.team?.displayName;
      const away = competitors.find((item) => item.homeAway === "away")?.team?.displayName;
      if (!home || !away) continue;
      const status = event.status?.type?.shortDetail || event.status?.type?.description || "TBD";
      const kickoff = event.date ? new Date(event.date).toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit", timeZone: "Asia/Ho_Chi_Minh" }) : "TBD";
      const score = competitors.map((item) => item.score || "0").join("-");
      const details = (competition.details || []).map((detail) => detail.type?.text || detail.text || detail.description || "").filter(Boolean);
      events.push({ id: event.id, league: LEAGUES[index].toUpperCase(), home, away, score, details, status: status === "Scheduled" ? kickoff : status, time: kickoff });
    }
  });
  const unique = [...new Map(events.map((item) => [item.id, item])).values()];
  unique.sort((a, b) => String(a.time).localeCompare(String(b.time)));
  cache.set(dateKey, { at: Date.now(), events: unique });
  return unique;
}

function watchKey(api, threadId, eventId) { return `${api.getBotId()}:${threadId}:${eventId}`; }

async function pollWatcher(watcher) {
  const events = await fetchFixtures(watcher.dateKey);
  const current = events.find((event) => String(event.id) === String(watcher.eventId));
  if (!current) {
    clearInterval(watcher.timer);
    watchers.delete(watchKey(watcher.api, watcher.threadId, watcher.eventId));
    return;
  }
  const signature = JSON.stringify([current.score, current.status, current.details]);
  if (signature === watcher.signature) return;
  watcher.signature = signature;
  const details = current.details?.length ? `\n${current.details.map((item) => `• ${item}`).join("\n")}` : "";
  const mentionName = `@${watcher.requesterName}`;
  const msg = `${mentionName}\n⚽ ${current.home} ${current.score} ${current.away}\n⏱️ ${current.status}${details}`;
  await watcher.api.sendMessage({ msg, mentions: [{ uid: watcher.requesterId, pos: 0, len: mentionName.length }], ttl: 120000 }, watcher.threadId, watcher.type);
  if (/\b(?:ft|final|full\s*time|ended|postponed|cancelled|finished)\b/iu.test(current.status)) {
    clearInterval(watcher.timer);
    watchers.delete(watchKey(watcher.api, watcher.threadId, watcher.eventId));
  }
}

async function startWatcher(api, message, query) {
  const dateKey = dateValue("today");
  const events = await fetchFixtures(dateKey);
  const normalized = String(query || "").toLowerCase();
  const event = events.find((item) => String(item.id) === normalized || item.home.toLowerCase().includes(normalized) || item.away.toLowerCase().includes(normalized));
  if (!event) return false;
  const key = watchKey(api, message.threadId, event.id);
  const old = watchers.get(key);
  if (old) clearInterval(old.timer);
  const requesterName = String(message.data?.dName || message.data?.uidFrom || "Bạn").replace(/^@+/u, "");
  const watcher = { api, threadId: message.threadId, type: message.type, eventId: event.id, dateKey, requesterId: String(message.data?.uidFrom), requesterName, signature: JSON.stringify([event.score, event.status, event.details]) };
  watcher.timer = setInterval(() => pollWatcher(watcher).catch((error) => console.error("[football watch]", error?.message || error)), 60000);
  watchers.set(key, watcher);
  const notice = `@${requesterName}\n✅ Đã theo dõi: ${event.home} vs ${event.away}\nBot sẽ báo khi có bàn, thẻ hoặc thay đổi phút/trạng thái.`;
  await api.sendMessage({ msg: notice, mentions: [{ uid: String(message.data?.uidFrom), pos: 0, len: requesterName.length + 1 }], ttl: 60000 }, message.threadId, message.type);
  return true;
}

export async function handleFootballCommand(api, message, aliasCommand) {
  const prefix = getGlobalPrefix(api.getBotId());
  const value = removeMention(message).replace(new RegExp(`^${prefix}${aliasCommand}`, "i"), "").trim() || "today";
  const [action, ...rest] = value.split(/\s+/u);
  if (/^(watch|track)$/iu.test(action)) {
    const ok = await startWatcher(api, message, rest.join(" "));
    if (!ok) await sendMessageFailed(api, message, "Không tìm thấy trận. Dùng !football để xem lịch rồi theo dõi bằng tên một đội.");
    return;
  }
  if (/^(unwatch|stop)$/iu.test(action)) {
    let count = 0;
    for (const [key, watcher] of watchers) if (watcher.api.getBotId() === api.getBotId() && watcher.threadId === message.threadId) { clearInterval(watcher.timer); watchers.delete(key); count++; }
    const requesterName = String(message.data?.dName || message.data?.uidFrom || "Bạn").replace(/^@+/u, "");
    const notice = `@${requesterName}\n${count ? "✅ Đã dừng theo dõi trận." : "ℹ️ Nhóm này chưa theo dõi trận nào."}`;
    await api.sendMessage({ msg: notice, mentions: [{ uid: String(message.data?.uidFrom), pos: 0, len: requesterName.length + 1 }] }, message.threadId, message.type);
    return;
  }
  const dateKey = dateValue(value);
  try {
    const events = await fetchFixtures(dateKey);
    const imagePath = await cv.createFootballScheduleImage({ dateLabel: formatDate(dateKey), events });
    try {
      await api.sendMessage({ msg: `⚽ Football fixtures • ${formatDate(dateKey)}`, attachments: [imagePath], ttl: 300000, isUseProphylactic: true }, message.threadId, message.type);
    } finally {
      await cv.clearImagePath(imagePath);
    }
  } catch (error) {
    console.error("[football] Không lấy được lịch bóng đá:", error?.message || error);
    await sendMessageFailed(api, message, "Không lấy được lịch bóng đá lúc này, thử lại sau nhé.");
  }
}
