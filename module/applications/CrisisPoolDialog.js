import { getLength, objectMapValues, objectReindexFilter } from '../../lib/helpers.js'
import { getCurrentTheme, localizer } from '../scripts/foundryHelpers.js'
import { endCrisis, getCrisisPool, startCrisis } from '../scripts/crisisPool.js'

export class CrisisPoolDialog extends FormApplication {
  constructor () {
    super()

    const crisis = getCrisisPool()

    this.isEditing = crisis.active
    this.name = crisis.active ? crisis.name : ''
    this.dice = crisis.active
      ? crisis.dice.reduce((acc, face, index) => ({ ...acc, [index]: String(face) }), {})
      : { 0: '8' }
  }

  static get defaultOptions () {
    return foundry.utils.mergeObject(super.defaultOptions, {
      id: 'crisis-pool-dialog',
      template: 'systems/cortexprime-ext/templates/dialog/crisis-pool.html',
      title: localizer('StartCrisis'),
      classes: ['cortexprime', 'crisis-pool-dialog'],
      width: 420,
      height: 'auto',
      closeOnSubmit: false,
      submitOnChange: false,
      submitOnClose: false
    })
  }

  get title () {
    return localizer(this.isEditing ? 'EditCrisis' : 'StartCrisis')
  }

  async getData () {
    const theme = getCurrentTheme()

    return { name: this.name, dice: this.dice, isEditing: this.isEditing, theme }
  }

  activateListeners (html) {
    super.activateListeners(html)
    html.find('.crisis-name').change(event => { this.name = event.currentTarget.value })
    html.find('.die-select').change(this._onDieChange.bind(this))
    html.find('.die-select').on('mouseup', this._onDieRemove.bind(this))
    html.find('.new-die').click(this._onNewDie.bind(this))
    html.find('.start-crisis, .update-crisis').click(this._onSubmit.bind(this))
    html.find('.end-crisis').click(this._onEnd.bind(this))
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

  async _onSubmit (event) {
    event.preventDefault()

    const dice = Object.values(this.dice).map(face => parseInt(face, 10))

    if (!dice.length) return

    await startCrisis({ name: this.name, dice })

    this.close()
  }

  async _onEnd (event) {
    event.preventDefault()

    await endCrisis()

    this.close()
  }

  async _updateObject () {}
}
