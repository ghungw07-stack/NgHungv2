/**
 * Item.js
 * Module xử lý logic liên quan đến vật phẩm
 */

import { Entity } from '../core/Entity.js';
import { getHiddenTraitName } from '../utils/GameUtils.js';
import Player from './Player.js';

export class Item extends Entity {
  constructor(itemData) {
    super(itemData.id, itemData.name, itemData.description || '');
    this.type = itemData.type || 'misc';
    this.price = itemData.price || { buy: 0, sell: 0 };
    this.rarity = itemData.rarity || 'common';
    this.icon = itemData.icon || '';
    this.effects = itemData.effects || null;
    this.stats = itemData.stats || {};
    this.requirements = itemData.requirements || null;
    this.stackable = itemData.stackable !== undefined ? itemData.stackable : true;
    this.maxStack = itemData.maxStack || 99;
    this.usable = itemData.usable || false;
    this.tradable = itemData.tradable !== undefined ? itemData.tradable : true;
    this.data = itemData;
    this.hiddenTrait = itemData.hiddenTrait || null;
    this.subType = itemData.subType || null;
    this.tier = itemData.tier || null;
    this.elementBoost = itemData.elementBoost || null;
    this.comboBoost = itemData.comboBoost || null;
    this.isLocked = itemData.isLocked || false;
    this.isQuestItem = itemData.isQuestItem || false;
  }

  /**
   * Chuyển đổi đối tượng thành dạng JSON để lưu trữ
   * @returns {Object} - Dữ liệu JSON
   */
  toJSON() {
    return {
      id: this.getId(),
      name: this.getName(),
      description: this.getDescription(),
      type: this.type,
      price: this.price,
      rarity: this.rarity,
      icon: this.icon,
      effect: this.effects,
      stats: this.stats,
      requirements: this.requirements,
      stackable: this.stackable,
      maxStack: this.maxStack,
      usable: this.usable,
      tradable: this.tradable,
      hiddenTrait: this.hiddenTrait,
      subType: this.subType,
      tier: this.tier,
      elementBoost: this.elementBoost,
      comboBoost: this.comboBoost,
      isLocked: this.isLocked,
      isQuestItem: this.isQuestItem
    };
  }

  /**
   * Tạo một item mới
   * @param {Object} itemData - Dữ liệu item
   * @returns {Item} - Đối tượng item mới
   */
  static create(itemData) {
    return new Item(itemData);
  }

  /**
   * Kiểm tra xem người chơi có thể sử dụng vật phẩm không
   * @param {Player} player - Đối tượng người chơi
   * @returns {boolean} - Kết quả kiểm tra
   */
  canUse(player) {
    if (!this.usable) return false;

    // Kiểm tra điều kiện sử dụng
    if (this.requirements) {
      // Kiểm tra level
      if (this.requirements.level && player.stat.level < this.requirements.level) {
        return false;
      }

      // Kiểm tra các chỉ số khác
      if (this.requirements.stats) {
        const playerStats = player.getBaseStats();
        for (const [stat, value] of Object.entries(this.requirements.stats)) {
          if (playerStats[stat] < value) {
            return false;
          }
        }
      }
    }

    return true;
  }

  /**
   * Kiểm tra xem người chơi có thể trang bị vật phẩm không
   * @param {Player} player - Đối tượng người chơi
   * @returns {boolean} - Kết quả kiểm tra
   */
  canEquip(player) {
    if (!['weapon', 'armor', 'helmet', 'shield', 'boots', 'cape'].includes(this.type)) {
      return false;
    }

    // Kiểm tra điều kiện trang bị
    if (this.requirements) {
      // Kiểm tra level
      if (this.requirements.level && player.stat.level < this.requirements.level) {
        return false;
      }

      // Kiểm tra các chỉ số khác
      if (this.requirements.stats) {
        const playerStats = player.getBaseStats();
        for (const [stat, value] of Object.entries(this.requirements.stats)) {
          if (playerStats[stat] < value) {
            return false;
          }
        }
      }
    }

    return true;
  }

