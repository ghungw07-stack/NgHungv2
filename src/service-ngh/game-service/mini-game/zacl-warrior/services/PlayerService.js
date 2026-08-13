/**
 * PlayerService.js
 * Service xử lý các thao tác liên quan đến người chơi
 */

import { getGameDataInstance } from "../core/GameData.js";
import { getGameManagerInstance } from "../core/GameManager.js";
import Player from "../models/Player.js";
import { getCategoryName, getHiddenTraitName } from "../utils/GameUtils.js";
import { getServiceRegistry } from "./ServiceRegistry.js";

/**
 * Service xử lý các thao tác liên quan đến người chơi
 * @class PlayerService
 */
export class PlayerService {
  constructor() {
    /** @type {import('../core/GameData.js').GameData} */
    this.gameData = getGameDataInstance();

    /** @type {import('../core/GameManager.js').GameManager} */
    this.gameManager = getGameManagerInstance();

    // Các service khác sẽ được lấy từ registry khi cần
    this._registry = getServiceRegistry();
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
   * @returns {import('./QuestService.js').QuestService}
   */
  get questService() {
    return this.getService('QuestService');
  }

  /**
   * @returns {import('./ItemService.js').ItemService}
   */
  get itemService() {
    return this.getService('ItemService');
  }

  /**
   * @returns {import('./CombatService.js').CombatService}
   */
  get combatService() {
    return this.getService('CombatService');
  }

  /**
   * Tạo người chơi mới
   * @param {Object} userData - Thông tin người dùng
   * @returns {Player} - Đối tượng người chơi mới
   */
  createNewPlayer(userData) {
    if (!userData || !userData.globalId) {
      throw new Error("Dữ liệu người dùng không hợp lệ");
    }

    const now = Date.now();

    const playerData = {
      globalId: userData.globalId,
      name: userData.zaloName || "Chiến binh vô danh",
      status: "online",
      lastActivity: now,
      createdAt: now,
      currentArea: "town",
      bag: {
        maxSlots: 20,
        item: [
          { name: "Thuốc Hồi HP Nhỏ", id: "hp1", amount: 5 },
          { name: "Thuốc Hồi MP Nhỏ", id: "mp1", amount: 5 },
        ],
      },
      money: { gold: 500, diamond: 0, meteorite: 0 },
      stat: {
        level: 1,
        exp: { current: 0, next: 100 },
        hp: { current: 100, max: 100 },
        mp: { current: 50, max: 50 },
        speed: 20,
        attack: 20,
        intelligence: 10,
        defense: 5,
        vitality: 10,
        critRate: 5,
        critDmg: 150,
        dodge: 3,
        accuracy: 10,
      },
      quests: {
        active: [],
        completed: [],
      },
      body: {
        head: null,
        chest: null,
        back: null,
        arm: null,
        leg: null,
      },
      skill: {
        active: [],
        passive: [],
      },
      knownIds: [userData.id],
      achievement: {
        "Tân Thủ": {
          duration: -1,
        },
      },
      effects: {},
    };

    const player = new Player(playerData);
    this.gameData.setPlayerData(userData.globalId, player);

    return player;
  }

  /**
   * Tạo đối tượng Player từ dữ liệu người chơi có sẵn
   * @param {Object} rawPlayerData - Dữ liệu người chơi thô từ gameData
   * @returns {Player|null} - Đối tượng Player mới hoặc null nếu dữ liệu không hợp lệ
   */
  createPlayer(rawPlayerData) {
    if (!rawPlayerData) return null;
    return new Player(rawPlayerData);
  }

  /**
   * Lấy đối tượng Player từ playerId
   * @param {string} playerId - ID người chơi
   * @returns {Player|null} - Đối tượng Player hoặc null nếu không tìm thấy
   */
  getPlayerInstance(playerId) {
    return this.gameData.getPlayerByPlayerId(playerId);
  }

  /**
   * Lấy đối tượng Player từ globalId
   * @param {string} globalId - Global ID người chơi
   * @returns {Player|null} - Đối tượng Player hoặc null nếu không tìm thấy
   */
  getPlayerInstanceByGlobalId(globalId) {
    return this.gameData.getPlayerByGlobalId(globalId);
  }

  /**
   * Xử lý lệnh xem thông tin nhân vật
   * @param {Player} player - Đối tượng người chơi
   * @returns {Object} Kết quả xử lý
   */
  handleStatsCommand(player) {
    return {
      success: true,
      message: player.getStatsString(),
    };
  }

  /**
   * Xử lý lệnh xem trang bị đang mặc
   * @param {Player} player - Đối tượng người chơi
   * @returns {Object} Kết quả xử lý
   */
  handleEquipmentCommand(player) {
    return {
      success: true,
      message: player.getEquipmentDisplay(),
    };
  }

  /**
   * Xử lý lệnh xem túi đồ
   * @param {Player} player - Đối tượng người chơi
   * @returns {Object} Kết quả xử lý
   */
  handleInventoryCommand(player) {
    return {
      success: true,
      message: player.getInventory(),
    };
  }

  /**
   * Xử lý lệnh sử dụng vật phẩm
   * @param {Player} player - Đối tượng người chơi
   * @param {string} itemName - Tên vật phẩm
   * @returns {Object} Kết quả xử lý
   */
  async handleUseItem(player, itemName) {
    const isInCombat = this.combatService.isPlayerInCombat(player);

    // Nếu đang trong combat, kiểm tra xem đã dùng item trong lượt này chưa
    if (isInCombat) {
      const currentCombatId = player.currentCombat;
      if (currentCombatId && this.combatService.combats.has(currentCombatId)) {
        const combat = this.combatService.combats.get(currentCombatId);
        
        // Kiểm tra xem đã sử dụng vật phẩm trong lượt này chưa
        if (combat.itemUsedThisTurn && combat.itemUsedThisTurn.used) {
          return {
            success: false,
            message: `❌ Bạn đã sử dụng vật phẩm ${combat.itemUsedThisTurn.item.name} trong lượt này rồi!`
          };
        }
      }
    }
    
    if (!itemName || itemName.trim() === "") {
      const usableItems = player.bag.item.filter((item) => {
        const templateItem = this.itemService.getItemTemplate(item.id);
        return (
          (templateItem && templateItem.effects) ||
          (templateItem &&
            (templateItem.id.includes("_herb") ||
              templateItem.id.includes("_crystal") ||
              templateItem.id.includes("_dust") ||
              templateItem.id.includes("_scroll") ||
              templateItem.id.includes("_rune") ||
              templateItem.id.includes("_artifact")))
        );
      });

      if (usableItems.length === 0) {
        return {
          success: false,
          message: "❌ Bạn không có vật phẩm nào có thể sử dụng trong túi!",
        };
      }

      let message = "🧪 CÁC VẬT PHẨM CÓ THỂ SỬ DỤNG\n\n";

      // Phân loại vật phẩm
      const consumables = usableItems.filter((item) => {
        const templateItem = this.itemService.getItemTemplate(item.id);
        return templateItem && templateItem.effects && (templateItem.effects.hp || templateItem.effects.mp);
      });

      const questItems = usableItems.filter(
        (item) =>
          item.id.includes("_herb") ||
          item.id.includes("_crystal") ||
          item.id.includes("_dust") ||
          item.id.includes("_scroll") ||
          item.id.includes("_rune") ||
          item.id.includes("_artifact")
      );

      const otherItems = usableItems.filter((item) => !consumables.includes(item) && !questItems.includes(item));

      // Hiển thị tiêu thụ
      if (consumables.length > 0) {
        message += "💊 Vật phẩm tiêu thụ:\n";
        for (const item of consumables) {
          let effectDesc = [];
          const templateItem = this.itemService.getItemTemplate(item.id);

          if (templateItem.effects.hp) effectDesc.push(`+${templateItem.effects.hp} HP`);
          if (templateItem.effects.mp) effectDesc.push(`+${templateItem.effects.mp} MP`);

          // Hiển thị các hiệu ứng khác nếu có
          Object.entries(templateItem.effects || {}).forEach(([key, value]) => {
            if (!["hp", "mp"].includes(key)) {
              effectDesc.push(`+${value} ${key.toUpperCase()}`);
            }
          });

          message += `- ${item.name} [${item.amount}]: ${effectDesc.join(", ")}\n`;
        }
        message += "\n";
      }

      // Hiển thị vật phẩm nhiệm vụ
      if (questItems.length > 0) {
        message += "📜 Vật phẩm nhiệm vụ:\n";
        for (const item of questItems) {
          message += `- ${item.name} [${item.amount}]\n`;
        }
        message += "\n";
      }

      // Hiển thị các vật phẩm khác
      if (otherItems.length > 0) {
        message += "🧰 Vật phẩm khác:\n";
        for (const item of otherItems) {
          message += `- ${item.name} [${item.amount}]\n`;
        }
      }

      message += "\n📋 Sử dụng: use [tên vật phẩm]";

      return {
        success: true,
        message: message,
      };
    }

    const item = player.findItemInBag(itemName);
    if (!item) {
      return {
        success: false,
        message: "❌ Bạn không có vật phẩm này trong túi!",
      };
    }

    if (
      item.id.includes("_herb") ||
      item.id.includes("_crystal") ||
      item.id.includes("_dust") ||
      item.id.includes("_scroll") ||
      item.id.includes("_rune") ||
      item.id.includes("_artifact")
    ) {
      const questResult = await this.questService.handleQuestProgressComplete(player, "collect", item.id, 1);

      player.removeItemFromBag(item.id, 1);

      let useMessage = `✅ Đã sử dụng ${item.name}`;

      if (questResult.success && questResult.message) {
        useMessage += questResult.message;
      }

      return {
        success: true,
        message: useMessage,
      };
    } else {
      const result = player.useItem(item);
      if (result.success) {
        if (!result.message.startsWith("✅")) {
          result.message = "✅ " + result.message;
        }
        
        const isInCombat = this.combatService.isPlayerInCombat(player);

        if (isInCombat) {
          const currentCombatId = player.currentCombat;
          if (currentCombatId && this.combatService.combats.has(currentCombatId)) {
            const combat = this.combatService.combats.get(currentCombatId);

            // Đánh dấu đã sử dụng vật phẩm trong lượt này
            combat.itemUsedThisTurn = {
              used: true,
              item: {
                id: item.id,
                name: item.name
              }
            };
            
            // Thêm vào log combat
            combat.logs.push({
              time: Date.now(),
              actor: player.getName(),
              action: "use_item",
              item: item.name,
              effect: result.effect || {},
              text: `${player.getName()} sử dụng ${item.name}.`
            });
            
            // Tìm vị trí của người chơi
            const playerEntityIndex = combat.entities.findIndex(e => e.id === player.getGlobalId());
            if (playerEntityIndex !== -1) {
              // Cập nhật HP, MP của người chơi trong combat
              combat.entities[playerEntityIndex].hp = player.stat.hp.current;
              combat.entities[playerEntityIndex].mp = player.stat.mp.current;
              
              // Thông báo còn bao nhiêu thời gian để hành động
              const timeLeft = Math.max(0, Math.ceil((combat.turnTimeout - Date.now()) / 1000));
              result.message += `\n\n⏱️ Bạn còn ${timeLeft} giây để hành động trong lượt này!`;
            }
          }
        }
      }

      return result;
    }
  }

  /**
   * Xử lý lệnh nghỉ ngơi
   * @param {Player} player - Đối tượng người chơi
   * @returns {Object} Kết quả xử lý
   */
  handleRest(player) {
    if (player.currentArea !== "town") {
      return {
        success: false,
        message: "❌ Bạn chỉ có thể nghỉ ngơi ở thị trấn!",
      };
    }

    player.stat.hp.current = player.stat.hp.max;
    player.stat.mp.current = player.stat.mp.max;

    player.save();

    return {
      success: true,
      message: "💤 Bạn đã nghỉ ngơi và hồi phục toàn bộ HP/MP!",
    };
  }

  /**
   * Xử lý lệnh xem thông tin chi tiết
   * @param {Player} player - Đối tượng người chơi
   * @param {Array} args - Tham số lệnh
   * @returns {Object} Kết quả xử lý
   */
  async handleInfo(player, args) {
    if (!args.length) {
      return {
        success: false,
        message: "❌ Vui lòng nhập tên vật phẩm/kỹ năng cần xem thông tin!",
      };
    }

    const targetName = args.join(" ").toLowerCase();

    const item = player.findItemInBag(targetName);
    if (item) {
      return {
        success: true,
        message: this.getItemInfo(item),
      };
    }

    const equipment = Object.values(player.body).find((e) => e && e.name.toLowerCase() === targetName);
    if (equipment) {
      return {
        success: true,
        message: this.getItemInfo(equipment),
      };
    }

    // Tìm trong kỹ năng
    const skill = player.findSkill(targetName);
    if (skill) {
      return {
        success: true,
        message: this.getSkillInfo(skill),
      };
    }

    return {
      success: false,
      message: "❌ Không tìm thấy thông tin về vật phẩm/kỹ năng này!",
    };
  }

  /**
   * Xử lý lệnh trang bị vật phẩm
   * @param {Player} player - Đối tượng người chơi
   * @param {string} itemName - Tên vật phẩm
   * @returns {Object} Kết quả xử lý
   */
  handleEquipCommand(player, itemName) {
    const item = player.findItemInBag(itemName);
    if (!item) {
      return {
        success: false,
        message: "❌ Bạn không có vật phẩm này trong túi!",
      };
    }

    const result = player.equipItem(item);

    return result;
  }

  /**
   * Xử lý lệnh tháo trang bị
   * @param {Player} player - Đối tượng người chơi
   * @param {string} itemName - Tên trang bị
   * @returns {Object} Kết quả xử lý
   */
  handleUnequipCommand(player, itemName) {
    let foundSlot = null;
    for (const [slot, equipment] of Object.entries(player.body)) {
      if (equipment && equipment.name.toLowerCase() === itemName.toLowerCase()) {
        foundSlot = slot;
        break;
      }
    }

    if (!foundSlot) {
      return {
        success: false,
        message: "❌ Bạn không đang trang bị vật phẩm này!",
      };
    }

    const result = player.unequipItem(foundSlot);

    return result;
  }

  /**
   * Lấy thông tin chi tiết về vật phẩm
   * @param {Object} item - Thông tin vật phẩm
   * @returns {string} Thông tin chi tiết
   */
  getItemInfo(item) {
    let info = `📦 ${item.name}\n\n`;
    info += `Loại: ${this.getItemType(item.type)}`;

    if (item.subType) {
      info += ` (${this.getItemSubType(item.subType)})`;
    }

    info += `\nĐộ hiếm: ${this.getRarityText(item.rarity || "common")}`;

    if (item.tier) {
      info += `\nCấp độ: ${item.tier}`;
    }

    info += `\n\n`;

    if (item.stats) {
      info += "📊 Chỉ số:\n";
      for (const [stat, value] of Object.entries(item.stats)) {
        info += `${this.getStatName(stat)}: ${value > 0 ? "+" : ""}${value}\n`;
      }
    }

    // Hiển thị tăng cường phép thuật nếu có
    if (item.elementBoost) {
      info += "\n🔮 Tăng sức mạnh phép thuật:\n";
      const elementNames = {
        fire: "🔥 Hỏa",
        ice: "❄️ Băng",
        lightning: "⚡ Lôi",
        earth: "🌑 Thổ",
        water: "💧 Thủy",
        wind: "💨 Phong",
        light: "✨ Quang",
        dark: "🌑 Ám",
        all: "🌈 Tất cả",
      };

      for (const [element, value] of Object.entries(item.elementBoost)) {
        if (value && elementNames[element]) {
          info += `${elementNames[element]}: +${value}\n`;
        }
      }
    }

    // Hiển thị tăng cường combo nếu có
    if (item.comboBoost) {
      info += `\n👊 Tăng sức mạnh combo: +${item.comboBoost}\n`;
    }

    if (item.hiddenTrait) {
      info += `\n✨ Nội tại: ${getHiddenTraitName(item.hiddenTrait)}\n`;
    }

    if (item.description) {
      info += `\n📝 Mô tả: ${item.description}\n`;
    }

    // Hiển thị yêu cầu sử dụng nếu có
    if (item.requirements) {
      info += "\n📋 Yêu cầu sử dụng:\n";

      if (item.requirements.level) {
        info += `Cấp độ: ${item.requirements.level}\n`;
      }

      if (item.requirements.class && Array.isArray(item.requirements.class)) {
        const classNames = {
          warrior: "Chiến Binh",
          mage: "Pháp Sư",
          healer: "Thuật Sĩ",
          monk: "Võ Sư",
          fighter: "Đấu Sĩ",
        };

        const classes = item.requirements.class.map((c) => classNames[c] || c).join(", ");
        info += `Lớp nhân vật: ${classes}\n`;
      }
    }

    // Hiển thị giá cả nếu có
    if (item.price) {
      info += "\n💰 Giá trị:\n";
      if (item.price) info += `Giá mua: ${item.price} vàng\n`;
      if (item.sellPrice) info += `Giá bán: ${item.sellPrice} vàng\n`;
    }

    return info;
  }

  /**
   * Lấy thông tin chi tiết về kỹ năng
   * @param {Object} skill - Thông tin kỹ năng
   * @returns {string} Thông tin chi tiết
   */
  getSkillInfo(skill) {
    let info = `⚔️ ${skill.name}\n\n`;
    info += `Cấp độ: ${skill.level}\n`;
    info += `MP tiêu hao: ${skill.mpCost}\n`;
    info += `Thời gian hồi: ${skill.cooldown}s\n\n`;

    if (skill.damage) {
      info += `Sát thương: ${skill.damage}\n`;
    }

    if (skill.effects) {
      info += "\n🎯 Hiệu ứng:\n";
      skill.effects.forEach((effect) => {
        info += `- ${effect}\n`;
      });
    }

    if (skill.description) {
      info += `\n📝 Mô tả: ${skill.description}\n`;
    }

    return info;
  }

  /**
   * Lấy tên loại vật phẩm
   * @param {string} type - Loại vật phẩm
   * @returns {string} Tên loại vật phẩm
   */
  getItemType(type) {
    const types = {
      weapon: "Vũ khí",
      armor: "Áo giáp",
      helmet: "Mũ",
      boots: "Giày",
      shield: "Khiên",
      cape: "Áo choàng",
      accessory: "Phụ kiện",
      consumable: "Tiêu hao",
      material: "Nguyên liệu",
      quest: "Nhiệm vụ",
      special: "Đặc biệt",
    };

    return types[type] || type;
  }

  /**
   * Lấy tên phụ loại vật phẩm
   * @param {string} subType - Phụ loại vật phẩm
   * @returns {string} Tên phụ loại vật phẩm
   */
  getItemSubType(subType) {
    const subTypes = {
      sword: "Kiếm",
      axe: "Rìu",
      hammer: "Búa",
      staff: "Trượng phép",
      wand: "Đũa phép",
      gloves: "Găng tay võ thuật",
      mage_robe: "Áo choàng pháp sư",
      monk_robe: "Áo choàng võ sư",
    };

    return subTypes[subType] || subType;
  }

  /**
   * Chuyển đổi độ hiếm sang text
   * @param {number} rarity - Độ hiếm
   * @returns {string} Text độ hiếm
   */
  getRarityText(rarity) {
    const rarities = {
      0: "Bình thường",
      1: "Phổ biến",
      2: "Hiếm",
      3: "Cực hiếm",
      4: "Huyền thoại",
      5: "Thần thoại",
    };
    return rarities[rarity] || "Không xác định";
  }

  /**
   * Chuyển đổi tên chỉ số sang text
   * @param {string} stat - Tên chỉ số
   * @returns {string} Tên hiển thị
   */
  getStatName(stat) {
    const statNames = {
      hp: "Máu",
      mp: "Năng lượng",
      speed: "Tốc độ",
      attack: "Tấn công",
      intelligence: "Thông minh",
      defense: "Phòng thủ",
      vitality: "Sinh lực",
      critRate: "Tỷ lệ chí mạng",
      critDmg: "Sát thương chí mạng",
      dodge: "Né tránh",
      accuracy: "Chính xác",
    };
    return statNames[stat] || stat;
  }

  /**
   * Kiểm tra và xử lý hồi sinh nếu đã đủ thời gian
   * @param {Player} player - Đối tượng người chơi
   * @returns {Object} - Kết quả kiểm tra
   */
  checkRespawnStatus(player) {
    if (player.status !== "dead") {
      return { canRespawn: false, alreadyAlive: true };
    }

    const now = Date.now();
    if (!player.respawnTime || now >= player.respawnTime) {
      player.status = "online";
      player.respawnTime = null;
      player.save();

      return { canRespawn: true, alreadyAlive: false };
    }

    const remainingTime = Math.ceil((player.respawnTime - now) / 1000);
    return {
      canRespawn: false,
      alreadyAlive: false,
      remainingTime,
      message: `Bạn sẽ hồi sinh sau ${remainingTime} giây nữa.`,
    };
  }
}

let instance = null;

export function getPlayerServiceInstance() {
  if (!instance) {
    instance = new PlayerService();
  }
  return instance;
}
