// System Traits — how a Custom Rule Set finds the Trait Sets and Simple Traits it needs to do its
// job. A rule set declares a fixed list of roles ("Powers", "Paradox", …); the GM claims one of them
// on a Trait Set or Simple Trait in Actor Settings, and the rule set resolves it by reading that tag
// straight off the actor's own Actor Type.
//
// This replaced a separate mageSettings world setting holding ids that pointed *at* those traits.
// Tagging in place means the wiring lives next to the thing it describes, and any number of Actor
// Types can each carry their own Paradox — the old scheme allowed exactly one.
//
// The tag is stored on the entry's existing `settings` sub-object, alongside mutuallyExclusiveWith
// and valueType:
//   traitSets[i].settings.systemTraitSet   — '' | 'powers'
//   simpleTraits[i].settings.systemTrait   — '' | 'realityReinforcement' | 'shielding' | …
// That location is free: ActorSettings persists any actorTypes.<a>.traitSets.<t>.settings.<field>
// with no JS change, _updateActorSettings already copies `settings` onto actors, and derived Actor
// Types deep-clone it.
//
// Kept free of Foundry globals so it's unit-testable; the game.settings reads live in the callers.
import { objectFindKey, objectMapValues } from '../../lib/helpers.js'

// `label` values are lang keys. Adding a rule set means adding an entry here and a `choices` value
// on the customRuleSet setting — nothing else knows this list.
export const SYSTEM_TRAITS = {
  mage: {
    traitSets: [
      { key: 'powers', label: 'SystemTraitSetPowers' }
    ],
    simpleTraits: [
      { key: 'realityReinforcement', label: 'SystemTraitRealityReinforcement' },
      { key: 'shielding', label: 'SystemTraitShielding' },
      { key: 'paradox', label: 'SystemTraitParadox' },
      { key: 'trauma', label: 'SystemTraitTrauma' }
    ]
  }
}

// kind: 'traitSets' | 'simpleTraits'. Empty for 'none' or any rule set that declares nothing, which
// is what makes the settings form hide the dropdown entirely.
export const getSystemTraitDefs = (customRuleSet, kind) => SYSTEM_TRAITS[customRuleSet]?.[kind] ?? []

const tagOf = (entry, field) => entry?.settings?.[field] || ''

// The options one entry may choose from: everything not already claimed by a sibling, plus whatever
// this entry itself currently holds. Filtering here rather than in the template is deliberate — the
// registered Handlebars helpers are all binary, so "is this option taken by some other sibling"
// can't be expressed there without a nested loop and a flag.
const optionsFor = (defs, collection, entryKey, field) => {
  const current = tagOf(collection[entryKey], field)

  const claimedElsewhere = Object.keys(collection)
    .filter(key => key !== entryKey)
    .map(key => tagOf(collection[key], field))
    .filter(Boolean)

  return defs
    .filter(def => def.key === current || !claimedElsewhere.includes(def.key))
    .map(def => ({ ...def, selected: def.key === current }))
}

const withOptions = (collection, defs, field, optionsKey) => objectMapValues(
  collection ?? {},
  (entry, key) => ({ ...entry, [optionsKey]: optionsFor(defs, collection, key, field) })
)

// Display-only augmentation for the Actor Settings form: every Trait Set gains
// `systemTraitSetOptions` and every Simple Trait `systemTraitOptions`. Returns the Actor Type
// untouched when the active rule set declares no system traits of that kind, so the template's
// {{#if}} guard hides the dropdown.
export const buildSystemTraitOptions = (actorType, customRuleSet) => {
  const traitSetDefs = getSystemTraitDefs(customRuleSet, 'traitSets')
  const simpleTraitDefs = getSystemTraitDefs(customRuleSet, 'simpleTraits')

  return {
    ...actorType,
    ...(traitSetDefs.length
      ? { traitSets: withOptions(actorType?.traitSets, traitSetDefs, 'systemTraitSet', 'systemTraitSetOptions') }
      : {}),
    ...(simpleTraitDefs.length
      ? { simpleTraits: withOptions(actorType?.simpleTraits, simpleTraitDefs, 'systemTrait', 'systemTraitOptions') }
      : {})
  }
}

// The key of the Simple Trait claiming `key`, or null. A key rather than the trait itself because
// callers need it to build the write path `system.actorType.simpleTraits.<index>.dice`.
export const findSystemSimpleTraitIndex = (simpleTraits, key) => {
  if (!key) return null

  return objectFindKey(simpleTraits ?? {}, simpleTrait => tagOf(simpleTrait, 'systemTrait') === key) ?? null
}

// Resolves a System Simple Trait on an *actor*, given the configured Actor Type it was made from.
//
// An actor's system.actorType is a snapshot copied when the type was assigned, so a tag added in
// Actor Settings afterwards isn't on it until the sheet's "Update Settings" is run. Configuration
// therefore comes from the settings side and only the *position* is looked up on the actor, matched
// by the trait's stable id — which every snapshot already carries. Tagging takes effect on every
// existing actor immediately, with no per-actor resync.
//
// Falls back to a tag on the actor's own copy, which covers an actor whose Actor Type has since
// been deleted from settings.
export const resolveSystemSimpleTraitIndex = (configuredActorType, actorSimpleTraits, key) => {
  const configuredIndex = findSystemSimpleTraitIndex(configuredActorType?.simpleTraits, key)
  const configuredId = configuredIndex === null ? null : configuredActorType.simpleTraits[configuredIndex]?.id

  if (configuredId) {
    const byId = objectFindKey(actorSimpleTraits ?? {}, simpleTrait => simpleTrait?.id === configuredId)

    if (byId !== undefined) return byId
  }

  return findSystemSimpleTraitIndex(actorSimpleTraits, key)
}

// Every Trait Set id claiming `key`, across however many Actor Types were flattened in. Ids rather
// than the Trait Sets themselves because that's what Dice Pool entries and roll records carry — and
// those ids come from the same settings objects, so no actor-snapshot problem arises here.
// Deduplicated: a derived Actor Type inherits its parent's Trait Set id verbatim.
export const getSystemTraitSetIds = (traitSets, key) => {
  if (!key) return []

  const ids = (traitSets ?? [])
    .filter(traitSet => tagOf(traitSet, 'systemTraitSet') === key)
    .map(traitSet => traitSet.id)
    .filter(Boolean)

  return [...new Set(ids)]
}
