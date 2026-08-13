/**
 * WorldBoss.js
 * Module xử lý logic liên quan đến World Boss
 */

import { Entity } from '../core/Entity.js';
import { getGameDataInstance } from '../core/GameData.js';
import { getMonsterServiceInstance } from '../services/MonsterService.js';

export class WorldBoss extends Entity {
  constructor(bossData) {
    super(bossData.id, bossData.name, bossData.description || '');
    
    this.monsterId = bossData.monsterId || '';
    this.level = bossData.level || 100;
    this.maxHp = bossData.maxHp || 1000000;
    this.currentHp = bossData.currentHp || this.maxHp;
    this.attack = bossData.attack || 5000;
    this.defense = bossData.defense || 3000;
    this.speed = bossData.speed || 200;
    this.critRate = bossData.critRate || 0.1;
    this.critDmg = bossData.critDmg || 1.5;
    this.element = bossData.element || 'neutral';
    this.skills = bossData.skills || [];
    
    this.spawnTime = bossData.spawnTime || Date.now();
    this.endTime = bossData.endTime || 0;
    this.duration = bossData.duration || 24 * 60 * 60 * 1000; // 24 giờ mặc định
    this.status = bossData.status || 'active'; // active, defeated, expired
    this.location = bossData.location || '';
    
    this.participants = bossData.participants || {};
    this.rewards = bossData.rewards || {
      exp: 100000,
      gold: 1000000,
      items: []
    };
    
    // Thêm các thông báo khi boss giảm máu xuống mức nhất định
    this.announcements = bossData.announcements || {
      '75': false,
      '50': false,
      '25': false,
      '10': false
    };
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
      monsterId: this.monsterId,
      level: this.level,
      maxHp: this.maxHp,
      currentHp: this.currentHp,
      attack: this.attack,
      defense: this.defense,
      speed: this.speed,
      critRate: this.critRate,
      critDmg: this.critDmg,
      element: this.element,
      skills: [...this.skills],
      
      spawnTime: this.spawnTime,
      endTime: this.endTime,
      duration: this.duration,
      status: this.status,
      location: this.location,
      
      participants: { ...this.participants },
      rewards: { ...this.rewards },
      announcements: { ...this.announcements }
    };
  }

  /**
   * Tấn công boss thế giới
   * @param {string} playerId - ID người chơi
   * @param {string} playerName - Tên người chơi
   * @param {number} damage - Sát thương
   * @returns {Object} - Kết quả tấn công
   */
  attackBoss(playerId, playerName, damage) {
    if (!playerId || !playerName) {
      return {
        success: false,
        message: 'Thiếu thông tin người chơi'
      };
    }
    
    if (this.status !== 'active') {
      return {
        success: false,
        message: `Boss đang ở trạng thái ${this.getStatusName()}, không thể tấn công`
      };
    }
    
    if (this.isExpired()) {
      this.status = 'expired';
      this.endTime = this.spawnTime + this.duration;
      return {
        success: false,
        message: 'Boss đã hết thời gian tồn tại'
      };
    }

    // Kiểm tra giá trị damage hợp lệ
    if (isNaN(damage) || damage <= 0) {
      return {
        success: false,
        message: 'Giá trị sát thương không hợp lệ'
      };
    }
    
    // Kiểm tra xem người chơi đã tham gia chưa
    if (!this.participants[playerId]) {
      this.participants[playerId] = {
        id: playerId,
        name: playerName,
        damage: 0,
        lastAttack: Date.now(),
        rewards: null,
        claimed: false
      };
    }
    
    // Lưu thông tin sát thương
    const oldHp = this.currentHp;
    this.participants[playerId].damage += damage;
    this.participants[playerId].lastAttack = Date.now();
    
    // Trừ máu boss
    this.currentHp = Math.max(0, this.currentHp - damage);
    
    // Kiểm tra xem có thông báo đặc biệt khi boss giảm máu xuống mức nhất định không
    const announcements = this.checkAnnouncementThresholds(oldHp);
    
    // Kiểm tra xem boss đã bị đánh bại chưa
    if (this.currentHp <= 0) {
      this.status = 'defeated';
      this.endTime = Date.now();
      
      return {
        success: true,
        message: `Bạn gây ra ${Math.floor(damage)} sát thương!\nBoss đã bị đánh bại!\nSử dụng lệnh nhận thưởng để nhận phần thưởng.`,
        defeated: true,
        announcements: announcements
      };
    }
    
    // Tính phần trăm máu còn lại
    const hpPercent = Math.floor((this.currentHp / this.maxHp) * 100);
    
    return {
      success: true,
      message: `Bạn gây ra ${Math.floor(damage)} sát thương!\nHP Boss: ${this.currentHp}/${this.maxHp} (${hpPercent}%)\nTổng sát thương của bạn: ${this.participants[playerId].damage}`,
      hpPercent: hpPercent,
      announcements: announcements
    };
  }

  /**
   * Kiểm tra và trả về các thông báo khi boss giảm máu xuống mức nhất định
   * @param {number} oldHp - Máu cũ của boss
   * @returns {Array} - Danh sách thông báo
   */
  checkAnnouncementThresholds(oldHp) {
    const announcements = [];
    const thresholds = Object.keys(this.announcements).map(Number).sort((a, b) => b - a); // Sắp xếp giảm dần
    
    for (const threshold of thresholds) {
      const thresholdHp = (threshold / 100) * this.maxHp;
      // Nếu máu giảm xuống dưới ngưỡng và chưa thông báo
      if (this.currentHp <= thresholdHp && oldHp > thresholdHp && !this.announcements[threshold]) {
        this.announcements[threshold] = true;
        announcements.push({
          threshold: threshold,
          message: `⚠️ Boss còn ${threshold}% máu!`
        });
      }
    }
    
    return announcements;
  }

  /**
   * Kiểm tra xem boss đã hết hạn chưa
   * @returns {boolean} - Kết quả kiểm tra
   */
  isExpired() {
    return Date.now() > (this.spawnTime + this.duration);
  }

  /**
   * Lấy danh sách người tham gia hàng đầu
   * @param {number} limit - Số lượng tối đa
   * @returns {Array} - Danh sách người tham gia
   */
  getTopParticipants(limit = 5) {
    return Object.values(this.participants)
      .sort((a, b) => b.damage - a.damage)
      .slice(0, limit);
  }

  /**
   * Tính toán phần thưởng cho người chơi
   * @param {string} playerId - ID người chơi
   * @returns {Object} - Phần thưởng
   */
  calculateRewardForPlayer(playerId) {
    if (!this.participants[playerId]) {
      return {
        exp: 0,
        gold: 0,
        items: []
      };
    }
    
    const participant = this.participants[playerId];
    
    // Nếu đã tính toán phần thưởng rồi, trả về kết quả đã tính
    if (participant.rewards) {
      return participant.rewards;
    }
    
    // Tính tổng sát thương của tất cả người chơi
    const totalDamage = Object.values(this.participants).reduce(
      (sum, p) => sum + p.damage, 0
    );
    
    // Tính phần trăm đóng góp của người chơi
    const contributionPercent = totalDamage > 0 ? participant.damage / totalDamage : 0;
    
    // Tính phần thưởng exp và gold
    const baseExp = this.rewards.exp || 100000;
    const baseGold = this.rewards.gold || 1000000;
    
    let expReward = Math.floor(baseExp * contributionPercent);
    let goldReward = Math.floor(baseGold * contributionPercent);
    
    // Thưởng thêm cho top người chơi
    const topParticipants = this.getTopParticipants();
    const topRank = topParticipants.findIndex(p => p.id === playerId);
    
    if (topRank !== -1) {
      const rankBonus = [0.3, 0.2, 0.15, 0.1, 0.05]; // Thưởng thêm cho top 1-5
      expReward += Math.floor(baseExp * rankBonus[topRank]);
      goldReward += Math.floor(baseGold * rankBonus[topRank]);
    }
    
    // Tính các vật phẩm nhận được
    const items = [];
    
    if (this.rewards.items && this.rewards.items.length > 0) {
      for (const itemDrop of this.rewards.items) {
        const dropChance = itemDrop.chance || 0.1;
        const adjustedChance = dropChance * contributionPercent * 3; // Điều chỉnh tỷ lệ rơi theo đóng góp
        
        // Kiểm tra xem có nhận được vật phẩm không
        if (Math.random() < adjustedChance) {
          const quantity = itemDrop.quantityRange 
            ? Math.floor(Math.random() * (itemDrop.quantityRange[1] - itemDrop.quantityRange[0] + 1)) + itemDrop.quantityRange[0]
            : 1;
          
          items.push({
            id: itemDrop.id,
            quantity: quantity
          });
        }
      }
    }
    
    // Lưu lại phần thưởng để tránh tính toán lại
    participant.rewards = {
      exp: expReward,
      gold: goldReward,
      items: items
    };
    
    return participant.rewards;
  }

  /**
   * Lấy mô tả chi tiết về boss
   * @returns {string} - Mô tả chi tiết
   */
  getDetailedDescription() {
    let desc = `🐉 ${this.getName()}\n\n`;
    
    if (this.getDescription()) {
      desc += `${this.getDescription()}\n\n`;
    }
    
    // Thông tin cơ bản
    desc += `Cấp độ: ${this.level}\n`;
    desc += `Trạng thái: ${this.getStatusName()}\n`;
    
    // Thông tin chỉ số
    desc += `\n📊 CHỈ SỐ:\n`;
    desc += `HP: ${this.currentHp}/${this.maxHp}\n`;
    desc += `Tấn công: ${this.attack}\n`;
    desc += `Phòng thủ: ${this.defense}\n`;
    desc += `Tốc độ: ${this.speed}\n`;
    desc += `Tỷ lệ chí mạng: ${Math.floor(this.critRate * 100)}%\n`;
    desc += `Sát thương chí mạng: ${Math.floor(this.critDmg * 100)}%\n`;
    
    // Kỹ năng
    if (this.skills.length > 0) {
      desc += `\n⚔️ KỸ NĂNG:\n`;
      this.skills.forEach(skill => {
        desc += `- ${skill}\n`;
      });
    }
    
    // Thông tin thời gian
    desc += `\n⏰ THỜI GIAN:\n`;
    
    const spawnDate = new Date(this.spawnTime);
    desc += `Xuất hiện: ${spawnDate.toLocaleString('vi-VN')}\n`;
    
    if (this.status === 'active') {
      const expiryTime = this.spawnTime + this.duration;
      const timeLeft = expiryTime - Date.now();
      
      if (timeLeft > 0) {
        const hoursLeft = Math.floor(timeLeft / (60 * 60 * 1000));
        const minutesLeft = Math.floor((timeLeft % (60 * 60 * 1000)) / (60 * 1000));
        desc += `Thời gian còn lại: ${hoursLeft} giờ ${minutesLeft} phút\n`;
      } else {
        desc += `Đã hết hạn\n`;
      }
    } else if (this.endTime > 0) {
      const endDate = new Date(this.endTime);
      desc += `Kết thúc: ${endDate.toLocaleString('vi-VN')}\n`;
      
      const duration = this.endTime - this.spawnTime;
      const hours = Math.floor(duration / (60 * 60 * 1000));
      const minutes = Math.floor((duration % (60 * 60 * 1000)) / (60 * 1000));
      desc += `Tồn tại: ${hours} giờ ${minutes} phút\n`;
    }
    
    // Người tham gia
    const participants = Object.values(this.participants);
    
    if (participants.length > 0) {
      desc += `\n👥 NGƯỜI THAM GIA: ${participants.length}\n`;
      
      // Top người chơi theo sát thương
      const topDamage = this.getTopParticipants();
      desc += `\n⚔️ TOP SÁT THƯƠNG:\n`;
      
      topDamage.forEach((p, index) => {
        desc += `${index + 1}. ${p.name}: ${p.damage} sát thương\n`;
      });
    }
    
    return desc;
  }

  /**
   * Lấy tên hiển thị của trạng thái
   * @returns {string} - Tên trạng thái
   */
  getStatusName() {
    const statusNames = {
      'active': 'Đang hoạt động',
      'defeated': 'Đã bị đánh bại',
      'expired': 'Đã hết hạn'
    };
    
    return statusNames[this.status] || this.status;
  }
}

export default WorldBoss; 