import { getPlayerBalance, updatePlayerBalanceByUsername, getUsernameByIdZalo } from "../../../database/player.js";
import { sendMessageFromSQL, sendMessageFromSQLImage } from "../../chat-zalo/chat-style/chat-style.js";
import { getGlobalPrefix } from "../../service.js";
import { Canvas, Path2D, loadImage } from "skia-canvas";
import fs from "fs/promises";
import path from "path";
import { parseGameAmount, formatCurrency } from "../../../utils/format-util.js";
import { checkBeforeJoinGame } from "../index.js";
import { connection } from "../../../database/state.js";
import { getApiManager } from "../../../index.js";
import { sendReactionWaitingCountdown } from "../../../commands/manager-command/check-countdown.js";
import Big from "big.js";

const GAME_DURATION = 30000;
const WARNING_TIME = 10000;
const BACCARAT_PAYOUT_FEE = new Big("0.95");
const MAX_HISTORY = 90;
const HOUSE_BIAS_CHANCE = 0.45;

// Baccarat dùng một phiên chung cho toàn server (mọi group cùng tham gia).
const GLOBAL_GAME_KEY = "__global__";
const activeGames = { [GLOBAL_GAME_KEY]: null };
const recentResults = new Map();

function historyKey(api, threadId) {
  return `${api.getBotId()}_global`;
}

async function addRecentResult(api, threadId, door) {
  const key = historyKey(api, threadId);
  const history = recentResults.get(key) || [];
  history.push({ door, at: Date.now() });
  if (history.length > MAX_HISTORY) history.splice(0, history.length - MAX_HISTORY);
  recentResults.set(key, history);
  if (!connection) return;
  const collection = connection.collection("baccarat_history");
  await collection.insertOne({ key, botId: String(api.getBotId()), threadId: String(threadId), door, createdAt: new Date() });
  const stale = await collection.find({ key }, { projection: { _id: 1 } }).sort({ createdAt: -1 }).skip(MAX_HISTORY).toArray();
  if (stale.length) await collection.deleteMany({ _id: { $in: stale.map((item) => item._id) } });
}

async function getRecentResults(api, threadId) {
  const key = historyKey(api, threadId);
  if (connection) {
    const rows = await connection.collection("baccarat_history").find({ key }).sort({ createdAt: -1 }).limit(MAX_HISTORY).toArray();
    if (rows.length) {
      const history = rows.reverse().map((item) => ({ door: item.door, at: new Date(item.createdAt).getTime() }));
      recentResults.set(key, history);
      return history;
    }
  }
  return recentResults.get(key) || [];
}

function getSoiCauStats(history) {
  if (!history.length) return null;

  const name = { con: "CON", "cái": "CÁI", "hòa": "HÒA" };
  const counts = history.reduce((result, item) => {
    result[item.door] += 1;
    return result;
  }, { con: 0, "cái": 0, "hòa": 0 });
  const latest = history[history.length - 1].door;
  let streak = 0;
  for (let index = history.length - 1; index >= 0 && history[index].door === latest; index--) streak += 1;
  const percent = (value) => `${((value / history.length) * 100).toFixed(1).replace(".0", "")}%`;
  return { counts, latest, streak, name, percent };
}

