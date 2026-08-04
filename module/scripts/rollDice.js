import { objectReduce } from '../../lib/helpers.js'
import { localizer } from './foundryHelpers.js'
import { getActiveChallenge, getDiceByTargetTotal, getMyResponderId, getTargetTotal, recordRollResult } from './rollToBeat.js'

const getAppendDiceContent = (data) => foundry.applications.handlebars.renderTemplate('systems/cortexprime/templates/partials/die-display.html', data)

const getRollFormula = (pool) => {
  return objectReduce(pool, (formula, traitGroup) => {
    const innerFormula = objectReduce(traitGroup || {}, (acc, trait) => [...acc, ...Object.values(trait.value || {})], [])
      .reduce((acc, value) => `${acc}+d${value}`, '')

    return formula ? `${formula}+${innerFormula}` : innerFormula
  }, '')
}

const getRollResults = async pool => {
  const rollFormula = getRollFormula(pool)

  const r = new Roll(rollFormula)

  const roll = await r.evaluate()

  if (game.dice3d) {
    game.dice3d.showForRoll(r, game.user, true)
  }

  const rollResults = roll.dice
    .map(die => ({ faces: die.faces, result: die.results[0].result }))
    .reduce((acc, result) => {
      if (result.result > 1) {
        return { ...acc, results: [...acc.results, result] }
      }

      return { ...acc, hitches: [...acc.hitches, result] }
    }, { hitches: [], results: [] })

  rollResults.hitches.sort((a, b) => {
    return b.faces - a.faces
  })

  rollResults.results.sort((a, b) => {
    if (a.result !== b.result) {
      return b.result - a.result
    }

    return b.faces - a.faces
  })

  return rollResults
}

