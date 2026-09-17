import fs from "fs/promises";
import path from "path";
import { createCanvas, loadImage, registerFont } from "canvas";

const ROLE_DIR = path.join(process.cwd(), "assets", "resources", "game", "masoi", "roles");
const TEMP_DIR = path.join(process.cwd(), "assets", "temp");
const FONT_BOLD = path.join(process.cwd(), "assets", "fonts", "BeVietnamPro-Bold.ttf");
const FONT_TEXT = path.join(process.cwd(), "assets", "fonts", "NotoSans-Regular.ttf");

try {
  registerFont(FONT_BOLD, { family: "BeVietnamPro" });
  registerFont(FONT_TEXT, { family: "NotoSans" });
} catch {}

export const MA_SOI_ROLE_CARDS = {
  villager: "danlang.png",
  fakeWolf: "nguoigiasoi.png",
  guard: "baove.png",
  seer: "tientri.png",
  wolf: "soi.png",
  alphaWolf: "soinguyen.png",
  wolfWitch: "soiphuthuy.png",
  witch: "phuthuy.png",
  hunter: "thosan.png",
  cupid: "thantinhyeu.png",
  clone: "nhanban.png",
  cultLeader: "truonggiaophai.png",
};

const ROLE_THEME = {
  villager: ["#123a2b", "#06150f"],
  fakeWolf: ["#3d3421", "#100d08"],
  guard: ["#123456", "#071422"],
  seer: ["#2a1d59", "#100b2d"],
  wolf: ["#4a1015", "#110305"],
  alphaWolf: ["#3b164f", "#12051b"],
  wolfWitch: ["#4a102f", "#15040d"],
  witch: ["#442052", "#120717"],
  hunter: ["#493c15", "#151104"],
  cupid: ["#54233f", "#180912"],
  clone: ["#21494f", "#07181b"],
  cultLeader: ["#46340f", "#130d04"],
};

const ROLE_META = {
  fakeWolf: {
    title: "NGƯỜI GIẢ SÓI",
    faction: "PHE DÂN LÀNG",
    note: "Không có kỹ năng ban đêm. Nếu bị Tiên tri soi, bạn sẽ hiện là Sói và thuộc phe Sói.",
    icon: "star",
  },
  cupid: {
    title: "THẦN TÌNH YÊU",
    faction: "PHE DÂN LÀNG",
    note: "Đêm đầu nhập 1 số để ghép với mình, hoặc 2 số để ghép đôi hai người khác. Một người chết, người kia chết theo.",
    icon: "heartArrow",
  },
  clone: {
    title: "NHÂN BẢN",
    faction: "PHE DÂN LÀNG",
    note: "Nếu chưa chọn mục tiêu, mỗi đêm được chọn 1 người khác. Khi người đó chết, bạn nhận được kỹ năng của họ.",
    icon: "star",
  },
  wolfWitch: {
    title: "SÓI PHÙ THỦY",
    faction: "PHE SÓI",
    note: "Không thể cắn người. Có thể soi để tìm Tiên tri và truyền tin riêng cho bầy Sói.",
    icon: "star",
  },
  cultLeader: {
    title: "TRƯỞNG GIÁO PHÁI",
    faction: "PHE THỨ 3",
    note: "Cách 1 đêm chọn 1 người vào giáo phái. Thành viên giáo phái không thể chọn thêm người.",
    icon: "star",
  },
};

export async function getMaSoiRoleCard(roleKey, playerName = "", avatar = "") {
  const fileName = MA_SOI_ROLE_CARDS[roleKey];
  if (!fileName) return null;

  const assetPath = path.join(ROLE_DIR, fileName);
  try {
    await fs.access(assetPath);
    return createMaSoiRoleCardFromAsset(assetPath, roleKey, playerName, avatar);
  } catch {
    return createMaSoiRoleCard(roleKey, playerName, null, avatar);
  }
}

export async function ensureMaSoiCupidCard() {
  const filePath = path.join(ROLE_DIR, MA_SOI_ROLE_CARDS.cupid);
  try {
    await fs.access(filePath);
    return filePath;
  } catch {
    await fs.mkdir(ROLE_DIR, { recursive: true });
    return createMaSoiRoleCard("cupid", "Nguyễn Chí Hướng", filePath);
  }
}

export async function createMaSoiRoleCard(roleKey, playerName = "", outputPath = null, avatar = "") {
  const meta = ROLE_META[roleKey] || {
    title: roleKey.toUpperCase(),
    faction: "PHE DÂN LÀNG",
    note: "Vai trò trong game Ma Sói.",
    icon: "star",
  };
  const width = 500;
  const height = 760;
  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext("2d");
  const [top, bottom] = ROLE_THEME[roleKey] || ROLE_THEME.villager;

  const bg = ctx.createLinearGradient(0, 0, 0, height);
  bg.addColorStop(0, top);
  bg.addColorStop(1, bottom);
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, width, height);

  drawStars(ctx, width, height);
  drawFrame(ctx, width, height);
  drawCompass(ctx, width / 2, 310, 170);

  ctx.fillStyle = "#ead58d";
  ctx.font = "bold 20px BeVietnamPro";
  ctx.textAlign = "center";
  ctx.fillText("THẺ VAI", width / 2, 104);

  drawRoleSymbol(ctx, meta.icon, width / 2, 258);
  await drawPlayerAvatar(ctx, width / 2, 430, avatar, playerName || "Player", 108);
  drawNamePlate(ctx, playerName || "Người chơi", width / 2, 535);

  const titleSize = meta.title.length > 14 ? 38 : 48;
  drawGoldText(ctx, meta.title, width / 2, 600, titleSize);
  drawFactionPill(ctx, meta.faction, width / 2, 636);
  drawNoteBox(ctx, meta.note, 78, 666, width - 156, 90);

  const finalPath = outputPath || path.join(TEMP_DIR, `masoi_${roleKey}_${Date.now()}.png`);
  await fs.mkdir(path.dirname(finalPath), { recursive: true });
  await fs.writeFile(finalPath, canvas.toBuffer("image/png"));
  return finalPath;
}

async function createMaSoiRoleCardFromAsset(assetPath, roleKey, playerName = "", avatar = "") {
  const template = await loadImage(assetPath);
  const width = template.width;
  const height = template.height;
  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext("2d");
  ctx.drawImage(template, 0, 0, width, height);

  const name = playerName || "Player";
  await drawPlayerAvatar(ctx, width / 2, getRoleCardAvatarY(roleKey, height), avatar, name, 150);
  drawNamePlate(ctx, name, width / 2, getRoleCardNameY(roleKey, height));

  const finalPath = path.join(TEMP_DIR, `masoi_role_${roleKey}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}.png`);
  await fs.mkdir(TEMP_DIR, { recursive: true });
  await fs.writeFile(finalPath, canvas.toBuffer("image/png"));
  return finalPath;
}

