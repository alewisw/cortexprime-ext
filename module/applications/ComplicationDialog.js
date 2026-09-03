import { getLength, objectMapValues, objectReindexFilter } from '../../lib/helpers.js'
import { confirmAction, getCurrentTheme, localizer } from '../scripts/foundryHelpers.js'
import { removeDataPoint, resetDataPoint } from '../scripts/sheetHelpers.js'
import { SEVERITY_DICE } from '../actor/complicationPresets.js'
import { buildPickerState, toDiceValue } from './complicationDialogLogic.js'

// Editor/creator for a single complication, and (in pickOnly mode) a standalone name picker that
// HitchesDialog reuses so the category/subCategory/severity library only exists in one place.
//
// Two ways to open it:
//   new ComplicationDialog({ actor, path, index, hasHidableTraits }) - full edit/create, writes
//     straight to the actor on Confirm (index omitted/null means "create a new one").
//   new ComplicationDialog({ pickOnly: true, initialLabel, onPick }) - never touches an actor;
//     Confirm just calls onPick(label) with whatever name is showing.
export class ComplicationDialog extends FormApplication {
  constructor ({ actor, path, index = null, hasHidableTraits = false, pickOnly = false, initialLabel = '', onPick = null } = {}) {
    // Scoped so simultaneous windows never share a DOM id: pickOnly can be opened from several
    // Hitches rows at once (no actor to key off), and full mode is keyed by actor + index so
    // editing two different complications on the same actor at the same time doesn't collide
    // either - the same reasoning HitchesDialog uses for its own per-actor id.
    const id = pickOnly ? `complication-picker-dialog-${Date.now()}` : `complication-dialog-${actor.id}-${index ?? 'new'}`

    super({}, { id })

    this.pickOnly = pickOnly

    if (pickOnly) {
      this.onPick = onPick
      this.isEditing = false
      this.hasHidableTraits = false
      this.label = initialLabel
      this.dice = null
      this.hidden = false
    } else {
      this.actor = actor
      this.path = path
      this.index = index
      this.hasHidableTraits = hasHidableTraits
      this.isEditing = index !== null

      const existing = this.isEditing
        ? (foundry.utils.getProperty(actor, `${path}.complications`) ?? {})[index]
        : null

      this.label = existing?.label ?? ''
      this.dice = existing?.dice?.value ? { ...existing.dice.value } : { 0: '6' }
      this.hidden = existing?.hidden ?? false
    }
  }

  static get defaultOptions () {
    return foundry.utils.mergeObject(super.defaultOptions, {
      template: 'systems/cortexprime-ext/templates/dialog/complication.html',
      classes: ['cortexprime', 'complication-dialog'],
      width: 640,
      // 'auto' always sizes the window to exactly match its content, so there's no gap between
      // the form and the window chrome to leave a dead grey area below it - the taller default
      // comes from .picker-name-list's own max-height (see _forms.scss), not a fixed number here.
      // resizable still lets the player drag it taller/shorter on top of that.
      height: 'auto',
      resizable: true,
      closeOnSubmit: false,
      submitOnChange: false,
      submitOnClose: false
    })
  }

  get title () {
    if (this.pickOnly) return localizer('ChooseComplicationName')

    return localizer(this.isEditing ? 'EditComplication' : 'AddComplication')
  }

  async getData () {
    const theme = getCurrentTheme()

    return {
      theme,
      pickOnly: this.pickOnly,
      isEditing: this.isEditing,
      hasHidableTraits: this.hasHidableTraits,
      label: this.label,
      dice: this.dice,
      hidden: this.hidden,
      picker: buildPickerState({
        category: this.pickerCategory,
        subCategory: this.pickerSubCategory,
        selectedName: this.pickerSelectedName
      })
    }
  }

