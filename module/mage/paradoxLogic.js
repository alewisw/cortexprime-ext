// Pure decision logic for the "Mage: The Ascension Engine" Paradox/Trauma chain: how large a
// Paradox die a roll earns, how the Scene's Shielding absorbs or shrinks it, how it escalates
// against the Player's existing Paradox trait, when that cascades into Trauma (and QUIET), and
// whether the Player may "Limit" it away. Kept free of any Foundry globals so it's unit-testable;
// the settings/actor reads, the flag hand-off to the Player and the dialog live in paradox.js.
//
// Die faces are strings ('4'...'12') throughout, matching how actor data stores them.
import { stepFaceUp } from '../scripts/traitDiceTemporary.js'

const DIE_LADDER = ['4', '6', '8', '10', '12']

export const PARADOX_OUTCOMES = {
  WON: 'won',
  LOST: 'lost',
  BOTCH: 'botch'
}

export const LIMIT_STATES = {
  AVAILABLE: 'available',
  VULGAR_BOTCH: 'vulgar-botch',
  TOO_LARGE: 'too-large'
}

const COINCIDENTAL = ['coincidental', 'coincidental-witnessed']
const VULGAR = ['vulgar', 'vulgar-witnessed']
// Witnessed magick is too blatant for a location's Shielding to muffle.
const WITNESSED = ['coincidental-witnessed', 'vulgar-witnessed']

const ladderIndex = face => DIE_LADDER.indexOf(String(face))

// Applies stepFaceUp `times` times. stepFaceUp already clamps at D12 rather than wrapping, so the
// "max D12" cap in every rule below falls out of this for free.
const stepUpTimes = (face, times) =>
  Array.from({ length: Math.max(0, times) }).reduce(acc => stepFaceUp(acc), String(face))

// The largest face in a list, as a string — a trait or an effect-dice array can hold several.
export const largestFace = faces => {
  const sorted = (faces ?? []).map(face => parseInt(face, 10)).filter(face => !Number.isNaN(face)).sort((a, b) => b - a)

  return sorted.length ? String(sorted[0]) : null
}

// The roll's outcome for Paradox purposes, or null when there was no opposition at all — a
// recorded `won` of null means the roller wasn't scored against anyone (a Group initiative roll, or
// the challenge initiator's own roll), and those earn no Paradox whatsoever.
export const getParadoxOutcome = (won, dice) => {
  if (won === null || won === undefined) return null

  // A botch (every die a natural 1) always reads as a botch, regardless of the win flag.
  if ((dice ?? []).length > 0 && dice.every(die => die.result === 1)) return PARADOX_OUTCOMES.BOTCH

  return won ? PARADOX_OUTCOMES.WON : PARADOX_OUTCOMES.LOST
}

// Whether "Step up Paradox" on a hitch can actually produce anything. Coincidental magick only
// earns Paradox on a botch, so outside that the option is hidden from the Hitches dialog rather
// than letting the GM spend a Plot Point on an inert choice.
export const canHitchesStepUpParadox = (magick, outcome) => {
  if (!outcome) return false
  if (VULGAR.includes(magick)) return true
  if (COINCIDENTAL.includes(magick)) return outcome === PARADOX_OUTCOMES.BOTCH

  return false
}

// The Paradox die this roll earns before Shielding, or null for none.
//   Coincidental / Coincidental Witnessed — only a BOTCH earns anything: D6, plus one step per
//     selected hitch BEYOND THE FIRST (so 0 or 1 hitch is still D6).
//   Vulgar — WON earns nothing unless hitches were spent, and each one steps a D4 up
//     (1 -> D6, 2 -> D8, 3 -> D10, 4 -> D12). LOST/BOTCH starts from the opposition's Effect die,
//     plus one step per hitch.
//   Vulgar Witnessed — WON is a flat D6 plus one step per hitch. LOST/BOTCH matches Vulgar.
// The same rules, but showing their working: which rule set the starting die, what that die was
// before any hitches were spent, and how many steps were then applied. buildParadoxLog needs all
// three to explain itself; computeBaseParadox is just the `die` off the end of it.
//
// `stepsFrom` names which hitch rule applies, because Coincidental spends its first hitch merely
// getting to D6 while every other case steps up from the first.
export const describeBaseParadox = ({ magick, outcome, paradoxSteps = 0, oppositionEffectDie = '4' }) => {
  if (!outcome) return null

  const steps = Math.max(0, paradoxSteps)

  const describe = (originKey, originDie, appliedSteps, stepsFrom) => ({
    originKey,
    originDie: String(originDie),
    steps: Math.max(0, appliedSteps),
    stepsFrom,
    die: stepUpTimes(originDie, appliedSteps)
  })

  if (COINCIDENTAL.includes(magick)) {
    if (outcome !== PARADOX_OUTCOMES.BOTCH) return null

    return describe('ParadoxStepBaseCoincidentalBotch', '6', steps - 1, 'beyond-first')
  }

  if (magick === 'vulgar') {
    if (outcome === PARADOX_OUTCOMES.WON) {
      return steps > 0 ? describe('ParadoxStepBaseVulgarWon', '4', steps, 'each') : null
    }

    return describe('ParadoxStepBaseFromOpposition', oppositionEffectDie, steps, 'each')
  }

  if (magick === 'vulgar-witnessed') {
    if (outcome === PARADOX_OUTCOMES.WON) return describe('ParadoxStepBaseVulgarWitnessedWon', '6', steps, 'each')

    return describe('ParadoxStepBaseFromOpposition', oppositionEffectDie, steps, 'each')
  }

  return null
}

