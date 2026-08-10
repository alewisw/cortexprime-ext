// Tracks a temporary step-up/step-down on top of a Trait/Sub-Trait die's actual value. Storage
// is sparse: dice.temporaryValue only carries entries that have diverged from dice.value — a
// missing entry means "in sync," resolved via getEffectiveValue. Kept free of any Foundry
// Application-extending imports so the pure logic is unit-testable; actor.update() writes happen
// in the impure wrapper in actor-sheet.js.
const DIE_LADDER = [4, 6, 8, 10, 12]

const stepFace = (face, delta) => {
  const index = DIE_LADDER.indexOf(parseInt(face, 10))
  const next = DIE_LADDER[index + delta]

  return next ? String(next) : String(face)
}

export const stepFaceUp = face => stepFace(face, 1)
export const stepFaceDown = face => stepFace(face, -1)

export const getEffectiveValue = (value, temporaryValue, index) =>
  temporaryValue?.[index] ?? value[index]

// Resolve every die's effective face as a plain {index: face} map — this is what gets added to
// the Dice Pool, matching today's dice.value shape exactly.
export const getEffectiveDiceMap = (value, temporaryValue) =>
  Object.keys(value ?? {}).reduce((acc, index) => ({ ...acc, [index]: getEffectiveValue(value, temporaryValue, index) }), {})

// Pure. Returns the new (still-sparse) temporaryValue object after stepping one index by one
// rung. Deletes the entry entirely if the step brings it back in sync with the actual value.
export const computeSteppedTemporaryValue = (value, temporaryValue, index, direction) => {
  const current = getEffectiveValue(value, temporaryValue, index)
  const stepped = direction === 'up' ? stepFaceUp(current) : stepFaceDown(current)
  const next = { ...temporaryValue }

  if (stepped === value[index]) delete next[index]
  else next[index] = stepped

  return next
}

// Pure. Removes/reindexes dice from a paired value+temporaryValue, keeping both in lockstep.
// keptPredicate(key) decides which of value's ORIGINAL indices survive — reused for a single
// right-click removal, a multi-index consumable-dice spend, and Has-Multiple-Dice trimming.
export const reindexDiceAfterRemoval = (value, temporaryValue, keptPredicate) => {
  let newIndex = 0
  const indexMap = {}
  const newValue = {}

  Object.keys(value ?? {}).forEach(oldKey => {
    if (!keptPredicate(oldKey)) return

    indexMap[oldKey] = newIndex
    newValue[newIndex] = value[oldKey]
    newIndex++
  })

  const newTemporaryValue = Object.entries(temporaryValue ?? {}).reduce((acc, [oldKey, temp]) => {
    return oldKey in indexMap ? { ...acc, [indexMap[oldKey]]: temp } : acc
  }, {})

  return { value: newValue, temporaryValue: newTemporaryValue }
}
