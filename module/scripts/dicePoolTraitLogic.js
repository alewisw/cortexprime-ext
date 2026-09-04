// Pure logic for putting a Trait into the dice pool — used by both the plain "add to pool" click
// and the Hinder click, which differ only in which value (and hindered flag) they ask for.
//
// Kept free of Foundry globals so it's unit-testable; the flag read/write lives in
// UserDicePool.js's _setTraitInPool.
import { getLength } from '../../lib/helpers.js'

const faceSet = value => Object.values(value ?? {}).map(String).sort()

// Same MULTISET of faces, order ignored — d8+d6 already in the pool matches a d6+d8 request.
const sameFaces = (a, b) => {
  const facesA = faceSet(a)
  const facesB = faceSet(b)

  return facesA.length === facesB.length && facesA.every((face, index) => face === facesB[index])
}

// Every entry across every source (not just `source`) whose traitPath matches — an instance
// parked under a different source (Difficulty, custom, ...) is still found and corrected.
const findInstances = (poolBySource, traitPath) => Object.entries(poolBySource ?? {}).flatMap(
  ([source, entries]) => Object.entries(entries ?? {})
    .filter(([, entry]) => entry?.traitPath === traitPath)
    .map(([index, entry]) => ({ source, index, entry }))
)

const replaceInstance = (poolBySource, { source, index }, changes) => ({
  ...poolBySource,
  [source]: {
    ...poolBySource[source],
    [index]: { ...poolBySource[source][index], ...changes }
  }
})

const appendEntry = (poolBySource, source, entry) => {
  const nextIndex = getLength(poolBySource[source] ?? {})

  return {
    ...poolBySource,
    [source]: {
      ...(poolBySource[source] ?? {}),
      [nextIndex]: entry
    }
  }
}

/**
 * Places a Trait into the pool at `value` (and `hindered` state), by one rule:
 *
 *   - the pool holds EXACTLY ONE instance of this trait and its value is wrong -> that instance is
 *     replaced in place, and nothing is added;
 *   - otherwise -> a new entry is appended at the requested value, AND every existing instance
 *     whose value is wrong (there may be none, one, or several) is corrected to match.
 *
 * "Wrong" means a different multiset of faces, not merely a different `hindered` flag — so a
 * hindered d4 and its real value are always distinguishable even if the real value also happens to
 * be a d4. A corrected instance takes on the newly requested `hindered` state along with its value:
 * the plain dice click (hindered: false) both adds/updates at the real value AND de-hinders any
 * stray instance still sitting at the Hinder value.
 *
 * `poolBySource` is the pool's `{ [source]: { [index]: entry } }` map (dicePool.pool in the user
 * flag). Returns a new object of the same shape; never mutates its input.
 */
export const applyTraitToPool = (poolBySource, { source, traitPath, label, value, traitSetId, hindered }) => {
  const pool = poolBySource ?? {}
  const newEntry = { label, value, traitPath, traitSetId, hindered }

  // No identity to match against - mirrors the pre-Hinder behaviour of always appending (custom
  // dice, assets, complications: none of these route through this function today, but nothing here
  // should assume a traitPath is guaranteed).
  if (!traitPath) return appendEntry(pool, source, newEntry)

  const instances = findInstances(pool, traitPath)
  const wrongInstances = instances.filter(({ entry }) => !sameFaces(entry.value, value))

  if (instances.length === 1 && wrongInstances.length === 1) {
    return replaceInstance(pool, wrongInstances[0], newEntry)
  }

  const corrected = wrongInstances.reduce(
    (acc, instance) => replaceInstance(acc, instance, { value, hindered }),
    pool
  )

  return appendEntry(corrected, source, newEntry)
}

// ---- Add-to-pool guard ----
//
// Every dice-holding element on the sheet (a Trait Set's main/custom Trait, a Sub-Trait, a
// Simple Trait, an Asset, a Complication) computes its own `add-to-pool` CSS class from a mix of
// live actor data — shutdown state, hasDice/subTraitsHaveDice/valueType, and whether the die
// actually has a value (see traits.html/simple-traits.html/temporary-traits.html). The
// `data-action="addToPool"` attribute on that same element is unconditional though: ApplicationV2
// dispatches on the attribute alone, regardless of which classes ended up next to it — so a
// shutdown Trait, a text-type Simple Trait (which still carries a default `dice` value — see
// ActorSettings.#onAddSimpleTrait), or a freshly-configured Trait with no `dice` object at all
// yet (mergeActorTypeData in actorTypeChangeLogic.js deliberately omits it) could otherwise reach
// _setTraitInPool — the last case throwing outright.
//
// canAddDicePointToPool/canHinderDicePointToPool re-derive the SAME decision straight from
// `actorType` (the actor's system.actorType, a plain object) and the clicked element's own
// `data-path`, so actor-sheet.js's _addToPool/_hinderToPool can refuse anything the sheet
// wouldn't actually have offered. Every data-path built by these partials starts with
// 'system.actorType.' — what follows that root selects which of the five rules applies; an
// unrecognised shape is treated as not addable.
const hasDiceValue = diceData => !!diceData?.value?.[0]

