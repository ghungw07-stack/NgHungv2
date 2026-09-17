// Shared enamel / gemstone surfaces for the game tier list and leaderboard.
// Draw at the card's actual size so the decoration stays sharp in short rows.
const FINISHES = {
  silver: { secondary: "#dfedff", motif: "facets" },
  gold: { secondary: "#ffab45", motif: "facets" },
  platinum: { secondary: "#7de8dc", motif: "facets" },
  emerald: { secondary: "#93e9b5", motif: "facets" },
  ruby: { secondary: "#ff9aae", motif: "facets" },
  diamond: { secondary: "#979aff", motif: "facets" },
  gold_dragon: { secondary: "#ff7938", motif: "scales" },
  huyen_vu: { secondary: "#66d8cc", motif: "scales" },
  bach_ho: { secondary: "#83b7ff", motif: "scales" },
  con_bang: { secondary: "#638bff", motif: "waves" },
  thanh_long: { secondary: "#c9e87a", motif: "scales" },
  chu_tuoc: { secondary: "#ff506e", motif: "waves" },
  ky_lan: { secondary: "#ff9b9b", motif: "scales" },
  hon_don: { secondary: "#a886ff", motif: "orbits" },
  vo_cuc: { secondary: "#82acff", motif: "orbits" },
  can_khon: { secondary: "#f4b5e3", motif: "orbits" },
  vinh_hang: { secondary: "#79f1e8", motif: "orbits" },
  chi_ton: { secondary: "#ffedb0", motif: "crown" },
};

function mix(color, target, amount) {
  const channel = (hex, offset) => parseInt(hex.slice(offset, offset + 2), 16);
  return "#" + [1, 3, 5].map((offset) => {
    const value = channel(color, offset) * (1 - amount) + channel(target, offset) * amount;
    return Math.round(value).toString(16).padStart(2, "0");
  }).join("");
}

// Deep violet and ruby accents need a lighter ink on the colored surfaces.
export function getGameTierTextColor(tier) {
  return mix(tier.color, "#ffffff", 0.38);
}

function roundedRect(ctx, x, y, width, height, radius) {
  ctx.beginPath();
  ctx.roundRect(x, y, width, height, radius);
}

function glow(ctx, x, y, radiusX, radiusY, color, opacity) {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(radiusX, radiusY);
  const light = ctx.createRadialGradient(0, 0, 0, 0, 0, 1);
  light.addColorStop(0, color);
  light.addColorStop(0.45, `${color}80`);
  light.addColorStop(1, `${color}00`);
  ctx.globalAlpha = opacity;
  ctx.fillStyle = light;
  ctx.fillRect(-1, -1, 2, 2);
  ctx.restore();
}

