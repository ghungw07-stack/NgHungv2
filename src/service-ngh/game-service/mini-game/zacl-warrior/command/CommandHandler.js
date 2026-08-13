/**
 * CommandHandler.js
 * Lớp xử lý các lệnh từ người chơi
 */

import { getGameDataInstance } from "../core/GameData.js";
import { getGameManagerInstance } from "../core/GameManager.js";
import { removeMention } from "../../../../../utils/format-util.js";
import { sendMessageComplete, sendMessageFromSQL } from "../../../../chat-zalo/chat-style/chat-style.js";
import { getGlobalPrefix } from "../../../../service.js";
import { getUserInfoBasic } from "../../../../info-service/user-info.js";
import { addGame, addPlayer, getActiveGames } from "../../../mini-game/index.js";
import { getServiceRegistry } from "../services/ServiceRegistry.js";

/**
 * Lớp xử lý các lệnh từ người chơi
 * @class CommandHandler
 */
export class CommandHandler {
  constructor() {
    /** @type {import('../core/GameData.js').GameData} */
    this.gameData = getGameDataInstance();
    /** @type {import('../core/GameManager.js').GameManager} */
    this.gameManager = getGameManagerInstance();

    // Set the CommandHandler instance in the GameManager
    this.gameManager.setCommandHandler(this);

    // Lấy registry để truy cập các service khi cần
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
   *@returns {import('../services/PlayerService.js').PlayerService}
   */
  get playerService() {
    return this.getService("PlayerService");
  }

  /**
   * @returns {import('../services/AreaService.js').AreaService}
   */
  get areaService() {
    return this.getService("AreaService");
  }

  /**
   * @returns {import('../services/CombatService.js').CombatService}
   */
  get combatService() {
    return this.getService("CombatService");
  }

  /**
   * @returns {import('../services/QuestService.js').QuestService}
   */
  get questService() {
    return this.getService("QuestService");
  }

  /**
   * @returns {import('../services/ShopService.js').ShopService}
   */
  get shopService() {
    return this.getService("ShopService");
  }

  /**
   * @returns {import('../services/NpcService.js').NpcService}
   */
  get npcService() {
    return this.getService("NpcService");
  }

  /**
   * @returns {import('../services/SkillService.js').SkillService}
   */
  get skillService() {
    return this.getService("SkillService");
  }

  /**
   * @returns {import('../services/TradeService.js').TradeService}
   */
  get tradeService() {
    return this.getService("TradeService");
  }

  /**
   * @returns {import('../services/ItemService.js').ItemService}
   */
  get itemService() {
    return this.getService("ItemService");
  }

  /**
   * @returns {import('../services/MonsterService.js').MonsterService}
   */
  get monsterService() {
    return this.getService("MonsterService");
  }

  /**
   * @returns {import('../services/CraftService.js').CraftService}
   */
  get clanService() {
    return this.getService("ClanService");
  }

  /**
   * @returns {import('../services/CodeService.js').CodeService}
   */
  get codeService() {
    return this.getService("CodeService");
  }

  /**
   * @returns {import('../services/RankingService.js').RankingService}
   */
  get rankingService() {
    return this.getService("RankingService");
  }

  /**
   * @returns {import('../services/PvpService.js').PvpService}
   */
  get pvpService() {
    return this.getService("PvpService");
  }

  /**
   * @returns {import('../services/WorldBossService.js').WorldBossService}
   */
  get worldBossService() {
    return this.getService("WorldBossService");
  }

  /**
   * @returns {import('../services/CraftService.js').CraftService}
   */
  get craftService() {
    return this.getService("CraftService");
  }

  /**
   * Hiển thị danh sách lệnh hỗ trợ
   * @param {Array} args - Tham số lệnh
   * @returns {Object} Kết quả xử lý
   */
  handleHelpCommand(args = []) {
    // Danh sách các loại lệnh
    const commandTypes = {
      general: {
        title: "📋 LỆNH CHUNG",
        commands: [
          { name: "help", desc: "Hiển thị danh sách lệnh" },
          { name: "stats", desc: "Xem chỉ số nhân vật" },
          { name: "inventory, inv", desc: "Xem túi đồ" },
          { name: "equipment, eq", desc: "Xem trang bị đang mặc" },
          { name: "use [vật phẩm]", desc: "Sử dụng vật phẩm trong túi đồ" },
          { name: "equip [vật phẩm]", desc: "Trang bị vật phẩm" },
          { name: "unequip [vật phẩm]", desc: "Tháo trang bị" },
          { name: "code [mã code]", desc: "Sử dụng mã code" },
        ],
      },
      exploration: {
        title: "🗺️ KHÁM PHÁ",
        commands: [
          { name: "area", desc: "Xem thông tin khu vực" },
          { name: "move [khu vực]", desc: "Di chuyển đến khu vực khác" },
          { name: "list npc", desc: "Xem danh sách NPC trong khu vực" },
          { name: "list monsters", desc: "Xem danh sách quái vật trong khu vực" },
          { name: "talk [tên NPC]", desc: "Nói chuyện với NPC" },
        ],
      },
      combat: {
        title: "⚔️ CHIẾN ĐẤU",
        commands: [
          { name: "attack", desc: "Tấn công trong trận đấu" },
          { name: "skill [tên kỹ năng]", desc: "Sử dụng kỹ năng" },
          { name: "learn", desc: "Xem huấn luyện viên có thể dạy kỹ năng" },
          { name: "learn [tên NPC]", desc: "Xem kỹ năng có thể học từ NPC" },
          { name: "learn [tên kỹ năng]", desc: "Học kỹ năng mới" },
          { name: "combat help", desc: "Xem hướng dẫn chiến đấu chi tiết" },
          { name: "combat info", desc: "Xem thông tin trận đấu" },
          { name: "combat time", desc: "Xem thời gian còn lại của lượt" },
          { name: "combat actions", desc: "Xem các hành động có thể thực hiện" },
        ],
      },
      progression: {
        title: "📈 TIẾN TRIỂN",
        commands: [
          { name: "quest", desc: "Xem nhiệm vụ hiện tại" },
          { name: "list quests", desc: "Xem danh sách nhiệm vụ khả dụng" },
          { name: "quest [ID nhiệm vụ]", desc: "Xem chi tiết nhiệm vụ" },
          { name: "quest accept [ID]", desc: "Nhận nhiệm vụ" },
          { name: "quest complete [ID]", desc: "Hoàn thành nhiệm vụ" },
        ],
      },
      social: {
        title: "👥 XÃ HỘI",
        commands: [
          { name: "clan", desc: "Xem thông tin bang hội" },
          { name: "clan create [tên]", desc: "Tạo bang hội mới" },
          { name: "clan join [tên]", desc: "Tham gia bang hội" },
          { name: "clan leave", desc: "Rời khỏi bang hội" },
          { name: "trade [người chơi]", desc: "Giao dịch với người chơi" },
          { name: "ranking", desc: "Xem bảng xếp hạng" },
        ],
      },
      economy: {
        title: "💰 KINH TẾ",
        commands: [
          { name: "shop", desc: "Xem cửa hàng tại khu vực" },
          { name: "shop buy [vật phẩm]", desc: "Mua vật phẩm" },
          { name: "shop sell [vật phẩm]", desc: "Bán vật phẩm" },
          { name: "craft", desc: "Xem công thức chế tạo" },
          { name: "craft [vật phẩm]", desc: "Chế tạo vật phẩm" },
        ],
      },
      events: {
        title: "🎭 SỰ KIỆN",
        commands: [
          { name: "worldboss", desc: "Xem thông tin boss thế giới" },
          { name: "worldboss join", desc: "Tham gia săn boss thế giới" },
        ],
      },
    };

    // Nếu có tham số, hiển thị trợ giúp cho loại lệnh cụ thể
    if (args.length > 0) {
      const category = args[0].toLowerCase();
      if (commandTypes[category]) {
        let helpText = `${commandTypes[category].title}\n\n`;
        for (const cmd of commandTypes[category].commands) {
          helpText += `• ${cmd.name}: ${cmd.desc}\n`;
        }

        // Thêm thông tin bổ sung cho từng loại
        if (category === "combat") {
          helpText += "\n⏱️ Mỗi lượt chiến đấu có giới hạn 45 giây\n";
          helpText += "🔄 Có thể thay đổi trang bị trong trận đấu với lệnh 'equip'\n";
          helpText += "⚔️ Trang bị phù hợp với hệ kỹ năng sẽ tăng sức mạnh đòn đánh\n";
        } else if (category === "general") {
          helpText += "\n🎒 Túi đồ có giới hạn, hãy quản lý vật phẩm cẩn thận\n";
          helpText += "🔄 Bạn có thể thay đổi trang bị tùy theo tình huống chiến đấu\n";
        }

        return {
          success: true,
          message: helpText,
        };
      } else if (category === "equipment" || category === "items") {
        // Hiển thị thông tin về các loại trang bị
        let helpText = "🛡️ HƯỚNG DẪN TRANG BỊ\n\n";

        helpText += "📋 Các loại vũ khí:\n";
        helpText += "• Kiếm (w_): Vũ khí cận chiến cân bằng\n";
        helpText += "• Trượng phép (s_): Vũ khí phép thuật, tăng sức mạnh phép thuật\n";
        helpText += "• Găng tay võ thuật (g_): Vũ khí cận chiến, tăng sức mạnh combo\n\n";

        helpText += "📋 Các loại áo choàng:\n";
        helpText += "• Áo choàng thường (c_): Tăng phòng thủ cơ bản\n";
        helpText += "• Áo choàng pháp sư (cm_): Tăng sức mạnh phép thuật\n";
        helpText += "• Áo choàng võ sư (cv_): Tăng hiệu quả combo võ thuật\n\n";

        helpText += "📋 Cấp độ trang bị (từ thấp đến cao):\n";
        helpText += "Tân Thủ → Da → Đồng → Bạc → Vàng → Bạch Kim → Kim Cương → Hắc Diện\n\n";

        helpText += "💡 Lời khuyên:\n";
        helpText += "• Pháp sư nên dùng trượng phép và áo choàng pháp sư\n";
        helpText += "• Võ sư nên dùng găng tay võ thuật và áo choàng võ sư\n";
        helpText += "• Chiến binh có thể dùng kiếm hoặc găng tay tùy theo phong cách\n";

        return {
          success: true,
          message: helpText,
        };
      }
    }

    // Hiển thị tổng quan các loại lệnh
    let helpText = "🌟 DANH SÁCH LỆNH ZACL WARRIOR 🌟\n\n";
    helpText += "Sử dụng `help [loại]` để xem chi tiết từng loại lệnh.\n\n";

    for (const category in commandTypes) {
      helpText += `${commandTypes[category].title} [${category}]:\n`;
      const maxCommands = Math.min(3, commandTypes[category].commands.length);
      for (let i = 0; i < maxCommands; i++) {
        const cmd = commandTypes[category].commands[i];
        helpText += `• ${cmd.name}: ${cmd.desc}\n`;
      }
      if (maxCommands < commandTypes[category].commands.length) {
        helpText += `... và ${commandTypes[category].commands.length - maxCommands} lệnh khác\n\n`;
      } else {
        helpText += "\n";
      }
    }

    helpText += "📖 Các loại trợ giúp khác:\n";
    helpText += "• help equipment: Xem thông tin về các loại trang bị\n";

    return {
      success: true,
      message: helpText,
    };
  }

  /**
   * Gửi tin nhắn kết quả
   * @param {Object} api - API object
   * @param {Object} message - Message object
   * @param {Object} result - Result object with success and message properties
   */
  async sendMessageWithResult(api, message, result) {
    if (typeof result === "string") {
      result = {
        success: true,
        message: result,
      };
    }
    await sendMessageFromSQL(api, message, result, false, this.gameManager.TIME_TO_LIVE);
  }

  /**
   * Xử lý lệnh game từ người chơi
   * @param {Object} api - API object
   * @param {Object} message - Message object
   * @param {string} command - Lệnh được gửi
   * @param {Array} args - Các tham số của lệnh
   * @returns {Promise<Object>} - Kết quả xử lý lệnh
   */
  async handleGameCommand(api, message, command, args) {
    const playerId = message.data.uidFrom;

    const player = this.playerService.getPlayerInstance(playerId);

    if (!player) {
      return {
        success: false,
        message: "❌ Không tìm thấy thông tin người chơi!",
      };
    }

    player.lastActivity = Date.now();
    player.save();

    if (player.status === "dead") {
      const respawnStatus = this.playerService.checkRespawnStatus(player);
      if (respawnStatus.canRespawn) {
        return {
          success: true,
          message: "💀 Bạn đã chết! Nhưng bạn có thể hồi sinh.\nSử dụng lệnh `respawn` để hồi sinh.",
        };
      } else {
        const timeLeft = Math.ceil(respawnStatus.timeLeft / 1000);
        return {
          success: true,
          message: `💀 Bạn đã chết! Bạn có thể hồi sinh sau ${timeLeft} giây.`,
        };
      }
    }

    // Kiểm tra xem người chơi có đang trong combat không
    const isInCombat = this.combatService.isPlayerInCombat(player);

    // Lệnh chiến đấu được xử lý ưu tiên nếu đang trong combat
    if (isInCombat) {
      switch (command.toLowerCase()) {
        case "attack":
          return await this.combatService.handleAttack(player, args);

        case "skill":
          return await this.skillService.handleSkill(player, args);

        case "use":
          return await this.playerService.handleUseItem(player, args.join(" "));

        case "target":
          return await this.combatService.handleTarget(player, args);
        case "flee":
        case "run":
          return await this.combatService.handleFlee(player, args);

        case "combat":
          if (args[0] === "info") {
            return await this.combatService.handleCombatInfo(player);
          } else if (args[0] === "time") {
            // Hiển thị thời gian còn lại
            const combats = this.combatService.getPlayerCombats(player);
            if (combats.length === 0) {
              return {
                success: false,
                message: "❌ Bạn không trong trạng thái chiến đấu!",
              };
            }

            const currentCombat = this.combatService.combats.get(player.currentCombat);
            if (!currentCombat) {
              return {
                success: false,
                message: "❌ Không tìm thấy thông tin trận đấu hiện tại!",
              };
            }

            const timeLeft = Math.max(0, Math.ceil((currentCombat.turnTimeout - Date.now()) / 1000));
            return {
              success: true,
              message: `⏱️ Thời gian còn lại: ${timeLeft} giây`,
            };
          } else if (args[0] === "actions") {
            return {
              success: true,
              message:
                "🎮 CÁC HÀNH ĐỘNG TRONG CHIẾN ĐẤU\n\n" +
                "• attack: Tấn công đối thủ\n" +
                "• skill [tên kỹ năng]: Sử dụng kỹ năng\n" +
                "• use [vật phẩm]: Sử dụng vật phẩm (chỉ 1 vật phẩm/lượt)\n" +
                "• target list: Xem danh sách mục tiêu\n" +
                "• target [số thứ tự]: Chọn mục tiêu\n" +
                "• combat info: Xem thông tin trận đấu\n" +
                "• combat time: Xem thời gian còn lại\n" +
                "• flee: Thoát khỏi trận đấu (PVE có tỉ lệ thất bại)\n" +
                "• flee accept/reject: Chấp nhận/từ chối cho đối thủ đầu hàng (PVP)\n" +
                "\n⚠️ Mỗi hành động sẽ kết thúc lượt của bạn!\n" +
                "⚠️ Mỗi lượt chỉ được sử dụng 1 vật phẩm!",
            };
          } else if (args[0] === "help") {
            return {
              success: true,
              message:
                "⚔️ HƯỚNG DẪN CHIẾN ĐẤU\n\n" +
                "Chiến đấu trong ZACL Warrior diễn ra theo lượt, với mỗi lượt kéo dài tối đa 3 phút.\n\n" +
                "🎯 Các loại chiến đấu:\n" +
                "• PVE: Đánh quái thông thường và quái tinh anh (🌟)\n" +
                "• Boss Thế Giới: Nhiều người chơi cùng đánh, mỗi người chỉ được tấn công 30s/lần\n" +
                "• PVP: Đấu với người chơi khác\n\n" +
                "⏱️ Quy tắc theo lượt:\n" +
                "• Mỗi lượt có 3 phút để hành động\n" +
                "• Nếu hết thời gian mà không hành động, sẽ tự động bỏ lượt\n" +
                "• Các hành động như attack, skill, use sẽ kết thúc lượt\n" +
                "• Mỗi lượt chỉ được sử dụng 1 vật phẩm\n\n" +
                "🏃‍♂️ Chạy trốn (flee):\n" +
                "• Trong PVE: Có cơ hội chạy thoát dựa vào sức mạnh so với quái vật\n" +
                "• Trong PVP: Người chơi có thể yêu cầu đầu hàng với lệnh 'flee'\n" +
                "• Đối thủ có thể chấp nhận với 'flee accept' hoặc từ chối với 'flee reject'\n" +
                "• Nếu chấp nhận, trận đấu kết thúc hòa\n" +
                "• Nếu từ chối hoặc không phản hồi, trận đấu tiếp tục\n\n" +
                "💡 Mẹo chiến đấu:\n" +
                "• Sử dụng kỹ năng phù hợp với trang bị để tăng sát thương\n" +
                "• Quái tinh anh (🌟) có chỉ số cao hơn nhưng cũng có phần thưởng tốt hơn\n" +
                "• Trong PVP, bạn có 60 giây để chuẩn bị trước khi bắt đầu",
            };
          }
      }
    }

    // Các lệnh thông thường khi không trong combat hoặc các lệnh không bị ảnh hưởng bởi combat
    switch (command.toLowerCase()) {
      case "help":
        return this.handleHelpCommand(args);

      case "stats":
        return this.playerService.handleStatsCommand(player);

      case "inventory":
      case "inv":
        return this.playerService.handleInventoryCommand(player);

      case "equipment":
      case "eqm":
        return this.playerService.handleEquipmentCommand(player);

      case "equip":
        return await this.playerService.handleEquipCommand(player, args.join(" "));

      case "unequip":
        return await this.playerService.handleUnequipCommand(player, args.join(" "));

      case "use":
        return await this.playerService.handleUseItem(player, args.join(" "));

      case "move":
        return await this.areaService.handleMoveCommand(player, args.join(" "));

      case "attack":
        return await this.combatService.handleAttack(player, args);

      case "skill":
        return await this.skillService.handleSkill(player, args);

      case "learn":
        return await this.skillService.handleLearnCommand(player, args);

      case "area":
      case "check":
        return await this.areaService.handleCheck(player);

      case "quest":
        return await this.questService.handleQuest(player, args);

      case "respawn":
        return await this.playerService.respawnPlayer(player);

      case "rest":
        return await this.playerService.handleRest(player);

      case "shop":
        return await this.shopService.handleShopCommand(player, args);

      case "talk":
        return await this.npcService.talkToNpc(player, args.join(" "));

      case "list":
        if (args[0] === "npc") {
          return await this.npcService.showNpcList(player);
        } else if (args[0] === "monsters" || args[0] === "monster") {
          return await this.monsterService.showMonstersInArea(player);
        } else if (args[0] === "quests" || args[0] === "quest") {
          return await this.questService.handleQuest(player, args.slice(1));
        } else {
          return {
            success: false,
            message: "❌ Sử dụng: list [npc/monsters/quests]",
          };
        }

      case "code":
        return await this.codeService.handleCode(player, args.join(" "));

      case "trade":
        return await this.tradeService.handleTrade(player, args);

      case "craft":
        return await this.craftService.handleCraftCommand(player, args);

      case "rank":
        return await this.rankingService.handleRanking(player, args);

      case "clan":
        return await this.clanService.handleClan(player, args);

      case "worldboss":
      case "wb":
        return await this.worldBossService.handleWorldBoss(player, args);

      case "target":
        return await this.combatService.handleTarget(player, args);

      case "combat":
        if (args[0] === "info") {
          return await this.combatService.handleCombatInfo(player);
        } else if (args[0] === "help" || args[0] === "actions" || args[0] === "time") {
          return {
            success: false,
            message: "❌ Bạn không trong trạng thái chiến đấu!",
          };
        }

      default:
        return {
          success: false,
          message: "❌ Lệnh không hợp lệ! Sử dụng `help` để xem danh sách lệnh.",
        };
    }
  }

  /**
   * Xử lý message từ người chơi
   * @param {Object} api - API object
   * @param {Object} message - Message object
   */
  async handleMessage(api, message) {
    const playerId = message.data.uidFrom;

    const globalState = this.gameManager.getGlobalState();

    if (!globalState.has(playerId)) return false;

    this.gameManager.setPlayerState(playerId);

    const content = removeMention(message);

    if (content.toLowerCase() === "leave") {
      const result = await this.handleLeaveGame(api, message);
      await this.sendMessageWithResult(api, message, result);
      return true;
    }

    const parts = content.split(/\s+/);
    const command = parts[0].toLowerCase();
    const args = parts.slice(1);

    if (!this.gameManager.VALID_COMMANDS.includes(command)) {
      return false;
    }

    try {
      const result = await this.handleGameCommand(api, message, command, args);
      await this.sendMessageWithResult(api, message, result);
      return true;
    } catch (error) {
      console.error("Lỗi khi xử lý lệnh game:", error);
      await this.sendMessageWithResult(api, message, {
        success: false,
        message: "Đã xảy ra lỗi khi xử lý lệnh game!",
      });
      return false;
    }
  }

  /**
   * Xử lý lệnh tham gia game
   * @param {Object} api - API object
   * @param {Object} message - Message object
   */
  async handleJoinGame(api, message) {
    const threadId = message.threadId;
    const playerId = message.data.uidFrom;
    const zaloName = message.data.dName;
    let player = null;
    let isCreate = false;

    if (!this.gameManager.isPlayerInGame(playerId)) {
      const userData = await getUserInfoBasic(api, playerId);
      const globalId = userData.globalId;

      const rawPlayerData = this.gameData.getPlayerByGlobalId(globalId);

      if (!rawPlayerData) {
        player = this.playerService.createNewPlayer(userData);
        isCreate = true;
      } else {
        player = this.playerService.createPlayer(rawPlayerData);
        if (!player.knownIds.includes(playerId)) {
          player.knownIds.push(playerId);
          player.save();
        }
      }

      const complete = this.gameManager.addPlayerToGame({ playerId, globalId });

      if (!complete) {
        await sendMessageComplete(api, message, "❌ Đã xảy ra lỗi khi thêm người chơi vào game!", false);
        return;
      }
    } else {
      player = this.gameManager.getPlayerFromId(playerId);
    }

    addPlayer(threadId, this.gameManager.gameType, playerId, zaloName);

    const currentArea = this.areaService.findAreaByNameOrId(player.currentArea);

    const welcomeMsg =
      `🎮 Chào mừng bạn đã ${isCreate ? "đến" : "trở lại"} với ${this.gameManager.gameType}!` +
      `\n\n${player.getName()}, bạn đang ở ${currentArea.name}.\n\nNhập \`help\` để xem danh sách lệnh.`;

    await sendMessageComplete(api, message, welcomeMsg, false, this.gameManager.TIME_TO_LIVE);
  }

  /**
   * Xử lý lệnh rời game
   * @param {Object} api - API object
   * @param {Object} message - Message object
   */
  async handleLeaveGame(api, message) {
    const playerId = message.data.uidFrom;
    const threadId = message.threadId;

    if (!this.gameManager.isPlayerInGame(playerId)) {
      await sendMessageComplete(api, message, `❌ Bạn chưa tham gia game ${this.gameManager.gameType}!`);
      return;
    }

    this.gameManager.removePlayerFromGame({ playerId, threadId });

    await sendMessageComplete(api, message, `👋 Bạn đã rời khỏi game ${this.gameManager.gameType}. Hẹn gặp lại sau!`);
  }

  /**
   * Xử lý lệnh game zaclw
   * @param {Object} api - API object
   * @param {Object} message - Message object
   * @param {string} aliasCommand - Lệnh alias
   */
  async handleZaclWarriorCommand(api, message, aliasCommand) {
    const botId = api.getBotId();
    const prefix = getGlobalPrefix(botId);
    const content = removeMention(message);
    const command = content.replace(prefix, "").replace(aliasCommand, "").trim();
    const threadId = message.threadId;

    const activeGames = getActiveGames();
    if (!activeGames.has(threadId)) addGame(threadId, this.gameManager.gameType, this.gameManager.getGlobalState());
    let threadGames = activeGames.get(threadId);
    if (!threadGames.has(this.gameManager.gameType))
      addGame(threadId, this.gameManager.gameType, this.gameManager.getGlobalState());

    switch (command) {
      case "join":
        await this.handleJoinGame(api, message);
        break;
      case "leave":
        await this.handleLeaveGame(api, message);
        break;
      case "help":
        await sendMessageComplete(
          api,
          message,
          "📜 (Zalo Commandline Warrior) 📜\n\n" +
            `- ${aliasCommand} join: Tham gia game\n` +
            `- ${aliasCommand} leave: Rời khỏi game\n` +
            `- ${aliasCommand} help: Hiển thị hướng dẫn này\n\n` +
            `Sau khi tham gia game, bạn có thể sử dụng các lệnh game trực tiếp.\n` +
            `Gõ 'help' để xem danh sách lệnh trong game.`
        );
        break;
      default:
        await sendMessageComplete(
          api,
          message,
          `❌ Lệnh '${aliasCommand} ${command}' không tồn tại.\n` +
            `Các lệnh hợp lệ: ${aliasCommand} join, ${aliasCommand} leave, ${aliasCommand} help`
        );
    }
  }
}

let instance = null;

export function getCommandHandlerInstance() {
  if (!instance) {
    instance = new CommandHandler();
  }
  return instance;
}
