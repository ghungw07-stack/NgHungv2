class AsyncTask {
  constructor() {
    this.promises = new Map();
  }

  runAsync(key, task) {
    if (!this.promises.has(key)) {
      this.promises.set(key, task());
    }
  }

  async waitResult(key) {
    if (this.promises.has(key)) {
      return await this.promises.get(key);
    } else {
      throw new Error(`No async task has been started for key: ${key}`);
    }
  }
}

export const asyncTaskManager = new AsyncTask();
