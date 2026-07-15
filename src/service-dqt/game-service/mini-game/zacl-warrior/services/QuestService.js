/**
 * QuestService.js
 * Service xử lý các thao tác liên quan đến nhiệm vụ - dựa trên logic từ hệ thống cũ
 */

import { getGameDataInstance } from "../core/GameData.js";
import { getGameManagerInstance } from "../core/GameManager.js";
import { getServiceRegistry } from "./ServiceRegistry.js";
import chalk from "chalk";
import Player from "../models/Player.js";

export class QuestService {
  constructor() {
    /** @type {import('../core/GameData.js').GameData} */
    this.gameData = getGameDataInstance();

    /** @type {import('../core/GameManager.js').GameManager} */
    this.gameManager = getGameManagerInstance();

    // Lấy registry để truy cập các service khi cần
    this._registry = getServiceRegistry();
    
    // Cache quest data
    this.cachedQuests = null;
  }

  /**
   * Lấy một service từ registry
   * @param {string} serviceName - Tên service
   * @returns {Object} Service instance
   */
  getService(serviceName) {
    return this._registry.getService(serviceName);
  }
  
  /**
   * Lấy PlayerService
   * @returns {import('./PlayerService.js').PlayerService}
   */
  get playerService() {
    return this.getService('PlayerService');
  }
  
  /**
   * Lấy ItemService
   * @returns {import('./ItemService.js').ItemService}
   */
  get itemService() {
    return this.getService('ItemService');
  }

  /**
   * Lấy AreaService
   * @returns {import('./AreaService.js').AreaService}
   */
  get areaService() {
    return this.getService('AreaService');
  }
  
  /**
   * Lấy MonsterService
   * @returns {import('./MonsterService.js').MonsterService}
   */
  get monsterService() {
    return this.getService('MonsterService');
  }

  /**
   * Xử lý lệnh nhiệm vụ
   * @param {Player} player - Đối tượng người chơi
   * @param {Array} args - Tham số lệnh
   * @returns {Promise<Object>} Kết quả xử lý
   */
  async handleQuest(player, args = []) {
    if (!player.quests) {
      player.quests = {
        active: [],
        completed: [],
      };
    }

    const questsData = await this.gameManager.getQuestsData();
    const npcsData = await this.gameManager.getNpcsData();

    if (!args || args.length === 0) {
      if (
        (!player.quests.active || player.quests.active.length === 0) &&
        (!player.quests.completed || player.quests.completed.length === 0)
      ) {
        const firstQuest = questsData.quests.find((q) => q.id === "quest_001");
        if (firstQuest) {
          const assignResult = this.assignQuestToPlayer(player, firstQuest);
          if (assignResult.success) {
            const questStatus = this.getActiveQuestsStatus(player, questsData);
            return {
              success: true,
              message: `📜 Bạn đã bắt đầu hành trình của mình!\n\n${questStatus}`,
            };
          }
        }
      }

      // Nếu không có nhiệm vụ đang làm, tìm nhiệm vụ tiếp theo
      if (!player.quests.active || player.quests.active.length === 0) {
        let nextAvailableQuest = null;
        let levelRequirement = 0;
        let nextQuestId = "";

        // Nếu đã hoàn thành ít nhất một nhiệm vụ
        if (player.quests.completed && player.quests.completed.length > 0) {
          // Sắp xếp nhiệm vụ đã hoàn thành theo ID nếu là quest_XXX
          const completedMainQuests = player.quests.completed
            .filter((id) => id.startsWith("quest_"))
            .map((id) => ({
              id,
              num: parseInt(id.replace("quest_", "")),
            }))
            .sort((a, b) => b.num - a.num); // Sắp xếp giảm dần

          if (completedMainQuests.length > 0) {
            const lastCompletedQuestId = completedMainQuests[0].id;
            const lastNumber = completedMainQuests[0].num;
            nextQuestId = `quest_${String(lastNumber + 1).padStart(3, "0")}`;

            // Tìm nhiệm vụ tiếp theo theo ID
            nextAvailableQuest = questsData.quests.find((q) => q.id === nextQuestId);

            // Nếu không tìm thấy theo ID thứ tự, tìm dựa trên điều kiện tiên quyết
            if (!nextAvailableQuest) {
              nextAvailableQuest = questsData.quests.find(
                (q) =>
                  q.requirements &&
                  q.requirements.prerequisiteQuests &&
                  q.requirements.prerequisiteQuests.includes(lastCompletedQuestId) &&
                  !player.quests.completed.includes(q.id)
              );
            }

            // Lưu yêu cầu cấp độ nếu có
            if (nextAvailableQuest && nextAvailableQuest.requirements && nextAvailableQuest.requirements.level) {
              levelRequirement = nextAvailableQuest.requirements.level;
            }
          }
        } else {
          // Nếu chưa hoàn thành nhiệm vụ nào, đề xuất nhiệm vụ đầu tiên
          nextAvailableQuest = questsData.quests.find((q) => q.id === "quest_001");
        }

        // Kiểm tra có nhiệm vụ tiếp theo không
        if (nextAvailableQuest) {
          // Kiểm tra điều kiện cấp độ
          if (levelRequirement > 0 && player.stat.level < levelRequirement) {
            return {
              success: true,
              message: `⚠️ Nhiệm vụ tiếp theo "${nextAvailableQuest.name}" yêu cầu cấp độ ${levelRequirement}, nhưng cấp độ hiện tại của bạn là ${player.stat.level}.\n\n💪 Hãy tiêu diệt quái vật để tăng cấp đủ điều kiện nhận nhiệm vụ!`,
            };
          } else {
            // Tự động gán nhiệm vụ tiếp theo nếu đủ điều kiện
            const assignResult = this.assignQuestToPlayer(player, nextAvailableQuest);
            if (assignResult.success) {
              const questStatus = this.getActiveQuestsStatus(player, questsData);
              return {
                success: true,
                message: `📜 Bạn đã nhận nhiệm vụ mới!\n\n${questStatus}`,
              };
            }
          }
        } else {
          return {
            success: true,
            message: "🏆 Bạn đã hoàn thành xuất sắc các nhiệm vụ đã giao, vui lòng chờ nhiệm vụ mới.",
          };
        }
      }

      const questStatus = this.getActiveQuestsStatus(player, questsData);
      return {
        success: true,
        message: questStatus,
      };
    }

    const action = args[0].toLowerCase();

    // Xem danh sách nhiệm vụ phụ có thể nhận (nhiệm vụ ngoại tuyến)
    if (action === "list") {
      // Lọc ra các nhiệm vụ phụ
      const sideQuests = questsData.quests.filter((q) => q.type === "side" || q.type === "daily" || q.type === "event");

      // Lọc ra các nhiệm vụ phụ có thể nhận
      const availableSideQuests = sideQuests.filter((quest) => {
        // Đã hoàn thành và không lặp lại thì bỏ qua
        if (player.quests.completed && player.quests.completed.includes(quest.id) && !quest.repeatable) {
          return false;
        }

        // Đã nhận rồi thì bỏ qua
        if (player.quests.active && player.quests.active.some((q) => q.id === quest.id)) {
          return false;
        }

        // Kiểm tra cấp độ
        if (quest.requirements && quest.requirements.level && player.stat.level < quest.requirements.level) {
          return false;
        }

        // Kiểm tra nhiệm vụ tiên quyết
        if (quest.requirements && quest.requirements.prerequisiteQuests) {
          for (const prereqId of quest.requirements.prerequisiteQuests) {
            if (!player.quests.completed || !player.quests.completed.includes(prereqId)) {
              return false;
            }
          }
        }

        return true;
      });

      if (availableSideQuests.length === 0) {
        return {
          success: true,
          message: "Hiện tại không có nhiệm vụ phụ nào khả dụng cho bạn.",
        };
      }

      let message = "⭐ Nhiệm vụ phụ có thể thực hiện:\n\n";

      availableSideQuests.forEach((quest, index) => {
        message += `${index + 1}. ${quest.name}\n`;
        message += `📝 ${quest.description}\n`;

        if (quest.requirements && quest.requirements.level) {
          message += `📊 Yêu cầu: Cấp độ ${quest.requirements.level}\n`;
        }

        // Hiển thị phần thưởng
        message += "🎁 Phần thưởng: ";
        const rewards = [];
        if (quest.rewards.gold) rewards.push(`${quest.rewards.gold} Vàng`);
        if (quest.rewards.exp) rewards.push(`${quest.rewards.exp} Kinh nghiệm`);
        if (quest.rewards.skillPoints) rewards.push(`${quest.rewards.skillPoints} Điểm kỹ năng`);
        if (quest.rewards.items && quest.rewards.items.length > 0) {
          const itemNames = quest.rewards.items.map((item) => `${item.name || item.id} x${item.amount || 1}`);
          rewards.push(itemNames.join(", "));
        }

        message += rewards.join(", ") + "\n\n";
      });

      message += "Nhiệm vụ phụ cần tìm đến NPC tương ứng để kích hoạt.";

      return {
        success: true,
        message: message,
      };
    }

    // Kiểm tra tiến trình nhiệm vụ cụ thể
    if (action === "info") {
      if (args.length < 2) {
        return {
          success: false,
          message: "Bạn cần chỉ định ID nhiệm vụ muốn xem! Ví dụ: `quest info quest_001`",
        };
      }

      const questId = args[1];
      const activeQuest = player.quests.active.find((q) => q.id === questId);

      if (!activeQuest) {
        return {
          success: false,
          message: `Bạn không có nhiệm vụ đang làm với ID "${questId}"`,
        };
      }

      let message = `📜 ${activeQuest.name}\n\n`;
      message += `📝 ${activeQuest.description}\n\n`;

      // Hiển thị tiến trình từng mục tiêu
      if (activeQuest.objectives && activeQuest.objectives.length > 0) {
        message += "🎯 Mục tiêu:\n";

        activeQuest.objectives.forEach((objective) => {
          const progress = objective.progress || 0;
          const required = objective.required || 1;
          const completed = objective.completed ? "✅" : "⬜";

          let objectiveText = "";
          switch (objective.type) {
            case "kill":
              objectiveText = `Tiêu diệt ${objective.targetName || objective.targetId}`;
              break;
            case "collect":
              objectiveText = `Thu thập ${objective.targetName || objective.targetId}`;
              break;
            case "talk":
              objectiveText = `Nói chuyện với ${objective.targetName || objective.targetId}`;
              break;
            case "explore":
              objectiveText = `Khám phá ${objective.targetName || objective.targetId}`;
              break;
            default:
              objectiveText = objective.description || "Hoàn thành mục tiêu";
          }

          message += `${completed} ${objectiveText}: ${progress}/${required}\n`;
        });
      }

      return {
        success: true,
        message: message,
      };
    }

    return {
      success: false,
      message: "Lệnh quest không hợp lệ! Sử dụng `quest`, `quest list`, hoặc `quest info [id]`.",
    };
  }

