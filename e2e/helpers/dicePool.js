// Dice Pool tray helpers: opening the tray, building a pool, and rolling
// with known die values.

import { confirmDialog } from './dialog.js'

// Re-exported: the picker's Confirm lives conceptually with the tray, even though the
// framework-straddling selector belongs in dialog.js.
export { confirmDialog }

export const TRAY = '#user-dice-pool'

/** Opens the viewer's own Dice Pool tray and waits for it to render. */
export async function openTray(page) {
  const alreadyOpen = await page.locator(TRAY).count()

  if (!alreadyOpen) {
    await page.evaluate(() => window.game.cortexprime.UserDicePool.toggle())
  }

  await page.locator(TRAY).waitFor({ state: 'visible', timeout: 15_000 })

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
export async function addCustomDie(page, label, face) {
  const tray = page.locator(TRAY)

  // Pick the die size first: the select submits the form, which re-renders the
  // tray, so doing it after the label would discard the label that was just typed.
  if (face) {
    await tray.locator('select.die-select[data-target="customAdd"]').first().selectOption(String(face))

    await page.waitForFunction(
      expected => window.game.user.getFlag('cortexprime-ext', 'dicePool')?.customAdd?.value?.[0] === expected,
      String(face),
      { timeout: 15_000 }
    )
  }

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

  // _addCustomTraitToPool does its own read-unset-set round trip against this same flag. Without
  // waiting for THIS die to actually land before returning, buildUniformPool's next iteration can
  // fire a die-select/label change (its own read-modify-write, via submitOnChange) while this
  // Add's write is still in flight - whichever write lands second overwrites the other's base
  // snapshot, silently dropping a die from the pool. Observed as "setDieValues: asked for N dice
  // but the picker is showing N-1" in rollExactly, further down the pipeline.
  await page.waitForFunction(
    expected => Object.values(window.game.user.getFlag('cortexprime-ext', 'dicePool')?.pool?.custom ?? {})
      .some(die => die.label === expected),
    label,
    { timeout: 15_000 }
  )
}

/**
 * Builds a pool of `count` identically-sized custom dice.
 *
 * Uniform sizes are what make rollExactly() below predictable: the picker
 * displays dice sorted by result, so a positional value list can't be aimed at
 * "the d10" — but when every die is the same size it doesn't need to be, and
 * the resulting Effect die is decided by the pool's size alone.
 */
export async function buildUniformPool(page, { count, face, prefix = 'Die' }) {
  await clearPool(page)
  await openTray(page)

  for (let index = 0; index < count; index += 1) {
    await addCustomDie(page, `${prefix} ${index + 1}`, face)
  }
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

  // The Dialog's own outer window wrapper carries the SAME two classes as the template's root
  // div (both get 'cortexprime'/'dice-picker' - the Dialog via its `classes` option, the template
  // via dice-picker.html's own root element) - a bare '.cortexprime.dice-picker' locator matches
  // both and trips Playwright's strict mode. Scoping to .window-content picks out the inner one.
  const picker = page.locator('.window-content .cortexprime.dice-picker')
  await picker.waitFor({ state: 'visible', timeout: 15_000 })

  await setDieValues(page, values)

  return picker
}

const DIE_TARGETS = '.window-content .cortexprime.dice-picker .die-value-target'

const readDieResults = page =>
  page.$$eval(DIE_TARGETS, elements => elements.map(element => Number(element.dataset.result)))

const tally = results => results.reduce((counts, value) => {
  counts[value] = (counts[value] ?? 0) + 1
  return counts
}, {})

async function setOneDie(page, index, value) {
  await page.locator(DIE_TARGETS).nth(index).click({ button: 'right' })

  const option = page.locator(`.die-value-menu .die-value-option[data-value="${value}"]`)
  await option.waitFor({ state: 'visible', timeout: 15_000 })
  await option.click()

  // The picker re-renders wholesale after each edit.
  await page.locator('.die-value-menu').waitFor({ state: 'detached' }).catch(() => {})
}

/**
 * Drives the open picker's dice to a known MULTISET of faces. Requires the
 * testModeSelectDiceValues world setting.
 *
 * Deliberately not positional. The picker re-sorts its dice by result after every
 * single edit, and a die dropped to a natural 1 moves out of the results list into
 * the hitches list — so "set index 0, then index 1, ..." writes to whichever dice
 * happen to have shuffled into those slots, and the roll ends up nothing like the
 * one that was asked for. (That silently produced wrong totals rather than an
 * error, which is a nasty way to lose an afternoon.)
 *
 * Instead: read what's there, find a die holding a value there are too many of,
 * set it to a value there are too few of, and repeat until the multiset matches.
 * Order within the pool never matters to any caller — only which faces are present.
 */
export async function setDieValues(page, values = []) {
  if (!values.length) return

  const desired = [...values].sort((a, b) => a - b)
  const attempts = values.length * 6

  for (let attempt = 0; attempt <= attempts; attempt += 1) {
    const current = await readDieResults(page)

    if (current.length !== desired.length) {
      throw new Error(
        `setDieValues: asked for ${desired.length} dice but the picker is showing ` +
        `${current.length}. The pool must hold exactly the dice being set.`
      )
    }

    if ([...current].sort((a, b) => a - b).every((value, index) => value === desired[index])) return

    const have = tally(current)
    const need = tally(desired)

    const surplus = Number(Object.keys(have).find(value => have[value] > (need[value] ?? 0)))
    const deficit = Number(Object.keys(need).find(value => need[value] > (have[value] ?? 0)))

    await setOneDie(page, current.indexOf(surplus), deficit)
  }

  throw new Error(`setDieValues: could not settle on [${desired}] after ${attempts} edits`)
}

/**
 * A complete roll with a known outcome: roll, force every die to a chosen face,
 * confirm, and wait for the dialog to go away.
 *
 * The tray is closed before any die is edited. At the test viewport the roller's
 * own tray overlaps the left half of the picker and swallows pointer events aimed
 * at it, and Foundry won't move either window — the same trap the actor sheet
 * poses for the floating panel. The roll is already underway by then, so closing
 * costs nothing.
 *
 * Keep every value >= 2 unless a hitch is wanted: a natural 1 during an active
 * challenge opens the Hitches dialog on the GM's client and stalls the flow.
 */
export async function rollExactly(page, values) {
  await page.locator(`${TRAY} button.roll-dice-pool`).first().click()

  const picker = page.locator('.window-content .cortexprime.dice-picker')
  await picker.waitFor({ state: 'visible', timeout: 15_000 })

  await closeTray(page)

  // The editable die targets only render when testModeSelectDiceValues was true on THIS client
  // at the moment the picker opened. Without them setDieValues would quietly do nothing and the
  // roll would go ahead on random dice — which shows up much later as a baffling assertion
  // failure, so fail here instead, where the cause is obvious.
  const targets = page.locator('.window-content .cortexprime.dice-picker .die-value-target')

  if (!(await targets.count())) {
    throw new Error(
      'rollExactly: the picker has no editable dice. testModeSelectDiceValues must be true on ' +
      'this client BEFORE the roll — await awaitSetting(page, "testModeSelectDiceValues", true).'
    )
  }

  await setDieValues(page, values)
  await confirmDialog(page)

  await picker.waitFor({ state: 'detached', timeout: 15_000 })
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
