/**
 * Player.js
 * Module xử lý logic liên quan đến người chơi
 */

import { Entity } from "../core/Entity.js";
import { getGameDataInstance } from "../core/GameData.js";
import { getAreaServiceInstance } from "../services/AreaService.js";
import { getItemServiceInstance } from "../services/ItemService.js";
import { getCategoryName, getHiddenTraitName } from "../utils/GameUtils.js";

export class Player extends Entity {
  constructor(playerData) {
    super(playerData.globalId, playerData.name);
    this.rawData = playerData;
    this.globalId = playerData.globalId;
    this.currentArea = playerData.currentArea;
    this.bag = playerData.bag;
    this.money = playerData.money;
    this.stat = playerData.stat;
    this.quests = playerData.quests;
    this.body = playerData.body;
    this.skill = playerData.skill || { active: [], passive: [] };
    this.knownIds = playerData.knownIds || [];
    this.status = playerData.status || "online";
    this.lastActivity = playerData.lastActivity || Date.now();
    this.createdAt = playerData.createdAt || Date.now();
    this.effects = playerData.effects || {};
    this.achievement = playerData.achievement || {};
    this.respawnTime = playerData.respawnTime || null;

    this.currentCombat = playerData.currentCombat || null;
    this.targetSelection = playerData.targetSelection || null;
    this.combatBuffs = playerData.combatBuffs || [];
    this.combatDebuffs = playerData.combatDebuffs || [];
    this.lastBossAttack = playerData.lastBossAttack || 0;
    this.pvpPreparationEndTime = playerData.pvpPreparationEndTime || null;
  }

  /**
   * Cập nhật dữ liệu người chơi vào bộ nhớ
   */
  save() {
    /** @type {import('../core/GameData.js').GameData} */
    const gameData = getGameDataInstance();
    gameData.setPlayerData(this.globalId, this);
    gameData.markPlayerDataChanged();

    return true;
  }

  /**
   * Chuyển đổi dữ liệu người chơi thành JSON để lưu trữ
   * @returns {Object} - Dữ liệu người chơi dạng JSON
   */
  toJSON() {
    return {
      globalId: this.globalId,
      name: this.getName(),
      status: this.status,
      lastActivity: this.lastActivity,
      createdAt: this.createdAt,
      currentArea: this.currentArea,
      bag: this.bag,
      money: this.money,
      stat: this.stat,
      quests: this.quests,
      body: this.body,
      skill: this.skill,
      knownIds: this.knownIds,
      achievement: this.achievement,
      effects: this.effects,
      respawnTime: this.respawnTime,
      currentCombat: this.currentCombat,
      targetSelection: this.targetSelection,
      combatBuffs: this.combatBuffs,
      combatDebuffs: this.combatDebuffs,
      lastBossAttack: this.lastBossAttack,
      pvpPreparationEndTime: this.pvpPreparationEndTime,
    };
  }

  /**
   * Lấy ID toàn cục của người chơi
   * @returns {string} - ID toàn cục
   */
  getGlobalId() {
    return this.globalId;
  }

  /**
   * Tính toán các chỉ số tổng hợp từ chỉ số cơ bản + trang bị + kỹ năng
   */
  getBaseStats() {
    // Clone chỉ số cơ bản
    const stats = JSON.parse(JSON.stringify(this.stat));

    // Đảm bảo các chỉ số cơ bản luôn tồn tại
    const baseStats = [
      "attack",
      "intelligence",
      "defense",
      "speed",
      "vitality",
      "critRate",
      "critDmg",
      "dodge",
      "accuracy",
    ];
    baseStats.forEach((stat) => {
      if (stats[stat] === undefined) stats[stat] = 1;
    });

    // Thêm chỉ số từ trang bị
    Object.values(this.body || {}).forEach((equipment) => {
      if (equipment) {
        Object.entries(equipment.stats || {}).forEach(([key, value]) => {
          if (stats[key] !== undefined) {
            stats[key] += value;
          } else if (key === "hp" || key === "mp") {
            if (stats[key] && stats[key].max) {
              stats[key].max += value;
            }
          }
        });
      }
    });

    // Thêm chỉ số từ kỹ năng bị động
    if (this.skill && Array.isArray(this.skill.passive)) {
      this.skill.passive.forEach((skill) => {
        Object.entries(skill.stats || {}).forEach(([key, value]) => {
          if (stats[key] !== undefined) {
            stats[key] += value;
          } else if (key === "hp" || key === "mp") {
            if (stats[key] && stats[key].max) {
              stats[key].max += value;
            }
          }
        });
      });
    }

    return stats;
  }

