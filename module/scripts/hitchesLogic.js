// Pure decision logic for the Hitches dialog — what a GM may do with each natural 1 a player
// rolled, how many Plot Points that costs, and what the player's Complications and the Doom Pool
// look like afterwards. Kept free of any Foundry globals so it's unit-testable; the game.settings
// reads, actor.update() writes and the dialog itself live in hitches.js / HitchesDialog.js.
//
// Complications and the Doom Pool are passed in here in a normalized form — complications as
// [{ label, dice: ['6', '8'] }] and the Doom Pool as ['8', '6'] — rather than Foundry's
// index-keyed objects. The impure layer converts in both directions, so this file never has to
// care about the { 0: '6', 1: '8' } storage shape.
import { stepFaceUp } from './traitDiceTemporary.js'

export const HITCH_ACTIONS = {
  NONE: 'none',
  INTRODUCE_COMPLICATION: 'introduce-complication',
  STEP_UP_COMPLICATION: 'step-up-complication',
  INTRODUCE_SCENE_COMPLICATION: 'introduce-scene-complication',
  STEP_UP_SCENE_COMPLICATION: 'step-up-scene-complication',
  ADD_DOOM_DIE: 'add-doom-die',
  STEP_UP_DOOM_DIE: 'step-up-doom-die',
  STEP_UP_PARADOX: 'step-up-paradox'
}

// A brand new complication always enters play at D6, matching _addComplication in actor-sheet.js.
export const NEW_COMPLICATION_DIE = '6'

const MAX_DIE = '12'

export const isHitch = die => die.result === 1

// Every single die came up 1 — the dialog says BOTCH rather than HITCH.
export const isBotch = dice => dice.length > 0 && dice.every(isHitch)

// Which options a hitch row may offer. The two Doom Pool options are meaningless without a
// configured Doom Pool Actor/Trait, the two Scene options need a linked Scene actor (distinct from
// the roller — see getSceneActor in hitches.js), and Paradox only exists under the Mage rule set
// once the GM has marked the roll as magical AND the Paradox rules can actually turn a hitch into
// Paradox for this roll's outcome (canStepUpParadox — see canHitchesStepUpParadox in
// module/mage/paradoxLogic.js), so a Plot Point is never spent on an inert choice.
export const getAvailableActions = ({ hasDoomPool, hasSceneActor, isMage, magick, canStepUpParadox = true }) => [
  HITCH_ACTIONS.NONE,
  HITCH_ACTIONS.INTRODUCE_COMPLICATION,
  HITCH_ACTIONS.STEP_UP_COMPLICATION,
  ...(hasSceneActor ? [HITCH_ACTIONS.INTRODUCE_SCENE_COMPLICATION, HITCH_ACTIONS.STEP_UP_SCENE_COMPLICATION] : []),
  ...(hasDoomPool ? [HITCH_ACTIONS.ADD_DOOM_DIE, HITCH_ACTIONS.STEP_UP_DOOM_DIE] : []),
  ...(isMage && magick && magick !== 'none' && canStepUpParadox ? [HITCH_ACTIONS.STEP_UP_PARADOX] : [])
]

// A row's stable identity for whichever complication it refers to. An 'introduce' row is
// identified by its own row index (it is the thing that creates that complication); a 'step up'
// row carries whichever key was picked from getComplicationOptions. The same key format is reused
// for both the character and the scene complication lists — that's safe because each is always
// resolved against its own list (by whichever action a row has), never mixed.
export const getPendingComplicationKey = rowIndex => `pending:${rowIndex}`
export const getExistingComplicationKey = index => `existing:${index}`

// Everything a 'step up a [character|scene] complication' row can target: what's already on the
// relevant sheet, plus anything an 'introduce' row of the matching type in this same dialog is
// about to create. introduceAction selects which type of 'introduce' row counts.
export const getComplicationOptions = (
  complications,
  rows,
  defaultLabel = 'Complication',
  introduceAction = HITCH_ACTIONS.INTRODUCE_COMPLICATION
) => [
  ...complications.map((complication, index) => ({
    key: getExistingComplicationKey(index),
    label: complication.label
  })),
  ...rows.reduce((acc, row, rowIndex) => (
    row.action === introduceAction
      ? [...acc, { key: getPendingComplicationKey(rowIndex), label: row.complicationName || defaultLabel }]
      : acc
  ), [])
]

// The sizes a 'step up a die in the Doom Pool' row can name. Always the full ladder below D12 —
// a D12 has nowhere to step up to, so naming one would never do anything.
export const DOOM_DIE_STEP_OPTIONS = ['4', '6', '8', '10']

