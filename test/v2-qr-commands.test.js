import assert from "node:assert/strict";
import test from "node:test";
import { CommandRegistry } from "../src-v2/core/commands/registry.js";
import { registerQrCommands, resolveQrImageUrl } from "../src-v2/modules/qr/commands.js";

test("scanqr resolves image from replied Zalo photo", () => {
  assert.equal(resolveQrImageUrl({ data: { quote: { content: { href: "https://cdn/image.jpg" } } } }, []), "https://cdn/image.jpg");
});

test("qrcode sends generated file and always removes it", async () => {
  let removed;
  let payload;
  const registry = new CommandRegistry();
  registerQrCommands(registry, {
    qr: { async create() { return "/tmp/code.png"; }, tempFiles: { async remove(file) { removed = file; } } },
    client: { api: { async sendMessage(value) { payload = value; } } },
  });
  await registry.resolve("createqr").execute({ args: ["hello"], threadId: "g", type: 1, reply: async () => {} });
  assert.deepEqual(payload.attachments, ["/tmp/code.png"]);
  assert.equal(removed, "/tmp/code.png");
});