  /**
   * Thêm kinh nghiệm và tự động lên cấp nếu đủ điều kiện
   * @param {number} amount - Số kinh nghiệm cần thêm
   * @returns {Object} - Kết quả thêm kinh nghiệm
   */
  addExp(amount) {
    this.stat.exp.current += amount;

    let levelUp = false;
    let levelsGained = 0;
    let statGains = {
      hp: 0,
      mp: 0,
      attack: 0,
      intelligence: 0,
      defense: 0,
      speed: 0,
    };

    // Kiểm tra có đủ exp để lên cấp không
    while (this.stat.exp.current >= this.stat.exp.next) {
      this.stat.exp.current -= this.stat.exp.next;
      this.stat.level += 1;
      levelsGained++;
      levelUp = true;

      // Tăng exp cần cho level tiếp theo theo công thức
      this.stat.exp.next = this.stat.level * 100 + 50;

      // Tăng các chỉ số cơ bản khi lên cấp
      this.stat.hp.max += 10;
      this.stat.hp.current = this.stat.hp.max;
      this.stat.mp.max += 5;
      this.stat.mp.current = this.stat.mp.max;
      this.stat.attack += 4;
      this.stat.intelligence += 2;
      this.stat.defense += 1;
      this.stat.speed += 1;

      // Tăng điểm kỹ năng khi lên cấp
      if (!this.stat.skillPoint) this.stat.skillPoint = 0;
      this.stat.skillPoint += 2; // Mỗi level nhận 2 điểm kỹ năng

      // Cộng dồn tăng chỉ số để thông báo
      statGains.hp += 10;
      statGains.mp += 5;
      statGains.attack += 4;
      statGains.intelligence += 2;
      statGains.defense += 1;
      statGains.speed += 1;
    }

    // Lưu thay đổi nếu có lên cấp
    if (levelUp) {
      this.save();
    }

    return { levelUp, levelsGained, statGains };
  }

  /**
   * Trang bị vật phẩm
   * @param {Object} item - Vật phẩm cần trang bị
   * @returns {Object} - Kết quả trang bị
   */
  equipItem(item) {
    if (!item || !item.type) {
      return { success: false, message: "Vật phẩm không hợp lệ hoặc không thể trang bị." };
    }

    // Xác định vị trí trang bị dựa trên loại item
    let slot = null;
    switch (item.type) {
      case "weapon":
        slot = "arm";
        break;
      case "helmet":
        slot = "head";
        break;
      case "armor":
        slot = "chest";
        break;
      case "shield":
        slot = "arm"; // Dùng chung với weapon nhưng phải kiểm tra xem có đang cầm vũ khí 2 tay không
        break;
      case "boots":
        slot = "leg";
        break;
      case "cape":
        slot = "back";
        break;
      default:
        return { success: false, message: `Không thể trang bị vật phẩm loại ${item.type}.` };
    }

    // Kiểm tra điều kiện trang bị
    if (item.requirements) {
      // Kiểm tra level
      if (item.requirements.level && this.stat.level < item.requirements.level) {
        return { success: false, message: `Bạn cần đạt cấp độ ${item.requirements.level} để sử dụng vật phẩm này.` };
      }
      // Thêm các điều kiện khác nếu cần
    }

    // Tháo trang bị cũ nếu có và thêm vào túi đồ
    const oldEquipment = this.body[slot];
    if (oldEquipment) {
      this.addItemToBag(oldEquipment, 1);
    }

    // Trang bị vật phẩm mới
    this.body[slot] = { ...item }; // Clone để tránh thay đổi item gốc

    // Xóa item khỏi túi đồ
    this.removeItemFromBag(item.id, 1);

    // Lưu thay đổi
    this.save();

    // Tạo thông báo chi tiết về chỉ số trang bị
    let message = `Đã trang bị ${item.name} vào ô ${this.getSlotName(slot)}.\n\n`;

    if (item.stats) {
      message += `➡️ Chỉ số cơ bản:\n`;
      Object.entries(item.stats).forEach(([key, value]) => {
        message += `   • ${this.getStatName(key)}: +${value}\n`;
      });
      message += "\n";
    }

    if (item.hiddenTrait) {
      message += `✨ Nội tại ẩn:\n`;
      message += `   • ${item.hiddenTrait.name}\n`;
      if (item.hiddenTrait.description) message += `   • ${item.hiddenTrait.description}\n`;

      if (item.hiddenTrait.effects) {
        Object.entries(item.hiddenTrait.effects).forEach(([key, value]) => {
          message += `   • ${this.getStatName(key)}: +${value}\n`;
        });
      }
      message += "\n";
    }

    if (oldEquipment && oldEquipment.stats) {
      message += `🔄 THAY ĐỔI CHỈ SỐ (từ ${oldEquipment.name}):\n`;

      const allStats = new Set([...Object.keys(item.stats || {}), ...Object.keys(oldEquipment.stats || {})]);

      allStats.forEach((stat) => {
        const newValue = (item.stats && item.stats[stat]) || 0;
        const oldValue = (oldEquipment.stats && oldEquipment.stats[stat]) || 0;
        const diff = newValue - oldValue;

        if (diff !== 0) {
          const sign = diff > 0 ? "+" : "";
          message += `   • ${this.getStatName(stat)}: ${sign}${diff}\n`;
        }
      });
    }

    return {
      success: true,
      message,
      oldEquipment,
    };
  }