  activateListeners (html) {
    super.activateListeners(html)

    // this.render(true) rebuilds the whole form from scratch, so the fresh .picker-name-list
    // elements it produces always start scrolled to the top - restore whatever scroll position
    // _onPickerNameClick saved just before triggering that render.
    if (this._pickerScrollPositions) {
      html.find('.picker-name-list').each((index, element) => {
        element.scrollTop = this._pickerScrollPositions[index] ?? 0
      })
      this._pickerScrollPositions = null
    }

    html.find('.complication-label').change(event => { this.label = event.currentTarget.value })

    if (!this.pickOnly) {
      html.find('.die-select').change(this._onDieChange.bind(this))
      html.find('.die-select').on('mouseup', this._onDieRemove.bind(this))
      html.find('.new-die').click(this._onNewDie.bind(this))
      html.find('.complication-hidden').change(event => { this.hidden = event.currentTarget.checked })
      html.find('.delete-complication').click(this._onDelete.bind(this))
    }

    html.find('.picker-category').change(event => {
      this.pickerCategory = event.currentTarget.value
      this.pickerSubCategory = undefined
      this.pickerSelectedName = undefined
      this.render(true)
    })
    html.find('.picker-subcategory').change(event => {
      this.pickerSubCategory = event.currentTarget.value
      this.pickerSelectedName = undefined
      this.render(true)
    })
    html.find('.picker-name').click(event => {
      event.preventDefault()

      const $target = $(event.currentTarget)
      const name = $target.data('name')
      const severity = $target.data('severity')

      this.label = name
      this.pickerSelectedName = name

      if (!this.pickOnly) {
        this.dice = toDiceValue(SEVERITY_DICE[severity])
      }

      this._pickerScrollPositions = html.find('.picker-name-list').toArray().map(element => element.scrollTop)

      this.render(true)
    })

    html.find('.confirm-complication').click(this._onConfirm.bind(this))
    html.find('.cancel-complication').click(() => this.close())
  }

  _onDieChange (event) {
    event.preventDefault()

    const $target = $(event.currentTarget)
    const key = $target.data('key')

    this.dice = objectMapValues(this.dice, (value, index) => parseInt(index, 10) === parseInt(key, 10) ? $target.val() : value)

    this.render(true)
  }

  _onDieRemove (event) {
    event.preventDefault()

    if (event.button !== 2) return

    const $target = $(event.currentTarget)
    const key = $target.data('key')

    if (getLength(this.dice) <= 1) return

    this.dice = objectReindexFilter(this.dice, (_, index) => parseInt(index, 10) !== parseInt(key, 10))

    this.render(true)
  }

  _onNewDie (event) {
    event.preventDefault()

    const currentLength = getLength(this.dice)
    const lastValue = this.dice[currentLength - 1] || '8'

    this.dice = { ...this.dice, [currentLength]: lastValue }

    this.render(true)
  }

  async _onDelete (event) {
    event.preventDefault()

    if (!this.isEditing) return

    const confirmed = await confirmAction({
      content: `${localizer('Remove')} ${this.label}?`
    })

    if (!confirmed) return

    const currentComplications = foundry.utils.getProperty(this.actor, `${this.path}.complications`) ?? {}

    await removeDataPoint.call(this, currentComplications, this.path, 'complications', this.index)

    this.close()
  }

  async _onConfirm (event) {
    event.preventDefault()

    if (this.pickOnly) {
      this.onPick?.(this.label)
      this.close()
      return
    }

    const currentComplications = foundry.utils.getProperty(this.actor, `${this.path}.complications`) ?? {}
    const index = this.isEditing ? this.index : getLength(currentComplications)
    const existing = this.isEditing ? currentComplications[index] : null

    await resetDataPoint.call(this, this.path, 'complications', {
      ...currentComplications,
      [index]: {
        ...existing,
        label: this.label || localizer('NewComplication'),
        dice: { ...existing?.dice, value: { ...this.dice } },
        hidden: this.hidden
      }
    })

    this.close()
  }

  async _updateObject () {}
}
