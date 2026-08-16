// Preconditions and cleanup helpers shared by every spec.
//
// The suite runs against whatever world you have open, so a spec whose
// world configuration is missing should SKIP with a legible reason rather
// than fail. Each require* helper returns a reason string (for
// `test.skip(reason !== null, reason)`) or null when the precondition holds.

const NS = 'cortexprime-ext'

export async function getSetting(page, key) {
  return page.evaluate(k => window.game.settings.get('cortexprime-ext', k), key)
}

export async function setSetting(page, key, value) {
  return page.evaluate(
    ({ k, v }) => window.game.settings.set('cortexprime-ext', k, v),
    { k: key, v: value }
  )
}

/** Skip reason when a setting is unset/empty. */
export async function requireSetting(page, key, label = key) {
  const value = await getSetting(page, key)
  const missing = value === undefined || value === null || value === ''
  return missing ? `World setting "${label}" is not configured` : null
}

/** Skip reason when an actor of that name doesn't exist. */
export async function requireActor(page, name) {
  const exists = await page.evaluate(n => !!window.game.actors.getName(n), name)
  return exists ? null : `No actor named "${name}" exists in this world`
}

/** Skip reason unless the Mage rule set is active and mapped. */
export async function requireMageRuleSet(page) {
  const state = await page.evaluate(() => ({
    ruleSet: window.game.settings.get('cortexprime-ext', 'customRuleSet'),
    mage: window.game.settings.get('cortexprime-ext', 'mageSettings')
  }))

  if (state.ruleSet !== 'mage') return 'Custom Rule Set is not set to "mage"'
  if (!state.mage?.playerCharacterActorTypeId) return 'Mage Settings has no Player Character actor type mapped'

  return null
}

/** Skip reason unless the active scene links an actor (Scene Distinction). */
export async function requireSceneLink(page) {
  const linked = await page.evaluate(() =>
    window.game.scenes?.active?.getFlag('cortexprime-ext', 'linkedActorId') ?? null
  )

  return linked ? null : 'The active scene has no linked Distinction actor'
}

/**
 * Skip reason unless THIS session is Foundry's elected active GM.
 *
 * Several behaviours run on exactly one client — the active GM's — so that they
 * happen once rather than once per connected GM: the Hitches dialog
 * (hitches.js), the roll-undo snapshot and its card refresh (rollUndo.js), and
 * challenge advancement (rollToBeat.js). Foundry elects the first connected GM,
 * so if you have your own Gamemaster session open, it wins and those reactions
 * land on YOUR screen instead of the test's.
 *
 * Specs asserting on that GM-side UI have to skip rather than fail — the system
 * is behaving correctly, the test just isn't the one being talked to.
 */
export async function requireActiveGM(page) {
  const state = await page.evaluate(() => ({
    me: window.game.user.name,
    activeGM: window.game.users.activeGM?.name ?? null,
    isActive: window.game.user === window.game.users.activeGM
  }))

  if (state.isActive) return null

  return `This session (${state.me}) is not Foundry's active GM — "${state.activeGM}" is. ` +
    'Disconnect that Gamemaster session and re-run; GM-side reactions fire only on the active GM.'
}

/** Skip reason unless test mode (deterministic die values) is enabled. */
export async function requireTestMode(page) {
  const on = await getSetting(page, 'testModeSelectDiceValues')
  return on ? null : 'The "Select Dice Values (test mode only)" setting is off'
}

/**
 * Reads the given setting keys so a spec can put them back in its finally
 * block. Every spec that writes world state must pair these two.
 */
export async function snapshotSettings(page, keys) {
  return page.evaluate(
    ks => Object.fromEntries(ks.map(k => [k, window.game.settings.get('cortexprime-ext', k)])),
    keys
  )
}

export async function restoreSettings(page, snapshot) {
  await page.evaluate(async snap => {
    for (const [key, value] of Object.entries(snap)) {
      await window.game.settings.set('cortexprime-ext', key, value)
    }
  }, snapshot)
}

/** The universal reset between challenge specs. */
export async function clearChallenge(page) {
  await setSetting(page, 'activeChallenge', {})
}

/** The crisis pool's dice, as a plain array of faces. */
export async function getCrisisDice(page) {
  const pool = await getSetting(page, 'crisisPool')
  return pool?.dice ?? []
}

export async function startCrisis(page, { name, dice }) {
  await setSetting(page, 'crisisPool', { active: true, name, dice })
}

export async function endCrisis(page) {
  await setSetting(page, 'crisisPool', { active: false, name: '', dice: [] })
}

/**
 * The roll record for a player's character, or for the GM when actorName is
 * omitted. This is what getRollToBeatTargets() reads, so it's the witness for
 * what a roll actually recorded — total, effect dice, and win/loss.
 */
export async function getRollRecord(page, actorName) {
  return page.evaluate(name => {
    if (name) return window.game.actors.getName(name)?.getFlag('cortexprime-ext', 'lastRoll') ?? null

    return window.game.settings.get('cortexprime-ext', 'lastGmRoll') ?? null
  }, actorName)
}

/** Turns deterministic die values on, returning the previous value to restore. */
export async function enableTestMode(page) {
  const previous = await getSetting(page, 'testModeSelectDiceValues')

  if (!previous) await setSetting(page, 'testModeSelectDiceValues', true)

  return previous
}

/**
 * Waits for a world setting to reach a value on THIS client. World settings
 * reach other sessions over a socket, so a player's page can still be reading
 * the old value for a moment after the GM writes it.
 */
export async function awaitSetting(page, key, expected, timeout = 15_000) {
  await page.waitForFunction(
    ({ k, v }) => JSON.stringify(window.game.settings.get('cortexprime-ext', k)) === JSON.stringify(v),
    { k: key, v: expected },
    { timeout }
  )
}

/** Foundry user id for one of the dedicated Playwright accounts. */
export async function userIdByName(page, userName) {
  return page.evaluate(n => window.game.users.getName(n)?.id ?? null, userName)
}

/** Every chat message id currently in the log, to diff against later. */
export async function getChatMessageIds(page) {
  return page.evaluate(() => window.game.messages.contents.map(message => message.id))
}

/**
 * Chat cards created since `beforeIds` that announce a Plot Point movement.
 *
 * CortexPrimeActor#createPpMessage renders templates/chat/change-pp.html,
 * the only template carrying `<span class="icon pp">` — so one card here
 * means exactly one changePpBy() actually ran. That makes this a more
 * reliable witness than the resulting pp.value: two concurrent spends can
 * both read the same starting value and both write the same result,
 * leaving the total looking correct while the table sees it charged twice.
 */
export async function plotPointMessagesSince(page, beforeIds) {
  return page.evaluate(ids => {
    const seen = new Set(ids)

    return window.game.messages.contents
      .filter(message => !seen.has(message.id))
      .filter(message => (message.content ?? '').includes('class="icon pp"'))
      .map(message => message.content)
  }, beforeIds)
}

export { NS }
