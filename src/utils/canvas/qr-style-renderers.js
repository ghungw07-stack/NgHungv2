import { base, heading, footer, box, text, palette } from "./style-v2.js";

// Synchronous Canvas return is used by bank, login and business-card callers.
export function renderQrStyle(style, model = {}) {
  const width = 1080;
  const probe = base(width, 1).ctx, top = heading(probe, model, width);
  const { canvas, ctx } = base(width, Math.ceil(top + 640));
  heading(ctx, model, width);
  box(ctx, 40, top, 490, 490);
  // Keep the original QR pixels and a generous white quiet zone.
  ctx.imageSmoothingEnabled = false;
  if (model.qrImage) ctx.drawImage(model.qrImage, 75, top + 35, 420, 420);
  ctx.imageSmoothingEnabled = true;
  let y = top + 24;
  for (const [label, value] of [[model.label, model.value], [model.secondaryLabel, model.secondaryValue]]) {
    text(ctx, label || "THÔNG TIN", 562, y, 470, { size: 17, bold: true, color: palette.muted, maxLines: 2 });
    y += 57;
    y += text(ctx, value || "—", 562, y, 470, { size: 27, bold: true, maxLines: 4 });
    y += 30;
  }
  if (model.expiry) text(ctx, model.expiry, 64, top + 508, 952, { size: 20, color: palette.accent, maxLines: 2 });
  footer(ctx, model.footer, width, top + 564);
  return canvas;
}
