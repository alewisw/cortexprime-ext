import { describe, expect, it } from 'vitest'
import {
  computeGmRealityReinforcementDiceMap,
  computeMagePoolInvalidReason,
  computeRealityReinforcementSync,
  getCurrentRollerIds,
  getMagickLabelKey,
  isMageRuleSetActive,
  resolvePoolSourceWrite,
  shouldShowChallengeBox
} from '../module/mage/mageAscensionLogic.js'

describe('isMageRuleSetActive', () => {
  it('is true only for the mage rule set', () => {
    expect(isMageRuleSetActive('mage')).toBe(true)
    expect(isMageRuleSetActive('none')).toBe(false)
    expect(isMageRuleSetActive(undefined)).toBe(false)
  })
})

describe('shouldShowChallengeBox', () => {
  it('shows only when mage is active and a Challenge type is selected', () => {
    expect(shouldShowChallengeBox('mage', { type: 'test' })).toBe(true)
    expect(shouldShowChallengeBox('mage', { type: 'contest' })).toBe(true)
    expect(shouldShowChallengeBox('mage', { type: 'group' })).toBe(true)
  })

  it('is hidden when mage is not the active rule set', () => {
    expect(shouldShowChallengeBox('none', { type: 'test' })).toBe(false)
  })

  it('is hidden when no Challenge is selected', () => {
    expect(shouldShowChallengeBox('mage', { type: null })).toBe(false)
    expect(shouldShowChallengeBox('mage', {})).toBe(false)
  })
})

describe('getCurrentRollerIds', () => {
  it('returns nothing when there is no active Challenge', () => {
    expect(getCurrentRollerIds({ type: null }, [], false)).toEqual([])
  })

  it('Test/Contest: returns responders (minus gm) once the initiator has rolled', () => {
    const challenge = { type: 'test', responderIds: ['actor1', 'actor2', 'gm'] }
    expect(getCurrentRollerIds(challenge, [], true)).toEqual(['actor1', 'actor2'])
  })

  it('Test/Contest: returns nothing before the initiator has rolled', () => {
    const challenge = { type: 'contest', responderIds: ['actor1'] }
    expect(getCurrentRollerIds(challenge, [], false)).toEqual([])
  })

  it('Group, initiative phase: returns everyone still owing an Initiative roll, minus gm', () => {
    const challenge = {
      type: 'group',
      updatedAt: 100,
      group: { phase: 'initiative', participantIds: ['gm', 'actor1', 'actor2'] }
    }
    const targets = [
      { id: 'gm', rolledAt: 50 },
      { id: 'actor1', rolledAt: 50 },
      { id: 'actor2', rolledAt: 150 }
    ]

    expect(getCurrentRollerIds(challenge, targets, false)).toEqual(['actor1'])
  })

  it('Group, dueling phase: returns only the front-of-queue challenger, minus gm', () => {
    const challenge = { type: 'group', group: { phase: 'dueling', queue: ['actor1', 'actor2'], championId: 'actor3' } }
    expect(getCurrentRollerIds(challenge, [], false)).toEqual(['actor1'])
  })

  it('Group, dueling phase: returns nothing when the front of the queue is gm', () => {
    const challenge = { type: 'group', group: { phase: 'dueling', queue: ['gm'], championId: 'actor3' } }
    expect(getCurrentRollerIds(challenge, [], false)).toEqual([])
  })

  it('Group with no group state or unknown phase returns nothing', () => {
    expect(getCurrentRollerIds({ type: 'group', group: null }, [], false)).toEqual([])
    expect(getCurrentRollerIds({ type: 'group', group: { phase: 'selecting' } }, [], false)).toEqual([])
  })
})

