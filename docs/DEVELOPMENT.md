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

**Disable modules that render their own floating windows** in the test world. The suite clicks
real controls, and a module window parked over the Dice Pool tray silently intercepts those
clicks — the button underneath stays in the DOM, so the spec hangs until it times out rather than
failing with anything useful. `yendors-scene-actors` is the known offender; `00-preflight.spec.js`
fails up front if any window is open right after login.

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
James` automatically, **and grants each player OWNER on their own
character** — the actors just need to already exist in the world.

That ownership grant matters: being *assigned* an actor is not the same as
being able to use it. Foundry silently refuses to render a sheet the user
can't observe, so without OWNER a player can't open their character, add
traits to a dice pool, or roll — and most of the suite would skip.

### What's covered

| Spec | Covers |
|---|---|
| `00-preflight.spec.js` | Runs first: fails loudly when the world itself is unfit — the Playwright GM isn't Foundry's active GM, a challenge or crisis is still running, Magick is armed, a module window is open over the UI, or the test actors aren't linked |
| `smoke.spec.js` | Harness proof-of-life: login → `game.ready` → read live system state |
| `multi-session.spec.js` | GM + both players logged in simultaneously, correctly linked and unpaused |
| `floating-panel.spec.js` | Role gating: My Character (player-only), Scene Journal (GM-only), Crisis toggle (GM-only), Doom Pool (both) |
| `spotlight.spec.js` | GM sets/clears the spotlight live on all clients; the `spotlightEnabled` master switch; a disconnecting player drops out of the GM's list |
| `crisis-pool.spec.js` | Start / edit / end a crisis, with the card and its dice count reaching both players live |
| `doom-pool.spec.js` | Configuring the actor makes the button appear live for GM *and* players; it opens that actor's sheet |
| `my-character.spec.js` | A player opens their own sheet; unassigning removes the button live |
| `dice-pool.spec.js` | GM-only difficulty buttons (and that they replace, not append); custom dice; adding a trait from a character sheet |
| `challenge.spec.js` | A Test holds its responder back until the initiator rolls, then enables them live, while the bystander stays locked out; Contest radios lock once underway; Group Challenge needs three participants |
| `actor-sheet.spec.js` | Trait-set shutdown dims the set *and* strips `add-to-pool`; a GM's shutdown re-renders the owning player's open sheet; additional tabs; the Help link is gone |
| `mage.spec.js` | The Magick box is GM-only and challenge-gated; the Magick choice is announced live on every tray; a magickal roll is refused without a Powers trait |
| `challenge-resolution.spec.js` | Real rolls driven through to resolution: a Contest's roles swapping and ending, Crisis Pool reduction on a player win (and *not* on a GM win), Effect-die blunting, Interference, and a Group Challenge from initiative through duelling to a winner |
| `hitches.spec.js` | A player's natural 1 opens the Hitches dialog on the GM's client only; confirming writes the complication and awards the Plot Point onto the player; the dialog's "Choose…" button reuses ComplicationDialog's picker (in pickOnly mode - no dice/hidden/delete UI) to name the complication, and only the Hitches dialog itself ever writes to the actor |
| `roll-undo.spec.js` | The GM's Undo button on a player's roll card restores the challenge and frees them to roll again |
| `complications.spec.js` | Add opens ComplicationDialog directly (Cancel writes nothing); picking a preset from the Category → SubCategory → Severity list fills the name and fixes the die to that severity, and Confirm writes it; the sheet shows it read-only, with no inline edit fields left anywhere; the pencil re-opens an existing one pre-filled, persists edits, and Delete removes it after an "Are you sure?" confirmation |
| `give-in.spec.js` | The Dice Pool's Give In button, after confirmation: gains a Plot Point, records the concession as a loss (riding the existing Contest/Group resolution pipeline through to actually ending it), and announces the opponent's effect dice taken; not offered for a Test challenge, nor to the GM even as the designated responder |
| `actor-type-inheritance.spec.js` | A derived Actor Type renders its parent's fields disabled but its own name editable, can still add a Trait Set of its own, and picks up a later parent rename without losing that addition |
| `actor-type-change.spec.js` | The change-actor-type pencil is GM-only; it reopens the picker preselected to the actor's current type; confirming rewrites `system.actorType`, keeps the dice both types share, leaves the portrait and Plot Points alone, and zeroes Plot Points when the new type has none |
| `paradox.spec.js` | A losing magickal roll earns Paradox **even when the roll before it also lost** — the regression guard for reading the roll record out of the `updateActor` diff; also covers the Paradox dialog's rendered breakdown |

Deliberately **not** covered, and why:

- Anything already proven by the ~550 Vitest unit tests (challenge
  resolution maths, hitch plot-point rules, crisis reduction, paradox
  arithmetic). E2E duplicates of those add runtime, not confidence — but note
  the *orchestration* around them is covered, in
  `challenge-resolution.spec.js`: the unit tests prove what the answer should
  be, that spec proves the answer actually reaches every client.
- `Reset to Default` / importing settings — they overwrite world-wide
  `actorTypes` and themes, which is too destructive to run against a world
  you care about.
- The one-shot `migrateNotesToTabs` migration: destructive, runs once, and
  its logic is unit-tested.

### Two preconditions for the resolution specs

`challenge-resolution.spec.js`, `hitches.spec.js` and `roll-undo.spec.js` roll
real dice rather than seeding roll records, and they need two things the older
specs don't:

- **Deterministic dice.** They switch the `testModeSelectDiceValues` world
  setting on themselves and restore it afterwards, then wait for it to reach
  each player's client — the picker reads it when it opens, so rolling before it
  lands produces random dice. `setDieValues()` drives the picker to a requested
  *multiset* of faces, not a positional list: the picker re-sorts after every
  edit, and a die dropped to a natural 1 moves into the hitches list.

- **The test GM must be Foundry's active GM.** The Hitches dialog, the roll-undo
  snapshot and its card refresh, and challenge advancement all run on
  `game.users.activeGM` only, so they happen once rather than once per connected
  GM. Foundry elects the first connected GM — so if your own Gamemaster session
  is open, it wins, and those reactions land on *your* screen instead of the
  test's. `hitches.spec.js` and `roll-undo.spec.js` assert on that GM-side UI and
  will **skip** with an explanatory reason (`requireActiveGM()`) unless the
  Playwright GM holds the election. Close your own GM session to run them.
  `challenge-resolution.spec.js` asserts on shared world state instead, so it
  passes either way.

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
