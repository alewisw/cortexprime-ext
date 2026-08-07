// Crisis Pool state (a GM-managed pool of dice representing an escalating danger) and its
// pure die-reduction algorithm. Kept free of any Foundry Application-extending imports so it
// can be safely imported from rollToBeat.js and unit tests — the FloatingPanel widget/button
// wiring lives in crisisPoolPanel.js instead.
const DIE_LADDER = [4, 6, 8, 10, 12]
const ELIMINATION_ORDER = [12, 10, 8, 6] // largest first — a D4 can only be stepped to removed, never "eliminated"

export const getCrisisPool = () => ({ active: false, name: '', dice: [], ...game.settings.get('cortexprime', 'crisisPool') })

const setCrisisPoolState = async pool => {
  await game.settings.set('cortexprime', 'crisisPool', pool)
}

export const startCrisis = async ({ name, dice }) => {
  await setCrisisPoolState({ active: true, name, dice })
}

export const endCrisis = async () => {
  await setCrisisPoolState({ active: false, name: '', dice: [] })
}

const stepDownFace = face => {
  const index = DIE_LADDER.indexOf(face)

  return index > 0 ? DIE_LADDER[index - 1] : null
}

// Picks which die in the pool a given effect die reduces: the largest D12/D10/D8/D6 it can
// outright eliminate, or — if it can't eliminate anything — the highest-faced die present
// (which then gets stepped down by the caller).
export const chooseCrisisDieIndex = (dice, effectFace) => {
  for (const face of ELIMINATION_ORDER) {
    if (effectFace > face) {
      const index = dice.indexOf(face)
      if (index !== -1) return index
    }
  }

  return dice.reduce((bestIndex, face, index) => face > dice[bestIndex] ? index : bestIndex, 0)
}

// Pure: given the crisis pool's current dice and a winning effect die, returns both the new
// dice array and a description of what happened to whichever die chooseCrisisDieIndex picked.
// An empty input is returned as-is with no event — the caller decides what an empty result
// means (i.e. ending the crisis).
export const computeCrisisReduction = (dice, effectDice) => {
  if (dice.length === 0) return { dice, event: null }

  const effectFace = effectDice?.[0] ?? 4
  const index = chooseCrisisDieIndex(dice, effectFace)
  const face = dice[index]
  const result = [...dice]
  let event

  if (effectFace > face) {
    result.splice(index, 1)
    event = { type: 'removed', face }
  } else {
    const stepped = stepDownFace(face)

    if (stepped === null) {
      result.splice(index, 1)
      event = { type: 'removed', face }
    } else {
      result[index] = stepped
      event = { type: 'steppedDown', from: face, to: stepped }
    }
  }

  return { dice: result, event }
}

export const reduceCrisisDice = (dice, effectDice) => computeCrisisReduction(dice, effectDice).dice

export const reduceCrisisPoolByEffectDie = async effectDice => {
  const pool = getCrisisPool()

  if (!pool.active || pool.dice.length === 0) return

  const { dice } = computeCrisisReduction(pool.dice, effectDice)

  if (dice.length === 0) await endCrisis()
  else await setCrisisPoolState({ ...pool, dice })
}

// What WOULD happen if the crisis pool were reduced right now by this effect die — used to
// describe the outcome on the roller's own chat message. The actual, authoritative mutation
// still happens separately via reduceCrisisPoolByEffectDie on the GM's client; both agree
// because the underlying computation is deterministic given the same pool state and effect die.
export const previewCrisisReduction = effectDice => {
  const pool = getCrisisPool()

  if (!pool.active || pool.dice.length === 0) return null

  const { dice, event } = computeCrisisReduction(pool.dice, effectDice)

  return { event, resolved: dice.length === 0 }
}
