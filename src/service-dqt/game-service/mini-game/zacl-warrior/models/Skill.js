/**
 * Skill.js
 * Module xử lý logic liên quan đến kỹ năng
 */

import { Entity } from '../core/Entity.js';
import Player from './Player.js';

export class Skill extends Entity {
  constructor(skillData) {
    super(skillData.id, skillData.name, skillData.description || '');
    this.type = skillData.type || 'active'; // active, passive
    this.element = skillData.element || 'physical'; // physical, fire, water, etc.
    this.target = skillData.target || 'single'; // single, aoe, self
    this.level = skillData.level || 1;
    this.maxLevel = skillData.maxLevel || 10;
    this.cooldownTurns = skillData.cooldownTurns || 0;
    this.remainingCooldown = 0; // Số lượt còn lại trước khi có thể sử dụng lại
    this.mpCost = skillData.mpCost || 0;
    this.damage = skillData.damage || {
      base: 0,
      scaling: {
        attack: 0,
        intelligence: 0
      }
    };
    this.effects = skillData.effects || [];
    this.requirements = skillData.requirements || {
      level: 1,
      stats: {}
    };
    this.data = skillData; // Lưu trữ dữ liệu gốc
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
      element: this.element,
      target: this.target,
      level: this.level,
      maxLevel: this.maxLevel,
      cooldownTurns: this.cooldownTurns,
      remainingCooldown: this.remainingCooldown,
      mpCost: this.mpCost,
      damage: this.damage,
      effects: this.effects,
      requirements: this.requirements
    };
  }

  /**
   * Tạo một kỹ năng mới
   * @param {Object} skillData - Dữ liệu kỹ năng
   * @returns {Skill} - Đối tượng kỹ năng mới
   */
  static create(skillData) {
    return new Skill(skillData);
  }

  /**
   * Nâng cấp kỹ năng
   * @returns {boolean} - Kết quả nâng cấp
   */
  upgrade() {
    if (this.level >= this.maxLevel) return false;
    
    this.level++;
    
    // Tăng chỉ số theo cấp độ
    this.damage.base *= 1.2;
    this.damage.scaling.attack *= 1.1;
    this.damage.scaling.intelligence *= 1.1;
    
    return true;
  }

  /**
   * Kiểm tra xem kỹ năng có thể nâng cấp không
   * @returns {boolean} - Kết quả kiểm tra
   */
  canUpgrade() {
    return this.level < this.maxLevel;
  }

  /**
   * Kiểm tra xem người chơi có đủ điều kiện sử dụng kỹ năng không
   * @param {Player} player - Đối tượng người chơi
   * @returns {boolean} - Kết quả kiểm tra
   */
  canPlayerUse(player) {
    // Kiểm tra cấp độ
    if (player.level < this.requirements.level) return false;
    
    // Kiểm tra chỉ số
    for (const [stat, value] of Object.entries(this.requirements.stats)) {
      if (player.stats[stat] < value) return false;
    }
    
    // Kiểm tra MP
    if (player.stats.mp.current < this.mpCost) return false;
    
    return true;
  }

  /**
   * Tính toán sát thương của kỹ năng
   * @param {Object} caster - Người sử dụng kỹ năng
   * @returns {number} - Sát thương gây ra
   */
  calculateDamage(caster) {
    let damage = this.damage.base;
    
    // Tính toán sát thương theo chỉ số
    damage += caster.stats.attack * this.damage.scaling.attack;
    damage += caster.stats.intelligence * this.damage.scaling.intelligence;
    
    // Tăng sát thương theo cấp độ kỹ năng
    damage *= (1 + (this.level - 1) * 0.1);
    
    return Math.floor(damage);
  }

  /**
   * Lấy thông tin hiệu ứng của kỹ năng
   * @returns {Array} - Danh sách hiệu ứng
   */
  getEffects() {
    return [...this.effects];
  }

  /**
   * Lấy yêu cầu sử dụng kỹ năng
   * @returns {Object} - Thông tin yêu cầu
   */
  getRequirements() {
    return { ...this.requirements };
  }

  /**
   * Lấy chi phí sử dụng kỹ năng
   * @returns {Object} - Thông tin chi phí
   */
  getCost() {
    return {
      mp: this.mpCost,
      cooldownTurns: this.cooldownTurns
    };
  }
  
  /**
   * Đặt kỹ năng vào trạng thái hồi chiêu
   */
  startCooldown() {
    this.remainingCooldown = this.cooldownTurns;
  }
  
  /**
   * Giảm số lượt hồi chiêu khi kết thúc lượt
   * @returns {boolean} - true nếu kỹ năng đã hết hồi chiêu
   */
  reduceCooldown() {
    if (this.remainingCooldown > 0) {
      this.remainingCooldown--;
      return this.remainingCooldown === 0;
    }
    return true;
  }
  
  /**
   * Kiểm tra xem kỹ năng có thể sử dụng hay không
   * @returns {boolean} - Kết quả kiểm tra
   */
  isReady() {
    return this.remainingCooldown === 0;
  }

  /**
   * Lấy thông tin sát thương của kỹ năng
   * @returns {Object} - Thông tin sát thương
   */
  getDamageInfo() {
    return { ...this.damage };
  }

  /**
   * Kiểm tra xem kỹ năng có phải là kỹ năng chủ động không
   * @returns {boolean} - Kết quả kiểm tra
   */
  isActive() {
    return this.type === 'active';
  }

  /**
   * Kiểm tra xem kỹ năng có phải là kỹ năng bị động không
   * @returns {boolean} - Kết quả kiểm tra
   */
  isPassive() {
    return this.type === 'passive';
  }

  /**
   * Kiểm tra xem kỹ năng có phải là kỹ năng đơn mục tiêu không
   * @returns {boolean} - Kết quả kiểm tra
   */
  isSingleTarget() {
    return this.target === 'single';
  }

  /**
   * Kiểm tra xem kỹ năng có phải là kỹ năng diện rộng không
   * @returns {boolean} - Kết quả kiểm tra
   */
  isAoe() {
    return this.target === 'aoe';
  }

  /**
   * Kiểm tra xem kỹ năng có phải là kỹ năng tự buff không
   * @returns {boolean} - Kết quả kiểm tra
   */
  isSelfBuff() {
    return this.target === 'self';
  }
} 