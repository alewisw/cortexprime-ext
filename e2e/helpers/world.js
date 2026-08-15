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
