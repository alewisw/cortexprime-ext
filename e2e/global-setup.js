import { mkdirSync } from 'node:fs'
import { chromium } from '@playwright/test'
import { authFile, joinAs, ROLE_USERS } from './foundry.js'
import { replayPendingSnapshots } from './helpers/snapshot.js'

/**
 * Runs once before any test (wired via playwright.config.js's
 * `globalSetup`). Logs in as the GM and both players, has the GM link each
 * player to their character (granting OWNER so they can actually use it),
 * unpause the game, cancel any active crisis pool, and clear the
 * spotlight — all via real Foundry API calls — so
 * every test run starts from the same known baseline regardless of
 * whatever state a previous manual session or test run left behind. Then
 * saves each session's storageState to .auth/<role>.json so individual
 * tests can restore an already-logged-in session (openAs()) instead of
 * repeating the login flow.
 */
export default async function globalSetup() {
  mkdirSync(new URL('../.auth', import.meta.url), { recursive: true })

  const browser = await chromium.launch()

  const gm = await joinAs(browser, { user: ROLE_USERS.gm })
  const player1 = await joinAs(browser, { user: ROLE_USERS.player1 })
  const player2 = await joinAs(browser, { user: ROLE_USERS.player2 })

  // Before anything else: if a previous run died mid-test and never put a spec's settings back,
  // replay them now. Otherwise the run that follows snapshots the damaged values as its own
  // baseline and cements them - which is exactly how a stuck traitSetEdit poisoned three
  // consecutive runs. See BUGS.md issue 1.
  await replayPendingSnapshots(gm.page)

  await gm.page.evaluate(async ({ player1User, player2User }) => {
    // Assigning a character is only half the job: without an ownership
    // grant Foundry silently refuses to render the sheet, and the player
    // can't add traits to a pool or roll. Grant OWNER too, matching how a
    // real table sets up a PC.
    const link = async (userName, actorName) => {
      const user = game.users.getName(userName, { strict: true })
      const actor = game.actors.getName(actorName, { strict: true })

      await user.update({ character: actor.id })
      await actor.update({
        [`ownership.${user.id}`]: CONST.DOCUMENT_OWNERSHIP_LEVELS.OWNER
      })
    }

    await link(player1User, 'Amanda Singh')
    await link(player2User, 'Cameron James')

    if (game.paused) {
      await game.togglePause(false, { broadcast: true })
    }

    // Cancel any active crisis pool — same shape endCrisis() in
    // module/scripts/crisisPool.js sets, that function just isn't exposed
    // on game.cortexprime for us to call directly from here.
    await game.settings.set('cortexprime-ext', 'crisisPool', { active: false, name: '', dice: [] })

    // Clear the spotlight (no character highlighted).
    await game.settings.set('cortexprime-ext', 'spotlightActorId', '')

    // No challenge in progress, so a spec's first assertion isn't measured against someone
    // else's half-finished Test.
    await game.settings.set('cortexprime-ext', 'activeChallenge', {})

    // Back to the registered default. Magick left armed at anything other than 'none' makes the
    // Mage rule set disable the roll buttons of any current roller whose pool has no Powers trait
    // (see injectPoolValidation in module/mage/mageAscension.js) — and almost every spec rolls a
    // pool of plain custom dice. A human leaving "Vulgar" set after a session at the table would
    // otherwise fail seven specs with no hint as to why.
    await game.settings.set('cortexprime-ext', 'mageChallengeState', {
      magick: 'none',
      realityReinforcement: 'opposes'
    })
  }, { player1User: ROLE_USERS.player1, player2User: ROLE_USERS.player2 })

  await gm.context.storageState({ path: authFile('gm') })
  await player1.context.storageState({ path: authFile('player1') })
  await player2.context.storageState({ path: authFile('player2') })

  await gm.context.close()
  await player1.context.close()
  await player2.context.close()
  await browser.close()
}
