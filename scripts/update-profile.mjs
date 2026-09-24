#!/usr/bin/env node
/**
 * Refreshes the generated parts of the profile README.
 *
 *   node scripts/update-profile.mjs            # fetch from the GitHub API and update files
 *   node scripts/update-profile.mjs --check    # exit 2 if files would change (writes nothing)
 *   node scripts/update-profile.mjs --fixture repos.json   # use a local JSON file instead of the API
 *
 * Only the text between <!-- NAME:START --> and <!-- NAME:END --> markers in README.md
 * is replaced, plus assets/banner-{light,dark}.svg. Everything else is left untouched.
 * No dependencies: needs Node 18+ (built-in fetch).
 */
import { readFile, writeFile, mkdir } from "node:fs/promises";
import path from "node:path";

const args = process.argv.slice(2);
const flag = (name) => args.includes(name);
const option = (name) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : undefined;
};

const ROOT = path.resolve(option("--root") ?? process.cwd());
const README_PATH = path.join(ROOT, "README.md");
const CONFIG_PATH = path.join(ROOT, "profile.config.json");
const ASSETS_DIR = path.join(ROOT, "assets");

const FEATURED_TOPIC = "profile-featured";
const HIDDEN_TOPIC = "profile-hidden";

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const DEFAULTS = {
  username: "",
  profile: { name: "", links: {} },
  projects: {
    featured: [],
    hidden: [],
    descriptions: {},
    sort: "pushed",
    gridSize: 6,
    listSize: 8,
  },
};

async function loadConfig() {
  let raw;
  try {
    raw = JSON.parse(await readFile(CONFIG_PATH, "utf8"));
  } catch (err) {
    if (err.code === "ENOENT") return structuredClone(DEFAULTS);
    throw new Error(`profile.config.json is not valid JSON: ${err.message}`);
  }
  const cfg = {
    ...DEFAULTS,
    ...raw,
    profile: { ...DEFAULTS.profile, ...raw.profile },
    projects: { ...DEFAULTS.projects, ...raw.projects },
  };
  const p = cfg.projects;
  for (const key of ["featured", "hidden"]) {
    if (!Array.isArray(p[key])) throw new Error(`projects.${key} must be an array of repository names`);
  }
  if (!["pushed", "stars", "created", "name"].includes(p.sort)) {
    throw new Error(`projects.sort must be one of pushed, stars, created, name (got "${p.sort}")`);
  }
  for (const key of ["gridSize", "listSize"]) {
    if (!Number.isInteger(p[key]) || p[key] < 0 || p[key] > 50) {
      throw new Error(`projects.${key} must be an integer between 0 and 50`);
    }
  }
  return cfg;
}

// ---------------------------------------------------------------------------
// GitHub API
// ---------------------------------------------------------------------------

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function request(url, token, attempt = 1) {
  const headers = {
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
    "User-Agent": "profile-readme-updater",
  };
  if (token) headers.Authorization = `Bearer ${token}`;

  let res;
  try {
    res = await fetch(url, { headers, signal: AbortSignal.timeout(20_000) });
  } catch (err) {
    if (attempt < 4) {
      await sleep(2 ** attempt * 1000);
      return request(url, token, attempt + 1);
    }
    throw new Error(`Network error calling ${url}: ${err.message}`);
  }

  const rateLimited =
    res.status === 429 || (res.status === 403 && res.headers.get("x-ratelimit-remaining") === "0");
  if ((res.status >= 500 || rateLimited) && attempt < 4) {
    const retryAfter = Number(res.headers.get("retry-after"));
    const reset = Number(res.headers.get("x-ratelimit-reset"));
    let wait = 2 ** attempt * 1000;
    if (retryAfter) wait = retryAfter * 1000;
    else if (rateLimited && reset) wait = reset * 1000 - Date.now() + 1000;
    if (wait > 60_000) throw new Error(`Rate limited by the GitHub API until ${new Date(reset * 1000).toISOString()}`);
    await sleep(Math.max(wait, 1000));
    return request(url, token, attempt + 1);
  }
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`GitHub API ${res.status} for ${url}: ${body.slice(0, 300)}`);
  }
  return res;
}

