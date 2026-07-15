/**
 * ShopService.js
 * Service xử lý các thao tác liên quan đến cửa hàng
 */

import { getGameDataInstance } from "../core/GameData.js";
import { getGameManagerInstance } from "../core/GameManager.js";
import Player from "../models/Player.js";
import { getServiceRegistry } from "./ServiceRegistry.js";

export class ShopService {
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
   * Lấy ItemService
   * @returns {import('./ItemService.js').ItemService}
   */
  get itemService() {
    return this.getService('ItemService');
  }
  
  /**
   * Lấy PlayerService
   * @returns {import('./PlayerService.js').PlayerService}
   */
  get playerService() {
    return this.getService('PlayerService');
  }

  /**
   * Xử lý lệnh cửa hàng
   * @param {Player} player - Đối tượng người chơi
   * @param {Array} args - Tham số lệnh
   * @returns {Promise<Object>} Kết quả xử lý
   */
  async handleShop(player, args = []) {
    // Kiểm tra người chơi có ở thị trấn không
    if (player.currentArea !== "town") {
      return {
        success: false,
        message: "❌ Bạn cần ở Thị trấn để có thể mua bán vật phẩm!",
      };
    }

    // Nếu không có tham số, hiển thị danh sách vật phẩm
    if (!args.length) {
      return this.showShopItems(player);
    }

    const subCommand = args[0].toLowerCase();
    const itemName = args.slice(1).join(" ");

    switch (subCommand) {
      case "buy":
        return await this.buyItem(player, itemName);
      case "sell":
        return await this.sellItem(player, itemName);
      default:
        return {
          success: false,
          message: "❌ Lệnh không hợp lệ! Sử dụng: shop [buy/sell] [tên vật phẩm]",
        };
    }
  }

  /**
   * Hiển thị danh sách vật phẩm trong cửa hàng
   * @param {Object} player - Thông tin người chơi
   * @returns {Promise<Object>} Kết quả xử lý
   */
  async showShopItems(player) {
    const items = await this.gameManager.getItemsData();
    let message = "🏪 CỬA HÀNG 🏪\n\n";
    message += `💰 Vàng của bạn: ${player.money.gold}\n\n`;

    // Phân loại vật phẩm
    const categories = {
      weapon: "⚔️ VŨ KHÍ",
      armor: "🛡️ GIÁP",
      accessory: "💍 PHỤ KIỆN",
      consumable: "🧪 TIÊU HAO",
      material: "📦 NGUYÊN LIỆU",
    };

    for (const [category, title] of Object.entries(categories)) {
      const categoryItems = items.items.filter(
        (item) =>
          item.type === category &&
          item.canBuy !== false &&
          (!item.levelRequired || item.levelRequired <= player.stat.level)
      );

      if (categoryItems.length > 0) {
        message += `${title}:\n`;
        categoryItems.forEach((item) => {
          message += `- ${item.name}`;
          if (item.levelRequired) {
            message += ` (Cấp ${item.levelRequired})`;
          }
          message += ` - ${item.price || 0} Vàng\n`;
          if (item.description) {
            message += `  ${item.description}\n`;
          }
        });
        message += "\n";
      }
    }

    return {
      success: true,
      message,
    };
  }

  /**
   * Mua vật phẩm
   * @param {Player} player - Thông tin người chơi
   * @param {string} itemName - Tên vật phẩm
   * @returns {Promise<Object>} Kết quả xử lý
   */
  async buyItem(player, itemName) {
    if (!itemName) {
      return {
        success: false,
        message: "❌ Vui lòng nhập tên vật phẩm!",
      };
    }

    const item = this.itemService.getItemTemplate(itemName);

    if (!item) {
      return {
        success: false,
        message: "❌ Không tìm thấy vật phẩm này trong cửa hàng!",
      };
    }

    if (item.canBuy === false) {
      return {
        success: false,
        message: "❌ Vật phẩm này không thể mua!",
      };
    }

    if (item.levelRequired && player.stat.level < item.levelRequired) {
      return {
        success: false,
        message: `❌ Bạn cần đạt cấp ${item.levelRequired} để mua vật phẩm này!`,
      };
    }

    const price = item.price || 0;
    if (player.money.gold < price) {
      return {
        success: false,
        message: `❌ Bạn không đủ vàng để mua vật phẩm này! (Cần ${price} vàng)`,
      };
    }

    const addResult = player.addItemToBag(item, 1, true);

    if (!addResult.success) {
      return addResult;
    }

    player.money.gold -= price;

    this.gameData.markPlayerDataChanged();

    return {
      success: true,
      message: `✅ Đã mua ${item.name} với giá ${price} vàng!`,
    };
  }

  /**
   * Bán vật phẩm
   * @param {Object} player - Thông tin người chơi
   * @param {string} itemName - Tên vật phẩm
   * @returns {Promise<Object>} Kết quả xử lý
   */
  async sellItem(player, itemName) {
    if (!itemName) {
      return {
        success: false,
        message: "❌ Vui lòng nhập tên vật phẩm!",
      };
    }

    const item = player.findItemInBag(itemName);

    if (!item) {
      return {
        success: false,
        message: "❌ Bạn không có vật phẩm này trong túi đồ!",
      };
    }

    if (item.canSell === false) {
      return {
        success: false,
        message: "❌ Vật phẩm này không thể bán!",
      };
    }

    const sellPrice = Math.floor((item.price || 0) * 0.7);

    player.money.gold += sellPrice;
    player.removeItemFromBag(item.id, 1);

    this.gameData.markPlayerDataChanged();

    return {
      success: true,
      message: `✅ Đã bán ${item.name} với giá ${sellPrice} vàng!`,
    };
  }
}

let instance = null;

export function getShopServiceInstance() {
  if (!instance) {
    instance = new ShopService();
  }
  return instance;
}
