import { test, expect } from '@playwright/test'
import { openAs } from './foundry.js'
import { SHEET, openActorSheet, closeAllSheets } from './helpers/sheet.js'

const ACTOR = 'Amanda Singh'

// The Traits tab flows its trait sets through a two-column CSS multi-column container. Firefox
// treats `break-inside: avoid` as a hint only, and will still put a column break inside a trait
// set - which renders as a grey band across the section (the sheet background showing through
// the gap between the two fragments), anywhere from under its title to between two traits.
// Chromium honours the hint, so this is only meaningful in the firefox project, but is a valid
// guard in both.
//
// A fragmented box reports one client rect per fragment. Inline elements legitimately report one
// per line they wrap across, so only non-inline boxes count.
async function fragmentedBoxes(page) {
  return page.evaluate(sheetSelector => {
    const found = []

    for (const item of document.querySelectorAll(`${sheetSelector} .columns-2 > .column-item`)) {
      const set = item.querySelector('.section-primary-title-cpt span')?.innerText

      for (const el of [item, ...item.querySelectorAll('*')]) {
        if (el.getClientRects().length > 1 && getComputedStyle(el).display !== 'inline') {
          found.push({ set, box: el.className })
        }
      }
    }

    return found
  }, SHEET)
}

test('trait sets are never split across the Traits tab columns', async ({ browser }) => {
  const gm = await openAs(browser, 'gm')

  try {
    await openActorSheet(gm.page, ACTOR)

    const failures = []
    const check = async label => {
      for (const f of await fragmentedBoxes(gm.page)) failures.push({ at: label, ...f })
    }

    await check('first render')

    // Where the column break lands depends on each column's content height, and in Firefox also
    // on the layout history - the same width can be clean on first render and split after a
    // resize. Sweep the sheet wider and back to cover both.
    const widths = []
    for (let w = 800; w <= 1300; w += 20) widths.push(w)

    for (const w of [...widths, ...[...widths].reverse()]) {
      await gm.page.evaluate(({ name, width }) => {
        window.game.actors.getName(name).sheet.setPosition({ width })
      }, { name: ACTOR, width: w })
      await gm.page.evaluate(() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r))))
      await check(`width ${w}`)
    }

    expect(failures).toEqual([])
  } finally {
    await closeAllSheets(gm.page)
    await gm.context.close()
  }
})
