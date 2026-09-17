import { base, heading, footer, box, text, palette, save } from "./style-v2.js";

export async function renderMenuStyle(style, { botName = "NGH BOT", commands = [], page = 1, totalPages = 1, totalCommands = commands.length } = {}) {
  // Giữ đúng tỷ lệ menu V1 (4 cột × 3 hàng), chỉ làm card thoáng hơn và
  // thêm một dải màu nhỏ để người dùng nhận ra đang ở V2.
  const width = 2048, columns = 4, gap = 36, cardW = (width - 68 - gap * 3) / columns, cardH = 190;
  const title = { kicker: "DANH SÁCH LỆNH", title: botName, subtitle: `${totalCommands} lệnh  ·  Trang ${page} / ${totalPages}` };
  const top = heading(base(width, 1).ctx, title, width);
  const height = 938;
  const { canvas, ctx } = base(width, Math.ceil(height));
  heading(ctx, title, width);
  commands.forEach((command, index) => {
    const x = 40 + (index % columns) * (cardW + gap), y = top + Math.floor(index / columns) * (cardH + gap);
    box(ctx, x, y, cardW, cardH, "rgba(7,20,34,.62)", 30);
    ctx.strokeStyle = index % 4 === 0 ? "rgba(98,242,206,.58)" : "rgba(255,255,255,.18)";
    ctx.lineWidth = index % 4 === 0 ? 2.5 : 1;
    ctx.stroke();
    text(ctx, command.name || command.command || "Lệnh", x + 22, y + 20, cardW - 44, { size: 27, bold: true, maxLines: 1 });
    text(ctx, command.description || "", x + 22, y + 66, cardW - 44, { size: 19, color: palette.muted, maxLines: 2, lineHeight: 28 });
    const admin = command.permission && command.permission !== "all";
    box(ctx, x + 22, y + cardH - 39, admin ? 102 : 110, 25, admin ? "#fff1d9" : palette.soft, 8);
    text(ctx, admin ? "QUẢN TRỊ" : "THÀNH VIÊN", x + 31, y + cardH - 35, 106, { size: 12, bold: true, color: admin ? "#8b5f1c" : palette.accent, maxLines: 1 });
  });
  footer(ctx, "Chọn lệnh bạn cần · Dùng help để xem hướng dẫn", width, height - 78);
  return save(canvas, "menu");
}
