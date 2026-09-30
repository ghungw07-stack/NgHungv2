import fs from "node:fs/promises";
import path from "node:path";
import Big from "big.js";
import mongodb from "mongodb";

const { BSON: { EJSON }, MongoClient } = mongodb;

const APPLY_FLAG = "--apply";
const apply = process.argv.includes(APPLY_FLAG);
const uri = process.env.NGH_MONGO_URI || "mongodb://127.0.0.1:27017";
const databaseName = process.env.NGH_MONGO_DATABASE || "bot-zalo-ngh";
const playersTable = process.env.NGH_PLAYERS_TABLE || "players_zalo";
const recoveryId = "bug-clawback-2026-09-30-v1";
const root = path.resolve(import.meta.dirname, "..");

function messageContent(row) {
  try {
    const payload = JSON.parse(row.payload);
    return typeof payload.content === "string" ? payload.content : payload.content?.title || "";
  } catch {
    return "";
  }
}

function digits(value) {
  return String(value || "0").replace(/\D/gu, "") || "0";
}

function minBig(left, right) {
  return left.lt(right) ? left : right;
}

function canonicalPlayerQuery(name) {
  return {
    playerName: name,
    $or: [{ mergedInto: { $exists: false } }, { mergedInto: null }, { mergedInto: "" }],
  };
}

