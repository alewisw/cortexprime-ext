import { readdirSync, readFileSync, statSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

// Foundry's document hooks (updateActor, updateSetting, ...) hand their handler the update *diff*,
// not the document: any key whose value didn't change is stripped before the handler ever sees it.
// Reading state out of that object therefore gives you a record with arbitrary holes in it, and the
// holes depend on what the PREVIOUS write happened to contain.
//
// That cost a long debugging session. module/mage/paradox.js read the roll record out of the diff,
// so a roll that lost right after another roll that lost arrived with no `won` at all — Paradox
// bailed at "no opposition means no Paradox" and fired only when the outcome happened to flip
// between consecutive rolls. module/scripts/hitches.js had the same bug latent in it: two rolls
// with identical dice would have suppressed the Hitches dialog.
//
// The fix in every case is to read the document, which is already updated by the time the hook
// fires: `actor.getFlag('cortexprime-ext', 'lastRoll')`. Using `hasProperty(data, ...)` as the
// *trigger* is still correct and is deliberately not matched here — it asks "did this update touch
// the thing I care about", which is a question about the diff.
//
// This test exists so the next handler to read a diff fails in milliseconds with no Foundry,
// instead of silently doing nothing at the table.
const MODULE_DIR = fileURLToPath(new URL('../module', import.meta.url))

// Paths that are legitimately read from a diff, each with the reason it's safe. Anything else has
// to be justified and added here deliberately, rather than slipping in unnoticed.
const ALLOWED = {
  // Safe by construction: paradox.js writes this flag twice, null first and then the value, so the
  // second update always diffs against null and carries the whole object. The transient null is
  // skipped by the handler.
  'flags.cortexprime-ext.pendingParadox': 'two-step null-then-value write always diffs whole',
  // Only ever compared `=== null` — "was the dice pool cleared by this update", which is genuinely
  // a question about what changed rather than about current state.
  'flags.cortexprime-ext.dicePool': 'presence/null check, not a state read'
}

const jsFilesIn = dir => readdirSync(dir).flatMap(entry => {
  const full = join(dir, entry)

  if (statSync(full).isDirectory()) return jsFilesIn(full)

  return full.endsWith('.js') ? [full] : []
})

// getProperty(data, 'some.path') / foundry.utils.getProperty(changes, "some.path")
const DIFF_READ = /getProperty\(\s*(?:data|changes|diff|delta)\s*,\s*['"]([^'"]+)['"]/g

const diffReads = () => jsFilesIn(MODULE_DIR).flatMap(file => {
  const source = readFileSync(file, 'utf8')

  return [...source.matchAll(DIFF_READ)].map(match => ({
    path: match[1],
    file: file.slice(MODULE_DIR.length + 1).replace(/\\/g, '/')
  }))
})

describe('reading Foundry hook diffs', () => {
  it('never pulls state out of the update diff except where that is provably safe', () => {
    const offenders = diffReads()
      .filter(read => !(read.path in ALLOWED))
      .map(read => `${read.file}: getProperty(data, '${read.path}')`)

    expect(
      offenders,
      'A Foundry hook\'s `data` is the update DIFF — unchanged keys are stripped, so this read ' +
      'returns a record with holes whose shape depends on the previous write. Read the document ' +
      'instead (e.g. actor.getFlag(\'cortexprime-ext\', \'lastRoll\')), and keep hasProperty(data, ' +
      '...) as the trigger. If a read really is diff-shaped, add it to ALLOWED with its reason.'
    ).toEqual([])
  })

  it('still finds the reads it is meant to be policing', () => {
    // Guards the regex itself: if a refactor renamed the hook parameter or changed the call shape,
    // this test would quietly pass by matching nothing at all.
    expect(diffReads().length).toBeGreaterThan(0)
  })
})
