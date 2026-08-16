import { describe, expect, it } from 'vitest'
import {
  getChallengeDisplay,
  getChallengeDisplayData,
  getEligibleRollerIds,
  getGroupDisplayData
} from '../module/applications/userDicePoolLogic.js'

const targets = [
  { id: 'gm', name: 'GM' },
  { id: 'actor1', name: 'Amanda' },
  { id: 'actor2', name: 'Cameron' },
  { id: 'actor3', name: 'Bystander' }
]

const test = overrides => ({
  type: 'test', initiatorId: 'gm', responderIds: ['actor1', 'actor2'], interference: null, group: null, ...overrides
})

const contest = overrides => ({
  type: 'contest', initiatorId: 'gm', responderIds: ['actor1'], interference: null, group: null, ...overrides
})

const group = (groupOverrides, overrides) => ({
  type: 'group',
  initiatorId: null,
  responderIds: [],
  interference: null,
  group: {
    phase: 'selecting',
    participantIds: ['actor1', 'actor2', 'actor3'],
    queue: [],
    championId: null,
    ...groupOverrides
  },
  ...overrides
})

describe('getChallengeDisplay', () => {
  describe('Test', () => {
    it('has the initiator up first, with every responder queued behind', () => {
      const display = getChallengeDisplay(test(), targets, false)

      expect(display.rollNowNames).toEqual(['GM'])
      expect(display.rollNextNames).toEqual(['Amanda', 'Cameron'])
    })

    // A Test can have any number of responders and they roll independently, so they all move
    // up at once rather than one displayed "swap".
    it('moves every responder up at once when the initiator has rolled', () => {
      const display = getChallengeDisplay(test(), targets, true)

      expect(display.rollNowNames).toEqual(['Amanda', 'Cameron'])
      expect(display.rollNextNames).toEqual([])
    })

    it('never swaps the underlying displayed ids', () => {
      for (const rolled of [false, true]) {
        const display = getChallengeDisplay(test(), targets, rolled)

        expect(display.displayedInitiatorId).toBe('gm')
        expect(display.displayedResponderId).toBe('actor1')
      }
    })
  })

  describe('Contest', () => {
    it('has the initiator up first', () => {
      const display = getChallengeDisplay(contest(), targets, false)

      expect(display.displayedInitiatorId).toBe('gm')
      expect(display.displayedResponderId).toBe('actor1')
      expect(display.rollNowNames).toEqual(['GM'])
      expect(display.rollNextNames).toEqual(['Amanda'])
    })

    // The subtlest rule in the file: the DISPLAY flips once the current roller has rolled,
    // because it's now the other party's turn to beat it — but initiatorId/responderIds only
    // actually swap later, and only if that roll loses (see processChallengeAdvancement).
    it('flips the display once the initiator has rolled, leaving the challenge untouched', () => {
      const challenge = contest()
      const display = getChallengeDisplay(challenge, targets, true)

      expect(display.displayedInitiatorId).toBe('actor1')
      expect(display.displayedResponderId).toBe('gm')
      expect(display.rollNowNames).toEqual(['Amanda'])
      expect(display.rollNextNames).toEqual(['GM'])

      expect(challenge.initiatorId).toBe('gm')
      expect(challenge.responderIds).toEqual(['actor1'])
    })

    it('copes with a Contest that has no responder yet', () => {
      const display = getChallengeDisplay(contest({ responderIds: [] }), targets, false)

      expect(display.displayedResponderId).toBeNull()
      expect(display.rollNowNames).toEqual(['GM'])
      expect(display.rollNextNames).toEqual([])
    })
  })

  // Targets come and go as players connect and disconnect, so an id with no matching target
  // has to vanish from the status line rather than render as "undefined".
  it('drops names for ids that are no longer connected targets', () => {
    const display = getChallengeDisplay(test({ responderIds: ['actor1', 'ghost'] }), targets, true)

    expect(display.rollNowNames).toEqual(['Amanda'])
  })
})

