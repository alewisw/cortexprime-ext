// Foundry integration for the Hitches dialog: watches for a player finishing a roll during an
// active challenge, opens the dialog on the GM's client when any die came up 1, and writes the
// GM's confirmed choices back to the player's Complications, the Doom Pool and the player's Plot
// Points. All the decision-making itself lives in the pure hitchesLogic.js.
import { getLength } from '../../lib/helpers.js'
import { localizer, showPlotPointAnimation } from './foundryHelpers.js'
import { getActiveChallenge } from './rollToBeat.js'
import { toComplicationsObject, toDiceObject } from './hitchesLogic.js'
import { canHitchesStepUpParadox, getParadoxOutcome } from '../mage/paradoxLogic.js'

// Re-exported so HitchesDialog.js keeps importing it from here alongside applyHitchOutcomes and
// getDoomPool — the shape mapping itself now lives in hitchesLogic.js with the rest of the pure
// logic.
export { getComplications } from './hitchesLogic.js'

const CHALLENGE_TYPES = ['test', 'contest', 'group']

// The Doom Pool is the Simple Trait named by the two Doom Pool world settings. Resolved the same
// way mageAscension.js resolves its own configured Simple Traits — by the trait's stable `id`,
// so reordering traits on the Actor Type can't silently repoint it at a different trait.
export const getDoomPool = () => {
  const actorId = game.settings.get('cortexprime-ext', 'doomPoolActorId')
  const traitId = game.settings.get('cortexprime-ext', 'doomPoolTraitId')

  if (!actorId || !traitId) return null

  const actor = game.actors.get(actorId)
  const simpleTraits = actor?.system.actorType?.simpleTraits ?? {}
  const index = Object.keys(simpleTraits).find(key => simpleTraits[key].id === traitId)

  if (index === undefined) return null

  const trait = simpleTraits[index]

  return {
    actor,
    index,
    label: trait.label,
    dice: Object.values(trait.dice?.value ?? {}).map(String)
  }
}

// The actor linked to the currently active Scene — the same Scene <-> Actor link already used to
// open the Distinction Actor from the floating panel (sceneDistinctionActor.js) and to resolve
// Mage's Reality Reinforcement trait (mageAscension.js#getLinkedLocationActor).
export const getSceneActor = () => {
  const actorId = game.scenes?.active?.getFlag('cortexprime-ext', 'linkedActorId')

  return actorId ? game.actors.get(actorId) : null
}

// Same unset-then-set reset used throughout actor-sheet.js. The two update() calls MUST stay
// separate: combining "path.-=key": null and "path.key": value into one call makes Foundry apply
// the deletion after the merge, silently wiping the value that was just written.
const resetDataPoint = async (actor, path, target, value) => {
  await actor.update({ [`${path}.-=${target}`]: null })
  await actor.update({ [`${path}.${target}`]: value })
}

export const applyHitchOutcomes = async ({ actor, sceneActor, projection, plotPoints, summaryHtml }) => {
  if (summaryHtml) await ChatMessage.create({ content: summaryHtml })

  if (plotPoints > 0) {
    try {
      await actor.changePpBy(plotPoints, false, localizer('HitchesPlotPointReason'))
      showPlotPointAnimation(plotPoints)
    } catch (error) {
      console.warn('CP | Hitches: could not award Plot Points', error)
    }
  }

  const doomPool = getDoomPool()

  if (doomPool?.actor) {
    await resetDataPoint(
      doomPool.actor,
      `system.actorType.simpleTraits.${doomPool.index}.dice`,
      'value',
      toDiceObject(projection.doomDice)
    )
  }

  await resetDataPoint(
    actor,
    'system.actorType',
    'complications',
    toComplicationsObject(actor, projection.complications)
  )

  if (sceneActor) {
    await resetDataPoint(
      sceneActor,
      'system.actorType',
      'complications',
      toComplicationsObject(sceneActor, projection.sceneComplications)
    )
  }
}

// Tracks the most recent roll already handled per actor, so the dialog opens exactly once per
// roll. The updateActor hook fires on every connected client and can re-fire for the same write.
const handledRolls = {}

const openHitchesDialog = async (actor, record, challenge) => {
  // Imported lazily for two reasons: HitchesDialog imports this module back (for getDoomPool /
  // getComplications / applyHitchOutcomes), so a static import here would be a load-time cycle;
  // and it keeps `extends FormApplication` from being evaluated anywhere that global is absent.
  const { HitchesDialog } = await import('../applications/HitchesDialog.js')

  const customRuleSet = game.settings.get('cortexprime-ext', 'customRuleSet')
  const magick = customRuleSet === 'mage'
    ? game.settings.get('cortexprime-ext', 'mageChallengeState')?.magick
    : null

  // Coincidental magick only turns hitches into Paradox on a botch, so outside that the option is
  // hidden rather than letting the GM spend a Plot Point on something that can't do anything.
  const canStepUpParadox = canHitchesStepUpParadox(magick, getParadoxOutcome(record.won, record.dice ?? []))

  new HitchesDialog({
    actor,
    sceneActor: getSceneActor(),
    challengeType: challenge.type,
    dice: record.dice,
    isMage: customRuleSet === 'mage',
    magick,
    canStepUpParadox,
    rolledAt: record.rolledAt
  }).render(true)
}

export const registerHitches = () => {
  Hooks.on('updateActor', async (actor, data) => {
    if (!foundry.utils.hasProperty(data, 'flags.cortexprime-ext.lastRoll')) return
    if (game.user !== game.users.activeGM) return

    // Read the challenge synchronously, before rollToBeat.js's own handler for this same hook gets
    // a chance to advance or clear it — a Test's last responder rolling wipes activeChallenge, and
    // that roll's hitches still need resolving.
    const challenge = getActiveChallenge()

    if (!CHALLENGE_TYPES.includes(challenge.type)) return

    const record = foundry.utils.getProperty(data, 'flags.cortexprime-ext.lastRoll')

    if (!record?.rolledAt || handledRolls[actor.id] === record.rolledAt) return

    handledRolls[actor.id] = record.rolledAt

    if (!getLength(record.dice ?? [])) return
    if (!record.dice.some(die => die.result === 1)) return

    await openHitchesDialog(actor, record, challenge)
  })
}
