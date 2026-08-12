import { describe, expect, it } from 'vitest'
import {
  computeMigratedActorNotes,
  computeMigratedActorTypes,
  getMigratedNotesTabId
} from '../module/scripts/migrateNotesToTabsLogic.js'

describe('computeMigratedActorTypes', () => {
  it('adds a Notes tab and drops hasNotesPage for an Actor Type that has the old flag', () => {
    const actorTypes = { 0: { id: '_1', name: 'Character', hasNotesPage: true } }

    expect(computeMigratedActorTypes(actorTypes)).toEqual({
      0: {
        id: '_1',
        name: 'Character',
        additionalTabs: { 0: { id: '_notes-_1', name: 'Notes' } }
      }
    })
  })

  it('appends after any Additional Tabs the Actor Type already has', () => {
    const actorTypes = {
      0: {
        id: '_1',
        name: 'Character',
        hasNotesPage: true,
        additionalTabs: { 0: { id: '_5', name: 'Backstory' } }
      }
    }

    expect(computeMigratedActorTypes(actorTypes)[0].additionalTabs).toEqual({
      0: { id: '_5', name: 'Backstory' },
      1: { id: '_notes-_1', name: 'Notes' }
    })
  })

  it('leaves an Actor Type with no hasNotesPage flag untouched', () => {
    const actorTypes = { 0: { id: '_1', name: 'Character', additionalTabs: { 0: { id: '_5', name: 'Backstory' } } } }

    expect(computeMigratedActorTypes(actorTypes)).toBeNull()
  })

  it('is idempotent — a second run against its own output changes nothing', () => {
    const actorTypes = { 0: { id: '_1', name: 'Character', hasNotesPage: true } }
    const once = computeMigratedActorTypes(actorTypes)

    expect(computeMigratedActorTypes(once)).toBeNull()
  })

  it('migrates only the Actor Types that need it, leaving others alone', () => {
    const actorTypes = {
      0: { id: '_1', name: 'Character', hasNotesPage: true },
      1: { id: '_2', name: 'Scene', additionalTabs: { 0: { id: '_5', name: 'Backstory' } } }
    }

    const result = computeMigratedActorTypes(actorTypes)

    expect(result[0].additionalTabs).toEqual({ 0: { id: '_notes-_1', name: 'Notes' } })
    expect(result[1]).toEqual(actorTypes[1])
  })

  it('is null for an empty or missing actorTypes object', () => {
    expect(computeMigratedActorTypes({})).toBeNull()
    expect(computeMigratedActorTypes(undefined)).toBeNull()
  })
})

describe('computeMigratedActorNotes', () => {
  const migratedTabId = getMigratedNotesTabId('_1')

  it('moves top-level notes under the matching Additional Tab', () => {
    const actorTypeData = {
      id: '_1',
      notes: { 0: { label: 'Backstory', value: '<p>Hi</p>' } },
      additionalTabs: { 0: { id: migratedTabId, name: 'Notes' } }
    }

    expect(computeMigratedActorNotes(actorTypeData, migratedTabId)).toEqual({
      id: '_1',
      additionalTabs: {
        0: { id: migratedTabId, name: 'Notes', notes: { 0: { label: 'Backstory', value: '<p>Hi</p>' } } }
      }
    })
  })

  it('preserves any notes the target tab already carries by merging under the same key', () => {
    const actorTypeData = {
      notes: { 0: { label: 'Old', value: 'x' } },
      additionalTabs: { 0: { id: migratedTabId, name: 'Notes', notes: {} } }
    }

    expect(computeMigratedActorNotes(actorTypeData, migratedTabId).additionalTabs[0].notes)
      .toEqual({ 0: { label: 'Old', value: 'x' } })
  })

  it('is null when there are no old notes to move', () => {
    const actorTypeData = { additionalTabs: { 0: { id: migratedTabId, name: 'Notes' } } }

    expect(computeMigratedActorNotes(actorTypeData, migratedTabId)).toBeNull()
    expect(computeMigratedActorNotes({ notes: {} }, migratedTabId)).toBeNull()
  })

  it('is null when the target tab does not exist on this actor', () => {
    const actorTypeData = { notes: { 0: { label: 'X', value: 'y' } }, additionalTabs: {} }

    expect(computeMigratedActorNotes(actorTypeData, migratedTabId)).toBeNull()
  })

  it('is null for an actor with no actorType data at all', () => {
    expect(computeMigratedActorNotes(undefined, migratedTabId)).toBeNull()
  })
})
