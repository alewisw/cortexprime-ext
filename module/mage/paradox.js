// "Mage: The Ascension Engine" — Paradox/Trauma integration. All the rules themselves live in the
// pure paradoxLogic.js; this file only does the Foundry parts: resolving the System Traits off the
// actor's own Actor Type, deciding when a roll qualifies, and handing the result across clients.
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
import { getSystemSimpleTraitIndex, getTaggedTraitSetIds } from '../settings/systemTraits.js'

const CHALLENGE_TYPES = ['test', 'contest', 'group']

const getMagick = () => {
  const customRuleSet = game.settings.get('cortexprime-ext', 'customRuleSet')

  if (!isMageRuleSetActive(customRuleSet)) return null

  return game.settings.get('cortexprime-ext', 'mageChallengeState')?.magick ?? null
}

// ---- Simple Trait resolution ----

// The Simple Trait on an actor claiming the given System Trait — resolved off the actor's own
// Actor Type, so any number of Actor Types can each carry their own Paradox. Returns the trait's
// index (needed to write to it) alongside its largest effective face, honouring any temporary step
// up/down the way "Add to Pool" does.
const getSystemSimpleTrait = (actor, systemKey) => {
  if (!actor) return null

  const simpleTraits = actor.system.actorType?.simpleTraits ?? {}
  const index = getSystemSimpleTraitIndex(actor, systemKey)

  if (index === null) return null

  const trait = simpleTraits[index]
  const effective = getLength(trait.dice?.value ?? {})
    ? getEffectiveDiceMap(trait.dice.value, trait.dice.temporaryValue)
    : {}

  return { index, face: largestFace(Object.values(effective)) }
}

const getLinkedLocationActor = () => {
  const actorId = game.scenes?.active?.getFlag('cortexprime-ext', 'linkedActorId')

  return actorId ? game.actors.get(actorId) : null
}

// The Scene's Shielding die, or null when there's no linked actor or it has no Simple Trait tagged
// as the 'shielding' System Trait. Carrying the tag is what makes an actor a Location.
const getShieldingFace = () => {
  const locationActor = getLinkedLocationActor()

  if (!locationActor) return null

  return getSystemSimpleTrait(locationActor, 'shielding')?.face ?? null
}

// ---- GM side: compute and hand over ----

// The most recent roll already considered per actor, so a re-fired updateActor can't double up.
const handledRolls = {}
// Rolls whose Paradox is computed but still waiting on the GM to resolve the Hitches dialog.
const awaitingHitches = {}

