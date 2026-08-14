import { localizer } from '../scripts/foundryHelpers.js'
import { getLength, objectFilter, objectMapValues, objectReindexFilter } from '../../lib/helpers.js'
import rollDice from '../scripts/rollDice.js'
import { getCrisisPool } from '../scripts/crisisPool.js'
import { getDicePoolInvalidReason } from '../scripts/dicePoolValidation.js'
import {
  canCurrentUserRoll,
  canStartGroupInitiative,
  clearActiveChallenge,
  endInterference,
  getActiveChallenge,
  getEligibleInterferers,
  getGroupDisplayOrder,
  getMyBeatTargetId,
  getMyChallengeTarget,
  getMyGroupRollRole,
  getMyInterfererId,
  getMyResponderId,
  getPendingGroupParticipants,
  getRollToBeatTargets,
  getTargetTotal,
  hasContestStarted,
  hasInitiatorRolled,
  removeGroupParticipant,
  setChallengeInitiator,
  setChallengeResponders,
  setChallengeType,
  setGroupParticipants,
  startGroupInitiative,
  startInterference
} from '../scripts/rollToBeat.js'

const blankPool = {
  customAdd: {
    label: '',
    value: { 0: '8' }
  },
  pool: {},
  spendPlotPointForExtraDie: false
}

const CRISIS_POOL_SOURCE = 'Crisis Pool'

// The dicePool flag is legitimately absent at times: every write in this class deliberately
// clears it to null before setting the new value, and a user who has never had a pool has none
// at all. Since the read side then immediately dereferences it (currentDice.pool...), every
// read goes through here rather than assuming an object is there — otherwise landing on that
// null window throws "Cannot read properties of null (reading 'pool')" and takes out whatever
// was being done, up to and including rendering the tray at all.
//
// Falls back to a *clone*: blankPool is shared module state and callers mutate what they get
// back, so handing out the original would leak one pool's contents into every later fallback.
const readDicePool = () =>
  game.user.getFlag('cortexprime-ext', 'dicePool') ?? foundry.utils.deepClone(blankPool)

// Computes "who's currently up" for both the status line and the GM's Contest radio
// selections. In a Contest, once the current "Roll Now" person has actually rolled, display
// flips to show the other party as Roll Now — it's their turn to try to beat it — even though
// the underlying initiatorId/responderIds only actually swap if that roll goes on to lose (see
// processChallengeAdvancement). In a Test, once the initiator has rolled, every remaining
// responder moves up into "Roll Now" at once instead — a Test can have any number of
// responders, so a single displayed "swap" doesn't apply there.
const getChallengeDisplay = (activeChallenge, rollToBeatTargets) => {
  const initiatorId = activeChallenge.initiatorId
  const responderId = activeChallenge.responderIds[0] ?? null
  const initiatorHasRolled = hasInitiatorRolled(activeChallenge)
  const nameOf = id => rollToBeatTargets.find(target => target.id === id)?.name

  if (activeChallenge.type === 'test') {
    const responderNames = activeChallenge.responderIds.map(nameOf).filter(Boolean)

    return {
      displayedInitiatorId: initiatorId,
      displayedResponderId: responderId,
      rollNowNames: initiatorHasRolled ? responderNames : [nameOf(initiatorId)].filter(Boolean),
      rollNextNames: initiatorHasRolled ? [] : responderNames
    }
  }

  const displayedInitiatorId = initiatorHasRolled ? responderId : initiatorId
  const displayedResponderId = initiatorHasRolled ? initiatorId : responderId

  return {
    displayedInitiatorId,
    displayedResponderId,
    rollNowNames: [nameOf(displayedInitiatorId)].filter(Boolean),
    rollNextNames: [nameOf(displayedResponderId)].filter(Boolean)
  }
}