export async function createSoiCauCanvas(history, groupName = "Nhóm Baccarat") {
  const width = 1026, height = 594;
  const canvas = new Canvas(width, height);
  const ctx = canvas.getContext("2d");
  const background = ctx.createLinearGradient(0, 0, width, height);
  background.addColorStop(0, "#1b2224"); background.addColorStop(1, "#05090a");
  ctx.fillStyle = background; ctx.fillRect(0, 0, width, height);

  const panel = (x, y, w, h, radius = 22) => {
    const gradient = ctx.createLinearGradient(x, y, x + w, y + h);
    gradient.addColorStop(0, "#111719"); gradient.addColorStop(1, "#050809");
    ctx.beginPath(); ctx.roundRect(x, y, w, h, radius); ctx.fillStyle = gradient; ctx.fill();
    ctx.strokeStyle = "#354044"; ctx.lineWidth = 1.4; ctx.stroke();
  };
  const fitText = (text, maxWidth, startSize) => {
    let size = startSize;
    do { ctx.font = `bold ${size}px sans-serif`; size -= 1; } while (ctx.measureText(text).width > maxWidth && size > 15);
  };
  const colors = { con: "#278dff", "cái": "#ff4963", "hòa": "#43d5aa" };
  const stats = getSoiCauStats(history);

  panel(26, 26, 974, 100, 22);
  ctx.textAlign = "left"; ctx.fillStyle = "#f6f3ed"; ctx.font = "bold 37px sans-serif";
  ctx.fillText("SOI CẦU BACCARAT", 52, 82);
  const safeGroupName = String(groupName || "Nhóm Baccarat").trim();
  fitText(`⚜  ${safeGroupName}  ⚜  · ${history.length} v`, 700, 20);
  ctx.fillStyle = "#aaa9a7"; ctx.fillText(`⚜  ${safeGroupName}  ⚜  · ${history.length} v`, 53, 108);

  panel(811, 42, 169, 69, 14);
  const latest = stats?.latest || null;
  const latestColor = latest ? colors[latest] : "#697276";
  ctx.shadowColor = latestColor; ctx.shadowBlur = 14; ctx.beginPath(); ctx.arc(843, 76, 14, 0, Math.PI * 2);
  ctx.strokeStyle = latestColor; ctx.lineWidth = 5; ctx.stroke(); ctx.shadowBlur = 0;
  ctx.textAlign = "left"; ctx.fillStyle = "#9e9899"; ctx.font = "bold 13px sans-serif"; ctx.fillText("ĐANG RA", 869, 70);
  ctx.fillStyle = latestColor; ctx.font = "bold 22px sans-serif";
  ctx.fillText(latest ? `${stats.name[latest][0]}${stats.name[latest].slice(1).toLowerCase()} · bệt ${stats.streak}` : "Chưa có", 869, 96);

  panel(26, 142, 974, 350, 22);
  const roadX = 70, roadY = 187, gapX = 52, gapY = 52, roadCols = 18, roadRows = 6;
  for (let colIndex = 0; colIndex < roadCols; colIndex++) {
    for (let rowIndex = 0; rowIndex < roadRows; rowIndex++) {
      ctx.beginPath(); ctx.arc(roadX + colIndex * gapX, roadY + rowIndex * gapY, 14, 0, Math.PI * 2);
      ctx.fillStyle = "rgba(55,62,65,.19)"; ctx.fill();
    }
  }

  if (!history.length) {
    ctx.textAlign = "center"; ctx.fillStyle = "#777f82"; ctx.font = "bold 24px sans-serif";
    ctx.fillText("Chưa có kết quả Baccarat trong nhóm này", width / 2, 330);
  } else {
    const placements = []; let col = -1, row = 0, lastDoor = null, lastPlacement = null, pendingTies = 0;
    for (const item of history) {
      if (item.door === "hòa") {
        if (lastPlacement) lastPlacement.ties = (lastPlacement.ties || 0) + 1;
        else pendingTies += 1;
        continue;
      }
      if (item.door !== lastDoor) { col += 1; row = 0; lastDoor = item.door; }
      else if (row < roadRows - 1) row += 1;
      else col += 1;
      lastPlacement = { col, row, door: item.door, ties: pendingTies };
      pendingTies = 0;
      placements.push(lastPlacement);
    }
    const visibleOffset = Math.max(0, Math.max(0, ...placements.map((item) => item.col)) - roadCols + 1);
    placements.forEach((item) => {
      const visibleCol = item.col - visibleOffset;
      if (visibleCol < 0 || visibleCol >= roadCols) return;
      const x = roadX + visibleCol * gapX, y = roadY + item.row * gapY;
      ctx.shadowColor = colors[item.door]; ctx.shadowBlur = 10;
      ctx.beginPath(); ctx.arc(x, y, 17, 0, Math.PI * 2); ctx.strokeStyle = colors[item.door]; ctx.lineWidth = 5; ctx.stroke();
      ctx.shadowBlur = 0;
      if (item.ties) {
        ctx.save();
        ctx.beginPath(); ctx.arc(x, y, 14, 0, Math.PI * 2); ctx.clip();
        ctx.strokeStyle = colors["hòa"]; ctx.lineWidth = 4;
        ctx.beginPath(); ctx.moveTo(x - 12, y + 12); ctx.lineTo(x + 12, y - 12); ctx.stroke();
        ctx.restore();
        if (item.ties > 1) {
          ctx.textAlign = "center"; ctx.fillStyle = "#f2f4f3"; ctx.font = "bold 13px sans-serif";
          ctx.fillText(String(item.ties), x, y + 5);
        }
      }
    });
  }

  panel(26, 508, 974, 60, 17);
  const summary = [
    { x: 304, door: "con", label: "Con" },
    { x: 474, door: "cái", label: "Cái" },
    { x: 634, door: "hòa", label: "Hòa" },
  ];
  summary.forEach(({ x, door, label }) => {
    ctx.beginPath(); ctx.arc(x, 538, 11, 0, Math.PI * 2); ctx.strokeStyle = colors[door]; ctx.lineWidth = 4; ctx.stroke();
    if (door === "hòa") { ctx.beginPath(); ctx.moveTo(x - 7, 545); ctx.lineTo(x + 7, 531); ctx.stroke(); }
    ctx.textAlign = "left"; ctx.fillStyle = "#eeeae5"; ctx.font = "bold 22px sans-serif"; ctx.fillText(label, x + 23, 546);
    ctx.fillStyle = colors[door]; ctx.fillText(String(stats?.counts?.[door] || 0), x + 80, 546);
  });
  const imagePath = path.resolve(`./assets/temp/baccarat_soicau_${Date.now()}.png`);
  await fs.writeFile(imagePath, await canvas.toBuffer("image/png"));
  return imagePath;
}

