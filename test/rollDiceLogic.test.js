import { describe, expect, it } from 'vitest'
import {
  getBestNExcluding,
  getDiceByEffect,
  getDiceByTotal,
  getPickerCase,
  getRollFormula,
  markResultEffect,
  markResultTotals,
  sortHitches,
  sortResults
} from '../module/scripts/rollDiceLogic.js'
import { getDiceByTargetTotal } from '../module/scripts/rollToBeat.js'

const die = (faces, result) => ({ faces, result })

// Compact rendering of a marked dice list, so a failure reads as
// "d12=9[E] d8=8[T] d6=3[T]" instead of a wall of objects.
const brief = dice => dice
  .map(({ faces, result, total, effect }) => `d${faces}=${result}${total ? '[T]' : ''}${effect ? '[E]' : ''}`)
  .join(' ')

const trait = (...faces) => ({ value: Object.fromEntries(faces.map((face, index) => [index, face])) })

describe('getRollFormula', () => {
  it('returns an empty formula for an empty pool', () => {
    expect(getRollFormula({})).toBe('')
  })

  it('builds one die term per trait die', () => {
    expect(getRollFormula({ g1: { t1: trait('8') } })).toBe('+d8')
    expect(getRollFormula({ g1: { t1: trait('8', '6') } })).toBe('+d8+d6')
  })

  it('skips traits with no dice and null trait groups', () => {
    expect(getRollFormula({ g1: { t1: {} } })).toBe('')
    expect(getRollFormula({ g1: null })).toBe('')
  })

  // SMELL, pinned as-is. The inner reduce seeds from '' so every group is prefixed with '+',
  // and joining groups adds another - two groups produce '+d8++d6'. Foundry's Roll parser
  // tolerates the leading and doubled '+' (they read as unary plus), which is why this has
  // never surfaced. Pinned so a "tidy up the formula" change has to be a deliberate one.
  it('emits a leading + on the first group and a doubled + between groups', () => {
    expect(getRollFormula({ g1: { t1: trait('8') }, g2: { t2: trait('6') } })).toBe('+d8++d6')
  })
})

describe('sortHitches', () => {
  it('orders hitches by descending faces', () => {
    expect([die(6, 1), die(12, 1), die(8, 1)].sort(sortHitches).map(d => d.faces))
      .toEqual([12, 8, 6])
  })
})

describe('sortResults', () => {
  it('orders by descending result first', () => {
    expect(brief([die(6, 5), die(10, 5), die(8, 9)].sort(sortResults)))
      .toBe('d8=9 d10=5 d6=5')
  })

  it('breaks ties on equal results by descending faces', () => {
    expect([die(6, 5), die(12, 5), die(8, 5)].sort(sortResults).map(d => d.faces))
      .toEqual([12, 8, 6])
  })
})

describe('markResultTotals', () => {
  it('marks exactly the two highest results as Total', () => {
    expect(brief(markResultTotals([die(8, 5), die(6, 5), die(10, 3)])))
      .toBe('d6=5[T] d8=5[T] d10=3')
  })

  // Opposite tie-break to markResultEffect on purpose: the Total wants to leave the biggest
  // die free to become the Effect die, so on equal results it takes the smaller die.
  it('breaks result ties toward the smaller die', () => {
    const marked = markResultTotals([die(12, 5), die(4, 5), die(8, 5)])

    expect(marked.filter(d => d.total).map(d => d.faces)).toEqual([4, 8])
  })

  it('never marks a die that is already the Effect die', () => {
    expect(brief(markResultTotals([{ ...die(12, 6), effect: true }, die(8, 5), die(6, 4), die(10, 3)])))
      .toBe('d12=6[E] d8=5[T] d6=4[T] d10=3')
  })

  it('marks what it can when fewer than two dice are available', () => {
    expect(brief(markResultTotals([die(8, 5)]))).toBe('d8=5[T]')
    expect(markResultTotals([])).toEqual([])
  })
})

