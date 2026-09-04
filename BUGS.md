# Known Issues

Problems found but deliberately not fixed in the change that surfaced them. Each entry states
what is wrong, how it was observed, and what a fix would need to do.
Functional bugs

1. data-action="addToPool" fires regardless of whether trait is addable. Every trait template puts data-action="addToPool" on the element unconditionally and only makes the add-to-pool class conditional — and that class is pure cosmetics (_misc.scss:51 is cursor:pointer + a glyph). ApplicationV2 dispatches on [data-action], so the guard does nothing. Three consequences:

Text-valueType Simple Traits are addable. simple-traits.html:36 gates the class on (eq settings.valueType 'dice'), but clicking a text trait's label still runs _addToPool — and ActorSettings.#onAddSimpleTrait creates every Simple Trait with dice.value.0 = '8', so a d8 lands in the pool from a field that has no dice at all.
Shutdown traits are addable. traits.html:12-16 gates on (not traitSetShutdown)/(not trait.shutdown); the click bypasses it.
Traits with no dice throw. actor-sheet.js:422 does currentDiceData.value with no guard. mergeActorTypeData deliberately gives a newly-configured trait only {id, name, enableHinder} — no dice (encoded in actorTypeChangeLogic.test.js:239). So: add a Trait in Actor Settings → "Update Settings" on an existing actor → click its name → TypeError: Cannot read properties of undefined (reading 'value').
Fix belongs in _addToPool/_hinderToPool — re-check the same conditions the template renders the class from, rather than trusting markup.

2. system.pp.value dereferenced without optional chaining, three places. UserDicePool.js:169, rollDice.js:42, CortexPrimeActor.js:7. system.pp only exists after _actorTypeConfirm — actor-sheet.js:696 and :250 already use ?. for exactly that reason, so the other three are oversights, not policy. Player assigned a not-yet-typed actor → opening the dice tray throws in _prepareContext.

3. "Update Presets" always resets the selected preset. ThemeSettings.js:152: source[source.current] || defaultThemes.current. source.current is a preset name ('Tales of Xadia'); presets live under source.list, so source['Tales of Xadia'] is always undefined and it always falls through to defaultThemes.current. Should be source.list[source.current] ? source.current : defaultThemes.current.

4. Import crashes on an unknown theme preset. resolveActiveTheme returns list?.[current] → undefined for a preset name not in list (file from a newer version, or current: 'custom' with custom: null). ImportExportSettings.js then calls setCssVars(undefined) → Object.entries(undefined) throws mid-import, after the settings writes have already landed. Needs a fallback to list.Default.

Correctness risks
5. Mage's pool sync bypasses the dice-pool mutex and mutates live flag data. mageAscension.js:210-235 syncPoolSource does its own getFlag → mutate-in-place → setFlag(null) → setFlag, outside updateDicePool's runExclusive(DICE_POOL_KEY). That's the exact lost-update race asyncMutex.js exists to close — a GM-side Reality Reinforcement sync landing between a player's read and write silently drops one of them. Also delete currentDice.pool[...] mutates the document's own flag object rather than a copy.

6. _clearDicePool writes the shared blankPool module object. UserDicePool.js:341 returns blankPool by reference, while readDicePool at :55 explicitly clones it because callers mutate what they get back. Same hazard, one line apart. Should be foundry.utils.deepClone(blankPool).

7. Chat-sidebar re-render silently drops the Dice Pool button. cortexPrimeHooks.js:78 injects it once on ready, with no renderChatLog/renderSidebar re-injection. rollUndo.js calls ui.chat?.render() as its fallback refresh path, which would wipe it.

8. _${Date.now()} as an id generator. Used for every new Actor Type, Trait Set, Trait, Simple Trait, Tab, and by #onDuplicateItem. Two creations in the same millisecond collide, and ids are the matching key for mergeActorTypeData, System Traits, and inheritance. Also #onDuplicateItem (ActorSettings.js:434) only regenerates the top-level id — a duplicated Trait Set keeps its children's original ids verbatim.

9. Dead truthiness guards. cortexPrimeHooks.js:78 if ($rollPrivacy) and :106 if ($rollResult) — a jQuery object is always truthy. Harmless today (empty sets no-op) but the roll-decoration block runs for every chat message, and a missing #roll-privacy fails silently.

Lower priority
Stored HTML injection. traits.html:82 (descriptor.value) and :155 (sfx.description) use {{{ }}}, but both are plain <textarea> fields, not ProseMirror. A player can put markup in their own sheet that executes on the GM's client. The other {{{ }}} uses (rich-text, tab description) are legitimate.
Leftover debug log at actor-sheet.js:288.
Missing lang keys: Auto, Color, Contain, Cover, Image, WelcomeSeen. They render acceptably in English only because Foundry echoes the key back. Also lang/en.json:426 has WelcomSeenHint (typo) matching the typo'd read in settings.js:172 — consistent, so working, but wrong.
Unused imports: confirmAction, localizer in sheetHelpers.js:2; gulp-sourcemaps in gulpfile.js.
configs/playwright-export.zip and configs/mage-2.json ship in the release zip — PACKAGE_SOURCES includes configs/**/*, and CLAUDE.md documents only mage.json.
No CI. .github/ has issue templates only; nothing runs npm test.
migrateSectionPermissionsLogic.computeMigratedActorTypes adds an empty additionalTabs: {} to every Actor Type once any type needs migrating.
Not-a-bug, but worth knowing: mergeActorTypeData gives newly-configured Traits/Simple Traits no dice at all, so a trait added in settings appears on existing actors with an empty die area. Tests pin this, so I assume it's deliberate — but it's the root cause of finding #1's crash.
Want me to fix these, or write them into BUGS.md? Happy to publish the review as a shareable page too.