const resolveParadox = async (context, paradoxSteps) => {
  const actor = game.actors.get(context.actorId)

  if (!actor) return

  const { magick, outcome } = context

  const oppositionEffectDie = largestFace(context.oppositionEffectDice) ?? '4'

  const baseParadox = computeBaseParadox({ magick, outcome, paradoxSteps, oppositionEffectDie })

  // No Paradox earned at all — nothing to shield, log or show.
  if (!baseParadox) return

  const shieldingFace = getShieldingFace()

  const { paradox: shieldedParadox, applied: shieldingApplied } =
    applyShielding(baseParadox, shieldingFace, magick)

  // Everything the log needs to show its working, whichever way the rest of this goes.
  const logInputs = { magick, outcome, paradoxSteps, oppositionEffectDie, shieldingFace }

  // Shielding absorbed it outright. There's no dialog to show, but the table should still see that
  // the Scene's Shielding did its job, so the log goes straight to chat.
  if (!shieldedParadox) {
    await postParadoxLog(buildParadoxLog({ ...logInputs, shieldedParadox, shieldingApplied }))
    return
  }

  const paradoxTrait = getSystemSimpleTrait(actor, 'paradox')

  // Without a Paradox trait to write to there's nothing this can do — better to say so once in the
  // console than to show the Player a dialog whose Confirm silently fails.
  if (!paradoxTrait) {
    console.warn('CP | Paradox: no Simple Trait is tagged as the Paradox System Trait on', actor.name)
    return
  }

  const { finalParadox, needsTrauma } = computeFinalParadox(shieldedParadox, paradoxTrait.face)

  const traumaTrait = needsTrauma ? getSystemSimpleTrait(actor, 'trauma') : null
  const { finalTrauma, descendIntoQuiet } = needsTrauma && traumaTrait
    ? computeFinalTrauma(traumaTrait.face)
    : { finalTrauma: null, descendIntoQuiet: false }

  // Resolved through the Trait Set id the roll record already carries, so records made before a
  // re-tag still read correctly.
  const powersTraitSetIds = getTaggedTraitSetIds('powers')

  const powersFaces = (context.poolEntries ?? [])
    .filter(entry => powersTraitSetIds.includes(entry.traitSetId))
    .flatMap(entry => entry.faces ?? [])

  const pending = {
    rolledAt: context.rolledAt,
    log: buildParadoxLog({
      ...logInputs,
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
  await actor.setFlag('cortexprime-ext', 'pendingParadox', null)
  await actor.setFlag('cortexprime-ext', 'pendingParadox', pending)
}

const onRollRecorded = async (actor, data) => {
  if (game.user !== game.users.activeGM) return
  if (!foundry.utils.hasProperty(data, 'flags.cortexprime-ext.lastRoll')) return

  const magick = getMagick()

  if (!magick || magick === 'none') return

  // Read synchronously, before rollToBeat.js's handler for this same hook advances or clears the
  // challenge — and before it can rewrite the opposition's effect dice via the Contest step-down.
  const challenge = getActiveChallenge()

  if (!CHALLENGE_TYPES.includes(challenge.type)) return

  // Read off the actor, NOT out of `data`. The hook's `data` is the update *diff*: Foundry strips
  // every key whose value didn't change, so a roll that lost right after another roll that lost
  // arrives with no `won` at all (and no `poolEntries` when they were empty both times). Reading
  // the diff made Paradox fire only when the outcome happened to flip between consecutive rolls.
  // The document is already updated by the time this fires, so the flag is the whole, current record.
  const record = actor.getFlag('cortexprime-ext', 'lastRoll')

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
  if (!foundry.utils.hasProperty(data, 'flags.cortexprime-ext.pendingParadox')) return

  const pending = foundry.utils.getProperty(data, 'flags.cortexprime-ext.pendingParadox')

  // The transient null half of the two-step write above, or the clear after applying.
  if (!pending) return
  if (actor.id !== game.user.character?.id) return
  if (handledParadox[actor.id] === pending.rolledAt) return

  handledParadox[actor.id] = pending.rolledAt

  // Lazily imported so no Application base class is evaluated where the Foundry globals are
  // absent — still required after the V2 migration, and for the same reason: the dialog's base
  // class destructures foundry.applications.api at module scope, which throws under unit test
  // exactly as `extends FormApplication` used to. Also keeps the dialog's import of this module
  // from becoming a load-time cycle.
  const { ParadoxDialog } = await import('../applications/ParadoxDialog.js')

  new ParadoxDialog({ actor, pending }).render(true)
}

// Both halves arrive as { key, data } pairs (see buildParadoxLog); an inputs row's value is either
// a key of its own or literal text such as a die face.
export const localizeParadoxLog = log => ({
  inputs: (log?.inputs ?? []).map(row => ({
    label: game.i18n.localize(row.label),
    value: row.value?.key ? game.i18n.localize(row.value.key) : row.value?.text ?? ''
  })),
  steps: (log?.steps ?? []).map(step => game.i18n.format(step.key, step.data ?? {}))
})

const postParadoxLog = async log => {
  const content = await foundry.applications.handlebars.renderTemplate(
    'systems/cortexprime-ext/templates/chat/paradox.html',
    { log: localizeParadoxLog(log) }
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
    const paradoxTrait = getSystemSimpleTrait(actor, 'paradox')

    if (paradoxTrait) await setSimpleTraitDie(actor, paradoxTrait.index, pending.finalParadox)

    if (pending.finalTrauma) {
      const traumaTrait = getSystemSimpleTrait(actor, 'trauma')

      if (traumaTrait) await setSimpleTraitDie(actor, traumaTrait.index, pending.finalTrauma)
    }

    await postParadoxLog(pending.log)
  }

  await actor.setFlag('cortexprime-ext', 'pendingParadox', null)
}

export const registerParadox = () => {
  Hooks.on('updateActor', async (actor, data) => {
    await onRollRecorded(actor, data)
    await onPendingParadox(actor, data)
  })

  Hooks.on('cortexprimeHitchesResolved', onHitchesResolved)
}
