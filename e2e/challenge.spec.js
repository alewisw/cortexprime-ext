import { test, expect } from '@playwright/test'
import { openAs } from './foundry.js'
import { TRAY, openTray, closeTray, seedRollRecord, clearRollRecord, addCustomDie, clearPool, rollAndSelect, confirmDialog } from './helpers/dicePool.js'
import {
  setChallengeType,
  setInitiator,
  checkResponder,
  selectResponder,
  allRollButtonsDisabled,
  anyRollButtonEnabled,
  getActiveChallenge,
  challengeIdFor
} from './helpers/challenge.js'
import { clearChallenge, getChatMessageIds, plotPointMessagesSince, setSetting } from './helpers/world.js'
import { getActorPath, updateActor } from './helpers/sheet.js'

// Challenge orchestration is the highest-value E2E surface in the system:
// the GM writes activeChallenge / a roll record on their client, and every
// other connected client must re-render its tray to match — enabling or
// freezing roll buttons for the right people, with no reload. Unit tests
// cover the decision logic (rollToBeat.test.js); only a real browser can
// show that the gating actually reaches the players' screens.
//
// These use seedRollRecord() rather than real dice: hasInitiatorRolled()
// only checks that a roll record is newer than the challenge, so writing
// one directly gives a deterministic Target Total with no RNG involved.

// PlaywrightPlayer1's assigned character, per e2e/global-setup.js.
const PLAYER1_ACTOR = 'Amanda Singh'

test('a Test enables its responder only once the initiator has rolled, and never the bystander', async ({ browser }) => {
  const gm = await openAs(browser, 'gm')
  const player1 = await openAs(browser, 'player1')
  const player2 = await openAs(browser, 'player2')

  try {
    await clearChallenge(gm.page)
    await clearRollRecord(gm.page)

    await openTray(gm.page)
    await openTray(player1.page)
    await openTray(player2.page)

    // The roll buttons are only rendered once a pool has dice in it, so
    // give both players something to roll — otherwise "are the buttons
    // disabled?" is vacuously unanswerable.
    await clearPool(player1.page)
    await clearPool(player2.page)
    await addCustomDie(player1.page, 'Effort')
    await addCustomDie(player2.page, 'Effort')

    const gmId = await challengeIdFor(gm.page, 'gm')
    const player1Id = await challengeIdFor(gm.page, 'player1')

    await setChallengeType(gm.page, 'test')
    await setInitiator(gm.page, gmId)
    await checkResponder(gm.page, player1Id)

    const challenge = await getActiveChallenge(gm.page)
    expect(challenge.type).toBe('test')
    expect(challenge.responderIds).toContain(player1Id)

    // Before the initiator rolls, the responder is held back — this is the
    // "wait for the initiator" rule, and it must be visible on their own
    // client without them reloading.
    await expect
      .poll(() => allRollButtonsDisabled(player1.page))
      .toBe(true)

    // Roll To Beat is rendered as soon as they're designated a responder
    // (canRollToBeat keys off getMyResponderId, not off the initiator
    // having rolled) — but like every other roll button it stays disabled
    // until there is actually something to beat.
    await expect(player1.page.locator(`${TRAY} button.roll-to-beat`)).toHaveCount(1)
    await expect(player1.page.locator(`${TRAY} button.roll-to-beat`)).toBeDisabled()

    // The GM rolls (seeded): the responder's buttons should now enable
    // live, and the target total appears.
    await seedRollRecord(gm.page, { total: 14, effectDice: [8] })

    await expect
      .poll(() => anyRollButtonEnabled(player1.page))
      .toBe(true)

    await expect(player1.page.locator(`${TRAY} button.roll-to-beat`)).toBeEnabled()
    await expect(player1.page.locator(TRAY)).toContainText('14')

    // The bystander never gets to roll while someone else's Test runs, and
    // is never offered Roll To Beat at all — they have nothing to beat.
    expect(await allRollButtonsDisabled(player2.page)).toBe(true)
    await expect(player2.page.locator(`${TRAY} button.roll-to-beat`)).toHaveCount(0)
  } finally {
    await clearRollRecord(gm.page)
    await clearChallenge(gm.page)

    await gm.context.close()
    await player1.context.close()
    await player2.context.close()
  }
})

