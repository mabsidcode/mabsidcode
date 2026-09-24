import { THEMES, SANS, MONO, MONO_EM, SANS_EM, SANS_BOLD_EM, BRAND } from "./theme.mjs";
import { esc, wrap, textWidth, r3 } from "./text.mjs";

const frame = (w, h, t, rx = 20) =>
  `<rect x="1" y="1" width="${w - 2}" height="${h - 2}" rx="${rx}" fill="${t.panel}" stroke="${t.border}" stroke-width="2"/>`;

const accentDefs = (t) => `<linearGradient id="accent" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="${t.accent}"/>
      <stop offset="1" stop-color="${t.accent2}"/>
    </linearGradient>`;

// ---------------------------------------------------------------------------
// Project card: 600 × 260, shown two per row in the README.
// ---------------------------------------------------------------------------

export function renderCard(theme, project, index) {
  const t = THEMES[theme];
  const W = 600;
  const H = 260;
  const PAD = 34;
  const number = String(index + 1).padStart(2, "0");
  const status = project.status?.trim();
  const live = project.active !== false;
  const titleSize = Math.min(34, Math.floor((W - PAD * 2 - 150) / (Math.max([...project.name].length, 1) * SANS_BOLD_EM)));
  const desc = wrap(project.description, { maxWidth: W - PAD * 2 - 10, fontSize: 17, em: SANS_EM, maxLines: 3 });

  // Chips, stopping before they overflow the card.
  const chips = [];
  let x = PAD;
  for (const item of project.stack ?? []) {
    const w = r3(textWidth(item, 13, MONO_EM) + 26);
    if (x + w > W - PAD) break;
    chips.push(`<g transform="translate(${r3(x)} 204)">
      <rect width="${w}" height="28" rx="14" fill="${t.faint}" stroke="${t.border}"/>
      <text x="${r3(w / 2)}" y="18.5" text-anchor="middle" font-family="${MONO}" font-size="13" fill="${t.muted}">${esc(item)}</text>
    </g>`);
    x += w + 8;
  }

  const titleW = textWidth(project.name, titleSize, SANS_BOLD_EM);
  const arrow = project.url
    ? `<text x="${r3(PAD + titleW + 10)}" y="104" font-family="${SANS}" font-size="${Math.round(titleSize * 0.7)}" font-weight="700" fill="${t.accentText}">↗</text>`
    : "";

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" role="img" aria-labelledby="title desc">
  <title id="title">${esc(project.name)}</title>
  <desc id="desc">${esc(project.description)}</desc>
  <style>
    .pulse { animation: pulse 2.4s ease-out infinite; transform-origin: ${PAD + 6}px 45px }
    @keyframes pulse { 0% { opacity: .6; transform: scale(1) } 100% { opacity: 0; transform: scale(2.6) } }
    @media (prefers-reduced-motion: reduce) { * { animation: none !important } }
  </style>
  <defs>
    ${accentDefs(t)}
    <clipPath id="clip"><rect x="1" y="1" width="${W - 2}" height="${H - 2}" rx="20"/></clipPath>
  </defs>
  ${frame(W, H, t)}
  <g clip-path="url(#clip)">
    <rect x="1" y="1" width="${W - 2}" height="5" fill="url(#accent)"/>
    <text x="${W - 26}" y="118" text-anchor="end" font-family="${SANS}" font-size="120" font-weight="800" letter-spacing="-6" fill="${t.faint}">${number}</text>
  </g>
  ${status ? `${live ? `<circle cx="${PAD + 6}" cy="45" r="6" fill="${t.accent}" class="pulse"/>` : ""}
  <circle cx="${PAD + 6}" cy="45" r="5" fill="${live ? t.accent : t.muted}"/>
  <text x="${PAD + 20}" y="50" font-family="${MONO}" font-size="14" letter-spacing="1" fill="${live ? t.accentText : t.muted}">${esc(status.toUpperCase())}</text>` : ""}
  <text x="${PAD}" y="104" font-family="${SANS}" font-size="${titleSize}" font-weight="700" letter-spacing="-0.8" fill="${t.ink}">${esc(project.name)}</text>
  ${arrow}
  ${desc.map((line, i) => `<text x="${PAD}" y="${140 + i * 24}" font-family="${SANS}" font-size="17" fill="${t.muted}">${esc(line)}</text>`).join("\n  ")}
  ${chips.join("\n  ")}
</svg>
`;
}

// ---------------------------------------------------------------------------
// Stack panel: 1200 wide, one column per group.
// ---------------------------------------------------------------------------

export function renderStack(theme, groups) {
  const t = THEMES[theme];
  const W = 1200;
  const PAD = 40;
  const GAP = 20;
  const cols = groups.length;
  const colW = (W - PAD * 2 - GAP * (cols - 1)) / cols;
  const rows = Math.max(...groups.map((g) => g.items.length), 1);
  const H = 96 + rows * 42 + 34;

  const columns = groups.map((g, c) => {
    const x = r3(PAD + c * (colW + GAP));
    const items = g.items.map((item, i) => {
      const y = 104 + i * 42;
      const color = BRAND[item] ?? t.accent;
      return `<circle cx="${r3(x + 26)}" cy="${y - 6}" r="5.5" fill="${color}"/>
    <text x="${r3(x + 44)}" y="${y}" font-family="${SANS}" font-size="19" fill="${t.ink}">${esc(item)}</text>`;
    });
    return `<rect x="${x}" y="28" width="${r3(colW)}" height="${H - 56}" rx="16" fill="${t.faint}" opacity="0.7"/>
    <text x="${r3(x + 20)}" y="64" font-family="${MONO}" font-size="13" letter-spacing="2" fill="${t.accentText}">${esc(g.group.toUpperCase())}</text>
    <rect x="${r3(x + 20)}" y="74" width="28" height="3" rx="1.5" fill="url(#accent)"/>
    ${items.join("\n    ")}`;
  });

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" role="img" aria-labelledby="title">
  <title id="title">${esc(groups.map((g) => `${g.group}: ${g.items.join(", ")}`).join(". "))}</title>
  <defs>
    ${accentDefs(t)}
  </defs>
  ${frame(W, H, t, 24)}
  ${columns.join("\n  ")}
</svg>
`;
}