// Bundles everything the template needs to render the GM's challenge controls and the status
// line, built on top of getChallengeDisplay's "who's up now" resolution.
const getChallengeDisplayData = (activeChallenge, rollToBeatTargets) => {
  const display = getChallengeDisplay(activeChallenge, rollToBeatTargets)

  return {
    challengeInitiatorOptions: rollToBeatTargets.map(target => ({
      ...target,
      selected: target.id === display.displayedInitiatorId
    })),
    challengeResponderOptions: rollToBeatTargets
      .filter(target => target.id !== display.displayedInitiatorId)
      .map(target => ({
        ...target,
        checked: activeChallenge.type === 'test'
          ? activeChallenge.responderIds.includes(target.id)
          : target.id === display.displayedResponderId
      })),
    rollNowNames: display.rollNowNames,
    rollNextNames: display.rollNextNames,
    challengeRadiosReadOnly: hasContestStarted(activeChallenge, hasInitiatorRolled(activeChallenge))
  }
}

// Bundles everything the template needs for the GM's Group controls and status line, per phase.
// Returns isGroupChallenge:false for non-Group challenges so it can be spread unconditionally,
// exactly like getChallengeDisplayData.
const getGroupDisplayData = (activeChallenge, rollToBeatTargets) => {
  if (activeChallenge.type !== 'group' || !activeChallenge.group) return { isGroupChallenge: false }

  const group = activeChallenge.group
  const targetOf = id => rollToBeatTargets.find(target => target.id === id)
  const nameOf = id => targetOf(id)?.name
  const champion = group.championId ? targetOf(group.championId) : null

  return {
    isGroupChallenge: true,
    isGroupSelecting: group.phase === 'selecting',
    isGroupInitiative: group.phase === 'initiative',
    isGroupDueling: group.phase === 'dueling',
    groupParticipantOptions: rollToBeatTargets.map(target => ({
      ...target,
      checked: group.participantIds.includes(target.id)
    })),
    groupCanStartInitiative: canStartGroupInitiative(activeChallenge),
    groupPendingNames: group.phase === 'initiative'
      ? getPendingGroupParticipants(activeChallenge, rollToBeatTargets).map(nameOf).filter(Boolean)
      : [],
    groupOrder: group.phase === 'dueling'
      ? getGroupDisplayOrder(group)
          .map(id => ({ id, name: nameOf(id), isChampion: id === group.championId, isCurrent: id === group.queue[0] }))
          .filter(entry => !!entry.name)
      : [],
    groupChampionName: champion?.name ?? null,
    groupCurrentChallengerName: group.phase === 'dueling' && group.queue[0] ? nameOf(group.queue[0]) : null,
    // The champion was removed mid-duel: no Target, nobody can roll until the GM acts. Surfaced
    // so the frozen roll buttons have a visible explanation.
    groupNeedsChampion: group.phase === 'dueling' && !group.championId
  }
}

export class UserDicePool extends FormApplication {
  constructor() {
    super()

    this.dicePool = readDicePool()
  }

  static get defaultOptions () {
    return foundry.utils.mergeObject(super.defaultOptions, {
      id: 'user-dice-pool',
      template: 'systems/cortexprime-ext/templates/dice-pool.html',
      title: localizer('DicePool'),
      classes: ['cortexprime', 'user-dice-pool'],
      width: 600,
      height: 'auto',
      top: 500,
      left: 20,
      resizable: true,
      closeOnSubmit: false,
      submitOnClose: true,
      submitOnChange: true
    })
  }