  /**
   * Lấy danh sách nhiệm vụ đang làm của người chơi
   * @param {Player} player - Thông tin người chơi
   * @param {Object} questsData - Dữ liệu nhiệm vụ
   * @returns {string} - Thông tin nhiệm vụ đang làm
   */
  getActiveQuestsStatus(player, questsData) {
    if (!player.quests.active || player.quests.active.length === 0) {
      // Nếu có questsData, kiểm tra xem có nhiệm vụ tiếp theo không
      if (questsData && questsData.quests && player.quests.completed && player.quests.completed.length > 0) {
        // Sắp xếp nhiệm vụ đã hoàn thành theo ID nếu là quest_XXX
        const completedMainQuests = player.quests.completed
          .filter((id) => id.startsWith("quest_"))
          .map((id) => ({
            id,
            num: parseInt(id.replace("quest_", "")),
          }))
          .sort((a, b) => b.num - a.num); // Sắp xếp giảm dần

        if (completedMainQuests.length > 0) {
          const lastCompletedQuestId = completedMainQuests[0].id;
          const lastNumber = completedMainQuests[0].num;
          const nextQuestId = `quest_${String(lastNumber + 1).padStart(3, "0")}`;

          // Tìm nhiệm vụ tiếp theo theo ID
          let nextAvailableQuest = questsData.quests.find((q) => q.id === nextQuestId);

          // Nếu không tìm thấy theo ID thứ tự, tìm dựa trên điều kiện tiên quyết
          if (!nextAvailableQuest) {
            nextAvailableQuest = questsData.quests.find(
              (q) =>
                q.requirements &&
                q.requirements.prerequisiteQuests &&
                q.requirements.prerequisiteQuests.includes(lastCompletedQuestId) &&
                !player.quests.completed.includes(q.id)
            );
          }

          // Nếu tìm thấy nhiệm vụ tiếp theo
          if (nextAvailableQuest) {
            // Kiểm tra điều kiện cấp độ
            let requirementMessage = "";

            // Kiểm tra yêu cầu cấp độ
            if (
              nextAvailableQuest.requirements &&
              nextAvailableQuest.requirements.level &&
              player.stat.level < nextAvailableQuest.requirements.level
            ) {
              requirementMessage += `⚠️ Nhiệm vụ tiếp theo "${nextAvailableQuest.name}" yêu cầu cấp độ ${nextAvailableQuest.requirements.level}, nhưng cấp độ hiện tại của bạn là ${player.stat.level}.\n\n`;
            }

            if (requirementMessage) {
              return (
                requirementMessage +
                "💪 Hãy tiêu diệt quái vật để tăng cấp và cải thiện trang bị để đủ điều kiện nhận nhiệm vụ!"
              );
            }
          }
        }
      }

      return "Bạn chưa nhận nhiệm vụ nào. Hãy tìm NPC có biểu tượng ⭐ để nhận nhiệm vụ mới!";
    }

    let message = "📋 Nhiệm vụ đang làm:\n\n";

    player.quests.active.forEach((quest, index) => {
      message += `${index + 1}. ${quest.name}\n`;
      message += `📝 ${quest.description}\n\n`;

      // Hiển thị tiến trình từng mục tiêu
      if (quest.objectives && quest.objectives.length > 0) {
        message += "🎯 Mục tiêu:\n";

        quest.objectives.forEach((objective) => {
          const progress = objective.progress || 0;
          const required = objective.required || 1;
          const completed = objective.completed ? "✅" : "⬜";

          let objectiveText = "";
          switch (objective.type) {
            case "kill":
              objectiveText = `Tiêu diệt ${objective.targetName || objective.targetId}`;
              break;
            case "collect":
              objectiveText = `Thu thập ${objective.targetName || objective.targetId}`;
              break;
            case "talk":
              objectiveText = `Nói chuyện với ${objective.targetName || objective.targetId}`;
              break;
            case "explore":
              objectiveText = `Khám phá ${objective.targetName || objective.targetId}`;
              break;
            default:
              objectiveText = objective.description || "Hoàn thành mục tiêu";
          }

          message += `${completed} ${objectiveText}: ${progress}/${required}\n`;
        });
      }

      message += "\n";
    });

    return message;
  }

