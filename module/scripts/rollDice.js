import { dialogContent, getCurrentTheme, localizer, onSettingChanged, showPlotPointSpendAnimation } from './foundryHelpers.js'
import { previewCrisisReduction } from './crisisPool.js'
import { flattenPoolEntries } from './dicePoolValidation.js'
import { getHinderRewards } from './dicePoolTraitLogic.js'
import { getBestNExcluding, getDiceByEffect, getDiceByTotal, getPickerCase, getRollFormula, sortHitches, sortResults } from './rollDiceLogic.js'
import { applyContestEffectStepDown, computeHeroicStepUp, getActiveChallenge, getDiceByTargetTotal, getMyBeatTargetId, getMyChallengeTarget, getMyResponderId, getTargetRecord, getTargetTotal, recordRollResult } from './rollToBeat.js'

const getAppendDiceContent = (data) => foundry.applications.handlebars.renderTemplate('systems/cortexprime-ext/templates/partials/die-display.html', data)

const testModeSelectDiceValues = () => game.settings.get('cortexprime-ext', 'testModeSelectDiceValues')

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

  rollResults.hitches.sort(sortHitches)
  rollResults.results.sort(sortResults)

  return rollResults
}

const dicePicker = async rollResults => {
  const theme = getCurrentTheme()
  const challengeTarget = getMyChallengeTarget()
  // system.pp only exists once an Actor Type has been confirmed (_actorTypeConfirm in
  // actor-sheet.js) - a player with a not-yet-typed character has 0, not a throw.
  const availablePlotPoints = game.user.character?.system.pp?.value ?? 0

  // Lets the GM's Dice Pool panel show a "SELECTING - <name>" row (see selectingRollers in
  // UserDicePool.js) with a Re-roll button while this dialog is open, and re-roll it from a
  // different client. myActorId/dialogOpen/capturedRoot are read by onRerollRequested below;
  // dialogOpen and the flag are both cleared together in resolveFromDom. The flag itself is set
  // in the dialog's render callback below, not here - setting it this early would flip the GM's
  // row on before the dialog has actually appeared on this player's screen.
  const myActorId = game.user.character?.id ?? null
  let dialogOpen = true
  let capturedRoot = null

  // Re-rolls every die currently in this dialog (same faces/count, not the original pool - the
  // trait selection that produced them is already gone by the time this dialog is open) and
  // refreshes it in place, exactly like the test-mode die-value editor below does. Guarded so a
  // request for someone else is a no-op; the dialogOpen check is belt-and-braces for a request
  // already in flight as this dialog closes, since resolveFromDom unregisters this listener.
  const onRerollRequested = async setting => {
    if (!dialogOpen || !myActorId || !capturedRoot) return
    if (setting.key !== 'cortexprime-ext.dicePickerRerollRequest') return

    const request = game.settings.get('cortexprime-ext', 'dicePickerRerollRequest')
    if (request?.actorId !== myActorId) return

    const formula = [...rollResults.hitches, ...rollResults.results].map(die => `d${die.faces}`).join('+')
    if (!formula) return

    const r = new Roll(formula)
    const roll = await r.evaluate()

    if (game.dice3d) game.dice3d.showForRoll(r, game.user, true)

    const fresh = roll.dice
      .map(die => ({ faces: die.faces, result: die.results[0].result }))
      .reduce((acc, result) => result.result > 1
        ? { ...acc, results: [...acc.results, result] }
        : { ...acc, hitches: [...acc.hitches, result] }, { hitches: [], results: [] })

    fresh.hitches.sort(sortHitches)
    fresh.results.sort(sortResults)
    rollResults.hitches = fresh.hitches
    rollResults.results = fresh.results

    const { pickerCase, content } = await buildContent()

    replacePickerContent(capturedRoot, content)
    bindInteractivity(capturedRoot, pickerCase)
  }

  // Scoped to this one dialog, so it MUST be unregistered when the dialog goes away (see
  // resolveFromDom) — left behind, every roll would strand another listener holding this whole
  // closure, and with it the captured dialog DOM, for the rest of the session.
  const stopListeningForReroll = myActorId ? onSettingChanged(onRerollRequested) : null

  // Re-derives everything getPickerCase decides (Botch/FixedSelection/SelectEffect, Total, Effect
  // Dice, selectability) from the CURRENT rollResults and renders it fresh — used for the initial
  // render and, in test mode, again after every edited die, since editing a die's value can move
  // it across the hitch/non-hitch boundary and change which case applies entirely.
  const buildContent = async () => {
    const pickerCase = getPickerCase(rollResults.results, challengeTarget?.total)

    const content = await foundry.applications.handlebars.renderTemplate('systems/cortexprime-ext/templates/dialog/dice-picker.html', {
      rollResults: { hitches: rollResults.hitches, results: pickerCase.dice },
      title: pickerCase.title,
      selectable: pickerCase.selectable,
      total: pickerCase.total,
      effectDiceFaces: pickerCase.effectDice.length ? pickerCase.effectDice : [4],
      theme,
      isGM: game.user.isGM,
      showChallengeTarget: !!challengeTarget,
      challengeTargetTotal: challengeTarget?.total ?? 0,
      challengeTargetEffectDice: challengeTarget?.effectDice ?? [],
      testModeSelectDiceValues: testModeSelectDiceValues()
    })

    return { pickerCase, content }
  }

  const { pickerCase: initialPickerCase, content: initialContent } = await buildContent()

  // resolveFromDom is side-effecting — it spends Plot Points — and is wired to BOTH the Confirm
  // button and the dialog's close, which fire in sequence on the button path. DialogV2.wait's own
  // resolution is idempotent, but that only protects the returned value, not the spend, so this
  // guard is about the side effects and has to stay. (appv1 had the same shape for the same
  // reason: Dialog#submit ran the callback and then close(), re-reading the still-present checked
  // boxes and charging twice.)
  let resolved = false

  const noValues = () => ({ dice: [], total: 0, effectDice: [] })

  const resolveFromDom = async root => {
    if (resolved) return

    resolved = true
    dialogOpen = false

    stopListeningForReroll?.()
    // Nothing else references the dialog's DOM once the listener above is gone, but this is the
    // handle that was keeping it reachable, so drop it explicitly rather than by implication.
    capturedRoot = null

    if (myActorId) {
      try {
        await game.user.character.unsetFlag('cortexprime-ext', 'dicePickerOpen')
      } catch (error) {
        console.warn('CP | Could not clear dice picker open flag', error)
      }
    }

    const values = noValues()

    for (const die of root.querySelectorAll('.dice-box .result-die')) {
      // Number(), because jQuery's .data('faces') coerced the attribute to a number and these
      // faces are handed to the chat card and the effect-die maths downstream.
      const faces = Number(die.dataset.faces)
      const result = parseInt(die.dataset.result, 10)
      const value = { effect: false, faces, result, total: false }

      if (die.classList.contains('chosen')) {
        values.total += result
        value.total = true
      } else if (die.classList.contains('effect')) {
        values.effectDice.push(faces)
        value.effect = true
      }

      values.dice.push(value)
    }

    const spendExtraTotal = !!root.querySelector('.extra-total-die-checkbox')?.checked
    const spendExtraEffect = !!root.querySelector('.extra-effect-die-checkbox')?.checked
    const spendCount = (spendExtraTotal ? 1 : 0) + (spendExtraEffect ? 1 : 0)

    if (spendCount > 0 && game.user.character) {
      const usage = [spendExtraTotal && localizer('ExtraTotalDieCheckbox'), spendExtraEffect && localizer('ExtraEffectDieCheckbox')]
        .filter(Boolean).join('; ')

      await game.user.character.changePpBy(-spendCount, false, usage)
      showPlotPointSpendAnimation(spendCount)
    }

    return values
  }

  // At most one value-picker popup is ever on screen — opening a new one, or a click anywhere
  // else, always closes whatever's currently open.
  const closeValueMenu = () => {
    for (const menu of document.querySelectorAll('.die-value-menu')) menu.remove()
  }

  // Swaps the rendered picker for freshly built content, in place. Used by the test-mode value
  // editor and by a remote re-roll request.
  const replacePickerContent = (root, content) => {
    const holder = document.createElement('div')

    holder.innerHTML = content
    root.querySelector('.cortexprime.dice-picker').replaceWith(holder.firstElementChild)
  }

  const openValueMenu = async (event, root) => {
    event.preventDefault()
    closeValueMenu()

    const target = event.target.closest('.die-value-target')
    const source = target.dataset.source
    const key = parseInt(target.dataset.key, 10)
    const faces = parseInt(target.dataset.faces, 10)
    const current = parseInt(target.dataset.result, 10)

    if (!faces || Number.isNaN(key)) return

    const menuContent = await foundry.applications.handlebars.renderTemplate(
      'systems/cortexprime-ext/templates/partials/dice/value-menu.html',
      { values: Array.from({ length: faces }, (_, index) => index + 1), current }
    )

    const holder = document.createElement('div')

    holder.innerHTML = menuContent

    const menu = holder.firstElementChild

    // jQuery's .css() appended px to bare numbers for these; the DOM API does not.
    menu.style.position = 'fixed'
    menu.style.left = `${event.clientX}px`
    menu.style.top = `${event.clientY}px`
    menu.style.zIndex = '100000'

    document.body.append(menu)

    menu.addEventListener('click', async optionEvent => {
      const option = optionEvent.target.closest('.die-value-option')

      if (!option) return

      const value = parseInt(option.dataset.value, 10)

      closeValueMenu()

      const die = source === 'hitches' ? rollResults.hitches[key] : rollResults.results[key]

      if (!die || value === die.result) return

      die.result = value

      // A die that crosses the hitch/non-hitch boundary moves to the other list entirely, so
      // getPickerCase (which only ever looks at rollResults.results) reacts to it correctly.
      const wasHitch = source === 'hitches'
      const isHitchNow = value === 1

      if (wasHitch !== isHitchNow) {
        const fromList = wasHitch ? rollResults.hitches : rollResults.results
        const toList = wasHitch ? rollResults.results : rollResults.hitches

        fromList.splice(key, 1)
        toList.push(die)
      }

      rollResults.hitches.sort(sortHitches)
      rollResults.results.sort(sortResults)

      const { pickerCase, content } = await buildContent()

      replacePickerContent(root, content)
      bindInteractivity(root, pickerCase)
    })

    document.addEventListener('click', closeValueMenu, { once: true })
  }

  const bindInteractivity = (root, pickerCase) => {
    const diceBox = root.querySelector('.dice-box')
    const effectDiceContainer = root.querySelector('.your-effect-dice')
    const totalValue = root.querySelector('.total-value')
    const extraTotalCheckbox = root.querySelector('.extra-total-die-checkbox')
    const extraEffectCheckbox = root.querySelector('.extra-effect-die-checkbox')

    const defaultIndex = pickerCase.dice.findIndex(die => die.effect)
    const selectedEffectDice = defaultIndex !== -1 ? [rollResults.results[defaultIndex]] : []

    const effectDiceCap = () => extraEffectCheckbox?.checked ? 2 : 1

    // Each checkbox is disabled whenever it's currently unchecked AND either the Plot Point
    // budget is already fully committed to the other box, or there simply aren't enough
    // non-hitch dice for it to change anything — with 2 or fewer dice there's no baseline
    // effect die to extend at all (both go straight to Total per the normal rules), and
    // "extra total" specifically also goes stale the moment fewer than 3 dice remain once
    // the currently-selected effect dice are set aside (e.g. after picking a 2nd effect die).
    // "Extra effect" needs the mirror image of that: a 2nd effect die is only meaningful if
    // enough non-hitch dice remain afterward to still fill Total (2, or 3 if "extra total" is
    // also checked) — hitches are never selectable as an effect die (see the .selectable
    // click handler below, keyed off rollResults.results, which is already hitch-free), so
    // with e.g. exactly 3 non-hitch dice there's no 4th die anywhere to become that 2nd effect
    // die once the existing 1 effect + 2 total already account for all of them.
    // A checkbox already checked is never disabled, so the player can always uncheck it.
    const updateCheckboxAvailability = () => {
      if (!extraTotalCheckbox || !extraEffectCheckbox) return

      const checkedCount = (extraTotalCheckbox.checked ? 1 : 0) + (extraEffectCheckbox.checked ? 1 : 0)
      const remainingForTotal = rollResults.results.length - selectedEffectDice.length
      const totalDiceNeeded = extraTotalCheckbox.checked ? 3 : 2

      const extraTotalUseless = !pickerCase.selectable || remainingForTotal < 3
      const extraEffectUseless = !pickerCase.selectable || rollResults.results.length < 2 + totalDiceNeeded

      extraTotalCheckbox.disabled = !extraTotalCheckbox.checked && (extraTotalUseless || checkedCount >= availablePlotPoints)
      extraEffectCheckbox.disabled = !extraEffectCheckbox.checked && (extraEffectUseless || checkedCount >= availablePlotPoints)
    }

    const recompute = async () => {
      while (selectedEffectDice.length > effectDiceCap()) selectedEffectDice.shift()

      const n = extraTotalCheckbox?.checked ? 3 : 2
      const totalDice = getBestNExcluding(rollResults.results, selectedEffectDice, n)
      const totalDiceSet = new Set(totalDice)
      const selectedSet = new Set(selectedEffectDice)
      const total = totalDice.reduce((sum, die) => sum + die.result, 0)

      const dieElements = [...diceBox.querySelectorAll('.result-die')]

      dieElements.forEach((dieElement, index) => {
        const dieCpt = dieElement.querySelector('.die-cpt')
        const die = rollResults.results[index]

        dieElement.classList.remove('chosen', 'effect')
        dieCpt?.classList.remove('chosen-cpt', 'effect-cpt', 'unchosen-cpt')

        if (selectedSet.has(die)) {
          dieElement.classList.add('effect')
          dieCpt?.classList.add('effect-cpt')
        } else if (totalDiceSet.has(die)) {
          dieElement.classList.add('chosen')
          dieCpt?.classList.add('chosen-cpt')
        } else {
          dieCpt?.classList.add('unchosen-cpt')
        }
      })

      totalValue.textContent = total

      for (const wrapper of effectDiceContainer.querySelectorAll('.die-icon-wrapper')) wrapper.remove()

      for (const die of selectedEffectDice) {
        const dieContent = await getAppendDiceContent({ dieRating: die.faces, value: die.faces, type: 'effect' })

        effectDiceContainer.insertAdjacentHTML('beforeend', dieContent)
      }
    }

    // Individual dice are only clickable when there were enough of them to need a choice in
    // the first place (see getPickerCase) — with 2 or fewer, both checkboxes stay disabled
    // above, so there's nothing for this handler to ever need to do.
    if (pickerCase.selectable) {
      // Delegated from .dice-box, as jQuery's .on(event, selector, fn) was, so the dice can be
      // re-rendered underneath it without rebinding.
      diceBox.addEventListener('click', async event => {
        const clicked = event.target.closest('.selectable')

        if (!clicked || !diceBox.contains(clicked)) return

        const clickedKey = parseInt(clicked.dataset.key, 10)
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

    if (testModeSelectDiceValues()) {
      diceBox.addEventListener('contextmenu', event => {
        const target = event.target.closest('.die-value-target')

        if (!target || !diceBox.contains(target)) return

        openValueMenu(event, root)
      })
    }

    extraTotalCheckbox?.addEventListener('change', async () => {
      updateCheckboxAvailability()
      await recompute()
    })

    extraEffectCheckbox?.addEventListener('change', async () => {
      updateCheckboxAvailability()
      await recompute()
    })

    updateCheckboxAvailability()
  }

  const values = await foundry.applications.api.DialogV2.wait({
    window: { title: 'Select Your Dice' },
    // Merged with DialogV2's own 'dialog' class rather than replacing it. Note the window root
    // and the template root both end up carrying cortexprime/dice-picker, which is why
    // e2e/helpers/dicePool.js scopes its picker locators to .window-content.
    classes: ['cortexprime', 'dice-picker'],
    // Element, not a string: keeps the dice' inline SVG from being stripped. See dialogContent.
    content: dialogContent(initialContent),
    buttons: [
      {
        action: 'confirm',
        label: 'Confirm',
        icon: 'fa-solid fa-check',
        default: true,
        callback: (event, target, dialog) => resolveFromDom(dialog.element)
      }
    ],
    close: (event, dialog) => resolveFromDom(dialog.element),
    // The real "it is actually rendered" signal, fired once the dialog is in the DOM. The
    // dicePickerOpen flag is set here rather than earlier so the GM's SELECTING row only lights
    // up once this player can actually see the dialog.
    render: (event, dialog) => {
      capturedRoot = dialog.element

      bindInteractivity(dialog.element, initialPickerCase)

      if (myActorId) {
        game.user.character.setFlag('cortexprime-ext', 'dicePickerOpen', true).catch(error => {
          console.warn('CP | Could not flag dice picker as open', error)
        })
      }
    }
  })

  return values ?? noValues()
}

export default async function (pool, rollType, targetTotal, spendPlotPointForExtraDie) {
  // Generated here rather than inside recordRollResult so the chat card below can be stamped with
  // the same timestamp — the card is deliberately created BEFORE the record (see the comment down
  // there), so this is the only way the two can share an identity. That pairing is what lets the
  // GM's Undo control find the roll a given card belongs to (see rollUndo.js).
  const rolledAt = Date.now()
  const rollActorId = game.user.isGM ? 'gm' : game.user.character?.id ?? null

  // Read now, before recordRollResult below fires the hooks that advance or clear the active
  // challenge (the same ordering trap documented in hitches.js and paradox.js) — a Hinder reward
  // only counts for a Test/Contest/Group, and by the time recordRollResult returns the challenge
  // this roll belonged to may already be gone.
  const challengeType = getActiveChallenge().type

  // Captured before _clearDicePool below wipes the tray: which Trait Set each pooled trait came
  // from, and its faces. The roll record keeps this so rule sets can ask "was a die from Trait Set
  // X in this roll?" after the fact (module/mage/paradox.js does, for the Powers Trait Set). The
  // `pool` argument is a by-value snapshot that _clearDicePool doesn't mutate, so this stays valid
  // for the whole function either way.
  const flatPoolEntries = flattenPoolEntries(pool)

  const poolEntries = flatPoolEntries
    .filter(entry => entry.traitSetId)
    .map(entry => ({ traitSetId: entry.traitSetId, faces: Object.values(entry.value ?? {}).map(String) }))

  const rollResults = await getRollResults(pool)
  const theme = getCurrentTheme()
  const sourceDefaultCollapsed = game.settings.get('cortexprime-ext', 'rollResultSourceCollapsed')

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

  const content = await foundry.applications.handlebars.renderTemplate('systems/cortexprime-ext/templates/chat/roll-result.html', {
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
  await ChatMessage.create({
    content,
    // Identifies which roll this card belongs to, so the GM's Undo control can find it (and delete
    // it) later — chat messages carry no other usable handle back to a roll.
    flags: { 'cortexprime-ext': { roll: { actorId: rollActorId, rolledAt } } }
  })

  // Every die that was actually rolled (not just the ones selected for the total) rides along on
  // the record, so the GM's client can open the Hitches dialog for any natural 1s — see hitches.js.
  await recordRollResult({
    total: selectedDice.total,
    effectDice: finalEffectDice,
    won,
    dice: [...rollResults.results, ...rollResults.hitches],
    poolEntries,
    rolledAt
  })

  // One Plot Point per hindered trait actually rolled, during a Test/Contest/Group only. Only a
  // player has a Plot Point pool to award into - a GM rolling a hindered trait (e.g. an NPC's)
  // earns nothing, same as every other Plot Point award in this file.
  if (!game.user.isGM && game.user.character) {
    for (const { label } of getHinderRewards(flatPoolEntries, challengeType)) {
      await game.user.character.changePpBy(1, false, game.i18n.format('HinderPlotPointReason', { trait: label }))
    }
  }
}