/**
 * ClanService.js
 * Service xử lý các thao tác liên quan đến bang hội
 */

import { getGameDataInstance } from '../core/GameData.js';
import { getGameManagerInstance } from '../core/GameManager.js';
import { Clan } from '../models/Clan.js';
import Player from '../models/Player.js';
import { getServiceRegistry } from './ServiceRegistry.js';

export class ClanService {
  constructor() {
    /** @type {import('../core/GameData.js').GameData} */
    this.gameData = getGameDataInstance();
    
    /** @type {import('../core/GameManager.js').GameManager} */
    this.gameManager = getGameManagerInstance();
    
    // Lấy registry để truy cập các service khi cần
    this._registry = getServiceRegistry();
    
    this.clans = [];
    this.clansById = new Map();
    this.clansByTag = new Map();
    this.playerClans = new Map(); // Map playerId -> clanId
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
   * Tải dữ liệu bang hội từ bộ nhớ
   */
  async loadClans() {
    const clansData = await this.gameManager.getClansData();
    
    if (clansData && clansData.clans) {
      this.clans = clansData.clans.map(clanData => new Clan(clanData));
      
      // Tạo map lưu trữ clan theo ID để tìm kiếm nhanh
      this.clansById.clear();
      for (const clan of this.clans) {
        this.clansById.set(clan.getId(), clan);
      }
      
      // Tạo map lưu trữ bang hội theo tag
      this.clansByTag.clear();
      for (const clan of this.clans) {
        if (clan.tag) {
          this.clansByTag.set(clan.tag.toLowerCase(), clan);
        }
      }
      
      // Tạo map lưu trữ bang hội theo người chơi
      this.playerClans.clear();
      for (const clan of this.clans) {
        for (const member of clan.members) {
          this.playerClans.set(member.id, clan.getId());
        }
      }
    }
    
    return this.clans;
  }

  /**
   * Tìm bang hội theo ID
   * @param {string} id - ID của bang hội
   * @returns {Clan|null} - Đối tượng bang hội hoặc null nếu không tìm thấy
   */
  async getClanById(id) {
    if (!id) return null;
    
    if (this.clansById.size === 0) {
      await this.loadClans();
    }
    
    return this.clansById.get(id) || null;
  }

  /**
   * Tìm bang hội theo tên
   * @param {string} name - Tên bang hội (tìm kiếm không phân biệt hoa thường)
   * @returns {Clan|null} - Đối tượng bang hội hoặc null nếu không tìm thấy
   */
  async getClanByName(name) {
    if (!name) return null;
    
    if (this.clans.length === 0) {
      await this.loadClans();
    }
    
    const lowerName = name.toLowerCase();
    return this.clans.find(clan => clan.getName().toLowerCase() === lowerName) || null;
  }
  
  /**
   * Tìm bang hội theo tag
   * @param {string} tag - Tag của bang hội
   * @returns {Clan|null} - Đối tượng bang hội hoặc null nếu không tìm thấy
   */
  async getClanByTag(tag) {
    if (!tag) return null;
    
    if (this.clansByTag.size === 0) {
      await this.loadClans();
    }
    
    return this.clansByTag.get(tag.toLowerCase()) || null;
  }
  
  /**
   * Tìm bang hội của người chơi
   * @param {string} playerId - ID người chơi
   * @returns {Clan|null} - Đối tượng bang hội hoặc null nếu không tìm thấy
   */
  async getPlayerClan(playerId) {
    if (!playerId) return null;
    
    if (this.playerClans.size === 0) {
      await this.loadClans();
    }
    
    const clanId = this.playerClans.get(playerId);
    return clanId ? this.getClanById(clanId) : null;
  }

  /**
   * Lấy danh sách tất cả bang hội
   * @returns {Array<Clan>} - Danh sách bang hội
   */
  async getAllClans() {
    if (this.clans.length === 0) {
      await this.loadClans();
    }
    
    return [...this.clans];
  }

  /**
   * Tạo bang hội mới
   * @param {Player} player - Đối tượng người chơi tạo bang
   * @param {string} name - Tên bang hội
   * @param {string} description - Mô tả bang hội
   * @returns {Promise<Object>} - Kết quả tạo bang hội
   */
  async createClan(player, name, description = '') {
    // Kiểm tra điều kiện tạo bang
    if (player.stat.level < 10) {
      return {
        success: false,
        message: "❌ Bạn cần đạt cấp độ 10 để tạo bang hội!"
      };
    }

    if (player.money.gold < 10000) {
      return {
        success: false,
        message: "❌ Bạn cần có 10,000 vàng để tạo bang hội!"
      };
    }

    // Kiểm tra tên bang
    const existingClan = await this.getClanByName(name);
    if (existingClan) {
      return {
        success: false,
        message: "❌ Tên bang hội đã tồn tại!"
      };
    }

    // Tạo bang hội mới
    const clan = new Clan({
      id: `clan_${Date.now()}`,
      name,
      description,
      leader: playerId,
      members: [playerId],
      createdAt: Date.now(),
      level: 1,
      exp: 0,
      money: 0,
      storage: []
    });

    // Lưu bang hội
    const clansData = await this.gameManager.getClansData();
    clansData.clans.push(clan.toJSON());
    this.gameManager.markClansDataChanged();

    // Trừ tiền người chơi
    player.money.gold -= 10000;
    this.gameData.markPlayerDataChanged();

    // Cập nhật danh sách bang hội trong bộ nhớ
    await this.loadClans();

    return {
      success: true,
      message: `✅ Đã tạo bang hội "${name}" thành công!`
    };
  }

  /**
   * Giải tán bang hội
   * @param {string} playerId - ID người chơi giải tán bang
   * @param {string} clanId - ID bang hội
   * @returns {Promise<Object>} - Kết quả giải tán bang hội
   */
  async disbandClan(playerId, clanId) {
    const clan = await this.getClanById(clanId);
    if (!clan) {
      return {
        success: false,
        message: "❌ Không tìm thấy bang hội!"
      };
    }

    if (clan.leader !== playerId) {
      return {
        success: false,
        message: "❌ Chỉ bang chủ mới có thể giải tán bang hội!"
      };
    }

    // Xóa bang hội
    const clansData = await this.gameManager.getClansData();
    const index = clansData.clans.findIndex(c => c.id === clanId);
    if (index >= 0) {
      clansData.clans.splice(index, 1);
      this.gameManager.markClansDataChanged();

      // Cập nhật danh sách bang hội trong bộ nhớ
      await this.loadClans();

      return {
        success: true,
        message: `✅ Đã giải tán bang hội "${clan.getName()}"!`
      };
    }

    return {
      success: false,
      message: "❌ Không thể giải tán bang hội!"
    };
  }

  /**
   * Xử lý lệnh bang hội
   * @param {Player} player - Đối tượng người chơi
   * @param {Array} args - Tham số lệnh
   * @returns {Promise<Object>} - Kết quả xử lý
   */
  async handleClan(player, args = []) {
    if (!args.length) {
      return {
        success: true,
        message: "🛡️ LỆNH BANG HỘI 🛡️\n\nclan create [tên] - Tạo bang hội mới\nclan info - Xem thông tin bang hội của bạn\nclan list - Xem danh sách bang hội\nclan join [tên bang] - Xin gia nhập bang hội\nclan leave - Rời khỏi bang hội\nclan kick [người chơi] - Đuổi thành viên (chỉ dành cho bang chủ và phó bang)\nclan promote [người chơi] - Thăng chức thành viên (chỉ dành cho bang chủ)\nclan demote [người chơi] - Giáng chức thành viên (chỉ dành cho bang chủ)\nclan disband - Giải tán bang hội (chỉ dành cho bang chủ)"
      };
    }

    const subCommand = args[0].toLowerCase();

    switch (subCommand) {
      case "create":
        const clanName = args.slice(1).join(" ");
        return await this.createClan(player, clanName);
      
      case "info":
        // TODO: Implement
        return {
          success: true,
          message: "🛡️ Chức năng đang được phát triển..."
        };
      
      case "list":
        // TODO: Implement
        return {
          success: true,
          message: "🛡️ Chức năng đang được phát triển..."
        };
      
      default:
        return {
          success: false,
          message: "❌ Lệnh không hợp lệ!\nSử dụng: clan [create/info/list/join/leave/kick/promote/demote/disband]"
        };
    }
  }
  
  /**
   * Tạo bang hội mới
   * @param {string} leaderId - ID người lãnh đạo
   * @param {string} leaderName - Tên người lãnh đạo
   * @param {string} clanName - Tên bang hội
   * @param {string} clanTag - Tag bang hội
   * @param {string} description - Mô tả bang hội
   * @returns {Object} - Kết quả tạo bang hội
   */
  createClanWithTag(leaderId, leaderName, clanName, clanTag, description = '') {
    if (!leaderId || !leaderName || !clanName || !clanTag) {
      return {
        success: false,
        message: 'Thiếu thông tin cần thiết để tạo bang hội'
      };
    }
    
    // Kiểm tra xem người chơi đã có bang hội chưa
    const existingClan = this.getPlayerClan(leaderId);
    if (existingClan) {
      return {
        success: false,
        message: 'Bạn đã là thành viên của một bang hội khác'
      };
    }
    
    // Kiểm tra tên và tag bang hội đã tồn tại chưa
    const existingClanByName = this.getClanByName(clanName);
    if (existingClanByName) {
      return {
        success: false,
        message: 'Tên bang hội đã tồn tại'
      };
    }
    
    const existingClanByTag = this.getClanByTag(clanTag);
    if (existingClanByTag) {
      return {
        success: false,
        message: 'Tag bang hội đã tồn tại'
      };
    }
    
    // Tạo ID mới cho bang hội
    const clanId = `clan_${Date.now()}_${Math.floor(Math.random() * 1000)}`;
    
    // Tạo dữ liệu bang hội mới
    const clanData = {
      id: clanId,
      name: clanName,
      description: description,
      tag: clanTag,
      leaderId: leaderId,
      members: [
        {
          id: leaderId,
          name: leaderName,
          role: 'leader',
          joinedAt: Date.now(),
          contribution: 0,
          lastActive: Date.now()
        }
      ],
      createdAt: Date.now()
    };
    
    // Tạo đối tượng bang hội mới
    const clan = new Clan(clanData);
    
    // Thêm vào danh sách
    this.clans.push(clan);
    this.clansById.set(clan.getId(), clan);
    this.clansByTag.set(clan.tag.toLowerCase(), clan);
    this.playerClans.set(leaderId, clanId);
    
    // Lưu vào bộ nhớ
    this.saveClans();
    
    return {
      success: true,
      message: 'Đã tạo bang hội thành công!',
      clan: clan.toJSON()
    };
  }

  /**
   * Gửi yêu cầu tham gia bang hội
   * @param {string} playerId - ID người chơi
   * @param {string} playerName - Tên người chơi
   * @param {number} playerLevel - Cấp độ người chơi
   * @param {string} clanId - ID bang hội
   * @param {string} message - Lời nhắn
   * @returns {Object} - Kết quả gửi yêu cầu
   */
  sendJoinRequest(playerId, playerName, playerLevel, clanId, message = '') {
    if (!playerId || !playerName || !clanId) {
      return {
        success: false,
        message: 'Thiếu thông tin cần thiết để gửi yêu cầu'
      };
    }
    
    // Kiểm tra xem người chơi đã có bang hội chưa
    const existingClan = this.getPlayerClan(playerId);
    if (existingClan) {
      return {
        success: false,
        message: 'Bạn đã là thành viên của một bang hội khác'
      };
    }
    
    // Lấy thông tin bang hội
    const clan = this.getClanById(clanId);
    if (!clan) {
      return {
        success: false,
        message: 'Không tìm thấy bang hội'
      };
    }
    
    // Kiểm tra xem bang hội còn chỗ trống không
    if (!clan.hasSpace()) {
      return {
        success: false,
        message: 'Bang hội đã đầy'
      };
    }
    
    // Thêm yêu cầu tham gia
    const result = clan.addJoinRequest(playerId, playerName, playerLevel, message);
    if (!result.success) {
      return result;
    }
    
    // Lưu vào bộ nhớ
    this.saveClans();
    
    return {
      success: true,
      message: `Đã gửi yêu cầu tham gia bang hội ${clan.getName()}!`
    };
  }

  /**
   * Chấp nhận yêu cầu tham gia bang hội
   * @param {string} clanId - ID bang hội
   * @param {string} playerId - ID người chơi được chấp nhận
   * @param {string} approverId - ID người phê duyệt
   * @returns {Object} - Kết quả chấp nhận
   */
  acceptJoinRequest(clanId, playerId, approverId) {
    if (!clanId || !playerId || !approverId) {
      return {
        success: false,
        message: 'Thiếu thông tin cần thiết để chấp nhận yêu cầu'
      };
    }
    
    // Lấy thông tin bang hội
    const clan = this.getClanById(clanId);
    if (!clan) {
      return {
        success: false,
        message: 'Không tìm thấy bang hội'
      };
    }
    
    // Kiểm tra quyền hạn
    if (!clan.isOfficer(approverId) && !clan.isLeader(approverId)) {
      return {
        success: false,
        message: 'Bạn không có quyền chấp nhận yêu cầu tham gia'
      };
    }
    
    // Tìm yêu cầu tham gia
    const request = clan.joinRequests.find(req => req.id === playerId);
    if (!request) {
      return {
        success: false,
        message: 'Không tìm thấy yêu cầu tham gia'
      };
    }
    
    // Kiểm tra xem bang hội còn chỗ trống không
    if (!clan.hasSpace()) {
      return {
        success: false,
        message: 'Bang hội đã đầy'
      };
    }
    
    // Thêm người chơi vào bang hội
    clan.addMember(playerId, request.name);
    
    // Xóa yêu cầu tham gia
    clan.removeJoinRequest(playerId);
    
    // Cập nhật thông tin bang hội của người chơi
    this.playerClans.set(playerId, clanId);
    
    // Lưu vào bộ nhớ
    this.saveClans();
    
    return {
      success: true,
      message: `Đã chấp nhận ${request.name} vào bang hội!`
    };
  }

  /**
   * Từ chối yêu cầu tham gia bang hội
   * @param {string} clanId - ID bang hội
   * @param {string} playerId - ID người chơi bị từ chối
   * @param {string} rejectorId - ID người từ chối
   * @returns {Object} - Kết quả từ chối
   */
  rejectJoinRequest(clanId, playerId, rejectorId) {
    if (!clanId || !playerId || !rejectorId) {
      return {
        success: false,
        message: 'Thiếu thông tin cần thiết để từ chối yêu cầu'
      };
    }
    
    // Lấy thông tin bang hội
    const clan = this.getClanById(clanId);
    if (!clan) {
      return {
        success: false,
        message: 'Không tìm thấy bang hội'
      };
    }
    
    // Kiểm tra quyền hạn
    if (!clan.isOfficer(rejectorId) && !clan.isLeader(rejectorId)) {
      return {
        success: false,
        message: 'Bạn không có quyền từ chối yêu cầu tham gia'
      };
    }
    
    // Tìm yêu cầu tham gia
    const request = clan.joinRequests.find(req => req.id === playerId);
    if (!request) {
      return {
        success: false,
        message: 'Không tìm thấy yêu cầu tham gia'
      };
    }
    
    // Xóa yêu cầu tham gia
    clan.removeJoinRequest(playerId);
    
    // Lưu vào bộ nhớ
    this.saveClans();
    
    return {
      success: true,
      message: `Đã từ chối yêu cầu tham gia của ${request.name}!`
    };
  }

  /**
   * Rời khỏi bang hội
   * @param {string} playerId - ID người chơi
   * @returns {Object} - Kết quả rời bang
   */
  leaveClan(playerId) {
    if (!playerId) {
      return {
        success: false,
        message: 'Thiếu thông tin người chơi'
      };
    }
    
    // Tìm bang hội của người chơi
    const clan = this.getPlayerClan(playerId);
    if (!clan) {
      return {
        success: false,
        message: 'Bạn không thuộc bang hội nào'
      };
    }
    
    // Kiểm tra xem người chơi có phải là bang chủ không
    if (clan.isLeader(playerId)) {
      return {
        success: false,
        message: 'Bang chủ không thể rời khỏi bang hội. Hãy chuyển giao chức vụ hoặc giải tán bang hội.'
      };
    }
    
    // Lấy tên bang hội và tên người chơi
    const clanName = clan.getName();
    const member = clan.getMember(playerId);
    const memberName = member ? member.name : 'Thành viên';
    
    // Xóa người chơi khỏi bang hội
    clan.removeMember(playerId);
    
    // Xóa thông tin bang hội của người chơi
    this.playerClans.delete(playerId);
    
    // Lưu vào bộ nhớ
    this.saveClans();
    
    return {
      success: true,
      message: `${memberName} đã rời khỏi bang hội ${clanName}!`
    };
  }

  /**
   * Giải tán bang hội (chỉ dành cho bang chủ)
   * @param {string} playerId - ID người chơi
   * @returns {Object} - Kết quả giải tán
   */
  disbandClanByOwner(playerId) {
    if (!playerId) {
      return {
        success: false,
        message: 'Thiếu thông tin người chơi'
      };
    }
    
    // Tìm bang hội của người chơi
    const clan = this.getPlayerClan(playerId);
    if (!clan) {
      return {
        success: false,
        message: 'Bạn không thuộc bang hội nào'
      };
    }
    
    // Kiểm tra xem người chơi có phải là bang chủ không
    if (!clan.isLeader(playerId)) {
      return {
        success: false,
        message: 'Chỉ bang chủ mới có thể giải tán bang hội'
      };
    }
    
    // Lấy tên bang hội và danh sách thành viên
    const clanName = clan.getName();
    const members = [...clan.members];
    
    // Xóa bang hội
    const clanId = clan.getId();
    this.clans = this.clans.filter(c => c.getId() !== clanId);
    this.clansById.delete(clanId);
    
    if (clan.tag) {
      this.clansByTag.delete(clan.tag.toLowerCase());
    }
    
    // Xóa thông tin bang hội của các thành viên
    for (const member of members) {
      this.playerClans.delete(member.id);
    }
    
    // Lưu vào bộ nhớ
    this.saveClans();
    
    return {
      success: true,
      message: `Bang hội ${clanName} đã được giải tán!`
    };
  }

  /**
   * Lưu dữ liệu bang hội vào bộ nhớ
   */
  saveClans() {
    const clansData = this.gameData.getClansData() || {};
    clansData.clans = this.clans.map(clan => clan.toJSON());
    this.gameData.clansData = clansData;
    this.gameData.markClansDataChanged();
  }
}

export function getClanServiceInstance() {
  if (!instance) {
    instance = new ClanService();
  }
  return instance;
}

let instance = null;