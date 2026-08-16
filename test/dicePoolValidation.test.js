import { describe, expect, it } from 'vitest'
import { flattenPoolEntries, validateDicePool } from '../module/scripts/dicePoolValidation.js'

const limitOneTraitSet = { id: 'ts-limit-one', label: 'Distinctions', settings: { limitOnePerDicePool: true } }
const plainTraitSet = { id: 'ts-plain', label: 'Skills', settings: {} }
const exclusiveA = { id: 'ts-a', label: 'Powers', settings: { mutuallyExclusiveWith: 'ts-b' } }
const exclusiveB = { id: 'ts-b', label: 'Mundane Gear', settings: {} }

const entry = (traitPath, traitSetId, label = traitPath) => ({ label, value: { 0: '8' }, traitPath, traitSetId })

describe('flattenPoolEntries', () => {
  it('flattens every source bucket into a single array', () => {
    const pool = {
      Bob: { 0: { label: 'A' }, 1: { label: 'B' } },
      custom: { 0: { label: 'C' } }
    }

    expect(flattenPoolEntries(pool)).toEqual([{ label: 'A' }, { label: 'B' }, { label: 'C' }])
  })

  it('treats an empty or missing pool as no entries', () => {
    expect(flattenPoolEntries({})).toEqual([])
    expect(flattenPoolEntries(undefined)).toEqual([])
  })
})

