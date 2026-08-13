/**
 * PvpService.js
 * Service xử lý chiến đấu PVP giữa các người chơi
 */

import { getGameDataInstance } from "../core/GameData.js";
import { getGameManagerInstance } from "../core/GameManager.js";
import { getServiceRegistry } from "./ServiceRegistry.js";
import Player from "../models/Player.js";

export class PvpService {
  constructor() {
    /** @type {import('../core/GameData.js').GameData} */
    this.gameData = getGameDataInstance();
    /** @type {import('../core/GameManager.js').GameManager} */
    this.gameManager = getGameManagerInstance();

    // Lấy registry để truy cập các service khi cần
    this._registry = getServiceRegistry();

    // Map lưu trữ trạng thái PVP
    this.pvpStates = new Map();
    this.pvpRequests = new Map();

    // Constants
    this.PREP_TIME = 60 * 1000; // 60 giây chuẩn bị
    this.REQUEST_TIMEOUT = 60 * 1000; // Thời gian chờ chấp nhận lời thách đấu
    this.COMBAT_TIMEOUT = 3 * 60 * 1000; // 3 phút cho mỗi lượt
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
    return this.getService("PlayerService");
  }

  /**
   * Lấy CombatService
   * @returns {import('./CombatService.js').CombatService}
   */
  get combatService() {
    return this.getService("CombatService");
  }

  /**
   * Lấy AreaService
   * @returns {import('./AreaService.js').AreaService}
   */
  get areaService() {
    return this.getService("AreaService");
  }

  /**
   * Khởi tạo dịch vụ
   */
  initialize() {
    // Service liên quan đã được thiết lập trong constructor
  }

  /**
   * Gửi lời thách đấu PVP
   * @param {Player} player - Người chơi gửi thách đấu
   * @param {String} targetName - Tên người chơi được thách đấu
   * @returns {Promise<Object>} - Kết quả gửi thách đấu
   */
  async sendPvpRequest(player, targetName) {
    if (!player || !targetName) {
      return {
        success: false,
        message: "❌ Thiếu thông tin người chơi!",
      };
    }

    // Không thể thách đấu chính mình
    if (player.getName().toLowerCase() === targetName.toLowerCase()) {
      return {
        success: false,
        message: "❌ Bạn không thể thách đấu chính mình!",
      };
    }

    // Tìm người chơi mục tiêu
    const targetPlayer = await this.findPlayerByName(targetName);
    if (!targetPlayer) {
      return {
        success: false,
        message: `❌ Không tìm thấy người chơi '${targetName}'!`,
      };
    }

    // Kiểm tra người chơi đã offline quá lâu
    const now = Date.now();
    if (now - targetPlayer.lastActivity > 15 * 60 * 1000) {
      // 15 phút
      return {
        success: false,
        message: `❌ Người chơi ${targetPlayer.getName()} không hoạt động trong thời gian gần đây!`,
      };
    }

    // Kiểm tra trạng thái người chơi
    if (targetPlayer.status === "dead") {
      return {
        success: false,
        message: `❌ ${targetPlayer.getName()} đã chết và không thể chiến đấu!`,
      };
    }

    // Tạo ID cho request
    const requestId = `pvp_req_${Date.now()}_${Math.floor(Math.random() * 1000)}`;

    // Lưu request
    this.pvpRequests.set(requestId, {
      id: requestId,
      fromId: player.getGlobalId(),
      fromName: player.getName(),
      toId: targetPlayer.getGlobalId(),
      toName: targetPlayer.getName(),
      createdAt: now,
      expiresAt: now + this.REQUEST_TIMEOUT,
      status: "pending", // pending, accepted, rejected, expired
    });

    // Thiết lập timeout xóa request sau 2 phút
    setTimeout(() => {
      const request = this.pvpRequests.get(requestId);
      if (request && request.status === "pending") {
        request.status = "expired";
      }
    }, this.REQUEST_TIMEOUT);

    return {
      success: true,
      message: `✅ Đã gửi lời thách đấu đến ${targetPlayer.getName()}!`,
      requestId,
    };
  }

