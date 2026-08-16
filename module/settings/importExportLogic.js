import { SYNCED_SETTINGS } from './syncedSettings.js'

// The decidable half of ImportExportSettings.js: what counts as an importable file, when to warn
// about a version mismatch, and how the settings and theme values resolve. Kept free of Foundry
// globals — the FileReader, Dialog.confirm and game.settings.set calls stay in the app — so the
// rules that decide what a world ends up with are unit testable.

// An export always carries cortexPrimeVersion; exports predating that field are recognised by
// actorTypes instead, so older settings files still import.
export const isImportableSettings = data =>
  !!(data?.cortexPrimeVersion || data?.actorTypes)

// Warn whenever the file wasn't written by this exact system version — including the legacy
// no-version case, which by definition doesn't match.
export const needsVersionWarning = (systemVersion, data) =>
  systemVersion !== data?.cortexPrimeVersion

// The exported payload. `readSetting` is injected so this stays pure; driving the key list off
// SYNCED_SETTINGS is what stops export drifting from import (see 1a14867).
export const buildExportPayload = (systemVersion, { current, custom }, readSetting) =>
  SYNCED_SETTINGS.reduce((payload, { key }) => ({ ...payload, [key]: readSetting(key) }), {
    cortexPrimeVersion: systemVersion,
    theme: { current, custom }
  })

// What each synced setting should become on import: the imported value, or its default when the
// file doesn't carry that key at all.
export const buildImportValues = data =>
  SYNCED_SETTINGS.map(({ key, default: fallback }) => [key, data?.[key] ?? fallback])

// What each synced setting should become on reset.
export const buildResetValues = () =>
  SYNCED_SETTINGS.map(({ key, default: fallback }) => [key, fallback])

// Merges the imported theme choice into the existing themes setting. `list` and `version` are
// static presets and are never imported — only current/custom are GM-authored. A file with no
// theme block falls back to the shipped 'Default' and keeps whatever custom theme is already
// there, so importing settings can't silently destroy someone's custom theme.
export const resolveImportedThemes = (themeSettings, data) => ({
  ...themeSettings,
  current: data?.theme?.current ?? 'Default',
  custom: data?.theme?.custom ?? themeSettings.custom
})

// Which theme object is actually active: the custom one, or the named preset from the list.
// Used on both the import and the reset path, which previously duplicated this expression.
export const resolveActiveTheme = themeSettings =>
  themeSettings.current === 'custom'
    ? themeSettings.custom
    : themeSettings.list?.[themeSettings.current]
