import test from "node:test";
import assert from "node:assert/strict";

import { buildBaccaratRoad } from "../src/service-ngh/game-service/baccarat/rules.js";

test("baccarat road xếp chuỗi, tràn hàng và gắn kết quả hòa", () => {
  const history = [
    { door: "hòa" },
    ...Array.from({ length: 7 }, () => ({ door: "con" })),
    { door: "hòa" },
    { door: "cái" },
    { door: "cái" },
  ];

  assert.deepEqual(buildBaccaratRoad(history), [
    { column: 0, row: 0, door: "con", ties: 1 },
    { column: 0, row: 1, door: "con", ties: 0 },
    { column: 0, row: 2, door: "con", ties: 0 },
    { column: 0, row: 3, door: "con", ties: 0 },
    { column: 0, row: 4, door: "con", ties: 0 },
    { column: 0, row: 5, door: "con", ties: 0 },
    { column: 1, row: 5, door: "con", ties: 1 },
    { column: 1, row: 0, door: "cái", ties: 0 },
    { column: 1, row: 1, door: "cái", ties: 0 },
  ]);
});