describe('computeMagePoolInvalidReason', () => {
  // Powers Trait Set ids arrive as a list: each Actor Type tags its own 'powers' Trait Set, so a
  // Player's and an NPC's both count.
  const powersIds = ['powers-id']

  it('is invalid when Magick is none and a Powers-trait entry is present', () => {
    const poolEntries = [{ traitSetId: 'powers-id' }]
    expect(computeMagePoolInvalidReason('none', poolEntries, powersIds)).toBe('MageNonMagicalPowerTraitInvalid')
  })

  it('is valid when Magick is none but no Powers-trait entry is present', () => {
    const poolEntries = [{ traitSetId: 'other-id' }]
    expect(computeMagePoolInvalidReason('none', poolEntries, powersIds)).toBeNull()
  })

  it('is valid whenever Magick is not none and a Powers-trait entry is present', () => {
    const poolEntries = [{ traitSetId: 'powers-id' }]
    expect(computeMagePoolInvalidReason('vulgar', poolEntries, powersIds)).toBeNull()
    expect(computeMagePoolInvalidReason('coincidental-witnessed', poolEntries, powersIds)).toBeNull()
  })

  it('is invalid when Magick is not none and no Powers-trait entry is present', () => {
    const poolEntries = [{ traitSetId: 'other-id' }]
    expect(computeMagePoolInvalidReason('vulgar', poolEntries, powersIds)).toBe('MageMagicalPowerTraitRequired')
    expect(computeMagePoolInvalidReason('coincidental', poolEntries, powersIds)).toBe('MageMagicalPowerTraitRequired')
    expect(computeMagePoolInvalidReason('vulgar-witnessed', [], powersIds)).toBe('MageMagicalPowerTraitRequired')
  })

  it('matches an entry from any tagged Powers Trait Set', () => {
    const bothIds = ['pc-powers-id', 'npc-powers-id']

    expect(computeMagePoolInvalidReason('vulgar', [{ traitSetId: 'npc-powers-id' }], bothIds)).toBeNull()
    expect(computeMagePoolInvalidReason('none', [{ traitSetId: 'pc-powers-id' }], bothIds))
      .toBe('MageNonMagicalPowerTraitInvalid')
    expect(computeMagePoolInvalidReason('vulgar', [{ traitSetId: 'other-id' }], bothIds))
      .toBe('MageMagicalPowerTraitRequired')
  })

  it('is valid when no Powers Trait Set is tagged, regardless of Magick', () => {
    const poolEntries = [{ traitSetId: 'powers-id' }]
    expect(computeMagePoolInvalidReason('none', poolEntries, [])).toBeNull()
    expect(computeMagePoolInvalidReason('none', poolEntries, undefined)).toBeNull()
    expect(computeMagePoolInvalidReason('vulgar', [], [])).toBeNull()
    expect(computeMagePoolInvalidReason('vulgar', [], undefined)).toBeNull()
  })
})

describe('getMagickLabelKey', () => {
  it('resolves each Magick value to its lang key', () => {
    expect(getMagickLabelKey('coincidental')).toBe('MageMagickCoincidental')
    expect(getMagickLabelKey('coincidental-witnessed')).toBe('MageMagickCoincidentalWitnessed')
    expect(getMagickLabelKey('vulgar')).toBe('MageMagickVulgar')
    expect(getMagickLabelKey('vulgar-witnessed')).toBe('MageMagickVulgarWitnessed')
  })

  it('is null for None or an unrecognized value', () => {
    expect(getMagickLabelKey('none')).toBeNull()
    expect(getMagickLabelKey(undefined)).toBeNull()
    expect(getMagickLabelKey('')).toBeNull()
  })
})

describe('computeRealityReinforcementSync', () => {
  it('opposes: adds to the GM pool, removes from the roller pool', () => {
    expect(computeRealityReinforcementSync('opposes', true)).toEqual({ gm: 'add', roller: 'remove' })
  })

  it('reinforces: adds to the roller pool, removes from the GM pool', () => {
    expect(computeRealityReinforcementSync('reinforces', true)).toEqual({ gm: 'remove', roller: 'add' })
  })

  it('indifferent: removes from both pools', () => {
    expect(computeRealityReinforcementSync('indifferent', true)).toEqual({ gm: 'remove', roller: 'remove' })
  })

  it('removes from both pools whenever not applicable, regardless of the selected value', () => {
    expect(computeRealityReinforcementSync('opposes', false)).toEqual({ gm: 'remove', roller: 'remove' })
    expect(computeRealityReinforcementSync('reinforces', false)).toEqual({ gm: 'remove', roller: 'remove' })
  })

  // The default: branch. An unset or unrecognised value must clean up rather than leave a
  // stale Reality Reinforcement die sitting in either pool.
  it('removes from both pools for an unset or unrecognised value while applicable', () => {
    expect(computeRealityReinforcementSync(undefined, true)).toEqual({ gm: 'remove', roller: 'remove' })
    expect(computeRealityReinforcementSync('', true)).toEqual({ gm: 'remove', roller: 'remove' })
    expect(computeRealityReinforcementSync('nonsense', true)).toEqual({ gm: 'remove', roller: 'remove' })
  })
})

