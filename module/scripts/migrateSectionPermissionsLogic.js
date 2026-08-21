// Pure decision logic for the one-time migration of an Additional Tab section's single `locked`
// boolean into three independent switches: `allowRename`, `allowDeletion`, `allowEdit`. Kept free
// of any Foundry globals so it's unit-testable; the game.settings/actor.update calls live in
// migrateSectionPermissions.js.
//
// `locked: true` meant nothing was allowed, so it maps to all three false. `locked: false` (or
// absent, the common case) meant everything was allowed, so all three true - the same "unlocked"
// meaning, just spelled with three fields instead of one inverted one. Either way `locked` itself
// is removed, so a second run over already-migrated data is a no-op (nothing left to key off).
const migratePermissions = ({ locked, ...rest }) => ({
  ...rest,
  allowRename: !locked,
  allowDeletion: !locked,
  allowEdit: !locked
})

const needsMigration = entry => entry && 'locked' in entry

// Migrates every Default Section on every Actor Type still carrying `locked`. Returns the updated
// actorTypes object, or null if nothing needed it, so the caller can skip the write.
export const computeMigratedActorTypes = actorTypes => {
  let changed = false

  const migrated = Object.keys(actorTypes ?? {}).reduce((acc, actorTypeKey) => {
    const actorType = actorTypes[actorTypeKey]
    const additionalTabs = actorType.additionalTabs ?? {}

    const migratedTabs = Object.keys(additionalTabs).reduce((tabAcc, tabKey) => {
      const tab = additionalTabs[tabKey]
      const defaultNotes = tab.defaultNotes ?? {}

      if (!Object.values(defaultNotes).some(needsMigration)) return { ...tabAcc, [tabKey]: tab }

      changed = true

      return {
        ...tabAcc,
        [tabKey]: {
          ...tab,
          defaultNotes: Object.keys(defaultNotes).reduce((noteAcc, noteKey) => ({
            ...noteAcc,
            [noteKey]: needsMigration(defaultNotes[noteKey])
              ? migratePermissions(defaultNotes[noteKey])
              : defaultNotes[noteKey]
          }), {})
        }
      }
    }, {})

    return { ...acc, [actorTypeKey]: { ...actorType, additionalTabs: migratedTabs } }
  }, {})

  return changed ? migrated : null
}

// Migrates every Note on one actor's Additional Tabs still carrying `locked`. Returns the updated
// additionalTabs object, or null if nothing needed it.
export const computeMigratedActorNotes = additionalTabs => {
  let changed = false

  const migrated = Object.keys(additionalTabs ?? {}).reduce((acc, tabKey) => {
    const tab = additionalTabs[tabKey]
    const notes = tab.notes ?? {}

    if (!Object.values(notes).some(needsMigration)) return { ...acc, [tabKey]: tab }

    changed = true

    return {
      ...acc,
      [tabKey]: {
        ...tab,
        notes: Object.keys(notes).reduce((noteAcc, noteKey) => ({
          ...noteAcc,
          [noteKey]: needsMigration(notes[noteKey]) ? migratePermissions(notes[noteKey]) : notes[noteKey]
        }), {})
      }
    }
  }, {})

  return changed ? migrated : null
}
