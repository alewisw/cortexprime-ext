import { test, expect } from '@playwright/test'
import { openAs, ROLE_USERS } from './foundry.js'
import { getSetting, setSetting, snapshotSettings, restoreSettings, userIdByName } from './helpers/world.js'
import { closeOpenApps } from './helpers/apps.js'
import { openActorSheet, closeAllSheets, getActorPath, updateActor } from './helpers/sheet.js'

// An Additional Tab flagged "Only visible to player and GM" (ownerOnly) renders only for users
// with Owner permission on the actor. The rule itself is unit tested in
// test/additionalTabVisibilityLogic.test.js; what only shows up here is the settings checkbox
// actually saving, and the sheet template honouring the flag per user.
//
// Amanda Singh is owned by player1 (global-setup). player2 is temporarily made an Observer on
// her so there is a non-owner who can still open the sheet, then put back in a finally.

const ACTOR = 'Amanda Singh'
const APP = '#actor-settings'
const SETTINGS_KEYS = ['actorTypes', 'actorBreadcrumbs']

const visibleArticle = (page, selector) => page.locator(`${APP} ${selector}.view:not(.hide)`)

const FIXTURE = {
  id: '_e2e-owner-only',
  name: 'E2E Owner Only',
  traitSets: {},
  simpleTraits: {},
  additionalTabs: {
    0: { id: '_e2e-tab', name: 'E2E Secrets', defaultNotes: {} }
  }
}

async function openActorSettings(page) {
  await page.evaluate(() => {
    const menu = window.game.settings.menus.get('cortexprime-ext.ActorSettings')
    new menu.type().render(true)
  })

  await page.locator(APP).waitFor({ state: 'visible' })
}

// Makes player2 an Observer on ACTOR and returns what to restore afterwards.
async function grantObserver(gmPage) {
  const player2Id = await userIdByName(gmPage, ROLE_USERS.player2)
  const previous = await getActorPath(gmPage, ACTOR, `ownership.${player2Id}`)

  await gmPage.evaluate(
    async ({ name, id }) => {
      const actor = window.game.actors.getName(name)
      await actor.update({ [`ownership.${id}`]: window.CONST.DOCUMENT_OWNERSHIP_LEVELS.OBSERVER })
    },
    { name: ACTOR, id: player2Id }
  )

  return { player2Id, previous }
}

// Puts the tab's ownerOnly back as it was - removed outright if it was never set, rather than
// leaving a stray `false` on the actor.
async function restoreFlag(gmPage, tabIndex, original) {
  const base = `system.actorType.additionalTabs.${tabIndex}`
  await updateActor(gmPage, ACTOR, original === undefined ? { [`${base}.-=ownerOnly`]: null } : { [`${base}.ownerOnly`]: original })
}

async function restoreOwnership(gmPage, { player2Id, previous }) {
  await updateActor(
    gmPage,
    ACTOR,
    previous === null ? { [`ownership.-=${player2Id}`]: null } : { [`ownership.${player2Id}`]: previous }
  )
}

test('the Only visible to player and GM checkbox saves to the Actor Type', async ({ browser }) => {
  const gm = await openAs(browser, 'gm')
  const before = await snapshotSettings(gm.page, SETTINGS_KEYS)

  try {
    await setSetting(gm.page, 'actorTypes', { 0: FIXTURE })
    await setSetting(gm.page, 'actorBreadcrumbs', { 0: { active: true, name: 'ActorTypes', localize: true, target: 'actorTypes' } })

    await openActorSettings(gm.page)
    await gm.page.locator(`${APP} button.view-change[data-to="actorType-0"]`).click()
    await gm.page.locator(`${APP} button.view-change[data-to="additionalTab-0-0"]`).click()

    const checkbox = visibleArticle(gm.page, 'article.additional-tab')
      .locator('input[name="actorTypes.0.additionalTabs.0.ownerOnly"]')

    await checkbox.check()
    await expect
      .poll(async () => (await getSetting(gm.page, 'actorTypes'))[0].additionalTabs[0].ownerOnly)
      .toBe(true)

    await checkbox.uncheck()
    await expect
      .poll(async () => (await getSetting(gm.page, 'actorTypes'))[0].additionalTabs[0].ownerOnly)
      .toBe(false)
  } finally {
    await closeOpenApps(gm.page, { id: 'actor-settings' })
    await restoreSettings(gm.page, before)
    await gm.context.close()
  }
})