  /**
   * Gán nhiệm vụ cho người chơi mà không cần chấp nhận
   * @param {Player} player - Thông tin người chơi
   * @param {Object} quest - Thông tin nhiệm vụ
   * @returns {Object} Kết quả gán nhiệm vụ
   */
  assignQuestToPlayer(player, quest) {
    if (!player.quests) {
      player.quests = {
        active: [],
        completed: [],
      };
    }

    if (!player.quests.active) {
      player.quests.active = [];
    }

    // Kiểm tra xem người chơi đã có nhiệm vụ này chưa
    const existingQuest = player.quests.active.find((q) => q.id === quest.id);
    if (existingQuest) {
      return {
        success: false,
        message: `Bạn đã nhận nhiệm vụ "${quest.name}" rồi.`,
      };
    }

    // Kiểm tra xem người chơi đã hoàn thành nhiệm vụ này chưa
    if (player.quests.completed && player.quests.completed.includes(quest.id)) {
      return {
        success: false,
        message: `Bạn đã hoàn thành nhiệm vụ "${quest.name}" rồi.`,
      };
    }

    // Kiểm tra cấp độ yêu cầu
    if (quest.requirements && quest.requirements.level && player.stat.level < quest.requirements.level) {
      return {
        success: false,
        message: `Bạn cần đạt cấp độ ${quest.requirements.level} để nhận nhiệm vụ này.`,
      };
    }

    // Kiểm tra nhiệm vụ tiên quyết
    if (quest.requirements && quest.requirements.prerequisiteQuests) {
      for (const prereqId of quest.requirements.prerequisiteQuests) {
        if (!player.quests.completed || !player.quests.completed.includes(prereqId)) {
          return {
            success: false,
            message: `Bạn cần hoàn thành nhiệm vụ tiên quyết trước khi nhận nhiệm vụ này.`,
          };
        }
      }
    }

    // Tạo bản sao của nhiệm vụ để thêm vào danh sách active
    const questCopy = JSON.parse(JSON.stringify(quest));

    // Khởi tạo trạng thái cho các mục tiêu
    if (questCopy.objectives) {
      for (const objective of questCopy.objectives) {
        objective.progress = 0;
        objective.completed = false;
      }
    }

    // Thêm vào danh sách nhiệm vụ đang thực hiện
    player.quests.active.push(questCopy);

    return {
      success: true,
      message: `📜 Bạn đã nhận nhiệm vụ mới: ${quest.name}\n\n📝 ${quest.description}`,
      quest: questCopy,
    };
  }