  /**
   * Tháo trang bị
   * @param {string} slot - Vị trí trang bị cần tháo
   * @returns {Object} - Kết quả tháo trang bị
   */
  unequipItem(slot) {
    // Kiểm tra slot có hợp lệ không
    if (!this.body[slot]) {
      return { success: false, message: `Không có trang bị nào ở ${this.getSlotName(slot)}.` };
    }

    // Lấy trang bị cần tháo
    const equipment = this.body[slot];

    // Kiểm tra túi đồ có đủ chỗ không
    if (this.bag.item.length >= this.bag.maxSlots) {
      return { success: false, message: "Túi đồ đã đầy, không thể tháo trang bị." };
    }

    // Thêm trang bị vào túi đồ
    this.addItemToBag(equipment, 1);

    // Xóa trang bị khỏi slot
    this.body[slot] = null;

    // Lưu thay đổi
    this.save();

    // Tạo thông báo chi tiết về chỉ số bị mất
    let message = `Đã tháo ${equipment.name} khỏi ${this.getSlotName(slot)}.\n\n`;

    if (equipment.stats) {
      Object.entries(equipment.stats).forEach(([key, value]) => {
        message += `   • ${this.getStatName(key)}: -${value}\n`;
      });
      message += "\n";
    }

    if (equipment.hiddenTrait) {
      message += `✨ NỘI TẠI ẨN BỊ MẤT:\n`;
      message += `   • ${equipment.hiddenTrait.name}\n`;
      if (equipment.hiddenTrait.description) message += `   • ${equipment.hiddenTrait.description}\n`;

      if (equipment.hiddenTrait.effects) {
        Object.entries(equipment.hiddenTrait.effects).forEach(([key, value]) => {
          message += `   • ${this.getStatName(key)}: -${value}\n`;
        });
      }
    }

    return {
      success: true,
      message,
      equipment,
    };
  }

  /**
   * Lấy tên hiển thị của vị trí trang bị
   * @param {string} slot - Mã vị trí
   * @returns {string} - Tên hiển thị
   */
  getSlotName(slot) {
    const slotNames = {
      head: "đầu",
      chest: "áo giáp",
      back: "áo choàng",
      arm: "vũ khí",
      leg: "giày",
    };
    return slotNames[slot] || slot;
  }

  /**
   * Thêm vật phẩm vào túi đồ
   * @param {Object} item - Vật phẩm cần thêm
   * @param {number} amount - Số lượng
   * @param {boolean} isLocked - Vật phẩm có bị khóa không (mặc định là true - không thể giao dịch)
   * @returns {Object} - Kết quả thêm vật phẩm
   */
  addItemToBag(item, amount = 1, isLocked = true) {
    if (!item || !item.id) return { success: false, message: "Vật phẩm không hợp lệ" };

    if (typeof amount === "boolean") {
      isLocked = amount;
      amount = item.amount || 1;
    } else {
      amount = item.amount || amount || 1;
    }

    if (item.hasOwnProperty("isLocked")) {
      isLocked = item.isLocked;
    } else {
      isLocked = true;
    }

    if (!this.bag.maxSlots) {
      this.bag.maxSlots = 20;
    }

    const equipableTypes = ["weapon", "helmet", "armor", "shield", "boots", "cape"];
    const templateItem = getItemServiceInstance().getItemTemplate(item.id);

    const isEquipment = templateItem.type && equipableTypes.includes(templateItem.type);
    const isStackable = templateItem.stackable !== false;

    if (isEquipment || !isStackable) {
      if (this.bag.item.length + amount > this.bag.maxSlots) {
        return {
          success: false,
          message: `Túi đồ sắp đầy, chỉ có thể thêm ${this.bag.maxSlots - this.bag.item.length}/${amount} vật phẩm.`,
        };
      }

      for (let i = 0; i < amount; i++) {
        let newItem;

        // Đối với trang bị chiến đấu, lưu toàn bộ thuộc tính
        if (isEquipment) {
          // Sao chép đầy đủ thuộc tính từ template và item
          newItem = {
            ...templateItem,
            id: templateItem.id,
            name: templateItem.name,
            amount: 1,
            isLocked: isLocked,
          };
        } else {
          // Đối với vật phẩm tiêu thụ hoặc nhiệm vụ, chỉ lưu thông tin cơ bản
          newItem = {
            id: templateItem.id,
            name: templateItem.name,
            amount: 1,
            isLocked: isLocked,
          };
        }

        // Xử lý nội tại ẩn (hiddenTrait) nếu có
        if (item.hiddenTrait) {
          newItem.hiddenTrait = item.hiddenTrait;
        }

        this.bag.item.push(newItem);
      }

      return {
        success: true,
        message: `Đã thêm ${amount} ${templateItem.name || templateItem.id} ${
          isLocked ? "(Khóa)" : "(Không khóa)"
        } vào túi đồ.`,
        stacked: false,
      };
    }

    const existingItem = this.bag.item.find((i) => i.id === templateItem.id && i.isLocked === isLocked);

    if (existingItem) {
      existingItem.amount += amount;
      return {
        success: true,
        message: `Đã thêm ${amount} ${templateItem.name || templateItem.id} ${
          isLocked ? "(Khóa)" : "(Không khóa)"
        } vào túi đồ.`,
        stacked: true,
      };
    } else {
      if (this.bag.item.length >= this.bag.maxSlots) {
        return {
          success: false,
          message: `Túi đồ đã đầy (${this.bag.item.length}/${this.bag.maxSlots}), không thể nhận thêm vật phẩm mới.`,
        };
      }

      // Tạo item mới tùy theo loại vật phẩm
      let newItem;

      // Kiểm tra xem có phải là trang bị không
      const isEquip = templateItem.type && equipableTypes.includes(templateItem.type);

      if (isEquip) {
        // Đối với trang bị, lưu đầy đủ thuộc tính
        newItem = {
          ...templateItem,
          id: templateItem.id,
          name: templateItem.name,
          amount: amount,
          isLocked: isLocked,
        };
      } else {
        // Đối với vật phẩm tiêu thụ, chỉ lưu thông tin cơ bản
        newItem = {
          id: templateItem.id,
          name: templateItem.name,
          amount: amount,
          isLocked: isLocked,
        };
      }

      // Xử lý nội tại ẩn (hiddenTrait) nếu có
      if (item.hiddenTrait) {
        newItem.hiddenTrait = item.hiddenTrait;
      }

      this.bag.item.push(newItem);

      return {
        success: true,
        message: `Đã thêm ${amount} ${templateItem.name || templateItem.id} ${
          isLocked ? "(Khóa)" : "(Không khóa)"
        } vào túi đồ.`,
        stacked: false,
      };
    }
  }

