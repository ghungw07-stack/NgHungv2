/**
 * Tệp kiểm tra cho QuestService
 */

// Tạo một đối tượng người chơi giả lập với nhiệm vụ học kỹ năng
const mockPlayer = {
  id: 'test_player',
  name: 'Test Player',
  stat: {
    level: 5,
    hp: { current: 100, max: 100 },
    mp: { current: 50, max: 50 },
    attack: 20,
    defense: 15
  },
  skill: {
    active: [],
    passive: []
  },
  money: {
    gold: 1000,
    diamond: 10
  },
  quests: {
    active: [
      {
        id: 'quest_002',
        name: 'Huấn luyện kỹ năng',
        description: 'Để trở thành chiến binh mạnh mẽ, bạn cần học các kỹ năng chiến đấu cơ bản từ Huấn Luyện Viên Marcus.',
        type: 'main',
        objectives: [
          {
            id: 'q002_talk_trainer',
            type: 'talk',
            targetId: 'npc_trainer',
            targetName: 'Huấn Luyện Viên Marcus',
            required: 1,
            progress: 1,
            completed: true,
            description: 'Nói chuyện với Huấn Luyện Viên Marcus tại Sân Tập Luyện'
          },
          {
            id: 'q002_learn_slash',
            type: 'learn',
            targetId: 'skill_slash',
            targetName: 'Kỹ năng Đoạn Kiếm',
            required: 1,
            progress: 0,
            completed: false,
            description: 'Học kỹ năng Đoạn Kiếm từ Huấn Luyện Viên Marcus'
          }
        ]
      }
    ],
    completed: []
  },
  currentArea: 'training_ground',
  bag: []
};

// Giả lập dữ liệu nhiệm vụ
const mockQuestsData = {
  quests: [
    {
      id: 'quest_001',
      name: 'Hành trình bắt đầu',
      description: 'Chào mừng đến với thế giới của Zacl Warrior! Hãy bắt đầu hành trình của bạn bằng cách khám phá thị trấn và nói chuyện với Thị trưởng.',
      type: 'main',
      requirements: {
        level: 1
      },
      objectives: [
        {
          id: 'q001_talk_mayor',
          type: 'talk',
          targetId: 'npc_mayor',
          targetName: 'Thị Trưởng Eldor',
          required: 1,
          description: 'Nói chuyện với Thị trưởng Eldor trong thị trấn'
        },
        {
          id: 'q001_explore_training',
          type: 'explore',
          targetId: 'training_ground',
          targetName: 'Sân Tập Luyện',
          required: 1,
          description: 'Khám phá Sân Tập Luyện'
        }
      ],
      rewards: {
        gold: 50,
        exp: 100,
        items: [
          {
            id: 'hp1',
            name: 'Thuốc hồi HP nhỏ',
            amount: 2
          },
          {
            id: 'mp1',
            name: 'Thuốc hồi MP nhỏ',
            amount: 2
          }
        ]
      }
    },
    {
      id: 'quest_002',
      name: 'Huấn luyện kỹ năng',
      description: 'Để trở thành chiến binh mạnh mẽ, bạn cần học các kỹ năng chiến đấu cơ bản từ Huấn Luyện Viên Marcus.',
      type: 'main',
      requirements: {
        level: 2,
        prerequisiteQuests: ['quest_001']
      },
      objectives: [
        {
          id: 'q002_talk_trainer',
          type: 'talk',
          targetId: 'npc_trainer',
          targetName: 'Huấn Luyện Viên Marcus',
          required: 1,
          description: 'Nói chuyện với Huấn Luyện Viên Marcus tại Sân Tập Luyện'
        },
        {
          id: 'q002_learn_slash',
          type: 'learn',
          targetId: 'skill_slash',
          targetName: 'Kỹ năng Đoạn Kiếm',
          required: 1,
          description: 'Học kỹ năng Đoạn Kiếm từ Huấn Luyện Viên Marcus'
        }
      ],
      rewards: {
        gold: 100,
        exp: 150,
        skillPoints: 1,
        items: [
          {
            id: 'w_tansu_1',
            name: 'Kiếm Gỗ',
            amount: 1
          }
        ]
      }
    },
    {
      id: 'quest_003',
      name: 'Thợ săn quái vật',
      description: 'Rừng gần thị trấn đang bị quái vật tấn công. Hãy tiêu diệt một số quái vật để giúp bảo vệ thị trấn.',
      type: 'main',
      requirements: {
        level: 3,
        prerequisiteQuests: ['quest_002']
      },
      objectives: [
        {
          id: 'q003_kill_wolf',
          type: 'kill',
          targetId: 'wolf1',
          targetName: 'Sói rừng',
          required: 3,
          description: 'Tiêu diệt 3 Sói rừng trong Khu Rừng U Tối'
        }
      ],
      rewards: {
        gold: 200,
        exp: 250
      }
    }
  ]
};

