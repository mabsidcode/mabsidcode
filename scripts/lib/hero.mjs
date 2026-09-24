import { THEMES, SANS, MONO, INDIC, MONO_EM, SANS_BOLD_EM } from "./theme.mjs";
import { esc, len, r3 } from "./text.mjs";

const W = 1200;
const H = 380;

// Typing line geometry.
const TYPE_X = 132;
const TYPE_Y = 296;
const TYPE_SIZE = 26;
const CHAR_W = TYPE_SIZE * MONO_EM;
const TYPE_MAX_W = 740 - TYPE_X;

// Seconds per character typed / erased, how long a finished phrase stays, and the gap between phrases.
const TYPE_S = 0.075;
const ERASE_S = 0.028;
const HOLD_S = 1.9;
const GAP_S = 0.45;

const pct = (t, total) => `${r3((t / total) * 100)}%`;

/** Builds one @keyframes pair per phrase: `k*` moves the cover and caret, `v*` shows the phrase only in its slot. */
function typingKeyframes(phrases) {
  const slots = [];
  let t = 0;
  for (const phrase of phrases) {
    const n = Math.max(len(phrase), 1);
    const start = t;
    const typed = start + n * TYPE_S;
    const held = typed + HOLD_S;
    const erased = held + n * ERASE_S;
    const end = erased + GAP_S;
    slots.push({ n, start, typed, held, erased, end, w: r3(n * CHAR_W) });
    t = end;
  }
  const total = t;
  const css = slots.map((s, i) => {
    const P = (x) => pct(x, total);
    const steps = `animation-timing-function: steps(${s.n}, end)`;
    const hide = i === slots.length - 1 ? "" : ` ${P(s.end + 0.001)} { opacity: 0 }`;
    const show = i === 0 ? "0% { opacity: 1 }" : `0% { opacity: 0 } ${P(s.start)} { opacity: 0 } ${P(s.start + 0.001)} { opacity: 1 }`;
    return [
      `@keyframes k${i} { 0% { transform: translateX(0px) } ${P(s.start)} { transform: translateX(0px); ${steps} } ${P(s.typed)} { transform: translateX(${s.w}px) } ${P(s.held)} { transform: translateX(${s.w}px); ${steps} } ${P(s.erased)} { transform: translateX(0px) } 100% { transform: translateX(0px) } }`,
      `@keyframes v${i} { ${show} ${P(s.end)} { opacity: 1 }${hide} 100% { opacity: ${i === slots.length - 1 ? 1 : 0} } }`,
      `.k${i} { animation: k${i} ${r3(total)}s infinite } .v${i} { animation: v${i} ${r3(total)}s infinite }`,
    ].join("\n    ");
  });
  return { css: css.join("\n    "), slots };
}

// Positions for the floating glyph bubbles, around the right-hand side.
const BUBBLES = [
  { x: 878, y: 112, r: 46, float: 7.5 },
  { x: 1046, y: 96, r: 56, float: 9 },
  { x: 1112, y: 232, r: 44, float: 8 },
  { x: 960, y: 262, r: 60, float: 10 },
  { x: 832, y: 256, r: 36, float: 6.5 },
];
const LINKS = [[0, 1], [1, 2], [2, 3], [3, 4], [4, 0], [0, 3], [1, 3]];