function getRoleCardAvatarY(roleKey, height) {
  if (roleKey === "alphaWolf") return 432;
  if (roleKey === "wolf") return 430;
  return Math.min(430, Math.round(height * 0.565));
}

function getRoleCardNameY(roleKey, height) {
  if (roleKey === "alphaWolf" || roleKey === "wolf") return 535;
  return Math.min(535, Math.round(height * 0.703));
}

export async function createMaSoiLobbyImage(players, roomCode = "") {
  const width = 760;
  const height = 360;
  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext("2d");
  drawPanelBackground(ctx, width, height, "#191231", "#070511");
  drawFrame(ctx, width, height);

  roundRect(ctx, width / 2 - 142, 24, 284, 44, 10);
  ctx.fillStyle = "rgba(13,9,23,0.92)";
  ctx.fill();
  ctx.strokeStyle = "#f0d98a";
  ctx.lineWidth = 2;
  ctx.stroke();

  drawGoldText(ctx, "SẢNH MA SÓI", width / 2, 47, 25);

  roundRect(ctx, width - 186, 70, 128, 24, 12);
  ctx.fillStyle = "rgba(26,19,32,0.82)";
  ctx.fill();
  ctx.strokeStyle = "rgba(240,217,138,0.74)";
  ctx.lineWidth = 1.4;
  ctx.stroke();
  ctx.fillStyle = "rgba(255,235,169,0.72)";
  ctx.font = "bold 10px BeVietnamPro";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(`${players.length}/16 người chơi`, width - 122, 83);

  ctx.textAlign = "center";
  const max = 16;
  const startX = 88;
  const startY = 122;
  const gapX = 82;
  const gapY = 96;
  for (let i = 0; i < max; i += 1) {
    const row = Math.floor(i / 8);
    const col = i % 8;
    const x = startX + col * gapX;
    const y = startY + row * gapY;
    const player = players[i];
    if (player) {
      await drawMiniPlayer(ctx, x, y, player, i + 1);
    } else {
      drawEmptySlot(ctx, x, y, i + 1);
    }
  }

  roundRect(ctx, width / 2 - 150, height - 68, 300, 56, 8);
  ctx.fillStyle = "rgba(16,12,14,0.94)";
  ctx.fill();
  ctx.strokeStyle = "#d4b76d";
  ctx.lineWidth = 2;
  ctx.stroke();
  ctx.fillStyle = "#e6c36e";
  ctx.font = "bold 12px BeVietnamPro";
  ctx.textBaseline = "middle";
  ctx.fillText("MÃ PHÒNG", width / 2, height - 49);
  ctx.fillStyle = "#fff0b8";
  ctx.font = "bold 30px BeVietnamPro";
  ctx.fillText(String(roomCode || "0000"), width / 2, height - 24);

  return writeMaSoiPublicImage(`masoi_lobby_${Date.now()}.png`, canvas);
}

export async function createMaSoiResultImage(room, winnerTeam, reason = "") {
  const players = Object.values(room.players);
  const width = 760;
  const compact = players.length > 10;
  const columns = compact ? 8 : players.length <= 6 ? players.length : Math.min(5, Math.ceil(players.length / 2));
  const rows = Math.ceil(players.length / columns);
  const gapX = compact ? 84 : 116;
  const gapY = compact ? 110 : 122;
  const startY = compact ? 178 : rows > 1 ? 172 : 176;
  const footerY = startY + (rows - 1) * gapY + (compact ? 76 : 84);
  const height = Math.max(330, footerY + 46);
  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext("2d");
  const villageWin = winnerTeam === "village";
  const cultWin = winnerTeam === "cult";
  const coupleWin = winnerTeam === "couple";
  drawPanelBackground(ctx, width, height, villageWin ? "#123623" : cultWin ? "#6b4a08" : coupleWin ? "#5b123b" : "#4b1010", "#070507");
  drawFrame(ctx, width, height);

  ctx.textAlign = "center";
  drawCrownOrWolf(ctx, width / 2, 46, villageWin || cultWin || coupleWin);
  const title = villageWin ? "DÂN LÀNG CHIẾN THẮNG" : cultWin ? "PHE THỨ 3 THẮNG" : coupleWin ? "PHE CẶP ĐÔI THẮNG" : "BẦY SÓI KHẢI HOÀN";
  drawGoldText(ctx, title, width / 2, 88, 30);
  ctx.fillStyle = "#f0d98a";
  ctx.font = "bold 12px BeVietnamPro";
  ctx.fillText(villageWin ? "Ánh sáng đẩy lùi bầy sói" : cultWin ? "Giáo phái bao phủ ngôi làng" : coupleWin ? "Tình yêu sống sót đến phút cuối" : "Bóng tối nuốt trọn ngôi làng", width / 2, 112);

  const startX = (width - ((columns - 1) * gapX)) / 2;
  for (const [index, player] of players.entries()) {
    const row = Math.floor(index / columns);
    const col = index % columns;
    if (compact) {
      await drawCompactResultPlayer(ctx, startX + col * gapX, startY + row * gapY, player, index + 1);
    } else {
      await drawResultPlayer(ctx, startX + col * gapX, startY + row * gapY, player, index + 1);
    }
  }

  const footer = reason || (villageWin ? "Dân làng đã treo cổ hết bầy sói" : cultWin ? "Phe thứ 3 đã kéo mọi người vào giáo phái" : coupleWin ? "Cặp đôi là 2 người cuối cùng" : "Bầy sói toàn thắng");
  roundRect(ctx, width / 2 - 205, height - 32, 410, 22, 4);
  ctx.fillStyle = "rgba(28,20,13,0.86)";
  ctx.fill();
  ctx.strokeStyle = "#d4b76d";
  ctx.stroke();
  ctx.fillStyle = "#f8e4a0";
  ctx.font = "bold 12px BeVietnamPro";
  ctx.fillText(footer.slice(0, 68), width / 2, height - 16);

  return writeMaSoiPublicImage(`masoi_result_${winnerTeam}_${Date.now()}.png`, canvas);
}

