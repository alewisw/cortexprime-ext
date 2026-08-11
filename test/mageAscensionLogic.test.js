import { describe, expect, it } from 'vitest'
import {
  computeMagePoolInvalidReason,
  computeRealityReinforcementSync,
  getCurrentRollerIds,
  isMageRuleSetActive,
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
  it('is invalid when Magick is none and a Powers-trait entry is present', () => {
    const poolEntries = [{ traitSetId: 'powers-id' }]
    expect(computeMagePoolInvalidReason('none', poolEntries, 'powers-id')).toBe('MageNonMagicalPowerTraitInvalid')
  })

  it('is valid when Magick is none but no Powers-trait entry is present', () => {
    const poolEntries = [{ traitSetId: 'other-id' }]
    expect(computeMagePoolInvalidReason('none', poolEntries, 'powers-id')).toBeNull()
  })

  it('is valid whenever Magick is not none, even with a Powers-trait entry', () => {
    const poolEntries = [{ traitSetId: 'powers-id' }]
    expect(computeMagePoolInvalidReason('vulgar', poolEntries, 'powers-id')).toBeNull()
    expect(computeMagePoolInvalidReason('coincidental-witnessed', poolEntries, 'powers-id')).toBeNull()
  })

  it('is valid when no Powers Trait Set is configured', () => {
    const poolEntries = [{ traitSetId: 'powers-id' }]
    expect(computeMagePoolInvalidReason('none', poolEntries, '')).toBeNull()
    expect(computeMagePoolInvalidReason('none', poolEntries, undefined)).toBeNull()
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
})
