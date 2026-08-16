import {
  canStartGroupInitiative,
  getGroupDisplayOrder,
  getPendingGroupParticipants,
  hasContestStarted
} from '../scripts/rollToBeat.js'

// The decidable half of UserDicePool's getData: turning the active challenge plus the list of
// Roll To Beat targets into everything the template renders. Nothing here reads Foundry state —
// `initiatorHasRolled` is passed in rather than recomputed, because hasInitiatorRolled() itself
// depends on live game.settings/game.users. Same convention hasContestStarted and
// getCurrentRollerIds already follow.

// Computes "who's currently up" for both the status line and the GM's Contest radio
// selections. In a Contest, once the current "Roll Now" person has actually rolled, display
// flips to show the other party as Roll Now — it's their turn to try to beat it — even though
// the underlying initiatorId/responderIds only actually swap if that roll goes on to lose (see
// processChallengeAdvancement). In a Test, once the initiator has rolled, every remaining
// responder moves up into "Roll Now" at once instead — a Test can have any number of
// responders, so a single displayed "swap" doesn't apply there.
export const getChallengeDisplay = (activeChallenge, rollToBeatTargets, initiatorHasRolled) => {
  const initiatorId = activeChallenge.initiatorId
  const responderId = activeChallenge.responderIds[0] ?? null
  const nameOf = id => rollToBeatTargets.find(target => target.id === id)?.name

  if (activeChallenge.type === 'test') {
    const responderNames = activeChallenge.responderIds.map(nameOf).filter(Boolean)

    return {
      displayedInitiatorId: initiatorId,
      displayedResponderId: responderId,
      rollNowNames: initiatorHasRolled ? responderNames : [nameOf(initiatorId)].filter(Boolean),
      rollNextNames: initiatorHasRolled ? [] : responderNames
    }
  }

  const displayedInitiatorId = initiatorHasRolled ? responderId : initiatorId
  const displayedResponderId = initiatorHasRolled ? initiatorId : responderId

  return {
    displayedInitiatorId,
    displayedResponderId,
    rollNowNames: [nameOf(displayedInitiatorId)].filter(Boolean),
    rollNextNames: [nameOf(displayedResponderId)].filter(Boolean)
  }
}

// The id-returning twin of getChallengeDisplay's rollNowNames, for matching against who
// currently has a "Select Your Dice" dialog open (see selectingRollers in getData) — a
// responder, the not-yet-rolled interferer, or the front-of-queue Group duelist.
export const getEligibleRollerIds = (activeChallenge, initiatorHasRolled) => {
  if (activeChallenge.interference) return [activeChallenge.interference.interfererId]

  if (activeChallenge.type === 'group') {
    const currentId = activeChallenge.group?.phase === 'dueling' ? activeChallenge.group.queue?.[0] : null
    return currentId ? [currentId] : []
  }

  if (!activeChallenge.type) return []

  if (activeChallenge.type === 'test') {
    return initiatorHasRolled ? activeChallenge.responderIds : [activeChallenge.initiatorId]
  }

  const responderId = activeChallenge.responderIds[0] ?? null
  return [initiatorHasRolled ? responderId : activeChallenge.initiatorId].filter(Boolean)
}

// Bundles everything the template needs to render the GM's challenge controls and the status
// line, built on top of getChallengeDisplay's "who's up now" resolution.
export const getChallengeDisplayData = (activeChallenge, rollToBeatTargets, initiatorHasRolled) => {
  const display = getChallengeDisplay(activeChallenge, rollToBeatTargets, initiatorHasRolled)

  return {
    challengeInitiatorOptions: rollToBeatTargets.map(target => ({
      ...target,
      selected: target.id === display.displayedInitiatorId
    })),
    challengeResponderOptions: rollToBeatTargets
      .filter(target => target.id !== display.displayedInitiatorId)
      .map(target => ({
        ...target,
        checked: activeChallenge.type === 'test'
          ? activeChallenge.responderIds.includes(target.id)
          : target.id === display.displayedResponderId
      })),
    rollNowNames: display.rollNowNames,
    rollNextNames: display.rollNextNames,
    challengeRadiosReadOnly: hasContestStarted(activeChallenge, initiatorHasRolled)
  }
}

// Bundles everything the template needs for the GM's Group controls and status line, per phase.
// Returns isGroupChallenge:false for non-Group challenges so it can be spread unconditionally,
// exactly like getChallengeDisplayData.
export const getGroupDisplayData = (activeChallenge, rollToBeatTargets) => {
  if (activeChallenge.type !== 'group' || !activeChallenge.group) return { isGroupChallenge: false }

  const group = activeChallenge.group
  const targetOf = id => rollToBeatTargets.find(target => target.id === id)
  const nameOf = id => targetOf(id)?.name
  const champion = group.championId ? targetOf(group.championId) : null

  return {
    isGroupChallenge: true,
    isGroupSelecting: group.phase === 'selecting',
    isGroupInitiative: group.phase === 'initiative',
    isGroupDueling: group.phase === 'dueling',
    groupParticipantOptions: rollToBeatTargets.map(target => ({
      ...target,
      checked: group.participantIds.includes(target.id)
    })),
    groupCanStartInitiative: canStartGroupInitiative(activeChallenge),
    groupPendingNames: group.phase === 'initiative'
      ? getPendingGroupParticipants(activeChallenge, rollToBeatTargets).map(nameOf).filter(Boolean)
      : [],
    groupOrder: group.phase === 'dueling'
      ? getGroupDisplayOrder(group)
          .map(id => ({ id, name: nameOf(id), isChampion: id === group.championId, isCurrent: id === group.queue[0] }))
          .filter(entry => !!entry.name)
      : [],
    groupChampionName: champion?.name ?? null,
    groupCurrentChallengerName: group.phase === 'dueling' && group.queue[0] ? nameOf(group.queue[0]) : null,
    // The champion was removed mid-duel: no Target, nobody can roll until the GM acts. Surfaced
    // so the frozen roll buttons have a visible explanation.
    groupNeedsChampion: group.phase === 'dueling' && !group.championId
  }
}
