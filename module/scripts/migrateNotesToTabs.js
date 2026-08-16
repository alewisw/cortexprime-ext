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

    // Two separate calls, matching the unset-then-set convention used throughout actor-sheet.js —
    // only additionalTabs is actually changing here, but the stale top-level notes key still needs
    // an explicit -= unset of its own; a merge-based update() never deletes a removed key on its own.
    try {
      await actor.update({ 'system.actorType.-=notes': null })
      await actor.update({ 'system.actorType.additionalTabs': migrated.additionalTabs })
    } catch (error) {
      console.warn('CP | Could not migrate notes to Additional Tabs for actor', actor.name, error)
    }
  }
}

export const registerMigrateNotesToTabs = () => {
  Hooks.once('ready', () => { migrateNotesToTabs() })
}