function bubbles(glyphs, t) {
  const items = BUBBLES.slice(0, glyphs.length);
  const cycle = items.length * 2.2;
  const lines = LINKS.filter(([a, b]) => a < items.length && b < items.length)
    .map(([a, b]) => `<line x1="${items[a].x}" y1="${items[a].y}" x2="${items[b].x}" y2="${items[b].y}" class="link"/>`)
    .join("\n    ");
  const nodes = items.map((b, i) => {
    const g = esc(glyphs[i]);
    const size = r3(b.r * (len(glyphs[i]) > 1 ? 0.62 : 0.95));
    const font = /^[\x00-\x7F]+$/.test(glyphs[i]) ? (len(glyphs[i]) > 1 ? MONO : SANS) : INDIC;
    const dy = r3(size * 0.34);
    return `<g class="float" style="animation-duration: ${b.float}s; animation-delay: -${r3(i * 1.3)}s">
      <circle cx="${b.x}" cy="${b.y}" r="${b.r}" fill="${t.panel}" stroke="${t.border}" stroke-width="1.5"/>
      <text x="${b.x}" y="${r3(b.y + dy)}" text-anchor="middle" font-family="${font}" font-size="${size}" font-weight="600" fill="${t.muted}">${g}</text>
      <g class="lit" style="animation-duration: ${r3(cycle)}s; animation-delay: ${r3(i * 2.2 - cycle)}s">
        <circle cx="${b.x}" cy="${b.y}" r="${b.r}" fill="url(#accent)"/>
        <circle cx="${b.x}" cy="${b.y}" r="${b.r + 9}" fill="none" stroke="${t.accent}" stroke-opacity="0.35" stroke-width="2"/>
        <text x="${b.x}" y="${r3(b.y + dy)}" text-anchor="middle" font-family="${font}" font-size="${size}" font-weight="600" fill="${t.onAccent}">${g}</text>
      </g>
    </g>`;
  });
  const litShare = r3(100 / items.length);
  const css = `@keyframes lit { 0% { opacity: 0 } 4% { opacity: 1 } ${r3(litShare - 4)}% { opacity: 1 } ${litShare}% { opacity: 0 } 100% { opacity: 0 } }`;
  return { svg: `${lines}\n    ${nodes.join("\n    ")}`, css };
}