  /**
   * Cập nhật tiến trình nhiệm vụ
   * @param {Player} player - Đối tượng người chơi
   * @param {string} type - Loại nhiệm vụ
   * @param {string} targetId - ID mục tiêu
   * @param {number} amount - Số lượng
   * @param {Object} questsData - Dữ liệu nhiệm vụ
   * @returns {Object} Kết quả cập nhật
   */
  updateQuestProgress(player, type, targetId, amount, questsData) {
    if (!player.quests || !player.quests.active || player.quests.active.length === 0) {
      return { updated: false };
    }

    let questsUpdated = false;

    // Kiểm tra và cập nhật từng nhiệm vụ đang hoạt động
    for (const quest of player.quests.active) {
      if (!quest.objectives) {
        continue;
      }

      let questUpdated = false;
      
      // Kiểm tra nếu đây là hành động talk và thứ tự các mục tiêu cần được tuân thủ
      if (type === "talk") {
        // Tìm mục tiêu talk trong danh sách các mục tiêu
        const talkObjective = quest.objectives.find(obj => 
          obj.type === "talk" && 
          (obj.targetId === targetId || 
          (Array.isArray(obj.targetId) && obj.targetId.includes(targetId)) ||
          (obj.targetName && targetId && obj.targetName.toLowerCase().includes(targetId.toLowerCase())))
        );
        
        // Nếu tìm thấy mục tiêu talk
        if (talkObjective) {
          // Kiểm tra xem các mục tiêu khác loại talk có hoàn thành chưa
          const otherObjectives = quest.objectives.filter(obj => obj !== talkObjective);
          const hasUncompletedObjectives = otherObjectives.some(obj => !obj.completed);
          
          // Nếu còn mục tiêu chưa hoàn thành và mục tiêu talk là cuối cùng trong list
          // (dựa vào thứ tự trong mảng objectives), thì không cho phép hoàn thành mục tiêu talk
          const talkObjectiveIndex = quest.objectives.indexOf(talkObjective);
          const isFinalObjective = talkObjectiveIndex === quest.objectives.length - 1;
          
          if (hasUncompletedObjectives && isFinalObjective) {
            // Bỏ qua việc cập nhật mục tiêu talk vì các mục tiêu khác chưa hoàn thành
            continue;
          }
        }
      }
      
      for (const objective of quest.objectives) {
        if (!objective.type) {
          continue;
        }

        // Kiểm tra trùng khớp chính xác ID
        const targetIdMatches = objective.targetId === targetId;
        
        // Kiểm tra trùng khớp tên
        const targetNameMatches =
          objective.targetName && targetId && objective.targetName.toLowerCase().includes(targetId.toLowerCase());
        
        // Kiểm tra trùng khớp trong mảng ID
        const targetIdArrayMatches = Array.isArray(objective.targetId) && objective.targetId.includes(targetId);
        
        // Kiểm tra nếu targetId chứa ID của objective (trường hợp monster_slime và slime)
        const partialIdMatch = 
          objective.targetId && 
          targetId && 
          (targetId.includes(objective.targetId) || objective.targetId.includes(targetId));
        
        // Kiểm tra nếu một trong các yếu tố của objective là "any"
        const wildcardMatch = 
          objective.targetId === "any" || 
          (Array.isArray(objective.targetId) && objective.targetId.includes("any"));

        if (objective.type === type && (targetIdMatches || targetNameMatches || targetIdArrayMatches || partialIdMatch || wildcardMatch)) {
          if (type === "talk") {
            const objectiveIndex = quest.objectives.indexOf(objective);
            const isLastObjective = objectiveIndex === quest.objectives.length - 1;
            
            if (isLastObjective) {
              const previousObjectives = quest.objectives.slice(0, objectiveIndex);
              const allPreviousCompleted = previousObjectives.every(obj => obj.completed === true);
              
              if (!allPreviousCompleted) {
                continue;
              }
            }
          }
          
          if (objective.progress === undefined) {
            objective.progress = 0;
          }

          objective.progress += amount;
          if (objective.progress >= (objective.required || 1)) {
            objective.completed = true;
          }

          questUpdated = true;
          questsUpdated = true;
        }
      }

      if (questUpdated) {
        const allObjectivesCompleted = quest.objectives.every((obj) => obj.completed === true);
        if (allObjectivesCompleted) {
        }
      }
    }

    // Kiểm tra nếu nhiệm vụ nào đã hoàn thành
    const completedQuests = [];
    player.quests.active = player.quests.active.filter((quest) => {
      // Kiểm tra xem tất cả các mục tiêu đã hoàn thành chưa
      const allCompleted = quest.objectives && quest.objectives.every((obj) => obj.completed === true);

      if (allCompleted) {
        completedQuests.push(quest);

        // Thêm vào danh sách nhiệm vụ đã hoàn thành
        if (!player.quests.completed) {
          player.quests.completed = [];
        }

        // Kiểm tra xem nhiệm vụ đã được đánh dấu hoàn thành chưa
        if (!player.quests.completed.includes(quest.id)) {
          player.quests.completed.push(quest.id);
        }

        return false; // Loại bỏ khỏi danh sách active
      }
      return true; // Giữ lại nhiệm vụ chưa hoàn thành
    });

    // Tự động gán nhiệm vụ tiếp theo nếu có questsData
    const autoAssignedQuests = [];
    if (questsData && completedQuests.length > 0) {
      for (const completedQuest of completedQuests) {
        // Tìm tất cả các nhiệm vụ có prerequisiteQuests chứa ID nhiệm vụ vừa hoàn thành
        let availableQuests = questsData.quests.filter(
          (q) =>
            q.requirements &&
            q.requirements.prerequisiteQuests &&
            q.requirements.prerequisiteQuests.includes(completedQuest.id) &&
            q.requirements.level <= player.stat.level &&
            (!player.quests.completed || !player.quests.completed.includes(q.id)) &&
            (!player.quests.active || !player.quests.active.some((active) => active.id === q.id))
        );

        // Nếu không tìm thấy nhiệm vụ tiếp theo bằng prerequisiteQuests,
        // thử tìm theo thứ tự ID (nếu ID có dạng quest_XXX)
        if (availableQuests.length === 0 && completedQuest.id.startsWith("quest_")) {
          try {
            // Trích xuất số thứ tự nhiệm vụ hiện tại và tăng lên 1
            const currentQuestNumber = parseInt(completedQuest.id.replace("quest_", ""));
            if (!isNaN(currentQuestNumber)) {
              const nextQuestId = `quest_${String(currentQuestNumber + 1).padStart(3, "0")}`;

              // Tìm nhiệm vụ tiếp theo theo ID
              const nextQuestById = questsData.quests.find((q) => q.id === nextQuestId);
              if (
                nextQuestById &&
                (!player.quests.completed || !player.quests.completed.includes(nextQuestId)) &&
                (!player.quests.active || !player.quests.active.some((active) => active.id === nextQuestId))
              ) {
                availableQuests.push(nextQuestById);
              }
            }
          } catch (e) {
            // Bỏ qua lỗi nếu có
            console.error("Lỗi khi tìm nhiệm vụ tiếp theo theo ID:", e);
          }
        }

        // Ưu tiên nhiệm vụ chính (main) trước
        const mainQuests = availableQuests.filter((q) => q.type === "main");
        const questsToAssign = mainQuests.length > 0 ? mainQuests : availableQuests;

        // Lọc những nhiệm vụ đủ yêu cầu cấp độ
        const eligibleQuests = questsToAssign.filter((q) => {
          // Kiểm tra yêu cầu cấp độ
          if (q.requirements && q.requirements.level && q.requirements.level > player.stat.level) {
            return false;
          }
          return true;
        });

        // Tự động gán nhiệm vụ tiếp theo nếu đủ cấp độ
        if (eligibleQuests.length > 0) {
          for (const nextQuest of eligibleQuests) {
            const assignResult = this.assignQuestToPlayer(player, nextQuest);
            if (assignResult.success) {
              autoAssignedQuests.push(nextQuest);
              // Chỉ gán một nhiệm vụ tiếp theo cho mỗi nhiệm vụ đã hoàn thành
              break;
            }
          }
        }
      }
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
                required: objective.required,
                description: objective.description,
              });
            }
          });
        }
      });
    }

    return {
      updated: questsUpdated,
      completedQuests,
      autoAssignedQuests,
      progressUpdates
    };
  }

  /**
   * Cập nhật tiến trình nhiệm vụ và trả về kết quả chi tiết
   * @param {Player} player - Đối tượng người chơi
   * @param {string} type - Loại nhiệm vụ (talk, kill, collect, learn, etc.)
   * @param {string} targetId - ID mục tiêu
   * @param {number} amount - Số lượng cập nhật
   * @returns {Promise<Object>} Kết quả chi tiết
   */
  async updateQuestProgressWithDetails(player, type, targetId, amount = 1) {
    const questsData = await this.gameManager.getQuestsData();
    const result = this.updateQuestProgress(player, type, targetId, amount, questsData);

    // Lưu dữ liệu player nếu có cập nhật
    if (result.updated) {
      this.gameData.markPlayerDataChanged();
      
      // Thêm thông tin chi tiết về các nhiệm vụ đã cập nhật
      result.completedQuests = [];
      result.progressedQuests = [];
      
      // Kiểm tra các nhiệm vụ đã hoàn thành
      if (player.quests && player.quests.active) {
        for (const quest of player.quests.active) {
          const isCompleted = quest.objectives && quest.objectives.every(obj => obj.completed === true);
          
          if (isCompleted) {
            // Tìm thông tin nhiệm vụ đầy đủ
            const fullQuest = questsData.quests.find(q => q.id === quest.id);
            if (fullQuest) {
              result.completedQuests.push({
                id: quest.id,
                name: fullQuest.name || quest.name
              });
            }
          } else if (quest.objectives) {
            // Thêm thông tin về các nhiệm vụ đang tiến triển
            const matchingObjectives = quest.objectives.filter(obj => 
              obj.type === type && 
              (obj.targetId === targetId || 
               (Array.isArray(obj.targetId) && obj.targetId.includes(targetId)) ||
               (obj.targetName && targetId && obj.targetName.toLowerCase().includes(targetId.toLowerCase())) ||
               (targetId && obj.targetId && (targetId.includes(obj.targetId) || obj.targetId.includes(targetId)))
              )
            );
            
            if (matchingObjectives.length > 0) {
              const fullQuest = questsData.quests.find(q => q.id === quest.id);
              
              for (const obj of matchingObjectives) {
                if (!obj.completed) {
                  result.progressedQuests.push({
                    questId: quest.id,
                    questName: fullQuest?.name || quest.name,
                    objectiveType: obj.type,
                    targetId: obj.targetId,
                    progress: obj.progress,
                    required: obj.required || 1
                  });
                }
              }
            }
          }
        }
      }
      
      player.save();
    }

    return result;
  }

  /**
   * Xử lý phần thưởng từ nhiệm vụ
   * @param {Player} player - Thông tin người chơi
   * @param {Object} quest - Thông tin nhiệm vụ
   * @returns {Object} - Kết quả xử lý
   */
  getQuestRewards(player, quest) {
    if (!quest.rewards) {
      return {
        success: false,
        message: "Nhiệm vụ này không có phần thưởng.",
      };
    }

    let rewardMessage = "🎁 PHẦN THƯỞNG:\n";

    if (quest.objectives && Array.isArray(quest.objectives)) {
      for (const obj of quest.objectives) {
        if (obj.type === "collect" && obj.targetId) {
          const removeAmount = obj.required || 1;
          player.removeItemFromBag(obj.targetId, removeAmount);
        }
      }
    }

    if (quest.rewards.exp) {
      const expResult = player.addExp(quest.rewards.exp);
      rewardMessage += `- ${quest.rewards.exp} kinh nghiệm\n`;

      if (expResult.levelUp) {
        rewardMessage += `- 🎉 Lên cấp ${player.stat.level - expResult.levelsGained} → ${player.stat.level}\n`;
      }
    }

    if (quest.rewards.gold) {
      player.money.gold += quest.rewards.gold;
      rewardMessage += `- ${quest.rewards.gold} vàng\n`;
    }

    if (quest.rewards.skillPoints) {
      if (!player.stat.skillPoint) {
        player.stat.skillPoint = 0;
      }
      player.stat.skillPoint += quest.rewards.skillPoints;
      rewardMessage += `- ${quest.rewards.skillPoints} điểm kỹ năng\n`;
    }

    if (quest.rewards.items && Array.isArray(quest.rewards.items)) {
      quest.rewards.items.forEach((item) => {
        const addResult = player.addItemToBag({
          ...item,
          amount: item.amount || 1,
        });

        if (!addResult.success) {
          rewardMessage += `- Không thể thêm ${item.name || item.id}: ${addResult.message}\n`;
        } else {
          rewardMessage += `- ${item.name || item.id} x${item.amount || 1}\n`;
        }
      });
    }

    return {
      success: true,
      message: rewardMessage,
    };
  }

  /**
   * Kiểm tra nếu một NPC là một phần của nhiệm vụ đang hoạt động
   * @param {Player} player - Thông tin người chơi
   * @param {string} npcId - ID của NPC
   * @returns {boolean} - Kết quả kiểm tra
   */
  isNpcQuestRelated(player, npcId) {
    if (!player.quests.active || player.quests.active.length === 0) {
      return false;
    }

    for (const quest of player.quests.active) {
      if (!quest.objectives) continue;

      for (const objective of quest.objectives) {
        if (
          objective.type === "talk" &&
          (objective.targetId === npcId || (Array.isArray(objective.targetId) && objective.targetId.includes(npcId)))
        ) {
          return !objective.completed;
        }
      }
    }

    return false;
  }

  /**
   * Kiểm tra nếu một quái vật là một phần của nhiệm vụ đang hoạt động
   * @param {Player} player - Thông tin người chơi
   * @param {string} monsterId - ID của quái vật
   * @returns {boolean} - Kết quả kiểm tra
   */
  isMonsterQuestRelated(player, monsterId) {
    if (!player.quests.active || player.quests.active.length === 0) {
      return false;
    }

    for (const quest of player.quests.active) {
      if (!quest.objectives) continue;

      for (const objective of quest.objectives) {
        if (
          objective.type === "kill" &&
          (objective.targetId === monsterId ||
            (Array.isArray(objective.targetId) && objective.targetId.includes(monsterId)))
        ) {
          return !objective.completed;
        }
      }
    }

    return false;
  }

  /**
   * Tạo thông báo cập nhật trạng thái nhiệm vụ với định dạng chuẩn
   * @param {Player} player - Thông tin người chơi
   * @param {Array} completedQuests - Danh sách nhiệm vụ đã hoàn thành
   * @param {Array} autoAssignedQuests - Danh sách nhiệm vụ mới được tự động gán
   * @param {Object} questsData - Dữ liệu nhiệm vụ
   * @param {Object} npcsData - Dữ liệu NPC
   * @returns {string} - Thông báo cập nhật nhiệm vụ
   */
  async formatQuestStatusUpdate(
    player,
    completedQuests = [],
    autoAssignedQuests = [],
    questsData = null,
    npcsData = null
  ) {
    let message = "";

    if (completedQuests && completedQuests.length > 0) {
      completedQuests.forEach((quest) => {
        message += `\n\n🏆 Nhiệm vụ "${quest.name}" đã hoàn thành!`;
      });
    }

    if (!questsData) {
      questsData = await this.gameManager.getQuestsData();
    }
    if (!npcsData) {
      npcsData = await this.gameManager.getNpcsData();
    }

    let nextQuest = null;
    let levelRequirement = 0;

    if (player.quests.completed && player.quests.completed.length > 0) {
      const completedMainQuests = player.quests.completed
        .filter((id) => id.startsWith("quest_"))
        .map((id) => ({
          id,
          num: parseInt(id.replace("quest_", "")),
        }))
        .sort((a, b) => b.num - a.num);

      if (completedMainQuests.length > 0) {
        const lastCompletedQuestId = completedMainQuests[0].id;
        const lastNumber = completedMainQuests[0].num;
        const nextQuestId = `quest_${String(lastNumber + 1).padStart(3, "0")}`;

        nextQuest = questsData.quests.find((q) => q.id === nextQuestId);

        if (!nextQuest) {
          nextQuest = questsData.quests.find(
            (q) =>
              q.requirements &&
              q.requirements.prerequisiteQuests &&
              q.requirements.prerequisiteQuests.includes(lastCompletedQuestId) &&
              !player.quests.completed.includes(q.id)
          );
        }

        if (nextQuest && nextQuest.requirements && nextQuest.requirements.level) {
          levelRequirement = nextQuest.requirements.level;
        }
      }
    } else {
      nextQuest = questsData.quests.find(
        (q) => q.id === "quest_001" && !player.quests.active.some((activeQuest) => activeQuest.id === q.id)
      );
    }

    if (autoAssignedQuests && autoAssignedQuests.length > 0) {
      message += "\n\n📢 NHIỆM VỤ MỚI ĐÃ ĐƯỢC GIAO:";
      autoAssignedQuests.forEach((quest) => {
        message += `\n- ${quest.name}`;
        if (quest.description) {
          message += `\n  ${quest.description}`;
        }
      });
    }
    // Nếu không có nhiệm vụ tự động gán và không có nhiệm vụ đang thực hiện
    else if ((!player.quests.active || player.quests.active.length === 0) && nextQuest) {
      // Kiểm tra điều kiện cấp độ
      if (levelRequirement > 0 && player.stat.level < levelRequirement) {
        message += `\n\n📜 Nhiệm vụ tiếp theo "${nextQuest.name}" cần cấp độ ${levelRequirement} (cấp độ hiện tại: ${player.stat.level})`;
      } else {
        // Tìm NPC cung cấp nhiệm vụ tiếp theo
        const questGiver = npcsData.npcs.find((n) => n.quests && n.quests.includes(nextQuest.id));

        if (questGiver) {
          message += `\n📜 Nhiệm vụ tiếp theo: ${nextQuest.name}`;
          message += `\n📌 Hãy tìm ${questGiver.name} để nhận nhiệm vụ này!`;
        } else {
          message += `\n📜 Nhiệm vụ tiếp theo: ${nextQuest.name}`;
        }
      }
    } else if (!player.quests.active || player.quests.active.length === 0) {
      message += "\n\n🏆 Bạn đã hoàn thành tất cả các nhiệm vụ hiện có!";
    } else {
      // Nếu đang có nhiệm vụ đang thực hiện, hiển thị tiến trình
      const activeQuest = player.quests.active[0]; // Lấy nhiệm vụ đầu tiên
      if (activeQuest && activeQuest.objectives) {
        message += `\n\n📜 Nhiệm vụ hiện tại: ${activeQuest.name}`;
        activeQuest.objectives.forEach((obj) => {
          const progress = obj.progress || 0;
          const required = obj.required || 1;
          const completed = obj.completed ? "✅" : `(${progress}/${required})`;
          message += `\n- ${obj.description || obj.type} ${completed}`;
        });
      } else {
        message += "\n\n📜 Tiến trình nhiệm vụ đã được cập nhật!";
      }
    }

    return message;
  }

  /**
   * Kiểm tra vật phẩm nhiệm vụ rơi từ quái vật
   * @param {Player} player - Đối tượng người chơi
   * @param {string} monsterId - ID của quái vật
   * @param {Object} questsData - Dữ liệu nhiệm vụ
   * @returns {Array} - Danh sách vật phẩm nhiệm vụ rơi
   */
  checkQuestItemDrops(player, monsterId, questsData) {
    if (!player.quests.active || player.quests.active.length === 0) {
      return [];
    }

    const droppedItems = [];

    // Kiểm tra từng nhiệm vụ đang hoạt động
    for (const activeQuest of player.quests.active) {
      const questId = activeQuest.id;

      // Tìm dữ liệu đầy đủ của nhiệm vụ
      const questData = questsData.quests.find((q) => q.id === questId);
      if (!questData || !questData.dropChances || !questData.dropChances[monsterId]) {
        continue;
      }

      // Lấy bảng tỉ lệ rơi vật phẩm cho quái vật này
      const dropTable = questData.dropChances[monsterId];

      // Kiểm tra từng vật phẩm có thể rơi
      for (const [itemId, chance] of Object.entries(dropTable)) {
        // Kiểm tra nếu người chơi cần vật phẩm này cho nhiệm vụ
        const needsItem =
          activeQuest.objectives &&
          activeQuest.objectives.some((obj) => obj.type === "collect" && obj.targetId === itemId && !obj.completed);

        if (needsItem) {
          // Tạo số ngẫu nhiên từ 0 đến 100
          const randomValue = Math.random() * 100;

          // Nếu số ngẫu nhiên nhỏ hơn cơ hội rơi, thêm vào danh sách
          if (randomValue < chance) {
            droppedItems.push({
              id: itemId,
              questId: questId,
              amount: 1,
            });
          }
        }
      }
    }

    return droppedItems;
  }

  /**
   * Xử lý vật phẩm nhiệm vụ
   * @param {Player} player - Đối tượng người chơi
   * @param {Object} item - Thông tin vật phẩm
   * @param {Object} itemsData - Dữ liệu vật phẩm
   * @param {Object} questsData - Dữ liệu nhiệm vụ
   * @returns {Object} - Kết quả xử lý
   */
  async processQuestItem(player, item, itemsData, questsData) {
    // Tìm nhiệm vụ liên quan
    const activeQuest = player.quests.active.find((q) => q.id === item.questId);
    if (!activeQuest) {
      return {
        success: false,
        message: `Không tìm thấy nhiệm vụ ${item.questId}`,
      };
    }

    // Tìm thông tin đầy đủ về vật phẩm
    const itemInfo = itemsData.items.find((i) => i.id === item.id);
    const itemName = itemInfo ? itemInfo.name : item.id;

    // Cập nhật tiến trình nhiệm vụ
    const result = await this.updateQuestProgressWithDetails(player, "collect", item.id, item.amount || 1);

    // Thêm vật phẩm vào túi đồ người chơi
    const addItemResult = player.addItemToBag({
      id: item.id,
      name: itemName,
      amount: item.amount || 1,
      isQuestItem: true,
    });

    return {
      success: true,
      itemAdded: addItemResult.success,
      questUpdated: result.updated,
      message: `Nhận được ${itemName} x${item.amount || 1} cho nhiệm vụ ${activeQuest.name}`,
    };
  }

  /**
   * Xử lý hoàn chỉnh luồng cập nhật nhiệm vụ (cập nhật tiến trình, phần thưởng, tìm nhiệm vụ tiếp theo)
   * @param {Player} player - Đối tượng người chơi
   * @param {string} type - Loại nhiệm vụ (talk, kill, collect, learn, explore, etc.)
   * @param {string} targetId - ID mục tiêu
   * @param {number} amount - Số lượng cập nhật
   * @returns {Promise<Object>} Kết quả xử lý hoàn chỉnh
   */
  async handleQuestProgressComplete(player, type, targetId, amount = 1) {
    // Nếu là nhiệm vụ talk, kiểm tra xem có thể thực hiện không
    if (type === "talk" && player.quests && player.quests.active && player.quests.active.length > 0) {
      // Kiểm tra xem có nhiệm vụ nào có mục tiêu talk với NPC này không
      let hasUncompletedObjectives = false;
      let talkAllowed = true;
      
      for (const quest of player.quests.active) {
        if (!quest.objectives) continue;
        
        // Tìm mục tiêu talk trong danh sách các mục tiêu
        const talkObjective = quest.objectives.find(obj => 
          obj.type === "talk" && 
          (obj.targetId === targetId || 
          (Array.isArray(obj.targetId) && obj.targetId.includes(targetId)) ||
          (obj.targetName && targetId && obj.targetName.toLowerCase().includes(targetId.toLowerCase())))
        );
        
        if (talkObjective) {
          // Nếu mục tiêu talk là cuối cùng trong danh sách mục tiêu
          const talkObjectiveIndex = quest.objectives.indexOf(talkObjective);
          const isFinalObjective = talkObjectiveIndex === quest.objectives.length - 1;
          
          if (isFinalObjective) {
            // Kiểm tra các mục tiêu trước đó đã hoàn thành chưa
            const previousObjectives = quest.objectives.slice(0, talkObjectiveIndex);
            const allPreviousCompleted = previousObjectives.every(obj => obj.completed === true);
            
            if (!allPreviousCompleted) {
              hasUncompletedObjectives = true;
              talkAllowed = false;
              
              // Nếu talk không được phép, trả về thông báo
              return {
                success: false,
                message: "❌ Bạn cần hoàn thành các mục tiêu khác của nhiệm vụ trước khi báo cáo với NPC này.",
                questProgress: { updated: false }
              };
            }
          }
        }
      }
    }
    
    const questProgress = await this.updateQuestProgressWithDetails(player, type, targetId, amount);

    // Nếu không có cập nhật gì
    if (!questProgress.updated) {
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

      for (const quest of questProgress.completedQuests) {
        questMessage += `\n- ${quest.name}`;

        // Thêm phần thưởng
        const rewards = this.getQuestRewards(player, quest);
        if (rewards.success) {
          questMessage += `\n${rewards.message}`;
        }
      }

      // Tìm nhiệm vụ tiếp theo dựa vào nhiệm vụ đã hoàn thành gần nhất
      const lastCompletedQuest = questProgress.completedQuests[questProgress.completedQuests.length - 1];
      if (lastCompletedQuest) {
        const nextQuestInfo = await this.findAndAssignNextQuest(player, lastCompletedQuest);
        if (nextQuestInfo.message) {
          questMessage += nextQuestInfo.message;
        }
      }
    }

    // Thêm thông báo về tiến trình nhiệm vụ đang làm
    if (questProgress.progressUpdates && questProgress.progressUpdates.length > 0) {
      questMessage += "\n\n📈 TIẾN TRÌNH NHIỆM VỤ:";
      questProgress.progressUpdates.forEach((update) => {
        questMessage += `\n- ${update.description}: ${update.current}/${update.required}`;
      });
    }

    return {
      success: true,
      message: questMessage,
      questProgress: questProgress,
    };
  }

  /**
   * Tìm nhiệm vụ tiếp theo dựa vào nhiệm vụ đã hoàn thành
   * @param {Player} player - Đối tượng người chơi
   * @param {Object} completedQuest - Nhiệm vụ vừa hoàn thành
   * @returns {Promise<Object>} Thông tin nhiệm vụ tiếp theo
   */
  async findNextQuest(player, completedQuest) {
    const questsData = await this.gameManager.getQuestsData();
    let nextQuestMessage = "";
    let nextQuest = null; // Khai báo biến nextQuest ở đầu

    // Tìm nhiệm vụ tiếp theo dựa vào ID (đối với nhiệm vụ chính)
    const mainQuestMatch = completedQuest.id.match(/quest_(\d+)/);
    if (mainQuestMatch) {
      const lastNumber = parseInt(mainQuestMatch[1]);
      const nextQuestId = `quest_${String(lastNumber + 1).padStart(3, "0")}`;
      nextQuest = questsData.quests.find((q) => q.id === nextQuestId);

      if (nextQuest) {
        nextQuestMessage += "\n📜 NHIỆM VỤ TIẾP THEO:";
        nextQuestMessage += `\n- ${nextQuest.name}`;

        // Kiểm tra điều kiện cấp độ
        if (nextQuest.requirements && nextQuest.requirements.level) {
          if (player.stat.level < nextQuest.requirements.level) {
            nextQuestMessage += `\n⚠️ Yêu cầu: Cấp độ ${nextQuest.requirements.level} (cấp hiện tại: ${player.stat.level})`;
          } else {
            nextQuestMessage += `\n✅ Đủ điều kiện để nhận nhiệm vụ này!`;
          }
        }

        // Kiểm tra điều kiện nhiệm vụ tiên quyết
        if (nextQuest.requirements && nextQuest.requirements.prerequisiteQuests) {
          const missingPrereqs = nextQuest.requirements.prerequisiteQuests.filter(
            (prereqId) => !player.quests.completed.includes(prereqId)
          );

          if (missingPrereqs.length > 0) {
            nextQuestMessage += "\n⚠️ Yêu cầu hoàn thành các nhiệm vụ:";
            missingPrereqs.forEach((prereqId) => {
              const prereqQuest = questsData.quests.find((q) => q.id === prereqId);
              if (prereqQuest) {
                nextQuestMessage += `\n  - ${prereqQuest.name}`;
              }
            });
          }
        }
      }
    }

    return {
      message: nextQuestMessage,
      nextQuest: nextQuest,
    };
  }

  /**
   * Tìm và tự động gán nhiệm vụ tiếp theo dựa vào nhiệm vụ đã hoàn thành
   * @param {Player} player - Đối tượng người chơi
   * @param {Object} completedQuest - Nhiệm vụ vừa hoàn thành
   * @returns {Promise<Object>} Thông tin nhiệm vụ tiếp theo
   */
  async findAndAssignNextQuest(player, completedQuest) {
    const questsData = await this.gameManager.getQuestsData();
    let nextQuestMessage = "";
    let nextQuest = null;

    // Tìm nhiệm vụ tiếp theo dựa vào ID (đối với nhiệm vụ chính)
    const mainQuestMatch = completedQuest.id.match(/quest_(\d+)/);
    if (mainQuestMatch) {
      const lastNumber = parseInt(mainQuestMatch[1]);
      const nextQuestId = `quest_${String(lastNumber + 1).padStart(3, "0")}`;
      nextQuest = questsData.quests.find((q) => q.id === nextQuestId);

      if (nextQuest) {
        // Kiểm tra xem có thể tự động gán nhiệm vụ không
        const canAccept = this.canAcceptQuest(player, nextQuest);

        if (canAccept.canAccept) {
          // Tự động gán nhiệm vụ
          const assignResult = this.assignQuestToPlayer(player, nextQuest);
          if (assignResult.success) {
            nextQuestMessage += "\n📜 TỰ ĐỘNG NHẬN NHIỆM VỤ TIẾP THEO:";
            nextQuestMessage += `\n- ${nextQuest.name}`;
            nextQuestMessage += `\n📝 ${nextQuest.description}`;

            // Lưu dữ liệu
            this.gameData.markPlayerDataChanged();
          } else {
            nextQuestMessage += "\n📜 NHIỆM VỤ TIẾP THEO:";
            nextQuestMessage += `\n- ${nextQuest.name}`;
            nextQuestMessage += `\n❌ Không thể tự động nhận: ${assignResult.reason}`;
          }
        } else {
          nextQuestMessage += "\n\n📜 NHIỆM VỤ TIẾP THEO:";
          nextQuestMessage += `\n📝 ${nextQuest.name}`;
          nextQuestMessage += `\n⚠️ ${canAccept.reason}`;
        }
      }
    }

    return {
      message: nextQuestMessage,
      nextQuest: nextQuest,
      autoAssigned: nextQuest && nextQuestMessage.includes("TỰ ĐỘNG NHẬN"),
    };
  }

  /**
   * Kiểm tra xem người chơi có đủ điều kiện nhận nhiệm vụ
   * @param {Player} player - Đối tượng người chơi
   * @param {Object} quest - Nhiệm vụ cần kiểm tra
   * @returns {Object} Kết quả kiểm tra
   */
  canAcceptQuest(player, quest) {
    if (!quest) {
      return {
        canAccept: false,
        reason: "Nhiệm vụ không tồn tại",
      };
    }

    // Kiểm tra nếu nhiệm vụ đã hoàn thành
    if (player.quests.completed && player.quests.completed.includes(quest.id)) {
      return {
        canAccept: false,
        reason: "Bạn đã hoàn thành nhiệm vụ này rồi",
      };
    }

    // Kiểm tra nếu đã nhận nhiệm vụ này
    if (player.quests.active && player.quests.active.some((q) => q.id === quest.id)) {
      return {
        canAccept: false,
        reason: "Bạn đã nhận nhiệm vụ này rồi",
      };
    }

    // Kiểm tra level yêu cầu
    if (quest.requirements && quest.requirements.level && player.stat.level < quest.requirements.level) {
      return {
        canAccept: false,
        reason: `Bạn cần đạt cấp độ ${quest.requirements.level} để nhận nhiệm vụ này (cấp độ hiện tại: ${player.stat.level})`,
      };
    }

    // Kiểm tra nhiệm vụ tiên quyết
    if (quest.requirements && quest.requirements.prerequisiteQuests) {
      for (const preQuestId of quest.requirements.prerequisiteQuests) {
        if (!player.quests.completed || !player.quests.completed.includes(preQuestId)) {
          return {
            canAccept: false,
            reason: `Bạn cần hoàn thành nhiệm vụ tiên quyết trước`,
          };
        }
      }
    }

    return { canAccept: true };
  }

  /**
   * Tạo các nhiệm vụ phụ ngẫu nhiên cho người chơi
   * @param {Player} player - Người chơi cần tạo nhiệm vụ
   * @param {number} count - Số lượng nhiệm vụ cần tạo (mặc định: 3)
   * @returns {Promise<Object>} - Kết quả tạo nhiệm vụ
   */
  async generateRandomSideQuests(player, count = 3) {
    try {
      if (!player.quests) {
        player.quests = {
          active: [],
          completed: [],
        };
      }

      const questsData = await this.gameManager.getQuestsData();

      // Lấy cấp độ người chơi để tạo nhiệm vụ phù hợp
      const playerLevel = player.stat.level || 1;

      // Lấy danh sách khu vực người chơi có thể vào
      const areasData = await this.gameManager.getAreasData();
      const availableAreas = areasData.areas.filter(
        (area) => !area.requirements || !area.requirements.level || area.requirements.level <= playerLevel
      );

      // Lấy danh sách quái vật trong khu vực người chơi có thể vào
      const monstersData = await this.gameManager.getMonstersData();
      const availableMonsters = monstersData.monsters.filter((monster) =>
        availableAreas.some((area) => area.id === monster.area)
      );

      // Lấy danh sách vật phẩm phù hợp với cấp độ
      const itemsData = await this.gameManager.getItemsData();
      const relevantItems = itemsData.items.filter(
        (item) => !item.requirements || !item.requirements.level || item.requirements.level <= playerLevel + 5
      );

      // Tạo ID nhiệm vụ ngẫu nhiên
      const randomQuestId = () => `sq_${Date.now()}_${Math.floor(Math.random() * 10000)}`;

      // Danh sách loại nhiệm vụ phụ có thể tạo
      const sideQuestTypes = [
        {
          type: "kill",
          name: "Săn Quái",
          description: "Tiêu diệt một số lượng quái vật cụ thể",
          generator: (id) => {
            // Chọn ngẫu nhiên 1-3 loại quái vật
            const monsterCount = Math.min(availableMonsters.length, Math.floor(Math.random() * 2) + 1);
            const selectedMonsters = [];

            for (let i = 0; i < monsterCount; i++) {
              const monster = availableMonsters[Math.floor(Math.random() * availableMonsters.length)];

              if (!selectedMonsters.some((m) => m.id === monster.id)) {
                selectedMonsters.push(monster);
              }
            }

            // Tạo yêu cầu nhiệm vụ
            const objectives = selectedMonsters.map((monster) => ({
              type: "kill",
              targetId: monster.id,
              targetName: monster.name,
              amount: Math.floor(Math.random() * 5) + 3, // 3-7 quái
              progress: 0,
              completed: false,
            }));

            // Tạo phần thưởng
            const goldReward = playerLevel * 50 + Math.floor(Math.random() * 100);
            const expReward = playerLevel * 100 + Math.floor(Math.random() * 200);

            // Tạo nhiệm vụ
            return {
              id,
              name: `Săn ${selectedMonsters.map((m) => m.name).join(" và ")}`,
              description: `Tiêu diệt ${selectedMonsters.map((m) => m.name).join(" và ")} để giúp bảo vệ khu vực.`,
              type: "side",
              repeatable: true,
              cooldown: 86400000, // 24 giờ
              requirements: {
                level: Math.max(1, playerLevel - 2),
              },
              objectives,
              rewards: {
                gold: goldReward,
                exp: expReward,
                items: [],
              },
            };
          },
        },
        {
          type: "collect",
          name: "Thu Thập",
          description: "Thu thập vật phẩm từ quái vật",
          generator: (id) => {
            // Chọn vật phẩm ngẫu nhiên để thu thập
            const collectionItemsCount = Math.floor(Math.random() * 2) + 1; // 1-2 vật phẩm
            const collectionItems = [];

            for (let i = 0; i < collectionItemsCount; i++) {
              const item = relevantItems[Math.floor(Math.random() * relevantItems.length)];

              if (!collectionItems.some((ci) => ci.id === item.id)) {
                collectionItems.push(item);
              }
            }

            // Tạo yêu cầu nhiệm vụ
            const objectives = collectionItems.map((item) => ({
              type: "collect",
              targetId: item.id,
              targetName: item.name,
              amount: Math.floor(Math.random() * 3) + 2, // 2-4 vật phẩm
              progress: 0,
              completed: false,
            }));

            // Tạo phần thưởng
            const goldReward = playerLevel * 70 + Math.floor(Math.random() * 150);
            const expReward = playerLevel * 120 + Math.floor(Math.random() * 250);

            // Có thể thêm vật phẩm thưởng
            const rewardItems = [];
            if (Math.random() > 0.5) {
              const rewardItem = relevantItems[Math.floor(Math.random() * relevantItems.length)];
              if (rewardItem) {
                rewardItems.push({
                  id: rewardItem.id,
                  name: rewardItem.name,
                  amount: 1,
                });
              }
            }

            return {
              id,
              name: `Thu thập ${collectionItems.map((i) => i.name).join(" và ")}`,
              description: `Thu thập ${collectionItems
                .map((i) => i.name)
                .join(" và ")} cho mục đích nghiên cứu và chế tạo.`,
              type: "side",
              repeatable: true,
              cooldown: 86400000, // 24 giờ
              requirements: {
                level: Math.max(1, playerLevel - 1),
              },
              objectives,
              rewards: {
                gold: goldReward,
                exp: expReward,
                items: rewardItems,
              },
            };
          },
        },
        {
          type: "boss",
          name: "Thách Thức Boss",
          description: "Tiêu diệt boss để nhận phần thưởng lớn",
          generator: (id) => {
            // Lọc danh sách boss có thể tiêu diệt
            const availableBosses = monstersData.monsters.filter(
              (monster) =>
                monster.isBoss &&
                (!monster.requirements || !monster.requirements.level || monster.requirements.level <= playerLevel + 3)
            );

            if (!availableBosses || availableBosses.length === 0) {
              // Nếu không có boss, chuyển sang nhiệm vụ săn quái thường
              return sideQuestTypes[0].generator(id);
            }

            // Chọn boss ngẫu nhiên
            const boss = availableBosses[Math.floor(Math.random() * availableBosses.length)];

            // Tạo yêu cầu nhiệm vụ
            const objectives = [
              {
                type: "kill",
                targetId: boss.id,
                targetName: boss.name,
                amount: 1,
                progress: 0,
                completed: false,
              },
            ];

            // Tạo phần thưởng lớn hơn nhiệm vụ thông thường
            const goldReward = playerLevel * 150 + Math.floor(Math.random() * 300);
            const expReward = playerLevel * 250 + Math.floor(Math.random() * 500);

            // Thêm vật phẩm thưởng (xác suất cao hơn)
            const rewardItems = [];
            if (Math.random() > 0.3) {
              // Chọn vật phẩm tốt hơn bình thường
              const rewardItem = relevantItems.filter(
                (item) => item.rarity === "rare" || item.rarity === "epic" || item.rarity === "legendary"
              )[Math.floor(Math.random() * relevantItems.length)];

              if (rewardItem) {
                rewardItems.push({
                  id: rewardItem.id,
                  name: rewardItem.name,
                  amount: 1,
                });
              }
            }

            return {
              id,
              name: `Hạ gục ${boss.name}`,
              description: `Tiêu diệt ${boss.name}, một mối đe dọa nguy hiểm cho vùng đất này.`,
              type: "side",
              repeatable: true,
              cooldown: 172800000, // 48 giờ
              requirements: {
                level: Math.max(5, playerLevel - 3),
              },
              objectives,
              rewards: {
                gold: goldReward,
                exp: expReward,
                items: rewardItems,
              },
            };
          },
        },
        {
          type: "grind",
          name: "Luyện Cấp",
          description: "Tăng cấp nhanh chóng bằng cách tiêu diệt nhiều quái vật",
          generator: (id) => {
            // Số lượng quái cần tiêu diệt
            const killCount = 10 + Math.floor(Math.random() * 10); // 10-19 quái

            // Không yêu cầu loại quái cụ thể (tiêu diệt bất kỳ quái nào)
            const objectives = [
              {
                type: "kill",
                targetId: "any",
                targetName: "bất kỳ quái vật",
                amount: killCount,
                progress: 0,
                completed: false,
              },
            ];

            // Phần thưởng tập trung vào kinh nghiệm
            const goldReward = playerLevel * 30 + Math.floor(Math.random() * 100);
            const expReward = playerLevel * 200 + Math.floor(Math.random() * 300);

            return {
              id,
              name: `Luyện cấp tốc`,
              description: `Tiêu diệt ${killCount} quái vật bất kỳ để rèn luyện sức mạnh.`,
              type: "side",
              repeatable: true,
              cooldown: 43200000, // 12 giờ
              requirements: {
                level: Math.max(1, playerLevel - 5), // Có thể nhận ở cấp độ thấp hơn
              },
              objectives,
              rewards: {
                gold: goldReward,
                exp: expReward,
                items: [],
              },
            };
          },
        },
      ];

      // Tạo danh sách nhiệm vụ phụ
      const generatedQuests = [];
      for (let i = 0; i < count; i++) {
        // Chọn loại nhiệm vụ ngẫu nhiên
        const questType = sideQuestTypes[Math.floor(Math.random() * sideQuestTypes.length)];

        // Tạo nhiệm vụ
        const quest = questType.generator(randomQuestId());

        // Kiểm tra trùng lặp
        if (
          !generatedQuests.some((gq) => gq.name === quest.name) &&
          !player.quests.active.some((q) => q.name === quest.name)
        ) {
          generatedQuests.push(quest);
        }
      }

      return {
        success: true,
        quests: generatedQuests,
      };
    } catch (error) {
      console.error(`Lỗi khi tạo nhiệm vụ phụ ngẫu nhiên: ${error.message}`);
      return {
        success: false,
        message: "Không thể tạo nhiệm vụ phụ",
      };
    }
  }

  /**
   * Xử lý lệnh nhận nhiệm vụ phụ
   * @param {Player} player - Người chơi
   * @returns {Promise<Object>} Kết quả xử lý
   */
  async handleSideQuests(player) {
    try {
      // Tạo nhiệm vụ phụ mới
      const result = await this.generateRandomSideQuests(player);

      if (!result.success) {
        return result;
      }

      // Hiển thị danh sách nhiệm vụ phụ có thể nhận
      let message = `📜 NHIỆM VỤ PHỤ CÓ THỂ NHẬN\n\n`;

      result.quests.forEach((quest, index) => {
        message += `${index + 1}. ${quest.name}\n`;
        message += `📝 ${quest.description}\n`;

        // Hiển thị yêu cầu
        message += `🎯 Yêu cầu: `;
        quest.objectives.forEach((obj) => {
          message += `${obj.targetName} (${obj.amount}), `;
        });
        message = message.slice(0, -2) + "\n";

        // Hiển thị phần thưởng
        message += `🎁 Phần thưởng: `;
        const rewards = [];
        if (quest.rewards.gold) rewards.push(`${quest.rewards.gold} vàng`);
        if (quest.rewards.exp) rewards.push(`${quest.rewards.exp} kinh nghiệm`);
        if (quest.rewards.items && quest.rewards.items.length > 0) {
          rewards.push(`${quest.rewards.items.map((item) => item.name).join(", ")}`);
        }

        message += rewards.join(", ") + "\n\n";
      });

      message += `Sử dụng lệnh "/quest accept [số thứ tự]" để nhận nhiệm vụ.`;

      // Lưu nhiệm vụ phụ vào dữ liệu tạm thời
      this.gameData.setPlayerTempData(player.id, "sideQuests", result.quests);

      return {
        success: true,
        message,
      };
    } catch (error) {
      console.error(`Lỗi khi xử lý nhiệm vụ phụ: ${error.message}`);
      return {
        success: false,
        message: "Có lỗi xảy ra khi xử lý nhiệm vụ phụ.",
      };
    }
  }

  /**
   * Nhận nhiệm vụ phụ đã tạo
   * @param {Player} player - Người chơi
   * @param {number} index - Số thứ tự nhiệm vụ phụ
   * @returns {Promise<Object>} Kết quả xử lý
   */
  async acceptSideQuest(player, index) {
    try {
      // Lấy nhiệm vụ phụ từ dữ liệu tạm thời
      const sideQuests = this.gameData.getPlayerTempData(player.id, "sideQuests");

      if (!sideQuests || !sideQuests[index - 1]) {
        return {
          success: false,
          message: "❌ Nhiệm vụ phụ không tồn tại hoặc đã hết hạn. Vui lòng sử dụng lệnh `/quest side` để tạo lại.",
        };
      }

      const quest = sideQuests[index - 1];

      // Kiểm tra điều kiện nhận nhiệm vụ
      if (quest.requirements && quest.requirements.level && player.stat.level < quest.requirements.level) {
        return {
          success: false,
          message: `❌ Bạn cần đạt cấp độ ${quest.requirements.level} để nhận nhiệm vụ này!`,
        };
      }

      // Kiểm tra nhiệm vụ đã nhận
      if (player.quests.active.some((q) => q.id === quest.id)) {
        return {
          success: false,
          message: "❌ Bạn đã nhận nhiệm vụ này rồi!",
        };
      }

      // Thêm nhiệm vụ vào danh sách nhiệm vụ đang thực hiện
      player.quests.active.push(quest);

      // Cập nhật người chơi
      await this.gameManager.updatePlayer(player);

      // Xóa dữ liệu tạm thời
      this.gameData.removePlayerTempData(player.id, "sideQuests");

      return {
        success: true,
        message: `✅ Đã nhận nhiệm vụ "${quest.name}"!\n\n${this.getActiveQuestsStatus(player)}`,
      };
    } catch (error) {
      console.error(`Lỗi khi nhận nhiệm vụ phụ: ${error.message}`);
      return {
        success: false,
        message: "❌ Có lỗi xảy ra khi nhận nhiệm vụ phụ.",
      };
    }
  }
}

let questServiceInstance = null;

/**
 * Lấy instance duy nhất của QuestService
 * @returns {QuestService}
 */
export function getQuestServiceInstance() {
  if (!questServiceInstance) {
    questServiceInstance = new QuestService();
  }
  return questServiceInstance;
}