  /**
   * Xóa vật phẩm khỏi túi đồ
   * @param {string} itemId - ID vật phẩm cần xóa
   * @param {number} amount - Số lượng
   * @returns {boolean} - Kết quả xóa vật phẩm
   */
  removeItemFromBag(itemId, amount = 1) {
    if (!itemId) return false;

    const existingItemIndex = this.bag.item.findIndex((i) => i.id === itemId);

    if (existingItemIndex >= 0) {
      this.bag.item[existingItemIndex].amount -= amount;

      if (this.bag.item[existingItemIndex].amount <= 0) {
        this.bag.item.splice(existingItemIndex, 1);
      }

      return true;
    }

    return false;
  }

  /**
   * Sử dụng vật phẩm từ túi đồ
   * @param {Object} item - Vật phẩm cần sử dụng
   * @returns {Object} - Kết quả sử dụng vật phẩm
   */
  useItem(item) {
    if (!item) {
      return { success: false, message: "Vật phẩm không tồn tại." };
    }

    const templateItem = getItemServiceInstance().getItemTemplate(item.id);

    if (templateItem.effects) {
      if (templateItem.effects.hp) {
        if (this.stat.hp.current >= this.stat.hp.max) {
          return {
            success: false,
            message: `❌ HP của bạn đã đầy (${this.stat.hp.current}/${this.stat.hp.max}), không cần sử dụng ${templateItem.name}.`,
          };
        }

        const oldHp = this.stat.hp.current;
        this.stat.hp.current = Math.min(this.stat.hp.current + templateItem.effects.hp, this.stat.hp.max);
        const hpGained = this.stat.hp.current - oldHp;

        this.removeItemFromBag(item.id, 1);
        this.save();

        return {
          success: true,
          message: `Bạn đã sử dụng ${templateItem.name} và hồi phục ${hpGained} HP.`,
          effect: { hp: hpGained },
        };
      }

      if (templateItem.effects.mp) {
        if (this.stat.mp.current >= this.stat.mp.max) {
          return {
            success: false,
            message: `❌ MP của bạn đã đầy (${this.stat.mp.current}/${this.stat.mp.max}), không cần sử dụng ${templateItem.name}.`,
          };
        }

        const oldMp = this.stat.mp.current;
        this.stat.mp.current = Math.min(this.stat.mp.current + templateItem.effects.mp, this.stat.mp.max);
        const mpGained = this.stat.mp.current - oldMp;

        this.removeItemFromBag(item.id, 1);
        this.save();

        return {
          success: true,
          message: `Bạn đã sử dụng ${templateItem.name} và hồi phục ${mpGained} MP.`,
          effect: { mp: mpGained },
        };
      }

      if (templateItem.effects.exp) {
        const expResult = this.addExp(templateItem.effects.exp);

        this.removeItemFromBag(item.id, 1);
        this.save();

        let message = `Bạn đã sử dụng ${templateItem.name} và nhận được ${templateItem.effects.exp} điểm kinh nghiệm.`;
        if (expResult.levelUp) {
          message += ` Bạn đã lên cấp ${expResult.levelsGained} cấp!`;
        }

        return {
          success: true,
          message,
          effect: { exp: templateItem.effects.exp, levelUp: expResult },
        };
      }
    }

    return { success: false, message: "Vật phẩm này không thể sử dụng." };
  }