function drawMotif(ctx, motif, color, secondary) {
  // Coordinates are normalized to 1000 × 100; keep detail near the edges.
  ctx.lineWidth = 0.8;
  if (motif === "facets") {
    const facets = [
      [[-40, 0], [158, 0], [265, 100], [38, 100]],
      [[98, 0], [210, 0], [128, 100]],
      [[610, 0], [795, 0], [920, 100]],
      [[810, 0], [1010, 0], [946, 100], [886, 100]],
    ];
    for (const [index, points] of facets.entries()) {
      ctx.beginPath();
      points.forEach(([x, y], pointIndex) => pointIndex ? ctx.lineTo(x, y) : ctx.moveTo(x, y));
      ctx.closePath();
      ctx.fillStyle = index % 2 ? `${secondary}0e` : `${color}16`;
      ctx.fill();
      ctx.strokeStyle = `${secondary}13`;
      ctx.stroke();
    }
  } else if (motif === "scales") {
    ctx.strokeStyle = `${secondary}21`;
    for (let row = -1; row < 4; row++) {
      for (let col = 0; col < 6; col++) {
        ctx.beginPath();
        ctx.ellipse(720 + col * 62 + (row % 2) * 31, row * 35, 31, 27, 0, 0, Math.PI);
        ctx.stroke();
      }
    }
  } else if (motif === "orbits" || motif === "crown") {
    ctx.strokeStyle = `${secondary}28`;
    for (let index = 0; index < 3; index++) {
      ctx.beginPath();
      ctx.ellipse(810, -12, 155 + index * 30, 80 + index * 18, -0.12, 0, Math.PI * 2);
      ctx.stroke();
    }
    if (motif === "crown") {
      for (let index = 0; index < 12; index++) {
        const angle = index * Math.PI / 11;
        ctx.beginPath();
        ctx.moveTo(885 + Math.cos(angle) * 66, 50 + Math.sin(angle) * 36);
        ctx.lineTo(885 + Math.cos(angle) * 96, 50 + Math.sin(angle) * 54);
        ctx.stroke();
      }
    }
  }

  // Satin folds: soft filled ribbons with fine illuminated edges.
  const ribbon = ctx.createLinearGradient(220, 0, 1040, 80);
  ribbon.addColorStop(0, `${color}00`);
  ribbon.addColorStop(0.45, `${color}10`);
  ribbon.addColorStop(0.8, `${secondary}32`);
  ribbon.addColorStop(1, `${color}0a`);
  for (let index = 0; index < 3; index++) {
    const offset = index * 13;
    ctx.beginPath();
    ctx.moveTo(260, -28 + offset);
    ctx.bezierCurveTo(540, 90 + offset, 690, -76 + offset, 1040, 36 + offset);
    ctx.lineTo(1040, 49 + offset);
    ctx.bezierCurveTo(700, -58 + offset, 530, 112 + offset, 260, -28 + offset);
    ctx.closePath();
    ctx.fillStyle = ribbon;
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(260, -28 + offset);
    ctx.bezierCurveTo(540, 90 + offset, 690, -76 + offset, 1040, 36 + offset);
    ctx.strokeStyle = `${secondary}${index === 1 ? "30" : "18"}`;
    ctx.stroke();
  }
  for (let index = 0; index < (motif === "waves" ? 7 : 3); index++) {
    ctx.beginPath();
    ctx.moveTo(-25, 103 - index * 6);
    ctx.bezierCurveTo(155, 22 - index * 8, 310, 146 - index * 4, 635, 107 - index * 2);
    ctx.strokeStyle = `${secondary}${index === 0 ? "38" : "16"}`;
    ctx.stroke();
  }

  // Fixed positions avoid visual noise changing on each render.
  const count = motif === "orbits" || motif === "crown" ? 24 : 12;
  for (let index = 0; index < count; index++) {
    const x = 22 + ((index * 167 + 61) % 954);
    const y = index % 2 ? 88 + (index % 7) : 6 + (index % 9);
    ctx.fillStyle = `${secondary}${index % 4 === 0 ? "8c" : "38"}`;
    ctx.beginPath();
    ctx.arc(x, y, index % 4 === 0 ? 1.1 : 0.65, 0, Math.PI * 2);
    ctx.fill();
  }
}

function drawTierBackgroundImage(ctx, image, x, y, width, height, tier, emphasis) {
  ctx.save();
  // Soft full-bleed wash keeps the card filled without losing the subject.
  const coverScale = Math.max(width / image.width, height / image.height);
  const coverWidth = image.width * coverScale;
  const coverHeight = image.height * coverScale;
  ctx.globalAlpha = emphasis ? 0.13 : 0.09;
  ctx.filter = "blur(5px)";
  ctx.drawImage(image, x + (width - coverWidth) / 2, y + (height - coverHeight) / 2, coverWidth, coverHeight);
  ctx.filter = "none";

  // The original ratio is always visible in the center; no creature or
  // landscape is silently cropped by the short rectangular row.
  const containScale = Math.min((width * 0.92) / image.width, (height * 0.92) / image.height);
  const imageWidth = image.width * containScale;
  const imageHeight = image.height * containScale;
  ctx.globalAlpha = emphasis ? 0.24 : 0.17;
  ctx.drawImage(image, x + (width - imageWidth) / 2, y + (height - imageHeight) / 2, imageWidth, imageHeight);
  ctx.restore();
}

function drawTierArtworkFullBleed(ctx, image, x, y, width, height, emphasis) {
  const scale = Math.max(width / image.width, height / image.height);
  const imageWidth = image.width * scale;
  const imageHeight = image.height * scale;
  ctx.save();
  ctx.globalAlpha = emphasis ? 0.32 : 0.24;
  ctx.drawImage(image, x + (width - imageWidth) / 2, y + (height - imageHeight) / 2, imageWidth, imageHeight);
  ctx.restore();
}

