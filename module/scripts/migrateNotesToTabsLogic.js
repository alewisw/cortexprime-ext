// Pure decision logic for the one-time migration of the old "hasNotesPage" boolean into the new
// "Additional Tabs" list, and of each actor's old top-level notes into the tab that replaces it.
// Kept free of any Foundry globals so it's unit-testable; the game.settings/actor.update calls
// live in migrateNotesToTabs.js.
import { getLength } from '../../lib/helpers.js'

// A deterministic id, so re-running this against an Actor Type that was already migrated (its
// hasNotesPage has already been removed) never produces a second, different "Notes" tab.
export const getMigratedNotesTabId = actorTypeId => `_notes-${actorTypeId}`

// Adds an Additional Tab named "Notes" to every Actor Type still carrying the old hasNotesPage
// flag, and drops the flag. Returns the updated actorTypes object, or null if nothing needed it —
// so the caller can skip the write entirely (and know not to touch any actors either).
export const computeMigratedActorTypes = (actorTypes, notesLabel = 'Notes') => {
  let changed = false

  const migrated = Object.keys(actorTypes ?? {}).reduce((acc, key) => {
    const actorType = actorTypes[key]

    if (!actorType.hasNotesPage) return { ...acc, [key]: actorType }

    changed = true

    const { hasNotesPage, ...rest } = actorType
    const additionalTabs = rest.additionalTabs ?? {}

    return {
      ...acc,
      [key]: {
        ...rest,
        additionalTabs: {
          ...additionalTabs,
          [getLength(additionalTabs)]: { id: getMigratedNotesTabId(actorType.id), name: notesLabel }
        }
      }
    }
  }, {})

  return changed ? migrated : null
}

// Moves an actor's old top-level system.actorType.notes under the Additional Tab identified by
// migratedTabId (the id computed above for that actor's Actor Type). Returns the updated
// system.actorType object, or null if there's nothing to move (no old notes, or the target tab
// doesn't exist on this actor yet — e.g. its Actor Type was never migrated).
export const computeMigratedActorNotes = (actorTypeData, migratedTabId) => {
  const { notes, ...rest } = actorTypeData ?? {}

  if (!notes || !getLength(notes)) return null

  const additionalTabs = rest.additionalTabs ?? {}
  const tabIndex = Object.keys(additionalTabs).find(key => additionalTabs[key].id === migratedTabId)

  if (tabIndex === undefined) return null

  return {
    ...rest,
    additionalTabs: {
      ...additionalTabs,
      [tabIndex]: { ...additionalTabs[tabIndex], notes }
    }
  }
}
