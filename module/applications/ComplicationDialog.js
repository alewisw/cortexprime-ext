import { getLength, objectMapValues, objectReindexFilter } from '../../lib/helpers.js'
import { confirmAction, localizer } from '../scripts/foundryHelpers.js'
import { removeDataPoint, resetDataPoint } from '../scripts/sheetHelpers.js'
import { CortexApplicationV2 } from './CortexApplicationV2.js'
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
export class ComplicationDialog extends CortexApplicationV2 {
  constructor ({ actor, path, index = null, hasHidableTraits = false, pickOnly = false, initialLabel = '', onPick = null } = {}) {
    // Scoped so simultaneous windows never share a DOM id: pickOnly can be opened from several
    // Hitches rows at once (no actor to key off), and full mode is keyed by actor + index so
    // editing two different complications on the same actor at the same time doesn't collide
    // either - the same reasoning HitchesDialog uses for its own per-actor id. Passed as instance
    // options, which override DEFAULT_OPTIONS, so no id is declared there.
    const id = pickOnly ? `complication-picker-dialog-${Date.now()}` : `complication-dialog-${actor.id}-${index ?? 'new'}`

    super({ id })

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

  static DEFAULT_OPTIONS = {
    classes: ['complication-dialog'],
    position: {
      width: 640,
      // 'auto' always sizes the window to exactly match its content, so there's no gap between
      // the form and the window chrome to leave a dead grey area below it - the taller default
      // comes from .picker-name-list's own max-height (see _forms.scss), not a fixed number here.
      // resizable still lets the player drag it taller/shorter on top of that.
      height: 'auto'
    },
    window: { resizable: true },
    actions: {
      newDie: ComplicationDialog.#onNewDie,
      pickName: ComplicationDialog.#onPickName,
      confirmComplication: ComplicationDialog.#onConfirm,
      cancelComplication: ComplicationDialog.#onCancel,
      deleteComplication: ComplicationDialog.#onDelete
    }
  }

  static PARTS = {
    content: { template: 'systems/cortexprime-ext/templates/dialog/complication.html' }
  }

  // The wording depends on instance state, so this is a getter rather than window.title.
  // ApplicationV2 reads it on the first render only, which is sufficient: pickOnly and isEditing
  // are both fixed when the dialog is constructed.
  get title () {
    if (this.pickOnly) return localizer('ChooseComplicationName')

    return localizer(this.isEditing ? 'EditComplication' : 'AddComplication')
  }

  async _prepareContext (options) {
    return {
      ...await super._prepareContext(options),
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

  // `change` has no `actions` equivalent, so these stay hand-wired. Rebound every render, which
  // is correct: the part's DOM is replaced wholesale each time.
  _onRender (context, options) {
    super._onRender(context, options)

    // Picking a name re-renders the whole form, so the fresh lists start at the top - put back
    // whatever #onPickName captured just before triggering it. PARTS.scrollable cannot do this:
    // it resolves each selector with querySelector, the FIRST match only, and there is one
    // .picker-name-list per severity group.
    if (this.#pickerScrollTops) {
      this.element.querySelectorAll('.picker-name-list').forEach((list, index) => {
        // The part swap (_replaceHTML) builds this element in a detached, unlaid-out tree before
        // inserting it, so scrollHeight can still read stale/zero the instant it lands - setting
        // scrollTop against that clamps it straight back to 0. Reading a layout property forces a
        // synchronous reflow first, so the assignment below clamps against the real, current size.
        void list.offsetHeight
        list.scrollTop = this.#pickerScrollTops[index] ?? 0
      })

      this.#pickerScrollTops = null
    }

    this.element.querySelector('.complication-label')
      ?.addEventListener('change', event => { this.label = event.currentTarget.value })

    this.element.querySelector('.picker-category')
      ?.addEventListener('change', async event => {
        this.pickerCategory = event.currentTarget.value
        this.pickerSubCategory = undefined
        this.pickerSelectedName = undefined

        await this.render()
      })

    this.element.querySelector('.picker-subcategory')
      ?.addEventListener('change', async event => {
        this.pickerSubCategory = event.currentTarget.value
        this.pickerSelectedName = undefined

        await this.render()
      })

    if (this.pickOnly) return

    this.element.querySelector('.complication-hidden')
      ?.addEventListener('change', event => { this.hidden = event.currentTarget.checked })

    for (const select of this.element.querySelectorAll('.die-select')) {
      select.addEventListener('change', this.#onDieChange.bind(this))
      select.addEventListener('mouseup', this.#onDieRemove.bind(this))
    }
  }

  async #onDieChange (event) {
    event.preventDefault()

    const target = event.currentTarget
    const key = target.dataset.key
    const value = target.value

    this.dice = objectMapValues(this.dice, (current, index) =>
      parseInt(index, 10) === parseInt(key, 10) ? value : current)

    await this.render()
  }

  async #onDieRemove (event) {
    event.preventDefault()

    if (event.button !== 2) return

    if (getLength(this.dice) <= 1) return

    const key = event.currentTarget.dataset.key

    this.dice = objectReindexFilter(this.dice, (_, index) => parseInt(index, 10) !== parseInt(key, 10))

    await this.render()
  }

  static async #onNewDie (event, target) {
    event.preventDefault()

    const currentLength = getLength(this.dice)
    const lastValue = this.dice[currentLength - 1] || '8'

    this.dice = { ...this.dice, [currentLength]: lastValue }

    await this.render()
  }

  // Scroll positions of every name list, captured on the way into a re-render; see _onRender.
  #pickerScrollTops = null

  static async #onPickName (event, target) {
    event.preventDefault()

    const { name, severity } = target.dataset

    this.#pickerScrollTops = [...this.element.querySelectorAll('.picker-name-list')].map(list => list.scrollTop)

    this.label = name
    this.pickerSelectedName = name

    if (!this.pickOnly) {
      this.dice = toDiceValue(SEVERITY_DICE[severity])
    }

    await this.render()
  }

  static async #onCancel (event, target) {
    event.preventDefault()

    await this.close()
  }

  static async #onDelete (event, target) {
    event.preventDefault()

    if (!this.isEditing) return

    const confirmed = await confirmAction({
      content: `${localizer('Remove')} ${this.label}?`
    })

    if (!confirmed) return

    const currentComplications = foundry.utils.getProperty(this.actor, `${this.path}.complications`) ?? {}

    await removeDataPoint.call(this, currentComplications, this.path, 'complications', this.index)

    await this.close()
  }

  static async #onConfirm (event, target) {
    event.preventDefault()

    if (this.pickOnly) {
      this.onPick?.(this.label)

      await this.close()

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

    await this.close()
  }
}
