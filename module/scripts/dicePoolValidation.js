// Validates the COMPOSITION of the current user's Dice Pool against Trait Set rules — this is
// checked purely for gating the roll buttons; it never restricts what can be added to the pool.
// Kept free of any Foundry Application-extending imports so the pure logic is unit-testable.
const countBy = (items, keyFn) => items.reduce((counts, item) => {
  const key = keyFn(item)
  counts[key] = (counts[key] ?? 0) + 1
  return counts
}, {})

export const flattenPoolEntries = pool =>
  Object.values(pool ?? {}).flatMap(sourceEntries => Object.values(sourceEntries ?? {}))

export const getAllTraitSets = () =>
  Object.values(game.settings.get('cortexprime-ext', 'actorTypes'))
    .flatMap(actorType => Object.values(actorType.traitSets ?? {}))

const traitLabelsFor = (poolEntries, traitSetId) =>
  poolEntries.filter(entry => entry.traitSetId === traitSetId).map(entry => entry.label)

// Pure. poolEntries: flattened pool entries, each optionally carrying `label`/`traitPath`/
// `traitSetId` (entries with neither `traitPath` nor `traitSetId` — custom dice, Difficulty,
// Crisis Pool, or anything added before this metadata existed — never trip any rule).
// allTraitSets: flattened { id, label, settings } objects across every Actor Type. Returns null
// when the pool is valid to roll, or `{ key, data }` — a lang key plus the Trait Set/Trait names
// involved, ready for `game.i18n.format(key, data)` — describing which rule is violated.
export const validateDicePool = (poolEntries, allTraitSets, spendPlotPointForExtraDie) => {
  const withPath = poolEntries.filter(entry => entry.traitPath)
  const pathCounts = countBy(withPath, entry => entry.traitPath)
  const duplicatePath = Object.keys(pathCounts).find(path => pathCounts[path] > 1)

  if (duplicatePath) {
    const trait = withPath.find(entry => entry.traitPath === duplicatePath)
    return { key: 'DicePoolInvalidDuplicateTrait', data: { trait: trait.label } }
  }

  const traitSetIdsPresent = [...new Set(poolEntries.map(entry => entry.traitSetId).filter(Boolean))]
  const limit = spendPlotPointForExtraDie ? 2 : 1

  for (const traitSetId of traitSetIdsPresent) {
    const traitSet = allTraitSets.find(ts => ts.id === traitSetId)
    if (!traitSet?.settings?.limitOnePerDicePool) continue

    const traits = traitLabelsFor(poolEntries, traitSetId)
    if (traits.length > limit) {
      return { key: 'DicePoolInvalidLimitOne', data: { traitSet: traitSet.label, traits: traits.join(', ') } }
    }
  }

  for (const traitSetId of traitSetIdsPresent) {
    const traitSet = allTraitSets.find(ts => ts.id === traitSetId)
    const exclusiveId = traitSet?.settings?.mutuallyExclusiveWith

    if (exclusiveId && traitSetIdsPresent.includes(exclusiveId)) {
      const exclusiveTraitSet = allTraitSets.find(ts => ts.id === exclusiveId)

      return {
        key: 'DicePoolInvalidMutuallyExclusive',
        data: {
          traitSetA: traitSet.label,
          traitsA: traitLabelsFor(poolEntries, traitSetId).join(', '),
          traitSetB: exclusiveTraitSet?.label ?? '',
          traitsB: traitLabelsFor(poolEntries, exclusiveId).join(', ')
        }
      }
    }
  }

  return null
}

export const getDicePoolInvalidReason = (pool, spendPlotPointForExtraDie) =>
  validateDicePool(flattenPoolEntries(pool), getAllTraitSets(), spendPlotPointForExtraDie)
