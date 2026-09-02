import { test, expect } from '@playwright/test'
import { openAs } from './foundry.js'
import { getSetting, setSetting, snapshotSettings, restoreSettings } from './helpers/world.js'
import { closeOpenApps } from './helpers/apps.js'

// Actor Type inheritance is a settings-form feature, and the half a unit test can't reach is the
// locking: applyActorTypeInheritance is covered in test/actorTypeInheritanceLogic.test.js, but
// whether the rendered form actually refuses to edit an inherited field — and still lets the
// child add its own — only shows up in a real browser against a real Foundry.
//
// These specs replace the world's actorTypes for their duration with a known two-type fixture and
// put the original back in a finally. Existing actors are unaffected: each one carries its own
// snapshot of its Actor Type in system.actorType.

const SETTINGS_KEYS = ['actorTypes', 'actorBreadcrumbs']
const APP = '#actor-settings'

// The article for a given view id, and only when it's the one on screen — every view is rendered
// at once and hidden with .hide (see the viewClasses Handlebars helper).
const visibleArticle = (page, selector) => page.locator(`${APP} ${selector}.view:not(.hide)`)

const PARENT = {
  id: '_e2e-parent',
  name: 'E2E Parent',
  showProfileImage: true,
  hasComplications: true,
  traitSets: {
    0: {
      id: '_e2e-set',
      label: 'E2E Traits',
      settings: { hasDice: true, hasMultipleDice: true },
      traits: { 0: { id: '_e2e-trait', name: 'E2E Grit', dice: { value: { 0: '8' } } } }
    }
  },
  simpleTraits: {},
  additionalTabs: {
    0: {
      id: '_e2e-tab',
      name: 'E2E Notes',
      description: '<p>E2E tab description.</p>',
      defaultNotes: { 0: { label: 'E2E Section', locked: false, value: null } }
    }
  }
}

async function openActorSettings(page) {
  await page.evaluate(() => {
    const menu = window.game.settings.menus.get('cortexprime-ext.ActorSettings')
    new menu.type().render(true)
  })

  await page.locator(APP).waitFor({ state: 'visible' })
}

async function closeActorSettings(page) {
  await closeOpenApps(page, { id: 'actor-settings' })
}

// Seeds the fixture, opens the form and drills into the parent Actor Type.
async function openParent(page) {
  await setSetting(page, 'actorTypes', { 0: PARENT })
  await setSetting(page, 'actorBreadcrumbs', { 0: { active: true, name: 'ActorTypes', localize: true, target: 'actorTypes' } })

  await openActorSettings(page)
  await page.locator(`${APP} button.view-change[data-to="actorType-0"]`).click()

  await expect(visibleArticle(page, 'article.actor-type')).toHaveCount(1)
}

// Adds a derived type off the open parent view; the form navigates into it (index 1).
async function addDerived(page) {
  await page.locator(`${APP} button.add-derived-actor-type[data-actor-type-id="${PARENT.id}"]`).click()

  await expect
    .poll(async () => (await getSetting(page, 'actorTypes'))[1]?.parentId)
    .toBe(PARENT.id)
}

test('derived actor type shows parent fields disabled', async ({ browser }) => {
  const gm = await openAs(browser, 'gm')
  const before = await snapshotSettings(gm.page, SETTINGS_KEYS)

  try {
    await openParent(gm.page)
    await addDerived(gm.page)

    const child = (await getSetting(gm.page, 'actorTypes'))[1]

    // The whole parent is materialized onto the child, every element stamped.
    expect(child.hasComplications).toBe(true)
    expect(child.traitSets[0].inherited).toBe(true)
    expect(child.traitSets[0].traits[0].inherited).toBe(true)
    expect(child.additionalTabs[0].defaultNotes[0].inherited).toBe(true)

    const article = visibleArticle(gm.page, 'article.actor-type')

    // Name is the one thing a derived type owns...
    await expect(article.locator('input[name="actorTypes.1.name"]')).toBeEnabled()

    // ...everything else is the parent's.
    await expect(article.locator('input[name="actorTypes.1.hasComplications"]')).toBeDisabled()
    await expect(article.locator('input[name="actorTypes.1.showProfileImage"]')).toBeDisabled()

    // Inherited rows keep their edit button but lose reorder/duplicate/remove.
    const inheritedRow = article.locator('li.inherited-row').first()
    await expect(inheritedRow.locator('button.view-change')).toHaveCount(1)
    await expect(inheritedRow.locator('.reorder, .duplicate-item, .remove-item')).toHaveCount(0)

    // A derived type can't be a parent — the section that creates one isn't offered.
    await expect(article.locator('button.add-derived-actor-type')).toHaveCount(0)
  } finally {
    await closeActorSettings(gm.page)
    await restoreSettings(gm.page, before)
    await gm.context.close()
  }
})

