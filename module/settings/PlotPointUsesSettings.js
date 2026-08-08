import { localizer } from '../scripts/foundryHelpers.js'
import { getLength } from '../../lib/helpers.js'
import { removeItem, reorderItem } from '../scripts/settingsHelpers.js'
import defaultPlotPointUses from '../actor/defaultPlotPointUses.js'

export default class PlotPointUsesSettings extends FormApplication {
  constructor () {
    super()
  }

  static get defaultOptions () {
    return foundry.utils.mergeObject(super.defaultOptions, {
      id: 'plot-point-uses-settings',
      template: 'systems/cortexprime/templates/settings/plot-point-uses.html',
      title: localizer('PlotPointUsesSettings'),
      classes: ['cortexprime', 'plot-point-uses-settings'],
      width: 500,
      height: 'auto',
      resizable: true,
      closeOnSubmit: false,
      submitOnClose: true,
      submitOnChange: true
    })
  }

  getData () {
    const plotPointUses = game.settings.get('cortexprime', 'plotPointUses') ?? {}

    return {
      general: plotPointUses.general ?? {},
      opportunity: plotPointUses.opportunity ?? {}
    }
  }

  async _updateObject (event, formData) {
    const expanded = foundry.utils.expandObject(formData)
    const current = game.settings.get('cortexprime', 'plotPointUses') ?? {}

    await game.settings.set('cortexprime', 'plotPointUses', foundry.utils.mergeObject(current, expanded))

    this.render(true)
  }

  activateListeners (html) {
    super.activateListeners(html)
    html.find('.add-plot-point-use').click(this._addPlotPointUse.bind(this))
    html.find('.reset-plot-point-uses').click(this._resetPlotPointUses.bind(this))
    removeItem.call(this, html)
    reorderItem.call(this, html)
  }

  async _addPlotPointUse (event) {
    event.preventDefault()

    const { group } = event.currentTarget.dataset
    const current = game.settings.get('cortexprime', 'plotPointUses') ?? {}
    const currentGroup = current[group] ?? {}
    const newKey = getLength(currentGroup)

    await game.settings.set('cortexprime', 'plotPointUses', {
      ...current,
      [group]: {
        ...currentGroup,
        [newKey]: { id: `_${Date.now()}`, label: localizer('NewPlotPointUse') }
      }
    })

    this.render(true)
  }

  async _resetPlotPointUses (event) {
    event.preventDefault()

    let confirmed

    await Dialog.confirm({
      title: localizer('AreYouSure'),
      content: localizer('ConfirmResetPlotPointUsesMessage'),
      yes: () => { confirmed = true },
      no: () => { confirmed = false },
      defaultYes: false
    })

    if (confirmed) {
      await game.settings.set('cortexprime', 'plotPointUses', defaultPlotPointUses)
      this.render(true)
    }
  }
}
