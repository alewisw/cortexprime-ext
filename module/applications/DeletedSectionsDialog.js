import { getLength } from '../../lib/helpers.js'
import { localizer } from '../scripts/foundryHelpers.js'
import { previewText, removeDeletedSection } from '../scripts/deletedSectionsLogic.js'

export class DeletedSectionsDialog extends FormApplication {
  constructor (actor, tabIndex) {
    super()

    this.actor = actor
    this.tabIndex = tabIndex
    this.path = `system.actorType.additionalTabs.${tabIndex}`
  }

  static get defaultOptions () {
    return foundry.utils.mergeObject(super.defaultOptions, {
      id: 'deleted-sections-dialog',
      template: 'systems/cortexprime-ext/templates/dialog/deleted-sections.html',
      title: localizer('DeletedSections'),
      classes: ['cortexprime', 'deleted-sections-dialog'],
      width: 420,
      height: 'auto',
      closeOnSubmit: false,
      submitOnChange: false,
      submitOnClose: false
    })
  }

  async getData () {
    const deletedSections = foundry.utils.getProperty(this.actor, `${this.path}.deletedSections`) ?? {}

    return {
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

  activateListeners (html) {
    super.activateListeners(html)
    html.find('.restore-section').click(this._onRestore.bind(this))
  }

  async _onRestore (event) {
    event.preventDefault()
    const { index } = event.currentTarget.dataset

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

    this.render(true)
  }

  async _updateObject () {}
}
