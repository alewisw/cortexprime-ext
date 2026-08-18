import { describe, expect, it } from 'vitest'
import { applyTraitToPool, getHinderRewards } from '../module/scripts/dicePoolTraitLogic.js'

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
