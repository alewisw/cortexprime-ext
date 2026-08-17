import { describe, expect, it } from 'vitest'
import {
  buildSystemTraitOptions,
  findSystemSimpleTraitIndex,
  getSystemTraitDefs,
  getSystemTraitSetIds,
  resolveSystemSimpleTraitIndex
} from '../module/settings/systemTraitsLogic.js'

const keysOf = options => options.map(option => option.key)

const simpleTrait = (id, label, systemTrait) => ({
  id,
  label,
  settings: { valueType: 'dice', ...(systemTrait === undefined ? {} : { systemTrait }) }
})

const traitSet = (id, label, systemTraitSet) => ({
  id,
  label,
  settings: { hasDice: true, ...(systemTraitSet === undefined ? {} : { systemTraitSet }) }
})

const mageActorType = () => ({
  id: '_pc',
  name: 'Player',
  traitSets: {
    0: traitSet('_ts-skills', 'Skills'),
    1: traitSet('_ts-powers', 'Powers', 'powers')
  },
  simpleTraits: {
    0: simpleTrait('_st-paradox', 'Paradox', 'paradox'),
    1: simpleTrait('_st-trauma', 'Trauma', 'trauma'),
    2: simpleTrait('_st-plain', 'Concept')
  }
})

describe('getSystemTraitDefs', () => {
  it('returns the Mage rule set definitions', () => {
    expect(keysOf(getSystemTraitDefs('mage', 'traitSets'))).toEqual(['powers'])
    expect(keysOf(getSystemTraitDefs('mage', 'simpleTraits')))
      .toEqual(['realityReinforcement', 'shielding', 'paradox', 'trauma'])
  })

  it('gives every definition a lang key to label it with', () => {
    for (const def of getSystemTraitDefs('mage', 'simpleTraits')) {
      expect(typeof def.label).toBe('string')
      expect(def.label.length).toBeGreaterThan(0)
    }
  })

  it('is empty for no rule set, an unknown rule set, or an unknown kind', () => {
    expect(getSystemTraitDefs('none', 'simpleTraits')).toEqual([])
    expect(getSystemTraitDefs(undefined, 'simpleTraits')).toEqual([])
    expect(getSystemTraitDefs('vampire', 'traitSets')).toEqual([])
    expect(getSystemTraitDefs('mage', 'somethingElse')).toEqual([])
  })
})

describe('buildSystemTraitOptions', () => {
  it('marks the claimed option selected on the entry holding it', () => {
    const result = buildSystemTraitOptions(mageActorType(), 'mage')

    const paradoxOption = result.simpleTraits[0].systemTraitOptions.find(option => option.key === 'paradox')
    expect(paradoxOption.selected).toBe(true)

    expect(result.simpleTraits[0].systemTraitOptions.filter(option => option.selected)).toHaveLength(1)
    expect(result.traitSets[1].systemTraitSetOptions.find(option => option.key === 'powers').selected).toBe(true)
  })

  // This is what makes two Simple Traits on one Actor Type both claiming Paradox unrepresentable.
  it('hides an option claimed by a sibling, while keeping it on its own entry', () => {
    const result = buildSystemTraitOptions(mageActorType(), 'mage')

    expect(keysOf(result.simpleTraits[0].systemTraitOptions))
      .toEqual(['realityReinforcement', 'shielding', 'paradox'])
    expect(keysOf(result.simpleTraits[1].systemTraitOptions))
      .toEqual(['realityReinforcement', 'shielding', 'trauma'])
    expect(keysOf(result.simpleTraits[2].systemTraitOptions))
      .toEqual(['realityReinforcement', 'shielding'])
  })

  it('offers every option to every entry when nothing is claimed yet', () => {
    const untagged = {
      id: '_npc',
      simpleTraits: { 0: simpleTrait('_a', 'A'), 1: simpleTrait('_b', 'B') },
      traitSets: { 0: traitSet('_c', 'C') }
    }

    const result = buildSystemTraitOptions(untagged, 'mage')

    expect(keysOf(result.simpleTraits[0].systemTraitOptions))
      .toEqual(['realityReinforcement', 'shielding', 'paradox', 'trauma'])
    expect(keysOf(result.simpleTraits[1].systemTraitOptions))
      .toEqual(['realityReinforcement', 'shielding', 'paradox', 'trauma'])
    expect(keysOf(result.traitSets[0].systemTraitSetOptions)).toEqual(['powers'])
    expect(result.simpleTraits[0].systemTraitOptions.every(option => !option.selected)).toBe(true)
  })

  it('treats an empty-string tag as unclaimed', () => {
    const result = buildSystemTraitOptions({
      simpleTraits: { 0: simpleTrait('_a', 'A', ''), 1: simpleTrait('_b', 'B', '') }
    }, 'mage')

    expect(keysOf(result.simpleTraits[0].systemTraitOptions)).toHaveLength(4)
    expect(result.simpleTraits[0].systemTraitOptions.every(option => !option.selected)).toBe(true)
  })

  // No options key at all is what the settings template's {{#if}} keys off to hide the dropdown.
  it('adds no options when the rule set declares none', () => {
    const result = buildSystemTraitOptions(mageActorType(), 'none')

    expect(result.simpleTraits[0].systemTraitOptions).toBeUndefined()
    expect(result.traitSets[0].systemTraitSetOptions).toBeUndefined()
    expect(result).toEqual(mageActorType())
  })

  it('preserves every other field on the actor type and its entries', () => {
    const result = buildSystemTraitOptions(mageActorType(), 'mage')

    expect(result.name).toBe('Player')
    expect(result.simpleTraits[0].id).toBe('_st-paradox')
    expect(result.simpleTraits[0].settings).toEqual({ valueType: 'dice', systemTrait: 'paradox' })
  })

  it('handles an actor type with no trait sets or simple traits', () => {
    const result = buildSystemTraitOptions({ id: '_bare', name: 'Bare' }, 'mage')

    expect(result.traitSets).toEqual({})
    expect(result.simpleTraits).toEqual({})
  })
})

