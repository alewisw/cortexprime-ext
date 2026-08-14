import { test, expect } from '@playwright/test'
import { openAs } from './foundry.js'
import { TRAY, openTray, addCustomDie, getPool, clearPool } from './helpers/dicePool.js'
import { closeAllSheets, openActorSheet } from './helpers/sheet.js'

// The Dice Pool tray is where a pool is assembled before rolling. The
// difficulty buttons are GM-only quick-adds; adding traits comes from the
// actor sheet, which is the cross-application wiring worth exercising in a
// real browser.

// Regression: every write in UserDicePool clears the dicePool flag to null
// before setting the new value, so null is a state the system itself
// produces — and a user who has never had a pool has none at all. The
// crisis-pool merge/remove path used to dereference it unguarded, so
// opening the tray in that state threw
// "Cannot read properties of null (reading 'pool')".
test('the GM can open the tray with no pool flag set at all', async ({ browser }) => {
  const gm = await openAs(browser, 'gm')

  try {
    await gm.page.evaluate(() =>
      window.game.user.setFlag('cortexprime-ext', 'dicePool', null)
    )

    const tray = await openTray(gm.page)
    await expect(tray).toBeVisible()
  } finally {
    await clearPool(gm.page)
    await gm.context.close()
  }
})

test('the GM difficulty buttons each drop a two-die Difficulty pool, replacing the previous one', async ({ browser }) => {
  const gm = await openAs(browser, 'gm')

  try {
    await clearPool(gm.page)
    const tray = await openTray(gm.page)

    await expect(tray.locator('button.set-difficulty')).toHaveCount(5)

    await tray.locator('button.set-difficulty[data-faces="4"]').click()

    let pool = await getPool(gm.page)
    expect(Object.keys(pool?.pool ?? {})).toContain('Difficulty')
    expect(Object.values(pool.pool.Difficulty[0].value)).toEqual(['4', '4'])

    // Picking a different difficulty replaces rather than appends: still a
    // single row of two dice, not four.
    await tray.locator('button.set-difficulty[data-faces="12"]').click()

    pool = await getPool(gm.page)
    expect(Object.keys(pool.pool.Difficulty)).toEqual(['0'])
    expect(Object.values(pool.pool.Difficulty[0].value)).toEqual(['12', '12'])
  } finally {
    await clearPool(gm.page)
    await gm.context.close()
  }
})

test('difficulty buttons are GM-only', async ({ browser }) => {
  const player1 = await openAs(browser, 'player1')

  try {
    await openTray(player1.page)
    await expect(player1.page.locator(`${TRAY} button.set-difficulty`)).toHaveCount(0)
  } finally {
    await player1.context.close()
  }
})

test('a custom die can be added to and cleared from the pool', async ({ browser }) => {
  const gm = await openAs(browser, 'gm')

  try {
    await clearPool(gm.page)
    const tray = await openTray(gm.page)

    await addCustomDie(gm.page, 'Bonus')

    // Custom additions land under the "custom" source, one row per add.
    const pool = await getPool(gm.page)
    expect(pool?.pool?.custom?.[0]?.label).toBe('Bonus')

    await tray.locator('button.clear-dice-pool').click()

    const cleared = await getPool(gm.page)
    expect(cleared?.pool?.custom ?? {}).toEqual({})
  } finally {
    await clearPool(gm.page)
    await gm.context.close()
  }
})

test('a player adds a trait to their pool from their own character sheet', async ({ browser }) => {
  const player1 = await openAs(browser, 'player1')

  const isOwner = await player1.page.evaluate(() => !!window.game.user.character?.isOwner)
  test.skip(!isOwner, 'PlaywrightPlayer1 does not own their assigned character')

  try {
    await clearPool(player1.page)

    const sheet = await openActorSheet(player1.page, 'Amanda Singh')

    // Poolable traits carry the add-to-pool class (traits.html:13); traits
    // that are shut down deliberately do not.
    const poolable = sheet.locator('.add-to-pool')
    await expect(poolable.first()).toBeVisible()

    const label = (await poolable.first().innerText()).trim()
    await poolable.first().click()

    const pool = await getPool(player1.page)
    const entries = Object.values(pool?.pool ?? {})
    expect(entries.length).toBeGreaterThan(0)

    // The trait's own name should show up somewhere in the pool payload.
    expect(JSON.stringify(pool.pool).toLowerCase()).toContain(label.toLowerCase().split('\n')[0].trim())
  } finally {
    await closeAllSheets(player1.page)
    await clearPool(player1.page)
    await player1.context.close()
  }
})
