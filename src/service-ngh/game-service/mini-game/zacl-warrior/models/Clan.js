/**
 * Clan.js
 * Module xử lý logic liên quan đến bang hội
 */

import { Entity } from '../core/Entity.js';

export class Clan extends Entity {
  constructor(clanData) {
    super(clanData.id, clanData.name, clanData.description || '');
    this.tag = clanData.tag || '';
    this.leaderId = clanData.leaderId || '';
    this.level = clanData.level || 1;
    this.exp = clanData.exp || 0;
    this.maxMembers = clanData.maxMembers || 20;
    this.members = clanData.members || [];
    this.joinRequests = clanData.joinRequests || [];
    this.announcement = clanData.announcement || '';
    this.createdAt = clanData.createdAt || Date.now();
    this.settings = clanData.settings || {
      joinRequirement: 0, // 0: anyone can request, 1: level requirement
      minLevel: 1,
      autoAccept: false
    };
    this.data = clanData; // Lưu trữ dữ liệu gốc
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
      tag: this.tag,
      leaderId: this.leaderId,
      level: this.level,
      exp: this.exp,
      maxMembers: this.maxMembers,
      members: [...this.members],
      joinRequests: [...this.joinRequests],
      announcement: this.announcement,
      createdAt: this.createdAt,
      settings: { ...this.settings }
    };
  }

  /**
   * Kiểm tra xem bang hội còn chỗ trống không
   * @returns {boolean} - Kết quả kiểm tra
   */
  hasSpace() {
    return this.members.length < this.maxMembers;
  }

  /**
   * Thêm thành viên vào bang hội
   * @param {string} playerId - ID người chơi
   * @param {string} playerName - Tên người chơi
   * @param {string} role - Vai trò trong bang hội
   * @returns {Object} - Kết quả thêm thành viên
   */
  addMember(playerId, playerName, role = 'member') {
    if (!playerId || !playerName) {
      return {
        success: false,
        message: 'Thiếu thông tin người chơi'
      };
    }
    
    // Kiểm tra xem thành viên đã có trong bang hội chưa
    const existingMember = this.members.find(member => member.id === playerId);
    if (existingMember) {
      return {
        success: false,
        message: 'Người chơi đã là thành viên của bang hội'
      };
    }
    
    // Kiểm tra xem bang hội còn chỗ trống không
    if (!this.hasSpace()) {
      return {
        success: false,
        message: 'Bang hội đã đầy'
      };
    }
    
    // Thêm thành viên mới
    this.members.push({
      id: playerId,
      name: playerName,
      role: role,
      joinedAt: Date.now(),
      contribution: 0,
      lastActive: Date.now()
    });
    
    return {
      success: true,
      message: `Đã thêm ${playerName} vào bang hội`
    };
  }

  /**
   * Xóa thành viên khỏi bang hội
   * @param {string} playerId - ID người chơi
   * @returns {Object} - Kết quả xóa thành viên
   */
  removeMember(playerId) {
    if (!playerId) {
      return {
        success: false,
        message: 'Thiếu thông tin người chơi'
      };
    }
    
    // Tìm thành viên trong bang hội
    const memberIndex = this.members.findIndex(member => member.id === playerId);
    if (memberIndex === -1) {
      return {
        success: false,
        message: 'Người chơi không phải là thành viên của bang hội'
      };
    }
    
    // Không thể xóa bang chủ
    if (playerId === this.leaderId) {
      return {
        success: false,
        message: 'Không thể xóa bang chủ khỏi bang hội'
      };
    }
    
    // Lấy tên người chơi
    const memberName = this.members[memberIndex].name;
    
    // Xóa thành viên
    this.members.splice(memberIndex, 1);
    
    return {
      success: true,
      message: `Đã xóa ${memberName} khỏi bang hội`
    };
  }

  /**
   * Thay đổi vai trò của thành viên
   * @param {string} playerId - ID người chơi
   * @param {string} newRole - Vai trò mới
   * @returns {Object} - Kết quả thay đổi vai trò
   */
  changeMemberRole(playerId, newRole) {
    if (!playerId || !newRole) {
      return {
        success: false,
        message: 'Thiếu thông tin cần thiết'
      };
    }
    
    // Kiểm tra vai trò hợp lệ
    const validRoles = ['member', 'officer', 'leader'];
    if (!validRoles.includes(newRole)) {
      return {
        success: false,
        message: 'Vai trò không hợp lệ'
      };
    }
    
    // Tìm thành viên trong bang hội
    const member = this.members.find(m => m.id === playerId);
    if (!member) {
      return {
        success: false,
        message: 'Người chơi không phải là thành viên của bang hội'
      };
    }
    
    // Nếu muốn thay đổi thành bang chủ (leader)
    if (newRole === 'leader') {
      // Tìm bang chủ cũ
      const oldLeaderIndex = this.members.findIndex(m => m.id === this.leaderId);
      
      if (oldLeaderIndex !== -1) {
        // Hạ cấp bang chủ cũ xuống officer
        this.members[oldLeaderIndex].role = 'officer';
      }
      
      // Cập nhật ID bang chủ mới
      this.leaderId = playerId;
    }
    
    // Cập nhật vai trò mới
    member.role = newRole;
    
    return {
      success: true,
      message: `Đã thay đổi vai trò của ${member.name} thành ${newRole}`
    };
  }

  /**
   * Thêm yêu cầu tham gia bang hội
   * @param {string} playerId - ID người chơi
   * @param {string} playerName - Tên người chơi
   * @param {number} playerLevel - Cấp độ người chơi
   * @param {string} message - Lời nhắn
   * @returns {Object} - Kết quả thêm yêu cầu
   */
  addJoinRequest(playerId, playerName, playerLevel, message = '') {
    if (!playerId || !playerName) {
      return {
        success: false,
        message: 'Thiếu thông tin người chơi'
      };
    }
    
    // Kiểm tra xem người chơi đã là thành viên chưa
    if (this.isMember(playerId)) {
      return {
        success: false,
        message: 'Người chơi đã là thành viên của bang hội'
      };
    }
    
    // Kiểm tra xem đã có yêu cầu chưa
    const existingRequest = this.joinRequests.find(req => req.id === playerId);
    if (existingRequest) {
      return {
        success: false,
        message: 'Người chơi đã gửi yêu cầu tham gia'
      };
    }
    
    // Thêm yêu cầu mới
    this.joinRequests.push({
      id: playerId,
      name: playerName,
      level: playerLevel,
      message: message,
      requestedAt: Date.now()
    });
    
    return {
      success: true,
      message: `Đã thêm yêu cầu tham gia từ ${playerName}`
    };
  }

  /**
   * Xóa yêu cầu tham gia bang hội
   * @param {string} playerId - ID người chơi
   * @returns {Object} - Kết quả xóa yêu cầu
   */
  removeJoinRequest(playerId) {
    if (!playerId) {
      return {
        success: false,
        message: 'Thiếu thông tin người chơi'
      };
    }
    
    // Tìm yêu cầu trong danh sách
    const requestIndex = this.joinRequests.findIndex(req => req.id === playerId);
    if (requestIndex === -1) {
      return {
        success: false,
        message: 'Không tìm thấy yêu cầu tham gia'
      };
    }
    
    // Xóa yêu cầu
    this.joinRequests.splice(requestIndex, 1);
    
    return {
      success: true,
      message: 'Đã xóa yêu cầu tham gia'
    };
  }

  /**
   * Kiểm tra xem người chơi có phải là thành viên không
   * @param {string} playerId - ID người chơi
   * @returns {boolean} - Kết quả kiểm tra
   */
  isMember(playerId) {
    return this.members.some(member => member.id === playerId);
  }

  /**
   * Kiểm tra xem người chơi có phải là officer không
   * @param {string} playerId - ID người chơi
   * @returns {boolean} - Kết quả kiểm tra
   */
  isOfficer(playerId) {
    const member = this.members.find(m => m.id === playerId);
    return member && (member.role === 'officer' || member.role === 'leader');
  }

  /**
   * Kiểm tra xem người chơi có phải là leader không
   * @param {string} playerId - ID người chơi
   * @returns {boolean} - Kết quả kiểm tra
   */
  isLeader(playerId) {
    return this.leaderId === playerId;
  }

  /**
   * Lấy thông tin thành viên
   * @param {string} playerId - ID người chơi
   * @returns {Object|null} - Thông tin thành viên hoặc null nếu không tìm thấy
   */
  getMember(playerId) {
    return this.members.find(member => member.id === playerId) || null;
  }

  /**
   * Cập nhật đóng góp của thành viên
   * @param {string} playerId - ID người chơi
   * @param {number} amount - Số lượng đóng góp
   * @returns {Object} - Kết quả cập nhật
   */
  updateContribution(playerId, amount) {
    if (!playerId || isNaN(amount)) {
      return {
        success: false,
        message: 'Thông tin không hợp lệ'
      };
    }
    
    // Tìm thành viên trong bang hội
    const member = this.members.find(m => m.id === playerId);
    if (!member) {
      return {
        success: false,
        message: 'Người chơi không phải là thành viên của bang hội'
      };
    }
    
    // Cập nhật đóng góp
    member.contribution = (member.contribution || 0) + amount;
    member.lastActive = Date.now();
    
    return {
      success: true,
      message: `Đã cập nhật đóng góp của ${member.name} (${member.contribution} điểm)`
    };
  }

  /**
   * Lấy mô tả chi tiết về bang hội
   * @returns {string} - Mô tả chi tiết
   */
  getDetailedDescription() {
    let desc = `🛡️ ${this.getName()} [${this.tag}]\n\n`;
    
    if (this.getDescription()) {
      desc += `${this.getDescription()}\n\n`;
    }
    
    // Thông tin cơ bản
    desc += `Cấp độ: ${this.level}\n`;
    desc += `Kinh nghiệm: ${this.exp} / ${this.level * 1000}\n`;
    desc += `Thành viên: ${this.members.length} / ${this.maxMembers}\n`;
    
    // Thông tin bang chủ
    const leader = this.members.find(m => m.id === this.leaderId);
    if (leader) {
      desc += `Bang chủ: ${leader.name}\n`;
    }
    
    // Số lượng officer
    const officerCount = this.members.filter(m => m.role === 'officer').length;
    desc += `Phó bang: ${officerCount}\n\n`;
    
    // Thời gian thành lập
    const createdDate = new Date(this.createdAt);
    desc += `Thành lập: ${createdDate.toLocaleDateString()}\n\n`;
    
    // Thông báo
    if (this.announcement) {
      desc += `📢 THÔNG BÁO:\n${this.announcement}\n\n`;
    }
    
    // Danh sách thành viên
    desc += `👥 THÀNH VIÊN:\n`;
    
    // Top 3 thành viên theo đóng góp
    const topMembers = [...this.members]
      .sort((a, b) => (b.contribution || 0) - (a.contribution || 0))
      .slice(0, 3);
    
    // Bang chủ
    if (leader) {
      desc += `👑 ${leader.name} (Cấp ${leader.level || '?'}) - Bang chủ\n`;
    }
    
    // Phó bang
    const officers = this.members.filter(m => m.role === 'officer');
    if (officers.length > 0) {
      for (const officer of officers) {
        desc += `⭐ ${officer.name} (Cấp ${officer.level || '?'}) - Phó bang\n`;
      }
    }
    
    // Top đóng góp (không bao gồm bang chủ và phó bang đã liệt kê)
    for (const member of topMembers) {
      if (member.role !== 'leader' && member.role !== 'officer') {
        desc += `📊 ${member.name} (Đóng góp: ${member.contribution || 0})\n`;
      }
    }
    
    return desc;
  }
}

export default Clan; 