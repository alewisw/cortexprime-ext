import { describe, expect, it } from 'vitest'
import { applyTraitToPool, canAddDicePointToPool, canHinderDicePointToPool, getHinderRewards } from '../module/scripts/dicePoolTraitLogic.js'

const place = (pool, overrides) => applyTraitToPool(pool, {
  source: 'Distinctions',
  traitPath: 'system.actorType.traitSets.0.traits.0.dice',
  label: 'Distinction 1',
  value: { 0: '8' },
  traitSetId: '_11',
  hindered: false,
  ...overrides
})

describe('applyTraitToPool', () => {
  it('appends into an empty pool', () => {
    const result = place({})

    expect(result).toEqual({
      Distinctions: {
        0: { label: 'Distinction 1', value: { 0: '8' }, traitPath: 'system.actorType.traitSets.0.traits.0.dice', traitSetId: '_11', hindered: false }
      }
    })
  })

  it('replaces the sole instance in place when its value is wrong, adding nothing', () => {
    const pool = { Distinctions: { 0: place({}).Distinctions[0] } }
    pool.Distinctions[0] = { ...pool.Distinctions[0], value: { 0: '4' }, hindered: true }

    const result = place(pool, { value: { 0: '8' }, hindered: false })

    expect(Object.keys(result.Distinctions)).toEqual(['0'])
    expect(result.Distinctions[0]).toEqual({
      label: 'Distinction 1', value: { 0: '8' }, traitPath: 'system.actorType.traitSets.0.traits.0.dice', traitSetId: '_11', hindered: false
    })
  })

  it('adds a second entry when the sole instance already holds the requested value', () => {
    let pool = place({})
    pool = place(pool)

    expect(Object.keys(pool.Distinctions)).toEqual(['0', '1'])
    expect(pool.Distinctions[0].value).toEqual({ 0: '8' })
    expect(pool.Distinctions[1].value).toEqual({ 0: '8' })
  })

  it('with two instances and one wrong, corrects the wrong one AND still adds a new entry', () => {
    // Seeded directly rather than via two place() calls: place() itself collapses a lone wrong
    // instance by replacing it in place, so building up to "two instances present" has to bypass
    // that rule the way, e.g., a stray manual pool edit or an older save file might.
    const traitPath = 'system.actorType.traitSets.0.traits.0.dice'
    const pool = {
      Distinctions: {
        0: { label: 'Distinction 1', value: { 0: '8' }, traitPath, traitSetId: '_11', hindered: false },
        1: { label: 'Distinction 1', value: { 0: '4' }, traitPath, traitSetId: '_11', hindered: true }
      }
    }

    const result = place(pool, { value: { 0: '8' }, hindered: false })

    expect(Object.keys(result.Distinctions)).toEqual(['0', '1', '2'])
    expect(result.Distinctions[0].value).toEqual({ 0: '8' }) // was already right, untouched
    expect(result.Distinctions[1]).toEqual(expect.objectContaining({ value: { 0: '8' }, hindered: false })) // corrected
    expect(result.Distinctions[2]).toEqual(expect.objectContaining({ value: { 0: '8' }, hindered: false })) // the new one
  })

  it('finds and corrects an instance parked under a DIFFERENT source', () => {
    const pool = {
      Difficulty: {
        0: { label: 'Distinction 1', value: { 0: '4' }, traitPath: 'system.actorType.traitSets.0.traits.0.dice', traitSetId: '_11', hindered: true }
      }
    }

    const result = place(pool, { value: { 0: '8' }, hindered: false })

    expect(Object.keys(result.Difficulty)).toEqual(['0'])
    expect(result.Difficulty[0].value).toEqual({ 0: '8' })
    expect(result.Distinctions).toBeUndefined()
  })

  it('leaves an unrelated trait\'s entries untouched', () => {
    const pool = {
      Distinctions: {
        0: { label: 'Distinction 2', value: { 0: '6' }, traitPath: 'system.actorType.traitSets.0.traits.1.dice', traitSetId: '_11', hindered: false }
      }
    }

    const result = place(pool)

    expect(result.Distinctions[0]).toEqual(pool.Distinctions[0])
    expect(result.Distinctions[1]).toEqual(expect.objectContaining({ value: { 0: '8' } }))
  })

  it('treats a hindered d4 and an equal-sized real value as the SAME faces (not wrong)', () => {
    // A trait whose real die actually IS a d4: hindering it is a no-op on the dice themselves.
    let pool = place({}, { value: { 0: '4' }, hindered: false })
    pool = place(pool, { value: { 0: '4' }, hindered: true })

    // Same faces -> not "wrong" -> falls to the "add a second entry" branch, not a replace.
    expect(Object.keys(pool.Distinctions)).toEqual(['0', '1'])
  })

  it('appends without matching when there is no traitPath to match on', () => {
    const pool = place({}, { traitPath: null })
    const result = place(pool, { traitPath: null, value: { 0: '10' } })

    expect(Object.keys(result.Distinctions)).toEqual(['0', '1'])
  })

  it('does not mutate its input', () => {
    const pool = place({})
    const snapshot = JSON.parse(JSON.stringify(pool))

    place(pool, { value: { 0: '4' }, hindered: true })

    expect(pool).toEqual(snapshot)
  })
})

