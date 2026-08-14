import { test, expect } from '@playwright/test'
import { openAs } from './foundry.js'

// Role gating on the floating panel, asserted across all three clients at
// once. Buttons whose isVisible() is false are filtered out of getData()
// (FloatingPanel.js:41) rather than rendered-and-hidden, so toHaveCount(0)
// is the correct "not visible" assertion; a *disabled* button is still in
// the DOM.
const button = (page, action) => page.locator(`#cortexprime-floating-panel button[data-action="${action}"]`)

test('the floating panel shows each role only the buttons it should have', async ({ browser }) => {
  const gm = await openAs(browser, 'gm')
  const player1 = await openAs(browser, 'player1')
  const player2 = await openAs(browser, 'player2')

  try {
    // The panel itself renders for everyone.
    for (const { page } of [gm, player1, player2]) {
      await expect(page.locator('#cortexprime-floating-panel')).toBeVisible()
    }

    // GM-only controls.
    await expect(button(gm.page, 'crisis-pool-toggle')).toHaveCount(1)
    await expect(button(player1.page, 'crisis-pool-toggle')).toHaveCount(0)
    await expect(button(player2.page, 'crisis-pool-toggle')).toHaveCount(0)

    // Player-only: My Character requires a non-GM with an assigned character.
    await expect(button(player1.page, 'my-character')).toHaveCount(1)
    await expect(button(player2.page, 'my-character')).toHaveCount(1)
    await expect(button(gm.page, 'my-character')).toHaveCount(0)

    // Scene Journal is GM-only, and additionally requires a linked journal
    // page — so it is never present for players regardless of setup.
    await expect(button(player1.page, 'scene-journal')).toHaveCount(0)
    await expect(button(player2.page, 'scene-journal')).toHaveCount(0)

    // Scene Distinction has no isVisible gate: present for everyone,
    // disabled when the active scene links no actor.
    await expect(button(gm.page, 'scene-distinction-actor')).toHaveCount(1)
    await expect(button(player1.page, 'scene-distinction-actor')).toHaveCount(1)
  } finally {
    await gm.context.close()
    await player1.context.close()
    await player2.context.close()
  }
})

test('the Doom Pool button is visible to GM and players alike once configured', async ({ browser }) => {
  const gm = await openAs(browser, 'gm')
  const player1 = await openAs(browser, 'player1')

  const doomPoolActorId = await gm.page.evaluate(() =>
    window.game.settings.get('cortexprime-ext', 'doomPoolActorId')
  )

  test.skip(!doomPoolActorId, 'No Doom Pool actor is configured in this world')

  try {
    // Unlike the GM-only buttons above, this one is deliberately not
    // role-gated — players need to see the shared Doom Pool too.
    await expect(button(gm.page, 'doom-pool')).toHaveCount(1)
    await expect(button(player1.page, 'doom-pool')).toHaveCount(1)
  } finally {
    await gm.context.close()
    await player1.context.close()
  }
})
