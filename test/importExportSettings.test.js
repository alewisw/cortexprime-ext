import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { SYNCED_SETTINGS } from '../module/settings/syncedSettings.js'
import {
  buildExportPayload,
  buildImportValues,
  buildResetValues,
  isImportableSettings,
  needsVersionWarning,
  resolveActiveTheme,
  resolveImportedThemes
} from '../module/settings/importExportLogic.js'

describe('SYNCED_SETTINGS', () => {
  it('covers every GM-authored world setting the import/export tool should sync', () => {
    expect(SYNCED_SETTINGS.map(s => s.key)).toEqual([
      'actorTypes',
      'customRuleSet',
      'plotPointUses',
      'doomPoolActorId',
      'doomPoolTraitId',
      'testModeSelectDiceValues',
      'spotlightEnabled',
    ])
  })

  it('gives every entry a default value to fall back on', () => {
    for (const entry of SYNCED_SETTINGS) {
      expect(entry).toHaveProperty('default')
    }
  })
})

// registerSettings() can't be imported and run here — it calls game.settings.register and
// localizer — so the registration list is read out of the source text instead. Crude, but it
// enforces the invariant CLAUDE.md states and nothing else checked: every setting the system
// registers must be a deliberate decision about export/import, either synced or explicitly
// excluded. Commit 1a14867 was exactly this drift (doomPoolActorId/doomPoolTraitId silently
// missing from export); this test fails on the next new setting until it's classified.
describe('SYNCED_SETTINGS vs registerSettings()', () => {
  // Every registered setting deliberately NOT synced, with the reason it isn't. Runtime state
  // is state the world produces while being played; it would be meaningless (or actively
  // harmful) to carry between worlds.
  const DELIBERATELY_UNSYNCED = {
    actorBreadcrumbs: 'UI state: where the settings app navigation currently sits',
    lastGmRoll: 'runtime state',
    activeChallenge: 'runtime state',
    dicePickerRerollRequest: 'runtime state',
    crisisPool: 'runtime state',
    rollUndoSnapshots: 'runtime state',
    activeDistinctionActorId: 'runtime state',
    spotlightActorId: 'runtime state',
    importedSettings: 'records which settings file was imported — describes the import itself',
    WelcomeSeen: 'runtime state',
    rollResultSourceCollapsed: 'client-scoped personal display preference, not world config',
    themes: 'handled separately in ImportExportSettings.js — only current/custom are GM-authored'
  }

  const registeredKeys = () => {
    const source = readFileSync(
      fileURLToPath(new URL('../module/settings/settings.js', import.meta.url)),
      'utf8'
    )

    // Matches game.settings.register('cortexprime-ext', 'key', — and NOT registerMenu(, since
    // the literal '(' has to follow "register" immediately.
    return [...source.matchAll(/game\.settings\.register\(\s*['"]cortexprime-ext['"]\s*,\s*['"]([^'"]+)['"]/g)]
      .map(match => match[1])
  }

  it('finds the registration list in settings.js', () => {
    // Guards the regex itself: if settings.js is ever reformatted so the pattern stops
    // matching, this fails loudly instead of the checks below passing vacuously.
    expect(registeredKeys().length).toBeGreaterThan(15)
    expect(registeredKeys()).toContain('actorTypes')
  })

  it('classifies every registered setting as either synced or deliberately unsynced', () => {
    const classified = new Set([...SYNCED_SETTINGS.map(s => s.key), ...Object.keys(DELIBERATELY_UNSYNCED)])
    const unclassified = registeredKeys().filter(key => !classified.has(key))

    // A new world setting lands here. Add it to SYNCED_SETTINGS if the GM authors it and it
    // should travel between worlds, or to DELIBERATELY_UNSYNCED above with the reason why not.
    expect(unclassified).toEqual([])
  })

  it('syncs nothing that is not actually registered', () => {
    const registered = new Set(registeredKeys())

    expect(SYNCED_SETTINGS.map(s => s.key).filter(key => !registered.has(key))).toEqual([])
  })

  it('does not both sync and exclude the same setting', () => {
    const overlap = SYNCED_SETTINGS.map(s => s.key).filter(key => key in DELIBERATELY_UNSYNCED)

    expect(overlap).toEqual([])
  })
})

describe('isImportableSettings', () => {
  it('accepts a file carrying the system version', () => {
    expect(isImportableSettings({ cortexPrimeVersion: '0.3.0' })).toBe(true)
  })

  // Exports predating the cortexPrimeVersion field are still recognised, by their actorTypes.
  it('accepts a legacy export identified only by actorTypes', () => {
    expect(isImportableSettings({ actorTypes: { 0: { name: 'Character' } } })).toBe(true)
  })

  it('rejects unrelated JSON, and anything unreadable', () => {
    expect(isImportableSettings({ some: 'other json' })).toBe(false)
    expect(isImportableSettings({})).toBe(false)
    expect(isImportableSettings(null)).toBe(false)
    expect(isImportableSettings(undefined)).toBe(false)
  })
})

describe('needsVersionWarning', () => {
  it('stays quiet when the file came from this exact version', () => {
    expect(needsVersionWarning('0.3.0', { cortexPrimeVersion: '0.3.0' })).toBe(false)
  })

  it('warns on any mismatch, older or newer', () => {
    expect(needsVersionWarning('0.3.0', { cortexPrimeVersion: '0.2.0' })).toBe(true)
    expect(needsVersionWarning('0.3.0', { cortexPrimeVersion: '0.4.0' })).toBe(true)
  })

  // The legacy actorTypes-only file is importable but carries no version, so it always warns.
  it('warns for a file with no version at all', () => {
    expect(needsVersionWarning('0.3.0', { actorTypes: {} })).toBe(true)
    expect(needsVersionWarning('0.3.0', null)).toBe(true)
  })
})

describe('buildExportPayload', () => {
  const payload = () => buildExportPayload(
    '0.3.0',
    { current: 'Default', custom: { sheetBackgroundColor: '#fff' }, list: { Default: {} }, version: 2 },
    key => `value-of-${key}`
  )

  it('stamps the system version and the GM-authored theme fields', () => {
    expect(payload().cortexPrimeVersion).toBe('0.3.0')
    expect(payload().theme).toEqual({ current: 'Default', custom: { sheetBackgroundColor: '#fff' } })
  })

  // list and version are shipped presets; carrying them would overwrite the target world's
  // themes with whatever the source world happened to ship.
  it('exports only current and custom from the theme, never list or version', () => {
    expect(Object.keys(payload().theme)).toEqual(['current', 'custom'])
  })

  // The whole point of driving off SYNCED_SETTINGS: export can't drift from import (1a14867).
  it('reads exactly the synced settings, and nothing else', () => {
    const keys = Object.keys(payload()).filter(key => !['cortexPrimeVersion', 'theme'].includes(key))

    expect(keys).toEqual(SYNCED_SETTINGS.map(s => s.key))
  })

  it('exports each setting at its live value', () => {
    expect(payload().customRuleSet).toBe('value-of-customRuleSet')
  })
})

describe('buildImportValues', () => {
  it('takes the value from the file when the file has it', () => {
    const values = Object.fromEntries(buildImportValues({ customRuleSet: 'mage', doomPoolActorId: 'abc' }))

    expect(values.customRuleSet).toBe('mage')
    expect(values.doomPoolActorId).toBe('abc')
  })

  // A partial or legacy file must leave the world in a coherent state rather than writing
  // undefined over a setting.
  it('falls back to the default for any key the file omits', () => {
    const values = Object.fromEntries(buildImportValues({ customRuleSet: 'mage' }))

    expect(values.doomPoolActorId).toBe('')
    expect(values.spotlightEnabled).toBe(true)
    expect(values.testModeSelectDiceValues).toBe(false)
  })

  it('always writes every synced setting, even from an empty file', () => {
    expect(buildImportValues({}).map(([key]) => key)).toEqual(SYNCED_SETTINGS.map(s => s.key))
    expect(buildImportValues(null).map(([key]) => key)).toEqual(SYNCED_SETTINGS.map(s => s.key))
  })

  // false and '' are real imported values; a truthiness fallback would silently flip them.
  it('preserves falsy imported values instead of replacing them with defaults', () => {
    const values = Object.fromEntries(buildImportValues({ spotlightEnabled: false, customRuleSet: '' }))

    expect(values.spotlightEnabled).toBe(false)
    expect(values.customRuleSet).toBe('')
  })
})

describe('buildResetValues', () => {
  it('resets every synced setting to its default', () => {
    expect(buildResetValues()).toEqual(SYNCED_SETTINGS.map(({ key, default: d }) => [key, d]))
  })
})

describe('resolveImportedThemes', () => {
  const existing = () => ({
    current: 'Dark',
    custom: { sheetBackgroundColor: '#111' },
    list: { Default: {}, Dark: {} },
    version: 2
  })

  it('takes the imported current and custom theme', () => {
    const result = resolveImportedThemes(existing(), {
      theme: { current: 'custom', custom: { sheetBackgroundColor: '#fff' } }
    })

    expect(result.current).toBe('custom')
    expect(result.custom).toEqual({ sheetBackgroundColor: '#fff' })
  })

  it('keeps the world’s own list and version', () => {
    const result = resolveImportedThemes(existing(), { theme: { current: 'Default' } })

    expect(result.list).toEqual({ Default: {}, Dark: {} })
    expect(result.version).toBe(2)
  })

  // A settings file with no theme block must not wipe a custom theme the GM already built.
  it('falls back to Default and keeps the existing custom theme when the file has no theme', () => {
    const result = resolveImportedThemes(existing(), {})

    expect(result.current).toBe('Default')
    expect(result.custom).toEqual({ sheetBackgroundColor: '#111' })
  })

  it('does not mutate the existing settings object', () => {
    const original = existing()
    resolveImportedThemes(original, { theme: { current: 'custom', custom: { x: 1 } } })

    expect(original).toEqual(existing())
  })
})

describe('resolveActiveTheme', () => {
  it('uses the custom theme when current is "custom"', () => {
    expect(resolveActiveTheme({ current: 'custom', custom: { a: 1 }, list: { Default: { b: 2 } } }))
      .toEqual({ a: 1 })
  })

  it('looks a named theme up in the list', () => {
    expect(resolveActiveTheme({ current: 'Default', custom: { a: 1 }, list: { Default: { b: 2 } } }))
      .toEqual({ b: 2 })
  })

  // An imported file can name a theme this world doesn't ship. Undefined means setCssVars
  // writes nothing rather than throwing, leaving the stylesheet defaults in place.
  it('is undefined for a named theme the world does not have', () => {
    expect(resolveActiveTheme({ current: 'Ghost', custom: {}, list: { Default: {} } })).toBeUndefined()
    expect(resolveActiveTheme({ current: 'Default', custom: {} })).toBeUndefined()
  })
})
