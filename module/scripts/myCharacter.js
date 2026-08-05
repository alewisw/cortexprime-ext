// Player-only button that opens the Actor assigned to the current user (game.user.character).
// Never shown to the GM, and absent entirely if the player has no assigned character.
import { FloatingPanel } from '../applications/FloatingPanel.js'
import { localizer } from './foundryHelpers.js'

export const registerMyCharacter = () => {
  FloatingPanel.registerButton({
    id: 'my-character',
    icon: 'fa-solid fa-user',
    tooltip: () => localizer('OpenMyCharacter'),
    isVisible: () => !game.user.isGM && !!game.user.character,
    isActive: () => !!game.user.character?.sheet?.rendered,
    onClick: () => {
      const actor = game.user.character

      if (!actor) return

      if (actor.sheet.rendered) {
        actor.sheet.close()
      } else {
        actor.sheet.render(true)
      }
    }
  })

  Hooks.on('updateUser', (user, data) => {
    if (user.id === game.user.id && 'character' in data) {
      game.cortexprime.FloatingPanel?.refresh()
    }
  })
}
