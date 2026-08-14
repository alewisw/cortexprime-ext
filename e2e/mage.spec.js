import { test, expect } from '@playwright/test'
import { openAs } from './foundry.js'
import { TRAY, openTray, clearPool, addCustomDie, seedRollRecord, clearRollRecord } from './helpers/dicePool.js'
import { setChallengeType, setInitiator, challengeIdFor } from './helpers/challenge.js'
import { clearChallenge, requireMageRuleSet, getSetting, setSetting } from './helpers/world.js'

// The Mage: The Ascension engine layers onto the Dice Pool tray rather than
// replacing it: the GM gets a Magick / Reality Reinforcement box while a
// challenge is running, and whatever they pick is announced on EVERY
// client's tray so the whole table knows a roll is being made under
// magick. The arithmetic is unit-tested; what needs a browser is that the
// box is GM-only and the label actually reaches the players live.

test('the Magick box is GM-only and only appears while a challenge is running', async ({ browser }) => {
  const gm = await openAs(browser, 'gm')
  const player1 = await openAs(browser, 'player1')

  const skip = await requireMageRuleSet(gm.page)
  test.skip(skip !== null, skip ?? '')

  try {
    await clearChallenge(gm.page)
    await openTray(gm.page)
    await openTray(player1.page)

    // No challenge: no box, even for the GM.
    await expect(gm.page.locator(`${TRAY} .mage-challenge-box`)).toHaveCount(0)

    await setChallengeType(gm.page, 'test')
    await setInitiator(gm.page, await challengeIdFor(gm.page, 'gm'))

    // Now the GM gets it — and the player never does.
    await expect(gm.page.locator(`${TRAY} .mage-challenge-box`)).toHaveCount(1)
    await expect(gm.page.locator(`${TRAY} input.mage-magick-radio`)).toHaveCount(5)
    await expect(gm.page.locator(`${TRAY} input.mage-reality-reinforcement-radio`)).toHaveCount(3)
    await expect(player1.page.locator(`${TRAY} .mage-challenge-box`)).toHaveCount(0)
  } finally {
    await clearChallenge(gm.page)
    await gm.context.close()
    await player1.context.close()
  }
})

test('the Magick choice is announced live on every client tray', async ({ browser }) => {
  const gm = await openAs(browser, 'gm')
  const player1 = await openAs(browser, 'player1')
  const player2 = await openAs(browser, 'player2')

  const skip = await requireMageRuleSet(gm.page)
  test.skip(skip !== null, skip ?? '')

  const previousState = await getSetting(gm.page, 'mageChallengeState')

  try {
    await clearChallenge(gm.page)
    await openTray(gm.page)
    await openTray(player1.page)
    await openTray(player2.page)

    await setChallengeType(gm.page, 'test')
    await setInitiator(gm.page, await challengeIdFor(gm.page, 'gm'))

    // Magick "None" is the default and is deliberately NOT announced —
    // only an actual magickal roll gets called out.
    await gm.page.locator(`${TRAY} input.mage-magick-radio[value="none"]`).check()
    await expect(player1.page.locator(`${TRAY} .mage-magick-label`)).toHaveCount(0)

    await gm.page.locator(`${TRAY} input.mage-magick-radio[value="vulgar-witnessed"]`).check()

    // The setting is what drives it, and the label must reach both players
    // without a reload.
    await expect
      .poll(() => getSetting(gm.page, 'mageChallengeState').then(s => s?.magick))
      .toBe('vulgar-witnessed')

    for (const page of [gm.page, player1.page, player2.page]) {
      await expect(page.locator(`${TRAY} .mage-magick-label`)).toHaveCount(1)
      await expect(page.locator(`${TRAY} .mage-magick-label`)).toContainText(/vulgar/i)
    }

    // Switching back to None retracts the announcement everywhere.
    await gm.page.locator(`${TRAY} input.mage-magick-radio[value="none"]`).check()

    for (const page of [gm.page, player1.page, player2.page]) {
      await expect(page.locator(`${TRAY} .mage-magick-label`)).toHaveCount(0)
    }
  } finally {
    await setSetting(gm.page, 'mageChallengeState', previousState ?? { magick: 'none', realityReinforcement: 'opposes' })
    await clearChallenge(gm.page)

    await gm.context.close()
    await player1.context.close()
    await player2.context.close()
  }
})

test('a magickal roll requires a Powers trait in the roller\'s pool', async ({ browser }) => {
  const gm = await openAs(browser, 'gm')
  const player1 = await openAs(browser, 'player1')

  const skip = await requireMageRuleSet(gm.page)
  test.skip(skip !== null, skip ?? '')

  const previousState = await getSetting(gm.page, 'mageChallengeState')

  try {
    await clearChallenge(gm.page)
    await openTray(gm.page)
    await openTray(player1.page)

    await clearPool(player1.page)
    await addCustomDie(player1.page, 'Effort')

    // Make player1 the designated responder so they count as a roller, and
    // declare the roll magickal.
    await setChallengeType(gm.page, 'test')
    await setInitiator(gm.page, await challengeIdFor(gm.page, 'gm'))
    await gm.page
      .locator(`${TRAY} input.challenge-responder-checkbox[value="${await challengeIdFor(gm.page, 'player1')}"]`)
      .check()
    await gm.page.locator(`${TRAY} input.mage-magick-radio[value="vulgar"]`).check()

    // The validation only applies to whoever can actually roll right now,
    // so the initiator has to have rolled before player1 counts as one.
    await seedRollRecord(gm.page, { total: 11, effectDice: [8] })

    // Their pool holds no Powers trait, so the roll must be refused with an
    // explanation — on their client, not the GM's.
    await expect(player1.page.locator(`${TRAY} .mage-pool-invalid-message`)).toHaveCount(1)
    await expect(gm.page.locator(`${TRAY} .mage-pool-invalid-message`)).toHaveCount(0)
  } finally {
    await setSetting(gm.page, 'mageChallengeState', previousState ?? { magick: 'none', realityReinforcement: 'opposes' })
    await clearRollRecord(gm.page)
    await clearChallenge(gm.page)
    await clearPool(player1.page)

    await gm.context.close()
    await player1.context.close()
  }
})