  /**
   * Học kỹ năng mới
   * @param {Object} skill - Kỹ năng cần học
   * @returns {Object} - Kết quả học kỹ năng
   */
  learnSkill(skill) {
    if (!skill) {
      return { success: false, message: "Kỹ năng không tồn tại." };
    }

    // Kiểm tra yêu cầu
    if (skill.requirements) {
      // Kiểm tra cấp độ
      if (skill.requirements.level && this.stat.level < skill.requirements.level) {
        return {
          success: false,
          message: `Bạn cần đạt cấp độ ${skill.requirements.level} để học kỹ năng này.`,
        };
      }

      // Kiểm tra các chỉ số
      if (skill.requirements.stats) {
        const baseStats = this.getBaseStats();
        for (const [statName, value] of Object.entries(skill.requirements.stats)) {
          if (!baseStats[statName] || baseStats[statName] < value) {
            return {
              success: false,
              message: `Bạn cần có chỉ số ${statName} ít nhất ${value} để học kỹ năng này.`,
            };
          }
        }
      }
    }

    // Kiểm tra đã học kỹ năng chưa
    const skillType = skill.type || "active";
    const existingSkill = this.findSkill(skill.id);
    if (existingSkill) {
      return { success: false, message: "Bạn đã học kỹ năng này rồi." };
    }

    // Thêm kỹ năng vào danh sách
    if (!this.skill[skillType]) this.skill[skillType] = [];
    this.skill[skillType].push({ ...skill });

    // Lưu thay đổi
    this.save();

    return {
      success: true,
      message: `Bạn đã học thành công kỹ năng ${skill.name}.`,
    };
  }

  /**
   * Tìm kỹ năng theo tên hoặc ID
   * @param {string} nameOrId - Tên hoặc ID kỹ năng
   * @returns {Object|null} - Kỹ năng hoặc null nếu không tìm thấy
   */
  findSkill(nameOrId) {
    if (!nameOrId) return null;

    // Tìm trong kỹ năng chủ động
    if (this.skill.active) {
      const active = this.skill.active.find(
        (s) => s.id === nameOrId || s.name.toLowerCase() === nameOrId.toLowerCase()
      );
      if (active) return active;
    }

    // Tìm trong kỹ năng bị động
    if (this.skill.passive) {
      const passive = this.skill.passive.find(
        (s) => s.id === nameOrId || s.name.toLowerCase() === nameOrId.toLowerCase()
      );
      if (passive) return passive;
    }

    return null;
  }

  /**
   * Lấy danh sách kỹ năng của người chơi
   * @returns {Object} - Danh sách kỹ năng
   */
  getSkills() {
    return this.skill;
  }

  /**
   * Lấy tất cả kỹ năng dưới dạng mảng (để tương thích với code cũ)
   * @returns {Array} - Mảng tất cả kỹ năng
   */
  getAllSkills() {
    return [...(this.skill.active || []), ...(this.skill.passive || [])];
  }

  /**
   * Nghỉ ngơi và hồi phục HP/MP
   * @returns {Object} - Kết quả nghỉ ngơi
   */
  restAndRecover() {
    const oldHp = this.stat.hp.current;
    const oldMp = this.stat.mp.current;

    // Hồi 20% HP và MP
    const hpRecovery = Math.ceil(this.stat.hp.max * 0.2);
    const mpRecovery = Math.ceil(this.stat.mp.max * 0.2);

    this.stat.hp.current = Math.min(this.stat.hp.current + hpRecovery, this.stat.hp.max);
    this.stat.mp.current = Math.min(this.stat.mp.current + mpRecovery, this.stat.mp.max);

    const hpGained = this.stat.hp.current - oldHp;
    const mpGained = this.stat.mp.current - oldMp;

    // Lưu thay đổi
    this.save();

    return {
      success: true,
      message: `Bạn đã nghỉ ngơi và hồi phục ${hpGained} HP, ${mpGained} MP.`,
      hpGained,
      mpGained,
    };
  }

  /**
   * Xử lý cái chết của người chơi
   * @param {Array} areasData - Dữ liệu khu vực
   * @returns {Object} - Kết quả xử lý cái chết
   */
  handleDeath(areasData) {
    this.stat.hp.current = Math.floor(this.stat.hp.max * 0.3); // 30% HP
    this.stat.mp.current = Math.floor(this.stat.mp.max * 0.3); // 30% MP

    // Di chuyển về khu an toàn (town)
    const oldArea = this.currentArea;
    this.currentArea = "town";

    this.save();

    const currentArea = getAreaServiceInstance().findAreaByNameOrId(this.currentArea);

    return {
      success: true,
      message: `Bạn đã ngất đi và được đưa về ${currentArea ? currentArea.name : this.currentArea}.`,
      oldArea,
      newArea: this.currentArea,
    };
  }

