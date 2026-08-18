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
