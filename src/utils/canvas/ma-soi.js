import { Canvas, loadImage } from "skia-canvas";
import fs from "fs";
import path from "path";

const WIDTH = 1080;
const COLORS = {
  bg: "#070914",
  panel: "#111526",
  panel2: "#171B30",
  border: "rgba(255,255,255,.12)",
  text: "#F8FAFC",
  muted: "#AAB2C8",
  gold: "#F8C75C",
  red: "#EF5361",
  blue: "#70A5FF",
  violet: "#B58CFF",
  green: "#55D6A3",
};

function roundRect(ctx, x, y, w, h, r, fill, stroke = null, lineWidth = 1) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
  if (fill) { ctx.fillStyle = fill; ctx.fill(); }
  if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = lineWidth; ctx.stroke(); }
}

function wrapText(ctx, text, maxWidth) {
  const paragraphs = String(text || "").split("\n");
  const lines = [];
  for (const paragraph of paragraphs) {
    if (!paragraph) { lines.push(""); continue; }
    const words = paragraph.split(/\s+/);
    let line = "";
    for (const word of words) {
      const next = line ? `${line} ${word}` : word;
      if (ctx.measureText(next).width <= maxWidth || !line) line = next;
      else { lines.push(line); line = word; }
    }
    if (line) lines.push(line);
  }
  return lines;
}

function drawTextBlock(ctx, text, x, y, maxWidth, lineHeight, maxLines = 99) {
  const lines = wrapText(ctx, text, maxWidth).slice(0, maxLines);
  lines.forEach((line, index) => ctx.fillText(line, x, y + index * lineHeight));
  return y + lines.length * lineHeight;
}

function createBase(height, accent = COLORS.violet) {
  const canvas = new Canvas(WIDTH, height);
  const ctx = canvas.getContext("2d");
  const bg = ctx.createLinearGradient(0, 0, WIDTH, height);
  bg.addColorStop(0, "#060812");
  bg.addColorStop(0.55, "#0B1020");
  bg.addColorStop(1, "#100B1D");
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, WIDTH, height);

  const glow = ctx.createRadialGradient(850, 100, 20, 850, 100, 600);
  glow.addColorStop(0, `${accent}35`);
  glow.addColorStop(1, `${accent}00`);
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, WIDTH, Math.min(height, 800));

  // Sao được đặt cố định để cùng dữ liệu luôn cho hình ổn định.
  ctx.fillStyle = "rgba(255,255,255,.45)";
  for (let index = 0; index < 72; index++) {
    const x = (index * 149 + 37) % WIDTH;
    const y = (index * 83 + 29) % height;
    const radius = index % 9 === 0 ? 2.2 : 1.1;
    ctx.beginPath(); ctx.arc(x, y, radius, 0, Math.PI * 2); ctx.fill();
  }

  // Trăng khuyết tối giản.
  ctx.fillStyle = "rgba(248,199,92,.95)";
  ctx.beginPath(); ctx.arc(885, 116, 62, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = "#111327";
  ctx.beginPath(); ctx.arc(914, 94, 58, 0, Math.PI * 2); ctx.fill();
  return { canvas, ctx };
}

function header(ctx, eyebrow, title, subtitle, accent = COLORS.violet) {
  ctx.textAlign = "left";
  ctx.fillStyle = accent;
  ctx.font = "700 22px Arial";
  ctx.fillText(eyebrow.toUpperCase(), 64, 80);
  ctx.fillStyle = COLORS.text;
  ctx.font = "800 52px Arial";
  ctx.fillText(title, 64, 142);
  ctx.fillStyle = COLORS.muted;
  ctx.font = "500 24px Arial";
  ctx.fillText(subtitle, 64, 182);
  ctx.strokeStyle = `${accent}70`;
  ctx.lineWidth = 2;
  ctx.beginPath(); ctx.moveTo(64, 212); ctx.lineTo(WIDTH - 64, 212); ctx.stroke();
}