async function fetchRepos(username, token) {
  const api = (process.env.GITHUB_API_URL || "https://api.github.com").replace(/\/$/, "");
  let url = `${api}/users/${encodeURIComponent(username)}/repos?type=owner&sort=pushed&per_page=100`;
  const repos = [];
  for (let page = 0; url && page < 30; page++) {
    const res = await request(url, token);
    const data = await res.json();
    if (!Array.isArray(data)) throw new Error("Unexpected API response: expected an array of repositories");
    repos.push(...data);
    const next = (res.headers.get("link") ?? "").match(/<([^>]+)>;\s*rel="next"/);
    url = next ? next[1] : null;
  }
  return repos;
}

// ---------------------------------------------------------------------------
// Selection & sorting
// ---------------------------------------------------------------------------

const lc = (s) => String(s ?? "").toLowerCase();
const time = (s) => (s ? Date.parse(s) || 0 : 0);

const COMPARATORS = {
  pushed: (a, b) => time(b.pushed_at) - time(a.pushed_at),
  created: (a, b) => time(b.created_at) - time(a.created_at),
  stars: (a, b) => b.stargazers_count - a.stargazers_count || time(b.pushed_at) - time(a.pushed_at),
  name: (a, b) => lc(a.name).localeCompare(lc(b.name)),
};

export function selectRepos(allRepos, cfg, username) {
  const p = cfg.projects;
  const hidden = new Set(p.hidden.map(lc));
  const featuredOrder = p.featured.map(lc);
  const compare = (a, b) => COMPARATORS[p.sort](a, b) || lc(a.name).localeCompare(lc(b.name));

  const eligible = allRepos.filter(
    (r) =>
      !r.fork &&
      !r.archived &&
      !r.disabled &&
      !r.private &&
      (r.visibility ?? "public") === "public" &&
      lc(r.name) !== lc(username),
  );
  const visible = eligible.filter((r) => !hidden.has(lc(r.name)) && !(r.topics ?? []).includes(HIDDEN_TOPIC));

  const isFeatured = (r) => featuredOrder.includes(lc(r.name)) || (r.topics ?? []).includes(FEATURED_TOPIC);
  const featured = visible.filter(isFeatured).sort((a, b) => {
    const ia = featuredOrder.indexOf(lc(a.name));
    const ib = featuredOrder.indexOf(lc(b.name));
    if (ia !== -1 || ib !== -1) return (ia === -1 ? Infinity : ia) - (ib === -1 ? Infinity : ib);
    return compare(a, b);
  });
  const rest = visible.filter((r) => !isFeatured(r)).sort(compare);
  const ordered = [...featured, ...rest];

  const known = new Set(allRepos.map((r) => lc(r.name)));
  const warnings = [...p.featured, ...p.hidden]
    .filter((name) => !known.has(lc(name)))
    .map((name) => `"${name}" is listed in profile.config.json but is not one of your repositories`);
  for (const name of p.featured) {
    const repo = eligible.find((r) => lc(r.name) === lc(name));
    if (repo && hidden.has(lc(name))) warnings.push(`"${name}" is both featured and hidden; hidden wins`);
  }
  const ineligible = allRepos.filter((r) => !eligible.includes(r)).map((r) => lc(r.name));
  for (const name of p.featured) {
    if (ineligible.includes(lc(name))) warnings.push(`"${name}" is featured but is a fork, archived, private or the profile repo, so it is skipped`);
  }

  return {
    grid: ordered.slice(0, p.gridSize),
    list: ordered.slice(p.gridSize, p.gridSize + p.listSize),
    total: ordered.length,
    visible,
    warnings,
  };
}

// ---------------------------------------------------------------------------
// Rendering helpers
// ---------------------------------------------------------------------------

const esc = (s) =>
  String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

const safeUrl = (u) => {
  try {
    const url = new URL(String(u).trim());
    return ["http:", "https:", "mailto:"].includes(url.protocol) ? url.href : null;
  } catch {
    return null;
  }
};

