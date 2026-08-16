import { test, expect } from '@playwright/test'
import { openAs } from './foundry.js'
import { TRAY, openTray, closeTray, buildUniformPool, clearPool, clearRollRecord, rollExactly } from './helpers/dicePool.js'
import { setChallengeType, setInitiator, selectResponder, checkGroupParticipant, getActiveChallenge, challengeIdFor, anyRollButtonEnabled } from './helpers/challenge.js'
import {
  awaitSetting,
  clearChallenge,
  enableTestMode,
  endCrisis,
  getChatMessageIds,
  getCrisisDice,
  getRollRecord,
  restoreSettings,
  setSetting,
  snapshotSettings,
  startCrisis
} from './helpers/world.js'

// Everything the existing challenge.spec.js deliberately doesn't do. That file proves the GM's
// SETUP reaches the players' screens, using seeded roll records for determinism — which is right
// for gating, but means no test ever drives a roll through to resolution.
//
// These do. Every roll here is a real one through the dice picker, with each die forced to a
// known face via test mode, so the whole pipeline runs: roll -> record -> the GM client's
// processChallengeAdvancement / processGroupAdvancement -> new challenge state -> every client
// re-renders. Those two orchestrators had no coverage of any kind; the pure functions they call
// are well covered in test/rollToBeat.test.js, but nothing tested the seam.
//
// Pools are built from uniformly-sized custom dice on purpose. The picker lists dice sorted by
// result, so a positional value list can't be aimed at a particular die — but with one size per
// roller it doesn't need to be, and the Effect die follows from the pool's size alone. That's
// what makes the Effect-die assertions below (especially blunting) predictable.
//
// Every die value is >= 2. A natural 1 is a hitch, which opens the GM's Hitches dialog mid-flow;
// that path is covered in hitches.spec.js instead.

const WRITES = ['activeChallenge', 'crisisPool', 'lastGmRoll', 'testModeSelectDiceValues', 'rollUndoSnapshots']

const PLAYER1_ACTOR = 'Amanda Singh'
const PLAYER2_ACTOR = 'Cameron James'

/** Puts the world back exactly as found, whatever the test did to it. */
async function resetWorld(gmPage) {
  await clearChallenge(gmPage)
  await clearRollRecord(gmPage)
  await clearRollRecord(gmPage, PLAYER1_ACTOR)
  await clearRollRecord(gmPage, PLAYER2_ACTOR)
  await endCrisis(gmPage)
}

test.setTimeout(360_000)

