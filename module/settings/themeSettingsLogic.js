// Pure decision logic for ThemeSettings.js. Kept free of Foundry globals so it's unit-testable;
// the game.settings read/write and setCssVars call live in ThemeSettings.js.

// Which preset name should remain selected once "Update Presets" pulls in the latest built-in
// preset list (defaultThemes.list, about to replace the world's own `source.list`). 'custom'
// always survives — it isn't drawn from the list at all. A named preset survives only if
// `incomingList` (the list about to be written, NOT whatever `source.list` held before this
// update) still defines that name; a preset this update renames or removes must fall back to
// `incomingDefault` rather than stay selected pointing at a name that's about to disappear —
// leaving `source.currentSettings` to resolve against `source.list[source.current]` afterward
// would otherwise land on undefined.
export const resolveUpdatedPresetCurrent = (current, incomingList, incomingDefault) =>
  current === 'custom'
    ? 'custom'
    : incomingList?.[current]
      ? current
      : incomingDefault
