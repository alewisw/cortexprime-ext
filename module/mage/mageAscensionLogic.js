// Pure decision logic for the "Mage: The Ascension Engine" custom rule set's Challenge
// automation (Magick / Reality Reinforcement). Kept free of any Foundry Application-extending
// imports so it's unit-testable; only reads from rollToBeat.js's own exported pure functions —
// never modifies that file. The impure Foundry-integration wrapper lives in mageAscension.js.
import { objectMapValues } from '../../lib/helpers.js'
import { getPendingGroupParticipants } from '../scripts/rollToBeat.js'
import { stepFaceUp } from '../scripts/traitDiceTemporary.js'

export const isMageRuleSetActive = customRuleSet => customRuleSet === 'mage'

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
// shape already established by dicePoolValidation.js / traitDiceTemporary.js). Magick 'none'
// forbids any entry sourced from the configured Powers Trait Set. Returns a lang key or null.
export const computeMagePoolInvalidReason = (magick, poolEntries, powersTraitSetId) => {
  if (magick !== 'none' || !powersTraitSetId) return null

  return poolEntries.some(entry => entry.traitSetId === powersTraitSetId)
    ? 'MageNonMagicalPowerTraitInvalid'
    : null
}

// Pure decision table for where the Reality Reinforcement trait's die should live right now.
// `applicable` is false whenever the Scene's linked actor isn't of the configured Location Actor
// Type or has no resolvable Reality Reinforcement trait value — in that case both sides resolve
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
