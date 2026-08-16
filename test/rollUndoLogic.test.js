import { describe, expect, it } from 'vitest'
import { canUndoRoll, computeUndoChallenge, resolveUndoState } from '../module/scripts/rollUndoLogic.js'

const undoable = overrides => ({
  actorId: 'actor1',
  rolledAt: 100,
  challengeType: 'test',
  currentLastRolledAt: 100,
  gmRolledAt: 0,
  latestPlayerRolledAt: 100,
  ...overrides
})

describe('canUndoRoll', () => {
  it('allows undoing a player’s most recent roll', () => {
    expect(canUndoRoll(undoable())).toBe(true)
  })

  it('never offers undo for the GM’s own roll', () => {
    expect(canUndoRoll(undoable({ actorId: 'gm' }))).toBe(false)
  })

  it('refuses a roll with no actor or no timestamp', () => {
    expect(canUndoRoll(undoable({ actorId: null }))).toBe(false)
    expect(canUndoRoll(undoable({ rolledAt: 0 }))).toBe(false)
  })

  it('refuses once the same player has rolled again', () => {
    expect(canUndoRoll(undoable({ currentLastRolledAt: 200 }))).toBe(false)
  })

  it('refuses once the GM has rolled after it', () => {
    expect(canUndoRoll(undoable({ gmRolledAt: 150 }))).toBe(false)
  })

  it('still allows undo when the GM rolled before it', () => {
    expect(canUndoRoll(undoable({ gmRolledAt: 50 }))).toBe(true)
  })

  // Boundary of the `gmRolledAt > rolledAt` guard. Identical timestamps mean the GM has not
  // rolled *after* this roll, so the undo is still safe.
  it('allows undo when the GM roll carries the same timestamp', () => {
    expect(canUndoRoll(undoable({ gmRolledAt: 100 }))).toBe(true)
  })

  describe('sequential challenges', () => {
    it('refuses anything but the latest roll in a Contest', () => {
      expect(canUndoRoll(undoable({ challengeType: 'contest', latestPlayerRolledAt: 200 }))).toBe(false)
      expect(canUndoRoll(undoable({ challengeType: 'contest', latestPlayerRolledAt: 100 }))).toBe(true)
    })

    it('refuses anything but the latest roll in a Group duel', () => {
      const duel = { challengeType: 'group', groupPhase: 'dueling' }

      expect(canUndoRoll(undoable({ ...duel, latestPlayerRolledAt: 200 }))).toBe(false)
      expect(canUndoRoll(undoable({ ...duel, latestPlayerRolledAt: 100 }))).toBe(true)
    })
  })

  describe('independent challenges', () => {
    it('allows undoing an earlier roll in a Test, since responders roll independently', () => {
      expect(canUndoRoll(undoable({ challengeType: 'test', latestPlayerRolledAt: 200 }))).toBe(true)
    })

    it('allows undoing an earlier roll during Group initiative', () => {
      expect(canUndoRoll(undoable({
        challengeType: 'group', groupPhase: 'initiative', latestPlayerRolledAt: 200
      }))).toBe(true)
    })
  })
})

describe('computeUndoChallenge', () => {
  describe('Test', () => {
    const snapshot = { type: 'test', initiatorId: 'gm', responderIds: ['actor1', 'actor2'], updatedAt: 50 }

    it('re-adds the responder without disturbing one who has since rolled', () => {
      const current = { type: 'test', initiatorId: 'gm', responderIds: ['actor2'], updatedAt: 50 }

      expect(computeUndoChallenge({ snapshot, current, actorId: 'actor1' }))
        .toEqual({ type: 'test', initiatorId: 'gm', responderIds: ['actor2', 'actor1'], updatedAt: 50 })
    })

    it('does not duplicate a responder who is somehow still listed', () => {
      const current = { type: 'test', initiatorId: 'gm', responderIds: ['actor1', 'actor2'], updatedAt: 50 }

      expect(computeUndoChallenge({ snapshot, current, actorId: 'actor1' }).responderIds)
        .toEqual(['actor1', 'actor2'])
    })

    // Clearing means they were the last one outstanding, so everyone else is already resolved.
    it('restores a cleared Test with only the undone responder', () => {
      const current = { type: null, initiatorId: null, responderIds: [], updatedAt: 0 }

      expect(computeUndoChallenge({ snapshot, current, actorId: 'actor1' }))
        .toEqual({ type: 'test', initiatorId: 'gm', responderIds: ['actor1'], updatedAt: 50 })
    })
  })

  describe('Group initiative', () => {
    const snapshot = {
      type: 'group',
      updatedAt: 50,
      group: { phase: 'initiative', participantIds: ['actor1', 'actor2'], queue: [], championId: null }
    }

    it('leaves an still-open initiative phase untouched', () => {
      const current = { ...snapshot }

      expect(computeUndoChallenge({ snapshot, current, actorId: 'actor1' })).toEqual(current)
    })

    // snapshot.updatedAt (50) predates actor2's roll, so actor2 stays counted as having rolled.
    it('discards the duelling queue when the roll had completed initiative', () => {
      const current = {
        type: 'group',
        updatedAt: 300,
        group: { phase: 'dueling', participantIds: ['actor1', 'actor2'], queue: ['actor1'], championId: 'actor2' }
      }

      expect(computeUndoChallenge({ snapshot, current, actorId: 'actor1' })).toEqual(snapshot)
    })
  })

  describe('sequential challenges', () => {
    it('restores a Contest snapshot wholesale', () => {
      const snapshot = { type: 'contest', initiatorId: 'gm', responderIds: ['actor1'], updatedAt: 50 }
      const current = { type: 'contest', initiatorId: 'actor1', responderIds: ['gm'], updatedAt: 99 }

      expect(computeUndoChallenge({ snapshot, current, actorId: 'actor1' })).toEqual(snapshot)
    })

    it('restores a Group duel snapshot wholesale, queue and champion included', () => {
      const snapshot = {
        type: 'group',
        updatedAt: 50,
        group: { phase: 'dueling', participantIds: ['actor1', 'actor2'], queue: ['actor1'], championId: 'actor2' }
      }
      const current = {
        type: 'group',
        updatedAt: 300,
        group: { phase: 'dueling', participantIds: ['actor1', 'actor2'], queue: ['actor2'], championId: 'actor1' }
      }

      expect(computeUndoChallenge({ snapshot, current, actorId: 'actor1' })).toEqual(snapshot)
    })
  })

  it('leaves the current challenge alone when there is no usable snapshot', () => {
    const current = { type: 'test', initiatorId: 'gm', responderIds: ['actor2'], updatedAt: 50 }

    expect(computeUndoChallenge({ snapshot: null, current, actorId: 'actor1' })).toEqual(current)
    expect(computeUndoChallenge({ snapshot: { type: null }, current, actorId: 'actor1' })).toEqual(current)
  })
})

