import { describe, expect, it } from 'vitest'
import { computeActorTypeChange, mergeActorTypeData } from '../module/actor/actorTypeChangeLogic.js'

// An actor's `system.actorType` snapshot: the type's structure plus everything the player has
// filled in since - dice, descriptions, shutdown flags, tab notes.
const actorSnapshot = () => ({
  id: '_1',
  name: 'Character',
  hasPlotPoints: true,
  showProfileImage: true,
  traitSets: {
    0: {
      id: '_11',
      label: 'Distinctions',
      hasDescription: false,
      description: 'Written by the player',
      shutdown: true,
      settings: { hasDice: true },
      traits: {
        0: { id: '_111', name: 'Distinction 1', dice: { value: { 0: '8' } }, sfx: { 0: { label: 'Hinder' } } }
      }
    },
    1: {
      id: '_19',
      label: 'Homebrew',
      shutdown: false,
      traits: { 0: { id: '_191', name: 'Custom', dice: { value: { 0: '10' } } } }
    }
  },
  simpleTraits: {
    0: { id: '_1s1', label: 'Stress', hasDescription: false, dice: { value: { 0: '6' }, consumable: false } }
  },
  additionalTabs: {
    0: { id: '_13', name: 'Notes', notes: { 0: { label: 'Background', value: 'Grew up on Mars', locked: false } } }
  }
})

// A different, configured Actor Type. Shares `_11`/`_111`, `_1s1` and `_13` with the snapshot
// above (as a derived type would, since inheritance preserves the parent's ids) and adds `_15`.
const newTypeSettings = () => ({
  id: '_2',
  name: 'Mage',
  hasPlotPoints: true,
  showProfileImage: true,
  defaultImage: 'icons/svg/mage.svg',
  traitSets: {
    0: {
      id: '_11',
      label: 'Distinctions Renamed',
      hasDescription: true,
      settings: { hasDice: true, hasMultipleDice: true },
      traits: {
        0: { id: '_111', name: 'Distinction One' },
        1: { id: '_112', name: 'Distinction Two' }
      }
    },
    1: {
      id: '_15',
      label: 'Spheres',
      hasDescription: false,
      settings: { hasDice: true },
      traits: { 0: { id: '_151', name: 'Forces' } }
    }
  },
  simpleTraits: {
    0: { id: '_1s1', label: 'Quintessence', hasDescription: true, dice: { consumable: true }, settings: { hasDice: true } }
  },
  additionalTabs: {
    0: { id: '_13', name: 'Notes', defaultNotes: { 0: { label: 'Paradox', value: 'Track it here', locked: true } } }
  }
})