// Which die a step-up applies to: the lowest at or above the picked size — the die the GM named
// if it's still there, otherwise the next one up. -1 when nothing qualifies.
export const findDoomDieToStepUp = (doomDice, pickedSize) => {
  const picked = parseInt(pickedSize, 10)

  if (!picked) return -1

  const target = doomDice
    .map((face, index) => ({ index, size: parseInt(face, 10) }))
    .filter(candidate => candidate.size >= picked)
    .sort((a, b) => a.size - b.size)[0]

  return target ? target.index : -1
}

// Returns the pool unchanged when nothing qualifies.
export const stepUpDoomDie = (doomDice, pickedSize) => {
  const index = findDoomDieToStepUp(doomDice, pickedSize)

  return index < 0 ? doomDice : doomDice.map((face, i) => i === index ? stepFaceUp(face) : face)
}

// A complication is represented by its largest die, so stepping one up steps that die.
const stepUpComplication = complication => {
  const highest = complication.dice
    .map((face, index) => ({ index, size: parseInt(face, 10) }))
    .sort((a, b) => b.size - a.size)[0]

  if (!highest) {
    return { complication: { ...complication, dice: [NEW_COMPLICATION_DIE], isSteppedUp: true }, takenOut: false }
  }

  if (complication.dice[highest.index] === MAX_DIE) {
    return { complication, takenOut: true }
  }

  return {
    complication: {
      ...complication,
      dice: complication.dice.map((face, index) => index === highest.index ? stepFaceUp(face) : face),
      isSteppedUp: true
    },
    takenOut: false
  }
}

// +1 per UNIQUE complication referenced across the introduce/step-up rows — a row that introduces
// a complication and another row that then steps that same new complication up together cost one
// Plot Point, not two — plus one per Doom Pool add, per Doom Pool step up, and per Paradox step up.
// Character and scene complications are tracked in separate Sets: the two pipelines reuse the same
// row-relative key format (pending:<rowIndex> / existing:<index>) independently, so a character
// row and a scene row that happen to carry the same key are NOT the same complication and must
// both count.
//
// A BOTCH (every die came up 1) earns no Plot Points at all, no matter what the GM picks for each
// hitch — the GM's choices still apply (complications/Doom Pool still change via computeProjection),
// only the Plot Point award is zeroed.
export const computePlotPoints = rows => {
  if (isBotch(rows)) return 0

  const characterKeys = new Set()
  const sceneKeys = new Set()

  const counted = rows.reduce((acc, row, rowIndex) => {
    if (row.action === HITCH_ACTIONS.INTRODUCE_COMPLICATION) {
      characterKeys.add(getPendingComplicationKey(rowIndex))
      return acc
    }

    if (row.action === HITCH_ACTIONS.STEP_UP_COMPLICATION) {
      if (row.complicationKey) characterKeys.add(row.complicationKey)
      return acc
    }

    if (row.action === HITCH_ACTIONS.INTRODUCE_SCENE_COMPLICATION) {
      sceneKeys.add(getPendingComplicationKey(rowIndex))
      return acc
    }

    if (row.action === HITCH_ACTIONS.STEP_UP_SCENE_COMPLICATION) {
      if (row.complicationKey) sceneKeys.add(row.complicationKey)
      return acc
    }

    return [HITCH_ACTIONS.ADD_DOOM_DIE, HITCH_ACTIONS.STEP_UP_DOOM_DIE, HITCH_ACTIONS.STEP_UP_PARADOX]
      .includes(row.action)
      ? acc + 1
      : acc
  }, 0)

  return counted + characterKeys.size + sceneKeys.size
}

