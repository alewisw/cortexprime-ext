import { test, expect } from '@playwright/test'
import { openAs } from './foundry.js'
import { SHEET, openActorSheet, closeAllSheets, getActorPath, updateActor } from './helpers/sheet.js'

const ACTOR = 'Amanda Singh'

/**
 * Index of the first trait set on the rendered sheet that actually offers
 * poolable traits, read off its own trait-set-edit button so the index
 * always matches the actor data path. Returns null when none do.
 */
async function findPoolableTraitSetIndex(sheet) {
  return sheet.evaluate(root => {
    for (const block of root.querySelectorAll('.column-item')) {
      if (!block.querySelector('.add-to-pool')) continue

      const edit = block.querySelector('button.trait-set-edit[data-trait-set]')
      if (edit) return edit.dataset.traitSet
    }

    return null
  })
}

const blockFor = (page, index) =>
  page.locator(`${SHEET} .column-item`).filter({
    has: page.locator(`button.trait-set-edit[data-trait-set="${index}"]`)
  })

// The trait-set "shutdown" toggle is the actor sheet's most consequential
// control: it doesn't just grey a trait set out, it strips the add-to-pool
// affordance so those traits can no longer be rolled with. That
// class-and-behaviour pairing is exactly what a unit test can't see.

test('shutting down a trait set dims it and makes its traits unpoolable', async ({ browser }) => {
  const gm = await openAs(browser, 'gm')

  const sheet = await openActorSheet(gm.page, ACTOR)

  // Not every trait set has poolable traits (Distinctions, for instance,
  // may carry only descriptive text), so find one that actually does
  // rather than assuming an index.
  const index = await findPoolableTraitSetIndex(sheet)
  test.skip(index === null, `${ACTOR} has no trait set with poolable traits`)

  const path = `system.actorType.traitSets.${index}.shutdown`
  const before = await getActorPath(gm.page, ACTOR, path)

  try {
    const setBlock = blockFor(gm.page, index)
    await expect(setBlock.locator('.add-to-pool').first()).toHaveCount(1)

    // Shut it down through the sheet's own edit view.
    await sheet.locator(`button.trait-set-edit[data-trait-set="${index}"]`).click()
    await sheet.locator('button.toggle-item.shutdown-toggle').first().click()

    await expect
      .poll(() => getActorPath(gm.page, ACTOR, path))
      .toBe(true)

    await sheet.locator('button.close-trait-set-edit').click()

    // Now the set reads as shut down and offers nothing to the pool.
    const shutBlock = blockFor(gm.page, index)
    await expect(shutBlock.locator('.shutdown').first()).toHaveCount(1)
    await expect(shutBlock.locator('.add-to-pool')).toHaveCount(0)
  } finally {
    await updateActor(gm.page, ACTOR, { [path]: before ?? false })
    await closeAllSheets(gm.page)
    await gm.context.close()
  }
})

test('a GM shutting down a trait set re-renders the owning player\'s open sheet', async ({ browser }) => {
  const gm = await openAs(browser, 'gm')
  const player1 = await openAs(browser, 'player1')

  const isOwner = await player1.page.evaluate(() => !!window.game.user.character?.isOwner)
  test.skip(!isOwner, 'PlaywrightPlayer1 does not own their assigned character')

  const playerSheet = await openActorSheet(player1.page, ACTOR)

  const index = await findPoolableTraitSetIndex(playerSheet)
  test.skip(index === null, `${ACTOR} has no trait set with poolable traits`)

  const path = `system.actorType.traitSets.${index}.shutdown`
  const before = await getActorPath(gm.page, ACTOR, path)

  try {
    const block = blockFor(player1.page, index)
    await expect(block.locator('.add-to-pool').first()).toHaveCount(1)

    // GM shuts it down from their own client — Foundry's updateActor
    // propagation should redraw the player's already-open sheet.
    await updateActor(gm.page, ACTOR, { [path]: true })

    await expect(block.locator('.add-to-pool')).toHaveCount(0)
  } finally {
    await updateActor(gm.page, ACTOR, { [path]: before ?? false })
    await closeAllSheets(player1.page)

    await gm.context.close()
    await player1.context.close()
  }
})

