/**
 * Monster.js
 * Module xử lý logic liên quan đến quái vật
 */

import { Entity } from '../core/Entity.js';
import { getGameDataInstance } from '../core/GameData.js';
import { getQuestServiceInstance } from '../services/QuestService.js';

export class Monster extends Entity {
  constructor(monsterData) {
    super(monsterData.id, monsterData.name, monsterData.description || '');
    this.level = monsterData.level || 1;
    this.hp = monsterData.hp || 50;
    this.maxHp = monsterData.maxHp || this.hp;
    this.mp = monsterData.mp || 0;
    this.maxMp = monsterData.maxMp || this.mp;
    this.attack = monsterData.attack || 5;
    this.defense = monsterData.defense || 5;
    this.speed = monsterData.speed || 5;
    this.intelligence = monsterData.intelligence || 5;
    this.skills = monsterData.skills || [];
    this.drops = monsterData.drops || [];
    this.goldRange = monsterData.goldRange || { min: 5, max: 15 };
    this.expGain = monsterData.exp || 10;
    this.area = monsterData.area || null;
    this.weakness = monsterData.weakness || [];
    this.resistance = monsterData.resistance || [];
    this.immunity = monsterData.immunity || [];
    this.isDead = false;
    this.statusEffects = [];
    this.data = monsterData;
    this.isEnchanted = monsterData.isEnchanted || false;
  }

  /**
   * Lấy thông tin cơ bản của quái vật
   * @returns {Object} - Thông tin quái vật
   */
  getInfo() {
    return {
      id: this.getId(),
      name: this.getName(),
      description: this.getDescription(),
      level: this.level,
      hp: this.hp,
      maxHp: this.maxHp,
      mp: this.mp,
      maxMp: this.maxMp,
      attack: this.attack,
      defense: this.defense,
      speed: this.speed,
      intelligence: this.intelligence,
      isEnchanted: this.isEnchanted
    };
  }

  /**
   * Gây sát thương cho quái vật
   * @param {number} damage - Lượng sát thương
   * @returns {Object} - Kết quả gây sát thương
   */
  takeDamage(damage) {
    const actualDamage = Math.max(1, damage - Math.floor(this.defense / 2));
    this.hp -= actualDamage;
    
    if (this.hp <= 0) {
      this.hp = 0;
      this.isDead = true;
      return { 
        damage: actualDamage, 
        isDead: true 
      };
    }
    
    return { 
      damage: actualDamage, 
      isDead: false 
    };
  }

  /**
   * Tấn công nhân vật
   * @param {Object} target - Đối tượng bị tấn công
   * @returns {Object} - Kết quả tấn công
   */
  attackTarget(target) {
    // Lấy chỉ số attack
    let attackPower = 0;
    
    if (this.stats && this.stats.attack !== undefined && !isNaN(this.stats.attack)) {
      attackPower = this.stats.attack;
    } 
    // Ngược lại sử dụng thuộc tính attack nếu có
    else if (this.attack !== undefined && !isNaN(this.attack)) {
      attackPower = this.attack;
    } 
    // Nếu không có, sử dụng giá trị mặc định
    else {
      attackPower = 5;
      console.error("Monster missing attack attributes:", this.getName() || this.getId());
    }
    
    // Tính toán sát thương với biến động ngẫu nhiên (90-110%)
    const randomFactor = 0.9 + Math.random() * 0.2;
    const totalDamage = Math.floor(attackPower * randomFactor);
    
    return target.takeDamage(totalDamage);
  }

  /**
   * Phát sinh lượng vàng khi quái vật bị đánh bại
   * @returns {number} - Lượng vàng nhận được
   */
  generateGold() {
    const { min, max } = this.goldRange;
    return Math.floor(Math.random() * (max - min + 1)) + min;
  }

  /**
   * Phát sinh kinh nghiệm khi quái vật bị đánh bại
   * @returns {number} - Lượng kinh nghiệm nhận được
   */
  generateExp() {
    // Có thể thêm biến thể ngẫu nhiên ở đây
    return this.expGain;
  }

