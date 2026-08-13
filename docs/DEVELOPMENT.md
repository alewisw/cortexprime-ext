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

This compiles Sass first, then writes `dist/cortexprime-<version>.zip`, where
`<version>` is read straight from `system.json` so the filename and the
manifest inside the archive can never disagree.

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

## Releasing a new version

1. Bump the version in both `package.json` and `system.json` (`version`
   field), and update the `download` URL in `system.json` to point at the
   matching Git tag.
2. Run `npm run compile` and commit the resulting `css/cortexprime.css`
   along with any source changes.
3. Commit, tag the release (e.g. `v0.2.17`), and push the tag.
4. Create a GitHub release for that tag; the `download` URL in
   `system.json` must resolve to a zip of the repository at that tag so
   Foundry's installer can fetch it.
   Run `npm run package` if you also need a trimmed, runtime-only zip to
   attach to the release or upload to a host such as The Forge (see
   [Packaging a distributable zip](#packaging-a-distributable-zip)).
5. Confirm the `manifest` URL in `system.json` (raw URL to `system.json` on
   the default branch) is correct — this is what Foundry uses to check for
   and install updates.
