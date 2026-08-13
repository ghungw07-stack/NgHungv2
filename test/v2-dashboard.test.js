import assert from "node:assert/strict";
import test from "node:test";
import { dashboardHtml } from "../src-v2/web/dashboard.js";

test("dashboard is self-contained and never embeds secret config fields", () => {
  const html = dashboardHtml();
  assert.match(html, /NGH Bot/);
  assert.match(html, /\/api\/metrics/);
  assert.match(html, /RAM tiến trình/);
  assert.doesNotMatch(html, /cookie|GEMINI_API_KEY|WEBHOOK_SECRET/i);
  assert.doesNotMatch(html, /https?:\/\//i);
});
