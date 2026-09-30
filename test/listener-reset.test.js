import assert from "node:assert/strict";
import test from "node:test";
import WebSocket from "ws";

import { Listener } from "../src/api-zalo/apis/listen.js";

test("reset không làm process lỗi khi WebSocket còn đang kết nối", async () => {
  const listener = Object.create(Listener.prototype);
  const socket = new WebSocket("ws://127.0.0.1:1");
  listener.ws = socket;
  listener.retryTimer = null;
  listener.pingInterval = null;

  listener.reset();
  await new Promise((resolve) => setTimeout(resolve, 50));

  assert.equal(listener.ws, null);
  assert.equal(socket.readyState, WebSocket.CLOSED);
});