test('the Contest participant radios lock once the first roll has happened', async ({ browser }) => {
  const gm = await openAs(browser, 'gm')
  const player1 = await openAs(browser, 'player1')

  try {
    await clearChallenge(gm.page)
    await clearRollRecord(gm.page)

    await openTray(gm.page)
    await openTray(player1.page)

    const gmId = await challengeIdFor(gm.page, 'gm')
    const player1Id = await challengeIdFor(gm.page, 'player1')

    await setChallengeType(gm.page, 'contest')
    await setInitiator(gm.page, gmId)
    await selectResponder(gm.page, player1Id)

    // Freely re-pickable before anyone rolls.
    await expect(gm.page.locator(`${TRAY} input.challenge-initiator`).first()).toBeEnabled()
    await expect(gm.page.locator(`${TRAY} input.challenge-responder-radio`).first()).toBeEnabled()

    // Once the Contest is underway the GM can no longer swap the
    // contestants — Interference is the supported way to shake it up.
    await seedRollRecord(gm.page, { total: 12, effectDice: [8] })

    await expect(gm.page.locator(`${TRAY} input.challenge-initiator`).first()).toBeDisabled()
    await expect(gm.page.locator(`${TRAY} input.challenge-responder-radio`).first()).toBeDisabled()
  } finally {
    await clearRollRecord(gm.page)
    await clearChallenge(gm.page)

    await gm.context.close()
    await player1.context.close()
  }
})

test('a Group Challenge cannot start initiative with fewer than three participants', async ({ browser }) => {
  const gm = await openAs(browser, 'gm')
  // Eligible participants are drawn from *connected* users' characters, so
  // both players have to actually be online for there to be three.
  const player1 = await openAs(browser, 'player1')
  const player2 = await openAs(browser, 'player2')

  try {
    await clearChallenge(gm.page)
    await openTray(gm.page)

    await setChallengeType(gm.page, 'group')

    const start = gm.page.locator(`${TRAY} button.start-group-initiative`)
    await expect(start).toHaveCount(1)

    // Nothing checked yet, so it must be refused.
    await expect(start).toBeDisabled()

    const checkboxes = gm.page.locator(`${TRAY} input.group-participant-checkbox`)
    const available = await checkboxes.count()
    test.skip(available < 3, `Only ${available} eligible group participants are connected; need 3`)

    await checkboxes.nth(0).check()
    await checkboxes.nth(1).check()
    await expect(start).toBeDisabled()

    // Three is the documented minimum.
    await checkboxes.nth(2).check()
    await expect(start).toBeEnabled()
  } finally {
    await clearChallenge(gm.page)

    await gm.context.close()
    await player1.context.close()
    await player2.context.close()
  }
})

