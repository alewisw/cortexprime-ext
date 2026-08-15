import { test, expect } from '@playwright/test'
import { openAs } from './foundry.js'
import { openTray, addCustomDie, clearPool, clearRollRecord, rollAndSelect, confirmDialog } from './helpers/dicePool.js'

// Hooks.events is a public static getter onto Foundry's own listener registry (foundry.mjs:23690).
const hookCounts = page => page.evaluate(() => ({
  create: (window.Hooks.events.createSetting ?? []).length,
  update: (window.Hooks.events.updateSetting ?? []).length
}))

test('TEMP: the picker unregisters its re-roll listener when it closes', async ({ browser }) => {
  const player1 = await openAs(browser, 'player1')

  try {
    await clearPool(player1.page)
    await openTray(player1.page)

    await addCustomDie(player1.page, 'Die One')
    await addCustomDie(player1.page, 'Die Two')
    await addCustomDie(player1.page, 'Die Three')

    const baseline = await hookCounts(player1.page)

    const picker = await rollAndSelect(player1.page)
    await expect(picker).toBeVisible()

    // While open, the dialog is listening — one extra on each of the two setting hooks.
    const whileOpen = await hookCounts(player1.page)
    expect(whileOpen.create).toBe(baseline.create + 1)
    expect(whileOpen.update).toBe(baseline.update + 1)

    await confirmDialog(player1.page)
    await picker.waitFor({ state: 'detached' }).catch(() => {})

    // Closed: both must come back off again, or every roll strands one.
    await expect.poll(() => hookCounts(player1.page), { timeout: 15_000 }).toEqual(baseline)

    // And it has to hold across repeated rolls, which is what the leak actually looked like.
    for (let index = 0; index < 2; index += 1) {
      await clearPool(player1.page)
      await addCustomDie(player1.page, `Again ${index} A`)
      await addCustomDie(player1.page, `Again ${index} B`)
      await addCustomDie(player1.page, `Again ${index} C`)

      const again = await rollAndSelect(player1.page)
      await expect(again).toBeVisible()
      await confirmDialog(player1.page)
      await again.waitFor({ state: 'detached' }).catch(() => {})
    }

    await expect.poll(() => hookCounts(player1.page), { timeout: 15_000 }).toEqual(baseline)
  } finally {
    await clearRollRecord(player1.page, 'Amanda Singh')
    await clearPool(player1.page)
    await player1.context.close()
  }
})
