/**
 * Class Queue tổng quát để xử lý các tác vụ bất đồng bộ theo thứ tự
 * @class Queue
 */
export class Queue {
  constructor(processingInterval = 1000) {
    this.queue = [];
    this.isProcessing = false;
    this.processingInterval = processingInterval;
  }

  /**
   * Thêm một tác vụ vào queue
   * @param {Function} taskFunction - Hàm bất đồng bộ cần thực thi
   * @returns {Promise} Promise sẽ resolve khi tác vụ hoàn thành
   */
  async addTask(taskFunction) {
    return new Promise((resolve, reject) => {
      this.queue.push({ taskFunction, resolve, reject });
      this.processQueue();
    });
  }

  /**
   * Xử lý queue một cách tuần tự
   * @private
   */
  async processQueue() {
    if (this.isProcessing || this.queue.length === 0) return;

    this.isProcessing = true;
    const { taskFunction, resolve, reject } = this.queue.shift();

    try {
      const result = await taskFunction();
      resolve(result);
    } catch (error) {
      console.error("Lỗi khi xử lý tác vụ trong queue:", error);
      reject(error);
    }

    // Đợi một khoảng thời gian trước khi xử lý tác vụ tiếp theo
    await new Promise((resolve) => setTimeout(resolve, this.processingInterval));

    this.isProcessing = false;
    this.processQueue();
  }

  /**
   * Lấy số lượng tác vụ đang chờ trong queue
   * @returns {number} Số lượng tác vụ trong queue
   */
  getQueueLength() {
    return this.queue.length;
  }

  /**
   * Kiểm tra queue có đang xử lý hay không
   * @returns {boolean} true nếu đang xử lý, false nếu không
   */
  isQueueProcessing() {
    return this.isProcessing;
  }

  /**
   * Xóa tất cả tác vụ trong queue và reject chúng
   */
  clearQueue() {
    this.queue.forEach(({ reject }) => {
      reject(new Error("Queue cleared"));
    });
    this.queue = [];
  }

  /**
   * Thay đổi khoảng thời gian xử lý giữa các tác vụ
   * @param {number} interval - Khoảng thời gian tính bằng milliseconds
   */
  setProcessingInterval(interval) {
    this.processingInterval = interval;
  }

  /**
   * Lấy thông tin chi tiết về queue
   * @returns {Object} Thông tin về queue
   */
  getQueueInfo() {
    return {
      queueLength: this.getQueueLength(),
      isProcessing: this.isQueueProcessing(),
      processingInterval: this.processingInterval,
    };
  }
}