// Also covers the Plot Point cost of the picker's two "spend a Plot Point for an extra die"
// checkboxes: one checked box must cost exactly one Plot Point, and say so once.
test('a responder\'s Select Your Dice dialog shows the GM a SELECTING row, re-rolls in place, and charges one Plot Point per extra-die box on Confirm', async ({ browser }) => {
  const gm = await openAs(browser, 'gm')
  const player1 = await openAs(browser, 'player1')

  const ppPath = 'system.pp.value'
  const ppBefore = await getActorPath(gm.page, PLAYER1_ACTOR, ppPath)

  try {
    await clearChallenge(gm.page)
    await clearRollRecord(gm.page)
    await setSetting(gm.page, 'dicePickerRerollRequest', {})

    // Enough Plot Points that a second, unintended spend can actually go through: with only 1
    // banked, changePpBy's own `newValue >= 0` guard would silently absorb the duplicate and the
    // total would land on the right number for the wrong reason. Set before the roll, since the
    // picker reads the available budget once, when it opens (rollDice.js:177).
    await updateActor(gm.page, PLAYER1_ACTOR, { [ppPath]: 3 })

    await openTray(gm.page)
    await openTray(player1.page)

    // Roll & Select needs more than 2 non-hitch dice to show a real choice, and enough of them
    // that a genuine re-roll landing on the exact same faces/results again is vanishingly rare.
    // Six rather than four so the "extra total die" checkbox is near-certain to be live too: it
    // goes inert below 3 dice left over once the effect die is set aside (rollDice.js:390-400),
    // and any die that comes up a natural 1 is a hitch that never reaches that count.
    await clearPool(player1.page)
    await addCustomDie(player1.page, 'Die One')
    await addCustomDie(player1.page, 'Die Two')
    await addCustomDie(player1.page, 'Die Three')
    await addCustomDie(player1.page, 'Die Four')
    await addCustomDie(player1.page, 'Die Five')
    await addCustomDie(player1.page, 'Die Six')

    const gmId = await challengeIdFor(gm.page, 'gm')
    const player1Id = await challengeIdFor(gm.page, 'player1')

    await setChallengeType(gm.page, 'test')
    await setInitiator(gm.page, gmId)
    await checkResponder(gm.page, player1Id)

    // Get the responder rolling.
    await seedRollRecord(gm.page, { total: 5, effectDice: [4] })

    await expect
      .poll(() => anyRollButtonEnabled(player1.page))
      .toBe(true)

    // Nobody is mid-dialog yet.
    await expect(gm.page.locator(`${TRAY} button.request-reroll`)).toHaveCount(0)

    const picker = await rollAndSelect(player1.page)
    await expect(picker).toBeVisible()

    // Same trap as the actor sheet vs. the floating panel: at this viewport the roller's own Dice
    // Pool tray is left of centre and overlaps the left half of the picker, swallowing pointer
    // events aimed at the "extra total die" checkbox — Foundry won't move either window out of the
    // way. The tray has done its job (the roll is already underway and the pool is cleared), so
    // close it before touching anything in the dialog. The GM's tray, which the assertions below
    // are about, is untouched.
    await closeTray(player1.page)

    // The GM's tray has to live-update to show this, without a reload on their end.
    await expect
      .poll(() => gm.page.locator(`${TRAY} button.request-reroll[data-actor-id="${player1Id}"]`).count())
      .toBe(1)
    await expect(gm.page.locator(TRAY)).toContainText('Selecting')

    const diceSignature = () => player1.page.evaluate(() =>
      [...document.querySelectorAll('.cortexprime.dice-picker .result-die')]
        .map(die => `${die.dataset.faces}:${die.dataset.result}`)
        .join(',')
    )

    const before = await diceSignature()

    await gm.page.locator(`${TRAY} button.request-reroll[data-actor-id="${player1Id}"]`).click()

    // The player's own dialog re-rolls in place - new dice, same dialog, never closed.
    await expect.poll(diceSignature, { timeout: 15_000 }).not.toBe(before)
    await expect(picker).toBeVisible()

    // Buying one extra Total die costs one Plot Point. The box is only offered to players
    // (dice-picker.html wraps it in {{#unless isGM}}), and only while enough dice remain for it
    // to change anything — a hitch-heavy roll legitimately has nothing to sell here.
    const extraTotal = picker.locator('input.extra-total-die-checkbox')
    await expect(extraTotal).toHaveCount(1)

    const canBuyExtraTotal = await extraTotal.isEnabled()
    test.skip(!canBuyExtraTotal, 'This roll left too few non-hitch dice for an extra Total die to be purchasable')

    await extraTotal.check()
    await expect(extraTotal).toBeChecked()

    const messagesBefore = await getChatMessageIds(player1.page)

    // Confirming closes the dialog and clears the row again.
    await confirmDialog(player1.page)

    await expect
      .poll(() => gm.page.locator(`${TRAY} button.request-reroll[data-actor-id="${player1Id}"]`).count())
      .toBe(0)

    // The spend lands as its own chat card, so wait for it before judging the count.
    await expect
      .poll(() => plotPointMessagesSince(player1.page, messagesBefore).then(cards => cards.length), { timeout: 15_000 })
      .toBeGreaterThan(0)

    // A settle window, because what's being asserted is the ABSENCE of a second spend: Foundry's
    // appv1 Dialog#submit runs the button callback and then close(), and the picker wires
    // resolveFromDom (rollDice.js) to both — so a duplicate charge arrives a round trip behind the
    // first, not concurrently with it. Polling for "exactly one" would pass before it shows up.
    await player1.page.waitForTimeout(2_000)

    const ppCards = await plotPointMessagesSince(player1.page, messagesBefore)
    expect(ppCards).toHaveLength(1)

    await expect
      .poll(() => getActorPath(gm.page, PLAYER1_ACTOR, ppPath))
      .toBe(2)
  } finally {
    await updateActor(gm.page, PLAYER1_ACTOR, { [ppPath]: ppBefore ?? 1 })
    await setSetting(gm.page, 'dicePickerRerollRequest', {})
    await clearRollRecord(gm.page)
    await clearChallenge(gm.page)

    await gm.context.close()
    await player1.context.close()
  }
})