async function analyze(database) {
  const logs = database.collection("messages_log");
  const [commandRows, responseRows] = await Promise.all([
    logs.find({ payload: { $regex: "[.!&/>](bug|bung)\\s", $options: "i" } })
      .project({ botId: 1, threadId: 1, cliMsgId: 1, msgId: 1, ts: 1, payload: 1 })
      .sort({ ts: 1 }).toArray(),
    logs.find({ payload: { $regex: "🔄 (Kết quả set tiền|Set tiền thành công!)" } })
      .project({ botId: 1, threadId: 1, cliMsgId: 1, msgId: 1, ts: 1, payload: 1 })
      .sort({ ts: 1 }).toArray(),
  ]);

  const commandsByLocation = new Map();
  const commandKeys = new Set();
  for (const row of commandRows) {
    const content = messageContent(row);
    if (!/(?:^|\s)[.!&/>](?:bug|bung)\s+\S+/iu.test(content)) continue;
    const commandKey = String(row.cliMsgId || row.msgId || row._id);
    commandKeys.add(commandKey);
    const location = `${row.botId}|${row.threadId}`;
    const list = commandsByLocation.get(location) || [];
    list.push(Number(row.ts || 0));
    commandsByLocation.set(location, list);
  }

  const seenResponses = new Set();
  const parsedEvents = [];
  const unmatchedResponses = [];
  for (const row of responseRows) {
    const content = messageContent(row);
    if (!/🔄 (?:Kết quả set tiền|Set tiền thành công!)/u.test(content)) continue;
    const responseKey = `${row.msgId}|${content}`;
    if (seenResponses.has(responseKey)) continue;
    seenResponses.add(responseKey);

    const location = `${row.botId}|${row.threadId}`;
    const responseTime = Number(row.ts || 0);
    const related = (commandsByLocation.get(location) || []).some(
      (commandTime) => commandTime <= responseTime && responseTime - commandTime <= 120_000,
    );
    if (!related) {
      unmatchedResponses.push({ msgId: row.msgId, botId: row.botId, threadId: row.threadId, ts: responseTime });
    }

    const targetName = content.match(/✅ ([^:\n]+):\n- Set:/u)?.[1]?.trim() || content.split("\n")[0]?.trim();
    const beforeMatch = content.match(/(?:- Trước:|Trước:) ([\d.]+) VNĐ/u);
    const afterMatch = content.match(/(?:- Sau:|Sau:) ([\d.]+) VNĐ/u);
    if (!targetName || !beforeMatch || !afterMatch) continue;
    const before = new Big(digits(beforeMatch[1]));
    const after = new Big(digits(afterMatch[1]));
    const increase = after.minus(before);
    parsedEvents.push({
      type: "bug",
      ts: responseTime,
      targetName,
      before,
      after,
      minted: increase.gt(0) ? increase : new Big(0),
      msgId: String(row.msgId),
    });
  }

  const targetNames = [...new Set(parsedEvents.map((event) => event.targetName))];
  const directPlayers = [];
  for (const name of targetNames) {
    const matches = await database.collection(playersTable).find(canonicalPlayerQuery(name)).toArray();
    if (matches.length !== 1) {
      throw new Error(`Không thể ánh xạ duy nhất hồ sơ bug cho ${name}: tìm thấy ${matches.length}.`);
    }
    directPlayers.push(matches[0]);
  }
  const playerByName = new Map(directPlayers.map((player) => [player.playerName, player]));
  for (const event of parsedEvents) event.playerId = String(playerByName.get(event.targetName).idUserZalo);

  const earliestEvent = parsedEvents.reduce((minimum, event) => Math.min(minimum, event.ts), Number.POSITIVE_INFINITY);
  const transactions = await database.collection("game_transactions")
    .find({ createdAt: { $gte: new Date(earliestEvent) } })
    .sort({ createdAt: 1, _id: 1 })
    .toArray();

  const debtByPlayer = new Map();
  const directDebtByPlayer = new Map();
  const transferDebtByPlayer = new Map();
  const contaminatedAt = new Map();
  const timeline = [
    ...parsedEvents,
    ...transactions.map((transaction) => ({ type: "transfer", ts: new Date(transaction.createdAt).getTime(), transaction })),
  ].sort((left, right) => left.ts - right.ts || (left.type === "bug" ? -1 : 1));

  const addDebt = (map, playerId, amount) => {
    map.set(playerId, (map.get(playerId) || new Big(0)).plus(amount));
  };

  const taintedTransfers = [];
  for (const item of timeline) {
    if (item.type === "bug") {
      if (item.minted.gt(0)) {
        addDebt(debtByPlayer, item.playerId, item.minted);
        addDebt(directDebtByPlayer, item.playerId, item.minted);
      }
      const previous = contaminatedAt.get(item.playerId);
      contaminatedAt.set(item.playerId, previous == null ? item.ts : Math.min(previous, item.ts));
      continue;
    }

    const transaction = item.transaction;
    const senderId = String(transaction.senderId);
    const receiverId = String(transaction.receiverId);
    const senderTaintedAt = contaminatedAt.get(senderId);
    if (senderTaintedAt == null || item.ts < senderTaintedAt) continue;
    const amount = new Big(transaction.amount || 0).abs().round(0);
    if (amount.lte(0)) continue;
    addDebt(debtByPlayer, receiverId, amount);
    addDebt(transferDebtByPlayer, receiverId, amount);
    if (!contaminatedAt.has(receiverId)) contaminatedAt.set(receiverId, item.ts);
    taintedTransfers.push({
      referenceCode: transaction.referenceCode,
      senderId,
      receiverId,
      amount: amount.toString(),
      createdAt: transaction.createdAt,
    });
  }

  const affectedIds = [...debtByPlayer.keys()];
  const players = await database.collection(playersTable).find({ idUserZalo: { $in: affectedIds } }).toArray();
  const playerMap = new Map(players.map((player) => [String(player.idUserZalo), player]));
  const savingsRows = await database.collection("game_savings_accounts").find({ playerId: { $in: affectedIds } }).toArray();
  const savingsMap = new Map(savingsRows.map((account) => [String(account.playerId), account]));

  const recoveries = affectedIds.map((playerId) => {
    const player = playerMap.get(playerId);
    if (!player) throw new Error(`Không tìm thấy hồ sơ nhận tiền bug: ${playerId}.`);
    const debt = debtByPlayer.get(playerId).round(0);
    const savings = new Big(savingsMap.get(playerId)?.principal || 0).round(0);
    const savingsRecovered = minBig(savings.gt(0) ? savings : new Big(0), debt);
    const walletDebt = debt.minus(savingsRecovered);
    const balanceBefore = new Big(player.balance || 0).round(0);
    const balanceAfter = balanceBefore.minus(walletDebt);
    return {
      playerId,
      playerName: player.playerName || playerId,
      username: player.username,
      directDebt: (directDebtByPlayer.get(playerId) || new Big(0)).toString(),
      transferDebt: (transferDebtByPlayer.get(playerId) || new Big(0)).toString(),
      totalDebt: debt.toString(),
      balanceBefore: balanceBefore.toString(),
      balanceAfter: balanceAfter.toString(),
      pendingRefundBefore: new Big(player.pendingRefund || 0).round(0).toString(),
      savingsBefore: savings.toString(),
      savingsAfter: savings.minus(savingsRecovered).toString(),
      savingsRecovered: savingsRecovered.toString(),
      walletDebt: walletDebt.toString(),
      player,
      savingsAccount: savingsMap.get(playerId) || null,
    };
  }).sort((left, right) => new Big(right.totalDebt).cmp(left.totalDebt));

  return {
    recoveryId,
    commandCount: commandKeys.size,
    successfulSetCount: parsedEvents.length,
    unmatchedResponses,
    directTargets: directPlayers.map((player) => ({ playerId: player.idUserZalo, playerName: player.playerName })),
    taintedTransfers,
    recoveries,
  };
}

