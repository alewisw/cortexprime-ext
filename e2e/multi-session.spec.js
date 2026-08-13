import { test, expect } from '@playwright/test'
import { openAs } from './foundry.js'

// All three sessions (GM + both players) are already logged in — see
// e2e/global-setup.js, which also linked each player to their character
// and unpaused the game before any test ran. This test just proves all of
// that took effect and that the sessions are usable simultaneously; a real
// multi-client test (e.g. a GM action that should update a player's screen
// without a reload) would extend this same shape.
test('GM and both players are open at once, already linked and unpaused', async ({ browser }) => {
  const gm = await openAs(browser, 'gm')
  const player1 = await openAs(browser, 'player1')
  const player2 = await openAs(browser, 'player2')

  try {
    expect(await gm.page.evaluate(() => window.game.user.isGM)).toBe(true)
    expect(await player1.page.evaluate(() => window.game.user.isGM)).toBe(false)
    expect(await player2.page.evaluate(() => window.game.user.isGM)).toBe(false)

    expect(await player1.page.evaluate(() => window.game.user.character?.name)).toBe('Amanda Singh')
    expect(await player2.page.evaluate(() => window.game.user.character?.name)).toBe('Cameron James')

    expect(await gm.page.evaluate(() => window.game.paused)).toBe(false)
  } finally {
    await gm.context.close()
    await player1.context.close()
    await player2.context.close()
  }
})