test('a Contest plays out across both clients: roles swap, a player win reduces the Crisis Pool, a GM win does not, and the loser blunts the winner\'s Effect die', async ({ browser }) => {
  const gm = await openAs(browser, 'gm')
  const player1 = await openAs(browser, 'player1')

  const before = await snapshotSettings(gm.page, WRITES)

  try {
    await resetWorld(gm.page)
    await enableTestMode(gm.page)
    // The picker reads this when it opens; the other sessions get it over a socket.
    await awaitSetting(player1.page, 'testModeSelectDiceValues', true)

    // A D8 and a D6 in the pool: a D10 Effect die can eliminate the D8 outright, while a
    // D6 Effect die could only step something down. That difference is what makes the two
    // Crisis assertions below distinguishable.
    await startCrisis(gm.page, { name: 'Playwright Crisis', dice: [8, 6] })

    await openTray(gm.page)
    await openTray(player1.page)

    const gmId = await challengeIdFor(gm.page, 'gm')
    const player1Id = await challengeIdFor(gm.page, 'player1')

    await setChallengeType(gm.page, 'contest')
    await setInitiator(gm.page, gmId)
    await selectResponder(gm.page, player1Id)

    // --- Round 1: the GM opens, low. -------------------------------------------------
    // D6s throughout for the GM, D10s for the player, so the two sides carry different
    // Effect dice and the blunting rule at the end has something to act on.
    await buildUniformPool(gm.page, { count: 3, face: 6, prefix: 'GM Die' })
    await rollExactly(gm.page, [2, 2, 2])

    // Two highest results count toward the Total; the third is the Effect die.
    await expect.poll(() => getRollRecord(gm.page).then(r => r?.total)).toBe(4)
    expect((await getRollRecord(gm.page)).effectDice).toEqual([6])

    // --- Round 2: the player beats it, and the Crisis Pool pays for it. --------------
    // Roll buttons only render once the pool has dice, so build it before asking about them.
    await buildUniformPool(player1.page, { count: 3, face: 10, prefix: 'P1 Die' })
    await expect.poll(() => anyRollButtonEnabled(player1.page)).toBe(true)
    await rollExactly(player1.page, [3, 3, 2])

    const player1Roll = await getRollRecord(gm.page, PLAYER1_ACTOR)
    expect(player1Roll.total).toBe(6)
    expect(player1Roll.effectDice).toEqual([10])
    expect(player1Roll.won).toBe(true)

    // A D10 Effect die beats the D8 outright, so that die leaves the pool entirely.
    await expect.poll(() => getCrisisDice(gm.page)).toEqual([6])

    // The win swaps the roles: the player's total is now the one to beat. Both clients have
    // to show this without a reload.
    await expect.poll(() => getActiveChallenge(gm.page).then(c => c.initiatorId)).toBe(player1Id)
    await expect.poll(() => getActiveChallenge(gm.page).then(c => c.responderIds)).toEqual([gmId])

    await openTray(gm.page)
    await openTray(player1.page)
    await expect(gm.page.locator(TRAY)).toContainText('Amanda Singh')
    await expect(player1.page.locator(TRAY)).toContainText('6')

    // --- Round 3: the GM beats the player back — but the GM never reduces the Crisis. --
    await buildUniformPool(gm.page, { count: 3, face: 6, prefix: 'GM Die' })
    await rollExactly(gm.page, [6, 6, 2])

    await expect.poll(() => getRollRecord(gm.page).then(r => r?.won)).toBe(true)
    expect((await getRollRecord(gm.page)).total).toBe(12)

    // The rule is "a PLAYER winning reduces it" — reduceCrisisPoolByEffectDie is gated on
    // responderId !== 'gm'. Nothing should have moved.
    expect(await getCrisisDice(gm.page)).toEqual([6])

    // Roles swap back.
    await expect.poll(() => getActiveChallenge(gm.page).then(c => c.initiatorId)).toBe(gmId)

    // --- Round 4: the player fails to answer, so the Contest ends. --------------------
    await buildUniformPool(player1.page, { count: 3, face: 10, prefix: 'P1 Die' })
    await expect.poll(() => anyRollButtonEnabled(player1.page)).toBe(true)
    await rollExactly(player1.page, [2, 2, 2])

    await expect.poll(() => getRollRecord(gm.page, PLAYER1_ACTOR).then(r => r?.won)).toBe(false)

    // A loss ends the Contest outright.
    await expect.poll(() => getActiveChallenge(gm.page).then(c => c.type ?? null)).toBeNull()

    // And the losing roll blunts the winner: the GM won on a D6 Effect die, the loser answered
    // with a D10, so the GM's recorded Effect die steps down one rung. This is the only moment
    // applyContestEffectStepDown ever runs.
    await expect.poll(() => getRollRecord(gm.page).then(r => r?.effectDice)).toEqual([4])

    // The losing player still keeps their own Effect die untouched.
    expect((await getRollRecord(gm.page, PLAYER1_ACTOR)).effectDice).toEqual([10])
  } finally {
    await resetWorld(gm.page)
    await clearPool(gm.page)
    await clearPool(player1.page)
    await restoreSettings(gm.page, before)

    await gm.context.close()
    await player1.context.close()
  }
})