  /**
   * Phát sinh vật phẩm rơi khi quái vật bị đánh bại
   * @returns {Array} - Danh sách vật phẩm rơi
   */
  generateDrops() {
    const droppedItems = [];
    
    if (!this.drops || this.drops.length === 0) {
      return droppedItems;
    }
    
    // Xác định loại quái vật để thiết lập tỷ lệ rơi đồ có nội tại
    let defaultTraitChance = 3; // Quái thường: 3%
    
    // Kiểm tra xem có phải là boss không
    if (this.data.isBoss) {
      defaultTraitChance = 8; // Boss: 8%
    }
    
    // Kiểm tra xem có phải là boss thế giới không
    if (this.data.isWorldBoss) {
      defaultTraitChance = 15; // Boss thế giới: 15%
    }
    
    // Kiểm tra xem có phải là quái phù phép không
    if (this.isEnchanted) {
      defaultTraitChance = 10; // Quái phù phép: 10%
    }
    
    // Xử lý cho từng vật phẩm có thể rơi
    for (const drop of this.drops) {
      const chance = drop.chance || 0;
      const random = Math.random() * 100;
      
      if (random <= chance) {
        let amount = 1;
        
        // Xác định số lượng
        if (drop.amountRange) {
          amount = Math.floor(Math.random() * (drop.amountRange.max - drop.amountRange.min + 1)) + drop.amountRange.min;
        } else if (drop.amount) {
          amount = drop.amount;
        }
        
        const droppedItem = {
          id: drop.itemId,
          amount: amount
        };
        
        // Xử lý nội tại ngẫu nhiên nếu có cài đặt
        if (drop.traits && drop.traits.length > 0) {
          // Sử dụng tỷ lệ từ drop nếu có, nếu không dùng tỷ lệ mặc định theo loại quái vật
          const traitChance = drop.traitChance || defaultTraitChance;
          
          // Tính toán xác suất xuất hiện nội tại
          const traitRoll = Math.random() * 100;
          
          if (traitRoll <= traitChance) {
            // Chọn ngẫu nhiên một nội tại từ danh sách
            const traitIndex = Math.floor(Math.random() * drop.traits.length);
            droppedItem.hiddenTrait = drop.traits[traitIndex];
          }
        }
        
        // Nếu drop có hiddenTrait cố định, ưu tiên sử dụng giá trị này
        if (drop.hiddenTrait) {
          droppedItem.hiddenTrait = drop.hiddenTrait;
        }
        
        droppedItems.push(droppedItem);
      }
    }
    
    return droppedItems;
  }

  /**
   * Kiểm tra vật phẩm nhiệm vụ rơi khi quái vật bị đánh bại
   * @param {Object} player - Đối tượng người chơi
   * @param {Object} questsData - Dữ liệu nhiệm vụ
   * @returns {Array} - Danh sách vật phẩm nhiệm vụ rơi
   */
  generateQuestDrops(player, questsData) {
    // Lấy service xử lý nhiệm vụ
    const questService = getQuestServiceInstance();
    
    // Gọi phương thức kiểm tra vật phẩm nhiệm vụ
    return questService.checkQuestItemDrops(player, this.getId(), questsData);
  }

  /**
   * Lấy tất cả vật phẩm rơi (thông thường và nhiệm vụ)
   * @param {Object} player - Đối tượng người chơi
   * @param {Object} questsData - Dữ liệu nhiệm vụ
   * @returns {Object} - Kết quả vật phẩm rơi
   */
  getAllDrops(player, questsData) {
    const normalDrops = this.generateDrops();
    const questDrops = this.generateQuestDrops(player, questsData);
    
    return {
      gold: this.generateGold(),
      exp: this.generateExp(),
      items: normalDrops,
      questItems: questDrops
    };
  }

  /**
   * Xử lý vật phẩm nhiệm vụ rơi
   * @param {Object} player - Đối tượng người chơi
   * @param {Array} questItems - Danh sách vật phẩm nhiệm vụ
   * @param {Object} itemsData - Dữ liệu vật phẩm
   * @param {Object} questsData - Dữ liệu nhiệm vụ
   * @returns {Array} - Kết quả xử lý các vật phẩm nhiệm vụ
   */
  processQuestDrops(player, questItems, itemsData, questsData) {
    const questService = getQuestServiceInstance();
    const results = [];
    
    for (const item of questItems) {
      const result = questService.processQuestItem(player, item, itemsData, questsData);
      results.push(result);
    }
    
    return results;
  }

