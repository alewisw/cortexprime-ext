# Known Issues

Problems found but deliberately not fixed in the change that surfaced them. Each entry states
what is wrong, how it was observed, and what a fix would need to do.

---

## 1. A timed-out e2e test permanently destroys world configuration

**Severity: high.** Data loss affecting real, hand-authored game configuration. Silent — the
suite reports a test failure, not a data problem, and the damage persists into every later run.

Found 2026-09-02/03 during the Application V1 → V2 migration. Not caused by that migration; the
migration only made it happen twice.

### What goes wrong

Most specs mutate shared world state and put it back in a `finally`:

```js
const before = await snapshotSettings(gm.page, SETTINGS_KEYS)
try {
  await setSetting(gm.page, 'actorTypes', { 0: PARENT })   // replaces the WHOLE setting
  ...
} finally {
  await restoreSettings(gm.page, before)                    // <-- runs in the page that just died
  await gm.context.close()
}
```

`snapshotSettings` and `restoreSettings` (`e2e/helpers/world.js:105-118`) both work through
`page.evaluate`. When a test times out, Playwright tears the context down, so the `finally`
block's `page.evaluate` throws `Target page, context or browser has been closed` and the restore
never happens. The pre-test value existed only inside that dead page's memory, so it is now
unrecoverable.

The reported failure is the *cleanup* error, which also hides whatever actually went wrong:

```
Error: page.evaluate: Target page, context or browser has been closed
   at helpers\world.js:15
   at setSetting (e2e/helpers/world.js:15:15)
   at resetWorld (e2e/challenge-resolution.spec.js:44:9)
```

### Observed twice

**A. `actor-type-inheritance.spec.js` wiped `actorTypes` (2026-09-03).**
The spec replaces the entire `actorTypes` setting with a two-entry fixture (`E2E Parent`, and a
derived type it creates). A test timed out; the restore never ran. The world was left with:

```
{"count":2,"names":["E2E Parent","New Derived Actor Type"]}
```

The real value was 14 Actor Types: `Scene, Doom Pool, NPC, Tradition Mage, The Akashic
Brotherhood, The Celestial Chorus, The Cult of Ecstasy, The Dreamspeakers, The Euthanatos, The
Order of Hermes, The Sons of Ether, The Verbena, The Virtual Adepts, The Orphans` — i.e. every
Mage Tradition. Recovered only because an unrelated snapshot happened to be sitting on disk from
an earlier Import/Export check. **Without that file it was gone.**

**B. `actor-sheet.spec.js` left an actor stuck in an editing mode (2026-09-02).**
Its first test sets `system.actorType.traitSetEdit` on `Amanda Singh` and clears it in `finally`.
After a run where the `finally` failed, the actor was left with `traitSetEdit: "0"` permanently.
That makes her sheet render the trait-set-edit panel instead of the tabbed sheet on *every*
open — so `nav.sheet-tabs a.item` resolved to 0 elements and `.add-complication` never existed.
It failed 8 tests across two spec files, and survived between runs because each spec then
snapshotted the already-broken value as its "before". Three debugging cycles went into what was
a single stuck field.

The same run also accumulated 11 junk notes in `Values Log` (`E2E max-height check` ×4, plus
others whose labels a test had blanked) and a stray `Playwright Edit Me` complication. Duplicate
labels then cause `strict mode violation` failures in unrelated tests.

### Why `global-setup.js` does not save you

It resets only *transient* state — `crisisPool`, `spotlightActorId`, `activeChallenge`,
`mageChallengeState` (`e2e/global-setup.js:51-68`). It does not touch the durable, hand-authored
configuration that specs overwrite: `actorTypes`, `actorBreadcrumbs`, `plotPointUses`, `themes`,
nor any actor-level state such as `traitSetEdit` or `additionalTabs.*.notes`.

### Contributing factor: no `actionTimeout`

`playwright.config.js` sets `timeout: 180_000` and `expect.timeout: 15_000`, but no
`actionTimeout`. Playwright's default is **0 — wait forever**. So a `.click()` on an element that
never becomes actionable (covered by an overlay, say) hangs for the entire 180s test timeout
instead of failing in 15s with a useful message.

That is the mechanism behind most of the timeouts here, and therefore behind most of the lost
restores. Two real examples:

- Foundry's permanent "no hardware acceleration" toast sits over the middle of an actor sheet at
  the 1366×768 viewport and swallows clicks aimed underneath it. Six `actor-sheet` tests hung on
  this, each burning 180s, with the button logged "visible, enabled and stable" throughout. (Now
  worked around by clearing notifications at login, in `e2e/foundry.js`.)
