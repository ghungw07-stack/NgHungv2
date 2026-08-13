import { connection, NAME_TABLE_PLAYERS } from './state.js';
import Big from 'big.js';

export async function getTopPlayers(botId) {
  try {
    // Lấy tất cả người chơi
    // SECURITY: botId trước đây được nối thẳng vào chuỗi SQL (`'${botId}'`),
    // nếu giá trị này từng đến từ input không tin cậy sẽ dính SQL injection.
    // Giờ dùng placeholder `?` để driver tự escape.
    const [rows] = await connection.execute(
      `SELECT idUserZalo, playerName, balance, rankPoints FROM ${NAME_TABLE_PLAYERS} WHERE serverId = ?`,
      [botId]
    );

    // Chuyển đổi balance sang Big và sắp xếp lại
    const sortedPlayers = rows
      .map(player => ({
        idUser: player.idUserZalo,
        playerName: player.playerName,
        balance: new Big(player.balance),
        rankPoints: Number(player.rankPoints || 0)
      }))
      .sort((a, b) => Number(b.balance.minus(a.balance)) || b.rankPoints - a.rankPoints)
      .map((player, index) => ({
        rank: index + 1,
        idUser: player.idUser,
        playerName: player.playerName,
        balance: player.balance.toString(),
        rankPoints: player.rankPoints
      }));

    return sortedPlayers;
  } catch (error) {
    console.error('Lỗi khi lấy danh sách top người chơi:', error);
    return [];
  }
}
