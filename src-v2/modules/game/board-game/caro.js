const SIZE = 15;

function cellKey(x, y) { return `${x},${y}`; }
function boardMap(moves) { return new Map((moves || []).map((move) => [cellKey(move.x, move.y), move.symbol])); }

export function hasFive(moves, last) {
  const board = boardMap(moves);
  for (const [dx, dy] of [[1, 0], [0, 1], [1, 1], [1, -1]]) {
    let count = 1;
    for (const direction of [-1, 1]) {
      for (let step = 1; step < 5; step++) {
        if (board.get(cellKey(last.x + dx * step * direction, last.y + dy * step * direction)) !== last.symbol) break;
        count++;
      }
    }
    if (count >= 5) return true;
  }
  return false;
}

export function renderCaro(data) {
  if (!data.moves.length) return "Bàn cờ trống 15×15. Tọa độ từ 1 đến 15.";
  const xs = data.moves.map((move) => move.x);
  const ys = data.moves.map((move) => move.y);
  const minX = Math.max(1, Math.min(...xs) - 2), maxX = Math.min(SIZE, Math.max(...xs) + 2);
  const minY = Math.max(1, Math.min(...ys) - 2), maxY = Math.min(SIZE, Math.max(...ys) + 2);
  const board = boardMap(data.moves);
  const header = `   ${Array.from({ length: maxX - minX + 1 }, (_, index) => String(minX + index).padStart(2)).join(" ")}`;
  const rows = [];
  for (let y = minY; y <= maxY; y++) rows.push(`${String(y).padStart(2)} ${Array.from({ length: maxX - minX + 1 }, (_, index) => ` ${board.get(cellKey(minX + index, y)) || "·"}`).join(" ")}`);
  return [header, ...rows].join("\n");
}

export function registerCaroCommand(registry, { sessions }) {
  registry.register({
    name: "caro", category: "game", cooldownMs: 1_000, description: "Caro 15×15 cho hai người",
    async execute({ args, senderId, threadId, reply }) {
      const action = args[0]?.toLowerCase();
      if (action === "start") {
        await sessions.create(threadId, "caro", { creatorId: senderId, players: { X: senderId, O: null }, turn: "X", moves: [] }, 30 * 60_000);
        await reply("Đã tạo bàn Caro 15×15. Người thứ hai dùng !caro join."); return;
      }
      const session = await sessions.get(threadId, "caro");
      if (!session) { await reply("Chưa có bàn Caro. Dùng !caro start"); return; }
      if (action === "join") {
        if (session.data.players.X === senderId) { await reply("Bạn đã là người tạo bàn."); return; }
        if (session.data.players.O) { await reply("Bàn đã đủ hai người."); return; }
        await sessions.update(session, { ...session.data, players: { ...session.data.players, O: senderId } }, 30 * 60_000);
        await reply("Bạn đã vào bàn với quân O. Quân X đi trước: !caro move <x> <y>"); return;
      }
      if (["board", "status"].includes(action)) { await reply(renderCaro(session.data)); return; }
      if (action === "stop") {
        if (senderId !== session.data.creatorId && !Object.values(session.data.players).includes(senderId)) { await reply("Bạn không thuộc bàn này."); return; }
        await sessions.finish(session, "cancelled", { cancelledBy: senderId });
        await reply("Đã kết thúc bàn Caro."); return;
      }
      if (action !== "move") { await reply("Dùng: !caro start|join|move <x> <y>|board|stop"); return; }
      if (!session.data.players.O) { await reply("Đang chờ người thứ hai dùng !caro join."); return; }
      const symbol = session.data.players.X === senderId ? "X" : session.data.players.O === senderId ? "O" : null;
      if (!symbol) { await reply("Bạn không phải người chơi của bàn này."); return; }
      if (symbol !== session.data.turn) { await reply("Chưa tới lượt bạn."); return; }
      const x = Number(args[1]), y = Number(args[2]);
      if (!Number.isInteger(x) || !Number.isInteger(y) || x < 1 || x > SIZE || y < 1 || y > SIZE) { await reply("Tọa độ x, y phải từ 1 đến 15."); return; }
      if (session.data.moves.some((move) => move.x === x && move.y === y)) { await reply("Ô này đã có quân."); return; }
      const move = { x, y, symbol, userId: senderId, at: new Date() };
      const data = { ...session.data, moves: [...session.data.moves, move], turn: symbol === "X" ? "O" : "X" };
      if (hasFive(data.moves, move)) {
        await sessions.finish(session, "won", { winnerId: senderId, data });
        await reply(`${renderCaro(data)}\n${symbol} thắng với 5 quân liên tiếp!`); return;
      }
      if (data.moves.length === SIZE * SIZE) {
        await sessions.finish(session, "draw", { data });
        await reply(`${renderCaro(data)}\nBàn cờ hòa.`); return;
      }
      await sessions.update(session, data, 30 * 60_000);
      await reply(`${renderCaro(data)}\nLượt tiếp theo: ${data.turn}`);
    },
  });
}
