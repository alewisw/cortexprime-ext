import { describe, expect, it } from 'vitest'
import {
  applyActorTypeInheritance,
  buildActorTypeTree,
  computeDerivedActorType,
  isDerived
} from '../module/actor/actorTypeInheritanceLogic.js'

const parentType = () => ({
  id: '_p',
  name: 'NPC',
  showProfileImage: true,
  hasComplications: true,
  defaultImage: 'icons/svg/mystery-man.svg',
  traitSets: {
    0: {
      id: '_ps1',
      label: 'Traits',
      settings: { hasDice: true },
      traits: { 0: { id: '_pt1', name: 'Grit' } }
    }
  },
  simpleTraits: { 0: { id: '_pst1', label: 'Organisation' } },
  additionalTabs: {
    0: { id: '_ptab1', name: 'Notes', defaultNotes: { 0: { label: 'Background', locked: false, value: null } } }
  }
})

// A freshly added derived type, before it has ever been reconciled.
const bareChild = () => ({ id: '_c', name: 'NPC Mage', parentId: '_p' })

const types = (...actorTypes) => actorTypes.reduce((acc, actorType, index) => ({ ...acc, [index]: actorType }), {})

describe('isDerived', () => {
  it('is true only when a parentId is present', () => {
    expect(isDerived({ id: '_c', parentId: '_p' })).toBe(true)
    expect(isDerived({ id: '_p' })).toBe(false)
    expect(isDerived(undefined)).toBe(false)
  })
})

describe('computeDerivedActorType', () => {
  it('materializes the whole parent, stamping every inherited element', () => {
    const result = computeDerivedActorType(parentType(), bareChild())

    expect(result).toEqual({
      id: '_c',
      name: 'NPC Mage',
      parentId: '_p',
      showProfileImage: true,
      hasComplications: true,
      defaultImage: 'icons/svg/mystery-man.svg',
      traitSets: {
        0: {
          id: '_ps1',
          inherited: true,
          label: 'Traits',
          settings: { hasDice: true },
          traits: { 0: { id: '_pt1', name: 'Grit', inherited: true } }
        }
      },
      simpleTraits: { 0: { id: '_pst1', label: 'Organisation', inherited: true } },
      additionalTabs: {
        0: {
          id: '_ptab1',
          inherited: true,
          name: 'Notes',
          defaultNotes: { 0: { label: 'Background', locked: false, value: null, inherited: true } }
        }
      }
    })
  })

  it('keeps the child name and id, taking every other field from the parent', () => {
    const parent = { ...parentType(), hasPlotPoints: true, name: 'NPC' }
    const child = { ...bareChild(), hasPlotPoints: false, defaultImage: 'icons/svg/eye.svg' }

    const result = computeDerivedActorType(parent, child)

    expect(result.id).toBe('_c')
    expect(result.name).toBe('NPC Mage')
    expect(result.hasPlotPoints).toBe(true)
    expect(result.defaultImage).toBe('icons/svg/mystery-man.svg')
  })

  it('does not carry the display-only tree fields over from the parent', () => {
    const parent = { ...parentType(), children: [{ id: '_c' }], hasChildren: true, parentName: null }

    const result = computeDerivedActorType(parent, bareChild())

    expect(result.children).toBeUndefined()
    expect(result.hasChildren).toBeUndefined()
    expect(result.parentName).toBeUndefined()
  })

  it('does not alias the parent — mutating the result leaves the parent alone', () => {
    const parent = parentType()
    const result = computeDerivedActorType(parent, bareChild())

    result.traitSets[0].traits[0].name = 'Changed'

    expect(parent.traitSets[0].traits[0].name).toBe('Grit')
  })

  it('handles a parent with none of the three collections', () => {
    const result = computeDerivedActorType({ id: '_p', name: 'NPC' }, bareChild())

    expect(result.traitSets).toEqual({})
    expect(result.simpleTraits).toEqual({})
    expect(result.additionalTabs).toEqual({})
  })
})

