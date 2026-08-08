// Tracks each person's most recent dice-pool roll (GM via a world setting, since only a GM
// can write world settings; each player via a flag on their own assigned character actor,
// since a player normally owns that document), and the GM-driven Test/Contest "challenge"
// state that decides who currently has "Roll To Beat" available and who they're targeting.
import { localizer } from './foundryHelpers.js'
import { reduceCrisisPoolByEffectDie } from './crisisPool.js'

const blankRecord = { total: 0, effectDice: [], won: null, rolledAt: 0 }
const blankChallenge = { type: null, initiatorId: null, responderIds: [], updatedAt: 0 }

export const recordRollResult = async ({ total, effectDice, won }) => {
  const record = { total, effectDice, won: won ?? null, rolledAt: Date.now() }

  if (game.user.isGM) {
    await game.settings.set('cortexprime', 'lastGmRoll', record)
    return
  }

  if (game.user.character) {
    try {
      await game.user.character.setFlag('cortexprime', 'lastRoll', record)
    } catch (error) {
      console.warn('CP | Could not record last roll on character', error)
    }
  }
}

// Overwrites just the effectDice of a previously-recorded roll — the GM's reactive client uses
// this to apply the Contest step-down (see applyContestEffectStepDown) to the contest's overall
// winner, whose record may belong to a different person than whoever just rolled the loss that
// triggered it, so only a GM client (which can write any actor's flags, and its own world
// settings) can safely perform this.
const updateRecordedEffectDice = async (targetId, effectDice) => {
  if (targetId === 'gm') {
    const record = game.settings.get('cortexprime', 'lastGmRoll')
    await game.settings.set('cortexprime', 'lastGmRoll', { ...record, effectDice })
    return
  }

  const actor = game.actors.get(targetId)

  if (!actor) return

  const record = actor.getFlag('cortexprime', 'lastRoll')
  await actor.setFlag('cortexprime', 'lastRoll', { ...record, effectDice })
}

const withRecord = record => ({
  total: record?.total ?? blankRecord.total,
  effectDice: record?.effectDice ?? blankRecord.effectDice,
  won: record?.won ?? blankRecord.won,
  rolledAt: record?.rolledAt ?? blankRecord.rolledAt
})

export const getRollToBeatTargets = () => {
  const gmEntry = { id: 'gm', name: localizer('GM'), ...withRecord(game.settings.get('cortexprime', 'lastGmRoll')) }

  const playerEntries = game.users.contents
    .filter(user => user.active && !user.isGM && user.character)
    .map(user => user.character)
    .map(actor => ({
      id: actor.id,
      name: actor.name,
      ...withRecord(actor.getFlag('cortexprime', 'lastRoll'))
    }))
    .sort((a, b) => a.name.localeCompare(b.name))

  return [gmEntry, ...playerEntries]
}

export const getTargetRecord = targetId => {
  const target = getRollToBeatTargets().find(({ id }) => id === targetId)
  return target ? { total: target.total, effectDice: target.effectDice } : null
}

export const getTargetTotal = targetId => getTargetRecord(targetId)?.total ?? 0

export const getActiveChallenge = () => {
  const challenge = game.settings.get('cortexprime', 'activeChallenge')

  return {
    type: challenge?.type ?? blankChallenge.type,
    initiatorId: challenge?.initiatorId ?? blankChallenge.initiatorId,
    responderIds: challenge?.responderIds ?? blankChallenge.responderIds,
    updatedAt: challenge?.updatedAt ?? blankChallenge.updatedAt
  }
}

export const setActiveChallenge = async challenge => {
  await game.settings.set('cortexprime', 'activeChallenge', challenge)
}

export const clearActiveChallenge = async () => {
  await setActiveChallenge({ ...blankChallenge })
}

// The id ('gm' or an actor id) the current user should act as for challenge purposes.
const getMyId = () => game.user.isGM ? 'gm' : game.user.character?.id

// If the current user is currently a designated responder, their id — otherwise null. Drives
// whether "Roll To Beat" is present at all.
export const getMyResponderId = () => {
  const challenge = getActiveChallenge()

  if (!challenge.type) return null

  const myId = getMyId()

  return myId && challenge.responderIds.includes(myId) ? myId : null
}