  async getData () {
    const dice = readDicePool()
    const themes = game.settings.get('cortexprime-ext', 'themes')
    const theme = themes.current === 'custom' ? themes.custom : themes.list[themes.current]
    const activeChallenge = getActiveChallenge()
    const rollToBeatTargets = getRollToBeatTargets()
    const myInterfererId = getMyInterfererId()
    const myGroupRole = getMyGroupRollRole()
    const canRollToBeat = !!getMyResponderId() || !!myInterfererId || myGroupRole === 'duel'
    const challengeTarget = getMyChallengeTarget()
    const contestStarted = hasContestStarted(activeChallenge, hasInitiatorRolled(activeChallenge))
    const dicePoolInvalidResult = getDicePoolInvalidReason(dice.pool, !!dice.spendPlotPointForExtraDie)
    const dicePoolInvalidReason = dicePoolInvalidResult
      ? game.i18n.format(dicePoolInvalidResult.key, dicePoolInvalidResult.data)
      : null

    return {
      ...dice,
      isGM: game.user.isGM,
      theme,
      canRollToBeat,
      hasPlotPoints: !game.user.isGM && (game.user.character?.system.pp.value ?? 0) >= 1,
      dicePoolInvalidReason,
      // Covers both a bystander with no stake in the active challenge, and a designated
      // responder who shouldn't be able to dodge the "wait for the initiator" rule by rolling
      // with any of the other three roll types instead, AND the current pool's composition
      // being invalid to roll (Limit One / Mutually Exclusive / duplicate trait rules).
      rollButtonsDisabled: !canCurrentUserRoll() || !!dicePoolInvalidReason,
      showChallengeTarget: !!challengeTarget,
      challengeTargetTotal: challengeTarget?.total ?? 0,
      challengeTargetEffectDice: challengeTarget?.effectDice ?? [],
      isInterfering: !!myInterfererId,
      activeChallenge,
      // Only offered once the Contest is actually underway and nobody's currently interfering —
      // starting a second interference before the first is resumed isn't supported.
      eligibleInterferers: contestStarted && !activeChallenge.interference ? getEligibleInterferers() : [],
      interfererName: activeChallenge.interference
        ? rollToBeatTargets.find(target => target.id === activeChallenge.interference.interfererId)?.name
        : null,
      ...getChallengeDisplayData(activeChallenge, rollToBeatTargets),
      ...getGroupDisplayData(activeChallenge, rollToBeatTargets)
    }
  }

  async _updateObject (event, formData) {
    const currentDice = readDicePool()
    const newDice = foundry.utils.mergeObject(currentDice, foundry.utils.expandObject(formData))

    await game.user.setFlag('cortexprime-ext', 'dicePool', newDice)
  }

  activateListeners (html) {
    html.find('.add-trait-to-pool').click(this._addCustomTraitToPool.bind(this))
    html.find('.clear-dice-pool').click(this._clearDicePool.bind(this))
    html.find('.new-die').click(this._onNewDie.bind(this))
    html.find('.custom-dice-label').change(this.submit.bind(this))
    html.find('.die-select').change(this._onDieChange.bind(this))
    html.find('.die-select').on('mouseup', this._onDieRemove.bind(this))
    html.find('.remove-pool-trait').click(this._removePoolTrait.bind(this))
    html.find('.reset-custom-pool-trait').click(this._resetCustomPoolTrait.bind(this))
    html.find('.roll-dice-pool').click(this._rollDicePool.bind(this))
    html.find('.clear-source').click(this._clearSource.bind(this))
    html.find('.set-difficulty').click(this._setDifficulty.bind(this))
    html.find('.set-challenge-type').click(this._setChallengeType.bind(this))
    html.find('.challenge-initiator').change(this._onChallengeInitiatorChange.bind(this))
    html.find('.challenge-responder-checkbox').change(this._onChallengeResponderCheckboxChange.bind(this))
    html.find('.challenge-responder-radio').change(this._onChallengeResponderSelectChange.bind(this))
    html.find('.clear-challenge').click(this._clearChallenge.bind(this))
    html.find('.start-interference').click(this._startInterference.bind(this))
    html.find('.end-interference').click(this._endInterference.bind(this))
    html.find('.group-participant-checkbox').change(this._onGroupParticipantCheckboxChange.bind(this))
    html.find('.start-group-initiative').click(this._startGroupInitiative.bind(this))
    html.find('.remove-group-participant').click(this._removeGroupParticipant.bind(this))
    html.find('.spend-plot-point-extra-die').change(this._onSpendPlotPointExtraDieChange.bind(this))
  }

