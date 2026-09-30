import assert from "node:assert/strict";
import test from "node:test";
import {
  createGameCaptchaImage,
  enforceGameCaptcha,
  GAME_CAPTCHA_ACTION_LIMIT,
  GAME_CAPTCHA_BYPASS_LIMIT,
  GAME_CAPTCHA_LOCK_MS,
  GAME_CAPTCHA_WINDOW_MS,
  handleGameCaptchaMessage,
  nextGameCaptchaWindow,
} from "../src/service-ngh/game-service/game-captcha.js";
import { configureDatabaseState } from "../src/database/state.js";

class FakeCollection {
  constructor() {
    this.documents = new Map();
  }

  async findOne({ playerId }) {
    return this.documents.has(playerId) ? structuredClone(this.documents.get(playerId)) : null;
  }

  async updateOne({ playerId }, update) {
    const document = this.documents.get(playerId) || { playerId };
    Object.assign(document, update.$set || {});
    for (const [key, amount] of Object.entries(update.$inc || {})) document[key] = (document[key] || 0) + amount;
    this.documents.set(playerId, document);
  }

  async deleteOne({ playerId }) {
    this.documents.delete(playerId);
  }
}

const captchaCollection = new FakeCollection();
configureDatabaseState({ databaseConnection: { collection: () => captchaCollection } });

function fakeApi(messages) {
  return {
    sendMessage: async (payload) => messages.push(payload),
    apiManager: {
      getDataConfig: () => ({ infoOwner: { nameServer: "Captcha Test" } }),
      getDataManager: () => ({}),
    },
  };
}

function fakeMessage(playerId, content = "!tx tai 1000") {
  return { threadId: "group", type: 1, data: { uidFrom: playerId, dName: "Người Test", content } };
}

test("captcha game tạo ảnh PNG với mã 6 số", () => {
  const challenge = createGameCaptchaImage();
  assert.match(challenge.answer, /^\d{6}$/u);
  assert.deepEqual([...challenge.image.subarray(0, 8)], [137, 80, 78, 71, 13, 10, 26, 10]);
  assert.equal(createGameCaptchaImage("123456").answer, "123456");
});

test("captcha bật khi chơi quá 7 lượt trong 30 giây", () => {
  let timestamps = [];
  for (let count = 1; count <= GAME_CAPTCHA_ACTION_LIMIT + 1; count++) {
    const result = nextGameCaptchaWindow(timestamps, 1_000 + count);
    timestamps = result.timestamps;
    assert.equal(result.triggered, count > GAME_CAPTCHA_ACTION_LIMIT);
  }

  const expired = nextGameCaptchaWindow(timestamps, 1_000 + GAME_CAPTCHA_WINDOW_MS + 20);
  assert.equal(expired.triggered, false);
  assert.equal(expired.timestamps.length, 1);
});

test("lượt game thứ 8 bật captcha và nhập đúng mở lại game", async () => {
  const playerId = "captcha-player-pass";
  const messages = [];
  const api = fakeApi(messages);
  let message;

  for (let count = 1; count <= GAME_CAPTCHA_ACTION_LIMIT + 1; count++) {
    message = fakeMessage(playerId);
    const allowed = await enforceGameCaptcha(api, message, 10_000 + count);
    assert.equal(allowed, count <= GAME_CAPTCHA_ACTION_LIMIT);
  }
  const record = await captchaCollection.findOne({ playerId });
  assert.match(record.answer, /^\d{6}$/u);
  assert.equal(messages.length, 1);
  assert.equal(messages[0].quote, message);
  assert.equal(messages[0].mentions[0].uid, playerId);
  assert.match(messages[0].msg, /Captcha Test/u);
  assert.ok(messages[0].style);

  const handled = await handleGameCaptchaMessage(api, fakeMessage(playerId, record.answer), 11_000);
  assert.equal(handled, true);
  assert.equal(await captchaCollection.findOne({ playerId }), null);
  assert.match(messages.at(-1).msg, /thành công/iu);
});

test("cổng command và handler không đếm trùng cùng một tin game", async () => {
  const playerId = "captcha-player-two-gates";
  const messages = [];
  const api = fakeApi(messages);
  for (let count = 1; count <= GAME_CAPTCHA_ACTION_LIMIT; count++) {
    const message = fakeMessage(playerId);
    assert.equal(await enforceGameCaptcha(api, message, 15_000 + count), true);
    assert.equal(await enforceGameCaptcha(api, message, 15_000 + count + 0.1), true);
  }
  assert.equal(await enforceGameCaptcha(api, fakeMessage(playerId), 16_000), false);
});

test("spam thêm 4 lệnh game khi chưa giải captcha mới khóa 30 phút", async () => {
  const playerId = "captcha-player-lock";
  const messages = [];
  const api = fakeApi(messages);
  let message;

  for (let count = 1; count <= GAME_CAPTCHA_ACTION_LIMIT + 1; count++) {
    message = fakeMessage(playerId);
    await enforceGameCaptcha(api, message, 20_000 + count);
  }
  for (let count = 1; count < GAME_CAPTCHA_BYPASS_LIMIT; count++) {
    message = fakeMessage(playerId);
    assert.equal(await enforceGameCaptcha(api, message, 21_000 + count), false);
    const pending = await captchaCollection.findOne({ playerId });
    assert.equal(pending.gameAttempts, count);
    assert.match(pending.answer, /^\d{6}$/u);
    assert.match(messages.at(-1).msg, /Xác thực captcha để chơi tiếp\nGửi mã để xem lại captcha/u);
  }
  const lockTime = 22_000;
  message = fakeMessage(playerId);
  assert.equal(await enforceGameCaptcha(api, message, lockTime), false);
  const record = await captchaCollection.findOne({ playerId });
  assert.equal(new Date(record.lockedUntil).getTime(), lockTime + GAME_CAPTCHA_LOCK_MS);
  assert.equal(record.answer, null);
  assert.equal(record.gameAttempts, GAME_CAPTCHA_BYPASS_LIMIT);
});
