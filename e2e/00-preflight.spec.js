import { test, expect } from '@playwright/test'
import { openAs, ROLE_USERS } from './foundry.js'
import { getSetting } from './helpers/world.js'
import { listOpenAppNames } from './helpers/apps.js'

// Runs FIRST — hence the filename, since Playwright orders spec files alphabetically.
//
// This suite drives a real, human-used world, so it can be broken by state that has nothing to do
// with the code under test. Every check below cost real debugging time at least once:
//
//   - Magick left armed at "Vulgar" after a session at the table makes the Mage rule set disable
//     the roll buttons of any roller whose pool has no Powers trait, and nearly every spec rolls
//     plain custom dice. Seven specs timed out on "the roll button never enabled" with no hint why.
//   - A third-party module (yendors-scene-actors) parked a window over the Dice Pool tray and
//     swallowed the clicks aimed at it. The button under it was in the DOM the whole time, so the
//     spec hung for its full six-minute timeout and only the Playwright trace showed the cause.
//   - Foundry elects the FIRST connected GM as the active one, and the GM-side reactions (Paradox,
//     the Hitches dialog, roll-undo snapshots) run only there. With a human GM session open, two
//     specs skipped for an entire working session while being the regression guard for a live bug.
//
// These fail loudly and say what to do, so a dirty world costs one obvious failure here rather than
// a scatter of mystifying ones later. It replaces nothing: the per-spec require*() skips in
// helpers/world.js still guard world *configuration* that is legitimately optional.
test('preflight: the world is in a fit state for the suite', async ({ browser }) => {
  const gm = await openAs(browser, 'gm')
  const player1 = await openAs(browser, 'player1')
  const player2 = await openAs(browser, 'player2')

  try {
    const activeGM = await gm.page.evaluate(() => window.game.users.activeGM?.name ?? null)

    expect(
      activeGM,
      `Foundry's active GM is "${activeGM}", not ${ROLE_USERS.gm}. Foundry elects the first ` +
      'connected GM, and Paradox, the Hitches dialog and roll-undo snapshots run only on that ' +
      'client — so those specs would skip or assert against a screen that is not the test\'s. ' +
      'Log out of your own Gamemaster session and re-run.'
    ).toBe(ROLE_USERS.gm)

    const challenge = await getSetting(gm.page, 'activeChallenge')

    expect(
      challenge?.type ?? null,
      'A challenge is still running in this world. Clear it from the Dice Pool tray — the first ' +
      'spec to start its own will be measuring against someone else\'s half-finished one.'
    ).toBeNull()

    const magick = (await getSetting(gm.page, 'mageChallengeState'))?.magick ?? 'none'

    expect(
      magick,
      `Magick is armed ("${magick}"). While it is anything but "none", the Mage rule set disables ` +
      'the roll buttons of any current roller whose pool holds no Powers trait, and almost every ' +
      'spec rolls plain custom dice. Set Magick to None in the GM tray, or re-run global setup.'
    ).toBe('none')

    const crisis = await getSetting(gm.page, 'crisisPool')

    expect(
      !!crisis?.active,
      'A Crisis Pool is active. crisis-pool.spec.js asserts a clean baseline and will fail on its ' +
      'very first line. End the crisis, or re-run global setup.'
    ).toBe(false)

    // Nothing this suite drives is open yet, so anything on screen was restored by Foundry or put
    // there by a module — and a floating window over the tray swallows clicks aimed at what is
    // underneath it, which hangs a spec rather than failing it.
    for (const [role, session] of [['gm', gm], ['player1', player1], ['player2', player2]]) {
      const open = await listOpenAppNames(session.page)

      expect(
        open,
        `The ${role} client has ${open.length} application window(s) open right after login ` +
        `(${open.join(', ')}). A window parked over the Dice Pool tray intercepts clicks meant ` +
        'for it and hangs the spec until it times out. Disable modules that render their own ' +
        'floating windows in this world — yendors-scene-actors is the known offender.'
      ).toEqual([])
    }

    // Assumed by nearly every spec, asserted nowhere until now.
    for (const [role, actorName] of [['player1', 'Amanda Singh'], ['player2', 'Cameron James']]) {
      const link = await gm.page.evaluate(
        ({ userName, name }) => {
          const user = window.game.users.getName(userName)
          const actor = window.game.actors.getName(name)

          return {
            actorExists: !!actor,
            assigned: user?.character?.name ?? null,
            isOwner: !!actor && !!user && actor.testUserPermission(user, 'OWNER')
          }
        },
        { userName: ROLE_USERS[role], name: actorName }
      )

      expect(
        link,
        `${ROLE_USERS[role]} must have "${actorName}" assigned and owned — see the world setup in ` +
        'docs/DEVELOPMENT.md. Global setup links these automatically, so a failure here means the ' +
        'actor is missing or renamed.'
      ).toEqual({ actorExists: true, assigned: actorName, isOwner: true })
    }
  } finally {
    await gm.context.close()
    await player1.context.close()
    await player2.context.close()
  }
})
