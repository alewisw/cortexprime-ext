import { confirmAction, localizer, showPlotPointAnimation } from '../scripts/foundryHelpers.js'
import { CortexApplicationV2 } from './CortexApplicationV2.js'
import { getLength, objectFilter, objectMapValues, objectReindexFilter } from '../../lib/helpers.js'
import rollDice from '../scripts/rollDice.js'
import { runExclusive } from '../scripts/asyncMutex.js'
import { getCrisisPool } from '../scripts/crisisPool.js'
import { getDicePoolInvalidReason } from '../scripts/dicePoolValidation.js'
import { applyTraitToPool } from '../scripts/dicePoolTraitLogic.js'
import { getChallengeDisplayData, getEligibleRollerIds, getGroupDisplayData } from './userDicePoolLogic.js'
import {
  canCurrentUserRoll,
  canStartGroupInitiative,
  clearActiveChallenge,
  endInterference,
  getActiveChallenge,
  getEligibleInterferers,
  getMyBeatTargetId,
  getMyChallengeTarget,
  getMyGroupRollRole,
  getMyInterfererId,
  getMyResponderId,
  getRollToBeatTargets,
  getTargetRecord,
  getTargetTotal,
  hasContestStarted,
  hasInitiatorRolled,
  recordRollResult,
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

const DICE_POOL_KEY = 'dicePool'

// Every handler below reads the current pool, mutates a copy, and writes it back whole - fine for
// a human, who naturally waits for a re-render before the next click, but two of these firing
// close together (e.g. automated UI actions) can interleave: the second one's read lands before
// the first one's write has, so its write clobbers the first with a stale base and silently
// drops whatever it just did (observed as a die going missing from a pool built by a quick
// succession of "add die" clicks). Routing every mutation through this queues them (see
// asyncMutex.js) so that can't happen.
//
// `mutator` receives the current pool and returns the value to write, or `undefined` to write
// nothing. `reset` matches each call site's original write shape: most handlers null the flag
// before setting it (so a shrinking object actually loses keys instead of Foundry's update()
// merge silently keeping them), but the form submit handler's own submitOnChange flow wants a
// plain merge
// instead, same as before this existed.
const updateDicePool = (mutator, { reset = true } = {}) => runExclusive(DICE_POOL_KEY, async () => {
  const next = await mutator(readDicePool())

  if (next === undefined) return next

  if (reset) await game.user.setFlag('cortexprime-ext', 'dicePool', null)
  await game.user.setFlag('cortexprime-ext', 'dicePool', next)

  return next
})

export class UserDicePool extends CortexApplicationV2 {
  constructor() {
    super()

    this.dicePool = readDicePool()
  }

  // The handlers below stay ordinary instance methods rather than becoming static private
  // ones: several are called from outside the class (rollDice.js reaches _clearDicePool,
  // actor-sheet.js reaches _setTraitInPool), and ApplicationV2 invokes an action through
  // handler.call(this, event, target), so a prototype method is exactly the right shape.
  static DEFAULT_OPTIONS = {
    id: 'user-dice-pool',
    classes: ['user-dice-pool'],
    tag: 'form',
    position: { width: 600, height: 'auto', top: 500, left: 20 },
    // A localization key, not a localized string: DEFAULT_OPTIONS is evaluated at module
    // load, before game.i18n exists.
    window: { title: 'DicePool', resizable: true },
    form: {
      handler: UserDicePool.#onSubmit,
      submitOnChange: true,
      closeOnSubmit: false
    },
    actions: {
      addTraitToPool: UserDicePool.prototype._addCustomTraitToPool,
      clearChallenge: UserDicePool.prototype._clearChallenge,
      clearDicePool: UserDicePool.prototype._clearDicePool,
      clearSource: UserDicePool.prototype._clearSource,
      endInterference: UserDicePool.prototype._endInterference,
      giveIn: UserDicePool.prototype._giveIn,
      newDie: UserDicePool.prototype._onNewDie,
      removeGroupParticipant: UserDicePool.prototype._removeGroupParticipant,
      removePoolTrait: UserDicePool.prototype._removePoolTrait,
      requestReroll: UserDicePool.prototype._requestReroll,
      resetCustomPoolTrait: UserDicePool.prototype._resetCustomPoolTrait,
      rollDicePool: UserDicePool.prototype._rollDicePool,
      setChallengeType: UserDicePool.prototype._setChallengeType,
      setDifficulty: UserDicePool.prototype._setDifficulty,
      startGroupInitiative: UserDicePool.prototype._startGroupInitiative,
      startInterference: UserDicePool.prototype._startInterference
    }
  }

  static PARTS = {
    form: { template: 'systems/cortexprime-ext/templates/dice-pool.html' }
  }

  async _prepareContext (options) {
    const dice = readDicePool()
    const activeChallenge = getActiveChallenge()
    const rollToBeatTargets = getRollToBeatTargets()
    const myInterfererId = getMyInterfererId()
    const myGroupRole = getMyGroupRollRole()
    const canRollToBeat = !!getMyResponderId() || !!myInterfererId || myGroupRole === 'duel'
    // Conceding only makes sense against a single named opponent - not offered for a Test (no
    // one opponent to give in to) or to the GM (Plot Points aren't a GM concept in this system,
    // same reasoning as hasPlotPoints below).
    const showGiveIn = !game.user.isGM && (
      (activeChallenge.type === 'contest' && !!getMyResponderId()) ||
      (activeChallenge.type === 'group' && myGroupRole === 'duel')
    )
    const challengeTarget = getMyChallengeTarget()
    // Resolved once here and threaded into the display logic below, which is pure and can't
    // read live Foundry state for itself.
    const initiatorHasRolled = hasInitiatorRolled(activeChallenge)
    const contestStarted = hasContestStarted(activeChallenge, initiatorHasRolled)
    const dicePoolInvalidResult = getDicePoolInvalidReason(dice.pool, !!dice.spendPlotPointForExtraDie)
    const dicePoolInvalidReason = dicePoolInvalidResult
      ? game.i18n.format(dicePoolInvalidResult.key, dicePoolInvalidResult.data)
      : null
    const eligibleRollerIds = getEligibleRollerIds(activeChallenge, initiatorHasRolled)
    const selectingRollers = rollToBeatTargets
      .filter(target => target.id !== 'gm' && eligibleRollerIds.includes(target.id))
      .filter(target => !!game.actors.get(target.id)?.getFlag('cortexprime-ext', 'dicePickerOpen'))
      .map(({ id, name }) => ({ id, name }))

    return {
      ...await super._prepareContext(options),
      ...dice,
      isGM: game.user.isGM,
      canRollToBeat,
      hasPlotPoints: !game.user.isGM && (game.user.character?.system.pp.value ?? 0) >= 1,
      dicePoolInvalidReason,
      // Covers both a bystander with no stake in the active challenge, and a designated
      // responder who shouldn't be able to dodge the "wait for the initiator" rule by rolling
      // with any of the other three roll types instead, AND the current pool's composition
      // being invalid to roll (Limit One / Mutually Exclusive / duplicate trait rules).
      rollButtonsDisabled: !canCurrentUserRoll() || !!dicePoolInvalidReason,
      showGiveIn,
      // Deliberately not rollButtonsDisabled - giving in doesn't involve rolling the pool at
      // all, so an invalid pool composition shouldn't block it the way it blocks actually rolling.
      giveInDisabled: !canCurrentUserRoll(),
      showChallengeTarget: !!challengeTarget,
      challengeTargetTotal: challengeTarget?.total ?? 0,
      challengeTargetEffectDice: challengeTarget?.effectDice ?? [],
      isInterfering: !!myInterfererId,
      activeChallenge,
      selectingRollers,
      // Only offered once the Contest is actually underway and nobody's currently interfering —
      // starting a second interference before the first is resumed isn't supported.
      eligibleInterferers: contestStarted && !activeChallenge.interference ? getEligibleInterferers() : [],
      interfererName: activeChallenge.interference
        ? rollToBeatTargets.find(target => target.id === activeChallenge.interference.interfererId)?.name
        : null,
      ...getChallengeDisplayData(activeChallenge, rollToBeatTargets, initiatorHasRolled),
      ...getGroupDisplayData(activeChallenge, rollToBeatTargets)
    }
  }

  // reset:false because this is a plain merge of the form's own fields, unlike the handlers
  // below which null the flag first so a shrinking object actually loses its keys.
  static async #onSubmit (event, form, formData) {
    await updateDicePool(
      current => foundry.utils.mergeObject(current, foundry.utils.expandObject(formData.object)),
      { reset: false }
    )
  }

  // appv1's submitOnClose has no ApplicationV2 equivalent. _preClose is awaited while the
  // form still exists, so a custom label typed and then closed without blurring is committed.
  async _preClose (options) {
    if (this.form) await this.submit()

    return super._preClose(options)
  }

  // Only the non-click controls remain wired here; every button is an `actions` entry.
  //
  // Note the super call. The appv1 version deliberately did NOT call super.activateListeners,
  // but _onRender is part of ApplicationV2's render pipeline and must always be chained.
  //
  // The custom label field is no longer bound explicitly either: form.submitOnChange commits
  // every field in the form on change, which is exactly what that binding duplicated.
  _onRender (context, options) {
    super._onRender(context, options)

    const onChange = (selector, handler) => {
      for (const element of this.element.querySelectorAll(selector)) {
        element.addEventListener('change', handler)
      }
    }

    onChange('.challenge-initiator', this._onChallengeInitiatorChange.bind(this))
    onChange('.challenge-responder-checkbox', this._onChallengeResponderCheckboxChange.bind(this))
    onChange('.challenge-responder-radio', this._onChallengeResponderSelectChange.bind(this))
    onChange('.group-participant-checkbox', this._onGroupParticipantCheckboxChange.bind(this))
    onChange('.spend-plot-point-extra-die', this._onSpendPlotPointExtraDieChange.bind(this))

    for (const select of this.element.querySelectorAll('.die-select')) {
      select.addEventListener('change', this._onDieChange.bind(this))
      select.addEventListener('mouseup', this._onDieRemove.bind(this))
    }
  }

  async _requestReroll (event, target) {
    event.preventDefault()
    const { actorId } = target.dataset
    await game.settings.set('cortexprime-ext', 'dicePickerRerollRequest', { actorId, requestedAt: Date.now() })
  }

  async initPool () {
    await updateDicePool(() => this.dicePool)

    // A "Select Your Dice" dialog can't survive a page load - if this user's browser closed or
    // refreshed while one was open (see dicePickerOpen in rollDice.js), the flag never got
    // cleared and the GM's SELECTING row would otherwise stay stuck on forever.
    if (game.user.character) {
      try {
        await game.user.character.unsetFlag('cortexprime-ext', 'dicePickerOpen')
      } catch (error) {
        console.warn('CP | Could not clear stale dice picker open flag', error)
      }
    }
  }

  // Read-modify-write, queued via updateDicePool along with every other handler in this tray
  // (see its definition above) — any two of these firing close together would otherwise race:
  // whichever's write lands second wins outright, silently reverting whatever the other one did.
  async _onSpendPlotPointExtraDieChange (event) {
    event.preventDefault()
    event.stopPropagation()

    const checked = event.currentTarget.checked

    await updateDicePool(current => {
      foundry.utils.setProperty(current, 'spendPlotPointForExtraDie', checked)
      return current
    })

    // The Limit One threshold (1 vs 2 dice from a single Trait Set) depends on this checkbox, so
    // the pool's validity — and therefore the roll buttons/warning message — must be recomputed
    // immediately, the same as every other pool-mutating handler in this tray.
    await this.render(true)
  }

  async _addCustomTraitToPool (event, target) {
    event.preventDefault()

    await updateDicePool(current => {
      const currentCustomLength = getLength(current.pool.custom ?? {})

      foundry.utils.setProperty(current, `pool.custom.${currentCustomLength}`, current.customAdd)

      foundry.utils.setProperty(current, `customAdd`, {
        label: '',
        value: { 0: '8' }
      })

      return current
    })

    await this.render(true)
  }

  // Every trait control on the actor sheet (the plain "add to pool" click and the Hinder click)
  // routes through this: they differ only in the value/hindered state they ask for.
  // applyTraitToPool decides whether that lands as a fresh entry or a correction to whatever's
  // already in the pool for this trait — see dicePoolTraitLogic.js for the exact rule.
  async _setTraitInPool (source, { label, value, traitPath = null, traitSetId = null, hindered = false }) {
    await updateDicePool(current => {
      current.pool = applyTraitToPool(current.pool, { source, traitPath, label, value, traitSetId, hindered })
      return current
    })

    await this.render(true)
  }

  async _setDifficulty (event, target) {
    event.preventDefault()

    const { faces } = target.dataset

    await updateDicePool(current => {
      foundry.utils.setProperty(current, 'pool.Difficulty', {
        0: { label: '', value: { 0: faces, 1: faces } }
      })

      return current
    })

    await this.render(true)
  }

  async _clearDicePool (event, { preserveCrisisPool = false } = {}) {
    if (event) event.preventDefault()

    await updateDicePool(current => {
      // The Crisis Pool is a standing resource the GM keeps rolling with, not a one-shot trait
      // addition — a roll shouldn't wipe it out along with everything else.
      const crisisPoolSource = preserveCrisisPool ? current?.pool?.[CRISIS_POOL_SOURCE] : undefined

      return crisisPoolSource
        ? { ...blankPool, pool: { [CRISIS_POOL_SOURCE]: crisisPoolSource } }
        : blankPool
    })

    await this.render(true)
  }

  async _clearSource (event, target) {
    event.preventDefault()
    const { source } = target.dataset

    await updateDicePool(current => {
      current.pool = objectFilter(current.pool, (_, dieSource) => source !== dieSource)
      return current
    })

    await this.render(true)
  }

  async _onDieChange (event) {
    event.preventDefault()
    const dieSelect = event.currentTarget
    const target = dieSelect.dataset.target
    const targetKey = dieSelect.dataset.key
    const targetValue = dieSelect.value

    await this.submit()

    // Reads current state fresh, AFTER submit()'s own write has landed (rather than a copy taken
    // before it) — otherwise this handler's own write would silently clobber submit()'s, using a
    // base that predates it.
    await updateDicePool(current => {
      const dataTargetValue = foundry.utils.getProperty(current, `${target}.value`) || {}

      foundry.utils.setProperty(current, `${target}.value`, objectMapValues(dataTargetValue, (value, index) => parseInt(index, 10) === parseInt(targetKey, 10) ? targetValue : value))

      return current
    })

    await this.render(true)
  }

  async _onDieRemove (event) {
    event.preventDefault()

    if (event.button === 2) {
      const dieSelect = event.currentTarget
      const target = dieSelect.dataset.target
      const targetKey = dieSelect.dataset.key

      await this.submit()

      // Same reasoning as _onDieChange above — read fresh, after submit()'s write has landed.
      await updateDicePool(current => {
        const dataTargetValue = foundry.utils.getProperty(current, `${target}.value`) || {}

        foundry.utils.setProperty(current, `${target}.value`, objectReindexFilter(dataTargetValue, (_, index) => parseInt(index, 10) !== parseInt(targetKey, 10)))

        return current
      })

      await this.render(true)
    }
  }

  async _onNewDie (event, button) {
    event.preventDefault()
    const target = button.dataset.target

    await updateDicePool(current => {
      const dataTargetValue = foundry.utils.getProperty(current, `${target}.value`) || {}
      const currentLength = getLength(dataTargetValue)
      const lastValue = dataTargetValue[currentLength - 1] || '8'

      foundry.utils.setProperty(current, `${target}.value`, { ...dataTargetValue, [currentLength]: lastValue })

      return current
    })

    await this.render(true)
  }

  async _removePoolTrait (event, target) {
    event.preventDefault()
    const { source, key } = target.dataset

    await updateDicePool(current => {
      if (getLength(current.pool[source] || {}) < 2) {
        delete current.pool[source]
      } else {
        delete current.pool[source][key]
        current.pool[source] = objectReindexFilter(current.pool[source], (_, index) => parseInt(index, 10) !== parseInt(key, 10))
      }

      return current
    })

    this.render(true)
  }

  async _resetCustomPoolTrait (event, target) {
    event.preventDefault()

    await updateDicePool(current => {
      foundry.utils.setProperty(current, 'customAdd', {
        label: '',
        value: { 0: '8' }
      })

      return current
    })

    await this.render(true)
  }

  async _setPool (pool) {
    await updateDicePool(current => {
      foundry.utils.setProperty(current, 'pool', pool)
      return current
    })

    await this.render(true)
  }

  async _setChallengeType (event, target) {
    event.preventDefault()

    const { type } = target.dataset

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

    const responderIds = [...this.element.querySelectorAll('.challenge-responder-checkbox:checked')].map(el => el.value)

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

  async _clearChallenge (event, target) {
    event.preventDefault()

    await clearActiveChallenge()

    await this.render(true)
  }

  async _startInterference (event, target) {
    event.preventDefault()

    const activeChallenge = getActiveChallenge()

    // Defense-in-depth, matching the radio-lock guards above — the button is only rendered once
    // the Contest has started and nothing is already interfering, but a stale render shouldn't
    // be able to stack a second interference on top of one already in progress.
    if (!hasContestStarted(activeChallenge, hasInitiatorRolled(activeChallenge)) || activeChallenge.interference) return

    const interfererId = this.element.querySelector('.interferer-radio:checked')?.value

    if (!interfererId) return

    await startInterference(interfererId)

    await this.render(true)
  }

  async _endInterference (event, target) {
    event.preventDefault()

    await endInterference()

    await this.render(true)
  }

  async _onGroupParticipantCheckboxChange (event) {
    event.preventDefault()

    const participantIds = [...this.element.querySelectorAll('.group-participant-checkbox:checked')].map(el => el.value)

    await setGroupParticipants(participantIds)

    await this.render(true)
  }

  async _startGroupInitiative (event, target) {
    event.preventDefault()

    // Defense-in-depth, matching _startInterference above — the button is only rendered once
    // the roster is big enough, but a stale render shouldn't be able to start with fewer.
    if (!canStartGroupInitiative(getActiveChallenge())) return

    await startGroupInitiative()

    await this.render(true)
  }

  async _removeGroupParticipant (event, target) {
    event.preventDefault()

    const activeChallenge = getActiveChallenge()

    if (activeChallenge.type !== 'group' || activeChallenge.group?.phase !== 'dueling') return

    await removeGroupParticipant(target.dataset.id)

    await this.render(true)
  }

  // Concedes the active Contest/Group without rolling: gains a Plot Point, takes the current
  // opponent's effect dice as the consequence (the same dice already shown in the "Failure
  // Effect Dice" preview), and records the loss exactly like a real roll would - recordRollResult
  // fires the same updateActor/setting hooks a real roll fires, so processChallengeAdvancement/
  // processGroupAdvancement (rollToBeat.js) resolve it on the GM's client without any extra code
  // here. An empty effectDice array is already the floor D4 everywhere else in that pipeline
  // (applyContestEffectStepDown), so giving in can never step down the opponent's effect die.
  async _giveIn (event, target) {
    event.preventDefault()

    if (game.user.isGM) return

    const actor = game.user.character

    if (!actor) return

    // Defense-in-depth, matching _removeGroupParticipant/_startGroupInitiative above.
    if (!canCurrentUserRoll()) return

    const opponentId = getMyBeatTargetId()
    const effectDice = opponentId ? (getTargetRecord(opponentId)?.effectDice ?? []) : []

    const confirmed = await confirmAction({
      content: localizer('GiveInConfirm')
    })

    if (!confirmed) return

    const content = await foundry.applications.handlebars.renderTemplate(
      'systems/cortexprime-ext/templates/chat/give-in.html',
      { actorName: actor.name, effectDice: effectDice.length ? effectDice : [4] }
    )

    await ChatMessage.create({ content })

    try {
      await actor.changePpBy(1, false, localizer('GiveInPlotPointReason'))
      showPlotPointAnimation(1)
    } catch (error) {
      console.warn('CP | Give In: could not award Plot Point', error)
    }

    await recordRollResult({ total: 0, effectDice: [], won: false, dice: [], poolEntries: [], rolledAt: Date.now() })

    await this.render(true)
  }

  async _rollDicePool (event, target) {
    event.preventDefault()

    // Second layer of protection beyond the buttons' disabled state — a bystander can't roll
    // into someone else's Test/Contest, and a designated responder can't roll at all (by any
    // of the four roll types) until the initiator has actually rolled, even from a stale render.
    if (!canCurrentUserRoll()) return

    const currentDicePool = readDicePool()

    const dicePool = currentDicePool.pool

    const rollType = target.classList.contains('roll-for-total')
      ? 'total'
      : target.classList.contains('roll-for-effect')
        ? 'effect'
        : target.classList.contains('roll-to-beat')
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

    const value = crisis.dice.reduce((acc, face, index) => ({ ...acc, [index]: String(face) }), {})

    await updateDicePool(current => {
      foundry.utils.setProperty(current, `pool.${CRISIS_POOL_SOURCE}`, { 0: { label: crisis.name, value } })
      return current
    })
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

    await updateDicePool(current => {
      const existingRow = current.pool[CRISIS_POOL_SOURCE]?.[0]
      const existingFaces = existingRow ? Object.values(existingRow.value).map(face => parseInt(face, 10)) : []

      const missingDice = [...crisis.dice]

      for (const face of existingFaces) {
        const index = missingDice.indexOf(face)
        if (index !== -1) missingDice.splice(index, 1)
      }

      if (missingDice.length === 0) return undefined

      const mergedFaces = [...existingFaces, ...missingDice]
      const value = mergedFaces.reduce((acc, face, index) => ({ ...acc, [index]: String(face) }), {})

      foundry.utils.setProperty(current, `pool.${CRISIS_POOL_SOURCE}`, { 0: { label: crisis.name, value } })

      return current
    })
  }

  // Removes the GM's CrisisPool source entirely — used once a crisis has ended (either the
  // pool ran dry or the GM ended it manually), so it doesn't linger in the tray as dead weight.
  async _removeCrisisPool () {
    await updateDicePool(current => {
      if (!current.pool[CRISIS_POOL_SOURCE]) return undefined

      delete current.pool[CRISIS_POOL_SOURCE]

      return current
    })
  }
}