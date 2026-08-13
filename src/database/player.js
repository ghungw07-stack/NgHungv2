import { connection, NAME_TABLE_PLAYERS, nameServer, NAME_TABLE_ACCOUNT, DAILY_REWARD } from "./state.js";
import { getUserInfoData } from "../service-ngh/info-service/user-info.js";
import { getTimeToString, getTimeNow, formatBigNumber } from "../utils/format-util.js";
import { getGameTier } from "../utils/canvas/game-finance.js";
import { Big } from "big.js";

/**
 * Tự động tạo/đồng bộ tài khoản người chơi theo UID Zalo — không cần đăng ký/đăng nhập.
 * Nếu UID Zalo đã có bản ghi thì chỉ cập nhật lại tên hiển thị (nếu đổi tên).
 * Nếu chưa có thì tạo mới ngay với số dư mặc định của bảng (10.000).
 */
export async function ensurePlayerAccount(idUserZalo, senderName, botId) {
  try {
    const [rows] = await connection.execute(
      `SELECT id, playerName FROM ${NAME_TABLE_PLAYERS} WHERE idUserZalo = ?`,
      [idUserZalo]
    );

    if (rows.length > 0) {
      if (senderName && rows[0].playerName !== senderName) {
        await connection.execute(`UPDATE ${NAME_TABLE_PLAYERS} SET playerName = ? WHERE idUserZalo = ?`, [
          senderName,
          idUserZalo,
        ]);
      }
      return { success: true, isNew: false };
    }

    // username không còn dùng để đăng nhập nữa, chỉ giữ để tương thích các hàm *ByUsername cũ.
    // Dùng luôn idUserZalo làm username vì mỗi UID Zalo là duy nhất.
    await connection.execute(
      `INSERT INTO ${NAME_TABLE_PLAYERS} (username, idUserZalo, playerName, serverId, registrationTime) VALUES (?, ?, ?, ?, NOW())`,
      [idUserZalo, idUserZalo, senderName || idUserZalo, botId]
    );

    return { success: true, isNew: true };
  } catch (error) {
    console.error("Lỗi khi tự động tạo tài khoản người chơi theo UID Zalo:", error);
    return { success: false };
  }
}

export async function isHaveLoginAccount(idUserZalo) {
  try {
    const [rows] = await connection.execute(
      `SELECT COUNT(*) as count FROM ${NAME_TABLE_PLAYERS} WHERE idUserZalo = ?`,
      [idUserZalo]
    );
    return rows[0].count > 0;
  } catch (error) {
    console.error("Lỗi khi kiểm tra trạng thái đăng nhập của người chơi:", error);
    throw error;
  }
}

export async function banPlayer(idUserZalo) {
  try {
    await connection.execute(`UPDATE ${NAME_TABLE_PLAYERS} SET isBanned = 1 WHERE idUserZalo = ?`, [idUserZalo]);
    return { success: true, message: `${nameServer}: Người chơi đã bị ban thành công!` };
  } catch (error) {
    console.error("Lỗi khi ban người chơi:", error);
    return { success: false, message: `${nameServer}: Đã xảy ra lỗi khi ban người chơi!` };
  }
}

export async function unbanPlayer(idUserZalo) {
  try {
    await connection.execute(`UPDATE ${NAME_TABLE_PLAYERS} SET isBanned = 0 WHERE idUserZalo = ?`, [idUserZalo]);
    return { success: true, message: `${nameServer}: Đã gỡ ban người chơi thành công!` };
  } catch (error) {
    console.error("Lỗi khi unban người chơi:", error);
    return { success: false, message: `${nameServer}: Đã xảy ra lỗi khi gỡ ban người chơi!` };
  }
}

export async function isPlayerBanned(idUserZalo) {
  try {
    const [rows] = await connection.execute(`SELECT isBanned FROM ${NAME_TABLE_PLAYERS} WHERE idUserZalo = ?`, [
      idUserZalo,
    ]);
    return rows.length > 0 && rows[0].isBanned === 1;
  } catch (error) {
    console.error("Lỗi khi kiểm tra trạng thái ban của người chơi:", error);
    throw error;
  }
}

