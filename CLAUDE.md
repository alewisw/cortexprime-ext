# CLAUDE.md

A FoundryVTT **game system** (not a module): Cortex Prime Extended, package id
`cortexprime-ext`. This checkout lives inside Foundry's `Data/systems/` folder, so it *is*
what the local Foundry loads — there is no deploy step.


## Instructions

1. Ask, don't assume. If something is unclear, ask before writing a single line. Never make silent assumptions about intent, architecture, or requirements. When running unattended, pick the most reasonable interpretation, proceed, and record the assumption rather than blocking.
2. Implement the simplest solution for simple problems, better solutions for harder problems. Do not over-engineer or add flexibility that isn't needed yet.
3. Don't touch unrelated code but please do surface bad code or design smells you discover withme so we can address them as a separate issue.
4. Flag uncertainty explicitly. If you're unsure about something, see point 1 above. If it makes sense to do so, conduct a small, localised and low-risk experiment and bring the hypothesis and results to me to discuss. Confidence without certainty causes more damage than admitting a gap.
5. I'm always open to ideas on better ways to do things. Please don't hesitate to suggest a better way, or one that has long lasting impact over a tactical change. (as a few examples)
 

## Responses

Respond like smart caveman. Cut all filler, keep technical substance.
- Drop articles (a, an, the), filler (just, really, basically, actually).
- Drop pleasantries (sure, certainly, happy to).
- No hedging. Fragments fine. Short synonyms.
- Technical terms stay exact. Code blocks unchanged.
- Pattern: [thing] [action] [reason]. [next step].
 

## Testing

When implementing a new feature:
- All unit tests (`vitest`) must pass.
- NEVER run `npx playwright test` with no file/grep filter. Always target specific test titles.
- Before running anything, name which test titles (and their spec file(s)) are impacted (import/exercise the changed module) and run only those, plus any new test titles.
- Full-suite e2e runs require explicit request from me.


## Architecture

### Commands

| Command | Does |
|---|---|
| `npm run compile` | Compile `scss/` → `css/cortexprime.css` (one-off) |
| `npm run watch` | Same, watching for changes |
| `npm test` | Vitest unit tests (`test/**/*.test.js`) |
| `npm run test:e2e` | Playwright tests against a **running** local Foundry |
| `npm run test:e2e:ui` | Same, in Playwright's UI mode |
| `npm run package` | Build `dist/<id>-<version>.zip` |
| `npm run release` | Tag, push, and publish a GitHub release |

JavaScript is loaded directly as ES modules — **Sass is the only build step**. After changing
`scss/`, recompile and commit `css/cortexprime.css`, which is checked in.

### Design

- `cortexprime.js` — entry point (`esmodules` in `system.json`)
- `module/` — system source; `templates/` — Handlebars; `lang/` — localization
- `configs/mage.json` — a checked-in settings export used to configure the Mage rule set

**The pure-logic split.** Most of `module/` is tightly coupled to Foundry globals
(`game`, `Hooks`, `CONFIG`) and can't be unit tested. The pattern is to extract the decidable
part into a sibling `*Logic.js` (e.g. `hitches.js` → `hitchesLogic.js`), and unit test only
that. When adding logic worth testing, follow this — don't try to mock Foundry.

**Settings are the sync layer.** Cross-client state (`activeChallenge`, `crisisPool`,
`spotlightActorId`, …) lives in world settings, and clients react via hooks. Two gotchas:

- Use `onSettingChanged()` from `module/scripts/foundryHelpers.js`, **not**
  `Hooks.on('updateSetting')`. A setting's *first* ever write creates the Setting document and
  fires `createSetting` instead — listening only for updates silently misses it on a fresh
  world.
- Adding a new world setting? Also add it to `SYNCED_SETTINGS`
  (`module/settings/syncedSettings.js`) or it won't survive settings export/import.

### Testing

Two suites, deliberately separate — `test/` (Vitest, pure logic, no Foundry) and `e2e/`
(Playwright, drives a real browser against a real running Foundry).

The e2e suite is **local-only** and needs a world already launched, plus three no-password
accounts (`PlaywrightGamemaster`, `PlaywrightPlayer1`, `PlaywrightPlayer2`) and two actors
(`Amanda Singh`, `Cameron James`). `e2e/global-setup.js` handles the rest (linking, ownership,
unpausing, resetting state). See `docs/DEVELOPMENT.md` for the full setup and coverage table.

Specs must restore anything they mutate in a `finally` — the target is a real world.

Two things learned the hard way, already encoded in `e2e/helpers/`:

- An open actor sheet **covers the top-center floating panel** at the test viewport, and
  Foundry won't reposition it. Close sheets before touching the panel.
- Challenge radios/checkboxes are keyed by **actor id**, and the GM is the literal string
  `'gm'` — not user ids.

### Docs

- `docs/AUTOMATION.md` — what the features do, from a GM/player's perspective
- `AUTOMATION.md` (root) — how the reactive/hook-driven internals work
- `docs/DEVELOPMENT.md` — build, deploy, test, release