/** Paint a self-contained surface, preserving the caller's drawing state. */
export function drawGameTierBackground(ctx, x, y, width, height, tier, {
  radius = 14,
  prominent = false,
  selected = false,
  background = null,
  backgroundCover = false,
} = {}) {
  const color = tier.color;
  const { secondary, motif } = FINISHES[tier.key] || FINISHES.silver;
  const highlight = mix(color, "#ffffff", 0.6);
  const emphasis = selected || prominent;
  const r = Math.min(radius, height / 2, width / 2);

  ctx.save();
  ctx.shadowColor = selected ? `${color}50` : "#00000060";
  ctx.shadowBlur = selected ? 14 : 9;
  ctx.shadowOffsetY = selected ? 0 : 3;
  roundedRect(ctx, x, y, width, height, r);
  ctx.fillStyle = "#080d17";
  ctx.fill();
  ctx.shadowColor = "transparent";
  ctx.shadowBlur = 0;
  ctx.shadowOffsetY = 0;

  ctx.save();
  roundedRect(ctx, x, y, width, height, r);
  ctx.clip();
  const base = ctx.createLinearGradient(x, y, x + width, y + height);
  base.addColorStop(0, mix(color, "#09111e", emphasis ? 0.71 : 0.79));
  base.addColorStop(0.3, mix(tier.dark, "#101725", 0.45));
  base.addColorStop(0.62, mix(tier.deep, "#080e1b", 0.82));
  base.addColorStop(1, mix(secondary, "#090e1b", emphasis ? 0.75 : 0.83));
  ctx.fillStyle = base;
  ctx.fillRect(x, y, width, height);

  glow(ctx, x + width * 0.05, y + height * 0.15, width * 0.31, height * 1.4, color, emphasis ? 0.22 : 0.15);
  glow(ctx, x + width * 0.87, y + height * 1.1, width * 0.34, height * 1.7, secondary, emphasis ? 0.29 : 0.2);

  ctx.save();
  ctx.translate(x, y);
  ctx.scale(width / 1000, height / 100);
  drawMotif(ctx, motif, color, secondary);
  ctx.restore();

  // A quiet center keeps player names and all three tier values readable.
  const shade = ctx.createLinearGradient(x, y, x + width, y);
  shade.addColorStop(0, "#03071200");
  shade.addColorStop(0.24, "#03071220");
  shade.addColorStop(0.47, "#03071268");
  shade.addColorStop(0.76, "#03071240");
  shade.addColorStop(1, "#03071208");
  ctx.fillStyle = shade;
  ctx.fillRect(x, y, width, height);

  if (background) {
    if (backgroundCover) drawTierArtworkFullBleed(ctx, background, x, y, width, height, emphasis);
    else drawTierBackgroundImage(ctx, background, x, y, width, height, tier, emphasis);
  }

  const gloss = ctx.createLinearGradient(x, y, x, y + height);
  gloss.addColorStop(0, "#ffffff0c");
  gloss.addColorStop(0.25, "#ffffff00");
  gloss.addColorStop(0.75, "#00000000");
  gloss.addColorStop(1, "#00000030");
  ctx.fillStyle = gloss;
  ctx.fillRect(x, y, width, height);
  ctx.restore();

  // Beveled metal rim and a short light rail, distinct from the text layer.
  const rim = ctx.createLinearGradient(x, y, x + width, y + height);
  rim.addColorStop(0, `${highlight}${emphasis ? "db" : "90"}`);
  rim.addColorStop(0.3, `${color}${emphasis ? "a0" : "48"}`);
  rim.addColorStop(0.62, `${secondary}30`);
  rim.addColorStop(1, `${secondary}${emphasis ? "cf" : "85"}`);
  roundedRect(ctx, x + 0.75, y + 0.75, width - 1.5, height - 1.5, r);
  ctx.strokeStyle = rim;
  ctx.lineWidth = selected ? 2 : 1.2;
  ctx.stroke();
  roundedRect(ctx, x + 3, y + 3, width - 6, height - 6, Math.max(1, r - 3));
  ctx.strokeStyle = "#ffffff09";
  ctx.lineWidth = 0.6;
  ctx.stroke();

  const rail = ctx.createLinearGradient(x, y + height * 0.24, x, y + height * 0.76);
  rail.addColorStop(0, `${highlight}50`);
  rail.addColorStop(0.5, highlight);
  rail.addColorStop(1, `${color}70`);
  roundedRect(ctx, x + 3, y + height * 0.24, selected ? 3 : 2, height * 0.52, 1);
  ctx.fillStyle = rail;
  ctx.fill();
  ctx.restore();
}