export async function isPlayerActive(idUserZalo) {
  try {
    const [existingLoginRows] = await connection.execute(
      `SELECT username FROM ${NAME_TABLE_PLAYERS} WHERE idUserZalo = ?`,
      [idUserZalo]
    );

    if (existingLoginRows.length === 0) {
      return false;
    }

    const [rows] = await connection.execute(`SELECT active FROM ${NAME_TABLE_ACCOUNT} WHERE username = ?`, [
      existingLoginRows[0].username,
    ]);
    return rows.length > 0 && rows[0].active === 1;
  } catch (error) {
    console.error("Lỗi khi kiểm tra trạng thái kích hoạt của người chơi:", error);
    throw error;
  }
}

export async function claimDailyReward(idUser) {
  try {
    const [rows] = await connection.execute(`SELECT * FROM ${NAME_TABLE_PLAYERS} WHERE idUserZalo = ?`, [idUser]);

    if (rows.length === 0) {
      return { success: false, message: `Không thể khởi tạo hồ sơ game của bạn.` };
    }

    const player = rows[0];
    const now = getTimeNow();

    const lastReward = player.lastDailyReward ? new Date(player.lastDailyReward) : null;

    if (
      lastReward &&
      lastReward.getDate() === now.getDate() &&
      lastReward.getMonth() === now.getMonth() &&
      lastReward.getFullYear() === now.getFullYear()
    ) {
      const registrationTime = getTimeToString(lastReward);
      return {
        success: false,
        message: `Bạn đã nhận quà hôm nay lúc ${registrationTime}. Hãy quay lại vào ngày mai!`,
      };
    }

    const tierInfo = getGameTier(player.rankPoints);
    let rewardAmount = new Big(tierInfo.daily || DAILY_REWARD);
    const currentBalance = new Big(player.balance);

    let interestAmount = new Big(0);
    if (tierInfo.key === "diamond") {
      interestAmount = currentBalance.times(0.06).round(0, 0);
      rewardAmount = rewardAmount.plus(interestAmount);
    }

    const newBalance = currentBalance.plus(rewardAmount);

    const [updateResult] = await connection.execute(
      `UPDATE ${NAME_TABLE_PLAYERS} SET balance = ?, lastDailyReward = ? WHERE idUserZalo = ?`,
      [newBalance.toString(), now, idUser]
    );

    if (updateResult.affectedRows === 1) {
      let msg = `[Hạng ${tierInfo.name}] Bạn đã nhận ${formatBigNumber(rewardAmount)} VNĐ. Hãy quay lại vào ngày mai để nhận thêm!`;
      if (tierInfo.key === "diamond") {
        msg = `[Hạng ${tierInfo.name}] Bạn đã nhận Daily + Sinh lời 6% (${formatBigNumber(interestAmount)} VNĐ). Tổng: ${formatBigNumber(rewardAmount)} VNĐ.`;
      }
      return {
        success: true,
        message: msg,
      };
    } else {
      return { success: false, message: `Có lỗi xảy ra khi nhận quà.` };
    }
  } catch (error) {
    console.error("Lỗi khi nhận quà hàng ngày:", error);
    return { success: false, message: `Đã xảy ra lỗi khi nhận quà.` };
  }
}

export async function getMyCard(api, idUser) {
  try {
    const [rows] = await connection.execute(`SELECT * FROM ${NAME_TABLE_PLAYERS} WHERE idUserZalo = ?`, [idUser]);

    if (rows.length === 0) {
      return {
        success: false,
        message: `${nameServer}: Không thể khởi tạo hồ sơ game của bạn. Vui lòng thử lại. ❌`,
      };
    }

    const player = rows[0];
    const dataPlayerZalo = await getUserInfoData(api, idUser);

    const totalWinnings = new Big(player.totalWinnings);
    const totalLosses = new Big(player.totalLosses);
    const netProfit = totalWinnings.plus(totalLosses);
    const balance = new Big(player.balance);
    const winRate =
      player.totalGames > 0 ? new Big(player.totalWinGames).div(player.totalGames).times(100) : new Big(0);

    const now = getTimeNow();
    const lastReward = player.lastDailyReward ? new Date(player.lastDailyReward) : null;
    let lastDailyReward = "Chưa nhận quà";
    if (
      lastReward &&
      lastReward.getDate() === now.getDate() &&
      lastReward.getMonth() === now.getMonth() &&
      lastReward.getFullYear() === now.getFullYear()
    ) {
      lastDailyReward = getTimeToString(lastReward);
    }

    const playerInfo = {
      account: player.username,
      idUser: player.idUserZalo,
      playerName: player.playerName,
      balance: balance.toString(),
      rankPoints: Number(player.rankPoints || 0),
      registrationTime: getTimeToString(player.registrationTime),
      totalWinnings: totalWinnings.toString(),
      totalLosses: totalLosses.toString(),
      netProfit: netProfit.toString(),
      totalWinGames: player.totalWinGames,
      totalGames: player.totalGames,
      winRate: formatWinRate(winRate),
      lastDailyReward: lastDailyReward,
      ...dataPlayerZalo,
    };

    return { success: true, data: playerInfo };
  } catch (error) {
    console.error("Lỗi khi lấy thông tin người chơi:", error);
    return { success: false, message: `${nameServer}: Đã xảy ra lỗi khi lấy thông tin. ❌` };
  }
}

