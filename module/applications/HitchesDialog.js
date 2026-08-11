import { localizer } from '../scripts/foundryHelpers.js'
import { applyHitchOutcomes, getComplications, getDoomPool } from '../scripts/hitches.js'
import {
  DOOM_DIE_STEP_OPTIONS,
  HITCH_ACTIONS,
  computePlotPoints,
  computeProjection,
  getAvailableActions,
  getComplicationOptions,
  isBotch,
  isHitch
} from '../scripts/hitchesLogic.js'

const ACTION_LABEL_KEYS = {
  [HITCH_ACTIONS.NONE]: 'HitchActionNone',
  [HITCH_ACTIONS.INTRODUCE_COMPLICATION]: 'HitchActionIntroduceComplication',
  [HITCH_ACTIONS.STEP_UP_COMPLICATION]: 'HitchActionStepUpComplication',
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
  constructor ({ actor, challengeType, dice, isMage, magick }) {
    // Scoped per actor so that two players hitching at once during a Group Challenge get two
    // separate windows instead of colliding on a single shared application id.
    super({}, { id: `hitches-dialog-${actor.id}` })

    this.actor = actor
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
      template: 'systems/cortexprime/templates/dialog/hitches.html',
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
    const defaultComplicationLabel = localizer('NewComplication')

    const projection = computeProjection({
      rows: this.rows,
      complications,
      doomDice,
      defaultComplicationLabel
    })

    return {
      complications,
      defaultComplicationLabel,
      doomDice,
      doomPool,
      plotPoints: computePlotPoints(this.rows),
      projection,
      // Localized here rather than in the pure logic, and shared by the dialog and the chat card
      // so both read identically.
      summary: {
        complications: projection.changedComplications.map(complication => ({
          label: complication.label,
          dice: complication.dice,
          note: getChangeNote(complication)
        })),
        doomDice: projection.doomDiceDetail.map(entry => ({
          face: entry.face,
          note: getChangeNote(entry)
        }))
      }
    }
  }

  async getData () {
    const themes = game.settings.get('cortexprime', 'themes')
    const theme = themes.current === 'custom' ? themes.custom : themes.list[themes.current]

    const { complications, defaultComplicationLabel, doomPool, plotPoints, projection, summary } = this._getState()

    const doomPoolLabel = doomPool?.label ?? localizer('DoomPoolTrait')
    const availableActions = getAvailableActions({
      hasDoomPool: !!doomPool,
      isMage: this.isMage,
      magick: this.magick
    })
    const complicationOptions = getComplicationOptions(complications, this.rows, defaultComplicationLabel)

    return {
      actorName: this.actor.name,
      doomPoolLabel,
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
        showDoomDieSelect: row.action === HITCH_ACTIONS.STEP_UP_DOOM_DIE,
        complicationOptions: complicationOptions.map(option => ({
          ...option,
          selected: option.key === row.complicationKey
        })),
        // Shown as the rename box's placeholder, so leaving it blank visibly means "keep this name".
        complicationCurrentLabel: complicationOptions.find(option => option.key === row.complicationKey)?.label ?? '',
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
    html.find('.hitches-confirm').click(this._onConfirm.bind(this))

    // Revealing a sub-field grows the form after Foundry has already measured this height:'auto'
    // window, so re-run the measurement once the new content is in the DOM.
    try {
      this.setPosition({ width: this.options.width, height: 'auto' })
    } catch (error) {
      console.warn('CP | Hitches: could not resize the dialog', error)
    }
  }

  _onRowChange (field, event) {
    event.preventDefault()

    const $target = $(event.currentTarget)
    const index = parseInt($target.data('index'), 10)

    if (Number.isNaN(index) || !this.rows[index]) return

    this.rows[index] = { ...this.rows[index], [field]: $target.val() }

    this.render(true)
  }

  async _onConfirm (event) {
    event.preventDefault()

    // Guard against a double click landing two sets of writes while the first is still in flight.
    if (this._confirming) return

    this._confirming = true

    try {
      const { doomPool, plotPoints, projection, summary } = this._getState()

      const summaryHtml = await foundry.applications.handlebars.renderTemplate(
        'systems/cortexprime/templates/chat/hitches.html',
        {
          actorName: this.actor.name,
          doomPoolLabel: doomPool?.label ?? localizer('DoomPoolTrait'),
          hasDoomPool: !!doomPool,
          isBotch: isBotch(this.rows),
          plotPoints,
          projection,
          summary
        }
      )

      await applyHitchOutcomes({ actor: this.actor, projection, plotPoints, summaryHtml })

      this.close()
    } catch (error) {
      this._confirming = false
      console.error('CP | Hitches: could not apply the selected outcomes', error)
      ui.notifications.error(localizer('HitchesApplyFailed'))
    }
  }

  async _updateObject () {}
}
