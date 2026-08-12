// "Mage: The Ascension Engine" — Paradox/Trauma integration. All the rules themselves live in the
// pure paradoxLogic.js; this file only does the Foundry parts: reading the configured traits,
// deciding when a roll qualifies, and handing the result across clients.
//
// The work is split across two clients out of necessity. The GM's client is the only one that
// knows how many hitches were spent on "Step up Paradox" (the Hitches dialog lives there) and is
// the only one that can safely snapshot the opposition's effect dice before the challenge advances
// — so it computes everything. But the dialog belongs to the Player, and only the Player owns their
// own actor, so the result is handed over on a flag and the Player's client renders and applies it.
import { getLength } from '../../lib/helpers.js'
import { localizer } from '../scripts/foundryHelpers.js'
import { getEffectiveDiceMap } from '../scripts/traitDiceTemporary.js'
import { getActiveChallenge, getBeatTargetIdFor, getTargetRecord } from '../scripts/rollToBeat.js'
import {
  applyShielding,
  buildParadoxLog,
  computeBaseParadox,
  computeFinalParadox,
  computeFinalTrauma,
  computeLimitState,
  getParadoxOutcome,
  largestFace
} from './paradoxLogic.js'
import { isMageRuleSetActive } from './mageAscensionLogic.js'

const CHALLENGE_TYPES = ['test', 'contest', 'group']

const getMageSettings = () => game.settings.get('cortexprime', 'mageSettings')

const getMagick = () => {
  const customRuleSet = game.settings.get('cortexprime', 'customRuleSet')

  if (!isMageRuleSetActive(customRuleSet)) return null

  return game.settings.get('cortexprime', 'mageChallengeState')?.magick ?? null
}

// ---- Simple Trait resolution ----

// A configured Simple Trait on an actor, by its stable id — the same resolve-by-id approach
// mageAscension.js uses, so reordering traits can't silently repoint at a different one. Returns
// the trait's index (needed to write to it) alongside its largest effective face, honouring any
// temporary step up/down the way "Add to Pool" does.
const getSimpleTrait = (actor, traitId) => {
  if (!actor || !traitId) return null

  const simpleTraits = actor.system.actorType?.simpleTraits ?? {}
  const index = Object.keys(simpleTraits).find(key => simpleTraits[key].id === traitId)

  if (index === undefined) return null

  const trait = simpleTraits[index]
  const effective = getLength(trait.dice?.value ?? {})
    ? getEffectiveDiceMap(trait.dice.value, trait.dice.temporaryValue)
    : {}

  return { index, face: largestFace(Object.values(effective)) }
}

const getLinkedLocationActor = () => {
  const actorId = game.scenes?.active?.getFlag('cortexprime', 'linkedActorId')

  return actorId ? game.actors.get(actorId) : null
}

// The Scene's Shielding die, or null when there's no linked Location actor of the configured type
// or it has no Shielding value.
const getShieldingFace = mageSettings => {
  const locationActor = getLinkedLocationActor()

  if (!locationActor) return null
  if (locationActor.system.actorType?.id !== mageSettings.locationActorTypeId) return null

  return getSimpleTrait(locationActor, mageSettings.shieldingTraitId)?.face ?? null
}

// ---- GM side: compute and hand over ----

// The most recent roll already considered per actor, so a re-fired updateActor can't double up.
const handledRolls = {}
// Rolls whose Paradox is computed but still waiting on the GM to resolve the Hitches dialog.
const awaitingHitches = {}

const resolveParadox = async (context, paradoxSteps) => {
  const actor = game.actors.get(context.actorId)

  if (!actor) return

  const mageSettings = getMageSettings()
  const { magick, outcome } = context

  const baseParadox = computeBaseParadox({
    magick,
    outcome,
    paradoxSteps,
    oppositionEffectDie: largestFace(context.oppositionEffectDice) ?? '4'
  })

  // No Paradox earned at all — nothing to shield, log or show.
  if (!baseParadox) return

  const { paradox: shieldedParadox, applied: shieldingApplied } =
    applyShielding(baseParadox, getShieldingFace(mageSettings), magick)

  // Shielding absorbed it outright. There's no dialog to show, but the table should still see that
  // the Scene's Shielding did its job, so the log goes straight to chat.
  if (!shieldedParadox) {
    await postParadoxLog(buildParadoxLog({ baseParadox, shieldedParadox, shieldingApplied }))
    return
  }

  const paradoxTrait = getSimpleTrait(actor, mageSettings.paradoxTraitId)

  // Without a Paradox trait to write to there's nothing this can do — better to say so once in the
  // console than to show the Player a dialog whose Confirm silently fails.
  if (!paradoxTrait) {
    console.warn('CP | Paradox: the configured Paradox Simple Trait is missing on', actor.name)
    return
  }

  const { finalParadox, needsTrauma } = computeFinalParadox(shieldedParadox, paradoxTrait.face)

  const traumaTrait = needsTrauma ? getSimpleTrait(actor, mageSettings.traumaTraitId) : null
  const { finalTrauma, descendIntoQuiet } = needsTrauma && traumaTrait
    ? computeFinalTrauma(traumaTrait.face)
    : { finalTrauma: null, descendIntoQuiet: false }

  const powersFaces = (context.poolEntries ?? [])
    .filter(entry => entry.traitSetId === mageSettings.powersTraitSetId)
    .flatMap(entry => entry.faces ?? [])

  const pending = {
    rolledAt: context.rolledAt,
    log: buildParadoxLog({
      baseParadox,
      shieldedParadox,
      shieldingApplied,
      finalParadox,
      finalTrauma,
      descendIntoQuiet,
      currentParadox: paradoxTrait.face,
      currentTrauma: traumaTrait?.face
    }),
    finalParadox,
    finalTrauma,
    descendIntoQuiet,
    limitState: computeLimitState({ magick, outcome, finalParadox, powersFaces })
  }

  // Two-step write: a plain merge would leave a previous roll's finalTrauma in place when this one
  // has none. The Player-side listener skips the transient null.
  await actor.setFlag('cortexprime', 'pendingParadox', null)
  await actor.setFlag('cortexprime', 'pendingParadox', pending)
}