describe('getEligibleRollerIds', () => {
  it('is the initiator before they roll, and the responders after, in a Test', () => {
    expect(getEligibleRollerIds(test(), false)).toEqual(['gm'])
    expect(getEligibleRollerIds(test(), true)).toEqual(['actor1', 'actor2'])
  })

  it('is one side at a time in a Contest', () => {
    expect(getEligibleRollerIds(contest(), false)).toEqual(['gm'])
    expect(getEligibleRollerIds(contest(), true)).toEqual(['actor1'])
  })

  it('is nobody when a Contest has no responder to swap to', () => {
    expect(getEligibleRollerIds(contest({ responderIds: [] }), true)).toEqual([])
  })

  // Interference pauses the Contest outright — only the interferer may roll, whatever phase
  // the rest of the challenge was in.
  it('is only the interferer while an interference is running', () => {
    expect(getEligibleRollerIds(contest({ interference: { interfererId: 'actor3' } }), true))
      .toEqual(['actor3'])
  })

  it('is the front of the queue while duelling', () => {
    expect(getEligibleRollerIds(group({ phase: 'dueling', queue: ['actor1', 'actor2'], championId: 'actor3' }), false))
      .toEqual(['actor1'])
  })

  // Group initiative has everyone roll independently, so no single roller is "the" one; the
  // dialog-tracking this feeds simply doesn't apply.
  it('is nobody during group selection or initiative', () => {
    expect(getEligibleRollerIds(group({ phase: 'selecting' }), false)).toEqual([])
    expect(getEligibleRollerIds(group({ phase: 'initiative' }), false)).toEqual([])
  })

  it('is nobody while duelling with an empty queue', () => {
    expect(getEligibleRollerIds(group({ phase: 'dueling', queue: [], championId: 'actor3' }), false))
      .toEqual([])
  })

  it('is nobody when no challenge type has been chosen', () => {
    expect(getEligibleRollerIds({ type: null, responderIds: [], interference: null, group: null }, false))
      .toEqual([])
  })
})

describe('getChallengeDisplayData', () => {
  it('marks the displayed initiator as selected, and excludes them from the responder options', () => {
    const data = getChallengeDisplayData(test(), targets, false)

    expect(data.challengeInitiatorOptions.find(o => o.id === 'gm').selected).toBe(true)
    expect(data.challengeInitiatorOptions.filter(o => o.selected)).toHaveLength(1)
    expect(data.challengeResponderOptions.map(o => o.id)).toEqual(['actor1', 'actor2', 'actor3'])
  })

  it('follows the flipped display in a Contest once the initiator has rolled', () => {
    const data = getChallengeDisplayData(contest(), targets, true)

    expect(data.challengeInitiatorOptions.find(o => o.id === 'actor1').selected).toBe(true)
    expect(data.challengeResponderOptions.map(o => o.id)).not.toContain('actor1')
  })

  // A Test checks its responders by membership (there can be many); a Contest has exactly one,
  // matched by identity against the displayed responder.
  it('checks Test responders by membership and Contest responders by identity', () => {
    const testData = getChallengeDisplayData(test(), targets, false)
    expect(testData.challengeResponderOptions.filter(o => o.checked).map(o => o.id))
      .toEqual(['actor1', 'actor2'])

    const contestData = getChallengeDisplayData(contest(), targets, false)
    expect(contestData.challengeResponderOptions.filter(o => o.checked).map(o => o.id))
      .toEqual(['actor1'])
  })

  // Locking the radios is what stops a stray click resetting updatedAt and discarding whoever
  // is mid-round. It applies to Contests only.
  it('locks the radios only once a Contest is actually underway', () => {
    expect(getChallengeDisplayData(contest(), targets, false).challengeRadiosReadOnly).toBe(false)
    expect(getChallengeDisplayData(contest(), targets, true).challengeRadiosReadOnly).toBe(true)
    expect(getChallengeDisplayData(test(), targets, true).challengeRadiosReadOnly).toBe(false)
  })
})

