import { getCurrentTheme, localizer } from '../scripts/foundryHelpers.js'
import { applyHitchOutcomes, getComplications, getDoomPool } from '../scripts/hitches.js'
import { ComplicationDialog } from './ComplicationDialog.js'
import {
  DOOM_DIE_STEP_OPTIONS,
  HITCH_ACTIONS,
  computePlotPoints,
  computeProjection,
  getAvailableActions,
  getComplicationOptions,
  hasHitchOutcomes,
  isBotch,
  isHitch
} from '../scripts/hitchesLogic.js'

const ACTION_LABEL_KEYS = {
  [HITCH_ACTIONS.NONE]: 'HitchActionNone',
  [HITCH_ACTIONS.INTRODUCE_COMPLICATION]: 'HitchActionIntroduceComplication',
  [HITCH_ACTIONS.STEP_UP_COMPLICATION]: 'HitchActionStepUpComplication',
  [HITCH_ACTIONS.INTRODUCE_SCENE_COMPLICATION]: 'HitchActionIntroduceSceneComplication',
  [HITCH_ACTIONS.STEP_UP_SCENE_COMPLICATION]: 'HitchActionStepUpSceneComplication',
  [HITCH_ACTIONS.ADD_DOOM_DIE]: 'HitchActionAddDoomDie',
  [HITCH_ACTIONS.STEP_UP_DOOM_DIE]: 'HitchActionStepUpDoomDie',
  [HITCH_ACTIONS.STEP_UP_PARADOX]: 'HitchActionStepUpParadox'
}

const DOOM_POOL_ACTIONS = [HITCH_ACTIONS.ADD_DOOM_DIE, HITCH_ACTIONS.STEP_UP_DOOM_DIE]

// "(new)", "(stepped up)", or "(new, stepped up)" when a die was both added and then grown.
const getChangeNote = entry => [
  entry.isNew ? localizer('HitchesNew') : null,
  entry.isSteppedUp ? localizer('HitchesSteppedUp') : null
].filter(Boolean).join(', ')

// The two Doom Pool options name the trait the GM actually configured (e.g. "Limited Doom Pool")
// rather than a hardcoded phrase, so the dialog reads correctly in any world.
const getActionLabel = (action, doomPoolLabel) => DOOM_POOL_ACTIONS.includes(action)
  ? game.i18n.format(ACTION_LABEL_KEYS[action], { doomPool: doomPoolLabel })
  : localizer(ACTION_LABEL_KEYS[action])

export class HitchesDialog extends FormApplication {
  constructor ({ actor, sceneActor, challengeType, dice, isMage, magick, canStepUpParadox = true, rolledAt = 0 }) {
    // Scoped per actor so that two players hitching at once during a Group Challenge get two
    // separate windows instead of colliding on a single shared application id.
    super({}, { id: `hitches-dialog-${actor.id}` })

    this.actor = actor
    this.canStepUpParadox = canStepUpParadox
    this.rolledAt = rolledAt
    // If the Scene happens to be linked to the very actor that's rolling, the character and scene
    // complication pipelines would both write system.actorType.complications on that same
    // document from two independent pre-dialog snapshots — the second write would silently
    // clobber the first. Treating that case as "no scene actor" sidesteps it entirely.
    this.sceneActor = sceneActor && sceneActor.id !== actor.id ? sceneActor : null
    this.challengeType = challengeType
    this.isMage = isMage
    this.magick = magick

    this.rows = dice.map(die => ({
      faces: die.faces,
      result: die.result,
      action: HITCH_ACTIONS.NONE,
      complicationName: '',
      complicationKey: '',
      renameComplication: '',
      // The die-size list has no empty entry, so the row starts on the lowest size — "step up the
      // smallest die in the pool" — rather than on a value the select can't actually show.
      doomDieSize: DOOM_DIE_STEP_OPTIONS[0]
    }))
  }

  static get defaultOptions () {
    return foundry.utils.mergeObject(super.defaultOptions, {
      id: 'hitches-dialog',
      template: 'systems/cortexprime-ext/templates/dialog/hitches.html',
      title: localizer('Hitches'),
      classes: ['cortexprime', 'hitches-dialog'],
      width: 620,
      height: 'auto',
      closeOnSubmit: false,
      submitOnChange: false,
      submitOnClose: false
    })
  }

  // Names the player, so two simultaneous Hitches windows are tellable apart.
  get title () {
    return `${localizer('Hitches')} — ${this.actor.name}`
  }

