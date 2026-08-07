// Tracks each person's most recent dice-pool roll (GM via a world setting, since only a GM
// can write world settings; each player via a flag on their own assigned character actor,
// since a player normally owns that document), and the GM-driven Test/Contest "challenge"
// state that decides who currently has "Roll To Beat" available and who they're targeting.
import { localizer } from './foundryHelpers.js'

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

// GM action: starts a fresh challenge of the given type, defaulting the initiator to the GM.
export const setChallengeType = async type => {
  await setActiveChallenge({ type, initiatorId: 'gm', responderIds: [], updatedAt: Date.now() })
}

// GM action: changes the initiator, dropping them from the responder list if they were on it.
export const setChallengeInitiator = async initiatorId => {
  const challenge = getActiveChallenge()

  await setActiveChallenge({
    ...challenge,
    initiatorId,
    responderIds: challenge.responderIds.filter(id => id !== initiatorId),
    updatedAt: Date.now()
  })
}

// GM action: replaces the responder list wholesale (used by both the Test checkbox list and
// the Contest single-select).
export const setChallengeResponders = async responderIds => {
  const challenge = getActiveChallenge()

  await setActiveChallenge({ ...challenge, responderIds, updatedAt: Date.now() })
}

// Runs only on the elected primary GM's client, reacting to fresh "Roll To Beat" results from
// designated responders: removes them from a Test (auto-clearing once everyone's gone), or
// swaps initiator/responder roles for a Contest — until someone actually wins, which clears
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

    if (challenge.type === 'test') {
      // Win or lose, this responder is done — everyone else still rolls against the same
      // initiator total, so updatedAt is deliberately left untouched (bumping it would
      // wrongly make the initiator's already-recorded roll look stale to the remaining
      // responders).
      const remaining = challenge.responderIds.filter(id => id !== responderId)

      if (remaining.length === 0) {
        await clearActiveChallenge()
      } else {
        await setActiveChallenge({ ...challenge, responderIds: remaining })
      }

      return
    }

    // Contest: a win ends it outright.
    if (responder.won) {
      await clearActiveChallenge()
      return
    }

    // Contest, lost: swap roles — the responder who just rolled becomes the new initiator
    // (their total is now the one to beat) and the old initiator must respond. updatedAt is
    // set to just *before* their roll, rather than "now", so the new initiator is
    // immediately recognized as already having rolled for this new round.
    await setActiveChallenge({
      type: 'contest',
      initiatorId: responderId,
      responderIds: [challenge.initiatorId],
      updatedAt: responder.rolledAt - 1
    })

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

  const hasWinningCandidate = candidates.some(candidate => candidate.total > target)

  // With exactly 3 non-hitch dice, if nothing can win regardless of which die becomes
  // Effect, prioritize the highest possible Total instead (ties broken by the highest
  // Effect die) — maximizing Effect is pointless on a guaranteed loss.
  if (nonHitchResults.length === 3 && !hasWinningCandidate) {
    candidates.sort((a, b) => a.total !== b.total
      ? a.total - b.total
      : a.effectDie.faces - b.effectDie.faces)
  } else {
    candidates.sort((a, b) => a.effectDie.faces !== b.effectDie.faces
      ? a.effectDie.faces - b.effectDie.faces
      : a.total - b.total)
  }

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
