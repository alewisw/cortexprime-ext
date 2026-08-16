import { describe, expect, it } from 'vitest'
import { chooseCrisisDieIndex, computeCrisisReduction, reduceCrisisDice } from '../module/scripts/crisisPool.js'

describe('chooseCrisisDieIndex', () => {
  it('eliminates the largest D12/D10/D8/D6 the effect die can beat outright', () => {
    // effect die is a D10 (10); both the D8 and D6 are eligible (10>8, 10>6) — largest wins
    expect(chooseCrisisDieIndex([12, 8, 6], 10)).toBe(1)
  })

  it('cannot eliminate a die that is the same size or larger than the effect die', () => {
    // effect die is a D10 (10); it cannot beat the D12 (10 is not > 12)
    expect(chooseCrisisDieIndex([12], 10)).toBe(0)
  })

  it('falls back to the highest-faced die present when nothing can be eliminated', () => {
    expect(chooseCrisisDieIndex([12, 8, 6], 4)).toBe(0)
  })

  it('a D4 in the pool is never an elimination target, only ever a step-down/fallback candidate', () => {
    expect(chooseCrisisDieIndex([4], 12)).toBe(0)
  })

  // Precondition, pinned: the fallback reduce seeds from index 0, so an empty pool yields 0 —
  // an index that doesn't exist. Harmless today because computeCrisisReduction stops as soon
  // as the pool empties and never calls in with []. Anyone calling this directly must check
  // for an empty pool first.
  it('assumes a non-empty pool — an empty one yields the out-of-range index 0', () => {
    expect(chooseCrisisDieIndex([], 8)).toBe(0)
  })
})

describe('reduceCrisisDice', () => {
  it('removes the die outright when the effect die beats it', () => {
    expect(reduceCrisisDice([12, 8, 6], [10])).toEqual([12, 6])
  })

  it('steps the chosen die down one rung when the effect die does not beat it', () => {
    // effect die (4) can't eliminate anything, so the highest die (12) steps down to 10
    expect(reduceCrisisDice([12, 8], [4])).toEqual([10, 8])
  })

  it('steps a D6 down to a D4 rather than removing it', () => {
    expect(reduceCrisisDice([6], [4])).toEqual([4])
  })

  it('removes a D4 entirely once it would step below D4', () => {
    expect(reduceCrisisDice([4], [4])).toEqual([])
  })

  it('treats a missing/empty effect die as a D4 for comparison purposes', () => {
    expect(reduceCrisisDice([12], [])).toEqual([10])
    expect(reduceCrisisDice([12], undefined)).toEqual([10])
  })

  it('returns an empty pool unchanged', () => {
    expect(reduceCrisisDice([], [12])).toEqual([])
  })

  it('an effect die equal to the chosen die steps it down rather than eliminating it', () => {
    // "same or smaller" steps down — elimination requires strictly greater
    expect(reduceCrisisDice([8], [8])).toEqual([6])
  })
})

describe('computeCrisisReduction', () => {
  it('reports a removed event with the eliminated die\'s face', () => {
    const { dice, events } = computeCrisisReduction([12, 8, 6], [10])

    expect(dice).toEqual([12, 6])
    expect(events).toEqual([{ type: 'removed', face: 8 }])
  })

  it('reports a steppedDown event with the from/to faces', () => {
    const { dice, events } = computeCrisisReduction([12, 8], [4])

    expect(dice).toEqual([10, 8])
    expect(events).toEqual([{ type: 'steppedDown', from: 12, to: 10 }])
  })

  it('reports a removed event when a D4 is stepped below D4', () => {
    const { dice, events } = computeCrisisReduction([4], [4])

    expect(dice).toEqual([])
    expect(events).toEqual([{ type: 'removed', face: 4 }])
  })

  it('reports a steppedDown event for D6 stepping down to D4', () => {
    const { dice, events } = computeCrisisReduction([6], [4])

    expect(dice).toEqual([4])
    expect(events).toEqual([{ type: 'steppedDown', from: 6, to: 4 }])
  })

  it('reports no events for an already-empty pool', () => {
    const { dice, events } = computeCrisisReduction([], [12])

    expect(dice).toEqual([])
    expect(events).toEqual([])
  })

  it('with two effect dice, applies each individually (largest first), eliminating two dice', () => {
    const { dice, events } = computeCrisisReduction([12, 10, 8, 6], [12, 10])

    expect(dice).toEqual([12, 6])
    expect(events).toEqual([
      { type: 'removed', face: 10 },
      { type: 'removed', face: 8 }
    ])
  })

  it('with two effect dice, one eliminates and the other steps a die down', () => {
    const { dice, events } = computeCrisisReduction([12, 8], [10, 4])

    expect(dice).toEqual([10])
    expect(events).toEqual([
      { type: 'removed', face: 8 },
      { type: 'steppedDown', from: 12, to: 10 }
    ])
  })

  it('with two effect dice, both step dice down in sequence', () => {
    const { dice, events } = computeCrisisReduction([8, 6], [6, 4])

    expect(dice).toEqual([4, 6])
    expect(events).toEqual([
      { type: 'steppedDown', from: 8, to: 6 },
      { type: 'steppedDown', from: 6, to: 4 }
    ])
  })

  it('stops applying further effect dice once the pool has been emptied', () => {
    const { dice, events } = computeCrisisReduction([4], [12, 4])

    expect(dice).toEqual([])
    expect(events).toEqual([{ type: 'removed', face: 4 }])
  })
})
