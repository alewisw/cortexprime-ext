import path from 'node:path'
import { fileURLToPath } from 'node:url'

const FOUNDRY_URL_DEFAULT = 'http://localhost:30000'
const VIEWPORT = { width: 1366, height: 768 }
const AUTH_DIR = fileURLToPath(new URL('../.auth', import.meta.url))

// Central mapping of short role names (used by tests and global-setup) to
// the real Foundry user names — the dedicated no-password test accounts
// documented in docs/DEVELOPMENT.md ("Test accounts").
export const ROLE_USERS = {
  gm: 'PlaywrightGamemaster',
  player1: 'PlaywrightPlayer1',
  player2: 'PlaywrightPlayer2'
}

export function authFile(role) {
  return path.join(AUTH_DIR, `${role}.json`)
}

function foundryUrl() {
  return process.env.FOUNDRY_URL || FOUNDRY_URL_DEFAULT
}

// The "Yendor's Scene Actors" module (installed locally) shows a changelog
// dialog (Documentation, a FormApplication with classes ['yendors-dialog',
// 'scene-actors-selector-documentation']) on ready whenever its "seen
// version" setting is behind the module's current version. That setting is
// client-scoped (browser localStorage), so a fresh Playwright context with
// no localStorage sees it as unseen every time and the dialog reappears,
// sitting on top of the game UI. Close it if present so it can't interfere
// with anything the test does afterward. Uses a short timeout rather than
// an instant check, since the dialog can render a beat after game.ready
// fires; harmless/near-instant when it never shows up.
async function closeYendorsChangelogIfPresent(page) {
  try {
    await page.locator('.window-app.yendors-dialog .header-button.close').click({ timeout: 3_000 })
  } catch {
    // Not shown — nothing to close.
  }
}

/**
 * Opens a new, independent browser context (its own session/cookies) and
 * joins the currently running world as the given user via the real login
 * flow. Used by e2e/global-setup.js to establish each role's session once,
 * before any test runs.
 *
 * Tests themselves should use openAs(browser, role) instead — it restores
 * the storageState global setup already saved, skipping this login flow
 * entirely.
 *
 * Note: Foundry's join screen disables a user's option while they're
 * already connected (see join-form.hbs), so logging in as the *same* user
 * twice concurrently may not work cleanly — use different users instead.
 *
 * Returns { context, page }. Callers are responsible for
 * `await context.close()` when done with that session.
 */
export async function joinAs(browser, { user = ROLE_USERS.gm, password = '' } = {}) {
  const context = await browser.newContext({
    baseURL: foundryUrl(),
    viewport: VIEWPORT
  })
  const page = await context.newPage()

  await page.goto('/join')

  const userSelect = page.locator('select[name="userid"]')
  await userSelect.waitFor({ state: 'visible' })
  await userSelect.selectOption({ label: user })

  if (password) {
    await page.locator('input[name="password"]').fill(password)
  }

  await page.locator('button[name="join"]').click()

  await page.waitForFunction(() => window.game?.ready === true, null, {
    timeout: 60_000
  })

  await closeYendorsChangelogIfPresent(page)

  return { context, page }
}

/**
 * Opens a new browser context restored from the storageState that
 * e2e/global-setup.js saved for the given role ('gm', 'player1', or
 * 'player2') — already logged in, no join-screen flow. Requires global
 * setup to have already run (wired into playwright.config.js's
 * `globalSetup`).
 *
 * Returns { context, page }, with the page already loaded and game.ready.
 * Callers are responsible for `await context.close()`.
 */
export async function openAs(browser, role) {
  const context = await browser.newContext({
    baseURL: foundryUrl(),
    viewport: VIEWPORT,
    storageState: authFile(role)
  })
  const page = await context.newPage()

  await page.goto('/game')

  await page.waitForFunction(() => window.game?.ready === true, null, {
    timeout: 60_000
  })

  await closeYendorsChangelogIfPresent(page)

  return { context, page }
}
