// GM-only button that opens the Journal Entry Page linked to the active Scene (via
// Foundry's built-in Scene Configuration > Journal tab). Only present when such a link exists.
import { FloatingPanel } from '../applications/FloatingPanel.js'
import { localizer } from './foundryHelpers.js'

// scene.journal / scene.journalEntryPage may come back as either the resolved Document
// or a raw id string depending on how the ForeignDocumentField resolves, so normalize both.
const getLinkedJournal = () => {
  const journalRef = game.scenes?.active?.journal

  if (!journalRef) return null

  return typeof journalRef === 'string' ? game.journal.get(journalRef) : journalRef
}

const getLinkedPageId = () => {
  const pageRef = game.scenes?.active?.journalEntryPage

  if (!pageRef) return null

  return typeof pageRef === 'string' ? pageRef : pageRef.id
}

export const registerSceneJournal = () => {
  FloatingPanel.registerButton({
    id: 'scene-journal',
    icon: 'fa-solid fa-book-open',
    tooltip: () => localizer('OpenSceneJournal'),
    isVisible: () => game.user.isGM && !!getLinkedJournal() && !!getLinkedPageId(),
    isActive: () => !!getLinkedJournal()?.sheet?.rendered,
    onClick: () => {
      const journal = getLinkedJournal()

      if (!journal) return

      if (journal.sheet.rendered) {
        journal.sheet.close()
      } else {
        journal.sheet.render(true, { pageId: getLinkedPageId() })
      }
    }
  })
}
