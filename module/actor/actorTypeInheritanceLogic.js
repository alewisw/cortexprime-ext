// Pure decision logic for Actor Type inheritance. A derived Actor Type carries a `parentId` and
// stores a *materialized* copy of its parent's structure — every element that came from the parent
// is stamped `inherited: true`, and the child's own additions are appended after, unstamped.
//
// Storing the child materialized (rather than sparsely, resolved on read) is deliberate: the
// settings form binds inputs straight to storage indices (`actorTypes.<i>.traitSets.<j>...`), so a
// resolved-on-read view would desynchronise those indices from what `_updateObject` writes back.
// A materialized child is a complete, valid Actor Type, which is why the actor sheet, the settings
// partials and import/export all work on it unchanged.
//
// `applyActorTypeInheritance` is the single point of propagation and is idempotent by construction
// (it rebuilds the inherited half from the parent every time and only ever preserves the unstamped
// half), so it is safe to run on every write to the `actorTypes` setting.
//
// Kept free of Foundry globals so it's unit-testable; the game.settings calls live in the callers.
import { getLength, objectFindValue, objectMapValues, objectReduce, objectReindexFilter } from '../../lib/helpers.js'

export const isDerived = actorType => !!actorType?.parentId

// The child's own additions: everything in the collection that is *not* stamped as inherited,
// reindexed so the result stays a contiguous 0..n-1 map.
const ownEntries = collection => objectReindexFilter(collection ?? {}, entry => !entry?.inherited)

const stampInherited = entry => ({ ...structuredClone(entry), inherited: true })

// Appends `second` onto `first`, renumbering as it goes. Both must be contiguous index-keyed maps.
const append = (first, second) => objectReduce(
  second ?? {},
  (acc, value) => ({ ...acc, [getLength(acc)]: value }),
  { ...(first ?? {}) }
)

// Parent entries first (stamped), then whatever the child added itself.
const mergeCollection = (parentCollection, childCollection) => append(
  objectMapValues(parentCollection ?? {}, stampInherited),
  ownEntries(childCollection)
)

// Same rule one level down: a nested collection (a trait set's traits, a tab's default sections)
// is rebuilt from the parent container matched by id, then the child's own entries for that same
// container are re-appended. Matching by container id means a parent rename or reorder keeps the
// child's additions attached; deleting the parent container drops them with it.
const mergeNested = (parentContainer, childContainers, nestedKey) => {
  const priorChildContainer = objectFindValue(
    childContainers ?? {},
    container => container?.inherited && container.id === parentContainer.id
  )

  return mergeCollection(parentContainer[nestedKey], priorChildContainer?.[nestedKey])
}

const mergeContainers = (parentContainers, childContainers, nestedKey) => {
  const inherited = objectReduce(parentContainers ?? {}, (acc, parentContainer) => ({
    ...acc,
    [getLength(acc)]: {
      ...stampInherited(parentContainer),
      [nestedKey]: mergeNested(parentContainer, childContainers, nestedKey)
    }
  }), {})

  return append(inherited, ownEntries(childContainers))
}

// Rebuilds a single derived Actor Type from its parent. The child keeps only its own identity —
// id, name and the parent link; every other field comes from the parent.
export const computeDerivedActorType = (parent, child) => {
  const { children, hasChildren, inherited, parentName, ...parentFields } = structuredClone(parent)

  return {
    ...parentFields,
    id: child.id,
    name: child.name,
    parentId: child.parentId,
    traitSets: mergeContainers(parent.traitSets, child.traitSets, 'traits'),
    simpleTraits: mergeCollection(parent.simpleTraits, child.simpleTraits),
    additionalTabs: mergeContainers(parent.additionalTabs, child.additionalTabs, 'defaultNotes')
  }
}

// Reconciles every derived Actor Type in the map against its parent. Inheritance is single level:
// a type whose parent is missing, is itself derived, or is itself is left exactly as it is, so it
// still renders (as an ordinary editable Actor Type) rather than disappearing.
export const applyActorTypeInheritance = actorTypes => {
  const types = actorTypes ?? {}

  return objectMapValues(types, actorType => {
    if (!isDerived(actorType)) return actorType

    const parent = objectFindValue(types, candidate => candidate?.id === actorType.parentId)

    if (!parent || parent.id === actorType.id || isDerived(parent)) return actorType

    return computeDerivedActorType(parent, actorType)
  })
}

// Display-only augmentation for the settings form: which types are derived from which. Never
// written back to the setting — ActorSettings re-reads the raw value before every save.
export const buildActorTypeTree = actorTypes => {
  const types = actorTypes ?? {}

  return objectMapValues(types, actorType => {
    const parent = isDerived(actorType)
      ? objectFindValue(types, candidate => candidate?.id === actorType.parentId)
      : null

    const children = objectReduce(types, (acc, candidate, key) => {
      return candidate?.parentId && candidate.parentId === actorType.id
        ? [...acc, { id: candidate.id, index: key, name: candidate.name }]
        : acc
    }, [])

    return {
      ...actorType,
      children,
      hasChildren: children.length > 0,
      parentName: parent?.name ?? null
    }
  })
}
