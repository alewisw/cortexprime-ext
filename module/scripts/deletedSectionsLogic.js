// Pure logic behind an Additional Tab's Deleted Sections queue: the last 10 sections removed from
// that tab, newest first, kept intact enough to restore. Kept free of any Foundry globals so it's
// unit-testable; the actor.update() calls live in actor-sheet.js.
import { getLength } from '../../lib/helpers.js'

const CAP = 10

// Prepends `note` (stamped with a deletion time) onto the queue, reindexed so entry 0 is always
// the most recent, and drops anything past `cap` — the oldest deletion becomes unrecoverable once
// an 11th happens, matching "last 10".
export const pushDeletedSection = (deletedSections, note, cap = CAP) => {
  const entries = [{ ...note, deletedAt: Date.now() }, ...Object.values(deletedSections ?? {})]

  return entries.slice(0, cap).reduce((acc, entry) => ({ ...acc, [getLength(acc)]: entry }), {})
}

// The queue with one entry removed (after it's been restored) and the rest reindexed contiguous.
export const removeDeletedSection = (deletedSections, index) => {
  const targetKey = String(index)

  return Object.keys(deletedSections ?? {})
    .filter(key => key !== targetKey)
    .reduce((acc, key) => ({ ...acc, [getLength(acc)]: deletedSections[key] }), {})
}

// A short, tag-free preview of a deleted section's content, for the restore dialog's list rows.
export const previewText = (value, maxLength = 120) => {
  const stripped = (value ?? '').replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim()

  return stripped.length > maxLength ? `${stripped.slice(0, maxLength)}…` : stripped
}