  async initPool () {
    await game.user.setFlag('cortexprime-ext', 'dicePool', null)
    await game.user.setFlag('cortexprime-ext', 'dicePool', this.dicePool)
  }

  // Explicit read-modify-write, matching every other button/handler in this tray, rather than
  // relying on the generic submitOnChange flow — that flow doesn't re-render (by design, so
  // typing/selecting elsewhere doesn't get interrupted), so any other button's own
  // getFlag-then-setFlag round trip can race ahead of it and save over an in-flight checkbox
  // change, silently reverting the checkbox on the tray's next render.
  async _onSpendPlotPointExtraDieChange (event) {
    event.preventDefault()
    event.stopPropagation()

    const currentDice = readDicePool()

    foundry.utils.setProperty(currentDice, 'spendPlotPointForExtraDie', event.currentTarget.checked)

    await game.user.setFlag('cortexprime-ext', 'dicePool', null)
    await game.user.setFlag('cortexprime-ext', 'dicePool', currentDice)

    // The Limit One threshold (1 vs 2 dice from a single Trait Set) depends on this checkbox, so
    // the pool's validity — and therefore the roll buttons/warning message — must be recomputed
    // immediately, the same as every other pool-mutating handler in this tray.
    await this.render(true)
  }

  async _addCustomTraitToPool (event) {
    event.preventDefault()

    const currentDice = readDicePool()
    const currentCustomLength = getLength(currentDice.pool.custom ?? {})

    foundry.utils.setProperty(currentDice, `pool.custom.${currentCustomLength}`, currentDice.customAdd)

    foundry.utils.setProperty(currentDice, `customAdd`, {
      label: '',
      value: { 0: '8' }
    })

    await game.user.setFlag('cortexprime-ext', 'dicePool', null)

    await game.user.setFlag('cortexprime-ext', 'dicePool', currentDice)

    await this.render(true)
  }

  async _addTraitToPool (source, label, value, traitPath = null, traitSetId = null) {
    const currentDice = readDicePool()
    const currentDiceLength = getLength(currentDice.pool[source] || {})
    foundry.utils.setProperty(currentDice, `pool.${source}.${currentDiceLength}`, { label, value, traitPath, traitSetId })

    await game.user.setFlag('cortexprime-ext', 'dicePool', null)

    await game.user.setFlag('cortexprime-ext', 'dicePool', currentDice)

    await this.render(true)
  }

  async _setDifficulty (event) {
    event.preventDefault()

    const { faces } = event.currentTarget.dataset
    const currentDice = readDicePool()

    foundry.utils.setProperty(currentDice, 'pool.Difficulty', {
      0: { label: '', value: { 0: faces, 1: faces } }
    })

    await game.user.setFlag('cortexprime-ext', 'dicePool', null)

    await game.user.setFlag('cortexprime-ext', 'dicePool', currentDice)

    await this.render(true)
  }

  async _clearDicePool (event, { preserveCrisisPool = false } = {}) {
    if (event) event.preventDefault()

    // The Crisis Pool is a standing resource the GM keeps rolling with, not a one-shot trait
    // addition — a roll shouldn't wipe it out along with everything else.
    const crisisPoolSource = preserveCrisisPool
      ? game.user.getFlag('cortexprime-ext', 'dicePool')?.pool?.[CRISIS_POOL_SOURCE]
      : undefined

    await game.user.setFlag('cortexprime-ext', 'dicePool', null)

    await game.user.setFlag('cortexprime-ext', 'dicePool', crisisPoolSource
      ? { ...blankPool, pool: { [CRISIS_POOL_SOURCE]: crisisPoolSource } }
      : blankPool)

    await this.render(true)
  }

