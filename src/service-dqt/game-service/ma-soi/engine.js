export const ROLE = Object.freeze({
  WOLF: "wolf",
  VILLAGER: "villager",
  SEER: "seer",
  GUARD: "guard",
  WITCH: "witch",
  HUNTER: "hunter",
  CUPID: "cupid",
  FOOL: "fool",
  WHITE_WOLF: "white_wolf",
  LITTLE_GIRL: "little_girl",
  HALF_WOLF: "half_wolf",
  DETECTIVE: "detective",
  WOLF_SEER: "wolf_seer",
  WOLF_WITCH: "wolf_witch",
  CURSE_WOLF: "curse_wolf",
  WOLF_CUB: "wolf_cub",
  SERIAL_KILLER: "serial_killer",
  PIED_PIPER: "pied_piper",
});

export const ROLE_INFO = Object.freeze({
  [ROLE.WOLF]: { name: "🐺 Ma Sói", team: "wolf" },
  [ROLE.VILLAGER]: { name: "🧑‍🌾 Dân Làng", team: "village" },
  [ROLE.SEER]: { name: "🔮 Tiên Tri", team: "village" },
  [ROLE.GUARD]: { name: "🛡️ Bảo Vệ", team: "village" },
  [ROLE.WITCH]: { name: "🧪 Phù Thủy", team: "village" },
  [ROLE.HUNTER]: { name: "🏹 Thợ Săn", team: "village" },
  [ROLE.CUPID]: { name: "💘 Thần Tình Yêu", team: "village" },
  [ROLE.FOOL]: { name: "🤪 Thằng Ngố", team: "solo" },
  [ROLE.WHITE_WOLF]: { name: "🌕 Sói Trắng", team: "white_wolf" },
  [ROLE.LITTLE_GIRL]: { name: "👧 Cô Bé", team: "village" },
  [ROLE.HALF_WOLF]: { name: "🌗 Bán Sói", team: "village" },
  [ROLE.DETECTIVE]: { name: "🔍 Cảnh Sát", team: "village" },
  [ROLE.WOLF_SEER]: { name: "🐺 Sói Tiên Tri", team: "wolf" },
  [ROLE.WOLF_WITCH]: { name: "🩸 Phù Thủy Sói", team: "wolf" },
  [ROLE.CURSE_WOLF]: { name: "🌑 Sói Nguyền", team: "wolf" },
  [ROLE.WOLF_CUB]: { name: "🐶 Sói Con", team: "wolf" },
  [ROLE.SERIAL_KILLER]: { name: "🔪 Sát Thủ", team: "serial" },
  [ROLE.PIED_PIPER]: { name: "🎶 Người Thổi Sáo", team: "piper" },
});

const WOLF_ROLE_UNLOCKS = [
  [7, ROLE.WOLF_CUB],
  [10, ROLE.CURSE_WOLF],
  [12, ROLE.WOLF_SEER],
  [14, ROLE.WOLF_WITCH],
  [18, ROLE.WHITE_WOLF],
];
const VILLAGE_ROLE_UNLOCKS = [
  [5, ROLE.GUARD],
  [6, ROLE.WITCH],
  [8, ROLE.HUNTER],
  [9, ROLE.LITTLE_GIRL],
  [10, ROLE.HALF_WOLF],
  [11, ROLE.DETECTIVE],
  [12, ROLE.CUPID],
];
const SOLO_ROLE_UNLOCKS = [
  [10, ROLE.FOOL],
  [14, ROLE.SERIAL_KILLER],
  [16, ROLE.PIED_PIPER],
];

export function shuffle(items, random = Math.random) {
  const result = [...items];
  for (let index = result.length - 1; index > 0; index--) {
    const swapIndex = Math.floor(random() * (index + 1));
    [result[index], result[swapIndex]] = [result[swapIndex], result[index]];
  }
  return result;
}

