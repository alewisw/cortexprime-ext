import { test, expect } from '@playwright/test'
import { openAs } from './foundry.js'
import { TRAY, openTray, seedRollRecord } from './helpers/dicePool.js'
import { challengeIdFor, setChallengeType, setInitiator, checkResponder } from './helpers/challenge.js'
import {
  clearChallenge,
  getSetting,
  setSetting,
  requireActiveGM,
  requireMageRuleSet,
  snapshotSettings,
  restoreSettings
} from './helpers/world.js'

// The regression guard for the bug that made Paradox fire only sometimes.
//
// Foundry's updateActor hook receives the update *diff*, not the document: any key whose value did
// not change is stripped before the handler sees it. module/mage/paradox.js read the roll record
// out of that diff, so a roll that LOST right after another roll that LOST arrived with no `won` at
// all — getParadoxOutcome() returned null and the whole chain silently bailed. Paradox therefore
// fired only when the outcome happened to flip between consecutive rolls, which is exactly how a
// bug survives being "tested by hand".
//
// This spec seeds roll records rather than rolling real dice, deliberately. The bug lives in the
// hook handler, and actor.setFlag() produces the same Foundry diff a real roll does — which is the
// thing under test — while the dice picker would add a minute of runtime and its own flakiness
// while testing less. mage.spec.js and challenge.spec.js seed for the same reason.
//
// Setup is chosen so the assertions are deterministic against whatever this world happens to hold:
// Vulgar Witnessed magick bypasses Shielding entirely (paradoxLogic.js applyShielding), so a
// Location actor linked to the active scene cannot absorb the Paradox and leave no dialog at all.

const ACTOR = 'Amanda Singh'
const SETTINGS_KEYS = ['activeChallenge', 'mageChallengeState', 'lastGmRoll']
// Matched by id prefix: the dialog ids itself per actor so two players can resolve Paradox
// at once. Both frameworks put options.id on the window root, so this survives migration -
// and unlike the old .window-content-scoped class selector it needs no disambiguation, since
// the template root no longer duplicates the window's own classes.
const DIALOG = '[id^="paradox-dialog-"]'

/** The Simple Trait index on the actor claiming the given System Trait, or null. */
const systemTraitIndex = (page, actorName, key) => page.evaluate(
  ({ name, systemTrait }) => {
    const traits = window.game.actors.getName(name)?.system.actorType?.simpleTraits ?? {}

    return Object.keys(traits).find(index => traits[index]?.settings?.systemTrait === systemTrait) ?? null
  },
  { name: actorName, systemTrait: key }
)

// Unset-then-set, the same two-call shape module/mage/paradox.js uses — a plain update() merge
// would leave the old dice in place alongside the new one.
const setTraitDie = (page, actorName, index, face) => page.evaluate(
  async ({ name, traitIndex, value }) => {
    const actor = window.game.actors.getName(name)
    const path = `system.actorType.simpleTraits.${traitIndex}.dice`

    await actor.update({ [`${path}.-=value`]: null })
    await actor.update({ [`${path}.value`]: { 0: value } })
  },
  { name: actorName, traitIndex: index, value: face }
)

const getPendingParadox = page => page.evaluate(
  name => window.game.actors.getName(name)?.getFlag('cortexprime-ext', 'pendingParadox') ?? null,
  ACTOR
)

const clearPendingParadox = page => page.evaluate(
  async name => {
    await window.game.actors.getName(name)?.setFlag('cortexprime-ext', 'pendingParadox', null)
  },
  ACTOR
)

const getLastRoll = page => page.evaluate(
  name => window.game.actors.getName(name)?.getFlag('cortexprime-ext', 'lastRoll') ?? null,
  ACTOR
)