function createStoryBase(height, accent = COLORS.gold) {
  const canvas = new Canvas(WIDTH, height);
  const ctx = canvas.getContext("2d");
  const bg = ctx.createLinearGradient(0, 0, WIDTH, height);
  bg.addColorStop(0, "#17130F");
  bg.addColorStop(0.5, "#272017");
  bg.addColorStop(1, "#100E0D");
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, WIDTH, height);

  // Vân bản đồ cổ nguyên bản, tạo bằng các đường nét mờ để ảnh không phụ thuộc asset ngoài.
  ctx.strokeStyle = "rgba(222,196,135,.09)";
  ctx.lineWidth = 2;
  for (let index = 0; index < 28; index++) {
    const y = 70 + index * 67;
    ctx.beginPath();
    ctx.moveTo(0, y);
    for (let x = 0; x <= WIDTH; x += 90) {
      ctx.lineTo(x, y + Math.sin((x + index * 41) / 85) * 24);
    }
    ctx.stroke();
  }
  ctx.strokeStyle = `${accent}AA`;
  ctx.lineWidth = 3;
  roundRect(ctx, 12, 12, WIDTH - 24, height - 24, 24, null, `${accent}99`, 3);
  roundRect(ctx, 25, 25, WIDTH - 50, height - 50, 20, null, "rgba(248,199,92,.28)", 1);
  return { canvas, ctx };
}

function roleAccent(role = "") {
  const text = String(role).toLowerCase();
  if (text.includes("sói")) return COLORS.red;
  if (text.includes("sát thủ") || text.includes("thổi sáo") || text.includes("ngố")) return COLORS.violet;
  if (text.includes("tiên tri") || text.includes("bảo vệ") || text.includes("phù thủy") || text.includes("cảnh sát")) return COLORS.green;
  return COLORS.blue;
}

function roleIcon(role = "") {
  const first = String(role).trim().split(/\s+/)[0];
  return first && /[^\p{L}\p{N}]/u.test(first) ? first : "◈";
}

async function loadPlayerAvatars(players = []) {
  const entries = await Promise.all(
    players.map(async (player) => {
      if (!player.avatar) return [String(player.id), null];
      const url = String(player.avatar).startsWith("//") ? `https:${player.avatar}` : player.avatar;
      try {
        return [String(player.id), await loadImage(url)];
      } catch {
        return [String(player.id), null];
      }
    })
  );
  return new Map(entries);
}

function drawCircularAvatar(ctx, image, cx, cy, radius, fallbackName, borderColor) {
  ctx.save();
  ctx.beginPath();
  ctx.arc(cx, cy, radius, 0, Math.PI * 2);
  ctx.clip();
  if (image) {
    const scale = Math.max((radius * 2) / image.width, (radius * 2) / image.height);
    const width = image.width * scale;
    const height = image.height * scale;
    ctx.drawImage(image, cx - width / 2, cy - height / 2, width, height);
  } else {
    ctx.fillStyle = "#25293A";
    ctx.fillRect(cx - radius, cy - radius, radius * 2, radius * 2);
    ctx.fillStyle = "#F8E2AA";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.font = `800 ${Math.round(radius * 0.9)}px Arial`;
    ctx.fillText(String(fallbackName || "?").trim().charAt(0).toUpperCase() || "?", cx, cy + 1);
  }
  ctx.restore();
  ctx.beginPath();
  ctx.arc(cx, cy, radius, 0, Math.PI * 2);
  ctx.strokeStyle = borderColor;
  ctx.lineWidth = 3;
  ctx.stroke();
}

function trimToWidth(ctx, text, maxWidth) {
  const value = String(text || "");
  if (ctx.measureText(value).width <= maxWidth) return value;
  let result = value;
  while (result.length > 1 && ctx.measureText(`${result}…`).width > maxWidth) result = result.slice(0, -1);
  return `${result}…`;
}

function drawStoryHeader(ctx, eyebrow, title, subtitle, accent) {
  ctx.textAlign = "left";
  ctx.fillStyle = accent;
  ctx.font = "800 22px Arial";
  ctx.fillText(eyebrow.toUpperCase(), 55, 70);
  ctx.fillStyle = "#FFE7A8";
  ctx.font = "800 46px Arial";
  ctx.fillText(title, 55, 128);
  ctx.fillStyle = "#D8CCB2";
  ctx.font = "600 21px Arial";
  ctx.fillText(trimToWidth(ctx, subtitle, WIDTH - 110), 55, 168);
  ctx.strokeStyle = `${accent}88`;
  ctx.beginPath(); ctx.moveTo(55, 195); ctx.lineTo(WIDTH - 55, 195); ctx.stroke();
}

