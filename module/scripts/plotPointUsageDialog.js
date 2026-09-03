import { getCurrentTheme, localizer } from './foundryHelpers.js'

// Lists the GM-configured Plot Point usage options as a single set of radio buttons (only one
// selectable across every group) plus a "Spend Plot Point" button to commit the choice. Resolves
// with the selected option's label, or null if cancelled or closed without a choice.
export const selectPlotPointUsage = async () => {
  const plotPointUses = game.settings.get('cortexprime-ext', 'plotPointUses') ?? {}
  const groups = [
    { label: localizer('PlotPointUsesGeneral'), uses: Object.values(plotPointUses.general ?? {}) },
    { label: localizer('PlotPointUsesOpportunity'), uses: Object.values(plotPointUses.opportunity ?? {}) }
  ]
  const theme = getCurrentTheme()

  const content = await foundry.applications.handlebars.renderTemplate(
    'systems/cortexprime-ext/templates/dialog/plot-point-use.html', { groups, theme }
  )

  // The commit button lives inside the rendered content, styled as part of the themed section,
  // rather than being one of the dialog's own footer buttons. So the choice is stashed here and
  // handed back through the `close` callback, which DialogV2.wait resolves with.
  let selected = null

  const result = await foundry.applications.api.DialogV2.wait({
    window: { title: localizer('SpendPlotPoint') },
    classes: ['cortexprime', 'plot-point-use-dialog'],
    content,
    buttons: [
      {
        action: 'cancel',
        label: 'Cancel',
        icon: 'fa-solid fa-xmark',
        default: true,
        // Deliberately false rather than null: DialogV2 substitutes the button's own action id
        // when a callback returns null or undefined, which would resolve this to the string
        // 'cancel' and be indistinguishable from a chosen usage.
        callback: () => false
      }
    ],
    close: () => selected,
    render: (event, dialog) => {
      dialog.element.querySelector('.spend-plot-point')?.addEventListener('click', () => {
        const chosen = dialog.element.querySelector('.plot-point-use-option:checked')?.value

        if (!chosen) return

        selected = chosen
        dialog.close()
      })
    }
  })

  // Every non-selection path — Cancel, Escape, the window's X — lands as false or null here.
  return typeof result === 'string' ? result : null
}
