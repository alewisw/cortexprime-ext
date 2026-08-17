// GM-only "undo this roll" control on a roll's own chat card, so a player can roll again after a
// mis-click or a wrong pool. Deliberately a MINIMAL reset: it restores the challenge state and
// blanks the roll record, and nothing else. Consequences the GM already confirmed — complications,
// Doom Pool dice, Paradox/Trauma traits, the Crisis Pool reduction, plot points spent or awarded,
// the Contest effect step-down — are NOT reversed, and neither is the player's dice pool (it's
// destroyed at roll time and never persisted; they rebuild it).
//
// The pure decisions live in rollUndoLogic.js.
import { localizer, onSettingChanged } from './foundryHelpers.js'
import {
  clearActiveChallenge,
  getActiveChallenge,
  getBlankRecord,
  getRollToBeatTargets,
  setActiveChallenge
} from './rollToBeat.js'
import { computeUndoChallenge, resolveUndoState } from './rollUndoLogic.js'

const CHALLENGE_TYPES = ['test', 'contest', 'group']

const getSnapshots = () => game.settings.get('cortexprime-ext', 'rollUndoSnapshots') ?? {}

const findRollCard = (actorId, rolledAt) => game.messages.contents.find(message => {
  const flag = message.getFlag('cortexprime-ext', 'roll')

  return flag?.actorId === actorId && flag?.rolledAt === rolledAt
})

// A roll's chat card is created BEFORE the roll record exists (rollDice.js does that deliberately,
// so follow-up cards can't race ahead of it), which means at the moment the card first renders
// there is no record and no snapshot yet — the button correctly finds nothing to offer and the card
// would never render again. So whenever the answer may have changed, the affected cards are asked
// to re-render and re-evaluate.
const refreshRollCard = (actorId, rolledAt) => {
  const card = findRollCard(actorId, rolledAt)

  if (!card) return

  try {
    if (typeof ui.chat?.updateMessage === 'function') ui.chat.updateMessage(card)
    else ui.chat?.render()
  } catch (error) {
    console.warn('CP | Roll undo: could not refresh the roll card', error)
  }
}

const refreshUndoableCards = () => {
  Object.entries(getSnapshots()).forEach(([actorId, snapshot]) => refreshRollCard(actorId, snapshot.rolledAt))
}

// ---- GM side: snapshot the challenge as each roll lands ----

const onRollRecorded = async (actor, data) => {
  if (game.user !== game.users.activeGM) return
  if (!foundry.utils.hasProperty(data, 'flags.cortexprime-ext.lastRoll')) return

  // Read synchronously, before rollToBeat.js's handler for this same hook advances or clears the
  // challenge — capturing it afterwards would snapshot the post-roll state, which is useless.
  const challenge = getActiveChallenge()

  if (!CHALLENGE_TYPES.includes(challenge.type)) return

  // Off the actor, not out of `data` — that's the update diff and drops unchanged keys (see the
  // note in module/mage/paradox.js). Only `rolledAt` is read here, which always changes, but the
  // same read everywhere is one less trap for whoever needs another field later.
  const record = actor.getFlag('cortexprime-ext', 'lastRoll')

  if (!record?.rolledAt) return

  const snapshots = getSnapshots()

  if (snapshots[actor.id]?.rolledAt === record.rolledAt) return

  await game.settings.set('cortexprime-ext', 'rollUndoSnapshots', {
    ...snapshots,
    [actor.id]: { rolledAt: record.rolledAt, challenge }
  })

  // This roll's own card rendered before any of the above existed; the others may have just become
  // un-undoable (a Contest or Group duel only ever offers its latest roll).
  refreshUndoableCards()
}

// ---- Availability ----

const getUndoState = rollFlag => {
  if (!game.user.isGM) return null

  return resolveUndoState({
    rollFlag,
    snapshot: getSnapshots()[rollFlag?.actorId],
    targets: getRollToBeatTargets()
  })
}

// ---- The undo itself ----

const closeHitchesDialog = actorId => {
  const dialog = Object.values(ui.windows ?? {}).find(app => app.id === `hitches-dialog-${actorId}`)

  dialog?.close()
}