function drawPlayerStoryCard(
  ctx,
  player,
  index,
  x,
  y,
  width,
  height,
  { revealAll = false, winnerIds = new Set(), avatarImages = new Map() } = {}
) {
  const revealedRole = player.displayRole || player.roleName || "Vai chưa xác định";
  const showRole = revealAll || !player.alive;
  const accent = showRole ? roleAccent(revealedRole) : COLORS.gold;
  const winner = winnerIds.has(String(player.id));
  roundRect(ctx, x, y, width, height, 18, "rgba(8,9,16,.91)", winner ? COLORS.gold : `${accent}B0`, winner ? 3 : 2);

  ctx.fillStyle = "rgba(8,8,12,.95)";
  ctx.beginPath(); ctx.arc(x + 27, y + 27, 18, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = accent; ctx.lineWidth = 2; ctx.stroke();
  ctx.fillStyle = "#F8E2AA"; ctx.textAlign = "center"; ctx.font = "700 17px Arial";
  ctx.fillText(String(index + 1), x + 27, y + 33);

  if (winner) {
    ctx.textAlign = "right"; ctx.fillStyle = COLORS.gold; ctx.font = "800 20px Arial";
    ctx.fillText("♛", x + width - 15, y + 32);
  }

  const centerX = x + width / 2;
  drawCircularAvatar(
    ctx,
    avatarImages.get(String(player.id)),
    centerX,
    y + 80,
    40,
    player.name,
    showRole ? accent : "#8D8269"
  );
  if (!player.alive) {
    ctx.beginPath(); ctx.arc(centerX + 27, y + 106, 18, 0, Math.PI * 2);
    ctx.fillStyle = "rgba(90,5,12,.94)"; ctx.fill();
    ctx.strokeStyle = "#FF9B9B"; ctx.lineWidth = 2; ctx.stroke();
    ctx.fillStyle = "#FFFFFF"; ctx.textAlign = "center"; ctx.textBaseline = "alphabetic"; ctx.font = "800 21px Arial";
    ctx.fillText("☠", centerX + 27, y + 113);
  }

  roundRect(ctx, x + 12, y + 128, width - 24, 34, 10, "rgba(0,0,0,.78)", "rgba(248,199,92,.52)");
  ctx.fillStyle = "#F4EEE1"; ctx.textAlign = "center"; ctx.font = "700 17px Arial";
  ctx.fillText(trimToWidth(ctx, player.name, width - 42), centerX, y + 151);

  const status = player.alive ? "CÒN SỐNG" : "ĐÃ NGÃ XUỐNG";
  roundRect(ctx, x + 24, y + 171, width - 48, 27, 12, player.alive ? "rgba(85,214,163,.10)" : "rgba(239,83,97,.23)", player.alive ? COLORS.green : COLORS.red);
  ctx.fillStyle = player.alive ? COLORS.green : "#FF9B9B"; ctx.font = "800 13px Arial";
  ctx.fillText(status, centerX, y + 190);

  roundRect(ctx, x + 22, y + 205, width - 44, 28, 9, `${accent}10`, `${accent}90`);
  ctx.fillStyle = accent; ctx.font = "700 14px Arial";
  const roleLabel = showRole ? revealedRole.replace(/^\S+\s*/, "") : "VAI ĐANG ẨN";
  ctx.fillText(trimToWidth(ctx, roleLabel, width - 58), centerX, y + 224);
}

function drawStoryBoard(
  ctx,
  players,
  startY,
  { revealAll = false, winnerIds = new Set(), avatarImages = new Map() } = {}
) {
  const columns = 4;
  const gap = 16;
  const cardWidth = 226;
  const cardHeight = 245;
  const totalWidth = columns * cardWidth + (columns - 1) * gap;
  const left = (WIDTH - totalWidth) / 2;
  players.forEach((player, index) => {
    const row = Math.floor(index / columns);
    const col = index % columns;
    drawPlayerStoryCard(
      ctx,
      player,
      index,
      left + col * (cardWidth + gap),
      startY + row * (cardHeight + 18),
      cardWidth,
      cardHeight,
      { revealAll, winnerIds, avatarImages }
    );
  });
  return startY + Math.ceil(players.length / columns) * (cardHeight + 18);
}

function drawStoryBox(ctx, story, y, accent = COLORS.gold) {
  roundRect(ctx, 52, y, WIDTH - 104, 280, 22, "rgba(4,4,6,.82)", `${accent}88`, 2);
  ctx.textAlign = "center";
  ctx.fillStyle = "#F8E6BB";
  ctx.font = "700 24px Arial";
  drawTextBlock(ctx, story, WIDTH / 2, y + 45, WIDTH - 160, 34, 7);
}

function drawPhaseRoster(ctx, players, avatarImages, startY) {
  if (!players.length) return;
  const columns = Math.min(8, players.length);
  const gap = 112;
  const rows = Math.ceil(players.length / 8);
  ctx.textAlign = "center";
  ctx.fillStyle = COLORS.muted;
  ctx.font = "800 17px Arial";
  ctx.fillText("NGƯỜI CHƠI TRONG VÁN", WIDTH / 2, startY - 20);
  for (let row = 0; row < rows; row++) {
    const rowPlayers = players.slice(row * 8, row * 8 + 8);
    const rowWidth = (rowPlayers.length - 1) * gap;
    const firstX = WIDTH / 2 - rowWidth / 2;
    rowPlayers.forEach((player, col) => {
      const cx = firstX + col * gap;
      const cy = startY + row * 78;
      drawCircularAvatar(
        ctx,
        avatarImages.get(String(player.id)),
        cx,
        cy,
        27,
        player.name,
        player.alive === false ? COLORS.red : COLORS.blue
      );
      if (player.alive === false) {
        ctx.beginPath(); ctx.arc(cx + 19, cy + 20, 12, 0, Math.PI * 2);
        ctx.fillStyle = "rgba(90,5,12,.96)"; ctx.fill();
        ctx.fillStyle = "#FFFFFF"; ctx.font = "800 14px Arial"; ctx.textAlign = "center";
        ctx.fillText("☠", cx + 19, cy + 25);
      }
      ctx.fillStyle = COLORS.muted; ctx.font = "700 13px Arial"; ctx.textAlign = "center";
      ctx.fillText(String(row * 8 + col + 1), cx, cy + 47);
    });
  }
}

async function save(canvas, prefix) {
  const outputDir = path.resolve("./assets/temp");
  fs.mkdirSync(outputDir, { recursive: true });
  const filePath = path.join(outputDir, `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 7)}.png`);
  await fs.promises.writeFile(filePath, await canvas.toBuffer("png"));
  return filePath;
}

export async function createWerewolfLobbyImage(room) {
  const avatarImages = await loadPlayerAvatars(room.players);
  const columns = 2;
  const rows = Math.ceil(room.players.length / columns);
  const cardStartY = 555;
  const cardHeight = 96;
  const rowGap = 14;
  const height = Math.max(1020, cardStartY + rows * (cardHeight + rowGap) + 118);
  const { canvas, ctx } = createBase(height, COLORS.violet);

  ctx.textAlign = "left";
  ctx.textBaseline = "alphabetic";
  ctx.fillStyle = COLORS.violet;
  ctx.font = "800 21px Arial";
  ctx.fillText("BIÊN NIÊN SỬ MA SÓI", 64, 72);
  ctx.fillStyle = COLORS.text;
  ctx.font = "900 62px Arial";
  ctx.fillText("SẢNH CHỜ", 64, 142);
  ctx.fillStyle = COLORS.muted;
  ctx.font = "600 23px Arial";
  ctx.fillText(trimToWidth(ctx, `Chủ phòng · ${room.hostName}`, 700), 64, 184);
  ctx.strokeStyle = "rgba(181,140,255,.42)";
  ctx.lineWidth = 2;
  ctx.beginPath(); ctx.moveTo(64, 211); ctx.lineTo(WIDTH - 64, 211); ctx.stroke();

  const lobbyPanel = ctx.createLinearGradient(64, 238, 1016, 448);
  lobbyPanel.addColorStop(0, "rgba(181,140,255,.20)");
  lobbyPanel.addColorStop(0.58, "rgba(63,73,130,.18)");
  lobbyPanel.addColorStop(1, "rgba(248,199,92,.12)");
  roundRect(ctx, 64, 238, 952, 210, 30, lobbyPanel, "rgba(181,140,255,.48)", 2);

  ctx.fillStyle = COLORS.muted;
  ctx.font = "800 18px Arial";
  ctx.fillText("MÃ PHÒNG", 98, 282);
  ctx.fillStyle = COLORS.gold;
  ctx.font = "900 70px Arial";
  ctx.fillText(String(room.code), 96, 362);

  ctx.strokeStyle = "rgba(255,255,255,.14)";
  ctx.lineWidth = 2;
  ctx.beginPath(); ctx.moveTo(675, 270); ctx.lineTo(675, 380); ctx.stroke();

  ctx.textAlign = "center";
  ctx.fillStyle = COLORS.muted;
  ctx.font = "800 18px Arial";
  ctx.fillText("NGƯỜI CHƠI", 836, 282);
  ctx.fillStyle = COLORS.text;
  ctx.font = "900 54px Arial";
  ctx.fillText(`${room.players.length} / ${room.capacity}`, 836, 350);
  ctx.fillStyle = COLORS.green;
  ctx.font = "700 16px Arial";
  ctx.fillText("ĐANG CHỜ THAM GIA", 836, 380);

  const progress = Math.max(0, Math.min(1, room.players.length / Math.max(1, room.capacity)));
  roundRect(ctx, 96, 408, 888, 12, 6, "rgba(255,255,255,.10)");
  if (progress > 0) {
    const progressGradient = ctx.createLinearGradient(96, 0, 984, 0);
    progressGradient.addColorStop(0, COLORS.violet);
    progressGradient.addColorStop(1, COLORS.gold);
    roundRect(ctx, 96, 408, Math.max(12, 888 * progress), 12, 6, progressGradient);
  }

  ctx.textAlign = "left";
  ctx.fillStyle = COLORS.text;
  ctx.font = "900 27px Arial";
  ctx.fillText("NGƯỜI CHƠI TRONG SẢNH", 64, 508);
  const remaining = Math.max(0, room.capacity - room.players.length);
  const slotText = remaining ? `${remaining} CHỖ TRỐNG` : "ĐÃ ĐỦ NGƯỜI";
  ctx.font = "800 15px Arial";
  const slotWidth = ctx.measureText(slotText).width + 32;
  roundRect(ctx, WIDTH - 64 - slotWidth, 479, slotWidth, 40, 20, "rgba(85,214,163,.10)", "rgba(85,214,163,.40)");
  ctx.fillStyle = COLORS.green;
  ctx.textAlign = "center";
  ctx.fillText(slotText, WIDTH - 64 - slotWidth / 2, 505);

  const cardWidth = 466;
  const colGap = 20;
  room.players.forEach((player, index) => {
    const col = index % columns;
    const row = Math.floor(index / columns);
    const x = 64 + col * (cardWidth + colGap);
    const y = cardStartY + row * (cardHeight + rowGap);
    const isHost = String(player.id) === String(room.hostId);
    roundRect(
      ctx,
      x,
      y,
      cardWidth,
      cardHeight,
      22,
      isHost ? "rgba(248,199,92,.10)" : "rgba(17,21,38,.92)",
      isHost ? "rgba(248,199,92,.55)" : "rgba(112,165,255,.24)",
      isHost ? 2 : 1
    );
    roundRect(ctx, x, y + 18, 5, cardHeight - 36, 3, isHost ? COLORS.gold : COLORS.blue);
    drawCircularAvatar(
      ctx,
      avatarImages.get(String(player.id)),
      x + 54,
      y + cardHeight / 2,
      36,
      player.name,
      isHost ? COLORS.gold : COLORS.blue
    );
    ctx.beginPath();
    ctx.arc(x + 79, y + 75, 14, 0, Math.PI * 2);
    ctx.fillStyle = "#0C1020";
    ctx.fill();
    ctx.strokeStyle = isHost ? COLORS.gold : COLORS.blue;
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.fillStyle = COLORS.text;
    ctx.font = "800 13px Arial";
    ctx.textAlign = "center";
    ctx.fillText(String(index + 1), x + 79, y + 80);

    ctx.textAlign = "left";
    ctx.fillStyle = COLORS.text;
    ctx.font = "800 27px Arial";
    ctx.fillText(trimToWidth(ctx, player.name, cardWidth - 132), x + 108, y + 43);
    ctx.fillStyle = isHost ? COLORS.gold : COLORS.muted;
    ctx.font = "700 16px Arial";
    ctx.fillText(isHost ? "CHỦ PHÒNG" : "ĐÃ SẴN SÀNG", x + 108, y + 70);
  });

  roundRect(ctx, 64, height - 88, 952, 52, 18, "rgba(181,140,255,.08)", "rgba(181,140,255,.22)");
  ctx.textAlign = "center";
  ctx.fillStyle = COLORS.muted;
  ctx.font = "700 18px Arial";
  ctx.fillText("Thả ❤️ hoặc dùng lệnh join  ·  Kết bạn với Bot để nhận vai", WIDTH / 2, height - 55);
  return save(canvas, "masoi_lobby");
}

export async function createWerewolfRoleImage({ playerId, playerName, playerAvatar, roleName, teamName, description, commands, roomCode }) {
  const avatarImages = await loadPlayerAvatars([{ id: playerId || playerName, avatar: playerAvatar }]);
  const teamAccent = teamName === "Sói" ? COLORS.red : teamName === "Dân" ? COLORS.blue : COLORS.violet;
  const { canvas, ctx } = createBase(1050, teamAccent);
  header(ctx, `Phòng ${roomCode} · Tuyệt mật`, "VAI TRÒ CỦA BẠN", playerName, teamAccent);

  roundRect(ctx, 64, 258, 952, 182, 30, `${teamAccent}18`, `${teamAccent}70`, 2);
  drawCircularAvatar(
    ctx,
    avatarImages.get(String(playerId || playerName)),
    190,
    349,
    62,
    playerName,
    teamAccent
  );
  ctx.textAlign = "left";
  ctx.fillStyle = teamAccent; ctx.font = "800 22px Arial"; ctx.fillText(`PHE ${teamName.toUpperCase()}`, 300, 323);
  ctx.fillStyle = COLORS.text; ctx.font = "800 48px Arial";
  ctx.fillText(trimToWidth(ctx, roleName, 650), 300, 384);

  ctx.textAlign = "left";
  roundRect(ctx, 64, 478, 952, 252, 26, COLORS.panel, COLORS.border);
  ctx.fillStyle = COLORS.gold; ctx.font = "800 21px Arial"; ctx.fillText("NHIỆM VỤ & KỸ NĂNG", 94, 522);
  ctx.fillStyle = COLORS.text; ctx.font = "500 23px Arial";
  drawTextBlock(ctx, description, 94, 566, 892, 34, 5);

  roundRect(ctx, 64, 758, 952, 190, 26, COLORS.panel2, `${teamAccent}55`);
  ctx.fillStyle = teamAccent; ctx.font = "800 21px Arial"; ctx.fillText("LỆNH CHAT RIÊNG", 94, 804);
  ctx.fillStyle = COLORS.text; ctx.font = "600 23px Arial";
  drawTextBlock(ctx, commands || "Vai này không có hành động ban đêm.", 94, 850, 892, 34, 3);

  ctx.textAlign = "center"; ctx.fillStyle = COLORS.muted; ctx.font = "600 18px Arial";
  ctx.fillText("Không tiết lộ ảnh này cho người chơi khác", WIDTH / 2, 1008);
  return save(canvas, "masoi_role");
}

export async function createWerewolfPhaseImage({ title, subtitle, duration, note, accent = COLORS.blue, players = [] }) {
  const avatarImages = await loadPlayerAvatars(players);
  const rows = Math.ceil(players.length / 8);
  const height = players.length ? Math.max(780, 690 + rows * 78) : 720;
  const { canvas, ctx } = createBase(height, accent);
  header(ctx, "Diễn biến ván Ma Sói", title, subtitle, accent);
  roundRect(ctx, 64, 265, 952, 260, 34, `${accent}12`, `${accent}60`, 2);
  ctx.textAlign = "center";
  ctx.fillStyle = accent; ctx.font = "800 96px Arial";
  ctx.fillText(String(duration), WIDTH / 2, 390);
  ctx.fillStyle = COLORS.text; ctx.font = "800 28px Arial";
  ctx.fillText("GIÂY", WIDTH / 2, 438);
  ctx.fillStyle = COLORS.muted; ctx.font = "600 23px Arial";
  drawTextBlock(ctx, note, WIDTH / 2, 492, 820, 34, 3);
  drawPhaseRoster(ctx, players, avatarImages, 625);
  ctx.textAlign = "center";
  ctx.fillStyle = COLORS.muted; ctx.font = "600 18px Arial";
  ctx.fillText("🐺 MA SÓI 🐺", WIDTH / 2, height - 40);
  return save(canvas, "masoi_phase");
}

export async function createWerewolfNightImage({ night, duration, players, story }) {
  const avatarImages = await loadPlayerAvatars(players);
  const rows = Math.ceil(players.length / 4);
  const storyY = 225 + rows * 263 + 12;
  const height = Math.max(980, storyY + 330);
  const { canvas, ctx } = createStoryBase(height, COLORS.violet);
  const deadCount = players.filter((player) => !player.alive).length;
  drawStoryHeader(
    ctx,
    "Biên niên sử Ma Sói",
    `ĐÊM ${night} BUÔNG XUỐNG`,
    `${duration} giây hành động bí mật · ${players.length - deadCount} người còn sống · ${deadCount} người đã ngã xuống`,
    COLORS.violet
  );
  drawStoryBoard(ctx, players, 225, { avatarImages });
  drawStoryBox(ctx, story, storyY, COLORS.violet);
  return save(canvas, "masoi_night");
}

export async function createWerewolfDeathImage({ heading, deaths, players, story }) {
  const roster = players?.length ? players : deaths.map(({ player }) => player);
  const avatarImages = await loadPlayerAvatars(roster);
  const rows = Math.ceil(roster.length / 4);
  const storyY = 225 + rows * 263 + 12;
  const height = Math.max(980, storyY + 330);
  const accent = deaths.length ? COLORS.red : COLORS.green;
  const { canvas, ctx } = createStoryBase(height, accent);
  drawStoryHeader(
    ctx,
    "Chuyện kể của ngôi làng",
    heading,
    deaths.length ? `${deaths.length} người vừa ngã xuống · Vai của người chết đã được hé lộ` : "Một chương bình yên · Không ai chết",
    accent
  );
  drawStoryBoard(ctx, roster, 225, { avatarImages });
  drawStoryBox(ctx, story, storyY, accent);
  return save(canvas, "masoi_death");
}

export async function createWerewolfEndImage({ winnerTitle, winnerText, winnerNames, winnerIds = [], players, story }) {
  const avatarImages = await loadPlayerAvatars(players);
  const rows = Math.ceil(players.length / 4);
  const storyY = 225 + rows * 263 + 12;
  const height = Math.max(980, storyY + 330);
  const { canvas, ctx } = createStoryBase(height, COLORS.gold);
  drawStoryHeader(
    ctx,
    "Hạ màn · Công khai toàn bộ vai",
    winnerTitle || "KẾT THÚC VÁN MA SÓI",
    `${winnerText} · Người thắng: ${winnerNames.join(", ") || "không có"}`,
    COLORS.gold
  );
  drawStoryBoard(ctx, players, 225, {
    revealAll: true,
    winnerIds: new Set(winnerIds.map(String)),
    avatarImages,
  });
  drawStoryBox(ctx, story, storyY, COLORS.gold);
  return save(canvas, "masoi_end");
}
