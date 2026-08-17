// Pure decision logic for reconciling an Actor's `system.actorType` snapshot against a configured
// Actor Type.
//
// `system.actorType` stores a full *snapshot* of the Actor Type as it was when the actor was
// created, not an id reference (see AUTOMATION.md), so the actor's own values (dice, descriptions,
// shutdown flags, tab notes) and the type's structure (labels, settings, which traits exist) drift
// apart and have to be merged back together explicitly.
//
// `mergeActorTypeData` is that merge: structure comes from settings, values come from the actor,
// and the two are matched entry-by-entry on the stable `id` fields. It is deliberately agnostic
// about *which* type it is given, which is what lets the same function serve both callers:
//
//   - "Update Settings" re-syncs the actor against its own type after a GM edits it in settings.
//   - Changing an actor's type feeds in a *different* type, and the id matching then means the
//     actor keeps whatever the two types have in common. Because a derived Actor Type keeps its
//     parent's ids (see actorTypeInheritanceLogic.js), switching between a parent and a child type
//     preserves nearly everything.
//
// Kept free of Foundry globals so it's unit-testable; the game.settings calls live in the callers.
import { getLength, objectFindKey, objectFindValue, objectMapValues, objectReduce } from '../../lib/helpers.js'

// Keys that describe *which* type this is, or transient sheet state belonging to the old type.
// They must never survive a change of type: `id`/`name`/`parentId` would keep pointing at the type
// being replaced, and `traitSetEdit` is an index into the old type's trait sets, which would drop
// the sheet into the edit view for a trait set the new type may not have.
const IDENTITY_KEYS = ['id', 'name', 'parentId', 'traitSetEdit']

/**
 * Merges a configured Actor Type over an actor's actorType snapshot.
 *
 * Structure (labels, settings, which entries exist) is taken from `actorTypeSettings`; the actor's
 * own values are preserved wherever an entry's `id` matches. Entries the settings no longer define
 * are dropped; entries only the settings define arrive at their configured defaults.
 */
export const mergeActorTypeData = (actorData, actorTypeSettings) => ({
  ...actorData,
  ...objectMapValues(actorTypeSettings, (propValue, key) => {
    if (key === 'simpleTraits') {
      return objectMapValues(propValue, ({ dice, hasDescription, id, label, settings }) => {
        const matchingSetting = objectFindValue((actorData.simpleTraits ?? {}), ({ id: matchId }) => matchId === id) ?? {}

        return {
          ...matchingSetting,
          dice: {
            ...matchingSetting.dice,
            consumable: dice.consumable
          },
          hasDescription,
          id,
          label,
          settings
        }
      })
    }

    if (key === 'additionalTabs') {
      return objectMapValues(propValue, ({ id, name, defaultNotes }) => {
        const matchingSetting = objectFindValue((actorData.additionalTabs ?? {}), ({ id: matchId }) => matchId === id) ?? {}
        const existingNotes = matchingSetting.notes ?? {}

        const notes = objectReduce(defaultNotes ?? {}, (acc, defaultNote) => {
          const matchKey = objectFindKey(acc, note => note.label === defaultNote.label)

          return matchKey !== undefined
            ? { ...acc, [matchKey]: { ...acc[matchKey], locked: !!defaultNote.locked } }
            : { ...acc, [getLength(acc)]: { label: defaultNote.label, value: defaultNote.value, locked: !!defaultNote.locked } }
        }, existingNotes)

        return { ...matchingSetting, id, name, notes }
      })
    }

    if (key === 'traitSets') {
      return objectMapValues(propValue, ({ hasDescription, id, label, settings, traits }) => {
        const matchingSetting = objectFindValue((actorData.traitSets ?? {}), ({ id: matchId }) => matchId === id) ?? {}

        return {
          ...matchingSetting,
          description: matchingSetting.description,
          hasDescription,
          id,
          label,
          shutdown: matchingSetting.shutdown,
          settings,
          traits: objectMapValues(traits ?? {}, trait => {
            const matchingTraitSetting = objectFindValue(matchingSetting.traits ?? {}, ({ id: matchId }) => matchId === trait.id) ?? {}
            return {
              ...matchingTraitSetting,
              id: trait.id,
              name: trait.name
            }
          })
        }
      })
    }

    return propValue
  })
})

/**
 * The actor updates needed to move an actor from its current Actor Type to `newTypeSettings`.
 *
 * Returns `{ actorType, ppValue }`, where `ppValue` is the new `system.pp.value` or `null` when it
 * should be left alone. Plot Points are only ever zeroed - moving to a type without them would
 * otherwise leave a non-zero pool the sheet no longer renders - and the actor's image is never
 * touched, unlike first-time selection, because an existing actor's portrait is its own.
 */
export const computeActorTypeChange = (actorData, newTypeSettings, currentPpValue) => {
  const merged = mergeActorTypeData(actorData ?? {}, newTypeSettings)

  // Taken from the new type only, so a stale identity can't be carried across by the spread in
  // mergeActorTypeData. Deleted rather than set when the new type doesn't define them.
  const actorType = IDENTITY_KEYS.reduce((acc, key) => {
    if (newTypeSettings[key] === undefined) {
      const { [key]: _dropped, ...rest } = acc
      return rest
    }

    return { ...acc, [key]: newTypeSettings[key] }
  }, merged)

  const losesPlotPoints = !newTypeSettings.hasPlotPoints && !!currentPpValue

  return {
    actorType,
    ppValue: losesPlotPoints ? 0 : null
  }
}
