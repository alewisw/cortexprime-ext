// One-time, automatic migration of the old "hasNotesPage" boolean (a single fixed Notes tab) into
// the new "Additional Tabs" list — an Actor Type that had it gets one Additional Tab named "Notes",
// and every actor's old top-level notes move under it. Idempotent by construction
// (computeMigratedActorTypes only acts on Actor Types still carrying hasNotesPage, which it also
// removes), so it's safe to run on every ready rather than needing a version-gate setting.
import { applyActorTypeInheritance } from '../actor/actorTypeInheritanceLogic.js'
import { localizer } from './foundryHelpers.js'
import {
  computeMigratedActorNotes,
  computeMigratedActorTypes,
  getMigratedNotesTabId
} from './migrateNotesToTabsLogic.js'

export const migrateNotesToTabs = async () => {
  if (game.user !== game.users.activeGM) return

  const actorTypes = game.settings.get('cortexprime-ext', 'actorTypes')
  const migratedActorTypes = computeMigratedActorTypes(actorTypes, localizer('Notes'))

  if (migratedActorTypes) {
    // The migration deliberately skips derived Actor Types; reconciling here is what hands them
    // the Notes tab their parent just gained, and drops the inherited hasNotesPage flag with it.
    await game.settings.set('cortexprime-ext', 'actorTypes', applyActorTypeInheritance(migratedActorTypes))
  }

  // Actor Types not migrated just now may still have been migrated on a previous run — every
  // actor whose Actor Type ever went through this needs checking, not just ones from this pass.
  for (const actor of game.actors.contents) {
    const actorTypeId = actor.system.actorType?.id

    if (!actorTypeId) continue

    const migratedTabId = getMigratedNotesTabId(actorTypeId)
    const migrated = computeMigratedActorNotes(actor.system.actorType, migratedTabId)

    if (!migrated) continue

    // One update: the stale top-level notes key needs an explicit -= unset (a merge-based update()
    // never deletes a removed key on its own), and it is a different key from additionalTabs, so the
    // two can share a call - only an unset and a set of the SAME key conflict.
    try {
      await actor.update({
        'system.actorType.-=notes': null,
        'system.actorType.additionalTabs': migrated.additionalTabs
      })
    } catch (error) {
      console.warn('CP | Could not migrate notes to Additional Tabs for actor', actor.name, error)
    }
  }
}

export const registerMigrateNotesToTabs = () => {
  Hooks.once('ready', () => { migrateNotesToTabs() })
}