// Primary colours from GitHub Linguist; logos are Simple Icons slugs (shields.io omits unknown logos).
const LANGUAGES = {
  "TypeScript": ["typescript", "3178C6"],
  "JavaScript": ["javascript", "F7DF1E"],
  "Python": ["python", "3776AB"],
  "Jupyter Notebook": ["jupyter", "F37626"],
  "Go": ["go", "00ADD8"],
  "Rust": ["rust", "B7410E"],
  "Java": ["openjdk", "B07219"],
  "Kotlin": ["kotlin", "7F52FF"],
  "Swift": ["swift", "F05138"],
  "Dart": ["dart", "0175C2"],
  "C": ["c", "555555"],
  "C++": ["cplusplus", "00599C"],
  "C#": ["", "178600"],
  "PHP": ["php", "777BB4"],
  "Ruby": ["ruby", "CC342D"],
  "HTML": ["html5", "E34F26"],
  "CSS": ["css", "663399"],
  "SCSS": ["sass", "CC6699"],
  "Vue": ["vuedotjs", "41B883"],
  "Svelte": ["svelte", "FF3E00"],
  "Astro": ["astro", "BC52EE"],
  "Shell": ["gnubash", "4EAA25"],
  "PowerShell": ["", "012456"],
  "Dockerfile": ["docker", "2496ED"],
  "Lua": ["lua", "2C2D72"],
  "Elixir": ["elixir", "6E4A7E"],
  "Haskell": ["haskell", "5E5086"],
  "Scala": ["scala", "DC322F"],
  "R": ["r", "276DC3"],
  "Zig": ["zig", "EC915C"],
  "Nix": ["nixos", "5277C3"],
  "Solidity": ["solidity", "363636"],
  "MDX": ["mdx", "1B1F24"],
  "Objective-C": ["", "438EFF"],
  "Assembly": ["", "6E4C13"],
};