function formatWinRate(winRate) {
  if (winRate.eq(100)) return "100";
  if (winRate.eq(0)) return "0";
  return winRate.toFixed(1).replace(/\.0$/, "");
}

export async function setLoserGame(idUser, amount) {
  try {
    const [playerRows] = await connection.execute(`SELECT balance FROM ${NAME_TABLE_PLAYERS} WHERE idUserZalo = ?`, [
      idUser,
    ]);
    if (playerRows.length === 0) {
      return { success: false, message: `${nameServer}: Không tìm thấy người chơi. ❌` };
    }

    let query = `UPDATE ${NAME_TABLE_PLAYERS} SET 
      totalLosses = totalLosses + ?,
      totalGames = totalGames + 1
      WHERE idUserZalo = ?`;
    const [result] = await connection.execute(query, [new Big(amount).neg().toString(), idUser]);

    if (result.affectedRows === 1) {
      return { success: true, message: `${nameServer}: Cập nhật lượt thua thành công. ✅` };
    } else {
      return { success: false, message: `${nameServer}: Cập nhật lượt thua thất bại. ❌` };
    }
  } catch (error) {
    console.error("Lỗi khi cập nhật lượt thua:", error);
    return { success: false, message: `${nameServer}: Đã xảy ra lỗi khi cập nhật lượt thua. ❌` };
  }
}

export async function setLoserGameByUsername(username, amount) {
  try {
    const [playerRows] = await connection.execute(`SELECT balance FROM ${NAME_TABLE_PLAYERS} WHERE username = ?`, [
      username,
    ]);
    if (playerRows.length === 0) {
      return { success: false, message: `${nameServer}: Không tìm thấy người chơi. ❌` };
    }

    let query = `UPDATE ${NAME_TABLE_PLAYERS} SET 
      totalLosses = totalLosses + ?,
      totalGames = totalGames + 1
      WHERE username = ?`;
    const [result] = await connection.execute(query, [new Big(amount).neg().toString(), username]);

    if (result.affectedRows === 1) {
      return { success: true, message: `${nameServer}: Cập nhật lượt thua thành công. ✅` };
    } else {
      return { success: false, message: `${nameServer}: Cập nhật lượt thua thất bại. ❌` };
    }
  } catch (error) {
    console.error("Lỗi khi cập nhật lượt thua:", error);
    return { success: false, message: `${nameServer}: Đã xảy ra lỗi khi cập nhật lượt thua. ❌` };
  }
}

export async function updatePlayerBalance(idUser, amount, isWin = null, numAmountWin) {
  try {
    const [playerRows] = await connection.execute(`SELECT balance FROM ${NAME_TABLE_PLAYERS} WHERE idUserZalo = ?`, [
      idUser,
    ]);

    if (playerRows.length === 0) {
      return { success: false, message: `${nameServer}: Không tìm thấy người chơi. ❌` };
    }

    const oldBalance = new Big(playerRows[0].balance).round(0);
    const bigNumAmount = new Big(amount).round(0);
    const newBalance = oldBalance.plus(bigNumAmount);
    const numBalanceWin = numAmountWin ? new Big(numAmountWin) : new Big(0);
    const isSetWinPoint = numBalanceWin.gt(0) ? 1 : 0;

    let query = `UPDATE ${NAME_TABLE_PLAYERS} SET balance = ?`;
    let params = [newBalance.toString()];

    if (isWin !== null) {
      query += `, 
        totalWinnings = CASE WHEN ? > 0 THEN totalWinnings + ? ELSE totalWinnings END,
        totalLosses = CASE WHEN ? < 0 THEN totalLosses - ? ELSE totalLosses END,
        totalGames = totalGames + 1,
        totalWinGames = totalWinGames + ?`;

      const positiveAmount =
        isSetWinPoint && numAmountWin ? numBalanceWin.toString() : bigNumAmount.gt(0) ? bigNumAmount.toString() : "0";
      const negativeAmount =
        !isSetWinPoint && numAmountWin
          ? numBalanceWin.abs().toString()
          : bigNumAmount.lt(0)
          ? bigNumAmount.abs().toString()
          : "0";

      params.push(bigNumAmount.toString(), positiveAmount, bigNumAmount.toString(), negativeAmount, isWin ? 1 : 0);
    }

    query += ` WHERE idUserZalo = ?`;
    params.push(idUser);

    const [result] = await connection.execute(query, params);

    if (result.affectedRows === 1) {
      if (isWin !== null) {
        await connection.execute(
          `UPDATE ${NAME_TABLE_PLAYERS} 
          SET winRate = (totalWinGames / NULLIF(totalGames, 0)) * 100
          WHERE idUserZalo = ?`,
          [idUser]
        );
      }

      return {
        success: true,
        oldBalance: oldBalance.toString(),
        newBalance: newBalance.toString(),
      };
    } else {
      return { success: false, message: `${nameServer}: Cập nhật thất bại. ❌` };
    }
  } catch (error) {
    console.error("Lỗi khi cập nhật số dư:", error);
    return { success: false, message: `${nameServer}: Đã xảy ra lỗi khi cập nhật số dư. ❌` };
  }
}

