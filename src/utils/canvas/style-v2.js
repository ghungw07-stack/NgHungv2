import { createCanvas, registerFont, loadImage } from "canvas";
import { mkdir, writeFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";
import path from "node:path";

const fontRoot = fileURLToPath(new URL("../../../assets/fonts/", import.meta.url));
registerFont(path.join(fontRoot, "BeVietnamPro-Bold.ttf"), { family: "CanvasV2", weight: "700" });
registerFont(path.join(fontRoot, "Poppins-Regular.ttf"), { family: "CanvasV2", weight: "400" });
// V2 giữ nền tối, panel kính và màu chuyển sắc của V1; thay đổi nằm ở
// khoảng thở, viền mảnh và các điểm nhấn dễ đọc hơn trên Zalo.
export const palette = {
  bg: "#0b1724",
  paper: "rgba(10, 25, 38, .78)",
  ink: "#f4fbff",
  muted: "#b3cbd5",
  accent: "#62f2ce",
  soft: "rgba(98, 242, 206, .16)",
  line: "rgba(255,255,255,.18)",
};
export function box(ctx, x, y, w, h, color = palette.paper, radius = 22) {
  ctx.beginPath(); ctx.roundRect(x, y, w, h, radius); ctx.fillStyle = color; ctx.fill();
}
export function font(ctx, size = 24, bold = false) { ctx.font = `${bold ? 700 : 400} ${size}px CanvasV2, sans-serif`; }
export function lines(ctx, value, width) {
  const result = [];
  for (const paragraph of String(value ?? "").split(/\n/)) {
    let line = "";
    for (const word of paragraph.split(/\s+/).filter(Boolean)) {
      if (line && ctx.measureText(`${line} ${word}`).width > width) { result.push(line); line = ""; }
      for (const character of (line ? ` ${word}` : word)) {
        if (line && ctx.measureText(line + character).width > width) { result.push(line); line = ""; }
        line += character;
      }
    }
    result.push(line);
  }
  return result;
}
export function text(ctx, value, x, y, width, { size = 24, bold = false, color = palette.ink, maxLines = Infinity, lineHeight = size * 1.5 } = {}) {
  font(ctx, size, bold); ctx.fillStyle = color; ctx.textAlign = "left"; ctx.textBaseline = "top";
  const all = lines(ctx, value, width), visible = all.slice(0, maxLines);
  if (all.length > maxLines && visible.length) {
    let last = visible.at(-1);
    while (last && ctx.measureText(last + "…").width > width) last = last.slice(0, -1);
    visible[visible.length - 1] = last + "…";
  }
  visible.forEach((line, i) => ctx.fillText(line, x, y + i * lineHeight));
  return visible.length * lineHeight;
}
export function base(width, height) {
  const canvas = createCanvas(width, height), ctx = canvas.getContext("2d");
  const background = ctx.createLinearGradient(0, 0, width, height);
  background.addColorStop(0, "#17245c");
  background.addColorStop(.52, "#12637a");
  background.addColorStop(1, "#123b46");
  ctx.fillStyle = background; ctx.fillRect(0, 0, width, height);
  const glow = ctx.createRadialGradient(width * .84, height * .04, 0, width * .84, height * .04, width * .42);
  glow.addColorStop(0, "rgba(98,242,206,.22)"); glow.addColorStop(1, "rgba(98,242,206,0)");
  ctx.fillStyle = glow; ctx.fillRect(0, 0, width, height);
  ctx.fillStyle = "rgba(3,10,18,.16)"; ctx.fillRect(0, 0, width, height);
  box(ctx, 40, 40, 52, 7, palette.accent, 3);
  return { canvas, ctx };
}
export function heading(ctx, model, width) {
  text(ctx, String(model.kicker || "NGH BOT").replace(/^MYBOT\s*•\s*/, ""), 40, 65, width - 80, { size: 16, color: palette.accent, bold: true, maxLines: 1 });
  let y = 103;
  y += text(ctx, model.title || "THÔNG TIN", 40, y, width - 80, { size: 36, bold: true, maxLines: 3 });
  if (model.subtitle) y += 10 + text(ctx, model.subtitle, 40, y + 10, width - 80, { size: 21, color: palette.muted, maxLines: 4 });
  return y + 28;
}
export function footer(ctx, value, width, y) {
  ctx.fillStyle = palette.line; ctx.fillRect(40, y, width - 80, 1);
  return text(ctx, value || "NGH BOT", 40, y + 18, width - 80, { size: 17, color: palette.muted, maxLines: 4 });
}
export async function save(canvas, prefix = "canvas") {
  const dir = path.resolve("assets/temp"); await mkdir(dir, { recursive: true });
  const output = path.join(dir, `${String(prefix).replace(/[^a-z0-9_-]/gi, "_")}_v2_${randomUUID()}.png`);
  const buffer = await new Promise((resolve, reject) => canvas.toBuffer((error, data) => error ? reject(error) : resolve(data), "image/png"));
  await writeFile(output, buffer); return output;
}
export async function imageSource(image) {
  if (!image) return null;
  if (typeof image === "string" || Buffer.isBuffer(image)) return loadImage(image);
  // Bridge Skia images/canvases used by some existing callers to node-canvas.
  if (image.constructor?.name === "Image" && image.complete !== undefined) return image;
  if (typeof image.toBuffer === "function") return loadImage(await image.toBuffer("image/png"));
  return image;
}
export function avatar(ctx, image, name, x, y, size) {
  box(ctx, x, y, size, size, palette.soft, size / 2);
  ctx.save(); ctx.beginPath(); ctx.arc(x + size / 2, y + size / 2, size / 2, 0, Math.PI * 2); ctx.clip();
  if (image) {
    const scale = Math.max(size / image.width, size / image.height);
    ctx.drawImage(image, x + (size - image.width * scale) / 2, y + (size - image.height * scale) / 2, image.width * scale, image.height * scale);
  } else {
    font(ctx, size * .4, true); ctx.textAlign = "center"; ctx.textBaseline = "middle"; ctx.fillStyle = palette.accent;
    ctx.fillText(String(name || "?").trim().charAt(0).toUpperCase(), x + size / 2, y + size / 2);
  }
  ctx.restore();
}
