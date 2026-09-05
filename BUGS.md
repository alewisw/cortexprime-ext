# Known Issues

8. _${Date.now()} as an id generator. Used for every new Actor Type, Trait Set, Trait, Simple Trait, Tab, and by #onDuplicateItem. Two creations in the same millisecond collide, and ids are the matching key for mergeActorTypeData, System Traits, and inheritance. Also #onDuplicateItem (ActorSettings.js:434) only regenerates the top-level id — a duplicated Trait Set keeps its children's original ids verbatim.

11. Misplaced id in the shipped Scene actor type. module/actor/defaultActorTypes.js:139 — the "Doom Pool" Simple Trait carries id: '_21' nested inside dice ({ dice: { id, value } }) rather than on the trait itself, and '_21' appears twice in that file. That Simple Trait therefore has no id at all, so getDoomPool (hitches.js:29, which matches simpleTraits[key].id === doomPoolTraitId) and resolveSystemSimpleTraitIndex cannot resolve it by id on any actor built from the shipped default. configs/mage.json is clean — only the shipped defaults are affected. A fix needs the data corrected AND a migration for actors already carrying the broken snapshot.

12. Duplicating an entity silently double-claims its System Trait role. #onDuplicateItem copies settings.systemTraitSet / settings.systemTrait verbatim. For a Simple Trait the copy is inert but armed — findSystemSimpleTraitIndex takes the first match by position, so the original wins until someone reorders the copy above it or deletes the original, at which point Paradox/Trauma silently starts writing into the copy. For a Trait Set both stay live — getSystemTraitSetIds returns both ids, so a duplicated Powers set immediately satisfies computeMagePoolInvalidReason's "a magickal roll requires a Powers trait" and feeds the Limit calculation in paradox.js. The settings UI cannot produce this state by hand (optionsFor filters out any role a sibling already claims) and offers no way to see or repair it, since both dropdowns render their own role as selected.

13. A duplicated Trait Set's mutuallyExclusiveWith still points at the ORIGINAL's sibling. Copied verbatim by #onDuplicateItem. Because dicePoolValidation.getAllTraitSets() flattens Trait Sets across every Actor Type, that reference stays live rather than dangling — so duplicating an Actor Type creates a cross-actor-type mutual-exclusion rule the GM never asked for.

14. #onDuplicateItem throws on a stale data-id. objectFindValue returns undefined and objectMapValues(undefined, ...) then throws. Reachable when the settings form is left open while the actorTypes setting changes elsewhere. Needs an if (!item) return guard.

15. getAllTraitSets() relies on an unstated global-uniqueness invariant. dicePoolValidation.js:13-15 flattens Trait Sets across every Actor Type and matches by bare id with no Actor Type scoping, so limitOnePerDicePool and mutuallyExclusiveWith are only correct while Trait Set ids are unique across the entire world. Item 8's shallow duplicate was actively violating that.

16. Default Sections, Descriptors, SFX and Sub-Traits are created with no id. ActorSettings' #onAddAdditionalTabDefaultNote, #onAddDescriptor, #onAddSfx and #onAddSubTrait write no id field at all. Consequence: mergeActorTypeData is forced to match Default Notes by label (actorTypeChangeLogic.js:62), so renaming a Default Section in settings adds a SECOND note to every actor rather than renaming the existing one. Descriptors, SFX and Sub-Traits are never id-matched at all — they survive Update Settings only via the ...matchingSetting spread of their owning (id-matched) container.

17. plotPointUses ids are dead weight. PlotPointUsesSettings.js:81 mints one per new entry and defaultPlotPointUses.js assigns stable _1.._10, but nothing reads them — plotPointUsageDialog.js works entirely from labels. Either wire them up or drop the field.

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