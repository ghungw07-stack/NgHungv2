import Big from "big.js";

// Ghi số dư và biên nhận trong cùng một cập nhật MongoDB. Nếu restart giữa
// cộng/trừ ví và lưu phiên, phát lại cùng operationId sẽ không đổi tiền lần hai.
export async function applyLotteryWallet(collection, { username, sessionId, operationId, amount, cost }) {
  const delta = new Big(amount);
  for (let attempt = 0; attempt < 10; attempt++) {
    let player = await collection.findOne({ username });
    const visited = new Set();
    while (player?.mergedInto) {
      if (visited.has(String(player._id))) throw new Error("Hồ sơ game bị vòng lặp liên kết.");
      visited.add(String(player._id));
      player = await collection.findOne({ idUserZalo: String(player.mergedInto) });
    }
    if (!player) return { success: false, message: "Không tìm thấy hồ sơ game." };
    const receipt = player.veSoWallet;
    const operations = receipt?.sessionId === sessionId ? receipt.operations : [];
    if (operations.includes(operationId)) return { success: true, duplicate: true, balance: player.balance };
    const balance = new Big(player.balance || 0).plus(delta);
    if (balance.lt(0)) return { success: false, message: "Ví không đủ tiền: mỗi vé cần 10 tỷ tiền ảo." };
    const filter = { _id: player._id, balance: player.balance ?? null, veSoWallet: receipt ?? null };
    const values = { balance: balance.toFixed(0), veSoWallet: { sessionId, operations: [...operations, operationId] } };
    if (cost !== undefined) {
      const net = delta.minus(cost);
      const games = Number(player.totalGames || 0) + 1;
      const wins = Number(player.totalWinGames || 0) + (net.gt(0) ? 1 : 0);
      for (const key of ["totalGames", "totalWinGames", "totalWinnings", "totalLosses"]) filter[key] = player[key] ?? null;
      Object.assign(values, {
        totalGames: games, totalWinGames: wins, winRate: wins / games * 100,
        totalWinnings: new Big(player.totalWinnings || 0).plus(net.gt(0) ? net : 0).toFixed(0),
        totalLosses: new Big(player.totalLosses || 0).plus(net.lt(0) ? net.abs() : 0).toFixed(0),
      });
    }
    const updated = await collection.updateOne(filter, { $set: values });
    if (updated.modifiedCount === 1) return { success: true, balance: balance.toFixed(0), playerId: player.idUserZalo };
  }
  throw new Error("Ví đang được cập nhật, hệ thống sẽ thử lại giao dịch vé số.");
}