describe('markResultEffect', () => {
  it('marks the largest die as Effect, regardless of its result', () => {
    expect(brief(markResultEffect([die(8, 5), die(12, 2), die(6, 5)])))
      .toBe('d12=2[E] d8=5 d6=5')
  })

  // Mirror of markResultTotals: on equal faces it gives up the lower-scoring die, leaving the
  // higher result free to count toward the Total.
  it('breaks faces ties toward the lower result', () => {
    expect(brief(markResultEffect([die(12, 5), die(12, 2), die(6, 5)])))
      .toBe('d12=2[E] d12=5 d6=5')
  })

  it('never marks a die that is already counted toward the Total', () => {
    expect(brief(markResultEffect([{ ...die(12, 6), total: true }, die(8, 5), die(6, 4)])))
      .toBe('d12=6[T] d8=5[E] d6=4')
  })

  it('marks at most one Effect die', () => {
    expect(markResultEffect([die(12, 2), die(10, 3), die(8, 4)]).filter(d => d.effect)).toHaveLength(1)
  })
})

describe('getDiceByEffect vs getDiceByTotal', () => {
  // The reason two roll buttons exist. When the biggest die is ALSO one of the two best
  // results, the strategies have to disagree: Roll for Effect spends it on the Effect die,
  // Roll for Total spends it on the Total.
  const contested = () => [die(12, 9), die(8, 8), die(6, 3)]

  it('Roll for Effect keeps the biggest die as the Effect die', () => {
    const result = getDiceByEffect(contested())

    expect(result.total).toBe(11)
    expect(result.effectDice).toEqual([12])
    expect(brief(result.dice)).toBe('d12=9[E] d8=8[T] d6=3[T]')
  })

  it('Roll for Total spends the biggest die on the Total instead', () => {
    const result = getDiceByTotal(contested())

    expect(result.total).toBe(17)
    expect(result.effectDice).toEqual([6])
    expect(brief(result.dice)).toBe('d12=9[T] d8=8[T] d6=3[E]')
  })

  it('agrees when the biggest die is not one of the two best results', () => {
    const uncontested = () => [die(6, 6), die(12, 2), die(8, 5)]

    expect(getDiceByEffect(uncontested())).toEqual(getDiceByTotal(uncontested()))
  })

  // getDiceByEffect skips markResultEffect at <= 2 dice while getDiceByTotal always runs it.
  // The branch is inert - with two dice both are marked Total, so there is no die left to
  // become the Effect die either way. Pinned because the asymmetry looks like a bug and
  // someone will eventually "fix" it.
  it('both leave a two-die roll with no Effect die at all', () => {
    const two = () => [die(6, 6), die(12, 2)]

    expect(getDiceByEffect(two())).toEqual(getDiceByTotal(two()))
    expect(getDiceByEffect(two()).effectDice).toEqual([])
    expect(getDiceByEffect(two()).total).toBe(8)
  })

  it('both return a zero result for an empty roll', () => {
    expect(getDiceByEffect([])).toEqual({ dice: [], total: 0, effectDice: [] })
    expect(getDiceByTotal([])).toEqual({ dice: [], total: 0, effectDice: [] })
  })
})

describe('getBestNExcluding', () => {
  // Exclusion is by object identity, not by value - two dice showing the same number are
  // different dice, and excluding one must not silently exclude the other.
  it('excludes by identity, not by equal value', () => {
    const dice = [die(8, 5), die(6, 5), die(10, 3)]

    expect(brief(getBestNExcluding(dice, [dice[0]], 2))).toBe('d6=5 d10=3')
  })

  it('returns the n highest results', () => {
    const dice = [die(8, 2), die(6, 9), die(10, 5)]

    expect(brief(getBestNExcluding(dice, [], 2))).toBe('d6=9 d10=5')
  })

  it('returns everything available when n exceeds the pool', () => {
    const dice = [die(8, 5), die(6, 5), die(10, 3)]

    expect(getBestNExcluding(dice, [], 9)).toHaveLength(3)
  })

  it('returns an empty list when everything is excluded', () => {
    const dice = [die(8, 5), die(6, 5)]

    expect(getBestNExcluding(dice, dice, 2)).toEqual([])
  })
})

