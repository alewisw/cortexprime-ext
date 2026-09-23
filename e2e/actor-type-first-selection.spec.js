import { test, expect } from '@playwright/test'
import { openAs } from './foundry.js'
import { setSetting, snapshotSettings, restoreSettings } from './helpers/world.js'
import { SHEET, closeAllSheets } from './helpers/sheet.js'

const SETTINGS_KEYS = ['actorTypes']

const TAB_ID = '_e2e-first-select-tab'
const DEFAULT_SECTION_LABEL = 'E2E Default Section'

const ACTOR_TYPE = {
  id: '_e2e-first-select-type',
  name: 'E2E First Select Type',
  defaultImage: 'icons/svg/mystery-man.svg',
  showProfileImage: true,
  hasComplications: false,
  hasPlotPoints: false,
  hasAssets: false,
  assetsHaveMultipleDice: true,
  hasHidableTraits: false,
  traitSets: {},
  simpleTraits: {},
  additionalTabs: {
    0: {
      id: TAB_ID,
      name: 'E2E Notes',
      defaultNotes: {
        0: {
          label: DEFAULT_SECTION_LABEL,
          value: '<p>Default content.</p>',
          allowRename: true,
          allowDeletion: true,
          allowEdit: true
        }
      }
    }
  }
}

// Bug: first-time Actor Type selection (_actorTypeConfirm in actor-sheet.js, the `!currentActorType`
// branch) writes the raw actorTypes setting entry straight onto system.actorType. That skips
// mergeActorTypeData entirely - the function (actorTypeChangeLogic.js) whose additionalTabs handling
// is what turns a tab's `defaultNotes` template into the actor's own `notes`. Every OTHER path that
// touches system.actorType (Update Settings, changing Actor Type on an existing actor) goes through
// mergeActorTypeData and gets this for free; only the very first selection on a brand-new actor
// doesn't, so its Additional Tabs render with none of their configured default sections until
// something else re-syncs the actor (e.g. clicking Update Settings in the Actor Settings form).
test('selecting an Actor Type for the first time populates its Additional Tab default sections', async ({ browser }) => {
  const gm = await openAs(browser, 'gm')
  const before = await snapshotSettings(gm.page, SETTINGS_KEYS)
  let actorId = null

  try {
    await setSetting(gm.page, 'actorTypes', { 0: ACTOR_TYPE })

    actorId = await gm.page.evaluate(async () => {
      const actor = await window.game.actors.documentClass.create(
        { name: 'E2E First Select Actor', type: 'character' },
        { renderSheet: false }
      )
      return actor.id
    })

    await gm.page.evaluate(id => window.game.actors.get(id).sheet.render(true), actorId)
    const sheet = gm.page.locator(SHEET).first()
    await sheet.waitFor({ state: 'visible' })

    // Only one Actor Type is configured, so the picker's single option is already selected -
    // straight to Confirm, exactly like a GM setting up a fresh actor for the first time.
    await sheet.locator('button[data-action="actorTypeConfirm"]').click()

    await expect
      .poll(() => gm.page.evaluate(id => window.game.actors.get(id)?.system?.actorType?.id, actorId))
      .toBe(ACTOR_TYPE.id)

    await sheet.locator(`nav.sheet-tabs a.item[data-tab="${TAB_ID}"]`).click()

    const section = sheet.locator(`section.tab[data-tab="${TAB_ID}"] article`)
      .filter({ has: gm.page.locator(`input[value="${DEFAULT_SECTION_LABEL}"]`) })

    await expect(section).toHaveCount(1)
  } finally {
    if (actorId) await gm.page.evaluate(id => window.game.actors.get(id)?.delete(), actorId)
    await closeAllSheets(gm.page)
    await restoreSettings(gm.page, before)
    await gm.context.close()
  }
})
