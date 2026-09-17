import { base, heading, footer, box, text, font, lines, avatar, imageSource, palette, save } from "./style-v2.js";

export async function renderCollectionStyle(style, model = {}, prefix = "collection") {
  const width = 1080;
  const items = Array.isArray(model.items) ? model.items : [];
  const probe = base(width, 1).ctx;
  const top = heading(probe, model, width);
  const heights = items.map(item => {
    const available = width - (item.image ? 270 : 174);
    font(probe, 25, true); const title = lines(probe, item.title || "—", available).length * 36;
    font(probe, 20); const detail = [item.subtitle, item.meta].filter(v => v != null && v !== "").reduce((n, v) => n + lines(probe, v, available).length * 30 + 8, 0);
    return Math.max(106, title + detail + 36);
 });
  font(probe, 17); const footHeight = Math.min(4, lines(probe, model.footer || "NGH BOT", width - 80).length) * 26;
  const contentHeight = heights.reduce((sum, h) => sum + h + 12, 0) || 104;
  const { canvas, ctx } = base(width, Math.ceil(top + contentHeight + footHeight + 72));
  heading(ctx, model, width);
  let y = top;
  for (let index = 0; index < items.length; index++) {
    const item = items[index], h = heights[index];
    box(ctx, 40, y, width - 80, h);
    box(ctx, 58, y + 20, 52, 38, palette.soft, 12);
    text(ctx, item.badge ?? String(index + 1).padStart(2, "0"), 66, y + 27, 40, { size: 17, bold: true, color: palette.accent, maxLines: 1 });
    let x = 130;
    if (item.image) {
      let image; try { image = await imageSource(item.image); } catch {}
      avatar(ctx, image, item.title, x, y + 20, 72); x += 96;
    }
    const available = width - x - 44;
    let rowY = y + 18;
    rowY += text(ctx, item.title || "—", x, rowY, available, { size: 25, bold: true, lineHeight: 36 });
    for (const [value, color] of [[item.subtitle, palette.muted], [item.meta, palette.accent]]) {
      if (value != null && value !== "") { rowY += 8; rowY += text(ctx, value, x, rowY, available, { size: 20, color, lineHeight: 30 }); }
    }
    y += h + 12;
  }
  if (!items.length) { box(ctx, 40, y, width - 80, 88); text(ctx, "Chưa có dữ liệu", 64, y + 28, width - 128, { color: palette.muted }); y += 104; }
  footer(ctx, model.footer, width, y + 10);
  return save(canvas, prefix);
}
