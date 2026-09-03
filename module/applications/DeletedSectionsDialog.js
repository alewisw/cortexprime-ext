import { getLength } from '../../lib/helpers.js'
import { CortexApplicationV2 } from './CortexApplicationV2.js'
import { previewText, removeDeletedSection } from '../scripts/deletedSectionsLogic.js'

export class DeletedSectionsDialog extends CortexApplicationV2 {
  constructor (actor, tabIndex) {
    super()

    this.actor = actor
    this.tabIndex = tabIndex
    this.path = `system.actorType.additionalTabs.${tabIndex}`
  }

  static DEFAULT_OPTIONS = {
    id: 'deleted-sections-dialog',
    classes: ['deleted-sections-dialog'],
    position: { width: 420, height: 'auto' },
    // A localization key, not a localized string - DEFAULT_OPTIONS is evaluated at module load,
    // before game.i18n exists. ApplicationV2's title getter localizes it on demand.
    window: { title: 'DeletedSections' },
    actions: {
      restoreSection: DeletedSectionsDialog.#onRestore
    }
  }

  static PARTS = {
    content: { template: 'systems/cortexprime-ext/templates/dialog/deleted-sections.html' }
  }

  async _prepareContext (options) {
    const deletedSections = foundry.utils.getProperty(this.actor, `${this.path}.deletedSections`) ?? {}

    return {
      ...await super._prepareContext(options),
      deletedSections: Object.keys(deletedSections)
        .sort((a, b) => parseInt(a, 10) - parseInt(b, 10))
        .map(index => {
          const entry = deletedSections[index]

          return {
            index,
            label: entry.label,
            preview: previewText(entry.value),
            deletedAtDisplay: new Date(entry.deletedAt).toLocaleString()
          }
        })
    }
  }

  // An `actions` handler: called with `this` bound to the instance, and `target` being the
  // element carrying data-action (so no event.currentTarget dance, and no rebinding needed
  // after a re-render - ApplicationV2 delegates from the root).
  static async #onRestore (event, target) {
    event.preventDefault()
    const { index } = target.dataset

    const deletedSections = foundry.utils.getProperty(this.actor, `${this.path}.deletedSections`) ?? {}
    const restoredEntry = deletedSections[index]

    if (!restoredEntry) return

    const { deletedAt, ...note } = restoredEntry
    const currentNotes = foundry.utils.getProperty(this.actor, `${this.path}.notes`) ?? {}
    const newNotes = { ...currentNotes, [getLength(currentNotes)]: note }
    const newDeletedSections = removeDeletedSection(deletedSections, index)

    // Unset-then-set, in two separate calls, per the warning in actor-sheet.js's
    // _resetDataPoints - combining an unset with its accompanying set in one actor.update() lets
    // Foundry apply the deletion after the merge, silently dropping the value just written.
    await this.actor.update({
      [`${this.path}.-=notes`]: null,
      [`${this.path}.-=deletedSections`]: null
    })

    await this.actor.update({
      [`${this.path}.notes`]: newNotes,
      [`${this.path}.deletedSections`]: newDeletedSections
    })

    await this.render()
  }
}