  async _clearSource (event) {
    event.preventDefault()
    const { source } = event.currentTarget.dataset
    const currentDice = readDicePool()

    await game.user.setFlag('cortexprime-ext', 'dicePool', null)

    currentDice.pool = objectFilter(currentDice.pool, (_, dieSource) => source !== dieSource)

    await game.user.setFlag('cortexprime-ext', 'dicePool', currentDice)

    await this.render(true)
  }

  async _onDieChange (event) {
    event.preventDefault()
    const currentDice = readDicePool()
    const $targetDieSelect = $(event.currentTarget)
    const target = $targetDieSelect.data('target')
    const targetKey = $targetDieSelect.data('key')
    const targetValue = $targetDieSelect.val()
    const dataTargetValue = foundry.utils.getProperty(currentDice, `${target}.value`) || {}

    await this.submit()

    await game.user.setFlag('cortexprime-ext', 'dicePool', null)

    foundry.utils.setProperty(currentDice, `${target}.value`, objectMapValues(dataTargetValue, (value, index) => parseInt(index, 10) === parseInt(targetKey, 10) ? targetValue : value))

    await game.user.setFlag('cortexprime-ext', 'dicePool', currentDice)

    await this.render(true)
  }

  async _onDieRemove (event) {
    event.preventDefault()

    if (event.button === 2) {
      const currentDice = readDicePool()
      const $targetDieSelect = $(event.currentTarget)
      const target = $targetDieSelect.data('target')
      const targetKey = $targetDieSelect.data('key')
      const dataTargetValue = foundry.utils.getProperty(currentDice, `${target}.value`) || {}

      await this.submit()

      await game.user.setFlag('cortexprime-ext', 'dicePool', null)

      foundry.utils.setProperty(currentDice, `${target}.value`, objectReindexFilter(dataTargetValue, (_, index) => parseInt(index, 10) !== parseInt(targetKey, 10)))

      await game.user.setFlag('cortexprime-ext', 'dicePool', currentDice)

      await this.render(true)
    }
  }

  async _onNewDie (event) {
    event.preventDefault()
    const currentDice = readDicePool()
    const $targetNewDie = $(event.currentTarget)
    const target = $targetNewDie.data('target')
    const dataTargetValue = foundry.utils.getProperty(currentDice, `${target}.value`) || {}
    const currentLength = getLength(dataTargetValue)
    const lastValue = dataTargetValue[currentLength - 1] || '8'

    foundry.utils.setProperty(currentDice, `${target}.value`, { ...dataTargetValue, [currentLength]: lastValue })

    await game.user.setFlag('cortexprime-ext', 'dicePool', null)

    await game.user.setFlag('cortexprime-ext', 'dicePool', currentDice)

    await this.render(true)
  }

  async _removePoolTrait (event) {
    event.preventDefault()
    const $target = $(event.currentTarget)
    const source = $target.data('source')
    let currentDicePool = readDicePool()

    if (getLength(currentDicePool.pool[source] || {}) < 2) {
      delete currentDicePool.pool[source]
    } else {
      delete currentDicePool.pool[source][$target.data('key')]
      currentDicePool.pool[source] = objectReindexFilter(currentDicePool.pool[source], (_, index) => parseInt(index, 10) !== parseInt($target.data('key'), 10))
    }

    await game.user.setFlag('cortexprime-ext', 'dicePool', null)
    await game.user.setFlag('cortexprime-ext', 'dicePool', currentDicePool)

    this.render(true)
  }

  async _resetCustomPoolTrait (event) {
    event.preventDefault()

    const currentDice = readDicePool()

    foundry.utils.setProperty(currentDice, 'customAdd', {
      label: '',
      value: { 0: '8' }
    })

    await game.user.setFlag('cortexprime-ext', 'dicePool', null)

    await game.user.setFlag('cortexprime-ext', 'dicePool', currentDice)

    await this.render(true)
  }

