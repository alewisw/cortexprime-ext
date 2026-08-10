import { localizer } from '../scripts/foundryHelpers.js'

export default class MageSettings extends FormApplication {
  constructor() {
    super()
  }

  static get defaultOptions () {
    return foundry.utils.mergeObject(super.defaultOptions, {
      id: 'mage-settings',
      template: 'systems/cortexprime/templates/settings/mage-settings.html',
      title: localizer('MageSettings'),
      classes: ['cortexprime', 'mage-settings'],
      width: 500,
      height: 'auto',
      closeOnSubmit: false,
      submitOnClose: true,
      submitOnChange: true
    })
  }

  getData () {
    const mageSettings = game.settings.get('cortexprime', 'mageSettings')
    const actorTypes = Object.values(game.settings.get('cortexprime', 'actorTypes'))
    const locationActorType = actorTypes.find(actorType => actorType.id === mageSettings.locationActorTypeId)
    const playerCharacterActorType = actorTypes.find(actorType => actorType.id === mageSettings.playerCharacterActorTypeId)

    return {
      ...mageSettings,
      actorTypes,
      locationSimpleTraits: Object.values(locationActorType?.simpleTraits ?? {}),
      playerCharacterSimpleTraits: Object.values(playerCharacterActorType?.simpleTraits ?? {}),
      playerCharacterTraitSets: Object.values(playerCharacterActorType?.traitSets ?? {})
    }
  }

  async _updateObject (event, formData) {
    await game.settings.set('cortexprime', 'mageSettings', foundry.utils.expandObject(formData))

    // The Simple Trait/Trait Set dropdowns depend on whichever Actor Type was just picked, so the
    // form needs a full re-render to repopulate them — submitOnChange alone doesn't do this.
    this.render(true)
  }
}