// Whether the given challenge's initiator has actually rolled since this round began.
export const hasInitiatorRolled = challenge => {
  const initiator = getRollToBeatTargets().find(target => target.id === challenge.initiatorId)

  return !!initiator && initiator.rolledAt > challenge.updatedAt
}

// Pure: once a Contest's current initiator has rolled for the first time, the GM's Roll
// Now/Roll Next radios lock — see UserDicePool.js — so a stray click can't silently reset
// updatedAt and discard whoever's mid-round roll-to-beat state. Not applicable to Tests. Takes
// the already-computed hasInitiatorRolled result rather than a challenge object, since that
// itself depends on live Foundry state (game.settings/game.users) and can't be recomputed here.
export const hasContestStarted = (activeChallenge, initiatorHasRolled) =>
  activeChallenge.type === 'contest' && initiatorHasRolled

// Whether a designated responder's "Roll To Beat" is actually usable right now — the
// initiator has to have rolled since this round began, otherwise there's no target yet to
// beat. Drives the button's disabled state, and is checked again before a roll is actually
// executed, so a stale/disabled button can never trigger a roll with no real target.
export const isMyResponderReady = () => {
  const myId = getMyResponderId()

  if (!myId) return false

  return hasInitiatorRolled(getActiveChallenge())
}

// The initiator's current total/effect dice, for previewing what a ready responder needs to
// beat before they roll. Null whenever there's nothing to preview yet (no challenge, not a
// responder, or the initiator hasn't rolled this round).
export const getMyChallengeTarget = () => {
  if (!isMyResponderReady()) return null

  return getTargetRecord(getActiveChallenge().initiatorId)
}

// Whether the current user has any stake in the active challenge (initiator or responder).
// Always true when no challenge is active.
const isChallengeParticipant = () => {
  const challenge = getActiveChallenge()

  if (!challenge.type) return true

  const myId = getMyId()

  return myId === challenge.initiatorId || challenge.responderIds.includes(myId)
}

// Single source of truth for whether the current user's roll buttons should be usable right
// now: bystanders (anyone not the initiator or a responder) are blocked outright while a
// challenge is active, and a designated responder is additionally blocked until the initiator
// has actually rolled.
export const canCurrentUserRoll = () => {
  if (!isChallengeParticipant()) return false

  return !getMyResponderId() || isMyResponderReady()
}

// A Contest always needs exactly one responder — there's no "None" option for it — so this
// picks one automatically: the first connected target (GM or player) other than the initiator,
// or null if nobody else is available to respond.
const getDefaultContestResponderId = initiatorId => {
  const target = getRollToBeatTargets().find(target => target.id !== initiatorId)

  return target ? target.id : null
}

// GM action: starts a fresh challenge of the given type, defaulting the initiator to the GM. A
// Contest also defaults its responder to the first available target.
export const setChallengeType = async type => {
  const initiatorId = 'gm'
  const responderIds = type === 'contest'
    ? [getDefaultContestResponderId(initiatorId)].filter(Boolean)
    : []

  await setActiveChallenge({ type, initiatorId, responderIds, updatedAt: Date.now() })
}

// GM action: changes the initiator, dropping them from the responder list if they were on it.
// If that leaves an active Contest with no responder, one is picked automatically again.
export const setChallengeInitiator = async initiatorId => {
  const challenge = getActiveChallenge()
  const responderIds = challenge.responderIds.filter(id => id !== initiatorId)

  const finalResponderIds = challenge.type === 'contest' && responderIds.length === 0
    ? [getDefaultContestResponderId(initiatorId)].filter(Boolean)
    : responderIds

  await setActiveChallenge({
    ...challenge,
    initiatorId,
    responderIds: finalResponderIds,
    updatedAt: Date.now()
  })
}

// GM action: replaces the responder list wholesale (used by both the Test checkbox list and
// the Contest single-select).
export const setChallengeResponders = async responderIds => {
  const challenge = getActiveChallenge()

  await setActiveChallenge({ ...challenge, responderIds, updatedAt: Date.now() })
}

