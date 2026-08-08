import { describe, expect, it } from 'vitest'
import { getDiceByTargetTotal, resolveChallengeAfterRoll } from '../module/scripts/rollToBeat.js'

const die = (faces, result) => ({ faces, result })

describe('getDiceByTargetTotal', () => {
  it('picks the highest-faced die as effect, and totals the two largest remaining values', () => {
    const results = [die(4, 2), die(6, 3), die(8, 4), die(12, 6)]

    const { total, effectDice, won } = getDiceByTargetTotal(results, 5)

    // effect = d12; remaining values are 2,3,4 -> top two (4,3) = 7
    expect(total).toBe(7)
    expect(won).toBe(true)
    expect(effectDice).toEqual([12])
  })

  it('breaks ties between same-faced effect-die candidates by preferring the higher resulting total', () => {
    const results = [die(12, 3), die(12, 6), die(6, 4), die(8, 5)]

    const { total, effectDice, won } = getDiceByTargetTotal(results, 8)

    // Using the d12(3) as effect leaves d12(6)+d8(5)=11 for total, beating the d12(6)-as-effect
    // alternative (which would only leave d12(3)+d8(5)=8)
    expect(total).toBe(11)
    expect(won).toBe(true)
    expect(effectDice).toEqual([12])
  })

  it('still selects by effect-die size even when the result loses — win/loss never influences selection', () => {
    const results = [die(4, 2), die(6, 3), die(8, 4), die(12, 3)]

    const { total, effectDice, won } = getDiceByTargetTotal(results, 100)

    expect(total).toBe(7)
    expect(won).toBe(false)
    expect(effectDice).toEqual([12])
  })

  it('with exactly 3 dice and a winnable total, still prioritizes the highest effect die', () => {
    const results = [die(4, 4), die(6, 2), die(12, 3)]

    const { total, effectDice, won } = getDiceByTargetTotal(results, 3)

    // effect=d12 leaves d4(4)+d6(2)=6 for total, which already beats the target of 3
    expect(total).toBe(6)
    expect(won).toBe(true)
    expect(effectDice).toEqual([12])
  })

  it('with exactly 3 dice and no way to win, prioritizes the highest total instead, ties broken by effect die', () => {
    const results = [die(4, 4), die(6, 2), die(12, 3)]

    const { total, effectDice, won } = getDiceByTargetTotal(results, 100)

    // None of the 3 possible splits (total 5, 7, or 6) can beat 100, so instead of the
    // normal d12-as-effect pick (total 6), the highest achievable total (7, using d6 as
    // effect) is chosen
    expect(total).toBe(7)
    expect(won).toBe(false)
    expect(effectDice).toEqual([6])
  })

  it('ignores 1s for effect die', () => {
    const results = [die(8, 5), die(6, 4), die(10, 1)]

    const { total, effectDice, won } = getDiceByTargetTotal(results, 8)

    expect(total).toBe(9)
    expect(won).toBe(true)
    expect(effectDice).toEqual([])
  })

  it('ignores 1s for total', () => {
    const results = [die(8, 5), die(6, 1), die(10, 1)]

    const { total, effectDice, won } = getDiceByTargetTotal(results, 5)

    expect(total).toBe(5)
    expect(won).toBe(false)
    expect(effectDice).toEqual([])
  })

  it('requires strictly greater than the target — an exact match is not a win', () => {
    const results = [die(8, 6), die(6, 4)]

    const { total, won } = getDiceByTargetTotal(results, 10)

    expect(total).toBe(10)
    expect(won).toBe(false)
  })

  it('uses a single die value for total when only one non-hitch die is available', () => {
    const results = [die(8, 5)]

    const { total, effectDice, won } = getDiceByTargetTotal(results, 3)

    expect(total).toBe(5)
    expect(won).toBe(true)
    expect(effectDice).toEqual([])
  })

  it('returns a total of 0 when no non-hitch dice are available', () => {
    const { total, effectDice, won } = getDiceByTargetTotal([], 5)

    expect(total).toBe(0)
    expect(won).toBe(false)
    expect(effectDice).toEqual([])
  })

  it('leaves no effect die when exactly 2 dice are available and both are used for total', () => {
    const results = [die(8, 6), die(6, 5)]

    const { total, effectDice, won } = getDiceByTargetTotal(results, 3)

    expect(total).toBe(11)
    expect(won).toBe(true)
    expect(effectDice).toEqual([])
  })
})

describe('resolveChallengeAfterRoll', () => {
  it('Contest: a loss ends it — the responder who failed to beat the total is the loser', () => {
    const challenge = { type: 'contest', initiatorId: 'gm', responderIds: ['actor1'], updatedAt: 0 }
    const responder = { id: 'actor1', won: false, rolledAt: 100 }

    expect(resolveChallengeAfterRoll(challenge, 'actor1', responder)).toBeNull()
  })

  it('Contest: a win continues it — the winner becomes initiator, the old initiator must respond', () => {
    const challenge = { type: 'contest', initiatorId: 'gm', responderIds: ['actor1'], updatedAt: 0 }
    const responder = { id: 'actor1', won: true, rolledAt: 100 }

    expect(resolveChallengeAfterRoll(challenge, 'actor1', responder)).toEqual({
      type: 'contest',
      initiatorId: 'actor1',
      responderIds: ['gm'],
      updatedAt: 99
    })
  })

  it('Test: a responder is removed whether they won or lost, and the challenge continues if others remain', () => {
    const challenge = { type: 'test', initiatorId: 'gm', responderIds: ['actor1', 'actor2'], updatedAt: 5 }

    expect(resolveChallengeAfterRoll(challenge, 'actor1', { id: 'actor1', won: true, rolledAt: 100 }))
      .toEqual({ type: 'test', initiatorId: 'gm', responderIds: ['actor2'], updatedAt: 5 })

    expect(resolveChallengeAfterRoll(challenge, 'actor1', { id: 'actor1', won: false, rolledAt: 100 }))
      .toEqual({ type: 'test', initiatorId: 'gm', responderIds: ['actor2'], updatedAt: 5 })
  })

  it('Test: clears once the last responder has gone', () => {
    const challenge = { type: 'test', initiatorId: 'gm', responderIds: ['actor1'], updatedAt: 5 }

    expect(resolveChallengeAfterRoll(challenge, 'actor1', { id: 'actor1', won: true, rolledAt: 100 })).toBeNull()
  })
})