  /**
   * Lấy thông tin thống kê của người chơi
   * @returns {string} - Thông tin người chơi
   */
  getStatsString() {
    const stats = this.getBaseStats();
    const currentArea = getAreaServiceInstance().findAreaByNameOrId(this.currentArea);

    return `📊 THÔNG TIN NGƯỜI CHƠI 📊
    
👤 Tên: ${this.getName()}
📈 Cấp độ: ${this.stat.level}
⭐ Kinh nghiệm: ${this.stat.exp.current}/${this.stat.exp.next}
❤️ HP: ${this.stat.hp.current}/${this.stat.hp.max}
💙 MP: ${this.stat.mp.current}/${this.stat.mp.max}
🏙️ Khu vực hiện tại: ${currentArea ? currentArea.name + " [" + currentArea.id + "]" : this.currentArea}

📋 CHỈ SỐ CƠ BẢN:
⚔️ Tấn công: ${stats.attack}
🧠 Thông minh: ${stats.intelligence}
🛡️ Phòng thủ: ${stats.defense}
🏃 Tốc độ: ${stats.speed}
💝 Sinh lực: ${stats.vitality}
🎯 Tỉ lệ chí mạng: ${stats.critRate}%
💥 Sát thương chí mạng: ${stats.critDmg}%
🌀 Né tránh: ${stats.dodge}%
📏 Chính xác: ${stats.accuracy}%

💰 Túi tiền:
💰 Vàng: ${this.money.gold}
💎 Kim cương: ${this.money.diamond}
☄️ Thiên thạch: ${this.money.meteorite}

📝 Nhiệm vụ: ${this.quests.active.length} đang thực hiện, ${this.quests.completed.length} đã hoàn thành`;
  }

  /**
   * Lấy thông tin các trang bị đang mặc
   * @returns {string} - Thông tin trang bị ở dạng văn bản
   */
  getEquipmentDisplay() {
    let response = `⚔️ TRANG BỊ ĐANG MANG\n\n`;

    const bodySlots = {
      head: "🧢 Mũ",
      chest: "🛡️ Áo giáp",
      back: "🦸 Áo choàng",
      arm: "⚔️ Vũ khí",
      leg: "👢 Giày",
    };

    let hasEquipment = false;

    // Để tính tổng chỉ số từ tất cả trang bị
    const totalStats = {
      attack: 0,
      intelligence: 0,
      defense: 0,
      speed: 0,
      vitality: 0,
      critRate: 0,
      critDmg: 0,
      dodge: 0,
      accuracy: 0,
    };

    // Để tính tổng tăng cường phép thuật và combo
    const totalElementBoost = {
      fire: 0,
      ice: 0,
      lightning: 0,
      earth: 0,
      water: 0,
      wind: 0,
      light: 0,
      dark: 0,
      all: 0,
    };

    let totalComboBoost = 0;

    for (const [slot, displayName] of Object.entries(bodySlots)) {
      const equipment = this.body[slot];
      if (equipment) {
        hasEquipment = true;
        response += `${displayName}: ${equipment.name}`;

        if (equipment.hiddenTrait) {
          response += ` [✨ ${getHiddenTraitName(equipment.hiddenTrait)}]`;
        }

        response += "\n";

        // Hiển thị các chỉ số của trang bị
        if (equipment.stats) {
          for (const [stat, value] of Object.entries(equipment.stats)) {
            if (value && this.getStatName(stat)) {
              response += `  • ${this.getStatIcon(stat)} ${this.getStatName(stat)}: +${value}`;
              if (stat === "critRate" || stat === "critDmg" || stat === "dodge" || stat === "accuracy") {
                response += "%";
              }
              response += "\n";

              // Cộng vào tổng chỉ số
              if (totalStats.hasOwnProperty(stat)) {
                totalStats[stat] += value;
              }
            }
          }
        }

        // Hiển thị tăng cường phép thuật nếu có
        if (equipment.elementBoost) {
          response += "  • 🔮 Tăng sức mạnh phép thuật:\n";
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

          for (const [element, value] of Object.entries(equipment.elementBoost)) {
            if (value && elementNames[element]) {
              response += `    - ${elementNames[element]}: +${value}\n`;

              // Cộng vào tổng tăng cường phép thuật
              if (totalElementBoost.hasOwnProperty(element)) {
                totalElementBoost[element] += value;
              }
            }
          }
        }

        // Hiển thị tăng cường combo nếu có
        if (equipment.comboBoost) {
          response += `  • 👊 Tăng sức mạnh combo: +${equipment.comboBoost}\n`;
          totalComboBoost += equipment.comboBoost;
        }

        if (equipment.description) {
          response += `  📝 ${equipment.description}\n`;
        }

        response += "\n";
      } else {
        response += `${displayName}: (Trống)\n\n`;
      }
    }

    if (!hasEquipment) {
      response += "Bạn chưa trang bị vật phẩm nào.\n";
    } else {
      response += `\n📊 TỔNG CHỈ SỐ CỘNG THÊM\n`;
      let hasStats = false;

      for (const [stat, value] of Object.entries(totalStats)) {
        if (value > 0) {
          hasStats = true;
          response += `${this.getStatIcon(stat)} ${this.getStatName(stat)}: +${value}`;
          if (stat === "critRate" || stat === "critDmg" || stat === "dodge" || stat === "accuracy") {
            response += "%";
          }
          response += "\n";
        }
      }

      // Hiển thị tổng tăng cường phép thuật
      let hasElementBoost = false;
      for (const [element, value] of Object.entries(totalElementBoost)) {
        if (value > 0) {
          if (!hasElementBoost) {
            response += "\n🔮 TĂNG SỨC MẠNH PHÉP THUẬT\n";
            hasElementBoost = true;
          }

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

          response += `${elementNames[element]}: +${value}\n`;
        }
      }

      // Hiển thị tổng tăng cường combo
      if (totalComboBoost > 0) {
        response += `\n👊 TĂNG SỨC MẠNH COMBO: +${totalComboBoost}\n`;
      }

      if (!hasStats && !hasElementBoost && totalComboBoost === 0) {
        response += "Không có chỉ số cộng thêm từ trang bị.\n";
      }
    }

    return response;
  }