// Pure: what should happen to the active challenge after a given responder's roll resolves.
// Returns null to mean "clear the challenge", otherwise a full replacement for it.
export const resolveChallengeAfterRoll = (challenge, responderId, responder) => {
  if (challenge.type === 'test') {
    // Win or lose, this responder is done — everyone else still rolls against the same
    // initiator total, so updatedAt is deliberately left untouched (bumping it would wrongly
    // make the initiator's already-recorded roll look stale to the remaining responders).
    const remaining = challenge.responderIds.filter(id => id !== responderId)

    if (remaining.length === 0) return null

    return { ...challenge, responderIds: remaining }
  }

  // Contest: a loss ends it outright — the responder who just failed to beat the total is the
  // loser.
  if (!responder.won) return null

  // Contest, won: swap roles — the responder who just won becomes the new initiator (their
  // total is now the one to beat) and the old initiator must respond. updatedAt is set to just
  // *before* their roll, rather than "now", so the new initiator is immediately recognized as
  // already having rolled for this new round.
  return {
    type: 'contest',
    initiatorId: responderId,
    responderIds: [challenge.initiatorId],
    updatedAt: responder.rolledAt - 1
  }
}

// Runs only on the elected primary GM's client, reacting to fresh "Roll To Beat" results from
// designated responders: removes them from a Test (auto-clearing once everyone's gone), or
// swaps initiator/responder roles for a Contest — until someone actually loses, which clears
// the challenge outright. `updatedAt` is the de-dupe guard against processing the same roll twice.
export const processChallengeAdvancement = async () => {
  if (game.user !== game.users.activeGM) return

  const challenge = getActiveChallenge()

  if (!challenge.type) return

  const targets = getRollToBeatTargets()

  for (const responderId of challenge.responderIds) {
    const responder = targets.find(target => target.id === responderId)

    if (!responder) continue
    if (responder.rolledAt <= challenge.updatedAt) continue
    if (responder.won === null) continue

    if (responder.won && responderId !== 'gm') {
      await reduceCrisisPoolByEffectDie(responder.effectDice)
    }

    const next = resolveChallengeAfterRoll(challenge, responderId, responder)

    // A Contest ending in a loss is also the moment the contest's overall winner's effect die
    // gets compared against — and possibly blunted by — the losing roll's effect die.
    if (challenge.type === 'contest' && next === null) {
      const winner = targets.find(target => target.id === challenge.initiatorId)

      if (winner) {
        const { effectDice, steppedDown } = applyContestEffectStepDown(winner.effectDice, responder.effectDice)

        if (steppedDown) await updateRecordedEffectDice(challenge.initiatorId, effectDice)
      }
    }

    if (next === null) await clearActiveChallenge()
    else await setActiveChallenge(next)

    return
  }
}

// Keeps an already-open dice-pool tray's Roll To Beat target totals current when someone
// else rolls, instead of leaving them stale until the local user triggers a re-render.
export const registerRollToBeat = () => {
  const refreshDicePool = () => {
    const dicePool = game.cortexprime.UserDicePool

    if (dicePool?.rendered) {
      dicePool.render(true)
    }
  }

  Hooks.on('updateSetting', setting => {
    if (setting.key === 'cortexprime.lastGmRoll') {
      processChallengeAdvancement()
      refreshDicePool()
    }

    if (setting.key === 'cortexprime.activeChallenge') {
      refreshDicePool()
    }
  })

  Hooks.on('updateActor', (actor, data) => {
    if (foundry.utils.hasProperty(data, 'flags.cortexprime.lastRoll')) {
      processChallengeAdvancement()
      refreshDicePool()
    }
  })
}

export const sumOf = combo => combo.reduce((sum, die) => sum + die.result, 0)

const EFFECT_DIE_LADDER = [4, 6, 8, 10, 12]

// D12->D10->D8->D6->D4 — unlike the Crisis Pool ladder, an effect die is never removed; it
// just stops stepping down once it reaches D4.
const stepDownEffectFace = face => {
  const index = EFFECT_DIE_LADDER.indexOf(face)

  return index > 0 ? EFFECT_DIE_LADDER[index - 1] : face
}