export const computeBaseParadox = context => describeBaseParadox(context)?.die ?? null

// The Scene's Shielding trait absorbing or shrinking the Paradox. Only applies when there is a
// Paradox die, the Scene actually has a Shielding die, and the magick wasn't Witnessed.
// Paradox <= Shielding is absorbed outright; otherwise one rung larger becomes D6, two rungs D8,
// and three or more D10. `applied` distinguishes "Shielding did nothing" from "Shielding absorbed
// it", which the log needs to tell apart.
export const applyShielding = (paradoxFace, shieldingFace, magick) => {
  if (!paradoxFace) return { paradox: null, applied: false }
  if (WITNESSED.includes(magick)) return { paradox: paradoxFace, applied: false }
  if (!shieldingFace) return { paradox: paradoxFace, applied: false }

  const difference = ladderIndex(paradoxFace) - ladderIndex(shieldingFace)

  if (difference <= 0) return { paradox: null, applied: true }
  if (difference === 1) return { paradox: '6', applied: true }
  if (difference === 2) return { paradox: '8', applied: true }

  return { paradox: '10', applied: true }
}

// The Paradox die measured against whatever the Player already carries. A bigger incoming die
// simply replaces it; otherwise the existing trait steps up one rung — and a trait already at D12
// stays there and spills over into Trauma instead.
export const computeFinalParadox = (paradoxFace, currentParadoxFace) => {
  if (!paradoxFace) return { finalParadox: null, needsTrauma: false }
  if (!currentParadoxFace) return { finalParadox: paradoxFace, needsTrauma: false }

  if (ladderIndex(paradoxFace) > ladderIndex(currentParadoxFace)) {
    return { finalParadox: paradoxFace, needsTrauma: false }
  }

  if (currentParadoxFace === '12') return { finalParadox: '12', needsTrauma: true }

  return { finalParadox: stepFaceUp(currentParadoxFace), needsTrauma: false }
}

// Trauma only ever grows: nothing or D4 becomes D6, and a D12 stays D12 while descending into QUIET.
export const computeFinalTrauma = currentTraumaFace => {
  if (!currentTraumaFace || currentTraumaFace === '4') return { finalTrauma: '6', descendIntoQuiet: false }
  if (currentTraumaFace === '12') return { finalTrauma: '12', descendIntoQuiet: true }

  return { finalTrauma: stepFaceUp(currentTraumaFace), descendIntoQuiet: false }
}

// Whether the Player may spend a Limit to avoid the Paradox. A Vulgar botch never can. Otherwise
// the Paradox has to be matched by at least one Powers die that was actually in the roll — note a
// roll containing NO Powers dice is vacuously "too large", since there's nothing to limit with.
export const computeLimitState = ({ magick, outcome, finalParadox, powersFaces = [] }) => {
  if (VULGAR.includes(magick) && outcome === PARADOX_OUTCOMES.BOTCH) return LIMIT_STATES.VULGAR_BOTCH

  const paradoxIndex = ladderIndex(finalParadox)

  return powersFaces.every(face => paradoxIndex > ladderIndex(face))
    ? LIMIT_STATES.TOO_LARGE
    : LIMIT_STATES.AVAILABLE
}

const MAGICK_LABELS = {
  coincidental: 'MageMagickCoincidental',
  'coincidental-witnessed': 'MageMagickCoincidentalWitnessed',
  vulgar: 'MageMagickVulgar',
  'vulgar-witnessed': 'MageMagickVulgarWitnessed'
}

const OUTCOME_LABELS = {
  [PARADOX_OUTCOMES.WON]: 'Won',
  [PARADOX_OUTCOMES.LOST]: 'Lost',
  [PARADOX_OUTCOMES.BOTCH]: 'Botch'
}

const die = face => `D${face}`

// An inputs row whose value is itself a localization key, vs. one whose value is literal text.
const localizedRow = (label, key) => ({ label, value: { key } })
const textRow = (label, text) => ({ label, value: { text: String(text) } })

/**
 * The reasoned account of how a Paradox was arrived at: the inputs that fed the rules, then the
 * rules that were applied in order.
 *
 * Both halves stay as { key, data } pairs rather than finished strings, so the Player's client does
 * the localizing (the same convention dicePoolValidation.js uses) — the GM's client computes this
 * and hands it over on a flag.
 */
