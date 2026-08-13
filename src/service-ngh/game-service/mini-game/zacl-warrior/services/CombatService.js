/**
 * CombatService.js
 * Service quản lý hệ thống chiến đấu
 */

import { getGameDataInstance } from "../core/GameData.js";
import { getGameManagerInstance } from "../core/GameManager.js";
import { Monster } from "../models/Monster.js";
import Player from "../models/Player.js";
import { getServiceRegistry } from "./ServiceRegistry.js";

export class CombatService {
  constructor() {
    /** @type {import('../core/GameData.js').GameData} */
    this.gameData = getGameDataInstance();

    /** @type {import('../core/GameManager.js').GameManager} */
    this.gameManager = getGameManagerInstance();

    // Lấy registry để truy cập các service khi cần
    this._registry = getServiceRegistry();

    // Lưu trữ combat instances
    this.combats = new Map(); // key: combatId, value: combat instance

    // Lưu trữ liên kết giữa entity và combat
    this.entityCombatMap = new Map(); // key: entityId, value: Array<combatId>

    // Lưu trữ yêu cầu flee trong PvP
    this.fleeRequests = new Map(); // key: combatId, value: { requesterId, targetId, timestamp }

    // Constants
    this.COMBAT_TIMEOUT = 3 * 60 * 1000; // 3 phút cho mỗi lượt
    this.PVP_PREP_TIME = 60; // 60s chuẩn bị cho PVP
    this.BOSS_ATTACK_COOLDOWN = 30; // 30s giữa các lần tấn công boss
    this.FLEE_REQUEST_TIMEOUT = 60 * 1000; // 60s cho yêu cầu flee
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
   * Lấy MonsterService
   * @returns {import('./MonsterService.js').MonsterService}
   */
  get monsterService() {
    return this.getService("MonsterService");
  }

  /**
   * Lấy PlayerService
   * @returns {import('./PlayerService.js').PlayerService}
   */
  get playerService() {
    return this.getService("PlayerService");
  }

  /**
   * Lấy SkillService
   * @returns {import('./SkillService.js').SkillService}
   */
  get skillService() {
    return this.getService("SkillService");
  }

  /**
   * Lấy ItemService
   * @returns {import('./ItemService.js').ItemService}
   */
  get itemService() {
    return this.getService("ItemService");
  }

  /**
   * Lấy WorldBossService
   * @returns {import('./WorldBossService.js').WorldBossService}
   */
  get worldBossService() {
    return this.getService("WorldBossService");
  }

  /**
   * Tạo ID cho combat mới
   * @param {string} type - Loại combat (pve/pvp/boss)
   * @returns {string} - ID của combat mới
   */
  createCombatId(type) {
    return `${type}_${Date.now()}_${Math.floor(Math.random() * 1000)}`;
  }

  /**
   * Kiểm tra người chơi có đang trong combat không
   * @param {Player} player - Đối tượng người chơi
   * @returns {boolean} - True nếu đang trong combat
   */
  isPlayerInCombat(player) {
    const playerId = player.getGlobalId();
    return this.entityCombatMap.has(playerId) && this.entityCombatMap.get(playerId).length > 0;
  }

  /**
   * Lấy danh sách combatId của người chơi
   * @param {Player} player - Đối tượng người chơi
   * @returns {Array<string>} - Danh sách combatId
   */
  getPlayerCombats(player) {
    const playerId = player.getGlobalId();
    return this.entityCombatMap.has(playerId) ? this.entityCombatMap.get(playerId) : [];
  }

  /**
   * Thêm combatId vào map của entity
   * @param {string} entityId - ID của entity
   * @param {string} combatId - ID của combat
   */
  addEntityToCombat(entityId, combatId) {
    if (!this.entityCombatMap.has(entityId)) {
      this.entityCombatMap.set(entityId, []);
    }

    const combats = this.entityCombatMap.get(entityId);
    if (!combats.includes(combatId)) {
      combats.push(combatId);
    }
  }

  /**
   * Xóa combatId khỏi map của entity
   * @param {string} entityId - ID của entity
   * @param {string} combatId - ID của combat
   */
  removeEntityFromCombat(entityId, combatId) {
    if (this.entityCombatMap.has(entityId)) {
      const combats = this.entityCombatMap.get(entityId);
      const index = combats.indexOf(combatId);
      if (index !== -1) {
        combats.splice(index, 1);
      }

      if (combats.length === 0) {
        this.entityCombatMap.delete(entityId);
      }
    }
  }

  /**
   * Tạo combat với quái vật
   * @param {Player} player - Đối tượng người chơi
   * @param {string} monsterNameOrId - Tên hoặc ID của quái vật
   * @returns {Promise<Object>} - Kết quả tạo combat
   */
  async createMonsterCombat(player, monsterNameOrId) {
    const areaId = player.currentArea;

    // Kiểm tra có trong khu vực không
    if (!areaId) {
      return {
        success: false,
        message: "❌ Không thể xác định khu vực hiện tại!",
      };
    }

    // Tìm quái vật trong khu vực
    const monsterResult = await this.monsterService.findMonsterInArea(areaId, monsterNameOrId);

    if (!monsterResult.success || !monsterResult.monster) {
      return {
        success: false,
        message: monsterResult.message || "❌ Không tìm thấy quái vật trong khu vực này!",
      };
    }

    // Lấy thông tin quái vật
    const monster = monsterResult.monster;
    const monsterType = monsterResult.monsterType || "normal";
    const isElite = monsterType === "elite";
    const isEnchanted = monsterType === "enchanted";

    // Lấy chỉ số chuẩn hóa của quái vật
    const monsterStats = this.monsterService.getMonsterStats(monster);

    // Hàm tạo chỉ số ngẫu nhiên 75%-150%
    function getRandomStats(baseStats) {
      return Math.floor(baseStats * (0.75 + Math.random() * 0.75));
    }

    // Tạo instance cho quái vật trong combat với chỉ số ngẫu nhiên
    const monsterInstance = {
      ...monster,
      id: monster.getId(),
      name: monster.getName(),
      isElite: isElite,
      isEnchanted: isEnchanted,
      hp: getRandomStats(monsterStats.hp),
      maxHp: getRandomStats(monsterStats.maxHp),
      attack: getRandomStats(monsterStats.attack),
      defense: getRandomStats(monsterStats.defense),
      speed: getRandomStats(monsterStats.speed),
      exp: getRandomStats(monsterStats.exp),
    };

    // Đảm bảo HP và maxHP khớp nhau
    monsterInstance.maxHp = monsterInstance.hp;

    // Tạo combat instance
    const combatId = this.createCombatId("pve");
    const combat = {
      id: combatId,
      type: "pve",
      startTime: Date.now(),
      endTime: null,
      status: "active",
      itemUsedThisTurn: {
        used: false,
        item: null,
      },
      entities: [
        {
          id: player.getGlobalId(),
          type: "player",
          name: player.getName(),
          hp: player.stat.hp.current,
          maxHp: player.stat.hp.max,
          stats: player.getBaseStats(),
        },
        {
          id: monsterInstance.id,
          type: "monster",
          name: monsterInstance.name,
          hp: monsterInstance.hp,
          maxHp: monsterInstance.maxHp,
          isElite: monsterInstance.isElite,
          isEnchanted: monsterInstance.isEnchanted,
          stats: {
            attack: monsterInstance.attack,
            defense: monsterInstance.defense,
            speed: monsterInstance.speed,
          },
        },
      ],
      currentTurn: 0,
      turnTimeout: Date.now() + this.COMBAT_TIMEOUT,
      actionQueue: [],
      currentEntityIndex: 0,
      logs: [],
      monsterData: monsterInstance,
    };

    // Xác định ai đánh trước dựa trên tốc độ
    if (monsterInstance.speed > player.stat.speed) {
      combat.currentEntityIndex = 1;
    }

    // Lưu combat vào map
    this.combats.set(combatId, combat);

    // Thêm entity vào map
    this.addEntityToCombat(player.getGlobalId(), combatId);
    this.addEntityToCombat(monsterInstance.id, combatId);

    // Thiết lập target cho player
    player.currentCombat = combatId;
    player.targetSelection = monsterInstance.id;
    player.save();

    let message = "";
    if (isElite) {
      message = `⚔️ Bạn gặp phải quái vật tinh anh ${monsterInstance.name}!\n`;
    } else if (isEnchanted) {
      message = `⚔️ Bạn gặp phải quái vật phù phép tà đạo ${monsterInstance.name}!\n`;
    } else {
      message = `⚔️ Bạn đang chiến đấu với ${monsterInstance.name}!\n`;
    }

    message += `🧬 Chỉ số: HP ${monsterInstance.hp}, ATK ${monsterInstance.attack}, DEF ${monsterInstance.defense}, SPD ${monsterInstance.speed}\n\n`;

    const currentEntity = combat.entities[combat.currentEntityIndex];
    if (currentEntity.id === player.getGlobalId()) {
      message += `🎲 Bạn nhanh hơn và được đánh trước! Sử dụng lệnh 'attack' hoặc 'skill [tên kỹ năng]'\n`;
    } else {
      message += `🎲 ${monsterInstance.name} nhanh hơn và sẽ tấn công trước!\n`;

      // Quái tấn công
      const monsterAction = this.processMonsterAction(combat, 1);
      message += monsterAction.message;

      // Kiểm tra người chơi có chết không
      if (combat.entities[0].hp <= 0) {
        message += `\n💀 Bạn đã bị đánh bại bởi ${monsterInstance.name}!`;
        this.endCombat(combatId, 1);
        player.status = "dead";
        player.respawnTime = Date.now() + 5 * 60 * 1000; // 5 phút hồi sinh
        player.save();
        return {
          success: true,
          message,
        };
      } else {
        message += `\n🎯 Đến lượt của bạn! Còn ${Math.ceil(
          (combat.turnTimeout - Date.now()) / 1000
        )} giây để hành động.`;
      }
    }

    return {
      success: true,
      message,
    };
  }

  /**
   * Xử lý hành động của quái vật
   * @param {Object} combat - Combat instance
   * @param {number} monsterIndex - Vị trí của quái trong danh sách entities
   * @returns {Object} - Kết quả hành động
   */
  processMonsterAction(combat, monsterIndex) {
    const monster = combat.entities[monsterIndex];
    const target = combat.entities[monsterIndex === 0 ? 1 : 0];

    let attackStat = 0;

    // Lấy chỉ số attack
    if (monster.stats && monster.stats.attack !== undefined && !isNaN(monster.stats.attack)) {
      attackStat = monster.stats.attack;
    } else if (monster.attack !== undefined && !isNaN(monster.attack)) {
      attackStat = monster.attack;
    }

    let defenseStat = 0;
    if (target.stats && target.stats.defense !== undefined && !isNaN(target.stats.defense)) {
      defenseStat = target.stats.defense;
    } else if (target.defense !== undefined && !isNaN(target.defense)) {
      defenseStat = target.defense;
    } else {
      defenseStat = 0;
      console.error("Target missing defense stat:", target.name || target.id);
    }

    const baseDamage = Math.max(1, attackStat - defenseStat / 3);

    // Tính toán sát thương (90-110% từ giá trị cơ bản)
    const randomFactor = 0.9 + Math.random() * 0.2;
    const damage = Math.floor(baseDamage * randomFactor);

    target.hp = Math.max(0, target.hp - damage);

    combat.logs.push({
      time: Date.now(),
      actor: monster.name,
      action: "attack",
      target: target.name,
      damage,
      remainingHp: target.hp,
    });
    
    // Chuyển lượt
    const previousEntityIndex = combat.currentEntityIndex;
    combat.currentEntityIndex = monsterIndex === 0 ? 1 : 0;
    combat.currentTurn++;
    combat.turnTimeout = Date.now() + this.COMBAT_TIMEOUT;
    
    // Giảm cooldown kỹ năng cho người chơi khi chuyển lượt từ quái sang người chơi
    if (combat.currentEntityIndex !== previousEntityIndex) {
      const newEntityIndex = combat.currentEntityIndex;
      if (combat.entities[newEntityIndex].type === "player") {
        // Lấy đối tượng người chơi
        const player = this.gameData.getPlayerByGlobalId(combat.entities[newEntityIndex].id);
        if (player) {
          // Giảm cooldown kỹ năng của người chơi
          const skills = player.skill.active || [];
          let cooldownReducedCount = 0;
          
          for (let i = 0; i < skills.length; i++) {
            if (skills[i].remainingCooldown > 0) {
              skills[i].remainingCooldown--;
              if (skills[i].remainingCooldown === 0) {
                cooldownReducedCount++;
              }
            }
          }
          
          // Cập nhật lại player
          player.save();
          
          // Ghi log nếu có kỹ năng đã hết hồi chiêu
          if (cooldownReducedCount > 0) {
            combat.logs.push({
              time: Date.now(),
              actor: player.getName(),
              action: "cooldown_reduced",
              message: `${cooldownReducedCount} kỹ năng đã hết thời gian hồi chiêu`,
            });
          }
        }
      }
    }

    return {
      success: true,
      message: `🗡️ ${monster.name} tấn công bạn và gây ra ${damage} sát thương!\n🔴 HP của bạn còn ${target.hp}/${target.maxHp}`,
    };
  }

  /**
   * Xử lý người chơi tấn công
   * @param {Player} player - Đối tượng người chơi
   * @param {Array} args - Tham số lệnh
   * @returns {Promise<Object>} - Kết quả tấn công
   */
  async handleAttack(player, args) {
    if (!this.isPlayerInCombat(player)) {
      if (args.length === 0) {
        return await this.monsterService.showMonstersInArea(player);
      } else {
        return await this.createMonsterCombat(player, args.join(" "));
      }
    }

    const currentCombatId = player.currentCombat;
    if (!currentCombatId || !this.combats.has(currentCombatId)) {
      return {
        success: false,
        message: "❌ Không tìm thấy trận đấu hiện tại!",
      };
    }

    const combat = this.combats.get(currentCombatId);

    const playerEntityIndex = combat.entities.findIndex((e) => e.id === player.getGlobalId());
    if (playerEntityIndex === -1 || combat.currentEntityIndex !== playerEntityIndex) {
      return {
        success: false,
        message: "❌ Chưa đến lượt của bạn!",
      };
    }

    const targetEntityIndex = playerEntityIndex === 0 ? 1 : 0;
    const targetEntity = combat.entities[targetEntityIndex];

    const playerStats = player.getBaseStats();
    let attackStat = 0;

    // Lấy chỉ số attack
    if (playerStats && playerStats.attack !== undefined && !isNaN(playerStats.attack)) {
      attackStat = playerStats.attack;
    } else if (player.stat && player.stat.attack !== undefined && !isNaN(player.stat.attack)) {
      attackStat = player.stat.attack;
    } else {
      attackStat = 1;
      console.error("Player missing attack stat:", player.getName());
    }

    let defenseStat = 0;
    if (targetEntity.stats && targetEntity.stats.defense !== undefined && !isNaN(targetEntity.stats.defense)) {
      defenseStat = targetEntity.stats.defense;
    } else if (targetEntity.defense !== undefined && !isNaN(targetEntity.defense)) {
      defenseStat = targetEntity.defense;
    } else {
      defenseStat = 0;
      console.error("Target missing defense stat:", targetEntity.name || targetEntity.id);
    }

    const baseDamage = Math.max(1, attackStat - defenseStat / 3);

    // Tính toán sát thương (90-110% từ giá trị cơ bản)
    const randomFactor = 0.9 + Math.random() * 0.2;
    const damage = Math.floor(baseDamage * randomFactor);

    // Trừ HP của target
    targetEntity.hp = Math.max(0, targetEntity.hp - damage);

    // Ghi nhật ký
    combat.logs.push({
      time: Date.now(),
      actor: player.getName(),
      action: "attack",
      target: targetEntity.name,
      damage,
      remainingHp: targetEntity.hp,
    });

    let message = `🗡️ Bạn tấn công ${targetEntity.name} và gây ra ${damage} sát thương!\n\n`;
    message += `🔴 HP của ${targetEntity.name} còn ${targetEntity.hp}/${targetEntity.maxHp}\n`;

    // Kiểm tra target đã chết chưa
    if (targetEntity.hp <= 0) {
      // Target đã chết
      message += `\n🏆 Bạn đã đánh bại ${targetEntity.name}!`;

      // Nếu là PVE, thêm phần thưởng và cập nhật nhiệm vụ
      if (combat.type === "pve") {
        const monster = combat.monsterData;

        // Cập nhật tiến trình nhiệm vụ giết quái
        const questService = this.getService('QuestService');
        if (questService) {
          const questProgress = await questService.updateQuestProgressWithDetails(
            player,
            "kill",
            monster.id,
            1
          );
          
          if (questProgress && questProgress.updated) {
            const completedQuests = questProgress.completedQuests || [];
            const progressedQuests = questProgress.progressedQuests || [];
            
            if (completedQuests.length > 0) {
              completedQuests.forEach(quest => {
                message += `\n📜✅ Hoàn thành nhiệm vụ: ${quest.name}!`;
              });
            }
            
            if (progressedQuests.length > 0) {
              progressedQuests.forEach(progress => {
                message += `\n📜📊 Nhiệm vụ ${progress.questName}: ${progress.progress}/${progress.required}`;
              });
            }
          }
        }

        // Tính XP
        const expGain = monster.exp || Math.floor(10 + monster.level * 5);
        const expResult = player.addExp(expGain);
        message += `\n✨ Bạn nhận được ${expGain} kinh nghiệm!`;

        if (expResult.levelUp) {
          message += `\n🎉 Bạn đã lên cấp ${player.stat.level}!`;
        }

        // Tính tiền
        const moneyGain = Math.floor(5 + monster.level * 2);
        player.money += moneyGain;
        message += `\n💰 Bạn nhận được ${moneyGain} xu!`;

        // Tính đồ rơi
        let dropRate = this.monsterService.NORMAL_DROP_RATE;

        if (monster.isElite) {
          dropRate = this.monsterService.ELITE_DROP_RATE;
        } else if (monster.isEnchanted) {
          dropRate = this.monsterService.ENCHANTED_DROP_RATE;
        } else if (monster.isBoss) {
          dropRate = this.monsterService.BOSS_DROP_RATE;
        }

        if (Math.random() < dropRate) {
          // Rơi đồ ngẫu nhiên phù hợp với level
          const items = this.gameData
            .getItemsData()
            .items.filter((item) => item.levelReq <= player.stat.level && item.levelReq >= player.stat.level - 5);

          if (items.length > 0) {
            const randomItem = items[Math.floor(Math.random() * items.length)];

            // Thêm vào túi đồ
            if (!player.bag) player.bag = {
              maxSlots: 20,
              item: []
            };
            
            if (!player.bag.item) {
              player.bag.item = [];
            }
            
            player.bag.item.push({
              id: randomItem.id,
              name: randomItem.name,
              amount: 1,
            });

            message += `\n🎁 Bạn nhận được ${randomItem.name}!`;
          }
        }

        // Lưu player
        player.save();
      }

      // Kết thúc combat
      this.endCombat(currentCombatId, playerEntityIndex);

      return {
        success: true,
        message,
      };
    }

    // Chuyển lượt
    const previousEntityIndex = combat.currentEntityIndex;
    combat.currentEntityIndex = targetEntityIndex;
    combat.currentTurn++;
    combat.turnTimeout = Date.now() + this.COMBAT_TIMEOUT;
    
    // Giảm cooldown kỹ năng nếu chuyển đến lượt của người chơi
    if (combat.currentEntityIndex !== previousEntityIndex && 
        combat.entities[combat.currentEntityIndex].type === "player") {
      const nextPlayer = this.gameData.getPlayerByGlobalId(combat.entities[combat.currentEntityIndex].id);
      if (nextPlayer) {
        // Giảm cooldown kỹ năng của người chơi tiếp theo
        const skills = nextPlayer.skill.active || [];
        let cooldownReducedCount = 0;
        
        for (let i = 0; i < skills.length; i++) {
          if (skills[i].remainingCooldown > 0) {
            skills[i].remainingCooldown--;
            if (skills[i].remainingCooldown === 0) {
              cooldownReducedCount++;
            }
          }
        }
        
        // Cập nhật lại player
        nextPlayer.save();
      }
    }

    // Nếu là PVE, quái sẽ tấn công ngay
    if (combat.type === "pve") {
      const monsterAction = this.processMonsterAction(combat, targetEntityIndex);
      message += "\n" + monsterAction.message;

      // Kiểm tra người chơi có chết không
      if (combat.entities[playerEntityIndex].hp <= 0) {
        message += `\n💀 Bạn đã bị đánh bại bởi ${targetEntity.name}!`;
        this.endCombat(currentCombatId, targetEntityIndex);
        player.status = "dead";
        player.respawnTime = Date.now() + 5 * 60 * 1000; // 5 phút hồi sinh
        player.save();
      } else {
        message += `\n🎯 Đến lượt của bạn! Còn ${Math.ceil(
          (combat.turnTimeout - Date.now()) / 1000
        )} giây để hành động.`;
      }
    }

    return {
      success: true,
      message,
    };
  }

  /**
   * Kiểm tra và kết thúc các combat quá thời gian
   */
  checkTimeouts() {
    const now = Date.now();

    for (const [combatId, combat] of this.combats.entries()) {
      if (combat.status === "active" && combat.turnTimeout < now) {
        // Hết thời gian lượt
        const currentEntity = combat.entities[combat.currentEntityIndex];

        if (currentEntity.type === "player") {
          // Người chơi bị timeout, xem như bỏ lượt
          combat.logs.push({
            time: now,
            actor: currentEntity.name,
            action: "timeout",
            message: "Hết thời gian lượt",
          });

          const previousEntityIndex = combat.currentEntityIndex;
          combat.currentEntityIndex = combat.currentEntityIndex === 0 ? 1 : 0;
          combat.currentTurn++;
          combat.turnTimeout = now + this.COMBAT_TIMEOUT;
          
          // Giảm cooldown kỹ năng nếu chuyển đến lượt của người chơi khác
          if (combat.currentEntityIndex !== previousEntityIndex && 
              combat.entities[combat.currentEntityIndex].type === "player") {
            const nextPlayer = this.gameData.getPlayerByGlobalId(combat.entities[combat.currentEntityIndex].id);
            if (nextPlayer) {
              // Giảm cooldown kỹ năng của người chơi tiếp theo
              const skills = nextPlayer.skill.active || [];
              let cooldownReducedCount = 0;
              
              for (let i = 0; i < skills.length; i++) {
                if (skills[i].remainingCooldown > 0) {
                  skills[i].remainingCooldown--;
                  if (skills[i].remainingCooldown === 0) {
                    cooldownReducedCount++;
                  }
                }
              }
              
              // Cập nhật lại player
              nextPlayer.save();
            }
          }

          // Nếu là PVE và đến lượt quái, quái sẽ tấn công
          if (combat.type === "pve" && combat.entities[combat.currentEntityIndex].type === "monster") {
            this.processMonsterAction(combat, combat.currentEntityIndex);
          }
        }
      }
    }
  }

  /**
   * Kết thúc combat
   * @param {string} combatId - ID của combat
   * @param {number} winnerIndex - Index của người thắng cuộc
   */
  endCombat(combatId, winnerIndex) {
    const combat = this.combats.get(combatId);
    if (!combat) return;

    combat.status = "ended";
    combat.endTime = Date.now();
    combat.winnerIndex = winnerIndex;

    // Xóa liên kết entity-combat
    combat.entities.forEach((entity) => {
      this.removeEntityFromCombat(entity.id, combatId);

      // Nếu là player, cập nhật thông tin
      if (entity.type === "player") {
        const player = this.gameData.getPlayerByGlobalId(entity.id);
        if (player) {
          if (player.currentCombat === combatId) {
            player.currentCombat = null;
            player.targetSelection = null;
            player.save();
          }
        }
      }
    });

    // Lưu combat vào lịch sử hoặc xóa sau 1 giờ
    setTimeout(() => {
      this.combats.delete(combatId);
    }, 60 * 60 * 1000);
  }

  /**
   * Xử lý lệnh target để chuyển đổi giữa các mục tiêu
   * @param {Player} player - Đối tượng người chơi
   * @param {Array} args - Tham số lệnh
   * @returns {Object} - Kết quả thay đổi target
   */
  handleTarget(player, args) {
    // Kiểm tra người chơi có trong combat không
    if (!this.isPlayerInCombat(player)) {
      return {
        success: false,
        message: "❌ Bạn không trong trạng thái chiến đấu!",
      };
    }

    const combats = this.getPlayerCombats(player);

    // Hiển thị danh sách combat
    if (args[0] === "list") {
      if (combats.length === 0) {
        return {
          success: true,
          message: "❌ Bạn không tham gia trận chiến nào!",
        };
      }

      let message = "🎯 DANH SÁCH MỤC TIÊU\n\n";
      let index = 1;

      for (const combatId of combats) {
        const combat = this.combats.get(combatId);
        if (!combat) continue;

        const targetIndex = combat.entities.findIndex((e) => e.id !== player.getGlobalId());
        if (targetIndex === -1) continue;

        const target = combat.entities[targetIndex];
        const isCurrent = player.currentCombat === combatId;

        message += `${isCurrent ? "▶️" : "⬛"} ${index}. ${target.name} - HP: ${target.hp}/${target.maxHp}\n`;
        index++;
      }

      if (index === 1) {
        message = "❌ Không tìm thấy mục tiêu nào!";
      } else {
        message += "\nSử dụng lệnh `target <số thứ tự>` để chọn mục tiêu.";
      }

      return {
        success: true,
        message,
      };
    }

    // Chọn mục tiêu theo index
    if (args.length > 0) {
      const targetIndex = parseInt(args[0]) - 1;

      if (isNaN(targetIndex) || targetIndex < 0 || targetIndex >= combats.length) {
        return {
          success: false,
          message: "❌ Mục tiêu không hợp lệ!",
        };
      }

      const combatId = combats[targetIndex];
      const combat = this.combats.get(combatId);

      if (!combat) {
        return {
          success: false,
          message: "❌ Không tìm thấy trận đấu!",
        };
      }

      // Cập nhật target
      player.currentCombat = combatId;

      // Tìm mục tiêu trong combat
      const targetEntityIndex = combat.entities.findIndex((e) => e.id !== player.getGlobalId());
      if (targetEntityIndex !== -1) {
        player.targetSelection = combat.entities[targetEntityIndex].id;
      }

      player.save();

      return {
        success: true,
        message: `🎯 Đã chuyển mục tiêu sang ${combat.entities[targetEntityIndex].name}!`,
      };
    }

    return {
      success: false,
      message: "❌ Sử dụng: target list | target <số thứ tự>",
    };
  }

  /**
   * Hiển thị thông tin trận đấu
   * @param {Player} player - Đối tượng người chơi
   * @returns {Object} - Kết quả hiển thị
   */
  handleCombatInfo(player) {
    // Kiểm tra người chơi có trong combat không
    if (!this.isPlayerInCombat(player)) {
      return {
        success: false,
        message: "❌ Bạn không trong trạng thái chiến đấu!",
      };
    }

    const currentCombatId = player.currentCombat;
    if (!currentCombatId || !this.combats.has(currentCombatId)) {
      return {
        success: false,
        message: "❌ Không tìm thấy trận đấu hiện tại!",
      };
    }

    const combat = this.combats.get(currentCombatId);

    // Tìm thông tin người chơi trong combat
    const playerEntityIndex = combat.entities.findIndex((e) => e.id === player.getGlobalId());
    const playerEntity = combat.entities[playerEntityIndex];

    // Tìm thông tin đối thủ trong combat
    const enemyEntityIndex = playerEntityIndex === 0 ? 1 : 0;
    const enemyEntity = combat.entities[enemyEntityIndex];

    let message = "⚔️ THÔNG TIN TRẬN ĐẤU ⚔️\n\n";

    message += `Loại trận: ${combat.type === "pve" ? "Đánh quái" : combat.type === "pvp" ? "PVP" : "Boss Thế Giới"}\n`;
    message += `Số lượt: ${combat.currentTurn}\n`;
    message += `Lượt hiện tại: ${combat.currentEntityIndex === playerEntityIndex ? "Của bạn" : "Của đối thủ"}\n\n`;

    // Thông tin người chơi
    const playerStats = playerEntity.stats || {};
    message += `👨‍🦱 ${playerEntity.name} - HP: ${playerEntity.hp}/${playerEntity.maxHp}\n`;
    message += `⚔️ ATK: ${playerStats.attack || 0}, ️ DEF: ${
      playerStats.defense || 0
    }, 🏃 SPD: ${playerStats.speed || 0}\n\n`;

    // Thông tin quái vật/đối thủ
    const enemyStats = enemyEntity.stats || {};
    let enemyAttack = 0;
    // Lấy chỉ số attack của đối thủ
    if (enemyStats.attack !== undefined) {
      enemyAttack = enemyStats.attack;
    } else if (enemyEntity.attack !== undefined) {
      enemyAttack = enemyEntity.attack;
    }

    message += `👾 ${enemyEntity.name} - HP: ${enemyEntity.hp}/${enemyEntity.maxHp}\n`;
    message += `⚔️ ATK: ${enemyAttack}, ️ DEF: ${enemyStats.defense || 0}, 🏃 SPD: ${
      enemyStats.speed || 0
    }\n\n`;

    // Hiển thị thời gian còn lại
    const timeLeft = Math.max(0, Math.ceil((combat.turnTimeout - Date.now()) / 1000));
    message += `⏱️ Thời gian còn lại: ${timeLeft} giây\n\n`;

    // Hiển thị 3 log gần nhất
    if (combat.logs.length > 0) {
      message += "📝 Diễn biến gần đây:\n";
      const recentLogs = combat.logs.slice(Math.max(0, combat.logs.length - 3));

      recentLogs.forEach((log) => {
        const timeString = new Date(log.time).toLocaleTimeString("vi-VN");

        switch (log.action) {
          case "attack":
            message += `[${timeString}] ${log.actor} tấn công ${log.target} gây ${log.damage} sát thương\n`;
            break;
          case "skill":
            message += `[${timeString}] ${log.actor} sử dụng ${log.skillName} vào ${log.target}\n`;
            break;
          case "item":
            message += `[${timeString}] ${log.actor} sử dụng ${log.itemName}\n`;
            break;
          case "timeout":
            message += `[${timeString}] ${log.actor} hết thời gian lượt\n`;
            break;
        }
      });
    }

    return {
      success: true,
      message,
    };
  }

  /**
   * Xử lý người chơi chạy trốn khỏi combat
   * @param {Player} player - Đối tượng người chơi
   * @param {Array} args - Tham số lệnh
   * @returns {Promise<Object>} - Kết quả chạy trốn
   */
  async handleFlee(player, args = []) {
    // Kiểm tra người chơi có trong combat không
    if (!this.isPlayerInCombat(player)) {
      return {
        success: false,
        message: "❌ Bạn không đang trong trận chiến nào!",
      };
    }

    // Lấy combat hiện tại
    const currentCombatId = player.currentCombat;
    if (!currentCombatId || !this.combats.has(currentCombatId)) {
      return {
        success: false,
        message: "❌ Không tìm thấy trận đấu hiện tại!",
      };
    }

    const combat = this.combats.get(currentCombatId);

    // Kiểm tra nếu là PVP
    if (combat.type === "pvp") {
      // Xử lý flee trong PVP (có nút chấp nhận/từ chối)
      return await this.handlePvpFlee(player, combat, args);
    } else {
      // Xử lý flee trong PVE
      return await this.handlePveFlee(player, combat);
    }
  }

  /**
   * Xử lý người chơi chạy trốn khỏi combat PVE
   * @param {Player} player - Đối tượng người chơi
   * @param {Object} combat - Combat instance
   * @returns {Object} - Kết quả chạy trốn
   */
  async handlePveFlee(player, combat) {
    const playerEntityIndex = combat.entities.findIndex((e) => e.id === player.getGlobalId());
    if (playerEntityIndex === -1) {
      return {
        success: false,
        message: "❌ Không tìm thấy thông tin người chơi trong trận đấu!",
      };
    }

    // Tìm mục tiêu (quái vật)
    const monsterEntityIndex = playerEntityIndex === 0 ? 1 : 0;
    const monster = combat.entities[monsterEntityIndex];

    // Tính tỉ lệ thành công dựa vào chỉ số so với quái vật
    const playerPower = player.getCombatPower();
    const monsterPower = monster.stats.attack + monster.stats.defense + monster.stats.speed;

    // Tỉ lệ cơ bản là 50%, thay đổi theo sức mạnh
    let fleeChance = 0.5;

    // Nếu người chơi mạnh hơn, tăng tỉ lệ
    if (playerPower > monsterPower) {
      fleeChance += (playerPower / monsterPower - 1) * 0.3;
    } else {
      // Nếu yếu hơn, giảm tỉ lệ
      fleeChance -= (monsterPower / playerPower - 1) * 0.3;
    }

    // Giới hạn tỉ lệ từ 20% đến 80%
    fleeChance = Math.max(0.2, Math.min(0.8, fleeChance));

    // Thử chạy trốn
    if (Math.random() < fleeChance) {
      // Thành công
      this.endCombat(combat.id);

      // Ghi nhật ký
      combat.logs.push({
        time: Date.now(),
        actor: player.getName(),
        action: "flee_success",
        text: `${player.getName()} đã chạy trốn thành công!`,
      });

      return {
        success: true,
        message: `✅ Bạn đã chạy trốn thành công khỏi ${monster.name}!`,
      };
    } else {
      // Thất bại - quái vật tấn công gấp đôi sát thương
      const playerEntity = combat.entities[playerEntityIndex];

      // Tính toán sát thương
      const baseDamage = Math.max(1, monster.stats.attack - player.stat.defense / 3);
      const fleeDamage = Math.floor(baseDamage * 2 * (0.9 + Math.random() * 0.2)); // 90-110% sát thương và gấp đôi

      // Trừ HP của người chơi
      playerEntity.hp = Math.max(0, playerEntity.hp - fleeDamage);
      player.stat.hp.current = playerEntity.hp;
      player.save();

      // Ghi nhật ký
      combat.logs.push({
        time: Date.now(),
        actor: monster.name,
        action: "flee_attack",
        target: player.getName(),
        damage: fleeDamage,
        remainingHp: playerEntity.hp,
        text: `${player.getName()} thử chạy trốn nhưng thất bại! ${
          monster.name
        } tấn công gây ${fleeDamage} sát thương!`,
      });

      // Chuyển lượt
      combat.currentEntityIndex = monsterEntityIndex;
      combat.currentTurn++;
      combat.turnTimeout = Date.now() + this.COMBAT_TIMEOUT;

      // Kiểm tra người chơi đã chết chưa
      if (playerEntity.hp <= 0) {
        const endResult = await this.endCombat(combat.id, monsterEntityIndex);
        player.status = "dead";
        player.respawnTime = Date.now() + 5 * 60 * 1000; // 5 phút hồi sinh
        player.save();

        return {
          success: false,
          message:
            `❌ Bạn thử chạy trốn nhưng thất bại! ${monster.name} tấn công bạn gây ${fleeDamage} sát thương!\n\n` +
            `💀 Bạn đã bị đánh bại bởi ${monster.name}!`,
        };
      }

      return {
        success: false,
        message:
          `❌ Bạn thử chạy trốn nhưng thất bại! ${monster.name} tấn công bạn gây ${fleeDamage} sát thương!\n\n` +
          `🧙 Bạn: HP ${playerEntity.hp}/${playerEntity.maxHp}\n` +
          `👹 ${monster.name}: HP ${monster.hp}/${monster.maxHp}\n\n` +
          `🎯 Đến lượt của ${monster.name}!`,
      };
    }
  }

  /**
   * Xử lý người chơi chạy trốn khỏi combat PVP
   * @param {Player} player - Đối tượng người chơi
   * @param {Object} combat - Combat instance
   * @param {Array} args - Tham số lệnh
   * @returns {Object} - Kết quả chạy trốn
   */
  async handlePvpFlee(player, combat, args = []) {
    const playerEntityIndex = combat.entities.findIndex((e) => e.id === player.getGlobalId());
    if (playerEntityIndex === -1) {
      return {
        success: false,
        message: "❌ Không tìm thấy thông tin người chơi trong trận đấu!",
      };
    }

    // Tìm đối thủ
    const opponentEntityIndex = playerEntityIndex === 0 ? 1 : 0;
    const opponentEntity = combat.entities[opponentEntityIndex];

    // Kiểm tra nếu đang xử lý một yêu cầu accept/reject flee
    if (args.length > 0) {
      const subCommand = args[0].toLowerCase();

      if (this.fleeRequests.has(combat.id)) {
        const fleeRequest = this.fleeRequests.get(combat.id);

        // Nếu người chơi là target của flee request
        if (fleeRequest.targetId === player.getGlobalId()) {
          if (subCommand === "accept") {
            // Chấp nhận cho đối thủ bỏ chạy
            this.fleeRequests.delete(combat.id);

            // Ghi nhật ký
            combat.logs.push({
              time: Date.now(),
              actor: player.getName(),
              action: "flee_accept",
              text: `${player.getName()} chấp nhận cho đối thủ bỏ chạy.`,
            });

            // Kết thúc trận đấu hòa
            this.endCombat(combat.id, null, "draw");

            return {
              success: true,
              message: `✅ Bạn đã chấp nhận cho ${opponentEntity.name} bỏ chạy. Trận đấu kết thúc hòa.`,
            };
          } else if (subCommand === "reject") {
            // Từ chối cho đối thủ bỏ chạy
            this.fleeRequests.delete(combat.id);

            // Ghi nhật ký
            combat.logs.push({
              time: Date.now(),
              actor: player.getName(),
              action: "flee_reject",
              text: `${player.getName()} từ chối cho đối thủ bỏ chạy.`,
            });

            return {
              success: true,
              message: `✅ Bạn đã từ chối cho ${opponentEntity.name} bỏ chạy. Trận đấu tiếp tục.`,
            };
          }
        }
      }
    }

    // Nếu đã có yêu cầu flee của chính người chơi này
    if (this.fleeRequests.has(combat.id) && this.fleeRequests.get(combat.id).requesterId === player.getGlobalId()) {
      return {
        success: false,
        message: "❌ Bạn đã gửi yêu cầu đầu hàng. Hãy đợi phản hồi từ đối thủ!",
      };
    }

    // Tạo yêu cầu flee mới
    this.fleeRequests.set(combat.id, {
      requesterId: player.getGlobalId(),
      requesterName: player.getName(),
      targetId: opponentEntity.id,
      targetName: opponentEntity.name,
      timestamp: Date.now(),
    });

    // Đặt timeout để tự động xóa yêu cầu sau một khoảng thời gian
    setTimeout(() => {
      if (this.fleeRequests.has(combat.id) && this.fleeRequests.get(combat.id).requesterId === player.getGlobalId()) {
        this.fleeRequests.delete(combat.id);
      }
    }, this.FLEE_REQUEST_TIMEOUT);

    // Ghi nhật ký
    combat.logs.push({
      time: Date.now(),
      actor: player.getName(),
      action: "flee_request",
      text: `${player.getName()} yêu cầu đầu hàng.`,
    });

    return {
      success: true,
      message:
        `🏳️ Bạn đã gửi yêu cầu đầu hàng tới ${opponentEntity.name}.\n` +
        `Đối thủ có thể sử dụng lệnh 'flee accept' để chấp nhận hoặc 'flee reject' để từ chối.\n` +
        `Yêu cầu sẽ tự động hết hạn sau ${this.FLEE_REQUEST_TIMEOUT / 1000} giây.`,
    };
  }
}

let instance = null;

export function getCombatServiceInstance() {
  if (!instance) {
    instance = new CombatService();
  }
  return instance;
}
