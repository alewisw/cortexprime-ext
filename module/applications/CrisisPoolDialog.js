import { getLength, objectMapValues, objectReindexFilter } from '../../lib/helpers.js'
import { localizer } from '../scripts/foundryHelpers.js'
import { startCrisis } from '../scripts/crisisPool.js'

export class CrisisPoolDialog extends FormApplication {
  constructor () {
    super()
    this.name = ''
    this.dice = { 0: '8' }
  }

  static get defaultOptions () {
    return foundry.utils.mergeObject(super.defaultOptions, {
      id: 'crisis-pool-dialog',
      template: 'systems/cortexprime/templates/dialog/crisis-pool.html',
      title: localizer('StartCrisis'),
      classes: ['cortexprime', 'crisis-pool-dialog'],
      width: 420,
      height: 'auto',
      closeOnSubmit: false,
      submitOnChange: false,
      submitOnClose: false
    })
  }

  async getData () {
    const themes = game.settings.get('cortexprime', 'themes')
    const theme = themes.current === 'custom' ? themes.custom : themes.list[themes.current]

    return { name: this.name, dice: this.dice, theme }
  }

  activateListeners (html) {
    super.activateListeners(html)
    html.find('.crisis-name').change(event => { this.name = event.currentTarget.value })
    html.find('.die-select').change(this._onDieChange.bind(this))
    html.find('.die-select').on('mouseup', this._onDieRemove.bind(this))
    html.find('.new-die').click(this._onNewDie.bind(this))
    html.find('.start-crisis').click(this._onStart.bind(this))
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

  async _onStart (event) {
    event.preventDefault()

    const dice = Object.values(this.dice).map(face => parseInt(face, 10))

    if (!dice.length) return

    await startCrisis({ name: this.name, dice })

    this.close()
  }

  async _updateObject () {}
}