  /**
   * Phản hồi lời thách đấu PVP
   * @param {Player} player - Người chơi phản hồi
   * @param {string} requestId - ID của request
   * @param {boolean} accept - Chấp nhận hay từ chối
   * @returns {Promise<Object>} - Kết quả phản hồi
   */
  async respondToPvpRequest(player, requestId, accept) {
    if (!player || !requestId) {
      return {
        success: false,
        message: "❌ Thiếu thông tin người chơi hoặc yêu cầu!",
      };
    }

    // Tìm request
    const request = this.pvpRequests.get(requestId);
    if (!request) {
      return {
        success: false,
        message: "❌ Không tìm thấy yêu cầu thách đấu!",
      };
    }

    // Kiểm tra người phản hồi có đúng không
    if (request.toId !== player.getGlobalId()) {
      return {
        success: false,
        message: "❌ Bạn không phải là người nhận yêu cầu thách đấu này!",
      };
    }

    // Kiểm tra trạng thái request
    if (request.status !== "pending") {
      return {
        success: false,
        message: `❌ Yêu cầu thách đấu đã ${
          request.status === "accepted" ? "được chấp nhận" : request.status === "rejected" ? "bị từ chối" : "hết hạn"
        }!`,
      };
    }

    // Kiểm tra thời gian hết hạn
    if (Date.now() > request.expiresAt) {
      request.status = "expired";
      return {
        success: false,
        message: "❌ Yêu cầu thách đấu đã hết hạn!",
      };
    }

    // Cập nhật trạng thái request
    request.status = accept ? "accepted" : "rejected";

    // Nếu từ chối, trả về kết quả
    if (!accept) {
      return {
        success: true,
        message: `✅ Bạn đã từ chối lời thách đấu từ ${request.fromName}!`,
      };
    }

    // Nếu chấp nhận, tạo trận đấu PVP mới
    const player1 = await this.playerService.getPlayerByGlobalId(request.fromId);
    const player2 = player;

    if (!player1) {
      return {
        success: false,
        message: "❌ Không tìm thấy người thách đấu!",
      };
    }

    // Tạo trận đấu PVP
    const pvpResult = await this.createPvpCombat(player1, player2);
    return pvpResult;
  }

  /**
   * Tạo combat PVP giữa hai người chơi
   * @param {Player} player1 - Người chơi 1
   * @param {Player} player2 - Người chơi 2
   * @returns {Promise<Object>} - Kết quả tạo combat
   */
  async createPvpCombat(player1, player2) {
    if (!player1 || !player2) {
      return {
        success: false,
        message: "❌ Thiếu thông tin người chơi!",
      };
    }

    // Tạo ID cho combat
    const combatId = this.combatService.createCombatId("pvp");

    // Thiết lập thời gian chuẩn bị
    const prepEndTime = Date.now() + this.PREP_TIME;

    // Lưu thông tin chuẩn bị vào người chơi
    player1.pvpPreparationEndTime = prepEndTime;
    player2.pvpPreparationEndTime = prepEndTime;

    // Lưu người chơi
    player1.save();
    player2.save();

    // Tạo combat instance
    const combat = {
      id: combatId,
      type: "pvp",
      startTime: Date.now(),
      prepEndTime: prepEndTime,
      endTime: null,
      status: "preparation", // preparation, active, ended
      entities: [
        {
          id: player1.getGlobalId(),
          type: "player",
          name: player1.getName(),
          hp: player1.stat.hp.current,
          maxHp: player1.stat.hp.max,
          stats: player1.getBaseStats(),
        },
        {
          id: player2.getGlobalId(),
          type: "player",
          name: player2.getName(),
          hp: player2.stat.hp.current,
          maxHp: player2.stat.hp.max,
          stats: player2.getBaseStats(),
        },
      ],
      currentTurn: 0,
      turnTimeout: 0, // Sẽ thiết lập khi bắt đầu chiến đấu
      actionQueue: [],
      currentEntityIndex: 0,
      logs: [],
      itemUsedThisTurn: {
        used: false,
        item: null,
      },
    };

    // Lưu combat vào service
    this.combatService.combats.set(combatId, combat);

    // Thêm entity vào combat map
    this.combatService.addEntityToCombat(player1.getGlobalId(), combatId);
    this.combatService.addEntityToCombat(player2.getGlobalId(), combatId);

    // Thiết lập combat cho người chơi
    player1.currentCombat = combatId;
    player1.targetSelection = player2.getGlobalId();
    player1.save();

    player2.currentCombat = combatId;
    player2.targetSelection = player1.getGlobalId();
    player2.save();

    // Thiết lập timeout để bắt đầu chiến đấu sau thời gian chuẩn bị
    setTimeout(() => {
      this.startPvpCombat(combatId);
    }, this.PREP_TIME);

    return {
      success: true,
      message:
        `⚔️ Trận đấu PVP giữa ${player1.getName()} và ${player2.getName()} đã bắt đầu!\n\n` +
        `Bạn có ${this.PREP_TIME / 1000} giây để chuẩn bị trước khi chiến đấu.\n` +
        `Trong thời gian này, bạn có thể thay đổi trang bị và sử dụng vật phẩm hỗ trợ.`,
    };
  }