function getCardValue(rank) {
  if (['10', 'J', 'Q', 'K'].includes(rank)) return 0;
  if (rank === 'A') return 1;
  return parseInt(rank);
}

function getRandomCard() {
  const suits = ['♠', '♣', '♥', '♦'];
  const ranks = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];
  const suit = suits[Math.floor(Math.random() * suits.length)];
  const rank = ranks[Math.floor(Math.random() * ranks.length)];
  return { suit, rank, value: getCardValue(rank), str: `${rank}${suit}` };
}

function calculateScore(cards) {
  return cards.reduce((sum, card) => sum + card.value, 0) % 10;
}

function dealBaccaratHand() {
  const player = [getRandomCard(), getRandomCard()];
  const banker = [getRandomCard(), getRandomCard()];
  let pScore = calculateScore(player), bScore = calculateScore(banker), p3 = null;

  if (pScore < 8 && bScore < 8) {
    let playerDrew = false;
    if (pScore <= 5) {
      p3 = getRandomCard(); player.push(p3); pScore = calculateScore(player); playerDrew = true;
    }
    if (!playerDrew) {
      if (bScore <= 5) { banker.push(getRandomCard()); bScore = calculateScore(banker); }
    } else {
      const bDraw = bScore <= 2 ||
        (bScore === 3 && p3.value !== 8) ||
        (bScore === 4 && [2, 3, 4, 5, 6, 7].includes(p3.value)) ||
        (bScore === 5 && [4, 5, 6, 7].includes(p3.value)) ||
        (bScore === 6 && [6, 7].includes(p3.value));
      if (bDraw) { banker.push(getRandomCard()); bScore = calculateScore(banker); }
    }
  }
  const resultDoor = pScore > bScore ? "con" : bScore > pScore ? "cái" : "hòa";
  return { player, banker, pScore, bScore, resultDoor };
}

function dealBaccaratForBets(players) {
  let deal = dealBaccaratHand();
  if (Math.random() >= HOUSE_BIAS_CHANCE) return deal;
  const totals = { con: new Big(0), "cái": new Big(0), "hòa": new Big(0) };
  for (const bet of Object.values(players || {})) {
    totals[bet.door] = totals[bet.door].plus(bet.amount);
  }
  const liabilities = {
    con: totals.con.times(1.95),
    "cái": totals["cái"].times(1.9),
    "hòa": totals["hòa"].times(8).plus(totals.con).plus(totals["cái"]),
  };
  const preferred = Object.keys(liabilities).sort((a, b) => liabilities[a].cmp(liabilities[b]))[0];
  for (let attempt = 0; attempt < 60 && deal.resultDoor !== preferred; attempt++) deal = dealBaccaratHand();
  return deal;
}

