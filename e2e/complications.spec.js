import { test, expect } from '@playwright/test'
import { openAs } from './foundry.js'
import { openActorSheet, closeAllSheets, getActorPath, updateActor } from './helpers/sheet.js'

// ComplicationDialog.js / complication.html / complicationPresets.js have no E2E coverage at
// all: inline editing was replaced by a popout that handles name/dice/hidden/delete AND offers a
// Category -> SubCategory -> Severity preset picker. complicationPresets.test.js and
// complicationDialogLogic.test.js already cover the picker's pure logic; nothing covered the
// dialog actually opening, writing to the actor, or the sheet no longer offering inline editing.

const ACTOR = 'Amanda Singh'
const COMPLICATIONS = 'system.actorType.complications'
const DIALOG = '.window-app.complication-dialog'

async function requireComplications(page, actorName) {
  const enabled = await page.evaluate(
    name => !!window.game.actors.getName(name)?.system?.actorType?.hasComplications,
    actorName
  )

  return enabled ? null : `${actorName}'s Actor Type does not have Complications enabled`
}

/**
 * The row containing a given complication's label, wherever it currently sits in the list.
 *
 * The `has` locator is built from sheet.page(), not from `sheet` itself: filter({ has }) matches
 * within each candidate by re-running the inner locator's OWN selector chain as a nested query,
 * so an inner locator that embeds the same ".window-app.actor-sheet" scoping as the outer one
 * asks Playwright to find that scoping AGAIN inside a candidate already inside it - impossible,
 * so it silently matches nothing. Scoping the inner locator from the page instead keeps its
 * chain to just ".trait-title-cpt", which correctly resolves as a descendant of each candidate.
 */
function rowFor(sheet, label) {
  return sheet.locator('.relative-section').filter({ has: sheet.page().locator('.trait-title-cpt', { hasText: label }) })
}

test('adding a complication: Cancel writes nothing, and picking a preset from the list fills the name/dice and writes it to the actor', async ({ browser }) => {
  const gm = await openAs(browser, 'gm')

  const reason = await requireComplications(gm.page, ACTOR)

  if (reason) {
    await gm.context.close()
    test.skip(true, reason)
  }

  const before = await getActorPath(gm.page, ACTOR, COMPLICATIONS)

  try {
    const sheet = await openActorSheet(gm.page, ACTOR)

    // --- Cancel: the dialog is a projection until Confirm. ---------------------------
    await sheet.locator('button.add-complication').click()

    const dialog = gm.page.locator(DIALOG)
    await dialog.waitFor({ state: 'visible' })

    await dialog.locator('button.cancel-complication').click()
    await expect(dialog).toBeHidden({ timeout: 15_000 })

    expect(await getActorPath(gm.page, ACTOR, COMPLICATIONS)).toEqual(before ?? null)

    // --- Add for real, via the preset picker. -----------------------------------------
    await sheet.locator('button.add-complication').click()
    await dialog.waitFor({ state: 'visible' })

    // Defaults to the first category/subCategory (Mental / Anger and Aggression) - switching
    // category resets subCategory to the new category's own first, which this exercises by
    // picking a non-default subCategory afterward rather than leaving it on that reset value.
    await dialog.locator('select.picker-category').selectOption('Physical')
    await expect(dialog.locator('select.picker-subcategory')).toHaveValue('Blunt Trauma and Bruising')

    await dialog.locator('select.picker-subcategory').selectOption('Cuts and Bleeding')
    await dialog.locator('a.picker-name[data-name="Haemorrhaging"]').click()

    // The name is filled in and still hand-editable, but this test confirms it as picked.
    await expect(dialog.locator('input.complication-label')).toHaveValue('Haemorrhaging')

    await dialog.locator('button.confirm-complication').click()
    await expect(dialog).toBeHidden({ timeout: 15_000 })

    await expect
      .poll(async () => {
        const complications = await getActorPath(gm.page, ACTOR, COMPLICATIONS)
        return Object.values(complications ?? {}).map(entry => entry.label)
      })
      .toContain('Haemorrhaging')

    const complications = await getActorPath(gm.page, ACTOR, COMPLICATIONS)
    const added = Object.values(complications).find(entry => entry.label === 'Haemorrhaging')
    // Severe fixes the die at D10.
    expect(Object.values(added.dice.value)).toEqual(['10'])

    // The sheet shows it read-only - no inline text input for it anywhere on the sheet.
    await expect(rowFor(sheet, 'Haemorrhaging')).toHaveCount(1)
    await expect(sheet.locator('input[name*="complications"][name*=".label"]')).toHaveCount(0)
  } finally {
    // Unset then set, the same two-step the system itself uses - merging into the existing
    // object would leave the complication this test added behind.
    await updateActor(gm.page, ACTOR, { 'system.actorType.-=complications': null })
    await updateActor(gm.page, ACTOR, { [COMPLICATIONS]: before ?? {} })
    await closeAllSheets(gm.page)
    await gm.context.close()
  }
})

