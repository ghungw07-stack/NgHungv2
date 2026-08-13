/**
 * AreaService.js
 * Service xử lý các thao tác liên quan đến khu vực
 */

import { getGameDataInstance } from "../core/GameData.js";
import { getGameManagerInstance } from "../core/GameManager.js";
import { getServiceRegistry } from "./ServiceRegistry.js";

export class AreaService {
  constructor() {
    /** @type {import('../core/GameData.js').GameData} */
    this.gameData = getGameDataInstance();

    /** @type {import('../core/GameManager.js').GameManager} */
    this.gameManager = getGameManagerInstance();

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
   * @returns {import('./PlayerService.js').PlayerService}
   */
  get playerService() {
    return this.getService("PlayerService");
  }

  /**
   * @returns {import('./MonsterService.js').MonsterService}
   */
  get monsterService() {
    return this.getService("MonsterService");
  }

  /**
   * @returns {import('./CombatService.js').CombatService}
   */
  get combatService() {
    return this.getService("CombatService");
  }

  /**
   * @returns {import('./QuestService.js').QuestService}
   */
  get questService() {
    return this.getService("QuestService");
  }

  findAreaByNameOrId(nameOrId) {
    const areas = this.gameManager.getAreasData();
    if (!nameOrId || !areas || !Array.isArray(areas.areas)) return null;

    const lowercaseNameOrId = nameOrId.toLowerCase();
    return (
      areas.areas.find(
        (area) =>
          (area.name && area.name.toLowerCase() === lowercaseNameOrId) ||
          (area.id && area.id.toLowerCase() === lowercaseNameOrId)
      ) || null
    );
  }

  /**
   * Xử lý lệnh di chuyển
   * @param {Player} player - Đối tượng người chơi
   * @param {string} areaName - Tên khu vực
   * @returns {Promise<Object>} Kết quả xử lý
   */
  async handleMoveCommand(player, areaName) {
    if (!areaName) {
      const currentArea = this.findAreaByNameOrId(player.currentArea);
      const connections = currentArea.connections.map((id) => this.findAreaByNameOrId(id)).filter((area) => area);
      let message = "❌ Vui lòng nhập tên khu vực cần di chuyển!\n\n";
      if (connections.length > 0) {
        message += "\n🗺️ Các khu vực kết nối:\n";
        connections.forEach((area) => {
          const levelReq = area.levelRequired ? ` (Yêu cầu: Cấp ${area.levelRequired})` : "";
          message += `- ${area.name}${levelReq}\n`;
        });
      }
      return {
        success: false,
        message,
      };
    }

    const targetArea = this.findAreaByNameOrId(areaName);

    if (!targetArea) {
      return {
        success: false,
        message: "❌ Không tìm thấy khu vực này!",
      };
    }

    // Kiểm tra điều kiện di chuyển
    if (targetArea.levelRequired && player.stat.level < targetArea.levelRequired) {
      return {
        success: false,
        message: `❌ Bạn cần đạt cấp ${targetArea.levelRequired} để vào khu vực này!`,
      };
    }

    // Kiểm tra kết nối giữa các khu vực
    const currentArea = this.findAreaByNameOrId(player.currentArea);
    if (!currentArea.connections.includes(targetArea.id)) {
      return {
        success: false,
        message: "❌ Bạn không thể di chuyển trực tiếp đến khu vực này!",
      };
    }

    // Di chuyển người chơi
    player.currentArea = targetArea.id;

    // Cập nhật tiến trình nhiệm vụ cho mục tiêu khám phá
    const questResult = await this.questService.handleQuestProgressComplete(player, "explore", targetArea.id, 1);

    // Thêm thông báo về nhiệm vụ
    let questMessage = "";
    if (questResult.success && questResult.message) {
      questMessage = questResult.message;
    }

    this.gameData.markPlayerDataChanged();

    let message = `🚶 Bạn đã di chuyển đến ${targetArea.name}.\n\n`;
    message += await this.getAreaDescription(player, targetArea);

    if (questMessage) {
      message += questMessage;
    }

    return {
      success: true,
      message,
    };
  }

  /**
   * Xử lý lệnh kiểm tra khu vực
   * @param {Player} player - Đối tượng người chơi
   * @returns {Promise<Object>} Kết quả xử lý
   */
  async handleCheck(player) {
    const currentArea = this.findAreaByNameOrId(player.currentArea);
    let message = await this.getAreaDescription(player, currentArea);

    // Thêm thông tin về các khu vực có thể di chuyển đến
    const connections = currentArea.connections.map((id) => this.findAreaByNameOrId(id)).filter((area) => area);

    if (connections.length > 0) {
      message += "\n🗺️ Các khu vực kết nối:\n";
      connections.forEach((area) => {
        const levelReq = area.levelRequired ? ` (Yêu cầu: Cấp ${area.levelRequired})` : "";
        message += `- ${area.name}${levelReq}\n`;
      });
    }

    return {
      success: true,
      message,
    };
  }

  /**
   * Xử lý lệnh xem bản đồ
   * @param {Player} player - Đối tượng người chơi
   * @returns {Promise<Object>} Kết quả xử lý
   */
  async handleMap(player) {
    const areas = await this.gameManager.getAreasData();
    let message = "🗺️ BẢN ĐỒ THẾ GIỚI 🗺️\n\n";

    areas.areas.forEach((area) => {
      const isCurrentArea = area.id === player.currentArea;
      const prefix = isCurrentArea ? "👉 " : "- ";
      const levelReq = area.levelRequired ? ` (Cấp ${area.levelRequired})` : "";
      message += `${prefix}${area.name}${levelReq}\n`;

      if (area.description) {
        message += `  ${area.description}\n`;
      }
      message += "\n";
    });

    return {
      success: true,
      message,
    };
  }

  /**
   * Lấy mô tả chi tiết về khu vực
   * @param {Player} player - Thông tin người chơi (được sửa để thêm player vào tham số)
   * @param {Object} area - Thông tin khu vực
   * @returns {Promise<string>} Mô tả khu vực
   */
  async getAreaDescription(player, area) {
    let description = `📍 ${area.name}\n`;
    if (area.description) {
      description += `${area.description}\n`;
    }

    const monsters = await this.gameManager.getMonstersData();
    const areaMonsters = monsters.monsters.filter((m) => m.area === area.id);

    if (areaMonsters.length > 0) {
      description += "\n👾 Quái vật trong khu vực:\n";
      areaMonsters.forEach((monster) => {
        // Kiểm tra xem quái vật này có liên quan đến nhiệm vụ đang làm hay không
        let questMarker = "";
        if (player && player.quests && player.quests.active) {
          const isQuestMonster = this.questService.isMonsterQuestRelated(player, monster.id);
          if (isQuestMonster) {
            questMarker = "⭐ ";
          }
        }
        description += `- ${questMarker}${monster.name} (Cấp ${monster.level})\n`;
      });
    }

    if (area.npcs && area.npcs.length > 0) {
      description += "\n👥 NPC trong khu vực:\n";

      const npcsData = await this.gameManager.getNpcsData();

      area.npcs.forEach((areaNpc) => {
        const fullNpcInfo = npcsData.npcs.find((n) => n.id === areaNpc.id);
        const npcType = fullNpcInfo ? fullNpcInfo.id || "NPC" : "NPC";
        let questMarker = "";
        if (player && player.quests && player.quests.active) {
          const isQuestNpc = this.questService.isNpcQuestRelated(player, areaNpc.id);
          if (isQuestNpc) {
            questMarker = "⭐ ";
          }
        }

        description += `- ${questMarker}${areaNpc.name} (${npcType})\n`;
        if (areaNpc.description) {
          description += `  ${areaNpc.description}\n`;
        }
      });
    }

    // Thêm thông tin về cửa hàng trong khu vực
    const shops = await this.gameManager.getShopsData();
    const areaShops = shops.shops.filter((s) => s.area === area.id);

    if (areaShops.length > 0) {
      description += "\n🏪 Cửa hàng trong khu vực:\n";
      areaShops.forEach((shop) => {
        description += `- ${shop.name}\n`;
      });
    }

    return description;
  }
}

let instance = null;

export function getAreaServiceInstance() {
  if (!instance) {
    instance = new AreaService();
  }
  return instance;
}