async function applyRecovery(database, analysis) {
  const runs = database.collection("game_bug_recovery_runs");
  const existing = await runs.findOne({ recoveryId });
  if (existing?.status === "complete") throw new Error(`Đợt thu hồi ${recoveryId} đã hoàn tất trước đó.`);

  const now = new Date();
  const exportDirectory = path.join(root, "exports", "bug-recovery");
  await fs.mkdir(exportDirectory, { recursive: true });
  const backupPath = path.join(exportDirectory, `${recoveryId}.json`);
  const backup = {
    recoveryId,
    createdAt: now,
    players: analysis.recoveries.map((item) => item.player),
    savingsAccounts: analysis.recoveries.map((item) => item.savingsAccount).filter(Boolean),
    recoveries: analysis.recoveries.map(({ player, savingsAccount, ...item }) => item),
    taintedTransfers: analysis.taintedTransfers,
  };
  await fs.writeFile(backupPath, `${EJSON.stringify(backup, null, 2)}\n`, { flag: "wx" });

  await runs.updateOne(
    { recoveryId },
    { $set: { recoveryId, status: "applying", startedAt: now, backupPath } },
    { upsert: true },
  );

  const audit = database.collection("game_bug_recovery_audit");
  const applied = [];
  try {
    for (const item of analysis.recoveries) {
      const player = item.player;
      const savings = item.savingsAccount;
      let savingsChanged = false;
      if (savings && item.savingsAfter !== String(savings.principal || 0)) {
        const savingsResult = await database.collection("game_savings_accounts").updateOne(
          { _id: savings._id, principal: savings.principal },
          { $set: { principal: item.savingsAfter, updatedAt: now, bugRecoveryId: recoveryId } },
        );
        if (savingsResult.modifiedCount !== 1) throw new Error(`Sổ tiết kiệm ${item.playerId} vừa thay đổi.`);
        savingsChanged = true;
      }

      const playerResult = await database.collection(playersTable).updateOne(
        { _id: player._id, balance: player.balance, pendingRefund: player.pendingRefund ?? null },
        {
          $set: {
            balance: item.balanceAfter,
            pendingRefund: "0",
            bugRecoveryId: recoveryId,
            bugRecoveryDebt: item.totalDebt,
            bugRecoveryAt: now,
          },
        },
      );
      if (playerResult.modifiedCount !== 1) {
        if (savingsChanged) {
          await database.collection("game_savings_accounts").updateOne(
            { _id: savings._id, principal: item.savingsAfter, bugRecoveryId: recoveryId },
            { $set: { principal: savings.principal, updatedAt: savings.updatedAt ?? now }, $unset: { bugRecoveryId: "" } },
          );
        }
        throw new Error(`Ví ${item.playerId} vừa thay đổi; đã dừng để tránh trừ sai.`);
      }

      const auditRecord = {
        recoveryId,
        playerId: item.playerId,
        playerName: item.playerName,
        directDebt: item.directDebt,
        transferDebt: item.transferDebt,
        totalDebt: item.totalDebt,
        balanceBefore: item.balanceBefore,
        balanceAfter: item.balanceAfter,
        pendingRefundBefore: item.pendingRefundBefore,
        pendingRefundAfter: "0",
        savingsBefore: item.savingsBefore,
        savingsAfter: item.savingsAfter,
        createdAt: now,
      };
      await audit.updateOne(
        { recoveryId, playerId: item.playerId },
        { $setOnInsert: auditRecord },
        { upsert: true },
      );
      applied.push(auditRecord);
    }
    await runs.updateOne(
      { recoveryId },
      { $set: { status: "complete", completedAt: new Date(), affectedPlayers: applied.length } },
    );
    return { backupPath, applied };
  } catch (error) {
    await runs.updateOne(
      { recoveryId },
      { $set: { status: "failed", failedAt: new Date(), error: error.message, appliedPlayers: applied.length } },
    );
    throw error;
  }
}

function publicReport(analysis) {
  return {
    recoveryId: analysis.recoveryId,
    commandCount: analysis.commandCount,
    successfulSetCount: analysis.successfulSetCount,
    unmatchedResponseCount: analysis.unmatchedResponses.length,
    directTargets: analysis.directTargets,
    taintedTransferCount: analysis.taintedTransfers.length,
    affectedPlayers: analysis.recoveries.map(({ player, savingsAccount, ...item }) => item),
  };
}

const client = new MongoClient(uri);
await client.connect();
try {
  const database = client.db(databaseName);
  const analysis = await analyze(database);
  if (!apply) {
    console.log(EJSON.stringify({ apply: false, ...publicReport(analysis) }, null, 2));
    console.log(`Chạy lại với ${APPLY_FLAG} để sao lưu và thu hồi.`);
  } else {
    const result = await applyRecovery(database, analysis);
    console.log(EJSON.stringify({
      apply: true,
      ...publicReport(analysis),
      backupPath: result.backupPath,
      appliedPlayers: result.applied.length,
    }, null, 2));
  }
} finally {
  await client.close();
}