const luminance = (hex) => {
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
  const f = (c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
};

const shieldsText = (s) => encodeURIComponent(String(s).replace(/-/g, "--").replace(/_/g, "__"));

function languageBadge(language) {
  const [logo, color] = LANGUAGES[language] ?? ["", "6E7781"];
  const text = luminance(color) > 0.45 ? "1F2328" : "FFFFFF";
  let url = `https://img.shields.io/badge/${shieldsText(language)}-${color}?style=flat-square`;
  if (logo) url += `&logo=${logo}&logoColor=${text}`;
  if (text !== "FFFFFF") url += `&labelColor=${color}`;
  return url;
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const monthYear = (iso) => {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "" : `${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
};

const describe = (repo, cfg) => {
  const override = Object.entries(cfg.projects.descriptions ?? {}).find(([k]) => lc(k) === lc(repo.name));
  return (override?.[1] ?? repo.description ?? "").trim();
};

function metaLine(repo, sep = " · ") {
  const parts = [];
  if (repo.stargazers_count > 0) parts.push(`★&nbsp;${repo.stargazers_count}`);
  if (repo.forks_count > 0) parts.push(`⑂&nbsp;${repo.forks_count}`);
  const updated = monthYear(repo.pushed_at);
  if (updated) parts.push(`Updated&nbsp;${updated.replace(" ", "&nbsp;")}`);
  const home = safeUrl(repo.homepage);
  if (home && home.startsWith("http")) parts.push(`<a href="${esc(home)}">Live ↗</a>`);
  return parts.join(sep);
}

// ---------------------------------------------------------------------------
// Sections
// ---------------------------------------------------------------------------

const GENERATED_NOTE = "<!-- Generated by scripts/update-profile.mjs. Edits inside this block are overwritten; use profile.config.json. -->";

function renderCard(repo, cfg, colspan = false) {
  const desc = describe(repo, cfg);
  const lines = [
    `<td ${colspan ? 'colspan="2"' : 'width="50%"'} valign="top">`,
    `<a href="${esc(repo.html_url)}"><b>${esc(repo.name)}</b></a>`,
  ];
  if (desc) lines.push(`<p>${esc(desc)}</p>`);
  const badge = repo.language
    ? `<img src="${esc(languageBadge(repo.language))}" alt="${esc(repo.language)}" height="20"> `
    : "";
  const meta = metaLine(repo);
  if (badge || meta) lines.push(`<p>${badge}<sub>${meta}</sub></p>`);
  lines.push("</td>");
  return lines.join("\n");
}

export function renderProjects(sel, cfg, username) {
  const out = [GENERATED_NOTE, "", "## Projects", ""];
  if (sel.total === 0) {
    out.push(`<p><sub>New public repositories appear here automatically.</sub></p>`);
    return out.join("\n");
  }

  if (sel.grid.length) {
    out.push("<table>");
    for (let i = 0; i < sel.grid.length; i += 2) {
      const pair = sel.grid.slice(i, i + 2);
      out.push("<tr>");
      out.push(pair.length === 2 ? pair.map((r) => renderCard(r, cfg)).join("\n") : renderCard(pair[0], cfg, true));
      out.push("</tr>");
    }
    out.push("</table>", "");
  }

  if (sel.list.length) {
    out.push("<details>", `<summary><b>More projects</b> (${sel.list.length})</summary>`, "<ul>");
    for (const repo of sel.list) {
      const desc = describe(repo, cfg);
      const meta = [esc(repo.language ?? ""), metaLine(repo)].filter(Boolean).join(" · ");
      out.push(
        `<li><a href="${esc(repo.html_url)}"><b>${esc(repo.name)}</b></a>${desc ? ` — ${esc(desc)}` : ""}<br><sub>${meta}</sub></li>`,
      );
    }
    out.push("</ul>", "</details>", "");
  }

  const shown = sel.grid.length + sel.list.length;
  const allUrl = `https://github.com/${username}?tab=repositories&type=source`;
  const label = sel.total > shown ? `Browse all ${sel.total} projects` : "Browse all repositories";
  out.push(`<p><a href="${allUrl}">${label} →</a></p>`);
  return out.join("\n");
}

export function languageCounts(repos) {
  const counts = new Map();
  const latest = new Map();
  for (const r of repos) {
    if (!r.language) continue;
    counts.set(r.language, (counts.get(r.language) ?? 0) + 1);
    latest.set(r.language, Math.max(latest.get(r.language) ?? 0, time(r.pushed_at)));
  }
  // Most projects first; ties go to the language used most recently.
  return [...counts.entries()].sort(
    (a, b) => b[1] - a[1] || latest.get(b[0]) - latest.get(a[0]) || a[0].localeCompare(b[0]),
  );
}

export function renderLanguages(sel, username) {
  const langs = languageCounts(sel.visible);
  if (!langs.length) return GENERATED_NOTE;
  const badges = langs.map(([lang, n]) => {
    const href = `https://github.com/${username}?tab=repositories&type=source&language=${encodeURIComponent(lc(lang))}`;
    const title = `${lang}: ${n} public ${n === 1 ? "project" : "projects"}`;
    return `<a href="${esc(href)}" title="${esc(title)}"><img src="${esc(languageBadge(lang))}" alt="${esc(lang)}" height="20"></a>`;
  });
  return [GENERATED_NOTE, "", "## Languages I build with", "", `<p>${badges.join("\n")}</p>`].join("\n");
}

const LINKS = {
  website: { label: "Website", logo: "" },
  email: { label: "Email", logo: "gmail", url: (v) => `mailto:${v.replace(/^mailto:/, "")}` },
  linkedin: { label: "LinkedIn", logo: "" },
  x: { label: "X", logo: "x" },
  bluesky: { label: "Bluesky", logo: "bluesky" },
  mastodon: { label: "Mastodon", logo: "mastodon" },
  youtube: { label: "YouTube", logo: "youtube" },
  devto: { label: "DEV", logo: "devdotto" },
  hashnode: { label: "Hashnode", logo: "hashnode" },
  medium: { label: "Medium", logo: "medium" },
  instagram: { label: "Instagram", logo: "instagram" },
  discord: { label: "Discord", logo: "discord" },
};

export function renderHeader(cfg, username) {
  const name = cfg.profile.name?.trim() || username;
  const out = [
    GENERATED_NOTE,
    "<p>",
    "<picture>",
    `  <source media="(prefers-color-scheme: dark)" srcset="assets/banner-dark.svg">`,
    `  <img alt="${esc(name)}" src="assets/banner-light.svg" width="100%">`,
    "</picture>",
    "</p>",
  ];
  const badges = [];
  for (const [key, value] of Object.entries(cfg.profile.links ?? {})) {
    const def = LINKS[key];
    const raw = String(value ?? "").trim();
    if (!raw) continue;
    if (!def) {
      console.warn(`warning: unknown link type "${key}" in profile.config.json (supported: ${Object.keys(LINKS).join(", ")})`);
      continue;
    }
    const href = safeUrl(def.url ? def.url(raw) : raw);
    if (!href) {
      console.warn(`warning: link "${key}" is not a valid http(s) URL: ${raw}`);
      continue;
    }
    let img = `https://img.shields.io/badge/${shieldsText(def.label)}-0F766E?style=for-the-badge`;
    if (def.logo) img += `&logo=${def.logo}&logoColor=white`;
    badges.push(`<a href="${esc(href)}"><img src="${esc(img)}" alt="${esc(def.label)}" height="28"></a>`);
  }
  if (badges.length) out.push("", `<p align="center">\n${badges.join("\n")}\n</p>`);
  return out.join("\n");
}

// ---------------------------------------------------------------------------
// Banner SVGs (light + dark)
// ---------------------------------------------------------------------------

const THEMES = {
  light: { bg: "#FBFAF7", border: "#E4E1D8", ink: "#1F2328", muted: "#59636E", accent: "#0F766E", dot: "#D3CFC3", card: "#FFFFFF" },
  dark: { bg: "#0F1519", border: "#253039", ink: "#E6EDF3", muted: "#8B949E", accent: "#5EEAD4", dot: "#2A3640", card: "#141C22" },
};

const SANS = "-apple-system, BlinkMacSystemFont, 'Segoe UI', 'Noto Sans', Helvetica, Arial, sans-serif";
const MONO = "ui-monospace, SFMono-Regular, 'SF Mono', Menlo, Consolas, 'Liberation Mono', monospace";

export function renderBanner(theme, { name, username, stats }) {
  const t = THEMES[theme];
  const W = 1200;
  const H = 300;
  // Keep the name inside the left ~660px; approximate glyph width at 0.6em for bold sans.
  const nameSize = Math.max(40, Math.min(84, Math.floor(660 / (Math.max(name.length, 1) * 0.6))));
  const statsLine = stats.length > 52 ? `${stats.slice(0, 51)}…` : stats;

  // Three offset "cards" on the right, echoing the project grid below.
  const cards = [
    { x: 790, y: 58, o: 0.35 },
    { x: 830, y: 94, o: 0.6 },
    { x: 870, y: 130, o: 1 },
  ]
    .map(
      ({ x, y, o }, i) => `
    <g opacity="${o}">
      <rect x="${x}" y="${y}" width="260" height="120" rx="14" fill="${t.card}" stroke="${i === 2 ? t.accent : t.border}" stroke-width="${i === 2 ? 2 : 1.5}"/>
      <circle cx="${x + 28}" cy="${y + 32}" r="7" fill="${i === 2 ? t.accent : t.border}"/>
      <rect x="${x + 46}" y="${y + 26}" width="110" height="12" rx="6" fill="${i === 2 ? t.ink : t.border}" opacity="${i === 2 ? 0.85 : 1}"/>
      <rect x="${x + 22}" y="${y + 60}" width="196" height="9" rx="4.5" fill="${t.border}"/>
      <rect x="${x + 22}" y="${y + 80}" width="150" height="9" rx="4.5" fill="${t.border}"/>
    </g>`,
    )
    .join("");

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" role="img" aria-labelledby="title">
  <title id="title">${esc(name)} (@${esc(username)})</title>
  <defs>
    <pattern id="dots" width="22" height="22" patternUnits="userSpaceOnUse">
      <circle cx="2" cy="2" r="1.6" fill="${t.dot}"/>
    </pattern>
    <linearGradient id="fade" x1="0" x2="1" y1="0" y2="0">
      <stop offset="0.35" stop-color="#fff" stop-opacity="0"/>
      <stop offset="1" stop-color="#fff" stop-opacity="1"/>
    </linearGradient>
    <mask id="dotmask"><rect width="${W}" height="${H}" fill="url(#fade)"/></mask>
    <clipPath id="frame"><rect x="1" y="1" width="${W - 2}" height="${H - 2}" rx="22"/></clipPath>
  </defs>
  <g clip-path="url(#frame)">
    <rect width="${W}" height="${H}" fill="${t.bg}"/>
    <rect width="${W}" height="${H}" fill="url(#dots)" mask="url(#dotmask)"/>${cards}
  </g>
  <rect x="1" y="1" width="${W - 2}" height="${H - 2}" rx="22" fill="none" stroke="${t.border}" stroke-width="2"/>
  <rect x="64" y="74" width="36" height="7" rx="3" fill="${t.accent}"/>
  <text x="114" y="86" font-family="${MONO}" font-size="26" fill="${t.muted}">@${esc(username)}</text>
  <text x="60" y="${150 + nameSize * 0.3}" font-family="${SANS}" font-size="${nameSize}" font-weight="700" letter-spacing="-1.5" fill="${t.ink}">${esc(name)}</text>
  ${statsLine ? `<text x="64" y="236" font-family="${MONO}" font-size="26" fill="${t.accent}">${esc(statsLine)}</text>` : ""}
</svg>
`;
}

// ---------------------------------------------------------------------------
// README splicing
// ---------------------------------------------------------------------------

export function replaceSection(markdown, name, body) {
  const start = `<!-- ${name}:START -->`;
  const end = `<!-- ${name}:END -->`;
  const s = markdown.indexOf(start);
  const e = markdown.indexOf(end);
  if (s === -1 || e === -1) throw new Error(`README.md is missing the ${start} / ${end} markers`);
  if (e < s) throw new Error(`${end} appears before ${start} in README.md`);
  if (markdown.indexOf(start, s + 1) !== -1 || markdown.indexOf(end, e + 1) !== -1) {
    throw new Error(`README.md contains the ${name} markers more than once`);
  }
  return `${markdown.slice(0, s + start.length)}\n${body.trim()}\n${markdown.slice(e)}`;
}

async function writeIfChanged(file, content, check) {
  let current = null;
  try {
    current = await readFile(file, "utf8");
  } catch {}
  if (current === content) return false;
  if (!check) {
    await mkdir(path.dirname(file), { recursive: true });
    await writeFile(file, content);
  }
  return true;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  const cfg = await loadConfig();
  const username = process.env.PROFILE_USER || cfg.username || process.env.GITHUB_REPOSITORY_OWNER;
  if (!username) throw new Error("Set PROFILE_USER or \"username\" in profile.config.json");

  const fixture = option("--fixture");
  const repos = fixture
    ? JSON.parse(await readFile(path.resolve(fixture), "utf8"))
    : await fetchRepos(username, process.env.GITHUB_TOKEN);

  const sel = selectRepos(repos, cfg, username);
  for (const w of sel.warnings) console.warn(`warning: ${w}`);

  const name = cfg.profile.name?.trim() || username;
  const langs = languageCounts(sel.visible).slice(0, 3).map(([l]) => l);
  const stats = sel.total
    ? [`${sel.total} public ${sel.total === 1 ? "project" : "projects"}`, ...langs].join("  ·  ")
    : "";

  let readme = await readFile(README_PATH, "utf8");
  readme = replaceSection(readme, "HEADER", renderHeader(cfg, username));
  readme = replaceSection(readme, "PROJECTS", renderProjects(sel, cfg, username));
  readme = replaceSection(readme, "LANGUAGES", renderLanguages(sel, username));

  const check = flag("--check");
  const changed = [];
  if (await writeIfChanged(README_PATH, readme, check)) changed.push("README.md");
  for (const theme of ["light", "dark"]) {
    const file = path.join(ASSETS_DIR, `banner-${theme}.svg`);
    if (await writeIfChanged(file, renderBanner(theme, { name, username, stats }), check)) {
      changed.push(`assets/banner-${theme}.svg`);
    }
  }

  console.log(
    `${repos.length} repositories fetched, ${sel.total} shown (${sel.grid.length} in grid, ${sel.list.length} in list).`,
  );
  console.log(changed.length ? `${check ? "Would update" : "Updated"}: ${changed.join(", ")}` : "No changes.");
  if (check && changed.length) process.exitCode = 2;
}

if (import.meta.url === `file://${process.argv[1]}` || process.argv[1]?.endsWith("update-profile.mjs")) {
  main().catch((err) => {
    console.error(`error: ${err.message}`);
    process.exit(1);
  });
}
