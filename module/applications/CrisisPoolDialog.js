import { getLength, objectMapValues, objectReindexFilter } from '../../lib/helpers.js'
import { localizer } from '../scripts/foundryHelpers.js'
import { CortexApplicationV2 } from './CortexApplicationV2.js'
import { endCrisis, getCrisisPool, startCrisis } from '../scripts/crisisPool.js'

export class CrisisPoolDialog extends CortexApplicationV2 {
  constructor () {
    super()

    const crisis = getCrisisPool()

    this.isEditing = crisis.active
    this.name = crisis.active ? crisis.name : ''
    this.dice = crisis.active
      ? crisis.dice.reduce((acc, face, index) => ({ ...acc, [index]: String(face) }), {})
      : { 0: '8' }
  }

  static DEFAULT_OPTIONS = {
    id: 'crisis-pool-dialog',
    classes: ['crisis-pool-dialog'],
    position: { width: 420, height: 'auto' },
    actions: {
      newDie: CrisisPoolDialog.#onNewDie,
      // Both the Start and Update buttons commit; which one is rendered depends on isEditing.
      startCrisis: CrisisPoolDialog.#onStart,
      endCrisis: CrisisPoolDialog.#onEnd
    }
  }

  static PARTS = {
    content: { template: 'systems/cortexprime-ext/templates/dialog/crisis-pool.html' }
  }

  // Overriding the getter rather than setting window.title, because the wording depends on
  // instance state. ApplicationV2 reads this during the FIRST render only
  // (_configureRenderOptions gates it on isFirstRender), which is sufficient here: isEditing is
  // fixed when the dialog is constructed and never changes while it is open. A title that has to
  // change mid-life would need render({ window: { title } }) instead.
  get title () {
    return localizer(this.isEditing ? 'EditCrisis' : 'StartCrisis')
  }

  async _prepareContext (options) {
    return {
      ...await super._prepareContext(options),
      name: this.name,
      dice: this.dice,
      isEditing: this.isEditing
    }
  }

  // `change` has no `actions` equivalent - actions dispatch from click/contextmenu only - so these
  // stay hand-wired. Rebinding on every render is correct and necessary: _renderHTML replaces the
  // part's DOM wholesale, so the previous elements (and their listeners) are gone.
  _onRender (context, options) {
    super._onRender(context, options)

    this.element.querySelector('.crisis-name')
      ?.addEventListener('change', event => { this.name = event.currentTarget.value })

    for (const select of this.element.querySelectorAll('.die-select')) {
      select.addEventListener('change', this.#onDieChange.bind(this))
      // Right-click to drop a die. Kept as mouseup to match the rest of the system's dice
      // controls; ApplicationV2 can express this as an action with { handler, buttons: [2] },
      // which is worth adopting across all of them at once rather than here alone.
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

  static async #onStart (event, target) {
    event.preventDefault()

    const dice = Object.values(this.dice).map(face => parseInt(face, 10))

    if (!dice.length) return

    await startCrisis({ name: this.name, dice })

    await this.close()
  }

  static async #onEnd (event, target) {
    event.preventDefault()

    await endCrisis()

    await this.close()
  }
}