  /**
   * Kiểm tra xem quái vật có đang sống không
   * @returns {boolean} - Trạng thái sống/chết
   */
  isAlive() {
    return !this.isDead;
  }

  /**
   * Hồi phục HP cho quái vật
   * @param {number} amount - Lượng HP hồi phục
   * @returns {number} - Lượng HP đã hồi phục
   */
  heal(amount) {
    const oldHp = this.hp;
    this.hp = Math.min(this.maxHp, this.hp + amount);
    return this.hp - oldHp;
  }

  /**
   * Hồi phục MP cho quái vật
   * @param {number} amount - Lượng MP hồi phục
   * @returns {number} - Lượng MP đã hồi phục
   */
  restoreMp(amount) {
    const oldMp = this.mp;
    this.mp = Math.min(this.maxMp, this.mp + amount);
    return this.mp - oldMp;
  }

  /**
   * Thêm hiệu ứng trạng thái cho quái vật
   * @param {Object} statusEffect - Hiệu ứng trạng thái
   */
  addStatusEffect(statusEffect) {
    // Kiểm tra xem đã có hiệu ứng cùng loại chưa
    const existingEffect = this.statusEffects.find(effect => effect.type === statusEffect.type);
    
    if (existingEffect) {
      // Cập nhật số lượt nếu đã tồn tại
      existingEffect.turnsLeft = Math.max(existingEffect.turnsLeft, statusEffect.turns);
      existingEffect.value = statusEffect.value; // Cập nhật giá trị
    } else {
      // Thêm hiệu ứng mới
      this.statusEffects.push({
        type: statusEffect.type,
        value: statusEffect.value,
        turnsLeft: statusEffect.turns
      });
    }
  }

  /**
   * Cập nhật hiệu ứng trạng thái theo lượt
   * @returns {Array} - Danh sách thông báo
   */
  updateStatusEffects() {
    const messages = [];
    
    // Xử lý hiệu ứng tiêu cực (debuffs)
    if (this.debuffs && Array.isArray(this.debuffs)) {
      for (let i = this.debuffs.length - 1; i >= 0; i--) {
        const debuff = this.debuffs[i];
        debuff.turnsLeft--;
        
        if (debuff.turnsLeft <= 0) {
          messages.push(`💨 ${this.name} đã hết hiệu ứng ${debuff.name}!`);
          this.debuffs.splice(i, 1);
        }
      }
    }
    
    // Xử lý hiệu ứng tích cực (buffs)
    if (this.buffs && Array.isArray(this.buffs)) {
      for (let i = this.buffs.length - 1; i >= 0; i--) {
        const buff = this.buffs[i];
        buff.turnsLeft--;
        
        if (buff.turnsLeft <= 0) {
          messages.push(`✨ ${this.name} đã hết hiệu ứng ${buff.name}!`);
          this.buffs.splice(i, 1);
        }
      }
    }
    
    // Xử lý sát thương theo lượt (DoT)
    if (this.dots && Array.isArray(this.dots)) {
      for (let i = this.dots.length - 1; i >= 0; i--) {
        const dot = this.dots[i];
        
        // Gây sát thương DoT
        if (dot.damage) {
          const damageResult = this.takeDamage(dot.damage);
          messages.push(`🔥 ${this.name} nhận ${damageResult.damage} sát thương từ ${dot.name}!`);
          
          // Kiểm tra nếu chết vì DoT
          if (damageResult.isDead) {
            messages.push(`☠️ ${this.name} đã bị hạ gục bởi hiệu ứng ${dot.name}!`);
            break;
          }
        }
        
        // Giảm số lượt còn lại của DoT
        dot.turnsLeft--;
        if (dot.turnsLeft <= 0) {
          messages.push(`🌊 Hiệu ứng ${dot.name} trên ${this.name} đã kết thúc!`);
          this.dots.splice(i, 1);
        }
      }
    }
    
    // Giữ lại phương thức cũ cho khả năng tương thích ngược
    if (this.statusEffects && Array.isArray(this.statusEffects)) {
      this.statusEffects = this.statusEffects.filter(effect => {
        effect.turnsLeft--;
        return effect.turnsLeft > 0;
      });
    }
    
    return messages;
  }