describe('applyActorTypeInheritance', () => {
  it('leaves non-derived Actor Types untouched', () => {
    const source = types(parentType())

    expect(applyActorTypeInheritance(source)).toEqual(source)
  })

  it('propagates a later parent edit to the child', () => {
    const child = applyActorTypeInheritance(types(parentType(), bareChild()))[1]

    const edited = { ...parentType(), hasComplications: false }
    edited.traitSets[0].label = 'Renamed'

    const result = applyActorTypeInheritance(types(edited, child))[1]

    expect(result.hasComplications).toBe(false)
    expect(result.traitSets[0].label).toBe('Renamed')
  })

  it('keeps a Trait Set the child added, after the inherited ones', () => {
    const child = { ...bareChild(), traitSets: { 0: { id: '_cs1', label: 'Sorcery' } } }

    const result = applyActorTypeInheritance(types(parentType(), child))[1]

    expect(result.traitSets[0].id).toBe('_ps1')
    expect(result.traitSets[0].inherited).toBe(true)
    expect(result.traitSets[1]).toEqual({ id: '_cs1', label: 'Sorcery' })
  })

  it('keeps a Trait the child added inside an inherited Trait Set', () => {
    const materialized = applyActorTypeInheritance(types(parentType(), bareChild()))[1]

    materialized.traitSets[0].traits[1] = { id: '_ct1', name: 'Arcana' }

    const result = applyActorTypeInheritance(types(parentType(), materialized))[1]

    expect(result.traitSets[0].traits).toEqual({
      0: { id: '_pt1', name: 'Grit', inherited: true },
      1: { id: '_ct1', name: 'Arcana' }
    })
  })

  it('re-attaches the child Trait after the parent renames and reorders its Trait Sets', () => {
    const materialized = applyActorTypeInheritance(types(parentType(), bareChild()))[1]
    materialized.traitSets[0].traits[1] = { id: '_ct1', name: 'Arcana' }

    const reordered = parentType()
    reordered.traitSets = {
      0: { id: '_ps2', label: 'Extra' },
      1: { ...reordered.traitSets[0], label: 'Renamed' }
    }

    const result = applyActorTypeInheritance(types(reordered, materialized))[1]

    expect(result.traitSets[0].id).toBe('_ps2')
    expect(result.traitSets[1].label).toBe('Renamed')
    expect(result.traitSets[1].traits[1]).toEqual({ id: '_ct1', name: 'Arcana' })
  })

  it('drops the child Traits inside a Trait Set the parent deleted', () => {
    const materialized = applyActorTypeInheritance(types(parentType(), bareChild()))[1]
    materialized.traitSets[0].traits[1] = { id: '_ct1', name: 'Arcana' }

    const stripped = { ...parentType(), traitSets: {} }

    const result = applyActorTypeInheritance(types(stripped, materialized))[1]

    expect(result.traitSets).toEqual({})
  })

  it('keeps Simple Traits, Additional Tabs and Default Sections the child added', () => {
    const materialized = applyActorTypeInheritance(types(parentType(), bareChild()))[1]

    materialized.simpleTraits[1] = { id: '_cst1', label: 'Coven' }
    materialized.additionalTabs[0].defaultNotes[1] = { label: 'Spells', locked: false, value: null }
    materialized.additionalTabs[1] = { id: '_ctab1', name: 'Grimoire' }

    const result = applyActorTypeInheritance(types(parentType(), materialized))[1]

    expect(result.simpleTraits[1]).toEqual({ id: '_cst1', label: 'Coven' })
    expect(result.additionalTabs[0].defaultNotes[1]).toEqual({ label: 'Spells', locked: false, value: null })
    expect(result.additionalTabs[1]).toEqual({ id: '_ctab1', name: 'Grimoire' })
  })

  it('is idempotent — a second run against its own output changes nothing', () => {
    const child = { ...bareChild(), traitSets: { 0: { id: '_cs1', label: 'Sorcery' } } }
    const once = applyActorTypeInheritance(types(parentType(), child))

    expect(applyActorTypeInheritance(once)).toEqual(once)
  })

  it('ignores a parent that is itself derived — inheritance is single level', () => {
    const child = applyActorTypeInheritance(types(parentType(), bareChild()))[1]
    const grandchild = { id: '_g', name: 'Deep', parentId: '_c' }

    const result = applyActorTypeInheritance(types(parentType(), child, grandchild))

    expect(result[2]).toEqual(grandchild)
  })

  it('leaves a child whose parent is missing exactly as it is', () => {
    const orphan = { id: '_c', name: 'NPC Mage', parentId: '_gone', traitSets: { 0: { id: '_cs1', label: 'Own' } } }

    expect(applyActorTypeInheritance(types(orphan))[0]).toEqual(orphan)
  })

  it('ignores an Actor Type that names itself as its parent', () => {
    const selfParent = { id: '_p', name: 'NPC', parentId: '_p' }

    expect(applyActorTypeInheritance(types(selfParent))[0]).toEqual(selfParent)
  })

  it('handles an empty or missing actorTypes object', () => {
    expect(applyActorTypeInheritance({})).toEqual({})
    expect(applyActorTypeInheritance(undefined)).toEqual({})
  })
})

describe('buildActorTypeTree', () => {
  it('reports children on the parent and the parent name on the child', () => {
    const result = buildActorTypeTree(types(parentType(), bareChild()))

    expect(result[0].hasChildren).toBe(true)
    expect(result[0].children).toEqual([{ id: '_c', index: '1', name: 'NPC Mage' }])
    expect(result[0].parentName).toBeNull()

    expect(result[1].hasChildren).toBe(false)
    expect(result[1].children).toEqual([])
    expect(result[1].parentName).toBe('NPC')
  })

  it('gives a child index usable as a settings key', () => {
    const source = types(parentType(), bareChild())
    const { index } = buildActorTypeTree(source)[0].children[0]

    expect(source[index].id).toBe('_c')
  })

  it('reports a null parent name when the parent is gone', () => {
    const result = buildActorTypeTree(types({ id: '_c', name: 'Orphan', parentId: '_gone' }))

    expect(result[0].parentName).toBeNull()
  })

  it('handles an empty or missing actorTypes object', () => {
    expect(buildActorTypeTree({})).toEqual({})
    expect(buildActorTypeTree(undefined)).toEqual({})
  })
})
