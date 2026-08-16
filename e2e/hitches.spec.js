import { test, expect } from '@playwright/test'
import { openAs } from './foundry.js'
import { openTray, buildUniformPool, clearPool, clearRollRecord, rollExactly, seedRollRecord } from './helpers/dicePool.js'
import { setChallengeType, setInitiator, checkResponder, challengeIdFor, anyRollButtonEnabled } from './helpers/challenge.js'
import {
  awaitSetting,
  clearChallenge,
  enableTestMode,
  getChatMessageIds,
  plotPointMessagesSince,
  requireActiveGM,
  restoreSettings,
  snapshotSettings
} from './helpers/world.js'
import { getActorPath, updateActor } from './helpers/sheet.js'

// The Hitches dialog is 298 lines with no E2E coverage at all: a natural 1 rolled by a player
// during an active challenge has to open the dialog on the GM's screen (and only the GM's),
// carry the GM's choices back onto the PLAYER's sheet, and award the Plot Points that go with
// them. hitchesLogic.js covers what the outcome should be; nothing covered it actually landing.
//
// Uses PlaywrightPlayer2 / Cameron James, which the rest of the suite exercises far less than
// player1.

const PLAYER2_ACTOR = 'Cameron James'
const COMPLICATIONS = 'system.actorType.complications'
const PP = 'system.pp.value'
const NEW_COMPLICATION = 'Playwright Complication'

const WRITES = ['activeChallenge', 'lastGmRoll', 'testModeSelectDiceValues', 'rollUndoSnapshots']

test('a player\'s hitch opens the GM\'s Hitches dialog, and confirming writes the complication and Plot Point onto the player', async ({ browser }) => {
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
  const complicationsBefore = await getActorPath(gm.page, PLAYER2_ACTOR, COMPLICATIONS)
  const ppBefore = await getActorPath(gm.page, PLAYER2_ACTOR, PP)

  try {
    await clearChallenge(gm.page)
    await clearRollRecord(gm.page)
    await clearRollRecord(gm.page, PLAYER2_ACTOR)
    await enableTestMode(gm.page)
    // The picker reads this when it opens; give the socket time to reach the player's client.
    await awaitSetting(player2.page, 'testModeSelectDiceValues', true)

    await openTray(gm.page)
    await openTray(player2.page)

    const gmId = await challengeIdFor(gm.page, 'gm')
    const player2Id = await challengeIdFor(gm.page, 'player2')

    await setChallengeType(gm.page, 'test')
    await setInitiator(gm.page, gmId)
    await checkResponder(gm.page, player2Id)

    // The initiator's roll is seeded here — this test is about what the RESPONDER's hitch does,
    // and a seeded target keeps the setup short.
    await seedRollRecord(gm.page, { total: 6, effectDice: [8] })

    // Roll buttons only render once the pool has dice in it.
    await buildUniformPool(player2.page, { count: 4, face: 6, prefix: 'P2 Die' })
    await expect.poll(() => anyRollButtonEnabled(player2.page)).toBe(true)

    // Four dice, forced descending, with the last one dropped to a natural 1. Descending order
    // keeps the positional edits stable (the picker re-sorts by result after each one), and
    // putting the 1 last means the die leaving the results list for the hitches list can't
    // shift an index that still has to be written.
    await rollExactly(player2.page, [5, 4, 3, 1])

    // The dialog belongs to the GM's client alone — a player never resolves their own hitch.
    const dialog = gm.page.locator('.window-content form.cortexprime.hitches-dialog')
    await expect(dialog).toBeVisible({ timeout: 15_000 })
    await expect(player2.page.locator('.window-content form.cortexprime.hitches-dialog')).toHaveCount(0)

    // One die came up 1, so there is exactly one row to resolve, and it's a HITCH not a BOTCH.
    const rows = dialog.locator('.hitch-row')
    await expect(rows).toHaveCount(1)
    await expect(dialog).toContainText(PLAYER2_ACTOR)

    const messagesBefore = await getChatMessageIds(gm.page)

    // Introduce a brand new complication, which always enters play at D6.
    await rows.first().locator('select.hitch-action').selectOption('introduce-complication')

    const nameField = rows.first().locator('.hitch-complication-name:visible')
    await expect(nameField).toHaveCount(1)
    await nameField.fill(NEW_COMPLICATION)
    await nameField.blur()

    // Nothing has been written yet — the dialog is a projection until Confirm.
    expect(await getActorPath(gm.page, PLAYER2_ACTOR, PP)).toBe(ppBefore)

    await dialog.locator('.hitches-confirm').click()
    await expect(dialog).toBeHidden({ timeout: 15_000 })

    // The complication lands on the PLAYER's sheet, at D6, from the GM's client.
    await expect
      .poll(async () => {
        const complications = await getActorPath(gm.page, PLAYER2_ACTOR, COMPLICATIONS)
        return Object.values(complications ?? {}).map(entry => entry.label)
      })
      .toContain(NEW_COMPLICATION)

    const complications = await getActorPath(gm.page, PLAYER2_ACTOR, COMPLICATIONS)
    const added = Object.values(complications).find(entry => entry.label === NEW_COMPLICATION)
    expect(Object.values(added.dice.value)).toEqual(['6'])

    // Taking a complication pays the player one Plot Point — one per unique complication
    // touched, and exactly one card announcing it.
    await expect.poll(() => getActorPath(gm.page, PLAYER2_ACTOR, PP)).toBe(ppBefore + 1)

    // A settle window, because the assertion below is about the ABSENCE of a second award.
    await gm.page.waitForTimeout(2_000)
    expect(await plotPointMessagesSince(gm.page, messagesBefore)).toHaveLength(1)
  } finally {
    // Unset then set, the same two-step the system itself uses: merging into the existing
    // object would leave the complication this test added behind.
    await updateActor(gm.page, PLAYER2_ACTOR, { 'system.actorType.-=complications': null })
    await updateActor(gm.page, PLAYER2_ACTOR, {
      [COMPLICATIONS]: complicationsBefore ?? {},
      [PP]: ppBefore ?? 1
    })

    await clearChallenge(gm.page)
    await clearRollRecord(gm.page)
    await clearRollRecord(gm.page, PLAYER2_ACTOR)
    await clearPool(player2.page)
    await restoreSettings(gm.page, before)

    await gm.context.close()
    await player2.context.close()
  }
})