  async _setPool (pool) {
    const currentDice = readDicePool()

    foundry.utils.setProperty(currentDice, 'pool', pool)

    await game.user.setFlag('cortexprime-ext', 'dicePool', null)

    await game.user.setFlag('cortexprime-ext', 'dicePool', currentDice)

    await this.render(true)
  }

  async _setChallengeType (event) {
    event.preventDefault()

    const { type } = event.currentTarget.dataset

    await setChallengeType(type)

    await this.render(true)
  }

  async _onChallengeInitiatorChange (event) {
    event.preventDefault()

    // Second layer of protection beyond the radio's disabled state, matching _rollDicePool's
    // approach — a stale render shouldn't let a reassignment through once a Contest is underway.
    const activeChallenge = getActiveChallenge()
    if (hasContestStarted(activeChallenge, hasInitiatorRolled(activeChallenge))) return

    await setChallengeInitiator(event.currentTarget.value)

    await this.render(true)
  }

  async _onChallengeResponderCheckboxChange (event) {
    event.preventDefault()

    const responderIds = this.element.find('.challenge-responder-checkbox:checked').get().map(el => el.value)

    await setChallengeResponders(responderIds)

    await this.render(true)
  }

  async _onChallengeResponderSelectChange (event) {
    event.preventDefault()

    // Second layer of protection beyond the radio's disabled state, matching _rollDicePool's
    // approach — a stale render shouldn't let a reassignment through once a Contest is underway.
    const activeChallenge = getActiveChallenge()
    if (hasContestStarted(activeChallenge, hasInitiatorRolled(activeChallenge))) return

    const { value } = event.currentTarget

    await setChallengeResponders(value ? [value] : [])

    await this.render(true)
  }

  async _clearChallenge (event) {
    event.preventDefault()

    await clearActiveChallenge()

    await this.render(true)
  }

  async _startInterference (event) {
    event.preventDefault()

    const activeChallenge = getActiveChallenge()

    // Defense-in-depth, matching the radio-lock guards above — the button is only rendered once
    // the Contest has started and nothing is already interfering, but a stale render shouldn't
    // be able to stack a second interference on top of one already in progress.
    if (!hasContestStarted(activeChallenge, hasInitiatorRolled(activeChallenge)) || activeChallenge.interference) return

    const interfererId = this.element.find('.interferer-radio:checked').val()

    if (!interfererId) return

    await startInterference(interfererId)

    await this.render(true)
  }

  async _endInterference (event) {
    event.preventDefault()

    await endInterference()

    await this.render(true)
  }

  async _onGroupParticipantCheckboxChange (event) {
    event.preventDefault()

    const participantIds = this.element.find('.group-participant-checkbox:checked').get().map(el => el.value)

    await setGroupParticipants(participantIds)

    await this.render(true)
  }

  async _startGroupInitiative (event) {
    event.preventDefault()

    // Defense-in-depth, matching _startInterference above — the button is only rendered once
    // the roster is big enough, but a stale render shouldn't be able to start with fewer.
    if (!canStartGroupInitiative(getActiveChallenge())) return

    await startGroupInitiative()

    await this.render(true)
  }

  async _removeGroupParticipant (event) {
    event.preventDefault()

    const activeChallenge = getActiveChallenge()

    if (activeChallenge.type !== 'group' || activeChallenge.group?.phase !== 'dueling') return

    await removeGroupParticipant(event.currentTarget.dataset.id)

    await this.render(true)
  }

  async _rollDicePool (event) {
    event.preventDefault()

    // Second layer of protection beyond the buttons' disabled state — a bystander can't roll
    // into someone else's Test/Contest, and a designated responder can't roll at all (by any
    // of the four roll types) until the initiator has actually rolled, even from a stale render.
    if (!canCurrentUserRoll()) return

    const $target = $(event.currentTarget)

    const currentDicePool = readDicePool()

    const dicePool = currentDicePool.pool

    const rollType = $target.hasClass('roll-for-total')
      ? 'total'
      : $target.hasClass('roll-for-effect')
        ? 'effect'
        : $target.hasClass('roll-to-beat')
          ? 'toBeat'
          : 'select'

    const targetTotal = rollType === 'toBeat'
      ? getTargetTotal(getMyBeatTargetId())
      : undefined

    await rollDice.call(this, dicePool, rollType, targetTotal, !!currentDicePool.spendPlotPointForExtraDie)
  }