export function buildRoleDeck(playerCount, random = Math.random, { excludedRoles = [] } = {}) {
  if (!Number.isInteger(playerCount) || playerCount < 4 || playerCount > 24) {
    throw new Error("Số người chơi Ma Sói phải từ 4 đến 24.");
  }
  // Phòng ít người ưu tiên Sói/Dân/Tiên Tri và luôn chừa ít nhất hai Dân thường.
  // Vai phức tạp được mở dần theo quy mô; Cupid chỉ xuất hiện từ 12 người.
  const wolfCount = playerCount <= 6
    ? 1
    : Math.min(6, 2 + Math.floor((playerCount - 7) / 4));
  const soloCount = playerCount >= 18 ? 2 : playerCount >= 10 ? 1 : 0;
  const villageCount = playerCount - wolfCount - soloCount;

  const excluded = new Set(excludedRoles);
  const unlocked = (entries) => entries
    .filter(([minimum, role]) => playerCount >= minimum && !excluded.has(role))
    .map(([, role]) => role);
  const wolfPool = [ROLE.WOLF, ...unlocked(WOLF_ROLE_UNLOCKS)];
  const villagePool = unlocked(VILLAGE_ROLE_UNLOCKS);
  const soloPool = unlocked(SOLO_ROLE_UNLOCKS);
  const roles = [ROLE.WOLF, ...shuffle(wolfPool, random).slice(0, wolfCount - 1)];
  roles.push(...shuffle(soloPool, random).slice(0, soloCount));

  if (villageCount > 0) roles.push(ROLE.SEER);
  const villageSpecialCount = Math.max(0, villageCount - 3);
  roles.push(...shuffle(villagePool, random).slice(0, villageSpecialCount));
  while (roles.length < playerCount) roles.push(ROLE.VILLAGER);
  return shuffle(roles, random);
}

export function isWolf(player) {
  if (!player) return false;
  if (player.role === ROLE.HALF_WOLF) return Boolean(player.converted);
  return [
    ROLE.WOLF,
    ROLE.WOLF_CUB,
    ROLE.CURSE_WOLF,
    ROLE.WOLF_SEER,
    ROLE.WOLF_WITCH,
    ROLE.WHITE_WOLF,
  ].includes(player.role);
}

export function canJoinWolfBite(player) {
  if (!player?.alive || !isWolf(player)) return false;
  return player.role !== ROLE.WOLF_WITCH;
}

export function roleName(playerOrRole) {
  const player = typeof playerOrRole === "string" ? null : playerOrRole;
  const role = player ? player.role : playerOrRole;
  const base = ROLE_INFO[role]?.name || role;
  return player?.role === ROLE.HALF_WOLF && player.converted ? `${base} (đã hóa Sói)` : base;
}

export function seerResult(player, framedIds = new Set()) {
  if (framedIds.has(player.id)) return "Sói";
  if (player.role === ROLE.WOLF_WITCH) return "Dân";
  return isWolf(player) ? "Sói" : "Dân";
}

export function livingPlayers(room) {
  return room.players.filter((player) => player.alive);
}

export function playerTeam(player) {
  if (isWolf(player)) return player.role === ROLE.WHITE_WOLF ? "white_wolf" : "wolf";
  return ROLE_INFO[player.role]?.team || "village";
}