// The decision half of the Undo button's availability: match the card's roll flag against the
// stored snapshot, derive the GM and latest-player roll times from the live target list, then
// defer to canUndoRoll. Only the isGM check and the two reads stay in rollUndo.js.
describe('resolveUndoState', () => {
  const rollFlag = { actorId: 'actor1', rolledAt: 100 }
  const snapshot = { rolledAt: 100, challenge: { type: 'test' } }
  const targets = [
    { id: 'gm', name: 'GM', rolledAt: 0 },
    { id: 'actor1', name: 'Amanda', rolledAt: 100 },
    { id: 'actor2', name: 'Cameron', rolledAt: 0 }
  ]

  it('offers the undo, naming the player whose card it is', () => {
    expect(resolveUndoState({ rollFlag, snapshot, targets }))
      .toEqual({ snapshot, name: 'Amanda' })
  })

  it('declines a card with no actor or no timestamp', () => {
    expect(resolveUndoState({ rollFlag: { rolledAt: 100 }, snapshot, targets })).toBeNull()
    expect(resolveUndoState({ rollFlag: { actorId: 'actor1' }, snapshot, targets })).toBeNull()
    expect(resolveUndoState({ rollFlag: null, snapshot, targets })).toBeNull()
  })

  it('declines when no snapshot was ever stored for that actor', () => {
    expect(resolveUndoState({ rollFlag, snapshot: undefined, targets })).toBeNull()
  })

  // Snapshots are per-actor and overwritten on every roll, so a mismatch means this card's roll
  // has already been superseded and there is nothing to rewind to.
  it('declines when the stored snapshot belongs to a different roll', () => {
    expect(resolveUndoState({ rollFlag, snapshot: { ...snapshot, rolledAt: 200 }, targets }))
      .toBeNull()
  })

  it('declines once the GM has rolled after it', () => {
    const gmRolledLater = targets.map(t => t.id === 'gm' ? { ...t, rolledAt: 150 } : t)

    expect(resolveUndoState({ rollFlag, snapshot, targets: gmRolledLater })).toBeNull()
  })

  it('declines once that player has rolled again', () => {
    const rolledAgain = targets.map(t => t.id === 'actor1' ? { ...t, rolledAt: 200 } : t)

    expect(resolveUndoState({ rollFlag, snapshot, targets: rolledAgain })).toBeNull()
  })

  // A Contest is strictly sequential, so only the most recent player roll may be undone; a Test's
  // responders roll independently, so an earlier one still can.
  it('applies the sequential rule using the latest roll across all players', () => {
    const cameronRolledLater = targets.map(t => t.id === 'actor2' ? { ...t, rolledAt: 200 } : t)

    expect(resolveUndoState({
      rollFlag,
      snapshot: { rolledAt: 100, challenge: { type: 'contest' } },
      targets: cameronRolledLater
    })).toBeNull()

    expect(resolveUndoState({ rollFlag, snapshot, targets: cameronRolledLater }))
      .toMatchObject({ name: 'Amanda' })
  })

  it('reads the group phase out of the snapshot, not the current challenge', () => {
    const cameronRolledLater = targets.map(t => t.id === 'actor2' ? { ...t, rolledAt: 200 } : t)
    const duel = { rolledAt: 100, challenge: { type: 'group', group: { phase: 'dueling' } } }
    const initiative = { rolledAt: 100, challenge: { type: 'group', group: { phase: 'initiative' } } }

    expect(resolveUndoState({ rollFlag, snapshot: duel, targets: cameronRolledLater })).toBeNull()
    expect(resolveUndoState({ rollFlag, snapshot: initiative, targets: cameronRolledLater }))
      .toMatchObject({ name: 'Amanda' })
  })

  // A player who has disconnected has no live target record, so their own rolledAt reads as 0 and
  // no longer matches the card - the button disappears rather than offering a broken undo.
  it('declines when the roller is no longer a live target', () => {
    const withoutAmanda = targets.filter(target => target.id !== 'actor1')

    expect(resolveUndoState({ rollFlag, snapshot, targets: withoutAmanda })).toBeNull()
  })

  it('treats a missing target list as no targets at all', () => {
    expect(resolveUndoState({ rollFlag, snapshot })).toBeNull()
  })
})
