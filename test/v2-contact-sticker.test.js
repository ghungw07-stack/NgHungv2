import assert from "node:assert/strict";
import test from "node:test";
import { replyMediaUrl } from "../src-v2/modules/stickers/commands.js";

test("sticker command resolves media URL from replied photo", () => {
  assert.equal(replyMediaUrl({ data: { quote: { content: { href: "https://cdn/photo.jpg" } } } }), "https://cdn/photo.jpg");
  assert.equal(replyMediaUrl({ data: { quote: { content: "text" } } }), null);
});
