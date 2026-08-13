import assert from "node:assert/strict";
import test from "node:test";
import { ParentRelayService } from "../src-v2/modules/parent-relay/service.js";

test("child forwards private messages to parent with persistent target ID", async () => {
  const sent = [];
  const service = new ParentRelayService({
    client: { botId: "child", api: { async sendMessage(...args) { sent.push(args); } } },
    identity: { isMain: false, mainBotId: "main", ownerId: "owner", name: "Bot A" },
    logger: { warn() {} },
  });
  const handled = await service.handle({ type: 0, data: { uidFrom: "user", dName: "Hưng", content: "Xin chào" } });
  assert.equal(handled, false);
  assert.equal(sent[0][1], "main");
  assert.match(sent[0][0].msg, /^🆔 ID người gửi: user$/m);
  assert.match(sent[0][0].msg, /không cần tag/);
});

test("parent reply is routed back through the child without a tag", async () => {
  const sent = [];
  const service = new ParentRelayService({
    client: { botId: "child", api: { async sendMessage(...args) { sent.push(args); } } },
    identity: { isMain: false, mainBotId: "main", ownerId: "owner" },
    logger: { warn() {} },
  });
  const handled = await service.handle({
    type: 0,
    data: { uidFrom: "main", content: "Chào bạn", quote: { content: "Thông báo\n🆔 ID người gửi: user123\nReply" } },
  });
  assert.equal(handled, true);
  assert.deepEqual(sent[0], [{ msg: "Chào bạn" }, "user123", 0]);
});

test("main bot never activates child relay", async () => {
  const service = new ParentRelayService({ client: {}, identity: { isMain: true, mainBotId: "main" }, logger: {} });
  assert.equal(await service.handle({ type: 0, data: { uidFrom: "u" } }), false);
});