export async function createMaSoiNightImage(room) {
  const players = Object.values(room.players);
  const width = 760;
  const columns = 4;
  const cardW = 158;
  const cardH = 110;
  const gapX = 26;
  const gapY = 22;
  const rows = Math.ceil(players.length / columns);
  const height = Math.max(430, 118 + rows * cardH + (rows - 1) * gapY + 56);
  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext("2d");

  drawPanelBackground(ctx, width, height, "#1a1028", "#070713");
  drawNightGlow(ctx, width, height);
  drawNeonFrame(ctx, width, height);

  ctx.textAlign = "center";
  drawGoldText(ctx, `ĐÊM ${room.day}`, width / 2, 48, 34);
  ctx.fillStyle = "#f3e4d1";
  ctx.font = "bold 13px BeVietnamPro";
  ctx.fillText("Các vai năng lực mở tin nhắn riêng để hành động", width / 2, 72);

  const startX = (width - (columns * cardW + (columns - 1) * gapX)) / 2;
  const startY = 102;
  for (const [index, player] of players.entries()) {
    const row = Math.floor(index / columns);
    const col = index % columns;
    await drawNightPlayerCard(ctx, startX + col * (cardW + gapX), startY + row * (cardH + gapY), cardW, cardH, player, index + 1);
  }

  ctx.fillStyle = "rgba(255,230,190,0.86)";
  ctx.font = "bold 12px BeVietnamPro";
  ctx.fillText("Yên lặng đợi sói cắn...", width / 2, height - 28);

  return writeMaSoiPublicImage(`masoi_night_${room.day}_${Date.now()}.png`, canvas);
}

export async function createMaSoiDayImage(room, deaths = []) {
  const players = Object.values(room.players);
  const width = 760;
  const columns = 4;
  const cardW = 158;
  const cardH = 110;
  const gapX = 26;
  const gapY = 22;
  const rows = Math.ceil(players.length / columns);
  const height = Math.max(430, 130 + rows * cardH + (rows - 1) * gapY + 60);
  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext("2d");

  drawPanelBackground(ctx, width, height, "#18334a", "#070713");
  drawDayGlow(ctx, width, height);
  drawNeonFrame(ctx, width, height);

  ctx.textAlign = "center";
  drawGoldText(ctx, `TRỜI SÁNG - NGÀY ${room.day}`, width / 2, 48, 30);
  ctx.fillStyle = "#f3e4d1";
  ctx.font = "bold 13px BeVietnamPro";
  ctx.fillText(formatDayImageDeaths(room, deaths), width / 2, 74);

  const startX = (width - (columns * cardW + (columns - 1) * gapX)) / 2;
  const startY = 112;
  for (const [index, player] of players.entries()) {
    const row = Math.floor(index / columns);
    const col = index % columns;
    await drawNightPlayerCard(ctx, startX + col * (cardW + gapX), startY + row * (cardH + gapY), cardW, cardH, player, index + 1);
  }

  ctx.fillStyle = "rgba(255,230,190,0.86)";
  ctx.font = "bold 12px BeVietnamPro";
  ctx.fillText("Ban ngày thảo luận và bỏ phiếu treo cổ", width / 2, height - 28);

  return writeMaSoiPublicImage(`masoi_day_${room.day}_${Date.now()}.png`, canvas);
}

export async function createMaSoiTrialImage(room, result = {}) {
  const width = 800;
  const height = 410;
  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext("2d");
  const voteRows = normalizeTrialVoteRows(room, result);
  const skipCount = Number(result.skipCount || 0);
  const totalVotes = Number(result.totalVotes || voteRows.reduce((sum, row) => sum + row.count, 0) + skipCount);
  const playerName = result.targetName || "Không ai";
  const lynched = Boolean(result.lynched);

  drawPanelBackground(ctx, width, height, "#3d0714", "#09020a");
  drawTrialGlow(ctx, width, height);
  drawOrnateTrialFrame(ctx, width, height);

  ctx.textAlign = "center";
  drawGoldText(ctx, `PHIÊN TÒA · NGÀY ${room.day}`, width / 2, 62, 42);
  ctx.fillStyle = "#f1d990";
  ctx.font = "bold 18px BeVietnamPro";
  ctx.fillText(totalVotes ? `${totalVotes} lá phiếu định mệnh` : "Không có phán quyết", width / 2, 104);

  const rowH = 58;
  const rowGap = 12;
  const hasSkip = skipCount > 0;
  const visibleRows = voteRows.slice(0, hasSkip ? 2 : 4);
  let y = hasSkip ? (visibleRows.length >= 2 ? 148 : 176) : (visibleRows.length >= 3 ? 136 : visibleRows.length === 2 ? 162 : 176);
  const barX = 58;
  const barW = width - 116;
  for (const row of visibleRows) {
    const isKilled = lynched && row.id === result.targetId;
    drawTrialVoteRow(ctx, barX, y, barW, rowH, row.name, row.count, isKilled);
    y += rowH + rowGap;
  }
  let outcomeY = 326;
  if (hasSkip) {
    drawTrialSkipRow(ctx, width / 2, y, skipCount);
    outcomeY = visibleRows.length >= 2 ? 362 : 326;
  }

  ctx.fillStyle = lynched ? "#ffe8e8" : "#f4dfb4";
  ctx.font = "bold 30px BeVietnamPro";
  ctx.textAlign = "center";
  ctx.fillText(
    lynched ? `${trimName(playerName, 24)} BỊ TREO CỔ` : "HÒA PHIẾU · KHÔNG AI BỊ TREO",
    width / 2,
    outcomeY
  );

  const filePath = `masoi_trial_${room.day}_${Date.now()}.png`;
  return writeMaSoiPublicImage(filePath, canvas);
}

export async function createMaSoiTopImage(entries = []) {
  const width = 800;
  const height = 520;
  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext("2d");
  drawPanelBackground(ctx, width, height, "#210719", "#05040b");
  drawNightGlow(ctx, width, height);
  drawOrnateTrialFrame(ctx, width, height);

  ctx.textAlign = "center";
  drawGoldText(ctx, "BẢNG TOP MA SÓI", width / 2, 58, 38);
  ctx.fillStyle = "#f1d990";
  ctx.font = "bold 17px BeVietnamPro";
  ctx.fillText("Những người sống sót và chiến thắng nhiều nhất", width / 2, 92);

  const rows = entries.slice(0, 10);
  const startY = 118;
  const rowH = 31;
  const rowGap = 5;
  const x = 54;
  const w = width - 108;
  for (const [index, item] of rows.entries()) {
    const y = startY + index * (rowH + rowGap);
    drawTopRow(ctx, x, y, w, rowH, item, index + 1);
  }

  if (!rows.length) {
    ctx.fillStyle = "#f7e7bd";
    ctx.font = "bold 24px BeVietnamPro";
    ctx.fillText("Chưa có ai ghi điểm", width / 2, height / 2);
  }
  return writeMaSoiPublicImage(`masoi_top_${Date.now()}.png`, canvas);
}

