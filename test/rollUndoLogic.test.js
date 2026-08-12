import { describe, expect, it } from 'vitest'
import { canUndoRoll, computeUndoChallenge } from '../module/scripts/rollUndoLogic.js'

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
