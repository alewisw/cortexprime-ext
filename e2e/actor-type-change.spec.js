import { test, expect } from '@playwright/test'
import { openAs } from './foundry.js'
import { SHEET, openActorSheet, closeAllSheets, getActorPath } from './helpers/sheet.js'
import { getSetting, setSetting, snapshotSettings, restoreSettings } from './helpers/world.js'

// Changing an existing actor's Actor Type. The merge itself is covered by
// test/actorTypeChangeLogic.test.js; what only a real Foundry can show is that the pencil is
// GM-only, that the picker comes back with the actor's current type preselected, and that
// confirming actually rewrites system.actorType on the document — including dropping what the old
// type had, which depends on the unset-then-set write the sheet performs.
//
// The fixture type is a clone of the ACTOR'S OWN snapshot under a new id and name, so every trait
// id lines up. That is what a derived Actor Type looks like to this code (inheritance preserves
// the parent's ids), and it makes "the actor keeps its dice" an exact assertion rather than a
// sampled one.

const ACTOR = 'Amanda Singh'
const NEW_TYPE_ID = '_e2e-swapped'
const NEW_TYPE_NAME = 'E2E Swapped Type'

const editButton = page => page.locator(`${SHEET} button.actor-type-edit`)
const typeSelect = page => page.locator(`${SHEET} select.actor-type-select`)

/** The actor's actorType snapshot, cloned as a new Actor Type, appended to the setting. */
async function seedClonedType(page, actorName, { hasPlotPoints } = {}) {
  return page.evaluate(
    async ({ name, id, typeName, plotPoints }) => {
      const actor = window.game.actors.getName(name)
      const clone = window.foundry.utils.deepClone(actor.system.actorType)

      delete clone.traitSetEdit
      delete clone.parentId

      const actorTypes = window.game.settings.get('cortexprime-ext', 'actorTypes')
      const index = Object.keys(actorTypes).length

      await window.game.settings.set('cortexprime-ext', 'actorTypes', {
        ...actorTypes,
        [index]: {
          ...clone,
          id,
          name: typeName,
          ...(plotPoints === undefined ? {} : { hasPlotPoints: plotPoints })
        }
      })

      return String(index)
    },
    { name: actorName, id: NEW_TYPE_ID, typeName: NEW_TYPE_NAME, plotPoints: hasPlotPoints }
  )
}

/** The setting key of the Actor Type the actor currently carries. */
async function currentTypeIndex(page, actorName) {
  return page.evaluate(name => {
    const currentId = window.game.actors.getName(name).system.actorType?.id
    const actorTypes = window.game.settings.get('cortexprime-ext', 'actorTypes')

    return Object.keys(actorTypes).find(key => actorTypes[key].id === currentId) ?? null
  }, actorName)
}

// Restores with the same unset-then-set the sheet uses, so keys the test's type added don't
// survive Foundry's update() merge and linger on the actor.
async function restoreActorType(page, actorName, actorType, ppValue) {
  await page.evaluate(
    async ({ name, type, pp }) => {
      const actor = window.game.actors.getName(name)
      await actor.update({ 'system.-=actorType': null })
      await actor.update({ 'system.actorType': type, 'system.pp.value': pp })
    },
    { name: actorName, type: actorType, pp: ppValue }
  )
}

test('the change-actor-type pencil is offered to the GM and not to the player', async ({ browser }) => {
  const gm = await openAs(browser, 'gm')
  const player1 = await openAs(browser, 'player1')

  try {
    await openActorSheet(gm.page, ACTOR)
    await openActorSheet(player1.page, ACTOR)

    await expect(editButton(gm.page)).toHaveCount(1)
    await expect(editButton(player1.page)).toHaveCount(0)

    // The player still sees the type, just not the affordance to change it.
    await expect(player1.page.locator(`${SHEET} .descriptor-label-cpt`).first()).toBeVisible()
  } finally {
    await gm.context.close()
    await player1.context.close()
  }
})