describe('validateDicePool', () => {
  it('is valid for an empty pool', () => {
    expect(validateDicePool([], [], false)).toBeNull()
  })

  it('is valid when only one trait from a Limit One Trait Set is present, PP unchecked', () => {
    const pool = [entry('path.1', limitOneTraitSet.id, 'Distinction 1')]
    expect(validateDicePool(pool, [limitOneTraitSet], false)).toBeNull()
  })

  it('is invalid when more than one trait from a Limit One Trait Set is present, PP unchecked, and names the Trait Set and Traits', () => {
    const pool = [
      entry('path.1', limitOneTraitSet.id, 'Distinction 1'),
      entry('path.2', limitOneTraitSet.id, 'Distinction 2')
    ]
    expect(validateDicePool(pool, [limitOneTraitSet], false)).toEqual({
      key: 'DicePoolInvalidLimitOne',
      data: { traitSet: 'Distinctions', traits: 'Distinction 1, Distinction 2' }
    })
  })

  it('is valid with exactly two traits from a Limit One Trait Set when PP is checked', () => {
    const pool = [entry('path.1', limitOneTraitSet.id, 'Distinction 1'), entry('path.2', limitOneTraitSet.id, 'Distinction 2')]
    expect(validateDicePool(pool, [limitOneTraitSet], true)).toBeNull()
  })

  it('is invalid with more than two traits from a Limit One Trait Set when PP is checked', () => {
    const pool = [
      entry('path.1', limitOneTraitSet.id, 'Distinction 1'),
      entry('path.2', limitOneTraitSet.id, 'Distinction 2'),
      entry('path.3', limitOneTraitSet.id, 'Distinction 3')
    ]
    expect(validateDicePool(pool, [limitOneTraitSet], true)).toEqual({
      key: 'DicePoolInvalidLimitOne',
      data: { traitSet: 'Distinctions', traits: 'Distinction 1, Distinction 2, Distinction 3' }
    })
  })

  it('does not limit a Trait Set that does not have Limit One set', () => {
    const pool = [entry('path.1', plainTraitSet.id), entry('path.2', plainTraitSet.id), entry('path.3', plainTraitSet.id)]
    expect(validateDicePool(pool, [plainTraitSet], false)).toBeNull()
  })

  it('is invalid when two mutually exclusive Trait Sets are both present, and names both Trait Sets and their Traits', () => {
    const pool = [
      entry('path.1', exclusiveA.id, 'Pyrokinesis'),
      entry('path.2', exclusiveB.id, 'Flamethrower')
    ]
    expect(validateDicePool(pool, [exclusiveA, exclusiveB], false)).toEqual({
      key: 'DicePoolInvalidMutuallyExclusive',
      data: { traitSetA: 'Powers', traitsA: 'Pyrokinesis', traitSetB: 'Mundane Gear', traitsB: 'Flamethrower' }
    })
  })

  it('is valid when only one side of a mutually exclusive pair is present', () => {
    const pool = [entry('path.1', exclusiveA.id)]
    expect(validateDicePool(pool, [exclusiveA, exclusiveB], false)).toBeNull()
  })

  it('is invalid when the same trait (same traitPath) is added more than once, and names the Trait', () => {
    const pool = [entry('path.1', plainTraitSet.id, 'Fighting'), entry('path.1', plainTraitSet.id, 'Fighting')]
    expect(validateDicePool(pool, [plainTraitSet], false)).toEqual({
      key: 'DicePoolInvalidDuplicateTrait',
      data: { trait: 'Fighting' }
    })
  })

  it('is valid when two entries share a label but have different traitPaths', () => {
    const pool = [
      { label: 'Same Name', value: { 0: '8' }, traitPath: 'path.1', traitSetId: null },
      { label: 'Same Name', value: { 0: '8' }, traitPath: 'path.2', traitSetId: null }
    ]
    expect(validateDicePool(pool, [], false)).toBeNull()
  })

  it('never flags entries with no traitSetId/traitPath (custom, Difficulty, Crisis Pool)', () => {
    const pool = [
      { label: 'Custom', value: { 0: '8' }, traitPath: null, traitSetId: null },
      { label: 'Custom', value: { 0: '8' }, traitPath: null, traitSetId: null }
    ]
    expect(validateDicePool(pool, [limitOneTraitSet, exclusiveA, exclusiveB], true)).toBeNull()
  })

  it('allows any number of custom dice, including duplicates, alongside an otherwise valid pool', () => {
    const customDice = Array.from({ length: 5 }, () => ({ label: 'Custom', value: { 0: '8' }, traitPath: null, traitSetId: null }))
    const pool = [entry('path.1', limitOneTraitSet.id), ...customDice]
    expect(validateDicePool(pool, [limitOneTraitSet], false)).toBeNull()
  })

  it('custom dice never mask an existing invalid pool', () => {
    const customDice = Array.from({ length: 5 }, () => ({ label: 'Custom', value: { 0: '8' }, traitPath: null, traitSetId: null }))
    const pool = [entry('path.1', limitOneTraitSet.id, 'Distinction 1'), entry('path.2', limitOneTraitSet.id, 'Distinction 2'), ...customDice]
    expect(validateDicePool(pool, [limitOneTraitSet], false)).toMatchObject({ key: 'DicePoolInvalidLimitOne' })
  })

  it('prioritizes the duplicate-trait rule when a pool violates more than one rule at once', () => {
    const pool = [entry('path.1', limitOneTraitSet.id, 'Distinction 1'), entry('path.1', limitOneTraitSet.id, 'Distinction 1')]
    expect(validateDicePool(pool, [limitOneTraitSet], false)).toMatchObject({ key: 'DicePoolInvalidDuplicateTrait' })
  })

  it('ignores a traitSetId that cannot be resolved against the known Trait Sets', () => {
    const pool = [entry('path.1', 'unknown-id'), entry('path.2', 'unknown-id')]
    expect(validateDicePool(pool, [limitOneTraitSet], false)).toBeNull()
  })

  // Spending a Plot Point buys an extra die, which raises the Limit One allowance from 1 to 2.
  // It does not buy an exemption from the other two rules — those are about which traits may
  // legally combine, not how many dice you get.
  describe('spending a Plot Point for an extra die', () => {
    it('raises the Limit One allowance to two, but no further', () => {
      const two = [
        entry('path.1', limitOneTraitSet.id, 'Distinction 1'),
        entry('path.2', limitOneTraitSet.id, 'Distinction 2')
      ]
      expect(validateDicePool(two, [limitOneTraitSet], true)).toBeNull()

      const three = [...two, entry('path.3', limitOneTraitSet.id, 'Distinction 3')]
      expect(validateDicePool(three, [limitOneTraitSet], true))
        .toMatchObject({ key: 'DicePoolInvalidLimitOne' })
    })

    it('does not excuse the same trait being added twice', () => {
      const pool = [
        entry('path.1', plainTraitSet.id, 'Athletics'),
        entry('path.1', plainTraitSet.id, 'Athletics')
      ]

      expect(validateDicePool(pool, [plainTraitSet], true))
        .toMatchObject({ key: 'DicePoolInvalidDuplicateTrait', data: { trait: 'Athletics' } })
    })

    it('does not excuse two mutually exclusive Trait Sets', () => {
      const pool = [entry('path.1', exclusiveA.id, 'Sphere'), entry('path.2', exclusiveB.id, 'Crowbar')]

      expect(validateDicePool(pool, [exclusiveA, exclusiveB], true))
        .toMatchObject({ key: 'DicePoolInvalidMutuallyExclusive' })
    })
  })
})
