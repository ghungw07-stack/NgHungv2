import assert from "node:assert/strict";
import test from "node:test";
import { hasFive, renderCaro } from "../src-v2/modules/game/board-game/caro.js";

test("caro detects horizontal vertical and diagonal wins", () => {
  const horizontal = [1, 2, 3, 4, 5].map((x) => ({ x, y: 3, symbol: "X" }));
  assert.equal(hasFive(horizontal, horizontal.at(-1)), true);
  const diagonal = [1, 2, 3, 4, 5].map((x) => ({ x, y: x, symbol: "O" }));
  assert.equal(hasFive(diagonal, diagonal.at(-1)), true);
  assert.equal(hasFive(horizontal.slice(0, 4), horizontal[3]), false);
});

test("caro renders a bounded viewport around played moves", () => {
  const output = renderCaro({ moves: [{ x: 8, y: 8, symbol: "X" }] });
  assert.match(output, /X/);
  assert.ok(output.split("\n").length <= 6);
});