test('the pencil on an existing complication opens it pre-filled; editing persists, and Delete removes it after confirmation', async ({ browser }) => {
  const gm = await openAs(browser, 'gm')

  const reason = await requireComplications(gm.page, ACTOR)

  if (reason) {
    await gm.context.close()
    test.skip(true, reason)
  }

  const before = await getActorPath(gm.page, ACTOR, COMPLICATIONS)
  const seededIndex = Object.keys(before ?? {}).length
  const seededLabel = 'Playwright Edit Me'
  const editedLabel = 'Playwright Edited'

  try {
    await updateActor(gm.page, ACTOR, {
      [`${COMPLICATIONS}.${seededIndex}.label`]: seededLabel,
      [`${COMPLICATIONS}.${seededIndex}.dice.value.0`]: '6'
    })

    const sheet = await openActorSheet(gm.page, ACTOR)

    await rowFor(sheet, seededLabel).locator('button.open-complication-dialog').click()

    const dialog = gm.page.locator(DIALOG)
    await dialog.waitFor({ state: 'visible' })
    await expect(dialog.locator('input.complication-label')).toHaveValue(seededLabel)

    const labelInput = dialog.locator('input.complication-label')
    await labelInput.fill(editedLabel)
    // fill() only fires `input`; ComplicationDialog commits on `change`, so blur to produce one
    // (the same fix addCustomDie needs in helpers/dicePool.js, for the same reason).
    await labelInput.blur()

    await dialog.locator('select.die-select').first().selectOption('8')
    await dialog.locator('button.confirm-complication').click()
    await expect(dialog).toBeHidden({ timeout: 15_000 })

    await expect
      .poll(() => getActorPath(gm.page, ACTOR, `${COMPLICATIONS}.${seededIndex}.label`))
      .toBe(editedLabel)

    const edited = await getActorPath(gm.page, ACTOR, `${COMPLICATIONS}.${seededIndex}`)
    expect(Object.values(edited.dice.value)).toEqual(['8'])

    // --- Delete, with confirmation. -----------------------------------------------------
    await rowFor(sheet, editedLabel).locator('button.open-complication-dialog').click()
    await dialog.waitFor({ state: 'visible' })

    await dialog.locator('button.delete-complication').click()
    await gm.page.locator('.dialog .dialog-buttons button[data-button="yes"]').click()

    await expect(dialog).toBeHidden({ timeout: 15_000 })
    await expect
      .poll(() => getActorPath(gm.page, ACTOR, `${COMPLICATIONS}.${seededIndex}`))
      .toBeNull()
    await expect(rowFor(sheet, editedLabel)).toHaveCount(0)
  } finally {
    await updateActor(gm.page, ACTOR, { 'system.actorType.-=complications': null })
    await updateActor(gm.page, ACTOR, { [COMPLICATIONS]: before ?? {} })
    await closeAllSheets(gm.page)
    await gm.context.close()
  }
})
