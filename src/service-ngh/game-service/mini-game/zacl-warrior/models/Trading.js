/**
 * Trading.js
 * Module xử lý logic liên quan đến giao dịch
 */

import { Entity } from '../core/Entity.js';

export class Trading extends Entity {
  constructor(tradeData) {
    super(tradeData.id, tradeData.name, tradeData.description || '');
    this.seller = tradeData.seller;
    this.buyer = tradeData.buyer || null;
    this.items = tradeData.items || [];
    this.price = tradeData.price || {
      gold: 0,
      diamond: 0
    };
    this.status = tradeData.status || 'pending'; // pending, accepted, completed, cancelled
    this.createdAt = tradeData.createdAt || Date.now();
    this.completedAt = tradeData.completedAt || null;
    this.data = tradeData; // Lưu trữ dữ liệu gốc
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
      seller: this.seller,
      buyer: this.buyer,
      items: this.items,
      price: this.price,
      status: this.status,
      createdAt: this.createdAt,
      completedAt: this.completedAt
    };
  }

  /**
   * Tạo một giao dịch mới
   * @param {Object} tradeData - Dữ liệu giao dịch
   * @returns {Trading} - Đối tượng giao dịch mới
   */
  static create(tradeData) {
    return new Trading(tradeData);
  }

  /**
   * Kiểm tra xem giao dịch có đang chờ không
   * @returns {boolean} - Kết quả kiểm tra
   */
  isPending() {
    return this.status === 'pending';
  }

  /**
   * Kiểm tra xem giao dịch đã được chấp nhận chưa
   * @returns {boolean} - Kết quả kiểm tra
   */
  isAccepted() {
    return this.status === 'accepted';
  }

  /**
   * Kiểm tra xem giao dịch đã hoàn thành chưa
   * @returns {boolean} - Kết quả kiểm tra
   */
  isCompleted() {
    return this.status === 'completed';
  }

  /**
   * Kiểm tra xem giao dịch đã bị hủy chưa
   * @returns {boolean} - Kết quả kiểm tra
   */
  isCancelled() {
    return this.status === 'cancelled';
  }

  /**
   * Chấp nhận giao dịch
   * @param {string} buyerId - ID người mua
   * @returns {boolean} - Kết quả chấp nhận
   */
  accept(buyerId) {
    if (!this.isPending()) return false;
    
    this.buyer = buyerId;
    this.status = 'accepted';
    return true;
  }

  /**
   * Hoàn thành giao dịch
   * @returns {boolean} - Kết quả hoàn thành
   */
  complete() {
    if (!this.isAccepted()) return false;
    
    this.status = 'completed';
    this.completedAt = Date.now();
    return true;
  }

  /**
   * Hủy giao dịch
   * @returns {boolean} - Kết quả hủy
   */
  cancel() {
    if (this.isCompleted()) return false;
    
    this.status = 'cancelled';
    return true;
  }

  /**
   * Lấy thông tin người bán
   * @returns {Object} - Thông tin người bán
   */
  getSeller() {
    return {
      id: this.seller,
      items: this.items,
      price: this.price
    };
  }

  /**
   * Lấy thông tin người mua
   * @returns {Object|null} - Thông tin người mua
   */
  getBuyer() {
    if (!this.buyer) return null;
    
    return {
      id: this.buyer
    };
  }

  /**
   * Lấy danh sách vật phẩm giao dịch
   * @returns {Array} - Danh sách vật phẩm
   */
  getItems() {
    return [...this.items];
  }

  /**
   * Lấy giá giao dịch
   * @returns {Object} - Thông tin giá
   */
  getPrice() {
    return { ...this.price };
  }
} 