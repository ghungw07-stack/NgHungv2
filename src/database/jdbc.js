import { connection, NAME_TABLE_PLAYERS } from './state.js';
import Big from 'big.js';

export async function getTopPlayers(_botId) {
  try {
    // Database game dùng chung cho tất cả bot, nên BXH cũng phải dùng chung.
    // Các UID khác bot đã được quy về cùng playerId qua player_identity.
    const [rows] = await connection.execute(
      `SELECT idUserZalo, playerName, serverId, balance, rankPoints, totalGames, totalWinGames, totalWinnings, totalLosses, netProfit, winRate FROM ${NAME_TABLE_PLAYERS}`
    );

    // Chuyển đổi balance sang Big và sắp xếp lại
    const players = rows
      .map(player => {
        const totalWinnings = new Big(player.totalWinnings || 0);
        const totalLosses = new Big(player.totalLosses || 0);
        return {
        idUser: player.idUserZalo,
        playerName: player.playerName,
        serverId: player.serverId,
        balance: new Big(player.balance),
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
        balance: player.balance.toString(),
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