test('Interference pauses a running Contest for a third party, whose roll never blunts an Effect die or touches the Crisis Pool', async ({ browser }) => {
  const gm = await openAs(browser, 'gm')
  const player1 = await openAs(browser, 'player1')
  // The interferer has to be a connected user's character to be eligible at all.
  const player2 = await openAs(browser, 'player2')

  const before = await snapshotSettings(gm.page, WRITES)

  try {
    await resetWorld(gm.page)
    await enableTestMode(gm.page)
    await awaitSetting(player1.page, 'testModeSelectDiceValues', true)
    await awaitSetting(player2.page, 'testModeSelectDiceValues', true)
    await startCrisis(gm.page, { name: 'Playwright Crisis', dice: [8, 6] })

    await openTray(gm.page)
    await openTray(player1.page)
    await openTray(player2.page)

    const gmId = await challengeIdFor(gm.page, 'gm')
    const player1Id = await challengeIdFor(gm.page, 'player1')
    const player2Id = await challengeIdFor(gm.page, 'player2')

    await setChallengeType(gm.page, 'contest')
    await setInitiator(gm.page, gmId)
    await selectResponder(gm.page, player1Id)

    // Get the Contest genuinely underway — Interference is only offered once it is.
    await buildUniformPool(gm.page, { count: 3, face: 6, prefix: 'GM Die' })
    await rollExactly(gm.page, [2, 2, 2])

    await openTray(gm.page)

    const crisisBefore = await getCrisisDice(gm.page)

    // Only the third party is eligible: both contestants are excluded by
    // filterEligibleInterferers, so the GM can't "interfere" with their own Contest.
    const interfererRadios = gm.page.locator(`${TRAY} input.interferer-radio`)
    await expect(interfererRadios).toHaveCount(1)
    await expect(interfererRadios).toHaveValue(player2Id)

    await interfererRadios.check()
    await gm.page.locator(`${TRAY} button.start-interference`).click()

    await expect.poll(() => getActiveChallenge(gm.page).then(c => c.interference?.interfererId))
      .toBe(player2Id)

    // The interferer is now the only one who may roll; the paused responder is frozen out.
    await expect(gm.page.locator(TRAY)).toContainText('Cameron James')

    await buildUniformPool(player2.page, { count: 3, face: 12, prefix: 'P2 Die' })
    await expect.poll(() => anyRollButtonEnabled(player2.page)).toBe(true)
    await rollExactly(player2.page, [6, 6, 5])

    await expect.poll(() => getRollRecord(gm.page, PLAYER2_ACTOR).then(r => r?.rolledAt ?? 0))
      .toBeGreaterThan(0)

    const interferenceRoll = await getRollRecord(gm.page, PLAYER2_ACTOR)
    expect(interferenceRoll.won).toBe(true)

    // Two documented negatives, neither of which anything enforced until now: an interfering
    // roll never reduces the Crisis Pool, and never blunts anyone's Effect die.
    expect(await getCrisisDice(gm.page)).toEqual(crisisBefore)
    expect((await getRollRecord(gm.page)).effectDice).toEqual([6])

    // The Contest itself is untouched underneath — same contestants, still running.
    const paused = await getActiveChallenge(gm.page)
    expect(paused.type).toBe('contest')
    expect(paused.initiatorId).toBe(gmId)
    expect(paused.responderIds).toEqual([player1Id])

    // Resume hands the Contest back to the original two.
    await openTray(gm.page)
    await gm.page.locator(`${TRAY} button.end-interference`).click()

    await expect.poll(() => getActiveChallenge(gm.page).then(c => c.interference)).toBeNull()

    const resumed = await getActiveChallenge(gm.page)
    expect(resumed.type).toBe('contest')
    expect(resumed.initiatorId).toBe(gmId)
    expect(resumed.responderIds).toEqual([player1Id])
  } finally {
    await resetWorld(gm.page)
    await clearPool(gm.page)
    await clearPool(player1.page)
    await clearPool(player2.page)
    await restoreSettings(gm.page, before)

    await gm.context.close()
    await player1.context.close()
    await player2.context.close()
  }
})

