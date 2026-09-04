import { describe, expect, it } from 'vitest'
import { resolveUpdatedPresetCurrent } from '../module/settings/themeSettingsLogic.js'

describe('resolveUpdatedPresetCurrent', () => {
  const incomingList = { Default: {}, 'Tales of Xadia': {} }

  it('keeps "custom" selected regardless of what the incoming list contains', () => {
    expect(resolveUpdatedPresetCurrent('custom', incomingList, 'Default')).toBe('custom')
    expect(resolveUpdatedPresetCurrent('custom', {}, 'Default')).toBe('custom')
    expect(resolveUpdatedPresetCurrent('custom', null, 'Default')).toBe('custom')
  })

  it('keeps a named preset selected when the incoming list still defines it', () => {
    expect(resolveUpdatedPresetCurrent('Tales of Xadia', incomingList, 'Default')).toBe('Tales of Xadia')
    expect(resolveUpdatedPresetCurrent('Default', incomingList, 'Default')).toBe('Default')
  })

  it('falls back to the incoming default when the selected preset was renamed or removed', () => {
    expect(resolveUpdatedPresetCurrent('Retired Preset', incomingList, 'Default')).toBe('Default')
  })

  it('falls back to the incoming default when there is no incoming list at all', () => {
    expect(resolveUpdatedPresetCurrent('Tales of Xadia', undefined, 'Default')).toBe('Default')
    expect(resolveUpdatedPresetCurrent('Tales of Xadia', null, 'Default')).toBe('Default')
  })
})
