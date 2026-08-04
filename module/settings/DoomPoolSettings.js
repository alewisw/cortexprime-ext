import { localizer } from '../scripts/foundryHelpers.js'

export default class DoomPoolSettings extends FormApplication {
  constructor() {
    super()
  }

  static get defaultOptions () {
    return foundry.utils.mergeObject(super.defaultOptions, {
      id: 'doom-pool-settings',
      template: 'systems/cortexprime/templates/settings/doom-pool.html',
      title: localizer('DoomPoolSettings'),
      classes: ['doom-pool-settings'],
      width: 400,
      height: 'auto',
      closeOnSubmit: false,
      submitOnClose: true,
      submitOnChange: true
    })
  }

  getData () {
    const visibleOwnershipLevels = [CONST.DOCUMENT_OWNERSHIP_LEVELS.LIMITED, CONST.DOCUMENT_OWNERSHIP_LEVELS.OBSERVER]

    return {
      doomPoolActorId: game.settings.get('cortexprime', 'doomPoolActorId'),
      actors: game.actors.contents
        .filter(actor => visibleOwnershipLevels.includes(actor.ownership.default))
        .sort((a, b) => a.name.localeCompare(b.name))
    }
  }

  async _updateObject (event, formData) {
    await game.settings.set('cortexprime', 'doomPoolActorId', formData.doomPoolActorId || '')
  }
}