test('an owner-only tab is shown to the GM and owning player but hidden from an observer', async ({ browser }) => {
  const gm = await openAs(browser, 'gm')

  const tabs = await getActorPath(gm.page, ACTOR, 'system.actorType.additionalTabs')
  const tabEntries = Object.entries(tabs ?? {})
  test.skip(tabEntries.length === 0, `${ACTOR}'s actor type has no additional tabs configured`)

  const player1 = await openAs(browser, 'player1')
  const player2 = await openAs(browser, 'player2')

  const [tabIndex, tab] = tabEntries[0]
  const flagPath = `system.actorType.additionalTabs.${tabIndex}.ownerOnly`
  const otherIds = tabEntries.slice(1).filter(([, t]) => !t.ownerOnly).map(([, t]) => t.id)
  let ownership

  try {
    ownership = await grantObserver(gm.page)
    await updateActor(gm.page, ACTOR, { [flagPath]: true })

    for (const { page } of [gm, player1]) {
      const sheet = await openActorSheet(page, ACTOR)
      await expect(sheet.locator(`nav.sheet-tabs a.item[data-tab="${tab.id}"]`)).toHaveCount(1)
      await expect(sheet.locator(`section.tab[data-tab="${tab.id}"]`)).toHaveCount(1)
    }

    const sheet = await openActorSheet(player2.page, ACTOR)
    await expect(sheet.locator(`nav.sheet-tabs a.item[data-tab="${tab.id}"]`)).toHaveCount(0)
    await expect(sheet.locator(`section.tab[data-tab="${tab.id}"]`)).toHaveCount(0)

    // Only the flagged tab goes - Traits and any other tab stay.
    await expect(sheet.locator('nav.sheet-tabs a.item[data-tab="traits"]')).toHaveCount(1)
    for (const id of otherIds) {
      await expect(sheet.locator(`nav.sheet-tabs a.item[data-tab="${id}"]`)).toHaveCount(1)
    }
  } finally {
    await restoreFlag(gm.page, tabIndex, tab.ownerOnly)
    if (ownership) await restoreOwnership(gm.page, ownership)
    for (const { page } of [gm, player1, player2]) await closeAllSheets(page)
    await gm.context.close()
    await player1.context.close()
    await player2.context.close()
  }
})

test('an observer viewing a tab when it becomes owner-only falls back to Traits', async ({ browser }) => {
  const gm = await openAs(browser, 'gm')

  const tabs = await getActorPath(gm.page, ACTOR, 'system.actorType.additionalTabs')
  const tabEntries = Object.entries(tabs ?? {})
  test.skip(tabEntries.length === 0, `${ACTOR}'s actor type has no additional tabs configured`)

  const player2 = await openAs(browser, 'player2')

  const [tabIndex, tab] = tabEntries[0]
  const flagPath = `system.actorType.additionalTabs.${tabIndex}.ownerOnly`
  let ownership

  try {
    ownership = await grantObserver(gm.page)
    await updateActor(gm.page, ACTOR, { [flagPath]: false })

    const sheet = await openActorSheet(player2.page, ACTOR)
    await sheet.locator(`nav.sheet-tabs a.item[data-tab="${tab.id}"]`).click()
    await expect(sheet.locator(`section.tab[data-tab="${tab.id}"]`)).toHaveClass(/active/)

    await updateActor(gm.page, ACTOR, { [flagPath]: true })

    await expect(sheet.locator(`nav.sheet-tabs a.item[data-tab="${tab.id}"]`)).toHaveCount(0)
    await expect(sheet.locator('article.tab[data-tab="traits"]')).toHaveClass(/active/)
  } finally {
    await restoreFlag(gm.page, tabIndex, tab.ownerOnly)
    if (ownership) await restoreOwnership(gm.page, ownership)
    for (const { page } of [gm, player2]) await closeAllSheets(page)
    await gm.context.close()
    await player2.context.close()
  }
})
