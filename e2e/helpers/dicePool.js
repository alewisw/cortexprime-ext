// Dice Pool tray helpers: opening the tray, building a pool, and rolling
// with known die values.

export const TRAY = '#user-dice-pool'

/** Opens the viewer's own Dice Pool tray and waits for it to render. */
export async function openTray(page) {
  const alreadyOpen = await page.locator(TRAY).count()

  if (!alreadyOpen) {
    await page.evaluate(() => window.game.cortexprime.UserDicePool.toggle())
  }

  await page.locator(TRAY).waitFor({ state: 'visible' })

  return page.locator(TRAY)
}

export async function closeTray(page) {
  if (await page.locator(TRAY).count()) {
    await page.evaluate(() => window.game.cortexprime.UserDicePool.close())
  }
}

/** Current pool contents, straight off the user flag. */
export async function getPool(page) {
  return page.evaluate(() => window.game.user.getFlag('cortexprime-ext', 'dicePool') ?? null)
}

/**
 * Empties the pool by clearing the flag outright — the same null the tray's
 * own writes leave in place between their two-step set-null-then-set, and
 * the state a user who has never had a pool is in. Opening the tray from
 * here must not throw.
 */
export async function clearPool(page) {
  await page.evaluate(() => window.game.user.setFlag('cortexprime-ext', 'dicePool', null))
}

/**
 * Adds a labelled custom die via the tray's own inputs.
 *
 * The label is committed to the pool flag by the input's change handler
 * (which submits the form asynchronously), so wait for it to land before
 * clicking Add — otherwise the row is created with an empty label.
 */
export async function addCustomDie(page, label) {
  const tray = page.locator(TRAY)
  const input = tray.locator('input.custom-dice-label')

  await input.fill(label)
  // fill() only fires `input`; the tray commits on `change` (both its own
  // handler and Foundry's submitOnChange), so blur to produce one.
  await input.blur()

  await page.waitForFunction(
    expected => window.game.user.getFlag('cortexprime-ext', 'dicePool')?.customAdd?.label === expected,
    label,
    { timeout: 15_000 }
  )

  await tray.locator('button.add-trait-to-pool').click()
}

/**
 * Rolls via "Roll & Select" and overrides each die to a known face using
 * test mode (right-click a die -> pick a value). Requires the
 * testModeSelectDiceValues world setting.
 *
 * `values` is applied positionally to the dice shown in the picker. The
 * dialog subtree is REPLACED after every edit (rollDice.js:287-290), so
 * locators are re-queried each iteration rather than held across edits.
 */
export async function rollAndSelect(page, values = []) {
  await page.locator(`${TRAY} button.roll-dice-pool`).first().click()

  const picker = page.locator('.cortexprime.dice-picker')
  await picker.waitFor({ state: 'visible' })

  for (let index = 0; index < values.length; index += 1) {
    const die = page.locator('.cortexprime.dice-picker .die-value-target').nth(index)

    if (!(await die.count())) break

    await die.click({ button: 'right' })

    const option = page.locator(`.die-value-menu .die-value-option[data-value="${values[index]}"]`)
    await option.waitFor({ state: 'visible' })
    await option.click()

    // The picker re-renders wholesale after each edit.
    await page.locator('.die-value-menu').waitFor({ state: 'detached' }).catch(() => {})
  }

  return picker
}

/** Confirms whichever Foundry Dialog is open (the picker's Confirm button). */
export async function confirmDialog(page, label = 'Confirm') {
  await page.locator(`.dialog button:has-text("${label}")`).first().click()
}

/**
 * Writes a roll record directly, so a test gets a known Target Total with
 * no dice involved. `hasInitiatorRolled` (rollToBeat.js:138-142) only
 * checks that rolledAt is newer than activeChallenge.updatedAt, so this is
 * enough to put a responder into "Roll to Beat".
 *
 * Omit actorName to seed the GM's own record (lastGmRoll).
 */
export async function seedRollRecord(page, { actorName, total = 10, effectDice = [8], won = true } = {}) {
  return page.evaluate(async ({ name, record }) => {
    const value = { ...record, rolledAt: Date.now(), dice: [], poolEntries: [] }

    if (name) {
      const actor = window.game.actors.getName(name)
      if (!actor) return null
      await actor.setFlag('cortexprime-ext', 'lastRoll', value)
      return value
    }

    await window.game.settings.set('cortexprime-ext', 'lastGmRoll', value)
    return value
  }, { name: actorName, record: { total, effectDice, won } })
}

/** Clears a seeded roll record again. */
export async function clearRollRecord(page, actorName) {
  await page.evaluate(async name => {
    if (name) {
      const actor = window.game.actors.getName(name)
      if (actor) await actor.setFlag('cortexprime-ext', 'lastRoll', {})
      return
    }

    await window.game.settings.set('cortexprime-ext', 'lastGmRoll', {})
  }, actorName)
}
