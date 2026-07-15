import { loadPlayerData, savePlayerData } from "./dataManager.js";

const dailyQuestTemplates = [
  {
    id: "fish_common_10",
    description: "🎣 Câu 10 con cá thường",
    type: "fish_common",
    target: 10,
    reward: { exp: 4500, money: 5000 },
  },
  {
    id: "fish_rare_5",
    description: "🐠 Câu 5 con cá hiếm",
    type: "fish_rare",
    target: 5,
    reward: { exp: 6000, money: 5000 },
  },
  {
    id: "fish_legend_1",
    description: "🌟 Câu 1 con cá huyền thoại",
    type: "fish_legend",
    target: 1,
    reward: { exp: 5000, ticket: 10 },
  },
  {
    id: "boss_attack",
    description: "⚔️ Gây 2000 sát thương cho Boss",
    type: "boss_damage",
    target: 2000,
    reward: { exp: 4000, money: 5000 },
  },
  {
    id: "pet_feed_3",
    description: "🍖 Cho thú cưng ăn 3 lần",
    type: "pet_feed",
    target: 3,
    reward: { exp: 20000, money: 20000 },
  },
  {
    id: "fish_any_20",
    description: "🎣 Câu tổng cộng 20 con cá bất kỳ",
    type: "fish_any",
    target: 20,
    reward: { exp: 2500, money: 1500 },
  },
  {
    id: "fish_legendary_3",
    description: "🌟 Câu 3 con cá huyền thoại",
    type: "fish_legend",
    target: 3,
    reward: { exp: 10000, money: 12000, ticket: 5 },
  },
  {
    id: "fish_mythical_1",
    description: "🐉 Câu 1 con cá thần thoại",
    type: "fish_mythical",
    target: 1,
    reward: { exp: 15000, money: 20000, ticket: 10 },
  },
  {
    id: "use_bait_10",
    description: "🪱 Sử dụng 10 mồi câu",
    type: "bait_use",
    target: 10,
    reward: { exp: 4000, money: 3000 },
  },
  {
    id: "use_potion_1",
    description: "🧪 Dùng 1 bình thuốc tăng EXP hoặc Vàng",
    type: "potion_use",
    target: 1,
    reward: { exp: 5000, money: 4000 },
  },
  {
    id: "spin_3",
    description: "🎰 Quay vòng quay may mắn 3 lần",
    type: "spin_lucky",
    target: 3,
    reward: { exp: 6000, money: 6000 },
  },
  {
    id: "fish_sell_10",
    description: "💰 Bán 10 con cá bất kỳ",
    type: "fish_sell",
    target: 10,
    reward: { exp: 3000, money: 7000 },
  },
  {
    id: "chat_5",
    description: "💬 Trò chuyện trong nhóm 5 lần",
    type: "chat_group",
    target: 5,
    reward: { exp: 2000, money: 1500 },
  },
  {
    id: "upgrade_rod_1",
    description: "🔧 Nâng cấp cần câu 1 lần",
    type: "rod_upgrade",
    target: 1,
    reward: { exp: 7000, money: 5000 },
  },
  {
    id: "catch_extra_3",
    description: "🎁 Bắt thêm cá 3 lần nhờ hiệu ứng tool/pet",
    type: "extra_catch",
    target: 3,
    reward: { exp: 8000, money: 6000 },
  },
  {
    id: "quest_complete_2",
    description: "✅ Hoàn thành 2 nhiệm vụ bất kỳ",
    type: "quest_complete",
    target: 2,
    reward: { exp: 10000, money: 8000, ticket: 2 },
  },
  {
    id: "pet_levelup_1",
    description: "🐾 Tăng cấp cho thú cưng 1 lần",
    type: "pet_levelup",
    target: 1,
    reward: { exp: 12000, money: 10000 },
  },
  {
    id: "event_participate_1",
    description: "🎆 Tham gia sự kiện hoặc boss event 1 lần",
    type: "event_join",
    target: 1,
    reward: { exp: 15000, money: 20000, ticket: 3 },
  },
];

export function assignDailyQuests(player) {
  const today = new Date().toDateString();
  if (player.daily?.date === today && player.daily.quests) return;

  const shuffled = [...dailyQuestTemplates].sort(() => 0.5 - Math.random());
  const selected = shuffled.slice(0, 3);

  player.daily = {
    date: today,
    quests: selected.map(q => ({
      id: q.id,
      description: q.description,
      progress: 0,
      target: q.target,
      reward: q.reward,
      completed: false,
      claimed: false,
      type: q.type,
    })),
  };
}

export function updateDailyProgress(player, type, amount = 1) {
  if (!player.daily || !player.daily.quests) return;

  for (let quest of player.daily.quests) {
    if (quest.type === type && !quest.completed) {
      quest.progress += amount;
      if (quest.progress >= quest.target) quest.completed = true;
    }
  }
}

export function handleDailyCommand(prefix, player, userName, args) {
  assignDailyQuests(player);

  if (args[0] === "claim") {
    const index = parseInt(args[1]) - 1;
    if (isNaN(index) || index < 0 || index >= player.daily.quests.length)
      return "⚠️ Số nhiệm vụ không hợp lệ!";

    const quest = player.daily.quests[index];
    if (!quest.completed) return "⏳ Nhiệm vụ chưa hoàn thành!";
    if (quest.claimed) return "✅ Bạn đã nhận thưởng nhiệm vụ này rồi!";

    quest.claimed = true;
    const { exp = 0, money = 0, ticket = 0 } = quest.reward;

    player.exp += exp;
    player.money += money;
    player.inventory.tickets = (player.inventory.tickets || 0) + ticket;

    const allPlayers = loadPlayerData();
    allPlayers[player.userId] = player;
    savePlayerData(allPlayers);

    return (
      `🎉 Bạn đã nhận thưởng từ nhiệm vụ:\n${quest.description}\n\n` +
      `⭐ +${exp} EXP\n💰 +${money} VND\n🎟️ +${ticket} Vé`
    );
  }

  const quests = player.daily.quests
    .map((q, i) => {
      const status = q.completed
        ? q.claimed
          ? "✅ Đã nhận"
          : "🎁 Hoàn thành!"
        : `📊 ${q.progress}/${q.target}`;
      return `${i + 1}. ${q.description}\n   ➤ ${status}`;
    })
    .join("\n\n");

  return (
    `📅 NHIỆM VỤ HẰNG NGÀY - ${userName}\n\n${quests}\n\n` +
    `💡 Gõ ${prefix}fishing nv claim <số> để nhận thưởng`
  );
}