  // Everything the dialog and the chat summary both need, computed from the current row state.
  _getState () {
    const doomPool = getDoomPool()
    const doomDice = doomPool?.dice ?? []
    const complications = getComplications(this.actor)
    const sceneComplications = this.sceneActor ? getComplications(this.sceneActor) : []
    const defaultComplicationLabel = localizer('NewComplication')

    const projection = computeProjection({
      rows: this.rows,
      complications,
      sceneComplications,
      doomDice,
      defaultComplicationLabel
    })

    const toComplicationSummary = list => list.map(complication => ({
      label: complication.label,
      dice: complication.dice,
      note: getChangeNote(complication)
    }))

    return {
      complications,
      sceneComplications,
      defaultComplicationLabel,
      doomDice,
      doomPool,
      plotPoints: computePlotPoints(this.rows),
      projection,
      // Localized here rather than in the pure logic, and shared by the dialog and the chat card
      // so both read identically.
      summary: {
        complications: toComplicationSummary(projection.changedComplications),
        sceneComplications: toComplicationSummary(projection.changedSceneComplications),
        // Only the dice this roll actually added or grew — an unchanged die that was already in
        // the pool is left out, matching how the complication summaries only list changed ones.
        doomDice: projection.doomDiceDetail
          .filter(entry => entry.isNew || entry.isSteppedUp)
          .map(entry => ({ face: entry.face, note: getChangeNote(entry) }))
      }
    }
  }

  async getData () {
    const theme = getCurrentTheme()

    const { complications, sceneComplications, defaultComplicationLabel, doomPool, plotPoints, projection, summary } = this._getState()

    const doomPoolLabel = doomPool?.label ?? localizer('DoomPoolTrait')
    const availableActions = getAvailableActions({
      hasDoomPool: !!doomPool,
      hasSceneActor: !!this.sceneActor,
      isMage: this.isMage,
      magick: this.magick,
      canStepUpParadox: this.canStepUpParadox
    })
    const complicationOptions = getComplicationOptions(
      complications, this.rows, defaultComplicationLabel, HITCH_ACTIONS.INTRODUCE_COMPLICATION
    )
    const sceneComplicationOptions = getComplicationOptions(
      sceneComplications, this.rows, defaultComplicationLabel, HITCH_ACTIONS.INTRODUCE_SCENE_COMPLICATION
    )

    return {
      actorName: this.actor.name,
      doomPoolLabel,
      hasSceneActor: !!this.sceneActor,
      isBotch: isBotch(this.rows),
      plotPoints,
      projection,
      summary,
      theme,
      rows: this.rows.map((row, index) => ({
        ...row,
        index,
        isHitch: isHitch(row),
        showComplicationName: row.action === HITCH_ACTIONS.INTRODUCE_COMPLICATION,
        showComplicationSelect: row.action === HITCH_ACTIONS.STEP_UP_COMPLICATION,
        showSceneComplicationName: row.action === HITCH_ACTIONS.INTRODUCE_SCENE_COMPLICATION,
        showSceneComplicationSelect: row.action === HITCH_ACTIONS.STEP_UP_SCENE_COMPLICATION,
        showDoomDieSelect: row.action === HITCH_ACTIONS.STEP_UP_DOOM_DIE,
        complicationOptions: complicationOptions.map(option => ({
          ...option,
          selected: option.key === row.complicationKey
        })),
        sceneComplicationOptions: sceneComplicationOptions.map(option => ({
          ...option,
          selected: option.key === row.complicationKey
        })),
        // Shown as the rename box's placeholder, so leaving it blank visibly means "keep this name".
        // Character and scene options reuse the same key format (existing:0, pending:2, ...), so
        // which list to look in must be decided by the row's own action — checking one list then
        // falling back to the other would match a same-keyed character complication first and
        // show its name on a scene row (or vice versa) whenever both happen to share a key.
        complicationCurrentLabel: (
          row.action === HITCH_ACTIONS.STEP_UP_SCENE_COMPLICATION ? sceneComplicationOptions : complicationOptions
        ).find(option => option.key === row.complicationKey)?.label ?? '',
        doomDieOptions: DOOM_DIE_STEP_OPTIONS.map(size => ({ size, selected: size === row.doomDieSize })),
        actions: availableActions.map(action => ({
          value: action,
          label: getActionLabel(action, doomPoolLabel),
          selected: action === row.action
        }))
      }))
    }
  }