- `challenge-resolution.spec.js` › "a Group Challenge runs from initiative through duelling to a
  single winner" still times out at 6 minutes on every run — see issue 2 below.

### Blast radius

13 spec files mutate world settings or actors. The ones that replace a *whole* durable setting
are the dangerous ones:

| Spec | Keys replaced wholesale | Risk if restore is lost |
|---|---|---|
| `actor-type-inheritance.spec.js` | `actorTypes`, `actorBreadcrumbs` | **Total loss of all Actor Type configuration** |
| `actor-sheet.spec.js` | actor `system.actorType.*` (traitSetEdit, notes, deletedSections, trait-set shutdown) | Actor left unusable; notes accumulate |
| `complications.spec.js` | actor `system.actorType.complications` | Stray complications accumulate |
| `actor-type-change.spec.js` | actor `img`, `system.actorType`, `system.pp` | Actor's type/portrait/plot points |
| `challenge-resolution`, `challenge`, `give-in`, `hitches`, `roll-undo`, `paradox`, `mage` | `activeChallenge`, `lastGmRoll`, `crisisPool`, `testModeSelectDiceValues`, `rollUndoSnapshots`, `mageChallengeState` | Transient; `global-setup` already re-resets these |

### Suggested fixes, in order of value

1. **Persist the snapshot outside the browser.** Write it to a file (or a Node-side variable in a
   fixture) *before* mutating, so restore never depends on the page surviving. A Playwright
   `test.afterEach` or a worker fixture can restore from that copy even after a context dies. This
   is the actual fix; everything below is mitigation.

2. **Set `actionTimeout` in `playwright.config.js`** — 15s to match `expect.timeout`. Turns
   "hangs for 3 minutes then destroys the world" into "fails in 15 seconds naming the locator".
   One line, and it addresses the most common trigger.

3. **Add a durable-state guard to `global-setup.js`.** Assert (or repair) a known-clean baseline
   before the suite runs: `traitSetEdit: null` on the test actors, no `E2E *` notes or
   complications left over, and `actorTypes` not equal to the fixture. Incident B poisoned three
   consecutive runs precisely because nothing checked.

4. **Stop specs from replacing whole settings.** `actor-type-inheritance.spec.js` could append its
   fixture types alongside the real ones and address them by id, rather than swapping the entire
   `actorTypes` object. Smaller blast radius even when a restore is lost.

5. **Fail fast on a dirty world.** If a spec's `before` snapshot already looks like a fixture
   (e.g. `actorTypes` contains `_e2e-parent`), abort the suite with a clear message rather than
   snapshotting the damage and cementing it.

### Immediate workaround

**Export your settings before running the suite** (Configure Settings → Cortex Prime → Import /
Export → Export Settings). That file is a complete, restorable copy of every synced setting,
including `actorTypes`. There is a known-good export of the 14 Actor Types at
`.tmp-probe/settings-backup.json` if it has not been cleaned up.

---

## 2. `challenge-resolution.spec.js` › Group Challenge times out

**Severity: medium.** One test never passes; costs 6 minutes per run and, per issue 1, can take
world state with it.

`challenge-resolution.spec.js:250` — "a Group Challenge runs from initiative through duelling to a
single winner" — exceeds its 360s timeout on every run.

Confirmed **pre-existing and unrelated to the V1 → V2 migration**: it fails identically with the
migration work stashed on the preceding commit, and it fails the same way run in isolation. It
had never been run before the migration started, so nothing had previously flagged it.

Diagnosis is blocked by the same masking described above — the only error surfaced is the
`finally` block's, so the click that actually hangs is invisible. **Fix `actionTimeout` first**
(issue 1, item 2); that alone should name the offending locator.

---

## 3. Dead code in `module/scripts/settingsHelpers.js`

**Severity: trivial.**

`collapseToggle` and `displayToggle` have no callers anywhere in `module/`, `templates/` or
`e2e/`. They are also the only jQuery left in that file now that every settings application has
moved to ApplicationV2. Safe to delete.

---

## 4. Theme edits do not repaint the live CSS variables

**Severity: low.** Pre-existing; behaviour is unchanged by the V2 migration.

`ThemeSettings` calls `setCssVars(getCurrentTheme())` after every save, but `getCurrentTheme()`
reads `themes.list[current]` (or `themes.custom`) — never `themes.currentSettings`, which is what
the form actually edits. So changing a value stores it without updating the page.

Observed: setting `bodyFontSize` to 19 left `--cp-body-font-size` at `15px`. The appv1 code did
exactly the same, so this was left alone during the migration rather than smuggling a behaviour
change into it. Worth deciding whether the live preview is meant to track edits.

---

## 5. The complication picker's scroll position is never restored

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