  /**
   * Bắt đầu chiến đấu PVP sau thời gian chuẩn bị
   * @param {string} combatId - ID của combat
   */
  startPvpCombat(combatId) {
    const combat = this.combatService.combats.get(combatId);
    if (!combat || combat.status !== "preparation") return;

    // Cập nhật trạng thái combat
    combat.status = "active";
    combat.turnTimeout = Date.now() + this.COMBAT_TIMEOUT;

    // Xác định ai đánh trước dựa trên tốc độ
    const player1 = this.gameData.getPlayerByGlobalId(combat.entities[0].id);
    const player2 = this.gameData.getPlayerByGlobalId(combat.entities[1].id);

    if (player1 && player2) {
      const player1Stats = player1.getBaseStats();
      const player2Stats = player2.getBaseStats();

      if (player2Stats.speed > player1Stats.speed) {
        combat.currentEntityIndex = 1;
      }

      // Cập nhật thông tin trong combat
      combat.entities[0].stats = player1Stats;
      combat.entities[0].hp = player1.stat.hp.current;
      combat.entities[0].maxHp = player1.stat.hp.max;

      combat.entities[1].stats = player2Stats;
      combat.entities[1].hp = player2.stat.hp.current;
      combat.entities[1].maxHp = player2.stat.hp.max;

      // Ghi log
      combat.logs.push({
        time: Date.now(),
        message: `Trận đấu bắt đầu! ${combat.entities[combat.currentEntityIndex].name} đánh trước!`,
      });
    }
  }

  /**
   * Tìm người chơi theo tên
   * @param {string} name - Tên người chơi
   * @returns {Player|null} - Đối tượng người chơi hoặc null
   */
  async findPlayerByName(name) {
    if (!name) return null;

    const nameLower = name.toLowerCase();
    const players = Object.values(this.gameData.getPlayerData());

    for (const player of players) {
      if (player.getName().toLowerCase() === nameLower) {
        return player;
      }
    }

    return null;
  }

  /**
   * Xử lý lệnh PVP
   * @param {Player} player - Người chơi sử dụng lệnh
   * @param {Array} args - Tham số lệnh
   * @returns {Promise<Object>} - Kết quả xử lý
   */
  async handlePvpCommand(player, args) {
    if (!args || args.length === 0) {
      return {
        success: true,
        message:
          "⚔️ SỬ DỤNG LỆNH PVP\n\n" +
          "• pvp [tên người chơi]: Thách đấu người chơi khác\n" +
          "• pvp accept [id yêu cầu]: Chấp nhận lời thách đấu\n" +
          "• pvp reject [id yêu cầu]: Từ chối lời thách đấu\n" +
          "• pvp list: Xem danh sách lời thách đấu đang chờ\n" +
          "• pvp status: Xem trạng thái trận đấu PVP hiện tại",
      };
    }

    const subCommand = args[0].toLowerCase();

    switch (subCommand) {
      case "challenge":
      case "fight":
        if (args.length < 2) {
          return {
            success: false,
            message: "❌ Vui lòng cung cấp tên người chơi muốn thách đấu!",
          };
        }
        return await this.sendPvpRequest(player, args.slice(1).join(" "));

      case "accept":
        if (args.length < 2) {
          return {
            success: false,
            message: "❌ Vui lòng cung cấp ID của yêu cầu thách đấu!",
          };
        }
        return await this.respondToPvpRequest(player, args[1], true);

      case "reject":
        if (args.length < 2) {
          return {
            success: false,
            message: "❌ Vui lòng cung cấp ID của yêu cầu thách đấu!",
          };
        }
        return await this.respondToPvpRequest(player, args[1], false);

      case "list":
        return this.listPvpRequests(player);

      case "status":
        return this.getPvpStatus(player);

      default:
        // Nếu không phải subcommand, xem như tên người chơi muốn thách đấu
        return await this.sendPvpRequest(player, args.join(" "));
    }
  }

  /**
   * Hiển thị danh sách yêu cầu thách đấu
   * @param {Player} player - Người chơi xem danh sách
   * @returns {Object} - Kết quả hiển thị
   */
  listPvpRequests(player) {
    if (!player) {
      return {
        success: false,
        message: "❌ Thiếu thông tin người chơi!",
      };
    }

    const playerId = player.getGlobalId();
    const pending = [];

    // Tìm các request đang chờ liên quan đến người chơi
    for (const [id, request] of this.pvpRequests.entries()) {
      if (request.status === "pending" && (request.fromId === playerId || request.toId === playerId)) {
        // Kiểm tra hết hạn
        if (Date.now() > request.expiresAt) {
          request.status = "expired";
          continue;
        }

        pending.push({
          id: request.id,
          from: request.fromName,
          to: request.toName,
          timeLeft: Math.ceil((request.expiresAt - Date.now()) / 1000),
        });
      }
    }

    if (pending.length === 0) {
      return {
        success: true,
        message: "📋 Không có yêu cầu thách đấu nào đang chờ.",
      };
    }

    let message = "📋 DANH SÁCH THÁCH ĐẤU\n\n";

    pending.forEach((req) => {
      if (req.from === player.getName()) {
        message += `• Bạn đã thách đấu ${req.to} (còn ${req.timeLeft}s)\n  ID: ${req.id}\n\n`;
      } else {
        message +=
          `• ${req.from} đã thách đấu bạn (còn ${req.timeLeft}s)\n` +
          `  ID: ${req.id}\n` +
          `  Để chấp nhận, nhập: pvp accept ${req.id}\n` +
          `  Để từ chối, nhập: pvp reject ${req.id}\n\n`;
      }
    });

    return {
      success: true,
      message,
    };
  }