export function determineWinner(room) {
  const alive = livingPlayers(room);
  if (alive.length === 0) return { type: "draw", winners: [], text: "Không còn ai sống sót" };

  if (alive.length === 1) {
    const only = alive[0];
    if (only.role === ROLE.WHITE_WOLF) {
      return { type: "white_wolf", winners: [only.id], text: "Sói Trắng là người sống sót duy nhất" };
    }
    if (only.role === ROLE.SERIAL_KILLER) {
      return { type: "serial", winners: [only.id], text: "Sát Thủ là người sống sót cuối cùng" };
    }
  }

  const pipers = alive.filter((player) => player.role === ROLE.PIED_PIPER);
  for (const piper of pipers) {
    if (alive.filter((player) => player.id !== piper.id).every((player) => player.charmed)) {
      return { type: "piper", winners: [piper.id], text: "Tất cả người còn sống đã bị mê hoặc" };
    }
  }

  if (
    alive.length === 2 &&
    alive[0].loverId === alive[1].id &&
    alive[1].loverId === alive[0].id &&
    playerTeam(alive[0]) !== playerTeam(alive[1])
  ) {
    return { type: "lovers", winners: alive.map((player) => player.id), text: "Cặp Người Yêu khác phe sống sót cùng nhau" };
  }

  const wolves = alive.filter(isWolf);
  if (wolves.length === 0) {
    const villagers = room.players.filter((player) => playerTeam(player) === "village");
    return { type: "village", winners: villagers.map((player) => player.id), text: "Phe Dân đã loại hết Sói" };
  }

  const packWolves = alive.filter((player) => playerTeam(player) === "wolf");
  const nonPack = alive.length - packWolves.length;
  if (packWolves.length > 0 && packWolves.length >= nonPack) {
    const pack = room.players.filter((player) => playerTeam(player) === "wolf");
    return { type: "wolf", winners: pack.map((player) => player.id), text: "Phe Sói đã áp đảo số người còn lại" };
  }
  return null;
}

export function selectWolfVictims(room, random = Math.random) {
  const voteCount = new Map();
  for (const targets of room.actions.wolfVotes.values()) {
    for (const targetId of targets) voteCount.set(targetId, (voteCount.get(targetId) || 0) + 1);
  }
  const ranked = shuffle([...voteCount.entries()], random).sort((a, b) => b[1] - a[1]);
  return ranked.slice(0, room.nightBiteCount || 1).map(([targetId]) => targetId);
}

export function linkLovers(room, firstId, secondId) {
  if (firstId === secondId) throw new Error("Phải ghép hai người khác nhau.");
  const first = room.players.find((player) => player.id === firstId && player.alive);
  const second = room.players.find((player) => player.id === secondId && player.alive);
  if (!first || !second) throw new Error("Người được ghép không còn hợp lệ.");
  first.loverId = second.id;
  second.loverId = first.id;
  return [first, second];
}

export function applyDeaths(room, initialDeaths) {
  const queue = initialDeaths.map((death) => ({ ...death }));
  const deaths = [];
  const seen = new Set();
  while (queue.length > 0) {
    const death = queue.shift();
    if (!death?.id || seen.has(death.id)) continue;
    const player = room.players.find((candidate) => candidate.id === death.id);
    if (!player?.alive) continue;
    seen.add(player.id);
    player.alive = false;
    player.deathCause = death.cause;
    deaths.push({ player, cause: death.cause });
    if (player.role === ROLE.WOLF_CUB) room.wolfCubBonus = (room.wolfCubBonus || 0) + 1;
    if (player.loverId) {
      const lover = room.players.find((candidate) => candidate.id === player.loverId);
      if (lover?.alive) queue.push({ id: lover.id, cause: `đau lòng theo ${player.name}` });
    }
  }
  return deaths;
}

export function createNightActions() {
  return {
    wolfVotes: new Map(),
    guardTarget: null,
    seerTarget: null,
    wolfSeerTarget: null,
    wolfWitchTarget: null,
    framedTarget: null,
    whiteWolfTarget: null,
    serialTarget: null,
    detectiveTargets: [],
    charmTargets: [],
    littleGirlPeek: false,
    witchHeal: false,
    witchPoisonTarget: null,
  };
}

export function createPlayer({ id, name, role, avatar = null }) {
  return {
    id: String(id),
    name: name || String(id),
    avatar,
    role,
    alive: true,
    converted: false,
    loverId: null,
    charmed: false,
    lastProtectedId: null,
    deathCause: null,
    will: "",
  };
}