  /**
   * Áp dụng hiệu ứng trạng thái lên quái vật
   * @param {string} effectType - Loại hiệu ứng (buff, debuff, dot)
   * @param {Object} effect - Thông tin hiệu ứng
   * @returns {Object} - Kết quả áp dụng hiệu ứng
   */
  applyStatusEffect(effectType, effect) {
    const effectName = effect.name || "Hiệu ứng";
    const turns = effect.turns || effect.turnsLeft || 1;
    
    switch (effectType.toLowerCase()) {
      case "buff":
        if (!this.buffs) this.buffs = [];
        
        // Kiểm tra buff đã tồn tại
        const existingBuff = this.buffs.find(b => b.name === effect.name && b.type === effect.type);
        if (existingBuff) {
          // Cập nhật thời hạn buff
          existingBuff.turnsLeft = Math.max(existingBuff.turnsLeft, turns);
          return {
            success: true,
            message: `🔄 Hiệu ứng ${effectName} được làm mới!`,
            applied: false,
            refreshed: true
          };
        }
        
        // Thêm buff mới
        this.buffs.push({
          name: effect.name,
          type: effect.type,
          value: effect.value,
          turnsLeft: turns,
          isPercent: effect.isPercent || false
        });
        
        return {
          success: true,
          message: `✨ Áp dụng hiệu ứng ${effectName} trong ${turns} lượt!`,
          applied: true,
          refreshed: false
        };
        
      case "debuff":
        if (!this.debuffs) this.debuffs = [];
        
        // Kiểm tra debuff đã tồn tại
        const existingDebuff = this.debuffs.find(d => d.name === effect.name && d.type === effect.type);
        if (existingDebuff) {
          // Cập nhật thời hạn debuff
          existingDebuff.turnsLeft = Math.max(existingDebuff.turnsLeft, turns);
          return {
            success: true,
            message: `🔄 Hiệu ứng tiêu cực ${effectName} được làm mới!`,
            applied: false,
            refreshed: true
          };
        }
        
        // Thêm debuff mới
        this.debuffs.push({
          name: effect.name,
          type: effect.type,
          value: effect.value,
          turnsLeft: turns,
          isPercent: effect.isPercent || false
        });
        
        return {
          success: true,
          message: `⬇️ Áp dụng hiệu ứng tiêu cực ${effectName} trong ${turns} lượt!`,
          applied: true,
          refreshed: false
        };
        
      case "dot":
        if (!this.dots) this.dots = [];
        
        // Kiểm tra dot đã tồn tại
        const existingDot = this.dots.find(d => d.name === effect.name);
        if (existingDot) {
          // Cập nhật thời hạn dot
          existingDot.turnsLeft = Math.max(existingDot.turnsLeft, turns);
          return {
            success: true,
            message: `🔄 Hiệu ứng sát thương ${effectName} được làm mới!`,
            applied: false,
            refreshed: true
          };
        }
        
        // Thêm dot mới
        this.dots.push({
          name: effect.name,
          damage: effect.damage,
          element: effect.element || "physical",
          turnsLeft: turns
        });
        
        return {
          success: true,
          message: `🔥 Áp dụng hiệu ứng sát thương ${effectName} trong ${turns} lượt!`,
          applied: true,
          refreshed: false
        };
        
      default:
        return {
          success: false,
          message: `❌ Loại hiệu ứng ${effectType} không được hỗ trợ!`,
          applied: false,
          refreshed: false
        };
    }
  }

  /**
   * Lấy tất cả buff hiện tại của quái vật
   * @returns {Array} - Danh sách buff
   */
  getBuffs() {
    return this.buffs || [];
  }

  /**
   * Lấy tất cả debuff hiện tại của quái vật
   * @returns {Array} - Danh sách debuff
   */
  getDebuffs() {
    return this.debuffs || [];
  }

  /**
   * Lấy tất cả hiệu ứng sát thương theo thời gian (DOT) hiện tại của quái vật
   * @returns {Array} - Danh sách DOT
   */
  getDots() {
    return this.dots || [];
  }

  /**
   * Xóa tất cả buff của quái vật
   */
  clearBuffs() {
    this.buffs = [];
  }

  /**
   * Xóa tất cả debuff của quái vật
   */
  clearDebuffs() {
    this.debuffs = [];
  }

  /**
   * Xóa tất cả hiệu ứng sát thương theo thời gian (DOT) của quái vật
   */
  clearDots() {
    this.dots = [];
  }

