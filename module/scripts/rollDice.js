import { objectReduce } from '../../lib/helpers.js'
import { localizer, showPlotPointSpendAnimation } from './foundryHelpers.js'
import { previewCrisisReduction } from './crisisPool.js'
import { applyContestEffectStepDown, computeHeroicStepUp, getActiveChallenge, getDiceByTargetTotal, getMyBeatTargetId, getMyChallengeTarget, getMyResponderId, getTargetRecord, getTargetTotal, recordRollResult } from './rollToBeat.js'

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

// Sum of the n highest-value dice among nonHitchResults, excluding the current effect-die
// selection (one or two dice) — used both for the case-4 default effect-die selection and for
// recomputing on each click/checkbox change.
const getBestNExcluding = (nonHitchResults, excludedDice, n) => nonHitchResults
  .filter(die => !excludedDice.includes(die))
  .sort((a, b) => b.result - a.result)
  .slice(0, n)

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

const dicePicker = async rollResults => {
  const themes = game.settings.get('cortexprime', 'themes')
  const theme = themes.current === 'custom' ? themes.custom : themes.list[themes.current]
  const pickerCase = getPickerCase(rollResults.results)
  const challengeTarget = getMyChallengeTarget()
  const availablePlotPoints = game.user.character?.system.pp.value ?? 0

  const content = await foundry.applications.handlebars.renderTemplate('systems/cortexprime/templates/dialog/dice-picker.html', {
    rollResults: { hitches: rollResults.hitches, results: pickerCase.dice },
    title: pickerCase.title,
    selectable: pickerCase.selectable,
    total: pickerCase.total,
    effectDiceFaces: pickerCase.effectDice.length ? pickerCase.effectDice : [4],
    theme,
    isGM: game.user.isGM,
    showChallengeTarget: !!challengeTarget,
    challengeTargetTotal: challengeTarget?.total ?? 0,
    challengeTargetEffectDice: challengeTarget?.effectDice ?? []
  })

  return new Promise((resolve) => {
    const resolveFromDom = async html => {
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

      const spendExtraTotal = html.find('.extra-total-die-checkbox').prop('checked')
      const spendExtraEffect = html.find('.extra-effect-die-checkbox').prop('checked')
      const spendCount = (spendExtraTotal ? 1 : 0) + (spendExtraEffect ? 1 : 0)

      if (spendCount > 0 && game.user.character) {
        const usage = [spendExtraTotal && localizer('ExtraTotalDieCheckbox'), spendExtraEffect && localizer('ExtraEffectDieCheckbox')]
          .filter(Boolean).join('; ')

        await game.user.character.changePpBy(-spendCount, false, usage)
        showPlotPointSpendAnimation(spendCount)
      }

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
        const $diceBox = html.find('.dice-box')
        const $effectDiceContainer = html.find('.your-effect-dice')
        const $totalValue = html.find('.total-value')
        const $extraTotalCheckbox = html.find('.extra-total-die-checkbox')
        const $extraEffectCheckbox = html.find('.extra-effect-die-checkbox')

        const defaultIndex = pickerCase.dice.findIndex(die => die.effect)
        const selectedEffectDice = defaultIndex !== -1 ? [rollResults.results[defaultIndex]] : []

        const effectDiceCap = () => $extraEffectCheckbox.prop('checked') ? 2 : 1

        // Each checkbox is disabled whenever it's currently unchecked AND either the Plot Point
        // budget is already fully committed to the other box, or there simply aren't enough
        // non-hitch dice for it to change anything — with 2 or fewer dice there's no baseline
        // effect die to extend at all (both go straight to Total per the normal rules), and
        // "extra total" specifically also goes stale the moment fewer than 3 dice remain once
        // the currently-selected effect dice are set aside (e.g. after picking a 2nd effect die).
        // A checkbox already checked is never disabled, so the player can always uncheck it.
        const updateCheckboxAvailability = () => {
          const checkedCount = (($extraTotalCheckbox.prop('checked') ? 1 : 0) + ($extraEffectCheckbox.prop('checked') ? 1 : 0))
          const remainingForTotal = rollResults.results.length - selectedEffectDice.length

          const extraTotalUseless = !pickerCase.selectable || remainingForTotal < 3
          const extraEffectUseless = !pickerCase.selectable

          $extraTotalCheckbox.prop('disabled', !$extraTotalCheckbox.prop('checked') && (extraTotalUseless || checkedCount >= availablePlotPoints))
          $extraEffectCheckbox.prop('disabled', !$extraEffectCheckbox.prop('checked') && (extraEffectUseless || checkedCount >= availablePlotPoints))
        }

        const recompute = async () => {
          while (selectedEffectDice.length > effectDiceCap()) selectedEffectDice.shift()

          const n = $extraTotalCheckbox.prop('checked') ? 3 : 2
          const totalDice = getBestNExcluding(rollResults.results, selectedEffectDice, n)
          const totalDiceSet = new Set(totalDice)
          const selectedSet = new Set(selectedEffectDice)
          const total = totalDice.reduce((sum, die) => sum + die.result, 0)

          $diceBox.find('.result-die').each(function (index) {
            const $die = $(this)
            const $dieCpt = $die.find('.die-cpt')
            const die = rollResults.results[index]

            $die.removeClass('chosen effect')
            $dieCpt.removeClass('chosen-cpt effect-cpt unchosen-cpt')

            if (selectedSet.has(die)) {
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

          for (const die of selectedEffectDice) {
            const dieContent = await getAppendDiceContent({ dieRating: die.faces, value: die.faces, type: 'effect' })
            $effectDiceContainer.append(dieContent)
          }
        }

        // Individual dice are only clickable when there were enough of them to need a choice in
        // the first place (see getPickerCase) — with 2 or fewer, both checkboxes stay disabled
        // above, so there's nothing for this handler to ever need to do.
        if (pickerCase.selectable) {
          $diceBox.on('click', '.selectable', async function () {
            const $clicked = $(this)
            const clickedKey = parseInt($clicked.data('key'), 10)
            const clickedDie = rollResults.results[clickedKey]

            const index = selectedEffectDice.indexOf(clickedDie)

            if (index !== -1) {
              if (selectedEffectDice.length > 1) selectedEffectDice.splice(index, 1)
            } else {
              selectedEffectDice.push(clickedDie)
              while (selectedEffectDice.length > effectDiceCap()) selectedEffectDice.shift()
            }

            await recompute()
          })
        }

        $extraTotalCheckbox.on('change', async () => {
          updateCheckboxAvailability()
          await recompute()
        })

        $extraEffectCheckbox.on('change', async () => {
          updateCheckboxAvailability()
          await recompute()
        })

        updateCheckboxAvailability()
      }
    }, { jQuery: true, classes: ['dialog', 'dice-picker', 'cortexprime'] }).render(true)
  })
}

export default async function (pool, rollType, targetTotal, spendPlotPointForExtraDie) {
  const rollResults = await getRollResults(pool)
  const themes = game.settings.get('cortexprime', 'themes')
  const theme = themes.current === 'custom' ? themes.custom : themes.list[themes.current]
  const sourceDefaultCollapsed = game.settings.get('cortexprime', 'rollResultSourceCollapsed')

  if (spendPlotPointForExtraDie && game.user.character) {
    await game.user.character.changePpBy(-1, false, localizer('SpendPlotPointExtraDieCheckbox'))
    showPlotPointSpendAnimation()
  }

  await this?._clearDicePool(null, { preserveCrisisPool: true })

  const selectedDice = rollType === 'total'
    ? getDiceByTotal(rollResults.results)
    : rollType === 'effect'
      ? getDiceByEffect(rollResults.results)
      : rollType === 'toBeat'
        ? getDiceByTargetTotal(rollResults.results, targetTotal)
        : await dicePicker(rollResults)

  // Any roll made while the roller is a designated responder, the designated Contest interferer
  // using their one-time roll, or a Group's front-of-queue challenger counts as an attempt to
  // beat that target, exactly like "Roll To Beat" — regardless of which of the four roll types
  // was actually used to build the Total/Effect. Only "Roll To Beat" itself picks its dice with
  // the target in mind; the other three just get their normal result compared against it too.
  const beatTargetId = getMyBeatTargetId()
  const respondingToId = rollType !== 'toBeat' ? beatTargetId : null
  const isBeatAttempt = rollType === 'toBeat' || respondingToId !== null
  const effectiveTargetTotal = rollType === 'toBeat' ? selectedDice.targetTotal : getTargetTotal(respondingToId)
  const won = rollType === 'toBeat' ? selectedDice.won : (isBeatAttempt ? selectedDice.total > effectiveTargetTotal : undefined)

  // Heroic Success: beating the target by 5+ steps the Effect die up a rung per 5-point margin.
  // Computed immediately after die selection, before the Contest-ending "blunt" step-down and
  // the Crisis Pool reduction below — both of those need to see this boosted effect die, not
  // the original one the roll-type algorithm picked.
  const heroicSuccess = (won && isBeatAttempt)
    ? computeHeroicStepUp(selectedDice.effectDice, selectedDice.total - effectiveTargetTotal)
    : null
  const finalEffectDice = heroicSuccess?.effectDice ?? selectedDice.effectDice

  // On a loss, show the effect dice of the roll that wasn't beaten, so a "Lost" result still
  // conveys what the responder was up against.
  const targetId = beatTargetId
  const failureEffectDice = (isBeatAttempt && won === false) ? (getTargetRecord(beatTargetId)?.effectDice ?? []) : []

  // Contest-only: even a losing roll's effect die can blunt the contest's overall winner's
  // already-recorded one. The GM's client applies this for real, reactively, once this chat
  // message is already sent — this is a locally-computed preview of that same deterministic
  // outcome, purely so this losing roll's own chat card can show it happening. Gated on
  // getMyResponderId() specifically (not the broader isBeatAttempt, which now also covers a
  // Contest interferer's roll) — this only ever actually applies via processChallengeAdvancement,
  // which scans challenge.responderIds and structurally never sees an interferer's roll, so
  // showing this preview for one would describe something that never really happens.
  const effectStepDown = (won === false && getMyResponderId() && getActiveChallenge().type === 'contest')
    ? applyContestEffectStepDown(getTargetRecord(targetId)?.effectDice ?? [], selectedDice.effectDice).steppedDown
    : null

  // The GM's client performs the actual, authoritative Crisis Pool reduction reactively (see
  // processChallengeAdvancement in rollToBeat.js), after this chat message is already sent —
  // so this is a locally-computed preview of that same, deterministic outcome, purely for
  // describing it here. Matches the existing player-only rule (a GM win never touches the pool).
  // Same getMyResponderId() scoping as effectStepDown above, for the same reason.
  const crisisPreview = (won && getMyResponderId() && !game.user.isGM)
    ? previewCrisisReduction(finalEffectDice)
    : null

  const content = await foundry.applications.handlebars.renderTemplate('systems/cortexprime/templates/chat/roll-result.html', {
    dicePool: pool,
    effectDice: finalEffectDice,
    rollResults: { hitches: rollResults.hitches, results: selectedDice.dice },
    speaker: game.user,
    sourceDefaultCollapsed,
    theme,
    total: selectedDice.total,
    isBeatAttempt,
    targetTotal: effectiveTargetTotal,
    won,
    failureEffectDice,
    effectStepDown,
    heroicSuccess,
    crisisEvents: crisisPreview?.events ?? [],
    crisisResolved: !!crisisPreview?.resolved
  })

  // This roll's own chat card must exist before recordRollResult writes the flag/setting that
  // fires the reactive Group Challenge advancement hooks (see registerRollToBeat in
  // rollToBeat.js) — those can post their own chat message (e.g. the Initiative results card)
  // as soon as this write lands, so recording the roll only after the card is created keeps
  // that follow-up message from racing ahead of it in the chat log.
  await ChatMessage.create({ content })

  await recordRollResult({ total: selectedDice.total, effectDice: finalEffectDice, won })
}