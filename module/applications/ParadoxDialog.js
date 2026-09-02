import { getCurrentTheme, localizer } from '../scripts/foundryHelpers.js'
import { applyParadoxOutcome, localizeParadoxLog } from '../mage/paradox.js'
import { LIMIT_STATES } from '../mage/paradoxLogic.js'

// Shown on the Player's own client once the GM's client has worked out what Paradox their roll
// earned (see module/mage/paradox.js). Nothing is written until Confirm.
export class ParadoxDialog extends FormApplication {
  constructor ({ actor, pending }) {
    // Scoped per actor so two players resolving Paradox at once get separate windows.
    super({}, { id: `paradox-dialog-${actor.id}` })

    this.actor = actor
    this.pending = pending
  }

  static get defaultOptions () {
    return foundry.utils.mergeObject(super.defaultOptions, {
      id: 'paradox-dialog',
      template: 'systems/cortexprime-ext/templates/dialog/paradox.html',
      title: localizer('Paradox'),
      classes: ['cortexprime', 'paradox-dialog'],
      width: 460,
      height: 'auto',
      closeOnSubmit: false,
      submitOnChange: false,
      submitOnClose: false
    })
  }

  async getData () {
    const theme = getCurrentTheme()

    return {
      log: localizeParadoxLog(this.pending.log),
      // Exactly one of these three is shown: two dead-end explanations, or the offer to limit.
      cannotLimitVulgarBotch: this.pending.limitState === LIMIT_STATES.VULGAR_BOTCH,
      tooLargeToLimit: this.pending.limitState === LIMIT_STATES.TOO_LARGE,
      canLimit: this.pending.limitState === LIMIT_STATES.AVAILABLE,
      theme
    }
  }

  activateListeners (html) {
    super.activateListeners(html)

    html.find('.paradox-confirm').click(this._onConfirm.bind(this))
  }

  async _onConfirm (event) {
    event.preventDefault()

    // Guard against a double click landing two sets of writes while the first is still in flight.
    if (this._confirming) return

    this._confirming = true

    try {
      const limitApplied = this.canLimit && this.element.find('.paradox-limit-checkbox').prop('checked')

      await applyParadoxOutcome({ actor: this.actor, pending: this.pending, limitApplied: !!limitApplied })

      this.close()
    } catch (error) {
      this._confirming = false
      console.error('CP | Paradox: could not apply the outcome', error)
      ui.notifications.error(localizer('ParadoxApplyFailed'))
    }
  }

  get canLimit () {
    return this.pending.limitState === LIMIT_STATES.AVAILABLE
  }

  async _updateObject () {}
}
