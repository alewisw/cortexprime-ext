import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { test, expect } from '@playwright/test'
import { openAs } from './foundry.js'

const systemJsonPath = fileURLToPath(new URL('../system.json', import.meta.url))
const systemManifest = JSON.parse(readFileSync(systemJsonPath, 'utf8'))

test('reads live system state from the GM session set up by global setup', async ({ browser }) => {
  const { context, page } = await openAs(browser, 'gm')

  try {
    const systemId = await page.evaluate(() => window.game.system.id)
    expect(systemId).toBe('cortexprime-ext')

    // Only holds if the running world was launched from this same checkout
    // without a stale, un-reloaded system.json.
    const systemVersion = await page.evaluate(() => window.game.system.version)
    expect(systemVersion).toBe(systemManifest.version)
  } finally {
    await context.close()
  }
})