export async function handleBaccaratBet(api, message, groupSettings) {
  const threadId = message.threadId;
  const senderId = message.data.uidFrom;
  // Chuẩn hóa dấu để cả "cái/hòa" dạng Unicode dựng sẵn và dạng dấu tổ hợp
  // (thường do bàn phím/Zalo gửi lên) đều được nhận như nhau.
  const content = String(message.data.content || "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");

  const prefix = getGlobalPrefix(api.getBotId());
  const escapedPrefix = String(prefix).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const isSoiCau = new RegExp(`^${escapedPrefix}(?:bcr|bac|baccarat)\\s+(?:soicau|soi-cau|cau)$`, "i").test(content);
  if (isSoiCau) {
    if (!(await checkBeforeJoinGame(api, message, groupSettings, true))) return true;
    const history = await getRecentResults(api, threadId);
    const groupName = "Baccarat toàn server";
    const imagePath = await createSoiCauCanvas(history, groupName);
    try {
      await sendMessageFromSQLImage(api, message, { success: true, message: "🔎 Cầu Baccarat gần đây" }, false, imagePath);
    } finally {
      await fs.unlink(imagePath).catch(() => {});
    }
    return true;
  }
  const match = content.match(new RegExp(`^${escapedPrefix}(?:bcr|bac|baccarat)\\s+(con|cai|hoa)\\s+([\\d,.]+[kmb]?|allin|all|[\\d,.]+%)$`, "i"));
  
  if (!match) {
    // Nếu dùng lệnh sai cú pháp (!bcr) thì trả về false để hiển thị thông báo
    if ([`${prefix}bcr`, `${prefix}bac`, `${prefix}baccarat`].some((command) => content.startsWith(command))) {
       await sendMessageFromSQL(api, message, { success: false, message: `Lệnh cược không hợp lệ.\nSử dụng: ${prefix}bcr <con/cái/hòa> <số tiền>` }, true, 10000);
       return true;
    }
    return false;
  }

  if (!(await checkBeforeJoinGame(api, message, groupSettings, true))) return true;

  let betDoor = match[1];
  if (betDoor === "cai") betDoor = "cái";
  if (betDoor === "hoa") betDoor = "hòa";
  
  const amountStr = match[2];

  const username = await getUsernameByIdZalo(senderId);
  if (!username) {
    await sendMessageFromSQL(api, message, { success: false, message: "Không thể lấy hồ sơ." }, true, 10000);
    return true;
  }

  const balanceResult = await getPlayerBalance(senderId);
  if (!balanceResult.success) {
    await sendMessageFromSQL(api, message, { success: false, message: "Lỗi kiểm tra số dư." }, true, 10000);
    return true;
  }

  let betAmount;
  try {
    const parsedAmount = parseGameAmount(amountStr, balanceResult.balance);
    betAmount = parsedAmount === "allin" ? new Big(balanceResult.balance) : parsedAmount;
    if (betAmount.lt(1000)) throw new Error("Cược tối thiểu 1,000 VNĐ");
  } catch (err) {
    await sendMessageFromSQL(api, message, { success: false, message: err.message }, true, 10000);
    return true;
  }

  if (betAmount.gt(balanceResult.balance)) {
    await sendMessageFromSQL(api, message, { success: false, message: `Số dư không đủ. Bạn có ${formatCurrency(new Big(balanceResult.balance))} VNĐ` }, true, 10000);
    return true;
  }

  const playerName = message.data.dName || senderId;
  
  // Trừ tiền ngay
  await updatePlayerBalanceByUsername(username, betAmount.neg());

  const gameKey = GLOBAL_GAME_KEY;
  if (!activeGames[gameKey]) {
    // Bắt đầu game mới
    activeGames[gameKey] = {
      players: {},
      threads: new Set(),
      timeout: null,
      warningTimeout: null,
    };
    activeGames[gameKey].threads.add(threadId);
    activeGames[gameKey].threadBots = { [String(threadId)]: api.getBotId() };
    const groupName = groupSettings?.[threadId]?.nameGroup || String(threadId);
    activeGames[gameKey].players[senderId] = { door: betDoor, amount: betAmount, name: playerName, username, threadId, groupName, botId: api.getBotId() };

    const startMsg = `⚜️ ThuHoa Bot Team ⚜️\n🎴 ${playerName} vừa khởi động ván cược Baccarat trong 30s và đặt ${formatCurrency(betAmount)} vào cửa ${betDoor === 'con' ? 'Con (Player)' : betDoor === 'cái' ? 'Cái (Banker)' : 'Hòa (Tie)'}\n\n👉 Lệnh đặt cửa cược:\n- ${prefix}bcr con <tiền>: Cửa Con\n- ${prefix}bcr cái <tiền>: Cửa Cái\n- ${prefix}bcr hòa <tiền>: Cửa Hòa\n\n📊 Tỷ lệ trả thưởng:\n- Con: 1 ăn 0.95\n- Cái: 1 ăn 0.90\n- Hòa: 1 ăn 7`;
    
    await sendMessageFromSQL(api, message, { success: true, message: startMsg }, false, GAME_DURATION);

    // Cài đặt cảnh báo 10s
    activeGames[gameKey].warningTimeout = setTimeout(() => {
      if (!activeGames[gameKey]) return;
      let conStr = [], caiStr = [], hoaStr = [];
      const currentGroup = activeGames[gameKey].players[message.data.uidFrom]?.groupName;
      const otherGroups = new Map();
      for (const p of Object.values(activeGames[gameKey].players)) {
        const line = `${p.name}: ${formatCurrency(p.amount)}`;
        if (p.groupName !== currentGroup) {
          if (!otherGroups.has(p.groupName)) otherGroups.set(p.groupName, []);
          const door = p.door === 'con' ? 'Con' : p.door === 'cái' ? 'Cái' : 'Hòa';
          otherGroups.get(p.groupName).push(`- ${line} cửa ${door}`);
          continue;
        }
        if (p.door === 'con') conStr.push(line);
        if (p.door === 'cái') caiStr.push(line);
        if (p.door === 'hòa') hoaStr.push(line);
      }
      
      const otherSession = [...otherGroups.entries()]
        .map(([groupName, players]) => `\n📌 Phiên khác: ${groupName}\n${players.join("\n")}`)
        .join("");
      const warnMsg = `⚜️ ThuHoa Bot Team ⚜️\n⏳ BACCARAT còn 10 giây nữa là chốt cược!\nCon (Player): ${conStr.length ? conStr.join(', ') : 'chưa ai đặt'}\nCái (Banker): ${caiStr.length ? caiStr.join(', ') : 'chưa ai đặt'}\nHòa (Tie): ${hoaStr.length ? hoaStr.join(', ') : 'chưa ai đặt'}${otherSession}\n\n👉 Ai chưa đặt thì nhanh tay: ${prefix}bcr con / cái / hòa + tiền cược.`;
      
      api.sendMessage({ msg: warnMsg, ttl: 20000 }, message.threadId, message.type)
        .then((sentWarning) => {
          // sendMessage trả về { message, attachment, link }; reaction cần
          // message object thật, không phải wrapper response.
          const warningMessage = sentWarning?.message || sentWarning;
          const reactionMessage = warningMessage?.data
            ? warningMessage
            : warningMessage && {
                data: {
                  msgId: warningMessage.msgId || warningMessage.messageId || warningMessage.gMsgID,
                  cliMsgId: warningMessage.cliMsgId || warningMessage.clientId,
                },
                threadId: message.threadId,
                type: message.type,
              };
          const target = reactionMessage?.data?.msgId || reactionMessage?.data?.cliMsgId ? reactionMessage : message;
          api.addReaction("CLOCK", [target]).catch((error) => {
            console.warn("[baccarat] Không thả được reaction CLOCK:", error?.message || error);
          });
          // Một số phiên bản API không trả msgId của tin bot vừa gửi;
          // thả thêm vào tin lệnh gốc để countdown vẫn luôn nhìn thấy được.
          if (target !== message) {
            api.addReaction("CLOCK", [message]).catch(() => {});
          }
        })
        .catch(console.error);

      // Hiển thị countdown 10 giây giống các lệnh CD: CLOCK bật/tắt mỗi giây
      // trên tin lệnh gốc để người chơi biết thời gian còn lại để cược.
      sendReactionWaitingCountdown(api, message, WARNING_TIME / 1000, "baccarat-warning").catch((error) => {
        console.warn("[baccarat] Countdown reaction lỗi:", error?.message || error);
      });
    }, GAME_DURATION - WARNING_TIME);

    // Cài đặt chốt kết quả
    activeGames[gameKey].timeout = setTimeout(() => {
      endBaccaratGame(api, message);
    }, GAME_DURATION);

  } else {
    const game = activeGames[gameKey];
    if (game.players[senderId]) {
      // Hoàn tiền và báo lỗi nếu đã cược
      await updatePlayerBalanceByUsername(username, betAmount);
      await sendMessageFromSQL(api, message, { success: false, message: "Bạn đã cược trong ván này rồi!" }, true, 10000);
      return true;
    }
    
    game.threads.add(threadId);
    game.threadBots[String(threadId)] = api.getBotId();
    const groupName = groupSettings?.[threadId]?.nameGroup || String(threadId);
    game.players[senderId] = { door: betDoor, amount: betAmount, name: playerName, username, threadId, groupName, botId: api.getBotId() };
    
    const currentPlayers = Object.values(game.players)
      .map((p) => `${p.name} [${p.groupName}]`)
      .join(", ");
    const joinMsg = `⚜️ ThuHoa Bot Team ⚜️\n✅ Đặt ${formatCurrency(betAmount)} cửa ${betDoor === 'con' ? 'Con (Player)' : betDoor === 'cái' ? 'Cái (Banker)' : 'Hòa (Tie)'}.\n👥 Cùng phiên toàn server: ${currentPlayers}`;
    await sendMessageFromSQL(api, message, { success: true, message: joinMsg }, true, 15000);
  }

  return true;
}