describe('getPickerCase', () => {
  const contested = () => [die(12, 9), die(8, 8), die(6, 3)]

  it('reports a Botch, not selectable, when every die hitched', () => {
    expect(getPickerCase([], null))
      .toEqual({ title: 'Botch', selectable: false, dice: [], total: 0, effectDice: [] })
  })

  it('reports a fixed, unselectable roll at one or two dice, with no Effect die', () => {
    const one = getPickerCase([die(8, 5)], null)

    expect(one.title).toBe('FixedSelection')
    expect(one.selectable).toBe(false)
    expect(one.total).toBe(5)
    expect(one.effectDice).toEqual([])
    expect(brief(one.dice)).toBe('d8=5[T]')

    const two = getPickerCase([die(6, 6), die(12, 2)], null)

    expect(two.title).toBe('FixedSelection')
    expect(two.selectable).toBe(false)
    expect(two.total).toBe(8)
    expect(two.effectDice).toEqual([])
  })

  it('defaults to the biggest die as Effect when there is no target', () => {
    const result = getPickerCase(contested(), null)

    expect(result.title).toBe('SelectEffect')
    expect(result.selectable).toBe(true)
    expect(result.effectDice).toEqual([12])
    expect(result.total).toBe(11)
  })

  it('breaks a faces tie toward the higher result when there is no target', () => {
    const result = getPickerCase([die(12, 2), die(12, 9), die(6, 5)], null)

    expect(brief(result.dice)).toBe('d12=2[T] d12=9[E] d6=5[T]')
    expect(result.total).toBe(7)
  })

  it('seeds from the target, sacrificing the Effect die only when it must to win', () => {
    // Beatable on 11 - keep the d12 Effect die.
    const reachable = getPickerCase(contested(), 10)
    expect(reachable.total).toBe(11)
    expect(reachable.effectDice).toEqual([12])

    // Needs 17 - the d12 has to go into the Total.
    const stretch = getPickerCase(contested(), 16)
    expect(stretch.total).toBe(17)
    expect(stretch.effectDice).toEqual([6])
  })

  it('falls back to maximizing the Effect die when the target is unreachable', () => {
    const result = getPickerCase(contested(), 99)

    expect(result.total).toBe(11)
    expect(result.effectDice).toEqual([12])
  })

  it('delegates to getDiceByTargetTotal whenever a target is present', () => {
    const target = 16
    const { dice, total, effectDice } = getDiceByTargetTotal(contested(), target)

    // getPickerCase forwards exactly these three and drops targetTotal/won, which belong to
    // the challenge record rather than the picker.
    expect(getPickerCase(contested(), target)).toMatchObject({ dice, total, effectDice })
  })

  // REGRESSION PIN for 77c2bde. The guard is `target != null`, so a target total of 0 is a
  // real target and must take the target branch. If it were ever loosened to a truthiness
  // check, target 0 would fall through to the no-target default: same d12 Effect die but a
  // Total of 7 instead of 14 - a strictly worse roll, silently.
  it('treats a target total of 0 as a target, not as "no target"', () => {
    const twoBigDice = () => [die(12, 2), die(12, 9), die(6, 5)]

    const { dice, total, effectDice } = getDiceByTargetTotal(twoBigDice(), 0)

    const targeted = getPickerCase(twoBigDice(), 0)
    expect(targeted.total).toBe(14)
    expect(targeted.effectDice).toEqual([12])
    expect(targeted).toMatchObject({ dice, total, effectDice })

    expect(getPickerCase(twoBigDice(), null).total).toBe(7)
  })
})