export function renderHero(theme, cfg) {
  const t = THEMES[theme];
  const name = cfg.name?.trim() || cfg.username;
  const nameSize = Math.min(92, Math.floor(680 / (Math.max(len(name), 1) * SANS_BOLD_EM)));
  const phrases = (cfg.hero?.typing ?? []).filter(Boolean);
  const maxChars = Math.floor(TYPE_MAX_W / CHAR_W);
  for (const p of phrases) {
    if (len(p) > maxChars) throw new Error(`hero.typing phrase is longer than ${maxChars} characters: "${p}"`);
  }
  const glyphs = (cfg.hero?.glyphs ?? []).slice(0, BUBBLES.length);
  const typing = typingKeyframes(phrases);
  const bub = bubbles(glyphs, t);
  const kicker = cfg.hero?.kicker ?? `~/${cfg.username}`;
  const footnote = cfg.hero?.footnote ?? "";

  // Each phrase is revealed by sliding a background-coloured cover to the right in whole-character
  // steps; the caret rides along. The static attributes show the first phrase when motion is off.
  const phraseSvg = typing.slots
    .map((s, i) => {
      const at = i === 0 ? ` transform="translate(${s.w} 0)"` : "";
      return `<g class="v${i}"${i === 0 ? "" : ` opacity="0"`}>
        <text x="${TYPE_X}" y="${TYPE_Y}" font-family="${MONO}" font-size="${TYPE_SIZE}" fill="${t.ink}" xml:space="preserve">${esc(phrases[i])}</text>
        <rect x="${TYPE_X - 2}" y="${TYPE_Y - 32}" width="${TYPE_MAX_W + 40}" height="46" fill="${t.bg}" class="k${i}"${at}/>
        <g class="k${i}"${at}><rect x="${TYPE_X + 2}" y="${TYPE_Y - 24}" width="3" height="30" rx="1.5" fill="${t.accent}" class="blink"/></g>
      </g>`;
    })
    .join("\n      ");

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" role="img" aria-labelledby="title desc">
  <title id="title">${esc(name)} (@${esc(cfg.username)})</title>
  <desc id="desc">${esc(cfg.hero?.tagline ?? "")}${phrases.length ? ` — ${esc(phrases.join(", "))}` : ""}</desc>
  <style>
    .blink { animation: blink 1.05s steps(1, end) infinite }
    @keyframes blink { 50% { opacity: 0 } }
    .float { animation: float 8s ease-in-out infinite }
    @keyframes float { 0%, 100% { transform: translateY(0px) } 50% { transform: translateY(-9px) } }
    .lit { opacity: 0; animation: lit 11s linear infinite }
    ${bub.css}
    .link { stroke: ${t.border}; stroke-width: 1.5; stroke-dasharray: 3 7; animation: dash 18s linear infinite }
    @keyframes dash { to { stroke-dashoffset: -200 } }
    .glow { animation: glow 7s ease-in-out infinite; transform-origin: 975px 190px }
    @keyframes glow { 0%, 100% { opacity: .75; transform: scale(1) } 50% { opacity: 1; transform: scale(1.06) } }
    ${typing.css}
    @media (prefers-reduced-motion: reduce) { * { animation: none !important } }
  </style>
  <defs>
    <linearGradient id="accent" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="${t.accent}"/>
      <stop offset="1" stop-color="${t.accent2}"/>
    </linearGradient>
    <radialGradient id="halo" cx="0.5" cy="0.5" r="0.5">
      <stop offset="0" stop-color="${t.accent}" stop-opacity="${theme === "dark" ? 0.22 : 0.14}"/>
      <stop offset="1" stop-color="${t.accent}" stop-opacity="0"/>
    </radialGradient>
    <pattern id="dots" width="24" height="24" patternUnits="userSpaceOnUse">
      <circle cx="2" cy="2" r="1.5" fill="${t.dot}"/>
    </pattern>
    <linearGradient id="fade" x1="0" x2="1" y1="0" y2="0">
      <stop offset="0.5" stop-color="#fff" stop-opacity="0"/>
      <stop offset="1" stop-color="#fff" stop-opacity="1"/>
    </linearGradient>
    <mask id="dotmask"><rect width="${W}" height="${H}" fill="url(#fade)"/></mask>
    <clipPath id="frame"><rect x="1" y="1" width="${W - 2}" height="${H - 2}" rx="24"/></clipPath>
    <clipPath id="typing"><rect x="${TYPE_X - 4}" y="${TYPE_Y - 34}" width="${TYPE_MAX_W + 28}" height="50"/></clipPath>
  </defs>

  <g clip-path="url(#frame)">
    <rect width="${W}" height="${H}" fill="${t.bg}"/>

    <text x="72" y="84" font-family="${MONO}" font-size="20" fill="${t.muted}"><tspan fill="${t.accentText}">●</tspan>  ${esc(kicker)}</text>
    <text x="68" y="${r3(116 + nameSize * 0.72)}" font-family="${SANS}" font-size="${nameSize}" font-weight="800" letter-spacing="-2.5" fill="${t.ink}">${esc(name)}<tspan fill="url(#accent)">.</tspan></text>
    <text x="72" y="${r3(116 + nameSize * 0.72 + 50)}" font-family="${SANS}" font-size="28" fill="${t.muted}">${esc(cfg.hero?.tagline ?? "")}</text>

    ${phrases.length ? `<text x="72" y="${TYPE_Y}" font-family="${MONO}" font-size="${TYPE_SIZE}" font-weight="700" fill="url(#accent)">~ ❯</text>
    <g clip-path="url(#typing)">
      ${phraseSvg}
    </g>` : ""}
    ${footnote ? `<text x="72" y="${H - 34}" font-family="${MONO}" font-size="16" fill="${t.muted}" opacity="0.8">${esc(footnote)}</text>` : ""}

    <!-- Drawn after the typing line so its sliding covers never hide the texture. -->
    <rect width="${W}" height="${H}" fill="url(#dots)" mask="url(#dotmask)"/>
    <circle cx="975" cy="190" r="300" fill="url(#halo)" class="glow"/>
    ${bub.svg}
  </g>
  <rect x="1" y="1" width="${W - 2}" height="${H - 2}" rx="24" fill="none" stroke="${t.border}" stroke-width="2"/>
</svg>
`;
}