  /**
   * Lấy nội dung túi đồ của người chơi
   * @returns {string} - Thông tin túi đồ ở dạng văn bản
   */
  getInventory() {
    let response = `🎒 TÚI ĐỒ (${this.bag.item.length}/${this.bag.maxSlots})\n\n`;

    if (this.bag.item.length === 0) {
      response += "Túi đồ trống.";
    } else {
      const itemsByType = {};

      // Gộp các item cùng ID và cùng trạng thái khóa
      const mergedItems = {};
      this.bag.item.forEach((item) => {
        // Tạo key duy nhất bao gồm ID và trạng thái khóa
        const lockStatus = item.isLocked ? "locked" : "unlocked";
        const uniqueKey = `${item.id}_${lockStatus}`;

        if (mergedItems[uniqueKey]) {
          mergedItems[uniqueKey].amount += item.amount;
        } else {
          mergedItems[uniqueKey] = { ...item };
        }
      });

      // Phân loại theo type
      Object.values(mergedItems).forEach((item) => {
        const type = item.type || "misc";
        if (!itemsByType[type]) itemsByType[type] = [];
        itemsByType[type].push(item);
      });

      // Thứ tự hiển thị ưu tiên
      const typeOrder = ["consumable", "weapon", "armor", "helmet", "boots", "cape", "potion", "scroll", "misc"];

      typeOrder.forEach((type) => {
        if (!itemsByType[type]) return;

        const items = itemsByType[type];
        const typeDisplay =
          {
            weapon: "⚔️ Vũ khí",
            armor: "🛡️ Giáp",
            helmet: "🧢 Mũ",
            boots: "👢 Giày",
            cape: "🦸 Áo choàng",
            consumable: "🧪 TIÊU HAO",
            potion: "🧪 Thuốc",
            scroll: "📜 Cuộn giấy",
            misc: "🧰 VẬT PHẨM KHÁC",
          }[type] || getCategoryName(type);

        response += `${typeDisplay}:\n`;

        items.forEach((item) => {
          // Hiển thị icon khóa/không khóa
          const lockIcon = item.isLocked ? "🔒" : "🔓";
          response += `- ${lockIcon} ${item.name} [${item.amount}]`;

          if (item.hiddenTrait) {
            response += ` [✨ ${getHiddenTraitName(item.hiddenTrait)}]`;
          }

          // Hiển thị stats cho trang bị
          if (item.stats && Object.keys(item.stats).length > 0) {
            const statStrings = [];
            for (const [stat, value] of Object.entries(item.stats)) {
              const statNames = {
                attack: "ATK",
                defense: "DEF",
                vitality: "VIT",
                speed: "SPD",
                intelligence: "INT",
                critRate: "CRIT",
                critDmg: "CRIT%",
                dodge: "DODGE",
                accuracy: "ACC",
              };
              statStrings.push(`${statNames[stat] || stat}: +${value}`);
            }
            if (statStrings.length > 0) {
              response += ` (${statStrings.join(", ")})`;
            }
          }

          response += "\n";
        });

        response += "\n";
      });
    }

    response += "💰 Túi tiền:\n";
    response += `- Vàng: ${this.money.gold}\n`;
    response += `- Kim cương: ${this.money.diamond}\n`;
    response += `- Thiên thạch: ${this.money.meteorite}`;

    return response;
  }

  /**
   * Tìm vật phẩm trong túi đồ theo tên hoặc ID (không phân biệt hoa thường)
   * @param {string} nameOrId - Tên hoặc ID vật phẩm
   * @returns {Object|null} - Vật phẩm nếu tìm thấy, ngược lại trả về null
   */
  findItemInBag(nameOrId) {
    if (!nameOrId) return null;
    return (
      this.bag.item.find(
        (i) =>
          (i.name && i.name.toLowerCase() === nameOrId.toLowerCase()) ||
          (i.id && i.id.toLowerCase() === nameOrId.toLowerCase())
      ) || null
    );
  }