const onRollRecorded = async (actor, data) => {
  if (game.user !== game.users.activeGM) return
  if (!foundry.utils.hasProperty(data, 'flags.cortexprime.lastRoll')) return

  const magick = getMagick()

  if (!magick || magick === 'none') return

  // Read synchronously, before rollToBeat.js's handler for this same hook advances or clears the
  // challenge — and before it can rewrite the opposition's effect dice via the Contest step-down.
  const challenge = getActiveChallenge()

  if (!CHALLENGE_TYPES.includes(challenge.type)) return

  const record = foundry.utils.getProperty(data, 'flags.cortexprime.lastRoll')

  if (!record?.rolledAt || handledRolls[actor.id] === record.rolledAt) return

  handledRolls[actor.id] = record.rolledAt

  const outcome = getParadoxOutcome(record.won, record.dice ?? [])

  // No opposition means no Paradox at all — a Group initiative roll, or the initiator's own roll.
  if (!outcome) return

  const beatTargetId = getBeatTargetIdFor(challenge, actor.id)

  const context = {
    actorId: actor.id,
    rolledAt: record.rolledAt,
    magick,
    outcome,
    oppositionEffectDice: beatTargetId ? (getTargetRecord(beatTargetId)?.effectDice ?? []) : [],
    poolEntries: record.poolEntries ?? []
  }

  // Any natural 1 means the Hitches dialog is about to open and the GM may spend hitches on
  // "Step up Paradox" — the count isn't known until they resolve it, so park this until then.
  if ((record.dice ?? []).some(die => die.result === 1)) {
    awaitingHitches[actor.id] = context
    return
  }

  await resolveParadox(context, 0)
}

// Drops a roll that was parked waiting on the Hitches dialog. Used when that roll is undone
// (see rollUndo.js) — the entry is otherwise only ever removed on a matching resolution, so an
// undone roll would leave it sitting there for the rest of the session.
export const forgetPendingRoll = actorId => {
  delete awaitingHitches[actorId]
}

const onHitchesResolved = async ({ actorId, rolledAt, paradoxSteps }) => {
  if (game.user !== game.users.activeGM) return

  const context = awaitingHitches[actorId]

  if (!context || context.rolledAt !== rolledAt) return

  delete awaitingHitches[actorId]

  await resolveParadox(context, paradoxSteps)
}

// ---- Player side: show and apply ----

const handledParadox = {}

const onPendingParadox = async (actor, data) => {
  if (!foundry.utils.hasProperty(data, 'flags.cortexprime.pendingParadox')) return

  const pending = foundry.utils.getProperty(data, 'flags.cortexprime.pendingParadox')

  // The transient null half of the two-step write above, or the clear after applying.
  if (!pending) return
  if (actor.id !== game.user.character?.id) return
  if (handledParadox[actor.id] === pending.rolledAt) return

  handledParadox[actor.id] = pending.rolledAt

  // Lazily imported so `extends FormApplication` is never evaluated where that global is absent,
  // and to keep the dialog's import of this module from becoming a load-time cycle.
  const { ParadoxDialog } = await import('../applications/ParadoxDialog.js')

  new ParadoxDialog({ actor, pending }).render(true)
}

export const localizeParadoxLog = log => (log ?? []).map(line => game.i18n.format(line.key, line.data ?? {}))

const postParadoxLog = async log => {
  const content = await foundry.applications.handlebars.renderTemplate(
    'systems/cortexprime/templates/chat/paradox.html',
    { lines: localizeParadoxLog(log) }
  )

  await ChatMessage.create({ content })
}

// Same unset-then-set reset used throughout actor-sheet.js and hitches.js. The two update() calls
// MUST stay separate — combined, Foundry applies the deletion after the merge and wipes the value
// that was just written.
const setSimpleTraitDie = async (actor, index, face) => {
  const path = `system.actorType.simpleTraits.${index}.dice`

  await actor.update({ [`${path}.-=value`]: null })
  await actor.update({ [`${path}.value`]: { 0: String(face) } })
}

export const applyParadoxOutcome = async ({ actor, pending, limitApplied }) => {
  if (limitApplied) {
    await ChatMessage.create({ content: `<div>${localizer('ParadoxLimitApplied')}</div>` })
  } else {
    const mageSettings = getMageSettings()
    const paradoxTrait = getSimpleTrait(actor, mageSettings.paradoxTraitId)

    if (paradoxTrait) await setSimpleTraitDie(actor, paradoxTrait.index, pending.finalParadox)

    if (pending.finalTrauma) {
      const traumaTrait = getSimpleTrait(actor, mageSettings.traumaTraitId)

      if (traumaTrait) await setSimpleTraitDie(actor, traumaTrait.index, pending.finalTrauma)
    }

    await postParadoxLog(pending.log)
  }

  await actor.setFlag('cortexprime', 'pendingParadox', null)
}

export const registerParadox = () => {
  Hooks.on('updateActor', async (actor, data) => {
    await onRollRecorded(actor, data)
    await onPendingParadox(actor, data)
  })

  Hooks.on('cortexprimeHitchesResolved', onHitchesResolved)
}
