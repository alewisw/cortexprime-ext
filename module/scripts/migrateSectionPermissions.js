// One-time, automatic migration of an Additional Tab section's single `locked` boolean into three
// independent switches (allowRename/allowDeletion/allowEdit). Idempotent by construction
// (computeMigratedActorTypes/computeMigratedActorNotes only act on entries still carrying
// `locked`, which they also remove), so it's safe to run on every ready rather than needing a
// version-gate setting — same shape as migrateNotesToTabs.js.
import { applyActorTypeInheritance } from '../actor/actorTypeInheritanceLogic.js'
import { computeMigratedActorNotes, computeMigratedActorTypes } from './migrateSectionPermissionsLogic.js'

export const migrateSectionPermissions = async () => {
  if (game.user !== game.users.activeGM) return

  const actorTypes = game.settings.get('cortexprime-ext', 'actorTypes')
  const migratedActorTypes = computeMigratedActorTypes(actorTypes)

  if (migratedActorTypes) {
    await game.settings.set('cortexprime-ext', 'actorTypes', applyActorTypeInheritance(migratedActorTypes))
  }

  for (const actor of game.actors.contents) {
    const migrated = computeMigratedActorNotes(actor.system.actorType?.additionalTabs)

    if (!migrated) continue

    try {
      await actor.update({ 'system.actorType.-=additionalTabs': null })
      await actor.update({ 'system.actorType.additionalTabs': migrated })
    } catch (error) {
      console.warn('CP | Could not migrate section permissions for actor', actor.name, error)
    }
  }
}

export const registerMigrateSectionPermissions = () => {
  Hooks.once('ready', () => { migrateSectionPermissions() })
}
