/**
 * ItemService.js
 * Service xử lý các thao tác liên quan đến vật phẩm
 */

import { getGameDataInstance } from '../core/GameData.js';
import { getGameManagerInstance } from '../core/GameManager.js';
import { getServiceRegistry } from './ServiceRegistry.js';
import { Item } from '../models/Item.js';

/**
 * Service xử lý các thao tác liên quan đến vật phẩm
 * @class ItemService
 */
export class ItemService {
  constructor() {
    /** @type {import('../core/GameData.js').GameData} */
    this.gameData = getGameDataInstance();

    /** @type {import('../core/GameManager.js').GameManager} */
    this.gameManager = getGameManagerInstance();
    
    // Lấy registry để truy cập các service khi cần
    this._registry = getServiceRegistry();
    
    // Cache item templates
    this.itemTemplates = new Map();

    this.items = [];
    this.itemsById = new Map();
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
   * Tải dữ liệu vật phẩm từ bộ nhớ
   */
  loadItems() {
    const itemsData = this.gameData.getItemsData();
    
    if (itemsData && itemsData.items) {
      this.items = itemsData.items.map(itemData => new Item(itemData));
      
      this.itemsById.clear();
      for (const item of this.items) {
        this.itemsById.set(item.getId(), item);
      }
    }
    
    return this.items;
  }

  /**
   * Tìm vật phẩm theo ID
   * @param {string} id - ID của vật phẩm
   * @returns {Item|null} - Đối tượng vật phẩm hoặc null nếu không tìm thấy
   */
  getItemById(id) {
    if (!id) return null;
    
    if (this.itemsById.size === 0) {
      this.loadItems();
    }
    
    return this.itemsById.get(id) || null;
  }

  /**
   * Tìm vật phẩm theo tên
   * @param {string} name - Tên vật phẩm (tìm kiếm không phân biệt hoa thường)
   * @returns {Item|null} - Đối tượng vật phẩm hoặc null nếu không tìm thấy
   */
  getItemByName(name) {
    if (!name) return null;
    
    if (this.items.length === 0) {
      this.loadItems();
    }
    
    const lowerName = name.toLowerCase();
    return this.items.find(item => item.getName().toLowerCase() === lowerName) || null;
  }

  /**
   * Tìm vật phẩm theo tên hoặc ID (không phân biệt hoa thường)
   * @param {string} nameOrId - Tên hoặc ID vật phẩm
   * @returns {Item|null} - Đối tượng vật phẩm hoặc null nếu không tìm thấy
   */
  getItemTemplate(nameOrId) {
    if (!nameOrId) return null;
    
    if (this.items.length === 0) {
      this.loadItems();
    }
    
    const lower = nameOrId.toLowerCase();
    return this.items.find(
      item =>
        (item.getName && item.getName().toLowerCase() === lower) ||
        (item.getId && item.getId().toLowerCase() === lower)
    ) || null;
  }

  /**
   * Lấy danh sách tất cả vật phẩm
   * @returns {Array<Item>} - Danh sách vật phẩm
   */
  getAllItems() {
    if (this.items.length === 0) {
      this.loadItems();
    }
    
    return [...this.items];
  }

  /**
   * Lấy danh sách vật phẩm theo loại
   * @param {string} type - Loại vật phẩm
   * @returns {Array<Item>} - Danh sách vật phẩm thuộc loại
   */
  getItemsByType(type) {
    if (!type) return [];
    
    if (this.items.length === 0) {
      this.loadItems();
    }
    
    return this.items.filter(item => item.type === type);
  }

  /**
   * Lưu vật phẩm mới hoặc cập nhật vật phẩm đã có
   * @param {Item} item - Đối tượng vật phẩm
   * @returns {boolean} - Kết quả lưu vật phẩm
   */
  saveItem(item) {
    if (!item) return false;
    
    const itemData = item.toJSON();
    const itemsData = this.gameData.getItemsData();
    
    // Tìm vật phẩm trong danh sách
    const index = itemsData.items.findIndex(i => i.id === itemData.id);
    
    if (index >= 0) {
      // Cập nhật vật phẩm đã có
      itemsData.items[index] = itemData;
    } else {
      // Thêm vật phẩm mới
      itemsData.items.push(itemData);
    }
    
    // Đánh dấu dữ liệu đã thay đổi
    this.gameData.markItemsDataChanged();
    
    // Cập nhật danh sách vật phẩm trong bộ nhớ
    this.loadItems();
    
    return true;
  }

  /**
   * Xóa vật phẩm khỏi danh sách
   * @param {string} itemId - ID của vật phẩm cần xóa
   * @returns {boolean} - Kết quả xóa vật phẩm
   */
  deleteItem(itemId) {
    if (!itemId) return false;
    
    const itemsData = this.gameData.getItemsData();
    
    // Tìm vật phẩm trong danh sách
    const index = itemsData.items.findIndex(i => i.id === itemId);
    
    if (index >= 0) {
      // Xóa vật phẩm
      itemsData.items.splice(index, 1);
      
      // Đánh dấu dữ liệu đã thay đổi
      this.gameData.markItemsDataChanged();
      
      // Cập nhật danh sách vật phẩm trong bộ nhớ
      this.loadItems();
      
      return true;
    }
    
    return false;
  }

  /**
   * Kiểm tra vật phẩm có thể sử dụng cho người chơi không
   * @param {Object} player - Đối tượng người chơi
   * @param {string} itemId - ID của vật phẩm
   * @returns {Object} - Kết quả kiểm tra
   */
  canUseItem(player, itemId) {
    const item = this.getItemById(itemId);
    
    if (!item) {
      return { success: false, message: "Vật phẩm không tồn tại." };
    }
    
    if (!item.usable) {
      return { success: false, message: "Vật phẩm này không thể sử dụng." };
    }
    
    // Kiểm tra vật phẩm có bị khóa không (nếu cần thiết)
    if (item.isLocked && !player.canUseLockedItems) {
      return {
        success: false,
        message: "Vật phẩm này đang bị khóa và không thể sử dụng."
      };
    }

    // Kiểm tra yêu cầu
    if (item.requirements) {
      // Kiểm tra level
      if (item.requirements.level && player.stat.level < item.requirements.level) {
        return {
          success: false,
          message: `Bạn cần đạt cấp độ ${item.requirements.level} để sử dụng vật phẩm này.`
        };
      }
      
      // Kiểm tra các chỉ số khác
      if (item.requirements.stats) {
        const playerStats = player.getBaseStats();
        for (const [stat, value] of Object.entries(item.requirements.stats)) {
          if (playerStats[stat] < value) {
            return {
              success: false,
              message: `Bạn cần có chỉ số ${this.getStatName(stat)} ít nhất ${value} để sử dụng vật phẩm này.`
            };
          }
        }
      }

      // Kiểm tra nội tại yêu cầu (nếu có)
      if (item.requirements.hiddenTrait) {
        let hasRequiredTrait = false;
        // Kiểm tra trong tất cả trang bị đang mặc
        for (const [slot, equipment] of Object.entries(player.body)) {
          if (equipment && equipment.hiddenTrait === item.requirements.hiddenTrait) {
            hasRequiredTrait = true;
            break;
          }
        }

        if (!hasRequiredTrait) {
          return {
            success: false,
            message: `Bạn cần có trang bị với nội tại ${this.getTraitName(item.requirements.hiddenTrait)} để sử dụng vật phẩm này.`
          };
        }
      }
    }
    
    return { success: true };
  }

  /**
   * Lấy tên hiển thị của chỉ số
   * @param {string} stat - Mã chỉ số
   * @returns {string} - Tên chỉ số
   */
  getStatName(stat) {
    const statNames = {
      attack: 'Tấn công',
      intelligence: 'Thông minh',
      defense: 'Phòng thủ',
      speed: 'Tốc độ',
      vitality: 'Sinh lực',
      critRate: 'Tỉ lệ chí mạng',
      critDmg: 'Sát thương chí mạng',
      dodge: 'Né tránh',
      accuracy: 'Chính xác',
      hp: 'HP tối đa',
      mp: 'MP tối đa'
    };
    
    return statNames[stat] || stat;
  }

  /**
   * Lấy tên hiển thị của nội tại
   * @param {string} trait - Mã nội tại
   * @returns {string} - Tên nội tại
   */
  getTraitName(trait) {
    const traitNames = {
      fire: 'Hỏa',
      ice: 'Băng',
      thunder: 'Sét',
      earth: 'Đất',
      water: 'Nước',
      wind: 'Gió',
      light: 'Ánh sáng',
      dark: 'Bóng tối'
    };
    
    return traitNames[trait] || trait;
  }
}

let instance = null;

export function getItemServiceInstance() {
  if (!instance) {
    instance = new ItemService();
  }
  return instance;
}