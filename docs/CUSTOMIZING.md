# Customizing the profile

`README.md` is the page GitHub shows on your profile. That's why this guide lives in `docs/`. Everything on that page is built from **`profile.config.json`**. Edit the config, not the README.

```
profile.config.json        ← the only file you normally touch
scripts/build.mjs          ← config → README.md + assets/*.svg (no dependencies)
scripts/lib/theme.mjs      ← colours, fonts, brand dots for the Toolbox
scripts/preview.mjs        ← renders README through GitHub's API into preview.html
.github/workflows/
  build.yml                ← rebuilds on push, every 6 h, and after each snake run
  snake.yml                ← draws the contribution snake onto the `output` branch
```

## Everyday commands

```bash
npm run build           # rebuild everything (fetches your public repos)
npm run build:offline   # rebuild without touching the network
npm run preview         # build, then write preview.html with a light/dark toggle
npm test                # sanity checks (also run by the GitHub Action)
```

You never have to build locally. Pushing a config change runs the Action, which rebuilds and commits the result.

## What each config field does

| Field | Where it shows up |
|:--|:--|
| `name`, `hero.tagline`, `hero.kicker`, `hero.footnote` | The big animated banner |
| `hero.typing` | Phrases typed out one after another (max 38 characters each) |
| `hero.glyphs` | Up to 5 characters in the floating bubbles; they light up in turn |
| `links.*` | Badge row under the banner. Blank entries are hidden. Supported: `website`, `email`, `linkedin`, `x`, `bluesky`, `instagram`, `youtube`, `devto`, `hashnode`, `medium`, `discord`, `resume` |
| `about.intro`, `about.now` | The "Hey, I'm…" section. Markdown is allowed |
| `projects[]` | One card each, two per row. `status` sets the pill (`"active": false` greys it out). Set `repo` (a repo name) or `url` to make the card a link. Setting `repo` also keeps that repo out of the auto list below |
| `recent` | Auto-list of your newest public repos. It only appears once you have some. Hide one with `recent.hidden` or by giving the repo the `profile-hidden` topic |
| `stack[]` | The Toolbox panel, up to 5 groups. Dot colours come from `BRAND` in `scripts/lib/theme.mjs` |
| `activity.snake` | Contribution snake. It shows up after `snake.yml` has run once |
| `contact.note`, `footer` | The sign-off at the bottom |

## Changing the look

All colours live in `scripts/lib/theme.mjs` (`THEMES.dark` / `THEMES.light`). The snake's colours are in `.github/workflows/snake.yml`. After changing either, run `npm run build:offline`.

The SVGs use system fonts only, because GitHub serves images through a proxy that blocks web fonts. They also honour `prefers-reduced-motion`: with motion off, the banner shows the first phrase without animating.
