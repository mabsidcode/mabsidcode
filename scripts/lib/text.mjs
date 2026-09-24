export const esc = (s) =>
  String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

export const lc = (s) => String(s ?? "").toLowerCase();

// Counts code points, not UTF-16 units, so emoji and Indic text measure sensibly.
export const len = (s) => [...String(s ?? "")].length;

export const textWidth = (s, fontSize, em) => len(s) * fontSize * em;

/**
 * Greedy word wrap by estimated width. Returns at most `maxLines` lines;
 * the last one gets an ellipsis if text was cut.
 */
export function wrap(text, { maxWidth, fontSize, em, maxLines = Infinity }) {
  const words = String(text ?? "").trim().split(/\s+/).filter(Boolean);
  const lines = [];
  let line = "";
  let i = 0;
  for (; i < words.length; i++) {
    const next = line ? `${line} ${words[i]}` : words[i];
    if (textWidth(next, fontSize, em) <= maxWidth || !line) {
      line = next;
      continue;
    }
    lines.push(line);
    line = words[i];
    if (lines.length === maxLines) break;
  }
  if (lines.length < maxLines && line) {
    lines.push(line);
    i = words.length;
  }
  if (i < words.length && lines.length) {
    let last = lines[lines.length - 1];
    while (last && textWidth(`${last}…`, fontSize, em) > maxWidth) last = last.replace(/\s*\S+$/, "");
    lines[lines.length - 1] = `${last.replace(/[,.;:—-]+$/, "")}…`;
  }
  return lines;
}

export const safeUrl = (u) => {
  try {
    const url = new URL(String(u ?? "").trim());
    return ["http:", "https:", "mailto:"].includes(url.protocol) ? url.href : null;
  } catch {
    return null;
  }
};

export const slug = (s) =>
  lc(s)
    .normalize("NFKD")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "") || "item";

// Rounds to 3 decimals so generated SVGs stay stable across runs.
export const r3 = (n) => Math.round(n * 1000) / 1000;
