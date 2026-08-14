import { test, expect } from '@playwright/test'
import { openAs } from './foundry.js'
import { getSetting, setSetting } from './helpers/world.js'

// The Crisis Pool card is deliberately NOT role-gated (crisisPoolPanel.js
// has no isGM check on the widget) — the whole point is that everyone at
// the table sees the danger the GM is tracking, live. Only the button that
// opens the dialog is GM-only.
const widget = page => page.locator('#cortexprime-floating-panel [data-widget="crisis-pool"]')
const toggle = page => page.locator('#cortexprime-floating-panel button[data-action="crisis-pool-toggle"]')
const dialog = page => page.locator('#crisis-pool-dialog')

test('a crisis started by the GM appears live on every player, then updates and clears live', async ({ browser }) => {
  const gm = await openAs(browser, 'gm')
  const player1 = await openAs(browser, 'player1')
  const player2 = await openAs(browser, 'player2')

  const before = await getSetting(gm.page, 'crisisPool')

  try {
    // Baseline: global-setup cancels any crisis, so no card anywhere.
    await expect(widget(player1.page)).toHaveCount(0)
    await expect(widget(player2.page)).toHaveCount(0)

    // GM opens the dialog. Its title/button say "Start" while inactive.
    await toggle(gm.page).click()
    await dialog(gm.page).waitFor({ state: 'visible' })
    await expect(dialog(gm.page).locator('button.start-crisis')).toHaveCount(1)

    await dialog(gm.page).locator('input.crisis-name').fill('Collapsing Bridge')

    // Add a second die so we can assert the count, not just presence.
    await dialog(gm.page).locator('button.new-die').click()
    await expect(dialog(gm.page).locator('select.die-select')).toHaveCount(2)

    await dialog(gm.page).locator('button.start-crisis').click()

    // The card reaches BOTH players without any reload.
    for (const page of [player1.page, player2.page]) {
      await expect(widget(page).locator('.crisis-pool-name')).toHaveText('Collapsing Bridge')
      await expect(widget(page).locator('.crisis-pool-dice .die-icon-wrapper')).toHaveCount(2)
    }

    // The GM's button flips to the editing affordance.
    await expect(toggle(gm.page)).toHaveClass(/active/)

    // Editing: reopen (now pre-filled), rename, add a die, update.
    await toggle(gm.page).click()
    await dialog(gm.page).waitFor({ state: 'visible' })
    await expect(dialog(gm.page).locator('input.crisis-name')).toHaveValue('Collapsing Bridge')
    await expect(dialog(gm.page).locator('button.update-crisis')).toHaveCount(1)

    await dialog(gm.page).locator('input.crisis-name').fill('Bridge Gives Way')
    await dialog(gm.page).locator('button.new-die').click()
    await dialog(gm.page).locator('button.update-crisis').click()

    for (const page of [player1.page, player2.page]) {
      await expect(widget(page).locator('.crisis-pool-name')).toHaveText('Bridge Gives Way')
      await expect(widget(page).locator('.crisis-pool-dice .die-icon-wrapper')).toHaveCount(3)
    }

    // Ending it removes the card everywhere, again with no reload.
    await toggle(gm.page).click()
    await dialog(gm.page).waitFor({ state: 'visible' })
    await dialog(gm.page).locator('button.end-crisis').click()

    await expect(widget(player1.page)).toHaveCount(0)
    await expect(widget(player2.page)).toHaveCount(0)
    await expect(widget(gm.page)).toHaveCount(0)
  } finally {
    await setSetting(gm.page, 'crisisPool', before ?? { active: false, name: '', dice: [] })

    await gm.context.close()
    await player1.context.close()
    await player2.context.close()
  }
})

test('the crisis pool dialog is reachable only by the GM', async ({ browser }) => {
  const gm = await openAs(browser, 'gm')
  const player1 = await openAs(browser, 'player1')

  try {
    await expect(toggle(gm.page)).toHaveCount(1)
    await expect(toggle(player1.page)).toHaveCount(0)
  } finally {
    await gm.context.close()
    await player1.context.close()
  }
})