  /**
   * Hiển thị trạng thái trận đấu PVP hiện tại
   * @param {Player} player - Người chơi xem trạng thái
   * @returns {Object} - Kết quả hiển thị
   */
  getPvpStatus(player) {
    if (!player) {
      return {
        success: false,
        message: "❌ Thiếu thông tin người chơi!",
      };
    }

    const playerId = player.getGlobalId();

    // Kiểm tra player có trong combat PVP nào không
    const combats = this.combatService.getPlayerCombats(player);
    if (!combats || combats.length === 0) {
      return {
        success: true,
        message: "🏳️ Bạn không tham gia trận đấu PVP nào!",
      };
    }

    // Tìm trận đấu PVP
    let pvpCombat = null;
    for (const combatId of combats) {
      const combat = this.combatService.combats.get(combatId);
      if (combat && combat.type === "pvp") {
        pvpCombat = combat;
        break;
      }
    }

    if (!pvpCombat) {
      return {
        success: true,
        message: "🏳️ Bạn không tham gia trận đấu PVP nào!",
      };
    }

    // Tìm thông tin người chơi và đối thủ
    const playerIndex = pvpCombat.entities.findIndex((e) => e.id === playerId);
    if (playerIndex === -1) {
      return {
        success: false,
        message: "❌ Đã xảy ra lỗi khi tìm thông tin trận đấu!",
      };
    }

    const opponentIndex = playerIndex === 0 ? 1 : 0;
    const playerEntity = pvpCombat.entities[playerIndex];
    const opponentEntity = pvpCombat.entities[opponentIndex];

    let message = "⚔️ TRẬN ĐẤU PVP\n\n";

    // Hiển thị thông tin tùy theo trạng thái
    if (pvpCombat.status === "preparation") {
      const timeLeft = Math.max(0, Math.ceil((pvpCombat.prepEndTime - Date.now()) / 1000));
      message += `⏳ Thời gian chuẩn bị: còn ${timeLeft} giây\n\n`;
      message += `👤 Bạn: ${playerEntity.name}\n`;
      message += `👤 Đối thủ: ${opponentEntity.name}\n\n`;
      message += `💡 Trong thời gian chuẩn bị, bạn có thể thay đổi trang bị và sử dụng vật phẩm hỗ trợ.`;
    } else if (pvpCombat.status === "active") {
      message += `👤 ${playerEntity.name} - HP: ${playerEntity.hp}/${playerEntity.maxHp}\n`;
      message += `👤 ${opponentEntity.name} - HP: ${opponentEntity.hp}/${opponentEntity.maxHp}\n\n`;

      message += `🎲 Lượt hiện tại: ${pvpCombat.currentEntityIndex === playerIndex ? "Của bạn" : "Của đối thủ"}\n`;

      if (pvpCombat.currentEntityIndex === playerIndex) {
        const timeLeft = Math.max(0, Math.ceil((pvpCombat.turnTimeout - Date.now()) / 1000));
        message += `⏱️ Thời gian còn lại: ${timeLeft} giây\n\n`;
        message += `💡 Sử dụng lệnh 'attack' hoặc 'skill [tên kỹ năng]' để tấn công!`;
      } else {
        message += `⏳ Đang chờ đối thủ hành động...`;
      }
    } else if (pvpCombat.status === "ended") {
      const winner = pvpCombat.winnerIndex !== undefined ? pvpCombat.entities[pvpCombat.winnerIndex] : null;
      message += `🏆 Trận đấu đã kết thúc!\n`;
      message += winner ? `🎖️ Người chiến thắng: ${winner.name}\n\n` : `🤝 Hòa!\n\n`;
      message += `👤 ${playerEntity.name} - HP: ${playerEntity.hp}/${playerEntity.maxHp}\n`;
      message += `👤 ${opponentEntity.name} - HP: ${opponentEntity.hp}/${opponentEntity.maxHp}\n`;
    }

    return {
      success: true,
      message,
    };
  }
}

let instance = null;

export function getPvpServiceInstance() {
  if (!instance) {
    instance = new PvpService();
  }
  return instance;
}
