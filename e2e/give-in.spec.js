import { test, expect } from '@playwright/test'
import { openAs } from './foundry.js'
import { TRAY, openTray, clearRollRecord, seedRollRecord } from './helpers/dicePool.js'
import { setChallengeType, setInitiator, selectResponder, checkResponder, checkGroupParticipant, getActiveChallenge, challengeIdFor } from './helpers/challenge.js'
import { clearChallenge, getChatMessageIds, plotPointMessagesSince, restoreSettings, snapshotSettings } from './helpers/world.js'
import { getActorPath, updateActor } from './helpers/sheet.js'

// UserDicePool.js's new Give-In button has no coverage: conceding a Contest/Group without
// rolling has to gain a Plot Point, take the current opponent's effect dice as the consequence,
// and record the concession as a loss - which then has to ride the EXISTING
// processChallengeAdvancement/processGroupAdvancement pipeline (already covered end-to-end for
// real rolls in challenge-resolution.spec.js) through to actually ending the challenge. Nothing
// exercised recordRollResult being called from anywhere other than a real roll.
//
// Every opponent roll here is seeded rather than real - Give In itself never opens the dice
// picker, and an opponent's Total/Effect Dice only need to exist, not be rolled to get there
// (challenge.spec.js already established seeding is fine for that half of a challenge).

const PLAYER1_ACTOR = 'Amanda Singh'
const PP = 'system.pp.value'

const WRITES = ['activeChallenge', 'lastGmRoll']

async function resetWorld(gmPage) {
  await clearChallenge(gmPage)
  await clearRollRecord(gmPage)
  await clearRollRecord(gmPage, PLAYER1_ACTOR)
}

/**
 * The GIVE IN card among messages created since `beforeIds` — changePpBy's own PP-change card
 * is created right after it (see UserDicePool.js#_giveIn), so the newest message overall is
 * that one, not the GIVE IN announcement itself.
 */
async function giveInCardSince(page, beforeIds) {
  const newContents = await page.evaluate(ids => {
    const seen = new Set(ids)
    return window.game.messages.contents.filter(message => !seen.has(message.id)).map(message => message.content)
  }, beforeIds)

  return newContents.find(content => !content.includes('class="icon pp"')) ?? ''
}

test('Give In on a Contest confirms, gains a Plot Point, takes the opponent\'s effect dice, and ends the Contest', async ({ browser }) => {
  const gm = await openAs(browser, 'gm')
  const player1 = await openAs(browser, 'player1')

  const before = await snapshotSettings(gm.page, WRITES)
  const ppBefore = await getActorPath(gm.page, PLAYER1_ACTOR, PP)

  try {
    await resetWorld(gm.page)
    await openTray(gm.page)
    await openTray(player1.page)

    const gmId = await challengeIdFor(gm.page, 'gm')
    const player1Id = await challengeIdFor(gm.page, 'player1')

    await setChallengeType(gm.page, 'contest')
    await setInitiator(gm.page, gmId)
    await selectResponder(gm.page, player1Id)

    // The GM (initiator) has a Target for the responder to give in against.
    await seedRollRecord(gm.page, { total: 10, effectDice: [8], won: true })

    await openTray(player1.page)

    const giveInButton = player1.page.locator(`${TRAY} button.give-in`)
    await expect(giveInButton).toBeVisible()
    await expect(giveInButton).toBeEnabled()

    const messagesBefore = await getChatMessageIds(gm.page)

    await giveInButton.click()
    await player1.page.locator('.dialog .dialog-buttons button[data-button="yes"]').click()

    // The Contest ends outright, exactly like a real loss.
    await expect.poll(() => getActiveChallenge(gm.page).then(c => c.type ?? null)).toBeNull()

    // The conceding player's own record reads as a clean loss: no roll, no effect die of
    // their own - taking the OPPONENT's is a chat-card narrative, not something recorded here.
    await expect.poll(() =>
      gm.page.evaluate(name => window.game.actors.getName(name)?.getFlag('cortexprime-ext', 'lastRoll'), PLAYER1_ACTOR)
    ).toMatchObject({ won: false, effectDice: [] })

    // One Plot Point, one card announcing it.
    await expect.poll(() => getActorPath(gm.page, PLAYER1_ACTOR, PP)).toBe(ppBefore + 1)
    await gm.page.waitForTimeout(2_000)
    expect(await plotPointMessagesSince(gm.page, messagesBefore)).toHaveLength(1)

    // The GIVE IN card names the effect die actually taken - the opponent's (the GM's), d8.
    expect(await giveInCardSince(gm.page, messagesBefore)).toContain('d8')
  } finally {
    await resetWorld(gm.page)
    await updateActor(gm.page, PLAYER1_ACTOR, { [PP]: ppBefore ?? 1 })
    await restoreSettings(gm.page, before)

    await gm.context.close()
    await player1.context.close()
  }
})

