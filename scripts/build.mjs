#!/usr/bin/env node
/**
 * Builds README.md and every SVG under assets/ from profile.config.json.
 *
 *   node scripts/build.mjs                    # fetch public repos from the GitHub API, then build
 *   node scripts/build.mjs --offline          # skip the API (the "Recently pushed" section is left out)
 *   node scripts/build.mjs --fixture f.json   # read repos from a local JSON file instead of the API
 *   node scripts/build.mjs --check            # write nothing; exit 2 if any file would change
 *
 * No dependencies; needs Node 18+ for the built-in fetch.
 */
import { readFile, writeFile, mkdir, readdir, rm } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { THEME_NAMES } from "./lib/theme.mjs";
import { slug } from "./lib/text.mjs";
import { renderHero } from "./lib/hero.mjs";
import { renderCard, renderStack, renderFooter } from "./lib/panels.mjs";
import { renderReadme } from "./lib/readme.mjs";
import { fetchRepos } from "./lib/github.mjs";

const args = process.argv.slice(2);
const flag = (name) => args.includes(name);
const option = (name) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : undefined;
};

const ROOT = path.resolve(option("--root") ?? path.join(path.dirname(fileURLToPath(import.meta.url)), ".."));
const warn = (msg) => console.warn(`warning: ${msg}`);

export async function loadConfig(file) {
  let cfg;
  try {
    cfg = JSON.parse(await readFile(file, "utf8"));
  } catch (err) {
    throw new Error(err.code === "ENOENT" ? `${file} not found` : `profile.config.json is not valid JSON: ${err.message}`);
  }
  const fail = (msg) => {
    throw new Error(`profile.config.json: ${msg}`);
  };
  if (!cfg.username?.trim()) fail(`"username" is required`);
  cfg.projects ??= [];
  cfg.stack ??= [];
  if (!Array.isArray(cfg.projects)) fail(`"projects" must be an array`);
  cfg.projects.forEach((p, i) => {
    if (!p?.name?.trim()) fail(`projects[${i}] needs a "name"`);
    if (!p.description?.trim()) fail(`projects[${i}] ("${p.name}") needs a "description"`);
  });
  const slugs = cfg.projects.map((p) => slug(p.name));
  const dup = slugs.find((s, i) => slugs.indexOf(s) !== i);
  if (dup) fail(`two projects share the file name "${dup}"; give them different names`);
  if (!Array.isArray(cfg.stack)) fail(`"stack" must be an array of { group, items }`);
  cfg.stack.forEach((g, i) => {
    if (!g?.group || !Array.isArray(g.items)) fail(`stack[${i}] must look like { "group": "...", "items": ["..."] }`);
  });
  if (cfg.stack.length > 5) fail(`"stack" fits at most 5 groups side by side`);
  if ((cfg.hero?.glyphs ?? []).length > 5) warn(`hero.glyphs: only the first 5 are drawn`);
  return cfg;
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

async function main() {
  const cfg = await loadConfig(path.join(ROOT, "profile.config.json"));
  if (process.env.PROFILE_USER && process.env.PROFILE_USER.toLowerCase() !== cfg.username.toLowerCase()) {
    warn(`config username "${cfg.username}" differs from the repository owner "${process.env.PROFILE_USER}"`);
  }

  let repos = [];
  const fixture = option("--fixture");
  if (fixture) repos = JSON.parse(await readFile(path.resolve(fixture), "utf8"));
  else if (!flag("--offline")) {
    try {
      repos = await fetchRepos(cfg.username, process.env.GITHUB_TOKEN);
    } catch (err) {
      // A flaky API shouldn't block a config change from going live; the next run fills it back in.
      warn(`couldn't fetch repositories (${err.message}); building without "Recently pushed"`);
    }
  }

  // The snake image lives on the `output` branch, which only exists after snake.yml has run once.
  // Leave the section out until then rather than show a broken image.
  let snake = Boolean(cfg.activity?.snake);
  if (snake && !flag("--offline") && !fixture) {
    const url = `https://raw.githubusercontent.com/${cfg.username}/${cfg.username}/output/snake-dark.svg`;
    snake = await fetch(url, { method: "HEAD", signal: AbortSignal.timeout(10_000) })
      .then((r) => r.ok)
      .catch(() => false);
    if (!snake) warn(`no contribution snake yet; run the "Snake" workflow once and the Activity section appears`);
  }

  const files = new Map();
  files.set("README.md", renderReadme(cfg, { repos, warn, snake }));
  for (const theme of THEME_NAMES) {
    files.set(`assets/hero-${theme}.svg`, renderHero(theme, cfg));
    files.set(`assets/footer-${theme}.svg`, renderFooter(theme, cfg.footer ?? `thanks for stopping by`));
    if (cfg.stack.length) files.set(`assets/stack-${theme}.svg`, renderStack(theme, cfg.stack));
    cfg.projects.forEach((p, i) => files.set(`assets/cards/${slug(p.name)}-${theme}.svg`, renderCard(theme, p, i)));
  }

  const check = flag("--check");
  const changed = [];
  for (const [rel, content] of files) {
    if (await writeIfChanged(path.join(ROOT, rel), content, check)) changed.push(rel);
  }

  // Remove cards for projects that were renamed or dropped from the config.
  const cardDir = path.join(ROOT, "assets/cards");
  const stale = (await readdir(cardDir).catch(() => [])).filter((f) => f.endsWith(".svg") && !files.has(`assets/cards/${f}`));
  for (const f of stale) {
    if (!check) await rm(path.join(cardDir, f));
    changed.push(`assets/cards/${f} (removed)`);
  }

  console.log(`${repos.length} repositories read, ${files.size} files generated.`);
  console.log(changed.length ? `${check ? "Would update" : "Updated"}: ${changed.join(", ")}` : "Everything is up to date.");
  if (check && changed.length) process.exitCode = 2;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((err) => {
    console.error(`error: ${err.message}`);
    process.exit(1);
  });
}