describe('mergeActorTypeData', () => {
  it('keeps the actor values on a trait set both types share, taking structure from settings', () => {
    const traitSet = mergeActorTypeData(actorSnapshot(), newTypeSettings()).traitSets[0]

    expect(traitSet.id).toBe('_11')
    expect(traitSet.description).toBe('Written by the player')
    expect(traitSet.shutdown).toBe(true)
    expect(traitSet.label).toBe('Distinctions Renamed')
    expect(traitSet.hasDescription).toBe(true)
    expect(traitSet.settings).toEqual({ hasDice: true, hasMultipleDice: true })
  })

  it('keeps a trait\'s dice and sfx where the trait id matches, renaming from settings', () => {
    const traits = mergeActorTypeData(actorSnapshot(), newTypeSettings()).traitSets[0].traits

    expect(traits[0]).toEqual({
      id: '_111',
      name: 'Distinction One',
      dice: { value: { 0: '8' } },
      sfx: { 0: { label: 'Hinder' } }
    })
  })

  it('brings in entries only the new type defines, at their configured defaults', () => {
    const merged = mergeActorTypeData(actorSnapshot(), newTypeSettings())

    expect(merged.traitSets[0].traits[1]).toEqual({ id: '_112', name: 'Distinction Two' })
    expect(merged.traitSets[1].id).toBe('_15')
    expect(merged.traitSets[1].label).toBe('Spheres')
    expect(merged.traitSets[1].traits[0]).toEqual({ id: '_151', name: 'Forces' })
  })

  it('takes enableHinder from settings every time - Update Settings can turn it on, or back off, for an existing actor', () => {
    // The trap this guards: enableHinder is a config field like label/settings, not a per-actor
    // value like dice/description - if the trait mapper only ever took id/name from settings (as
    // it did before this was added), ticking Enable Hinder on an existing Actor Type would never
    // reach any actor already using it.
    const settingsWithHinder = newTypeSettings()
    settingsWithHinder.traitSets[0].traits[0].enableHinder = true

    const enabled = mergeActorTypeData(actorSnapshot(), settingsWithHinder).traitSets[0].traits[0]
    expect(enabled.enableHinder).toBe(true)
    // The actor's own dice/sfx are still untouched by turning the option on.
    expect(enabled.dice).toEqual({ value: { 0: '8' } })

    // Actor previously had it on; the GM unticks it in settings - Update Settings must turn it
    // back off rather than leaving the actor's last-known value in place.
    const actorWithHinder = actorSnapshot()
    actorWithHinder.traitSets[0].traits[0].enableHinder = true

    const disabled = mergeActorTypeData(actorWithHinder, newTypeSettings()).traitSets[0].traits[0]
    expect(disabled.enableHinder).toBeUndefined()
  })

  it('drops entries the new type does not define', () => {
    const traitSets = mergeActorTypeData(actorSnapshot(), newTypeSettings()).traitSets

    expect(Object.values(traitSets).map(({ id }) => id)).toEqual(['_11', '_15'])
  })

  it('keeps a simple trait\'s dice values but takes consumable, label and settings from the new type', () => {
    const simpleTrait = mergeActorTypeData(actorSnapshot(), newTypeSettings()).simpleTraits[0]

    expect(simpleTrait).toEqual({
      id: '_1s1',
      label: 'Quintessence',
      hasDescription: true,
      dice: { value: { 0: '6' }, consumable: true },
      settings: { hasDice: true }
    })
  })

  it('keeps existing tab notes and appends unmatched defaultNotes', () => {
    const notes = mergeActorTypeData(actorSnapshot(), newTypeSettings()).additionalTabs[0].notes

    expect(notes[0]).toEqual({ label: 'Background', value: 'Grew up on Mars', locked: false })
    expect(notes[1]).toEqual({ label: 'Paradox', value: 'Track it here', locked: true })
  })

  it('takes an Additional Tab\'s description from settings every time - Update Settings can add one, or change it, for an existing actor', () => {
    // The trap this guards: description is a config field like name, not a per-actor value like
    // notes - if the tab mapper only ever took id/name/notes from settings (as it did before this
    // was added), writing a description after actors already have this Actor Type would never
    // reach any of them.
    const settingsWithDescription = newTypeSettings()
    settingsWithDescription.additionalTabs[0].description = '<p>New guidance.</p>'

    const added = mergeActorTypeData(actorSnapshot(), settingsWithDescription).additionalTabs[0]
    expect(added.description).toBe('<p>New guidance.</p>')
    // The actor's own notes are still untouched by adding a description.
    expect(added.notes[0]).toEqual({ label: 'Background', value: 'Grew up on Mars', locked: false })

    // Actor previously had a description; the GM changes it in settings - Update Settings must
    // pick up the new text rather than leaving the actor's last-known copy in place.
    const actorWithDescription = actorSnapshot()
    actorWithDescription.additionalTabs[0].description = '<p>Old guidance.</p>'

    const changed = mergeActorTypeData(actorWithDescription, settingsWithDescription).additionalTabs[0]
    expect(changed.description).toBe('<p>New guidance.</p>')
  })

  it('syncs locked on a defaultNote whose label the actor already has, without touching its value', () => {
    const settings = newTypeSettings()
    settings.additionalTabs[0].defaultNotes[0] = { label: 'Background', value: 'ignored', locked: true }

    const notes = mergeActorTypeData(actorSnapshot(), settings).additionalTabs[0].notes

    expect(notes).toEqual({ 0: { label: 'Background', value: 'Grew up on Mars', locked: true } })
  })

  it('leaves the actor\'s own data untouched when re-applying the same type (the Update Settings path)', () => {
    const actorData = actorSnapshot()
    const merged = mergeActorTypeData(actorData, actorData)

    expect(merged).toEqual(actorData)
  })

  it('does not mutate its inputs', () => {
    const actorData = actorSnapshot()
    const settings = newTypeSettings()

    mergeActorTypeData(actorData, settings)

    expect(actorData).toEqual(actorSnapshot())
    expect(settings).toEqual(newTypeSettings())
  })

  it('copes with an actor snapshot that has no collections at all', () => {
    const merged = mergeActorTypeData({ id: '_1', name: 'Character' }, newTypeSettings())

    expect(merged.traitSets[0].traits[0]).toEqual({ id: '_111', name: 'Distinction One' })
    expect(merged.simpleTraits[0].dice).toEqual({ consumable: true })
    expect(merged.additionalTabs[0].notes[0]).toEqual({ label: 'Paradox', value: 'Track it here', locked: true })
  })
})

