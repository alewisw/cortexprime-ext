import { objectReduce } from '../../lib/helpers.js'
import { getDiceByTargetTotal } from './rollToBeat.js'

// The decidable half of rollDice.js: formula building, die sorting, and the Total/Effect
// selection algorithms. Nothing here touches game/Hooks/CONFIG/Roll, so it unit tests
// directly - same split as hitches.js -> hitchesLogic.js.

export const getRollFormula = (pool) => {
  return objectReduce(pool, (formula, traitGroup) => {
    const innerFormula = objectReduce(traitGroup || {}, (acc, trait) => [...acc, ...Object.values(trait.value || {})], [])
      .reduce((acc, value) => `${acc}+d${value}`, '')

    return formula ? `${formula}+${innerFormula}` : innerFormula
  }, '')
}

// Shared by getRollResults and the test-mode value editor in dicePicker, so a manually
// edited roll ends up ordered exactly like a freshly rolled one.
export const sortHitches = (a, b) => b.faces - a.faces

export const sortResults = (a, b) => {
  if (a.result !== b.result) {
    return b.result - a.result
  }

  return b.faces - a.faces
}

export const markResultTotals = results => {
  results.sort((a, b) => {
    if (a.result !== b.result) {
      return b.result - a.result
    }

    return a.faces - b.faces
  })

  return results.reduce((acc, result) => {
    if (!result.effect && acc.count < 2) return { dice: [...acc.dice, { ...result, total: true }], count: acc.count + 1 }

    return { dice: [...acc.dice, result], count: acc.count }
  }, { dice: [], count: 0 }).dice
}

export const markResultEffect = results => {
  results.sort((a, b) => {
    if (a.faces !== b.faces) {
      return b.faces - a.faces
    }

    return a.result - b.result
  })

  return results.reduce((acc, result) => {
    const hasEffectDie = acc.some(item => item.effect)
    if (!result.total && !hasEffectDie) return [...acc, { ...result, effect: true }]

    return [...acc, result]
  }, [])
}

export const getDiceByEffect = results => {
  const effectMarkedResults = results.length > 2 ? markResultEffect(results) : results
  const finalResults = markResultTotals(effectMarkedResults)

  finalResults.sort((a, b) => {
    if (a.result !== b.result) {
      return b.result - a.result
    }

    return b.faces - a.faces
  })

  const total = finalResults.reduce((totalValue, result) => result.total ? totalValue + result.result : totalValue, 0)
  const targetEffectDie = finalResults.find(result => result.effect)
  const effectDice = targetEffectDie?.faces ? [targetEffectDie.faces] : []

  return { dice: finalResults, total, effectDice }
}

export const getDiceByTotal = results => {
  const totalMarkedResults = markResultTotals(results)
  const finalResults = markResultEffect(totalMarkedResults)

  finalResults.sort((a, b) => {
    if (a.result !== b.result) {
      return b.result - a.result
    }

    return b.faces - a.faces
  })

  const total = finalResults.reduce((totalValue, result) => result.total ? totalValue + result.result : totalValue, 0)
  const targetEffectDie = finalResults.find(result => result.effect)
  const effectDice = targetEffectDie?.faces ? [targetEffectDie.faces] : []

  return { dice: finalResults, total, effectDice }
}

// Sum of the n highest-value dice among nonHitchResults, excluding the current effect-die
// selection (one or two dice) — used both for the case-4 default effect-die selection and for
// recomputing on each click/checkbox change.
export const getBestNExcluding = (nonHitchResults, excludedDice, n) => nonHitchResults
  .filter(die => !excludedDice.includes(die))
  .sort((a, b) => b.result - a.result)
  .slice(0, n)

export const getPickerCase = (results, target) => {
  if (results.length === 0) {
    return { title: 'Botch', selectable: false, dice: results, total: 0, effectDice: [] }
  }

  if (results.length <= 2) {
    const total = results.reduce((sum, die) => sum + die.result, 0)
    const dice = results.map(die => ({ ...die, total: true }))

    return { title: 'FixedSelection', selectable: false, dice, total, effectDice: [] }
  }

  // A clear Roll to Beat target means there's a right answer for which die maximizes the
  // Effect die - seed the picker with the same choice "Roll to Beat" itself would make, while
  // still leaving it fully editable below.
  if (target != null) {
    const { dice, total, effectDice } = getDiceByTargetTotal(results, target)
    return { title: 'SelectEffect', selectable: true, dice, total, effectDice }
  }

  const sortedByFaces = [...results].sort((a, b) => a.faces !== b.faces ? b.faces - a.faces : b.result - a.result)
  const defaultEffectDie = sortedByFaces[0]
  const totalDice = getBestNExcluding(results, [defaultEffectDie], 2)
  const total = totalDice.reduce((sum, die) => sum + die.result, 0)
  const totalDiceSet = new Set(totalDice)

  const dice = results.map(die => {
    if (die === defaultEffectDie) return { ...die, effect: true }
    if (totalDiceSet.has(die)) return { ...die, total: true }
    return die
  })

  return { title: 'SelectEffect', selectable: true, dice, total, effectDice: [defaultEffectDie.faces] }
}