test('the pencil reopens the picker with the actor\'s current type preselected', async ({ browser }) => {
  const gm = await openAs(browser, 'gm')

  try {
    const expected = await currentTypeIndex(gm.page, ACTOR)
    test.skip(expected === null, `${ACTOR}'s actor type is not among the configured actor types`)

    await openActorSheet(gm.page, ACTOR)

    await expect(typeSelect(gm.page)).toHaveCount(0)

    await editButton(gm.page).click()

    await expect(typeSelect(gm.page)).toBeVisible()
    await expect(typeSelect(gm.page)).toHaveValue(expected)

    // Foundry caches the sheet instance, so closing without confirming has to forget the picker
    // rather than reopening into it.
    await closeAllSheets(gm.page)
    await openActorSheet(gm.page, ACTOR)

    await expect(typeSelect(gm.page)).toHaveCount(0)
    await expect(editButton(gm.page)).toHaveCount(1)
  } finally {
    await gm.context.close()
  }
})

test('confirming a new actor type rewrites the actor, keeping the dice the two types share', async ({ browser }) => {
  const gm = await openAs(browser, 'gm')

  const beforeSettings = await snapshotSettings(gm.page, ['actorTypes'])
  const beforeType = await getActorPath(gm.page, ACTOR, 'system.actorType')
  const beforePp = await getActorPath(gm.page, ACTOR, 'system.pp.value')
  const beforeImg = await getActorPath(gm.page, ACTOR, 'img')

  try {
    const index = await seedClonedType(gm.page, ACTOR)

    await openActorSheet(gm.page, ACTOR)
    await editButton(gm.page).click()

    await typeSelect(gm.page).selectOption(index)
    await gm.page.locator(`${SHEET} button.actor-type-confirm`).click()

    // The document is the witness: the sheet re-renders off it either way.
    await expect
      .poll(async () => (await getActorPath(gm.page, ACTOR, 'system.actorType'))?.id)
      .toBe(NEW_TYPE_ID)

    const after = await getActorPath(gm.page, ACTOR, 'system.actorType')

    expect(after.name).toBe(NEW_TYPE_NAME)
    // Every trait id lines up, so nothing the player filled in should have moved.
    expect(after.traitSets).toEqual(beforeType.traitSets)
    expect(after.simpleTraits).toEqual(beforeType.simpleTraits)

    // Neither the portrait nor the Plot Points are touched by a change of type.
    expect(await getActorPath(gm.page, ACTOR, 'img')).toBe(beforeImg)
    expect(await getActorPath(gm.page, ACTOR, 'system.pp.value')).toBe(beforePp)

    // The picker is gone and the sidebar is showing the new type.
    await expect(typeSelect(gm.page)).toHaveCount(0)
    await expect(gm.page.locator(SHEET)).toContainText(NEW_TYPE_NAME)
  } finally {
    await restoreActorType(gm.page, ACTOR, beforeType, beforePp)
    await restoreSettings(gm.page, beforeSettings)
    await gm.context.close()
  }
})

test('switching to a type without Plot Points zeroes the actor\'s pool', async ({ browser }) => {
  const gm = await openAs(browser, 'gm')

  const beforeSettings = await snapshotSettings(gm.page, ['actorTypes'])
  const beforeType = await getActorPath(gm.page, ACTOR, 'system.actorType')
  const beforePp = await getActorPath(gm.page, ACTOR, 'system.pp.value')

  try {
    test.skip(!beforeType?.hasPlotPoints, `${ACTOR}'s actor type has no Plot Points to lose`)

    // Give the actor something to lose, so a zero afterwards is meaningful.
    await gm.page.evaluate(async name => {
      await window.game.actors.getName(name).update({ 'system.pp.value': 3 })
    }, ACTOR)

    const index = await seedClonedType(gm.page, ACTOR, { hasPlotPoints: false })

    await openActorSheet(gm.page, ACTOR)
    await editButton(gm.page).click()

    await typeSelect(gm.page).selectOption(index)
    await gm.page.locator(`${SHEET} button.actor-type-confirm`).click()

    await expect
      .poll(async () => await getActorPath(gm.page, ACTOR, 'system.pp.value'))
      .toBe(0)
  } finally {
    await restoreActorType(gm.page, ACTOR, beforeType, beforePp)
    await restoreSettings(gm.page, beforeSettings)
    await gm.context.close()
  }
})
