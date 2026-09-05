import { confirmAction, localizer } from '../scripts/foundryHelpers.js'
import { getLength } from '../../lib/helpers.js'
import { newId } from '../../lib/id.js'
import { onRemoveItem, onReorderItem } from '../scripts/settingsHelpers.js'
import { CortexApplicationV2 } from '../applications/CortexApplicationV2.js'
import defaultPlotPointUses from '../actor/defaultPlotPointUses.js'

export default class PlotPointUsesSettings extends CortexApplicationV2 {
  static DEFAULT_OPTIONS = {
    id: 'plot-point-uses-settings',
    classes: ['plot-point-uses-settings'],
    tag: 'form',
    position: { width: 500, height: 'auto' },
    // A localization key, not a localized string: DEFAULT_OPTIONS is evaluated at module load,
    // before game.i18n exists.
    window: { title: 'PlotPointUsesSettings', resizable: true },
    form: {
      handler: PlotPointUsesSettings.#onSubmit,
      submitOnChange: true,
      closeOnSubmit: false
    },
    actions: {
      addPlotPointUse: PlotPointUsesSettings.#onAddPlotPointUse,
      resetPlotPointUses: PlotPointUsesSettings.#onResetPlotPointUses,
      // Shared with the appv1 settings apps that still render the same partials.
      removeItem: onRemoveItem,
      reorderItem: onReorderItem
    }
  }

  static PARTS = {
    form: { template: 'systems/cortexprime-ext/templates/settings/plot-point-uses.html' }
  }

  async _prepareContext (options) {
    const plotPointUses = game.settings.get('cortexprime-ext', 'plotPointUses') ?? {}

    return {
      ...await super._prepareContext(options),
      general: plotPointUses.general ?? {},
      opportunity: plotPointUses.opportunity ?? {}
    }
  }

  // V1 had submitOnClose, which ApplicationV2 has no equivalent for. submitOnChange already
  // commits each edit as it happens, but a label typed and then closed without the field ever
  // losing focus would otherwise be dropped, so submit once more on the way out. _preClose rather
  // than _onClose because it is awaited while the form element still exists.
  async _preClose (options) {
    this.#closing = true

    if (this.form) await this.submit()

    return super._preClose(options)
  }

  // Set by _preClose so the submit it triggers doesn't try to re-render an application that is
  // already on its way out.
  #closing = false

  static async #onSubmit (event, form, formData) {
    const expanded = foundry.utils.expandObject(formData.object)
    const current = game.settings.get('cortexprime-ext', 'plotPointUses') ?? {}

    await game.settings.set('cortexprime-ext', 'plotPointUses', foundry.utils.mergeObject(current, expanded))

    if (!this.#closing) await this.render()
  }

  static async #onAddPlotPointUse (event, target) {
    event.preventDefault()

    const { group } = target.dataset
    const current = game.settings.get('cortexprime-ext', 'plotPointUses') ?? {}
    const currentGroup = current[group] ?? {}
    const newKey = getLength(currentGroup)

    await game.settings.set('cortexprime-ext', 'plotPointUses', {
      ...current,
      [group]: {
        ...currentGroup,
        [newKey]: { id: newId(), label: localizer('NewPlotPointUse') }
      }
    })

    await this.render()
  }

  static async #onResetPlotPointUses (event, target) {
    event.preventDefault()

    const confirmed = await confirmAction({
      content: localizer('ConfirmResetPlotPointUsesMessage')
    })

    if (!confirmed) return

    await game.settings.set('cortexprime-ext', 'plotPointUses', defaultPlotPointUses)

    await this.render()
  }
}