describe('findSystemSimpleTraitIndex', () => {
  it('returns the collection key, usable to build a write path', () => {
    const { simpleTraits } = mageActorType()

    expect(findSystemSimpleTraitIndex(simpleTraits, 'paradox')).toBe('0')
    expect(findSystemSimpleTraitIndex(simpleTraits, 'trauma')).toBe('1')
  })

  it('is null when nothing claims the key', () => {
    const { simpleTraits } = mageActorType()

    expect(findSystemSimpleTraitIndex(simpleTraits, 'shielding')).toBeNull()
  })

  it('is null for a missing collection or a missing key', () => {
    expect(findSystemSimpleTraitIndex(undefined, 'paradox')).toBeNull()
    expect(findSystemSimpleTraitIndex({}, 'paradox')).toBeNull()
    expect(findSystemSimpleTraitIndex(mageActorType().simpleTraits, '')).toBeNull()
    expect(findSystemSimpleTraitIndex(mageActorType().simpleTraits, undefined)).toBeNull()
  })
})

describe('resolveSystemSimpleTraitIndex', () => {
  const configured = () => mageActorType()

  // The case that matters: an actor's system.actorType is a snapshot taken when its type was
  // assigned, so a tag added later is absent from it. Resolving via the configured Actor Type and
  // matching on the trait's stable id is what makes tagging reach existing actors with no resync.
  it('finds the trait on an actor whose snapshot predates the tag', () => {
    const untaggedSnapshot = {
      0: { id: '_st-paradox', label: 'Paradox', settings: { valueType: 'dice' } },
      1: { id: '_st-trauma', label: 'Trauma', settings: { valueType: 'dice' } }
    }

    expect(resolveSystemSimpleTraitIndex(configured(), untaggedSnapshot, 'paradox')).toBe('0')
    expect(resolveSystemSimpleTraitIndex(configured(), untaggedSnapshot, 'trauma')).toBe('1')
  })

  it('finds it by id even when the actor reordered its traits', () => {
    const reordered = {
      0: { id: '_st-trauma', label: 'Trauma', settings: {} },
      1: { id: '_st-paradox', label: 'Paradox', settings: {} }
    }

    expect(resolveSystemSimpleTraitIndex(configured(), reordered, 'paradox')).toBe('1')
  })

  it('uses the actor snapshot tag when the Actor Type is gone from settings', () => {
    const taggedSnapshot = mageActorType().simpleTraits

    expect(resolveSystemSimpleTraitIndex(undefined, taggedSnapshot, 'paradox')).toBe('0')
    expect(resolveSystemSimpleTraitIndex(null, taggedSnapshot, 'trauma')).toBe('1')
  })

  it('falls back to the actor snapshot tag when the configured trait id is missing on the actor', () => {
    const otherTraits = {
      0: { id: '_unrelated', label: 'Concept', settings: {} },
      1: { id: '_different-id', label: 'Paradox', settings: { systemTrait: 'paradox' } }
    }

    expect(resolveSystemSimpleTraitIndex(configured(), otherTraits, 'paradox')).toBe('1')
  })

  it('is null when nothing claims the key on either side', () => {
    expect(resolveSystemSimpleTraitIndex(configured(), mageActorType().simpleTraits, 'shielding')).toBeNull()
    expect(resolveSystemSimpleTraitIndex(undefined, undefined, 'paradox')).toBeNull()
    expect(resolveSystemSimpleTraitIndex(configured(), {}, 'paradox')).toBeNull()
  })
})

describe('getSystemTraitSetIds', () => {
  // Several Actor Types may each tag their own Powers set — all of them count.
  it('collects every matching id across the flattened trait sets', () => {
    const allTraitSets = [
      traitSet('_ts-skills', 'Skills'),
      traitSet('_ts-powers-pc', 'Powers', 'powers'),
      traitSet('_ts-powers-npc', 'Powers', 'powers')
    ]

    expect(getSystemTraitSetIds(allTraitSets, 'powers')).toEqual(['_ts-powers-pc', '_ts-powers-npc'])
  })

  // A derived Actor Type inherits its parent's Trait Set id verbatim, so the same id shows up once
  // per Actor Type in the flattened list.
  it('deduplicates an id shared by a derived Actor Type', () => {
    const allTraitSets = [traitSet('_ts-powers', 'Powers', 'powers'), traitSet('_ts-powers', 'Powers', 'powers')]

    expect(getSystemTraitSetIds(allTraitSets, 'powers')).toEqual(['_ts-powers'])
  })

  it('is empty when nothing is tagged, or for a missing key or collection', () => {
    expect(getSystemTraitSetIds([traitSet('_a', 'A')], 'powers')).toEqual([])
    expect(getSystemTraitSetIds([traitSet('_a', 'A', 'powers')], '')).toEqual([])
    expect(getSystemTraitSetIds(undefined, 'powers')).toEqual([])
  })

  it('skips a tagged trait set with no id', () => {
    expect(getSystemTraitSetIds([{ label: 'Powers', settings: { systemTraitSet: 'powers' } }], 'powers'))
      .toEqual([])
  })
})