describe('getHinderRewards', () => {
  const pool = [
    { label: 'Distinction 1', hindered: true },
    { label: 'Distinction 2', hindered: false },
    { label: 'Distinction 3', hindered: true }
  ]

  it('returns only the hindered entries, one per entry, during a Test/Contest/Group', () => {
    expect(getHinderRewards(pool, 'test')).toEqual([pool[0], pool[2]])
    expect(getHinderRewards(pool, 'contest')).toEqual([pool[0], pool[2]])
    expect(getHinderRewards(pool, 'group')).toEqual([pool[0], pool[2]])
  })

  it('earns nothing outside a Test/Contest/Group, however hindered the pool is', () => {
    expect(getHinderRewards(pool, null)).toEqual([])
    expect(getHinderRewards(pool, undefined)).toEqual([])
    expect(getHinderRewards(pool, 'initiative')).toEqual([])
  })

  it('is empty for a pool with nothing hindered', () => {
    expect(getHinderRewards([{ label: 'Distinction 2', hindered: false }], 'test')).toEqual([])
    expect(getHinderRewards([], 'test')).toEqual([])
    expect(getHinderRewards(undefined, 'test')).toEqual([])
  })
})

// The Actor Type fixture below mirrors what actor.system.actorType actually looks like: a Trait
// Set with a main Trait (that has a Sub-Trait), a Simple Trait of each valueType, an Asset and a
// Complication — every shape canAddDicePointToPool/canHinderDicePointToPool has to resolve a
// data-path against.
const actorType = () => ({
  traitSets: {
    0: {
      settings: { hasDice: true, subTraitsHaveDice: true },
      shutdown: false,
      traits: {
        0: {
          id: '_t1',
          enableHinder: true,
          shutdown: false,
          dice: { value: { 0: '8' } },
          subTraits: {
            0: { label: 'Sub', dice: { value: { 0: '6' } } }
          }
        }
      },
      customTraits: {
        0: { id: '_c1', shutdown: false, dice: { value: { 0: '10' } } }
      }
    }
  },
  simpleTraits: {
    0: { settings: { valueType: 'dice' }, dice: { value: { 0: '8' } } },
    // A text Simple Trait still gets a `dice` object with a default value from
    // ActorSettings.#onAddSimpleTrait (see settings.js) - valueType is what actually decides
    // whether it may be added, not whether `dice` happens to be populated.
    1: { settings: { valueType: 'text' }, dice: { value: { 0: '8' } } }
  },
  assets: {
    0: { label: 'Sword', dice: { value: { 0: '6' } } },
    1: { label: 'Empty Asset', dice: { value: {} } }
  },
  complications: {
    0: { label: 'Hunted', dice: { value: { 0: '6' } } }
  }
})