  async toggle () {
    if (!this.rendered) {
      if (game.user.isGM) await this._mergeCrisisPool()
      await this.render(true)
    } else {
      this.close()
    }
  }

  // For when the crisis pool changes while the GM already has their tray open — a roll
  // reducing it (a die eliminated or stepped down) should show up right away rather than
  // sitting stale until the tray is closed and reopened, so this fully resyncs the tray's
  // CrisisPool entry to match, unlike _mergeCrisisPool's additive-only "top up" behavior.
  async refreshCrisisPool () {
    if (!game.user.isGM || !this.rendered) return

    await this._syncCrisisPool()
    await this.render(true)
  }

  // Fully overwrites the GM's CrisisPool source with the crisis pool's current dice — used for
  // the live-refresh case above. Removes the source once the crisis has ended, same as
  // _mergeCrisisPool, so a resolved crisis doesn't linger in the tray.
  async _syncCrisisPool () {
    const crisis = getCrisisPool()

    if (!crisis.active || crisis.dice.length === 0) {
      await this._removeCrisisPool()
      return
    }

    const currentDice = readDicePool()
    const value = crisis.dice.reduce((acc, face, index) => ({ ...acc, [index]: String(face) }), {})

    foundry.utils.setProperty(currentDice, `pool.${CRISIS_POOL_SOURCE}`, { 0: { label: crisis.name, value } })

    await game.user.setFlag('cortexprime-ext', 'dicePool', null)
    await game.user.setFlag('cortexprime-ext', 'dicePool', currentDice)
  }

  // Tops up the GM's CrisisPool source with any crisis dice not currently present (by face
  // count), so dice the GM has manually removed stay removed until the tray is closed and
  // reopened, per the "if not already present" rule. Removes the source instead once the
  // crisis has ended, so reopening the tray after a resolved crisis doesn't leave it behind.
  async _mergeCrisisPool () {
    const crisis = getCrisisPool()

    if (!crisis.active || crisis.dice.length === 0) {
      await this._removeCrisisPool()
      return
    }

    const currentDice = readDicePool()
    const existingRow = currentDice.pool[CRISIS_POOL_SOURCE]?.[0]
    const existingFaces = existingRow ? Object.values(existingRow.value).map(face => parseInt(face, 10)) : []

    const missingDice = [...crisis.dice]

    for (const face of existingFaces) {
      const index = missingDice.indexOf(face)
      if (index !== -1) missingDice.splice(index, 1)
    }

    if (missingDice.length === 0) return

    const mergedFaces = [...existingFaces, ...missingDice]
    const value = mergedFaces.reduce((acc, face, index) => ({ ...acc, [index]: String(face) }), {})

    foundry.utils.setProperty(currentDice, `pool.${CRISIS_POOL_SOURCE}`, { 0: { label: crisis.name, value } })

    await game.user.setFlag('cortexprime-ext', 'dicePool', null)
    await game.user.setFlag('cortexprime-ext', 'dicePool', currentDice)
  }

  // Removes the GM's CrisisPool source entirely — used once a crisis has ended (either the
  // pool ran dry or the GM ended it manually), so it doesn't linger in the tray as dead weight.
  async _removeCrisisPool () {
    const currentDice = readDicePool()

    if (!currentDice.pool[CRISIS_POOL_SOURCE]) return

    delete currentDice.pool[CRISIS_POOL_SOURCE]

    await game.user.setFlag('cortexprime-ext', 'dicePool', null)
    await game.user.setFlag('cortexprime-ext', 'dicePool', currentDice)
  }
}