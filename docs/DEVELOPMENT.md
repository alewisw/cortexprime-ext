# Development Guide

This document covers how to set up a local development environment for the
Cortex Prime FoundryVTT system, build its assets, and load it into Foundry
for testing.

## Prerequisites

- [Node.js](https://nodejs.org/) (LTS) and npm
- [Foundry Virtual Tabletop](https://foundryvtt.com/) v13 or later (see
  `compatibility` in [system.json](../system.json))
- Git

## Project layout

- `cortexprime.js` — system entry point, loaded by Foundry as an ES module
  (see `esmodules` in `system.json`). It is loaded directly, with no
  bundling step.
- `module/` — system source (actor sheets, applications, hooks, settings,
  handlebars helpers, etc.)
- `templates/` — Handlebars templates
- `lang/` — localization files
- `scss/` — Sass source for system styles
- `css/cortexprime.css` — **compiled** output referenced by `styles` in
  `system.json`. This file is committed to the repo, so it must be rebuilt
  and included whenever `scss/` changes.
- `system.json` — Foundry system manifest (id, version, compatibility,
  download/manifest URLs, etc.)
- `e2e/` — Playwright end-to-end tests that drive a real, locally running
  Foundry instance in a browser (see
  [End-to-end (Playwright) tests](#end-to-end-playwright-tests)).

## Install dependencies

```
npm install
```

This installs Gulp and the Sass toolchain used to compile `scss/` into
`css/cortexprime.css`.

## Building

The only build step is compiling Sass to CSS; JavaScript is consumed
directly as ES modules.

- **One-off compile:**

  ```
  npm run compile
  ```

- **Watch mode** (recompiles on every change under `scss/**/*.scss`):

  ```
  npm run build
  ```

  or equivalently:

  ```
  npm run watch
  ```

  Both run the default Gulp task (`gulpfile.js`), which compiles once and
  then watches for changes.

Before committing any `scss/` changes, run a build so the compiled
`css/cortexprime.css` in the commit matches the source.

## Packaging a distributable zip

To produce the zip that gets uploaded to a host such as
[The Forge](https://forge-vtt.com/) (or attached to a GitHub release):

```
npm run package
```

This compiles Sass first, then writes `dist/<id>-<version>.zip` (currently
`dist/cortexprime-ext-0.3.0.zip`). Both `<id>` and `<version>` are read
straight from `system.json`, so the filename and the manifest inside the
archive can never disagree.

The archive contains only what Foundry needs at runtime — `system.json`,
`template.json`, `cortexprime.js`, `README.md`, and the `assets/`, `configs/`,
`css/`, `lang/`, `lib/`, `module/` and `templates/` directories. Sass sources,
tests, `node_modules/` and build config are excluded. `system.json` sits at the
root of the zip (not inside a wrapper folder), which is what package hosts
expect. `dist/` is gitignored.

To add or remove packaged files, edit `PACKAGE_SOURCES` in `gulpfile.js`.

## Deploying into FoundryVTT for local testing

Foundry loads systems from its user data directory under `Data/systems/`.
Each subfolder there must contain a `system.json`, and the folder is
scanned by Foundry to discover installed systems.

Locate your Foundry user data directory if you don't already know it:

- **Windows:** `%localappdata%/FoundryVTT/Data` by default (a custom path is
  configured in Foundry's `Options` if you selected one during setup).
- **macOS:** `~/Library/Application Support/FoundryVTT/Data`
- **Linux:** `~/.local/share/FoundryVTT/Data`

There are two common ways to get this repo into `Data/systems/`:

1. **Work directly inside the Foundry data folder (used by this repo).**
   Clone/checkout the repository straight into
   `Data/systems/<folder-name>`, e.g. this checkout already lives at
   `.../FoundryVTT/Data/systems/cortexprime-ext`. Run `npm install` and the
   build commands above from that location.

2. **Symlink from a separate working copy.** If you prefer to keep the repo
   elsewhere (e.g. alongside other personal projects), create a symlink
   from `Data/systems/<folder-name>` to your working copy instead of
   copying files back and forth:

   ```
   # Windows (run as Administrator, or enable Developer Mode)
   mklink /D "%localappdata%\FoundryVTT\Data\systems\cortexprime-ext" "C:\path\to\your\clone"

   # macOS/Linux
   ln -s /path/to/your/clone ~/.local/share/FoundryVTT/Data/systems/cortexprime-ext
   ```

Once the system is present under `Data/systems/`, it will appear in the
**Game Systems** list when creating or configuring a World in Foundry's
setup screen.

### Iterating on changes

- **Sass/CSS:** keep `npm run watch` running; Foundry does not hot-reload
  CSS automatically, so reload the browser tab (F5) or the Foundry window
  after a recompile to see style changes.
- **JavaScript/Handlebars/lang files:** these are read directly, no build
  step required. Reload the browser tab (F5) or relaunch the World for
  changes to take effect.
- **system.json / template.json changes** (e.g. compatibility, actor
  types): these typically require fully restarting Foundry (relaunch the
  application/server), not just reloading the page.

## End-to-end (Playwright) tests

Unlike the Vitest unit tests under `test/`, which only cover pure-logic
modules with no dependency on a running Foundry instance, the tests under
`e2e/` drive your **real, locally running** Foundry instance through an
actual browser with [Playwright](https://playwright.dev/), so they can
exercise Foundry-coupled code (actor sheets, hooks, settings apps,
`game`/`Hooks`/`CONFIG` globals) that the unit tests deliberately cannot
touch.

These tests are **local-only** — no CI automation, no headless server, no
credentials stored anywhere. You run Foundry yourself; Playwright just
drives the browser tab.

### One-time setup

```
npx playwright install chromium
```

### Running the tests

1. Start your local Foundry instance and **launch a world that uses this
   system** (`cortexprime-ext`), so it's sitting at the join-a-world screen
   or already in-game at `http://localhost:30000`.
2. Run:

   ```
   npm run test:e2e
   ```

   To watch it run instead of headless, or step through interactively:

   ```
   npm run test:e2e:ui
   ```

   (Playwright's UI mode — timeline, DOM snapshots, and step-by-step replay
   for every test. `npx playwright test --headed` is the lighter-weight
   option if you just want a visible browser window.)

   Set `FOUNDRY_URL` if your instance isn't at the default
   `http://localhost:30000`.

### Test accounts and actors

The tests expect three dedicated, no-password accounts to exist in the
world being tested against: **`PlaywrightGamemaster`** (GM role),
**`PlaywrightPlayer1`** and **`PlaywrightPlayer2`** (player role). Create
these once per world via Foundry's Configure Game Settings → Manage
Players.

They also expect two actors to exist for the players to be linked to:
**`Amanda Singh`** and **`Cameron James`**. Global setup links
`PlaywrightPlayer1` → `Amanda Singh` and `PlaywrightPlayer2` → `Cameron
James` automatically (see below) — the actors just need to already exist
in the world.

### Global setup: one login per role, before any test runs

Wired in as `globalSetup` in `playwright.config.js`
(`e2e/global-setup.js`), this runs once before any test, and:

1. Logs in as the GM and both players (one real login each, via
   `joinAs()`).
2. From the GM session, using real Foundry API calls (`game.users`,
   `game.actors`, not UI clicks — fast and reliable):
   - Links `PlaywrightPlayer1` → the `Amanda Singh` actor.
   - Links `PlaywrightPlayer2` → the `Cameron James` actor.
   - Unpauses the game if it was paused (`game.togglePause(false, {
     broadcast: true })`, which also pushes the unpause to the player
     sessions).
   - Cancels any active crisis pool.
   - Clears the spotlight (no character highlighted).

   This puts every test run on the same known baseline, regardless of
   whatever state a previous manual session or test run left behind.
3. Saves each session's storage state to `.auth/gm.json`,
   `.auth/player1.json`, `.auth/player2.json` (gitignored — these hold
   live session cookies).

Individual tests then call `openAs(browser, role)` (role is `'gm'`,
`'player1'`, or `'player2'`) instead of `joinAs()` — this restores the
saved session instantly, with no login flow and no repeating the
link/unpause setup. See `e2e/multi-session.spec.js` for a working example
using all three at once.

`joinAs()` (real login) is still exported from `e2e/foundry.js` for global
setup's own use, or for a test that genuinely needs a fresh, non-role
session.

### Current scope and extending coverage

This harness currently only proves the setup → `openAs()` →
read-live-state loop works, single- and multi-session
(`e2e/smoke.spec.js`, `e2e/multi-session.spec.js`). It does **not**
automate Foundry's Setup → "Launch World" screen — a world must already be
running before `npm run test:e2e` starts (global setup logs into that
running world). When writing a new test and you need real selectors from
the live app, use Playwright's recorder against your running instance
rather than guessing from Foundry's templates:

```
npx playwright codegen http://localhost:30000
```

## Releasing a new version

Requires the [GitHub CLI](https://cli.github.com/) (`gh`), authenticated
(`gh auth login`).

1. Bump the version in both `package.json` and `system.json` (`version`
   field).
2. Update the `download` URL in `system.json` to
   `https://github.com/<owner>/<repo>/releases/download/v<version>/<id>-<version>.zip`
   for the new version (`tools/release.js` checks this and refuses to run
   if it's stale).
3. Commit the version bump.
4. Run:

   ```
   npm run release
   ```

   This compiles Sass, builds `dist/<id>-<version>.zip` (see
   [Packaging a distributable zip](#packaging-a-distributable-zip)), tags
   the commit `v<version>`, pushes the current branch and tag, and creates
   a GitHub release with the zip attached — matching the `download` URL
   above so Foundry's installer (and hosts like The Forge, via a manifest
   URL install rather than their Import Wizard) can fetch it directly.

   The script refuses to run if the working tree is dirty, the tag already
   exists, or `package.json`/`system.json` versions disagree.
5. Confirm the `manifest` URL in `system.json` (raw URL to `system.json` on
   the default branch) is correct once the version bump is merged there —
   this is what Foundry uses to check for and install updates. For
   installing a specific release before it reaches the default branch, use
   `https://raw.githubusercontent.com/<owner>/<repo>/v<version>/system.json`
   instead.