async function endBaccaratGame(api, message) {
  const game = activeGames[GLOBAL_GAME_KEY];
  activeGames[GLOBAL_GAME_KEY] = null;
  if (!game) return;
  api.addReaction("UNDO", [message]).catch(() => {});

  // 65% phiên ưu tiên cửa có tổng nghĩa vụ trả thưởng thấp nhất; 35% còn lại
  // chia bài hoàn toàn ngẫu nhiên theo đúng luật Baccarat.
  const { player, banker, pScore, bScore, resultDoor } = dealBaccaratForBets(game.players);
  await addRecentResult(api, GLOBAL_GAME_KEY, resultDoor).catch((error) => console.error("Lỗi lưu cầu Baccarat:", error));

  const natural = player.length === 2 && banker.length === 2 && (pScore >= 8 || bScore >= 8);
  const winnerLabel = resultDoor === "con" ? "Con (Player)" : resultDoor === "cái" ? "Cái (Banker)" : "Hòa (Tie)";
  let resultMsg = `🎴 KẾT QUẢ BACCARAT\n`;
  resultMsg += `Con: ${pScore} điểm | Cái: ${bScore} điểm\n`;
  resultMsg += `➡️ ${winnerLabel} ${resultDoor === "hòa" ? "KẾT QUẢ HÒA" : "THẮNG"}${natural ? " (natural)" : ""}\n\n`;

  let winners = [];
  let losers = [];

  for (const p of Object.values(game.players)) {
    if (p.door === resultDoor) {
      let winAmount = new Big(0);
      if (resultDoor === 'con' || resultDoor === 'cái') {
        // Tỷ lệ thắng 1:1, trả cả gốc rồi trừ phí 5% âm thầm.
        winAmount = p.amount.times(2).times(BACCARAT_PAYOUT_FEE);
      } else if (resultDoor === 'hòa') {
        // Hòa 1 ăn 8, trả cả gốc theo tỷ lệ x8 rồi trừ phí 5%.
        winAmount = p.amount.times(8).times(BACCARAT_PAYOUT_FEE);
      }
      
      await updatePlayerBalanceByUsername(p.username, winAmount);
      winners.push(`${p.name} (${p.door === "con" ? "Con (Player)" : p.door === "cái" ? "Cái (Banker)" : "Hòa (Tie)"}): thắng +${formatCurrency(winAmount.minus(p.amount))}`);
    } else if (resultDoor === 'hòa') {
      // Nếu kết quả là hòa, những ai cược con hoặc cái sẽ được hoàn tiền
      await updatePlayerBalanceByUsername(p.username, p.amount);
      losers.push(`${p.name}: hòa, hoàn ${formatCurrency(p.amount)}`);
    } else {
      losers.push(`${p.name} (${p.door === "con" ? "Con (Player)" : p.door === "cái" ? "Cái (Banker)" : "Hòa (Tie)"}): thua -${formatCurrency(p.amount)}`);
    }
  }

  if (winners.length) resultMsg += `✅ Thắng:\n- ${winners.join('\n- ')}\n`;
  if (resultDoor === 'hòa') {
    if (losers.length) resultMsg += `🔄 Hòa (Hoàn Tiền):\n- ${losers.join('\n- ')}\n`;
  } else {
    if (losers.length) resultMsg += `❌ Thua:\n- ${losers.join('\n- ')}\n`;
  }
  
  if (!winners.length && !losers.length) resultMsg += `Không có ai tham gia.`;

  // Vẽ Canvas ảnh
  const imagePath = path.resolve(`./assets/temp/baccarat_result_${Date.now()}.png`);
  try {
    const canvas = new Canvas(900, 600);
    const ctx = canvas.getContext("2d");

    // Nền Đỏ Đậm (rất tối)
    ctx.fillStyle = "#1e0a0d";
    ctx.fillRect(0, 0, 900, 600);
    
    // Viền Vàng + Viền Đỏ
    ctx.strokeStyle = "#cda45e"; // Vàng
    ctx.lineWidth = 3;
    ctx.strokeRect(10, 10, 880, 580);
    ctx.strokeStyle = "#802020"; // Đỏ
    ctx.lineWidth = 1.5;
    ctx.strokeRect(15, 15, 870, 570);

    // Tiêu đề
    ctx.fillStyle = "#cda45e";
    ctx.font = "bold 32px sans-serif";
    ctx.textAlign = "center";
    ctx.letterSpacing = "5px";
    ctx.fillText("B A C C A R A T", 450, 55);

    // C O N / C Á I
    ctx.font = "bold 45px sans-serif";
    ctx.fillStyle = "#ffffff";
    ctx.fillText("C O N", 250, 130);
    ctx.fillStyle = "#cda45e";
    ctx.fillText("C Á I", 650, 130);

    // Đường line gạch đứt chia đôi
    ctx.strokeStyle = "rgba(255, 255, 255, 0.1)";
    ctx.lineWidth = 2;
    ctx.setLineDash([8, 12]);
    ctx.beginPath();
    ctx.moveTo(450, 100);
    ctx.lineTo(450, 520);
    ctx.stroke();
    ctx.setLineDash([]); // Reset

    // Hàm tạo viền bo tròn
    function roundedRectPath(x, y, width, height, radius) {
      let p = new Path2D();
      p.moveTo(x + radius, y);
      p.arcTo(x + width, y, x + width, y + height, radius);
      p.arcTo(x + width, y + height, x, y + height, radius);
      p.arcTo(x, y + height, x, y, radius);
      p.arcTo(x, y, x + width, y, radius);
      p.closePath();
      return p;
    }

    // Hàm vẽ Card (Sử dụng ảnh png bài thật)
    const drawCard = async (card, x, y) => {
      ctx.save();
      ctx.translate(x, y);
      
      // Bóng đổ nhẹ
      ctx.shadowColor = "rgba(0,0,0,0.5)";
      ctx.shadowBlur = 6;
      ctx.shadowOffsetX = 2;
      ctx.shadowOffsetY = 2;

      // Vẽ nền trắng bo tròn
      ctx.fillStyle = "#FFFFFF";
      ctx.fill(roundedRectPath(0, 0, 110, 160, 6));

      // Viền nhẹ cho bài
      ctx.strokeStyle = "#DDDDDD";
      ctx.lineWidth = 1;
      ctx.stroke(roundedRectPath(0, 0, 110, 160, 6));

      // Reset bóng đổ để ảnh PNG không bị đổ bóng lần 2
      ctx.shadowBlur = 0;
      ctx.shadowOffsetX = 0;
      ctx.shadowOffsetY = 0;

      // Map tên file
      const rankMap = { 'A': 'ace', 'J': 'jack', 'Q': 'queen', 'K': 'king' };
      const rankName = rankMap[card.rank] || card.rank;
      const suitMap = { '♥': 'hearts', '♦': 'diamonds', '♣': 'clubs', '♠': 'spades' };
      const suitName = suitMap[card.suit];
      
      const cardImgPath = path.resolve(`./assets/data/cards/png/${rankName}_of_${suitName}.png`);
      
      try {
        const cardImg = await loadImage(cardImgPath);
        ctx.drawImage(cardImg, 0, 0, 110, 160);
      } catch (err) {
        // Fallback vẽ tay nếu lỗi load ảnh
        const isRed = (card.suit === '♥' || card.suit === '♦');
        ctx.fillStyle = isRed ? "#e51f28" : "#000000";
        ctx.font = "bold 24px sans-serif";
        ctx.textAlign = "left";
        ctx.fillText(card.rank, 10, 30);
        ctx.font = "20px sans-serif";
        ctx.fillText(card.suit, 10, 52);
        ctx.font = "55px sans-serif";
        ctx.textAlign = "center";
        ctx.fillText(card.suit, 55, 95);
      }
      
      ctx.restore();
    };

    // Vẽ bài Player (CON) - Căn giữa cụm bài
    let pWidth = player.length * 110 + (player.length - 1) * 15;
    let pStartX = 250 - pWidth / 2;
    for (let i = 0; i < player.length; i++) {
      await drawCard(player[i], pStartX + (i * 125), 160);
    }
    
    // Vẽ bài Banker (CÁI) - Căn giữa cụm bài
    let bWidth = banker.length * 110 + (banker.length - 1) * 15;
    let bStartX = 650 - bWidth / 2;
    for (let i = 0; i < banker.length; i++) {
      await drawCard(banker[i], bStartX + (i * 125), 160);
    }

    // Điểm số Player
    ctx.fillStyle = "#fcf1d7";
    ctx.font = "bold 80px sans-serif";
    ctx.textAlign = "center";
    ctx.fillText(pScore.toString(), 250, 430);
    ctx.font = "bold 20px sans-serif";
    ctx.fillStyle = "#8a757b";
    ctx.letterSpacing = "2px";
    ctx.fillText("Đ I Ể M", 250, 465);

    // Điểm số Banker
    ctx.fillStyle = "#cda45e";
    ctx.font = "bold 80px sans-serif";
    ctx.fillText(bScore.toString(), 650, 430);
    ctx.font = "bold 20px sans-serif";
    ctx.fillStyle = "#8a757b";
    ctx.fillText("Đ I Ể M", 650, 465);
    ctx.letterSpacing = "0px";

    // Vòng tròn VS ở giữa
    ctx.fillStyle = "#1e0a0d";
    ctx.beginPath();
    ctx.arc(450, 400, 28, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = "#cda45e";
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.fillStyle = "#cda45e";
    ctx.font = "bold 22px sans-serif";
    ctx.fillText("VS", 450, 408);

    // Vẽ nút THẮNG / THUA
    const drawBadge = (text, isWin, x, y) => {
      const w = 180, h = 45;
      ctx.save();
      ctx.translate(x - w/2, y);
      
      if (isWin) {
        ctx.fillStyle = "#eec165";
        ctx.shadowColor = "rgba(238, 193, 101, 0.4)";
        ctx.shadowBlur = 20;
        ctx.fill(roundedRectPath(0, 0, w, h, 22));
        ctx.shadowBlur = 0;
        ctx.fillStyle = "#1e0a0d";
      } else {
        ctx.fillStyle = "#47141b";
        ctx.fill(roundedRectPath(0, 0, w, h, 22));
        ctx.strokeStyle = "#78252a";
        ctx.lineWidth = 1;
        ctx.stroke(roundedRectPath(0, 0, w, h, 22));
        ctx.fillStyle = "#96424b";
      }

      ctx.font = "bold 24px sans-serif";
      ctx.textAlign = "center";
      ctx.fillText(text, w/2, 32);
      ctx.restore();
    };

    // Vẽ nút THẮNG / THUA / HÒA
    if (resultDoor === 'con') {
      drawBadge("THẮNG", true, 250, 500);
      drawBadge("THUA", false, 650, 500);
    } else if (resultDoor === 'cái') {
      drawBadge("THUA", false, 250, 500);
      drawBadge("THẮNG", true, 650, 500);
    } else {
      drawBadge("HÒA", true, 250, 500);
      drawBadge("HÒA", true, 650, 500);
    }

    const buffer = await canvas.toBuffer("image/png");
    await fs.writeFile(imagePath, buffer);
    
    const groupsByThread = new Map();
    for (const player of Object.values(game.players)) {
      groupsByThread.set(String(player.threadId), player.groupName);
    }
    const messageForThread = (targetThreadId) => {
      const currentGroup = groupsByThread.get(String(targetThreadId));
      const otherPlayers = Object.values(game.players).filter((player) => player.groupName && player.groupName !== currentGroup);
      if (!otherPlayers.length) return resultMsg;
      const grouped = new Map();
      for (const player of otherPlayers) {
        if (!grouped.has(player.groupName)) grouped.set(player.groupName, []);
        const door = player.door === "con" ? "Con" : player.door === "cái" ? "Cái" : "Hòa";
        grouped.get(player.groupName).push(`- ${player.name}: ${formatCurrency(player.amount)} cửa ${door}`);
      }
      const otherSession = [...grouped.entries()]
        .map(([groupName, players]) => `📌 Phiên khác: ${groupName}\n${players.join("\n")}`)
        .join("\n");
      return `${resultMsg}\n${otherSession}`;
    };

    await api.sendMessage(
      { msg: messageForThread(message.threadId), attachments: [imagePath], ttl: 60000, isUseProphylactic: true },
      message.threadId,
      message.type
    );

    // Báo kết quả cho các group khác đã tham gia cùng phiên toàn server.
    for (const targetThreadId of game.threads) {
      if (String(targetThreadId) === String(message.threadId)) continue;
      const targetApi = getApiManager(game.threadBots?.[String(targetThreadId)])?.apiZalo || api;
      await targetApi.sendMessage({ msg: messageForThread(targetThreadId), ttl: 60000 }, targetThreadId, message.type).catch(() => {});
    }
    
    setTimeout(() => fs.unlink(imagePath).catch(() => {}), 60000); // Xóa ảnh sau 1p
  } catch (error) {
    console.error("Lỗi vẽ canvas Baccarat:", error);
    await sendMessageFromSQL(api, message, { success: true, message: resultMsg }, false);
  }
}
