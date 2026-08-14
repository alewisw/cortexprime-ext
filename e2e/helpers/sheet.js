// Actor sheet helpers.
//
// Important: at the 1366x768 viewport this suite runs at, an opened actor
// sheet is clamped to full height and completely covers the top-center
// floating panel. Any spec that opens a sheet and then needs the panel (or
// the dice pool tray behind it) must close the sheet first — Foundry will
// not reposition it out of the way. Use closeAllSheets() between phases.

export const SHEET = '.window-app.actor-sheet'
const CLOSE = 'a.header-button.close, button.header-control[data-action="close"]'

/** Opens an actor's sheet directly (bypasses whichever button would do it). */
export async function openActorSheet(page, actorName) {
  await page.evaluate(name => {
    const actor = window.game.actors.getName(name)
    if (actor) actor.sheet.render(true)
  }, actorName)

  const sheet = page.locator(SHEET).first()
  await sheet.waitFor({ state: 'visible' })

  return sheet
}

/** Closes every open actor sheet on this client. */
export async function closeAllSheets(page) {
  await page.evaluate(async () => {
    const apps = Object.values(window.ui.windows).filter(app => app.actor)
    for (const app of apps) await app.close()
  })

  await page.locator(SHEET).first().waitFor({ state: 'detached' }).catch(() => {})
}

export function sheetCloseButton(sheet) {
  return sheet.locator(CLOSE).first()
}

/** Reads an actor's data by dotted path, for asserting persistence. */
export async function getActorPath(page, actorName, path) {
  return page.evaluate(
    ({ name, p }) => {
      const actor = window.game.actors.getName(name)
      return actor ? window.foundry.utils.getProperty(actor, p) ?? null : null
    },
    { name: actorName, p: path }
  )
}

export async function updateActor(page, actorName, changes) {
  return page.evaluate(
    async ({ name, data }) => {
      const actor = window.game.actors.getName(name)
      if (actor) await actor.update(data)
    },
    { name: actorName, data: changes }
  )
}
