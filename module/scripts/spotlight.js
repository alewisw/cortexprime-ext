// Lets the GM highlight which connected player's character currently has the narrative
// spotlight; visible to all players via a floating-panel widget.
import { FloatingPanel } from '../applications/FloatingPanel.js'
import { onSettingChanged } from './foundryHelpers.js'

const getConnectedPlayerActors = () => game.users.contents
  .filter(user => user.active && !user.isGM && user.character)
  .map(user => user.character)
  .sort((a, b) => a.name.localeCompare(b.name))

export const registerSpotlight = () => {
  FloatingPanel.registerWidget({
    id: 'spotlight',
    template: 'systems/cortexprime-ext/templates/partials/floating-panel/spotlight.html',
    getContext: () => {
      if (!game.settings.get('cortexprime-ext', 'spotlightEnabled')) {
        return { enabled: false }
      }

      const actorId = game.settings.get('cortexprime-ext', 'spotlightActorId')

      return {
        enabled: true,
        isGM: game.user.isGM,
        actor: actorId ? game.actors.get(actorId) : null,
        options: game.user.isGM ? getConnectedPlayerActors() : null
      }
    },
    activateListeners: html => {
      html.find('.spotlight-select').on('change', async event => {
        await game.settings.set('cortexprime-ext', 'spotlightActorId', event.currentTarget.value)
      })
    }
  })

  onSettingChanged(setting => {
    if (setting.key === 'cortexprime-ext.spotlightActorId' || setting.key === 'cortexprime-ext.spotlightEnabled') {
      game.cortexprime.FloatingPanel?.refresh()
    }
  })

  Hooks.on('renderPlayerList', () => {
    game.cortexprime.FloatingPanel?.refresh()
  })

  // renderPlayerList alone isn't reliable for a freshly-connecting player — the eligible-target
  // list (getConnectedPlayerActors, filtered on user.active) needs to refresh the moment someone
  // else's connection state actually changes, which is exactly what this hook is for.
  Hooks.on('userConnected', () => {
    game.cortexprime.FloatingPanel?.refresh()
  })
}