export async function setPlayerBalance(idUser, amount) {
  try {
    const [rows] = await connection.execute(`SELECT * FROM ${NAME_TABLE_PLAYERS} WHERE idUserZalo = ?`, [idUser]);

    if (rows.length === 0) {
      return { success: false, message: `Zalo ID này chưa có hồ sơ game.` };
    }

    const newBalance = new Big(amount).round(0);

    const [updateResult] = await connection.execute(
      `UPDATE ${NAME_TABLE_PLAYERS} SET balance = ? WHERE idUserZalo = ?`,
      [newBalance.toString(), idUser]
    );

    if (updateResult.affectedRows === 1) {
      return {
        success: true,
        message: `Set tiền thành công: ${formatBigNumber(newBalance)} VNĐ!`,
      };
    } else {
      return { success: false, message: `Có lỗi xảy ra khi nhận quà.` };
    }
  } catch (error) {
    console.error("Lỗi khi set vnd cho người chơi:", error);
    return { success: false, message: `Đã xảy ra lỗi khi set vnd.` };
  }
}

export async function getPlayerBalance(idUser) {
  try {
    const [rows] = await connection.execute(`SELECT balance FROM ${NAME_TABLE_PLAYERS} WHERE idUserZalo = ?`, [idUser]);

    if (rows.length > 0) {
      const balance = new Big(rows[0].balance);
      return { success: true, balance: balance.toString() };
    } else {
      return {
        success: false,
        message: `Không thể lấy dữ liệu người chơi. Hãy thử lại lệnh game sau ít phút!`,
      };
    }
  } catch (error) {
    console.error("Lỗi khi lấy số dư người chơi:", error);
    return { success: false, message: `Đã xảy ra lỗi khi lấy số dư!` };
  }
}

export async function getPlayerInfo(idUserZalo) {
  try {
    const [rows] = await connection.execute(`SELECT * FROM ${NAME_TABLE_PLAYERS} WHERE idUserZalo = ?`, [idUserZalo]);

    if (rows.length > 0) {
      return rows[0];
    } else {
      return null;
    }
  } catch (error) {
    console.error("Lỗi khi lấy thông tin người chơi:", error);
    throw error;
  }
}

/** Hạng không còn tăng từ kết quả chơi game. Giữ hàm no-op để tương thích các mini game cũ. */
export async function addGameRankPoints(idUserZalo, { won = false, jackpot = false } = {}) {
  void idUserZalo; void won; void jackpot;
  return { success: true, points: 0 };
}