// Pure: a Contest's overall winner's effect die (or dice — one or two) vs. the largest effect
// die of the roll that just lost and ended it. Equal-or-higher stands; lower steps down the
// winner's largest die one rung, leaving any other winner die untouched. Returns the effect
// dice to actually record for the winner, plus the before/after faces when a step-down happened
// (null otherwise, including the D4-floor no-op case) — `other` is only present when the winner
// had a second, unaffected die, so the shape stays identical to before for single-die callers.
export const applyContestEffectStepDown = (winnerEffectDice, loserEffectDice) => {
  const winnerDice = winnerEffectDice?.length ? winnerEffectDice : [4]
  const loserDice = loserEffectDice?.length ? loserEffectDice : [4]

  const winnerLargest = Math.max(...winnerDice)
  const loserLargest = Math.max(...loserDice)

  if (winnerLargest >= loserLargest) return { effectDice: winnerEffectDice ?? [], steppedDown: null }

  const newFace = stepDownEffectFace(winnerLargest)

  if (newFace === winnerLargest) return { effectDice: winnerEffectDice ?? [], steppedDown: null }

  const largestPos = winnerDice.indexOf(winnerLargest)
  const other = winnerDice.length > 1 ? winnerDice.filter((_, index) => index !== largestPos)[0] : null
  const newDice = [...winnerDice]

  newDice[largestPos] = newFace

  return {
    effectDice: newDice,
    steppedDown: { from: winnerLargest, to: newFace, ...(other !== null ? { other } : {}) }
  }
}

// Pure: a beat-attempt roll that clears its target by 5+ steps its Effect die (or the lowest of
// two) up one rung per full 5-point margin. Returns null when the margin is under 5 (no Heroic
// Success). Stepping past D12 caps the recorded effect die at D12, with `to: 'SPECIAL'` marking
// the display. `other` is only present when there was a second, unaffected die.
export const computeHeroicStepUp = (effectDice, margin) => {
  if (margin < 5) return null

  const dice = effectDice?.length ? effectDice : [4]
  const steps = Math.floor(margin / 5)
  const lowestFace = Math.min(...dice)
  const lowestPos = dice.indexOf(lowestFace)
  const other = dice.length > 1 ? dice.filter((_, index) => index !== lowestPos)[0] : null
  const currentIndex = EFFECT_DIE_LADDER.indexOf(lowestFace)
  const finalIndex = currentIndex + steps
  const newDice = [...dice]

  if (finalIndex > EFFECT_DIE_LADDER.length - 1) {
    newDice[lowestPos] = 12

    return { effectDice: newDice, from: lowestFace, to: 'SPECIAL', ...(other !== null ? { other } : {}) }
  }

  const newFace = EFFECT_DIE_LADDER[finalIndex]

  newDice[lowestPos] = newFace

  return { effectDice: newDice, from: lowestFace, to: newFace, ...(other !== null ? { other } : {}) }
}

// Picks the die combination that maximizes the Effect die, not the one that minimally beats
// the target — Total is whatever falls out of that choice, and win/loss is only checked at
// the very end.
export const getDiceByTargetTotal = (results, target) => {
  const nonHitchResults = results.filter(result => result.result > 1)

  if (nonHitchResults.length === 0) {
    const total = 0
    return { dice: results, total, effectDice: [], targetTotal: target, won: total > target }
  }

  if (nonHitchResults.length <= 2) {
    const total = sumOf(nonHitchResults)
    const marked = new Set(nonHitchResults)
    const dice = results.map(result => marked.has(result) ? { ...result, total: true } : result)
    return { dice, total, effectDice: [], targetTotal: target, won: total > target }
  }

  const candidates = nonHitchResults.map(effectDie => {
    const totalDice = nonHitchResults
      .filter(die => die !== effectDie)
      .sort((a, b) => b.result - a.result)
      .slice(0, 2)

    return { effectDie, totalDice, total: sumOf(totalDice) }
  })

  // Always maximize the Effect die (tie-broken by Total), even on a guaranteed loss — in a
  // Contest, a losing roll's Effect die can still blunt the eventual winner's (see
  // applyContestEffectStepDown), so it's never pointless to maximize it.
  candidates.sort((a, b) => a.effectDie.faces !== b.effectDie.faces
    ? a.effectDie.faces - b.effectDie.faces
    : a.total - b.total)

  const chosen = candidates[candidates.length - 1]
  const totalDiceSet = new Set(chosen.totalDice)

  const dice = results.map(result => {
    if (result === chosen.effectDie) return { ...result, effect: true }
    if (totalDiceSet.has(result)) return { ...result, total: true }
    return result
  })

  return {
    dice,
    total: chosen.total,
    effectDice: [chosen.effectDie.faces],
    targetTotal: target,
    won: chosen.total > target
  }
}