describe('computeGmRealityReinforcementDiceMap', () => {
  it('steps every die up one rung for Vulgar Witnessed + Opposes', () => {
    expect(computeGmRealityReinforcementDiceMap({ 0: '8' }, 'vulgar-witnessed', 'opposes')).toEqual({ 0: '10' })
    expect(computeGmRealityReinforcementDiceMap({ 0: '6', 1: '8' }, 'vulgar-witnessed', 'opposes'))
      .toEqual({ 0: '8', 1: '10' })
  })

  it('caps a stepped-up die at D12 rather than wrapping', () => {
    expect(computeGmRealityReinforcementDiceMap({ 0: '12' }, 'vulgar-witnessed', 'opposes')).toEqual({ 0: '12' })
  })

  it('leaves the map unchanged for any other Magick value', () => {
    expect(computeGmRealityReinforcementDiceMap({ 0: '8' }, 'vulgar', 'opposes')).toEqual({ 0: '8' })
    expect(computeGmRealityReinforcementDiceMap({ 0: '8' }, 'coincidental-witnessed', 'opposes')).toEqual({ 0: '8' })
    expect(computeGmRealityReinforcementDiceMap({ 0: '8' }, 'none', 'opposes')).toEqual({ 0: '8' })
  })

  it('leaves the map unchanged for any Reality Reinforcement value other than Opposes', () => {
    expect(computeGmRealityReinforcementDiceMap({ 0: '8' }, 'vulgar-witnessed', 'reinforces')).toEqual({ 0: '8' })
    expect(computeGmRealityReinforcementDiceMap({ 0: '8' }, 'vulgar-witnessed', 'indifferent')).toEqual({ 0: '8' })
  })

  it('passes through a null/undefined map unchanged', () => {
    expect(computeGmRealityReinforcementDiceMap(null, 'vulgar-witnessed', 'opposes')).toBeNull()
    expect(computeGmRealityReinforcementDiceMap(undefined, 'vulgar-witnessed', 'opposes')).toBeUndefined()
  })

  it('does not mutate the map it was given', () => {
    const diceMap = { 0: '8' }
    computeGmRealityReinforcementDiceMap(diceMap, 'vulgar-witnessed', 'opposes')
    expect(diceMap).toEqual({ 0: '8' })
  })
})

describe('resolvePoolSourceWrite', () => {
  const SOURCE = 'Reality Reinforcement'
  const diceValue = { 0: '8' }

  it('does nothing for a user with no dicePool flag at all, regardless of action', () => {
    // Must never CREATE the flag - a user who has never opened their tray has none (see
    // readDicePool in UserDicePool.js), and a bare { pool: {...} } write would not reproduce
    // blankPool's other fields (customAdd, spendPlotPointForExtraDie).
    expect(resolvePoolSourceWrite(null, SOURCE, 'add', diceValue)).toBeNull()
    expect(resolvePoolSourceWrite(undefined, SOURCE, 'remove', diceValue)).toBeNull()
  })

  it('does nothing for action "none"', () => {
    const currentDice = { pool: { [SOURCE]: { 0: { label: SOURCE, value: diceValue } } } }
    expect(resolvePoolSourceWrite(currentDice, SOURCE, 'none', diceValue)).toBeNull()
  })

  it('unsets the source when removing an entry that is present', () => {
    const currentDice = { pool: { [SOURCE]: { 0: { label: SOURCE, value: diceValue } } } }
    expect(resolvePoolSourceWrite(currentDice, SOURCE, 'remove', diceValue)).toEqual({ op: 'unset' })
  })

  it('does nothing when removing an entry that is already absent', () => {
    const currentDice = { pool: {} }
    expect(resolvePoolSourceWrite(currentDice, SOURCE, 'remove', diceValue)).toBeNull()
  })

  it('sets the source when adding and no entry exists yet', () => {
    const currentDice = { pool: {} }
    expect(resolvePoolSourceWrite(currentDice, SOURCE, 'add', diceValue)).toEqual({
      op: 'set',
      value: { 0: { label: SOURCE, value: diceValue } }
    })
  })

  it('sets the source with a DIFFERENT sourceKey used as the entry label', () => {
    const currentDice = { pool: {} }
    expect(resolvePoolSourceWrite(currentDice, 'Crisis Pool', 'add', diceValue)).toEqual({
      op: 'set',
      value: { 0: { label: 'Crisis Pool', value: diceValue } }
    })
  })

  it('replaces the source when adding a value that differs from what is already there', () => {
    const currentDice = { pool: { [SOURCE]: { 0: { label: SOURCE, value: { 0: '6' } } } } }
    expect(resolvePoolSourceWrite(currentDice, SOURCE, 'add', diceValue)).toEqual({
      op: 'set',
      value: { 0: { label: SOURCE, value: diceValue } }
    })
  })

  it('does nothing when adding a value that already matches what is there', () => {
    const currentDice = { pool: { [SOURCE]: { 0: { label: SOURCE, value: diceValue } } } }
    expect(resolvePoolSourceWrite(currentDice, SOURCE, 'add', diceValue)).toBeNull()
  })
})