  /**
   * Phân tích yếu tố mạnh/yếu của quái vật
   * @param {string} element - Yếu tố của đòn tấn công
   * @returns {number} - Hệ số sát thương (1: bình thường, <1: kháng, >1: yếu)
   */
  getElementalFactor(element) {
    if (!element) return 1;
    
    if (this.immunity.includes(element)) {
      return 0; // Miễn nhiễm
    }
    
    if (this.weakness.includes(element)) {
      return 1.5; // Yếu điểm
    }
    
    if (this.resistance.includes(element)) {
      return 0.5; // Kháng
    }
    
    return 1; // Bình thường
  }

  /**
   * Chuyển đổi đối tượng thành JSON để lưu trữ
   * @returns {Object} - Dữ liệu JSON
   */
  toJSON() {
    return {
      id: this.getId(),
      name: this.getName(),
      level: this.level,
      hp: this.hp,
      maxHp: this.maxHp,
      mp: this.mp,
      maxMp: this.maxMp,
      attack: this.attack,
      defense: this.defense,
      speed: this.speed,
      intelligence: this.intelligence,
      isDead: this.isDead,
      statusEffects: this.statusEffects
    };
  }

  /**
   * Tạo một đối tượng quái vật mới
   * @param {Object} monsterData - Dữ liệu quái vật
   * @returns {Monster} - Đối tượng quái vật
   */
  static create(monsterData) {
    return new Monster(monsterData);
  }

  /**
   * Sinh ngẫu nhiên một quái vật dựa trên danh sách cung cấp
   * @param {Array} monsterList - Danh sách quái vật
   * @returns {Monster|null} - Đối tượng quái vật
   */
  static randomMonster(monsterList) {
    if (!monsterList || monsterList.length === 0) {
      return null;
    }
    
    const randomIndex = Math.floor(Math.random() * monsterList.length);
    return new Monster(monsterList[randomIndex]);
  }

  /**
   * Áp dụng phù phép tà đạo cho quái vật, tăng cường sức mạnh và phần thưởng
   * @returns {Monster} - Quái vật đã được cường hóa
   */
  applyDarkEnchantment() {
    if (this.isEnchanted) return this; // Đã được phù phép rồi

    // Đặt trạng thái phù phép
    this.isEnchanted = true;

    // Thay đổi tên để thể hiện trạng thái đặc biệt
    const originalName = this.getName();
    this.setName(`⚡ ${originalName} Phù Phép Tà Đạo`);
    
    // Cập nhật mô tả
    const originalDescription = this.getDescription();
    this.setDescription(`${originalDescription}\n(Một luồng ma lực tà ác đang bảo vệ sinh vật này, làm nó mạnh mẽ và nguy hiểm hơn nhiều)`);

    // Tăng chỉ số (tương tự như transformToBoss từ code cũ)
    this.hp *= 2;
    this.maxHp *= 2;
    this.attack *= 1.5;
    this.defense *= 1.3;
    this.speed *= 1.2;
    this.intelligence *= 1.3;

    // Tăng phần thưởng
    this.expGain *= 2;
    if (this.goldRange) {
      this.goldRange.min = Math.floor(this.goldRange.min * 1.5);
      this.goldRange.max = Math.floor(this.goldRange.max * 1.5);
    }

    // Tăng tỉ lệ rơi đồ có nội tại
    if (this.drops) {
      this.drops = this.drops.map(drop => {
        const enhancedDrop = {...drop};
        enhancedDrop.chance = Math.min(100, (enhancedDrop.chance || 0) * 1.5);
        
        // Tăng tỉ lệ rơi nội tại cho quái phù phép (10%)
        if (enhancedDrop.traits && enhancedDrop.traits.length > 0) {
          enhancedDrop.traitChance = 10;
        }
        
        return enhancedDrop;
      });
    }

    return this;
  }

  /**
   * Tạo ngẫu nhiên quái vật đã được phù phép tà đạo
   * @param {Monster} baseMonster - Quái vật gốc
   * @returns {Monster} - Quái vật đã được tăng cường
   */
  static createEnchantedMonster(baseMonster) {
    const monsterData = baseMonster.toJSON();
    const enchantedMonster = new Monster(monsterData);
    return enchantedMonster.applyDarkEnchantment();
  }
}

export default Monster;