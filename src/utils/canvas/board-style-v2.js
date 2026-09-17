import { base, heading, footer, box, text, palette, save } from "./style-v2.js";

/** Numbered cells retain game positions; selected and losing cells use distinct labels. */
export async function renderBoardV2({ title, subtitle, cells = [], columns = 5, footer: note = "", cellHeight = 100 }, prefix = "board") {
  const width = 1080, gap = 12;
  const model = { title, subtitle, kicker: "TRÒ CHƠI" };
  const top = heading(base(width, 1).ctx, model, width);
  const rows = Math.ceil(cells.length / columns), cellW = (1000 - gap * (columns - 1)) / columns;
  const { canvas, ctx } = base(width, Math.ceil(top + rows * (cellHeight + gap) + 180));
  heading(ctx, model, width);
  cells.forEach((cell, index) => {
    const x = 40 + (index % columns) * (cellW + gap), y = top + Math.floor(index / columns) * (cellHeight + gap);
    const bad = cell.state === "lost", active = cell.state === "selected";
    box(ctx, x, y, cellW, cellHeight, bad ? "#fbe5e2" : active ? palette.soft : palette.paper, 16);
    const color = bad ? "#a33432" : active ? palette.accent : palette.ink;
    text(ctx, cell.label, x + 14, y + 14, cellW - 28, { size: 27, bold: true, color, maxLines: 2 });
    if (cell.detail) text(ctx, cell.detail, x + 14, y + cellHeight - 35, cellW - 28, { size: 16, color, maxLines: 1 });
  });
  footer(ctx, note, width, top + rows * (cellHeight + gap) + 16);
  return save(canvas, prefix);
}