export const buildParadoxLog = ({
  magick,
  outcome,
  paradoxSteps = 0,
  oppositionEffectDie,
  shieldingFace,
  shieldedParadox,
  shieldingApplied,
  finalParadox,
  finalTrauma,
  descendIntoQuiet,
  currentParadox,
  currentTrauma
}) => {
  const base = describeBaseParadox({ magick, outcome, paradoxSteps, oppositionEffectDie })
  const steps = []

  // ---- Inputs ----

  const inputs = [
    localizedRow('ParadoxInputMagick', MAGICK_LABELS[magick] ?? 'None'),
    localizedRow('ParadoxInputOutcome', OUTCOME_LABELS[outcome] ?? 'None')
  ]

  // Only shown when it actually fed the calculation — a won roll never reads the opposition's die.
  if (base?.originKey === 'ParadoxStepBaseFromOpposition') {
    inputs.push(textRow('ParadoxInputOppositionEffect', die(oppositionEffectDie)))
  }

  inputs.push(textRow('ParadoxInputHitchSteps', Math.max(0, paradoxSteps)))

  inputs.push(WITNESSED.includes(magick)
    ? localizedRow('ParadoxInputShielding', 'ParadoxShieldingNotApplicable')
    : shieldingFace
      ? textRow('ParadoxInputShielding', die(shieldingFace))
      : localizedRow('ParadoxInputShielding', 'None'))

  inputs.push(currentParadox
    ? textRow('ParadoxInputCurrentParadox', die(currentParadox))
    : localizedRow('ParadoxInputCurrentParadox', 'None'))

  // Trauma is only ever consulted when the Paradox cascaded into it, so listing it otherwise would
  // imply it was part of the sum.
  if (finalTrauma) {
    inputs.push(currentTrauma
      ? textRow('ParadoxInputCurrentTrauma', die(currentTrauma))
      : localizedRow('ParadoxInputCurrentTrauma', 'None'))
  }

  // ---- Steps ----

  if (base) {
    steps.push({ key: base.originKey, data: { die: die(base.originDie) } })

    if (base.steps > 0) {
      steps.push({
        key: base.stepsFrom === 'beyond-first' ? 'ParadoxStepHitchesBeyondFirst' : 'ParadoxStepHitches',
        data: { steps: base.steps, hitches: Math.max(0, paradoxSteps), from: die(base.originDie), die: die(base.die) }
      })
    }
  }

  if (WITNESSED.includes(magick)) {
    steps.push({ key: 'ParadoxStepShieldingWitnessed', data: {} })
  } else if (!shieldingFace) {
    steps.push({ key: 'ParadoxStepShieldingNone', data: {} })
  } else if (shieldingApplied && !shieldedParadox) {
    steps.push({ key: 'ParadoxStepShieldingAbsorbed', data: { shielding: die(shieldingFace), paradox: die(base?.die) } })
  } else if (shieldingApplied) {
    steps.push({
      key: 'ParadoxStepShieldingReduced',
      data: {
        paradox: die(base?.die),
        shielding: die(shieldingFace),
        rungs: ladderIndex(base?.die) - ladderIndex(shieldingFace),
        die: die(shieldedParadox)
      }
    })
  }

  if (finalParadox) {
    if (!currentParadox) {
      steps.push({ key: 'ParadoxStepFinalNew', data: { die: die(finalParadox) } })
    } else if (ladderIndex(shieldedParadox) > ladderIndex(currentParadox)) {
      steps.push({
        key: 'ParadoxStepFinalReplaces',
        data: { incoming: die(shieldedParadox), current: die(currentParadox), die: die(finalParadox) }
      })
    } else if (currentParadox === '12') {
      steps.push({ key: 'ParadoxStepFinalAtMax', data: { incoming: die(shieldedParadox), die: die(finalParadox) } })
    } else {
      steps.push({
        key: 'ParadoxStepFinalStepUp',
        data: { incoming: die(shieldedParadox), current: die(currentParadox), die: die(finalParadox) }
      })
    }
  }

  if (finalTrauma) {
    if (!currentTrauma) {
      steps.push({ key: 'ParadoxStepTraumaNone', data: { die: die(finalTrauma) } })
    } else if (currentTrauma === '4') {
      steps.push({ key: 'ParadoxStepTraumaFromMinimum', data: { from: die(currentTrauma), die: die(finalTrauma) } })
    } else if (currentTrauma === '12') {
      steps.push({ key: 'ParadoxStepTraumaAtMax', data: { die: die(finalTrauma) } })
    } else {
      steps.push({ key: 'ParadoxStepTraumaStepUp', data: { from: die(currentTrauma), die: die(finalTrauma) } })
    }
  }

  if (descendIntoQuiet) steps.push({ key: 'ParadoxStepQuiet', data: {} })

  return { inputs, steps }
}