test('a losing magickal roll earns Paradox even when the roll before it also lost', async ({ browser }) => {
  const gm = await openAs(browser, 'gm')
  const player1 = await openAs(browser, 'player1')

  const mageSkip = await requireMageRuleSet(gm.page)
  test.skip(mageSkip !== null, mageSkip ?? '')

  // Paradox is computed on the active GM's client only.
  const gmSkip = await requireActiveGM(gm.page)
  test.skip(gmSkip !== null, gmSkip ?? '')

  const paradoxIndex = await systemTraitIndex(gm.page, ACTOR, 'paradox')
  test.skip(paradoxIndex === null, `${ACTOR} has no Simple Trait tagged as the Paradox System Trait`)

  const beforeSettings = await snapshotSettings(gm.page, SETTINGS_KEYS)
  const beforeActorType = await gm.page.evaluate(
    name => window.game.actors.getName(name).system.actorType,
    ACTOR
  )
  const beforeRoll = await getLastRoll(gm.page)

  // Re-establishes the Test and marks the initiator as having rolled. A Test is consumed once its
  // responder's record lands, so the second half of this spec needs it set up again.
  const armTest = async () => {
    await clearChallenge(gm.page)
    await openTray(gm.page)
    await setChallengeType(gm.page, 'test')
    await setInitiator(gm.page, 'gm')
    await checkResponder(gm.page, await challengeIdFor(gm.page, 'player1'))

    // effectDice [6] is what the responder's Paradox is measured from: a failed roll takes its Base
    // Paradox from the opposition's Effect die.
    await seedRollRecord(gm.page, { total: 11, effectDice: [6] })
  }

  try {
    const state = await getSetting(gm.page, 'mageChallengeState')
    await setSetting(gm.page, 'mageChallengeState', { ...state, magick: 'vulgar-witnessed' })

    // A known starting rating, so the "not larger, so it steps up" branch is the one exercised —
    // the real case this bug was found in.
    await setTraitDie(gm.page, ACTOR, paradoxIndex, '10')

    await armTest()

    // ---- First losing roll: Paradox lands, and the dialog explains itself ----

    await seedRollRecord(gm.page, { actorName: ACTOR, total: 5, effectDice: [4], won: false })

    await expect.poll(() => getPendingParadox(gm.page).then(p => p?.finalParadox ?? null))
      .toBe('12')

    const dialog = player1.page.locator(DIALOG)
    await dialog.waitFor({ state: 'visible', timeout: 15_000 })

    // The inputs that fed the calculation, then the rules that were applied.
    await expect(dialog).toContainText('Vulgar Witnessed')
    await expect(dialog).toContainText("opposition's Effect die, D6")
    await expect(dialog).toContainText('too blatant')
    await expect(dialog).toContainText('steps up one instead')

    await clearPendingParadox(gm.page)
    await setTraitDie(gm.page, ACTOR, paradoxIndex, '10')

    // ---- Second losing roll: the regression ----

    // The precondition that used to break it: the record already holds won === false, so the next
    // write of another loss produces a diff carrying only rolledAt. Reading the record out of that
    // diff yields `won: undefined`, and Paradox skips the roll entirely.
    expect((await getLastRoll(gm.page))?.won).toBe(false)

    await armTest()
    await seedRollRecord(gm.page, { actorName: ACTOR, total: 5, effectDice: [4], won: false })

    await expect
      .poll(() => getPendingParadox(gm.page).then(p => p?.finalParadox ?? null), {
        message: 'Paradox did not fire for a loss that followed another loss — the roll record is ' +
          'being read out of the updateActor diff again (see module/mage/paradox.js).'
      })
      .toBe('12')
  } finally {
    await clearPendingParadox(gm.page)

    await gm.page.evaluate(
      async ({ name, actorType, roll }) => {
        const actor = window.game.actors.getName(name)

        await actor.update({ 'system.-=actorType': null })
        await actor.update({ 'system.actorType': actorType })
        await actor.setFlag('cortexprime-ext', 'lastRoll', roll ?? {})
      },
      { name: ACTOR, actorType: beforeActorType, roll: beforeRoll }
    )

    await restoreSettings(gm.page, beforeSettings)

    await gm.context.close()
    await player1.context.close()
  }
})
