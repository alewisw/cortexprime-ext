import { test, expect } from '@playwright/test'
import { openAs } from './foundry.js'
import { TRAY, openTray, seedRollRecord, clearRollRecord, addCustomDie, clearPool } from './helpers/dicePool.js'
import {
  setChallengeType,
  setInitiator,
  checkResponder,
  selectResponder,
  allRollButtonsDisabled,
  anyRollButtonEnabled,
  getActiveChallenge,
  challengeIdFor
} from './helpers/challenge.js'
import { clearChallenge } from './helpers/world.js'

// Challenge orchestration is the highest-value E2E surface in the system:
// the GM writes activeChallenge / a roll record on their client, and every
// other connected client must re-render its tray to match — enabling or
// freezing roll buttons for the right people, with no reload. Unit tests
// cover the decision logic (rollToBeat.test.js); only a real browser can
// show that the gating actually reaches the players' screens.
//
// These use seedRollRecord() rather than real dice: hasInitiatorRolled()
// only checks that a roll record is newer than the challenge, so writing
// one directly gives a deterministic Target Total with no RNG involved.

test('a Test enables its responder only once the initiator has rolled, and never the bystander', async ({ browser }) => {
  const gm = await openAs(browser, 'gm')
  const player1 = await openAs(browser, 'player1')
  const player2 = await openAs(browser, 'player2')

  try {
    await clearChallenge(gm.page)
    await clearRollRecord(gm.page)

    await openTray(gm.page)
    await openTray(player1.page)
    await openTray(player2.page)

    // The roll buttons are only rendered once a pool has dice in it, so
    // give both players something to roll — otherwise "are the buttons
    // disabled?" is vacuously unanswerable.
    await clearPool(player1.page)
    await clearPool(player2.page)
    await addCustomDie(player1.page, 'Effort')
    await addCustomDie(player2.page, 'Effort')

    const gmId = await challengeIdFor(gm.page, 'gm')
    const player1Id = await challengeIdFor(gm.page, 'player1')

    await setChallengeType(gm.page, 'test')
    await setInitiator(gm.page, gmId)
    await checkResponder(gm.page, player1Id)

    const challenge = await getActiveChallenge(gm.page)
    expect(challenge.type).toBe('test')
    expect(challenge.responderIds).toContain(player1Id)

    // Before the initiator rolls, the responder is held back — this is the
    // "wait for the initiator" rule, and it must be visible on their own
    // client without them reloading.
    await expect
      .poll(() => allRollButtonsDisabled(player1.page))
      .toBe(true)

    // Roll To Beat is rendered as soon as they're designated a responder
    // (canRollToBeat keys off getMyResponderId, not off the initiator
    // having rolled) — but like every other roll button it stays disabled
    // until there is actually something to beat.
    await expect(player1.page.locator(`${TRAY} button.roll-to-beat`)).toHaveCount(1)
    await expect(player1.page.locator(`${TRAY} button.roll-to-beat`)).toBeDisabled()

    // The GM rolls (seeded): the responder's buttons should now enable
    // live, and the target total appears.
    await seedRollRecord(gm.page, { total: 14, effectDice: [8] })

    await expect
      .poll(() => anyRollButtonEnabled(player1.page))
      .toBe(true)

    await expect(player1.page.locator(`${TRAY} button.roll-to-beat`)).toBeEnabled()
    await expect(player1.page.locator(TRAY)).toContainText('14')

    // The bystander never gets to roll while someone else's Test runs, and
    // is never offered Roll To Beat at all — they have nothing to beat.
    expect(await allRollButtonsDisabled(player2.page)).toBe(true)
    await expect(player2.page.locator(`${TRAY} button.roll-to-beat`)).toHaveCount(0)
  } finally {
    await clearRollRecord(gm.page)
    await clearChallenge(gm.page)

    await gm.context.close()
    await player1.context.close()
    await player2.context.close()
  }
})

test('the Contest participant radios lock once the first roll has happened', async ({ browser }) => {
  const gm = await openAs(browser, 'gm')
  const player1 = await openAs(browser, 'player1')

  try {
    await clearChallenge(gm.page)
    await clearRollRecord(gm.page)

    await openTray(gm.page)
    await openTray(player1.page)

    const gmId = await challengeIdFor(gm.page, 'gm')
    const player1Id = await challengeIdFor(gm.page, 'player1')

    await setChallengeType(gm.page, 'contest')
    await setInitiator(gm.page, gmId)
    await selectResponder(gm.page, player1Id)

    // Freely re-pickable before anyone rolls.
    await expect(gm.page.locator(`${TRAY} input.challenge-initiator`).first()).toBeEnabled()
    await expect(gm.page.locator(`${TRAY} input.challenge-responder-radio`).first()).toBeEnabled()

    // Once the Contest is underway the GM can no longer swap the
    // contestants — Interference is the supported way to shake it up.
    await seedRollRecord(gm.page, { total: 12, effectDice: [8] })

    await expect(gm.page.locator(`${TRAY} input.challenge-initiator`).first()).toBeDisabled()
    await expect(gm.page.locator(`${TRAY} input.challenge-responder-radio`).first()).toBeDisabled()
  } finally {
    await clearRollRecord(gm.page)
    await clearChallenge(gm.page)

    await gm.context.close()
    await player1.context.close()
  }
})

test('a Group Challenge cannot start initiative with fewer than three participants', async ({ browser }) => {
  const gm = await openAs(browser, 'gm')
  // Eligible participants are drawn from *connected* users' characters, so
  // both players have to actually be online for there to be three.
  const player1 = await openAs(browser, 'player1')
  const player2 = await openAs(browser, 'player2')

  try {
    await clearChallenge(gm.page)
    await openTray(gm.page)

    await setChallengeType(gm.page, 'group')

    const start = gm.page.locator(`${TRAY} button.start-group-initiative`)
    await expect(start).toHaveCount(1)

    // Nothing checked yet, so it must be refused.
    await expect(start).toBeDisabled()

    const checkboxes = gm.page.locator(`${TRAY} input.group-participant-checkbox`)
    const available = await checkboxes.count()
    test.skip(available < 3, `Only ${available} eligible group participants are connected; need 3`)

    await checkboxes.nth(0).check()
    await checkboxes.nth(1).check()
    await expect(start).toBeDisabled()

    // Three is the documented minimum.
    await checkboxes.nth(2).check()
    await expect(start).toBeEnabled()
  } finally {
    await clearChallenge(gm.page)

    await gm.context.close()
    await player1.context.close()
    await player2.context.close()
  }
})
