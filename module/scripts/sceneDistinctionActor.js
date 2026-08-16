// Links a Scene to the Actor holding its Distinctions, adds a floating-panel button to
// open/close that Actor's sheet, and keeps the Actor's ownership in sync with which Scene
// is currently active.
import { FloatingPanel } from '../applications/FloatingPanel.js'
import { localizer } from './foundryHelpers.js'

const OWNERSHIP = CONST.DOCUMENT_OWNERSHIP_LEVELS

const getLinkedActor = () => {
  const actorId = game.scenes?.active?.getFlag('cortexprime-ext', 'linkedActorId')
  return actorId ? game.actors.get(actorId) : null
}

const syncDistinctionActorPermissions = async scene => {
  const previousActorId = game.settings.get('cortexprime-ext', 'activeDistinctionActorId')
  const newActorId = scene?.getFlag('cortexprime-ext', 'linkedActorId') || ''

  if (previousActorId && previousActorId !== newActorId) {
    const previousActor = game.actors.get(previousActorId)

    if (previousActor && previousActor.ownership.default !== OWNERSHIP.NONE) {
      await previousActor.update({ ownership: { default: OWNERSHIP.NONE } })
    }
  }

  if (newActorId) {
    const newActor = game.actors.get(newActorId)

    if (newActor && newActor.ownership.default !== OWNERSHIP.OBSERVER) {
      await newActor.update({ ownership: { default: OWNERSHIP.OBSERVER } })
    }
  }

  if (newActorId !== previousActorId) {
    await game.settings.set('cortexprime-ext', 'activeDistinctionActorId', newActorId)
  }
}

const injectLinkedActorField = (app, html) => {
  const element = html instanceof HTMLElement ? html : html[0]
  const form = element.matches?.('form') ? element : element.querySelector('form')
  const tab = element.querySelector('.tab[data-tab="basic"]') || form?.querySelector('fieldset') || form

  if (!tab) return

  const currentActorId = app.document.getFlag('cortexprime-ext', 'linkedActorId') || ''

  const fieldGroup = document.createElement('div')
  fieldGroup.classList.add('form-group')
  fieldGroup.innerHTML = `
    <label>${localizer('LinkedDistinctionActor')}</label>
    <div class="form-fields">
      <select name="flags.cortexprime-ext.linkedActorId">
        <option value="">${localizer('None')}</option>
      </select>
    </div>
  `

  const select = fieldGroup.querySelector('select')
  game.actors.contents
    .sort((a, b) => a.name.localeCompare(b.name))
    .forEach(actor => {
      const option = document.createElement('option')
      option.value = actor.id
      option.textContent = actor.name
      option.selected = actor.id === currentActorId
      select.appendChild(option)
    })

  tab.appendChild(fieldGroup)
}

export const registerSceneDistinctionActor = () => {
  FloatingPanel.registerButton({
    id: 'scene-distinction-actor',
    icon: 'fa-solid fa-house',
    tooltip: () => localizer(getLinkedActor() ? 'OpenDistinctionActor' : 'NoDistinctionActorLinked'),
    isEnabled: () => !!getLinkedActor(),
    isActive: () => !!getLinkedActor()?.sheet?.rendered,
    onClick: async () => {
      const actor = getLinkedActor()

      if (!actor) return

      if (actor.sheet.rendered) {
        actor.sheet.close()
      } else {
        actor.sheet.render(true)
      }
    }
  })

  Hooks.on('renderSceneConfig', injectLinkedActorField)

  Hooks.on('updateScene', async (scene, data, options, userId) => {
    if ('active' in data && data.active && game.user === game.users.activeGM) {
      await syncDistinctionActorPermissions(scene)
    }

    game.cortexprime.FloatingPanel?.refresh()
  })

  Hooks.on('updateActor', (actor) => {
    if (actor.sheet?.rendered && !actor.testUserPermission(game.user, OWNERSHIP.OBSERVER)) {
      actor.sheet.close()
    }

    game.cortexprime.FloatingPanel?.refresh()
  })

  Hooks.on('renderCortexPrimeActorSheet', () => {
    game.cortexprime.FloatingPanel?.refresh()
  })

  Hooks.on('closeCortexPrimeActorSheet', () => {
    game.cortexprime.FloatingPanel?.refresh()
  })

  Hooks.once('ready', async () => {
    if (game.user === game.users.activeGM) {
      await syncDistinctionActorPermissions(game.scenes.active)
    }
  })
}
