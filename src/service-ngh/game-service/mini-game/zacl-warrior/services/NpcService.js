/**
 * NpcService.js
 * Service xử lý các thao tác liên quan đến NPC
 */

import { getGameDataInstance } from "../core/GameData.js";
import { getGameManagerInstance } from "../core/GameManager.js";
import { getServiceRegistry } from "./ServiceRegistry.js";
import Player from "../models/Player.js";
import { Npc } from "../models/Npc.js";

export class NpcService {
  constructor() {
    /** @type {import('../core/GameData.js').GameData} */
    this.gameData = getGameDataInstance();

    /** @type {import('../core/GameManager.js').GameManager} */
    this.gameManager = getGameManagerInstance();

    // Lấy registry để truy cập các service khi cần
    this._registry = getServiceRegistry();

    this.npcs = [];
    this.npcsById = new Map();
    this.npcsByLocation = new Map();
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
   * Lấy AreaService
   * @returns {import('./AreaService.js').AreaService}
   */
  get areaService() {
    return this.getService('AreaService');
  }

  /**
   * Lấy QuestService
   * @returns {import('./QuestService.js').QuestService}
   */
  get questService() {
    return this.getService('QuestService');
  }

  /**
   * Lấy SkillService
   * @returns {import('./SkillService.js').SkillService}
   */
  get skillService() {
    return this.getService('SkillService');
  }
  
  /**
   * Lấy ShopService
   * @returns {import('./ShopService.js').ShopService}
   */
  get shopService() {
    return this.getService('ShopService');
  }

  /**
   * Tải dữ liệu NPC từ bộ nhớ
   */
  loadNpcs() {
    const npcsData = this.gameData.getNpcsData();

    if (npcsData && npcsData.npcs) {
      this.npcs = npcsData.npcs.map((npcData) => new Npc(npcData));

      // Tạo map lưu trữ NPC theo ID để tìm kiếm nhanh
      this.npcsById.clear();
      for (const npc of this.npcs) {
        this.npcsById.set(npc.getId(), npc);
      }

      // Tạo map lưu trữ NPC theo vị trí
      this.npcsByLocation.clear();
      for (const npc of this.npcs) {
        const location = npc.location;
        if (location) {
          if (!this.npcsByLocation.has(location)) {
            this.npcsByLocation.set(location, []);
          }
          this.npcsByLocation.get(location).push(npc);
        }
      }
    }

    return this.npcs;
  }

  /**
   * Tìm NPC theo ID hoặc tên
   * @param {string} identifier - ID hoặc tên của NPC
   * @returns {Npc|null} - Đối tượng NPC hoặc null nếu không tìm thấy
   */
  getNpc(identifier) {
    if (!identifier) return null;

    if (this.npcs.length === 0) {
      this.loadNpcs();
    }

    const npcById = this.npcsById.get(identifier);
    if (npcById) {
      return npcById;
    }

    const lowerIdentifier = identifier.toLowerCase();
    return this.npcs.find((npc) => npc.getName().toLowerCase() === lowerIdentifier) || null;
  }

  /**
   * Lấy danh sách NPC trong khu vực
   * @param {string} locationId - ID khu vực
   * @returns {Array<Npc>} - Danh sách NPC trong khu vực
   */
  getNpcsInLocation(locationId) {
    if (!locationId) return [];

    if (this.npcsByLocation.size === 0) {
      this.loadNpcs();
    }

    return this.npcsByLocation.get(locationId) || [];
  }

  /**
   * Tìm NPC theo vai trò
   * @param {string} role - Vai trò của NPC
   * @returns {Array<Npc>} - Danh sách NPC với vai trò cần tìm
   */
  getNpcsByRole(role) {
    if (!role) return [];

    if (this.npcs.length === 0) {
      this.loadNpcs();
    }

    return this.npcs.filter((npc) => npc.role === role);
  }

  /**
   * Tìm NPC cung cấp dịch vụ cụ thể
   * @param {string} service - Loại dịch vụ
   * @returns {Array<Npc>} - Danh sách NPC cung cấp dịch vụ
   */
  getNpcsByService(service) {
    if (!service) return [];

    if (this.npcs.length === 0) {
      this.loadNpcs();
    }

    return this.npcs.filter((npc) => npc.providesService(service));
  }

  /**
   * Lưu NPC mới hoặc cập nhật NPC đã có
   * @param {Npc} npc - Đối tượng NPC
   * @returns {boolean} - Kết quả lưu NPC
   */
  saveNpc(npc) {
    if (!npc) return false;

    const npcData = npc.toJSON();
    const npcsData = this.gameData.getNpcsData();

    // Tìm NPC trong danh sách
    const index = npcsData.npcs.findIndex((n) => n.id === npcData.id);

    if (index >= 0) {
      // Cập nhật NPC đã có
      npcsData.npcs[index] = npcData;
    } else {
      // Thêm NPC mới
      npcsData.npcs.push(npcData);
    }

    // Đánh dấu dữ liệu đã thay đổi
    this.gameData.markNpcsDataChanged();

    // Cập nhật danh sách NPC trong bộ nhớ
    this.loadNpcs();

    return true;
  }

  /**
   * Xử lý lệnh tương tác với NPC
   * @param {Player} player - Người chơi
   * @param {Array} args - Tham số lệnh
   * @returns {Promise<Object>} Kết quả xử lý
   */
  async handleNpc(player, args = []) {

    if (!args.length) {
      return this.showNpcList(player);
    }

    const subCommand = args[0].toLowerCase();
    const npcName = args.slice(1).join(" ");

    switch (subCommand) {
      case "talk":
        return await this.talkToNpc(player, npcName);
      case "quest":
        return await this.showNpcQuests(player, npcName);
      case "shop":
        return await this.showNpcShop(player, npcName);
      default:
        return {
          success: false,
          message: "❌ Lệnh không hợp lệ! Sử dụng: npc [talk/quest/shop] [tên NPC]",
        };
    }
  }

  /**
   * Tìm NPC trong khu vực hiện tại của người chơi
   * @param {Player} player - Đối tượng người chơi
   * @param {string} npcName - Tên NPC cần tìm
   * @returns {Object|null} Thông tin NPC hoặc null nếu không tìm thấy
   */
  async findNpcInCurrentArea(player, npcName) {
    const currentArea = this.areaService.findAreaByNameOrId(player.currentArea);
    return this.findNpcInArea(currentArea, npcName);
  }

  /**
   * Tìm NPC trong khu vực theo tên hoặc ID
   * @param {Area} currentArea - Khu vực hiện tại
   * @param {string} npcName - Tên NPC
   * @returns {Promise<Object>} Kết quả xử lý
   */
  findNpcInArea(currentArea, npcName) {
    const areaNpc = currentArea?.npcs?.find(
      (n) => n.name.toLowerCase() === npcName.toLowerCase() || n.id.toLowerCase() === npcName.toLowerCase()
    );

    return areaNpc;
  }

  /**
   * Hiển thị danh sách NPC trong khu vực
   * @param {Player} player - Thông tin người chơi
   * @returns {Promise<Object>} Kết quả xử lý
   */
  async showNpcList(player) {
    const currentArea = this.areaService.findAreaByNameOrId(player.currentArea);

    if (!currentArea) {
      return { success: false, message: "❌ Không tìm thấy khu vực hiện tại!" };
    }

    if (!currentArea.npcs || !currentArea.npcs.length) {
      return { success: false, message: "❌ Không có NPC nào trong khu vực này!" };
    }

    const npcsData = await this.gameManager.getNpcsData();
    const areaNpcs = currentArea.npcs
      .map((areaNpc) => {
        const fullNpcData = npcsData.npcs.find((npc) => npc.id === areaNpc.id);

        if (!fullNpcData) return areaNpc; // Nếu không tìm thấy NPC trong npcs.json, vẫn hiển thị NPC từ area

        // Kết hợp thông tin từ area với thông tin đầy đủ từ npcs.json
        const combinedNpc = { ...fullNpcData, ...areaNpc };

        // Đảm bảo rằng các thuộc tính quan trọng từ npcs.json không bị mất nếu không có trong area
        if (!areaNpc.dialogs && fullNpcData.dialogs) {
          combinedNpc.dialogs = fullNpcData.dialogs;
        }

        if (!areaNpc.quests && fullNpcData.quests) {
          combinedNpc.quests = fullNpcData.quests;
        }

        if (!areaNpc.shop && fullNpcData.shop) {
          combinedNpc.shop = fullNpcData.shop;
        }

        return combinedNpc;
      })
      .filter((npc) => npc);

    if (!areaNpcs.length) {
      return { success: false, message: "❌ Không có NPC nào trong khu vực này!" };
    }

    let message = "👥 DANH SÁCH NPC 👥\n\n";

    areaNpcs.forEach((npc) => {
      message += `${npc.icon || "👤"} ${npc.name}\n`;
      if (npc.description) {
        message += `${npc.description}\n`;
      }

      message += "Tương tác:\n";
      if (npc.canTalk !== false) {
        message += "- Trò chuyện (npc talk)\n";
      }
      if (npc.quests && npc.quests.length > 0) {
        message += "- Nhận nhiệm vụ (npc quest)\n";
      }
      if (npc.shop) {
        message += "- Mua bán (npc shop)\n";
      }
      message += "\n";
    });

    return {
      success: true,
      message,
    };
  }

  /**
   * Trò chuyện với NPC
   * @param {Player} player - Đối tượng người chơi
   * @param {string} npcName - Tên NPC
   * @returns {Promise<Object>} Kết quả xử lý
   */
  async talkToNpc(player, npcName) {
    const currentArea = this.areaService.findAreaByNameOrId(player.currentArea);

    if (!currentArea) {
      return { success: false, message: "❌ Không tìm thấy khu vực hiện tại!" };
    }

    const areaNpc = await this.findNpcInCurrentArea(player, npcName);

    if (!areaNpc) {
      return {
        success: false,
        message: `❌ Không tìm thấy NPC '${npcName}' trong khu vực này!`,
      };
    }

    const npcsData = await this.gameManager.getNpcsData();
    const fullNpcData = npcsData.npcs.find((n) => n.id === areaNpc.id);

    if (!fullNpcData) {
      return { success: false, message: `❌ Không tìm thấy thông tin đầy đủ về NPC '${npcName}'!` };
    }

    const npcData = { ...fullNpcData, ...areaNpc };
    
    // Tạo đối tượng Npc từ dữ liệu
    const npc = new Npc(npcData);

    if (npcData.canTalk === false) {
      return { success: false, message: "❌ Bạn không thể trò chuyện với NPC này!" };
    }

    // Khởi tạo tiến trình đối thoại với NPC nếu chưa có
    if (!player.npcInteraction) {
      player.npcInteraction = {
        npcDialogs: {}, // Lưu trữ chỉ số thoại với từng NPC
      };
    }

    // Kiểm tra xem NPC này có liên quan đến nhiệm vụ talk nào không mà là mục tiêu cuối cùng
    let blockTalk = false;
    let incompleteMessage = "";
    
    if (player.quests && player.quests.active) {
      for (const quest of player.quests.active) {
        if (!quest.objectives) continue;
        
        // Tìm mục tiêu talk với NPC này
        const talkObjective = quest.objectives.find(obj => 
          obj.type === "talk" && 
          (obj.targetId === npc.getId() || 
          (Array.isArray(obj.targetId) && obj.targetId.includes(npc.getId())) ||
          (obj.targetName && npc.getName().toLowerCase().includes(obj.targetName.toLowerCase())))
        );
        
        if (talkObjective) {
          const objectiveIndex = quest.objectives.indexOf(talkObjective);
          
          // Nếu là mục tiêu cuối cùng của nhiệm vụ, kiểm tra các mục tiêu trước đó
          if (objectiveIndex === quest.objectives.length - 1) {
            const previousObjectives = quest.objectives.slice(0, objectiveIndex);
            const incompleteObjectives = previousObjectives.filter(obj => !obj.completed);
            
            if (incompleteObjectives.length > 0) {
              blockTalk = true;
              incompleteMessage = "❌ Bạn cần hoàn thành các mục tiêu sau trước khi báo cáo với NPC này:\n";
              
              incompleteObjectives.forEach(obj => {
                incompleteMessage += `- ${obj.description || obj.targetName}\n`;
                if (obj.progress !== undefined && obj.required !== undefined) {
                  incompleteMessage += `  Tiến độ: ${obj.progress || 0}/${obj.required}\n`;
                }
              });
              
              break; // Thoát khỏi vòng lặp nếu đã tìm thấy nhiệm vụ không đủ điều kiện
            }
          }
        }
      }
    }
    
    // Nếu không đủ điều kiện hoàn thành nhiệm vụ talk, hiển thị thông báo
    if (blockTalk) {
      // Vẫn cho phép nói chuyện với NPC nhưng không cập nhật tiến trình nhiệm vụ
      const npcIcon = npcData.icon || "👤";
      let message = `${npcIcon} ${npc.getName()}:\n`;
      message += `"${this.getAppropriateDialog(player, npc)}"\n\n`;
      message += incompleteMessage;
      
      return {
        success: true,
        message,
        questBlocked: true
      };
    }

    // Lấy đối thoại phù hợp
    const dialog = this.getAppropriateDialog(player, npc);

    // Nếu đủ điều kiện, cập nhật tiến trình nhiệm vụ
    const questsData = await this.gameManager.getQuestsData();
    const questProgress = await this.questService.updateQuestProgressWithDetails(player, "talk", npc.getId(), 1);

    let questMessage = "";
    if (questProgress.updated) {
      if (questProgress.completedQuests.length > 0) {
        questMessage += "\n\n🎯 NHIỆM VỤ ĐÃ HOÀN THÀNH:";
        questProgress.completedQuests.forEach((quest) => {
          questMessage += `\n- ${quest.name}`;
          const rewards = this.questService.getQuestRewards(player, quest);
          if (rewards.success) {
            questMessage += `\n${rewards.message}`;
          }
        });

        // Tìm nhiệm vụ tiếp theo dựa vào nhiệm vụ đã hoàn thành gần nhất
        const lastCompletedQuest = questProgress.completedQuests[questProgress.completedQuests.length - 1];
        if (lastCompletedQuest) {
          // Tìm nhiệm vụ tiếp theo dựa vào ID (đối với nhiệm vụ chính)
          const mainQuestMatch = lastCompletedQuest.id.match(/quest_(\d+)/);
          if (mainQuestMatch) {
            const lastNumber = parseInt(mainQuestMatch[1]);
            const nextQuestId = `quest_${String(lastNumber + 1).padStart(3, "0")}`;
            const nextQuest = questsData.quests.find((q) => q.id === nextQuestId);

            if (nextQuest) {
              questMessage += "\n📜 NHIỆM VỤ TIẾP THEO:";
              questMessage += `\n- ${nextQuest.name}`;

              // Kiểm tra điều kiện cấp độ
              if (nextQuest.requirements && nextQuest.requirements.level) {
                if (player.stat.level < nextQuest.requirements.level) {
                  questMessage += `\n⚠️ Yêu cầu: Cấp độ ${nextQuest.requirements.level} (cấp hiện tại: ${player.stat.level})`;
                } else {
                  questMessage += `\n✅ Đủ điều kiện để nhận nhiệm vụ này!`;
                }
              }

              // Kiểm tra điều kiện nhiệm vụ tiên quyết
              if (nextQuest.requirements && nextQuest.requirements.prerequisiteQuests) {
                const missingPrereqs = nextQuest.requirements.prerequisiteQuests.filter(
                  (prereqId) => !player.quests.completed.includes(prereqId)
                );

                if (missingPrereqs.length > 0) {
                  questMessage += "\n⚠️ Yêu cầu hoàn thành các nhiệm vụ:";
                  missingPrereqs.forEach((prereqId) => {
                    const prereqQuest = questsData.quests.find((q) => q.id === prereqId);
                    if (prereqQuest) {
                      questMessage += `\n  - ${prereqQuest.name}`;
                    }
                  });
                }
              }

              // Hướng dẫn nhận nhiệm vụ
              const questGiver = npcsData.npcs.find((n) => n.quests && n.quests.includes(nextQuest.id));

              if (questGiver) {
                questMessage += `\n👉 Hãy tìm ${questGiver.name} để nhận nhiệm vụ này!`;
              }
            } else {
              questMessage += "\n\n🏆 Bạn đã hoàn thành tất cả các nhiệm vụ hiện có!";
            }
          }
        }
      } else {
        questMessage = await this.questService.formatQuestStatusUpdate(
          player,
          questProgress.completedQuests,
          questProgress.autoAssignedQuests,
          questsData,
          npcsData
        );
      }
    }

    this.gameData.markPlayerDataChanged();

    const npcIcon = npcData.icon || "👤";
    let message = `${npcIcon} ${npc.getName()}:\n`;
    message += `"${dialog}"\n`;

    if (questMessage) {
      message += questMessage;
    }

    return {
      success: true,
      message,
    };
  }

  /**
   * Hiển thị nhiệm vụ của NPC
   * @param {Object} player - Thông tin người chơi
   * @param {string} npcName - Tên NPC
   * @returns {Promise<Object>} Kết quả xử lý
   */
  async showNpcQuests(player, npcName) {
    if (!npcName) {
      return { success: false, message: "❌ Vui lòng nhập tên NPC!" };
    }

    const currentArea = this.areaService.findAreaByNameOrId(player.currentArea);

    if (!currentArea) {
      return { success: false, message: "❌ Không tìm thấy khu vực hiện tại!" };
    }

    if (!currentArea.npcs || !currentArea.npcs.length) {
      return { success: false, message: "❌ Không có NPC nào trong khu vực này!" };
    }

    const areaNpc = this.findNpcInArea(currentArea, npcName);

    if (!areaNpc) {
      return { success: false, message: "❌ Không tìm thấy NPC này trong khu vực!" };
    }

    const npcsData = await this.gameManager.getNpcsData();
    const fullNpcData = npcsData.npcs.find((n) => n.id === areaNpc.id);

    if (!fullNpcData) {
      return { success: false, message: "❌ Không tìm thấy thông tin về NPC này trong cơ sở dữ liệu!" };
    }

    const npc = { ...fullNpcData, ...areaNpc };

    if (!areaNpc.quests && fullNpcData.quests) {
      npc.quests = fullNpcData.quests;
    }

    if (!npc.quests || npc.quests.length === 0) {
      return { success: false, message: "❌ NPC này không có nhiệm vụ nào!" };
    }

    const quests = await this.gameManager.getQuestsData();
    let message = `📜 NHIỆM VỤ CỦA ${npc.name.toUpperCase()} 📜\n\n`;

    const availableQuests = [];
    const activeQuests = [];
    const completedQuests = [];

    for (const questId of npc.quests) {
      const quest = quests.quests.find((q) => q.id === questId);
      if (!quest) continue;

      const isActive = player.quests.active.find((q) => q.id === questId);
      const isCompleted = player.quests.completed.includes(questId);
      const canAccept = !isActive && !isCompleted && this.checkQuestRequirements(player, quest);

      if (isActive) {
        activeQuests.push(quest);
      } else if (isCompleted) {
        completedQuests.push(quest);
      } else if (canAccept) {
        availableQuests.push(quest);
      }
    }

    if (availableQuests.length > 0) {
      message += "🟢 CÓ THỂ NHẬN:\n";
      availableQuests.forEach((quest) => {
        message += `- ${quest.name} (Cấp ${quest.requirements?.level || 1})\n`;
        if (quest.description) {
          message += `  ${quest.description}\n`;
        }
        
        // Hiển thị loại nhiệm vụ và mục tiêu
        const questTypes = {
          "kill": "Tiêu diệt quái vật",
          "collect": "Thu thập vật phẩm",
          "talk": "Nói chuyện với NPC",
          "explore": "Khám phá khu vực",
          "craft": "Chế tạo vật phẩm",
          "deliver": "Giao vật phẩm"
        };
        
        if (quest.objectives && quest.objectives.length > 0) {
          message += "  📋 Mục tiêu chính:\n";
          const mainObjective = quest.objectives[0];
          const type = questTypes[mainObjective.type] || mainObjective.type;
          const target = mainObjective.targetName || mainObjective.targetId;
          message += `  - ${type}: ${target} (x${mainObjective.required})\n`;
          
          if (quest.objectives.length > 1) {
            message += `  - ... và ${quest.objectives.length - 1} mục tiêu khác\n`;
          }
        }
      });
      message += "\n";
    }

    if (activeQuests.length > 0) {
      message += "🏹 ĐANG THỰC HIỆN:\n";
      activeQuests.forEach((quest) => {
        const activeQuest = player.quests.active.find((q) => q.id === quest.id);
        const progress = this.calculateQuestProgress(player, quest, activeQuest);
        message += `- ${quest.name} (${progress}%)\n`;
        
        if (activeQuest.objectives) {
          activeQuest.objectives.forEach(obj => {
            const progress = obj.progress || 0;
            const required = obj.required || 1;
            const completed = obj.completed ? "✅" : `(${progress}/${required})`;
            message += `  - ${obj.description || obj.type}: ${completed}\n`;
          });
        }
      });
      message += "\n";
    }

    if (completedQuests.length > 0) {
      message += "✅ ĐÃ HOÀN THÀNH:\n";
      completedQuests.forEach((quest) => {
        message += `- ${quest.name}\n`;
      });
    }

    // Nếu có nhiệm vụ có thể nhận, hiển thị nút nhận nhiệm vụ
    if (availableQuests.length > 0) {
      message += "\nSử dụng lệnh `quest accept [ID nhiệm vụ]` để nhận nhiệm vụ mới.";
    }

    return {
      success: true,
      message,
    };
  }

  /**
   * Hiển thị cửa hàng của NPC
   * @param {Object} player - Thông tin người chơi
   * @param {string} npcName - Tên NPC
   * @returns {Promise<Object>} Kết quả xử lý
   */
  async showNpcShop(player, npcName) {
    if (!npcName) {
      return { success: false, message: "❌ Vui lòng nhập tên NPC!" };
    }

    const currentArea = this.areaService.findAreaByNameOrId(player.currentArea);

    if (!currentArea) {
      return { success: false, message: "❌ Không tìm thấy khu vực hiện tại!" };
    }

    if (!currentArea.npcs || !currentArea.npcs.length) {
      return { success: false, message: "❌ Không có NPC nào trong khu vực này!" };
    }

    const areaNpc = this.findNpcInArea(currentArea, npcName);

    if (!areaNpc) {
      return { success: false, message: "❌ Không tìm thấy NPC này trong khu vực!" };
    }

    // Kết hợp thông tin từ area với thông tin đầy đủ của NPC
    const npcsData = await this.gameManager.getNpcsData();
    const fullNpcData = npcsData.npcs.find((n) => n.id === areaNpc.id);

    if (!fullNpcData) {
      return { success: false, message: "❌ Không tìm thấy thông tin về NPC này trong cơ sở dữ liệu!" };
    }

    // Gộp thông tin, ưu tiên dữ liệu từ npcs.json rồi ghi đè bởi dữ liệu từ area
    const npc = { ...fullNpcData, ...areaNpc };

    // Đảm bảo rằng shop được giữ nguyên từ npcs.json nếu không có trong area
    if (!areaNpc.shop && fullNpcData.shop) {
      npc.shop = fullNpcData.shop;
    }

    if (!npc.shop) {
      return { success: false, message: "❌ NPC này không có cửa hàng!" };
    }

    const items = await this.gameManager.getItemsData();
    let message = `🏪 CỬA HÀNG CỦA ${npc.name.toUpperCase()} 🏪\n\n`;
    message += `💰 Vàng của bạn: ${player.money.gold}\n\n`;

    const categories = {
      weapon: "⚔️ VŨ KHÍ",
      armor: "🛡️ GIÁP",
      accessory: "💍 PHỤ KIỆN",
      consumable: "🧪 TIÊU HAO",
      material: "📦 NGUYÊN LIỆU",
    };

    for (const [category, title] of Object.entries(categories)) {
      const categoryItems = npc.shop.items.filter((shopItem) => {
        const item = items.items.find((i) => i.id === shopItem.id);
        return item && item.type === category && (!item.levelRequired || item.levelRequired <= player.stat.level);
      });

      if (categoryItems.length > 0) {
        message += `${title}:\n`;
        categoryItems.forEach((shopItem) => {
          const item = items.items.find((i) => i.id === shopItem.id);
          if (item) {
            message += `- ${item.name}`;
            if (item.levelRequired) {
              message += ` (Cấp ${item.levelRequired})`;
            }
            message += ` - ${shopItem.price || item.price || 0} Vàng\n`;
            if (item.description) {
              message += `  ${item.description}\n`;
            }
          }
        });
        message += "\n";
      }
    }

    return {
      success: true,
      message,
    };
  }

  /**
   * Lấy đối thoại phù hợp cho một NPC
   * @param {Player} player - Thông tin người chơi
   * @param {Npc} npc - Đối tượng NPC
   * @returns {string} - Đối thoại phù hợp
   */
  getAppropriateDialog(player, npc) {
    // Khởi tạo tiến trình đối thoại với NPC nếu chưa có
    if (!player.npcInteraction) {
      player.npcInteraction = {
        npcDialogs: {}, // Lưu trữ chỉ số thoại với từng NPC
      };
    }

    // Kiểm tra xem có nhiệm vụ nào liên quan đến NPC này
    const activeQuestsWithThisNpc = player.quests.active ? player.quests.active.filter(quest => {
      if (!quest.objectives) return false;
      
      return quest.objectives.some(obj => 
        obj.type === "talk" && 
        (obj.targetId === npc.getId() || 
          (Array.isArray(obj.targetId) && obj.targetId.includes(npc.getId())))
      );
    }) : [];

    // Ưu tiên đối thoại nhiệm vụ nếu có
    if (activeQuestsWithThisNpc.length > 0) {
      const quest = activeQuestsWithThisNpc[0]; // Lấy nhiệm vụ đầu tiên
      const questId = quest.id;
      
      // Sử dụng đối thoại nhiệm vụ mà không quan tâm đến giai đoạn
      return npc.getQuestDialog(questId, null, { playerName: player.name });
    }
    
    // Sử dụng đối thoại tuần tự nếu không có nhiệm vụ
    const dialog = npc.getSequentialDialog(player.npcInteraction, { playerName: player.name });
    
    // Cập nhật chỉ số đối thoại
    npc.updateDialogIndex(player.npcInteraction);
    
    return dialog;
  }

  /**
   * Kiểm tra điều kiện nhận nhiệm vụ
   * @param {Object} player - Thông tin người chơi
   * @param {Object} quest - Thông tin nhiệm vụ
   * @returns {boolean} Kết quả kiểm tra
   */
  checkQuestRequirements(player, quest) {
    if (quest.requirements && quest.requirements.level && player.stat.level < quest.requirements.level) {
      return false;
    }

    if (quest.requirements && quest.requirements.prerequisites) {
      for (const prereqId of quest.requirements.prerequisites) {
        if (!player.quests.completed.includes(prereqId)) {
          return false;
        }
      }
    }

    return true;
  }

  /**
   * Tính tỉ lệ hoàn thành nhiệm vụ
   * @param {Object} player - Thông tin người chơi
   * @param {Object} quest - Thông tin nhiệm vụ từ cơ sở dữ liệu
   * @param {Object} activeQuest - Thông tin nhiệm vụ đang thực hiện của người chơi
   * @returns {number} - Tỉ lệ hoàn thành (0-100)
   */
  calculateQuestProgress(player, quest, activeQuest) {
    if (!quest.objectives || !activeQuest || !activeQuest.objectives) return 0;

    let completedObjectives = 0;
    let totalObjectives = activeQuest.objectives.length;
    
    for (const objective of activeQuest.objectives) {
      const progress = objective.progress || 0;
      const required = objective.required || 1;
      
      if (progress >= required || objective.completed) {
        completedObjectives++;
      }
    }

    return Math.floor((completedObjectives / totalObjectives) * 100);
  }

  /**
   * Xử lý lệnh nói chuyện với NPC (wrapper cho talkToNpc)
   * @param {Player} player - Đối tượng người chơi
   * @param {string} npcName - Tên NPC
   * @returns {Promise<Object>} Kết quả xử lý
   */
  async handleTalk(player, npcName) {
    return await this.talkToNpc(player, npcName);
  }
}

let instance = null;

export function getNpcServiceInstance() {
  if (!instance) {
    instance = new NpcService();
  }
  return instance;
}
