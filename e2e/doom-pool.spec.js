import { test, expect } from '@playwright/test'
import { openAs } from './foundry.js'
import { getSetting, setSetting } from './helpers/world.js'

// The Doom Pool button is deliberately visible to players as well as the
// GM (doomPool.js:16 gates only on the actor being configured, not on
// isGM) — the pool is shared table information. It refreshes off
// updateSetting, so configuring it should light the button up everywhere
// with no reload.
const button = page => page.locator('#cortexprime-floating-panel button[data-action="doom-pool"]')

test('configuring a Doom Pool actor makes the button appear live for GM and players', async ({ browser }) => {
  const gm = await openAs(browser, 'gm')
  const player1 = await openAs(browser, 'player1')

  const configuredId = await getSetting(gm.page, 'doomPoolActorId')
  test.skip(!configuredId, 'No Doom Pool actor is configured in this world')

  try {
    // Clear it, and the button should disappear from both clients live.
    await setSetting(gm.page, 'doomPoolActorId', '')

    await expect(button(gm.page)).toHaveCount(0)
    await expect(button(player1.page)).toHaveCount(0)

    // Restore it, and it comes back on both — again with no reload.
    await setSetting(gm.page, 'doomPoolActorId', configuredId)

    await expect(button(gm.page)).toHaveCount(1)
    await expect(button(player1.page)).toHaveCount(1)
  } finally {
    await setSetting(gm.page, 'doomPoolActorId', configuredId)

    await gm.context.close()
    await player1.context.close()
  }
})

test('the Doom Pool button opens the configured actor sheet', async ({ browser }) => {
  const gm = await openAs(browser, 'gm')

  const configuredId = await getSetting(gm.page, 'doomPoolActorId')
  test.skip(!configuredId, 'No Doom Pool actor is configured in this world')

  try {
    await button(gm.page).click()

    const openedId = await gm.page.evaluate(() =>
      Object.values(window.ui.windows).find(app => app.actor)?.actor?.id ?? null
    )
    expect(openedId).toBe(configuredId)

    // It is a toggle, not just an opener.
    await button(gm.page).click()
    await expect(button(gm.page)).not.toHaveClass(/active/)
  } finally {
    await gm.context.close()
  }
})