// Hàm kiểm tra updateQuestProgress
function testUpdateQuestProgress() {
  console.log('===== KIỂM TRA updateQuestProgress =====');
  console.log('Người chơi trước khi cập nhật:', JSON.stringify(mockPlayer.quests, null, 2));
  
  // Cập nhật tiến trình nhiệm vụ
  const result = updateQuestProgress(mockPlayer, 'learn', 'skill_slash', 1, mockQuestsData);
  
  console.log('Kết quả cập nhật:', result);
  console.log('Người chơi sau khi cập nhật:', JSON.stringify(mockPlayer.quests, null, 2));
  
  return result;
}

/**
 * Cập nhật tiến trình nhiệm vụ
 * @param {Object} player - Đối tượng người chơi
 * @param {string} type - Loại nhiệm vụ
 * @param {string} targetId - ID mục tiêu
 * @param {number} amount - Số lượng
 * @param {Object} questsData - Dữ liệu nhiệm vụ
 * @returns {Object} Kết quả cập nhật
 */
function updateQuestProgress(player, type, targetId, amount, questsData) {
  if (!player.quests || !player.quests.active || player.quests.active.length === 0) {
    return { updated: false };
  }

  console.log(`Cập nhật tiến trình nhiệm vụ: type=${type}, targetId=${targetId}, amount=${amount}`);
  
  let questsUpdated = false;
  const completedQuests = [];
  const autoAssignedQuests = [];

  // Kiểm tra và cập nhật từng nhiệm vụ đang hoạt động
  for (const quest of player.quests.active) {
    if (!quest.objectives) {
      continue;
    }

    let questUpdated = false;
    for (const objective of quest.objectives) {
      if (!objective.type) {
        continue;
      }

      console.log(`Kiểm tra mục tiêu: ${objective.type} - ${objective.targetId || 'không có targetId'}`);
      
      const targetIdMatches = objective.targetId === targetId;
      const targetNameMatches =
        objective.targetName && targetId && objective.targetName.toLowerCase().includes(targetId.toLowerCase());
      const targetIdArrayMatches = Array.isArray(objective.targetId) && objective.targetId.includes(targetId);

      if (objective.type === type && (targetIdMatches || targetNameMatches || targetIdArrayMatches)) {
        console.log(`Tìm thấy mục tiêu phù hợp: ${objective.type} - ${objective.targetId}`);
        
        if (objective.progress === undefined) {
          objective.progress = 0;
        }

        objective.progress += amount;
        if (objective.progress >= (objective.required || 1)) {
          objective.completed = true;
          console.log(`Mục tiêu đã hoàn thành: ${objective.type} - ${objective.targetId}`);
        }

        questUpdated = true;
        questsUpdated = true;
      }
    }

    // Kiểm tra nếu tất cả mục tiêu đã hoàn thành
    if (questUpdated) {
      const allObjectivesCompleted = quest.objectives.every((obj) => obj.completed === true);
      if (allObjectivesCompleted) {
        // Đánh dấu nhiệm vụ đã hoàn thành
        quest.completed = true;
        quest.completedAt = new Date().toISOString();

        // Thêm vào danh sách nhiệm vụ đã hoàn thành
        completedQuests.push(quest);
      }
    }
  }

  // Di chuyển nhiệm vụ đã hoàn thành từ active sang completed
  if (completedQuests.length > 0) {
    // Đảm bảo mảng completed tồn tại
    if (!player.quests.completed) {
      player.quests.completed = [];
    }

    // Thêm nhiệm vụ đã hoàn thành vào mảng completed
    player.quests.completed.push(...completedQuests);

    // Xóa nhiệm vụ đã hoàn thành khỏi mảng active
    player.quests.active = player.quests.active.filter(
      (quest) => !completedQuests.some((completed) => completed.id === quest.id)
    );
  }

  // Tạo mảng progressUpdates để trả về thông tin tiến trình nhiệm vụ
  const progressUpdates = [];
  if (questsUpdated && player.quests.active) {
    player.quests.active.forEach(quest => {
      if (quest.objectives) {
        quest.objectives.forEach(objective => {
          if (!objective.completed && objective.progress !== undefined && objective.required !== undefined) {
            progressUpdates.push({
              questId: quest.id,
              questName: quest.name,
              objectiveType: objective.type,
              targetId: objective.targetId,
              current: objective.progress,
              required: objective.required
            });
          }
        });
      }
    });
  }

  const result = {
    updated: questsUpdated,
    completedQuests,
    autoAssignedQuests,
    progressUpdates
  };
  
  console.log(`Kết quả cập nhật nhiệm vụ:`, result);
  
  return result;
}

/**
 * Xử lý hoàn chỉnh luồng cập nhật nhiệm vụ (cập nhật tiến trình, phần thưởng, tìm nhiệm vụ tiếp theo)
 * @param {Object} player - Đối tượng người chơi
 * @param {string} type - Loại nhiệm vụ (talk, kill, collect, learn, explore, etc.)
 * @param {string} targetId - ID mục tiêu
 * @param {number} amount - Số lượng cập nhật
 * @returns {Object} Kết quả xử lý hoàn chỉnh
 */
