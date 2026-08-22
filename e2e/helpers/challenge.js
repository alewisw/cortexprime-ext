// Challenge helpers. These drive the GM's real controls in the Dice Pool
// tray rather than writing activeChallenge directly, so the tests exercise
// the same wiring a GM does.

import { TRAY, openTray } from './dicePool.js'

export const ROLE_TO_USER = {
  gm: 'PlaywrightGamemaster',
  player1: 'PlaywrightPlayer1',
  player2: 'PlaywrightPlayer2'
}

/**
 * The id used by the challenge radios/checkboxes is NOT a user id: per
 * getRollToBeatTargets() (rollToBeat.js) the GM is the literal string
 * 'gm', and every player is identified by their *character's actor id*.
 */
export async function challengeIdFor(page, role) {
  if (role === 'gm') return 'gm'

  const userName = ROLE_TO_USER[role] ?? role

  return page.evaluate(
    n => window.game.users.getName(n)?.character?.id ?? null,
    userName
  )
}

export async function getActiveChallenge(page) {
  return page.evaluate(() => window.game.settings.get('cortexprime-ext', 'activeChallenge'))
}

// Every challenge-mutating handler in UserDicePool.js (setChallengeType/Initiator/Responders,
// setGroupParticipants, ...) does its own unsynchronized read-current-then-write-whole-object
// round trip against the single `activeChallenge` setting - fine for a human, who naturally waits
// for a re-render before the next click, but not for Playwright firing actions back-to-back: a
// second action's read can land before the first action's write has, so its write clobbers the
// first with a stale base and silently drops what it just did. Every helper below waits for its
// OWN expected effect on activeChallenge to actually land before returning, so the next helper in
// a back-to-back sequence (e.g. setChallengeType -> setInitiator -> selectResponder) always reads
// a settled state rather than racing an in-flight write.

/** Clicks Test / Contest / Group in the GM's tray. */
export async function setChallengeType(gmPage, type) {
  await openTray(gmPage)
  await gmPage.locator(`${TRAY} button.set-challenge-type[data-type="${type}"]`).click()

  await gmPage.waitForFunction(
    expected => window.game.settings.get('cortexprime-ext', 'activeChallenge')?.type === expected,
    type,
    { timeout: 15_000 }
  )
}

export async function clearChallengeViaUi(gmPage) {
  const button = gmPage.locator(`${TRAY} button.clear-challenge`)

  if (await button.count()) await button.click()
}

/** Picks who rolls first (Roll Now). */
export async function setInitiator(gmPage, userId) {
  await gmPage.locator(`${TRAY} input.challenge-initiator[value="${userId}"]`).check()

  await gmPage.waitForFunction(
    expected => window.game.settings.get('cortexprime-ext', 'activeChallenge')?.initiatorId === expected,
    userId,
    { timeout: 15_000 }
  )
}

/** Test: checks off a responder (multi-select). */
export async function checkResponder(gmPage, userId) {
  await gmPage.locator(`${TRAY} input.challenge-responder-checkbox[value="${userId}"]`).check()

  await gmPage.waitForFunction(
    expected => (window.game.settings.get('cortexprime-ext', 'activeChallenge')?.responderIds ?? []).includes(expected),
    userId,
    { timeout: 15_000 }
  )
}

/** Contest: picks the single responder (radio). */
export async function selectResponder(gmPage, userId) {
  await gmPage.locator(`${TRAY} input.challenge-responder-radio[value="${userId}"]`).check()

  await gmPage.waitForFunction(
    expected => (window.game.settings.get('cortexprime-ext', 'activeChallenge')?.responderIds ?? []).includes(expected),
    userId,
    { timeout: 15_000 }
  )
}

/** Group: checks off a participant. */
export async function checkGroupParticipant(gmPage, userId) {
  await gmPage.locator(`${TRAY} input.group-participant-checkbox[value="${userId}"]`).check()

  await gmPage.waitForFunction(
    expected => (window.game.settings.get('cortexprime-ext', 'activeChallenge')?.group?.participantIds ?? []).includes(expected),
    userId,
    { timeout: 15_000 }
  )
}

export function rollButtons(page) {
  return page.locator(`${TRAY} button.roll-dice-pool`)
}

export function rollToBeatButton(page) {
  return page.locator(`${TRAY} button.roll-dice-pool.roll-to-beat`)
}

/** True when every rendered roll button in this tray is disabled. */
export async function allRollButtonsDisabled(page) {
  return page.evaluate(() => {
    const buttons = [...document.querySelectorAll('#user-dice-pool button.roll-dice-pool')]
    return buttons.length > 0 && buttons.every(button => button.disabled)
  })
}

/** True when at least one rendered roll button is enabled. */
export async function anyRollButtonEnabled(page) {
  return page.evaluate(() => {
    const buttons = [...document.querySelectorAll('#user-dice-pool button.roll-dice-pool')]
    return buttons.some(button => !button.disabled)
  })
}
