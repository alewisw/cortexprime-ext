import { describe, expect, it } from 'vitest'
import {
  computeMigratedActorNotes,
  computeMigratedActorTypes
} from '../module/scripts/migrateSectionPermissionsLogic.js'

describe('computeMigratedActorTypes', () => {
  it('maps locked: true to all three permissions false, and removes locked', () => {
    const actorTypes = {
      0: {
        id: '_1',
        additionalTabs: {
          0: { id: '_tab1', defaultNotes: { 0: { label: 'Background', locked: true } } }
        }
      }
    }

    const result = computeMigratedActorTypes(actorTypes)

    expect(result[0].additionalTabs[0].defaultNotes[0]).toEqual({
      label: 'Background',
      allowRename: false,
      allowDeletion: false,
      allowEdit: false
    })
  })

  it('maps locked: false to all three permissions true, and removes locked', () => {
    const actorTypes = {
      0: {
        id: '_1',
        additionalTabs: {
          0: { id: '_tab1', defaultNotes: { 0: { label: 'Notes', locked: false } } }
        }
      }
    }

    const result = computeMigratedActorTypes(actorTypes)

    expect(result[0].additionalTabs[0].defaultNotes[0]).toEqual({
      label: 'Notes',
      allowRename: true,
      allowDeletion: true,
      allowEdit: true
    })
  })

  it('returns null, touching nothing, when no Default Section carries locked', () => {
    const actorTypes = {
      0: {
        id: '_1',
        additionalTabs: {
          0: { id: '_tab1', defaultNotes: { 0: { label: 'Already migrated', allowRename: true, allowDeletion: false, allowEdit: true } } }
        }
      }
    }

    expect(computeMigratedActorTypes(actorTypes)).toBeNull()
  })

  it('is idempotent - running twice leaves the second run a no-op', () => {
    const actorTypes = {
      0: {
        id: '_1',
        additionalTabs: {
          0: { id: '_tab1', defaultNotes: { 0: { label: 'Background', locked: true } } }
        }
      }
    }

    const once = computeMigratedActorTypes(actorTypes)
    expect(computeMigratedActorTypes(once)).toBeNull()
  })

  it('only migrates Default Sections that carry locked, leaving siblings and other tabs untouched', () => {
    const actorTypes = {
      0: {
        id: '_1',
        additionalTabs: {
          0: {
            id: '_tab1',
            defaultNotes: {
              0: { label: 'Old style', locked: true },
              1: { label: 'Already migrated', allowRename: true, allowDeletion: true, allowEdit: false }
            }
          },
          1: { id: '_tab2', defaultNotes: { 0: { label: 'Untouched', locked: false } } }
        }
      }
    }

    const result = computeMigratedActorTypes(actorTypes)

    expect(result[0].additionalTabs[0].defaultNotes[0]).toEqual({
      label: 'Old style', allowRename: false, allowDeletion: false, allowEdit: false
    })
    // Untouched sibling, byte for byte.
    expect(result[0].additionalTabs[0].defaultNotes[1]).toEqual({
      label: 'Already migrated', allowRename: true, allowDeletion: true, allowEdit: false
    })
    expect(result[0].additionalTabs[1].defaultNotes[0]).toEqual({
      label: 'Untouched', allowRename: true, allowDeletion: true, allowEdit: true
    })
  })

  it('does not mutate its input', () => {
    const actorTypes = {
      0: {
        id: '_1',
        additionalTabs: {
          0: { id: '_tab1', defaultNotes: { 0: { label: 'Background', locked: true } } }
        }
      }
    }
    const snapshot = JSON.parse(JSON.stringify(actorTypes))

    computeMigratedActorTypes(actorTypes)

    expect(actorTypes).toEqual(snapshot)
  })
})

describe('computeMigratedActorNotes', () => {
  it('migrates a Note the same way as a Default Section, and removes locked', () => {
    const additionalTabs = {
      0: { id: '_tab1', notes: { 0: { label: 'Background', value: '<p>Text</p>', locked: true } } }
    }

    const result = computeMigratedActorNotes(additionalTabs)

    expect(result[0].notes[0]).toEqual({
      label: 'Background',
      value: '<p>Text</p>',
      allowRename: false,
      allowDeletion: false,
      allowEdit: false
    })
  })

  it('returns null when no note on the actor carries locked', () => {
    const additionalTabs = {
      0: { id: '_tab1', notes: { 0: { label: 'Freeform', value: '' } } }
    }

    expect(computeMigratedActorNotes(additionalTabs)).toBeNull()
  })

  it('returns null for an actor with no additionalTabs at all', () => {
    expect(computeMigratedActorNotes(undefined)).toBeNull()
    expect(computeMigratedActorNotes({})).toBeNull()
  })
})