describe('canAddDicePointToPool', () => {
  it('allows a normal main Trait', () => {
    expect(canAddDicePointToPool(actorType(), 'system.actorType.traitSets.0.traits.0.dice')).toBe(true)
  })

  it('allows a normal custom Trait', () => {
    expect(canAddDicePointToPool(actorType(), 'system.actorType.traitSets.0.customTraits.0.dice')).toBe(true)
  })

  it('refuses a Trait with no dice object at all', () => {
    // The exact shape mergeActorTypeData leaves a freshly-configured Trait in (see
    // actorTypeChangeLogic.test.js) - `system.actorType` snapshot never got a `dice` key for it.
    // canAddDicePointToPool must say no rather than the caller reading .value off undefined.
    const type = actorType()
    delete type.traitSets[0].traits[0].dice

    expect(canAddDicePointToPool(type, 'system.actorType.traitSets.0.traits.0.dice')).toBe(false)
  })

  it('refuses a Trait whose dice value is empty', () => {
    const type = actorType()
    type.traitSets[0].traits[0].dice = { value: {} }

    expect(canAddDicePointToPool(type, 'system.actorType.traitSets.0.traits.0.dice')).toBe(false)
  })

  it('refuses a Trait on a shut-down Trait Set', () => {
    const type = actorType()
    type.traitSets[0].shutdown = true

    expect(canAddDicePointToPool(type, 'system.actorType.traitSets.0.traits.0.dice')).toBe(false)
  })

  it('refuses a shut-down Trait', () => {
    const type = actorType()
    type.traitSets[0].traits[0].shutdown = true

    expect(canAddDicePointToPool(type, 'system.actorType.traitSets.0.traits.0.dice')).toBe(false)
  })

  it('refuses a Trait when the Trait Set has dice turned off', () => {
    const type = actorType()
    type.traitSets[0].settings.hasDice = false

    expect(canAddDicePointToPool(type, 'system.actorType.traitSets.0.traits.0.dice')).toBe(false)
  })

  it('allows a normal Sub-Trait', () => {
    expect(canAddDicePointToPool(actorType(), 'system.actorType.traitSets.0.traits.0.subTraits.0.dice')).toBe(true)
  })

  it('refuses a Sub-Trait whose PARENT Trait is shut down, even though the Sub-Trait itself has dice', () => {
    const type = actorType()
    type.traitSets[0].traits[0].shutdown = true

    expect(canAddDicePointToPool(type, 'system.actorType.traitSets.0.traits.0.subTraits.0.dice')).toBe(false)
  })

  it('refuses a Sub-Trait when the Trait Set has Sub-Trait dice turned off', () => {
    const type = actorType()
    type.traitSets[0].settings.subTraitsHaveDice = false

    expect(canAddDicePointToPool(type, 'system.actorType.traitSets.0.traits.0.subTraits.0.dice')).toBe(false)
  })

  it('allows a dice-type Simple Trait with a value', () => {
    expect(canAddDicePointToPool(actorType(), 'system.actorType.simpleTraits.0.dice')).toBe(true)
  })

  it('refuses a text-type Simple Trait even though it carries a default dice value', () => {
    expect(canAddDicePointToPool(actorType(), 'system.actorType.simpleTraits.1.dice')).toBe(false)
  })

  it('allows an Asset with a value, refuses one with an empty value', () => {
    expect(canAddDicePointToPool(actorType(), 'system.actorType.assets.0.dice')).toBe(true)
    expect(canAddDicePointToPool(actorType(), 'system.actorType.assets.1.dice')).toBe(false)
  })

  it('allows a Complication with a value', () => {
    expect(canAddDicePointToPool(actorType(), 'system.actorType.complications.0.dice')).toBe(true)
  })

  it('refuses an unrecognised path shape without throwing', () => {
    expect(canAddDicePointToPool(actorType(), 'system.actorType.traitSets.0.dice')).toBe(false)
    expect(canAddDicePointToPool(actorType(), 'garbage')).toBe(false)
  })

  it('refuses everything when actorType itself is missing, without throwing', () => {
    expect(canAddDicePointToPool(undefined, 'system.actorType.traitSets.0.traits.0.dice')).toBe(false)
    expect(canAddDicePointToPool(null, 'system.actorType.simpleTraits.0.dice')).toBe(false)
  })
})

describe('canHinderDicePointToPool', () => {
  it('allows a main Trait with Hinder enabled', () => {
    expect(canHinderDicePointToPool(actorType(), 'system.actorType.traitSets.0.traits.0.dice')).toBe(true)
  })

  it('refuses a Trait with Hinder not enabled', () => {
    const type = actorType()
    type.traitSets[0].traits[0].enableHinder = false

    expect(canHinderDicePointToPool(type, 'system.actorType.traitSets.0.traits.0.dice')).toBe(false)
  })

  it('refuses a Hinder-enabled Trait that is otherwise not addable (shut down)', () => {
    const type = actorType()
    type.traitSets[0].traits[0].shutdown = true

    expect(canHinderDicePointToPool(type, 'system.actorType.traitSets.0.traits.0.dice')).toBe(false)
  })

  it('never offers Hinder on a Sub-Trait, a Simple Trait, an Asset or a Complication', () => {
    const type = actorType()

    expect(canHinderDicePointToPool(type, 'system.actorType.traitSets.0.traits.0.subTraits.0.dice')).toBe(false)
    expect(canHinderDicePointToPool(type, 'system.actorType.simpleTraits.0.dice')).toBe(false)
    expect(canHinderDicePointToPool(type, 'system.actorType.assets.0.dice')).toBe(false)
    expect(canHinderDicePointToPool(type, 'system.actorType.complications.0.dice')).toBe(false)
  })
})
