import { describe, expect, it } from 'vitest'
import {
  applyContestEffectStepDown,
  canStartGroupInitiative,
  computeHeroicStepUp,
  filterEligibleInterferers,
  getBeatTargetIdFor,
  getBlankRecord,
  getDiceByTargetTotal,
  getGroupDisplayOrder,
  getPendingGroupParticipants,
  hasContestStarted,
  isGroupComplete,
  orderGroupInitiative,
  removeFromGroup,
  resolveChallengeAfterRoll,
  resolveGroupDuel,
  startGroupDueling,
  sumOf
} from '../module/scripts/rollToBeat.js'

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

  it('prioritizes beating the total', () => {
    const results = [die(6, 6), die(10, 5), die(6, 2), die(4, 1)]

    const { total, effectDice, won } = getDiceByTargetTotal(results, 8)

    // Using the d6(2) as effect leaves d6(6)+d10(5)=11 for total, beating the d10(5)-as-effect
    // alternative (which would only leave d6(6)+d6(2)=8)
    expect(total).toBe(11)
    expect(won).toBe(true)
    expect(effectDice).toEqual([6])
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

  it('with exactly 3 dice and no way to win, still maximizes the effect die rather than the total', () => {
    const results = [die(4, 4), die(6, 2), die(12, 3)]

    const { total, effectDice, won } = getDiceByTargetTotal(results, 100)

    // Even on a guaranteed loss, effect die size is never pointless — in a Contest it can
    // still blunt the eventual winner's effect die (see applyContestEffectStepDown) — so the
    // normal d12-as-effect pick (total 6) is still made, not the highest-total alternative (7).
    expect(total).toBe(6)
    expect(won).toBe(false)
    expect(effectDice).toEqual([12])
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

  it('restricts the effect-die tie-break to winning candidates, not the whole pool', () => {
    const results = [die(8, 3), die(10, 3), die(10, 4), die(12, 7)]

    const { total, effectDice, won } = getDiceByTargetTotal(results, 7)

    // Using d12(7) as effect loses (remaining d10(4)+d8(3)=7, tied with target). Restricted to
    // the candidates that actually win, the two d10 options tie on face size, so the higher
    // total (d10(3), leaving d12(7)+d10(4)=11) is chosen over d10(4) (leaving d12(7)+d8(3)=10) —
    // not the d12(7) pick a face-only sort over the whole pool would make.
    expect(total).toBe(11)
    expect(won).toBe(true)
    expect(effectDice).toEqual([10])
  })

  it('ignores 1s when choosing the effect die among 3+ non-hitch dice, leaving the hitch untagged', () => {
    const results = [die(4, 1), die(6, 3), die(8, 4), die(12, 6)]

    const { dice, total, effectDice, won } = getDiceByTargetTotal(results, 5)

    expect(total).toBe(7)
    expect(won).toBe(true)
    expect(effectDice).toEqual([12])
    expect(dice.find(result => result.faces === 4)).toEqual({ faces: 4, result: 1 })
  })

  it('tags duplicate-valued dice independently rather than both or neither', () => {
    const results = [die(8, 5), die(8, 5), die(6, 3)]

    const { dice, total, effectDice, won } = getDiceByTargetTotal(results, 4)

    expect(total).toBe(8)
    expect(won).toBe(true)
    expect(effectDice).toEqual([8])
    expect(dice[0]).toEqual({ faces: 8, result: 5, total: true })
    expect(dice[1]).toEqual({ faces: 8, result: 5, effect: true })
  })

  it('resolves a fully-tied pair (same face, same total) deterministically', () => {
    const results = [die(8, 5), die(8, 5), die(6, 4)]

    const { dice, total, effectDice, won } = getDiceByTargetTotal(results, 5)

    expect(total).toBe(9)
    expect(won).toBe(true)
    expect(effectDice).toEqual([8])
    expect(dice[0]).toEqual({ faces: 8, result: 5, total: true })
    expect(dice[1]).toEqual({ faces: 8, result: 5, effect: true })
  })

  it('echoes the target total in the result exactly as passed in', () => {
    const results = [die(8, 6), die(6, 4)]

    const { targetTotal } = getDiceByTargetTotal(results, 42)

    expect(targetTotal).toBe(42)
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

describe('applyContestEffectStepDown', () => {
  it('stands as rolled when the winner\'s effect die is higher than the loser\'s', () => {
    expect(applyContestEffectStepDown([12], [8])).toEqual({ effectDice: [12], steppedDown: null })
  })

  it('stands as rolled when the winner\'s effect die equals the loser\'s', () => {
    expect(applyContestEffectStepDown([8], [8])).toEqual({ effectDice: [8], steppedDown: null })
  })

  it('steps down one rung when the winner\'s effect die is lower than the loser\'s', () => {
    expect(applyContestEffectStepDown([8], [12])).toEqual({ effectDice: [6], steppedDown: { from: 8, to: 6 } })
  })

  it('never steps down more than one rung, regardless of how much bigger the loser\'s die is', () => {
    expect(applyContestEffectStepDown([12], [12])).toEqual({ effectDice: [12], steppedDown: null })
    expect(applyContestEffectStepDown([6], [12])).toEqual({ effectDice: [4], steppedDown: { from: 6, to: 4 } })
  })

  it('a D4 stays at D4 rather than being removed', () => {
    expect(applyContestEffectStepDown([4], [12])).toEqual({ effectDice: [4], steppedDown: null })
  })

  it('treats missing/empty effect dice as D4 for comparison purposes', () => {
    // Winner's empty array is treated as D4 for the comparison, but since D4 can't step down
    // any further, it's returned unchanged rather than being normalized to [4].
    expect(applyContestEffectStepDown([], [12])).toEqual({ effectDice: [], steppedDown: null })
    expect(applyContestEffectStepDown([8], [])).toEqual({ effectDice: [8], steppedDown: null })
  })

  it('with two winner dice, steps down only the largest, leaving the other untouched', () => {
    expect(applyContestEffectStepDown([8, 4], [12])).toEqual({
      effectDice: [6, 4],
      steppedDown: { from: 8, to: 6, other: 4 }
    })
  })

  it('with two winner dice, stands as rolled when the largest already beats the loser\'s largest', () => {
    expect(applyContestEffectStepDown([12, 4], [8])).toEqual({ effectDice: [12, 4], steppedDown: null })
  })
})

describe('computeHeroicStepUp', () => {
  it('is not a Heroic Success when the margin is under 5', () => {
    expect(computeHeroicStepUp([8], 4)).toBeNull()
    expect(computeHeroicStepUp([8], 0)).toBeNull()
  })

  it('steps up one rung for a 5-9 point margin', () => {
    expect(computeHeroicStepUp([6], 5)).toEqual({ effectDice: [8], from: 6, to: 8 })
    expect(computeHeroicStepUp([6], 9)).toEqual({ effectDice: [8], from: 6, to: 8 })
  })

  it('steps up two rungs for a 10-14 point margin', () => {
    expect(computeHeroicStepUp([4], 10)).toEqual({ effectDice: [8], from: 4, to: 8 })
  })

  it('landing exactly on D12 with no leftover steps displays normally, not as SPECIAL', () => {
    expect(computeHeroicStepUp([8], 10)).toEqual({ effectDice: [12], from: 8, to: 12 })
  })

  it('overshooting D12 caps the recorded die at D12 and displays SPECIAL', () => {
    expect(computeHeroicStepUp([8], 15)).toEqual({ effectDice: [12], from: 8, to: 'SPECIAL' })
  })

  it('an effect die already at D12 goes straight to SPECIAL on any qualifying margin', () => {
    expect(computeHeroicStepUp([12], 5)).toEqual({ effectDice: [12], from: 12, to: 'SPECIAL' })
  })

  it('treats a missing/empty effect die as a D4 baseline before stepping up', () => {
    expect(computeHeroicStepUp([], 5)).toEqual({ effectDice: [6], from: 4, to: 6 })
    expect(computeHeroicStepUp(undefined, 5)).toEqual({ effectDice: [6], from: 4, to: 6 })
  })

  it('with two effect dice, steps up only the lowest, leaving the other untouched', () => {
    expect(computeHeroicStepUp([8, 4], 5)).toEqual({ effectDice: [8, 6], from: 4, to: 6, other: 8 })
  })

  it('with two effect dice, overshooting D12 caps the lowest at D12 and displays SPECIAL', () => {
    expect(computeHeroicStepUp([12, 8], 15)).toEqual({ effectDice: [12, 12], from: 8, to: 'SPECIAL', other: 12 })
  })
})

describe('filterEligibleInterferers', () => {
  const target = id => ({ id, name: id })

  it('excludes the current initiator and current responder, keeping everyone else', () => {
    const challenge = { initiatorId: 'gm', responderIds: ['actor1'] }
    const targets = [target('gm'), target('actor1'), target('actor2'), target('actor3')]

    expect(filterEligibleInterferers(challenge, targets)).toEqual([target('actor2'), target('actor3')])
  })

  it('includes the GM entry when the GM is not already the initiator or a responder', () => {
    const challenge = { initiatorId: 'actor1', responderIds: ['actor2'] }
    const targets = [target('gm'), target('actor1'), target('actor2')]

    expect(filterEligibleInterferers(challenge, targets)).toEqual([target('gm')])
  })

  it('excludes the GM entry when the GM is the current initiator', () => {
    const challenge = { initiatorId: 'gm', responderIds: ['actor1'] }
    const targets = [target('gm'), target('actor1')]

    expect(filterEligibleInterferers(challenge, targets)).toEqual([])
  })

  it('returns an empty list when every connected target is already part of the Contest, including the GM as a responder', () => {
    const challenge = { initiatorId: 'actor1', responderIds: ['gm', 'actor2'] }
    const targets = [target('gm'), target('actor1'), target('actor2')]

    expect(filterEligibleInterferers(challenge, targets)).toEqual([])
  })
})

describe('hasContestStarted', () => {
  it('is false when there is no active challenge', () => {
    expect(hasContestStarted({ type: null }, false)).toBe(false)
  })

  it('is false for a Test, even once its initiator has rolled — Contest-only', () => {
    expect(hasContestStarted({ type: 'test' }, true)).toBe(false)
  })

  it('is false for a fresh Contest whose initiator has not rolled yet', () => {
    expect(hasContestStarted({ type: 'contest' }, false)).toBe(false)
  })

  it('is true once a Contest\'s initiator has rolled', () => {
    expect(hasContestStarted({ type: 'contest' }, true)).toBe(true)
  })
})

const rollRecord = (id, total, effectDice, rolledAt = 100) => ({ id, name: id, total, effectDice, won: null, rolledAt })

describe('orderGroupInitiative', () => {
  it('orders participants by Total, lowest first', () => {
    const targets = [rollRecord('a', 10, [8]), rollRecord('b', 5, [6]), rollRecord('c', 15, [10])]

    expect(orderGroupInitiative(['a', 'b', 'c'], targets)).toEqual(['b', 'a', 'c'])
  })

  it('breaks a Total tie with the smaller effect die', () => {
    const targets = [rollRecord('a', 10, [10]), rollRecord('b', 10, [6])]

    expect(orderGroupInitiative(['a', 'b'], targets)).toEqual(['b', 'a'])
  })

  it('uses the largest of a two-element effect dice array as that roller\'s representative die', () => {
    const targets = [rollRecord('a', 10, [4, 10]), rollRecord('b', 10, [8])]

    // a's representative die is a D10 (max of 4/10), which loses the tie-break to b's D8
    expect(orderGroupInitiative(['a', 'b'], targets)).toEqual(['b', 'a'])
  })

  it('treats missing/empty effect dice as a D4', () => {
    const targets = [rollRecord('a', 10, []), rollRecord('b', 10, [6])]

    expect(orderGroupInitiative(['a', 'b'], targets)).toEqual(['a', 'b'])
  })

  it('breaks a fully-tied entry with the injected random map', () => {
    const targets = [rollRecord('a', 10, [8]), rollRecord('b', 10, [8])]

    expect(orderGroupInitiative(['a', 'b'], targets, { a: 1, b: 2 })).toEqual(['a', 'b'])
    expect(orderGroupInitiative(['a', 'b'], targets, { a: 2, b: 1 })).toEqual(['b', 'a'])
  })

  it('with no randoms supplied, leaves fully-tied entries in participantIds order', () => {
    const targets = [rollRecord('a', 10, [8]), rollRecord('b', 10, [8])]

    expect(orderGroupInitiative(['a', 'b'], targets)).toEqual(['a', 'b'])
    expect(orderGroupInitiative(['b', 'a'], targets)).toEqual(['b', 'a'])
  })

  it('drops ids with no matching target record', () => {
    const targets = [rollRecord('a', 10, [8])]

    expect(orderGroupInitiative(['a', 'ghost'], targets)).toEqual(['a'])
  })

  it('returns an empty array for an empty roster', () => {
    expect(orderGroupInitiative([], [])).toEqual([])
  })
})

describe('startGroupDueling', () => {
  it('the last (strongest) entry becomes champion and everyone else becomes the queue in order', () => {
    const challenge = { type: 'group', group: { phase: 'initiative', participantIds: ['a', 'b', 'c'], queue: [], championId: null } }

    const result = startGroupDueling(challenge, ['a', 'b', 'c'], 500)

    expect(result.group).toEqual({ phase: 'dueling', participantIds: ['a', 'b', 'c'], queue: ['a', 'b'], championId: 'c' })
    expect(result.updatedAt).toBe(500)
  })

  it('a single-entry order yields an empty queue and that entry as champion', () => {
    const challenge = { type: 'group', group: { phase: 'initiative', participantIds: ['a'], queue: [], championId: null } }

    const result = startGroupDueling(challenge, ['a'], 500)

    expect(result.group.queue).toEqual([])
    expect(result.group.championId).toBe('a')
  })
})

describe('resolveGroupDuel', () => {
  it('a win makes the challenger the new champion and sends the displaced champion to the back of the queue', () => {
    const challenge = { group: { phase: 'dueling', participantIds: ['a', 'b', 'c'], queue: ['a', 'b'], championId: 'c' } }

    const result = resolveGroupDuel(challenge, { id: 'a', won: true }, 600)

    expect(result.group.queue).toEqual(['b', 'c'])
    expect(result.group.championId).toBe('a')
    expect(result.updatedAt).toBe(600)
  })

  it('a loss keeps the standing champion and simply drops the challenger from the front of the queue', () => {
    const challenge = { group: { phase: 'dueling', participantIds: ['a', 'b', 'c'], queue: ['a', 'b'], championId: 'c' } }

    const result = resolveGroupDuel(challenge, { id: 'a', won: false }, 600)

    expect(result.group.queue).toEqual(['b'])
    expect(result.group.championId).toBe('c')
  })

  it('resolving the last queued challenger with a loss leaves an empty queue', () => {
    const challenge = { group: { phase: 'dueling', participantIds: ['a', 'c'], queue: ['a'], championId: 'c' } }

    const result = resolveGroupDuel(challenge, { id: 'a', won: false }, 600)

    expect(result.group.queue).toEqual([])
  })

  it('a win by the last queued challenger does NOT end the group — the displaced champion rejoins the queue', () => {
    // Regression test: with only two players left, a win used to empty the queue and
    // incorrectly conclude the group. The displaced former champion must get another turn.
    const challenge = { group: { phase: 'dueling', participantIds: ['a', 'c'], queue: ['a'], championId: 'c' } }

    const result = resolveGroupDuel(challenge, { id: 'a', won: true }, 600)

    expect(result.group.queue).toEqual(['c'])
    expect(result.group.championId).toBe('a')
    expect(isGroupComplete(result)).toBe(false)
  })
})

describe('removeFromGroup', () => {
  it('removes the id from both participantIds and queue', () => {
    const challenge = { group: { phase: 'dueling', participantIds: ['a', 'b', 'c'], queue: ['a', 'b'], championId: 'c' } }

    const result = removeFromGroup(challenge, 'a')

    expect(result.group.participantIds).toEqual(['b', 'c'])
    expect(result.group.queue).toEqual(['b'])
    expect(result.group.championId).toBe('c')
  })

  it('clears championId without promoting anyone when the champion is removed', () => {
    const challenge = { group: { phase: 'dueling', participantIds: ['a', 'b', 'c'], queue: ['a', 'b'], championId: 'c' } }

    const result = removeFromGroup(challenge, 'c')

    expect(result.group.championId).toBeNull()
    expect(result.group.queue).toEqual(['a', 'b'])
  })

  it('is a no-op for an id that is not in the group', () => {
    const challenge = { group: { phase: 'dueling', participantIds: ['a', 'b', 'c'], queue: ['a', 'b'], championId: 'c' } }

    const result = removeFromGroup(challenge, 'ghost')

    expect(result.group).toEqual(challenge.group)
  })

  it('removing the last queued challenger leaves a complete group', () => {
    const challenge = { group: { phase: 'dueling', participantIds: ['a', 'c'], queue: ['a'], championId: 'c' } }

    const result = removeFromGroup(challenge, 'a')

    expect(isGroupComplete(result)).toBe(true)
  })
})

describe('isGroupComplete', () => {
  it('is true when the queue is empty and a champion is standing', () => {
    expect(isGroupComplete({ group: { queue: [], championId: 'a' } })).toBe(true)
  })

  it('is false while anyone is still queued', () => {
    expect(isGroupComplete({ group: { queue: ['b'], championId: 'a' } })).toBe(false)
  })

  it('is false when the queue is empty but the champion was removed', () => {
    expect(isGroupComplete({ group: { queue: [], championId: null } })).toBe(false)
  })
})

describe('getPendingGroupParticipants', () => {
  it('returns everyone before anyone has rolled', () => {
    const challenge = { updatedAt: 500, group: { participantIds: ['a', 'b'] } }
    const targets = [rollRecord('a', 0, [], 100), rollRecord('b', 0, [], 100)]

    expect(getPendingGroupParticipants(challenge, targets)).toEqual(['a', 'b'])
  })

  it('returns only those whose rolledAt is not after updatedAt', () => {
    const challenge = { updatedAt: 500, group: { participantIds: ['a', 'b'] } }
    const targets = [rollRecord('a', 10, [8], 600), rollRecord('b', 0, [], 100)]

    expect(getPendingGroupParticipants(challenge, targets)).toEqual(['b'])
  })

  it('treats rolledAt exactly equal to updatedAt as not-yet-rolled', () => {
    const challenge = { updatedAt: 500, group: { participantIds: ['a'] } }
    const targets = [rollRecord('a', 10, [8], 500)]

    expect(getPendingGroupParticipants(challenge, targets)).toEqual(['a'])
  })

  it('ignores participants with no live target record', () => {
    const challenge = { updatedAt: 500, group: { participantIds: ['a', 'ghost'] } }
    const targets = [rollRecord('a', 0, [], 100)]

    expect(getPendingGroupParticipants(challenge, targets)).toEqual(['a'])
  })

  it('returns an empty array once everyone has rolled', () => {
    const challenge = { updatedAt: 500, group: { participantIds: ['a', 'b'] } }
    const targets = [rollRecord('a', 10, [8], 600), rollRecord('b', 5, [6], 700)]

    expect(getPendingGroupParticipants(challenge, targets)).toEqual([])
  })
})

describe('canStartGroupInitiative', () => {
  it('is false for 0, 1, or 2 participants and true at exactly 3 or more', () => {
    const base = { type: 'group', group: { phase: 'selecting' } }

    expect(canStartGroupInitiative({ ...base, group: { ...base.group, participantIds: [] } })).toBe(false)
    expect(canStartGroupInitiative({ ...base, group: { ...base.group, participantIds: ['a'] } })).toBe(false)
    expect(canStartGroupInitiative({ ...base, group: { ...base.group, participantIds: ['a', 'b'] } })).toBe(false)
    expect(canStartGroupInitiative({ ...base, group: { ...base.group, participantIds: ['a', 'b', 'c'] } })).toBe(true)
    expect(canStartGroupInitiative({ ...base, group: { ...base.group, participantIds: ['a', 'b', 'c', 'd'] } })).toBe(true)
  })

  it('is false outside the selecting phase, even with enough participants', () => {
    expect(canStartGroupInitiative({ type: 'group', group: { phase: 'dueling', participantIds: ['a', 'b', 'c', 'd'] } })).toBe(false)
  })

  it('is false for a non-group challenge', () => {
    expect(canStartGroupInitiative({ type: 'contest', group: null })).toBe(false)
  })
})

describe('getGroupDisplayOrder', () => {
  it('lists the queue first, champion last', () => {
    expect(getGroupDisplayOrder({ queue: ['a', 'b'], championId: 'c' })).toEqual(['a', 'b', 'c'])
  })

  it('omits the champion slot entirely when there is no champion', () => {
    expect(getGroupDisplayOrder({ queue: ['a', 'b'], championId: null })).toEqual(['a', 'b'])
  })
})

describe('getBlankRecord', () => {
  it('is the "never rolled" shape, with rolledAt 0 so every reactor skips it', () => {
    expect(getBlankRecord()).toEqual({
      total: 0, effectDice: [], won: null, rolledAt: 0, dice: [], poolEntries: []
    })
  })

  // The whole reason it's a factory rather than a shared constant. Handing out the same array
  // instances would let one undone roll's mutations leak into the next blanked record.
  it('hands out fresh arrays every call', () => {
    const first = getBlankRecord()
    const second = getBlankRecord()

    expect(first.effectDice).not.toBe(second.effectDice)
    expect(first.dice).not.toBe(second.dice)
    expect(first.poolEntries).not.toBe(second.poolEntries)

    first.dice.push(die(8, 5))
    expect(second.dice).toEqual([])
  })
})

describe('sumOf', () => {
  it('adds the results, ignoring the faces', () => {
    expect(sumOf([die(8, 5), die(12, 3)])).toBe(8)
    expect(sumOf([])).toBe(0)
  })
})

// The pure twin of getMyBeatTargetId. getMyBeatTargetId bottoms out in the current user, so
// only this version can answer "who was THAT roller shooting at" - which is what the GM's
// client needs when reacting to someone else's roll. Each branch below mirrors the
// current-user version; if the two ever drift, this is where it should show up.
describe('getBeatTargetIdFor', () => {
  it('points a responder at the initiator', () => {
    const challenge = { type: 'test', initiatorId: 'gm', responderIds: ['actor1', 'actor2'] }

    expect(getBeatTargetIdFor(challenge, 'actor1')).toBe('gm')
    expect(getBeatTargetIdFor(challenge, 'actor2')).toBe('gm')
  })

  it('gives the initiator no target of their own', () => {
    expect(getBeatTargetIdFor({ type: 'test', initiatorId: 'gm', responderIds: ['actor1'] }, 'gm'))
      .toBeNull()
  })

  it('gives a bystander no target', () => {
    expect(getBeatTargetIdFor({ type: 'test', initiatorId: 'gm', responderIds: ['actor1'] }, 'actor9'))
      .toBeNull()
  })

  it('points an interferer at the initiator too', () => {
    const challenge = {
      type: 'contest',
      initiatorId: 'actor1',
      responderIds: ['actor2'],
      interference: { interfererId: 'actor3' }
    }

    expect(getBeatTargetIdFor(challenge, 'actor3')).toBe('actor1')
  })

  it('points the front-of-queue duelist at the champion', () => {
    const challenge = {
      type: 'group',
      group: { phase: 'dueling', queue: ['actor1', 'actor2'], championId: 'actor3' }
    }

    expect(getBeatTargetIdFor(challenge, 'actor1')).toBe('actor3')
  })

  it('gives a queued duelist who is not up yet no target', () => {
    const challenge = {
      type: 'group',
      group: { phase: 'dueling', queue: ['actor1', 'actor2'], championId: 'actor3' }
    }

    expect(getBeatTargetIdFor(challenge, 'actor2')).toBeNull()
  })

  it('gives no target during group initiative, where everyone rolls unopposed', () => {
    const challenge = {
      type: 'group',
      group: { phase: 'initiative', queue: ['actor1'], championId: null, participantIds: ['actor1'] }
    }

    expect(getBeatTargetIdFor(challenge, 'actor1')).toBeNull()
  })

  it('gives no target when a duel has lost its champion', () => {
    const challenge = {
      type: 'group',
      group: { phase: 'dueling', queue: ['actor1'], championId: null }
    }

    expect(getBeatTargetIdFor(challenge, 'actor1')).toBeNull()
  })

  it('returns null for a missing challenge, an untyped challenge, or no roller', () => {
    expect(getBeatTargetIdFor(null, 'actor1')).toBeNull()
    expect(getBeatTargetIdFor(undefined, 'actor1')).toBeNull()
    expect(getBeatTargetIdFor({ type: null, responderIds: ['actor1'] }, 'actor1')).toBeNull()
    expect(getBeatTargetIdFor({ type: 'test', initiatorId: 'gm', responderIds: ['actor1'] }, null))
      .toBeNull()
  })

  it('tolerates a challenge with no responderIds array at all', () => {
    expect(getBeatTargetIdFor({ type: 'test', initiatorId: 'gm' }, 'actor1')).toBeNull()
  })
})
