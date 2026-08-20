import { test, expect } from '@playwright/test'
import { openAs } from './foundry.js'
import { SHEET, openActorSheet, closeAllSheets, getActorPath, updateActor } from './helpers/sheet.js'
import { clearPool, getPool } from './helpers/dicePool.js'

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

    // Scoped to the tab the note was actually created in. The sheet renders every additional
    // tab's markup at once and only marks one .active, so a bare '.notes-field' .last() reaches
    // into whichever tab happens to sort last — and a hidden one has no used height, so
    // getComputedStyle().height comes back 'auto' and every measurement below turns into NaN.
    const notesField = sheet.locator(`section.tab[data-tab="${tab.id}"] .notes-field`).last()
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

// Enable Hinder: a trait so flagged gets a small X icon nested inside its own add-to-pool span,
// between the dice glyph and the trait's name (see traits.html). Clicking it puts the trait in the
// pool as a flat d4; clicking the trait's name itself (the same span, elsewhere in its bounding
// box) puts it back at its real value. Both are exercised on the SAME trait/pool entry to prove
// applyTraitToPool's "exactly one instance, wrong value -> replace in place" rule actually governs
// the sheet, not just the pure logic test - see dicePoolTraitLogic.js.
test('a Hinder-enabled trait swaps into the pool as a d4, and its dice control swaps it back', async ({ browser }) => {
  const gm = await openAs(browser, 'gm')

  const sheet = await openActorSheet(gm.page, ACTOR)

  const traitSetIndex = await findPoolableTraitSetIndex(sheet)
  test.skip(traitSetIndex === null, `${ACTOR} has no trait set with poolable traits`)

  // The poolable trait's own dice path, read straight off its add-to-pool span rather than
  // guessed at, so this works for whichever trait/index the world happens to have configured.
  // Scoped to a TOP-LEVEL trait's dice path specifically (not a sub-trait's, which the same class
  // also decorates) by requiring the path end in "traits.<i>.dice" with nothing after it.
  const dicePath = await blockFor(gm.page, traitSetIndex).evaluate(block => {
    const candidates = [...block.querySelectorAll('.add-to-pool[data-path]')]
    const match = candidates.find(el => /^system\.actorType\.traitSets\.\d+\.traits\.\d+\.dice$/.test(el.dataset.path))

    return match?.dataset.path ?? null
  })
  test.skip(dicePath === null, `${ACTOR}'s poolable trait set has no top-level poolable trait`)

  const traitPath = dicePath.replace(/\.dice$/, '')
  const enableHinderPath = `${traitPath}.enableHinder`
  const realValue = await getActorPath(gm.page, ACTOR, `${dicePath}.value`)
  const hinderBefore = await getActorPath(gm.page, ACTOR, enableHinderPath)

  const entriesFor = async page => {
    const pool = await getPool(page)
    return Object.values(pool?.pool ?? {})
      .flatMap(source => Object.values(source ?? {}))
      .filter(entry => entry.traitPath === dicePath)
  }

  try {
    await clearPool(gm.page)
    await updateActor(gm.page, ACTOR, { [enableHinderPath]: true })

    const hinderIcon = gm.page.locator(`${SHEET} .hinder-to-pool[data-path="${dicePath}"]`)
    await expect(hinderIcon).toHaveCount(1)

    await hinderIcon.click()

    await expect.poll(() => entriesFor(gm.page)).toEqual([
      expect.objectContaining({ value: { 0: '4' }, hindered: true, traitPath: dicePath })
    ])

    // The plain dice control replaces that same single instance rather than adding a second one -
    // still exactly one entry, now at the trait's real value and no longer hindered.
    const diceControl = gm.page.locator(`${SHEET} .add-to-pool[data-path="${dicePath}"]`)
    await diceControl.click()

    await expect.poll(() => entriesFor(gm.page)).toEqual([
      expect.objectContaining({ value: realValue, hindered: false, traitPath: dicePath })
    ])
  } finally {
    await clearPool(gm.page)
    await updateActor(gm.page, ACTOR, { [enableHinderPath]: hinderBefore ?? false })
    await closeAllSheets(gm.page)
    await gm.context.close()
  }
})

// Regression guard: getData() used to capture super.getData() BEFORE running the
// dice-normalization fix (computeTraitDiceNormalization) and return that stale, over-full
// snapshot regardless of the fix landing moments later on the actual document. A render that
// needed trimming therefore always painted the WRONG (2+ dice) data first, self-correcting only
// once a second, reactive render caught up — visible as a torn/misaligned row for that window.
// See module/actor/actor-sheet.js getData(): super.getData() must run AFTER the fix, not before.
test('a trait needing its dice trimmed renders correctly on its very first paint, not one render late', async ({ browser }) => {
  const gm = await openAs(browser, 'gm')

  const traitSets = await getActorPath(gm.page, ACTOR, 'system.actorType.traitSets')
  const hit = Object.entries(traitSets ?? {}).find(([, ts]) =>
    ts.settings?.hasMultipleDice === false && Object.keys(ts.traits ?? {}).length > 0
  )
  test.skip(!hit, `${ACTOR} has no hasMultipleDice:false trait set to reproduce with`)

  const [tsIndex, ts] = hit
  const [traitIndex, trait] = Object.entries(ts.traits)[0]
  const dicePath = `system.actorType.traitSets.${tsIndex}.traits.${traitIndex}.dice`
  const before = trait.dice?.value

  try {
    // A trait that already needs trimming when its sheet next renders - exactly the state a
    // settings merge (Update Settings, Change Actor Type) can transiently leave behind.
    await updateActor(gm.page, ACTOR, { [`${dicePath}.value`]: { 0: '4', 1: '6' } })

    const firstCallDice = await gm.page.evaluate(async ({ name, tsIdx, tIdx }) => {
      const actor = window.game.actors.getName(name)
      const proto = Object.getPrototypeOf(actor.sheet)
      const orig = proto.getData

      let captured = null
      proto.getData = async function (...args) {
        const result = await orig.apply(this, args)
        if (captured === null) {
          captured = result?.data?.system?.actorType?.traitSets?.[tsIdx]?.traits?.[tIdx]?.dice?.value
        }
        return result
      }

      try {
        actor.sheet.render(true)
        await new Promise(resolve => setTimeout(resolve, 800))
        return captured
      } finally {
        proto.getData = orig
      }
    }, { name: ACTOR, tsIdx: tsIndex, tIdx: traitIndex })

    // The FIRST getData() call this render performs must already reflect the corrected single
    // die - not the stale 2-die value that used to be returned while the fix was still in flight.
    expect(Object.keys(firstCallDice ?? {}).length).toBe(1)
  } finally {
    await updateActor(gm.page, ACTOR, { [`${dicePath}.value`]: before })
    await closeAllSheets(gm.page)
    await gm.context.close()
  }
})
