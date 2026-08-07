// FloatingPanel widget/button wiring for the Crisis Pool — kept separate from crisisPool.js
// (state + pure algorithm) so that file can stay free of Foundry Application-extending
// imports and remain safely importable from rollToBeat.js and unit tests.
import { FloatingPanel } from '../applications/FloatingPanel.js'
import { CrisisPoolDialog } from '../applications/CrisisPoolDialog.js'
import { localizer } from './foundryHelpers.js'
import { getCrisisPool } from './crisisPool.js'

export const registerCrisisPool = () => {
  FloatingPanel.registerWidget({
    id: 'crisis-pool',
    template: 'systems/cortexprime/templates/partials/floating-panel/crisis-pool.html',
    getContext: () => {
      const pool = getCrisisPool()

      if (!pool.active) return {}

      return { active: true, name: pool.name, dice: pool.dice }
    }
  })

  FloatingPanel.registerButton({
    id: 'crisis-pool-toggle',
    icon: 'fa-solid fa-triangle-exclamation',
    tooltip: () => localizer(getCrisisPool().active ? 'EditCrisis' : 'StartCrisis'),
    isVisible: () => game.user.isGM,
    isActive: () => getCrisisPool().active,
    onClick: () => {
      new CrisisPoolDialog().render(true)
    }
  })

  Hooks.on('updateSetting', async setting => {
    if (setting.key === 'cortexprime.crisisPool') {
      game.cortexprime.FloatingPanel?.refresh()
      await game.cortexprime.UserDicePool?.refreshCrisisPool()
    }
  })
}
