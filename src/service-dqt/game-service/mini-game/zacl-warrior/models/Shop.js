/**
 * Shop.js
 * Module xử lý logic liên quan đến cửa hàng
 */

import { Entity } from '../core/Entity.js';

export class Shop extends Entity {
  constructor(shopData) {
    super(shopData.id, shopData.name, shopData.description || '');
    this.type = shopData.type || 'general'; // general, weapon, armor, potion, etc.
    this.level = shopData.level || 1;
    this.items = shopData.items || [];
    this.restockTime = shopData.restockTime || 3600000; // 1 hour
    this.lastRestockAt = shopData.lastRestockAt || 0;
    this.data = shopData; // Lưu trữ dữ liệu gốc
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
      type: this.type,
      level: this.level,
      items: this.items,
      restockTime: this.restockTime,
      lastRestockAt: this.lastRestockAt
    };
  }

  /**
   * Tạo một cửa hàng mới
   * @param {Object} shopData - Dữ liệu cửa hàng
   * @returns {Shop} - Đối tượng cửa hàng mới
   */
  static create(shopData) {
    return new Shop(shopData);
  }

  /**
   * Kiểm tra xem đã đến lúc bổ sung hàng chưa
   * @returns {boolean} - Kết quả kiểm tra
   */
  shouldRestock() {
    return Date.now() - this.lastRestockAt >= this.restockTime;
  }

  /**
   * Bổ sung hàng mới
   * @param {Array} items - Danh sách vật phẩm mới
   */
  restock(items) {
    this.items = items;
    this.lastRestockAt = Date.now();
  }

  /**
   * Lấy danh sách vật phẩm trong cửa hàng
   * @returns {Array} - Danh sách vật phẩm
   */
  getItems() {
    return [...this.items];
  }

  /**
   * Tìm vật phẩm theo ID
   * @param {string} itemId - ID vật phẩm
   * @returns {Object|null} - Thông tin vật phẩm hoặc null nếu không tìm thấy
   */
  findItem(itemId) {
    return this.items.find(item => item.id === itemId) || null;
  }

  /**
   * Kiểm tra xem vật phẩm có tồn tại trong cửa hàng không
   * @param {string} itemId - ID vật phẩm
   * @returns {boolean} - Kết quả kiểm tra
   */
  hasItem(itemId) {
    return this.items.some(item => item.id === itemId);
  }

  /**
   * Kiểm tra số lượng vật phẩm còn lại
   * @param {string} itemId - ID vật phẩm
   * @returns {number} - Số lượng còn lại
   */
  getItemStock(itemId) {
    const item = this.findItem(itemId);
    return item ? item.stock : 0;
  }

  /**
   * Giảm số lượng vật phẩm
   * @param {string} itemId - ID vật phẩm
   * @param {number} amount - Số lượng cần giảm
   * @returns {boolean} - Kết quả giảm số lượng
   */
  decreaseStock(itemId, amount) {
    const item = this.findItem(itemId);
    if (!item) return false;

    if (item.stock < amount) return false;

    item.stock -= amount;
    return true;
  }

  /**
   * Tăng số lượng vật phẩm
   * @param {string} itemId - ID vật phẩm
   * @param {number} amount - Số lượng cần tăng
   * @returns {boolean} - Kết quả tăng số lượng
   */
  increaseStock(itemId, amount) {
    const item = this.findItem(itemId);
    if (!item) return false;

    item.stock += amount;
    return true;
  }

  /**
   * Lấy giá mua của vật phẩm
   * @param {string} itemId - ID vật phẩm
   * @returns {Object|null} - Thông tin giá hoặc null nếu không tìm thấy
   */
  getBuyPrice(itemId) {
    const item = this.findItem(itemId);
    return item ? item.price.buy : null;
  }

  /**
   * Lấy giá bán của vật phẩm
   * @param {string} itemId - ID vật phẩm
   * @returns {Object|null} - Thông tin giá hoặc null nếu không tìm thấy
   */
  getSellPrice(itemId) {
    const item = this.findItem(itemId);
    return item ? item.price.sell : null;
  }

  /**
   * Kiểm tra xem người chơi có đủ cấp độ để mua vật phẩm không
   * @param {string} itemId - ID vật phẩm
   * @param {number} playerLevel - Cấp độ người chơi
   * @returns {boolean} - Kết quả kiểm tra
   */
  canPlayerBuyItem(itemId, playerLevel) {
    const item = this.findItem(itemId);
    if (!item) return false;

    return !item.requirements || playerLevel >= item.requirements.level;
  }
} 