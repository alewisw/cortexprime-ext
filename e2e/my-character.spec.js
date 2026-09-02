import { test, expect } from '@playwright/test'
import { openAs } from './foundry.js'
import { SHEET } from './helpers/sheet.js'

// "My Character" is the players' shortcut to their own sheet. It is gated
// on !isGM && !!game.user.character (myCharacter.js:11), and refreshes off
// the updateUser hook — so unassigning a character should make it vanish
// without the player reloading.
const button = page => page.locator('#cortexprime-floating-panel button[data-action="my-character"]')

test('a player can open their own character sheet from the panel', async ({ browser }) => {
  const player1 = await openAs(browser, 'player1')

  // Being *assigned* an actor is not the same as being able to open it:
  // Foundry silently refuses to render a sheet the user cannot observe. In
  // normal play a player owns their own PC, so if this skips, the world's
  // permissions need fixing rather than the test.
  const isOwner = await player1.page.evaluate(() => !!window.game.user.character?.isOwner)
  test.skip(!isOwner, 'PlaywrightPlayer1 does not have Owner permission on their assigned character')

  try {
    await expect(button(player1.page)).toHaveCount(1)
    await button(player1.page).click()

    // The sheet window itself is the assertion. (The button's `.active`
    // class is not: FloatingPanel only recomputes isActive() on refresh,
    // and rendering a sheet doesn't trigger one.)
    const sheet = player1.page.locator(SHEET)
    await expect(sheet).toHaveCount(1)

    const openedName = await player1.page.evaluate(() =>
      window.game.user.character?.sheet?.rendered ? window.game.user.character.name : null
    )
    expect(openedName).toBe('Amanda Singh')

    // Close via the sheet's own header control rather than the panel
    // button: at this viewport the opened sheet is clamped to full height
    // and completely covers the top-center panel, so the button is not
    // actionable while it's up (Foundry won't reposition it out of the
    // way either). That's real behaviour, not a test artifact.
    await sheet.locator('a.header-button.close, button.header-control[data-action="close"]').first().click()
    await expect(sheet).toHaveCount(0)
  } finally {
    await player1.context.close()
  }
})

test('unassigning a player character removes their My Character button live', async ({ browser }) => {
  const gm = await openAs(browser, 'gm')
  const player1 = await openAs(browser, 'player1')

  const originalActorId = await gm.page.evaluate(
    () => window.game.users.getName('PlaywrightPlayer1')?.character?.id ?? null
  )

  test.skip(!originalActorId, 'PlaywrightPlayer1 has no assigned character')

  try {
    await expect(button(player1.page)).toHaveCount(1)

    // The GM unassigns from their own client; the player's panel must
    // react to the updateUser hook with no reload.
    await gm.page.evaluate(() =>
      window.game.users.getName('PlaywrightPlayer1').update({ character: null })
    )

    await expect(button(player1.page)).toHaveCount(0)

    // Reassigning brings it straight back.
    await gm.page.evaluate(
      id => window.game.users.getName('PlaywrightPlayer1').update({ character: id }),
      originalActorId
    )

    await expect(button(player1.page)).toHaveCount(1)
  } finally {
    await gm.page.evaluate(
      id => window.game.users.getName('PlaywrightPlayer1').update({ character: id }),
      originalActorId
    )

    await gm.context.close()
    await player1.context.close()
  }
})