function drawTopRow(ctx, x, y, w, h, item, rank) {
  roundRect(ctx, x, y, w, h, 7);
  const grad = ctx.createLinearGradient(x, 0, x + w, 0);
  if (rank === 1) {
    grad.addColorStop(0, "rgba(121,74,15,0.94)");
    grad.addColorStop(1, "rgba(238,197,82,0.95)");
  } else if (rank === 2) {
    grad.addColorStop(0, "rgba(72,70,76,0.94)");
    grad.addColorStop(1, "rgba(196,204,214,0.92)");
  } else if (rank === 3) {
    grad.addColorStop(0, "rgba(92,48,25,0.94)");
    grad.addColorStop(1, "rgba(201,126,68,0.92)");
  } else {
    grad.addColorStop(0, "rgba(45,24,33,0.9)");
    grad.addColorStop(1, "rgba(92,39,54,0.86)");
  }
  ctx.fillStyle = grad;
  ctx.shadowColor = rank <= 3 ? "rgba(255,214,117,0.35)" : "rgba(0,0,0,0)";
  ctx.shadowBlur = rank <= 3 ? 10 : 0;
  ctx.fill();
  ctx.shadowBlur = 0;
  ctx.strokeStyle = "rgba(240,217,138,0.58)";
  ctx.lineWidth = 1.2;
  ctx.stroke();

  ctx.fillStyle = "#fff5db";
  ctx.textBaseline = "middle";
  ctx.textAlign = "center";
  ctx.font = "bold 17px BeVietnamPro";
  ctx.fillText(rank <= 3 ? ["🥇", "🥈", "🥉"][rank - 1] : String(rank), x + 28, y + h / 2 + 1);

  ctx.textAlign = "left";
  ctx.font = "bold 16px BeVietnamPro";
  ctx.fillText(trimName(item.name || "Không rõ", 26), x + 62, y + h / 2 + 1);

  ctx.textAlign = "right";
  ctx.font = "bold 16px BeVietnamPro";
  ctx.fillText(`${item.score || 0} điểm`, x + w - 22, y + h / 2 + 1);

  ctx.font = "bold 12px BeVietnamPro";
  ctx.fillStyle = "rgba(255,245,219,0.78)";
  ctx.fillText(`${item.wins || 0} thắng`, x + w - 112, y + h / 2 + 1);
}

function normalizeTrialVoteRows(room, result) {
  if (Array.isArray(result.voteRows) && result.voteRows.length) {
    return result.voteRows
      .map((row) => ({ id: row.id, name: row.name || room.players?.[row.id]?.name || "Không rõ", count: Number(row.count || 0) }))
      .filter((row) => row.count > 0)
      .sort((a, b) => b.count - a.count);
  }
  const voteCount = Number(result.voteCount || 0);
  if (!voteCount) return [];
  return [{ id: result.targetId || "", name: result.targetName || "Không ai", count: voteCount }];
}

function drawTrialVoteRow(ctx, x, y, w, h, name, count, danger) {
  roundRect(ctx, x, y, w, h, 11);
  const grad = ctx.createLinearGradient(x, 0, x + w, 0);
  if (danger) {
    grad.addColorStop(0, "rgba(94,18,20,0.95)");
    grad.addColorStop(0.55, "rgba(188,22,32,0.97)");
    grad.addColorStop(1, "rgba(255,80,86,0.98)");
  } else {
    grad.addColorStop(0, "rgba(123,86,20,0.94)");
    grad.addColorStop(0.55, "rgba(188,139,38,0.96)");
    grad.addColorStop(1, "rgba(245,203,92,0.98)");
  }
  ctx.fillStyle = grad;
  ctx.shadowColor = danger ? "rgba(255,56,72,0.55)" : "rgba(255,215,105,0.45)";
  ctx.shadowBlur = 16;
  ctx.fill();
  ctx.shadowBlur = 0;
  ctx.strokeStyle = danger ? "rgba(255,116,116,0.58)" : "rgba(255,239,170,0.64)";
  ctx.lineWidth = 1.5;
  ctx.stroke();

  ctx.fillStyle = "#fff7e8";
  ctx.font = "bold 21px BeVietnamPro";
  ctx.textAlign = "left";
  ctx.textBaseline = "middle";
  ctx.fillText(trimName(name, 32), x + 22, y + h / 2 + 1);

  ctx.beginPath();
  ctx.arc(x + w - 30, y + h / 2, 18, 0, Math.PI * 2);
  ctx.fillStyle = "#160b10";
  ctx.fill();
  ctx.strokeStyle = "#ffe9c2";
  ctx.lineWidth = 2;
  ctx.stroke();
  ctx.fillStyle = "#fff7e8";
  ctx.font = "bold 23px BeVietnamPro";
  ctx.textAlign = "center";
  ctx.fillText(String(count), x + w - 30, y + h / 2 + 1);
}

function drawTrialSkipRow(ctx, centerX, y, count) {
  const w = 280;
  const h = 32;
  const x = centerX - w / 2;
  roundRect(ctx, x, y, w, h, 6);
  ctx.fillStyle = "rgba(28,16,18,0.88)";
  ctx.fill();
  ctx.strokeStyle = "#f0d98a";
  ctx.lineWidth = 2;
  ctx.stroke();
  ctx.fillStyle = "#fff7e8";
  ctx.font = "bold 17px BeVietnamPro";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(`PHIẾU TRẮNG · ${count}`, centerX, y + h / 2 + 1);
  ctx.fillStyle = "#b8872c";
  ctx.beginPath();
  ctx.moveTo(x - 12, y + h / 2);
  ctx.lineTo(x - 3, y + 3);
  ctx.lineTo(x - 3, y + h - 3);
  ctx.closePath();
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(x + w + 12, y + h / 2);
  ctx.lineTo(x + w + 3, y + 3);
  ctx.lineTo(x + w + 3, y + h - 3);
  ctx.closePath();
  ctx.fill();
}

