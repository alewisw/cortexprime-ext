// Durable settings snapshots.
//
// Specs replace real world settings for their duration and put them back in a `finally`. That
// pattern has one failure mode, and it has cost real data twice: when a test times out, Playwright
// tears the browser context down, so the `finally`'s page.evaluate throws "Target page, context or
// browser has been closed" and the restore never happens. The world keeps the test's fixture — in
// one case that meant every Actor Type in the world replaced by a two-entry stub.
//
// The snapshot itself was never the problem: snapshotSettings returns its data into Node, so the
// values are sitting right there. What was missing is a way to write them back once the page they
// were read through is gone. So this module adds two things:
//
//   1. a rescue path — if the original page is dead, open a fresh authenticated one and restore
//      through that instead;
//   2. a file on disk, written at snapshot time and deleted only once the restore has actually
//      succeeded, so that even a crashed worker (which loses the Node value too) leaves the
//      original values recoverable. global-setup replays any leftovers before the next run.

import { chromium } from '@playwright/test'
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

import { authFile } from '../foundry.js'

const NS = 'cortexprime-ext'
const DIR = fileURLToPath(new URL('../.snapshots', import.meta.url))
const FOUNDRY_URL = process.env.FOUNDRY_URL || 'http://localhost:30000'

let counter = 0

/** Where a pending snapshot's values live until the restore succeeds. */
function snapshotPath (label) {
  return path.join(DIR, `${label}.json`)
}

function writeSnapshotFile (data) {
  mkdirSync(DIR, { recursive: true })

  const label = `${Date.now()}-${process.pid}-${++counter}`

  writeFileSync(snapshotPath(label), JSON.stringify({ takenAt: new Date().toISOString(), data }, null, 2))

  return label
}

function deleteSnapshotFile (label) {
  if (!label) return

  try {
    rmSync(snapshotPath(label), { force: true })
  } catch {
    // A leftover file is harmless — global-setup replays it and removes it then.
  }
}

/** Writes the values through whichever page is given. */
async function applySettings (page, data) {
  await page.evaluate(async ({ ns, snap }) => {
    for (const [key, value] of Object.entries(snap)) {
      await window.game.settings.set(ns, key, value)
    }
  }, { ns: NS, snap: data })
}

/**
 * A fresh, logged-in GM page, for restoring when the spec's own page is gone.
 *
 * Reuses the browser the dead page belonged to when it is still alive (the usual case: the
 * CONTEXT is closed, not the browser), and launches a new one only when it is not.
 */
async function withRescuePage (deadPage, fn) {
  let browser = null
  let launched = false

  try {
    browser = deadPage?.context()?.browser() ?? null
    if (browser && !browser.isConnected()) browser = null
  } catch {
    browser = null
  }

  if (!browser) {
    browser = await chromium.launch()
    launched = true
  }

  const context = await browser.newContext({
    storageState: authFile('gm'),
    viewport: { width: 1366, height: 768 }
  })

  try {
    const page = await context.newPage()

    await page.goto(`${FOUNDRY_URL}/game`)
    await page.waitForFunction(() => window.game?.ready === true, null, { timeout: 60_000 })

    return await fn(page)
  } finally {
    await context.close().catch(() => {})
    if (launched) await browser.close().catch(() => {})
  }
}

/**
 * Reads the given setting keys and records them on disk.
 *
 * Returns the plain values, so callers keep using them exactly as before. The disk file's label
 * rides along as a non-enumerable property, which keeps it out of anything that iterates the
 * snapshot (restore included) while still letting restoreSettings clear the file afterwards.
 */
export async function snapshotSettings (page, keys) {
  const data = await page.evaluate(
    ({ ns, ks }) => Object.fromEntries(ks.map(k => [k, window.game.settings.get(ns, k)])),
    { ns: NS, ks: keys }
  )

  Object.defineProperty(data, '__snapshotLabel', {
    value: writeSnapshotFile(data),
    enumerable: false
  })

  return data
}

/**
 * Puts a snapshot back, through the spec's own page when it still works and through a freshly
 * opened one when it does not. Only deletes the on-disk copy once a write has actually succeeded.
 */
export async function restoreSettings (page, snapshot) {
  const label = snapshot?.__snapshotLabel

  try {
    await applySettings(page, snapshot)
    deleteSnapshotFile(label)

    return
  } catch (error) {
    console.warn(
      `\n  [snapshot] restoring through this spec's own page failed (${error.message.split('\n')[0]}).` +
      '\n  [snapshot] opening a rescue session so the world is not left holding test fixtures.'
    )
  }

  try {
    await withRescuePage(page, rescue => applySettings(rescue, snapshot))
    deleteSnapshotFile(label)
    console.warn('  [snapshot] restored via rescue session.\n')
  } catch (error) {
    // Deliberately keeps the file: global-setup replays it before the next run.
    console.error(
      `  [snapshot] RESCUE RESTORE FAILED: ${error.message.split('\n')[0]}` +
      `\n  [snapshot] world settings are still holding this spec's fixture.` +
      `\n  [snapshot] values kept at e2e/.snapshots/${label}.json and will be replayed by global setup.\n`
    )
  }
}

/** Snapshots whose restore never completed, oldest first. */
export function pendingSnapshots () {
  if (!existsSync(DIR)) return []

  return readdirSync(DIR)
    .filter(name => name.endsWith('.json'))
    .sort()
    .map(name => {
      const label = name.replace(/\.json$/, '')

      try {
        return { label, ...JSON.parse(readFileSync(path.join(DIR, name), 'utf8')) }
      } catch {
        return { label, data: null }
      }
    })
}

/**
 * Replays any snapshot whose restore never completed. Called by global setup, so a run that was
 * killed mid-test cannot silently leave the next one measuring against its fixture.
 */
export async function replayPendingSnapshots (page) {
  const pending = pendingSnapshots()

  if (!pending.length) return 0

  console.warn(`\n[snapshot] ${pending.length} snapshot(s) from an earlier run were never restored.`)

  let replayed = 0

  for (const { label, data, takenAt } of pending) {
    if (!data) {
      console.warn(`[snapshot]   ${label}: unreadable, leaving in place`)
      continue
    }

    try {
      await applySettings(page, data)
      deleteSnapshotFile(label)
      replayed += 1
      console.warn(`[snapshot]   restored ${Object.keys(data).join(', ')} (taken ${takenAt})`)
    } catch (error) {
      console.error(`[snapshot]   ${label}: replay failed - ${error.message.split('\n')[0]}`)
    }
  }

  console.warn('')

  return replayed
}
