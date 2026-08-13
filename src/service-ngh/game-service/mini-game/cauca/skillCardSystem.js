import { loadPlayerData, savePlayerData } from "./dataManager.js";
import config from "./game_config.json" assert { type: "json" };

export function getSkillCard(id) {
  return config.skillCards.find(c => c.id === id);
}

function normalizeSkillCards(player) {
  if (Array.isArray(player.inventory.skillCards)) {
    const stack = {};
    for (const id of player.inventory.skillCards) {
      stack[id] = (stack[id] || 0) + 1;
    }
    player.inventory.skillCards = stack;
  } else if (!player.inventory.skillCards) {
    player.inventory.skillCards = {};
  }
}


export function useSkillCard(player, cardInput) {
  normalizeSkillCards(player);

  const skillCards = player.inventory.skillCards;
  const availableCards = Object.keys(skillCards);

  if (availableCards.length === 0)
    return "📭 Bạn không có thẻ kỹ năng nào trong túi!";
  let cardId = cardInput;
  const index = parseInt(cardInput);
  if (!isNaN(index)) {
    if (index < 1 || index > availableCards.length)
      return `⚠️ Vui lòng nhập số từ 1 đến ${availableCards.length}.`;
    cardId = availableCards[index - 1];
  }

  const card = getSkillCard(cardId);
  if (!card) return "⚠️ Thẻ kỹ năng không tồn tại!";
  if (!skillCards[cardId]) return "⚠️ Bạn không có thẻ kỹ năng này trong túi!";

  const now = Date.now();
  const durationMs = card.durationMinutes * 60 * 1000;
  const expires = now + durationMs;

  player.activeSkillCards = player.activeSkillCards || {};

  if (player.activeSkillCards[cardId]) {
    const active = player.activeSkillCards[cardId];
    active.expires += durationMs; 
    for (const [k, v] of Object.entries(card.effects || {})) {
      active.effects[k] = (active.effects[k] || 0) + v;
    }
  } else {
    player.activeSkillCards[cardId] = {
      expires,
      effects: { ...card.effects }
    };
  }

  if (skillCards[cardId] > 1) skillCards[cardId]--;
  else delete skillCards[cardId];
  const allPlayers = loadPlayerData();
  allPlayers[player.userId] = player;
  savePlayerData(allPlayers);

  return `✨ Đã kích hoạt ${card.name}!\n⏳ Hiệu lực: ${card.durationMinutes} phút\n${card.description}`;
}

export function checkActiveSkills(player) {
  const now = Date.now();
  if (!player.activeSkillCards) return;
  for (const [id, data] of Object.entries(player.activeSkillCards)) {
    if (data.expires <= now) delete player.activeSkillCards[id];
  }
}

export function getSkillCardList(player) {
  if (!player.inventory.skillCards || player.inventory.skillCards.length === 0)
    return "📭 Bạn chưa có thẻ kỹ năng nào. Mua tại shop hoặc nhận từ sự kiện.";

  let cardCounts = {};

  if (Array.isArray(player.inventory.skillCards)) {
    for (const id of player.inventory.skillCards) {
      cardCounts[id] = (cardCounts[id] || 0) + 1;
    }
  } else {
    cardCounts = { ...player.inventory.skillCards };
  }

  const cards = Object.entries(cardCounts)
    .map(([id, count], i) => {
      const c = getSkillCard(id);
      if (!c) return `${i + 1}. ❓ Thẻ không xác định (ID: ${id}) x${count}`;
      return `${i + 1}. ${c.name} (${c.rarity}) x${count}\n   💬 ${c.description}`;
    })
    .join("\n\n");

  return `🎴 TÚI THẺ KỸ NĂNG\n\n${cards}\n\n📘 Dùng: \`fishing skill use <số>\` để kích hoạt thẻ theo thứ tự.`;
}