// Runs the introduce/step-up pipeline against one complication list (a character's or a scene
// actor's), reacting only to rows carrying the given pair of actions. Identical mechanics either
// way — only which rows it looks at, and which list it starts from, differ.
const projectComplications = (rows, complications, introduceAction, stepUpAction, defaultLabel) => {
  const pendingIndexes = {}

  // 1. Introduce
  const introduced = rows.reduce((acc, row, rowIndex) => {
    if (row.action !== introduceAction) return acc

    pendingIndexes[getPendingComplicationKey(rowIndex)] = acc.length

    return [...acc, { label: row.complicationName || defaultLabel, dice: [NEW_COMPLICATION_DIE], isNew: true }]
  }, complications.map(complication => ({ ...complication, dice: [...complication.dice] })))

  const resolveIndex = key => {
    if (!key) return -1
    if (key in pendingIndexes) return pendingIndexes[key]

    const match = /^existing:(\d+)$/.exec(key)

    return match ? parseInt(match[1], 10) : -1
  }

  // 2. Step up. `changed` collects the indexes this roll actually altered, so the summary can show
  // just those rather than the whole complication list. A complication that was already at D12
  // isn't counted as changed — it is reported under takenOut instead.
  const { complications: stepped, takenOut, changed } = rows.reduce((acc, row) => {
    if (row.action !== stepUpAction) return acc

    const index = resolveIndex(row.complicationKey)

    if (index < 0 || !acc.complications[index]) return acc

    // An optional rename rides along with the step up. It's applied even when the die itself
    // can't grow (a D12), since renaming is independent of the step — the taken-out report below
    // then names it by its new label.
    const target = row.renameComplication
      ? { ...acc.complications[index], label: row.renameComplication }
      : acc.complications[index]

    const { complication, takenOut: wasTakenOut } = stepUpComplication(target)

    return {
      complications: acc.complications.map((entry, entryIndex) => entryIndex === index ? complication : entry),
      takenOut: wasTakenOut && !acc.takenOut.includes(complication.label)
        ? [...acc.takenOut, complication.label]
        : acc.takenOut,
      changed: wasTakenOut || acc.changed.includes(index) ? acc.changed : [...acc.changed, index]
    }
  }, { complications: introduced, takenOut: [], changed: Object.values(pendingIndexes) })

  return {
    // The full list is what gets written back to the actor; changed is what the dialog preview
    // and the chat summary show.
    complications: stepped,
    changedComplications: stepped.filter((_, index) => changed.includes(index)),
    takenOut
  }
}

// Applies every row in the order the rules call for — introduce complications, step up
// complications (character, then scene), add Doom Pool dice, step up Doom Pool dice — and reports
// the resulting state. paradoxSteps is counted but deliberately applies no change to the Paradox
// trait yet.
export const computeProjection = ({
  rows,
  complications,
  sceneComplications = [],
  doomDice,
  defaultComplicationLabel = 'Complication'
}) => {
  const character = projectComplications(
    rows, complications, HITCH_ACTIONS.INTRODUCE_COMPLICATION, HITCH_ACTIONS.STEP_UP_COMPLICATION, defaultComplicationLabel
  )
  const scene = projectComplications(
    rows, sceneComplications, HITCH_ACTIONS.INTRODUCE_SCENE_COMPLICATION, HITCH_ACTIONS.STEP_UP_SCENE_COMPLICATION, defaultComplicationLabel
  )

  // 3. Add Doom Pool dice. Tracked as entries rather than bare faces so the summary can say which
  // dice this roll put there and which it grew.
  const addedDoomDice = rows.reduce((acc, row) => (
    row.action === HITCH_ACTIONS.ADD_DOOM_DIE ? [...acc, { face: String(row.faces), isNew: true }] : acc
  ), doomDice.map(face => ({ face })))

  // 4. Step up Doom Pool dice. A die that can't actually grow (a D12) isn't marked as stepped up.
  const projectedDoomDice = rows.reduce((acc, row) => {
    if (row.action !== HITCH_ACTIONS.STEP_UP_DOOM_DIE) return acc

    const index = findDoomDieToStepUp(acc.map(entry => entry.face), row.doomDieSize)

    if (index < 0) return acc

    return acc.map((entry, entryIndex) => {
      if (entryIndex !== index) return entry

      const stepped = stepFaceUp(entry.face)

      return stepped === entry.face ? entry : { ...entry, face: stepped, isSteppedUp: true }
    })
  }, addedDoomDice)

  return {
    complications: character.complications,
    changedComplications: character.changedComplications,
    takenOut: character.takenOut,
    sceneComplications: scene.complications,
    changedSceneComplications: scene.changedComplications,
    sceneTakenOut: scene.takenOut,
    // doomDice is the bare face list written back to the trait; doomDiceDetail carries the
    // new/stepped-up markers the summary shows.
    doomDice: projectedDoomDice.map(entry => entry.face),
    doomDiceDetail: projectedDoomDice,
    paradoxSteps: rows.filter(row => row.action === HITCH_ACTIONS.STEP_UP_PARADOX).length
  }
}

// True once the GM's choices actually changed something - every row still on NONE (no hitches
// acted on) leaves every field below empty, so the chat card should stay silent rather than post
// an effectively-blank summary. Mirrors the isNew/isSteppedUp filter the chat summary itself uses
// for doomDice.
export const hasHitchOutcomes = projection =>
  projection.changedComplications.length > 0 ||
  projection.changedSceneComplications.length > 0 ||
  projection.doomDiceDetail.some(entry => entry.isNew || entry.isSteppedUp) ||
  projection.paradoxSteps > 0
