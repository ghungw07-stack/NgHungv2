import { connection, NAME_TABLE_PLAYERS } from './state.js';
import Big from 'big.js';
import { getCurrentPrivateGameServer, getPrivateGameBotIds } from '../service-ngh/game-service/private-game-server.js';

export async function getTopPlayers(_botId) {
  try {
    // Database game dùng chung cho tất cả bot, nên BXH cũng phải dùng chung.
    // Các UID khác bot đã được quy về cùng playerId qua player_identity.
    const [rows] = await connection.execute(
      `SELECT idUserZalo, playerName, serverId, avatar, balance, rankPoints, totalGames, totalWinGames, totalWinnings, totalLosses, netProfit, winRate FROM ${NAME_TABLE_PLAYERS}`
    );
    const privateServer = getCurrentPrivateGameServer();
    // Server riêng của bot vẫn lưu serverId runtime trên hồ sơ người chơi;
    // các bản ghi cũ chưa có prefix private nên lọc thêm theo bot đang gọi.
    const privateBotIds = getPrivateGameBotIds();
    const playerRows = privateServer?.serverId
      ? rows.filter((player) => String(player.serverId) === String(_botId)
        || String(player.idUserZalo).startsWith(`private:${privateServer.serverId}:`))
      : rows.filter((player) =>
          !privateBotIds.includes(String(player.serverId)) &&
          !String(player.idUserZalo).startsWith("private:")
        );
    const aliasesByPlayer = new Map();
    try {
      const playerIds = playerRows.map((player) => String(player.idUserZalo));
      const aliases = playerIds.length
        ? await connection.collection("player_identity").find({ playerId: { $in: playerIds } }).toArray()
        : [];
      for (const identity of aliases) {
        const playerId = String(identity.playerId || "");
        const aliasId = String(identity.aliasId || "");
        if (!playerId || !aliasId || aliasId === playerId) continue;
        const current = aliasesByPlayer.get(playerId) || [];
        if (!current.includes(aliasId)) current.push(aliasId);
        aliasesByPlayer.set(playerId, current);
      }
    } catch {}
    // Tiền đang gửi vẫn là tài sản của người chơi, chỉ bị khóa khỏi ví giao dịch.
    const savingsRows = await connection.collection("game_savings_accounts").find({}).toArray();
    const savingsByPlayer = new Map(
      savingsRows.map((item) => [String(item.playerId), new Big(item.principal || 0)])
    );

    // Chuyển đổi balance sang Big và sắp xếp lại
    const players = playerRows
      .map(player => {
        const totalWinnings = new Big(player.totalWinnings || 0);
        const totalLosses = new Big(player.totalLosses || 0);
        const wallet = new Big(player.balance || 0);
        const savings = savingsByPlayer.get(String(player.idUserZalo)) || new Big(0);
        return {
        idUser: player.idUserZalo,
        playerName: player.playerName,
        serverId: player.serverId,
        avatar: player.avatar || null,
        profileIds: [String(player.idUserZalo), ...(aliasesByPlayer.get(String(player.idUserZalo)) || [])],
        balance: wallet.plus(savings),
        walletBalance: wallet,
        savings: savings,
        rankPoints: Number(player.rankPoints || 0),
        totalGames: Number(player.totalGames || 0),
        totalWinGames: Number(player.totalWinGames || 0),
        totalWinnings: totalWinnings.toString(),
        totalLosses: totalLosses.toString(),
        netProfit: totalWinnings.plus(totalLosses).toString(),
        winRate: Number(player.winRate || 0)
        };
      })
    const sortedPlayers = players
      .filter(p => p.balance.gt(0))
      .sort((a, b) => Number(b.balance.minus(a.balance)) || b.rankPoints - a.rankPoints)
      .map((player, index) => ({
        rank: index + 1,
        idUser: player.idUser,
        playerName: player.playerName,
        serverId: player.serverId,
        avatar: player.avatar,
        profileIds: player.profileIds,
        balance: player.balance.toString(),
        walletBalance: player.walletBalance.toString(),
        savings: player.savings.toString(),
        rankPoints: player.rankPoints,
        totalGames: player.totalGames,
        totalWinGames: player.totalWinGames,
        totalWinnings: player.totalWinnings,
        totalLosses: player.totalLosses,
        netProfit: player.netProfit,
        winRate: player.winRate
      }));

    return sortedPlayers;
  } catch (error) {
    console.error('Lỗi khi lấy danh sách top người chơi:', error);
    return [];
  }
}