describe('getGroupDisplayData', () => {
  // Spread unconditionally into getData, so it has to answer for non-Group challenges too.
  it('reports not-a-group for any other challenge, and for a group with no state yet', () => {
    expect(getGroupDisplayData(test(), targets)).toEqual({ isGroupChallenge: false })
    expect(getGroupDisplayData(contest(), targets)).toEqual({ isGroupChallenge: false })
    expect(getGroupDisplayData({ type: 'group', group: null }, targets)).toEqual({ isGroupChallenge: false })
  })

  it('raises exactly one phase flag', () => {
    const phases = {
      selecting: 'isGroupSelecting',
      initiative: 'isGroupInitiative',
      dueling: 'isGroupDueling'
    }

    for (const [phase, flag] of Object.entries(phases)) {
      const data = getGroupDisplayData(group({ phase }), targets)
      const raised = Object.values(phases).filter(f => data[f])

      expect(raised).toEqual([flag])
    }
  })

  it('checks the chosen participants in the selection list', () => {
    const data = getGroupDisplayData(group({ participantIds: ['actor1', 'actor3'] }), targets)

    expect(data.groupParticipantOptions.filter(o => o.checked).map(o => o.id))
      .toEqual(['actor1', 'actor3'])
  })

  it('lists who still owes an initiative roll, but only during initiative', () => {
    // "Pending" is decided by rolledAt against the challenge's updatedAt: a roll that predates
    // the phase doesn't count, so Amanda still owes one and Cameron doesn't.
    const timedTargets = [
      { id: 'actor1', name: 'Amanda', rolledAt: 50 },
      { id: 'actor2', name: 'Cameron', rolledAt: 150 }
    ]
    const initiative = group(
      { phase: 'initiative', participantIds: ['actor1', 'actor2'] },
      { updatedAt: 100 }
    )

    expect(getGroupDisplayData(initiative, timedTargets).groupPendingNames).toEqual(['Amanda'])

    const selecting = group({ phase: 'selecting' }, { updatedAt: 100 })
    expect(getGroupDisplayData(selecting, timedTargets).groupPendingNames).toEqual([])
  })

  it('renders the duel order with the champion last and the current challenger marked', () => {
    const duel = group({ phase: 'dueling', queue: ['actor1', 'actor2'], championId: 'actor3' })
    const data = getGroupDisplayData(duel, targets)

    expect(data.groupOrder).toEqual([
      { id: 'actor1', name: 'Amanda', isChampion: false, isCurrent: true },
      { id: 'actor2', name: 'Cameron', isChampion: false, isCurrent: false },
      { id: 'actor3', name: 'Bystander', isChampion: true, isCurrent: false }
    ])
    expect(data.groupChampionName).toBe('Bystander')
    expect(data.groupCurrentChallengerName).toBe('Amanda')
  })

  it('omits disconnected participants from the duel order', () => {
    const duel = group({ phase: 'dueling', queue: ['actor1', 'ghost'], championId: 'actor3' })

    expect(getGroupDisplayData(duel, targets).groupOrder.map(entry => entry.id))
      .toEqual(['actor1', 'actor3'])
  })

  it('has no order or challenger outside the duelling phase', () => {
    const data = getGroupDisplayData(group({ phase: 'initiative' }), targets)

    expect(data.groupOrder).toEqual([])
    expect(data.groupCurrentChallengerName).toBeNull()
  })

  // The GM can remove the champion mid-duel and nobody is promoted in their place. Nothing can
  // be rolled until the GM acts, so the frozen buttons need a visible reason.
  it('flags a duel that has lost its champion', () => {
    const orphaned = group({ phase: 'dueling', queue: ['actor1'], championId: null })
    const data = getGroupDisplayData(orphaned, targets)

    expect(data.groupNeedsChampion).toBe(true)
    expect(data.groupChampionName).toBeNull()
  })

  it('does not flag a missing champion outside the duelling phase', () => {
    expect(getGroupDisplayData(group({ phase: 'initiative', championId: null }), targets).groupNeedsChampion)
      .toBe(false)
  })
})