/** Đổi tiền trong ví game thành điểm hạng, có khóa lạc quan để tránh trừ tiền hai lần. */
export async function donateForRank(idUserZalo, amount) {
  const donation = new Big(amount).round(0, Big.roundDown);
  const points = Number(donation.div(10000).round(0, Big.roundDown).toString());
  if (points < 1) return { success: false, message: "Số tiền donenat tối thiểu là 10.000 VNĐ." };

  const charged = new Big(points).times(10000);
  try {
    const collection = connection.collection(NAME_TABLE_PLAYERS);
    for (let attempt = 0; attempt < 3; attempt++) {
      const player = await collection.findOne({ idUserZalo: String(idUserZalo) });
      if (!player) return { success: false, message: "Không tìm thấy hồ sơ game của bạn." };
      const oldBalance = new Big(player.balance || 0);
      if (oldBalance.lt(charged)) {
        return { success: false, message: `Số dư không đủ. Bạn chỉ có ${formatBigNumber(oldBalance)} VNĐ.` };
      }

      const oldPoints = Number(player.rankPoints || 0);
      const newBalance = oldBalance.minus(charged);
      const result = await collection.updateOne(
        { _id: player._id, balance: player.balance },
        { $set: { balance: newBalance.toString() }, $inc: { rankPoints: points } }
      );
      if (result.modifiedCount === 1) {
        return {
          success: true,
          charged: charged.toString(),
          points,
          oldPoints,
          newPoints: oldPoints + points,
          oldBalance: oldBalance.toString(),
          newBalance: newBalance.toString(),
        };
      }
    }
    return { success: false, message: "Số dư vừa thay đổi, vui lòng thử lại." };
  } catch (error) {
    console.error("Lỗi khi donenat đổi điểm hạng:", error);
    return { success: false, message: "Không thể donenat lúc này, vui lòng thử lại." };
  }
}

/** Chỉ nâng điểm lên mốc mới, tuyệt đối không hạ điểm/hạng hiện tại. */
export async function raisePlayerRank(idUserZalo, targetPoints) {
  try {
    const collection = connection.collection(NAME_TABLE_PLAYERS);
    const player = await collection.findOne({ idUserZalo: String(idUserZalo) });
    if (!player) return { success: false, message: "Người này chưa có hồ sơ game." };
    const oldPoints = Number(player.rankPoints || 0);
    const newPoints = Math.max(0, Math.trunc(Number(targetPoints) || 0));
    if (newPoints <= oldPoints) {
      return { success: false, message: "Người này đã ở hạng bằng hoặc cao hơn, lệnh nâng không thể hạ hạng." };
    }
    const result = await collection.updateOne(
      { _id: player._id, $or: [{ rankPoints: { $lt: newPoints } }, { rankPoints: { $exists: false } }] },
      { $set: { rankPoints: newPoints } }
    );
    if (result.modifiedCount !== 1) return { success: false, message: "Điểm hạng vừa thay đổi, vui lòng thử lại." };
    return { success: true, oldPoints, newPoints };
  } catch (error) {
    console.error("Lỗi khi admin nâng hạng game:", error);
    return { success: false, message: "Không thể nâng hạng lúc này." };
  }
}

export async function recordGameTransfer(transaction) {
  try {
    const collection = connection.collection("game_transactions");
    await collection.insertOne({
      referenceCode: String(transaction.referenceCode),
      senderId: String(transaction.senderId),
      senderName: String(transaction.senderName || transaction.senderId),
      receiverId: String(transaction.receiverId),
      receiverName: String(transaction.receiverName || transaction.receiverId),
      amount: new Big(transaction.amount).round(0).toString(),
      senderBalanceBefore: new Big(transaction.senderBalanceBefore).round(0).toString(),
      senderBalanceAfter: new Big(transaction.senderBalanceAfter).round(0).toString(),
      receiverBalanceBefore: new Big(transaction.receiverBalanceBefore).round(0).toString(),
      receiverBalanceAfter: new Big(transaction.receiverBalanceAfter).round(0).toString(),
      botId: String(transaction.botId),
      threadId: String(transaction.threadId),
      createdAt: transaction.createdAt instanceof Date ? transaction.createdAt : new Date(transaction.createdAt || Date.now()),
    });
    return { success: true };
  } catch (error) {
    console.error("Lỗi khi lưu lịch sử chuyển tiền game:", error);
    return { success: false };
  }
}

export async function getGameTransferHistory(idUserZalo, limit = 10) {
  try {
    const safeLimit = Math.max(1, Math.min(20, Number(limit) || 10));
    return await connection
      .collection("game_transactions")
      .find({ $or: [{ senderId: String(idUserZalo) }, { receiverId: String(idUserZalo) }] })
      .sort({ createdAt: -1 })
      .limit(safeLimit)
      .toArray();
  } catch (error) {
    console.error("Lỗi khi đọc lịch sử chuyển tiền game:", error);
    return [];
  }
}