  activateListeners (html) {
    super.activateListeners(html)

    html.find('.hitch-action').change(this._onRowChange.bind(this, 'action'))
    html.find('.hitch-complication-select').change(this._onRowChange.bind(this, 'complicationKey'))
    html.find('.hitch-doom-select').change(this._onRowChange.bind(this, 'doomDieSize'))
    // .change() fires on blur rather than per keystroke, so re-rendering here can never steal
    // focus mid-word — the same trade-off CrisisPoolDialog makes for its name field.
    html.find('.hitch-complication-name').change(this._onRowChange.bind(this, 'complicationName'))
    html.find('.hitch-complication-rename').change(this._onRowChange.bind(this, 'renameComplication'))
    html.find('.choose-complication-name').click(this._onChooseComplicationName.bind(this))
    html.find('.hitches-confirm').click(this._onConfirm.bind(this))

    // Revealing a sub-field grows the form after Foundry has already measured this height:'auto'
    // window, so re-run the measurement once the new content is in the DOM.
    try {
      this.setPosition({ width: this.options.width, height: 'auto' })
    } catch (error) {
      console.warn('CP | Hitches: could not resize the dialog', error)
    }
  }

  // Announces how many hitches the GM spent on "Step up Paradox", exactly once per dialog, so the
  // Mage Paradox flow (module/mage/paradox.js) knows the count and can proceed. Fired on close as
  // well as on Confirm — a GM who dismisses this dialog hasn't cancelled the Paradox, which the
  // rules say happens with or without hitches, so it resolves with zero steps instead of hanging.
  _resolveHitches (paradoxSteps) {
    if (this._resolved) return

    this._resolved = true

    Hooks.callAll('cortexprimeHitchesResolved', {
      actorId: this.actor.id,
      rolledAt: this.rolledAt,
      paradoxSteps
    })
  }

  async close (options) {
    this._resolveHitches(0)

    return super.close(options)
  }

  _onRowChange (field, event) {
    event.preventDefault()

    const $target = $(event.currentTarget)
    const index = parseInt($target.data('index'), 10)

    if (Number.isNaN(index) || !this.rows[index]) return

    this.rows[index] = { ...this.rows[index], [field]: $target.val() }

    this.render(true)
  }

  // Reuses ComplicationDialog's own category/subcategory/severity picker to name a newly
  // introduced complication, rather than duplicating that library here.
  _onChooseComplicationName (event) {
    event.preventDefault()

    const $target = $(event.currentTarget)
    const index = parseInt($target.data('index'), 10)

    if (Number.isNaN(index) || !this.rows[index]) return

    new ComplicationDialog({
      pickOnly: true,
      initialLabel: this.rows[index].complicationName,
      onPick: label => {
        if (!this.rows[index]) return
        this.rows[index] = { ...this.rows[index], complicationName: label }
        this.render(true)
      }
    }).render(true)
  }

  async _onConfirm (event) {
    event.preventDefault()

    // Guard against a double click landing two sets of writes while the first is still in flight.
    if (this._confirming) return

    this._confirming = true

    try {
      const { doomPool, plotPoints, projection, summary } = this._getState()

      // A dialog left entirely on NONE (or hitches nobody acted on) has nothing to tell the table
      // — skip the chat card rather than post an effectively-blank summary.
      const summaryHtml = hasHitchOutcomes(projection)
        ? await foundry.applications.handlebars.renderTemplate(
            'systems/cortexprime-ext/templates/chat/hitches.html',
            {
              actorName: this.actor.name,
              doomPoolLabel: doomPool?.label ?? localizer('DoomPoolTrait'),
              hasDoomPool: !!doomPool,
              hasSceneActor: !!this.sceneActor,
              isBotch: isBotch(this.rows),
              plotPoints,
              projection,
              summary
            }
          )
        : null

      await applyHitchOutcomes({ actor: this.actor, sceneActor: this.sceneActor, projection, plotPoints, summaryHtml })

      // Before close(), so the real step count is what gets announced rather than close()'s zero.
      this._resolveHitches(projection.paradoxSteps)

      this.close()
    } catch (error) {
      this._confirming = false
      console.error('CP | Hitches: could not apply the selected outcomes', error)
      ui.notifications.error(localizer('HitchesApplyFailed'))
    }
  }

  async _updateObject () {}
}
