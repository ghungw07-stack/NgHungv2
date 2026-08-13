import { MongoClient } from "mongodb";

export class MongoDatabase {
  #client;
  #db;
  constructor(config, logger) {
    this.config = config;
    this.logger = logger;
  }
  async start() {
    this.#client = new MongoClient(this.config.uri, { maxPoolSize: 20, minPoolSize: 0 });
    await this.#client.connect();
    this.#db = this.#client.db(this.config.name);
    await this.#db.command({ ping: 1 });
    this.logger.info("MongoDB đã kết nối", { database: this.config.name });
  }
  collection(name) {
    if (!this.#db) throw new Error("MongoDB chưa được khởi tạo");
    return this.#db.collection(name);
  }
  async stop() {
    await this.#client?.close();
    this.#client = null;
    this.#db = null;
  }
}
