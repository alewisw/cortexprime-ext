import { CortexApplicationV2 } from '../applications/CortexApplicationV2.js'

export default class DoomPoolSettings extends CortexApplicationV2 {
  static DEFAULT_OPTIONS = {
    id: 'doom-pool-settings',
    // 'cortexprime' comes from CortexApplicationV2; ApplicationV2 merges classes down the chain.
    classes: ['doom-pool-settings'],
    // The app's root element IS the form, so templates/settings/doom-pool.html no longer carries
    // a <form> of its own - a nested one would be invalid markup and would not submit.
    tag: 'form',
    position: { width: 500, height: 'auto' },
    // A localization KEY, not a localized string: ApplicationV2's `title` getter localizes this
    // on demand. Localizing here would run at module evaluation, long before game.i18n exists.
    window: { title: 'DoomPoolSettings' },
    form: {
      handler: DoomPoolSettings.#onSubmit,
      submitOnChange: true,
      closeOnSubmit: false
    }
  }

  static PARTS = {
    form: { template: 'systems/cortexprime-ext/templates/settings/doom-pool.html' }
  }

  async _prepareContext (options) {
    const visibleOwnershipLevels = [CONST.DOCUMENT_OWNERSHIP_LEVELS.LIMITED, CONST.DOCUMENT_OWNERSHIP_LEVELS.OBSERVER]
    const doomPoolActorId = game.settings.get('cortexprime-ext', 'doomPoolActorId')
    const doomPoolActor = doomPoolActorId ? game.actors.get(doomPoolActorId) : null

    return {
      ...await super._prepareContext(options),
      doomPoolActorId,
      doomPoolTraitId: game.settings.get('cortexprime-ext', 'doomPoolTraitId'),
      actors: game.actors.contents
        .filter(actor => visibleOwnershipLevels.includes(actor.ownership.default))
        .sort((a, b) => a.name.localeCompare(b.name)),
      doomPoolSimpleTraits: Object.values(doomPoolActor?.system.actorType?.simpleTraits ?? {})
    }
  }

  // Static, and invoked with `this` bound to the instance (ApplicationV2 calls it via
  // handler.call(this, ...)), which is why the re-render below works.
  static async #onSubmit (event, form, formData) {
    const { doomPoolActorId, doomPoolTraitId } = foundry.utils.expandObject(formData.object)

    await game.settings.set('cortexprime-ext', 'doomPoolActorId', doomPoolActorId || '')
    await game.settings.set('cortexprime-ext', 'doomPoolTraitId', doomPoolTraitId || '')

    // The Trait dropdown depends on whichever Actor was just picked, so the form needs a full
    // re-render to repopulate it — submitOnChange alone doesn't do this.
    await this.render()
  }
}