test('a derived actor type\'s Additional Tab description is locked to the parent\'s', async ({ browser }) => {
  const gm = await openAs(browser, 'gm')
  const before = await snapshotSettings(gm.page, SETTINGS_KEYS)

  try {
    await openParent(gm.page)

    // The parent's own tab: description is editable, so Foundry's editor offers its edit button.
    await gm.page.locator(`${APP} button.view-change[data-to="additionalTab-0-0"]`).click()

    const parentTab = visibleArticle(gm.page, 'article.additional-tab')
    await expect(parentTab.locator('.additional-tab-description .editor-content')).toContainText('E2E tab description.')
    await expect(parentTab.locator('.additional-tab-description .editor-edit')).toHaveCount(1)

    // Back up to the parent's own view, then create the derived type from there.
    await gm.page.locator(`${APP} .breadcrumb[data-to="actorType-0"]`).click()
    await addDerived(gm.page)

    // The stamped copy on the derived type: same text, but the inherited-fields sweep disables
    // editing it directly - Foundry's editor renders no edit affordance at all in that mode.
    await gm.page.locator(`${APP} button.view-change[data-to="additionalTab-1-0"]`).click()

    const childTab = visibleArticle(gm.page, 'article.additional-tab')
    await expect(childTab.locator('.additional-tab-description .editor-content')).toContainText('E2E tab description.')
    await expect(childTab.locator('.additional-tab-description .editor-edit')).toHaveCount(0)
  } finally {
    await closeActorSettings(gm.page)
    await restoreSettings(gm.page, before)
    await gm.context.close()
  }
})

test('derived actor type can add its own trait set', async ({ browser }) => {
  const gm = await openAs(browser, 'gm')
  const before = await snapshotSettings(gm.page, SETTINGS_KEYS)

  try {
    await openParent(gm.page)
    await addDerived(gm.page)

    await visibleArticle(gm.page, 'article.actor-type')
      .locator('button.add-trait-set[data-actor-type="1"]')
      .click()

    await expect
      .poll(async () => Object.keys((await getSetting(gm.page, 'actorTypes'))[1].traitSets).length)
      .toBe(2)

    const child = (await getSetting(gm.page, 'actorTypes'))[1]

    // The parent's set stays first and stamped; the child's own is appended, unstamped and
    // therefore editable.
    expect(child.traitSets[0].id).toBe('_e2e-set')
    expect(child.traitSets[0].inherited).toBe(true)
    expect(child.traitSets[1].inherited).toBeUndefined()
  } finally {
    await closeActorSettings(gm.page)
    await restoreSettings(gm.page, before)
    await gm.context.close()
  }
})

test('parent edit propagates to derived actor type', async ({ browser }) => {
  const gm = await openAs(browser, 'gm')
  const before = await snapshotSettings(gm.page, SETTINGS_KEYS)

  try {
    await openParent(gm.page)
    await addDerived(gm.page)

    // Give the child an addition of its own, so we can prove the parent edit doesn't wipe it.
    await visibleArticle(gm.page, 'article.actor-type')
      .locator('button.add-trait-set[data-actor-type="1"]')
      .click()

    await expect
      .poll(async () => Object.keys((await getSetting(gm.page, 'actorTypes'))[1].traitSets).length)
      .toBe(2)

    // Back to the parent's own Trait Set and rename it through the form.
    await gm.page.locator(`${APP} .breadcrumb[data-to="actorType-0"]`).click()
    await gm.page.locator(`${APP} button.view-change[data-to="traitSet-0-0"]`).click()

    await visibleArticle(gm.page, 'article.trait-set')
      .locator('input[name="actorTypes.0.traitSets.0.label"]')
      .fill('E2E Renamed')

    await gm.page.locator(`${APP} .breadcrumb[data-to="actorType-0"]`).click()

    await expect
      .poll(async () => (await getSetting(gm.page, 'actorTypes'))[1].traitSets[0].label)
      .toBe('E2E Renamed')

    // The child's own Trait Set survived the reconcile.
    const child = (await getSetting(gm.page, 'actorTypes'))[1]
    expect(Object.keys(child.traitSets).length).toBe(2)
    expect(child.traitSets[1].inherited).toBeUndefined()
  } finally {
    await closeActorSettings(gm.page)
    await restoreSettings(gm.page, before)
    await gm.context.close()
  }
})
