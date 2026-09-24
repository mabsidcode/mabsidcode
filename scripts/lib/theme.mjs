// Shared design tokens for every generated SVG. Change colours here, then run `npm run build`.

export const THEMES = {
  dark: {
    bg: "#0B0D12",
    panel: "#11141B",
    border: "#232835",
    ink: "#EEF0F6",
    muted: "#8B93A7",
    faint: "#1A1E28",
    dot: "#262B38",
    accent: "#FF7A45",
    accent2: "#FF4D8D",
    accentText: "#FF8A5B",
    onAccent: "#FFFFFF",
  },
  light: {
    bg: "#FBF9F6",
    panel: "#FFFFFF",
    border: "#E6E1D8",
    ink: "#16181D",
    muted: "#5B6170",
    faint: "#F2EEE7",
    dot: "#DDD7CC",
    accent: "#E4572E",
    accent2: "#D63A78",
    accentText: "#B8431D",
    onAccent: "#FFFFFF",
  },
};

export const THEME_NAMES = Object.keys(THEMES);

// SVGs rendered through <img> cannot load web fonts, so these are system stacks only.
export const SANS = "-apple-system, BlinkMacSystemFont, 'Segoe UI', 'Noto Sans', Helvetica, Arial, sans-serif";
export const MONO = "ui-monospace, SFMono-Regular, 'SF Mono', Menlo, Consolas, 'Liberation Mono', monospace";
export const INDIC = "'Kohinoor Devanagari', 'Kohinoor Telugu', 'Noto Sans Devanagari', 'Noto Sans Telugu', 'Noto Sans Kannada', 'Nirmala UI', " + SANS;

// Approximate advance widths (em) used to lay text out without a font engine.
export const MONO_EM = 0.61;
export const SANS_EM = 0.54;
export const SANS_BOLD_EM = 0.6;

// Brand dots for the stack panel; anything unlisted falls back to the accent colour.
export const BRAND = {
  "TypeScript": "#3178C6",
  "JavaScript": "#F7DF1E",
  "React": "#61DAFB",
  "Next.js": "#9CA3AF",
  "Tailwind CSS": "#38BDF8",
  "Vite": "#A259FF",
  "Framer Motion": "#E935C1",
  "Node.js": "#5FA04E",
  "Express": "#9CA3AF",
  "Python": "#3776AB",
  "FastAPI": "#009688",
  "MongoDB": "#47A248",
  "PostgreSQL": "#4169E1",
  "pgvector": "#6C8EEF",
  "Redis": "#DC382D",
  "Docker": "#2496ED",
  "Git": "#F05032",
  "Vitest": "#6E9F18",
  "GitHub Actions": "#2088FF",
};