// An unconfirmed Paradox dialog is showing an outcome that was never written — cancelling it isn't
// reversing a consequence, it's dropping something still in flight.
const clearPendingParadox = async (actor, rolledAt) => {
  const pending = actor.getFlag('cortexprime-ext', 'pendingParadox')

  if (pending?.rolledAt === rolledAt) await actor.setFlag('cortexprime-ext', 'pendingParadox', null)
}

export const undoRoll = async (actorId, rolledAt) => {
  const actor = game.actors.get(actorId)

  if (!actor) return

  const undoState = getUndoState({ actorId, rolledAt })

  // Re-checked at click time, not just at render — the button may have been sitting on screen since
  // before someone else rolled.
  if (!undoState) {
    ui.notifications.warn(localizer('RollUndoUnavailable'))
    refreshUndoableCards()
    return
  }

  const rollerName = undoState.name || actor.name

  closeHitchesDialog(actorId)

  try {
    const { forgetPendingRoll } = await import('../mage/paradox.js')

    forgetPendingRoll(actorId)
  } catch (error) {
    console.warn('CP | Roll undo: could not clear the pending Paradox context', error)
  }

  await clearPendingParadox(actor, rolledAt)

  // Order matters. Blank the record FIRST: every downstream reactor gates on rolledAt, so a
  // rolledAt of 0 can't re-trigger anything. Restoring the challenge first would leave a live
  // record whose rolledAt beats the restored updatedAt, and processChallengeAdvancement would
  // immediately re-advance the very thing being undone.
  await actor.setFlag('cortexprime-ext', 'lastRoll', getBlankRecord())

  const nextChallenge = computeUndoChallenge({
    snapshot: undoState.snapshot.challenge,
    current: getActiveChallenge(),
    actorId
  })

  if (nextChallenge?.type) await setActiveChallenge(nextChallenge)
  else await clearActiveChallenge()

  const snapshots = { ...getSnapshots() }

  delete snapshots[actorId]

  await game.settings.set('cortexprime-ext', 'rollUndoSnapshots', snapshots)

  // Delete the roll's own card, so chat doesn't show a roll that no longer happened next to the
  // re-roll that replaces it, and say plainly what was undone.
  await findRollCard(actorId, rolledAt)?.delete()

  await ChatMessage.create({
    content: `<div>${game.i18n.format('RollUndoneMessage', { name: rollerName })}</div>`
  })

  // Undoing can make an earlier roll undoable again — in a Contest or Group duel, whichever roll is
  // now the latest.
  refreshUndoableCards()
}

// ---- Chat card injection ----

const injectUndoButton = (message, html) => {
  const rollFlag = message.getFlag('cortexprime-ext', 'roll')

  if (!getUndoState(rollFlag)) return

  const element = html instanceof HTMLElement ? html : html[0]
  const rollResult = element.querySelector('.roll-result')

  if (!rollResult) return

  const sendToPoolButton = rollResult.querySelector('.send-to-pool')
  const existingRow = sendToPoolButton?.parentElement

  if (!existingRow) return

  const button = document.createElement('button')

  button.type = 'button'
  button.className = 'btn btn-secondary-cpt undo-roll'
  button.textContent = localizer('UndoRoll')

  button.addEventListener('click', async event => {
    event.preventDefault()
    button.disabled = true

    try {
      await undoRoll(rollFlag.actorId, rollFlag.rolledAt)
    } catch (error) {
      button.disabled = false
      console.error('CP | Roll undo: could not undo the roll', error)
      ui.notifications.error(localizer('RollUndoFailed'))
    }
  })

  existingRow.insertBefore(button, sendToPoolButton)
}

export const registerRollUndo = () => {
  Hooks.on('updateActor', onRollRecorded)

  // The GM rolling retires every outstanding undo, so the buttons have to actually go away.
  onSettingChanged(setting => {
    if (setting.key === 'cortexprime-ext.lastGmRoll') refreshUndoableCards()
  })

  Hooks.on('renderChatMessageHTML', (message, html) => {
    injectUndoButton(message, html)
  })
}