function drawTrialGlow(ctx, width, height) {
  const glow = ctx.createRadialGradient(width / 2, 210, 20, width / 2, 210, 310);
  glow.addColorStop(0, "rgba(255,210,120,0.18)");
  glow.addColorStop(0.45, "rgba(224,30,44,0.12)");
  glow.addColorStop(1, "rgba(224,30,44,0)");
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, width, height);
}

function drawOrnateTrialFrame(ctx, width, height) {
  ctx.save();
  ctx.strokeStyle = "#f0d98a";
  ctx.lineWidth = 4;
  roundRect(ctx, 18, 18, width - 36, height - 36, 16);
  ctx.stroke();
  ctx.lineWidth = 1.4;
  ctx.strokeStyle = "rgba(255,246,195,0.86)";
  roundRect(ctx, 28, 28, width - 56, height - 56, 12);
  ctx.stroke();
  ctx.fillStyle = "#f0d98a";
  for (const [x, y] of [
    [36, 36],
    [width - 36, 36],
    [36, height - 36],
    [width - 36, height - 36],
    [width / 2, 30],
    [width / 2, height - 30],
  ]) {
    ctx.beginPath();
    ctx.arc(x, y, 4, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

async function writeMaSoiPublicImage(fileName, canvas) {
  const filePath = path.join(TEMP_DIR, fileName);
  await fs.mkdir(TEMP_DIR, { recursive: true });
  await fs.writeFile(filePath, canvas.toBuffer("image/png"));
  return filePath;
}

function drawPanelBackground(ctx, width, height, top, bottom) {
  const bg = ctx.createLinearGradient(0, 0, 0, height);
  bg.addColorStop(0, top);
  bg.addColorStop(1, bottom);
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, width, height);
  drawStars(ctx, width, height);
}

function drawDayGlow(ctx, width, height) {
  const sun = ctx.createRadialGradient(width - 150, 74, 10, width - 150, 74, 118);
  sun.addColorStop(0, "rgba(255,244,190,0.86)");
  sun.addColorStop(0.22, "rgba(255,178,88,0.46)");
  sun.addColorStop(1, "rgba(255,178,88,0)");
  ctx.fillStyle = sun;
  ctx.beginPath();
  ctx.arc(width - 150, 74, 118, 0, Math.PI * 2);
  ctx.fill();

  const haze = ctx.createRadialGradient(width / 2, height / 2, 40, width / 2, height / 2, width / 2);
  haze.addColorStop(0, "rgba(255,210,120,0.10)");
  haze.addColorStop(1, "rgba(255,210,120,0)");
  ctx.fillStyle = haze;
  ctx.fillRect(0, 0, width, height);
}

function drawEmptySlot(ctx, x, y, index) {
  ctx.setLineDash([3, 5]);
  ctx.strokeStyle = "rgba(224,190,105,0.42)";
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.arc(x, y, 26, 0, Math.PI * 2);
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.fillStyle = "rgba(224,190,105,0.36)";
  ctx.font = "bold 15px BeVietnamPro";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(String(index), x, y);
}

function formatDayImageDeaths(room, deaths) {
  if (!deaths.length) return "Đêm qua không ai chết";
  const names = deaths.map((death) => {
    const player = room.players[death.id];
    return `${player?.name || "Một người chơi"} - ${getRoleName(player?.role)}`;
  });
  if (names.length <= 2) return `Người chết: ${names.join(", ")}`;
  return `Người chết: ${names.slice(0, 2).join(", ")} và ${names.length - 2} người khác`;
}

function drawNightGlow(ctx, width, height) {
  const moon = ctx.createRadialGradient(width - 150, 72, 8, width - 150, 72, 92);
  moon.addColorStop(0, "rgba(255,255,255,0.72)");
  moon.addColorStop(0.18, "rgba(255,100,92,0.55)");
  moon.addColorStop(1, "rgba(255,60,70,0)");
  ctx.fillStyle = moon;
  ctx.beginPath();
  ctx.arc(width - 150, 72, 95, 0, Math.PI * 2);
  ctx.fill();

  const haze = ctx.createRadialGradient(width / 2, height / 2, 40, width / 2, height / 2, width / 2);
  haze.addColorStop(0, "rgba(255,64,88,0.12)");
  haze.addColorStop(1, "rgba(255,64,88,0)");
  ctx.fillStyle = haze;
  ctx.fillRect(0, 0, width, height);
}

function drawNeonFrame(ctx, width, height) {
  roundRect(ctx, 12, 12, width - 24, height - 24, 12);
  ctx.strokeStyle = "rgba(255,82,100,0.8)";
  ctx.lineWidth = 3;
  ctx.shadowColor = "#ff5d71";
  ctx.shadowBlur = 14;
  ctx.stroke();
  ctx.shadowBlur = 0;
}

async function drawNightPlayerCard(ctx, x, y, w, h, player, index) {
  const avatar = await loadAvatarImage(player.avatar);
  const cx = x + w / 2;
  const avatarY = y + 36;
  const alive = player.alive;

  ctx.save();
  roundRect(ctx, x, y, w, h, 8);
  ctx.fillStyle = alive ? "rgba(42,38,54,0.88)" : "rgba(35,34,42,0.78)";
  ctx.fill();
  ctx.strokeStyle = alive ? "rgba(255,88,104,0.58)" : "rgba(135,135,148,0.45)";
  ctx.lineWidth = 1.5;
  ctx.stroke();

  ctx.shadowColor = alive ? "#ff5367" : "#8c8c96";
  ctx.shadowBlur = alive ? 18 : 4;
  ctx.beginPath();
  ctx.arc(cx, avatarY, 33, 0, Math.PI * 2);
  ctx.fillStyle = "#1b1419";
  ctx.fill();
  ctx.strokeStyle = alive ? "#ff5a66" : "#8e8e98";
  ctx.lineWidth = 4;
  ctx.stroke();
  ctx.shadowBlur = 0;

  if (avatar) {
    drawCircleImage(ctx, avatar, cx, avatarY, 58);
  } else {
    ctx.fillStyle = "#f6ddb0";
    ctx.font = "bold 24px BeVietnamPro";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(initials(player.name), cx, avatarY + 1);
  }

  if (!alive) {
    drawDeathMark(ctx, cx, avatarY, 31);
  }

  ctx.beginPath();
  ctx.arc(x + 19, y + 18, 13, 0, Math.PI * 2);
  ctx.fillStyle = alive ? "#e8404f" : "#5f626e";
  ctx.fill();
  ctx.strokeStyle = "#ffd2d5";
  ctx.lineWidth = 1.4;
  ctx.stroke();
  ctx.fillStyle = "#ffffff";
  ctx.font = "bold 11px BeVietnamPro";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(String(index), x + 19, y + 18);

  ctx.fillStyle = alive ? "#f4f0f0" : "#a7a7ad";
  ctx.font = "bold 13px BeVietnamPro";
  ctx.fillText(trimName(player.name, 16), cx, y + 77);

  roundRect(ctx, cx - 34, y + 86, 68, 17, 8);
  ctx.fillStyle = alive ? "rgba(33,37,46,0.92)" : "rgba(70,28,35,0.92)";
  ctx.fill();
  ctx.strokeStyle = alive ? "rgba(220,220,230,0.22)" : "rgba(255,100,110,0.5)";
  ctx.stroke();
  ctx.fillStyle = alive ? "#dbdce2" : "#ffd0d4";
  ctx.font = "bold 9px BeVietnamPro";
  ctx.fillText(alive ? "Còn sống" : "Đã chết", cx, y + 95);
  ctx.restore();
}

function drawDeathMark(ctx, x, y, radius) {
  ctx.save();
  ctx.strokeStyle = "#ff1f38";
  ctx.lineWidth = 8;
  ctx.lineCap = "round";
  ctx.shadowColor = "#ff5064";
  ctx.shadowBlur = 10;
  ctx.beginPath();
  ctx.moveTo(x - radius, y - radius);
  ctx.lineTo(x + radius, y + radius);
  ctx.moveTo(x + radius, y - radius);
  ctx.lineTo(x - radius, y + radius);
  ctx.stroke();
  ctx.restore();
}

async function drawMiniPlayer(ctx, x, y, player, index) {
  const name = player?.name || "Player";
  const avatar = await loadAvatarImage(player?.avatar);
  ctx.save();
  ctx.beginPath();
  ctx.arc(x, y, 29, 0, Math.PI * 2);
  ctx.fillStyle = "#4b3418";
  ctx.fill();
  ctx.lineWidth = 3;
  ctx.strokeStyle = "#f0d98a";
  ctx.stroke();
  if (avatar) {
    drawCircleImage(ctx, avatar, x, y, 52);
  } else {
    ctx.fillStyle = "#fff1bd";
    ctx.font = "bold 21px BeVietnamPro";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(initials(name), x, y + 1);
  }
  ctx.fillStyle = "#231915";
  roundRect(ctx, x - 39, y + 35, 78, 20, 4);
  ctx.fill();
  ctx.strokeStyle = "#d7b86d";
  ctx.stroke();
  ctx.fillStyle = "#ffe9ad";
  ctx.font = "bold 9px BeVietnamPro";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(trimName(name, 13), x, y + 45);
  ctx.beginPath();
  ctx.arc(x - 23, y - 23, 10, 0, Math.PI * 2);
  ctx.fillStyle = "#31261d";
  ctx.fill();
  ctx.strokeStyle = "#d7b86d";
  ctx.stroke();
  ctx.fillStyle = "#fff0bf";
  ctx.font = "bold 10px BeVietnamPro";
  ctx.fillText(String(index), x - 23, y - 23);
  ctx.restore();
}

async function drawResultPlayer(ctx, x, y, player, index) {
  const roleName = getRoleName(player.role);
  const alive = player.alive;
  const avatar = await loadAvatarImage(player.avatar);
  ctx.save();
  roundRect(ctx, x - 48, y - 48, 96, 116, 6);
  ctx.fillStyle = alive ? "rgba(25,38,26,0.9)" : "rgba(42,39,46,0.92)";
  ctx.fill();
  ctx.strokeStyle = alive ? "#f0d98a" : "#b8b0a2";
  ctx.lineWidth = alive ? 2.5 : 1.5;
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(x, y - 18, 27, 0, Math.PI * 2);
  ctx.fillStyle = alive ? "#29472e" : "#4b4a51";
  ctx.fill();
  ctx.strokeStyle = "#d9bc76";
  ctx.stroke();
  ctx.fillStyle = alive ? "#3ee26d" : "#ff6363";
  ctx.font = "bold 25px BeVietnamPro";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(alive ? "✓" : "☠", x, y - 18);
  if (avatar) {
    drawCircleImage(ctx, avatar, x, y - 18, 48);
    ctx.beginPath();
    ctx.arc(x + 18, y - 1, 10, 0, Math.PI * 2);
    ctx.fillStyle = alive ? "#1ca64b" : "#8b2222";
    ctx.fill();
    ctx.strokeStyle = "#f0d98a";
    ctx.stroke();
    ctx.fillStyle = "#fff4c8";
    ctx.font = "bold 11px BeVietnamPro";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(alive ? "✓" : "☠", x + 18, y - 1);
  }
  roundRect(ctx, x - 39, y + 18, 78, 20, 3);
  ctx.fillStyle = "#1e1716";
  ctx.fill();
  ctx.strokeStyle = "#d9bc76";
  ctx.stroke();
  ctx.fillStyle = "#fff0bd";
  ctx.font = "bold 10px BeVietnamPro";
  ctx.fillText(trimName(player.name, 13), x, y + 28);
  roundRect(ctx, x - 34, y + 44, 68, 16, 7);
  ctx.fillStyle = player.role?.includes("wolf") ? "#7b2727" : "#315c37";
  ctx.fill();
  ctx.strokeStyle = "#d9bc76";
  ctx.stroke();
  ctx.fillStyle = "#fff4c8";
  ctx.font = "bold 8px BeVietnamPro";
  ctx.fillText(trimName(roleName, 12).toUpperCase(), x, y + 52);
  ctx.beginPath();
  ctx.arc(x - 39, y - 39, 8, 0, Math.PI * 2);
  ctx.fillStyle = "#2d2c37";
  ctx.fill();
  ctx.strokeStyle = "#d9bc76";
  ctx.stroke();
  ctx.fillStyle = "#fff0bd";
  ctx.font = "bold 8px BeVietnamPro";
  ctx.fillText(String(index), x - 39, y - 39);
  ctx.restore();
}

async function drawCompactResultPlayer(ctx, x, y, player, index) {
  const roleName = getRoleName(player.role);
  const alive = player.alive;
  const avatar = await loadAvatarImage(player.avatar);
  ctx.save();

  roundRect(ctx, x - 38, y - 42, 76, 98, 6);
  ctx.fillStyle = alive ? "rgba(25,38,26,0.9)" : "rgba(42,39,46,0.92)";
  ctx.fill();
  ctx.strokeStyle = alive ? "#f0d98a" : "#b8b0a2";
  ctx.lineWidth = alive ? 2.2 : 1.4;
  ctx.stroke();

  ctx.beginPath();
  ctx.arc(x, y - 17, 22, 0, Math.PI * 2);
  ctx.fillStyle = alive ? "#29472e" : "#4b4a51";
  ctx.fill();
  ctx.strokeStyle = "#d9bc76";
  ctx.stroke();
  ctx.fillStyle = alive ? "#3ee26d" : "#ff6363";
  ctx.font = "bold 21px BeVietnamPro";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(alive ? "✓" : "☠", x, y - 17);
  if (avatar) {
    drawCircleImage(ctx, avatar, x, y - 17, 40);
    ctx.beginPath();
    ctx.arc(x + 15, y - 4, 8, 0, Math.PI * 2);
    ctx.fillStyle = alive ? "#1ca64b" : "#8b2222";
    ctx.fill();
    ctx.strokeStyle = "#f0d98a";
    ctx.stroke();
    ctx.fillStyle = "#fff4c8";
    ctx.font = "bold 9px BeVietnamPro";
    ctx.fillText(alive ? "✓" : "☠", x + 15, y - 4);
  }

  roundRect(ctx, x - 33, y + 10, 66, 18, 3);
  ctx.fillStyle = "#1e1716";
  ctx.fill();
  ctx.strokeStyle = "#d9bc76";
  ctx.stroke();
  ctx.fillStyle = "#fff0bd";
  ctx.font = "bold 8px BeVietnamPro";
  ctx.fillText(trimName(player.name, 10), x, y + 19);

  roundRect(ctx, x - 30, y + 34, 60, 15, 4);
  ctx.fillStyle = player.role?.includes("wolf") ? "#7b2727" : "#315c37";
  ctx.fill();
  ctx.strokeStyle = "rgba(255,235,180,0.6)";
  ctx.stroke();
  ctx.fillStyle = "#f9e9b4";
  ctx.font = "bold 7px BeVietnamPro";
  ctx.fillText(trimName(roleName.toUpperCase(), 11), x, y + 42);

  ctx.beginPath();
  ctx.arc(x - 32, y - 35, 8, 0, Math.PI * 2);
  ctx.fillStyle = "#4a433c";
  ctx.fill();
  ctx.strokeStyle = "#d9bc76";
  ctx.stroke();
  ctx.fillStyle = "#fff2c8";
  ctx.font = "bold 8px BeVietnamPro";
  ctx.fillText(String(index), x - 32, y - 35);
  ctx.restore();
}

function drawCrownOrWolf(ctx, x, y, villageWin) {
  ctx.save();
  ctx.translate(x, y);
  ctx.strokeStyle = "#f4d982";
  ctx.fillStyle = "#f4d982";
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.arc(0, 0, 28, 0, Math.PI * 2);
  ctx.stroke();
  if (villageWin) {
    ctx.beginPath();
    ctx.moveTo(-16, 8);
    ctx.lineTo(-12, -10);
    ctx.lineTo(0, 2);
    ctx.lineTo(12, -10);
    ctx.lineTo(16, 8);
    ctx.closePath();
    ctx.fill();
  } else {
    ctx.beginPath();
    ctx.moveTo(-17, 10);
    ctx.lineTo(-8, -13);
    ctx.lineTo(0, 0);
    ctx.lineTo(8, -13);
    ctx.lineTo(17, 10);
    ctx.closePath();
    ctx.fill();
  }
  ctx.restore();
}

async function loadAvatarImage(url) {
  const value = normalizeImageUrl(url);
  if (!value) return null;
  try {
    return await loadImage(value);
  } catch {
    return null;
  }
}

function normalizeImageUrl(url) {
  if (!url) return "";
  const value = String(url).trim();
  if (!value) return "";
  if (value.startsWith("//")) return `https:${value}`;
  if (value.startsWith("http://")) return value.replace(/^http:\/\//, "https://");
  return value;
}

function drawCircleImage(ctx, image, x, y, size) {
  const half = size / 2;
  const sourceSize = Math.min(image.width, image.height);
  const sx = Math.max(0, (image.width - sourceSize) / 2);
  const sy = Math.max(0, (image.height - sourceSize) / 2);

  ctx.save();
  ctx.beginPath();
  ctx.arc(x, y, half, 0, Math.PI * 2);
  ctx.clip();
  ctx.drawImage(image, sx, sy, sourceSize, sourceSize, x - half, y - half, size, size);
  ctx.restore();
}

function getRoleName(role) {
  const map = {
    villager: "Dân làng",
    fakeWolf: "Người giả sói",
    guard: "Bảo vệ",
    seer: "Tiên tri",
    wolf: "Sói",
    alphaWolf: "Sói nguyên",
    wolfWitch: "Sói phù thủy",
    witch: "Phù thủy",
    hunter: "Thợ săn",
    cupid: "Thần tình yêu",
    clone: "Nhân bản",
    cultLeader: "Trưởng giáo phái",
  };
  return map[role] || role || "Ẩn";
}

function initials(name) {
  const clean = String(name || "?").trim();
  return clean.slice(0, 1).toUpperCase();
}

function trimName(name, max) {
  const clean = String(name || "");
  return clean.length > max ? `${clean.slice(0, max - 1)}…` : clean;
}

function drawStars(ctx, width, height) {
  ctx.fillStyle = "rgba(255,255,255,0.55)";
  for (let i = 0; i < 70; i += 1) {
    const x = Math.random() * width;
    const y = Math.random() * height;
    const r = Math.random() * 1.3;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  }
}

function drawFrame(ctx, width, height) {
  ctx.strokeStyle = "#f0d98a";
  ctx.lineWidth = 4;
  roundRect(ctx, 34, 38, width - 68, height - 76, 18);
  ctx.stroke();
  ctx.lineWidth = 1.5;
  ctx.strokeStyle = "rgba(255,246,195,0.9)";
  roundRect(ctx, 44, 48, width - 88, height - 96, 14);
  ctx.stroke();
  ctx.fillStyle = "#f0d98a";
  for (const [x, y] of [
    [52, 58],
    [width - 52, 58],
    [52, height - 58],
    [width - 52, height - 58],
  ]) {
    ctx.beginPath();
    ctx.arc(x, y, 6, 0, Math.PI * 2);
    ctx.fill();
  }
}

function drawCompass(ctx, cx, cy, radius) {
  ctx.save();
  ctx.translate(cx, cy);
  ctx.fillStyle = "rgba(255,255,255,0.055)";
  ctx.beginPath();
  for (let i = 0; i < 16; i += 1) {
    const angle = (Math.PI * 2 * i) / 16;
    const r = i % 2 === 0 ? radius : radius * 0.45;
    const x = Math.cos(angle) * r;
    const y = Math.sin(angle) * r;
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.closePath();
  ctx.fill();
  ctx.setLineDash([2, 9]);
  ctx.strokeStyle = "rgba(240,217,138,0.45)";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(0, 0, radius * 0.8, 0, Math.PI * 2);
  ctx.stroke();
  ctx.restore();
}

function drawRoleSymbol(ctx, icon, cx, cy) {
  if (icon === "heartArrow") {
    drawCupidIcon(ctx, cx, cy);
    return;
  }
  drawStarIcon(ctx, cx, cy);
}

function drawStarIcon(ctx, cx, cy) {
  ctx.save();
  ctx.translate(cx, cy);
  ctx.fillStyle = "#f7dea0";
  ctx.strokeStyle = "#80592b";
  ctx.lineWidth = 5;
  ctx.beginPath();
  for (let i = 0; i < 10; i += 1) {
    const radius = i % 2 === 0 ? 82 : 36;
    const angle = -Math.PI / 2 + (i * Math.PI) / 5;
    const x = Math.cos(angle) * radius;
    const y = Math.sin(angle) * radius;
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  ctx.restore();
}

function drawCupidIcon(ctx, cx, cy) {
  ctx.save();
  ctx.translate(cx, cy);
  ctx.strokeStyle = "#f3df9d";
  ctx.fillStyle = "#f3df9d";
  ctx.lineWidth = 11;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";

  ctx.beginPath();
  ctx.moveTo(-78, -8);
  ctx.bezierCurveTo(-132, -70, -26, -94, 0, -22);
  ctx.bezierCurveTo(26, -94, 132, -70, 78, -8);
  ctx.bezierCurveTo(48, 30, 0, 64, 0, 64);
  ctx.bezierCurveTo(0, 64, -48, 30, -78, -8);
  ctx.fill();

  ctx.strokeStyle = "#fff2bd";
  ctx.lineWidth = 8;
  ctx.beginPath();
  ctx.moveTo(-118, 4);
  ctx.lineTo(126, 4);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(126, 4);
  ctx.lineTo(105, -15);
  ctx.moveTo(126, 4);
  ctx.lineTo(105, 23);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(-112, 4);
  ctx.lineTo(-139, -16);
  ctx.moveTo(-112, 4);
  ctx.lineTo(-139, 24);
  ctx.moveTo(-101, 4);
  ctx.lineTo(-128, -16);
  ctx.moveTo(-101, 4);
  ctx.lineTo(-128, 24);
  ctx.stroke();

  ctx.restore();
}

async function drawAvatar(ctx, cx, cy) {
  ctx.save();
  ctx.beginPath();
  ctx.arc(cx, cy, 54, 0, Math.PI * 2);
  ctx.fillStyle = "#1e1716";
  ctx.fill();
  ctx.lineWidth = 6;
  ctx.strokeStyle = "#f0d98a";
  ctx.stroke();
  ctx.fillStyle = "#f7e6ad";
  ctx.font = "bold 36px BeVietnamPro";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText("♡", cx, cy + 3);
  ctx.restore();
}

async function drawPlayerAvatar(ctx, cx, cy, avatar, playerName = "", size = 108) {
  const image = await loadAvatarImage(avatar);
  const radius = size / 2;
  ctx.save();
  ctx.beginPath();
  ctx.arc(cx, cy, radius, 0, Math.PI * 2);
  ctx.fillStyle = "#1e1716";
  ctx.fill();
  ctx.lineWidth = 6;
  ctx.strokeStyle = "#f0d98a";
  ctx.stroke();
  if (image) {
    drawCircleImage(ctx, image, cx, cy, size - 12);
  } else {
    ctx.fillStyle = "#f7e6ad";
    ctx.font = "bold 36px BeVietnamPro";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(initials(playerName) || "?", cx, cy + 3);
  }
  ctx.restore();
}

function drawNamePlate(ctx, name, cx, y) {
  ctx.fillStyle = "#241c1b";
  ctx.strokeStyle = "#e6c77d";
  ctx.lineWidth = 2;
  roundRect(ctx, cx - 160, y - 18, 320, 36, 6);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = "#fff0c4";
  ctx.font = "bold 19px BeVietnamPro";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(name, cx, y + 1);
}

function drawGoldText(ctx, text, x, y, size) {
  ctx.font = `bold ${size}px BeVietnamPro`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.lineWidth = 4;
  ctx.strokeStyle = "rgba(48,31,14,0.8)";
  ctx.strokeText(text, x, y);
  const w = ctx.measureText(text).width;
  const grad = ctx.createLinearGradient(x - w / 2, y - size / 2, x + w / 2, y + size / 2);
  grad.addColorStop(0, "#fff1b7");
  grad.addColorStop(0.45, "#d6a545");
  grad.addColorStop(1, "#fff0ad");
  ctx.fillStyle = grad;
  ctx.fillText(text, x, y);
}

function drawFactionPill(ctx, text, cx, y) {
  ctx.fillStyle = "rgba(75,55,28,0.78)";
  ctx.strokeStyle = "#d7bb73";
  ctx.lineWidth = 1.5;
  roundRect(ctx, cx - 78, y - 14, 156, 28, 14);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = "#ffe7a2";
  ctx.font = "bold 13px BeVietnamPro";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(text, cx, y + 1);
}

function drawNoteBox(ctx, text, x, y, w, h) {
  ctx.fillStyle = "#f5e2ab";
  ctx.strokeStyle = "#d2a448";
  ctx.lineWidth = 4;
  roundRect(ctx, x, y, w, h, 2);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = "#2d241c";
  ctx.font = "bold 16px BeVietnamPro";
  ctx.textAlign = "left";
  ctx.textBaseline = "top";
  wrapText(ctx, text, x + 20, y + 16, w - 40, 24);
}

function wrapText(ctx, text, x, y, maxWidth, lineHeight) {
  const words = text.split(/\s+/);
  let line = "";
  for (const word of words) {
    const test = line ? `${line} ${word}` : word;
    if (ctx.measureText(test).width > maxWidth && line) {
      ctx.fillText(line, x, y);
      line = word;
      y += lineHeight;
    } else {
      line = test;
    }
  }
  if (line) ctx.fillText(line, x, y);
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}
