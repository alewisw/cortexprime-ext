import { localizer } from '../scripts/foundryHelpers.js'
import { CortexApplicationV2 } from './CortexApplicationV2.js'
import { applyParadoxOutcome, localizeParadoxLog } from '../mage/paradox.js'
import { LIMIT_STATES } from '../mage/paradoxLogic.js'

// Shown on the Player's own client once the GM's client has worked out what Paradox their roll
// earned (see module/mage/paradox.js). Nothing is written until Confirm.
export class ParadoxDialog extends CortexApplicationV2 {
  constructor ({ actor, pending }) {
    // Scoped per actor so two players resolving Paradox at once get separate windows. This is the
    // instance options argument, which overrides DEFAULT_OPTIONS - hence no id there.
    super({ id: `paradox-dialog-${actor.id}` })

    this.actor = actor
    this.pending = pending
  }

  static DEFAULT_OPTIONS = {
    classes: ['paradox-dialog'],
    position: { width: 460, height: 'auto' },
    // A localization key, not a localized string: DEFAULT_OPTIONS is evaluated at module load,
    // before game.i18n exists.
    window: { title: 'Paradox' },
    actions: {
      confirmParadox: ParadoxDialog.#onConfirm
    }
  }

  static PARTS = {
    content: { template: 'systems/cortexprime-ext/templates/dialog/paradox.html' }
  }

  async _prepareContext (options) {
    return {
      ...await super._prepareContext(options),
      log: localizeParadoxLog(this.pending.log),
      // Exactly one of these three is shown: two dead-end explanations, or the offer to limit.
      cannotLimitVulgarBotch: this.pending.limitState === LIMIT_STATES.VULGAR_BOTCH,
      tooLargeToLimit: this.pending.limitState === LIMIT_STATES.TOO_LARGE,
      canLimit: this.pending.limitState === LIMIT_STATES.AVAILABLE
    }
  }

  static async #onConfirm (event, target) {
    event.preventDefault()

    // Guard against a double click landing two sets of writes while the first is still in flight.
    if (this._confirming) return

    this._confirming = true

    try {
      // this.element is an HTMLElement under V2, not a jQuery object.
      const limitApplied = this.canLimit && !!this.element.querySelector('.paradox-limit-checkbox')?.checked

      await applyParadoxOutcome({ actor: this.actor, pending: this.pending, limitApplied })

      await this.close()
    } catch (error) {
      this._confirming = false
      console.error('CP | Paradox: could not apply the outcome', error)
      ui.notifications.error(localizer('ParadoxApplyFailed'))
    }
  }

  get canLimit () {
    return this.pending.limitState === LIMIT_STATES.AVAILABLE
  }
}
