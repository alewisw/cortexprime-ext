import { test, expect } from '@playwright/test'
import { openAs } from './foundry.js'
import { TRAY, buildUniformPool, clearPool, closeTray, confirmDialog, openTray, setDieValues } from './helpers/dicePool.js'
import { awaitSetting, clearChallenge, enableTestMode, restoreSettings, snapshotSettings } from './helpers/world.js'
import { closeAllSheets } from './helpers/sheet.js'

// The GM's read-only view of a player's open prompts and current dice pool (promptMirror.js,
// PromptMirrorWindow.js): the player publishes each open prompt onto their own user flag, and the
// GM's Dice Pool tray lists it with a View button that opens a live, sanitised, inert copy. The
// player's pool already lives on a user flag, so the tray lists it at any stage of a challenge -
// including before anyone, the GM included, has rolled.

const ACTOR = 'Amanda Singh'
const WRITES = ['activeChallenge', 'lastGmRoll', 'testModeSelectDiceValues']
const MIRROR = '[id^="prompt-mirror-"]'

const promptRow = (gmPage, text) => gmPage.locator(`${TRAY} .player-prompt-row`).filter({ hasText: ACTOR }).filter({ hasText: text })

async function openMirror (gmPage, text) {
  const row = promptRow(gmPage, text)
  await expect(row).toHaveCount(1, { timeout: 15_000 })
  await row.locator('button.view-prompt').click()

  const mirror = gmPage.locator(MIRROR)
  await expect(mirror).toBeVisible()
  await expect(mirror.locator('.prompt-mirror')).toHaveAttribute('inert', '')

  return mirror
}

async function setup (browser) {
  const gm = await openAs(browser, 'gm')
  const player1 = await openAs(browser, 'player1')
  const before = await snapshotSettings(gm.page, WRITES)

  await clearChallenge(gm.page)
  await openTray(gm.page)

  return { gm, player1, before }
}

async function teardown ({ gm, player1, before }) {
  await clearPool(player1.page)
  await player1.page.evaluate(() => window.game.user.unsetFlag('cortexprime-ext', 'promptMirror'))
  await restoreSettings(gm.page, before)
  await gm.context.close()
  await player1.context.close()
}

test('a player\'s dice pool shows read-only in the GM tray before anyone has rolled', async ({ browser }) => {
  const session = await setup(browser)
  const { gm, player1 } = session

  try {
    await buildUniformPool(player1.page, { count: 2, face: 8, prefix: 'Mirror Die' })

    const row = gm.page.locator(`${TRAY} .player-pool-row`).filter({ hasText: ACTOR })
    await expect(row).toHaveCount(1)
    await expect(row).toContainText('Mirror Die 1')
    await expect(row).toContainText('Mirror Die 2')
    await expect(row.locator('.player-pool-entry')).toHaveCount(2)

    // Live in the other direction too: emptying the pool drops the row.
    await clearPool(player1.page)
    await expect(row).toHaveCount(0)
  } finally {
    await teardown(session)
  }
})

test('the GM can open a live, read-only copy of a player\'s Select Your Dice picker', async ({ browser }) => {
  const session = await setup(browser)
  const { gm, player1 } = session

  try {
    await enableTestMode(gm.page)
    await awaitSetting(player1.page, 'testModeSelectDiceValues', true)

    await buildUniformPool(player1.page, { count: 3, face: 6, prefix: 'Mirror Die' })
    await player1.page.locator(`${TRAY} button.roll-dice-pool`).first().click()

    const picker = player1.page.locator('.window-content .cortexprime.dice-picker')
    await picker.waitFor({ state: 'visible', timeout: 15_000 })
    await closeTray(player1.page)
    await setDieValues(player1.page, [5, 4, 3])

    const mirror = await openMirror(gm.page, 'Select Your Dice')
    const results = page => page.$$eval(`${page === gm.page ? MIRROR : '.window-content .cortexprime.dice-picker'} .result-die`, dice => dice.map(die => Number(die.dataset.result)).sort())

    await expect.poll(() => results(gm.page)).toEqual([3, 4, 5])

    // The player changes their dice; the GM's copy follows.
    await setDieValues(player1.page, [6, 4, 3])
    await expect.poll(() => results(gm.page)).toEqual([3, 4, 6])

    // Confirming closes the player's picker, and with it the GM's row and copy.
    await confirmDialog(player1.page)
    await picker.waitFor({ state: 'detached', timeout: 15_000 })

    await expect(promptRow(gm.page, 'Select Your Dice')).toHaveCount(0)
    await expect(mirror).toHaveCount(0)
  } finally {
    await teardown(session)
  }
})