test('Give In is never offered for a Test challenge, nor to the GM even as the designated responder', async ({ browser }) => {
  const gm = await openAs(browser, 'gm')
  const player1 = await openAs(browser, 'player1')

  const before = await snapshotSettings(gm.page, WRITES)

  try {
    await resetWorld(gm.page)
    await openTray(gm.page)
    await openTray(player1.page)

    const gmId = await challengeIdFor(gm.page, 'gm')
    const player1Id = await challengeIdFor(gm.page, 'player1')

    // A Test's responder can roll to beat, but there's no single opponent to concede to.
    await setChallengeType(gm.page, 'test')
    await setInitiator(gm.page, gmId)
    await checkResponder(gm.page, player1Id)
    // Seeded last: setup steps above each bump activeChallenge.updatedAt, and hasInitiatorRolled
    // only holds once the initiator's rolledAt is newer than the most recent of those bumps.
    await seedRollRecord(gm.page, { total: 10, effectDice: [8], won: true })

    await openTray(player1.page)
    await expect(player1.page.locator(`${TRAY} button.give-in`)).toHaveCount(0)

    // A Contest where the GM is the designated responder - Give In would otherwise apply, but
    // Plot Points aren't a GM concept in this system, so it must still be hidden for the GM.
    await setChallengeType(gm.page, 'contest')
    await setInitiator(gm.page, player1Id)
    await selectResponder(gm.page, gmId)
    await seedRollRecord(gm.page, { actorName: PLAYER1_ACTOR, total: 10, effectDice: [8], won: true })

    await openTray(gm.page)
    await expect(gm.page.locator(`${TRAY} button.give-in`)).toHaveCount(0)
  } finally {
    await resetWorld(gm.page)
    await restoreSettings(gm.page, before)

    await gm.context.close()
    await player1.context.close()
  }
})

test('Give In on a Group duel drops the challenger from the queue without disturbing the champion', async ({ browser }) => {
  const gm = await openAs(browser, 'gm')
  const player1 = await openAs(browser, 'player1')
  const player2 = await openAs(browser, 'player2')

  const PLAYER2_ACTOR = 'Cameron James'
  const before = await snapshotSettings(gm.page, WRITES)
  const ppBefore = await getActorPath(gm.page, PLAYER1_ACTOR, PP)

  try {
    await clearChallenge(gm.page)
    await clearRollRecord(gm.page)
    await clearRollRecord(gm.page, PLAYER1_ACTOR)
    await clearRollRecord(gm.page, PLAYER2_ACTOR)

    await openTray(gm.page)
    await openTray(player1.page)
    await openTray(player2.page)

    const gmId = await challengeIdFor(gm.page, 'gm')
    const player1Id = await challengeIdFor(gm.page, 'player1')
    const player2Id = await challengeIdFor(gm.page, 'player2')

    await setChallengeType(gm.page, 'group')

    const eligible = gm.page.locator(`${TRAY} input.group-participant-checkbox`)
    const available = await eligible.count()
    test.skip(available < 3, `Only ${available} eligible group participants are connected; need 3`)

    await checkGroupParticipant(gm.page, gmId)
    await checkGroupParticipant(gm.page, player1Id)
    await checkGroupParticipant(gm.page, player2Id)

    await gm.page.locator(`${TRAY} button.start-group-initiative`).click()
    await expect.poll(() => getActiveChallenge(gm.page).then(c => c.group?.phase)).toBe('initiative')

    // Seeded, ascending: player1 weakest (duels first), then the GM, then player2 (champion).
    await seedRollRecord(gm.page, { actorName: PLAYER1_ACTOR, total: 2, effectDice: [6], won: true })
    await seedRollRecord(gm.page, { total: 4, effectDice: [6], won: true })
    await seedRollRecord(gm.page, { actorName: PLAYER2_ACTOR, total: 6, effectDice: [10], won: true })

    await expect.poll(() => getActiveChallenge(gm.page).then(c => c.group?.phase)).toBe('dueling')

    const duelling = await getActiveChallenge(gm.page)
    expect(duelling.group.championId).toBe(player2Id)
    expect(duelling.group.queue).toEqual([player1Id, gmId])

    await openTray(player1.page)

    const giveInButton = player1.page.locator(`${TRAY} button.give-in`)
    await expect(giveInButton).toBeVisible()
    await expect(giveInButton).toBeEnabled()

    const messagesBefore = await getChatMessageIds(gm.page)

    await giveInButton.click()
    await player1.page.locator('.dialog .dialog-buttons button[data-button="yes"]').click()

    // Dropped from the front of the queue; the champion is untouched.
    await expect.poll(() => getActiveChallenge(gm.page).then(c => c.group?.queue)).toEqual([gmId])
    expect((await getActiveChallenge(gm.page)).group.championId).toBe(player2Id)

    await expect.poll(() => getActorPath(gm.page, PLAYER1_ACTOR, PP)).toBe(ppBefore + 1)
    await gm.page.waitForTimeout(2_000)
    expect(await plotPointMessagesSince(gm.page, messagesBefore)).toHaveLength(1)

    // The champion's effect die (D10), not the GM's - the queue skips straight to the standing
    // Target regardless of who else is still waiting behind the conceding player.
    expect(await giveInCardSince(gm.page, messagesBefore)).toContain('d10')
  } finally {
    await clearChallenge(gm.page)
    await clearRollRecord(gm.page)
    await clearRollRecord(gm.page, PLAYER1_ACTOR)
    await clearRollRecord(gm.page, PLAYER2_ACTOR)
    await updateActor(gm.page, PLAYER1_ACTOR, { [PP]: ppBefore ?? 1 })
    await restoreSettings(gm.page, before)

    await gm.context.close()
    await player1.context.close()
    await player2.context.close()
  }
})