function handleQuestProgressComplete(player, type, targetId, amount = 1) {
  console.log(`Xử lý cập nhật nhiệm vụ: type=${type}, targetId=${targetId}, amount=${amount}`);
  
  const questProgress = updateQuestProgress(player, type, targetId, amount, mockQuestsData);
  console.log(`Kết quả cập nhật chi tiết:`, questProgress);

  // Nếu không có cập nhật gì
  if (!questProgress.updated) {
    console.log(`Không có cập nhật nào cho nhiệm vụ`);
    return {
      success: false,
      message: "",
      questProgress: questProgress,
    };
  }

  let questMessage = "";

  // Xử lý nhiệm vụ đã hoàn thành
  if (questProgress.completedQuests && questProgress.completedQuests.length > 0) {
    questMessage += "\n\n🎯 NHIỆM VỤ ĐÃ HOÀN THÀNH:";
    console.log(`Có ${questProgress.completedQuests.length} nhiệm vụ đã hoàn thành`);

    for (const quest of questProgress.completedQuests) {
      questMessage += `\n- ${quest.name}`;

      // Thêm phần thưởng
      const rewards = getQuestRewards(player, quest);
      if (rewards.success) {
        questMessage += `\n${rewards.message}`;
      }
    }
  }

  // Thêm thông báo về tiến trình nhiệm vụ đang làm
  if (questProgress.progressUpdates && questProgress.progressUpdates.length > 0) {
    questMessage += "\n\n📈 TIẾN TRÌNH NHIỆM VỤ:";
    console.log(`Có ${questProgress.progressUpdates.length} cập nhật tiến trình`);
    
    questProgress.progressUpdates.forEach((update) => {
      questMessage += `\n- ${update.questName}: ${update.current}/${update.required}`;
      console.log(`Cập nhật tiến trình: ${update.questName} - ${update.current}/${update.required}`);
    });
  }

  const result = {
    success: true,
    message: questMessage.trim(),
    questProgress: questProgress,
  };
  
  console.log(`Thông báo nhiệm vụ cuối cùng: ${result.message}`);
  
  return result;
}

/**
 * Xử lý phần thưởng từ nhiệm vụ
 * @param {Object} player - Thông tin người chơi
 * @param {Object} quest - Thông tin nhiệm vụ
 * @returns {Object} - Kết quả xử lý
 */
function getQuestRewards(player, quest) {
  if (!quest.rewards) {
    return {
      success: false,
      message: "Nhiệm vụ này không có phần thưởng.",
    };
  }

  let rewardMessage = "🎁 PHẦN THƯỞNG:\n";

  if (quest.rewards.exp) {
    rewardMessage += `- ${quest.rewards.exp} kinh nghiệm\n`;
  }

  if (quest.rewards.gold) {
    rewardMessage += `- ${quest.rewards.gold} vàng\n`;
  }

  if (quest.rewards.skillPoints) {
    rewardMessage += `- ${quest.rewards.skillPoints} điểm kỹ năng\n`;
  }

  if (quest.rewards.items && Array.isArray(quest.rewards.items)) {
    quest.rewards.items.forEach((item) => {
      rewardMessage += `- ${item.name || item.id} x${item.amount || 1}\n`;
    });
  }

  return {
    success: true,
    message: rewardMessage,
  };
}

// Hàm kiểm tra handleQuestProgressComplete
function testHandleQuestProgressComplete() {
  console.log('\n===== KIỂM TRA handleQuestProgressComplete =====');
  
  // Reset người chơi
  mockPlayer.quests = {
    active: [
      {
        id: 'quest_002',
        name: 'Huấn luyện kỹ năng',
        description: 'Để trở thành chiến binh mạnh mẽ, bạn cần học các kỹ năng chiến đấu cơ bản từ Huấn Luyện Viên Marcus.',
        type: 'main',
        objectives: [
          {
            id: 'q002_talk_trainer',
            type: 'talk',
            targetId: 'npc_trainer',
            targetName: 'Huấn Luyện Viên Marcus',
            required: 1,
            progress: 1,
            completed: true,
            description: 'Nói chuyện với Huấn Luyện Viên Marcus tại Sân Tập Luyện'
          },
          {
            id: 'q002_learn_slash',
            type: 'learn',
            targetId: 'skill_slash',
            targetName: 'Kỹ năng Đoạn Kiếm',
            required: 1,
            progress: 0,
            completed: false,
            description: 'Học kỹ năng Đoạn Kiếm từ Huấn Luyện Viên Marcus'
          }
        ]
      }
    ],
    completed: []
  };
  
  console.log('Người chơi trước khi cập nhật:', JSON.stringify(mockPlayer.quests, null, 2));
  
  // Xử lý cập nhật tiến trình nhiệm vụ
  const result = handleQuestProgressComplete(mockPlayer, 'learn', 'skill_slash', 1);
  
  console.log('Kết quả xử lý:', result);
  console.log('Người chơi sau khi cập nhật:', JSON.stringify(mockPlayer.quests, null, 2));
  
  return result;
}

// Chạy các hàm kiểm tra
function runTests() {
  try {
    testUpdateQuestProgress();
    testHandleQuestProgressComplete();
  } catch (error) {
    console.error('Lỗi khi chạy kiểm tra:', error);
  }
}

runTests(); 