  /**
   * Lấy tên thân thiện của chỉ số
   * @param {string} statKey - Khóa chỉ số
   * @returns {string} - Tên thân thiện
   */
  getStatName(statKey) {
    const statNames = {
      // Chỉ số cơ bản
      attack: "Tấn công",
      intelligence: "Trí tuệ",
      dexterity: "Nhanh nhẹn",
      vitality: "Sinh lực",
      defense: "Phòng thủ",
      speed: "Tốc độ",
      accuracy: "Độ chính xác",

      // Chỉ số phụ
      hp: "HP",
      mp: "MP",
      attack: "Tấn công",
      spellPower: "Sức mạnh phép thuật",
      critRate: "Tỷ lệ chí mạng",
      critDmg: "Sát thương chí mạng",
      dodge: "Né tránh",

      // Chỉ số đặc biệt
      hpRegen: "Hồi HP",
      mpRegen: "Hồi MP",
      damageReduction: "Giảm sát thương",
      skillDamage: "Sát thương kỹ năng",
      physicalDamage: "Sát thương vật lý",
      magicDamage: "Sát thương ma thuật",
      dodgeChance: "Tỷ lệ né tránh",
      exp: "Kinh nghiệm",
    };

    return statNames[statKey] || statKey;
  }

  /**
   * Lấy icon đại diện cho chỉ số
   * @param {string} statKey - Khóa chỉ số
   * @returns {string} - Icon emoji
   */
  getStatIcon(statKey) {
    const statIcons = {
      intelligence: "🧠",
      dexterity: "🤸",
      vitality: "💝",
      defense: "🛡️",
      speed: "🏃",
      accuracy: "🎯",
      hp: "❤️",
      mp: "💙",
      attack: "⚔️",
      spellPower: "✨",
      critRate: "🎯",
      critDmg: "💥",
      dodge: "🌀",
      hpRegen: "➕❤️",
      mpRegen: "➕💙",
      damageReduction: "🛡️⬇️",
      skillDamage: "✨⚔️",
      physicalDamage: "⚔️",
      magicDamage: "✨",
      dodgeChance: "🌀",
      exp: "⭐",
    };
    return statIcons[statKey] || "";
  }

  getLevel() {
    return this.stat.level || 1;
  }

  /**
   * Tính toán chiến lực của người chơi
   * @returns {number} - Chỉ số chiến lực
   */
  calculatePlayerPower() {
    const { defense, speed, intelligence, hp, mp, attack, critRate, dodge, accuracy } = this.getBaseStats();
    const level = this.getLevel();
    const power =
      attack * 2 +
      defense * 0.8 +
      speed * 0.5 +
      intelligence * 1 +
      level * 10 +
      hp.max * 0.3 +
      mp.max * 0.3 +
      attack * 0.3 +
      critRate * 0.3 +
      dodge * 0.3 +
      accuracy * 0.3;
    return Math.round(power);
  }

  /**
   * Kiểm tra người chơi có đang trong combat không
   * @returns {boolean} - True nếu đang trong combat
   */
  isInCombat() {
    return this.currentCombat !== null;
  }

  /**
   * Lấy ID mục tiêu hiện tại
   * @returns {string|null} - ID mục tiêu
   */
  getCurrentTarget() {
    return this.targetSelection;
  }

  /**
   * Áp dụng hiệu ứng buff cho người chơi
   * @param {Object} buff - Đối tượng buff
   */
  addBuff(buff) {
    if (!this.combatBuffs) this.combatBuffs = [];
    this.combatBuffs.push(buff);
  }

  /**
   * Áp dụng hiệu ứng debuff cho người chơi
   * @param {Object} debuff - Đối tượng debuff
   */
  addDebuff(debuff) {
    if (!this.combatDebuffs) this.combatDebuffs = [];
    this.combatDebuffs.push(debuff);
  }

  /**
   * Xử lý khi người chơi nhận sát thương
   * @param {number} damage - Lượng sát thương
   * @returns {Object} - Kết quả xử lý
   */
  takeDamage(damage) {
    // Tính toán giảm sát thương dựa trên chỉ số phòng thủ
    const defense = this.getBaseStats().defense;
    const reducedDamage = Math.max(1, Math.floor(damage - defense / 4));

    // Kiểm tra xem có khả năng né đòn không
    const dodge = this.getBaseStats().dodge || 0;
    if (Math.random() < dodge / 100) {
      return {
        damage: 0,
        isDodged: true,
        message: "Né đòn thành công!",
      };
    }

    // Giảm HP
    this.stat.hp.current = Math.max(0, this.stat.hp.current - reducedDamage);

    // Lưu thay đổi
    this.save();

    return {
      damage: reducedDamage,
      isDodged: false,
      hpLeft: this.stat.hp.current,
    };
  }

  /**
   * Kiểm tra có thể tấn công boss hay không
   * @param {number} cooldown - Thời gian cooldown (giây)
   * @returns {Object} - Kết quả kiểm tra
   */
  canAttackBoss(cooldown) {
    const now = Date.now();
    const cooldownMs = cooldown * 1000;

    if (now - this.lastBossAttack < cooldownMs) {
      const timeLeft = Math.ceil((this.lastBossAttack + cooldownMs - now) / 1000);
      return {
        canAttack: false,
        timeLeft,
      };
    }

    return {
      canAttack: true,
      timeLeft: 0,
    };
  }

  /**
   * Cập nhật thời điểm tấn công boss gần nhất
   */
  updateBossAttackTime() {
    this.lastBossAttack = Date.now();
    this.save();
  }
}

export default Player;
