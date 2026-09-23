import { test, expect } from '@playwright/test'
import { openAs } from './foundry.js'
import { openActorSheet, closeAllSheets, getActorPath, updateActor } from './helpers/sheet.js'

const ACTOR = 'Amanda Singh'

// Bug: entering a trait set's edit view writes system.actorType.traitSetEdit straight onto the
// ACTOR document (_traitSetEdit, actor-sheet.js) - shared, synced state. Every client with this
// actor's sheet open re-renders reactively off that same field (showActorTypePicker/edit-view
// branching in getData()), so one player clicking the edit pencil drags every OTHER open sheet -
// including the GM's, who did nothing - into the same edit view. Sheet navigation (which trait set
// you're editing, which tab you're on) is meant to be per-client, not broadcast; see the comment
// at actor-sheet.js:278-282 explaining why the sibling actor-type-edit picker was deliberately kept
// as sheet-instance state instead of an actor flag, for exactly this reason - trait-set-edit was
// never given the same treatment.
test('a player entering a trait set\'s edit view does not pull the GM\'s independently-open sheet into edit mode too', async ({ browser }) => {
  const gm = await openAs(browser, 'gm')
  const player1 = await openAs(browser, 'player1')

  const isOwner = await player1.page.evaluate(
    name => !!window.game.actors.getName(name)?.isOwner,
    ACTOR
  )
  test.skip(!isOwner, `PlaywrightPlayer1 does not own ${ACTOR}`)

  const before = await getActorPath(gm.page, ACTOR, 'system.actorType.traitSetEdit')

  try {
    const gmSheet = await openActorSheet(gm.page, ACTOR)
    const playerSheet = await openActorSheet(player1.page, ACTOR)

    const editBtn = playerSheet.locator('button.trait-set-edit').first()
    await expect(editBtn).toHaveCount(1)
    await editBtn.click()

    // The player's own sheet enters the edit view...
    await expect(playerSheet.locator('button.close-trait-set-edit')).toHaveCount(1)

    // ...but the GM's independently-open sheet must stay exactly where it was - navigating one
    // client's sheet must not move any other client's already-open sheet.
    await expect(gmSheet.locator('button.close-trait-set-edit')).toHaveCount(0)
  } finally {
    await updateActor(gm.page, ACTOR, { 'system.actorType.traitSetEdit': before ?? null })
    await closeAllSheets(gm.page)
    await closeAllSheets(player1.page)
    await gm.context.close()
    await player1.context.close()
  }
})
