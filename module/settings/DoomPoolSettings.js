import { localizer } from '../scripts/foundryHelpers.js'

export default class DoomPoolSettings extends FormApplication {
  constructor() { super() }
  static get defaultOptions () {
    return foundry.utils.mergeObject(super.defaultOptions, {
      id: 'doom-pool-settings',
      template: 'systems/cortexprime-ext/templates/settings/doom-pool.html',
      title: localizer('DoomPoolSettings'),
      classes: ['cortexprime', 'doom-pool-settings'],
      width: 500,
      height: 'auto',
      closeOnSubmit: false,
      submitOnClose: true,
      submitOnChange: true
    })
  }
  getData () {
    const visibleOwnershipLevels = [CONST.DOCUMENT_OWNERSHIP_LEVELS.LIMITED, CONST.DOCUMENT_OWNERSHIP_LEVELS.OBSERVER]
    const doomPoolActorId = game.settings.get('cortexprime-ext', 'doomPoolActorId')
    const doomPoolActor = doomPoolActorId ? game.actors.get(doomPoolActorId) : null

    return {
      doomPoolActorId,
      doomPoolTraitId: game.settings.get('cortexprime-ext', 'doomPoolTraitId'),
      actors: game.actors.contents
        .filter(actor => visibleOwnershipLevels.includes(actor.ownership.default))
        .sort((a, b) => a.name.localeCompare(b.name)),
      doomPoolSimpleTraits: Object.values(doomPoolActor?.system.actorType?.simpleTraits ?? {})
    }
  }
  async _updateObject (event, formData) {
    await game.settings.set('cortexprime-ext', 'doomPoolActorId', formData.doomPoolActorId || '')
    await game.settings.set('cortexprime-ext', 'doomPoolTraitId', formData.doomPoolTraitId || '')

    // The Trait dropdown depends on whichever Actor was just picked, so the form needs a full
    // re-render to repopulate it — submitOnChange alone doesn't do this.
    this.render(true)
  }
}