test('the Plot Point usage prompt is mirrored to the GM', async ({ browser }) => {
  const session = await setup(browser)
  const { gm, player1 } = session

  try {
    // Opened the way the sheet's Spend button opens it; Cancel means nothing is spent.
    player1.page.evaluate(name => {
      window.game.actors.getName(name).sheet._spendPp({ preventDefault () {} })
    }, ACTOR).catch(() => {})

    // The window root, not the template's inner div that carries the same class.
    const prompt = player1.page.locator('.application.plot-point-use-dialog')
    await expect(prompt).toBeVisible({ timeout: 15_000 })

    const mirror = await openMirror(gm.page, '')
    const options = await prompt.locator('.plot-point-use-option').count()
    await expect(mirror.locator('.plot-point-use-option')).toHaveCount(options)

    await prompt.locator('button[data-action="cancel"]').click()
    await expect(promptRow(gm.page, '')).toHaveCount(0)
    await expect(mirror).toHaveCount(0)
  } finally {
    await closeAllSheets(player1.page)
    await teardown(session)
  }
})

test('the Paradox prompt is mirrored to the GM, including the player\'s choices', async ({ browser }) => {
  const session = await setup(browser)
  const { gm, player1 } = session

  try {
    // Opened directly rather than through a real Paradox roll: this is about mirroring the window,
    // and closing it without Confirm writes nothing.
    await player1.page.evaluate(async name => {
      const { ParadoxDialog } = await import('/systems/cortexprime-ext/module/applications/ParadoxDialog.js')
      const actor = window.game.actors.getName(name)

      new ParadoxDialog({
        actor,
        pending: { rolledAt: Date.now(), log: { inputs: [], steps: [] }, finalParadox: 6, finalTrauma: null, descendIntoQuiet: false, limitState: 'available' }
      }).render(true)
    }, ACTOR)

    const prompt = player1.page.locator('[id^="paradox-dialog-"]')
    await expect(prompt).toBeVisible({ timeout: 15_000 })

    const mirror = await openMirror(gm.page, '')
    await expect(mirror.locator('.paradox-limit-checkbox')).toHaveCount(1)
    await expect(mirror.locator('.paradox-limit-checkbox')).not.toBeChecked()

    // Ticking the box on the player's side shows up ticked in the GM's copy.
    await prompt.locator('.paradox-limit-checkbox').check()
    await expect(mirror.locator('.paradox-limit-checkbox')).toBeChecked()

    await player1.page.evaluate(() => {
      for (const app of window.foundry.applications.instances.values()) if (app.id?.startsWith('paradox-dialog-')) app.close()
    })
    await expect(mirror).toHaveCount(0)
  } finally {
    await teardown(session)
  }
})

test('a malicious prompt snapshot is sanitised on the GM\'s side and never runs', async ({ browser }) => {
  const session = await setup(browser)
  const { gm, player1 } = session

  try {
    // Written straight to the flag, as a hostile player could from the console.
    await player1.page.evaluate(() => window.game.user.setFlag('cortexprime-ext', 'promptMirror.evil', {
      kind: 'dice-picker',
      title: 'Evil',
      updatedAt: Date.now(),
      html: '<img src="x" onerror="window.__pwned = 1"><script>window.__pwned = 2</script>' +
        '<p class="evil-marker" onclick="window.__pwned = 3" id="hijack">hello</p>' +
        '<iframe src="javascript:window.top.__pwned = 4"></iframe><a href="javascript:alert(1)">link</a>'
    }))

    const mirror = await openMirror(gm.page, 'Evil')

    await expect(mirror.locator('.evil-marker')).toHaveText('hello')
    await expect(mirror.locator('script, iframe')).toHaveCount(0)
    expect(await mirror.locator('.prompt-mirror').evaluate(root =>
      [...root.querySelectorAll('*')].flatMap(el => [...el.attributes].map(a => a.name))
        .filter(name => name.startsWith('on') || name === 'id' || name === 'href'))).toEqual([])

    await gm.page.waitForTimeout(1000)
    expect(await gm.page.evaluate(() => window.__pwned ?? null)).toBeNull()
  } finally {
    await teardown(session)
  }
})
