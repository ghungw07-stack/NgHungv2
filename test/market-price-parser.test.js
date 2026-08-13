import test from "node:test";
import assert from "node:assert/strict";

import { parseFuelPriceHtml, parseGoldPriceHtml } from "../src/utils/market-price-parser.js";

test("đọc bảng giá xăng dầu vùng 1 và vùng 2", () => {
  const html = `<table><tr><th>Sản phẩm</th><th>Vùng 1</th><th>Vùng 2</th></tr>
    <tr><td>Xăng E5 RON 92-II</td><td>20.880</td><td>21.290</td></tr>
    <tr><td>Dầu DO 0,05S-II</td><td>25.760</td><td>26.270</td></tr></table>`;

  assert.deepEqual(parseFuelPriceHtml(html), [
    { name: "Xăng E5 RON 92-II", region1: "20.880", region2: "21.290" },
    { name: "Dầu DO 0,05S-II", region1: "25.760", region2: "26.270" },
  ]);
});

test("đọc bảng giá vàng tổng hợp", () => {
  const html = `<table><tr><th>Loại vàng</th><th>Mua vào</th><th>Bán ra</th><th>Cập nhật</th></tr>
    <tr><td>Vàng miếng SJC</td><td>141.300</td><td>144.300</td><td>Hôm nay</td></tr></table>`;
  assert.deepEqual(parseGoldPriceHtml(html), [
    { name: "Vàng miếng SJC", buy: "141.300", sell: "144.300" },
  ]);
});