// ---------------------------------------------------------------------------
// Footer: a thin animated signal line with a sign-off.
// ---------------------------------------------------------------------------

export function renderFooter(theme, text) {
  const t = THEMES[theme];
  const W = 1200;
  const H = 120;
  const mid = W / 2;
  const tw = textWidth(text, 18, MONO_EM);
  const gapL = r3(mid - tw / 2 - 28);
  const gapR = r3(mid + tw / 2 + 28);

  // A calm waveform on both sides of the text.
  const wave = (from, to) => {
    const pts = [];
    for (let x = from; x <= to; x += 6) {
      const d = Math.min(x - from, to - x);
      const amp = Math.min(d / 60, 1) * 10;
      pts.push(`${x},${r3(60 + Math.sin(x / 19) * amp * Math.sin(x / 83))}`);
    }
    return pts.join(" ");
  };

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" role="img" aria-labelledby="title">
  <title id="title">${esc(text)}</title>
  <style>
    .wave { stroke-dasharray: 6 10; animation: flow 12s linear infinite }
    @keyframes flow { to { stroke-dashoffset: -320 } }
    @media (prefers-reduced-motion: reduce) { * { animation: none !important } }
  </style>
  <defs>${accentDefs(t)}</defs>
  <polyline points="${wave(40, gapL)}" fill="none" stroke="url(#accent)" stroke-width="2.5" stroke-linecap="round" class="wave"/>
  <polyline points="${wave(gapR, W - 40)}" fill="none" stroke="url(#accent)" stroke-width="2.5" stroke-linecap="round" class="wave"/>
  <text x="${mid}" y="66" text-anchor="middle" font-family="${MONO}" font-size="18" fill="${t.muted}">${esc(text)}</text>
</svg>
`;
}
