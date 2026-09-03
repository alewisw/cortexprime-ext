# Known Issues

Problems found but deliberately not fixed in the change that surfaced them. Each entry states
what is wrong, how it was observed, and what a fix would need to do.

---

## 1. Dead exports in the shared helper modules

**Severity: trivial.**

Three exported functions have no callers anywhere in `module/`, `templates/` or `e2e/`:

| Function | File |
|---|---|
| `collapseToggle` | `module/scripts/settingsHelpers.js` |
| `displayToggle` | `module/scripts/settingsHelpers.js` |
| `addNewDataPoint` | `module/scripts/sheetHelpers.js` |

The first two are also the only jQuery left in `settingsHelpers.js` now that every settings
application has moved to ApplicationV2. `addNewDataPoint` additionally writes to a `data.<path>`
key, which is a pre-v10 data path and would not resolve against a modern Actor. All three predate
the V1 → V2 migration and are safe to delete.

---

## 2. Theme edits do not repaint the live CSS variables

**Severity: low.** Pre-existing; behaviour is unchanged by the V2 migration.

`ThemeSettings` calls `setCssVars(getCurrentTheme())` after every save, but `getCurrentTheme()`
reads `themes.list[current]` (or `themes.custom`) — never `themes.currentSettings`, which is what
the form actually edits. So changing a value stores it without updating the page.

Observed: setting `bodyFontSize` to 19 left `--cp-body-font-size` at `15px`. The appv1 code did
exactly the same, so this was left alone during the migration rather than smuggling a behaviour
change into it. Worth deciding whether the live preview is meant to track edits.

---

## 3. The complication picker's scroll position is never restored

**Severity: low (cosmetic).** Pre-existing; behaviour is unchanged by the V2 migration.

`ComplicationDialog` re-renders its whole form when a name is picked, so the name lists jump back
to the top. It carries code specifically to prevent that - capture every `.picker-name-list`
scrollTop before the re-render, put it back afterwards - and a comment explaining why. **It does
not work, and never did.**

Measured on both frameworks, picking a name after scrolling the only list long enough to overflow:

| | scrollTop before | after |
|---|---|---|
| appv1 (`activateListeners` restore) | 3 | 0 |
| ApplicationV2 (`_onRender` restore) | 18 | 0 |

Also tried, with the same result: `PARTS.scrollable`, and the mixin's own
`_preSyncPartState`/`_syncPartState` hooks. Note `PARTS.scrollable` could not express this case
anyway - it resolves each selector with `querySelector`, i.e. the first match only, and there is
one `.picker-name-list` per severity group (three for Mental / Anger and Aggression).

The likely cause is that the freshly inserted list has not been laid out when `scrollTop` is
assigned, so the value clamps to 0. A fix probably needs to force a reflow first, or defer to
`requestAnimationFrame`. The V2 port keeps the same capture/restore shape as appv1 so the fix has
an obvious place to land.

Only the first of the three lists overflows at the default window size, so the visible effect is
small - which is presumably why it went unnoticed.

---

## 4. A stylesheet rule that never applied, removed

**Severity: trivial.** Recorded because the fix is a judgement call, not because anything is broken.

`scss/global/_reset.scss` opened with:

```scss
.window-app {
  font-family: $font-primary;

  .window-content { background: #ffffff; }
}
```

That file is imported inside a `.cortexprime { }` block, so it compiled to
`.cortexprime .window-app` — a *descendant* selector. The rule immediately below it was
`&.window-app`, i.e. the same class on the same element. The missing `&` looks like a typo: this
system's windows carry both classes on one element, never nested, so the rule matched nothing.
Confirmed live with the actor sheet and dice pool tray open — `.cortexprime .window-app` matched
0 elements, as did `.cortexprime .application` after the migration.

Deleted during the V1 → V2 finalisation rather than translated to `.application`, because
"translating" it would have applied `font-family` and a white `.window-content` background to
every window in the system for the first time — and it would immediately contradict the
`background: none` the very next rule sets. If the original intent was `&.window-app`, that
intent should be restored deliberately, with a look at how it interacts with the rule below it.
