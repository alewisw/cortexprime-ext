// Pure decision logic for undoing a player's roll: which rolls are still undoable, and what the
// active challenge should look like afterwards. Kept free of any Foundry globals so it's
// unit-testable; the snapshot storage, chat-card injection and the writes live in rollUndo.js.
//
// The undo is deliberately a minimal reset — it puts the player back in a position to roll and
// nothing more. Consequences the GM already confirmed (complications, Doom Pool dice,
// Paradox/Trauma, Crisis Pool reduction, plot points) are NOT reversed.

// Whether a roll's chat card should still offer an Undo button.
//   `challengeType`/`groupPhase` describe the challenge as it was WHEN THE ROLL HAPPENED (from the
//     snapshot), not as it is now — the roll may since have cleared or advanced it.
//   `latestPlayerRolledAt` is the newest rolledAt across every non-GM target.
export const canUndoRoll = ({
  actorId,
  rolledAt,
  challengeType,
  groupPhase,
  currentLastRolledAt,
  gmRolledAt = 0,
  latestPlayerRolledAt = 0
}) => {
  // The GM's own rolls are never undoable — only a player's, so they can re-roll.
  if (!actorId || actorId === 'gm' || !rolledAt) return false

  // Superseded by a newer roll from the same player.
  if (currentLastRolledAt !== rolledAt) return false

  // The GM rolling moves the challenge on in a way this minimal undo can't safely rewind.
  if (gmRolledAt > rolledAt) return false

  // Contest and Group duelling are strictly sequential: each roll is answered by the next, so
  // undoing anything but the most recent player roll would silently discard the rolls built on it.
  // A Test's responders and a Group initiative phase's participants all roll independently, so any
  // player's most recent roll stays undoable there.
  const isSequential = challengeType === 'contest' || (challengeType === 'group' && groupPhase === 'dueling')

  if (isSequential && latestPlayerRolledAt > rolledAt) return false

  return true
}

// Everything getUndoState (rollUndo.js) decides once the live reads are done: matching the card's
// roll flag against the stored snapshot, deriving the GM's and the latest player's roll times out
// of the target list, and handing the result to canUndoRoll. The impure half left behind is just
// the game.user.isGM check and fetching `snapshot`/`targets`.
//
// Returns { snapshot, name } when the card should show an Undo button, or null when it shouldn't.
export const resolveUndoState = ({ rollFlag, snapshot, targets = [] }) => {
  if (!rollFlag?.actorId || !rollFlag?.rolledAt) return null

  // A snapshot is taken per actor and overwritten on every roll, so one that doesn't match this
  // card's rolledAt belongs to a newer roll — there's nothing left to rewind this card to.
  if (!snapshot || snapshot.rolledAt !== rollFlag.rolledAt) return null

  const self = targets.find(target => target.id === rollFlag.actorId)
  const gmRolledAt = targets.find(target => target.id === 'gm')?.rolledAt ?? 0
  const latestPlayerRolledAt = targets
    .filter(target => target.id !== 'gm')
    .reduce((latest, target) => Math.max(latest, target.rolledAt ?? 0), 0)

  const allowed = canUndoRoll({
    actorId: rollFlag.actorId,
    rolledAt: rollFlag.rolledAt,
    challengeType: snapshot.challenge?.type,
    groupPhase: snapshot.challenge?.group?.phase,
    currentLastRolledAt: self?.rolledAt ?? 0,
    gmRolledAt,
    latestPlayerRolledAt
  })

  return allowed ? { snapshot, name: self?.name ?? '' } : null
}

const withoutDuplicates = ids => [...new Set(ids)]

// What the active challenge should become. `snapshot` is the challenge as it stood immediately
// before the roll; `current` is how the roll left it. Returns null to mean "clear the challenge",
// matching setActiveChallenge/clearActiveChallenge's own convention.
export const computeUndoChallenge = ({ snapshot, current, actorId }) => {
  if (!snapshot?.type) return current ?? null

  if (snapshot.type === 'test') {
    // Still running: surgically put this responder back. Deliberately NOT a wholesale snapshot
    // restore — the snapshot's responderIds still lists players who have rolled since, and
    // restoring it would drag them back into the challenge.
    if (current?.type === 'test') {
      return { ...current, responderIds: withoutDuplicates([...(current.responderIds ?? []), actorId]) }
    }

    // The roll cleared the Test, so this player was necessarily its last outstanding responder —
    // everyone else had already rolled and should stay resolved.
    return { ...snapshot, responderIds: [actorId] }
  }

  if (snapshot.type === 'group' && snapshot.group?.phase === 'initiative') {
    // The phase is still open, so nothing about the challenge changed — blanking the roll record
    // alone is what makes this participant pending again (getPendingGroupParticipants is purely
    // rolledAt <= challenge.updatedAt).
    if (current?.type === 'group' && current.group?.phase === 'initiative') return current

    // Their roll was the one that completed initiative and built the duelling queue. Restoring the
    // snapshot discards that queue; because snapshot.updatedAt predates every other participant's
    // roll, everyone else stays counted as having rolled and only this player becomes pending.
    return { ...snapshot }
  }

  // Contest and Group duelling — only the latest roll is ever offered, so nothing later can be lost.
  return { ...snapshot }
}
