// Foundry-side half of System Traits — the game.settings reads that the pure systemTraitsLogic.js
// deliberately doesn't do. See that file for what a System Trait is and why the tag lives where it
// does.
import { getAllTraitSets } from '../scripts/dicePoolValidation.js'
import { objectFindValue } from '../../lib/helpers.js'
import { getSystemTraitSetIds, resolveSystemSimpleTraitIndex } from './systemTraitsLogic.js'

// The Actor Type an actor was made from, as it stands *now* in settings — not the snapshot on the
// actor. Matched by id, the same way actor-sheet.js's _updateActorSettings does it.
const getConfiguredActorType = actor => objectFindValue(
  game.settings.get('cortexprime-ext', 'actorTypes') ?? {},
  actorType => actorType.id === actor?.system?.actorType?.id
)

// The collection key of the Simple Trait on `actor` claiming the given System Trait, or null.
// Callers need the key, not the trait, to build `system.actorType.simpleTraits.<index>.dice`.
export const getSystemSimpleTraitIndex = (actor, key) => {
  if (!actor) return null

  return resolveSystemSimpleTraitIndex(
    getConfiguredActorType(actor),
    actor.system.actorType?.simpleTraits,
    key
  )
}

// Every Trait Set id tagged with the given System Trait Set, across every Actor Type.
export const getTaggedTraitSetIds = key => getSystemTraitSetIds(getAllTraitSets(), key)
