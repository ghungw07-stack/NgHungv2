import { AsyncLocalStorage } from "node:async_hooks";
export const DEFAULT_CANVAS_STYLE = 1;
const context = new AsyncLocalStorage();
export function normalizeCanvasStyle(style) {
  return String(style).trim().toLowerCase().replace(/^v/, "") === "2" ? 2 : 1;
}
export function getCanvasStylePreset(style) {
  const id = normalizeCanvasStyle(style);
  return { id, name: id === 2 ? "Tối giản" : "Nguyên bản" };
}
export function getBotCanvasStyle(apiOrId) {
  return DEFAULT_CANVAS_STYLE;
}
export function getActiveCanvasStyle() {
  return DEFAULT_CANVAS_STYLE;
}
export function runWithBotCanvasStyle(api, callback) {
  if (typeof callback !== "function") throw new TypeError("runWithBotCanvasStyle cần một callback");
  // Resolve on each render: scheduled jobs must see later setting changes.
  return context.run(api, callback);
}
