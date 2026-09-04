// Pure decision logic for the "Mage: The Ascension Engine" custom rule set's Challenge
// automation (Magick / Reality Reinforcement). Kept free of any Foundry Application-extending
// imports so it's unit-testable; only reads from rollToBeat.js's own exported pure functions —
// never modifies that file. The impure Foundry-integration wrapper lives in mageAscension.js.
import { objectMapValues } from '../../lib/helpers.js'
import { getPendingGroupParticipants } from '../scripts/rollToBeat.js'
import { stepFaceUp } from '../scripts/traitDiceTemporary.js'

export const isMageRuleSetActive = customRuleSet => customRuleSet === 'mage'

const MAGICK_LABEL_KEYS = {
  coincidental: 'MageMagickCoincidental',
  'coincidental-witnessed': 'MageMagickCoincidentalWitnessed',
  vulgar: 'MageMagickVulgar',
  'vulgar-witnessed': 'MageMagickVulgarWitnessed'
}

// The lang key for the current Magick value's own label, or null when there's nothing to prefix
// the Dice Pool tray's Test/Contest/Group status line with — Magick is None, or nothing selected.
export const getMagickLabelKey = magick => MAGICK_LABEL_KEYS[magick] ?? null

// Whether the GM's Dice Pool tray should show the Magick/Reality Reinforcement box — Mage is the
// active custom rule set, and a Challenge (Test/Contest/Group) is currently selected.
export const shouldShowChallengeBox = (customRuleSet, activeChallenge) =>
  isMageRuleSetActive(customRuleSet) && !!activeChallenge?.type

// Whoever currently has a usable "Roll to Beat" against the GM, i.e. whoever the Reality
// Reinforcement automation and Powers-trait validation should apply to right now — never every
// connected player. Always excludes 'gm' (the automation only ever targets Players).
//   Test/Contest: every current responder, but only once the initiator has actually rolled
//     (matches UserDicePool.js's own rollNowNames: responderNames once ready, [] otherwise) —
//     takes the already-computed `initiatorHasRolled` rather than calling rollToBeat.js's
//     hasInitiatorRolled itself, since that depends on live Foundry state
//     (game.settings/game.users) and can't be recomputed here — same reasoning as
//     rollToBeat.js's own hasContestStarted.
//   Group, initiative phase: everyone still owing their one Initiative roll.
//   Group, dueling phase: the single front-of-queue challenger.
export const getCurrentRollerIds = (challenge, targets, initiatorHasRolled) => {
  if (!challenge?.type) return []

  if (challenge.type === 'group') {
    if (!challenge.group) return []

    if (challenge.group.phase === 'initiative') {
      return getPendingGroupParticipants(challenge, targets).filter(id => id !== 'gm')
    }

    if (challenge.group.phase === 'dueling') {
      const challengerId = challenge.group.queue[0]
      return challengerId && challengerId !== 'gm' ? [challengerId] : []
    }

    return []
  }

  if (!initiatorHasRolled) return []

  return (challenge.responderIds ?? []).filter(id => id !== 'gm')
}

// Pure. poolEntries: the current roller's flattened Dice Pool entries (same {traitSetId, ...}
// shape already established by dicePoolValidation.js / traitDiceTemporary.js). powersTraitSetIds:
// every Trait Set id tagged as the 'powers' System Trait Set — a list, since each Actor Type may
// tag its own. Magick 'none' forbids any entry sourced from one of them; any other Magick value
// requires one. Returns a lang key or null.
export const computeMagePoolInvalidReason = (magick, poolEntries, powersTraitSetIds) => {
  if (!powersTraitSetIds?.length) return null

  const hasPowerTrait = poolEntries.some(entry => powersTraitSetIds.includes(entry.traitSetId))

  if (magick === 'none') return hasPowerTrait ? 'MageNonMagicalPowerTraitInvalid' : null

  return hasPowerTrait ? null : 'MageMagicalPowerTraitRequired'
}

// Pure decision table for where the Reality Reinforcement trait's die should live right now.
// `applicable` is false whenever the Scene's linked actor has no Simple Trait tagged as the
// 'realityReinforcement' System Trait, or that trait has no value — in that case both sides resolve
// to 'remove', cleaning up anything added while it previously was applicable.
export const computeRealityReinforcementSync = (realityReinforcement, applicable) => {
  if (!applicable) return { gm: 'remove', roller: 'remove' }

  switch (realityReinforcement) {
    case 'opposes': return { gm: 'add', roller: 'remove' }
    case 'reinforces': return { gm: 'remove', roller: 'add' }
    case 'indifferent': return { gm: 'remove', roller: 'remove' }
    default: return { gm: 'remove', roller: 'remove' }
  }
}

// A Vulgar Witnessed act of magick, opposed by the location, draws extra attention — every die in
// the Reality Reinforcement trait's map added to the GM's pool steps up one rung, capped at D12
// (stepFaceUp already clamps rather than wraps). The roller's side is never affected by this: with
// Magick Opposes, the roller's action is always 'remove' anyway (see computeRealityReinforcementSync).
export const computeGmRealityReinforcementDiceMap = (diceMap, magick, realityReinforcement) => {
  if (!diceMap) return diceMap
  if (magick !== 'vulgar-witnessed' || realityReinforcement !== 'opposes') return diceMap

  return objectMapValues(diceMap, face => stepFaceUp(face))
}

// Pure decision for syncPoolSource (mageAscension.js): given a User's CURRENT dicePool flag (or
// null/undefined for a user who has never opened their tray), the fixed pool source's key
// (doubling as its entry label), the desired action, and — for 'add' — the dice map it should
// hold, decides what write, if any, is actually needed.
//
// Returns null when nothing should change: no dicePool flag at all (this must never CREATE one —
// see readDicePool in UserDicePool.js, whose blankPool shape a bare { pool: {...} } write would
// not reproduce), action 'none', a 'remove' with nothing there to remove, or an 'add' whose value
// already matches what's there. Otherwise { op: 'set', value } or { op: 'unset' } — a thin shell
// syncPoolSource turns straight into a SINGLE, narrowly-scoped user.setFlag/unsetFlag call on
// `dicePool.pool.<sourceKey>` alone, never the whole dicePool object. That scoping is the actual
// fix, not this function: syncPoolSource runs on the GM's client but can target a DIFFERENT
// connected user's flag, which can genuinely race against that user's own client editing the same
// flag (e.g. adding a die from their own sheet) — two separate JS runtimes, so no in-memory mutex
// (asyncMutex.js) can ever serialize the two. A scoped flag-path write sidesteps the race instead
// of trying to win it: Foundry's own document update() merges a dotted flag path without
// disturbing sibling keys, so whichever client's write lands last can never clobber a pool entry
// the OTHER client just added under a different key, the way overwriting the whole flag could.
export const resolvePoolSourceWrite = (currentDice, sourceKey, action, diceValue) => {
  if (!currentDice || action === 'none') return null

  const existingEntry = currentDice.pool?.[sourceKey]

  if (action === 'remove') {
    return existingEntry ? { op: 'unset' } : null
  }

  const existingValue = existingEntry?.[0]?.value

  if (existingValue && JSON.stringify(existingValue) === JSON.stringify(diceValue)) return null

  return { op: 'set', value: { 0: { label: sourceKey, value: diceValue } } }
}
