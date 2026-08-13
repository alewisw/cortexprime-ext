import { localizer } from './foundryHelpers.js'

// A plain promise-resolving Dialog listing the GM-configured Plot Point usage options as a
// single set of radio buttons (only one selectable across every group) plus a "Spend Plot
// Point" button to commit the choice, resolving with the selected option's label, or null if
// cancelled/closed without a choice.
export const selectPlotPointUsage = async () => {
  const plotPointUses = game.settings.get('cortexprime-ext', 'plotPointUses') ?? {}
  const groups = [
    { label: localizer('PlotPointUsesGeneral'), uses: Object.values(plotPointUses.general ?? {}) },
    { label: localizer('PlotPointUsesOpportunity'), uses: Object.values(plotPointUses.opportunity ?? {}) }
  ]
  const themes = game.settings.get('cortexprime-ext', 'themes')
  const theme = themes.current === 'custom' ? themes.custom : themes.list[themes.current]

  const content = await foundry.applications.handlebars.renderTemplate(
    'systems/cortexprime-ext/templates/dialog/plot-point-use.html', { groups, theme }
  )

  return new Promise(resolve => {
    let resolved = false
    const resolveOnce = value => {
      if (resolved) return
      resolved = true
      resolve(value)
    }

    const dialog = new Dialog({
      title: localizer('SpendPlotPoint'),
      content,
      buttons: {
        cancel: {
          icon: '<i class="fa-solid fa-xmark"></i>',
          label: localizer('Cancel'),
          callback: () => resolveOnce(null)
        }
      },
      default: 'cancel',
      close: () => resolveOnce(null),
      render (html) {
        html.find('.spend-plot-point').click(() => {
          const selected = html.find('.plot-point-use-option:checked').val()

          if (!selected) return

          resolveOnce(selected)
          dialog.close()
        })
      }
    }, { jQuery: true, classes: ['dialog', 'plot-point-use-dialog', 'cortexprime'] })

    dialog.render(true)
  })
}
