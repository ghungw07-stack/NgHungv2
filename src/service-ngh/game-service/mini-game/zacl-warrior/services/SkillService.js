/**
 * SkillService.js
 * Service xử lý các thao tác liên quan đến kỹ năng
 */

import { getGameDataInstance } from "../core/GameData.js";
import { getGameManagerInstance } from "../core/GameManager.js";
import { getServiceRegistry } from "./ServiceRegistry.js";
import Player from "../models/Player.js";

export class SkillService {
  constructor() {
    /** @type {import('../core/GameData.js').GameData} */
    this.gameData = getGameDataInstance();

    /** @type {import('../core/GameManager.js').GameManager} */
    this.gameManager = getGameManagerInstance();

    // Lấy registry để truy cập các service khi cần
    this._registry = getServiceRegistry();

    // Cache skill data
    this.cachedSkills = null;
  }

  /**
   * Lấy thông tin đầy đủ của kỹ năng từ file data
   * @param {string} skillId - ID của kỹ năng
   * @returns {Promise<Object|null>} Thông tin kỹ năng hoặc null nếu không tìm thấy
   */
  async getFullSkillData(skillId) {
    if (!this.cachedSkills) {
      const skillsData = await this.gameManager.getSkillsData();
      if (skillsData && skillsData.skills) {
        this.cachedSkills = skillsData.skills;
      } else {
        return null;
      }
    }

    return this.cachedSkills.find((skill) => skill.id === skillId);
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
   * Lấy NpcService
   * @returns {import('./NpcService.js').NpcService}
   */
  get npcService() {
    return this.getService("NpcService");
  }

  /**
   * Lấy AreaService
   * @returns {import('./AreaService.js').AreaService}
   */
  get areaService() {
    return this.getService("AreaService");
  }

  /**
   * Lấy QuestService
   * @returns {import('./QuestService.js').QuestService}
   */
  get questService() {
    return this.getService("QuestService");
  }

  /**
   * Lấy CombatService
   * @returns {import('./CombatService.js').CombatService}
   */
  get combatService() {
    return this.getService("CombatService");
  }

  /**
   * Xử lý lệnh kỹ năng
   * @param {Player} player - Đối tượng người chơi
   * @param {Array} args - Tham số lệnh
   * @returns {Promise<Object>} Kết quả xử lý
   */
  async handleSkill(player, args = []) {
    // Kiểm tra xem người chơi có đang trong trận đấu không
    const isPlayerInCombat = this.combatService.isPlayerInCombat(player);

    // Nếu không có tham số, hiển thị danh sách kỹ năng
    if (!args.length) {
      return this.showSkillList(player);
    }

    // Xử lý lệnh nâng cấp kỹ năng (chỉ áp dụng ngoài combat)
    if (!isPlayerInCombat && args[0].toLowerCase() === "upgrade") {
      if (args.length < 2) {
        return {
          success: false,
          message: "❌ Vui lòng nhập tên kỹ năng cần nâng cấp!",
        };
      }
      const skillName = args.slice(1).join(" ");
      return await this.upgradeSkill(player, skillName);
    }

    // Xử lý lệnh xem thông tin hoặc sử dụng kỹ năng
    const skillName = args.join(" ").toLowerCase();

    // Tìm kỹ năng trong cả active và passive
    let skill = null;
    const activeSkills = player.skill.active || [];
    const passiveSkills = player.skill.passive || [];
    const allSkills = [...activeSkills, ...passiveSkills];

    skill = allSkills.find(
      (s) => s.name.toLowerCase() === skillName.toLowerCase() || s.id.toLowerCase() === skillName.toLowerCase()
    );

    // Nếu không tìm thấy kỹ năng
    if (!skill) {
      return {
        success: false,
        message: "❌ Bạn chưa học kỹ năng này hoặc kỹ năng không tồn tại!",
      };
    }

    // Nếu đang trong trận đấu, sử dụng kỹ năng để tấn công
    if (isPlayerInCombat) {
      // Chỉ cho phép sử dụng kỹ năng chủ động trong combat
      if (skill.type !== "active" && skill.type !== "ultimate") {
        return {
          success: false,
          message: "❌ Không thể sử dụng kỹ năng thụ động trong chiến đấu!",
        };
      }

      // Kiểm tra hồi chiêu
      if (skill.remainingCooldown && skill.remainingCooldown > 0) {
        return {
          success: false,
          message: `❌ Kỹ năng đang hồi chiêu! (Còn ${skill.remainingCooldown} lượt)`,
        };
      }

      // Kiểm tra MP
      if (skill.mpCost > player.stat.mp.current) {
        return {
          success: false,
          message: "❌ Không đủ MP để sử dụng kỹ năng!",
        };
      }

      // Lấy thông tin combat hiện tại
      const currentCombatId = player.currentCombat;
      if (!currentCombatId || !this.combatService.combats.has(currentCombatId)) {
        return {
          success: false,
          message: "❌ Không tìm thấy thông tin trận đấu hiện tại!",
        };
      }

      const combat = this.combatService.combats.get(currentCombatId);

      // Kiểm tra lượt hiện tại có phải của người chơi không
      const playerEntityIndex = combat.entities.findIndex((e) => e.id === player.getGlobalId());
      if (playerEntityIndex === -1 || combat.currentEntityIndex !== playerEntityIndex) {
        return {
          success: false,
          message: "❌ Chưa đến lượt của bạn!",
        };
      }

      // Xử lý tấn công bằng kỹ năng
      return await this.processSkillAttack(player, skill, combat);
    }
    // Nếu không trong combat, hiển thị thông tin kỹ năng
    else {
      return await this.showSkillInfo(player, skillName);
    }
  }

  /**
   * Xử lý tấn công bằng kỹ năng trong combat
   * @param {Player} player - Đối tượng người chơi
   * @param {Object} skill - Kỹ năng sử dụng
   * @param {Object} combat - Combat instance
   * @returns {Promise<Object>} - Kết quả xử lý
   */
  async processSkillAttack(player, skill, combat) {
    const playerEntityIndex = combat.entities.findIndex((e) => e.id === player.getGlobalId());
    const targetEntityIndex = playerEntityIndex === 0 ? 1 : 0;
    const targetEntity = combat.entities[targetEntityIndex];
    const currentCombatId = combat.id;

    // Lấy dữ liệu kỹ năng đầy đủ từ file data
    const fullSkillData = await this.getFullSkillData(skill.id);

    // Tiêu hao MP
    player.stat.mp.current -= skill.mpCost;
    combat.entities[playerEntityIndex].mp = player.stat.mp.current;

    // Đặt kỹ năng vào trạng thái hồi chiêu
    skill.remainingCooldown = skill.cooldownTurns || 0;

    // Tính toán sát thương
    const playerStats = player.getBaseStats();

    let attackStat = playerStats.attack || player.stat.attack || 1;

    let defenseStat = 0;
    if (targetEntity.stats && targetEntity.stats.defense !== undefined && !isNaN(targetEntity.stats.defense)) {
      defenseStat = targetEntity.stats.defense;
    } else if (targetEntity.defense !== undefined && !isNaN(targetEntity.defense)) {
      defenseStat = targetEntity.defense;
    } else {
      defenseStat = 0;
      console.error("Target missing defense stat:", targetEntity.name || targetEntity.id);
    }

    // Tính damage base dựa trên công thức cơ bản
    const baseDamage = Math.max(1, attackStat - defenseStat / 3);

    // Lấy hệ số sát thương từ dữ liệu đầy đủ của kỹ năng nếu có
    const skillDamageMultiplier = fullSkillData?.damageMultiplier || skill.damageMultiplier || 1.5;

    // Tính toán sát thương với hệ số kỹ năng (90-110% từ giá trị cơ bản)
    const randomFactor = 0.9 + Math.random() * 0.2;
    const damage = Math.floor(baseDamage * randomFactor * skillDamageMultiplier);

    // Trừ HP của target
    targetEntity.hp = Math.max(0, targetEntity.hp - damage);

    // Lưu lại thông tin sát thương để sử dụng cho hiệu ứng sau này
    targetEntity.lastDamage = damage;

    // Ghi nhật ký
    combat.logs.push({
      time: Date.now(),
      actor: player.getName(),
      action: "skill",
      skillName: skill.name,
      target: targetEntity.name,
      damage,
      remainingHp: targetEntity.hp,
    });

    // Lưu thông tin item đã sử dụng trong lượt
    combat.itemUsedThisTurn = {
      used: false,
      item: null,
    };

    let message = `✨ Bạn sử dụng ${skill.name} tấn công ${targetEntity.name} và gây ra ${damage} sát thương!\n\n`;
    message += `🔴 HP của ${targetEntity.name} còn ${targetEntity.hp}/${targetEntity.maxHp}\n`;

    // Xử lý hiệu ứng kỹ năng (nếu có)
    if (skill.effects) {
      const effectMessages = this.processSkillEffects(player, targetEntity, skill);
      if (effectMessages.length > 0) {
        message += "\n🌟 Hiệu ứng kỹ năng:\n" + effectMessages.join("\n") + "\n";
      }
    }

    // Kiểm tra target đã chết chưa
    if (targetEntity.hp <= 0) {
      // Target đã chết
      message += `\n🏆 Bạn đã đánh bại ${targetEntity.name}!`;

      // Nếu là PVE, thêm phần thưởng và cập nhật nhiệm vụ
      if (combat.type === "pve") {
        const monster = combat.monsterData;

        // Cập nhật tiến trình nhiệm vụ giết quái
        const questService = this.getService("QuestService");
        if (questService) {
          const questProgress = await questService.updateQuestProgressWithDetails(player, "kill", monster.id, 1);

          if (questProgress && questProgress.updated) {
            const completedQuests = questProgress.completedQuests || [];
            const progressedQuests = questProgress.progressedQuests || [];

            if (completedQuests.length > 0) {
              completedQuests.forEach((quest) => {
                message += `\n📜✅ Hoàn thành nhiệm vụ: ${quest.name}!`;
              });
            }

            if (progressedQuests.length > 0) {
              progressedQuests.forEach((progress) => {
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
        let dropRate = this.combatService.monsterService.NORMAL_DROP_RATE;

        if (monster.isElite) {
          dropRate = this.combatService.monsterService.ELITE_DROP_RATE;
        } else if (monster.isEnchanted) {
          dropRate = this.combatService.monsterService.ENCHANTED_DROP_RATE;
        } else if (monster.isBoss) {
          dropRate = this.combatService.monsterService.BOSS_DROP_RATE;
        }

        if (Math.random() < dropRate) {
          // Rơi đồ ngẫu nhiên phù hợp với level
          const items = this.gameData
            .getItemsData()
            .items.filter((item) => item.levelReq <= player.stat.level && item.levelReq >= player.stat.level - 5);

          if (items.length > 0) {
            const randomItem = items[Math.floor(Math.random() * items.length)];

            // Thêm vào túi đồ
            if (!player.bag)
              player.bag = {
                maxSlots: 20,
                item: [],
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
      this.combatService.endCombat(currentCombatId, playerEntityIndex);

      return {
        success: true,
        message,
      };
    }

    // Chuyển lượt
    const previousEntityIndex = combat.currentEntityIndex;
    combat.currentEntityIndex = targetEntityIndex;
    combat.currentTurn++;
    combat.turnTimeout = Date.now() + this.combatService.COMBAT_TIMEOUT;

    // Giảm cooldown kỹ năng nếu chuyển đến lượt của người chơi khác
    if (
      combat.currentEntityIndex !== previousEntityIndex &&
      combat.entities[combat.currentEntityIndex].type === "player"
    ) {
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
      const monsterAction = this.combatService.processMonsterAction(combat, targetEntityIndex);
      message += "\n" + monsterAction.message;

      // Kiểm tra người chơi có chết không
      if (combat.entities[playerEntityIndex].hp <= 0) {
        message += `\n💀 Bạn đã bị đánh bại bởi ${targetEntity.name}!`;
        this.combatService.endCombat(currentCombatId, targetEntityIndex);
        player.status = "dead";
        player.respawnTime = Date.now() + 5 * 60 * 1000; // 5 phút hồi sinh
        player.save();
      } else {
        message += `\n🎯 Đến lượt của bạn! Còn ${Math.ceil(
          (combat.turnTimeout - Date.now()) / 1000
        )} giây để hành động.`;
      }
    }

    // Lưu lại thay đổi của player
    this.gameData.markPlayerDataChanged();
    player.save();

    return {
      success: true,
      message,
    };
  }

  /**
   * Xử lý hiệu ứng kỹ năng
   * @param {Object} player - Đối tượng người chơi
   * @param {Object} target - Đối tượng mục tiêu
   * @param {Object} skill - Kỹ năng sử dụng
   * @returns {Array} - Các thông báo hiệu ứng
   */
  async processSkillEffects(player, target, skill) {
    const messages = [];

    // Lấy thông tin đầy đủ của kỹ năng từ file data
    const fullSkillData = await this.getFullSkillData(skill.id);
    const skillEffects = fullSkillData?.effects || skill.effects;

    if (!skillEffects) return messages;

    // Xử lý hiệu ứng DOT (Damage Over Time)
    if (skillEffects.dot) {
      const dot = skillEffects.dot;
      const dotDamage = dot.damage * (skill.level || 1);
      const dotTurns = dot.turns || 1;

      if (!target.dots) target.dots = [];

      target.dots.push({
        name: skill.name,
        damage: dotDamage,
        turnsLeft: dotTurns,
        element: dot.element,
      });

      let dotMessage = `🔥 Gây ${dotDamage} sát thương mỗi lượt trong ${dotTurns} lượt`;
      if (dot.element) {
        dotMessage += ` (${this.getElementName(dot.element)})`;
      }
      messages.push(dotMessage);
    }

    // Xử lý hiệu ứng làm chậm
    if (skillEffects.slow) {
      const slow = skillEffects.slow;
      const slowChance = slow.chance || 0.25;

      if (Math.random() <= slowChance) {
        if (!target.debuffs) target.debuffs = [];

        target.debuffs.push({
          name: "slow",
          value: slow.amount,
          turnsLeft: slow.turns || 1,
        });

        messages.push(`❄️ Làm chậm đối thủ ${slow.amount}% trong ${slow.turns} lượt`);
      }
    }

    // Xử lý hiệu ứng choáng
    if (skillEffects.stun) {
      const stun = skillEffects.stun;
      const stunChance = stun.chance || 0.25;

      if (Math.random() <= stunChance) {
        if (!target.debuffs) target.debuffs = [];

        target.debuffs.push({
          name: "stun",
          turnsLeft: stun.turns || 1,
        });

        messages.push(`⚡ Làm choáng đối thủ trong ${stun.turns} lượt`);
      }
    }

    // Xử lý hiệu ứng hút máu
    if (skillEffects.lifesteal) {
      const lifesteal = skillEffects.lifesteal;
      // Sử dụng lastDamage đã được lưu trước đó
      const lastDamage = target.lastDamage || 0;
      const healAmount = Math.floor((lifesteal.percent / 100) * lastDamage);

      if (healAmount > 0) {
        player.stat.hp.current = Math.min(player.stat.hp.current + healAmount, player.stat.hp.max);
        messages.push(`💉 Hút ${healAmount} HP từ đối thủ`);
      }
    }

    return messages;
  }

  /**
   * Chuyển đổi tên element sang tiếng Việt
   * @param {string} element - Tên element
   * @returns {string} Tên element tiếng Việt
   */
  getElementName(element) {
    const elementMap = {
      fire: "Hỏa",
      water: "Thủy",
      earth: "Thổ",
      air: "Phong",
      light: "Quang",
      dark: "Ám",
    };
    return elementMap[element] || element;
  }

  /**
   * Xử lý lệnh học kỹ năng từ NPC
   * @param {Player} player - Đối tượng người chơi
   * @param {string|Array} args - Tên kỹ năng hoặc tên NPC, hoặc mảng các tham số
   * @returns {Promise<Object>} Kết quả xử lý
   */
  async handleLearnCommand(player, args) {
    if (typeof args === "string") {
      args = args.split(/\s+/);
    } else if (!Array.isArray(args)) {
      args = [];
    }

    const currentArea = this.areaService.findAreaByNameOrId(player.currentArea);
    if (!currentArea) {
      return {
        success: false,
        message: "❌ Không thể xác định khu vực hiện tại của bạn!",
      };
    }

    const npcsData = await this.gameManager.getNpcsData();
    const npcsInArea = currentArea.npcs || [];

    const trainers = npcsInArea
      .filter((npc) => {
        const fullNpcData = npcsData.npcs.find((n) => n.id === npc.id);
        return (
          fullNpcData &&
          (fullNpcData.type === "trainer" ||
            fullNpcData.role === "trainer" ||
            (fullNpcData.skills && Array.isArray(fullNpcData.skills) && fullNpcData.skills.length > 0))
        );
      })
      .map((npc) => {
        const fullNpcData = npcsData.npcs.find((n) => n.id === npc.id);
        return fullNpcData;
      });

    if (trainers.length === 0) {
      return {
        success: false,
        message: "❌ Không có huấn luyện viên nào trong khu vực này để dạy kỹ năng!",
      };
    }

    if (!args.length) {
      let message = "👨‍🏫 Các huấn luyện viên trong khu vực:\n\n";

      trainers.forEach((trainer, index) => {
        message += `${index + 1}. ${trainer.name} (${trainer.id})\n`;
        message += `   ${trainer.description || "Huấn luyện viên kỹ năng"}\n\n`;
      });

      message += "Sử dụng lệnh `learn [tên huấn luyện viên]` để xem danh sách kỹ năng có thể học.";
      return { success: true, message };
    }

    // Lấy các skill từ cơ sở dữ liệu
    const skillsData = await this.gameManager.getSkillsData();
    if (!skillsData || !skillsData.skills) {
      return {
        success: false,
        message: "❌ Không thể tải dữ liệu kỹ năng!",
      };
    }

    const searchTerm = args.join(" ").toLowerCase();
    const trainer = trainers.find((t) => t.id.toLowerCase() === searchTerm || t.name.toLowerCase() === searchTerm);
    if (trainer) {
      const learnableSkills = this.getLearnableSkills(player, trainer, skillsData.skills);
      return {
        success: true,
        message: this.formatLearnableSkillsList(learnableSkills, trainer),
      };
    }

    const skillToLearn = skillsData.skills.find(
      (s) =>
        s.name.toLowerCase() === searchTerm ||
        s.id.toLowerCase() === searchTerm ||
        (s.id.toLowerCase().includes(searchTerm) && searchTerm.length > 3)
    );

    if (!skillToLearn) {
      return {
        success: false,
        message: `❌ Không tìm thấy kỹ năng hoặc huấn luyện viên có tên "${args.join(" ")}"`,
      };
    }

    const availableTrainers = trainers.filter(
      (t) =>
        t.skills &&
        Array.isArray(t.skills) &&
        t.skills.some(
          (skillId) =>
            skillId === skillToLearn.id ||
            skillToLearn.id.includes(skillId) ||
            skillId.includes(skillToLearn.id.replace("skill_", ""))
        )
    );

    if (availableTrainers.length === 0) {
      return {
        success: false,
        message: `❌ Không có huấn luyện viên nào trong khu vực này có thể dạy kỹ năng "${skillToLearn.name}"`,
      };
    }

    return await this.learnSkill(player, skillToLearn, availableTrainers[0]);
  }

  /**
   * Lấy danh sách kỹ năng có thể học từ một huấn luyện viên
   * @param {Player} player - Đối tượng người chơi
   * @param {Object} trainer - Thông tin huấn luyện viên
   * @param {Array} skills - Danh sách tất cả kỹ năng
   * @returns {Array} Danh sách kỹ năng có thể học
   */
  getLearnableSkills(player, trainer, skills) {
    if (!trainer.skills || !Array.isArray(trainer.skills) || trainer.skills.length === 0) {
      return [];
    }

    // Lọc những kỹ năng mà huấn luyện viên này có thể dạy
    const trainerSkills = skills.filter((skill) => {
      if (!skill) return false;

      // Kiểm tra xem huấn luyện viên có thể dạy kỹ năng này không
      return trainer.skills.some((trainerSkillId) => {
        return (
          skill.id === trainerSkillId ||
          skill.id === `skill_${trainerSkillId}` ||
          skill.id.replace("skill_", "") === trainerSkillId
        );
      });
    });

    // Kiểm tra từng kỹ năng xem người chơi có thể học không
    const learnableSkills = trainerSkills.map((skill) => {
      const checkResult = this.canLearnSkill(player, skill);
      return {
        ...skill,
        canLearn: checkResult.canLearn,
        reason: checkResult.reason || null,
      };
    });

    return learnableSkills;
  }

  /**
   * Kiểm tra xem người chơi có thể học kỹ năng không
   * @param {Player} player - Đối tượng người chơi
   * @param {Object} skill - Thông tin kỹ năng
   * @returns {Object} Kết quả kiểm tra {canLearn, reason}
   */
  canLearnSkill(player, skill) {
    // Kiểm tra skill có hợp lệ không
    if (!skill) {
      return {
        canLearn: false,
        reason: `Không tìm thấy thông tin kỹ năng.`,
      };
    }

    // Đảm bảo player.skill tồn tại
    if (!player.skill) {
      player.skill = {
        active: [],
        passive: [],
      };
    }

    // Kiểm tra đã học kỹ năng này chưa
    const allSkills = [...(player.skill.active || []), ...(player.skill.passive || [])];
    if (allSkills.some((s) => s.id === skill.id)) {
      return {
        canLearn: false,
        reason: "Bạn đã học kỹ năng này rồi.",
      };
    }

    // Kiểm tra cấp độ
    if (skill.levelRequired && player.stat.level < skill.levelRequired) {
      return {
        canLearn: false,
        reason: `Bạn cần đạt cấp độ ${skill.levelRequired} để học kỹ năng này.`,
      };
    }

    // Kiểm tra điểm kỹ năng
    if (skill.skillPoint && (!player.stat.skillPoint || player.stat.skillPoint < skill.skillPoint)) {
      return {
        canLearn: false,
        reason: `Không đủ điểm kỹ năng! (Cần ${skill.skillPoint} điểm)`,
      };
    }

    // Kiểm tra chi phí
    if (skill.cost) {
      if (skill.cost.gold && (!player.money || player.money.gold < skill.cost.gold)) {
        return {
          canLearn: false,
          reason: `Bạn cần có ${skill.cost.gold} vàng để học kỹ năng này.`,
        };
      }

      if (skill.cost.diamond && (!player.money || !player.money.diamond || player.money.diamond < skill.cost.diamond)) {
        return {
          canLearn: false,
          reason: `Bạn cần có ${skill.cost.diamond} kim cương để học kỹ năng này.`,
        };
      }
    }

    // Kiểm tra các yêu cầu thuộc tính
    if (skill.requirements) {
      const unmetConditions = [];

      if (skill.requirements.hp && player.stat.hp.max < skill.requirements.hp) {
        unmetConditions.push(`- Đạt tối thiểu ${skill.requirements.hp} HP`);
      }
      if (skill.requirements.attack && player.stat.attack < skill.requirements.attack) {
        unmetConditions.push(`- Đạt tối thiểu ${skill.requirements.attack} ATK`);
      }
      if (skill.requirements.defense && player.stat.defense < skill.requirements.defense) {
        unmetConditions.push(`- Đạt tối thiểu ${skill.requirements.defense} DEF`);
      }

      // Kiểm tra kỹ năng tiên quyết
      if (skill.requirements.prerequisites && Array.isArray(skill.requirements.prerequisites)) {
        for (const preSkillId of skill.requirements.prerequisites) {
          const hasSkill = allSkills.some(
            (s) => s.id === preSkillId || s.id === `skill_${preSkillId}` || s.id.replace("skill_", "") === preSkillId
          );

          if (!hasSkill) {
            unmetConditions.push(`- Học kỹ năng tiên quyết "${preSkillId}"`);
          }
        }
      }

      if (unmetConditions.length > 0) {
        return {
          canLearn: false,
          reason: `Bạn chưa đủ điều kiện:\n${unmetConditions.join("\n")}`,
        };
      }
    }

    return { canLearn: true };
  }

  /**
   * Định dạng danh sách kỹ năng có thể học
   * @param {Array} learnableSkills - Danh sách kỹ năng có thể học
   * @param {Object} trainer - Thông tin huấn luyện viên
   * @returns {string} Thông điệp hiển thị
   */
  formatLearnableSkillsList(learnableSkills, trainer) {
    if (!learnableSkills || learnableSkills.length === 0) {
      return `${trainer.name}: Ta không còn gì để dạy cho con, hãy vươn mình ra sóng lớn, chúc con may mắn.`;
    }

    let message = `📚 DANH SÁCH KỸ NĂNG ${trainer.name.toUpperCase()} CÓ THỂ DẠY:\n`;
    message += "━━━━━━━━━━━━━━━\n\n";

    // Sắp xếp kỹ năng theo cấp độ yêu cầu
    learnableSkills.sort((a, b) => {
      const aLevel = a.levelRequired || 0;
      const bLevel = b.levelRequired || 0;
      return aLevel - bLevel;
    });

    learnableSkills.forEach((skill, index) => {
      // Icon dựa vào loại kỹ năng
      let typeIcon = skill.type === "passive" ? "🔹" : "🔸";

      message += `${typeIcon} ${index + 1}. ${skill.name} (ID: ${skill.id})\n`;
      message += `   ${skill.description || "Không có mô tả"}\n`;
      message += `   ${skill.type === "passive" ? "Kỹ năng thụ động" : "Kỹ năng chủ động"}`;

      // Tiêu Hao và cooldown
      if (skill.mpCost || skill.cooldownTurns) {
        message += "\n   ";
        if (skill.mpCost) {
          message += `💙 Tiêu hao: ${skill.mpCost} MP`;
        }
        if (skill.cooldownTurns) {
          if (skill.mpCost) message += " | ";
          message += `⏱️ Hồi chiêu: ${skill.cooldownTurns} lượt`;
        }
      }
      message += "\n";

      // Hiển thị hiệu ứng nếu có
      if (skill.effects && skill.effects.length > 0) {
        message += "   ✨ Hiệu ứng:\n";
        skill.effects.forEach((effect) => {
          message += `      • ${effect.description}\n`;
        });
      }

      // Yêu cầu học
      message += "   📋 Yêu cầu:\n";
      if (skill.levelRequired) {
        message += `      • Cấp độ: ${skill.levelRequired}\n`;
      }
      if (skill.skillPoint) {
        message += `      • Điểm kỹ năng: ${skill.skillPoint}\n`;
      }
      if (skill.cost) {
        if (skill.cost.gold) {
          message += `      • Vàng: ${skill.cost.gold}\n`;
        }
        if (skill.cost.diamond) {
          message += `      • Kim cương: ${skill.cost.diamond}\n`;
        }
      }
      if (skill.requirements) {
        if (skill.requirements.hp) {
          message += `      • HP tối thiểu: ${skill.requirements.hp}\n`;
        }
        if (skill.requirements.attack) {
          message += `      • ATK tối thiểu: ${skill.requirements.attack}\n`;
        }
        if (skill.requirements.defense) {
          message += `      • DEF tối thiểu: ${skill.requirements.defense}\n`;
        }
      }

      // Trạng thái có thể học hay không
      if (!skill.canLearn) {
        message += `   ❌ ${skill.reason}\n`;
      } else {
        message += `   ✅ Bạn đã đủ điều kiện để học kỹ năng này!\n`;
      }

      message += "\n";
    });

    message += "━━━━━━━━━━━━━━━\n";
    message += "Sử dụng `learn [tên kỹ năng]` để học kỹ năng.";

    return message;
  }

  /**
   * Học kỹ năng mới
   * @param {Player} player - Đối tượng người chơi
   * @param {Object} skill - Thông tin kỹ năng
   * @param {Object} trainer - Huấn luyện viên dạy kỹ năng
   * @returns {Promise<Object>} Kết quả xử lý
   */
  async learnSkill(player, skill, trainer) {
    const check = this.canLearnSkill(player, skill);
    if (!check.canLearn) {
      return {
        success: false,
        message: `${trainer.name}: ${check.reason}`,
      };
    }

    if (skill.skillPoint) {
      player.stat.skillPoint -= skill.skillPoint;
    }

    if (skill.cost) {
      if (skill.cost.gold) {
        player.money.gold -= skill.cost.gold;
      }

      if (skill.cost.diamond) {
        if (!player.money.diamond) player.money.diamond = 0;
        player.money.diamond -= skill.cost.diamond;
      }
    }

    const skillType = skill.type === "passive" ? "passive" : "active";
    const newSkill = {
      id: skill.id,
      name: skill.name,
      type: skill.type,
      description: skill.description,
      level: 1,
      maxLevel: skill.maxLevel || 10,
      cooldownTurns: skill.cooldownTurns || 0,
      remainingCooldown: 0,
      mpCost: skill.mpCost || 0,
      effects: skill.effects,
      levelRequired: skill.levelRequired,
      upgradePoint: skill.upgradePoint,
      cost: skill.cost,
    };

    if (!player.skill[skillType]) {
      player.skill[skillType] = [];
    }
    player.skill[skillType].push(newSkill);

    this.gameData.markPlayerDataChanged();

    let message = `${trainer.name}: Chúc mừng! Ngươi đã học được kỹ năng ${skill.name}!\n\n`;
    message += `✨ ${skill.description || "Không có mô tả"}\n\n`;

    if (this.questService) {
      try {
        const questResult = await this.questService.handleQuestProgressComplete(player, "learn", skill.id, 1);

        if (questResult.success && questResult.message) {
          message += questResult.message + "\n\n";
        }
      } catch (error) {
        console.error("Error updating quest progress:", error);
      }
    }

    return {
      success: true,
      message: message,
    };
  }

  /**
   * Hiển thị danh sách kỹ năng
   * @param {Player} player - Đối tượng người chơi
   * @returns {Object} Kết quả xử lý
   */
  showSkillList(player) {
    const isInCombat = this.combatService.isPlayerInCombat(player);

    let message = "🔮 DANH SÁCH KỸ NĂNG 🔮\n\n";
    message += `💫 Điểm kỹ năng: ${player.stat.skillPoint || 0}\n\n`;

    // Phân loại kỹ năng theo cấu trúc mới
    const categories = {
      active: "⚡ KỸ NĂNG CHỦ ĐỘNG",
      passive: "🔄 KỸ NĂNG THỤ ĐỘNG",
    };

    for (const [category, title] of Object.entries(categories)) {
      const skills = player.skill[category] || [];
      if (skills.length > 0) {
        message += `${title}:\n`;
        skills.forEach((skill) => {
          // Hiển thị trạng thái hồi chiêu nếu đang trong combat
          let status = "";
          if (category === "active" && skill.remainingCooldown > 0) {
            status = ` (🕒 Hồi chiêu: ${skill.remainingCooldown} lượt)`;
          } else if (isInCombat && category === "active") {
            status = ` (✅ Sẵn sàng)`;
          }

          message += `- ${skill.name} (Cấp ${skill.level || 1})${status}\n`;
          message += `  ${skill.description}\n`;
        });
        message += "\n";
      }
    }

    if ((player.skill.active || []).length === 0 && (player.skill.passive || []).length === 0) {
      message += "❌ Bạn chưa học kỹ năng nào!\n";
      message += "💡 Tìm huấn luyện viên để học kỹ năng mới.\n";
    }

    // Hiển thị hướng dẫn sử dụng kỹ năng phù hợp với ngữ cảnh
    message += "\n📋 HƯỚNG DẪN SỬ DỤNG KỸ NĂNG:\n";

    if (isInCombat) {
      message += "• Trong chiến đấu, gõ `skill [tên kỹ năng]` để sử dụng kỹ năng tấn công\n";
      message += "• Chỉ có thể sử dụng kỹ năng chủ động trong chiến đấu\n";
      message += "• Sử dụng kỹ năng sẽ kết thúc lượt của bạn\n";
    } else {
      message += "• Gõ `skill [tên kỹ năng]` để xem thông tin chi tiết về kỹ năng\n";
      message += "• Gõ `skill upgrade [tên kỹ năng]` để nâng cấp kỹ năng\n";
      message += "• Tìm huấn luyện viên và gõ `learn` để học kỹ năng mới\n";
    }

    return {
      success: true,
      message,
    };
  }

  /**
   * Hiển thị thông tin chi tiết về kỹ năng
   * @param {Player} player - Đối tượng người chơi
   * @param {string} skillName - Tên kỹ năng
   * @returns {Promise<Object>} Kết quả xử lý
   */
  async showSkillInfo(player, skillName) {
    // Tìm kỹ năng trong cả active và passive
    let skill = null;
    const allSkills = [...(player.skill.active || []), ...(player.skill.passive || [])];
    skill = allSkills.find(
      (s) => s.name.toLowerCase() === skillName.toLowerCase() || s.id.toLowerCase() === skillName.toLowerCase()
    );

    if (!skill) {
      return {
        success: false,
        message: "❌ Bạn chưa học kỹ năng này!",
      };
    }

    let message = `🔮 ${skill.name.toUpperCase()} 🔮\n\n`;
    message += `Loại: ${this.getSkillTypeName(skill.type)}\n`;

    // Hiển thị hệ phép thuật nếu có
    if (skill.element) {
      message += `Hệ: ${this.getElementName(skill.element)}\n`;
    }

    message += `Cấp độ: ${skill.level || 1}\n`;

    if (skill.cooldownTurns > 0) {
      message += `Hồi chiêu: ${skill.cooldownTurns} lượt\n`;
    }
    if (skill.mpCost > 0) {
      message += `MP tiêu hao: ${skill.mpCost}\n`;
    }

    // Hiển thị hệ số sát thương nếu có
    if (skill.damageMultiplier) {
      message += `Hệ số sát thương: ${skill.damageMultiplier}x\n`;
    }

    message += `\n📝 Mô tả:\n${skill.description}\n\n`;

    // Hiển thị hiệu ứng theo cấp độ
    message += "💫 Hiệu ứng:\n";
    if (skill.effects) {
      // Hiển thị hiệu ứng DOT (Damage Over Time)
      if (skill.effects.dot) {
        const dot = skill.effects.dot;
        message += `- Sát thương theo thời gian: ${dot.damage} mỗi lượt trong ${dot.turns} lượt`;
        if (dot.element) {
          message += ` (${this.getElementName(dot.element)})`;
        }
        message += "\n";
      }

      // Hiển thị hiệu ứng làm chậm
      if (skill.effects.slow) {
        const slow = skill.effects.slow;
        message += `- Làm chậm: Giảm ${slow.amount}% tốc độ trong ${slow.turns} lượt (Cơ hội: ${slow.chance * 100}%)\n`;
      }

      // Hiển thị hiệu ứng choáng
      if (skill.effects.stun) {
        const stun = skill.effects.stun;
        message += `- Làm choáng: Mục tiêu không thể hành động trong ${stun.turns} lượt (Cơ hội: ${
          stun.chance * 100
        }%)\n`;
      }

      // Hiển thị hiệu ứng hút máu
      if (skill.effects.lifesteal) {
        const lifesteal = skill.effects.lifesteal;
        message += `- Hút máu: Hồi phục ${lifesteal.percent}% sát thương gây ra\n`;
      }

      // Hiển thị hiệu ứng hồi máu
      if (skill.effects.heal) {
        const heal = skill.effects.heal;
        message += `- Hồi máu: Hồi phục ${heal.amount} HP\n`;
      }

      // Hiển thị hiệu ứng buff
      if (skill.effects.buff) {
        message += "- Tăng cường:\n";
        for (const [stat, buff] of Object.entries(skill.effects.buff)) {
          message += `  • ${this.getStatName(stat)}: ${buff.amount > 0 ? "+" : ""}${buff.amount}${
            buff.isPercent ? "%" : ""
          } trong ${buff.turns} lượt\n`;
        }
      }
    }

    // Hiển thị lời khuyên sử dụng kỹ năng với trang bị phù hợp
    if (skill.element) {
      message += "\n💡 Lời khuyên:\n";

      if (["fire", "ice", "lightning", "earth", "water", "wind", "light", "dark"].includes(skill.element)) {
        message += `- Sử dụng trượng phép và áo choàng pháp sư để tăng sức mạnh phép thuật hệ ${this.getElementName(
          skill.element
        )}\n`;
      } else if (skill.type === "physical" || skill.subType === "martial") {
        message += "- Sử dụng găng tay võ thuật và áo choàng võ sư để tăng sức mạnh combo\n";
      }
    }

    message +=
      "\n🎲 Trong chiến đấu, bạn có thể sử dụng trực tiếp lệnh `skill " + skill.name + "` để tấn công đối thủ.";

    return {
      success: true,
      message,
    };
  }

  /**
   * Sử dụng kỹ năng (ngoài combat)
   * @param {Player} player - Đối tượng người chơi
   * @param {string} skillName - Tên kỹ năng
   * @returns {Promise<Object>} Kết quả xử lý
   */
  async useSkill(player, skillName) {
    if (!skillName) {
      return {
        success: false,
        message: "❌ Vui lòng nhập tên kỹ năng!",
      };
    }

    // Kiểm tra người chơi có đang trong trạng thái chiến đấu không
    if (this.combatService.isPlayerInCombat(player)) {
      return {
        success: false,
        message: "❌ Trong trạng thái chiến đấu, hãy dùng lệnh `skill [tên kỹ năng]` để tấn công!",
      };
    }

    // Tìm kỹ năng trong danh sách active (chỉ skill active mới có thể sử dụng)
    let skill = null;
    let skillIndex = -1;
    const activeSkills = player.skill.active || [];

    for (let i = 0; i < activeSkills.length; i++) {
      if (
        activeSkills[i].name.toLowerCase() === skillName.toLowerCase() ||
        activeSkills[i].id.toLowerCase() === skillName.toLowerCase()
      ) {
        skill = activeSkills[i];
        skillIndex = i;
        break;
      }
    }

    if (!skill) {
      return {
        success: false,
        message: "❌ Bạn chưa học kỹ năng này hoặc đây là kỹ năng thụ động!",
      };
    }

    // Kiểm tra hồi chiêu theo lượt
    if (skill.remainingCooldown && skill.remainingCooldown > 0) {
      return {
        success: false,
        message: `❌ Kỹ năng đang hồi chiêu! (Còn ${skill.remainingCooldown} lượt)`,
      };
    }

    // Kiểm tra MP
    if (skill.mpCost > player.stat.mp.current) {
      return {
        success: false,
        message: "❌ Không đủ MP để sử dụng kỹ năng!",
      };
    }

    // Áp dụng hiệu ứng kỹ năng
    player.stat.mp.current -= skill.mpCost;

    // Đặt kỹ năng vào trạng thái hồi chiêu và cập nhật trong player object
    if (!skill.remainingCooldown) skill.remainingCooldown = 0;
    skill.remainingCooldown = skill.cooldownTurns || 0;

    // Cập nhật skill trong player object
    player.skill.active[skillIndex] = skill;

    let message = `✨ Đã sử dụng ${skill.name}!\n`;
    if (skill.effects) {
      // Xử lý hiệu ứng kỹ năng ngoài combat
      const effectMessages = this.processNonCombatSkillEffects(player, skill);
      if (effectMessages.length > 0) {
        message += effectMessages.join("\n") + "\n";
      }
    }

    this.gameData.markPlayerDataChanged();
    player.save();

    return {
      success: true,
      message,
    };
  }

  /**
   * Xử lý hiệu ứng kỹ năng ngoài combat
   * @param {Player} player - Đối tượng người chơi
   * @param {Object} skill - Kỹ năng sử dụng
   * @returns {Array} - Các thông báo hiệu ứng
   */
  processNonCombatSkillEffects(player, skill) {
    const messages = [];

    if (!skill.effects) return messages;

    // Xử lý hiệu ứng hồi máu
    if (skill.effects.heal) {
      const healAmount = skill.effects.heal.amount * (skill.level || 1);
      const oldHp = player.stat.hp.current;
      player.stat.hp.current = Math.min(player.stat.hp.current + healAmount, player.stat.hp.max);
      const actualHeal = player.stat.hp.current - oldHp;
      messages.push(`🆙 Hồi phục ${actualHeal} HP (${player.stat.hp.current}/${player.stat.hp.max})`);
    }

    // Xử lý hiệu ứng buff
    if (skill.effects.buff) {
      // Xử lý hiệu ứng buff dựa trên lượt
      if (!player.buffs) player.buffs = [];

      Object.entries(skill.effects.buff).forEach(([statType, statEffect]) => {
        const value = statEffect.amount * (skill.level || 1);
        const turns = statEffect.turns || 1;

        player.buffs.push({
          name: skill.name,
          type: statType,
          value: value,
          turnsLeft: turns,
          isPercent: statEffect.isPercent,
        });

        messages.push(
          `💪 Tăng ${this.getStatName(statType)} lên ${value}${statEffect.isPercent ? "%" : ""} trong ${turns} lượt`
        );
      });
    }

    return messages;
  }

  /**
   * Lấy tên hiển thị của thuộc tính
   * @param {string} stat - Thuộc tính
   * @returns {string} - Tên hiển thị
   */
  getStatName(stat) {
    const statNames = {
      attack: "Tấn công",
      defense: "Phòng thủ",
      speed: "Tốc độ",
      hp: "HP",
      mp: "MP",
      crit: "Chí mạng",
      critDamage: "Sát thương chí mạng",
      dodge: "Né tránh",
      accuracy: "Chính xác",
    };

    return statNames[stat] || stat;
  }

  /**
   * Nâng cấp kỹ năng
   * @param {Player} player - Đối tượng người chơi
   * @param {string} skillName - Tên kỹ năng
   * @returns {Promise<Object>} Kết quả xử lý
   */
  async upgradeSkill(player, skillName) {
    if (!skillName) {
      return {
        success: false,
        message: "❌ Vui lòng nhập tên kỹ năng!",
      };
    }

    // Tìm kỹ năng trong cả active và passive
    let skill = null;
    let skillIndex = -1;
    let skillCategory = null;

    const activeSkills = player.skill.active || [];
    const passiveSkills = player.skill.passive || [];

    for (let i = 0; i < activeSkills.length; i++) {
      if (
        activeSkills[i].name.toLowerCase() === skillName.toLowerCase() ||
        activeSkills[i].id.toLowerCase() === skillName.toLowerCase()
      ) {
        skill = activeSkills[i];
        skillIndex = i;
        skillCategory = "active";
        break;
      }
    }

    if (!skill) {
      for (let i = 0; i < passiveSkills.length; i++) {
        if (
          passiveSkills[i].name.toLowerCase() === skillName.toLowerCase() ||
          passiveSkills[i].id.toLowerCase() === skillName.toLowerCase()
        ) {
          skill = passiveSkills[i];
          skillIndex = i;
          skillCategory = "passive";
          break;
        }
      }
    }

    if (!skill) {
      return {
        success: false,
        message: "❌ Bạn chưa học kỹ năng này!",
      };
    }

    // Kiểm tra cấp độ tối đa
    if (skill.level >= (skill.maxLevel || 10)) {
      return {
        success: false,
        message: "❌ Kỹ năng đã đạt cấp độ tối đa!",
      };
    }

    // Kiểm tra cấp độ người chơi
    if (skill.levelRequired && player.stat.level < skill.levelRequired) {
      return {
        success: false,
        message: `❌ Bạn cần đạt cấp ${skill.levelRequired} để nâng cấp kỹ năng này!`,
      };
    }

    // Kiểm tra điểm kỹ năng
    const upgradePoint = skill.upgradePoint || 1;
    if (!player.stat.skillPoint || player.stat.skillPoint < upgradePoint) {
      return {
        success: false,
        message: `❌ Không đủ điểm kỹ năng! (Cần ${upgradePoint} điểm)`,
      };
    }

    // Nâng cấp kỹ năng
    player.stat.skillPoint -= upgradePoint;
    skill.level = (skill.level || 1) + 1;

    // Cập nhật skill trong player object
    player.skill[skillCategory][skillIndex] = skill;

    this.gameData.markPlayerDataChanged();

    let message = `🌟 Đã nâng cấp ${skill.name} lên cấp ${skill.level}!\n\n`;
    message += "Hiệu ứng mới:\n";
    if (skill.effects) {
      Object.entries(skill.effects).forEach(([effectType, effectParams]) => {
        message += `- ${effectType}: Hiệu ứng được tăng cường\n`;
      });
    }

    return {
      success: true,
      message,
    };
  }

  /**
   * Lấy tên hiển thị của loại kỹ năng
   * @param {string} type - Loại kỹ năng
   * @returns {string} Tên hiển thị
   */
  getSkillTypeName(type) {
    const types = {
      passive: "Thụ động",
      active: "Chủ động",
      ultimate: "Tối thượng",
    };
    return types[type] || type;
  }

  /**
   * Lấy tên hệ phép thuật
   * @param {string} element - Hệ phép thuật
   * @returns {string} Tên hệ phép thuật
   */
  getElementName(element) {
    const elementNames = {
      fire: "🔥 Hỏa",
      ice: "❄️ Băng",
      lightning: "⚡ Lôi",
      earth: "🌑 Thổ",
      water: "💧 Thủy",
      wind: "💨 Phong",
      light: "✨ Quang",
      dark: "🌑 Ám",
      physical: "👊 Vật Lý",
      magic: "🔮 Ma Thuật",
    };

    return elementNames[element] || element;
  }

  /**
   * Xử lý kết thúc lượt của người chơi hoặc quái vật
   * @param {Object} entity - Đối tượng người chơi hoặc quái vật
   * @returns {Object} Kết quả xử lý với thông điệp
   */
  handleEndTurn(entity) {
    const messages = [];

    // Giảm thời gian hồi chiêu của tất cả kỹ năng
    if (entity.skills && Array.isArray(entity.skills)) {
      entity.skills.forEach((skill) => {
        if (skill.remainingCooldown > 0) {
          skill.remainingCooldown--;
          if (skill.remainingCooldown === 0) {
            messages.push(`🔄 Kỹ năng ${skill.name} đã hết thời gian hồi chiêu!`);
          }
        }
      });
    }

    // Xử lý hiệu ứng tích cực (buff)
    if (entity.buffs && Array.isArray(entity.buffs)) {
      for (let i = entity.buffs.length - 1; i >= 0; i--) {
        const buff = entity.buffs[i];
        buff.turnsLeft--;
        if (buff.turnsLeft <= 0) {
          messages.push(`✨ Hiệu ứng ${buff.name} đã hết tác dụng!`);
          entity.buffs.splice(i, 1);
        }
      }
    }

    // Xử lý hiệu ứng tiêu cực (debuff)
    if (entity.debuffs && Array.isArray(entity.debuffs)) {
      for (let i = entity.debuffs.length - 1; i >= 0; i--) {
        const debuff = entity.debuffs[i];
        debuff.turnsLeft--;
        if (debuff.turnsLeft <= 0) {
          messages.push(`💨 ${entity.name} đã hết hiệu ứng ${debuff.name}!`);
          entity.debuffs.splice(i, 1);
        }
      }
    }

    // Xử lý sát thương theo lượt (DoT)
    if (entity.dots && Array.isArray(entity.dots)) {
      for (let i = entity.dots.length - 1; i >= 0; i--) {
        const dot = entity.dots[i];

        // Gây sát thương theo lượt
        if (dot.damage) {
          const damageResult =
            typeof entity.takeDamage === "function" ? entity.takeDamage(dot.damage) : { damage: dot.damage };

          messages.push(`🔥 ${entity.name} nhận ${damageResult.damage} sát thương từ ${dot.name}!`);
        }

        // Giảm số lượt còn lại
        dot.turnsLeft--;
        if (dot.turnsLeft <= 0) {
          messages.push(`🌊 Hiệu ứng sát thương từ ${dot.name} đã kết thúc!`);
          entity.dots.splice(i, 1);
        }
      }
    }

    return {
      success: true,
      messages,
    };
  }

  /**
   * Kiểm tra xem người chơi có thể hành động trong lượt này không
   * @param {Player} player - Đối tượng người chơi
   * @returns {Object} - Kết quả kiểm tra
   */
  canPlayerAct(player) {
    if (!player.debuffs || player.debuffs.length === 0) {
      return { canAct: true };
    }

    // Kiểm tra hiệu ứng choáng (stun)
    const stunEffect = player.debuffs.find((d) => d.name === "stun" && d.turnsLeft > 0);
    if (stunEffect) {
      return {
        canAct: false,
        reason: `Bạn đang bị choáng, còn ${stunEffect.turnsLeft} lượt`,
      };
    }

    return { canAct: true };
  }
}

let instance = null;

export function getSkillServiceInstance() {
  if (!instance) {
    instance = new SkillService();
  }
  return instance;
}