test('additional tabs configured for an actor type render on the sheet', async ({ browser }) => {
  const gm = await openAs(browser, 'gm')

  const tabs = await getActorPath(gm.page, ACTOR, 'system.actorType.additionalTabs')
  const names = Object.values(tabs ?? {}).map(tab => tab.name)
  test.skip(names.length === 0, `${ACTOR}'s actor type has no additional tabs configured`)

  try {
    const sheet = await openActorSheet(gm.page, ACTOR)

    // The default Traits tab plus one per configured additional tab.
    await expect(sheet.locator('nav.sheet-tabs a.item')).toHaveCount(names.length + 1)

    for (const name of names) {
      await expect(sheet.locator('nav.sheet-tabs a.item', { hasText: name })).toHaveCount(1)
    }

    // Switching to one actually shows its panel.
    const firstId = Object.values(tabs)[0].id
    await sheet.locator(`nav.sheet-tabs a.item[data-tab="${firstId}"]`).click()
    await expect(sheet.locator(`section.tab[data-tab="${firstId}"]`)).toBeVisible()
  } finally {
    await closeAllSheets(gm.page)
    await gm.context.close()
  }
})

// .notes-field (_forms.scss) shrinks to fit a short note rather than showing
// a big empty box, but editing should still expand it to the field's full
// max-height rather than opening at the shrunk size (module/actor/actor-sheet.js,
// the capture-phase listener on .editor-edit).
test('opening a note for editing expands it to the field\'s max height', async ({ browser }) => {
  const gm = await openAs(browser, 'gm')

  const tabs = await getActorPath(gm.page, ACTOR, 'system.actorType.additionalTabs')
  const tabEntries = Object.entries(tabs ?? {})
  test.skip(tabEntries.length === 0, `${ACTOR}'s actor type has no additional tabs configured`)

  const [tabIndex, tab] = tabEntries[0]
  const noteIndex = Object.keys(tab.notes ?? {}).length
  const notePath = `system.actorType.additionalTabs.${tabIndex}.notes.${noteIndex}`
  const deleteKey = `system.actorType.additionalTabs.${tabIndex}.notes.-=${noteIndex}`

  try {
    // Short enough that shrink-to-fit leaves it well under the max.
    await updateActor(gm.page, ACTOR, {
      [`${notePath}.label`]: 'E2E max-height check',
      [`${notePath}.value`]: '<p>Short.</p>'
    })

    const sheet = await openActorSheet(gm.page, ACTOR)
    await sheet.locator(`nav.sheet-tabs a.item[data-tab="${tab.id}"]`).click()

    const notesField = sheet.locator('.notes-field').last()
    const maxHeight = await notesField.evaluate(el => getComputedStyle(el).maxHeight)
    const shrunkHeight = await notesField.evaluate(el => getComputedStyle(el).height)

    expect(parseFloat(shrunkHeight)).toBeLessThan(parseFloat(maxHeight))

    // The pencil is display:none until .editor is hovered (Foundry core
    // CSS: body.game .app .editor:hover .editor-edit), so hover first.
    await notesField.hover()
    await notesField.locator('.editor-edit').click()

    await expect
      .poll(() => notesField.evaluate(el => getComputedStyle(el).height))
      .toBe(maxHeight)
  } finally {
    await updateActor(gm.page, ACTOR, { [deleteKey]: null })
    await closeAllSheets(gm.page)
    await gm.context.close()
  }
})

test('the Help link has been removed from the sheet tabs', async ({ browser }) => {
  const gm = await openAs(browser, 'gm')

  try {
    const sheet = await openActorSheet(gm.page, ACTOR)

    await expect(sheet.locator('nav.sheet-tabs a[href]')).toHaveCount(0)
    await expect(sheet.locator('nav.sheet-tabs a.item', { hasText: 'Help' })).toHaveCount(0)
  } finally {
    await closeAllSheets(gm.page)
    await gm.context.close()
  }
})
