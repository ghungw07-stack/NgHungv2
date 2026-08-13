/**
 * ServiceRegistry.js
 * Lớp trung tâm quản lý tất cả các service trong hệ thống
 * Giải quyết vấn đề circular dependency bằng cách cung cấp một điểm trung tâm
 * để đăng ký và truy xuất các service
 */

class ServiceRegistry {
  constructor() {
    this.services = new Map();
    this.factories = new Map();
    this.instances = new Map();
  }

  /**
   * Đăng ký một service factory
   * @param {string} serviceName - Tên của service
   * @param {Function} factory - Hàm factory để tạo instance của service
   */
  registerService(serviceName, factory) {
    this.factories.set(serviceName, factory);
  }

  /**
   * Lấy instance của một service
   * @param {string} serviceName - Tên của service cần lấy
   * @returns {Object} - Instance của service
   */
  getService(serviceName) {
    // Kiểm tra xem service đã được tạo chưa
    if (this.instances.has(serviceName)) {
      return this.instances.get(serviceName);
    }

    // Kiểm tra xem factory của service có tồn tại không
    if (!this.factories.has(serviceName)) {
      throw new Error(`Service ${serviceName} chưa được đăng ký`);
    }

    // Tạo service instance và lưu vào cache
    const factory = this.factories.get(serviceName);
    const instance = factory(this);
    this.instances.set(serviceName, instance);

    return instance;
  }

  /**
   * Kiểm tra xem một service đã được đăng ký chưa
   * @param {string} serviceName - Tên của service
   * @returns {boolean} - True nếu service đã được đăng ký
   */
  hasService(serviceName) {
    return this.factories.has(serviceName);
  }

  /**
   * Xóa tất cả các service instance (sử dụng khi cần reset hệ thống)
   */
  clearInstances() {
    this.instances.clear();
  }
}

// Singleton instance
let instance = null;

/**
 * Lấy instance của ServiceRegistry
 * @returns {ServiceRegistry} - ServiceRegistry instance
 */
export function getServiceRegistry() {
  if (!instance) {
    instance = new ServiceRegistry();
  }
  return instance;
}

export default {
  getServiceRegistry
}; 