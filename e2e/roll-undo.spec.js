import { test, expect } from '@playwright/test'
import { openAs } from './foundry.js'
import { openTray, buildUniformPool, clearPool, clearRollRecord, rollExactly, seedRollRecord } from './helpers/dicePool.js'
import { setChallengeType, setInitiator, checkResponder, challengeIdFor, getActiveChallenge, anyRollButtonEnabled, allRollButtonsDisabled } from './helpers/challenge.js'
import {
  awaitSetting,
  clearChallenge,
  enableTestMode,
  getRollRecord,
  requireActiveGM,
  restoreSettings,
  snapshotSettings
} from './helpers/world.js'

// Undo Roll had no E2E coverage: rollUndoLogic.js decides WHETHER a roll may be undone and what
// the challenge becomes afterwards, but nothing tested the half that matters to a table — that
// the button is injected onto the right card on the GM's client only, and that using it actually
// puts the player back in a position to roll again.
//
// Uses PlaywrightPlayer2 / Cameron James.

const PLAYER2_ACTOR = 'Cameron James'
const WRITES = ['activeChallenge', 'lastGmRoll', 'testModeSelectDiceValues', 'rollUndoSnapshots']

// Two logins plus a real roll through the picker; the 180s default is not enough.
test.setTimeout(360_000)

test('the GM can undo a player\'s roll from its chat card, restoring the challenge and freeing them to roll again', async ({ browser }) => {
  const gm = await openAs(browser, 'gm')
  const player2 = await openAs(browser, 'player2')

  // The dialog / card refresh under test runs on Foundry's elected active GM only.
  const notActiveGM = await requireActiveGM(gm.page)

  if (notActiveGM) {
    await gm.context.close()
    await player2.context.close()
    test.skip(true, notActiveGM)
  }

  const before = await snapshotSettings(gm.page, WRITES)

  try {
    await clearChallenge(gm.page)
    await clearRollRecord(gm.page)
    await clearRollRecord(gm.page, PLAYER2_ACTOR)
    await enableTestMode(gm.page)
    // World settings reach the other sessions over a socket, and the picker reads this one when
    // it opens — roll before it lands and the dice come out random.
    await awaitSetting(player2.page, 'testModeSelectDiceValues', true)

    await openTray(gm.page)
    await openTray(player2.page)

    const gmId = await challengeIdFor(gm.page, 'gm')
    const player2Id = await challengeIdFor(gm.page, 'player2')

    await setChallengeType(gm.page, 'test')
    await setInitiator(gm.page, gmId)
    await checkResponder(gm.page, player2Id)

    await seedRollRecord(gm.page, { total: 20, effectDice: [8] })

    // The roll buttons are only rendered once the pool has dice in it, so build it before
    // asking whether they are enabled.
    await buildUniformPool(player2.page, { count: 3, face: 6, prefix: 'P2 Die' })
    await expect.poll(() => anyRollButtonEnabled(player2.page)).toBe(true)

    // A real roll, so the whole snapshot pipeline runs: the roll writes lastRoll, the GM
    // client's updateActor listener stores the pre-roll challenge under rollUndoSnapshots.
    await rollExactly(player2.page, [3, 2, 2])

    await expect.poll(() => getRollRecord(gm.page, PLAYER2_ACTOR).then(r => r?.rolledAt ?? 0))
      .toBeGreaterThan(0)

    // They were the only responder, so answering ends the Test outright.
    await expect.poll(() => getActiveChallenge(gm.page).then(c => c?.type ?? null)).toBeNull()

    // The snapshot is what makes the roll undoable at all.
    const snapshots = await gm.page.evaluate(() =>
      window.game.settings.get('cortexprime-ext', 'rollUndoSnapshots')
    )
    expect(snapshots[player2Id]).toBeTruthy()

    // The button is injected onto the roll's own card, and only for the GM.
    const undo = gm.page.locator('.undo-roll')
    await expect(undo).toHaveCount(1, { timeout: 15_000 })
    await expect(player2.page.locator('.undo-roll')).toHaveCount(0)

    const cardsBefore = await gm.page.evaluate(() => window.game.messages.contents.length)

    await expect(undo).toBeVisible()

    // dispatchEvent rather than click(): undoing DELETES the card the button lives on, so the
    // node detaches while Playwright is still in its actionability/retry loop and it then waits
    // forever for an element that no longer exists. The visibility assertion above keeps the
    // "a GM can actually see and press this" guarantee; dispatching just skips the retry race.
    await undo.dispatchEvent('click')

    // The challenge comes back with that responder re-added — computeUndoChallenge restores a
    // cleared Test with only the undone responder in it.
    await expect.poll(() => getActiveChallenge(gm.page).then(c => c?.type ?? null)).toBe('test')

    const restored = await getActiveChallenge(gm.page)
    expect(restored.initiatorId).toBe(gmId)
    expect(restored.responderIds).toContain(player2Id)

    // The roll record is blanked — a rolledAt of 0 is what makes every downstream reactor skip
    // it, so the player counts as not having rolled this round.
    await expect.poll(() => getRollRecord(gm.page, PLAYER2_ACTOR).then(r => r?.rolledAt ?? 0)).toBe(0)

    // The card is gone, replaced by a notice, and the button with it.
    await expect(gm.page.locator('.undo-roll')).toHaveCount(0)
    expect(await gm.page.evaluate(() => window.game.messages.contents.length))
      .toBeLessThanOrEqual(cardsBefore)

    // And the player can roll again: their tray re-enables live, with no reload.
    await openTray(player2.page)
    await buildUniformPool(player2.page, { count: 3, face: 6, prefix: 'P2 Die' })
    await expect.poll(() => allRollButtonsDisabled(player2.page)).toBe(false)
  } finally {
    await clearChallenge(gm.page)
    await clearRollRecord(gm.page)
    await clearRollRecord(gm.page, PLAYER2_ACTOR)
    await clearPool(player2.page)
    await restoreSettings(gm.page, before)

    await gm.context.close()
    await player2.context.close()
  }
})
