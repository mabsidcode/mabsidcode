#!/usr/bin/env node
/**
 * Renders README.md through GitHub's own Markdown API and writes preview.html,
 * so you can see the profile (in light and dark) before pushing.
 *
 *   npm run preview        # then open preview.html
 */
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const cfg = JSON.parse(await readFile(path.join(ROOT, "profile.config.json"), "utf8"));
const text = await readFile(path.join(ROOT, "README.md"), "utf8");

const headers = { Accept: "application/vnd.github+json", "Content-Type": "application/json", "User-Agent": "profile-readme-preview" };
if (process.env.GITHUB_TOKEN) headers.Authorization = `Bearer ${process.env.GITHUB_TOKEN}`;
const res = await fetch("https://api.github.com/markdown", {
  method: "POST",
  headers,
  body: JSON.stringify({ text, mode: "gfm", context: `${cfg.username}/${cfg.username}` }),
});
if (!res.ok) {
  console.error(`error: GitHub's Markdown API returned ${res.status}: ${(await res.text()).slice(0, 200)}`);
  process.exit(1);
}
const body = await res.text();

const html = `<!doctype html>
<html lang="en" data-theme="dark">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Profile preview</title>
<link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/github-markdown-css@5/github-markdown-dark.css" id="md-dark">
<link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/github-markdown-css@5/github-markdown-light.css" id="md-light" disabled>
<style>
  :root { --bg: #0d1117; --bar: #161b22; --line: #30363d; --ink: #e6edf3 }
  :root[data-theme="light"] { --bg: #ffffff; --bar: #f6f8fa; --line: #d0d7de; --ink: #1f2328 }
  body { margin: 0; background: var(--bg); color: var(--ink); font: 14px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif }
  .bar { position: sticky; top: 0; z-index: 1; display: flex; gap: 12px; align-items: center; padding: 10px 16px; background: var(--bar); border-bottom: 1px solid var(--line) }
  .bar button { font: inherit; color: inherit; background: transparent; border: 1px solid var(--line); border-radius: 6px; padding: 4px 12px; cursor: pointer }
  .bar span { opacity: .7 }
  .wrap { max-width: 896px; margin: 24px auto; padding: 24px 16px; border: 1px solid var(--line); border-radius: 6px }
  .markdown-body { background: transparent }
</style>
</head>
<body>
<div class="bar"><button id="toggle">Switch to light</button><span>Rendered by GitHub's Markdown API · README.md</span></div>
<div class="wrap"><article class="markdown-body">${body}</article></div>
<script>
  // Mimics GitHub's theme switch: pick the matching <source> for every themed <picture>.
  const root = document.documentElement;
  function apply(theme) {
    root.dataset.theme = theme;
    document.getElementById("md-dark").disabled = theme !== "dark";
    document.getElementById("md-light").disabled = theme !== "light";
    for (const pic of document.querySelectorAll("picture")) {
      const source = pic.querySelector("source");
      const img = pic.querySelector("img");
      img.dataset.light ??= img.getAttribute("src");
      img.src = theme === "dark" && source ? source.getAttribute("srcset") : img.dataset.light;
      if (source) source.media = "not all";
    }
    document.getElementById("toggle").textContent = theme === "dark" ? "Switch to light" : "Switch to dark";
  }
  document.getElementById("toggle").onclick = () => apply(root.dataset.theme === "dark" ? "light" : "dark");
  apply(new URLSearchParams(location.search).get("theme") === "light" ? "light" : "dark");
</script>
</body>
</html>
`;
await writeFile(path.join(ROOT, "preview.html"), html);
console.log("Wrote preview.html (add ?theme=light to open in light mode).");