const markResultTotals = results => {
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

const markResultEffect = results => {
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

const getDiceByEffect = results => {
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

const getDiceByTotal = results => {
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

// Sum of the 2 highest-value dice among nonHitchResults, excluding one candidate die —
// used both for the case-4 default effect-die selection and for recomputing on each click.
const getBestTwoExcluding = (nonHitchResults, excludedDie) => nonHitchResults
  .filter(die => die !== excludedDie)
  .sort((a, b) => b.result - a.result)
  .slice(0, 2)

const getPickerCase = results => {
  if (results.length === 0) {
    return { title: 'Botch', selectable: false, dice: results, total: 0, effectDice: [] }
  }

  if (results.length <= 2) {
    const total = results.reduce((sum, die) => sum + die.result, 0)
    const dice = results.map(die => ({ ...die, total: true }))

    return { title: 'FixedSelection', selectable: false, dice, total, effectDice: [] }
  }

  const sortedByFaces = [...results].sort((a, b) => a.faces !== b.faces ? b.faces - a.faces : b.result - a.result)
  const defaultEffectDie = sortedByFaces[0]
  const totalDice = getBestTwoExcluding(results, defaultEffectDie)
  const total = totalDice.reduce((sum, die) => sum + die.result, 0)
  const totalDiceSet = new Set(totalDice)

  const dice = results.map(die => {
    if (die === defaultEffectDie) return { ...die, effect: true }
    if (totalDiceSet.has(die)) return { ...die, total: true }
    return die
  })

  return { title: 'SelectEffect', selectable: true, dice, total, effectDice: [defaultEffectDie.faces] }
}

const dicePicker = async rollResults => {
  const themes = game.settings.get('cortexprime', 'themes')
  const theme = themes.current === 'custom' ? themes.custom : themes.list[themes.current]
  const pickerCase = getPickerCase(rollResults.results)

  const content = await foundry.applications.handlebars.renderTemplate('systems/cortexprime/templates/dialog/dice-picker.html', {
    rollResults: { hitches: rollResults.hitches, results: pickerCase.dice },
    title: pickerCase.title,
    selectable: pickerCase.selectable,
    total: pickerCase.total,
    effectDieFace: pickerCase.effectDice[0] ?? 4,
    theme
  })

  return new Promise((resolve) => {
    const resolveFromDom = html => {
      const $diceBox = html.find('.dice-box')
      const values = { dice: [], total: 0, effectDice: [] }

      $diceBox
        .find('.result-die')
        .each(function () {
          const $die = $(this)
          const faces = $die.data('faces')
          const result = parseInt($die.data('result'), 10)
          const value = { effect: false, faces, result, total: false }

          if ($die.hasClass('chosen')) {
            values.total += result
            value.total = true
          } else if ($die.hasClass('effect')) {
            values.effectDice.push(faces)
            value.effect = true
          }

          values.dice.push(value)
        })

      resolve(values)
    }

    new Dialog({
      title: "Select Your Dice",
      content,
      buttons: {
        confirm: {
          icon: '<i class="fa-solid fa-check"></i>',
          label: localizer('Confirm'),
          callback: resolveFromDom
        }
      },
      default: 'confirm',
      close: resolveFromDom,
      render (html) {
        if (!pickerCase.selectable) return

        const $diceBox = html.find('.dice-box')
        const $effectDiceContainer = html.find('.effect-dice')
        const $totalValue = html.find('.total-value')

        $diceBox.on('click', '.selectable', async function () {
          const $clicked = $(this)
          const clickedKey = parseInt($clicked.data('key'), 10)
          const clickedDie = rollResults.results[clickedKey]

          const totalDice = getBestTwoExcluding(rollResults.results, clickedDie)
          const totalDiceSet = new Set(totalDice)
          const total = totalDice.reduce((sum, die) => sum + die.result, 0)

          $diceBox.find('.result-die').each(function (index) {
            const $die = $(this)
            const $dieCpt = $die.find('.die-cpt')
            const die = rollResults.results[index]

            $die.removeClass('chosen effect')
            $dieCpt.removeClass('chosen-cpt effect-cpt unchosen-cpt')

            if (die === clickedDie) {
              $die.addClass('effect')
              $dieCpt.addClass('effect-cpt')
            } else if (totalDiceSet.has(die)) {
              $die.addClass('chosen')
              $dieCpt.addClass('chosen-cpt')
            } else {
              $dieCpt.addClass('unchosen-cpt')
            }
          })

          $totalValue.text(total)

          $effectDiceContainer.find('.die-icon-wrapper').remove()
          const dieContent = await getAppendDiceContent({ dieRating: clickedDie.faces, value: clickedDie.faces, type: 'effect' })
          $effectDiceContainer.append(dieContent)
        })
      }
    }, { jQuery: true, classes: ['dialog', 'dice-picker', 'cortexprime'] }).render(true)
  })
}

export default async function (pool, rollType, targetTotal) {
  const rollResults = await getRollResults(pool)
  const themes = game.settings.get('cortexprime', 'themes')
  const theme = themes.current === 'custom' ? themes.custom : themes.list[themes.current]
  const sourceDefaultCollapsed = game.settings.get('cortexprime', 'rollResultSourceCollapsed')

  await this?._clearDicePool()

  const selectedDice = rollType === 'total'
    ? getDiceByTotal(rollResults.results)
    : rollType === 'effect'
      ? getDiceByEffect(rollResults.results)
      : rollType === 'toBeat'
        ? getDiceByTargetTotal(rollResults.results, targetTotal)
        : await dicePicker(rollResults)

  // Any roll made while the roller is a designated responder counts as an attempt to beat
  // that target, exactly like "Roll To Beat" — regardless of which of the four roll types was
  // actually used to build the Total/Effect. Only "Roll To Beat" itself picks its dice with
  // the target in mind; the other three just get their normal result compared against it too.
  const respondingToId = rollType !== 'toBeat' && getMyResponderId() ? getActiveChallenge().initiatorId : null
  const isBeatAttempt = rollType === 'toBeat' || respondingToId !== null
  const effectiveTargetTotal = rollType === 'toBeat' ? selectedDice.targetTotal : getTargetTotal(respondingToId)
  const won = rollType === 'toBeat' ? selectedDice.won : (isBeatAttempt ? selectedDice.total > effectiveTargetTotal : undefined)

  await recordRollResult({ total: selectedDice.total, effectDice: selectedDice.effectDice, won })

  const content = await foundry.applications.handlebars.renderTemplate('systems/cortexprime/templates/chat/roll-result.html', {
    dicePool: pool,
    effectDice: selectedDice.effectDice,
    rollResults: { hitches: rollResults.hitches, results: selectedDice.dice },
    speaker: game.user,
    sourceDefaultCollapsed,
    theme,
    total: selectedDice.total,
    isBeatAttempt,
    targetTotal: effectiveTargetTotal,
    won
  })

  await ChatMessage.create({ content })
}