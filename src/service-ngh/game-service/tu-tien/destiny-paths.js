const PATH_ALIASES = {
  phandien: "villain",
  phanvien: "villain",
  villain: "villain",
  ma: "villain",
  khivan: "chosen",
  khivanchitu: "chosen",
  thienmenh: "chosen",
  chosen: "chosen",
};

export const DESTINY_PATHS = {
  villain: {
    name: "Phản Diện",
    icon: "🌑",
    scoreName: "Điểm Phản Diện",
    passive: "Điểm càng cao, chiến lực càng mạnh; tối đa +12%.",
    quests: [
      { name: "Cướp Cơ Duyên Đầu Tiên", story: "Thiên kiêu chưa trưởng thành. Cơ duyên trong tay hắn nên đổi chủ.", event: "hunt_win", target: 2, objective: "Thắng 2 trận săn yêu", reward: { score: 12, cultivation: 350, stones: 600 } },
      { name: "Trấn Áp Thiên Kiêu", story: "Đạp thiên kiêu dưới chân trước mặt quần hùng, cướp lấy đạo tâm của hắn.", event: "pvp_win", target: 1, objective: "Thắng 1 trận PK hoặc Đấu Trường", reward: { score: 18, cultivation: 700, stones: 1200 } },
      { name: "Đoạt Bảo Bí Cảnh", story: "Bảo vật có đức giả cư chi? Không, kẻ mạnh mới xứng đáng.", event: "dungeon_win", target: 2, objective: "Thắng 2 ải phó bản", reward: { score: 24, cultivation: 1400, stones: 2200 } },
      { name: "Nghịch Thiên Đoạt Mệnh", story: "Thiên kiếp là xiềng xích. Phá nó, nuốt lấy mệnh số của trời.", event: "breakthrough", target: 1, objective: "Đột phá thành công 1 lần", reward: { score: 32, cultivation: 2600, stones: 4000 } },
      { name: "Chém Hộ Đạo Giả", story: "Hộ đạo giả đã xuất hiện. Giết hắn, con đường của thiên mệnh sẽ đứt đoạn.", event: "boss_win", target: 3, objective: "Hạ 3 Boss", reward: { score: 45, cultivation: 5200, stones: 8000 } },
      { name: "Ma Chủ Giáng Lâm", story: "Lấy chư thiên làm bàn cờ, lấy chúng sinh làm quân cờ.", event: "world_boss_hit", target: 3, objective: "Đánh Boss Thế Giới 3 lần", reward: { score: 70, cultivation: 12000, stones: 18000 } },
    ],
  },
  chosen: {
    name: "Khí Vận Chi Tử",
    icon: "☀️",
    scoreName: "Khí Vận",
    passive: "Khí vận tăng tốc tu luyện và tỷ lệ rơi đồ; tối đa +12% và +20%.",
    quests: [
      { name: "Thiên Mệnh Thức Tỉnh", story: "Một sợi kim quang nhập thể. Thiên địa bắt đầu xoay quanh vận mệnh của ngươi.", event: "cultivate", target: 3, objective: "Tu luyện 3 lần", reward: { score: 12, cultivation: 450, stones: 450 } },
      { name: "Rơi Vực Gặp Kỳ Duyên", story: "Bị truy sát đến tuyệt lộ, ngươi lại tìm thấy truyền thừa dưới vực sâu.", event: "hunt_win", target: 2, objective: "Thắng 2 trận săn yêu", reward: { score: 18, cultivation: 850, stones: 900 } },
      { name: "Phá Cảnh Trong Tuyệt Cảnh", story: "Kẻ khác gặp tử kiếp, ngươi gặp bàn đạp bước lên cảnh giới mới.", event: "breakthrough", target: 1, objective: "Đột phá thành công 1 lần", reward: { score: 24, cultivation: 1700, stones: 1600 } },
      { name: "Bí Cảnh Nhận Chủ", story: "Cổ điện đóng kín vạn năm tự mở cửa khi ngươi tới gần.", event: "dungeon_win", target: 2, objective: "Thắng 2 ải phó bản", reward: { score: 32, cultivation: 3200, stones: 3000 } },
      { name: "Thần Thú Hộ Đạo", story: "Hung thú khiến vạn người khiếp sợ lại cúi đầu trước khí vận của ngươi.", event: "boss_win", target: 3, objective: "Hạ 3 Boss", reward: { score: 45, cultivation: 6500, stones: 6000 } },
      { name: "Thiên Mệnh Quy Nhất", story: "Đánh bại mọi đối thủ cùng thế hệ, độc chiếm đại thế của một đời.", event: "pvp_win", target: 2, objective: "Thắng 2 trận PK hoặc Đấu Trường", reward: { score: 70, cultivation: 14000, stones: 14000 } },
    ],
  },
};

export function normalizeDestinyPath(value) {
  const normalized = String(value || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/đ/gi, "d").toLowerCase().replace(/[^a-z]/g, "");
  return PATH_ALIASES[normalized] || null;
}

export function chooseDestinyPath(player, value) {
  const key = normalizeDestinyPath(value);
  if (!key) return { success: false, error: "Mệnh cách không hợp lệ." };
  if (player.destiny?.path && player.destiny.path !== key) return { success: false, error: "Mệnh cách đã định, không thể đổi." };
  player.destiny ||= { path: key, chapter: 0, progress: 0, score: 0, chosenAt: Date.now() };
  return { success: true, path: DESTINY_PATHS[key] };
}

export function currentDestinyQuest(player) {
  const state = player?.destiny;
  const path = state && DESTINY_PATHS[state.path];
  if (!path) return null;
  const chapter = Math.max(0, Math.floor(Number(state.chapter) || 0));
  return { state, path, chapter, quest: path.quests[chapter] || null };
}

export function advanceDestinyQuest(player, event, amount = 1) {
  const current = currentDestinyQuest(player);
  if (!current?.quest || current.quest.event !== event) return false;
  current.state.progress = Math.min(current.quest.target, Math.max(0, Number(current.state.progress) || 0) + Math.max(0, Number(amount) || 0));
  return true;
}

export function claimDestinyQuest(player) {
  const current = currentDestinyQuest(player);
  if (!current) return { success: false, error: "Chưa chọn mệnh cách." };
  if (!current.quest) return { success: false, complete: true, error: "Đã hoàn thành toàn bộ thiên mệnh." };
  if ((current.state.progress || 0) < current.quest.target) return { success: false, error: "Nhiệm vụ chưa hoàn thành." };
  const reward = current.quest.reward;
  current.state.score = Math.max(0, Number(current.state.score) || 0) + reward.score;
  current.state.chapter = current.chapter + 1;
  current.state.progress = 0;
  current.state.lastClaimedAt = Date.now();
  return { success: true, path: current.path, quest: current.quest, reward, complete: current.state.chapter >= current.path.quests.length };
}

export function destinyBonuses(player) {
  const state = player?.destiny;
  const score = Math.max(0, Number(state?.score) || 0);
  if (state?.path === "villain") return { power: 1 + Math.min(0.12, score * 0.0007), cultivation: 1, drop: 1 };
  if (state?.path === "chosen") return { power: 1, cultivation: 1 + Math.min(0.12, score * 0.0007), drop: 1 + Math.min(0.2, score * 0.0012) };
  return { power: 1, cultivation: 1, drop: 1 };
}

export function destinyTitle(player) {
  const current = currentDestinyQuest(player);
  if (!current) return "Chưa định mệnh cách";
  return `${current.path.icon} ${current.path.name} · ${current.path.scoreName} ${Math.max(0, Number(current.state.score) || 0)}`;
}