export async function getAccountVND(username) {
  try {
    const [rows] = await connection.execute(`SELECT vnd FROM ${NAME_TABLE_ACCOUNT} WHERE username = ?`, [username]);

    if (rows.length > 0) {
      return rows[0].vnd;
    } else {
      return null;
    }
  } catch (error) {
    console.error("Lỗi khi lấy số dư VND của tài khoản:", error);
    throw error;
  }
}

export async function updateAccountVND(username, amount) {
  try {
    const [currentBalance] = await connection.execute(`SELECT vnd FROM ${NAME_TABLE_ACCOUNT} WHERE username = ?`, [
      username,
    ]);

    if (currentBalance.length === 0) {
      return { success: false, message: `${nameServer}: Không tìm thấy tài khoản!` };
    }

    const currentVND = new Big(currentBalance[0].vnd);
    const bigIntAmount = new Big(amount);
    const newBalance = currentVND.plus(bigIntAmount);

    const [result] = await connection.execute(`UPDATE ${NAME_TABLE_ACCOUNT} SET vnd = ? WHERE username = ?`, [
      newBalance.toString(),
      username,
    ]);

    if (result.affectedRows === 1) {
      return { success: true, message: `${nameServer}: Cập nhật số dư VND thành công. ✅` };
    } else {
      return { success: false, message: `${nameServer}: Cập nhật thất bại. ❌` };
    }
  } catch (error) {
    console.error("Lỗi khi cập nhật số dư VND của tài khoản:", error);
    return { success: false, message: `${nameServer}: Đã xảy ra lỗi khi cập nhật số dư VND!` };
  }
}

export async function getUsernameByIdZalo(idUserZalo) {
  try {
    const [rows] = await connection.execute(`SELECT username FROM ${NAME_TABLE_PLAYERS} WHERE idUserZalo = ?`, [
      idUserZalo,
    ]);
    return rows[0].username;
  } catch (error) {
    return null;
  }
}

export async function updatePlayerBalanceByUsername(username, amount, isWin = null, numAmountWin) {
  try {
    const [playerRows] = await connection.execute(`SELECT balance FROM ${NAME_TABLE_PLAYERS} WHERE username = ?`, [
      username,
    ]);

    if (playerRows.length === 0) {
      return { success: false, message: `${nameServer}: Không tìm thấy người chơi. ❌` };
    }

    const oldBalance = new Big(playerRows[0].balance);
    const bigNumAmount = new Big(amount);
    const newBalance = oldBalance.plus(bigNumAmount);
    const numBalanceWin = numAmountWin ? new Big(numAmountWin) : new Big(0);
    const isSetWinPoint = numBalanceWin.gt(0) ? 1 : 0;

    let query = `UPDATE ${NAME_TABLE_PLAYERS} SET balance = ?`;
    let params = [newBalance.toString()];

    if (isWin !== null) {
      query += `, 
        totalWinnings = CASE WHEN ? > 0 THEN totalWinnings + ? ELSE totalWinnings END,
        totalLosses = CASE WHEN ? < 0 THEN totalLosses - ? ELSE totalLosses END,
        totalGames = totalGames + 1,
        totalWinGames = totalWinGames + ?`;

      const positiveAmount =
        isSetWinPoint && numAmountWin ? numBalanceWin.toString() : bigNumAmount.gt(0) ? bigNumAmount.toString() : "0";
      const negativeAmount =
        !isSetWinPoint && numAmountWin
          ? numBalanceWin.abs().toString()
          : bigNumAmount.lt(0)
          ? bigNumAmount.abs().toString()
          : "0";

      params.push(bigNumAmount.toString(), positiveAmount, bigNumAmount.toString(), negativeAmount, isWin ? 1 : 0);
    }

    query += ` WHERE username = ?`;
    params.push(username);

    const [result] = await connection.execute(query, params);

    if (result.affectedRows === 1) {
      if (isWin !== null) {
        await connection.execute(
          `UPDATE ${NAME_TABLE_PLAYERS} 
          SET winRate = (totalWinGames / NULLIF(totalGames, 0)) * 100
          WHERE username = ?`,
          [username]
        );
      }

      return {
        success: true,
        oldBalance: oldBalance.toString(),
        newBalance: newBalance.toString(),
      };
    } else {
      return { success: false, message: `${nameServer}: Cập nhật thất bại. ❌` };
    }
  } catch (error) {
    console.error("Lỗi khi cập nhật số dư:", error);
    return { success: false, message: `${nameServer}: Đã xảy ra lỗi khi cập nhật số dư. ❌` };
  }
}