const resolveDicePoint = (actorType, path) => {
  const relative = (path ?? '').replace(/^system\.actorType\./, '')

  const simpleTraitMatch = /^simpleTraits\.(\d+)\.dice$/.exec(relative)
  if (simpleTraitMatch) {
    const trait = actorType?.simpleTraits?.[simpleTraitMatch[1]]
    return { kind: 'simpleTrait', diceData: trait?.dice, valueType: trait?.settings?.valueType }
  }

  const assetMatch = /^assets\.(\d+)\.dice$/.exec(relative)
  if (assetMatch) return { kind: 'plain', diceData: actorType?.assets?.[assetMatch[1]]?.dice }

  const complicationMatch = /^complications\.(\d+)\.dice$/.exec(relative)
  if (complicationMatch) return { kind: 'plain', diceData: actorType?.complications?.[complicationMatch[1]]?.dice }

  const subTraitMatch = /^traitSets\.(\d+)\.(traits|customTraits)\.(\d+)\.subTraits\.(\d+)\.dice$/.exec(relative)
  if (subTraitMatch) {
    const [, tsIndex, collection, traitIndex, subIndex] = subTraitMatch
    const traitSet = actorType?.traitSets?.[tsIndex]
    const trait = traitSet?.[collection]?.[traitIndex]

    return {
      kind: 'subTrait',
      diceData: trait?.subTraits?.[subIndex]?.dice,
      hasDice: traitSet?.settings?.subTraitsHaveDice,
      traitSetShutdown: traitSet?.shutdown,
      traitShutdown: trait?.shutdown
    }
  }

  const traitMatch = /^traitSets\.(\d+)\.(traits|customTraits)\.(\d+)\.dice$/.exec(relative)
  if (traitMatch) {
    const [, tsIndex, collection, traitIndex] = traitMatch
    const traitSet = actorType?.traitSets?.[tsIndex]
    const trait = traitSet?.[collection]?.[traitIndex]

    return {
      kind: 'trait',
      diceData: trait?.dice,
      hasDice: traitSet?.settings?.hasDice,
      traitSetShutdown: traitSet?.shutdown,
      traitShutdown: trait?.shutdown,
      enableHinder: trait?.enableHinder
    }
  }

  return null
}

// The shutdown/hasDice/value gate shared by 'trait' and 'subTrait' points — both key off the SAME
// Trait Set settings (settings.hasDice or settings.subTraitsHaveDice, already folded into
// `hasDice` by resolveDicePoint) and the same two shutdown flags; a Sub-Trait has no shutdown of
// its own, it inherits its parent Trait's.
const isShutdownGated = point =>
  !point.traitSetShutdown && !point.traitShutdown && !!point.hasDice && hasDiceValue(point.diceData)

export const canAddDicePointToPool = (actorType, path) => {
  const point = resolveDicePoint(actorType, path)

  if (!point) return false
  if (point.kind === 'simpleTrait') return point.valueType === 'dice' && hasDiceValue(point.diceData)
  if (point.kind === 'plain') return hasDiceValue(point.diceData)

  return isShutdownGated(point)
}

// Hinder is only ever offered on a Trait Set's main/custom Trait (see traits.html) — the same
// gate as canAddDicePointToPool for that path, plus the Trait's own enableHinder flag.
export const canHinderDicePointToPool = (actorType, path) => {
  const point = resolveDicePoint(actorType, path)

  return point?.kind === 'trait' && !!point.enableHinder && isShutdownGated(point)
}

const CHALLENGE_TYPES = ['test', 'contest', 'group']

/**
 * The pool entries that earn their roller a Plot Point: those marked `hindered`, and only while a
 * Test, Contest or Group Challenge is what's being rolled for - a hindered trait rolled with no
 * challenge running (or during initiative, which isn't one of these three) earns nothing.
 */
export const getHinderRewards = (poolEntries, challengeType) => {
  if (!CHALLENGE_TYPES.includes(challengeType)) return []

  return (poolEntries ?? []).filter(entry => entry?.hindered)
}
