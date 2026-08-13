import { describe, expect, it } from 'vitest'
import { SYNCED_SETTINGS } from '../module/settings/syncedSettings.js'

describe('SYNCED_SETTINGS', () => {
  it('covers every GM-authored world setting the import/export tool should sync', () => {
    expect(SYNCED_SETTINGS.map(s => s.key)).toEqual([
      'actorTypes',
      'customRuleSet',
      'mageSettings',
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