describe('computeActorTypeChange', () => {
  it('takes the new type\'s identity', () => {
    const { actorType } = computeActorTypeChange(actorSnapshot(), newTypeSettings(), 3)

    expect(actorType.id).toBe('_2')
    expect(actorType.name).toBe('Mage')
  })

  it('strips a stale traitSetEdit pointing into the old type\'s trait sets', () => {
    const actorData = { ...actorSnapshot(), traitSetEdit: '1' }

    const { actorType } = computeActorTypeChange(actorData, newTypeSettings(), 3)

    expect('traitSetEdit' in actorType).toBe(false)
  })

  it('strips the old type\'s parentId when the new type is not derived', () => {
    const actorData = { ...actorSnapshot(), parentId: '_p' }

    const { actorType } = computeActorTypeChange(actorData, newTypeSettings(), 3)

    expect('parentId' in actorType).toBe(false)
  })

  it('takes the new type\'s parentId when it is derived', () => {
    const { actorType } = computeActorTypeChange(
      actorSnapshot(),
      { ...newTypeSettings(), parentId: '_1' },
      3
    )

    expect(actorType.parentId).toBe('_1')
  })

  it('preserves the actor\'s data, exactly as the merge does', () => {
    const { actorType } = computeActorTypeChange(actorSnapshot(), newTypeSettings(), 3)

    expect(actorType.traitSets[0].traits[0].dice).toEqual({ value: { 0: '8' } })
    expect(actorType.traitSets[0].shutdown).toBe(true)
    expect(actorType.additionalTabs[0].notes[0].value).toBe('Grew up on Mars')
  })

  it('leaves Plot Points alone when the new type has them', () => {
    expect(computeActorTypeChange(actorSnapshot(), newTypeSettings(), 3).ppValue).toBe(null)
  })

  it('zeroes Plot Points when the new type has none and the actor holds some', () => {
    const settings = { ...newTypeSettings(), hasPlotPoints: false }

    expect(computeActorTypeChange(actorSnapshot(), settings, 3).ppValue).toBe(0)
  })

  it('leaves Plot Points alone when the new type has none and the actor holds none', () => {
    const settings = { ...newTypeSettings(), hasPlotPoints: false }

    expect(computeActorTypeChange(actorSnapshot(), settings, 0).ppValue).toBe(null)
    expect(computeActorTypeChange(actorSnapshot(), settings, undefined).ppValue).toBe(null)
  })
})
