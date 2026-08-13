import { test, expect } from '@playwright/test'
import { openAs } from './foundry.js'

// Verifies the Spotlight floating-panel widget (module/scripts/spotlight.js,
// templates/partials/floating-panel/spotlight.html): the GM picks a
// connected player's character from a dropdown, and that character's name
// becomes visible to every player live — no reload — until the GM clears
// it back to "None". global-setup.js already resets spotlightActorId to ''
// before this runs, so the baseline (nobody spotlighted) is known.
test('GM setting the spotlight is broadcast live to all players, and clearing it removes the widget', async ({ browser }) => {
  const gm = await openAs(browser, 'gm')
  const player1 = await openAs(browser, 'player1')
  const player2 = await openAs(browser, 'player2')

  const gmWidget = gm.page.locator('[data-widget="spotlight"]')
  const gmSelect = gmWidget.locator('select.spotlight-select')
  const player1Widget = player1.page.locator('[data-widget="spotlight"]')
  const player2Widget = player2.page.locator('[data-widget="spotlight"]')

  try {
    // Baseline: no one spotlighted. The widget renders empty (and so isn't
    // added to the DOM at all) for players; the GM still sees the card,
    // with the dropdown on "None" and a placeholder icon instead of a
    // portrait.
    await expect(player1Widget).toHaveCount(0)
    await expect(player2Widget).toHaveCount(0)
    await expect(gmSelect).toHaveValue('')
    await expect(gmWidget.locator('.spotlight-placeholder')).toBeVisible()

    // The GM's dropdown is populated from connected players' linked
    // characters (see getConnectedPlayerActors() in spotlight.js) — confirm
    // both are offered before picking one.
    await expect(gmSelect.locator('option', { hasText: 'Amanda Singh' })).toHaveCount(1)
    await expect(gmSelect.locator('option', { hasText: 'Cameron James' })).toHaveCount(1)

    // GM spotlights Amanda Singh (player1's character).
    await gmSelect.selectOption({ label: 'Amanda Singh' })

    // Broadcast to every player, live — no page reload. Both players see
    // it, not just the one whose character it is.
    await expect(player1Widget.locator('.spotlight-name')).toHaveText('Amanda Singh')
    await expect(player2Widget.locator('.spotlight-name')).toHaveText('Amanda Singh')

    // The GM's own card also updates: a real portrait instead of the
    // placeholder, and the dropdown reflects the selection.
    await expect(gmWidget.locator('.spotlight-portrait')).toBeVisible()
    await expect(gmWidget.locator('.spotlight-placeholder')).toHaveCount(0)

    // GM clears the spotlight back to "None".
    await gmSelect.selectOption('')

    // Removed live from every player's screen, and the GM's card reverts.
    await expect(player1Widget).toHaveCount(0)
    await expect(player2Widget).toHaveCount(0)
    await expect(gmSelect).toHaveValue('')
    await expect(gmWidget.locator('.spotlight-placeholder')).toBeVisible()
  } finally {
    // Belt-and-braces: leave spotlightActorId cleared even if an assertion
    // above failed partway through, so a later test in the same run isn't
    // affected by this one.
    await gm.page.evaluate(() => window.game.settings.set('cortexprime-ext', 'spotlightActorId', ''))

    await gm.context.close()
    await player1.context.close()
    await player2.context.close()
  }
})
