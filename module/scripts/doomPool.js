// Button that opens the GM-designated Doom Pool actor (set via Doom Pool Settings). Visible
// to both GM and players, and only present at all once a Doom Pool actor has been configured.
import { FloatingPanel } from '../applications/FloatingPanel.js'
import { localizer } from './foundryHelpers.js'

const getDoomPoolActor = () => {
  const actorId = game.settings.get('cortexprime', 'doomPoolActorId')
  return actorId ? game.actors.get(actorId) : null
}

export const registerDoomPool = () => {
  FloatingPanel.registerButton({
    id: 'doom-pool',
    icon: 'fa-solid fa-skull-crossbones',
    tooltip: () => localizer('OpenDoomPool'),
    isVisible: () => !!getDoomPoolActor(),
    isActive: () => !!getDoomPoolActor()?.sheet?.rendered,
    onClick: () => {
      const actor = getDoomPoolActor()

      if (!actor) return

      if (actor.sheet.rendered) {
        actor.sheet.close()
      } else {
        actor.sheet.render(true)
      }
    }
  })

  Hooks.on('updateSetting', setting => {
    if (setting.key === 'cortexprime.doomPoolActorId') {
      game.cortexprime.FloatingPanel?.refresh()
    }
  })
}
