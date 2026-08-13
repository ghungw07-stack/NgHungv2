/**
 * WorldBossService.js
 * Service xử lý các thao tác liên quan đến World Boss
 */

import { getGameDataInstance } from "../core/GameData.js";
import { getGameManagerInstance } from "../core/GameManager.js";
import { getServiceRegistry } from "./ServiceRegistry.js";
import { Monster } from "../models/Monster.js";
import Player from "../models/Player.js";
import { WorldBoss } from "../models/WorldBoss.js";

/**
 * Service xử lý các thao tác liên quan đến boss thế giới
 * @class WorldBossService
 */
export class WorldBossService {
  constructor() {
    /** @type {import('../core/GameData.js').GameData} */
    this.gameData = getGameDataInstance();

    /** @type {import('../core/GameManager.js').GameManager} */
    this.gameManager = getGameManagerInstance();
    
    // Lấy registry để truy cập các service khi cần
    this._registry = getServiceRegistry();

    /** @type {Object|null} World Boss hiện tại */
    this.currentBoss = null;

    /** @type {Map<string, Object>} Lưu trữ damage của người chơi */
    this.damageDealt = new Map();

    /** @type {number|null} Thời gian xuất hiện boss tiếp theo */
    this.nextSpawnTime = null;

    // MonsterService sẽ được lấy từ registry
    this.activeBoss = null;
    this.bossHistory = [];

    // Khởi tạo dữ liệu worldBossData trong gameData nếu chưa có
    if (!this.gameData.worldBossData) {
      this.gameData.worldBossData = {
        activeBoss: null,
        bossHistory: [],
      };
      // Thêm trường worldBossData vào dataChanged
      if (!this.gameData.dataChanged.hasOwnProperty("worldBossData")) {
        this.gameData.dataChanged.worldBossData = false;
      }
    }
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
   * Lấy ItemService
   * @returns {import('./ItemService.js').ItemService}
   */
  get itemService() {
    return this.getService('ItemService');
  }
  
  /**
   * Lấy MonsterService
   * @returns {import('./MonsterService.js').MonsterService}
   */
  get monsterService() {
    return this.getService('MonsterService');
  }
  
  /**
   * Lấy CombatService
   * @returns {import('./CombatService.js').CombatService}
   */
  get combatService() {
    return this.getService('CombatService');
  }

  /**
   * Tạo World Boss mới
   * @returns {Object} - Thông tin World Boss
   */
  createWorldBoss() {
    const bossData = {
      id: `wb_${Date.now()}`,
      name: "Thần Rồng Cổ Đại",
      description: "Boss thế giới cực mạnh, thách thức mọi người chơi!",
      level: 100,
      type: "world_boss",
      stats: {
        hp: { current: 1000000, max: 1000000 },
        mp: { current: 100000, max: 100000 },
        attack: 10000,
        defense: 3000,
        speed: 200,
        exp: 100000,
      },
      drops: [
        { id: "legendary_sword", chance: 0.01 },
        { id: "dragon_scale", chance: 0.1 },
        { id: "ancient_core", chance: 0.05 },
      ],
      skills: ["dragon_breath", "earthquake", "meteor_storm"],
      immunities: ["stun", "freeze"],
      weaknesses: ["holy", "lightning"],
    };

    this.currentBoss = new Monster(bossData);
    this.damageDealt.clear();
    this.nextSpawnTime = null;

    return this.currentBoss;
  }

  /**
   * Kiểm tra trạng thái World Boss
   * @returns {Object} - Trạng thái hiện tại
   */
  checkBossStatus() {
    if (!this.currentBoss) {
      if (!this.nextSpawnTime) {
        // Tạo thời gian xuất hiện boss mới (3 giờ sau)
        this.nextSpawnTime = Date.now() + 3 * 60 * 60 * 1000;
      }

      if (Date.now() >= this.nextSpawnTime) {
        // Đã đến thời gian, tạo boss mới
        const boss = this.createWorldBoss();
        return {
          status: "spawned",
          message: `🐉 ${boss.getName()} đã xuất hiện!\nHP: ${boss.stats.hp.current}/${boss.stats.hp.max}`,
        };
      }

      // Tính thời gian còn lại
      const timeLeft = this.nextSpawnTime - Date.now();
      const hours = Math.floor(timeLeft / (60 * 60 * 1000));
      const minutes = Math.floor((timeLeft % (60 * 60 * 1000)) / (60 * 1000));

      return {
        status: "waiting",
        message: `⏳ World Boss sẽ xuất hiện sau ${hours} giờ ${minutes} phút!`,
      };
    }

    // Boss đang tồn tại
    return {
      status: "active",
      message: `🐉 ${this.currentBoss.getName()}\nHP: ${this.currentBoss.stats.hp.current}/${
        this.currentBoss.stats.hp.max
      }`,
    };
  }

  /**
   * Tấn công World Boss
   * @param {Player} player - Đối tượng người chơi
   * @param {string} skillId - ID kỹ năng (nếu có)
   * @returns {Object} - Kết quả tấn công
   */
  attack(player, skillId = null) {
    if (!this.currentBoss) {
      return {
        success: false,
        message: "❌ World Boss chưa xuất hiện!",
      };
    }

    // Kiểm tra và lấy chỉ số attack của người chơi
    let attackPower = 0;
    if (player.stat && player.stat.attack !== undefined && !isNaN(player.stat.attack)) {
      attackPower = player.stat.attack;
    } else {
      attackPower = 5; // Giá trị mặc định
      console.error("Player missing attack stat:", player.getName());
    }
    

    // Lấy defense của boss
    let bossDefense = 0;
    if (this.currentBoss.stats && this.currentBoss.stats.defense !== undefined && !isNaN(this.currentBoss.stats.defense)) {
      bossDefense = this.currentBoss.stats.defense;
    }
    else if (this.currentBoss.defense !== undefined && !isNaN(this.currentBoss.defense)) {
      bossDefense = this.currentBoss.defense;
    }
    else {
      bossDefense = 0;
      console.error("Boss missing defense stat:", this.currentBoss.getName() || this.currentBoss.getId());
    }

    // Tính toán sát thương cơ bản
    let baseDamage = Math.max(1, attackPower - bossDefense / 2);
    
    // Tính toán sát thương gốc với biến động ngẫu nhiên (90-110%)
    const randomFactor = 0.9 + Math.random() * 0.2;
    const baseDamageWithVariation = Math.floor(baseDamage * randomFactor);
    
    // Tổng sát thương trước khi tính kỹ năng
    let damage = baseDamageWithVariation;

    // Thêm sát thương từ kỹ năng
    if (skillId) {
      // TODO: Tính toán sát thương từ kỹ năng
      damage *= 1.5;
    }

    // Lấy ID của người chơi
    const playerId = player.getGlobalId();
    
    // Cộng dồn sát thương
    const totalDamage = (this.damageDealt.get(playerId) || 0) + damage;
    this.damageDealt.set(playerId, totalDamage);

    // Trừ HP boss
    this.currentBoss.stats.hp.current = Math.max(0, this.currentBoss.stats.hp.current - damage);

    // Tính phần trăm HP còn lại
    const hpPercent = Math.floor((this.currentBoss.stats.hp.current / this.currentBoss.stats.hp.max) * 100);

    // Nếu boss đã hết HP
    if (this.currentBoss.stats.hp.current <= 0) {
      const result = this.handleBossDeath();
      result.damage = damage;
      result.hpPercent = 0;
      return result;
    }
    
    let message = `⚔️ Bạn tấn công ${this.currentBoss.getName()} và gây ra ${Math.floor(damage)} sát thương!\n`;
    message += `HP Boss: ${this.currentBoss.stats.hp.current}/${this.currentBoss.stats.hp.max} (${hpPercent}%)`;

    return {
      success: true,
      message: message,
      damage,
      hpPercent,
    };
  }

  /**
   * Xử lý khi World Boss chết
   * @returns {Object} - Kết quả và phần thưởng
   */
  handleBossDeath() {
    // Sắp xếp người chơi theo sát thương
    const topDamage = Array.from(this.damageDealt.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10);

    let message = "🎊 World Boss đã bị đánh bại!\n\nTop 10 sát thương:";
    for (const [playerId, damage] of topDamage) {
      const player = this.gameData.getPlayerByPlayerId(playerId);
      if (player) {
        message += `\n${player.name}: ${damage} sát thương`;
      }
    }

    // Phát thưởng cho người chơi
    for (const [playerId, damage] of this.damageDealt.entries()) {
      const player = this.gameData.getPlayerByPlayerId(playerId);
      if (player) {
        // Tính phần thưởng dựa trên % sát thương
        const damagePercent = damage / this.currentBoss.stats.hp.max;
        const goldReward = Math.floor(1000000 * damagePercent);
        const expReward = Math.floor(100000 * damagePercent);

        // Cộng phần thưởng
        player.money.gold += goldReward;
        player.stat.exp.current += expReward;

        // TODO: Thêm vật phẩm ngẫu nhiên từ drops của boss
      }
    }

    // Reset trạng thái
    this.currentBoss = null;
    this.damageDealt.clear();
    this.nextSpawnTime = Date.now() + 3 * 60 * 60 * 1000; // 3 giờ sau

    // Lưu thay đổi
    this.gameData.markPlayerDataChanged();

    return {
      success: true,
      message,
    };
  }

  /**
   * Xử lý lệnh World Boss
   * @param {Player} player - Đối tượng người chơi
   * @param {Array} args - Tham số lệnh
   * @returns {Object} - Kết quả xử lý
   */
  handleWorldBoss(player, args = []) {
    const subCommand = args[0]?.toLowerCase() || "status";

    switch (subCommand) {
      case "status":
        return {
          success: true,
          message: this.checkBossStatus().message,
        };

      case "attack":
        return this.attack(player, args[1]);

      case "spawn":
        // Chỉ admin mới có thể spawn boss
        if (player && player.role === "admin") {
          this.createWorldBoss();
          return {
            success: true,
            message: "🐉 Đã tạo World Boss mới!",
          };
        }
        return {
          success: false,
          message: "❌ Bạn không có quyền sử dụng lệnh này!",
        };

      default:
        return {
          success: false,
          message: "❌ Lệnh không hợp lệ!\nSử dụng: worldboss [status/attack]",
        };
    }
  }

  /**
   * Tải dữ liệu boss thế giới từ bộ nhớ
   */
  loadWorldBossData() {
    const worldBossData = this.gameData.getWorldBossData();

    if (worldBossData) {
      // Tải boss đang hoạt động
      if (worldBossData.activeBoss) {
        this.activeBoss = new WorldBoss(worldBossData.activeBoss);

        // Kiểm tra xem boss đã hết hạn chưa
        if (this.activeBoss.status === "active" && this.activeBoss.isExpired()) {
          this.activeBoss.status = "expired";
          this.activeBoss.endTime = this.activeBoss.spawnTime + this.activeBoss.duration;
          this.saveWorldBossData();
        }
      } else {
        this.activeBoss = null;
      }

      // Tải lịch sử boss
      if (worldBossData.bossHistory && Array.isArray(worldBossData.bossHistory)) {
        this.bossHistory = worldBossData.bossHistory.map((bossData) => new WorldBoss(bossData));
      } else {
        this.bossHistory = [];
      }
    }
  }

  /**
   * Lấy boss thế giới đang hoạt động
   * @returns {WorldBoss|null} - Boss thế giới hoặc null nếu không có
   */
  getActiveBoss() {
    if (this.activeBoss === undefined) {
      this.loadWorldBossData();
    }

    // Kiểm tra xem boss đã hết hạn chưa
    if (this.activeBoss && this.activeBoss.status === "active" && this.activeBoss.isExpired()) {
      this.activeBoss.status = "expired";
      this.activeBoss.endTime = this.activeBoss.spawnTime + this.activeBoss.duration;
      this.saveWorldBossData();
    }

    return this.activeBoss;
  }

  /**
   * Lấy lịch sử boss thế giới
   * @param {number} limit - Số lượng tối đa
   * @returns {Array<WorldBoss>} - Danh sách boss
   */
  getBossHistory(limit = 10) {
    if (this.bossHistory === undefined) {
      this.loadWorldBossData();
    }

    return this.bossHistory.slice(0, limit);
  }

  /**
   * Tạo boss thế giới mới
   * @param {string} monsterId - ID quái vật làm boss
   * @param {string} location - Vị trí xuất hiện
   * @param {number} duration - Thời gian tồn tại (ms)
   * @param {Object} customData - Dữ liệu tùy chỉnh
   * @returns {Object} - Kết quả tạo boss
   */
  spawnWorldBoss(monsterId, location = "", duration = 24 * 60 * 60 * 1000, customData = {}) {
    // Kiểm tra xem đã có boss đang hoạt động không
    const activeBoss = this.getActiveBoss();
    if (activeBoss && activeBoss.status === "active") {
      return {
        success: false,
        message: "Đã có boss thế giới đang hoạt động",
      };
    }

    // Lấy thông tin quái vật
    const monster = this.monsterService.getMonsterById(monsterId);
    if (!monster) {
      return {
        success: false,
        message: "Không tìm thấy quái vật",
      };
    }

    // Tạo ID mới cho boss
    const bossId = `worldboss_${Date.now()}_${Math.floor(Math.random() * 1000)}`;

    // Tạo dữ liệu boss mới
    const bossData = {
      id: bossId,
      name: customData.name || `${monster.getName()} (Boss thế giới)`,
      description: customData.description || monster.getDescription(),
      monsterId: monster.getId(),
      level: customData.level || monster.level * 2,
      maxHp: customData.maxHp || monster.stats.hp * 100,
      attack: customData.attack || monster.stats.attack * 5,
      defense: customData.defense || monster.stats.defense * 3,
      speed: customData.speed || monster.stats.speed * 1.5,
      critRate: customData.critRate || monster.stats.critRate * 1.2,
      critDmg: customData.critDmg || monster.stats.critDmg,
      element: customData.element || monster.element,
      skills: customData.skills || monster.skills,
      spawnTime: Date.now(),
      duration: duration,
      location: location,
      status: "active",
      isWorldBoss: true, // Đánh dấu đây là boss thế giới
      rewards: customData.rewards || {
        exp: monster.exp * 50,
        gold: monster.gold * 50,
        items: monster.drops
          ? monster.drops.map((drop) => {
              // Tạo vật phẩm rơi với tỷ lệ rơi tăng và tỷ lệ rơi nội tại là 15%
              const newDrop = {
                ...drop,
                chance: (drop.chance || 0.1) * 2, // Tăng tỷ lệ rơi vật phẩm
              };

              // Nếu vật phẩm có thể có nội tại, gán tỷ lệ rơi nội tại là 15%
              if (drop.traits && drop.traits.length > 0) {
                newDrop.traitChance = 15; // Tỷ lệ rơi nội tại cho boss thế giới
              }

              return newDrop;
            })
          : [],
      },
    };

    // Tạo đối tượng boss mới
    this.activeBoss = new WorldBoss(bossData);

    // Lưu vào bộ nhớ
    this.saveWorldBossData();

    return {
      success: true,
      message: `Boss thế giới ${this.activeBoss.getName()} đã xuất hiện!`,
      boss: this.activeBoss.toJSON(),
    };
  }

  /**
   * Tấn công boss thế giới
   * @param {string} playerId - ID người chơi
   * @param {string} playerName - Tên người chơi
   * @param {number} damage - Sát thương gây ra
   * @returns {Object} - Kết quả tấn công
   */
  attackBoss(playerId, playerName, damage) {
    if (!playerId || !playerName || damage <= 0) {
      return {
        success: false,
        message: "Thông tin tấn công không hợp lệ",
      };
    }

    // Kiểm tra xem có boss đang hoạt động không
    const activeBoss = this.getActiveBoss();
    if (!activeBoss) {
      return {
        success: false,
        message: "Không có boss thế giới đang hoạt động",
      };
    }

    // Tấn công boss
    const result = activeBoss.attackBoss(playerId, playerName, damage);

    // Lưu vào bộ nhớ nếu tấn công thành công
    if (result.success) {
      this.saveWorldBossData();

      // Nếu boss đã bị đánh bại, thêm vào lịch sử
      if (result.defeated) {
        // Giới hạn lịch sử tối đa 20 boss
        if (this.bossHistory.length >= 20) {
          this.bossHistory.pop();
        }

        // Thêm boss vào đầu lịch sử
        this.bossHistory.unshift(this.activeBoss);

        // Xóa boss hiện tại
        this.activeBoss = null;
      }
    }

    return result;
  }

  /**
   * Lấy thông tin tham gia của người chơi
   * @param {string} playerId - ID người chơi
   * @returns {Object|null} - Thông tin tham gia hoặc null nếu không tìm thấy
   */
  getPlayerParticipation(playerId) {
    if (!playerId) return null;

    const activeBoss = this.getActiveBoss();
    if (activeBoss) {
      return activeBoss.participants[playerId] || null;
    }

    return null;
  }

  /**
   * Nhận phần thưởng từ boss thế giới
   * @param {string} playerId - ID người chơi
   * @returns {Object} - Kết quả nhận phần thưởng
   */
  claimRewards(playerId) {
    if (!playerId) {
      return {
        success: false,
        message: "Thiếu thông tin người chơi",
      };
    }

    // Kiểm tra xem có boss đang hoạt động không
    const activeBoss = this.getActiveBoss();

    // Nếu có boss đang hoạt động, không thể nhận thưởng
    if (activeBoss && activeBoss.status === "active") {
      return {
        success: false,
        message: "Không thể nhận thưởng khi boss vẫn đang hoạt động",
      };
    }

    // Nếu không có boss đã bị đánh bại gần đây, không thể nhận thưởng
    if (!this.bossHistory || this.bossHistory.length === 0) {
      return {
        success: false,
        message: "Không có boss nào đã bị đánh bại gần đây",
      };
    }

    // Lấy boss đã bị đánh bại gần nhất
    const lastDefeatedBoss = this.bossHistory[0];

    // Kiểm tra xem người chơi có tham gia không
    const participation = lastDefeatedBoss.participants[playerId];
    if (!participation) {
      return {
        success: false,
        message: "Bạn không tham gia vào trận chiến với boss này",
      };
    }

    // Kiểm tra xem người chơi đã nhận thưởng chưa
    if (participation.claimed) {
      return {
        success: false,
        message: "Bạn đã nhận phần thưởng rồi",
      };
    }

    // Tính phần thưởng dựa vào đóng góp
    const rewards = lastDefeatedBoss.calculateRewardForPlayer(playerId);

    // Cộng thưởng cho người chơi
    const player = this.gameData.getPlayerData(playerId);
    if (player) {
      // Cộng kinh nghiệm
      player.exp += rewards.exp;

      // Cộng vàng
      player.gold += rewards.gold;

      // Thêm vật phẩm vào túi đồ
      if (rewards.items && rewards.items.length > 0) {
        for (const item of rewards.items) {
          // TODO: Thêm vật phẩm vào túi đồ người chơi
        }
      }

      // Đánh dấu đã nhận thưởng
      participation.claimed = true;

      // Lưu vào bộ nhớ
      this.gameData.savePlayerData(player);
      this.saveWorldBossData();
    }

    return {
      success: true,
      message: `Bạn đã nhận được phần thưởng:\n- ${rewards.exp} kinh nghiệm\n- ${rewards.gold} vàng${
        rewards.items && rewards.items.length > 0 ? `\n- ${rewards.items.length} vật phẩm` : ""
      }`,
      rewards,
    };
  }

  /**
   * Lưu dữ liệu boss thế giới vào bộ nhớ
   */
  saveWorldBossData() {
    const worldBossData = {
      activeBoss: this.activeBoss ? this.activeBoss.toJSON() : null,
      bossHistory: this.bossHistory.map((boss) => boss.toJSON()),
    };

    this.gameData.setWorldBossData(worldBossData);
  }
}

let instance = null;

export function getWorldBossServiceInstance() {
  if (!instance) {
    instance = new WorldBossService();
  }
  return instance;
}