  /**
   * Tạo mô tả chi tiết về vật phẩm
   * @returns {string} - Mô tả chi tiết
   */
  getDetailedDescription() {
    const rarityEmoji = {
      common: '⚪',
      uncommon: '🟢',
      rare: '🔵',
      epic: '🟣',
      legendary: '🟠',
      mythic: '🔴',
      artifact: '🟡'
    }[this.rarity] || '⚪';

    let desc = `${rarityEmoji} ${this.getName()} (${this.getRarityName()})\n\n`;
    
    if (this.getDescription()) {
      desc += `${this.getDescription()}\n\n`;
    }
    
    // Loại vật phẩm
    desc += `Loại: ${this.getTypeName()}`;
    
    // Hiển thị phụ loại nếu có
    if (this.subType) {
      desc += ` (${this.getSubTypeName()})`;
    }
    
    // Hiển thị cấp độ trang bị nếu có
    if (this.tier) {
      desc += `\nCấp độ: ${this.tier}`;
    }
    
    desc += '\n';
    
    // Thông số
    if (Object.keys(this.stats).length > 0) {
      desc += `\nThông số:\n`;
      for (const [stat, value] of Object.entries(this.stats)) {
        desc += `- ${this.getStatName(stat)}: ${value > 0 ? '+' : ''}${value}\n`;
      }
    }
    
    // Hiển thị tăng cường phép thuật nếu có
    if (this.elementBoost) {
      desc += "\n🔮 Tăng sức mạnh phép thuật:\n";
      const elementNames = {
        fire: "🔥 Hỏa",
        ice: "❄️ Băng",
        lightning: "⚡ Lôi",
        earth: "🌑 Thổ",
        water: "💧 Thủy",
        wind: "💨 Phong",
        light: "✨ Quang",
        dark: "🌑 Ám",
        all: "🌈 Tất cả"
      };
      
      for (const [element, value] of Object.entries(this.elementBoost)) {
        if (value && elementNames[element]) {
          desc += `- ${elementNames[element]}: +${value}\n`;
        }
      }
    }
    
    // Hiển thị tăng cường combo nếu có
    if (this.comboBoost) {
      desc += `\n👊 Tăng sức mạnh combo: +${this.comboBoost}\n`;
    }
    
    // Hiển thị nội tại ẩn nếu có
    if (this.hiddenTrait) {
      desc += `\n✨ Nội tại: ${getHiddenTraitName(this.hiddenTrait)}\n`;
    }
    
    // Hiệu ứng
    if (this.effects) {
      desc += `\nHiệu ứng:\n`;
      for (const [effectType, value] of Object.entries(this.effects)) {
        desc += `- ${this.getEffectName(effectType)}: ${value}\n`;
      }
    }
    
    // Yêu cầu
    if (this.requirements) {
      desc += `\nYêu cầu:\n`;
      if (this.requirements.level) {
        desc += `- Cấp độ: ${this.requirements.level}\n`;
      }
      if (this.requirements.stats) {
        for (const [stat, value] of Object.entries(this.requirements.stats)) {
          desc += `- ${this.getStatName(stat)}: ${value}\n`;
        }
      }
      if (this.requirements.class && Array.isArray(this.requirements.class)) {
        const classNames = {
          warrior: "Chiến Binh",
          mage: "Pháp Sư",
          healer: "Thuật Sĩ",
          monk: "Võ Sư",
          fighter: "Đấu Sĩ"
        };
        
        const classes = this.requirements.class.map(c => classNames[c] || c).join(", ");
        desc += `- Lớp nhân vật: ${classes}\n`;
      }
    }
    
    // Giá cả
    desc += `\nGiá mua: ${this.price.buy} vàng`;
    desc += `\nGiá bán: ${this.price.sell} vàng`;
    
    // Các thuộc tính khác
    const properties = [];
    if (this.stackable) properties.push('Có thể xếp chồng');
    if (this.isLocked) properties.push('Đã khóa');
    if (this.isQuestItem) properties.push('Vật phẩm nhiệm vụ');
    
    if (properties.length > 0) {
      desc += `\n\nThuộc tính: ${properties.join(', ')}`;
    }
    
    return desc;
  }

  /**
   * Lấy tên hiển thị của loại vật phẩm
   * @returns {string} - Tên loại vật phẩm
   */
  getTypeName() {
    const typeNames = {
      weapon: 'Vũ khí',
      armor: 'Áo giáp',
      helmet: 'Mũ',
      shield: 'Khiên',
      boots: 'Giày',
      cape: 'Áo choàng',
      potion: 'Thuốc',
      scroll: 'Cuộn giấy',
      material: 'Nguyên liệu',
      quest: 'Vật phẩm nhiệm vụ',
      misc: 'Khác'
    };
    
    return typeNames[this.type] || this.type;
  }

  /**
   * Lấy tên hiển thị của độ hiếm
   * @returns {string} - Tên độ hiếm
   */
  getRarityName() {
    const rarityNames = {
      common: 'Thường',
      uncommon: 'Tốt',
      rare: 'Hiếm',
      epic: 'Sử thi',
      legendary: 'Huyền thoại',
      mythic: 'Thần thoại',
      artifact: 'Cổ vật'
    };
    
    return rarityNames[this.rarity] || this.rarity;
  }

  /**
   * Lấy tên hiển thị của chỉ số
   * @param {string} stat - Mã chỉ số
   * @returns {string} - Tên chỉ số
   */
  getStatName(stat) {
    const statNames = {
      attack: 'Tấn công',
      intelligence: 'Thông minh',
      defense: 'Phòng thủ',
      speed: 'Tốc độ',
      vitality: 'Sinh lực',
      critRate: 'Tỉ lệ chí mạng',
      critDmg: 'Sát thương chí mạng',
      dodge: 'Né tránh',
      accuracy: 'Chính xác',
      hp: 'HP tối đa',
      mp: 'MP tối đa'
    };
    
    return statNames[stat] || stat;
  }

  /**
   * Lấy tên hiển thị của hiệu ứng
   * @param {string} effect - Mã hiệu ứng
   * @returns {string} - Tên hiệu ứng
   */
  getEffectName(effect) {
    const effectNames = {
      hp: 'Hồi phục HP',
      mp: 'Hồi phục MP',
      exp: 'Kinh nghiệm',
      poison: 'Độc',
      burn: 'Bỏng',
      freeze: 'Đóng băng',
      stun: 'Choáng',
      speed: 'Tăng tốc',
      attack: 'Tăng tấn công',
      defense: 'Tăng phòng thủ',
      teleport: 'Dịch chuyển'
    };
    
    return effectNames[effect] || effect;
  }

  /**
   * Lấy tên phụ loại của vật phẩm
   * @returns {string} - Tên phụ loại
   */
  getSubTypeName() {
    const subTypes = {
      sword: "Kiếm",
      axe: "Rìu",
      hammer: "Búa",
      staff: "Trượng phép",
      wand: "Đũa phép",
      gloves: "Găng tay võ thuật",
      mage_robe: "Áo choàng pháp sư",
      monk_robe: "Áo choàng võ sư"
    };
    
    return subTypes[this.subType] || this.subType;
  }
} 