/**
 * MonsterService.js
 * Service xử lý các thao tác liên quan đến quái vật
 */

import { getGameDataInstance } from "../core/GameData.js";
import { getGameManagerInstance } from "../core/GameManager.js";
import { Monster } from "../models/Monster.js";
import Player from "../models/Player.js";
import { getHiddenTraitName } from "../utils/GameUtils.js";
import { getServiceRegistry } from "./ServiceRegistry.js";

export class MonsterService {
  constructor() {
    /** @type {import('../core/GameData.js').GameData} */
    this.gameData = getGameDataInstance();

    /** @type {import('../core/GameManager.js').GameManager} */
    this.gameManager = getGameManagerInstance();

    // Lấy registry để truy cập các service khi cần
    this._registry = getServiceRegistry();

    this.monsters = [];
    this.monstersById = new Map();

    // Cache data
    this.cachedMonsters = null;
    
    // Hằng số cho các loại quái vật đặc biệt
    this.ELITE_MONSTER_CHANCE = 0.05; // 5% xuất hiện quái tinh anh
    this.ENCHANTED_MONSTER_CHANCE = 0.07; // 7% xuất hiện quái phù phép tà đạo
    
    // Tỉ lệ rơi đồ cho các loại quái vật
    this.NORMAL_DROP_RATE = 0.03; // 3% tỉ lệ rơi đồ thường
    this.ELITE_DROP_RATE = 0.08; // 8% tỉ lệ rơi đồ tinh anh
    this.ENCHANTED_DROP_RATE = 0.06; // 6% tỉ lệ rơi đồ quái phù phép
    this.BOSS_DROP_RATE = 0.15; // 15% tỉ lệ rơi đồ boss
    
    // Hệ số nhân chỉ số cho quái tinh anh
    this.ELITE_HP_MULTIPLIER = 3.0;
    this.ELITE_ATK_MULTIPLIER = 2.6;
    this.ELITE_STR_MULTIPLIER = 2.6;
    this.ELITE_DEF_MULTIPLIER = 2.6;
    this.ELITE_SPD_MULTIPLIER = 2.4;
    this.ELITE_EXP_MULTIPLIER = 8.0;
    
    // Hệ số nhân chỉ số cho quái phù phép tà đạo
    this.ENCHANTED_HP_MULTIPLIER = 2.0;
    this.ENCHANTED_ATK_MULTIPLIER = 2.2;
    this.ENCHANTED_STR_MULTIPLIER = 2.2;
    this.ENCHANTED_DEF_MULTIPLIER = 1.8;
    this.ENCHANTED_SPD_MULTIPLIER = 2.0;
    this.ENCHANTED_EXP_MULTIPLIER = 5.0;
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
   * Lấy AreaService
   * @returns {import('./AreaService.js').AreaService}
   */
  get areaService() {
    return this.getService("AreaService");
  }

  /**
   * Lấy ItemService
   * @returns {import('./ItemService.js').ItemService}
   */
  get itemService() {
    return this.getService("ItemService");
  }

  /**
   * Lấy CombatService
   * @returns {import('./CombatService.js').CombatService}
   */
  get combatService() {
    return this.getService("CombatService");
  }

  /**
   * Tải dữ liệu quái vật từ bộ nhớ
   */
  async loadMonsters() {
    const monstersData = await this.gameManager.getMonstersData();

    if (monstersData && monstersData.monsters) {
      this.monsters = monstersData.monsters.map((monsterData) => new Monster(monsterData));

      // Tạo map lưu trữ monster theo ID để tìm kiếm nhanh
      this.monstersById.clear();
      for (const monster of this.monsters) {
        this.monstersById.set(monster.getId(), monster);
      }
    }

    return this.monsters;
  }

  /**
   * Tìm quái vật theo ID
   * @param {string} id - ID của quái vật
   * @returns {Promise<Monster|null>} - Đối tượng quái vật hoặc null nếu không tìm thấy
   */
  async getMonsterById(id) {
    if (!id) return null;

    if (this.monstersById.size === 0) {
      await this.loadMonsters();
    }

    return this.monstersById.get(id) || null;
  }

  /**
   * Tìm quái vật theo tên
   * @param {string} name - Tên quái vật (tìm kiếm không phân biệt hoa thường)
   * @returns {Promise<Monster|null>} - Đối tượng quái vật hoặc null nếu không tìm thấy
   */
  async getMonsterByName(name) {
    if (!name) return null;

    if (this.monsters.length === 0) {
      await this.loadMonsters();
    }

    const lowerName = name.toLowerCase();
    return this.monsters.find((monster) => monster.getName().toLowerCase() === lowerName) || null;
  }

  /**
   * Lấy danh sách tất cả quái vật
   * @returns {Promise<Monster[]>} - Danh sách quái vật
   */
  async getAllMonsters() {
    if (this.monsters.length === 0) {
      await this.loadMonsters();
    }

    return [...this.monsters];
  }

  /**
   * Lấy danh sách quái vật trong khu vực
   * @param {string} areaId - ID khu vực
   * @returns {Promise<Monster[]>} - Danh sách quái vật trong khu vực
   */
  async getMonstersInArea(areaId) {
    if (!areaId) return [];

    if (this.monsters.length === 0) {
      await this.loadMonsters();
    }

    return this.monsters.filter((monster) => monster.area === areaId);
  }

  /**
   * Lưu quái vật mới hoặc cập nhật quái vật đã có
   * @param {Monster} monster - Đối tượng quái vật
   * @returns {Promise<boolean>} - Kết quả lưu quái vật
   */
  async saveMonster(monster) {
    if (!monster) return false;

    const monsterData = monster.toJSON();
    const monstersData = await this.gameManager.getMonstersData();

    // Tìm quái vật trong danh sách
    const index = monstersData.monsters.findIndex((m) => m.id === monsterData.id);

    if (index >= 0) {
      // Cập nhật quái vật đã có
      monstersData.monsters[index] = monsterData;
    } else {
      // Thêm quái vật mới
      monstersData.monsters.push(monsterData);
    }

    // Đánh dấu dữ liệu đã thay đổi
    this.gameManager.markMonstersDataChanged();

    // Cập nhật danh sách quái vật trong bộ nhớ
    await this.loadMonsters();

    return true;
  }

  /**
   * Xóa quái vật khỏi danh sách
   * @param {string} monsterId - ID của quái vật cần xóa
   * @returns {Promise<boolean>} - Kết quả xóa quái vật
   */
  async deleteMonster(monsterId) {
    if (!monsterId) return false;

    const monstersData = await this.gameManager.getMonstersData();

    // Tìm quái vật trong danh sách
    const index = monstersData.monsters.findIndex((m) => m.id === monsterId);

    if (index >= 0) {
      // Xóa quái vật
      monstersData.monsters.splice(index, 1);

      // Đánh dấu dữ liệu đã thay đổi
      this.gameManager.markMonstersDataChanged();

      // Cập nhật danh sách quái vật trong bộ nhớ
      await this.loadMonsters();

      return true;
    }

    return false;
  }

  /**
   * Tạo quái vật tinh anh từ quái vật thường
   * @param {Monster} baseMonster - Quái vật gốc
   * @returns {Monster} - Quái vật tinh anh
   */
  createEliteMonster(baseMonster) {
    if (!baseMonster) return null;

    // Tạo ID cho quái tinh anh
    const eliteId = `elite_${baseMonster.getId()}_${Date.now()}`;
    
    // Tạo bản sao của quái gốc
    const eliteData = {
      ...baseMonster.toJSON(),
      id: eliteId,
      name: `${baseMonster.getName()} 🌟`,
      isElite: true,
      hp: Math.floor(baseMonster.hp * this.ELITE_HP_MULTIPLIER),
      maxHp: Math.floor(baseMonster.hp * this.ELITE_HP_MULTIPLIER),
      attack: Math.floor(baseMonster.attack * this.ELITE_ATK_MULTIPLIER),
      defense: Math.floor(baseMonster.defense * this.ELITE_DEF_MULTIPLIER),
      speed: Math.floor(baseMonster.speed * this.ELITE_SPD_MULTIPLIER),
      exp: Math.floor(baseMonster.exp * this.ELITE_EXP_MULTIPLIER),
    };
    
    // Tăng tỉ lệ rơi đồ
    if (eliteData.drops) {
      eliteData.drops = eliteData.drops.map(drop => ({
        ...drop,
        chance: Math.min(100, (drop.chance || 0) * 1.5),
        traitChance: this.ELITE_DROP_RATE * 100
      }));
    }

    // Trả về quái vật tinh anh
    return new Monster(eliteData);
  }

  /**
   * Tạo quái vật phù phép tà đạo
   * @param {Monster} baseMonster - Quái vật gốc
   * @returns {Monster} - Quái vật phù phép
   */
  createEnchantedMonster(baseMonster) {
    if (!baseMonster) return null;

    // Danh sách các tiền tố tà đạo
    const prefixes = [
      "Quỷ", "Ma", "Tà", "Ám", "Hắc", "Lão", "Huyết", "Độc", "Yêu", "Ác"
    ];
    
    // Chọn ngẫu nhiên một tiền tố
    const randomPrefix = prefixes[Math.floor(Math.random() * prefixes.length)];
    
    // Tạo ID cho quái phù phép
    const enchantedId = `enchanted_${baseMonster.getId()}_${Date.now()}`;
    
    // Tạo bản sao của quái gốc
    const enchantedData = {
      ...baseMonster.toJSON(),
      id: enchantedId,
      name: `${randomPrefix} ${baseMonster.getName()} 🔮`,
      isEnchanted: true,
      hp: Math.floor(baseMonster.hp * this.ENCHANTED_HP_MULTIPLIER),
      maxHp: Math.floor(baseMonster.hp * this.ENCHANTED_HP_MULTIPLIER),
      attack: Math.floor(baseMonster.attack * this.ENCHANTED_ATK_MULTIPLIER),
      defense: Math.floor(baseMonster.defense * this.ENCHANTED_DEF_MULTIPLIER),
      speed: Math.floor(baseMonster.speed * this.ENCHANTED_SPD_MULTIPLIER),
      exp: Math.floor(baseMonster.exp * this.ENCHANTED_EXP_MULTIPLIER),
    };
    
    // Tăng tỉ lệ rơi đồ
    if (enchantedData.drops) {
      enchantedData.drops = enchantedData.drops.map(drop => ({
        ...drop,
        chance: Math.min(100, (drop.chance || 0) * 1.3),
        traitChance: this.ENCHANTED_DROP_RATE * 100 // Chuyển sang phần trăm
      }));
    }

    // Trả về quái vật phù phép
    return new Monster(enchantedData);
  }

  /**
   * Tạo boss từ một quái vật thường
   * @param {string} monsterId - ID của quái vật
   * @param {Object} customData - Dữ liệu tùy chỉnh cho boss
   * @returns {Promise<Object>} - Kết quả tạo boss
   */
  async createBoss(monsterId, customData = {}) {
    // Lấy quái vật gốc
    const baseMonster = await this.getMonsterById(monsterId);

    if (!baseMonster) {
      return {
        success: false,
        message: "Không tìm thấy quái vật gốc!",
      };
    }

    // Tạo ID cho boss mới
    const bossId = `boss_${baseMonster.getId()}_${Date.now()}`;

    function getRandomStats(baseStats) {
      return Math.floor(baseStats * (0.75 + Math.random() * 0.75));
    }

    const hpMax = getRandomStats(baseMonster.maxHp);
    
    const bossData = {
      ...baseMonster.toJSON(),
      id: bossId,
      name: customData.name || `${baseMonster.getName()} Boss`,
      level: customData.level || getRandomStats(baseMonster.level),
      isBoss: true,
      maxHp: customData.maxHp || hpMax,
      hp: customData.hp || hpMax,
      attack: customData.attack || getRandomStats(baseMonster.attack),
      defense: customData.defense || getRandomStats(baseMonster.defense),
      speed: customData.speed || getRandomStats(baseMonster.speed),
      expGain: customData.expGain || getRandomStats(baseMonster.expGain),
      goldRange: customData.goldRange || {
        min: getRandomStats(baseMonster.goldRange.min),
        max: getRandomStats(baseMonster.goldRange.max),
      },
    };

    // Tăng xác suất rơi vật phẩm và thiết lập tỷ lệ rơi nội tại
    if (bossData.drops) {
      bossData.drops = bossData.drops.map((drop) => {
        // Tăng tỷ lệ rơi vật phẩm
        const newDrop = {
          ...drop,
          chance: Math.min(100, (drop.chance || 0) * 1.5), // Tăng tỷ lệ rơi nhưng không vượt quá 100%
          traitChance: this.BOSS_DROP_RATE * 100 // Chuyển sang phần trăm
        };

        return newDrop;
      });
    }

    const boss = new Monster(bossData);

    return {
      success: true,
      message: `✅ Đã tạo thành công boss ${boss.getName()}!`,
      boss: boss,
    };
  }

  /**
   * Lấy chỉ số của quái vật theo cách thống nhất
   * @param {Monster} monster - Đối tượng quái vật
   * @returns {Object} - Chỉ số chuẩn hóa của quái vật
   */
  getMonsterStats(monster) {
    if (!monster) return {};
    
    const stats = {
      hp: monster.hp || 99999,
      maxHp: monster.maxHp || monster.hp || 99999,
      attack: 0,
      defense: 0,
      speed: 0,
      level: monster.level || 1,
      exp: monster.exp || monster.expGain || 10
    };
    
    // Lấy chỉ số attack
    if (monster.stats && typeof monster.stats.attack !== 'undefined') {
      stats.attack = monster.stats.attack;
    } else if (typeof monster.attack !== 'undefined') {
      stats.attack = monster.attack;
    } else {
      stats.attack = 5; // Giá trị mặc định
    }
    
    // Lấy chỉ số defense
    if (monster.stats && typeof monster.stats.defense !== 'undefined') {
      stats.defense = monster.stats.defense;
    } else if (typeof monster.defense !== 'undefined') {
      stats.defense = monster.defense;
    } else {
      stats.defense = 5; // Giá trị mặc định
    }
    
    // Lấy chỉ số speed
    if (monster.stats && typeof monster.stats.speed !== 'undefined') {
      stats.speed = monster.stats.speed;
    } else if (typeof monster.speed !== 'undefined') {
      stats.speed = monster.speed;
    } else {
      stats.speed = 5; // Giá trị mặc định
    }
    
    return stats;
  }

  /**
   * Tìm quái vật trong khu vực dựa theo tên hoặc ID và áp dụng các hiệu ứng đặc biệt nếu thỏa điều kiện
   * @param {string} areaId - ID khu vực
   * @param {string} monsterNameOrId - Tên hoặc ID quái vật cần tìm, nếu null thì tạo ngẫu nhiên
   * @returns {Promise<Object>} - Kết quả tìm kiếm hoặc tạo quái
   */
  async findMonsterInArea(areaId, monsterNameOrId) {
    const monsters = await this.getMonstersInArea(areaId);

    if (!monsters || monsters.length === 0) {
      return {
        success: false,
        message: "Không có quái vật nào trong khu vực này!",
        monster: null
      };
    }

    let monster = null;

    if (!monsterNameOrId) {
      // Chọn ngẫu nhiên quái vật từ khu vực nếu không chỉ định tên
      const randomIndex = Math.floor(Math.random() * monsters.length);
      monster = monsters[randomIndex];
    } else {
      // Tìm quái vật theo tên hoặc ID
      const searchTerm = monsterNameOrId.toLowerCase();
      monster = monsters.find(
        (monster) => monster.getId().toLowerCase() === searchTerm || monster.getName().toLowerCase().includes(searchTerm)
      );
      
      if (!monster) {
        return {
          success: false,
          message: `Không tìm thấy quái vật '${monsterNameOrId}' trong khu vực này!`,
          monster: null
        };
      }
    }
    
    // Xác định loại quái vật đặc biệt
    let monsterType = "normal";
    const random = Math.random();
    
    // Quái tinh anh có ưu tiên cao nhất
    if (random < this.ELITE_MONSTER_CHANCE) {
      monster = this.createEliteMonster(monster);
      monsterType = "elite";
    } 
    // Sau đó là quái phù phép
    else if (random < this.ELITE_MONSTER_CHANCE + this.ENCHANTED_MONSTER_CHANCE) {
      monster = this.createEnchantedMonster(monster);
      monsterType = "enchanted";
    }
    
    return {
      success: true,
      monster: monster,
      monsterType: monsterType
    };
  }

  /**
   * Xử lý lệnh monster trong game
   * @param {Player} player - Người chơi
   * @param {Array} args - Tham số lệnh
   * @returns {Promise<Object>} Kết quả xử lý
   */
  async handleMonster(player, args = []) {
    if (!args.length) {
      return this.showMonstersInArea(player);
    }

    const subCommand = args[0].toLowerCase();
    const monsterName = args.slice(1).join(" ");

    switch (subCommand) {
      case "info":
        return await this.showMonsterInfo(player, monsterName);
      case "list":
        return await this.showMonstersInArea(player);
      case "drops":
        return await this.showMonsterDrops(player, monsterName);
      default:
        return {
          success: false,
          message: "❌ Lệnh không hợp lệ! Sử dụng: monster [info/list/drops] [tên quái vật]",
        };
    }
  }

  /**
   * Kiểm tra quái vật có trong nhiệm vụ hiện tại của người chơi không
   * @param {Player} player - Người chơi
   * @param {Monster} monster - Quái vật cần kiểm tra
   * @returns {boolean} - True nếu quái vật có trong nhiệm vụ
   */
  isMonsterInQuest(player, monster) {
    if (!player.quests || !player.quests.active || player.quests.active.length === 0) {
      return false;
    }

    // Kiểm tra tất cả nhiệm vụ đang thực hiện
    for (const quest of player.quests.active) {
      if (!quest.objectives) continue;

      // Kiểm tra tất cả objectives trong quest
      for (const objective of quest.objectives) {
        if (
          objective.type === "kill" &&
          (objective.targetId === monster.id ||
            objective.targetName === monster.name ||
            objective.targetId === monster.getId() ||
            objective.targetName === monster.getName())
        ) {
          return true;
        }
      }
    }

    return false;
  }

  /**
   * Hiển thị danh sách quái vật trong khu vực
   * @param {Object} player - Thông tin người chơi
   * @returns {Promise<Object>} Kết quả xử lý
   */
  async showMonstersInArea(player) {
    const areaId = player.currentArea;
    const monsters = await this.getMonstersInArea(areaId);

    if (!monsters || !monsters.length) {
      return {
        success: false,
        message: "❌ Không có quái vật nào trong khu vực này!",
      };
    }

    let message = "👾 QUÁI VẬT TRONG KHU VỰC 👾\n\n";

    monsters.forEach((monster) => {
      const isInQuest = this.isMonsterInQuest(player, monster);
      const questMarker = isInQuest ? "⭐ " : "";
      message += `${monster.icon || "👾"} ${questMarker}${monster.name} (Lv.${monster.level})\n`;
      message += `HP: ${monster.hp}\n`;
      message += `Tấn công: ${monster.attack || 0}\n`;
      message += `Kinh nghiệm: ${monster.exp || 0} điểm\n`;
      if (isInQuest) {
        message += `📜 Có trong nhiệm vụ hiện tại\n`;
      }
      message += `\n`;
    });

    return {
      success: true,
      message,
    };
  }

  /**
   * Hiển thị thông tin chi tiết về quái vật
   * @param {Object} player - Thông tin người chơi
   * @param {string} monsterName - Tên quái vật
   * @returns {Promise<Object>} Kết quả xử lý
   */
  async showMonsterInfo(player, monsterName) {
    if (!monsterName) {
      return {
        success: false,
        message: "❌ Vui lòng cung cấp tên quái vật!",
      };
    }

    const monster = await this.getMonsterByName(monsterName);

    if (!monster) {
      return {
        success: false,
        message: `❌ Không tìm thấy quái vật có tên '${monsterName}'!`,
      };
    }

    let message = `👾 THÔNG TIN QUÁI VẬT: ${monster.name} 👾\n\n`;
    message += `Cấp độ: ${monster.level}\n`;
    message += `HP: ${monster.hp}\n`;
    message += `Tấn công: ${monster.attack || 0}\n`;
    message += `Phòng thủ: ${monster.defense}\n`;
    message += `Tốc độ: ${monster.speed}\n`;
    message += `Kinh nghiệm: ${monster.exp || 0} điểm\n`;

    if (monster.description) {
      message += `\nMô tả: ${monster.description}\n`;
    }

    if (monster.areas && monster.areas.length > 0) {
      message += "\nXuất hiện tại:\n";
      monster.areas.forEach((areaId) => {
        const area = this.areaService.findAreaByNameOrId(areaId);
        if (area) {
          message += `- ${area.name}\n`;
        }
      });
    }

    return {
      success: true,
      message,
    };
  }

  /**
   * Hiển thị vật phẩm rơi ra từ quái vật
   * @param {Object} player - Thông tin người chơi
   * @param {string} monsterName - Tên quái vật
   * @returns {Promise<Object>} Kết quả xử lý
   */
  async showMonsterDrops(player, monsterName) {
    if (!monsterName) {
      return {
        success: false,
        message: "❌ Vui lòng cung cấp tên quái vật!",
      };
    }

    const monster = await this.getMonsterByName(monsterName);

    if (!monster) {
      return {
        success: false,
        message: `❌ Không tìm thấy quái vật có tên '${monsterName}'!`,
      };
    }

    if (!monster.drops || !monster.drops.length) {
      return {
        success: false,
        message: `❌ Quái vật ${monster.name} không có vật phẩm rơi ra!`,
      };
    }

    const itemsData = await this.gameManager.getItemsData();

    // Xác định loại quái vật để hiển thị tỷ lệ nội tại mặc định
    let defaultTraitChance = 3; // Quái thường: 3%
    let monsterType = "Quái thường";

    // Kiểm tra xem có phải là boss không
    if (monster.data && monster.data.isBoss) {
      defaultTraitChance = 8; // Boss: 8%
      monsterType = "Boss";
    }

    // Kiểm tra xem có phải là boss thế giới không
    if (monster.data && monster.data.isWorldBoss) {
      defaultTraitChance = 15; // Boss thế giới: 15%
      monsterType = "Boss thế giới";
    }

    let message = `🎁 VẬT PHẨM RƠI RA TỪ ${monster.name} (${monsterType}) 🎁\n\n`;

    monster.drops.forEach((drop) => {
      const item = itemsData.items.find((i) => i.id === drop.itemId);
      if (item) {
        message += `${item.icon || "🔹"} ${item.name}`;

        if (drop.chance) {
          message += ` (Tỉ lệ: ${drop.chance}%)`;
        }

        // Hiển thị thông tin về nội tại
        if (drop.hiddenTrait || (drop.traits && drop.traits.length > 0)) {
          if (drop.hiddenTrait) {
            message += ` - Nội tại: ${getHiddenTraitName(drop.hiddenTrait)}`;
          } else if (drop.traits && drop.traits.length > 0) {
            const traitChance = drop.traitChance || defaultTraitChance;
            message += ` - Có thể có nội tại (${traitChance}%): `;

            const traitNames = drop.traits.map((trait) => {
              return getHiddenTraitName(trait);
            });

            message += traitNames.join(", ");
          }
        }

        message += "\n";
      }
    });

    return {
      success: true,
      message,
    };
  }
}

let instance = null;

export function getMonsterServiceInstance() {
  if (!instance) {
    instance = new MonsterService();
  }
  return instance;
}
