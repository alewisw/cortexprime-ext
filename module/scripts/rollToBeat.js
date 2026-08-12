// Tracks each person's most recent dice-pool roll (GM via a world setting, since only a GM
// can write world settings; each player via a flag on their own assigned character actor,
// since a player normally owns that document), and the GM-driven Test/Contest "challenge"
// state that decides who currently has "Roll To Beat" available and who they're targeting.
import { localizer } from './foundryHelpers.js'
import { reduceCrisisPoolByEffectDie } from './crisisPool.js'

const blankRecord = { total: 0, effectDice: [], won: null, rolledAt: 0, dice: [], poolEntries: [] }
const blankChallenge = { type: null, initiatorId: null, responderIds: [], updatedAt: 0, interference: null, group: null }

// A fresh copy of the "never rolled" record. Exported so an undo (rollUndo.js) can blank a roll
// with exactly the shape the read path already defaults to — a rolledAt of 0 is what makes every
// downstream reactor skip it.
export const getBlankRecord = () => ({ ...blankRecord, effectDice: [], dice: [], poolEntries: [] })

// `dice` is every die this roll actually put on the table as [{ faces, result }] — kept alongside
// the outcome so the GM's client can spot natural 1s (see hitches.js) without re-rolling anything.
// `poolEntries` is [{ traitSetId, faces }] for every pool entry that came from a Trait Set, kept
// because the dice pool itself is cleared the moment a roll starts, so which Trait Sets contributed
// can't be recovered afterwards (module/mage/paradox.js needs the Powers dice). Deliberately
// generic — no rule set knows about it here.
// `rolledAt` may be supplied by the caller so the roll's chat card can be stamped with the same
// timestamp before this record exists (see rollDice.js) — that pairing is what lets a card be
// matched back to its roll for the GM's Undo control.
export const recordRollResult = async ({ total, effectDice, won, dice, poolEntries, rolledAt }) => {
  const record = {
    total,
    effectDice,
    won: won ?? null,
    rolledAt: rolledAt ?? Date.now(),
    dice: dice ?? [],
    poolEntries: poolEntries ?? []
  }

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
  rolledAt: record?.rolledAt ?? blankRecord.rolledAt,
  dice: record?.dice ?? blankRecord.dice,
  poolEntries: record?.poolEntries ?? blankRecord.poolEntries
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
    updatedAt: challenge?.updatedAt ?? blankChallenge.updatedAt,
    interference: challenge?.interference ?? blankChallenge.interference,
    group: challenge?.group ?? blankChallenge.group
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

// Pure: anyone connected except the current initiator and current responder(s) — a true third
// party. This includes the GM entry (id 'gm'), which is eligible whenever the GM isn't already
// part of this Contest.
export const filterEligibleInterferers = (challenge, targets) =>
  targets.filter(target =>
    target.id !== challenge.initiatorId &&
    !challenge.responderIds.includes(target.id)
  )

export const getEligibleInterferers = () =>
  filterEligibleInterferers(getActiveChallenge(), getRollToBeatTargets())

// If the current user is the designated interferer for an active pause, their id — otherwise
// null. Deliberately unrelated to getMyResponderId/challenge.responderIds — an interferer is
// never added there, so processChallengeAdvancement's normal Contest-advancement logic (which
// only ever scans responderIds) can never see or react to their roll.
export const getMyInterfererId = () => {
  const challenge = getActiveChallenge()
  const myId = getMyId()

  return challenge.interference && myId === challenge.interference.interfererId ? myId : null
}

// Whether the designated interferer has already used their one roll since the pause began.
export const hasInterfererRolled = challenge => {
  if (!challenge.interference) return false

  const interferer = getRollToBeatTargets().find(target => target.id === challenge.interference.interfererId)

  return !!interferer && interferer.rolledAt > challenge.interference.startedAt
}

// GM action: pauses the Contest and designates who gets the one-time interference roll.
export const startInterference = async interfererId => {
  const challenge = getActiveChallenge()

  await setActiveChallenge({ ...challenge, interference: { interfererId, startedAt: Date.now() } })
}

// GM action: lifts the pause — used whether the interference roll won or lost, since the GM
// always resumes manually (see canCurrentUserRoll/UserDicePool.js).
export const endInterference = async () => {
  const challenge = getActiveChallenge()

  await setActiveChallenge({ ...challenge, interference: null })
}

const GROUP_MINIMUM_PARTICIPANTS = 3

// The single die that represents a 1-or-2 element effect dice array for comparison purposes —
// the largest, matching applyContestEffectStepDown/computeHeroicStepUp. A missing or empty
// array counts as a D4, same as everywhere else in this file.
const representativeEffectFace = effectDice => effectDice?.length ? Math.max(...effectDice) : 4

// Pure: whether the GM's roster is big enough to start Initiative. Drives both the Start
// Initiative button's disabled state and the handler's defense-in-depth guard.
export const canStartGroupInitiative = challenge =>
  challenge.type === 'group' &&
  challenge.group?.phase === 'selecting' &&
  challenge.group.participantIds.length >= GROUP_MINIMUM_PARTICIPANTS

// Pure: which participants still owe an Initiative roll — i.e. haven't rolled since the phase
// began. Participants with no live target record (e.g. disconnected mid-phase) are deliberately
// NOT counted as pending, so one dropped player can't deadlock the whole group. Shared by the
// reactive resolver's "is everyone done?" check and the GM's "waiting on…" status line, so the
// two can never disagree.
export const getPendingGroupParticipants = (challenge, targets) =>
  challenge.group.participantIds.filter(id => {
    const target = targets.find(t => t.id === id)

    return !!target && target.rolledAt <= challenge.updatedAt
  })

// Pure: the duel order — weakest first, strongest last. Lowest Total wins the front of the
// queue; ties broken by the smaller representative effect die; still-tied entries broken by an
// injected per-participant random value (an id -> number map), so this stays deterministic and
// testable. Omitting `randoms` leaves tied entries in participantIds order (Array#sort is
// stable). Ids with no live target record are dropped.
export const orderGroupInitiative = (participantIds, targets, randoms = {}) =>
  participantIds
    .map(id => ({ id, target: targets.find(t => t.id === id) }))
    .filter(entry => !!entry.target)
    .map(({ id, target }) => ({
      id,
      total: target.total ?? 0,
      effect: representativeEffectFace(target.effectDice),
      random: randoms[id] ?? 0
    }))
    .sort((a, b) =>
      a.total !== b.total
        ? a.total - b.total
        : a.effect !== b.effect
          ? a.effect - b.effect
          : a.random - b.random)
    .map(entry => entry.id)

// Pure: the challenge state that follows a completed Initiative phase — everyone but the
// strongest roller becomes the queue, and the strongest becomes the standing champion whose
// Total/Effect Dice is now the Target.
export const startGroupDueling = (challenge, order, updatedAt) => ({
  ...challenge,
  group: {
    ...challenge.group,
    phase: 'dueling',
    queue: order.slice(0, -1),
    championId: order.at(-1) ?? null
  },
  updatedAt
})

// Pure: the challenge state after the front-of-queue challenger's roll resolves. Players are
// only ever eliminated by losing — winning never removes anyone from play, it just hands the
// Target to whoever won. A loss simply drops the challenger from the front of the queue,
// leaving the champion standing. A win makes the challenger the new champion (their Total is
// now the one to beat) and sends the *displaced* former champion to the back of the queue —
// they're still in the running, just waiting for their next turn — so the group only actually
// concludes once enough losses have whittled the queue down to nobody left to challenge.
// updatedAt is bumped so the next challenger's stale Initiative roll can't be mistaken for
// their duel roll.
//
// Unlike resolveChallengeAfterRoll, this never returns null for "the group is over" — the
// caller needs the surviving champion's id to announce them. Completion is expressed as a
// normal state whose queue has emptied (see isGroupComplete).
export const resolveGroupDuel = (challenge, challenger, updatedAt) => ({
  ...challenge,
  group: {
    ...challenge.group,
    queue: challenger.won
      ? [...challenge.group.queue.slice(1), challenge.group.championId]
      : challenge.group.queue.slice(1),
    championId: challenger.won ? challenger.id : challenge.group.championId
  },
  updatedAt
})

// Pure: removes someone from a dueling group — off the roster, out of the queue, and out of the
// champion slot if they held it. Deliberately does NOT promote anyone in a removed champion's
// place: per the GM's own call, the group simply has no Target until the GM does something
// about it (most likely Clear Challenge).
export const removeFromGroup = (challenge, participantId) => ({
  ...challenge,
  group: {
    ...challenge.group,
    participantIds: challenge.group.participantIds.filter(id => id !== participantId),
    queue: challenge.group.queue.filter(id => id !== participantId),
    championId: challenge.group.championId === participantId ? null : challenge.group.championId
  }
})

// Pure: the group is decided once nobody is left to challenge and someone is still holding the
// Target. Reached both by the last duel resolving and by the GM removing the last challenger.
// An empty queue with no champion (the GM removed the champion too) is explicitly NOT complete —
// there's no winner to announce, so the challenge stays put for the GM to clear.
export const isGroupComplete = challenge => challenge.group?.queue.length === 0 && !!challenge.group.championId

// Pure: the standing order for display — remaining challengers weakest-first, champion last.
export const getGroupDisplayOrder = group => [...group.queue, ...(group.championId ? [group.championId] : [])]

// GM action: replaces the roster wholesale — the checkbox list, mirroring setChallengeResponders.
// No updatedAt bump — nothing is gated on it until startGroupInitiative sets the phase clock.
export const setGroupParticipants = async participantIds => {
  const challenge = getActiveChallenge()

  if (challenge.type !== 'group' || challenge.group?.phase !== 'selecting') return

  await setActiveChallenge({ ...challenge, group: { ...challenge.group, participantIds } })
}

// GM action: opens the Initiative phase. updatedAt becomes the clock every participant's one
// Initiative roll is measured against.
export const startGroupInitiative = async () => {
  const challenge = getActiveChallenge()

  if (!canStartGroupInitiative(challenge)) return

  await setActiveChallenge({
    ...challenge,
    group: { ...challenge.group, phase: 'initiative' },
    updatedAt: Date.now()
  })
}

// What the current user is allowed to do in an active group right now:
//   'initiative' — a participant who still owes their one Initiative roll
//   'duel'       — the front-of-queue challenger, and only while a champion's Total exists
//   null         — everyone else (waiting their turn, already eliminated, or a bystander)
// Single source of truth for group roll eligibility, the Target preview, and the beat-target
// resolution in rollDice.js.
export const getMyGroupRollRole = () => {
  const challenge = getActiveChallenge()

  if (challenge.type !== 'group' || !challenge.group) return null

  const myId = getMyId()

  if (!myId) return null

  if (challenge.group.phase === 'initiative') {
    return getPendingGroupParticipants(challenge, getRollToBeatTargets()).includes(myId) ? 'initiative' : null
  }

  if (challenge.group.phase === 'dueling') {
    return challenge.group.championId && challenge.group.queue[0] === myId ? 'duel' : null
  }

  return null
}

// The id whose recorded Total the current user is currently trying to beat, whatever the
// mechanism: a designated Test/Contest responder and a Contest interferer both shoot at the
// initiator, while a group's front-of-queue challenger shoots at the reigning champion.
export const getMyBeatTargetId = () => {
  const challenge = getActiveChallenge()

  if (challenge.type === 'group') {
    return getMyGroupRollRole() === 'duel' ? challenge.group.championId : null
  }

  return (getMyResponderId() || getMyInterfererId()) ? challenge.initiatorId : null
}

// Pure, id-parameterized twin of getMyBeatTargetId: who the GIVEN roller was shooting at, for a
// given challenge snapshot. The functions above all bottom out in getMyId() and so only ever
// answer for the current user — a GM's client reacting to someone else's roll (see
// module/mage/paradox.js) needs to ask about that roller instead. Each branch mirrors its
// current-user counterpart exactly: responder/interferer -> the initiator, a group's
// front-of-queue duelist -> the champion, and anything else (including the whole group
// initiative phase) -> no target at all.
export const getBeatTargetIdFor = (challenge, rollerId) => {
  if (!challenge?.type || !rollerId) return null

  if (challenge.type === 'group') {
    return challenge.group?.phase === 'dueling' && challenge.group.queue?.[0] === rollerId
      ? (challenge.group.championId ?? null)
      : null
  }

  const isResponder = (challenge.responderIds ?? []).includes(rollerId)
  const isInterferer = challenge.interference?.interfererId === rollerId

  return (isResponder || isInterferer) ? challenge.initiatorId : null
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

// The initiator's current total/effect dice, for previewing what a ready responder or the
// designated, not-yet-rolled interferer needs to beat before they roll. For a Group Challenge
// this is different: the champion's Target is visible to every participant (and the GM) for the
// whole dueling phase, not just whoever's turn it currently is — everyone watching a duel unfold
// wants to see the standing Target, not just the one person about to roll against it. Null
// whenever there's nothing to preview yet.
export const getMyChallengeTarget = () => {
  const challenge = getActiveChallenge()

  if (challenge.type === 'group') {
    if (challenge.group?.phase !== 'dueling' || !challenge.group.championId) return null

    const myId = getMyId()

    if (myId !== 'gm' && !challenge.group.participantIds.includes(myId)) return null

    return getTargetRecord(challenge.group.championId)
  }

  const readyAsResponder = isMyResponderReady()
  const readyAsInterferer = !!getMyInterfererId() && !hasInterfererRolled(challenge)

  if (!readyAsResponder && !readyAsInterferer) return null

  return getTargetRecord(challenge.initiatorId)
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
// has actually rolled. While a Contest is paused for interference, this is the sole gate —
// everyone (including the normal initiator/responder) is blocked except the designated
// interferer, and only until they've used their one roll.
export const canCurrentUserRoll = () => {
  const challenge = getActiveChallenge()

  if (challenge.interference) {
    return getMyId() === challenge.interference.interfererId && !hasInterfererRolled(challenge)
  }

  // The GM assembling a roster doesn't restrict anyone — nothing is "underway" until Start
  // Initiative sets the phase clock. Once it does, this is the sole gate for the phase.
  if (challenge.type === 'group') {
    return challenge.group?.phase === 'selecting' || getMyGroupRollRole() !== null
  }

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
// Contest also defaults its responder to the first available target. A Group defaults its
// roster to just the GM — "a set of players + the GM" reads as "the GM is normally in," but the
// checkbox list stays live so they can uncheck themselves. Switching away from a prior Group (or
// Contest interference) implicitly drops that state by omitting it here — setActiveChallenge
// replaces the stored value wholesale, so getActiveChallenge's defaulting picks it back up as
// null on the next read.
export const setChallengeType = async type => {
  const initiatorId = 'gm'
  const responderIds = type === 'contest'
    ? [getDefaultContestResponderId(initiatorId)].filter(Boolean)
    : []
  const group = type === 'group'
    ? { phase: 'selecting', participantIds: ['gm'], queue: [], championId: null }
    : null

  await setActiveChallenge({ type, initiatorId, responderIds, updatedAt: Date.now(), group })
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

const announceGroupInitiative = async (order, targets) => {
  const championId = order.at(-1)
  const champion = targets.find(target => target.id === championId)

  const content = await foundry.applications.handlebars.renderTemplate('systems/cortexprime/templates/chat/group-initiative.html', {
    championName: champion?.name ?? '',
    targetTotal: champion?.total ?? 0,
    targetEffectDice: champion?.effectDice ?? [],
    order: order.map((id, index) => {
      const target = targets.find(t => t.id === id)

      return {
        position: index + 1,
        name: target?.name ?? '',
        total: target?.total ?? 0,
        effectDice: target?.effectDice ?? []
      }
    })
  })

  await ChatMessage.create({ content })
}

const announceGroupWinner = async championId => {
  const winner = getRollToBeatTargets().find(target => target.id === championId)

  const content = await foundry.applications.handlebars.renderTemplate('systems/cortexprime/templates/chat/group-winner.html', {
    winnerName: winner?.name ?? '',
    total: winner?.total ?? 0,
    effectDice: winner?.effectDice ?? []
  })

  await ChatMessage.create({ content })
}

// The group's single exit point: announce the survivor, then clear.
const endGroup = async championId => {
  await announceGroupWinner(championId)
  await clearActiveChallenge()
}

// GM action: drops someone mid-duel — off the roster, out of the queue, out of the champion
// slot if held. If that leaves the last challenger gone, the group is decided by default and
// ends through the same announce-and-clear path a final duel takes.
export const removeGroupParticipant = async participantId => {
  const challenge = getActiveChallenge()

  if (challenge.type !== 'group' || challenge.group?.phase !== 'dueling') return

  const next = removeFromGroup(challenge, participantId)

  if (isGroupComplete(next)) {
    await endGroup(next.group.championId)
    return
  }

  await setActiveChallenge(next)
}

// Runs only on the elected primary GM's client, reacting to fresh rolls from Group
// participants. During Initiative, waits for everyone to have rolled, then orders them and
// opens the duel queue. During dueling, reacts to the front-of-queue challenger's roll,
// resolves it, and either advances to the next challenger or ends the group. Deliberately
// separate from processChallengeAdvancement (which only ever scans challenge.responderIds, and
// a group's participants are never added there) rather than folded into it — the two phases
// here don't map onto that function's single-responder-at-a-time shape.
export const processGroupAdvancement = async () => {
  if (game.user !== game.users.activeGM) return

  const challenge = getActiveChallenge()

  if (challenge.type !== 'group' || !challenge.group) return

  const targets = getRollToBeatTargets()

  if (challenge.group.phase === 'initiative') {
    if (getPendingGroupParticipants(challenge, targets).length > 0) return

    const randoms = Object.fromEntries(challenge.group.participantIds.map(id => [id, Math.random()]))
    const order = orderGroupInitiative(challenge.group.participantIds, targets, randoms)

    if (order.length === 0) {
      await clearActiveChallenge()
      return
    }

    const next = startGroupDueling(challenge, order, Date.now())

    await announceGroupInitiative(order, targets)

    // A roster of one survivor after disconnects (rare): they win outright, no duels needed.
    if (isGroupComplete(next)) {
      await endGroup(next.group.championId)
      return
    }

    await setActiveChallenge(next)
    return
  }

  if (challenge.group.phase === 'dueling') {
    const challengerId = challenge.group.queue[0]

    if (!challengerId || !challenge.group.championId) return

    const challenger = targets.find(target => target.id === challengerId)

    if (!challenger) return
    if (challenger.rolledAt <= challenge.updatedAt) return
    if (challenger.won === null) return

    const next = resolveGroupDuel(challenge, challenger, Date.now())

    if (isGroupComplete(next)) {
      await endGroup(next.group.championId)
      return
    }

    await setActiveChallenge(next)
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
      processGroupAdvancement()
      refreshDicePool()
    }

    if (setting.key === 'cortexprime.activeChallenge') {
      refreshDicePool()
    }
  })

  Hooks.on('updateActor', (actor, data) => {
    if (foundry.utils.hasProperty(data, 'flags.cortexprime.lastRoll')) {
      processChallengeAdvancement()
      processGroupAdvancement()
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
