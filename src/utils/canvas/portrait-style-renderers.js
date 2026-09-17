import { base, heading, footer, box, text, font, lines, avatar, imageSource, palette, save } from "./style-v2.js";

export async function renderPortraitStyle(style, model = {}, prefix = "portrait") {
  const width = 1080, probe = base(width, 1).ctx;
  const top = heading(probe, model, width);
  const names = model.names?.length ? model.names : ["Thành viên"];
  const pair = names.length > 1;
  const nameWidth = pair ? 440 : 742;
  font(probe, 30, true);
  const nameHeight = Math.max(...names.map(name => lines(probe, name, nameWidth).length * 45));
  const profileH = pair ? 178 + nameHeight : Math.max(158, nameHeight + 56);
  const statW = 460;
  font(probe, 28, true);
  const statH = Math.max(...[model.primaryValue, model.secondaryValue].map(v => lines(probe, v || "—", statW - 40).length * 42)) + 76;
  font(probe, 23);
  const bodyH = model.body ? lines(probe, model.body, width - 128).length * 35 + 44 : 0;
  font(probe, 17); const footH = Math.min(4, lines(probe, model.footer || "NGH BOT", width - 80).length) * 26;
  const { canvas, ctx } = base(width, Math.ceil(top + profileH + statH + bodyH + footH + 112));
  heading(ctx, model, width);
  box(ctx, 40, top, width - 80, profileH);
  for (let i = 0; i < names.length; i++) {
    let image; try { image = await imageSource(model.avatars?.[i]); } catch {}
    if (pair) {
      const colW = (width - 80) / names.length, x = 40 + i * colW;
      avatar(ctx, image, names[i], x + colW / 2 - 56, top + 22, 112);
      text(ctx, names[i], x + 24, top + 148, colW - 48, { size: 30, bold: true, lineHeight: 45 });
    } else {
      avatar(ctx, image, names[i], 64, top + (profileH - 112) / 2, 112);
      text(ctx, names[i], 206, top + (profileH - nameHeight) / 2, nameWidth, { size: 30, bold: true, lineHeight: 45 });
    }
  }
  let y = top + profileH + 16;
  [[model.primaryLabel, model.primaryValue], [model.secondaryLabel, model.secondaryValue]].forEach(([label, value], i) => {
    const x = 40 + i * 510;
    box(ctx, x, y, 490, statH, i === 0 ? palette.soft : palette.paper);
    text(ctx, label || "THÔNG TIN", x + 24, y + 20, 442, { size: 16, color: palette.muted, bold: true, maxLines: 1 });
    text(ctx, value || "—", x + 24, y + 54, 420, { size: 28, bold: true, lineHeight: 42, color: i === 0 ? palette.accent : palette.ink });
  });
  y += statH + 16;
  if (model.body) { box(ctx, 40, y, width - 80, bodyH); text(ctx, model.body, 64, y + 20, width - 128, { size: 23, lineHeight: 35 }); y += bodyH + 16; }
  footer(ctx, model.footer, width, y + 8);
  return save(canvas, prefix);
}

export async function renderMemberEventStyle(model = {}, prefix = "member") {
  const width = 1080, height = 360;
  const { canvas, ctx } = base(width, height);
  box(ctx, 28, 24, width - 56, height - 48, "rgba(6,18,30,.68)", 28);
  let image; try { image = await imageSource(model.avatars?.[0]); } catch {}
  avatar(ctx, image, model.names?.[0], 60, 74, 212);
  text(ctx, model.kicker || "MEMBER EVENT", 316, 64, 680, { size: 16, bold: true, color: palette.accent, maxLines: 1 });
  text(ctx, model.title || "THÔNG BÁO NHÓM", 316, 98, 680, { size: 34, bold: true, maxLines: 2, lineHeight: 42 });
  text(ctx, model.names?.[0] || "Thành viên", 316, 188, 680, { size: 25, bold: true, maxLines: 1 });
  box(ctx, 316, 232, 204, 52, palette.soft, 16);
  text(ctx, model.primaryValue || "WELCOME", 336, 246, 166, { size: 18, bold: true, color: palette.accent, maxLines: 1 });
  text(ctx, `${model.secondaryLabel || "NHÓM"}: ${model.secondaryValue || ""}`, 548, 246, 420, { size: 18, color: palette.muted, maxLines: 1 });
  footer(ctx, model.footer || model.body, width, 316);
  return save(canvas, prefix);
}