test('a Group Challenge runs from initiative through duelling to a single winner', async ({ browser }) => {
  const gm = await openAs(browser, 'gm')
  const player1 = await openAs(browser, 'player1')
  const player2 = await openAs(browser, 'player2')

  const before = await snapshotSettings(gm.page, WRITES)

  try {
    await resetWorld(gm.page)
    await enableTestMode(gm.page)
    await awaitSetting(player1.page, 'testModeSelectDiceValues', true)
    await awaitSetting(player2.page, 'testModeSelectDiceValues', true)

    await openTray(gm.page)
    await openTray(player1.page)
    await openTray(player2.page)

    const gmId = await challengeIdFor(gm.page, 'gm')
    const player1Id = await challengeIdFor(gm.page, 'player1')
    const player2Id = await challengeIdFor(gm.page, 'player2')

    await setChallengeType(gm.page, 'group')

    const eligible = gm.page.locator(`${TRAY} input.group-participant-checkbox`)
    const available = await eligible.count()
    test.skip(available < 3, `Only ${available} eligible group participants are connected; need 3`)

    await checkGroupParticipant(gm.page, gmId)
    await checkGroupParticipant(gm.page, player1Id)
    await checkGroupParticipant(gm.page, player2Id)

    const messagesBefore = await getChatMessageIds(gm.page)

    await gm.page.locator(`${TRAY} button.start-group-initiative`).click()

    await expect.poll(() => getActiveChallenge(gm.page).then(c => c.group?.phase)).toBe('initiative')

    // --- Initiative: everyone rolls once, unopposed. ---------------------------------
    // Ascending totals, so the resulting order is known: weakest first, strongest last.
    // The strongest becomes the champion and the Target everyone else has to beat.
    await buildUniformPool(gm.page, { count: 3, face: 6, prefix: 'GM Die' })
    await rollExactly(gm.page, [2, 2, 2])

    await openTray(player1.page)
    await buildUniformPool(player1.page, { count: 3, face: 6, prefix: 'P1 Die' })
    await rollExactly(player1.page, [4, 3, 2])

    // Still in initiative until the last participant has rolled.
    expect((await getActiveChallenge(gm.page)).group.phase).toBe('initiative')

    await openTray(player2.page)
    await buildUniformPool(player2.page, { count: 3, face: 6, prefix: 'P2 Die' })
    await rollExactly(player2.page, [6, 6, 5])

    // The last roll tips the whole phase over automatically.
    await expect.poll(() => getActiveChallenge(gm.page).then(c => c.group?.phase)).toBe('dueling')

    const duelling = await getActiveChallenge(gm.page)
    expect(duelling.group.championId).toBe(player2Id)
    // Weakest first: the GM (4) leads the queue, then player1 (7).
    expect(duelling.group.queue).toEqual([gmId, player1Id])

    // The order is announced to the table, and rendered in the GM's tray.
    await expect.poll(() => getChatMessageIds(gm.page).then(ids => ids.length))
      .toBeGreaterThan(messagesBefore.length)

    await openTray(gm.page)
    await expect(gm.page.locator(TRAY)).toContainText('Cameron James')

    // --- Duel 1: the front of the queue fails to unseat the champion. ----------------
    await buildUniformPool(gm.page, { count: 3, face: 6, prefix: 'GM Die' })
    await rollExactly(gm.page, [2, 2, 2])

    // Losing eliminates the challenger outright; the champion holds and the queue shortens.
    await expect.poll(() => getActiveChallenge(gm.page).then(c => c.group?.queue)).toEqual([player1Id])
    expect((await getActiveChallenge(gm.page)).group.championId).toBe(player2Id)

    // --- Duel 2: the last challenger also fails, so the group is decided. ------------
    await buildUniformPool(player1.page, { count: 3, face: 6, prefix: 'P1 Die' })
    await expect.poll(() => anyRollButtonEnabled(player1.page)).toBe(true)
    await rollExactly(player1.page, [2, 2, 2])

    // An empty queue with a champion standing ends the whole challenge.
    await expect.poll(() => getActiveChallenge(gm.page).then(c => c.type ?? null)).toBeNull()

    // The winner is announced.
    const winnerCard = await gm.page.evaluate(() =>
      window.game.messages.contents.at(-1)?.content ?? ''
    )
    expect(winnerCard).toContain('Cameron James')
  } finally {
    await resetWorld(gm.page)
    await clearPool(gm.page)
    await clearPool(player1.page)
    await clearPool(player2.page)
    await restoreSettings(gm.page, before)

    await gm.context.close()
    await player1.context.close()
    await player2.context.close()
  }
})
